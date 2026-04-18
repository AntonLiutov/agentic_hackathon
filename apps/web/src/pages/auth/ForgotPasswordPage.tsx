import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { authApi } from "../../shared/api/auth";
import { getApiErrorMessage } from "../../shared/api/client";
import { AuthPageLayout } from "./AuthPageLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await authApi.requestPasswordReset({ email });
      setSuccessMessage(response.message);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to start password recovery right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Recovery"
      title="Reset password"
      description="Enter your email address and we will send a password reset link if the account exists."
      footer={
        <p>
          Remembered it? <Link to="/signin">Back to sign in</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
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
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        {successMessage ? <p className="auth-success">{successMessage}</p> : null}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending reset email..." : "Send reset link"}
        </button>
      </form>
    </AuthPageLayout>
  );
}
