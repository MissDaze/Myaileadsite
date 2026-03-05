import React, { useState, useEffect } from 'react'
import { getOutreach } from '../lib/api'
import type { Lead } from '../types'
import { Badge } from '../components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { useToast } from '../components/ui/toast'

type BadgeVariant = 'success' | 'error' | 'default'

const intentVariant = (intent: Lead['intent']): BadgeVariant => {
  if (intent === 'POSITIVE') return 'success'
  if (intent === 'NEGATIVE') return 'error'
  return 'default'
}

export const OutreachPage: React.FC = () => {
  const { showToast } = useToast()
  const [sent, setSent] = useState<Lead[]>([])
  const [replies, setReplies] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getOutreach()
        setSent(res.data.sent)
        setReplies(res.data.replies)
      } catch {
        showToast('Failed to load outreach data', 'error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [showToast])

  const totalSent = sent.length
  const totalReplies = replies.length
  const positiveReplies = replies.filter((l) => l.intent === 'POSITIVE').length
  const responseRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : '0'
  const positiveRate = totalReplies > 0 ? ((positiveReplies / totalReplies) * 100).toFixed(1) : '0'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading...
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Outreach</h1>
        <p className="text-gray-400 text-sm mt-1">Track SMS campaigns and replies</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Sent', value: totalSent, color: 'text-indigo-400' },
          { label: 'Response Rate', value: `${responseRate}%`, color: 'text-blue-400' },
          { label: 'Positive Rate', value: `${positiveRate}%`, color: 'text-green-400' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-5">
              <p className="text-sm text-gray-400">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SMS Queue */}
        <Card>
          <CardHeader>
            <CardTitle>SMS Queue ({totalSent})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sent.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No SMS sent yet</div>
            ) : (
              <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
                {sent.map((lead) => (
                  <div key={lead.id} className="px-6 py-3 hover:bg-gray-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-200 truncate">{lead.business_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{lead.phone ?? 'No phone'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {lead.intent && <Badge variant={intentVariant(lead.intent)}>{lead.intent}</Badge>}
                        <span className="text-xs text-gray-500">
                          {lead.sms_sent ? 'SMS sent' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Replies */}
        <Card>
          <CardHeader>
            <CardTitle>Replies ({totalReplies})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {replies.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No replies yet</div>
            ) : (
              <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
                {replies.map((lead) => (
                  <div key={lead.id} className="px-6 py-4 hover:bg-gray-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-medium text-gray-200">{lead.business_name}</p>
                      {lead.intent && (
                        <Badge variant={intentVariant(lead.intent)}>{lead.intent}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2 italic">
                      &ldquo;{lead.reply_text}&rdquo;
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {lead.updated_at ? new Date(lead.updated_at).toLocaleString() : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
