import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig, SSHConfig, OS_PRESETS } from "../types";

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
  type: string;
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

export function useSSH(
  config: LabConfig | null,
  sshConfig?: SSHConfig | "wasm",
): UseSSHReturn {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [services, setServices] = useState<Record<string, ServiceInfo>>({});
  const [nanoFile, setNanoFile] = useState<NanoFile | null>(null);
  const activeConnectionKey = useRef<string | null>(null);
  const isSSH = sshConfig === "wasm" ? false : !!sshConfig;
  const isWasm = sshConfig === "wasm";

  const appendLines = useCallback(
    (newLines: OutputLine[]) => setLines((prev) => [...prev, ...newLines]),
    [],
  );

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    const connectionKey = isWasm
      ? config
        ? `wasm:${JSON.stringify(config)}`
        : null
      : isSSH
        ? `ssh:${JSON.stringify(sshConfig)}`
        : config
          ? `lab:${JSON.stringify(config)}`
          : null;

    if (!connectionKey || activeConnectionKey.current === connectionKey) {
      return;
    }
    activeConnectionKey.current = connectionKey;
    ws.current?.close();
    setConnected(false);

    if (isWasm) {
      const sock = new WebSocket(WS_URL);
      ws.current = sock;
      sock.onopen = () => {
        sock.send(JSON.stringify({ mode: "wasm" }));
      };
      sock.onmessage = (e) => {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === "ssh_ready") {
          setConnected(true);
        } else if (msg.type === "ssh_output") {
          const text = msg.payload as string;
          const rawLines = text.split(/\r?\n/);
          for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            if (i < rawLines.length - 1) {
              appendLines([{ text: line || " ", class: "" }]);
            } else if (line) {
              appendLines([{ text: line, class: "" }]);
            }
          }
        }
      };
      sock.onclose = () => setConnected(false);
      return () => {
        sock.close();
      };
    }

    if (isSSH) {
      const sock = new WebSocket(WS_URL);
      ws.current = sock;

      sock.onopen = () => {
        sock.send(
          JSON.stringify({
            mode: "ssh",
            ssh: sshConfig as SSHConfig,
          }),
        );
      };

      sock.onmessage = (e) => {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === "ssh_ready") {
          setConnected(true);
        } else if (msg.type === "ssh_output") {
          const text = msg.payload as string;
          const rawLines = text.split(/\r?\n/);
          for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            if (i < rawLines.length - 1) {
              appendLines([{ text: line || " ", class: "" }]);
            } else if (line) {
              appendLines([{ text: line, class: "" }]);
            }
          }
        } else if (msg.type === "init") {
          setServices(msg.payload as Record<string, ServiceInfo>);
        } else if (msg.type === "services") {
          setServices(msg.payload as Record<string, ServiceInfo>);
        } else if (msg.type === "output") {
          const resp = msg.payload as CommandResponse;
          if (resp.lines) appendLines(resp.lines);
          if (resp.services) setServices(resp.services);
        }
      };

      sock.onclose = () => setConnected(false);

      return () => {
        sock.close();
      };
    }

    // Lab mode — existing logic
    const doInit = async () => {
      if (!config) return;

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
        // continue
      }

      const osInfo = OS_PRESETS[config.os] ?? OS_PRESETS.ubuntu;
      appendLines([
        { text: `${osInfo.pretty} — ${config.hostname}`, class: "head" },
        { text: `Kernel ${osInfo.kernel} x86_64`, class: "muted" },
        { text: "", class: "" },
        {
          text: "Last login: Sun Jun 29 08:14:22 2026 from 10.0.0.5",
          class: "muted",
        },
        { text: "", class: "" },
      ]);

      const sock = new WebSocket(WS_URL);
      ws.current = sock;

      sock.onopen = () => {
        sock.send(JSON.stringify({ mode: "lab" }));
        setConnected(true);
      };
      sock.onclose = () => setConnected(false);

      sock.onmessage = (e) => {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === "init") {
          setServices(msg.payload as Record<string, ServiceInfo>);
        } else if (msg.type === "services") {
          setServices(msg.payload as Record<string, ServiceInfo>);
        } else if (msg.type === "output") {
          const resp = msg.payload as CommandResponse;
          if (resp.lines) appendLines(resp.lines);
          if (resp.services) setServices(resp.services);
        }
      };
    };

    doInit();

    return () => {
      ws.current?.close();
    };
  }, [config, sshConfig, isSSH, isWasm, appendLines]);

  const sendCommand = useCallback(
    (cmd: string) => {
      if (isSSH) {
        // SSH mode: send keystroke followed by newline
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(
            JSON.stringify({ type: "ssh_keystroke", payload: cmd + "\n" }),
          );
        }
        return;
      }
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ command: cmd }));
      }
    },
    [isSSH],
  );

  return {
    lines,
    services,
    connected,
    sendCommand,
    clearLines,
    nanoFile,
    setNanoFile,
  };
}
