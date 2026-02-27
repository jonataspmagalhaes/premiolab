import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Alert, ActivityIndicator, Keyboard,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { C, F, SIZE } from '../../theme';
import { Glass, Pill, Badge, InfoTip, EmptyState } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { importBatch, getOperacoesForDedup, getOpcoesForDedup, incrementCorretora } from '../../services/database';
import {
  parseCSVText, parseB3, parseGeneric, parseCEI, detectFormat, findDuplicates, decodeCSVBuffer,
  isNotaCorretagem, parseNotaCorretagem,
} from '../../services/csvImportService';

// ── Constants ──
var INPUT_MODES = [
  { k: 'cei', l: 'CEI/B3' },
  { k: 'b3', l: 'B3 (Excel)' },
  { k: 'nota', l: 'Nota PDF' },
  { k: 'paste', l: 'Colar CSV' },
  { k: 'generic', l: 'CSV Genérico' },
];

var FILTERS = [
  { k: 'all', l: 'Todas' },
  { k: 'new', l: 'Novas' },
  { k: 'duplicate', l: 'Duplicados' },
  { k: 'possible_duplicate', l: 'Possíveis' },
  { k: 'error', l: 'Erros' },
  { k: 'skip', l: 'Ignoradas' },
];

var STATUS_COLORS = {
  'new': C.green,
  'duplicate': C.red,
  'possible_duplicate': C.yellow,
  'error': C.red,
  'skip': C.dim,
};

var STATUS_LABELS = {
  'new': 'NOVA',
  'duplicate': 'DUPLICADO',
  'possible_duplicate': 'POSSÍVEL',
  'error': 'ERRO',
  'skip': 'IGNORADA',
};

// Import type badge colors
var TYPE_BADGE_COLORS = {
  'operacao': C.acoes,
  'opcao': C.opcoes,
  'exercicio': C.etfs,
  'skip': C.dim,
};

var TYPE_BADGE_LABELS = {
  'operacao': 'AÇÃO',
  'opcao': 'OPÇÃO',
  'exercicio': 'EXERCÍCIO',
  'skip': 'N/A',
};

var B3_HELP = 'Como exportar da B3:\n\n1. Acesse investidor.b3.com.br\n2. Vá em Extratos > Negociação\n3. Filtre o período desejado\n4. Clique em "Extrair" (Excel)\n5. Abra o arquivo no Excel/Google Sheets\n6. Selecione tudo (Ctrl+A), copie (Ctrl+C)\n7. Cole aqui no campo abaixo';

var GENERIC_TEMPLATE = 'Data;Tipo;Ticker;Categoria;Quantidade;Preço;Corretagem;Emolumentos;Impostos;Corretora\n02/01/2024;compra;PETR4;acao;100;36,75;0;0;0;Clear\n03/01/2024;venda;VALE3;acao;50;68,50;4,90;0,50;0;XP';

var CEI_HELP = 'Como exportar do CEI:\n\n1. Acesse cei.b3.com.br\n2. Vá em Extratos e Informativos > Negociação\n3. Filtre o período desejado\n4. Clique em "Exportar" (.csv)\n5. Carregue o arquivo aqui ou abra, copie e cole\n\nAceita arquivos com nomes como "negociacao-xxx.xlsx - Negociação.csv".\n\nSuporta: ações, FIIs, ETFs, opções, exercícios.\nFuturos e termos são exibidos mas não importados.';

var NOTA_HELP = 'Como importar nota de corretagem:\n\n1. Abra o PDF da nota no celular ou computador\n2. Selecione todo o texto (Ctrl+A ou "Selecionar tudo")\n3. Copie (Ctrl+C)\n4. Cole no campo abaixo\n\nSuporta notas das principais corretoras brasileiras.\nExtrai: operações, opções, custos (taxas, emolumentos, ISS).\n\nOs custos são rateados proporcionalmente entre as operações.';

