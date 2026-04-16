'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseMoneyValue } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Minus, Trash2 } from 'lucide-react';
import { InstituicaoPicker } from '@/components/InstituicaoPicker';
import { ChipGroup } from '@/components/ChipGroup';
import { canonicalName, isKnownInstituicao } from '@/lib/instituicoes';
import type { Caixa } from '@/store';

var supabase = getSupabaseBrowser();

type Tipo = 'aporte' | 'saida';
type Moeda = 'BRL' | 'USD';

interface Props {
  userId: string;
  entry?: Caixa | null;           // edit mode se presente
  open?: boolean;                 // controlado externamente (edit)
  onOpenChange?: (v: boolean) => void;
  trigger?: React.ReactElement;   // custom trigger (default: botao "+ Caixa")
}

function todayIso(): string {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

export function CaixaSheet(props: Props) {
  var userId = props.userId;
  var entry = props.entry || null;
  var isEdit = !!entry;
  var qc = useQueryClient();

  var _openInternal = useState(false);
  var openInternal = _openInternal[0];
  var setOpenInternal = _openInternal[1];
  var open = props.open !== undefined ? props.open : openInternal;
  var setOpen = props.onOpenChange || setOpenInternal;

  var initialTipo: Tipo = entry && entry.valor < 0 ? 'saida' : 'aporte';
  var initialMoeda: Moeda = (entry && entry.moeda === 'USD') ? 'USD' : 'BRL';

  var _tipo = useState<Tipo>(initialTipo); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _corretora = useState(entry ? entry.corretora : ''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _moeda = useState<Moeda>(initialMoeda); var moeda = _moeda[0]; var setMoeda = _moeda[1];
  var _valor = useState(entry ? String(Math.abs(entry.valor)).replace('.', ',') : '');
  var valor = _valor[0]; var setValor = _valor[1];
  var _data = useState(entry ? entry.data : todayIso()); var data = _data[0]; var setData = _data[1];
  var _descricao = useState(entry && entry.descricao ? entry.descricao : ''); var descricao = _descricao[0]; var setDescricao = _descricao[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  // Reset quando abre em modo add
  useEffect(function () {
    if (open && !isEdit) {
      setTipo('aporte');
      setCorretora('');
      setMoeda('BRL');
      setValor('');
      setData(todayIso());
      setDescricao('');
      setErr(null);
    }
  }, [open, isEdit]);

  async function submit() {
    var corr = canonicalName(corretora);
    if (!corr) { setErr('Informe o banco/corretora'); return; }
    if (!isKnownInstituicao(corr)) {
      setErr('Instituição não reconhecida. Selecione da lista ou fale com o suporte pra incluir.');
      return;
    }
    var n = parseMoneyValue(valor);
    if (n === null || n <= 0) { setErr('Valor inválido'); return; }
    if (!data) { setErr('Data inválida'); return; }

    var valorSigned = tipo === 'saida' ? -n : n;

    setSubmitting(true); setErr(null);
    try {
      var payload = {
        user_id: userId,
        corretora: corr,
        moeda: moeda,
        valor: valorSigned,
        data: data,
        descricao: descricao.trim() || null,
      };
      var result;
      if (isEdit && entry) {
        result = await supabase.from('caixa').update(payload).eq('id', entry.id).eq('user_id', userId);
      } else {
        result = await supabase.from('caixa').insert(payload);
      }
      if (result.error) {
        setErr(result.error.message);
        setSubmitting(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['caixa'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !entry) return;
    if (!confirm('Excluir este lançamento de caixa?')) return;
    setSubmitting(true); setErr(null);
    try {
      var result = await supabase.from('caixa').delete().eq('id', entry.id).eq('user_id', userId);
      if (result.error) { setErr(result.error.message); setSubmitting(false); return; }
      await qc.invalidateQueries({ queryKey: ['caixa'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao excluir');
    } finally {
      setSubmitting(false);
    }
  }

  var defaultTrigger = (
    <Button
      size="sm"
      className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40"
    >
      <Wallet className="w-3.5 h-3.5 mr-1.5" />
      Caixa
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {props.open === undefined ? (
        <SheetTrigger render={props.trigger || defaultTrigger} />
      ) : null}
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-page border-l border-white/10">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar caixa' : 'Adicionar caixa'}</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Aporte ou saída de caixa por banco/corretora. Saldo = soma dos lançamentos.
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Tipo">
            <ChipGroup<Tipo>
              value={tipo}
              onChange={setTipo}
              options={[
                { value: 'aporte', label: 'Aporte', color: 'green' },
                { value: 'saida', label: 'Saída', color: 'red' },
              ]}
              icon={function (o) { return o.value === 'aporte' ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />; }}
            />
          </Field>

          <Field label="Banco / Corretora">
            <InstituicaoPicker
              value={corretora}
              onChange={setCorretora}
              placeholder="Ex: Itaú, Nubank, XP, Inter…"
              autoFocus={!isEdit}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moeda">
              <ChipGroup<Moeda>
                value={moeda}
                onChange={setMoeda}
                options={[
                  { value: 'BRL', label: 'BRL' },
                  { value: 'USD', label: 'USD' },
                ]}
              />
            </Field>
            <Field label="Valor">
              <MoneyInput
                value={valor}
                onChange={setValor}
                moeda={moeda}
                placeholder={moeda === 'USD' ? '0.00' : '0,00'}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <Input
                type="date"
                value={data}
                onChange={function (e) { setData(e.target.value); }}
                max={todayIso()}
              />
            </Field>
            <Field label="Descrição (opcional)">
              <Input
                value={descricao}
                onChange={function (e) { setDescricao(e.target.value); }}
                placeholder="Ex: salário, FGTS, uso…"
                maxLength={80}
              />
            </Field>
          </div>

          {err ? (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] text-red-300">
              {err}
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-300 hover:bg-red-500/10"
                onClick={handleDelete}
                disabled={submitting}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Excluir
              </Button>
            ) : null}
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
