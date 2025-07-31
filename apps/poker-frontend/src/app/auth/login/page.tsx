"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Layout } from "@/components/layout/Layout"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  
  const { login } = useAuthStore()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      await login(email, password)
      router.push("/lobby")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <div className="bg-black/40 backdrop-blur-sm rounded-lg p-8 border border-green-600/30">
          <h1 className="text-3xl font-bold text-white text-center mb-8">
            Login to Primo Poker
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
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
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-white/70">
              Don&apos;t have an account?{" "}
              <Link href="/auth/register" className="text-yellow-400 hover:text-yellow-300">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
