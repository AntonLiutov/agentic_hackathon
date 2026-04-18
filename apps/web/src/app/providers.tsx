import type { PropsWithChildren } from "react";

import { DirectMessagesProvider } from "../features/direct-messages/direct-messages-context";
import { PresenceProvider } from "../features/presence/presence-context";
import { RoomsProvider } from "../features/rooms/rooms-context";
import { SessionProvider } from "../features/session/session-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <PresenceProvider>
        <RoomsProvider>
          <DirectMessagesProvider>{children}</DirectMessagesProvider>
        </RoomsProvider>
      </PresenceProvider>
    </SessionProvider>
  );
}
