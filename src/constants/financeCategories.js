// ═══════════════════════════════════════════════════════
// FINANCE CATEGORIES — Módulo compartilhado de categorias
// Centraliza metadata de categorias, grupos, subcategorias
// Usado por: CaixaView, ExtratoScreen, AddMovimentacaoScreen,
//            EditMovimentacaoScreen, FinancasView
// ═══════════════════════════════════════════════════════

var C = require('../theme').C;

// ── Grupos de gastos (10 pessoais + 2 sistema) ──
var FINANCE_GROUPS = [
  { k: 'moradia', l: 'Moradia', icon: 'home-outline', color: '#3B82F6' },
  { k: 'alimentacao', l: 'Alimentação', icon: 'restaurant-outline', color: '#F59E0B' },
  { k: 'transporte', l: 'Transporte', icon: 'car-outline', color: '#8B5CF6' },
  { k: 'saude', l: 'Saúde', icon: 'medkit-outline', color: '#EF4444' },
  { k: 'educacao', l: 'Educação', icon: 'school-outline', color: '#06B6D4' },
  { k: 'lazer', l: 'Lazer', icon: 'game-controller-outline', color: '#E879F9' },
  { k: 'compras', l: 'Compras', icon: 'bag-outline', color: '#10B981' },
  { k: 'servicos', l: 'Serviços', icon: 'flash-outline', color: '#F97316' },
  { k: 'seguros', l: 'Seguros', icon: 'shield-outline', color: '#6366F1' },
  { k: 'renda', l: 'Renda', icon: 'wallet-outline', color: '#22C55E' },
  { k: 'investimento', l: 'Investimento', icon: 'trending-up-outline', color: '#22C55E' },
  { k: 'outro', l: 'Outro', icon: 'ellipse-outline', color: '#555577' },
];

// ── Lookup rápido de grupo ──
var GRUPO_META = {};
for (var gi = 0; gi < FINANCE_GROUPS.length; gi++) {
  var fg = FINANCE_GROUPS[gi];
  GRUPO_META[fg.k] = { label: fg.l, icon: fg.icon, color: fg.color };
}

// ── Subcategorias por grupo (campo `subcategoria` na movimentacao) ──
var SUBCATEGORIAS = {
  // Moradia
  moradia_aluguel:      { l: 'Aluguel', grupo: 'moradia', icon: 'home-outline', color: '#3B82F6' },
  moradia_condominio:   { l: 'Condomínio', grupo: 'moradia', icon: 'home-outline', color: '#3B82F6' },
  moradia_iptu:         { l: 'IPTU', grupo: 'moradia', icon: 'home-outline', color: '#3B82F6' },
  moradia_manutencao:   { l: 'Manutenção', grupo: 'moradia', icon: 'construct-outline', color: '#3B82F6' },
  // Alimentacao
  alimentacao_supermercado: { l: 'Supermercado', grupo: 'alimentacao', icon: 'cart-outline', color: '#F59E0B' },
  alimentacao_restaurante:  { l: 'Restaurante', grupo: 'alimentacao', icon: 'restaurant-outline', color: '#F59E0B' },
  alimentacao_delivery:     { l: 'Delivery', grupo: 'alimentacao', icon: 'bicycle-outline', color: '#F59E0B' },
  // Transporte
  transporte_combustivel:    { l: 'Combustível', grupo: 'transporte', icon: 'speedometer-outline', color: '#8B5CF6' },
  transporte_estacionamento: { l: 'Estacionamento', grupo: 'transporte', icon: 'car-outline', color: '#8B5CF6' },
  transporte_publico:        { l: 'Transporte público', grupo: 'transporte', icon: 'bus-outline', color: '#8B5CF6' },
  transporte_app:            { l: 'App de corrida', grupo: 'transporte', icon: 'navigate-outline', color: '#8B5CF6' },
  // Saude
  saude_plano:    { l: 'Plano de saúde', grupo: 'saude', icon: 'medkit-outline', color: '#EF4444' },
  saude_farmacia: { l: 'Farmácia', grupo: 'saude', icon: 'bandage-outline', color: '#EF4444' },
  saude_consulta: { l: 'Consultas', grupo: 'saude', icon: 'fitness-outline', color: '#EF4444' },
  // Educacao
  educacao_mensalidade: { l: 'Mensalidade', grupo: 'educacao', icon: 'school-outline', color: '#06B6D4' },
  educacao_cursos:      { l: 'Cursos', grupo: 'educacao', icon: 'book-outline', color: '#06B6D4' },
  educacao_livros:      { l: 'Livros', grupo: 'educacao', icon: 'library-outline', color: '#06B6D4' },
  // Lazer
  lazer_streaming: { l: 'Streaming', grupo: 'lazer', icon: 'tv-outline', color: '#E879F9' },
  lazer_viagem:    { l: 'Viagens', grupo: 'lazer', icon: 'airplane-outline', color: '#E879F9' },
  lazer_eventos:   { l: 'Eventos', grupo: 'lazer', icon: 'ticket-outline', color: '#E879F9' },
  // Compras
  compras_vestuario:    { l: 'Vestuário', grupo: 'compras', icon: 'shirt-outline', color: '#10B981' },
  compras_eletronicos:  { l: 'Eletrônicos', grupo: 'compras', icon: 'phone-portrait-outline', color: '#10B981' },
  compras_presentes:    { l: 'Presentes', grupo: 'compras', icon: 'gift-outline', color: '#10B981' },
  // Servicos
  servicos_internet: { l: 'Internet', grupo: 'servicos', icon: 'wifi-outline', color: '#F97316' },
  servicos_celular:  { l: 'Celular', grupo: 'servicos', icon: 'phone-portrait-outline', color: '#F97316' },
  servicos_energia:  { l: 'Energia', grupo: 'servicos', icon: 'flash-outline', color: '#F97316' },
  servicos_agua:     { l: 'Água', grupo: 'servicos', icon: 'water-outline', color: '#F97316' },
  servicos_gas:      { l: 'Gás', grupo: 'servicos', icon: 'flame-outline', color: '#F97316' },
  // Seguros
  seguros_auto:        { l: 'Auto', grupo: 'seguros', icon: 'car-sport-outline', color: '#6366F1' },
  seguros_vida:        { l: 'Vida', grupo: 'seguros', icon: 'heart-outline', color: '#6366F1' },
  seguros_residencial: { l: 'Residencial', grupo: 'seguros', icon: 'shield-outline', color: '#6366F1' },
  // Renda (entradas)
  renda_freelance: { l: 'Freelance', grupo: 'renda', icon: 'laptop-outline', color: '#22C55E' },
  renda_aluguel:   { l: 'Aluguel recebido', grupo: 'renda', icon: 'home-outline', color: '#22C55E' },
  renda_bonus:     { l: 'Bônus', grupo: 'renda', icon: 'star-outline', color: '#22C55E' },
};

