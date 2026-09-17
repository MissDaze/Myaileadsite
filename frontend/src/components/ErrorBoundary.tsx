import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('LeadForge frontend error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-red-400 mb-3">LeadForge could not display this page</h1>
            <p className="text-gray-400 mb-6">The application encountered an unexpected error. Reload the page to try again.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
