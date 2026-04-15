'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseMoneyValue } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { searchInstituicoes, canonicalName, tipoLabel, paisLabel, type Instituicao, type InstituicaoTipo } from '@/lib/instituicoes';

var supabase = getSupabaseBrowser();

type Tipo = 'corretora' | 'banco' | 'cripto';
type Moeda = 'BRL' | 'USD';

// parseValor delegado ao MoneyInput (parseMoneyValue importado)

function tipoFromInst(t: InstituicaoTipo): Tipo {
  return t;
}

export function AddContaSheet({ userId }: { userId: string }) {
  var qc = useQueryClient();

  var _open = useState(false); var open = _open[0]; var setOpen = _open[1];
  var _nome = useState(''); var nome = _nome[0]; var setNome = _nome[1];
  var _showSug = useState(false); var showSug = _showSug[0]; var setShowSug = _showSug[1];
  var _tipo = useState<Tipo>('corretora'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _moeda = useState<Moeda>('BRL'); var moeda = _moeda[0]; var setMoeda = _moeda[1];
  var _saldo = useState(''); var saldo = _saldo[0]; var setSaldo = _saldo[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  function reset() {
    setNome(''); setTipo('corretora'); setMoeda('BRL'); setSaldo(''); setErr(null); setShowSug(false);
  }

  function pickInst(inst: Instituicao) {
    setNome(inst.nome);
    setTipo(tipoFromInst(inst.tipo));
    if (inst.pais === 'US') setMoeda('USD');
    else if (inst.pais === 'BR') setMoeda('BRL');
    setShowSug(false);
  }

  async function submit() {
    var canon = canonicalName(nome);
    if (!canon) { setErr('Nome obrigatório'); return; }
    var valor = saldo ? parseMoneyValue(saldo) : 0;
    if (valor === null || valor < 0) { setErr('Saldo inválido'); return; }

    setSubmitting(true); setErr(null);
    try {
      // DB aceita apenas 'corretora' | 'banco' na coluna tipo (CHECK constraint).
      // Mapeamos 'cripto' -> 'corretora' para manter UX rica sem migration.
      var tipoDb = tipo === 'cripto' ? 'corretora' : tipo;
      var result = await supabase.from('saldos_corretora').insert({
        user_id: userId,
        corretora: canon,
        tipo: tipoDb,
        moeda: moeda,
        saldo: valor,
      });
      if (result.error) {
        setErr(result.error.message);
        setSubmitting(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      reset();
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  var sugestoes = showSug ? searchInstituicoes(nome, 8) : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            size="sm"
            className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nova conta
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-page border-l border-white/10">
        <SheetHeader>
          <SheetTitle>Adicionar conta</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Cadastre bancos e corretoras para acompanhar o caixa disponível.
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Instituição">
            <div className="relative">
              <Input
                value={nome}
                onChange={function (e) { setNome(e.target.value); setShowSug(true); }}
                onFocus={function () { setShowSug(true); }}
                onBlur={function () { setTimeout(function () { setShowSug(false); }, 150); }}
                placeholder="Ex: XP, Nubank, Nomad…"
                autoFocus
              />
              {showSug && sugestoes.length > 0 ? (
                <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-white/10 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  {sugestoes.map(function (inst) {
                    return (
                      <button
                        key={inst.nome}
                        type="button"
                        onMouseDown={function (e) { e.preventDefault(); pickInst(inst); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] text-left transition"
                      >
                        <span className="text-sm">{paisLabel(inst.pais)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-white truncate">{inst.nome}</p>
                          <p className="text-[10px] text-white/40 font-mono">{tipoLabel(inst.tipo)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </Field>

          <Field label="Tipo">
            <div className="flex gap-1.5">
              {(['corretora', 'banco', 'cripto'] as Tipo[]).map(function (t) {
                var active = tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={function () { setTipo(t); }}
                    className={'flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition capitalize ' +
                      (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moeda">
              <div className="flex gap-1.5">
                {(['BRL', 'USD'] as Moeda[]).map(function (m) {
                  var active = moeda === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={function () { setMoeda(m); }}
                      className={'flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-mono font-medium transition ' +
                        (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Saldo inicial">
              <MoneyInput
                value={saldo}
                onChange={setSaldo}
                moeda={moeda}
                placeholder={moeda === 'USD' ? '0.00' : '0,00'}
              />
            </Field>
          </div>

          {err ? (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] text-red-300">
              {err}
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={function () { setOpen(false); }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-semibold"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1.5">{label}</span>
      {children}
    </label>
  );
}
