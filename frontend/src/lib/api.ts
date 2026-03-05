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
export const getScrapeJobs = () => api.get<{ jobs: import('../types').ScrapeJob[] }>('/scrape-jobs')
export const createScrapeJob = (query: string, location: string) =>
  api.post<{ job: import('../types').ScrapeJob }>('/scrape-jobs', { query, location })

// Leads
export const getLeads = (params?: Record<string, string | number | boolean>) =>
  api.get<{ leads: import('../types').Lead[] }>('/leads', { params })
export const getLead = (id: string) => api.get<{ lead: import('../types').Lead }>(`/leads/${id}`)
export const excludeLead = (id: string, excluded: boolean) =>
  api.patch<{ lead: import('../types').Lead }>(`/leads/${id}`, { excluded })
export const sendSMS = (leadIds: string[]) =>
  api.post<{ sent: number }>('/sms/send-bulk', { lead_ids: leadIds })
export const buildLeads = (leadIds: string[]) =>
  api.post<{ queued: number }>('/build/queue', { lead_ids: leadIds })

// Outreach
export const getOutreach = () =>
  api.get<{ sent: import('../types').Lead[]; replies: import('../types').Lead[] }>('/outreach')
export const sendFollowUp = (leadId: string) =>
  api.post<{ lead: import('../types').Lead }>(`/outreach/followup/${leadId}`)

// Build
export const getBuildQueue = () =>
  api.get<{ builds: import('../types').Lead[] }>('/build/queue')

// Deployments
export const getDeployments = () =>
  api.get<{ deployments: import('../types').Lead[] }>('/deployments')

// CRM
export const getCRMLeads = () =>
  api.get<{ leads: import('../types').Lead[] }>('/crm/leads')
export const markInvoiced = (id: string) =>
  api.post<{ lead: import('../types').Lead }>(`/crm/leads/${id}/invoiced`)
export const markWon = (id: string) =>
  api.post<{ lead: import('../types').Lead }>(`/crm/leads/${id}/won`)
export const markLost = (id: string) =>
  api.post<{ lead: import('../types').Lead }>(`/crm/leads/${id}/lost`)

// Analytics
export const getAnalytics = () =>
  api.get<import('../types').Analytics>('/analytics')
