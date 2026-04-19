import { type FormEvent, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useSession } from "../../features/session/use-session";
import { getApiErrorMessage } from "../../shared/api/client";
import { AuthPageLayout } from "./AuthPageLayout";

type RedirectState = {
  redirectTo?: string;
  notice?: string;
};

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = useMemo(() => {
    const state = location.state as RedirectState | null;
    return state?.redirectTo ?? "/app/chats";
  }, [location.state]);
  const noticeMessage = useMemo(() => {
    const state = location.state as RedirectState | null;
    if (state?.notice) {
      return state.notice;
    }

    const params = new URLSearchParams(location.search);
    const noticeCode = params.get("notice");

    if (noticeCode === "password-updated") {
      return "Password updated. Please sign in again with your new password.";
    }

    if (noticeCode === "password-reset") {
      return "Password reset complete. Please sign in with your new password.";
    }

    if (noticeCode === "account-deleted") {
      return "Account deleted permanently.";
    }

    const storedNotice = window.sessionStorage.getItem("agentic_notice");

    if (storedNotice) {
      return storedNotice;
    }

    return null;
  }, [location.search, location.state]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    window.sessionStorage.removeItem("agentic_notice");

    try {
      await signIn({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to sign in right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Access"
      title="Sign in"
      description="Sign in with your email and password to bootstrap the current browser session."
      footer={
        <p>
          Need an account? <Link to="/register">Register</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSignIn}>
        {noticeMessage ? <p className="auth-success">{noticeMessage}</p> : null}
        <label>
          <span>Email</span>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="auth-helper">
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </AuthPageLayout>
  );
}
