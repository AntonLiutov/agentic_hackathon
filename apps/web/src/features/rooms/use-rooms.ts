import { useContext } from "react";

import { RoomsContext } from "./rooms-context";

export function useRooms() {
  const value = useContext(RoomsContext);

  if (!value) {
    throw new Error("useRooms must be used within RoomsProvider");
  }

  return value;
}
