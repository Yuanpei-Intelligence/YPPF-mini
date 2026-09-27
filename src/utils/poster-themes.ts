import type { PaletteColor } from '@/utils/timetable'
import { PALETTE } from '@/utils/timetable'

/*
 * 课表海报的预设风格：每套的配色、字体与装饰，以及上次选择的本机记忆。
 * 只有数据与纯函数，不含 canvas 绘制（绘制在 pages-timetable/poster.vue）。
 */

export type PosterThemeKey = 'clean' | 'dark' | 'paper' | 'pop'

export const POSTER_THEME_KEYS: readonly PosterThemeKey[] = ['clean', 'dark', 'paper', 'pop']

/** 两段线性渐变：vertical 自上而下，diagonal 从左上到右下 */
export interface PosterGradient {
  from: string
  to: string
  direction: 'vertical' | 'diagonal'
}

/** 纯色或渐变 */
export type PosterFill = string | PosterGradient

export function isGradient(fill: PosterFill): fill is PosterGradient {
  return typeof fill !== 'string'
}

/** 格子上要打标的类别（学校课程与自定义条目不打标），与 utils/timetable 的 KIND_BADGES 对应 */
export type PosterBadgeKind = 'college' | 'activity' | 'appoint' | 'exam'

export const POSTER_BADGE_KINDS: readonly PosterBadgeKind[] = ['college', 'activity', 'appoint', 'exam']

export interface PosterTheme {
  key: PosterThemeKey
  /** 选择器上的名称与一句话说明 */
  labels: {
    name: string
    description: string
  }
  /** 选择器色样：[底色, 强调色] */
  swatch: [string, string]
  page: {
    background: PosterFill
    /** 底层装饰：dots 淡点阵，glow 标题后的柔光，band 标题后的斜向渐变色带 */
    decoration: 'none' | 'dots' | 'glow' | 'band'
    /** decoration 为 band 时的渐变 */
    band?: PosterGradient
  }
  card: {
    background: string
    border: string | null
    radius: number
    shadow: boolean
  }
  text: {
    primary: string
    secondary: string
    muted: string
    /** 强调色底上的文字 */
    onAccent: string
  }
  header: {
    accent: string
    headline: string
    subline: string
    headlineSize: number
    headlineWeight: 'normal' | 'bold'
    headlineFamily: string
  }
  grid: {
    line: string
    /** 今日列的底色（绘制时加透明度） */
    today: string
    /** 停课列（放假 / 停课复习考试）的底色 */
    suspended: string
    /** 左侧节次号 */
    section: string
  }
  block: {
    radius: number
    /** 格子左侧是否画一条前景色细条 */
    bar: boolean
  }
  /** 12 色课程色盘，下标与课表页 PALETTE 一致，同一门课在各风格里落在同一色位 */
  palette: PaletteColor[]
  /** 考试格子固定用色，不参与哈希取色（与课表页 EXAM_COLOR 同理） */
  exam: PaletteColor
  badges: Record<PosterBadgeKind, PaletteColor>
  legend: {
    text: string
    /** 图例色块取角标的底色还是文字色（白底角标的风格取文字色，否则在卡片上看不见） */
    badgeSwatch: 'bg' | 'fg'
  }
  footer: {
    divider: string
    slogan: string
    muted: string
    /** 二维码底板与描边：二维码要白底才好识别，深色风格也不例外 */
    tile: string
    tileBorder: string
    caption: string
  }
}

const SANS = 'sans-serif'
/** 有宋体就用宋体，没有（多数安卓机）退回默认无衬线 */
const SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif'

