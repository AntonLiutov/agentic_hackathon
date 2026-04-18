import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useSession } from "../../features/session/use-session";
import { AuthPageLayout } from "./AuthPageLayout";

type RedirectState = {
  redirectTo?: string;
};

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInPreview } = useSession();

  const redirectTo = useMemo(() => {
    const state = location.state as RedirectState | null;
    return state?.redirectTo ?? "/app/chats";
  }, [location.state]);

  function handlePreviewSignIn() {
    signInPreview();
    navigate(redirectTo, { replace: true });
  }

  return (
    <AuthPageLayout
      eyebrow="Access"
      title="Sign in"
      description="The real auth flow lands in Sprint 1 identity work. For now, this page establishes the route and UX structure."
      footer={
        <p>
          Need an account? <Link to="/register">Register</Link>
        </p>
      }
    >
      <form className="auth-form">
        <label>
          <span>Email</span>
          <input type="email" placeholder="you@example.com" disabled />
        </label>
        <label>
          <span>Password</span>
          <input type="password" placeholder="••••••••" disabled />
        </label>
        <button className="primary-button" type="button" onClick={handlePreviewSignIn}>
          Enter workspace preview
        </button>
      </form>

      <div className="auth-helper">
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </AuthPageLayout>
  );
}
