'use client';

// Hook React que monta IRInput a partir do store e retorna IRAnualResult
// memoizado por ano.

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { useOperacoesRaw, useUser } from '@/lib/queries';
import { computeIRAnual, DEFAULT_PREJUIZO } from './index';
import type { IRAnualResult, OperacaoRaw } from './types';

export function useIR(year: number): { data: IRAnualResult | null; isLoading: boolean } {
  var user = useUser();
  var opsQuery = useOperacoesRaw(user.data?.id);
  var proventos = useAppStore(function (s) { return s.proventos; });
  var opcoes = useAppStore(function (s) { return s.opcoes; });
  var rf = useAppStore(function (s) { return s.rf; });

  var data = useMemo<IRAnualResult | null>(function () {
    if (!opsQuery.data) return null;
    var ops = opsQuery.data as unknown as OperacaoRaw[];
    var opsCripto: OperacaoRaw[] = [];
    var opsNaoCripto: OperacaoRaw[] = [];
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      var cat = (o.categoria || '').toLowerCase();
      if (cat === 'cripto') opsCripto.push(o);
      else opsNaoCripto.push(o);
    }

    return computeIRAnual({
      year: year,
      operacoes: opsNaoCripto,
      operacoesCripto: opsCripto,
      proventos: proventos,
      opcoes: opcoes,
      rendaFixa: rf,
      prejuizoAnterior: DEFAULT_PREJUIZO,   // TODO: buscar de profiles.prejuizo_anterior
    });
  }, [opsQuery.data, proventos, opcoes, rf, year]);

  return {
    data: data,
    isLoading: opsQuery.isLoading,
  };
}
