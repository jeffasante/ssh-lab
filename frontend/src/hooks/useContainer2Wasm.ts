import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig } from "../types";
import type { OutputLine, NanoFile } from "./useSSH";
import { openpty, TtyServer } from "xterm-pty";

type UseSSHReturn = {
  lines: OutputLine[];
  services: Record<string, never>;
  connected: boolean;
  sendCommand: (cmd: string) => void;
  clearLines: () => void;
  nanoFile: NanoFile | null;
  setNanoFile: (file: NanoFile | null) => void;
};

function makeTerminalBridge(onOutput: (text: string) => void) {
  const dataListeners: Array<(data: string) => void> = [];
  const binaryListeners: Array<(data: string) => void> = [];
  return {
    onData: (cb: (data: string) => void) => {
      dataListeners.push(cb);
      return {
        dispose: () => {
          const i = dataListeners.indexOf(cb);
          if (i >= 0) dataListeners.splice(i, 1);
        },
      };
    },
    onBinary: (cb: (data: string) => void) => {
      binaryListeners.push(cb);
      return {
        dispose: () => {
          const i = binaryListeners.indexOf(cb);
          if (i >= 0) binaryListeners.splice(i, 1);
        },
      };
    },
    onResize: () => ({ dispose: () => {} }),
    write: (data: Uint8Array | string, cb?: () => void) => {
      const decoder = new TextDecoder();
      const text = typeof data === "string" ? data : decoder.decode(data);
      // Split by newlines for our terminal display
      text
        .split("\n")
        .forEach((l, i, a) => onOutput(i < a.length - 1 ? l + "\n" : l));
      cb?.();
    },
    send: (text: string) => {
      for (const cb of dataListeners) cb(text);
    },
  };
}

