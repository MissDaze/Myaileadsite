import React, { useState, useEffect, useCallback } from 'react'
import { getCRMLeads, markInvoiced, markWon, markLost, sendFollowUp } from '../lib/api'
import type { Lead } from '../types'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { useToast } from '../components/ui/toast'

type BadgeVariant = 'success' | 'blue' | 'purple' | 'warning' | 'error' | 'default'

const stageVariant = (stage: Lead['pipeline_stage']): BadgeVariant => {
  const map: Record<string, BadgeVariant> = {
    DEPLOYED: 'success',
    FOLLOWUP_SENT: 'blue',
    INVOICED: 'purple',
    CLOSED_WON: 'success',
    CLOSED_LOST: 'error',
  }
  return stage ? (map[stage] ?? 'default') : 'default'
}

export const FollowUpPage: React.FC = () => {
  const { showToast } = useToast()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      const res = await getCRMLeads()
      setLeads(res.data.leads)
    } catch {
      showToast('Failed to load CRM leads', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const handleAction = async (id: string, action: 'followup' | 'invoiced' | 'won' | 'lost') => {
    setActionLoading(id)
    try {
      if (action === 'followup') await sendFollowUp(id)
      else if (action === 'invoiced') await markInvoiced(id)
      else if (action === 'won') await markWon(id)
      else await markLost(id)
      showToast('Action completed', 'success')
      fetchLeads()
    } catch {
      showToast('Action failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const reviewLeads = leads.filter((l) => l.intent === 'POSITIVE' && l.pipeline_stage === 'REPLIED_POSITIVE')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Follow-up CRM</h1>
        <p className="text-gray-400 text-sm mt-1">Manage leads in deployed and follow-up stages</p>
      </div>

      {/* Human review flag */}
      {reviewLeads.length > 0 && (
        <div className="mb-6 px-4 py-3 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-center gap-3">
          <span className="text-yellow-400 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-300">{reviewLeads.length} leads flagged for human review</p>
            <p className="text-xs text-yellow-500">These leads replied positively — manually review before proceeding</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>CRM Pipeline ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🤝</div>
              <p>No leads in CRM stages yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Follow-up Sent</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="text-gray-300 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-200">{lead.business_name}</div>
                        {lead.intent === 'POSITIVE' && (
                          <Badge variant="success" className="mt-1">POSITIVE</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{lead.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        {lead.site_url ? (
                          <a href={lead.site_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline text-xs truncate block max-w-32">
                            {lead.site_url.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={stageVariant(lead.pipeline_stage)}>
                          {lead.pipeline_stage}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {lead.followup_sms_sent ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {lead.pipeline_stage === 'DEPLOYED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={actionLoading === lead.id}
                              onClick={() => handleAction(lead.id, 'followup')}
                            >
                              Send Follow-up
                            </Button>
                          )}
                          {(lead.pipeline_stage === 'FOLLOWUP_SENT' || lead.pipeline_stage === 'DEPLOYED') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={actionLoading === lead.id}
                              onClick={() => handleAction(lead.id, 'invoiced')}
                            >
                              Mark Invoiced
                            </Button>
                          )}
                          {lead.pipeline_stage !== 'CLOSED_WON' && lead.pipeline_stage !== 'CLOSED_LOST' && (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                loading={actionLoading === lead.id}
                                onClick={() => handleAction(lead.id, 'won')}
                              >
                                Won ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                loading={actionLoading === lead.id}
                                onClick={() => handleAction(lead.id, 'lost')}
                              >
                                Lost ✗
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
