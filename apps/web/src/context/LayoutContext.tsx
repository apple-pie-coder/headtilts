import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

export type LayoutVariant = 'default' | 'full-width' | 'full-bleed' | 'blank';

interface LayoutContextValue {
  variant: LayoutVariant;
  setVariant: (v: LayoutVariant) => void;
  showSidebar: boolean;
  setShowSidebar: (v: boolean) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  variant: 'default',
  setVariant: () => {},
  showSidebar: false,
  setShowSidebar: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<LayoutVariant>('default');
  const [showSidebar, setShowSidebarState] = useState(false);
  const setVariant = useCallback((v: LayoutVariant) => setVariantState(v), []);
  const setShowSidebar = useCallback((v: boolean) => setShowSidebarState(v), []);
  return (
    <LayoutContext.Provider value={{ variant, setVariant, showSidebar, setShowSidebar }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}

export function templateToVariant(template: string | null | undefined): LayoutVariant {
  if (template === 'blank') return 'blank';
  if (template === 'full-bleed') return 'full-bleed';
  if (template === 'full-width' || template === 'contact') return 'full-width';
  return 'default';
}