export function useContainer2Wasm(
  config: LabConfig | null,
  imageUrl?: string,
): UseSSHReturn {
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const masterRef = useRef<any>(null);
  const bridgeRef = useRef<ReturnType<typeof makeTerminalBridge> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const initDone = useRef(false);
  const currentLineRef = useRef("");
  const committedLinesRef = useRef<OutputLine[]>([]);

  const appendLine = useCallback((text: string) => {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      const afterNext = text[i + 2];

      if (ch === "\x1b") {
        const ansiMatch = text.slice(i).match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
        if (ansiMatch) {
          if (ansiMatch[0].endsWith("K")) currentLineRef.current = "";
          if (ansiMatch[0].endsWith("J")) {
            committedLinesRef.current = [];
            currentLineRef.current = "";
          }
          i += ansiMatch[0].length - 1;
        }
        continue;
      }

      if (ch === "\r") {
        if (next === "\r" && afterNext === "\n") continue;
        if (next !== "\n") currentLineRef.current = "";
        continue;
      }

      if (ch === "\n") {
        const line = currentLineRef.current || " ";
        const previous = committedLinesRef.current.at(-1)?.text ?? "";
        const isDuplicateEcho =
          line !== " " &&
          (previous.endsWith(`# ${line}`) || previous.endsWith(`$ ${line}`));
        if (!isDuplicateEcho) {
          committedLinesRef.current = [
            ...committedLinesRef.current,
            { text: line, class: "" },
          ];
        }
        currentLineRef.current = "";
        continue;
      }

      if (ch === "\b" || ch === "\x7f") {
        currentLineRef.current = currentLineRef.current.slice(0, -1);
        continue;
      }

      if (ch >= " ") {
        currentLineRef.current += ch;
      }
    }

    const partial = currentLineRef.current;
    setLines(
      partial
        ? [...committedLinesRef.current, { text: partial, class: "" }]
        : committedLinesRef.current,
    );
  }, []);

  const clearLines = useCallback(() => {
    currentLineRef.current = "";
    committedLinesRef.current = [];
    setLines([]);
  }, []);

  useEffect(() => {
    if (!config || !imageUrl || initDone.current) return;
    initDone.current = true;
    currentLineRef.current = "";
    committedLinesRef.current = [];
    setLines([]);
    let cancelled = false;

    const doInit = async () => {
      appendLine("Booting container...\n");

      // SharedArrayBuffer is required by xterm-pty's TtyServer for
      // communication between the main thread and the worker. It needs
      // cross-origin isolation headers (COOP/COEP) which GitHub Pages
      // cannot set. Check availability and fail gracefully.
      if (typeof SharedArrayBuffer === "undefined") {
        throw new Error(
          "SharedArrayBuffer is not available. The container mode requires " +
            "cross-origin isolation (COOP/COEP headers). Use the Lab or WASM " +
            "mode instead, or run the app locally with the development server.",
        );
      }

      const { master, slave } = openpty();
      masterRef.current = master;

      // Create terminal bridge and activate the master addon.
      // activate() already wires up bidirectional I/O:
      //   user input  → bridge.onData → bridge.send → PTY slave
      //   PTY output  → master → bridge.write → display
      // Do NOT add a separate master.onWrite handler — that would
      // cause every output chunk to be written to the display twice.
      const bridge = makeTerminalBridge((text) => appendLine(text));
      bridgeRef.current = bridge;
      master.activate(bridge);

      // Create worker and TtyServer
      const worker = new Worker("./c2w-src/worker-entry.js?v=" + Date.now());
      if (cancelled) {
        worker.terminate();
        return;
      }
      workerRef.current = worker;
      appendLine("Worker created\n");
      const handleWorkerMessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || typeof msg !== "object" || msg.ttyRequestType) return;
        if (msg.type === "status") appendLine(`${msg.message}\n`);
        if (msg.type === "error") {
          appendLine(`Worker failed: ${msg.message}\n`);
          setConnected(false);
        }
      };
      worker.onerror = (event) => {
        appendLine(`Worker failed: ${event.message}\n`);
        setConnected(false);
      };

      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (cancelled) {
        worker.terminate();
        return;
      }

      // Send init with image URL before xterm-pty posts the shared PTY buffer.
      worker.postMessage({ type: "init", imagename: imageUrl });
      appendLine("Image selected\n");

      const ttyServer = new TtyServer(slave);
      // start() sets worker.onmessage to its internal handler. We save that
      // as ptyMessageHandler, then replace it with our own dispatch.
      // handleWorkerMessage is only called from our override — do NOT pass
      // it to ttyServer.start or it would fire twice (once from TtyServer's
      // internal dispatch and once from our override).
      ttyServer.start(worker, () => {});
      const ptyMessageHandler = worker.onmessage;
      worker.onmessage = (event) => {
        handleWorkerMessage(event);
        ptyMessageHandler?.call(worker, event);
      };
      appendLine("PTY attached\n");

      setConnected(true);
    };

    doInit().catch((error) => {
      appendLine(
        `Container failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      setConnected(false);
      initDone.current = false;
    });
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      masterRef.current?.dispose();
      masterRef.current = null;
      bridgeRef.current = null;
      initDone.current = false;
    };
  }, [config, imageUrl, appendLine]);

  const sendCommand = useCallback((cmd: string) => {
    if (cmd === "__CLEAR__") {
      clearLines();
      appendLine("root@localhost:/# ");
      return;
    }

    if (cmd.startsWith("__HOST_CURL__")) {
      const rawCommand = cmd.slice("__HOST_CURL__".length).trim();
      const url = rawCommand
        .split(/\s+/)
        .find((part) => /^https?:\/\//.test(part));
      appendLine("\r\n");
      if (!url) {
        appendLine("curl: no URL specified\nroot@localhost:/# ");
        return;
      }

      fetch(`/api/internet?url=${encodeURIComponent(url)}`)
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || response.statusText);
          }
          appendLine(
            `${payload.body.replace(/\r?\n?$/, "")}\nroot@localhost:/# `,
          );
        })
        .catch((error) => {
          appendLine(
            `curl: (7) ${error instanceof Error ? error.message : String(error)}\nroot@localhost:/# `,
          );
        });
      return;
    }

    bridgeRef.current?.send(cmd);
  }, [appendLine, clearLines]);

  return {
    lines,
    services: {},
    connected,
    sendCommand,
    clearLines,
    nanoFile: null,
    setNanoFile: () => {},
  };
}
