export type ThemeId =
  | 'monochrome'
  | 'terminal'
  | 'ocean'
  | 'dracula'
  | 'nord'
  | 'solarized_dark'
  | 'monokai'
  | 'gruvbox_dark'
  | 'abyss'
  | 'solarized_light'
  | 'gruvbox_light'
  | 'light_modern'

export type Theme = {
  id: ThemeId
  label: string
  description?: string
  category: 'dark' | 'light'
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
    id: 'monochrome', label: 'Monochrome', description: 'Classic black & white', category: 'dark',
    bg: '#111', bgAlt: '#0a0a0a', bgCard: '#1a1a1a', border: '#333',
    text: '#d4d4d4', textMuted: '#888', textDim: '#555',
    accent: '#e0e0e0', accentErr: '#ff6b6b', cursor: '#d4d4d4', scrollbar: '#444',
  },
  terminal: {
    id: 'terminal', label: 'Terminal Green', description: 'Classic green-on-black', category: 'dark',
    bg: '#0a0a0a', bgAlt: '#050505', bgCard: '#111', border: '#1a3a1a',
    text: '#33ff33', textMuted: '#1a7a1a', textDim: '#0d3d0d',
    accent: '#00ff00', accentErr: '#ff3333', cursor: '#33ff33', scrollbar: '#1a3a1a',
  },
  ocean: {
    id: 'ocean', label: 'Ocean', description: 'Deep blue sea tones', category: 'dark',
    bg: '#0d1b2a', bgAlt: '#07101a', bgCard: '#142438', border: '#1b3a5c',
    text: '#a8d8ea', textMuted: '#5a7d9a', textDim: '#2a4a6a',
    accent: '#4fc3f7', accentErr: '#ff5252', cursor: '#4fc3f7', scrollbar: '#1b3a5c',
  },
  dracula: {
    id: 'dracula', label: 'Dracula', description: 'Vampire-inspired purple theme', category: 'dark',
    bg: '#282a36', bgAlt: '#1e1f29', bgCard: '#313244', border: '#44475a',
    text: '#f8f8f2', textMuted: '#bd93f9', textDim: '#6272a4',
    accent: '#ff79c6', accentErr: '#ff5555', cursor: '#f8f8f2', scrollbar: '#44475a',
  },
  nord: {
    id: 'nord', label: 'Nord', description: 'Arctic, north-bluish color palette', category: 'dark',
    bg: '#2e3440', bgAlt: '#242933', bgCard: '#3b4252', border: '#434c5e',
    text: '#d8dee9', textMuted: '#81a1c1', textDim: '#4c566a',
    accent: '#88c0d0', accentErr: '#bf616a', cursor: '#d8dee9', scrollbar: '#434c5e',
  },
  solarized_dark: {
    id: 'solarized_dark', label: 'Solarized Dark', description: 'Precision colors for machines and people', category: 'dark',
    bg: '#002b36', bgAlt: '#001e26', bgCard: '#073642', border: '#094652',
    text: '#839496', textMuted: '#657b83', textDim: '#3d5057',
    accent: '#2aa198', accentErr: '#dc322f', cursor: '#839496', scrollbar: '#094652',
  },
  monokai: {
    id: 'monokai', label: 'Monokai', description: 'A classic dark theme', category: 'dark',
    bg: '#272822', bgAlt: '#1e1f1c', bgCard: '#2d2e27', border: '#3e3d32',
    text: '#f8f8f2', textMuted: '#a59f85', textDim: '#6b6a5e',
    accent: '#a6e22e', accentErr: '#f92672', cursor: '#f8f8f2', scrollbar: '#3e3d32',
  },
  gruvbox_dark: {
    id: 'gruvbox_dark', label: 'Gruvbox Dark', description: 'Retro groove color scheme', category: 'dark',
    bg: '#282828', bgAlt: '#1d2021', bgCard: '#32302f', border: '#504945',
    text: '#ebdbb2', textMuted: '#a89984', textDim: '#665c54',
    accent: '#b8bb26', accentErr: '#fb4934', cursor: '#ebdbb2', scrollbar: '#504945',
  },
  abyss: {
    id: 'abyss', label: 'Abyss', description: 'Extra dark blue theme', category: 'dark',
    bg: '#000c18', bgAlt: '#00050f', bgCard: '#06152b', border: '#0a2a4a',
    text: '#6688aa', textMuted: '#22405a', textDim: '#112233',
    accent: '#225588', accentErr: '#f44747', cursor: '#6688aa', scrollbar: '#0a2a4a',
  },
  solarized_light: {
    id: 'solarized_light', label: 'Solarized Light', description: 'Light variant of Solarized', category: 'light',
    bg: '#fdf6e3', bgAlt: '#eee8d5', bgCard: '#f5efdc', border: '#d3c8a0',
    text: '#657b83', textMuted: '#93a1a1', textDim: '#b5c1c1',
    accent: '#268bd2', accentErr: '#dc322f', cursor: '#657b83', scrollbar: '#d3c8a0',
  },
  gruvbox_light: {
    id: 'gruvbox_light', label: 'Gruvbox Light', description: 'Light retro groove theme', category: 'light',
    bg: '#fbf1c7', bgAlt: '#f2e5bc', bgCard: '#f9f5d7', border: '#d5c4a1',
    text: '#3c3836', textMuted: '#7c6f64', textDim: '#a89984',
    accent: '#79740e', accentErr: '#9d0006', cursor: '#3c3836', scrollbar: '#d5c4a1',
  },
  light_modern: {
    id: 'light_modern', label: 'Light Modern', description: 'Clean modern light theme', category: 'light',
    bg: '#ffffff', bgAlt: '#f3f3f3', bgCard: '#f9f9f9', border: '#e0e0e0',
    text: '#1e1e1e', textMuted: '#616161', textDim: '#a0a0a0',
    accent: '#0078d4', accentErr: '#e51400', cursor: '#1e1e1e', scrollbar: '#cccccc',
  },
}

export const themeList: Theme[] = Object.values(themes)

export function getTheme(id: ThemeId): Theme {
  return themes[id] ?? themes.monochrome
}
