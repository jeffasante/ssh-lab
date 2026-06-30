import React, { useState, useRef, useEffect } from "react";
import { Theme, ThemeId, themeList } from "../themes";

type Props = {
  currentThemeId: ThemeId;
  onSelect: (id: ThemeId) => void;
  theme: Theme;
};

export default function ThemePicker({ currentThemeId, onSelect, theme }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const filtered = themeList.filter(
    (t) =>
      !query ||
      t.label.toLowerCase().includes(query.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const darkThemes = filtered.filter((t) => t.category === "dark");
  const lightThemes = filtered.filter((t) => t.category === "light");

  const currentTheme = themeList.find((t) => t.id === currentThemeId);

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Select Color Theme"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: open ? theme.bgCard : "transparent",
          border: `1px solid ${open ? theme.accent : theme.border}`,
          borderRadius: 4,
          color: open ? theme.accent : theme.textMuted,
          cursor: "pointer",
          padding: "3px 8px",
          fontSize: 10,
          fontFamily: "monospace",
          letterSpacing: "0.05em",
          transition: "border-color 0.15s, color 0.15s",
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="currentColor"
          style={{ flexShrink: 0 }}
        >
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM8 4a4 4 0 1 0 0 8A4 4 0 0 0 8 4zm0 6.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
        </svg>
        {currentTheme?.label ?? "Theme"}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxHeight: 420,
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            overflow: "hidden",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Search bar */}
          <div
            style={{
              padding: "10px 12px 8px",
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Select Color Theme"
              style={{
                width: "100%",
                background: theme.bgAlt,
                border: `1.5px solid ${theme.accent}`,
                borderRadius: 4,
                color: theme.text,
                fontFamily: "inherit",
                fontSize: 13,
                padding: "6px 10px",
                outline: "none",
              }}
            />
          </div>

          {/* Theme list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {darkThemes.length > 0 && (
              <>
                <div
                  style={{
                    padding: "6px 14px 3px",
                    fontSize: 10,
                    color: theme.accent,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  dark themes
                </div>
                {darkThemes.map((t) => (
                  <ThemeRow
                    key={t.id}
                    theme={t}
                    selected={t.id === currentThemeId}
                    onSelect={(id) => { onSelect(id); setOpen(false); }}
                  />
                ))}
              </>
            )}
            {lightThemes.length > 0 && (
              <>
                <div
                  style={{
                    padding: "8px 14px 3px",
                    fontSize: 10,
                    color: theme.accent,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    borderTop: darkThemes.length > 0 ? `1px solid ${theme.border}` : undefined,
                    marginTop: darkThemes.length > 0 ? 4 : 0,
                  }}
                >
                  light themes
                </div>
                {lightThemes.map((t) => (
                  <ThemeRow
                    key={t.id}
                    theme={t}
                    selected={t.id === currentThemeId}
                    onSelect={(id) => { onSelect(id); setOpen(false); }}
                  />
                ))}
              </>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: "20px", color: "#666", fontSize: 12, textAlign: "center" }}>
                No themes match "{query}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeRow({
  theme,
  selected,
  onSelect,
}: {
  theme: Theme;
  selected: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onSelect(theme.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 14px",
        cursor: "pointer",
        background: selected ? theme.accent + "33" : hovered ? "rgba(255,255,255,0.06)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Color swatch preview */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {[theme.bg, theme.accent, theme.text, theme.accentErr].map((c, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: c,
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontSize: 13,
            color: selected ? "#ffffff" : "#cccccc",
            fontWeight: selected ? 600 : 400,
          }}
        >
          {theme.label}
        </span>
        {theme.description && (
          <span style={{ fontSize: 11, color: "#666" }}>
            {theme.description}
          </span>
        )}
      </div>
      {selected && (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#4a90d9">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
        </svg>
      )}
    </div>
  );
}
