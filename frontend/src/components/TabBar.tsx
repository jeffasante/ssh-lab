import React from "react";
import { TerminalSession, AppMode } from "../types";
import { Theme } from "../themes";

type Props = {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  theme: Theme;
};

export default function TabBar({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  onAdd,
  theme,
}: Props) {
  const modeColor = (mode: AppMode): string => {
    switch (mode) {
      case "lab":
        return "#58a6ff";
      case "ssh":
        return "#3fb950";
      case "c2w":
        return "#d29922";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: theme.bgAlt,
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
        overflowX: "auto",
        overflowY: "hidden",
        minHeight: 32,
      }}
    >
      {sessions.map((s) => {
        const isActive = s.id === activeSessionId;
        return (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "'SF Mono','Fira Code',monospace",
              color: isActive ? theme.text : theme.textDim,
              background: isActive ? theme.bg : "transparent",
              borderRight: `1px solid ${theme.border}`,
              borderBottom: isActive
                ? `1px solid ${theme.bg}`
                : `1px solid transparent`,
              marginBottom: -1,
              whiteSpace: "nowrap",
              transition: "background 0.1s, color 0.1s",
              userSelect: "none",
            }}
          >
            {/* Mode dot */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: modeColor(s.mode),
                flexShrink: 0,
              }}
            />
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.title}
            </span>
            {/* Close button — don't allow closing the last tab */}
            {sessions.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(s.id);
                }}
                style={{
                  fontSize: 10,
                  lineHeight: "10px",
                  padding: "0 2px",
                  color: theme.textDim,
                  cursor: "pointer",
                  borderRadius: 2,
                  marginLeft: 2,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = theme.border)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                ✕
              </span>
            )}
          </div>
        );
      })}

      {/* Add tab button */}
      <div
        onClick={onAdd}
        style={{
          padding: "4px 10px",
          cursor: "pointer",
          color: theme.textMuted,
          fontSize: 14,
          lineHeight: "16px",
          fontFamily: "'SF Mono','Fira Code',monospace",
          userSelect: "none",
          flexShrink: 0,
        }}
        title="New tab"
      >
        +
      </div>
    </div>
  );
}
