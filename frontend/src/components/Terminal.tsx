import React, { useEffect, useRef, useState, KeyboardEvent } from "react";
import { OutputLine } from "../hooks/useSSH";

type Props = {
  lines: OutputLine[];
  onCommand: (cmd: string) => void;
  onClear: () => void;
  connected: boolean;
  username: string;
  hostname: string;
};

const CLASS_COLORS: Record<string, string> = {
  head: "#e0e0e0",
  ok: "#c0c0c0",
  err: "#ff6b6b",
  warn: "#b0b0b0",
  muted: "#888888",
  prompt: "#e0e0e0",
  "": "#d4d4d4",
};

export default function Terminal({
  lines,
  onCommand,
  onClear,
  connected,
  username,
  hostname,
}: Props) {
  const outRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    if (outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight;
    }
  }, [lines]);

  const submit = () => {
    const cmd = input.trim();
    setInput("");
    setHistIdx(-1);

    if (cmd) {
      setHistory((prev) => [cmd, ...prev]);
    }

    if (cmd === "clear" || cmd === "reset") {
      onClear();
      return;
    }

    if (cmd === "exit" || cmd === "logout") {
      setExited(true);
    }

    onCommand(cmd);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setInput(history[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(history[next] ?? "");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();

      const commands = [
        "apt",
        "cat",
        "chmod",
        "chown",
        "clear",
        "crontab",
        "curl",
        "date",
        "df",
        "dig",
        "docker",
        "dpkg",
        "du",
        "echo",
        "env",
        "exit",
        "export",
        "find",
        "free",
        "grep",
        "head",
        "help",
        "history",
        "hostname",
        "htop",
        "id",
        "ifconfig",
        "ip",
        "iptables",
        "journalctl",
        "kill",
        "killall",
        "logout",
        "ls",
        "lsblk",
        "mkdir",
        "mount",
        "nano",
        "netstat",
        "nslookup",
        "ping",
        "pkill",
        "printenv",
        "ps",
        "pwd",
        "rm",
        "service",
        "ss",
        "ssh",
        "sudo",
        "systemctl",
        "tail",
        "tar",
        "tee",
        "top",
        "touch",
        "traceroute",
        "uname",
        "uptime",
        "vi",
        "vim",
        "w",
        "wc",
        "wget",
        "who",
        "whoami",
      ];
      const files = [
        "apps/",
        "logs/",
        "health-check.sh",
        ".bashrc",
        ".profile",
        ".ssh/",
        ".bash_history",
        ".bash_logout",
      ];
      const services = [
        "nginx",
        "postgresql",
        "redis",
        "node-api",
        "prometheus",
        "alertmanager",
        "node-exporter",
      ];
      const sysctlSubs = [
        "status",
        "start",
        "stop",
        "restart",
        "list-units",
        "is-active",
        "list",
      ];

      const parts = input.split(/\s+/);
      const partial = parts[parts.length - 1].toLowerCase();
      if (partial === "") return;

      let candidates: string[] = [];

      if (parts.length === 1) {
        // First word: complete commands, files, or ./scripts
        candidates = [
          ...commands,
          ...files,
          ...files.filter((f) => !f.endsWith("/")).map((f) => "./" + f),
        ];
      } else {
        const first = parts[0].toLowerCase();
        if (["systemctl", "service"].includes(first)) {
          if (parts.length === 2) {
            candidates = [...services, ...sysctlSubs];
          } else if (
            parts.length === 3 &&
            sysctlSubs.includes(parts[1].toLowerCase())
          ) {
            candidates = services;
          }
        } else if (first === "journalctl") {
          if (parts.length === 2) {
            candidates = ["-u", "-f"];
          } else if (parts.length === 3 && parts[1] === "-u") {
            candidates = services;
          }
        } else if (first === "cat" || first === "./health-check.sh") {
          candidates = files;
        } else if (first === "curl") {
          candidates = services.map(
            (s) =>
              `localhost:${["nginx", "postgresql", "redis", "node-api", "prometheus", "alertmanager", "node-exporter"].indexOf(s) === 0 ? 80 : ["nginx", "postgresql", "redis", "node-api", "prometheus", "alertmanager", "node-exporter"].indexOf(s) === 1 ? 5432 : ["nginx", "postgresql", "redis", "node-api", "prometheus", "alertmanager", "node-exporter"].indexOf(s) === 2 ? 6379 : ["nginx", "postgresql", "redis", "node-api", "prometheus", "alertmanager", "node-exporter"].indexOf(s) === 3 ? 3000 : ["nginx", "postgresql", "redis", "node-api", "prometheus", "alertmanager", "node-exporter"].indexOf(s) === 4 ? 9090 : ["nginx", "postgresql", "redis", "node-api", "prometheus", "alertmanager", "node-exporter"].indexOf(s) === 5 ? 9093 : 9100}`,
          );
        } else if (first === "sudo") {
          candidates = commands;
        }
      }

      const match = candidates.find((c) => c.startsWith(partial));
      if (match) {
        parts[parts.length - 1] = match;
        setInput(parts.join(" "));
      }
    }
  };

  const promptLabel = `${username}@${hostname}:~$`;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#111",
        overflow: "hidden",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div
        style={{
          background: "#1a1a1a",
          borderBottom: "1px solid #333",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#555",
            display: "inline-block",
          }}
        />
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#555",
            display: "inline-block",
          }}
        />
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#555",
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: "#888",
            marginLeft: 6,
            fontFamily: "monospace",
          }}
        >
          {username}@{hostname} — ssh 10.0.0.42
        </span>
      </div>

      {/* Output */}
      <div
        ref={outRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          fontSize: 12.5,
          lineHeight: 1.65,
          fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace",
        }}
      >
        {lines.map((ln, i) => {
          if (ln.class === "clear") return null;
          if (ln.class === "exit")
            return (
              <div key={i} style={{ color: "#888", marginTop: 4 }}>
                — session ended. Refresh to reconnect. —
              </div>
            );
          return (
            <div
              key={i}
              style={{
                color: CLASS_COLORS[ln.class] ?? "#d4d4d4",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {ln.text || "\u00A0"}
            </div>
          );
        })}

        {/* Live prompt */}
        {!exited && (
          <div style={{ display: "flex", alignItems: "center", marginTop: 2 }}>
            <span
              style={{
                color: "#e0e0e0",
                fontFamily: "monospace",
                fontSize: 12.5,
                whiteSpace: "nowrap",
                marginRight: 6,
              }}
            >
              {promptLabel}
            </span>
            <span style={{ color: "#d4d4d4", fontSize: 12.5 }}>{input}</span>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 14,
                background: "#d4d4d4",
                marginLeft: 1,
                animation: "blink 1s step-end infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Hidden real input */}
      {!exited && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          disabled={!connected}
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
          }}
        />
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
      `}</style>
    </div>
  );
}
