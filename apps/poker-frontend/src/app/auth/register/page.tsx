"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/stores/auth-store"

export default function RegisterPage() {
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  
  const { register } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long")
      setIsLoading(false)
      return
    }

    try {
      await register(username, email, password)
      router.push("/multiplayer")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <header className="bg-[#2d2d2d] px-5 py-3 border-b-2 border-[#3d3d3d]">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-[#4CAF50] hover:text-[#45a049] transition-colors">
            Primo Poker Club
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-gray-300 hover:text-white transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#2d2d2d] rounded-lg p-8 border border-[#3d3d3d]">
            <h1 className="text-3xl font-bold text-white text-center mb-2">
              Join the Club
            </h1>
            <p className="text-gray-400 text-center mb-8">
              Create your Primo Poker Club account
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#3d3d3d] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:border-transparent transition-all"
                  placeholder="PokerPro123"
                />
                <p className="mt-1 text-xs text-gray-400">This is how other players will see you</p>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#3d3d3d] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:border-transparent transition-all"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#3d3d3d] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
                <p className="mt-1 text-xs text-gray-400">At least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#3d3d3d] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-600/50 rounded-md p-3 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#4CAF50] hover:bg-[#45a049] disabled:bg-[#4CAF50]/50 text-white font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[#4CAF50] focus:ring-offset-2 focus:ring-offset-[#1a1a1a]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Account...
                  </span>
                ) : (
                  "Create Account"
                )}
              </button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#3d3d3d]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-[#2d2d2d] text-gray-400">Already have an account?</span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link 
                  href="/auth/login" 
                  className="text-[#4CAF50] hover:text-[#45a049] font-medium transition-colors"
                >
                  Sign in instead
                </Link>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-400">
                By creating an account, you agree to our <br />
                <Link href="/terms" className="text-[#4CAF50] hover:text-[#45a049]">Terms of Service</Link> and <Link href="/privacy" className="text-[#4CAF50] hover:text-[#45a049]">Privacy Policy</Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#2d2d2d] border-t border-[#3d3d3d] px-5 py-4">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-400">
          © 2025 Primo Poker Club - Powered by Cloudflare Workers
        </div>
      </footer>
    </div>
  )
}