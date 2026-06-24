// ========================================
// Adaptive Board
// Purpose:
// Simple project tracker for ALLEVIN MK III
// with calmer cards, plain-language movement,
// simple movement, Canvas routing, Projects save,
// preserved canonical source content,
// and workspace status awareness.
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Columns3, Plus, Trash2, Save, RotateCcw, Brain, Sparkles, Eye, Send, Activity, ChevronDown, CheckCircle2, RotateCw, Clock3 } from "lucide-react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { useWorkspace } from "@/components/WorkspaceContext";

import { getBehavioralPrediction, getCognitiveProfile, getMemory } from "@/components/MemoryEngine";

import { createInternalNote } from "@/lib/notesIntegration";

import { upsertProjectMemory, deleteProjectMemory, buildStructuredHandoffBody } from "@/lib/allevinProjectMemory";

// ========================================
// Storage
// ========================================

const STORAGE_KEY = "allevin-adaptive-project-board";

// ========================================
// Types
// ========================================

type BoardLane = "backlog" | "active" | "check" | "complete";

type BoardMode = "balanced" | "planning" | "deep-focus" | "research" | "creative";

type ActivityType = "created" | "imported" | "updated" | "moved" | "priority" | "manual-edit" | "canvas" | "note" | "deleted";

type ActivitySource = "manual" | "task" | "canvas" | "research" | "system";

interface ProjectActivityEntry {
   id: string;
   type: ActivityType;
   source: ActivitySource;
   summary: string;
   previousDescription?: string;
   newDescription?: string;
   previousLane?: BoardLane;
   newLane?: BoardLane;
   previousPriority?: "low" | "medium" | "high";
   newPriority?: "low" | "medium" | "high";
   createdAt: number;
}

interface ProjectItem {
   id: string;
   workflowId: string;
   originBoardItemId?: string;
   title: string;
   description: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   lane: BoardLane;
   priority: "low" | "medium" | "high";
   history: ProjectActivityEntry[];
   createdAt: number;
   updatedAt: number;
}

interface ProjectBoardState {
   title: string;
   items: ProjectItem[];
   updatedAt: number;
}

interface BoardImportPayload {
   title: string;
   description?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   priority?: "low" | "medium" | "high";
   lane?: BoardLane;
   workflowId?: string;
   originBoardItemId?: string;
   source: "task" | "canvas" | "research" | "system";
}

interface CanvasExportPayload {
   title: string;
   body: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   cleanSourceContent?: string;
   workflowId: string;
   originBoardItemId: string;
   source: "project";
}

// ========================================
// Text Helpers
// ========================================

function cleanText(value?: string) {
   return (value || "").replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function cleanProjectTitle(value?: string) {
   let title = compactText(value);

   if (!title) {
      return "";
   }

   const removablePrefixes = [
      "continue active thread",
      "continue active workflow",
      "continue most active workflow",
      "continue most active",
      "active thread",
      "active workflow",
      "resume",
      "resume project",
      "project",
      "task",
      "follow up",
      "follow-up",
      "canvas",
      "title",
      "source title",
      "thread",
   ];

   let changed = true;

   while (changed) {
      changed = false;

      for (const prefix of removablePrefixes) {
         const regex = new RegExp(`^${prefix}\\s*:\\s*`, "i");

         if (regex.test(title)) {
            title = title.replace(regex, "").trim();

            changed = true;
         }
      }
   }

   return title.replace(/\s+/g, " ").trim();
}

function getStableWorkflowIdFromTitle(title?: string) {
   const cleanedTitle = cleanProjectTitle(title);

   if (!cleanedTitle) {
      return "";
   }

   return `title-${cleanedTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)}`;
}

function preferNewestUsefulText(nextValue?: string, previousValue?: string) {
   const nextClean = extractCleanProjectContent(nextValue);

   if (nextClean && !isBadContentCandidate(nextClean)) {
      return nextClean;
   }

   const previousClean = extractCleanProjectContent(previousValue);

   if (previousClean && !isBadContentCandidate(previousClean)) {
      return previousClean;
   }

   return cleanText(nextValue) || cleanText(previousValue);
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
      "thread guidance:",
      "active thread guidance:",
      "next decision:",
      "workflow metadata:",
      "current board status:",
      "history:",
      "source:",
   ];

   return structuralLines.includes(lower);
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
            lower === "canvas title:" ||
            lower === "canvas context:" ||
            lower === "lane:" ||
            lower === "priority:" ||
            lower === "next step:" ||
            lower === "useful context:" ||
            lower === "history:" ||
            lower === "current board status:" ||
            lower === "source:";

         if (isNextTopLevelSection) {
            break;
         }

         sectionLines.push(line);
      }
   }

   return sectionLines.join("\n").trim();
}

function isBadContentCandidate(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   return isStructuralLine(lower) || lower === "title:" || lower === "title" || lower === "description:" || lower === "primary content:" || lower === "workflow metadata:";
}

function extractPrimaryContentBlock(value?: string) {
   const text = cleanText(value);

   if (!text) return "";

   const match = text.match(/(?:^|\n)\s*primary content:\s*\n?([\s\S]*?)(?=\n\s*(?:title|lane|priority|next step|useful context|current board status|working summary|current working view|source|history):|$)/i);

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

   const match = text.match(/(?:^|\n)\s*focus:\s*\n?([\s\S]*?)(?=\n\s*(?:useful context|next step|lane|priority|current board status):|$)/i);

   if (match?.[1]) {
      const extracted = cleanText(match[1]);

      if (extracted && !isBadContentCandidate(extracted)) {
         return extracted;
      }
   }

   return "";
}

function extractPrimaryContent(description?: string) {
   const text = cleanText(description);

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

   const sourceContent = getSectionAfterLabel(text, "Source Content");

   if (sourceContent && !isBadContentCandidate(sourceContent)) {
      return sourceContent;
   }

   const originalSourceContent = getSectionAfterLabel(text, "Original Source Content");

   if (originalSourceContent && !isBadContentCandidate(originalSourceContent)) {
      return originalSourceContent;
   }

   const lines = getLines(text).filter((line) => {
      const lower = line.toLowerCase();

      return (
         !isStructuralLine(line) &&
         !lower.startsWith("title:") &&
         !lower.startsWith("primary content:") &&
         !lower.startsWith("current working view:") &&
         !lower.startsWith("working summary:") &&
         !lower.startsWith("workflow metadata:") &&
         !lower.startsWith("lane:") &&
         !lower.startsWith("priority:") &&
         !lower.startsWith("next step:") &&
         !lower.startsWith("useful context:") &&
         !lower.startsWith("current board status:")
      );
   });

   return lines.join("\n").trim();
}

