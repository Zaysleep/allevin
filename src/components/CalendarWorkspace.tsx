"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Repeat2, Trash2, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";

import RhythmSettingsEditor from "@/components/RhythmSettingsEditor";
import { reconcileLifeEventsWithRhythm } from "@/lib/allevinDayAdaptation";

import {
   buildRhythmForDate,
   formatClock,
   localDateKey,
   minutesFromClock,
   readDailyRhythm,
   type DailyRhythmState,
   type RhythmEntry,
} from "@/lib/dailyRhythm";
import { archiveLifeItem, createLifeItem, readLifeState, updateLifeItem } from "@/lib/lifeStore";
import type { LifeContext, LifeItem, LifeState } from "@/lib/lifeTypes";

type CalendarView = "day" | "week" | "month";

type CalendarEventDraft = {
   id?: string;
   title: string;
   date: string;
   allDay: boolean;
   start: string;
   end: string;
   context: LifeContext;
   location: string;
};

type CalendarRow =
   | { type: "rhythm"; key: string; minutes: number; rhythm: RhythmEntry }
   | { type: "life"; key: string; minutes: number; item: LifeItem }
   | { type: "now"; key: string; minutes: number };

const CONTEXTS: LifeContext[] = ["personal", "work", "school", "home", "errand", "car", "finance", "health", "kin-software", "other"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameLocalDay(timestamp: number | undefined, date: Date) {
   if (!timestamp) return false;
   const target = new Date(timestamp);
   return target.getFullYear() === date.getFullYear() && target.getMonth() === date.getMonth() && target.getDate() === date.getDate();
}

function lifeTimestamp(item: LifeItem) {
   return item.startAt || item.dueAt || item.followUpAt || item.deferUntil;
}

function lifeItemsForDate(state: LifeState, date: Date) {
   return state.items
      .filter((item) => item.state !== "archived" && item.state !== "waiting" && item.state !== "someday")
      .filter((item) => sameLocalDay(lifeTimestamp(item), date))
      .sort((left, right) => (lifeTimestamp(left) || 0) - (lifeTimestamp(right) || 0));
}

function startOfWeek(date: Date, weekStartsOn: 0 | 1) {
   const result = new Date(date);
   result.setHours(12, 0, 0, 0);
   const day = result.getDay();
   const delta = weekStartsOn === 1 ? (day === 0 ? -6 : 1 - day) : -day;
   result.setDate(result.getDate() + delta);
   return result;
}

function shiftDate(date: Date, amount: number, unit: CalendarView) {
   const next = new Date(date);
   if (unit === "day") next.setDate(next.getDate() + amount);
   if (unit === "week") next.setDate(next.getDate() + amount * 7);
   if (unit === "month") {
      next.setDate(1);
      next.setMonth(next.getMonth() + amount);
   }
   return next;
}

function dateInputValue(date: Date) {
   return localDateKey(date);
}

function localTimestamp(dateValue: string, timeValue: string) {
   const [year, month, day] = dateValue.split("-").map(Number);
   const [hours, minutes] = timeValue.split(":").map(Number);
   return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0).getTime();
}

function eventDraftForDate(date: Date): CalendarEventDraft {
   return {
      title: "",
      date: dateInputValue(date),
      allDay: false,
      start: "09:00",
      end: "10:00",
      context: "personal",
      location: "",
   };
}

