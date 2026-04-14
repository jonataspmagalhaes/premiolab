'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';

const supabase = getSupabaseBrowser();

// Sync e long-running (~2-5min). Em vez de esperar a resposta (que o browser mata em ~60s),
// disparamos a invocacao e fazemos polling em `proventos` pra detectar linhas novas.

export function SyncProventosButton({ userId }: { userId: string | undefined }) {
  var qc = useQueryClient();
  var _state = useState<'idle' | 'running' | 'ok' | 'err'>('idle');
  var state = _state[0]; var setState = _state[1];
  var _msg = useState<string | null>(null); var msg = _msg[0]; var setMsg = _msg[1];
  var _pollId = useState<NodeJS.Timeout | null>(null); var pollId = _pollId[0]; var setPollId = _pollId[1];

  useEffect(function () {
    return function () {
      if (pollId) clearInterval(pollId);
    };
  }, [pollId]);

  async function countProventos(): Promise<number> {
    if (!userId) return 0;
    var r = await supabase
      .from('proventos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    return r.count || 0;
  }

  function startPolling(baseline: number, startedAt: number) {
    var elapsed = 0;
    var lastCount = baseline;
    var stallTicks = 0;
    var iv = setInterval(async function () {
      elapsed = Date.now() - startedAt;
      try {
        var n = await countProventos();
        var delta = n - baseline;

        if (n > lastCount) {
          stallTicks = 0;
          lastCount = n;
          setMsg('Sincronizando... ' + delta + ' novo(s) ate agora (' + Math.floor(elapsed / 1000) + 's)');
          await qc.invalidateQueries({ queryKey: ['proventos'] });
        } else {
          stallTicks++;
        }

        // Termina se 3 ticks seguidos sem mudanca apos pelo menos 45s
        // OU passou de 6 min no total (timeout maximo)
        if ((stallTicks >= 3 && elapsed > 45000) || elapsed > 360000) {
          clearInterval(iv);
          setPollId(null);
          setState('ok');
          setMsg(delta > 0
            ? delta + ' novo(s) provento(s) sincronizado(s)'
            : 'Sem novidades encontradas');
          await qc.invalidateQueries({ queryKey: ['proventos'] });
          setTimeout(function () { setState('idle'); setMsg(null); }, 10000);
        } else {
          setMsg('Sincronizando... ' + (delta > 0 ? delta + ' novo(s) — ' : '') + Math.floor(elapsed / 1000) + 's');
        }
      } catch (e) {
        // Polling error nao deve derrubar — segue
        console.warn('poll error:', e);
      }
    }, 5000);
    setPollId(iv);
  }

  async function sync() {
    if (!userId || state === 'running') return;
    setState('running');
    setMsg('Iniciando...');
    var baseline = await countProventos();
    var startedAt = Date.now();

    // Dispara a edge function em fire-and-forget. Nao esperamos response
    // (browser timeout em ~60s mata o fetch, mas o server continua rodando).
    supabase.functions.invoke('sync-proventos-cron', {
      body: { user_id: userId },
    }).catch(function (e) {
      // Timeout/network error sao esperados pra sync longo. Polling cuida do resto.
      console.info('invoke finished/timeout (esperado):', e && e.message);
    });

    startPolling(baseline, startedAt);
  }

  var icon = state === 'running'
    ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
    : state === 'ok'
    ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
    : state === 'err'
    ? <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-red-400" />
    : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />;

  var label = state === 'running'
    ? 'Sincronizando...'
    : state === 'ok'
    ? 'Sincronizado'
    : state === 'err'
    ? 'Erro'
    : 'Sincronizar';

  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span className={'text-[11px] font-mono ' + (state === 'err' ? 'text-red-300' : state === 'ok' ? 'text-emerald-300' : 'text-white/50')}>
          {msg}
        </span>
      ) : null}
      <Button
        size="sm"
        onClick={sync}
        disabled={state === 'running' || !userId}
        variant="ghost"
        className="text-white/70 hover:text-white border border-white/[0.08] hover:border-white/[0.15]"
      >
        {icon}
        {label}
      </Button>
    </div>
  );
}
