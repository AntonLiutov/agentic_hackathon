import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useSession } from "../../features/session/use-session";
import { getApiErrorMessage } from "../../shared/api/client";
import { AuthPageLayout } from "./AuthPageLayout";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useSession();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await register({ email, username, password });
      navigate("/app/chats", { replace: true });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to create your account right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageLayout
      title="Create account"
      description="Everything you need to keep work moving"
      footer={
        <p>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleRegister}>
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
          <span>Username</span>
          <input
            type="text"
            placeholder="your-name"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={64}
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
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthPageLayout>
  );
}
