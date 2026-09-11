import type { OverviewExam, OverviewSlot } from '@/api/types/timetable'
import type { SectionRow } from '@/utils/timetable'
import {
  AUDIT_BADGE,
  chineseDate,
  clockOf,
  describeSections,
  displayClock,
  displayEndClock,
  KIND_BADGES,
  minutesToRowPosition,
  spanMinutes,
  timeToMinutes,
  timeToRowPosition,
  WEEKDAY_LABELS,
  weekdayOf,
} from '@/utils/timetable'
import { breakBoundaries } from '@/utils/timetable-grid'

/*
 * 整学期课表海报的排版计算：列、同一时段的课怎样堆叠、文字折行、行高与课间分隔、考试安排的文案。
 * 行（节次与节次表之外的钟点行）由 utils/timetable 的 weekGridRows 给出，与课表页同一套时间轴。
 * 只算位置不画图（绘制在 pages-timetable/poster.vue）。文字宽度由调用方传入的 measure 给出，
 * 排版与绘制用同一个 canvas 的字体度量，量得下的就画得下。
 */

export interface PosterFont {
  size: number
  weight: 'normal' | 'bold'
}

/** 用 font 量出 text 的宽度（逻辑像素） */
export type MeasureText = (text: string, font: PosterFont) => number

function compareText(a: string, b: string): number {
  if (a === b)
    return 0
  return a < b ? -1 : 1
}

/* -------------------- 折行 -------------------- */

/** 不放在行首的标点（闭括号与句读）：换行时带上前一个词或字 */
const NO_LINE_START = new Set(Array.from('）)]】」』》〉，。、；：！？,.;:!?%'))
/** 不放在行尾的标点（开括号）：换行时跟下一个词或字走 */
const NO_LINE_END = new Set(Array.from('（([【「『《〈'))
const BLANK_RE = /^\s+$/
/**
 * 折行单位：连续的字母、数字与常见连接符算一个词，空白算一段，其余（汉字、标点）逐字（代理对算一个字）。
 * 工程编译目标是 ES5，正则不能用 u 标志
 */
