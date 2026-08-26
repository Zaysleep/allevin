"use client";

import { Bell, ChevronLeft, ChevronRight, Pencil, Share2, Smartphone, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
   applyOnboardingDraft,
   buildOnboardingDayPreview,
   createBlankRoutineDraft,
   createBlankScheduleDraft,
   deviceTimezoneLabel,
   isInstalledPwa,
   isIosDevice,
   markOnboardingState,
   onboardingDraftFromCurrentState,
   type OnboardingDraft,
   type OnboardingMode,
   type OnboardingRoutineDraft,
   type OnboardingScheduleDraft,
} from "@/lib/allevinOnboarding";
import type { AllevinTone } from "@/lib/allevinVoice";
import type { RhythmDay } from "@/lib/dailyRhythm";

const DAYS: Array<{ value: RhythmDay; label: string }> = [
   { value: 0, label: "Sun" },
   { value: 1, label: "Mon" },
   { value: 2, label: "Tue" },
   { value: 3, label: "Wed" },
   { value: 4, label: "Thu" },
   { value: 5, label: "Fri" },
   { value: 6, label: "Sat" },
];

const STEP_TITLES = ["Welcome", "Your name", "Your schedule", "Your routines", "Your free time", "A few details", "Review", "Notifications"];

const COMMON_ROUTINES: Array<{ title: string; timing: "before" | "after" }> = [
   { title: "Workout", timing: "before" },
   { title: "Get ready", timing: "before" },
   { title: "Meal", timing: "before" },
   { title: "Commute", timing: "before" },
   { title: "Wind down", timing: "after" },
];

function toggleDay(days: RhythmDay[], day: RhythmDay) {
   return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort();
}

function DayPicker({ value, onChange }: { value: RhythmDay[]; onChange: (days: RhythmDay[]) => void }) {
   return (
      <div className="onboarding-day-picker" role="group" aria-label="Days">
         {DAYS.map((day) => (
            <button key={day.value} type="button" className={value.includes(day.value) ? "is-selected" : ""} onClick={() => onChange(toggleDay(value, day.value))}>
               {day.label}
            </button>
         ))}
      </div>
   );
}

function scheduleLabel(block: OnboardingScheduleDraft) {
   if (block.title.trim()) return block.title.trim();
   if (block.category === "work") return "Work";
   if (block.category === "school") return "Class";
   return "Regular commitment";
}

function toneLabel(tone: AllevinTone) {
   if (tone === "direct") return "Direct";
   if (tone === "calm") return "Gentle";
   return "Balanced";
}

