import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig, OS_PRESETS } from "../types";
import type { OutputLine, NanoFile } from "./useSSH";
import { WASI } from "@bjorn3/browser_wasi_shim";
import { openpty } from "xterm-pty";

type UseSSHReturn = {
  lines: OutputLine[];
  services: Record<string, never>;
  connected: boolean;
  sendCommand: (cmd: string) => void;
  clearLines: () => void;
  nanoFile: NanoFile | null;
  setNanoFile: (file: NanoFile | null) => void;
};

export const C2W_IMAGES: Record<string, { url: string; label: string }> = {
  debian: {
    url: "https://ktock.github.io/container2wasm-demo/containers/riscv64-debian-wasi-container02.wasm",
    label: "Debian (remote)",
  },
};

interface C2WInstance {
  stdin: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  destroy: () => void;
}

async function loadC2WImage(
  url: string,
  onOutput: (chunk: string) => void,
): Promise<C2WInstance> {
  // First try loading from the provided URL (either local or remote)
  const resp = await fetch(url).catch(() => null);
  if (!resp || !resp.ok) {
    onOutput(`Failed to fetch ${url}\n`);
    onOutput(`\nTo build your own images, install c2w:\n`);
    onOutput(`  https://github.com/container2wasm/container2wasm\n`);
    onOutput(
      `\nThen run: c2w debian:latest frontend/public/c2w/debian.wasm\n\n`,
    );
    throw new Error("Image not found");
  }

  // Set up xterm-pty (master/slave pair)
  const { master, slave } = openpty();

  // Forward PTY master output to our terminal
  master.onWrite(([data]) => {
    const decoder = new TextDecoder();
    onOutput(decoder.decode(data));
  });

  // Set up WASI with the PTY slave as stdio
  const wasi = new WASI(
    [], // args
    [], // env
    [
      // fds: map WASI stdio to PTY slave
      slave.open(),
      slave.open(),
      slave.open(),
    ],
  );

  // Fetch and instantiate the .wasm
  const buf = await resp.arrayBuffer();
  const wasm = await WebAssembly.instantiate(buf, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  // Start the WASM module (boots the container)
  wasi.start(wasm.instance);

  // Return handles for external I/O
  return {
    stdin: (data: string) => {
      const encoder = new TextEncoder();
      slave.write(encoder.encode(data));
    },
    resize: (cols: number, rows: number) => {
      slave.ioctl("TIOCSWINSZ", [rows, cols]);
    },
    destroy: () => {
      master.dispose();
    },
  };
}

export function useContainer2Wasm(
  config: LabConfig | null,
  imageKey?: string,
): UseSSHReturn {
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const instanceRef = useRef<C2WInstance | null>(null);
  const initDone = useRef(false);
  const bufRef = useRef("");

  const appendLines = useCallback((text: string) => {
    // Buffer partial lines, flush on newlines
    bufRef.current += text;
    const parts = bufRef.current.split("\n");
    bufRef.current = parts.pop() || "";
    const newLines: OutputLine[] = parts
      .map((l, i) => {
        const isLast = i === parts.length - 1 && bufRef.current === "";
        return { text: l || (isLast ? "" : " "), class: "" };
      })
      .filter((l) => l !== null) as OutputLine[];
    if (newLines.length > 0) {
      setLines((prev) => [...prev, ...newLines]);
    }
  }, []);

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    if (!config || !imageKey || initDone.current) return;
    initDone.current = true;

    const doLoad = async () => {
      const osInfo = OS_PRESETS[config.os] ?? OS_PRESETS.ubuntu;
      setLines((prev) => [
        ...prev,
        { text: `${osInfo.pretty} — ${config.hostname}`, class: "head" },
        { text: `Booting container2wasm...`, class: "muted" },
        { text: "", class: "" },
      ]);

      try {
        const inst = await loadC2WImage(C2W_IMAGES[imageKey!].url, (chunk) =>
          appendLines(chunk),
        );
        instanceRef.current = inst;
        setConnected(true);
      } catch (err) {
        setLines((prev) => [
          ...prev,
          { text: `Failed to load container2wasm image: ${err}`, class: "err" },
          {
            text: "Make sure the .wasm files are in frontend/public/c2w/",
            class: "muted",
          },
          {
            text: "Run: ./container2wasm/download-demo.sh frontend/public/c2w/",
            class: "muted",
          },
          { text: "", class: "" },
        ]);
      }
    };

    doLoad();

    return () => {
      instanceRef.current?.destroy();
    };
  }, [config, imageKey, appendLines]);

  const sendCommand = useCallback((cmd: string) => {
    if (instanceRef.current) {
      instanceRef.current.stdin(cmd + "\n");
    }
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
