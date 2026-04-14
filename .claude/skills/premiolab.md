---
name: premiolab
description: Skill principal do PremioLab. Ativa automaticamente para qualquer tarefa de desenvolvimento.
---

# PremioLab

## Stack
- React Native + Expo SDK 54 (iOS + Web)
- Supabase (Auth, Postgres, Edge Functions)
- TypeScript estrito
- Expo Router (file-based navigation)

## Design System — NUNCA quebrar
- Fundo: dark mode glassmorphism obrigatório
- Fontes: DM Sans (UI) + JetBrains Mono (números/dados)
- Ações:  #3B82F6
- FIIs:   #10B981
- Opções: #8B5CF6
- ETFs:   #F59E0B
- RF:     #06B6D4
- Glow orbs por tipo de ativo em todas as telas

## Regras de Código
- Sempre usar SafeAreaView com edges explícitos: edges={['top','bottom']}
- Nunca inline styles — sempre StyleSheet.create()
- Componentes em português BR
- Tipagem TypeScript completa, sem `any`
- Dados financeiros sempre em formato BR: R$ 1.234,56

## Arquitetura
- Supabase para todos os dados persistidos
- Black-Scholes calculado client-side para opções
- brapi.dev Pro para cotações em tempo real
- COTAHIST para dados históricos

## Bugs Pendentes (prioridade)
1. SafeArea/notch — edges não aplicados em todas as telas
2. Options form — validação incompleta
3. Buy/sell button no AssetDetail — ação não conectada

## Ao implementar qualquer feature
1. Verificar consistência com design system acima
2. Rodar type check antes de finalizar
3. Testar no simulador iOS via expo-mcp quando possível
4. Garantir que não quebra navegação existente
