import React, { useState } from "react";
import { useSSH } from "./hooks/useSSH";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import { LabConfig } from "./types";

const CONFIG_VERSION = 2;

function loadConfig(): LabConfig | null {
  try {
    const raw = localStorage.getItem("ssh-lab-config");
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    // Stale config from an older version → force re-onboarding
    if (cfg._version !== CONFIG_VERSION) return null;
    if (cfg.hostname && cfg.hostname.includes("ecg")) return null;
    return cfg;
  } catch {}
  return null;
}

function saveConfig(config: LabConfig) {
  localStorage.setItem(
    "ssh-lab-config",
    JSON.stringify({ ...config, _version: CONFIG_VERSION }),
  );
}

export default function App() {
  const [config, setConfig] = useState<LabConfig | null>(loadConfig);

  const { lines, services, connected, sendCommand, clearLines } =
    useSSH(config);

  const handleCommand = (cmd: string) => {
    sendCommand(cmd);
  };

  if (!config) {
    return (
      <Onboarding
        onComplete={(c) => {
          saveConfig(c);
          setConfig(c);
        }}
      />
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#111",
      }}
    >
      {/* App bar */}
      <div
        style={{
          background: "#0a0a0a",
          borderBottom: "1px solid #333",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#ddd",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            ssh-lab
          </span>
          <span
            style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}
          >
            {config.hostname} · 10.0.0.42 · SSH Lab
          </span>
          <span
            onClick={() => {
              localStorage.removeItem("ssh-lab-config");
              setConfig(null);
            }}
            style={{
              fontSize: 10,
              color: "#555",
              fontFamily: "monospace",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            reconfigure
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: connected ? "#aaa" : "#666",
            }}
          />
          <span
            style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}
          >
            {connected ? "connected" : "disconnected"}
          </span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Terminal
          lines={lines}
          onCommand={handleCommand}
          onClear={clearLines}
          connected={connected}
          username={config.username}
          hostname={config.hostname}
        />
        <Sidebar services={services} connected={connected} />
      </div>
    </div>
  );
}
