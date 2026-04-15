-- Migration: completar tipos de renda_fixa com LC, LIG, debenture incentivada e poupanca.

ALTER TABLE renda_fixa DROP CONSTRAINT IF EXISTS renda_fixa_tipo_check;
ALTER TABLE renda_fixa ADD CONSTRAINT renda_fixa_tipo_check
  CHECK (tipo IN (
    'cdb', 'lc',
    'lci', 'lca', 'lci_lca', 'lig',
    'cri', 'cra',
    'tesouro_ipca', 'tesouro_selic', 'tesouro_pre',
    'debenture', 'debenture_incentivada',
    'poupanca'
  ));
