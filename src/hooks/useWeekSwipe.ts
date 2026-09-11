import { computed, ref } from 'vue'

/*
 * Horizontal swipe between weeks on the timetable grid.
 * The touch handlers are bound without `catch`, so vertical scrolling and pull-to-refresh keep
 * working: a gesture only turns into a week swipe once it is clearly horizontal.
 */

/** 1 = next week, -1 = previous week */
export type WeekDirection = 1 | -1

/**
 * idle → drag → settle (not far enough) | nudge → bounce (no week there) | out → wait → enter-start → enter
 */
export type SwipePhase = 'idle' | 'drag' | 'settle' | 'nudge' | 'bounce' | 'out' | 'wait' | 'enter-start' | 'enter'

interface TouchPoint {
  clientX: number
  clientY: number
}

/** uni passes TouchDetail[] and the DOM a TouchList; only the first touch is read */
export interface SwipeTouchEvent {
  touches?: ArrayLike<TouchPoint>
  changedTouches?: ArrayLike<TouchPoint>
}

export interface EdgeHint {
  direction: WeekDirection
  /** Follows the drag distance, 1 once a release would switch the week */
  opacity: number
  armed: boolean
}

export interface UseWeekSwipeOptions {
  /** Whether the neighbouring week exists */
  canGo: (direction: WeekDirection) => boolean
  /** Show the neighbouring week; resolves once it is on screen or the request has failed */
  go: (direction: WeekDirection) => Promise<void>
  /** A horizontal drag has started */
  onDragStart?: () => void
}

/** Movement (px) before the gesture's axis is decided */
const LOCK_DISTANCE = 10
/** The gesture is horizontal when |dx| > AXIS_RATIO × |dy| */
const AXIS_RATIO = 1.5
/** Releasing past this distance (px) switches the week… */
export const COMMIT_DISTANCE = 60
/** …and so does a flick this fast (px/ms) over at least FLICK_MIN_DISTANCE */
const FLICK_VELOCITY = 0.45
const FLICK_MIN_DISTANCE = 20
/** Touch samples younger than this (ms) make up the release velocity */
const VELOCITY_WINDOW = 100
/** Rubber band at the first / last week */
const EDGE_RESISTANCE = 0.3
const EDGE_MAX_OFFSET = 48
/** A flick at the edge barely moves the grid; push it this far (px) so the bounce is visible */
const EDGE_NUDGE = 20

const OUT_MS = 100
const ENTER_MS = 180
const SETTLE_MS = 180
const NUDGE_MS = 90
const BOUNCE_MS = 280
/** Lets the off-screen start position render before the enter transition starts */
const FRAME_MS = 34
/** How far (of its own width) the grid travels when a week slides out or in */
const SLIDE_SHIFT = '24%'

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function firstTouch(list?: ArrayLike<TouchPoint>): TouchPoint | null {
  return list && list.length > 0 ? list[0] : null
}

