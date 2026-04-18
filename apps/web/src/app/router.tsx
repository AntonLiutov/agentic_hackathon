import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppFrame } from "../features/layout/app-frame";
import { useSession } from "../features/session/use-session";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { SignInPage } from "../pages/auth/SignInPage";
import { LandingPage } from "../pages/LandingPage";
import { ChatsPage } from "../pages/app/ChatsPage";
import { ContactsPage } from "../pages/app/ContactsPage";
import { ProfilePage } from "../pages/app/ProfilePage";
import { SessionsPage } from "../pages/app/SessionsPage";

function ProtectedRoute() {
  const { status } = useSession();
  const location = useLocation();

  if (status === "bootstrapping") {
    return <main className="auth-page">Restoring your session...</main>;
  }

  if (status !== "authenticated") {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/signin" replace state={{ redirectTo: redirectPath }} />;
  }

  return <Outlet />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppFrame />}>
          <Route index element={<Navigate to="/app/chats" replace />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
