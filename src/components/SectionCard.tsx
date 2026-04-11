import { ReactNode } from "react";

interface SectionCardProps {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  eyebrow,
  title,
  action,
  children,
}: SectionCardProps) {
  return (
    <section className="section-card">
      <header className="section-card__header">
        <div>
          {eyebrow ? <span className="section-card__eyebrow">{eyebrow}</span> : null}
          <h2 className="section-card__title">{title}</h2>
        </div>
        {action}
      </header>
      <div className="section-card__content">{children}</div>
    </section>
  );
}
