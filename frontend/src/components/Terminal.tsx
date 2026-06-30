import React, { useEffect, useRef, useState, KeyboardEvent } from "react";
import { OutputLine, NanoFile } from "../hooks/useSSH";
import { Theme } from "../themes";

type Props = {
  lines: OutputLine[];
  onCommand: (cmd: string) => void;
  onClear: () => void;
  connected: boolean;
  username: string;
  hostname: string;
  nanoFile: NanoFile | null;
  setNanoFile: (file: NanoFile | null) => void;
  theme: Theme;
};

function classColors(theme: Theme): Record<string, string> {
  return {
    head: theme.accent,
    ok: theme.text,
    err: theme.accentErr,
    warn: theme.textMuted,
    muted: theme.textMuted,
    prompt: theme.accent,
    "": theme.text,
  };
}

export default function Terminal({
  lines,
  onCommand,
  onClear,
  connected,
  username,
  hostname,
  nanoFile,
  setNanoFile,
  theme,
}: Props) {
  const outRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [exited, setExited] = useState(false);

  const [nanoContent, setNanoContent] = useState("");
  const [nanoModified, setNanoModified] = useState(false);
  const [nanoStatus, setNanoStatus] = useState("");
  const [nanoPrompt, setNanoPrompt] = useState<
    "none" | "exit-confirm" | "save-name"
  >("none");
  const [nanoTempFilename, setNanoTempFilename] = useState("");

  useEffect(() => {
    if (nanoFile) {
      setNanoContent(nanoFile.content);
      setNanoModified(false);
      setNanoStatus("");
      setNanoPrompt("none");
      setNanoTempFilename(nanoFile.filename);
    }
  }, [nanoFile]);

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
        "tutorial",
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
          const portMap: Record<string, number> = {
            nginx: 80,
            postgresql: 5432,
            redis: 6379,
            "node-api": 3000,
            prometheus: 9090,
            alertmanager: 9093,
            "node-exporter": 9100,
          };
          candidates = services.map((s) => `localhost:${portMap[s] ?? 80}`);
        } else if (first === "tutorial") {
          if (parts.length === 2) {
            candidates = ["systemctl", "docker", "curl", "basic"];
          }
        } else if (first === "sudo") {
          candidates = commands;
        } else if (first === "docker") {
          if (parts.length === 2) {
            candidates = ["ps", "logs", "stats", "images", "compose"];
          } else if (parts.length === 3) {
            const sub = parts[1].toLowerCase();
            if (sub === "compose") candidates = ["up", "down", "ps", "logs"];
            else if (["logs", "stats"].includes(sub)) candidates = services;
          }
        } else if (first === "apt" || first === "apt-get") {
          if (parts.length === 2) {
            candidates = [
              "list",
              "install",
              "update",
              "upgrade",
              "search",
              "remove",
              "purge",
            ];
          } else if (parts.length === 3 && parts[1] === "install") {
            candidates = [
              "curl",
              "wget",
              "nginx",
              "postgresql",
              "redis",
              "prometheus",
              "git",
              "vim",
              "nano",
              "htop",
              "iftop",
              "netcat-openbsd",
              "ngnix",
              "apt-transport-https",
              "ca-certificates",
            ];
          }
        } else if (first === "ip") {
          if (parts.length === 2) {
            candidates = ["addr", "route", "link", "neigh", "netns"];
          }
        } else if (
          first === "kill" ||
          first === "killall" ||
          first === "pkill"
        ) {
          candidates = services;
        }
      }

      const match = candidates.find((c) => c.startsWith(partial));
      if (match) {
        parts[parts.length - 1] = match;
        setInput(parts.join(" "));
      }
    }
  };

  if (nanoFile) {
    const handleTextareaChange = (
      e: React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
      setNanoContent(e.target.value);
      setNanoModified(e.target.value !== nanoFile.content);
    };

    const handleNanoSave = () => {
      let b64 = "";
      try {
        const bytes = new TextEncoder().encode(nanoContent);
        let binString = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binString += String.fromCharCode(bytes[i]);
        }
        b64 = btoa(binString);
      } catch (err) {
        b64 = btoa(nanoContent);
      }
      onCommand(`__writefile ${nanoTempFilename} ${b64}`);
      const lineCount = nanoContent.split("\n").length;
      setNanoStatus(`[ Wrote ${lineCount} lines ]`);
      setNanoModified(false);
      setTimeout(() => {
        setNanoStatus("");
      }, 2000);
    };

    const handleNanoExit = () => {
      if (nanoModified) {
        setNanoPrompt("exit-confirm");
      } else {
        setNanoFile(null);
      }
    };

    const handlePromptResponse = (key: string) => {
      if (nanoPrompt === "exit-confirm") {
        if (key.toLowerCase() === "y") {
          setNanoPrompt("save-name");
        } else if (key.toLowerCase() === "n") {
          setNanoFile(null);
        } else if (key === "cancel") {
          setNanoPrompt("none");
        }
      } else if (nanoPrompt === "save-name") {
        if (key === "confirm") {
          handleNanoSave();
          setNanoFile(null);
        } else if (key === "cancel") {
          setNanoPrompt("none");
        }
      }
    };

    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#111",
          overflow: "hidden",
          fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace",
        }}
      >
        {/* Nano header */}
        <div
          style={{
            background: "#1a1a1a",
            borderBottom: "1px solid #333",
            padding: "8px 14px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#aaa",
          }}
        >
          <span>GNU nano 6.2</span>
          <span>
            {nanoTempFilename}
            {nanoModified ? " *" : ""}
          </span>
          <span></span>
        </div>

        {/* Text area for editing */}
        <textarea
          value={nanoContent}
          onChange={handleTextareaChange}
          autoFocus
          spellCheck={false}
          style={{
            flex: 1,
            background: "#111",
            color: "#d4d4d4",
            border: "none",
            padding: "12px 16px",
            fontFamily: "inherit",
            fontSize: 12.5,
            lineHeight: 1.65,
            resize: "none",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === "x") {
              e.preventDefault();
              handleNanoExit();
            } else if (e.ctrlKey && e.key === "o") {
              e.preventDefault();
              setNanoPrompt("save-name");
            }
          }}
        />

        {/* Nano footer */}
        <div
          style={{
            background: "#1a1a1a",
            borderTop: "1px solid #333",
            padding: "10px 14px",
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Status or Prompt line */}
          <div style={{ color: "#d4d4d4", minHeight: 18, fontWeight: 500 }}>
            {nanoPrompt === "exit-confirm" && (
              <span style={{ color: "#ff6b6b" }}>
                Save modified buffer? (Answering "No" will discard changes.)
                [Y/N/Cancel]:{" "}
                <button
                  onClick={() => handlePromptResponse("y")}
                  style={{
                    background: "#222",
                    border: "1px solid #444",
                    color: "#ccc",
                    marginRight: 6,
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={() => handlePromptResponse("n")}
                  style={{
                    background: "#222",
                    border: "1px solid #444",
                    color: "#ccc",
                    marginRight: 6,
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                >
                  No
                </button>
                <button
                  onClick={() => handlePromptResponse("cancel")}
                  style={{
                    background: "#222",
                    border: "1px solid #444",
                    color: "#ccc",
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                >
                  Cancel
                </button>
              </span>
            )}
            {nanoPrompt === "save-name" && (
              <span>
                File Name to Write:{" "}
                <input
                  value={nanoTempFilename}
                  onChange={(e) => setNanoTempFilename(e.target.value)}
                  style={{
                    background: "#222",
                    border: "1px solid #444",
                    color: "#d4d4d4",
                    padding: "1px 4px",
                    fontSize: 11,
                    fontFamily: "inherit",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handlePromptResponse("confirm");
                    } else if (e.key === "Escape") {
                      handlePromptResponse("cancel");
                    }
                  }}
                />
                <button
                  onClick={() => handlePromptResponse("confirm")}
                  style={{
                    background: "#222",
                    border: "1px solid #444",
                    color: "#ccc",
                    marginLeft: 6,
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                >
                  Write
                </button>
                <button
                  onClick={() => handlePromptResponse("cancel")}
                  style={{
                    background: "#222",
                    border: "1px solid #444",
                    color: "#ccc",
                    marginLeft: 6,
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                >
                  Cancel
                </button>
              </span>
            )}
            {nanoPrompt === "none" &&
              (nanoStatus ||
                `[ Read ${nanoContent.split("\n").length} lines ]`)}
          </div>

          {/* Shortcuts Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "6px 12px",
              color: "#aaa",
              fontSize: 11.5,
            }}
          >
            <div onClick={handleNanoExit} style={{ cursor: "pointer" }}>
              <span
                style={{
                  background: "#ccc",
                  color: "#111",
                  padding: "0px 3px",
                  marginRight: 4,
                  fontWeight: "bold",
                }}
              >
                ^X
              </span>{" "}
              Exit
            </div>
            <div
              onClick={() => setNanoPrompt("save-name")}
              style={{ cursor: "pointer" }}
            >
              <span
                style={{
                  background: "#ccc",
                  color: "#111",
                  padding: "0px 3px",
                  marginRight: 4,
                  fontWeight: "bold",
                }}
              >
                ^O
              </span>{" "}
              WriteOut
            </div>
          </div>
        </div>
      </div>
    );
  }

  const promptLabel = `${username}@${hostname}:~$`;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: theme.bg,
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
                color: classColors(theme)[ln.class] ?? theme.text,
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
        ::-webkit-scrollbar-thumb { background: var(--theme-scrollbar, #444); border-radius: 2px; }
      `}</style>
    </div>
  );
}
