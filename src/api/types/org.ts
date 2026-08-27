/** 当前账号可见的小组订阅信息。 */
export interface OrganizationSubscription {
  id: number
  username: string
  oname: string
  otype_id: number
  otype_name: string
  introduction: string
  avatar_url: string
  subscribed: boolean
}

/** 按小组类型聚合的订阅信息。 */
export interface OrganizationSubscriptionType {
  otype_id: number
  otype_name: string
  allow_unsubscribe: boolean
  organizations: OrganizationSubscription[]
}

export interface SubscriptionListResponse {
  is_person: boolean
  readonly: boolean
  organization_types: OrganizationSubscriptionType[]
}

export type SubscriptionUpdatePayload
  = | {
    id: string
    otype?: never
    status: boolean
  }
  | {
    id?: never
    otype: number
    status: boolean
  }

export interface SubscriptionUpdateResponse {
  success: boolean
  message: string
}
