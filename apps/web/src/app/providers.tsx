import type { PropsWithChildren } from "react";

import { DirectMessagesProvider } from "../features/direct-messages/direct-messages-context";
import { FriendsProvider } from "../features/friends/friends-context";
import { PresenceProvider } from "../features/presence/presence-context";
import { RoomsProvider } from "../features/rooms/rooms-context";
import { SessionProvider } from "../features/session/session-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <PresenceProvider>
        <FriendsProvider>
          <RoomsProvider>
            <DirectMessagesProvider>{children}</DirectMessagesProvider>
          </RoomsProvider>
        </FriendsProvider>
      </PresenceProvider>
    </SessionProvider>
  );
}
