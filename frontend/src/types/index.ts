export interface Lead {
  id: number
  business_name: string
  phone: string | null
  category: string | null
  rating: number | null
  sms_sent: boolean
  sms_sent_at: string | null
  reply_text: string | null
  reply_received_at: string | null
  intent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null
  build_status: 'QUEUED' | 'BUILDING' | 'COMPLETE' | 'FAILED' | null
  build_log: string | null
  pipeline_stage: 'NEW' | 'CONTACTED' | 'REPLIED' | 'BUILDING' | 'DEPLOYED' | 'FOLLOWUP_SENT' | 'INVOICED' | 'WON' | 'LOST' | null
  excluded: boolean
  site_url: string | null
  github_url: string | null
  deployed_at: string | null
  followup_sent_at: string | null
  scrape_job_id: number | null
  created_at: string
}

export interface ScrapeJob {
  id: number
  query: string
  location: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED'
  lead_count: number
  created_at: string
  completed_at: string | null
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
  lead_ids: number[]
}

export interface BuildPayload {
  lead_ids: number[]
}
