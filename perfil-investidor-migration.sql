-- Migration: Perfil do investidor para analise IA personalizada
-- Executar no SQL Editor do Supabase Dashboard

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perfil_investidor TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS objetivo_investimento TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS horizonte_investimento TEXT DEFAULT '';

-- perfil_investidor: conservador, moderado, arrojado
-- objetivo_investimento: renda_passiva, crescimento, preservacao, especulacao
-- horizonte_investimento: curto (ate 1 ano), medio (1-5 anos), longo (5+ anos)
