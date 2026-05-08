export type PlanType = "free" | "pro" | "business"
export type BillingCycle = "monthly" | "weekly"

export interface AuthUser {
  user_id: string
  email: string
  name?: string
  picture_url?: string
  plan: PlanType
  billing_cycle?: BillingCycle
  plan_started_at?: string
  plan_expires_at?: string
}

export interface PlanFeatures {
  ai_classify: boolean
  kenzo_chat: boolean
  auto_rules: boolean
  auto_sync: boolean
  voice_stt: boolean
  reports: boolean
  subscription_monitor: boolean
  multi_account: boolean
  max_monitored_subscriptions: number
}

export interface PlanInfo {
  id: PlanType
  name: string
  price_monthly: number
  price_weekly: number
  features: PlanFeatures
  popular?: boolean
}

export interface CurrentPlanResponse {
  plan: PlanType
  billing_cycle?: BillingCycle
  plan_started_at?: string
  plan_expires_at?: string
  features: PlanFeatures
}

export type AICategory =
  | "streaming"
  | "social"
  | "financial"
  | "spam"
  | "newsletter"
  | "entertainment"
  | "ecommerce"
  | "transactional"
  | "personal"
  | "other"
  | string

export interface Sender {
  domain: string
  display_name: string
  ai_category: AICategory
  total: number
  unread: number
  oldest: string
  newest: string
  has_unsubscribe: boolean
}

export interface EmailRecord {
  message_id: string
  subject: string | null
  sender: string
  sender_email?: string
  sender_domain?: string
  received_at: string | null
  snippet?: string | null
  has_attachment?: boolean
  has_unsubscribe: boolean
}

export interface EmailsPage {
  items: EmailRecord[]
  total: number
}

export interface EmailDetailFull {
  message_id: string
  subject: string | null
  sender_email: string
  sender_domain: string
  received_at: string | null
  snippet: string | null
  body_html: string | null
  body_text: string | null
  has_attachment: boolean
}

export interface ScanStartResponse {
  scan_job_id: string
}

export interface ScanProgressEvent {
  status: "pending" | "running" | "completed" | "failed" | string
  indexed: number
  total: number
}

export interface Rule {
  id: string
  name: string
  condition_type: string
  condition_value: string
  action_type: string
  is_active: boolean
  last_run_at: string | null
  created_at: string
}

export interface Subscription {
  id: number
  domain: string
  display_name: string
  renewal_date: string
  alert_days_before: number
  notes?: string
  days_until_renewal: number
  is_alerting: boolean
  is_expired: boolean
}

export interface SubscriptionAlert {
  id: number
  domain: string
  display_name: string
  renewal_date: string
  days_until_renewal: number
  is_expired: boolean
  notes?: string
}

export interface SubscriptionCreate {
  domain: string
  display_name?: string
  renewal_date: string
  alert_days_before?: number
  notes?: string
}

export interface BulkDeletePreviewResponse {
  action_id: string
  affected: number
  message: string
}

export const CATEGORY_FILTERS = [
  "all",
  "streaming",
  "social",
  "financial",
  "spam",
  "newsletter",
  "entertainment",
  "ecommerce",
  "transactional",
  "personal",
  "other",
] as const
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number]
