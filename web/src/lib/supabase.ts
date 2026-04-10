import { createBrowserClient } from '@supabase/ssr';

// Cliente browser. Para SSR/server actions, usar createServerClient
// com cookies do Next em uma futura iteracao.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zephynezarjsxzselozi.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function getSupabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
}
