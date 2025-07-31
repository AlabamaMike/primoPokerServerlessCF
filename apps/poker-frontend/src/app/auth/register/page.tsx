"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Layout } from "@/components/layout/Layout"
import { Button } from "@/components/ui/button"
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
      router.push("/lobby")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <div className="bg-black/40 backdrop-blur-sm rounded-lg p-8 border border-green-600/30">
          <h1 className="text-3xl font-bold text-white text-center mb-8">
            Join Primo Poker
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-white mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black/20 border border-green-600/30 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                placeholder="PokerPro123"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black/20 border border-green-600/30 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black/20 border border-green-600/30 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-white mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black/20 border border-green-600/30 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="poker"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-white/70">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-yellow-400 hover:text-yellow-300">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
