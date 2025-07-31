"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/layout/Layout"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"

export default function LobbyPage() {
  const { isAuthenticated, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login")
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated || !user) {
    return (
      <Layout>
        <div className="text-center">
          <div className="text-white">Redirecting to login...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            Welcome back, <span className="text-yellow-400">{user.username}</span>!
          </h1>
          <p className="text-white/80">
            Choose your table and start playing poker
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-6 border border-green-600/30 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">Chips</h3>
            <p className="text-2xl font-bold text-yellow-400">
              {(user as any).balance?.toLocaleString() || '10,000'}
            </p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-6 border border-green-600/30 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">Games Played</h3>
            <p className="text-2xl font-bold text-green-400">
              {(user as any).gamesPlayed || 0}
            </p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-6 border border-green-600/30 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">Win Rate</h3>
            <p className="text-2xl font-bold text-blue-400">
              {(user as any).winRate ? `${((user as any).winRate * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
        </div>

        {/* Table Selection */}
        <div className="bg-black/40 backdrop-blur-sm rounded-lg p-8 border border-green-600/30">
          <h2 className="text-2xl font-bold text-white mb-6">Available Tables</h2>
          
          <div className="grid gap-4">
            {/* Table 1 */}
            <div className="bg-black/20 rounded-lg p-6 border border-green-600/20 hover:border-green-600/50 transition-colors">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold text-white">Texas Hold'em - Beginner</h3>
                  <p className="text-white/70">Blinds: $1 / $2 • Max Buy-in: $200</p>
                  <p className="text-white/50 text-sm">6 players • Average pot: $25</p>
                </div>
                <Button variant="poker">
                  Join Table
                </Button>
              </div>
            </div>

            {/* Table 2 */}
            <div className="bg-black/20 rounded-lg p-6 border border-green-600/20 hover:border-green-600/50 transition-colors">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold text-white">Texas Hold'em - Intermediate</h3>
                  <p className="text-white/70">Blinds: $5 / $10 • Max Buy-in: $1,000</p>
                  <p className="text-white/50 text-sm">4 players • Average pot: $125</p>
                </div>
                <Button variant="poker">
                  Join Table
                </Button>
              </div>
            </div>

            {/* Table 3 */}
            <div className="bg-black/20 rounded-lg p-6 border border-green-600/20 hover:border-green-600/50 transition-colors">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold text-white">Texas Hold'em - High Stakes</h3>
                  <p className="text-white/70">Blinds: $25 / $50 • Max Buy-in: $5,000</p>
                  <p className="text-white/50 text-sm">2 players • Average pot: $750</p>
                </div>
                <Button variant="poker">
                  Join Table
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Button variant="outline" className="text-white border-white/30 hover:bg-white/10">
              🏆 Tournament Lobby
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
