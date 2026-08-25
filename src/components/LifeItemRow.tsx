"use client";

import { Check, Clock3, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatLifeDate, formatLifeTime } from "@/lib/lifeEngine";
import type { LifeItem } from "@/lib/lifeTypes";

interface LifeItemRowProps {
   item: LifeItem;
   meta?: string;
   onComplete: (id: string) => void;
   onTomorrow: (id: string) => void;
   onToday: (id: string) => void;
   onReopen: (id: string) => void;
   onArchive: (id: string) => void;
   waitingMode?: boolean;
   passed?: boolean;
}

function contextLabel(value: LifeItem["context"]) {
   if (value === "kin-software") return "Kin Software";
   return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function LifeItemRow({ item, meta, onComplete, onTomorrow, onToday, onReopen, onArchive, waitingMode = false, passed = false }: LifeItemRowProps) {
   const [open, setOpen] = useState(false);
   const when = item.startAt || item.dueAt || item.followUpAt || item.deferUntil;
   const dateText = when ? formatLifeDate(when) : "";
   const timeText = when && !item.allDay ? formatLifeTime(when) : "";
   const isDone = item.state === "done";

   return (
      <article className={`life-row ${passed && !isDone ? "life-row-passed" : ""}`}>
         <button
            className={`life-check ${isDone ? "life-check-done" : ""}`}
            onClick={() => (isDone ? onReopen(item.id) : onComplete(item.id))}
            aria-label={isDone ? `Reopen ${item.title}` : `Complete ${item.title}`}
         >
            {isDone ? <Check size={14} strokeWidth={2.4} /> : null}
         </button>

         <div className="life-row-body">
            <div className="life-row-title-line">
               <h3 className={isDone ? "life-row-title life-row-title-done" : passed ? "life-row-title life-row-title-passed" : "life-row-title"}>{item.title}</h3>
               {item.importance === "high" ? <span className="life-importance" aria-label="High importance">Important</span> : null}
            </div>

            <div className="life-row-meta">
               {meta ? <span>{meta}</span> : null}
               {dateText ? <span>{dateText}{timeText ? ` · ${timeText}` : ""}</span> : null}
               <span>{contextLabel(item.context)}</span>
               {item.durationMinutes ? <span>{item.durationMinutes} min</span> : null}
               {item.recurrence !== "none" ? <span>{item.recurrence}</span> : null}
            </div>

            {item.details ? <p className="life-row-details">{item.details}</p> : null}
         </div>

         <div className="life-row-menu-wrap">
            <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label={`Actions for ${item.title}`} aria-expanded={open}>
               <MoreHorizontal size={18} />
            </button>
            {open ? (
               <div className="life-row-menu">
                  {isDone ? (
                     <button onClick={() => { onReopen(item.id); setOpen(false); }}><RotateCcw size={15} /> Reopen</button>
                  ) : (
                     <>
                        <button onClick={() => { onToday(item.id); setOpen(false); }}><Clock3 size={15} /> Bring to today</button>
                        <button onClick={() => { onTomorrow(item.id); setOpen(false); }}><Clock3 size={15} /> Move to tomorrow</button>
                        {waitingMode ? null : <button onClick={() => { onComplete(item.id); setOpen(false); }}><Check size={15} /> Mark done</button>}
                     </>
                  )}
                  <button className="danger-menu-item" onClick={() => { onArchive(item.id); setOpen(false); }}><Trash2 size={15} /> Archive</button>
               </div>
            ) : null}
         </div>
      </article>
   );
}
