-- Migration: adicionar 'cripto' à CHECK constraint de operacoes.categoria

ALTER TABLE operacoes DROP CONSTRAINT IF EXISTS operacoes_categoria_check;
ALTER TABLE operacoes ADD CONSTRAINT operacoes_categoria_check
  CHECK (categoria IN (
    'acao', 'fii', 'etf', 'stock_int',
    'bdr', 'adr', 'reit',
    'cripto'
  ));
