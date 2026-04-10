'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase';

export default function CadastroPage() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.user) {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="glass p-8 w-full max-w-md text-center">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="font-display font-extrabold text-2xl mb-3">Confirme seu email</h1>
          <p className="text-secondary mb-6">
            Enviamos um link de confirmação para <strong className="text-primary">{email}</strong>.
            Abra o email e clique no link para ativar sua conta.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-md bg-income text-bg font-display font-bold"
          >
            Ir para o login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="glass p-8 w-full max-w-md">
        <Link href="/" className="text-sm text-secondary hover:text-primary">
          ← Voltar
        </Link>
        <h1 className="font-display font-extrabold text-3xl mt-4 mb-2">Criar conta</h1>
        <p className="text-sm text-secondary mb-6">
          Já tem conta?{' '}
          <Link href="/login" className="text-income hover:underline">Entrar</Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted font-mono uppercase">Nome</label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full mt-1 px-3 py-3 rounded-md bg-surface2 text-primary border border-white/5 focus:border-accent outline-none"
              placeholder="Como devemos te chamar"
            />
          </div>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-3 rounded-md bg-surface2 text-primary border border-white/5 focus:border-accent outline-none"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-md bg-income text-bg font-display font-bold hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Criando...' : 'Criar conta grátis'}
          </button>

          <p className="text-xs text-muted text-center mt-4">
            Ao criar conta você concorda com nossos{' '}
            <Link href="/termos" className="text-secondary hover:text-primary">Termos</Link>
            {' '}e{' '}
            <Link href="/privacidade" className="text-secondary hover:text-primary">Política de Privacidade</Link>
            .
          </p>
        </form>
      </div>
    </main>
  );
}
