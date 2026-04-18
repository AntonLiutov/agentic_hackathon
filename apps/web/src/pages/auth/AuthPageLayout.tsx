import type { PropsWithChildren, ReactNode } from "react";

import { Link } from "react-router-dom";

type AuthPageLayoutProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
  footer?: ReactNode;
}>;

export function AuthPageLayout({
  eyebrow,
  title,
  description,
  footer,
  children,
}: AuthPageLayoutProps) {
  return (
    <main className="auth-page">
      <section className="auth-card card">
        <div className="auth-header">
          <Link className="auth-backlink" to="/">
            Back to landing
          </Link>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="auth-content">{children}</div>

        {footer ? <div className="auth-footer">{footer}</div> : null}
      </section>
    </main>
  );
}