const clean: PosterTheme = {
  key: 'clean',
  labels: { name: '清爽', description: '白底蓝调，和课表页一样的配色' },
  swatch: ['#ffffff', '#2563eb'],
  page: { background: '#eef2f7', decoration: 'none' },
  card: { background: '#ffffff', border: null, radius: 18, shadow: true },
  text: { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8', onAccent: '#ffffff' },
  header: {
    accent: '#2563eb',
    headline: '#0f172a',
    subline: '#64748b',
    headlineSize: 26,
    headlineWeight: 'bold',
    headlineFamily: SANS,
  },
  grid: { line: '#e2e8f0', today: '#2563eb', suspended: '#f1f5f9', section: '#334155' },
  block: { radius: 6, bar: true },
  palette: PALETTE,
  exam: { bg: '#fee2e2', fg: '#b91c1c' },
  badges: {
    college: { bg: '#2563eb', fg: '#ffffff' },
    activity: { bg: '#059669', fg: '#ffffff' },
    appoint: { bg: '#d97706', fg: '#ffffff' },
    exam: { bg: '#dc2626', fg: '#ffffff' },
  },
  legend: { text: '#64748b', badgeSwatch: 'bg' },
  footer: {
    divider: '#e2e8f0',
    slogan: '#0f172a',
    muted: '#94a3b8',
    tile: '#ffffff',
    tileBorder: '#e2e8f0',
    caption: '#64748b',
  },
}

const dark: PosterTheme = {
  key: 'dark',
  labels: { name: '深夜', description: '深蓝夜色，柔和的粉彩色块' },
  swatch: ['#0b1220', '#7dd3fc'],
  page: { background: { from: '#0b1220', to: '#131c36', direction: 'vertical' }, decoration: 'glow' },
  card: { background: '#151f38', border: 'rgba(255, 255, 255, 0.08)', radius: 18, shadow: false },
  text: { primary: '#f1f5f9', secondary: '#cbd5e1', muted: '#64748b', onAccent: '#0b1220' },
  header: {
    accent: '#7dd3fc',
    headline: '#ffffff',
    subline: '#94a3b8',
    headlineSize: 26,
    headlineWeight: 'bold',
    headlineFamily: SANS,
  },
  grid: { line: '#243050', today: '#7dd3fc', suspended: '#1b2542', section: '#e2e8f0' },
  block: { radius: 6, bar: true },
  palette: [
    { bg: '#1e3a5f', fg: '#93c5fd' },
    { bg: '#14432f', fg: '#86efac' },
    { bg: '#4a3412', fg: '#fcd34d' },
    { bg: '#3b2a63', fg: '#c4b5fd' },
    { bg: '#4a1d3a', fg: '#f9a8d4' },
    { bg: '#134242', fg: '#5eead4' },
    { bg: '#4a2a14', fg: '#fdba74' },
    { bg: '#2a2f63', fg: '#a5b4fc' },
    { bg: '#2f4416', fg: '#bef264' },
    { bg: '#164a5c', fg: '#67e8f9' },
    { bg: '#4c1a2a', fg: '#fda4af' },
    { bg: '#334155', fg: '#cbd5e1' },
  ],
  exam: { bg: '#5b1d24', fg: '#fecaca' },
  badges: {
    college: { bg: '#7dd3fc', fg: '#0b1220' },
    activity: { bg: '#6ee7b7', fg: '#0b1220' },
    appoint: { bg: '#fcd34d', fg: '#0b1220' },
    exam: { bg: '#fda4af', fg: '#0b1220' },
  },
  legend: { text: '#94a3b8', badgeSwatch: 'bg' },
  footer: {
    divider: '#243050',
    slogan: '#f1f5f9',
    muted: '#64748b',
    tile: '#ffffff',
    tileBorder: '#ffffff',
    caption: '#94a3b8',
  },
}

const paper: PosterTheme = {
  key: 'paper',
  labels: { name: '暖纸', description: '米色纸感，暖棕墨色，宋体标题' },
  swatch: ['#f6efe3', '#8b5e34'],
  page: { background: '#f6efe3', decoration: 'dots' },
  card: { background: '#fffbf3', border: '#e6d8c3', radius: 10, shadow: false },
  text: { primary: '#3f2e1e', secondary: '#6b5744', muted: '#a89680', onAccent: '#fffbf3' },
  header: {
    accent: '#8b5e34',
    headline: '#3b2a1a',
    subline: '#8b7355',
    headlineSize: 26,
    headlineWeight: 'bold',
    headlineFamily: SERIF,
  },
  grid: { line: '#eadfcd', today: '#8b5e34', suspended: '#f1e8da', section: '#5a4632' },
  block: { radius: 4, bar: true },
  palette: [
    { bg: '#e9dcc9', fg: '#5c3d1e' },
    { bg: '#dfe5d0', fg: '#3f5a2a' },
    { bg: '#f3e2c0', fg: '#7a5410' },
    { bg: '#e6dbe6', fg: '#5a3a5c' },
    { bg: '#f1d9d6', fg: '#8a3f3f' },
    { bg: '#d9e5e0', fg: '#2f5c52' },
    { bg: '#f0d7c2', fg: '#8a4a24' },
    { bg: '#dcdfe9', fg: '#3e4a6e' },
    { bg: '#e6e8cf', fg: '#5a6220' },
    { bg: '#d9e3e8', fg: '#2d5566' },
    { bg: '#eed8cf', fg: '#8a4a3a' },
    { bg: '#e4dfd7', fg: '#4f4a44' },
  ],
  exam: { bg: '#f0d0cc', fg: '#8a2f2f' },
  badges: {
    college: { bg: '#5c3d1e', fg: '#fffbf3' },
    activity: { bg: '#3f5a2a', fg: '#fffbf3' },
    appoint: { bg: '#8a4a24', fg: '#fffbf3' },
    exam: { bg: '#8a2f2f', fg: '#fffbf3' },
  },
  legend: { text: '#8b7355', badgeSwatch: 'bg' },
  footer: {
    divider: '#e6d8c3',
    slogan: '#3f2e1e',
    muted: '#a89680',
    tile: '#ffffff',
    tileBorder: '#e6d8c3',
    caption: '#8b7355',
  },
}

const pop: PosterTheme = {
  key: 'pop',
  labels: { name: '活力', description: '珊瑚橙渐变标题，饱和大圆角色块' },
  swatch: ['#fff4e8', '#ff5e62'],
  page: {
    background: '#fff4e8',
    decoration: 'band',
    band: { from: '#ff5e62', to: '#ff9966', direction: 'diagonal' },
  },
  card: { background: '#ffffff', border: null, radius: 22, shadow: true },
  text: { primary: '#1f1b2e', secondary: '#4b4560', muted: '#9a94ad', onAccent: '#ffffff' },
  header: {
    accent: '#ff5e62',
    headline: '#ffffff',
    subline: '#ffe9e0',
    headlineSize: 30,
    headlineWeight: 'bold',
    headlineFamily: SANS,
  },
  grid: { line: '#f1ede8', today: '#ff6b3d', suspended: '#f7f3ee', section: '#1f1b2e' },
  block: { radius: 10, bar: false },
  palette: [
    { bg: '#ff6b6b', fg: '#ffffff' },
    { bg: '#20c997', fg: '#ffffff' },
    { bg: '#ffa94d', fg: '#4a2600' },
    { bg: '#845ef7', fg: '#ffffff' },
    { bg: '#f06595', fg: '#ffffff' },
    { bg: '#22b8cf', fg: '#ffffff' },
    { bg: '#ff922b', fg: '#ffffff' },
    { bg: '#5c7cfa', fg: '#ffffff' },
    { bg: '#94d82d', fg: '#1f3a00' },
    { bg: '#15aabf', fg: '#ffffff' },
    { bg: '#ff8787', fg: '#ffffff' },
    { bg: '#fcc419', fg: '#4a3400' },
  ],
  exam: { bg: '#e03131', fg: '#ffffff' },
  badges: {
    college: { bg: '#ffffff', fg: '#3b5bdb' },
    activity: { bg: '#ffffff', fg: '#0ca678' },
    appoint: { bg: '#ffffff', fg: '#f08c00' },
    exam: { bg: '#ffffff', fg: '#e03131' },
  },
  legend: { text: '#6b6480', badgeSwatch: 'fg' },
  footer: {
    divider: '#f1ede8',
    slogan: '#1f1b2e',
    muted: '#9a94ad',
    tile: '#ffffff',
    tileBorder: '#f1ede8',
    caption: '#6b6480',
  },
}

export const POSTER_THEMES: Record<PosterThemeKey, PosterTheme> = { clean, dark, paper, pop }

export const DEFAULT_POSTER_THEME: PosterThemeKey = 'clean'

/* -------------------- 取色 -------------------- */

/** 与 utils/timetable 的 colorFor 同一个 djb2 哈希，配合 12 色模数保证同一门课在海报与课表页同色位 */
function hashString(text: string): number {
  let hash = 5381
  for (let i = 0; i < text.length; i++)
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return hash
}

export interface BlockColorSource {
  kind: string
  color_key: string
  title: string
}

/** 某个日程在指定风格下的格子颜色；考试固定用风格的考试色 */
export function blockColorFor(theme: PosterTheme, occurrence: BlockColorSource): PaletteColor {
  if (occurrence.kind === 'exam')
    return theme.exam
  const key = occurrence.color_key || occurrence.title || ''
  return theme.palette[hashString(key) % theme.palette.length]
}

/** `#rgb` / `#rrggbb` 加透明度成 `rgba(...)`；其它写法（已是 rgba 等）原样返回 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  const parts = short
    ? short.slice(1).map(part => Number.parseInt(part + part, 16))
    : long
      ? long.slice(1).map(part => Number.parseInt(part, 16))
      : null
  if (!parts)
    return color
  const clamped = Math.min(Math.max(alpha, 0), 1)
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamped})`
}

/* -------------------- 本机记忆 -------------------- */

const POSTER_THEME_KEY = 'timetable_poster_theme'

export function isPosterThemeKey(value: unknown): value is PosterThemeKey {
  return typeof value === 'string' && (POSTER_THEME_KEYS as readonly string[]).includes(value)
}

/** 上次选的风格；没有或值不合法时为 null */
export function readPosterTheme(): PosterThemeKey | null {
  try {
    const value = uni.getStorageSync(POSTER_THEME_KEY)
    return isPosterThemeKey(value) ? value : null
  }
  catch {
    return null
  }
}

export function savePosterTheme(key: PosterThemeKey) {
  try {
    uni.setStorageSync(POSTER_THEME_KEY, key)
  }
  catch (error) {
    console.error('写入海报风格失败:', error)
  }
}
