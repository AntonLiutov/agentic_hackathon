import type { PropsWithChildren, ReactNode } from "react";

import { Link } from "react-router-dom";

type AuthPageLayoutProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
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
            Agentic Chat
          </Link>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p className="auth-description">{description}</p> : null}
        </div>

        <div className="auth-content">{children}</div>

        {footer ? <div className="auth-footer">{footer}</div> : null}
      </section>
    </main>
  );
}
