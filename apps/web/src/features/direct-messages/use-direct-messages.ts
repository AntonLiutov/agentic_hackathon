import { useContext } from "react";

import { DirectMessagesContext } from "./direct-messages-context";

export function useDirectMessages() {
  const value = useContext(DirectMessagesContext);

  if (!value) {
    throw new Error("useDirectMessages must be used within DirectMessagesProvider");
  }

  return value;
}
