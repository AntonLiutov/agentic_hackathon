import { Link } from "react-router-dom";

import { AuthPageLayout } from "./AuthPageLayout";

export function RegisterPage() {
  return (
    <AuthPageLayout
      eyebrow="Onboarding"
      title="Create account"
      description="This page reserves the shape of the registration flow so the frontend can connect to real auth endpoints later without a structural rewrite."
      footer={
        <p>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      }
    >
      <form className="auth-form">
        <label>
          <span>Email</span>
          <input type="email" placeholder="you@example.com" disabled />
        </label>
        <label>
          <span>Username</span>
          <input type="text" placeholder="classic-chat-user" disabled />
        </label>
        <label>
          <span>Password</span>
          <input type="password" placeholder="••••••••" disabled />
        </label>
        <label>
          <span>Confirm password</span>
          <input type="password" placeholder="••••••••" disabled />
        </label>
        <button className="primary-button" type="button" disabled>
          Registration hooks in next
        </button>
      </form>
    </AuthPageLayout>
  );
}
