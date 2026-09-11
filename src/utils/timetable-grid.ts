import type { Occurrence, OccurrenceKind } from '@/api/types/timetable'
import type { RowSpan, SectionRow } from '@/utils/timetable'
import { clockOf, timeToMinutes } from '@/utils/timetable'

/*
 * Week-grid layout for the timetable page: row height fitted to the window, thin breaks between
 * sections, which occurrence is drawn when several overlap and how many lines of text fit in a block.
 * Pure functions without requests or UI. Sizes are rpx (750rpx = screen width).
 */

/* -------------------- Columns -------------------- */

/** Section axis on the left of the grid */
export const GRID_AXIS_WIDTH = 64
/** Side margin of the grid card (`mx-1`) */
export const GRID_CARD_MARGIN = 8
/** Width left for the day columns */
export const GRID_BODY_WIDTH = 750 - GRID_CARD_MARGIN * 2 - GRID_AXIS_WIDTH

/* -------------------- Rows -------------------- */

/** A section row is fitted to the window between these heights */
export const ROW_HEIGHT_MIN = 72
export const ROW_HEIGHT_MAX = 100
/** 宽松 density: a fixed, taller row that scrolls and leaves room for the teacher */
export const RELAXED_ROW_HEIGHT = 116
/** Thin band drawn for a long gap between sections (lunch, dinner) instead of a row */
export const BREAK_HEIGHT = 12
/** Gaps between two sections at least this long (minutes) get a band */
export const BREAK_MIN_GAP_MINUTES = 30

/**
 * Fixed heights on the timetable page around the section rows; keep in step with its template.
 * The calendar strip is always counted, so the rows keep their height from week to week.
 */
export const GRID_CHROME = {
  /** Sticky week header: py-2 + title line + subtitle line */
  header: 106,
  /** Calendar strip: mt-2 + one 40rpx line */
  strip: 56,
  /** Top margin of the grid card */
  cardTop: 16,
  /** Day header row: padding + 周X + date + calendar tag */
  dayHead: 92,
  /** Bottom action bar without the safe area: py-2 + icon + label */
  bottomBar: 118,
  /** Gap above the bar where the 回到本周 pill floats, so it never covers the last section */
  pill: 72,
} as const

export const GRID_CHROME_TOTAL = GRID_CHROME.header + GRID_CHROME.strip + GRID_CHROME.cardTop + GRID_CHROME.dayHead
  + GRID_CHROME.bottomBar + GRID_CHROME.pill

export interface RowFitInput {
  /** Window height in rpx (`windowHeight × 750 / windowWidth`; the native navigation bar is already excluded) */
  windowHeightRpx: number
  /** Bottom safe-area inset in rpx */
  safeBottomRpx: number
  sections: number
  breaks: number
}

/**
 * Height of one section row: the window height left after the page chrome, the bottom safe area and
 * the break bands, shared by the sections, clamped to [ROW_HEIGHT_MIN, ROW_HEIGHT_MAX].
 */
export function fitRowHeight(input: RowFitInput): number {
  const available = input.windowHeightRpx - input.safeBottomRpx - GRID_CHROME_TOTAL - input.breaks * BREAK_HEIGHT
  const fitted = Math.floor(available / Math.max(input.sections, 1))
  return Math.min(Math.max(fitted, ROW_HEIGHT_MIN), ROW_HEIGHT_MAX)
}

/** Row indexes k that have a band between row k − 1 and row k (a gap of BREAK_MIN_GAP_MINUTES or more) */
export function breakBoundaries(rows: SectionRow[]): number[] {
  const boundaries: number[] = []
  for (let index = 1; index < rows.length; index++) {
    if (timeToMinutes(rows[index].start) - timeToMinutes(rows[index - 1].end) >= BREAK_MIN_GAP_MINUTES)
      boundaries.push(index)
  }
  return boundaries
}

/** Clock rows before the section table (早间) or after it (晚间) */
export type ClockZone = 'early' | 'late'

export interface ZoneBoundary {
  /** Row index k: the zone band sits between row k − 1 and row k */
  index: number
  zone: ClockZone
}

/** Labels written on the zone bands, in the section axis only */
export const ZONE_LABELS: Record<ClockZone, string> = {
  early: '早间',
  late: '晚间',
}

/** Height (rpx) of a zone label; it overhangs the BREAK_HEIGHT band evenly above and below */
export const ZONE_LABEL_HEIGHT = 20

/**
 * Where the clock rows of weekGridRows() (`section: 0`) meet the section table: an early boundary at the
 * first section when clock rows come before it, a late boundary at the first clock row after the last
 * section. A week without clock rows has none.
 */
export function zoneBoundaries(rows: SectionRow[]): ZoneBoundary[] {
  const boundaries: ZoneBoundary[] = []
  for (let index = 1; index < rows.length; index++) {
    const sectionBefore = rows[index - 1].section > 0
    const sectionAfter = rows[index].section > 0
    if (!sectionBefore && sectionAfter)
      boundaries.push({ index, zone: 'early' })
    else if (sectionBefore && !sectionAfter)
      boundaries.push({ index, zone: 'late' })
  }
  return boundaries
}

