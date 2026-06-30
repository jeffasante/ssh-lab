import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig, OS_PRESETS } from "../types";
import type { OutputLine, NanoFile } from "./useSSH";
import { WASI, Fd } from "@bjorn3/browser_wasi_shim";

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
    url: "/c2w/debian.wasm",
    label: "Debian (129MB)",
  },
};

interface C2WInstance {
  stdin: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  destroy: () => void;
}

// Custom Fd that captures stdout/stderr to a callback
class OutputFd extends Fd {
  private cb: (chunk: string) => void;

  constructor(cb: (chunk: string) => void) {
    super();
    this.cb = cb;
  }

  fdWrite(buf: Uint8Array): number {
    const decoder = new TextDecoder();
    this.cb(decoder.decode(buf));
    return buf.byteLength;
  }
}

// Custom Fd for stdin — buffers data written to it
class InputFd extends Fd {
  private buf: Uint8Array[] = [];
  private readers: ((buf: Uint8Array) => void)[] = [];

  write(data: Uint8Array) {
    if (this.readers.length > 0) {
      const r = this.readers.shift()!;
      r(data);
    } else {
      this.buf.push(data);
    }
  }

  fdRead(size: number): Uint8Array {
    // Return available data or empty if nothing buffered
    if (this.buf.length === 0) return new Uint8Array(0);
    const data = this.buf.shift()!;
    return data.slice(0, size);
  }
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

  // Create custom Fds for stdio
  const inputFd = new InputFd();

  const wasi = new WASI(
    [], // args
    [], // env
    [
      inputFd, // stdin
      new OutputFd(onOutput), // stdout
      new OutputFd(onOutput), // stderr
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
      inputFd.write(encoder.encode(data));
    },
    resize: (_cols: number, _rows: number) => {
      // PTY resize not supported with simple Fds
    },
    destroy: () => {
      // Nothing to clean up
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
