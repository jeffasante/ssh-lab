import { useEffect, useRef, useState, useCallback } from "react";
import { LabConfig, OS_PRESETS } from "../types";
import type { ServiceInfo, OutputLine } from "./useSSH";

type CommandResponse = {
  lines: OutputLine[];
  services: Record<string, ServiceInfo>;
};

type UseSSHReturn = {
  lines: OutputLine[];
  services: Record<string, ServiceInfo>;
  connected: boolean;
  sendCommand: (cmd: string) => void;
  clearLines: () => void;
};

declare global {
  interface Window {
    Go: any;
    initLab?: (json: string) => string;
    processCommand?: (cmd: string) => string;
    getServices?: () => string;
  }
}

async function loadWasm(): Promise<void> {
  if (window.processCommand) return; // already loaded

  const go = new window.Go();
  // Use ArrayBuffer to bypass MIME type checks entirely
  const resp = await fetch("./ssh-lab.wasm?_=" + Date.now());
  const buf = await resp.arrayBuffer();
  const result = await WebAssembly.instantiate(buf, go.importObject);
  go.run(result.instance);
}

export function useWasmSSH(config: LabConfig | null): UseSSHReturn {
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [services, setServices] = useState<Record<string, ServiceInfo>>({});
  const initDone = useRef(false);

  const appendLines = useCallback((newLines: OutputLine[]) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const clearLines = useCallback(() => setLines([]), []);

  useEffect(() => {
    if (!config || initDone.current) return;
    initDone.current = true;

    const init = async () => {
      try {
        await loadWasm();

        // Initialize with config
        const initResult = window.initLab!(
          JSON.stringify({
            hostname: config.hostname,
            os: config.os,
            scenario: config.scenario,
          }),
        );
        const initResp = JSON.parse(initResult);
        if (!initResp.ok) {
          console.warn("WASM init failed");
        }

        setConnected(true);

        // Load initial services
        const svcJson = window.getServices!();
        setServices(JSON.parse(svcJson));

        // Boot banner
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
      } catch (err) {
        console.error("WASM init error:", err);
      }
    };

    init();
  }, [config, appendLines]);

  const sendCommand = useCallback(
    (cmd: string) => {
      if (!window.processCommand) return;

      const json = window.processCommand(cmd);
      const resp: CommandResponse = JSON.parse(json);

      if (resp.lines) appendLines(resp.lines);
      if (resp.services) setServices(resp.services);
    },
    [appendLines],
  );

  return { lines, services, connected, sendCommand, clearLines };
}
