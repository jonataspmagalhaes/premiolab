import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, LayoutAnimation,
  Platform, UIManager, Modal, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import Svg, {
  Circle, Rect as SvgRect, G,
  Text as SvgText, Line as SvgLine, Path,
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
var CAT_NAMES_FULL = { acao: 'Acoes', fii: 'FIIs', etf: 'ETFs', rf: 'RF' };
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
  // Petroleo e Gas
  PETR4: { setor: 'Petroleo', segmento: 'Expl. e Refino' }, PETR3: { setor: 'Petroleo', segmento: 'Expl. e Refino' },
  PRIO3: { setor: 'Petroleo', segmento: 'Junior Oils' }, RECV3: { setor: 'Petroleo', segmento: 'Junior Oils' },
  RRRP3: { setor: 'Petroleo', segmento: 'Junior Oils' }, CSAN3: { setor: 'Petroleo', segmento: 'Distribuicao' },
  UGPA3: { setor: 'Petroleo', segmento: 'Distribuicao' }, VBBR3: { setor: 'Petroleo', segmento: 'Distribuicao' },
  RAIZ4: { setor: 'Petroleo', segmento: 'Distribuicao' },
  // Mineracao / Siderurgia
  VALE3: { setor: 'Mineracao', segmento: 'Mineracao' }, CMIN3: { setor: 'Mineracao', segmento: 'Mineracao' },
  CSNA3: { setor: 'Siderurgia', segmento: 'Siderurgia' }, GGBR4: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  USIM5: { setor: 'Siderurgia', segmento: 'Siderurgia' }, GOAU4: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  BRAP4: { setor: 'Mineracao', segmento: 'Holding' },
  // Energia
  ELET3: { setor: 'Energia', segmento: 'Geracao' }, ELET6: { setor: 'Energia', segmento: 'Geracao' },
  ENGI11: { setor: 'Energia', segmento: 'Geracao' }, CPFE3: { setor: 'Energia', segmento: 'Distribuicao' },
  TAEE11: { setor: 'Energia', segmento: 'Transmissao' }, CMIG4: { setor: 'Energia', segmento: 'Geracao' },
  CMIG3: { setor: 'Energia', segmento: 'Geracao' }, AURE3: { setor: 'Energia', segmento: 'Renovavel' },
  EGIE3: { setor: 'Energia', segmento: 'Geracao' }, CPLE6: { setor: 'Energia', segmento: 'Distribuicao' },
  CPLE3: { setor: 'Energia', segmento: 'Distribuicao' }, EQTL3: { setor: 'Energia', segmento: 'Transmissao' },
  ENEV3: { setor: 'Energia', segmento: 'Geracao' }, NEOE3: { setor: 'Energia', segmento: 'Distribuicao' },
  TRPL4: { setor: 'Energia', segmento: 'Transmissao' }, AESB3: { setor: 'Energia', segmento: 'Geracao' },
  // Consumo
  ABEV3: { setor: 'Consumo', segmento: 'Bebidas' }, JBSS3: { setor: 'Consumo', segmento: 'Frigorificos' },
  MRFG3: { setor: 'Consumo', segmento: 'Frigorificos' }, BRFS3: { setor: 'Consumo', segmento: 'Frigorificos' },
  NTCO3: { setor: 'Consumo', segmento: 'Cosmeticos' }, BEEF3: { setor: 'Consumo', segmento: 'Frigorificos' },
  MDIA3: { setor: 'Consumo', segmento: 'Alimentos' }, SMTO3: { setor: 'Consumo', segmento: 'Acucar' },
  SLCE3: { setor: 'Consumo', segmento: 'Agronegocio' },
  // Varejo
  MGLU3: { setor: 'Varejo', segmento: 'E-commerce' }, LREN3: { setor: 'Varejo', segmento: 'Moda' },
  ARZZ3: { setor: 'Varejo', segmento: 'Moda' }, PETZ3: { setor: 'Varejo', segmento: 'Especializado' },
  RENT3: { setor: 'Varejo', segmento: 'Locacao' }, ALPA4: { setor: 'Varejo', segmento: 'Moda' },
  ASAI3: { setor: 'Varejo', segmento: 'Supermercados' }, CRFB3: { setor: 'Varejo', segmento: 'Supermercados' },
  PCAR3: { setor: 'Varejo', segmento: 'Supermercados' }, VIVA3: { setor: 'Varejo', segmento: 'Joias' },
  MULT3: { setor: 'Varejo', segmento: 'Shoppings' }, MOVI3: { setor: 'Varejo', segmento: 'Locacao' },
  SOMA3: { setor: 'Varejo', segmento: 'Moda' }, IGTI11: { setor: 'Varejo', segmento: 'Shoppings' },
  // Saude
  HAPV3: { setor: 'Saude', segmento: 'Planos' }, RDOR3: { setor: 'Saude', segmento: 'Hospitais' },
  FLRY3: { setor: 'Saude', segmento: 'Diagnosticos' }, RADL3: { setor: 'Saude', segmento: 'Farmacias' },
  HYPE3: { setor: 'Saude', segmento: 'Farmaceutica' }, ONCO3: { setor: 'Saude', segmento: 'Hospitais' },
  // Tecnologia
  TOTS3: { setor: 'Tecnologia', segmento: 'Software' }, LWSA3: { setor: 'Tecnologia', segmento: 'Internet' },
  CASH3: { setor: 'Tecnologia', segmento: 'Fintech' }, PAGS3: { setor: 'Tecnologia', segmento: 'Pagamentos' },
  // Telecom
  VIVT3: { setor: 'Telecom', segmento: 'Telecom' }, TIMS3: { setor: 'Telecom', segmento: 'Telecom' },
  // Industria
  WEGE3: { setor: 'Industria', segmento: 'Motores' }, EMBR3: { setor: 'Industria', segmento: 'Aeronautica' },
  POMO4: { setor: 'Industria', segmento: 'Onibus' }, RAPT4: { setor: 'Industria', segmento: 'Autopecas' },
  TUPY3: { setor: 'Industria', segmento: 'Autopecas' }, DXCO3: { setor: 'Industria', segmento: 'Materiais' },
  GGPS3: { setor: 'Industria', segmento: 'Servicos' }, LEVE3: { setor: 'Industria', segmento: 'Autopecas' },
  // Papel e Celulose
  SUZB3: { setor: 'Papel/Celulose', segmento: 'Celulose' }, KLBN11: { setor: 'Papel/Celulose', segmento: 'Celulose' },
  // Transporte
  CCRO3: { setor: 'Transporte', segmento: 'Concessoes' }, AZUL4: { setor: 'Transporte', segmento: 'Aereo' },
  GOLL4: { setor: 'Transporte', segmento: 'Aereo' }, RAIL3: { setor: 'Transporte', segmento: 'Ferroviario' },
  STBP3: { setor: 'Transporte', segmento: 'Portos' }, ECOR3: { setor: 'Transporte', segmento: 'Concessoes' },
  // Construcao
  CYRE3: { setor: 'Construcao', segmento: 'Incorporacao' }, EZTC3: { setor: 'Construcao', segmento: 'Incorporacao' },
  MRVE3: { setor: 'Construcao', segmento: 'Incorporacao' }, TRIS3: { setor: 'Construcao', segmento: 'Incorporacao' },
  DIRR3: { setor: 'Construcao', segmento: 'Incorporacao' }, EVEN3: { setor: 'Construcao', segmento: 'Incorporacao' },
  // Saneamento
  SBSP3: { setor: 'Saneamento', segmento: 'Saneamento' }, SAPR11: { setor: 'Saneamento', segmento: 'Saneamento' },
  // FIIs — Tijolo (Logistica)
  HGLG11: { setor: 'Logistica', segmento: 'Galpoes' }, XPLG11: { setor: 'Logistica', segmento: 'Galpoes' },
  BTLG11: { setor: 'Logistica', segmento: 'Galpoes' }, GGRC11: { setor: 'Logistica', segmento: 'Galpoes' },
  LVBI11: { setor: 'Logistica', segmento: 'Galpoes' }, VILG11: { setor: 'Logistica', segmento: 'Galpoes' },
  BRCO11: { setor: 'Logistica', segmento: 'Galpoes' }, GALG11: { setor: 'Logistica', segmento: 'Galpoes' },
  // FIIs — Tijolo (Lajes/Shopping/Urbana)
  HGRE11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  BRCR11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, PVBI11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  VINO11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, RBRP11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  XPML11: { setor: 'Shopping', segmento: 'Shopping' }, VISC11: { setor: 'Shopping', segmento: 'Shopping' },
  HSML11: { setor: 'Shopping', segmento: 'Shopping' }, HGBS11: { setor: 'Shopping', segmento: 'Shopping' },
  TRXF11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, HGRU11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },
  // FIIs — Tijolo (Agro)
  XPCA11: { setor: 'Agro', segmento: 'Agro' }, KNCA11: { setor: 'Agro', segmento: 'Agro' },
  RZTR11: { setor: 'Agro', segmento: 'Agro' }, BTAL11: { setor: 'Agro', segmento: 'Agro' },
  RURA11: { setor: 'Agro', segmento: 'Agro' }, TGAR11: { setor: 'Agro', segmento: 'Agro' },
  // FIIs — Papel (CRI/Recebiveis)
  KNCR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, KNIP11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  MXRF11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, IRDM11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  RECR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, RBRR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  VGIR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, CPTS11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  VRTA11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, HABT11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  DEVA11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, AFHI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  SNCI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  // FIIs — Hibrido (Fundo de Fundos)
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
  'Logistica': 'Tijolo', 'Lajes Corp.': 'Tijolo', 'Shopping': 'Tijolo',
  'Agro': 'Tijolo', 'Renda Urbana': 'Tijolo',
  'Papel/CRI': 'Papel',
  'Fundo de Fundos': 'Hibrido',
};
var FII_SECTORS_SET = { 'Logistica': 1, 'Lajes Corp.': 1, 'Shopping': 1, 'Papel/CRI': 1, 'Agro': 1, 'Renda Urbana': 1, 'Fundo de Fundos': 1 };
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
    if (industry.indexOf('Mining') >= 0 || industry.indexOf('Gold') >= 0) return { setor: 'Mineracao', segmento: 'Mineracao' };
    if (industry.indexOf('Oil') >= 0 || industry.indexOf('Gas') >= 0) return { setor: 'Petroleo', segmento: 'Petroleo' };
    if (industry.indexOf('Pulp') >= 0 || industry.indexOf('Paper') >= 0 || industry.indexOf('Lumber') >= 0) return { setor: 'Papel/Celulose', segmento: 'Celulose' };
    if (industry.indexOf('Airlines') >= 0 || industry.indexOf('Airport') >= 0) return { setor: 'Transporte', segmento: 'Aereo' };
    if (industry.indexOf('Railroads') >= 0 || industry.indexOf('Trucking') >= 0) return { setor: 'Transporte', segmento: 'Ferroviario' };
    if (industry.indexOf('Marine') >= 0 || industry.indexOf('Shipping') >= 0) return { setor: 'Transporte', segmento: 'Portos' };
    if (industry.indexOf('Electric') >= 0 || industry.indexOf('Utilities') >= 0 || industry.indexOf('Renewable') >= 0 || industry.indexOf('Solar') >= 0) return { setor: 'Energia', segmento: 'Energia' };
    if (industry.indexOf('Water') >= 0) return { setor: 'Saneamento', segmento: 'Saneamento' };
    if (industry.indexOf('Bank') >= 0) return { setor: 'Financeiro', segmento: 'Bancos' };
    if (industry.indexOf('Insurance') >= 0) return { setor: 'Financeiro', segmento: 'Seguros' };
    if (industry.indexOf('Capital Markets') >= 0 || industry.indexOf('Financial Data') >= 0) return { setor: 'Financeiro', segmento: 'Investimentos' };
    if (industry.indexOf('Pharmaceutical') >= 0 || industry.indexOf('Drug') >= 0) return { setor: 'Saude', segmento: 'Farmaceutica' };
    if (industry.indexOf('Medical') >= 0 || industry.indexOf('Health') >= 0) return { setor: 'Saude', segmento: 'Saude' };
    if (industry.indexOf('Residential Construction') >= 0 || industry.indexOf('Real Estate') >= 0) return { setor: 'Construcao', segmento: 'Incorporacao' };
    if (industry.indexOf('Packaged Foods') >= 0 || industry.indexOf('Farm') >= 0 || industry.indexOf('Beverages') >= 0) return { setor: 'Consumo', segmento: 'Alimentos' };
    if (industry.indexOf('Meat') >= 0) return { setor: 'Consumo', segmento: 'Frigorificos' };
    if (industry.indexOf('Tobacco') >= 0 || industry.indexOf('Household') >= 0 || industry.indexOf('Personal') >= 0) return { setor: 'Consumo', segmento: 'Consumo' };
    if (industry.indexOf('Apparel') >= 0 || industry.indexOf('Luxury') >= 0 || industry.indexOf('Footwear') >= 0) return { setor: 'Varejo', segmento: 'Moda' };
    if (industry.indexOf('Grocery') >= 0 || industry.indexOf('Discount') >= 0 || industry.indexOf('Department') >= 0) return { setor: 'Varejo', segmento: 'Supermercados' };
    if (industry.indexOf('Retail') >= 0 || industry.indexOf('Specialty') >= 0) return { setor: 'Varejo', segmento: 'Varejo' };
    if (industry.indexOf('Rental') >= 0 || industry.indexOf('Leasing') >= 0) return { setor: 'Varejo', segmento: 'Locacao' };
    if (industry.indexOf('Telecom') >= 0) return { setor: 'Telecom', segmento: 'Telecom' };
    if (industry.indexOf('Software') >= 0 || industry.indexOf('Internet') >= 0 || industry.indexOf('Electronic') >= 0) return { setor: 'Tecnologia', segmento: 'Tecnologia' };
  }
  // Fallback by sector
  var SECTOR_MAP = {
    'Financial Services': { setor: 'Financeiro', segmento: 'Financeiro' },
    'Energy': { setor: 'Petroleo', segmento: 'Petroleo' },
    'Basic Materials': { setor: 'Mineracao', segmento: 'Materiais' },
    'Consumer Cyclical': { setor: 'Varejo', segmento: 'Varejo' },
    'Consumer Defensive': { setor: 'Consumo', segmento: 'Consumo' },
    'Healthcare': { setor: 'Saude', segmento: 'Saude' },
    'Technology': { setor: 'Tecnologia', segmento: 'Tecnologia' },
    'Communication Services': { setor: 'Telecom', segmento: 'Telecom' },
    'Utilities': { setor: 'Energia', segmento: 'Energia' },
    'Industrials': { setor: 'Industria', segmento: 'Industria' },
    'Real Estate': { setor: 'Construcao', segmento: 'Construcao' },
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

var OPC_STATUS_LABELS = { ativa: 'Ativa', exercida: 'Exercida', expirada: 'Expirada', fechada: 'Fechada', expirou_po: 'Expirou PO' };
var OPC_STATUS_COLORS = { ativa: C.accent, exercida: C.green, expirada: C.dim, fechada: C.yellow, expirou_po: C.green };

var RF_TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pre', debenture: 'Debenture',
};

