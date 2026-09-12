/** 发布状态：0-草稿 1-已发布 等 */
export type IssueStatus = 0 | 1 | 2

/** 解决状态 */
export type SolveStatus = 0 | 1 | 2 | 3

/** 列表排序字段 */
export type FeedbackOrdering
  = | '-feedback_time'
    | '-modify_time'
    | '-time'
    | 'feedback_time'
    | 'modify_time'
    | 'time'

/** 反馈列表查询参数 */
export interface FeedbackListQuery {
  /** 发布状态筛选 */
  issue_status?: IssueStatus
  /** 解决状态筛选 */
  solve_status?: SolveStatus
  /** 排序 */
  ordering?: FeedbackOrdering
  /** 是否公开（用于获取所有公开反馈） */
  publisher_public?: boolean
  /** 是否获取所有用户的反馈（公示栏用） */
  all_users?: boolean
}

/** 反馈类型（表单选项） */
export interface FeedbackType {
  id: string | number
  name: string
  org_type?: string | null
  org_type_name?: string | null
  org?: string | null
  org_name?: string | null
  flexible?: number
  [key: string]: unknown
}

/** 反馈详情/列表项 */
export interface Feedback {
  id: string
  issue_status: IssueStatus
  issue_status_display?: string
  solve_status: SolveStatus
  solve_status_display?: string
  feedback_time?: string
  modify_time?: string
  time?: string
  feedback_type?: string | number
  feedback_type_display?: string
  /** 反馈类型名称（后端返回：type_name） */
  type_name?: string
  /** 反馈标题 */
  title?: string
  /** 接收小组类型名称（后端返回：org_type_name） */
  org_type_name?: string
  /** 接收小组名称（后端返回：org_name） */
  org_name?: string
  /** 接收小组头像（后端返回：org_avatar） */
  org_avatar?: string
  content?: string
  /** 是否公开 */
  publisher_public?: boolean
  /** 可选：图片等附件 */
  images?: string[]
  /** 灰度功能标识；不是体验反馈时为空字符串 */
  feature_key?: string
  [key: string]: unknown
}

/**
 * 附在反馈上的客户端环境（如小程序版本），不能包含个人信息。
 * 后端限制：最多 8 项，键不超过 32 个字符，值不超过 128 个字符。
 */
export type FeedbackClientInfo = Record<string, string>

/** 创建反馈请求体（草稿或直接提交） */
export interface FeedbackCreate {
  /** 反馈类型名称（后端字段名：type，传 FeedbackType.name） */
  type: string | number
  /** 反馈标题 */
  title: string
  /** 内容 */
  content: string
  /** 操作类型：save=保存草稿，directly_submit=直接提交（后端用此字段决定 issue_status） */
  post_type?: 'save' | 'directly_submit'
  /** 接收小组类型（后端字段名：otype，传 OrganizationType.otype_name） */
  otype?: string
  /** 接收小组（后端字段名：org，传 Organization.oname） */
  org?: string
  /** 是否公开（后端字段：publisher_public，必填） */
  publisher_public: boolean
  /** 相关链接（可选） */
  url?: string
  /** 可选：图片等 */
  images?: string[]
  /** 灰度功能标识（可选）；填写时 type、otype、org 必须是后端配置的体验反馈目标 */
  feature_key?: string
  /** 客户端环境（可选），见 FeedbackClientInfo */
  client_info?: FeedbackClientInfo
  [key: string]: unknown
}

/** 修改反馈请求体（部分更新） */
export interface PatchedFeedbackUpdate {
  /** 反馈类型名称（可选） */
  type?: string
  /** 反馈标题（可选） */
  title?: string
  /** 内容（可选） */
  content?: string
  /** 接收小组类型（可选） */
  otype?: string
  /** 接收小组（可选） */
  org?: string
  /** 是否公开（可选） */
  publisher_public?: boolean
  /** 相关链接（可选） */
  url?: string
  /** 操作类型：modify=修改，submit_draft=提交草稿 */
  post_type: 'modify' | 'submit_draft'
  /** 可选：图片等 */
  images?: string[]
  [key: string]: unknown
}

/** 组织类型 */
export interface OrgType {
  otype_id: number
  otype_name: string
}

/** 组织 */
export interface Organization {
  organization_id: number
  oname: string
  otype_id: number
  otype_name: string
}

/** 反馈类型到组织的映射 */
export interface FeedbackTypeMapping {
  org_type_name: string | null
  org_name: string | null
}

/** 组织信息响应 */
export interface OrganizationInfoResponse {
  org_types: OrgType[]
  organizations: Organization[]
  org_type_to_orgs: Record<string, string[]>
  feedback_type_mappings: Record<string, FeedbackTypeMapping>
}
