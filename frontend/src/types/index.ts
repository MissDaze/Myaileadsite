export interface Lead {
  id: string
  business_name: string
  phone: string
  address: string | null
  category: string | null
  rating: number | null
  review_count: number | null
  maps_url: string | null
  maps_overview_url: string | null
  maps_reviews_url: string | null
  maps_photos_url: string | null
  hours: string | null
  sms_sent: boolean
  reply_text: string | null
  intent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  build_status: 'NOT_STARTED' | 'QUEUED' | 'BUILDING' | 'COMPLETE' | 'FAILED'
  build_log: string | null
  github_repo_url: string | null
  site_url: string | null
  followup_sms_sent: boolean
  pipeline_stage: 'SCRAPED' | 'SMS_SENT' | 'REPLIED_POSITIVE' | 'BUILDING' | 'DEPLOYED' | 'FOLLOWUP_SENT' | 'INVOICED' | 'CLOSED_WON' | 'CLOSED_LOST'
  excluded: boolean
  scrape_job_id: string
  created_at: string
  updated_at: string
}

export interface ScrapeJob {
  id: string
  query: string
  location: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
  lead_count: number
  created_at: string
  updated_at: string
}

export interface Analytics {
  total_leads: number
  sms_sent_count: number
  sms_sent_rate: number
  reply_count: number
  response_rate: number
  positive_count: number
  positive_rate: number
  build_success_count: number
  build_success_rate: number
  deployment_count: number
  deployment_rate: number
  pipeline_funnel: { stage: string; count: number }[]
  leads_by_category: { category: string; count: number }[]
  leads_over_time: { date: string; count: number }[]
}

export interface SMSPayload {
  lead_ids: string[]
}

export interface BuildPayload {
  lead_ids: string[]
}
