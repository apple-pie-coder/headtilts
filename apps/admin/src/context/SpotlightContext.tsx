import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface SpotlightApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SpotlightContext = createContext<SpotlightApi>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);

  return <SpotlightContext.Provider value={value}>{children}</SpotlightContext.Provider>;
}

export function useSpotlight() {
  return useContext(SpotlightContext);
}
