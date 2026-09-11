<script lang="ts" setup>
import type { ShareAssets } from '@/api/types/share'
import type { OverviewExam, OverviewOut, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { CalendarNotesLayout, ExamListLayout, MeasureText, PosterDayColumn, PosterGrid, PosterPart, PosterSlot } from '@/utils/poster-overview'
import type { PosterBadgeKind, PosterFill, PosterMode, PosterTheme, PosterThemeKey } from '@/utils/poster-themes'
import type { SectionRow } from '@/utils/timetable'
import { onLoad, onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { getShareAssets } from '@/api/share'
import { getOverview, getSettings, getWeek } from '@/api/timetable'
import { useApiException } from '@/hooks/useApiException'
import { toRequestError } from '@/http/errors'
import { useUserStore } from '@/store/user'
import { tokens } from '@/style/tokens'
import { debounce } from '@/utils/debounce'
import { confirmModal } from '@/utils/dialog'
import { hasWeekendSlots, layoutCalendarNotes, layoutExamList, layoutPosterGrid, posterDayColumns } from '@/utils/poster-overview'
import {
  blockColorFor,
  DEFAULT_POSTER_MODE,
  DEFAULT_POSTER_THEME,
  isGradient,
  POSTER_BADGE_KINDS,
  POSTER_THEME_KEYS,
  POSTER_THEMES,
  readPosterMode,
  readPosterTheme,
  savePosterMode,
  savePosterTheme,
  withAlpha,
} from '@/utils/poster-themes'
import {
  AUDIT_BADGE,
  calendarLabelColor,
  chineseDate,
  displayClock,
  KIND_BADGES,
  readLocalHiddenIds,
  readWeekendMode,
  shortDate,
  todayIso,
  weekCalendarNotes,
  WEEKDAY_LABELS,
  weekGridRows,
  weekSuspendedReason,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '课表海报',
  },
})

/** 微信 canvas 2d 的图片对象，只用到这几个成员 */
interface CanvasImage {
  src: string
  width: number
  height: number
  onload: (() => void) | null
  onerror: ((error: unknown) => void) | null
}

/** 微信 canvas 2d 节点，只用到这几个成员 */
interface Canvas2D {
  width: number
  height: number
  getContext: (type: '2d') => CanvasRenderingContext2D
  createImage: () => CanvasImage
}

/** 页脚里的一块二维码 */
interface QrTile {
  caption: string
  image: CanvasImageSource
}

interface LegendItem {
  kind: 'course' | PosterBadgeKind | 'audit'
  label: string
}

/** 画布布局（逻辑像素），绘制时按 DPR 放大 */
interface PosterLayout {
  width: number
  height: number
  headerTop: number
  cardX: number
  cardY: number
  cardW: number
  cardH: number
  /** 卡片内容区（含节次列）的左边缘与宽度 */
  innerLeft: number
  innerWidth: number
  dayHeaderTop: number
  gridTop: number
  gridLeft: number
  gridWidth: number
  gridHeight: number
  colWidth: number
  legendTop: number
  legendHeight: number
  footerTop: number
  footerHeight: number
}

/** 海报布局（整学期与本周共用）：通用部分之外，网格、表头、校历与考试安排另有排版结果 */
interface GridPosterLayout extends PosterLayout {
  /** 页眉、卡片边距、图例与页脚相对 CHROME_BASE 宽度的放大倍数 */
  unit: number
  grid: PosterGrid
  dayHeaderHeight: number
  /** 本周海报表头各列的日期、今天与校历；整学期为 null，表头只写星期 */
  days: PosterDayColumn[] | null
  /** 本周海报表头上方的校历全文 */
  notes: CalendarNotesLayout | null
  notesTop: number
  exams: ExamListLayout | null
  examsTop: number
  examsHeight: number
  /** 网格里一块日程都没有时居中写的一句 */
  emptyText: string
}

/** 海报要排的内容 */
interface GridPosterContent {
  /** 整学期：每周时段；本周：这一周可见的日程 */
  items: PosterSlot[]
  /** 列在图例下方的考试；本周海报的考试就在网格里，为空 */
  exams: OverviewExam[]
  /** 本周海报的周视图（表头日期、今天与校历）；整学期为 null */
  week: WeekView | null
  emptyText: string
}

interface GridLayoutOptions {
  /** 逻辑宽度，取自 POSTER_WIDTHS */
  width: number
  hasLegend: boolean
  hasTiles: boolean
  showTeacher: boolean
  /** 当前风格的格子有没有左侧色条（影响文字缩进，也就影响折行） */
  bar: boolean
  hideWeekend: boolean
}

interface HeaderText {
  title: string
  subtitle: string
  /** 色带风格右上角的大号周次；空串不画（整学期海报不写周次） */
  numeral: string
}

// 布局常量（逻辑像素），8px 节奏
const PAGE_PAD = 14
/** 页眉：标题 + 副标题 + 到卡片的间距 */
const HEADER_H = 78
const CARD_PAD = 10
const LEGEND_H = 26
const FOOTER_H = 46
const FOOTER_QR_H = 92
const QR_TILE = 56
const QR_GAP = 10
/** DPR 上限；再乘以画布尺寸不能超过微信 canvas 的长边上限 */
const MAX_DPR = 3
const MAX_CANVAS_SIDE = 4096
/**
 * 海报的逻辑宽度，依次尝试：默认 720，七列时每列约 86，长名称折成几行；
 * 日程多到长边超限、导出倍率低于 MIN_EXPORT_SCALE 时换更宽的画布——折行少了、整体变矮，导出的字反而更大
 */
const POSTER_WIDTHS = [720, 900, 1080, 1260]
/** 页眉、卡片、图例与页脚在这个宽度的坐标里绘制，按「宽度 / 此值」整体放大（720 宽时 1.6 倍） */
const CHROME_BASE = 450
/** 整学期表头只有星期 */
const DAY_HEADER_H = 36
/** 本周表头：星期与日期（今天垫一枚强调色胶囊）；有校历的周再加一行短标签 */
const WEEK_HEADER_H = 46
const WEEK_HEADER_TAG_H = 62
const TODAY_PILL_TOP = 3
const TODAY_PILL_H = 38
/** 校历全文与表头之间的留白 */
const NOTES_GAP = 8
/** 节次列：细条里要并排写下两位数节次与上课时间 */
const AXIS_COL = 48
/** 考试安排：标题行、列表左侧留给圆点的缩进、列表下方留白 */
const TERM_EXAMS_HEADING_H = 34
const TERM_EXAMS_INDENT = 14
const TERM_EXAMS_BOTTOM = 14
/** 导出倍率下限：12px 的地点、周次文字导出后不小于 18 像素 */
const MIN_EXPORT_SCALE = 1.5
const IMAGE_TIMEOUT_MS = 8000
/** 出图前最多等二维码图片这么久；没等到就先画，图片到了再重绘补上 */
const QR_WAIT_MS = 1500
/** 首次出图最多等分享素材这么久，晚到的由重绘补上 */
const ASSETS_WAIT_MS = 2500
const RENDER_DEBOUNCE_MS = 150
const FALLBACK_SLOGAN = '元培智慧书院 · YPPF'

const LEGEND_ORDER: ('course' | PosterBadgeKind)[] = ['course', ...POSTER_BADGE_KINDS]

