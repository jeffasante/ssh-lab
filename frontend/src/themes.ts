export type ThemeId = 'monochrome' | 'terminal' | 'ocean'

export type Theme = {
  id: ThemeId
  label: string
  bg: string
  bgAlt: string
  bgCard: string
  border: string
  text: string
  textMuted: string
  textDim: string
  accent: string
  accentErr: string
  cursor: string
  scrollbar: string
}

export const themes: Record<ThemeId, Theme> = {
  monochrome: {
    id: 'monochrome',
    label: 'Monochrome',
    bg: '#111',
    bgAlt: '#0a0a0a',
    bgCard: '#1a1a1a',
    border: '#333',
    text: '#d4d4d4',
    textMuted: '#888',
    textDim: '#555',
    accent: '#e0e0e0',
    accentErr: '#ff6b6b',
    cursor: '#d4d4d4',
    scrollbar: '#444',
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    bg: '#0a0a0a',
    bgAlt: '#050505',
    bgCard: '#111',
    border: '#1a3a1a',
    text: '#33ff33',
    textMuted: '#1a7a1a',
    textDim: '#0d3d0d',
    accent: '#00ff00',
    accentErr: '#ff3333',
    cursor: '#33ff33',
    scrollbar: '#1a3a1a',
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    bg: '#0d1b2a',
    bgAlt: '#07101a',
    bgCard: '#142438',
    border: '#1b3a5c',
    text: '#a8d8ea',
    textMuted: '#5a7d9a',
    textDim: '#2a4a6a',
    accent: '#4fc3f7',
    accentErr: '#ff5252',
    cursor: '#4fc3f7',
    scrollbar: '#1b3a5c',
  },
}

export function getTheme(id: ThemeId): Theme {
  return themes[id] ?? themes.monochrome
}
