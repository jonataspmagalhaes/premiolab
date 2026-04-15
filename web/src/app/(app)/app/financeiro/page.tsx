'use client';

// Caixa — fonte de verdade dos saldos por conta (banco/corretora).
// Saldo eh editavel inline; merge unifica duplicatas renomeando a coluna
// `corretora` em operacoes/proventos/opcoes, somando saldos e deletando a origem.

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { useUser } from '@/lib/queries';
import { AddContaSheet } from '@/components/AddContaSheet';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { canonicalName } from '@/lib/instituicoes';

var supabase = getSupabaseBrowser();

function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function fmtMoeda(v: number, moeda: string) {
  var m = moeda || 'BRL';
  if (m === 'BRL') return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (m === 'USD') return 'US$ ' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return m + ' ' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseValor(s: string): number | null {
  var clean = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  var n = parseFloat(clean);
  if (isNaN(n)) return null;
  return n;
}

// Normaliza pra detectar duplicatas: lowercase, sem acento, sem espaco, sem pontuacao
function normKey(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(investimentos?|bank|invest|corretora|s\.?a\.?)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

type SaldoUI = { id?: string; name: string; saldo: number; moeda?: string; tipo?: string };

// ───── Row com edit + delete + merge ─────

function SaldoRow({
  saldo,
  userId,
  candidates,
}: {
  saldo: SaldoUI;
  userId: string;
  candidates: SaldoUI[]; // outras contas com mesma moeda, pra merge
}) {
  var qc = useQueryClient();
  var _editing = useState(false); var editing = _editing[0]; var setEditing = _editing[1];
  var _valor = useState(''); var valor = _valor[0]; var setValor = _valor[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _mergeOpen = useState(false); var mergeOpen = _mergeOpen[0]; var setMergeOpen = _mergeOpen[1];
  var _mergeDest = useState<string>(''); var mergeDest = _mergeDest[0]; var setMergeDest = _mergeDest[1];
  var _merging = useState(false); var merging = _merging[0]; var setMerging = _merging[1];
  var _renaming = useState(false); var renaming = _renaming[0]; var setRenaming = _renaming[1];
  var _newName = useState(''); var newName = _newName[0]; var setNewName = _newName[1];
  var _renameLoading = useState(false); var renameLoading = _renameLoading[0]; var setRenameLoading = _renameLoading[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  var moeda = saldo.moeda || 'BRL';
  var valorFmt = fmtMoeda(saldo.saldo, moeda);
  var displayName = saldo.name && saldo.name.trim() ? saldo.name : '(sem nome)';

  function startEdit() {
    setValor(String(saldo.saldo).replace('.', ','));
    setEditing(true);
  }

  async function save() {
    var novo = parseValor(valor);
    if (novo === null || novo < 0) return;
    setSaving(true);
    try {
      await supabase
        .from('saldos_corretora')
        .update({ saldo: novo })
        .eq('id', saldo.id)
        .eq('user_id', userId);
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function startRename() {
    var sugestao = canonicalName(saldo.name || '');
    setNewName(sugestao || saldo.name || '');
    setRenaming(true);
  }

  // Rename com cascata; se destino ja existe (mesma moeda), vira merge automaticamente.
  async function saveRename() {
    var target = newName.trim();
    if (!target) return;
    var oldName = saldo.name || '';
    if (target === oldName) { setRenaming(false); return; }

    setRenameLoading(true);
    try {
      // Checa se ja existe conta com esse nome + mesma moeda
      var existing = candidates.filter(function (c) {
        return (c.name || '').toLowerCase().trim() === target.toLowerCase();
      })[0];

      if (existing) {
        // Merge: soma saldos no existente, renomeia cascata, deleta origem
        var confirmMsg = 'Já existe "' + existing.name + '" (mesma moeda).\n\n' +
                         'Mesclar esta conta em "' + existing.name + '"?\n' +
                         '• Saldo somado: ' + fmtMoeda(saldo.saldo + existing.saldo, moeda) + '\n' +
                         '• Operações/opções/proventos transferidos\n' +
                         '• Esta conta será removida';
        if (!confirm(confirmMsg)) { setRenameLoading(false); return; }

        await supabase.from('saldos_corretora')
          .update({ saldo: existing.saldo + saldo.saldo })
          .eq('id', existing.id).eq('user_id', userId);

        if (oldName) {
          await supabase.from('operacoes').update({ corretora: existing.name }).eq('user_id', userId).eq('corretora', oldName);
          await supabase.from('proventos').update({ corretora: existing.name }).eq('user_id', userId).eq('corretora', oldName);
          await supabase.from('opcoes').update({ corretora: existing.name }).eq('user_id', userId).eq('corretora', oldName);
        }
        await supabase.from('saldos_corretora').delete().eq('id', saldo.id).eq('user_id', userId);
      } else {
        // Rename puro
        await supabase.from('saldos_corretora')
          .update({ corretora: target })
          .eq('id', saldo.id).eq('user_id', userId);

        if (oldName) {
          await supabase.from('operacoes').update({ corretora: target }).eq('user_id', userId).eq('corretora', oldName);
          await supabase.from('proventos').update({ corretora: target }).eq('user_id', userId).eq('corretora', oldName);
          await supabase.from('opcoes').update({ corretora: target }).eq('user_id', userId).eq('corretora', oldName);
        }
      }

      await qc.invalidateQueries({ queryKey: ['saldos'] });
      await qc.invalidateQueries({ queryKey: ['operacoes-raw'] });
      await qc.invalidateQueries({ queryKey: ['positions'] });
      await qc.invalidateQueries({ queryKey: ['proventos'] });
      await qc.invalidateQueries({ queryKey: ['opcoes'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      setRenaming(false);
    } finally {
      setRenameLoading(false);
    }
  }

  async function remove() {
    if (!confirm('Remover ' + displayName + '? Isso não afeta operações/proventos dessa corretora.')) return;
    await supabase
      .from('saldos_corretora')
      .delete()
      .eq('id', saldo.id)
      .eq('user_id', userId);
    await qc.invalidateQueries({ queryKey: ['saldos'] });
  }

  // Merge: soma saldo.saldo ao destino, renomeia `corretora` em
  // operacoes/proventos/opcoes, deleta esta conta.
  async function executeMerge() {
    var dest = candidates.filter(function (c) { return c.id === mergeDest; })[0];
    if (!dest) { setErr('Conta destino não encontrada (selecione no dropdown)'); return; }
    setMerging(true); setErr(null);
    try {
      var step = '';

      step = 'atualizar saldo do destino';
      var r1 = await supabase
        .from('saldos_corretora')
        .update({ saldo: dest.saldo + saldo.saldo })
        .eq('id', dest.id)
        .eq('user_id', userId);
      if (r1.error) throw new Error(step + ': ' + r1.error.message);

      if (saldo.name && saldo.name.trim()) {
        step = 'mover operações';
        var r2 = await supabase.from('operacoes').update({ corretora: dest.name }).eq('user_id', userId).eq('corretora', saldo.name);
        if (r2.error) throw new Error(step + ': ' + r2.error.message);

        step = 'mover proventos';
        var r3 = await supabase.from('proventos').update({ corretora: dest.name }).eq('user_id', userId).eq('corretora', saldo.name);
        if (r3.error) throw new Error(step + ': ' + r3.error.message);

        step = 'mover opções';
        var r4 = await supabase.from('opcoes').update({ corretora: dest.name }).eq('user_id', userId).eq('corretora', saldo.name);
        if (r4.error) throw new Error(step + ': ' + r4.error.message);
      }

      step = 'remover conta de origem';
      var r5 = await supabase.from('saldos_corretora').delete().eq('id', saldo.id).eq('user_id', userId);
      if (r5.error) throw new Error(step + ': ' + r5.error.message);

      await qc.invalidateQueries({ queryKey: ['saldos'] });
      await qc.invalidateQueries({ queryKey: ['operacoes-raw'] });
      await qc.invalidateQueries({ queryKey: ['positions'] });
      await qc.invalidateQueries({ queryKey: ['proventos'] });
      await qc.invalidateQueries({ queryKey: ['opcoes'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      setMergeOpen(false);
    } catch (e: any) {
      setErr(e && e.message ? e.message : 'Erro desconhecido');
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="bg-white/[0.02] rounded-lg px-3 py-2.5 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-[10px] font-bold text-orange-400 shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className={'text-xs font-semibold truncate ' + (saldo.name && saldo.name.trim() ? '' : 'text-white/40 italic')}>{displayName}</p>
            <p className="text-[10px] text-white/25 font-mono">
              {moeda}{saldo.tipo ? ' · ' + saldo.tipo : ''}
            </p>
          </div>
        </div>

        {editing ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={valor}
              onChange={function (e) { setValor(e.target.value); }}
              onKeyDown={function (e) { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus
              className="w-28 bg-white/[0.04] border border-orange-500/40 rounded-md px-2 py-1 text-xs font-mono text-white focus:outline-none"
              placeholder="0,00"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-6 h-6 rounded-md bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 flex items-center justify-center"
              aria-label="Salvar"
            >
              <Ico d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={function () { setEditing(false); }}
              disabled={saving}
              className="w-6 h-6 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white/50 flex items-center justify-center"
              aria-label="Cancelar"
            >
              <Ico d="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono font-semibold">{valorFmt}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
              <button
                type="button"
                onClick={startRename}
                className="w-6 h-6 rounded-md hover:bg-purple-500/10 text-white/40 hover:text-purple-300 flex items-center justify-center"
                aria-label="Renomear"
                title="Renomear (se conta-alvo já existir, mescla automaticamente)"
              >
                <Ico d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3 h-3" />
              </button>
              {candidates.length > 0 ? (
                <button
                  type="button"
                  onClick={function () { setMergeOpen(!mergeOpen); setMergeDest(candidates[0].id || ''); }}
                  className="w-6 h-6 rounded-md hover:bg-info/10 text-white/40 hover:text-info flex items-center justify-center"
                  aria-label="Mesclar"
                  title="Mesclar em outra conta existente"
                >
                  <Ico d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5M16.5 3L21 7.5m0 0L16.5 12M21 7.5H7.5" className="w-3 h-3" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={startEdit}
                className="w-6 h-6 rounded-md hover:bg-white/[0.05] text-white/40 hover:text-white/80 flex items-center justify-center"
                aria-label="Editar"
              >
                <Ico d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={remove}
                className="w-6 h-6 rounded-md hover:bg-red-500/10 text-white/40 hover:text-red-400 flex items-center justify-center"
                aria-label="Remover"
              >
                <Ico d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22m-5 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Erro */}
      {err ? (
        <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-300 flex items-center justify-between gap-2">
          <span className="flex-1">❌ {err}</span>
          <button type="button" onClick={function () { setErr(null); }} className="text-white/40 hover:text-white/80 shrink-0">✕</button>
        </div>
      ) : null}

      {/* Painel inline de rename */}
      {renaming ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-white/50 shrink-0">Renomear para:</span>
          <input
            type="text"
            value={newName}
            onChange={function (e) { setNewName(e.target.value); }}
            onKeyDown={function (e) { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
            autoFocus
            className="flex-1 min-w-0 bg-white/[0.04] border border-purple-400/40 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
            placeholder="Nome canônico"
          />
          <button
            type="button"
            onClick={saveRename}
            disabled={renameLoading || !newName.trim()}
            className="px-3 py-1 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black text-[11px] font-semibold"
          >
            {renameLoading ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={function () { setRenaming(false); }}
            className="px-2 py-1 rounded-md bg-white/[0.05] text-white/50 text-[11px]"
          >
            Cancelar
          </button>
        </div>
      ) : null}

      {/* Painel inline de merge */}
      {mergeOpen ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/50 shrink-0">Mesclar "{displayName}" em:</span>
            <select
              value={mergeDest}
              onChange={function (e) { setMergeDest(e.target.value); }}
              className="flex-1 min-w-0 bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
            >
              {candidates.map(function (c) {
                return <option key={c.id} value={c.id}>{c.name} — {fmtMoeda(c.saldo, c.moeda || 'BRL')}</option>;
              })}
            </select>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <span className="text-[10px] text-orange-300/70 flex-1">
              Saldo final: {fmtMoeda(saldo.saldo + (function () {
                var d = candidates.filter(function (c) { return c.id === mergeDest; })[0];
                return d ? d.saldo : 0;
              })(), moeda)}
            </span>
            <button
              type="button"
              onClick={executeMerge}
              disabled={merging || !mergeDest}
              className="px-3 py-1 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black text-[11px] font-semibold"
            >
              {merging ? 'Mesclando…' : 'Mesclar'}
            </button>
            <button
              type="button"
              onClick={function () { setMergeOpen(false); }}
              className="px-2 py-1 rounded-md bg-white/[0.05] text-white/50 text-[11px]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ───── Page ─────

export default function CaixaPage() {
  var saldos = useAppStore(function (s) { return s.saldos; });
  var _user = useUser();
  var userId = _user.data ? _user.data.id : undefined;

  // Totais por moeda (multi-moeda)
  var totaisPorMoeda = useMemo(function () {
    var map: Record<string, number> = {};
    for (var i = 0; i < saldos.length; i++) {
      var s = saldos[i];
      var m = s.moeda || 'BRL';
      map[m] = (map[m] || 0) + (s.saldo || 0);
    }
    return map;
  }, [saldos]);

  // Detecta grupos de possiveis duplicatas (normKey igual, mesma moeda)
  var duplicatas = useMemo(function () {
    var groups: Record<string, SaldoUI[]> = {};
    for (var i = 0; i < saldos.length; i++) {
      var s = saldos[i] as SaldoUI;
      if (!s.name || !s.name.trim()) continue;
      var canon = canonicalName(s.name);
      var key = normKey(canon) + '|' + (s.moeda || 'BRL');
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    var out: SaldoUI[][] = [];
    var keys = Object.keys(groups);
    for (var j = 0; j < keys.length; j++) {
      if (groups[keys[j]].length > 1) out.push(groups[keys[j]]);
    }
    return out;
  }, [saldos]);

  // Map id -> candidatos pra merge (mesma moeda, outro id)
  var candidatesByid = useMemo(function () {
    var map: Record<string, SaldoUI[]> = {};
    for (var i = 0; i < saldos.length; i++) {
      var s = saldos[i] as SaldoUI;
      var moeda = s.moeda || 'BRL';
      map[s.id || ''] = saldos.filter(function (o) {
        return o.id !== s.id && (o.moeda || 'BRL') === moeda && o.name && o.name.trim();
      }) as SaldoUI[];
    }
    return map;
  }, [saldos]);

  var moedaKeys = Object.keys(totaisPorMoeda);

  return (
    <div className="relative z-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 anim-up">
        <div>
          <h1 className="text-xl font-bold mb-1">Caixa</h1>
          <p className="text-xs text-white/40">
            Saldos das suas contas. Use para conferir cobertura de PUTs e patrimônio em caixa.
          </p>
        </div>
        {userId ? <AddContaSheet userId={userId} /> : null}
      </div>

      {/* Alerta de duplicatas */}
      {duplicatas.length > 0 ? (
        <div className="linear-card rounded-xl p-4 mb-5 anim-up border border-orange-500/30 bg-orange-500/5">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
              <Ico d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-orange-300 mb-1">
                {duplicatas.length} possível{duplicatas.length > 1 ? 'is' : ''} duplicata{duplicatas.length > 1 ? 's' : ''} detectada{duplicatas.length > 1 ? 's' : ''}
              </p>
              <p className="text-[11px] text-white/50 mb-2">
                Contas com nomes parecidos na mesma moeda. Passe o mouse sobre a conta e clique no ícone de mesclar para unificar.
              </p>
              <div className="space-y-1">
                {duplicatas.map(function (group, idx) {
                  return (
                    <p key={idx} className="text-[11px] text-white/70 font-mono">
                      {group.map(function (g) { return g.name; }).join(' ↔ ')}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Totais por moeda */}
      {saldos.length > 0 ? (
        <div className={'grid gap-3 mb-6 ' + (moedaKeys.length === 1 ? 'grid-cols-1' : moedaKeys.length === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-' + Math.min(moedaKeys.length, 4))}>
          {moedaKeys.map(function (m, idx) {
            var colorClass = m === 'BRL' ? 'text-income' : m === 'USD' ? 'text-stock-int' : 'text-info';
            return (
              <div key={m} className={'linear-card rounded-xl p-4 anim-up d' + ((idx % 4) + 1)}>
                <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Total {m}</p>
                <p className={'text-xl font-mono font-bold ' + colorClass}>{fmtMoeda(totaisPorMoeda[m], m)}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Lista */}
      <div className="linear-card rounded-xl p-5 anim-up">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-income/10 flex items-center justify-center">
            <Ico d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" className="w-4 h-4 text-income" />
          </div>
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Contas</span>
          <span className="text-[10px] text-white/25 font-mono ml-auto">{saldos.length}</span>
        </div>

        {saldos.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-xl bg-white/[0.03] flex items-center justify-center mb-4">
              <Ico d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" className="w-6 h-6 text-white/30" />
            </div>
            <p className="text-sm text-white/60 mb-1 font-medium">Nenhuma conta cadastrada</p>
            <p className="text-xs text-white/30 max-w-sm">
              Adicione suas contas (banco ou corretora) para acompanhar saldo disponível e validar cobertura de opções.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {saldos.map(function (c, idx) {
              if (!userId) return null;
              return (
                <SaldoRow
                  key={c.id || idx}
                  saldo={c as SaldoUI}
                  userId={userId}
                  candidates={candidatesByid[c.id || ''] || []}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
