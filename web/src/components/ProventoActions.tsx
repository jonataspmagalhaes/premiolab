'use client';

import { useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Check, X } from 'lucide-react';

const supabase = getSupabaseBrowser();

interface Props {
  proventoId: number;
  ticker: string;
  tipo: string;
  valorPorCota: number;
  quantidade: number;
  dataPagamento: string;
  onChange?: () => void;
}

export function ProventoActions(props: Props) {
  var qc = useQueryClient();
  var _mode = useState<'idle' | 'edit' | 'confirm-delete'>('idle');
  var mode = _mode[0]; var setMode = _mode[1];
  var _valor = useState(String(props.valorPorCota)); var valor = _valor[0]; var setValor = _valor[1];
  var _qty = useState(String(props.quantidade)); var qty = _qty[0]; var setQty = _qty[1];
  var _data = useState(props.dataPagamento); var data = _data[0]; var setData = _data[1];
  var _busy = useState(false); var busy = _busy[0]; var setBusy = _busy[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  async function save() {
    setBusy(true); setErr(null);
    var v = parseFloat(valor.replace(',', '.'));
    var q = parseFloat(qty.replace(',', '.'));
    if (!v || v <= 0 || v > 1000) { setErr('Valor invalido'); setBusy(false); return; }
    if (!q || q <= 0 || q > 1000000) { setErr('Quantidade invalida'); setBusy(false); return; }
    if (!data) { setErr('Data obrigatoria'); setBusy(false); return; }

    var r = await supabase.from('proventos').update({
      valor_por_cota: v,
      quantidade: q,
      data_pagamento: data,
      data_com: data,
    }).eq('id', props.proventoId);

    if (r.error) { setErr(r.error.message); setBusy(false); return; }
    await qc.invalidateQueries({ queryKey: ['proventos'] });
    if (props.onChange) props.onChange();
    setMode('idle');
    setBusy(false);
  }

  async function remove() {
    setBusy(true); setErr(null);
    var r = await supabase.from('proventos').delete().eq('id', props.proventoId);
    if (r.error) { setErr(r.error.message); setBusy(false); return; }
    await qc.invalidateQueries({ queryKey: ['proventos'] });
    if (props.onChange) props.onChange();
    setMode('idle');
    setBusy(false);
  }

  if (mode === 'edit') {
    return (
      <div className="flex items-center gap-1 flex-wrap" onClick={function (e) { e.stopPropagation(); }}>
        <input
          type="text"
          value={valor}
          onChange={function (e) { setValor(e.target.value); }}
          className="w-16 bg-white/[0.04] border border-white/[0.1] rounded px-1.5 py-0.5 text-[11px] font-mono text-white"
          placeholder="valor"
        />
        <span className="text-[9px] text-white/40">×</span>
        <input
          type="text"
          value={qty}
          onChange={function (e) { setQty(e.target.value); }}
          className="w-16 bg-white/[0.04] border border-white/[0.1] rounded px-1.5 py-0.5 text-[11px] font-mono text-white"
          placeholder="qtd"
        />
        <input
          type="date"
          value={data}
          onChange={function (e) { setData(e.target.value); }}
          className="bg-white/[0.04] border border-white/[0.1] rounded px-1.5 py-0.5 text-[11px] font-mono text-white"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="p-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition"
          title="Salvar"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={function () { setMode('idle'); setErr(null); }}
          disabled={busy}
          className="p-1 rounded bg-white/[0.05] text-white/60 hover:bg-white/[0.1] transition"
          title="Cancelar"
        >
          <X className="w-3 h-3" />
        </button>
        {err ? <span className="text-[10px] text-red-300 w-full">{err}</span> : null}
      </div>
    );
  }

  if (mode === 'confirm-delete') {
    return (
      <div className="flex items-center gap-1" onClick={function (e) { e.stopPropagation(); }}>
        <span className="text-[10px] text-red-300">Excluir?</span>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="p-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition"
          title="Confirmar"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={function () { setMode('idle'); }}
          disabled={busy}
          className="p-1 rounded bg-white/[0.05] text-white/60 hover:bg-white/[0.1] transition"
          title="Cancelar"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition" onClick={function (e) { e.stopPropagation(); }}>
      <button
        type="button"
        onClick={function () { setMode('edit'); }}
        className="p-1 rounded text-white/40 hover:text-white hover:bg-white/[0.08] transition"
        title="Editar"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={function () { setMode('confirm-delete'); }}
        className="p-1 rounded text-white/40 hover:text-red-300 hover:bg-red-500/10 transition"
        title="Excluir"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
