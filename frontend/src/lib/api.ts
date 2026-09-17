import axios from 'axios'
import { useAuthStore } from '../store/auth'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 401
    ) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (username: string, password: string) =>
  api.post<{ token: string; user: string }>('/auth/login', { username, password })

// Scrape Jobs
type ScrapeJobsResponse =
  | { jobs: import('../types').ScrapeJob[] }
  | import('../types').ScrapeJob[]

export const getScrapeJobs = async () => {
  const response = await api.get<ScrapeJobsResponse>('/scrape-jobs')
  const payload = response.data
  const jobs = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.jobs)
      ? payload.jobs
      : []

  return { ...response, data: { jobs } }
}
export const createScrapeJob = (query: string, location: string) =>
  api.post<{ job: import('../types').ScrapeJob }>('/scrape-jobs', { query, location })

// Leads
export const getLeads = async (params?: Record<string, string | number | boolean>) => {
  const response = await api.get<{
    leads?: import('../types').Lead[]
    data?: import('../types').Lead[]
  }>('/leads', { params })
  const payload = response.data
  const leads = Array.isArray(payload?.leads)
    ? payload.leads
    : Array.isArray(payload?.data)
      ? payload.data
      : []
  return { ...response, data: { leads } }
}
export const getLead = (id: string) => api.get<{ lead: import('../types').Lead }>(`/leads/${id}`)
export const excludeLead = (id: string, excluded: boolean) =>
  api.patch<{ lead: import('../types').Lead }>(`/leads/${id}`, { excluded })
export const sendSMS = (leadIds: string[]) =>
  api.post<{ sent: number }>('/sms/send-bulk', { lead_ids: leadIds })
export const buildLeads = (leadIds: string[]) =>
  api.post<{ queued: number }>('/build/queue', { lead_ids: leadIds })

// Outreach
export const getOutreach = async () => {
  const { data } = await getLeads({ limit: 200 })
  const sent = data.leads.filter((lead) => lead.sms_sent)
  const replies = data.leads.filter((lead) => Boolean(lead.reply_text))
  return { data: { sent, replies } }
}
export const sendFollowUp = (leadId: string) =>
  api.post<{ lead: import('../types').Lead }>(`/outreach/followup/${leadId}`)

// Build
export const getBuildQueue = async () => {
  const { data } = await getLeads({ limit: 200 })
  const builds = data.leads.filter((lead) => lead.build_status !== 'NOT_STARTED')
  return { data: { builds } }
}

// Deployments
export const getDeployments = async () => {
  const response = await api.get<{
    deployments?: import('../types').Lead[]
    data?: import('../types').Lead[]
  }>('/deployments')
  const payload = response.data
  const deployments = Array.isArray(payload?.deployments)
    ? payload.deployments
    : Array.isArray(payload?.data)
      ? payload.data
      : []
  return { ...response, data: { deployments } }
}

// CRM
export const getCRMLeads = async () => {
  const { data } = await getLeads({ limit: 200 })
  const stages = new Set(['DEPLOYED', 'FOLLOWUP_SENT', 'INVOICED', 'CLOSED_WON', 'CLOSED_LOST'])
  return { data: { leads: data.leads.filter((lead) => stages.has(lead.pipeline_stage)) } }
}
export const markInvoiced = (id: string) =>
  api.patch<import('../types').Lead>(`/leads/${id}`, { pipeline_stage: 'INVOICED' })
export const markWon = (id: string) =>
  api.patch<import('../types').Lead>(`/leads/${id}`, { pipeline_stage: 'CLOSED_WON' })
export const markLost = (id: string) =>
  api.patch<import('../types').Lead>(`/leads/${id}`, { pipeline_stage: 'CLOSED_LOST' })

// Analytics
export const getAnalytics = async () => {
  const response = await api.get<unknown>('/analytics')
  const payload = response.data as Record<string, unknown>
  const overview = (payload.overview ?? {}) as Record<string, number>
  const funnel = Array.isArray(payload.funnel)
    ? payload.funnel as { stage: string; count: number }[]
    : []
  const totalLeads = overview.total_leads ?? 0
  const smsSent = overview.sms_sent ?? 0
  const positive = overview.positive_replies ?? 0
  const negative = overview.negative_replies ?? 0
  const replies = positive + negative
  const buildComplete = overview.build_complete ?? 0
  const buildFailed = overview.build_failed ?? 0
  const deployed = overview.deployed ?? 0

  const analytics: import('../types').Analytics = {
    total_leads: totalLeads,
    sms_sent_count: smsSent,
    sms_sent_rate: totalLeads > 0 ? smsSent / totalLeads : 0,
    reply_count: replies,
    response_rate: smsSent > 0 ? replies / smsSent : 0,
    positive_count: positive,
    positive_rate: replies > 0 ? positive / replies : 0,
    build_success_count: buildComplete,
    build_success_rate: buildComplete + buildFailed > 0
      ? buildComplete / (buildComplete + buildFailed)
      : 0,
    deployment_count: deployed,
    deployment_rate: positive > 0 ? deployed / positive : 0,
    pipeline_funnel: funnel,
    leads_by_category: [],
    leads_over_time: [],
  }

  return { ...response, data: analytics }
}


// Multichannel outreach
export const getMultichannelStatus = () => api.get('/multichannel/status')
export const getContacts = () => api.get<{ contacts: import('../types').Contact[] }>('/multichannel/contacts')
export const importContacts = (rows: Record<string, unknown>[], filename: string, sourceType: string) =>
  api.post('/multichannel/contacts/import', { rows, filename, source_type: sourceType })
export const getCampaigns = () => api.get<{ campaigns: import('../types').CampaignSummary[] }>('/multichannel/campaigns')
export const createCampaign = (payload: {
  name: string
  channel: string
  sequence: string
  brief: string
  tone: string
  contact_ids: string[]
}) => api.post('/multichannel/campaigns', payload)
export const generateCampaign = (id: string) => api.post(`/multichannel/campaigns/${id}/generate`)
export const getCampaign = (id: string) => api.get(`/multichannel/campaigns/${id}`)
export const approveCampaign = (id: string) => api.post(`/multichannel/campaigns/${id}/approve-all`)
export const getGoogleOAuthUrl = () => api.get<{ url: string }>('/multichannel/oauth/google/start')
export const disconnectOAuth = (provider: string) => api.delete(`/multichannel/oauth/${provider}`)
