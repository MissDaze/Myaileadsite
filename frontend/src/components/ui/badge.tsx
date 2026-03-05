import React from 'react'

type Variant = 'default' | 'success' | 'warning' | 'error' | 'outline' | 'blue' | 'purple'

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
  className?: string
  animate?: boolean
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-gray-700 text-gray-200',
  success: 'bg-green-900/50 text-green-400 border border-green-800',
  warning: 'bg-yellow-900/50 text-yellow-400 border border-yellow-800',
  error: 'bg-red-900/50 text-red-400 border border-red-800',
  outline: 'bg-transparent text-gray-300 border border-gray-600',
  blue: 'bg-blue-900/50 text-blue-400 border border-blue-800',
  purple: 'bg-indigo-900/50 text-indigo-400 border border-indigo-800',
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className = '', animate = false }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${animate ? 'animate-pulse' : ''} ${className}`}
    >
      {children}
    </span>
  )
}