function readableClock(clock: string) {
   const [hours, minutes] = clock.split(":").map(Number);
   const date = new Date(2000, 0, 1, hours || 0, minutes || 0);
   return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function readableDays(days: RhythmDay[]) {
   if (days.length === 7) return "Every day";
   return days
      .map((day) => DAYS.find((item) => item.value === day)?.label || "")
      .filter(Boolean)
      .join(", ");
}

function readableDuration(minutes: number) {
   const safe = Math.max(0, Math.round(minutes || 0));
   const hours = Math.floor(safe / 60);
   const remainder = safe % 60;
   if (hours && remainder) return `${hours} hr ${remainder} min`;
   if (hours) return `${hours} hr`;
   return `${remainder} min`;
}

function relativeTimingValue(routine: OnboardingRoutineDraft) {
   if (routine.timing === "fixed" || !routine.scheduleBlockId) return "fixed";
   return `${routine.timing}:${routine.scheduleBlockId}`;
}

function routineReferenceBlocks(blocks: OnboardingScheduleDraft[]) {
   const seen = new Set<string>();
   return blocks.filter((block) => {
      if (block.category === "other") return true;
      if (seen.has(block.category)) return false;
      seen.add(block.category);
      return true;
   });
}

function routineReferenceLabel(block: OnboardingScheduleDraft, blocks: OnboardingScheduleDraft[]) {
   const base = scheduleLabel(block);
   const sameCategoryCount = blocks.filter((candidate) => candidate.category === block.category).length;
   if (block.category !== "other" && sameCategoryCount > 1) return `${base} (all ${base} days)`;
   return base;
}

function routineReviewDetail(routine: OnboardingRoutineDraft, blocks: OnboardingScheduleDraft[]) {
   const duration = readableDuration(routine.durationMinutes);
   if (routine.timing === "fixed") {
      return `${duration} · ${readableDays(routine.days)} at ${readableClock(routine.time)}`;
   }
   const block = blocks.find((item) => item.id === routine.scheduleBlockId);
   const reference = block ? routineReferenceLabel(block, blocks) : "your schedule";
   const relation = routine.timing === "before" ? `Before ${reference}` : `After ${reference}`;
   return `${duration} · ${relation} · Usually ${readableClock(routine.time)}`;
}

export default function OnboardingFlow({
   mode,
   onClose,
   onComplete,
   onEnableReminders,
   remindersEnabled,
}: {
   mode: OnboardingMode;
   onClose: () => void;
   onComplete: () => void;
   onEnableReminders: () => Promise<NotificationPermission | "unsupported">;
   remindersEnabled: boolean;
}) {
   const [step, setStep] = useState(mode === "install" ? 7 : 0);
   const [draft, setDraft] = useState<OnboardingDraft>(() => onboardingDraftFromCurrentState());
   const [error, setError] = useState("");
   const [committed, setCommitted] = useState(false);
   const [enabling, setEnabling] = useState(false);
   const [permissionMessage, setPermissionMessage] = useState("");
   const [standalone, setStandalone] = useState(false);
   const [ios, setIos] = useState(false);
   const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
   const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);

   useEffect(() => {
      const refreshInstallState = () => setStandalone(isInstalledPwa());
      const initialCheck = window.setTimeout(() => {
         refreshInstallState();
         setIos(isIosDevice());
      }, 0);
      window.addEventListener("focus", refreshInstallState);
      document.addEventListener("visibilitychange", refreshInstallState);
      return () => {
         window.clearTimeout(initialCheck);
         window.removeEventListener("focus", refreshInstallState);
         document.removeEventListener("visibilitychange", refreshInstallState);
      };
   }, []);

   const timezone = useMemo(() => deviceTimezoneLabel(), []);
   const previewDay = useMemo<RhythmDay>(() => {
      if (draft.scheduleBlocks.some((block) => block.days.includes(1))) return 1;
      return draft.scheduleBlocks.flatMap((block) => block.days)[0] ?? 1;
   }, [draft.scheduleBlocks]);
   const previewRows = useMemo(() => buildOnboardingDayPreview(draft, previewDay), [draft, previewDay]);

   function updateSchedule(id: string, patch: Partial<OnboardingScheduleDraft>) {
      setDraft((current) => ({
         ...current,
         scheduleBlocks: current.scheduleBlocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
      }));
   }

   function removeSchedule(id: string) {
      setDraft((current) => ({
         ...current,
         scheduleBlocks: current.scheduleBlocks.filter((block) => block.id !== id),
         routines: current.routines.map((routine) => (routine.scheduleBlockId === id ? { ...routine, timing: "fixed", scheduleBlockId: undefined } : routine)),
      }));
   }

   function updateRoutine(id: string, patch: Partial<OnboardingRoutineDraft>) {
      setDraft((current) => ({
         ...current,
         routines: current.routines.map((routine) => (routine.id === id ? { ...routine, ...patch } : routine)),
      }));
   }

   function addSchedule(category: OnboardingScheduleDraft["category"], title: string) {
      const block = { ...createBlankScheduleDraft(), category, title };
      setDraft((current) => ({ ...current, scheduleBlocks: [...current.scheduleBlocks, block] }));
      setActiveScheduleId(block.id);
   }

   function addRoutine(title = "", timing: "before" | "after" = "before") {
      setDraft((current) => {
         const routine = createBlankRoutineDraft(current.scheduleBlocks[0]?.id);
         const next: OnboardingDraft = {
            ...current,
            routines: [
               ...current.routines,
               {
                  ...routine,
                  title,
                  timing: current.scheduleBlocks.length ? timing : "fixed",
               },
            ],
         };
         window.setTimeout(() => setActiveRoutineId(routine.id), 0);
         return next;
      });
   }

   function updateRoutineTiming(routine: OnboardingRoutineDraft, value: string) {
      if (value === "fixed") {
         updateRoutine(routine.id, { timing: "fixed", scheduleBlockId: undefined });
         return;
      }
      const [timing, scheduleBlockId] = value.split(":");
      if ((timing === "before" || timing === "after") && scheduleBlockId) {
         updateRoutine(routine.id, { timing, scheduleBlockId });
      }
   }

   function updateRoutineDurationPart(routine: OnboardingRoutineDraft, part: "hours" | "minutes", rawValue: string) {
      const currentHours = Math.floor((routine.durationMinutes || 0) / 60);
      const currentMinutes = (routine.durationMinutes || 0) % 60;
      const parsed = rawValue === "" ? 0 : Math.max(0, Number(rawValue) || 0);
      const hours = part === "hours" ? Math.min(6, parsed) : currentHours;
      const minutes = part === "minutes" ? Math.min(59, parsed) : currentMinutes;
      updateRoutine(routine.id, { durationMinutes: hours * 60 + minutes });
   }

   function skipSetup() {
      markOnboardingState("skipped");
      onClose();
   }

   function continueFromName() {
      if (!draft.name.trim()) {
         setError("Add the name you want ALLEVIN to use.");
         return;
      }
      setError("");
      setStep(2);
   }

   function commitSetup() {
      try {
         applyOnboardingDraft(draft);
         setCommitted(true);
         setError("");
         setStep(7);
      } catch (problem) {
         setError(problem instanceof Error ? problem.message : "Something in setup needs another look.");
      }
   }

   async function enableReminders() {
      setEnabling(true);
      setPermissionMessage("");
      const result = await onEnableReminders();
      setEnabling(false);
      if (result === "granted") setPermissionMessage("Reminders are on. ALLEVIN can now schedule the day from this device.");
      else if (result === "unsupported") setPermissionMessage("This browser cannot enable notifications here. Use the installed ALLEVIN app on your phone.");
      else setPermissionMessage("Notifications are still off. You can turn them on later from Settings.");
   }

   function finish() {
      markOnboardingState("completed");
      onComplete();
   }

   return (
      <div className="onboarding-shell" role="dialog" aria-modal="true" aria-label="Set up ALLEVIN">
         <div className="onboarding-card">
            <header className="onboarding-topbar">
               <div className="onboarding-brand">
                  <img src="/allevin-logo-clean.png" alt="ALLEVIN" />
               </div>
               <div className="onboarding-progress" aria-label={`Step ${Math.min(step + 1, STEP_TITLES.length)} of ${STEP_TITLES.length}`}>
                  {mode === "setup" ? `${Math.min(step + 1, STEP_TITLES.length)} / ${STEP_TITLES.length}` : "Phone setup"}
               </div>
               <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                     if (mode === "setup" && !committed) markOnboardingState("skipped");
                     onClose();
                  }}
                  aria-label="Close setup"
               >
                  <X size={18} />
               </button>
            </header>

            <div className="onboarding-body">
               {step === 0 ? (
                  <section className="onboarding-intro">
                     <span className="onboarding-kicker">A quick setup</span>
                     <h1>Meet ALLEVIN.</h1>
                     <p>Tell me what your days usually look like, and I’ll help keep everything moving when plans change.</p>
                     <div className="onboarding-actions onboarding-actions-start">
                        <button className="onboarding-primary" type="button" onClick={() => setStep(1)}>
                           Get started <ChevronRight size={17} />
                        </button>
                        <button className="onboarding-secondary" type="button" onClick={skipSetup}>
                           Skip for now
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 1 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">Make it yours</span>
                     <h2>What should I call you?</h2>
                     <p>This is just for making ALLEVIN feel a little more personal.</p>
                     <label className="onboarding-field onboarding-field-large">
                        <span>Name</span>
                        <input autoFocus value={draft.name} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })} placeholder="Your name" maxLength={40} />
                     </label>
                     {error ? <p className="onboarding-error">{error}</p> : null}
                     <div className="onboarding-actions">
                        <button className="onboarding-back" onClick={() => setStep(0)}>
                           <ChevronLeft size={16} /> Back
                        </button>
                        <button className="onboarding-primary" onClick={continueFromName}>
                           Continue <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 2 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">Your normal week</span>
                     <h2>What stays on your calendar most weeks?</h2>
                     <p>Add the regular commitments ALLEVIN should plan around, like work, school, classes, or caregiving. If your week is unpredictable, you can leave this empty and add things later.</p>

                     <div className="onboarding-quick-add">
                        <span>Quick add</span>
                        <div className="onboarding-choice-row">
                           <button type="button" onClick={() => addSchedule("work", "Work")}>
                              + Work
                           </button>
                           <button type="button" onClick={() => addSchedule("school", "Class")}>
                              + School or class
                           </button>
                           <button type="button" onClick={() => addSchedule("other", "")}>
                              + Something else
                           </button>
                        </div>
                     </div>

                     {draft.scheduleBlocks.length ? (
                        <div className="onboarding-stack">
                           {draft.scheduleBlocks.map((block) => (
                              <article className="onboarding-edit-card" key={block.id}>
                                 <div className="onboarding-card-head">
                                    <button type="button" className="onboarding-summary-button" aria-expanded={activeScheduleId === block.id} onClick={() => setActiveScheduleId(activeScheduleId === block.id ? null : block.id)}>
                                       <span className="onboarding-summary-copy">
                                          <strong>{scheduleLabel(block)}</strong>
                                          <span>
                                             {readableDays(block.days)} · {readableClock(block.start)}–{readableClock(block.end)}
                                          </span>
                                       </span>
                                       <span className="onboarding-edit-cue">
                                          <Pencil size={13} aria-hidden="true" /> Edit
                                       </span>
                                    </button>
                                    <button className="icon-button" type="button" onClick={() => removeSchedule(block.id)} aria-label="Remove regular commitment">
                                       <X size={15} />
                                    </button>
                                 </div>
                                 {activeScheduleId === block.id ? (
                                    <>
                                       <div className="onboarding-grid-two">
                                          <label className="onboarding-field">
                                             <span>What is it?</span>
                                             <select value={block.category} onChange={(event) => updateSchedule(block.id, { category: event.target.value as OnboardingScheduleDraft["category"] })}>
                                                <option value="work">Work</option>
                                                <option value="school">School or class</option>
                                                <option value="other">Other</option>
                                             </select>
                                          </label>
                                          <label className="onboarding-field">
                                             <span>What should ALLEVIN call it?</span>
                                             <input
                                                value={block.title}
                                                onChange={(event) => updateSchedule(block.id, { title: event.target.value })}
                                                placeholder={block.category === "work" ? "Work" : block.category === "school" ? "Class" : "Regular commitment"}
                                             />
                                          </label>
                                       </div>
                                       <label className="onboarding-field">
                                          <span>Which days?</span>
                                          <DayPicker value={block.days} onChange={(days) => updateSchedule(block.id, { days })} />
                                       </label>
                                       <div className="onboarding-grid-two">
                                          <label className="onboarding-field">
                                             <span>Starts</span>
                                             <input type="time" value={block.start} onChange={(event) => updateSchedule(block.id, { start: event.target.value })} />
                                          </label>
                                          <label className="onboarding-field">
                                             <span>Ends</span>
                                             <input type="time" value={block.end} onChange={(event) => updateSchedule(block.id, { end: event.target.value })} />
                                          </label>
                                       </div>
                                    </>
                                 ) : null}
                              </article>
                           ))}
                        </div>
                     ) : (
                        <div className="onboarding-empty-note">Nothing added yet. That is completely fine if you do not have a repeating weekly schedule.</div>
                     )}

                     <div className="onboarding-actions">
                        <button className="onboarding-back" onClick={() => setStep(1)}>
                           <ChevronLeft size={16} /> Back
                        </button>
                        <button className="onboarding-primary" onClick={() => setStep(3)}>
                           Continue <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 3 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">Your routines</span>
                     <h2>What usually happens around your schedule?</h2>
                     <p>Add the things you regularly do before, after, or at a set time. ALLEVIN can move routines that are tied to your schedule when the day changes.</p>

                     <div className="onboarding-quick-add">
                        <span>Common routines</span>
                        <div className="onboarding-choice-row">
                           {COMMON_ROUTINES.map((item) => {
                              const alreadyAdded = draft.routines.some((routine) => routine.title.trim().toLowerCase() === item.title.toLowerCase());
                              return (
                                 <button key={item.title} type="button" disabled={alreadyAdded} onClick={() => addRoutine(item.title, item.timing)}>
                                    {alreadyAdded ? "Added" : "+ " + item.title}
                                 </button>
                              );
                           })}
                           <button type="button" onClick={() => addRoutine()}>
                              + Custom routine
                           </button>
                        </div>
                     </div>

                     {draft.routines.length ? (
                        <div className="onboarding-stack">
                           {draft.routines.map((routine) => {
                              const linkedBlock = draft.scheduleBlocks.find((block) => block.id === routine.scheduleBlockId);
                              const linkedName = linkedBlock ? routineReferenceLabel(linkedBlock, draft.scheduleBlocks) : "your schedule";
                              const referenceBlocks = routineReferenceBlocks(draft.scheduleBlocks);
                              const durationHours = Math.floor((routine.durationMinutes || 0) / 60);
                              const durationMinutes = (routine.durationMinutes || 0) % 60;
                              return (
                                 <article className="onboarding-edit-card" key={routine.id}>
                                    <div className="onboarding-card-head">
                                       <button type="button" className="onboarding-summary-button" aria-expanded={activeRoutineId === routine.id} onClick={() => setActiveRoutineId(activeRoutineId === routine.id ? null : routine.id)}>
                                          <span className="onboarding-summary-copy">
                                             <strong>{routine.title.trim() || "Routine"}</strong>
                                             <span>
                                                {readableDuration(routine.durationMinutes)} · {routine.timing === "fixed" ? readableClock(routine.time) : `${routine.timing === "before" ? "Before" : "After"} ${linkedName}`}
                                             </span>
                                          </span>
                                          <span className="onboarding-edit-cue">
                                             <Pencil size={13} aria-hidden="true" /> Edit
                                          </span>
                                       </button>
                                       <button className="icon-button" type="button" onClick={() => setDraft((current) => ({ ...current, routines: current.routines.filter((item) => item.id !== routine.id) }))} aria-label="Remove routine">
                                          <X size={15} />
                                       </button>
                                    </div>
                                    {activeRoutineId === routine.id ? (
                                       <>
                                          <label className="onboarding-field">
                                             <span>What is it?</span>
                                             <input value={routine.title} onChange={(event) => updateRoutine(routine.id, { title: event.target.value })} placeholder="Workout, breakfast, study…" />
                                          </label>
                                          <div className="onboarding-grid-two">
                                             <label className="onboarding-field">
                                                <span>When does it happen?</span>
                                                <select value={relativeTimingValue(routine)} onChange={(event) => updateRoutineTiming(routine, event.target.value)}>
                                                   <option value="fixed">At a set time</option>
                                                   {referenceBlocks.flatMap((block) => [
                                                      <option value={`before:${block.id}`} key={`before-${block.id}`}>
                                                         Before {routineReferenceLabel(block, draft.scheduleBlocks)}
                                                      </option>,
                                                      <option value={`after:${block.id}`} key={`after-${block.id}`}>
                                                         After {routineReferenceLabel(block, draft.scheduleBlocks)}
                                                      </option>,
                                                   ])}
                                                </select>
                                             </label>
                                             <label className="onboarding-field">
                                                <span>How long does it take?</span>
                                                <div className="onboarding-offset-fields">
                                                   <div className="onboarding-number-unit">
                                                      <input
                                                         aria-label="Duration hours"
                                                         type="number"
                                                         inputMode="numeric"
                                                         min={0}
                                                         max={6}
                                                         value={durationHours || ""}
                                                         onChange={(event) => updateRoutineDurationPart(routine, "hours", event.target.value)}
                                                         placeholder="0"
                                                      />
                                                      <span>hr</span>
                                                   </div>
                                                   <div className="onboarding-number-unit">
                                                      <input
                                                         aria-label="Duration minutes"
                                                         type="number"
                                                         inputMode="numeric"
                                                         min={0}
                                                         max={59}
                                                         value={durationMinutes || ""}
                                                         onChange={(event) => updateRoutineDurationPart(routine, "minutes", event.target.value)}
                                                         placeholder="30"
                                                      />
                                                      <span>min</span>
                                                   </div>
                                                </div>
                                             </label>
                                          </div>
                                          {routine.timing === "fixed" ? (
                                             <>
                                                <label className="onboarding-field">
                                                   <span>Which days?</span>
                                                   <DayPicker value={routine.days} onChange={(days) => updateRoutine(routine.id, { days })} />
                                                </label>
                                                <label className="onboarding-field">
                                                   <span>What time?</span>
                                                   <input type="time" value={routine.time} onChange={(event) => updateRoutine(routine.id, { time: event.target.value })} />
                                                </label>
                                             </>
                                          ) : (
                                             <div className="onboarding-offset-section">
                                                <span className="onboarding-offset-label">{`${linkedName} normally ${routine.timing === "before" ? "starts" : "ends"} at ${linkedBlock ? readableClock(routine.timing === "before" ? linkedBlock.start : linkedBlock.end) : "its usual time"}. When would you usually start ${routine.title.trim() || "this"}?`}</span>
                                                <label className="onboarding-field">
                                                   <span>Normal-day start</span>
                                                   <input type="time" value={routine.time} onChange={(event) => updateRoutine(routine.id, { time: event.target.value })} />
                                                </label>
                                                <small>ALLEVIN will keep this relationship when {linkedName} moves.</small>
                                             </div>
                                          )}
                                       </>
                                    ) : null}
                                 </article>
                              );
                           })}
                        </div>
                     ) : (
                        <div className="onboarding-empty-note">No routines yet. Use a common one above or add a custom routine.</div>
                     )}
                     {previewRows.length ? (
                        <div className="onboarding-review onboarding-live-preview">
                           <strong>A normal {DAYS.find((day) => day.value === previewDay)?.label === "Mon" ? "Monday" : DAYS.find((day) => day.value === previewDay)?.label}</strong>
                           {previewRows.map((row) => (
                              <div key={row.id}>
                                 <span>
                                    {readableClock(row.start)}
                                    {row.end ? `–${readableClock(row.end)}` : ""}
                                 </span>
                                 <strong>{row.title}</strong>
                              </div>
                           ))}
                           <small>Does this look like the day you meant?</small>
                        </div>
                     ) : null}
                     <div className="onboarding-actions">
                        <button className="onboarding-back" onClick={() => setStep(2)}>
                           <ChevronLeft size={16} /> Back
                        </button>
                        <button className="onboarding-primary" onClick={() => setStep(4)}>
                           Continue <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 4 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">Free time should still feel free</span>
                     <h2>What do you actually like doing when you have time to yourself?</h2>
                     <p>ALLEVIN can use these when you ask what to do with an open evening or a spare block. Nothing here gets scheduled automatically.</p>
                     <label className="onboarding-field onboarding-field-large">
                        <span>Things you enjoy</span>
                        <textarea value={draft.hobbies} onChange={(event) => setDraft({ ...draft, hobbies: event.target.value })} placeholder="Reading, gaming, hiking, drawing, coding, movies, seeing friends…" rows={5} />
                     </label>
                     <div className="onboarding-actions">
                        <button className="onboarding-back" onClick={() => setStep(3)}>
                           <ChevronLeft size={16} /> Back
                        </button>
                        <button className="onboarding-primary" onClick={() => setStep(5)}>
                           Continue <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 5 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">A few useful details</span>
                     <h2>Help ALLEVIN plan the edges of the day.</h2>
                     <p>These are optional. You can change them anytime in Settings.</p>
                     <div className="onboarding-grid-two onboarding-details-grid">
                        <label className="onboarding-field">
                           <span>Usual bedtime</span>
                           <input type="time" value={draft.bedtime} onChange={(event) => setDraft({ ...draft, bedtime: event.target.value })} />
                        </label>
                        <label className="onboarding-field">
                           <span>Typical commute time (like getting to work)</span>
                           <div className="onboarding-number-unit">
                              <input type="number" inputMode="numeric" min={1} max={240} value={draft.travelMinutes} onChange={(event) => setDraft({ ...draft, travelMinutes: event.target.value })} placeholder="20" />
                              <span>min</span>
                           </div>
                        </label>
                     </div>
                     <div className="onboarding-voice-section">
                        <strong>How should ALLEVIN talk to you?</strong>
                        <div className="onboarding-tone-grid">
                           {(
                              [
                                 ["balanced", "Balanced", "Clear, relaxed, with some personality."],
                                 ["direct", "Direct", "Shorter, sharper, and a little more sarcastic."],
                                 ["calm", "Gentle", "Calm and encouraging."],
                              ] as Array<[AllevinTone, string, string]>
                           ).map(([value, title, detail]) => (
                              <button key={value} type="button" className={draft.tone === value ? "is-selected" : ""} onClick={() => setDraft({ ...draft, tone: value })}>
                                 <strong>{title}</strong>
                                 <span>{detail}</span>
                              </button>
                           ))}
                        </div>
                     </div>
                     <p className="onboarding-timezone">
                        Using your device time zone: <strong>{timezone}</strong>
                     </p>
                     <div className="onboarding-actions">
                        <button className="onboarding-back" onClick={() => setStep(4)}>
                           <ChevronLeft size={16} /> Back
                        </button>
                        <button className="onboarding-primary" onClick={() => setStep(6)}>
                           Review <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 6 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">One last look</span>
                     <h2>Here’s what I understood.</h2>
                     <p>This will replace your normal weekly schedule and routines if you already had them. One-off Calendar events stay where they are.</p>
                     <div className="onboarding-review">
                        <div>
                           <span>Name</span>
                           <strong>{draft.name || "Not added yet"}</strong>
                        </div>
                        <div>
                           <span>Regular schedule</span>
                           <strong>{draft.scheduleBlocks.length ? draft.scheduleBlocks.map((block) => `${scheduleLabel(block)} · ${readableDays(block.days)} · ${readableClock(block.start)}–${readableClock(block.end)}`).join(" / ") : "None added"}</strong>
                        </div>
                        <div>
                           <span>Routines</span>
                           {draft.routines.length ? (
                              <div className="onboarding-review-list">
                                 {draft.routines.map((routine) => (
                                    <div className="onboarding-review-routine" key={routine.id}>
                                       <strong>{routine.title.trim() || "Routine"}</strong>
                                       <span>{routineReviewDetail(routine, draft.scheduleBlocks)}</span>
                                    </div>
                                 ))}
                              </div>
                           ) : (
                              <strong>None added</strong>
                           )}
                        </div>
                        <div>
                           <span>Free time</span>
                           <strong>{draft.hobbies.trim() || "Not added"}</strong>
                        </div>
                        <div>
                           <span>Bedtime</span>
                           <strong>{draft.bedtime || "Not added"}</strong>
                        </div>
                        <div>
                           <span>Typical travel time</span>
                           <strong>{draft.travelMinutes ? `${draft.travelMinutes} min` : "Not added"}</strong>
                        </div>
                        <div>
                           <span>Voice</span>
                           <strong>{toneLabel(draft.tone)}</strong>
                        </div>
                        <div>
                           <span>Time zone</span>
                           <strong>{timezone}</strong>
                        </div>
                     </div>
                     {error ? <p className="onboarding-error">{error}</p> : null}
                     <div className="onboarding-actions">
                        <button className="onboarding-back" onClick={() => setStep(5)}>
                           <ChevronLeft size={16} /> Change something
                        </button>
                        <button className="onboarding-primary" onClick={commitSetup}>
                           Looks good <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}

               {step === 7 ? (
                  <section className="onboarding-step onboarding-install-step">
                     <span className="onboarding-kicker">Add ALLEVIN to your phone</span>
                     <h2>{standalone ? "There we go. ALLEVIN is on your phone." : "Add ALLEVIN to your phone."}</h2>
                     {standalone ? (
                        <>
                           <p>Want reminders?</p>
                           <div className="onboarding-reminder-card">
                              <Bell size={22} />
                              <div>
                                 <strong>Two useful reminders, not a notification pile-up.</strong>
                                 <span>One before. One at the start. If the day changes, the reminder plan changes with it.</span>
                              </div>
                           </div>
                           <button className="onboarding-primary onboarding-full-button" type="button" onClick={() => void enableReminders()} disabled={enabling || remindersEnabled}>
                              {remindersEnabled ? "Reminders are on" : enabling ? "Turning reminders on…" : "Yes, turn on reminders"}
                           </button>
                           {permissionMessage ? <p className="onboarding-permission-message">{permissionMessage}</p> : null}
                        </>
                     ) : ios ? (
                        <>
                           <p>Get one-tap access and reminders even when Safari is closed.</p>
                           <div className="onboarding-pwa-steps">
                              <div>
                                 <span>1</span>
                                 <div>
                                    <strong>Tap Share</strong>
                                    <p>
                                       <Share2 size={15} /> The square with the arrow.
                                    </p>
                                 </div>
                              </div>
                              <div>
                                 <span>2</span>
                                 <div>
                                    <strong>Tap Add to Home Screen</strong>
                                    <p>Scroll down if you do not see it yet.</p>
                                 </div>
                              </div>
                              <div>
                                 <span>3</span>
                                 <div>
                                    <strong>Tap Add</strong>
                                    <p>Then open ALLEVIN from its new icon.</p>
                                 </div>
                              </div>
                           </div>
                           <div className="onboarding-reminder-card">
                              <Smartphone size={22} />
                              <div>
                                 <strong>Open it from your Home Screen.</strong>
                                 <span>ALLEVIN will notice and continue here before asking about reminders.</span>
                              </div>
                           </div>
                        </>
                     ) : (
                        <>
                           <p>Add ALLEVIN to your Home Screen so your personal assistant is always one tap away and can remind you even when your browser is closed.</p>
                           <div className="onboarding-reminder-card">
                              <Smartphone size={22} />
                              <div>
                                 <strong>One tap away.</strong>
                                 <span>Once it opens from your Home Screen, ALLEVIN will ask if you want reminders.</span>
                              </div>
                           </div>
                        </>
                     )}
                     <p className="onboarding-install-note">
                        You can reopen these instructions anytime from <strong>Settings → Add ALLEVIN to your phone</strong>.
                     </p>
                     <div className="onboarding-actions onboarding-actions-final">
                        <button className="onboarding-primary" type="button" onClick={finish}>
                           Enter ALLEVIN <ChevronRight size={16} />
                        </button>
                     </div>
                  </section>
               ) : null}
            </div>
         </div>
      </div>
   );
}
