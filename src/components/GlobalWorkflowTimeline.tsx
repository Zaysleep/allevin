"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Activity, ChevronDown, Clock3, Filter, GitBranch, RotateCcw, Search } from "lucide-react";

// ========================================
// Storage
// ========================================

const STORAGE_KEY = "allevin-global-workflow-timeline";

// ========================================
// Types
// ========================================

type WorkflowSource = "canvas" | "task" | "board" | "project" | "calendar" | "notes" | "system" | "manual" | "research" | "integrations";

type WorkflowDestination = "canvas" | "task" | "board" | "project" | "calendar" | "notes" | "system" | "manual" | "integrations";

type WorkflowEventType = "created" | "sent" | "updated" | "moved" | "reset" | "insight";

type EventFilter = "all" | "canvas" | "task" | "board" | "calendar" | "project" | "notes" | "system";

interface WorkflowTimelineEvent {
   id: string;

   type: WorkflowEventType;

   source: WorkflowSource;

   destination: WorkflowDestination;

   title: string;

   summary: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   workflowId?: string;

   originBoardItemId?: string;

   priority?: string;

   lane?: string;

   createdAt: number;
}

interface WorkflowPayload {
   title?: string;

   body?: string;

   description?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   source?: WorkflowSource;

   destination?: WorkflowDestination;

   workflowId?: string;

   originBoardItemId?: string;

   priority?: string;

   lane?: string;
}

// ========================================
// Helpers
// ========================================

function compactText(value?: string) {
   return (value || "").replace(/\s+/g, " ").trim();
}

function getPayloadTitle(payload: WorkflowPayload, fallback: string) {
   const directTitle = compactText(payload.title || payload.sourceTitle);

   if (directTitle) {
      return directTitle.length > 90 ? `${directTitle.slice(0, 90)}...` : directTitle;
   }

   const firstUsefulLine = (payload.body || payload.description || payload.sourceContent || payload.workingSummary || "")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);

   if (firstUsefulLine) {
      return firstUsefulLine.length > 90 ? `${firstUsefulLine.slice(0, 90)}...` : firstUsefulLine;
   }

   return fallback;
}

function getPayloadSummary(payload: WorkflowPayload, fallback: string) {
   const content = compactText(payload.description || payload.cleanSourceContent || payload.sourceContent || payload.workingSummary || payload.body || payload.title);

   if (!content) {
      return fallback;
   }

   return content.length > 160 ? `${content.slice(0, 160)}...` : content;
}

function getPayloadCleanSourceContent(payload: WorkflowPayload) {
   return compactText(payload.cleanSourceContent || payload.sourceContent || payload.workingSummary || payload.description || payload.body);
}

function normalizeSource(value?: string): WorkflowSource {
   if (value === "canvas" || value === "task" || value === "board" || value === "project" || value === "calendar" || value === "notes" || value === "manual" || value === "research" || value === "integrations") {
      return value;
   }

   return "system";
}

function normalizeDestination(value?: string): WorkflowDestination {
   if (value === "canvas" || value === "task" || value === "board" || value === "project" || value === "calendar" || value === "notes" || value === "manual" || value === "integrations") {
      return value;
   }

   return "system";
}

function normalizeEventType(value?: string): WorkflowEventType {
   if (value === "created" || value === "sent" || value === "updated" || value === "moved" || value === "reset" || value === "insight") {
      return value;
   }

   return "insight";
}

function createTimelineEvent({
   type,
   source,
   destination,
   title,
   summary,
   sourceTitle,
   sourceContent,
   workingSummary,
   cleanSourceContent,
   workflowId,
   originBoardItemId,
   priority,
   lane,
}: {
   type: WorkflowEventType;

   source: WorkflowSource;

   destination: WorkflowDestination;

   title: string;

   summary: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   workflowId?: string;

   originBoardItemId?: string;

   priority?: string;

   lane?: string;
}): WorkflowTimelineEvent {
   return {
      id: crypto.randomUUID(),

      type,

      source,

      destination,

      title,

      summary,

      sourceTitle,

      sourceContent,

      workingSummary,

      cleanSourceContent,

      workflowId,

      originBoardItemId,

      priority,

      lane,

      createdAt: Date.now(),
   };
}

function getSourceLabel(source: WorkflowSource) {
   switch (source) {
      case "canvas":
         return "Canvas";

      case "task":
         return "Tasks";

      case "project":
      case "board":
         return "Board";

      case "calendar":
         return "Calendar";

      case "notes":
         return "Notes";

      case "manual":
         return "Manual";

      case "integrations":
         return "Projects";

      case "research":
         return "Research";

      default:
         return "System";
   }
}

