"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"
import { LogOut, User, Settings, Play, Home } from "lucide-react"

interface LayoutProps {
  children: React.ReactNode
  className?: string
}

export const Layout: React.FC<LayoutProps> = ({ children, className }) => {
  const { user, isAuthenticated, logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-700 to-green-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-sm border-b border-green-600/30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo & Navigation */}
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl">🃏</div>
              <h1 className="text-xl font-bold text-white">Primo Poker</h1>
            </Link>
            
            {/* Navigation Links */}
            <nav className="hidden md:flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <Link href="/demo/table">
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                  <Play className="w-4 h-4 mr-2" />
                  Live Demo
                </Button>
              </Link>
            </nav>
          </div>

          {/* User info and navigation */}
          {isAuthenticated && user ? (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-white">
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">{user.username}</span>
                <div className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
                  ${user.chipCount?.toLocaleString() || 0}
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10"
              >
                <Settings className="w-4 h-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="text-white border-white/30 hover:bg-white/10"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                Login
              </Button>
              <Button variant="poker" size="sm">
                Sign Up
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className={cn("container mx-auto px-4 py-6", className)}>
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-sm border-t border-green-600/30 mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-white/70">
            <div>© 2025 Primo Poker - Serverless Poker Platform</div>
            <div className="flex items-center space-x-4">
              <span>Powered by Cloudflare Workers</span>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Online</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
