import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}
