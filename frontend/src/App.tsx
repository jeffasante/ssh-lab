import React, { useState, useMemo } from "react";
import { useSSH } from "./hooks/useSSH";
import { useWasmSSH } from "./hooks/useWasmSSH";
import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import { LabConfig, SSHConfig, AppMode } from "./types";
import { getTheme, ThemeId } from "./themes";

const CONFIG_VERSION = 2;

type AppConfig = LabConfig | SSHConfig;

function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem("ssh-lab-config");
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg._version !== CONFIG_VERSION) return null;
    if (cfg.hostname && cfg.hostname.includes("ecg")) return null;
    return cfg;
  } catch {}
  return null;
}

function loadMode(): AppMode {
  try {
    const m = localStorage.getItem("ssh-lab-app-mode") as AppMode | null;
    if (m === "ssh") return "ssh";
  } catch {}
  return "lab";
}

function saveConfig(config: AppConfig, mode: AppMode) {
  localStorage.setItem(
    "ssh-lab-config",
    JSON.stringify({ ...config, _version: CONFIG_VERSION }),
  );
  localStorage.setItem("ssh-lab-app-mode", mode);
}

function getRunMode(): "server" | "wasm" {
  if (typeof window === "undefined") return "server";
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "wasm") return "wasm";
  if (params.get("server") === "1") return "server";
  const stored = localStorage.getItem("ssh-lab-mode");
  if (stored === "wasm" || stored === "server") return stored;
  return "server";
}

function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem("ssh-lab-theme") as ThemeId | null;
    if (t === "monochrome" || t === "terminal" || t === "ocean") return t;
  } catch {}
  return "monochrome";
}

const themes: { id: ThemeId; label: string }[] = [
  { id: "monochrome", label: "BW" },
  { id: "terminal", label: "Term" },
  { id: "ocean", label: "Ocean" },
];

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(loadConfig);
  const [appMode, setAppMode] = useState<AppMode>(loadMode);
  const [themeId, setThemeId] = useState<ThemeId>(loadTheme);
  const mode = useMemo(getRunMode, []);

  const theme = useMemo(() => getTheme(themeId), [themeId]);

  const isLab = appMode === "lab";
  const labConfig = isLab ? (config as LabConfig) : null;

  const sshHooks = mode === "wasm" ? useWasmSSH : useSSH;
  const {
    lines,
    services,
    connected,
    sendCommand,
    clearLines,
    nanoFile,
    setNanoFile,
  } = sshHooks(labConfig, isLab ? undefined : (config as SSHConfig));

  const handleCommand = (cmd: string) => {
    sendCommand(cmd);
  };

  if (!config) {
    return (
      <Onboarding
        onComplete={(c, m) => {
          saveConfig(c, m);
          setAppMode(m);
          setConfig(c);
        }}
      />
    );
  }

  // Inject CSS variables into document root
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--theme-bg", theme.bg);
    root.style.setProperty("--theme-bg-alt", theme.bgAlt);
    root.style.setProperty("--theme-bg-card", theme.bgCard);
    root.style.setProperty("--theme-border", theme.border);
    root.style.setProperty("--theme-text", theme.text);
    root.style.setProperty("--theme-text-muted", theme.textMuted);
    root.style.setProperty("--theme-text-dim", theme.textDim);
    root.style.setProperty("--theme-accent", theme.accent);
    root.style.setProperty("--theme-accent-err", theme.accentErr);
    root.style.setProperty("--theme-cursor", theme.cursor);
    root.style.setProperty("--theme-scrollbar", theme.scrollbar);

    const existing = document.getElementById("theme-styles");
    if (existing) existing.remove();
    const sheet = document.createElement("style");
    sheet.id = "theme-styles";
    sheet.textContent = `
      * { scrollbar-color: var(--theme-scrollbar) transparent; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: var(--theme-scrollbar); border-radius: 2px; }
    `;
    document.head.appendChild(sheet);
  }, [theme]);

  const hostname = isLab
    ? (config as LabConfig).hostname
    : (config as SSHConfig).host;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: theme.bg,
      }}
    >
      {/* App bar */}
      <div
        style={{
          background: theme.bgAlt,
          borderBottom: `1px solid ${theme.border}`,
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
              color: theme.accent,
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            ssh-lab
          </span>
          <span
            style={{
              fontSize: 11,
              color: theme.textMuted,
              fontFamily: "monospace",
            }}
          >
            {hostname} · {isLab ? "Lab" : "SSH"}
          </span>
          <span
            style={{
              fontSize: 9,
              color: theme.textDim,
              fontFamily: "monospace",
              border: `1px solid ${theme.border}`,
              borderRadius: 3,
              padding: "1px 5px",
            }}
          >
            {appMode}
          </span>
          <span
            onClick={() => {
              localStorage.removeItem("ssh-lab-config");
              localStorage.removeItem("ssh-lab-app-mode");
              setConfig(null);
            }}
            style={{
              fontSize: 10,
              color: theme.textDim,
              fontFamily: "monospace",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            reconfigure
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {themes.map((t) => (
            <span
              key={t.id}
              onClick={() => {
                setThemeId(t.id);
                localStorage.setItem("ssh-lab-theme", t.id);
              }}
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 3,
                border: `1px solid ${themeId === t.id ? theme.accent : theme.border}`,
                color: themeId === t.id ? theme.accent : theme.textDim,
                background: themeId === t.id ? theme.border : "transparent",
              }}
            >
              {t.label}
            </span>
          ))}
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: connected ? theme.accent : theme.accentErr,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: theme.textMuted,
              fontFamily: "monospace",
            }}
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
          username={isLab ? (config as LabConfig).username : ""}
          hostname={hostname}
          nanoFile={nanoFile}
          setNanoFile={setNanoFile}
          theme={theme}
        />
        {isLab && (
          <Sidebar services={services} connected={connected} theme={theme} />
        )}
      </div>
    </div>
  );
}
