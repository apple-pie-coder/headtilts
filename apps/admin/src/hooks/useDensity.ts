import { useEffect, useState } from 'react';

export type Density = 'compact' | 'condensed' | 'relaxed';

export function useDensity(storageKey: string, initial: Density = 'compact'): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === 'compact' || v === 'condensed' || v === 'relaxed') return v as Density;
    } catch { /* ignore */ }
    return initial;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, density); } catch { /* ignore */ }
  }, [storageKey, density]);

  return [density, setDensity];
}