/* -------------------- 页面状态 -------------------- */

const MODE_OPTIONS: { key: PosterMode, label: string }[] = [
  { key: 'term', label: '整学期' },
  { key: 'week', label: '本周' },
]
/** 学期不存在时后端给出的错误码；旧后端没有整学期接口时的 404 不带这些码 */
const TERM_ERROR_CODES = new Set(['TERM_NOT_FOUND', 'NO_CURRENT_TERM'])

const view = ref<WeekView | null>(null)
const overview = ref<OverviewOut | null>(null)
const assets = ref<ShareAssets | null>(null)
const loading = ref(true)
const loadError = ref('')
/** 切换内容后补取另一种数据 */
const modeLoading = ref(false)
const modeError = ref('')
const rendering = ref(false)
const renderError = ref('')
const saving = ref(false)
/** 画布在页面上的显示尺寸（px）；整学期海报比屏幕宽，按屏宽缩小显示 */
const canvasSize = ref({ width: 0, height: 0 })
const themeKey = ref<PosterThemeKey>(readPosterTheme() ?? DEFAULT_POSTER_THEME)
const mode = ref<PosterMode>(readPosterMode() ?? DEFAULT_POSTER_MODE)
/** 后端还没有整学期接口：退回本周海报，并提示一句 */
const overviewUnsupported = ref(false)
const withQr = ref(false)
/** 只作用于本页海报，不回写课表设置里的 share_show_name */
const showName = ref(false)
/** 整学期海报是否写上教师；只作用于本页，默认不写 */
const showTeacher = ref(false)
/** 隐藏周六、周日两列：只在这份海报周末没有日程时可选（canHideWeekend），默认跟课表页的「隐藏周末」设置 */
const hideWeekend = ref(readWeekendMode() === 'hide')
/** 转发卡片用的 5:4 缩略图（海报顶部），导出失败就用微信默认截图 */
const shareImagePath = ref('')
const query = ref<{ term?: string, week?: number }>({})
const instance = getCurrentInstance()
const userStore = useUserStore()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
let canvasNode: Canvas2D | null = null
let renderBusy = false
let renderPending = false
const imageCache = new Map<string, Promise<CanvasImageSource | null>>()
/** 风格 / 开关 / 姓名变化后合并成一次重绘 */
const scheduleRender = debounce(() => {
  void render()
}, RENDER_DEBOUNCE_MS)

const themeOptions = POSTER_THEME_KEYS.map(key => POSTER_THEMES[key])
const theme = computed(() => POSTER_THEMES[themeKey.value])
/** 实际画的内容：不支持整学期时退回本周 */
const effectiveMode = computed<PosterMode>(() => (overviewUnsupported.value ? 'week' : mode.value))
const activeTerm = computed(() => (effectiveMode.value === 'term' ? overview.value?.term : view.value?.term) ?? null)
const hasAssets = computed(() => !!(assets.value?.miniapp_qrcode || assets.value?.official_qrcode))
const displayName = computed(() => (showName.value ? userStore.userInfo.name || '' : ''))
const title = computed(() => (displayName.value ? `${displayName.value}的课表` : '我的课表'))
const subtitle = computed(() => {
  if (effectiveMode.value === 'term')
    return overview.value ? `${overview.value.term.name} · 全学期` : ''
  const data = view.value
  if (!data)
    return ''
  const dates = data.week_dates
  const range = dates.length >= 7 ? ` · ${shortDate(dates[0])} – ${shortDate(dates[6])}` : ''
  return `${data.term.name} · 第 ${data.week} 周${range}`
})
const modeHint = computed(() => {
  if (overviewUnsupported.value)
    return '服务器暂不支持整学期海报，先生成本周的'
  return effectiveMode.value === 'term'
    ? '每周的课程都在，单双周分开标注；课程名、地点、上课周次完整保留'
    : '只含这一周的日程，包括活动、预约与考试；名称、地点完整保留'
})
/** 当前内容还不能保存或分享（正在取数据、取失败或还没画出来） */
const posterBlocked = computed(() => modeLoading.value || !!modeError.value || rendering.value || !!renderError.value)
const visibleOccurrences = computed(() => {
  const localHidden = new Set(readLocalHiddenIds(userStore.userInfo.username))
  return (view.value?.occurrences ?? []).filter(item => !item.hidden && !localHidden.has(item.id))
})
/** 周六、周日都没有日程时才提供「隐藏周末」；有周末日程时始终画七列 */
const canHideWeekend = computed(() => (effectiveMode.value === 'term'
  ? !!overview.value && !hasWeekendSlots(overview.value.slots)
  : !!view.value && !hasWeekendSlots(visibleOccurrences.value)))
/** 网格行与课表页同一套时间轴：节次表，日程伸出节次表时前后补整点的钟点行（section 为 0） */
const rows = computed(() => weekGridRows(
  activeTerm.value,
  effectiveMode.value === 'term' ? overview.value?.slots ?? [] : visibleOccurrences.value,
))

/** 图例只列出现过的类别；学校课程无角标，其余按角标文案 */
function legendFor(kinds: Set<string>): LegendItem[] {
  return LEGEND_ORDER
    .filter(kind => kinds.has(kind))
    .map(kind => ({ kind, label: kind === 'course' ? '学校课程' : KIND_BADGES[kind] ?? kind }))
}

/** 有旁听时图例另加「旁听」：格子里的「旁」字不看图例不好懂 */
function legendOf(items: { kind: string, role?: string }[]): LegendItem[] {
  const legend = legendFor(new Set(items.map(item => item.kind)))
  if (items.some(item => item.role === 'audit'))
    legend.push({ kind: 'audit', label: '旁听' })
  return legend
}

const legendItems = computed(() => legendOf(visibleOccurrences.value))
const termLegendItems = computed(() => legendOf(overview.value?.slots ?? []))

function swatchStyle(item: PosterTheme) {
  return { background: `linear-gradient(135deg, ${item.swatch[0]} 50%, ${item.swatch[1]} 50%)` }
}

