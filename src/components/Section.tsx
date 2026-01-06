import type { ReactNode } from "react";

export const Section = (props: { title: ReactNode; children: ReactNode; className?: string; rightElement?: ReactNode }) => {
  const { title, children, className, rightElement } = props;
  return (
    <section className={["space-y-3", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-bold">{title}</h2>
        {rightElement}
      </div>
      {children}
    </section>
  );
};


