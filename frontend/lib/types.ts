export type AICategory = "streaming" | "social" | "financial" | "spam" | "other" | string

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

export interface ScanStartResponse {
  scan_job_id: string
}

export interface ScanProgressEvent {
  status: "pending" | "running" | "completed" | "failed" | string
  indexed: number
  total: number
}

export interface BulkDeletePreviewResponse {
  action_id: string
  affected: number
  message: string
}

export const CATEGORY_FILTERS = ["all", "streaming", "social", "financial", "spam", "other"] as const
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number]