function modeOptionClass(key: PosterMode): string {
  if (key === effectiveMode.value)
    return 'bg-card text-primary font-medium shadow-card'
  return key === 'term' && overviewUnsupported.value ? 'text-fg-4' : 'text-fg-2'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* -------------------- 布局 -------------------- */

/**
 * 海报布局：页眉、卡片边距与页脚按宽度等比放大，网格行高由内容决定。
 * 本周海报的表头写日期与校历短标签，校历全文写在表头上方；整学期海报在图例下方列出考试安排
 */
function buildGridLayout(content: GridPosterContent, sectionList: SectionRow[], measure: MeasureText, options: GridLayoutOptions): GridPosterLayout {
  const { width } = options
  const unit = width / CHROME_BASE
  const cardX = PAGE_PAD * unit
  const cardY = (PAGE_PAD + HEADER_H) * unit
  const cardW = width - cardX * 2
  const innerLeft = cardX + CARD_PAD * unit
  const innerWidth = cardW - CARD_PAD * unit * 2
  const notesTop = cardY + CARD_PAD * unit
  const notes = content.week ? layoutCalendarNotes(innerWidth - 4, weekCalendarNotes(content.week), measure) : null
  const dayHeaderTop = notesTop + (notes ? notes.height + NOTES_GAP : 0)
  const gridLeft = innerLeft + AXIS_COL
  const gridWidth = innerWidth - AXIS_COL
  const grid = layoutPosterGrid({
    width: gridWidth,
    rows: sectionList,
    slots: content.items,
    showTeacher: options.showTeacher,
    bar: options.bar,
    hideWeekend: options.hideWeekend,
    clockTimes: !!content.week,
  }, measure)
  const days = content.week ? posterDayColumns(content.week, grid.weekdays) : null
  let dayHeaderHeight = DAY_HEADER_H
  if (days)
    dayHeaderHeight = days.some(day => day.kind) ? WEEK_HEADER_TAG_H : WEEK_HEADER_H
  const gridTop = dayHeaderTop + dayHeaderHeight
  const legendTop = gridTop + grid.height
  const legendHeight = (options.hasLegend ? LEGEND_H : 8) * unit
  const examsTop = legendTop + legendHeight
  const exams = content.exams.length ? layoutExamList(innerWidth - TERM_EXAMS_INDENT - 2, content.exams, measure) : null
  const examsHeight = exams ? TERM_EXAMS_HEADING_H + exams.height + TERM_EXAMS_BOTTOM : 0
  const footerTop = examsTop + examsHeight
  const footerHeight = (options.hasTiles ? FOOTER_QR_H : FOOTER_H) * unit
  const cardH = footerTop + footerHeight - cardY
  return {
    width,
    height: cardY + cardH + cardX,
    headerTop: (PAGE_PAD + 10) * unit,
    cardX,
    cardY,
    cardW,
    cardH,
    innerLeft,
    innerWidth,
    dayHeaderTop,
    gridTop,
    gridLeft,
    gridWidth,
    gridHeight: grid.height,
    colWidth: grid.colWidth,
    legendTop,
    legendHeight,
    footerTop,
    footerHeight,
    unit,
    grid,
    dayHeaderHeight,
    days,
    notes,
    notesTop,
    exams,
    examsTop,
    examsHeight,
    emptyText: content.emptyText,
  }
}

/** 布局坐标整体乘 factor：页眉、卡片、图例与页脚在 1/unit 的坐标里画、再放大 unit 倍 */
function scaleLayout(layout: PosterLayout, factor: number): PosterLayout {
  return {
    width: layout.width * factor,
    height: layout.height * factor,
    headerTop: layout.headerTop * factor,
    cardX: layout.cardX * factor,
    cardY: layout.cardY * factor,
    cardW: layout.cardW * factor,
    cardH: layout.cardH * factor,
    innerLeft: layout.innerLeft * factor,
    innerWidth: layout.innerWidth * factor,
    dayHeaderTop: layout.dayHeaderTop * factor,
    gridTop: layout.gridTop * factor,
    gridLeft: layout.gridLeft * factor,
    gridWidth: layout.gridWidth * factor,
    gridHeight: layout.gridHeight * factor,
    colWidth: layout.colWidth * factor,
    legendTop: layout.legendTop * factor,
    legendHeight: layout.legendHeight * factor,
    footerTop: layout.footerTop * factor,
    footerHeight: layout.footerHeight * factor,
  }
}

/**
 * 依次试 POSTER_WIDTHS：长边不超过画布上限、导出倍率够 MIN_EXPORT_SCALE 就用；
 * 都不够时取倍率最大的那个（文字仍然完整，只是小一些）。返回布局与绘制倍率。
 */
function fitGridLayout(
  content: GridPosterContent,
  sectionList: SectionRow[],
  measure: MeasureText,
  options: Omit<GridLayoutOptions, 'width'>,
): { layout: GridPosterLayout, scale: number } {
  const fit = (width: number) => {
    const layout = buildGridLayout(content, sectionList, measure, { ...options, width })
    return { layout, scale: Math.min(MAX_DPR, MAX_CANVAS_SIDE / Math.max(layout.width, layout.height, 1)) }
  }
  let best = fit(POSTER_WIDTHS[0])
  for (const width of POSTER_WIDTHS.slice(1)) {
    if (best.scale >= MIN_EXPORT_SCALE)
      break
    const next = fit(width)
    if (next.scale > best.scale)
      best = next
  }
  return best
}

/* -------------------- 画布 -------------------- */

/** 海报在页面上的显示宽度（画布本身按 POSTER_WIDTHS 里选中的宽度绘制，按屏宽缩小显示） */
function previewWidth(): number {
  const info = uni.getWindowInfo()
  return Math.min(info.windowWidth - 24, POSTER_WIDTHS[0])
}

function getCanvas(): Promise<Canvas2D> {
  return new Promise((resolve, reject) => {
    uni.createSelectorQuery()
      .in(instance?.proxy)
      .select('#poster')
      .fields({ node: true, size: true }, (result) => {
        const node = (result as { node?: Canvas2D } | undefined)?.node
        if (node)
          resolve(node)
        else
          reject(new Error('canvas node unavailable'))
      })
      .exec()
  })
}

/**
 * 用 canvas 自己的 createImage 加载图片（canvas 2d 只认它创建的图片对象）。
 * 远程地址在正式环境必须来自小程序后台配置的 downloadFile 合法域名，代码里无需处理；
 * 加载失败或超时都返回 null，海报照常绘制、只是少一块二维码。
 */
function loadImage(canvas: Canvas2D, url: string): Promise<CanvasImageSource | null> {
  const cached = imageCache.get(url)
  if (cached)
    return cached
  const task = new Promise<CanvasImageSource | null>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (value: CanvasImageSource | null) => {
      if (settled)
        return
      settled = true
      if (timer !== null)
        clearTimeout(timer)
      resolve(value)
    }
    timer = setTimeout(() => finish(null), IMAGE_TIMEOUT_MS)
    try {
      const image = canvas.createImage()
      image.onload = () => finish(image as unknown as CanvasImageSource)
      image.onerror = () => finish(null)
      image.src = url
    }
    catch {
      finish(null)
    }
  })
  imageCache.set(url, task)
  // 失败的不缓存，下次重绘再试一次
  void task.then((image) => {
    if (!image)
      imageCache.delete(url)
  })
  return task
}

const QR_PENDING = Symbol('qr-pending')

/** 已加载的二维码；最多等 QR_WAIT_MS，没到的先不画，加载完成后触发一次重绘补上 */
async function loadQrTiles(canvas: Canvas2D): Promise<QrTile[]> {
  const current = assets.value
  if (!withQr.value || !current)
    return []
  const sources = [
    { caption: '小程序', url: current.miniapp_qrcode },
    { caption: '公众号', url: current.official_qrcode },
  ]
  const pending = sources.map(source => (source.url ? loadImage(canvas, source.url) : Promise.resolve(null)))
  const deadline = sleep(QR_WAIT_MS).then(() => QR_PENDING)
  const images = await Promise.all(pending.map(task => Promise.race([task, deadline])))
  images.forEach((image, index) => {
    if (image === QR_PENDING) {
      void pending[index].then((loaded) => {
        if (loaded && withQr.value)
          scheduleRender()
      })
    }
  })
  return sources.flatMap((source, index) => {
    const image = images[index]
    return image && image !== QR_PENDING ? [{ caption: source.caption, image }] : []
  })
}

