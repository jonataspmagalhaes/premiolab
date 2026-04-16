'use client';

import { useDrift } from '@/hooks/useDrift';
import { AporteSimulator } from './AporteSimulator';

interface Props {
  userId: string | undefined;
  onEditMetas: () => void;
}

// Card compacto pro right column da Carteira — simulador sempre visivel,
// sem precisar abrir o drawer. Mostra mensagem clara se nao tem metas ainda.

export function SimuladorCard({ userId, onEditMetas }: Props) {
  const drift = useDrift(userId);

  return (
    <div className="linear-card rounded-xl p-5 anim-up">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider flex-1">Simulador de aporte</span>
      </div>

      {!drift.hasTargets ? (
        <div className="space-y-3">
          <p className="text-[12px] text-white/55 leading-relaxed">
            Defina metas pra usar o simulador. Ele calcula o que comprar pra fechar os gaps com o valor que voce vai aportar.
          </p>
          <button
            type="button"
            onClick={onEditMetas}
            className="w-full px-3 py-2 rounded-lg bg-orange-500/15 border border-orange-500/25 text-orange-300 text-[12px] font-semibold hover:bg-orange-500/25 transition"
          >
            Definir metas
          </button>
        </div>
      ) : (
        <AporteSimulator targets={drift.targets} total={drift.total} />
      )}
    </div>
  );
}