/**
 * Every row index with a band above it, ascending: the lunch / dinner breaks and the 早间 / 晚间 zone edges.
 * Bands add height, not time, so rowOffset() with these keeps blocks at their real times.
 */
export function bandBoundaries(rows: SectionRow[]): number[] {
  const indexes = [...breakBoundaries(rows), ...zoneBoundaries(rows).map(boundary => boundary.index)]
  return Array.from(new Set(indexes)).sort((a, b) => a - b)
}

export interface GridMetrics {
  rowHeight: number
  /** From bandBoundaries (breakBoundaries when there are no clock rows) */
  breaks: number[]
}

/**
 * Vertical offset (rpx) of a row position (0 = top of the first section, may be fractional).
 * A top edge at a boundary sits below the band there; a bottom edge at a boundary stops above it.
 */
export function rowOffset(position: number, metrics: GridMetrics, edge: 'top' | 'bottom' = 'top'): number {
  const bands = metrics.breaks.filter(boundary => (edge === 'top' ? boundary <= position : boundary < position)).length
  return position * metrics.rowHeight + bands * BREAK_HEIGHT
}

/** Height of the whole grid body */
export function gridBodyHeight(rowCount: number, metrics: GridMetrics): number {
  return rowCount * metrics.rowHeight + metrics.breaks.length * BREAK_HEIGHT
}

/*
 * The section axis and the grid body both place bands, row lines and labels at absolute tops from these offsets,
 * never as a stack of row-high boxes: the runtime floors every rpx length to whole px on its own (74rpx → 38px at
 * 390px wide), so a stack loses the remainder on every row and drifts, while an absolute top is off by under 1px.
 */

/** Top (rpx) of the band above row `boundary` */
export function bandTop(boundary: number, metrics: GridMetrics): number {
  return rowOffset(boundary, metrics) - BREAK_HEIGHT
}

/** Top (rpx) of the 早间 / 晚间 label on the band above row `boundary`, overhanging the band evenly */
export function zoneLabelTop(boundary: number, metrics: GridMetrics): number {
  return bandTop(boundary, metrics) - (ZONE_LABEL_HEIGHT - BREAK_HEIGHT) / 2
}

/** Top (rpx) of the separator at the bottom of a row, above the band when one follows */
export function rowLineTop(rowIndex: number, metrics: GridMetrics): number {
  return rowOffset(rowIndex + 1, metrics, 'bottom') - 1
}

/* -------------------- Blocks -------------------- */

/** Space between neighbouring blocks, horizontally and vertically */
export const BLOCK_GAP = 4
export const BLOCK_PAD_Y = 4
export const BLOCK_PAD_LEFT = 4
export const BLOCK_PAD_RIGHT = 2
/** Horizontal room taken by the colour bar (4rpx on the left) or the frame (2rpx on each side) */
export const BLOCK_EDGE = 4
/** Course name: bold, at the design minimum size; the page's scoped styles use the same values */
export const TITLE_FONT = 22
export const TITLE_LINE = 28
/** Room and tag: smaller, and the first to go when the block is short */
export const ROOM_FONT = 20
export const ROOM_LINE = 26
/** Side of a one-character corner marker (旁 / 书 …) */
export const BLOCK_MARKER_SIZE = 26
/** Height of the "+N" chip in the bottom-right corner */
export const BLOCK_MORE_HEIGHT = 26
/** Blocks shorter than this many sections show the name only */
export const NAME_ONLY_BELOW_SECTIONS = 1.5

/** One-character corner markers per kind; school courses and custom entries carry none */
export const KIND_MARKERS: Partial<Record<OccurrenceKind, string>> = {
  college: '书',
  activity: '活',
  appoint: '约',
  exam: '考',
}

/* -------------------- Overlaps -------------------- */

/** Which kind is drawn when occurrences overlap: lower wins */
export const OVERLAP_PRIORITY: Record<OccurrenceKind, number> = {
  course: 0,
  college: 1,
  custom: 2,
  activity: 3,
  appoint: 4,
  exam: 5,
}

function durationMinutes(item: Occurrence): number {
  return timeToMinutes(clockOf(item.end)) - timeToMinutes(clockOf(item.start))
}

/** Order of overlapping occurrences: kind priority, then earlier start, then longer, then enrolled before audit */
export function compareOverlapPriority(a: Occurrence, b: Occurrence): number {
  return (OVERLAP_PRIORITY[a.kind] ?? 9) - (OVERLAP_PRIORITY[b.kind] ?? 9)
    || a.start.localeCompare(b.start)
    || durationMinutes(b) - durationMinutes(a)
    || Number(a.role === 'audit') - Number(b.role === 'audit')
}

