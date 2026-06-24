"use client";

import Image from "next/image";

import { useEffect, useState } from "react";

import type { ElementType } from "react";

import { House, NotebookPen, FolderKanban, CalendarDays, BrainCircuit } from "lucide-react";

import { useWorkspace, type WorkspaceSystemStatus } from "@/components/WorkspaceContext";

// ========================================
// ALLEVIN MK V Sidebar
// Purpose:
// Product-shell navigation for the simplified
// one-stop-shop workspace.
// Keeps Sidebar active state synced when
// navigation happens from Sticky Nav, Cmd+K,
// AIDock, Projects, or product events.
// ========================================

type ProductModuleId = "home" | "canvas" | "tasks" | "board" | "recovery" | "control" | "calendar" | "integrations" | "advanced";

type WorkspaceView = "home" | "focus" | "workspace" | "insights" | "integrations";

interface NavItem {
   label: string;

   icon: ElementType;

   moduleId: ProductModuleId;

   targetId: string;

   workspaceView: WorkspaceView;

   systemStatus: WorkspaceSystemStatus;

   assistantCue: string;
}

// ========================================
// Storage / Event Constants
// ========================================

const ACTIVE_PRODUCT_MODULE_STORAGE_KEY = "allevin-active-product-module";

// ========================================
// MK V Build 6 — Sidebar Route Sanitization
// ========================================

const SIDEBAR_SANITIZE_LIMITS = {
   routeValue: 120,
   buttonText: 500,
} as const;

function limitSidebarTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeSidebarMarkup(value?: string) {
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

function sanitizeSidebarText(value?: string, maxLength: number = SIDEBAR_SANITIZE_LIMITS.buttonText) {
   return limitSidebarTextLength(
      stripUnsafeSidebarMarkup(value)
         .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
         .replace(/\u2028|\u2029/g, "\n")
         .replace(/\r/g, "\n")
         .trim(),
      maxLength,
   );
}

function sanitizeSidebarRouteValue(value?: string | null) {
   return sanitizeSidebarText(value || "", SIDEBAR_SANITIZE_LIMITS.routeValue)
      .replace(/[^a-z0-9_-]/gi, "")
      .trim();
}

const PRODUCT_NAV_EVENT_NAMES = [
   "allevin-open-product-module",
   "allevin-product-module-change",
   "allevin-product-module-changed",
   "allevin-active-product-module-change",
   "allevin-active-product-module-changed",
   "allevin-set-product-module",
   "allevin-sticky-nav-change",
   "allevin-nav-module-change",
];

const WORKFLOW_EVENT_NAMES = [
   "allevin-send-to-canvas",
   "allevin-send-to-task",
   "allevin-send-to-board",
   "allevin-prepare-integration",
   "allevin-request-workflow-action",
   "allevin-open-workflow-control",
   "allevin-calendar-readback",
   "allevin-internal-integration-suggestion",
];

// ========================================
// Navigation
// ========================================

const navItems: NavItem[] = [
   {
      label: "Home",

      icon: House,

      moduleId: "home",

      targetId: "overview",

      workspaceView: "home",

      systemStatus: "workspace-stable",

      assistantCue: "Home",
   },

   {
      label: "Canvas",

      icon: NotebookPen,

      moduleId: "canvas",

      targetId: "work-area",

      workspaceView: "focus",

      systemStatus: "focused-work-active",

      assistantCue: "Canvas",
   },

   {
      label: "Projects",

      icon: FolderKanban,

      moduleId: "integrations",

      targetId: "work-area",

      workspaceView: "integrations",

      systemStatus: "integration-ready",

      assistantCue: "Projects",
   },

   {
      label: "Calendar",

      icon: CalendarDays,

      moduleId: "calendar",

      targetId: "work-area",

      workspaceView: "workspace",

      systemStatus: "schedule-context-active",

      assistantCue: "Calendar",
   },

   {
      label: "Cognition",

      icon: BrainCircuit,

      moduleId: "advanced",

      targetId: "cognition",

      workspaceView: "insights",

      systemStatus: "system-observing",

      assistantCue: "Cognition",
   },
];

// ========================================
// Helpers
// ========================================

function isProductModuleId(value?: string): value is ProductModuleId {
   const cleanValue = sanitizeSidebarRouteValue(value);

   return (
      cleanValue === "home" || cleanValue === "canvas" || cleanValue === "tasks" || cleanValue === "board" || cleanValue === "recovery" || cleanValue === "control" || cleanValue === "calendar" || cleanValue === "integrations" || cleanValue === "advanced"
   );
}

function getNavItemByModule(moduleId?: string) {
   const cleanModuleId = sanitizeSidebarRouteValue(moduleId);

   if (!isProductModuleId(cleanModuleId)) {
      return undefined;
   }

   return navItems.find((item) => item.moduleId === cleanModuleId);
}

function getModuleFromWorkflowEvent(eventName: string): ProductModuleId | null {
   switch (eventName) {
      case "allevin-send-to-canvas":
         return "canvas";

      case "allevin-send-to-task":
      case "allevin-send-to-board":
         return "integrations";

      case "allevin-prepare-integration":
         return "integrations";

      case "allevin-calendar-readback":
         return "calendar";

      case "allevin-request-workflow-action":
      case "allevin-open-workflow-control":
         return "integrations";

      default:
         return null;
   }
}

function getModuleFromEventDetail(detail: unknown): ProductModuleId | null {
   if (!detail || typeof detail !== "object") {
      return null;
   }

   const possibleDetail = detail as Record<string, unknown>;

   const possibleValues = [possibleDetail.moduleId, possibleDetail.productModuleId, possibleDetail.activeModule, possibleDetail.activeProductModule, possibleDetail.productModule, possibleDetail.module, possibleDetail.view, possibleDetail.destination];

   for (const rawValue of possibleValues) {
      const value = typeof rawValue === "string" ? sanitizeSidebarRouteValue(rawValue) : rawValue;

      if (typeof value === "string" && (value === "recovery" || value === "control")) {
         return "integrations";
      }

      if (typeof value === "string" && (value === "tasks" || value === "board" || value === "recovery" || value === "control")) {
         return "integrations";
      }

      if (typeof value === "string" && isProductModuleId(value)) {
         return value;
      }

      if (value === "task") {
         return "integrations";
      }

      if (value === "notes" || value === "integration") {
         return "integrations";
      }

      if (value === "cognition" || value === "advanced") {
         return "advanced";
      }
   }

   return null;
}

function getModuleFromButtonText(value?: string | null): ProductModuleId | null {
   const cleanValue = sanitizeSidebarText(value || "", SIDEBAR_SANITIZE_LIMITS.buttonText)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

   if (!cleanValue) {
      return null;
   }

   const exactMatch = navItems.find((item) => cleanValue === item.label.toLowerCase() || cleanValue === item.moduleId.toLowerCase());

   if (exactMatch) {
      return exactMatch.moduleId;
   }

   if (cleanValue.includes("home")) return "home";
   if (cleanValue.includes("canvas")) return "canvas";

   // Projects command descriptions mention Notes, Tasks, and Calendar.
   // Detect internal/output language before task/calendar so Sidebar stays synced.
   if (
      cleanValue.includes("projects") ||
      cleanValue.includes("project hub") ||
      cleanValue.includes("project workspace") ||
      cleanValue.includes("internal output") ||
      cleanValue.includes("internal hub") ||
      cleanValue.includes("internal") ||
      cleanValue.includes("output") ||
      cleanValue.includes("integration") ||
      cleanValue.includes("export")
   )
      return "integrations";

   if (cleanValue.includes("task")) return "integrations";
   if (cleanValue.includes("board")) return "integrations";
   if (cleanValue.includes("recover")) return "integrations";
   if (cleanValue.includes("control") || cleanValue.includes("action") || cleanValue.includes("review")) return "integrations";
   if (cleanValue.includes("calendar") || cleanValue.includes("schedule")) return "calendar";
   if (cleanValue.includes("cognition") || cleanValue.includes("advanced") || cleanValue.includes("workflow history") || cleanValue.includes("intel") || cleanValue.includes("insight")) return "advanced";

   return null;
}

function saveActiveProductModule(moduleId: ProductModuleId) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(ACTIVE_PRODUCT_MODULE_STORAGE_KEY, sanitizeSidebarRouteValue(moduleId));
}

