import React, { useState, useEffect } from "react";
import { LabConfig, SSHConfig, AppMode, OS_PRESETS, SCENARIOS } from "../types";

function randomHostname(): string {
  const suffix = Math.random().toString(36).substring(2, 6);
  return "server-" + suffix;
}

type StoredProfile = {
  name: string;
  mode: AppMode;
  config: LabConfig | SSHConfig;
};

function loadProfiles(): StoredProfile[] {
  try {
    return JSON.parse(localStorage.getItem("ssh-lab-profiles") || "[]");
  } catch {
    return [];
  }
}

function saveProfile(
  name: string,
  mode: AppMode,
  config: LabConfig | SSHConfig,
) {
  const profiles = loadProfiles().filter((p) => p.name !== name);
  profiles.unshift({ name, mode, config });
  if (profiles.length > 10) profiles.length = 10;
  localStorage.setItem("ssh-lab-profiles", JSON.stringify(profiles));
}

type Props = {
  onComplete: (config: LabConfig | SSHConfig, mode: AppMode) => void;
  savedProfile?: StoredProfile | null;
  onClearProfile?: () => void;
};

const roles = [
  { value: "sre", label: "SRE / DevOps" },
  { value: "dev", label: "Developer" },
  { value: "ai", label: "AI agent runner" },
  { value: "hobbyist", label: "Hobbyist" },
  { value: "student", label: "Student" },
  { value: "researcher", label: "Researcher" },
  { value: "other", label: "Other" },
];

const oses = Object.values(OS_PRESETS);

