import { useContext } from "react";

import { FriendsContext } from "./friends-context";

export function useFriends() {
  const context = useContext(FriendsContext);

  if (!context) {
    throw new Error("useFriends must be used within FriendsProvider.");
  }

  return context;
}
