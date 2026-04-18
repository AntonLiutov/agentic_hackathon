import type { PropsWithChildren } from "react";

import { RoomsProvider } from "../features/rooms/rooms-context";
import { SessionProvider } from "../features/session/session-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <RoomsProvider>{children}</RoomsProvider>
    </SessionProvider>
  );
}