const TOKEN_RE = /[\w'’+#.-]+|\s+|[\uD800-\uDBFF][\uDC00-\uDFFF]|\S/g
/** 只在空白与逗号后折行的折行单位（周次文字：`1-15周 单周`、`1-8,10-16周`） */
const WORD_TOKEN_RE = /[^\s,，]+[,，]?|[,，]|\s+/g
/** 一个词比整行还宽时先在词内的连接符后拆（`13:30–` `14:30`、`Science-` `Building`） */
const PUNCTUATION_PIECE_RE = /[^–.'’+#-]+[–.'’+#-]*|[–.'’+#-]+/g
const LATIN_LETTER_RE = /^[a-z]$/i

/** chars：汉字逐字、西文按词折行（课程名、地点、教师）；words：只在空白与逗号处折行（周次） */
export type WrapMode = 'chars' | 'words'

/** 换行处的避头尾：行首不留闭括号与句读、行尾不留开括号，最多把行尾两个词（字）带到下一行，带过去放不下就不带 */
function carryTokens(line: string[], token: string, maxWidth: number, measure: (value: string) => number) {
  const kept = [...line]
  while (kept.length && BLANK_RE.test(kept[kept.length - 1]))
    kept.pop()
  const next = [token]
  let moved = 0
  while (kept.length > 1 && moved < 2) {
    const last = kept[kept.length - 1]
    const lastChar = Array.from(last).pop() ?? ''
    if (!NO_LINE_START.has(Array.from(next[0])[0]) && !NO_LINE_END.has(lastChar))
      break
    if (measure(last + next.join('')) > maxWidth)
      break
    kept.pop()
    next.unshift(last)
    moved++
  }
  return { kept, next }
}

/**
 * 把比整行还宽的一个词硬断成几段，每段尽量填满一行，在两个字母之间断开时补连字符。
 * 前几段各占一整行，最后一段是剩下的部分，后面的词可以接着排。
 */
function hardBreak(word: string, maxWidth: number, measure: (value: string) => number): string[] {
  const chars = Array.from(word)
  const pieces: string[] = []
  let head = ''
  chars.forEach((char, index) => {
    const joinsNext = index + 1 < chars.length && LATIN_LETTER_RE.test(char) && LATIN_LETTER_RE.test(chars[index + 1])
    if (!head || measure(head + char + (joinsNext ? '-' : '')) <= maxWidth) {
      head += char
      return
    }
    const splitsLetters = LATIN_LETTER_RE.test(head.slice(-1)) && LATIN_LETTER_RE.test(char)
    pieces.push(splitsLetters ? `${head}-` : head)
    head = char
  })
  pieces.push(head)
  return pieces
}

/**
 * 按宽度把 text 折成多行，不截断、不加省略号。汉字可在任意两字之间断开，西文词和数字只在空白或标点处断开；
 * 只有一个词本身比整行还宽时才在词内硬断，并且从新的一行开始，不把词头挤到上一行末尾。
 */
export function wrapLines(text: string, maxWidth: number, measure: (value: string) => number, mode: WrapMode = 'chars'): string[] {
  const tokens = text.trim().match(mode === 'words' ? WORD_TOKEN_RE : TOKEN_RE) ?? []
  const lines: string[] = []
  let line: string[] = []
  const flush = () => {
    const value = line.join('').trimEnd()
    if (value)
      lines.push(value)
    line = []
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const blank = BLANK_RE.test(token)
    if (!line.length && blank)
      continue
    if (measure(line.join('') + token) <= maxWidth) {
      line.push(token)
      continue
    }
    if (blank) {
      flush()
      continue
    }
    if (Array.from(token).length > 1 && measure(token) > maxWidth) {
      const pieces = token.match(PUNCTUATION_PIECE_RE) ?? []
      if (pieces.length > 1) {
        tokens.splice(index, 1, ...pieces)
        index--
        continue
      }
      flush()
      const broken = hardBreak(token, maxWidth, measure)
      lines.push(...broken.slice(0, -1))
      line = [broken[broken.length - 1]]
      continue
    }
    if (!line.length) {
      lines.push(token)
      continue
    }
    const carried = carryTokens(line, token, maxWidth, measure)
    line = carried.kept
    flush()
    line = carried.next
  }
  flush()
  return lines
}

/* -------------------- 网格 -------------------- */

export interface TermGridMetrics {
  title: PosterFont
  meta: PosterFont
  pill: PosterFont
  titleLineHeight: number
  metaLineHeight: number
  pillHeight: number
  pillPadX: number
  pillGap: number
  /** 格子与网格线之间的空隙 */
  inset: number
  /** 同一时段里上下相邻两块之间的空隙 */
  stackGap: number
  padTop: number
  padBottom: number
  /** 文字左内边距：有色条的风格要让出色条 */
  padLeft: number
  padRight: number
  /** 没有课的行（含钟点行）收成的细条高度，仍写节次号或时刻 */
  stripRowHeight: number
  /** 午休、晚饭等较长课间的分隔带高度 */
  breakHeight: number
}

/** 格子的字号与间距（逻辑像素） */
export function termGridMetrics(bar = true): TermGridMetrics {
  return {
    title: { size: 14, weight: 'bold' },
    meta: { size: 12, weight: 'normal' },
    pill: { size: 10, weight: 'bold' },
    titleLineHeight: 18,
    metaLineHeight: 16,
    pillHeight: 14,
    pillPadX: 5,
    pillGap: 4,
    inset: 2.5,
    stackGap: 3,
    padTop: 6,
    padBottom: 6,
    padLeft: bar ? 11 : 7,
    padRight: 5,
    stripRowHeight: 20,
    breakHeight: 14,
  }
}

export type TermLineRole = 'title' | 'location' | 'weeks' | 'teacher'

export interface TermTextLine {
  text: string
  role: TermLineRole
  /** 文字顶端相对格子顶边的位置（textBaseline = top） */
  offsetY: number
}

export type TermPillKind = 'college' | 'audit'

/** 格子里的小标：书院课角标、旁听的「旁」 */
export interface TermPill {
  kind: TermPillKind
  text: string
  /** 相对文字左边缘 */
  offsetX: number
  /** 相对格子顶边 */
  offsetY: number
  width: number
}

export interface TermPart {
  slot: OverviewSlot
  lines: TermTextLine[]
  pills: TermPill[]
  /** 内容需要的高度 */
  contentHeight: number
  /** 相对网格顶边的位置与最终高度（同一时段里多出的空间平分给各块） */
  y: number
  height: number
}

/** 同一列里时间有重叠的一组时段，自上而下堆叠在它们合起来的行区间里 */
export interface TermCluster {
  /** 列下标，对应 TermGrid.weekdays */
  column: number
  /** 行区间 [top, bottom) */
  top: number
  bottom: number
  parts: TermPart[]
}

/**
 * 较长的课间（午休、晚饭）画成一条细分隔带，位于第 before 行之前（与 timetable-grid 的 breakBoundaries 同义）。
 * 位置由前后两行的时刻算出，前后补的钟点行不会让它错位。
 */
export interface TermBreak {
  before: number
  label: string
  /** 上一行结束与这一行开始的时刻 */
  start: string
  end: string
  /** 相对网格顶边 */
  y: number
  height: number
}

export interface TermGrid {
  /** 各列的星期（1=周一 … 7=周日） */
  weekdays: number[]
  colWidth: number
  /** 文字相对列左边缘的偏移与可用宽度 */
  textLeft: number
  textWidth: number
  rowHeights: number[]
  /** 各行顶边相对网格顶边的位置（分隔带夹在行与行之间） */
  rowTops: number[]
  breaks: TermBreak[]
  height: number
  clusters: TermCluster[]
  metrics: TermGridMetrics
}

export interface TermGridInput {
  /** 网格宽度（不含左侧节次列） */
  width: number
  /** weekGridRows 给出的行：节次表，外加 section 为 0 的钟点行 */
  rows: SectionRow[]
  slots: OverviewSlot[]
  showTeacher: boolean
  /** 当前风格的格子左侧有没有色条 */
  bar: boolean
  /** 隐藏周末；只在周末没有课时生效 */
  hideWeekend: boolean
}

export function hasWeekendSlots(slots: Pick<OverviewSlot, 'weekday'>[]): boolean {
  return slots.some(slot => slot.weekday === 6 || slot.weekday === 7)
}

/** 列：默认周一到周日七列；周末没有课、且选了隐藏周末时只画周一到周五 */
export function termWeekdays(slots: Pick<OverviewSlot, 'weekday'>[], hideWeekend = false): number[] {
  const weekdays = [1, 2, 3, 4, 5, 6, 7]
  return hideWeekend && !hasWeekendSlots(slots) ? weekdays.slice(0, 5) : weekdays
}

function breakLabel(minutes: number): string {
  if (minutes >= 11 * 60 && minutes < 15 * 60)
    return '午休'
  if (minutes >= 16 * 60 && minutes < 20 * 60)
    return '晚饭'
  return '休息'
}

/**
 * 时段占据的整行区间 [top, bottom)：有节次按节次（与课表页的 occurrenceRowSpan 一致）；没有节次（按时刻记录的
 * 自定义日程）的按时刻向外取整到整行，跨过午夜的算到 24:00，起止相同的在开始处占一行。
 */
export function slotRowRange(
  slot: Pick<OverviewSlot, 'start' | 'end' | 'start_section' | 'end_section'>,
  rows: SectionRow[],
): { top: number, bottom: number } {
  const count = Math.max(rows.length, 1)
  const startSection = slot.start_section
  const endSection = slot.end_section
  let top: number
  let bottom: number
  if (startSection && endSection && startSection > 0 && endSection >= startSection) {
    const first = Math.max(rows.findIndex(row => row.section > 0), 0)
    const startIndex = rows.findIndex(row => row.section === startSection)
    const endIndex = rows.findIndex(row => row.section === endSection)
    top = startIndex >= 0 ? startIndex : first + startSection - 1
    bottom = endIndex >= 0 ? endIndex + 1 : first + endSection
  }
  else {
    const minutes = spanMinutes(slot.start, slot.end)
    top = Math.floor(minutes ? minutesToRowPosition(minutes.start, rows) : timeToRowPosition(slot.start, rows))
    bottom = minutes ? Math.ceil(minutesToRowPosition(minutes.end, rows)) : top + 1
  }
  top = Math.min(Math.max(top, 0), count - 1)
  bottom = Math.min(Math.max(bottom, top + 1), count)
  return { top, bottom }
}

interface PlacedSlot {
  slot: OverviewSlot
  top: number
  bottom: number
}

/** 已选在前、书院课居中、旁听在后 */
const ROLE_ORDER: Record<string, number> = { enrolled: 0, audit: 2 }

/** 组内自上而下的顺序：先按起始行与时间，再每周 → 单周 → 双周，再已选 → 旁听 */
function compareSlots(a: PlacedSlot, b: PlacedSlot): number {
  return a.top - b.top
    || a.bottom - b.bottom
    || timeToMinutes(clockOf(a.slot.start)) - timeToMinutes(clockOf(b.slot.start))
    || a.slot.parity - b.slot.parity
    || (ROLE_ORDER[a.slot.role] ?? 1) - (ROLE_ORDER[b.slot.role] ?? 1)
    || (a.slot.weeks[0] ?? 0) - (b.slot.weeks[0] ?? 0)
    || compareText(a.slot.title, b.slot.title)
}

/** 同一列里按起始行扫描，与当前组下边界重叠的并入该组 */
function groupOverlapping(items: PlacedSlot[]): PlacedSlot[][] {
  const groups: PlacedSlot[][] = []
  let bottom = -1
  for (const item of [...items].sort(compareSlots)) {
    const current = groups[groups.length - 1]
    if (current && item.top < bottom) {
      current.push(item)
      bottom = Math.max(bottom, item.bottom)
    }
    else {
      groups.push([item])
      bottom = item.bottom
    }
  }
  return groups
}

/** 组内起止不一致时每块补上自己的节次（没有节次写时刻，23:59 与跨过午夜的写成 24:00），否则看不出谁先谁后 */
function slotTimeLabel(slot: OverviewSlot): string {
  return describeSections(slot.start_section, slot.end_section) || `${displayClock(slot.start)}–${displayEndClock(slot)}`
}

interface PartContext {
  metrics: TermGridMetrics
  textWidth: number
  showTeacher: boolean
  measure: MeasureText
}

function pillsOf(slot: OverviewSlot): { kind: TermPillKind, text: string }[] {
  const pills: { kind: TermPillKind, text: string }[] = []
  if (slot.kind === 'college' && KIND_BADGES.college)
    pills.push({ kind: 'college', text: KIND_BADGES.college })
  if (slot.role === 'audit')
    pills.push({ kind: 'audit', text: AUDIT_BADGE })
  return pills
}

/** 小标接在最后一行文字后面，放不下就另起一行（再放不下继续换行） */
function placePills(slot: OverviewSlot, lines: TermTextLine[], cursor: number, context: PartContext) {
  const { metrics, textWidth, measure } = context
  const specs = pillsOf(slot)
  const pills: TermPill[] = []
  if (!specs.length)
    return { pills, cursor }
  const widths = specs.map(spec => measure(spec.text, metrics.pill) + metrics.pillPadX * 2)
  const pillLine = Math.max(metrics.metaLineHeight, metrics.pillHeight + 2)
  const last = lines[lines.length - 1]
  const lastIsTitle = last?.role === 'title'
  const lastWidth = last ? measure(last.text, lastIsTitle ? metrics.title : metrics.meta) : 0
  const lead = metrics.pillGap * 1.5
  let x = 0
  let lineHeight = pillLine
  let lineTop = cursor
  if (last && lastWidth + lead + widths[0] <= textWidth) {
    x = lastWidth + lead
    lineHeight = lastIsTitle ? metrics.titleLineHeight : metrics.metaLineHeight
    lineTop = cursor - lineHeight
  }
  else {
    cursor += pillLine
  }
  specs.forEach((spec, index) => {
    if (x > 0 && x + widths[index] > textWidth) {
      x = 0
      lineHeight = pillLine
      lineTop = cursor
      cursor += pillLine
    }
    pills.push({ ...spec, offsetX: x, offsetY: lineTop + (lineHeight - metrics.pillHeight) / 2, width: widths[index] })
    x += widths[index] + metrics.pillGap
  })
  return { pills, cursor }
}

/** 一块格子的内容：课程名、地点、周次（堆叠时附节次）、教师，全部完整折行 */
function layoutPart(slot: OverviewSlot, timeLabel: string, context: PartContext): TermPart {
  const { metrics, textWidth, showTeacher, measure } = context
  const lines: TermTextLine[] = []
  let cursor = metrics.padTop
  const add = (text: string, role: TermLineRole, mode: WrapMode = 'chars') => {
    const font = role === 'title' ? metrics.title : metrics.meta
    const lineHeight = role === 'title' ? metrics.titleLineHeight : metrics.metaLineHeight
    for (const value of wrapLines(text, textWidth, part => measure(part, font), mode)) {
      lines.push({ text: value, role, offsetY: cursor + (lineHeight - font.size) / 2 })
      cursor += lineHeight
    }
  }
  add((slot.title || '').trim() || '未命名课程', 'title')
  if ((slot.location || '').trim())
    add(slot.location, 'location')
  // 周次不在「单周」「10-16周」中间断开；堆叠时的节次另起一行
  if ((slot.weeks_text || '').trim())
    add(slot.weeks_text, 'weeks', 'words')
  if (timeLabel)
    add(timeLabel, 'weeks', 'words')
  if (showTeacher && (slot.subtitle || '').trim())
    add(slot.subtitle, 'teacher')
  const placed = placePills(slot, lines, cursor, context)
  return { slot, lines, pills: placed.pills, contentHeight: placed.cursor + metrics.padBottom, y: 0, height: 0 }
}

/** 一组放下所有块需要的总高度（含块间空隙与上下与网格线的空隙） */
function clusterNeed(cluster: TermCluster, metrics: TermGridMetrics): number {
  const content = cluster.parts.reduce((sum, part) => sum + part.contentHeight, 0)
  return content + metrics.stackGap * (cluster.parts.length - 1) + metrics.inset * 2
}

/** 行区间 [top, bottom) 的总高度，含夹在其中的分隔带（gapBefore[k] 是第 k 行之前的分隔带高度） */
function spanHeight(heights: number[], gapBefore: number[], top: number, bottom: number): number {
  let total = 0
  for (let row = top; row < bottom; row++) {
    total += heights[row]
    if (row > top)
      total += gapBefore[row]
  }
  return total
}

interface ClusterNeed {
  cluster: TermCluster
  need: number
}

/** 逐行收回所有覆盖这一行的组都用不上的高度；whole 为 true 时只收整像素，行高保持整数 */
function trimSlack(heights: number[], needs: ClusterNeed[], gapBefore: number[], metrics: TermGridMetrics, whole = false) {
  for (let row = 0; row < heights.length; row++) {
    let surplus = heights[row] - metrics.stripRowHeight
    for (const { cluster, need } of needs) {
      if (cluster.top <= row && row < cluster.bottom)
        surplus = Math.min(surplus, spanHeight(heights, gapBefore, cluster.top, cluster.bottom) - need)
    }
    if (whole)
      surplus = Math.floor(surplus + 1e-6)
    if (surplus > 0)
      heights[row] -= surplus
  }
}

/**
 * 行高按内容定，整张图尽量矮：
 * 1. 每行先是细条；跨行少的组先定，放不下时把缺的高度平均加到它占的各行；
 * 2. 平分会让同一行里别的组多出空白：逐行收回所有覆盖它的组都用不上的高度；
 * 3. 行高向上取整后，跨多行的组会攒下几像素空白，再按整像素收一遍。
 * 没有课的行（包括钟点行）始终是细条。
 */
function fitRowHeights(clusters: TermCluster[], rowCount: number, gapBefore: number[], metrics: TermGridMetrics): number[] {
  const heights = Array.from({ length: rowCount }, () => metrics.stripRowHeight)
  const needs: ClusterNeed[] = clusters.map(cluster => ({ cluster, need: clusterNeed(cluster, metrics) }))
  const ordered = [...needs].sort((a, b) =>
    (a.cluster.bottom - a.cluster.top) - (b.cluster.bottom - b.cluster.top) || b.need - a.need)
  for (const { cluster, need } of ordered) {
    const have = spanHeight(heights, gapBefore, cluster.top, cluster.bottom)
    if (have >= need)
      continue
    const extra = (need - have) / (cluster.bottom - cluster.top)
    for (let row = cluster.top; row < cluster.bottom; row++)
      heights[row] += extra
  }
  trimSlack(heights, needs, gapBefore, metrics)
  const rounded = heights.map(height => Math.ceil(height - 1e-6))
  trimSlack(rounded, needs, gapBefore, metrics, true)
  return rounded
}

/**
 * 把组内各块自上而下排进行区间，多出的高度平分给每块。
 * 跨过午休 / 晚饭分隔带的时段（如 4–5 节连上）有意画成连续的一整块、盖在分隔带上，不在分隔带处断开。
 */
function stackParts(cluster: TermCluster, rowTops: number[], rowHeights: number[], metrics: TermGridMetrics) {
  const top = rowTops[cluster.top] + metrics.inset
  const bottom = rowTops[cluster.bottom - 1] + rowHeights[cluster.bottom - 1] - metrics.inset
  const need = clusterNeed(cluster, metrics) - metrics.inset * 2
  const extra = Math.max(bottom - top - need, 0) / cluster.parts.length
  let y = top
  for (const part of cluster.parts) {
    part.y = y
    part.height = part.contentHeight + extra
    y += part.height + metrics.stackGap
  }
}

/** 整学期网格：列、每组时段的堆叠、行高与课间分隔 */
export function layoutTermGrid(input: TermGridInput, measure: MeasureText): TermGrid {
  const metrics = termGridMetrics(input.bar)
  const weekdays = termWeekdays(input.slots, input.hideWeekend)
  const colWidth = input.width / weekdays.length
  const textLeft = metrics.inset + metrics.padLeft
  const textWidth = Math.max(colWidth - textLeft - metrics.inset - metrics.padRight, 1)
  const context: PartContext = { metrics, textWidth, showTeacher: input.showTeacher, measure }
  const rowCount = Math.max(input.rows.length, 1)

  const clusters: TermCluster[] = []
  weekdays.forEach((weekday, column) => {
    const placed = input.slots
      .filter(slot => slot.weekday === weekday)
      .map(slot => ({ slot, ...slotRowRange(slot, input.rows) }))
    for (const group of groupOverlapping(placed)) {
      const first = group[0].slot
      const mixed = group.some(({ slot }) => slot.start !== first.start
        || slot.end !== first.end
        || slot.start_section !== first.start_section
        || slot.end_section !== first.end_section)
      clusters.push({
        column,
        top: Math.min(...group.map(item => item.top)),
        bottom: Math.max(...group.map(item => item.bottom)),
        parts: group.map(({ slot }) => layoutPart(slot, mixed ? slotTimeLabel(slot) : '', context)),
      })
    }
  })

  // 分隔带与课表页同一规则（breakBoundaries：前后两行的时刻相差不少于 30 分钟），下标 k 表示第 k 行之前
  const boundaries = breakBoundaries(input.rows)
  const gapBefore = Array.from({ length: rowCount }, () => 0)
  for (const index of boundaries)
    gapBefore[index] = metrics.breakHeight
  const rowHeights = fitRowHeights(clusters, rowCount, gapBefore, metrics)
  const rowTops: number[] = []
  let height = 0
  rowHeights.forEach((rowHeight, row) => {
    height += gapBefore[row]
    rowTops.push(height)
    height += rowHeight
  })
  const breaks: TermBreak[] = boundaries.map(index => ({
    before: index,
    label: breakLabel(timeToMinutes(input.rows[index - 1].end)),
    start: input.rows[index - 1].end,
    end: input.rows[index].start,
    y: rowTops[index] - metrics.breakHeight,
    height: metrics.breakHeight,
  }))
  for (const cluster of clusters)
    stackParts(cluster, rowTops, rowHeights, metrics)
  return { weekdays, colWidth, textLeft, textWidth, rowHeights, rowTops, breaks, height, clusters, metrics }
}

/* -------------------- 考试安排 -------------------- */

/** `08:30` -> 上午；12 点前上午，18 点前下午，其余晚上 */
export function dayPeriod(time: string): string {
  const minutes = timeToMinutes(clockOf(time))
  if (minutes < 12 * 60)
    return '上午'
  if (minutes < 18 * 60)
    return '下午'
  return '晚上'
}

/** 考试的日期、时段与地点：`1月8日 周五 · 上午 08:30–10:30 · 理教 201`；时间未知写「时间待定」 */
export function describeExam(exam: OverviewExam): string {
  const parts: string[] = []
  if (exam.date) {
    const weekday = weekdayOf(exam.date)
    parts.push(weekday ? `${chineseDate(exam.date)} 周${WEEKDAY_LABELS[weekday - 1]}` : exam.date)
  }
  if (exam.start) {
    // 结束于 23:59 的与网格一样写成 24:00
    const end = exam.end ? displayEndClock({ start: exam.start, end: exam.end }) : ''
    parts.push(`${dayPeriod(exam.start)} ${exam.start}${end ? `–${end}` : ''}`)
  }
  if (!parts.length)
    parts.push('时间待定')
  if ((exam.location || '').trim())
    parts.push(exam.location.trim())
  return parts.join(' · ')
}

export interface ExamRow {
  exam: OverviewExam
  titleLines: string[]
  detailLines: string[]
  /** 相对列表顶边 */
  y: number
  height: number
}

export interface ExamListLayout {
  rows: ExamRow[]
  height: number
  titleFont: PosterFont
  detailFont: PosterFont
  lineHeight: number
  /** 详情列相对列表左边缘的偏移 */
  detailX: number
}

/** 左列考试名称占的宽度比例 */
const EXAM_TITLE_RATIO = 0.4
const EXAM_COLUMN_GAP = 12
const EXAM_ROW_GAP = 5
const EXAM_TITLE_FONT: PosterFont = { size: 12, weight: 'bold' }
const EXAM_DETAIL_FONT: PosterFont = { size: 12, weight: 'normal' }
const EXAM_LINE_HEIGHT = 17

/** 按日期、开始时间排；没有日期的排最后 */
function compareExams(a: OverviewExam, b: OverviewExam): number {
  return compareText(a.date || '9999-99-99', b.date || '9999-99-99')
    || compareText(a.start || '99:99', b.start || '99:99')
    || compareText(a.title, b.title)
}

/** 两列表格：左列考试名称，右列日期时段地点，各自完整折行 */
export function layoutExamList(width: number, exams: OverviewExam[], measure: MeasureText): ExamListLayout {
  const titleWidth = Math.floor(width * EXAM_TITLE_RATIO)
  const detailX = titleWidth + EXAM_COLUMN_GAP
  const detailWidth = Math.max(width - detailX, 1)
  let y = 0
  const rows = [...exams].sort(compareExams).map((exam) => {
    const titleLines = wrapLines((exam.title || '').trim() || '考试', titleWidth, value => measure(value, EXAM_TITLE_FONT))
    const detailLines = wrapLines(describeExam(exam), detailWidth, value => measure(value, EXAM_DETAIL_FONT))
    const height = Math.max(titleLines.length, detailLines.length, 1) * EXAM_LINE_HEIGHT
    const row: ExamRow = { exam, titleLines, detailLines, y, height }
    y += height + EXAM_ROW_GAP
    return row
  })
  return {
    rows,
    height: rows.length ? y - EXAM_ROW_GAP : 0,
    titleFont: EXAM_TITLE_FONT,
    detailFont: EXAM_DETAIL_FONT,
    lineHeight: EXAM_LINE_HEIGHT,
    detailX,
  }
}
