<script lang="ts" setup>
import type { Occurrence, Settings, WeekView } from '@/api/types/timetable'
import { onLoad } from '@dcloudio/uni-app'
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import { getSettings, getWeek } from '@/api/timetable'
import { getApiError } from '@/http/error'
import { useUserStore } from '@/store/user'
import { confirmModal } from '@/utils/dialog'
import {
  CALENDAR_SHADE_COLOR,
  calendarLabelColor,
  colorForOccurrence,
  dayInfo,
  KIND_BADGES,
  occurrenceRowSpan,
  readLocalHiddenIds,
  sectionRows,
  shortDate,
  suspendsClasses,
  WEEKDAY_LABELS,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '课表海报',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

/** 微信 canvas 2d 节点，只用到这几个成员 */
interface Canvas2D {
  width: number
  height: number
  getContext: (type: '2d') => CanvasRenderingContext2D
}

// 画布布局（逻辑像素）
const PADDING = 16
const HEADER = 76
/** 星期 + 日期 + 校历标签三行；标签行常驻占位 */
const DAY_HEADER = 52
const LEFT_COL = 34
const ROW = 44
const FOOTER = 32

const view = ref<WeekView | null>(null)
const settings = ref<Settings | null>(null)
const loading = ref(true)
const loadError = ref('')
const rendering = ref(false)
const renderError = ref('')
const saving = ref(false)
const canvasSize = ref({ width: 0, height: 0 })
const query = ref<{ term?: string, week?: number }>({})
const instance = getCurrentInstance()
const userStore = useUserStore()
let canvasNode: Canvas2D | null = null

const rows = computed(() => sectionRows(view.value?.term ?? null))
const displayName = computed(() => (settings.value?.share_show_name ? userStore.userInfo.name || '' : ''))
const title = computed(() => (displayName.value ? `${displayName.value}的课表` : '我的课表'))
const subtitle = computed(() => {
  const data = view.value
  if (!data)
    return ''
  const dates = data.week_dates
  const range = dates.length >= 7 ? ` · ${shortDate(dates[0])} – ${shortDate(dates[6])}` : ''
  return `${data.term.name} · 第 ${data.week} 周${range}`
})

function computeSize() {
  const info = uni.getWindowInfo()
  const width = Math.min(info.windowWidth - 24, 420)
  const height = PADDING * 2 + HEADER + DAY_HEADER + rows.value.length * ROW + FOOTER
  canvasSize.value = { width, height }
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

function drawPoster(ctx: CanvasRenderingContext2D, data: WeekView, width: number, height: number) {
  const sectionList = rows.value
  const gridTop = PADDING + HEADER + DAY_HEADER
  const gridLeft = PADDING + LEFT_COL
  const gridWidth = width - PADDING * 2 - LEFT_COL
  const gridHeight = sectionList.length * ROW
  const colWidth = gridWidth / 7

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // 顶部标题条
  ctx.fillStyle = '#2563eb'
  roundRect(ctx, PADDING, PADDING, width - PADDING * 2, HEADER - 12, 12)
  ctx.fill()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText(fitText(ctx, title.value, width - PADDING * 2 - 28), PADDING + 14, PADDING + 24)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillText(fitText(ctx, subtitle.value, width - PADDING * 2 - 28), PADDING + 14, PADDING + 46)

  // 星期表头与整列底色：停课列置灰，今日底色叠在其上（停课时半透明，两种标记同时可见）
  ctx.textAlign = 'center'
  for (let i = 0; i < 7; i++) {
    const x = gridLeft + i * colWidth
    const isToday = data.week_dates[i] === data.today.date
    const day = dayInfo(data, i)
    const suspended = suspendsClasses(day?.kind)
    if (suspended) {
      ctx.fillStyle = CALENDAR_SHADE_COLOR
      ctx.fillRect(x, PADDING + HEADER, colWidth, DAY_HEADER + gridHeight)
    }
    if (isToday) {
      ctx.globalAlpha = suspended ? 0.5 : 1
      ctx.fillStyle = '#eff6ff'
      ctx.fillRect(x, PADDING + HEADER, colWidth, DAY_HEADER + gridHeight)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = isToday ? '#2563eb' : '#374151'
    ctx.font = `${isToday ? 'bold ' : ''}12px sans-serif`
    ctx.fillText(`周${WEEKDAY_LABELS[i]}`, x + colWidth / 2, PADDING + HEADER + 14)
    ctx.fillStyle = isToday ? '#3b82f6' : '#9ca3af'
    ctx.font = '10px sans-serif'
    ctx.fillText(data.week_dates[i] ? shortDate(data.week_dates[i]) : '', x + colWidth / 2, PADDING + HEADER + 29)
    if (day?.label) {
      // 校历标签：放假 / 考试红，调休蓝，仅标注灰，与课表页同一套颜色
      ctx.fillStyle = calendarLabelColor(day.kind) || '#9ca3af'
      ctx.font = '8px sans-serif'
      ctx.fillText(fitText(ctx, day.label, colWidth - 4), x + colWidth / 2, PADDING + HEADER + 43)
    }
  }

  // 节次与网格线
  ctx.strokeStyle = '#f3f4f6'
  ctx.lineWidth = 1
  sectionList.forEach((row, index) => {
    const y = gridTop + index * ROW
    ctx.beginPath()
    ctx.moveTo(PADDING, y)
    ctx.lineTo(width - PADDING, y)
    ctx.stroke()
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(String(row.section), PADDING + LEFT_COL / 2, y + 15)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '8px sans-serif'
    ctx.fillText(row.start, PADDING + LEFT_COL / 2, y + 27)
    ctx.fillText(row.end, PADDING + LEFT_COL / 2, y + 36)
  })
  ctx.beginPath()
  ctx.moveTo(PADDING, gridTop + gridHeight)
  ctx.lineTo(width - PADDING, gridTop + gridHeight)
  ctx.stroke()
  for (let i = 0; i <= 7; i++) {
    const x = gridLeft + i * colWidth
    ctx.beginPath()
    ctx.moveTo(x, PADDING + HEADER)
    ctx.lineTo(x, gridTop + gridHeight)
    ctx.stroke()
  }

  // 日程格子
  const localHidden = new Set(readLocalHiddenIds())
  const visible = data.occurrences.filter(item => !item.hidden && !localHidden.has(item.id))
  const visibleIds = new Set(visible.map(item => item.id))
  const slots: Record<string, { index: number, count: number }> = {}
  for (const group of data.conflicts) {
    const ids = group.filter(id => visibleIds.has(id))
    ids.forEach((id, index) => {
      slots[id] = { index, count: ids.length }
    })
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (const occurrence of visible)
    drawBlock(ctx, occurrence, slots[occurrence.id] ?? { index: 0, count: 1 }, gridLeft, gridTop, colWidth)

  // 页脚
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillStyle = '#9ca3af'
  ctx.font = '11px sans-serif'
  ctx.fillText('元培智慧书院 · 课表', width - PADDING, height - PADDING - FOOTER / 2 + 4)
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  occurrence: Occurrence,
  slot: { index: number, count: number },
  gridLeft: number,
  gridTop: number,
  colWidth: number,
) {
  const { top, span } = occurrenceRowSpan(occurrence, rows.value)
  const color = colorForOccurrence(occurrence)
  const column = Math.min(Math.max(occurrence.weekday, 1), 7) - 1
  const slotWidth = colWidth / slot.count
  const x = gridLeft + column * colWidth + slot.index * slotWidth + 1.5
  const y = gridTop + top * ROW + 1.5
  const w = slotWidth - 3
  const h = span * ROW - 3
  if (w <= 4 || h <= 4)
    return

  ctx.fillStyle = color.bg
  roundRect(ctx, x, y, w, h, 4)
  ctx.fill()
  ctx.fillStyle = color.fg
  ctx.fillRect(x, y + 3, 2, h - 6)

  const textX = x + 5
  const textWidth = w - 8
  const lineHeight = 12
  const maxLines = Math.max(Math.floor((h - 6) / lineHeight), 1)
  ctx.font = 'bold 9px sans-serif'
  const titleLines = wrapText(ctx, occurrence.title, textWidth, Math.min(maxLines, 3))
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textX, y + 4 + index * lineHeight)
  })

  let nextY = y + 4 + titleLines.length * lineHeight
  ctx.font = '8px sans-serif'
  if (occurrence.location && titleLines.length < maxLines) {
    ctx.fillText(fitText(ctx, occurrence.location, textWidth), textX, nextY)
    nextY += lineHeight
  }
  const badge = KIND_BADGES[occurrence.kind]
  if (badge && nextY + lineHeight <= y + h - 2) {
    ctx.font = '7px sans-serif'
    const badgeWidth = ctx.measureText(badge).width + 6
    ctx.fillStyle = color.fg
    roundRect(ctx, x + w - badgeWidth - 3, y + h - 12, badgeWidth, 9, 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(badge, x + w - badgeWidth, y + h - 11)
  }
}

async function render() {
  const data = view.value
  if (!data)
    return
  rendering.value = true
  renderError.value = ''
  try {
    const canvas = await getCanvas()
    canvasNode = canvas
    const dpr = uni.getWindowInfo().pixelRatio || 2
    const { width, height } = canvasSize.value
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    drawPoster(ctx, data, width, height)
  }
  catch (error) {
    console.error('绘制海报失败:', error)
    renderError.value = '海报绘制失败，请返回后重试'
  }
  finally {
    rendering.value = false
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [weekData, settingsData] = await Promise.all([
      getWeek(query.value, { hideErrorToast: true }),
      getSettings({ hideErrorToast: true }),
    ])
    view.value = weekData
    settings.value = settingsData
    // 直接从分享/深链进入时用户资料可能还没拉过；姓名缺失就补拉一次，失败不影响出图
    if (settingsData.share_show_name && !userStore.userInfo.name)
      await userStore.fetchUserInfo().catch(() => undefined)
  }
  catch (error) {
    loadError.value = getApiError(error, '课表加载失败').message
    loading.value = false
    return
  }
  computeSize()
  loading.value = false
  await nextTick()
  await render()
}

function exportImage(): Promise<string> {
  return new Promise((resolve, reject) => {
    const { width, height } = canvasSize.value
    const dpr = uni.getWindowInfo().pixelRatio || 2
    // canvas 2d 需要传节点而不是 canvasId；uni 的类型声明只覆盖了旧版接口，运行时会原样透传给微信
    const options = {
      canvas: canvasNode,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width * dpr,
      destHeight: height * dpr,
      fileType: 'png',
      success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
      fail: reject,
    }
    uni.canvasToTempFilePath(options as unknown as UniApp.CanvasToTempFilePathOptions, instance?.proxy)
  })
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
    const filePath = await exportImage()
    await saveToAlbum(filePath)
    uni.showToast({ title: '已保存到相册', icon: 'success' })
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
      uni.showToast({ title: '保存失败，请重试', icon: 'none' })
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
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-10">
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

    <view v-else class="flex flex-col items-center px-3 pt-4">
      <view class="overflow-hidden rounded-xl bg-white shadow-md">
        <canvas
          id="poster"
          type="2d"
          class="block"
          :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
        />
      </view>
      <text v-if="renderError" class="mt-3 text-sm text-red-500">{{ renderError }}</text>
      <text class="mt-3 text-xs text-gray-400">
        {{ displayName ? '海报会显示你的姓名，可在课表设置中关闭' : '海报不显示姓名，可在课表设置中打开' }}
      </text>
      <button
        class="mt-4 w-full rounded-xl bg-blue-500 py-3 text-base text-white font-medium"
        :disabled="saving || rendering || !!renderError"
        @click="handleSave"
      >
        {{ saving ? '保存中…' : '保存到相册' }}
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
button::after {
  border: none;
}
</style>
