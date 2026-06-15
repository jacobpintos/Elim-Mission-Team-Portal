import type { ThemeDoc } from '@/types/theme'

export const defaults: ThemeDoc = {
  primary: '#f56c5a',
  primaryDark: '#c04a34',
  accent: '#f0a070',
  dark: {
    background: '#1a1a2e',
    surface: '#16213e',
    text: '#ffffff',
    textMuted: '#a0a0b0',
    border: '#2a2a4e',
  },
  light: {
    background: '#f8f8fc',
    surface: '#ffffff',
    text: '#1a1a2e',
    textMuted: '#606070',
    border: '#e0e0e8',
  },
  onPrimaryOverride: null,
  updatedAt: 0,
  updatedBy: '',
}
