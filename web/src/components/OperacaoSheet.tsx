'use client';

// Sheet para cadastrar/editar operacao (compra/venda de ativo).
// Create: passar `trigger` custom. Edit: passar `initial` + `onClose` (sem trigger).
// Corretora eh select obrigatorio de `saldos_corretora` pre-cadastrado.
//
// Cripto: ChipGroup de moeda (USD/EUR/BRL) + botao inverter pra trocar par
// (BTC-USD <-> USD-BTC, BTC-BRL <-> BRL-BTC, etc). Ticker armazenado
// literalmente como o user digitou/inverteu — para fetch de preco no Yahoo
// usamos helper cryptoYahooTicker (normaliza pra CRIPTO-FIAT).

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseMoneyValue } from '@/components/MoneyInput';
import { TickerSearch } from '@/components/TickerSearch';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useAppStore } from '@/store';
import { InstituicaoPicker } from '@/components/InstituicaoPicker';
import { ChipGroup } from '@/components/ChipGroup';
import { canonicalName, isKnownInstituicao } from '@/lib/instituicoes';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';

var supabase = getSupabaseBrowser();

type TipoOp = 'compra' | 'venda';
type Categoria = 'acao' | 'fii' | 'etf' | 'bdr' | 'stock_int' | 'adr' | 'reit' | 'cripto';
type QuoteMoeda = 'USD' | 'EUR' | 'BRL';

var MOEDAS_FIAT: QuoteMoeda[] = ['USD', 'EUR', 'BRL'];

// Mercado derivado da categoria
function mercadoDe(c: Categoria): 'BR' | 'INT' | 'CRIPTO' {
  if (c === 'cripto') return 'CRIPTO';
  if (c === 'stock_int' || c === 'adr' || c === 'reit') return 'INT';
  return 'BR';
}

// Moeda em que preco/custos sao digitados e persistidos.
function moedaDePreco(categoria: Categoria, quote: QuoteMoeda): QuoteMoeda {
  if (categoria === 'cripto') return quote;
  var m = mercadoDe(categoria);
  return m === 'INT' ? 'USD' : 'BRL';
}

// Simbolo pra exibicao
function simboloMoeda(m: QuoteMoeda): string {
  if (m === 'USD') return 'US$';
  if (m === 'EUR') return '€';
  return 'R$';
}

function localeMoeda(m: QuoteMoeda): string {
  return m === 'BRL' ? 'pt-BR' : 'en-US';
}

// filterTipo para TickerSearch
function filterTipoDe(c: Categoria): 'stock' | 'fii' | 'etf' | 'bdr' | 'stock_int' | 'adr' | 'reit' | 'cripto' {
  if (c === 'acao') return 'stock';
  if (c === 'fii') return 'fii';
  if (c === 'etf') return 'etf';
  if (c === 'bdr') return 'bdr';
  if (c === 'stock_int') return 'stock_int';
  if (c === 'adr') return 'adr';
  if (c === 'cripto') return 'cripto';
  return 'reit';
}

// Retorna se o par esta invertido (fiat primeiro, cripto depois). Ex: USD-BTC.
function isInverted(tk: string): boolean {
  var upper = tk.toUpperCase();
  var parts = upper.split('-');
  if (parts.length !== 2) return false;
  return MOEDAS_FIAT.indexOf(parts[0] as QuoteMoeda) >= 0
      && MOEDAS_FIAT.indexOf(parts[1] as QuoteMoeda) < 0;
}

// Inverte par A-B para B-A. Se nao tiver hifen, aplica quoteMoeda como fiat
// e inverte (ex: BTC + USD -> USD-BTC).
function invertPair(tk: string, quote: QuoteMoeda): string {
  var upper = tk.trim().toUpperCase();
  if (!upper) return upper;
  if (upper.indexOf('-') < 0) {
    // So symbol crypto — inverte pra FIAT-SYMBOL
    return quote + '-' + upper;
  }
  var parts = upper.split('-');
  if (parts.length !== 2) return upper;
  return parts[1] + '-' + parts[0];
}

export interface OperacaoInitial {
  id: string;
  ticker: string;
  tipo: TipoOp;
  categoria: Categoria;
  quantidade: number;
  preco: number;
  custos: number;
  corretora: string | null;
  data: string;
  mercado: 'BR' | 'INT' | 'CRIPTO';
  portfolio_id: string | null;
  moeda_quote?: string | null;
  taxa_cambio?: number | null;
}