function getDestinationLabel(destination: WorkflowDestination) {
   switch (destination) {
      case "canvas":
         return "Canvas";

      case "task":
         return "Tasks";

      case "project":
      case "board":
         return "Board";

      case "calendar":
         return "Calendar";

      case "notes":
         return "Notes";

      case "integrations":
         return "Projects";

      default:
         return "System";
   }
}

function getEventTypeLabel(type: WorkflowEventType) {
   switch (type) {
      case "created":
         return "Created";

      case "sent":
         return "Sent";

      case "updated":
         return "Updated";

      case "moved":
         return "Moved";

      case "reset":
         return "Reset";

      default:
         return "Saved";
   }
}

function getTimeLabel(timestamp: number) {
   return new Date(timestamp).toLocaleString([], {
      month: "short",

      day: "numeric",

      hour: "numeric",

      minute: "2-digit",
   });
}

function isLowValueSignal(event: WorkflowTimelineEvent) {
   const searchable = compactText(`${event.title} ${event.summary}`).toLowerCase();

   const ignoredSignals = [
      "google docs",
      "google doc",
      "external export",
      "human approval",
      "human control",
      "approval required",
      "workflow review prepared",
      "continue most active",
      "review latest signal",
      "generate follow-up task",
      "internal allevin note saved",
      "calendar readback prepared",
   ];

   return ignoredSignals.some((signal) => searchable.includes(signal));
}

function readStoredEvents() {
   if (typeof window === "undefined") {
      return [] as WorkflowTimelineEvent[];
   }

   const stored = localStorage.getItem(STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((event) => event && typeof event.id === "string")
         .map((event) => ({
            id: typeof event.id === "string" ? event.id : crypto.randomUUID(),

            type: normalizeEventType(event.type),

            source: normalizeSource(event.source),

            destination: normalizeDestination(event.destination),

            title: compactText(event.title) || "Workflow update",

            summary: compactText(event.summary) || "A workflow update was saved.",

            sourceTitle: typeof event.sourceTitle === "string" ? event.sourceTitle : undefined,

            sourceContent: typeof event.sourceContent === "string" ? event.sourceContent : undefined,

            workingSummary: typeof event.workingSummary === "string" ? event.workingSummary : undefined,

            cleanSourceContent: typeof event.cleanSourceContent === "string" ? event.cleanSourceContent : undefined,

            workflowId: typeof event.workflowId === "string" ? event.workflowId : undefined,

            originBoardItemId: typeof event.originBoardItemId === "string" ? event.originBoardItemId : undefined,

            priority: typeof event.priority === "string" ? event.priority : undefined,

            lane: typeof event.lane === "string" ? event.lane : undefined,

            createdAt: typeof event.createdAt === "number" ? event.createdAt : Date.now(),
         }))
         .filter((event) => !isLowValueSignal(event));
   } catch {
      localStorage.removeItem(STORAGE_KEY);

      return [];
   }
}

