"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Brain, CheckCircle2, AlertTriangle, Sparkles, Trash2, RotateCcw, Plus, Send, FileText, ChevronDown, RotateCw, PenLine } from "lucide-react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { useWorkspace } from "@/components/WorkspaceContext";

import { buildStructuredHandoffBody, cleanProjectTitle as cleanSharedProjectTitle, createStableWorkflowId as createSharedStableWorkflowId, upsertProjectMemory, deleteProjectMemory } from "@/lib/allevinProjectMemory";

// ========================================
// Task Type
// ========================================

interface Task {
   id: string;
   title: string;
   description?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   source: "manual" | "canvas" | "research" | "project" | "system";
   priority: "low" | "medium" | "high";
   completed: boolean;
   createdAt: number;
   completedAt?: number;
}

// ========================================
// External Task Payload
// ========================================

interface TaskImportPayload {
   title: string;
   description?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   priority?: "low" | "medium" | "high";
   source: "canvas" | "research" | "project" | "system";
}

// ========================================
// Board Export Payload
// ========================================

interface BoardExportPayload {
   title: string;
   description?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   priority?: "low" | "medium" | "high";
   lane?: "backlog" | "active" | "review" | "complete";
   source: "task";
}

// ========================================
// Canvas Export Payload
// ========================================

interface CanvasExportPayload {
   title: string;
   body: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   source: "task";
}

// ========================================
// Storage
// ========================================

const STORAGE_KEY = "allevin-adaptive-tasks";

const WORKFLOW_TIMELINE_STORAGE_KEY = "allevin-global-workflow-timeline";

const THREAD_MEMORY_STORAGE_KEY = "allevin-project-memory-v2";

const DELETED_THREADS_STORAGE_KEY = "allevin-thread-recovery-deleted";

const DELETED_THREAD_KEYS_STORAGE_KEY = "allevin-thread-recovery-deleted-keys";

// ========================================
// Text Helpers
// ========================================

function cleanText(value?: string) {
   return (value || "").replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
   return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripRepeatedProjectPrefixes(value?: string) {
   let cleanValue = compactText(value);

   if (!cleanValue) return "";

   const prefixes = [
      "continue active project",
      "continue active workflow",
      "continue most active workflow",
      "continue most active",
      "active project",
      "active workflow",
      "resume",
      "resume project",
      "create a task from",
      "task from",
      "task",
      "project",
      "canvas title",
      "source title",
      "title",
      "follow up",
      "follow-up",
      "follow-up task",
   ];

   let changed = true;

   while (changed) {
      changed = false;

      for (const prefix of prefixes) {
         const pattern = new RegExp(`^${escapeRegex(prefix)}\\s*:?\\s*`, "i");

         const nextValue = cleanValue.replace(pattern, "").trim();

         if (nextValue !== cleanValue) {
            cleanValue = nextValue;
            changed = true;
         }
      }
   }

   return cleanValue.replace(/\s+/g, " ").trim();
}

function cleanProjectTitle(value?: string) {
   const cleaned = stripRepeatedProjectPrefixes(value);

   if (!cleaned) return "";

   const weakTitles = [
      "task created",
      "task sent to board",
      "task routed to board",
      "task generated from canvas",
      "canvas task created",
      "project work item",
      "untitled task",
      "untitled project",
      "workflow review",
      "workflow signal",
      "content sent to canvas",
      "active project prepared for canvas",
   ];

   const lower = cleaned.toLowerCase();

   if (weakTitles.some((title) => lower === title || lower.includes(title))) {
      return "";
   }

   return cleaned;
}

function normalizeProjectKey(value?: string) {
   return cleanProjectTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function normalizeCalmKey(value?: string) {
   return normalizeProjectKey(value).replace(/\s+/g, "-");
}

function readStringArrayStorage(key: string) {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [] as string[];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(key);

      return [] as string[];
   }
}

function saveStringArrayStorage(key: string, values: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean)))));
}

function taskMatchesDeletedTarget({
   valueWorkflowId,
   valueOriginBoardItemId,
   valueTitle,
   targetWorkflowId,
   targetOriginBoardItemId,
   targetTitleKey,
}: {
   valueWorkflowId?: string;

   valueOriginBoardItemId?: string;

   valueTitle?: string;

   targetWorkflowId?: string;

   targetOriginBoardItemId?: string;

   targetTitleKey?: string;
}) {
   const valueTitleKey = normalizeCalmKey(valueTitle);

   return Boolean(
      (targetWorkflowId && valueWorkflowId === targetWorkflowId) ||
      (targetOriginBoardItemId && valueOriginBoardItemId === targetOriginBoardItemId) ||
      (targetWorkflowId && valueOriginBoardItemId === targetWorkflowId) ||
      (targetOriginBoardItemId && valueWorkflowId === targetOriginBoardItemId) ||
      (targetTitleKey && valueTitleKey && valueTitleKey === targetTitleKey),
   );
}

function removeTaskFromWorkflowTimeline(targetTask: Task) {
   if (typeof window === "undefined") {
      return;
   }

   const targetWorkflowId = targetTask.workflowId || targetTask.id;

   const targetOriginBoardItemId = targetTask.originBoardItemId || targetTask.id;

   const targetTitleKey = normalizeCalmKey(targetTask.sourceTitle || targetTask.title);

   const stored = localStorage.getItem(WORKFLOW_TIMELINE_STORAGE_KEY);

   if (!stored) {
      return;
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return;
      }

      const cleanedTimeline = parsed.filter((event: any) => {
         const eventTitle = event?.sourceTitle || event?.title;

         return !taskMatchesDeletedTarget({
            valueWorkflowId: event?.workflowId,
            valueOriginBoardItemId: event?.originBoardItemId,
            valueTitle: eventTitle,
            targetWorkflowId,
            targetOriginBoardItemId,
            targetTitleKey,
         });
      });

      localStorage.setItem(WORKFLOW_TIMELINE_STORAGE_KEY, JSON.stringify(cleanedTimeline));
   } catch {
      localStorage.removeItem(WORKFLOW_TIMELINE_STORAGE_KEY);
   }
}

function removeTaskFromThreadMemory(targetTask: Task) {
   if (typeof window === "undefined") {
      return;
   }

   const targetWorkflowId = targetTask.workflowId || targetTask.id;

   const targetOriginBoardItemId = targetTask.originBoardItemId || targetTask.id;

   const targetTitleKey = normalizeCalmKey(targetTask.sourceTitle || targetTask.title);

   const stored = localStorage.getItem(THREAD_MEMORY_STORAGE_KEY);

   if (!stored) {
      return;
   }

   try {
      const parsed = JSON.parse(stored);

      if (!parsed || typeof parsed !== "object") {
         return;
      }

      function isTargetThread(thread: any) {
         return taskMatchesDeletedTarget({
            valueWorkflowId: thread?.workflowId,
            valueOriginBoardItemId: thread?.originBoardItemId,
            valueTitle: thread?.sourceTitle || thread?.title,
            targetWorkflowId,
            targetOriginBoardItemId,
            targetTitleKey,
         });
      }

      const nextMemory = {
         ...parsed,

         activeThread: isTargetThread(parsed.activeThread) ? null : parsed.activeThread,

         hasActiveThread: isTargetThread(parsed.activeThread) ? false : parsed.hasActiveThread,

         threads: Array.isArray(parsed.threads) ? parsed.threads.filter((thread: any) => !isTargetThread(thread)) : [],
      };

      localStorage.setItem(THREAD_MEMORY_STORAGE_KEY, JSON.stringify(nextMemory));
   } catch {
      localStorage.removeItem(THREAD_MEMORY_STORAGE_KEY);
   }
}