// ── Categorias legadas (campo `categoria` da movimentacao) ──
// Labels, ícones e cores para categorias existentes
var CAT_LABELS = {
  deposito: 'Depósito', retirada: 'Retirada', transferencia: 'Transferência',
  compra_ativo: 'Compra ativo', venda_ativo: 'Venda ativo',
  premio_opcao: 'Prêmio opção', recompra_opcao: 'Recompra opção',
  exercicio_opcao: 'Exercício', dividendo: 'Dividendo',
  jcp: 'JCP', rendimento_fii: 'Rendimento FII', rendimento_rf: 'Rendimento RF',
  ajuste_manual: 'Ajuste', salario: 'Salário',
  despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável', outro: 'Outro',
  pagamento_fatura: 'Pgto Fatura',
};

var CAT_IONICONS = {
  deposito: 'arrow-down-circle-outline',
  retirada: 'arrow-up-circle-outline',
  transferencia: 'swap-horizontal-outline',
  compra_ativo: 'cart-outline',
  venda_ativo: 'trending-up-outline',
  premio_opcao: 'flash-outline',
  recompra_opcao: 'flash-outline',
  exercicio_opcao: 'flash-outline',
  dividendo: 'cash-outline',
  jcp: 'cash-outline',
  rendimento_fii: 'home-outline',
  rendimento_rf: 'document-text-outline',
  ajuste_manual: 'build-outline',
  salario: 'wallet-outline',
  despesa_fixa: 'receipt-outline',
  despesa_variavel: 'receipt-outline',
  outro: 'ellipse-outline',
  pagamento_fatura: 'card-outline',
};

var CAT_COLORS = {
  deposito: C.green, retirada: C.red, transferencia: C.accent,
  compra_ativo: C.acoes, venda_ativo: C.acoes,
  premio_opcao: C.opcoes, recompra_opcao: C.opcoes,
  exercicio_opcao: C.opcoes, dividendo: C.opcoes,
  jcp: C.opcoes, rendimento_fii: C.opcoes, rendimento_rf: C.rf,
  ajuste_manual: C.dim, salario: C.green,
  despesa_fixa: C.yellow, despesa_variavel: C.yellow, outro: C.dim,
  pagamento_fatura: C.accent,
};

