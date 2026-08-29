"use client";

import { Check, Pencil, Plus, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
   formatClock,
   removeRhythmAnchor,
   removeScheduleBlock,
   upsertRhythmAnchor,
   upsertScheduleBlock,
   type DailyRhythmState,
   type RhythmAnchor,
   type RhythmCategory,
   type RhythmDay,
   type RhythmScheduleBlock,
} from "@/lib/dailyRhythm";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORIES: RhythmCategory[] = ["work", "school", "exercise", "meal", "care", "home", "personal", "other"];

type ScheduleDraft = Omit<RhythmScheduleBlock, "id"> & { id?: string };
type RepeatMode = "everyday" | "schedule" | "custom";
type RelativeDirection = "before" | "after";

type AnchorDraft = Omit<RhythmAnchor, "id"> & {
   id?: string;
   repeatMode: RepeatMode;
   scheduleReference: string;
   relativeDirection: RelativeDirection;
   relativeHours: number;
   relativeMinutes: number;
};

function blankSchedule(): ScheduleDraft {
   return { title: "", category: "work", days: [], start: "09:00", end: "17:00", enabled: true };
}

function categoryLabel(category: RhythmCategory) {
   return category.charAt(0).toUpperCase() + category.slice(1);
}

function referenceForAnchor(anchor: RhythmAnchor) {
   if (anchor.scheduleCategory) return `category:${anchor.scheduleCategory}`;
   if (anchor.scheduleBlockId) return `block:${anchor.scheduleBlockId}`;
   return "";
}

function relativeParts(offset = -60) {
   const magnitude = Math.abs(offset);
   return {
      relativeDirection: offset >= 0 ? ("after" as const) : ("before" as const),
      relativeHours: Math.floor(magnitude / 60),
      relativeMinutes: magnitude % 60,
   };
}

function draftFromAnchor(anchor: RhythmAnchor): AnchorDraft {
   const relative = relativeParts(anchor.scheduleOffsetMinutes ?? -60);
   return {
      ...anchor,
      repeatMode: anchor.dayRule === "everyday" ? "everyday" : anchor.dayRule === "custom" ? "custom" : "schedule",
      scheduleReference: referenceForAnchor(anchor),
      ...relative,
      relativeDirection:
         anchor.scheduleReferencePoint === "end"
            ? "after"
            : anchor.scheduleReferencePoint === "start"
              ? "before"
              : relative.relativeDirection,
   };
}

function blankAnchor(scheduleReference = ""): AnchorDraft {
   return {
      title: "",
      category: "personal",
      time: "08:00",
      durationMinutes: 30,
      enabled: true,
      reminder: true,
      accountabilityAfterMinutes: 15,
      dayRule: scheduleReference ? "schedule" : "everyday",
      scheduleCategory: scheduleReference.startsWith("category:")
         ? (scheduleReference.slice("category:".length) as RhythmCategory)
         : undefined,
      scheduleBlockId: scheduleReference.startsWith("block:")
         ? scheduleReference.slice("block:".length)
         : undefined,
      days: [],
      flexible: true,
      timingMode: scheduleReference ? "schedule-relative" : "fixed",
      scheduleReferencePoint: scheduleReference ? "start" : undefined,
      scheduleOffsetMinutes: scheduleReference ? -60 : undefined,
      repeatMode: scheduleReference ? "schedule" : "everyday",
      scheduleReference,
      relativeDirection: "before",
      relativeHours: 1,
      relativeMinutes: 0,
   };
}

function toggleDay(days: RhythmDay[], day: RhythmDay) {
   return days.includes(day) ? days.filter((value) => value !== day) : ([...days, day].sort() as RhythmDay[]);
}

function formatRelativeOffset(anchor: RhythmAnchor) {
   const offset = anchor.scheduleOffsetMinutes ?? 0;
   const magnitude = Math.abs(offset);
   const hours = Math.floor(magnitude / 60);
   const minutes = magnitude % 60;
   const parts = [
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
   ].filter(Boolean);
   const referencePoint =
      anchor.scheduleReferencePoint === "end"
         ? "after end of"
         : "before start of";
   return `${parts.join(" ") || "0m"} ${referencePoint}`;
}

