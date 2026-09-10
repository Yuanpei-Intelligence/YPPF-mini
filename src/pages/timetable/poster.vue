<script lang="ts" setup>
import type { ShareAssets } from '@/api/types/share'
import type { Occurrence, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { PosterBadgeKind, PosterFill, PosterTheme, PosterThemeKey } from '@/utils/poster-themes'
import type { SectionRow } from '@/utils/timetable'
import { onLoad, onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { getShareAssets } from '@/api/share'
import { getSettings, getWeek } from '@/api/timetable'
import { useApiException } from '@/hooks/useApiException'
import { useUserStore } from '@/store/user'
import { debounce } from '@/utils/debounce'
import { confirmModal } from '@/utils/dialog'
import {
  blockColorFor,
  DEFAULT_POSTER_THEME,
  isGradient,
  POSTER_BADGE_KINDS,
  POSTER_THEME_KEYS,
  POSTER_THEMES,
  readPosterTheme,
  savePosterTheme,
  withAlpha,
} from '@/utils/poster-themes'
import {
  AUDIT_BADGE,
  calendarLabelColor,
  chineseDate,
  dayInfo,
  KIND_BADGES,
  occurrenceRowSpan,
  readLocalHiddenIds,
  sectionRows,
  shortDate,
  suspendsClasses,
  todayIso,
  WEEKDAY_LABELS,
  weekSuspendedReason,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '课表海报',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
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
  kind: 'course' | PosterBadgeKind
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

interface HeaderText {
  title: string
  subtitle: string
}

// 布局常量（逻辑像素），8px 节奏
const PAGE_PAD = 14
/** 页眉：标题 + 副标题 + 到卡片的间距 */
const HEADER_H = 78
const CARD_PAD = 10
/** 星期 + 日期 + 校历标签三行；标签行常驻占位 */
const DAY_HEADER_H = 50
const LEFT_COL = 26
const ROW_H = 40
const LEGEND_H = 26
const FOOTER_H = 46
const FOOTER_QR_H = 92
const QR_TILE = 56
const QR_GAP = 10
/** DPR 上限；再乘以画布尺寸不能超过微信 canvas 的长边上限 */
const MAX_DPR = 3
const MAX_CANVAS_SIDE = 4096
const IMAGE_TIMEOUT_MS = 8000
/** 出图前最多等二维码图片这么久；没等到就先画，图片到了再重绘补上 */
const QR_WAIT_MS = 1500
/** 首次出图最多等分享素材这么久，晚到的由重绘补上 */
const ASSETS_WAIT_MS = 2500
const RENDER_DEBOUNCE_MS = 150
const FALLBACK_SLOGAN = '元培智慧书院 · YPPF'

const LEGEND_ORDER: LegendItem['kind'][] = ['course', ...POSTER_BADGE_KINDS]

const view = ref<WeekView | null>(null)
const assets = ref<ShareAssets | null>(null)
const loading = ref(true)
const loadError = ref('')
const rendering = ref(false)
const renderError = ref('')
const saving = ref(false)
const canvasSize = ref({ width: 0, height: 0 })
const themeKey = ref<PosterThemeKey>(readPosterTheme() ?? DEFAULT_POSTER_THEME)
const withQr = ref(false)
/** 只作用于本页海报，不回写课表设置里的 share_show_name */
const showName = ref(false)
/** 转发卡片用的 5:4 缩略图（海报顶部），导出失败就用微信默认截图 */
const shareImagePath = ref('')
const query = ref<{ term?: string, week?: number }>({})
const instance = getCurrentInstance()
const userStore = useUserStore()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
let canvasNode: Canvas2D | null = null
/** 上次绘制用的缩放，保存相册时按同样分辨率导出 */
let renderedScale = 2
let renderBusy = false
let renderPending = false
const imageCache = new Map<string, Promise<CanvasImageSource | null>>()
/** 风格 / 开关 / 姓名变化后合并成一次重绘 */
const scheduleRender = debounce(() => {
  void render()
}, RENDER_DEBOUNCE_MS)

const themeOptions = POSTER_THEME_KEYS.map(key => POSTER_THEMES[key])
const theme = computed(() => POSTER_THEMES[themeKey.value])
const rows = computed(() => sectionRows(view.value?.term ?? null))
/** 后端没配公众号二维码（或素材接口失败）时用打包在小程序里的同一张图；换图以后端配置为准，这份只是兜底 */
const OFFICIAL_QR_FALLBACK = '/static/share/official_qrcode.png'
const hasAssets = computed(() => !!(assets.value?.miniapp_qrcode || assets.value?.official_qrcode))
const displayName = computed(() => (showName.value ? userStore.userInfo.name || '' : ''))
const title = computed(() => (displayName.value ? `${displayName.value}的课表` : '我的课表'))
const subtitle = computed(() => {
  const data = view.value
  if (!data)
    return ''
  const dates = data.week_dates
  const range = dates.length >= 7 ? ` · ${shortDate(dates[0])} – ${shortDate(dates[6])}` : ''
  return `${data.term.name} · 第 ${data.week} 周${range}`
})
const visibleOccurrences = computed(() => {
  const localHidden = new Set(readLocalHiddenIds())
  return (view.value?.occurrences ?? []).filter(item => !item.hidden && !localHidden.has(item.id))
})
/** 图例只列本周出现过的类别；学校课程无角标，其余按角标文案 */
const legendItems = computed<LegendItem[]>(() => {
  const present = new Set(visibleOccurrences.value.map(item => item.kind as string))
  return LEGEND_ORDER
    .filter(kind => present.has(kind))
    .map(kind => ({ kind, label: kind === 'course' ? '学校课程' : KIND_BADGES[kind] ?? kind }))
})

function badgeKindOf(kind: string): PosterBadgeKind | null {
  return (POSTER_BADGE_KINDS as readonly string[]).includes(kind) ? kind as PosterBadgeKind : null
}

function swatchStyle(item: PosterTheme) {
  return { background: `linear-gradient(135deg, ${item.swatch[0]} 50%, ${item.swatch[1]} 50%)` }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* -------------------- 画布与布局 -------------------- */

function posterWidth(): number {
  const info = uni.getWindowInfo()
  return Math.min(info.windowWidth - 24, 400)
}

function buildLayout(width: number, rowCount: number, hasLegend: boolean, hasTiles: boolean): PosterLayout {
  const cardX = PAGE_PAD
  const cardY = PAGE_PAD + HEADER_H
  const cardW = width - PAGE_PAD * 2
  const innerLeft = cardX + CARD_PAD
  const innerWidth = cardW - CARD_PAD * 2
  const dayHeaderTop = cardY + CARD_PAD
  const gridTop = dayHeaderTop + DAY_HEADER_H
  const gridHeight = Math.max(rowCount, 1) * ROW_H
  const legendTop = gridTop + gridHeight
  const legendHeight = hasLegend ? LEGEND_H : 8
  const footerTop = legendTop + legendHeight
  const footerHeight = hasTiles ? FOOTER_QR_H : FOOTER_H
  const cardH = footerTop + footerHeight - cardY
  return {
    width,
    height: cardY + cardH + PAGE_PAD,
    headerTop: PAGE_PAD + 10,
    cardX,
    cardY,
    cardW,
    cardH,
    innerLeft,
    innerWidth,
    dayHeaderTop,
    gridTop,
    gridLeft: innerLeft + LEFT_COL,
    gridWidth: innerWidth - LEFT_COL,
    gridHeight,
    colWidth: (innerWidth - LEFT_COL) / 7,
    legendTop,
    legendHeight,
    footerTop,
    footerHeight,
  }
}

/** 设备 DPR，封顶 3，且保证放大后的长边不超过微信 canvas 上限 */
function canvasScale(layout: PosterLayout): number {
  const pixelRatio = uni.getWindowInfo().pixelRatio || 2
  const longest = Math.max(layout.width, layout.height, 1)
  return Math.max(1, Math.min(pixelRatio, MAX_DPR, MAX_CANVAS_SIDE / longest))
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

/** 按字符折行，最多 maxLines 行，最后一行超出时补省略号 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []
  if (maxLines <= 0)
    return lines
  let current = ''
  for (const char of Array.from(text)) {
    const next = current + char
    if (current && ctx.measureText(next).width > maxWidth) {
      if (lines.length === maxLines - 1) {
        lines.push(fitText(ctx, next, maxWidth))
        return lines
      }
      lines.push(current)
      current = char
    }
    else {
      current = next
    }
  }
  if (current)
    lines.push(current)
  return lines
}

/* -------------------- 绘制 -------------------- */

function drawPoster(
  ctx: CanvasRenderingContext2D,
  data: WeekView,
  theme: PosterTheme,
  layout: PosterLayout,
  header: HeaderText,
  sectionList: SectionRow[],
  tiles: QrTile[],
) {
  ctx.clearRect(0, 0, layout.width, layout.height)
  drawPage(ctx, theme, layout)
  drawHeader(ctx, data, theme, layout, header)
  drawCard(ctx, theme, layout)
  drawDayHeader(ctx, data, theme, layout)
  drawGrid(ctx, theme, layout, sectionList)
  drawBlocks(ctx, data, theme, layout, sectionList)
  drawLegend(ctx, theme, layout)
  drawFooter(ctx, theme, layout, tiles)
}

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
function drawHeader(ctx: CanvasRenderingContext2D, data: WeekView, theme: PosterTheme, layout: PosterLayout, header: HeaderText) {
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
    ctx.textAlign = 'right'
    ctx.fillStyle = withAlpha('#ffffff', 0.32)
    setFont(ctx, 44, 'bold')
    const numeral = String(data.week)
    const numeralWidth = ctx.measureText(numeral).width
    ctx.fillText(numeral, width - PAGE_PAD - 18, headerTop - 8)
    setFont(ctx, 12, 'bold')
    ctx.fillText('周', width - PAGE_PAD - 4, headerTop + 22)
    titleWidth -= numeralWidth + 34
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

/** 星期表头与整列底色：停课列置灰，今日列淡色并给表头一枚强调色胶囊 */
function drawDayHeader(ctx: CanvasRenderingContext2D, data: WeekView, theme: PosterTheme, layout: PosterLayout) {
  const { dayHeaderTop, gridTop, gridLeft, gridHeight, colWidth } = layout
  const bottom = gridTop + gridHeight
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 7; i++) {
    const x = gridLeft + i * colWidth
    const centre = x + colWidth / 2
    const date = data.week_dates[i] ?? ''
    const isToday = !!date && date === data.today.date
    const day = dayInfo(data, i)
    const suspended = suspendsClasses(day?.kind)
    if (suspended) {
      ctx.fillStyle = theme.grid.suspended
      ctx.fillRect(x, dayHeaderTop, colWidth, bottom - dayHeaderTop)
    }
    if (isToday) {
      ctx.fillStyle = withAlpha(theme.grid.today, 0.08)
      ctx.fillRect(x, gridTop, colWidth, gridHeight)
      ctx.fillStyle = theme.header.accent
      roundRect(ctx, x + 3, dayHeaderTop + 2, colWidth - 6, 32, 8)
      ctx.fill()
    }
    ctx.fillStyle = isToday ? theme.text.onAccent : theme.text.secondary
    setFont(ctx, 11, 'bold')
    ctx.fillText(`周${WEEKDAY_LABELS[i]}`, centre, dayHeaderTop + 12)
    ctx.fillStyle = isToday ? theme.text.onAccent : theme.text.muted
    setFont(ctx, 9)
    ctx.fillText(date ? shortDate(date) : '', centre, dayHeaderTop + 26)
    const label = day?.label || (suspended ? '停课' : '')
    if (label) {
      // 校历标签：放假 / 考试红，调休蓝，仅标注灰，与课表页同一套颜色
      ctx.fillStyle = calendarLabelColor(day?.kind) || theme.text.muted
      setFont(ctx, 8)
      ctx.fillText(fitText(ctx, label, colWidth - 4), centre, dayHeaderTop + 43)
    }
  }
}

/** 节次列与网格线 */
function drawGrid(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout, sectionList: SectionRow[]) {
  const { innerLeft, innerWidth, gridTop, gridLeft, gridHeight, colWidth } = layout
  const labelX = innerLeft + LEFT_COL / 2
  ctx.strokeStyle = theme.grid.line
  ctx.lineWidth = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  sectionList.forEach((row, index) => {
    const y = gridTop + index * ROW_H
    strokeLine(ctx, innerLeft, y, innerLeft + innerWidth, y)
    ctx.fillStyle = theme.grid.section
    setFont(ctx, 11, 'bold')
    ctx.fillText(String(row.section), labelX, y + 13)
    ctx.fillStyle = theme.text.muted
    setFont(ctx, 7.5)
    ctx.fillText(row.start, labelX, y + 25)
    ctx.fillText(row.end, labelX, y + 34)
  })
  strokeLine(ctx, innerLeft, gridTop + gridHeight, innerLeft + innerWidth, gridTop + gridHeight)
  for (let i = 0; i <= 7; i++) {
    const x = gridLeft + i * colWidth
    strokeLine(ctx, x, gridTop, x, gridTop + gridHeight)
  }
}

/** 日程格子；没有日程时在网格中央写一行空状态 */
function drawBlocks(ctx: CanvasRenderingContext2D, data: WeekView, theme: PosterTheme, layout: PosterLayout, sectionList: SectionRow[]) {
  const visible = visibleOccurrences.value
  if (!visible.length) {
    const reason = weekSuspendedReason(data)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.text.muted
    setFont(ctx, 13)
    ctx.fillText(
      reason ? `${reason} · 本周停课` : '本周还没有日程',
      layout.gridLeft + layout.gridWidth / 2,
      layout.gridTop + layout.gridHeight / 2,
    )
    return
  }
  // 时间冲突的日程并排摆放
  const visibleIds = new Set(visible.map(item => item.id))
  const slots: Record<string, { index: number, count: number }> = {}
  for (const group of data.conflicts) {
    const ids = group.filter(id => visibleIds.has(id))
    ids.forEach((id, index) => {
      slots[id] = { index, count: ids.length }
    })
  }
  for (const occurrence of visible)
    drawBlock(ctx, occurrence, slots[occurrence.id] ?? { index: 0, count: 1 }, theme, layout, sectionList)
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  occurrence: Occurrence,
  slot: { index: number, count: number },
  theme: PosterTheme,
  layout: PosterLayout,
  sectionList: SectionRow[],
) {
  const { gridLeft, gridTop, colWidth } = layout
  const { top, span } = occurrenceRowSpan(occurrence, sectionList)
  const color = blockColorFor(theme, occurrence)
  const column = Math.min(Math.max(occurrence.weekday, 1), 7) - 1
  const slotWidth = colWidth / slot.count
  const x = gridLeft + column * colWidth + slot.index * slotWidth + 2
  const y = gridTop + top * ROW_H + 2
  const w = slotWidth - 4
  const h = span * ROW_H - 4
  if (w <= 4 || h <= 4)
    return

  ctx.save()
  if (occurrence.status === 'canceled')
    ctx.globalAlpha = 0.55
  ctx.fillStyle = color.bg
  roundRect(ctx, x, y, w, h, theme.block.radius)
  ctx.fill()
  if (theme.block.bar) {
    ctx.fillStyle = color.fg
    roundRect(ctx, x + 3, y + 5, 2.5, h - 10, 1.25)
    ctx.fill()
  }

  const textX = x + (theme.block.bar ? 9 : 6)
  const textWidth = w - (theme.block.bar ? 12 : 10)
  const lineHeight = 12
  const badgeKind = badgeKindOf(occurrence.kind)
  const badge = badgeKind ? KIND_BADGES[badgeKind] ?? '' : ''
  const audit = occurrence.role === 'audit'
  // 底部一行放类别角标与旁听的「旁」字（靠右并排）；要放它们时给底部留出一行，格子很矮时标题让位
  const hasBadgeRow = !!badge || audit
  const maxLines = Math.max(Math.floor((h - 8 - (hasBadgeRow ? 11 : 0)) / lineHeight), 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = color.fg
  setFont(ctx, 9, 'bold')
  const titleLines = wrapText(ctx, occurrence.title, textWidth, Math.min(maxLines, 2))
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textX, y + 5 + index * lineHeight)
  })
  let nextY = y + 5 + titleLines.length * lineHeight
  if (occurrence.location && titleLines.length < maxLines) {
    ctx.fillStyle = withAlpha(color.fg, 0.8)
    setFont(ctx, 8)
    ctx.fillText(fitText(ctx, occurrence.location, textWidth), textX, nextY)
    nextY += lineHeight
  }
  if (hasBadgeRow && nextY + 11 <= y + h - 3) {
    const pillY = y + h - 15
    let right = x + w - 4
    setFont(ctx, 7, 'bold')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (badgeKind && badge) {
      const badgeColor = theme.badges[badgeKind]
      const badgeWidth = ctx.measureText(badge).width + 8
      ctx.fillStyle = badgeColor.bg
      roundRect(ctx, right - badgeWidth, pillY, badgeWidth, 11, 5.5)
      ctx.fill()
      ctx.fillStyle = badgeColor.fg
      ctx.fillText(badge, right - badgeWidth / 2, pillY + 5.5)
      right -= badgeWidth + 3
    }
    if (audit) {
      // 旁听课程的「旁」字小标，和课表页一致
      const auditWidth = ctx.measureText(AUDIT_BADGE).width + 6
      ctx.fillStyle = withAlpha(color.fg, 0.18)
      roundRect(ctx, right - auditWidth, pillY, auditWidth, 11, 5.5)
      ctx.fill()
      ctx.fillStyle = color.fg
      ctx.fillText(AUDIT_BADGE, right - auditWidth / 2, pillY + 5.5)
    }
  }
  ctx.restore()
}

/** 图例：本周出现过的类别 */
function drawLegend(ctx: CanvasRenderingContext2D, theme: PosterTheme, layout: PosterLayout) {
  const items = legendItems.value
  if (!items.length)
    return
  const y = layout.legendTop + layout.legendHeight / 2
  let x = layout.innerLeft + 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const item of items) {
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
    ctx.fillStyle = theme.legend.text
    setFont(ctx, 9)
    ctx.fillText(item.label, x + 13, y)
    x += 13 + ctx.measureText(item.label).width + 14
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

/* -------------------- 渲染流程 -------------------- */

async function renderOnce() {
  const data = view.value
  if (!data)
    return
  renderError.value = ''
  try {
    const canvas = canvasNode ?? await getCanvas()
    canvasNode = canvas
    const tiles = await loadQrTiles(canvas)
    const layout = buildLayout(posterWidth(), rows.value.length, legendItems.value.length > 0, tiles.length > 0)
    canvasSize.value = { width: layout.width, height: layout.height }
    await nextTick()
    const scale = canvasScale(layout)
    renderedScale = scale
    canvas.width = Math.round(layout.width * scale)
    canvas.height = Math.round(layout.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    drawPoster(ctx, data, theme.value, layout, { title: title.value, subtitle: subtitle.value }, rows.value, tiles)
    void prepareShareImage(layout)
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

watch([themeKey, withQr, title], () => {
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

async function load() {
  loading.value = true
  loadError.value = ''
  // 重试时 canvas 节点会重建，不能沿用旧引用
  canvasNode = null
  // 分享素材单独请求：失败或过慢都不能挡住出图，晚到时由 watch 触发重绘补上二维码
  const assetsTask = getShareAssets()
    .then((result) => {
      assets.value = { ...result, official_qrcode: result.official_qrcode || OFFICIAL_QR_FALLBACK }
      withQr.value = true
    })
    .catch(() => {
      assets.value = { miniapp_qrcode: null, official_qrcode: OFFICIAL_QR_FALLBACK, slogan: '' }
      withQr.value = true
    })
  try {
    const [weekData, settingsData] = await Promise.all([
      getWeek(query.value),
      getSettings(),
    ])
    view.value = weekData
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

function exportImage(region: ExportRegion, scale: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // canvas 2d 需要传节点而不是 canvasId；uni 的类型声明只覆盖了旧版接口，运行时会原样透传给微信
    const options = {
      canvas: canvasNode,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      destWidth: Math.round(region.width * scale),
      destHeight: Math.round(region.height * scale),
      fileType: 'png',
      success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
      fail: reject,
    }
    uni.canvasToTempFilePath(options as unknown as UniApp.CanvasToTempFilePathOptions, instance?.proxy)
  })
}

/** 转发卡片按 5:4 裁切，取海报顶部（标题 + 表头 + 前几行）做缩略图 */
async function prepareShareImage(layout: PosterLayout) {
  try {
    shareImagePath.value = await exportImage(
      { x: 0, y: 0, width: layout.width, height: Math.round(layout.width * 0.8) },
      2,
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
  if (saving.value || rendering.value || !canvasNode)
    return
  saving.value = true
  try {
    const { width, height } = canvasSize.value
    const filePath = await exportImage({ x: 0, y: 0, width, height }, renderedScale)
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

onShareAppMessage(() => ({
  title: view.value ? `${title.value} · ${view.value.term.name} 第 ${view.value.week} 周` : '我的课表',
  path: '/pages/timetable/index',
  imageUrl: shareImagePath.value || undefined,
}))
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-10">
    <uv-toast ref="toastRef" />
    <view v-if="loading" class="flex flex-col items-center justify-center py-24 text-sm text-gray-400">
      <uv-loading-icon mode="circle" />
      <text class="mt-3">正在生成海报…</text>
    </view>

    <view v-else-if="loadError" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-warning-alt mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ loadError }}</text>
      <button class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="load">
        重试
      </button>
    </view>

    <view v-else class="px-3 pt-3">
      <!-- 风格 -->
      <scroll-view scroll-x :show-scrollbar="false">
        <view class="flex gap-2 px-0.5 py-1">
          <view
            v-for="item in themeOptions"
            :key="item.key"
            class="flex shrink-0 items-center gap-1.5 border rounded-full px-3 py-1.5 text-xs"
            :class="item.key === themeKey ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium' : 'border-gray-200 bg-white text-gray-600'"
            @click="selectTheme(item.key)"
          >
            <view class="h-4 w-4 border border-gray-200 rounded-full" :style="swatchStyle(item)" />
            <text>{{ item.labels.name }}</text>
          </view>
        </view>
      </scroll-view>
      <text class="mt-1 block px-1 text-2xs text-gray-400">{{ theme.labels.description }}</text>

      <!-- 开关 -->
      <view class="mt-2 flex items-center justify-end gap-5 rounded-xl bg-white px-4 py-2.5 shadow-sm">
        <view v-if="hasAssets" class="flex items-center gap-2">
          <text class="text-sm text-gray-700">附二维码</text>
          <uv-switch :model-value="withQr" size="20" active-color="#2563eb" @change="handleQrChange" />
        </view>
        <view class="flex items-center gap-2">
          <text class="text-sm text-gray-700">显示姓名</text>
          <uv-switch :model-value="showName" size="20" active-color="#2563eb" @change="handleShowNameChange" />
        </view>
      </view>

      <!-- 海报 -->
      <view class="mt-3 flex flex-col items-center">
        <view class="overflow-hidden rounded-2xl shadow-lg">
          <canvas
            id="poster"
            type="2d"
            class="block"
            :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
          />
        </view>
        <text v-if="renderError" class="mt-3 text-sm text-red-500">{{ renderError }}</text>
        <text v-else-if="rendering" class="mt-3 text-xs text-gray-400">正在绘制…</text>
      </view>

      <view class="mt-4 flex gap-3">
        <button
          class="flex-1 rounded-xl bg-blue-500 py-3 text-base text-white font-medium"
          :disabled="saving || rendering || !!renderError"
          @click="handleSave"
        >
          {{ saving ? '保存中…' : '保存到相册' }}
        </button>
        <button
          open-type="share"
          class="flex-1 border border-blue-500 rounded-xl bg-white py-3 text-base text-blue-600 font-medium"
        >
          分享给朋友
        </button>
      </view>
      <text class="mt-3 block text-center text-2xs text-gray-400">
        保存后可发朋友圈；「分享给朋友」发送课表入口，附海报顶部缩略图
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
button::after {
  border: none;
}
</style>
