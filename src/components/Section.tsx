import type { ReactNode } from "react";

export const Section = (props: { title: ReactNode; children: ReactNode; className?: string }) => {
  const { title, children, className } = props;
  return (
    <section className={["space-y-3", className].filter(Boolean).join(" ")}>
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
};


