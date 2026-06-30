import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig, OS_PRESETS } from "../types";
import type { OutputLine, NanoFile } from "./useSSH";
import {
  openpty,
  TtyServer,
  Termios,
  ISTRIP,
  INLCR,
  IGNCR,
  ICRNL,
  IXON,
  OPOST,
  ECHO,
  ECHONL,
  ICANON,
  ISIG,
  IEXTEN,
} from "xterm-pty";

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
  const listeners: Array<(data: string) => void> = [];
  return {
    onData: (cb: (data: string) => void) => {
      listeners.push(cb);
      return {
        dispose: () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
    },
    onBinary: (cb: (data: string) => void) => {
      listeners.push(cb);
      return {
        dispose: () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
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
      for (const cb of listeners) cb(text);
    },
  };
}

let _c2wCounter = 0;

export function useContainer2Wasm(
  config: LabConfig | null,
  imageUrl?: string,
): UseSSHReturn {
  const instanceId = useRef(`c2w-${++_c2wCounter}`);
  console.log(
    `[DEBUG ${instanceId.current}] RENDER config=${JSON.stringify(config?.hostname ?? null)} imageUrl=${imageUrl}`,
  );
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const masterRef = useRef<any>(null);
  const bridgeRef = useRef<ReturnType<typeof makeTerminalBridge> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const initDone = useRef(false);
  const bufRef = useRef("");

  const appendLine = useCallback((text: string) => {
    if (text.length > 0) {
      console.log(
        `[DEBUG ${instanceId.current}] appendLine(${JSON.stringify(text.slice(0, 60))})`,
      );
    }
    bufRef.current += text;
    const parts = bufRef.current.split("\n");
    bufRef.current = parts.pop() || "";
    const newLines = parts.map((l) => ({ text: l || " ", class: "" }));
    if (newLines.length > 0) setLines((prev) => [...prev, ...newLines]);
  }, []);

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    console.log(
      `[DEBUG ${instanceId.current}] EFFECT RUN config=${!!config} imageUrl=${imageUrl} initDone=${initDone.current}`,
    );
    if (!config || !imageUrl || initDone.current) return;
    initDone.current = true;
    console.log(`[DEBUG ${instanceId.current}] EFFECT PROCEEDING`);
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

      // Configure termios like the example
      const t = slave.ioctl("TCGETS");
      t.iflag &= ~(ISTRIP | INLCR | IGNCR | ICRNL | IXON);
      t.oflag &= ~OPOST;
      t.lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
      slave.ioctl(
        "TCSETS",
        new Termios(t.iflag, t.oflag, t.cflag, t.lflag, t.cc),
      );

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
      const worker = new Worker("/c2w-src/worker-entry.js?v=" + Date.now());
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
    console.log(
      `[DEBUG ${instanceId.current}] sendCommand(${JSON.stringify(cmd)})`,
    );
    bridgeRef.current?.send(cmd + "\n");
  }, []);

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