function saveStoredEvents(events: WorkflowTimelineEvent[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(STORAGE_KEY, JSON.stringify(events.filter((event) => !isLowValueSignal(event)).slice(0, 80)));
}

// ========================================
// Component
// ========================================

export default function GlobalWorkflowTimeline() {
   const [mounted, setMounted] = useState(false);

   const [events, setEvents] = useState<WorkflowTimelineEvent[]>([]);

   const [notice, setNotice] = useState("");

   const [timelineOpen, setTimelineOpen] = useState(false);

   const [expandedEventIds, setExpandedEventIds] = useState<string[]>([]);

   const [eventFilter, setEventFilter] = useState<EventFilter>("all");

   const [searchQuery, setSearchQuery] = useState("");

   useEffect(() => {
      setMounted(true);

      setEvents(readStoredEvents());
   }, []);

   useEffect(() => {
      if (!mounted) {
         return;
      }

      saveStoredEvents(events);
   }, [events, mounted]);

   function showNotice(message: string) {
      setNotice(message);

      window.setTimeout(() => {
         setNotice("");
      }, 1200);
   }

   function addEvent(event: WorkflowTimelineEvent) {
      if (isLowValueSignal(event)) {
         return;
      }

      setEvents((current) => {
         if (current.some((existingEvent) => existingEvent.id === event.id)) {
            return current;
         }

         const updated = [event, ...current].slice(0, 80);

         saveStoredEvents(updated);

         return updated;
      });
   }

   function resetTimeline() {
      localStorage.removeItem(STORAGE_KEY);

      setEvents([]);

      setExpandedEventIds([]);

      setSearchQuery("");

      setEventFilter("all");

      setTimelineOpen(false);

      showNotice("Cleared");
   }

   function toggleEventDetails(id: string) {
      setExpandedEventIds((current) => (current.includes(id) ? current.filter((eventId) => eventId !== id) : [...current, id]));
   }

   useEffect(() => {
      function handleSendToCanvas(event: Event) {
         const customEvent = event as CustomEvent<WorkflowPayload>;

         const payload = customEvent.detail;

         if (!payload) {
            return;
         }

         const cleanSourceContent = getPayloadCleanSourceContent(payload);

         addEvent(
            createTimelineEvent({
               type: "sent",

               source: payload.source === "project" || payload.source === "integrations" ? "project" : normalizeSource(payload.source),

               destination: "canvas",

               title: getPayloadTitle(payload, "Sent to Canvas"),

               summary: getPayloadSummary(payload, "Work moved to Canvas."),

               sourceTitle: payload.sourceTitle || payload.title,

               sourceContent: cleanSourceContent,

               workingSummary: payload.workingSummary || cleanSourceContent,

               cleanSourceContent,

               workflowId: payload.workflowId,

               originBoardItemId: payload.originBoardItemId,

               priority: payload.priority,

               lane: payload.lane,
            }),
         );
      }

      function handleSendToTask(event: Event) {
         const customEvent = event as CustomEvent<WorkflowPayload>;

         const payload = customEvent.detail;

         if (!payload) {
            return;
         }

         const cleanSourceContent = getPayloadCleanSourceContent(payload);

         addEvent(
            createTimelineEvent({
               type: "sent",

               source: normalizeSource(payload.source || "canvas"),

               destination: "task",

               title: getPayloadTitle(payload, "Created Task"),

               summary: getPayloadSummary(payload, "A task was created."),

               sourceTitle: payload.sourceTitle || payload.title,

               sourceContent: cleanSourceContent,

               workingSummary: payload.workingSummary || cleanSourceContent,

               cleanSourceContent,

               workflowId: payload.workflowId,

               originBoardItemId: payload.originBoardItemId,

               priority: payload.priority,

               lane: payload.lane,
            }),
         );
      }

      function handleSendToBoard(event: Event) {
         const customEvent = event as CustomEvent<WorkflowPayload>;

         const payload = customEvent.detail;

         if (!payload) {
            return;
         }

         const cleanSourceContent = getPayloadCleanSourceContent(payload);

         addEvent(
            createTimelineEvent({
               type: "sent",

               source: normalizeSource(payload.source || "task"),

               destination: "board",

               title: getPayloadTitle(payload, "Moved to Board"),

               summary: getPayloadSummary(payload, "Work moved to the Board."),

               sourceTitle: payload.sourceTitle || payload.title,

               sourceContent: cleanSourceContent,

               workingSummary: payload.workingSummary || cleanSourceContent,

               cleanSourceContent,

               workflowId: payload.workflowId,

               originBoardItemId: payload.originBoardItemId,

               priority: payload.priority,

               lane: payload.lane,
            }),
         );
      }

      function handleManualWorkflowLog(event: Event) {
         const customEvent = event as CustomEvent<Partial<WorkflowTimelineEvent>>;

         if (!customEvent.detail) {
            return;
         }

         const detail = customEvent.detail;

         addEvent({
            id: typeof detail.id === "string" ? detail.id : crypto.randomUUID(),

            type: normalizeEventType(detail.type),

            source: normalizeSource(detail.source),

            destination: normalizeDestination(detail.destination),

            title: compactText(detail.title) || "Workflow update",

            summary: compactText(detail.summary) || "A workflow update was saved.",

            sourceTitle: detail.sourceTitle,

            sourceContent: detail.sourceContent,

            workingSummary: detail.workingSummary,

            cleanSourceContent: detail.cleanSourceContent || detail.sourceContent || detail.workingSummary,

            workflowId: detail.workflowId,

            originBoardItemId: detail.originBoardItemId,

            priority: detail.priority,

            lane: detail.lane,

            createdAt: typeof detail.createdAt === "number" ? detail.createdAt : Date.now(),
         });
      }

      function refreshFromStorage() {
         setEvents(readStoredEvents());
      }

      window.addEventListener("allevin-send-to-canvas", handleSendToCanvas);

      window.addEventListener("allevin-send-to-task", handleSendToTask);

      window.addEventListener("allevin-send-to-board", handleSendToBoard);

      window.addEventListener("allevin-log-workflow-event", handleManualWorkflowLog);

      window.addEventListener("storage", refreshFromStorage);

      return () => {
         window.removeEventListener("allevin-send-to-canvas", handleSendToCanvas);

         window.removeEventListener("allevin-send-to-task", handleSendToTask);

         window.removeEventListener("allevin-send-to-board", handleSendToBoard);

         window.removeEventListener("allevin-log-workflow-event", handleManualWorkflowLog);

         window.removeEventListener("storage", refreshFromStorage);
      };
   }, []);

   const filteredEvents = useMemo(() => {
      const lowerQuery = searchQuery.toLowerCase().trim();

      return events.filter((event) => {
         const matchesFilter = eventFilter === "all" || event.source === eventFilter || event.destination === eventFilter;

         if (!matchesFilter) {
            return false;
         }

         if (!lowerQuery) {
            return true;
         }

         const searchable = `
            ${event.title}
            ${event.summary}
            ${event.sourceTitle ?? ""}
            ${event.sourceContent ?? ""}
            ${event.workingSummary ?? ""}
            ${event.cleanSourceContent ?? ""}
            ${event.source}
            ${event.destination}
            ${event.type}
         `.toLowerCase();

         return searchable.includes(lowerQuery);
      });
   }, [events, eventFilter, searchQuery]);

   const latestEvent = events[0];

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         layout
         initial={{
            opacity: 0,
            y: 10,
         }}
         animate={{
            opacity: 1,
            y: 0,
         }}
         transition={{
            duration: 0.35,
         }}
         className="
            rounded-[32px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-6
            shadow-[var(--shadow-soft)]
         "
      >
         <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
               <h2 className="text-3xl">Workflow History</h2>

               <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">A simple record of where work has moved.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               {notice && <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}

               <button
                  onClick={resetTimeline}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-5
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <RotateCcw size={16} />
                  Clear History
               </button>
            </div>
         </div>

         <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Total</p>

               <p className="mt-2 text-xl font-medium">{events.length}</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Latest</p>

               <p className="mt-2 line-clamp-1 text-sm font-medium">{latestEvent ? latestEvent.title : "No movement yet"}</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Route</p>

               <p className="mt-2 text-sm font-medium">{latestEvent ? `${getSourceLabel(latestEvent.source)} → ${getDestinationLabel(latestEvent.destination)}` : "None yet"}</p>
            </div>
         </div>

         <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
            <button
               onClick={() => setTimelineOpen((current) => !current)}
               className="
                  flex
                  w-full
                  items-center
                  justify-between
                  gap-4
                  rounded-2xl
                  bg-[var(--color-bg)]
                  p-4
                  text-left
                  transition-colors
                  hover:bg-white
               "
            >
               <div className="flex items-center gap-3">
                  <GitBranch size={18} />

                  <div>
                     <p className="font-medium">History</p>

                     <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{timelineOpen ? "Hide movement history." : "Show movement history."}</p>
                  </div>
               </div>

               <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-white px-3 py-2 text-xs text-[var(--color-text-secondary)]">{filteredEvents.length}</span>

                  <ChevronDown
                     size={18}
                     className={`
                        transition-transform
                        duration-200

                        ${timelineOpen ? "rotate-180" : ""}
                     `}
                  />
               </div>
            </button>

            <AnimatePresence>
               {timelineOpen && (
                  <motion.div
                     layout
                     initial={{
                        opacity: 0,
                        y: 8,
                     }}
                     animate={{
                        opacity: 1,
                        y: 0,
                     }}
                     exit={{
                        opacity: 0,
                        y: -8,
                     }}
                     className="mt-4 space-y-4"
                  >
                     <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_220px]">
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
                           <div className="flex items-center gap-3">
                              <Search size={18} />

                              <input
                                 value={searchQuery}
                                 onChange={(event) => setSearchQuery(event.target.value)}
                                 placeholder="Search history..."
                                 className="
                                    w-full
                                    bg-transparent
                                    text-sm
                                    outline-none
                                    placeholder:text-[var(--color-text-secondary)]
                                 "
                              />
                           </div>
                        </div>

                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
                           <div className="flex items-center gap-3">
                              <Filter size={18} />

                              <select
                                 value={eventFilter}
                                 onChange={(event) => setEventFilter(event.target.value as EventFilter)}
                                 className="
                                    w-full
                                    bg-transparent
                                    text-sm
                                    outline-none
                                 "
                              >
                                 <option value="all">All</option>
                                 <option value="canvas">Canvas</option>
                                 <option value="task">Tasks</option>
                                 <option value="board">Board</option>
                                 <option value="calendar">Calendar</option>
                                 <option value="project">Projects</option>
                                 <option value="notes">Notes</option>
                                 <option value="system">System</option>
                              </select>
                           </div>
                        </div>
                     </div>

                     {filteredEvents.length > 0 ? (
                        filteredEvents.map((event) => {
                           const eventOpen = expandedEventIds.includes(event.id);

                           const preservedSource = compactText(event.cleanSourceContent || event.sourceContent || event.workingSummary);

                           return (
                              <motion.div
                                 key={event.id}
                                 layout
                                 initial={{
                                    opacity: 0,
                                    y: 8,
                                 }}
                                 animate={{
                                    opacity: 1,
                                    y: 0,
                                 }}
                                 exit={{
                                    opacity: 0,
                                    scale: 0.96,
                                 }}
                                 className="
                                    rounded-2xl
                                    bg-[var(--color-bg)]
                                    p-4
                                 "
                              >
                                 <div className="flex items-start justify-between gap-4">
                                    <button
                                       type="button"
                                       onClick={() => toggleEventDetails(event.id)}
                                       className="
                                          flex
                                          min-w-0
                                          flex-1
                                          items-start
                                          gap-3
                                          text-left
                                       "
                                    >
                                       <div className="rounded-xl bg-white p-3">
                                          <Activity size={16} />
                                       </div>

                                       <div className="min-w-0 flex-1">
                                          <div className="mb-2 flex flex-wrap items-center gap-2">
                                             <span className="rounded-xl bg-white px-3 py-1 text-xs font-medium">{getSourceLabel(event.source)}</span>

                                             <span className="text-sm text-[var(--color-text-secondary)]">→</span>

                                             <span className="rounded-xl bg-white px-3 py-1 text-xs font-medium">{getDestinationLabel(event.destination)}</span>

                                             <span className="rounded-xl bg-white px-3 py-1 text-xs font-medium">{getEventTypeLabel(event.type)}</span>
                                          </div>

                                          <p className="truncate font-medium">{event.title}</p>

                                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">{event.summary}</p>
                                       </div>
                                    </button>

                                    <div className="flex shrink-0 items-center gap-2">
                                       <div
                                          className="
                                             hidden
                                             items-center
                                             gap-2
                                             rounded-xl
                                             bg-white
                                             px-3
                                             py-2
                                             text-xs
                                             text-[var(--color-text-secondary)]
                                             xl:flex
                                          "
                                       >
                                          <Clock3 size={13} />

                                          {getTimeLabel(event.createdAt)}
                                       </div>

                                       <button
                                          onClick={() => toggleEventDetails(event.id)}
                                          className="
                                             flex
                                             h-10
                                             w-10
                                             items-center
                                             justify-center
                                             rounded-xl
                                             bg-white
                                          "
                                       >
                                          <ChevronDown
                                             size={16}
                                             className={`
                                                transition-transform
                                                duration-200

                                                ${eventOpen ? "rotate-180" : ""}
                                             `}
                                          />
                                       </button>
                                    </div>
                                 </div>

                                 <AnimatePresence>
                                    {eventOpen && (
                                       <motion.div
                                          initial={{
                                             opacity: 0,
                                             height: 0,
                                          }}
                                          animate={{
                                             opacity: 1,
                                             height: "auto",
                                          }}
                                          exit={{
                                             opacity: 0,
                                             height: 0,
                                          }}
                                          transition={{
                                             duration: 0.2,
                                          }}
                                          className="overflow-hidden"
                                       >
                                          <div className="mt-4 space-y-3">
                                             <div className="rounded-2xl bg-white p-4">
                                                <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Summary</p>

                                                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{event.summary}</p>
                                             </div>

                                             {preservedSource && (
                                                <div className="rounded-2xl bg-white p-4">
                                                   <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Details</p>

                                                   <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">{preservedSource}</p>
                                                </div>
                                             )}

                                             <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                <div className="rounded-2xl bg-white p-4">
                                                   <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Moved</p>

                                                   <p className="mt-2 text-sm font-medium">
                                                      {getSourceLabel(event.source)} → {getDestinationLabel(event.destination)}
                                                   </p>
                                                </div>

                                                <div className="rounded-2xl bg-white p-4">
                                                   <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Time</p>

                                                   <p className="mt-2 text-sm font-medium">{getTimeLabel(event.createdAt)}</p>
                                                </div>
                                             </div>
                                          </div>
                                       </motion.div>
                                    )}
                                 </AnimatePresence>
                              </motion.div>
                           );
                        })
                     ) : (
                        <div className="rounded-2xl bg-[var(--color-bg)] p-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">No history yet.</div>
                     )}
                  </motion.div>
               )}
            </AnimatePresence>
         </div>
      </motion.section>
   );
}
