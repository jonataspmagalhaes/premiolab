'use client';

// Picker strict de instituicao (banco/corretora/cripto). Aceita APENAS valores
// da lista curada em lib/instituicoes.ts. Se user nao encontra, deve contatar
// suporte pra incluir. Valor retornado sempre eh canonico.

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { searchInstituicoes, paisLabel, tipoLabel, type Instituicao, type InstituicaoPais, type InstituicaoTipo } from '@/lib/instituicoes';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  // Filtros opcionais pra restringir sugestoes (ex: so BR, so corretoras)
  filterPais?: InstituicaoPais[];
  filterTipo?: InstituicaoTipo[];
  inputId?: string;
}

export function InstituicaoPicker(props: Props) {
  var _showSug = useState(false);
  var showSug = _showSug[0];
  var setShowSug = _showSug[1];

  var sugestoes = useMemo(function () {
    if (!showSug) return [] as Instituicao[];
    var list = searchInstituicoes(props.value, 20);
    if (props.filterPais) {
      list = list.filter(function (i) { return props.filterPais!.indexOf(i.pais) >= 0; });
    }
    if (props.filterTipo) {
      list = list.filter(function (i) { return props.filterTipo!.indexOf(i.tipo) >= 0; });
    }
    return list.slice(0, 10);
  }, [props.value, props.filterPais, props.filterTipo, showSug]);

  return (
    <div className="relative">
      <Input
        id={props.inputId}
        value={props.value}
        onChange={function (e) { props.onChange(e.target.value); setShowSug(true); }}
        onFocus={function () { setShowSug(true); }}
        onBlur={function () { setTimeout(function () { setShowSug(false); }, 150); }}
        placeholder={props.placeholder || 'Buscar banco ou corretora…'}
        autoComplete="off"
        autoFocus={props.autoFocus}
      />
      {showSug ? (
        <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-white/10 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
          {sugestoes.length > 0 ? (
            sugestoes.map(function (inst) {
              return (
                <button
                  key={inst.nome}
                  type="button"
                  onMouseDown={function (e) { e.preventDefault(); props.onChange(inst.nome); setShowSug(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] text-left transition"
                >
                  <span className="text-sm">{paisLabel(inst.pais)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white truncate">{inst.nome}</p>
                    <p className="text-[10px] text-white/40 font-mono">{tipoLabel(inst.tipo)}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-center">
              <p className="text-[12px] text-white/60 mb-2">
                Não encontrou sua instituição?
              </p>
              <a
                href="mailto:suporte@premiolab.com.br?subject=Solicitar%20inclus%C3%A3o%20de%20institui%C3%A7%C3%A3o"
                className="text-[11px] text-orange-300 hover:text-orange-200 underline"
                onMouseDown={function (e) { e.stopPropagation(); }}
              >
                Fale com o suporte pra incluir
              </a>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
