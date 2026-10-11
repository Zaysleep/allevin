"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { localDateKey, type DailyRhythmState } from "@/lib/dailyRhythm";
import {
   ALLEVIN_UNDO_UPDATED_EVENT,
   readAssistantUndoHistory,
   undoLastAssistantChange,
} from "@/lib/allevinUndo";

function statusLabel(state: DailyRhythmState, dateKey: string) {
   const contexts = state.dayContexts[dateKey] || [];
   const kinds = new Set(contexts.map((context) => context.kind));
   if (kinds.has("recovery")) return "Recovery day";
   if (kinds.has("work-from-home")) return "Working from home";
   if (kinds.has("sleep-in") || kinds.has("late")) return "Day adjusted";
   if (kinds.has("event-change")) return "Plans changed";
   return "Today adjusted";
}

export default function AdaptiveDayStatus({ state }: { state: DailyRhythmState }) {
   const dateKey = localDateKey(new Date());
   const [history, setHistory] = useState(() => readAssistantUndoHistory());
   const [message, setMessage] = useState("");

   useEffect(() => {
      const refresh = () => setHistory(readAssistantUndoHistory());
      window.addEventListener(ALLEVIN_UNDO_UPDATED_EVENT, refresh);
      return () => window.removeEventListener(ALLEVIN_UNDO_UPDATED_EVENT, refresh);
   }, []);

   const changeCount = useMemo(() => {
      const contexts = state.dayContexts[dateKey]?.length || 0;
      const temporary = state.temporaryEntries[dateKey]?.length || 0;
      const overrides = Object.keys(state.overrides[dateKey] || {}).length;
      const outcomes = Object.keys(state.outcomes[dateKey] || {}).length;
      const exceptions = Object.keys(state.scheduleExceptions[dateKey] || {}).length;
      return contexts + temporary + overrides + outcomes + exceptions;
   }, [dateKey, state]);

   if (!changeCount) return null;

   function undo() {
      const result = undoLastAssistantChange();
      setMessage(result.restored ? "The last ALLEVIN change was restored." : "There is no recent change to restore.");
      setHistory(readAssistantUndoHistory());
   }

   return (
      <section className="adaptive-day-status" aria-live="polite">
         <div>
            <span>ACTIVE DAY</span>
            <strong>{statusLabel(state, dateKey)}</strong>
            <p>{changeCount} temporary {changeCount === 1 ? "change" : "changes"} for today. Your regular schedule is untouched.</p>
            {history[0] ? <small>Latest: {history[0].label}</small> : null}
            {message ? <small>{message}</small> : null}
         </div>
         <button type="button" onClick={undo} disabled={!history.length}><RotateCcw size={15} /> Undo last change</button>
      </section>
   );
}