export function useWeekSwipe(options: UseWeekSwipeOptions) {
  const phase = ref<SwipePhase>('idle')
  /** Horizontal offset (px) while dragging or nudging */
  const offset = ref(0)
  /** Direction of the current drag or slide */
  const direction = ref<WeekDirection>(1)
  /** The week being dragged towards does not exist */
  const blocked = ref(false)

  let start: { x: number, y: number } | null = null
  let axis: 'none' | 'x' | 'y' = 'none'
  let samples: { x: number, t: number }[] = []

  /** A drag or an animation is in progress: taps on the grid are ignored */
  const busy = computed(() => phase.value !== 'idle')

  const slideStyle = computed(() => {
    // The grid leaves in the swipe direction (next week: to the left) and the new week comes from the other side
    const away = direction.value > 0 ? `-${SLIDE_SHIFT}` : SLIDE_SHIFT
    const from = direction.value > 0 ? SLIDE_SHIFT : `-${SLIDE_SHIFT}`
    switch (phase.value) {
      case 'drag':
        return `transform: translate3d(${offset.value}px, 0, 0)`
      case 'nudge':
        return `transform: translate3d(${offset.value}px, 0, 0); transition: transform ${NUDGE_MS}ms ease-out`
      case 'settle':
        return `transform: translate3d(0, 0, 0); transition: transform ${SETTLE_MS}ms ease-out`
      case 'bounce':
        return `transform: translate3d(0, 0, 0); transition: transform ${BOUNCE_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1)`
      case 'out':
        return `transform: translate3d(${away}, 0, 0); opacity: 0; transition: transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`
      case 'wait':
        return `transform: translate3d(${away}, 0, 0); opacity: 0`
      case 'enter-start':
        return `transform: translate3d(${from}, 0, 0); opacity: 0`
      case 'enter':
        return `transform: translate3d(0, 0, 0); opacity: 1; transition: transform ${ENTER_MS}ms ease-out, opacity ${ENTER_MS}ms ease-out`
      default:
        // No transform at rest: it would turn the grid into the containing block of fixed descendants
        return ''
    }
  })

  /** Chevron at the edge being pulled; null unless dragging towards a week that exists */
  const edgeHint = computed<EdgeHint | null>(() => {
    if (phase.value !== 'drag' || blocked.value || offset.value === 0)
      return null
    const distance = Math.abs(offset.value)
    return {
      direction: direction.value,
      opacity: Math.min(distance / COMMIT_DISTANCE, 1),
      armed: distance >= COMMIT_DISTANCE,
    }
  })

  function resetGesture() {
    start = null
    axis = 'none'
    samples = []
  }

  function finish() {
    phase.value = 'idle'
    offset.value = 0
    blocked.value = false
  }

  function onTouchStart(event: SwipeTouchEvent) {
    resetGesture()
    if (phase.value !== 'idle' || (event.touches?.length ?? 0) > 1)
      return
    const point = firstTouch(event.touches)
    if (point)
      start = { x: point.clientX, y: point.clientY }
  }

  function onTouchMove(event: SwipeTouchEvent) {
    if (!start || axis === 'y')
      return
    if ((event.touches?.length ?? 0) > 1) {
      onTouchCancel()
      return
    }
    const point = firstTouch(event.touches)
    if (!point)
      return
    const dx = point.clientX - start.x
    const dy = point.clientY - start.y
    if (axis === 'none') {
      if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE)
        return
      if (Math.abs(dx) <= Math.abs(dy) * AXIS_RATIO) {
        // Vertical scroll: leave the rest of this gesture alone
        axis = 'y'
        return
      }
      axis = 'x'
      phase.value = 'drag'
      options.onDragStart?.()
    }
    const towards: WeekDirection = dx < 0 ? 1 : -1
    direction.value = towards
    blocked.value = !options.canGo(towards)
    offset.value = blocked.value
      ? Math.sign(dx) * Math.min(Math.abs(dx) * EDGE_RESISTANCE, EDGE_MAX_OFFSET)
      : dx
    const now = Date.now()
    samples.push({ x: point.clientX, t: now })
    samples = samples.filter(sample => now - sample.t <= VELOCITY_WINDOW)
  }

  /** px/ms over the last VELOCITY_WINDOW; 0 without two recent samples */
  function releaseVelocity(recent: { x: number, t: number }[], now: number): number {
    const fresh = recent.filter(sample => now - sample.t <= VELOCITY_WINDOW)
    if (fresh.length < 2)
      return 0
    const first = fresh[0]
    const last = fresh[fresh.length - 1]
    const elapsed = last.t - first.t
    return elapsed > 0 ? (last.x - first.x) / elapsed : 0
  }

  function onTouchEnd(event: SwipeTouchEvent) {
    const began = start
    const horizontal = axis === 'x'
    const recent = samples
    resetGesture()
    if (!began || !horizontal || phase.value !== 'drag')
      return
    const now = Date.now()
    const point = firstTouch(event.changedTouches)
    if (point)
      recent.push({ x: point.clientX, t: now })
    const endX = point ? point.clientX : recent.length ? recent[recent.length - 1].x : began.x
    const dx = endX - began.x
    const towards: WeekDirection = dx < 0 ? 1 : -1
    const velocity = releaseVelocity(recent, now)
    const flick = Math.abs(velocity) >= FLICK_VELOCITY
      && Math.abs(dx) >= FLICK_MIN_DISTANCE
      && Math.sign(velocity) === Math.sign(dx)
    if (Math.abs(dx) < COMMIT_DISTANCE && !flick) {
      void settle()
      return
    }
    if (!options.canGo(towards)) {
      direction.value = towards
      void bounce()
      return
    }
    void slide(towards, () => options.go(towards))
  }

  function onTouchCancel() {
    const dragging = phase.value === 'drag'
    resetGesture()
    if (dragging)
      void settle()
  }

  async function settle() {
    phase.value = 'settle'
    await wait(SETTLE_MS)
    finish()
  }

  /** Rubber band at the first / last week: spring back past the rest position */
  async function bounce() {
    if (Math.abs(offset.value) < EDGE_NUDGE) {
      offset.value = -direction.value * EDGE_NUDGE
      phase.value = 'nudge'
      await wait(NUDGE_MS)
    }
    phase.value = 'bounce'
    await wait(BOUNCE_MS)
    finish()
  }

  /**
   * Slide the grid out in `towards`, run `change` (which puts the other week on screen),
   * then slide the grid back in from the opposite side. Also used by the week picker and 回到本周.
   */
  async function slide(towards: WeekDirection, change: () => Promise<void>) {
    if (phase.value !== 'idle' && phase.value !== 'drag')
      return
    direction.value = towards
    phase.value = 'out'
    await wait(OUT_MS)
    phase.value = 'wait'
    try {
      await change()
    }
    catch {
      // The page reports request failures itself; the grid still has to come back
    }
    phase.value = 'enter-start'
    await wait(FRAME_MS)
    phase.value = 'enter'
    await wait(ENTER_MS)
    finish()
  }

  return {
    phase,
    busy,
    slideStyle,
    edgeHint,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    slide,
  }
}