function markTaskAsDeletedForCalm(targetTask: Task) {
   if (typeof window === "undefined") {
      return;
   }

   const targetWorkflowId = targetTask.workflowId || targetTask.id;

   const targetOriginBoardItemId = targetTask.originBoardItemId || targetTask.id;

   const targetTitleKey = normalizeCalmKey(targetTask.sourceTitle || targetTask.title);

   saveStringArrayStorage(DELETED_THREADS_STORAGE_KEY, [...readStringArrayStorage(DELETED_THREADS_STORAGE_KEY), targetWorkflowId, targetOriginBoardItemId]);

   saveStringArrayStorage(DELETED_THREAD_KEYS_STORAGE_KEY, [
      ...readStringArrayStorage(DELETED_THREAD_KEYS_STORAGE_KEY),
      targetWorkflowId ? `workflow:${targetWorkflowId}` : "",
      targetOriginBoardItemId ? `origin:${targetOriginBoardItemId}` : "",
      targetTitleKey ? `title:${targetTitleKey}` : "",
   ]);

   removeTaskFromWorkflowTimeline(targetTask);

   removeTaskFromThreadMemory(targetTask);

   window.dispatchEvent(
      new CustomEvent("allevin-task-deleted-from-memory", {
         detail: {
            workflowId: targetWorkflowId,

            originBoardItemId: targetOriginBoardItemId,

            title: targetTask.sourceTitle || targetTask.title,
         },
      }),
   );

   window.dispatchEvent(new Event("allevin-project-memory-update"));

   window.dispatchEvent(new Event("allevin-memory-update"));
}

function dedupeTasksByProject(items: Task[]) {
   const seen = new Set<string>();

   return items.filter((item) => {
      const key = item.workflowId || item.originBoardItemId || normalizeProjectKey(item.sourceTitle || item.title);

      if (!key) return true;

      if (seen.has(key)) return false;

      seen.add(key);

      return true;
   });
}

function findExistingTask(items: Task[], incoming: { workflowId?: string; originBoardItemId?: string; title?: string; sourceTitle?: string }) {
   if (incoming.workflowId) {
      const matchByWorkflow = items.find((item) => item.workflowId === incoming.workflowId);

      if (matchByWorkflow) return matchByWorkflow;
   }

   if (incoming.originBoardItemId) {
      const matchByBoard = items.find((item) => item.originBoardItemId === incoming.originBoardItemId);

      if (matchByBoard) return matchByBoard;
   }

   const incomingTitleKey = normalizeProjectKey(incoming.sourceTitle || incoming.title);

   if (incomingTitleKey) {
      const matchByTitle = items.find((item) => normalizeProjectKey(item.sourceTitle || item.title) === incomingTitleKey);

      if (matchByTitle) return matchByTitle;
   }

   return null;
}

function getLines(value?: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
}

function isStructuralLine(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   const structuralLines = [
      "title:",
      "body:",
      "content:",
      "description:",
      "primary content:",
      "current working view:",
      "working summary:",
      "source title:",
      "source content:",
      "original source content:",
      "canvas title:",
      "canvas context:",
      "focus:",
      "useful context:",
      "next step:",
      "lane:",
      "priority:",
      "movement:",
      "context:",
      "detected:",
      "latest signal:",
      "latest context:",
      "recommended move:",
      "project guidance:",
      "active project guidance:",
      "next decision:",
      "workflow metadata:",
      "source:",
      "current board status:",
   ];

   return structuralLines.includes(lower);
}

function isBadContentCandidate(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   return isStructuralLine(lower) || lower === "title:" || lower === "title" || lower === "description:" || lower === "primary content:" || lower === "workflow metadata:";
}

function getValueAfterLabel(text: string, label: string) {
   const lines = getLines(text);
   const normalizedLabel = label.toLowerCase();

   for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const lower = line.toLowerCase();

      if (lower === normalizedLabel || lower === `${normalizedLabel}:`) {
         for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex++) {
            const possibleValue = lines[nextIndex];

            if (possibleValue && !isStructuralLine(possibleValue)) {
               return possibleValue;
            }
         }

         return "";
      }

      if (lower.startsWith(`${normalizedLabel}:`)) {
         const inlineValue = line.slice(label.length + 1).trim();

         if (inlineValue && !isStructuralLine(inlineValue)) {
            return inlineValue;
         }
      }
   }

   return "";
}

function getSectionAfterLabel(text: string, label: string) {
   const lines = getLines(text);
   const normalizedLabel = label.toLowerCase();
   const sectionLines: string[] = [];
   let collecting = false;

   for (const line of lines) {
      const lower = line.toLowerCase();

      if (lower === normalizedLabel || lower === `${normalizedLabel}:`) {
         collecting = true;
         continue;
      }

      if (lower.startsWith(`${normalizedLabel}:`)) {
         const inlineValue = line.slice(label.length + 1).trim();

         if (inlineValue) {
            sectionLines.push(inlineValue);
         }

         collecting = true;
         continue;
      }

      if (collecting) {
         const isNextTopLevelSection =
            lower === "title:" ||
            lower === "primary content:" ||
            lower === "current working view:" ||
            lower === "working summary:" ||
            lower === "workflow metadata:" ||
            lower === "source title:" ||
            lower === "source content:" ||
            lower === "original source content:" ||
            lower === "canvas title:" ||
            lower === "canvas context:" ||
            lower === "lane:" ||
            lower === "priority:" ||
            lower === "next step:" ||
            lower === "useful context:" ||
            lower === "source:" ||
            lower === "current board status:";

         if (isNextTopLevelSection) {
            break;
         }

         sectionLines.push(line);
      }
   }

   return sectionLines.join("\n").trim();
}

function extractPrimaryContentBlock(value?: string) {
   const text = cleanText(value);

   if (!text) return "";

   const match = text.match(/(?:^|\n)\s*primary content:\s*\n?([\s\S]*?)(?=\n\s*(?:title|lane|priority|next step|useful context|current board status|working summary|current working view|source|history|workflow metadata):|$)/i);

   if (match?.[1]) {
      const extracted = cleanText(match[1]);

      if (extracted && !isBadContentCandidate(extracted)) {
         return extracted;
      }
   }

   return "";
}

function extractFocusBlock(value?: string) {
   const text = cleanText(value);

   if (!text) return "";

   const match = text.match(/(?:^|\n)\s*focus:\s*\n?([\s\S]*?)(?=\n\s*(?:useful context|next step|lane|priority|current board status|working summary|source):|$)/i);

   if (match?.[1]) {
      const extracted = cleanText(match[1]);

      if (extracted && !isBadContentCandidate(extracted)) {
         return extracted;
      }
   }

   return "";
}

