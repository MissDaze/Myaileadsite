import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList, Cell
} from 'recharts'
import { getAnalytics } from '../lib/api'
import type { Analytics } from '../types'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { useToast } from '../components/ui/toast'

const FUNNEL_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8']
const BAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9']

export const AnalyticsPage: React.FC = () => {
  const { showToast } = useToast()
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getAnalytics()
        setData(res.data)
      } catch {
        showToast('Failed to load analytics', 'error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [showToast])

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

  if (!data) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p>No analytics data available</p>
      </div>
    )
  }

  const statCards = [
    { label: 'Total Leads', value: data.total_leads, color: 'text-indigo-400', icon: '👥' },
    { label: 'SMS Sent Rate', value: `${(data.sms_sent_rate * 100).toFixed(1)}%`, color: 'text-blue-400', icon: '📱' },
    { label: 'Response Rate', value: `${(data.response_rate * 100).toFixed(1)}%`, color: 'text-purple-400', icon: '💬' },
    { label: 'Build Success', value: `${(data.build_success_rate * 100).toFixed(1)}%`, color: 'text-green-400', icon: '🏗️' },
    { label: 'Deployment Rate', value: `${(data.deployment_rate * 100).toFixed(1)}%`, color: 'text-yellow-400', icon: '🚀' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Platform performance overview</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map(({ label, value, color, icon }) => (
          <Card key={label}>
            <CardContent className="py-4">
              <div className="text-2xl mb-1">{icon}</div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <FunnelChart>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb' }}
                />
                <Funnel
                  dataKey="count"
                  data={data.pipeline_funnel}
                  isAnimationActive
                >
                  <LabelList position="right" fill="#9ca3af" stroke="none" dataKey="stage" />
                  {data.pipeline_funnel.map((_, index) => (
                    <Cell key={index} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Leads by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Leads by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.leads_by_category} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="category"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.leads_by_category.map((_, index) => (
                    <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Leads over time */}
      <Card>
        <CardHeader>
          <CardTitle>Leads Scraped Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.leads_over_time} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb' }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: '#6366f1', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
