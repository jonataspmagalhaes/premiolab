'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="glass p-8 w-full max-w-md">
        <Link href="/" className="text-sm text-secondary hover:text-primary">
          ← Voltar
        </Link>
        <h1 className="font-display font-extrabold text-3xl mt-4 mb-2">Entrar</h1>
        <p className="text-sm text-secondary mb-6">Use a mesma conta do app mobile.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted font-mono uppercase">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 px-3 py-3 rounded-md bg-surface2 text-primary border border-white/5 focus:border-accent outline-none"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted font-mono uppercase">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-3 rounded-md bg-surface2 text-primary border border-white/5 focus:border-accent outline-none"
              placeholder="••••••••"
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-md bg-income text-bg font-display font-bold hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-secondary">
          Não tem conta?{' '}
          <Link href="/assinar" className="text-income hover:underline">
            Assinar agora
          </Link>
        </div>
      </div>
    </main>
  );
}
