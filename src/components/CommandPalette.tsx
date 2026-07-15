// ========================================
// ALLEVIN Command Palette
// Purpose:
// Keyboard-first command layer for MK VIII
// project-first navigation, references, schedule,
// and simple workspace guidance.
// ========================================

"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";

import { Command, Search, House, CalendarDays, FolderKanban, ArrowRight, X } from "lucide-react";

import { useWorkspace, type WorkspaceSystemStatus } from "@/components/WorkspaceContext";

// ========================================
// Types
// ========================================

type CommandGroup = "Navigation";

type ProductModuleId = "home" | "canvas" | "tasks" | "board" | "recovery" | "control" | "calendar" | "integrations" | "advanced";

type WorkspaceView = "home" | "focus" | "workspace" | "insights" | "integrations";

interface CommandItem {
   label: string;

   description: string;

   group: CommandGroup;

   keywords: string[];

   icon: ElementType;

   moduleId: ProductModuleId;

   targetId: string;

   activeView: WorkspaceView;

   systemStatus: WorkspaceSystemStatus;

   assistantCue: string;
}

// ========================================
// Group Order
// This controls visual order AND keyboard order.
// ========================================

const commandGroupOrder: CommandGroup[] = ["Navigation"];

// ========================================
// MK VIII — Command Palette Sanitization
// ========================================

const COMMAND_SANITIZE_LIMITS = {
   query: 120,
   notice: 220,
   routeValue: 120,
} as const;

function limitCommandTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeCommandMarkup(value?: string) {
   let clean = value || "";

   clean = clean.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
   clean = clean.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
   clean = clean.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
   clean = clean.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "");
   clean = clean.replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "");
   clean = clean.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
   clean = clean.replace(/javascript\s*:/gi, "");
   clean = clean.replace(/data\s*:\s*text\/html/gi, "");
   clean = clean.replace(/<[^>]+>/g, "");

   return clean;
}

function sanitizeCommandText(value?: string, maxLength: number = COMMAND_SANITIZE_LIMITS.query, options: { preserveEdges?: boolean } = {}) {
   const cleaned = stripUnsafeCommandMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n");

   return limitCommandTextLength(options.preserveEdges ? cleaned : cleaned.trim(), maxLength);
}

function sanitizeLiveCommandQuery(value?: string) {
   return sanitizeCommandText(value, COMMAND_SANITIZE_LIMITS.query, {
      preserveEdges: true,
   });
}

function sanitizeCommandRouteValue(value?: string) {
   return sanitizeCommandText(value, COMMAND_SANITIZE_LIMITS.routeValue)
      .replace(/[^a-z0-9_-]/gi, "")
      .trim();
}

// ========================================
// Commands
// ========================================

const commands: CommandItem[] = [
   {
      label: "Open Home",
      description: "Return to Home to see your latest project, schedule, and next step.",
      group: "Navigation",
      keywords: ["home", "overview", "dashboard", "start", "welcome", "today", "glance"],
      icon: House,
      moduleId: "home",
      targetId: "overview",
      activeView: "home",
      systemStatus: "workspace-stable",
      assistantCue: "Home opened.",
   },

   {
      label: "Open Projects",
      description: "Open saved projects, materials, and project notes.",
      group: "Navigation",
      keywords: ["projects", "project hub", "home base", "saved work", "materials", "references", "notes", "memory", "continue", "organize"],
      icon: FolderKanban,
      moduleId: "integrations",
      targetId: "work-area",
      activeView: "integrations",
      systemStatus: "integration-ready",
      assistantCue: "Projects opened.",
   },

   {
      label: "Open Calendar",
      description: "Open events, deadlines, and project time blocks.",
      group: "Navigation",
      keywords: ["calendar", "schedule", "meeting", "event", "events", "deadline", "time block", "time"],
      icon: CalendarDays,
      moduleId: "calendar",
      targetId: "work-area",
      activeView: "workspace",
      systemStatus: "schedule-context-active",
      assistantCue: "Calendar opened.",
   },
];

