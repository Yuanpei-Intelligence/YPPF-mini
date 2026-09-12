import type { Experiment, FeedbackRouting, PreviewState, RolloutState } from '@/api/types/rollout'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getRolloutState, joinPreview, leavePreview } from '@/api/rollout'
import { RequestError, toRequestError } from '@/http/errors'
import { useTokenStore } from './token'
import { useUserStore } from './user'

/** 同一账号两次自动刷新之间的最短间隔 */
const REFRESH_INTERVAL_MS = 60 * 1000

/** 某个账号的灰度状态快照 */
export interface RolloutSnapshot {
  /** 快照所属账号的 username；与当前登录账号不一致时整份快照不生效 */
  account: string
  state: RolloutState
  /** 取回快照时的本地时间戳（毫秒） */
  loadedAt: number
}

/**
 * 当前账号灰度状态的加载情况：
 * - signed_out：没有登录，也没有进行中的登录
 * - loading：正在获取，或在等自动登录完成
 * - ready：已有当前账号的快照（可能是上次启动留下的，后台会刷新）
 * - error：没有快照，且获取失败
 */
export type RolloutLoadStatus = 'signed_out' | 'loading' | 'ready' | 'error'

export interface RefreshRolloutOptions {
  /** 忽略节流立即获取；同一账号已有请求在途时仍复用它 */
  force?: boolean
}

interface InflightRequest {
  account: string
  seq: number
  promise: Promise<void>
}

/**
 * 当前登录账号的灰度开关、体验中的功能、体验通道状态与体验反馈目标。
 *
 * 只用于决定展示什么；后端接口会独立校验，持久化的快照从来不是授权依据。
 * 状态跟随 userStore 里的当前账号：切换到小组账号后使用小组自己的开关，
 * 退出登录即清空，任何时候都不会把一个账号的开关用在另一个账号上。
 */
