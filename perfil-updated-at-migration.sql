-- Migration: adiciona timestamp de ultima atualizacao do perfil de investidor
-- Usado para lembrar o usuario de revisar o perfil apos 1 ano

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perfil_investidor_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Preencher para usuarios que ja tem perfil preenchido (usa now() como fallback)
UPDATE profiles
SET perfil_investidor_updated_at = now()
WHERE perfil_investidor IS NOT NULL
  AND perfil_investidor != ''
  AND perfil_investidor_updated_at IS NULL;
