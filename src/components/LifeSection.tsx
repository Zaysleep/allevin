"use client";

import type { ReactNode } from "react";

interface LifeSectionProps {
   title: string;
   count?: number;
   action?: ReactNode;
   children: ReactNode;
   className?: string;
}

// ALLEVIN MK XII — Journal pass
// Sections are intentionally simple: one human-readable heading, optional count,
// optional action, and the content itself. No product jargon or explanatory copy.
export default function LifeSection({ title, count, action, children, className = "" }: LifeSectionProps) {
   return (
      <section className={`life-section ${className}`.trim()}>
         <header className="life-section-header">
            <div className="life-section-title-line">
               <h2>{title}</h2>
               {typeof count === "number" && count > 0 ? <span className="life-count" aria-label={`${count} items`}>{count}</span> : null}
            </div>
            {action ? <div className="life-section-action">{action}</div> : null}
         </header>
         <div className="life-section-content">{children}</div>
      </section>
   );
}
