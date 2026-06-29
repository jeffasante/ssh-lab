import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig, OS_PRESETS } from "../types";

export type ServiceInfo = {
  name: string;
  display: string;
  port: number;
  running: boolean;
  pid: number;
  cpu: number;
  mem_mb: number;
};

export type OutputLine = {
  text: string;
  class: string;
};

type WSMessage = {
  type: "init" | "output" | "services";
  payload: unknown;
};

type CommandResponse = {
  lines: OutputLine[];
  services: Record<string, ServiceInfo>;
};

export type NanoFile = {
  filename: string;
  content: string;
};

type UseSSHReturn = {
  lines: OutputLine[];
  services: Record<string, ServiceInfo>;
  connected: boolean;
  sendCommand: (cmd: string) => void;
  clearLines: () => void;
  nanoFile: NanoFile | null;
  setNanoFile: (file: NanoFile | null) => void;
};

const WS_URL = `ws://${window.location.host}/ws`;
const API_INIT = `${window.location.protocol}//${window.location.host}/api/init`;

export function useSSH(config: LabConfig | null): UseSSHReturn {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [services, setServices] = useState<Record<string, ServiceInfo>>({});
  const [nanoFile, setNanoFile] = useState<NanoFile | null>(null);
  const inited = useRef(false);

  const appendLines = useCallback((newLines: OutputLine[]) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    if (!config || inited.current) return;
    inited.current = true;

    const doInit = async () => {
      // POST /api/init to apply scenario + OS
      try {
        await fetch(API_INIT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hostname: config.hostname,
            os: config.os,
            scenario: config.scenario,
          }),
        });
      } catch {
        // continue anyway — server might not need init
      }

      // Build boot banner
      const osInfo = OS_PRESETS[config.os] ?? OS_PRESETS.ubuntu;
      const boot: OutputLine[] = [
        { text: `${osInfo.pretty} — ${config.hostname}`, class: "head" },
        { text: `Kernel ${osInfo.kernel} x86_64`, class: "muted" },
        { text: "", class: "" },
        {
          text: `Last login: Sun Jun 29 08:14:22 2026 from 10.0.0.5`,
          class: "muted",
        },
        { text: "", class: "" },
      ];
      appendLines(boot);

      // Open WebSocket
      const sock = new WebSocket(WS_URL);
      ws.current = sock;

      sock.onopen = () => setConnected(true);
      sock.onclose = () => setConnected(false);

      sock.onmessage = (e) => {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === "init") {
          setServices(msg.payload as Record<string, ServiceInfo>);
        } else if (msg.type === "services") {
          setServices(msg.payload as Record<string, ServiceInfo>);
        } else if (msg.type === "output") {
          const resp = msg.payload as CommandResponse;
          if (resp.nano) {
            setNanoFile(resp.nano);
          }
          if (resp.lines) appendLines(resp.lines);
          if (resp.services) setServices(resp.services);
        }
      };
    };

    doInit();

    return () => {
      inited.current = false;
      ws.current?.close();
    };
  }, [config, appendLines]);

  const sendCommand = useCallback((cmd: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      if (!cmd.startsWith("__")) {
        const promptText = `${config?.username || "jeff"}@${config?.hostname || "server-a1b2"}:~$ ${cmd}`;
        appendLines([{ text: promptText, class: "prompt" }]);
      }
      ws.current.send(JSON.stringify({ command: cmd }));
    }
  }, [config, appendLines]);

  return { lines, services, connected, sendCommand, clearLines, nanoFile, setNanoFile };
}
