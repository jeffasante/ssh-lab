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
  nanoFile?: NanoFile | null;
  setNanoFile?: (file: NanoFile | null) => void;
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
  const pendingRef = useRef(false);
  const linesLenRef = useRef(0);
  // Always-current count of lines — updated in useEffect, never from closure
  const liveCountRef = useRef(0);

  const [pending, setPending] = useState(false);
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

  const scrollToBottom = () => {
    if (outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    // Keep liveCountRef always in sync with the real current lines count
    liveCountRef.current = lines.length;
    // Auto-scroll output on every new line
    scrollToBottom();
    // Unblock input when server responds with new lines after a command
    if (pendingRef.current && lines.length > linesLenRef.current) {
      pendingRef.current = false;
      setPending(false);
      // Restore focus + re-scroll after React re-renders the prompt
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 50);
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
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    if (cmd === "exit" || cmd === "logout") {
      setExited(true);
    }

    onCommand(cmd);

    // Block input until server responds with new lines.
    // Use liveCountRef (always current) instead of the closure's `lines` prop.
    if (cmd) {
      pendingRef.current = true;
      linesLenRef.current = liveCountRef.current; // ← always-current snapshot
      setPending(true);
    } else {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };


  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C or Cmd+C → interrupt running command
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      if (pendingRef.current) {
        onCommand("__SIGINT__");
        pendingRef.current = false;
        setPending(false);
      }
      setInput("");
      return;
    }

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

  const nanoBtn: React.CSSProperties = {
    background: "#555",
    border: "none",
    color: "#fff",
    fontFamily: "'Courier New',monospace",
    fontSize: 13,
    cursor: "pointer",
    padding: "0 6px",
    marginLeft: 4,
    borderRadius: 2,
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

    const nanoLineCount = nanoContent.split("\n").length;

    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#000",
          overflow: "hidden",
          fontFamily: "'Courier New','Lucida Console',monospace",
          fontSize: 13,
        }}
      >
        {/* ── PICO Header ── */}
        <div
          style={{
            background: "#ccc",
            color: "#000",
            padding: "2px 8px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: "normal",
            letterSpacing: "0.02em",
            lineHeight: "20px",
          }}
        >
          <span>UW PICO 5.09</span>
          <span>File: {nanoTempFilename}</span>
          <span>{nanoModified ? "Modified" : ""}</span>
        </div>

        {/* ── Editing area ── */}
        <textarea
          value={nanoContent}
          onChange={handleTextareaChange}
          autoFocus
          spellCheck={false}
          style={{
            flex: 1,
            background: "#000",
            color: "#d4d4d4",
            border: "none",
            padding: "4px 8px",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.55,
            resize: "none",
            outline: "none",
            caretColor: "#d4d4d4",
          }}
          onKeyDown={(e) => {
            if (nanoPrompt !== "none") {
              e.preventDefault();
              if (nanoPrompt === "exit-confirm") {
                if (e.key.toLowerCase() === "y") handlePromptResponse("y");
                else if (e.key.toLowerCase() === "n") handlePromptResponse("n");
                else if (e.key === "Escape" || (e.ctrlKey && e.key === "c")) handlePromptResponse("cancel");
              }
              return;
            }
            if (e.ctrlKey && e.key === "x") { e.preventDefault(); handleNanoExit(); }
            else if (e.ctrlKey && e.key === "o") { e.preventDefault(); setNanoPrompt("save-name"); }
          }}
        />

        {/* ── Footer ── */}
        <div
          style={{
            background: "#000",
            borderTop: "1px solid #333",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          {/* Status / prompt line */}
          <div
            style={{
              padding: "2px 8px",
              color: "#d4d4d4",
              minHeight: 20,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {nanoPrompt === "exit-confirm" && (
                <>
                  Save modified buffer? (Answering "No" will DISCARD changes) [Y/N] :{" "}
                  <button onClick={() => handlePromptResponse("y")} style={nanoBtn}>Y</button>
                  <button onClick={() => handlePromptResponse("n")} style={nanoBtn}>N</button>
                  <button onClick={() => handlePromptResponse("cancel")} style={{ ...nanoBtn, marginLeft: 8 }}>Cancel</button>
                </>
              )}
              {nanoPrompt === "save-name" && (
                <>
                  File Name to Write:{" "}
                  <input
                    value={nanoTempFilename}
                    onChange={(e) => setNanoTempFilename(e.target.value)}
                    autoFocus
                    style={{
                      background: "#ccc", color: "#000", border: "none",
                      fontFamily: "inherit", fontSize: 13, padding: "0 4px", width: 200,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePromptResponse("confirm");
                      else if (e.key === "Escape") handlePromptResponse("cancel");
                    }}
                  />
                  <button onClick={() => handlePromptResponse("confirm")} style={nanoBtn}>Write</button>
                </>
              )}
              {nanoPrompt === "none" && (nanoStatus || "")}
            </span>
            {/* Status bar right: Ln / Col */}
            <span style={{ color: "#888", fontSize: 12 }}>
              Ln {nanoLineCount}&nbsp;&nbsp;Col 1&nbsp;&nbsp;Space
            </span>
          </div>

          {/* Shortcuts grid */}
          <div
            className="nano-shortcuts-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gridTemplateRows: "repeat(2, auto)",
              gridAutoFlow: "column",
              gap: 0,
              padding: "4px 4px 6px",
              color: "#d4d4d4",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            {[
              { key: "^G", label: "Get Help", onClick: undefined },
              { key: "^X", label: "Exit", onClick: handleNanoExit },
              { key: "^O", label: "WriteOut", onClick: () => setNanoPrompt("save-name") },
              { key: "^J", label: "Justify", onClick: undefined },
              { key: "^R", label: "Read File", onClick: undefined },
              { key: "^W", label: "Where is", onClick: undefined },
              { key: "^Y", label: "Prev Pg", onClick: undefined },
              { key: "^V", label: "Next Pg", onClick: undefined },
              { key: "^K", label: "Cut Text", onClick: undefined },
              { key: "^U", label: "UnCut Text", onClick: undefined },
              { key: "^C", label: "Cur Pos", onClick: undefined },
              { key: "^T", label: "To Spell", onClick: undefined },
            ].map(({ key, label, onClick }) => (
              <div
                key={key}
                onClick={onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "1px 6px",
                  cursor: onClick ? "pointer" : "default",
                }}
              >
                <span
                  style={{
                    background: "#555",
                    color: "#fff",
                    padding: "0 3px",
                    borderRadius: 2,
                    fontSize: 11,
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {key}
                </span>
                <span style={{ color: "#d4d4d4", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            ))}
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

      {/* Hidden real input — pointerEvents must stay 'none' visually but we programmatic-focus on click */}
      {!exited && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={!connected || pending}
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
            fontSize: 16, /* prevent iOS zoom on focus */
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
