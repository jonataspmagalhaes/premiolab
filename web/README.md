# PremioLab Web

Site oficial e dashboard web do PremioLab — `premiolab.com.br`.
Substitui o `docs/` GitHub Pages estático ao subir em produção.

## Stack

- **Next.js 14** App Router + TypeScript
- **Tailwind CSS** com tokens espelhando o app mobile (`src/theme/tokens.js`)
- **Supabase** auth (`@supabase/ssr` + `@supabase/supabase-js`)
- **Vercel** deploy

## Setup local

```bash
cd web
npm install
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_ANON_KEY com a chave real
npm run dev
```

Abre em http://localhost:3000

## Estrutura

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # root layout + metadata SEO
│   │   ├── page.tsx            # landing principal
│   │   ├── globals.css         # tailwind + glass utility
│   │   ├── login/page.tsx      # auth com Supabase
│   │   ├── assinar/page.tsx    # checkout Kiwify
│   │   ├── dashboard/          # área logada (TODO próxima sessão)
│   │   ├── privacidade/        # TODO portar de docs/
│   │   └── termos/             # TODO portar de docs/
│   └── lib/
│       └── supabase.ts         # cliente browser
├── next.config.mjs
├── tailwind.config.ts          # tokens do mobile espelhados
├── tsconfig.json
└── package.json
```

## Deploy Vercel

1. Conectar este monorepo no Vercel
2. **Root directory**: `web`
3. **Framework**: Next.js (auto-detect)
4. **Env vars** (Production):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://zephynezarjsxzselozi.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (do painel Supabase)
   - `NEXT_PUBLIC_KIWIFY_MONTHLY_URL` = link do produto mensal Kiwify
   - `NEXT_PUBLIC_KIWIFY_ANNUAL_URL` = link do produto anual Kiwify
5. **Domínio**: apontar `premiolab.com.br` no painel Vercel
6. **Aposentar `docs/`**: deletar repositório de páginas GitHub Pages OU configurar 301 redirect pro Vercel

## Páginas implementadas

- [x] `/` — landing principal com hero, features, pricing, CTA
- [x] `/login` — auth via Supabase (email + senha)
- [x] `/cadastro` — signup com confirmação por email
- [x] `/assinar` — checkout Kiwify (mensal R$14,90 / anual R$149)
- [x] `/privacidade` — política de privacidade portada de `docs/`
- [x] `/termos` — termos de uso portados de `docs/`
- [x] `/dashboard` — área logada com renda 30d, patrimônio, posições top, meta
- [x] `/auth/logout` — POST handler para sign out
- [x] `sitemap.xml` e `robots.txt` (gerados automaticamente)
- [x] `Header` e `Footer` reaproveitáveis (`src/components/`)
- [x] Middleware Supabase: refresh de sessão + protege `/dashboard`

## Próximas iterações

- [ ] OG image dinâmica (open-graph route handler)
- [ ] Página `/dashboard/posicoes` com lista completa filtrável
- [ ] Página `/dashboard/relatorios` listando os PDFs mensais (`portfolio_backups`)
- [ ] Integração visual com `/dashboard/calendario` (eventos próximos 30d)
- [ ] Recuperação de senha (`/recuperar-senha`)
- [ ] Analytics (Vercel Analytics ou Plausible)
- [ ] Páginas blog/conteúdo SEO (`/blog/...`)
