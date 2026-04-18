import type { PropsWithChildren } from "react";

import { DirectMessagesProvider } from "../features/direct-messages/direct-messages-context";
import { RoomsProvider } from "../features/rooms/rooms-context";
import { SessionProvider } from "../features/session/session-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <RoomsProvider>
        <DirectMessagesProvider>{children}</DirectMessagesProvider>
      </RoomsProvider>
    </SessionProvider>
  );
}