function getStoredActiveProductModule(): ProductModuleId | null {
   if (typeof window === "undefined") {
      return null;
   }

   const stored = sanitizeSidebarRouteValue(localStorage.getItem(ACTIVE_PRODUCT_MODULE_STORAGE_KEY));

   if (stored === "recovery" || stored === "control") {
      return "integrations";
   }

   switch (stored) {
      case "home":
         return "home";

      case "canvas":
         return "canvas";

      case "tasks":
      case "board":
      case "recovery":
      case "control":
         return "integrations";

      case "calendar":
         return "calendar";

      case "integrations":
         return "integrations";

      case "advanced":
         return "advanced";

      default:
         return null;
   }
}

function scrollToSection(targetId: string) {
   window.setTimeout(() => {
      const safeTargetId = sanitizeSidebarRouteValue(targetId);

      const target = document.getElementById(safeTargetId);

      if (!target) {
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

export default function Sidebar() {
   const workspace = useWorkspace();

   const [activeProductModule, setActiveProductModule] = useState<ProductModuleId>(() => getStoredActiveProductModule() || "home");

   // ========================================
   // Product Navigation Dispatcher
   // ========================================

   function syncActiveProductModule(
      moduleId: ProductModuleId,
      options: {
         updateWorkspace?: boolean;

         updateSystemStatus?: boolean;

         persist?: boolean;
      } = {},
   ) {
      const safeModuleId = sanitizeSidebarRouteValue(moduleId) as ProductModuleId;

      if (!isProductModuleId(safeModuleId)) {
         return;
      }

      const item = getNavItemByModule(safeModuleId);

      setActiveProductModule(safeModuleId);

      if (options.persist !== false) {
         saveActiveProductModule(safeModuleId);
      }

      if (!item) {
         return;
      }

      if (options.updateWorkspace) {
         workspace.setActiveView(item.workspaceView);
      }

      if (options.updateSystemStatus !== false) {
         workspace.setSystemStatus(item.systemStatus);

         workspace.registerWorkspaceActivity(item.systemStatus);
      }
   }

   function openProductModule(item: NavItem) {
      syncActiveProductModule(item.moduleId, {
         updateWorkspace: true,

         updateSystemStatus: true,
      });

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: sanitizeSidebarRouteValue(item.moduleId),

               targetId: sanitizeSidebarRouteValue(item.targetId),

               workspaceView: item.workspaceView,

               systemStatus: item.systemStatus,
            },
         }),
      );

      scrollToSection(item.targetId);
   }

   function openHome() {
      const homeItem = navItems.find((item) => item.moduleId === "home");

      if (homeItem) {
         openProductModule(homeItem);
      }
   }

   // ========================================
   // Initial sync from storage
   // ========================================

   useEffect(() => {
      const storedModule = getStoredActiveProductModule();

      if (storedModule) {
         syncActiveProductModule(storedModule, {
            updateWorkspace: false,

            updateSystemStatus: true,

            persist: false,
         });
      }
   }, []);

   // ========================================
   // Listen for product-module navigation
   // from Sticky Nav, AIDock, Cmd+K,
   // workflow events, and storage sync.
   // ========================================

   useEffect(() => {
      function handleProductModuleOpen(event: Event) {
         const customEvent = event as CustomEvent<unknown>;

         const moduleId = getModuleFromEventDetail(customEvent.detail);

         if (!moduleId) {
            return;
         }

         syncActiveProductModule(moduleId, {
            updateWorkspace: false,

            updateSystemStatus: true,
         });
      }

      function makeWorkflowHandler(eventName: string) {
         return (event: Event) => {
            const customEvent = event as CustomEvent<unknown>;

            const moduleId = getModuleFromEventDetail(customEvent.detail) || getModuleFromWorkflowEvent(eventName);

            if (moduleId) {
               syncActiveProductModule(moduleId, {
                  updateWorkspace: false,

                  updateSystemStatus: true,
               });
            }
         };
      }

      function handleStorage(event: StorageEvent) {
         if (event.key !== ACTIVE_PRODUCT_MODULE_STORAGE_KEY) {
            return;
         }

         const moduleId = sanitizeSidebarRouteValue(event.newValue);

         if (isProductModuleId(moduleId || undefined)) {
            setActiveProductModule(moduleId as ProductModuleId);

            const item = getNavItemByModule(moduleId);

            if (item) {
               workspace.setSystemStatus(item.systemStatus);
            }
         }
      }

      function handleDocumentClick(event: MouseEvent) {
         const target = event.target as HTMLElement | null;

         if (!target) {
            return;
         }

         const button = target.closest("button, a, [role='button']") as HTMLElement | null;

         if (!button) {
            return;
         }

         const explicitModule = sanitizeSidebarRouteValue(button.getAttribute("data-product-module") || button.getAttribute("data-module-id") || button.getAttribute("data-module") || button.getAttribute("data-allevin-module"));

         const moduleFromExplicitAttribute = isProductModuleId(explicitModule || undefined) ? explicitModule : null;

         const moduleFromText = getModuleFromButtonText(button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent);

         const moduleId = moduleFromExplicitAttribute || moduleFromText;

         if (!moduleId) {
            return;
         }

         window.setTimeout(() => {
            if (!isProductModuleId(moduleId)) {
               return;
            }

            syncActiveProductModule(moduleId, {
               updateWorkspace: false,

               updateSystemStatus: true,
            });
         }, 0);
      }

      const workflowHandlers = WORKFLOW_EVENT_NAMES.map((eventName) => ({
         eventName,

         handler: makeWorkflowHandler(eventName),
      }));

      PRODUCT_NAV_EVENT_NAMES.forEach((eventName) => {
         window.addEventListener(eventName, handleProductModuleOpen);
      });

      workflowHandlers.forEach(({ eventName, handler }) => {
         window.addEventListener(eventName, handler);
      });

      window.addEventListener("storage", handleStorage);

      document.addEventListener("click", handleDocumentClick, true);

      return () => {
         PRODUCT_NAV_EVENT_NAMES.forEach((eventName) => {
            window.removeEventListener(eventName, handleProductModuleOpen);
         });

         workflowHandlers.forEach(({ eventName, handler }) => {
            window.removeEventListener(eventName, handler);
         });

         window.removeEventListener("storage", handleStorage);

         document.removeEventListener("click", handleDocumentClick, true);
      };
   }, [workspace]);

   if (!workspace) {
      return null;
   }

   const activeItem = getNavItemByModule(activeProductModule);

   return (
      <aside
         className="
            pointer-events-auto
            fixed
            bottom-3
            left-3
            right-3
            z-[100]
            flex
            min-h-14
            items-center
            justify-between

            sm:min-h-16
            rounded-[28px]
            border
            border-[var(--border-subtle)]
            bg-[rgba(255,255,255,0.88)]
            px-3
            py-2
            shadow-[var(--shadow-soft)]
            backdrop-blur-xl

            lg:bottom-auto
            lg:left-0
            lg:right-auto
            lg:top-0
            lg:h-screen
            lg:w-24
            lg:flex-col
            lg:justify-start
            lg:rounded-none
            lg:border-y-0
            lg:border-l-0
            lg:border-r
            lg:bg-[rgba(255,255,255,0.78)]
            lg:px-3
            lg:py-5
            lg:shadow-none
         "
      >
         {/* Logo */}

         <button
            type="button"
            aria-label="ALLEVIN Home"
            title="ALLEVIN Home"
            onClick={openHome}
            className="
               hidden
               h-14
               w-14
               shrink-0
               items-center
               justify-center
               rounded-2xl
               bg-white
               p-2
               shadow-[var(--shadow-soft)]
               transition-transform
               hover:scale-105

               lg:mb-5
               lg:flex
            "
         >
            <Image
               src="/allevin-mark.svg"
               alt="ALLEVIN"
               width={44}
               height={44}
               priority
               className="
                  h-10
                  w-10
                  object-contain
               "
            />
         </button>

         {/* Navigation */}

         <nav
            aria-label="Primary Navigation"
            className="
               grid
               w-full
               grid-cols-5
               items-center
               gap-1
               sm:gap-2

               lg:flex
               lg:flex-1
               lg:flex-col
               lg:gap-2
               lg:overflow-y-auto
               lg:pb-2
            "
         >
            {navItems.map((item) => {
               const Icon = item.icon;

               const isActive = activeProductModule === item.moduleId;

               return (
                  <button
                     key={`${item.moduleId}-${item.label}`}
                     type="button"
                     aria-label={item.label}
                     title={`${item.label} · ${item.assistantCue}`}
                     data-product-module={item.moduleId}
                     aria-current={isActive ? "page" : undefined}
                     onClick={() => openProductModule(item)}
                     className={`
                        group
                        relative
                        flex
                        min-h-12
                        w-full
                        shrink-0
                        flex-col
                        items-center
                        justify-center
                        gap-1
                        rounded-2xl
                        border
                        px-2
                        py-2
                        text-[11px]
                        font-medium

                        sm:min-h-14
                        transition-all
                        duration-200

                        lg:h-12
                        lg:w-12
                        lg:flex-none
                        lg:px-0
                        lg:py-0
                        lg:text-sm

                        ${
                           isActive
                              ? `
                                 border-transparent
                                 bg-[var(--color-primary)]
                                 text-[var(--color-cream)]
                                 shadow-[var(--shadow-soft)]
                              `
                              : `
                                 border-transparent
                                 bg-transparent
                                 text-[var(--color-text-secondary)]
                                 hover:border-[var(--border-subtle)]
                                 hover:bg-white
                              `
                        }
                     `}
                  >
                     <Icon size={20} />

                     <span className="sr-only sm:not-sr-only sm:max-w-full sm:truncate lg:sr-only">{item.label}</span>

                     <div
                        aria-hidden="true"
                        className={`
                           absolute
                           -top-1
                           left-1/2
                           h-1.5
                           w-6
                           -translate-x-1/2
                           rounded-full
                           bg-[var(--color-primary)]
                           transition-opacity

                           lg:-right-1
                           lg:left-auto
                           lg:top-1/2
                           lg:h-2
                           lg:w-2
                           lg:-translate-y-1/2
                           lg:translate-x-0
                           lg:bg-[var(--color-cream)]

                           ${isActive ? "opacity-100" : "opacity-0"}
                        `}
                     />
                  </button>
               );
            })}
         </nav>

         {/* System Status */}

         <div
            className="
               mt-3
               hidden
               flex-col
               items-center
               gap-2
               rounded-2xl
               bg-white
               px-2
               py-3
               shadow-[var(--shadow-soft)]

               lg:flex
            "
            title={activeItem?.assistantCue || "Workspace ready"}
         >
            <span
               className="
                  h-2
                  w-2
                  rounded-full
                  bg-[var(--color-primary)]
               "
            />

            <span
               className="
                  rotate-180
                  [writing-mode:vertical-rl]
                  text-[10px]
                  font-medium
                  uppercase
                  tracking-[0.16em]
                  text-[var(--color-text-secondary)]
               "
            >
               MK V
            </span>
         </div>
      </aside>
   );
}
