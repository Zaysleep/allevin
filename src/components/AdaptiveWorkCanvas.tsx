// ========================================
// Adaptive Work Canvas
// Purpose:
// Real workflow surface for notes, planning,
// writing, and cognitive work inside ALLEVIN.
// MK VII polish keeps Canvas clear,
// user-friendly, project-aware, and simple for
// focused writing and saved work.
// ========================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";

import { FileText, Save, RotateCcw, CheckCircle2, NotebookPen, Layers, Clock3, ChevronDown } from "lucide-react";

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

const PROJECT_MATERIALS_STORAGE_KEY = "allevin-project-materials-mkvi";

const CANVAS_SELECTED_REFERENCES_STORAGE_KEY = "allevin-canvas-selected-references-mkvi";

const APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY = "allevin-canvas-approved-internal-integration-handled";

// ========================================
// MK VII — Canvas Sanitization Parameters
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
   nextStep: 1000,
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

function sanitizeCanvasPlainText(value?: string, maxLength: number = CANVAS_SANITIZE_LIMITS.bodyHard, options: { preserveEdges?: boolean } = {}) {
   const cleaned = stripUnsafeCanvasMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n");

   return limitCanvasTextLength(options.preserveEdges ? cleaned : cleaned.trim(), maxLength);
}

function sanitizeLiveCanvasTitle(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.title, {
      preserveEdges: true,
   }).replace(/\n+/g, " ");
}

function sanitizeLiveCanvasBody(value?: string) {
   return sanitizeCanvasPlainText(value, CANVAS_SANITIZE_LIMITS.bodyHard, {
      preserveEdges: true,
   });
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
      return "Canvas is at the current size limit.";
   }

   if (length >= CANVAS_SANITIZE_LIMITS.bodySoft) {
      return "Canvas is getting large.";
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

type ProjectMaterialType = "Note" | "Reference" | "Research" | "Feedback" | "Requirement" | "Idea" | "Meeting Note" | "Visual Reference" | "Document" | "Image" | "Other";

interface ProjectMaterial {
   id: string;
   projectId: string;
   projectTitle: string;
   title: string;
   type: ProjectMaterialType;
   source: string;
   notes: string;
   summary: string;
   imageDataUrl?: string;
   imageFileName?: string;
   imageMimeType?: string;
   documentDataUrl?: string;
   documentFileName?: string;
   documentMimeType?: string;
   documentText?: string;
   interpretationSummary?: string;
   interpretationUsefulContext?: string;
   interpretationNextStep?: string;
   interpretedAt?: number;
   createdAt: number;
   updatedAt: number;
}

interface CanvasReferenceItem {
   id: string;
   kind: "note" | "material";
   projectId: string;
   title: string;
   label: string;
   source: string;
   summary: string;
   body: string;
   imageDataUrl?: string;
   imageFileName?: string;
   imageMimeType?: string;
   documentDataUrl?: string;
   documentFileName?: string;
   documentMimeType?: string;
   documentText?: string;
   interpretationSummary?: string;
   interpretationUsefulContext?: string;
   interpretationNextStep?: string;
   interpretedAt?: number;
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

   projectId?: string;

   materialId?: string;

   referenceMode?: "selected-material" | "project-context";

   selectedMaterial?: {
      id?: string;
      title?: string;
      type?: string;
      source?: string;
      summary?: string;
      notes?: string;
      imageDataUrl?: string;
      imageFileName?: string;
      imageMimeType?: string;
      documentDataUrl?: string;
      documentFileName?: string;
      documentMimeType?: string;
      documentText?: string;
      interpretationSummary?: string;
      interpretationUsefulContext?: string;
      interpretationNextStep?: string;
      interpretedAt?: number;
   };
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
// Task Save Payload
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
// Integration Save Payload
// ========================================

interface IntegrationSavePayload {
   destination: "notes" | "calendar" | "projects";

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

   recommendation?: {
      destination?: "notes" | "calendar" | "projects";
      objectType?: "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review";
      reason?: string;
      suggestedNextStep?: string;
      [key: string]: unknown;
   };
}

// ========================================
// Workflow Mode
// ========================================

type CanvasWorkflowMode = "balanced" | "planning" | "research" | "creative" | "deep-focus";

type CanvasStructureTemplateId = "simple" | "plan" | "notes";

interface CanvasStructureTemplate {
   id: CanvasStructureTemplateId;

   label: string;

   helper: string;

   title: string;

   body: string;
}

const CANVAS_STRUCTURE_TEMPLATES: CanvasStructureTemplate[] = [
   {
      id: "simple",
      label: "Shape your project",
      helper: "Use this when you have a rough idea and need help turning it into a clear project.",
      title: "New Project",
      body: `Project Type:
Write the kind of project this is, such as personal, school, work, creative, technical, or planning.

Current Status:
Write where this project stands right now. This can be one sentence.

Main Idea:
Describe the project in plain language. What is this about?

Goal:
Write what you want to finish, improve, decide, or understand.

Important Details:
Add any useful notes, dates, people, links, examples, limits, or reminders.

Materials or References:
List any files, notes, screenshots, websites, messages, or ideas that may help.

What Success Looks Like:
Describe how you will know this project is in a good place.

Next Step:
Write one small action you can take next.`,
   },
   {
      id: "plan",
      label: "Plan the steps",
      helper: "Use this when you know the goal and need to break it into smaller actions.",
      title: "New Step Plan",
      body: `Project Type:
Write the kind of project this is, such as personal, school, work, creative, technical, or planning.

Goal:
Write the main result you want.

Current Status:
Write what has already happened and what still needs attention.

Steps:
1. First useful step
2. Next useful step
3. Final check or finish step

Things to Check:
List anything that could block progress, needs review, or should not be forgotten.

Materials or References:
List anything that supports the project.

Next Step:
Choose the first step to work on.`,
   },
   {
      id: "notes",
      label: "Notes and research",
      helper: "Use this when you are collecting information before deciding what to do next.",
      title: "New Notes and Research",
      body: `Project Type:
Write the kind of project this is, such as personal, school, work, creative, technical, or planning.

Topic:
Write the subject, question, or idea you are exploring.

What I Know So Far:
Write the information you already have.

What I Need to Learn:
List the main things you still need to understand.

Useful Notes:
Add important facts, examples, quotes, links, reminders, or observations.

Sources or Materials:
List where the information came from or what files support it.

Open Questions:
List anything that still feels unclear.

Next Step:
Write the next source, note, or decision to handle.`,
   },
];

function getCanvasStructureTemplate(templateId: CanvasStructureTemplateId) {
   return CANVAS_STRUCTURE_TEMPLATES.find((template) => template.id === templateId) || CANVAS_STRUCTURE_TEMPLATES[0];
}

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
      .replace(/\n*Helpful note\n[\s\S]*$/i, "")
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

   const insightBlock = cleanInsight ? `Helpful note\n\n${cleanInsight}` : "";

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
      `(?:^|\\n)\\s*${label}\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:Focus|Helpful Context|Next Step|Current Location|Status|Stage|Latest Movement|Project Notes|ALLEVIN Recommendation|Recommended Move|Destination|Confidence|Risk|Reason|Projects|Summary|Title|Primary Content|Current Working View|Working Summary|Workflow Metadata|Source|Lane|Priority|Project status)\\s*:|$)`,
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
      "project status",
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
      "project status:",
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
            lower === "project status:";

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

   const regexMatch = text.match(/(?:^|\n)\s*primary content:\s*\n?([\s\S]*?)(?=\n\s*(?:lane|priority|next step|useful context|project status|working summary|current working view|source|title|focus):|$)/i);

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
            lower === "project status:" ||
            lower === "working summary:" ||
            lower === "current working view:" ||
            lower === "source:" ||
            lower.startsWith("lane:") ||
            lower.startsWith("priority:") ||
            lower.startsWith("next step:") ||
            lower.startsWith("useful context:") ||
            lower.startsWith("project status:") ||
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
      "project item completed",
      "workflow signal",
      "project item saved",
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
            !lower.startsWith("project status:")
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
         lower === "project status:" ||
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
         lower.startsWith("project status:") ||
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
      .filter((line): line is string => typeof line === "string")
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

   const existingUsefulContext = getSectionAfterLabel(sourceText, "Helpful Context") || getSectionAfterLabel(value, "Helpful Context");

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

   const lane = getValueAfterLabel(sourceText, "Project status") || getValueAfterLabel(value, "Project status") || getValueAfterLabel(sourceText, "Lane") || getValueAfterLabel(value, "Lane");

   const priority = getValueAfterLabel(sourceText, "Priority") || getValueAfterLabel(value, "Priority") || "medium";

   const title = getBestIncomingTitle(payload);

   const focus = possiblePrimaryContent || title || "Review this project item.";

   const boardStatus = payload.source === "project" ? "In Progress" : lane;

   const usefulContext = mergeUsefulContextLines([
      title ? `Project: ${title}` : null,
      boardStatus ? `Project status: ${boardStatus}` : null,
      priority ? `Priority: ${priority}` : null,
      payload.source === "project" ? "This work came from Projects and is now being continued in Canvas." : null,
      payload.source === "project" ? "This is the latest saved project update." : null,
      existingUsefulContext,
   ]);

   const nextStep =
      existingNextStep && !isGenericNextStep(existingNextStep)
         ? existingNextStep
         : payload.source === "project"
           ? "Continue editing this project in Canvas. When it is ready, save it to Projects or schedule time to work on it."
           : "Review the content, make any edits, then choose the next step.";

   return [`Focus:\n${focus}`, usefulContext ? `Helpful Context:\n${usefulContext}` : "", `Next Step:\n${nextStep}`].filter(Boolean).join("\n\n").trim();
}

function getPriorityFromPayload(payload: CanvasImportPayload): "low" | "medium" | "high" {
   const searchText = `${payload.body || ""}\n${payload.sourceContent || ""}\n${payload.workingSummary || ""}`;

   const priority = (getValueAfterLabel(searchText, "Priority") || "medium").toLowerCase();

   if (priority.includes("high")) return "high";

   if (priority.includes("low")) return "low";

   return "medium";
}

function buildProjectCanvasImport(payload: CanvasImportPayload) {
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

   return "Canvas Draft";
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
      return "projects";
   }

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("event")) {
      return "calendar";
   }

   return "notes";
}