function extractPrimaryContent(value?: string) {
   const text = cleanText(value);

   if (!text) return "";

   const primaryBlock = extractPrimaryContentBlock(text);

   if (primaryBlock) {
      return primaryBlock;
   }

   const focusBlock = extractFocusBlock(text);

   if (focusBlock) {
      const nestedPrimary = extractPrimaryContentBlock(focusBlock);

      if (nestedPrimary) {
         return nestedPrimary;
      }

      return focusBlock;
   }

   const primaryContent = getSectionAfterLabel(text, "Primary Content");

   if (primaryContent && !isBadContentCandidate(primaryContent)) {
      return primaryContent;
   }

   const canvasContext = getSectionAfterLabel(text, "Canvas Context");

   if (canvasContext && !isBadContentCandidate(canvasContext)) {
      return canvasContext;
   }

   const sourceContent = getSectionAfterLabel(text, "From Content");

   if (sourceContent && !isBadContentCandidate(sourceContent)) {
      return sourceContent;
   }

   const originalFromContent = getSectionAfterLabel(text, "Original From Content");

   if (originalFromContent && !isBadContentCandidate(originalFromContent)) {
      return originalFromContent;
   }

   return "";
}

function extractCleanTaskContent(value?: string) {
   const text = cleanText(value);

   if (!text) return "";

   const primaryContent = extractPrimaryContent(text);

   if (primaryContent && !isBadContentCandidate(primaryContent)) {
      return primaryContent;
   }

   const lines = getLines(text);
   const cleanedLines: string[] = [];
   let skipNextLine = false;

   for (const line of lines) {
      const lower = line.toLowerCase();

      if (
         lower === "title:" ||
         lower === "primary content:" ||
         lower === "focus:" ||
         lower === "lane:" ||
         lower === "priority:" ||
         lower === "next step:" ||
         lower === "useful context:" ||
         lower === "current board status:" ||
         lower === "working summary:" ||
         lower === "current working view:" ||
         lower === "workflow metadata:" ||
         lower === "source:"
      ) {
         skipNextLine = lower === "title:" || lower === "lane:" || lower === "priority:" || lower === "source:" || lower === "current board status:";
         continue;
      }

      if (
         lower.startsWith("title:") ||
         lower.startsWith("primary content:") ||
         lower.startsWith("focus:") ||
         lower.startsWith("lane:") ||
         lower.startsWith("priority:") ||
         lower.startsWith("next step:") ||
         lower.startsWith("useful context:") ||
         lower.startsWith("current board status:") ||
         lower.startsWith("working summary:") ||
         lower.startsWith("current working view:") ||
         lower.startsWith("workflow metadata:") ||
         lower.startsWith("source:")
      ) {
         continue;
      }

      if (skipNextLine) {
         skipNextLine = false;
         continue;
      }

      if (!isStructuralLine(line)) {
         cleanedLines.push(line);
      }
   }

   return cleanedLines.join("\n").trim();
}

function extractFromTitle({ title, description, sourceTitle }: { title: string; description?: string; sourceTitle?: string }) {
   const explicitFromTitle = cleanProjectTitle(sourceTitle);

   if (explicitFromTitle) {
      return explicitFromTitle;
   }

   const descriptionTitle = cleanProjectTitle(getValueAfterLabel(description || "", "Title") || getValueAfterLabel(description || "", "Canvas Title") || getValueAfterLabel(description || "", "From Title"));

   if (descriptionTitle) {
      return descriptionTitle;
   }

   return cleanProjectTitle(title) || title.trim();
}

function extractFromContent({ description, sourceContent }: { description?: string; sourceContent?: string }) {
   const explicitFromContent = extractCleanTaskContent(sourceContent);

   if (explicitFromContent && !isBadContentCandidate(explicitFromContent)) {
      return explicitFromContent;
   }

   const primaryContent = extractCleanTaskContent(description);

   if (primaryContent && !isBadContentCandidate(primaryContent)) {
      return primaryContent;
   }

   return "";
}

function cleanDescriptionForBoard({ description, sourceContent }: { description?: string; sourceContent?: string }) {
   const cleanFrom = extractFromContent({
      description,
      sourceContent,
   });

   if (cleanFrom && !isBadContentCandidate(cleanFrom)) {
      return cleanFrom;
   }

   const fallback = extractCleanTaskContent(description);

   if (fallback && !isBadContentCandidate(fallback)) {
      return fallback;
   }

   return cleanText(description)
      .replace(/^Canvas Title:\s*[\s\S]*?\n\n/im, "")
      .replace(/^Canvas Context:\s*/i, "")
      .replace(/\n\nWorkflow Metadata:[\s\S]*$/i, "")
      .replace(/^Workflow Metadata:[\s\S]*$/i, "")
      .trim();
}

function removeRepeatedProjectTitlePrefixFromTaskContent(content?: string, title?: string) {
   let cleanContent = cleanText(content);
   const cleanTitle = cleanProjectTitle(title);

   if (!cleanContent || !cleanTitle) {
      return cleanContent;
   }

   let changed = true;

   while (changed) {
      changed = false;

      const normalizedContent = cleanContent.toLowerCase();
      const normalizedPrefix = `${cleanTitle}:`.toLowerCase();

      if (normalizedContent.startsWith(normalizedPrefix)) {
         cleanContent = cleanContent.slice(cleanTitle.length + 1).trim();
         changed = true;
      }
   }

   return cleanContent;
}

function chooseLongestUsefulTaskContent(...values: Array<string | undefined>) {
   const candidates = values
      .map((value) => cleanText(value))
      .filter(Boolean)
      .map((value) => extractCleanTaskContent(value) || value)
      .filter((value) => value && !isBadContentCandidate(value));

   if (!candidates.length) {
      return "";
   }

   return candidates.sort((a, b) => b.length - a.length)[0];
}

function getTaskLiveContent(task: Task) {
   const cleanTitle = cleanProjectTitle(task.sourceTitle || task.title) || task.title;

   const liveDescription = cleanText(task.description);
   const liveFromContent = cleanText(task.sourceContent);
   const liveWorkingSummary = cleanText(task.workingSummary);

   const bestContent = chooseLongestUsefulTaskContent(liveFromContent, liveDescription, liveWorkingSummary) || liveFromContent || liveDescription || liveWorkingSummary || cleanTitle;

   return removeRepeatedProjectTitlePrefixFromTaskContent(bestContent, cleanTitle);
}

function getTaskSourceLabel(source: Task["source"]) {
   switch (source) {
      case "canvas":
         return "Canvas";

      case "research":
         return "Research";

      case "project":
         return "Projects";

      case "system":
         return "Projects";

      default:
         return "Manual";
   }
}

