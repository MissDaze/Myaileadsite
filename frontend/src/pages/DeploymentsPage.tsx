import React, { useState, useEffect } from 'react'
import { getDeployments } from '../lib/api'
import type { Lead } from '../types'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useToast } from '../components/ui/toast'

export const DeploymentsPage: React.FC = () => {
  const { showToast } = useToast()
  const [deployments, setDeployments] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getDeployments()
        setDeployments(res.data.deployments)
      } catch {
        showToast('Failed to load deployments', 'error')
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Deployments</h1>
        <p className="text-gray-400 text-sm mt-1">{deployments.length} sites deployed</p>
      </div>

      {deployments.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <div className="text-5xl mb-4">🚀</div>
          <p className="text-lg">No deployments yet</p>
          <p className="text-sm mt-2">Complete builds to see deployed sites here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {deployments.map((d) => (
            <Card key={d.id} className="hover:border-indigo-800 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-gray-200 leading-tight">{d.business_name}</h3>
                  <Badge variant="success">Live</Badge>
                </div>

                {d.category && (
                  <p className="text-xs text-gray-400 mb-3">{d.category}</p>
                )}

                {d.site_url && (
                  <a
                    href={d.site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-indigo-400 hover:text-indigo-300 truncate mb-1 transition-colors"
                  >
                    🌐 {d.site_url.replace(/^https?:\/\//, '')}
                  </a>
                )}

                {d.github_url && (
                  <a
                    href={d.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-gray-400 hover:text-gray-200 truncate mb-3 transition-colors"
                  >
                    <svg className="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                    </svg>
                    GitHub
                  </a>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                  <span className="text-xs text-gray-500">
                    {d.deployed_at ? new Date(d.deployed_at).toLocaleDateString() : 'Recently'}
                  </span>
                  {d.site_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(d.site_url!, '_blank')}
                    >
                      Open Site ↗
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
