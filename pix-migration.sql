-- PIX como meio de pagamento
-- Adiciona campo meio_pagamento na tabela movimentacoes
-- Valores: null (legado), 'pix', 'debito', 'credito', 'dinheiro'

ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS meio_pagamento TEXT DEFAULT NULL;