function buildTaskCanvasBody({ title, sourceContent, priority, sourceLabel }: { title: string; sourceContent: string; priority: Task["priority"]; sourceLabel: string }) {
   const cleanTitle = cleanProjectTitle(title) || title || "Task Work Item";

   const focusContent = removeRepeatedProjectTitlePrefixFromTaskContent(sourceContent, cleanTitle) || cleanTitle;

   const generatedContext = buildStructuredHandoffBody({
      title: cleanTitle,
      sourceTitle: cleanTitle,
      sourceContent: focusContent,
      body: focusContent,
      workingSummary: focusContent,
      source: "task",
      destination: "canvas",
      stage: "drafting",
      status: "active",
      priority,
      latestMovement: "Tasks → Canvas",
      recommendedNextAction: "Continue developing this work in Canvas. When it is ready, send it back to Tasks, move it to the Board, or save it to Projects.",
   });

   const generatedNextStep = generatedContext.split("Next Step:").pop()?.trim() || "Continue developing this work in Canvas. When it is ready, send it back to Tasks, move it forward on the Board, or prepare an export.";

   const usefulContext = [
      `Project: ${cleanTitle}`,
      `Current stage: Drafting`,
      `Current location: Canvas`,
      `Priority: ${priority}`,
      `From: ${sourceLabel}`,
      `Latest movement: Tasks → Canvas`,
      `Task context: This work came from Tasks and is now being developed in Canvas.`,
      `Recent update: ALLEVIN is treating the latest task content as the current project version.`,
      `Context confidence: ${focusContent.length > 80 ? "90%" : "80%"}`,
   ].join("\n");

   return [`Focus:\n${focusContent}`, `Useful Context:\n${usefulContext}`, `Next Step:\n${generatedNextStep}`].join("\n\n");
}

function buildTaskBoardDescription(task: Task) {
   const cleanTitle = cleanProjectTitle(task.sourceTitle || task.title) || task.title;

   const focusContent = getTaskLiveContent(task);

   const usefulContext = [
      `Project: ${cleanTitle}`,
      `Current stage: Tracking`,
      `Current location: Board`,
      `Priority: ${task.priority}`,
      `From: ${getTaskSourceLabel(task.source)}`,
      `Latest movement: Tasks → Board`,
      `Task context: This next action is moving to the Board so progress can be tracked.`,
      `Recent update: ALLEVIN is treating the latest task content as the current project version.`,
      `Context confidence: ${focusContent.length > 80 ? "90%" : "80%"}`,
   ].join("\n");

   const nextStep = "Track this work on the Board, move it forward by status, or send it back to Canvas if it needs more development.";

   return [`Focus:\n${focusContent}`, `Useful Context:\n${usefulContext}`, `Next Step:\n${nextStep}`].join("\n\n");
}

// ========================================
// Component
// ========================================

