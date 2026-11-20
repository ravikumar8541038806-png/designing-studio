import type { AppSettings, ThemeId } from '../types'

export interface ThemeTokens {
  id: ThemeId
  name: string
  /** Page canvas. */
  bg: string
  /** Primary text. */
  ink: string
  /** Secondary text. */
  muted: string
  /** Tinted surfaces: table headers, callouts, chips. */
  soft: string
  /** Hairlines and table rules. */
  line: string
  /** Wash behind inline strong/key terms — must stay readable on `bg`. */
  highlight: string
  dark: boolean
  swatch: [string, string, string, string]
}

export interface ThemeGroup {
  id: string
  name: string
  blurb: string
  themes: ThemeId[]
}

export const THEMES: Record<ThemeId, Omit<ThemeTokens, 'id' | 'name' | 'swatch'>> = {
  'pure-snow': {
    bg: '#ffffff',
    ink: '#0f172a',
    muted: '#64748b',
    soft: '#f6f8fb',
    line: '#e3e8ef',
    highlight: 'rgba(15, 23, 42, 0.07)',
    dark: false,
  },
  'paper-ivory': {
    bg: '#fbf7ef',
    ink: '#2b2419',
    muted: '#7a6a55',
    soft: '#f4eee1',
    line: '#e6dcc9',
    highlight: 'rgba(120, 84, 32, 0.12)',
    dark: false,
  },
  'cool-alabaster': {
    bg: '#f4f7fb',
    ink: '#16233a',
    muted: '#5f7189',
    soft: '#eaf0f8',
    line: '#d9e3ef',
    highlight: 'rgba(22, 35, 58, 0.08)',
    dark: false,
  },
  'arctic-minimal': {
    bg: '#f8fbfd',
    ink: '#0b1b2b',
    muted: '#5c7286',
    soft: '#eef4f9',
    line: '#dbe6f0',
    highlight: 'rgba(11, 27, 43, 0.07)',
    dark: false,
  },
  'forest-sage': {
    bg: '#f4f7f0',
    ink: '#1f2a20',
    muted: '#5d6f58',
    soft: '#e9efe2',
    line: '#d6e0cb',
    highlight: 'rgba(47, 82, 44, 0.12)',
    dark: false,
  },
  'warm-sand': {
    bg: '#faf3e6',
    ink: '#33281a',
    muted: '#7c6a52',
    soft: '#f3e9d7',
    line: '#e6d7be',
    highlight: 'rgba(122, 87, 32, 0.14)',
    dark: false,
  },
  'terracotta-clay': {
    bg: '#fbf1ea',
    ink: '#3a231b',
    muted: '#8a6455',
    soft: '#f4e3d8',
    line: '#e8d0c2',
    highlight: 'rgba(140, 58, 32, 0.14)',
    dark: false,
  },
  'ocean-mist': {
    bg: '#eef6f7',
    ink: '#103035',
    muted: '#517679',
    soft: '#e1eef0',
    line: '#cde0e2',
    highlight: 'rgba(16, 74, 78, 0.12)',
    dark: false,
  },
  'espresso-cream': {
    bg: '#f6efe6',
    ink: '#2f2118',
    muted: '#7b6350',
    soft: '#efe4d6',
    line: '#e0d1bf',
    highlight: 'rgba(84, 48, 22, 0.14)',
    dark: false,
  },
  'matcha-minimal': {
    bg: '#f3f6ea',
    ink: '#28301c',
    muted: '#6a7752',
    soft: '#e9efd9',
    line: '#d8e1c3',
    highlight: 'rgba(60, 82, 24, 0.13)',
    dark: false,
  },
  'muted-lavender': {
    bg: '#f6f3fb',
    ink: '#2a2340',
    muted: '#6f6690',
    soft: '#ede8f7',
    line: '#ded6ef',
    highlight: 'rgba(74, 52, 122, 0.12)',
    dark: false,
  },
  'dusty-rose': {
    bg: '#fbf1f2',
    ink: '#3a2228',
    muted: '#8b6370',
    soft: '#f5e4e7',
    line: '#ecd2d7',
    highlight: 'rgba(132, 48, 72, 0.12)',
    dark: false,
  },
  'dark-executive': {
    bg: '#0d1016',
    ink: '#eef1f7',
    muted: '#98a4b6',
    soft: '#171d26',
    line: '#2a3442',
    highlight: 'rgba(255, 255, 255, 0.16)',
    dark: true,
  },
  'obsidian-gold': {
    bg: '#0b0b0c',
    ink: '#f5efe1',
    muted: '#b3a58a',
    soft: '#171513',
    line: '#332b21',
    highlight: 'rgba(212, 175, 95, 0.22)',
    dark: true,
  },
  'midnight-slate': {
    bg: '#111827',
    ink: '#e6ecf5',
    muted: '#94a3b8',
    soft: '#1b2534',
    line: '#2c3a4d',
    highlight: 'rgba(255, 255, 255, 0.15)',
    dark: true,
  },
  'deep-emerald-night': {
    bg: '#081613',
    ink: '#e2f2ec',
    muted: '#8fb3a7',
    soft: '#10241f',
    line: '#1e3a33',
    highlight: 'rgba(126, 217, 187, 0.2)',
    dark: true,
  },
  'royal-navy': {
    bg: '#f7f9fc',
    ink: '#12233d',
    muted: '#5a6d88',
    soft: '#eaeff6',
    line: '#d8e1ed',
    highlight: 'rgba(18, 35, 61, 0.1)',
    dark: false,
  },
  'oxford-crimson': {
    bg: '#fbf8f6',
    ink: '#2c1b1c',
    muted: '#7d6263',
    soft: '#f5ecea',
    line: '#ead9d6',
    highlight: 'rgba(120, 24, 32, 0.12)',
    dark: false,
  },
  'slate-professional': {
    bg: '#f6f7f9',
    ink: '#1f2937',
    muted: '#64748b',
    soft: '#eef1f5',
    line: '#dde3ea',
    highlight: 'rgba(31, 41, 55, 0.08)',
    dark: false,
  },
}