// ========================================
// Helpers
// ========================================

function isProductModuleId(value?: string): value is ProductModuleId {
   return value === "home" || value === "canvas" || value === "tasks" || value === "board" || value === "recovery" || value === "control" || value === "calendar" || value === "integrations" || value === "advanced";
}

function scrollToSection(targetId: string, showNotice: (message: string) => void) {
   window.setTimeout(() => {
      const target = document.getElementById(targetId);

      if (!target) {
         showNotice("That section is not available right now.");

         return;
      }

      target.scrollIntoView({
         behavior: "smooth",

         block: "start",
      });
   }, 80);
}

// ========================================
// Component
// ========================================

export default function CommandPalette() {
   const workspace = useWorkspace();

   const [open, setOpen] = useState(false);

   const [query, setQuery] = useState("");

   const [selectedIndex, setSelectedIndex] = useState(0);

   const [notice, setNotice] = useState("");

   // ========================================
   // Filtered Commands
   // ========================================

   const filteredCommands = useMemo(() => {
      const lowerQuery = sanitizeCommandText(query, COMMAND_SANITIZE_LIMITS.query).toLowerCase().trim();

      if (!lowerQuery) {
         return commands;
      }

      return commands.filter((command) => {
         const searchable = `
            ${command.label}
            ${command.description}
            ${command.group}
            ${command.keywords.join(" ")}
            ${command.moduleId}
         `.toLowerCase();

         return searchable.includes(lowerQuery);
      });
   }, [query]);

   // ========================================
   // Display Commands
   // This is the actual visual order.
   // Keyboard navigation uses this same array.
   // ========================================

   const displayCommands = useMemo(() => {
      return commandGroupOrder.flatMap((group) => filteredCommands.filter((command) => command.group === group));
   }, [filteredCommands]);

   // ========================================
   // Grouped Commands
   // Uses the same display order as keyboard navigation.
   // ========================================

   const groupedCommands = useMemo(() => {
      return commandGroupOrder.reduce(
         (groups, group) => {
            const groupCommands = displayCommands.filter((command) => command.group === group);

            if (groupCommands.length > 0) {
               groups[group] = groupCommands;
            }

            return groups;
         },
         {} as Record<CommandGroup, CommandItem[]>,
      );
   }, [displayCommands]);

   // ========================================
   // Keyboard Shortcut Listener
   // ========================================

   useEffect(() => {
      function handleKeyDown(event: KeyboardEvent) {
         const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

         if (isCommandK) {
            event.preventDefault();

            setOpen((prev) => !prev);

            return;
         }

         if (!open) {
            return;
         }

         if (event.key === "Escape") {
            event.preventDefault();

            closePalette();

            return;
         }

         if (event.key === "ArrowDown") {
            event.preventDefault();

            setSelectedIndex((prev) => (displayCommands.length === 0 ? 0 : Math.min(prev + 1, displayCommands.length - 1)));

            return;
         }

         if (event.key === "ArrowUp") {
            event.preventDefault();

            setSelectedIndex((prev) => (displayCommands.length === 0 ? 0 : Math.max(prev - 1, 0)));

            return;
         }

         if (event.key === "Enter") {
            event.preventDefault();

            const selectedCommand = displayCommands[selectedIndex];

            if (selectedCommand) {
               runCommand(selectedCommand);
            }
         }
      }

      window.addEventListener("keydown", handleKeyDown);

      return () => {
         window.removeEventListener("keydown", handleKeyDown);
      };
   }, [open, displayCommands, selectedIndex]);

   // ========================================
   // Reset Selection When Query Changes
   // ========================================

   useEffect(() => {
      setSelectedIndex(0);
   }, [query]);

   // ========================================
   // Keep Selection In Bounds
   // ========================================

   useEffect(() => {
      if (selectedIndex > displayCommands.length - 1) {
         setSelectedIndex(0);
      }
   }, [displayCommands.length, selectedIndex]);

   // ========================================
   // Helpers
   // ========================================

   function showNotice(message: string) {
      setNotice(sanitizeCommandText(message, COMMAND_SANITIZE_LIMITS.notice));

      setTimeout(() => {
         setNotice("");
      }, 1400);
   }

   function closePalette() {
      setOpen(false);

      setQuery("");

      setSelectedIndex(0);

      setNotice("");
   }

   function openProductModule(command: CommandItem) {
      if (!workspace || !isProductModuleId(command.moduleId)) {
         return;
      }

      workspace.setActiveView(command.activeView);

      workspace.setSystemStatus(command.systemStatus);

      workspace.registerWorkspaceActivity(command.systemStatus);

      const safeCommandModuleId = sanitizeCommandRouteValue(command.moduleId);

      if (!isProductModuleId(safeCommandModuleId)) {
         showNotice("That command is not available right now.");

         return;
      }

      const normalizedModuleId = safeCommandModuleId === "tasks" || safeCommandModuleId === "board" || safeCommandModuleId === "recovery" || safeCommandModuleId === "control" ? "integrations" : safeCommandModuleId;

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: normalizedModuleId,
            },
         }),
      );

      scrollToSection(sanitizeCommandRouteValue(command.targetId) || command.targetId, showNotice);

      showNotice(command.assistantCue);

      closePalette();
   }

   function runCommand(command: CommandItem) {
      openProductModule(command);
   }

   function getDisplayCommandIndex(command: CommandItem) {
      return displayCommands.findIndex((item) => item.label === command.label);
   }

   // ========================================
   // Hidden State
   // ========================================

   if (!workspace) {
      return null;
   }

   if (!open) {
      return null;
   }

   return (
      <div
         className="
            fixed
            inset-0
            z-[200]
            flex
            items-start
            justify-center
            bg-[rgba(23,32,51,0.16)]
            px-3
            py-4
            backdrop-blur-sm
            sm:px-5
            sm:py-6
            lg:py-8
         "
         onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
               closePalette();
            }
         }}
      >
         <div
            className="
               w-full
               max-w-2xl
               max-h-[calc(100dvh-2rem)]
               overflow-hidden
               rounded-[20px]
               sm:rounded-[24px]
               border
               border-[var(--border-subtle)]
               bg-[rgba(255,253,249,0.98)]
               shadow-[var(--shadow-floating)]
            "
         >
            {/* Header */}

            <div
               className="
                  border-b
                  border-[var(--border-subtle)]
                  px-3
                  py-3
                  sm:px-4
               "
            >
               <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                     <p className="studio-eyebrow">Command Palette</p>

                     <h2 data-editorial-title="true" className="mt-2 text-2xl leading-tight sm:text-3xl">
                        Where do you want to go?
                     </h2>

                     <p className="mt-2 hidden text-xs text-[var(--color-text-secondary)] sm:block">Move between Home, Projects, Canvas, and Calendar.</p>
                  </div>

                  <button
                     onClick={closePalette}
                     className="
                        flex
                        h-9
                        w-9
                        items-center
                        justify-center
                        rounded-[var(--radius-md)]
                        border
                        border-[var(--border-subtle)]
                        bg-transparent
                        text-[var(--color-text-secondary)]
                        transition-colors
                        hover:bg-[var(--color-bg-soft)]
                        hover:text-[var(--color-text-primary)]
                     "
                     aria-label="Close command palette"
                  >
                     <X size={18} />
                  </button>
               </div>

               <div
                  className="
                     flex
                     items-center
                     gap-3
                     rounded-[var(--radius-lg)]
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-surface)]
                     px-4
                     py-3
                     shadow-[var(--shadow-soft)]
                  "
               >
                  <Search size={16} className="text-[var(--color-text-secondary)]" />

                  <input
                     autoFocus
                     value={query}
                     onChange={(event) => setQuery(sanitizeLiveCommandQuery(event.target.value))}
                     type="text"
                     placeholder="Search Home, Projects, Canvas, or Calendar..."
                     className="
                        flex-1
                        bg-transparent
                        text-sm
                        outline-none
                        sm:text-sm
                        placeholder:text-[var(--color-text-secondary)]
                     "
                  />

                  <div
                     className="
                        flex
                        items-center
                        gap-1
                        rounded-[var(--radius-sm)]
                        border
                        border-[var(--border-subtle)]
                        bg-transparent
                        px-2
                        py-1
                        text-xs
                        text-[var(--color-text-secondary)]
                     "
                  >
                     <Command size={12} />

                     <span>K</span>
                  </div>
               </div>

               {notice && <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-blue)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">{notice}</div>}
            </div>

            {/* Command List */}

            <div className="max-h-[min(420px,calc(100dvh-12rem))] overflow-y-auto px-3 py-2 sm:px-4">
               {displayCommands.length > 0 ? (
                  <div className="space-y-2">
                     {commandGroupOrder.map((group) => {
                        const groupCommands = groupedCommands[group];

                        if (!groupCommands || groupCommands.length === 0) {
                           return null;
                        }

                        return (
                           <div key={group}>
                              <p
                                 className="
                                    mb-2
                                    px-1
                                    pt-2
                                    text-[10px]
                                    font-semibold
                                    uppercase
                                    tracking-[0.18em]
                                    text-[var(--color-text-secondary)]
                                 "
                              >
                                 {group}
                              </p>

                              <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                                 {groupCommands.map((command) => {
                                    const Icon = command.icon;

                                    const displayIndex = getDisplayCommandIndex(command);

                                    const isSelected = selectedIndex === displayIndex;

                                    return (
                                       <button
                                          key={command.label}
                                          onMouseEnter={() => setSelectedIndex(displayIndex)}
                                          onClick={() => runCommand(command)}
                                          className={`
                                             flex
                                             w-full
                                             items-center
                                             justify-between
                                             gap-3
                                             px-2
                                             py-3
                                             sm:px-3
                                             sm:py-4
                                             text-left
                                             transition-colors

                                             ${isSelected ? "bg-[var(--color-surface-blue)]" : "hover:bg-[rgba(255,255,255,0.48)]"}
                                          `}
                                       >
                                          <div className="flex min-w-0 items-center gap-3">
                                             <div
                                                className="
                                                   flex
                                                   h-9
                                                   w-9
                                                   sm:h-10
                                                   sm:w-10
                                                   shrink-0
                                                   items-center
                                                   justify-center
                                                   rounded-[var(--radius-md)]
                                                   border
                                                   border-[var(--border-subtle)]
                                                   bg-[var(--color-surface)]
                                                "
                                             >
                                                <Icon size={18} className="text-[var(--color-primary)]" />
                                             </div>

                                             <div className="min-w-0">
                                                <p className="text-sm font-medium">{command.label}</p>

                                                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-secondary)]">{command.description}</p>
                                             </div>
                                          </div>

                                          <ArrowRight
                                             size={14}
                                             className={`
                                                shrink-0
                                                ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]"}
                                             `}
                                          />
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               ) : (
                  <div
                     className="
                        rounded-[var(--radius-lg)]
                        border
                        border-[var(--border-subtle)]
                        bg-[var(--color-surface)]
                        p-4
                        text-xs
                        leading-relaxed
                        text-[var(--color-text-secondary)]
                     "
                  >
                     No command matched that search. Try “Projects,” “Canvas,” “Calendar,” or “Home.”
                  </div>
               )}
            </div>

            {/* Footer */}

            <div
               className="
                  flex
                  flex-wrap
                  items-center
                  justify-between
                  gap-3
                  border-t
                  border-[var(--border-subtle)]
                  px-3
                  py-2.5
                  sm:px-4
                  sm:py-3
                  text-xs
                  text-[var(--color-text-secondary)]
               "
            >
               <div className="hidden flex-wrap items-center gap-2 sm:flex">
                  <span>↑↓ Move</span>

                  <span>Enter Open</span>

                  <span>Esc Close</span>
               </div>

               <span>
                  {displayCommands.length} result
                  {displayCommands.length === 1 ? "" : "s"}
               </span>
            </div>
         </div>
      </div>
   );
}
