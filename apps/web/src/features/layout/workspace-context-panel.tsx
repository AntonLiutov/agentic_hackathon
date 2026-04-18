import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type WorkspaceContextPanelValue = {
  panelContent: ReactNode | null;
  setPanelContent: (content: ReactNode | null) => void;
};

const WorkspaceContextPanelContext = createContext<WorkspaceContextPanelValue | null>(null);

export function WorkspaceContextPanelProvider({ children }: { children: ReactNode }) {
  const [panelContent, setPanelContent] = useState<ReactNode | null>(null);
  const value = useMemo(
    () => ({
      panelContent,
      setPanelContent,
    }),
    [panelContent],
  );

  return (
    <WorkspaceContextPanelContext.Provider value={value}>
      {children}
    </WorkspaceContextPanelContext.Provider>
  );
}

export function useWorkspaceContextPanel() {
  const value = useContext(WorkspaceContextPanelContext);

  if (!value) {
    throw new Error("useWorkspaceContextPanel must be used within WorkspaceContextPanelProvider");
  }

  return value;
}