export default function Onboarding({
  onComplete,
  savedProfile,
  onClearProfile,
}: Props) {
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [showProfiles, setShowProfiles] = useState(false);
  const [mode, setMode] = useState<AppMode>("lab");
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState(
    savedProfile && savedProfile.mode === "lab"
      ? (savedProfile.config as LabConfig).username
      : "",
  );
  const [role, setRole] = useState(
    savedProfile && savedProfile.mode === "lab"
      ? (savedProfile.config as LabConfig).role || "sre"
      : "sre",
  );
  const [hostname, setHostname] = useState(
    savedProfile && savedProfile.mode === "lab"
      ? (savedProfile.config as LabConfig).hostname
      : randomHostname(),
  );
  const [os, setOs] = useState(
    savedProfile && savedProfile.mode === "lab"
      ? (savedProfile.config as LabConfig).os || "ubuntu"
      : "ubuntu",
  );
  const [scenario, setScenario] = useState(
    savedProfile && savedProfile.mode === "lab"
      ? (savedProfile.config as LabConfig).scenario || "healthy"
      : "healthy",
  );

  useEffect(() => {
    setProfiles(loadProfiles());
    // If there's a saved profile, pre-select its mode
    if (savedProfile) setMode(savedProfile.mode);
  }, [savedProfile]);

  const canNext = (): boolean => {
    if (step === 1 && username.trim() === "") return false;
    return true;
  };

  const handleNext = () => {
    if (!canNext()) return;
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("");
  const [sshPassword, setSshPassword] = useState("");

  const fillProfile = (p: StoredProfile) => {
    setMode(p.mode);
    if (p.mode === "lab") {
      const c = p.config as LabConfig;
      setUsername(c.username);
      setRole(c.role || "sre");
      setHostname(c.hostname);
      setOs(c.os || "ubuntu");
      setScenario(c.scenario || "healthy");
    } else if (p.mode === "ssh") {
      const c = p.config as SSHConfig;
      setSshHost(c.host);
      setSshPort(String(c.port || 22));
      setSshUser(c.username);
      setSshPassword(c.password || "");
    }
  };

  const handleStart = () => {
    if (mode === "c2w") {
      onComplete(
        {
          username: "root",
          hostname: "debian",
          role,
          os,
          scenario: scenario as LabConfig["scenario"],
        },
        "c2w",
      );
    } else if (mode === "ssh") {
      onComplete(
        {
          host: sshHost.trim(),
          port: parseInt(sshPort) || 22,
          username: sshUser.trim(),
          password: sshPassword,
        },
        "ssh",
      );
    } else {
      onComplete(
        {
          username: username.trim(),
          hostname: hostname.trim() || randomHostname(),
          role,
          os,
          scenario: scenario as LabConfig["scenario"],
        },
        "lab",
      );
    }
  };

  const activeColor = "#ccc";
  const doneColor = "#999";
  const futureColor = "#555";

  const stepColor = (idx: number) => {
    if (idx < step) return doneColor;
    if (idx === step) return activeColor;
    return futureColor;
  };

  const labelSx: React.CSSProperties = {
    fontSize: 10,
    color: "#6e7681",
    letterSpacing: ".08em",
    textTransform: "uppercase",
    marginBottom: 6,
  };

  const inputSx: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 4,
    color: "#c9d1d9",
    fontFamily: "'SF Mono','Fira Code',monospace",
    fontSize: 13,
    outline: "none",
  };

  const radioGroupSx: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const radioOptionSx = (selected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    border: `1px solid ${selected ? activeColor : "#30363d"}`,
    borderRadius: 4,
    background: selected ? "#0d1117" : "transparent",
    cursor: "pointer",
    fontSize: 12.5,
    color: selected ? "#c9d1d9" : "#6e7681",
    fontFamily: "'SF Mono','Fira Code',monospace",
    transition: "border-color 0.15s, color 0.15s",
  });

  const radioCircleSx = (selected: boolean): React.CSSProperties => ({
    width: 12,
    height: 12,
    borderRadius: "50%",
    border: `2px solid ${selected ? activeColor : "#484f58"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  });

  const radioDotSx: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: activeColor,
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1117",
        fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace",
      }}
    >
      <div
        style={{
          width: "92%",
          maxWidth: 480,
          background: "#161b22",
          border: "1px solid #21262d",
          borderRadius: 4,
          padding: "24px 20px",
        }}
      >
        {/* Saved profiles */}
        {profiles.length > 0 && !showProfiles && (
          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <span
              onClick={() => setShowProfiles(true)}
              style={{
                fontSize: 10,
                color: "#6e7681",
                fontFamily: "'SF Mono','Fira Code',monospace",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              load saved profile ({profiles.length})
            </span>
          </div>
        )}
        {showProfiles && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                color: "#6e7681",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              saved profiles
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 160,
                overflowY: "auto",
              }}
            >
              {profiles.map((p) => (
                <div
                  key={p.name}
                  onClick={() => {
                    fillProfile(p);
                    setShowProfiles(false);
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "6px 8px",
                    border: "1px solid #30363d",
                    borderRadius: 4,
                    fontSize: 11,
                    color: "#c9d1d9",
                    fontFamily: "'SF Mono','Fira Code',monospace",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{p.name}</span>
                  <span style={{ color: "#6e7681" }}>{p.mode}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, textAlign: "center" }}>
              <span
                onClick={() => setShowProfiles(false)}
                style={{ fontSize: 10, color: "#6e7681", cursor: "pointer" }}
              >
                cancel
              </span>
            </div>
          </div>
        )}

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 0,
            marginBottom: 24,
          }}
        >
          <span
            onClick={() => setMode("lab")}
            style={{
              fontSize: 11,
              fontFamily: "'SF Mono','Fira Code',monospace",
              cursor: "pointer",
              padding: "5px 10px",
              border: `1px solid ${mode === "lab" ? activeColor : "#30363d"}`,
              borderRadius: "4px 0 0 4px",
              color: mode === "lab" ? activeColor : "#6e7681",
              background: mode === "lab" ? "#0d1117" : "transparent",
            }}
          >
            Lab
          </span>
          {/* Debian/container mode requires SharedArrayBuffer (COOP/COEP headers) */}
          {typeof SharedArrayBuffer !== "undefined" && (
            <span
              onClick={() => setMode("c2w")}
              style={{
                fontSize: 11,
                fontFamily: "'SF Mono','Fira Code',monospace",
                cursor: "pointer",
                padding: "5px 10px",
                border: `1px solid ${mode === "c2w" ? activeColor : "#30363d"}`,
                borderRadius: 0,
                color: mode === "c2w" ? activeColor : "#6e7681",
                background: mode === "c2w" ? "#0d1117" : "transparent",
              }}
            >
              Debian
            </span>
          )}
          <span
            onClick={() => setMode("ssh")}
            style={{
              fontSize: 11,
              fontFamily: "'SF Mono','Fira Code',monospace",
              cursor: "pointer",
              padding: "5px 10px",
              border: `1px solid ${mode === "ssh" ? activeColor : "#30363d"}`,
              borderRadius: "0 4px 4px 0",
              color: mode === "ssh" ? activeColor : "#6e7681",
              background: mode === "ssh" ? "#0d1117" : "transparent",
            }}
          >
            SSH
          </span>
        </div>

        {/* SSH connection form */}
        {mode === "ssh" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={labelSx}>connect to real server</div>

            {/* Test server quick-fill */}
            <div
              onClick={() => {
                setSshHost("test.rebex.net");
                setSshPort("22");
                setSshUser("demo");
                setSshPassword("password");
              }}
              style={{
                fontSize: 10,
                color: "#58a6ff",
                fontFamily: "'SF Mono','Fira Code',monospace",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 2,
                marginBottom: 4,
                display: "inline-block",
                width: "fit-content",
              }}
            >
              fill demo server (test.rebex.net)
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="192.168.1.100"
                style={{ ...inputSx, flex: 1 }}
                autoFocus
              />
              <input
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                placeholder="22"
                style={{ ...inputSx, width: 70 }}
              />
            </div>
            <input
              value={sshUser}
              onChange={(e) => setSshUser(e.target.value)}
              placeholder="root"
              style={inputSx}
            />
            <input
              value={sshPassword}
              onChange={(e) => setSshPassword(e.target.value)}
              placeholder="password"
              type="password"
              style={inputSx}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sshHost && sshUser) handleStart();
              }}
            />
          </div>
        )}

        {/* Step indicator — lab mode only */}
        {mode === "lab" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 28,
              gap: 0,
              fontSize: 11,
              fontFamily: "'SF Mono','Fira Code',monospace",
            }}
          >
            {[1, 2, 3].map((n, i) => (
              <React.Fragment key={n}>
                <span
                  style={{
                    color: stepColor(n),
                    fontWeight: step >= n ? 500 : 400,
                  }}
                >
                  {n}
                </span>
                {i < 2 && (
                  <span
                    style={{
                      width: 48,
                      height: 1,
                      background:
                        n < step
                          ? doneColor
                          : n === step
                            ? activeColor
                            : "#30363d",
                      margin: "0 8px",
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Step 1 — Who are you? (lab only) */}
        {mode === "lab" && step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={labelSx}>username</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jeff"
                style={inputSx}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNext();
                }}
              />
            </div>

            <div>
              <div style={labelSx}>pick a role</div>
              <div style={radioGroupSx}>
                {roles.map((r) => (
                  <div
                    key={r.value}
                    style={radioOptionSx(role === r.value)}
                    onClick={() => setRole(r.value)}
                  >
                    <div style={radioCircleSx(role === r.value)}>
                      {role === r.value && <div style={radioDotSx} />}
                    </div>
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Name your server (lab only) */}
        {mode === "lab" && step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={labelSx}>hostname</div>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="server-xxxx"
                style={inputSx}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNext();
                }}
              />
              <div style={{ fontSize: 10, color: "#484f58", marginTop: 4 }}>
                auto-generated — you can change it
              </div>
            </div>

            <div>
              <div style={labelSx}>OS preset</div>
              <div style={radioGroupSx}>
                {oses.map((o) => (
                  <div
                    key={o.name}
                    style={radioOptionSx(os === o.name)}
                    onClick={() => setOs(o.name)}
                  >
                    <div style={radioCircleSx(os === o.name)}>
                      {os === o.name && <div style={radioDotSx} />}
                    </div>
                    <span>{o.pretty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Pick a scenario (lab only) */}
        {mode === "lab" && step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={labelSx}>scenario</div>
            <div style={radioGroupSx}>
              {SCENARIOS.map((s) => (
                <div
                  key={s.id}
                  style={radioOptionSx(scenario === s.id)}
                  onClick={() => setScenario(s.id)}
                >
                  <div style={radioCircleSx(scenario === s.id)}>
                    {scenario === s.id && <div style={radioDotSx} />}
                  </div>
                  <div>
                    <div
                      style={{
                        color: scenario === s.id ? "#c9d1d9" : "#6e7681",
                        fontSize: 12.5,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{ color: "#484f58", fontSize: 10, marginTop: 1 }}
                    >
                      {s.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 24,
            gap: 8,
          }}
        >
          {mode === "lab" && (
            <>
              <div>
                {step > 1 && (
                  <button
                    onClick={handleBack}
                    style={{
                      background: "transparent",
                      border: "1px solid #30363d",
                      borderRadius: 4,
                      color: "#6e7681",
                      fontFamily: "'SF Mono','Fira Code',monospace",
                      fontSize: 12,
                      padding: "7px 16px",
                      cursor: "pointer",
                    }}
                  >
                    ← Back
                  </button>
                )}
              </div>

              {step < 3 ? (
                <button
                  onClick={handleNext}
                  disabled={!canNext()}
                  style={{
                    background: "transparent",
                    border: `1px solid ${canNext() ? "#aaa" : "#30363d"}`,
                    borderRadius: 4,
                    color: canNext() ? "#ccc" : "#555",
                    fontFamily: "'SF Mono','Fira Code',monospace",
                    fontSize: 12,
                    padding: "7px 16px",
                    cursor: canNext() ? "pointer" : "default",
                  }}
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  style={{
                    background: "transparent",
                    border: "1px solid #aaa",
                    borderRadius: 4,
                    color: "#ccc",
                    fontFamily: "'SF Mono','Fira Code',monospace",
                    fontSize: 12,
                    padding: "7px 16px",
                    cursor: "pointer",
                  }}
                >
                  start session →
                </button>
              )}
            </>
          )}

          {mode === "c2w" && (
            <div style={{ width: "100%" }}>
              <button
                onClick={handleStart}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid #aaa",
                  borderRadius: 4,
                  color: "#ccc",
                  fontFamily: "'SF Mono','Fira Code',monospace",
                  fontSize: 12,
                  padding: "7px 16px",
                  cursor: "pointer",
                }}
              >
                boot debian →
              </button>
            </div>
          )}

          {mode === "ssh" && (
            <div style={{ width: "100%" }}>
              <button
                onClick={handleStart}
                disabled={!sshHost || !sshUser}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${sshHost && sshUser ? "#aaa" : "#30363d"}`,
                  borderRadius: 4,
                  color: sshHost && sshUser ? "#ccc" : "#555",
                  fontFamily: "'SF Mono','Fira Code',monospace",
                  fontSize: 12,
                  padding: "7px 16px",
                  cursor: sshHost && sshUser ? "pointer" : "default",
                }}
              >
                connect →
              </button>
            </div>
          )}
        </div>

        {/* Save profile button */}
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <span
            onClick={() => {
              const name = prompt("Name this profile:");
              if (name) {
                if (mode === "lab") {
                  saveProfile(name, mode, {
                    username: username.trim() || "user",
                    hostname: hostname.trim() || randomHostname(),
                    role,
                    os,
                    scenario,
                  } as LabConfig);
                } else if (mode === "ssh") {
                  saveProfile(name, mode, {
                    host: sshHost.trim(),
                    port: parseInt(sshPort) || 22,
                    username: sshUser.trim(),
                    password: sshPassword,
                  } as SSHConfig);
                } else if (mode === "c2w") {
                  saveProfile(name, mode, {
                    username: "root",
                    hostname: "debian",
                    role,
                    os,
                    scenario,
                  } as LabConfig);
                } else {
                  saveProfile(name, mode, {
                    username: username.trim() || "user",
                    hostname: hostname.trim() || randomHostname(),
                    role,
                    os,
                    scenario,
                  } as LabConfig);
                }
                setProfiles(loadProfiles());
              }
            }}
            style={{
              fontSize: 10,
              color: "#6e7681",
              fontFamily: "'SF Mono','Fira Code',monospace",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            save as profile
          </span>
        </div>
      </div>
    </div>
  );
}
