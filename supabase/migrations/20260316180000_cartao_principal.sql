-- Add cartao_principal column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cartao_principal UUID DEFAULT NULL;
