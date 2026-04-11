-- Reconciliacao de compras orfas Kiwify.
-- Quando alguem compra no checkout ANTES de ter conta no app, o webhook
-- insere aqui. No proximo signup/login com o mesmo email, o AuthContext
-- aplica o tier em profiles e marca o pending como 'applied'.

CREATE TABLE IF NOT EXISTS pending_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  tier text NOT NULL DEFAULT 'pro',
  subscription_source text NOT NULL,
  subscription_external_id text,
  subscription_status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  applied_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_subs_email_pending
  ON pending_subscriptions (LOWER(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pending_subs_status
  ON pending_subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_pending_subs_external_id
  ON pending_subscriptions (subscription_external_id)
  WHERE subscription_external_id IS NOT NULL;

-- RLS: so service_role escreve/le. Users nao enxergam (sensivel).
ALTER TABLE pending_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: users podem ler apenas pendings do proprio email (para reconciliacao
-- client-side usando o anon key via RPC seguro futuramente). Por ora, nada.
-- O webhook usa service_role_key, que bypassa RLS.

COMMENT ON TABLE pending_subscriptions IS 'Compras processadas pela Kiwify antes do user ter conta. Reconciliadas no signup/login.';
COMMENT ON COLUMN pending_subscriptions.status IS 'pending | applied | superseded | revoked | expired';
COMMENT ON COLUMN pending_subscriptions.subscription_source IS 'kiwify | stripe | revenuecat';
COMMENT ON COLUMN pending_subscriptions.raw_payload IS 'Backup do payload completo do webhook para auditoria';
