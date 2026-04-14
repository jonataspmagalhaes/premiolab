-- ═══════════════════════════════════════════════════════════
-- Migration: VIP Overrides + Programa de Indicação
-- Executar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- VIP Overrides (email bypass com tier configurável)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vip_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK (tier IN ('pro', 'premium')),
  motivo TEXT,
  concedido_por TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE vip_overrides ENABLE ROW LEVEL SECURITY;

-- RPC para checar VIP (chamado pelo client, SECURITY DEFINER para acessar tabela protegida)
CREATE OR REPLACE FUNCTION check_vip_override(user_email TEXT)
RETURNS TABLE(tier TEXT) AS $$
  SELECT tier FROM vip_overrides
  WHERE lower(email) = lower(user_email) AND ativo = TRUE
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════
-- Programa de Indicação (referrals)
-- ═══════════════════════════════════════════════════════

-- Colunas no profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_reward_tier TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_reward_end DATE DEFAULT NULL;

-- Device ID no profiles (anti-fraude)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS device_id TEXT DEFAULT NULL;

-- Tabela de indicações
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users NOT NULL,
  referred_id UUID REFERENCES auth.users NOT NULL,
  referred_email TEXT NOT NULL,
  device_id TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  activated_at TIMESTAMPTZ,
  UNIQUE(referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_device ON referrals(device_id);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_user ON referrals FOR ALL USING (auth.uid() = referrer_id);

-- ═══════════════════════════════════════════════════════
-- Proteção anti-fraude: RPC server-side
-- ═══════════════════════════════════════════════════════

-- Rate limit: conta referrals criados nos últimos 30 dias por referrer
CREATE OR REPLACE FUNCTION check_referral_rate_limit(p_referrer_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM referrals
  WHERE referrer_id = p_referrer_id
    AND created_at >= now() - interval '30 days';
$$ LANGUAGE sql SECURITY DEFINER;

-- Device check: conta quantos referrals com mesmo device_id existem para o mesmo referrer
CREATE OR REPLACE FUNCTION check_referral_device(p_referrer_id UUID, p_device_id TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM referrals
  WHERE referrer_id = p_referrer_id
    AND device_id = p_device_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Exemplos de uso VIP:
-- INSERT INTO vip_overrides (email, tier, motivo) VALUES ('influencer@gmail.com', 'pro', 'Parceria Instagram');
-- INSERT INTO vip_overrides (email, tier, motivo) VALUES ('beta@gmail.com', 'premium', 'Beta tester');
-- UPDATE vip_overrides SET ativo = FALSE WHERE email = 'influencer@gmail.com'; -- revogar
