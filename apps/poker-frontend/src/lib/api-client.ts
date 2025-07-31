import { ApiResponse } from '@primo-poker/shared'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'

export class ApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl
    
    // Try to get token from localStorage on client side
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token')
    }
  }

  setToken(token: string) {
    this.token = token
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token)
    }
  }

  clearToken() {
    this.token = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
    }
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`
    
    console.log('API Request:', { url, method: options.method, baseUrl: this.baseUrl, endpoint })
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'API Error')
      }

      return data as ApiResponse<T>
    } catch (error) {
      console.error('API Request failed:', error)
      throw error
    }
  }

  // Authentication endpoints
  async login(username: string, password: string) {
    return this.request<{ 
      user: any;
      tokens: { accessToken: string; refreshToken: string };
      message: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  }

  async register(username: string, email: string, password: string) {
    return this.request<{ 
      user: any;
      tokens: { accessToken: string; refreshToken: string };
      message: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    })
  }

  // Table endpoints
  async getTables() {
    return this.request<any[]>('/api/tables')
  }

  async getTable(tableId: string) {
    return this.request<any>(`/api/tables/${tableId}`)
  }

  async joinTable(tableId: string, buyIn: number) {
    return this.request<any>(`/api/tables/${tableId}/join`, {
      method: 'POST',
      body: JSON.stringify({ buyIn }),
    })
  }

  // Player endpoints
  async getProfile() {
    return this.request<any>('/api/players/me')
  }

  // Tournament endpoints
  async getTournaments() {
    return this.request<any[]>('/api/tournaments')
  }
}

export const apiClient = new ApiClient()
