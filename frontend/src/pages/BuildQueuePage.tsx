import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getBuildQueue } from '../lib/api'
import type { Lead } from '../types'
import { Badge } from '../components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Dialog } from '../components/ui/dialog'
import { useToast } from '../components/ui/toast'

type BadgeVariant = 'warning' | 'blue' | 'success' | 'error' | 'outline'

const buildVariant = (status: Lead['build_status']): BadgeVariant => {
  const map: Record<NonNullable<Lead['build_status']>, BadgeVariant> = {
    QUEUED: 'warning',
    BUILDING: 'blue',
    COMPLETE: 'success',
    FAILED: 'error',
  }
  return status ? map[status] : 'outline'
}

const getDuration = (lead: Lead) => {
  if (!lead.sms_sent_at) return '—'
  const start = new Date(lead.sms_sent_at).getTime()
  const end = lead.deployed_at ? new Date(lead.deployed_at).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export const BuildQueuePage: React.FC = () => {
  const { showToast } = useToast()
  const [builds, setBuilds] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBuild, setSelectedBuild] = useState<Lead | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchBuilds = useCallback(async () => {
    try {
      const res = await getBuildQueue()
      setBuilds(res.data.builds)
    } catch {
      showToast('Failed to load build queue', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchBuilds()
    intervalRef.current = setInterval(fetchBuilds, 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchBuilds])

  const counts = {
    QUEUED: builds.filter((b) => b.build_status === 'QUEUED').length,
    BUILDING: builds.filter((b) => b.build_status === 'BUILDING').length,
    COMPLETE: builds.filter((b) => b.build_status === 'COMPLETE').length,
    FAILED: builds.filter((b) => b.build_status === 'FAILED').length,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Build Queue</h1>
          <p className="text-gray-400 text-sm mt-1">Auto-refreshes every 10 seconds</p>
        </div>
        <button
          onClick={fetchBuilds}
          className="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Queued', count: counts.QUEUED, icon: '⏳' },
          { label: 'Building', count: counts.BUILDING, icon: '🔨' },
          { label: 'Complete', count: counts.COMPLETE, icon: '✅' },
          { label: 'Failed', count: counts.FAILED, icon: '❌' },
        ].map(({ label, count, icon }) => (
          <Card key={label}>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="text-sm text-gray-400">{label}</p>
                  <p className="text-2xl font-bold text-gray-100">{count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Builds ({builds.length})</CardTitle>
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
          ) : builds.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🏗️</div>
              <p>No builds in queue</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {builds.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBuild(b)}
                      className="text-gray-300 hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-gray-200">{b.business_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={buildVariant(b.build_status)} animate={b.build_status === 'BUILDING'}>
                          {b.build_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{b.category ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {b.created_at ? new Date(b.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{getDuration(b)}</td>
                      <td className="px-4 py-3">
                        {b.build_log ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedBuild(b) }}
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            View Log
                          </button>
                        ) : (
                          <span className="text-gray-600 text-xs">No log</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log modal */}
      {selectedBuild && (
        <Dialog
          open={!!selectedBuild}
          onClose={() => setSelectedBuild(null)}
          title={`Build Log: ${selectedBuild.business_name}`}
          className="max-w-2xl"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant={buildVariant(selectedBuild.build_status)} animate={selectedBuild.build_status === 'BUILDING'}>
                {selectedBuild.build_status}
              </Badge>
              <span className="text-sm text-gray-400">{selectedBuild.category}</span>
            </div>
            <pre className="text-xs text-green-400 bg-gray-950 rounded-lg p-4 overflow-y-auto max-h-96 font-mono whitespace-pre-wrap leading-relaxed border border-gray-800">
              {selectedBuild.build_log ?? 'No log available.'}
            </pre>
          </div>
        </Dialog>
      )}
    </div>
  )
}
