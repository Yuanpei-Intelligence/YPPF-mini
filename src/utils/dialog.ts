import { confirmDialog } from '@/hooks/useConfirm'

type ConfirmOptions = Omit<UniApp.ShowModalOptions, 'success' | 'fail' | 'complete'>

/**
 * Compatibility wrapper kept for existing callers. New code should call
 * `useConfirm().confirm(...)` directly (src/hooks/useConfirm.ts), which renders the
 * shared `uv-modal` instead of `uni.showModal`.
 *
 * Resolves `true` when the user confirms, `false` on cancel. Cancellation is not an
 * error; callers must not toast on it.
 */
export function confirmModal(options: ConfirmOptions): Promise<boolean> {
  return confirmDialog({
    title: options.title ?? '',
    content: options.content ?? '',
    confirmText: options.confirmText || '确定',
    cancelText: options.cancelText || '取消',
    showCancel: options.showCancel !== false,
    // Legacy callers signal a destructive action by passing a red confirm color.
    danger: Boolean(options.confirmColor && /^#?(?:cf2222|a81b1b|dc2626|ef4444|f56c6c|e45656|ff0000|f00)$/i.test(options.confirmColor)),
  })
}
