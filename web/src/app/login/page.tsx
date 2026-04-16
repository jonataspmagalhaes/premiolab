'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase';
import { LogoMark } from '@/components/Logo';
import { BackgroundEffects } from '@/components/BackgroundEffects';

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
    router.push('/app');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <BackgroundEffects />

      <div className="linear-card rounded-2xl p-8 w-full max-w-md relative z-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition mb-6">
          <span>←</span>
          <span>Voltar</span>
        </Link>

        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark size={32} />
          <span className="text-[16px] font-semibold tracking-tight">Premio<span className="text-orange-400">Lab</span></span>
        </div>

        <h1 className="font-display font-bold text-2xl mb-1">Entrar</h1>
        <p className="text-[12px] text-white/40 mb-6">Use a mesma conta do app mobile.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 appearance-none px-3 rounded-[6px] bg-white/[0.03] text-white text-[13px] border border-white/[0.08] focus:border-orange-500/40 outline-none transition [-webkit-appearance:none]"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1.5">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 appearance-none px-3 rounded-[6px] bg-white/[0.03] text-white text-[13px] border border-white/[0.08] focus:border-orange-500/40 outline-none transition [-webkit-appearance:none]"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-[6px] bg-orange-500 hover:bg-orange-600 text-black font-semibold text-[13px] disabled:opacity-50 transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
