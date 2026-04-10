-- Fase I reconstrucao: colunas para gestao de assinatura via webhook Kiwify.
-- Adiciona suporte a 1 fonte externa (kiwify) por enquanto. Pode ser
-- estendido depois pra Stripe/RevenueCat reusando subscription_source.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_source TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_external_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Index pra busca rapida por email no webhook
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_external_id ON profiles (subscription_external_id);

-- Backfill: copiar email do auth.users pro profiles (apenas se vazio)
UPDATE profiles p
SET email = LOWER(u.email)
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

COMMENT ON COLUMN profiles.subscription_expires_at IS 'Quando a assinatura expira (UTC). null = nunca teve PRO.';
COMMENT ON COLUMN profiles.subscription_source IS 'kiwify | stripe | revenuecat | vip_override | trial';
COMMENT ON COLUMN profiles.subscription_external_id IS 'order_id ou subscription_id da plataforma externa';
COMMENT ON COLUMN profiles.subscription_status IS 'active | canceled | refunded | chargeback | trial';
