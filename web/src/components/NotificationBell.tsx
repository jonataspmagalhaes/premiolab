'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, X, CheckCheck } from 'lucide-react';
import { useAppStore } from '@/store';
import { valorLiquido, tipoLabel } from '@/lib/proventosUtils';

var STORAGE_KEY = 'premiolab_dismissed_notifs_v1';

function fmtBRL(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(d: Date): number {
  var diff = d.getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

// Carrega IDs dispensados do localStorage, limpa os cujo pagamento ja passou
function loadDismissed(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    var obj = JSON.parse(raw) as Record<string, number>;
    var now = Date.now();
    var clean: Record<string, number> = {};
    // mantem so os cujo ts de pagamento ainda eh no futuro
    for (var k of Object.keys(obj)) {
      if (obj[k] > now) clean[k] = obj[k];
    }
    if (Object.keys(clean).length !== Object.keys(obj).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch (_) {
    return {};
  }
}

function saveDismissed(d: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch (_) { /* noop */ }
}

export function NotificationBell() {
  var proventos = useAppStore(function (s) { return s.proventos; });
  var _open = useState(false); var open = _open[0]; var setOpen = _open[1];
  var _dismissed = useState<Record<string, number>>({}); var dismissed = _dismissed[0]; var setDismissed = _dismissed[1];
  var ref = useRef<HTMLDivElement>(null);

  useEffect(function () { setDismissed(loadDismissed()); }, []);

  var all = useMemo(function () {
    var now = Date.now();
    var in30d = now + 30 * 86400000;
    return proventos
      .map(function (pv) {
        var d = new Date(pv.data_pagamento);
        var id = String(pv.id || (pv.ticker + '|' + pv.data_pagamento));
        return {
          id: id,
          ticker: pv.ticker,
          tipo_provento: pv.tipo_provento,
          valor_total: pv.valor_total || 0,
          valor_liquido: valorLiquido(pv.valor_total || 0, pv.tipo_provento, pv.ticker),
          date: d,
          ts: d.getTime(),
          days: daysUntil(d),
        };
      })
      .filter(function (x) { return x.ts > now && x.ts < in30d; })
      .sort(function (a, b) { return a.ts - b.ts; });
  }, [proventos]);

  var upcoming = useMemo(function () {
    return all.filter(function (u) { return !dismissed[u.id]; });
  }, [all, dismissed]);

  var imminentCount = upcoming.filter(function (u) { return u.days <= 7; }).length;
  var totalLiquido = upcoming.reduce(function (s, x) { return s + x.valor_liquido; }, 0);

  function dismissOne(id: string, ts: number) {
    var updated = Object.assign({}, dismissed);
    updated[id] = ts;
    setDismissed(updated);
    saveDismissed(updated);
  }

  function dismissAll() {
    var updated = Object.assign({}, dismissed);
    all.forEach(function (u) { updated[u.id] = u.ts; });
    setDismissed(updated);
    saveDismissed(updated);
  }

  useEffect(function () {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return function () { document.removeEventListener('mousedown', onClick); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={function () { setOpen(!open); }}
        className="relative p-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white transition"
        aria-label="Notificações"
      >
        <Bell className="w-4 h-4" />
        {imminentCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none border border-page">
            {imminentCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] overflow-y-auto rounded-xl bg-page/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl z-50">
          <div className="p-3 border-b border-white/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">Próximos proventos</h3>
              <div className="flex items-center gap-2">
                {upcoming.length > 0 ? (
                  <button
                    type="button"
                    onClick={dismissAll}
                    className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white transition"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>marcar lidas</span>
                  </button>
                ) : null}
                <span className="text-[10px] text-white/40 font-mono">30d</span>
              </div>
            </div>
            {upcoming.length > 0 ? (
              <p className="text-[11px] text-white/50 mt-1">
                Total previsto: <span className="font-mono font-semibold text-income">R$ {fmtBRL(totalLiquido)}</span>
              </p>
            ) : null}
          </div>

          {upcoming.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[12px] text-white/40">
                {all.length > 0 ? 'Tudo lido ✓' : 'Sem proventos previstos pra 30 dias.'}
              </p>
              {all.length > 0 ? (
                <button
                  type="button"
                  onClick={function () { setDismissed({}); saveDismissed({}); }}
                  className="text-[10px] text-white/50 hover:text-white mt-2 transition"
                >
                  desfazer
                </button>
              ) : null}
            </div>
          ) : (
            <div className="p-2">
              {upcoming.map(function (u) {
                var urgent = u.days <= 3;
                var soon = u.days <= 7;
                return (
                  <div
                    key={u.id}
                    className={'group flex items-center justify-between px-2 py-2 rounded-lg transition ' +
                      (urgent ? 'bg-red-500/[0.04] hover:bg-red-500/[0.08]' : 'hover:bg-white/[0.03]')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold">{u.ticker}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-white/60 font-mono uppercase">
                          {tipoLabel(u.tipo_provento)}
                        </span>
                      </div>
                      <p className={'text-[10px] leading-tight mt-0.5 ' + (urgent ? 'text-red-300' : soon ? 'text-amber-300' : 'text-white/40')}>
                        {u.days === 0 ? 'hoje' : u.days === 1 ? 'amanhã' : 'em ' + u.days + ' dias'} · {fmtDateShort(u.date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[12px] font-mono font-semibold text-income">R$ {fmtBRL(u.valor_liquido)}</span>
                      <button
                        type="button"
                        onClick={function () { dismissOne(u.id, u.ts); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/40 hover:text-white hover:bg-white/[0.08] transition"
                        aria-label="Dispensar"
                        title="Dispensar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Link
            href="/app/renda"
            onClick={function () { setOpen(false); }}
            className="block p-2.5 border-t border-white/[0.06] text-[11px] text-center text-white/50 hover:text-white hover:bg-white/[0.03] transition"
          >
            Ver todos os proventos →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
