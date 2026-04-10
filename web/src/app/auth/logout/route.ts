import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = getSupabaseServer();
  await supabase.auth.signOut();
  const url = new URL('/', request.url);
  return NextResponse.redirect(url, { status: 303 });
}