export interface OverlapGroup {
  /** Drawn at full column width */
  primary: Occurrence
  span: RowSpan
  /** Covered by the primary, in priority order; reachable from the primary's detail sheet */
  others: Occurrence[]
}

/** Blocks that only touch (one ends where the next starts) do not overlap */
const OVERLAP_EPSILON = 0.01

export function spansOverlap(a: RowSpan, b: RowSpan): boolean {
  return a.top < b.top + b.span - OVERLAP_EPSILON && b.top < a.top + a.span - OVERLAP_EPSILON
}

/**
 * Collapse occurrences that overlap on the grid into one block per group. Within each day the
 * occurrences are visited in priority order: one that overlaps an already placed block joins the
 * first such block (the one with the highest priority), otherwise it becomes a block of its own.
 * Overlap is judged on grid rows, so items that share a row without sharing minutes still collapse.
 */
export function resolveOverlaps(items: Occurrence[], spanOf: (item: Occurrence) => RowSpan): OverlapGroup[] {
  const byDate = new Map<string, Occurrence[]>()
  for (const item of items) {
    const list = byDate.get(item.date)
    if (list)
      list.push(item)
    else
      byDate.set(item.date, [item])
  }
  const groups: OverlapGroup[] = []
  for (const dayItems of Array.from(byDate.values())) {
    const dayGroups: OverlapGroup[] = []
    for (const item of [...dayItems].sort(compareOverlapPriority)) {
      const span = spanOf(item)
      const host = dayGroups.find(group => spansOverlap(group.span, span))
      if (host)
        host.others.push(item)
      else
        dayGroups.push({ primary: item, span, others: [] })
    }
    groups.push(...dayGroups)
  }
  return groups
}

/* -------------------- Block text -------------------- */

/** Rough advance of one character in em: CJK and full-width forms are square, Latin is narrower */
export function charWidthEm(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code >= 0x2150)
    return 1
  if (char === ' ')
    return 0.3
  if (/[A-Z0-9]/.test(char))
    return 0.64
  return 0.56
}

/** Lines a `word-break: break-all` paragraph needs at `widthRpx`, its first line shortened by `indentRpx` */
export function estimateLines(text: string, widthRpx: number, fontRpx: number, indentRpx = 0): number {
  if (!text)
    return 0
  let lines = 1
  let used = indentRpx
  for (const char of text) {
    const advance = charWidthEm(char) * fontRpx
    if (used > 0 && used + advance > widthRpx + 0.5) {
      lines++
      used = 0
    }
    used += advance
  }
  return lines
}

export interface BlockTextInput {
  title: string
  room: string
  /** Shown in 宽松 blocks of two sections or more; '' otherwise */
  teacher: string
  tag: string
  /** Content box of the block, after border and padding */
  widthRpx: number
  heightRpx: number
  /** First-line indent that keeps the title clear of the corner markers */
  indentRpx: number
  /** Height of the "+N" chip, 0 without one; kept free only while two name lines still fit above it */
  moreRpx: number
  /** About one section tall: the name alone, clamped to the height */
  nameOnly: boolean
}

export interface BlockTextLayout {
  /** Line clamp of the name (TITLE_LINE each) */
  titleLines: number
  /** Room lines (ROOM_LINE each); 0 when the name leaves no room */
  roomLines: number
  /** 0 or 1 */
  teacherLines: number
  /** 0 or 1 */
  tagLines: number
}

/**
 * Share a block's height out in priority order: the name first (as many lines as it needs), then the
 * room (up to two lines), then the teacher and the tag (a line each). Lines still left go to the name's
 * clamp, so an underestimated
 * name ends in an ellipsis instead of pushing the room out of the block.
 */
export function layoutBlockText(input: BlockTextInput): BlockTextLayout {
  const reserveMore = input.moreRpx > 0 && input.heightRpx - input.moreRpx >= TITLE_LINE * 2
  const usable = reserveMore ? input.heightRpx - input.moreRpx : input.heightRpx
  const titleMax = Math.max(Math.floor(usable / TITLE_LINE), 1)
  if (input.nameOnly)
    return { titleLines: titleMax, roomLines: 0, teacherLines: 0, tagLines: 0 }
  const titleNeed = Math.max(estimateLines(input.title, input.widthRpx, TITLE_FONT, input.indentRpx), 1)
  const titleLines = Math.min(titleNeed, titleMax)
  let left = usable - titleLines * TITLE_LINE
  const roomLines = input.room
    ? Math.min(estimateLines(input.room, input.widthRpx, ROOM_FONT), Math.floor(left / ROOM_LINE), 2)
    : 0
  left -= roomLines * ROOM_LINE
  const teacherLines = input.teacher && left >= ROOM_LINE ? 1 : 0
  left -= teacherLines * ROOM_LINE
  const tagLines = input.tag && left >= ROOM_LINE ? 1 : 0
  left -= tagLines * ROOM_LINE
  return { titleLines: titleLines + Math.floor(left / TITLE_LINE), roomLines, teacherLines, tagLines }
}
