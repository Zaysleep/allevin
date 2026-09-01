"use client";

import { BellPlus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { nextLifeOccurrence } from "@/lib/lifeStore";
import type { KinActionItemInput, LifeItem, LifeRecurrence, LifeRepeatRule } from "@/lib/lifeTypes";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateValue(date: Date) {
   return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minutesFromTime(value: string) {
   const [hour, minute] = value.split(":").map(Number);
   return hour * 60 + minute;
}

function atLocalTime(value: string) {
   const date = new Date();
   const minutes = minutesFromTime(value);
   date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
   return date.getTime();
}

interface Props {
   onCreate: (input: KinActionItemInput) => void;
   onClose: () => void;
}

export default function ManualReminderForm({ onCreate, onClose }: Props) {
   const tomorrow = useMemo(() => {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      return localDateValue(date);
   }, []);
   const [title, setTitle] = useState("");
   const [repeat, setRepeat] = useState<LifeRecurrence>("none");
   const [date, setDate] = useState(tomorrow);
   const [clock, setClock] = useState("09:00");
   const [start, setStart] = useState("08:00");
   const [end, setEnd] = useState("22:00");
   const [interval, setInterval] = useState(60);
   const [days, setDays] = useState<number[]>([new Date().getDay()]);
   const [monthDay, setMonthDay] = useState(1);
   const [error, setError] = useState("");
   const [saved, setSaved] = useState("");

   function submit() {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
         setError("Give the reminder a name.");
         return;
      }

      const now = Date.now();
      if (repeat === "none") {
         const dueAt = new Date(`${date}T${clock}:00`).getTime();
         if (!Number.isFinite(dueAt) || dueAt <= now) {
            setError("Choose a time that is still ahead.");
            return;
         }
         onCreate({
            title: cleanTitle,
            kind: "task",
            state: "active",
            context: "personal",
            importance: "normal",
            recurrence: "none",
            timingPrecision: "exact",
            dueAt,
            allDay: false,
            pinToToday: new Date(dueAt).toDateString() === new Date().toDateString(),
         });
      } else {
         if (repeat === "weekly" && !days.length) {
            setError("Choose at least one day.");
            return;
         }
         const startMinutes = minutesFromTime(start);
         const endMinutes = minutesFromTime(end);
         if (repeat === "interval" && endMinutes <= startMinutes) {
            setError("The ending time needs to come after the starting time.");
            return;
         }
         const baseAt = repeat === "interval" ? atLocalTime(start) : atLocalTime(clock);
         const rule: LifeRepeatRule = {
            frequency: repeat,
            intervalMinutes: repeat === "interval" ? Math.max(5, interval) : undefined,
            cadence: "exact",
            scope: "every-day",
            windowStartMinutes: repeat === "interval" ? startMinutes : undefined,
            windowEndMinutes: repeat === "interval" ? endMinutes : undefined,
            timeMinutes: repeat === "interval" ? undefined : minutesFromTime(clock),
            daysOfWeek: repeat === "weekly" ? days : undefined,
            monthlyDay: repeat === "monthly" ? Math.max(1, Math.min(31, monthDay)) : undefined,
            shorterMonthPolicy: repeat === "monthly" && monthDay > 28 ? "last-day" : undefined,
            seriesStartedAt: now,
            stopWhenCompleted: false,
            paused: false,
            userEdited: true,
         };
         const preview: LifeItem = {
            id: "manual-preview",
            title: cleanTitle,
            details: "",
            kind: "routine",
            state: "active",
            context: "personal",
            importance: "normal",
            recurrence: repeat,
            repeatRule: rule,
            timingPrecision: "exact",
            dueAt: baseAt,
            allDay: false,
            pinToToday: false,
            source: "user",
            createdAt: now,
            updatedAt: now,
         };
         const dueAt = nextLifeOccurrence(preview, now + 1);
         if (!dueAt) {
            setError("That repeat schedule needs one more look.");
            return;
         }
         onCreate({
            title: cleanTitle,
            kind: "routine",
            state: "active",
            context: "personal",
            importance: "normal",
            recurrence: repeat,
            repeatRule: rule,
            timingPrecision: "exact",
            dueAt,
            allDay: false,
            pinToToday: false,
         });
      }

      setError("");
      setSaved(`${cleanTitle} is saved.`);
      setTitle("");
   }

   return (
      <section className="manual-reminder" aria-labelledby="manual-reminder-heading">
         <header>
            <div>
               <span className="manual-reminder-kicker"><BellPlus size={15} /> New reminder</span>
               <h3 id="manual-reminder-heading">Add it yourself</h3>
               <p>Use this when typing it out is faster than opening chat.</p>
            </div>
            <button type="button" className="manual-reminder-close" onClick={onClose} aria-label="Close reminder form"><X size={18} /></button>
         </header>

         <div className="manual-reminder-fields">
            <label className="manual-reminder-name">Name<input value={title} onChange={(event) => { setTitle(event.target.value); setSaved(""); }} placeholder="Drink water" autoFocus /></label>
            <label>Repeats<select value={repeat} onChange={(event) => { setRepeat(event.target.value as LifeRecurrence); setError(""); }}>
               <option value="none">One time</option>
               <option value="interval">Every few minutes or hours</option>
               <option value="daily">Every day</option>
               <option value="weekdays">Every weekday</option>
               <option value="weekly">Selected days</option>
               <option value="monthly">Every month</option>
            </select></label>

            {repeat === "none" ? <>
               <label>Date<input type="date" value={date} min={localDateValue(new Date())} onChange={(event) => setDate(event.target.value)} /></label>
               <label>Time<input type="time" value={clock} onChange={(event) => setClock(event.target.value)} /></label>
            </> : null}

            {repeat === "interval" ? <>
               <label>Every<select value={interval} onChange={(event) => setInterval(Number(event.target.value))}>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="180">3 hours</option>
                  <option value="240">4 hours</option>
               </select></label>
               <label>Starts<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label>
               <label>Stops<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
            </> : null}

            {repeat !== "none" && repeat !== "interval" ? <label>Time<input type="time" value={clock} onChange={(event) => setClock(event.target.value)} /></label> : null}
            {repeat === "monthly" ? <label>Day of month<input type="number" min="1" max="31" value={monthDay} onChange={(event) => setMonthDay(Number(event.target.value))} /></label> : null}
         </div>

         {repeat === "weekly" ? <fieldset className="manual-reminder-days"><legend>Days</legend>{DAYS.map((day, index) => <button key={day} type="button" className={days.includes(index) ? "selected" : ""} onClick={() => setDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])}>{day}</button>)}</fieldset> : null}

         {error ? <p className="manual-reminder-error" role="alert">{error}</p> : null}
         {saved ? <p className="manual-reminder-saved" role="status">{saved}</p> : null}
         <div className="manual-reminder-actions">
            <button type="button" onClick={submit}>Add reminder</button>
            <button type="button" onClick={onClose}>Cancel</button>
         </div>
      </section>
   );
}
