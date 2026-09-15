export type Mode = 'light' | 'dark'

/**
 * Chart colours. Recharts needs literal strings, so the palette is declared here
 * rather than read back out of CSS custom properties.
 */
export interface Palette {
  g1: string
  g2: string
  wind: string
  solar: string
  battery: string
  load: string
  optimised: string
  baseline: string
  heat: string
  band: string
  grid: string
  axis: string
  shift: string
  panel: string
  border: string
}

export const PALETTES: Record<Mode, Palette> = {
  light: {
    g1: '#0B2E5C',
    g2: '#35618F',
    wind: '#4A9FD8',
    solar: '#D98218',
    battery: '#2E6B4F',
    load: '#0B1622',
    optimised: '#1E6FB8',
    baseline: '#C0392B',
    heat: '#D98218',
    band: '#4A9FD8',
    grid: '#E3E8F0',
    axis: '#64748B',
    shift: '#4A9FD8',
    panel: '#FFFFFF',
    border: '#D5DDE8',
  },
  dark: {
    g1: '#2C5C92',
    g2: '#4B7FB5',
    wind: '#5CB0E6',
    solar: '#E09A45',
    battery: '#4A8F6C',
    load: '#F0F5FA',
    optimised: '#5CB0E6',
    baseline: '#E0685A',
    heat: '#E09A45',
    band: '#5CB0E6',
    grid: '#222D3A',
    axis: '#7D8DA0',
    shift: '#5CB0E6',
    panel: '#161E2A',
    border: '#27333F',
  },
}

export const STATUS_COLOR = {
  nominal: '#2E6B4F',
  caution: '#D98218',
  alarm: '#C0392B',
} as const
