-- Migration: Adicionar taxa de juros rotativo aos cartões de crédito
-- Default 14% a.m. (média do mercado brasileiro)

ALTER TABLE cartoes_credito
  ADD COLUMN IF NOT EXISTS taxa_juros_rotativo NUMERIC DEFAULT 14;
