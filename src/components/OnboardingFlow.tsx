"use client";

import { Bell, ChevronLeft, ChevronRight, Plus, Share2, Smartphone, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
   applyOnboardingDraft,
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

const STEP_TITLES = ["Welcome", "Your name", "Your week", "Your routines", "Your free time", "A few details", "Review", "Notifications"];

function toggleDay(days: RhythmDay[], day: RhythmDay) {
   return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort();
}

function DayPicker({ value, onChange }: { value: RhythmDay[]; onChange: (days: RhythmDay[]) => void }) {
   return (
      <div className="onboarding-day-picker" role="group" aria-label="Days">
         {DAYS.map((day) => (
            <button
               key={day.value}
               type="button"
               className={value.includes(day.value) ? "is-selected" : ""}
               onClick={() => onChange(toggleDay(value, day.value))}
            >
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
   return "Weekly block";
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
   return days.map((day) => DAYS.find((item) => item.value === day)?.label || "").filter(Boolean).join(", ");
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

   useEffect(() => {
      setStandalone(isInstalledPwa());
      setIos(isIosDevice());
   }, []);

   const timezone = useMemo(() => deviceTimezoneLabel(), []);

   function updateSchedule(id: string, patch: Partial<OnboardingScheduleDraft>) {
      setDraft((current) => ({
         ...current,
         scheduleBlocks: current.scheduleBlocks.map((block) => block.id === id ? { ...block, ...patch } : block),
      }));
   }

   function removeSchedule(id: string) {
      setDraft((current) => ({
         ...current,
         scheduleBlocks: current.scheduleBlocks.filter((block) => block.id !== id),
         routines: current.routines.map((routine) => routine.scheduleBlockId === id ? { ...routine, timing: "fixed", scheduleBlockId: undefined } : routine),
      }));
   }

   function updateRoutine(id: string, patch: Partial<OnboardingRoutineDraft>) {
      setDraft((current) => ({
         ...current,
         routines: current.routines.map((routine) => routine.id === id ? { ...routine, ...patch } : routine),
      }));
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
      if (mode === "setup" && !committed) markOnboardingState("completed");
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
               <button type="button" className="icon-button" onClick={() => { if (mode === "setup" && !committed) markOnboardingState("skipped"); onClose(); }} aria-label="Close setup"><X size={18} /></button>
            </header>

            <div className="onboarding-body">
               {step === 0 ? (
                  <section className="onboarding-intro">
                     <span className="onboarding-kicker">A quick setup</span>
                     <h1>Meet ALLEVIN.</h1>
                     <p>Tell me what your days usually look like, and I’ll help keep everything moving when plans change.</p>
                     <div className="onboarding-actions onboarding-actions-start">
                        <button className="onboarding-primary" type="button" onClick={() => setStep(1)}>Get started <ChevronRight size={17} /></button>
                        <button className="onboarding-secondary" type="button" onClick={skipSetup}>Skip for now</button>
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
                     <div className="onboarding-actions"><button className="onboarding-back" onClick={() => setStep(0)}><ChevronLeft size={16} /> Back</button><button className="onboarding-primary" onClick={continueFromName}>Continue <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}

               {step === 2 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">Your normal week</span>
                     <h2>What usually takes up your week?</h2>
                     <p>Add work, school, classes, caregiving, or anything else that regularly stays put. You can leave this empty if your week changes too much.</p>
                     <div className="onboarding-stack">
                        {draft.scheduleBlocks.map((block) => (
                           <article className="onboarding-edit-card" key={block.id}>
                              <div className="onboarding-card-head"><strong>{scheduleLabel(block)}</strong><button className="icon-button" type="button" onClick={() => removeSchedule(block.id)} aria-label="Remove weekly block"><X size={15} /></button></div>
                              <div className="onboarding-grid-two">
                                 <label className="onboarding-field"><span>Type</span><select value={block.category} onChange={(event) => updateSchedule(block.id, { category: event.target.value as OnboardingScheduleDraft["category"] })}><option value="work">Work</option><option value="school">School or class</option><option value="other">Other</option></select></label>
                                 <label className="onboarding-field"><span>Name</span><input value={block.title} onChange={(event) => updateSchedule(block.id, { title: event.target.value })} placeholder={block.category === "work" ? "Work" : block.category === "school" ? "Class" : "Weekly block"} /></label>
                              </div>
                              <label className="onboarding-field"><span>Days</span><DayPicker value={block.days} onChange={(days) => updateSchedule(block.id, { days })} /></label>
                              <div className="onboarding-grid-two"><label className="onboarding-field"><span>Starts</span><input type="time" value={block.start} onChange={(event) => updateSchedule(block.id, { start: event.target.value })} /></label><label className="onboarding-field"><span>Ends</span><input type="time" value={block.end} onChange={(event) => updateSchedule(block.id, { end: event.target.value })} /></label></div>
                           </article>
                        ))}
                     </div>
                     <button className="onboarding-add" type="button" onClick={() => setDraft((current) => ({ ...current, scheduleBlocks: [...current.scheduleBlocks, createBlankScheduleDraft()] }))}><Plus size={15} /> Add a weekly block</button>
                     <div className="onboarding-actions"><button className="onboarding-back" onClick={() => setStep(1)}><ChevronLeft size={16} /> Back</button><button className="onboarding-primary" onClick={() => setStep(3)}>Continue <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}

               {step === 3 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">The things around it</span>
                     <h2>What do you usually do around those plans?</h2>
                     <p>Add routines like workouts, meals, commuting, studying, getting ready, or winding down. ALLEVIN can move these when the day changes.</p>
                     <div className="onboarding-stack">
                        {draft.routines.map((routine) => (
                           <article className="onboarding-edit-card" key={routine.id}>
                              <div className="onboarding-card-head"><strong>{routine.title.trim() || "Routine"}</strong><button className="icon-button" type="button" onClick={() => setDraft((current) => ({ ...current, routines: current.routines.filter((item) => item.id !== routine.id) }))} aria-label="Remove routine"><X size={15} /></button></div>
                              <label className="onboarding-field"><span>What is it?</span><input value={routine.title} onChange={(event) => updateRoutine(routine.id, { title: event.target.value })} placeholder="Workout, breakfast, study…" /></label>
                              <div className="onboarding-grid-two">
                                 <label className="onboarding-field"><span>When</span><select value={routine.timing} onChange={(event) => updateRoutine(routine.id, { timing: event.target.value as OnboardingRoutineDraft["timing"] })}><option value="fixed">At a set time</option><option value="before" disabled={!draft.scheduleBlocks.length}>Before a weekly block</option><option value="after" disabled={!draft.scheduleBlocks.length}>After a weekly block</option></select></label>
                                 <label className="onboarding-field"><span>How long?</span><div className="onboarding-number-unit"><input type="number" inputMode="numeric" min={5} max={360} value={routine.durationMinutes} onChange={(event) => updateRoutine(routine.id, { durationMinutes: Number(event.target.value) })} /><span>min</span></div></label>
                              </div>
                              {routine.timing === "fixed" ? (
                                 <><label className="onboarding-field"><span>Days</span><DayPicker value={routine.days} onChange={(days) => updateRoutine(routine.id, { days })} /></label><label className="onboarding-field"><span>Time</span><input type="time" value={routine.time} onChange={(event) => updateRoutine(routine.id, { time: event.target.value })} /></label></>
                              ) : (
                                 <div className="onboarding-grid-two"><label className="onboarding-field"><span>{routine.timing === "before" ? "Before" : "After"}</span><select value={routine.scheduleBlockId || ""} onChange={(event) => updateRoutine(routine.id, { scheduleBlockId: event.target.value })}><option value="">Choose one</option>{draft.scheduleBlocks.map((block) => <option value={block.id} key={block.id}>{scheduleLabel(block)}</option>)}</select></label><label className="onboarding-field"><span>By how much?</span><div className="onboarding-number-unit"><input type="number" inputMode="numeric" min={5} max={720} value={routine.offsetMinutes} onChange={(event) => updateRoutine(routine.id, { offsetMinutes: Number(event.target.value) })} /><span>min</span></div></label></div>
                              )}
                           </article>
                        ))}
                     </div>
                     <button className="onboarding-add" type="button" onClick={() => setDraft((current) => ({ ...current, routines: [...current.routines, createBlankRoutineDraft(current.scheduleBlocks[0]?.id)] }))}><Plus size={15} /> Add a routine</button>
                     <div className="onboarding-actions"><button className="onboarding-back" onClick={() => setStep(2)}><ChevronLeft size={16} /> Back</button><button className="onboarding-primary" onClick={() => setStep(4)}>Continue <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}

               {step === 4 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">Free time should still feel free</span>
                     <h2>What do you actually like doing when you have time to yourself?</h2>
                     <p>ALLEVIN can use these when you ask what to do with an open evening or a spare block. Nothing here gets scheduled automatically.</p>
                     <label className="onboarding-field onboarding-field-large"><span>Things you enjoy</span><textarea value={draft.hobbies} onChange={(event) => setDraft({ ...draft, hobbies: event.target.value })} placeholder="Reading, gaming, hiking, drawing, coding, movies, seeing friends…" rows={5} /></label>
                     <div className="onboarding-actions"><button className="onboarding-back" onClick={() => setStep(3)}><ChevronLeft size={16} /> Back</button><button className="onboarding-primary" onClick={() => setStep(5)}>Continue <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}

               {step === 5 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">A few useful details</span>
                     <h2>Help ALLEVIN plan the edges of the day.</h2>
                     <p>These are optional. You can change them anytime in Settings.</p>
                     <div className="onboarding-grid-two onboarding-details-grid">
                        <label className="onboarding-field"><span>Usual bedtime</span><input type="time" value={draft.bedtime} onChange={(event) => setDraft({ ...draft, bedtime: event.target.value })} /></label>
                        <label className="onboarding-field"><span>Typical travel time</span><div className="onboarding-number-unit"><input type="number" inputMode="numeric" min={1} max={240} value={draft.travelMinutes} onChange={(event) => setDraft({ ...draft, travelMinutes: event.target.value })} placeholder="20" /><span>min</span></div></label>
                     </div>
                     <div className="onboarding-voice-section">
                        <strong>How should ALLEVIN talk to you?</strong>
                        <div className="onboarding-tone-grid">
                           {([
                              ["balanced", "Balanced", "Clear, relaxed, with some personality."],
                              ["direct", "Direct", "Shorter, sharper, and a little more sarcastic."],
                              ["calm", "Gentle", "Calm and encouraging."],
                           ] as Array<[AllevinTone, string, string]>).map(([value, title, detail]) => (
                              <button key={value} type="button" className={draft.tone === value ? "is-selected" : ""} onClick={() => setDraft({ ...draft, tone: value })}><strong>{title}</strong><span>{detail}</span></button>
                           ))}
                        </div>
                     </div>
                     <p className="onboarding-timezone">Using your device time zone: <strong>{timezone}</strong></p>
                     <div className="onboarding-actions"><button className="onboarding-back" onClick={() => setStep(4)}><ChevronLeft size={16} /> Back</button><button className="onboarding-primary" onClick={() => setStep(6)}>Review <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}

               {step === 6 ? (
                  <section className="onboarding-step">
                     <span className="onboarding-kicker">One last look</span>
                     <h2>Here’s what I understood.</h2>
                     <p>This will replace your recurring weekly setup if you already had one. One-off Calendar events stay where they are.</p>
                     <div className="onboarding-review">
                        <div><span>Name</span><strong>{draft.name || "Not added yet"}</strong></div>
                        <div><span>Weekly blocks</span><strong>{draft.scheduleBlocks.length ? draft.scheduleBlocks.map((block) => `${scheduleLabel(block)} · ${readableDays(block.days)} · ${readableClock(block.start)}–${readableClock(block.end)}`).join(" / ") : "None added"}</strong></div>
                        <div><span>Routines</span><strong>{draft.routines.length ? draft.routines.map((routine) => routine.title || "Routine").join(" · ") : "None added"}</strong></div>
                        <div><span>Free time</span><strong>{draft.hobbies.trim() || "Not added"}</strong></div>
                        <div><span>Bedtime</span><strong>{draft.bedtime || "Not added"}</strong></div>
                        <div><span>Typical travel time</span><strong>{draft.travelMinutes ? `${draft.travelMinutes} min` : "Not added"}</strong></div>
                        <div><span>Voice</span><strong>{toneLabel(draft.tone)}</strong></div>
                        <div><span>Time zone</span><strong>{timezone}</strong></div>
                     </div>
                     {error ? <p className="onboarding-error">{error}</p> : null}
                     <div className="onboarding-actions"><button className="onboarding-back" onClick={() => setStep(5)}><ChevronLeft size={16} /> Change something</button><button className="onboarding-primary" onClick={commitSetup}>Looks good <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}

               {step === 7 ? (
                  <section className="onboarding-step onboarding-install-step">
                     <span className="onboarding-kicker">Keep the day moving</span>
                     <h2>{standalone ? "Turn on reminders." : "Get ALLEVIN on your phone."}</h2>
                     {standalone ? (
                        <>
                           <p>ALLEVIN can give you one heads-up before something starts and another reminder when it actually begins.</p>
                           <div className="onboarding-reminder-card"><Bell size={22} /><div><strong>Two useful reminders, not a notification pile-up.</strong><span>One before. One at the start. If the day changes, the reminder plan changes with it.</span></div></div>
                           <button className="onboarding-primary onboarding-full-button" type="button" onClick={() => void enableReminders()} disabled={enabling || remindersEnabled}>{remindersEnabled ? "Reminders are on" : enabling ? "Turning reminders on…" : "Turn on reminders"}</button>
                           {permissionMessage ? <p className="onboarding-permission-message">{permissionMessage}</p> : null}
                        </>
                     ) : ios ? (
                        <>
                           <p>On iPhone, ALLEVIN needs to be added to your Home Screen before it can reliably ask for notification permission.</p>
                           <div className="onboarding-pwa-steps">
                              <div><span>1</span><div><strong>Open ALLEVIN in Safari</strong><p>Use your normal ALLEVIN web address.</p></div></div>
                              <div><span>2</span><div><strong>Tap the Share button</strong><p><Share2 size={15} /> It’s the square with the arrow pointing up.</p></div></div>
                              <div><span>3</span><div><strong>Choose “Add to Home Screen”</strong><p>If it isn’t visible, scroll down in the Share sheet.</p></div></div>
                              <div><span>4</span><div><strong>Tap “Add”</strong><p>ALLEVIN will appear on your Home Screen like an app.</p></div></div>
                              <div><span>5</span><div><strong>Open ALLEVIN from the new icon</strong><p>Then open Settings and turn on Reminders when ALLEVIN asks.</p></div></div>
                           </div>
                           <div className="onboarding-reminder-card"><Smartphone size={22} /><div><strong>Why install it?</strong><span>The Home Screen app is what gives ALLEVIN the PWA environment it needs for phone notifications.</span></div></div>
                        </>
                     ) : (
                        <>
                           <p>Install ALLEVIN from your browser’s app/install menu, then open the installed app and turn on Reminders in Settings.</p>
                           <div className="onboarding-reminder-card"><Smartphone size={22} /><div><strong>Installed app + reminders</strong><span>That gives ALLEVIN the best chance to keep up even when the browser tab is gone.</span></div></div>
                        </>
                     )}
                     <p className="onboarding-install-note">You can reopen these instructions anytime from <strong>Settings → Add ALLEVIN to your phone</strong>.</p>
                     <div className="onboarding-actions onboarding-actions-final"><button className="onboarding-primary" type="button" onClick={finish}>Enter ALLEVIN <ChevronRight size={16} /></button></div>
                  </section>
               ) : null}
            </div>
         </div>
      </div>
   );
}