/* -------------------- 绘制工具 -------------------- */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: 'normal' | 'bold' = 'normal', family = 'sans-serif') {
  ctx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px ${family}`
}

/** 排版用的量宽函数：与绘制同一个 context、同一套字体；字体没变就不重复设置 */
function measurerFor(ctx: CanvasRenderingContext2D): MeasureText {
  let current = ''
  return (text, font) => {
    const key = `${font.weight} ${font.size}`
    if (key !== current) {
      setFont(ctx, font.size, font.weight)
      current = key
    }
    return ctx.measureText(text).width
  }
}

/** 纯色直接返回；渐变按给定区域生成 */
function fillStyleFor(ctx: CanvasRenderingContext2D, fill: PosterFill, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (!isGradient(fill))
    return fill
  const gradient = fill.direction === 'diagonal'
    ? ctx.createLinearGradient(x, y, x + w, y + h)
    : ctx.createLinearGradient(x, y, x, y + h)
  gradient.addColorStop(0, fill.from)
  gradient.addColorStop(1, fill.to)
  return gradient
}

/** 超出宽度时截断并补省略号 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth)
    return text
  let clipped = text
  while (clipped.length > 0 && ctx.measureText(`${clipped}…`).width > maxWidth)
    clipped = clipped.slice(0, -1)
  return `${clipped}…`
}

/* -------------------- 绘制：页眉、卡片、图例与页脚 -------------------- */

/** 整页底色与各风格的装饰 */
function drawPage(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout) {
  const { width, height, cardY, headerTop } = layout
  ctx.fillStyle = fillStyleFor(ctx, theme.page.background, 0, 0, width, height)
  ctx.fillRect(0, 0, width, height)
  switch (theme.page.decoration) {
    case 'dots': {
      // 淡点阵铺满整页，卡片盖在上面
      ctx.fillStyle = withAlpha(theme.text.muted, 0.4)
      ctx.beginPath()
      for (let y = 8; y < height; y += 12) {
        for (let x = 8; x < width; x += 12)
          ctx.rect(x, y, 1.2, 1.2)
      }
      ctx.fill()
      break
    }
    case 'glow': {
      // 标题左上方一团强调色柔光
      const cx = width * 0.25
      const cy = headerTop + 16
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.7)
      glow.addColorStop(0, withAlpha(theme.header.accent, 0.35))
      glow.addColorStop(1, withAlpha(theme.header.accent, 0))
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, cardY + 80)
      break
    }
    case 'band': {
      // 斜向渐变色带托住标题，卡片压在色带下缘上
      const band = theme.page.band
      if (!band)
        break
      const bottomLeft = cardY + 48
      const bottomRight = cardY + 16
      ctx.fillStyle = fillStyleFor(ctx, band, 0, 0, width, bottomLeft)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(width, 0)
      ctx.lineTo(width, bottomRight)
      ctx.lineTo(0, bottomLeft)
      ctx.closePath()
      ctx.fill()
      break
    }
  }
}

/** 大标题、副标题与风格装饰 */
function drawHeader(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout, header: HeaderText) {
  const { width, headerTop } = layout
  const style = theme.header
  const onBand = theme.page.decoration === 'band'
  // 色带风格没有竖条，标题顶格；其它风格标题左侧一条强调色竖条
  const textX = onBand ? PAGE_PAD + 4 : PAGE_PAD + 14
  const maxWidth = width - textX - PAGE_PAD - 4
  // 大号周次数字只和标题同一行，副标题仍可用整行
  let titleWidth = maxWidth
  ctx.textBaseline = 'top'
  if (onBand) {
    if (header.numeral) {
      ctx.textAlign = 'right'
      ctx.fillStyle = withAlpha(tokens.textInverse, 0.32)
      setFont(ctx, 44, 'bold')
      const numeralWidth = ctx.measureText(header.numeral).width
      ctx.fillText(header.numeral, width - PAGE_PAD - 18, headerTop - 8)
      setFont(ctx, 12, 'bold')
      ctx.fillText('周', width - PAGE_PAD - 4, headerTop + 22)
      titleWidth -= numeralWidth + 34
    }
  }
  else {
    ctx.fillStyle = style.accent
    roundRect(ctx, PAGE_PAD + 2, headerTop + 3, 4, style.headlineSize - 4, 2)
    ctx.fill()
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = style.headline
  setFont(ctx, style.headlineSize, style.headlineWeight, style.headlineFamily)
  ctx.fillText(fitText(ctx, header.title, titleWidth), textX, headerTop)
  ctx.fillStyle = style.subline
  setFont(ctx, 12)
  ctx.fillText(fitText(ctx, header.subtitle, maxWidth), textX, headerTop + style.headlineSize + 10)
}

function drawCard(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout) {
  const { cardX, cardY, cardW, cardH } = layout
  ctx.save()
  if (theme.card.shadow) {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.12)'
    ctx.shadowBlur = 20
    ctx.shadowOffsetY = 8
  }
  ctx.fillStyle = theme.card.background
  roundRect(ctx, cardX, cardY, cardW, cardH, theme.card.radius)
  ctx.fill()
  ctx.restore()
  if (theme.card.border) {
    ctx.strokeStyle = theme.card.border
    ctx.lineWidth = 1
    roundRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, theme.card.radius)
    ctx.stroke()
  }
}

/** 图例：出现过的类别 */
function drawLegend(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout, items: LegendItem[]) {
  if (!items.length)
    return
  const y = layout.legendTop + layout.legendHeight / 2
  let x = layout.innerLeft + 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const item of items) {
    let swatchWidth = 9
    if (item.kind === 'audit') {
      // 旁听：和格子里一样的「旁」字小标
      setFont(ctx, 7, 'bold')
      swatchWidth = ctx.measureText(AUDIT_BADGE).width + 6
      ctx.fillStyle = withAlpha(theme.legend.text, 0.18)
      roundRect(ctx, x, y - 5.5, swatchWidth, 11, 5.5)
      ctx.fill()
      ctx.fillStyle = theme.legend.text
      ctx.textAlign = 'center'
      ctx.fillText(AUDIT_BADGE, x + swatchWidth / 2, y)
      ctx.textAlign = 'left'
    }
    else {
      // 学校课程用色盘首色描边示意，角标类别用角标色（白底角标的风格取其文字色）
      const swatch = item.kind === 'course' ? theme.palette[0] : theme.badges[item.kind]
      ctx.fillStyle = item.kind !== 'course' && theme.legend.badgeSwatch === 'fg' ? swatch.fg : swatch.bg
      roundRect(ctx, x, y - 4.5, 9, 9, 2.5)
      ctx.fill()
      if (item.kind === 'course') {
        ctx.strokeStyle = withAlpha(swatch.fg, 0.6)
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    ctx.fillStyle = theme.legend.text
    setFont(ctx, 9)
    ctx.fillText(item.label, x + swatchWidth + 4, y)
    x += swatchWidth + 4 + ctx.measureText(item.label).width + 14
  }
}

/** 页脚：左侧标语与生成日期，右侧二维码（有几块画几块） */
function drawFooter(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout, tiles: QrTile[]) {
  const { footerTop, innerLeft, innerWidth } = layout
  const style = theme.footer
  ctx.strokeStyle = style.divider
  ctx.lineWidth = 1
  strokeLine(ctx, innerLeft, footerTop, innerLeft + innerWidth, footerTop)

  let textRight = innerLeft + innerWidth
  if (tiles.length) {
    const tileTop = footerTop + 12
    const totalWidth = tiles.length * QR_TILE + (tiles.length - 1) * QR_GAP
    let x = innerLeft + innerWidth - totalWidth
    for (const tile of tiles) {
      ctx.fillStyle = style.tile
      roundRect(ctx, x, tileTop, QR_TILE, QR_TILE, 8)
      ctx.fill()
      ctx.strokeStyle = style.tileBorder
      roundRect(ctx, x + 0.5, tileTop + 0.5, QR_TILE - 1, QR_TILE - 1, 8)
      ctx.stroke()
      ctx.drawImage(tile.image, x + 4, tileTop + 4, QR_TILE - 8, QR_TILE - 8)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = style.caption
      setFont(ctx, 8)
      ctx.fillText(tile.caption, x + QR_TILE / 2, tileTop + QR_TILE + 10)
      x += QR_TILE + QR_GAP
    }
    textRight -= totalWidth + 12
  }

  const slogan = assets.value?.slogan?.trim() || FALLBACK_SLOGAN
  const generated = `${chineseDate(todayIso())} 生成`
  const hint = tiles.length ? `长按识别二维码 · ${generated}` : generated
  const textWidth = textRight - innerLeft - 4
  const sloganY = tiles.length ? footerTop + 30 : footerTop + 18
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = style.slogan
  setFont(ctx, 11, 'bold')
  ctx.fillText(fitText(ctx, slogan, textWidth), innerLeft + 2, sloganY)
  ctx.fillStyle = style.muted
  setFont(ctx, 8)
  ctx.fillText(fitText(ctx, hint, textWidth), innerLeft + 2, sloganY + 16)
}

/* -------------------- 绘制：网格海报（整学期与本周） -------------------- */

function drawGridPoster(
  ctx: CanvasRenderingContext2D,
  theme: PosterTheme,
  layout: GridPosterLayout,
  header: HeaderText,
  sectionList: SectionRow[],
  legend: LegendItem[],
  tiles: QrTile[],
) {
  // 页眉、卡片、图例、页脚在缩小的坐标里画再整体放大
  const chrome = scaleLayout(layout, 1 / layout.unit)
  ctx.clearRect(0, 0, layout.width, layout.height)
  ctx.save()
  ctx.scale(layout.unit, layout.unit)
  drawPage(ctx, theme, chrome)
  drawHeader(ctx, theme, chrome, header)
  drawCard(ctx, theme, chrome)
  ctx.restore()
  drawCalendarNotes(ctx, theme, layout)
  drawDayHeader(ctx, theme, layout)
  drawGrid(ctx, theme, layout, sectionList)
  drawBlocks(ctx, theme, layout)
  ctx.save()
  ctx.scale(layout.unit, layout.unit)
  drawLegend(ctx, theme, chrome, legend)
  drawFooter(ctx, theme, chrome, tiles)
  ctx.restore()
  drawExamList(ctx, theme, layout)
}

/** 本周海报表头上方的校历全文：圆点取校历配色（放假 / 考试红，调休蓝，仅标注灰），文字完整折行 */
function drawCalendarNotes(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: GridPosterLayout) {
  const { notes, notesTop, innerLeft } = layout
  if (!notes)
    return
  const left = innerLeft + 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  setFont(ctx, notes.font.size, notes.font.weight)
  for (const line of notes.lines) {
    const top = notesTop + line.y
    if (line.first) {
      ctx.fillStyle = calendarLabelColor(line.kind) || theme.text.muted
      ctx.beginPath()
      ctx.arc(left + 3, top + notes.lineHeight / 2, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = theme.text.secondary
    ctx.fillText(line.text, left + notes.indent, top + (notes.lineHeight - notes.font.size) / 2)
  }
}

/**
 * 表头。整学期只写星期；本周写星期与日期，与课表页的表头一致：今天垫一枚强调色胶囊、整列淡色，
 * 放假 / 考试周整列置灰，有校历的日子在日期下写短标签（没有关键词的仅标注事件画一个圆点）
 */
function drawDayHeader(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: GridPosterLayout) {
  const { dayHeaderTop, dayHeaderHeight, gridTop, gridLeft, gridHeight, grid, days } = layout
  const colWidth = grid.colWidth
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (!days) {
    ctx.fillStyle = theme.text.secondary
    setFont(ctx, 14, 'bold')
    grid.weekdays.forEach((weekday, index) => {
      ctx.fillText(`周${WEEKDAY_LABELS[weekday - 1]}`, gridLeft + (index + 0.5) * colWidth, dayHeaderTop + dayHeaderHeight / 2)
    })
    return
  }
  // 短标签行在胶囊下方，居中于多出的那一行
  const tagY = dayHeaderTop + (WEEK_HEADER_H + WEEK_HEADER_TAG_H) / 2 - 2
  days.forEach((day, index) => {
    const x = gridLeft + index * colWidth
    const centre = x + colWidth / 2
    if (day.suspended) {
      ctx.fillStyle = theme.grid.suspended
      ctx.fillRect(x, dayHeaderTop, colWidth, gridTop + gridHeight - dayHeaderTop)
    }
    if (day.today) {
      ctx.fillStyle = withAlpha(theme.grid.today, 0.08)
      ctx.fillRect(x, gridTop, colWidth, gridHeight)
      ctx.fillStyle = theme.header.accent
      roundRect(ctx, x + 4, dayHeaderTop + TODAY_PILL_TOP, colWidth - 8, TODAY_PILL_H, 10)
      ctx.fill()
    }
    ctx.fillStyle = day.today ? theme.text.onAccent : theme.text.secondary
    setFont(ctx, 14, 'bold')
    ctx.fillText(`周${WEEKDAY_LABELS[day.weekday - 1]}`, centre, dayHeaderTop + 15)
    ctx.fillStyle = day.today ? theme.text.onAccent : theme.text.muted
    setFont(ctx, 11)
    ctx.fillText(day.date, centre, dayHeaderTop + 32)
    if (!day.kind)
      return
    ctx.fillStyle = calendarLabelColor(day.kind) || theme.text.muted
    if (day.tag) {
      setFont(ctx, 11, 'bold')
      ctx.fillText(day.tag, centre, tagY)
    }
    else {
      ctx.beginPath()
      ctx.arc(centre, tagY, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/**
 * 节次列的标签随行高换写法：够高写节次号与起止时间，矮一些写节次号与上课时间，收成细条时并排写在一行。
 * 节次表之外的钟点行编号位留空，只在节次时间的位置写开始时刻（字号、颜色、字重与节次时间相同），不写结束时刻
 */
function drawSectionLabel(ctx: CanvasRenderingContext2D, theme: PosterTheme, row: SectionRow, left: number, top: number, height: number) {
  const centre = left + AXIS_COL / 2
  const clock = row.section === 0
  const start = displayClock(row.start)
  ctx.textBaseline = 'middle'
  if (height >= 46) {
    ctx.textAlign = 'center'
    if (!clock) {
      ctx.fillStyle = theme.grid.section
      setFont(ctx, 14, 'bold')
      ctx.fillText(String(row.section), centre, top + 15)
    }
    ctx.fillStyle = theme.text.muted
    setFont(ctx, 10)
    ctx.fillText(start, centre, top + 30)
    if (!clock)
      ctx.fillText(row.end, centre, top + 42)
    return
  }
  const middle = top + height / 2
  if (height >= 28) {
    ctx.textAlign = 'center'
    if (!clock) {
      ctx.fillStyle = theme.grid.section
      setFont(ctx, 13, 'bold')
      ctx.fillText(String(row.section), centre, middle - 6)
    }
    ctx.fillStyle = theme.text.muted
    setFont(ctx, 9)
    ctx.fillText(start, centre, middle + 7)
    return
  }
  // 细条：节次号靠左，时间靠右；放不下时缩小时间的字号，再放不下只写节次号
  let room = AXIS_COL - 8
  if (!clock) {
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.grid.section
    setFont(ctx, 11, 'bold')
    room -= ctx.measureText(String(row.section)).width + 3
    ctx.fillText(String(row.section), left + 4, middle)
  }
  setFont(ctx, 8.5)
  const startWidth = ctx.measureText(start).width
  if (room < startWidth * 7 / 8.5)
    return
  if (startWidth > room)
    setFont(ctx, 8.5 * room / startWidth)
  ctx.textAlign = 'right'
  ctx.fillStyle = theme.text.muted
  ctx.fillText(start, left + AXIS_COL - 4, middle)
}

/** 网格线、节次列与分隔带（午休 / 晚饭，早间 / 晚间）；行高各不相同，没有日程的行收成细条 */
function drawGrid(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: GridPosterLayout, sectionList: SectionRow[]) {
  const { innerLeft, innerWidth, gridTop, gridLeft, gridHeight, grid } = layout
  const right = innerLeft + innerWidth
  ctx.strokeStyle = theme.grid.line
  ctx.lineWidth = 1
  for (let i = 0; i <= grid.weekdays.length; i++) {
    const x = gridLeft + i * grid.colWidth
    strokeLine(ctx, x, gridTop, x, gridTop + gridHeight)
  }
  for (const gap of grid.breaks) {
    const y = gridTop + gap.y
    ctx.fillStyle = theme.grid.suspended
    ctx.fillRect(innerLeft, y, innerWidth, gap.height)
    // 分隔带文字只写在左侧节次列里，字号颜色一致：课间连时刻放得下就一起写，放不下只写「午休」「晚饭」；早间 / 晚间只写名称
    ctx.fillStyle = theme.text.muted
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    setFont(ctx, 9)
    const full = gap.zone ? gap.label : `${gap.label} ${gap.start}–${gap.end}`
    ctx.fillText(ctx.measureText(full).width <= AXIS_COL - 8 ? full : gap.label, innerLeft + 4, y + gap.height / 2)
    strokeLine(ctx, innerLeft, y, right, y)
  }
  sectionList.forEach((row, index) => {
    const top = gridTop + (grid.rowTops[index] ?? 0)
    strokeLine(ctx, innerLeft, top, right, top)
    drawSectionLabel(ctx, theme, row, innerLeft, top, grid.rowHeights[index] ?? 0)
  })
  strokeLine(ctx, innerLeft, gridTop + gridHeight, right, gridTop + gridHeight)
}

function drawBlocks(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: GridPosterLayout) {
  const { grid } = layout
  if (!grid.clusters.length) {
    // 空网格只有细条，提示文字压一块卡片底色，免得和网格线叠在一起
    const text = layout.emptyText
    const centreX = layout.gridLeft + layout.gridWidth / 2
    const centreY = layout.gridTop + layout.gridHeight / 2
    setFont(ctx, 16)
    const width = ctx.measureText(text).width + 32
    ctx.fillStyle = theme.card.background
    roundRect(ctx, centreX - width / 2, centreY - 16, width, 32, 16)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.text.muted
    ctx.fillText(text, centreX, centreY)
    return
  }
  for (const cluster of grid.clusters) {
    for (const part of cluster.parts)
      drawPart(ctx, part, cluster.column, theme, layout)
  }
}

/** 一块格子：底色、色条、逐行文字（名称 / 地点 / 周次与时间 / 教师）与小标；已取消的日程整块淡一些 */
function drawPart(ctx: CanvasRenderingContext2D, part: PosterPart, column: number, theme: PosterTheme, layout: GridPosterLayout) {
  const { grid, gridLeft, gridTop } = layout
  const metrics = grid.metrics
  const columnLeft = gridLeft + column * grid.colWidth
  const x = columnLeft + metrics.inset
  const y = gridTop + part.y
  const w = grid.colWidth - metrics.inset * 2
  const h = part.height
  const color = blockColorFor(theme, part.slot)
  ctx.save()
  if ('status' in part.slot && part.slot.status === 'canceled')
    ctx.globalAlpha = 0.55
  ctx.fillStyle = color.bg
  roundRect(ctx, x, y, w, h, theme.block.radius)
  ctx.fill()
  if (theme.block.bar) {
    ctx.fillStyle = color.fg
    roundRect(ctx, x + 3, y + 5, 3, h - 10, 1.5)
    ctx.fill()
  }

  const textX = columnLeft + grid.textLeft
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (const line of part.lines) {
    const isTitle = line.role === 'title'
    // 名称与周次、时间用满色，地点与教师稍淡
    ctx.fillStyle = isTitle || line.role === 'weeks' ? color.fg : withAlpha(color.fg, 0.8)
    const font = isTitle ? metrics.title : metrics.meta
    setFont(ctx, font.size, font.weight)
    ctx.fillText(line.text, textX, y + line.offsetY)
  }

  for (const pill of part.pills) {
    const pillX = textX + pill.offsetX
    const pillY = y + pill.offsetY
    // 类别角标用风格的角标色；「旁」与「已取消」用格子文字色的浅底
    const badge = pill.kind === 'audit' || pill.kind === 'status' ? null : theme.badges[pill.kind]
    ctx.fillStyle = badge ? badge.bg : withAlpha(color.fg, 0.18)
    roundRect(ctx, pillX, pillY, pill.width, metrics.pillHeight, metrics.pillHeight / 2)
    ctx.fill()
    ctx.fillStyle = badge ? badge.fg : color.fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    setFont(ctx, metrics.pill.size, metrics.pill.weight)
    ctx.fillText(pill.text, pillX + pill.width / 2, pillY + metrics.pillHeight / 2)
  }
  ctx.restore()
}

/** 图例下方的考试安排：名称 | 日期 星期 · 时段 时间 · 地点 */
function drawExamList(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: GridPosterLayout) {
  const { exams, examsTop, innerLeft, innerWidth } = layout
  if (!exams)
    return
  ctx.strokeStyle = theme.grid.line
  ctx.lineWidth = 1
  strokeLine(ctx, innerLeft, examsTop, innerLeft + innerWidth, examsTop)

  const headingY = examsTop + TERM_EXAMS_HEADING_H / 2 + 1
  const heading = '考试安排'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = theme.text.primary
  setFont(ctx, 15, 'bold')
  ctx.fillText(heading, innerLeft + 2, headingY)
  const headingWidth = ctx.measureText(heading).width
  ctx.fillStyle = theme.text.muted
  setFont(ctx, 11)
  ctx.fillText(`共 ${exams.rows.length} 场`, innerLeft + 2 + headingWidth + 8, headingY + 1)

  // 圆点取考试角标色；白底角标的风格取其文字色，否则在卡片上看不见
  const swatch = theme.badges.exam
  const dot = theme.legend.badgeSwatch === 'fg' ? swatch.fg : swatch.bg
  const listLeft = innerLeft + TERM_EXAMS_INDENT
  const listTop = examsTop + TERM_EXAMS_HEADING_H
  const offset = (exams.lineHeight - exams.titleFont.size) / 2
  ctx.textBaseline = 'top'
  for (const row of exams.rows) {
    const top = listTop + row.y
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(innerLeft + 6, top + exams.lineHeight / 2, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = theme.text.primary
    setFont(ctx, exams.titleFont.size, exams.titleFont.weight)
    row.titleLines.forEach((line, index) => {
      ctx.fillText(line, listLeft, top + index * exams.lineHeight + offset)
    })
    ctx.fillStyle = theme.text.secondary
    setFont(ctx, exams.detailFont.size, exams.detailFont.weight)
    row.detailLines.forEach((line, index) => {
      ctx.fillText(line, listLeft + exams.detailX, top + index * exams.lineHeight + offset)
    })
  }
}

/* -------------------- 渲染流程 -------------------- */

/** 当前内容要排进网格的日程；数据还没取到时为 null */
function posterContent(): GridPosterContent | null {
  if (effectiveMode.value === 'term') {
    const data = overview.value
    return data ? { items: data.slots, exams: data.exams, week: null, emptyText: '本学期还没有课程' } : null
  }
  const data = view.value
  if (!data)
    return null
  const reason = weekSuspendedReason(data)
  return { items: visibleOccurrences.value, exams: [], week: data, emptyText: reason ? `${reason} · 本周停课` : '本周还没有日程' }
}

/** 两种内容同一套网格排版与绘制；画布按选中的宽度绘制，页面上按屏宽缩小显示 */
async function renderPoster(canvas: Canvas2D, tiles: QrTile[]) {
  const content = posterContent()
  if (!content)
    return
  const week = content.week
  const legend = week ? legendItems.value : termLegendItems.value
  const { layout, scale } = fitGridLayout(content, rows.value, measurerFor(canvas.getContext('2d')), {
    hasLegend: legend.length > 0,
    hasTiles: tiles.length > 0,
    // 「显示教师」只在整学期海报上提供
    showTeacher: !week && showTeacher.value,
    bar: theme.value.block.bar,
    hideWeekend: hideWeekend.value,
  })
  const displayWidth = previewWidth()
  canvasSize.value = { width: displayWidth, height: Math.round(layout.height * displayWidth / layout.width) }
  await nextTick()
  canvas.width = Math.round(layout.width * scale)
  canvas.height = Math.round(layout.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  const header = { title: title.value, subtitle: subtitle.value, numeral: week ? String(week.week) : '' }
  drawGridPoster(ctx, theme.value, layout, header, rows.value, legend, tiles)
  // 缩略图输出宽度不超过默认宽度，够转发卡片用
  void prepareShareImage(displayWidth, Math.min(layout.width, POSTER_WIDTHS[0]) / displayWidth)
}

async function renderOnce() {
  renderError.value = ''
  try {
    const canvas = canvasNode ?? await getCanvas()
    canvasNode = canvas
    const tiles = await loadQrTiles(canvas)
    await renderPoster(canvas, tiles)
  }
  catch (error) {
    console.error('绘制海报失败:', error)
    renderError.value = '海报绘制失败，请返回后重试'
  }
}

/** 同一时刻只跑一次绘制；期间又有变更就在结束后再画一遍 */
async function render() {
  if (renderBusy) {
    renderPending = true
    return
  }
  renderBusy = true
  rendering.value = true
  try {
    do {
      renderPending = false
      await renderOnce()
    } while (renderPending)
  }
  finally {
    renderBusy = false
    rendering.value = false
  }
}

watch([themeKey, withQr, title, showTeacher, hideWeekend], () => {
  if (!loading.value)
    scheduleRender()
})

function selectTheme(key: PosterThemeKey) {
  if (key === themeKey.value)
    return
  themeKey.value = key
  savePosterTheme(key)
}

function handleQrChange(value: boolean) {
  withQr.value = value
}

async function handleShowNameChange(value: boolean) {
  showName.value = value
  // 直接从分享 / 深链进入时用户资料可能还没拉过；补拉失败只是海报上没名字，不提示
  if (value && !userStore.userInfo.name)
    await userStore.fetchUserInfo().catch(() => undefined)
}

function handleTeacherChange(value: boolean) {
  showTeacher.value = value
}

function handleHideWeekendChange(value: boolean) {
  hideWeekend.value = value
}

/** 旧后端没有整学期接口：路由级 404，不带学期相关的错误码 */
function isMissingEndpoint(error: unknown): boolean {
  const info = toRequestError(error)
  return info.statusCode === 404 && !TERM_ERROR_CODES.has(info.code)
}

/** 取 target 内容的数据（取过就跳过）；整学期接口不存在时记下并改取本周 */
async function ensureModeData(target: PosterMode) {
  if (target === 'term' && !overviewUnsupported.value) {
    if (overview.value)
      return
    try {
      overview.value = await getOverview({ term: query.value.term })
      return
    }
    catch (error) {
      if (!isMissingEndpoint(error))
        throw error
      overviewUnsupported.value = true
    }
  }
  if (!view.value)
    view.value = await getWeek(query.value)
}

/** 切换内容后补取数据再重绘；失败时在海报下方提示，可重试 */
async function loadModeData() {
  modeError.value = ''
  modeLoading.value = true
  try {
    await ensureModeData(mode.value)
  }
  catch (error) {
    modeError.value = handleApiException(error, { showToast: false }).message
    return
  }
  finally {
    modeLoading.value = false
  }
  await nextTick()
  await render()
}

function selectMode(key: PosterMode) {
  if (key === effectiveMode.value || (key === 'term' && overviewUnsupported.value))
    return
  mode.value = key
  savePosterMode(key)
  void loadModeData()
}

async function load() {
  loading.value = true
  loadError.value = ''
  modeError.value = ''
  // 重试时 canvas 节点会重建，不能沿用旧引用
  canvasNode = null
  // 分享素材单独请求：失败或过慢都不能挡住出图，晚到时由 watch 触发重绘补上二维码
  const assetsTask = getShareAssets()
    .then((result) => {
      assets.value = result
      withQr.value = !!(result.miniapp_qrcode || result.official_qrcode)
    })
    .catch(() => undefined)
  try {
    const [settingsData] = await Promise.all([
      getSettings(),
      ensureModeData(mode.value),
    ])
    showName.value = settingsData.share_show_name
    if (showName.value && !userStore.userInfo.name)
      await userStore.fetchUserInfo().catch(() => undefined)
  }
  catch (error) {
    loadError.value = handleApiException(error, { showToast: false }).message
    loading.value = false
    return
  }
  await Promise.race([assetsTask, sleep(ASSETS_WAIT_MS)])
  loading.value = false
  await nextTick()
  await render()
}

/* -------------------- 导出、保存与分享 -------------------- */

interface ExportRegion {
  x: number
  y: number
  width: number
  height: number
}

/** 导出画布；region 为空时导出整张（按画布实际像素输出） */
function exportImage(region: ExportRegion | null, dest: { width: number, height: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    // canvas 2d 需要传节点而不是 canvasId；uni 的类型声明只覆盖了旧版接口，运行时会原样透传给微信
    const options = {
      canvas: canvasNode,
      ...region,
      destWidth: Math.round(dest.width),
      destHeight: Math.round(dest.height),
      fileType: 'png',
      success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
      fail: reject,
    }
    uni.canvasToTempFilePath(options as unknown as UniApp.CanvasToTempFilePathOptions, instance?.proxy)
  })
}

/** 转发卡片按 5:4 裁切，取海报顶部（标题 + 表头 + 前几行）做缩略图；区域按画布的显示尺寸给 */
async function prepareShareImage(displayWidth: number, destScale: number) {
  const height = Math.round(displayWidth * 0.8)
  try {
    shareImagePath.value = await exportImage(
      { x: 0, y: 0, width: displayWidth, height },
      { width: displayWidth * destScale, height: height * destScale },
    )
  }
  catch {
    shareImagePath.value = ''
  }
}

function saveToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: reject,
    })
  })
}

async function handleSave() {
  const canvas = canvasNode
  if (saving.value || posterBlocked.value || !canvas)
    return
  saving.value = true
  try {
    const filePath = await exportImage(null, { width: canvas.width, height: canvas.height })
    await saveToAlbum(filePath)
    showMessage('已保存到相册', 'success')
  }
  catch (error) {
    const message = (error as { errMsg?: string } | null)?.errMsg ?? ''
    console.error('保存海报失败:', message)
    if (/auth|permission/i.test(message)) {
      const ok = await confirmModal({
        title: '需要相册权限',
        content: '保存海报需要访问相册，请在设置中允许“添加到相册”。',
        confirmText: '去设置',
      })
      if (ok)
        uni.openSetting()
    }
    else if (!/cancel/i.test(message)) {
      showMessage('保存失败，请重试', 'error')
    }
  }
  finally {
    saving.value = false
  }
}

onLoad((options) => {
  const term = options?.term ? decodeURIComponent(options.term) : undefined
  const week = Number(options?.week)
  query.value = {
    term: term || undefined,
    week: Number.isInteger(week) && week > 0 ? week : undefined,
  }
  void load()
})

onUnload(() => {
  // 页面已销毁，尚未执行的重绘作废
  scheduleRender.cancel()
})

onShareAppMessage(() => {
  const term = activeTerm.value
  let shareTitle = '我的课表'
  if (term && effectiveMode.value === 'term')
    shareTitle = `${title.value} · ${term.name}`
  else if (term && view.value)
    shareTitle = `${title.value} · ${term.name} 第 ${view.value.week} 周`
  return {
    title: shareTitle,
    path: '/pages/timetable/index',
    imageUrl: shareImagePath.value || undefined,
  }
})
</script>

<template>
  <view class="min-h-screen bg-page pb-10">
    <uv-toast ref="toastRef" />
    <PageState
      v-if="loading || loadError"
      :loading="loading"
      :error="loadError"
      loading-text="正在生成海报…"
      @retry="load"
    />

    <view v-else class="px-3 pt-3">
      <!-- 内容：整学期 / 本周 -->
      <view class="flex rounded-lg bg-fill p-1">
        <view
          v-for="item in MODE_OPTIONS"
          :key="item.key"
          class="flex-1 rounded-md py-1.5 text-center text-sm"
          :class="modeOptionClass(item.key)"
          @click="selectMode(item.key)"
        >
          <text>{{ item.label }}</text>
        </view>
      </view>
      <text class="mt-1 block px-1 text-2xs text-fg-3">{{ modeHint }}</text>

      <!-- 风格 -->
      <scroll-view class="mt-2" scroll-x :show-scrollbar="false">
        <view class="flex gap-2 px-0.5 py-1">
          <view
            v-for="item in themeOptions"
            :key="item.key"
            class="flex shrink-0 items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs"
            :class="item.key === themeKey ? 'border-primary bg-primary-light text-primary font-medium' : 'border-line bg-card text-fg-2'"
            @click="selectTheme(item.key)"
          >
            <view class="h-4 w-4 border border-line rounded-full" :style="swatchStyle(item)" />
            <text>{{ item.labels.name }}</text>
          </view>
        </view>
      </scroll-view>
      <text class="mt-1 block px-1 text-2xs text-fg-3">{{ theme.labels.description }}</text>

      <!-- 开关 -->
      <view class="mt-2 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 rounded-lg bg-card px-4 py-2.5 shadow-card">
        <view v-if="hasAssets" class="flex items-center gap-2">
          <text class="text-sm text-fg-2">附二维码</text>
          <uv-switch :model-value="withQr" size="20" :active-color="tokens.primary" @change="handleQrChange" />
        </view>
        <view class="flex items-center gap-2">
          <text class="text-sm text-fg-2">显示姓名</text>
          <uv-switch :model-value="showName" size="20" :active-color="tokens.primary" @change="handleShowNameChange" />
        </view>
        <view v-if="effectiveMode === 'term'" class="flex items-center gap-2">
          <text class="text-sm text-fg-2">显示教师</text>
          <uv-switch :model-value="showTeacher" size="20" :active-color="tokens.primary" @change="handleTeacherChange" />
        </view>
        <view v-if="canHideWeekend" class="flex items-center gap-2">
          <text class="text-sm text-fg-2">隐藏周末</text>
          <uv-switch :model-value="hideWeekend" size="20" :active-color="tokens.primary" @change="handleHideWeekendChange" />
        </view>
      </view>

      <!-- 海报 -->
      <view class="mt-3 flex flex-col items-center">
        <view class="overflow-hidden rounded-lg shadow-float" :class="{ 'opacity-40': modeLoading }">
          <canvas
            id="poster"
            type="2d"
            class="block"
            :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
          />
        </view>
        <view v-if="modeError" class="mt-3 flex items-center gap-3">
          <text class="text-sm text-error">{{ modeError }}</text>
          <text class="text-sm text-primary" @click="loadModeData">重试</text>
        </view>
        <text v-else-if="renderError" class="mt-3 text-sm text-error">{{ renderError }}</text>
        <text v-else-if="modeLoading" class="mt-3 text-xs text-fg-3">正在加载…</text>
        <text v-else-if="rendering" class="mt-3 text-xs text-fg-3">正在绘制…</text>
      </view>

      <view class="mt-4 flex gap-3">
        <button
          class="btn-primary flex-1"
          :disabled="saving || posterBlocked"
          @click="handleSave"
        >
          {{ saving ? '保存中…' : '保存到相册' }}
        </button>
        <button
          open-type="share"
          class="btn-secondary flex-1"
        >
          分享给朋友
        </button>
      </view>
      <text class="mt-3 block text-center text-2xs text-fg-3">
        保存后可发朋友圈；「分享给朋友」发送课表入口，附海报顶部缩略图
      </text>
    </view>
  </view>
</template>
