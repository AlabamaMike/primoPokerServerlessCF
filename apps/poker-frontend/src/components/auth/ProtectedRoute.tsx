/**
 * Protected Route Component - Phase 3: Backend Integration
 * Ensures authentication before accessing protected pages
 */
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'

interface ProtectedRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export function ProtectedRoute({ children, redirectTo = '/login' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    const checkAuth = () => {
      if (!isAuthenticated && !isLoading) {
        router.push(redirectTo)
        return
      }
    }
    
    checkAuth()
  }, [isAuthenticated, isLoading, router, redirectTo])

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">🃏 Primo Poker</div>
          <div className="text-gray-400">Checking authentication...</div>
        </div>
      </div>
    )
  }

  // Don't render children if not authenticated
  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
