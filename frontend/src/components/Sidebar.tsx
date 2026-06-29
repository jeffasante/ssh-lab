import React from "react";
import { ServiceInfo } from "../hooks/useSSH";

type Props = {
  services: Record<string, ServiceInfo>;
  connected: boolean;
};

export default function Sidebar({ services, connected }: Props) {
  const entries = Object.values(services).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const running = entries.filter((s) => s.running).length;
  const totalCpu = entries.reduce((a, s) => a + (s.running ? s.cpu : 0), 0);
  const totalMem = entries.reduce((a, s) => a + (s.running ? s.mem_mb : 0), 0);

  return (
    <aside
      style={{
        background: "#1a1a1a",
        borderLeft: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        width: 210,
        flexShrink: 0,
        fontFamily: "'SF Mono','Fira Code',monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#666",
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          services
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 4,
            background: connected ? "#222" : "#222",
            color: "#aaa",
            fontWeight: 500,
          }}
        >
          {connected ? "live" : "offline"}
        </span>
      </div>

      {/* Service list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {entries.map((svc) => (
          <div
            key={svc.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              fontSize: 11,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                flexShrink: 0,
                background: svc.running ? "#aaa" : "#555",
                transition: "background 0.3s",
              }}
            />
            <span style={{ flex: 1, color: "#ccc" }}>
              {svc.display || svc.name}
            </span>
            <span
              style={{ color: svc.running ? "#aaa" : "#666", fontSize: 10 }}
            >
              {svc.running ? "active" : "dead"}
            </span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ borderTop: "1px solid #333", padding: "10px 12px" }}>
        {[
          ["running", `${running}/${entries.length}`],
          ["cpu sum", `${totalCpu.toFixed(1)}%`],
          ["mem sum", `${(totalMem / 1024).toFixed(2)}G`],
          ["load avg", "0.54 0.48"],
          ["disk /", "43% used"],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              padding: "2px 0",
            }}
          >
            <span style={{ color: "#666" }}>{k}</span>
            <span style={{ color: "#ccc" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div
        style={{
          borderTop: "1px solid #333",
          padding: "8px 12px",
          fontSize: 10,
          color: "#666",
          lineHeight: 1.8,
        }}
      >
        systemctl stop nginx
        <br />
        systemctl start nginx
        <br />
        journalctl -u redis
        <br />
        curl localhost:3000
        <br />
        type <span style={{ color: "#888" }}>help</span> for all cmds
      </div>
    </aside>
  );
}