export default function AdaptiveTaskSystem() {
   const workspace = useWorkspace();

   const { focusMode } = useFocus();

   const { currentEnvironment } = useEnvironment();

   const [mounted, setMounted] = useState(false);

   const [input, setInput] = useState("");

   const [tasks, setTasks] = useState<Task[]>([]);

   const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

   const [notice, setNotice] = useState("");

   const [systemDetailsOpen, setSystemDetailsOpen] = useState(false);

   function syncTaskStatus(status: "focused-work-active" | "workspace-stable" = "focused-work-active") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   // ========================================
   // Mount
   // ========================================

   useEffect(() => {
      setMounted(true);

      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
         try {
            const parsedTasks = JSON.parse(saved) as Partial<Task>[];

            const migratedTasks: Task[] = parsedTasks.map((task) => {
               const title = cleanProjectTitle(task.sourceTitle || task.title) || cleanProjectTitle(task.title) || "Untitled task";

               const description = task.description ?? "";

               const sourceContent = extractCleanTaskContent(task.sourceContent) || extractCleanTaskContent(description) || "";

               return {
                  id: task.id ?? crypto.randomUUID(),

                  title,

                  description,

                  sourceTitle:
                     task.sourceTitle ??
                     extractFromTitle({
                        title,
                        description,
                     }),

                  sourceContent,

                  workingSummary: extractCleanTaskContent(task.workingSummary) || sourceContent || description,

                  workflowId: task.workflowId ?? task.originBoardItemId ?? task.id,

                  originBoardItemId: task.originBoardItemId,

                  source: task.source ?? "manual",

                  priority: task.priority ?? "medium",

                  completed: task.completed ?? false,

                  createdAt: task.createdAt ?? Date.now(),

                  completedAt: task.completedAt,
               };
            });

            setTasks(migratedTasks);

            syncTaskStatus(migratedTasks.length > 0 ? "focused-work-active" : "workspace-stable");
         } catch {
            localStorage.removeItem(STORAGE_KEY);

            setTasks([]);

            syncTaskStatus("workspace-stable");
         }
      } else {
         syncTaskStatus("workspace-stable");
      }
   }, []);

   // ========================================
   // Persist
   // ========================================

   useEffect(() => {
      if (!mounted) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
   }, [tasks, mounted]);

   // ========================================
   // Notices
   // ========================================

   function showNotice(message: string) {
      setNotice(message);

      setTimeout(() => {
         setNotice("");
      }, 1200);
   }

   // ========================================
   // Workflow Intel Logger
   // ========================================

   function logWorkflowEvent({ title, summary, workflowId, originBoardItemId }: { title: string; summary: string; workflowId?: string; originBoardItemId?: string }) {
      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-log-workflow-event", {
               detail: {
                  id: crypto.randomUUID(),
                  type: "insight",
                  source: "system",
                  destination: "system",
                  title,
                  summary,
                  workflowId,
                  originBoardItemId,
                  createdAt: Date.now(),
               },
            }),
         );
      }, 0);
   }

   // ========================================
   // MK IIII Project Memory
   // ========================================

   function recordProjectMemory({
      title,
      body,
      sourceTitle,
      sourceContent,
      workingSummary,
      workflowId,
      originBoardItemId,
      source,
      destination,
      priority,
      recommendedNextAction,
      latestMovement,
   }: {
      title: string;
      body?: string;
      sourceTitle?: string;
      sourceContent?: string;
      workingSummary?: string;
      workflowId?: string;
      originBoardItemId?: string;
      source?: "manual" | "canvas" | "research" | "project" | "system" | "task";
      destination?: "canvas" | "task" | "board" | "system";
      priority?: "low" | "medium" | "high";
      recommendedNextAction?: string;
      latestMovement?: string;
   }) {
      const cleanTitle = cleanProjectTitle(sourceTitle || title) || cleanSharedProjectTitle(sourceTitle || title) || title;

      const stableWorkflowId = createSharedStableWorkflowId(cleanTitle, workflowId || originBoardItemId);

      const cleanFromContent = extractCleanTaskContent(sourceContent) || extractCleanTaskContent(body) || cleanText(sourceContent || body) || cleanTitle;

      upsertProjectMemory({
         title: cleanTitle,
         body: cleanFromContent,
         sourceTitle: cleanTitle,
         sourceContent: cleanFromContent,
         workingSummary: extractCleanTaskContent(workingSummary) || cleanFromContent,
         workflowId: stableWorkflowId,
         originBoardItemId: originBoardItemId || stableWorkflowId,
         source: source === "project" ? "notes" : source === "task" ? "task" : source || "task",
         destination: destination || "task",
         stage: destination === "board" ? "tracking" : destination === "canvas" ? "drafting" : "tasking",
         status: destination === "system" ? "ready" : "active",
         priority: priority || "medium",
         recommendedNextAction,
         latestMovement: latestMovement || `${source || "task"} → ${destination || "task"}`,
      });

      return stableWorkflowId;
   }

   // ========================================
   // Priority Inference
   // ========================================

   function inferPriority(text: string): Task["priority"] {
      const lower = text.toLowerCase();

      if (lower.includes("low priority") || lower.includes("later") || lower.includes("someday") || lower.includes("eventually")) {
         return "low";
      }

      if (lower.includes("urgent") || lower.includes("critical") || lower.includes("important") || lower.includes("high priority") || lower.includes("asap") || lower.includes("fix")) {
         return "high";
      }

      return "medium";
   }

   // ========================================
   // Create Task
   // ========================================

   function createTask({
      title,
      description = "",
      sourceTitle,
      sourceContent,
      workingSummary,
      workflowId,
      originBoardItemId,
      priority,
      source = "manual",
   }: {
      title: string;
      description?: string;
      sourceTitle?: string;
      sourceContent?: string;
      workingSummary?: string;
      workflowId?: string;
      originBoardItemId?: string;
      priority?: Task["priority"];
      source?: Task["source"];
   }) {
      if (!title.trim()) return;

      const cleanTitle = cleanProjectTitle(title) || title.trim();

      const cleanDescription = cleanText(description);

      const preservedFromTitle =
         extractFromTitle({
            title: cleanTitle,
            description: cleanDescription,
            sourceTitle,
         }) || cleanTitle;

      const preservedFromContent =
         chooseLongestUsefulTaskContent(sourceContent, cleanDescription, workingSummary) ||
         extractFromContent({
            description: cleanDescription,
            sourceContent,
         }) ||
         extractCleanTaskContent(cleanDescription) ||
         cleanText(sourceContent) ||
         cleanTitle;

      const preservedWorkingSummary = chooseLongestUsefulTaskContent(workingSummary, preservedFromContent, cleanDescription) || preservedFromContent || cleanDescription;

      const incomingPriority = priority ?? inferPriority(`${cleanTitle} ${cleanDescription} ${preservedFromContent}`);

      const now = Date.now();

      let didUpdateExisting = false;

      let finalWorkflowId = workflowId;

      setTasks((prev) => {
         const existingTask = findExistingTask(prev, {
            workflowId,
            originBoardItemId,
            title: cleanTitle,
            sourceTitle: preservedFromTitle,
         });

         if (existingTask) {
            didUpdateExisting = true;

            finalWorkflowId = workflowId || existingTask.workflowId || existingTask.id;

            const updatedTask: Task = {
               ...existingTask,

               title: preservedFromTitle || cleanTitle,

               description: cleanDescription || preservedFromContent || existingTask.description,

               sourceTitle: preservedFromTitle || existingTask.sourceTitle || cleanTitle,

               sourceContent: preservedFromContent || existingTask.sourceContent || cleanDescription,

               workingSummary: preservedWorkingSummary || existingTask.workingSummary || preservedFromContent,

               workflowId: finalWorkflowId,

               originBoardItemId: originBoardItemId || existingTask.originBoardItemId,

               source,

               priority: incomingPriority,

               completed: false,

               completedAt: undefined,

               createdAt: existingTask.createdAt,
            };

            return dedupeTasksByProject([updatedTask, ...prev.filter((task) => task.id !== existingTask.id)]);
         }

         const id = crypto.randomUUID();

         finalWorkflowId = workflowId || originBoardItemId || id;

         const newTask: Task = {
            id,

            title: preservedFromTitle || cleanTitle,

            description: cleanDescription,

            sourceTitle: preservedFromTitle,

            sourceContent: preservedFromContent,

            workingSummary: preservedWorkingSummary,

            workflowId: finalWorkflowId,

            originBoardItemId,

            source,

            priority: incomingPriority,

            completed: false,

            createdAt: now,
         };

         return dedupeTasksByProject([newTask, ...prev]);
      });

      syncTaskStatus("focused-work-active");

      window.setTimeout(() => {
         recordProjectMemory({
            title: preservedFromTitle || cleanTitle,
            body: cleanDescription || preservedFromContent,
            sourceTitle: preservedFromTitle || cleanTitle,
            sourceContent: preservedFromContent,
            workingSummary: preservedWorkingSummary,
            workflowId: finalWorkflowId,
            originBoardItemId,
            source,
            destination: "task",
            priority: incomingPriority,
            recommendedNextAction: "Check this next action and send it to the Board when it is ready to track.",
            latestMovement: didUpdateExisting ? "task updated" : "task created",
         });

         logWorkflowEvent({
            title: preservedFromTitle || cleanTitle,

            summary: didUpdateExisting ? `Next action updated in ALLEVIN Tasks: ${preservedFromTitle || cleanTitle}` : `Next action added to ALLEVIN Tasks: ${preservedFromTitle || cleanTitle}`,

            workflowId: finalWorkflowId,

            originBoardItemId,
         });
      }, 0);
   }

   // ========================================
   // Add Task Manually
   // ========================================

   function addTask() {
      if (!input.trim()) return;

      createTask({
         title: input,
         sourceTitle: input,
         sourceContent: input,
         source: "manual",
      });

      setInput("");

      syncTaskStatus("focused-work-active");

      showNotice("Task added");
   }

   // ========================================
   // Pipeline Advancement Cleanup
   // Option 3:
   // Archive/remove the previous active Task stage after
   // an approved Task → Board movement.
   // This keeps Projects memory intact while
   // preventing Tasks from continuing to look like
   // the active source after the pipeline advances.
   // ========================================

   function isSameTaskWorkflowOrTitle({
      task,
      incomingWorkflowId,
      incomingOriginBoardItemId,
      incomingTitle,
   }: {
      task: Task;

      incomingWorkflowId?: string;

      incomingOriginBoardItemId?: string;

      incomingTitle?: string;
   }) {
      const taskTitleKey = normalizeProjectKey(task.sourceTitle || task.title);

      const incomingTitleKey = normalizeProjectKey(incomingTitle);

      if (incomingWorkflowId && task.workflowId && incomingWorkflowId === task.workflowId) {
         return true;
      }

      if (incomingOriginBoardItemId && task.originBoardItemId && incomingOriginBoardItemId === task.originBoardItemId) {
         return true;
      }

      return Boolean(taskTitleKey && incomingTitleKey && taskTitleKey === incomingTitleKey);
   }

   function archiveTaskAfterBoardApproval(payload: Partial<BoardExportPayload>) {
      let archivedTask: Task | null = null;

      setTasks((currentTasks) => {
         const matchingTask = currentTasks.find((task) =>
            isSameTaskWorkflowOrTitle({
               task,
               incomingWorkflowId: payload.workflowId,
               incomingOriginBoardItemId: payload.originBoardItemId,
               incomingTitle: payload.sourceTitle || payload.title,
            }),
         );

         if (!matchingTask) {
            return currentTasks;
         }

         archivedTask = matchingTask;

         return currentTasks.filter((task) => task.id !== matchingTask.id);
      });

      if (!archivedTask) {
         return;
      }

      const archivedTaskSnapshot = archivedTask as Task;

      setExpandedTaskIds((currentIds) => currentIds.filter((taskId) => taskId !== archivedTaskSnapshot.id));

      const cleanTitle = cleanProjectTitle(archivedTaskSnapshot.sourceTitle || archivedTaskSnapshot.title) || archivedTaskSnapshot.title;

      const liveTaskContent = getTaskLiveContent(archivedTaskSnapshot);

      const workflowId = payload.workflowId || archivedTaskSnapshot.workflowId || archivedTaskSnapshot.id;

      const originBoardItemId = payload.originBoardItemId || archivedTaskSnapshot.originBoardItemId || workflowId;

      recordProjectMemory({
         title: cleanTitle,
         body: liveTaskContent,
         sourceTitle: cleanTitle,
         sourceContent: liveTaskContent,
         workingSummary: archivedTaskSnapshot.workingSummary || liveTaskContent,
         workflowId,
         originBoardItemId,
         source: "task",
         destination: "board",
         priority: archivedTaskSnapshot.priority,
         recommendedNextAction: "Track this work on the Board, move it forward by status, or send it back to Canvas if it needs more writing.",
         latestMovement: "Tasks → Board",
      });

      logWorkflowEvent({
         title: "Task moved to Board",

         summary: `Tasks moved the task to Board: ${cleanTitle}`,

         workflowId,

         originBoardItemId,
      });

      syncTaskStatus("focused-work-active");

      showNotice("Moved to Board");
   }

   // ========================================
   // External Task Listener
   // ========================================

   useEffect(() => {
      function handleTaskImport(event: Event) {
         const customEvent = event as CustomEvent<TaskImportPayload>;

         if (!customEvent.detail?.title) {
            return;
         }

         createTask({
            title: customEvent.detail.title,
            description: customEvent.detail.description ?? "",
            sourceTitle: customEvent.detail.sourceTitle,
            sourceContent: customEvent.detail.sourceContent,
            workingSummary: customEvent.detail.workingSummary,
            workflowId: customEvent.detail.workflowId,
            originBoardItemId: customEvent.detail.originBoardItemId,
            priority: customEvent.detail.priority,
            source: customEvent.detail.source,
         });

         syncTaskStatus("focused-work-active");

         showNotice("Task imported");
      }

      function handleTaskMovedToBoard(event: Event) {
         const customEvent = event as CustomEvent<BoardExportPayload>;

         if (!customEvent.detail?.title) {
            return;
         }

         archiveTaskAfterBoardApproval(customEvent.detail);
      }

      window.addEventListener("allevin-send-to-task", handleTaskImport);

      window.addEventListener("allevin-send-to-board", handleTaskMovedToBoard);

      return () => {
         window.removeEventListener("allevin-send-to-task", handleTaskImport);

         window.removeEventListener("allevin-send-to-board", handleTaskMovedToBoard);
      };
   }, []);

   // ========================================
   // Toggle Complete
   // ========================================

   function toggleTask(id: string) {
      const targetTask = tasks.find((task) => task.id === id);

      if (!targetTask) return;

      const nextCompleted = !targetTask.completed;

      setTasks((prev) =>
         prev.map((task) =>
            task.id === id
               ? {
                    ...task,
                    completed: nextCompleted,
                    completedAt: nextCompleted ? Date.now() : undefined,
                 }
               : task,
         ),
      );

      syncTaskStatus("focused-work-active");

      showNotice(nextCompleted ? "Task completed" : "Task restored");

      logWorkflowEvent({
         title: nextCompleted ? "Task completed" : "Task restored",

         summary: nextCompleted ? `Next action marked complete: ${targetTask.title}` : `Next action restored to active queue: ${targetTask.title}`,

         workflowId: targetTask.workflowId,

         originBoardItemId: targetTask.originBoardItemId,
      });
   }

   // ========================================
   // Toggle Details
   // ========================================

   function toggleDetails(id: string) {
      setExpandedTaskIds((prev) => (prev.includes(id) ? prev.filter((taskId) => taskId !== id) : [...prev, id]));
   }

   // ========================================
   // Delete Task
   // ========================================

   function deleteTask(id: string) {
      const targetTask = tasks.find((task) => task.id === id);

      setTasks((prev) => prev.filter((task) => task.id !== id));

      setExpandedTaskIds((prev) => prev.filter((taskId) => taskId !== id));

      syncTaskStatus(tasks.length > 1 ? "focused-work-active" : "workspace-stable");

      showNotice("Task deleted");

      if (targetTask) {
         // Important:
         // Deleting a task should not create a new active memory signal.
         // Remove the project-memory reference instead of logging
         // "Task deleted" into the workflow timeline.
         markTaskAsDeletedForCalm(targetTask);

         deleteProjectMemory({
            workflowId: targetTask.workflowId || targetTask.id,

            originBoardItemId: targetTask.originBoardItemId || targetTask.id,

            title: targetTask.sourceTitle || targetTask.title,
         });
      }
   }

   // ========================================
   // Reset Tasks
   // ========================================

   function resetTasks() {
      localStorage.removeItem(STORAGE_KEY);

      setTasks([]);

      setExpandedTaskIds([]);

      syncTaskStatus("workspace-stable");

      showNotice("Tasks reset");
   }

   // ========================================
   // Send Task To Board
   // ========================================

   function sendTaskToBoard(task: Task) {
      const cleanTitle = cleanProjectTitle(task.sourceTitle || task.title) || task.title;

      const liveTaskContent =
         getTaskLiveContent(task) ||
         cleanDescriptionForBoard({
            description: task.description,
            sourceContent: task.sourceContent,
         }) ||
         `Sent from Tasks.\n\nFrom: ${task.source}`;

      const cleanWorkingSummary = extractCleanTaskContent(task.workingSummary) || liveTaskContent;

      const workflowId = task.workflowId || task.id;

      const payload: BoardExportPayload = {
         title: cleanTitle,

         // Keep Board import simple and reliable:
         // Board should receive the latest task content as the visible description.
         // Board → Canvas already adds the smarter context layer.
         description: liveTaskContent,

         sourceTitle: cleanTitle,

         sourceContent: liveTaskContent,

         workingSummary: cleanWorkingSummary,

         workflowId,

         originBoardItemId: task.originBoardItemId,

         priority: task.priority,

         lane: focusMode === "deep" ? "active" : "backlog",

         source: "task",
      };

      recordProjectMemory({
         title: payload.sourceTitle || payload.title,
         body: liveTaskContent,
         sourceTitle: payload.sourceTitle,
         sourceContent: liveTaskContent,
         workingSummary: cleanWorkingSummary,
         workflowId,
         originBoardItemId: payload.originBoardItemId,
         source: "task",
         destination: "board",
         priority: payload.priority,
         recommendedNextAction: "Track this work on the Board, move it forward by status, or send it back to Canvas if it needs more writing.",
         latestMovement: "Tasks → Board",
      });

      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-send-to-board", {
               detail: payload,
            }),
         );

         window.dispatchEvent(
            new CustomEvent("allevin-open-product-module", {
               detail: {
                  moduleId: "board",
               },
            }),
         );
      }, 0);

      setTasks((prev) => prev.filter((item) => item.id !== task.id));

      setExpandedTaskIds((prev) => prev.filter((taskId) => taskId !== task.id));

      syncTaskStatus("focused-work-active");

      showNotice("Sent to Board");

      logWorkflowEvent({
         title: "Task sent to Board",

         summary: `Next action moved from Tasks to Board: ${cleanTitle}`,

         workflowId,

         originBoardItemId: task.originBoardItemId,
      });
   }

   // ========================================
   // Send Task Back To Canvas
   // ========================================

   function sendTaskToCanvas(task: Task) {
      const cleanTitle = cleanProjectTitle(task.sourceTitle || task.title) || task.title;

      const sourceContent = getTaskLiveContent(task);

      const smarterCanvasBody = buildTaskCanvasBody({
         title: cleanTitle,
         sourceContent,
         priority: task.priority,
         sourceLabel: getFromLabel(task.source),
      });

      const payload: CanvasExportPayload = {
         title: cleanTitle,

         body: smarterCanvasBody,

         sourceTitle: cleanTitle,

         // Canvas still checks sourceContent during import, so send the smarter
         // handoff here too. This prevents the older Priority/From-only
         // handoff from taking over.
         sourceContent: smarterCanvasBody,

         workingSummary: sourceContent,

         workflowId: task.workflowId || task.id,

         originBoardItemId: task.originBoardItemId,

         source: "task",
      };

      recordProjectMemory({
         title: payload.sourceTitle || payload.title,
         body: sourceContent,
         sourceTitle: payload.sourceTitle,
         sourceContent,
         workingSummary: sourceContent,
         workflowId: payload.workflowId,
         originBoardItemId: payload.originBoardItemId,
         source: "task",
         destination: "canvas",
         priority: task.priority,
         recommendedNextAction: "Continue developing this work in Canvas. When it is ready, send it back to Tasks, move it to the Board, or save it to Projects.",
         latestMovement: "Tasks → Canvas",
      });

      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-send-to-canvas", {
               detail: payload,
            }),
         );
      }, 0);

      syncTaskStatus("focused-work-active");

      showNotice("Sent to Canvas");

      logWorkflowEvent({
         title: "Task sent to Canvas",

         summary: `Next action sent back to Canvas for further development: ${cleanTitle}`,

         workflowId: task.workflowId || task.id,

         originBoardItemId: task.originBoardItemId,
      });
   }

   // ========================================
   // Adaptive Queue
   // ========================================

   const adaptiveTasks = useMemo(() => {
      let sorted = [...tasks];

      sorted.sort((a, b) => {
         if (a.completed !== b.completed) {
            return Number(a.completed) - Number(b.completed);
         }

         const priorityRank = {
            high: 3,
            medium: 2,
            low: 1,
         };

         return priorityRank[b.priority] - priorityRank[a.priority];
      });

      if (currentEnvironment === "recovery") {
         sorted = sorted.filter((task) => task.priority !== "low" || task.completed);
      }

      if (focusMode === "deep") {
         const active = sorted.filter((task) => !task.completed).slice(0, 3);

         const completed = sorted.filter((task) => task.completed);

         sorted = [...active, ...completed];
      }

      return sorted;
   }, [tasks, focusMode, currentEnvironment]);

   // ========================================
   // Counts
   // ========================================

   const counts = useMemo(() => {
      const active = tasks.filter((task) => !task.completed).length;

      const completed = tasks.filter((task) => task.completed).length;

      const high = tasks.filter((task) => task.priority === "high" && !task.completed).length;

      return {
         active,
         completed,
         high,
      };
   }, [tasks]);

   // ========================================
   // Empty State Message
   // ========================================

   function getEmptyStateMessage() {
      if (currentEnvironment === "recovery") {
         return "No simple actions yet. Add one small next step.";
      }

      if (focusMode === "deep") {
         return "No focus actions yet. Add one clear action to anchor the session.";
      }

      return "No next actions yet. Add one manually or send one from Canvas.";
   }

   // ========================================
   // From Label
   // ========================================

   function getFromLabel(source: Task["source"]) {
      return getTaskSourceLabel(source);
   }

   // ========================================
   // Created Date Label
   // ========================================

   function getTimeLabel(timestamp?: number) {
      if (!timestamp) return "Not recorded";

      return new Date(timestamp).toLocaleString([], {
         month: "short",
         day: "numeric",
         hour: "numeric",
         minute: "2-digit",
      });
   }

   // ========================================
   // Hydration Protection
   // ========================================

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
         className="
            rounded-[32px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-6
            shadow-[var(--shadow-soft)]
         "
      >
         {/* Header */}

         <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
               <div
                  className="
                     flex
                     h-14
                     w-14
                     shrink-0
                     items-center
                     justify-center
                     rounded-2xl
                     bg-[var(--color-bg)]
                  "
               >
                  <Brain size={22} />
               </div>

               <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">Next actions</p>

                  <h2 className="mt-1 text-3xl">Tasks</h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Turn work into clear next actions. Keep the list simple, then send items to the Board when they are ready to track.</p>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               {notice && <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}

               <button
                  onClick={() => setSystemDetailsOpen((current) => !current)}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-4
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <ChevronDown
                     size={16}
                     className={`
                        transition-transform
                        duration-200

                        ${systemDetailsOpen ? "rotate-180" : ""}
                     `}
                  />
                  Options
               </button>

               <button
                  onClick={resetTasks}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-4
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <RotateCcw size={16} />
                  Reset
               </button>
            </div>
         </div>

         {/* Simple Status */}

         <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Active</p>

               <p className="mt-2 text-2xl font-semibold">{counts.active}</p>

               <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Actions ready to move forward.</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Completed</p>

               <p className="mt-2 text-2xl font-semibold">{counts.completed}</p>

               <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Completed actions.</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">View</p>

               <p className="mt-2 text-lg font-semibold">{focusMode === "deep" ? "Focus" : currentEnvironment === "recovery" ? "Balanced" : "Balanced"}</p>

               <p className="mt-1 text-sm text-[var(--color-text-secondary)]">ALLEVIN keeps this list simple.</p>
            </div>
         </div>

         {/* Add Task */}

         <div className="mb-5 rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
            <div className="mb-3">
               <p className="text-sm font-medium">Add a next action</p>

               <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Add one clear next step, or send work here from Canvas.</p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row">
               <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                     if (e.key === "Enter") {
                        addTask();
                     }
                  }}
                  placeholder="Example: Review the project draft"
                  className="
                     flex-1
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-bg)]
                     px-5
                     py-4
                     outline-none
                     placeholder:text-[var(--color-text-secondary)]
                     focus:border-[var(--color-primary)]
                  "
               />

               <button
                  onClick={addTask}
                  className="
                     flex
                     items-center
                     justify-center
                     gap-2
                     rounded-2xl
                     bg-[var(--color-primary)]
                     px-5
                     py-4
                     text-sm
                     font-medium
                     text-[var(--color-cream)]
                     transition-opacity
                     hover:opacity-90
                  "
               >
                  <Plus size={16} />
                  Add Task
               </button>
            </div>
         </div>

         {/* Collapsed System Details */}

         <AnimatePresence initial={false}>
            {systemDetailsOpen && (
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
                  className="mb-5 overflow-hidden"
               >
                  <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                     <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Total</p>

                           <p className="mt-2 text-xl font-medium">{tasks.length}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Active</p>

                           <p className="mt-2 text-xl font-medium">{counts.active}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Done</p>

                           <p className="mt-2 text-xl font-medium">{counts.completed}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">High</p>

                           <p className="mt-2 text-xl font-medium">{counts.high}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Visible</p>

                           <p className="mt-2 text-xl font-medium">{adaptiveTasks.length}</p>
                        </div>
                     </div>

                     <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-5">
                        <div className="flex items-start gap-3">
                           <Sparkles size={18} className="mt-1" />

                           <div>
                              <p className="font-medium">ALLEVIN Suggestion</p>

                              <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">
                                 {focusMode === "deep"
                                    ? "Focus mode is active. ALLEVIN is showing fewer items so you can stay with the highest-value actions."
                                    : currentEnvironment === "recovery"
                                      ? "Calm mode is active. ALLEVIN is keeping the list lighter and easier to act on."
                                      : "Balanced mode is active. ALLEVIN is showing active and completed work without changing your list."}
                              </p>
                           </div>
                        </div>
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>

         {/* Task Queue */}

         <div className="space-y-4">
            <AnimatePresence>
               {adaptiveTasks.map((task) => {
                  const isExpanded = expandedTaskIds.includes(task.id);

                  return (
                     <motion.div
                        key={task.id}
                        layout
                        initial={{
                           opacity: 0,
                           y: 10,
                        }}
                        animate={{
                           opacity: 1,
                           y: 0,
                        }}
                        exit={{
                           opacity: 0,
                           scale: 0.95,
                        }}
                        className={`
                           rounded-3xl
                           border
                           border-[var(--border-subtle)]
                           bg-white
                           p-5
                           transition-all

                           ${task.completed ? "opacity-60" : ""}
                        `}
                     >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                           <div className="flex min-w-0 items-start gap-4">
                              <button
                                 onClick={() => toggleTask(task.id)}
                                 className="
                                    rounded-2xl
                                    bg-[var(--color-bg)]
                                    p-3
                                    transition-opacity
                                    hover:opacity-80
                                 "
                                 aria-label={task.completed ? "Restore task" : "Complete task"}
                              >
                                 {task.completed ? <RotateCw size={18} /> : <CheckCircle2 size={18} />}
                              </button>

                              <div className="min-w-0">
                                 <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="rounded-xl bg-[var(--color-bg)] px-3 py-1 text-xs font-medium">{task.completed ? "Completed" : "Active"}</span>

                                    <span className="rounded-xl bg-[var(--color-bg)] px-3 py-1 text-xs font-medium capitalize">{task.priority}</span>

                                    <span className="rounded-xl bg-[var(--color-bg)] px-3 py-1 text-xs font-medium">{getFromLabel(task.source)}</span>
                                 </div>

                                 <p
                                    className={`
                                       text-xl
                                       font-medium

                                       ${task.completed ? "line-through text-[var(--color-text-secondary)]" : ""}
                                    `}
                                 >
                                    {task.title}
                                 </p>

                                 {task.sourceContent && <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{task.sourceContent}</p>}
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-2 xl:flex xl:items-center">
                              <button
                                 onClick={() => sendTaskToCanvas(task)}
                                 className="
                                    flex
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-2xl
                                    border
                                    border-[var(--border-subtle)]
                                    bg-white
                                    px-4
                                    py-3
                                    text-sm
                                    font-medium
                                    transition-colors
                                    hover:bg-[var(--color-bg)]
                                 "
                              >
                                 <PenLine size={16} />
                                 Canvas
                              </button>

                              <button
                                 onClick={() => sendTaskToBoard(task)}
                                 className="
                                    flex
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-2xl
                                    bg-[var(--color-primary)]
                                    px-4
                                    py-3
                                    text-sm
                                    font-medium
                                    text-[var(--color-cream)]
                                    transition-opacity
                                    hover:opacity-90
                                 "
                              >
                                 <Send size={16} />
                                 Board
                              </button>

                              <button
                                 onClick={() => toggleDetails(task.id)}
                                 className="
                                    flex
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-2xl
                                    border
                                    border-[var(--border-subtle)]
                                    bg-white
                                    px-4
                                    py-3
                                    text-sm
                                    font-medium
                                    transition-colors
                                    hover:bg-[var(--color-bg)]
                                 "
                              >
                                 <ChevronDown
                                    size={16}
                                    className={`
                                       transition-transform
                                       duration-200

                                       ${isExpanded ? "rotate-180" : ""}
                                    `}
                                 />
                                 Details
                              </button>

                              <button
                                 onClick={() => deleteTask(task.id)}
                                 className="
                                    flex
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-2xl
                                    border
                                    border-[var(--border-subtle)]
                                    bg-white
                                    px-4
                                    py-3
                                    text-sm
                                    font-medium
                                    transition-colors
                                    hover:bg-[var(--color-bg)]
                                 "
                              >
                                 <Trash2 size={16} />
                                 Delete
                              </button>
                           </div>
                        </div>

                        <AnimatePresence initial={false}>
                           {isExpanded && (
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
                                 <div className="mt-5 space-y-4">
                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                       <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                          <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Priority</p>

                                          <div className="mt-2 flex items-center gap-2 text-sm">
                                             <AlertTriangle size={14} />

                                             <span className="capitalize">{task.priority}</span>
                                          </div>
                                       </div>

                                       <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                          <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">From</p>

                                          <p className="mt-2 text-sm">{getFromLabel(task.source)}</p>
                                       </div>

                                       <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                          <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Created</p>

                                          <p className="mt-2 text-sm">{getTimeLabel(task.createdAt)}</p>
                                       </div>
                                    </div>

                                    {task.description && (
                                       <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-5">
                                          <div className="mb-3 flex items-center gap-2">
                                             <FileText size={16} />

                                             <p className="font-medium">Details</p>
                                          </div>

                                          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--color-text-secondary)]">{task.description}</pre>
                                       </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                       <button
                                          onClick={() => sendTaskToCanvas(task)}
                                          className="
                                             flex
                                             items-center
                                             justify-center
                                             gap-2
                                             rounded-2xl
                                             border
                                             border-[var(--border-subtle)]
                                             bg-white
                                             px-4
                                             py-4
                                             text-sm
                                             font-medium
                                             transition-colors
                                             hover:bg-[var(--color-bg)]
                                          "
                                       >
                                          <PenLine size={16} />
                                          Send to Canvas
                                       </button>

                                       <button
                                          onClick={() => sendTaskToBoard(task)}
                                          className="
                                             flex
                                             items-center
                                             justify-center
                                             gap-2
                                             rounded-2xl
                                             bg-[var(--color-primary)]
                                             px-4
                                             py-4
                                             text-sm
                                             font-medium
                                             text-[var(--color-cream)]
                                             transition-opacity
                                             hover:opacity-90
                                          "
                                       >
                                          <Send size={16} />
                                          Send to Board
                                       </button>

                                       <button
                                          onClick={() => toggleTask(task.id)}
                                          className="
                                             flex
                                             items-center
                                             justify-center
                                             gap-2
                                             rounded-2xl
                                             border
                                             border-[var(--border-subtle)]
                                             bg-white
                                             px-4
                                             py-4
                                             text-sm
                                             font-medium
                                             transition-colors
                                             hover:bg-[var(--color-bg)]
                                          "
                                       >
                                          {task.completed ? (
                                             <>
                                                <RotateCw size={16} />
                                                Restore
                                             </>
                                          ) : (
                                             <>
                                                <CheckCircle2 size={16} />
                                                Complete
                                             </>
                                          )}
                                       </button>
                                    </div>
                                 </div>
                              </motion.div>
                           )}
                        </AnimatePresence>
                     </motion.div>
                  );
               })}
            </AnimatePresence>

            {adaptiveTasks.length === 0 && (
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
                  className="
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-bg)]
                     p-5
                     text-sm
                     leading-relaxed
                     text-[var(--color-text-secondary)]
                  "
               >
                  {getEmptyStateMessage()}
               </motion.div>
            )}
         </div>
      </motion.section>
   );
}
