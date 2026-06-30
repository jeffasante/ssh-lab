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

export const C2W_IMAGES: Record<string, { url: string; label: string }> = {
  debian: { url: "/c2w/debian.wasm", label: "Debian (129MB)" },
};

interface C2WInstance {
  stdin: (data: string) => void;
  destroy: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1000000000) return (bytes / 1000000000).toFixed(1) + " GB";
  if (bytes >= 1000000) return (bytes / 1000000).toFixed(1) + " MB";
  if (bytes >= 1000) return (bytes / 1000).toFixed(0) + " KB";
  return bytes + " B";
}

async function loadC2WImage(
  imageUrl: string,
  onOutput: (chunk: string) => void,
): Promise<C2WInstance> {
  onOutput("Loading " + imageUrl + "...\n");
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error("Failed to fetch: " + resp.status);
  const total = parseInt(resp.headers.get("content-length") || "0", 10);
  const reader = resp.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastPct = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pct = total > 0 ? Math.round((received / total) * 100) : 0;
    if (pct >= lastPct + 5 || pct === 100) {
      lastPct = pct;
      const bar =
        "[" +
        "#".repeat(Math.floor(pct / 5)) +
        "-".repeat(20 - Math.floor(pct / 5)) +
        "]";
      onOutput(bar + " " + pct + "%  " + formatBytes(received) + "\n");
    }
  }
  onOutput("[" + "#".repeat(20) + "] 100% " + formatBytes(total) + "\n");

  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
  const wasmBuf = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    wasmBuf.set(chunk, offset);
    offset += chunk.length;
  }

  onOutput("Starting kernel...\n");

  // Create PTY
  const { master, slave } = openpty();

  // Configure termios
  const termios = slave.ioctl("TCGETS");
  termios.iflag &= ~(ISTRIP | INLCR | IGNCR | ICRNL | IXON);
  termios.oflag &= ~OPOST;
  termios.lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
  slave.ioctl("TCSETS", termios);

  // Forward PTY master output to our terminal
  master.onWrite(([data]) => {
    const decoder = new TextDecoder();
    onOutput(decoder.decode(data));
  });

  // Create worker
  const worker = new Worker("/c2w-src/worker-custom.js?v=" + Date.now());

  // Create TtyServer
  const ttyServer: any = new TtyServer(slave);
  ttyServer.start(worker);

  // Transfer WASM buffer
  const transferBuf = new Uint8Array(wasmBuf).buffer;
  worker.postMessage({ type: "wasm", buffer: transferBuf }, [transferBuf]);

  return {
    stdin: (data: string) => {
      // Send stdin directly to worker via postMessage
      const encoder = new TextEncoder();
      worker.postMessage({
        type: "stdin",
        bytes: Array.from(encoder.encode(data)),
      });
    },
    destroy: () => {
      worker.terminate();
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
    bufRef.current += text;
    const parts = bufRef.current.split("\n");
    bufRef.current = parts.pop() || "";
    const newLines: OutputLine[] = parts.map((l) => ({
      text: l || " ",
      class: "",
    }));
    if (newLines.length > 0) {
      setLines((prev) => [...prev, ...newLines]);
    }
  }, []);

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    if (!config || !imageKey || initDone.current) return;
    initDone.current = true;

    const doLoad = async () => {
      const image = C2W_IMAGES[imageKey];
      if (!image) {
        setLines((prev) => [
          ...prev,
          { text: `Unknown image: ${imageKey}`, class: "err" },
          { text: "", class: "" },
        ]);
        return;
      }

      setLines((prev) => [
        ...prev,
        { text: `Booting ${image.label}...`, class: "head" },
        { text: "", class: "" },
      ]);

      try {
        const inst = await loadC2WImage(image.url, (chunk) =>
          appendLines(chunk),
        );
        instanceRef.current = inst;
        setConnected(true);
      } catch (err) {
        setLines((prev) => [
          ...prev,
          { text: `Failed: ${err}`, class: "err" },
          { text: "", class: "" },
        ]);
      }
    };

    doLoad();
    return () => instanceRef.current?.destroy();
  }, [config, imageKey, appendLines]);

  const sendCommand = useCallback((cmd: string) => {
    instanceRef.current?.stdin(cmd + "\n");
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