function scheduleReferenceLabel(anchor: RhythmAnchor, state: DailyRhythmState) {
   if (anchor.scheduleCategory) return categoryLabel(anchor.scheduleCategory);
   if (anchor.scheduleBlockId) {
      return state.scheduleBlocks.find((block) => block.id === anchor.scheduleBlockId)?.title || "schedule";
   }
   return "regular commitment";
}

export default function RhythmSettingsEditor({
   state,
   initialScheduleId,
   initialAnchorId,
   view = "all",
}: {
   state: DailyRhythmState;
   initialScheduleId?: string;
   initialAnchorId?: string;
   view?: "all" | "schedule" | "routines";
}) {
   const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
   const [anchorDraft, setAnchorDraft] = useState<AnchorDraft | null>(null);

   const scheduleReferences = useMemo(() => {
      const enabled = state.scheduleBlocks.filter((block) => block.enabled);
      const categories = [...new Set(enabled.map((block) => block.category))];
      return [
         ...categories.map((category) => ({
            value: `category:${category}`,
            label: `Any ${categoryLabel(category)} schedule`,
         })),
         ...enabled.map((block) => ({
            value: `block:${block.id}`,
            label: `${block.title} · ${block.days.map((day) => DAY_LABELS[day]).join(" ")}`,
         })),
      ];
   }, [state.scheduleBlocks]);

   const defaultScheduleReference = scheduleReferences[0]?.value || "";
   const showSchedule = view === "all" || view === "schedule";
   const showRoutines = view === "all" || view === "routines";

   useEffect(() => {
      if (initialScheduleId) {
         const block = state.scheduleBlocks.find((candidate) => candidate.id === initialScheduleId);
         if (block) {
            setScheduleDraft({ ...block });
            setAnchorDraft(null);
         }
         return;
      }

      if (initialAnchorId) {
         const anchor = state.anchors.find((candidate) => candidate.id === initialAnchorId);
         if (anchor) {
            setAnchorDraft(draftFromAnchor(anchor));
            setScheduleDraft(null);
         }
      }
   }, [initialScheduleId, initialAnchorId, state.scheduleBlocks, state.anchors]);

   function editSchedule(block: RhythmScheduleBlock) {
      setScheduleDraft({ ...block });
      setAnchorDraft(null);
   }

   function saveSchedule() {
      if (!scheduleDraft?.title.trim() || !scheduleDraft.days.length) return;
      upsertScheduleBlock(state, { ...scheduleDraft, title: scheduleDraft.title.trim() });
      setScheduleDraft(null);
   }

   function editAnchor(anchor: RhythmAnchor) {
      setAnchorDraft(draftFromAnchor(anchor));
      setScheduleDraft(null);
   }

   function saveAnchor() {
      if (!anchorDraft?.title.trim()) return;

      const dayRule = anchorDraft.repeatMode === "everyday"
         ? "everyday"
         : anchorDraft.repeatMode === "custom"
           ? "custom"
           : "schedule";

      const reference = anchorDraft.repeatMode === "schedule"
         ? anchorDraft.scheduleReference || defaultScheduleReference
         : "";

      const scheduleCategory = reference.startsWith("category:")
         ? (reference.slice("category:".length) as RhythmCategory)
         : undefined;

      const scheduleBlockId = reference.startsWith("block:")
         ? reference.slice("block:".length)
         : undefined;

      const relativeMagnitude =
         Math.max(0, Math.min(12, Number(anchorDraft.relativeHours) || 0)) * 60 +
         Math.max(0, Math.min(59, Number(anchorDraft.relativeMinutes) || 0));

      const timingMode =
         dayRule === "schedule" && anchorDraft.timingMode === "schedule-relative"
            ? "schedule-relative"
            : "fixed";

      const scheduleOffsetMinutes =
         timingMode === "schedule-relative"
            ? relativeMagnitude * (anchorDraft.relativeDirection === "after" ? 1 : -1)
            : undefined;

      upsertRhythmAnchor(state, {
         ...anchorDraft,
         title: anchorDraft.title.trim(),
         dayRule,
         scheduleCategory,
         scheduleBlockId,
         days: dayRule === "custom" ? anchorDraft.days : undefined,
         timingMode,
         scheduleReferencePoint:
            timingMode === "schedule-relative"
               ? anchorDraft.relativeDirection === "after"
                  ? "end"
                  : "start"
               : undefined,
         scheduleOffsetMinutes,
      });

      setAnchorDraft(null);
   }

   return (
      <div className="rhythm-settings-editor">
         {showSchedule ? <section className="settings-group">
            <div className="settings-group-heading">
               <strong>Schedule</strong>
               <button
                  className="settings-add-button"
                  onClick={() => {
                     setScheduleDraft(blankSchedule());
                     setAnchorDraft(null);
                  }}
               >
                  <Plus size={14} /> Add
               </button>
            </div>

            {state.scheduleBlocks.length ? (
               <div className="settings-summary-list">
                  {state.scheduleBlocks.map((block) => (
                     <div className="settings-summary-row settings-summary-row-editable" key={block.id}>
                        <div>
                           <strong>{block.title}</strong>
                           <span>{block.days.map((day) => DAY_LABELS[day]).join(" · ")}</span>
                        </div>
                        <span>{formatClock(block.start)}–{formatClock(block.end)}</span>
                        <div className="settings-row-actions">
                           <button className="icon-button" onClick={() => editSchedule(block)} aria-label={`Edit ${block.title}`}>
                              <Pencil size={13} />
                           </button>
                           <button className="icon-button" onClick={() => removeScheduleBlock(state, block.id)} aria-label={`Remove ${block.title}`}>
                              <X size={14} />
                           </button>
                        </div>
                     </div>
                  ))}
               </div>
            ) : null}

            {scheduleDraft ? (
               <div className="settings-edit-card">
                  <label>
                     <span>Title</span>
                     <input
                        value={scheduleDraft.title}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                           setScheduleDraft({ ...scheduleDraft, title: event.target.value })
                        }
                        placeholder="Work, class, shift…"
                     />
                  </label>
                  <label>
                     <span>Type</span>
                     <select
                        value={scheduleDraft.category}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                           setScheduleDraft({ ...scheduleDraft, category: event.target.value as RhythmCategory })
                        }
                     >
                        {CATEGORIES.map((category) => (
                           <option key={category} value={category}>{categoryLabel(category)}</option>
                        ))}
                     </select>
                  </label>
                  <div className="day-toggle-row" aria-label="Schedule days">
                     {DAY_LABELS.map((label, index) => {
                        const day = index as RhythmDay;
                        const active = scheduleDraft.days.includes(day);
                        return (
                           <button
                              type="button"
                              key={label}
                              className={`day-toggle ${active ? "day-toggle-active" : ""}`}
                              onClick={() =>
                                 setScheduleDraft({ ...scheduleDraft, days: toggleDay(scheduleDraft.days, day) })
                              }
                           >
                              {label}
                           </button>
                        );
                     })}
                  </div>
                  <div className="settings-time-row">
                     <label>
                        <span>Start</span>
                        <input
                           type="time"
                           value={scheduleDraft.start}
                           onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setScheduleDraft({ ...scheduleDraft, start: event.target.value })
                           }
                        />
                     </label>
                     <label>
                        <span>End</span>
                        <input
                           type="time"
                           value={scheduleDraft.end}
                           onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setScheduleDraft({ ...scheduleDraft, end: event.target.value })
                           }
                        />
                     </label>
                  </div>
                  <div className="settings-edit-actions">
                     <button onClick={() => setScheduleDraft(null)}>Cancel</button>
                     <button className="settings-primary-action" onClick={saveSchedule}>
                        <Check size={14} /> Save
                     </button>
                  </div>
               </div>
            ) : null}
         </section> : null}

         {view === "all" ? <div className="settings-divider" /> : null}

         {showRoutines ? <section className="settings-group">
            <div className="settings-group-heading">
               <strong>Routine</strong>
               <button
                  className="settings-add-button"
                  onClick={() => {
                     setAnchorDraft(blankAnchor(defaultScheduleReference));
                     setScheduleDraft(null);
                  }}
               >
                  <Plus size={14} /> Add
               </button>
            </div>

            {state.anchors.length ? (
               <div className="settings-summary-list">
                  {state.anchors.map((anchor) => (
                     <div className="settings-summary-row settings-summary-row-editable" key={anchor.id}>
                        <div>
                           <strong>{anchor.title}</strong>
                           <span>
                              {anchor.durationMinutes} min ·{" "}
                              {anchor.timingMode === "schedule-relative"
                                 ? `${formatRelativeOffset(anchor)} ${scheduleReferenceLabel(anchor, state)}`
                                 : formatClock(anchor.time)}
                           </span>
                        </div>
                        <span>
                           {anchor.dayRule === "everyday"
                              ? "Every day"
                              : anchor.dayRule === "custom"
                                ? (anchor.days || []).map((day) => DAY_LABELS[day]).join(" · ")
                                : scheduleReferenceLabel(anchor, state)}
                        </span>
                        <div className="settings-row-actions">
                           <button className="icon-button" onClick={() => editAnchor(anchor)} aria-label={`Edit ${anchor.title}`}>
                              <Pencil size={13} />
                           </button>
                           <button className="icon-button" onClick={() => removeRhythmAnchor(state, anchor.id)} aria-label={`Remove ${anchor.title}`}>
                              <X size={14} />
                           </button>
                        </div>
                     </div>
                  ))}
               </div>
            ) : null}

            {anchorDraft ? (
               <div className="settings-edit-card">
                  <label>
                     <span>Title</span>
                     <input
                        value={anchorDraft.title}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                           setAnchorDraft({ ...anchorDraft, title: event.target.value })
                        }
                        placeholder="Exercise, breakfast, commute…"
                     />
                  </label>

                  <div className="settings-two-column">
                     <label>
                        <span>Type</span>
                        <select
                           value={anchorDraft.category}
                           onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              setAnchorDraft({ ...anchorDraft, category: event.target.value as RhythmCategory })
                           }
                        >
                           {CATEGORIES.map((category) => (
                              <option key={category} value={category}>{categoryLabel(category)}</option>
                           ))}
                        </select>
                     </label>
                     <label>
                        <span>Duration</span>
                        <input
                           type="number"
                           min={5}
                           max={360}
                           value={Number.isFinite(anchorDraft.durationMinutes) ? anchorDraft.durationMinutes : ""}
                           onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setAnchorDraft({ ...anchorDraft, durationMinutes: event.target.value === "" ? Number.NaN : Number(event.target.value) })
                           }
                           onBlur={() => {
                              if (!Number.isFinite(anchorDraft.durationMinutes) || anchorDraft.durationMinutes < 5) setAnchorDraft({ ...anchorDraft, durationMinutes: 30 });
                           }}
                        />
                     </label>
                  </div>

                  <label>
                     <span>Days</span>
                     <select
                        value={anchorDraft.repeatMode}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                           const repeatMode = event.target.value as RepeatMode;
                           setAnchorDraft({
                              ...anchorDraft,
                              repeatMode,
                              scheduleReference:
                                 repeatMode === "schedule"
                                    ? anchorDraft.scheduleReference || defaultScheduleReference
                                    : anchorDraft.scheduleReference,
                              timingMode:
                                 repeatMode === "schedule"
                                    ? "schedule-relative"
                                    : "fixed",
                           });
                        }}
                     >
                        <option value="everyday">Every day</option>
                        <option value="schedule" disabled={!scheduleReferences.length}>Same days as a regular commitment</option>
                        <option value="custom">Custom days</option>
                     </select>
                  </label>

                  {anchorDraft.repeatMode === "custom" ? (
                     <div className="day-toggle-row" aria-label="Routine days">
                        {DAY_LABELS.map((label, index) => {
                           const day = index as RhythmDay;
                           const days = anchorDraft.days || [];
                           const active = days.includes(day);
                           return (
                              <button
                                 type="button"
                                 key={label}
                                 className={`day-toggle ${active ? "day-toggle-active" : ""}`}
                                 onClick={() => setAnchorDraft({ ...anchorDraft, days: toggleDay(days, day) })}
                              >
                                 {label}
                              </button>
                           );
                        })}
                     </div>
                  ) : null}

                  {anchorDraft.repeatMode === "schedule" ? (
                     <>
                        <label>
                           <span>Moves with</span>
                           <select
                              value={anchorDraft.scheduleReference || defaultScheduleReference}
                              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                                 setAnchorDraft({ ...anchorDraft, scheduleReference: event.target.value })
                              }
                           >
                              {scheduleReferences.map((reference) => (
                                 <option key={reference.value} value={reference.value}>{reference.label}</option>
                              ))}
                           </select>
                        </label>

                        <label>
                           <span>Relationship</span>
                           <select
                              value={anchorDraft.timingMode}
                              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                                 setAnchorDraft({
                                    ...anchorDraft,
                                    timingMode: event.target.value === "schedule-relative" ? "schedule-relative" : "fixed",
                                 })
                              }
                           >
                              <option value="schedule-relative">Moves when it moves</option>
                              <option value="fixed">Specific time</option>
                           </select>
                        </label>
                     </>
                  ) : null}

                  {anchorDraft.repeatMode === "schedule" && anchorDraft.timingMode === "schedule-relative" ? (
                     <div className="settings-time-row">
                        <label>
                           <span>When</span>
                           <select
                              value={anchorDraft.relativeDirection}
                              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                                 setAnchorDraft({
                                    ...anchorDraft,
                                    relativeDirection: event.target.value === "after" ? "after" : "before",
                                 })
                              }
                           >
                              <option value="before">Before it starts</option>
                              <option value="after">After it ends</option>
                           </select>
                        </label>
                        <label>
                           <span>Hours</span>
                           <input
                              type="number"
                              min={0}
                              max={12}
                              value={Number.isFinite(anchorDraft.relativeHours) ? anchorDraft.relativeHours : ""}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                 setAnchorDraft({ ...anchorDraft, relativeHours: event.target.value === "" ? Number.NaN : Number(event.target.value) })
                              }
                              onBlur={() => { if (!Number.isFinite(anchorDraft.relativeHours)) setAnchorDraft({ ...anchorDraft, relativeHours: 0 }); }}
                           />
                        </label>
                        <label>
                           <span>Minutes</span>
                           <input
                              type="number"
                              min={0}
                              max={59}
                              value={Number.isFinite(anchorDraft.relativeMinutes) ? anchorDraft.relativeMinutes : ""}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                 setAnchorDraft({ ...anchorDraft, relativeMinutes: event.target.value === "" ? Number.NaN : Number(event.target.value) })
                              }
                              onBlur={() => { if (!Number.isFinite(anchorDraft.relativeMinutes)) setAnchorDraft({ ...anchorDraft, relativeMinutes: 0 }); }}
                           />
                        </label>
                     </div>
                  ) : (
                     <label>
                        <span>Time</span>
                        <input
                           type="time"
                           value={anchorDraft.time}
                           onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setAnchorDraft({
                                 ...anchorDraft,
                                 time: event.target.value,
                                 timingMode: "fixed",
                                 scheduleReferencePoint: undefined,
                                 scheduleOffsetMinutes: undefined,
                              })
                           }
                        />
                     </label>
                  )}

                  <label className="settings-check-row">
                     <input
                        type="checkbox"
                        checked={anchorDraft.reminder}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                           setAnchorDraft({ ...anchorDraft, reminder: event.target.checked })
                        }
                     />
                     <span>Reminder</span>
                  </label>

                  <div className="settings-edit-actions">
                     <button onClick={() => setAnchorDraft(null)}>Cancel</button>
                     <button className="settings-primary-action" onClick={saveAnchor}>
                        <Check size={14} /> Save
                     </button>
                  </div>
               </div>
            ) : null}
         </section> : null}
      </div>
   );
}
