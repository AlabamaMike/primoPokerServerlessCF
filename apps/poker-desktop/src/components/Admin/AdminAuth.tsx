import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth-store'

export const AdminAuth: React.FC = () => {
  const navigate = useNavigate()
  const { isAuthenticated, user, logout, refreshToken } = useAuthStore()

  useEffect(() => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/admin' } })
      return
    }

    // Check if user has admin or moderator role
    if (!user?.roles?.includes('admin') && !user?.roles?.includes('moderator')) {
      navigate('/', { state: { error: 'Access denied. Admin privileges required.' } })
      return
    }
  }, [isAuthenticated, user, navigate])

  useEffect(() => {
    // Set up token refresh interval
    const refreshInterval = setInterval(() => {
      refreshToken().catch(console.error)
    }, 30 * 60 * 1000) // 30 minutes

    return () => clearInterval(refreshInterval)
  }, [refreshToken])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isAdmin = user?.roles?.includes('admin')

  return (
    <div className="admin-container min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <h1 className="text-xl font-semibold">Admin Panel</h1>
              </div>
              <nav className="ml-6 flex space-x-8">
                <a href="/admin" className="text-gray-900 inline-flex items-center px-1 pt-1 text-sm font-medium">
                  Dashboard
                </a>
                <a href="/admin/chat-logs" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium">
                  Chat Logs
                </a>
                <a href="/admin/reports" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium">
                  Reports
                </a>
                <a href="/admin/bans" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium">
                  Ban Management
                </a>
                {isAdmin && (
                  <a href="/admin/settings" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium">
                    Settings
                  </a>
                )}
              </nav>
            </div>
            <div className="ml-6 flex items-center">
              <span className="text-sm text-gray-700 mr-4">
                {user?.username} ({user?.roles?.join(', ')})
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Child routes will be rendered here */}
      </main>
    </div>
  )
}