function extractCleanProjectContent(value?: string) {
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

      if (lower === "title:" || lower === "primary content:" || lower === "lane:" || lower === "priority:" || lower === "next step:" || lower === "useful context:" || lower === "current board status:") {
         skipNextLine = lower === "title:" || lower === "lane:" || lower === "priority:" || lower === "next step:" || lower === "current board status:";
         continue;
      }

      if (
         lower.startsWith("title:") ||
         lower.startsWith("primary content:") ||
         lower.startsWith("lane:") ||
         lower.startsWith("priority:") ||
         lower.startsWith("next step:") ||
         lower.startsWith("useful context:") ||
         lower.startsWith("current board status:")
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

function extractSourceTitle({ title, description, sourceTitle }: { title: string; description?: string; sourceTitle?: string }) {
   const explicitSourceTitle = cleanProjectTitle(sourceTitle);

   if (explicitSourceTitle) return explicitSourceTitle;

   const descriptionTitle = cleanProjectTitle(getValueAfterLabel(description || "", "Title") || getValueAfterLabel(description || "", "Canvas Title") || getValueAfterLabel(description || "", "Source Title"));

   if (descriptionTitle) return descriptionTitle;

   return cleanProjectTitle(title);
}

function extractSourceContent({ description, sourceContent }: { description?: string; sourceContent?: string }) {
   const explicitSourceContent = extractCleanProjectContent(sourceContent);

   if (explicitSourceContent && !isBadContentCandidate(explicitSourceContent)) {
      return explicitSourceContent;
   }

   const primaryContent = extractCleanProjectContent(description);

   if (primaryContent && !isBadContentCandidate(primaryContent)) {
      return primaryContent;
   }

   return "";
}

function buildBoardDescription({ description, sourceContent }: { description?: string; sourceContent?: string }) {
   const cleanSource = extractSourceContent({
      description,
      sourceContent,
   });

   if (cleanSource) return cleanSource;

   return cleanText(description) || "Sent from Tasks.";
}

function removeRepeatedProjectTitlePrefixFromFocusContent(content?: string, title?: string) {
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

function chooseLongestUsefulProjectContent(...values: Array<string | undefined>) {
   const candidates = values
      .map((value) => cleanText(value))
      .filter(Boolean)
      .map((value) => extractCleanProjectContent(value) || value)
      .filter((value) => value && !isBadContentCandidate(value));

   if (!candidates.length) {
      return "";
   }

   return candidates.sort((a, b) => b.length - a.length)[0];
}

// ========================================
// Activity Helpers
// ========================================

function createActivityEntry({
   type,
   source,
   summary,
   previousDescription,
   newDescription,
   previousLane,
   newLane,
   previousPriority,
   newPriority,
}: {
   type: ActivityType;
   source: ActivitySource;
   summary: string;
   previousDescription?: string;
   newDescription?: string;
   previousLane?: BoardLane;
   newLane?: BoardLane;
   previousPriority?: "low" | "medium" | "high";
   newPriority?: "low" | "medium" | "high";
}): ProjectActivityEntry {
   return {
      id: crypto.randomUUID(),
      type,
      source,
      summary,
      previousDescription,
      newDescription,
      previousLane,
      newLane,
      previousPriority,
      newPriority,
      createdAt: Date.now(),
   };
}

// ========================================
// Initial State
// ========================================

function createProjectItem({
   title = "",
   description = "",
   sourceTitle,
   sourceContent,
   workingSummary,
   lane,
   priority,
   workflowId,
   originBoardItemId,
}: {
   title?: string;
   description?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   lane: BoardLane;
   priority: "low" | "medium" | "high";
   workflowId?: string;
   originBoardItemId?: string;
}): ProjectItem {
   const cleanedTitle = cleanProjectTitle(sourceTitle || title);
   const id = workflowId || getStableWorkflowIdFromTitle(cleanedTitle) || crypto.randomUUID();
   const now = Date.now();

   const preservedSourceTitle = cleanedTitle || "Untitled project item";
   const preservedSourceContent = extractCleanProjectContent(sourceContent) || extractCleanProjectContent(description) || description;

   return {
      id,
      workflowId: workflowId ?? id,
      originBoardItemId,
      title: preservedSourceTitle,
      description: preservedSourceContent,
      sourceTitle: preservedSourceTitle,
      sourceContent: preservedSourceContent,
      workingSummary: extractCleanProjectContent(workingSummary) || preservedSourceContent,
      lane,
      priority,
      history: [
         createActivityEntry({
            type: "created",
            source: "manual",
            summary: title ? "Project card created manually." : "Blank project card created.",
         }),
      ],
      createdAt: now,
      updatedAt: now,
   };
}

function getProjectContinuityKey(item: ProjectItem) {
   if (item.workflowId && !item.workflowId.startsWith("unthreaded-")) {
      return `workflow:${item.workflowId}`;
   }

   const titleKey = normalizeTitleForContinuity(item.sourceTitle || item.title);

   if (titleKey) {
      return `title:${titleKey}`;
   }

   return `item:${item.id}`;
}

function normalizeTitleForContinuity(title?: string) {
   return cleanProjectTitle(title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");
}

function mergeProjectItemsForContinuity(items: ProjectItem[]) {
   const map = new Map<string, ProjectItem>();

   items.forEach((item) => {
      const cleanedTitle = cleanProjectTitle(item.sourceTitle || item.title) || cleanProjectTitle(item.title) || "Untitled project item";

      const cleanedDescription = preferNewestUsefulText(item.description, item.sourceContent);

      const cleanedSourceContent = preferNewestUsefulText(item.sourceContent, cleanedDescription);

      const normalizedItem: ProjectItem = {
         ...item,
         title: cleanedTitle,
         sourceTitle: cleanedTitle,
         description: cleanedDescription || item.description,
         sourceContent: cleanedSourceContent || cleanedDescription || item.sourceContent,
         workingSummary: preferNewestUsefulText(item.workingSummary, cleanedSourceContent || cleanedDescription) || cleanedSourceContent || cleanedDescription,
         workflowId: item.workflowId || getStableWorkflowIdFromTitle(cleanedTitle) || item.id,
      };

      const key = getProjectContinuityKey(normalizedItem);

      const existing = map.get(key);

      if (!existing) {
         map.set(key, normalizedItem);

         return;
      }

      const newer = normalizedItem.updatedAt >= existing.updatedAt ? normalizedItem : existing;

      const older = normalizedItem.updatedAt >= existing.updatedAt ? existing : normalizedItem;

      const mergedContent = preferNewestUsefulText(newer.sourceContent || newer.description || newer.workingSummary, older.sourceContent || older.description || older.workingSummary);

      map.set(key, {
         ...older,
         ...newer,
         id: newer.id || older.id,
         workflowId: newer.workflowId || older.workflowId,
         title: cleanProjectTitle(newer.sourceTitle || newer.title || older.sourceTitle || older.title) || "Untitled project item",
         sourceTitle: cleanProjectTitle(newer.sourceTitle || newer.title || older.sourceTitle || older.title) || "Untitled project item",
         description: mergedContent || newer.description || older.description,
         sourceContent: mergedContent || newer.sourceContent || older.sourceContent,
         workingSummary: preferNewestUsefulText(newer.workingSummary, mergedContent) || mergedContent || newer.workingSummary || older.workingSummary,
         history: [...(newer.history ?? []), ...(older.history ?? [])].slice(0, 30),
         createdAt: Math.min(older.createdAt || Date.now(), newer.createdAt || Date.now()),
         updatedAt: Math.max(older.updatedAt || 0, newer.updatedAt || 0),
      });
   });

   return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function getInitialBoard(): ProjectBoardState {
   return {
      title: "",
      items: [],
      updatedAt: Date.now(),
   };
}

// ========================================
// Component
// ========================================

export default function AdaptiveProjectBoard() {
   const workspace = useWorkspace();

   const { focusMode } = useFocus();

   const { currentEnvironment, adaptationStage, adaptationIntensity, adaptiveUI } = useEnvironment();

   const [mounted, setMounted] = useState(false);
   const [board, setBoard] = useState<ProjectBoardState>(getInitialBoard());
   const [saved, setSaved] = useState(false);
   const [notice, setNotice] = useState("");
   const [expandedDetailIds, setExpandedDetailIds] = useState<string[]>([]);
   const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);
   const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

   const [boardDetailsOpen, setBoardDetailsOpen] = useState(false);

   function syncBoardStatus(status: "focused-work-active" | "workspace-stable" = "focused-work-active") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   // ========================================
   // Load
   // ========================================

   useEffect(() => {
      setMounted(true);

      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
         try {
            const parsedBoard = JSON.parse(stored) as Partial<ProjectBoardState>;

            const migratedItems: ProjectItem[] = (parsedBoard.items ?? []).map((item) => {
               const id = item.id ?? crypto.randomUUID();
               const now = Date.now();
               const createdAt = item.createdAt ?? now;
               const title = cleanProjectTitle(item.sourceTitle || item.title) || "";
               const rawDescription = item.description ?? "";

               const cleanSourceContent = preferNewestUsefulText(item.sourceContent, rawDescription) || rawDescription;

               const migratedActivity =
                  item.history && item.history.length > 0
                     ? item.history
                     : [
                          createActivityEntry({
                             type: "created",
                             source: "system",
                             summary: "Existing project card migrated into history tracking.",
                          }),
                       ];

               return {
                  id,
                  workflowId: item.workflowId ?? id,
                  originBoardItemId: (item as ProjectItem).originBoardItemId,
                  title,
                  description: cleanSourceContent,
                  sourceTitle:
                     item.sourceTitle ??
                     extractSourceTitle({
                        title,
                        description: rawDescription,
                     }),
                  sourceContent: cleanSourceContent,
                  workingSummary: extractCleanProjectContent(item.workingSummary) || cleanSourceContent,
                  lane: item.lane ?? "backlog",
                  priority: item.priority ?? "medium",
                  history: migratedActivity,
                  createdAt,
                  updatedAt: item.updatedAt ?? now,
               };
            });

            const nextItems = mergeProjectItemsForContinuity(migratedItems);

            setBoard({
               title: parsedBoard.title ?? "",
               items: nextItems,
               updatedAt: parsedBoard.updatedAt ?? Date.now(),
            });

            syncBoardStatus(nextItems.length > 0 ? "focused-work-active" : "workspace-stable");
         } catch {
            localStorage.removeItem(STORAGE_KEY);

            syncBoardStatus("workspace-stable");
         }
      } else {
         syncBoardStatus("workspace-stable");
      }
   }, []);

   // ========================================
   // Auto Save
   // ========================================

   useEffect(() => {
      if (!mounted) return;

      const timer = setTimeout(() => {
         localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
               ...board,
               updatedAt: Date.now(),
            }),
         );
      }, 800);

      return () => clearTimeout(timer);
   }, [board, mounted]);

   // ========================================
   // Notices
   // ========================================

   function showNotice(message: string) {
      window.setTimeout(() => {
         setNotice(message);

         window.setTimeout(() => {
            setNotice("");
         }, 1200);
      }, 0);
   }

   // ========================================
   // Workflow Intel Logger
   // ========================================

   function logWorkflowEvent({ title, summary, workflowId, originBoardItemId, source = "system", destination = "system" }: { title: string; summary: string; workflowId?: string; originBoardItemId?: string; source?: string; destination?: string }) {
      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-log-workflow-event", {
               detail: {
                  id: crypto.randomUUID(),
                  type: "insight",
                  source,
                  destination,
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

   function dispatchSendToCanvas(payload: CanvasExportPayload) {
      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-send-to-canvas", {
               detail: payload,
            }),
         );
      }, 0);
   }

   // ========================================
   // Intelligence
   // ========================================

   const memory = getMemory();
   const prediction = getBehavioralPrediction();
   const profile = getCognitiveProfile();

   // ========================================
   // Infer Board Mode
   // ========================================

   const boardMode = useMemo<BoardMode>(() => {
      if (currentEnvironment === "deep-focus" || focusMode === "deep") {
         return "deep-focus";
      }

      const recent = memory.slice(-8);

      let planningSignals = 0;
      let researchSignals = 0;
      let creativeSignals = 0;

      recent.forEach((entry) => {
         const message = entry.message.toLowerCase();

         if (message.includes("plan") || message.includes("organize") || message.includes("roadmap") || message.includes("schedule") || message.includes("tasks")) {
            planningSignals++;
         }

         if (message.includes("research") || message.includes("study") || message.includes("analyze") || message.includes("compare") || message.includes("investigate")) {
            researchSignals++;
         }

         if (message.includes("design") || message.includes("brainstorm") || message.includes("ideas") || message.includes("creative") || message.includes("concept")) {
            creativeSignals++;
         }
      });

      if (planningSignals >= researchSignals && planningSignals >= creativeSignals && planningSignals > 0) {
         return "planning";
      }

      if (researchSignals >= planningSignals && researchSignals >= creativeSignals && researchSignals > 0) {
         return "research";
      }

      if (creativeSignals >= planningSignals && creativeSignals >= researchSignals && creativeSignals > 0) {
         return "creative";
      }

      return "balanced";
   }, [memory, currentEnvironment, focusMode]);

   // ========================================
   // Adaptive Board Config
   // ========================================

   const boardConfig = useMemo(() => {
      if (boardMode === "deep-focus") {
         return {
            label: "Deep Focus",
            description: "Board is narrowing around the work already in motion.",
            visibleLanes: ["active", "check"] as BoardLane[],
            laneLimit: 4,
            guidance: "Stay with one active item before switching to another.",
         };
      }

      if (boardMode === "planning") {
         return {
            label: "Planning",
            description: "Board is helping organize the order of the work.",
            visibleLanes: ["backlog", "active", "check", "complete"] as BoardLane[],
            laneLimit: 99,
            guidance: "Organize the next sequence, then move one item forward.",
         };
      }

      if (boardMode === "research") {
         return {
            label: "Research",
            description: "Board is helping turn research into project movement.",
            visibleLanes: ["backlog", "active", "check"] as BoardLane[],
            laneLimit: 99,
            guidance: "Turn research into a decision, a next action, or a check point.",
         };
      }

      if (boardMode === "creative") {
         return {
            label: "Creative",
            description: "Board is making room for ideas before they become tracked work.",
            visibleLanes: ["backlog", "active", "check"] as BoardLane[],
            laneLimit: 99,
            guidance: "Capture ideas first, then move the strongest one forward.",
         };
      }

      return {
         label: adaptiveUI ? "Supported" : "Balanced",
         description: "A steady board for moving work from idea to progress to done.",
         visibleLanes: ["backlog", "active", "check", "complete"] as BoardLane[],
         laneLimit: 99,
         guidance: prediction.predictedState !== "Baseline Observation" ? prediction.recommendation : "Move work from idea, to progress, to done.",
      };
   }, [boardMode, adaptiveUI, prediction.predictedState, prediction.recommendation]);

   // ========================================
   // Helpers
   // ========================================

   const laneLabels: Record<BoardLane, string> = {
      backlog: "Backlog",
      active: "In Progress",
      check: "Check",
      complete: "Done",
   };

   function getLaneItems(lane: BoardLane) {
      return board.items.filter((item) => item.lane === lane).slice(0, boardConfig.laneLimit);
   }

   function getNextLane(lane: BoardLane): BoardLane {
      if (lane === "backlog") return "active";

      if (lane === "active") return "check";

      if (lane === "check") return "complete";

      return "complete";
   }

   function getImportLane(payload?: BoardImportPayload): BoardLane {
      if (payload?.lane) return payload.lane;

      if (boardMode === "deep-focus") {
         return "active";
      }

      return "backlog";
   }

   function getActivitySourceLabel(source: ActivitySource) {
      switch (source) {
         case "task":
            return "Tasks";
         case "canvas":
            return "Canvas";
         case "research":
            return "Research";
         case "system":
            return "System";
         default:
            return "Manual";
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

   function normalizeTitle(title: string) {
      return cleanProjectTitle(title)
         .toLowerCase()
         .trim()
         .replace(/[^a-z0-9]+/g, " ")
         .replace(/\s+/g, " ");
   }

   function findExistingBoardItem(items: ProjectItem[], payload: BoardImportPayload) {
      const cleanedIncomingTitle = cleanProjectTitle(payload.sourceTitle || payload.title);

      if (payload.originBoardItemId) {
         const matchByOrigin = items.find((item) => item.id === payload.originBoardItemId);

         if (matchByOrigin) return matchByOrigin;
      }

      if (payload.workflowId) {
         const matchByWorkflow = items.find((item) => item.workflowId === payload.workflowId);

         if (matchByWorkflow) return matchByWorkflow;
      }

      const incomingTitle = normalizeTitle(cleanedIncomingTitle);

      if (incomingTitle) {
         const matchByTitle = items.find((item) => normalizeTitle(item.sourceTitle || item.title) === incomingTitle || normalizeTitle(item.title) === incomingTitle);

         if (matchByTitle) return matchByTitle;
      }

      return null;
   }

   function getBoardCounts() {
      return {
         total: board.items.length,
         backlog: board.items.filter((item) => item.lane === "backlog").length,
         active: board.items.filter((item) => item.lane === "active").length,
         check: board.items.filter((item) => item.lane === "check").length,
         complete: board.items.filter((item) => item.lane === "complete").length,
      };
   }

   function getPrimaryProjectContent(item: ProjectItem) {
      // General display/export helper: clean structured content when possible.
      return extractCleanProjectContent(item.description) || cleanText(item.description) || extractCleanProjectContent(item.sourceContent) || cleanText(item.sourceContent) || "No description provided.";
   }

   function getBoardVisibleDescriptionForCanvas(item: ProjectItem) {
      const visibleDescription = cleanText(item.description);
      const visibleSourceContent = cleanText(item.sourceContent);
      const visibleWorkingSummary = cleanText(item.workingSummary);

      const bestVisibleContent = visibleDescription || visibleSourceContent || visibleWorkingSummary || getPrimaryProjectContent(item);

      return removeRepeatedProjectTitlePrefixFromFocusContent(bestVisibleContent, item.sourceTitle || item.title);
   }

   function buildNoteBody(item: ProjectItem) {
      const primaryContent = removeRepeatedProjectTitlePrefixFromFocusContent(getPrimaryProjectContent(item), item.sourceTitle || item.title);

      const historyPcheck = (item.history ?? [])
         .slice(0, 5)
         .map((entry) => `- ${entry.summary} (${getActivitySourceLabel(entry.source)}, ${getTimeLabel(entry.createdAt)})`)
         .join("\n");

      return `
Project Item:
${item.sourceTitle || item.title || "Untitled project item"}

Primary Content:
${primaryContent}

Current Board View:
${item.description || "No board description provided."}

Lane:
${laneLabels[item.lane]}

Priority:
${item.priority}

Activity:
${historyPcheck || "No history available."}
      `.trim();
   }

   function getCanvasBodyForItem(item: ProjectItem) {
      const focusContent = removeRepeatedProjectTitlePrefixFromFocusContent(getBoardVisibleDescriptionForCanvas(item), item.sourceTitle || item.title);

      const cleanTitle = cleanProjectTitle(item.sourceTitle || item.title) || "Project Work Item";

      const usefulContext = [
         `Project: ${cleanTitle}`,
         `Current stage: Tracking`,
         `Current location: Canvas`,
         `Priority: ${item.priority}`,
         `Latest movement: Board → Canvas (continued in Canvas)`,
         `Recent update: ALLEVIN detected newer edited content and is treating it as the latest project version.`,
         `Board context: This work is being tracked as a project item, so lane/status matters for the next move.`,
         `Context confidence: ${focusContent.length > 80 ? "90%" : "80%"}`,
      ].join("\n");

      const nextStep = "Continue developing the latest Board update in Canvas. When it is ready, send it to Tasks, move it forward on the Board, or save it to Projects.";

      return [`Focus:\n${focusContent}`, `Useful Context:\n${usefulContext}`, `Next Step:\n${nextStep}`].join("\n\n");
   }

   function getProjectMemoryStageFromLane(lane: BoardLane) {
      if (lane === "backlog") return "idea";
      if (lane === "active") return "tracking";
      if (lane === "check") return "reviewing";
      if (lane === "complete") return "completed";

      return "unknown";
   }

   function getProjectMemoryStatusFromLane(lane: BoardLane) {
      return lane === "complete" ? "completed" : "active";
   }

   function getBoardMemoryNextStep(lane: BoardLane) {
      if (lane === "backlog") {
         return "Choose the first useful action and move this work into progress when ready.";
      }

      if (lane === "active") {
         return "Continue developing the work, then move it forward when the current version is ready.";
      }

      if (lane === "check") {
         return "Check the latest version, save important notes, or mark the work done.";
      }

      return "This work is marked done. Restore it if more work is needed later.";
   }

   function syncBoardItemToProjectMemory(
      item: ProjectItem,
      options: {
         source?: "manual" | "task" | "canvas" | "research" | "system" | "board";
         destination?: "board" | "canvas" | "notes" | "system";
         latestMovement?: string;
         recommendedNextAction?: string;
      } = {},
   ) {
      const primaryContent = removeRepeatedProjectTitlePrefixFromFocusContent(getPrimaryProjectContent(item), item.sourceTitle || item.title);
      const title = cleanProjectTitle(item.sourceTitle || item.title) || item.title || "Untitled project item";

      upsertProjectMemory({
         title,
         body: primaryContent,
         sourceTitle: title,
         sourceContent: primaryContent,
         workingSummary: item.workingSummary || primaryContent,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId || item.id,
         source: options.source || "board",
         destination: options.destination || "board",
         stage: getProjectMemoryStageFromLane(item.lane),
         status: getProjectMemoryStatusFromLane(item.lane),
         priority: item.priority,
         latestMovement: options.latestMovement || `Board → ${laneLabels[item.lane]}`,
         recommendedNextAction: options.recommendedNextAction || getBoardMemoryNextStep(item.lane),
      });
   }

   // ========================================
   // Actions
   // ========================================

   function saveBoard() {
      const updated = {
         ...board,
         items: mergeProjectItemsForContinuity(board.items),
         updatedAt: Date.now(),
      };

      setBoard(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      updated.items.forEach((item) =>
         syncBoardItemToProjectMemory(item, {
            source: "board",
            destination: "board",
            latestMovement: "Board saved",
         }),
      );

      syncBoardStatus(updated.items.length > 0 ? "focused-work-active" : "workspace-stable");

      setSaved(true);

      setTimeout(() => {
         setSaved(false);
      }, 1200);
   }

   function resetBoard() {
      const fresh = getInitialBoard();

      localStorage.removeItem(STORAGE_KEY);
      setBoard(fresh);
      setExpandedActivityIds([]);
      setExpandedDetailIds([]);

      syncBoardStatus("workspace-stable");

      showNotice("Board reset");
   }

   function addProjectItem() {
      const newItem = createProjectItem({
         title: "",
         description: "",
         sourceTitle: "",
         sourceContent: "",
         workingSummary: "",
         lane: "backlog",
         priority: boardMode === "deep-focus" ? "high" : "medium",
      });

      setBoard({
         ...board,
         items: [newItem, ...board.items],
         updatedAt: Date.now(),
      });

      syncBoardStatus("focused-work-active");

      showNotice("Project added");

      logWorkflowEvent({
         title: "Board item created",
         summary: "New board item created in ALLEVIN Board.",
         workflowId: newItem.workflowId,
         originBoardItemId: newItem.id,
      });

      syncBoardItemToProjectMemory(newItem, {
         source: "board",
         destination: "board",
         latestMovement: "Board item created",
      });
   }

   function importBoardItem(payload: BoardImportPayload) {
      const cleanedPayloadTitle = cleanProjectTitle(payload.sourceTitle || payload.title);

      if (!cleanedPayloadTitle) return;

      syncBoardStatus("focused-work-active");

      const now = Date.now();

      setBoard((prev) => {
         const normalizedPayload: BoardImportPayload = {
            ...payload,
            title: cleanedPayloadTitle,
            sourceTitle: cleanedPayloadTitle,
            workflowId: payload.workflowId || getStableWorkflowIdFromTitle(cleanedPayloadTitle),
         };

         const existingItem = findExistingBoardItem(prev.items, normalizedPayload);

         const incomingDescription = buildBoardDescription({
            description: normalizedPayload.description,
            sourceContent: normalizedPayload.sourceContent,
         });

         const incomingSourceTitle = extractSourceTitle({
            title: normalizedPayload.title,
            description: normalizedPayload.description,
            sourceTitle: normalizedPayload.sourceTitle,
         });

         const incomingSourceContent =
            extractSourceContent({
               description: normalizedPayload.description,
               sourceContent: normalizedPayload.sourceContent,
            }) || incomingDescription;

         const incomingWorkingSummary = extractCleanProjectContent(normalizedPayload.workingSummary) || incomingDescription;

         if (existingItem) {
            const incomingTitle = normalizeTitle(payload.title);

            const updatedDescription = incomingDescription || existingItem.description || "Updated from Tasks.";

            const updatedLane = normalizedPayload.lane ?? existingItem.lane;
            const updatedPriority = normalizedPayload.priority ?? existingItem.priority;

            const updatedSourceTitle = incomingSourceTitle || existingItem.sourceTitle || existingItem.title;

            const updatedSourceContent = incomingSourceContent || existingItem.sourceContent || updatedDescription;

            const updatedWorkingSummary = incomingWorkingSummary || existingItem.workingSummary || updatedDescription;

            const historyEntry = createActivityEntry({
               type: "updated",
               source: normalizedPayload.source,
               summary: `Updated from ${getActivitySourceLabel(normalizedPayload.source)}.`,
               previousDescription: existingItem.description,
               newDescription: updatedDescription,
               previousLane: existingItem.lane,
               newLane: updatedLane,
               previousPriority: existingItem.priority,
               newPriority: updatedPriority,
            });

            const updatedItems = prev.items
               .map((item) =>
                  item.id === existingItem.id
                     ? {
                          ...item,
                          title: updatedSourceTitle || normalizedPayload.title.trim(),
                          description: updatedDescription,
                          sourceTitle: updatedSourceTitle,
                          sourceContent: updatedSourceContent,
                          workingSummary: updatedWorkingSummary,
                          lane: updatedLane,
                          priority: updatedPriority,
                          workflowId: normalizedPayload.workflowId ?? item.workflowId,
                          originBoardItemId: normalizedPayload.originBoardItemId || item.originBoardItemId || existingItem.id,
                          history: [historyEntry, ...(item.history ?? [])],
                          updatedAt: now,
                       }
                     : item,
               )
               .filter((item) => {
                  if (item.id === existingItem.id) return true;

                  const sameWorkflow = Boolean(normalizedPayload.workflowId) && item.workflowId === normalizedPayload.workflowId;

                  const sameOrigin = Boolean(normalizedPayload.originBoardItemId) && item.id === normalizedPayload.originBoardItemId;

                  const sameTitle = Boolean(incomingTitle) && normalizeTitle(item.title) === incomingTitle;

                  return !(sameWorkflow || sameOrigin || sameTitle);
               });

            showNotice("Board item updated");

            logWorkflowEvent({
               title: updatedSourceTitle || normalizedPayload.title.trim(),
               summary: `Board item updated from ${getActivitySourceLabel(normalizedPayload.source)}: ${updatedSourceTitle || payload.title}`,
               workflowId: normalizedPayload.workflowId ?? existingItem.workflowId,
               originBoardItemId: existingItem.id,
               source: "board",
               destination: "system",
            });

            upsertProjectMemory({
               title: updatedSourceTitle || normalizedPayload.title.trim(),
               body: updatedSourceContent || updatedDescription,
               sourceTitle: updatedSourceTitle || normalizedPayload.title.trim(),
               sourceContent: updatedSourceContent || updatedDescription,
               workingSummary: updatedWorkingSummary || updatedSourceContent || updatedDescription,
               workflowId: normalizedPayload.workflowId ?? existingItem.workflowId,
               originBoardItemId: normalizedPayload.originBoardItemId || existingItem.originBoardItemId || existingItem.id,
               source: normalizedPayload.source,
               destination: "board",
               stage: getProjectMemoryStageFromLane(updatedLane),
               status: getProjectMemoryStatusFromLane(updatedLane),
               priority: updatedPriority,
               latestMovement: `${getActivitySourceLabel(normalizedPayload.source)} → Board`,
               recommendedNextAction: getBoardMemoryNextStep(updatedLane),
            });

            return {
               ...prev,
               items: mergeProjectItemsForContinuity(updatedItems),
               updatedAt: now,
            };
         }

         const id = crypto.randomUUID();

         const historyEntry = createActivityEntry({
            type: "imported",
            source: normalizedPayload.source,
            summary: `Imported from ${getActivitySourceLabel(normalizedPayload.source)}.`,
            newDescription: incomingDescription || "Sent from Tasks.",
         });

         const newItem: ProjectItem = {
            id,
            workflowId: normalizedPayload.workflowId ?? id,
            originBoardItemId: normalizedPayload.originBoardItemId || id,
            title: incomingSourceTitle || normalizedPayload.title.trim(),
            description: incomingDescription || "Sent from Tasks.",
            sourceTitle: incomingSourceTitle || normalizedPayload.title.trim(),
            sourceContent: incomingSourceContent || incomingDescription || "Sent from Tasks.",
            workingSummary: incomingWorkingSummary || incomingDescription || "Sent from Tasks.",
            lane: getImportLane(normalizedPayload),
            priority: normalizedPayload.priority ?? "medium",
            history: [historyEntry],
            createdAt: now,
            updatedAt: now,
         };

         showNotice("Board item added");

         logWorkflowEvent({
            title: newItem.sourceTitle || newItem.title || "Board item added",
            summary: `Board item added from ${getActivitySourceLabel(normalizedPayload.source)}: ${newItem.sourceTitle || newItem.title}`,
            workflowId: newItem.workflowId,
            originBoardItemId: newItem.id,
            source: "board",
            destination: "system",
         });

         syncBoardItemToProjectMemory(newItem, {
            source: normalizedPayload.source,
            destination: "board",
            latestMovement: `${getActivitySourceLabel(normalizedPayload.source)} → Board`,
            recommendedNextAction: getBoardMemoryNextStep(newItem.lane),
         });

         return {
            ...prev,
            items: mergeProjectItemsForContinuity([newItem, ...prev.items]),
            updatedAt: now,
         };
      });
   }

   function updateItem(id: string, field: "title" | "description" | "priority", value: string) {
      // Important for text editing:
      // Do not run aggressive title/content cleanup on every keystroke.
      // Those helpers trim and restructure text, which can swallow spaces
      // while the user is typing inside the Board edit fields.
      // We preserve the raw typed value here, then clean/normalize later
      // during Save, Canvas handoff, Board import, and memory sync.
      setBoard((currentBoard) => ({
         ...currentBoard,
         items: currentBoard.items.map((item) => {
            if (item.id !== id) return item;

            if (field === "title") {
               const typedTitle = value;
               const cleanedTitle = cleanProjectTitle(typedTitle);

               return {
                  ...item,
                  title: typedTitle,
                  sourceTitle: typedTitle,
                  workflowId: item.workflowId || getStableWorkflowIdFromTitle(cleanedTitle || typedTitle) || item.id,
                  updatedAt: Date.now(),
               };
            }

            if (field === "description") {
               return {
                  ...item,
                  description: value,
                  sourceContent: value,
                  workingSummary: value,
                  updatedAt: Date.now(),
               };
            }

            return {
               ...item,
               priority: value as ProjectItem["priority"],
               updatedAt: Date.now(),
            };
         }),
         updatedAt: Date.now(),
      }));
   }

   function deleteItem(id: string) {
      const targetItem = board.items.find((item) => item.id === id);

      setBoard({
         ...board,
         items: board.items.filter((item) => item.id !== id),
         updatedAt: Date.now(),
      });

      setExpandedActivityIds((prev) => prev.filter((itemId) => itemId !== id));
      setExpandedDetailIds((prev) => prev.filter((itemId) => itemId !== id));

      syncBoardStatus(board.items.length > 1 ? "focused-work-active" : "workspace-stable");

      showNotice("Board item deleted");

      if (targetItem) {
         logWorkflowEvent({
            title: targetItem.sourceTitle || targetItem.title || "Board item deleted",
            summary: `Board item deleted: ${targetItem.sourceTitle || targetItem.title || "Untitled project item"}`,
            workflowId: targetItem.workflowId,
            originBoardItemId: targetItem.id,
            source: "board",
            destination: "system",
         });

         deleteProjectMemory({
            workflowId: targetItem.workflowId,
            originBoardItemId: targetItem.originBoardItemId || targetItem.id,
            title: targetItem.sourceTitle || targetItem.title,
         });
      }
   }

   function moveItem(id: string, lane: BoardLane) {
      const targetItem = board.items.find((item) => item.id === id);

      setBoard({
         ...board,
         items: board.items.map((item) => {
            if (item.id !== id) return item;
            if (item.lane === lane) return item;

            const historyEntry = createActivityEntry({
               type: "moved",
               source: "manual",
               summary: `Moved from ${laneLabels[item.lane]} to ${laneLabels[lane]}.`,
               previousLane: item.lane,
               newLane: lane,
            });

            return {
               ...item,
               lane,
               history: [historyEntry, ...(item.history ?? [])],
               updatedAt: Date.now(),
            };
         }),
         updatedAt: Date.now(),
      });

      if (targetItem && targetItem.lane !== lane) {
         syncBoardStatus("focused-work-active");

         showNotice(lane === "complete" ? "Marked done" : "Moved forward");

         logWorkflowEvent({
            title: targetItem.sourceTitle || targetItem.title || "Board item moved",
            summary: `${targetItem.sourceTitle || targetItem.title || "Project item"} moved from ${laneLabels[targetItem.lane]} to ${laneLabels[lane]}.`,
            workflowId: targetItem.workflowId,
            originBoardItemId: targetItem.id,
            source: "board",
            destination: lane === "complete" ? "system" : "board",
         });

         syncBoardItemToProjectMemory(
            {
               ...targetItem,
               lane,
               updatedAt: Date.now(),
            },
            {
               source: "board",
               destination: lane === "complete" ? "system" : "board",
               latestMovement: `${laneLabels[targetItem.lane]} → ${laneLabels[lane]}`,
               recommendedNextAction: getBoardMemoryNextStep(lane),
            },
         );
      }
   }

   function toggleComplete(item: ProjectItem) {
      if (item.lane === "complete") {
         moveItem(item.id, "active");
         return;
      }

      moveItem(item.id, "complete");
   }

   function toggleActivity(id: string) {
      setExpandedActivityIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
   }

   function toggleDetails(id: string) {
      setExpandedDetailIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
   }

   function getFreshBoardItemForAction(item: ProjectItem) {
      return board.items.find((candidate) => candidate.id === item.id) || item;
   }

   function getRawBoardFocusForCanvas(item: ProjectItem) {
      const freshItem = getFreshBoardItemForAction(item);

      const rawDescription = cleanText(freshItem.description);
      const rawSourceContent = cleanText(freshItem.sourceContent);
      const rawWorkingSummary = cleanText(freshItem.workingSummary);
      const primaryProjectContent = getPrimaryProjectContent(freshItem);

      const bestContent = chooseLongestUsefulProjectContent(rawSourceContent, rawDescription, rawWorkingSummary, primaryProjectContent) || rawSourceContent || rawDescription || rawWorkingSummary || primaryProjectContent;

      return removeRepeatedProjectTitlePrefixFromFocusContent(bestContent, freshItem.sourceTitle || freshItem.title);
   }

   function sendProjectItemToCanvas(item: ProjectItem) {
      const freshItem = getFreshBoardItemForAction(item);

      // Source of truth for Board → Canvas:
      // Use the live visible Board description first, because that is the
      // user's latest edited project content.
      const primaryContent = getRawBoardFocusForCanvas(freshItem);

      const cleanTitle = cleanProjectTitle(freshItem.sourceTitle || freshItem.title) || "Project Work Item";

      const payload: CanvasExportPayload = {
         title: cleanTitle,
         source: "project",
         workflowId: freshItem.workflowId,
         originBoardItemId: freshItem.id,
         sourceTitle: cleanTitle,
         sourceContent: primaryContent,
         workingSummary: primaryContent,
         cleanSourceContent: primaryContent,
         body: getCanvasBodyForItem({
            ...freshItem,
            sourceTitle: cleanTitle,
            title: cleanTitle,
            sourceContent: primaryContent,
            description: primaryContent,
            workingSummary: primaryContent,
         }),
      };

      dispatchSendToCanvas(payload);

      const historyEntry = createActivityEntry({
         type: "canvas",
         source: "manual",
         summary: freshItem.lane === "active" ? "Sent project item to Canvas." : "Sent project item to Canvas and moved to In Progress.",
         previousLane: freshItem.lane,
         newLane: "active",
      });

      setBoard((prev) => ({
         ...prev,
         items: prev.items.map((boardItem) =>
            boardItem.id === freshItem.id
               ? {
                    ...boardItem,
                    lane: "active",
                    sourceContent: primaryContent,
                    description: primaryContent,
                    workingSummary: primaryContent,
                    history: [historyEntry, ...(boardItem.history ?? [])],
                    updatedAt: Date.now(),
                 }
               : boardItem,
         ),
         updatedAt: Date.now(),
      }));

      upsertProjectMemory({
         title: cleanTitle,
         sourceTitle: cleanTitle,
         body: primaryContent,
         sourceContent: primaryContent,
         workingSummary: primaryContent,
         workflowId: freshItem.workflowId,
         originBoardItemId: freshItem.id,
         source: "board",
         destination: "canvas",
         stage: "tracking",
         status: "active",
         priority: freshItem.priority,
         latestMovement: "Board → Canvas (continued in Canvas)",
         recommendedNextAction: "Continue developing the latest Board update in Canvas. When it is ready, send it to Tasks, move it forward on the Board, or save it to Projects.",
      });

      syncBoardStatus("focused-work-active");

      showNotice("Sent to Canvas");

      logWorkflowEvent({
         title: cleanTitle,
         summary: `Board item sent to Canvas with the latest Board description: ${cleanTitle}`,
         workflowId: freshItem.workflowId,
         originBoardItemId: freshItem.id,
         source: "board",
         destination: "canvas",
      });
   }

   async function saveProjectItemToProjects(item: ProjectItem) {
      try {
         setSavingProjectId(item.id);

         const primaryContent = removeRepeatedProjectTitlePrefixFromFocusContent(getPrimaryProjectContent(item), item.sourceTitle || item.title);

         const result = await createInternalNote({
            id: item.id,
            title: cleanProjectTitle(item.sourceTitle || item.title) || "Board Project",
            body: buildNoteBody({
               ...item,
               sourceContent: primaryContent,
               description: primaryContent,
            }),
            summary: primaryContent,
            workflowId: item.workflowId,
            originBoardItemId: item.id,
         });

         const historyEntry = createActivityEntry({
            type: "updated",
            source: "manual",
            summary: item.lane === "check" ? "Saved board item to Projects." : "Saved board item to Projects and moved to Check.",
            previousLane: item.lane,
            newLane: "check",
            newDescription: result.noteBody,
         });

         setBoard((prev) => ({
            ...prev,
            items: prev.items.map((boardItem) =>
               boardItem.id === item.id
                  ? {
                       ...boardItem,
                       lane: "check",
                       sourceContent: primaryContent,
                       description: primaryContent,
                       workingSummary: primaryContent,
                       history: [historyEntry, ...(boardItem.history ?? [])],
                       updatedAt: Date.now(),
                    }
                  : boardItem,
            ),
            updatedAt: Date.now(),
         }));

         syncBoardStatus("focused-work-active");

         showNotice("Saved to Projects");

         logWorkflowEvent({
            title: item.sourceTitle || item.title || "Board item saved to Projects",
            summary: `Board item saved to Projects: ${item.sourceTitle || item.title || "Untitled project item"}`,
            workflowId: item.workflowId,
            originBoardItemId: item.id,
            source: "board",
            destination: "system",
         });

         syncBoardItemToProjectMemory(
            {
               ...item,
               lane: "check",
               sourceContent: primaryContent,
               description: primaryContent,
               workingSummary: primaryContent,
               updatedAt: Date.now(),
            },
            {
               source: "board",
               destination: "notes",
               latestMovement: "Board → Projects",
               recommendedNextAction: "Continue in Canvas if it needs more writing, or mark it done when ready.",
            },
         );
      } catch {
         showNotice("Save failed");
      } finally {
         setSavingProjectId(null);
      }
   }

   // ========================================
   // External Board Listener
   // ========================================

   useEffect(() => {
      function handleBoardImport(event: Event) {
         const customEvent = event as CustomEvent<BoardImportPayload>;

         if (!customEvent.detail) return;

         importBoardItem(customEvent.detail);
      }

      window.addEventListener("allevin-send-to-board", handleBoardImport);

      return () => {
         window.removeEventListener("allevin-send-to-board", handleBoardImport);
      };
   }, [boardMode]);

   const boardCounts = getBoardCounts();

   if (!mounted) return null;

   return (
      <motion.section
         id="board"
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
         className="rounded-[32px] border border-[var(--border-subtle)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)]"
      >
         {/* Header */}

         <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
               <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-bg)]">
                  <Columns3 size={24} />
               </div>

               <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">ALLEVIN Board</p>

                  <h2 className="mt-1 text-3xl">Project Board</h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Track active work without making the workspace noisy. Move cards from idea, to progress, to check, to done.</p>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               {notice ? <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div> : null}

               <button type="button" onClick={addProjectItem} className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                  <Plus size={16} />
                  Add Card
               </button>

               <button type="button" onClick={resetBoard} className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                  <RotateCcw size={16} />
                  Reset Board
               </button>

               <button type="button" onClick={saveBoard} className="flex items-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90">
                  <Save size={16} />
                  {saved ? "Saved" : "Save Board"}
               </button>
            </div>
         </div>

         {/* Friendly Overview */}

         <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
               <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                     <p className="text-sm font-semibold">Board flow</p>

                     <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Use this when work is already real enough to track. Canvas is for shaping, Tasks is for clear actions, and Board is for progress.</p>
                  </div>

                  <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">
                     {boardCounts.total} total {boardCounts.total === 1 ? "card" : "cards"}
                  </div>
               </div>

               <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                     <p className="text-2xl font-semibold">{boardCounts.backlog}</p>
                     <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Backlog</p>
                  </div>

                  <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                     <p className="text-2xl font-semibold">{boardCounts.active}</p>
                     <p className="mt-1 text-xs text-[var(--color-text-secondary)]">In Progress</p>
                  </div>

                  <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                     <p className="text-2xl font-semibold">{boardCounts.check}</p>
                     <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Check</p>
                  </div>

                  <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                     <p className="text-2xl font-semibold">{boardCounts.complete}</p>
                     <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Done</p>
                  </div>
               </div>
            </div>

            <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
               <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-bg)]">
                     <Sparkles size={18} />
                  </div>

                  <div>
                     <p className="text-sm font-semibold">ALLEVIN board read</p>

                     <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{boardConfig.guidance}</p>
                  </div>
               </div>

               <button
                  type="button"
                  onClick={() => setBoardDetailsOpen((current) => !current)}
                  className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3 text-left transition-colors hover:bg-white"
               >
                  <div>
                     <p className="text-sm font-medium">Board details</p>
                     <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Mode, environment, and cognitive guidance.</p>
                  </div>

                  <ChevronDown size={18} className={`transition-transform duration-200 ${boardDetailsOpen ? "rotate-180" : ""}`} />
               </button>

               <AnimatePresence initial={false}>
                  {boardDetailsOpen ? (
                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                           <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                              <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Mode</p>
                              <p className="mt-2 font-medium">{boardConfig.label}</p>
                           </div>

                           <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                              <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Flow</p>
                              <p className="mt-2 font-medium capitalize">{boardMode.replace("-", " ")}</p>
                           </div>
                        </div>

                        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                           <Brain size={16} className="mt-1 shrink-0" />
                           <span>
                              {profile.profile}: {profile.recommendation}
                           </span>
                        </div>
                     </motion.div>
                  ) : null}
               </AnimatePresence>
            </div>
         </div>

         {/* Empty State */}

         {board.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-white p-8 text-center">
               <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-bg)]">
                  <Columns3 size={22} />
               </div>

               <h3 className="mt-4 text-xl font-semibold">No board cards yet</h3>

               <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">Add a card manually or send work here from Tasks. The Board is best once a project has a clear thing to track.</p>

               <button type="button" onClick={addProjectItem} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90">
                  <Plus size={16} />
                  Add first card
               </button>
            </div>
         ) : null}

         {/* Board Lanes */}

         {board.items.length > 0 ? (
            <div className={`grid gap-5 transition-all duration-700 ${boardConfig.visibleLanes.length === 1 ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
               {boardConfig.visibleLanes.map((lane) => (
                  <motion.div key={lane} layout className="rounded-3xl border border-[var(--border-subtle)] bg-white p-4">
                     <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Status</p>
                           <h3 className="mt-1 text-xl font-semibold">{laneLabels[lane]}</h3>
                        </div>

                        <div className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-sm font-medium">{getLaneItems(lane).length}</div>
                     </div>

                     <div className="space-y-3">
                        <AnimatePresence>
                           {getLaneItems(lane).map((item) => {
                              const detailsOpen = expandedDetailIds.includes(item.id);
                              const historyOpen = expandedActivityIds.includes(item.id);
                              const isSavingNote = savingProjectId === item.id;
                              const primaryContent = getPrimaryProjectContent(item);

                              return (
                                 <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                                    <div className="flex flex-col gap-4">
                                       <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0 flex-1">
                                             <div className="mb-3 flex flex-wrap items-center gap-2">
                                                <span className="rounded-xl bg-white px-3 py-1 text-xs font-medium">{laneLabels[item.lane]}</span>
                                                <span className="rounded-xl bg-white px-3 py-1 text-xs font-medium capitalize">{item.priority} priority</span>
                                                <span className="rounded-xl bg-white px-3 py-1 text-xs text-[var(--color-text-secondary)]">Updated {getTimeLabel(item.updatedAt)}</span>
                                             </div>

                                             <h4 className="text-base font-semibold leading-6">{item.sourceTitle || item.title || "Untitled project item"}</h4>

                                             <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">{primaryContent}</p>
                                          </div>

                                          <button type="button" onClick={() => deleteItem(item.id)} className="shrink-0 rounded-xl bg-white p-2 transition-opacity hover:opacity-80" title="Delete card">
                                             <Trash2 size={14} />
                                          </button>
                                       </div>

                                       <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
                                          <button
                                             type="button"
                                             onClick={() => sendProjectItemToCanvas(item)}
                                             className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                                          >
                                             <Send size={13} />
                                             Canvas
                                          </button>

                                          <button
                                             type="button"
                                             onClick={() => moveItem(item.id, getNextLane(item.lane))}
                                             disabled={item.lane === "complete"}
                                             className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                             <RotateCw size={13} />
                                             Move
                                          </button>

                                          <button type="button" onClick={() => toggleComplete(item)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                                             {item.lane === "complete" ? <RotateCw size={13} /> : <CheckCircle2 size={13} />}
                                             {item.lane === "complete" ? "Restore" : "Done"}
                                          </button>

                                          <button type="button" onClick={() => toggleDetails(item.id)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                                             <ChevronDown size={13} className={`transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
                                             Details
                                          </button>
                                       </div>
                                    </div>

                                    <AnimatePresence>
                                       {detailsOpen ? (
                                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                             <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
                                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
                                                   <label className="space-y-2">
                                                      <span className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Title</span>
                                                      <input
                                                         value={item.title}
                                                         onChange={(event) => updateItem(item.id, "title", event.target.value)}
                                                         onKeyDown={(event) => event.stopPropagation()}
                                                         className="w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm font-semibold outline-none placeholder:text-[var(--color-text-secondary)]"
                                                         placeholder="Name this project item..."
                                                      />
                                                   </label>

                                                   <label className="space-y-2">
                                                      <span className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Priority</span>
                                                      <select
                                                         value={item.priority}
                                                         onChange={(event) => updateItem(item.id, "priority", event.target.value)}
                                                         className="w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm outline-none"
                                                      >
                                                         <option value="low">Low</option>
                                                         <option value="medium">Medium</option>
                                                         <option value="high">High</option>
                                                      </select>
                                                   </label>
                                                </div>

                                                <label className="space-y-2">
                                                   <span className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Details</span>
                                                   <textarea
                                                      value={item.description}
                                                      onChange={(event) => updateItem(item.id, "description", event.target.value)}
                                                      onKeyDown={(event) => event.stopPropagation()}
                                                      className="min-h-[140px] w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm leading-6 text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-secondary)]"
                                                      placeholder="Describe the work, decision, or next step..."
                                                   />
                                                </label>

                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                   <button
                                                      type="button"
                                                      onClick={() => saveProjectItemToProjects(item)}
                                                      disabled={isSavingNote}
                                                      className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                                                   >
                                                      <Save size={14} />
                                                      {isSavingNote ? "Saving" : "Save to Projects"}
                                                   </button>

                                                   <button
                                                      type="button"
                                                      onClick={() => sendProjectItemToCanvas(item)}
                                                      className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                                                   >
                                                      <Send size={14} />
                                                      Continue in Canvas
                                                   </button>

                                                   <button
                                                      type="button"
                                                      onClick={() => toggleComplete(item)}
                                                      className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90"
                                                   >
                                                      {item.lane === "complete" ? <RotateCw size={14} /> : <CheckCircle2 size={14} />}
                                                      {item.lane === "complete" ? "Restore" : "Complete"}
                                                   </button>

                                                   <button
                                                      type="button"
                                                      onClick={() => toggleActivity(item.id)}
                                                      className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                                                   >
                                                      <Activity size={14} />
                                                      Activity
                                                      <ChevronDown size={14} className={`transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
                                                   </button>
                                                </div>

                                                <AnimatePresence>
                                                   {historyOpen ? (
                                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                                         <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                               <p className="font-medium">Activity</p>
                                                               <p className="text-xs text-[var(--color-text-secondary)]">{item.history?.length ?? 0} events</p>
                                                            </div>

                                                            <div className="space-y-3">
                                                               {(item.history ?? []).length > 0 ? (
                                                                  item.history.map((entry) => (
                                                                     <div key={entry.id} className="rounded-2xl bg-white p-4">
                                                                        <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:justify-between">
                                                                           <p className="text-sm font-medium">{entry.summary}</p>
                                                                           <p className="shrink-0 text-xs text-[var(--color-text-secondary)]">{getTimeLabel(entry.createdAt)}</p>
                                                                        </div>

                                                                        <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">
                                                                           {getActivitySourceLabel(entry.source)} • {entry.type}
                                                                        </p>

                                                                        {entry.previousLane && entry.newLane ? (
                                                                           <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                                                                              Status: {laneLabels[entry.previousLane]} → {laneLabels[entry.newLane]}
                                                                           </p>
                                                                        ) : null}
                                                                     </div>
                                                                  ))
                                                               ) : (
                                                                  <p className="text-sm text-[var(--color-text-secondary)]">No history yet.</p>
                                                               )}
                                                            </div>
                                                         </div>
                                                      </motion.div>
                                                   ) : null}
                                                </AnimatePresence>
                                             </div>
                                          </motion.div>
                                       ) : null}
                                    </AnimatePresence>
                                 </motion.div>
                              );
                           })}
                        </AnimatePresence>

                        {getLaneItems(lane).length === 0 ? (
                           <div className="flex items-center gap-2 rounded-2xl bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-secondary)]">
                              <Eye size={14} />
                              <span>No cards here yet.</span>
                           </div>
                        ) : null}
                     </div>
                  </motion.div>
               ))}
            </div>
         ) : null}
      </motion.section>
   );
}
