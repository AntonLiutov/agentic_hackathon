import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useSession } from "../../features/session/use-session";
import { authApi } from "../../shared/api/auth";
import { getApiErrorMessage } from "../../shared/api/client";

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, clearSession } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      window.sessionStorage.setItem(
        "agentic_notice",
        "Password updated. Please sign in again with your new password.",
      );
      navigate("/signin?notice=password-updated", {
        replace: true,
      });
      clearSession();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to change your password right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteErrorMessage(null);
    setIsDeletingAccount(true);

    try {
      const response = await authApi.deleteAccount({
        current_password: deletePassword,
      });
      window.sessionStorage.setItem("agentic_notice", response.message);
      clearSession();
      navigate("/signin?notice=account-deleted", {
        replace: true,
      });
    } catch (error) {
      setDeleteErrorMessage(getApiErrorMessage(error, "Unable to delete your account right now."));
    } finally {
      setIsDeletingAccount(false);
    }
  }

  return (
    <section className="placeholder-panel card profile-panel">
      <p className="eyebrow">Profile</p>
      <h1>Profile and password management</h1>
      <p>
        Review your immutable account details and rotate your password. For safety, changing the
        password signs every browser session out and requires a fresh sign-in.
      </p>

      <div className="profile-grid">
        <article className="session-card">
          <p className="session-card-kicker">Account</p>
          <h2>{user?.name}</h2>
          <dl className="session-meta">
            <div>
              <dt>Username</dt>
              <dd>{user?.username}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
          </dl>
        </article>

        <article className="session-card">
          <p className="session-card-kicker">Security</p>
          <h2>Change password</h2>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Current password</span>
              <input
                type="password"
                placeholder="********"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            <label>
              <span>New password</span>
              <input
                type="password"
                placeholder="********"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              <span>Confirm new password</span>
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
              {isSubmitting ? "Updating password..." : "Update password"}
            </button>
          </form>
        </article>

        <article className="session-card">
          <p className="session-card-kicker">Danger zone</p>
          <h2>Delete account</h2>
          <div className="danger-zone">
            <p>
              This permanently deletes your account, removes your memberships from other rooms,
              deletes rooms you own, and permanently removes attachments from those deleted rooms.
            </p>
            <form className="auth-form" onSubmit={handleDeleteAccount}>
              <label>
                <span>Current password</span>
                <input
                  type="password"
                  placeholder="********"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
              </label>
              {deleteErrorMessage ? <p className="auth-error">{deleteErrorMessage}</p> : null}
              <button className="danger-button" type="submit" disabled={isDeletingAccount}>
                {isDeletingAccount ? "Deleting account..." : "Delete account"}
              </button>
            </form>
          </div>
        </article>
      </div>
    </section>
  );
}