interface Props {
  userId: string | undefined;
  trigger?: React.ReactNode;
  initial?: OperacaoInitial;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Le sufixo do ticker (BTC-USD -> USD, USD-BTC -> USD). Fallback 'USD'.
function quoteFromTicker(tk: string): QuoteMoeda {
  var upper = tk.toUpperCase();
  var parts = upper.split('-');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (MOEDAS_FIAT.indexOf(p as QuoteMoeda) >= 0) return p as QuoteMoeda;
  }
  return 'USD';
}

export function OperacaoSheet({ userId, trigger, initial, open: openProp, onOpenChange }: Props) {
  var portfolios = useAppStore(function (s) { return s.portfolios; });
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var qc = useQueryClient();

  // Modo controlado (edit) vs nao-controlado (create)
  var _openUncontrolled = useState(false);
  var open = openProp !== undefined ? openProp : _openUncontrolled[0];
  var setOpen = onOpenChange || _openUncontrolled[1];

  var isEdit = !!initial;
  var today = new Date().toISOString().substring(0, 10);

  var _tipo = useState<TipoOp>(initial ? initial.tipo : 'compra'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _categoria = useState<Categoria>(initial ? initial.categoria : 'acao'); var categoria = _categoria[0]; var setCategoria = _categoria[1];
  var _ticker = useState(initial ? initial.ticker : ''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _qty = useState(initial ? String(initial.quantidade).replace('.', ',') : ''); var qty = _qty[0]; var setQty = _qty[1];
  var _preco = useState(initial ? String(initial.preco).replace('.', ',') : ''); var preco = _preco[0]; var setPreco = _preco[1];
  var _custos = useState(initial ? String(initial.custos || 0).replace('.', ',') : ''); var custos = _custos[0]; var setCustos = _custos[1];
  var _corretora = useState<string>(initial && initial.corretora ? initial.corretora : ''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _data = useState(initial ? (initial.data ? initial.data.substring(0, 10) : today) : today); var data = _data[0]; var setData = _data[1];
  var _pf = useState<string>(initial ? (initial.portfolio_id || '__null__') : (selectedPortfolio || '__null__')); var pf = _pf[0]; var setPf = _pf[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  // Cripto-specific: moeda quote e ticker invertido
  var _quoteMoeda = useState<QuoteMoeda>(function () {
    if (initial && initial.categoria === 'cripto') {
      var mq = initial.moeda_quote;
      if (mq === 'USD' || mq === 'EUR' || mq === 'BRL') return mq;
      return quoteFromTicker(initial.ticker);
    }
    return 'USD';
  });
  var quoteMoeda = _quoteMoeda[0]; var setQuoteMoeda = _quoteMoeda[1];

  // Reseta quando abre em modo create
  useEffect(function () {
    if (!open) return;
    if (isEdit) return;
    setTipo('compra'); setCategoria('acao'); setTicker(''); setQty(''); setPreco(''); setCustos('');
    setCorretora(''); setData(today); setPf(selectedPortfolio || '__null__'); setErr(null);
    setQuoteMoeda('USD');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mercado derivado
  var mercado: 'BR' | 'INT' | 'CRIPTO' = mercadoDe(categoria);
  var moedaPreco: QuoteMoeda = moedaDePreco(categoria, quoteMoeda);
  var parInvertido = categoria === 'cripto' && isInverted(ticker);

  function handleInverter() {
    setTicker(invertPair(ticker, quoteMoeda));
  }

  async function submit() {
    if (!userId) { setErr('Sessão inválida'); return; }
    var tk = ticker.trim().toUpperCase();

    // Cripto: auto-append sufixo se user so digitou o symbol
    if (categoria === 'cripto' && tk.indexOf('-') < 0) {
      tk = tk + '-' + quoteMoeda;
    }

    if (!tk) { setErr('Ticker obrigatório'); return; }
    if (!/^[A-Z0-9.\-]{1,15}$/.test(tk)) { setErr('Ticker inválido'); return; }

    var q = parseFloat(qty.replace(',', '.'));
    var pParsed = parseMoneyValue(preco);
    var p = pParsed === null ? NaN : pParsed;
    if (!q || q <= 0) { setErr('Quantidade inválida'); return; }
    if (!p || p <= 0) { setErr('Preço inválido'); return; }

    var cParsed = custos ? parseMoneyValue(custos) : 0;
    var c = cParsed === null ? NaN : cParsed;
    if (c < 0) { setErr('Custos não podem ser negativos'); return; }
    if (!data) { setErr('Data obrigatória'); return; }

    var corrCanon = canonicalName(corretora);
    if (!corrCanon) { setErr('Informe a corretora'); return; }
    if (!isKnownInstituicao(corrCanon)) {
      setErr('Corretora não reconhecida. Selecione da lista ou fale com o suporte pra incluir.');
      return;
    }

    setSubmitting(true); setErr(null);
    try {
      // Busca taxa de cambio quando moeda != BRL (pra apuracao de IR depois)
      var taxaCambio: number | null = null;
      if (moedaPreco !== 'BRL') {
        try {
          var fxRes = await fetch('/api/fx?from=' + moedaPreco + '&to=BRL&date=' + data);
          if (fxRes.ok) {
            var fxJson = await fxRes.json();
            var r = Number(fxJson && fxJson.rate);
            if (Number.isFinite(r) && r > 0) taxaCambio = r;
          }
        } catch {}
      }

      var payload: Record<string, unknown> = {
        user_id: userId,
        ticker: tk,
        tipo: tipo,
        categoria: categoria,
        quantidade: q,
        preco: p,
        custo_corretagem: c,
        custo_emolumentos: 0,
        custo_impostos: 0,
        corretora: corrCanon,
        data: data,
        mercado: mercado,
        portfolio_id: pf === '__null__' ? null : pf,
        moeda_quote: moedaPreco,
        taxa_cambio: taxaCambio,
      };

      var result;
      if (isEdit && initial) {
        result = await supabase.from('operacoes').update(payload).eq('id', initial.id).eq('user_id', userId);
      } else {
        result = await supabase.from('operacoes').insert(payload);
      }

      if (result.error) {
        setErr(result.error.message);
        setSubmitting(false);
        return;
      }

      await qc.invalidateQueries({ queryKey: ['operacoes-raw'] });
      await qc.invalidateQueries({ queryKey: ['positions'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !initial || !userId) return;
    if (!confirm('Remover esta operação? Ação irreversível.')) return;
    setSubmitting(true); setErr(null);
    try {
      var result = await supabase.from('operacoes').delete().eq('id', initial.id).eq('user_id', userId);
      if (result.error) { setErr(result.error.message); setSubmitting(false); return; }
      await qc.invalidateQueries({ queryKey: ['operacoes-raw'] });
      await qc.invalidateQueries({ queryKey: ['positions'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao remover');
    } finally {
      setSubmitting(false);
    }
  }

  var isCripto = categoria === 'cripto';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ? (
        <SheetTrigger render={trigger as any} />
      ) : null}
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-page border-l border-white/10">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar operação' : 'Nova operação'}</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Compra ou venda de ativo. Afeta saldo da corretora automaticamente.
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Tipo">
            <ChipGroup<TipoOp>
              value={tipo}
              onChange={setTipo}
              options={[
                { value: 'compra', label: 'Compra', color: 'blue' },
                { value: 'venda', label: 'Venda', color: 'green' },
              ]}
            />
          </Field>

          <Field label="Categoria">
            <ChipGroup<Categoria>
              value={categoria}
              onChange={function (v) { setCategoria(v); setCorretora(''); setTicker(''); }}
              cols={4}
              options={[
                { value: 'acao', label: 'Ação', color: 'orange' },
                { value: 'fii', label: 'FII', color: 'green' },
                { value: 'etf', label: 'ETF BR', color: 'yellow' },
                { value: 'bdr', label: 'BDR', color: 'pink' },
                { value: 'stock_int', label: 'Stock INT', color: 'purple' },
                { value: 'adr', label: 'ADR', color: 'purple' },
                { value: 'reit', label: 'REIT', color: 'blue' },
                { value: 'cripto', label: 'Cripto', color: 'pink' },
              ]}
            />
          </Field>

          {isCripto ? (
            <Field label="Moeda de cotação">
              <ChipGroup<QuoteMoeda>
                value={quoteMoeda}
                onChange={setQuoteMoeda}
                cols={3}
                options={[
                  { value: 'USD', label: 'USD (US$)', color: 'blue' },
                  { value: 'EUR', label: 'EUR (€)', color: 'purple' },
                  { value: 'BRL', label: 'BRL (R$)', color: 'green' },
                ]}
              />
            </Field>
          ) : null}

          <Field label="Ticker">
            {isCripto ? (
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0">
                  <TickerSearch
                    value={ticker}
                    onChange={setTicker}
                    mercado={mercado}
                    filterTipo={filterTipoDe(categoria)}
                    placeholder={parInvertido ? (quoteMoeda + '-BTC') : 'BTC, ETH, SOL'}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleInverter}
                  className="shrink-0 px-3 border border-white/10 hover:bg-white/5"
                  title={parInvertido ? 'Voltar pra par normal (ex: BTC-USD)' : 'Inverter par (ex: USD-BTC)'}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <TickerSearch
                value={ticker}
                onChange={setTicker}
                mercado={mercado}
                filterTipo={filterTipoDe(categoria)}
                placeholder={
                  categoria === 'fii' ? 'VGIP11' :
                  categoria === 'etf' ? 'BOVA11' :
                  categoria === 'bdr' ? 'AAPL34' :
                  categoria === 'adr' ? 'PBR, VALE' :
                  categoria === 'reit' ? 'O, STAG' :
                  mercado === 'INT' ? 'AAPL' : 'PETR4'
                }
              />
            )}
            {isCripto && parInvertido ? (
              <p className="mt-1 text-[10px] text-white/40">
                Par invertido: {quoteMoeda} como base (ex: {quoteMoeda}-BTC).
              </p>
            ) : null}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade">
              <Input
                value={qty}
                onChange={function (e) { setQty(e.target.value); }}
                placeholder="100"
                inputMode="decimal"
              />
            </Field>
            <Field label={'Preço (' + simboloMoeda(moedaPreco) + ')'}>
              <MoneyInput
                value={preco}
                onChange={setPreco}
                moeda={moedaPreco}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Custos (opcional)">
              <MoneyInput
                value={custos}
                onChange={setCustos}
                moeda={moedaPreco}
              />
            </Field>
            <Field label="Data">
              <Input
                type="date"
                value={data}
                onChange={function (e) { setData(e.target.value); }}
              />
            </Field>
          </div>

          {/* Preview do total */}
          {(function () {
            var qp = parseFloat(qty.replace(',', '.'));
            var pp = parseMoneyValue(preco);
            if (pp === null || isNaN(qp) || pp <= 0 || qp <= 0) return null;
            var cp = custos ? (parseMoneyValue(custos) || 0) : 0;
            var bruto = qp * pp;
            var total = tipo === 'compra' ? bruto + cp : bruto - cp;
            var moedaSym = simboloMoeda(moedaPreco);
            var locale = localeMoeda(moedaPreco);
            var corCard = tipo === 'compra' ? 'border-danger/20 bg-danger/5' : 'border-income/20 bg-income/5';
            var corValor = tipo === 'compra' ? 'text-danger' : 'text-income';
            var sinal = tipo === 'compra' ? '-' : '+';
            return (
              <div className={'rounded-md border px-3 py-2.5 space-y-1 ' + corCard}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">Bruto</span>
                  <span className="text-[11px] font-mono text-white/60">{moedaSym} {bruto.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {cp > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Custos</span>
                    <span className="text-[11px] font-mono text-white/60">{moedaSym} {cp.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                  <span className="text-[11px] text-white/60 font-medium">{tipo === 'compra' ? 'Total a pagar' : 'Total a receber'}</span>
                  <span className={'text-sm font-mono font-semibold ' + corValor}>
                    {sinal}{moedaSym} {total.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })()}

          <Field label="Corretora">
            <InstituicaoPicker
              value={corretora}
              onChange={setCorretora}
              placeholder="Busque a corretora…"
              filterTipo={mercado === 'CRIPTO' ? ['corretora', 'cripto'] : ['corretora', 'banco']}
            />
          </Field>

          {portfolios.length > 0 ? (
            <Field label="Carteira">
              <select
                value={pf}
                onChange={function (e) { setPf(e.target.value); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-[6px] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="__null__">Padrão</option>
                {portfolios.map(function (p) {
                  return <option key={p.id} value={p.id}>{p.nome}</option>;
                })}
              </select>
            </Field>
          ) : null}

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
                className="text-red-400 hover:bg-red-500/10"
                onClick={handleDelete}
                disabled={submitting}
              >
                Remover
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
              {submitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
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
