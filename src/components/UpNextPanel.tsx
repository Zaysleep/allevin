"use client";

import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getProactiveRecommendation, recordRecommendationOutcomeForRhythm, RECOMMENDATION_UPDATED_EVENT, type ProactiveRecommendation } from "@/lib/allevinRecommendations";
import { requestUpNextCopy } from "@/lib/allevinUpNextCopy";
import { ALLEVIN_TONE_UPDATED_EVENT, readAllevinTone } from "@/lib/allevinVoice";
import { formatClock, type DailyRhythmState, type RhythmAnchorId } from "@/lib/dailyRhythm";
import type { LifeState } from "@/lib/lifeTypes";
import { buildUpNextItem, minutesAvailableForUpNext, suggestionCategoryForUpNext, upNextTimeLabel } from "@/lib/upNextIntelligence";

export default function UpNextPanel({
   lifeState,
   rhythmState,
   nowMs,
   onCompleteRhythm,
}: {
   lifeState: LifeState;
   rhythmState: DailyRhythmState;
   nowMs: number;
   onCompleteRhythm: (id: RhythmAnchorId, done: boolean) => void;
}) {
   const next = useMemo(() => buildUpNextItem(lifeState, rhythmState, nowMs), [lifeState, rhythmState, nowMs]);
   const [suggestion, setSuggestion] = useState<ProactiveRecommendation | null>(null);
   const [narratedSuggestion, setNarratedSuggestion] = useState<ProactiveRecommendation | null>(null);
   const [recommendationTick, setRecommendationTick] = useState(0);

   useEffect(() => {
      const refresh = () => setRecommendationTick((value) => value + 1);
      window.addEventListener(RECOMMENDATION_UPDATED_EVENT, refresh);
      window.addEventListener(ALLEVIN_TONE_UPDATED_EVENT, refresh);
      return () => {
         window.removeEventListener(RECOMMENDATION_UPDATED_EVENT, refresh);
         window.removeEventListener(ALLEVIN_TONE_UPDATED_EVENT, refresh);
      };
   }, []);

   useEffect(() => {
      if (!next) {
         setSuggestion(null);
         setNarratedSuggestion(null);
         return;
      }
      // A long schedule block such as Work already says what is happening.
      // Adding a generic productivity card underneath it made the assistant
      // feel robotic, so stay quiet unless there is a concrete activity where
      // contextual guidance can genuinely help.
      if (next.rhythm?.kind === "schedule") {
         setSuggestion(null);
         setNarratedSuggestion(null);
         return;
      }
      const category = suggestionCategoryForUpNext(next);
      const minutes = minutesAvailableForUpNext(next, nowMs);
      setSuggestion(getProactiveRecommendation(`${next.dateKey}:${next.id}`, category, minutes, next.title));
   }, [next, lifeState, rhythmState, nowMs, recommendationTick]);

   useEffect(() => {
      if (!next || !suggestion) {
         setNarratedSuggestion(null);
         return;
      }

      // The recommendation assignment is deterministic and stable. The card
      // copy is presentation, so let the server-side model phrase that exact
      // lane around the actual Up Next subject. This keeps any routine, class,
      // errand, or custom activity from receiving generic transition text.
      // Do not flash the deterministic template while personal copy loads.
      // If the language request fails, the clean Up Next fact remains useful
      // on its own and no filler card is shown.
      setNarratedSuggestion(null);
      let cancelled = false;
      const tone = readAllevinTone();
      const minutes = minutesAvailableForUpNext(next, nowMs);
      const timingLabel = upNextTimeLabel(next, nowMs);

      void requestUpNextCopy({
         cacheKey: `${next.dateKey}:${next.id}:${suggestion.optionId}:${tone}`,
         subject: next.title,
         category: suggestion.category,
         minutes,
         timingLabel,
         recommendationTitle: suggestion.title,
         recommendationDetail: suggestion.detail,
         focus: suggestion.focus,
         voiceStyle: tone,
      }).then((copy) => {
         if (cancelled || !copy) return;
         setNarratedSuggestion({ ...suggestion, title: copy.title, detail: copy.detail });
      });

      return () => {
         cancelled = true;
      };
   }, [next, suggestion, nowMs, recommendationTick]);

   return (
      <section className="day-block up-next-block" aria-label="Up next">
         <header className="day-block-header"><h2>Up Next</h2></header>
         {next ? (
            <div className={`up-next-content ${suggestion ? "" : "up-next-content-solo"}`}>
               <div className="up-next-main">
                  <div className="up-next-time">{upNextTimeLabel(next, nowMs)}</div>
                  <div className="up-next-title-row">
                     <h3>{next.title}</h3>
                     {next.source === "rhythm" && next.rhythm?.canComplete ? (
                        <button
                           className="up-next-complete"
                           onClick={() => {
                              const sourceId = next.rhythm!.sourceId as RhythmAnchorId;

                              // Progression should learn from the exact routine
                              // occurrence the user completed, not merely from
                              // whichever recommendation option was used most recently.
                              if (suggestion) {
                                 recordRecommendationOutcomeForRhythm(next.dateKey, sourceId, "accepted");
                              }
                              onCompleteRhythm(sourceId, true);
                           }}
                           aria-label={`Complete ${next.title}`}
                        >
                           <Check size={14} /> Done
                        </button>
                     ) : null}
                  </div>
                  {next.rhythm?.endTime ? <span className="up-next-range">{formatClock(next.rhythm.time)}–{formatClock(next.rhythm.endTime)}</span> : null}
               </div>

               {narratedSuggestion ? (
                  <aside className="up-next-suggestion" aria-label="ALLEVIN recommendation">
                     <strong>{narratedSuggestion.title}</strong>
                     <p>{narratedSuggestion.detail}</p>
                  </aside>
               ) : null}
            </div>
         ) : (
            <div className="up-next-clear">
               <strong>Nothing needs your attention right now.</strong>
            </div>
         )}
      </section>
   );
}
