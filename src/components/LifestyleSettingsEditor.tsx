"use client";

import { Plus, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

import {
   LIFESTYLE_PROFILE_UPDATED_EVENT,
   readLifestyleProfile,
   removeFlexibleChoiceSet,
   setCommuteMinutes,
   setPreferredBedtime,
   upsertFlexibleChoiceSet,
   type FlexibleChoiceSet,
   type LifestylePeriod,
} from "@/lib/allevinLifestyleProfile";

function periodLabel(period: LifestylePeriod) {
   if (period === "morning") return "Morning";
   if (period === "afternoon") return "Afternoon";
   if (period === "evening") return "Evening";
   return "Any time";
}

export default function LifestyleSettingsEditor() {
   const [bedtime, setBedtime] = useState("");
   const [commute, setCommute] = useState("");
   const [sets, setSets] = useState<FlexibleChoiceSet[]>([]);
   const [draftChoices, setDraftChoices] = useState("");
   const [draftPeriod, setDraftPeriod] = useState<LifestylePeriod>("evening");

   function refresh() {
      const state = readLifestyleProfile();
      setBedtime(state.preferredBedtime || "");
      setCommute(state.commuteMinutes ? String(state.commuteMinutes) : "");
      setSets(state.flexibleChoiceSets);
   }

   useEffect(() => {
      refresh();
      window.addEventListener(LIFESTYLE_PROFILE_UPDATED_EVENT, refresh);
      return () => window.removeEventListener(LIFESTYLE_PROFILE_UPDATED_EVENT, refresh);
   }, []);

   function saveBasics() {
      setPreferredBedtime(bedtime || undefined);
      setCommuteMinutes(commute ? Number(commute) : undefined);
   }

   function addSet() {
      const choices = draftChoices
         .split(/\s*(?:,|\/|\bor\b)\s*/i)
         .map((choice) => choice.trim())
         .filter(Boolean);

      if (choices.length < 2) return;

      const existing = sets.find((set) => set.period === draftPeriod);
      upsertFlexibleChoiceSet({
         id: existing?.id,
         title: `${periodLabel(draftPeriod)} options`,
         period: draftPeriod,
         choices,
      });
      setDraftChoices("");
   }

   return (
      <section className="settings-group">
         <div className="settings-group-heading">
            <strong>Lifestyle</strong>
         </div>

         <div className="settings-time-row">
            <label>
               <span>Bedtime</span>
               <input
                  type="time"
                  value={bedtime}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setBedtime(event.target.value)}
               />
            </label>
            <label>
               <span>Travel buffer</span>
               <input
                  type="number"
                  min={1}
                  max={240}
                  value={commute}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setCommute(event.target.value)}
                  placeholder="Minutes"
               />
            </label>
         </div>

         <button className="settings-inline-button" type="button" onClick={saveBasics}>Save lifestyle</button>

         <div className="settings-divider" />

         <div className="settings-group-heading">
            <strong>Flexible choices</strong>
         </div>

         {sets.length ? (
            <div className="settings-summary-list">
               {sets.map((set) => (
                  <div className="settings-summary-row settings-summary-row-editable" key={set.id}>
                     <div>
                        <strong>{periodLabel(set.period)}</strong>
                        <span>{set.choices.join(" · ")}</span>
                     </div>
                     <div className="settings-row-actions">
                        <button className="icon-button" type="button" onClick={() => removeFlexibleChoiceSet(set.id)} aria-label={`Remove ${set.title}`}>
                           <X size={14} />
                        </button>
                     </div>
                  </div>
               ))}
            </div>
         ) : null}

         <div className="settings-edit-card">
            <label>
               <span>When</span>
               <select value={draftPeriod} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraftPeriod(event.target.value as LifestylePeriod)}>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="anytime">Any time</option>
               </select>
            </label>
            <label>
               <span>Options</span>
               <input
                  value={draftChoices}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftChoices(event.target.value)}
                  placeholder="Reading, gaming, coding…"
               />
            </label>
            <button className="settings-primary-action" type="button" onClick={addSet}>
               <Plus size={14} /> Save choices
            </button>
         </div>
      </section>
   );
}
