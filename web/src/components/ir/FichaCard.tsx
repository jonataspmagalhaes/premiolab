'use client';

// FichaCard + FichaLinha — replica visual das fichas do programa IRPF
// com botao "Copiar" em cada linha e no cabecalho (copia ficha inteira).
//
// Objetivo: usuario olha a tela do PremioLab lado-a-lado com o programa
// IRPF e copia campo a campo com 1 clique.

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { fmtBRL } from '@/lib/fmt';

export interface FichaLinhaData {
  // Campos exibidos no padrao IRPF
  codigo?: string;              // ex: "09", "26", "10"
  beneficiario?: string;        // Titular / Dependente
  cnpjCpf?: string;             // CNPJ pagador (pontuacao mantida)
  nomeFonte?: string;           // Razao social / descricao da fonte
  valor: number;                // valor em BRL
  // Campos opcionais (algumas fichas pedem)
  irRetidoFonte?: number;       // Ficha 10
  detalhes?: string[];          // linhas extras de contexto (corretora, data, etc)
}

interface FichaCardProps {
  ficha: string;                // "09" | "10" | "17" | "Renda Variavel"
  titulo: string;               // "Rendimentos Isentos e Nao Tributaveis"
  subtitulo?: string;           // "Ficha 09"
  cor?: 'emerald' | 'amber' | 'info' | 'red' | 'orange';
  linhas: FichaLinhaData[];
  footerTotal?: boolean;        // mostra total ao final
  empty?: string;
}

var COR_STYLES = {
  emerald: { border: 'border-emerald-500/25', headerBg: 'bg-emerald-500/[0.05]', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  amber: { border: 'border-amber-500/25', headerBg: 'bg-amber-500/[0.05]', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  info: { border: 'border-info/25', headerBg: 'bg-info/[0.05]', badge: 'bg-info/15 text-info border-info/30' },
  red: { border: 'border-red-500/25', headerBg: 'bg-red-500/[0.05]', badge: 'bg-red-500/15 text-red-300 border-red-500/30' },
  orange: { border: 'border-orange-500/25', headerBg: 'bg-orange-500/[0.05]', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
};

function linhaParaTexto(l: FichaLinhaData): string {
  var partes: string[] = [];
  if (l.codigo) partes.push('Codigo: ' + l.codigo);
  if (l.beneficiario) partes.push('Beneficiario: ' + l.beneficiario);
  if (l.cnpjCpf) partes.push('CNPJ: ' + l.cnpjCpf);
  if (l.nomeFonte) partes.push('Fonte: ' + l.nomeFonte);
  partes.push('Valor: R$ ' + fmtBRL(l.valor));
  if (l.irRetidoFonte != null && l.irRetidoFonte > 0) {
    partes.push('IR Fonte: R$ ' + fmtBRL(l.irRetidoFonte));
  }
  return partes.join(' | ');
}

function fichaParaTexto(ficha: string, titulo: string, linhas: FichaLinhaData[]): string {
  var out: string[] = [];
  out.push('=== FICHA ' + ficha + ' — ' + titulo + ' ===');
  out.push('');
  linhas.forEach(function (l, i) {
    out.push('Linha ' + (i + 1) + ':');
    out.push('  ' + linhaParaTexto(l));
    if (l.detalhes && l.detalhes.length > 0) {
      l.detalhes.forEach(function (d) { out.push('  (' + d + ')'); });
    }
    out.push('');
  });
  var total = linhas.reduce(function (a, l) { return a + l.valor; }, 0);
  out.push('Total: R$ ' + fmtBRL(total));
  return out.join('\n');
}

export function FichaCard(props: FichaCardProps) {
  var cor = COR_STYLES[props.cor || 'emerald'];
  var total = props.linhas.reduce(function (a, l) { return a + l.valor; }, 0);

  var _copied = useState<string | null>(null);
  var copied = _copied[0];
  var setCopied = _copied[1];

  function copiarLinha(l: FichaLinhaData, idx: number) {
    var texto = linhaParaTexto(l);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () {
        setCopied('linha-' + idx);
        setTimeout(function () { setCopied(null); }, 2000);
      });
    }
  }

  function copiarFicha() {
    var texto = fichaParaTexto(props.ficha, props.titulo, props.linhas);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () {
        setCopied('ficha');
        setTimeout(function () { setCopied(null); }, 2000);
      });
    }
  }

  return (
    <div className={'linear-card rounded-xl border ' + cor.border}>
      <div className={'px-4 py-3 border-b ' + cor.border + ' ' + cor.headerBg}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ' + cor.badge}>
                Ficha {props.ficha}
              </span>
              {props.subtitulo ? <span className="text-[10px] text-white/50">{props.subtitulo}</span> : null}
            </div>
            <p className="text-[13px] font-semibold text-white/90 mt-1">{props.titulo}</p>
          </div>
          <button
            type="button"
            onClick={copiarFicha}
            disabled={props.linhas.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-white/[0.04] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.08] disabled:opacity-40 transition shrink-0"
          >
            {copied === 'ficha' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'ficha' ? 'Copiado!' : 'Copiar ficha'}
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        {props.linhas.length === 0 ? (
          <p className="text-[12px] text-white/30 italic py-4 text-center">
            {props.empty || 'Nenhum item nesta ficha.'}
          </p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {props.linhas.map(function (l, i) {
              return (
                <FichaLinha
                  key={i}
                  linha={l}
                  onCopiar={function () { copiarLinha(l, i); }}
                  copied={copied === 'linha-' + i}
                />
              );
            })}
          </div>
        )}

        {props.footerTotal && props.linhas.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-white/50 font-mono">Total da ficha</span>
            <span className="text-[14px] font-mono font-bold text-white/90">R$ {fmtBRL(total)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FichaLinha(props: { linha: FichaLinhaData; onCopiar: () => void; copied: boolean }) {
  var l = props.linha;
  return (
    <div className="py-2.5 flex items-start justify-between gap-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {l.codigo ? (
            <span className="font-mono font-bold text-orange-300">Cod. {l.codigo}</span>
          ) : null}
          {l.beneficiario ? (
            <>
              <span className="text-white/30">·</span>
              <span className="text-white/60">{l.beneficiario}</span>
            </>
          ) : null}
          {l.cnpjCpf && l.cnpjCpf !== '—' ? (
            <>
              <span className="text-white/30">·</span>
              <span className="font-mono text-white/50 text-[10px]">{l.cnpjCpf}</span>
            </>
          ) : null}
        </div>
        {l.nomeFonte ? (
          <p className="text-[12px] text-white/80 mt-0.5 leading-snug">{l.nomeFonte}</p>
        ) : null}
        {l.detalhes && l.detalhes.length > 0 ? (
          <p className="text-[10px] text-white/40 mt-0.5">
            {l.detalhes.join(' · ')}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-[13px] font-mono font-semibold">R$ {fmtBRL(l.valor)}</p>
          {l.irRetidoFonte != null && l.irRetidoFonte > 0 ? (
            <p className="text-[10px] font-mono text-red-300">IR R$ {fmtBRL(l.irRetidoFonte)}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={props.onCopiar}
          className="p-1.5 rounded hover:bg-white/[0.06] transition opacity-60 group-hover:opacity-100"
          title="Copiar esta linha"
        >
          {props.copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-300" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-white/50" />
          )}
        </button>
      </div>
    </div>
  );
}
