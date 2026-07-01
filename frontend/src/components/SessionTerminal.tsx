import React from "react";
import { LabConfig, SSHConfig, AppMode } from "../types";
import { useSSH } from "../hooks/useSSH";
import { useWasmSSH } from "../hooks/useWasmSSH";
import { useContainer2Wasm } from "../hooks/useContainer2Wasm";
import Terminal from "./Terminal";
import { Theme } from "../themes";

type Props = {
  mode: AppMode;
  config: LabConfig | SSHConfig | null;
  theme: Theme;
  isActive: boolean;
  /** 'wasm' or 'server' — determines which backend a lab-mode tab uses */
  runMode: "server" | "wasm" | "c2w";
};

/** Wraps a single terminal session with its own hook instance.
 *  Always rendered; `isActive` controls visibility via display:none
 *  so the hook continues running (WebSocket stays open). */
export default function SessionTerminal({
  mode,
  config,
  theme,
  isActive,
  runMode,
}: Props) {
  const labConfig =
    mode === "lab" || mode === "c2w" ? (config as LabConfig) : null;
  const sshConfig = mode === "ssh" ? (config as SSHConfig) : undefined;
  const c2wConfig = mode === "c2w" ? (config as LabConfig) : null;

  const isSSH = mode === "ssh";
  const isC2W = mode === "c2w";

  // For lab mode, the backend depends on the global run mode:
  //   runMode === "wasm" → in-browser WASM (useWasmSSH)
  //   runMode === "server" → Go server WebSocket (useSSH with labConfig)
  //   runMode === "c2w" → container2wasm (this case is handled by isC2W above)
  const isLabInBrowserWasm = mode === "lab" && runMode === "wasm";
  const isLabServerBackend = mode === "lab" && runMode === "server";

  // All three hooks called unconditionally (React rules), but only one
  // receives a real config. The others get null and stay completely inert
  // (no WebSocket, no WASM init, no PTY).
  const serverResult = useSSH(
    isLabServerBackend ? labConfig : null,
    isSSH ? sshConfig : undefined,
  );
  const wasmResult = useWasmSSH(isLabInBrowserWasm ? labConfig : null);
  const c2wImageName = (c2wConfig as LabConfig | null)?.c2wImage ?? "debian";
  const c2wResult = useContainer2Wasm(
    isC2W ? c2wConfig : null,
    `c2w/${c2wImageName}.wasm`,
  );

  /**
   * Backend selection matrix (matching original App.tsx logic):
   *
   * | session mode | runMode    | backend       | hook used           |
   * |--------------|------------|---------------|---------------------|
   * | ssh          | any        | SSH proxy     | serverResult        |
   * | c2w          | any        | container2wasm| c2wResult           |
   * | lab          | "server"   | Go server     | serverResult        |
   * | lab          | "wasm"     | in-browser    | wasmResult          |
   */
  const result = isSSH
    ? serverResult
    : isC2W
      ? c2wResult
      : isLabInBrowserWasm
        ? wasmResult
        : serverResult;

  return (
    <div
      style={{
        display: isActive ? "flex" : "none",
        flex: 1,
        overflow: "hidden",
      }}
    >
      <Terminal
        lines={result.lines}
        onCommand={result.sendCommand}
        onClear={result.clearLines}
        connected={result.connected}
        username={labConfig?.username ?? (config as SSHConfig)?.username ?? ""}
        hostname={labConfig?.hostname ?? (config as SSHConfig)?.host ?? ""}
        nanoFile={result.nanoFile}
        setNanoFile={result.setNanoFile}
        theme={theme}
        showPrompt={mode === "lab"}
      />
    </div>
  );
}