var RF_IDX_LABELS = { prefixado: 'Prefixado', cdi: 'CDI', ipca: 'IPCA+', selic: 'Selic' };
var RF_IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.rf };

var RF_ISENTOS = { lci_lca: true, debenture: true };

var PROV_SUBS = [
  { k: 'visao', l: 'Visao Geral' },
  { k: 'proventos', l: 'Proventos' },
  { k: 'premios', l: 'Premios' },
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
      fiiSectors: { 'Tijolo': 30, 'Papel': 55, 'Hibrido': 15 },
    },
    moderado: {
      label: 'Moderado', emoji: '⚖️',
      desc: 'Equilibrio entre renda variavel e fixa. Diversificacao ampla.',
      classes: { acao: 30, fii: 25, etf: 20, rf: 25 },
      acaoCaps: { 'Large Cap': 45, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 5 },
      fiiSectors: { 'Tijolo': 45, 'Papel': 40, 'Hibrido': 15 },
    },
    arrojado: {
      label: 'Arrojado', emoji: '🚀',
      desc: 'Foco em acoes e ETFs para crescimento. Pouca renda fixa.',
      classes: { acao: 45, fii: 25, etf: 25, rf: 5 },
      acaoCaps: { 'Large Cap': 30, 'Mid Cap': 30, 'Small Cap': 25, 'Micro Cap': 15 },
      fiiSectors: { 'Tijolo': 55, 'Papel': 30, 'Hibrido': 15 },
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

  var totalComprar = 0;
  var totalManter = 0;
  tree.forEach(function (cls) {
    if (cls.ajuste > 50) totalComprar += cls.ajuste;
    else if (cls.ajuste < -50) totalManter += Math.abs(cls.ajuste);
  });

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
          <Text style={styles.sectionTitle}>REBALANCEAMENTO</Text>
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

      {/* ── SUMMARY CARD ── */}
      {(totalComprar > 0 || totalManter > 0) ? (
        <Glass padding={12}>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, marginBottom: 8 }}>RESUMO</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {totalComprar > 0 ? (
              <View style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: C.green + '08', borderWidth: 1, borderColor: C.green + '15' }}>
                <Text style={{ fontSize: 9, color: C.green, fontFamily: F.mono, letterSpacing: 0.3 }}>COMPRAR</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.green, fontFamily: F.display, marginTop: 2 }}>
                  R$ {fmtC(totalComprar)}
                </Text>
              </View>
            ) : null}
            {totalManter > 0 ? (
              <View style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: C.yellow + '08', borderWidth: 1, borderColor: C.yellow + '15' }}>
                <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono, letterSpacing: 0.3 }}>MANTER</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.yellow, fontFamily: F.display, marginTop: 2 }}>
                  R$ {fmtC(totalManter)}
                </Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>acima da meta</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: C.accent, opacity: 0.6 }} />
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Atual</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: C.accent, opacity: 0.15 }} />
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Meta</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 2, height: 8, borderRadius: 1, backgroundColor: C.accent, opacity: 0.9 }} />
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Alvo</Text>
            </View>
          </View>
        </Glass>
      ) : null}

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
                  Carteira ja esta alinhada com as metas!
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
    </View>
  );
}

// ═══════════ INLINE SVG: Proventos Bar Chart ═══════════

