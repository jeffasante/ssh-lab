import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LabConfig,
  SSHConfig,
  AppMode,
  TerminalSession,
  generateSessionId,
  sessionTitle,
  defaultSessionConfig,
} from "./types";

import Terminal from "./components/Terminal";
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import ThemePicker from "./components/ThemePicker";
import TabBar from "./components/TabBar";
import SessionTerminal from "./components/SessionTerminal";
import { getTheme, ThemeId, themeList } from "./themes";

const CONFIG_VERSION = 2;

type AppConfig = LabConfig | SSHConfig;

function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem("ssh-lab-config");
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== "object") return null;
    if (cfg.hostname && cfg.username) return cfg as AppConfig;
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

function saveSessions(sessions: TerminalSession[]) {
  try {
    localStorage.setItem("ssh-lab-sessions", JSON.stringify(sessions));
  } catch {}
}

function loadSessions(config: AppConfig | null, mode: AppMode): TerminalSession[] {
  try {
    const raw = localStorage.getItem("ssh-lab-sessions");
    if (raw) {
      const parsed = JSON.parse(raw) as TerminalSession[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  // Fall back to a single session built from saved config
  if (!config) return [];
  return buildInitialSessions(config, mode);
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

function buildInitialSessions(
  config: AppConfig,
  mode: AppMode,
): TerminalSession[] {
  const id = generateSessionId();
  return [
    {
      id,
      title: sessionTitle(mode, config),
      mode,
      config,
    },
  ];
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(loadConfig);
  const [appMode, setAppMode] = useState<AppMode>(loadMode);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sessions, setSessions] = useState<TerminalSession[]>(() =>
    loadSessions(config, loadMode()),
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => sessions[0]?.id ?? null,
  );

  // Persist sessions whenever they change
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [themeId, setThemeId] = useState<ThemeId>(loadTheme);
  const runMode = useMemo(getRunMode, []);
  const theme = useMemo(() => getTheme(themeId), [themeId]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null;

  // Inject CSS variables into document root
  useEffect(() => {
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

  const handleOnboardingComplete = useCallback((c: AppConfig, m: AppMode) => {
    saveConfig(c, m);
    setAppMode(m);
    setConfig(c);
    const newSessions = buildInitialSessions(c, m);
    setSessions(newSessions);
    setActiveSessionId(newSessions[0].id);
  }, []);

  const handleAddTab = useCallback(() => {
    // Inherit the active session's config + mode so new tabs match the current setup.
    // c2w tabs always start a fresh container, but lab/ssh tabs reuse the same server config.
    const baseSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
    const inheritedMode: AppMode = baseSession?.mode ?? "lab";
    const inheritedConfig = baseSession?.config ?? defaultSessionConfig();
    const newSession: TerminalSession = {
      id: generateSessionId(),
      title: sessionTitle(inheritedMode, inheritedConfig),
      mode: inheritedMode,
      config: inheritedConfig,
    };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  }, [sessions, activeSessionId]);

  const handleCloseTab = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        if (idx === -1 || prev.length <= 1) return prev;
        const next = prev.filter((s) => s.id !== id);
        return next;
      });
      setActiveSessionId((prevId) => {
        if (prevId !== id) return prevId;
        const idx = sessions.findIndex((s) => s.id === id);
        if (idx === -1) return sessions[0]?.id ?? null;
        // Switch to neighbour
        if (idx > 0) return sessions[idx - 1].id;
        if (idx < sessions.length - 1) return sessions[idx + 1].id;
        return sessions[0]?.id ?? null;
      });
    },
    [sessions],
  );

  const handleSelectTab = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  // ---- Onboarding ----
  if (!config || sessions.length === 0) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const hostname =
    activeSession?.mode === "lab"
      ? ((activeSession.config as LabConfig)?.hostname ?? "")
      : activeSession?.mode === "ssh"
        ? ((activeSession.config as SSHConfig)?.host ?? "")
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
              : `${hostname} · ${sessions.length} tab${sessions.length !== 1 ? "s" : ""}`}
          </span>
          <span
            onClick={() => {
              localStorage.removeItem("ssh-lab-config");
              localStorage.removeItem("ssh-lab-app-mode");
              localStorage.removeItem("ssh-lab-sessions");
              setConfig(null);
              setSessions([]);
              setActiveSessionId(null);
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
          {isMobile && activeSession?.mode === "lab" && (
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
              background: theme.accent,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: theme.textMuted,
              fontFamily: "monospace",
            }}
          >
            {sessions.length} tab{sessions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectTab}
        onClose={handleCloseTab}
        onAdd={handleAddTab}
        theme={theme}
      />

      {/* Main area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Render all sessions — only active one visible, others keep running */}
        {sessions.map((s) => (
          <SessionTerminal
            key={s.id}
            mode={s.mode}
            config={s.config}
            theme={theme}
            isActive={s.id === activeSessionId}
            runMode={runMode}
          />
        ))}

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
