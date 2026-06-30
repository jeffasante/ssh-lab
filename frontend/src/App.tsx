import React, { useState, useEffect, useMemo } from "react";
import { useSSH } from "./hooks/useSSH";
import { useWasmSSH } from "./hooks/useWasmSSH";

import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import ThemePicker from "./components/ThemePicker";
import { LabConfig, SSHConfig, AppMode } from "./types";
import { getTheme, ThemeId, themeList } from "./themes";

const CONFIG_VERSION = 2;

type AppConfig = LabConfig | SSHConfig;

function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem("ssh-lab-config");
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== "object") return null;
    // Validate as LabConfig (has hostname + username)
    if (cfg.hostname && cfg.username) return cfg as AppConfig;
    // Validate as SSHConfig (has host)
    if (cfg.host) return cfg as AppConfig;
    return null;
  } catch {}
  return null;
}

function loadMode(): AppMode {
  try {
    const m = localStorage.getItem("ssh-lab-app-mode") as AppMode | null;
    if (m === "ssh" || m === "c2w") return m;
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

function getRunMode(): "server" | "wasm" | "c2w" {
  if (typeof window === "undefined") return "server";
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "wasm" && params.get("c2w") === "1") return "c2w";
  if (params.get("mode") === "wasm") return "wasm";
  if (params.get("server") === "1") return "server";
  const stored = localStorage.getItem("ssh-lab-mode");
  if (stored === "c2w") return "c2w";
  if (stored === "wasm" || stored === "server") return stored;
  return "server";
}

function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem("ssh-lab-theme") as ThemeId | null;
    if (t && themeList.some((th) => th.id === t)) return t;
  } catch {}
  return "monochrome";
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(loadConfig);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [appMode, setAppMode] = useState<AppMode>(loadMode);
  const [themeId, setThemeId] = useState<ThemeId>(loadTheme);
  const mode = useMemo(getRunMode, []);

  const theme = useMemo(() => getTheme(themeId), [themeId]);

  const isLab = appMode === "lab";
  const isC2W = appMode === "c2w";
  const isSSH = appMode === "ssh";
  const useWasm = mode === "wasm" && !isC2W;
  const labConfig = isLab ? (config as LabConfig) : null;

  const labResult = useSSH(
    isSSH ? null : isLab ? labConfig : null,
    isSSH ? (config as SSHConfig) : undefined,
  );
  const wasmResult = useWasmSSH(isLab ? labConfig : null);
  const c2wResult = useSSH(
    isC2W ? labConfig : null,
    isC2W ? "wasm" : undefined,
  );

  const hookResult = isC2W
    ? c2wResult
    : isSSH
      ? labResult
      : useWasm
        ? wasmResult
        : labResult;
  const {
    lines,
    services,
    connected,
    sendCommand,
    clearLines,
    nanoFile,
    setNanoFile,
  } = hookResult;

  const handleCommand = (cmd: string) => {
    sendCommand(cmd);
  };

  // Inject CSS variables into document root — MUST be before any early return
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

  // (moved above)

  const hostname =
    appMode === "lab"
      ? (config as LabConfig).hostname
      : appMode === "ssh"
        ? (config as SSHConfig).host
        : "debian";

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
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
            {isMobile
              ? hostname
              : `${hostname} · ${appMode === "lab" ? "Lab" : appMode === "ssh" ? "SSH" : "Debian"}`}
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
          {isMobile && isLab && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: 9,
                fontFamily: "monospace",
                borderRadius: 3,
                marginRight: 6,
              }}
            >
              {sidebarOpen ? "close" : "services"}
            </button>
          )}
          <ThemePicker
            currentThemeId={themeId}
            onSelect={(id) => {
              setThemeId(id);
              localStorage.setItem("ssh-lab-theme", id);
            }}
            theme={theme}
          />
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
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
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
        {appMode === "lab" && (
          <Sidebar
            services={services}
            connected={connected}
            theme={theme}
            style={
              isMobile
                ? {
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 100,
                    boxShadow: "-4px 0 16px rgba(0,0,0,0.5)",
                    display: sidebarOpen ? "flex" : "none",
                  }
                : {}
            }
          />
        )}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 90,
            }}
          />
        )}
      </div>
    </div>
  );
}
