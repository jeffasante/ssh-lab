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

const DEMO_ORIGIN = "https://ktock.github.io";

export const C2W_IMAGES: Record<
  string,
  { prefix: string; chunks: number; label: string }
> = {
  debian: {
    prefix:
      DEMO_ORIGIN +
      "/container2wasm-demo/containers/riscv64-debian-wasi-container",
    chunks: 3,
    label: "Debian (129MB)",
  },
};

interface C2WInstance {
  stdin: (data: string) => void;
  destroy: () => void;
}

async function loadC2WImage(
  imagePrefix: string,
  chunkCount: number,
  onOutput: (chunk: string) => void,
): Promise<C2WInstance> {
  // Create PTY
  const { master, slave } = openpty();

  // Configure termios like the demo
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
  const worker = new Worker("/c2w-src/worker-custom.js");

  // Create TtyServer to connect PTY slave to worker
  const ttyServer = new TtyServer(slave);
  ttyServer.start(worker);

  // Send init message with image info
  worker.postMessage({
    type: "init",
    imagename: imagePrefix,
    chunks: chunkCount,
  });

  return {
    stdin: (data: string) => {
      master.onData(data);
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
        const inst = await loadC2WImage(image.prefix, image.chunks, (chunk) =>
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
