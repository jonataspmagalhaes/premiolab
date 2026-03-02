-- Adiciona colunas JSONB para favoritos e watchlist de opções no profiles
-- Migração de AsyncStorage → Supabase para persistência cross-device

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS opcoes_favorites JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS opcoes_watchlist JSONB DEFAULT '[]'::jsonb;
