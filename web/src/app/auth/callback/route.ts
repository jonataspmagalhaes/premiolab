// Auth callback: troca code por sessao (magic link, OAuth, refresh via URL).

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zephynezarjsxzselozi.supabase.co';
var SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: NextRequest) {
  var requestUrl = new URL(request.url);
  var code = requestUrl.searchParams.get('code');
  var next = requestUrl.searchParams.get('next') || '/app';

  if (code) {
    var response = NextResponse.redirect(new URL(next, requestUrl.origin));

    var supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
      cookies: {
        getAll: function() {
          return request.cookies.getAll();
        },
        setAll: function(cookiesToSet) {
          cookiesToSet.forEach(function(c) {
            response.cookies.set(c.name, c.value, c.options);
          });
        },
      },
    });

    await supabase.auth.exchangeCodeForSession(code);
    return response;
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
