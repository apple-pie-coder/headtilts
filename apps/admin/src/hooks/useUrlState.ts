import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List-page state (filters, page, sort) kept in the query string so it
 * survives refreshes, works with the back button and can be shared as a link.
 *
 * Values equal to their default are dropped from the URL to keep it clean.
 * Changing any key other than `page` resets `page` back to its default.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = params.get(key as string);
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [params]);

  const update = useCallback((patch: Partial<T>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value as string);
      }
      if ('page' in defaults && !('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const reset = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of Object.keys(defaults)) next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  return [state, update, reset];
}
