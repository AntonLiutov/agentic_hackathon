import type { PropsWithChildren } from "react";

import { SessionProvider } from "../features/session/session-context";

export function AppProviders({ children }: PropsWithChildren) {
  return <SessionProvider>{children}</SessionProvider>;
}
