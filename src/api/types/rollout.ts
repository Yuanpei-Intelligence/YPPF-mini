/**
 * 灰度发布与体验通道的接口契约，对应后端 api/rollout/serializers.py。
 */

/** 灰度阶段（rollout.Feature.Stage） */
export type RolloutStage = 'off' | 'internal' | 'preview' | 'rollout' | 'ga'

/** 功能对当前账号开放的原因（rollout.api.Reason） */
export type RolloutReason = 'ga' | 'allowlist' | 'preview' | 'audience' | 'rollout'

/** 不能自助加入体验通道的原因，同时是加入接口 403 响应的 code */
export type PreviewJoinBlockCode = 'preview_closed' | 'preview_person_only' | 'preview_inactive'

/** 灰度相关的业务错误 code；feature_not_enabled 来自任何受灰度保护的接口 */
export type RolloutErrorCode = 'feature_not_enabled' | PreviewJoinBlockCode

/** 体验通道页列出的功能 */
export interface Experiment {
  /** 功能标识，如 grades */
  key: string
  /** 功能名称 */
  name: string
  /** 功能说明 */
  description: string
  /** 列表只含 preview、rollout 阶段，以及当前账号在白名单里的 internal 功能 */
  stage: RolloutStage
  /** 当前账号能否使用 */
  enabled: boolean
  /** 可以使用的原因；enabled 为 false 时为 null */
  reason: RolloutReason | null
}

/** 当前账号的体验通道状态 */
export interface PreviewState {
  /** 是否已加入 */
  joined: boolean
  /** 加入时间（ISO 8601）；未加入时为 null */
  joined_at: string | null
  /** 能否自助加入 */
  can_join: boolean
  /** 不能加入的原因；can_join 为 true 时为 null */
  join_block_code: PreviewJoinBlockCode | null
  /** 不能加入的原因说明，可直接展示；can_join 为 true 时为 null */
  join_block_message: string | null
}

/** 体验反馈的发送目标，依次对应创建反馈接口的 type、otype、org */
export interface FeedbackRouting {
  type_name: string
  org_type_name: string
  org_name: string
}

/**
 * 当前账号的灰度状态。
 * GET /api/v2/rollout/features/ 与加入、退出体验通道接口都返回它。
 */
export interface RolloutState {
  /** 这份状态所属账号的 username（按请求所用的 token 判定）；与本地当前账号不一致时不能采用 */
  account: string
  /** 当前账号可以使用的功能，键为功能标识；未列出的功能不可用 */
  features: Record<string, boolean>
  /** 体验中的功能 */
  experiments: Experiment[]
  /** 体验通道状态 */
  preview: PreviewState
  /** 体验反馈的发送目标；后端尚未配置时为 null */
  feedback: FeedbackRouting | null
}
