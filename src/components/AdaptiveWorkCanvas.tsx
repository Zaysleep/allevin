// ========================================
// Adaptive Work Canvas
// Purpose:
// Real workflow surface for notes, planning,
// writing, and cognitive work inside ALLEVIN.
// MK III polish keeps Canvas clear,
// user-friendly, project-aware, and simple for
// focused writing and saved work.
// ========================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";

import { FileText, Save, RotateCcw, CheckCircle2 } from "lucide-react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { useWorkspace } from "@/components/WorkspaceContext";

import { getMemory } from "@/components/MemoryEngine";

import { recommendIntegrationDestination } from "@/lib/integrationRecommender";

import { cleanProjectTitle, createStableWorkflowId, upsertProjectMemory } from "@/lib/allevinProjectMemory";

// ========================================
// Canvas Storage
// ========================================

const STORAGE_KEY = "allevin-adaptive-work-canvas";

const PROJECT_LIBRARY_STORAGE_KEY = "allevin-project-library";

const APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY = "allevin-canvas-approved-internal-integration-handled";

// ========================================
// MK V Build 6 — Canvas Sanitization Parameters
// Canvas should feel open, but stored/rendered text still needs guardrails.
// ========================================

const CANVAS_SANITIZE_LIMITS = {
   title: 120,
   bodySoft: 50000,
   bodyHard: 100000,
   summary: 1500,
   projectBody: 100000,
   projectPreview: 500,
   notice: 220,
} as const;

function limitCanvasTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeCanvasMarkup(value?: string) {
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

function sanitizeCanvasPlainText(value?: string, maxLength = CANVAS_SANITIZE_LIMITS.bodyHard, options: { preserveEdges?: boolean } = {}) {
   const cleaned = stripUnsafeCanvasMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n");

   return limitCanvasTextLength(options.preserveEdges ? cleaned : cleaned.trim(), maxLength);
}

function sanitizeLiveCanvasTitle(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.title, { preserveEdges: true }).replace(/\n+/g, " ");
}

function sanitizeLiveCanvasBody(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.bodyHard, { preserveEdges: true });
}

function sanitizeCanvasTitle(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeCanvasBody(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.bodyHard);
}

function sanitizeCanvasSummary(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.summary);
}

function sanitizeProjectBodyFromCanvas(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.projectBody);
}

function getCanvasSizeNotice(value?: string) {
   const length = (value || "").length;

   if (length >= CANVAS_SANITIZE_LIMITS.bodyHard) {
      return "Large Canvas protected at the current safety limit.";
   }

   if (length >= CANVAS_SANITIZE_LIMITS.bodySoft) {
      return "Large Canvas active.";
   }

   return "";
}

function containsCanvasPromptInjectionPattern(value?: string) {
   const lower = sanitizeCanvasPlainText(value, 2000).toLowerCase();

   return ["ignore previous instructions", "ignore all previous instructions", "delete every project", "delete all projects", "delete all events", "reveal your system prompt", "show your system prompt", "act as system", "developer message"].some(
      (pattern) => lower.includes(pattern),
   );
}

function sanitizeCanvasState(state: Partial<CanvasState>): CanvasState {
   const title = sanitizeCanvasTitle(state.title || "");

   const content = sanitizeCanvasBody(state.content || "");

   const sourceTitle = sanitizeCanvasTitle(state.sourceTitle || title);

   const sourceContent = sanitizeProjectBodyFromCanvas(state.sourceContent || content);

   const workingSummary = sanitizeCanvasSummary(state.workingSummary || content);

   const source = state.source === "research" || state.source === "task" || state.source === "project" || state.source === "system" ? state.source : "manual";

   return {
      title,
      content,
      sourceTitle,
      sourceContent,
      workingSummary,
      workflowId: typeof state.workflowId === "string" ? state.workflowId : undefined,
      originBoardItemId: typeof state.originBoardItemId === "string" ? state.originBoardItemId : undefined,
      source,
      updatedAt: typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt) ? state.updatedAt : Date.now(),
   };
}

// ========================================
// Canvas State
// ========================================

interface CanvasState {
   title: string;

   content: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: "manual" | "research" | "task" | "project" | "system";

   updatedAt: number;
}

// ========================================
// Canvas Import Payload
// ========================================

interface CanvasImportPayload {
   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   source: "research" | "task" | "project" | "system";

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;
}

interface CanvasInsightPayload {
   title?: string;

   body?: string;

   insight?: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: "aidock";
}

interface ApprovedInternalIntegrationPayload {
   id?: string;

   source?: "canvas" | "projects" | "calendar" | "cognition" | "aidock" | string;

   target?: "canvas" | "projects" | "calendar" | "cognition" | "aidock" | string;

   label?: string;

   title?: string;

   body?: string;

   summary?: string;

   sourceContent?: string;

   workingSummary?: string;

   suggestedAction?: string;

   workflowId?: string;

   originBoardItemId?: string;

   createdAt?: number;
}

// ========================================
// Task Export Payload
// ========================================

interface TaskSavePayload {
   title: string;

   description?: string;

   workflowId?: string;

   originBoardItemId?: string;

   priority?: "low" | "medium" | "high";

   source: "canvas";

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;
}

// ========================================
// Integration Export Payload
// ========================================

interface IntegrationSavePayload {
   destination: "notes" | "calendar" | "tasks";

   objectType: "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review";

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   source: "canvas";

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;
}

// ========================================
// Workflow Mode
// ========================================

type CanvasWorkflowMode = "balanced" | "planning" | "research" | "creative" | "deep-focus";

// ========================================
// Initial Canvas
// ========================================

function getInitialCanvas(): CanvasState {
   return {
      title: "",

      content: "",

      sourceTitle: "",

      sourceContent: "",

      workingSummary: "",

      source: "manual",

      updatedAt: Date.now(),
   };
}

// ========================================
// Text Helpers
// ========================================

function stripExistingAllevinInsight(value?: string) {
   return cleanText(value)
      .replace(/\n*ALLEVIN Insight\n[\s\S]*$/i, "")
      .trim();
}

