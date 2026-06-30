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

export function useContainer2Wasm(
  config: LabConfig | null,
  imageUrl?: string,
): UseSSHReturn {
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const bridgeRef = useRef<ReturnType<typeof makeTerminalBridge> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const initDone = useRef(false);
  const bufRef = useRef("");

  const appendLine = useCallback((text: string) => {
    bufRef.current += text;
    const parts = bufRef.current.split("\n");
    bufRef.current = parts.pop() || "";
    const newLines = parts.map((l) => ({ text: l || " ", class: "" }));
    if (newLines.length > 0) setLines((prev) => [...prev, ...newLines]);
  }, []);

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    if (!config || !imageUrl || initDone.current) return;
    initDone.current = true;

    const doInit = async () => {
      appendLine("Booting container...");

      const { master, slave } = openpty();

      // Configure termios like the example
      const t = slave.ioctl("TCGETS");
      t.iflag &= ~(ISTRIP | INLCR | IGNCR | ICRNL | IXON);
      t.oflag &= ~OPOST;
      t.lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
      slave.ioctl(
        "TCSETS",
        new Termios(t.iflag, t.oflag, t.cflag, t.lflag, t.cc),
      );

      // Create terminal bridge and activate the master addon
      const bridge = makeTerminalBridge((text) => appendLine(text));
      bridgeRef.current = bridge;
      master.activate(bridge);

      // Forward PTY master output as well (for raw data)
      master.onWrite(([data]: [Uint8Array]) => {
        const decoder = new TextDecoder();
        bridge.write(data);
      });

      // Create worker and TtyServer
      const worker = new Worker("/c2w-src/worker-custom.js?v=" + Date.now());
      workerRef.current = worker;
      const ttyServer = new TtyServer(slave);
      ttyServer.start(worker);

      // Send init with image URL
      worker.postMessage({ type: "init", imagename: imageUrl });

      setConnected(true);
    };

    doInit();
    return () => {
      workerRef.current?.terminate();
    };
  }, [config, imageUrl, appendLine]);

  const sendCommand = useCallback((cmd: string) => {
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