export const useRolloutStore = defineStore(
  'rollout',
  () => {
    const tokenStore = useTokenStore()
    const userStore = useUserStore()

    /** 最近一次取回的快照（持久化） */
    const snapshot = ref<RolloutSnapshot | null>(null)

    // 以下是会话内状态：不作为 state 返回，因此不会持久化
    const loadingAccount = ref('')
    const failure = ref<{ account: string, message: string } | null>(null)
    const loginsInProgress = ref(0)
    let refreshAfterLogin = false
    let sessionLoaded: { account: string, at: number } | null = null
    let requestSeq = 0
    let appliedSeq = 0
    let inflightLoad: InflightRequest | null = null
    let inflightMutation: InflightRequest | null = null

    const account = computed(() => userStore.userInfo.username || '')
    const current = computed(() => {
      const value = snapshot.value
      return value && account.value && value.account === account.value ? value : null
    })

    const isLoaded = computed(() => current.value !== null)
    const features = computed<Record<string, boolean>>(() => current.value?.state.features ?? {})
    const experiments = computed<Experiment[]>(() => current.value?.state.experiments ?? [])
    const preview = computed<PreviewState | null>(() => current.value?.state.preview ?? null)
    const feedback = computed<FeedbackRouting | null>(() => current.value?.state.feedback ?? null)
    const loadedAt = computed(() => current.value?.loadedAt ?? 0)
    const loading = computed(() => account.value !== '' && loadingAccount.value === account.value)
    const loadError = computed(() => {
      const value = failure.value
      return value && value.account === account.value ? value.message : ''
    })
    const status = computed<RolloutLoadStatus>(() => {
      if (current.value)
        return 'ready'
      if (loading.value || loginsInProgress.value > 0)
        return 'loading'
      if (!account.value)
        return 'signed_out'
      return loadError.value ? 'error' : 'loading'
    })

    /** 功能是否对当前账号开放；没有当前账号的快照时一律视为未开放 */
    function isEnabled(key: string): boolean {
      return current.value?.state.features?.[key] === true
    }

    function apply(target: string, seq: number, state: RolloutState): void {
      // 已切换账号，或更晚发出的请求已经生效：丢弃过时的结果
      if (seq <= appliedSeq || account.value !== target)
        return
      // 后端按请求所用的 token 判定账号。本地用户信息过时（例如切换账号时旧的
      // fetchUserInfo 响应晚到）会对不上：不采用这份状态，并重新获取用户信息
      if (state.account !== target) {
        void userStore.fetchUserInfo().catch(() => {})
        throw new RequestError({
          kind: 'unknown',
          code: 'rollout_account_mismatch',
          message: '账号信息正在更新，请稍后重试。',
        })
      }
      appliedSeq = seq
      const now = Date.now()
      snapshot.value = { account: target, state, loadedAt: now }
      sessionLoaded = { account: target, at: now }
      failure.value = null
    }

    function load(target: string): Promise<void> {
      const seq = ++requestSeq
      const promise = (async () => {
        try {
          apply(target, seq, await getRolloutState())
        }
        catch (error) {
          const requestError = toRequestError(error)
          if (seq > appliedSeq && account.value === target)
            failure.value = { account: target, message: requestError.message }
          throw requestError
        }
        finally {
          if (inflightLoad?.seq === seq) {
            inflightLoad = null
            loadingAccount.value = ''
          }
        }
      })()
      inflightLoad = { account: target, seq, promise }
      loadingAccount.value = target
      return promise
    }

    /**
     * 获取当前账号的灰度状态。
     *
     * - 同一账号已有请求在途时复用它；
     * - 本次启动 60 秒内已取回过则跳过，除非 force；
     * - 自动登录还没完成且没有有效 token 时推迟到登录之后，
     *   以免无效 token 再触发一次登录（未绑定时还会让绑定凭据失效）。
     *
     * 失败时以 RequestError 拒绝，原因同时记在 loadError。
     */
    async function refresh(options: RefreshRolloutOptions = {}): Promise<void> {
      const mutation = inflightMutation
      if (mutation)
        await mutation.promise.catch(() => {})
      const target = account.value
      if (!target)
        return
      const pending = inflightLoad
      if (pending && pending.account === target)
        return pending.promise
      if (loginsInProgress.value > 0 && !tokenStore.updateNowTime().hasLogin) {
        refreshAfterLogin = true
        return
      }
      const loaded = sessionLoaded
      const recentlyLoaded = current.value !== null
        && loaded !== null
        && loaded.account === target
        && Date.now() - loaded.at < REFRESH_INTERVAL_MS
      if (recentlyLoaded && !options.force)
        return
      return load(target)
    }

    /** 后台刷新：不向调用方抛错，失败原因记在 loadError，由需要的页面展示 */
    function refreshInBackground(options?: RefreshRolloutOptions): void {
      refresh(options).catch((error: unknown) => {
        console.warn('刷新灰度状态失败:', toRequestError(error).code)
      })
    }

    function mutatePreview(request: () => Promise<RolloutState>): Promise<void> {
      const target = account.value
      if (!target) {
        return Promise.reject(new RequestError({
          kind: 'authentication',
          code: 'not_authenticated',
          message: '请先登录。',
        }))
      }
      const seq = ++requestSeq
      const promise = (async () => {
        try {
          apply(target, seq, await request())
        }
        finally {
          if (inflightMutation?.seq === seq)
            inflightMutation = null
        }
      })()
      inflightMutation = { account: target, seq, promise }
      return promise
    }

    /** 加入体验通道，成功后用响应替换快照；不能加入时以 403 拒绝 */
    function join(): Promise<void> {
      return mutatePreview(joinPreview)
    }

    /** 退出体验通道，成功后用响应替换快照 */
    function leave(): Promise<void> {
      return mutatePreview(leavePreview)
    }

    /** 清空灰度状态，并丢弃所有在途请求的结果 */
    function reset(): void {
      appliedSeq = ++requestSeq
      inflightLoad = null
      inflightMutation = null
      refreshAfterLogin = false
      sessionLoaded = null
      loadingAccount.value = ''
      failure.value = null
      snapshot.value = null
    }

    // 账号变化（登录、绑定、切换账号、退出登录、解绑）时丢弃旧账号的状态并立即获取；
    // 同一账号换了 token（自动登录、续期、重新绑定）时按节流刷新，并补上因等待登录而推迟的刷新。
    watch([account, () => tokenStore.tokenInfo], ([nextAccount], [previousAccount]) => {
      if (nextAccount !== previousAccount) {
        reset()
        if (nextAccount)
          refreshInBackground({ force: true })
        return
      }
      const force = refreshAfterLogin
      refreshAfterLogin = false
      refreshInBackground({ force })
    })

    // 记录进行中的微信登录，供 refresh 判断是否需要等待
    tokenStore.$onAction((context) => {
      if (context.name !== 'wxLogin')
        return
      loginsInProgress.value += 1
      context.after(() => {
        loginsInProgress.value -= 1
        // 登录结束但账号和 token 都没变（例如未绑定）时 watch 不会触发，
        // 在这里消费被推迟的刷新；账号变化时 watch 会复用这里发出的请求
        if (loginsInProgress.value === 0 && refreshAfterLogin) {
          refreshAfterLogin = false
          if (account.value && tokenStore.updateNowTime().hasLogin)
            refreshInBackground({ force: true })
        }
      })
      context.onError((error) => {
        loginsInProgress.value -= 1
        if (loginsInProgress.value === 0 && refreshAfterLogin) {
          refreshAfterLogin = false
          if (account.value)
            failure.value = { account: account.value, message: toRequestError(error).message }
        }
      })
    }, true)

    return {
      snapshot,
      status,
      isLoaded,
      loading,
      loadError,
      loadedAt,
      features,
      experiments,
      preview,
      feedback,
      isEnabled,
      refresh,
      refreshInBackground,
      join,
      leave,
      reset,
    }
  },
  {
    // 只持久化快照，冷启动时菜单直接按上次的结果显示、不闪烁，随后在后台刷新。
    // 快照带着账号，账号对不上就不生效。
    persist: {
      paths: ['snapshot'],
    },
  },
)
