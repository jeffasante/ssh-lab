import React, { useState } from "react";
import { LabConfig, OS_PRESETS, SCENARIOS } from "../types";

function randomHostname(): string {
  const suffix = Math.random().toString(36).substring(2, 6);
  return "server-" + suffix;
}

type Props = {
  onComplete: (config: LabConfig) => void;
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

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("sre");
  const [hostname, setHostname] = useState(randomHostname());
  const [os, setOs] = useState("ubuntu");
  const [scenario, setScenario] = useState("healthy");

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

  const handleStart = () => {
    onComplete({
      username: username.trim(),
      hostname: hostname.trim() || randomHostname(),
      role,
      os,
      scenario: scenario as LabConfig["scenario"],
    });
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
          width: "100%",
          maxWidth: 480,
          background: "#161b22",
          border: "1px solid #21262d",
          borderRadius: 4,
          padding: "28px 32px 24px",
        }}
      >
        {/* Step indicator */}
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

        {/* Step 1 — Who are you? */}
        {step === 1 && (
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

        {/* Step 2 — Name your server */}
        {step === 2 && (
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

        {/* Step 3 — Pick a scenario */}
        {step === 3 && (
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
        </div>
      </div>
    </div>
  );
}