// ── Categorias auto-geradas (investimento, não deletáveis) ──
var AUTO_CATEGORIAS = [
  'compra_ativo', 'venda_ativo', 'premio_opcao', 'recompra_opcao',
  'exercicio_opcao', 'dividendo', 'jcp', 'rendimento_fii', 'rendimento_rf',
  'pagamento_fatura',
];

// ── Mapeamento legado categoria → grupo ──
var LEGACY_GRUPO_MAP = {
  deposito: 'outro', retirada: 'outro', transferencia: 'outro',
  compra_ativo: 'investimento', venda_ativo: 'investimento',
  premio_opcao: 'investimento', recompra_opcao: 'investimento',
  exercicio_opcao: 'investimento', dividendo: 'investimento',
  jcp: 'investimento', rendimento_fii: 'investimento',
  rendimento_rf: 'investimento',
  salario: 'renda', despesa_fixa: 'outro', despesa_variavel: 'outro',
  ajuste_manual: 'outro', outro: 'outro',
  pagamento_fatura: 'outro',
};

// ── Categorias para formulários ──
// Entradas agrupadas
var CATEGORIAS_ENTRADA = [
  { k: 'deposito', l: 'Depósito', g: 'Outro' },
  { k: 'salario', l: 'Salário', g: 'Renda' },
  { k: 'venda_ativo', l: 'Venda ativo', g: 'Investimento' },
  { k: 'premio_opcao', l: 'Prêmio opção', g: 'Investimento' },
  { k: 'dividendo', l: 'Dividendo', g: 'Renda' },
  { k: 'jcp', l: 'JCP', g: 'Renda' },
  { k: 'rendimento_fii', l: 'Rend. FII', g: 'Renda' },
  { k: 'rendimento_rf', l: 'Rend. RF', g: 'Renda' },
  { k: 'ajuste_manual', l: 'Ajuste', g: 'Outro' },
  { k: 'outro', l: 'Outro', g: 'Outro' },
];

// Saídas agrupadas (original + pessoais)
var CATEGORIAS_SAIDA = [
  { k: 'retirada', l: 'Retirada', g: 'Outro' },
  { k: 'compra_ativo', l: 'Compra ativo', g: 'Investimento' },
  { k: 'recompra_opcao', l: 'Recompra opção', g: 'Investimento' },
  { k: 'exercicio_opcao', l: 'Exercício opção', g: 'Investimento' },
  { k: 'despesa_fixa', l: 'Despesa fixa', g: 'Despesa' },
  { k: 'despesa_variavel', l: 'Despesa variável', g: 'Despesa' },
  { k: 'ajuste_manual', l: 'Ajuste', g: 'Outro' },
  { k: 'outro', l: 'Outro', g: 'Outro' },
];

// ── Subcategorias para forms, agrupadas por grupo ──
// Retorna array de { k, l } para um grupo específico (tipo saida)
var SUBCATS_SAIDA = [
  { grupo: 'moradia', items: [
    { k: 'moradia_aluguel', l: 'Aluguel' },
    { k: 'moradia_condominio', l: 'Condomínio' },
    { k: 'moradia_iptu', l: 'IPTU' },
    { k: 'moradia_manutencao', l: 'Manutenção' },
  ]},
  { grupo: 'alimentacao', items: [
    { k: 'alimentacao_supermercado', l: 'Supermercado' },
    { k: 'alimentacao_restaurante', l: 'Restaurante' },
    { k: 'alimentacao_delivery', l: 'Delivery' },
  ]},
  { grupo: 'transporte', items: [
    { k: 'transporte_combustivel', l: 'Combustível' },
    { k: 'transporte_estacionamento', l: 'Estacionamento' },
    { k: 'transporte_publico', l: 'Transporte público' },
    { k: 'transporte_app', l: 'App de corrida' },
  ]},
  { grupo: 'saude', items: [
    { k: 'saude_plano', l: 'Plano de saúde' },
    { k: 'saude_farmacia', l: 'Farmácia' },
    { k: 'saude_consulta', l: 'Consultas' },
  ]},
  { grupo: 'educacao', items: [
    { k: 'educacao_mensalidade', l: 'Mensalidade' },
    { k: 'educacao_cursos', l: 'Cursos' },
    { k: 'educacao_livros', l: 'Livros' },
  ]},
  { grupo: 'lazer', items: [
    { k: 'lazer_streaming', l: 'Streaming' },
    { k: 'lazer_viagem', l: 'Viagens' },
    { k: 'lazer_eventos', l: 'Eventos' },
  ]},
  { grupo: 'compras', items: [
    { k: 'compras_vestuario', l: 'Vestuário' },
    { k: 'compras_eletronicos', l: 'Eletrônicos' },
    { k: 'compras_presentes', l: 'Presentes' },
  ]},
  { grupo: 'servicos', items: [
    { k: 'servicos_internet', l: 'Internet' },
    { k: 'servicos_celular', l: 'Celular' },
    { k: 'servicos_energia', l: 'Energia' },
    { k: 'servicos_agua', l: 'Água' },
    { k: 'servicos_gas', l: 'Gás' },
  ]},
  { grupo: 'seguros', items: [
    { k: 'seguros_auto', l: 'Auto' },
    { k: 'seguros_vida', l: 'Vida' },
    { k: 'seguros_residencial', l: 'Residencial' },
  ]},
];

