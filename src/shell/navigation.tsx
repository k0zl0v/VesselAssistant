import { createContext, useContext, type ReactNode } from 'react';
import type { IconName } from '../components/ui/Icon';
import type { StringKey } from '../i18n';

/** Sections of TZ §10: the voyage workspace and the data tools around it. */
export type Screen =
  | 'load-plan'
  | 'layers'
  | 'ogv'
  | 'sof'
  | 'documents'
  | 'reference'
  | 'tools'
  | 'audit';

export interface ScreenDef {
  key: Screen;
  label: StringKey;
  icon: IconName;
  /** Needs a selected voyage; disabled on the rail while there is none. */
  voyageScoped: boolean;
}

export const VOYAGE_SCREENS: readonly ScreenDef[] = [
  { key: 'load-plan', label: 'nav.load_plan', icon: 'table', voyageScoped: true },
  { key: 'layers', label: 'nav.layers', icon: 'layers', voyageScoped: true },
  { key: 'ogv', label: 'nav.ogv', icon: 'discharge', voyageScoped: true },
  { key: 'sof', label: 'nav.sof', icon: 'clock', voyageScoped: true },
  { key: 'documents', label: 'nav.documents', icon: 'document', voyageScoped: true },
];

export const DATA_SCREENS: readonly ScreenDef[] = [
  { key: 'reference', label: 'nav.reference', icon: 'book', voyageScoped: false },
  { key: 'tools', label: 'nav.tools', icon: 'import', voyageScoped: false },
  { key: 'audit', label: 'nav.audit', icon: 'list', voyageScoped: false },
];

interface NavValue {
  screen: Screen;
  navigate: (screen: Screen) => void;
}

const NavCtx = createContext<NavValue | null>(null);

export function NavigationProvider({ value, children }: { value: NavValue; children: ReactNode }) {
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export function useNavigation(): NavValue {
  const v = useContext(NavCtx);
  if (!v) throw new Error('useNavigation must be used inside <NavigationProvider>');
  return v;
}
