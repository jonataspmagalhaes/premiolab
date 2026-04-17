'use client';

// Context compartilhado de ano-base em todas as sub-rotas de /app/ir.
// Persistido em localStorage pra o user nao perder o ano ao navegar.

import { createContext, useContext, useEffect, useState } from 'react';

interface IRYearContextValue {
  year: number;
  setYear: (y: number) => void;
  anosDisponiveis: number[];
}

var CTX = createContext<IRYearContextValue | null>(null);

var STORAGE_KEY = 'premiolab-ir-year';

function loadStoredYear(defaultY: number): number {
  if (typeof window === 'undefined') return defaultY;
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultY;
    var n = parseInt(raw, 10);
    if (!isNaN(n) && n > 2000 && n < 2100) return n;
  } catch { /* ignore */ }
  return defaultY;
}

export function IRYearProvider(props: { children: React.ReactNode }) {
  var thisYear = new Date().getFullYear();
  var _year = useState<number>(thisYear - 1);  // default: ano anterior (IRPF entregue em abril)
  var year = _year[0];
  var setYearRaw = _year[1];

  // Hidrata do localStorage apos mount (evita hydration mismatch)
  useEffect(function () {
    var stored = loadStoredYear(thisYear - 1);
    if (stored !== year) setYearRaw(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setYear(y: number) {
    setYearRaw(y);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, String(y)); } catch { /* ignore */ }
    }
  }

  var anosDisponiveis: number[] = [];
  for (var i = thisYear; i >= thisYear - 5; i--) anosDisponiveis.push(i);

  return (
    <CTX.Provider value={{ year: year, setYear: setYear, anosDisponiveis: anosDisponiveis }}>
      {props.children}
    </CTX.Provider>
  );
}

export function useIRYear(): IRYearContextValue {
  var v = useContext(CTX);
  if (!v) {
    var thisYear = new Date().getFullYear();
    return { year: thisYear - 1, setYear: function () {}, anosDisponiveis: [thisYear - 1] };
  }
  return v;
}