function eventDraftFromItem(item: LifeItem): CalendarEventDraft {
   const when = new Date(item.startAt || item.dueAt || Date.now());
   const end = new Date(item.endAt || (item.startAt || item.dueAt || Date.now()) + (item.durationMinutes || 60) * 60_000);
   return {
      id: item.id,
      title: item.title,
      date: dateInputValue(when),
      allDay: item.allDay,
      start: `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
      end: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
      context: item.context,
      location: item.location || "",
   };
}

function lifeItemMinutes(item: LifeItem) {
   const when = item.startAt || item.dueAt;
   if (!when || item.allDay) return 0;
   const date = new Date(when);
   return date.getHours() * 60 + date.getMinutes();
}

function isPassedLifeItem(item: LifeItem, now: Date) {
   if (item.state === "done" || item.allDay || item.timingPrecision !== "exact") return false;
   const when = item.endAt || item.startAt || item.dueAt;
   return Boolean(when && sameLocalDay(when, now) && when < now.getTime());
}

function formatSelectedDate(date: Date) {
   return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function visibleRhythmForDate(state: DailyRhythmState, date: Date) {
   // Reality-aware skips/replacements should disappear from the visible plan.
   // The underlying recurring routine remains intact; this filter only renders
   // the adapted occurrence for the selected date.
   return buildRhythmForDate(state, date).filter((entry) => !entry.skipped);
}

function buildRows(state: LifeState, rhythmState: DailyRhythmState, date: Date, now: Date): CalendarRow[] {
   const rows: CalendarRow[] = [
      ...visibleRhythmForDate(rhythmState, date).map((rhythm): CalendarRow => ({ type: "rhythm", key: `rhythm-${rhythm.id}`, minutes: minutesFromClock(rhythm.time), rhythm })),
      ...lifeItemsForDate(state, date).map((item): CalendarRow => ({ type: "life", key: `life-${item.id}`, minutes: lifeItemMinutes(item), item })),
   ];

   if (localDateKey(date) === localDateKey(now)) rows.push({ type: "now", key: "now", minutes: now.getHours() * 60 + now.getMinutes() });
   return rows.sort((left, right) => left.minutes - right.minutes || (left.type === "now" ? 1 : -1));
}

function broadScheduleConflict(draft: CalendarEventDraft, rhythmState: DailyRhythmState) {
   if (draft.allDay) return null;
   const date = new Date(`${draft.date}T12:00:00`);
   const start = minutesFromClock(draft.start);
   const end = minutesFromClock(draft.end);
   return visibleRhythmForDate(rhythmState, date).find((entry) => {
      if (entry.kind !== "schedule") return false;
      if (draft.context === entry.category) return false;
      const scheduleStart = minutesFromClock(entry.time);
      const scheduleEnd = minutesFromClock(entry.endTime || entry.time);
      return start < scheduleEnd && scheduleStart < end;
   }) || null;
}

function lifeConflict(draft: CalendarEventDraft, state: LifeState) {
   if (draft.allDay) return null;
   const start = localTimestamp(draft.date, draft.start);
   const end = localTimestamp(draft.date, draft.end);
   return state.items.find((item) => {
      if (item.id === draft.id || item.state !== "active" || item.kind !== "commitment" || !item.startAt) return false;
      const itemEnd = item.endAt || item.startAt + (item.durationMinutes || 30) * 60_000;
      return start < itemEnd && item.startAt < end;
   }) || null;
}

export default function CalendarWorkspace({ lifeState, rhythmState, nowMs }: { lifeState: LifeState; rhythmState: DailyRhythmState; nowMs: number }) {
   const [view, setView] = useState<CalendarView>("week");
   const [selectedDate, setSelectedDate] = useState(() => new Date());
   const [draft, setDraft] = useState<CalendarEventDraft | null>(null);
   const [conflictMessage, setConflictMessage] = useState("");
   const [forceSave, setForceSave] = useState(false);
   const [rhythmManagerOpen, setRhythmManagerOpen] = useState(false);
   const [rhythmEditTarget, setRhythmEditTarget] = useState<{ kind: "anchor" | "schedule"; id: string } | null>(null);
   const now = useMemo(() => new Date(nowMs), [nowMs]);

   const weekStart = useMemo(() => startOfWeek(selectedDate, lifeState.preferences.weekStartsOn), [selectedDate, lifeState.preferences.weekStartsOn]);
   const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return date; }), [weekStart]);
   const monthDates = useMemo(() => {
      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12, 0, 0, 0);
      const gridStart = startOfWeek(monthStart, lifeState.preferences.weekStartsOn);
      return Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date; });
   }, [selectedDate, lifeState.preferences.weekStartsOn]);
   const monthDayLabels = useMemo(() => {
      const start = lifeState.preferences.weekStartsOn;
      return Array.from({ length: 7 }, (_, index) => DAY_SHORT[(start + index) % 7]);
   }, [lifeState.preferences.weekStartsOn]);
   const selectedRows = useMemo(() => buildRows(lifeState, rhythmState, selectedDate, now), [lifeState, rhythmState, selectedDate, now]);

   function countsForDate(date: Date) {
      return lifeItemsForDate(lifeState, date).length + visibleRhythmForDate(rhythmState, date).length;
   }

   function saveDraft() {
      if (!draft?.title.trim()) return;
      const scheduleConflict = broadScheduleConflict(draft, rhythmState);
      const itemConflict = lifeConflict(draft, lifeState);
      const conflict = itemConflict ? itemConflict.title : scheduleConflict ? `${scheduleConflict.title} (${formatClock(scheduleConflict.time)}–${formatClock(scheduleConflict.endTime || scheduleConflict.time)})` : "";
      if (conflict && !forceSave) {
         setConflictMessage(`This overlaps ${conflict}. Save it anyway?`);
         setForceSave(true);
         return;
      }

      const startAt = draft.allDay ? localTimestamp(draft.date, "12:00") : localTimestamp(draft.date, draft.start);
      const endAt = draft.allDay ? undefined : localTimestamp(draft.date, draft.end);
      const values = {
         title: draft.title.trim(),
         kind: "commitment" as const,
         state: "active" as const,
         context: draft.context,
         importance: "normal" as const,
         recurrence: "none" as const,
         timingPrecision: draft.allDay ? ("day" as const) : ("exact" as const),
         dueAt: startAt,
         startAt,
         endAt,
         durationMinutes: endAt ? Math.max(5, Math.round((endAt - startAt) / 60_000)) : undefined,
         location: draft.location.trim() || undefined,
         allDay: draft.allDay,
         pinToToday: localDateKey(new Date(startAt)) === localDateKey(new Date()),
      };

      if (draft.id) updateLifeItem(draft.id, values);
      else createLifeItem(values, "user");

      // Direct calendar edits deserve the same adaptive behavior as chat edits.
      // Reconcile after the life item is saved so an off-routine commitment can
      // suppress a conflicting elastic routine without changing the base plan.
      reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());

      setDraft(null);
      setConflictMessage("");
      setForceSave(false);
   }

   function removeDraftItem() {
      if (!draft?.id) return;
      archiveLifeItem(draft.id);

      // Reconciliation is reversible: removing the event restores routines that
      // were suppressed only because of that event.
      reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());

      setDraft(null);
      setConflictMessage("");
      setForceSave(false);
   }

   function chooseDate(date: Date) {
      setSelectedDate(new Date(date));
      if (view === "month" && date.getMonth() !== selectedDate.getMonth()) setSelectedDate(new Date(date));
   }

   function renderCompactEntries(date: Date) {
      const rhythm = visibleRhythmForDate(rhythmState, date);
      const life = lifeItemsForDate(lifeState, date);
      const combined = [
         ...rhythm.map((entry) => ({ key: `r-${entry.id}`, title: entry.title, minutes: minutesFromClock(entry.time), time: formatClock(entry.time), passed: entry.status === "missed" })),
         ...life.map((item) => ({ key: `l-${item.id}`, title: item.title, minutes: lifeItemMinutes(item), time: item.allDay ? "" : new Date(item.startAt || item.dueAt || 0).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), passed: isPassedLifeItem(item, now) })),
      ].sort((a, b) => a.minutes - b.minutes);
      return combined.slice(0, 4);
   }

   return (
      <section className="day-block calendar-workspace">
         <header className="calendar-header">
            <div className="calendar-title-line"><CalendarDays size={18} /><h2>Calendar</h2></div>
            <div className="calendar-header-actions">
               <div className="calendar-view-switch" aria-label="Calendar view">
                  {(["day", "week", "month"] as CalendarView[]).map((value) => <button key={value} className={view === value ? "calendar-view-active" : ""} onClick={() => setView(value)}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
               </div>
               <button className="calendar-add" onClick={() => { setDraft(eventDraftForDate(selectedDate)); setRhythmManagerOpen(false); setRhythmEditTarget(null); setConflictMessage(""); setForceSave(false); }}><Plus size={15} /> Event</button>
               <button className="calendar-add calendar-routine-add" onClick={() => { setDraft(null); setRhythmEditTarget(null); setRhythmManagerOpen(true); }}><Repeat2 size={15} /> Routine</button>
            </div>
         </header>

         <div className="calendar-nav">
            <button className="icon-button" onClick={() => setSelectedDate((date) => shiftDate(date, -1, view))} aria-label={`Previous ${view}`}><ChevronLeft size={18} /></button>
            <button className="calendar-today-button" onClick={() => setSelectedDate(new Date())}>Today</button>
            <strong>{view === "month" ? selectedDate.toLocaleDateString([], { month: "long", year: "numeric" }) : formatSelectedDate(selectedDate)}</strong>
            <button className="icon-button" onClick={() => setSelectedDate((date) => shiftDate(date, 1, view))} aria-label={`Next ${view}`}><ChevronRight size={18} /></button>
         </div>

         {view === "week" ? (
            <div className="calendar-week-grid">
               {weekDates.map((date) => {
                  const selected = localDateKey(date) === localDateKey(selectedDate);
                  const today = localDateKey(date) === localDateKey(now);
                  return (
                     <button className={`calendar-week-day ${selected ? "calendar-date-selected" : ""} ${today ? "calendar-date-today" : ""}`} key={localDateKey(date)} onClick={() => chooseDate(date)}>
                        <span>{date.toLocaleDateString([], { weekday: "short" })}</span>
                        <strong>{date.getDate()}</strong>
                        <div>{renderCompactEntries(date).map((entry) => <i className={entry.passed ? "calendar-entry-passed" : ""} key={entry.key}><b>{entry.time}</b>{entry.title}</i>)}</div>
                     </button>
                  );
               })}
            </div>
         ) : null}

         {view === "month" ? (
            <div className="calendar-month-scroll">
               <div className="calendar-month-weekdays">{monthDayLabels.map((label) => <span key={label}>{label}</span>)}</div>
               <div className="calendar-month-grid">
               {monthDates.map((date) => {
                  const selected = localDateKey(date) === localDateKey(selectedDate);
                  const today = localDateKey(date) === localDateKey(now);
                  const outside = date.getMonth() !== selectedDate.getMonth();
                  const count = countsForDate(date);
                  return (
                     <button className={`calendar-month-day ${selected ? "calendar-date-selected" : ""} ${today ? "calendar-date-today" : ""} ${outside ? "calendar-date-outside" : ""}`} key={localDateKey(date)} onClick={() => chooseDate(date)}>
                        <strong>{date.getDate()}</strong>
                        {count ? <span>{count}</span> : null}
                     </button>
                  );
               })}
               </div>
            </div>
         ) : null}

         <div className="calendar-selected-day">
            <div className="calendar-selected-heading"><strong>{formatSelectedDate(selectedDate)}</strong><span>{selectedRows.filter((row) => row.type !== "now").length || ""}</span></div>
            <div className="calendar-day-list">
               {selectedRows.length ? selectedRows.map((row) => {
                  if (row.type === "now") return <div className="calendar-now-line" key={row.key}><span>Now</span><b>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b></div>;
                  if (row.type === "rhythm") {
                     const passed = row.rhythm.status === "missed";
                     return <div className={`calendar-day-row calendar-day-row-editable ${passed ? "calendar-entry-passed" : ""}`} key={row.key}><time>{formatClock(row.rhythm.time)}</time><div><strong>{row.rhythm.title}</strong>{row.rhythm.endTime ? <span>{formatClock(row.rhythm.time)}–{formatClock(row.rhythm.endTime)}</span> : <span>{row.rhythm.durationMinutes ? `${row.rhythm.durationMinutes} min` : row.rhythm.category}</span>}</div><button className="icon-button" onClick={() => { setDraft(null); setRhythmEditTarget({ kind: row.rhythm.kind, id: row.rhythm.sourceId }); setRhythmManagerOpen(true); }} aria-label={`Edit ${row.rhythm.title}`}><Pencil size={14} /></button></div>;
                  }
                  const passed = isPassedLifeItem(row.item, now);
                  const timestamp = row.item.startAt || row.item.dueAt;
                  return (
                     <div className={`calendar-day-row calendar-day-row-editable ${passed || row.item.state === "done" ? "calendar-entry-passed" : ""}`} key={row.key}>
                        <time>{row.item.allDay ? "All day" : timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</time>
                        <div><strong>{row.item.title}</strong><span>{row.item.location || row.item.context}</span></div>
                        <button className="icon-button" onClick={() => { setDraft(eventDraftFromItem(row.item)); setConflictMessage(""); setForceSave(false); }} aria-label={`Edit ${row.item.title}`}><Pencil size={14} /></button>
                     </div>
                  );
               }) : <div className="calendar-empty-day" />}
            </div>
         </div>


         {rhythmManagerOpen ? (
            <div className="calendar-editor calendar-rhythm-manager">
               <div className="calendar-editor-head"><strong>Schedule & routines</strong><button className="icon-button" onClick={() => { setRhythmManagerOpen(false); setRhythmEditTarget(null); }} aria-label="Close recurring schedule editor"><X size={16} /></button></div>
               <RhythmSettingsEditor
                  state={rhythmState}
                  initialScheduleId={rhythmEditTarget?.kind === "schedule" ? rhythmEditTarget.id : undefined}
                  initialAnchorId={rhythmEditTarget?.kind === "anchor" ? rhythmEditTarget.id : undefined}
               />
            </div>
         ) : null}

         {draft ? (
            <div className="calendar-editor">
               <div className="calendar-editor-head"><strong>{draft.id ? "Edit" : "Add"}</strong><button className="icon-button" onClick={() => setDraft(null)} aria-label="Close editor"><X size={16} /></button></div>
               <label><span>Title</span><input autoFocus value={draft.title} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, title: event.target.value })} placeholder="Meeting, appointment, dinner…" /></label>
               <div className="calendar-editor-grid">
                  <label><span>Date</span><input type="date" value={draft.date} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, date: event.target.value })} /></label>
                  <label><span>Type</span><select value={draft.context} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, context: event.target.value as LifeContext })}>{CONTEXTS.map((context) => <option key={context} value={context}>{context === "kin-software" ? "Kin Software" : context.charAt(0).toUpperCase() + context.slice(1)}</option>)}</select></label>
               </div>
               <label className="calendar-check-row"><input type="checkbox" checked={draft.allDay} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, allDay: event.target.checked })} /><span>All day</span></label>
               {!draft.allDay ? <div className="calendar-editor-grid"><label><span>Start</span><input type="time" value={draft.start} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, start: event.target.value })} /></label><label><span>End</span><input type="time" value={draft.end} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, end: event.target.value })} /></label></div> : null}
               <label><span>Location</span><input value={draft.location} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, location: event.target.value })} placeholder="Optional" /></label>
               {conflictMessage ? <div className="calendar-conflict">{conflictMessage}</div> : null}
               <div className="calendar-editor-actions">
                  {draft.id ? <button className="calendar-delete" onClick={removeDraftItem}><Trash2 size={14} /> Remove</button> : <span />}
                  <button className="calendar-save" onClick={saveDraft}>{forceSave ? "Save anyway" : "Save"}</button>
               </div>
            </div>
         ) : null}
      </section>
   );
}
