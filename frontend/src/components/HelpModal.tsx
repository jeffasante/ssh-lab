import React, { useState, useEffect } from "react";
import { Theme } from "../themes";
import { AppMode } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  mode: AppMode;
  /** For c2w mode: which container image is active */
  c2wImage?: string;
};

type Snippet = { label: string; code: string; comment?: string };
type Section = { title: string; icon: string; snippets: Snippet[] };

function getLabSections(): Section[] {
  return [
    {
      title: "System Info",
      icon: "💻",
      snippets: [
        { label: "OS release", code: "cat /etc/os-release" },
        { label: "Kernel version", code: "uname -r" },
        { label: "Uptime", code: "uptime" },
        { label: "Who am I", code: "whoami && id" },
        { label: "Hostname", code: "hostname" },
      ],
    },
    {
      title: "Processes & Resources",
      icon: "📊",
      snippets: [
        { label: "Top processes", code: "top" },
        { label: "All processes", code: "ps aux" },
        { label: "Memory usage", code: "free -h" },
        { label: "Disk usage", code: "df -h" },
        { label: "CPU info", code: "lscpu" },
      ],
    },
    {
      title: "Services (systemctl)",
      icon: "⚙️",
      snippets: [
        { label: "List all services", code: "systemctl list-units" },
        { label: "Check nginx", code: "systemctl status nginx" },
        { label: "Restart nginx", code: "systemctl restart nginx" },
        { label: "Check PostgreSQL", code: "systemctl status postgresql" },
        { label: "Check Redis", code: "systemctl status redis" },
      ],
    },
    {
      title: "Networking",
      icon: "🌐",
      snippets: [
        { label: "Network interfaces", code: "ip addr" },
        { label: "Routing table", code: "ip route" },
        { label: "Listening ports", code: "ss -tlnp" },
        { label: "Curl nginx", code: "curl localhost:80" },
        { label: "Curl node-api", code: "curl localhost:3000/health" },
        { label: "Ping external", code: "ping 8.8.8.8" },
      ],
    },
    {
      title: "Logs",
      icon: "📋",
      snippets: [
        { label: "nginx logs", code: "journalctl -u nginx" },
        { label: "Follow nginx logs", code: "journalctl -u nginx -f" },
        { label: "PostgreSQL logs", code: "journalctl -u postgresql" },
      ],
    },
    {
      title: "Files & Editing",
      icon: "📁",
      snippets: [
        { label: "List files", code: "ls -la" },
        { label: "Read a file", code: "cat /etc/os-release" },
        { label: "Edit with nano", code: "nano myfile.txt" },
        { label: "Find files", code: "find / -name '*.log' 2>/dev/null" },
      ],
    },
  ];
}

function getDebianSections(): Section[] {
  return [
    {
      title: "First Steps",
      icon: "🐧",
      snippets: [
        { label: "Who am I", code: "whoami" },
        { label: "OS info", code: "cat /etc/debian_version" },
        { label: "Shell", code: "echo $SHELL" },
        { label: "Working directory", code: "pwd && ls" },
      ],
    },
    {
      title: "Package Management",
      icon: "📦",
      snippets: [
        { label: "Update packages", code: "apt-get update" },
        { label: "Install curl", code: "apt-get install -y curl" },
        { label: "Install Python", code: "apt-get install -y python3" },
        { label: "Install vim", code: "apt-get install -y vim" },
        { label: "List installed", code: "dpkg -l | head -20" },
      ],
    },
    {
      title: "Networking",
      icon: "🌐",
      snippets: [
        { label: "Fetch a URL", code: "curl https://example.com" },
        {
          label: "robots.txt",
          code: "curl https://www.digitalocean.com/robots.txt",
        },
        { label: "IP info", code: "curl https://ipinfo.io" },
        { label: "Network interfaces", code: "ip addr" },
      ],
    },
    {
      title: "Files & System",
      icon: "📁",
      snippets: [
        { label: "List root", code: "ls /" },
        { label: "Disk usage", code: "df -h" },
        { label: "Memory", code: "free -h" },
        { label: "Running processes", code: "ps aux" },
        { label: "Create file", code: "echo 'hello' > hello.txt && cat hello.txt" },
      ],
    },
  ];
}

function getPythonSections(): Section[] {
  return [
    {
      title: "Python Basics",
      icon: "🐍",
      snippets: [
        { label: "Python version", code: "python3 --version" },
        { label: "Hello world", code: `python3 -c "print('Hello, World!')"` },
        {
          label: "Math",
          code: `python3 -c "import math; print(math.sqrt(2))"`,
        },
        {
          label: "List comprehension",
          code: `python3 -c "print([x**2 for x in range(10)])"`,
        },
        {
          label: "Interactive REPL",
          code: "python3",
          comment: "Opens interactive Python shell",
        },
      ],
    },
    {
      title: "File Operations",
      icon: "📁",
      snippets: [
        {
          label: "Write a script",
          code: `echo 'print("Hello from script!")' > hello.py && python3 hello.py`,
        },
        {
          label: "Read file",
          code: `python3 -c "print(open('/etc/debian_version').read())"`,
        },
        {
          label: "JSON parse",
          code: `python3 -c "import json; d={'key':'val'}; print(json.dumps(d, indent=2))"`,
        },
      ],
    },
    {
      title: "HTTP Requests",
      icon: "🌐",
      snippets: [
        {
          label: "Fetch URL",
          code: `python3 -c "import urllib.request; print(urllib.request.urlopen('https://example.com').read()[:200])"`,
        },
        {
          label: "IP lookup",
          code: `python3 -c "import urllib.request, json; r=json.loads(urllib.request.urlopen('https://ipinfo.io/json').read()); print(r)"`,
        },
      ],
    },
    {
      title: "System",
      icon: "💻",
      snippets: [
        {
          label: "OS info",
          code: `python3 -c "import platform; print(platform.uname())"`,
        },
        {
          label: "List directory",
          code: `python3 -c "import os; print(os.listdir('/'))"`,
        },
        {
          label: "Environment",
          code: `python3 -c "import os; print(dict(os.environ))"`,
        },
      ],
    },
  ];
}

