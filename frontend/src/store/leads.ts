import { create } from 'zustand'
import type { Lead } from '../types'

interface LeadsStore {
  leads: Lead[]
  setLeads: (leads: Lead[]) => void
  updateLead: (id: string, updates: Partial<Lead>) => void
  clearLeads: () => void
}

export const useLeadsStore = create<LeadsStore>((set) => ({
  leads: [],
  setLeads: (leads) => set({ leads }),
  updateLead: (id, updates) =>
    set((state) => ({
      leads: state.leads.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),
  clearLeads: () => set({ leads: [] }),
}))
