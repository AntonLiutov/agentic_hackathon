import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authApi } from "../../shared/api/auth";
import { getApiErrorMessage } from "../../shared/api/client";
import { AuthPageLayout } from "./AuthPageLayout";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  useEffect(() => {
    let isCancelled = false;

    async function validateToken() {
      if (!token) {
        setStatus("invalid");
        setErrorMessage("Reset link is missing. Request a new password reset link.");
        return;
      }

      setStatus("checking");
      setErrorMessage(null);

      try {
        await authApi.validateResetToken(token);

        if (!isCancelled) {
          setStatus("ready");
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus("invalid");
          setErrorMessage(getApiErrorMessage(error, "Reset link is invalid or expired."));
        }
      }
    }

    void validateToken();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authApi.resetPassword({
        token,
        new_password: password,
      });
      setSuccessMessage(response.message);
      window.setTimeout(() => {
        window.sessionStorage.setItem("agentic_notice", response.message);
        navigate("/signin?notice=password-reset", { replace: true });
      }, 1200);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to reset your password right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      title="Choose a new password"
      description="Set your new password"
      footer={
        <p>
          Need a fresh link? <Link to="/forgot-password">Request another reset link</Link>
        </p>
      }
    >
      {status === "checking" ? <p>Checking your reset link...</p> : null}
      {status === "invalid" ? (
        <div className="auth-form">
          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          <Link className="ghost-button inline-link-button" to="/forgot-password">
            Request a new reset link
          </Link>
        </div>
      ) : null}
      {status === "ready" ? (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>New password</span>
            <input
              type="password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          {successMessage ? <p className="auth-success">{successMessage}</p> : null}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Save new password"}
          </button>
        </form>
      ) : null}
    </AuthPageLayout>
  );
}
