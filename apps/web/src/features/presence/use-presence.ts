import { useContext } from "react";

import { PresenceContext } from "./presence-context";

export function usePresence() {
  const value = useContext(PresenceContext);

  if (!value) {
    throw new Error("usePresence must be used within PresenceProvider");
  }

  return value;
}
