import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, LayoutAnimation,
  Platform, UIManager, Modal, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import Svg, {
  Circle, Rect as SvgRect, G,
  Text as SvgText, Line as SvgLine, Path,
  Defs, LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useAuth } from '../../contexts/AuthContext';
import {
  getDashboard, getProventos,
  getOperacoes, getProfile, getOpcoes,
  getIndicators,
  getRebalanceTargets, upsertRebalanceTargets,
} from '../../services/database';
import {
  runDailyCalculation, shouldCalculateToday,
  calcHV, calcSMA, calcEMA, calcRSI, calcBeta,
  calcATR, calcBollingerBands, calcMaxDrawdown,
} from '../../services/indicatorService';
import { fetchPriceHistoryLong, fetchTickerProfile } from '../../services/priceService';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';
import InteractiveChart from '../../components/InteractiveChart';

// ═══════════ CONSTANTS ═══════════

var PERIODS = [
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '6M', days: 180 },
  { key: '1A', days: 365 },
  { key: 'Tudo', days: 0 },
];

var PROV_FILTERS = [
  { k: 'todos', l: 'Todos' },
  { k: 'dividendo', l: 'Dividendos' },
  { k: 'jcp', l: 'JCP' },
  { k: 'rendimento', l: 'Rendimento' },
  { k: 'juros_rf', l: 'Juros RF' },
  { k: 'amortizacao', l: 'Amort.' },
  { k: 'bonificacao', l: 'Bonif.' },
];

var TIPO_COLORS_PROV = {
  dividendo: C.fiis,
  jcp: C.acoes,
  rendimento: C.etfs,
  juros_rf: '#06B6D4',
  amortizacao: C.yellow,
  bonificacao: '#8B5CF6',
};

var MONTH_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

var CAT_COLORS = { acao: C.acoes, fii: C.fiis, etf: C.etfs, rf: C.rf };
var CAT_LABELS = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs' };
var CAT_NAMES_FULL = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs', rf: 'RF' };
var SCREEN_W = Dimensions.get('window').width;
var SCREEN_H = Dimensions.get('window').height;

// ── Sankey: sector/segment mapping ──
var TICKER_SECTORS = {
  // Financeiro
  BBAS3: { setor: 'Financeiro', segmento: 'Bancos' }, ITUB4: { setor: 'Financeiro', segmento: 'Bancos' },
  BBDC4: { setor: 'Financeiro', segmento: 'Bancos' }, BBDC3: { setor: 'Financeiro', segmento: 'Bancos' },
  SANB11: { setor: 'Financeiro', segmento: 'Bancos' }, BPAC11: { setor: 'Financeiro', segmento: 'Investimentos' },
  B3SA3: { setor: 'Financeiro', segmento: 'Bolsa' }, BBSE3: { setor: 'Financeiro', segmento: 'Seguros' },
  IRBR3: { setor: 'Financeiro', segmento: 'Seguros' }, PSSA3: { setor: 'Financeiro', segmento: 'Seguros' },
  ITSA4: { setor: 'Financeiro', segmento: 'Holding' }, CXSE3: { setor: 'Financeiro', segmento: 'Seguros' },
  CIEL3: { setor: 'Financeiro', segmento: 'Pagamentos' }, ABCB4: { setor: 'Financeiro', segmento: 'Bancos' },
  // Petróleo e Gás
  PETR4: { setor: 'Petróleo', segmento: 'Expl. e Refino' }, PETR3: { setor: 'Petróleo', segmento: 'Expl. e Refino' },
  PRIO3: { setor: 'Petróleo', segmento: 'Junior Oils' }, RECV3: { setor: 'Petróleo', segmento: 'Junior Oils' },
  RRRP3: { setor: 'Petróleo', segmento: 'Junior Oils' }, CSAN3: { setor: 'Petróleo', segmento: 'Distribuição' },
  UGPA3: { setor: 'Petróleo', segmento: 'Distribuição' }, VBBR3: { setor: 'Petróleo', segmento: 'Distribuição' },
  RAIZ4: { setor: 'Petróleo', segmento: 'Distribuição' },
  // Mineração / Siderurgia
  VALE3: { setor: 'Mineração', segmento: 'Mineração' }, CMIN3: { setor: 'Mineração', segmento: 'Mineração' },
  CSNA3: { setor: 'Siderurgia', segmento: 'Siderurgia' }, GGBR4: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  USIM5: { setor: 'Siderurgia', segmento: 'Siderurgia' }, GOAU4: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  BRAP4: { setor: 'Mineração', segmento: 'Holding' },
  // Energia
  ELET3: { setor: 'Energia', segmento: 'Geração' }, ELET6: { setor: 'Energia', segmento: 'Geração' },
  ENGI11: { setor: 'Energia', segmento: 'Geração' }, CPFE3: { setor: 'Energia', segmento: 'Distribuição' },
  TAEE11: { setor: 'Energia', segmento: 'Transmissão' }, CMIG4: { setor: 'Energia', segmento: 'Geração' },
  CMIG3: { setor: 'Energia', segmento: 'Geração' }, AURE3: { setor: 'Energia', segmento: 'Renovável' },
  EGIE3: { setor: 'Energia', segmento: 'Geração' }, CPLE6: { setor: 'Energia', segmento: 'Distribuição' },
  CPLE3: { setor: 'Energia', segmento: 'Distribuição' }, EQTL3: { setor: 'Energia', segmento: 'Transmissão' },
  ENEV3: { setor: 'Energia', segmento: 'Geração' }, NEOE3: { setor: 'Energia', segmento: 'Distribuição' },
  TRPL4: { setor: 'Energia', segmento: 'Transmissão' }, AESB3: { setor: 'Energia', segmento: 'Geração' },
  // Consumo
  ABEV3: { setor: 'Consumo', segmento: 'Bebidas' }, JBSS3: { setor: 'Consumo', segmento: 'Frigoríficos' },
  MRFG3: { setor: 'Consumo', segmento: 'Frigoríficos' }, BRFS3: { setor: 'Consumo', segmento: 'Frigoríficos' },
  NTCO3: { setor: 'Consumo', segmento: 'Cosméticos' }, BEEF3: { setor: 'Consumo', segmento: 'Frigoríficos' },
  MDIA3: { setor: 'Consumo', segmento: 'Alimentos' }, SMTO3: { setor: 'Consumo', segmento: 'Açúcar' },
  SLCE3: { setor: 'Consumo', segmento: 'Agronegócio' },
  // Varejo
  MGLU3: { setor: 'Varejo', segmento: 'E-commerce' }, LREN3: { setor: 'Varejo', segmento: 'Moda' },
  ARZZ3: { setor: 'Varejo', segmento: 'Moda' }, PETZ3: { setor: 'Varejo', segmento: 'Especializado' },
  RENT3: { setor: 'Varejo', segmento: 'Locação' }, ALPA4: { setor: 'Varejo', segmento: 'Moda' },
  ASAI3: { setor: 'Varejo', segmento: 'Supermercados' }, CRFB3: { setor: 'Varejo', segmento: 'Supermercados' },
  PCAR3: { setor: 'Varejo', segmento: 'Supermercados' }, VIVA3: { setor: 'Varejo', segmento: 'Joias' },
  MULT3: { setor: 'Varejo', segmento: 'Shoppings' }, MOVI3: { setor: 'Varejo', segmento: 'Locação' },
  SOMA3: { setor: 'Varejo', segmento: 'Moda' }, IGTI11: { setor: 'Varejo', segmento: 'Shoppings' },
  // Saúde
  HAPV3: { setor: 'Saúde', segmento: 'Planos' }, RDOR3: { setor: 'Saúde', segmento: 'Hospitais' },
  FLRY3: { setor: 'Saúde', segmento: 'Diagnósticos' }, RADL3: { setor: 'Saúde', segmento: 'Farmácias' },
  HYPE3: { setor: 'Saúde', segmento: 'Farmacêutica' }, ONCO3: { setor: 'Saúde', segmento: 'Hospitais' },
  // Tecnologia
  TOTS3: { setor: 'Tecnologia', segmento: 'Software' }, LWSA3: { setor: 'Tecnologia', segmento: 'Internet' },
  CASH3: { setor: 'Tecnologia', segmento: 'Fintech' }, PAGS3: { setor: 'Tecnologia', segmento: 'Pagamentos' },
  // Telecom
  VIVT3: { setor: 'Telecom', segmento: 'Telecom' }, TIMS3: { setor: 'Telecom', segmento: 'Telecom' },
  // Indústria
  WEGE3: { setor: 'Indústria', segmento: 'Motores' }, EMBR3: { setor: 'Indústria', segmento: 'Aeronáutica' },
  POMO4: { setor: 'Indústria', segmento: 'Ônibus' }, RAPT4: { setor: 'Indústria', segmento: 'Autopeças' },
  TUPY3: { setor: 'Indústria', segmento: 'Autopeças' }, DXCO3: { setor: 'Indústria', segmento: 'Materiais' },
  GGPS3: { setor: 'Indústria', segmento: 'Serviços' }, LEVE3: { setor: 'Indústria', segmento: 'Autopeças' },
  // Papel e Celulose
  SUZB3: { setor: 'Papel/Celulose', segmento: 'Celulose' }, KLBN11: { setor: 'Papel/Celulose', segmento: 'Celulose' },
  // Transporte
  CCRO3: { setor: 'Transporte', segmento: 'Concessões' }, AZUL4: { setor: 'Transporte', segmento: 'Aéreo' },
  GOLL4: { setor: 'Transporte', segmento: 'Aéreo' }, RAIL3: { setor: 'Transporte', segmento: 'Ferroviário' },
  STBP3: { setor: 'Transporte', segmento: 'Portos' }, ECOR3: { setor: 'Transporte', segmento: 'Concessões' },
  // Construção
  CYRE3: { setor: 'Construção', segmento: 'Incorporação' }, EZTC3: { setor: 'Construção', segmento: 'Incorporação' },
  MRVE3: { setor: 'Construção', segmento: 'Incorporação' }, TRIS3: { setor: 'Construção', segmento: 'Incorporação' },
  DIRR3: { setor: 'Construção', segmento: 'Incorporação' }, EVEN3: { setor: 'Construção', segmento: 'Incorporação' },
  // Saneamento
  SBSP3: { setor: 'Saneamento', segmento: 'Saneamento' }, SAPR11: { setor: 'Saneamento', segmento: 'Saneamento' },
  // FIIs — Tijolo (Logística)
  HGLG11: { setor: 'Logística', segmento: 'Galpões' }, XPLG11: { setor: 'Logística', segmento: 'Galpões' },
  BTLG11: { setor: 'Logística', segmento: 'Galpões' }, GGRC11: { setor: 'Logística', segmento: 'Galpões' },
  LVBI11: { setor: 'Logística', segmento: 'Galpões' }, VILG11: { setor: 'Logística', segmento: 'Galpões' },
  BRCO11: { setor: 'Logística', segmento: 'Galpões' }, GALG11: { setor: 'Logística', segmento: 'Galpões' },
  // FIIs — Tijolo (Lajes/Shopping/Urbana)
  HGRE11: { setor: 'Lajes Corp.', segmento: 'Escritórios' },
  BRCR11: { setor: 'Lajes Corp.', segmento: 'Escritórios' }, PVBI11: { setor: 'Lajes Corp.', segmento: 'Escritórios' },
  VINO11: { setor: 'Lajes Corp.', segmento: 'Escritórios' }, RBRP11: { setor: 'Lajes Corp.', segmento: 'Escritórios' },
  XPML11: { setor: 'Shopping', segmento: 'Shopping' }, VISC11: { setor: 'Shopping', segmento: 'Shopping' },
  HSML11: { setor: 'Shopping', segmento: 'Shopping' }, HGBS11: { setor: 'Shopping', segmento: 'Shopping' },
  TRXF11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, HGRU11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },
  // FIIs — Tijolo (Agro)
  XPCA11: { setor: 'Agro', segmento: 'Agro' }, KNCA11: { setor: 'Agro', segmento: 'Agro' },
  RZTR11: { setor: 'Agro', segmento: 'Agro' }, BTAL11: { setor: 'Agro', segmento: 'Agro' },
  RURA11: { setor: 'Agro', segmento: 'Agro' }, TGAR11: { setor: 'Agro', segmento: 'Agro' },
  // FIIs — Papel (CRI/Recebíveis)
  KNCR11: { setor: 'Papel/CRI', segmento: 'Recebíveis' }, KNIP11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  MXRF11: { setor: 'Papel/CRI', segmento: 'Recebíveis' }, IRDM11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  RECR11: { setor: 'Papel/CRI', segmento: 'Recebíveis' }, RBRR11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  VGIR11: { setor: 'Papel/CRI', segmento: 'Recebíveis' }, CPTS11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  VRTA11: { setor: 'Papel/CRI', segmento: 'Recebíveis' }, HABT11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  DEVA11: { setor: 'Papel/CRI', segmento: 'Recebíveis' }, AFHI11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  SNCI11: { setor: 'Papel/CRI', segmento: 'Recebíveis' },
  // FIIs — Híbrido (Fundo de Fundos)
  RBRF11: { setor: 'Fundo de Fundos', segmento: 'FoF' }, BCFF11: { setor: 'Fundo de Fundos', segmento: 'FoF' },
  HFOF11: { setor: 'Fundo de Fundos', segmento: 'FoF' }, MGFF11: { setor: 'Fundo de Fundos', segmento: 'FoF' },
  // ETFs — Renda Variavel Brasil
  BOVA11: { setor: 'RV Brasil', segmento: 'Ibovespa' },
  BOVV11: { setor: 'RV Brasil', segmento: 'Ibovespa' },
  SMAL11: { setor: 'Small Caps', segmento: 'Small Caps' },
  DIVO11: { setor: 'Dividendos', segmento: 'Dividendos' },
  // ETFs — Internacional
  IVVB11: { setor: 'Internacional', segmento: 'S&P 500' },
  NASD11: { setor: 'Internacional', segmento: 'Nasdaq' },
  EURP11: { setor: 'Internacional', segmento: 'Europa' },
  XINA11: { setor: 'Internacional', segmento: 'China' },
  ACWI11: { setor: 'Internacional', segmento: 'Global' },
  // ETFs — Cripto
  HASH11: { setor: 'Cripto', segmento: 'Cripto' },
  ETHE11: { setor: 'Cripto', segmento: 'Cripto' },
  QBTC11: { setor: 'Cripto', segmento: 'Cripto' },
  // ETFs — RF
  IMAB11: { setor: 'RF ETF', segmento: 'IMA-B' },
  IRFM11: { setor: 'RF ETF', segmento: 'IRF-M' },
  B5P211: { setor: 'RF ETF', segmento: 'IMA-B 5+' },
  // ETFs — Setorial
  FIND11: { setor: 'Setorial', segmento: 'Financeiro' },
  MATB11: { setor: 'Setorial', segmento: 'Materiais' },
};

var RF_SECTOR_MAP = {
  cdb: 'CDB', lci_lca: 'LCI/LCA',
  tesouro_selic: 'Tesouro Selic', tesouro_ipca: 'Tesouro IPCA+',
  tesouro_pre: 'Tesouro Pre', debenture: 'Debenture',
};

// FII: map detailed sectors to broad rebal categories
var FII_REBAL_MAP = {
  'Logística': 'Tijolo', 'Lajes Corp.': 'Tijolo', 'Shopping': 'Tijolo',
  'Agro': 'Tijolo', 'Renda Urbana': 'Tijolo',
  'Papel/CRI': 'Papel',
  'Fundo de Fundos': 'Híbrido',
};
var FII_SECTORS_SET = { 'Logística': 1, 'Lajes Corp.': 1, 'Shopping': 1, 'Papel/CRI': 1, 'Agro': 1, 'Renda Urbana': 1, 'Fundo de Fundos': 1 };
var ETF_SECTORS_SET = { 'RV Brasil': 1, 'Small Caps': 1, 'Dividendos': 1, 'Internacional': 1, 'Cripto': 1, 'RF ETF': 1, 'Setorial': 1 };

// Market Cap classification (BRL thresholds)
var CAP_THRESHOLDS = [
  { key: 'Large Cap', min: 40000000000 },
  { key: 'Mid Cap', min: 10000000000 },
  { key: 'Small Cap', min: 2000000000 },
  { key: 'Micro Cap', min: 0 },
];
var CAP_COLORS = {
  'Large Cap': '#3B82F6', 'Mid Cap': '#10B981',
  'Small Cap': '#F59E0B', 'Micro Cap': '#EF4444',
  'Sem Info': '#6B7280',
};
var CAP_ORDER = ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap', 'Sem Info'];

function classifyMarketCap(marketCap) {
  if (!marketCap || marketCap <= 0) return 'Sem Info';
  for (var i = 0; i < CAP_THRESHOLDS.length; i++) {
    if (marketCap >= CAP_THRESHOLDS[i].min) return CAP_THRESHOLDS[i].key;
  }
  return 'Micro Cap';
}

function classifyTicker(ticker, positions, fallbackClass) {
  var t = ticker.toUpperCase().trim();
  var info = TICKER_SECTORS[t];
  if (info) {
    if (FII_SECTORS_SET[info.setor]) return { classe: 'fii', setor: FII_REBAL_MAP[info.setor] || 'Outros FII' };
    if (ETF_SECTORS_SET[info.setor]) return { classe: 'etf', setor: '' };
    return { classe: 'acao', setor: info.setor };
  }
  // Check user positions for categoria
  if (positions) {
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].ticker && positions[i].ticker.toUpperCase().trim() === t) {
        var cat = positions[i].categoria || 'acao';
        if (cat === 'fii') return { classe: 'fii', setor: 'Outros FII' };
        if (cat === 'etf') return { classe: 'etf', setor: '' };
        return { classe: 'acao', setor: 'Sem Setor' };
      }
    }
  }
  // Use expanded class as fallback (user adding ticker under that class)
  if (fallbackClass === 'fii') return { classe: 'fii', setor: 'Outros FII' };
  if (fallbackClass === 'etf') return { classe: 'etf', setor: '' };
  if (fallbackClass === 'rf') return { classe: 'rf', setor: '' };
  return { classe: 'acao', setor: 'Sem Setor' };
}

// ── Dynamic sector enrichment via brapi ──
var _brapiSectorsFetched = {};

function mapBrapiSector(sector, industry) {
  // Refine by industry first (more specific)
  if (industry) {
    if (industry.indexOf('Steel') >= 0) return { setor: 'Siderurgia', segmento: 'Siderurgia' };
    if (industry.indexOf('Mining') >= 0 || industry.indexOf('Gold') >= 0) return { setor: 'Mineração', segmento: 'Mineração' };
    if (industry.indexOf('Oil') >= 0 || industry.indexOf('Gas') >= 0) return { setor: 'Petróleo', segmento: 'Petróleo' };
    if (industry.indexOf('Pulp') >= 0 || industry.indexOf('Paper') >= 0 || industry.indexOf('Lumber') >= 0) return { setor: 'Papel/Celulose', segmento: 'Celulose' };
    if (industry.indexOf('Airlines') >= 0 || industry.indexOf('Airport') >= 0) return { setor: 'Transporte', segmento: 'Aéreo' };
    if (industry.indexOf('Railroads') >= 0 || industry.indexOf('Trucking') >= 0) return { setor: 'Transporte', segmento: 'Ferroviário' };
    if (industry.indexOf('Marine') >= 0 || industry.indexOf('Shipping') >= 0) return { setor: 'Transporte', segmento: 'Portos' };
    if (industry.indexOf('Electric') >= 0 || industry.indexOf('Utilities') >= 0 || industry.indexOf('Renewable') >= 0 || industry.indexOf('Solar') >= 0) return { setor: 'Energia', segmento: 'Energia' };
    if (industry.indexOf('Water') >= 0) return { setor: 'Saneamento', segmento: 'Saneamento' };
    if (industry.indexOf('Bank') >= 0) return { setor: 'Financeiro', segmento: 'Bancos' };
    if (industry.indexOf('Insurance') >= 0) return { setor: 'Financeiro', segmento: 'Seguros' };
    if (industry.indexOf('Capital Markets') >= 0 || industry.indexOf('Financial Data') >= 0) return { setor: 'Financeiro', segmento: 'Investimentos' };
    if (industry.indexOf('Pharmaceutical') >= 0 || industry.indexOf('Drug') >= 0) return { setor: 'Saúde', segmento: 'Farmacêutica' };
    if (industry.indexOf('Medical') >= 0 || industry.indexOf('Health') >= 0) return { setor: 'Saúde', segmento: 'Saúde' };
    if (industry.indexOf('Residential Construction') >= 0 || industry.indexOf('Real Estate') >= 0) return { setor: 'Construção', segmento: 'Incorporação' };
    if (industry.indexOf('Packaged Foods') >= 0 || industry.indexOf('Farm') >= 0 || industry.indexOf('Beverages') >= 0) return { setor: 'Consumo', segmento: 'Alimentos' };
    if (industry.indexOf('Meat') >= 0) return { setor: 'Consumo', segmento: 'Frigoríficos' };
    if (industry.indexOf('Tobacco') >= 0 || industry.indexOf('Household') >= 0 || industry.indexOf('Personal') >= 0) return { setor: 'Consumo', segmento: 'Consumo' };
    if (industry.indexOf('Apparel') >= 0 || industry.indexOf('Luxury') >= 0 || industry.indexOf('Footwear') >= 0) return { setor: 'Varejo', segmento: 'Moda' };
    if (industry.indexOf('Grocery') >= 0 || industry.indexOf('Discount') >= 0 || industry.indexOf('Department') >= 0) return { setor: 'Varejo', segmento: 'Supermercados' };
    if (industry.indexOf('Retail') >= 0 || industry.indexOf('Specialty') >= 0) return { setor: 'Varejo', segmento: 'Varejo' };
    if (industry.indexOf('Rental') >= 0 || industry.indexOf('Leasing') >= 0) return { setor: 'Varejo', segmento: 'Locação' };
    if (industry.indexOf('Telecom') >= 0) return { setor: 'Telecom', segmento: 'Telecom' };
    if (industry.indexOf('Software') >= 0 || industry.indexOf('Internet') >= 0 || industry.indexOf('Electronic') >= 0) return { setor: 'Tecnologia', segmento: 'Tecnologia' };
  }
  // Fallback by sector
  var SECTOR_MAP = {
    'Financial Services': { setor: 'Financeiro', segmento: 'Financeiro' },
    'Energy': { setor: 'Petróleo', segmento: 'Petróleo' },
    'Basic Materials': { setor: 'Mineração', segmento: 'Materiais' },
    'Consumer Cyclical': { setor: 'Varejo', segmento: 'Varejo' },
    'Consumer Defensive': { setor: 'Consumo', segmento: 'Consumo' },
    'Healthcare': { setor: 'Saúde', segmento: 'Saúde' },
    'Technology': { setor: 'Tecnologia', segmento: 'Tecnologia' },
    'Communication Services': { setor: 'Telecom', segmento: 'Telecom' },
    'Utilities': { setor: 'Energia', segmento: 'Energia' },
    'Industrials': { setor: 'Indústria', segmento: 'Indústria' },
    'Real Estate': { setor: 'Construção', segmento: 'Construção' },
  };
  return SECTOR_MAP[sector] || null;
}

async function enrichTickerSectors(tickers) {
  var unknown = [];
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i].toUpperCase().trim();
    if (!TICKER_SECTORS[t] && !_brapiSectorsFetched[t]) {
      unknown.push(t);
      _brapiSectorsFetched[t] = true;
    }
  }
  if (unknown.length === 0) return;
  try {
    var profiles = await fetchTickerProfile(unknown);
    var keys = Object.keys(profiles);
    for (var k = 0; k < keys.length; k++) {
      var sym = keys[k];
      var p = profiles[sym];
      if (!p) continue;
      var mapped = mapBrapiSector(p.sector, p.industry);
      if (mapped) {
        TICKER_SECTORS[sym] = mapped;
      }
    }
  } catch (e) {
    console.warn('enrichTickerSectors error:', e);
  }
}

var SANKEY_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  '#84CC16', '#A855F7', '#FB923C', '#22D3EE', '#E879F9',
  '#2DD4BF', '#FACC15', '#F87171', '#818CF8', '#34D399',
];

function getSankeyColor(idx) {
  return SANKEY_PALETTE[idx % SANKEY_PALETTE.length];
}

var SANKEY_FILTERS = [
  { k: 'setor', l: 'Por Setor' },
  { k: 'segmento', l: 'Por Segmento' },
  { k: 'ativo', l: 'Por Ativo' },
];

var PERF_SUBS = [
  { k: 'todos', l: 'Todos' },
  { k: 'acao', l: 'Ação' },
  { k: 'fii', l: 'FII' },
  { k: 'etf', l: 'ETF' },
  { k: 'opcoes', l: 'Opções' },
  { k: 'rf', l: 'RF' },
];

var PERF_SUB_COLORS = {
  todos: C.accent, acao: C.acoes, fii: C.fiis, etf: C.etfs, opcoes: C.opcoes, rf: C.rf,
};

var OPC_STATUS_LABELS = { ativa: 'Ativa', exercida: 'Exercida', expirada: 'Expirada', fechada: 'Fechada', expirou_po: 'Virou Pó' };
var OPC_STATUS_COLORS = { ativa: C.accent, exercida: C.green, expirada: C.dim, fechada: C.yellow, expirou_po: C.green };

var RF_TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pre', debenture: 'Debenture',
};

var RF_IDX_LABELS = { prefixado: 'Prefixado', cdi: 'CDI', ipca: 'IPCA+', selic: 'Selic' };
var RF_IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.rf };

var RF_ISENTOS = { lci_lca: true, debenture: true };

var PROV_SUBS = [
  { k: 'visao', l: 'Visão Geral' },
  { k: 'proventos', l: 'Proventos' },
  { k: 'rendimentos', l: 'Rendimentos' },
  { k: 'premios', l: 'Prêmios' },
  { k: 'rf', l: 'Renda Fixa' },
];

// ═══════════ HELPERS ═══════════

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtC(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function maskCurrency(text) {
  var digits = text.replace(/\D/g, '');
  if (digits.length === 0) return '';
  // Remove leading zeros
  digits = digits.replace(/^0+/, '') || '';
  if (digits.length === 0) return '0';
  // Insert dots as thousands separators
  var result = '';
  var len = digits.length;
  for (var i = 0; i < len; i++) {
    if (i > 0 && (len - i) % 3 === 0) result = result + '.';
    result = result + digits[i];
  }
  return result;
}

function parseCurrency(text) {
  var digits = text.replace(/\D/g, '');
  return parseInt(digits) || 0;
}

function rfIRAliquota(diasCorridos) {
  if (diasCorridos <= 180) return 0.225;
  if (diasCorridos <= 360) return 0.20;
  if (diasCorridos <= 720) return 0.175;
  return 0.15;
}

function rfIRFaixa(diasCorridos) {
  if (diasCorridos <= 180) return '22,5%';
  if (diasCorridos <= 360) return '20%';
  if (diasCorridos <= 720) return '17,5%';
  return '15%';
}

function rfCDIEquivalente(taxaIsenta, aliquotaIR) {
  if (aliquotaIR >= 1) return taxaIsenta;
  return taxaIsenta / (1 - aliquotaIR);
}

function rfValorAtualEstimado(valorAplicado, taxa, indexador, dataAplicacao, selicAnual) {
  var hoje = new Date();
  var inicio = new Date(dataAplicacao);
  var diasCorridos = Math.max(Math.ceil((hoje - inicio) / (1000 * 60 * 60 * 24)), 0);
  var anos = diasCorridos / 365;
  if (anos <= 0) return valorAplicado;

  if (indexador === 'prefixado') {
    return valorAplicado * Math.pow(1 + taxa / 100, anos);
  } else if (indexador === 'cdi') {
    var cdiAnual = (selicAnual || 13.25) - 0.10;
    var taxaEfetiva = cdiAnual * (taxa / 100);
    return valorAplicado * Math.pow(1 + taxaEfetiva / 100, anos);
  } else if (indexador === 'selic') {
    var selicEfetiva = (selicAnual || 13.25) + (taxa || 0) / 100;
    return valorAplicado * Math.pow(1 + selicEfetiva / 100, anos);
  } else if (indexador === 'ipca') {
    var ipcaEstimado = 4.5;
    var taxaTotal = ipcaEstimado + (taxa || 0);
    return valorAplicado * Math.pow(1 + taxaTotal / 100, anos);
  }
  return valorAplicado * Math.pow(1 + (taxa || 0) / 100, anos);
}

function bizDaysBetween(d1, d2) {
  var count = 0;
  var d = new Date(d1);
  d.setDate(d.getDate() + 1);
  while (d <= d2) {
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function computeMonthlyReturns(history) {
  if (!history || history.length < 2) return [];
  var months = {};
  history.forEach(function(pt) {
    if (!pt || !pt.date) return;
    var key = pt.date.substring(0, 7);
    if (!months[key]) months[key] = { first: pt.value, last: pt.value };
    months[key].last = pt.value;
  });
  var keys = Object.keys(months).sort();
  var returns = [];
  for (var i = 1; i < keys.length; i++) {
    var prev = months[keys[i - 1]].last;
    var curr = months[keys[i]].last;
    var ret = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    returns.push({ month: keys[i], pct: ret });
  }
  return returns;
}

function computeWeeklyReturns(history) {
  if (!history || history.length < 2) return [];
  // Group by ISO week (YYYY-WNN)
  var weeks = {};
  for (var i = 0; i < history.length; i++) {
    var pt = history[i];
    if (!pt || !pt.date) continue;
    var d = new Date(pt.date + 'T12:00:00');
    var jan1 = new Date(d.getFullYear(), 0, 1);
    var dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
    var weekNum = Math.ceil(dayOfYear / 7);
    var key = d.getFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
    if (!weeks[key]) weeks[key] = { first: pt.value, last: pt.value, lastDate: pt.date };
    weeks[key].last = pt.value;
    weeks[key].lastDate = pt.date;
  }
  var keys = Object.keys(weeks).sort();
  var returns = [];
  for (var j = 1; j < keys.length; j++) {
    var prev = weeks[keys[j - 1]].last;
    var curr = weeks[keys[j]].last;
    var ret = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    returns.push({ week: keys[j], date: weeks[keys[j]].lastDate, pct: ret });
  }
  return returns;
}

function addProvToCorretora(map, corretora, prov, qty, valor, isPago) {
  if (!map[corretora]) map[corretora] = { items: [], totalPago: 0, totalPendente: 0 };
  map[corretora].items.push({
    ticker: prov.ticker,
    tipo: prov.tipo_provento,
    dataPagamento: prov.data_pagamento,
    valorPorCota: prov.valor_por_cota,
    quantidade: qty,
    valorTotal: valor || 0,
    isPago: isPago,
  });
  if (isPago) map[corretora].totalPago += (valor || 0);
  else map[corretora].totalPendente += (valor || 0);
}

function computeCDIAccumulated(history, selicAnual) {
  if (!history || history.length < 2) return [];
  var cdiAnual = (selicAnual || 13.25) - 0.10;
  var dailyRate = Math.pow(1 + cdiAnual / 100, 1 / 252) - 1;
  var result = [{ date: history[0].date, value: 0 }];
  var accum = 0;
  for (var i = 1; i < history.length; i++) {
    var prev = new Date(history[i - 1].date + 'T12:00:00');
    var curr = new Date(history[i].date + 'T12:00:00');
    var bizDays = 0;
    var d = new Date(prev);
    d.setDate(d.getDate() + 1);
    while (d <= curr) {
      var dow = d.getDay();
      if (dow !== 0 && dow !== 6) bizDays++;
      d.setDate(d.getDate() + 1);
    }
    accum = (1 + accum / 100) * Math.pow(1 + dailyRate, bizDays) - 1;
    accum = accum * 100;
    result.push({ date: history[i].date, value: accum });
  }
  return result;
}

// ═══════════ IR COMPUTATION ═══════════

function computeIR(ops) {
  var sorted = (ops || []).slice().sort(function(a, b) {
    return (a.data || '').localeCompare(b.data || '');
  });

  var pmMap = {};
  var monthResults = {};

  sorted.forEach(function(op) {
    var ticker = op.ticker;
    var cat = op.categoria || 'acao';

    if (!pmMap[ticker]) {
      pmMap[ticker] = { qty: 0, custoTotal: 0, categoria: cat };
    }
    var pos = pmMap[ticker];

    if (op.tipo === 'compra') {
      var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      pos.custoTotal += op.quantidade * op.preco + custos;
      pos.qty += op.quantidade;
    } else if (op.tipo === 'venda') {
      var pm = pos.qty > 0 ? pos.custoTotal / pos.qty : 0;
      var vendaTotal = op.quantidade * op.preco;
      var custoVenda = op.quantidade * pm;
      var ganho = vendaTotal - custoVenda;

      pos.custoTotal -= custoVenda;
      pos.qty -= op.quantidade;
      if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }

      var mKey = (op.data || '').substring(0, 7);
      if (!mKey) return;
      if (!monthResults[mKey]) {
        monthResults[mKey] = {
          vendasAcoes: 0, ganhoAcoes: 0, perdaAcoes: 0,
          vendasFII: 0, ganhoFII: 0, perdaFII: 0,
          vendasETF: 0, ganhoETF: 0, perdaETF: 0,
        };
      }
      var mr = monthResults[mKey];

      if (cat === 'fii') {
        mr.vendasFII += vendaTotal;
        if (ganho >= 0) mr.ganhoFII += ganho; else mr.perdaFII += Math.abs(ganho);
      } else if (cat === 'etf') {
        mr.vendasETF += vendaTotal;
        if (ganho >= 0) mr.ganhoETF += ganho; else mr.perdaETF += Math.abs(ganho);
      } else {
        mr.vendasAcoes += vendaTotal;
        if (ganho >= 0) mr.ganhoAcoes += ganho; else mr.perdaAcoes += Math.abs(ganho);
      }
    }
  });

  return monthResults;
}

function computeCatPLByMonth(ops, categoria) {
  var sorted = (ops || []).slice().sort(function(a, b) {
    return (a.data || '').localeCompare(b.data || '');
  });
  var pmMap = {};
  var monthResults = {};

  for (var i = 0; i < sorted.length; i++) {
    var op = sorted[i];
    var cat = op.categoria || 'acao';
    if (cat !== categoria) continue;
    var ticker = (op.ticker || '').toUpperCase().trim();
    if (!ticker) continue;

    if (!pmMap[ticker]) pmMap[ticker] = { qty: 0, custoTotal: 0 };
    var pos = pmMap[ticker];

    if (op.tipo === 'compra') {
      var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      pos.custoTotal += op.quantidade * op.preco + custos;
      pos.qty += op.quantidade;
    } else if (op.tipo === 'venda') {
      var pm = pos.qty > 0 ? pos.custoTotal / pos.qty : 0;
      var vendaTotal = op.quantidade * op.preco;
      var custoVenda = op.quantidade * pm;
      var ganho = vendaTotal - custoVenda;

      pos.custoTotal -= custoVenda;
      pos.qty -= op.quantidade;
      if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }

      var mKey = (op.data || '').substring(0, 7);
      if (!mKey) continue;
      if (!monthResults[mKey]) monthResults[mKey] = { pl: 0, count: 0, tickers: {} };
      monthResults[mKey].pl += ganho;
      monthResults[mKey].count += 1;
      if (!monthResults[mKey].tickers[ticker]) monthResults[mKey].tickers[ticker] = 0;
      monthResults[mKey].tickers[ticker] += ganho;
    }
  }
  return monthResults;
}

function computeTaxByMonth(monthResults) {
  var months = Object.keys(monthResults).sort();
  var prejAcumAcoes = 0;
  var prejAcumFII = 0;
  var prejAcumETF = 0;
  var results = [];

  months.forEach(function(mKey) {
    var mr = monthResults[mKey];
    var saldoAcoes = mr.ganhoAcoes - mr.perdaAcoes - prejAcumAcoes;
    var saldoFII = mr.ganhoFII - mr.perdaFII - prejAcumFII;
    var saldoETF = mr.ganhoETF - mr.perdaETF - prejAcumETF;

    var impostoAcoes = 0;
    if (mr.vendasAcoes > 20000 && saldoAcoes > 0) {
      impostoAcoes = saldoAcoes * 0.15;
      prejAcumAcoes = 0;
    } else if (saldoAcoes < 0) {
      prejAcumAcoes = Math.abs(saldoAcoes);
    } else {
      prejAcumAcoes = 0;
    }

    var impostoFII = 0;
    if (saldoFII > 0) {
      impostoFII = saldoFII * 0.20;
      prejAcumFII = 0;
    } else if (saldoFII < 0) {
      prejAcumFII = Math.abs(saldoFII);
    } else {
      prejAcumFII = 0;
    }

    var impostoETF = 0;
    if (saldoETF > 0) {
      impostoETF = saldoETF * 0.15;
      prejAcumETF = 0;
    } else if (saldoETF < 0) {
      prejAcumETF = Math.abs(saldoETF);
    } else {
      prejAcumETF = 0;
    }

    results.push({
      month: mKey,
      vendasAcoes: mr.vendasAcoes, vendasFII: mr.vendasFII, vendasETF: mr.vendasETF,
      ganhoAcoes: mr.ganhoAcoes, perdaAcoes: mr.perdaAcoes,
      ganhoFII: mr.ganhoFII, perdaFII: mr.perdaFII,
      ganhoETF: mr.ganhoETF, perdaETF: mr.perdaETF,
      saldoAcoes: saldoAcoes, saldoFII: saldoFII, saldoETF: saldoETF,
      impostoAcoes: impostoAcoes, impostoFII: impostoFII, impostoETF: impostoETF,
      impostoTotal: impostoAcoes + impostoFII + impostoETF,
      alertaAcoes20k: mr.vendasAcoes > 20000,
      prejAcumAcoes: prejAcumAcoes, prejAcumFII: prejAcumFII, prejAcumETF: prejAcumETF,
    });
  });

  return results;
}

// ═══════════ INLINE SVG: Benchmark Chart ═══════════

function BenchmarkChart(props) {
  var portData = props.portData || [];
  var cdiData = props.cdiData || [];
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var h = 120;
  var pad = { top: 16, right: 8, bottom: 20, left: 36 };

  if (portData.length < 2 || w === 0) {
    return (
      <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}
        style={{ height: h }} />
    );
  }

  var allVals = portData.map(function(d) { return d.value; })
    .concat(cdiData.map(function(d) { return d.value; }));
  var minV = Math.min.apply(null, allVals);
  var maxV = Math.max.apply(null, allVals);
  if (maxV === minV) { maxV = minV + 1; }

  var chartW = w - pad.left - pad.right;
  var chartH = h - pad.top - pad.bottom;

  function toX(i, len) { return pad.left + (i / Math.max(len - 1, 1)) * chartW; }
  function toY(v) { return pad.top + (1 - (v - minV) / (maxV - minV)) * chartH; }

  function buildLine(data) {
    if (data.length < 2) return '';
    var d = 'M ' + toX(0, data.length) + ' ' + toY(data[0].value);
    for (var i = 1; i < data.length; i++) {
      var px = toX(i - 1, data.length); var py = toY(data[i - 1].value);
      var cx = toX(i, data.length); var cy = toY(data[i].value);
      var mx = (px + cx) / 2;
      d += ' C ' + mx + ' ' + py + ', ' + mx + ' ' + cy + ', ' + cx + ' ' + cy;
    }
    return d;
  }

  var gridLines = [];
  var steps = 3;
  for (var gi = 0; gi <= steps; gi++) {
    var gv = minV + (maxV - minV) * (gi / steps);
    var gy = toY(gv);
    gridLines.push({ y: gy, label: gv.toFixed(1) + '%' });
  }

  var portLine = buildLine(portData);
  var cdiLine = buildLine(cdiData);
  var portFinal = portData.length > 0 ? portData[portData.length - 1].value : 0;
  var cdiFinal = cdiData.length > 0 ? cdiData[cdiData.length - 1].value : 0;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={h}>
        {gridLines.map(function(gl, i) {
          return (
            <G key={'g' + i}>
              <SvgLine x1={pad.left} y1={gl.y} x2={w - pad.right} y2={gl.y}
                stroke={C.border} strokeWidth={1} />
              <SvgText x={pad.left - 4} y={gl.y + 3} fill={C.dim}
                fontSize={8} fontFamily={F.mono} textAnchor="end">{gl.label}</SvgText>
            </G>
          );
        })}
        {portLine ? <Path d={portLine} fill="none" stroke={C.accent} strokeWidth={2} /> : null}
        {cdiLine ? <Path d={cdiLine} fill="none" stroke={C.etfs} strokeWidth={1.5}
          strokeDasharray="4,3" /> : null}
      </Svg>
      <View style={styles.benchLegend}>
        <View style={styles.benchLegendItem}>
          <View style={[styles.benchLegendDot, { backgroundColor: C.accent }]} />
          <Text style={styles.benchLegendLabel}>Carteira</Text>
          <Text style={[styles.benchLegendValue, { color: portFinal >= 0 ? C.green : C.red }]}>
            {portFinal >= 0 ? '+' : ''}{portFinal.toFixed(2)}%
          </Text>
        </View>
        <View style={styles.benchLegendItem}>
          <View style={[styles.benchLegendDot, { backgroundColor: C.etfs }]} />
          <Text style={styles.benchLegendLabel}>CDI</Text>
          <Text style={[styles.benchLegendValue, { color: C.etfs }]}>
            +{cdiFinal.toFixed(2)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════ HBAR ═══════════

function HBar(props) {
  var label = props.label;
  var value = props.value;
  var maxValue = props.maxValue || 100;
  var color = props.color || C.accent;
  var suffix = props.suffix || '%';
  var isNeg = value < 0;
  var barPct = clamp(Math.abs(value) / Math.abs(maxValue) * 100, 2, 100);

  return (
    <View style={styles.hbarRow}>
      <Text style={styles.hbarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, {
          width: barPct + '%',
          backgroundColor: color + (isNeg ? '60' : '40'),
          borderColor: color + '80',
        }]} />
      </View>
      <Text style={[styles.hbarValue, { color: isNeg ? C.red : color }]}>
        {isNeg ? '' : '+'}{value.toFixed(1)}{suffix}
      </Text>
    </View>
  );
}

// ═══════════ DONUT CHART ═══════════

function DonutChart(props) {
  var segments = props.segments || [];
  var s = props.size || 110;
  var strokeW = 10;
  var r = (s / 2) - strokeW;
  var circ = 2 * Math.PI * r;
  var offset = 0;

  return (
    <Svg width={s} height={s} viewBox={'0 0 ' + s + ' ' + s}>
      <Circle cx={s / 2} cy={s / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.03)" strokeWidth={strokeW} />
      {segments.map(function (seg, i) {
        var dash = (seg.pct / 100) * circ;
        var gap = circ - dash;
        var o = offset;
        offset += dash;
        return (
          <Circle key={i} cx={s / 2} cy={s / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeW}
            strokeDasharray={dash + ' ' + gap}
            strokeDashoffset={-o}
            strokeLinecap="round"
            rotation={-90} origin={s / 2 + ',' + s / 2} />
        );
      })}
    </Svg>
  );
}

// ═══════════ SQUARIFIED TREEMAP ═══════════

function squarify(items, x, y, w, h) {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ x: x, y: y, w: w, h: h, item: items[0] }];
  }

  var total = items.reduce(function (s, it) { return s + it.normWeight; }, 0);
  if (total <= 0) return [];

  var sorted = items.slice().sort(function (a, b) { return b.normWeight - a.normWeight; });

  // decide split direction: horizontal or vertical
  var isHoriz = w >= h;
  var mainSize = isHoriz ? w : h;
  var crossSize = isHoriz ? h : w;

  // find best row split
  var bestRatio = Infinity;
  var bestSplit = 1;

  for (var i = 1; i <= sorted.length; i++) {
    var rowSum = 0;
    for (var j = 0; j < i; j++) rowSum += sorted[j].normWeight;
    var rowFrac = rowSum / total;
    var rowPixels = rowFrac * mainSize;
    if (rowPixels <= 0) continue;

    var worstRatio = 0;
    for (var k = 0; k < i; k++) {
      var itemFrac = sorted[k].normWeight / rowSum;
      var itemCross = itemFrac * crossSize;
      var ratio = Math.max(rowPixels / itemCross, itemCross / rowPixels);
      if (ratio > worstRatio) worstRatio = ratio;
    }
    if (worstRatio <= bestRatio) {
      bestRatio = worstRatio;
      bestSplit = i;
    } else {
      break;
    }
  }

  var rowItems = sorted.slice(0, bestSplit);
  var restItems = sorted.slice(bestSplit);

  var rowSum = 0;
  for (var ri = 0; ri < rowItems.length; ri++) rowSum += rowItems[ri].normWeight;
  var rowFrac = rowSum / total;
  var rowPixels = rowFrac * mainSize;

  var rects = [];
  var crossOffset = 0;
  for (var qi = 0; qi < rowItems.length; qi++) {
    var itemFrac = rowItems[qi].normWeight / rowSum;
    var itemCross = itemFrac * crossSize;
    if (isHoriz) {
      rects.push({ x: x, y: y + crossOffset, w: rowPixels, h: itemCross, item: rowItems[qi] });
    } else {
      rects.push({ x: x + crossOffset, y: y, w: itemCross, h: rowPixels, item: rowItems[qi] });
    }
    crossOffset += itemCross;
  }

  if (restItems.length > 0) {
    var restRects;
    if (isHoriz) {
      restRects = squarify(restItems, x + rowPixels, y, w - rowPixels, h);
    } else {
      restRects = squarify(restItems, x, y + rowPixels, w, h - rowPixels);
    }
    for (var rri = 0; rri < restRects.length; rri++) rects.push(restRects[rri]);
  }

  return rects;
}

// ═══════════ TREEMAP COMPONENT ═══════════

function TreemapChart(props) {
  var items = props.items || [];
  var _w = useState(0);
  var width = _w[0]; var setWidth = _w[1];
  var height = props.height || 140;
  var onPressTile = props.onPressTile;

  if (items.length === 0 || width === 0) {
    return <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }} style={{ height: height }} />;
  }

  var total = items.reduce(function (s, it) { return s + Math.abs(it.weight); }, 0);
  if (total === 0) return <View style={{ height: height }} />;

  var normalized = items.map(function (it) {
    var copy = {};
    Object.keys(it).forEach(function (k) { copy[k] = it[k]; });
    copy.normWeight = Math.abs(it.weight) / total;
    return copy;
  });

  var rects = squarify(normalized, 0, 0, width, height);

  return (
    <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }}>
      <Svg width={width} height={height}>
        {rects.map(function (r, i) {
          var changeDay = r.item.change_day || 0;
          var intensity = clamp(Math.abs(changeDay) / 5, 0.2, 0.7);
          var fill = changeDay >= 0 ? C.green : C.red;
          var showLabel = r.w > 40 && r.h > 30;
          var showPct = r.w > 30 && r.h > 20;
          return (
            <G key={i}>
              <SvgRect x={r.x + 1} y={r.y + 1} width={Math.max(r.w - 2, 1)} height={Math.max(r.h - 2, 1)}
                rx={4} fill={fill} opacity={intensity} />
              {showLabel ? (
                <G>
                  <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 - 6} fill="#fff" fontSize="10"
                    fontWeight="700" textAnchor="middle" opacity="0.95">
                    {r.item.ticker}
                  </SvgText>
                  <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + 8} fill={changeDay >= 0 ? '#4ade80' : '#fb7185'}
                    fontSize="9" fontWeight="600" textAnchor="middle">
                    {changeDay >= 0 ? '+' : ''}{changeDay.toFixed(1)}%
                  </SvgText>
                </G>
              ) : showPct ? (
                <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + 3} fill="#fff" fontSize="8"
                  fontWeight="600" textAnchor="middle" opacity="0.8">
                  {r.item.ticker}
                </SvgText>
              ) : null}
              {onPressTile ? (
                <SvgRect x={r.x} y={r.y} width={r.w} height={r.h}
                  fill="transparent" onPress={function () { onPressTile(r.item); }} />
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ═══════════ SANKEY CHART ═══════════

function buildCompData(positions, filter, alocGrouped, totalPatrimonio) {
  // Build grouped data: classes with sub-items based on filter
  var classMap = {};
  // Global merge map for sub-items across classes (prevents duplicate "Outros")
  var globalItemMap = {};

  positions.forEach(function (p) {
    var cat = p.categoria || 'acao';
    var val = p.quantidade * (p.preco_atual || p.pm);
    var catLabel = CAT_NAMES_FULL[cat] || cat;
    var color = PRODUCT_COLORS[cat] || C.accent;

    if (!classMap[catLabel]) classMap[catLabel] = { key: catLabel, value: 0, color: color };
    classMap[catLabel].value += val;

    var targetKey;
    var sector = TICKER_SECTORS[p.ticker.toUpperCase()];
    if (filter === 'ativo') {
      targetKey = p.ticker;
    } else if (filter === 'segmento') {
      targetKey = sector ? sector.segmento : 'Outros';
    } else {
      targetKey = sector ? sector.setor : 'Outros';
    }

    // Merge globally — one "Outros" for all classes
    if (!globalItemMap[targetKey]) globalItemMap[targetKey] = { key: targetKey, value: 0, classSplit: {} };
    globalItemMap[targetKey].value += val;
    if (!globalItemMap[targetKey].classSplit[catLabel]) globalItemMap[targetKey].classSplit[catLabel] = 0;
    globalItemMap[targetKey].classSplit[catLabel] += val;
  });

  // Add RF
  if (alocGrouped && alocGrouped.rf > 0) {
    classMap['RF'] = { key: 'RF', value: alocGrouped.rf, color: PRODUCT_COLORS.rf || C.rf };
    globalItemMap['Renda Fixa'] = { key: 'Renda Fixa', value: alocGrouped.rf, classSplit: { 'RF': alocGrouped.rf } };
  }

  var classes = Object.keys(classMap).map(function (k) { return classMap[k]; });
  classes.sort(function (a, b) { return b.value - a.value; });

  // Build flat items list sorted by value, with dominant class color
  var allItems = Object.keys(globalItemMap).map(function (k) { return globalItemMap[k]; });
  allItems.sort(function (a, b) { return b.value - a.value; });

  allItems.forEach(function (it, idx) {
    // Find dominant class for color
    var maxVal = 0;
    var mainClass = '';
    Object.keys(it.classSplit).forEach(function (ck) {
      if (it.classSplit[ck] > maxVal) { maxVal = it.classSplit[ck]; mainClass = ck; }
    });
    it.classKey = mainClass;
    it.classColor = C.accent;
    for (var ci = 0; ci < classes.length; ci++) {
      if (classes[ci].key === mainClass) { it.classColor = classes[ci].color; break; }
    }
    it.color = getSankeyColor(idx);
    it.pctTotal = totalPatrimonio > 0 ? (it.value / totalPatrimonio) * 100 : 0;
    // pctClass = % within dominant class
    var classVal = 0;
    for (var cj = 0; cj < classes.length; cj++) {
      if (classes[cj].key === mainClass) { classVal = classes[cj].value; break; }
    }
    it.pctClass = classVal > 0 ? (it.value / classVal) * 100 : 0;
  });

  return { classes: classes, items: allItems, total: totalPatrimonio };
}

// ═══════════ TWO-LEVEL DONUT (TradeMap style) ═══════════

function TwoLevelDonut(props) {
  var classes = props.classes || [];
  var items = props.items || [];
  var total = props.total || 0;
  var onTap = props.onTap;
  var selected = props.selected;
  var filterLabel = props.filterLabel || 'Detalhe';
  var s = 240;
  var cx = s / 2;
  var cy = s / 2;

  // Inner ring (classes)
  var innerR = 52;
  var innerStroke = 14;
  var innerCirc = 2 * Math.PI * innerR;
  var innerMin = innerR - innerStroke / 2 - 4;
  var innerMax = innerR + innerStroke / 2 + 4;

  // Outer ring (sub-items)
  var outerR = 78;
  var outerStroke = 24;
  var outerCirc = 2 * Math.PI * outerR;
  var outerMin = outerR - outerStroke / 2 - 4;
  var outerMax = outerR + outerStroke / 2 + 4;

  var activeClass = selected && selected.side === 'outer' ? selected.classLabel : null;

  // Build inner arcs with angle ranges
  var innerOffset = 0;
  var innerArcs = [];
  classes.forEach(function (cls) {
    var pct = total > 0 ? cls.value / total : 0;
    var dash = pct * innerCirc;
    var gap = innerCirc - dash;
    var isActive = selected && selected.side === 'inner' && selected.label === cls.key;
    var isDimmed = activeClass && activeClass !== cls.key;
    var startFrac = innerOffset / innerCirc;
    innerArcs.push({
      key: cls.key, color: cls.color, value: cls.value, pct: pct * 100,
      dasharray: dash + ' ' + gap, dashoffset: -innerOffset,
      opacity: isDimmed ? 0.25 : isActive ? 1 : 0.75,
      strokeW: isActive ? innerStroke + 5 : innerStroke,
      startFrac: startFrac, endFrac: startFrac + pct,
    });
    innerOffset += dash;
  });

  // Build outer arcs with angle ranges
  var outerOffset = 0;
  var outerArcs = [];
  items.forEach(function (it) {
    var pct = total > 0 ? it.value / total : 0;
    var dash = pct * outerCirc;
    var gap = outerCirc - dash;
    var isSelected = selected && selected.label === it.key && selected.side === 'outer';
    var isDimmedClass = activeClass && activeClass !== it.classKey;
    var startFrac = outerOffset / outerCirc;
    outerArcs.push({
      key: it.key, color: it.color, classColor: it.classColor, value: it.value,
      pct: pct * 100, classKey: it.classKey, pctClass: it.pctClass,
      dasharray: dash + ' ' + gap, dashoffset: -outerOffset,
      opacity: isSelected ? 1 : isDimmedClass ? 0.18 : 0.7,
      strokeW: isSelected ? outerStroke + 6 : outerStroke,
      startFrac: startFrac, endFrac: startFrac + pct,
    });
    outerOffset += dash;
  });

  // Touch handler — compute angle + distance from center
  function handleTouch(evt) {
    var lx = evt.nativeEvent.locationX;
    var ly = evt.nativeEvent.locationY;
    var dx = lx - cx;
    var dy = ly - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);

    // Angle from top (12 o'clock), clockwise, 0..1
    var angle = Math.atan2(dx, -dy); // 0 at top, positive clockwise
    if (angle < 0) angle += 2 * Math.PI;
    var frac = angle / (2 * Math.PI);

    // Check outer ring first (priority)
    if (dist >= outerMin && dist <= outerMax) {
      for (var oi = 0; oi < outerArcs.length; oi++) {
        var oa = outerArcs[oi];
        if (frac >= oa.startFrac && frac < oa.endFrac) {
          if (onTap) onTap({
            label: oa.key, value: oa.value, pctTotal: oa.pct,
            pctClass: oa.pctClass, classLabel: oa.classKey,
            color: oa.color, side: 'outer' });
          return;
        }
      }
    }

    // Check inner ring
    if (dist >= innerMin && dist <= innerMax) {
      for (var ii = 0; ii < innerArcs.length; ii++) {
        var ia = innerArcs[ii];
        if (frac >= ia.startFrac && frac < ia.endFrac) {
          if (onTap) onTap({
            label: ia.key, value: ia.value, pctTotal: ia.pct,
            color: ia.color, side: 'inner' });
          return;
        }
      }
    }

    // Tap on center or outside — deselect
    if (onTap) onTap(null);
  }

  // Center content
  var centerLabel = 'TOTAL';
  var centerValue = 'R$ ' + (total >= 1000 ? (total / 1000).toFixed(1) + 'k' : fmt(total));
  var centerPct = '';
  var centerColor = C.text;
  if (selected) {
    centerLabel = selected.label.length > 12 ? selected.label.substring(0, 11) + '..' : selected.label;
    centerValue = 'R$ ' + fmt(selected.value);
    centerPct = selected.pctTotal.toFixed(1) + '%';
    centerColor = selected.color;
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: s, height: s }}
        onStartShouldSetResponder={function () { return true; }}
        onResponderRelease={handleTouch}>
        <Svg width={s} height={s} style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Outer ring — sub-items */}
          {outerArcs.map(function (arc, i) {
            return (
              <Circle key={'o' + i} cx={cx} cy={cy} r={outerR} fill="none"
                stroke={arc.color} strokeWidth={arc.strokeW} opacity={arc.opacity}
                strokeDasharray={arc.dasharray} strokeDashoffset={arc.dashoffset}
                rotation={-90} origin={cx + ',' + cy} />
            );
          })}
          {/* Inner ring — classes */}
          {innerArcs.map(function (arc, i) {
            return (
              <Circle key={'i' + i} cx={cx} cy={cy} r={innerR} fill="none"
                stroke={arc.color} strokeWidth={arc.strokeW} opacity={arc.opacity}
                strokeDasharray={arc.dasharray} strokeDashoffset={arc.dashoffset}
                rotation={-90} origin={cx + ',' + cy} />
            );
          })}
          {/* Center text */}
          {centerPct ? (
            <G>
              <SvgText x={cx} y={cy - 14} fill={centerColor} fontSize="9" fontWeight="700"
                fontFamily={F.mono} textAnchor="middle">{centerLabel}</SvgText>
              <SvgText x={cx} y={cy + 4} fill={C.text} fontSize="12" fontWeight="700"
                fontFamily={F.mono} textAnchor="middle">{centerValue}</SvgText>
              <SvgText x={cx} y={cy + 18} fill={centerColor} fontSize="14" fontWeight="800"
                fontFamily={F.display} textAnchor="middle">{centerPct}</SvgText>
            </G>
          ) : (
            <G>
              <SvgText x={cx} y={cy - 6} fill={C.sub} fontSize="8" fontFamily={F.mono}
                textAnchor="middle" letterSpacing={0.5}>TOTAL</SvgText>
              <SvgText x={cx} y={cy + 10} fill={C.text} fontSize="14" fontWeight="700"
                fontFamily={F.mono} textAnchor="middle">{centerValue}</SvgText>
            </G>
          )}
        </Svg>
      </View>
      {/* Ring legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: C.accent, opacity: 0.7 }} />
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Classe</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 14, height: 8, borderRadius: 3, backgroundColor: C.accent }} />
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{filterLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════ REBALANCEAMENTO ═══════════

function buildRebalanceTree(positions, rendaFixa, totalCarteira, classTargets, capTargets, sectorTargets, tickerTargets) {
  var classes = ['acao', 'fii', 'etf', 'rf'];
  var FLAT_CLASSES = { etf: true, rf: true };
  var tree = [];

  var positionsByClass = {};
  classes.forEach(function (cat) { positionsByClass[cat] = []; });
  positions.forEach(function (p) {
    var cat = p.categoria || 'acao';
    if (!positionsByClass[cat]) positionsByClass[cat] = [];
    positionsByClass[cat].push(p);
  });

  function getRebalSector(ticker, cat) {
    var info = TICKER_SECTORS[ticker];
    if (!info) return 'Sem Setor';
    if (cat === 'fii') return FII_REBAL_MAP[info.setor] || 'Outros FII';
    return info.setor;
  }

  function buildTicker(key, label, color, atualVal, metaPctAbsParent, metaPctRelT, preco, qty) {
    var atualPct = totalCarteira > 0 ? (atualVal / totalCarteira) * 100 : 0;
    var metaPctAbsT = metaPctAbsParent * metaPctRelT / 100;
    var metaVal = (metaPctAbsT / 100) * totalCarteira;
    var diff = atualPct - metaPctAbsT;
    var ajuste = metaVal - atualVal;
    var cotas = preco > 0 ? Math.floor(Math.abs(ajuste) / preco) : 0;
    var sharesAction = '';
    if (Math.abs(ajuste) > 50 && preco > 0) {
      sharesAction = ajuste > 0 ? ('Comprar ~' + cotas + ' cotas') : 'Manter';
    }
    return {
      key: key, label: label, level: 'ticker', color: color,
      atualVal: atualVal, atualPct: atualPct,
      metaPctRel: metaPctRelT, metaPctAbs: metaPctAbsT,
      diff: diff, ajuste: ajuste, preco: preco, qty: qty,
      sharesAction: sharesAction,
    };
  }

  classes.forEach(function (cat) {
    var color = PRODUCT_COLORS[cat] || C.accent;
    var nome = CAT_NAMES_FULL[cat] || cat;
    var metaPctClass = classTargets[cat] || 0;
    var isFlat = FLAT_CLASSES[cat] || false;

    var atualValClass = 0;
    if (cat === 'rf') {
      rendaFixa.forEach(function (rf) { atualValClass += (rf.valor_aplicado || 0); });
    } else {
      positionsByClass[cat].forEach(function (p) {
        atualValClass += p.quantidade * (p.preco_atual || p.pm);
      });
    }
    var atualPctClass = totalCarteira > 0 ? (atualValClass / totalCarteira) * 100 : 0;
    var metaValClass = (metaPctClass / 100) * totalCarteira;
    var diffClass = atualPctClass - metaPctClass;
    var ajusteClass = metaValClass - atualValClass;

    if (isFlat) {
      var flatKey = cat + ':_flat';
      var flatTT = tickerTargets[flatKey] || {};
      var tickers = [];
      if (cat === 'rf') {
        rendaFixa.forEach(function (rf) {
          var label = (RF_SECTOR_MAP[rf.tipo] || rf.tipo || '').toUpperCase() + (rf.emissor ? ' - ' + rf.emissor : '');
          var key = rf.id || label;
          tickers.push(buildTicker(key, label, color, rf.valor_aplicado || 0, metaPctClass, flatTT[key] || 0, 0, 0));
        });
      } else {
        positionsByClass[cat].forEach(function (p) {
          var val = p.quantidade * (p.preco_atual || p.pm);
          tickers.push(buildTicker(p.ticker, p.ticker, color, val, metaPctClass, flatTT[p.ticker] || 0, p.preco_atual || p.pm || 0, p.quantidade));
        });
      }
      // Include tickers from tickerTargets that have no position (manually added)
      var addedFlat = {};
      tickers.forEach(function (t) { addedFlat[t.key] = true; });
      Object.keys(flatTT).forEach(function (tk) {
        if (!addedFlat[tk]) {
          tickers.push(buildTicker(tk, tk, color, 0, metaPctClass, flatTT[tk] || 0, 0, 0));
        }
      });
      tree.push({
        key: cat, label: nome, level: 'class', color: color, flat: true,
        atualVal: atualValClass, atualPct: atualPctClass,
        metaPct: metaPctClass, diff: diffClass, ajuste: ajusteClass,
        sectors: [], tickers: tickers,
      });
    } else if (cat === 'acao') {
      // ── ACAO: cap → sector → ticker hierarchy ──
      var capMap = {};
      positionsByClass[cat].forEach(function (p) {
        var capLabel = classifyMarketCap(p.marketCap);
        if (!capMap[capLabel]) capMap[capLabel] = [];
        capMap[capLabel].push(p);
      });

      // Include tickers from tickerTargets under acao caps
      Object.keys(tickerTargets).forEach(function (tKey) {
        if (tKey.indexOf('acao:') !== 0 || tKey === 'acao:_flat') return;
        var parts = tKey.substring(5).split(':');
        if (parts.length < 2) return;
        var capName = parts[0];
        var secName = parts[1];
        var tObj = tickerTargets[tKey] || {};
        Object.keys(tObj).forEach(function (tk) {
          var found = false;
          if (capMap[capName]) {
            capMap[capName].forEach(function (p) {
              if (p.ticker && p.ticker.toUpperCase() === tk.toUpperCase()) found = true;
            });
          }
          if (!found) {
            if (!capMap[capName]) capMap[capName] = [];
            capMap[capName].push({ ticker: tk, quantidade: 0, preco_atual: 0, pm: 0, categoria: 'acao', marketCap: 0 });
          }
        });
      });

      var capTF = capTargets || {};
      var capGroups = [];

      CAP_ORDER.forEach(function (capName, cIdx) {
        var capPositions = capMap[capName] || [];
        var hasTarget = capTF[capName] && capTF[capName] > 0;
        if (capPositions.length === 0 && !hasTarget) return;

        var capMetaRel = capTF[capName] || 0;
        var capMetaAbs = metaPctClass * capMetaRel / 100;
        var atualValCap = 0;
        capPositions.forEach(function (p) { atualValCap += p.quantidade * (p.preco_atual || p.pm); });
        var atualPctCap = totalCarteira > 0 ? (atualValCap / totalCarteira) * 100 : 0;
        var metaValCap = (capMetaAbs / 100) * totalCarteira;
        var diffCap = atualPctCap - capMetaAbs;
        var ajusteCap = metaValCap - atualValCap;

        // Group by sector within cap
        var sectorMap = {};
        capPositions.forEach(function (p) {
          var setor = getRebalSector(p.ticker, cat);
          if (!sectorMap[setor]) sectorMap[setor] = [];
          sectorMap[setor].push(p);
        });

        // Include targets-only tickers within this cap
        var sectorTKey = 'acao:' + capName;
        Object.keys(tickerTargets).forEach(function (tKey) {
          if (tKey.indexOf(sectorTKey + ':') !== 0) return;
          var secName = tKey.substring(sectorTKey.length + 1);
          var tObj = tickerTargets[tKey] || {};
          Object.keys(tObj).forEach(function (tk) {
            var found = false;
            if (sectorMap[secName]) {
              sectorMap[secName].forEach(function (p) {
                if (p.ticker && p.ticker.toUpperCase() === tk.toUpperCase()) found = true;
              });
            }
            if (!found) {
              if (!sectorMap[secName]) sectorMap[secName] = [];
              sectorMap[secName].push({ ticker: tk, quantidade: 0, preco_atual: 0, pm: 0, categoria: 'acao', marketCap: 0 });
            }
          });
        });

        var sectorKeys = Object.keys(sectorMap);
        sectorKeys.sort();
        var sTF = sectorTargets[sectorTKey] || {};
        var sectors = [];
        sectorKeys.forEach(function (sectorName, sIdx) {
          var items = sectorMap[sectorName];
          var atualValSec = 0;
          items.forEach(function (p) { atualValSec += p.quantidade * (p.preco_atual || p.pm); });
          var atualPctSec = totalCarteira > 0 ? (atualValSec / totalCarteira) * 100 : 0;
          var metaRel = sTF[sectorName] || 0;
          var metaAbs = capMetaAbs * metaRel / 100;
          var metaValSec = (metaAbs / 100) * totalCarteira;
          var diffSec = atualPctSec - metaAbs;
          var ajusteSec = metaValSec - atualValSec;
          var tickTFKey = sectorTKey + ':' + sectorName;
          var tickTF = tickerTargets[tickTFKey] || {};
          var tickers = [];
          items.forEach(function (p) {
            var val = p.quantidade * (p.preco_atual || p.pm);
            tickers.push(buildTicker(p.ticker, p.ticker, getSankeyColor(sIdx), val, metaAbs, tickTF[p.ticker] || 0, p.preco_atual || p.pm || 0, p.quantidade));
          });
          sectors.push({
            key: sectorName, label: sectorName, level: 'sector', color: getSankeyColor(sIdx),
            atualVal: atualValSec, atualPct: atualPctSec,
            metaPctRel: metaRel, metaPctAbs: metaAbs,
            diff: diffSec, ajuste: ajusteSec, tickers: tickers,
          });
        });

        capGroups.push({
          key: capName, label: capName, level: 'cap', color: CAP_COLORS[capName] || C.accent,
          atualVal: atualValCap, atualPct: atualPctCap,
          metaPctRel: capMetaRel, metaPctAbs: capMetaAbs,
          diff: diffCap, ajuste: ajusteCap, sectors: sectors,
        });
      });

      tree.push({
        key: cat, label: nome, level: 'class', color: color, flat: false, hasCaps: true,
        atualVal: atualValClass, atualPct: atualPctClass,
        metaPct: metaPctClass, diff: diffClass, ajuste: ajusteClass,
        capGroups: capGroups, sectors: [], tickers: [],
      });
    } else {
      // ── FII: sector → ticker hierarchy (unchanged) ──
      var sectorMap = {};
      positionsByClass[cat].forEach(function (p) {
        var setor = getRebalSector(p.ticker, cat);
        if (!sectorMap[setor]) sectorMap[setor] = [];
        sectorMap[setor].push(p);
      });
      Object.keys(tickerTargets).forEach(function (tKey) {
        if (tKey.indexOf(cat + ':') !== 0 || tKey === cat + ':_flat') return;
        var secName = tKey.substring(cat.length + 1);
        var tObj = tickerTargets[tKey] || {};
        Object.keys(tObj).forEach(function (tk) {
          var found = false;
          if (sectorMap[secName]) {
            sectorMap[secName].forEach(function (p) {
              if (p.ticker && p.ticker.toUpperCase() === tk.toUpperCase()) found = true;
            });
          }
          if (!found) {
            if (!sectorMap[secName]) sectorMap[secName] = [];
            sectorMap[secName].push({ ticker: tk, quantidade: 0, preco_atual: 0, pm: 0, categoria: cat });
          }
        });
      });
      var sectorKeys = Object.keys(sectorMap);
      sectorKeys.sort();
      var sectorTF = sectorTargets[cat] || {};
      var sectors = [];
      sectorKeys.forEach(function (sectorName, sIdx) {
        var items = sectorMap[sectorName];
        var atualValSec = 0;
        items.forEach(function (p) { atualValSec += p.quantidade * (p.preco_atual || p.pm); });
        var atualPctSec = totalCarteira > 0 ? (atualValSec / totalCarteira) * 100 : 0;
        var metaRel = sectorTF[sectorName] || 0;
        var metaAbs = metaPctClass * metaRel / 100;
        var metaValSec = (metaAbs / 100) * totalCarteira;
        var diffSec = atualPctSec - metaAbs;
        var ajusteSec = metaValSec - atualValSec;
        var tickTF = tickerTargets[cat + ':' + sectorName] || {};
        var tickers = [];
        items.forEach(function (p) {
          var val = p.quantidade * (p.preco_atual || p.pm);
          tickers.push(buildTicker(p.ticker, p.ticker, getSankeyColor(sIdx), val, metaAbs, tickTF[p.ticker] || 0, p.preco_atual || p.pm || 0, p.quantidade));
        });
        sectors.push({
          key: sectorName, label: sectorName, level: 'sector', color: getSankeyColor(sIdx),
          atualVal: atualValSec, atualPct: atualPctSec,
          metaPctRel: metaRel, metaPctAbs: metaAbs,
          diff: diffSec, ajuste: ajusteSec, tickers: tickers,
        });
      });
      tree.push({
        key: cat, label: nome, level: 'class', color: color, flat: false,
        atualVal: atualValClass, atualPct: atualPctClass,
        metaPct: metaPctClass, diff: diffClass, ajuste: ajusteClass,
        sectors: sectors, tickers: [],
      });
    }
  });
  return tree;
}

function RebalanceTool(props) {
  var allocAtual = props.allocAtual || {};
  var totalCarteira = props.totalCarteira || 0;
  var positions = props.positions || [];
  var assetList = props.assetList || [];
  var rendaFixa = props.rendaFixa || [];
  var userId = props.userId || null;
  var savedTargets = props.savedTargets || null;

  var DEFAULT_CLASS_TARGETS = { acao: 40, fii: 25, etf: 20, rf: 15 };
  var _expandedClass = useState(null);
  var expandedClass = _expandedClass[0]; var setExpandedClass = _expandedClass[1];
  var _expandedCap = useState(null);
  var expandedCap = _expandedCap[0]; var setExpandedCap = _expandedCap[1];
  var _expandedSector = useState(null);
  var expandedSector = _expandedSector[0]; var setExpandedSector = _expandedSector[1];
  var _editing = useState(false);
  var isEditing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var isSaving = _saving[0]; var setSaving = _saving[1];
  var DEFAULT_CAP_TARGETS = { 'Large Cap': 40, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 10 };
  var _classTargets = useState(DEFAULT_CLASS_TARGETS);
  var classTargets = _classTargets[0]; var setClassTargets = _classTargets[1];
  var _capTargets = useState(DEFAULT_CAP_TARGETS);
  var capTargets = _capTargets[0]; var setCapTargets = _capTargets[1];
  var _sectorTargets = useState({});
  var sectorTargets = _sectorTargets[0]; var setSectorTargets = _sectorTargets[1];
  var _tickerTargets = useState({});
  var tickerTargets = _tickerTargets[0]; var setTickerTargets = _tickerTargets[1];
  var _newTicker = useState('');
  var newTicker = _newTicker[0]; var setNewTicker = _newTicker[1];
  var _initialized = useState(false);
  var initialized = _initialized[0]; var setInitialized = _initialized[1];
  var _dbLoaded = useState(false);
  var dbLoaded = _dbLoaded[0]; var setDbLoaded = _dbLoaded[1];
  var _rebalInfoModal = useState(null); var rebalInfoModal = _rebalInfoModal[0]; var setRebalInfoModal = _rebalInfoModal[1];

  // ── Load saved targets from DB ──
  var _didLoadDB = false;
  if (!dbLoaded && savedTargets) {
    _didLoadDB = true;
    setDbLoaded(true);
    if (savedTargets.class_targets) setClassTargets(savedTargets.class_targets);
    // Extract cap targets from sector_targets._cap
    var savedST = savedTargets.sector_targets || {};
    if (savedST._cap) {
      setCapTargets(savedST._cap);
      var stClean = {};
      Object.keys(savedST).forEach(function (k) { if (k !== '_cap') stClean[k] = savedST[k]; });
      setSectorTargets(stClean);
    } else {
      if (savedTargets.sector_targets) setSectorTargets(savedTargets.sector_targets);
    }
    if (savedTargets.ticker_targets) setTickerTargets(savedTargets.ticker_targets);
    setInitialized(true);
  }
  var _aporteText = useState('');
  var aporteText = _aporteText[0]; var setAporteText = _aporteText[1];
  var _suggestions = useState(null);
  var suggestions = _suggestions[0]; var setSuggestions = _suggestions[1];
  var _showProfiles = useState(false);
  var showProfiles = _showProfiles[0]; var setShowProfiles = _showProfiles[1];

  var FLAT_CLASSES = { etf: true, rf: true };

  // ── Profile presets ──
  var PROFILES = {
    conservador: {
      label: 'Conservador', emoji: '🛡️',
      desc: 'Prioriza renda fixa e FIIs de papel. Menor exposicao a acoes.',
      classes: { acao: 15, fii: 15, etf: 10, rf: 60 },
      acaoCaps: { 'Large Cap': 60, 'Mid Cap': 25, 'Small Cap': 10, 'Micro Cap': 5 },
      fiiSectors: { 'Tijolo': 30, 'Papel': 55, 'Híbrido': 15 },
    },
    moderado: {
      label: 'Moderado', emoji: '⚖️',
      desc: 'Equilibrio entre renda variavel e fixa. Diversificacao ampla.',
      classes: { acao: 30, fii: 25, etf: 20, rf: 25 },
      acaoCaps: { 'Large Cap': 45, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 5 },
      fiiSectors: { 'Tijolo': 45, 'Papel': 40, 'Híbrido': 15 },
    },
    arrojado: {
      label: 'Arrojado', emoji: '🚀',
      desc: 'Foco em acoes e ETFs para crescimento. Pouca renda fixa.',
      classes: { acao: 45, fii: 25, etf: 25, rf: 5 },
      acaoCaps: { 'Large Cap': 30, 'Mid Cap': 30, 'Small Cap': 25, 'Micro Cap': 15 },
      fiiSectors: { 'Tijolo': 55, 'Papel': 30, 'Híbrido': 15 },
    },
  };

  function applyProfile(profileKey) {
    var profile = PROFILES[profileKey];
    if (!profile) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // 1. Set class targets
    setClassTargets(profile.classes);

    // 2. Build sector + ticker targets from current positions
    var newSectorT = {};
    var newTickerT = {};

    ['acao', 'fii', 'etf', 'rf'].forEach(function (cat) {
      if (FLAT_CLASSES[cat]) {
        // Flat: equal weight tickers
        var items = [];
        if (cat === 'rf') {
          rendaFixa.forEach(function (rf) {
            items.push(rf.id || ((rf.tipo || '').toUpperCase() + (rf.emissor ? ' - ' + rf.emissor : '')));
          });
        } else {
          positions.forEach(function (p) {
            if ((p.categoria || 'acao') !== cat) return;
            items.push(p.ticker);
          });
        }
        if (items.length > 0) {
          var eq = Math.floor(100 / items.length);
          var leftover = 100 - eq * items.length;
          var tObj = {};
          items.forEach(function (tk, ti) {
            tObj[tk] = ti === 0 ? eq + leftover : eq;
          });
          newTickerT[cat + ':_flat'] = tObj;
        }
      } else if (cat === 'fii') {
        // FII: use profile fiiSectors then equal weight tickers
        var sectorMap = {};
        positions.forEach(function (p) {
          if ((p.categoria || 'acao') !== 'fii') return;
          var info = TICKER_SECTORS[p.ticker];
          var setor = info ? (FII_REBAL_MAP[info.setor] || 'Outros FII') : 'Outros FII';
          if (!sectorMap[setor]) sectorMap[setor] = [];
          sectorMap[setor].push(p.ticker);
        });
        var sKeys = Object.keys(sectorMap);
        if (sKeys.length > 0) {
          var sObj = {};
          var usedPct = 0;
          sKeys.forEach(function (sk, si) {
            var pct = profile.fiiSectors[sk] || 0;
            if (pct === 0 && !profile.fiiSectors[sk]) {
              pct = Math.round((100 - usedPct) / (sKeys.length - si));
            }
            sObj[sk] = pct;
            usedPct += pct;
            // equal weight tickers in sector
            var sitems = sectorMap[sk];
            var eqT = Math.floor(100 / sitems.length);
            var leftT = 100 - eqT * sitems.length;
            var tO = {};
            sitems.forEach(function (tk, ti) {
              tO[tk] = ti === 0 ? eqT + leftT : eqT;
            });
            newTickerT['fii:' + sk] = tO;
          });
          // Normalize if total != 100
          var total = 0;
          Object.keys(sObj).forEach(function (k) { total += sObj[k]; });
          if (total !== 100 && total > 0) {
            var scale = 100 / total;
            var assigned = 0;
            var keys = Object.keys(sObj);
            keys.forEach(function (k, i) {
              if (i === keys.length - 1) {
                sObj[k] = 100 - assigned;
              } else {
                sObj[k] = Math.round(sObj[k] * scale);
                assigned += sObj[k];
              }
            });
          }
          newSectorT['fii'] = sObj;
        }
      } else {
        // Acao: group by cap → sector → ticker
        var newCapT = profile.acaoCaps || { 'Large Cap': 40, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 10 };
        var capSectorMap = {};
        positions.forEach(function (p) {
          if ((p.categoria || 'acao') !== 'acao') return;
          var capLabel = classifyMarketCap(p.marketCap);
          var info = TICKER_SECTORS[p.ticker];
          var setor = info ? info.setor : 'Sem Setor';
          if (!capSectorMap[capLabel]) capSectorMap[capLabel] = {};
          if (!capSectorMap[capLabel][setor]) capSectorMap[capLabel][setor] = [];
          capSectorMap[capLabel][setor].push(p.ticker);
        });

        Object.keys(capSectorMap).forEach(function (capName) {
          var sectorsInCap = capSectorMap[capName];
          var sKeys = Object.keys(sectorsInCap);
          if (sKeys.length > 0) {
            var eqS = Math.floor(100 / sKeys.length);
            var leftS = 100 - eqS * sKeys.length;
            var sObj = {};
            sKeys.forEach(function (sk, si) {
              sObj[sk] = si === 0 ? eqS + leftS : eqS;
              var sitems = sectorsInCap[sk];
              var eqT3 = Math.floor(100 / sitems.length);
              var leftT3 = 100 - eqT3 * sitems.length;
              var tO3 = {};
              sitems.forEach(function (tk, ti) {
                tO3[tk] = ti === 0 ? eqT3 + leftT3 : eqT3;
              });
              newTickerT['acao:' + capName + ':' + sk] = tO3;
            });
            newSectorT['acao:' + capName] = sObj;
          }
        });

        setCapTargets(newCapT);
      }
    });

    setSectorTargets(newSectorT);
    setTickerTargets(newTickerT);
    setSuggestions(null);
    setShowProfiles(false);

    // Save profile to DB (embed capTargets in sector_targets._cap)
    if (userId) {
      var stToSave = {};
      Object.keys(newSectorT).forEach(function (k) { stToSave[k] = newSectorT[k]; });
      stToSave._cap = profile.acaoCaps || { 'Large Cap': 40, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 10 };
      upsertRebalanceTargets(userId, {
        class_targets: profile.classes,
        sector_targets: stToSave,
        ticker_targets: newTickerT,
      }).catch(function () { /* silent */ });
    }
  }

  // Auto-init sector/ticker targets from current positions (equal weight)
  // Skip if DB targets were loaded in this same render
  if (!initialized && !_didLoadDB && (positions.length > 0 || rendaFixa.length > 0)) {
    var initSectorT = {};
    var initTickerT = {};

    ['acao', 'fii', 'etf', 'rf'].forEach(function (cat) {
      if (FLAT_CLASSES[cat]) {
        var items = [];
        if (cat === 'rf') {
          rendaFixa.forEach(function (rf) {
            items.push(rf.id || ((rf.tipo || '').toUpperCase() + (rf.emissor ? ' - ' + rf.emissor : '')));
          });
        } else {
          positions.forEach(function (p) {
            if ((p.categoria || 'acao') !== cat) return;
            items.push(p.ticker);
          });
        }
        if (items.length > 0) {
          var eq = Math.round(100 / items.length);
          var tObj = {};
          items.forEach(function (tk, ti) {
            tObj[tk] = ti === items.length - 1 ? (100 - eq * (items.length - 1)) : eq;
          });
          initTickerT[cat + ':_flat'] = tObj;
        }
      } else if (cat === 'acao') {
        // Acao: group by cap → sector → ticker
        var initCapSM = {};
        positions.forEach(function (p) {
          if ((p.categoria || 'acao') !== 'acao') return;
          var capLabel = classifyMarketCap(p.marketCap);
          var info = TICKER_SECTORS[p.ticker];
          var setor = info ? info.setor : 'Sem Setor';
          if (!initCapSM[capLabel]) initCapSM[capLabel] = {};
          if (!initCapSM[capLabel][setor]) initCapSM[capLabel][setor] = [];
          initCapSM[capLabel][setor].push(p.ticker);
        });
        // Equal weight caps that have positions
        var capKeys = Object.keys(initCapSM);
        if (capKeys.length > 0) {
          var eqC = Math.round(100 / capKeys.length);
          var initCapT = {};
          capKeys.forEach(function (ck, ci) {
            initCapT[ck] = ci === capKeys.length - 1 ? (100 - eqC * (capKeys.length - 1)) : eqC;
          });
          setCapTargets(initCapT);
        }
        Object.keys(initCapSM).forEach(function (capName) {
          var sectorsInCap = initCapSM[capName];
          var sKeys = Object.keys(sectorsInCap);
          if (sKeys.length > 0) {
            var eqS2 = Math.round(100 / sKeys.length);
            var sObj2 = {};
            sKeys.forEach(function (sk, si) {
              sObj2[sk] = si === sKeys.length - 1 ? (100 - eqS2 * (sKeys.length - 1)) : eqS2;
              var sitems = sectorsInCap[sk];
              if (sitems.length > 0) {
                var eqT4 = Math.round(100 / sitems.length);
                var tO4 = {};
                sitems.forEach(function (tk, ti) {
                  tO4[tk] = ti === sitems.length - 1 ? (100 - eqT4 * (sitems.length - 1)) : eqT4;
                });
                initTickerT['acao:' + capName + ':' + sk] = tO4;
              }
            });
            initSectorT['acao:' + capName] = sObj2;
          }
        });
      } else {
        // FII: sector → ticker
        var sectorMap = {};
        positions.forEach(function (p) {
          if ((p.categoria || 'acao') !== cat) return;
          var info = TICKER_SECTORS[p.ticker];
          var setor = info ? (FII_REBAL_MAP[info.setor] || 'Outros FII') : 'Sem Setor';
          if (!sectorMap[setor]) sectorMap[setor] = [];
          sectorMap[setor].push(p.ticker);
        });
        var sectorKeys = Object.keys(sectorMap);
        if (sectorKeys.length > 0) {
          var eqS = Math.round(100 / sectorKeys.length);
          var sObj = {};
          sectorKeys.forEach(function (sk, si) {
            sObj[sk] = si === sectorKeys.length - 1 ? (100 - eqS * (sectorKeys.length - 1)) : eqS;
            var sitems = sectorMap[sk];
            if (sitems.length > 0) {
              var eqT = Math.round(100 / sitems.length);
              var tO = {};
              sitems.forEach(function (tk, ti) {
                tO[tk] = ti === sitems.length - 1 ? (100 - eqT * (sitems.length - 1)) : eqT;
              });
              initTickerT[cat + ':' + sk] = tO;
            }
          });
          initSectorT[cat] = sObj;
        }
      }
    });
    setSectorTargets(initSectorT);
    setTickerTargets(initTickerT);
    setInitialized(true);
  }

  // Build the tree
  var tree = buildRebalanceTree(positions, rendaFixa, totalCarteira, classTargets, capTargets, sectorTargets, tickerTargets);

  // Accuracy: 100 - sum(|class drift|)
  var sumDrift = 0;
  tree.forEach(function (c) { sumDrift += Math.abs(c.diff); });
  var accuracy = Math.max(0, 100 - sumDrift);
  var accColor = accuracy >= 95 ? C.green : accuracy >= 80 ? C.yellow : C.red;

  var classKeys = ['acao', 'fii', 'etf', 'rf'];
  var totalClassPct = classKeys.reduce(function (s, k) { return s + (classTargets[k] || 0); }, 0);

  // ── Compute aporte suggestions ──
  function computeSuggestions() {
    var aporteVal = parseCurrency(aporteText);
    if (aporteVal <= 0) { setSuggestions(null); return; }
    var newTotal = totalCarteira + aporteVal;

    // Collect ticker-level leaves with deficits
    var leaves = [];
    tree.forEach(function (cls) {
      var allTickers = cls.flat ? cls.tickers : [];
      if (!cls.flat && cls.hasCaps) {
        (cls.capGroups || []).forEach(function (cg) {
          cg.sectors.forEach(function (sec) {
            sec.tickers.forEach(function (t) { allTickers.push(t); });
          });
        });
      } else if (!cls.flat) {
        cls.sectors.forEach(function (sec) {
          sec.tickers.forEach(function (t) { allTickers.push(t); });
        });
      }
      allTickers.forEach(function (t) {
        var metaValNew = (t.metaPctAbs / 100) * newTotal;
        var deficit = metaValNew - t.atualVal;
        if (deficit > 0) {
          leaves.push({
            key: t.key, label: t.label, color: cls.color,
            classe: cls.label, setor: cls.flat ? cls.label : '',
            deficit: deficit, preco: t.preco, qty: t.qty,
          });
        }
      });
    });

    // Also check for classes under-target with NO ticker deficits (no positions)
    tree.forEach(function (cls) {
      var metaValCls = (cls.metaPct / 100) * newTotal;
      var classDeficit = metaValCls - cls.atualVal;
      if (classDeficit <= 0) return;
      var hasTickerDef = false;
      var allT = cls.flat ? cls.tickers : [];
      if (!cls.flat && cls.hasCaps) {
        (cls.capGroups || []).forEach(function (cg) {
          cg.sectors.forEach(function (sec) {
            sec.tickers.forEach(function (t) { allT.push(t); });
          });
        });
      } else if (!cls.flat) {
        cls.sectors.forEach(function (sec) {
          sec.tickers.forEach(function (t) { allT.push(t); });
        });
      }
      allT.forEach(function (t) {
        if ((t.metaPctAbs / 100) * newTotal - t.atualVal > 0) hasTickerDef = true;
      });
      if (!hasTickerDef) {
        leaves.push({
          key: '_class_' + cls.key, label: 'Alocar em ' + cls.label, color: cls.color,
          classe: cls.label, setor: '',
          deficit: classDeficit, preco: 0, qty: 0,
        });
      }
    });

    if (leaves.length === 0) { setSuggestions({ items: [], aporte: aporteVal, sobra: aporteVal }); return; }

    var totalDeficit = 0;
    leaves.forEach(function (l) { totalDeficit += l.deficit; });

    var items = [];
    var used = 0;
    leaves.forEach(function (l) {
      var alloc = totalDeficit <= aporteVal ? l.deficit : (l.deficit / totalDeficit) * aporteVal;
      if (l.preco > 0) {
        var cotas = Math.floor(alloc / l.preco);
        if (cotas <= 0) return;
        alloc = cotas * l.preco;
        items.push({ key: l.key, label: l.label, color: l.color, classe: l.classe, setor: l.setor,
          valor: alloc, cotas: cotas, preco: l.preco });
      } else {
        if (alloc < 1) return;
        items.push({ key: l.key, label: l.label, color: l.color, classe: l.classe, setor: l.setor,
          valor: alloc, cotas: 0, preco: 0 });
      }
      used += alloc;
    });
    items.sort(function (a, b) { return b.valor - a.valor; });
    setSuggestions({ items: items, aporte: aporteVal, sobra: Math.max(0, aporteVal - used) });
  }

  // ── Target helpers (clear suggestions on any change) ──
  // ── Redistribute: when one item changes, redistribute remaining among others ──
  function redistribute(obj, changedKey, newVal) {
    var result = {};
    Object.keys(obj).forEach(function (k) { result[k] = obj[k]; });
    var oldVal = result[changedKey] || 0;
    result[changedKey] = newVal;
    var remaining = 100 - newVal;
    var otherKeys = Object.keys(result).filter(function (k) { return k !== changedKey; });
    var otherTotal = 0;
    otherKeys.forEach(function (k) { otherTotal += (result[k] || 0); });
    if (remaining <= 0) {
      otherKeys.forEach(function (k) { result[k] = 0; });
    } else if (otherTotal === 0) {
      // All others are 0, distribute equally
      if (otherKeys.length > 0) {
        var eq = Math.floor(remaining / otherKeys.length);
        var leftover = remaining - eq * otherKeys.length;
        otherKeys.forEach(function (k, i) {
          result[k] = i === 0 ? eq + leftover : eq;
        });
      }
    } else {
      // Proportional redistribution
      var scale = remaining / otherTotal;
      var assigned = 0;
      otherKeys.forEach(function (k, i) {
        if (i === otherKeys.length - 1) {
          result[k] = Math.max(0, remaining - assigned);
        } else {
          var v = Math.round((result[k] || 0) * scale);
          result[k] = Math.max(0, v);
          assigned += result[k];
        }
      });
    }
    return result;
  }

  function stepClassTarget(cat, delta) {
    var num = clamp((classTargets[cat] || 0) + delta, 0, 100);
    var result = redistribute(classTargets, cat, num);
    setClassTargets(result);
    setSuggestions(null);
  }
  function setClassTargetVal(cat, val) {
    var num = clamp(parseInt(val) || 0, 0, 100);
    var result = redistribute(classTargets, cat, num);
    setClassTargets(result);
    setSuggestions(null);
  }

  function stepCapTarget(capName, delta) {
    var num = clamp((capTargets[capName] || 0) + delta, 0, 100);
    var result = redistribute(capTargets, capName, num);
    setCapTargets(result);
    setSuggestions(null);
  }
  function setCapTargetVal(capName, val) {
    var num = clamp(parseInt(val) || 0, 0, 100);
    var result = redistribute(capTargets, capName, num);
    setCapTargets(result);
    setSuggestions(null);
  }

  function stepSectorTarget(cat, sectorName, delta) {
    var catObj = sectorTargets[cat] || {};
    var num = clamp((catObj[sectorName] || 0) + delta, 0, 100);
    var newInner = redistribute(catObj, sectorName, num);
    var outerCopy = {};
    Object.keys(sectorTargets).forEach(function (k) { outerCopy[k] = sectorTargets[k]; });
    outerCopy[cat] = newInner;
    setSectorTargets(outerCopy);
    setSuggestions(null);
  }
  function setSectorTargetVal(cat, sectorName, val) {
    var catObj = sectorTargets[cat] || {};
    var num = clamp(parseInt(val) || 0, 0, 100);
    var newInner = redistribute(catObj, sectorName, num);
    var outerCopy = {};
    Object.keys(sectorTargets).forEach(function (k) { outerCopy[k] = sectorTargets[k]; });
    outerCopy[cat] = newInner;
    setSectorTargets(outerCopy);
    setSuggestions(null);
  }

  function stepTickerTarget(cat, sectorName, tickerKey, delta) {
    var compKey = cat + ':' + sectorName;
    var secObj = tickerTargets[compKey] || {};
    var num = clamp((secObj[tickerKey] || 0) + delta, 0, 100);
    var newInner = redistribute(secObj, tickerKey, num);
    var outerCopy = {};
    Object.keys(tickerTargets).forEach(function (k) { outerCopy[k] = tickerTargets[k]; });
    outerCopy[compKey] = newInner;
    setTickerTargets(outerCopy);
    setSuggestions(null);
  }
  function setTickerTargetVal(cat, sectorName, tickerKey, val) {
    var compKey = cat + ':' + sectorName;
    var secObj = tickerTargets[compKey] || {};
    var num = clamp(parseInt(val) || 0, 0, 100);
    var newInner = redistribute(secObj, tickerKey, num);
    var outerCopy = {};
    Object.keys(tickerTargets).forEach(function (k) { outerCopy[k] = tickerTargets[k]; });
    outerCopy[compKey] = newInner;
    setTickerTargets(outerCopy);
    setSuggestions(null);
  }

  // ── Centralized add ticker ──
  function addTickerCentralized() {
    var t = newTicker.toUpperCase().trim();
    if (!t) return;
    var cls = classifyTicker(t, positions, expandedClass);
    var cat = cls.classe;
    if (FLAT_CLASSES[cat]) {
      var flatKey = cat + ':_flat';
      var secObj = tickerTargets[flatKey] || {};
      if (secObj[t] !== undefined) return;
      var outerCopy = {};
      Object.keys(tickerTargets).forEach(function (k) { outerCopy[k] = tickerTargets[k]; });
      var innerCopy = {};
      Object.keys(secObj).forEach(function (k) { innerCopy[k] = secObj[k]; });
      innerCopy[t] = 0;
      outerCopy[flatKey] = innerCopy;
      setTickerTargets(outerCopy);
    } else if (cat === 'acao') {
      // Acao: determine cap group from marketCap
      var mktCap = 0;
      positions.forEach(function (p) {
        if (p.ticker && p.ticker.toUpperCase() === t) mktCap = p.marketCap || 0;
      });
      var capLabel = classifyMarketCap(mktCap);
      var setor = cls.setor;

      // Ensure cap exists in capTargets
      if (capTargets[capLabel] === undefined) {
        var ctCopy = {};
        Object.keys(capTargets).forEach(function (k) { ctCopy[k] = capTargets[k]; });
        ctCopy[capLabel] = 0;
        setCapTargets(ctCopy);
      }
      // Ensure sector exists under cap
      var sectorTKey = 'acao:' + capLabel;
      var catSectors = sectorTargets[sectorTKey] || {};
      if (catSectors[setor] === undefined) {
        var sCopy = {};
        Object.keys(sectorTargets).forEach(function (k) { sCopy[k] = sectorTargets[k]; });
        var inner = {};
        Object.keys(catSectors).forEach(function (k) { inner[k] = catSectors[k]; });
        inner[setor] = 0;
        sCopy[sectorTKey] = inner;
        setSectorTargets(sCopy);
      }
      var compKey = sectorTKey + ':' + setor;
      var secO = tickerTargets[compKey] || {};
      if (secO[t] !== undefined) return;
      var oC = {};
      Object.keys(tickerTargets).forEach(function (k) { oC[k] = tickerTargets[k]; });
      var iC = {};
      Object.keys(secO).forEach(function (k) { iC[k] = secO[k]; });
      iC[t] = 0;
      oC[compKey] = iC;
      setTickerTargets(oC);
    } else {
      // FII: sector → ticker
      var setor2 = cls.setor;
      var catSectors2 = sectorTargets[cat] || {};
      if (catSectors2[setor2] === undefined) {
        var sCopy2 = {};
        Object.keys(sectorTargets).forEach(function (k) { sCopy2[k] = sectorTargets[k]; });
        var inner2 = {};
        Object.keys(catSectors2).forEach(function (k) { inner2[k] = catSectors2[k]; });
        inner2[setor2] = 0;
        sCopy2[cat] = inner2;
        setSectorTargets(sCopy2);
      }
      var compKey2 = cat + ':' + setor2;
      var secO2 = tickerTargets[compKey2] || {};
      if (secO2[t] !== undefined) return;
      var oC2 = {};
      Object.keys(tickerTargets).forEach(function (k) { oC2[k] = tickerTargets[k]; });
      var iC2 = {};
      Object.keys(secO2).forEach(function (k) { iC2[k] = secO2[k]; });
      iC2[t] = 0;
      oC2[compKey2] = iC2;
      setTickerTargets(oC2);
    }
    setNewTicker('');
    setSuggestions(null);
  }

  // ── Render helpers ──
  function renderTotalBar(total, levelLabel) {
    var barColor = total === 100 ? C.green : total > 100 ? C.red : C.yellow;
    var barW = clamp(total, 0, 110);
    var label = total === 100 ? 'OK' : total < 100 ? 'Faltam ' + (100 - total) + '%' : 'Excede ' + (total - 100) + '%';
    return (
      <View style={{ marginBottom: 6, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{levelLabel}</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: barColor, fontFamily: F.mono }}>
            {total + '% — ' + label}
          </Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: barColor, width: clamp(barW, 0, 100) + '%', opacity: 0.7 }} />
        </View>
      </View>
    );
  }

  function renderBar(atualPct, metaPct, color, height) {
    var atualW = clamp(atualPct, 0, 100);
    var metaW = clamp(metaPct, 0, 100);
    return (
      <View style={{ marginTop: 6, height: height, borderRadius: height / 2, backgroundColor: 'rgba(255,255,255,0.03)', position: 'relative' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, height: height, borderRadius: height / 2,
          backgroundColor: color, opacity: 0.15, width: metaW + '%' }} />
        <View style={{ position: 'absolute', top: 0, left: 0, height: height, borderRadius: height / 2,
          backgroundColor: color, opacity: 0.6, width: atualW + '%' }} />
        {metaW > 2 ? (
          <View style={{ position: 'absolute', top: -1, left: metaW + '%', width: 2, height: height + 2,
            borderRadius: 1, backgroundColor: color, opacity: 0.9 }} />
        ) : null}
      </View>
    );
  }

  function renderStepper(val, onStep, onSet) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 }}>
        <TouchableOpacity onPress={function () { onStep(-1); }}
          style={{ width: 24, height: 26, borderRadius: 5, backgroundColor: C.surface,
            borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono, lineHeight: 16 }}>-</Text>
        </TouchableOpacity>
        <TextInput
          style={{ width: 40, height: 26, borderRadius: 5, borderWidth: 1, borderColor: C.accent + '40',
            backgroundColor: C.accent + '08', color: C.accent, fontSize: 13, fontFamily: F.mono,
            textAlign: 'center', paddingVertical: 0, paddingHorizontal: 2, fontWeight: '700' }}
          value={String(val)}
          onChangeText={function (v) { onSet(v); }}
          keyboardType="numeric"
          maxLength={3}
          selectTextOnFocus
        />
        <TouchableOpacity onPress={function () { onStep(1); }}
          style={{ width: 24, height: 26, borderRadius: 5, backgroundColor: C.surface,
            borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono, lineHeight: 16 }}>+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderBadge(ajuste, preco) {
    if (Math.abs(ajuste) <= 50) {
      return (
        <View style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, backgroundColor: C.green + '10' }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: C.green, fontFamily: F.mono }}>OK</Text>
        </View>
      );
    }
    if (ajuste > 0) {
      var cotasC = preco > 0 ? Math.floor(ajuste / preco) : 0;
      return (
        <View style={{ alignItems: 'flex-end', paddingLeft: 6, paddingVertical: 3, paddingRight: 2,
          borderRadius: 6, backgroundColor: C.green + '0A' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 9, color: C.green, fontFamily: F.mono }}>{'▲'}</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.green, fontFamily: F.mono }}>Comprar</Text>
          </View>
          <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginTop: 1 }}>{'R$ ' + fmt(ajuste)}</Text>
          {cotasC > 0 ? (
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'~' + cotasC + ' cotas'}</Text>
          ) : null}
        </View>
      );
    }
    return (
      <View style={{ alignItems: 'flex-end', paddingLeft: 6, paddingVertical: 3, paddingRight: 2,
        borderRadius: 6, backgroundColor: C.yellow + '0A' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono }}>{'■'}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.yellow, fontFamily: F.mono }}>Manter</Text>
        </View>
        <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginTop: 1 }}>{'R$ ' + fmt(Math.abs(ajuste)) + ' acima'}</Text>
      </View>
    );
  }

  // ── RENDER: Ticker row ──
  function renderTickerRow(t, cat, sectorKey, indent) {
    var diffColor = Math.abs(t.diff) < 2 ? C.green : Math.abs(t.diff) < 5 ? C.yellow : C.red;
    return (
      <View key={t.key} style={{ marginLeft: indent, marginBottom: 1, padding: 8, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.01)', borderLeftWidth: 2, borderLeftColor: diffColor + '60' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.color }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: F.display }} numberOfLines={1}>{t.label}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isEditing ? (
              <View>
                <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>META</Text>
                {renderStepper(t.metaPctRel,
                  function (d) { stepTickerTarget(cat, sectorKey, t.key, d); },
                  function (v) { setTickerTargetVal(cat, sectorKey, t.key, v); })}
              </View>
            ) : null}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono }}>{t.atualPct.toFixed(1) + '%'}</Text>
              {!isEditing ? (
                <Text style={{ fontSize: 10, color: diffColor, fontWeight: '600', fontFamily: F.mono }}>
                  {t.diff > 0 ? '+' : ''}{t.diff.toFixed(1) + '%'}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        {renderBar(t.atualPct, t.metaPctAbs, t.color, 8)}
        {!isEditing && Math.abs(t.ajuste) > 50 ? (
          <View style={{ marginTop: 4 }}>{renderBadge(t.ajuste, t.preco)}</View>
        ) : null}
      </View>
    );
  }

  // ── RENDER: Sector row ──
  function renderSectorRow(s, cat, indent) {
    var ml = indent !== undefined ? indent : 16;
    var diffColor = Math.abs(s.diff) < 2 ? C.green : Math.abs(s.diff) < 5 ? C.yellow : C.red;
    var isExp = expandedSector === (cat + ':' + s.key);
    var compKey = cat + ':' + s.key;
    var tTargets = tickerTargets[compKey] || {};
    var tickerTotalPct = 0;
    Object.keys(tTargets).forEach(function (k) { tickerTotalPct += (tTargets[k] || 0); });

    return (
      <View key={s.key}>
        <TouchableOpacity
          onPress={function () {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setExpandedSector(isExp ? null : cat + ':' + s.key);
          }}
          activeOpacity={0.7}
          style={{ marginLeft: ml, marginBottom: 1, padding: 9, borderRadius: 9,
            backgroundColor: 'rgba(255,255,255,0.02)', borderLeftWidth: 3, borderLeftColor: diffColor + '70' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: s.color }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display }}>{s.label}</Text>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{isExp ? '▾' : '▸'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isEditing ? (
                <View>
                  <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>META</Text>
                  {renderStepper(s.metaPctRel,
                    function (d) { stepSectorTarget(cat, s.key, d); },
                    function (v) { setSectorTargetVal(cat, s.key, v); })}
                </View>
              ) : null}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
                  {s.atualPct.toFixed(1) + '% / ' + s.metaPctAbs.toFixed(1) + '%'}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: diffColor, fontFamily: F.mono }}>
                  {s.diff > 0 ? '+' : ''}{s.diff.toFixed(1) + '%'}
                </Text>
              </View>
            </View>
          </View>
          {renderBar(s.atualPct, s.metaPctAbs, s.color, 10)}
        </TouchableOpacity>
        {isExp ? (
          <View style={{ marginTop: 2 }}>
            {isEditing ? renderTotalBar(tickerTotalPct, 'Total tickers em ' + s.key) : null}
            {s.tickers.map(function (t) { return renderTickerRow(t, cat, s.key, ml + 16); })}
          </View>
        ) : null}
      </View>
    );
  }

  // ── RENDER: Cap row (Market Cap level for acao) ──
  function renderCapRow(cg) {
    var diffColor = Math.abs(cg.diff) < 2 ? C.green : Math.abs(cg.diff) < 5 ? C.yellow : C.red;
    var isExp = expandedCap === cg.key;
    var sectorTKey = 'acao:' + cg.key;
    var sTF = sectorTargets[sectorTKey] || {};
    var sectorTotalPct = 0;
    Object.keys(sTF).forEach(function (k) { sectorTotalPct += (sTF[k] || 0); });

    return (
      <View key={cg.key}>
        <TouchableOpacity
          onPress={function () {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            if (isExp) { setExpandedCap(null); setExpandedSector(null); }
            else { setExpandedCap(cg.key); setExpandedSector(null); }
          }}
          activeOpacity={0.7}
          style={{ marginLeft: 16, marginBottom: 1, padding: 9, borderRadius: 9,
            backgroundColor: 'rgba(255,255,255,0.02)', borderLeftWidth: 3, borderLeftColor: diffColor + '70' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: cg.color }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display }}>{cg.label}</Text>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{isExp ? '▾' : '▸'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isEditing ? (
                <View>
                  <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>META</Text>
                  {renderStepper(cg.metaPctRel,
                    function (d) { stepCapTarget(cg.key, d); },
                    function (v) { setCapTargetVal(cg.key, v); })}
                </View>
              ) : null}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
                  {cg.atualPct.toFixed(1) + '% / ' + cg.metaPctAbs.toFixed(1) + '%'}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: diffColor, fontFamily: F.mono }}>
                  {cg.diff > 0 ? '+' : ''}{cg.diff.toFixed(1) + '%'}
                </Text>
              </View>
            </View>
          </View>
          {renderBar(cg.atualPct, cg.metaPctAbs, cg.color, 10)}
        </TouchableOpacity>
        {isExp ? (
          <View style={{ marginTop: 2 }}>
            {isEditing ? renderTotalBar(sectorTotalPct, 'Total setores em ' + cg.key) : null}
            {cg.sectors.map(function (s) { return renderSectorRow(s, 'acao:' + cg.key, 32); })}
          </View>
        ) : null}
      </View>
    );
  }

  // ── RENDER: Class row ──
  function renderClassRow(cls) {
    var diffColor = Math.abs(cls.diff) < 2 ? C.green : Math.abs(cls.diff) < 5 ? C.yellow : C.red;
    var isExp = expandedClass === cls.key;

    // Total for sector/cap or flat ticker bar
    var subTotalPct = 0;
    if (cls.flat) {
      var fKey = cls.key + ':_flat';
      var fT = tickerTargets[fKey] || {};
      Object.keys(fT).forEach(function (k) { subTotalPct += (fT[k] || 0); });
    } else if (cls.hasCaps) {
      Object.keys(capTargets).forEach(function (k) { subTotalPct += (capTargets[k] || 0); });
    } else {
      var catST = sectorTargets[cls.key] || {};
      Object.keys(catST).forEach(function (k) { subTotalPct += (catST[k] || 0); });
    }

    return (
      <View key={cls.key}>
        <TouchableOpacity
          onPress={function () {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            if (isExp) { setExpandedClass(null); setExpandedCap(null); setExpandedSector(null); }
            else { setExpandedClass(cls.key); setExpandedCap(null); setExpandedSector(null); }
          }}
          activeOpacity={0.7}
          style={{ marginBottom: 2, padding: 10, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.015)', borderLeftWidth: 4, borderLeftColor: diffColor + '80' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cls.color }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{cls.label}</Text>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{isExp ? '▾' : '▸'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isEditing ? (
                <View>
                  <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>META</Text>
                  {renderStepper(cls.metaPct,
                    function (d) { stepClassTarget(cls.key, d); },
                    function (v) { setClassTargetVal(cls.key, v); })}
                </View>
              ) : null}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>
                  {cls.atualPct.toFixed(1) + '% / ' + cls.metaPct + '%'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: diffColor, fontFamily: F.mono }}>
                  {cls.diff > 0 ? '+' : ''}{cls.diff.toFixed(1) + '%'}
                </Text>
              </View>
            </View>
          </View>
          {renderBar(cls.atualPct, cls.metaPct, cls.color, 12)}
        </TouchableOpacity>

        {isExp ? (
          <View style={{ marginTop: 2 }}>
            {isEditing ? renderTotalBar(subTotalPct, cls.flat ? 'Total tickers em ' + cls.label : cls.hasCaps ? 'Total caps em ' + cls.label : 'Total setores em ' + cls.label) : null}
            {cls.flat ? (
              cls.tickers.map(function (t) { return renderTickerRow(t, cls.key, '_flat', 16); })
            ) : cls.hasCaps ? (
              cls.capGroups.map(function (cg) { return renderCapRow(cg); })
            ) : (
              cls.sectors.map(function (s) { return renderSectorRow(s, cls.key); })
            )}
          </View>
        ) : null}
      </View>
    );
  }

  // ── Classify badge for add ticker ──
  var addClassified = newTicker.trim().length >= 3 ? classifyTicker(newTicker, positions, expandedClass) : null;

  return (
    <View style={{ gap: 10 }}>
      {/* ── HEADER CARD ── */}
      <Glass glow padding={14}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.sectionTitle}>REBALANCEAMENTO</Text>
            <TouchableOpacity onPress={function() { setRebalInfoModal({ title: 'Rebalanceamento', text: 'Defina metas de alocação por classe, setor e ativo. O sistema calcula os ajustes necessários para equilibrar a carteira.' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <TouchableOpacity onPress={function () {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowProfiles(!showProfiles);
            }}>
              <Text style={{ fontSize: 11, color: C.opcoes, fontWeight: '600', fontFamily: F.mono }}>
                {showProfiles ? '✕ Fechar' : '⚡ Perfil'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function () {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              if (isEditing && userId) {
                // Save to DB when closing edit mode (embed capTargets in sector_targets._cap)
                setSaving(true);
                var stToSave = {};
                Object.keys(sectorTargets).forEach(function (k) { stToSave[k] = sectorTargets[k]; });
                stToSave._cap = capTargets;
                upsertRebalanceTargets(userId, {
                  class_targets: classTargets,
                  sector_targets: stToSave,
                  ticker_targets: tickerTargets,
                }).then(function () { setSaving(false); }).catch(function () { setSaving(false); });
              }
              setEditing(!isEditing);
              if (showProfiles) setShowProfiles(false);
            }}>
              <Text style={{ fontSize: 11, color: C.accent, fontWeight: '600', fontFamily: F.mono }}>
                {isSaving ? '...' : isEditing ? '✓ Salvar' : '✎ Editar metas'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile picker */}
        {showProfiles ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, marginBottom: 8 }}>
              REBALANCEAMENTO AUTOMATICO POR PERFIL
            </Text>
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, marginBottom: 10 }}>
              Selecione seu perfil de investidor para preencher automaticamente todas as metas de classe, setor e ticker.
            </Text>
            {['conservador', 'moderado', 'arrojado'].map(function (pKey) {
              var p = PROFILES[pKey];
              return (
                <TouchableOpacity key={pKey} onPress={function () { applyProfile(pKey); }}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: C.border + '30',
                    marginBottom: 6 }}>
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{p.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{p.label}</Text>
                    <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body, marginTop: 2 }}>{p.desc}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                      {['acao', 'fii', 'etf', 'rf'].map(function (cat) {
                        return (
                          <View key={cat} style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
                            backgroundColor: (PRODUCT_COLORS[cat] || C.accent) + '15' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: PRODUCT_COLORS[cat] || C.accent, fontFamily: F.mono }}>
                              {(CAT_NAMES_FULL[cat] || cat).substring(0, 5).toUpperCase() + ' ' + p.classes[cat] + '%'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                  <Text style={{ fontSize: 16, color: C.accent, fontFamily: F.mono }}>→</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {/* Accuracy gauge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: accColor + '40',
            justifyContent: 'center', alignItems: 'center', backgroundColor: accColor + '08' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: accColor, fontFamily: F.display }}>
              {Math.round(accuracy)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.body }}>
              {accuracy >= 95 ? 'Carteira alinhada' : accuracy >= 80 ? 'Pequeno ajuste necessario' : 'Rebalanceamento recomendado'}
            </Text>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>
              {'Precisao de alinhamento: ' + Math.round(accuracy) + '%'}
            </Text>
          </View>
        </View>

        {isEditing ? renderTotalBar(totalClassPct, 'Total metas por classe') : null}

        {/* Centralized add ticker */}
        {isEditing ? (
          <View style={{ marginTop: 6 }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 4 }}>ADICIONAR ATIVO</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 32, borderRadius: 8,
                borderWidth: 1, borderColor: C.accent + '30', backgroundColor: C.accent + '06', paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, marginRight: 6 }}>+</Text>
                <TextInput
                  style={{ flex: 1, height: 32, color: C.text, fontSize: 12, fontFamily: F.mono, paddingVertical: 0 }}
                  value={newTicker}
                  onChangeText={function (v) { setNewTicker(v); }}
                  placeholder="Ticker (ex: ITUB4, HGLG11, IVVB11)"
                  placeholderTextColor={C.dim}
                  autoCapitalize="characters"
                  maxLength={10}
                />
              </View>
              <TouchableOpacity onPress={addTickerCentralized}
                style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.accent + '20',
                  borderWidth: 1, borderColor: C.accent + '40', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, color: C.accent, fontWeight: '700', fontFamily: F.mono }}>Adicionar</Text>
              </TouchableOpacity>
            </View>
            {addClassified ? (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                  backgroundColor: (PRODUCT_COLORS[addClassified.classe] || C.accent) + '20' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: PRODUCT_COLORS[addClassified.classe] || C.accent, fontFamily: F.mono }}>
                    {(CAT_NAMES_FULL[addClassified.classe] || addClassified.classe).toUpperCase()}
                  </Text>
                </View>
                {addClassified.setor ? (
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{addClassified.setor}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Glass>

      {/* ── ACCORDION ROWS ── */}
      <Glass padding={10}>
        {tree.map(function (cls) { return renderClassRow(cls); })}
      </Glass>

      {/* ── APORTE + SUGESTOES ── */}
      <Glass padding={14}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, marginBottom: 10 }}>SIMULAR APORTE</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: 10,
            borderWidth: 1, borderColor: C.accent + '30', backgroundColor: C.accent + '06', paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.mono, marginRight: 6 }}>R$</Text>
            <TextInput
              style={{ flex: 1, height: 38, color: C.text, fontSize: 15, fontFamily: F.mono, paddingVertical: 0, fontWeight: '700' }}
              value={aporteText}
              onChangeText={function (v) { setAporteText(maskCurrency(v)); setSuggestions(null); }}
              placeholder="0"
              placeholderTextColor={C.dim}
              keyboardType="numeric"
              maxLength={15}
            />
          </View>
          <TouchableOpacity onPress={function () {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            computeSuggestions();
          }}
            style={{ height: 38, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.accent,
              justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700', fontFamily: F.display }}>Ver sugestoes</Text>
          </TouchableOpacity>
        </View>

        {suggestions ? (
          <View style={{ marginTop: 14 }}>
            {suggestions.items.length === 0 ? (
              <View style={{ padding: 12, borderRadius: 8, backgroundColor: C.green + '08' }}>
                <Text style={{ fontSize: 12, color: C.green, fontFamily: F.body, fontWeight: '600' }}>
                  Carteira já está alinhada com as metas!
                </Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 4 }}>
                  Nenhuma compra necessaria para atingir os alvos.
                </Text>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display }}>
                    {'Sugestao para R$ ' + fmt(suggestions.aporte)}
                  </Text>
                  {suggestions.sobra > 1 ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: C.yellow + '15' }}>
                      <Text style={{ fontSize: 9, color: C.yellow, fontWeight: '600', fontFamily: F.mono }}>
                        {'Sobra: R$ ' + fmt(suggestions.sobra)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {suggestions.items.map(function (item, idx) {
                  return (
                    <View key={item.key + '_' + idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
                      borderBottomWidth: idx < suggestions.items.length - 1 ? 1 : 0, borderBottomColor: C.border + '30' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color, marginRight: 8 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>{item.label}</Text>
                        {item.setor ? (
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{item.classe + ' / ' + item.setor}</Text>
                        ) : (
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{item.classe}</Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: C.green, fontFamily: F.mono }}>
                          {'R$ ' + fmt(item.valor)}
                        </Text>
                        {item.cotas > 0 ? (
                          <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono }}>
                            {item.cotas + ' cotas x R$ ' + fmt(item.preco)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border + '40',
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Total alocado</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.text, fontFamily: F.mono }}>
                    {'R$ ' + fmt(suggestions.aporte - suggestions.sobra)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </Glass>
      <Modal visible={rebalInfoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setRebalInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setRebalInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {rebalInfoModal && rebalInfoModal.title || ''}
            </Text>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
              {rebalInfoModal && rebalInfoModal.text || ''}
            </Text>
            <TouchableOpacity onPress={function() { setRebalInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ═══════════ INLINE SVG: Proventos Bar Chart ═══════════

// ═══════════ INLINE SVG: Proventos Monthly Bar Chart (with ticker detail) ═══════════

function ProvMonthlyBarChart(props) {
  var data = props.data || [];
  var maxVal = props.maxVal || 1;
  var color = props.color || C.fiis;
  var height = props.height || 200;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect || function() {};
  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  if (data.length === 0 || w === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: 1 }} />;
  }

  var padL = 38;
  var padR = 6;
  var padTop = 18;
  var padBot = 32;
  var chartW = w - padL - padR;
  var chartH = height - padTop - padBot;
  var barGap = 4;
  var barW = (chartW - barGap * (data.length - 1)) / data.length;
  if (barW > 32) barW = 32;
  var totalBarsW = data.length * barW + (data.length - 1) * barGap;
  var offsetX = padL + (chartW - totalBarsW) / 2;
  var slotW = data.length > 0 ? chartW / data.length : 0;

  function handleTouch(e) {
    if (chartW <= 0 || data.length === 0) return;
    var x = e.nativeEvent.locationX - padL;
    var idx = Math.floor(x / slotW);
    if (idx < 0) idx = 0;
    if (idx >= data.length) idx = data.length - 1;
    onSelect(idx === selected ? -1 : idx);
  }

  // Y-axis grid
  var gridLevels = [0, maxVal * 0.5, maxVal];

  // Selected bar ticker tooltip
  var selD = selected >= 0 && selected < data.length ? data[selected] : null;
  var selTickers = selD && selD.tickers ? selD.tickers : [];
  var maxTip = 5; // max tickers shown in tooltip

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <TouchableOpacity activeOpacity={1} onPress={handleTouch}>
        <Svg width={w} height={height}>
          {/* Grid lines + Y labels */}
          {gridLevels.map(function(gv, gi) {
            var gy = padTop + chartH - (maxVal > 0 ? (gv / maxVal) * chartH : 0);
            return (
              <G key={'g' + gi}>
                <SvgLine x1={padL} y1={gy} x2={w - padR} y2={gy}
                  stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
                <SvgText x={padL - 4} y={gy + 3} fill={C.dim}
                  fontSize={8} fontFamily={F.mono} textAnchor="end">
                  {fmtC(gv)}
                </SvgText>
              </G>
            );
          })}
          {/* Bars */}
          {data.map(function(d, i) {
            var isSelected = i === selected;
            var bx = offsetX + i * (barW + barGap);
            var bh = maxVal > 0 ? (d.value / maxVal) * chartH : 0;
            bh = Math.max(bh, 1);
            var by = padTop + chartH - bh;
            var barOpacity = selected === -1 ? 0.7 : (isSelected ? 1 : 0.3);
            return (
              <G key={'b' + i}>
                <SvgRect x={bx} y={by} width={barW} height={bh}
                  rx={3} fill={color} opacity={barOpacity} />
                {/* Value on top */}
                {d.value > 0 && (selected === -1 || isSelected) ? (
                  <SvgText x={bx + barW / 2} y={by - 4} fill={C.green}
                    fontSize={7} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                    {d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : fmt(d.value)}
                  </SvgText>
                ) : null}
                {/* Month label */}
                <SvgText x={bx + barW / 2} y={height - padBot + 12}
                  fill={isSelected ? C.text : C.sub}
                  fontSize={8} fontFamily={F.mono} textAnchor="middle"
                  fontWeight={isSelected ? '600' : '400'}>
                  {d.month}
                </SvgText>
              </G>
            );
          })}

          {/* Ticker detail tooltip next to selected bar */}
          {selD && selTickers.length > 0 ? (function() {
            var tipLineH = 16;
            var tipCount = Math.min(selTickers.length, maxTip);
            var tipH = tipLineH * tipCount + 10;
            var tipW = 130;
            var selBx = offsetX + selected * (barW + barGap);
            var selBy = padTop + chartH - (maxVal > 0 ? (selD.value / maxVal) * chartH : 0);
            // Position tooltip to the right of bar, or left if near edge
            var tipX = selBx + barW + 6;
            if (tipX + tipW > w - padR) tipX = selBx - tipW - 6;
            if (tipX < padL) tipX = padL;
            var tipY = selBy - tipH / 2;
            if (tipY < 2) tipY = 2;
            if (tipY + tipH > height - padBot) tipY = height - padBot - tipH;

            var tipEls = [];
            tipEls.push(
              <SvgRect key="tip-bg" x={tipX} y={tipY} width={tipW} height={tipH}
                rx={6} fill={C.surface} opacity={0.95} />
            );
            for (var ti = 0; ti < tipCount; ti++) {
              var tk = selTickers[ti];
              tipEls.push(
                <SvgText key={'tt-' + ti} x={tipX + 8} y={tipY + 14 + ti * tipLineH}
                  fill={C.text} fontSize={10} fontFamily={F.mono} fontWeight="500">
                  {tk.ticker}
                </SvgText>
              );
              tipEls.push(
                <SvgText key={'tv-' + ti} x={tipX + tipW - 8} y={tipY + 14 + ti * tipLineH}
                  fill={C.green} fontSize={10} fontFamily={F.mono} fontWeight="600" textAnchor="end">
                  {'R$ ' + fmt(tk.value)}
                </SvgText>
              );
            }
            if (selTickers.length > maxTip) {
              tipEls.push(
                <SvgText key="tt-more" x={tipX + tipW / 2} y={tipY + tipH - 2}
                  fill={C.dim} fontSize={8} fontFamily={F.mono} textAnchor="middle">
                  {'+' + (selTickers.length - maxTip) + ' mais'}
                </SvgText>
              );
            }
            return tipEls;
          })() : null}
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════ INLINE SVG: Annual Bar Chart (with Y-axis + selection) ═══════════

function AnnualBarChart(props) {
  var data = props.data || [];
  var maxVal = props.maxVal || 1;
  var color = props.color || C.accent;
  var height = props.height || 180;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect || function() {};
  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  if (data.length === 0 || w === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: 1 }} />;
  }

  var padL = 42;
  var padR = 10;
  var padTop = 22;
  var padBot = 32;
  var chartW = w - padL - padR;
  var chartH = height - padTop - padBot;
  var barGap = data.length > 6 ? 6 : 10;
  var barW = (chartW - barGap * (data.length - 1)) / data.length;
  if (barW > 48) barW = 48;
  var totalBarsW = data.length * barW + (data.length - 1) * barGap;
  var offsetX = padL + (chartW - totalBarsW) / 2;
  var slotW = data.length > 0 ? chartW / data.length : 0;

  function handleTouch(e) {
    if (chartW <= 0 || data.length === 0) return;
    var x = e.nativeEvent.locationX - padL;
    var idx = Math.floor(x / slotW);
    if (idx < 0) idx = 0;
    if (idx >= data.length) idx = data.length - 1;
    onSelect(idx === selected ? -1 : idx);
  }

  // Y-axis grid (4 levels)
  var gridLevels = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <TouchableOpacity activeOpacity={1} onPress={handleTouch}>
        <Svg width={w} height={height}>
          {/* Grid lines + Y labels */}
          {gridLevels.map(function(gv, gi) {
            var gy = padTop + chartH - (maxVal > 0 ? (gv / maxVal) * chartH : 0);
            return (
              <G key={'ag' + gi}>
                <SvgLine x1={padL} y1={gy} x2={w - padR} y2={gy}
                  stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
                <SvgText x={padL - 4} y={gy + 3} fill={C.dim}
                  fontSize={8} fontFamily={F.mono} textAnchor="end">
                  {gv >= 1000 ? (gv / 1000).toFixed(0) + 'k' : fmtC(gv)}
                </SvgText>
              </G>
            );
          })}
          {/* Bars */}
          {data.map(function(d, i) {
            var isSelected = i === selected;
            var bx = offsetX + i * (barW + barGap);
            var bh = maxVal > 0 ? (d.value / maxVal) * chartH : 0;
            bh = Math.max(bh, 1);
            var by = padTop + chartH - bh;
            var barOpacity = selected === -1 ? 0.7 : (isSelected ? 1 : 0.3);

            // Tooltip
            var tipH = 16;
            var tipW = 78;
            var tipY = by - tipH - 4;
            if (tipY < 0) tipY = 0;

            return (
              <G key={'ab' + i}>
                <SvgRect x={bx} y={by} width={barW} height={bh}
                  rx={4} fill={color} opacity={barOpacity} />
                {/* Value on top (hide when selected to avoid overlap with tooltip) */}
                {d.value > 0 && selected === -1 ? (
                  <SvgText x={bx + barW / 2} y={by - 4} fill={C.green}
                    fontSize={8} fontFamily={F.mono} fontWeight="700" textAnchor="middle">
                    {d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : fmt(d.value)}
                  </SvgText>
                ) : null}
                {/* Selected tooltip */}
                {isSelected && d.value > 0 ? (
                  <G>
                    <SvgRect x={bx + barW / 2 - tipW / 2} y={tipY}
                      width={tipW} height={tipH + 2} rx={5} fill={C.surface} opacity={0.95} />
                    <SvgText x={bx + barW / 2} y={tipY + 12} fill={C.green}
                      fontSize={11} fontFamily={F.mono} fontWeight="700" textAnchor="middle">
                      {'R$ ' + fmt(d.value)}
                    </SvgText>
                  </G>
                ) : null}
                {/* Year label */}
                <SvgText x={bx + barW / 2} y={height - padBot + 14}
                  fill={isSelected ? C.text : C.sub}
                  fontSize={9} fontFamily={F.mono} textAnchor="middle"
                  fontWeight={isSelected ? '700' : '400'}>
                  {d.month}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════ INLINE SVG: Simple Vertical Bar Chart (generic) ═══════════

function ProvVertBarChart(props) {
  var data = props.data || [];
  var maxVal = props.maxVal || 1;
  var color = props.color || C.fiis;
  var height = props.height || 200;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var _sel = useState(-1); var sel = _sel[0]; var setSel = _sel[1];

  if (data.length === 0 || w === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: 1 }} />;
  }

  var padL = 40;
  var padR = 10;
  var padTop = 14;
  var padBot = 34;
  var chartW = w - padL - padR;
  var chartH = height - padTop - padBot;
  var barGap = 3;
  var barW = (chartW - barGap * (data.length - 1)) / data.length;
  if (barW > 28) barW = 28;
  var totalBarsW = data.length * barW + (data.length - 1) * barGap;
  var offsetX = padL + (chartW - totalBarsW) / 2;

  // Y axis labels
  var ySteps = [0, 0.25, 0.5, 0.75, 1];
  var fmtY = function(v) {
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (v >= 100) return v.toFixed(0);
    return v.toFixed(0);
  };

  // Touch handler
  var onBarPress = function(idx) {
    setSel(sel === idx ? -1 : idx);
  };

  // Selected bar detail
  var selData = sel >= 0 && sel < data.length ? data[sel] : null;
  var selTickers = selData && selData.tickers ? selData.tickers : {};
  var selTickerKeys = Object.keys(selTickers).sort(function(a, b) { return selTickers[b] - selTickers[a]; });

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={height}>
        <Defs>
          <SvgLinearGradient id="provBarGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.9" />
            <Stop offset="1" stopColor={color} stopOpacity="0.4" />
          </SvgLinearGradient>
          <SvgLinearGradient id="provBarGradSel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.green} stopOpacity="1" />
            <Stop offset="1" stopColor={C.green} stopOpacity="0.5" />
          </SvgLinearGradient>
        </Defs>
        {/* Grid lines + Y labels */}
        {ySteps.map(function(pct, gi) {
          var gy = padTop + chartH * (1 - pct);
          var yVal = maxVal * pct;
          return (
            <G key={'g' + gi}>
              <SvgLine x1={padL} y1={gy} x2={w - padR} y2={gy}
                stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
              <SvgText x={padL - 6} y={gy + 3} fill="rgba(255,255,255,0.2)"
                fontSize={8} fontFamily={F.mono} textAnchor="end">
                {fmtY(yVal)}
              </SvgText>
            </G>
          );
        })}
        {/* Bars */}
        {data.map(function(d, i) {
          var bx = offsetX + i * (barW + barGap);
          var bh = maxVal > 0 ? (d.value / maxVal) * chartH : 0;
          bh = Math.max(bh, d.value > 0 ? 3 : 1);
          var by = padTop + chartH - bh;
          var isSel = sel === i;
          var isAny = sel >= 0;
          return (
            <G key={i} onPress={function() { onBarPress(i); }}>
              {/* Touch area */}
              <SvgRect x={bx - barGap / 2} y={padTop} width={barW + barGap} height={chartH + padBot}
                fill="transparent" onPress={function() { onBarPress(i); }} />
              {/* Bar */}
              <SvgRect x={bx} y={by} width={barW} height={bh}
                rx={barW / 2 > 6 ? 6 : barW / 2}
                fill={isSel ? 'url(#provBarGradSel)' : 'url(#provBarGrad)'}
                opacity={isAny && !isSel ? 0.3 : 1} />
              {/* Glow on selected */}
              {isSel ? (
                <SvgRect x={bx - 1} y={by - 1} width={barW + 2} height={bh + 2}
                  rx={barW / 2 > 6 ? 7 : barW / 2 + 1}
                  fill="none" stroke={C.green} strokeWidth={1.5} strokeOpacity={0.4} />
              ) : null}
              {/* Value on top */}
              {d.value > 0 ? (
                <SvgText x={bx + barW / 2} y={by - 6} fill={isSel ? C.green : 'rgba(255,255,255,0.5)'}
                  fontSize={8} fontFamily={F.mono} fontWeight="700" textAnchor="middle">
                  {d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : fmt(d.value)}
                </SvgText>
              ) : null}
              {/* Month label (split month / year) */}
              <SvgText x={bx + barW / 2} y={height - padBot + 12} fill={isSel ? C.text : 'rgba(255,255,255,0.55)'}
                fontSize={9} fontFamily={F.mono} fontWeight={isSel ? '700' : '500'} textAnchor="middle">
                {d.month.split('/')[0]}
              </SvgText>
              {d.month.indexOf('/') >= 0 && (i === 0 || d.month.split('/')[1] !== data[i - 1].month.split('/')[1]) ? (
                <SvgText x={bx + barW / 2} y={height - padBot + 23} fill={isSel ? C.text : 'rgba(255,255,255,0.3)'}
                  fontSize={8} fontFamily={F.mono} fontWeight="400" textAnchor="middle">
                  {d.month.split('/')[1]}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {/* Selection indicator line */}
        {sel >= 0 && sel < data.length ? (
          <SvgLine
            x1={offsetX + sel * (barW + barGap) + barW / 2}
            y1={padTop}
            x2={offsetX + sel * (barW + barGap) + barW / 2}
            y2={padTop + chartH}
            stroke={C.green} strokeWidth={0.5} strokeOpacity={0.3}
            strokeDasharray="3,3"
          />
        ) : null}
      </Svg>

      {/* Detail panel when bar is selected */}
      {selData && selTickerKeys.length > 0 ? (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>
              {selData.month}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.green, fontFamily: F.mono }}>
              {'R$ ' + fmt(selData.value)}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
          {selTickerKeys.map(function(tk, idx) {
            var tkVal = selTickers[tk];
            var tkPct = selData.value > 0 ? (tkVal / selData.value * 100).toFixed(0) : '0';
            return (
              <View key={tk} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.mono }}>{tk}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: F.mono }}>{tkPct + '%'}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                    {'R$ ' + fmt(tkVal)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ═══════════ INLINE SVG: P&L Bar Chart (positive/negative) ═══════════

function PLBarChart(props) {
  var data = props.data || [];
  var height = props.height || 220;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect || function() {};
  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  if (data.length === 0 || w === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: 1 }} />;
  }

  var padL = 48;
  var padR = 10;
  var padTop = 20;
  var padBot = 36;
  var chartW = w - padL - padR;
  var chartH = height - padTop - padBot;
  var barGap = 3;
  var barW = (chartW - barGap * (data.length - 1)) / data.length;
  if (barW > 28) barW = 28;
  var totalBarsW = data.length * barW + (data.length - 1) * barGap;
  var offsetX = padL + (chartW - totalBarsW) / 2;

  // Find max absolute value
  var maxAbs = 1;
  for (var mi = 0; mi < data.length; mi++) {
    if (Math.abs(data[mi].pl) > maxAbs) maxAbs = Math.abs(data[mi].pl);
  }
  // Add 15% padding
  maxAbs = maxAbs * 1.15;

  var zeroY = padTop + chartH / 2;

  // Y axis: ±max, ±half, zero
  var yLevels = [
    { val: maxAbs, label: fmtCompact(maxAbs) },
    { val: maxAbs / 2, label: fmtCompact(maxAbs / 2) },
    { val: 0, label: '0' },
    { val: -maxAbs / 2, label: fmtCompact(-maxAbs / 2) },
    { val: -maxAbs, label: fmtCompact(-maxAbs) },
  ];

  function valToY(v) {
    return zeroY - (v / maxAbs) * (chartH / 2);
  }

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={height}>
        {/* Grid lines + Y labels */}
        {yLevels.map(function(yl, gi) {
          var gy = valToY(yl.val);
          return (
            <G key={'g' + gi}>
              <SvgLine x1={padL} y1={gy} x2={w - padR} y2={gy}
                stroke={yl.val === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)'}
                strokeWidth={yl.val === 0 ? 1 : 0.5} />
              <SvgText x={padL - 6} y={gy + 3} fill="rgba(255,255,255,0.25)"
                fontSize={8} fontFamily={F.mono} textAnchor="end">
                {yl.label}
              </SvgText>
            </G>
          );
        })}
        {/* Bars */}
        {data.map(function(d, i) {
          var bx = offsetX + i * (barW + barGap);
          var isPos = d.pl >= 0;
          var bh = maxAbs > 0 ? (Math.abs(d.pl) / maxAbs) * (chartH / 2) : 0;
          bh = Math.max(bh, d.pl !== 0 ? 3 : 1);
          var by = isPos ? zeroY - bh : zeroY;
          var barColor = isPos ? C.green : C.red;
          var isSel = selected === i;
          var isAny = selected >= 0;
          return (
            <G key={i}>
              {/* Touch area */}
              <SvgRect x={bx - barGap / 2} y={padTop} width={barW + barGap} height={chartH + padBot}
                fill="transparent" onPress={function() { onSelect(isSel ? -1 : i); }} />
              {/* Bar */}
              <SvgRect x={bx} y={by} width={barW} height={bh}
                rx={barW / 2 > 5 ? 5 : barW / 2}
                fill={barColor}
                fillOpacity={isSel ? 0.9 : (isAny ? 0.25 : 0.6)} />
              {/* Glow on selected */}
              {isSel ? (
                <SvgRect x={bx - 1} y={by - 1} width={barW + 2} height={bh + 2}
                  rx={barW / 2 > 5 ? 6 : barW / 2 + 1}
                  fill="none" stroke={barColor} strokeWidth={1.5} strokeOpacity={0.5} />
              ) : null}
              {/* Value on top/bottom */}
              {d.pl !== 0 ? (
                <SvgText x={bx + barW / 2} y={isPos ? by - 5 : by + bh + 11}
                  fill={isSel ? barColor : 'rgba(255,255,255,0.4)'}
                  fontSize={7} fontFamily={F.mono} fontWeight="700" textAnchor="middle">
                  {fmtCompact(d.pl)}
                </SvgText>
              ) : null}
              {/* X label */}
              <SvgText x={bx + barW / 2} y={height - padBot + 12}
                fill={isSel ? C.text : 'rgba(255,255,255,0.45)'}
                fontSize={8} fontFamily={F.mono} fontWeight={isSel ? '700' : '400'} textAnchor="middle">
                {(d.label || '').split('/')[0]}
              </SvgText>
              {(d.label || '').indexOf('/') >= 0 && (i === 0 || (d.label || '').split('/')[1] !== (data[i - 1].label || '').split('/')[1]) ? (
                <SvgText x={bx + barW / 2} y={height - padBot + 23}
                  fill={isSel ? C.text : 'rgba(255,255,255,0.25)'}
                  fontSize={7} fontFamily={F.mono} fontWeight="400" textAnchor="middle">
                  {(d.label || '').split('/')[1]}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>

      {/* Detail panel when bar is selected */}
      {selected >= 0 && selected < data.length ? (function() {
        var sd = data[selected];
        var sdTickers = sd.tickers || {};
        var sdKeys = Object.keys(sdTickers).sort(function(a, b) { return Math.abs(sdTickers[b]) - Math.abs(sdTickers[a]); });
        var sdIsPos = sd.pl >= 0;
        return (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>{sd.label}</Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{String(sd.count) + ' venda(s)'}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: sdIsPos ? C.green : C.red, fontFamily: F.mono }}>
                {sdIsPos ? '+' : ''}{'R$ ' + fmt(sd.pl)}
              </Text>
            </View>
            {sdKeys.length > 0 ? (
              <>
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
                {sdKeys.map(function(tk) {
                  var tkVal = sdTickers[tk];
                  var tkPos = tkVal >= 0;
                  return (
                    <View key={tk} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tkPos ? C.green : C.red }} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: F.mono }}>{tk}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: tkPos ? C.green : C.red, fontFamily: F.mono }}>
                        {tkPos ? '+' : ''}{'R$ ' + fmt(tkVal)}
                      </Text>
                    </View>
                  );
                })}
              </>
            ) : null}
          </View>
        );
      })() : null}
    </View>
  );
}

function fmtCompact(v) {
  var abs = Math.abs(v);
  var sign = v < 0 ? '-' : '';
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'k';
  if (abs === 0) return '0';
  return sign + abs.toFixed(0);
}

// ═══════════ INLINE SVG: Premio vs Recompra Line Chart ═══════════

function PremioVsRecompraChart(props) {
  var data = props.data || [];
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var _selPut = useState(-1); var selPut = _selPut[0]; var setSelPut = _selPut[1];
  var _selCall = useState(-1); var selCall = _selCall[0]; var setSelCall = _selCall[1];
  var _selPL = useState(-1); var selPL = _selPL[0]; var setSelPL = _selPL[1];
  var _selPrem = useState(-1); var selPrem = _selPrem[0]; var setSelPrem = _selPrem[1];
  var _selRec = useState(-1); var selRec = _selRec[0]; var setSelRec = _selRec[1];
  var _selExerc = useState(-1); var selExerc = _selExerc[0]; var setSelExerc = _selExerc[1];

  if (data.length === 0) return null;

  var n = data.length;
  var subH = 150;
  var topPad = 22;
  var botPad = 24;
  var leftPad = 42;
  var rightPad = 8;

  if (w === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: 1 }} />;
  }

  var drawH = subH - topPad - botPad;
  var drawW = w - leftPad - rightPad;

  // ── Helper: build a sub-chart ──
  function buildSubChart(prefix, series, sel, tipLines, titleLabel) {
    // Compute range
    var maxV = 1;
    var minV = 0;
    for (var si = 0; si < series.length; si++) {
      var s = series[si];
      for (var di = 0; di < n; di++) {
        var v = s.vals[di];
        if (v > maxV) maxV = v;
        if (v < minV) minV = v;
      }
    }
    var range = maxV - minV;
    if (range === 0) range = 1;

    var vToY = function(v) { return topPad + drawH - ((v - minV) / range) * drawH; };
    var iToX = function(i) { return leftPad + (n > 1 ? (i / (n - 1)) * drawW : drawW / 2); };

    var els = [];

    // Grid
    var gridVals = [];
    if (minV < 0) {
      gridVals = [minV, 0, maxV];
    } else {
      gridVals = [0, maxV * 0.5, maxV];
    }
    for (var gi = 0; gi < gridVals.length; gi++) {
      var gy = vToY(gridVals[gi]);
      var isZero = gridVals[gi] === 0 && minV < 0;
      els.push(React.createElement(SvgLine, {
        key: prefix + 'g' + gi, x1: leftPad, y1: gy, x2: w - rightPad, y2: gy,
        stroke: isZero ? C.sub : C.border, strokeWidth: isZero ? 0.8 : 0.5, strokeDasharray: isZero ? '' : '3,3',
      }));
      els.push(React.createElement(SvgText, {
        key: prefix + 'gl' + gi, x: leftPad - 4, y: gy + 3,
        fill: C.dim, fontSize: 7, fontFamily: F.mono, textAnchor: 'end',
      }, fmtC(gridVals[gi])));
    }

    // Series
    for (var si2 = 0; si2 < series.length; si2++) {
      var s2 = series[si2];
      var pts = [];
      for (var pi = 0; pi < n; pi++) {
        pts.push({ x: iToX(pi), y: vToY(s2.vals[pi]), val: s2.vals[pi] });
      }

      // Area fill
      if (s2.area && pts.length >= 2) {
        var baseY = vToY(0);
        var ap = 'M' + pts[0].x + ',' + baseY;
        for (var a = 0; a < pts.length; a++) ap = ap + ' L' + pts[a].x + ',' + pts[a].y;
        ap = ap + ' L' + pts[pts.length - 1].x + ',' + baseY + ' Z';
        els.push(React.createElement(Path, { key: prefix + 's' + si2 + 'a', d: ap, fill: s2.color, opacity: 0.1 }));
      }

      // Line
      if (pts.length >= 2) {
        var lp = 'M' + pts[0].x + ',' + pts[0].y;
        for (var l = 1; l < pts.length; l++) lp = lp + ' L' + pts[l].x + ',' + pts[l].y;
        els.push(React.createElement(Path, {
          key: prefix + 's' + si2 + 'l', d: lp,
          stroke: s2.color, strokeWidth: 3, fill: 'none', opacity: 0.9,
        }));
      }

      // Dots
      for (var d = 0; d < pts.length; d++) {
        if (pts[d].val !== 0) {
          var isSel = d === sel;
          els.push(React.createElement(Circle, {
            key: prefix + 's' + si2 + 'dg' + d, cx: pts[d].x, cy: pts[d].y,
            r: isSel ? 6 : 3.5, fill: s2.color, opacity: isSel ? 0.25 : 0.15,
          }));
          els.push(React.createElement(Circle, {
            key: prefix + 's' + si2 + 'dd' + d, cx: pts[d].x, cy: pts[d].y,
            r: isSel ? 4 : 2, fill: s2.color, opacity: 1,
          }));
        }
      }
    }

    // Vertical line on selection (tooltip rendered as native View outside SVG)
    if (sel >= 0 && sel < n) {
      var selX = iToX(sel);
      els.push(React.createElement(SvgLine, {
        key: prefix + 'vl', x1: selX, y1: topPad, x2: selX, y2: topPad + drawH,
        stroke: C.text, strokeWidth: 0.8, opacity: 0.35, strokeDasharray: '4,3',
      }));
    }

    // X-axis labels
    for (var xi = 0; xi < n; xi++) {
      var showXL = n <= 12 || xi % Math.ceil(n / 8) === 0 || xi === n - 1;
      if (showXL) {
        var xSel = xi === sel;
        var mp = (data[xi].month || '').split('/');
        els.push(React.createElement(SvgText, {
          key: prefix + 'x' + xi, x: iToX(xi), y: subH - 4,
          fontSize: 7, fill: xSel ? C.text : C.dim, fontFamily: F.mono, textAnchor: 'middle',
          fontWeight: xSel ? '600' : '400',
        }, mp[0] || ''));
      }
    }

    return els;
  }

  // ── Data extraction ──
  var putVals = []; var putRecompVals = [];
  var callVals = []; var callRecompVals = [];
  var plPutVals = []; var plCallVals = [];
  var sumPutPrem = 0; var sumPutRecomp = 0;
  var sumCallPrem = 0; var sumCallRecomp = 0;
  for (var i = 0; i < n; i++) {
    var d = data[i];
    var pv = d.put || 0;
    var prp = d.recompra_put || 0;
    var cv = d.call || 0;
    var prc = d.recompra_call || 0;
    putVals.push(pv); putRecompVals.push(prp);
    callVals.push(cv); callRecompVals.push(prc);
    plPutVals.push(pv - prp); plCallVals.push(cv - prc);
    sumPutPrem += pv; sumPutRecomp += prp;
    sumCallPrem += cv; sumCallRecomp += prc;
  }
  var sumPutPL = sumPutPrem - sumPutRecomp;
  var sumCallPL = sumCallPrem - sumCallRecomp;

  // ── Touch handlers ──
  function makeTouch(sel, setSel) {
    return function(e) {
      if (drawW <= 0 || n === 0) return;
      var x = e.nativeEvent.locationX - leftPad;
      var step = n > 1 ? drawW / (n - 1) : drawW;
      var idx = Math.round(x / step);
      if (idx < 0) idx = 0;
      if (idx >= n) idx = n - 1;
      setSel(idx === sel ? -1 : idx);
    };
  }

  // ── Build 3 charts ──
  var putEls = buildSubChart('put_', [
    { vals: putVals, color: C.green, area: true },
    { vals: putRecompVals, color: C.red, area: false },
  ], selPut, function(idx) {
    var prem = putVals[idx]; var rec = putRecompVals[idx]; var pl = prem - rec;
    var lines = [{ text: 'Prêmio R$ ' + fmt(prem), color: C.green }];
    lines.push({ text: 'Recompra R$ ' + fmt(rec), color: C.red });
    lines.push({ text: 'P&L R$ ' + fmt(pl), color: pl >= 0 ? C.green : C.red });
    return lines;
  });

  var callEls = buildSubChart('call_', [
    { vals: callVals, color: C.green, area: true },
    { vals: callRecompVals, color: C.red, area: false },
  ], selCall, function(idx) {
    var prem = callVals[idx]; var rec = callRecompVals[idx]; var pl = prem - rec;
    var lines = [{ text: 'Prêmio R$ ' + fmt(prem), color: C.green }];
    lines.push({ text: 'Recompra R$ ' + fmt(rec), color: C.red });
    lines.push({ text: 'P&L R$ ' + fmt(pl), color: pl >= 0 ? C.green : C.red });
    return lines;
  });

  var plEls = buildSubChart('pl_', [
    { vals: plPutVals, color: C.opcoes, area: true },
    { vals: plCallVals, color: C.acoes, area: false },
  ], selPL, function(idx) {
    var pp = plPutVals[idx]; var pc = plCallVals[idx];
    return [
      { text: 'PUT R$ ' + fmt(pp), color: pp >= 0 ? C.green : C.red },
      { text: 'CALL R$ ' + fmt(pc), color: pc >= 0 ? C.green : C.red },
    ];
  });

  // ── Render helper: legend row ──
  function legendRow(items) {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 4 }}>
        {items.map(function(item, idx) {
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color }} />
              <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  // ── Render helper: KPI row ──
  function kpiRow(items) {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
        {items.map(function(item, idx) {
          var prefix = item.prefix != null ? item.prefix : 'R$ ';
          var display = item.prefix === '' ? String(Math.round(item.val)) : fmt(item.val);
          return (
            <View key={idx} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 8, color: C.sub, fontFamily: F.body }}>{item.label}</Text>
              <Text style={{ fontSize: 12, color: item.color, fontFamily: F.mono, fontWeight: '600' }}>
                {prefix + display}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  // ── Render helper: info bar (native View, shown when point selected) ──
  function infoBar(sel, items, monthLabel) {
    if (sel < 0 || sel >= n) return null;
    return (
      <View style={{ backgroundColor: C.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6, borderWidth: 0.5, borderColor: C.border }}>
        <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body, textAlign: 'center', marginBottom: 3 }}>
          {monthLabel}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {items.map(function(item, idx) {
            var prefix = item.prefix != null ? item.prefix : 'R$ ';
            var display = item.prefix === '' ? String(Math.round(item.val)) : fmt(item.val);
            return (
              <View key={idx} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>{item.label}</Text>
                <Text style={{ fontSize: 14, color: item.color, fontFamily: F.mono, fontWeight: '700' }}>
                  {prefix + display}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Info bar data for each chart ──
  var putInfoItems = null;
  var putMonthLabel = '';
  if (selPut >= 0 && selPut < n) {
    var piPrem = putVals[selPut]; var piRec = putRecompVals[selPut]; var piPL = piPrem - piRec;
    putMonthLabel = data[selPut].month || '';
    putInfoItems = [
      { label: 'Prêmio', val: piPrem, color: C.green },
      { label: 'Recompra', val: piRec, color: C.red },
      { label: 'P&L', val: piPL, color: piPL >= 0 ? C.green : C.red },
    ];
  }

  var callInfoItems = null;
  var callMonthLabel = '';
  if (selCall >= 0 && selCall < n) {
    var ciPrem = callVals[selCall]; var ciRec = callRecompVals[selCall]; var ciPL = ciPrem - ciRec;
    callMonthLabel = data[selCall].month || '';
    callInfoItems = [
      { label: 'Prêmio', val: ciPrem, color: C.green },
      { label: 'Recompra', val: ciRec, color: C.red },
      { label: 'P&L', val: ciPL, color: ciPL >= 0 ? C.green : C.red },
    ];
  }

  var plInfoItems = null;
  var plMonthLabel = '';
  if (selPL >= 0 && selPL < n) {
    var liPut = plPutVals[selPL]; var liCall = plCallVals[selPL];
    plMonthLabel = data[selPL].month || '';
    plInfoItems = [
      { label: 'PUT', val: liPut, color: liPut >= 0 ? C.green : C.red },
      { label: 'CALL', val: liCall, color: liCall >= 0 ? C.green : C.red },
    ];
  }

  // ── Chart 4: PRÊMIO — PUT vs CALL ──
  var premEls = buildSubChart('prem_', [
    { vals: putVals, color: C.opcoes, area: true },
    { vals: callVals, color: C.acoes, area: false },
  ], selPrem, function() { return []; });

  var premInfoItems = null;
  var premMonthLabel = '';
  if (selPrem >= 0 && selPrem < n) {
    premMonthLabel = data[selPrem].month || '';
    premInfoItems = [
      { label: 'PUT', val: putVals[selPrem], color: C.opcoes },
      { label: 'CALL', val: callVals[selPrem], color: C.acoes },
    ];
  }

  // ── Chart 5: RECOMPRA — PUT vs CALL ──
  var recEls = buildSubChart('rec_', [
    { vals: putRecompVals, color: C.opcoes, area: true },
    { vals: callRecompVals, color: C.acoes, area: false },
  ], selRec, function() { return []; });

  var recInfoItems = null;
  var recMonthLabel = '';
  if (selRec >= 0 && selRec < n) {
    recMonthLabel = data[selRec].month || '';
    recInfoItems = [
      { label: 'PUT', val: putRecompVals[selRec], color: C.opcoes },
      { label: 'CALL', val: callRecompVals[selRec], color: C.acoes },
    ];
  }

  // ── Chart 6: EXERCIDAS — PUT vs CALL ──
  var exercPutVals = []; var exercCallVals = [];
  var sumExercPut = 0; var sumExercCall = 0;
  for (var ei = 0; ei < n; ei++) {
    var ep = data[ei].exercida_put || 0;
    var ec = data[ei].exercida_call || 0;
    exercPutVals.push(ep);
    exercCallVals.push(ec);
    sumExercPut += ep;
    sumExercCall += ec;
  }

  var exercEls = buildSubChart('exerc_', [
    { vals: exercPutVals, color: C.opcoes, area: true },
    { vals: exercCallVals, color: C.acoes, area: false },
  ], selExerc, function() { return []; });

  var exercInfoItems = null;
  var exercMonthLabel = '';
  if (selExerc >= 0 && selExerc < n) {
    exercMonthLabel = data[selExerc].month || '';
    exercInfoItems = [
      { label: 'PUT', val: exercPutVals[selExerc], color: C.opcoes, prefix: '' },
      { label: 'CALL', val: exercCallVals[selExerc], color: C.acoes, prefix: '' },
    ];
  }

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      {/* Chart 1: PUT */}
      <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, textAlign: 'center', marginBottom: 4 }}>
        PUT — Prêmio vs Recompra
      </Text>
      {infoBar(selPut, putInfoItems, putMonthLabel)}
      <TouchableOpacity activeOpacity={1} onPress={makeTouch(selPut, setSelPut)}>
        <Svg width={w} height={subH}>{putEls}</Svg>
      </TouchableOpacity>
      {legendRow([{ label: 'Prêmio', color: C.green }, { label: 'Recompra', color: C.red }])}
      {kpiRow([
        { label: 'PRÊMIO', val: sumPutPrem, color: C.green },
        { label: 'RECOMPRA', val: sumPutRecomp, color: C.red },
        { label: 'P&L', val: sumPutPL, color: sumPutPL >= 0 ? C.green : C.red },
      ])}

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: C.border, marginVertical: 12, opacity: 0.4 }} />

      {/* Chart 2: CALL */}
      <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, textAlign: 'center', marginBottom: 4 }}>
        CALL — Prêmio vs Recompra
      </Text>
      {infoBar(selCall, callInfoItems, callMonthLabel)}
      <TouchableOpacity activeOpacity={1} onPress={makeTouch(selCall, setSelCall)}>
        <Svg width={w} height={subH}>{callEls}</Svg>
      </TouchableOpacity>
      {legendRow([{ label: 'Prêmio', color: C.green }, { label: 'Recompra', color: C.red }])}
      {kpiRow([
        { label: 'PRÊMIO', val: sumCallPrem, color: C.green },
        { label: 'RECOMPRA', val: sumCallRecomp, color: C.red },
        { label: 'P&L', val: sumCallPL, color: sumCallPL >= 0 ? C.green : C.red },
      ])}

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: C.border, marginVertical: 12, opacity: 0.4 }} />

      {/* Chart 3: P&L PUT vs CALL */}
      <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, textAlign: 'center', marginBottom: 4 }}>
        P&L — PUT vs CALL
      </Text>
      {infoBar(selPL, plInfoItems, plMonthLabel)}
      <TouchableOpacity activeOpacity={1} onPress={makeTouch(selPL, setSelPL)}>
        <Svg width={w} height={subH}>{plEls}</Svg>
      </TouchableOpacity>
      {legendRow([{ label: 'PUT P&L', color: C.opcoes }, { label: 'CALL P&L', color: C.acoes }])}
      {kpiRow([
        { label: 'PUT P&L', val: sumPutPL, color: sumPutPL >= 0 ? C.green : C.red },
        { label: 'CALL P&L', val: sumCallPL, color: sumCallPL >= 0 ? C.green : C.red },
        { label: 'TOTAL', val: sumPutPL + sumCallPL, color: (sumPutPL + sumCallPL) >= 0 ? C.green : C.red },
      ])}

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: C.border, marginVertical: 12, opacity: 0.4 }} />

      {/* Chart 4: PRÊMIO — PUT vs CALL */}
      <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, textAlign: 'center', marginBottom: 4 }}>
        Prêmio — PUT vs CALL
      </Text>
      {infoBar(selPrem, premInfoItems, premMonthLabel)}
      <TouchableOpacity activeOpacity={1} onPress={makeTouch(selPrem, setSelPrem)}>
        <Svg width={w} height={subH}>{premEls}</Svg>
      </TouchableOpacity>
      {legendRow([{ label: 'PUT', color: C.opcoes }, { label: 'CALL', color: C.acoes }])}
      {kpiRow([
        { label: 'PUT', val: sumPutPrem, color: C.opcoes },
        { label: 'CALL', val: sumCallPrem, color: C.acoes },
        { label: 'TOTAL', val: sumPutPrem + sumCallPrem, color: C.green },
      ])}

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: C.border, marginVertical: 12, opacity: 0.4 }} />

      {/* Chart 5: RECOMPRA — PUT vs CALL */}
      <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, textAlign: 'center', marginBottom: 4 }}>
        Recompra — PUT vs CALL
      </Text>
      {infoBar(selRec, recInfoItems, recMonthLabel)}
      <TouchableOpacity activeOpacity={1} onPress={makeTouch(selRec, setSelRec)}>
        <Svg width={w} height={subH}>{recEls}</Svg>
      </TouchableOpacity>
      {legendRow([{ label: 'PUT', color: C.opcoes }, { label: 'CALL', color: C.acoes }])}
      {kpiRow([
        { label: 'PUT', val: sumPutRecomp, color: C.opcoes },
        { label: 'CALL', val: sumCallRecomp, color: C.acoes },
        { label: 'TOTAL', val: sumPutRecomp + sumCallRecomp, color: C.red },
      ])}

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: C.border, marginVertical: 12, opacity: 0.4 }} />

      {/* Chart 6: EXERCIDAS — PUT vs CALL */}
      <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, textAlign: 'center', marginBottom: 4 }}>
        Exercidas — PUT vs CALL
      </Text>
      {infoBar(selExerc, exercInfoItems, exercMonthLabel)}
      <TouchableOpacity activeOpacity={1} onPress={makeTouch(selExerc, setSelExerc)}>
        <Svg width={w} height={subH}>{exercEls}</Svg>
      </TouchableOpacity>
      {legendRow([{ label: 'PUT', color: C.opcoes }, { label: 'CALL', color: C.acoes }])}
      {kpiRow([
        { label: 'PUT', val: sumExercPut, color: C.opcoes, prefix: '' },
        { label: 'CALL', val: sumExercCall, color: C.acoes, prefix: '' },
        { label: 'TOTAL', val: sumExercPut + sumExercCall, color: C.yellow, prefix: '' },
      ])}

      {/* Tendency indicator */}
      {(function() {
        var totalExerc = sumExercPut + sumExercCall;
        if (totalExerc === 0) return null;

        var pctPut = sumExercPut / totalExerc * 100;
        var pctCall = sumExercCall / totalExerc * 100;

        // Last 3 months trend
        var rec3Put = 0; var rec3Call = 0;
        for (var t3 = Math.max(0, n - 3); t3 < n; t3++) {
          rec3Put += exercPutVals[t3];
          rec3Call += exercCallVals[t3];
        }
        var rec3Total = rec3Put + rec3Call;
        var rec3PctPut = rec3Total > 0 ? (rec3Put / rec3Total * 100) : 0;
        var rec3PctCall = rec3Total > 0 ? (rec3Call / rec3Total * 100) : 0;

        // Previous 3 months for comparison
        var prev3Put = 0; var prev3Call = 0;
        for (var p3 = Math.max(0, n - 6); p3 < Math.max(0, n - 3); p3++) {
          prev3Put += exercPutVals[p3];
          prev3Call += exercCallVals[p3];
        }
        var prev3Total = prev3Put + prev3Call;
        var prev3PctPut = prev3Total > 0 ? (prev3Put / prev3Total * 100) : 0;

        // Trend arrow
        var trendText = '';
        var trendColor = C.sub;
        if (rec3Total > 0) {
          var dominant = rec3PctPut >= rec3PctCall ? 'PUT' : 'CALL';
          var dominantPct = rec3PctPut >= rec3PctCall ? rec3PctPut : rec3PctCall;
          var dominantColor = rec3PctPut >= rec3PctCall ? C.opcoes : C.acoes;
          trendColor = dominantColor;

          if (prev3Total > 0) {
            var delta = rec3PctPut - prev3PctPut;
            var arrow = '';
            if (Math.abs(delta) > 10) {
              arrow = delta > 0 ? ' ↑' : ' ↓';
            } else if (Math.abs(delta) > 3) {
              arrow = delta > 0 ? ' ↗' : ' ↘';
            } else {
              arrow = ' →';
            }
            trendText = 'Últ. 3M: ' + dominant + ' ' + dominantPct.toFixed(0) + '%' + arrow;
          } else {
            trendText = 'Últ. 3M: ' + dominant + ' ' + dominantPct.toFixed(0) + '%';
          }
        }

        return (
          <View style={{ marginTop: 10 }}>
            {/* Dominance bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 8, color: C.sub, fontFamily: F.body, width: 28, textAlign: 'right' }}>PUT</Text>
              <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: C.border, flexDirection: 'row', overflow: 'hidden' }}>
                {pctPut > 0 ? (
                  <View style={{ width: pctPut + '%', height: 10, backgroundColor: C.opcoes, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 }} />
                ) : null}
                {pctCall > 0 ? (
                  <View style={{ width: pctCall + '%', height: 10, backgroundColor: C.acoes, borderTopRightRadius: 5, borderBottomRightRadius: 5 }} />
                ) : null}
              </View>
              <Text style={{ fontSize: 8, color: C.sub, fontFamily: F.body, width: 28 }}>CALL</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 34 }}>
              <Text style={{ fontSize: 9, color: C.opcoes, fontFamily: F.mono, fontWeight: '600' }}>
                {pctPut.toFixed(0) + '%'}
              </Text>
              <Text style={{ fontSize: 9, color: C.acoes, fontFamily: F.mono, fontWeight: '600' }}>
                {pctCall.toFixed(0) + '%'}
              </Text>
            </View>

            {/* Trend insight */}
            {trendText ? (
              <View style={{ backgroundColor: C.surface, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, marginTop: 6, borderWidth: 0.5, borderColor: C.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: trendColor, fontFamily: F.mono, fontWeight: '600' }}>
                  {trendText}
                </Text>
                {prev3Total > 0 && rec3Total > 0 ? (
                  <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.body, marginTop: 2 }}>
                    {'vs 3M ant.: PUT ' + prev3PctPut.toFixed(0) + '% / CALL ' + (100 - prev3PctPut).toFixed(0) + '%'}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })()}
    </View>
  );
}

// ═══════════ INLINE SVG: Prêmio x Recompra x P&L Line Chart ═══════════

function PremioMediaLineChart(props) {
  var data = props.data || [];
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var _sel = useState(-1); var sel = _sel[0]; var setSel = _sel[1];

  if (data.length === 0) return null;

  var n = data.length;
  var chartH = 180;
  var topPad = 22;
  var botPad = 24;
  var leftPad = 42;
  var rightPad = 8;

  if (w === 0) {
    return React.createElement(View, { onLayout: function(e) { setW(e.nativeEvent.layout.width); }, style: { height: 1 } });
  }

  var drawH = chartH - topPad - botPad;
  var drawW = w - leftPad - rightPad;

  // Extract series
  var premVals = [];
  var recVals = [];
  var plVals = [];
  var sumPrem = 0;
  var sumRec = 0;
  var sumPL = 0;
  for (var ei = 0; ei < n; ei++) {
    var ed = data[ei];
    var ePrem = ed.total || 0;
    var eRec = ed.recompra || 0;
    var ePL = ePrem - eRec;
    premVals.push(ePrem);
    recVals.push(eRec);
    plVals.push(ePL);
    sumPrem += ePrem;
    sumRec += eRec;
    sumPL += ePL;
  }

  var avgPrem = n > 0 ? sumPrem / n : 0;
  var avgRec = n > 0 ? sumRec / n : 0;
  var avgPL = n > 0 ? sumPL / n : 0;

  // Range (covers all 3 series including negative P&L)
  var maxV = 1;
  var minV = 0;
  for (var ri = 0; ri < n; ri++) {
    if (premVals[ri] > maxV) maxV = premVals[ri];
    if (recVals[ri] > maxV) maxV = recVals[ri];
    if (plVals[ri] > maxV) maxV = plVals[ri];
    if (plVals[ri] < minV) minV = plVals[ri];
  }
  var range = maxV - minV;
  if (range === 0) range = 1;

  function vToY(v) { return topPad + drawH - ((v - minV) / range) * drawH; }
  function iToX(i) { return leftPad + (n > 1 ? (i / (n - 1)) * drawW : drawW / 2); }

  function handleTouch(e) {
    if (drawW <= 0 || n === 0) return;
    var x = e.nativeEvent.locationX - leftPad;
    var step = n > 1 ? drawW / (n - 1) : drawW;
    var idx = Math.round(x / step);
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    setSel(idx === sel ? -1 : idx);
  }

  // Build SVG elements
  var els = [];

  // Grid
  var gridVals = [];
  if (minV < 0) {
    gridVals = [minV, 0, maxV];
  } else {
    gridVals = [0, maxV * 0.5, maxV];
  }
  for (var gi = 0; gi < gridVals.length; gi++) {
    var gy = vToY(gridVals[gi]);
    var isZero = gridVals[gi] === 0 && minV < 0;
    els.push(React.createElement(SvgLine, {
      key: 'g' + gi, x1: leftPad, y1: gy, x2: w - rightPad, y2: gy,
      stroke: isZero ? C.sub : C.border, strokeWidth: isZero ? 0.8 : 0.5, strokeDasharray: isZero ? '' : '3,3',
    }));
    els.push(React.createElement(SvgText, {
      key: 'gl' + gi, x: leftPad - 4, y: gy + 3,
      fill: C.dim, fontSize: 7, fontFamily: F.mono, textAnchor: 'end',
    }, fmtC(gridVals[gi])));
  }

  // Series definitions: premio (green), recompra (red), P&L (accent)
  var allSeries = [
    { vals: premVals, color: C.green, area: true },
    { vals: recVals, color: C.red, area: false },
    { vals: plVals, color: C.accent, area: false },
  ];

  for (var si = 0; si < allSeries.length; si++) {
    var s = allSeries[si];
    var pts = [];
    for (var pi = 0; pi < n; pi++) {
      pts.push({ x: iToX(pi), y: vToY(s.vals[pi]), val: s.vals[pi] });
    }

    // Area fill
    if (s.area && pts.length >= 2) {
      var baseY = vToY(0);
      var ap = 'M' + pts[0].x + ',' + baseY;
      for (var a = 0; a < pts.length; a++) ap = ap + ' L' + pts[a].x + ',' + pts[a].y;
      ap = ap + ' L' + pts[pts.length - 1].x + ',' + baseY + ' Z';
      els.push(React.createElement(Path, { key: 's' + si + 'a', d: ap, fill: s.color, opacity: 0.1 }));
    }

    // Line
    if (pts.length >= 2) {
      var lp = 'M' + pts[0].x + ',' + pts[0].y;
      for (var li = 1; li < pts.length; li++) lp = lp + ' L' + pts[li].x + ',' + pts[li].y;
      els.push(React.createElement(Path, {
        key: 's' + si + 'l', d: lp,
        stroke: s.color, strokeWidth: 3, fill: 'none', opacity: 0.9,
      }));
    }

    // Dots
    for (var di = 0; di < pts.length; di++) {
      if (pts[di].val !== 0) {
        var isSel = di === sel;
        els.push(React.createElement(Circle, {
          key: 's' + si + 'dg' + di, cx: pts[di].x, cy: pts[di].y,
          r: isSel ? 6 : 3.5, fill: s.color, opacity: isSel ? 0.25 : 0.15,
        }));
        els.push(React.createElement(Circle, {
          key: 's' + si + 'dd' + di, cx: pts[di].x, cy: pts[di].y,
          r: isSel ? 4 : 2, fill: s.color, opacity: 1,
        }));
      }
    }
  }

  // Vertical selection line
  if (sel >= 0 && sel < n) {
    var selX = iToX(sel);
    els.push(React.createElement(SvgLine, {
      key: 'vl', x1: selX, y1: topPad, x2: selX, y2: topPad + drawH,
      stroke: C.text, strokeWidth: 0.8, opacity: 0.35, strokeDasharray: '4,3',
    }));
  }

  // X-axis labels
  for (var xi = 0; xi < n; xi++) {
    var showXL = n <= 12 || xi % Math.ceil(n / 8) === 0 || xi === n - 1;
    if (showXL) {
      var xSel = xi === sel;
      var mp = (data[xi].month || '').split('/');
      els.push(React.createElement(SvgText, {
        key: 'x' + xi, x: iToX(xi), y: chartH - 4,
        fontSize: 7, fill: xSel ? C.text : C.dim, fontFamily: F.mono, textAnchor: 'middle',
        fontWeight: xSel ? '600' : '400',
      }, mp[0] || ''));
    }
  }

  // Info bar data
  var selD = sel >= 0 && sel < n ? data[sel] : null;
  var sPrem = selD ? (selD.total || 0) : 0;
  var sRec = selD ? (selD.recompra || 0) : 0;
  var sPL = sPrem - sRec;

  return React.createElement(View, null,
    // Legend
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 6 } },
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
        React.createElement(View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green } }),
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Prêmio')
      ),
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
        React.createElement(View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red } }),
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Recompra')
      ),
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
        React.createElement(View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent } }),
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'P&L')
      )
    ),

    // KPIs (averages)
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 } },
      React.createElement(View, { style: { alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Média Prêmio'),
        React.createElement(Text, { style: { fontSize: 12, color: C.green, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(avgPrem))
      ),
      React.createElement(View, { style: { alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Média Recompra'),
        React.createElement(Text, { style: { fontSize: 12, color: C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(avgRec))
      ),
      React.createElement(View, { style: { alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Média P&L'),
        React.createElement(Text, { style: { fontSize: 12, color: avgPL >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(avgPL))
      )
    ),

    // Info bar on selection
    selD ? React.createElement(View, { style: { backgroundColor: C.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.border } },
      React.createElement(Text, { style: { fontSize: 10, color: C.sub, fontFamily: F.body, textAlign: 'center', marginBottom: 3 } }, selD.month || ''),
      React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-around' } },
        React.createElement(View, { style: { alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Prêmio'),
          React.createElement(Text, { style: { fontSize: 14, color: C.green, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(sPrem))
        ),
        React.createElement(View, { style: { alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Recompra'),
          React.createElement(Text, { style: { fontSize: 14, color: C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(sRec))
        ),
        React.createElement(View, { style: { alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'P&L'),
          React.createElement(Text, { style: { fontSize: 14, color: sPL >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(sPL))
        )
      )
    ) : null,

    // Chart
    React.createElement(TouchableOpacity, { activeOpacity: 1, onPress: handleTouch },
      React.createElement(Svg, { width: w, height: chartH }, els)
    )
  );
}

// ═══════════ INLINE SVG: Desfechos PUT vs CALL (barras agrupadas) ═══════════

function DesfechosChart(props) {
  var opcByStatus = props.opcByStatus || {};
  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  if (w === 0) {
    return React.createElement(View, { onLayout: function(e) { setW(e.nativeEvent.layout.width); }, style: { height: 1 } });
  }

  var categories = [
    { key: 'expirou_po', label: 'Virou Pó', color: C.green },
    { key: 'exercida', label: 'Exercidas', color: C.yellow },
    { key: 'fechada', label: 'Fechadas', color: C.sub },
  ];

  var chartH = 160;
  var topPad = 18;
  var botPad = 32;
  var leftPad = 32;
  var rightPad = 8;
  var drawH = chartH - topPad - botPad;
  var drawW = w - leftPad - rightPad;

  // Get max value for scale
  var maxVal = 1;
  for (var ci = 0; ci < categories.length; ci++) {
    var cat = categories[ci];
    var st = opcByStatus[cat.key];
    if (st) {
      if ((st.put || 0) > maxVal) maxVal = st.put;
      if ((st.call || 0) > maxVal) maxVal = st.call;
    }
  }

  var groupW = drawW / categories.length;
  var barW = Math.min(groupW * 0.3, 32);
  var gap = barW * 0.3;

  function vToH(v) { return (v / maxVal) * drawH; }

  var els = [];

  // Grid lines
  var gridSteps = [0, Math.round(maxVal * 0.5), maxVal];
  for (var gi = 0; gi < gridSteps.length; gi++) {
    var gy = topPad + drawH - (gridSteps[gi] / maxVal) * drawH;
    els.push(React.createElement(SvgLine, {
      key: 'g' + gi, x1: leftPad, y1: gy, x2: w - rightPad, y2: gy,
      stroke: C.border, strokeWidth: 0.5, strokeDasharray: '3,3',
    }));
    els.push(React.createElement(SvgText, {
      key: 'gl' + gi, x: leftPad - 4, y: gy + 3,
      fill: C.dim, fontSize: 8, fontFamily: F.mono, textAnchor: 'end',
    }, String(gridSteps[gi])));
  }

  // Bars
  for (var bi = 0; bi < categories.length; bi++) {
    var bCat = categories[bi];
    var bSt = opcByStatus[bCat.key] || { count: 0, put: 0, call: 0 };
    var cx = leftPad + groupW * bi + groupW / 2;

    // PUT bar (left)
    var putH = vToH(bSt.put || 0);
    var putX = cx - gap / 2 - barW;
    var putY = topPad + drawH - putH;
    if (putH > 0) {
      els.push(React.createElement(SvgRect, {
        key: 'p' + bi, x: putX, y: putY, width: barW, height: putH,
        rx: 3, fill: C.red, opacity: 0.85,
      }));
      els.push(React.createElement(SvgText, {
        key: 'pv' + bi, x: putX + barW / 2, y: putY - 4,
        fill: C.red, fontSize: 9, fontFamily: F.mono, fontWeight: '700', textAnchor: 'middle',
      }, String(bSt.put || 0)));
    }

    // CALL bar (right)
    var callH = vToH(bSt.call || 0);
    var callX = cx + gap / 2;
    var callY = topPad + drawH - callH;
    if (callH > 0) {
      els.push(React.createElement(SvgRect, {
        key: 'c' + bi, x: callX, y: callY, width: barW, height: callH,
        rx: 3, fill: C.acoes, opacity: 0.85,
      }));
      els.push(React.createElement(SvgText, {
        key: 'cv' + bi, x: callX + barW / 2, y: callY - 4,
        fill: C.acoes, fontSize: 9, fontFamily: F.mono, fontWeight: '700', textAnchor: 'middle',
      }, String(bSt.call || 0)));
    }

    // Category label
    els.push(React.createElement(SvgText, {
      key: 'l' + bi, x: cx, y: chartH - 12,
      fill: bCat.color, fontSize: 9, fontFamily: F.body, fontWeight: '600', textAnchor: 'middle',
    }, bCat.label));

    // Total count below label
    els.push(React.createElement(SvgText, {
      key: 't' + bi, x: cx, y: chartH - 2,
      fill: C.dim, fontSize: 7, fontFamily: F.mono, textAnchor: 'middle',
    }, String(bSt.count || 0) + ' total'));
  }

  return React.createElement(View, null,
    // Legend
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 8 } },
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
        React.createElement(View, { style: { width: 10, height: 10, borderRadius: 2, backgroundColor: C.red } }),
        React.createElement(Text, { style: { fontSize: 10, color: C.sub, fontFamily: F.body } }, 'PUT')
      ),
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
        React.createElement(View, { style: { width: 10, height: 10, borderRadius: 2, backgroundColor: C.acoes } }),
        React.createElement(Text, { style: { fontSize: 10, color: C.sub, fontFamily: F.body } }, 'CALL')
      )
    ),
    // Chart
    React.createElement(Svg, { width: w, height: chartH }, els)
  );
}

// ═══════════ INLINE SVG: Prêmio / Recompra / P&L Médio 3M (genérico PUT/CALL) ═══════════

function PremioRecompraMA3Chart(props) {
  var data = props.data || [];
  var visible = props.visible || { premio: true, recompra: true, plMedia: true };
  var onToggle = props.onToggle;
  var premioKey = props.premioKey || 'put';
  var recompraKey = props.recompraKey || 'recompra_put';
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var _sel = useState(-1); var sel = _sel[0]; var setSel = _sel[1];

  if (data.length === 0) return null;

  var n = data.length;
  var chartH = 190;
  var topPad = 22;
  var botPad = 24;
  var leftPad = 42;
  var rightPad = 8;

  if (w === 0) {
    return React.createElement(View, { onLayout: function(e) { setW(e.nativeEvent.layout.width); }, style: { height: 1 } });
  }

  var drawH = chartH - topPad - botPad;
  var drawW = w - leftPad - rightPad;

  // Extract series
  var vendaVals = [];
  var compraVals = [];
  var plRaw = [];
  var plMediaVals = [];
  var sumPrem = 0;
  var sumRec = 0;
  for (var ei = 0; ei < n; ei++) {
    var ed = data[ei];
    var vv = ed[premioKey] || 0;
    var cv = ed[recompraKey] || 0;
    vendaVals.push(vv);
    compraVals.push(cv);
    plRaw.push(vv - cv);
    sumPrem += vv;
    sumRec += cv;
  }

  // Moving average 3M of P&L
  for (var mi = 0; mi < n; mi++) {
    var maSum = 0;
    var maCount = 0;
    for (var mj = Math.max(0, mi - 2); mj <= mi; mj++) {
      maSum += plRaw[mj];
      maCount++;
    }
    plMediaVals.push(maCount > 0 ? maSum / maCount : 0);
  }

  var avgPrem = n > 0 ? sumPrem / n : 0;
  var avgRec = n > 0 ? sumRec / n : 0;
  var avgPL = n > 0 ? (sumPrem - sumRec) / n : 0;

  // Range (covers all visible series including negative values)
  var maxV = 1;
  var minV = 0;
  for (var ri = 0; ri < n; ri++) {
    if (visible.premio) {
      if (vendaVals[ri] > maxV) maxV = vendaVals[ri];
      if (vendaVals[ri] < minV) minV = vendaVals[ri];
    }
    if (visible.recompra) {
      if (compraVals[ri] > maxV) maxV = compraVals[ri];
      if (compraVals[ri] < minV) minV = compraVals[ri];
    }
    if (visible.plMedia) {
      if (plMediaVals[ri] > maxV) maxV = plMediaVals[ri];
      if (plMediaVals[ri] < minV) minV = plMediaVals[ri];
    }
  }
  var range = maxV - minV;
  if (range === 0) range = 1;

  function vToY(v) { return topPad + drawH - ((v - minV) / range) * drawH; }
  function iToX(i) { return leftPad + (n > 1 ? (i / (n - 1)) * drawW : drawW / 2); }

  function handleTouch(e) {
    if (drawW <= 0 || n === 0) return;
    var x = e.nativeEvent.locationX - leftPad;
    var step = n > 1 ? drawW / (n - 1) : drawW;
    var idx = Math.round(x / step);
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    setSel(idx === sel ? -1 : idx);
  }

  // Build bezier path from points
  function buildBezier(pts) {
    if (pts.length < 2) return '';
    var path = 'M' + pts[0].x + ',' + pts[0].y;
    for (var bi = 1; bi < pts.length; bi++) {
      var prev = pts[bi - 1];
      var cur = pts[bi];
      var cpx = (prev.x + cur.x) / 2;
      path = path + ' C' + cpx + ',' + prev.y + ' ' + cpx + ',' + cur.y + ' ' + cur.x + ',' + cur.y;
    }
    return path;
  }

  // Build SVG elements
  var els = [];

  // Grid
  var gridVals = [];
  if (minV < 0) {
    gridVals = [minV, 0, maxV];
  } else {
    gridVals = [0, maxV * 0.5, maxV];
  }
  for (var gi = 0; gi < gridVals.length; gi++) {
    var gy = vToY(gridVals[gi]);
    var isZero = gridVals[gi] === 0 && minV < 0;
    els.push(React.createElement(SvgLine, {
      key: 'g' + gi, x1: leftPad, y1: gy, x2: w - rightPad, y2: gy,
      stroke: isZero ? C.sub : C.border, strokeWidth: isZero ? 0.8 : 0.5, strokeDasharray: isZero ? '' : '3,3',
    }));
    els.push(React.createElement(SvgText, {
      key: 'gl' + gi, x: leftPad - 4, y: gy + 3,
      fill: C.dim, fontSize: 7, fontFamily: F.mono, textAnchor: 'end',
    }, fmtC(gridVals[gi])));
  }

  // Series: venda (green solid), compra (red dashed), P&L media (accent dotted)
  var allSeries = [
    { vals: vendaVals, color: C.green, dash: '', sw: 2.5, area: true, vis: visible.premio, key: 'v' },
    { vals: compraVals, color: C.red, dash: '8,4', sw: 2.5, area: false, vis: visible.recompra, key: 'c' },
    { vals: plMediaVals, color: C.accent, dash: '4,3', sw: 2, area: false, vis: visible.plMedia, key: 'p' },
  ];

  for (var si = 0; si < allSeries.length; si++) {
    var s = allSeries[si];
    if (!s.vis) continue;

    var pts = [];
    for (var pi = 0; pi < n; pi++) {
      pts.push({ x: iToX(pi), y: vToY(s.vals[pi]), val: s.vals[pi] });
    }

    // Area fill (only for venda)
    if (s.area && pts.length >= 2) {
      var baseY = vToY(0);
      var areaPath = buildBezier(pts);
      areaPath = areaPath + ' L' + pts[pts.length - 1].x + ',' + baseY + ' L' + pts[0].x + ',' + baseY + ' Z';
      els.push(React.createElement(Path, { key: s.key + 'a', d: areaPath, fill: s.color, opacity: 0.1 }));
    }

    // Line (bezier)
    if (pts.length >= 2) {
      var lp = buildBezier(pts);
      els.push(React.createElement(Path, {
        key: s.key + 'l', d: lp,
        stroke: s.color, strokeWidth: s.sw, fill: 'none', opacity: 0.9,
        strokeDasharray: s.dash,
      }));
    }

    // Dots with glow
    for (var di = 0; di < pts.length; di++) {
      if (pts[di].val !== 0 || s.key === 'p') {
        var isSel = di === sel;
        els.push(React.createElement(Circle, {
          key: s.key + 'dg' + di, cx: pts[di].x, cy: pts[di].y,
          r: isSel ? 6 : 3.5, fill: s.color, opacity: isSel ? 0.3 : 0.15,
        }));
        els.push(React.createElement(Circle, {
          key: s.key + 'dd' + di, cx: pts[di].x, cy: pts[di].y,
          r: isSel ? 4 : 2, fill: s.color, opacity: 1,
        }));
      }
    }
  }

  // Vertical selection line
  if (sel >= 0 && sel < n) {
    var selX = iToX(sel);
    els.push(React.createElement(SvgLine, {
      key: 'sel', x1: selX, y1: topPad, x2: selX, y2: topPad + drawH,
      stroke: C.text, strokeWidth: 0.8, opacity: 0.35, strokeDasharray: '4,3',
    }));
  }

  // X-axis labels
  for (var xi = 0; xi < n; xi++) {
    var showXL = n <= 12 || xi % Math.ceil(n / 8) === 0 || xi === n - 1;
    if (showXL) {
      var xSel = xi === sel;
      var mp = (data[xi].month || '').split('/');
      els.push(React.createElement(SvgText, {
        key: 'x' + xi, x: iToX(xi), y: chartH - 4,
        fontSize: 7, fill: xSel ? C.text : C.dim, fontFamily: F.mono, textAnchor: 'middle',
        fontWeight: xSel ? '600' : '400',
      }, mp[0] || ''));
    }
  }

  // Legend line samples for visual reference
  var legendItems = [
    { label: 'Prêmio', color: C.green, key: 'premio', dash: null, sw: 2.5 },
    { label: 'Recompra', color: C.red, key: 'recompra', dash: '6,3', sw: 2.5 },
    { label: 'P&L Médio 3M', color: C.accent, key: 'plMedia', dash: '3,2', sw: 2 },
  ];

  // Info bar data
  var selD = sel >= 0 && sel < n ? data[sel] : null;
  var sPrem = selD ? (selD[premioKey] || 0) : 0;
  var sRec = selD ? (selD[recompraKey] || 0) : 0;
  var sPLM = sel >= 0 ? plMediaVals[sel] : 0;

  return React.createElement(View, null,
    // Interactive legend
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 6 } },
      legendItems.map(function(li) {
        var isActive = visible[li.key];
        return React.createElement(TouchableOpacity, {
          key: li.key,
          activeOpacity: 0.6,
          onPress: function() {
            if (onToggle) {
              var newVis = {};
              newVis.premio = visible.premio;
              newVis.recompra = visible.recompra;
              newVis.plMedia = visible.plMedia;
              newVis[li.key] = !visible[li.key];
              onToggle(newVis);
            }
          },
          style: { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: isActive ? 1 : 0.35 },
        },
          React.createElement(Svg, { width: 14, height: 8 },
            React.createElement(SvgLine, {
              x1: 0, y1: 4, x2: 14, y2: 4,
              stroke: li.color, strokeWidth: li.sw, strokeDasharray: li.dash || '',
            })
          ),
          React.createElement(Text, { style: { fontSize: 9, color: isActive ? C.sub : C.dim, fontFamily: F.body } }, li.label)
        );
      })
    ),

    // KPIs (averages)
    React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 } },
      React.createElement(View, { style: { alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Média Prêmio'),
        React.createElement(Text, { style: { fontSize: 12, color: C.green, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(avgPrem))
      ),
      React.createElement(View, { style: { alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Média Recompra'),
        React.createElement(Text, { style: { fontSize: 12, color: C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(avgRec))
      ),
      React.createElement(View, { style: { alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'P&L Médio'),
        React.createElement(Text, { style: { fontSize: 12, color: avgPL >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(avgPL))
      )
    ),

    // Info bar on selection
    selD ? React.createElement(View, { style: { backgroundColor: C.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.border } },
      React.createElement(Text, { style: { fontSize: 10, color: C.sub, fontFamily: F.body, textAlign: 'center', marginBottom: 3 } }, selD.month || ''),
      React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-around' } },
        React.createElement(View, { style: { alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Prêmio'),
          React.createElement(Text, { style: { fontSize: 14, color: C.green, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(sPrem))
        ),
        React.createElement(View, { style: { alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'Recompra'),
          React.createElement(Text, { style: { fontSize: 14, color: C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(sRec))
        ),
        React.createElement(View, { style: { alignItems: 'center' } },
          React.createElement(Text, { style: { fontSize: 9, color: C.sub, fontFamily: F.body } }, 'P&L 3M'),
          React.createElement(Text, { style: { fontSize: 14, color: sPLM >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' } }, 'R$ ' + fmt(sPLM))
        )
      )
    ) : null,

    // Chart
    React.createElement(TouchableOpacity, { activeOpacity: 1, onPress: handleTouch },
      React.createElement(Svg, { width: w, height: chartH }, els)
    )
  );
}

// ═══════════ INLINE SVG: Premios Vertical Bar Chart ═══════════

function PremiosBarChart(props) {
  var data = props.data || [];
  var showCall = props.showCall;
  var showPut = props.showPut;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect || function() {};
  var barColor = props.barColor || C.opcoes;
  var barColors = props.barColors || null;

  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  var chartH = 180;
  var topPad = 30;
  var bottomPad = 28;
  var leftPad = 38;
  var rightPad = 8;
  var drawH = chartH - topPad - bottomPad;
  var drawW = w - leftPad - rightPad;

  // Max is always based on total for consistent scale
  var maxVal = 0;
  for (var mi = 0; mi < data.length; mi++) {
    var v = data[mi].total || 0;
    if (v > maxVal) maxVal = v;
  }
  if (maxVal === 0) maxVal = 1;

  var slotW = data.length > 0 ? drawW / data.length : 0;
  var totalBarW = data.length > 0 ? Math.max(slotW - 4, 6) : 6;
  var hasOverlay = showCall || showPut;
  // Sub-bars are narrower; if both shown, split the slot
  var subCount = (showCall ? 1 : 0) + (showPut ? 1 : 0);
  var subBarW = subCount > 0 ? Math.max((totalBarW - 2) / subCount, 4) : 0;

  var gridLines = [0, maxVal * 0.5, maxVal];

  function handleTouch(e) {
    if (drawW <= 0 || data.length === 0) return;
    var x = e.nativeEvent.locationX - leftPad;
    var idx = Math.floor(x / slotW);
    if (idx < 0) idx = 0;
    if (idx >= data.length) idx = data.length - 1;
    onSelect(idx === selected ? -1 : idx);
  }

  function barY(val) {
    var h = maxVal > 0 ? (val / maxVal) * drawH : 0;
    if (val > 0 && h < 2) h = 2;
    return { y: topPad + drawH - h, h: h };
  }

  if (data.length === 0) return null;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      {w > 0 ? (
        <TouchableOpacity activeOpacity={1} onPress={handleTouch}>
          <Svg width={w} height={chartH}>
            {/* Grid lines */}
            {gridLines.map(function(gv, gi) {
              var gy = topPad + drawH - (gv / maxVal) * drawH;
              return (
                <G key={'g' + gi}>
                  <SvgLine x1={leftPad} y1={gy} x2={w - rightPad} y2={gy}
                    stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
                  <SvgText x={leftPad - 4} y={gy + 3} fill={C.dim}
                    fontSize={8} fontFamily={F.mono} textAnchor="end">
                    {fmtC(gv)}
                  </SvgText>
                </G>
              );
            })}

            {/* Bars */}
            {data.map(function(d, i) {
              var isSelected = i === selected;
              var slotX = leftPad + i * slotW;
              var barX = slotX + (slotW - totalBarW) / 2;
              var totalB = barY(d.total || 0);
              var totalOpacity = hasOverlay
                ? (selected === -1 ? 0.25 : (isSelected ? 0.35 : 0.12))
                : (selected === -1 ? 0.7 : (isSelected ? 1 : 0.35));

              var monthParts = (d.month || '').split('/');
              var monthLabel = monthParts[0] || '';

              // Build tooltip lines (only when overlay active)
              var tipLines = [];
              if (isSelected && hasOverlay) {
                tipLines.push({ label: 'Receb', value: d.total || 0, color: C.green });
                if (showCall) tipLines.push({ label: 'C', value: d.call || 0, color: C.acoes });
                if (showPut) tipLines.push({ label: 'P', value: d.put || 0, color: C.opcoes });
                if ((d.recompra || 0) > 0) {
                  tipLines.push({ label: 'Recomp', value: d.recompra, color: C.red });
                  tipLines.push({ label: 'Liq', value: (d.total || 0) - d.recompra, color: ((d.total || 0) - d.recompra) >= 0 ? C.green : C.red });
                }
              }

              // Tooltip height
              var tipH = tipLines.length > 1 ? 12 * tipLines.length + 4 : 16;
              var tipW = tipLines.length > 3 ? 82 : 72;
              var tipY = totalB.y - tipH - 4;
              if (tipY < 0) tipY = 0;

              return (
                <G key={'b' + i}>
                  {/* Total bar (background) */}
                  <SvgRect x={barX} y={totalB.y} width={totalBarW} height={totalB.h}
                    rx={3} fill={barColors ? (barColors[i] || barColor) : barColor} opacity={totalOpacity} />

                  {/* Call/Put overlay bars */}
                  {hasOverlay ? (function() {
                    var elems = [];
                    var subIdx = 0;
                    var subOpBase = selected === -1 ? 0.8 : (isSelected ? 1 : 0.3);
                    if (showCall) {
                      var cb = barY(d.call || 0);
                      var cx = barX + 1 + subIdx * subBarW;
                      elems.push(
                        <SvgRect key="c" x={cx} y={cb.y} width={subBarW - 1} height={cb.h}
                          rx={2} fill={C.acoes} opacity={subOpBase} />
                      );
                      subIdx++;
                    }
                    if (showPut) {
                      var pb = barY(d.put || 0);
                      var px = barX + 1 + subIdx * subBarW;
                      elems.push(
                        <SvgRect key="p" x={px} y={pb.y} width={subBarW - 1} height={pb.h}
                          rx={2} fill={C.green} opacity={subOpBase} />
                      );
                    }
                    return elems;
                  })() : null}

                  {/* Tooltip */}
                  {isSelected && (d.total || 0) > 0 ? (
                    <G>
                      <SvgRect x={barX + totalBarW / 2 - tipW / 2} y={tipY}
                        width={tipW} height={tipH} rx={4} fill={C.surface} opacity={0.95} />
                      {tipLines.length <= 1 ? (
                        <SvgText x={barX + totalBarW / 2} y={tipY + 11} fill={C.text}
                          fontSize={9} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                          {'R$ ' + fmt(d.total || 0)}
                        </SvgText>
                      ) : tipLines.map(function(tl, ti) {
                        return (
                          <SvgText key={'t' + ti} x={barX + totalBarW / 2} y={tipY + 11 + ti * 12}
                            fill={tl.color} fontSize={8} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                            {tl.label + ' R$ ' + fmt(tl.value)}
                          </SvgText>
                        );
                      })}
                    </G>
                  ) : null}

                  {/* Month label */}
                  <SvgText x={barX + totalBarW / 2} y={chartH - 6} fill={isSelected ? C.text : C.dim}
                    fontSize={8} fontFamily={F.mono} textAnchor="middle" fontWeight={isSelected ? '600' : '400'}>
                    {monthLabel}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ═══════════ INLINE SVG: Combined Stacked Bar Chart ═══════════

function CombinedBarChart(props) {
  var data = props.data || [];
  var maxVal = props.maxVal || 1;
  var height = props.height || 180;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  if (data.length === 0 || w === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: 1 }} />;
  }

  var padL = 6;
  var padR = 6;
  var padTop = 18;
  var padBot = 32;
  var chartW = w - padL - padR;
  var chartH = height - padTop - padBot;
  var barGap = 4;
  var barW = (chartW - barGap * (data.length - 1)) / data.length;
  if (barW > 32) barW = 32;
  var totalBarsW = data.length * barW + (data.length - 1) * barGap;
  var offsetX = padL + (chartW - totalBarsW) / 2;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={height}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(function(pct, gi) {
          var gy = padTop + chartH * (1 - pct);
          return (
            <SvgLine key={gi} x1={padL} y1={gy} x2={w - padR} y2={gy}
              stroke={C.border} strokeWidth={0.5} opacity={0.4} />
          );
        })}
        {/* Stacked bars */}
        {data.map(function(d, i) {
          var bx = offsetX + i * (barW + barGap);
          var totalH = maxVal > 0 ? (d.total / maxVal) * chartH : 0;
          totalH = Math.max(totalH, d.total > 0 ? 2 : 0);
          var provH = d.total > 0 ? (d.provValue / d.total) * totalH : 0;
          var premH = d.total > 0 ? (d.premValue / d.total) * totalH : 0;
          var baseY = padTop + chartH;
          return (
            <G key={i}>
              {/* Proventos (bottom, green) */}
              {provH > 0 && (
                <SvgRect x={bx} y={baseY - provH} width={barW} height={provH}
                  rx={premH > 0 ? 0 : 3} fill={C.fiis} opacity={0.7} />
              )}
              {/* Premios (top, purple) */}
              {premH > 0 && (
                <SvgRect x={bx} y={baseY - provH - premH} width={barW} height={premH}
                  rx={3} fill={C.opcoes} opacity={0.7} />
              )}
              {/* Value on top */}
              {d.total > 0 && (
                <SvgText x={bx + barW / 2} y={baseY - totalH - 4} fill={C.green}
                  fontSize={7} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                  {d.total >= 1000 ? (d.total / 1000).toFixed(1) + 'k' : fmt(d.total)}
                </SvgText>
              )}
              {/* Label */}
              <SvgText x={bx + barW / 2} y={height - padBot + 12} fill={C.sub}
                fontSize={8} fontFamily={F.mono} textAnchor="middle">
                {d.month}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.fiis, opacity: 0.7 }} />
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Proventos</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.opcoes, opacity: 0.7 }} />
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Prêmios</Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════ INLINE SVG: Renda Passiva Multi-Line Chart ═══════════

// ═══════════ INLINE: Dividend Heatmap ═══════════

function hmColor(val, maxV) {
  if (val <= 0 || maxV <= 0) return C.border;
  var pct = val / maxV;
  if (pct < 0.15) return '#1B3A4B';
  if (pct < 0.3) return '#2A6478';
  if (pct < 0.45) return '#3B82A0';
  if (pct < 0.6) return '#E09F3E';
  if (pct < 0.75) return '#E07B3E';
  if (pct < 0.9) return '#D94F30';
  return '#C62828';
}

function DividendHeatmap(props) {
  var tickers = props.tickers || [];
  var months = props.months || [];
  var data = props.data || {};
  var maxVal = props.maxVal || 1;

  if (tickers.length === 0) {
    return <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 8 }}>Sem dados de ações</Text>;
  }

  var cellH = 28;
  var cellW = 36;
  var labelW = 60;
  var headerH = 24;
  var totalH = headerH + tickers.length * cellH;
  var totalW = labelW + months.length * cellW;

  var _hmSel = useState(null); var hmSel = _hmSel[0]; var setHmSel = _hmSel[1];

  return (
    <View>
      {/* Tooltip */}
      {hmSel && (
        <View style={{ backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 8, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display }}>{hmSel.ticker + ' — ' + hmSel.month}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: hmSel.val > 0 ? C.green : C.dim, fontFamily: F.mono }}>
            {'R$ ' + fmt(hmSel.val)}
          </Text>
          <TouchableOpacity onPress={function() { setHmSel(null); }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header row */}
          <View style={{ flexDirection: 'row', height: headerH }}>
            <View style={{ width: labelW }} />
            {months.map(function(m, mi) {
              return (
                <View key={mi} style={{ width: cellW, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>{m.label}</Text>
                </View>
              );
            })}
          </View>
          {/* Data rows */}
          {tickers.map(function(tk, ti) {
            var rowData = data[tk] || {};
            return (
              <View key={tk} style={{ flexDirection: 'row', height: cellH }}>
                <View style={{ width: labelW, justifyContent: 'center', paddingRight: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: C.text, fontFamily: F.mono, textAlign: 'right' }}>{tk}</Text>
                </View>
                {months.map(function(m, mi) {
                  var val = rowData[m.key] || 0;
                  var bg = hmColor(val, maxVal);
                  return (
                    <TouchableOpacity key={mi}
                      onPress={function() { setHmSel(hmSel && hmSel.ticker === tk && hmSel.monthKey === m.key ? null : { ticker: tk, month: m.label, monthKey: m.key, val: val }); }}
                      style={{ width: cellW, height: cellH, padding: 1 }}>
                      <View style={{ flex: 1, backgroundColor: bg, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
                        {val > 0 && (
                          <Text style={{ fontSize: 7, color: '#fff', fontFamily: F.mono, fontWeight: '600' }}>
                            {val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0)}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
          {/* Legend */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, paddingLeft: labelW }}>
            {[
              { l: 'Nenhum', c: C.border },
              { l: 'Baixo', c: '#1B3A4B' },
              { l: 'Médio', c: '#3B82A0' },
              { l: 'Alto', c: '#E07B3E' },
              { l: 'Máximo', c: '#C62828' },
            ].map(function(lg) {
              return (
                <View key={lg.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: lg.c }} />
                  <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>{lg.l}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

var RP_SERIES = [
  { key: 'div', label: 'Dividendos/JCP', color: C.acoes, dash: '' },
  { key: 'rend', label: 'Rendimentos FII', color: C.fiis, dash: '6,3' },
  { key: 'rf', label: 'Renda Fixa', color: C.rf, dash: '3,3' },
  { key: 'pl', label: 'P&L Opções', color: C.opcoes, dash: '8,4' },
];

var PREM_LINE_SERIES = [
  { key: 'premios', label: 'Prêmios', color: C.green, dash: '' },
  { key: 'recompra', label: 'Recompra', color: C.red, dash: '6,3' },
  { key: 'pl', label: 'P&L Líquido', color: C.accent, dash: '3,3' },
];

function PremiosRecompraLineChart(props) {
  var data = props.data || [];
  var visible = props.visible || {};
  var onToggle = props.onToggle;
  var height = 220;
  var _pcw = useState(0); var pcw = _pcw[0]; var setPcw = _pcw[1];
  var _pSel = useState(-1); var pSel = _pSel[0]; var setPSel = _pSel[1];

  if (data.length === 0) {
    return <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 8 }}>Sem dados</Text>;
  }

  var ptW = 56;
  var totalW = Math.max(data.length * ptW, pcw || 300);
  var padL = 8;
  var padR = 16;
  var padTop = 24;
  var padBot = 36;
  var chartH = height - padTop - padBot;
  var chartW = totalW - padL - padR;

  var allVals = [];
  for (var avi = 0; avi < data.length; avi++) {
    for (var avs = 0; avs < PREM_LINE_SERIES.length; avs++) {
      if (visible[PREM_LINE_SERIES[avs].key]) allVals.push(data[avi][PREM_LINE_SERIES[avs].key] || 0);
    }
  }
  if (allVals.length === 0) allVals = [0];
  var minVal = Math.min.apply(null, allVals);
  var maxVal = Math.max.apply(null, allVals);
  if (minVal > 0) minVal = 0;
  if (maxVal <= 0) maxVal = 1;
  var range = maxVal - minVal || 1;

  function yPos(v) { return padTop + chartH * (1 - (v - minVal) / range); }
  function xPos(i) { return padL + (i / Math.max(data.length - 1, 1)) * chartW; }

  var paths = [];
  for (var si = 0; si < PREM_LINE_SERIES.length; si++) {
    var s = PREM_LINE_SERIES[si];
    if (!visible[s.key]) continue;
    var d = '';
    for (var pi = 0; pi < data.length; pi++) {
      var px = xPos(pi);
      var py = yPos(data[pi][s.key] || 0);
      d += (pi === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
    }
    paths.push({ d: d, color: s.color, dash: s.dash, key: s.key, label: s.label });
  }

  var ySteps = 5;
  var yLabels = [];
  for (var yi = 0; yi <= ySteps; yi++) {
    var yv = minVal + (range * yi / ySteps);
    yLabels.push({ v: yv, y: yPos(yv) });
  }

  var zeroY = yPos(0);
  var selData = pSel >= 0 && pSel < data.length ? data[pSel] : null;

  return (
    <View>
      {selData && (
        <View style={{ backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, fontFamily: F.display }}>{selData.label}</Text>
            <TouchableOpacity onPress={function() { setPSel(-1); }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
          {PREM_LINE_SERIES.map(function(s) {
            if (!visible[s.key]) return null;
            var v = selData[s.key] || 0;
            return (
              <View key={s.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 3, backgroundColor: s.color, borderRadius: 1 }} />
                  <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>{s.label}</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', color: v >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                  {'R$ ' + fmt(Math.abs(v))}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      <View onLayout={function(e) { setPcw(e.nativeEvent.layout.width); }} style={{ overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Svg width={totalW} height={height}>
            {yLabels.map(function(yl, gi) {
              return (
                <G key={gi}>
                  <SvgLine x1={padL} y1={yl.y} x2={totalW - padR} y2={yl.y}
                    stroke={C.border} strokeWidth={0.5} opacity={0.3} />
                  <SvgText x={padL} y={yl.y - 4} fill={C.dim}
                    fontSize={7} fontFamily={F.mono}>
                    {yl.v >= 1000 ? (yl.v / 1000).toFixed(1) + 'k' : yl.v < 0 ? '-' + Math.abs(yl.v).toFixed(0) : yl.v.toFixed(0)}
                  </SvgText>
                </G>
              );
            })}
            {minVal < 0 && (
              <SvgLine x1={padL} y1={zeroY} x2={totalW - padR} y2={zeroY}
                stroke={C.sub} strokeWidth={1} opacity={0.5} />
            )}
            {pSel >= 0 && pSel < data.length && (
              <SvgLine x1={xPos(pSel)} y1={padTop} x2={xPos(pSel)} y2={padTop + chartH}
                stroke={C.accent} strokeWidth={1} opacity={0.5} strokeDasharray="4,3" />
            )}
            {paths.map(function(p) {
              return (
                <Path key={p.key} d={p.d} stroke={p.color} strokeWidth={2.5}
                  fill="none" strokeDasharray={p.dash || undefined} strokeLinecap="round" strokeLinejoin="round" />
              );
            })}
            {paths.map(function(p) {
              var dots = [];
              for (var di = 0; di < data.length; di++) {
                var dx = xPos(di);
                var dy = yPos(data[di][p.key] || 0);
                var isSel = di === pSel;
                dots.push(
                  <Circle key={p.key + '_' + di} cx={dx} cy={dy} r={isSel ? 5 : 3} fill={p.color} opacity={isSel ? 1 : 0.9} />
                );
              }
              return dots;
            })}
            {data.map(function(d, ti) {
              var tx = xPos(ti);
              var hitW = Math.max(ptW * 0.8, 30);
              return (
                <SvgRect key={'hit_' + ti} x={tx - hitW / 2} y={padTop} width={hitW} height={chartH}
                  fill="transparent" onPress={function() { setPSel(pSel === ti ? -1 : ti); }} />
              );
            })}
            {data.map(function(d, xi) {
              var lx = xPos(xi);
              var showLabel = data.length <= 12 || xi % Math.ceil(data.length / 12) === 0 || xi === data.length - 1;
              if (!showLabel) return null;
              return (
                <SvgText key={xi} x={lx} y={height - padBot + 14} fill={xi === pSel ? C.accent : C.sub}
                  fontSize={7} fontFamily={F.mono} fontWeight={xi === pSel ? '700' : '400'} textAnchor="middle">
                  {d.label}
                </SvgText>
              );
            })}
          </Svg>
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        {PREM_LINE_SERIES.map(function(s) {
          var isOn = visible[s.key];
          return (
            <TouchableOpacity key={s.key} onPress={function() { onToggle(s.key); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: isOn ? 1 : 0.35 }}>
              <View style={{ width: 12, height: 3, backgroundColor: s.color, borderRadius: 1 }} />
              <Text style={{ fontSize: 9, color: isOn ? C.text : C.dim, fontFamily: F.mono }}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function RendaPassivaLineChart(props) {
  var data = props.data || [];
  var visible = props.visible || {};
  var onToggle = props.onToggle;
  var height = 220;
  var _cw = useState(0); var cw = _cw[0]; var setCw = _cw[1];
  var _sel = useState(-1); var sel = _sel[0]; var setSel = _sel[1];

  if (data.length === 0) {
    return <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 8 }}>Sem dados</Text>;
  }

  var ptW = 56;
  var totalW = Math.max(data.length * ptW, cw || 300);
  var padL = 8;
  var padR = 16;
  var padTop = 24;
  var padBot = 36;
  var chartH = height - padTop - padBot;
  var chartW = totalW - padL - padR;

  // Find min/max across visible series
  var allVals = [];
  for (var avi = 0; avi < data.length; avi++) {
    for (var avs = 0; avs < RP_SERIES.length; avs++) {
      if (visible[RP_SERIES[avs].key]) allVals.push(data[avi][RP_SERIES[avs].key] || 0);
    }
  }
  if (allVals.length === 0) allVals = [0];
  var minVal = Math.min.apply(null, allVals);
  var maxVal = Math.max.apply(null, allVals);
  if (minVal > 0) minVal = 0;
  if (maxVal <= 0) maxVal = 1;
  var range = maxVal - minVal || 1;

  function yPos(v) { return padTop + chartH * (1 - (v - minVal) / range); }
  function xPos(i) { return padL + (i / Math.max(data.length - 1, 1)) * chartW; }

  // Build paths
  var paths = [];
  for (var si = 0; si < RP_SERIES.length; si++) {
    var s = RP_SERIES[si];
    if (!visible[s.key]) continue;
    var d = '';
    for (var pi = 0; pi < data.length; pi++) {
      var px = xPos(pi);
      var py = yPos(data[pi][s.key] || 0);
      d += (pi === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
    }
    paths.push({ d: d, color: s.color, dash: s.dash, key: s.key, label: s.label });
  }

  // Y grid labels
  var ySteps = 5;
  var yLabels = [];
  for (var yi = 0; yi <= ySteps; yi++) {
    var yv = minVal + (range * yi / ySteps);
    yLabels.push({ v: yv, y: yPos(yv) });
  }

  var zeroY = yPos(0);
  var selData = sel >= 0 && sel < data.length ? data[sel] : null;

  return (
    <View>
      {/* Tooltip */}
      {selData && (
        <View style={{ backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, fontFamily: F.display }}>{selData.label}</Text>
            <TouchableOpacity onPress={function() { setSel(-1); }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>✕</Text>
            </TouchableOpacity>
          </View>
          {RP_SERIES.map(function(s) {
            if (!visible[s.key]) return null;
            var v = selData[s.key] || 0;
            return (
              <View key={s.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 3, backgroundColor: s.color, borderRadius: 1 }} />
                  <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>{s.label}</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', color: v >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                  {'R$ ' + fmt(Math.abs(v))}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      <View onLayout={function(e) { setCw(e.nativeEvent.layout.width); }} style={{ overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Svg width={totalW} height={height}>
            {/* Grid lines + Y labels */}
            {yLabels.map(function(yl, gi) {
              return (
                <G key={gi}>
                  <SvgLine x1={padL} y1={yl.y} x2={totalW - padR} y2={yl.y}
                    stroke={C.border} strokeWidth={0.5} opacity={0.3} />
                  <SvgText x={padL} y={yl.y - 4} fill={C.dim}
                    fontSize={7} fontFamily={F.mono}>
                    {yl.v >= 1000 ? (yl.v / 1000).toFixed(1) + 'k' : yl.v < 0 ? '-' + Math.abs(yl.v).toFixed(0) : yl.v.toFixed(0)}
                  </SvgText>
                </G>
              );
            })}
            {/* Zero line highlight */}
            {minVal < 0 && (
              <SvgLine x1={padL} y1={zeroY} x2={totalW - padR} y2={zeroY}
                stroke={C.sub} strokeWidth={1} opacity={0.5} />
            )}
            {/* Selected vertical line */}
            {sel >= 0 && sel < data.length && (
              <SvgLine x1={xPos(sel)} y1={padTop} x2={xPos(sel)} y2={padTop + chartH}
                stroke={C.accent} strokeWidth={1} opacity={0.5} strokeDasharray="4,3" />
            )}
            {/* Lines */}
            {paths.map(function(p) {
              return (
                <Path key={p.key} d={p.d} stroke={p.color} strokeWidth={2.5}
                  fill="none" strokeDasharray={p.dash || undefined} strokeLinecap="round" strokeLinejoin="round" />
              );
            })}
            {/* Dots */}
            {paths.map(function(p) {
              var dots = [];
              for (var di = 0; di < data.length; di++) {
                var dx = xPos(di);
                var dy = yPos(data[di][p.key] || 0);
                var isSel = di === sel;
                dots.push(
                  <Circle key={p.key + '_' + di} cx={dx} cy={dy} r={isSel ? 5 : 3} fill={p.color} opacity={isSel ? 1 : 0.9} />
                );
              }
              return dots;
            })}
            {/* Touch targets */}
            {data.map(function(d, ti) {
              var tx = xPos(ti);
              var hitW = Math.max(ptW * 0.8, 30);
              return (
                <SvgRect key={'hit_' + ti} x={tx - hitW / 2} y={padTop} width={hitW} height={chartH}
                  fill="transparent" onPress={function() { setSel(sel === ti ? -1 : ti); }} />
              );
            })}
            {/* X labels */}
            {data.map(function(d, xi) {
              var lx = xPos(xi);
              var showLabel = data.length <= 12 || xi % Math.ceil(data.length / 12) === 0 || xi === data.length - 1;
              if (!showLabel) return null;
              return (
                <SvgText key={xi} x={lx} y={height - padBot + 14} fill={xi === sel ? C.accent : C.sub}
                  fontSize={7} fontFamily={F.mono} fontWeight={xi === sel ? '700' : '400'} textAnchor="middle">
                  {d.label}
                </SvgText>
              );
            })}
          </Svg>
        </ScrollView>
      </View>
      {/* Legend toggles */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        {RP_SERIES.map(function(s) {
          var isOn = visible[s.key];
          return (
            <TouchableOpacity key={s.key} onPress={function() { onToggle(s.key); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: isOn ? 1 : 0.35 }}>
              <View style={{ width: 12, height: 3, backgroundColor: s.color, borderRadius: 1 }} />
              <Text style={{ fontSize: 9, color: isOn ? C.text : C.dim, fontFamily: F.mono }}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ═══════════ INLINE SVG: Renda Passiva Total Line Chart ═══════════

function RendaPassivaTotalChart(props) {
  var data = props.data || [];
  var height = 200;
  var _tw = useState(0); var tw = _tw[0]; var setTw = _tw[1];
  var _tSel = useState(-1); var tSel = _tSel[0]; var setTSel = _tSel[1];

  if (data.length === 0) {
    return <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 8 }}>Sem dados</Text>;
  }

  var ptW = 56;
  var totalW = Math.max(data.length * ptW, tw || 300);
  var padL = 8;
  var padR = 16;
  var padTop = 28;
  var padBot = 36;
  var chartH = height - padTop - padBot;
  var chartW = totalW - padL - padR;

  var vals = [];
  for (var vi = 0; vi < data.length; vi++) { vals.push(data[vi].total || 0); }
  var minV = Math.min.apply(null, vals);
  var maxV = Math.max.apply(null, vals);
  if (minV > 0) minV = 0;
  if (maxV <= 0) maxV = 1;
  var range = maxV - minV || 1;

  function yP(v) { return padTop + chartH * (1 - (v - minV) / range); }
  function xP(i) { return padL + (i / Math.max(data.length - 1, 1)) * chartW; }

  // Build path
  var pathD = '';
  for (var pi = 0; pi < data.length; pi++) {
    var px = xP(pi);
    var py = yP(data[pi].total || 0);
    pathD += (pi === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
  }

  // Area fill path
  var areaD = pathD + 'L' + xP(data.length - 1).toFixed(1) + ',' + yP(0).toFixed(1) + 'L' + xP(0).toFixed(1) + ',' + yP(0).toFixed(1) + 'Z';

  // Y grid
  var ySteps = 5;
  var yLabels = [];
  for (var yi = 0; yi <= ySteps; yi++) {
    var yv = minV + (range * yi / ySteps);
    yLabels.push({ v: yv, y: yP(yv) });
  }

  var zeroY = yP(0);
  var tSelData = tSel >= 0 && tSel < data.length ? data[tSel] : null;

  return (
    <View>
      {/* Tooltip */}
      {tSelData && (
        <View style={{ backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, fontFamily: F.display }}>{tSelData.label}</Text>
            <TouchableOpacity onPress={function() { setTSel(-1); }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>✕</Text>
            </TouchableOpacity>
          </View>
          {[
            { l: 'Dividendos/JCP', v: tSelData.div, c: C.acoes },
            { l: 'Rendimentos FII', v: tSelData.rend, c: C.fiis },
            { l: 'Renda Fixa', v: tSelData.rf, c: C.rf },
            { l: 'P&L Opções', v: tSelData.pl, c: C.opcoes },
          ].map(function(row) {
            return (
              <View key={row.l} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: row.c }} />
                  <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>{row.l}</Text>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '700', color: row.v >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                  {'R$ ' + fmt(Math.abs(row.v))}
                </Text>
              </View>
            );
          })}
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.text, fontFamily: F.display }}>TOTAL</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', color: tSelData.total >= 0 ? C.green : C.red, fontFamily: F.mono }}>
              {'R$ ' + fmt(Math.abs(tSelData.total))}
            </Text>
          </View>
        </View>
      )}
      <View onLayout={function(e) { setTw(e.nativeEvent.layout.width); }} style={{ overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Svg width={totalW} height={height}>
            <Defs>
              <SvgLinearGradient id="rpTotalGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.green} stopOpacity="0.25" />
                <Stop offset="1" stopColor={C.green} stopOpacity="0.02" />
              </SvgLinearGradient>
            </Defs>
            {/* Grid */}
            {yLabels.map(function(yl, gi) {
              return (
                <G key={gi}>
                  <SvgLine x1={padL} y1={yl.y} x2={totalW - padR} y2={yl.y}
                    stroke={C.border} strokeWidth={0.5} opacity={0.3} />
                  <SvgText x={padL} y={yl.y - 4} fill={C.dim} fontSize={7} fontFamily={F.mono}>
                    {yl.v >= 1000 ? (yl.v / 1000).toFixed(1) + 'k' : yl.v < 0 ? '-' + Math.abs(yl.v).toFixed(0) : yl.v.toFixed(0)}
                  </SvgText>
                </G>
              );
            })}
            {/* Zero line */}
            {minV < 0 && (
              <SvgLine x1={padL} y1={zeroY} x2={totalW - padR} y2={zeroY}
                stroke={C.sub} strokeWidth={1} opacity={0.5} />
            )}
            {/* Selected vertical line */}
            {tSel >= 0 && tSel < data.length && (
              <SvgLine x1={xP(tSel)} y1={padTop} x2={xP(tSel)} y2={padTop + chartH}
                stroke={C.accent} strokeWidth={1} opacity={0.5} strokeDasharray="4,3" />
            )}
            {/* Area fill */}
            <Path d={areaD} fill="url(#rpTotalGrad)" />
            {/* Line */}
            <Path d={pathD} stroke={C.green} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {/* Dots */}
            {data.map(function(d, di) {
              var dx = xP(di);
              var dy = yP(d.total || 0);
              var isSel = di === tSel;
              return (
                <G key={di}>
                  <Circle cx={dx} cy={dy} r={isSel ? 6 : 4} fill={C.green} opacity={isSel ? 0.3 : 0.2} />
                  <Circle cx={dx} cy={dy} r={isSel ? 4 : 2.5} fill={C.green} />
                </G>
              );
            })}
            {/* Touch targets */}
            {data.map(function(d, ti) {
              var tx = xP(ti);
              var hitW = Math.max(ptW * 0.8, 30);
              return (
                <SvgRect key={'hit_' + ti} x={tx - hitW / 2} y={padTop} width={hitW} height={chartH}
                  fill="transparent" onPress={function() { setTSel(tSel === ti ? -1 : ti); }} />
              );
            })}
            {/* X labels */}
            {data.map(function(d, xi) {
              var lx = xP(xi);
              var showLbl = data.length <= 12 || xi % Math.ceil(data.length / 12) === 0 || xi === data.length - 1;
              if (!showLbl) return null;
              return (
                <SvgText key={xi} x={lx} y={height - padBot + 14} fill={xi === tSel ? C.accent : C.sub}
                  fontSize={7} fontFamily={F.mono} fontWeight={xi === tSel ? '700' : '400'} textAnchor="middle">
                  {d.label}
                </SvgText>
              );
            })}
          </Svg>
        </ScrollView>
      </View>
    </View>
  );
}

// ═══════════ MAIN COMPONENT ═══════════

export default function AnaliseScreen() {
  var _auth = useAuth(); var user = _auth.user;

  // State
  var _sub = useState('perf'); var sub = _sub[0]; var setSub = _sub[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _dashboard = useState(null); var dashboard = _dashboard[0]; var setDashboard = _dashboard[1];
  var _positions = useState([]); var positions = _positions[0]; var setPositions = _positions[1];
  var _encerradas = useState([]); var encerradas = _encerradas[0]; var setEncerradas = _encerradas[1];
  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _operacoes = useState([]); var operacoes = _operacoes[0]; var setOperacoes = _operacoes[1];
  var _profile = useState(null); var profile = _profile[0]; var setProfile = _profile[1];
  var _perfPeriod = useState('Tudo'); var perfPeriod = _perfPeriod[0]; var setPerfPeriod = _perfPeriod[1];
  var _provFilter = useState('todos'); var provFilter = _provFilter[0]; var setProvFilter = _provFilter[1];
  var _provMonthSel = useState(-1); var provMonthSel = _provMonthSel[0]; var setProvMonthSel = _provMonthSel[1];
  var _provYearSel = useState(-1); var provYearSel = _provYearSel[0]; var setProvYearSel = _provYearSel[1];
  var _chartTouching = useState(false); var chartTouching = _chartTouching[0]; var setChartTouching = _chartTouching[1];
  var _perfSub = useState('todos'); var perfSub = _perfSub[0]; var setPerfSub = _perfSub[1];
  var _allProvMode = useState('mensal'); var allProvMode = _allProvMode[0]; var setAllProvMode = _allProvMode[1];
  var _fiiRendMode = useState('mensal'); var fiiRendMode = _fiiRendMode[0]; var setFiiRendMode = _fiiRendMode[1];
  var _fiiMonthSel = useState(-1); var fiiMonthSel = _fiiMonthSel[0]; var setFiiMonthSel = _fiiMonthSel[1];
  var _fiiYearSel = useState(-1); var fiiYearSel = _fiiYearSel[0]; var setFiiYearSel = _fiiYearSel[1];
  var _rpLineVis = useState({ div: true, rend: true, rf: true, pl: true }); var rpLineVis = _rpLineVis[0]; var setRpLineVis = _rpLineVis[1];
  var _rpRankAsc = useState(false); var rpRankAsc = _rpRankAsc[0]; var setRpRankAsc = _rpRankAsc[1];
  var _rfRendMode = useState('mensal'); var rfRendMode = _rfRendMode[0]; var setRfRendMode = _rfRendMode[1];
  var _rendaFixa = useState([]); var rendaFixa = _rendaFixa[0]; var setRendaFixa = _rendaFixa[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _opcShowCall = useState(false); var opcShowCall = _opcShowCall[0]; var setOpcShowCall = _opcShowCall[1];
  var _opcShowPut = useState(false); var opcShowPut = _opcShowPut[0]; var setOpcShowPut = _opcShowPut[1];
  var _opcPremSelected = useState(-1); var opcPremSelected = _opcPremSelected[0]; var setOpcPremSelected = _opcPremSelected[1];
  var _opcPremView = useState('mensal'); var opcPremView = _opcPremView[0]; var setOpcPremView = _opcPremView[1];
  var _opcRecView = useState('mensal'); var opcRecView = _opcRecView[0]; var setOpcRecView = _opcRecView[1];
  var _opcRecSelected = useState(-1); var opcRecSelected = _opcRecSelected[0]; var setOpcRecSelected = _opcRecSelected[1];
  var _opcPLBarView = useState('mensal'); var opcPLBarView = _opcPLBarView[0]; var setOpcPLBarView = _opcPLBarView[1];
  var _opcPLBarSelected = useState(-1); var opcPLBarSelected = _opcPLBarSelected[0]; var setOpcPLBarSelected = _opcPLBarSelected[1];
  var _premLineVis = useState({ premios: true, recompra: true, pl: true }); var premLineVis = _premLineVis[0]; var setPremLineVis = _premLineVis[1];
  var _plMonthSel = useState(-1); var plMonthSel = _plMonthSel[0]; var setPlMonthSel = _plMonthSel[1];
  var _plYearSel = useState(-1); var plYearSel = _plYearSel[0]; var setPlYearSel = _plYearSel[1];
  var _opcPLFilter = useState('todos'); var opcPLFilter = _opcPLFilter[0]; var setOpcPLFilter = _opcPLFilter[1];
  var _opcPLSortAsc = useState(false); var opcPLSortAsc = _opcPLSortAsc[0]; var setOpcPLSortAsc = _opcPLSortAsc[1];
  var _putChartVis = useState({ premio: true, recompra: true, plMedia: true }); var putChartVis = _putChartVis[0]; var setPutChartVis = _putChartVis[1];
  var _callChartVis = useState({ premio: true, recompra: true, plMedia: true }); var callChartVis = _callChartVis[0]; var setCallChartVis = _callChartVis[1];
  var _totalChartVis = useState({ premio: true, recompra: true, plMedia: true }); var totalChartVis = _totalChartVis[0]; var setTotalChartVis = _totalChartVis[1];
  var _indicators = useState([]); var indicators = _indicators[0]; var setIndicators = _indicators[1];
  var _searchTicker = useState(''); var searchTicker = _searchTicker[0]; var setSearchTicker = _searchTicker[1];
  var _searchLoading = useState(false); var searchLoading = _searchLoading[0]; var setSearchLoading = _searchLoading[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _treemapModal = useState(false); var treemapModalVisible = _treemapModal[0]; var setTreemapModal = _treemapModal[1];
  var _selectedTile = useState(null); var selectedTile = _selectedTile[0]; var setSelectedTile = _selectedTile[1];
  var _allocView = useState('aloc'); var allocView = _allocView[0]; var setAllocView = _allocView[1];
  var _sankeyFilter = useState('setor'); var sankeyFilter = _sankeyFilter[0]; var setSankeyFilter = _sankeyFilter[1];
  var _sankeyTooltip = useState(null); var sankeyTooltip = _sankeyTooltip[0]; var setSankeyTooltip = _sankeyTooltip[1];
  var _searchResult = useState(null); var searchResult = _searchResult[0]; var setSearchResult = _searchResult[1];
  var _searchError = useState(''); var searchError = _searchError[0]; var setSearchError = _searchError[1];
  var _provSub = useState('visao'); var provSub = _provSub[0]; var setProvSub = _provSub[1];
  var _savedRebalTargets = useState(null); var savedRebalTargets = _savedRebalTargets[0]; var setSavedRebalTargets = _savedRebalTargets[1];
  var _ibovHistory = useState([]); var ibovHistory = _ibovHistory[0]; var setIbovHistory = _ibovHistory[1];
  var _catShowAllEnc = useState(false); var catShowAllEnc = _catShowAllEnc[0]; var setCatShowAllEnc = _catShowAllEnc[1];
  var _catPLBarView = useState('mensal'); var catPLBarView = _catPLBarView[0]; var setCatPLBarView = _catPLBarView[1];
  var _catPLBarSelected = useState(-1); var catPLBarSelected = _catPLBarSelected[0]; var setCatPLBarSelected = _catPLBarSelected[1];

  // ── Data loading ──
  var load = async function() {
    if (!user) return;
    try {
      var results = await Promise.all([
        getDashboard(user.id),
        getProventos(user.id),
        getOperacoes(user.id),
        getProfile(user.id),
        getOpcoes(user.id),
        getIndicators(user.id),
        getRebalanceTargets(user.id),
      ]);
      var posData = results[0].positions || [];

      // Enrich unknown tickers with brapi sector data (fire-and-forget friendly)
      var allTickers = [];
      for (var ti = 0; ti < posData.length; ti++) {
        if (posData[ti].ticker) allTickers.push(posData[ti].ticker);
      }
      try { await enrichTickerSectors(allTickers); } catch (e) { /* silent */ }

      setDashboard(results[0]);
      setPositions(posData);
      setEncerradas(results[0].encerradas || []);
      setRendaFixa(results[0].rendaFixa || []);
      setProventos(results[1].data || []);
      setOperacoes(results[2].data || []);
      setProfile(results[3].data || null);
      setOpcoes(results[4].data || []);
      var indData = results[5].data || [];
      setIndicators(indData);
      setSavedRebalTargets(results[6].data || null);

      // Trigger daily calculation if stale
      var lastCalc = indData.length > 0 ? indData[0].data_calculo : null;
      if (shouldCalculateToday(lastCalc)) {
        runDailyCalculation(user.id).then(function(calcResult) {
          if (calcResult.data && calcResult.data.length > 0) {
            setIndicators(calcResult.data);
          }
        }).catch(function(e) {
          console.warn('Indicator calc failed:', e);
        });
      }

      // Fetch IBOV history for benchmark comparison (fire-and-forget)
      fetchPriceHistoryLong(['^BVSP']).then(function(histMap) {
        var ibov = histMap['^BVSP'];
        if (ibov && ibov.length > 0) {
          var pts = [];
          for (var ib = 0; ib < ibov.length; ib++) {
            if (ibov[ib].date && ibov[ib].close != null) {
              pts.push({ date: ibov[ib].date, value: ibov[ib].close });
            }
          }
          setIbovHistory(pts);
        }
      }).catch(function(e) { console.warn('IBOV fetch failed:', e); });
    } catch (e) {
      console.warn('AnaliseScreen load error:', e);
    }
    setLoading(false);
  };

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  // ── Derived: Performance ──
  var patrimonioHistory = dashboard ? (dashboard.patrimonioHistory || []) : [];
  var totalPatrimonio = dashboard ? (dashboard.patrimonio || 0) : 0;
  var selicAnual = profile ? (profile.selic || 13.25) : 13.25;

  // Filter by period
  var filteredHistory = patrimonioHistory;
  if (perfPeriod !== 'Tudo' && patrimonioHistory.length > 0) {
    var periodDef = PERIODS.find(function(p) { return p.key === perfPeriod; });
    if (periodDef && periodDef.days > 0) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDef.days);
      var cutoffStr = cutoff.toISOString().substring(0, 10);
      filteredHistory = patrimonioHistory.filter(function(pt) {
        return pt.date >= cutoffStr;
      });
    }
  }
  if (filteredHistory.length === 0 && patrimonioHistory.length > 0) {
    filteredHistory = patrimonioHistory;
  }

  // Rentabilidade do período
  var rentPct = 0;
  if (filteredHistory.length >= 2) {
    var firstVal = filteredHistory[0].value;
    var lastVal = filteredHistory[filteredHistory.length - 1].value;
    rentPct = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
  }

  // CDI do período
  var cdiPct = 0;
  if (filteredHistory.length >= 2) {
    var cdiLine = computeCDIAccumulated(filteredHistory, selicAnual);
    cdiPct = cdiLine.length > 0 ? cdiLine[cdiLine.length - 1].value : 0;
  }

  // Monthly returns for best/worst
  var monthlyReturns = computeMonthlyReturns(filteredHistory);
  var bestMonth = null;
  var worstMonth = null;
  if (monthlyReturns.length > 0) {
    bestMonth = monthlyReturns.reduce(function(best, r) {
      return r.pct > best.pct ? r : best;
    }, monthlyReturns[0]);
    worstMonth = monthlyReturns.reduce(function(worst, r) {
      return r.pct < worst.pct ? r : worst;
    }, monthlyReturns[0]);
  }

  // Weekly returns (for 1M view)
  var weeklyReturns = computeWeeklyReturns(filteredHistory);

  // Choose weekly or monthly based on period
  var useWeekly = perfPeriod === '1M';
  var chartReturns = useWeekly ? weeklyReturns : monthlyReturns;

  // CDI returns (match weekly or monthly)
  var cdiReturns = {};
  if (chartReturns.length > 0) {
    var cdiAnualPerf = (selicAnual || 13.25) - 0.10;
    if (useWeekly) {
      var cdiSemanal = (Math.pow(1 + cdiAnualPerf / 100, 1 / 52) - 1) * 100;
      for (var cwi = 0; cwi < chartReturns.length; cwi++) {
        cdiReturns[chartReturns[cwi].week || chartReturns[cwi].month] = cdiSemanal;
      }
    } else {
      var cdiMensal = (Math.pow(1 + cdiAnualPerf / 100, 1 / 12) - 1) * 100;
      for (var cmi = 0; cmi < chartReturns.length; cmi++) {
        cdiReturns[chartReturns[cmi].month] = cdiMensal;
      }
    }
  }

  // IBOV returns (match weekly or monthly)
  var ibovReturns = {};
  if (ibovHistory.length > 0 && chartReturns.length > 0) {
    if (useWeekly) {
      var ibovWR = computeWeeklyReturns(ibovHistory);
      for (var iwi = 0; iwi < ibovWR.length; iwi++) {
        ibovReturns[ibovWR[iwi].week] = ibovWR[iwi].pct;
      }
    } else {
      var ibovMR = computeMonthlyReturns(ibovHistory);
      for (var imi = 0; imi < ibovMR.length; imi++) {
        ibovReturns[ibovMR[imi].month] = ibovMR[imi].pct;
      }
    }
  }

  // Benchmark data (normalized % returns)
  var portBenchData = [];
  var cdiBenchData = [];
  if (filteredHistory.length >= 2) {
    var base = filteredHistory[0].value;
    portBenchData = filteredHistory.map(function(pt) {
      return { date: pt.date, value: base > 0 ? ((pt.value - base) / base) * 100 : 0 };
    });
    cdiBenchData = computeCDIAccumulated(filteredHistory, selicAnual);
  }

  // Drawdown series from filteredHistory
  var drawdownData = [];
  var maxDD = 0;
  if (filteredHistory.length >= 2) {
    var peak = filteredHistory[0].value;
    for (var ddi = 0; ddi < filteredHistory.length; ddi++) {
      var ddv = filteredHistory[ddi].value;
      if (ddv > peak) peak = ddv;
      var dd = peak > 0 ? ((ddv - peak) / peak) * 100 : 0;
      drawdownData.push({ date: filteredHistory[ddi].date, dd: dd });
      if (Math.abs(dd) > maxDD) maxDD = Math.abs(dd);
    }
  }

  // ── P&L Realizado (ativas + encerradas) ──
  var perfPlRealizado = 0;
  var perfPlRealizadoIR = 0;
  for (var plri = 0; plri < positions.length; plri++) {
    perfPlRealizado += (positions[plri].pl_realizado || 0);
    perfPlRealizadoIR += (positions[plri].pl_realizado_ir || 0);
  }
  for (var plei = 0; plei < encerradas.length; plei++) {
    perfPlRealizado += (encerradas[plei].pl_realizado || 0);
    perfPlRealizadoIR += (encerradas[plei].pl_realizado_ir || 0);
  }
  var perfPlAberto = 0;
  for (var plai = 0; plai < positions.length; plai++) {
    var pPos = positions[plai];
    perfPlAberto += pPos.quantidade * ((pPos.preco_atual || pPos.pm) - pPos.pm);
  }
  var perfPlTotal = perfPlRealizado + perfPlAberto;

  // ── All Proventos: Monthly + Annual (for Todos tab) ──
  var allProvMonthly = [];
  var allProvAnnual = [];
  if (proventos.length > 0) {
    var apByMonth = {};
    var apByMonthTicker = {};
    var apByYear = {};
    var apByYearTicker = {};
    for (var api = 0; api < proventos.length; api++) {
      var apProv = proventos[api];
      var apVal = apProv.valor_total || 0;
      var apDate = new Date((apProv.data_pagamento || '') + 'T12:00:00');
      if (isNaN(apDate.getTime())) continue;
      var apMKey = apDate.getFullYear() + '-' + String(apDate.getMonth() + 1).padStart(2, '0');
      if (!apByMonth[apMKey]) apByMonth[apMKey] = 0;
      apByMonth[apMKey] += apVal;
      if (!apByMonthTicker[apMKey]) apByMonthTicker[apMKey] = {};
      var apTk = (apProv.ticker || '').toUpperCase().trim();
      if (apTk) {
        if (!apByMonthTicker[apMKey][apTk]) apByMonthTicker[apMKey][apTk] = 0;
        apByMonthTicker[apMKey][apTk] += apVal;
      }
      var apYKey = String(apDate.getFullYear());
      if (!apByYear[apYKey]) apByYear[apYKey] = 0;
      apByYear[apYKey] += apVal;
      if (!apByYearTicker[apYKey]) apByYearTicker[apYKey] = {};
      if (apTk) {
        if (!apByYearTicker[apYKey][apTk]) apByYearTicker[apYKey][apTk] = 0;
        apByYearTicker[apYKey][apTk] += apVal;
      }
    }
    // Monthly: last 12
    var apNow = new Date();
    for (var apmi = 11; apmi >= 0; apmi--) {
      var apmd = new Date(apNow.getFullYear(), apNow.getMonth() - apmi, 1);
      var apmk = apmd.getFullYear() + '-' + String(apmd.getMonth() + 1).padStart(2, '0');
      var apml = MONTH_LABELS[apmd.getMonth() + 1] + '/' + String(apmd.getFullYear()).substring(2);
      allProvMonthly.push({ month: apml, value: apByMonth[apmk] || 0, tickers: apByMonthTicker[apmk] || {} });
    }
    // Annual
    var apYears = Object.keys(apByYear).sort();
    for (var apy = 0; apy < apYears.length; apy++) {
      allProvAnnual.push({ month: apYears[apy], value: apByYear[apYears[apy]], tickers: apByYearTicker[apYears[apy]] || {} });
    }
  }
  var allProvData = allProvMode === 'anual' ? allProvAnnual : allProvMonthly;
  var allProvMax = allProvData.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // ── FII Rendimentos: monthly + annual + totals ──
  var fiiTickerSet = {};
  var etfTickerSet = {};
  for (var fti = 0; fti < positions.length; fti++) {
    var ftiCat = positions[fti].categoria || 'acao';
    var ftiTk = (positions[fti].ticker || '').toUpperCase().trim();
    if (ftiCat === 'fii') fiiTickerSet[ftiTk] = true;
    if (ftiCat === 'etf') etfTickerSet[ftiTk] = true;
  }
  var fiiRendTotal = 0;
  var fiiRend12m = 0;
  var fiiRendRecebido = 0;
  var fiiRendAReceber = 0;
  var fiiRendByMonth = {};
  var fiiRendByMonthTicker = {};
  var fiiRendByYear = {};
  var fiiRendByYearTicker = {};
  var fiiRendByTicker = {};
  var fiiOneYrAgo = new Date();
  fiiOneYrAgo.setFullYear(fiiOneYrAgo.getFullYear() - 1);
  var fiiTodayStr = new Date().toISOString().substring(0, 10);
  for (var fri = 0; fri < proventos.length; fri++) {
    var frProv = proventos[fri];
    var frTk = (frProv.ticker || '').toUpperCase().trim();
    if (!fiiTickerSet[frTk]) continue;
    var frVal = frProv.valor_total || 0;
    fiiRendTotal += frVal;
    var frDateStr = (frProv.data_pagamento || '').substring(0, 10);
    var frDate = new Date(frProv.data_pagamento);
    if (frDate >= fiiOneYrAgo) fiiRend12m += frVal;
    if (frDateStr <= fiiTodayStr) { fiiRendRecebido += frVal; } else { fiiRendAReceber += frVal; }
    var frMKey = frDate.getFullYear() + '-' + String(frDate.getMonth() + 1).padStart(2, '0');
    if (!fiiRendByMonth[frMKey]) fiiRendByMonth[frMKey] = 0;
    fiiRendByMonth[frMKey] += frVal;
    if (!fiiRendByMonthTicker[frMKey]) fiiRendByMonthTicker[frMKey] = {};
    if (!fiiRendByMonthTicker[frMKey][frTk]) fiiRendByMonthTicker[frMKey][frTk] = 0;
    fiiRendByMonthTicker[frMKey][frTk] += frVal;
    var frYKey = String(frDate.getFullYear());
    if (!fiiRendByYear[frYKey]) fiiRendByYear[frYKey] = 0;
    fiiRendByYear[frYKey] += frVal;
    if (!fiiRendByYearTicker[frYKey]) fiiRendByYearTicker[frYKey] = {};
    if (!fiiRendByYearTicker[frYKey][frTk]) fiiRendByYearTicker[frYKey][frTk] = 0;
    fiiRendByYearTicker[frYKey][frTk] += frVal;
    if (!fiiRendByTicker[frTk]) fiiRendByTicker[frTk] = 0;
    fiiRendByTicker[frTk] += frVal;
  }
  var fiiRendMonthly = [];
  var fiiRendAnnual = [];
  var fiiNow = new Date();
  for (var fmi = 11; fmi >= 0; fmi--) {
    var fmd = new Date(fiiNow.getFullYear(), fiiNow.getMonth() - fmi, 1);
    var fmk = fmd.getFullYear() + '-' + String(fmd.getMonth() + 1).padStart(2, '0');
    var fml = MONTH_LABELS[fmd.getMonth() + 1] + '/' + String(fmd.getFullYear()).substring(2);
    fiiRendMonthly.push({ month: fml, value: fiiRendByMonth[fmk] || 0, tickers: fiiRendByMonthTicker[fmk] || {} });
  }
  var fiiYears = Object.keys(fiiRendByYear).sort();
  for (var fyi = 0; fyi < fiiYears.length; fyi++) {
    fiiRendAnnual.push({ month: fiiYears[fyi], value: fiiRendByYear[fiiYears[fyi]], tickers: fiiRendByYearTicker[fiiYears[fyi]] || {} });
  }
  var fiiRendMediaMensal = 0;
  var fiiRendLast3 = 0;
  for (var fl3 = Math.max(fiiRendMonthly.length - 3, 0); fl3 < fiiRendMonthly.length; fl3++) {
    fiiRendLast3 += fiiRendMonthly[fl3].value;
  }
  fiiRendMediaMensal = fiiRendLast3 / 3;

  // ── RF: monthly income estimate ──
  var rfRendaTotal = 0;
  var rfRendaMensalEst = 0;
  for (var rri = 0; rri < rendaFixa.length; rri++) {
    var rrItem = rendaFixa[rri];
    var rrValor = parseFloat(rrItem.valor_aplicado) || 0;
    var rrTaxa = parseFloat(rrItem.taxa) || 0;
    var rrIdx = rrItem.indexador || 'prefixado';
    var rrAnual = rrIdx === 'cdi' || rrIdx === 'selic' ? (selicAnual - 0.10) * (rrTaxa / 100) :
      rrIdx === 'ipca' ? rrTaxa + 4.5 : rrTaxa;
    var rrMensal = rrValor * (Math.pow(1 + rrAnual / 100, 1 / 12) - 1);
    rfRendaMensalEst += rrMensal;
    rfRendaTotal += rrValor;
  }
  var rfRendaAnualEst = rfRendaMensalEst * 12;

  // ── Derived: Category Performance (Acao/FII/ETF) ──
  var catPositions = [];
  var catTotalInvested = 0;
  var catCurrentValue = 0;
  var catPL = 0;
  var catRentPct = 0;
  var catPctCDI = 0;
  var catDividendsTotal = 0;
  var catDividends12m = 0;
  var catProvsRecebidos = 0;
  var catProvsAReceber = 0;
  var catDY = 0;
  var catYieldOnCost = 0;
  var catRetornoTotal = 0;
  var catRetornoTotalPct = 0;
  var catPesoCarteira = 0;
  var catRankedPositions = [];
  var catMonthlyDividends = [];
  var catRendaMensal = 0;
  var catMesesPositivos = 0;
  var catMesesNegativos = 0;

  if (perfSub === 'acao' || perfSub === 'fii' || perfSub === 'etf') {
    for (var cp = 0; cp < positions.length; cp++) {
      if ((positions[cp].categoria || 'acao') === perfSub) {
        catPositions.push(positions[cp]);
      }
    }
    for (var ci = 0; ci < catPositions.length; ci++) {
      var cPos = catPositions[ci];
      var cInvested = cPos.quantidade * cPos.pm;
      var cCurrent = cPos.quantidade * (cPos.preco_atual || cPos.pm);
      catTotalInvested += cInvested;
      catCurrentValue += cCurrent;
    }
    catPL = catCurrentValue - catTotalInvested;
    catRentPct = catTotalInvested > 0 ? ((catCurrentValue - catTotalInvested) / catTotalInvested) * 100 : 0;
    catPctCDI = cdiPct > 0 ? (catRentPct / cdiPct * 100) : 0;
    catPesoCarteira = totalPatrimonio > 0 ? (catCurrentValue / totalPatrimonio * 100) : 0;

    // Dividends: total, 12m, per ticker, monthly, recebidos/a receber
    var oneYrAgo = new Date();
    oneYrAgo.setFullYear(oneYrAgo.getFullYear() - 1);
    var catTickerSet = {};
    for (var ct = 0; ct < catPositions.length; ct++) {
      catTickerSet[catPositions[ct].ticker] = true;
    }
    var catProvByMonth = {};
    var catProvByMonthTicker = {}; // { 'YYYY-MM': { ticker: valor } }
    var catProvByTicker = {};
    var catTodayStr = new Date().toISOString().substring(0, 10);
    var catProvByMonthRecebido = {}; // only received proventos
    for (var cdp = 0; cdp < proventos.length; cdp++) {
      var prov = proventos[cdp];
      if (!catTickerSet[prov.ticker]) continue;
      var provVal = prov.valor_total || 0;
      catDividendsTotal += provVal;
      var provDateStr = (prov.data_pagamento || '').substring(0, 10);
      var provPago = provDateStr <= catTodayStr;
      if (provPago) {
        catProvsRecebidos += provVal;
      } else {
        catProvsAReceber += provVal;
      }
      var provDate = new Date(prov.data_pagamento);
      if (provDate >= oneYrAgo) catDividends12m += provVal;
      var pmKey = provDate.getFullYear() + '-' + String(provDate.getMonth() + 1).padStart(2, '0');
      if (!catProvByMonth[pmKey]) catProvByMonth[pmKey] = 0;
      catProvByMonth[pmKey] += provVal;
      if (provPago) {
        if (!catProvByMonthRecebido[pmKey]) catProvByMonthRecebido[pmKey] = 0;
        catProvByMonthRecebido[pmKey] += provVal;
      }
      if (!catProvByMonthTicker[pmKey]) catProvByMonthTicker[pmKey] = {};
      if (!catProvByMonthTicker[pmKey][prov.ticker]) catProvByMonthTicker[pmKey][prov.ticker] = 0;
      catProvByMonthTicker[pmKey][prov.ticker] += provVal;
      if (!catProvByTicker[prov.ticker]) catProvByTicker[prov.ticker] = { total: 0, last12m: 0 };
      catProvByTicker[prov.ticker].total += provVal;
      if (provDate >= oneYrAgo) catProvByTicker[prov.ticker].last12m += provVal;
    }
    catYieldOnCost = catTotalInvested > 0 ? (catDividends12m / catTotalInvested * 100) : 0;
    catDY = catCurrentValue > 0 ? (catDividends12m / catCurrentValue * 100) : 0;
    catRetornoTotal = catPL + catDividendsTotal;
    catRetornoTotalPct = catTotalInvested > 0 ? (catRetornoTotal / catTotalInvested * 100) : 0;

    // Monthly dividends: last 12 months for chart
    var nowCat = new Date();
    for (var cmi = 11; cmi >= 0; cmi--) {
      var cmd = new Date(nowCat.getFullYear(), nowCat.getMonth() - cmi, 1);
      var cmk = cmd.getFullYear() + '-' + String(cmd.getMonth() + 1).padStart(2, '0');
      var cml = MONTH_LABELS[cmd.getMonth() + 1] + '/' + String(cmd.getFullYear()).substring(2);
      catMonthlyDividends.push({ month: cml, value: catProvByMonth[cmk] || 0, tickers: catProvByMonthTicker[cmk] || {} });
    }

    // Renda mensal media (ultimos 3 meses — somente recebidos)
    var last3sum = 0;
    var last3count = 0;
    for (var l3 = Math.max(catMonthlyDividends.length - 3, 0); l3 < catMonthlyDividends.length; l3++) {
      var l3key = (function() {
        var l3d = new Date(nowCat.getFullYear(), nowCat.getMonth() - (catMonthlyDividends.length - 1 - l3), 1);
        return l3d.getFullYear() + '-' + String(l3d.getMonth() + 1).padStart(2, '0');
      })();
      last3sum += (catProvByMonthRecebido[l3key] || 0);
      last3count++;
    }
    catRendaMensal = last3count > 0 ? last3sum / last3count : 0;

    // Monthly returns for win/loss count
    if (monthlyReturns.length > 0) {
      for (var cmr = 0; cmr < monthlyReturns.length; cmr++) {
        if (monthlyReturns[cmr].pct >= 0) catMesesPositivos++;
        else catMesesNegativos++;
      }
    }

    // Ranked positions with retorno total, DY, peso
    var ranked = [];
    for (var rp = 0; rp < catPositions.length; rp++) {
      var rPos = catPositions[rp];
      var rInvested = rPos.quantidade * rPos.pm;
      var rCurrent = rPos.quantidade * (rPos.preco_atual || rPos.pm);
      var rPL = rCurrent - rInvested;
      var rPLPct = rInvested > 0 ? ((rCurrent - rInvested) / rInvested) * 100 : 0;
      var rProvs = catProvByTicker[rPos.ticker] || { total: 0, last12m: 0 };
      var rRetTotal = rPL + rProvs.total;
      var rRetTotalPct = rInvested > 0 ? (rRetTotal / rInvested * 100) : 0;
      var rDY = rCurrent > 0 ? (rProvs.last12m / rCurrent * 100) : 0;
      var rYoC = rInvested > 0 ? (rProvs.last12m / rInvested * 100) : 0;
      var rPeso = totalPatrimonio > 0 ? (rCurrent / totalPatrimonio * 100) : 0;
      ranked.push({
        ticker: rPos.ticker,
        invested: rInvested,
        current: rCurrent,
        pl: rPL,
        plPct: rPLPct,
        retTotal: rRetTotal,
        retTotalPct: rRetTotalPct,
        dy: rDY,
        yoc: rYoC,
        peso: rPeso,
        proventos12m: rProvs.last12m,
        quantidade: rPos.quantidade,
        pm: rPos.pm,
        preco_atual: rPos.preco_atual || rPos.pm,
        change_day: rPos.change_day || 0,
      });
    }
    ranked.sort(function(a, b) { return b.retTotalPct - a.retTotalPct; });
    catRankedPositions = ranked;
  }

  // ── Derived: Category P&L (realizado, aberto, encerradas, por período) ──
  var catPlRealizado = 0;
  var catPlAberto = 0;
  var catPlTotal = 0;
  var catEncerradas = [];
  var catComVendas = 0;
  var catPlByMonth = {};
  var catPlMonthly = [];
  var catPlAnnual = [];

  if (perfSub === 'acao' || perfSub === 'fii' || perfSub === 'etf') {
    // P&L Realizado (posições ativas com vendas + encerradas)
    for (var cpri = 0; cpri < positions.length; cpri++) {
      if ((positions[cpri].categoria || 'acao') === perfSub) {
        catPlRealizado += (positions[cpri].pl_realizado || 0);
        if ((positions[cpri].total_vendido || 0) > 0) catComVendas++;
      }
    }
    for (var cpei = 0; cpei < encerradas.length; cpei++) {
      if ((encerradas[cpei].categoria || 'acao') === perfSub) {
        catPlRealizado += (encerradas[cpei].pl_realizado || 0);
        catEncerradas.push(encerradas[cpei]);
      }
    }
    // Ordenar encerradas por |pl_realizado| desc
    catEncerradas.sort(function(a, b) { return Math.abs(b.pl_realizado || 0) - Math.abs(a.pl_realizado || 0); });

    // P&L Aberto (posições ativas)
    for (var cpai = 0; cpai < catPositions.length; cpai++) {
      var cpPos = catPositions[cpai];
      catPlAberto += cpPos.quantidade * ((cpPos.preco_atual || cpPos.pm) - cpPos.pm);
    }
    catPlTotal = catPlRealizado + catPlAberto;

    // P&L por período
    catPlByMonth = computeCatPLByMonth(operacoes, perfSub);
    var plMonthKeys = Object.keys(catPlByMonth).sort();

    // Últimos 12 meses
    var nowPl = new Date();
    for (var plmi = 11; plmi >= 0; plmi--) {
      var plmd = new Date(nowPl.getFullYear(), nowPl.getMonth() - plmi, 1);
      var plmk = plmd.getFullYear() + '-' + String(plmd.getMonth() + 1).padStart(2, '0');
      var plml = MONTH_LABELS[plmd.getMonth() + 1] + '/' + String(plmd.getFullYear()).substring(2);
      var plmData = catPlByMonth[plmk] || { pl: 0, count: 0, tickers: {} };
      catPlMonthly.push({ month: plmk, label: plml, pl: plmData.pl, count: plmData.count, tickers: plmData.tickers });
    }

    // Por ano
    var plYearMap = {};
    for (var plyi = 0; plyi < plMonthKeys.length; plyi++) {
      var plyYear = plMonthKeys[plyi].substring(0, 4);
      var plyd = catPlByMonth[plMonthKeys[plyi]];
      if (!plYearMap[plyYear]) plYearMap[plyYear] = { pl: 0, count: 0, tickers: {} };
      plYearMap[plyYear].pl += plyd.pl;
      plYearMap[plyYear].count += plyd.count;
      var plydTickers = plyd.tickers || {};
      var plydTKeys = Object.keys(plydTickers);
      for (var plytk = 0; plytk < plydTKeys.length; plytk++) {
        var plyTicker = plydTKeys[plytk];
        if (!plYearMap[plyYear].tickers[plyTicker]) plYearMap[plyYear].tickers[plyTicker] = 0;
        plYearMap[plyYear].tickers[plyTicker] += plydTickers[plyTicker];
      }
    }
    var plYearKeys = Object.keys(plYearMap).sort();
    for (var plyj = 0; plyj < plYearKeys.length; plyj++) {
      var plyData = plYearMap[plYearKeys[plyj]];
      catPlAnnual.push({ year: plYearKeys[plyj], label: plYearKeys[plyj], pl: plyData.pl, count: plyData.count, tickers: plyData.tickers });
    }
  }

  // ── Derived: RF Performance ──
  var rfItems = [];
  var rfTotalAplicado = 0;
  var rfTotalAtual = 0;
  var rfRentBruta = 0;
  var rfRentLiquida = 0;
  var rfPctCDI = 0;
  var rfByTipo = {};
  var rfByIndexador = {};
  var rfSortedByMaturity = [];
  var rfWeightedRate = 0;
  var rfEnriched = [];

  if (perfSub === 'rf') {
    var hojeRF = new Date();
    for (var rfi = 0; rfi < rendaFixa.length; rfi++) {
      var rfItem = rendaFixa[rfi];
      rfItems.push(rfItem);
      var rfValor = parseFloat(rfItem.valor_aplicado) || 0;
      rfTotalAplicado += rfValor;

      var rfTipo = rfItem.tipo || 'cdb';
      if (!rfByTipo[rfTipo]) rfByTipo[rfTipo] = { count: 0, valor: 0, valorAtual: 0 };
      rfByTipo[rfTipo].count += 1;
      rfByTipo[rfTipo].valor += rfValor;

      var rfIdx = rfItem.indexador || 'prefixado';
      if (!rfByIndexador[rfIdx]) rfByIndexador[rfIdx] = { count: 0, valor: 0, valorAtual: 0 };
      rfByIndexador[rfIdx].count += 1;
      rfByIndexador[rfIdx].valor += rfValor;

      rfWeightedRate += (parseFloat(rfItem.taxa) || 0) * rfValor;

      // MtM estimado
      var dataAplic = rfItem.data_aplicacao || rfItem.created_at || '';
      var valorAtualEst = rfValorAtualEstimado(rfValor, parseFloat(rfItem.taxa) || 0, rfIdx, dataAplic, selicAnual);
      rfTotalAtual += valorAtualEst;
      rfByTipo[rfTipo].valorAtual += valorAtualEst;
      rfByIndexador[rfIdx].valorAtual += valorAtualEst;

      // Per-item enrichment
      var diasCorr = Math.max(Math.ceil((hojeRF - new Date(dataAplic)) / (1000 * 60 * 60 * 24)), 0);
      var isIsento = RF_ISENTOS[rfTipo] || false;
      var aliqIR = isIsento ? 0 : rfIRAliquota(diasCorr);
      var rendBruto = valorAtualEst - rfValor;
      var irDevido = rendBruto > 0 ? rendBruto * aliqIR : 0;
      var rendLiquido = rendBruto - irDevido;
      var rentBrutaPct = rfValor > 0 ? (rendBruto / rfValor * 100) : 0;
      var rentLiqPct = rfValor > 0 ? (rendLiquido / rfValor * 100) : 0;
      var diasVenc = Math.ceil((new Date(rfItem.vencimento) - hojeRF) / (1000 * 60 * 60 * 24));
      var cdiEquiv = isIsento ? rfCDIEquivalente(parseFloat(rfItem.taxa) || 0, rfIRAliquota(Math.max(diasVenc, diasCorr))) : 0;

      rfEnriched.push({
        item: rfItem,
        valorAtual: valorAtualEst,
        rendBruto: rendBruto,
        rendLiquido: rendLiquido,
        rentBrutaPct: rentBrutaPct,
        rentLiqPct: rentLiqPct,
        aliqIR: aliqIR,
        irFaixa: isIsento ? 'Isento' : rfIRFaixa(diasCorr),
        isIsento: isIsento,
        diasCorridos: diasCorr,
        diasVenc: diasVenc,
        cdiEquiv: cdiEquiv,
      });
    }
    rfWeightedRate = rfTotalAplicado > 0 ? rfWeightedRate / rfTotalAplicado : 0;
    rfRentBruta = rfTotalAplicado > 0 ? ((rfTotalAtual - rfTotalAplicado) / rfTotalAplicado * 100) : 0;

    // Rent liquida agregada
    var rfTotalRendLiq = 0;
    for (var rle = 0; rle < rfEnriched.length; rle++) {
      rfTotalRendLiq += rfEnriched[rle].rendLiquido;
    }
    rfRentLiquida = rfTotalAplicado > 0 ? (rfTotalRendLiq / rfTotalAplicado * 100) : 0;
    rfPctCDI = cdiPct > 0 ? (rfRentBruta / cdiPct * 100) : 0;

    rfSortedByMaturity = rfEnriched.slice().sort(function(a, b) {
      return a.diasVenc - b.diasVenc;
    });
  }

  // ── Derived: Opcoes Performance ──
  var opcAtivas = [];
  var opcEncerradas = [];
  var opcTotalPremiosRecebidos = 0;
  var opcTotalPremiosFechamento = 0;
  var opcPLTotal = 0;
  var opcByStatus = {};
  var opcByTipo = { call: { count: 0, premio: 0 }, put: { count: 0, premio: 0 } };
  var opcByBase = {};
  var opcProxVenc = [];
  var opcWinRate = 0;
  var opcWins = 0;
  var opcLosses = 0;
  var opcTaxaExercicio = 0;
  var opcTaxaExpirouPO = 0;
  var opcTaxaMediaMensal = 0;
  var opcPremiumYield = 0;
  var opcMonthlyPremiums = [];

  {
    var nowOpc = new Date();
    var opcTaxaMensalSum = 0;
    var opcTaxaMensalCount = 0;
    var opcPremByMonth = {};
    var opcPLByMonth = {};

    for (var oi = 0; oi < opcoes.length; oi++) {
      var op = opcoes[oi];
      var premioTotal = (op.premio || 0) * (op.quantidade || 0);
      var status = op.status || 'ativa';

      if (!opcByStatus[status]) opcByStatus[status] = { count: 0, premio: 0, call: 0, put: 0 };
      opcByStatus[status].count += 1;
      opcByStatus[status].premio += premioTotal;
      opcByStatus[status][op.tipo || 'call'] += 1;

      var direcao = op.direcao || 'venda';
      var isVenda = direcao === 'venda' || direcao === 'lancamento';

      if (isVenda) {
        opcTotalPremiosRecebidos += premioTotal;
      }

      var tipo = op.tipo || 'call';
      opcByTipo[tipo].count += 1;
      opcByTipo[tipo].premio += premioTotal;

      var base2 = op.ativo_base || 'N/A';
      if (!opcByBase[base2]) opcByBase[base2] = { count: 0, premioRecebido: 0, pl: 0, call_premio: 0, call_pl: 0, put_premio: 0, put_pl: 0 };
      opcByBase[base2].count += 1;

      // Taxa mensal equivalente (normalizada por DTE)
      if (isVenda && op.strike > 0) {
        var taxaPremio = premioTotal / ((op.strike || 1) * (op.quantidade || 1)) * 100;
        var vencOp = new Date(op.vencimento);
        var criadoOp = new Date(op.created_at || op.vencimento);
        var dteOp = Math.max(Math.ceil((vencOp - criadoOp) / (1000 * 60 * 60 * 24)), 1);
        var taxaMensal = (Math.pow(1 + taxaPremio / 100, 30 / dteOp) - 1) * 100;
        opcTaxaMensalSum += taxaMensal;
        opcTaxaMensalCount++;
      }

      // Monthly premium tracking (D+1 settlement)
      if (isVenda) {
        var dataRef = op.data_abertura || op.created_at || op.vencimento || '';
        if (dataRef) {
          var dReceb = new Date(dataRef);
          dReceb.setDate(dReceb.getDate() + 1);
          var opMonth = dReceb.getFullYear() + '-' + String(dReceb.getMonth() + 1).padStart(2, '0');
          if (!opcPremByMonth[opMonth]) opcPremByMonth[opMonth] = { total: 0, call: 0, put: 0, recompra: 0, recompra_call: 0, recompra_put: 0, exercida_call: 0, exercida_put: 0 };
          opcPremByMonth[opMonth].total += premioTotal;
          opcPremByMonth[opMonth][tipo] += premioTotal;
        }
      }

      if (status === 'ativa') {
        opcAtivas.push(op);
        if (isVenda) {
          opcByBase[base2].premioRecebido += premioTotal;
          opcByBase[base2].pl += premioTotal;
          opcByBase[base2][tipo + '_premio'] += premioTotal;
          opcByBase[base2][tipo + '_pl'] += premioTotal;
        }
        var vencDate = new Date(op.vencimento);
        var daysToExp = Math.ceil((vencDate - nowOpc) / (1000 * 60 * 60 * 24));
        if (daysToExp <= 30 && daysToExp >= 0) {
          opcProxVenc.push({ op: op, daysLeft: daysToExp });
        }
      } else {
        opcEncerradas.push(op);
        var premioFech = (op.premio_fechamento || 0) * (op.quantidade || 0);
        if (isVenda) {
          var plOp = premioTotal - premioFech;
          opcPLTotal += plOp;
          opcTotalPremiosFechamento += premioFech;
          // P&L por mês de encerramento (resultado da operação no mês que fechou)
          var dataEnc = op.data_fechamento || op.updated_at || op.vencimento || '';
          if (dataEnc) {
            var dEnc = new Date(dataEnc);
            var encMonth = dEnc.getFullYear() + '-' + String(dEnc.getMonth() + 1).padStart(2, '0');
            if (!opcPLByMonth[encMonth]) opcPLByMonth[encMonth] = { total: 0, call: 0, put: 0 };
            opcPLByMonth[encMonth].total += plOp;
            opcPLByMonth[encMonth][tipo] += plOp;
          }
          // Register recompra in the closing month (regime de caixa)
          if (premioFech > 0) {
            var dataFech = op.updated_at || op.vencimento || '';
            if (dataFech) {
              var dFech = new Date(dataFech);
              var fechMonth = dFech.getFullYear() + '-' + String(dFech.getMonth() + 1).padStart(2, '0');
              if (!opcPremByMonth[fechMonth]) opcPremByMonth[fechMonth] = { total: 0, call: 0, put: 0, recompra: 0, recompra_call: 0, recompra_put: 0, exercida_call: 0, exercida_put: 0 };
              opcPremByMonth[fechMonth].recompra += premioFech;
              opcPremByMonth[fechMonth]['recompra_' + tipo] += premioFech;
            }
          }
          // Track exercised by month and tipo
          if (status === 'exercida') {
            var exVenc = op.vencimento || op.updated_at || '';
            if (exVenc) {
              var dEx = new Date(exVenc);
              var exMonth = dEx.getFullYear() + '-' + String(dEx.getMonth() + 1).padStart(2, '0');
              if (!opcPremByMonth[exMonth]) opcPremByMonth[exMonth] = { total: 0, call: 0, put: 0, recompra: 0, recompra_call: 0, recompra_put: 0, exercida_call: 0, exercida_put: 0 };
              opcPremByMonth[exMonth]['exercida_' + tipo] += 1;
            }
          }
          opcByBase[base2].premioRecebido += premioTotal;
          opcByBase[base2].pl += plOp;
          opcByBase[base2][tipo + '_premio'] += premioTotal;
          opcByBase[base2][tipo + '_pl'] += plOp;
          if (plOp >= 0) opcWins++; else opcLosses++;
        }
      }
    }
    opcProxVenc.sort(function(a, b) { return a.daysLeft - b.daysLeft; });

    // Win rate
    var opcTotalEncerradasVenda = opcWins + opcLosses;
    opcWinRate = opcTotalEncerradasVenda > 0 ? (opcWins / opcTotalEncerradasVenda * 100) : 0;

    // Taxa exercício / virou pó
    var exercidas = (opcByStatus.exercida && opcByStatus.exercida.count) || 0;
    var expirouPO = (opcByStatus.expirou_po && opcByStatus.expirou_po.count) || 0;
    var totalEncerradasAll = opcEncerradas.length;
    opcTaxaExercicio = totalEncerradasAll > 0 ? (exercidas / totalEncerradasAll * 100) : 0;
    opcTaxaExpirouPO = totalEncerradasAll > 0 ? (expirouPO / totalEncerradasAll * 100) : 0;

    // Taxa media mensal
    opcTaxaMediaMensal = opcTaxaMensalCount > 0 ? opcTaxaMensalSum / opcTaxaMensalCount : 0;

    // Premium yield: premios 12m / valor carteira
    var premios12mOpc = 0;
    var oneYrAgoOpc = new Date();
    oneYrAgoOpc.setFullYear(oneYrAgoOpc.getFullYear() - 1);
    for (var py = 0; py < opcoes.length; py++) {
      var pyOp = opcoes[py];
      var pyDir = pyOp.direcao || 'venda';
      var pyVenda = pyDir === 'venda' || pyDir === 'lancamento';
      if (pyVenda) {
        var pyDate = new Date(pyOp.created_at || pyOp.vencimento || '');
        if (pyDate >= oneYrAgoOpc) {
          premios12mOpc += (pyOp.premio || 0) * (pyOp.quantidade || 0);
        }
      }
    }
    opcPremiumYield = totalPatrimonio > 0 ? (premios12mOpc / totalPatrimonio * 100) : 0;

    // Monthly premium chart: last 12 months
    for (var omi = 11; omi >= 0; omi--) {
      var omd = new Date(nowOpc.getFullYear(), nowOpc.getMonth() - omi, 1);
      var omk = omd.getFullYear() + '-' + String(omd.getMonth() + 1).padStart(2, '0');
      var oml = MONTH_LABELS[omd.getMonth() + 1] + '/' + String(omd.getFullYear()).substring(2);
      var omData = opcPremByMonth[omk] || { total: 0, call: 0, put: 0, recompra: 0, recompra_call: 0, recompra_put: 0, exercida_call: 0, exercida_put: 0 };
      opcMonthlyPremiums.push({ month: oml, total: omData.total, call: omData.call, put: omData.put, recompra: omData.recompra || 0, recompra_call: omData.recompra_call || 0, recompra_put: omData.recompra_put || 0, exercida_call: omData.exercida_call || 0, exercida_put: omData.exercida_put || 0 });
    }
  }

  // Recompra monthly data (derived from opcMonthlyPremiums)
  var recMonthlyData = [];
  for (var rmi = 0; rmi < opcMonthlyPremiums.length; rmi++) {
    var rmd = opcMonthlyPremiums[rmi];
    recMonthlyData.push({ month: rmd.month, total: rmd.recompra || 0, call: rmd.recompra_call || 0, put: rmd.recompra_put || 0, value: rmd.recompra || 0 });
  }

  // P&L encerradas por mês (resultado completo da operação no mês de encerramento)
  var plMonthlyData = [];
  var plMonthlyColors = [];
  var nowPL = new Date();
  for (var pli = 11; pli >= 0; pli--) {
    var plDate = new Date(nowPL.getFullYear(), nowPL.getMonth() - pli, 1);
    var plKey = plDate.getFullYear() + '-' + String(plDate.getMonth() + 1).padStart(2, '0');
    var plLabel = MONTH_LABELS[plDate.getMonth() + 1] + '/' + String(plDate.getFullYear()).substring(2);
    var plD = opcPLByMonth[plKey] || { total: 0, call: 0, put: 0 };
    plMonthlyData.push({ month: plLabel, total: Math.abs(plD.total), call: plD.call, put: plD.put, value: plD.total });
    plMonthlyColors.push(plD.total >= 0 ? C.green : C.red);
  }

  // ── Derived: Alocação ──
  var alocGrouped = {};
  var totalAlocPatrimonio = 0;
  positions.forEach(function(p) {
    var cat = p.categoria || 'acao';
    var valor = p.quantidade * (p.preco_atual || p.pm);
    if (!alocGrouped[cat]) alocGrouped[cat] = 0;
    alocGrouped[cat] += valor;
    totalAlocPatrimonio += valor;
  });
  // Include RF in allocation
  var rfTotalAloc = rendaFixa.reduce(function(s, r) { return s + (r.valor_aplicado || 0); }, 0);
  if (rfTotalAloc > 0) {
    alocGrouped.rf = rfTotalAloc;
    totalAlocPatrimonio += rfTotalAloc;
  }

  // ── Derived: Asset list (for treemap + rentabilidade) ──
  var assetList = positions.map(function(p) {
    var val = p.quantidade * (p.preco_atual || p.pm);
    var custo = p.quantidade * p.pm;
    var pnlPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
    return { ticker: p.ticker, weight: val, pnlPct: pnlPct, color: PRODUCT_COLORS[p.categoria] || C.accent,
      categoria: p.categoria, pnl: val - custo };
  });
  var sortedByPnl = assetList.slice().sort(function(a, b) { return b.pnlPct - a.pnlPct; });
  var maxAbsPnl = sortedByPnl.reduce(function(m, a) { return Math.max(m, Math.abs(a.pnlPct)); }, 1);

  // ── Derived: P&L by class ──
  var pnlByClass = {};
  assetList.forEach(function(a) {
    var cat = a.categoria || 'outro';
    pnlByClass[cat] = (pnlByClass[cat] || 0) + a.pnl;
  });
  var pnlClassList = Object.keys(pnlByClass).map(function(k) {
    return { label: CAT_NAMES_FULL[k] || k, val: pnlByClass[k], color: PRODUCT_COLORS[k] || C.accent };
  });
  pnlClassList.sort(function(a, b) { return Math.abs(b.val) - Math.abs(a.val); });
  var maxAbsClassPnl = pnlClassList.reduce(function(m, c) { return Math.max(m, Math.abs(c.val)); }, 1);

  // ── Derived: Allocation segments (donut) ──
  var allocSegments = Object.keys(alocGrouped).filter(function (k) { return alocGrouped[k] > 0; }).map(function (k) {
    return {
      label: CAT_NAMES_FULL[k] || k,
      pct: totalAlocPatrimonio > 0 ? (alocGrouped[k] / totalAlocPatrimonio) * 100 : 0,
      color: PRODUCT_COLORS[k] || C.accent,
      val: alocGrouped[k],
    };
  });

  // ── Derived: Peso por ativo ──
  var pesoList = assetList.slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (a) {
    return { ticker: a.ticker, pct: totalAlocPatrimonio > 0 ? (a.weight / totalAlocPatrimonio) * 100 : 0, color: a.color };
  });

  // ── Derived: Treemap items (with change_day) ──
  var treemapItems = positions.map(function (p) {
    var val = p.quantidade * (p.preco_atual || p.pm);
    var custo = p.quantidade * p.pm;
    var pnlPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
    return {
      ticker: p.ticker,
      weight: val,
      pnlPct: pnlPct,
      color: PRODUCT_COLORS[p.categoria] || C.accent,
      categoria: p.categoria,
      pnl: val - custo,
      change_day: p.change_day || 0,
      quantidade: p.quantidade,
      pm: p.pm,
      preco_atual: p.preco_atual || p.pm,
    };
  });

  // ── Derived: Sankey data ──
  var compData = buildCompData(positions, sankeyFilter, alocGrouped, totalAlocPatrimonio);

  // ── Derived: Proventos ──
  var now = new Date();
  var todayProvStr = now.toISOString().substring(0, 10);
  var oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Analise usa todos os proventos (pagos + a receber)
  var filteredProventos = proventos;
  if (provFilter !== 'todos') {
    filteredProventos = proventos.filter(function(p) {
      return p.tipo_provento === provFilter;
    });
  }

  var totalProvs = filteredProventos.reduce(function(s, p) { return s + (p.valor_total || 0); }, 0);

  // Proventos 12 meses (todos, sem filtro de tipo)
  var proventos12m = 0;
  proventos.forEach(function(p) {
    var pd = new Date(p.data_pagamento + 'T12:00:00');
    if (pd >= oneYearAgo) proventos12m += (p.valor_total || 0);
  });

  // Yield on cost
  var totalCusto = positions.reduce(function(s, p) { return s + p.quantidade * p.pm; }, 0);
  var yieldOnCost = totalCusto > 0 ? (proventos12m / totalCusto) * 100 : 0;

  // Media mensal (12 meses)
  var mediaMensal = proventos12m / 12;

  // Proventos sem ETFs (para aba Proventos)
  var provSemEtf = proventos.filter(function(p) {
    var ptk = (p.ticker || '').toUpperCase().trim();
    return !etfTickerSet[ptk];
  });
  var provSemEtfRecebido = 0;
  var provSemEtfAReceber = 0;
  var provSemEtf12m = 0;
  for (var pse = 0; pse < provSemEtf.length; pse++) {
    var pseP = provSemEtf[pse];
    var pseDate = (pseP.data_pagamento || '').substring(0, 10);
    var pseVal = pseP.valor_total || 0;
    var psePd = new Date(pseP.data_pagamento + 'T12:00:00');
    if (pseDate <= todayProvStr) { provSemEtfRecebido += pseVal; } else { provSemEtfAReceber += pseVal; }
    if (psePd >= oneYearAgo && pseDate <= todayProvStr) provSemEtf12m += pseVal;
  }
  var custoSemEtf = positions.reduce(function(s, p) {
    if ((p.categoria || 'acao') === 'etf') return s;
    return s + p.quantidade * p.pm;
  }, 0);
  var valorAtualSemEtf = positions.reduce(function(s, p) {
    if ((p.categoria || 'acao') === 'etf') return s;
    return s + p.quantidade * (p.preco_atual || p.pm);
  }, 0);
  var provYoC = custoSemEtf > 0 ? (provSemEtf12m / custoSemEtf) * 100 : 0;
  var provDY = valorAtualSemEtf > 0 ? (provSemEtf12m / valorAtualSemEtf) * 100 : 0;

  // Heatmap: ações — dividendos acumulados por ticker por mês do ano (Jan-Dez)
  var hmTickers = {};
  var hmMonths = [];
  for (var hmi = 1; hmi <= 12; hmi++) {
    hmMonths.push({ key: String(hmi), label: MONTH_LABELS[hmi] });
  }
  for (var hmp = 0; hmp < proventos.length; hmp++) {
    var hmProv = proventos[hmp];
    var hmTk = (hmProv.ticker || '').toUpperCase().trim();
    if (etfTickerSet[hmTk] || fiiTickerSet[hmTk]) continue;
    var hmPd = hmProv.data_pagamento || '';
    if (hmPd.length < 7) continue;
    var hmMes = String(parseInt(hmPd.substring(5, 7)));
    var hmVal = hmProv.valor_total || 0;
    if (!hmTickers[hmTk]) hmTickers[hmTk] = {};
    if (!hmTickers[hmTk][hmMes]) hmTickers[hmTk][hmMes] = 0;
    hmTickers[hmTk][hmMes] += hmVal;
  }
  var hmTickerList = Object.keys(hmTickers).sort();
  // Global max for color scale
  var hmMaxVal = 0;
  for (var hmtk = 0; hmtk < hmTickerList.length; hmtk++) {
    var hmData = hmTickers[hmTickerList[hmtk]];
    for (var hmm = 0; hmm < hmMonths.length; hmm++) {
      var hmv = hmData[hmMonths[hmm].key] || 0;
      if (hmv > hmMaxVal) hmMaxVal = hmv;
    }
  }

  // Meta mensal
  var metaMensal = profile ? (profile.meta_mensal || 0) : 0;
  var metaPct = metaMensal > 0 ? Math.min((mediaMensal / metaMensal) * 100, 100) : 0;

  // SELIC
  var selicRate = profile ? (profile.selic || 13.25) : 13.25;

  // Proventos grouped by month (para chart)
  var provsByMonth = {};
  filteredProventos.forEach(function(p) {
    var pdate = (p.data_pagamento || '').substring(0, 7);
    if (!provsByMonth[pdate]) provsByMonth[pdate] = [];
    provsByMonth[pdate].push(p);
  });

  // ── Current month proventos by corretora ──
  var currentMonth = now.toISOString().substring(0, 7);
  var posCorretMap = {};
  for (var pci = 0; pci < positions.length; pci++) {
    var posTk = (positions[pci].ticker || '').toUpperCase().trim();
    if (positions[pci].por_corretora) {
      posCorretMap[posTk] = positions[pci].por_corretora;
    }
  }
  var provMesAtual = filteredProventos.filter(function(p) {
    return (p.data_pagamento || '').substring(0, 7) === currentMonth;
  });
  var corretoraMap = {};
  for (var pmi = 0; pmi < provMesAtual.length; pmi++) {
    var prov = provMesAtual[pmi];
    var provTk = (prov.ticker || '').toUpperCase().trim();
    var isPago = (prov.data_pagamento || '') <= todayProvStr;
    if (prov.corretora) {
      addProvToCorretora(corretoraMap, prov.corretora, prov, prov.quantidade || 0, prov.valor_total || 0, isPago);
    } else {
      var tkCorr = posCorretMap[provTk];
      if (tkCorr) {
        var corrKeysArr = Object.keys(tkCorr);
        var totalQtyCorr = 0;
        for (var cki = 0; cki < corrKeysArr.length; cki++) {
          totalQtyCorr += (tkCorr[corrKeysArr[cki]] || 0);
        }
        if (totalQtyCorr > 0 && corrKeysArr.length > 0) {
          for (var ckj = 0; ckj < corrKeysArr.length; ckj++) {
            var corrQty = tkCorr[corrKeysArr[ckj]] || 0;
            if (corrQty <= 0) continue;
            var ratio = corrQty / totalQtyCorr;
            var corrValor = (prov.valor_total || 0) * ratio;
            addProvToCorretora(corretoraMap, corrKeysArr[ckj], prov, Math.round(corrQty), corrValor, isPago);
          }
        } else {
          addProvToCorretora(corretoraMap, 'Sem corretora', prov, prov.quantidade || 0, prov.valor_total || 0, isPago);
        }
      } else {
        addProvToCorretora(corretoraMap, 'Sem corretora', prov, prov.quantidade || 0, prov.valor_total || 0, isPago);
      }
    }
  }
  var totalMesPago = 0;
  var totalMesPendente = 0;
  var corrKeysTotal = Object.keys(corretoraMap);
  for (var tmi = 0; tmi < corrKeysTotal.length; tmi++) {
    totalMesPago += corretoraMap[corrKeysTotal[tmi]].totalPago;
    totalMesPendente += corretoraMap[corrKeysTotal[tmi]].totalPendente;
  }
  var currentMonthLabel = MONTH_LABELS[now.getMonth() + 1].toUpperCase() + ' ' + now.getFullYear();

  // ── FII Rendimentos: KPIs, charts, heatmap, ranking, current month ──
  var fiiRend12mRecebido = 0;
  for (var fr12 = 0; fr12 < proventos.length; fr12++) {
    var fr12Prov = proventos[fr12];
    var fr12Tk = (fr12Prov.ticker || '').toUpperCase().trim();
    if (!fiiTickerSet[fr12Tk]) continue;
    var fr12DateStr = (fr12Prov.data_pagamento || '').substring(0, 10);
    var fr12Date = new Date(fr12Prov.data_pagamento + 'T12:00:00');
    if (fr12Date >= fiiOneYrAgo && fr12DateStr <= fiiTodayStr) fiiRend12mRecebido += (fr12Prov.valor_total || 0);
  }
  var fiiCusto = 0;
  var fiiValorAtual = 0;
  for (var fci2 = 0; fci2 < positions.length; fci2++) {
    if ((positions[fci2].categoria || 'acao') !== 'fii') continue;
    fiiCusto += positions[fci2].quantidade * positions[fci2].pm;
    fiiValorAtual += positions[fci2].quantidade * (positions[fci2].preco_atual || positions[fci2].pm);
  }
  var fiiYoC = fiiCusto > 0 ? (fiiRend12mRecebido / fiiCusto) * 100 : 0;
  var fiiDY = fiiValorAtual > 0 ? (fiiRend12mRecebido / fiiValorAtual) * 100 : 0;

  // FII monthly chart (ProvMonthlyBarChart format: tickers as array)
  var fiiLast12 = [];
  for (var fm12 = 11; fm12 >= 0; fm12--) {
    var fmd12 = new Date(fiiNow.getFullYear(), fiiNow.getMonth() - fm12, 1);
    var fmk12 = fmd12.getFullYear() + '-' + String(fmd12.getMonth() + 1).padStart(2, '0');
    var fml12 = MONTH_LABELS[fmd12.getMonth() + 1];
    var fmTotal12 = fiiRendByMonth[fmk12] || 0;
    var fmTickers12 = fiiRendByMonthTicker[fmk12] || {};
    var fmTickerArr12 = Object.keys(fmTickers12).map(function(tk) {
      return { ticker: tk, value: fmTickers12[tk] };
    }).sort(function(a, b) { return b.value - a.value; });
    fiiLast12.push({ month: fml12, value: fmTotal12, tickers: fmTickerArr12 });
  }
  var fiiMaxMonth = fiiLast12.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // FII annual chart
  var fiiAnnualData = [];
  for (var fay = 0; fay < fiiYears.length; fay++) {
    fiiAnnualData.push({ month: fiiYears[fay], value: fiiRendByYear[fiiYears[fay]] });
  }
  var fiiMaxYear = fiiAnnualData.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // FII asset ranking with 12M received + YoC
  var fiiProvByTicker12m = {};
  for (var fpr = 0; fpr < proventos.length; fpr++) {
    var fprProv = proventos[fpr];
    var fprTk = (fprProv.ticker || '').toUpperCase().trim();
    if (!fiiTickerSet[fprTk]) continue;
    var fprDate = new Date(fprProv.data_pagamento + 'T12:00:00');
    var fprDateStr = (fprProv.data_pagamento || '').substring(0, 10);
    if (fprDate >= fiiOneYrAgo && fprDateStr <= fiiTodayStr) {
      if (!fiiProvByTicker12m[fprTk]) fiiProvByTicker12m[fprTk] = 0;
      fiiProvByTicker12m[fprTk] += (fprProv.valor_total || 0);
    }
  }
  var fiiAssetRanking = [];
  for (var far = 0; far < positions.length; far++) {
    if ((positions[far].categoria || 'acao') !== 'fii') continue;
    var farTk = (positions[far].ticker || '').toUpperCase().trim();
    var farTotal = fiiProvByTicker12m[farTk] || 0;
    var farCusto = positions[far].quantidade * positions[far].pm;
    var farYoC = farCusto > 0 ? (farTotal / farCusto) * 100 : 0;
    fiiAssetRanking.push({ ticker: farTk, total12m: farTotal, yoc: farYoC, quantidade: positions[far].quantidade });
  }
  fiiAssetRanking.sort(function(a, b) { return b.total12m - a.total12m; });

  // FII heatmap: rendimentos by ticker by month-of-year (Jan-Dez)
  var fiiHmTickers = {};
  for (var fhm = 0; fhm < proventos.length; fhm++) {
    var fhmProv = proventos[fhm];
    var fhmTk = (fhmProv.ticker || '').toUpperCase().trim();
    if (!fiiTickerSet[fhmTk]) continue;
    var fhmPd = fhmProv.data_pagamento || '';
    if (fhmPd.length < 7) continue;
    var fhmMes = String(parseInt(fhmPd.substring(5, 7)));
    var fhmVal = fhmProv.valor_total || 0;
    if (!fiiHmTickers[fhmTk]) fiiHmTickers[fhmTk] = {};
    if (!fiiHmTickers[fhmTk][fhmMes]) fiiHmTickers[fhmTk][fhmMes] = 0;
    fiiHmTickers[fhmTk][fhmMes] += fhmVal;
  }
  var fiiHmTickerList = Object.keys(fiiHmTickers).sort();
  var fiiHmMaxVal = 0;
  for (var fhmt = 0; fhmt < fiiHmTickerList.length; fhmt++) {
    var fhmData = fiiHmTickers[fiiHmTickerList[fhmt]];
    for (var fhmm = 0; fhmm < hmMonths.length; fhmm++) {
      var fhmv = fhmData[hmMonths[fhmm].key] || 0;
      if (fhmv > fiiHmMaxVal) fiiHmMaxVal = fhmv;
    }
  }

  // FII current month rendimentos by corretora
  var fiiMesAtual = proventos.filter(function(p) {
    var ptk = (p.ticker || '').toUpperCase().trim();
    if (!fiiTickerSet[ptk]) return false;
    return (p.data_pagamento || '').substring(0, 7) === currentMonth;
  });
  var fiiCorretoraMap = {};
  for (var fcm = 0; fcm < fiiMesAtual.length; fcm++) {
    var fcProv = fiiMesAtual[fcm];
    var fcTk = (fcProv.ticker || '').toUpperCase().trim();
    var fcIsPago = (fcProv.data_pagamento || '').substring(0, 10) <= fiiTodayStr;
    if (fcProv.corretora) {
      addProvToCorretora(fiiCorretoraMap, fcProv.corretora, fcProv, fcProv.quantidade || 0, fcProv.valor_total || 0, fcIsPago);
    } else {
      var fcCorr = posCorretMap[fcTk];
      if (fcCorr) {
        var fcKeysArr = Object.keys(fcCorr);
        var fcTotalQty = 0;
        for (var fck = 0; fck < fcKeysArr.length; fck++) fcTotalQty += (fcCorr[fcKeysArr[fck]] || 0);
        if (fcTotalQty > 0 && fcKeysArr.length > 0) {
          for (var fckj = 0; fckj < fcKeysArr.length; fckj++) {
            var fcQty = fcCorr[fcKeysArr[fckj]] || 0;
            if (fcQty <= 0) continue;
            var fcRatio = fcQty / fcTotalQty;
            addProvToCorretora(fiiCorretoraMap, fcKeysArr[fckj], fcProv, Math.round(fcQty), (fcProv.valor_total || 0) * fcRatio, fcIsPago);
          }
        } else {
          addProvToCorretora(fiiCorretoraMap, 'Sem corretora', fcProv, fcProv.quantidade || 0, fcProv.valor_total || 0, fcIsPago);
        }
      } else {
        addProvToCorretora(fiiCorretoraMap, 'Sem corretora', fcProv, fcProv.quantidade || 0, fcProv.valor_total || 0, fcIsPago);
      }
    }
  }
  var fiiTotalMesPago = 0;
  var fiiTotalMesPendente = 0;
  var fiiCorrKeys = Object.keys(fiiCorretoraMap);
  for (var fckt = 0; fckt < fiiCorrKeys.length; fckt++) {
    fiiTotalMesPago += fiiCorretoraMap[fiiCorrKeys[fckt]].totalPago;
    fiiTotalMesPendente += fiiCorretoraMap[fiiCorrKeys[fckt]].totalPendente;
  }

  // Bar chart data: last 12 months (vertical) with ticker breakdown
  var last12 = [];
  for (var mi = 11; mi >= 0; mi--) {
    var md = new Date(now.getFullYear(), now.getMonth() - mi, 1);
    var mKey = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    var mLabel = MONTH_LABELS[md.getMonth() + 1];
    var mTotal = 0;
    var mTickers = {};
    filteredProventos.forEach(function(p) {
      var pk = (p.data_pagamento || '').substring(0, 7);
      if (pk === mKey) {
        var vt = p.valor_total || 0;
        mTotal += vt;
        var tk = (p.ticker || '').toUpperCase().trim();
        if (tk) {
          if (!mTickers[tk]) mTickers[tk] = 0;
          mTickers[tk] += vt;
        }
      }
    });
    // Sort tickers by value desc
    var mTickerList = Object.keys(mTickers).map(function(tk) {
      return { ticker: tk, value: mTickers[tk] };
    }).sort(function(a, b) { return b.value - a.value; });
    last12.push({ month: mLabel, value: mTotal, tickers: mTickerList });
  }
  var maxProvMonth = last12.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // Annual chart data
  var provsByYear = {};
  proventos.forEach(function(p) {
    var yr = (p.data_pagamento || '').substring(0, 4);
    if (!provsByYear[yr]) provsByYear[yr] = 0;
    provsByYear[yr] += (p.valor_total || 0);
  });
  var annualData = [];
  var annualYears = Object.keys(provsByYear).sort();
  for (var yi = 0; yi < annualYears.length; yi++) {
    annualData.push({ month: annualYears[yi], value: provsByYear[annualYears[yi]] });
  }
  var maxProvYear = annualData.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // Per-asset proventos 12m + YoC
  var provsByTicker12m = {};
  proventos.forEach(function(p) {
    var pd = new Date(p.data_pagamento + 'T12:00:00');
    if (pd >= oneYearAgo) {
      var tk = (p.ticker || '').toUpperCase().trim();
      if (!provsByTicker12m[tk]) provsByTicker12m[tk] = 0;
      provsByTicker12m[tk] += (p.valor_total || 0);
    }
  });

  var assetProvRanking = [];
  for (var pi2 = 0; pi2 < positions.length; pi2++) {
    var pos2 = positions[pi2];
    var tk2 = (pos2.ticker || '').toUpperCase().trim();
    var provTotal = provsByTicker12m[tk2] || 0;
    var custoPos = pos2.quantidade * pos2.pm;
    var yocAsset = custoPos > 0 ? (provTotal / custoPos) * 100 : 0;
    assetProvRanking.push({
      ticker: tk2,
      categoria: pos2.categoria,
      total12m: provTotal,
      yoc: yocAsset,
      quantidade: pos2.quantidade,
    });
  }
  assetProvRanking.sort(function(a, b) { return b.total12m - a.total12m; });

  // Per-category proventos 12m
  var provsByCat = {};
  for (var ci = 0; ci < assetProvRanking.length; ci++) {
    var cat = assetProvRanking[ci].categoria || 'acao';
    if (!provsByCat[cat]) provsByCat[cat] = 0;
    provsByCat[cat] += assetProvRanking[ci].total12m;
  }

  // Breakdown by tipo (all time paid)
  var provsByTipo = {};
  proventos.forEach(function(p) {
    var tipo = p.tipo_provento || 'dividendo';
    if (!provsByTipo[tipo]) provsByTipo[tipo] = { total: 0, count: 0 };
    provsByTipo[tipo].total += (p.valor_total || 0);
    provsByTipo[tipo].count++;
  });

  // JCP: valor salvo ja eh liquido (IR 15% retido na fonte)
  // Bruto = liquido / 0.85 → IR = bruto - liquido
  var jcpLiquido = provsByTipo.jcp ? provsByTipo.jcp.total : 0;
  var jcpBruto = jcpLiquido / 0.85;
  var jcpIR = jcpBruto - jcpLiquido;

  // ── Derived: Premios (for Prov/Prem tab) ──
  var premMediaMensal = premios12mOpc / 12;
  var premYieldOnCost = totalCusto > 0 ? (premios12mOpc / totalCusto) * 100 : 0;

  // Premios by year (with call/put split)
  var premByYear = {};
  for (var pyi = 0; pyi < opcoes.length; pyi++) {
    var pyiOp = opcoes[pyi];
    var pyiDir = pyiOp.direcao || 'venda';
    var pyiVenda = pyiDir === 'venda' || pyiDir === 'lancamento';
    if (pyiVenda) {
      var pyiDate = pyiOp.data_abertura || pyiOp.created_at || pyiOp.vencimento || '';
      var pyiYear = pyiDate.substring(0, 4);
      var pyiTipo = pyiOp.tipo || 'call';
      var pyiPrem = (pyiOp.premio || 0) * (pyiOp.quantidade || 0);
      if (pyiYear) {
        if (!premByYear[pyiYear]) premByYear[pyiYear] = { total: 0, call: 0, put: 0, recompra: 0, recompra_call: 0, recompra_put: 0 };
        premByYear[pyiYear].total += pyiPrem;
        premByYear[pyiYear][pyiTipo] += pyiPrem;
      }
    }
  }
  // Recompra by year (closing date)
  for (var ryi = 0; ryi < opcoes.length; ryi++) {
    var ryOp = opcoes[ryi];
    var ryDir = ryOp.direcao || 'venda';
    var ryVenda = ryDir === 'venda' || ryDir === 'lancamento';
    if (ryVenda && (ryOp.premio_fechamento || 0) > 0) {
      var ryDate = ryOp.updated_at || ryOp.vencimento || '';
      var ryYear = ryDate.substring(0, 4);
      var ryTipo = ryOp.tipo || 'call';
      var ryRec = (ryOp.premio_fechamento || 0) * (ryOp.quantidade || 0);
      if (ryYear) {
        if (!premByYear[ryYear]) premByYear[ryYear] = { total: 0, call: 0, put: 0, recompra: 0, recompra_call: 0, recompra_put: 0 };
        premByYear[ryYear].recompra += ryRec;
        premByYear[ryYear]['recompra_' + ryTipo] += ryRec;
      }
    }
  }
  var premAnnualData = [];
  var premAnnualYears = Object.keys(premByYear).sort();
  for (var pay = 0; pay < premAnnualYears.length; pay++) {
    var payD = premByYear[premAnnualYears[pay]];
    premAnnualData.push({ month: premAnnualYears[pay], total: payD.total, call: payD.call, put: payD.put, value: payD.total, recompra: payD.recompra || 0, recompra_call: payD.recompra_call || 0, recompra_put: payD.recompra_put || 0 });
  }
  var maxPremYear = premAnnualData.reduce(function(m, d) { return Math.max(m, d.total || d.value || 0); }, 1);

  // Recompra annual data
  var recAnnualData = [];
  for (var ray = 0; ray < premAnnualData.length; ray++) {
    var rad = premAnnualData[ray];
    recAnnualData.push({ month: rad.month, total: rad.recompra || 0, call: rad.recompra_call || 0, put: rad.recompra_put || 0, value: rad.recompra || 0 });
  }

  // P&L encerradas anual (agrupado por ano de encerramento)
  var plByYear = {};
  var plYearKeys = Object.keys(opcPLByMonth);
  for (var ply = 0; ply < plYearKeys.length; ply++) {
    var plYearKey = plYearKeys[ply].substring(0, 4);
    if (!plByYear[plYearKey]) plByYear[plYearKey] = { total: 0, call: 0, put: 0 };
    plByYear[plYearKey].total += opcPLByMonth[plYearKeys[ply]].total;
    plByYear[plYearKey].call += opcPLByMonth[plYearKeys[ply]].call;
    plByYear[plYearKey].put += opcPLByMonth[plYearKeys[ply]].put;
  }
  var plAnnualData = [];
  var plAnnualColors = [];
  var plAnnualYears = Object.keys(plByYear).sort();
  for (var play = 0; play < plAnnualYears.length; play++) {
    var plaD = plByYear[plAnnualYears[play]];
    plAnnualData.push({ month: plAnnualYears[play], total: Math.abs(plaD.total), call: plaD.call, put: plaD.put, value: plaD.total });
    plAnnualColors.push(plaD.total >= 0 ? C.green : C.red);
  }

  // Premios asset ranking (sorted by premio received)
  var premAssetRanking = [];
  var opcBaseKeys = Object.keys(opcByBase);
  for (var par = 0; par < opcBaseKeys.length; par++) {
    var parKey = opcBaseKeys[par];
    var parData = opcByBase[parKey];
    premAssetRanking.push({ ticker: parKey, count: parData.count, premio: parData.premioRecebido, pl: parData.pl, recompra: parData.premioRecebido - parData.pl });
  }
  premAssetRanking.sort(function(a, b) { return b.premio - a.premio; });

  // P&L realizado by CALL / PUT (somente encerradas)
  var callPLTotal = 0;
  var putPLTotal = 0;
  var plMKeys = Object.keys(opcPLByMonth);
  for (var cpk = 0; cpk < plMKeys.length; cpk++) {
    callPLTotal += opcPLByMonth[plMKeys[cpk]].call || 0;
    putPLTotal += opcPLByMonth[plMKeys[cpk]].put || 0;
  }
  var absPLTotal = Math.abs(callPLTotal) + Math.abs(putPLTotal);

  // Premios by month detail (for list)
  var premByMonthDetail = {};
  for (var pmd = 0; pmd < opcoes.length; pmd++) {
    var pmdOp = opcoes[pmd];
    var pmdDir = pmdOp.direcao || 'venda';
    var pmdVenda = pmdDir === 'venda' || pmdDir === 'lancamento';
    if (pmdVenda) {
      var pmdDate = pmdOp.data_abertura || pmdOp.created_at || pmdOp.vencimento || '';
      var pmdMonth = pmdDate.substring(0, 7);
      if (pmdMonth) {
        if (!premByMonthDetail[pmdMonth]) premByMonthDetail[pmdMonth] = [];
        premByMonthDetail[pmdMonth].push(pmdOp);
      }
    }
  }

  // Max premium month value (for chart)
  var maxPremMonth = opcMonthlyPremiums.reduce(function(m, d) { return Math.max(m, d.total); }, 1);

  // P&L max values for charts
  var plMaxMonth = plMonthlyData.reduce(function(m, d) { return Math.max(m, d.total); }, 1);
  var plMaxYear = plAnnualData.reduce(function(m, d) { return Math.max(m, d.total); }, 1);

  // P&L yield on cost (based on P&L líquido)
  var plYieldOnCost = totalCusto > 0 ? (opcPLTotal / totalCusto) * 100 : 0;

  // P&L média mensal (ano corrente, encerradas, dividido por meses decorridos)
  var plAnoCorrente = new Date().getFullYear();
  var plMesesDecorridos = Math.max(new Date().getMonth(), 1);
  var plTotalAno = 0;
  var plAnoKeys = Object.keys(opcPLByMonth);
  var plAnoPrefix = String(plAnoCorrente);
  for (var pt12 = 0; pt12 < plAnoKeys.length; pt12++) {
    if (plAnoKeys[pt12].substring(0, 4) === plAnoPrefix) {
      plTotalAno += opcPLByMonth[plAnoKeys[pt12]].total || 0;
    }
  }
  var plMediaMensal = plMesesDecorridos > 0 ? plTotalAno / plMesesDecorridos : 0;

  // Line chart data: prêmios / recompra / P&L por mês (todos os meses históricos)
  var premLineMonths = {};
  var plmPBMKeys = Object.keys(opcPremByMonth);
  for (var plmk = 0; plmk < plmPBMKeys.length; plmk++) {
    premLineMonths[plmPBMKeys[plmk]] = true;
  }
  var plmPLKeys = Object.keys(opcPLByMonth);
  for (var plmk2 = 0; plmk2 < plmPLKeys.length; plmk2++) {
    premLineMonths[plmPLKeys[plmk2]] = true;
  }
  var premLineSorted = Object.keys(premLineMonths).sort();
  var premLineData = [];
  for (var pli2 = 0; pli2 < premLineSorted.length; pli2++) {
    var plmKey = premLineSorted[pli2];
    var plmParts = plmKey.split('-');
    var plmLabel = MONTH_LABELS[parseInt(plmParts[1])] + '/' + plmParts[0].substring(2);
    var plmPrem = opcPremByMonth[plmKey] || { total: 0, recompra: 0 };
    var plmPL = opcPLByMonth[plmKey] || { total: 0 };
    premLineData.push({
      label: plmLabel,
      premios: plmPrem.total || 0,
      recompra: plmPrem.recompra || 0,
      pl: plmPL.total || 0,
    });
  }

  // ── Derived: Visao Geral (combinado) ──
  // Breakdown proventos: dividendos+JCP (ações) vs rendimentos (FIIs) — somente recebidos
  var rpTodayStr = new Date().toISOString().substring(0, 10);
  var rpOneYearAgo = new Date();
  rpOneYearAgo.setFullYear(rpOneYearAgo.getFullYear() - 1);
  var rpDividendos = 0;
  var rpRendimentos = 0;
  var rpDiv12m = 0;
  var rpRend12m = 0;
  for (var rpi = 0; rpi < proventos.length; rpi++) {
    var rpProv = proventos[rpi];
    var rpDateStr = (rpProv.data_pagamento || '').substring(0, 10);
    if (rpDateStr > rpTodayStr) continue;
    var rpTk = (rpProv.ticker || '').toUpperCase().trim();
    var rpVal = rpProv.valor_total || 0;
    var rpDate = new Date(rpProv.data_pagamento + 'T12:00:00');
    if (fiiTickerSet[rpTk]) {
      rpRendimentos += rpVal;
      if (rpDate >= rpOneYearAgo) rpRend12m += rpVal;
    } else {
      rpDividendos += rpVal;
      if (rpDate >= rpOneYearAgo) rpDiv12m += rpVal;
    }
  }
  var rpRF = rfRendaMensalEst;
  var rpPLOpcoes = opcPLTotal;
  // P&L opções encerradas nos últimos 12 meses
  var rpPL12m = 0;
  var rpPlMonthKeys = Object.keys(opcPLByMonth);
  var rp12mAgoStr = rpOneYearAgo.getFullYear() + '-' + String(rpOneYearAgo.getMonth() + 1).padStart(2, '0');
  for (var rplm = 0; rplm < rpPlMonthKeys.length; rplm++) {
    if (rpPlMonthKeys[rplm] >= rp12mAgoStr) {
      rpPL12m += opcPLByMonth[rpPlMonthKeys[rplm]].total;
    }
  }
  var rendaPassivaTotal = rpDividendos + rpRendimentos + rpRF + rpPLOpcoes;
  var rendaPassiva12m = rpDiv12m + rpRend12m + rpRF * 12 + rpPL12m;
  var rendaPassivaMediaMensal = rendaPassiva12m / 12;
  var rendaPassivaYoC = totalCusto > 0 ? (rendaPassiva12m / totalCusto) * 100 : 0;

  // ── Tabela Recebidos / A Receber do ano por tipo ──
  var rpAnoAtual = now.getFullYear();
  var rpAnoStr = String(rpAnoAtual);
  var rpTblDiv = { recebido: 0, aReceber: 0 };
  var rpTblRend = { recebido: 0, aReceber: 0 };
  for (var rtb = 0; rtb < proventos.length; rtb++) {
    var rtProv = proventos[rtb];
    var rtDateStr = (rtProv.data_pagamento || '').substring(0, 10);
    if (rtDateStr.substring(0, 4) !== rpAnoStr) continue;
    var rtTk = (rtProv.ticker || '').toUpperCase().trim();
    var rtVal = rtProv.valor_total || 0;
    if (fiiTickerSet[rtTk]) {
      if (rtDateStr <= rpTodayStr) { rpTblRend.recebido += rtVal; } else { rpTblRend.aReceber += rtVal; }
    } else {
      if (rtDateStr <= rpTodayStr) { rpTblDiv.recebido += rtVal; } else { rpTblDiv.aReceber += rtVal; }
    }
  }
  // RF do ano: meses passados = recebido, meses restantes = a receber
  var rpMesesPassados = now.getMonth() + 1;
  var rpMesesRestantes = 12 - rpMesesPassados;
  var rpTblRF = { recebido: rpRF * rpMesesPassados, aReceber: rpRF * rpMesesRestantes };
  // P&L opções do ano
  var rpTblPL = { recebido: 0, aReceber: 0 };
  for (var rtpl = 0; rtpl < rpPlMonthKeys.length; rtpl++) {
    if (rpPlMonthKeys[rtpl].substring(0, 4) === rpAnoStr) {
      rpTblPL.recebido += opcPLByMonth[rpPlMonthKeys[rtpl]].total;
    }
  }
  var rpTblRows = [
    { l: 'Dividendos/JCP', c: C.acoes, r: rpTblDiv.recebido, a: rpTblDiv.aReceber },
    { l: 'Rendimentos FII', c: C.fiis, r: rpTblRend.recebido, a: rpTblRend.aReceber },
    { l: 'Renda Fixa (est.)', c: C.rf, r: rpTblRF.recebido, a: rpTblRF.aReceber },
    { l: 'P&L Opções', c: C.opcoes, r: rpTblPL.recebido, a: rpTblPL.aReceber },
  ];
  var rpTblTotalR = rpTblDiv.recebido + rpTblRend.recebido + rpTblRF.recebido + rpTblPL.recebido;
  var rpTblTotalA = rpTblDiv.aReceber + rpTblRend.aReceber + rpTblRF.aReceber + rpTblPL.aReceber;

  // ── Ranking geral de ativos geradores de renda passiva ──
  var rpRankMap = {};
  // Proventos (dividendos/JCP + rendimentos FII) — somente recebidos
  for (var rrk = 0; rrk < proventos.length; rrk++) {
    var rrkP = proventos[rrk];
    var rrkDateStr = (rrkP.data_pagamento || '').substring(0, 10);
    if (rrkDateStr > rpTodayStr) continue;
    var rrkTk = (rrkP.ticker || '').toUpperCase().trim();
    var rrkVal = rrkP.valor_total || 0;
    if (!rpRankMap[rrkTk]) rpRankMap[rrkTk] = { ticker: rrkTk, total: 0, tipo: fiiTickerSet[rrkTk] ? 'FII' : 'Ação', c: fiiTickerSet[rrkTk] ? C.fiis : C.acoes };
    rpRankMap[rrkTk].total += rrkVal;
  }
  // P&L opções encerradas por ativo_base
  for (var rro = 0; rro < opcoes.length; rro++) {
    var rroOp = opcoes[rro];
    var rroSt = rroOp.status || 'ativa';
    if (rroSt === 'ativa') continue;
    var rroDir = rroOp.direcao || 'venda';
    var rroVenda = rroDir === 'venda' || rroDir === 'lancamento';
    if (!rroVenda) continue;
    var rroPrem = (rroOp.premio || 0) * (rroOp.quantidade || 0);
    var rroFech = (rroOp.premio_fechamento || 0) * (rroOp.quantidade || 0);
    var rroPL = rroPrem - rroFech;
    var rroBase = (rroOp.ativo_base || '').toUpperCase().trim();
    if (!rroBase) continue;
    if (!rpRankMap[rroBase]) rpRankMap[rroBase] = { ticker: rroBase, total: 0, tipo: 'Opção', c: C.opcoes };
    rpRankMap[rroBase].total += rroPL;
    if (rpRankMap[rroBase].tipo !== 'Opção' && rpRankMap[rroBase].tipo !== 'Ação + Opção') {
      rpRankMap[rroBase].tipo = rpRankMap[rroBase].tipo + ' + Opção';
    }
  }
  // RF por título
  for (var rrf = 0; rrf < rendaFixa.length; rrf++) {
    var rrfItem = rendaFixa[rrf];
    var rrfLabel = (rrfItem.tipo || 'CDB').toUpperCase() + ' ' + (rrfItem.emissor || '');
    var rrfValor = parseFloat(rrfItem.valor_aplicado) || 0;
    var rrfTaxa = parseFloat(rrfItem.taxa) || 0;
    var rrfIdx = rrfItem.indexador || 'prefixado';
    var rrfAnual = rrfIdx === 'cdi' || rrfIdx === 'selic' ? (selicAnual - 0.10) * (rrfTaxa / 100) :
      rrfIdx === 'ipca' ? rrfTaxa + 4.5 : rrfTaxa;
    var rrfMensal = rrfValor * (Math.pow(1 + rrfAnual / 100, 1 / 12) - 1);
    var rrfKey = 'RF_' + rrf;
    rpRankMap[rrfKey] = { ticker: rrfLabel.trim(), total: rrfMensal * rpMesesPassados, tipo: 'RF', c: C.rf };
  }
  var rpRankList = [];
  var rpRankKeys = Object.keys(rpRankMap);
  for (var rrl = 0; rrl < rpRankKeys.length; rrl++) {
    rpRankList.push(rpRankMap[rpRankKeys[rrl]]);
  }

  // ── Renda passiva line chart: 4 séries mensais (todo o histórico) ──
  var rpLineMap = {};
  // Dividendos/JCP por mês (ações — não FII)
  for (var rld = 0; rld < proventos.length; rld++) {
    var rldP = proventos[rld];
    var rldTk = (rldP.ticker || '').toUpperCase().trim();
    var rldDate = (rldP.data_pagamento || '').substring(0, 7);
    if (!rldDate) continue;
    if (!rpLineMap[rldDate]) rpLineMap[rldDate] = { div: 0, rend: 0, rf: 0, pl: 0 };
    if (fiiTickerSet[rldTk]) {
      rpLineMap[rldDate].rend += (rldP.valor_total || 0);
    } else {
      rpLineMap[rldDate].div += (rldP.valor_total || 0);
    }
  }
  // P&L opções encerradas por mês
  var rpPlKeys = Object.keys(opcPLByMonth);
  for (var rplk = 0; rplk < rpPlKeys.length; rplk++) {
    var rplKey = rpPlKeys[rplk];
    if (!rpLineMap[rplKey]) rpLineMap[rplKey] = { div: 0, rend: 0, rf: 0, pl: 0 };
    rpLineMap[rplKey].pl += opcPLByMonth[rplKey].total;
  }
  // RF estimada mensal (constante pra cada mês)
  var rpRfMensal = rfRendaMensalEst;
  // Gerar série contínua de meses
  var rpAllKeys = Object.keys(rpLineMap).sort();
  var rpLineData = [];
  if (rpAllKeys.length > 0) {
    var rpStart = rpAllKeys[0].split('-');
    var rpStartY = parseInt(rpStart[0]);
    var rpStartM = parseInt(rpStart[1]);
    var rpNowY = now.getFullYear();
    var rpNowM = now.getMonth() + 1;
    var rpCurY = rpStartY;
    var rpCurM = rpStartM;
    while (rpCurY < rpNowY || (rpCurY === rpNowY && rpCurM <= rpNowM)) {
      var rpK = rpCurY + '-' + String(rpCurM).padStart(2, '0');
      var rpEntry = rpLineMap[rpK] || { div: 0, rend: 0, rf: 0, pl: 0 };
      var rpLbl = MONTH_LABELS[rpCurM] + '/' + String(rpCurY).substring(2);
      var rpTotalMes = rpEntry.div + rpEntry.rend + rpRfMensal + rpEntry.pl;
      rpLineData.push({ label: rpLbl, div: rpEntry.div, rend: rpEntry.rend, rf: rpRfMensal, pl: rpEntry.pl, total: rpTotalMes });
      rpCurM++;
      if (rpCurM > 12) { rpCurM = 1; rpCurY++; }
    }
  }

  // ── Derived: IR ──
  var irMonthResults = computeIR(operacoes);
  var irTaxData = computeTaxByMonth(irMonthResults);

  var irTotalGanhos = 0;
  var irTotalPerdas = 0;
  var irTotalImposto = 0;
  irTaxData.forEach(function(m) {
    irTotalGanhos += m.ganhoAcoes + m.ganhoFII + m.ganhoETF;
    irTotalPerdas += m.perdaAcoes + m.perdaFII + m.perdaETF;
    irTotalImposto += m.impostoTotal;
  });
  var irSaldoLiquido = irTotalGanhos - irTotalPerdas;
  var hasAlerta20k = irTaxData.some(function(m) { return m.alertaAcoes20k; });

  // ── Loading state ──
  if (loading) return <LoadingScreen />;

  // ── Render ──
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!chartTouching}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={C.accent} colors={[C.accent]} />
      }
    >
      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        {[
          { k: 'perf', l: 'Performance' },
          { k: 'aloc', l: 'Alocação' },
          { k: 'comp', l: 'Composição' },
          { k: 'prov', l: 'Renda Passiva' },
        ].map(function(t) {
          return (
            <Pill key={t.k} active={sub === t.k} color={C.accent}
              onPress={function() { setSub(t.k); }}>
              {t.l}
            </Pill>
          );
        })}
      </View>

      {/* ═══════════ PERFORMANCE ═══════════ */}
      {sub === 'perf' && (
        <>
          {/* Performance sub-tabs */}
          <View style={styles.perfSubTabs}>
            {PERF_SUBS.map(function(ps) {
              var isActive = perfSub === ps.k;
              var color = PERF_SUB_COLORS[ps.k];
              return (
                <Pill key={ps.k} active={isActive} color={color}
                  onPress={function() { setPerfSub(ps.k); setCatShowAllEnc(false); setCatPLBarSelected(-1); }}>
                  {ps.l}
                </Pill>
              );
            })}
          </View>

          {/* ── TODOS ── */}
          {perfSub === 'todos' && (
            <>
              {/* Hero */}
              <Glass glow={C.accent} padding={16}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={styles.heroLabel}>PATRIMÔNIO TOTAL</Text>
                    <Text style={styles.heroValue}>R$ {fmt(totalPatrimonio)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.heroLabel}>RENTABILIDADE</Text>
                    <Text style={[styles.heroPct, { color: rentPct >= 0 ? C.green : C.red }]}>
                      {rentPct >= 0 ? '+' : ''}{rentPct.toFixed(2)}%
                    </Text>
                    <Text style={[styles.heroPctSub, { color: C.sub }]}>
                      CDI: {cdiPct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
                {(function() {
                  var investidoTotal = totalCusto + rfTotalAloc;
                  var plAbs = totalPatrimonio - investidoTotal;
                  var plPct = investidoTotal > 0 ? ((totalPatrimonio - investidoTotal) / investidoTotal) * 100 : 0;
                  if (investidoTotal <= 0) return null;
                  return React.createElement(View, { style: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.sub + '15', paddingTop: 14 } }, [
                    React.createElement(View, { key: 'inv-row', style: { flexDirection: 'row', justifyContent: 'space-between' } }, [
                      React.createElement(View, { key: 'inv-l' }, [
                        React.createElement(Text, { key: 'inv-lab', style: { fontSize: 9, color: C.sub, fontFamily: F.body, letterSpacing: 0.5 } }, 'INVESTIDO'),
                        React.createElement(Text, { key: 'inv-val', style: { fontSize: 13, color: C.dim, fontFamily: F.mono, marginTop: 4 } }, 'R$ ' + fmt(investidoTotal)),
                      ]),
                      React.createElement(View, { key: 'inv-m', style: { alignItems: 'center' } }, [
                        React.createElement(Text, { key: 'inv-lab2', style: { fontSize: 9, color: C.sub, fontFamily: F.body, letterSpacing: 0.5 } }, 'ATUAL'),
                        React.createElement(Text, { key: 'inv-val2', style: { fontSize: 13, color: C.text, fontFamily: F.mono, marginTop: 4 } }, 'R$ ' + fmt(totalPatrimonio)),
                      ]),
                      React.createElement(View, { key: 'inv-r', style: { alignItems: 'flex-end' } }, [
                        React.createElement(Text, { key: 'inv-lab3', style: { fontSize: 9, color: C.sub, fontFamily: F.body, letterSpacing: 0.5 } }, 'P&L'),
                        React.createElement(Text, { key: 'inv-val3', style: { fontSize: 13, color: plAbs >= 0 ? C.green : C.red, fontFamily: F.mono, marginTop: 4 } },
                          (plAbs >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(plAbs))),
                        React.createElement(Text, { key: 'inv-pct', style: { fontSize: 9, color: plPct >= 0 ? C.green : C.red, fontFamily: F.mono, marginTop: 1, opacity: 0.7 } },
                          (plPct >= 0 ? '+' : '') + plPct.toFixed(1) + '%'),
                      ]),
                    ]),
                  ]);
                })()}
              </Glass>

              {/* Period pills */}
              <View style={styles.periodRow}>
                {PERIODS.map(function(p) {
                  var active = perfPeriod === p.key;
                  return (
                    <TouchableOpacity key={p.key}
                      style={[styles.periodPill, active ? styles.periodPillActive : styles.periodPillInactive]}
                      onPress={function() { setPerfPeriod(p.key); }}>
                      <Text style={[styles.periodPillText, { color: active ? C.accent : C.dim }]}>
                        {p.key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Returns Line Chart: Carteira vs CDI vs IBOV */}
              {chartReturns.length > 0 ? (
                <Glass padding={12}>
                  {/* Legend row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 14 }}>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>{useWeekly ? 'RETORNO SEMANAL' : 'RETORNO MENSAL'}</Text>
                    <TouchableOpacity onPress={function() { setInfoModal({ title: 'Retorno Mensal/Semanal', text: 'Retorno percentual por período comparando carteira vs CDI vs IBOV. Carteira usa snapshots de patrimônio. CDI e IBOV são calculados com dados reais do período selecionado.' }); }}>
                      <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 2.5, backgroundColor: C.accent, borderRadius: 2 }} />
                      <Text style={{ fontSize: 8, color: C.sub, fontFamily: F.mono }}>Carteira</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 2.5, backgroundColor: C.rf, borderRadius: 2 }} />
                      <Text style={{ fontSize: 8, color: C.sub, fontFamily: F.mono }}>CDI</Text>
                    </View>
                    {Object.keys(ibovReturns).length > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 12, height: 2.5, backgroundColor: C.etfs, borderRadius: 2 }} />
                        <Text style={{ fontSize: 8, color: C.sub, fontFamily: F.mono }}>IBOV</Text>
                      </View>
                    )}
                  </View>
                  {(function() {
                    var chartH = 150;
                    var chartW = SCREEN_W - 2 * SIZE.padding - 24 - 40;
                    var padL = 38;
                    var padR = 8;
                    var padT = 8;
                    var padB = 22;
                    var plotH = chartH - padT - padB;
                    var plotW = chartW - padL - padR;
                    var n = chartReturns.length;

                    // Compute scale from all 3 series
                    var maxAbs = 1;
                    for (var mi = 0; mi < n; mi++) {
                      var rKey = chartReturns[mi].week || chartReturns[mi].month;
                      var av = Math.abs(chartReturns[mi].pct);
                      if (av > maxAbs) maxAbs = av;
                      var cv = cdiReturns[rKey];
                      if (cv != null && Math.abs(cv) > maxAbs) maxAbs = Math.abs(cv);
                      var iv = ibovReturns[rKey];
                      if (iv != null && Math.abs(iv) > maxAbs) maxAbs = Math.abs(iv);
                    }
                    maxAbs = Math.ceil(maxAbs) + 1;
                    if (maxAbs < 3) maxAbs = 3;

                    var zeroY = padT + plotH / 2;

                    // Helper: value → Y position
                    var valToY = function(v) {
                      return zeroY - (v / maxAbs) * (plotH / 2);
                    };
                    // Helper: index → X position
                    var idxToX = function(i) {
                      if (n === 1) return padL + plotW / 2;
                      return padL + (i / (n - 1)) * plotW;
                    };

                    var allEls = [];

                    // Grid lines + Y labels
                    var ySteps = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
                    for (var yi = 0; yi < ySteps.length; yi++) {
                      var yv = ySteps[yi];
                      var yp = valToY(yv);
                      allEls.push(React.createElement(SvgLine, {
                        key: 'grid-' + yi, x1: padL, y1: yp, x2: padL + plotW, y2: yp,
                        stroke: yv === 0 ? C.sub + '50' : C.sub + '18', strokeWidth: yv === 0 ? 1 : 0.5,
                      }));
                      allEls.push(React.createElement(SvgText, {
                        key: 'yl-' + yi, x: padL - 4, y: yp + 3,
                        fontSize: 8, fill: C.dim, fontFamily: F.mono, textAnchor: 'end',
                      }, (yv >= 0 ? '+' : '') + yv.toFixed(1) + '%'));
                    }

                    // Build points for each series
                    var cartPts = [];
                    var cdiPts = [];
                    var ibovPts = [];
                    for (var pi = 0; pi < n; pi++) {
                      var xp = idxToX(pi);
                      var rKey = chartReturns[pi].week || chartReturns[pi].month;
                      cartPts.push({ x: xp, y: valToY(chartReturns[pi].pct), val: chartReturns[pi].pct });
                      var cdiR = cdiReturns[rKey];
                      if (cdiR != null) cdiPts.push({ x: xp, y: valToY(cdiR), val: cdiR });
                      var ibovR = ibovReturns[rKey];
                      if (ibovR != null) ibovPts.push({ x: xp, y: valToY(ibovR), val: ibovR });
                    }

                    // Helper: render a line series (area fill + line + dots)
                    var renderSeries = function(pts, color, key, showArea) {
                      var els = [];
                      if (pts.length < 1) return els;

                      // Area fill (subtle gradient from line to zero)
                      if (showArea && pts.length >= 2) {
                        var areaPath = 'M' + pts[0].x + ',' + zeroY;
                        for (var a = 0; a < pts.length; a++) {
                          areaPath = areaPath + ' L' + pts[a].x + ',' + pts[a].y;
                        }
                        areaPath = areaPath + ' L' + pts[pts.length - 1].x + ',' + zeroY + ' Z';
                        els.push(React.createElement(Path, {
                          key: key + '-area', d: areaPath,
                          fill: color, opacity: 0.08,
                        }));
                      }

                      // Line
                      if (pts.length >= 2) {
                        var linePath = 'M' + pts[0].x + ',' + pts[0].y;
                        for (var l = 1; l < pts.length; l++) {
                          linePath = linePath + ' L' + pts[l].x + ',' + pts[l].y;
                        }
                        els.push(React.createElement(Path, {
                          key: key + '-line', d: linePath,
                          stroke: color, strokeWidth: 2, fill: 'none', opacity: 0.9,
                        }));
                      }

                      // Dots
                      for (var d = 0; d < pts.length; d++) {
                        els.push(React.createElement(Circle, {
                          key: key + '-glow-' + d, cx: pts[d].x, cy: pts[d].y,
                          r: 5, fill: color, opacity: 0.15,
                        }));
                        els.push(React.createElement(Circle, {
                          key: key + '-dot-' + d, cx: pts[d].x, cy: pts[d].y,
                          r: 3, fill: color, opacity: 1,
                        }));
                        // Value label on dot
                        els.push(React.createElement(SvgText, {
                          key: key + '-val-' + d, x: pts[d].x, y: pts[d].y - 7,
                          fontSize: 7, fill: color, fontFamily: F.mono,
                          textAnchor: 'middle', opacity: 0.8,
                        }, (pts[d].val >= 0 ? '+' : '') + pts[d].val.toFixed(1) + '%'));
                      }
                      return els;
                    };

                    // Render series (CDI first = behind, then IBOV, then Carteira on top)
                    var cdiEls = renderSeries(cdiPts, C.rf, 'cdi', false);
                    var ibovEls = renderSeries(ibovPts, C.etfs, 'ibov', false);
                    var cartEls = renderSeries(cartPts, C.accent, 'cart', true);
                    for (var ce = 0; ce < cdiEls.length; ce++) allEls.push(cdiEls[ce]);
                    for (var ie = 0; ie < ibovEls.length; ie++) allEls.push(ibovEls[ie]);
                    for (var ca = 0; ca < cartEls.length; ca++) allEls.push(cartEls[ca]);

                    // X-axis labels
                    for (var xi = 0; xi < n; xi++) {
                      var showXL = n <= 12 || xi % Math.ceil(n / 8) === 0 || xi === n - 1;
                      if (showXL) {
                        var ml;
                        if (useWeekly && chartReturns[xi].date) {
                          // Show date for weekly: "12/02"
                          var dp = chartReturns[xi].date.split('-');
                          ml = dp[2] + '/' + dp[1];
                        } else {
                          var mp = chartReturns[xi].month.split('-');
                          ml = MONTH_LABELS[parseInt(mp[1])] + '/' + mp[0].substring(2);
                        }
                        allEls.push(React.createElement(SvgText, {
                          key: 'xl-' + xi, x: idxToX(xi), y: chartH - 2,
                          fontSize: 8, fill: C.dim, fontFamily: F.mono, textAnchor: 'middle',
                        }, ml));
                      }
                    }

                    return React.createElement(Svg, { width: chartW, height: chartH }, allEls);
                  })()}
                </Glass>
              ) : (
                <Glass padding={20}>
                  <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                    Adicione operacoes para ver o retorno mensal
                  </Text>
                </Glass>
              )}

              {/* Drawdown Chart */}
              {drawdownData.length >= 2 && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>DRAWDOWN</Text>
                    <TouchableOpacity onPress={function() { setInfoModal({ title: 'Drawdown', text: 'Maior queda percentual do patrimônio desde o pico histórico. Mede o risco de perdas da carteira. Quanto menor (mais negativo), maior foi a perda máxima no período.' }); }}>
                      <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                    </TouchableOpacity>
                  </View>
                  <Glass padding={12}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>QUEDA PICO-A-VALE</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={{ fontSize: 10, color: C.red, fontFamily: F.mono }}>
                        Max: {maxDD > 0 ? '-' : ''}{maxDD.toFixed(1)}%
                      </Text>
                    </View>
                    {(function() {
                      var chartH = 120;
                      var chartW = SCREEN_W - 2 * SIZE.padding - 24 - 40;
                      var padL = 38;
                      var padR = 8;
                      var padT = 8;
                      var padB = 22;
                      var plotH = chartH - padT - padB;
                      var plotW = chartW - padL - padR;
                      var n = drawdownData.length;

                      var ddMax = Math.max(maxDD, 1);
                      ddMax = Math.ceil(ddMax) + 1;

                      var valToY = function(v) {
                        return padT + (Math.abs(v) / ddMax) * plotH;
                      };
                      var idxToX = function(i) {
                        if (n === 1) return padL + plotW / 2;
                        return padL + (i / (n - 1)) * plotW;
                      };

                      var els = [];

                      // Grid lines + Y labels (0%, -half, -max)
                      var ySteps = [0, -ddMax / 2, -ddMax];
                      for (var yi = 0; yi < ySteps.length; yi++) {
                        var yp = valToY(ySteps[yi]);
                        els.push(React.createElement(SvgLine, {
                          key: 'ddg-' + yi, x1: padL, y1: yp, x2: padL + plotW, y2: yp,
                          stroke: ySteps[yi] === 0 ? C.sub + '50' : C.sub + '18', strokeWidth: ySteps[yi] === 0 ? 1 : 0.5,
                        }));
                        els.push(React.createElement(SvgText, {
                          key: 'ddyl-' + yi, x: padL - 4, y: yp + 3,
                          fontSize: 8, fill: C.dim, fontFamily: F.mono, textAnchor: 'end',
                        }, ySteps[yi] === 0 ? '0%' : ySteps[yi].toFixed(1) + '%'));
                      }

                      // Area fill
                      var areaPath = 'M' + idxToX(0) + ',' + padT;
                      for (var ai = 0; ai < n; ai++) {
                        areaPath = areaPath + ' L' + idxToX(ai) + ',' + valToY(drawdownData[ai].dd);
                      }
                      areaPath = areaPath + ' L' + idxToX(n - 1) + ',' + padT + ' Z';
                      els.push(React.createElement(Path, {
                        key: 'dd-area', d: areaPath,
                        fill: C.red, opacity: 0.12,
                      }));

                      // Line
                      var linePath = 'M' + idxToX(0) + ',' + valToY(drawdownData[0].dd);
                      for (var li = 1; li < n; li++) {
                        linePath = linePath + ' L' + idxToX(li) + ',' + valToY(drawdownData[li].dd);
                      }
                      els.push(React.createElement(Path, {
                        key: 'dd-line', d: linePath,
                        stroke: C.red, strokeWidth: 1.8, fill: 'none', opacity: 0.85,
                      }));

                      // Max drawdown marker
                      var maxDDIdx = 0;
                      for (var mdi = 1; mdi < n; mdi++) {
                        if (drawdownData[mdi].dd < drawdownData[maxDDIdx].dd) maxDDIdx = mdi;
                      }
                      els.push(React.createElement(Circle, {
                        key: 'dd-maxglow', cx: idxToX(maxDDIdx), cy: valToY(drawdownData[maxDDIdx].dd),
                        r: 6, fill: C.red, opacity: 0.2,
                      }));
                      els.push(React.createElement(Circle, {
                        key: 'dd-maxdot', cx: idxToX(maxDDIdx), cy: valToY(drawdownData[maxDDIdx].dd),
                        r: 3, fill: C.red, opacity: 1,
                      }));
                      els.push(React.createElement(SvgText, {
                        key: 'dd-maxlbl', x: idxToX(maxDDIdx), y: valToY(drawdownData[maxDDIdx].dd) + 12,
                        fontSize: 8, fill: C.red, fontFamily: F.mono, textAnchor: 'middle',
                      }, drawdownData[maxDDIdx].dd.toFixed(1) + '%'));

                      // X-axis labels
                      var xCount = Math.min(5, n);
                      for (var xi = 0; xi < n; xi++) {
                        var showX = n <= 5 || xi === 0 || xi === n - 1 || (xCount > 2 && xi % Math.ceil(n / xCount) === 0);
                        if (showX) {
                          var dp = drawdownData[xi].date.split('-');
                          var xLabel = dp[2] + '/' + dp[1];
                          els.push(React.createElement(SvgText, {
                            key: 'ddxl-' + xi, x: idxToX(xi), y: chartH - 2,
                            fontSize: 8, fill: C.dim, fontFamily: F.mono, textAnchor: 'middle',
                          }, xLabel));
                        }
                      }

                      return React.createElement(Svg, { width: chartW, height: chartH }, els);
                    })()}
                  </Glass>
                </>
              )}

              {/* KPI Row */}
              <View style={styles.kpiRow}>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>CARTEIRA</Text>
                    <Text style={[styles.kpiValue, { color: rentPct >= 0 ? C.green : C.red }]}>
                      {rentPct >= 0 ? '+' : ''}{rentPct.toFixed(1)}%
                    </Text>
                  </View>
                </Glass>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>CDI</Text>
                    <Text style={[styles.kpiValue, { color: C.etfs }]}>
                      +{cdiPct.toFixed(1)}%
                    </Text>
                  </View>
                </Glass>
              </View>
              <View style={styles.kpiRow}>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>MELHOR MES</Text>
                    {bestMonth ? (
                      <>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          +{bestMonth.pct.toFixed(1)}%
                        </Text>
                        <Text style={styles.kpiSub}>
                          {MONTH_LABELS[parseInt(bestMonth.month.split('-')[1])]}/{bestMonth.month.split('-')[0].substring(2)}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.kpiValue, { color: C.dim }]}>--</Text>
                    )}
                  </View>
                </Glass>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>PIOR MES</Text>
                    {worstMonth ? (
                      <>
                        <Text style={[styles.kpiValue, { color: worstMonth.pct >= 0 ? C.yellow : C.red }]}>
                          {(worstMonth.pct >= 0 ? '+' : '') + worstMonth.pct.toFixed(1)}%
                        </Text>
                        <Text style={styles.kpiSub}>
                          {MONTH_LABELS[parseInt(worstMonth.month.split('-')[1])]}/{worstMonth.month.split('-')[0].substring(2)}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.kpiValue, { color: C.dim }]}>--</Text>
                    )}
                  </View>
                </Glass>
              </View>

              {/* P&L Realizado + Aberto */}
              {(perfPlRealizado !== 0 || perfPlAberto !== 0) && (
                <>
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.kpiLabel}>P&L REALIZADO</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L Realizado', text: 'Lucro ou prejuízo das ações já vendidas (total ou parcialmente). Usa o preço médio da corretora onde a venda ocorreu, refletindo o resultado real de cada operação.\n\nPara fins de IR, o cálculo usa PM geral (veja Relatórios > IR).' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: perfPlRealizado >= 0 ? C.green : C.red }]}>
                          {perfPlRealizado >= 0 ? '+' : ''}R$ {fmt(perfPlRealizado)}
                        </Text>
                        <Text style={styles.kpiSub}>Vendas concluídas</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.kpiLabel}>P&L ABERTO</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L Aberto', text: 'Ganho ou perda das posições que você ainda tem em carteira. Compara o preço atual de mercado com o preço médio de compra.\n\nEsse valor muda com as cotações e só se torna realizado quando você vender.' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: perfPlAberto >= 0 ? C.green : C.red }]}>
                          {perfPlAberto >= 0 ? '+' : ''}R$ {fmt(perfPlAberto)}
                        </Text>
                        <Text style={styles.kpiSub}>Posições em carteira</Text>
                      </View>
                    </Glass>
                  </View>
                  <Glass padding={10}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={styles.kpiLabel}>P&L TOTAL (REALIZADO + ABERTO)</Text>
                        <Text style={[styles.kpiSub, { marginTop: 2 }]}>
                          {encerradas.length} encerrada(s) + {positions.filter(function(p) { return (p.total_vendido || 0) > 0; }).length} com vendas parciais
                        </Text>
                      </View>
                      <Text style={[styles.kpiValue, { color: perfPlTotal >= 0 ? C.green : C.red, fontSize: 18 }]}>
                        {perfPlTotal >= 0 ? '+' : ''}R$ {fmt(perfPlTotal)}
                      </Text>
                    </View>
                  </Glass>
                </>
              )}

              {/* Rentabilidade por ativo */}
              {sortedByPnl.length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>RENTABILIDADE POR ATIVO</Text>
                    <TouchableOpacity onPress={function() { setInfoModal({ title: 'Rentabilidade por Ativo', text: 'P&L percentual de cada ativo baseado no preço médio de compra vs preço atual de mercado. Barras verdes indicam lucro e vermelhas prejuízo.' }); }}>
                      <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                    </TouchableOpacity>
                  </View>
                  <Glass padding={14}>
                    {sortedByPnl.map(function (a, i) {
                      return <HBar key={i} label={a.ticker} value={a.pnlPct} maxValue={maxAbsPnl}
                        color={a.pnlPct >= 0 ? C.green : C.red} suffix="%" />;
                    })}
                  </Glass>
                </>
              )}

              {/* P&L por classe */}
              {pnlClassList.length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>P&L POR CLASSE</Text>
                    <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L por Classe', text: 'Contribuição de cada classe de ativo (Ações, FIIs, ETFs, RF) para o resultado total da carteira em reais.' }); }}>
                      <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                    </TouchableOpacity>
                  </View>
                  <Glass padding={14}>
                    {pnlClassList.map(function(c, i) {
                      var isPos = c.val >= 0;
                      var barColor = isPos ? C.green : C.red;
                      var barPct = clamp(Math.abs(c.val) / maxAbsClassPnl * 100, 2, 100);
                      return (
                        <View key={i} style={styles.hbarRow}>
                          <Text style={styles.hbarLabel} numberOfLines={1}>{c.label}</Text>
                          <View style={styles.hbarTrack}>
                            <View style={[styles.hbarFill, {
                              width: barPct + '%',
                              backgroundColor: barColor + '40',
                              borderColor: barColor + '80',
                            }]} />
                          </View>
                          <Text style={[styles.plClassValue, { color: barColor }]} numberOfLines={1}>
                            {isPos ? '+' : '\u2212'}R$ {fmtC(Math.abs(c.val))}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: C.sub, fontWeight: '700', fontFamily: F.mono }}>TOTAL</Text>
                      {(function() {
                        var totalPL = pnlClassList.reduce(function(s, c) { return s + c.val; }, 0);
                        var isTotalPos = totalPL >= 0;
                        return (
                          <Text style={{ fontSize: 12, fontWeight: '800', color: isTotalPos ? C.green : C.red, fontFamily: F.mono }}>
                            {isTotalPos ? '+' : '\u2212'}R$ {fmtC(Math.abs(totalPL))}
                          </Text>
                        );
                      })()}
                    </View>
                  </Glass>
                </>
              )}

              {/* ── PROVENTOS (all categories) ── */}
              {allProvData.length > 0 && allProvMax > 0 && (
                <>
                  <SectionLabel>PROVENTOS</SectionLabel>
                  <Glass padding={12}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={function() { setAllProvMode('mensal'); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: allProvMode === 'mensal' ? C.accent + '20' : 'transparent', borderWidth: 1, borderColor: allProvMode === 'mensal' ? C.accent + '50' : C.border }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: allProvMode === 'mensal' ? C.accent : C.dim, fontFamily: F.mono }}>MENSAL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={function() { setAllProvMode('anual'); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: allProvMode === 'anual' ? C.accent + '20' : 'transparent', borderWidth: 1, borderColor: allProvMode === 'anual' ? C.accent + '50' : C.border }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: allProvMode === 'anual' ? C.accent : C.dim, fontFamily: F.mono }}>ANUAL</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                        {'Total: R$ ' + fmt(allProvData.reduce(function(s, d) { return s + d.value; }, 0))}
                      </Text>
                    </View>
                    <ProvVertBarChart data={allProvData} maxVal={allProvMax} color={C.fiis} height={190} />
                  </Glass>
                </>
              )}
            </>
          )}

          {/* ── ACAO / FII / ETF ── */}
          {(perfSub === 'acao' || perfSub === 'fii' || perfSub === 'etf') && (
            <>
              {catPositions.length === 0 && catEncerradas.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title={'Sem ' + (CAT_LABELS[perfSub] || perfSub)}
                  description={'Adicione operações de ' + (CAT_LABELS[perfSub] || perfSub) + ' para ver a performance'}
                  color={PERF_SUB_COLORS[perfSub]}
                />
              ) : (
                <>
                  {/* Hero Card — só com posições ativas */}
                  {catPositions.length > 0 && (
                    <>
                      <Glass glow={PERF_SUB_COLORS[perfSub]} padding={16}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <View>
                            <Text style={styles.heroLabel}>INVESTIDO</Text>
                            <Text style={styles.heroValue}>R$ {fmt(catTotalInvested)}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.heroLabel}>VALOR ATUAL</Text>
                            <Text style={[styles.heroValue, { color: catPL >= 0 ? C.green : C.red }]}>R$ {fmt(catCurrentValue)}</Text>
                          </View>
                        </View>
                        <View style={styles.catHeroDivider} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={styles.kpiLabel}>P&L CAPITAL</Text>
                            <Text style={[styles.kpiValue, { color: catPL >= 0 ? C.green : C.red }]}>
                              {catPL >= 0 ? '+' : ''}R$ {fmt(Math.abs(catPL))}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={styles.kpiLabel}>RETORNO TOTAL</Text>
                            <Text style={[styles.kpiValue, { color: catRetornoTotal >= 0 ? C.green : C.red }]}>
                              {catRetornoTotalPct >= 0 ? '+' : ''}{catRetornoTotalPct.toFixed(2)}%
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={styles.kpiLabel}>% CDI</Text>
                            <Text style={[styles.kpiValue, { color: catPctCDI >= 100 ? C.green : C.yellow }]}>
                              {catPctCDI.toFixed(0)}%
                            </Text>
                          </View>
                        </View>
                      </Glass>

                      {/* Stats Row 1 */}
                      <View style={styles.kpiRow}>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <Text style={styles.kpiLabel}>POSIÇÕES</Text>
                            <Text style={[styles.kpiValue, { color: PERF_SUB_COLORS[perfSub] }]}>
                              {String(catPositions.length)}
                            </Text>
                          </View>
                        </Glass>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <Text style={styles.kpiLabel}>PESO CARTEIRA</Text>
                            <Text style={[styles.kpiValue, { color: PERF_SUB_COLORS[perfSub] }]}>
                              {catPesoCarteira.toFixed(1)}%
                            </Text>
                          </View>
                        </Glass>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <Text style={styles.kpiLabel}>RENTAB.</Text>
                            <Text style={[styles.kpiValue, { color: catRentPct >= 0 ? C.green : C.red }]}>
                              {catRentPct >= 0 ? '+' : ''}{catRentPct.toFixed(1)}%
                            </Text>
                          </View>
                        </Glass>
                      </View>
                    </>
                  )}

                  {/* Stats Row 2: Proventos */}
                  {catDividendsTotal > 0 && (
                    <>
                      <Glass padding={12}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>PROVENTOS TOTAL</Text>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: C.green, fontFamily: F.mono }}>
                            {'R$ ' + fmt(catDividendsTotal)}
                          </Text>
                        </View>
                        <View style={{ height: 1, backgroundColor: C.border, marginBottom: 6 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>Recebidos</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                            {'R$ ' + fmt(catProvsRecebidos)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>A receber</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.yellow, fontFamily: F.mono }}>
                            {'R$ ' + fmt(catProvsAReceber)}
                          </Text>
                        </View>
                      </Glass>
                      <View style={styles.kpiRow}>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <Text style={styles.kpiLabel}>YIELD ON COST</Text>
                            <Text style={[styles.kpiValue, { color: C.green }]}>
                              {catYieldOnCost.toFixed(2)}%
                            </Text>
                          </View>
                        </Glass>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <Text style={styles.kpiLabel}>DY 12M</Text>
                            <Text style={[styles.kpiValue, { color: C.green }]}>
                              {catDY.toFixed(2)}%
                            </Text>
                          </View>
                        </Glass>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <Text style={styles.kpiLabel}>RENDA/MÊS</Text>
                            <Text style={[styles.kpiValue, { color: C.green }]}>
                              R$ {fmt(catRendaMensal)}
                            </Text>
                            <Text style={styles.kpiSub}>Média 3m</Text>
                          </View>
                        </Glass>
                      </View>

                      {/* Proventos Mensais Chart */}
                      {(function() {
                        var catProvMax = 0;
                        for (var cpmx = 0; cpmx < catMonthlyDividends.length; cpmx++) {
                          if (catMonthlyDividends[cpmx].value > catProvMax) catProvMax = catMonthlyDividends[cpmx].value;
                        }
                        if (catProvMax === 0) return null;
                        return (
                          <Glass padding={12}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>PROVENTOS MENSAIS (12M)</Text>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                {'Total: R$ ' + fmt(catMonthlyDividends.reduce(function(s, d) { return s + d.value; }, 0))}
                              </Text>
                            </View>
                            <ProvVertBarChart data={catMonthlyDividends} maxVal={catProvMax} color={PERF_SUB_COLORS[perfSub]} height={170} />
                          </Glass>
                        );
                      })()}
                    </>
                  )}

                  {/* Consistencia */}
                  {(catMesesPositivos + catMesesNegativos) > 0 && (
                    <View style={styles.kpiRow}>
                      <Glass padding={10} style={{ flex: 1 }}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>MESES POSITIVOS</Text>
                          <Text style={[styles.kpiValue, { color: C.green }]}>
                            {String(catMesesPositivos)}
                          </Text>
                        </View>
                      </Glass>
                      <Glass padding={10} style={{ flex: 1 }}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>MESES NEGATIVOS</Text>
                          <Text style={[styles.kpiValue, { color: C.red }]}>
                            {String(catMesesNegativos)}
                          </Text>
                        </View>
                      </Glass>
                    </View>
                  )}

                  {/* ── P&L ABERTO vs REALIZADO (por categoria) ── */}
                  {(catPlRealizado !== 0 || catEncerradas.length > 0 || catComVendas > 0) && (
                    <>
                      <SectionLabel>P&L DETALHADO</SectionLabel>
                      <View style={styles.kpiRow}>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={styles.kpiLabel}>P&L REALIZADO</Text>
                              <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L Realizado', text: 'Lucro ou prejuízo das vendas já concluídas nesta classe de ativos. Calculado usando preço médio geral (PM).\n\nInclui posições encerradas e vendas parciais de posições ativas.' }); }}>
                                <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={[styles.kpiValue, { color: catPlRealizado >= 0 ? C.green : C.red }]}>
                              {catPlRealizado >= 0 ? '+' : ''}R$ {fmt(Math.abs(catPlRealizado))}
                            </Text>
                            <Text style={styles.kpiSub}>Vendas concluídas</Text>
                          </View>
                        </Glass>
                        <Glass padding={10} style={{ flex: 1 }}>
                          <View style={styles.kpiCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={styles.kpiLabel}>P&L ABERTO</Text>
                              <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L Aberto', text: 'Ganho ou perda das posições que você ainda tem em carteira. Compara preço atual vs preço médio de compra.\n\nMuda com as cotações e só se realiza ao vender.' }); }}>
                                <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={[styles.kpiValue, { color: catPlAberto >= 0 ? C.green : C.red }]}>
                              {catPlAberto >= 0 ? '+' : ''}R$ {fmt(Math.abs(catPlAberto))}
                            </Text>
                            <Text style={styles.kpiSub}>Em carteira</Text>
                          </View>
                        </Glass>
                      </View>
                      <Glass padding={10}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View>
                            <Text style={styles.kpiLabel}>P&L TOTAL (REALIZADO + ABERTO)</Text>
                            <Text style={[styles.kpiSub, { marginTop: 2 }]}>
                              {String(catEncerradas.length) + ' encerrada(s) + ' + String(catComVendas) + ' com vendas parciais'}
                            </Text>
                          </View>
                          <Text style={[styles.kpiValue, { color: catPlTotal >= 0 ? C.green : C.red, fontSize: 18 }]}>
                            {catPlTotal >= 0 ? '+' : ''}R$ {fmt(Math.abs(catPlTotal))}
                          </Text>
                        </View>
                      </Glass>
                    </>
                  )}

                  {/* ── P&L REALIZADO POR PERÍODO ── */}
                  {(catPlMonthly.some(function(m) { return m.pl !== 0; }) || catPlAnnual.length > 0) && (
                    <>
                      <SectionLabel>P&L REALIZADO POR PERÍODO</SectionLabel>
                      <Glass padding={12}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              onPress={function() { setCatPLBarView('mensal'); setCatPLBarSelected(-1); }}
                              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: catPLBarView === 'mensal' ? C.accent + '20' : 'transparent', borderWidth: 1, borderColor: catPLBarView === 'mensal' ? C.accent + '50' : C.border }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: catPLBarView === 'mensal' ? C.accent : C.dim, fontFamily: F.mono }}>MENSAL</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={function() { setCatPLBarView('anual'); setCatPLBarSelected(-1); }}
                              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: catPLBarView === 'anual' ? C.accent + '20' : 'transparent', borderWidth: 1, borderColor: catPLBarView === 'anual' ? C.accent + '50' : C.border }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: catPLBarView === 'anual' ? C.accent : C.dim, fontFamily: F.mono }}>ANUAL</Text>
                            </TouchableOpacity>
                          </View>
                          {(function() {
                            var plBarData = catPLBarView === 'mensal' ? catPlMonthly : catPlAnnual;
                            var totalPl = 0;
                            for (var tpi = 0; tpi < plBarData.length; tpi++) totalPl += plBarData[tpi].pl;
                            var isPos = totalPl >= 0;
                            return (
                              <Text style={{ fontSize: 10, color: isPos ? C.green : C.red, fontFamily: F.mono, fontWeight: '600' }}>
                                {'Total: ' + (isPos ? '+' : '') + 'R$ ' + fmt(totalPl)}
                              </Text>
                            );
                          })()}
                        </View>
                        <PLBarChart
                          data={catPLBarView === 'mensal' ? catPlMonthly : catPlAnnual}
                          height={200}
                          selected={catPLBarSelected}
                          onSelect={function(idx) { setCatPLBarSelected(idx); }}
                        />
                      </Glass>
                    </>
                  )}

                  {/* ── POSIÇÕES ENCERRADAS ── */}
                  {catEncerradas.length > 0 && (
                    <>
                      <SectionLabel>{'POSIÇÕES ENCERRADAS (' + String(catEncerradas.length) + ')'}</SectionLabel>
                      {(function() {
                        var showEnc = catShowAllEnc ? catEncerradas : catEncerradas.slice(0, 3);
                        return (
                          <>
                            {showEnc.map(function(enc, ei) {
                              var encPl = enc.pl_realizado || 0;
                              var encIsPos = encPl >= 0;
                              var encPmCompra = enc.pm || 0;
                              var encPmVenda = (enc.total_vendido || 0) > 0 && (enc.receita_vendas || 0) > 0
                                ? enc.receita_vendas / enc.total_vendido : 0;
                              var encPct = encPmCompra > 0 ? ((encPmVenda - encPmCompra) / encPmCompra * 100) : 0;
                              return (
                                <Glass key={ei} padding={12} style={{ borderLeftWidth: 3, borderLeftColor: encIsPos ? C.green : C.red }}>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{enc.ticker}</Text>
                                      <Badge text={CAT_LABELS[enc.categoria || 'acao'] || enc.categoria} color={CAT_COLORS[enc.categoria || 'acao'] || C.accent} />
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                      <Text style={{ fontSize: 14, fontWeight: '800', color: encIsPos ? C.green : C.red, fontFamily: F.mono }}>
                                        {encIsPos ? '+' : ''}R$ {fmt(Math.abs(encPl))}
                                      </Text>
                                      <Text style={{ fontSize: 10, color: encIsPos ? C.green : C.red, fontFamily: F.mono }}>
                                        {encIsPos ? '+' : ''}{encPct.toFixed(1)}%
                                      </Text>
                                    </View>
                                  </View>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                      {'PM Compra: R$ ' + fmt(encPmCompra)}
                                    </Text>
                                    {encPmVenda > 0 && (
                                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                        {'PM Venda: R$ ' + fmt(encPmVenda)}
                                      </Text>
                                    )}
                                  </View>
                                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>
                                    {String(enc.total_vendido || 0) + ' cotas vendidas'}
                                  </Text>
                                </Glass>
                              );
                            })}
                            {catEncerradas.length > 3 && !catShowAllEnc && (
                              <TouchableOpacity
                                onPress={function() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCatShowAllEnc(true); }}
                                style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ fontSize: 11, color: C.accent, fontWeight: '600', fontFamily: F.mono }}>
                                  {'Ver todas (' + String(catEncerradas.length) + ')'}
                                </Text>
                              </TouchableOpacity>
                            )}
                            {catShowAllEnc && catEncerradas.length > 3 && (
                              <TouchableOpacity
                                onPress={function() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCatShowAllEnc(false); }}
                                style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ fontSize: 11, color: C.accent, fontWeight: '600', fontFamily: F.mono }}>
                                  Recolher
                                </Text>
                              </TouchableOpacity>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}

                  {/* Position Ranking */}
                  {catRankedPositions.length > 0 && (
                    <>
                      <SectionLabel>RANKING POR RETORNO TOTAL</SectionLabel>
                      <Glass padding={0}>
                        {(function() {
                          var maxAbsPct = 1;
                          for (var mx = 0; mx < catRankedPositions.length; mx++) {
                            if (Math.abs(catRankedPositions[mx].retTotalPct) > maxAbsPct) {
                              maxAbsPct = Math.abs(catRankedPositions[mx].retTotalPct);
                            }
                          }
                          return catRankedPositions.map(function(rp, i) {
                            var barWidth = Math.min(Math.abs(rp.retTotalPct) / maxAbsPct * 100, 100);
                            return (
                              <View key={i} style={[styles.posCard, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.rankIndex}>{String(i + 1)}</Text>
                                    <Text style={styles.rankTicker}>{rp.ticker}</Text>
                                    {rp.change_day !== 0 && (
                                      <Badge text={(rp.change_day >= 0 ? '+' : '') + rp.change_day.toFixed(1) + '%'} color={rp.change_day >= 0 ? C.green : C.red} />
                                    )}
                                  </View>
                                  <Text style={[styles.rankPct, { color: rp.retTotal >= 0 ? C.green : C.red }]}>
                                    {rp.retTotalPct >= 0 ? '+' : ''}{rp.retTotalPct.toFixed(1)}%
                                  </Text>
                                </View>
                                <View style={[styles.rankBarBg, { marginVertical: 6, marginHorizontal: 0 }]}>
                                  <View style={[styles.rankBarFill, {
                                    width: barWidth + '%',
                                    backgroundColor: rp.retTotal >= 0 ? C.green : C.red,
                                  }]} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                  <View>
                                    <Text style={styles.posDetail}>PM R$ {fmt(rp.pm)} | Atual R$ {fmt(rp.preco_atual)}</Text>
                                    <Text style={styles.posDetail}>{String(rp.quantidade) + ' cotas | Peso ' + rp.peso.toFixed(1) + '%'}</Text>
                                  </View>
                                  <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.posDetail, { color: rp.pl >= 0 ? C.green : C.red }]}>
                                      P&L {rp.pl >= 0 ? '+' : ''}R$ {fmt(Math.abs(rp.pl))}
                                    </Text>
                                    {rp.proventos12m > 0 && (
                                      <Text style={[styles.posDetail, { color: C.green }]}>
                                        {perfSub === 'fii' ? 'DY' : 'YoC'} {rp.yoc.toFixed(1)}% | R$ {fmt(rp.proventos12m)}/12m
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              </View>
                            );
                          });
                        })()}
                      </Glass>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── OPCOES ── */}
          {perfSub === 'opcoes' && (
            <>
              {opcoes.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title="Sem Opções"
                  description="Cadastre suas opções para ver a performance"
                  color={C.opcoes}
                />
              ) : (
                <>
                  {/* Hero Card */}
                  <Glass glow={C.opcoes} padding={16}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.heroLabel}>PREMIOS RECEBIDOS</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Prêmios Recebidos', text: 'Soma de todos os prêmios recebidos na venda de opções (prêmio × quantidade). Inclui opções ativas e encerradas.' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.heroValue}>R$ {fmt(opcTotalPremiosRecebidos)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <Text style={styles.heroLabel}>P&L ENCERRADAS</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L Encerradas', text: 'Resultado por operação encerrada: prêmio recebido na venda menos custo de recompra/fechamento. Soma todas as opções vendidas já encerradas (fechadas, exercidas, expiradas).' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.heroPct, { color: opcPLTotal >= 0 ? C.green : C.red }]}>
                          {opcPLTotal >= 0 ? '+' : ''}R$ {fmt(Math.abs(opcPLTotal))}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.catHeroDivider} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>ATIVAS</Text>
                        <Text style={[styles.kpiValue, { color: C.opcoes }]}>
                          {String(opcAtivas.length)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>ENCERRADAS</Text>
                        <Text style={[styles.kpiValue, { color: C.sub }]}>
                          {String(opcEncerradas.length)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>TOTAL</Text>
                        <Text style={[styles.kpiValue, { color: C.text }]}>
                          {String(opcoes.length)}
                        </Text>
                      </View>
                    </View>
                  </Glass>

                  {/* Performance metrics */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>WIN RATE</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Win Rate', text: 'Percentual de operações encerradas com lucro (P&L ≥ 0) sobre o total de encerradas vendidas.\n\nW = operações com lucro\nL = operações com prejuízo' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: opcWinRate >= 70 ? C.green : (opcWinRate >= 50 ? C.yellow : C.red) }]}>
                          {opcWinRate.toFixed(0)}%
                        </Text>
                        <Text style={styles.kpiSub}>{String(opcWins) + 'W / ' + String(opcLosses) + 'L'}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>TAXA MEDIA a.m.</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Taxa Média a.m.', text: 'Taxa mensal equivalente média das opções vendidas.\n\nPara cada opção: calcula o prêmio como % do valor de exposição (strike × qty), depois normaliza para 30 dias via juros compostos.\n\nFórmula: ((1 + prêmio%)^(30/DTE) - 1) × 100\n\nO valor anual (a.a.) é a taxa mensal × 12.' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.opcoes }]}>
                          {opcTaxaMediaMensal.toFixed(2)}%
                        </Text>
                        <Text style={styles.kpiSub}>{(opcTaxaMediaMensal * 12).toFixed(1) + '% a.a.'}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>PREMIUM YIELD</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Premium Yield', text: 'Prêmios recebidos nos últimos 12 meses como percentual do patrimônio total atual.\n\nFórmula: (prêmios 12M / patrimônio total) × 100\n\nMostra quanto a venda de opções rendeu em relação ao tamanho da carteira.' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {opcPremiumYield.toFixed(1)}%
                        </Text>
                        <Text style={styles.kpiSub}>12 meses</Text>
                      </View>
                    </Glass>
                  </View>

                  {/* CALL vs PUT + Taxas */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>CALL</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'CALL', text: 'Total de opções do tipo CALL (todas as direções). Valor = soma dos prêmios (prêmio × quantidade).' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {String(opcByTipo.call.count)}
                        </Text>
                        <Text style={styles.kpiSub}>R$ {fmt(opcByTipo.call.premio)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>PUT</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'PUT', text: 'Total de opções do tipo PUT (todas as direções). Valor = soma dos prêmios (prêmio × quantidade).' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.red }]}>
                          {String(opcByTipo.put.count)}
                        </Text>
                        <Text style={styles.kpiSub}>R$ {fmt(opcByTipo.put.premio)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>CUSTO FECH.</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Custo de Fechamento', text: 'Soma total dos custos de recompra de todas as opções encerradas (prêmio de fechamento × quantidade).\n\nÉ o valor pago para fechar posições antes do vencimento.' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.yellow }]}>
                          R$ {fmt(opcTotalPremiosFechamento)}
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Taxas de desfecho */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>VIROU PÓ</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Virou Pó', text: 'Percentual de opções encerradas que expiraram sem valor (OTM no vencimento).\n\nPrêmio mantido integralmente = lucro máximo da operação.' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {opcTaxaExpirouPO.toFixed(0)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>EXERCIDA</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Exercida', text: 'Percentual de opções encerradas que foram exercidas (ITM no vencimento).\n\nCALL exercida = venda do ativo no strike.\nPUT exercida = compra do ativo no strike.' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.yellow }]}>
                          {opcTaxaExercicio.toFixed(0)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Text style={styles.kpiLabel}>FECHADA</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Fechada', text: 'Percentual de opções encerradas por recompra antecipada (antes do vencimento).\n\nP&L = prêmio recebido na venda menos custo da recompra.' }); }}>
                            <Text style={{ fontSize: 11, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.kpiValue, { color: C.sub }]}>
                          {opcEncerradas.length > 0 ? (((opcByStatus.fechada && opcByStatus.fechada.count || 0) / opcEncerradas.length * 100).toFixed(0)) : '0'}%
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Desfechos PUT vs CALL */}
                  {opcEncerradas.length > 0 && (
                    <>
                      <SectionLabel>DESFECHOS</SectionLabel>
                      <Glass padding={12}>
                        <Text style={styles.sectionTitle}>PUT vs CALL POR DESFECHO</Text>
                        <DesfechosChart opcByStatus={opcByStatus} />
                      </Glass>
                    </>
                  )}

                  {/* Historico de premios (mensal / anual) */}
                  {opcMonthlyPremiums.length > 0 && (function() {
                    var isAnual = opcPremView === 'anual';
                    var chartData = isAnual ? premAnnualData : opcMonthlyPremiums;
                    var sumTotal = chartData.reduce(function(s, d) { return s + (d.total || d.value || 0); }, 0);
                    var sumCall = chartData.reduce(function(s, d) { return s + (d.call || 0); }, 0);
                    var sumPut = chartData.reduce(function(s, d) { return s + (d.put || 0); }, 0);
                    var selIdx = opcPremSelected;
                    var selData = selIdx >= 0 && selIdx < chartData.length ? chartData[selIdx] : null;
                    return (
                      <>
                        <SectionLabel>PRÊMIOS</SectionLabel>
                        <Glass padding={12}>
                          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                            <Pill active={opcPremView === 'mensal'}
                              color={C.accent}
                              onPress={function() { setOpcPremView('mensal'); setOpcPremSelected(-1); }}>Mensal</Pill>
                            <Pill active={opcPremView === 'anual'}
                              color={C.accent}
                              onPress={function() { setOpcPremView('anual'); setOpcPremSelected(-1); }}>Anual</Pill>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.text }}>
                              {'R$ ' + fmt(sumTotal)}
                              <Text style={{ fontSize: 10, color: C.sub }}>{isAnual ? ' total' : ' 12m'}</Text>
                            </Text>
                            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.acoes }}>
                              {'C R$ ' + fmt(sumCall)}
                            </Text>
                            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.opcoes }}>
                              {'P R$ ' + fmt(sumPut)}
                            </Text>
                          </View>

                          {/* Info bar when bar selected */}
                          {selData ? (
                            <View style={{ backgroundColor: C.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.border }}>
                              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body, textAlign: 'center', marginBottom: 3 }}>
                                {selData.month || ''}
                              </Text>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>Total</Text>
                                  <Text style={{ fontSize: 14, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.total || selData.value || 0)}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>CALL</Text>
                                  <Text style={{ fontSize: 14, color: C.acoes, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.call || 0)}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>PUT</Text>
                                  <Text style={{ fontSize: 14, color: C.opcoes, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.put || 0)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ) : null}

                          <PremiosBarChart
                            data={chartData}
                            showCall={false}
                            showPut={false}
                            selected={opcPremSelected}
                            onSelect={setOpcPremSelected}
                          />
                        </Glass>
                      </>
                    );
                  })()}

                  {/* Historico de recompras (mensal / anual) */}
                  {opcMonthlyPremiums.length > 0 && (function() {
                    var isAnual = opcRecView === 'anual';
                    var chartData = isAnual ? recAnnualData : recMonthlyData;
                    var sumTotal = chartData.reduce(function(s, d) { return s + (d.value || 0); }, 0);
                    var sumCall = chartData.reduce(function(s, d) { return s + (d.call || 0); }, 0);
                    var sumPut = chartData.reduce(function(s, d) { return s + (d.put || 0); }, 0);
                    var selIdx = opcRecSelected;
                    var selData = selIdx >= 0 && selIdx < chartData.length ? chartData[selIdx] : null;
                    return (
                      <>
                        <SectionLabel>RECOMPRAS</SectionLabel>
                        <Glass padding={12}>
                          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                            <Pill active={opcRecView === 'mensal'}
                              color={C.accent}
                              onPress={function() { setOpcRecView('mensal'); setOpcRecSelected(-1); }}>Mensal</Pill>
                            <Pill active={opcRecView === 'anual'}
                              color={C.accent}
                              onPress={function() { setOpcRecView('anual'); setOpcRecSelected(-1); }}>Anual</Pill>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.red }}>
                              {'R$ ' + fmt(sumTotal)}
                              <Text style={{ fontSize: 10, color: C.sub }}>{isAnual ? ' total' : ' 12m'}</Text>
                            </Text>
                            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.acoes }}>
                              {'C R$ ' + fmt(sumCall)}
                            </Text>
                            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.opcoes }}>
                              {'P R$ ' + fmt(sumPut)}
                            </Text>
                          </View>

                          {selData ? (
                            <View style={{ backgroundColor: C.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.border }}>
                              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body, textAlign: 'center', marginBottom: 3 }}>
                                {selData.month || ''}
                              </Text>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>Total</Text>
                                  <Text style={{ fontSize: 14, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.total || selData.value || 0)}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>CALL</Text>
                                  <Text style={{ fontSize: 14, color: C.acoes, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.call || 0)}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>PUT</Text>
                                  <Text style={{ fontSize: 14, color: C.opcoes, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.put || 0)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ) : null}

                          <PremiosBarChart
                            data={chartData}
                            showCall={false}
                            showPut={false}
                            selected={opcRecSelected}
                            onSelect={setOpcRecSelected}
                            barColor={C.red}
                          />
                        </Glass>
                      </>
                    );
                  })()}

                  {/* Historico de P&L (mensal / anual) */}
                  {opcMonthlyPremiums.length > 0 && (function() {
                    var isAnual = opcPLBarView === 'anual';
                    var chartData = isAnual ? plAnnualData : plMonthlyData;
                    var colors = isAnual ? plAnnualColors : plMonthlyColors;
                    var sumTotal = chartData.reduce(function(s, d) { return s + (d.value || 0); }, 0);
                    var sumCall = chartData.reduce(function(s, d) { return s + (d.call || 0); }, 0);
                    var sumPut = chartData.reduce(function(s, d) { return s + (d.put || 0); }, 0);
                    var selIdx = opcPLBarSelected;
                    var selData = selIdx >= 0 && selIdx < chartData.length ? chartData[selIdx] : null;
                    return (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <SectionLabel>P&L ENCERRADAS</SectionLabel>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'P&L Encerradas', text: 'Resultado das opções encerradas agrupado pelo mês de encerramento.\n\nPara cada opção fechada, exercida ou expirada, calcula: (prêmio recebido × quantidade) menos (custo de recompra × quantidade).\n\nO resultado inteiro da operação aparece no mês em que ela foi encerrada. A soma de todos os meses é igual ao valor do card P&L Encerradas no topo.\n\nVerde = lucro no mês, Vermelho = prejuízo no mês.' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <Glass padding={12}>
                          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                            <Pill active={opcPLBarView === 'mensal'}
                              color={C.accent}
                              onPress={function() { setOpcPLBarView('mensal'); setOpcPLBarSelected(-1); }}>Mensal</Pill>
                            <Pill active={opcPLBarView === 'anual'}
                              color={C.accent}
                              onPress={function() { setOpcPLBarView('anual'); setOpcPLBarSelected(-1); }}>Anual</Pill>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: 13, color: sumTotal >= 0 ? C.green : C.red }}>
                              {'R$ ' + fmt(sumTotal)}
                              <Text style={{ fontSize: 10, color: C.sub }}>{isAnual ? ' total' : ' 12m'}</Text>
                            </Text>
                            <Text style={{ fontFamily: F.mono, fontSize: 10, color: sumCall >= 0 ? C.green : C.red }}>
                              {'C R$ ' + fmt(sumCall)}
                            </Text>
                            <Text style={{ fontFamily: F.mono, fontSize: 10, color: sumPut >= 0 ? C.green : C.red }}>
                              {'P R$ ' + fmt(sumPut)}
                            </Text>
                          </View>

                          {selData ? (
                            <View style={{ backgroundColor: C.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.border }}>
                              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body, textAlign: 'center', marginBottom: 3 }}>
                                {selData.month || ''}
                              </Text>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>Total</Text>
                                  <Text style={{ fontSize: 14, color: (selData.value || 0) >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.value || 0)}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>CALL</Text>
                                  <Text style={{ fontSize: 14, color: (selData.call || 0) >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.call || 0)}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body }}>PUT</Text>
                                  <Text style={{ fontSize: 14, color: (selData.put || 0) >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>
                                    {'R$ ' + fmt(selData.put || 0)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ) : null}

                          <PremiosBarChart
                            data={chartData}
                            showCall={false}
                            showPut={false}
                            selected={opcPLBarSelected}
                            onSelect={setOpcPLBarSelected}
                            barColors={colors}
                          />
                        </Glass>
                      </>
                    );
                  })()}

                  {/* PUT: Prêmio x Recompra x P&L Médio 3M */}
                  {opcMonthlyPremiums.length > 1 && (
                    <>
                      <SectionLabel>PUT</SectionLabel>
                      <Glass padding={12}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Text style={styles.sectionTitle}>PRÊMIO x RECOMPRA x P&L MÉDIO 3M</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'PUT — Prêmio x Recompra x P&L', text: 'Fluxo mensal de PUTs vendidas. Prêmio: valor recebido no mês da abertura (D+1). Recompra: custo pago no mês do fechamento. P&L Médio: média móvel dos últimos 3 meses do resultado (prêmio - recompra).' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <PremioRecompraMA3Chart data={opcMonthlyPremiums} visible={putChartVis}
                          premioKey="put" recompraKey="recompra_put"
                          onToggle={function(v) { setPutChartVis(v); }} />
                      </Glass>
                    </>
                  )}

                  {/* CALL: Prêmio x Recompra x P&L Médio 3M */}
                  {opcMonthlyPremiums.length > 1 && (
                    <>
                      <SectionLabel>CALL</SectionLabel>
                      <Glass padding={12}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Text style={styles.sectionTitle}>PRÊMIO x RECOMPRA x P&L MÉDIO 3M</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'CALL — Prêmio x Recompra x P&L', text: 'Fluxo mensal de CALLs vendidas. Prêmio: valor recebido no mês da abertura (D+1). Recompra: custo pago no mês do fechamento. P&L Médio: média móvel dos últimos 3 meses do resultado (prêmio - recompra).' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <PremioRecompraMA3Chart data={opcMonthlyPremiums} visible={callChartVis}
                          premioKey="call" recompraKey="recompra_call"
                          onToggle={function(v) { setCallChartVis(v); }} />
                      </Glass>
                    </>
                  )}

                  {/* TOTAL: Prêmio x Recompra x P&L Médio 3M */}
                  {opcMonthlyPremiums.length > 1 && (
                    <>
                      <SectionLabel>TOTAL</SectionLabel>
                      <Glass padding={12}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Text style={styles.sectionTitle}>PRÊMIO x RECOMPRA x P&L MÉDIO 3M</Text>
                          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Total — Prêmio x Recompra x P&L', text: 'Fluxo mensal de todas as opções vendidas (PUT + CALL). Prêmio: valor recebido no mês da abertura (D+1). Recompra: custo pago no mês do fechamento. P&L Médio: média móvel dos últimos 3 meses do resultado (prêmio - recompra).' }); }}>
                            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                          </TouchableOpacity>
                        </View>
                        <PremioRecompraMA3Chart data={opcMonthlyPremiums} visible={totalChartVis}
                          premioKey="total" recompraKey="recompra"
                          onToggle={function(v) { setTotalChartVis(v); }} />
                      </Glass>
                    </>
                  )}

                  {/* P&L por Ativo Base */}
                  <SectionLabel>P&L POR ATIVO</SectionLabel>
                  <Glass padding={12}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pill active={opcPLFilter === 'todos'} color={C.accent}
                          onPress={function() { setOpcPLFilter('todos'); }}>Todos</Pill>
                        <Pill active={opcPLFilter === 'put'} color={C.opcoes}
                          onPress={function() { setOpcPLFilter('put'); }}>PUT</Pill>
                        <Pill active={opcPLFilter === 'call'} color={C.acoes}
                          onPress={function() { setOpcPLFilter('call'); }}>CALL</Pill>
                      </View>
                      <TouchableOpacity onPress={function() { setOpcPLSortAsc(!opcPLSortAsc); }}
                        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 16, color: C.accent }}>
                          {opcPLSortAsc ? '↑' : '↓'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {(function() {
                      var fKey = opcPLFilter === 'put' ? 'put_pl' : (opcPLFilter === 'call' ? 'call_pl' : 'pl');
                      var pKey = opcPLFilter === 'put' ? 'put_premio' : (opcPLFilter === 'call' ? 'call_premio' : 'premioRecebido');
                      var bases = Object.keys(opcByBase).filter(function(b) {
                        var bd = opcByBase[b];
                        if (opcPLFilter === 'put') return (bd.put_premio || 0) > 0 || (bd.put_pl || 0) !== 0;
                        if (opcPLFilter === 'call') return (bd.call_premio || 0) > 0 || (bd.call_pl || 0) !== 0;
                        return true;
                      });
                      bases.sort(function(a, b) {
                        var va = opcByBase[a][fKey] || 0;
                        var vb = opcByBase[b][fKey] || 0;
                        return opcPLSortAsc ? va - vb : vb - va;
                      });
                      var maxAbs = 1;
                      for (var bm = 0; bm < bases.length; bm++) {
                        var absV = Math.abs(opcByBase[bases[bm]][fKey] || 0);
                        if (absV > maxAbs) maxAbs = absV;
                      }
                      if (bases.length === 0) {
                        return <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', paddingVertical: 12 }}>Sem dados</Text>;
                      }
                      return bases.map(function(base, i) {
                        var bd = opcByBase[base];
                        var plVal = bd[fKey] || 0;
                        var premVal = bd[pKey] || 0;
                        var barPct = Math.min(Math.abs(plVal) / maxAbs * 100, 100);
                        var barColor = plVal >= 0 ? C.green : C.red;
                        return (
                          <View key={base} style={[{ paddingVertical: 10, paddingHorizontal: 4 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={styles.rankTicker}>{base}</Text>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 13, color: barColor, fontFamily: F.mono, fontWeight: '700' }}>
                                  {(plVal >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(plVal))}
                                </Text>
                                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>
                                  {'Prêmio R$ ' + fmt(premVal)}
                                </Text>
                              </View>
                            </View>
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' }}>
                              <View style={{ width: barPct + '%', height: 6, borderRadius: 3, backgroundColor: barColor }} />
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </Glass>

                </>
              )}
            </>
          )}

          {/* ── RF ── */}
          {perfSub === 'rf' && (
            <>
              {rfItems.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title="Sem Renda Fixa"
                  description="Cadastre seus titulos de renda fixa para ver a analise"
                  color={C.rf}
                />
              ) : (
                <>
                  {/* Hero Card */}
                  <Glass glow={C.rf} padding={16}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={styles.heroLabel}>TOTAL APLICADO</Text>
                        <Text style={styles.heroValue}>R$ {fmt(rfTotalAplicado)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.heroLabel}>VALOR ATUAL EST.</Text>
                        <Text style={[styles.heroValue, { color: C.rf }]}>R$ {fmt(rfTotalAtual)}</Text>
                      </View>
                    </View>
                    <View style={styles.catHeroDivider} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>RENT. BRUTA</Text>
                        <Text style={[styles.kpiValue, { color: rfRentBruta >= 0 ? C.green : C.red }]}>
                          {rfRentBruta >= 0 ? '+' : ''}{rfRentBruta.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>RENT. LIQ.</Text>
                        <Text style={[styles.kpiValue, { color: rfRentLiquida >= 0 ? C.green : C.red }]}>
                          {rfRentLiquida >= 0 ? '+' : ''}{rfRentLiquida.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>% CDI</Text>
                        <Text style={[styles.kpiValue, { color: rfPctCDI >= 100 ? C.green : C.yellow }]}>
                          {rfPctCDI.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  </Glass>

                  {/* Stats Row */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TITULOS</Text>
                        <Text style={[styles.kpiValue, { color: C.rf }]}>
                          {String(rfItems.length)}
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TAXA MEDIA</Text>
                        <Text style={[styles.kpiValue, { color: C.rf }]}>
                          {rfWeightedRate.toFixed(2)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENDIMENTO</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          +R$ {fmt(rfTotalAtual - rfTotalAplicado)}
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Breakdown by Tipo */}
                  <SectionLabel>POR TIPO</SectionLabel>
                  <Glass padding={0}>
                    {Object.keys(rfByTipo).map(function(tipo, i) {
                      var td = rfByTipo[tipo];
                      var pct = rfTotalAplicado > 0 ? (td.valor / rfTotalAplicado * 100) : 0;
                      var rentTipo = td.valor > 0 ? ((td.valorAtual - td.valor) / td.valor * 100) : 0;
                      return (
                        <View key={tipo} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={styles.rankTicker}>{RF_TIPO_LABELS[tipo] || tipo}</Text>
                            {RF_ISENTOS[tipo] && <Badge text="Isento IR" color={C.green} />}
                            <View style={styles.rankBarBg}>
                              <View style={[styles.rankBarFill, { width: pct + '%', backgroundColor: C.rf }]} />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.rankPct, { color: C.rf }]}>{pct.toFixed(0)}%</Text>
                            <Text style={styles.rankVal}>R$ {fmt(td.valor)} | {rentTipo >= 0 ? '+' : ''}{rentTipo.toFixed(1)}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>

                  {/* Breakdown by Indexador */}
                  <SectionLabel>POR INDEXADOR</SectionLabel>
                  <Glass padding={0}>
                    {Object.keys(rfByIndexador).map(function(idx, i) {
                      var id = rfByIndexador[idx];
                      var pct = rfTotalAplicado > 0 ? (id.valor / rfTotalAplicado * 100) : 0;
                      var idxColor = RF_IDX_COLORS[idx] || C.rf;
                      var rentIdx = id.valor > 0 ? ((id.valorAtual - id.valor) / id.valor * 100) : 0;
                      return (
                        <View key={idx} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Badge text={RF_IDX_LABELS[idx] || idx} color={idxColor} />
                            <View style={styles.rankBarBg}>
                              <View style={[styles.rankBarFill, { width: pct + '%', backgroundColor: idxColor }]} />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.rankPct, { color: idxColor }]}>{pct.toFixed(0)}%</Text>
                            <Text style={styles.rankVal}>R$ {fmt(id.valor)} | {rentIdx >= 0 ? '+' : ''}{rentIdx.toFixed(1)}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>

                  {/* Detalhamento por titulo */}
                  <SectionLabel>DETALHAMENTO</SectionLabel>
                  {rfEnriched.map(function(re, i) {
                    var rf = re.item;
                    var tipoLabel = RF_TIPO_LABELS[rf.tipo] || rf.tipo;
                    var urgencyColor = re.diasVenc < 30 ? C.red : (re.diasVenc < 90 ? C.yellow : C.rf);
                    return (
                      <Glass key={rf.id || i} padding={0}>
                        <View style={styles.posCard}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.rankTicker}>{tipoLabel}</Text>
                              <Badge text={re.irFaixa} color={re.isIsento ? C.green : C.yellow} />
                              <Badge text={re.diasVenc + 'd'} color={urgencyColor} />
                            </View>
                            <Text style={[styles.rankPct, { color: C.rf }]}>R$ {fmt(re.valorAtual)}</Text>
                          </View>
                          <Text style={[styles.posDetail, { marginTop: 4 }]}>
                            {rf.emissor || 'N/A'} | {rf.taxa + '% ' + (RF_IDX_LABELS[rf.indexador] || '')}
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                            <Text style={styles.posDetail}>
                              Aplicado: R$ {fmt(parseFloat(rf.valor_aplicado) || 0)}
                            </Text>
                            <Text style={[styles.posDetail, { color: re.rendBruto >= 0 ? C.green : C.red }]}>
                              Bruto: {re.rendBruto >= 0 ? '+' : ''}R$ {fmt(Math.abs(re.rendBruto))} ({re.rentBrutaPct.toFixed(1)}%)
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={styles.posDetail}>
                              Venc: {(function() { var d = new Date(rf.vencimento); return d.toLocaleDateString('pt-BR'); })()}
                            </Text>
                            <Text style={[styles.posDetail, { color: C.green }]}>
                              Liq: {re.rendLiquido >= 0 ? '+' : ''}R$ {fmt(Math.abs(re.rendLiquido))} ({re.rentLiqPct.toFixed(1)}%)
                            </Text>
                          </View>
                          {re.isIsento && re.cdiEquiv > 0 && (
                            <Text style={[styles.posDetail, { marginTop: 2, color: C.green }]}>
                              CDI equivalente: {re.cdiEquiv.toFixed(1)}% (vs {rf.taxa}% isento)
                            </Text>
                          )}
                        </View>
                      </Glass>
                    );
                  })}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ ALOCAÇÃO ═══════════ */}
      {sub === 'aloc' && (
        <>
          {positions.length === 0 ? (
            <EmptyState
              icon={"\u25EB"}
              title="Sem ativos"
              description="Adicione operações para ver a alocação da carteira"
              color={C.accent}
            />
          ) : (
            <>
                  {/* Donut — Alocacao por Classe */}
                  {allocSegments.length > 0 ? (
                    <Glass padding={14}>
                      <Text style={styles.sectionTitle}>ALOCAÇÃO POR CLASSE</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
                        <View style={{ position: 'relative', width: 130, height: 130 }}>
                          <DonutChart segments={allocSegments} size={130} />
                          <View style={styles.donutCenter}>
                            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>TOTAL</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.display }}>{allocSegments.length}</Text>
                            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>classes</Text>
                          </View>
                        </View>
                        <View style={{ flex: 1, gap: 6 }}>
                          {allocSegments.map(function (s, i) {
                            return (
                              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: s.color }} />
                                  <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>{s.label}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{s.pct.toFixed(1)}%</Text>
                                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>R$ {fmt(s.val)}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    </Glass>
                  ) : null}

                  {/* Peso por Ativo */}
                  {pesoList.length > 0 ? (
                    <Glass padding={14}>
                      <Text style={styles.sectionTitle}>PESO POR ATIVO</Text>
                      <View style={{ marginTop: 8 }}>
                        {pesoList.map(function (a, i) {
                          return <HBar key={i} label={a.ticker} value={a.pct} maxValue={pesoList[0].pct} color={a.color} suffix="%" />;
                        })}
                      </View>
                    </Glass>
                  ) : null}

                  {/* Treemap — preview + abrir fullscreen */}
                  {treemapItems.length > 0 ? (
                    <Glass padding={14}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={styles.sectionTitle}>MAPA DE CALOR</Text>
                        <TouchableOpacity onPress={function () { setTreemapModal(true); setSelectedTile(null); }}>
                          <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono }}>Abrir fullscreen</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 8 }}>
                        Tamanho = peso · Verde = alta hoje · Vermelho = queda
                      </Text>
                      <TreemapChart items={treemapItems} height={130} onPressTile={function (tile) { setSelectedTile(tile); }} />
                      {selectedTile && !treemapModalVisible ? (
                        <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{selectedTile.ticker}</Text>
                            <TouchableOpacity onPress={function () { setSelectedTile(null); }}>
                              <Text style={{ fontSize: 14, color: C.dim, fontFamily: F.mono }}>✕</Text>
                            </TouchableOpacity>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                            <View>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>QTD</Text>
                              <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>{selectedTile.quantidade}</Text>
                            </View>
                            <View>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>PM</Text>
                              <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>R$ {fmt(selectedTile.pm)}</Text>
                            </View>
                            <View>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>ATUAL</Text>
                              <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>R$ {fmt(selectedTile.preco_atual)}</Text>
                            </View>
                            <View>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>DIA</Text>
                              <Text style={{ fontSize: 11, color: selectedTile.change_day >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                                {selectedTile.change_day >= 0 ? '+' : ''}{selectedTile.change_day.toFixed(2)}%
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </Glass>
                  ) : null}

                  {/* Rebalanceamento */}
                  <RebalanceTool allocAtual={alocGrouped} totalCarteira={totalAlocPatrimonio}
                    positions={positions} assetList={assetList} rendaFixa={rendaFixa}
                    userId={user && user.id} savedTargets={savedRebalTargets} />
            </>
          )}
        </>
      )}

      {/* ═══════════ COMPOSIÇÃO ═══════════ */}
      {sub === 'comp' && (
        <>
          {positions.length === 0 ? (
            <EmptyState
              icon={"\u25EB"}
              title="Sem ativos"
              description="Adicione operações para ver a composição da carteira"
              color={C.accent}
            />
          ) : (
            <>
                  {/* Filter pills */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {SANKEY_FILTERS.map(function (f) {
                      return (
                        <Pill key={f.k} active={sankeyFilter === f.k} color={C.accent}
                          onPress={function () { setSankeyFilter(f.k); setSankeyTooltip(null); }}>
                          {f.l}
                        </Pill>
                      );
                    })}
                  </View>

                  {/* Two-Level Donut */}
                  <Glass padding={14}>
                    <Text style={styles.sectionTitle}>COMPOSIÇÃO DA CARTEIRA</Text>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 8, marginTop: 2 }}>
                      {'Toque em um segmento para ver detalhes'}
                    </Text>
                    <TwoLevelDonut
                      classes={compData.classes}
                      items={compData.items}
                      total={compData.total}
                      selected={sankeyTooltip}
                      filterLabel={sankeyFilter === 'setor' ? 'Setor' : sankeyFilter === 'segmento' ? 'Segmento' : 'Ativo'}
                      onTap={function (info) {
                        if (!info) { setSankeyTooltip(null); return; }
                        setSankeyTooltip(sankeyTooltip && sankeyTooltip.label === info.label && sankeyTooltip.side === info.side ? null : info);
                      }}
                    />
                    {/* Legend — outer ring items */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                      {compData.items.map(function (it, i) {
                        return (
                          <TouchableOpacity key={i}
                            onPress={function () {
                              setSankeyTooltip(sankeyTooltip && sankeyTooltip.label === it.key && sankeyTooltip.side === 'outer' ? null : {
                                label: it.key, value: it.value, pctTotal: it.pctTotal,
                                pctClass: it.pctClass, classLabel: it.classKey,
                                color: it.color, side: 'outer' });
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                              opacity: sankeyTooltip && sankeyTooltip.label === it.key ? 1 : 0.7 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: it.color }} />
                            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>{it.key.length > 14 ? it.key.substring(0, 13) + '..' : it.key}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: it.color, fontFamily: F.mono }}>{it.pctTotal.toFixed(0)}%</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Glass>

                  {/* Tooltip card */}
                  {sankeyTooltip ? (
                    <Glass padding={14}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: sankeyTooltip.color }} />
                          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display }}>
                            {sankeyTooltip.label}
                          </Text>
                          {sankeyTooltip.side === 'inner' ? (
                            <View style={{ backgroundColor: sankeyTooltip.color + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, fontWeight: '700', color: sankeyTooltip.color, fontFamily: F.mono }}>CLASSE</Text>
                            </View>
                          ) : null}
                        </View>
                        <TouchableOpacity onPress={function () { setSankeyTooltip(null); }}>
                          <Text style={{ fontSize: 14, color: C.dim, fontFamily: F.mono }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>VALOR</Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                            R$ {fmt(sankeyTooltip.value)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>% CARTEIRA</Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: C.accent, fontFamily: F.mono, marginTop: 2 }}>
                            {sankeyTooltip.pctTotal.toFixed(1)}%
                          </Text>
                        </View>
                        {sankeyTooltip.side === 'outer' && sankeyTooltip.classLabel ? (
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>
                              {'% ' + sankeyTooltip.classLabel.toUpperCase()}
                            </Text>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: sankeyTooltip.color, fontFamily: F.mono, marginTop: 2 }}>
                              {sankeyTooltip.pctClass.toFixed(1)}%
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </Glass>
                  ) : null}

                  {/* Breakdown by class — stacked bars + items */}
                  {compData.classes.map(function (cls, ci) {
                    var clsPct = compData.total > 0 ? (cls.value / compData.total) * 100 : 0;
                    var clsItems = compData.items.filter(function (it) { return it.classKey === cls.key; });
                    return (
                      <Glass key={ci} padding={0}>
                        {/* Class header */}
                        <TouchableOpacity
                          onPress={function () {
                            setSankeyTooltip(sankeyTooltip && sankeyTooltip.label === cls.key && sankeyTooltip.side === 'inner' ? null : {
                              label: cls.key, value: cls.value, pctTotal: clsPct, color: cls.color, side: 'inner' });
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12,
                            borderBottomWidth: 1, borderBottomColor: C.border }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: cls.color }} />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{cls.key}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: cls.color, fontFamily: F.mono }}>{clsPct.toFixed(1)}%</Text>
                            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>R$ {fmt(cls.value)}</Text>
                          </View>
                        </TouchableOpacity>
                        {/* Stacked bar for this class */}
                        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
                          <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                            {clsItems.map(function (it, ii) {
                              var w = cls.value > 0 ? (it.value / cls.value) * 100 : 0;
                              return (
                                <View key={ii} style={{ width: w + '%', height: 8, backgroundColor: it.color, opacity: 0.8 }} />
                              );
                            })}
                          </View>
                        </View>
                        {/* Item rows */}
                        {clsItems.map(function (it, ii) {
                          var isSelected = sankeyTooltip && sankeyTooltip.label === it.key && sankeyTooltip.side === 'outer';
                          return (
                            <TouchableOpacity key={ii}
                              onPress={function () {
                                setSankeyTooltip(isSelected ? null : {
                                  label: it.key, value: it.value, pctTotal: it.pctTotal,
                                  pctClass: it.pctClass, classLabel: it.classKey,
                                  color: it.classColor, side: 'outer' });
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                paddingHorizontal: 12, paddingVertical: 8,
                                backgroundColor: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
                                borderTopWidth: 1, borderTopColor: C.border }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: it.color }} />
                                <Text style={{ fontSize: 12, fontWeight: '500', color: C.text, fontFamily: F.body }} numberOfLines={1}>{it.key}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 40, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                  <View style={{ height: 3, borderRadius: 2, backgroundColor: it.color,
                                    width: clamp(it.pctClass, 1, 100) + '%' }} />
                                </View>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: it.color, fontFamily: F.mono, width: 38, textAlign: 'right' }}>
                                  {it.pctTotal.toFixed(1)}%
                                </Text>
                                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 65, textAlign: 'right' }}>
                                  R$ {fmt(it.value)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </Glass>
                    );
                  })}
            </>
          )}
        </>
      )}

      {/* Treemap Fullscreen Modal */}
      <Modal visible={infoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {infoModal && infoModal.title || ''}
            </Text>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
              {infoModal && infoModal.text || ''}
            </Text>
            <TouchableOpacity onPress={function() { setInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={treemapModalVisible} animationType="fade" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <View style={{ paddingTop: 50, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display, letterSpacing: 0.6 }}>
              MAPA DE CALOR — EXPOSIÇÃO
            </Text>
            <TouchableOpacity onPress={function () { setTreemapModal(false); setSelectedTile(null); }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono }}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 18, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.green, opacity: 0.5 }} />
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Alta hoje</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.red, opacity: 0.5 }} />
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Queda hoje</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <TreemapChart items={treemapItems} height={SCREEN_H - 260} onPressTile={function (tile) { setSelectedTile(tile); }} />
          </View>
          {selectedTile ? (
            <View style={{ margin: 12, padding: 12, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selectedTile.color }} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display }}>{selectedTile.ticker}</Text>
                  <Text style={{ fontSize: 11, color: selectedTile.change_day >= 0 ? C.green : C.red, fontWeight: '600', fontFamily: F.mono }}>
                    {selectedTile.change_day >= 0 ? '+' : ''}{selectedTile.change_day.toFixed(2)}% dia
                  </Text>
                </View>
                <TouchableOpacity onPress={function () { setSelectedTile(null); }}>
                  <Text style={{ fontSize: 16, color: C.dim, fontFamily: F.mono }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>QUANTIDADE</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                    {selectedTile.quantidade.toLocaleString('pt-BR')}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>PM</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                    R$ {fmt(selectedTile.pm)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>PRECO ATUAL</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                    R$ {fmt(selectedTile.preco_atual)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>P&L</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: selectedTile.pnl >= 0 ? C.green : C.red, fontFamily: F.mono, marginTop: 2 }}>
                    {selectedTile.pnl >= 0 ? '+' : '-'}R$ {fmt(Math.abs(selectedTile.pnl))}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* ═══════════ PROVENTOS ═══════════ */}
      {sub === 'prov' && (
        <>
          {/* Sub-tab pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={styles.perfSubTabs}>
              {PROV_SUBS.map(function(ps) {
                var isActive = provSub === ps.k;
                return (
                  <Pill key={ps.k} active={isActive} color={C.accent}
                    onPress={function() { setProvSub(ps.k); }}>
                    {ps.l}
                  </Pill>
                );
              })}
            </View>
          </ScrollView>

          {/* ═══ VISAO GERAL ═══ */}
          {provSub === 'visao' && (
            <>
              {/* KPI Hero */}
              <Glass glow={C.accent} padding={14}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 12 }}>
                  {[
                    { l: 'RENDA PASSIVA TOTAL', v: 'R$ ' + fmt(rendaPassivaTotal), c: C.green },
                    { l: '12 MESES', v: 'R$ ' + fmt(rendaPassiva12m), c: C.accent },
                    { l: 'MEDIA/MES', v: 'R$ ' + fmt(rendaPassivaMediaMensal), c: C.fiis },
                    { l: 'YIELD s/ CUSTO', v: rendaPassivaYoC.toFixed(2) + '%', c: rendaPassivaYoC >= selicRate ? C.green : C.yellow },
                  ].map(function(d, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', minWidth: 70 }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* Composicao da Renda */}
              <Glass padding={14}>
                <Text style={styles.sectionTitle}>COMPOSIÇÃO DA RENDA</Text>
                {rendaPassivaTotal > 0 ? (
                  <>
                    <View style={{ height: 20, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', marginTop: 8 }}>
                      {rpDividendos > 0 && <View style={{ width: (rpDividendos / rendaPassivaTotal * 100) + '%', height: 20, backgroundColor: C.acoes }} />}
                      {rpRendimentos > 0 && <View style={{ width: (rpRendimentos / rendaPassivaTotal * 100) + '%', height: 20, backgroundColor: C.fiis }} />}
                      {rpRF > 0 && <View style={{ width: (rpRF / rendaPassivaTotal * 100) + '%', height: 20, backgroundColor: C.rf }} />}
                      {rpPLOpcoes !== 0 && <View style={{ width: (Math.abs(rpPLOpcoes) / rendaPassivaTotal * 100) + '%', height: 20, backgroundColor: rpPLOpcoes >= 0 ? C.green : C.red }} />}
                    </View>
                    {[
                      { l: 'Dividendos / JCP', v: rpDividendos, c: C.acoes },
                      { l: 'Rendimentos FII', v: rpRendimentos, c: C.fiis },
                      { l: 'Renda Fixa (mês)', v: rpRF, c: C.rf },
                      { l: 'P&L Opções Encerradas', v: rpPLOpcoes, c: rpPLOpcoes >= 0 ? C.green : C.red },
                    ].map(function(item, idx) {
                      if (item.v === 0) return null;
                      return (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: idx === 0 ? 8 : 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: item.c }} />
                            <Text style={{ fontSize: 11, color: C.text, fontFamily: F.body }}>{item.l}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: item.c, fontFamily: F.mono }}>
                              {(Math.abs(item.v) / rendaPassivaTotal * 100).toFixed(0) + '%'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: item.v >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                            {(item.v < 0 ? '-' : '') + 'R$ ' + fmt(Math.abs(item.v))}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginTop: 4 }}>Sem dados</Text>
                )}
              </Glass>

              {/* Meta mensal combinada */}
              {metaMensal > 0 && (
                <Glass padding={14}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>META MENSAL (COMBINADO)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: rendaPassivaMediaMensal >= metaMensal ? C.green : C.yellow, fontFamily: F.mono }}>
                      {'R$ ' + fmt(rendaPassivaMediaMensal) + ' / R$ ' + fmt(metaMensal)}
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: Math.min(rendaPassivaMediaMensal / metaMensal * 100, 100) + '%', height: 8, backgroundColor: rendaPassivaMediaMensal >= metaMensal ? C.green : C.yellow, borderRadius: 4 }} />
                  </View>
                </Glass>
              )}

              {/* Renda passiva total por mês */}
              {rpLineData.length > 0 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>RENDA PASSIVA TOTAL / MÊS</Text>
                  <RendaPassivaTotalChart data={rpLineData} />
                </Glass>
              )}

              {/* Renda passiva line chart por categoria */}
              {rpLineData.length > 0 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>EVOLUÇÃO POR TIPO</Text>
                  <RendaPassivaLineChart
                    data={rpLineData}
                    visible={rpLineVis}
                    onToggle={function(k) {
                      var nv = {};
                      for (var tk in rpLineVis) { nv[tk] = rpLineVis[tk]; }
                      nv[k] = !nv[k];
                      setRpLineVis(nv);
                    }}
                  />
                </Glass>
              )}

              {/* Tabela Recebidos / A Receber do Ano */}
              <Glass padding={14}>
                <Text style={styles.sectionTitle}>{'RECEBIDOS / A RECEBER — ' + rpAnoAtual}</Text>
                {/* Header */}
                <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 8 }}>
                  <Text style={{ flex: 2, fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>TIPO</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, textAlign: 'right' }}>RECEBIDO</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, textAlign: 'right' }}>A RECEBER</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, textAlign: 'right' }}>TOTAL</Text>
                </View>
                {/* Rows */}
                {rpTblRows.map(function(row, ri) {
                  var rowTotal = row.r + row.a;
                  if (rowTotal === 0 && row.r === 0) return null;
                  return (
                    <View key={ri} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border + '30', alignItems: 'center' }}>
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: row.c }} />
                        <Text style={{ fontSize: 11, color: C.text, fontFamily: F.body }}>{row.l}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono, textAlign: 'right' }}>
                        {fmt(row.r)}
                      </Text>
                      <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: C.yellow, fontFamily: F.mono, textAlign: 'right' }}>
                        {fmt(row.a)}
                      </Text>
                      <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.mono, textAlign: 'right' }}>
                        {fmt(rowTotal)}
                      </Text>
                    </View>
                  );
                })}
                {/* Total row */}
                <View style={{ flexDirection: 'row', paddingVertical: 8, marginTop: 2 }}>
                  <Text style={{ flex: 2, fontSize: 11, fontWeight: '800', color: C.text, fontFamily: F.display }}>TOTAL</Text>
                  <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: C.green, fontFamily: F.mono, textAlign: 'right' }}>
                    {fmt(rpTblTotalR)}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: C.yellow, fontFamily: F.mono, textAlign: 'right' }}>
                    {fmt(rpTblTotalA)}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: C.accent, fontFamily: F.mono, textAlign: 'right' }}>
                    {fmt(rpTblTotalR + rpTblTotalA)}
                  </Text>
                </View>
              </Glass>

              {/* Ranking geral de ativos */}
              {rpRankList.length > 0 && (
                <Glass padding={14}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.sectionTitle}>RANKING — RENDA PASSIVA</Text>
                    <TouchableOpacity onPress={function() { setRpRankAsc(!rpRankAsc); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.mono, fontWeight: '700' }}>
                        {rpRankAsc ? '↑ Crescente' : '↓ Decrescente'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 6 }}>
                    <Text style={{ width: 28, fontSize: 8, color: C.dim, fontFamily: F.mono }}>#</Text>
                    <Text style={{ flex: 2, fontSize: 8, color: C.dim, fontFamily: F.mono }}>ATIVO</Text>
                    <Text style={{ flex: 1, fontSize: 8, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>TIPO</Text>
                    <Text style={{ flex: 1, fontSize: 8, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>TOTAL</Text>
                  </View>
                  {rpRankList.slice().sort(function(a, b) { return rpRankAsc ? a.total - b.total : b.total - a.total; }).map(function(item, idx) {
                    return (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border + '20', alignItems: 'center' }}>
                        <Text style={{ width: 28, fontSize: 10, color: C.dim, fontFamily: F.mono }}>{idx + 1}</Text>
                        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.c }} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{item.ticker}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 9, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>{item.tipo}</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: item.total >= 0 ? C.green : C.red, fontFamily: F.mono, textAlign: 'right' }}>
                          {(item.total < 0 ? '-' : '') + 'R$ ' + fmt(Math.abs(item.total))}
                        </Text>
                      </View>
                    );
                  })}
                </Glass>
              )}
            </>
          )}

          {/* ═══ PROVENTOS ═══ */}
          {provSub === 'proventos' && (
            <>
              {/* KPI Cards */}
              <Glass glow={C.fiis} padding={14}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 12 }}>
                  {[
                    { l: 'TOTAL RECEBIDO', v: 'R$ ' + fmt(provSemEtfRecebido), c: C.green },
                    { l: 'A RECEBER', v: 'R$ ' + fmt(provSemEtfAReceber), c: C.yellow },
                    { l: '12M (RECEBIDO)', v: 'R$ ' + fmt(provSemEtf12m), c: C.accent },
                    { l: 'YoC', v: provYoC.toFixed(2) + '%', c: C.fiis },
                    { l: 'DY', v: provDY.toFixed(2) + '%', c: C.acoes },
                    { l: 'YoC vs SELIC', v: (provYoC - selicRate).toFixed(1) + '%', c: provYoC >= selicRate ? C.green : C.red },
                  ].map(function(d, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', minWidth: 70 }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* Filter pills */}
              <View style={styles.provFilterRow}>
                {PROV_FILTERS.map(function(f) {
                  return (
                    <Pill key={f.k} active={provFilter === f.k} color={TIPO_COLORS_PROV[f.k] || C.accent}
                      onPress={function() { setProvFilter(f.k); }}>
                      {f.l}
                    </Pill>
                  );
                })}
              </View>

              {/* Monthly vertical bar chart */}
              {maxProvMonth > 0 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>PROVENTOS MENSAIS (12M)</Text>
                  <ProvMonthlyBarChart data={last12} maxVal={maxProvMonth} color={C.fiis} height={200}
                    selected={provMonthSel} onSelect={function(i) { setProvMonthSel(i); }} />
                </Glass>
              )}

              {/* Annual vertical bar chart */}
              {annualData.length >= 1 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>EVOLUÇÃO ANUAL</Text>
                  <AnnualBarChart data={annualData} maxVal={maxProvYear} color={C.accent} height={180}
                    selected={provYearSel} onSelect={function(i) { setProvYearSel(i); }} />
                  {annualData.length >= 2 && provYearSel === -1 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 6 }}>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                        {annualData[annualData.length - 2].month + ': R$ ' + fmt(annualData[annualData.length - 2].value)}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{'>'}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                        {annualData[annualData.length - 1].month + ': R$ ' + fmt(annualData[annualData.length - 1].value)}
                      </Text>
                      {annualData[annualData.length - 2].value > 0 && (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: annualData[annualData.length - 1].value >= annualData[annualData.length - 2].value ? C.green : C.red, fontFamily: F.mono }}>
                          {'(' + (((annualData[annualData.length - 1].value / annualData[annualData.length - 2].value) - 1) * 100).toFixed(0) + '%)'}
                        </Text>
                      )}
                    </View>
                  )}
                  {provYearSel >= 0 && provYearSel < annualData.length && (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                        {annualData[provYearSel].month + ': R$ ' + fmt(annualData[provYearSel].value)}
                      </Text>
                      {provYearSel > 0 && annualData[provYearSel - 1].value > 0 ? (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: annualData[provYearSel].value >= annualData[provYearSel - 1].value ? C.green : C.red, fontFamily: F.mono }}>
                          {'(' + (((annualData[provYearSel].value / annualData[provYearSel - 1].value) - 1) * 100).toFixed(0) + '% vs ' + annualData[provYearSel - 1].month + ')'}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </Glass>
              )}

              {/* Breakdown by tipo */}
              {Object.keys(provsByTipo).length > 0 && (
                <Glass padding={14}>
                  <Text style={styles.sectionTitle}>BREAKDOWN POR TIPO</Text>
                  {Object.keys(provsByTipo).sort(function(a, b) { return provsByTipo[b].total - provsByTipo[a].total; }).map(function(tipo) {
                    var info = provsByTipo[tipo];
                    var pct = totalProvs > 0 ? (info.total / totalProvs * 100) : 0;
                    var tipoLabel = tipo === 'dividendo' ? 'Dividendo' : tipo === 'jcp' ? 'JCP' : tipo === 'rendimento' ? 'Rendimento' : tipo === 'juros_rf' ? 'Juros RF' : tipo === 'amortizacao' ? 'Amortização' : tipo === 'bonificacao' ? 'Bonificação' : tipo;
                    return (
                      <View key={tipo} style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Badge text={tipoLabel} color={TIPO_COLORS_PROV[tipo] || C.fiis} />
                            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono }}>{info.count + 'x'}</Text>
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                            {'R$ ' + fmt(info.total) + ' (' + pct.toFixed(0) + '%)'}
                          </Text>
                        </View>
                        <View style={{ height: 4, backgroundColor: C.border, borderRadius: 2, marginTop: 4 }}>
                          <View style={{ width: pct + '%', height: 4, backgroundColor: TIPO_COLORS_PROV[tipo] || C.fiis, borderRadius: 2 }} />
                        </View>
                      </View>
                    );
                  })}
                  {jcpLiquido > 0 && (
                    <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>JCP BRUTO</Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: F.mono }}>{'R$ ' + fmt(jcpBruto)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>IR RETIDO NA FONTE (15%)</Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.red, fontFamily: F.mono }}>{'- R$ ' + fmt(jcpIR)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>JCP LIQUIDO RECEBIDO</Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono }}>{'R$ ' + fmt(jcpLiquido)}</Text>
                      </View>
                    </View>
                  )}
                </Glass>
              )}


              {/* Top payers (YoC ranking) */}
              {assetProvRanking.length > 0 && (
                <Glass padding={14}>
                  <Text style={styles.sectionTitle}>RANKING ATIVOS (12M)</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, flex: 1 }}>ATIVO</Text>
                    <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 80, textAlign: 'right' }}>TOTAL 12M</Text>
                    <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 55, textAlign: 'right' }}>YoC</Text>
                  </View>
                  {assetProvRanking.filter(function(a) { return a.total12m > 0; }).map(function(a, idx) {
                    var catColor = CAT_COLORS[a.categoria] || C.accent;
                    return (
                      <View key={a.ticker} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: idx < assetProvRanking.length - 1 ? 0.5 : 0, borderBottomColor: C.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 16 }}>{idx + 1 + '.'}</Text>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: catColor }} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display }}>{a.ticker}</Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono, width: 80, textAlign: 'right' }}>
                          {'R$ ' + fmt(a.total12m)}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: a.yoc >= selicRate ? C.green : a.yoc > 0 ? C.yellow : C.dim, fontFamily: F.mono, width: 55, textAlign: 'right' }}>
                          {a.yoc.toFixed(1) + '%'}
                        </Text>
                      </View>
                    );
                  })}
                  {assetProvRanking.filter(function(a) { return a.total12m === 0 && a.quantidade > 0; }).length > 0 && (
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 4 }}>SEM PROVENTOS 12M</Text>
                      <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>
                        {assetProvRanking.filter(function(a) { return a.total12m === 0 && a.quantidade > 0; }).map(function(a) { return a.ticker; }).join(', ')}
                      </Text>
                    </View>
                  )}
                </Glass>
              )}

              {/* Heatmap dividendos ações */}
              {hmTickerList.length > 0 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>MAPA DE CALOR — SAZONALIDADE DIVIDENDOS</Text>
                  <DividendHeatmap tickers={hmTickerList} months={hmMonths} data={hmTickers} maxVal={hmMaxVal} />
                </Glass>
              )}

              {/* Current month proventos by corretora */}
              {provMesAtual.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title="Sem proventos"
                  description={"Sem proventos previstos para " + currentMonthLabel}
                  color={C.fiis}
                />
              ) : (
                <>
                  {/* Header resumo mes */}
                  <Glass glow={C.green} padding={14}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5, textAlign: 'center', marginBottom: 6 }}>{currentMonthLabel}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around', gap: 12 }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>TOTAL MES</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: C.green, fontFamily: F.display, marginTop: 2 }}>
                          {'R$ ' + fmt(totalMesPago + totalMesPendente)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>RECEBIDO</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.green, fontFamily: F.mono, marginTop: 2 }}>
                          {'R$ ' + fmt(totalMesPago)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>PENDENTE</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.yellow, fontFamily: F.mono, marginTop: 2 }}>
                          {'R$ ' + fmt(totalMesPendente)}
                        </Text>
                      </View>
                    </View>
                  </Glass>

                  {/* Cards por corretora */}
                  {Object.keys(corretoraMap).sort().map(function(corretora) {
                    var corrData = corretoraMap[corretora];
                    var corrTotal = corrData.totalPago + corrData.totalPendente;
                    var sortedItems = corrData.items.slice().sort(function(a, b) {
                      return (a.dataPagamento || '').localeCompare(b.dataPagamento || '');
                    });
                    return (
                      <Glass key={corretora} padding={0}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>{corretora}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                            {'R$ ' + fmt(corrTotal)}
                          </Text>
                        </View>
                        {sortedItems.map(function(item, idx) {
                          var tipoColor = TIPO_COLORS_PROV[item.tipo] || C.fiis;
                          var tipoLabel = item.tipo === 'dividendo' ? 'DIV' : item.tipo === 'jcp' ? 'JCP' : item.tipo === 'rendimento' ? 'REND' : item.tipo === 'juros_rf' ? 'RF' : item.tipo === 'amortizacao' ? 'AMORT' : item.tipo === 'bonificacao' ? 'BONIF' : (item.tipo || 'DIV').toUpperCase();
                          var dataParts = (item.dataPagamento || '').split('-');
                          var dataLabel = dataParts.length >= 3 ? dataParts[2] + '/' + dataParts[1] : item.dataPagamento;
                          return (
                            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: F.body }}>{item.ticker}</Text>
                                <Badge text={tipoLabel} color={tipoColor} />
                                <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>{dataLabel}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>
                                  {'R$ ' + fmt(item.valorPorCota) + ' x ' + item.quantidade}
                                </Text>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                                  {'R$ ' + fmt(item.valorTotal)}
                                </Text>
                                <Badge text={item.isPago ? 'PAGO' : 'PENDENTE'} color={item.isPago ? C.green : C.yellow} />
                              </View>
                            </View>
                          );
                        })}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'PAGO: R$ ' + fmt(corrData.totalPago)}</Text>
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'PENDENTE: R$ ' + fmt(corrData.totalPendente)}</Text>
                        </View>
                      </Glass>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* ═══ PREMIOS ═══ */}
          {provSub === 'premios' && (
            <>
              {opcoes.length === 0 ? (
                <EmptyState
                  icon={"\u2B23"}
                  title="Sem opções"
                  description="Adicione opções vendidas para ver prêmios recebidos aqui"
                  color={C.opcoes}
                />
              ) : (
                <>
                  {/* KPI Cards */}
                  <Glass glow={C.opcoes} padding={14}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 12 }}>
                      {[
                        { l: 'PRÊMIOS TOTAIS', v: 'R$ ' + fmt(opcTotalPremiosRecebidos), c: C.green },
                        { l: 'RECOMPRA TOTAIS', v: 'R$ ' + fmt(opcTotalPremiosFechamento), c: C.red },
                        { l: 'P&L LÍQUIDO', v: 'R$ ' + fmt(opcPLTotal), c: opcPLTotal >= 0 ? C.green : C.red },
                        { l: 'P&L MÉDIA/MÊS', v: 'R$ ' + fmt(plMediaMensal), c: plMediaMensal >= 0 ? C.accent : C.red },
                        { l: 'YIELD P&L', v: plYieldOnCost.toFixed(2) + '%', c: plYieldOnCost > 0 ? C.green : C.dim },
                      ].map(function(d, i) {
                        return (
                          <View key={i} style={{ alignItems: 'center', minWidth: 70 }}>
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Glass>

                  {/* Line chart: Prêmios x Recompra x P&L */}
                  {premLineData.length > 0 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>PRÊMIOS x RECOMPRA x P&L (12M)</Text>
                      <PremiosRecompraLineChart
                        data={premLineData}
                        visible={premLineVis}
                        onToggle={function(key) {
                          var nv = {};
                          for (var k in premLineVis) { nv[k] = premLineVis[k]; }
                          nv[key] = !nv[key];
                          setPremLineVis(nv);
                        }}
                      />
                    </Glass>
                  )}

                  {/* P&L Líquido Mensal */}
                  {plMaxMonth > 0 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>P&L LÍQUIDO MENSAL (12M)</Text>
                      <PremiosBarChart data={plMonthlyData} barColors={plMonthlyColors}
                        selected={plMonthSel} onSelect={function(i) { setPlMonthSel(i); }} />
                      {plMonthSel >= 0 && plMonthSel < plMonthlyData.length && (function() {
                        var selPL = plMonthlyData[plMonthSel];
                        return (
                          <View style={{ marginTop: 6 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: selPL.value >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                                {selPL.month + ': ' + (selPL.value >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(selPL.value))}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 2 }}>
                              <Text style={{ fontSize: 10, color: C.acoes, fontFamily: F.mono }}>
                                {'CALL: ' + (selPL.call >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(selPL.call))}
                              </Text>
                              <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono }}>
                                {'PUT: ' + (selPL.put >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(selPL.put))}
                              </Text>
                            </View>
                          </View>
                        );
                      })()}
                    </Glass>
                  )}

                  {/* P&L Líquido Anual */}
                  {plAnnualData.length >= 1 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>P&L LÍQUIDO ANUAL</Text>
                      <PremiosBarChart data={plAnnualData} barColors={plAnnualColors}
                        selected={plYearSel} onSelect={function(i) { setPlYearSel(i); }} />
                      {plYearSel >= 0 && plYearSel < plAnnualData.length && (function() {
                        var selPLY = plAnnualData[plYearSel];
                        return (
                          <View style={{ marginTop: 6 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: selPLY.value >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                                {selPLY.month + ': ' + (selPLY.value >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(selPLY.value))}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 2 }}>
                              <Text style={{ fontSize: 10, color: C.acoes, fontFamily: F.mono }}>
                                {'CALL: ' + (selPLY.call >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(selPLY.call))}
                              </Text>
                              <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono }}>
                                {'PUT: ' + (selPLY.put >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(selPLY.put))}
                              </Text>
                            </View>
                            {plYearSel > 0 && plAnnualData[plYearSel - 1].total > 0 && (
                              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: selPLY.value >= plAnnualData[plYearSel - 1].value ? C.green : C.red, fontFamily: F.mono }}>
                                  {'vs ' + plAnnualData[plYearSel - 1].month + ': ' + (selPLY.value >= plAnnualData[plYearSel - 1].value ? '+' : '') + fmt(selPLY.value - plAnnualData[plYearSel - 1].value)}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    </Glass>
                  )}

                  {/* CALL vs PUT (P&L Líquido) */}
                  <Glass padding={14}>
                    <Text style={styles.sectionTitle}>CALL vs PUT (P&L LÍQUIDO)</Text>
                    {absPLTotal > 0 ? (
                      <>
                        <View style={{ height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', marginTop: 8 }}>
                          <View style={{ width: (Math.abs(callPLTotal) / absPLTotal * 100) + '%', height: 16, backgroundColor: C.acoes }} />
                          <View style={{ width: (Math.abs(putPLTotal) / absPLTotal * 100) + '%', height: 16, backgroundColor: C.opcoes }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.acoes }} />
                            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>CALL</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: callPLTotal >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                              {(callPLTotal >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(callPLTotal))}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.opcoes }} />
                            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>PUT</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: putPLTotal >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                              {(putPLTotal >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(putPLTotal))}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginTop: 4 }}>Sem P&L</Text>
                    )}
                  </Glass>

                  {/* Asset ranking by P&L */}
                  {premAssetRanking.length > 0 && (
                    <Glass padding={14}>
                      <Text style={styles.sectionTitle}>RANKING ATIVOS POR P&L LÍQUIDO</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, flex: 1 }}>ATIVO</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 90, textAlign: 'right' }}>PRÊMIO</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 90, textAlign: 'right' }}>RECOMPRA</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 90, textAlign: 'right' }}>P&L</Text>
                      </View>
                      {premAssetRanking.filter(function(a) { return a.premio > 0; }).slice().sort(function(a, b) { return b.pl - a.pl; }).map(function(a, idx) {
                        return (
                          <View key={a.ticker} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: idx < premAssetRanking.length - 1 ? 0.5 : 0, borderBottomColor: C.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 16 }}>{idx + 1 + '.'}</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display }}>{a.ticker}</Text>
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono, width: 90, textAlign: 'right' }}>
                              {'R$ ' + fmt(a.premio)}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: a.recompra > 0 ? C.red : C.dim, fontFamily: F.mono, width: 90, textAlign: 'right' }}>
                              {'R$ ' + fmt(a.recompra)}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: a.pl >= 0 ? C.green : C.red, fontFamily: F.mono, width: 90, textAlign: 'right' }}>
                              {(a.pl >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(a.pl))}
                            </Text>
                          </View>
                        );
                      })}
                    </Glass>
                  )}

                  {/* Monthly detail list */}
                  {Object.keys(premByMonthDetail).length > 0 && (
                    <>
                      <SectionLabel>HISTÓRICO MENSAL</SectionLabel>
                      {Object.keys(premByMonthDetail)
                        .sort(function(a, b) { return b.localeCompare(a); })
                        .slice(0, 12)
                        .map(function(month) {
                          var items = premByMonthDetail[month];
                          var total = items.reduce(function(s, o) { return s + (o.premio || 0) * (o.quantidade || 0); }, 0);
                          var parts = month.split('-');
                          var label = MONTH_LABELS[parseInt(parts[1])] + '/' + parts[0];
                          return (
                            <Glass key={month} padding={0}>
                              <View style={styles.monthHeader}>
                                <Text style={styles.monthLabel}>{label}</Text>
                                <Text style={[styles.monthTotal, { color: C.green }]}>
                                  {'+R$ ' + fmt(total)}
                                </Text>
                              </View>
                              {items.map(function(o, i) {
                                var premVal = (o.premio || 0) * (o.quantidade || 0);
                                var tipoOp = (o.tipo || 'call').toUpperCase();
                                return (
                                  <View key={i} style={[styles.provRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>{o.ativo_base || o.ticker_opcao}</Text>
                                      <Badge text={tipoOp} color={o.tipo === 'call' ? C.acoes : C.opcoes} />
                                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{o.ticker_opcao}</Text>
                                    </View>
                                    <Text style={{ fontSize: 10, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                                      {'+R$ ' + fmt(premVal)}
                                    </Text>
                                  </View>
                                );
                              })}
                            </Glass>
                          );
                        })}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ RENDIMENTOS (FIIs) ═══ */}
          {provSub === 'rendimentos' && (
            <>
              {Object.keys(fiiTickerSet).length === 0 ? (
                <EmptyState icon={'\u25CB'} title="Sem FIIs" description="Adicione FIIs na carteira para ver rendimentos" color={C.fiis} />
              ) : (
                <>
                  {/* KPI Cards */}
                  <Glass glow={C.fiis} padding={14}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 12 }}>
                      {[
                        { l: 'TOTAL RECEBIDO', v: 'R$ ' + fmt(fiiRendRecebido), c: C.green },
                        { l: 'A RECEBER', v: 'R$ ' + fmt(fiiRendAReceber), c: C.yellow },
                        { l: '12M (RECEBIDO)', v: 'R$ ' + fmt(fiiRend12mRecebido), c: C.accent },
                        { l: 'YoC', v: fiiYoC.toFixed(2) + '%', c: C.fiis },
                        { l: 'DY', v: fiiDY.toFixed(2) + '%', c: C.acoes },
                        { l: 'YoC vs SELIC', v: (fiiYoC - selicRate).toFixed(1) + '%', c: fiiYoC >= selicRate ? C.green : C.red },
                      ].map(function(d, i) {
                        return (
                          <View key={i} style={{ alignItems: 'center', minWidth: 70 }}>
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Glass>

                  {/* Monthly vertical bar chart */}
                  {fiiMaxMonth > 0 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>RENDIMENTOS MENSAIS (12M)</Text>
                      <ProvMonthlyBarChart data={fiiLast12} maxVal={fiiMaxMonth} color={C.fiis} height={200}
                        selected={fiiMonthSel} onSelect={function(i) { setFiiMonthSel(i); }} />
                    </Glass>
                  )}

                  {/* Annual vertical bar chart */}
                  {fiiAnnualData.length >= 1 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>EVOLUÇÃO ANUAL</Text>
                      <AnnualBarChart data={fiiAnnualData} maxVal={fiiMaxYear} color={C.fiis} height={180}
                        selected={fiiYearSel} onSelect={function(i) { setFiiYearSel(i); }} />
                      {fiiAnnualData.length >= 2 && fiiYearSel === -1 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 6 }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                            {fiiAnnualData[fiiAnnualData.length - 2].month + ': R$ ' + fmt(fiiAnnualData[fiiAnnualData.length - 2].value)}
                          </Text>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{'>'}</Text>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                            {fiiAnnualData[fiiAnnualData.length - 1].month + ': R$ ' + fmt(fiiAnnualData[fiiAnnualData.length - 1].value)}
                          </Text>
                          {fiiAnnualData[fiiAnnualData.length - 2].value > 0 && (
                            <Text style={{ fontSize: 10, fontWeight: '600', color: fiiAnnualData[fiiAnnualData.length - 1].value >= fiiAnnualData[fiiAnnualData.length - 2].value ? C.green : C.red, fontFamily: F.mono }}>
                              {'(' + (((fiiAnnualData[fiiAnnualData.length - 1].value / fiiAnnualData[fiiAnnualData.length - 2].value) - 1) * 100).toFixed(0) + '%)'}
                            </Text>
                          )}
                        </View>
                      )}
                      {fiiYearSel >= 0 && fiiYearSel < fiiAnnualData.length && (
                        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                            {fiiAnnualData[fiiYearSel].month + ': R$ ' + fmt(fiiAnnualData[fiiYearSel].value)}
                          </Text>
                          {fiiYearSel > 0 && fiiAnnualData[fiiYearSel - 1].value > 0 ? (
                            <Text style={{ fontSize: 10, fontWeight: '600', color: fiiAnnualData[fiiYearSel].value >= fiiAnnualData[fiiYearSel - 1].value ? C.green : C.red, fontFamily: F.mono }}>
                              {'(' + (((fiiAnnualData[fiiYearSel].value / fiiAnnualData[fiiYearSel - 1].value) - 1) * 100).toFixed(0) + '% vs ' + fiiAnnualData[fiiYearSel - 1].month + ')'}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </Glass>
                  )}

                  {/* Ranking FIIs (12M) with YoC */}
                  {fiiAssetRanking.length > 0 && (
                    <Glass padding={14}>
                      <Text style={styles.sectionTitle}>RANKING FIIs (12M)</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, flex: 1 }}>ATIVO</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 80, textAlign: 'right' }}>TOTAL 12M</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 55, textAlign: 'right' }}>YoC</Text>
                      </View>
                      {fiiAssetRanking.filter(function(a) { return a.total12m > 0; }).map(function(a, idx) {
                        return (
                          <View key={a.ticker} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: idx < fiiAssetRanking.length - 1 ? 0.5 : 0, borderBottomColor: C.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 16 }}>{idx + 1 + '.'}</Text>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.fiis }} />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display }}>{a.ticker}</Text>
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono, width: 80, textAlign: 'right' }}>
                              {'R$ ' + fmt(a.total12m)}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: a.yoc >= selicRate ? C.green : a.yoc > 0 ? C.yellow : C.dim, fontFamily: F.mono, width: 55, textAlign: 'right' }}>
                              {a.yoc.toFixed(1) + '%'}
                            </Text>
                          </View>
                        );
                      })}
                      {fiiAssetRanking.filter(function(a) { return a.total12m === 0 && a.quantidade > 0; }).length > 0 && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 4 }}>SEM RENDIMENTOS 12M</Text>
                          <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body }}>
                            {fiiAssetRanking.filter(function(a) { return a.total12m === 0 && a.quantidade > 0; }).map(function(a) { return a.ticker; }).join(', ')}
                          </Text>
                        </View>
                      )}
                    </Glass>
                  )}

                  {/* Heatmap rendimentos FIIs */}
                  {fiiHmTickerList.length > 0 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>MAPA DE CALOR — SAZONALIDADE RENDIMENTOS</Text>
                      <DividendHeatmap tickers={fiiHmTickerList} months={hmMonths} data={fiiHmTickers} maxVal={fiiHmMaxVal} />
                    </Glass>
                  )}

                  {/* Current month rendimentos by corretora */}
                  {fiiMesAtual.length === 0 ? (
                    <EmptyState
                      icon={"\u25C9"}
                      title="Sem rendimentos"
                      description={"Sem rendimentos previstos para " + currentMonthLabel}
                      color={C.fiis}
                    />
                  ) : (
                    <>
                      {/* Header resumo mes */}
                      <Glass glow={C.green} padding={14}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5, textAlign: 'center', marginBottom: 6 }}>{currentMonthLabel}</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-around', gap: 12 }}>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>TOTAL MES</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: C.green, fontFamily: F.display, marginTop: 2 }}>
                              {'R$ ' + fmt(fiiTotalMesPago + fiiTotalMesPendente)}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>RECEBIDO</Text>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: C.green, fontFamily: F.mono, marginTop: 2 }}>
                              {'R$ ' + fmt(fiiTotalMesPago)}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>PENDENTE</Text>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: C.yellow, fontFamily: F.mono, marginTop: 2 }}>
                              {'R$ ' + fmt(fiiTotalMesPendente)}
                            </Text>
                          </View>
                        </View>
                      </Glass>

                      {/* Cards por corretora */}
                      {Object.keys(fiiCorretoraMap).sort().map(function(corretora) {
                        var corrData = fiiCorretoraMap[corretora];
                        var corrTotal = corrData.totalPago + corrData.totalPendente;
                        var sortedItems = corrData.items.slice().sort(function(a, b) {
                          return (a.dataPagamento || '').localeCompare(b.dataPagamento || '');
                        });
                        return (
                          <Glass key={corretora} padding={0}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 8 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>{corretora}</Text>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                                {'R$ ' + fmt(corrTotal)}
                              </Text>
                            </View>
                            {sortedItems.map(function(item, idx) {
                              var dataParts = (item.dataPagamento || '').split('-');
                              var dataLabel = dataParts.length >= 3 ? dataParts[2] + '/' + dataParts[1] : item.dataPagamento;
                              return (
                                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: F.body }}>{item.ticker}</Text>
                                    <Badge text="REND" color={C.fiis} />
                                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>{dataLabel}</Text>
                                  </View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>
                                      {'R$ ' + fmt(item.valorPorCota) + ' x ' + item.quantidade}
                                    </Text>
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                                      {'R$ ' + fmt(item.valorTotal)}
                                    </Text>
                                    <Badge text={item.isPago ? 'PAGO' : 'PENDENTE'} color={item.isPago ? C.green : C.yellow} />
                                  </View>
                                </View>
                              );
                            })}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'PAGO: R$ ' + fmt(corrData.totalPago)}</Text>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'PENDENTE: R$ ' + fmt(corrData.totalPendente)}</Text>
                            </View>
                          </Glass>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── RENDA FIXA ── */}
          {provSub === 'rf' && (
            <>
              {rendaFixa.length === 0 ? (
                <EmptyState icon={'\u25CB'} title="Sem renda fixa" description="Adicione aplicações de renda fixa para ver a renda estimada" color={C.rf} />
              ) : (
                <>
                  {/* KPI Cards */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>APLICADO</Text>
                        <Text style={[styles.kpiValue, { color: C.rf }]}>{'R$ ' + fmt(rfRendaTotal)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENDA/MÊS (EST.)</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>{'R$ ' + fmt(rfRendaMensalEst)}</Text>
                      </View>
                    </Glass>
                  </View>
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENDA/ANO (EST.)</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>{'R$ ' + fmt(rfRendaAnualEst)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TÍTULOS</Text>
                        <Text style={[styles.kpiValue, { color: C.rf }]}>{String(rendaFixa.length)}</Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Per-title breakdown */}
                  <SectionLabel>DETALHAMENTO</SectionLabel>
                  <Glass padding={0}>
                    {rendaFixa.map(function(rf, i) {
                      var rfTipo = rf.tipo || 'cdb';
                      var rfLabel = RF_TIPO_LABELS[rfTipo] || rfTipo.toUpperCase();
                      var rfValApl = parseFloat(rf.valor_aplicado) || 0;
                      var rfTaxaVal = parseFloat(rf.taxa) || 0;
                      var rfIdxLabel = rf.indexador === 'cdi' ? '% CDI' : rf.indexador === 'ipca' ? '+ IPCA' : rf.indexador === 'selic' ? '+ Selic' : '% a.a.';
                      var rfMensalEst = rfValApl * (Math.pow(1 + (rf.indexador === 'cdi' || rf.indexador === 'selic' ? (selicAnual - 0.10) * (rfTaxaVal / 100) : rf.indexador === 'ipca' ? rfTaxaVal + 4.5 : rfTaxaVal) / 100, 1 / 12) - 1);
                      return (
                        <View key={i} style={[styles.provRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>{rfLabel}</Text>
                              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{rf.emissor || ''}</Text>
                            </View>
                            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono, marginTop: 2 }}>
                              {rfTaxaVal.toFixed(1) + rfIdxLabel + ' · R$ ' + fmt(rfValApl)}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>{'R$ ' + fmt(rfMensalEst) + '/mês'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* IR removido — movido para Mais > Calculo IR (futura implementacao) */}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═══════════ STYLES ═══════════

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', gap: 5 },

  // Hero
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  heroPct: { fontSize: 18, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  heroPctSub: { fontSize: 11, fontFamily: F.mono, marginTop: 1 },

  // Period pills
  periodRow: { flexDirection: 'row', gap: 6 },
  periodPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  periodPillActive: { backgroundColor: C.accent + '20', borderColor: C.accent + '50' },
  periodPillInactive: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' },
  periodPillText: { fontSize: 11, fontWeight: '700', fontFamily: F.mono, letterSpacing: 0.5 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { alignItems: 'center', gap: 2 },
  kpiLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  kpiValue: { fontSize: 16, fontWeight: '800', fontFamily: F.display },
  kpiSub: { fontSize: 10, color: C.dim, fontFamily: F.mono },

  // Section
  sectionTitle: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6, marginBottom: 2 },

  // Benchmark legend
  benchLegend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  benchLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  benchLegendDot: { width: 12, height: 2, borderRadius: 1 },
  benchLegendLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono },
  benchLegendValue: { fontSize: 11, fontWeight: '600', fontFamily: F.mono },

  // Donut
  donutCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  donutValue: { fontSize: 13, fontWeight: '800', color: C.text, fontFamily: F.display },

  // Alloc
  allocRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  allocTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  allocBarBg: { width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  allocBarFill: { height: 4, borderRadius: 2 },
  allocPct: { fontSize: 12, fontWeight: '800', fontFamily: F.display, width: 36, textAlign: 'right' },

  // Proventos
  provFilterRow: { flexDirection: 'row', gap: 5 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  monthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  monthTotal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },
  provRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },

  // IR
  irSummaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  irSummaryItem: { alignItems: 'center', flex: 1 },
  irSummaryLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  irSummaryValue: { fontSize: 16, fontWeight: '800', fontFamily: F.display, marginTop: 2 },
  irMonthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  irMonthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  irRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  irRowLabel: { fontSize: 10, color: C.sub, fontFamily: F.body },
  irRowValue: { fontSize: 10, fontWeight: '600', fontFamily: F.mono, color: C.text },
  irDarfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: C.yellow + '08', borderBottomLeftRadius: SIZE.radius, borderBottomRightRadius: SIZE.radius },
  irDarfLabel: { fontSize: 10, fontWeight: '700', color: C.yellow, fontFamily: F.body },
  irDarfValue: { fontSize: 12, fontWeight: '800', color: C.yellow, fontFamily: F.mono },
  irAlert: { padding: 10, borderRadius: 8, backgroundColor: C.yellow + '10', borderWidth: 1, borderColor: C.yellow + '25' },
  irAlertText: { fontSize: 10, color: C.yellow, fontFamily: F.body, textAlign: 'center' },

  // Performance sub-tabs
  perfSubTabs: { flexDirection: 'row', gap: 5 },
  catHeroDivider: { height: 1, backgroundColor: C.border, marginVertical: 10 },

  // Ranking
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  rankIndex: { fontSize: 10, color: C.dim, fontFamily: F.mono, width: 16 },
  rankTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  rankBarBg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)', marginHorizontal: 8 },
  rankBarFill: { height: 4, borderRadius: 2 },
  rankPct: { fontSize: 12, fontWeight: '800', fontFamily: F.mono },
  rankVal: { fontSize: 11, color: C.sub, fontFamily: F.mono, marginTop: 1 },

  // Position cards
  posCard: { padding: 12 },
  posDetail: { fontSize: 11, color: C.dim, fontFamily: F.mono },

  // HBar
  hbarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  hbarLabel: { width: 60, fontSize: 10, color: C.sub, fontWeight: '600', fontFamily: F.mono },
  hbarTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  hbarFill: { height: 12, borderRadius: 6, borderWidth: 1, minWidth: 4 },
  hbarValue: { width: 55, fontSize: 10, fontWeight: '700', fontFamily: F.mono, textAlign: 'right' },
  plClassValue: { width: 80, fontSize: 10, fontWeight: '700', fontFamily: F.mono, textAlign: 'right' },

  // Rebalance
  rebalHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 6 },
  rebalColLabel: { flex: 1, fontSize: 10, color: C.dim, fontFamily: F.mono, textAlign: 'center' },
  rebalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rebalInput: { width: 36, height: 22, borderRadius: 4, borderWidth: 1, borderColor: C.accent + '40',
    backgroundColor: C.accent + '08', color: C.accent, fontSize: 11, fontFamily: F.mono,
    textAlign: 'center', paddingVertical: 0, paddingHorizontal: 4 },

  // Indicators table
  indTableHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: 'rgba(255,255,255,0.02)' },
  indTableCol: { flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, textAlign: 'center' },
  indTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10 },
  indTableTicker: { flex: 1, fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  indTableVal: { flex: 1, fontSize: 11, fontWeight: '600', fontFamily: F.mono, textAlign: 'center' },
  indDetailItem: { width: '31%', backgroundColor: C.surface, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: C.border },
  indDetailLabel: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  indDetailValue: { fontSize: 12, fontWeight: '700', fontFamily: F.display, marginTop: 2 },
});