const THEME_NAMES: Record<ThemeId, string> = {
  'pure-snow': 'Pure Snow',
  'paper-ivory': 'Paper Ivory',
  'cool-alabaster': 'Cool Alabaster',
  'arctic-minimal': 'Arctic Minimal',
  'forest-sage': 'Forest Sage',
  'warm-sand': 'Warm Sand',
  'terracotta-clay': 'Terracotta Clay',
  'ocean-mist': 'Ocean Mist',
  'espresso-cream': 'Espresso Cream',
  'matcha-minimal': 'Matcha Minimal',
  'muted-lavender': 'Muted Lavender',
  'dusty-rose': 'Dusty Rose',
  'dark-executive': 'Dark Executive',
  'obsidian-gold': 'Obsidian Gold',
  'midnight-slate': 'Midnight Slate',
  'deep-emerald-night': 'Deep Emerald Night',
  'royal-navy': 'Royal Navy',
  'oxford-crimson': 'Oxford Crimson',
  'slate-professional': 'Slate Professional',
}

export const THEME_GROUPS: ThemeGroup[] = [
  {
    id: 'light',
    name: 'Snow & Crisp Light',
    blurb: 'Clean, high-legibility surfaces for study notes and handouts.',
    themes: ['pure-snow', 'paper-ivory', 'cool-alabaster', 'arctic-minimal'],
  },
  {
    id: 'natural',
    name: 'Natural & Organic',
    blurb: 'Warm earth and plant tones for wellness, geography and brands.',
    themes: ['forest-sage', 'warm-sand', 'terracotta-clay', 'ocean-mist'],
  },
  {
    id: 'aesthetic',
    name: 'Aesthetic & Editorial',
    blurb: 'Muted editorial palettes for magazines, eBooks and lead magnets.',
    themes: ['espresso-cream', 'matcha-minimal', 'muted-lavender', 'dusty-rose'],
  },
  {
    id: 'dark',
    name: 'Dark & Luxury',
    blurb: 'Full-bleed dark canvases with luminous type, print-safe.',
    themes: ['dark-executive', 'obsidian-gold', 'midnight-slate', 'deep-emerald-night'],
  },
  {
    id: 'corporate',
    name: 'Academic & Corporate',
    blurb: 'Institutional colour for reports, proposals and case studies.',
    themes: ['royal-navy', 'oxford-crimson', 'slate-professional'],
  },
]

export const ALL_THEME_IDS: ThemeId[] = THEME_GROUPS.flatMap((group) => group.themes)

export function themeName(id: ThemeId): string {
  return THEME_NAMES[id] ?? 'Pure Snow'
}

export function themeTokens(id: ThemeId): ThemeTokens {
  const base = THEMES[id] ?? THEMES['pure-snow']
  return {
    ...base,
    id: THEMES[id] ? id : 'pure-snow',
    name: THEME_NAMES[id] ?? 'Pure Snow',
    swatch: [base.bg, base.ink, base.soft, base.line],
  }
}

/** Body theme, or the cover theme when the user split them. */
export function themeFor(
  settings: Pick<AppSettings, 'themeId' | 'coverThemeId' | 'separateCoverTheme'>,
  surface: 'body' | 'cover',
): ThemeTokens {
  const id = surface === 'cover' && settings.separateCoverTheme ? settings.coverThemeId : settings.themeId
  return themeTokens(id)
}

export function isKnownTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in THEMES
}
