import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";

export type SettingsPane = "profile" | "preferences" | "about";

export interface SettingsState {
  open: boolean;
  pane: SettingsPane;
  setOpen: (open: boolean) => void;
  setPane: (pane: SettingsPane) => void;
  openPane: (pane: SettingsPane) => void;
}

export const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<SettingsPane>("preferences");

  const openPane = useCallback((next: SettingsPane) => {
    setPane(next);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ open, pane, setOpen, setPane, openPane }),
    [open, pane, openPane],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
