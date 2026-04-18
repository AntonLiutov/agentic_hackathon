import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "./router";
import { AppProviders } from "./providers";

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRouter />
      </BrowserRouter>
    </AppProviders>
  );
}