function normalizeDuplicateCanvasBlock(value?: string) {
   return cleanText(value)
      .toLowerCase()
      .replace(/^current focus:\s*/i, "")
      .replace(/next steps i[’']?m thinking about:/gi, "next steps:")
      .replace(/[•\-]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
}

function getDedupedCanvasContent(value?: string) {
   const clean = stripExistingAllevinInsight(value);

   if (!clean) {
      return "";
   }

   const blocks = clean
      .split(/\n{2,}/)
      .map((block) => cleanText(block))
      .filter(Boolean);

   const seen = new Set<string>();

   const dedupedBlocks: string[] = [];

   blocks.forEach((block) => {
      const key = normalizeDuplicateCanvasBlock(block);

      if (!key || seen.has(key)) {
         return;
      }

      seen.add(key);

      dedupedBlocks.push(block);
   });

   return dedupedBlocks.join("\n\n").trim();
}

function readStoredCanvasState() {
   if (typeof window === "undefined") {
      return null as CanvasState | null;
   }

   const stored = localStorage.getItem(STORAGE_KEY);

   if (!stored) {
      return null;
   }

   try {
      const parsed = JSON.parse(stored) as CanvasState;

      if (!parsed || typeof parsed !== "object") {
         return null;
      }

      return sanitizeCanvasState(parsed);
   } catch {
      return null;
   }
}

function buildCanvasContentWithInsight(baseContent?: string, insight?: string) {
   const cleanBase = getDedupedCanvasContent(baseContent);

   const cleanInsight = cleanText(insight);

   const insightBlock = cleanInsight ? `ALLEVIN Insight\n\n${cleanInsight}` : "";

   return [cleanBase, insightBlock].filter(Boolean).join("\n\n").trim();
}

function cleanText(value?: string) {
   return sanitizeCanvasPlainText(value).replace(/\r/g, "").trim();
}

function hasStructuredHandoffSections(value?: string) {
   const text = cleanText(value).toLowerCase();

   return text.includes("focus:") && text.includes("useful context:") && text.includes("next step:");
}

function getStructuredTaskHandoffBody(payload: CanvasImportPayload) {
   const body = cleanText(payload.body);
   const sourceContent = cleanText(payload.sourceContent);
   const workingSummary = cleanText(payload.workingSummary);
   const cleanSourceContent = cleanText(payload.cleanSourceContent);

   const structuredCandidates = [body, sourceContent, workingSummary, cleanSourceContent];

   for (const candidate of structuredCandidates) {
      if (hasStructuredHandoffSections(candidate)) {
         return removeDocumentMetadata(candidate);
      }
   }

   return "";
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function getDocumentSection(text: string, label: string) {
   const clean = cleanText(text);

   if (!clean) {
      return "";
   }

   const pattern = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:Focus|Useful Context|Next Step|Current Location|Status|Stage|Latest Movement|Project Notes|ALLEVIN Recommendation|Recommended Move|Destination|Confidence|Risk|Reason|Projects|Summary|Title|Primary Content|Current Working View|Working Summary|Workflow Metadata|Source|Lane|Priority|Current board status)\\s*:|$)`,
      "i",
   );

   const match = clean.match(pattern);

   return cleanText(match?.[1]);
}

function removeDocumentMetadata(value?: string) {
   const text = cleanText(value);

   if (!text) {
      return "";
   }

   const primaryContent = getDocumentSection(text, "Primary Content");

   if (primaryContent) {
      return primaryContent;
   }

   const focusContent = getDocumentSection(text, "Focus");

   if (focusContent) {
      return focusContent;
   }

   const lines = text.split("\n");

   const visibleLines: string[] = [];

   let skippingMetadataBlock = false;

   const blockLabelsToRemove = [
      "useful context",
      "next step",
      "current location",
      "status",
      "stage",
      "latest movement",
      "project notes",
      "allevin recommendation",
      "recommended move",
      "destination",
      "confidence",
      "risk",
      "reason",
      "workflow control",
      "summary",
      "workflow metadata",
      "source",
      "lane",
      "priority",
      "current board status",
      "current working view",
      "working summary",
   ];

   for (const line of lines) {
      const trimmed = line.trim();

      const lower = trimmed.toLowerCase().replace(/:$/, "");

      if (blockLabelsToRemove.includes(lower)) {
         skippingMetadataBlock = true;

         continue;
      }

      if (lower === "title" || lower.startsWith("title:")) {
         continue;
      }

      if (lower === "primary content") {
         skippingMetadataBlock = false;

         continue;
      }

      if (/^[A-Z][A-Za-z\s]+:$/.test(trimmed) && blockLabelsToRemove.includes(lower)) {
         skippingMetadataBlock = true;

         continue;
      }

      if (skippingMetadataBlock) {
         if (!trimmed) {
            skippingMetadataBlock = false;
         }

         continue;
      }

      if (
         lower.startsWith("project:") ||
         lower.startsWith("current stage:") ||
         lower.startsWith("current location:") ||
         lower.startsWith("priority:") ||
         lower.startsWith("calendar time:") ||
         lower.startsWith("location:") ||
         lower.startsWith("context confidence:") ||
         lower.startsWith("recent update:") ||
         lower.startsWith("board context:") ||
         lower.startsWith("calendar context:") ||
         lower.startsWith("allevin note:")
      ) {
         continue;
      }

      visibleLines.push(line);
   }

   return cleanText(visibleLines.join("\n"));
}

function getPlainCanvasDocument(payload: CanvasImportPayload) {
   const candidates = [payload.cleanSourceContent, payload.sourceContent, payload.workingSummary, payload.body];

   for (const candidate of candidates) {
      const cleaned = removeDocumentMetadata(candidate);

      if (cleaned && !isBadContentCandidate(cleaned)) {
         return cleaned;
      }
   }

   return removeDocumentMetadata(payload.body) || compactText(payload.title) || "";
}

function normalizeProjectTitle(value?: string) {
   let cleanValue = compactText(value);

   if (!cleanValue) {
      return "";
   }

   const titleLabelMatch = cleanValue.match(/^title:\s*(.+)$/i);

   if (titleLabelMatch?.[1]) {
      cleanValue = compactText(titleLabelMatch[1]);
   }

   const prefixes = [
      /^continue\s+active\s+thread\s*:\s*/i,
      /^continue\s+active\s+workflow\s*:\s*/i,
      /^continue\s+active\s+project\s*:\s*/i,
      /^active\s+thread\s*:\s*/i,
      /^thread\s*:\s*/i,
      /^resume\s*:\s*/i,
      /^resume\s+in\s+canvas\s*:\s*/i,
      /^follow\s*up\s*:\s*/i,
      /^task\s*:\s*/i,
      /^create\s+task\s*:\s*/i,
      /^project\s*:\s*/i,
      /^canvas\s*:\s*/i,
   ];

   let changed = true;

   while (changed) {
      changed = false;

      for (const prefix of prefixes) {
         if (prefix.test(cleanValue)) {
            cleanValue = compactText(cleanValue.replace(prefix, ""));

            changed = true;
         }
      }
   }

   return cleanValue;
}

function getStableWorkflowId(canvas: CanvasState) {
   return createStableWorkflowId(canvas.sourceTitle || canvas.title, canvas.workflowId || canvas.originBoardItemId);
}

function buildProjectContinuityMetadata(canvas: CanvasState, cleanTitle: string) {
   const cleanContent = cleanText(canvas.content);

   const cleanSource = cleanText(canvas.sourceContent) || cleanContent;

   return {
      sourceTitle: cleanTitle,
      sourceContent: cleanSource,
      workingSummary: cleanContent || canvas.workingSummary || cleanSource,
      cleanSourceContent: cleanContent || cleanSource,
   };
}

function getFullCanvasDocument(canvas: CanvasState) {
   return cleanText(canvas.content) || cleanText(canvas.sourceContent) || cleanText(canvas.workingSummary);
}

function truncate(value: string, limit = 120) {
   return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function getLines(value?: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
}

function getFreshWorkflowId() {
   return crypto.randomUUID();
}

function isImportedThread(canvas: CanvasState) {
   return Boolean(canvas.workflowId) || canvas.source !== "manual";
}

function shouldDetachManualTitleEdit({
   currentCanvas,
   nextTitle,
}: {
   currentCanvas: CanvasState;

   nextTitle: string;
}) {
   const currentTitle = compactText(currentCanvas.title);

   const incomingTitle = compactText(nextTitle);

   if (!incomingTitle) {
      return false;
   }

   if (!isImportedThread(currentCanvas)) {
      return false;
   }

   if (!currentTitle) {
      return true;
   }

   return currentTitle !== incomingTitle;
}

function createManualCanvasFromEdit({
   title,
   content,
}: {
   title: string;

   content: string;
}): CanvasState {
   const cleanTitle = sanitizeCanvasTitle(cleanProjectTitle(title) || normalizeProjectTitle(title) || title);

   return {
      title: cleanTitle,

      content: sanitizeCanvasBody(content),

      sourceTitle: cleanTitle,

      sourceContent: sanitizeProjectBodyFromCanvas(content),

      workingSummary: sanitizeCanvasSummary(content),

      source: "manual",

      updatedAt: Date.now(),
   };
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
            lower === "current working view:" ||
            lower === "working summary:" ||
            lower === "workflow metadata:" ||
            lower === "source title:" ||
            lower === "source content:" ||
            lower === "original source content:" ||
            lower === "canvas title:" ||
            lower === "canvas context:" ||
            lower === "description:" ||
            lower === "lane:" ||
            lower === "priority:" ||
            lower === "next step:" ||
            lower === "useful context:" ||
            lower === "movement:" ||
            lower === "context:" ||
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

   const regexMatch = text.match(/(?:^|\n)\s*primary content:\s*\n?([\s\S]*?)(?=\n\s*(?:lane|priority|next step|useful context|current board status|working summary|current working view|source|title|focus):|$)/i);

   if (regexMatch?.[1]) {
      const extracted = cleanText(regexMatch[1]);

      if (extracted) {
         return extracted;
      }
   }

   const lines = getLines(text);

   const contentLines: string[] = [];

   let collecting = false;

   for (const line of lines) {
      const lower = line.toLowerCase();

      if (lower === "primary content:") {
         collecting = true;

         continue;
      }

      if (lower.startsWith("primary content:")) {
         const inlineValue = line.slice("primary content:".length).trim();

         if (inlineValue) {
            contentLines.push(inlineValue);
         }

         collecting = true;

         continue;
      }

      if (collecting) {
         const shouldStop =
            lower === "lane:" ||
            lower === "priority:" ||
            lower === "next step:" ||
            lower === "useful context:" ||
            lower === "current board status:" ||
            lower === "working summary:" ||
            lower === "current working view:" ||
            lower === "source:" ||
            lower.startsWith("lane:") ||
            lower.startsWith("priority:") ||
            lower.startsWith("next step:") ||
            lower.startsWith("useful context:") ||
            lower.startsWith("current board status:") ||
            lower.startsWith("working summary:") ||
            lower.startsWith("current working view:") ||
            lower.startsWith("source:");

         if (shouldStop) {
            break;
         }

         if (!isStructuralLine(line)) {
            contentLines.push(line);
         }
      }
   }

   return contentLines.join("\n").trim();
}

function getPrimaryContentFromText(text?: string) {
   if (!text) return "";

   const directBlock = extractPrimaryContentBlock(text);

   if (directBlock) {
      return directBlock;
   }

   const section = getSectionAfterLabel(text, "Primary Content");

   if (section) {
      const lines = getLines(section).filter((line) => !isStructuralLine(line));

      return lines.join("\n").trim();
   }

   return "";
}

function removeTitleBlockFromBody(body: string, title: string) {
   const lines = getLines(body);

   if (!lines.length) {
      return "";
   }

   const filtered = lines.filter((line, index) => {
      const lower = line.toLowerCase();

      if (lower === "title:" || lower.startsWith("title:")) {
         return false;
      }

      if (title && line === title) {
         const previousLine = lines[index - 1]?.toLowerCase();

         return previousLine !== "title:";
      }

      return true;
   });

   return filtered.join("\n").trim();
}

function isGenericCanvasTitle(title?: string) {
   const lower = compactText(title).toLowerCase();

   if (!lower) {
      return true;
   }

   const genericTitles = [
      "workflow check",
      "allevin signal check",
      "continue active workflow",
      "continue active allevin thread",
      "allevin mk iii workflow continuation",
      "allevin mk iii active project continuation",
      "allevin mk iii workflow review",
      "allevin mk iii signal check",
      "project work item",
      "board item completed",
      "workflow signal",
      "task routed to board",
      "task generated from canvas",
      "task created",
      "active allevin project",
      "active project prepared for canvas",
      "title:",
   ];

   return genericTitles.some((genericTitle) => lower.includes(genericTitle));
}

function isBadContentCandidate(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   return isStructuralLine(lower) || lower === "title:" || lower === "title" || lower === "description:" || lower === "primary content:" || isGenericCanvasTitle(lower);
}

function containsStructuredPayload(value?: string) {
   const lower = (value || "").toLowerCase();

   return lower.includes("primary content:") || lower.includes("current working view:") || lower.includes("working summary:") || lower.includes("next step:") || lower.includes("lane:") || lower.includes("priority:") || lower.includes("useful context:");
}

function extractCleanFocusContent(value?: string) {
   const text = cleanText(value);

   if (!text) return "";

   const primaryContent = extractPrimaryContentBlock(text);

   if (primaryContent && !isBadContentCandidate(primaryContent)) {
      return cleanText(primaryContent);
   }

   const focusMatch = text.match(/(?:^|\n)\s*focus:\s*\n?([\s\S]*?)(?=\n\s*(?:useful context|next step):|$)/i);

   if (focusMatch?.[1]) {
      const focusContent = cleanText(focusMatch[1]);

      const nestedPrimary = extractPrimaryContentBlock(focusContent);

      if (nestedPrimary && !isBadContentCandidate(nestedPrimary)) {
         return cleanText(nestedPrimary);
      }

      const focusLines = getLines(focusContent).filter((line) => {
         const lower = line.toLowerCase();

         return (
            !isStructuralLine(line) &&
            !lower.startsWith("title:") &&
            !lower.startsWith("primary content:") &&
            !lower.startsWith("lane:") &&
            !lower.startsWith("priority:") &&
            !lower.startsWith("next step:") &&
            !lower.startsWith("useful context:") &&
            !lower.startsWith("current board status:")
         );
      });

      const cleanedFocus = focusLines.join("\n").trim();

      if (cleanedFocus && !isBadContentCandidate(cleanedFocus)) {
         return cleanedFocus;
      }
   }

   const sectionPrimary = getPrimaryContentFromText(text) || getSectionAfterLabel(text, "Primary Content");

   if (sectionPrimary && !isBadContentCandidate(sectionPrimary)) {
      return cleanText(sectionPrimary);
   }

   const lines = getLines(text);

   const cleanedLines: string[] = [];

   let skipNextLine = false;

   for (const line of lines) {
      const lower = line.toLowerCase();

      if (
         lower === "title:" ||
         lower === "primary content:" ||
         lower === "lane:" ||
         lower === "priority:" ||
         lower === "next step:" ||
         lower === "useful context:" ||
         lower === "current board status:" ||
         lower === "working summary:" ||
         lower === "current working view:"
      ) {
         skipNextLine = lower === "title:";

         continue;
      }

      if (
         lower.startsWith("title:") ||
         lower.startsWith("primary content:") ||
         lower.startsWith("lane:") ||
         lower.startsWith("priority:") ||
         lower.startsWith("next step:") ||
         lower.startsWith("useful context:") ||
         lower.startsWith("current board status:") ||
         lower.startsWith("working summary:") ||
         lower.startsWith("current working view:")
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

function isGenericNextStep(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   const genericPhrases = ["refine the original work, continue the draft, or save it to Projects", "review this project item", "choose the next useful move", "continue the draft"];

   return genericPhrases.some((phrase) => lower.includes(phrase));
}

function mergeUsefulContextLines(lines: Array<string | null | undefined>) {
   const seen = new Set<string>();

   return lines
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line) => {
         const key = line.toLowerCase();

         if (seen.has(key)) {
            return false;
         }

         seen.add(key);

         return true;
      })
      .join("\n");
}

function sanitizeProjectVisibleContent(value: string, payload: CanvasImportPayload) {
   const sourceText = cleanText(payload.body) || cleanText(value);

   const existingFocus = extractCleanFocusContent(sourceText) || extractCleanFocusContent(value);

   const existingUsefulContext = getSectionAfterLabel(sourceText, "Useful Context") || getSectionAfterLabel(value, "Useful Context");

   const existingNextStep = getSectionAfterLabel(sourceText, "Next Step") || getSectionAfterLabel(value, "Next Step");

   const possiblePrimaryContent = [
      existingFocus,
      extractCleanFocusContent(payload.cleanSourceContent),
      extractCleanFocusContent(payload.sourceContent),
      extractCleanFocusContent(payload.body),
      extractCleanFocusContent(value),
      getPrimaryContentFromText(value),
      getPrimaryContentFromText(payload.body),
      getSectionAfterLabel(value, "Primary Content"),
      getSectionAfterLabel(payload.body || "", "Primary Content"),
   ]
      .map((item) => cleanText(item))
      .find((item) => {
         if (!item || isBadContentCandidate(item)) return false;

         const lower = item.toLowerCase();

         return !lower.includes("\nlane:") && !lower.includes("\npriority:") && !lower.includes("\nnext step:") && !lower.includes("\nuseful context:") && !lower.startsWith("primary content:");
      });

   const lane = getValueAfterLabel(sourceText, "Current board status") || getValueAfterLabel(value, "Current board status") || getValueAfterLabel(sourceText, "Lane") || getValueAfterLabel(value, "Lane");

   const priority = getValueAfterLabel(sourceText, "Priority") || getValueAfterLabel(value, "Priority") || "medium";

   const title = getBestIncomingTitle(payload);

   const focus = possiblePrimaryContent || title || "Review this project item.";

   const boardStatus = payload.source === "project" ? "In Progress" : lane;

   const usefulContext = mergeUsefulContextLines([
      title ? `Project: ${title}` : null,
      boardStatus ? `Current board status: ${boardStatus}` : null,
      priority ? `Priority: ${priority}` : null,
      payload.source === "project" ? "Board context: This work came from the Project Board and is now being continued in Canvas." : null,
      payload.source === "project" ? "Latest update: ALLEVIN is treating the newest Board edit as the current project version." : null,
      existingUsefulContext,
   ]);

   const nextStep =
      existingNextStep && !isGenericNextStep(existingNextStep)
         ? existingNextStep
         : payload.source === "project"
           ? "Continue developing the latest Board update in Canvas. When the work is ready, send it to Tasks, move it forward on the Board, or save it to Projects."
           : "Review the latest content, make any needed edits, then choose the next useful move.";

   return [`Focus:\n${focus}`, usefulContext ? `Useful Context:\n${usefulContext}` : "", `Next Step:\n${nextStep}`].filter(Boolean).join("\n\n").trim();
}

function getPriorityFromPayload(payload: CanvasImportPayload): "low" | "medium" | "high" {
   const searchText = `${payload.body || ""}\n${payload.sourceContent || ""}\n${payload.workingSummary || ""}`;

   const priority = (getValueAfterLabel(searchText, "Priority") || "medium").toLowerCase();

   if (priority.includes("high")) return "high";

   if (priority.includes("low")) return "low";

   return "medium";
}

function buildBoardProjectCanvasImport(payload: CanvasImportPayload) {
   // Canvas should feel like a document.
   // Keep metadata in memory, but only place the latest project text on the page.
   return getPlainCanvasDocument(payload) || getBestIncomingTitle(payload);
}

function isSystemCanvasPayload(payload: CanvasImportPayload) {
   const searchable = `${payload.title}\n${payload.body}`.toLowerCase();

   return (
      payload.source === "system" ||
      searchable.includes("allevin mk iii workflow continuation") ||
      searchable.includes("allevin mk iii active project continuation") ||
      searchable.includes("allevin mk iii workflow review") ||
      searchable.includes("allevin mk iii signal check") ||
      searchable.includes("workflow intel prepared") ||
      searchable.includes("workflow review prepared") ||
      searchable.includes("latest movement:") ||
      searchable.includes("operating state:") ||
      searchable.includes("cognitive load:") ||
      searchable.includes("recommended move:") ||
      searchable.includes("suggested destination:")
   );
}

function getBestIncomingTitle(payload: CanvasImportPayload) {
   const body = payload.body || "";

   const titleFromBody = getValueAfterLabel(body, "Title");

   const threadFromBody = getValueAfterLabel(body, "Thread");

   const activeThreadFromBody = getValueAfterLabel(body, "Active Thread");

   const sourceTitleFromBody = getValueAfterLabel(body, "Source Title");

   const canvasTitleFromBody = getValueAfterLabel(body, "Canvas Title");

   const latestContextFromBody = getValueAfterLabel(body, "Latest Context");

   const titleCandidates = [payload.sourceTitle, payload.title, titleFromBody, sourceTitleFromBody, canvasTitleFromBody, threadFromBody, activeThreadFromBody, latestContextFromBody]
      .map((candidate) => normalizeProjectTitle(candidate))
      .filter(Boolean)
      .filter((candidate) => !isGenericCanvasTitle(candidate));

   const bestTitle = titleCandidates[0];

   if (bestTitle) {
      return truncate(bestTitle, 120);
   }

   const firstUsefulLine = getLines(body).find((line) => {
      const lower = line.toLowerCase();

      return (
         line.length > 8 &&
         !lower.endsWith(":") &&
         !lower.includes("allevin mk ii") &&
         !lower.includes("latest movement") &&
         !lower.includes("operating state") &&
         !lower.includes("cognitive load") &&
         !lower.includes("recommended move") &&
         !lower.includes("suggested destination") &&
         !lower.includes("workflow intel prepared")
      );
   });

   if (firstUsefulLine) {
      return truncate(normalizeProjectTitle(firstUsefulLine) || firstUsefulLine, 120);
   }

   return "Focused Canvas Work";
}

function extractSourceContentFromPayload(payload: CanvasImportPayload) {
   const cleanSourceFromPayload = extractCleanFocusContent(payload.cleanSourceContent);

   if (cleanSourceFromPayload && !isBadContentCandidate(cleanSourceFromPayload)) {
      return cleanText(cleanSourceFromPayload);
   }

   const structuredPayloadSource = extractCleanFocusContent(payload.sourceContent);

   if (structuredPayloadSource && !isBadContentCandidate(structuredPayloadSource)) {
      return cleanText(structuredPayloadSource);
   }

   if (payload.sourceContent?.trim() && !containsStructuredPayload(payload.sourceContent)) {
      return cleanText(payload.sourceContent);
   }

   const body = payload.body || "";

   const primaryContent =
      extractCleanFocusContent(body) ||
      extractCleanFocusContent(getSectionAfterLabel(body, "Description")) ||
      getPrimaryContentFromText(body) ||
      getPrimaryContentFromText(getSectionAfterLabel(body, "Description")) ||
      getSectionAfterLabel(body, "Primary Content");

   if (primaryContent && !isBadContentCandidate(primaryContent)) {
      return cleanText(primaryContent);
   }

   const originalSourceContent = getValueAfterLabel(body, "Original Source Content") || getValueAfterLabel(body, "Source Content");

   if (originalSourceContent && !isBadContentCandidate(originalSourceContent)) {
      return cleanText(originalSourceContent);
   }

   const canvasContext = getValueAfterLabel(body, "Canvas Context");

   if (canvasContext && !isBadContentCandidate(canvasContext)) {
      return cleanText(canvasContext);
   }

   const description = getValueAfterLabel(body, "Description");

   if (description && !isBadContentCandidate(description)) {
      return cleanText(description);
   }

   const content = getValueAfterLabel(body, "Content");

   if (content && !isBadContentCandidate(content)) {
      return cleanText(content);
   }

   return "";
}

function extractSourceTitleFromPayload(payload: CanvasImportPayload) {
   const body = payload.body || "";

   return normalizeProjectTitle(payload.sourceTitle) || normalizeProjectTitle(getValueAfterLabel(body, "Source Title")) || normalizeProjectTitle(getValueAfterLabel(body, "Canvas Title")) || getBestIncomingTitle(payload);
}

function cleanProjectCanvasContent(payload: CanvasImportPayload) {
   return getPlainCanvasDocument(payload) || getBestIncomingTitle(payload);
}

function cleanSystemCanvasContent(payload: CanvasImportPayload) {
   return getPlainCanvasDocument(payload) || getBestIncomingTitle(payload);
}

function cleanGeneralCanvasContent(payload: CanvasImportPayload) {
   return getPlainCanvasDocument(payload);
}

function buildFocusedCanvasImport(payload: CanvasImportPayload) {
   const title = getBestIncomingTitle(payload);

   const structuredTaskHandoff = getStructuredTaskHandoffBody(payload);

   if (structuredTaskHandoff) {
      return {
         title,

         content: structuredTaskHandoff,
      };
   }

   let content = "";

   if (payload.source === "project") {
      content = cleanProjectCanvasContent(payload);
   } else if (isSystemCanvasPayload(payload)) {
      content = cleanSystemCanvasContent(payload);
   } else {
      content = cleanGeneralCanvasContent(payload);
   }

   return {
      title,

      content: content || "",
   };
}

function normalizeInternalIntegrationDestination(destination?: string): IntegrationSavePayload["destination"] {
   const lower = (destination || "").toLowerCase();

   if (lower.includes("task")) {
      return "tasks";
   }

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("event")) {
      return "calendar";
   }

   return "notes";
}

function getInternalIntegrationDestinationLabel(destination: IntegrationSavePayload["destination"]) {
   switch (destination) {
      case "tasks":
         return "Tasks";

      case "calendar":
         return "Calendar";

      case "notes":
      default:
         return "Projects";
   }
}

function cleanInternalRecommendationText(value?: string) {
   return compactText(value)
      .replace(/Projects/gi, "Projects")
      .replace(/Project Note/gi, "Project Note")
      .replace(/Project Storage/gi, "Project Storage")
      .replace(/project/gi, "internal");
}

function getInternalIntegrationNextStep(destination: IntegrationSavePayload["destination"], fallback?: string) {
   const cleanFallback = cleanInternalRecommendationText(fallback);

   if (cleanFallback) {
      return cleanFallback;
   }

   if (destination === "tasks") {
      return "Create a task when this is ready to become a concrete next step.";
   }

   if (destination === "calendar") {
      return "Add this to Calendar when it needs time or scheduling.";
   }

   return "Save this to Projects when you want to keep it for later.";
}

function cleanInternalOutputBody(value?: string) {
   return cleanText(value)
      .replace(/Projects/gi, "Projects")
      .replace(/Project Note/gi, "Project Note")
      .replace(/Project Storage/gi, "Project Storage")
      .replace(/Project Storage/gi, "Project Storage")
      .replace(/project routes?/gi, "project routes")
      .replace(/project output/gi, "project output")
      .replace(/project tools?/gi, "internal ALLEVIN systems")
      .replace(/project routes?/gi, "project routes")
      .replace(/integration\/project/gi, "project")
      .replace(/project/gi, "project")
      .replace(/project/gi, "project")
      .replace(/before confirming/gi, "before saving inside ALLEVIN")
      .trim();
}

function readCanvasProjectLibrary() {
   if (typeof window === "undefined") {
      return [] as any[];
   }

   const stored = localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed : [];
   } catch {
      localStorage.removeItem(PROJECT_LIBRARY_STORAGE_KEY);

      return [];
   }
}

function getCanvasProjectLibraryKey({ workflowId, originBoardItemId, title }: { workflowId?: string; originBoardItemId?: string; title?: string }) {
   if (workflowId) {
      return `workflow:${workflowId}`;
   }

   if (originBoardItemId) {
      return `origin:${originBoardItemId}`;
   }

   const cleanTitle = cleanProjectTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

   return `title:${cleanTitle || "untitled-project"}`;
}

function saveCanvasProjectToLibrary({ title, body, summary, workflowId, originBoardItemId }: { title: string; body: string; summary: string; workflowId?: string; originBoardItemId?: string }) {
   if (typeof window === "undefined") {
      return;
   }

   const cleanTitle = sanitizeCanvasTitle(cleanProjectTitle(title) || normalizeProjectTitle(title) || "Untitled project");

   const cleanBody = sanitizeProjectBodyFromCanvas(body) || cleanTitle;

   const cleanSummary = sanitizeCanvasSummary(summary || cleanBody) || cleanTitle;

   const key = getCanvasProjectLibraryKey({
      workflowId,
      originBoardItemId,
      title: cleanTitle,
   });

   const current = readCanvasProjectLibrary();

   const existing = current.find((project) => project?.id === key);

   const note = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      body: cleanBody,
      summary: cleanSummary,
      source: "Projects",
      savedAt: Date.now(),
   };

   const nextProject = existing
      ? {
           ...existing,
           title: cleanTitle || existing.title,
           workflowId: workflowId || existing.workflowId,
           originBoardItemId: originBoardItemId || existing.originBoardItemId,
           latestSummary: cleanBody.length >= cleanSummary.length ? cleanBody : cleanSummary,
           latestMovement: "Saved to Projects",
           notes: [note, ...((existing.notes || []) as any[]).filter((existingNote) => existingNote?.id !== note.id)].slice(0, 30),
           updatedAt: Date.now(),
        }
      : {
           id: key,
           title: cleanTitle,
           workflowId,
           originBoardItemId,
           latestSummary: cleanBody.length >= cleanSummary.length ? cleanBody : cleanSummary,
           latestMovement: "Saved to Projects",
           notes: [note],
           createdAt: Date.now(),
           updatedAt: Date.now(),
        };

   localStorage.setItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify([nextProject, ...current.filter((project) => project?.id !== key)].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 80)));

   window.dispatchEvent(new CustomEvent("allevin-project-library-update"));

   window.dispatchEvent(
      new CustomEvent("allevin-project-note-saved", {
         detail: {
            title: cleanTitle,
            workflowId,
            originBoardItemId,
            noteId: note.id,
            savedAt: note.savedAt,
         },
      }),
   );
}

function buildCanonicalBody({
   title,
   sourceContent,
   visibleContent,
   workingSummary,
   includeWorkingContext = true,
}: {
   title: string;

   sourceContent?: string;

   visibleContent?: string;

   workingSummary?: string;

   includeWorkingContext?: boolean;
}) {
   const cleanSource = cleanText(sourceContent);

   const cleanVisible = cleanText(visibleContent);

   const cleanWorking = cleanText(workingSummary);

   const sections: string[] = [];

   sections.push(`Title:\n${sanitizeCanvasTitle(title || "Untitled Canvas Work")}`);

   if (cleanSource) {
      sections.push(`Primary Content:\n${cleanSource}`);
   } else if (cleanVisible) {
      sections.push(`Primary Content:\n${cleanVisible}`);
   }

   if (includeWorkingContext && cleanVisible && cleanSource && cleanVisible !== cleanSource) {
      sections.push(`Current Working View:\n${cleanVisible}`);
   }

   if (cleanWorking && cleanWorking !== cleanVisible) {
      sections.push(`Working Summary:\n${cleanWorking}`);
   }

   return sections.join("\n\n").trim();
}

// ========================================
// Component
// ========================================

function getHandledCanvasIntegrationIds() {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   try {
      const stored = sessionStorage.getItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY);

      const parsed = stored ? JSON.parse(stored) : [];

      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
   } catch {
      return [];
   }
}

function rememberHandledCanvasIntegrationId(id?: string) {
   if (typeof window === "undefined" || !id) {
      return;
   }

   const current = getHandledCanvasIntegrationIds();

   sessionStorage.setItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY, JSON.stringify([id, ...current.filter((item) => item !== id)].slice(0, 60)));
}

function hasHandledCanvasIntegrationId(id?: string) {
   if (!id) {
      return false;
   }

   return getHandledCanvasIntegrationIds().includes(id);
}

function buildCanvasContentFromApprovedIntegration(payload: ApprovedInternalIntegrationPayload) {
   const body = cleanText(payload.body || payload.sourceContent || payload.workingSummary || payload.summary);

   const action = cleanText(payload.suggestedAction);

   if (body && action && !body.toLowerCase().includes(action.toLowerCase())) {
      return `${body}\n\nNext:\n${action}`.trim();
   }

   return body || action || payload.title || "Canvas update";
}

function notifyAllevinFromCanvas(message: string, detail?: Record<string, unknown>) {
   if (typeof window === "undefined") {
      return;
   }

   window.dispatchEvent(
      new CustomEvent("allevin-chat-notice", {
         detail: {
            message,
            source: "canvas",
            ...detail,
            createdAt: Date.now(),
         },
      }),
   );
}

export default function AdaptiveWorkCanvas() {
   const workspace = useWorkspace();

   const { focusMode } = useFocus();

   const { currentEnvironment } = useEnvironment();

   const [mounted, setMounted] = useState(false);

   const [canvas, setCanvas] = useState<CanvasState>(getInitialCanvas());

   const liveCanvasRef = useRef<CanvasState>(getInitialCanvas());

   const [saved, setSaved] = useState(false);

   const [saveNoticeText, setSaveNoticeText] = useState("");

   const [resetNotice, setResetNotice] = useState(false);

   const [importNotice, setImportNotice] = useState(false);

   const [exportNotice, setExportNotice] = useState(false);

   function syncCanvasStatus(status: "focused-work-active" | "integration-ready" | "workspace-stable" = "focused-work-active") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   // ========================================
   // Load Canvas
   // ========================================

   useEffect(() => {
      setMounted(true);

      const savedCanvas = localStorage.getItem(STORAGE_KEY);

      if (savedCanvas) {
         try {
            const parsedCanvas = JSON.parse(savedCanvas) as Partial<CanvasState>;

            const loadedCanvas = sanitizeCanvasState({
               title: parsedCanvas.title ?? "",

               content: parsedCanvas.content ?? "",

               sourceTitle: parsedCanvas.sourceTitle ?? parsedCanvas.title ?? "",

               sourceContent: parsedCanvas.sourceContent ?? parsedCanvas.content ?? "",

               workingSummary: parsedCanvas.workingSummary ?? "",

               workflowId: parsedCanvas.workflowId,

               originBoardItemId: parsedCanvas.originBoardItemId,

               source: parsedCanvas.source ?? "manual",

               updatedAt: parsedCanvas.updatedAt ?? Date.now(),
            });

            liveCanvasRef.current = loadedCanvas;

            setCanvas(loadedCanvas);

            syncCanvasStatus("focused-work-active");
         } catch {
            localStorage.removeItem(STORAGE_KEY);

            syncCanvasStatus("workspace-stable");
         }
      } else {
         syncCanvasStatus("workspace-stable");
      }
   }, []);

   useEffect(() => {
      liveCanvasRef.current = canvas;
   }, [canvas]);

   // ========================================
   // Save Canvas
   // ========================================

   function saveCanvas() {
      const cleanTitle = sanitizeCanvasTitle(normalizeProjectTitle(canvas.title) || canvas.title);

      const stableWorkflowId = canvas.title || canvas.content ? getStableWorkflowId(canvas) : undefined;

      const updated = sanitizeCanvasState({
         ...canvas,

         title: cleanTitle,

         content: canvas.content,

         sourceTitle: normalizeProjectTitle(canvas.sourceTitle) || cleanTitle,

         sourceContent: canvas.content || canvas.sourceContent,

         workingSummary: canvas.content || canvas.workingSummary,

         workflowId: stableWorkflowId,

         originBoardItemId: canvas.originBoardItemId || stableWorkflowId,

         updatedAt: Date.now(),
      });

      liveCanvasRef.current = updated;

      setCanvas(updated);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      if (updated.title || updated.content) {
         upsertProjectMemory({
            title: updated.title,
            body: sanitizeProjectBodyFromCanvas(updated.content),
            sourceTitle: updated.sourceTitle || updated.title,
            sourceContent: sanitizeProjectBodyFromCanvas(updated.sourceContent || updated.content),
            workingSummary: sanitizeCanvasSummary(updated.workingSummary || updated.content),
            workflowId: updated.workflowId,
            originBoardItemId: updated.originBoardItemId,
            source: "canvas",
            destination: "canvas",
            stage: "drafting",
            status: "active",
            priority: "medium",
            latestMovement: "canvas → canvas",
         });
      }

      if (updated.workflowId && (updated.title || updated.content)) {
         window.dispatchEvent(
            new CustomEvent("allevin-log-workflow-event", {
               detail: {
                  id: crypto.randomUUID(),
                  type: "insight",
                  source: "canvas",
                  destination: "canvas",
                  title: updated.title || "Untitled Canvas Work",
                  summary: sanitizeCanvasSummary(`Canvas updated. ${updated.content || updated.workingSummary || ""}`),
                  sourceTitle: updated.title,
                  sourceContent: sanitizeProjectBodyFromCanvas(updated.sourceContent || updated.content),
                  workingSummary: sanitizeCanvasSummary(updated.workingSummary || updated.content),
                  cleanSourceContent: sanitizeProjectBodyFromCanvas(updated.sourceContent || updated.content),
                  workflowId: updated.workflowId,
                  originBoardItemId: updated.originBoardItemId,
                  createdAt: Date.now(),
               },
            }),
         );
      }

      syncCanvasStatus("focused-work-active");

      const injectionLikeContent = containsCanvasPromptInjectionPattern(updated.content);

      const savedMessage = `Saved "${updated.title || "Untitled Canvas"}" in Canvas.${injectionLikeContent ? " I treated instruction-like pasted text as Canvas content only." : ""}`;

      setSaveNoticeText(savedMessage);

      notifyAllevinFromCanvas(savedMessage, {
         type: "canvas-saved",
         title: updated.title || "Untitled Canvas",
         workflowId: updated.workflowId,
         originBoardItemId: updated.originBoardItemId || updated.workflowId,
      });

      setSaved(true);

      setTimeout(() => {
         setSaved(false);

         setSaveNoticeText("");
      }, 1800);
   }

   // ========================================
   // Reset Canvas
   // ========================================

   function resetCanvas() {
      const freshCanvas = getInitialCanvas();

      localStorage.removeItem(STORAGE_KEY);

      setCanvas(freshCanvas);

      syncCanvasStatus("workspace-stable");

      setResetNotice(true);

      setTimeout(() => {
         setResetNotice(false);
      }, 1200);
   }

   // ========================================
   // Replace Canvas With Incoming Content
   // Purpose:
   // Visible Canvas is replaced, but original
   // thread source is preserved when possible.
   // ========================================

   function replaceCanvasWithImport(payload: CanvasImportPayload) {
      const isBoardProjectImport = payload.source === "project";

      const focusedImport = isBoardProjectImport
         ? {
              title: getBestIncomingTitle(payload),
              content: buildBoardProjectCanvasImport(payload),
           }
         : buildFocusedCanvasImport(payload);

      // Board → Canvas handoffs should preserve the smarter context generator output.
      // The older project sanitizer was useful for removing noisy board payloads,
      // but it also stripped the smarter MK III context back down to only Priority.
      const visibleContent = removeDocumentMetadata(focusedImport.content) || focusedImport.content;

      setCanvas((prev) => {
         const incomingSourceTitle = normalizeProjectTitle(extractSourceTitleFromPayload(payload) || focusedImport.title);

         const incomingSourceContent = getPlainCanvasDocument(payload) || visibleContent;

         // For Board → Canvas, the incoming project handoff is the newest source of truth.
         // Do not preserve the previous Canvas source over the latest Board edit.
         const shouldPreservePreviousSource = !isBoardProjectImport && Boolean(prev.sourceContent?.trim()) && Boolean(prev.workflowId) && Boolean(payload.workflowId) && prev.workflowId === payload.workflowId && payload.source === "system";

         const sourceTitle = shouldPreservePreviousSource ? prev.sourceTitle || incomingSourceTitle || focusedImport.title : incomingSourceTitle || focusedImport.title;

         const sourceContent = shouldPreservePreviousSource ? prev.sourceContent || incomingSourceContent || visibleContent : incomingSourceContent || visibleContent;

         const updatedCanvas: CanvasState = sanitizeCanvasState({
            title: normalizeProjectTitle(focusedImport.title) || focusedImport.title,

            content: visibleContent,

            sourceTitle: normalizeProjectTitle(sourceTitle) || sourceTitle,

            sourceContent,

            workingSummary: visibleContent,

            workflowId: payload.workflowId,

            originBoardItemId: payload.originBoardItemId,

            source: payload.source,

            updatedAt: Date.now(),
         });

         localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCanvas));

         upsertProjectMemory({
            title: updatedCanvas.title,
            body: updatedCanvas.content,
            sourceTitle: updatedCanvas.sourceTitle || updatedCanvas.title,
            sourceContent: updatedCanvas.sourceContent || updatedCanvas.content,
            workingSummary: updatedCanvas.workingSummary || updatedCanvas.content,
            workflowId: updatedCanvas.workflowId,
            originBoardItemId: updatedCanvas.originBoardItemId,
            source: updatedCanvas.source === "system" ? "system" : updatedCanvas.source === "research" ? "research" : updatedCanvas.source === "task" ? "task" : updatedCanvas.source === "project" ? "board" : "canvas",
            destination: "canvas",
            stage: "drafting",
            status: "active",
            priority: "medium",
            latestMovement: `${updatedCanvas.source || "system"} → canvas`,
         });

         return updatedCanvas;
      });

      syncCanvasStatus("focused-work-active");

      setImportNotice(true);

      setTimeout(() => {
         setImportNotice(false);
      }, 1200);
   }

   // ========================================
   // Intelligence
   // ========================================

   const memory = getMemory();

   // ========================================
   // Infer Workflow Mode
   // ========================================

   const workflowMode = useMemo<CanvasWorkflowMode>(() => {
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
   // Infer Task Priority
   // ========================================

   // ========================================
   // Extract Task Title From Canvas
   // ========================================

   function getTaskTitleFromCanvas() {
      const directTitle = cleanProjectTitle(canvas.sourceTitle || canvas.title) || normalizeProjectTitle(canvas.sourceTitle || canvas.title);

      if (directTitle && !isGenericCanvasTitle(directTitle)) {
         return truncate(directTitle, 90);
      }

      const contentLines = canvas.content
         .split("\n")
         .map((line) => line.trim())
         .filter(Boolean);

      const sourceTitle = normalizeProjectTitle(canvas.sourceTitle) && !isGenericCanvasTitle(canvas.sourceTitle) ? normalizeProjectTitle(canvas.sourceTitle) : "";

      if (sourceTitle) {
         return truncate(sourceTitle, 90);
      }

      const cleanCanvasTitle = normalizeProjectTitle(canvas.title);

      if (cleanCanvasTitle) {
         return truncate(cleanCanvasTitle, 90);
      }

      const structuralLabels = [
         "project work item",
         "research insight",
         "planning structure",
         "research structure",
         "balanced structure",
         "creative structure",
         "focus structure",
         "focus structure",
         "title:",
         "question:",
         "source:",
         "evidence:",
         "insight:",
         "description:",
         "focus:",
         "useful context:",
         "lane:",
         "priority:",
         "confidence:",
         "next step:",
      ];

      function isStructuralTaskLine(line: string) {
         const lower = line.toLowerCase();

         return structuralLabels.includes(lower) || lower.includes("start writing, planning, researching") || lower.includes("start writing inside allevin");
      }

      function getValueAfterLabels(labels: string[]) {
         for (let index = 0; index < contentLines.length; index++) {
            const currentLine = contentLines[index];

            const lower = currentLine.toLowerCase();

            for (const label of labels) {
               if (lower.startsWith(label)) {
                  const inlineValue = currentLine.slice(label.length).trim();

                  if (inlineValue && !isStructuralTaskLine(inlineValue)) {
                     return inlineValue;
                  }

                  for (let nextIndex = index + 1; nextIndex < contentLines.length; nextIndex++) {
                     const possibleValue = contentLines[nextIndex];

                     if (!isStructuralTaskLine(possibleValue)) {
                        return possibleValue;
                     }
                  }
               }
            }
         }

         return null;
      }

      const structuredTitle = getValueAfterLabels(["title:"]) || getValueAfterLabels(["focus:"]) || getValueAfterLabels(["question:"]) || getValueAfterLabels(["insight:"]) || getValueAfterLabels(["description:"]);

      if (structuredTitle) {
         return truncate(normalizeProjectTitle(structuredTitle) || structuredTitle, 90);
      }

      const firstUsefulLine = contentLines.find((line) => !isStructuralTaskLine(line));

      if (firstUsefulLine) {
         return truncate(normalizeProjectTitle(firstUsefulLine) || firstUsefulLine, 90);
      }

      return "Review canvas note";
   }

   // ========================================
   // Build Preserved Task Context
   // ========================================

   // ========================================
   // Send Canvas To Task System
   // ========================================

   // ========================================
   // Prepare Canvas Save
   // Canvas → Recommender → Integration Adapter Layer
   // Clears Canvas after save preparation
   // ========================================

   function prepareCanvasExport() {
      const title = sanitizeCanvasTitle(normalizeProjectTitle(canvas.sourceTitle) || normalizeProjectTitle(canvas.title) || getTaskTitleFromCanvas());

      const continuity = buildProjectContinuityMetadata(canvas, title);

      const sourceContent = sanitizeProjectBodyFromCanvas(continuity.cleanSourceContent || canvas.sourceContent || canvas.content);

      const visibleContent = sanitizeCanvasBody(canvas.content);

      const workflowId = getStableWorkflowId(canvas);

      if (!title && !sourceContent && !visibleContent) {
         return;
      }

      const body = buildCanonicalBody({
         title,

         sourceContent,

         visibleContent,

         workingSummary: canvas.workingSummary,

         includeWorkingContext: true,
      });

      const recommendation = recommendIntegrationDestination({
         title,

         body,

         source: "canvas",

         workflowMode,

         currentEnvironment,

         focusMode,

         workflowId,

         originBoardItemId: canvas.originBoardItemId || workflowId,
      });

      // The "Save to Projects" button should always save directly to Projects.
      // Recommendations can still help shape the next step, but they should not reroute
      // this button into Tasks/Calendar or any confirmation queue.
      const internalDestination = "notes" as IntegrationSavePayload["destination"];

      const internalSuggestedNextStep = getInternalIntegrationNextStep(internalDestination, recommendation.suggestedNextStep);

      const payload: IntegrationSavePayload = {
         destination: internalDestination,

         objectType: "project-summary",

         title: sanitizeCanvasTitle(canvas.title.trim() || "Untitled Canvas Output"),

         body: cleanInternalOutputBody(sanitizeProjectBodyFromCanvas(canvas.content)),

         workflowId,

         originBoardItemId: canvas.originBoardItemId || workflowId,

         source: "canvas",

         sourceTitle: sanitizeCanvasTitle(canvas.title.trim() || "Untitled Canvas"),

         sourceContent: sanitizeProjectBodyFromCanvas(canvas.content),

         cleanSourceContent: sanitizeProjectBodyFromCanvas(canvas.content),

         workingSummary: sanitizeCanvasSummary(canvas.workingSummary || canvas.content),

         recommendation: {
            ...recommendation,
            destination: internalDestination,
            objectType: "project-summary",
            reason: "This Canvas content is ready to be saved to Projects.",
            suggestedNextStep: "Save this to Projects when you want to keep it for later.",
         },
      };

      upsertProjectMemory({
         title: title || "Canvas Projects",
         body: sourceContent || visibleContent,
         sourceTitle: continuity.sourceTitle,
         sourceContent,
         workingSummary: continuity.workingSummary || visibleContent,
         workflowId,
         originBoardItemId: canvas.originBoardItemId || workflowId,
         source: "canvas",
         destination: "integrations",
         stage: "preserved",
         status: "active",
         priority: "medium",
         latestMovement: "canvas → project",
         recommendedNextAction: internalSuggestedNextStep,
      });

      // Direct save first so the project exists in Projects before Canvas clears.
      saveCanvasProjectToLibrary({
         title: payload.sourceTitle || payload.title,
         body: payload.body || sourceContent || visibleContent,
         summary: payload.workingSummary || payload.body || sourceContent || visibleContent,
         workflowId,
         originBoardItemId: payload.originBoardItemId,
      });

      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-prepare-integration", {
               detail: {
                  ...payload,
                  alreadySavedToProjects: true,
               },
            }),
         );

         window.dispatchEvent(
            new CustomEvent("allevin-chat-notice", {
               detail: {
                  message: `Saved "${payload.sourceTitle || payload.title}" to Projects.`,
                  type: "project-saved",
                  title: payload.sourceTitle || payload.title,
                  workflowId,
                  originBoardItemId: payload.originBoardItemId,
                  createdAt: Date.now(),
               },
            }),
         );
      }, 0);

      const freshCanvas = getInitialCanvas();

      localStorage.removeItem(STORAGE_KEY);

      setCanvas(freshCanvas);

      syncCanvasStatus("integration-ready");

      setExportNotice(true);

      setTimeout(() => {
         setExportNotice(false);
      }, 1200);
   }

   // ========================================
   // Auto Save
   // ========================================

   useEffect(() => {
      if (!mounted) return;

      const timer = setTimeout(() => {
         localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
               ...canvas,

               title: sanitizeCanvasTitle(normalizeProjectTitle(canvas.title) || canvas.title),

               content: sanitizeCanvasBody(canvas.content),

               sourceTitle: sanitizeCanvasTitle(normalizeProjectTitle(canvas.sourceTitle) || normalizeProjectTitle(canvas.title) || canvas.sourceTitle),

               sourceContent: sanitizeProjectBodyFromCanvas(canvas.content || canvas.sourceContent),

               workingSummary: sanitizeCanvasSummary(canvas.content || canvas.workingSummary),

               updatedAt: Date.now(),
            }),
         );
      }, 800);

      return () => clearTimeout(timer);
   }, [canvas, mounted]);

   // ========================================
   // Pipeline Advancement Cleanup
   // Option 3:
   // Archive the previous active Canvas stage after
   // an approved Canvas → Task movement.
   // This keeps Calm/project memory intact while
   // preventing Canvas from continuing to look like
   // the active source after the pipeline advances.
   // ========================================

   function isSameWorkflowOrTitle({
      currentCanvas,
      incomingWorkflowId,
      incomingOriginBoardItemId,
      incomingTitle,
   }: {
      currentCanvas: CanvasState;

      incomingWorkflowId?: string;

      incomingOriginBoardItemId?: string;

      incomingTitle?: string;
   }) {
      const currentWorkflowId = currentCanvas.workflowId ? getStableWorkflowId(currentCanvas) : "";

      const currentOriginBoardItemId = currentCanvas.originBoardItemId || "";

      const currentTitleKey = normalizeProjectTitle(currentCanvas.sourceTitle || currentCanvas.title).toLowerCase();

      const incomingTitleKey = normalizeProjectTitle(incomingTitle).toLowerCase();

      if (incomingWorkflowId && currentWorkflowId && incomingWorkflowId === currentWorkflowId) {
         return true;
      }

      if (incomingOriginBoardItemId && currentOriginBoardItemId && incomingOriginBoardItemId === currentOriginBoardItemId) {
         return true;
      }

      return Boolean(currentTitleKey && incomingTitleKey && currentTitleKey === incomingTitleKey);
   }

   function addInsightToCanvas(payload: CanvasInsightPayload) {
      const liveCanvas = liveCanvasRef.current;

      const storedCanvas = readStoredCanvasState();

      const workingCanvas = liveCanvas?.content || liveCanvas?.title ? liveCanvas : storedCanvas || canvas;

      const title = normalizeProjectTitle(payload.title) || payload.title || workingCanvas?.title || "Canvas Insight";

      const insight = cleanText(payload.insight);

      const currentEditorContent = cleanText(workingCanvas?.content);

      const currentSourceContent = cleanText(workingCanvas?.sourceContent);

      const incomingBody = cleanText(payload.body);

      // Preserve what the user currently sees in the editor first.
      // Only use source/localStorage/incoming content when the visible editor is empty.
      const baseContent = currentEditorContent || currentSourceContent || incomingBody;

      const content = buildCanvasContentWithInsight(baseContent, insight) || title;

      const workflowId = payload.workflowId || workingCanvas?.workflowId || createStableWorkflowId(title);

      const originBoardItemId = payload.originBoardItemId || workingCanvas?.originBoardItemId || workflowId;

      const updatedCanvas: CanvasState = sanitizeCanvasState({
         ...(workingCanvas || getInitialCanvas()),
         title,
         content,
         sourceTitle: title,
         sourceContent: content,
         workingSummary: content,
         workflowId,
         originBoardItemId,
         source: "system",
         updatedAt: Date.now(),
      });

      liveCanvasRef.current = updatedCanvas;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCanvas));

      setCanvas(updatedCanvas);

      upsertProjectMemory({
         title,
         body: content,
         sourceTitle: title,
         sourceContent: content,
         workingSummary: content,
         workflowId,
         originBoardItemId,
         source: "canvas",
         destination: "canvas",
         stage: "drafting",
         status: "active",
         priority: "medium",
         latestMovement: "aidock → canvas",
         recommendedNextAction: "Refine the added insight, then turn the clearest next step into a task.",
      });

      syncCanvasStatus("focused-work-active");

      setImportNotice(true);

      setTimeout(() => {
         setImportNotice(false);
      }, 1200);
   }

   function applyApprovedIntegrationToCanvas(payload: ApprovedInternalIntegrationPayload) {
      if (payload.id && hasHandledCanvasIntegrationId(payload.id)) {
         return;
      }

      if (!payload.title && !payload.body && !payload.summary && !payload.sourceContent && !payload.suggestedAction) {
         return;
      }

      rememberHandledCanvasIntegrationId(payload.id);

      const workingCanvas = liveCanvasRef.current?.title || liveCanvasRef.current?.content ? liveCanvasRef.current : readStoredCanvasState() || canvas;

      const title = normalizeProjectTitle(payload.title) || payload.title || workingCanvas?.title || "Canvas Update";

      const content = buildCanvasContentFromApprovedIntegration(payload);

      const workflowId = payload.workflowId || workingCanvas?.workflowId || createStableWorkflowId(title);

      const originBoardItemId = payload.originBoardItemId || workingCanvas?.originBoardItemId || workflowId;

      const updatedCanvas: CanvasState = sanitizeCanvasState({
         ...(workingCanvas || getInitialCanvas()),
         title,
         content,
         sourceTitle: title,
         sourceContent: content,
         workingSummary: content,
         workflowId,
         originBoardItemId,
         source: payload.source === "projects" ? "project" : "system",
         updatedAt: Date.now(),
      });

      liveCanvasRef.current = updatedCanvas;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCanvas));

      setCanvas(updatedCanvas);

      upsertProjectMemory({
         title,
         body: content,
         sourceTitle: title,
         sourceContent: content,
         workingSummary: content,
         workflowId,
         originBoardItemId,
         source: payload.source === "projects" ? "project" : "canvas",
         destination: "canvas",
         stage: "drafting",
         status: "active",
         priority: "medium",
         latestMovement: `${payload.source || "aidock"} → canvas`,
         recommendedNextAction: payload.suggestedAction || "Continue refining this in Canvas.",
      });

      syncCanvasStatus("focused-work-active");

      setImportNotice(true);

      window.dispatchEvent(
         new CustomEvent("allevin-canvas-integration-applied", {
            detail: {
               id: payload.id,
               title,
               source: payload.source,
               target: payload.target,
               appliedAt: Date.now(),
            },
         }),
      );

      setTimeout(() => {
         setImportNotice(false);
      }, 1200);
   }

   // ========================================
   // Cross-System Canvas Listener
   // ========================================

   useEffect(() => {
      function handleCanvasImport(event: Event) {
         const customEvent = event as CustomEvent<CanvasImportPayload>;

         if (!customEvent.detail) {
            return;
         }

         replaceCanvasWithImport(customEvent.detail);
      }

      function handleCanvasInsight(event: Event) {
         const customEvent = event as CustomEvent<CanvasInsightPayload>;

         if (!customEvent.detail) {
            return;
         }

         addInsightToCanvas(customEvent.detail);
      }

      function handleApprovedInternalIntegration(event: Event) {
         const customEvent = event as CustomEvent<ApprovedInternalIntegrationPayload>;

         const detail = customEvent.detail;

         if (!detail || detail.target !== "canvas") {
            return;
         }

         applyApprovedIntegrationToCanvas(detail);
      }

      window.addEventListener("allevin-send-to-canvas", handleCanvasImport);

      window.addEventListener("allevin-add-insight-to-canvas", handleCanvasInsight);

      window.addEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);

      return () => {
         window.removeEventListener("allevin-send-to-canvas", handleCanvasImport);

         window.removeEventListener("allevin-add-insight-to-canvas", handleCanvasInsight);

         window.removeEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);
      };
   }, []);

   // ========================================
   // Adaptive Canvas Mode
   // ========================================

   const canvasMode = useMemo(() => {
      if (workflowMode === "planning") {
         return {
            label: "Planning",
            editorClass: "min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] text-sm leading-6 sm:text-base sm:leading-7",
         };
      }

      if (workflowMode === "research") {
         return {
            label: "Research",
            editorClass: "min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] text-sm leading-6 sm:text-base sm:leading-7",
         };
      }

      if (workflowMode === "creative") {
         return {
            label: "Creative",
            editorClass: "min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] text-sm leading-6 sm:text-base sm:leading-7",
         };
      }

      if (workflowMode === "deep-focus") {
         return {
            label: "Deep Focus",
            editorClass: "min-h-[340px] sm:min-h-[420px] lg:min-h-[460px] text-base leading-7 sm:text-lg sm:leading-8",
         };
      }

      return {
         label: "Balanced",
         editorClass: "min-h-[320px] sm:min-h-[380px] lg:min-h-[420px] text-sm leading-6 sm:text-base sm:leading-7",
      };
   }, [workflowMode]);

   // ========================================
   // Hydration Protection
   // ========================================

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         id="canvas"
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
            rounded-[24px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-4
            shadow-[var(--shadow-soft)]
            sm:p-5
            lg:rounded-[32px]
            lg:p-6
         "
      >
         {/* Header */}

         <div className="mb-5 flex flex-col gap-4 lg:mb-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3 sm:items-center sm:gap-4">
               <div
                  className="
                     flex
                     h-12
                     w-12
                     sm:h-14
                     sm:w-14
                     shrink-0
                     items-center
                     justify-center
                     rounded-2xl
                     bg-[var(--color-bg)]
                  "
               >
                  <FileText size={24} />
               </div>

               <div>
                  <h2 className="text-2xl sm:text-3xl">Canvas</h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Write, update, and continue project work here. Save in Canvas or save the project when you want to keep it for later.</p>
               </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:gap-3">
               {importNotice && <div className="w-full rounded-2xl text-center lg:w-auto bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Opened in Canvas</div>}

               {exportNotice && <div className="w-full rounded-2xl text-center lg:w-auto bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Saved to Projects</div>}

               {resetNotice && <div className="w-full rounded-2xl text-center lg:w-auto bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Canvas reset</div>}

               {getCanvasSizeNotice(canvas.content) && <div className="w-full rounded-2xl text-center lg:w-auto bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{getCanvasSizeNotice(canvas.content)}</div>}

               {saveNoticeText && (
                  <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] lg:w-auto lg:justify-start">
                     <CheckCircle2 size={16} />
                     {saveNoticeText}
                  </div>
               )}

               <button
                  onClick={saveCanvas}
                  className="
                     flex
                     w-full
                     items-center
                     justify-center
                     gap-2
                     rounded-2xl
                     lg:w-auto
                     bg-[var(--color-primary)]
                     px-5
                     py-3
                     text-sm
                     font-medium
                     text-[var(--color-cream)]
                     transition-opacity
                     hover:opacity-90
                  "
               >
                  <Save size={16} />
                  {saved ? "Saved" : "Save"}
               </button>
               <button
                  onClick={prepareCanvasExport}
                  className="
                     flex
                     w-full
                     items-center
                     justify-center
                     gap-2
                     rounded-2xl
                     lg:w-auto
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
                  <FileText size={16} />
                  Save to Projects
               </button>

               <button
                  onClick={resetCanvas}
                  className="
                     flex
                     w-full
                     items-center
                     justify-center
                     gap-2
                     rounded-2xl
                     lg:w-auto
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
                  Reset
               </button>
            </div>
         </div>

         {/* Canvas Grid */}

         <div className="grid gap-4 lg:gap-6">
            {/* Main Editor */}

            <div>
               <div className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-4 sm:p-5 lg:rounded-3xl">
                  <input
                     value={canvas.title}
                     onChange={(e) => {
                        const nextTitle = sanitizeLiveCanvasTitle(e.target.value);

                        setCanvas((currentCanvas) => {
                           if (
                              shouldDetachManualTitleEdit({
                                 currentCanvas,

                                 nextTitle,
                              })
                           ) {
                              const nextCanvas = createManualCanvasFromEdit({
                                 title: nextTitle,

                                 content: currentCanvas.content,
                              });

                              liveCanvasRef.current = nextCanvas;

                              return nextCanvas;
                           }

                           const nextCanvas = {
                              ...currentCanvas,

                              title: nextTitle,

                              sourceTitle: currentCanvas.source === "manual" || !currentCanvas.sourceTitle ? normalizeProjectTitle(nextTitle) || nextTitle : normalizeProjectTitle(currentCanvas.sourceTitle) || currentCanvas.sourceTitle,

                              updatedAt: Date.now(),
                           };

                           liveCanvasRef.current = nextCanvas;

                           return nextCanvas;
                        });
                     }}
                     className="
                        mb-4
                        w-full
                        bg-transparent
                        text-2xl
                        font-semibold
                        sm:text-3xl
                        outline-none
                        placeholder:text-[var(--color-text-secondary)]
                     "
                     placeholder="Name this work..."
                  />

                  <textarea
                     value={canvas.content}
                     onChange={(e) => {
                        const nextContent = sanitizeLiveCanvasBody(e.target.value);

                        setCanvas((currentCanvas) => {
                           if (currentCanvas.source === "manual") {
                              const nextCanvas = {
                                 ...currentCanvas,

                                 content: nextContent,

                                 sourceContent: nextContent,

                                 workingSummary: nextContent,

                                 updatedAt: Date.now(),
                              };

                              liveCanvasRef.current = nextCanvas;

                              return nextCanvas;
                           }

                           const nextCanvas = {
                              ...currentCanvas,

                              content: nextContent,

                              // The current Canvas edit becomes the latest project source.
                              // This prevents older Task/Board context from overwriting
                              // new information when the same project is routed again.
                              sourceContent: nextContent,

                              workingSummary: nextContent,

                              updatedAt: Date.now(),
                           };

                           liveCanvasRef.current = nextCanvas;

                           return nextCanvas;
                        });
                     }}
                     className={`
                        w-full
                        resize-none
                        bg-transparent
                        outline-none
                        text-[var(--color-text-primary)]
                        placeholder:text-[var(--color-text-secondary)]
                        transition-all
                        duration-700

                        ${canvasMode.editorClass}
                     `}
                     placeholder="Start writing here. Capture the idea, plan, note, or project you want ALLEVIN to help move forward..."
                  />
               </div>
            </div>
         </div>
      </motion.section>
   );
}
