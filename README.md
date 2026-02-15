# PremioLab v4.0.0

Seu laboratório de investimentos com foco em opções, ações, FIIs e renda fixa.

## Setup Rápido

### 1. Instalar dependências

```bash
cd premiolab
npm install
```

### 2. Baixar fontes

Criar pasta `assets/fonts/` e baixar:

**DM Sans** — https://fonts.google.com/specimen/DM+Sans
- DMSans-Regular.ttf
- DMSans-Medium.ttf  
- DMSans-Bold.ttf

**JetBrains Mono** — https://fonts.google.com/specimen/JetBrains+Mono
- JetBrainsMono-Regular.ttf
- JetBrainsMono-Bold.ttf

### 3. Assets placeholder

Criar pasta `assets/` com:
- icon.png (1024×1024)
- splash.png (1284×2778)
- adaptive-icon.png (1024×1024)

### 4. Supabase — executar migration

Supabase Dashboard → SQL Editor → colar `supabase-migration.sql`

Cria: 10 tabelas, 2 views, 2 functions, RLS policies, 16 instituições seed.

### 5. Rodar

```bash
npx expo start
```

## Estrutura

```
src/
├── config/supabase.js          # Client (URL + anon key)
├── contexts/AuthContext.js      # Auth + session + onboarding
├── theme/index.js               # Cores, fontes, sizes, shadows
├── components/                  # Glass, Badge, Pill, Sparkline, Gauge, Skeleton, Empty
├── navigation/AppNavigator.js   # Auth→Onboarding→Tabs+Stack
├── services/database.js         # CRUD Supabase (13 funções + getDashboard)
└── screens/
    ├── auth/          LoginScreen, OnboardingScreen
    ├── home/          HomeScreen (dashboard)
    ├── carteira/      CarteiraScreen, AssetDetailScreen
    ├── opcoes/        OpcoesScreen (Ativas/Chain/SimuladorBS/Histórico)
    ├── analise/       AnaliseScreen (Performance/Alocação/Proventos/IR)
    └── mais/          MaisScreen, Config(Meta/Corretoras/Alertas/Selic)
```

## Auth Flow

App Start → Session? → Não → Login/Register
                     → Sim → Onboarded? → Não → Onboarding (4 steps)
                                        → Sim → MainTabs

## Design: Dark mode permanente, glassmorphism, glow orbs por produto