// Subcategorias para entradas
var SUBCATS_ENTRADA = [
  { grupo: 'renda', items: [
    { k: 'renda_freelance', l: 'Freelance' },
    { k: 'renda_aluguel', l: 'Aluguel recebido' },
    { k: 'renda_bonus', l: 'Bônus' },
  ]},
];

// ── Grupos que podem ter orçamento (exclui investimento, renda, outro) ──
var BUDGET_GROUPS = FINANCE_GROUPS.filter(function(g) {
  return g.k !== 'investimento' && g.k !== 'renda' && g.k !== 'outro';
});

// ═══════════ HELPER FUNCTIONS ═══════════

// Retorna o grupo de uma movimentacao baseado em categoria + subcategoria
function getGrupo(categoria, subcategoria) {
  // Se tem subcategoria, usa o prefixo dela
  if (subcategoria) {
    var sub = SUBCATEGORIAS[subcategoria];
    if (sub) return sub.grupo;
    // Fallback: extrair prefixo
    var idx = subcategoria.indexOf('_');
    if (idx > 0) return subcategoria.substring(0, idx);
  }
  // Sem subcategoria: usa mapeamento legado da categoria
  if (LEGACY_GRUPO_MAP[categoria]) return LEGACY_GRUPO_MAP[categoria];
  return 'outro';
}

// Retorna metadata do grupo { label, icon, color }
function getGrupoMeta(grupo) {
  return GRUPO_META[grupo] || { label: 'Outro', icon: 'ellipse-outline', color: '#555577' };
}

// Retorna subcategorias de um grupo
function getSubcategorias(grupo) {
  var result = [];
  var keys = Object.keys(SUBCATEGORIAS);
  for (var i = 0; i < keys.length; i++) {
    if (SUBCATEGORIAS[keys[i]].grupo === grupo) {
      result.push({ k: keys[i], l: SUBCATEGORIAS[keys[i]].l });
    }
  }
  return result;
}

// Label legível de uma subcategoria
function getSubcatLabel(subcat) {
  if (!subcat) return '';
  var s = SUBCATEGORIAS[subcat];
  return s ? s.l : subcat;
}

// Label legível de uma categoria (legada) — compatibilidade
function getCatLabel(cat) {
  if (!cat) return '';
  return CAT_LABELS[cat] || cat;
}

// Ícone de uma categoria ou subcategoria
function getCatIcon(cat, subcat) {
  if (subcat && SUBCATEGORIAS[subcat]) return SUBCATEGORIAS[subcat].icon;
  return CAT_IONICONS[cat] || 'ellipse-outline';
}

// Cor de uma categoria ou subcategoria
function getCatColor(cat, subcat) {
  if (subcat && SUBCATEGORIAS[subcat]) return SUBCATEGORIAS[subcat].color;
  return CAT_COLORS[cat] || C.dim;
}

// ═══════════ MESES ═══════════
var MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
var MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// ═══════════ EXPORTS ═══════════
module.exports = {
  FINANCE_GROUPS: FINANCE_GROUPS,
  GRUPO_META: GRUPO_META,
  SUBCATEGORIAS: SUBCATEGORIAS,
  CAT_LABELS: CAT_LABELS,
  CAT_IONICONS: CAT_IONICONS,
  CAT_COLORS: CAT_COLORS,
  AUTO_CATEGORIAS: AUTO_CATEGORIAS,
  LEGACY_GRUPO_MAP: LEGACY_GRUPO_MAP,
  CATEGORIAS_ENTRADA: CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA: CATEGORIAS_SAIDA,
  SUBCATS_SAIDA: SUBCATS_SAIDA,
  SUBCATS_ENTRADA: SUBCATS_ENTRADA,
  BUDGET_GROUPS: BUDGET_GROUPS,
  MESES_NOMES: MESES_NOMES,
  MESES_FULL: MESES_FULL,
  getGrupo: getGrupo,
  getGrupoMeta: getGrupoMeta,
  getSubcategorias: getSubcategorias,
  getSubcatLabel: getSubcatLabel,
  getCatLabel: getCatLabel,
  getCatIcon: getCatIcon,
  getCatColor: getCatColor,
};
