import { reactive } from 'vue'

/**
 * Programmatic confirmation dialog backed by one global `uv-modal`
 * (`src/components/AppConfirmModal.vue`, mounted in `App.ku.vue`).
 *
 * Usage in a page:
 *   const { confirm } = useConfirm()
 *   const ok = await confirm({ title: '取消预约', content: '取消后名额会立即释放。', confirmText: '取消预约', danger: true })
 *   if (!ok) return
 *
 * Cancellation is not an error: `confirm` resolves `false`, never rejects.
 * Only one dialog is shown at a time; a new request settles the previous one as `false`.
 */
export interface ConfirmOptions {
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  /** Show the cancel button. Default `true`. Set `false` for an acknowledge-only alert. */
  showCancel?: boolean
  /** Paint the confirm button in the error color. Use only for destructive actions. */
  danger?: boolean
}

type ResolvedOptions = Required<ConfirmOptions>

interface ConfirmState {
  visible: boolean
  /** Increments on every request so the modal component can re-open. */
  seq: number
  options: ResolvedOptions
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  title: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  showCancel: true,
  danger: false,
}

const state = reactive<ConfirmState>({
  visible: false,
  seq: 0,
  options: { ...DEFAULT_OPTIONS },
})

let pending: ((value: boolean) => void) | null = null

function settle(value: boolean): void {
  const resolve = pending
  pending = null
  state.visible = false
  resolve?.(value)
}

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const normalized: ConfirmOptions = typeof options === 'string' ? { content: options } : options
  if (pending)
    settle(false)
  state.options = { ...DEFAULT_OPTIONS, ...normalized }
  state.seq += 1
  state.visible = true
  return new Promise<boolean>((resolve) => {
    pending = resolve
  })
}

/** Page-facing hook. */
export function useConfirm() {
  return { confirm: confirmDialog }
}

/** Internal: consumed by `AppConfirmModal.vue` only. */
export function useConfirmState() {
  return { state, settle }
}
