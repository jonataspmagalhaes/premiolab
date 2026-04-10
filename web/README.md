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

## Próximas iterações

- [ ] Páginas `/privacidade` e `/termos` (portar de `docs/`)
- [ ] `/dashboard` com renda projetada + posições + calendário
- [ ] Server actions usando `@supabase/ssr` e cookies do Next
- [ ] Integração com edge function `kiwify-webhook` (já criada)
- [ ] OG image dinâmica
- [ ] Sitemap + robots.txt
- [ ] Analytics (Vercel Analytics ou Plausible)
