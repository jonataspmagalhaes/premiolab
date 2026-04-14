# Asset Class Icons — Web

Data: 2026-04-14
Escopo: web (`/web`), Next.js + Tailwind + lucide-react

## Problema

Hoje a Carteira e o Dashboard identificam classe de ativo apenas por **pill de texto colorido** (`Acoes / FIIs / ETFs / INT`). Em listas densas isso reduz scanabilidade e perde a oportunidade de reforçar identidade visual premium definida no design brief (glassmorphism, dark mode autoral).

## Solução

Componente único `AssetClassIcon` que renderiza um **chip 24/32/40 px** com gradiente sutil + glow + ícone Lucide centralizado, na cor token da classe. Reusado em 3 pontos de aplicação iniciais.

### Componente

`web/src/components/AssetClassIcon.tsx`

```ts
type AssetClass = 'acao' | 'fii' | 'etf' | 'stock_int' | 'rf' | 'opcoes';
type Size = 'sm' | 'md' | 'lg'; // 24 / 32 / 40 px

interface Props {
  classe: AssetClass | string; // tolera string pra fallback seguro
  size?: Size;                  // default 'md'
  className?: string;
}
```

Comportamento:
- Classe desconhecida → fallback `acao` (não quebra render)
- `role="img"` + `aria-label={label}` pra acessibilidade
- Chip: `rounded-xl border` + `bg-gradient-to-br from-{cor}/25 to-{cor}/5` + glow `shadow-[0_0_12px_-4px_rgba(...)]`
- Glyph stroke 2, tamanho ≈ 60% do chip, `text-{cor}`

### Mapping

| classe | token cor | hex | glyph Lucide | label |
|---|---|---|---|---|
| acao | orange-500 | #F97316 | Building2 | Ação |
| fii | income | #22C55E | Warehouse | FII |
| etf | warning | #F59E0B | Layers | ETF |
| stock_int | stock-int | #E879F9 | Globe2 | INT |
| rf | cyan-400 | #22D3EE | Landmark | RF |
| opcoes | accent | #6C5CE7 | Sparkles | Opção |

Cores `income`, `warning`, `stock-int`, `accent` já existem no Tailwind config do `/web`. `orange-500` e `cyan-400` são padrão Tailwind.

### Pontos de aplicação

1. **Carteira lista de posições** (`web/src/app/(app)/app/carteira/page.tsx`)
   - Substituir pill texto-only por `<AssetClassIcon size="sm" />` antes do nome do ticker
   - Manter label como tooltip/aria
2. **Carteira header de grupo (modo "Por classe")**
   - Chip `size="md"` ao lado do título do grupo
3. **Dashboard legenda do donut** (`web/src/app/(app)/app/page.tsx`)
   - Chip `size="sm"` antes de cada item da legenda

## Fora de escopo

- Treemap (Recharts custom renderer — outra rodada)
- App mobile RN
- Novos tokens de cor
- Animações/hover state (chip é estático nesta versão)

## Critérios de sucesso

- 4 classes hoje renderizadas no web mostram chip ao invés de pill texto
- Componente preparado pras 6 classes (rf/opcoes inclusas mesmo sem ponto de uso ainda)
- Zero novas dependências
- Sem regressão visual: layout/alinhamento das listas preservado
