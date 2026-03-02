-- Gastos Rápidos — presets de despesas frequentes
-- Executar no Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gastos_rapidos JSONB DEFAULT '[]'::jsonb;

-- Formato do array:
-- [
--   {
--     "id": "uuid",
--     "label": "Almoço",
--     "valor": 35.00,
--     "cartao_id": "uuid-do-cartao",
--     "categoria": "despesa_variavel",
--     "subcategoria": "alimentacao_restaurante",
--     "icone": "restaurant-outline",
--     "ordem": 0
--   }
-- ]