// ══════════════════════════════════════════
// ═══════ MAIN COMPONENT ═════════════════
// ══════════════════════════════════════════
export default function ImportOperacoesScreen(props) {
  var navigation = props.navigation;
  var auth = useAuth();
  var userId = auth.user && auth.user.id;

  // ── State ──
  var _step = useState(1); var step = _step[0]; var setStep = _step[1];
  var _inputMode = useState('b3'); var inputMode = _inputMode[0]; var setInputMode = _inputMode[1];
  var _rawText = useState(''); var rawText = _rawText[0]; var setRawText = _rawText[1];
  var _fileName = useState(''); var fileName = _fileName[0]; var setFileName = _fileName[1];
  var _parsedOps = useState([]); var parsedOps = _parsedOps[0]; var setParsedOps = _parsedOps[1];
  var _selected = useState({}); var selected = _selected[0]; var setSelected = _selected[1];
  var _importing = useState(false); var importing = _importing[0]; var setImporting = _importing[1];
  var _processing = useState(false); var processing = _processing[0]; var setProcessing = _processing[1];
  var _result = useState(null); var result = _result[0]; var setResult = _result[1];
  var _filter = useState('all'); var filter = _filter[0]; var setFilter = _filter[1];
  var _detectedFormat = useState(''); var detectedFormat = _detectedFormat[0]; var setDetectedFormat = _detectedFormat[1];

  // ── Pick file ──
  // Accepts CSV files with any name pattern (including "xxx.xlsx - Negociação.csv")
  // Handles UTF-8, UTF-8 with BOM, and Latin-1/Windows-1252 encoding automatically
  function handlePickFile() {
    DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/plain', 'text/tab-separated-values',
             'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             '*/*'],
      copyToCacheDirectory: true,
    }).then(function(pickResult) {
      if (pickResult.canceled) return;
      var asset = pickResult.assets && pickResult.assets[0];
      if (!asset) return;
      var displayName = asset.name || 'arquivo';
      setFileName(displayName);

      // Read as ArrayBuffer for encoding detection (UTF-8 vs Latin-1)
      fetch(asset.uri).then(function(resp) {
        if (typeof resp.arrayBuffer === 'function') {
          return resp.arrayBuffer().then(function(buffer) {
            return decodeCSVBuffer(buffer);
          });
        }
        // Fallback: read as text (assumes UTF-8)
        return resp.text().then(function(text) {
          // Strip BOM if present
          if (text.charCodeAt(0) === 0xFEFF) return text.substring(1);
          return text;
        });
      }).then(function(text) {
        setRawText(text);
        Toast.show({ type: 'success', text1: 'Arquivo carregado', text2: displayName });
      }).catch(function(err) {
        Alert.alert('Erro', 'Não foi possível ler o arquivo: ' + (err && err.message || 'erro desconhecido'));
      });
    }).catch(function(err) {
      if (err && err.message && err.message.indexOf('cancel') >= 0) return;
      Alert.alert('Erro', 'Não foi possível abrir o seletor de arquivos. Este recurso requer um build nativo (eas build).');
    });
  }

  // ── Process CSV ──
  function handleProcess() {
    Keyboard.dismiss();
    if (!rawText || !rawText.trim()) {
      Alert.alert('Dados vazios', 'Cole ou carregue dados para processar.');
      return;
    }

    setProcessing(true);

    // Parse in a timeout to not block UI
    setTimeout(function() {
      try {
        // ── Auto-detect nota de corretagem (works from any input mode) ──
        var ops = [];
        var isNota = isNotaCorretagem(rawText);
        if (isNota) {
          ops = parseNotaCorretagem(rawText);
          setDetectedFormat('nota');
        }

        // ── Standard CSV/TSV parsing if not nota or nota returned empty ──
        if (ops.length === 0 && !isNota) {
          var parsed = parseCSVText(rawText);
          if (!parsed.rows || parsed.rows.length === 0) {
            setProcessing(false);
            Alert.alert('Sem dados', 'Nenhuma linha de dados encontrada. Verifique o formato.');
            return;
          }

          var fmt = detectFormat(parsed.headers);
          setDetectedFormat(fmt);

          if (fmt === 'cei') {
            ops = parseCEI(parsed.headers, parsed.rows);
          } else if (fmt === 'b3') {
            ops = parseB3(parsed.headers, parsed.rows);
          } else if (fmt === 'generic') {
            ops = parseGeneric(parsed.headers, parsed.rows);
          } else {
            // Try CEI first, then B3, then generic
            ops = parseCEI(parsed.headers, parsed.rows);
            if (ops.length === 0) {
              ops = parseB3(parsed.headers, parsed.rows);
            }
            if (ops.length === 0) {
              ops = parseGeneric(parsed.headers, parsed.rows);
            }
            if (ops.length > 0) {
              setDetectedFormat('auto');
            }
          }
        }

        if (ops.length === 0) {
          setProcessing(false);
          if (isNota) {
            Alert.alert('Nenhuma operação', 'O texto parece ser uma nota de corretagem, mas não foi possível extrair operações. Verifique se copiou todo o texto do PDF.');
          } else {
            Alert.alert('Nenhuma operação', 'Não foi possível extrair operações. Verifique se o formato está correto.\n\nFormatos aceitos:\n- CSV do CEI (cei.b3.com.br)\n- Extrato B3 (copiar do Excel)\n- Nota de corretagem (copiar texto do PDF)\n- CSV genérico com colunas: Data, Tipo, Ticker, Quantidade, Preço');
          }
          return;
        }

        // Check if we have any opcoes to dedup
        var hasOpcoes = false;
        for (var ci = 0; ci < ops.length; ci++) {
          if (ops[ci]._importType === 'opcao') { hasOpcoes = true; break; }
        }

        // Fetch existing operations + opcoes for dedup
        var dedupPromises = [getOperacoesForDedup(userId)];
        if (hasOpcoes) {
          dedupPromises.push(getOpcoesForDedup(userId));
        }

        Promise.all(dedupPromises).then(function(dedupResults) {
          var existingOps = (dedupResults[0] && dedupResults[0].data) || [];
          var existingOpcoes = (dedupResults[1] && dedupResults[1].data) || [];
          var results = findDuplicates(ops, existingOps, existingOpcoes);

          setParsedOps(results);

          // Set initial selection: new = selected, duplicate/skip = deselected
          var sel = {};
          for (var i = 0; i < results.length; i++) {
            sel[i] = results[i].status === 'new' || results[i].status === 'possible_duplicate';
          }
          setSelected(sel);
          setStep(2);
          setProcessing(false);
        }).catch(function() {
          // If dedup fetch fails, treat importable as new, skips as skip
          var results = [];
          for (var j = 0; j < ops.length; j++) {
            if (ops[j]._importType === 'skip') {
              results.push({ op: ops[j], status: 'skip' });
            } else {
              results.push({ op: ops[j], status: 'new' });
            }
          }
          setParsedOps(results);
          var sel = {};
          for (var k = 0; k < results.length; k++) {
            sel[k] = results[k].status === 'new';
          }
          setSelected(sel);
          setStep(2);
          setProcessing(false);
        });
      } catch (err) {
        setProcessing(false);
        Alert.alert('Erro ao processar', err && err.message || 'Erro desconhecido');
      }
    }, 50);
  }

  // ── Import selected ──
  function handleImport() {
    var toImport = [];
    for (var i = 0; i < parsedOps.length; i++) {
      if (selected[i] && parsedOps[i].status !== 'error' && parsedOps[i].status !== 'skip') {
        toImport.push(parsedOps[i].op);
      }
    }

    if (toImport.length === 0) {
      Alert.alert('Nenhuma selecionada', 'Selecione ao menos uma operação para importar.');
      return;
    }

    // Build summary message with type counts
    var typeCounts = { operacao: 0, opcao: 0, exercicio: 0 };
    for (var tc = 0; tc < toImport.length; tc++) {
      var iType = toImport[tc]._importType || 'operacao';
      if (typeCounts[iType] !== undefined) {
        typeCounts[iType] = typeCounts[iType] + 1;
      } else {
        typeCounts.operacao = typeCounts.operacao + 1;
      }
    }
    var summaryParts = [];
    if (typeCounts.operacao > 0) summaryParts.push(typeCounts.operacao + ' operação' + (typeCounts.operacao > 1 ? 'ões' : ''));
    if (typeCounts.opcao > 0) summaryParts.push(typeCounts.opcao + ' opção' + (typeCounts.opcao > 1 ? 'ões' : ''));
    if (typeCounts.exercicio > 0) summaryParts.push(typeCounts.exercicio + ' exercício' + (typeCounts.exercicio > 1 ? 's' : ''));
    var summaryMsg = 'Importar ' + summaryParts.join(', ') + '?';

    Alert.alert(
      'Confirmar importação',
      summaryMsg,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: function() {
            setImporting(true);
            importBatch(userId, toImport).then(function(batchResult) {
              // Increment corretora counters
              var corretoraSet = {};
              for (var j = 0; j < toImport.length; j++) {
                var cor = toImport[j].corretora;
                if (cor && !corretoraSet[cor]) {
                  corretoraSet[cor] = true;
                  incrementCorretora(userId, cor).catch(function() {});
                }
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setResult(batchResult);
              setStep(3);
              setImporting(false);
            }).catch(function(err) {
              setImporting(false);
              Alert.alert('Erro', 'Falha na importação: ' + (err && err.message || 'erro'));
            });
          },
        },
      ]
    );
  }

  // ── Toggle selection ──
  function toggleSelect(idx) {
    if (parsedOps[idx] && (parsedOps[idx].status === 'error' || parsedOps[idx].status === 'skip')) return;
    var newSel = {};
    var keys = Object.keys(selected);
    for (var i = 0; i < keys.length; i++) {
      newSel[keys[i]] = selected[keys[i]];
    }
    newSel[idx] = !newSel[idx];
    setSelected(newSel);
  }

  // ── Select/deselect helpers ──
  function selectAllNew() {
    var newSel = {};
    for (var i = 0; i < parsedOps.length; i++) {
      newSel[i] = parsedOps[i].status === 'new' || parsedOps[i].status === 'possible_duplicate';
    }
    setSelected(newSel);
  }

  function selectAll() {
    var newSel = {};
    for (var i = 0; i < parsedOps.length; i++) {
      newSel[i] = parsedOps[i].status !== 'error' && parsedOps[i].status !== 'skip';
    }
    setSelected(newSel);
  }

  function deselectAll() {
    var newSel = {};
    for (var i = 0; i < parsedOps.length; i++) {
      newSel[i] = false;
    }
    setSelected(newSel);
  }

  // ── Counts ──
  function countByStatus(status) {
    var c = 0;
    for (var i = 0; i < parsedOps.length; i++) {
      if (status === 'all' || parsedOps[i].status === status) c++;
    }
    return c;
  }

  function countSelected() {
    var c = 0;
    for (var i = 0; i < parsedOps.length; i++) {
      if (selected[i]) c++;
    }
    return c;
  }

  // ── Filtered list ──
  function getFilteredOps() {
    if (filter === 'all') return parsedOps;
    var filtered = [];
    for (var i = 0; i < parsedOps.length; i++) {
      if (parsedOps[i].status === filter) {
        filtered.push({ item: parsedOps[i], idx: i });
      }
    }
    return filtered;
  }

  // ── Format helpers ──
  function fmtPrice(v) {
    if (!v) return '0,00';
    return v.toFixed(2).replace('.', ',');
  }

  function fmtDate(d) {
    if (!d) return '--';
    var parts = d.split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return d;
  }

  // ══════════════════════════════════════════
  // ═══════ STEP 1: INPUT ═════════════════
  // ══════════════════════════════════════════
  function renderStep1() {
    return (
      <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Input mode pills */}
        <View style={styles.pillRow}>
          {INPUT_MODES.map(function(m) {
            return (
              <Pill key={m.k} active={inputMode === m.k} color={C.accent}
                onPress={function() { setInputMode(m.k); setRawText(''); setFileName(''); }}>
                {m.l}
              </Pill>
            );
          })}
        </View>

        {/* Help info */}
        {inputMode === 'cei' ? (
          <Glass style={styles.helpCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="information-circle" size={20} color={C.accent} />
              <Text style={styles.helpText}>{CEI_HELP}</Text>
            </View>
          </Glass>
        ) : inputMode === 'b3' ? (
          <Glass style={styles.helpCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="information-circle" size={20} color={C.accent} />
              <Text style={styles.helpText}>{B3_HELP}</Text>
            </View>
          </Glass>
        ) : inputMode === 'nota' ? (
          <Glass style={styles.helpCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="information-circle" size={20} color={C.accent} />
              <Text style={styles.helpText}>{NOTA_HELP}</Text>
            </View>
          </Glass>
        ) : inputMode === 'generic' ? (
          <Glass style={styles.helpCard}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="information-circle" size={20} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.helpText}>Formato CSV genérico. Colunas obrigatórias: Data, Tipo, Ticker, Quantidade, Preço.</Text>
                <Text style={[styles.helpText, { marginTop: 6, color: C.dim, fontSize: 10 }]}>Template:</Text>
                <Text style={[styles.helpText, { fontFamily: F.mono, fontSize: 9, color: C.sub, marginTop: 4 }]}>{GENERIC_TEMPLATE}</Text>
              </View>
            </View>
          </Glass>
        ) : null}

        {/* File picker button (not for nota mode — nota is paste-only) */}
        {(inputMode === 'cei' || inputMode === 'b3' || inputMode === 'generic') ? (
          <TouchableOpacity style={styles.fileBtn} onPress={handlePickFile}
            accessibilityRole="button" accessibilityLabel="Selecionar arquivo">
            <Ionicons name="document-attach-outline" size={22} color={C.accent} />
            <Text style={styles.fileBtnText}>
              {fileName ? fileName : 'Selecionar arquivo (.csv)'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Divider */}
        {(inputMode === 'cei' || inputMode === 'b3' || inputMode === 'generic') ? (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou cole abaixo</Text>
            <View style={styles.dividerLine} />
          </View>
        ) : null}

        {/* Text input */}
        <TextInput
          style={styles.textArea}
          multiline
          value={rawText}
          onChangeText={setRawText}
          placeholder={inputMode === 'generic' ? GENERIC_TEMPLATE : inputMode === 'nota' ? 'Cole aqui o texto copiado da nota de corretagem em PDF...' : 'Cole aqui os dados copiados do Excel / CSV...'}
          placeholderTextColor={C.dim}
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Process button */}
        <TouchableOpacity
          style={[styles.primaryBtn, (!rawText.trim() || processing) && styles.btnDisabled]}
          onPress={handleProcess}
          disabled={!rawText.trim() || processing}
          accessibilityRole="button"
          accessibilityLabel="Processar dados"
        >
          {processing ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="analytics-outline" size={18} color="white" />
              <Text style={styles.primaryBtnText}>Processar</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ══════════════════════════════════════════
  // ═══════ STEP 2: PREVIEW ═══════════════
  // ══════════════════════════════════════════
  function renderOpCard(info) {
    var item, idx;
    if (info.item && info.item.op) {
      // From filtered list
      item = info.item;
      idx = info.idx !== undefined ? info.idx : info.index;
    } else if (info.item) {
      item = info.item;
      idx = info.index;
    } else {
      return null;
    }

    var op = item.op;
    var status = item.status;
    var isSelected = selected[idx];
    var badgeColor = STATUS_COLORS[status] || C.dim;
    var badgeLabel = STATUS_LABELS[status] || status;
    var importType = op._importType || 'operacao';
    var isSkip = status === 'skip';
    var isOpcao = importType === 'opcao';
    var isExercicio = importType === 'exercicio';
    var typeBadgeColor = TYPE_BADGE_COLORS[importType] || C.acoes;
    var typeBadgeLabel = TYPE_BADGE_LABELS[importType] || 'AÇÃO';

    // Card date: opcao uses data_abertura, others use data
    var cardDate = isOpcao ? op.data_abertura : op.data;

    return (
      <TouchableOpacity
        key={'op_' + idx}
        style={[styles.opCard, isSelected && styles.opCardSelected, isSkip && styles.opCardSkip]}
        onPress={function() { toggleSelect(idx); }}
        activeOpacity={isSkip ? 1 : 0.7}
        disabled={isSkip}
      >
        <View style={styles.opCardHeader}>
          {/* Checkbox */}
          <Ionicons
            name={isSkip ? 'remove-circle-outline' : (isSelected ? 'checkbox' : 'square-outline')}
            size={22}
            color={status === 'error' || isSkip ? C.dim : (isSelected ? C.accent : C.sub)}
          />
          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: badgeColor + '22', borderColor: badgeColor + '44' }]}>
            <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
          {/* Import type badge */}
          {importType !== 'operacao' ? (
            <View style={[styles.tipoBadge, { backgroundColor: typeBadgeColor + '22' }]}>
              <Text style={[styles.tipoBadgeText, { color: typeBadgeColor }]}>{typeBadgeLabel}</Text>
            </View>
          ) : null}
          {/* Date */}
          <Text style={styles.opDate}>{fmtDate(cardDate)}</Text>
        </View>

        {/* ── Opcao card body ── */}
        {isOpcao ? (
          <View style={{ paddingLeft: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={styles.opTicker}>{op.ticker_opcao}</Text>
              <View style={[styles.tipoBadge, { backgroundColor: op.tipo === 'call' ? C.acoes + '22' : C.red + '22' }]}>
                <Text style={[styles.tipoBadgeText, { color: op.tipo === 'call' ? C.acoes : C.red }]}>
                  {op.tipo === 'call' ? 'CALL' : 'PUT'}
                </Text>
              </View>
              <View style={[styles.tipoBadge, { backgroundColor: op.direcao === 'venda' ? C.etfs + '22' : C.rf + '22' }]}>
                <Text style={[styles.tipoBadgeText, { color: op.direcao === 'venda' ? C.etfs : C.rf }]}>
                  {op.direcao === 'venda' ? 'VENDA' : 'COMPRA'}
                </Text>
              </View>
            </View>
            <Text style={styles.opDetail}>
              {'Base: ' + op.ativo_base + ' | ' + op.quantidade + ' × R$ ' + fmtPrice(op.premio)}
            </Text>
            {op.strike > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Text style={styles.opDetail}>{'Strike: R$ ' + fmtPrice(op.strike)}</Text>
                {op._strikeEstimated ? (
                  <View style={[styles.tipoBadge, { backgroundColor: C.yellow + '22' }]}>
                    <Text style={[styles.tipoBadgeText, { color: C.yellow }]}>ESTIMADO</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {op.vencimento ? <Text style={[styles.opDetail, { marginTop: 2 }]}>{'Venc: ' + fmtDate(op.vencimento)}</Text> : null}
            {op._notaCustos > 0 ? <Text style={[styles.opDetail, { marginTop: 2, color: C.dim }]}>{'Custos: R$ ' + fmtPrice(op._notaCustos)}</Text> : null}
            {op.corretora ? <Text style={styles.opCorretora}>{op.corretora}</Text> : null}
          </View>
        ) : isSkip ? (
          /* ── Skip card body ── */
          <View style={styles.opCardBody}>
            <Text style={[styles.opTicker, { color: C.dim }]}>{op.ticker}</Text>
            <Text style={[styles.opDetail, { color: C.dim }]}>
              {op._skipReason || 'Não suportado'}
            </Text>
          </View>
        ) : (
          /* ── Operacao / Exercicio card body ── */
          <View style={styles.opCardBody}>
            <Text style={styles.opTicker}>{op.ticker}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              {/* Compra/Venda badge */}
              <View style={[styles.tipoBadge, { backgroundColor: op.tipo === 'compra' ? C.acoes + '22' : C.red + '22' }]}>
                <Text style={[styles.tipoBadgeText, { color: op.tipo === 'compra' ? C.acoes : C.red }]}>
                  {op.tipo === 'compra' ? 'C' : 'V'}
                </Text>
              </View>
              <Text style={styles.opDetail}>
                {op.quantidade + ' × R$ ' + fmtPrice(op.preco)}
              </Text>
            </View>
            {op._notaCustos > 0 ? <Text style={[styles.opDetail, { color: C.dim, paddingLeft: 0 }]}>{'Custos: R$ ' + fmtPrice(op._notaCustos)}</Text> : null}
            {op.corretora ? <Text style={styles.opCorretora}>{op.corretora}</Text> : null}
          </View>
        )}

        {/* Nota number */}
        {op._notaNumero ? (
          <Text style={[styles.opDetail, { paddingLeft: 30, marginTop: 2, color: C.dim, fontSize: 10 }]}>
            {'Nota ' + op._notaNumero}
          </Text>
        ) : null}

        {/* Exercicio reference */}
        {isExercicio && op._tickerOpcao ? (
          <Text style={[styles.warningText, { color: C.etfs }]}>
            {'Exercício de ' + op._tickerOpcao}
          </Text>
        ) : null}

        {/* Strike estimated warning for opcoes */}
        {isOpcao && op._strikeEstimated ? (
          <Text style={styles.warningText}>
            Strike estimado pelo ticker. Confira o valor correto.
          </Text>
        ) : null}

        {/* Error message */}
        {status === 'error' && item.errors ? (
          <Text style={styles.errorText}>
            {item.errors.join(', ')}
          </Text>
        ) : null}
        {/* Possible duplicate warning */}
        {status === 'possible_duplicate' ? (
          <Text style={styles.warningText}>
            Mesmo ticker + data + tipo, quantidade ou preço diferente
          </Text>
        ) : null}
        {status === 'duplicate' ? (
          <Text style={styles.warningText}>
            {'Já existe ' + (isOpcao ? 'opção' : 'operação') + ' idêntica na carteira'}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  // ── Count by import type ──
  function countByImportType(iType) {
    var c = 0;
    for (var i = 0; i < parsedOps.length; i++) {
      var t = (parsedOps[i].op && parsedOps[i].op._importType) || 'operacao';
      if (t === iType) c++;
    }
    return c;
  }

  function renderStep2() {
    var totalNew = countByStatus('new');
    var totalDup = countByStatus('duplicate');
    var totalPoss = countByStatus('possible_duplicate');
    var totalErr = countByStatus('error');
    var totalSkip = countByStatus('skip');
    var selCount = countSelected();
    var totalOpcoes = countByImportType('opcao');
    var totalExercicios = countByImportType('exercicio');

    // Build list for FlatList
    var listData;
    if (filter === 'all') {
      listData = [];
      for (var i = 0; i < parsedOps.length; i++) {
        listData.push({ item: parsedOps[i], idx: i });
      }
    } else {
      listData = getFilteredOps();
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Summary header */}
        <Glass style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {parsedOps.length + ' operação' + (parsedOps.length > 1 ? 'ões' : '') + ' encontrada' + (parsedOps.length > 1 ? 's' : '')}
          </Text>
          {detectedFormat ? (
            <View style={[styles.formatBadge, { marginTop: 4 }]}>
              <Text style={styles.formatBadgeText}>
                {'Formato: ' + (detectedFormat === 'cei' ? 'CEI' : detectedFormat === 'b3' ? 'B3' : detectedFormat === 'nota' ? 'Nota de Corretagem' : detectedFormat === 'generic' ? 'Genérico' : 'Auto')}
              </Text>
            </View>
          ) : null}
          <View style={styles.summaryBadges}>
            {totalNew > 0 ? <Badge style={{ backgroundColor: C.green + '22' }}><Text style={{ color: C.green, fontSize: 10, fontFamily: F.mono }}>{totalNew + ' novas'}</Text></Badge> : null}
            {totalOpcoes > 0 ? <Badge style={{ backgroundColor: C.opcoes + '22' }}><Text style={{ color: C.opcoes, fontSize: 10, fontFamily: F.mono }}>{totalOpcoes + ' opções'}</Text></Badge> : null}
            {totalExercicios > 0 ? <Badge style={{ backgroundColor: C.etfs + '22' }}><Text style={{ color: C.etfs, fontSize: 10, fontFamily: F.mono }}>{totalExercicios + ' exercícios'}</Text></Badge> : null}
            {totalDup > 0 ? <Badge style={{ backgroundColor: C.red + '22' }}><Text style={{ color: C.red, fontSize: 10, fontFamily: F.mono }}>{totalDup + ' duplicadas'}</Text></Badge> : null}
            {totalPoss > 0 ? <Badge style={{ backgroundColor: C.yellow + '22' }}><Text style={{ color: C.yellow, fontSize: 10, fontFamily: F.mono }}>{totalPoss + ' possíveis'}</Text></Badge> : null}
            {totalErr > 0 ? <Badge style={{ backgroundColor: C.red + '22' }}><Text style={{ color: C.red, fontSize: 10, fontFamily: F.mono }}>{totalErr + ' erros'}</Text></Badge> : null}
            {totalSkip > 0 ? <Badge style={{ backgroundColor: C.dim + '22' }}><Text style={{ color: C.dim, fontSize: 10, fontFamily: F.mono }}>{totalSkip + ' ignoradas'}</Text></Badge> : null}
          </View>
        </Glass>

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPills}>
          {FILTERS.map(function(f) {
            var cnt = countByStatus(f.k);
            return (
              <Pill key={f.k} active={filter === f.k} color={C.accent}
                onPress={function() { setFilter(f.k); }}>
                {f.l + ' (' + cnt + ')'}
              </Pill>
            );
          })}
        </ScrollView>

        {/* Selection controls */}
        <View style={styles.selectionRow}>
          <TouchableOpacity onPress={selectAllNew}>
            <Text style={styles.selLink}>Selecionar novas</Text>
          </TouchableOpacity>
          <Text style={styles.selDivider}>|</Text>
          <TouchableOpacity onPress={selectAll}>
            <Text style={styles.selLink}>Todas</Text>
          </TouchableOpacity>
          <Text style={styles.selDivider}>|</Text>
          <TouchableOpacity onPress={deselectAll}>
            <Text style={styles.selLink}>Nenhuma</Text>
          </TouchableOpacity>
        </View>

        {/* Operations list */}
        <FlatList
          data={listData}
          keyExtractor={function(item, index) { return 'op_' + (item.idx !== undefined ? item.idx : index); }}
          renderItem={function(info) {
            return renderOpCard({ item: info.item.item, idx: info.item.idx, index: info.index });
          }}
          contentContainerStyle={{ paddingHorizontal: SIZE.padding, paddingBottom: 120 }}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          ListEmptyComponent={
            <EmptyState ionicon="search-outline" title="Nenhuma operação" subtitle="Nenhuma operação neste filtro." />
          }
        />

        {/* Import button (floating) */}
        <View style={styles.floatingBar}>
          <TouchableOpacity
            style={[styles.primaryBtn, (selCount === 0 || importing) && styles.btnDisabled]}
            onPress={handleImport}
            disabled={selCount === 0 || importing}
            accessibilityRole="button"
            accessibilityLabel={'Importar ' + selCount + ' operações'}
          >
            {importing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {'Importar ' + selCount + ' selecionada' + (selCount > 1 ? 's' : '')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════
  // ═══════ STEP 3: RESULT ════════════════
  // ══════════════════════════════════════════
  function renderStep3() {
    var inserted = result ? result.inserted : 0;
    var failed = result && result.failed ? result.failed : [];
    var counts = result && result.counts ? result.counts : {};

    return (
      <ScrollView style={styles.scrollContent}>
        {/* Success icon */}
        <View style={styles.resultIcon}>
          <Ionicons
            name={failed.length > 0 ? 'alert-circle' : 'checkmark-circle'}
            size={64}
            color={failed.length > 0 ? C.yellow : C.green}
          />
        </View>

        <Text style={styles.resultTitle}>Importação concluída</Text>

        <Glass style={styles.resultCard}>
          <View style={styles.resultRow}>
            <Ionicons name="checkmark-circle" size={18} color={C.green} />
            <Text style={styles.resultLabel}>{inserted + ' item' + (inserted > 1 ? 'ns' : '') + ' importado' + (inserted > 1 ? 's' : '')}</Text>
          </View>
          {/* Type breakdown */}
          {counts.operacao > 0 ? (
            <View style={[styles.resultRow, { marginTop: 6, paddingLeft: 26 }]}>
              <View style={[styles.tipoBadge, { backgroundColor: C.acoes + '22' }]}>
                <Text style={[styles.tipoBadgeText, { color: C.acoes }]}>AÇÃO</Text>
              </View>
              <Text style={[styles.resultLabel, { fontSize: 12 }]}>{counts.operacao + ' operação' + (counts.operacao > 1 ? 'ões' : '')}</Text>
            </View>
          ) : null}
          {counts.opcao > 0 ? (
            <View style={[styles.resultRow, { marginTop: 4, paddingLeft: 26 }]}>
              <View style={[styles.tipoBadge, { backgroundColor: C.opcoes + '22' }]}>
                <Text style={[styles.tipoBadgeText, { color: C.opcoes }]}>OPÇÃO</Text>
              </View>
              <Text style={[styles.resultLabel, { fontSize: 12 }]}>{counts.opcao + ' opção' + (counts.opcao > 1 ? 'ões' : '')}</Text>
            </View>
          ) : null}
          {counts.exercicio > 0 ? (
            <View style={[styles.resultRow, { marginTop: 4, paddingLeft: 26 }]}>
              <View style={[styles.tipoBadge, { backgroundColor: C.etfs + '22' }]}>
                <Text style={[styles.tipoBadgeText, { color: C.etfs }]}>EXERCÍCIO</Text>
              </View>
              <Text style={[styles.resultLabel, { fontSize: 12 }]}>{counts.exercicio + ' exercício' + (counts.exercicio > 1 ? 's' : '')}</Text>
            </View>
          ) : null}
          {failed.length > 0 ? (
            <View style={[styles.resultRow, { marginTop: 8 }]}>
              <Ionicons name="close-circle" size={18} color={C.red} />
              <Text style={[styles.resultLabel, { color: C.red }]}>{failed.length + ' erro' + (failed.length > 1 ? 's' : '')}</Text>
            </View>
          ) : null}
        </Glass>

        {/* Error details */}
        {failed.length > 0 ? (
          <Glass style={styles.errorCard}>
            <Text style={styles.errorCardTitle}>Erros</Text>
            {failed.map(function(f, i) {
              return (
                <Text key={'err_' + i} style={styles.errorItem}>
                  {'Linha ' + (f.index + 1) + ' (' + f.ticker + '): ' + f.error}
                </Text>
              );
            })}
          </Glass>
        ) : null}

        {/* Buttons */}
        <View style={styles.resultButtons}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={function() {
            setStep(1);
            setRawText('');
            setFileName('');
            setParsedOps([]);
            setSelected({});
            setResult(null);
            setFilter('all');
          }}>
            <Ionicons name="add-circle-outline" size={18} color={C.accent} />
            <Text style={styles.secondaryBtnText}>Importar mais</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={function() {
            navigation.goBack();
          }}>
            <Text style={styles.primaryBtnText}>Concluir</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ══════════════════════════════════════════
  // ═══════ RENDER ════════════════════════
  // ══════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() {
          if (step === 2 && !importing) {
            setStep(1);
          } else {
            navigation.goBack();
          }
        }} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name={step === 2 ? 'arrow-back' : 'close'} size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.headerTitle}>
            {step === 1 ? 'Importar Operações' : step === 2 ? 'Revisar Operações' : 'Resultado'}
          </Text>
          {step === 1 ? (
            <InfoTip
              title="Importação de Operações"
              text={'Aceita CSV do CEI, extrato da B3, nota de corretagem (PDF) e CSV genérico.' +
                '\n\n' +
                'CEI/B3 (cei.b3.com.br): importa ações, FIIs, ETFs, opções e exercícios. Futuros são ignorados.' +
                '\n\n' +
                'Nota PDF: copie o texto da nota de corretagem em PDF e cole. Extrai operações, opções e custos.' +
                '\n\n' +
                'Strikes de opções são estimados pelo ticker. Confira os valores após importar.'}
              size={15}
            />
          ) : null}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepBar}>
        {[1, 2, 3].map(function(s) {
          return (
            <View key={'step_' + s} style={[styles.stepDot, s <= step && styles.stepDotActive]} />
          );
        })}
      </View>

      {/* Content */}
      {step === 1 ? renderStep1() : step === 2 ? renderStep2() : renderStep3()}
    </View>
  );
}

// ══════════════════════════════════════════
// ═══════ STYLES ═════════════════════════
// ══════════════════════════════════════════
var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZE.padding,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: F.display,
    color: C.text,
  },
  stepBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 12,
  },
  stepDot: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.border,
  },
  stepDotActive: {
    backgroundColor: C.accent,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: SIZE.padding,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  helpCard: {
    padding: 14,
    marginBottom: 14,
  },
  helpText: {
    fontSize: 12,
    fontFamily: F.body,
    color: C.sub,
    flex: 1,
    lineHeight: 18,
  },
  fileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.accent + '44',
    borderRadius: SIZE.radius,
    borderStyle: 'dashed',
    marginBottom: 14,
  },
  fileBtnText: {
    fontSize: 14,
    fontFamily: F.body,
    color: C.accent,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerText: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.dim,
  },
  textArea: {
    minHeight: 180,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: SIZE.radius,
    padding: 14,
    fontSize: 12,
    fontFamily: F.mono,
    color: C.text,
    backgroundColor: C.card,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: SIZE.radius,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: F.display,
    color: 'white',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.accent + '44',
    borderRadius: SIZE.radius,
    paddingVertical: 14,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: F.display,
    color: C.accent,
  },
  // Step 2
  summaryCard: {
    padding: 14,
    marginHorizontal: SIZE.padding,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 16,
    fontFamily: F.display,
    color: C.text,
  },
  summaryBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  formatBadge: {
    backgroundColor: C.accent + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  formatBadgeText: {
    fontSize: 10,
    fontFamily: F.mono,
    color: C.accent,
  },
  filterPills: {
    paddingHorizontal: SIZE.padding,
    gap: 6,
    paddingBottom: 8,
    paddingTop: 4,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SIZE.padding,
    paddingBottom: 10,
  },
  selLink: {
    fontSize: 12,
    fontFamily: F.body,
    color: C.accent,
  },
  selDivider: {
    fontSize: 12,
    color: C.dim,
  },
  opCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  opCardSelected: {
    borderColor: C.accent + '44',
  },
  opCardSkip: {
    opacity: 0.5,
    borderColor: C.dim + '33',
  },
  opCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontFamily: F.mono,
    fontWeight: '700',
  },
  opDate: {
    fontSize: 11,
    fontFamily: F.mono,
    color: C.sub,
  },
  tipoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tipoBadgeText: {
    fontSize: 9,
    fontFamily: F.mono,
    fontWeight: '700',
  },
  opCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 30,
  },
  opTicker: {
    fontSize: 14,
    fontFamily: F.display,
    color: C.text,
    minWidth: 60,
  },
  opDetail: {
    fontSize: 12,
    fontFamily: F.mono,
    color: C.sub,
    flex: 1,
  },
  opCorretora: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.dim,
  },
  errorText: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.red,
    marginTop: 4,
    paddingLeft: 30,
  },
  warningText: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.yellow,
    marginTop: 4,
    paddingLeft: 30,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIZE.padding,
    paddingVertical: 12,
    backgroundColor: C.bg + 'ee',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  // Step 3
  resultIcon: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 22,
    fontFamily: F.display,
    color: C.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  resultCard: {
    padding: 16,
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultLabel: {
    fontSize: 14,
    fontFamily: F.body,
    color: C.text,
  },
  errorCard: {
    padding: 14,
    marginBottom: 16,
  },
  errorCardTitle: {
    fontSize: 13,
    fontFamily: F.display,
    color: C.red,
    marginBottom: 8,
  },
  errorItem: {
    fontSize: 11,
    fontFamily: F.mono,
    color: C.sub,
    marginBottom: 4,
  },
  resultButtons: {
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
});
