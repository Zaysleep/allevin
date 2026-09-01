"use client";

import { Pause, Pencil, Play, Repeat2, SkipForward, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { formatLifeDate, formatLifeTime, formatRecurringReminder } from "@/lib/lifeEngine";
import { nextLifeOccurrence } from "@/lib/lifeStore";
import type { KinActionItemInput, LifeItem, LifeRecurrence, LifeRepeatRule } from "@/lib/lifeTypes";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeValue(minutes?: number) {
   if (minutes === undefined) return "09:00";
   return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeMinutes(value: string) {
   const [hour, minute] = value.split(":").map(Number);
   return hour * 60 + minute;
}

interface Props {
   item: LifeItem;
   onUpdate: (id: string, changes: KinActionItemInput) => void;
   onArchive: (id: string) => void;
}

export default function RecurringReminderRow({ item, onUpdate, onArchive }: Props) {
   const fallbackDate = new Date(item.dueAt || item.createdAt);
   const [editing, setEditing] = useState(false);
   const [title, setTitle] = useState(item.title);
   const [recurrence, setRecurrence] = useState<Exclude<LifeRecurrence, "none">>(item.recurrence === "none" ? "daily" : item.recurrence);
   const [interval, setInterval] = useState(item.repeatRule?.intervalMinutes || 60);
   const [clock, setClock] = useState(timeValue(item.repeatRule?.timeMinutes));
   const [start, setStart] = useState(timeValue(item.repeatRule?.windowStartMinutes ?? 9 * 60));
   const [end, setEnd] = useState(timeValue(item.repeatRule?.windowEndMinutes ?? 17 * 60));
   const [days, setDays] = useState<number[]>(item.repeatRule?.daysOfWeek || [fallbackDate.getDay()]);
   const [monthDay, setMonthDay] = useState(item.repeatRule?.monthlyDay || fallbackDate.getDate());
   const nextText = useMemo(() => item.dueAt ? `${formatLifeDate(item.dueAt)} · ${formatLifeTime(item.dueAt)}` : "Next time pending", [item.dueAt]);

   function save() {
      const current = item.repeatRule;
      const rule: LifeRepeatRule = {
         frequency: recurrence,
         cadence: current?.cadence || "exact",
         scope: recurrence === "interval" ? (current?.scope || "every-day") : "every-day",
         intervalMinutes: recurrence === "interval" ? Math.max(5, interval) : undefined,
         windowStartMinutes: recurrence === "interval" ? timeMinutes(start) : undefined,
         windowEndMinutes: recurrence === "interval" ? timeMinutes(end) : undefined,
         timeMinutes: recurrence === "interval" ? undefined : timeMinutes(clock),
         daysOfWeek: recurrence === "weekly" ? days : undefined,
         monthlyDay: recurrence === "monthly" ? Math.min(31, Math.max(1, monthDay)) : undefined,
         shorterMonthPolicy: recurrence === "monthly" && monthDay > 28 ? (current?.shorterMonthPolicy || "last-day") : undefined,
         seriesStartedAt: current?.seriesStartedAt || Date.now(),
         stopWhenCompleted: current?.stopWhenCompleted || false,
         paused: current?.paused || false,
         userEdited: true,
      };
      const preview = { ...item, title: title.trim() || item.title, recurrence, repeatRule: rule };
      onUpdate(item.id, {
         title: preview.title,
         recurrence,
         repeatRule: rule,
         dueAt: nextLifeOccurrence(preview, Date.now()) || item.dueAt,
         timingPrecision: "exact",
      });
      setEditing(false);
   }

   function togglePause() {
      if (!item.repeatRule) return;
      const rule = { ...item.repeatRule, paused: !item.repeatRule.paused };
      onUpdate(item.id, { repeatRule: rule, dueAt: rule.paused ? item.dueAt : nextLifeOccurrence({ ...item, repeatRule: rule }, Date.now()) || item.dueAt });
   }

   function skipNext() {
      if (!item.repeatRule) return;
      const skippedAt = item.dueAt || nextLifeOccurrence(item, Date.now());
      const rule = { ...item.repeatRule, skipNextAt: skippedAt };
      onUpdate(item.id, { repeatRule: rule, dueAt: nextLifeOccurrence({ ...item, repeatRule: rule }, (skippedAt || Date.now()) + 1) || item.dueAt });
   }

   return (
      <article className={`recurring-row ${item.repeatRule?.paused ? "recurring-row-paused" : ""}`}>
         <div className="recurring-row-summary">
            <div className="recurring-row-copy">
               <h3>{item.title}</h3>
               <p className="recurring-schedule"><Repeat2 size={15} aria-hidden="true" /><span>{formatRecurringReminder(item)}</span></p>
               <p className="recurring-next"><span>Next</span><strong>{item.repeatRule?.paused ? "Paused" : nextText}</strong></p>
            </div>
            <button className="recurring-edit-button" type="button" onClick={() => setEditing((value) => !value)} aria-expanded={editing}>
               <Pencil size={16} /> Edit
            </button>
         </div>

         {editing ? (
            <div className="recurring-editor">
               <label>Name<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
               <label>Repeats<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Exclude<LifeRecurrence, "none">)}>
                  <option value="interval">Every few minutes or hours</option>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Selected days</option>
                  <option value="monthly">Every month</option>
               </select></label>
               {recurrence === "interval" ? (
                  <div className="recurring-editor-grid">
                     <label>Every (minutes)<input type="number" min="5" value={interval} onChange={(event) => setInterval(Number(event.target.value))} /></label>
                     <label>Starts<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label>
                     <label>Stops<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
                  </div>
               ) : <label>Time<input type="time" value={clock} onChange={(event) => setClock(event.target.value)} /></label>}
               {recurrence === "weekly" ? <fieldset className="recurring-days"><legend>Days</legend>{DAYS.map((day, index) => <button key={day} type="button" className={days.includes(index) ? "selected" : ""} onClick={() => setDays((value) => value.includes(index) ? value.filter((entry) => entry !== index) : [...value, index])}>{day}</button>)}</fieldset> : null}
               {recurrence === "monthly" ? <label>Day of month<input type="number" min="1" max="31" value={monthDay} onChange={(event) => setMonthDay(Number(event.target.value))} /></label> : null}
               <div className="recurring-editor-actions">
                  <button type="button" onClick={save}>Save changes</button>
                  <button type="button" onClick={togglePause}>{item.repeatRule?.paused ? <Play size={15} /> : <Pause size={15} />}{item.repeatRule?.paused ? "Resume" : "Pause"}</button>
                  <button type="button" onClick={skipNext}><SkipForward size={15} />Skip next</button>
                  <button type="button" className="danger-menu-item" onClick={() => onArchive(item.id)}><Trash2 size={15} />Delete</button>
               </div>
            </div>
         ) : null}
      </article>
   );
}
