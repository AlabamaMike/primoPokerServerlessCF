import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useFormValidation, validators } from '../utils/validation';

interface LoginFormProps {
  apiUrl: string;
  onSuccess?: () => void;
}

export default function LoginForm({ apiUrl, onSuccess }: LoginFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, error } = useAuthStore();
  
  const validationRules = {
    email: [validators.required(), validators.email()],
    password: [validators.required(), validators.minLength(8)]
  };
  
  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateAll
  } = useFormValidation(
    { email: '', password: '' },
    validationRules
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    
    if (!validateAll()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await login(apiUrl, values.email, values.password);
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
          {typeof error === 'object' && error.message ? error.message : error}
        </div>
      )}
      
      <div className="mb-4">
        <label htmlFor="email" className="block text-gray-300 mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange('email', e.target.value)}
          onBlur={() => handleBlur('email')}
          className={`w-full px-4 py-2 bg-black/50 border rounded text-white focus:outline-none ${
            errors.email && touched.email 
              ? 'border-red-500 focus:border-red-500' 
              : 'border-gray-600 focus:border-green-500'
          }`}
          placeholder="you@example.com"
          disabled={isSubmitting}
          data-testid="email"
        />
        {errors.email && touched.email && (
          <p className="mt-1 text-red-400 text-sm">{errors.email}</p>
        )}
      </div>
      
      <div className="mb-6">
        <label htmlFor="password" className="block text-gray-300 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={values.password}
          onChange={(e) => handleChange('password', e.target.value)}
          onBlur={() => handleBlur('password')}
          className={`w-full px-4 py-2 bg-black/50 border rounded text-white focus:outline-none ${
            errors.password && touched.password
              ? 'border-red-500 focus:border-red-500'
              : 'border-gray-600 focus:border-green-500'
          }`}
          placeholder="••••••••"
          disabled={isSubmitting}
          data-testid="password"
        />
        {errors.password && touched.password && (
          <p className="mt-1 text-red-400 text-sm">{errors.password}</p>
        )}
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