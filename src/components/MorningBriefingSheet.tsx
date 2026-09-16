"use client";

import { ArrowRight, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { sanitizeMorningBriefing, type AllevinMorningBriefing } from "@/lib/allevinBriefing";
import { readInterestPreferences, minutesFromInterestTime } from "@/lib/allevinInterests";
import { buildRhythmForDate, localDateKey, readDailyRhythm } from "@/lib/dailyRhythm";
import { readAllevinTone } from "@/lib/allevinVoice";

const CACHE_PREFIX = "allevin-morning-briefing-cache-mkxxv-1:";
const DISMISSED_PREFIX = "allevin-morning-briefing-dismissed-mkxxv-1:";

function displayClock(value: string) {
   const [hours, minutes] = value.split(":").map(Number);
   const suffix = hours >= 12 ? "PM" : "AM";
   return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function readCached(dateKey: string) {
   try {
      return sanitizeMorningBriefing(JSON.parse(window.localStorage.getItem(`${CACHE_PREFIX}${dateKey}`) || "null"));
   } catch {
      return null;
   }
}

function formatUpdatedAt(timestamp: number) {
   return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

export default function MorningBriefingSheet() {
   const [open, setOpen] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState("");
   const [briefing, setBriefing] = useState<AllevinMorningBriefing | null>(null);

   const loadBriefing = useCallback(async (force = false) => {
      const now = new Date();
      const dateKey = localDateKey(now);
      if (!force) {
         const cached = readCached(dateKey);
         if (cached) {
            setBriefing(cached);
            setError("");
            return;
         }
      }

      setLoading(true);
      setError("");
      try {
         const preferences = readInterestPreferences();
         const scheduleFacts = [
            `Briefing delivery time: ${displayClock(preferences.briefing.time)} local time`,
            ...buildRhythmForDate(readDailyRhythm(), now)
               .filter((entry) => !entry.completed && !entry.skipped)
               .slice(0, 12)
               .map((entry) => `${displayClock(entry.time)}${entry.endTime ? `–${displayClock(entry.endTime)}` : ""} ${entry.title}`),
         ];
         const tone = readAllevinTone();
         const response = await fetch("/api/allevin/interests", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               action: "briefing",
               preferences,
               request: "Prepare my morning briefing for today.",
               tone,
               context: {
                  kind: "briefing",
                  occurrenceKey: `${dateKey}:briefing:view`,
                  preferences,
                  scheduledAt: Date.now(),
                  tone,
                  scheduleFacts,
               },
            }),
         });
         const payload = await response.json() as { ok?: boolean; briefing?: unknown; error?: string; observedAt?: number };
         const next = payload.ok ? sanitizeMorningBriefing(payload.briefing, payload.observedAt) : null;
         if (!next) throw new Error(payload.error || "The briefing could not be prepared right now.");
         window.localStorage.setItem(`${CACHE_PREFIX}${dateKey}`, JSON.stringify(next));
         setBriefing(next);
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : "The briefing could not be prepared right now.");
      } finally {
         setLoading(false);
      }
   }, []);

   const showBriefing = useCallback((force = false) => {
      setOpen(true);
      void loadBriefing(force);
   }, [loadBriefing]);

   useEffect(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("interest") === "briefing") {
         url.searchParams.delete("interest");
         window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
         const timer = window.setTimeout(() => showBriefing(false), 0);
         return () => window.clearTimeout(timer);
      }
   }, [showBriefing]);

   useEffect(() => {
      const checkScheduledBriefing = () => {
         const preferences = readInterestPreferences();
         if (!preferences.briefing.enabled) return;
         const now = new Date();
         if (!preferences.briefing.days.includes(now.getDay())) return;
         const minutesNow = now.getHours() * 60 + now.getMinutes();
         const scheduled = minutesFromInterestTime(preferences.briefing.time);
         if (minutesNow < scheduled || minutesNow > scheduled + 3) return;
         const dateKey = localDateKey(now);
         if (window.localStorage.getItem(`${DISMISSED_PREFIX}${dateKey}`) === "true") return;
         showBriefing(false);
      };
      const first = window.setTimeout(checkScheduledBriefing, 500);
      const timer = window.setInterval(checkScheduledBriefing, 20_000);
      return () => {
         window.clearTimeout(first);
         window.clearInterval(timer);
      };
   }, [showBriefing]);

   function dismiss() {
      window.localStorage.setItem(`${DISMISSED_PREFIX}${localDateKey(new Date())}`, "true");
      setOpen(false);
   }

   function askAllevin() {
      setOpen(false);
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("allevin-kin-focus")), 80);
   }

   if (!open) return null;

   return (
      <div className="morning-briefing-backdrop" role="presentation">
         <section className="morning-briefing-sheet" role="dialog" aria-modal="true" aria-labelledby="morning-briefing-title">
            <header className="morning-briefing-header">
               <div>
                  <span>ALLEVIN · MORNING BRIEFING</span>
                  <h2 id="morning-briefing-title">{briefing?.headline || "Preparing your morning"}</h2>
               </div>
               <button type="button" className="icon-button" onClick={dismiss} aria-label="Dismiss morning briefing"><X size={20} /></button>
            </header>

            {loading && !briefing ? <div className="morning-briefing-loading">Gathering what matters for today…</div> : null}

            {error && !briefing ? (
               <div className="morning-briefing-error" role="status">
                  <p>{error}</p>
                  <button type="button" onClick={() => void loadBriefing(true)}><RefreshCw size={15} /> Try again</button>
               </div>
            ) : null}

            {briefing ? (
               <div className="morning-briefing-content">
                  <p className="morning-briefing-summary">{briefing.summary}</p>
                  <div className="morning-briefing-sections">
                     {briefing.sections.map((section) => (
                        <section key={section.id} className={`morning-briefing-section morning-briefing-${section.id}`}>
                           <h3>{section.title}</h3>
                           <ul>{section.items.map((item, index) => <li key={`${section.id}-${index}`}>{item}</li>)}</ul>
                        </section>
                     ))}
                  </div>
                  {briefing.closing ? <p className="morning-briefing-closing">{briefing.closing}</p> : null}
                  <p className="morning-briefing-updated">Updated at {formatUpdatedAt(briefing.observedAt)}</p>
               </div>
            ) : null}

            <footer className="morning-briefing-actions">
               <button type="button" className="morning-briefing-secondary" onClick={askAllevin}>Ask ALLEVIN about today <ArrowRight size={15} /></button>
               <button type="button" className="morning-briefing-primary" onClick={dismiss}>Done for now</button>
            </footer>
         </section>
      </div>
   );
}