function ProvVertBarChart(props) {
  var data = props.data || [];
  var maxVal = props.maxVal || 1;
  var color = props.color || C.fiis;
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
        {/* Bars */}
        {data.map(function(d, i) {
          var bx = offsetX + i * (barW + barGap);
          var bh = maxVal > 0 ? (d.value / maxVal) * chartH : 0;
          bh = Math.max(bh, 1);
          var by = padTop + chartH - bh;
          var barColor = d.color || color;
          return (
            <G key={i}>
              <SvgRect x={bx} y={by} width={barW} height={bh}
                rx={3} fill={barColor} opacity={0.7} />
              {/* Value on top */}
              {d.value > 0 && (
                <SvgText x={bx + barW / 2} y={by - 4} fill={C.green}
                  fontSize={7} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                  {d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : fmt(d.value)}
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
    </View>
  );
}

// ═══════════ INLINE SVG: Premios Vertical Bar Chart ═══════════

function PremiosBarChart(props) {
  var data = props.data || [];
  var showCall = props.showCall;
  var showPut = props.showPut;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect || function() {};

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

              // Build tooltip lines
              var tipLines = [];
              if (isSelected) {
                tipLines.push({ label: 'Total', value: d.total || 0, color: C.text });
                if (showCall) tipLines.push({ label: 'C', value: d.call || 0, color: C.acoes });
                if (showPut) tipLines.push({ label: 'P', value: d.put || 0, color: C.green });
              }

              // Tooltip height
              var tipH = tipLines.length > 1 ? 12 * tipLines.length + 4 : 16;
              var tipW = 72;
              var tipY = totalB.y - tipH - 4;
              if (tipY < 0) tipY = 0;

              return (
                <G key={'b' + i}>
                  {/* Total bar (background) */}
                  <SvgRect x={barX} y={totalB.y} width={totalBarW} height={totalB.h}
                    rx={3} fill={C.opcoes} opacity={totalOpacity} />

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
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Premios</Text>
        </View>
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
  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _operacoes = useState([]); var operacoes = _operacoes[0]; var setOperacoes = _operacoes[1];
  var _profile = useState(null); var profile = _profile[0]; var setProfile = _profile[1];
  var _perfPeriod = useState('Tudo'); var perfPeriod = _perfPeriod[0]; var setPerfPeriod = _perfPeriod[1];
  var _provFilter = useState('todos'); var provFilter = _provFilter[0]; var setProvFilter = _provFilter[1];
  var _chartTouching = useState(false); var chartTouching = _chartTouching[0]; var setChartTouching = _chartTouching[1];
  var _perfSub = useState('todos'); var perfSub = _perfSub[0]; var setPerfSub = _perfSub[1];
  var _rendaFixa = useState([]); var rendaFixa = _rendaFixa[0]; var setRendaFixa = _rendaFixa[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _opcShowCall = useState(false); var opcShowCall = _opcShowCall[0]; var setOpcShowCall = _opcShowCall[1];
  var _opcShowPut = useState(false); var opcShowPut = _opcShowPut[0]; var setOpcShowPut = _opcShowPut[1];
  var _opcPremSelected = useState(-1); var opcPremSelected = _opcPremSelected[0]; var setOpcPremSelected = _opcPremSelected[1];
  var _indicators = useState([]); var indicators = _indicators[0]; var setIndicators = _indicators[1];
  var _searchTicker = useState(''); var searchTicker = _searchTicker[0]; var setSearchTicker = _searchTicker[1];
  var _searchLoading = useState(false); var searchLoading = _searchLoading[0]; var setSearchLoading = _searchLoading[1];
  var _treemapModal = useState(false); var treemapModalVisible = _treemapModal[0]; var setTreemapModal = _treemapModal[1];
  var _selectedTile = useState(null); var selectedTile = _selectedTile[0]; var setSelectedTile = _selectedTile[1];
  var _allocView = useState('aloc'); var allocView = _allocView[0]; var setAllocView = _allocView[1];
  var _sankeyFilter = useState('setor'); var sankeyFilter = _sankeyFilter[0]; var setSankeyFilter = _sankeyFilter[1];
  var _sankeyTooltip = useState(null); var sankeyTooltip = _sankeyTooltip[0]; var setSankeyTooltip = _sankeyTooltip[1];
  var _searchResult = useState(null); var searchResult = _searchResult[0]; var setSearchResult = _searchResult[1];
  var _searchError = useState(''); var searchError = _searchError[0]; var setSearchError = _searchError[1];
  var _provSub = useState('visao'); var provSub = _provSub[0]; var setProvSub = _provSub[1];
  var _savedRebalTargets = useState(null); var savedRebalTargets = _savedRebalTargets[0]; var setSavedRebalTargets = _savedRebalTargets[1];

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

  // ── Derived: Category Performance (Acao/FII/ETF) ──
  var catPositions = [];
  var catTotalInvested = 0;
  var catCurrentValue = 0;
  var catPL = 0;
  var catRentPct = 0;
  var catPctCDI = 0;
  var catDividendsTotal = 0;
  var catDividends12m = 0;
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

    // Dividends: total, 12m, per ticker, monthly
    var oneYrAgo = new Date();
    oneYrAgo.setFullYear(oneYrAgo.getFullYear() - 1);
    var catTickerSet = {};
    for (var ct = 0; ct < catPositions.length; ct++) {
      catTickerSet[catPositions[ct].ticker] = true;
    }
    var catProvByMonth = {};
    var catProvByTicker = {};
    for (var cdp = 0; cdp < proventos.length; cdp++) {
      var prov = proventos[cdp];
      if (!catTickerSet[prov.ticker]) continue;
      var provVal = prov.valor_total || 0;
      catDividendsTotal += provVal;
      var provDate = new Date(prov.data_pagamento);
      if (provDate >= oneYrAgo) catDividends12m += provVal;
      var pmKey = provDate.getFullYear() + '-' + String(provDate.getMonth() + 1).padStart(2, '0');
      if (!catProvByMonth[pmKey]) catProvByMonth[pmKey] = 0;
      catProvByMonth[pmKey] += provVal;
      if (!catProvByTicker[prov.ticker]) catProvByTicker[prov.ticker] = { total: 0, last12m: 0 };
      catProvByTicker[prov.ticker].total += provVal;
      if (provDate >= oneYrAgo) catProvByTicker[prov.ticker].last12m += provVal;
    }
    catYieldOnCost = catTotalInvested > 0 ? (catDividends12m / catTotalInvested * 100) : 0;
    catRetornoTotal = catPL + catDividendsTotal;
    catRetornoTotalPct = catTotalInvested > 0 ? (catRetornoTotal / catTotalInvested * 100) : 0;

    // Monthly dividends: last 12 months for chart
    var nowCat = new Date();
    for (var cmi = 11; cmi >= 0; cmi--) {
      var cmd = new Date(nowCat.getFullYear(), nowCat.getMonth() - cmi, 1);
      var cmk = cmd.getFullYear() + '-' + String(cmd.getMonth() + 1).padStart(2, '0');
      var cml = MONTH_LABELS[cmd.getMonth() + 1] + '/' + String(cmd.getFullYear()).substring(2);
      catMonthlyDividends.push({ month: cml, value: catProvByMonth[cmk] || 0 });
    }

    // Renda mensal media (ultimos 3 meses)
    var last3sum = 0;
    var last3count = 0;
    for (var l3 = Math.max(catMonthlyDividends.length - 3, 0); l3 < catMonthlyDividends.length; l3++) {
      last3sum += catMonthlyDividends[l3].value;
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

    for (var oi = 0; oi < opcoes.length; oi++) {
      var op = opcoes[oi];
      var premioTotal = (op.premio || 0) * (op.quantidade || 0);
      var status = op.status || 'ativa';

      if (!opcByStatus[status]) opcByStatus[status] = { count: 0, premio: 0 };
      opcByStatus[status].count += 1;
      opcByStatus[status].premio += premioTotal;

      var direcao = op.direcao || 'venda';
      var isVenda = direcao === 'venda' || direcao === 'lancamento';

      if (isVenda) {
        opcTotalPremiosRecebidos += premioTotal;
      }

      var tipo = op.tipo || 'call';
      opcByTipo[tipo].count += 1;
      opcByTipo[tipo].premio += premioTotal;

      var base2 = op.ativo_base || 'N/A';
      if (!opcByBase[base2]) opcByBase[base2] = { count: 0, premioRecebido: 0, pl: 0 };
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
          if (!opcPremByMonth[opMonth]) opcPremByMonth[opMonth] = { total: 0, call: 0, put: 0 };
          opcPremByMonth[opMonth].total += premioTotal;
          opcPremByMonth[opMonth][tipo] += premioTotal;
        }
      }

      if (status === 'ativa') {
        opcAtivas.push(op);
        if (isVenda) {
          opcByBase[base2].premioRecebido += premioTotal;
          opcByBase[base2].pl += premioTotal;
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
          opcByBase[base2].premioRecebido += premioTotal;
          opcByBase[base2].pl += plOp;
          if (plOp >= 0) opcWins++; else opcLosses++;
        }
      }
    }
    opcProxVenc.sort(function(a, b) { return a.daysLeft - b.daysLeft; });

    // Win rate
    var opcTotalEncerradasVenda = opcWins + opcLosses;
    opcWinRate = opcTotalEncerradasVenda > 0 ? (opcWins / opcTotalEncerradasVenda * 100) : 0;

    // Taxa exercicio / expirou PO
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
      var omData = opcPremByMonth[omk] || { total: 0, call: 0, put: 0 };
      opcMonthlyPremiums.push({ month: oml, total: omData.total, call: omData.call, put: omData.put });
    }
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

  // Bar chart data: last 12 months (vertical)
  var last12 = [];
  for (var mi = 11; mi >= 0; mi--) {
    var md = new Date(now.getFullYear(), now.getMonth() - mi, 1);
    var mKey = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    var mLabel = MONTH_LABELS[md.getMonth() + 1];
    var mTotal = 0;
    filteredProventos.forEach(function(p) {
      var pk = (p.data_pagamento || '').substring(0, 7);
      if (pk === mKey) mTotal += (p.valor_total || 0);
    });
    last12.push({ month: mLabel, value: mTotal });
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

  // Premios by year
  var premByYear = {};
  for (var pyi = 0; pyi < opcoes.length; pyi++) {
    var pyiOp = opcoes[pyi];
    var pyiDir = pyiOp.direcao || 'venda';
    var pyiVenda = pyiDir === 'venda' || pyiDir === 'lancamento';
    if (pyiVenda) {
      var pyiDate = pyiOp.data_abertura || pyiOp.created_at || pyiOp.vencimento || '';
      var pyiYear = pyiDate.substring(0, 4);
      if (pyiYear) {
        if (!premByYear[pyiYear]) premByYear[pyiYear] = 0;
        premByYear[pyiYear] += (pyiOp.premio || 0) * (pyiOp.quantidade || 0);
      }
    }
  }
  var premAnnualData = [];
  var premAnnualYears = Object.keys(premByYear).sort();
  for (var pay = 0; pay < premAnnualYears.length; pay++) {
    premAnnualData.push({ month: premAnnualYears[pay], value: premByYear[premAnnualYears[pay]] });
  }
  var maxPremYear = premAnnualData.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // Premios asset ranking (sorted by premio received)
  var premAssetRanking = [];
  var opcBaseKeys = Object.keys(opcByBase);
  for (var par = 0; par < opcBaseKeys.length; par++) {
    var parKey = opcBaseKeys[par];
    var parData = opcByBase[parKey];
    premAssetRanking.push({ ticker: parKey, count: parData.count, premio: parData.premioRecebido, pl: parData.pl });
  }
  premAssetRanking.sort(function(a, b) { return b.premio - a.premio; });

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

  // ── Derived: Visao Geral (combinado) ──
  var rendaPassivaTotal = totalProvs + opcTotalPremiosRecebidos;
  var rendaPassiva12m = proventos12m + premios12mOpc;
  var rendaPassivaMediaMensal = rendaPassiva12m / 12;
  var rendaPassivaYoC = totalCusto > 0 ? (rendaPassiva12m / totalCusto) * 100 : 0;

  // Combined monthly: last 12 months with prov + prem
  var combinedMonthly = [];
  for (var cmi = 11; cmi >= 0; cmi--) {
    var cmd = new Date(now.getFullYear(), now.getMonth() - cmi, 1);
    var cmk = cmd.getFullYear() + '-' + String(cmd.getMonth() + 1).padStart(2, '0');
    var cmLabel = MONTH_LABELS[cmd.getMonth() + 1];
    var cmProv = 0;
    filteredProventos.forEach(function(p) {
      var pk = (p.data_pagamento || '').substring(0, 7);
      if (pk === cmk) cmProv += (p.valor_total || 0);
    });
    var cmPrem = 0;
    for (var cpj = 0; cpj < opcoes.length; cpj++) {
      var cpOp = opcoes[cpj];
      var cpDir = cpOp.direcao || 'venda';
      var cpVenda = cpDir === 'venda' || cpDir === 'lancamento';
      if (cpVenda) {
        var cpDate = cpOp.data_abertura || cpOp.created_at || cpOp.vencimento || '';
        if (cpDate) {
          var cpD = new Date(cpDate);
          cpD.setDate(cpD.getDate() + 1);
          var cpMk = cpD.getFullYear() + '-' + String(cpD.getMonth() + 1).padStart(2, '0');
          if (cpMk === cmk) cmPrem += (cpOp.premio || 0) * (cpOp.quantidade || 0);
        }
      }
    }
    combinedMonthly.push({ month: cmLabel, provValue: cmProv, premValue: cmPrem, total: cmProv + cmPrem });
  }
  var maxCombinedMonth = combinedMonthly.reduce(function(m, d) { return Math.max(m, d.total); }, 1);

  // Combined annual
  var combinedAnnualMap = {};
  // Add proventos by year
  for (var cay = 0; cay < annualYears.length; cay++) {
    var cayK = annualYears[cay];
    if (!combinedAnnualMap[cayK]) combinedAnnualMap[cayK] = { prov: 0, prem: 0 };
    combinedAnnualMap[cayK].prov = provsByYear[cayK] || 0;
  }
  // Add premios by year
  for (var cpay = 0; cpay < premAnnualYears.length; cpay++) {
    var cpayK = premAnnualYears[cpay];
    if (!combinedAnnualMap[cpayK]) combinedAnnualMap[cpayK] = { prov: 0, prem: 0 };
    combinedAnnualMap[cpayK].prem = premByYear[cpayK] || 0;
  }
  var combinedAnnualKeys = Object.keys(combinedAnnualMap).sort();
  var combinedAnnualData = [];
  for (var cak = 0; cak < combinedAnnualKeys.length; cak++) {
    var cakKey = combinedAnnualKeys[cak];
    var cakVal = combinedAnnualMap[cakKey];
    combinedAnnualData.push({ month: cakKey, provValue: cakVal.prov, premValue: cakVal.prem, total: cakVal.prov + cakVal.prem });
  }
  var maxCombinedYear = combinedAnnualData.reduce(function(m, d) { return Math.max(m, d.total); }, 1);

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
          { k: 'aloc', l: 'Aloc / Comp' },
          { k: 'prov', l: 'Prov/Prem' },
          { k: 'ind', l: 'Indicadores' },
          { k: 'ir', l: 'IR' },
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
                  onPress={function() { setPerfSub(ps.k); }}>
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
                    <Text style={styles.heroLabel}>PATRIMONIO TOTAL</Text>
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

              {/* Chart */}
              {filteredHistory.length >= 2 ? (
                <Glass padding={12}>
                  <InteractiveChart
                    data={filteredHistory}
                    color={C.accent}
                    height={140}
                    showGrid={true}
                    fontFamily={F.mono}
                    label="Patrimonio"
                    onTouchStateChange={function(touching) { setChartTouching(touching); }}
                  />
                </Glass>
              ) : (
                <Glass padding={20}>
                  <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                    Adicione operacoes para ver o grafico de patrimonio
                  </Text>
                </Glass>
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
                        <Text style={[styles.kpiValue, { color: C.red }]}>
                          {worstMonth.pct.toFixed(1)}%
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

              {/* Benchmark: Carteira vs CDI */}
              {portBenchData.length >= 2 && (
                <>
                  <SectionLabel>BENCHMARK</SectionLabel>
                  <Glass padding={12}>
                    <BenchmarkChart portData={portBenchData} cdiData={cdiBenchData} />
                  </Glass>
                </>
              )}

              {/* Rentabilidade por ativo */}
              {sortedByPnl.length > 0 && (
                <>
                  <SectionLabel>RENTABILIDADE POR ATIVO</SectionLabel>
                  <Glass padding={14}>
                    {sortedByPnl.map(function (a, i) {
                      return <HBar key={i} label={a.ticker} value={a.pnlPct} maxValue={maxAbsPnl}
                        color={a.pnlPct >= 0 ? C.green : C.red} suffix="%" />;
                    })}
                  </Glass>
                </>
              )}
            </>
          )}

          {/* ── ACAO / FII / ETF ── */}
          {(perfSub === 'acao' || perfSub === 'fii' || perfSub === 'etf') && (
            <>
              {catPositions.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title={'Sem ' + (CAT_LABELS[perfSub] || perfSub)}
                  description={'Adicione operacoes de ' + (CAT_LABELS[perfSub] || perfSub) + ' para ver a performance'}
                  color={PERF_SUB_COLORS[perfSub]}
                />
              ) : (
                <>
                  {/* Hero Card */}
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
                        <Text style={styles.kpiLabel}>POSICOES</Text>
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

                  {/* Stats Row 2: Proventos */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PROVENTOS TOTAL</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          R$ {fmt(catDividendsTotal)}
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>{perfSub === 'fii' ? 'DY 12M' : 'YIELD ON COST'}</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {catYieldOnCost.toFixed(2)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENDA/MES</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          R$ {fmt(catRendaMensal)}
                        </Text>
                      </View>
                    </Glass>
                  </View>

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
                      <Glass padding={10} style={{ flex: 1 }}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>TAXA ACERTO</Text>
                          <Text style={[styles.kpiValue, { color: C.green }]}>
                            {((catMesesPositivos / (catMesesPositivos + catMesesNegativos)) * 100).toFixed(0)}%
                          </Text>
                        </View>
                      </Glass>
                    </View>
                  )}

                  {/* Proventos mensais chart (FII focus) */}
                  {catDividendsTotal > 0 && (
                    <>
                      <SectionLabel>{perfSub === 'fii' ? 'RENDIMENTOS MENSAIS' : 'PROVENTOS MENSAIS'}</SectionLabel>
                      <Glass padding={12}>
                        <ProvVertBarChart data={catMonthlyDividends} maxVal={catMonthlyDividends.reduce(function(m, d) { return Math.max(m, d.value); }, 1)} color={C.fiis} height={140} />
                      </Glass>
                    </>
                  )}

                  {/* Position Ranking */}
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
                        <Text style={styles.heroLabel}>PREMIOS RECEBIDOS</Text>
                        <Text style={styles.heroValue}>R$ {fmt(opcTotalPremiosRecebidos)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.heroLabel}>P&L ENCERRADAS</Text>
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
                        <Text style={styles.kpiLabel}>WIN RATE</Text>
                        <Text style={[styles.kpiValue, { color: opcWinRate >= 70 ? C.green : (opcWinRate >= 50 ? C.yellow : C.red) }]}>
                          {opcWinRate.toFixed(0)}%
                        </Text>
                        <Text style={styles.kpiSub}>{String(opcWins) + 'W / ' + String(opcLosses) + 'L'}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TAXA MEDIA a.m.</Text>
                        <Text style={[styles.kpiValue, { color: C.opcoes }]}>
                          {opcTaxaMediaMensal.toFixed(2)}%
                        </Text>
                        <Text style={styles.kpiSub}>{(opcTaxaMediaMensal * 12).toFixed(1) + '% a.a.'}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PREMIUM YIELD</Text>
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
                        <Text style={styles.kpiLabel}>CALL</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {String(opcByTipo.call.count)}
                        </Text>
                        <Text style={styles.kpiSub}>R$ {fmt(opcByTipo.call.premio)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PUT</Text>
                        <Text style={[styles.kpiValue, { color: C.red }]}>
                          {String(opcByTipo.put.count)}
                        </Text>
                        <Text style={styles.kpiSub}>R$ {fmt(opcByTipo.put.premio)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>CUSTO FECH.</Text>
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
                        <Text style={styles.kpiLabel}>EXPIROU PO</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {opcTaxaExpirouPO.toFixed(0)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>EXERCIDA</Text>
                        <Text style={[styles.kpiValue, { color: C.yellow }]}>
                          {opcTaxaExercicio.toFixed(0)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>FECHADA</Text>
                        <Text style={[styles.kpiValue, { color: C.sub }]}>
                          {opcEncerradas.length > 0 ? (((opcByStatus.fechada && opcByStatus.fechada.count || 0) / opcEncerradas.length * 100).toFixed(0)) : '0'}%
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Historico mensal de premios */}
                  {opcMonthlyPremiums.length > 0 && (function() {
                    var sum12 = opcMonthlyPremiums.reduce(function(s, d) { return s + (d.total || 0); }, 0);
                    var sumCall = opcMonthlyPremiums.reduce(function(s, d) { return s + (d.call || 0); }, 0);
                    var sumPut = opcMonthlyPremiums.reduce(function(s, d) { return s + (d.put || 0); }, 0);
                    return (
                      <>
                        <SectionLabel>PREMIOS MENSAIS</SectionLabel>
                        <Glass padding={12}>
                          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                            <Pill active={opcShowCall}
                              color={C.acoes}
                              onPress={function() { setOpcShowCall(!opcShowCall); setOpcPremSelected(-1); }}>Call</Pill>
                            <Pill active={opcShowPut}
                              color={C.green}
                              onPress={function() { setOpcShowPut(!opcShowPut); setOpcPremSelected(-1); }}>Put</Pill>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.text }}>
                              {'R$ ' + fmt(sum12)}
                              <Text style={{ fontSize: 10, color: C.sub }}>{' 12m'}</Text>
                            </Text>
                            {opcShowCall ? (
                              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.acoes }}>
                                {'C R$ ' + fmt(sumCall)}
                              </Text>
                            ) : null}
                            {opcShowPut ? (
                              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.green }}>
                                {'P R$ ' + fmt(sumPut)}
                              </Text>
                            ) : null}
                          </View>
                          <PremiosBarChart
                            data={opcMonthlyPremiums}
                            showCall={opcShowCall}
                            showPut={opcShowPut}
                            selected={opcPremSelected}
                            onSelect={setOpcPremSelected}
                          />
                        </Glass>
                      </>
                    );
                  })()}

                  {/* Por Ativo Base */}
                  <SectionLabel>POR ATIVO BASE</SectionLabel>
                  <Glass padding={0}>
                    {(function() {
                      var bases = Object.keys(opcByBase).sort(function(a, b) {
                        return opcByBase[b].premioRecebido - opcByBase[a].premioRecebido;
                      });
                      var maxPremio = 1;
                      for (var bm = 0; bm < bases.length; bm++) {
                        if (opcByBase[bases[bm]].premioRecebido > maxPremio) {
                          maxPremio = opcByBase[bases[bm]].premioRecebido;
                        }
                      }
                      return bases.map(function(base, i) {
                        var bd = opcByBase[base];
                        var barW = Math.min(bd.premioRecebido / maxPremio * 100, 100);
                        return (
                          <View key={base} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <Text style={styles.rankTicker}>{base}</Text>
                              <View style={styles.rankBarBg}>
                                <View style={[styles.rankBarFill, { width: barW + '%', backgroundColor: C.opcoes }]} />
                              </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.rankPct, { color: C.opcoes }]}>R$ {fmt(bd.premioRecebido)}</Text>
                              <Text style={[styles.rankVal, { color: bd.pl >= 0 ? C.green : C.red }]}>
                                P&L {bd.pl >= 0 ? '+' : ''}R$ {fmt(Math.abs(bd.pl))}
                              </Text>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </Glass>

                  {/* Por Status */}
                  <SectionLabel>POR STATUS</SectionLabel>
                  <Glass padding={0}>
                    {Object.keys(opcByStatus).map(function(status, i) {
                      var sd = opcByStatus[status];
                      var pct = opcoes.length > 0 ? (sd.count / opcoes.length * 100) : 0;
                      var sColor = OPC_STATUS_COLORS[status] || C.dim;
                      return (
                        <View key={status} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Badge text={OPC_STATUS_LABELS[status] || status} color={sColor} />
                            <View style={styles.rankBarBg}>
                              <View style={[styles.rankBarFill, { width: pct + '%', backgroundColor: sColor }]} />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.rankPct, { color: sColor }]}>{String(sd.count)}</Text>
                            <Text style={styles.rankVal}>R$ {fmt(sd.premio)}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>

                  {/* Proximos Vencimentos */}
                  {opcProxVenc.length > 0 && (
                    <>
                      <SectionLabel>VENCEM EM 30 DIAS</SectionLabel>
                      <Glass padding={0}>
                        {opcProxVenc.map(function(item, i) {
                          var o = item.op;
                          var premioOp = (o.premio || 0) * (o.quantidade || 0);
                          var urgColor = item.daysLeft < 7 ? C.red : (item.daysLeft < 15 ? C.yellow : C.opcoes);
                          return (
                            <View key={o.id || i} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={styles.rankTicker}>{o.ticker_opcao || o.ativo_base}</Text>
                                  <Badge text={(o.tipo || 'CALL').toUpperCase()} color={o.tipo === 'put' ? C.red : C.green} />
                                  <Badge text={item.daysLeft + 'd'} color={urgColor} />
                                </View>
                                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>
                                  {o.ativo_base + ' | Strike R$ ' + fmt(o.strike || 0)}
                                </Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.rankPct, { color: C.opcoes }]}>R$ {fmt(premioOp)}</Text>
                                <Text style={styles.rankVal}>{(o.direcao || 'venda') === 'compra' ? 'Compra' : 'Venda'}</Text>
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

      {/* ═══════════ ALOCACAO / COMPOSICAO ═══════════ */}
      {sub === 'aloc' && (
        <>
          {/* Segmented control: Alocacao / Composicao */}
          <View style={{ flexDirection: 'row', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', padding: 3 }}>
            <TouchableOpacity
              onPress={function () { setAllocView('aloc'); setSankeyTooltip(null); }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                backgroundColor: allocView === 'aloc' ? C.accent + '20' : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: allocView === 'aloc' ? '700' : '500',
                color: allocView === 'aloc' ? C.accent : C.sub, fontFamily: F.body }}>Alocacao</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={function () { setAllocView('comp'); }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                backgroundColor: allocView === 'comp' ? C.accent + '20' : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: allocView === 'comp' ? '700' : '500',
                color: allocView === 'comp' ? C.accent : C.sub, fontFamily: F.body }}>Composicao</Text>
            </TouchableOpacity>
          </View>

          {positions.length === 0 ? (
            <EmptyState
              icon={"\u25EB"}
              title="Sem ativos"
              description="Adicione operacoes para ver a alocacao da carteira"
              color={C.accent}
            />
          ) : (
            <>
              {/* ── VIEW: ALOCACAO ── */}
              {allocView === 'aloc' ? (
                <>
                  {/* Donut — Alocacao por Classe */}
                  {allocSegments.length > 0 ? (
                    <Glass padding={14}>
                      <Text style={styles.sectionTitle}>ALOCACAO POR CLASSE</Text>
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
                        <Text style={styles.sectionTitle}>TREEMAP</Text>
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
              ) : null}

              {/* ── VIEW: COMPOSICAO (Two-Level Donut) ── */}
              {allocView === 'comp' ? (
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
                    <Text style={styles.sectionTitle}>COMPOSICAO DA CARTEIRA</Text>
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
              ) : null}
            </>
          )}
        </>
      )}

      {/* Treemap Fullscreen Modal */}
      <Modal visible={treemapModalVisible} animationType="fade" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <View style={{ paddingTop: 50, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display, letterSpacing: 0.6 }}>
              TREEMAP — EXPOSICAO
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
                <Text style={styles.sectionTitle}>COMPOSICAO DA RENDA</Text>
                {rendaPassivaTotal > 0 ? (
                  <>
                    <View style={{ height: 20, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', marginTop: 8 }}>
                      <View style={{ width: (totalProvs / rendaPassivaTotal * 100) + '%', height: 20, backgroundColor: C.fiis }} />
                      <View style={{ width: (opcTotalPremiosRecebidos / rendaPassivaTotal * 100) + '%', height: 20, backgroundColor: C.opcoes }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.fiis }} />
                        <Text style={{ fontSize: 11, color: C.text, fontFamily: F.body }}>Proventos</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: C.fiis, fontFamily: F.mono }}>
                          {(totalProvs / rendaPassivaTotal * 100).toFixed(0) + '%'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                        {'R$ ' + fmt(totalProvs)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.opcoes }} />
                        <Text style={{ fontSize: 11, color: C.text, fontFamily: F.body }}>Premios</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: C.opcoes, fontFamily: F.mono }}>
                          {(opcTotalPremiosRecebidos / rendaPassivaTotal * 100).toFixed(0) + '%'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                        {'R$ ' + fmt(opcTotalPremiosRecebidos)}
                      </Text>
                    </View>
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

              {/* Combined monthly chart */}
              {maxCombinedMonth > 1 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>RENDA MENSAL (12M)</Text>
                  <CombinedBarChart data={combinedMonthly} maxVal={maxCombinedMonth} height={180} />
                </Glass>
              )}

              {/* Combined annual chart */}
              {combinedAnnualData.length >= 1 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>EVOLUCAO ANUAL</Text>
                  <CombinedBarChart data={combinedAnnualData} maxVal={maxCombinedYear} height={160} />
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
                    { l: 'TOTAL RECEBIDO', v: 'R$ ' + fmt(totalProvs), c: C.green },
                    { l: 'YoC 12M', v: yieldOnCost.toFixed(2) + '%', c: C.fiis },
                    { l: 'MEDIA/MES', v: 'R$ ' + fmt(mediaMensal), c: C.accent },
                    { l: 'YoC vs SELIC', v: (yieldOnCost - selicRate).toFixed(1) + '%', c: yieldOnCost >= selicRate ? C.green : C.red },
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

              {/* Meta mensal progress */}
              {metaMensal > 0 && (
                <Glass padding={14}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>META MENSAL</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: metaPct >= 100 ? C.green : C.yellow, fontFamily: F.mono }}>
                      {'R$ ' + fmt(mediaMensal) + ' / R$ ' + fmt(metaMensal) + ' (' + metaPct.toFixed(0) + '%)'}
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ width: metaPct + '%', height: 8, backgroundColor: metaPct >= 100 ? C.green : C.yellow, borderRadius: 4 }} />
                  </View>
                </Glass>
              )}

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
                  <ProvVertBarChart data={last12} maxVal={maxProvMonth} color={C.fiis} height={180} />
                </Glass>
              )}

              {/* Annual vertical bar chart */}
              {annualData.length >= 1 && (
                <Glass padding={12}>
                  <Text style={styles.sectionTitle}>EVOLUCAO ANUAL</Text>
                  <ProvVertBarChart data={annualData} maxVal={maxProvYear} color={C.accent} height={160} />
                  {annualData.length >= 2 && (
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
                </Glass>
              )}

              {/* Breakdown by tipo */}
              {Object.keys(provsByTipo).length > 0 && (
                <Glass padding={14}>
                  <Text style={styles.sectionTitle}>BREAKDOWN POR TIPO</Text>
                  {Object.keys(provsByTipo).sort(function(a, b) { return provsByTipo[b].total - provsByTipo[a].total; }).map(function(tipo) {
                    var info = provsByTipo[tipo];
                    var pct = totalProvs > 0 ? (info.total / totalProvs * 100) : 0;
                    var tipoLabel = tipo === 'dividendo' ? 'Dividendo' : tipo === 'jcp' ? 'JCP' : tipo === 'rendimento' ? 'Rendimento' : tipo === 'juros_rf' ? 'Juros RF' : tipo === 'amortizacao' ? 'Amortizacao' : tipo === 'bonificacao' ? 'Bonificacao' : tipo;
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

              {/* Per-category breakdown */}
              {Object.keys(provsByCat).length > 0 && (
                <Glass padding={14}>
                  <Text style={styles.sectionTitle}>PROVENTOS POR CATEGORIA (12M)</Text>
                  {Object.keys(provsByCat).sort(function(a, b) { return provsByCat[b] - provsByCat[a]; }).map(function(cat) {
                    var catVal = provsByCat[cat];
                    var catPct = proventos12m > 0 ? (catVal / proventos12m * 100) : 0;
                    var catLabel = cat === 'acao' ? 'Acoes' : cat === 'fii' ? 'FIIs' : cat === 'etf' ? 'ETFs' : cat;
                    var catColor = CAT_COLORS[cat] || C.accent;
                    return (
                      <View key={cat} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor }} />
                          <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body }}>{catLabel}</Text>
                          <View style={{ flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, marginLeft: 4 }}>
                            <View style={{ width: catPct + '%', height: 4, backgroundColor: catColor, borderRadius: 2 }} />
                          </View>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono, marginLeft: 8 }}>
                          {'R$ ' + fmt(catVal) + ' (' + catPct.toFixed(0) + '%)'}
                        </Text>
                      </View>
                    );
                  })}
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

              {/* Monthly detail list */}
              {Object.keys(provsByMonth).length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title="Sem proventos"
                  description="Os proventos recebidos aparecerao aqui agrupados por mes"
                  color={C.fiis}
                />
              ) : (
                Object.keys(provsByMonth)
                  .sort(function(a, b) { return b.localeCompare(a); })
                  .slice(0, 12)
                  .map(function(month) {
                    var items = provsByMonth[month];
                    var total = items.reduce(function(s, p) { return s + (p.valor_total || 0); }, 0);
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
                        {items.map(function(p, i) {
                          var tipoColor = TIPO_COLORS_PROV[p.tipo_provento] || C.fiis;
                          return (
                            <View key={i} style={[styles.provRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>{p.ticker}</Text>
                                <Badge text={p.tipo_provento || 'DIV'} color={tipoColor} />
                              </View>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                                {'+R$ ' + fmt(p.valor_total || 0)}
                              </Text>
                            </View>
                          );
                        })}
                      </Glass>
                    );
                  })
              )}
            </>
          )}

          {/* ═══ PREMIOS ═══ */}
          {provSub === 'premios' && (
            <>
              {opcoes.length === 0 ? (
                <EmptyState
                  icon={"\u2B23"}
                  title="Sem opcoes"
                  description="Adicione opcoes vendidas para ver premios recebidos aqui"
                  color={C.opcoes}
                />
              ) : (
                <>
                  {/* KPI Hero */}
                  <Glass glow={C.opcoes} padding={14}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 12 }}>
                      {[
                        { l: 'TOTAL RECEBIDO', v: 'R$ ' + fmt(opcTotalPremiosRecebidos), c: C.green },
                        { l: 'P&L LIQUIDO', v: 'R$ ' + fmt(opcPLTotal), c: opcPLTotal >= 0 ? C.green : C.red },
                        { l: 'MEDIA/MES', v: 'R$ ' + fmt(premMediaMensal), c: C.accent },
                        { l: 'YIELD s/ CUSTO', v: premYieldOnCost.toFixed(2) + '%', c: premYieldOnCost > 0 ? C.green : C.dim },
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

                  {/* Metricas */}
                  <Glass padding={14}>
                    <Text style={styles.sectionTitle}>METRICAS</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 10, marginTop: 8 }}>
                      {[
                        { l: 'WIN RATE', v: opcWinRate.toFixed(0) + '%', c: opcWinRate >= 70 ? C.green : opcWinRate >= 50 ? C.yellow : C.red },
                        { l: 'TAXA MEDIA a.m.', v: opcTaxaMediaMensal.toFixed(2) + '%', c: C.accent },
                        { l: 'CALLS', v: String(opcByTipo.call.count), c: C.acoes },
                        { l: 'PUTS', v: String(opcByTipo.put.count), c: C.opcoes },
                      ].map(function(d, i) {
                        return (
                          <View key={i} style={{ alignItems: 'center', minWidth: 60 }}>
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Glass>

                  {/* Monthly premios chart with toggle */}
                  {maxPremMonth > 1 && (
                    <Glass padding={12}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={styles.sectionTitle}>PREMIOS MENSAIS (12M)</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity onPress={function() { setOpcShowCall(!opcShowCall); }}>
                            <Badge text="CALL" color={opcShowCall ? C.acoes : C.dim} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={function() { setOpcShowPut(!opcShowPut); }}>
                            <Badge text="PUT" color={opcShowPut ? C.opcoes : C.dim} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <PremiosBarChart data={opcMonthlyPremiums} showCall={opcShowCall} showPut={opcShowPut}
                        selected={opcPremSelected} onSelect={function(i) { setOpcPremSelected(i); }} />
                      {opcPremSelected >= 0 && opcPremSelected < opcMonthlyPremiums.length && (
                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 6 }}>
                          <Text style={{ fontSize: 10, color: C.text, fontFamily: F.mono }}>
                            {opcMonthlyPremiums[opcPremSelected].month + ': R$ ' + fmt(opcMonthlyPremiums[opcPremSelected].total)}
                          </Text>
                          <Text style={{ fontSize: 10, color: C.acoes, fontFamily: F.mono }}>
                            {'C: R$ ' + fmt(opcMonthlyPremiums[opcPremSelected].call)}
                          </Text>
                          <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono }}>
                            {'P: R$ ' + fmt(opcMonthlyPremiums[opcPremSelected].put)}
                          </Text>
                        </View>
                      )}
                    </Glass>
                  )}

                  {/* Annual premios chart */}
                  {premAnnualData.length >= 1 && (
                    <Glass padding={12}>
                      <Text style={styles.sectionTitle}>EVOLUCAO ANUAL</Text>
                      <ProvVertBarChart data={premAnnualData} maxVal={maxPremYear} color={C.opcoes} height={160} />
                    </Glass>
                  )}

                  {/* CALL vs PUT breakdown */}
                  <Glass padding={14}>
                    <Text style={styles.sectionTitle}>CALL vs PUT</Text>
                    {opcTotalPremiosRecebidos > 0 ? (
                      <>
                        <View style={{ height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', marginTop: 8 }}>
                          <View style={{ width: (opcByTipo.call.premio / opcTotalPremiosRecebidos * 100) + '%', height: 16, backgroundColor: C.acoes }} />
                          <View style={{ width: (opcByTipo.put.premio / opcTotalPremiosRecebidos * 100) + '%', height: 16, backgroundColor: C.opcoes }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.acoes }} />
                            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>CALL</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: C.acoes, fontFamily: F.mono }}>
                              {'R$ ' + fmt(opcByTipo.call.premio) + ' (' + (opcByTipo.call.premio / opcTotalPremiosRecebidos * 100).toFixed(0) + '%)'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.opcoes }} />
                            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>PUT</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: C.opcoes, fontFamily: F.mono }}>
                              {'R$ ' + fmt(opcByTipo.put.premio) + ' (' + (opcByTipo.put.premio / opcTotalPremiosRecebidos * 100).toFixed(0) + '%)'}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginTop: 4 }}>Sem premios</Text>
                    )}
                  </Glass>

                  {/* Asset ranking by premio */}
                  {premAssetRanking.length > 0 && (
                    <Glass padding={14}>
                      <Text style={styles.sectionTitle}>RANKING ATIVOS BASE</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, flex: 1 }}>ATIVO</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 50, textAlign: 'center' }}>QTD</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 80, textAlign: 'right' }}>PREMIO</Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, width: 70, textAlign: 'right' }}>P&L</Text>
                      </View>
                      {premAssetRanking.filter(function(a) { return a.premio > 0; }).map(function(a, idx) {
                        return (
                          <View key={a.ticker} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: idx < premAssetRanking.length - 1 ? 0.5 : 0, borderBottomColor: C.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 16 }}>{idx + 1 + '.'}</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display }}>{a.ticker}</Text>
                            </View>
                            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, width: 50, textAlign: 'center' }}>
                              {a.count + 'x'}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: C.green, fontFamily: F.mono, width: 80, textAlign: 'right' }}>
                              {'R$ ' + fmt(a.premio)}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: a.pl >= 0 ? C.green : C.red, fontFamily: F.mono, width: 70, textAlign: 'right' }}>
                              {(a.pl >= 0 ? '+' : '') + 'R$ ' + fmt(a.pl)}
                            </Text>
                          </View>
                        );
                      })}
                    </Glass>
                  )}

                  {/* Monthly detail list */}
                  {Object.keys(premByMonthDetail).length > 0 && (
                    <>
                      <SectionLabel>HISTORICO MENSAL</SectionLabel>
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
        </>
      )}

      {/* ═══════════ INDICADORES ═══════════ */}
      {sub === 'ind' && (
        <>
          {/* Consulta avulsa */}
          <Glass padding={14}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 6 }}>CONSULTAR ATIVO AVULSO</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={searchTicker}
                onChangeText={function(t) { setSearchTicker(t.toUpperCase()); }}
                placeholder="Ex: WEGE3"
                placeholderTextColor={C.dim}
                autoCapitalize="characters"
                style={{
                  flex: 1, backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: 14, color: C.text, fontFamily: F.mono,
                }}
              />
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={searchLoading || searchTicker.length < 4}
                onPress={function() {
                  var tk = searchTicker.trim().toUpperCase();
                  if (tk.length < 4) return;
                  setSearchLoading(true);
                  setSearchError('');
                  setSearchResult(null);
                  fetchPriceHistoryLong([tk, '^BVSP']).then(function(histMap) {
                    var hist = histMap[tk];
                    if (!hist || hist.length < 20) {
                      setSearchError('Dados insuficientes para ' + tk + ' (minimo 20 candles)');
                      setSearchLoading(false);
                      return;
                    }
                    var closes = [];
                    var highs = [];
                    var lows = [];
                    var volumes = [];
                    for (var i = 0; i < hist.length; i++) {
                      closes.push(hist[i].close);
                      highs.push(hist[i].high);
                      lows.push(hist[i].low);
                      volumes.push(hist[i].volume || 0);
                    }
                    var ibovHist = histMap['^BVSP'];
                    var ibovCloses = [];
                    if (ibovHist) {
                      for (var j = 0; j < ibovHist.length; j++) {
                        ibovCloses.push(ibovHist[j].close);
                      }
                    }
                    var volSum = 0;
                    var volCount = Math.min(20, volumes.length);
                    for (var v = volumes.length - volCount; v < volumes.length; v++) {
                      volSum = volSum + volumes[v];
                    }
                    var res = {
                      ticker: tk,
                      preco_fechamento: closes[closes.length - 1],
                      hv_20: closes.length >= 21 ? calcHV(closes, 20) : null,
                      hv_60: closes.length >= 61 ? calcHV(closes, 60) : null,
                      sma_20: closes.length >= 20 ? calcSMA(closes, 20) : null,
                      sma_50: closes.length >= 50 ? calcSMA(closes, 50) : null,
                      ema_9: closes.length >= 9 ? calcEMA(closes, 9) : null,
                      ema_21: closes.length >= 21 ? calcEMA(closes, 21) : null,
                      rsi_14: closes.length >= 15 ? calcRSI(closes, 14) : null,
                      beta: ibovCloses.length >= 21 ? calcBeta(closes, ibovCloses, 20) : null,
                      atr_14: closes.length >= 15 ? calcATR(highs, lows, closes, 14) : null,
                      max_drawdown: calcMaxDrawdown(closes),
                      bb_upper: null, bb_lower: null, bb_width: null,
                      volume_medio_20: volCount > 0 ? volSum / volCount : null,
                    };
                    if (closes.length >= 20) {
                      var bb = calcBollingerBands(closes, 20, 2);
                      res.bb_upper = bb.upper;
                      res.bb_lower = bb.lower;
                      res.bb_width = bb.width;
                    }
                    setSearchResult(res);
                    setSearchLoading(false);
                  }).catch(function(e) {
                    setSearchError('Erro ao buscar ' + tk + ': ' + e.message);
                    setSearchLoading(false);
                  });
                }}
                style={{
                  backgroundColor: C.accent, borderRadius: 10,
                  paddingHorizontal: 16, paddingVertical: 10,
                  opacity: (searchLoading || searchTicker.length < 4) ? 0.4 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: 'white', fontFamily: F.display }}>
                  {searchLoading ? 'Buscando...' : 'Buscar'}
                </Text>
              </TouchableOpacity>
            </View>
            {searchError ? (
              <Text style={{ fontSize: 11, color: C.red, fontFamily: F.body, marginTop: 6 }}>{searchError}</Text>
            ) : null}
          </Glass>

          {/* Search result card */}
          {searchResult && (
            <Glass padding={14} glow={C.accent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.display }}>{searchResult.ticker}</Text>
                  <Badge text="AVULSO" color={C.accent} />
                </View>
                {searchResult.preco_fechamento != null ? (
                  <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>
                    {'R$ ' + fmt(searchResult.preco_fechamento)}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { l: 'HV 20d', v: searchResult.hv_20 != null ? searchResult.hv_20.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'HV 60d', v: searchResult.hv_60 != null ? searchResult.hv_60.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'RSI 14', v: searchResult.rsi_14 != null ? searchResult.rsi_14.toFixed(1) : '-',
                    c: searchResult.rsi_14 != null ? (searchResult.rsi_14 > 70 ? C.red : searchResult.rsi_14 < 30 ? C.green : C.text) : C.text },
                  { l: 'Beta', v: searchResult.beta != null ? searchResult.beta.toFixed(2) : '-',
                    c: searchResult.beta != null ? (searchResult.beta > 1.2 ? C.red : searchResult.beta < 0.8 ? C.green : C.text) : C.text },
                  { l: 'SMA 20', v: searchResult.sma_20 != null ? 'R$ ' + fmt(searchResult.sma_20) : '-', c: C.acoes },
                  { l: 'SMA 50', v: searchResult.sma_50 != null ? 'R$ ' + fmt(searchResult.sma_50) : '-', c: C.acoes },
                  { l: 'EMA 9', v: searchResult.ema_9 != null ? 'R$ ' + fmt(searchResult.ema_9) : '-', c: C.acoes },
                  { l: 'EMA 21', v: searchResult.ema_21 != null ? 'R$ ' + fmt(searchResult.ema_21) : '-', c: C.acoes },
                  { l: 'ATR 14', v: searchResult.atr_14 != null ? 'R$ ' + fmt(searchResult.atr_14) : '-', c: C.text },
                  { l: 'Max DD', v: searchResult.max_drawdown != null ? searchResult.max_drawdown.toFixed(1) + '%' : '-', c: C.red },
                  { l: 'BB Upper', v: searchResult.bb_upper != null ? 'R$ ' + fmt(searchResult.bb_upper) : '-', c: C.acoes },
                  { l: 'BB Lower', v: searchResult.bb_lower != null ? 'R$ ' + fmt(searchResult.bb_lower) : '-', c: C.acoes },
                  { l: 'BB Width', v: searchResult.bb_width != null ? searchResult.bb_width.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'Vol Med 20', v: searchResult.volume_medio_20 != null ? fmtC(searchResult.volume_medio_20) : '-', c: C.sub },
                ].map(function(d, di) {
                  return (
                    <View key={di} style={styles.indDetailItem}>
                      <Text style={styles.indDetailLabel}>{d.l}</Text>
                      <Text style={[styles.indDetailValue, { color: d.c }]}>{d.v}</Text>
                    </View>
                  );
                })}
              </View>
            </Glass>
          )}

          {indicators.length === 0 ? (
            !searchResult ? (
              <EmptyState
                icon={'\u0394'} title="Sem indicadores"
                description="Indicadores sao calculados automaticamente apos 18h em dias uteis. Adicione ativos na carteira para comecar. Use a busca acima para consultar qualquer ativo."
                color={C.opcoes}
              />
            ) : null
          ) : (
            <>
              {/* Summary */}
              <Glass padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {[
                    { l: 'ATIVOS', v: String(indicators.length), c: C.acoes },
                    { l: 'ULTIMO CALCULO', v: indicators[0] && indicators[0].data_calculo
                      ? new Date(indicators[0].data_calculo).toLocaleDateString('pt-BR') : '–', c: C.sub },
                  ].map(function(m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* Recalculate button */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={{ backgroundColor: C.opcoes + '15', borderWidth: 1, borderColor: C.opcoes + '30', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                onPress={function() {
                  if (!user) return;
                  runDailyCalculation(user.id).then(function(calcResult) {
                    if (calcResult.data && calcResult.data.length > 0) {
                      setIndicators(calcResult.data);
                    }
                  }).catch(function(e) {
                    console.warn('Manual calc failed:', e);
                  });
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.opcoes, fontFamily: F.display }}>Recalcular indicadores</Text>
              </TouchableOpacity>

              {/* Table header */}
              <Glass padding={0}>
                <View style={styles.indTableHeader}>
                  <Text style={[styles.indTableCol, { flex: 1.2 }]}>Ticker</Text>
                  <Text style={styles.indTableCol}>HV 20d</Text>
                  <Text style={styles.indTableCol}>RSI</Text>
                  <Text style={styles.indTableCol}>Beta</Text>
                  <Text style={styles.indTableCol}>Max DD</Text>
                </View>

                {/* Table rows */}
                {indicators.map(function(ind, i) {
                  var rsiColor = C.text;
                  if (ind.rsi_14 != null) {
                    if (ind.rsi_14 > 70) rsiColor = C.red;
                    else if (ind.rsi_14 < 30) rsiColor = C.green;
                  }
                  var betaColor = C.text;
                  if (ind.beta != null) {
                    if (ind.beta > 1.2) betaColor = C.red;
                    else if (ind.beta < 0.8) betaColor = C.green;
                  }
                  return (
                    <View key={ind.ticker || i} style={[styles.indTableRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={[styles.indTableTicker, { flex: 1.2 }]}>{ind.ticker}</Text>
                      <Text style={[styles.indTableVal, { color: C.opcoes }]}>
                        {ind.hv_20 != null ? ind.hv_20.toFixed(1) + '%' : '–'}
                      </Text>
                      <Text style={[styles.indTableVal, { color: rsiColor }]}>
                        {ind.rsi_14 != null ? ind.rsi_14.toFixed(0) : '–'}
                      </Text>
                      <Text style={[styles.indTableVal, { color: betaColor }]}>
                        {ind.beta != null ? ind.beta.toFixed(2) : '–'}
                      </Text>
                      <Text style={[styles.indTableVal, { color: C.red }]}>
                        {ind.max_drawdown != null ? ind.max_drawdown.toFixed(1) + '%' : '–'}
                      </Text>
                    </View>
                  );
                })}
              </Glass>

              {/* Detailed cards per ticker */}
              <SectionLabel>DETALHES POR ATIVO</SectionLabel>
              {indicators.map(function(ind, i) {
                return (
                  <Glass key={ind.ticker || i} padding={14}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, fontFamily: F.display }}>{ind.ticker}</Text>
                      {ind.preco_fechamento != null ? (
                        <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.mono }}>
                          {'R$ ' + fmt(ind.preco_fechamento)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { l: 'HV 20d', v: ind.hv_20 != null ? ind.hv_20.toFixed(1) + '%' : '–', c: C.opcoes },
                        { l: 'HV 60d', v: ind.hv_60 != null ? ind.hv_60.toFixed(1) + '%' : '–', c: C.opcoes },
                        { l: 'RSI 14', v: ind.rsi_14 != null ? ind.rsi_14.toFixed(1) : '–',
                          c: ind.rsi_14 != null ? (ind.rsi_14 > 70 ? C.red : ind.rsi_14 < 30 ? C.green : C.text) : C.text },
                        { l: 'Beta', v: ind.beta != null ? ind.beta.toFixed(2) : '–',
                          c: ind.beta != null ? (ind.beta > 1.2 ? C.red : ind.beta < 0.8 ? C.green : C.text) : C.text },
                        { l: 'SMA 20', v: ind.sma_20 != null ? 'R$ ' + fmt(ind.sma_20) : '–', c: C.acoes },
                        { l: 'SMA 50', v: ind.sma_50 != null ? 'R$ ' + fmt(ind.sma_50) : '–', c: C.acoes },
                        { l: 'EMA 9', v: ind.ema_9 != null ? 'R$ ' + fmt(ind.ema_9) : '–', c: C.acoes },
                        { l: 'EMA 21', v: ind.ema_21 != null ? 'R$ ' + fmt(ind.ema_21) : '–', c: C.acoes },
                        { l: 'ATR 14', v: ind.atr_14 != null ? 'R$ ' + fmt(ind.atr_14) : '–', c: C.text },
                        { l: 'Max DD', v: ind.max_drawdown != null ? ind.max_drawdown.toFixed(1) + '%' : '–', c: C.red },
                        { l: 'BB Upper', v: ind.bb_upper != null ? 'R$ ' + fmt(ind.bb_upper) : '–', c: C.acoes },
                        { l: 'BB Lower', v: ind.bb_lower != null ? 'R$ ' + fmt(ind.bb_lower) : '–', c: C.acoes },
                        { l: 'BB Width', v: ind.bb_width != null ? ind.bb_width.toFixed(1) + '%' : '–', c: C.opcoes },
                        { l: 'Vol Med 20', v: ind.volume_medio_20 != null ? fmtC(ind.volume_medio_20) : '–', c: C.sub },
                      ].map(function(d, di) {
                        return (
                          <View key={di} style={styles.indDetailItem}>
                            <Text style={styles.indDetailLabel}>{d.l}</Text>
                            <Text style={[styles.indDetailValue, { color: d.c }]}>{d.v}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Glass>
                );
              })}
            </>
          )}
        </>
      )}

      {/* ═══════════ IR ═══════════ */}
      {sub === 'ir' && (
        <>
          {irTaxData.length === 0 ? (
            <EmptyState
              icon="\u25C9"
              title="Sem vendas registradas"
              description="O calculo de IR sera feito automaticamente quando voce registrar vendas de ativos"
              color={C.accent}
            />
          ) : (
            <>
              {/* Summary */}
              <Glass glow={C.accent} padding={14}>
                <View style={styles.irSummaryRow}>
                  <View style={styles.irSummaryItem}>
                    <Text style={styles.irSummaryLabel}>GANHOS</Text>
                    <Text style={[styles.irSummaryValue, { color: C.green }]}>
                      R$ {fmt(irTotalGanhos)}
                    </Text>
                  </View>
                  <View style={styles.irSummaryItem}>
                    <Text style={styles.irSummaryLabel}>PERDAS</Text>
                    <Text style={[styles.irSummaryValue, { color: C.red }]}>
                      R$ {fmt(irTotalPerdas)}
                    </Text>
                  </View>
                  <View style={styles.irSummaryItem}>
                    <Text style={styles.irSummaryLabel}>SALDO</Text>
                    <Text style={[styles.irSummaryValue, { color: irSaldoLiquido >= 0 ? C.green : C.red }]}>
                      R$ {fmt(irSaldoLiquido)}
                    </Text>
                  </View>
                </View>
              </Glass>

              {/* Imposto total */}
              {irTotalImposto > 0 && (
                <Glass glow={C.yellow} padding={14}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.irSummaryLabel}>IMPOSTO TOTAL ESTIMADO</Text>
                    <Text style={[styles.irSummaryValue, { color: C.yellow, fontSize: 22 }]}>
                      R$ {fmt(irTotalImposto)}
                    </Text>
                  </View>
                </Glass>
              )}

              {/* Alerta 20k */}
              {hasAlerta20k && (
                <View style={styles.irAlert}>
                  <Text style={styles.irAlertText}>
                    Vendas de acoes acima de R$ 20.000 em algum mes — ganhos tributaveis a 15%
                  </Text>
                </View>
              )}

              {/* Monthly breakdown */}
              <SectionLabel>DETALHAMENTO MENSAL</SectionLabel>
              {irTaxData.slice().reverse().map(function(m) {
                var parts = m.month.split('-');
                var label = MONTH_LABELS[parseInt(parts[1])] + '/' + parts[0];
                var vendasTotal = m.vendasAcoes + m.vendasFII + m.vendasETF;
                return (
                  <Glass key={m.month} padding={0}>
                    <View style={styles.irMonthHeader}>
                      <Text style={styles.irMonthLabel}>{label}</Text>
                      {m.impostoTotal > 0 ? (
                        <Badge text={'DARF R$ ' + fmt(m.impostoTotal)} color={C.yellow} />
                      ) : (
                        <Badge text="Isento" color={C.green} />
                      )}
                    </View>

                    {/* Vendas */}
                    <View style={styles.irRow}>
                      <Text style={styles.irRowLabel}>Vendas totais</Text>
                      <Text style={styles.irRowValue}>R$ {fmt(vendasTotal)}</Text>
                    </View>

                    {m.vendasAcoes > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>  Acoes {m.alertaAcoes20k ? '(>20k)' : '(<20k)'}</Text>
                        <Text style={styles.irRowValue}>R$ {fmt(m.vendasAcoes)}</Text>
                      </View>
                    )}
                    {m.vendasFII > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>  FIIs</Text>
                        <Text style={styles.irRowValue}>R$ {fmt(m.vendasFII)}</Text>
                      </View>
                    )}
                    {m.vendasETF > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>  ETFs</Text>
                        <Text style={styles.irRowValue}>R$ {fmt(m.vendasETF)}</Text>
                      </View>
                    )}

                    {/* Ganhos/Perdas */}
                    <View style={[styles.irRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={styles.irRowLabel}>Ganhos realizados</Text>
                      <Text style={[styles.irRowValue, { color: C.green }]}>
                        +R$ {fmt(m.ganhoAcoes + m.ganhoFII + m.ganhoETF)}
                      </Text>
                    </View>
                    {(m.perdaAcoes + m.perdaFII + m.perdaETF) > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>Perdas realizadas</Text>
                        <Text style={[styles.irRowValue, { color: C.red }]}>
                          -R$ {fmt(m.perdaAcoes + m.perdaFII + m.perdaETF)}
                        </Text>
                      </View>
                    )}

                    {/* Prejuizo acumulado */}
                    {(m.prejAcumAcoes + m.prejAcumFII + m.prejAcumETF) > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>Prejuizo acumulado</Text>
                        <Text style={[styles.irRowValue, { color: C.sub }]}>
                          R$ {fmt(m.prejAcumAcoes + m.prejAcumFII + m.prejAcumETF)}
                        </Text>
                      </View>
                    )}

                    {/* DARF footer */}
                    {m.impostoTotal > 0 ? (
                      <View style={styles.irDarfRow}>
                        <Text style={styles.irDarfLabel}>DARF estimado</Text>
                        <Text style={styles.irDarfValue}>R$ {fmt(m.impostoTotal)}</Text>
                      </View>
                    ) : (
                      <View style={[styles.irDarfRow, { backgroundColor: C.green + '08' }]}>
                        <Text style={[styles.irDarfLabel, { color: C.green }]}>Isento</Text>
                        <Text style={[styles.irDarfValue, { color: C.green }]}>R$ 0,00</Text>
                      </View>
                    )}
                  </Glass>
                );
              })}
            </>
          )}
        </>
      )}

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
  perfSubTabs: { flexDirection: 'row', gap: 5, marginBottom: 4 },
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
