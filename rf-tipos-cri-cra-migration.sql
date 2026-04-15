-- Migration: expandir tipos de renda_fixa pra incluir LCI, LCA separados,
-- CRI e CRA. Mantem 'lci_lca' combinado por compat com registros antigos.

ALTER TABLE renda_fixa DROP CONSTRAINT IF EXISTS renda_fixa_tipo_check;
ALTER TABLE renda_fixa ADD CONSTRAINT renda_fixa_tipo_check
  CHECK (tipo IN (
    'cdb', 'lci', 'lca', 'lci_lca', 'cri', 'cra',
    'tesouro_ipca', 'tesouro_selic', 'tesouro_pre',
    'debenture'
  ));