function getInternalIntegrationDestinationLabel(destination: IntegrationSavePayload["destination"]) {
   switch (destination) {
      case "projects":
         return "Projects";

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

   if (destination === "projects") {
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

function isProjectMaterialType(value?: string): value is ProjectMaterialType {
   return (
      value === "Note" ||
      value === "Reference" ||
      value === "Research" ||
      value === "Feedback" ||
      value === "Requirement" ||
      value === "Idea" ||
      value === "Meeting Note" ||
      value === "Visual Reference" ||
      value === "Document" ||
      value === "Image" ||
      value === "Other"
   );
}

function sanitizeProjectMaterialType(value?: string): ProjectMaterialType {
   return isProjectMaterialType(value) ? value : "Note";
}

function sanitizeCanvasDocumentDataUrl(value?: string) {
   const cleanValue = typeof value === "string" ? value.trim() : "";

   if (!cleanValue.startsWith("data:")) {
      return undefined;
   }

   return cleanValue;
}

function sanitizeCanvasDocumentFileName(value?: string) {
   return typeof value === "string" ? sanitizeCanvasPlainText(value, 180).replace(/\n+/g, " ").trim() : undefined;
}

function sanitizeCanvasDocumentMimeType(value?: string) {
   const cleanValue = typeof value === "string" ? sanitizeCanvasPlainText(value, 120).toLowerCase() : "";

   return cleanValue || undefined;
}

function isCanvasReadableTextDocument(reference?: CanvasReferenceItem | ProjectMaterial | null) {
   const mimeType = (reference?.documentMimeType || "").toLowerCase();

   return Boolean(reference?.documentText || mimeType.includes("text/plain") || mimeType.includes("markdown"));
}

function isCanvasReadablePdfDocument(reference?: CanvasReferenceItem | ProjectMaterial | null) {
   const mimeType = (reference?.documentMimeType || "").toLowerCase();

   return Boolean(reference?.documentDataUrl && mimeType.includes("pdf"));
}

function canOpenCanvasDocument(reference?: CanvasReferenceItem | null) {
   return Boolean(reference?.documentDataUrl || reference?.documentText);
}

function sanitizeCanvasInterpretationText(value?: string, limit: number = CANVAS_SANITIZE_LIMITS.summary) {
   return sanitizeCanvasPlainText(value, limit);
}

function getCanvasReferenceMainPreview(reference: CanvasReferenceItem) {
   return (
      reference.interpretationSummary ||
      reference.summary ||
      getReferencePreview(reference.body, 180) ||
      (reference.imageDataUrl ? "Image saved for this project." : reference.documentDataUrl || reference.documentText ? "Document saved for this project." : "Reference saved for this project.")
   );
}

function readCanvasProjectMaterials() {
   if (typeof window === "undefined") {
      return [] as ProjectMaterial[];
   }

   const stored = localStorage.getItem(PROJECT_MATERIALS_STORAGE_KEY);

   if (!stored) {
      return [] as ProjectMaterial[];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [] as ProjectMaterial[];
      }

      return parsed
         .filter((material) => material && typeof material.id === "string" && typeof material.projectId === "string")
         .map((material) => ({
            id: sanitizeCanvasPlainText(material.id, 180),
            projectId: sanitizeCanvasPlainText(material.projectId, 180),
            projectTitle: sanitizeCanvasTitle(material.projectTitle || "Project"),
            title: sanitizeCanvasTitle(material.title || "Untitled material"),
            type: sanitizeProjectMaterialType(material.type),
            source: sanitizeCanvasPlainText(material.source || "", 300),
            notes: sanitizeProjectBodyFromCanvas(material.notes || ""),
            summary: sanitizeCanvasSummary(material.summary || material.notes || material.title || ""),
            imageDataUrl: typeof material.imageDataUrl === "string" && material.imageDataUrl.startsWith("data:image/") ? material.imageDataUrl : undefined,
            imageFileName: typeof material.imageFileName === "string" ? sanitizeCanvasPlainText(material.imageFileName, 180) : undefined,
            imageMimeType: typeof material.imageMimeType === "string" ? sanitizeCanvasPlainText(material.imageMimeType, 80) : undefined,
            documentDataUrl: sanitizeCanvasDocumentDataUrl(material.documentDataUrl),
            documentFileName: sanitizeCanvasDocumentFileName(material.documentFileName),
            documentMimeType: sanitizeCanvasDocumentMimeType(material.documentMimeType),
            documentText: typeof material.documentText === "string" ? sanitizeProjectBodyFromCanvas(material.documentText) : undefined,
            interpretationSummary: sanitizeCanvasInterpretationText(material.interpretationSummary, CANVAS_SANITIZE_LIMITS.summary),
            interpretationUsefulContext: sanitizeCanvasInterpretationText(material.interpretationUsefulContext, CANVAS_SANITIZE_LIMITS.summary),
            interpretationNextStep: sanitizeCanvasInterpretationText(material.interpretationNextStep, CANVAS_SANITIZE_LIMITS.nextStep),
            interpretedAt: typeof material.interpretedAt === "number" && Number.isFinite(material.interpretedAt) ? material.interpretedAt : undefined,
            createdAt: typeof material.createdAt === "number" && Number.isFinite(material.createdAt) ? material.createdAt : Date.now(),
            updatedAt: typeof material.updatedAt === "number" && Number.isFinite(material.updatedAt) ? material.updatedAt : Date.now(),
         }))
         .sort((a, b) => b.updatedAt - a.updatedAt);
   } catch {
      localStorage.removeItem(PROJECT_MATERIALS_STORAGE_KEY);

      return [] as ProjectMaterial[];
   }
}

function getCanvasTitleKey(value?: string) {
   return compactText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

function getActiveCanvasProjectRecord(canvas: CanvasState) {
   const projects = readCanvasProjectLibrary();

   const workflowId = canvas.workflowId || canvas.originBoardItemId;

   const titleKey = getCanvasTitleKey(canvas.sourceTitle || canvas.title);

   return (
      projects.find((project: any) => workflowId && (project.workflowId === workflowId || project.originBoardItemId === workflowId || project.id === workflowId)) ||
      projects.find((project: any) => titleKey && getCanvasTitleKey(project?.title) === titleKey)
   );
}

function getReferencePreview(value?: string, limit = 160) {
   const clean = compactText(value);

   if (clean.length <= limit) {
      return clean;
   }

   return `${clean.slice(0, limit).trim()}...`;
}

function isCurrentCanvasBodyReference(note: any, activeProject: any, canvas: CanvasState) {
   const noteBodyKey = compactText(note?.body || note?.summary || "").toLowerCase();

   const noteTitleKey = getCanvasTitleKey(note?.title);

   const canvasBodyKey = compactText(canvas.content || canvas.sourceContent || canvas.workingSummary || "").toLowerCase();

   const projectBodyKey = compactText(activeProject?.latestSummary || activeProject?.notes?.[0]?.body || "").toLowerCase();

   const activeTitleKey = getCanvasTitleKey(activeProject?.title || canvas.sourceTitle || canvas.title);

   const looksLikeFullProjectBody = noteTitleKey && activeTitleKey && noteTitleKey === activeTitleKey;

   const sameAsCanvas = noteBodyKey && canvasBodyKey && noteBodyKey === canvasBodyKey;

   const sameAsProjectBody = noteBodyKey && projectBodyKey && noteBodyKey === projectBodyKey;

   return Boolean(looksLikeFullProjectBody && (sameAsCanvas || sameAsProjectBody));
}

function getCanvasReferenceItems(canvas: CanvasState) {
   const activeProject = getActiveCanvasProjectRecord(canvas);

   const activeProjectId = activeProject?.id || canvas.workflowId || canvas.originBoardItemId || "";

   const activeTitleKey = getCanvasTitleKey(activeProject?.title || canvas.sourceTitle || canvas.title);

   const notes: CanvasReferenceItem[] = Array.isArray(activeProject?.notes)
      ? activeProject.notes
           .filter((note: any) => note && typeof note.id === "string")
           .filter((note: any) => !isCurrentCanvasBodyReference(note, activeProject, canvas))
           .map((note: any) => ({
              id: `note:${note.id}`,
              kind: "note" as const,
              projectId: activeProject?.id || activeProjectId,
              title: sanitizeCanvasTitle(note.title || activeProject?.title || "Project note"),
              label: "Saved note",
              source: sanitizeCanvasPlainText(note.source || "Projects", 120),
              summary: sanitizeCanvasSummary(note.summary || note.body || ""),
              body: sanitizeProjectBodyFromCanvas(note.body || note.summary || ""),
              updatedAt: typeof note.savedAt === "number" ? note.savedAt : typeof activeProject?.updatedAt === "number" ? activeProject.updatedAt : Date.now(),
           }))
           .slice(0, 8)
      : [];

   const materials = readCanvasProjectMaterials()
      .filter((material) => {
         const sameProjectId = activeProjectId && material.projectId === activeProjectId;

         const sameProjectTitle = activeTitleKey && getCanvasTitleKey(material.projectTitle) === activeTitleKey;

         return Boolean(sameProjectId || sameProjectTitle);
      })
      .map((material) => ({
         id: `material:${material.id}`,
         kind: "material" as const,
         projectId: material.projectId,
         title: material.title,
         label: material.type,
         source: material.source || "Project material",
         summary: material.summary || getReferencePreview(material.notes, 220),
         body: material.notes || material.summary || "",
         imageDataUrl: material.imageDataUrl,
         imageFileName: material.imageFileName,
         imageMimeType: material.imageMimeType,
         documentDataUrl: material.documentDataUrl,
         documentFileName: material.documentFileName,
         documentMimeType: material.documentMimeType,
         documentText: material.documentText,
         interpretationSummary: material.interpretationSummary,
         interpretationUsefulContext: material.interpretationUsefulContext,
         interpretationNextStep: material.interpretationNextStep,
         interpretedAt: material.interpretedAt,
         updatedAt: material.updatedAt,
      }));

   return [...materials, ...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readSelectedCanvasReferenceIds() {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   try {
      const stored = localStorage.getItem(CANVAS_SELECTED_REFERENCES_STORAGE_KEY);

      const parsed = stored ? JSON.parse(stored) : [];

      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
   } catch {
      localStorage.removeItem(CANVAS_SELECTED_REFERENCES_STORAGE_KEY);

      return [] as string[];
   }
}

function saveSelectedCanvasReferenceIds(ids: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(CANVAS_SELECTED_REFERENCES_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids)).slice(0, 20)));
}

function getReadableCanvasUpdatedAt(value?: number) {
   if (!value) {
      return "Not saved yet";
   }

   try {
      return new Intl.DateTimeFormat(undefined, {
         month: "short",
         day: "numeric",
         hour: "numeric",
         minute: "2-digit",
      }).format(new Date(value));
   } catch {
      return "Recently updated";
   }
}

function getCanvasWordCount(value?: string) {
   const words = compactText(value).split(" ").filter(Boolean);

   return words.length;
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

   const current = readCanvasProjectLibrary();

   const cleanTitleKey = getCanvasTitleKey(cleanTitle);

   const matchingProject = current.find((project) => {
      if (!project) {
         return false;
      }

      const projectTitleKey = getCanvasTitleKey(project.title);

      const sameTitle = cleanTitleKey && projectTitleKey && cleanTitleKey === projectTitleKey;

      const sameWorkflow = workflowId && (project.workflowId === workflowId || project.originBoardItemId === workflowId || project.id === workflowId || project.id === `workflow:${workflowId}`);

      const sameOrigin = originBoardItemId && (project.originBoardItemId === originBoardItemId || project.workflowId === originBoardItemId || project.id === originBoardItemId || project.id === `origin:${originBoardItemId}`);

      return Boolean(sameTitle || sameWorkflow || sameOrigin);
   });

   const key =
      matchingProject?.id ||
      getCanvasProjectLibraryKey({
         workflowId,
         originBoardItemId,
         title: cleanTitle,
      });

   const note = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      body: cleanBody,
      summary: cleanSummary,
      source: "Projects",
      savedAt: Date.now(),
   };

   const previousNotes = Array.isArray(matchingProject?.notes) ? matchingProject.notes : [];

   const nextProject = matchingProject
      ? {
           ...matchingProject,
           id: matchingProject.id || key,
           title: cleanTitle || matchingProject.title,
           workflowId: workflowId || matchingProject.workflowId,
           originBoardItemId: originBoardItemId || matchingProject.originBoardItemId,
           latestSummary: cleanBody.length >= cleanSummary.length ? cleanBody : cleanSummary,
           latestMovement: "Saved to Projects",
           notes: [note, ...previousNotes.filter((existingNote: any) => existingNote?.id !== note.id)].slice(0, 30),
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

   const nextProjects = [
      nextProject,
      ...current.filter((project) => {
         if (!project) {
            return false;
         }

         const sameId = project.id === nextProject.id;

         const sameTitle = cleanTitleKey && getCanvasTitleKey(project.title) === cleanTitleKey;

         const sameWorkflow = workflowId && (project.workflowId === workflowId || project.originBoardItemId === workflowId || project.id === workflowId || project.id === `workflow:${workflowId}`);

         const sameOrigin = originBoardItemId && (project.originBoardItemId === originBoardItemId || project.workflowId === originBoardItemId || project.id === originBoardItemId || project.id === `origin:${originBoardItemId}`);

         return !sameId && !sameTitle && !sameWorkflow && !sameOrigin;
      }),
   ]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 80);

   localStorage.setItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(nextProjects));

   window.dispatchEvent(new CustomEvent("allevin-project-library-update"));

   window.dispatchEvent(
      new CustomEvent("allevin-project-note-saved", {
         detail: {
            title: cleanTitle,
            workflowId: nextProject.workflowId,
            originBoardItemId: nextProject.originBoardItemId,
            noteId: note.id,
            savedAt: note.savedAt,
         },
      }),
   );

   return {
      title: cleanTitle,
      updatedExistingProject: Boolean(matchingProject),
   };
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

   sections.push(`Title:\n${sanitizeCanvasTitle(title || "Untitled Canvas Draft")}`);

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

   const [saveNotice, setSaveNotice] = useState(false);

   const [projectSaveNoticeText, setProjectSaveNoticeText] = useState("");

   const [structureNotice, setStructureNotice] = useState("");

   const [structureStarterOpen, setStructureStarterOpen] = useState(false);

   const [selectedStructureTemplateId, setSelectedStructureTemplateId] = useState<CanvasStructureTemplateId>("simple");

   const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);

   const [expandedReferenceId, setExpandedReferenceId] = useState<string | null>(null);

   const [referenceRefreshKey, setReferenceRefreshKey] = useState(0);

   const [fullscreenReferenceImage, setFullscreenReferenceImage] = useState<CanvasReferenceItem | null>(null);

   const [fullscreenReferenceDocument, setFullscreenReferenceDocument] = useState<CanvasReferenceItem | null>(null);

   const canvasReferenceItems = useMemo(() => getCanvasReferenceItems(canvas), [canvas.title, canvas.sourceTitle, canvas.workflowId, canvas.originBoardItemId, referenceRefreshKey]);

   const activeReferenceItems = useMemo(() => canvasReferenceItems.filter((reference) => selectedReferenceIds.includes(reference.id)), [canvasReferenceItems, selectedReferenceIds]);

   const selectedReferenceItem = useMemo(
      () => canvasReferenceItems.find((reference) => reference.id === expandedReferenceId) || canvasReferenceItems.find((reference) => selectedReferenceIds.includes(reference.id)) || null,
      [canvasReferenceItems, expandedReferenceId, selectedReferenceIds],
   );

   const activeProjectRecord = useMemo(() => getActiveCanvasProjectRecord(canvas), [canvas.title, canvas.sourceTitle, canvas.workflowId, canvas.originBoardItemId, referenceRefreshKey]);

   function openCanvasReference(referenceId: string) {
      // Build 7 Patch 5:
      // Clicking a reference toggles selection and preview together.
      // No separate Select button is needed.
      const wasSelected = selectedReferenceIds.includes(referenceId);

      setSelectedReferenceIds((current) => {
         const next = current.includes(referenceId) ? current.filter((id) => id !== referenceId) : [...current, referenceId].slice(-8);

         saveSelectedCanvasReferenceIds(next);

         return next;
      });

      setExpandedReferenceId(wasSelected ? null : referenceId);
   }

   function chooseCanvasReference(referenceId: string) {
      if (!referenceId) {
         clearCanvasReferences();

         return;
      }

      setSelectedReferenceIds([referenceId]);

      saveSelectedCanvasReferenceIds([referenceId]);

      setExpandedReferenceId(referenceId);
   }

   function clearCanvasReferences() {
      setSelectedReferenceIds([]);

      saveSelectedCanvasReferenceIds([]);

      setExpandedReferenceId(null);

      setFullscreenReferenceImage(null);

      setFullscreenReferenceDocument(null);
   }

   function applyCanvasStructureTemplate(templateId: CanvasStructureTemplateId) {
      const template = getCanvasStructureTemplate(templateId);

      setCanvas((currentCanvas) => {
         const currentContent = cleanText(currentCanvas.content);

         const currentTitle = sanitizeCanvasTitle(normalizeProjectTitle(currentCanvas.title) || normalizeProjectTitle(currentCanvas.sourceTitle) || "");

         const starterTitle = currentTitle || template.title;

         const structuredContent = currentContent
            ? `${template.body}

Existing Notes:
${currentContent}`
            : template.body;

         const updatedCanvas = sanitizeCanvasState({
            ...currentCanvas,
            title: starterTitle,
            content: structuredContent,
            sourceTitle: starterTitle,
            sourceContent: structuredContent,
            workingSummary: structuredContent,
            source: currentCanvas.source === "project" ? "project" : "manual",
            updatedAt: Date.now(),
         });

         liveCanvasRef.current = updatedCanvas;

         return updatedCanvas;
      });

      syncCanvasStatus("focused-work-active");

      setStructureNotice(`${template.label} structure added`);

      window.setTimeout(() => {
         setStructureNotice("");
      }, 1600);
   }

   function syncCanvasStatus(status: "focused-work-active" | "integration-ready" | "workspace-stable" = "focused-work-active") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   // ========================================
   // Load Canvas
   // ========================================

   useEffect(() => {
      setMounted(true);

      setSelectedReferenceIds(readSelectedCanvasReferenceIds());

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

   useEffect(() => {
      function refreshCanvasReferences() {
         setReferenceRefreshKey((current) => current + 1);
      }

      window.addEventListener("allevin-project-materials-update", refreshCanvasReferences);

      window.addEventListener("allevin-project-library-update", refreshCanvasReferences);

      window.addEventListener("storage", refreshCanvasReferences);

      return () => {
         window.removeEventListener("allevin-project-materials-update", refreshCanvasReferences);

         window.removeEventListener("allevin-project-library-update", refreshCanvasReferences);

         window.removeEventListener("storage", refreshCanvasReferences);
      };
   }, []);

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
                  title: updated.title || "Untitled Canvas Draft",
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

      clearCanvasReferences();

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
      const isProjectImport = payload.source === "project";

      const focusedImport = isProjectImport
         ? {
              title: getBestIncomingTitle(payload),
              content: buildProjectCanvasImport(payload),
           }
         : buildFocusedCanvasImport(payload);

      if (payload.referenceMode === "selected-material" && payload.materialId) {
         const referenceId = `material:${payload.materialId}`;

         setSelectedReferenceIds((current) => {
            const next = [referenceId, ...current.filter((id) => id !== referenceId)].slice(0, 8);

            saveSelectedCanvasReferenceIds(next);

            return next;
         });

         setExpandedReferenceId(referenceId);

         setReferenceRefreshKey((current) => current + 1);
      }

      // Project → Canvas handoffs should keep reference material in the side panel,
      // not paste it into the writing space.
      // The editor stays focused on the current draft/update while references remain selectable.

      // Projects → Canvas handoffs should preserve the smarter context generator output.
      // The older project sanitizer was useful for removing noisy project payloads,
      // but it also stripped the smarter MK III context back down to only Priority.
      const visibleContent = removeDocumentMetadata(focusedImport.content) || focusedImport.content;

      setCanvas((prev) => {
         const incomingSourceTitle = normalizeProjectTitle(extractSourceTitleFromPayload(payload) || focusedImport.title);

         const incomingSourceContent = getPlainCanvasDocument(payload) || visibleContent;

         // For Projects → Canvas, the incoming project handoff is the newest source of truth.
         // Do not preserve the previous Canvas source over the latest Project update.
         const shouldPreservePreviousSource = !isProjectImport && Boolean(prev.sourceContent?.trim()) && Boolean(prev.workflowId) && Boolean(payload.workflowId) && prev.workflowId === payload.workflowId && payload.source === "system";

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
            source: updatedCanvas.source === "system" ? "system" : updatedCanvas.source === "research" ? "research" : updatedCanvas.source === "task" ? "task" : updatedCanvas.source === "project" ? "projects" : "canvas",
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

         if (message.includes("plan") || message.includes("organize") || message.includes("roadmap") || message.includes("schedule") || message.includes("projects")) {
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
   // Build Preserved Project Context
   // ========================================

   // ========================================
   // Save Canvas Into Project Flow
   // ========================================

   // ========================================
   // Prepare Canvas Save
   // Canvas → Recommender → Integration Adapter Layer
   // Clears Canvas after save preparation
   // ========================================

   function prepareCanvasSave() {
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
      // this button into Projects/Calendar or any confirmation queue.
      const internalDestination = "notes" as IntegrationSavePayload["destination"];

      const internalSuggestedNextStep = getInternalIntegrationNextStep(internalDestination, recommendation.suggestedNextStep);

      const payload: IntegrationSavePayload = {
         destination: internalDestination,

         objectType: "project-summary",

         title: sanitizeCanvasTitle(canvas.title.trim() || "Untitled Canvas Draft"),

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
            reason: "This draft is ready to save to Projects.",
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
      const projectSaveResult = saveCanvasProjectToLibrary({
         title: payload.sourceTitle || payload.title,
         body: payload.body || sourceContent || visibleContent,
         summary: payload.workingSummary || payload.body || sourceContent || visibleContent,
         workflowId,
         originBoardItemId: payload.originBoardItemId,
      });

      const projectNoticeTitle = projectSaveResult?.title || payload.sourceTitle || payload.title || "Project";

      const projectNoticeMessage = projectSaveResult?.updatedExistingProject ? `Updated "${projectNoticeTitle}" in Projects.` : `Saved "${projectNoticeTitle}" to Projects.`;

      setProjectSaveNoticeText(projectNoticeMessage);

      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-prepare-integration", {
               detail: {
                  ...payload,
                  alreadySavedToProjects: true,
                  suppressChatNotice: true,
               },
            }),
         );
      }, 0);

      const freshCanvas = getInitialCanvas();

      localStorage.removeItem(STORAGE_KEY);

      setCanvas(freshCanvas);

      syncCanvasStatus("integration-ready");

      setSaveNotice(true);

      setTimeout(() => {
         setSaveNotice(false);

         setProjectSaveNoticeText("");
      }, 2600);
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
   // Project Continuity Cleanup
   // Option 3:
   // Archive the previous active Canvas stage after
   // an approved Canvas → Projects movement.
   // This keeps Calm/project memory intact while
   // keeping Canvas from continuing to look like
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
         source: payload.source === "projects" ? "notes" : "canvas",
         destination: "canvas",
         stage: "drafting",
         status: "active",
         priority: "medium",
         latestMovement: `${payload.source || "aidock"} → canvas`,
         recommendedNextAction: payload.suggestedAction || "Keep editing this in Canvas.",
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
            min-w-0
            bg-transparent
            pb-8
         "
      >
         {/* Header */}

         <div
            className="
               mb-6
               flex
               flex-col
               gap-5
               border-b
               border-[var(--border-subtle)]
               pb-5

               2xl:flex-row
               2xl:items-end
               2xl:justify-between
            "
         >
            <div className="min-w-0">
               <p className="studio-eyebrow">Canvas</p>

               <h2
                  data-editorial-title="true"
                  className="
                     mt-2
                     max-w-5xl
                     text-3xl
                     leading-tight

                     sm:text-4xl
                     xl:text-5xl
                  "
               >
                  {canvas.title || activeProjectRecord?.title || "Untitled Canvas"}
               </h2>
            </div>

            <div
               className="
                  grid
                  w-full
                  grid-cols-1
                  gap-2

                  sm:grid-cols-3
                  sm:gap-3

                  2xl:w-[560px]
               "
            >
               {importNotice && <div className="w-full rounded-2xl text-center lg:w-auto bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Opened in Canvas</div>}

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
                     studio-button-primary
                     min-h-12
                     w-full
                     flex-row
                     items-center
                     justify-center
                     gap-2
                     whitespace-nowrap
                  "
               >
                  <Save size={16} />
                  {saved ? "Saved" : "Save"}
               </button>
               <button
                  onClick={prepareCanvasSave}
                  className="
                     studio-button-secondary
                     min-h-12
                     w-full
                     flex-row
                     items-center
                     justify-center
                     gap-2
                     whitespace-nowrap
                  "
               >
                  <FileText size={16} />
                  Save to Projects
               </button>

               <button
                  onClick={resetCanvas}
                  className="
                     studio-button-secondary
                     min-h-12
                     w-full
                     flex-row
                     items-center
                     justify-center
                     gap-2
                     whitespace-nowrap
                  "
               >
                  <RotateCcw size={16} />
                  Reset
               </button>
            </div>
         </div>

         {saveNotice && projectSaveNoticeText && (
            <motion.div
               initial={{ opacity: 0, y: -10, height: 0 }}
               animate={{ opacity: 1, y: 0, height: "auto" }}
               transition={{ duration: 0.2 }}
               className="
                  mb-5
                  overflow-hidden
                  rounded-[var(--radius-lg)]
                  border
                  border-[rgba(48,92,222,0.16)]
                  bg-[var(--color-surface-blue)]
                  p-4
               "
            >
               <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(48,92,222,0.1)] text-[var(--color-primary)]">
                     <CheckCircle2 size={17} />
                  </div>

                  <div className="min-w-0">
                     <p className="break-words text-sm font-medium text-[var(--color-text-primary)]">{projectSaveNoticeText}</p>

                     <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Projects is updated. You can open it from Projects when you are ready.</p>
                  </div>
               </div>
            </motion.div>
         )}

         {/* Canvas Grid */}

         <div className="grid min-w-0 gap-5 xl:grid-cols-12 xl:gap-6">
            {/* Main Editor */}

            <div className="min-w-0 xl:col-span-8">
               <div
                  className="
                     mb-5
                     grid
                     grid-cols-1
                     divide-y
                     divide-[var(--border-subtle)]
                     border-y
                     border-[var(--border-subtle)]
                     md:grid-cols-3
                     md:divide-x
                     md:divide-y-0
                  "
               >
                  <div className="px-1 py-4 sm:px-4">
                     <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                        <Clock3 size={14} strokeWidth={1.7} />
                        Updated
                     </div>

                     <p className="mt-2 text-sm text-[var(--color-text-primary)]">{getReadableCanvasUpdatedAt(canvas.updatedAt)}</p>
                  </div>

                  <div className="px-1 py-4 sm:px-4">
                     <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                        <NotebookPen size={14} strokeWidth={1.7} />
                        Current work
                     </div>

                     <p className="mt-2 text-sm text-[var(--color-text-primary)]">{getCanvasWordCount(canvas.content)} words</p>
                  </div>

                  <div className="px-1 py-4 sm:px-4">
                     <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                        <Layers size={14} strokeWidth={1.7} />
                        References
                     </div>

                     <p className="mt-2 text-sm text-[var(--color-text-primary)]">{selectedReferenceItem ? "1 selected" : `${canvasReferenceItems.length} available`}</p>
                  </div>
               </div>

               <div className="mb-5 border-b border-[var(--border-subtle)] pb-5">
                  <button
                     type="button"
                     onClick={() => setStructureStarterOpen((current) => !current)}
                     aria-expanded={structureStarterOpen}
                     className="
                        flex
                        w-full
                        items-center
                        justify-between
                        gap-4
                        rounded-[var(--radius-md)]
                        px-1
                        py-2
                        text-left
                        hover:bg-[rgba(255,255,255,0.34)]
                     "
                  >
                     <div className="flex min-w-0 items-center gap-3">
                        <NotebookPen size={17} strokeWidth={1.7} />

                        <div className="min-w-0">
                           <p className="font-medium text-[var(--color-text-primary)]">Structure starter</p>

                           <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{getCanvasStructureTemplate(selectedStructureTemplateId).label}</p>
                        </div>
                     </div>

                     <ChevronDown
                        size={18}
                        strokeWidth={1.7}
                        className={`
                           shrink-0
                           text-[var(--color-text-secondary)]
                           transition-transform
                           duration-200

                           ${structureStarterOpen ? "rotate-180" : "rotate-0"}
                        `}
                     />
                  </button>

                  {structureStarterOpen && (
                     <div
                        className="
                           mt-3
                           rounded-[var(--radius-lg)]
                           border
                           border-[var(--border-subtle)]
                           bg-[var(--color-surface)]
                           p-4
                           shadow-[var(--shadow-soft)]
                        "
                     >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                           <label className="sr-only" htmlFor="canvas-structure-template">
                              Choose a Canvas structure
                           </label>

                           <select
                              id="canvas-structure-template"
                              value={selectedStructureTemplateId}
                              onChange={(event) => setSelectedStructureTemplateId(event.target.value as CanvasStructureTemplateId)}
                              className="
                                 min-h-11
                                 flex-1
                                 rounded-[var(--radius-md)]
                                 border
                                 border-[var(--border-subtle)]
                                 bg-[var(--color-bg-soft)]
                                 px-4
                                 py-3
                                 text-sm
                                 font-medium
                                 text-[var(--color-text-primary)]
                                 outline-none
                                 transition-colors
                                 focus:border-[var(--color-primary)]
                                 focus:bg-white
                              "
                           >
                              {CANVAS_STRUCTURE_TEMPLATES.map((template) => (
                                 <option key={template.id} value={template.id}>
                                    {template.label}
                                 </option>
                              ))}
                           </select>

                           <button type="button" onClick={() => applyCanvasStructureTemplate(selectedStructureTemplateId)} className="studio-button-primary w-full justify-center sm:w-auto sm:min-w-[150px]">
                              Add structure
                           </button>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                           <p className="max-w-2xl text-xs leading-5 text-[var(--color-text-secondary)]">{getCanvasStructureTemplate(selectedStructureTemplateId).helper}</p>

                           {structureNotice && <p className="shrink-0 text-xs font-medium text-[var(--color-primary)]">{structureNotice}</p>}
                        </div>
                     </div>
                  )}
               </div>

               <div className="studio-paper min-h-[620px] p-5 sm:p-7 lg:p-9">
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
                        font-[var(--font-editorial)]
                        text-3xl
                        font-medium
                        leading-tight
                        tracking-[-0.035em]
                        sm:text-4xl
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
                              // This prevents older context from overwriting new information
                              // when the same project is routed again.
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
                     placeholder="Write today’s update, draft, or next working version here."
                  />
               </div>
            </div>

            {/* Reference Panel */}

            <aside className="min-w-0 xl:col-span-4">
               <div
                  className="
                     rounded-[var(--radius-xl)]
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-surface)]
                     p-4
                     shadow-[var(--shadow-soft)]

                     sm:p-5

                     xl:sticky
                     xl:top-4
                     xl:max-h-[calc(100vh-2rem)]
                     xl:overflow-y-auto
                  "
               >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                     <div>
                        <p className="flex items-center gap-2 font-medium">
                           <Layers size={17} />
                           Project References
                        </p>

                        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Keep one useful note or material beside the draft.</p>
                     </div>
                  </div>

                  {canvasReferenceItems.length > 0 ? (
                     <div className="mt-4 space-y-3">
                        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]" htmlFor="canvas-reference-picker">
                           Choose a reference
                        </label>

                        <select
                           id="canvas-reference-picker"
                           value={selectedReferenceItem?.id || ""}
                           onChange={(event) => chooseCanvasReference(event.target.value)}
                           className="w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-3 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)]"
                        >
                           <option value="">No reference selected</option>

                           {canvasReferenceItems.map((reference) => (
                              <option key={reference.id} value={reference.id}>
                                 {reference.kind === "material" ? reference.label : "Note"}: {reference.title}
                              </option>
                           ))}
                        </select>

                        {selectedReferenceItem && (
                           <div className="rounded-[var(--radius-lg)] border border-[rgba(48,92,222,0.18)] bg-[var(--color-surface-blue)] p-4">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                 <span className="max-w-full break-words rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                                    {selectedReferenceItem.kind === "material" ? selectedReferenceItem.label : "Note"}
                                 </span>

                                 {selectedReferenceItem.source && <span className="max-w-full break-words rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]">{selectedReferenceItem.source}</span>}

                                 <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">Selected</span>
                              </div>

                              <p className="mt-3 break-words text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{selectedReferenceItem.title}</p>

                              <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-secondary)]">{getCanvasReferenceMainPreview(selectedReferenceItem)}</p>

                              {selectedReferenceItem.interpretationSummary && (
                                 <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-white p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Material Summary</p>

                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">{selectedReferenceItem.interpretationSummary}</p>

                                    {selectedReferenceItem.interpretationUsefulContext && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-secondary)]">{selectedReferenceItem.interpretationUsefulContext}</p>}

                                    {selectedReferenceItem.interpretationNextStep && (
                                       <div className="mt-3 rounded-xl bg-[var(--color-bg)] p-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Suggested next step</p>

                                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">{selectedReferenceItem.interpretationNextStep}</p>
                                       </div>
                                    )}
                                 </div>
                              )}

                              {selectedReferenceItem.imageDataUrl && (
                                 <button
                                    type="button"
                                    onClick={() => setFullscreenReferenceImage(selectedReferenceItem)}
                                    className="mt-3 block w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    aria-label={`Open ${selectedReferenceItem.title} image fullscreen`}
                                 >
                                    <img src={selectedReferenceItem.imageDataUrl} alt={selectedReferenceItem.title} className="max-h-64 w-full object-contain" />

                                    <div className="border-t border-[var(--border-subtle)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                                       Click to view larger
                                       {selectedReferenceItem.imageFileName ? ` • ${selectedReferenceItem.imageFileName}` : ""}
                                    </div>
                                 </button>
                              )}

                              {selectedReferenceItem.label === "Document" && canOpenCanvasDocument(selectedReferenceItem) && (
                                 <button
                                    type="button"
                                    onClick={() => setFullscreenReferenceDocument(selectedReferenceItem)}
                                    className="mt-3 block w-full rounded-2xl border border-[var(--border-subtle)] bg-white p-4 text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    aria-label={`Open ${selectedReferenceItem.title} document reader`}
                                 >
                                    <div className="flex items-start gap-3">
                                       <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg)] text-[var(--color-text-primary)]">
                                          <FileText size={18} />
                                       </div>

                                       <div className="min-w-0 flex-1">
                                          <p className="break-words text-sm font-semibold text-[var(--color-text-primary)]">Open document</p>

                                          <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-secondary)]">{selectedReferenceItem.documentFileName || selectedReferenceItem.title} • Open to scroll and read.</p>
                                       </div>
                                    </div>
                                 </button>
                              )}

                              <div className="mt-3 max-h-[360px] overflow-auto rounded-2xl bg-white p-3">
                                 <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-secondary)]">
                                    {selectedReferenceItem.body ||
                                       selectedReferenceItem.summary ||
                                       selectedReferenceItem.interpretationSummary ||
                                       (selectedReferenceItem.imageDataUrl
                                          ? "Image saved for this project."
                                          : selectedReferenceItem.documentDataUrl || selectedReferenceItem.documentText
                                            ? "Document saved for this project."
                                            : "No additional notes saved for this reference yet.")}
                                 </p>
                              </div>
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">No references yet. Add notes or materials in Projects, then open this project in Canvas.</div>
                  )}
               </div>
            </aside>
         </div>

         {fullscreenReferenceImage?.imageDataUrl && (
            <div
               className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
               onClick={() => setFullscreenReferenceImage(null)}
               role="dialog"
               aria-modal="true"
               aria-label={`${fullscreenReferenceImage.title} fullscreen image preview`}
            >
               <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-[var(--shadow-soft)]" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
                     <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Image Reference</p>

                        <h3 className="mt-1 break-words text-lg font-semibold text-[var(--color-text-primary)]">{fullscreenReferenceImage.title}</h3>

                        {fullscreenReferenceImage.imageFileName && <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{fullscreenReferenceImage.imageFileName}</p>}
                     </div>

                     <button
                        type="button"
                        onClick={() => setFullscreenReferenceImage(null)}
                        className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]"
                     >
                        Close
                     </button>
                  </div>

                  <div className="flex max-h-[76vh] items-center justify-center overflow-auto bg-[var(--color-bg)] p-4">
                     <img src={fullscreenReferenceImage.imageDataUrl} alt={fullscreenReferenceImage.title} className="max-h-[72vh] max-w-full rounded-2xl object-contain" />
                  </div>
               </div>
            </div>
         )}

         {fullscreenReferenceDocument && (
            <div
               className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
               onClick={() => setFullscreenReferenceDocument(null)}
               role="dialog"
               aria-modal="true"
               aria-label={`${fullscreenReferenceDocument.title} document reader`}
            >
               <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[var(--shadow-soft)]" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
                     <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Document Reference</p>

                        <h3 className="mt-1 break-words text-lg font-semibold text-[var(--color-text-primary)]">{fullscreenReferenceDocument.title}</h3>

                        {fullscreenReferenceDocument.documentFileName && <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{fullscreenReferenceDocument.documentFileName}</p>}
                     </div>

                     <button
                        type="button"
                        onClick={() => setFullscreenReferenceDocument(null)}
                        className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]"
                     >
                        Close
                     </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-bg)] p-4">
                     {isCanvasReadablePdfDocument(fullscreenReferenceDocument) && fullscreenReferenceDocument.documentDataUrl ? (
                        <iframe src={fullscreenReferenceDocument.documentDataUrl} title={fullscreenReferenceDocument.title} className="h-[74vh] w-full rounded-2xl border border-[var(--border-subtle)] bg-white" />
                     ) : isCanvasReadableTextDocument(fullscreenReferenceDocument) ? (
                        <pre className="min-h-[70vh] whitespace-pre-wrap break-words rounded-2xl border border-[var(--border-subtle)] bg-white p-5 text-sm leading-7 text-[var(--color-text-secondary)]">
                           {fullscreenReferenceDocument.documentText || fullscreenReferenceDocument.body || fullscreenReferenceDocument.summary || "No readable text is available for this document."}
                        </pre>
                     ) : (
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 text-sm leading-6 text-[var(--color-text-secondary)]">
                           This document is attached, but this file type does not have an in-app reader yet. Add notes to the material so ALLEVIN can still use it as project context.
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}
      </motion.section>
   );
}
