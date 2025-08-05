import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/auth-store';

interface LoginFormProps {
  apiUrl: string;
  onSuccess?: () => void;
}

export default function LoginForm({ apiUrl, onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, error } = useAuthStore();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    
    if (!email || !password) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await login(apiUrl, email, password);
      onSuccess?.();
    } catch (error) {
      // Error is handled by the store
      console.error('Login failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form" data-testid="login-form">
      <h2 className="text-2xl font-bold text-white mb-6">Login to Primo Poker</h2>
      
      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="mb-4">
        <label htmlFor="email" className="block text-gray-300 mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 bg-black/50 border border-gray-600 rounded text-white focus:outline-none focus:border-green-500"
          placeholder="you@example.com"
          required
          disabled={isSubmitting}
          data-testid="email"
        />
      </div>
      
      <div className="mb-6">
        <label htmlFor="password" className="block text-gray-300 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 bg-black/50 border border-gray-600 rounded text-white focus:outline-none focus:border-green-500"
          placeholder="••••••••"
          required
          disabled={isSubmitting}
          data-testid="password"
        />
      </div>
      
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded font-semibold transition-colors"
        data-testid="login-button"
      >
        {isSubmitting ? 'Logging in...' : 'Login'}
      </button>
      
      <p className="mt-4 text-gray-400 text-sm text-center">
        Don't have an account?{' '}
        <a href="#" className="text-green-400 hover:text-green-300">
          Register
        </a>
      </p>
    </form>
  );
}