import { onShow } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'
import { isFeatureNotEnabledError } from '@/api/rollout'
import { useRolloutStore } from '@/store/rollout'

/** FeatureGate 组件的展示状态 */
export type FeatureGateStatus = 'loading' | 'enabled' | 'disabled' | 'error' | 'signed_out'

const PREVIEW_CHANNEL_PAGE = '/pages/me/preview'

/**
 * 页面级灰度门禁。
 *
 * 分享卡片、二维码会绕过菜单直接打开页面，所以受灰度保护的页面要自己判断。
 * 门禁只决定展示什么；后端接口仍会独立校验，并以 403 feature_not_enabled 拒绝。
 *
 * 用法：页面在 enabled 变为 true 后再加载自己的数据，请求失败时先交给 handleRequestError。
 *
 * ```vue
 * const { enabled, errorMessage, handleRequestError, openPreviewChannel, retry, status } = useFeatureGate('grades')
 * watch(enabled, (value) => { if (value) loadGrades() }, { immediate: true })
 * // catch (error) { if (!handleRequestError(error)) handleApiException(error) }
 *
 * <FeatureGate :status="status" :error-message="errorMessage" @open-preview="openPreviewChannel" @retry="retry">
 *   ...
 * </FeatureGate>
 * ```
 *
 * @param featureKey 功能标识，与后端 Feature.key 一致
 */
export function useFeatureGate(featureKey: string) {
  const rolloutStore = useRolloutStore()
  // 页面请求被 feature_not_enabled 拒绝后置为 true
  const denied = ref(false)

  const snapshotEnabled = computed(() => rolloutStore.status === 'ready' && rolloutStore.isEnabled(featureKey))

  // 快照追上接口的拒绝（变为未开放）或被清空之后，改由快照决定；
  // 快照仍显示开放时保持拒绝，避免页面反复请求同一个被拒的接口，
  // 用户可以在占位视图里点「刷新」（retry）重新检查。
  watch(snapshotEnabled, (value) => {
    if (!value)
      denied.value = false
  })

  const status = computed<FeatureGateStatus>(() => {
    if (denied.value)
      return 'disabled'
    switch (rolloutStore.status) {
      case 'ready':
        return snapshotEnabled.value ? 'enabled' : 'disabled'
      case 'error':
        return 'error'
      case 'signed_out':
        return 'signed_out'
      default:
        return 'loading'
    }
  })
  const enabled = computed(() => status.value === 'enabled')
  const errorMessage = computed(() => rolloutStore.loadError)

  /** 放下之前接口的拒绝，重新获取灰度状态后由最新快照决定 */
  function retry(): void {
    denied.value = false
    rolloutStore.refreshInBackground({ force: true })
  }

  /**
   * 处理页面请求的失败：是 feature_not_enabled 就切换到占位视图并刷新灰度状态。
   * @returns 是否已按灰度拒绝处理；返回 false 时由页面照常处理这个错误
   */
  function handleRequestError(error: unknown): boolean {
    if (!isFeatureNotEnabledError(error))
      return false
    denied.value = true
    rolloutStore.refreshInBackground({ force: true })
    return true
  }

  /** 打开体验通道页 */
  function openPreviewChannel(): void {
    uni.navigateTo({ url: PREVIEW_CHANNEL_PAGE })
  }

  // 每次显示页面都按节流刷新，覆盖从分享卡片冷启动直接进入的情况
  onShow(() => {
    rolloutStore.refreshInBackground()
  })

  return {
    status,
    enabled,
    errorMessage,
    retry,
    handleRequestError,
    openPreviewChannel,
  }
}
