import { Link } from "react-router-dom";

import { AuthPageLayout } from "./AuthPageLayout";

export function ForgotPasswordPage() {
  return (
    <AuthPageLayout
      eyebrow="Recovery"
      title="Reset password"
      description="Password recovery is not implemented yet, but this route and form slot are ready for the API flow."
      footer={
        <p>
          Remembered it? <Link to="/signin">Back to sign in</Link>
        </p>
      }
    >
      <form className="auth-form">
        <label>
          <span>Email</span>
          <input type="email" placeholder="you@example.com" disabled />
        </label>
        <button className="primary-button" type="button" disabled>
          Recovery flow comes with auth
        </button>
      </form>
    </AuthPageLayout>
  );
}
