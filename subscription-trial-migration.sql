-- ═══════════════════════════════════════════════════════════
-- Migration: Trial columns para sistema de assinaturas
-- Executar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════

-- Trial PRO
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_pro_used BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_pro_start DATE;

-- Trial Premium
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_premium_used BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_premium_start DATE;