const SHORTCUTS = [
  { key: "Ctrl+C", desc: "Interrupt / cancel running command" },
  { key: "↑ / ↓", desc: "Navigate command history" },
  { key: "Tab", desc: "Autocomplete command" },
  { key: "clear", desc: "Clear terminal screen" },
];

export default function HelpModal({ open, onClose, theme, mode, c2wImage }: Props) {
  const [activeSection, setActiveSection] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection(0);
  }, [mode, c2wImage]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isPython = mode === "c2w" && c2wImage === "python";
  const isDebian = mode === "c2w" && c2wImage !== "python";
  const sections = isPython
    ? getPythonSections()
    : isDebian
      ? getDebianSections()
      : getLabSections();

  const modeLabel = isPython ? "🐍 Python" : isDebian ? "🐧 Debian" : "⚙️ Lab";
  const sec = sections[activeSection] ?? sections[0];

  const copySnippet = (code: string, key: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIdx(key);
      setTimeout(() => setCopiedIdx(null), 1200);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 10000,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(680px, calc(100vw - 24px))",
          maxHeight: "min(560px, calc(100dvh - 48px))",
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
          zIndex: 10001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>
              Quick Reference
            </span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 7px",
                background: theme.accent + "22",
                border: `1px solid ${theme.accent}44`,
                borderRadius: 10,
                color: theme.accent,
                fontFamily: "monospace",
              }}
            >
              {modeLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: theme.textMuted,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Body — sidebar + content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Section nav */}
          <div
            style={{
              width: "clamp(90px, 28%, 160px)",
              borderRight: `1px solid ${theme.border}`,
              overflowY: "auto",
              flexShrink: 0,
              padding: "6px 0",
            }}
          >
            {sections.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveSection(i)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: i === activeSection ? theme.accent + "22" : "transparent",
                  borderLeft: `2px solid ${i === activeSection ? theme.accent : "transparent"}`,
                  border: "none",
                  borderLeftStyle: "solid",
                  borderLeftWidth: 2,
                  borderLeftColor: i === activeSection ? theme.accent : "transparent",
                  color: i === activeSection ? theme.text : theme.textMuted,
                  cursor: "pointer",
                  padding: "7px 10px",
                  fontSize: 11,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "background 0.1s",
                }}
              >
                <span style={{ fontSize: 13 }}>{s.icon}</span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.title}
                </span>
              </button>
            ))}

            {/* Keyboard shortcuts section */}
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  padding: "4px 10px",
                  fontSize: 9,
                  color: theme.textDim,
                  fontFamily: "monospace",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                shortcuts
              </div>
              {SHORTCUTS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    padding: "4px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  <code
                    style={{
                      fontSize: 10,
                      color: theme.accent,
                      background: theme.accent + "15",
                      padding: "1px 4px",
                      borderRadius: 3,
                      fontFamily: "monospace",
                      display: "inline-block",
                      width: "fit-content",
                    }}
                  >
                    {s.key}
                  </code>
                  <span style={{ fontSize: 9, color: theme.textMuted }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Snippets panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
            <div
              style={{
                fontSize: 11,
                color: theme.textMuted,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>{sec.icon}</span>
              <span style={{ fontWeight: 600, color: theme.text }}>{sec.title}</span>
              <span style={{ color: theme.textDim }}>— click to copy</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sec.snippets.map((snippet, i) => {
                const key = `${activeSection}-${i}`;
                const copied = copiedIdx === key;
                return (
                  <div
                    key={i}
                    onClick={() => copySnippet(snippet.code, key)}
                    style={{
                      cursor: "pointer",
                      background: copied ? theme.accent + "18" : theme.bgAlt,
                      border: `1px solid ${copied ? theme.accent : theme.border}`,
                      borderRadius: 6,
                      padding: "8px 12px",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 10,
                            color: theme.textMuted,
                            marginBottom: 3,
                            fontFamily: "inherit",
                          }}
                        >
                          {snippet.label}
                          {snippet.comment && (
                            <span style={{ color: theme.textDim, marginLeft: 6 }}>
                              — {snippet.comment}
                            </span>
                          )}
                        </div>
                        <code
                          style={{
                            fontSize: 12,
                            color: theme.text,
                            fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            display: "block",
                          }}
                        >
                          {snippet.code}
                        </code>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          color: copied ? theme.accent : theme.textDim,
                          fontFamily: "monospace",
                          flexShrink: 0,
                          paddingTop: 2,
                          transition: "color 0.15s",
                        }}
                      >
                        {copied ? "✓" : "⎘"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
