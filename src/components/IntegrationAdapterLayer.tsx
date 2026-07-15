"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Boxes, CheckCircle2, FileText, NotebookPen, Send, Sparkles, XCircle, CalendarDays, ListChecks, ChevronDown, FolderKanban, Flag, RotateCw } from "lucide-react";

import { useWorkspace } from "@/components/WorkspaceContext";

import { upsertProjectMemory, deleteProjectMemory } from "@/lib/allevinProjectMemory";

import { interpretMaterialWithLLM, requestAllevinLLM } from "@/lib/allevinLLMClient";

import { rememberDeletedProjectMemorySignal } from "@/components/MemoryEngine";

// ========================================
// ALLEVIN Projects Workspace
// Purpose:
// MK VIII project home base.
// Projects keeps each project, Working Notes, milestones, schedule, and materials together.
// ALLEVIN turns a user's description into an editable project draft before it is saved.
// ========================================

const STORAGE_KEY = "allevin-internal-output-hub";

const PROJECT_LIBRARY_STORAGE_KEY = "allevin-project-library";

const ACTIVE_PROJECT_SELECTION_STORAGE_KEY = "allevin-active-project-selection-mkviii";

const DELETED_PROJECTS_STORAGE_KEY = "allevin-project-deleted";

const DELETED_PROJECT_KEYS_STORAGE_KEY = "allevin-project-deleted-keys";

const DELETED_THREADS_STORAGE_KEY = "allevin-thread-recovery-deleted";

const DELETED_THREAD_KEYS_STORAGE_KEY = "allevin-thread-recovery-deleted-keys";

const WORKFLOW_TIMELINE_STORAGE_KEY = "allevin-global-workflow-timeline";

const THREAD_MEMORY_V2_STORAGE_KEY = "allevin-thread-memory-v2";

const CANVAS_STORAGE_KEY = "allevin-adaptive-work-canvas";

const PROJECT_TRACKING_STORAGE_KEY = "allevin-project-tracking-map";

const CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";

const PROJECT_MATERIALS_STORAGE_KEY = "allevin-project-materials-mkvi";

const CANVAS_SELECTED_REFERENCES_STORAGE_KEY = "allevin-canvas-selected-references-mkvi";

const PROJECT_SELECTED_MATERIALS_STORAGE_KEY = "allevin-project-selected-materials-mkviii";

const PROJECT_MATERIAL_STORAGE_SAFE_LIMIT = 4500000;

const APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY = "allevin-approved-internal-integration-handled";

// ========================================
// MK VIII — Projects Sanitization Parameters
// Projects should preserve saved work, but every stored/displayed field is untrusted.
// ========================================

const PROJECT_SANITIZE_LIMITS = {
   title: 120,
   body: 100000,
   summary: 1500,
   preview: 500,
   notice: 220,
   nextStep: 1000,
   location: 300,
   materialType: 80,
   materialSource: 300,
   imageDataUrl: 1600000,
   imageFileName: 180,
   imageMimeType: 80,
   documentDataUrl: 2400000,
   documentFileName: 180,
   documentMimeType: 120,
   documentText: 100000,
   materialInterpretation: 2200,
} as const;

function limitProjectTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeProjectMarkup(value?: string) {
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

function sanitizeProjectPlainText(value?: string, maxLength: number = PROJECT_SANITIZE_LIMITS.body, options: { preserveEdges?: boolean } = {}) {
   const cleaned = stripUnsafeProjectMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n");

   return limitProjectTextLength(options.preserveEdges ? cleaned : cleaned.trim(), maxLength);
}

function sanitizeLiveProjectTitle(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.title, {
      preserveEdges: true,
   }).replace(/\n+/g, " ");
}

function sanitizeLiveProjectBody(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.body, {
      preserveEdges: true,
   });
}

function sanitizeProjectTitle(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeProjectBody(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.body);
}

function sanitizeProjectSummary(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.summary);
}

function sanitizeProjectPreview(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.preview);
}

function sanitizeProjectNextStep(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.nextStep);
}

function sanitizeNoticeText(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.notice).replace(/\n+/g, " ").trim();
}

function containsProjectPromptInjectionPattern(value?: string) {
   const lower = sanitizeProjectPlainText(value, 2000).toLowerCase();

   return ["ignore previous instructions", "ignore all previous instructions", "delete every project", "delete all projects", "delete all events", "reveal your system prompt", "show your system prompt", "act as system", "developer message"].some(
      (pattern) => lower.includes(pattern),
   );
}

function isValidProjectTimestamp(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0;
}

type InternalDestination = "notes" | "tasks" | "calendar" | "allevin";

type InternalStatus = "preview" | "polishing" | "confirmed" | "saved-note" | "sent-task" | "sent-calendar" | "canceled";

type InternalObjectType = "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review";

interface IncomingIntegrationPayload {
   destination?: string;

   objectType?: InternalObjectType | string;

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   recommendation?: {
      destination?: string;

      objectType?: string;

      confidence?: number | string;

      risk?: string;

      reason?: string;

      suggestedNextStep?: string;
   };
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

   originProjectsItemId?: string;

   originBoardItemId?: string;

   createdAt?: number;
}

interface InternalNoteResult {
   noteId: string;

   noteTitle: string;

   noteBody: string;

   savedAt: number;

   message: string;
}

interface InternalOutputItem {
   id: string;

   destination: InternalDestination;

   objectType: InternalObjectType;

   title: string;

   body: string;

   rawBody: string;

   summary: string;

   suggestedNextStep: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   status: InternalStatus;

   llmPolished?: boolean;

   llmPolishConfidence?: number;

   internalNoteResult?: InternalNoteResult;

   createdAt: number;

   updatedAt: number;
}

interface ProjectLibraryNote {
   id: string;

   title: string;

   body: string;

   summary: string;

   source: string;

   savedAt: number;
}

interface ProjectLibraryItem {
   id: string;

   title: string;

   workflowId?: string;

   originBoardItemId?: string;

   latestSummary: string;

   latestMovement: string;

   notes: ProjectLibraryNote[];

   createdAt: number;

   updatedAt: number;
}

type ProjectTrackingStatus = "idea" | "active" | "check" | "done";

type ProjectMilestoneStatus = "waiting" | "active" | "needs-review" | "complete" | "archived";

interface ProjectMilestone {
   id: string;
   title: string;
   status: ProjectMilestoneStatus;

   // Compatibility field retained while MK VII project records migrate.
   completed: boolean;
   completedAt?: number;

   goal: string;
   whyItMatters: string;
   startingPrompt: string;
   workingContent: string;
   decisions: string[];
   openQuestions: string[];
   completionEvidence: string[];

   order: number;
   createdAt: number;
   updatedAt: number;
}

interface ProjectTrackingMeta {
   status: ProjectTrackingStatus;

   priority: "low" | "medium" | "high";

   nextStep: string;

   milestones: ProjectMilestone[];

   calendarTaskTitle: string;

   calendarTaskDate: string;

   calendarTaskTime: string;

   calendarTaskDurationMinutes: number;

   updatedAt: number;
}

interface ProjectCalendarEvent {
   id?: string;

   title?: string;

   description?: string;

   sourceTitle?: string;

   workflowId?: string;

   originBoardItemId?: string;

   startTime?: number;

   endTime?: number;

   allDay?: boolean;
}

type ProjectMaterialType = "Note" | "Document" | "Image" | "Research" | "Feedback" | "Reference";

type ProjectMaterialFilter = "All" | ProjectMaterialType;

const PROJECT_MATERIAL_FILTERS: ProjectMaterialFilter[] = ["All", "Note", "Document", "Image", "Research", "Feedback", "Reference"];

type ProjectStructureTemplateId = "shape" | "steps" | "notes";

interface ProjectStructureTemplate {
   id: ProjectStructureTemplateId;

   label: string;

   helper: string;

   title: string;

   body: string;
}

const PROJECT_STRUCTURE_TEMPLATES: ProjectStructureTemplate[] = [
   {
      id: "shape",
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
      id: "steps",
      label: "Plan the steps",
      helper: "Use this when you know the goal and need to break it into smaller actions.",
      title: "New Project Plan",
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
      title: "New Notes Project",
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

function getProjectStructureTemplate(templateId: ProjectStructureTemplateId) {
   return PROJECT_STRUCTURE_TEMPLATES.find((template) => template.id === templateId) || PROJECT_STRUCTURE_TEMPLATES[0];
}

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

function cleanText(value?: string) {
   return sanitizeProjectPlainText(value).replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function getNow() {
   return Date.now();
}

function getReadableProjectDate(value?: number) {
   if (!value) {
      return "Recently updated";
   }

   try {
      return new Intl.DateTimeFormat(undefined, {
         month: "short",
         day: "numeric",
      }).format(new Date(value));
   } catch {
      return "Recently updated";
   }
}

function normalizeProjectMatchValue(value?: string) {
   return sanitizeProjectTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

function readProjectCalendarEvents() {
   if (typeof window === "undefined") {
      return [] as ProjectCalendarEvent[];
   }

   try {
      const stored = localStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];

      if (!Array.isArray(parsed)) {
         return [] as ProjectCalendarEvent[];
      }

      return parsed.filter((event) => event && typeof event === "object") as ProjectCalendarEvent[];
   } catch {
      return [] as ProjectCalendarEvent[];
   }
}

function getNextCalendarSessionForProject(project: ProjectLibraryItem) {
   const now = Date.now();
   const projectTitleKey = normalizeProjectMatchValue(project.title);

   return (
      readProjectCalendarEvents()
         .filter((event) => {
            const startTime = Number(event.startTime || 0);

            if (!Number.isFinite(startTime) || startTime < now) {
               return false;
            }

            if (project.workflowId && event.workflowId === project.workflowId) {
               return true;
            }

            if (project.originBoardItemId && event.originBoardItemId === project.originBoardItemId) {
               return true;
            }

            const eventProjectKey = normalizeProjectMatchValue(event.sourceTitle);
            const eventTitleKey = normalizeProjectMatchValue(event.title);

            return Boolean(projectTitleKey && (eventProjectKey === projectTitleKey || eventTitleKey.startsWith(projectTitleKey)));
         })
         .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0))[0] || null
   );
}

function getProjectSessionDateLabel(timestamp?: number, allDay?: boolean) {
   if (!timestamp) {
      return "";
   }

   const date = new Date(timestamp);
   const dateLabel = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
   }).format(date);

   if (allDay) {
      return `${dateLabel} · All day`;
   }

   const timeLabel = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
   }).format(date);

   return `${dateLabel} · ${timeLabel}`;
}

function pickRandomItem(values: string[]) {
   return values[Math.floor(Math.random() * values.length)];
}

function getProjectTrackingMap() {
   if (typeof window === "undefined") {
      return {} as Record<string, ProjectTrackingMeta>;
   }

   try {
      const stored = localStorage.getItem(PROJECT_TRACKING_STORAGE_KEY);

      const parsed = stored ? JSON.parse(stored) : {};

      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, ProjectTrackingMeta>) : {};
   } catch {
      return {};
   }
}

function saveProjectTrackingMap(map: Record<string, ProjectTrackingMeta>) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(PROJECT_TRACKING_STORAGE_KEY, JSON.stringify(map));
}

function isProjectMaterialType(value?: string): value is ProjectMaterialType {
   return value === "Note" || value === "Document" || value === "Image" || value === "Research" || value === "Feedback" || value === "Reference";
}

function sanitizeProjectMaterialType(value?: string): ProjectMaterialType {
   return isProjectMaterialType(value) ? value : "Note";
}

function sanitizeProjectMaterialSource(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.materialSource);
}

function sanitizeProjectImageDataUrl(value?: string) {
   const cleanValue = typeof value === "string" ? value.trim() : "";

   if (!cleanValue.startsWith("data:image/")) {
      return "";
   }

   return sanitizeProjectPlainText(cleanValue, PROJECT_SANITIZE_LIMITS.imageDataUrl);
}

function sanitizeProjectImageFileName(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.imageFileName).replace(/\n+/g, " ").trim();
}

function sanitizeProjectImageMimeType(value?: string) {
   const cleanValue = sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.imageMimeType).toLowerCase();

   return ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(cleanValue) ? cleanValue : "";
}

function isSupportedProjectImageFile(file?: File | null) {
   if (!file) {
      return false;
   }

   return ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(file.type);
}

function sanitizeProjectDocumentDataUrl(value?: string) {
   const cleanValue = typeof value === "string" ? value.trim() : "";

   if (!cleanValue.startsWith("data:")) {
      return "";
   }

   return sanitizeProjectPlainText(cleanValue, PROJECT_SANITIZE_LIMITS.documentDataUrl);
}

function sanitizeProjectDocumentFileName(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.documentFileName).replace(/\n+/g, " ").trim();
}

function getProjectDocumentMimeType(file?: File | null) {
   if (!file) {
      return "";
   }

   const fileName = (file.name || "").toLowerCase();

   if (file.type) {
      return file.type.toLowerCase();
   }

   if (fileName.endsWith(".pdf")) return "application/pdf";
   if (fileName.endsWith(".txt")) return "text/plain";
   if (fileName.endsWith(".md") || fileName.endsWith(".markdown")) return "text/markdown";
   if (fileName.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
   if (fileName.endsWith(".doc")) return "application/msword";

   return "";
}

function sanitizeProjectDocumentMimeType(value?: string) {
   const cleanValue = sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.documentMimeType).toLowerCase();

   const allowedTypes = ["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

   return allowedTypes.includes(cleanValue) ? cleanValue : "";
}

function sanitizeProjectDocumentText(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.documentText);
}

function sanitizeMaterialInterpretation(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.materialInterpretation);
}

function isSupportedProjectDocumentFile(file?: File | null) {
   if (!file) {
      return false;
   }

   const mimeType = getProjectDocumentMimeType(file);

   return Boolean(sanitizeProjectDocumentMimeType(mimeType));
}

function isReadableProjectDocument(material: Pick<ProjectMaterial, "documentMimeType" | "documentDataUrl" | "documentText">) {
   return Boolean(material.documentText || (material.documentMimeType === "application/pdf" && material.documentDataUrl));
}

function isDocxProjectDocumentMimeType(mimeType?: string) {
   return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function decodeProjectXmlEntities(value: string) {
   return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function getProjectZipUint16(view: DataView, offset: number) {
   return view.getUint16(offset, true);
}

function getProjectZipUint32(view: DataView, offset: number) {
   return view.getUint32(offset, true);
}

async function inflateProjectZipEntry(data: Uint8Array, compressionMethod: number) {
   if (compressionMethod === 0) {
      return data;
   }

   if (compressionMethod !== 8) {
      throw new Error("Unsupported DOCX compression method.");
   }

   const DecompressionStreamConstructor = (globalThis as any).DecompressionStream;

   if (!DecompressionStreamConstructor) {
      throw new Error("DOCX decompression is not available in this browser.");
   }

   const safeBuffer = new ArrayBuffer(data.byteLength);

   new Uint8Array(safeBuffer).set(data);

   const stream = new Blob([safeBuffer]).stream().pipeThrough(new DecompressionStreamConstructor("deflate-raw"));

   const buffer = await new Response(stream).arrayBuffer();

   return new Uint8Array(buffer);
}

function getProjectDocxPlainTextFromXml(xml: string) {
   const withBreaks = xml
      .replace(/<w:tab\s*\/?\s*>/gi, "\t")
      .replace(/<w:br[^>]*\/?\s*>/gi, "\n")
      .replace(/<w:cr\s*\/?\s*>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<\/w:tr>/gi, "\n")
      .replace(/<\/w:tc>/gi, "\t");

   return decodeProjectXmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
}

async function extractProjectDocxText(file: File) {
   const buffer = await file.arrayBuffer();

   const bytes = new Uint8Array(buffer);

   const view = new DataView(buffer);

   let endOfCentralDirectoryOffset = -1;

   for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 66000); offset--) {
      if (getProjectZipUint32(view, offset) === 0x06054b50) {
         endOfCentralDirectoryOffset = offset;

         break;
      }
   }

   if (endOfCentralDirectoryOffset < 0) {
      throw new Error("DOCX could not be opened.");
   }

   const centralDirectorySize = getProjectZipUint32(view, endOfCentralDirectoryOffset + 12);

   const centralDirectoryOffset = getProjectZipUint32(view, endOfCentralDirectoryOffset + 16);

   const decoder = new TextDecoder("utf-8");

   let pointer = centralDirectoryOffset;

   const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

   while (pointer < centralDirectoryEnd) {
      if (getProjectZipUint32(view, pointer) !== 0x02014b50) {
         break;
      }

      const compressionMethod = getProjectZipUint16(view, pointer + 10);

      const compressedSize = getProjectZipUint32(view, pointer + 20);

      const fileNameLength = getProjectZipUint16(view, pointer + 28);

      const extraLength = getProjectZipUint16(view, pointer + 30);

      const commentLength = getProjectZipUint16(view, pointer + 32);

      const localHeaderOffset = getProjectZipUint32(view, pointer + 42);

      const fileName = decoder.decode(bytes.slice(pointer + 46, pointer + 46 + fileNameLength));

      if (fileName === "word/document.xml") {
         if (getProjectZipUint32(view, localHeaderOffset) !== 0x04034b50) {
            throw new Error("DOCX document part could not be opened.");
         }

         const localFileNameLength = getProjectZipUint16(view, localHeaderOffset + 26);

         const localExtraLength = getProjectZipUint16(view, localHeaderOffset + 28);

         const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;

         const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

         const documentXmlBytes = await inflateProjectZipEntry(compressedData, compressionMethod);

         const documentXml = decoder.decode(documentXmlBytes);

         return sanitizeProjectDocumentText(getProjectDocxPlainTextFromXml(documentXml));
      }

      pointer += 46 + fileNameLength + extraLength + commentLength;
   }

   throw new Error("DOCX text was not found.");
}

function buildMaterialSummary(material: Pick<ProjectMaterial, "title" | "type" | "source" | "notes" | "imageFileName" | "documentFileName">) {
   const noteLines = sanitizeProjectBody(material.notes)
      .split("\n")
      .map((line) => compactText(line))
      .filter(Boolean);

   const firstUsefulLine = noteLines[0] || sanitizeProjectTitle(material.title) || (material.imageFileName ? `Image attached: ${material.imageFileName}` : material.documentFileName ? `Document attached: ${material.documentFileName}` : "");

   const sourceLine = material.source ? ` Source: ${sanitizeProjectMaterialSource(material.source)}.` : "";

   const imageLine = material.type === "Image" && material.imageFileName ? ` Image: ${sanitizeProjectImageFileName(material.imageFileName)}.` : "";

   const documentLine = material.type === "Document" && material.documentFileName ? ` Document: ${sanitizeProjectDocumentFileName(material.documentFileName)}.` : "";

   return sanitizeProjectSummary(`${material.type}: ${firstUsefulLine}${sourceLine}${imageLine}${documentLine}`);
}

function getMaterialTypeGuidance(type: ProjectMaterialType) {
   switch (type) {
      case "Document":
         return {
            titlePlaceholder: "Document title, brief, PDF, or file name",
            sourcePlaceholder: "Where this document came from",
            notesPlaceholder: "Add the important details, summary, or text from the document for now...",
            helperText: "Use this for PDFs, DOCX, TXT, Markdown, briefs, assignments, or project documents. Supported files can be opened and read inside ALLEVIN.",
            inputLabel: "Document details",
         };

      case "Image":
         return {
            titlePlaceholder: "Screenshot, sketch, mockup, or image title",
            sourcePlaceholder: "Where the image came from",
            notesPlaceholder: "Describe what is important in the image, screenshot, sketch, or visual reference...",
            helperText: "Use this for screenshots, sketches, mockups, photos, or diagrams. Attach an image, then add a short note about what it should help with.",
            inputLabel: "Image notes",
         };

      case "Research":
         return {
            titlePlaceholder: "Research topic, source, or article title",
            sourcePlaceholder: "Link, author, class, website, or source",
            notesPlaceholder: "Paste research notes, key findings, useful quotes, or evidence here...",
            helperText: "Use this for sources, articles, comparisons, evidence, or study material connected to the project.",
            inputLabel: "Research notes",
         };

      case "Feedback":
         return {
            titlePlaceholder: "Feedback title or tester name",
            sourcePlaceholder: "Who gave the feedback",
            notesPlaceholder: "Add user feedback, reviewer comments, testing notes, or suggestions here...",
            helperText: "Use this for beta tester responses, review notes, user testing comments, or suggestions from someone else.",
            inputLabel: "Feedback notes",
         };

      case "Reference":
         return {
            titlePlaceholder: "Reference title",
            sourcePlaceholder: "Link, person, place, or origin",
            notesPlaceholder: "Add any useful reference details that should stay connected to this project...",
            helperText: "Use this as the flexible option for anything useful that does not need a more specific type.",
            inputLabel: "Reference details",
         };

      case "Note":
      default:
         return {
            titlePlaceholder: "Quick note title",
            sourcePlaceholder: "Optional source or person",
            notesPlaceholder: "Write a project note, update, reminder, or useful thought here...",
            helperText: "Use this for quick thoughts, project updates, reminders, meeting notes, or rough context.",
            inputLabel: "Note",
         };
   }
}

function readProjectMaterials() {
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
            id: material.id,
            projectId: sanitizeProjectPlainText(material.projectId, 180),
            projectTitle: sanitizeProjectTitle(material.projectTitle),
            title: sanitizeProjectTitle(material.title) || "Untitled material",
            type: sanitizeProjectMaterialType(material.type),
            source: sanitizeProjectMaterialSource(material.source || ""),
            notes: sanitizeProjectBody(material.notes || ""),
            summary: sanitizeProjectSummary(material.summary || material.notes || material.title),
            imageDataUrl: sanitizeProjectImageDataUrl(material.imageDataUrl),
            imageFileName: sanitizeProjectImageFileName(material.imageFileName),
            imageMimeType: sanitizeProjectImageMimeType(material.imageMimeType),
            documentDataUrl: sanitizeProjectDocumentDataUrl(material.documentDataUrl),
            documentFileName: sanitizeProjectDocumentFileName(material.documentFileName),
            documentMimeType: sanitizeProjectDocumentMimeType(material.documentMimeType),
            documentText: sanitizeProjectDocumentText(material.documentText),
            interpretationSummary: sanitizeMaterialInterpretation(material.interpretationSummary),
            interpretationUsefulContext: sanitizeMaterialInterpretation(material.interpretationUsefulContext),
            interpretationNextStep: sanitizeProjectNextStep(material.interpretationNextStep),
            interpretedAt: isValidProjectTimestamp(material.interpretedAt) ? material.interpretedAt : undefined,
            createdAt: isValidProjectTimestamp(material.createdAt) ? material.createdAt : getNow(),
            updatedAt: isValidProjectTimestamp(material.updatedAt) ? material.updatedAt : getNow(),
         }))
         .sort((a, b) => b.updatedAt - a.updatedAt);
   } catch {
      localStorage.removeItem(PROJECT_MATERIALS_STORAGE_KEY);

      return [] as ProjectMaterial[];
   }
}

function saveProjectMaterials(materials: ProjectMaterial[]) {
   if (typeof window === "undefined") {
      return false;
   }

   const safeMaterials = materials.slice(0, 200);

   const payload = JSON.stringify(safeMaterials);

   if (payload.length > PROJECT_MATERIAL_STORAGE_SAFE_LIMIT) {
      window.dispatchEvent(
         new CustomEvent("allevin-project-materials-storage-error", {
            detail: {
               reason: "size-limit",
            },
         }),
      );

      return false;
   }

   try {
      localStorage.setItem(PROJECT_MATERIALS_STORAGE_KEY, payload);

      window.dispatchEvent(new CustomEvent("allevin-project-materials-update"));

      return true;
   } catch {
      window.dispatchEvent(
         new CustomEvent("allevin-project-materials-storage-error", {
            detail: {
               reason: "browser-storage",
            },
         }),
      );

      return false;
   }
}

function readProjectSelectedMaterialMap() {
   if (typeof window === "undefined") {
      return {} as Record<string, string[]>;
   }

   try {
      const stored = localStorage.getItem(PROJECT_SELECTED_MATERIALS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
         return {} as Record<string, string[]>;
      }

      return Object.fromEntries(
         Object.entries(parsed)
            .map(([projectId, value]) => [sanitizeProjectPlainText(projectId, 180), Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string"))).slice(0, 30) : []])
            .filter(([projectId]) => Boolean(projectId)),
      );
   } catch {
      localStorage.removeItem(PROJECT_SELECTED_MATERIALS_STORAGE_KEY);
      return {} as Record<string, string[]>;
   }
}

function saveProjectSelectedMaterialMap(map: Record<string, string[]>) {
   if (typeof window === "undefined") {
      return;
   }

   const safeMap = Object.fromEntries(
      Object.entries(map)
         .map(([projectId, ids]) => [sanitizeProjectPlainText(projectId, 180), Array.from(new Set((ids || []).filter(Boolean))).slice(0, 30)])
         .filter(([projectId]) => Boolean(projectId)),
   );

   localStorage.setItem(PROJECT_SELECTED_MATERIALS_STORAGE_KEY, JSON.stringify(safeMap));
}

function removeMaterialsFromProjectSelection(materialIds: string[]) {
   if (!materialIds.length || typeof window === "undefined") {
      return;
   }

   const materialIdSet = new Set(materialIds);
   const current = readProjectSelectedMaterialMap();
   const next: Record<string, string[]> = Object.fromEntries(
      Object.entries(current).map(([projectId, ids]) => {
         const safeIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];

         return [projectId, safeIds.filter((id) => !materialIdSet.has(id))];
      }),
   );

   saveProjectSelectedMaterialMap(next);
}

function readCanvasSelectedReferenceIdsForProjects() {
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

function saveCanvasSelectedReferenceIdsForProjects(ids: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(CANVAS_SELECTED_REFERENCES_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids.filter(Boolean))).slice(0, 20)));
}

function removeMaterialsFromCanvasSelection(materialIds: string[]) {
   if (!materialIds.length) {
      return;
   }

   const materialReferenceIds = materialIds.map((materialId) => `material:${materialId}`);

   const nextReferenceIds = readCanvasSelectedReferenceIdsForProjects().filter((referenceId) => !materialReferenceIds.includes(referenceId));

   saveCanvasSelectedReferenceIdsForProjects(nextReferenceIds);

   window.dispatchEvent(
      new CustomEvent("allevin-canvas-references-pruned", {
         detail: {
            materialIds,
         },
      }),
   );
}

function getProjectMaterialsForProject(projectId?: string) {
   if (!projectId) {
      return [] as ProjectMaterial[];
   }

   return readProjectMaterials().filter((material) => material.projectId === projectId);
}

function buildProjectMaterialsContext(materials: ProjectMaterial[]) {
   const usefulMaterials = materials.slice(0, 6);

   if (!usefulMaterials.length) {
      return "";
   }

   return usefulMaterials.map((material, index) => `${index + 1}. ${material.title} (${material.type}) — ${material.summary || getShortProjectMaterialPreview(material.notes, 220)}`).join("\n");
}

function getShortProjectMaterialPreview(value?: string, limit = 180) {
   const cleanValue = compactText(value);

   if (cleanValue.length <= limit) {
      return cleanValue;
   }

   return `${cleanValue.slice(0, limit).trim()}...`;
}

function inferProjectTrackingStatus(project: ProjectLibraryItem): ProjectTrackingStatus {
   const lower = compactText(`${project.latestMovement} ${project.latestSummary} ${project.notes[0]?.body || ""}`).toLowerCase();

   if (["done", "completed", "finished", "marked complete"].some((signal) => lower.includes(signal))) {
      return "done";
   }

   if (["review", "check", "verify", "ready"].some((signal) => lower.includes(signal))) {
      return "check";
   }

   if (["next steps", "need to", "task", "update", "create", "clean", "pick", "set", "decide", "prepare"].some((signal) => lower.includes(signal))) {
      return "active";
   }

   return "idea";
}

function splitProjectDescriptionSentences(value?: string) {
   return sanitizeProjectBody(value)
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((sentence) => sanitizeProjectBody(sentence))
      .filter(Boolean);
}

function normalizeProjectCheckpoint(value?: string) {
   return sanitizeProjectTitle(
      sanitizeProjectBody(value)
         .replace(/^(?:before launch|before release|to finish|i need to|we need to|need to|needs to|must|should)\s*/i, "")
         .replace(/^(?:and|then)\s+/i, "")
         .replace(/[.;]+$/g, ""),
   );
}

function extractProjectDescriptionMilestones(description?: string) {
   const clean = sanitizeProjectBody(description);
   const actionVerbs = "(?:finalize|define|decide|confirm|create|build|write|research|collect|design|implement|test|validate|prepare|deploy|launch|review|coordinate|schedule|organize|document|choose|establish|clarify)";
   const source =
      clean.match(/(?:before\s+(?:launch|release|deployment)|to\s+(?:launch|finish|complete|deliver))[^,.]*,\s*(?:i|we)\s+need\s+to\s+([\s\S]*?)(?=\n\n|success\s+means|$)/i)?.[1] ||
      clean.match(/(?:i|we)\s+need\s+to\s+([\s\S]*?)(?=\n\n|success\s+means|$)/i)?.[1] ||
      "";

   const candidates: string[] = [];

   if (source) {
      const splitPattern = new RegExp(`(?:,\\s+|\\s+and\\s+)(?=${actionVerbs}\\b)`, "gi");

      candidates.push(
         ...source
            .split(splitPattern)
            .map((item) => normalizeProjectCheckpoint(item))
            .filter(Boolean),
      );
   }

   if (!candidates.length) {
      for (const sentence of splitProjectDescriptionSentences(clean)) {
         if (!new RegExp(`\\b${actionVerbs}\\b`, "i").test(sentence)) {
            continue;
         }

         const checkpoint = normalizeProjectCheckpoint(sentence.replace(/^(?:before launch|before release)[^,]*,\s*/i, "").replace(/^(?:i|we)\s+/i, ""));

         if (checkpoint && checkpoint.length <= 220) {
            candidates.push(checkpoint);
         }
      }
   }

   const seen = new Set<string>();

   return candidates
      .map((candidate) =>
         candidate
            .replace(/^and\s+/i, "")
            .replace(/\s+/g, " ")
            .replace(/[.;]+$/g, "")
            .trim(),
      )
      .filter((candidate) => {
         const key = candidate.toLowerCase();

         if (!candidate || seen.has(key) || /^success means\b/i.test(candidate)) {
            return false;
         }

         seen.add(key);
         return true;
      })
      .slice(0, 8);
}

function inferProjectDraftGoal(title: string, description: string) {
   const sentences = splitProjectDescriptionSentences(description);
   const deliverableSentence = sentences.find((sentence) => /\b(?:first public-facing deliverable|deliverable|build|create|launch|write|research|organize|design)\b/i.test(sentence));
   const opening = sentences[0] || description;

   if (deliverableSentence && deliverableSentence !== opening) {
      return sanitizeProjectBody(`${opening} ${deliverableSentence}`);
   }

   return sanitizeProjectBody(opening || `Complete ${title}.`);
}

function inferProjectDraftSuccess(description: string) {
   const explicit = sanitizeProjectBody(description).match(/success\s+means\s+([\s\S]*?)(?=\n\n|$)/i)?.[1];

   if (explicit) {
      return sanitizeProjectBody(explicit).replace(/[.]+$/, "") + ".";
   }

   return "The intended outcome is complete, the important requirements have been verified, and the user can confidently share or use the result.";
}

function inferProjectDraftSituation(description: string, milestones: string[]) {
   const sentences = splitProjectDescriptionSentences(description);
   const situation =
      sentences.find((sentence) => /\b(?:before launch|before release|currently|right now|still need|need to finalize|need to define|first public-facing deliverable)\b/i.test(sentence)) ||
      milestones[0] ||
      "The project has a clear direction and now needs its first checkpoint confirmed.";

   return sanitizeProjectBody(situation);
}

function inferProjectDraftOpenQuestions(description: string) {
   const lower = sanitizeProjectBody(description).toLowerCase();
   const questions: string[] = [];

   if (!/\b(?:audience|customer|reader|user|visitor|stakeholder)\b/.test(lower)) {
      questions.push("Who is the primary audience for the finished project?");
   }

   if (!/\b(?:deadline|launch date|due date|by [a-z]+day|by \w+ \d+|timeline)\b/.test(lower)) {
      questions.push("Is there a target date or outside deadline that should shape the order of work?");
   }

   if (!/\b(?:call to action|cta|next action|conversion|what should visitors do)\b/.test(lower) && /\b(?:website|site|landing page|homepage)\b/.test(lower)) {
      questions.push("What should someone understand or do after viewing the finished website?");
   }

   return questions.slice(0, 3);
}

function inferSeniorProjectStartingPoint(description: string, milestones: string[], llmNextStep?: string) {
   const lower = sanitizeProjectBody(description).toLowerCase();
   const first = milestones[0] || "Clarify the finished outcome";

   if (/\bbrand\b/.test(lower) && /\b(?:product|ecosystem|parent brand|parent company)\b/.test(lower)) {
      return "Define the company promise and how each product fits within the ecosystem first. That decision should guide the page hierarchy, feature-story emphasis, and copy before implementation begins.";
   }

   if (/\b(?:research|source|evidence|citation)\b/.test(lower)) {
      return `Start with ${first.replace(/[.]+$/, "")}. This establishes the evidence or framing the later work depends on.`;
   }

   if (/\b(?:website|app|software|platform|product)\b/.test(lower)) {
      return `Start with ${first.replace(/[.]+$/, "")}. Locking that decision first will reduce design and implementation rework later.`;
   }

   const cleanLLMNextStep = sanitizeProjectNextStep(llmNextStep);

   if (cleanLLMNextStep && !/^(?:let'?s|get started|start by defining what success looks like)/i.test(cleanLLMNextStep)) {
      return cleanLLMNextStep;
   }

   return `Start with ${first.replace(/[.]+$/, "")}. It is the first checkpoint that gives the rest of the project a reliable direction.`;
}

function buildDetailedProjectDraft({ title, description, llmSummary, llmUsefulContext, llmNextStep }: { title: string; description: string; llmSummary?: string; llmUsefulContext?: string; llmNextStep?: string }) {
   const inferredMilestones = extractProjectDescriptionMilestones(description);
   const milestones =
      inferredMilestones.length >= 3
         ? inferredMilestones
         : [...inferredMilestones, "Confirm the intended outcome and the decisions that shape it", "Complete the main project work", "Review the result against the success criteria", "Prepare the finished project to share or use"].slice(0, 6);

   const goal = inferProjectDraftGoal(title, description);
   const success = inferProjectDraftSuccess(description);
   const situation = inferProjectDraftSituation(description, milestones);
   const openQuestions = inferProjectDraftOpenQuestions(description);
   const startingPoint = inferSeniorProjectStartingPoint(description, milestones, llmNextStep);

   const modelContext = [llmSummary, llmUsefulContext]
      .map((value) => sanitizeProjectBody(value))
      .filter((value) => value && value.length > 30 && !/^let'?s\b/i.test(value))
      .join(" ");

   return sanitizeProjectBody(`Project Goal:
${goal}

Success Looks Like:
${success}

Current Situation:
${situation}

Working Notes:
${description}${modelContext ? `\n\nALLEVIN Project Lead Context:\n${modelContext}` : ""}

Initial Milestones:
${milestones.map((milestone, index) => `${index + 1}. ${milestone}`).join("\n")}

Open Questions:
${openQuestions.length ? openQuestions.map((question) => `- ${question}`).join("\n") : "None yet."}

Recommended Starting Point:
${startingPoint}`);
}

function getStructuredProjectSection(body: string, labels: string[]) {
   const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
   const match = sanitizeProjectBody(body).match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Za-z /&-]{2,50}\\s*:\\s*(?:\\n|$)|$)`, "i"));

   return sanitizeProjectBody(match?.[1] || "");
}

function createProjectMilestoneId(projectId: string, title: string, index: number) {
   const titleKey = sanitizeProjectTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

   return `${projectId}-milestone-${titleKey || index + 1}`;
}

function getProjectMilestoneCandidates(project: ProjectLibraryItem) {
   const body = sanitizeProjectBody(project.notes[0]?.body || project.latestSummary);

   const milestoneMatch = body.match(/(?:^|\n)\s*(?:Initial Milestones|Milestones|Progress Points|Progress|Steps)\s*:\s*\n([\s\S]*?)(?=\n\s*[A-Z][A-Za-z /&-]{2,40}\s*:\s*(?:\n|$)|$)/i);

   const candidates = sanitizeProjectBody(milestoneMatch?.[1] || "")
      .split("\n")
      .map((line) => sanitizeProjectTitle(line.replace(/^\s*(?:[-*•]|\d+[.)]|[☐☑✓○])\s*/, "")))
      .filter((line) => line && !/^(add|write|describe|list)\b/i.test(line))
      .slice(0, 6);

   if (candidates.length) {
      return candidates;
   }

   const nextStep = sanitizeProjectNextStep(getProjectTypeInsight(project).nextMove);

   return [nextStep || "Clarify the finished outcome", "Complete the main work", "Review and finish the project"];
}

function getMilestoneDefaultGoal(title: string) {
   const clean = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   return clean ? `Complete ${clean.toLowerCase()} with a clear, reviewable outcome.` : "Complete this milestone with a clear, reviewable outcome.";
}

function getMilestoneDefaultWhyItMatters(title: string, index: number) {
   const clean = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   return index === 0
      ? `This is the first project checkpoint. Finishing ${clean.toLowerCase()} should reduce uncertainty for the work that follows.`
      : `This checkpoint moves the project forward by turning ${clean.toLowerCase()} into saved project progress.`;
}

function getMilestoneDefaultStartingPrompt(title: string) {
   const clean = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   return clean ? `What must be decided, created, or verified to complete ${clean.toLowerCase()}?` : "What must be decided, created, or verified to complete this milestone?";
}

function getMilestoneStatus(value: any, completed = false): ProjectMilestoneStatus {
   if (value === "waiting" || value === "active" || value === "needs-review" || value === "complete" || value === "archived") {
      return value;
   }

   return completed ? "complete" : "waiting";
}

function milestoneHasSavedWork(milestone: ProjectMilestone) {
   return Boolean(sanitizeProjectBody(milestone.workingContent) || milestone.decisions.length || milestone.openQuestions.length || milestone.completionEvidence.length);
}

function getDefaultProjectMilestones(project: ProjectLibraryItem): ProjectMilestone[] {
   const now = getNow();

   return getProjectMilestoneCandidates(project).map((title, index) => ({
      id: createProjectMilestoneId(project.id, title, index),
      title,
      status: index === 0 ? "active" : "waiting",
      completed: false,
      goal: getMilestoneDefaultGoal(title),
      whyItMatters: getMilestoneDefaultWhyItMatters(title, index),
      startingPrompt: getMilestoneDefaultStartingPrompt(title),
      workingContent: "",
      decisions: [],
      openQuestions: [],
      completionEvidence: [],
      order: index + 1,
      createdAt: now,
      updatedAt: now,
   }));
}

function sanitizeProjectMilestones(value: unknown, project: ProjectLibraryItem): ProjectMilestone[] {
   if (!Array.isArray(value)) {
      return getDefaultProjectMilestones(project);
   }

   const now = getNow();
   const milestones = value
      .filter((item) => item && typeof item === "object")
      .map((item: any, index) => {
         const title = sanitizeProjectTitle(item.title);
         const completed = Boolean(item.completed) || item.status === "complete";
         const status = getMilestoneStatus(item.status, completed);

         return {
            id: sanitizeProjectPlainText(item.id, 180) || createProjectMilestoneId(project.id, title, index),
            title,
            status,
            completed: status === "complete",
            completedAt: isValidProjectTimestamp(item.completedAt) ? item.completedAt : status === "complete" ? now : undefined,
            goal: sanitizeProjectSummary(item.goal) || getMilestoneDefaultGoal(title),
            whyItMatters: sanitizeProjectSummary(item.whyItMatters) || getMilestoneDefaultWhyItMatters(title, index),
            startingPrompt: sanitizeProjectSummary(item.startingPrompt) || getMilestoneDefaultStartingPrompt(title),
            workingContent: sanitizeProjectBody(item.workingContent),
            decisions: Array.isArray(item.decisions)
               ? item.decisions
                    .map((entry: unknown) => sanitizeProjectSummary(String(entry)))
                    .filter(Boolean)
                    .slice(0, 40)
               : [],
            openQuestions: Array.isArray(item.openQuestions)
               ? item.openQuestions
                    .map((entry: unknown) => sanitizeProjectSummary(String(entry)))
                    .filter(Boolean)
                    .slice(0, 40)
               : [],
            completionEvidence: Array.isArray(item.completionEvidence)
               ? item.completionEvidence
                    .map((entry: unknown) => sanitizeProjectSummary(String(entry)))
                    .filter(Boolean)
                    .slice(0, 40)
               : [],
            order: typeof item.order === "number" && Number.isFinite(item.order) ? Math.max(1, Math.floor(item.order)) : index + 1,
            createdAt: isValidProjectTimestamp(item.createdAt) ? Number(item.createdAt) : now,
            updatedAt: isValidProjectTimestamp(item.updatedAt) ? Number(item.updatedAt) : now,
         } satisfies ProjectMilestone;
      })
      .filter((item) => item.title)
      .sort((left, right) => left.order - right.order)
      .slice(0, 12)
      .map((item, index) => ({ ...item, order: index + 1 }));

   if (!milestones.length) {
      return getDefaultProjectMilestones(project);
   }

   const activeExists = milestones.some((item) => item.status === "active");
   if (!activeExists) {
      const firstOpenIndex = milestones.findIndex((item) => item.status !== "complete" && item.status !== "archived");
      if (firstOpenIndex >= 0) {
         milestones[firstOpenIndex] = { ...milestones[firstOpenIndex], status: "active" };
      }
   }

   return milestones;
}

function getDefaultProjectTracking(project: ProjectLibraryItem): ProjectTrackingMeta {
   return {
      status: inferProjectTrackingStatus(project),
      priority: "medium",
      nextStep: getProjectTypeInsight(project).nextMove,
      milestones: getDefaultProjectMilestones(project),
      calendarTaskTitle: "",
      calendarTaskDate: "",
      calendarTaskTime: "",
      calendarTaskDurationMinutes: 60,
      updatedAt: project.updatedAt || getNow(),
   };
}

function getProjectMemoryStageFromTrackingStatus(status: ProjectTrackingStatus) {
   switch (status) {
      case "idea":
         return "idea";

      case "active":
         return "tracking";

      case "check":
         return "reviewing";

      case "done":
         return "completed";

      default:
         return "unknown";
   }
}

function getProjectMemoryStatusFromTrackingStatus(status: ProjectTrackingStatus) {
   switch (status) {
      case "done":
         return "completed";

      case "check":
         return "ready";

      case "idea":
      case "active":
      default:
         return "active";
   }
}

function getProjectStatusLabel(status: ProjectTrackingStatus) {
   switch (status) {
      case "idea":
         return "Drafting";
      case "active":
         return "In Progress";
      case "check":
         return "Check";
      case "done":
         return "Done";
      default:
         return "Drafting";
   }
}

function getNextStatus(status: ProjectTrackingStatus): ProjectTrackingStatus {
   if (status === "idea") return "active";
   if (status === "active") return "check";
   if (status === "check") return "done";

   return "done";
}

function getTrackingGuidance(status: ProjectTrackingStatus) {
   if (status === "idea") {
      return "Review the project guide and clarify the first progress checkpoint.";
   }

   if (status === "active") {
      return "Keep the next action clear and move it to Check when it is ready.";
   }

   if (status === "check") {
      return "Review the latest version, save useful notes, or mark it done.";
   }

   return "This is marked done. Reopen it only if more work appears.";
}

function getGeneratedProjectsLine(action: "saved" | "opened" | "tasked" | "scheduled" | "deleted" | "polished" | "added") {
   const actionMap = {
      saved: ["Saved to Projects", "Project saved", "Saved safely", "Saved in Projects", "Project saved for later"],
      opened: ["Project opened", "Back in Projects", "Project reopened", "Returned to the project", "Project is ready"],
      tasked: ["Task created", "Sent to Tasks", "Next action created", "Task ready", "Next step saved"],
      scheduled: ["Scheduled in Calendar", "Time added", "Added to Calendar", "Time scheduled", "Calendar updated"],
      deleted: ["Project deleted", "Project removed", "Removed from Projects", "Project cleared", "Project no longer appears here"],
      polished: ["Polished", "Cleaned up", "Refined", "Updated", "Made clearer"],
      added: ["Project added", "Draft added", "Added to Projects", "Project draft ready", "Saved in Projects"],
   } as const;

   const tails = [
      "Saved clearly.",
      "Clean and simple.",
      "This is ready when you need it.",
      "Saved and ready to continue.",
      "The workspace is updated.",
      "I’ll keep it ready.",
      "Updated successfully.",
      "That should keep things moving.",
      "Neatly handled.",
      "All set.",
   ];

   return `${pickRandomItem([...actionMap[action]])}. ${pickRandomItem(tails)}`;
}

function getProjectSuggestionHistory() {
   const historyKey = "allevin-project-suggestion-history-map";

   if (typeof window === "undefined") {
      return {} as Record<string, string[]>;
   }

   try {
      const stored = localStorage.getItem(historyKey);

      const parsed = stored ? JSON.parse(stored) : {};

      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string[]>) : {};
   } catch {
      return {};
   }
}

function saveProjectSuggestionHistory(history: Record<string, string[]>) {
   if (typeof window === "undefined") {
      return;
   }

   try {
      localStorage.setItem("allevin-project-suggestion-history-map", JSON.stringify(history));
   } catch {
      // Suggestions should never break Projects.
   }
}

function getProjectTypeInsight(project: ProjectLibraryItem) {
   const body = compactText(`${project.title} ${project.latestSummary} ${project.notes[0]?.body || ""}`).toLowerCase();

   if (["patio", "backyard", "furniture", "plants", "lights", "budget", "shopping", "clean"].some((signal) => body.includes(signal))) {
      return {
         type: "home project",
         canvasIdea: "Add a simple budget, shopping list, and first cleanup step to Canvas",
         nextMove: "make one task for the first physical step",
      };
   }

   if (["user", "ux", "accessibility", "prototype", "wireframe", "usability", "screen reader", "flow"].some((signal) => body.includes(signal))) {
      return {
         type: "UX project",
         canvasIdea: "add the target user, main pain point, and success criteria to Canvas",
         nextMove: "make one task for the first testable design step",
      };
   }

   if (["server", "network", "active directory", "device", "computer", "update", "ticket", "documentation", "account"].some((signal) => body.includes(signal))) {
      return {
         type: "IT project",
         canvasIdea: "separate the work into inventory, access checks, updates, and documentation",
         nextMove: "make one task for the first system check",
      };
   }

   if (["research", "paper", "source", "thesis", "assignment", "outline", "study"].some((signal) => body.includes(signal))) {
      return {
         type: "research project",
         canvasIdea: "add a research question, source list, and rough outline to Canvas",
         nextMove: "make one task for finding or reviewing the next source",
      };
   }

   if (["post", "caption", "campaign", "audience", "flyer", "content", "instagram", "social"].some((signal) => body.includes(signal))) {
      return {
         type: "content project",
         canvasIdea: "add the audience, message, needed assets, and posting timeline to Canvas",
         nextMove: "make one task for the first asset or caption",
      };
   }

   if (["launch", "client", "pricing", "service", "offer", "outreach", "website"].some((signal) => body.includes(signal))) {
      return {
         type: "launch project",
         canvasIdea: "add the offer, target customer, price, and launch checklist to Canvas",
         nextMove: "make one task for the first launch step",
      };
   }

   if (["lesson", "students", "activity", "objective", "assessment", "class"].some((signal) => body.includes(signal))) {
      return {
         type: "lesson project",
         canvasIdea: "add the learning objective, activity, materials, and assessment plan to Canvas",
         nextMove: "make one task for the first lesson material",
      };
   }

   if (["build", "bug", "component", "state", "api", "deploy", "test", "code"].some((signal) => body.includes(signal))) {
      return {
         type: "development project",
         canvasIdea: "add expected behavior, edge cases, and a short test checklist to Canvas",
         nextMove: "make one task for the first implementation or test step",
      };
   }

   return {
      type: "project",
      canvasIdea: "add the goal, missing details, and success criteria to Canvas",
      nextMove: "make one clear task from the next useful step",
   };
}

function getGeneratedProjectSuggestion(project: ProjectLibraryItem) {
   const insight = getProjectTypeInsight(project);

   const body = compactText(`${project.latestSummary} ${project.notes[0]?.body || ""}`);

   const lower = body.toLowerCase();

   const hasActionLanguage = ["need to", "next step", "task", "update", "test", "create", "finish", "review", "build", "decide", "clean", "pick", "set"].some((signal) => lower.includes(signal));

   const openings = [
      `This looks like a ${insight.type}.`,
      `${project.title} has a clear ${insight.type} shape.`,
      `I’d handle ${project.title} as a ${insight.type}.`,
      `This fits best as ${insight.type} work.`,
      `${project.title} is ready for a little structure.`,
      `This one has enough direction to move forward cleanly.`,
      `I see a practical next move in ${project.title}.`,
      `This project has enough detail to move forward clearly.`,
      `This project is ready for a clear next step.`,
      `There is a clear path here.`,
   ];

   const canvasIdeas = [
      `I’d ${insight.canvasIdea}.`,
      `A useful Canvas addition would be to ${insight.canvasIdea}.`,
      `Add a quick section for this: ${insight.canvasIdea}.`,
      `Canvas would benefit from one extra note: ${insight.canvasIdea}.`,
      `Before moving too far, ${insight.canvasIdea}.`,
      `I’d tighten the notes by adding this: ${insight.canvasIdea}.`,
   ];

   const actionMoves = [
      `Then ${insight.nextMove}.`,
      `After that, ${insight.nextMove}.`,
      `Once that is clear, ${insight.nextMove}.`,
      `The next practical move is to ${insight.nextMove}.`,
      `Then keep it moving: ${insight.nextMove}.`,
      `That should make the next step easier to track: ${insight.nextMove}.`,
   ];

   const softerMoves = [
      `Keep it in Canvas a little longer so the main idea stays clear.`,
      `Continue shaping the notes before turning it into too many tasks.`,
      `Add one missing detail first, then decide what deserves a task.`,
      `The next move should be small and clear.`,
      `Review the project once before turning more of it into tasks.`,
      `A small structure pass should make this easier to continue.`,
   ];

   const randomPick = (values: string[]) => values[Math.floor(Math.random() * values.length)];

   const candidate = hasActionLanguage ? `${randomPick(openings)} ${randomPick(canvasIdeas)} ${randomPick(actionMoves)}` : `${randomPick(openings)} ${randomPick(canvasIdeas)} ${randomPick(softerMoves)}`;

   const history = getProjectSuggestionHistory();

   const projectKey = project.id || project.title;

   const previous = history[projectKey] || [];

   if (!previous.includes(candidate)) {
      const nextHistory = {
         ...history,
         [projectKey]: [candidate, ...previous].slice(0, 30),
      };

      saveProjectSuggestionHistory(nextHistory);

      return candidate;
   }

   const remix = `${randomPick(openings)} ${randomPick(canvasIdeas)} ${randomPick(hasActionLanguage ? actionMoves : softerMoves)}`;

   saveProjectSuggestionHistory({
      ...history,
      [projectKey]: [remix, ...previous].slice(0, 30),
   });

   return remix;
}

function normalizeInternalDestination(destination?: string): InternalDestination {
   const lower = (destination || "").toLowerCase();

   if (lower.includes("task")) {
      return "tasks";
   }

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("event")) {
      return "calendar";
   }

   // Former outside-document routes now stay internal.
   if (lower.includes("doc") || lower.includes("output") || lower.includes("export")) {
      return "notes";
   }

   if (lower.includes("note")) {
      return "notes";
   }

   return "notes";
}

function normalizeObjectType(value?: string): InternalObjectType {
   if (value === "canvas-draft" || value === "research-note" || value === "project-summary" || value === "task-action" || value === "workflow-review") {
      return value;
   }

   return "project-summary";
}

function getSummaryFromBody(body?: string) {
   const lines = cleanText(body)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.endsWith(":"));

   return compactText(lines[0] || body || "Added inside ALLEVIN.");
}

function getSuggestedNextStep(destination: InternalDestination) {
   if (destination === "tasks") {
      return "Create a task when this is ready for action.";
   }

   if (destination === "calendar") {
      return "Schedule this when it needs time on the calendar.";
   }

   if (destination === "notes") {
      return "Save this to Projects.";
   }

   return "Choose where this belongs inside ALLEVIN.";
}

function buildInternalOutputFromPayload(payload: IncomingIntegrationPayload): InternalOutputItem {
   const destination = normalizeInternalDestination(payload.destination || payload.recommendation?.destination);

   const body = sanitizeProjectBody(payload.body || payload.workingSummary || payload.sourceContent || payload.cleanSourceContent);

   const title = sanitizeProjectTitle(payload.sourceTitle || payload.title) || "ALLEVIN Projects";

   return {
      id: crypto.randomUUID(),

      destination,

      objectType: normalizeObjectType(payload.objectType || payload.recommendation?.objectType),

      title,

      body: body || title,

      rawBody: body || title,

      summary: sanitizeProjectSummary(getSummaryFromBody(body || title)),

      suggestedNextStep: sanitizeProjectNextStep(payload.recommendation?.suggestedNextStep) || getSuggestedNextStep(destination),

      workflowId: payload.workflowId,

      originBoardItemId: payload.originBoardItemId,

      source: payload.source,

      sourceTitle: sanitizeProjectTitle(payload.sourceTitle || title),

      sourceContent: sanitizeProjectBody(payload.sourceContent || payload.cleanSourceContent || body),

      workingSummary: sanitizeProjectSummary(payload.workingSummary || body),

      cleanSourceContent: sanitizeProjectBody(payload.cleanSourceContent || payload.sourceContent || body),

      status: "preview",

      createdAt: getNow(),

      updatedAt: getNow(),
   };
}

function cleanProjectTitle(value?: string) {
   let title = compactText(value);

   if (!title) {
      return "";
   }

   const removablePrefixes = ["internal allevin note saved for", "internal note saved for", "note saved for", "saved note for", "project", "title", "source title"];

   let changed = true;

   while (changed) {
      changed = false;

      for (const prefix of removablePrefixes) {
         const regex = new RegExp(`^${prefix}\\s*:?\\s*`, "i");

         if (regex.test(title)) {
            title = title.replace(regex, "").trim();

            changed = true;
         }
      }
   }

   return sanitizeProjectTitle(title || "Untitled project");
}

function getProjectLibraryKey({
   workflowId,
   originBoardItemId,
   title,
}: {
   workflowId?: string;

   originBoardItemId?: string;

   title?: string;
}) {
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

function readStringArrayStorage(key: string) {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(key);

      return [];
   }
}

function saveStringArrayStorage(key: string, values: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean)))));
}

function getDeletedProjectTitleKey(title?: string) {
   return cleanProjectTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

function getProjectDeleteKeys(project: ProjectLibraryItem) {
   const titleKey = getDeletedProjectTitleKey(project.title);

   return [
      project.id ? `project:${project.id}` : "",
      project.id ? `thread:${project.id}` : "",
      project.workflowId ? `workflow:${project.workflowId}` : "",
      project.originBoardItemId ? `origin:${project.originBoardItemId}` : "",
      titleKey ? `title:${titleKey}` : "",
   ].filter(Boolean);
}

function rememberDeletedProject(project: ProjectLibraryItem) {
   if (typeof window === "undefined") {
      return;
   }

   const ids = [project.id, project.workflowId, project.originBoardItemId].filter(Boolean) as string[];

   const keys = getProjectDeleteKeys(project);

   saveStringArrayStorage(DELETED_PROJECTS_STORAGE_KEY, [...readStringArrayStorage(DELETED_PROJECTS_STORAGE_KEY), ...ids]);

   saveStringArrayStorage(DELETED_PROJECT_KEYS_STORAGE_KEY, [...readStringArrayStorage(DELETED_PROJECT_KEYS_STORAGE_KEY), ...keys]);

   saveStringArrayStorage(DELETED_THREADS_STORAGE_KEY, [...readStringArrayStorage(DELETED_THREADS_STORAGE_KEY), ...ids]);

   saveStringArrayStorage(DELETED_THREAD_KEYS_STORAGE_KEY, [...readStringArrayStorage(DELETED_THREAD_KEYS_STORAGE_KEY), ...keys]);

   rememberDeletedProjectMemorySignal({
      id: project.id,
      workflowId: project.workflowId,
      originBoardItemId: project.originBoardItemId,
      title: project.title,
      sourceTitle: project.title,
   });
}

function itemMatchesDeletedProject(item: any, project: ProjectLibraryItem) {
   const titleKey = getDeletedProjectTitleKey(project.title);

   const itemTitleKey = getDeletedProjectTitleKey(item?.sourceTitle || item?.title);

   const projectIds = [project.id, project.workflowId, project.originBoardItemId].filter(Boolean);

   const itemIds = [item?.id, item?.workflowId, item?.originBoardItemId].filter(Boolean);

   if (projectIds.some((id) => itemIds.includes(id))) {
      return true;
   }

   return Boolean(titleKey && itemTitleKey && titleKey === itemTitleKey);
}

function pruneDeletedProjectFromStorage(project: ProjectLibraryItem) {
   if (typeof window === "undefined") {
      return;
   }

   try {
      const storedTimeline = localStorage.getItem(WORKFLOW_TIMELINE_STORAGE_KEY);

      if (storedTimeline) {
         const parsedTimeline = JSON.parse(storedTimeline);

         if (Array.isArray(parsedTimeline)) {
            localStorage.setItem(WORKFLOW_TIMELINE_STORAGE_KEY, JSON.stringify(parsedTimeline.filter((event) => !itemMatchesDeletedProject(event, project))));
         }
      }
   } catch {
      // Keep deletion safe if timeline storage is malformed.
   }

   try {
      const storedThreadMemory = localStorage.getItem(THREAD_MEMORY_V2_STORAGE_KEY);

      if (storedThreadMemory) {
         const parsedThreadMemory = JSON.parse(storedThreadMemory);

         if (Array.isArray(parsedThreadMemory)) {
            localStorage.setItem(THREAD_MEMORY_V2_STORAGE_KEY, JSON.stringify(parsedThreadMemory.filter((thread) => !itemMatchesDeletedProject(thread, project))));
         }
      }
   } catch {
      // Keep deletion safe if thread memory storage is malformed.
   }

   try {
      const storedCanvas = localStorage.getItem(CANVAS_STORAGE_KEY);

      if (storedCanvas) {
         const parsedCanvas = JSON.parse(storedCanvas);

         if (itemMatchesDeletedProject(parsedCanvas, project)) {
            localStorage.removeItem(CANVAS_STORAGE_KEY);
         }
      }
   } catch {
      // Keep deletion safe if Canvas storage is malformed.
   }
}

function getProjectTitleKey(value?: string) {
   return sanitizeProjectTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

interface ActiveProjectSelectionRecord {
   projectId: string;
   title: string;
   updatedAt: number;
}

function readActiveProjectSelection(): ActiveProjectSelectionRecord | null {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const stored = localStorage.getItem(ACTIVE_PROJECT_SELECTION_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;

      if (!parsed || typeof parsed !== "object") {
         return null;
      }

      const projectId = compactText(parsed.projectId);
      const title = sanitizeProjectTitle(parsed.title);
      const updatedAt = typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0;

      if (!projectId && !title) {
         return null;
      }

      return {
         projectId,
         title,
         updatedAt,
      };
   } catch {
      return null;
   }
}

function writeActiveProjectSelection(project?: ProjectLibraryItem | null) {
   if (typeof window === "undefined" || !project) {
      return;
   }

   const record: ActiveProjectSelectionRecord = {
      projectId: compactText(project.id),
      title: sanitizeProjectTitle(project.title),
      updatedAt: Date.now(),
   };

   localStorage.setItem(ACTIVE_PROJECT_SELECTION_STORAGE_KEY, JSON.stringify(record));

   window.dispatchEvent(
      new CustomEvent("allevin-active-project-selection-change", {
         detail: record,
      }),
   );
}

function resolvePersistedProjectSelection(projects: ProjectLibraryItem[]): ProjectLibraryItem | null {
   const selection = readActiveProjectSelection();

   if (!projects.length) {
      return null;
   }

   if (!selection) {
      return projects[0] || null;
   }

   const idMatch = selection.projectId ? projects.find((project) => project.id === selection.projectId) : null;

   if (idMatch) {
      return idMatch;
   }

   const selectionTitleKey = getProjectTitleKey(selection.title);

   return projects.find((project) => getProjectTitleKey(project.title) === selectionTitleKey) || projects[0] || null;
}

function readProjectLibrary() {
   if (typeof window === "undefined") {
      return [] as ProjectLibraryItem[];
   }

   const stored = localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((project) => project && typeof project.id === "string")
         .map((project) => ({
            ...project,
            title: sanitizeProjectTitle(project.title),
            latestSummary: sanitizeProjectSummary(project.latestSummary),
            latestMovement: sanitizeProjectPlainText(project.latestMovement, 300),
            workflowId: typeof project.workflowId === "string" ? project.workflowId : undefined,
            originBoardItemId: typeof project.originBoardItemId === "string" ? project.originBoardItemId : undefined,
            notes: Array.isArray(project.notes)
               ? project.notes
                    .filter((note: any) => note && typeof note.id === "string")
                    .map((note: any) => ({
                       ...note,
                       title: sanitizeProjectTitle(note.title),
                       body: sanitizeProjectBody(note.body),
                       summary: sanitizeProjectSummary(note.summary),
                       source: sanitizeProjectPlainText(note.source || "Projects", 80),
                       savedAt: isValidProjectTimestamp(note.savedAt) ? note.savedAt : getNow(),
                    }))
                    .slice(0, 30)
               : [],
            createdAt: isValidProjectTimestamp(project.createdAt) ? project.createdAt : getNow(),
            updatedAt: isValidProjectTimestamp(project.updatedAt) ? project.updatedAt : getNow(),
         }));
   } catch {
      localStorage.removeItem(PROJECT_LIBRARY_STORAGE_KEY);

      return [];
   }
}

function getExistingProjectLibraryItemByTitle(title?: string) {
   const titleKey = getDeletedProjectTitleKey(title);

   if (!titleKey) {
      return undefined;
   }

   return readProjectLibrary().find((project) => getDeletedProjectTitleKey(project.title) === titleKey);
}

function getExistingProjectBodyByTitle(title?: string) {
   const existing = getExistingProjectLibraryItemByTitle(title);

   const existingBody = sanitizeProjectBody(existing?.notes?.[0]?.body || existing?.notes?.[0]?.summary || existing?.latestSummary || "");

   if (existingBody && !existingBody.toLowerCase().startsWith("calendar event:")) {
      return existingBody;
   }

   return "";
}

function mergeProjectBodyWithCalendarUpdate(existingBody?: string, incomingBody?: string) {
   const cleanExistingBody = sanitizeProjectBody(existingBody);

   const cleanIncomingBody = sanitizeProjectBody(incomingBody);

   if (!cleanExistingBody) {
      return cleanIncomingBody;
   }

   if (!cleanIncomingBody) {
      return cleanExistingBody;
   }

   if (cleanExistingBody.includes(cleanIncomingBody)) {
      return cleanExistingBody;
   }

   if (cleanIncomingBody.includes(cleanExistingBody)) {
      return cleanIncomingBody;
   }

   return sanitizeProjectBody(`${cleanExistingBody}\n\nCalendar Update:\n${cleanIncomingBody}`);
}

function isCalendarProjectUpdate(item: InternalOutputItem) {
   const body = compactText(item.body || item.sourceContent || item.workingSummary || item.summary).toLowerCase();

   return item.source === "calendar-integration" || body.startsWith("calendar event:") || body.includes("calendar note:");
}

function saveProjectDirectly(item: InternalOutputItem) {
   const cleanTitle = sanitizeProjectTitle(cleanProjectTitle(item.sourceTitle || item.title) || "Untitled project");

   const incomingBody = sanitizeProjectBody(item.body || item.sourceContent || item.workingSummary || item.summary || cleanTitle);

   const existingBody = isCalendarProjectUpdate(item) ? getExistingProjectBodyByTitle(cleanTitle) : "";

   const body = isCalendarProjectUpdate(item) ? mergeProjectBodyWithCalendarUpdate(existingBody, incomingBody) : incomingBody;

   const summary = sanitizeProjectSummary(item.summary || getSummaryFromBody(body) || body || cleanTitle);

   const noteId =
      item.workflowId ||
      item.originBoardItemId ||
      `note-${cleanTitle
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/^-+|-+$/g, "")}` ||
      item.id ||
      crypto.randomUUID();

   upsertProjectMemory({
      title: cleanTitle,
      body,
      sourceTitle: cleanTitle,
      sourceContent: sanitizeProjectBody(item.sourceContent || body),
      workingSummary: sanitizeProjectSummary(item.workingSummary || summary || body),
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      source: "notes",
      destination: "integrations",
      stage: "preserved",
      status: "active",
      priority: "medium",
      latestMovement: "Saved to Projects",
      recommendedNextAction: getStructuredProjectSection(body, ["Recommended Starting Point", "Recommended Move", "Starting Point"]) || sanitizeProjectNextStep(item.suggestedNextStep) || "Review the first unfinished progress checkpoint.",
   });

   upsertProjectLibraryNote({
      title: cleanTitle,
      body,
      summary,
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      noteId,
   });

   window.dispatchEvent(
      new CustomEvent("allevin-project-note-saved", {
         detail: {
            title: cleanTitle,
            workflowId: item.workflowId,
            originBoardItemId: item.originBoardItemId,
            noteId,
            savedAt: getNow(),
         },
      }),
   );

   return cleanTitle;
}

function saveProjectLibrary(items: ProjectLibraryItem[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(items.slice(0, 80)));

   window.dispatchEvent(new CustomEvent("allevin-project-library-update"));
}

function chooseLongestProjectDocument(...values: Array<string | undefined>) {
   const candidates = values
      .map((value) => cleanText(value))
      .filter(Boolean)
      .filter((value) => !value.toLowerCase().startsWith("notes\n"));

   if (!candidates.length) {
      return "";
   }

   return candidates.sort((a, b) => b.length - a.length)[0];
}

function upsertProjectLibraryNote({
   title,
   body,
   summary,
   workflowId,
   originBoardItemId,
   noteId,
}: {
   title: string;

   body: string;

   summary: string;

   workflowId?: string;

   originBoardItemId?: string;

   noteId: string;
}) {
   const cleanTitle = sanitizeProjectTitle(cleanProjectTitle(title));

   const key = getProjectLibraryKey({
      workflowId,

      originBoardItemId,

      title: cleanTitle,
   });

   const current = readProjectLibrary();

   const titleKey = getDeletedProjectTitleKey(cleanTitle);

   const existing = current.find((project) => project.id === key) || current.find((project) => getDeletedProjectTitleKey(project.title) === titleKey);

   const note: ProjectLibraryNote = {
      id: noteId,

      title: cleanTitle,

      body: sanitizeProjectBody(body),

      summary: sanitizeProjectSummary(summary),

      source: "Projects",

      savedAt: getNow(),
   };

   const nextProject: ProjectLibraryItem = existing
      ? {
           ...existing,

           title: cleanTitle || existing.title,

           workflowId: workflowId || existing.workflowId,

           originBoardItemId: originBoardItemId || existing.originBoardItemId,

           latestSummary: sanitizeProjectSummary(chooseLongestProjectDocument(body, existing.notes?.[0]?.body, summary, existing.latestSummary)),

           latestMovement: "Saved to Projects",

           notes: [note, ...existing.notes.filter((existingNote: ProjectLibraryNote) => existingNote.id !== note.id && cleanProjectTitle(existingNote.title) !== cleanTitle)].slice(0, 30),

           updatedAt: getNow(),
        }
      : {
           id: key,

           title: cleanTitle,

           workflowId,

           originBoardItemId,

           latestSummary: sanitizeProjectSummary(chooseLongestProjectDocument(body, summary)),

           latestMovement: "Saved to Projects",

           notes: [note],

           createdAt: getNow(),

           updatedAt: getNow(),
        };

   saveProjectLibrary([nextProject, ...current.filter((project) => project.id !== nextProject.id)].sort((a, b) => b.updatedAt - a.updatedAt));
}

function readStoredOutputs() {
   if (typeof window === "undefined") {
      return [] as InternalOutputItem[];
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

      return parsed.map((item: any) => ({
         id: typeof item.id === "string" ? item.id : crypto.randomUUID(),

         destination: normalizeInternalDestination(item.destination),

         objectType: normalizeObjectType(item.objectType),

         title: sanitizeProjectTitle(item.title) || "ALLEVIN Projects",

         body: sanitizeProjectBody(item.body || item.rawBody || item.summary) || "Added inside ALLEVIN.",

         rawBody: sanitizeProjectBody(item.rawBody || item.body || item.summary) || "Added inside ALLEVIN.",

         summary: sanitizeProjectSummary(item.summary || getSummaryFromBody(item.body)),

         suggestedNextStep: sanitizeProjectNextStep(item.suggestedNextStep) || getSuggestedNextStep(normalizeInternalDestination(item.destination)),

         workflowId: typeof item.workflowId === "string" ? item.workflowId : undefined,

         originBoardItemId: typeof item.originBoardItemId === "string" ? item.originBoardItemId : undefined,

         source: typeof item.source === "string" ? item.source : undefined,

         sourceTitle: typeof item.sourceTitle === "string" ? sanitizeProjectTitle(item.sourceTitle) : undefined,

         sourceContent: typeof item.sourceContent === "string" ? sanitizeProjectBody(item.sourceContent) : undefined,

         workingSummary: typeof item.workingSummary === "string" ? sanitizeProjectSummary(item.workingSummary) : undefined,

         cleanSourceContent: typeof item.cleanSourceContent === "string" ? sanitizeProjectBody(item.cleanSourceContent) : undefined,

         status: item.status === "polishing" || item.status === "confirmed" || item.status === "saved-note" || item.status === "sent-task" || item.status === "sent-calendar" || item.status === "canceled" ? item.status : "preview",

         llmPolished: Boolean(item.llmPolished),

         llmPolishConfidence: typeof item.llmPolishConfidence === "number" ? item.llmPolishConfidence : undefined,

         internalNoteResult: item.internalNoteResult,

         createdAt: typeof item.createdAt === "number" ? item.createdAt : getNow(),

         updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : getNow(),
      }));
   } catch {
      localStorage.removeItem(STORAGE_KEY);

      return [];
   }
}

function saveStoredOutputs(items: InternalOutputItem[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getDestinationLabel(destination: InternalDestination) {
   switch (destination) {
      case "tasks":
         return "Tasks";

      case "calendar":
         return "Calendar";

      case "notes":
         return "Projects";

      default:
         return "ALLEVIN";
   }
}

function getDestinationIcon(destination: InternalDestination) {
   switch (destination) {
      case "tasks":
         return ListChecks;

      case "calendar":
         return CalendarDays;

      case "notes":
         return NotebookPen;

      default:
         return Boxes;
   }
}

function getOutputStatusLabel(status: InternalStatus) {
   switch (status) {
      case "polishing":
         return "Polishing";

      case "confirmed":
         return "Saved";

      case "saved-note":
         return "Saved to Projects";

      case "sent-task":
         return "Sent to Tasks";

      case "sent-calendar":
         return "Sent to Calendar";

      case "canceled":
         return "Dismissed";

      case "preview":
      default:
         return "Preview";
   }
}

function buildTaskPayload(item: InternalOutputItem) {
   return {
      title: sanitizeProjectTitle(item.title),
      description: sanitizeProjectBody(item.body),
      sourceTitle: sanitizeProjectTitle(item.sourceTitle || item.title),
      sourceContent: sanitizeProjectBody(item.sourceContent || item.body),
      workingSummary: sanitizeProjectSummary(item.workingSummary || item.summary || item.body),
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      priority: "medium" as const,
      source: "projects" as const,
   };
}

function buildCalendarPayload(item: InternalOutputItem) {
   const startTime = Date.now() + 24 * 60 * 60000;

   return {
      title: sanitizeProjectTitle(item.title),
      body: sanitizeProjectBody(item.body),
      description: sanitizeProjectSummary(item.summary || item.body),
      startTime,
      endTime: startTime + 60 * 60000,
      location: "ALLEVIN Calendar",
      sourceTitle: sanitizeProjectTitle(item.sourceTitle || item.title),
      sourceContent: sanitizeProjectBody(item.sourceContent || item.body),
      workingSummary: sanitizeProjectSummary(item.workingSummary || item.summary || item.body),
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      priority: "medium" as const,
      projectStage: "scheduled",
      recommendedNextAction: "Use this scheduled block to check the project and capture any useful notes.",
   };
}

function getHandledApprovedIntegrationIds() {
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

function rememberHandledApprovedIntegrationId(id?: string) {
   if (typeof window === "undefined" || !id) {
      return;
   }

   const current = getHandledApprovedIntegrationIds();

   sessionStorage.setItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY, JSON.stringify([id, ...current.filter((item) => item !== id)].slice(0, 60)));
}

function hasHandledApprovedIntegrationId(id?: string) {
   if (!id) {
      return false;
   }

   return getHandledApprovedIntegrationIds().includes(id);
}

function buildOutputFromApprovedInternalIntegration(payload: ApprovedInternalIntegrationPayload): InternalOutputItem {
   const cleanTitle = sanitizeProjectTitle(payload.title) || "ALLEVIN Project";

   const body = sanitizeProjectBody(payload.body || payload.sourceContent || payload.workingSummary || payload.summary || payload.suggestedAction || cleanTitle);

   const summary = sanitizeProjectSummary(payload.summary || getSummaryFromBody(body) || body || cleanTitle);

   return {
      id: payload.id || crypto.randomUUID(),

      destination: "notes",

      objectType: "project-summary",

      title: cleanTitle,

      body: body || cleanTitle,

      rawBody: body || cleanTitle,

      summary,

      suggestedNextStep: sanitizeProjectNextStep(payload.suggestedAction) || "Continue this project in Canvas or schedule the clearest next action.",

      // For approved Canvas → Projects moves, prefer title-based upsert.
      // Using the event id as workflowId creates duplicate project records.
      workflowId: payload.workflowId,

      originBoardItemId: payload.originBoardItemId || payload.originProjectsItemId,

      source: payload.source === "calendar" && payload.target === "projects" ? "calendar-integration" : "internal-integration",

      sourceTitle: cleanTitle,

      sourceContent: sanitizeProjectBody(payload.sourceContent || body),

      workingSummary: sanitizeProjectSummary(payload.workingSummary || summary),

      cleanSourceContent: sanitizeProjectBody(payload.sourceContent || body),

      status: "preview",

      createdAt: payload.createdAt || getNow(),

      updatedAt: getNow(),
   };
}

export default function IntegrationAdapterLayer() {
   const workspace = useWorkspace();

   const [mounted, setMounted] = useState(false);

   const [outputs, setOutputs] = useState<InternalOutputItem[]>([]);

   const [expandedOutputIds, setExpandedOutputIds] = useState<string[]>([]);

   const [manualTitle, setManualTitle] = useState("");

   const [manualBody, setManualBody] = useState("");

   const [manualDescription, setManualDescription] = useState("");

   const [manualDraftGenerated, setManualDraftGenerated] = useState(false);

   const [manualDraftGenerating, setManualDraftGenerating] = useState(false);

   const [manualBuilderOpen, setManualBuilderOpen] = useState(false);

   const [notice, setNotice] = useState("");

   const [activePolishId, setActivePolishId] = useState<string | null>(null);

   const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

   const [projectLibrary, setProjectLibrary] = useState<ProjectLibraryItem[]>([]);

   const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

   const [projectSuggestions, setProjectSuggestions] = useState<Record<string, string>>({});

   const [projectTrackingMap, setProjectTrackingMap] = useState<Record<string, ProjectTrackingMeta>>({});

   const [calendarRevision, setCalendarRevision] = useState(0);

   const [workingNotesDraft, setWorkingNotesDraft] = useState("");

   const [newMilestoneTitle, setNewMilestoneTitle] = useState("");

   const [editingMilestoneIds, setEditingMilestoneIds] = useState<string[]>([]);

   const [milestoneEditDrafts, setMilestoneEditDrafts] = useState<Record<string, Partial<ProjectMilestone>>>({});

   const [milestoneWorkingDrafts, setMilestoneWorkingDrafts] = useState<Record<string, string>>({});

   const [selectedMilestoneWorkspaceId, setSelectedMilestoneWorkspaceId] = useState("");

   const milestoneAutosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

   const [projectMaterials, setProjectMaterials] = useState<ProjectMaterial[]>([]);

   const [materialBuilderOpen, setMaterialBuilderOpen] = useState(false);

   const [materialTitle, setMaterialTitle] = useState("");

   const [materialType, setMaterialType] = useState<ProjectMaterialType>("Note");

   const [materialSource, setMaterialSource] = useState("");

   const [materialNotes, setMaterialNotes] = useState("");

   const [materialImageDataUrl, setMaterialImageDataUrl] = useState("");

   const [materialImageFileName, setMaterialImageFileName] = useState("");

   const [materialImageMimeType, setMaterialImageMimeType] = useState("");

   const [materialDocumentDataUrl, setMaterialDocumentDataUrl] = useState("");

   const [materialDocumentFileName, setMaterialDocumentFileName] = useState("");

   const [materialDocumentMimeType, setMaterialDocumentMimeType] = useState("");

   const [materialDocumentText, setMaterialDocumentText] = useState("");

   const [expandedMaterialIds, setExpandedMaterialIds] = useState<string[]>([]);

   const [materialTypeFilter, setMaterialTypeFilter] = useState<ProjectMaterialFilter>("All");

   const [fullscreenImageMaterial, setFullscreenImageMaterial] = useState<ProjectMaterial | null>(null);

   const [fullscreenDocumentMaterial, setFullscreenDocumentMaterial] = useState<ProjectMaterial | null>(null);

   const [activeMaterialInterpretId, setActiveMaterialInterpretId] = useState<string | null>(null);

   const [selectedProjectMaterialIds, setSelectedProjectMaterialIds] = useState<string[]>([]);

   function getShortPreview(value?: string, limit = 180) {
      const cleanValue = compactText(value);

      if (cleanValue.length <= limit) {
         return cleanValue;
      }

      return `${cleanValue.slice(0, limit).trim()}...`;
   }

   const activeProject = useMemo(() => projectLibrary.find((project) => project.id === selectedProjectId) || projectLibrary[0] || null, [projectLibrary, selectedProjectId]);

   useEffect(() => {
      if (!activeProject) {
         return;
      }

      writeActiveProjectSelection(activeProject);
   }, [activeProject?.id, activeProject?.title]);

   const activeProjectMaterials = useMemo(() => (activeProject ? projectMaterials.filter((material) => material.projectId === activeProject.id) : []), [activeProject, projectMaterials]);

   useEffect(() => {
      if (!activeProject) {
         setSelectedProjectMaterialIds([]);
         return;
      }

      const selectedMap: Record<string, string[]> = readProjectSelectedMaterialMap();
      const validMaterialIds = new Set<string>(activeProjectMaterials.map((material: ProjectMaterial) => material.id));
      const currentSelectedIds: string[] = Array.isArray(selectedMap[activeProject.id]) ? selectedMap[activeProject.id] : [];
      const selectedIds: string[] = currentSelectedIds.filter((id: string) => validMaterialIds.has(id));

      setSelectedProjectMaterialIds(selectedIds);

      if (selectedIds.length !== (selectedMap[activeProject.id] || []).length) {
         saveProjectSelectedMaterialMap({
            ...selectedMap,
            [activeProject.id]: selectedIds,
         });
      }
   }, [activeProject?.id, activeProjectMaterials.map((material) => material.id).join("|")]);

   const visibleProjectMaterials = useMemo(() => {
      if (materialTypeFilter === "All") {
         return activeProjectMaterials;
      }

      return activeProjectMaterials.filter((material) => material.type === materialTypeFilter);
   }, [activeProjectMaterials, materialTypeFilter]);

   const materialFilterCounts = useMemo(() => {
      return PROJECT_MATERIAL_FILTERS.reduce(
         (counts, filter) => ({
            ...counts,
            [filter]: filter === "All" ? activeProjectMaterials.length : activeProjectMaterials.filter((material) => material.type === filter).length,
         }),
         {} as Record<ProjectMaterialFilter, number>,
      );
   }, [activeProjectMaterials]);

   const activeProjectTracking = activeProject ? getProjectTracking(activeProject) : null;

   const activeProjectCalendarSession = useMemo(() => {
      void calendarRevision;

      return activeProject ? getNextCalendarSessionForProject(activeProject) : null;
   }, [activeProject, calendarRevision]);

   const activeProjectSessionLabel = activeProjectCalendarSession
      ? getProjectSessionDateLabel(activeProjectCalendarSession.startTime, activeProjectCalendarSession.allDay)
      : activeProjectTracking?.calendarTaskDate && activeProjectTracking?.calendarTaskTime
        ? getProjectSessionDateLabel(new Date(`${activeProjectTracking.calendarTaskDate}T${activeProjectTracking.calendarTaskTime}`).getTime())
        : "";

   const activeProjectScheduledTaskLabel = sanitizeProjectTitle(activeProjectCalendarSession?.title || activeProjectTracking?.calendarTaskTitle || "");

   useEffect(() => {
      setWorkingNotesDraft(activeProject ? buildProjectWorkspaceBody(activeProject) : "");
      setNewMilestoneTitle("");
   }, [activeProject?.id, activeProject?.updatedAt]);

   const materialGuidance = getMaterialTypeGuidance(materialType);

   function toggleMaterialPreview(materialId: string) {
      setExpandedMaterialIds((current) => (current.includes(materialId) ? current.filter((id) => id !== materialId) : [...current, materialId]));
   }

   function clearMaterialImageUpload() {
      setMaterialImageDataUrl("");

      setMaterialImageFileName("");

      setMaterialImageMimeType("");
   }

   function clearMaterialDocumentUpload() {
      setMaterialDocumentDataUrl("");

      setMaterialDocumentFileName("");

      setMaterialDocumentMimeType("");

      setMaterialDocumentText("");
   }

   function handleMaterialTypeChange(nextType: string) {
      const cleanType = sanitizeProjectMaterialType(nextType);

      setMaterialType(cleanType);

      if (cleanType !== "Image") {
         clearMaterialImageUpload();
      }

      if (cleanType !== "Document") {
         clearMaterialDocumentUpload();
      }
   }

   function handleProjectMaterialImageFile(file?: File | null) {
      if (!file) {
         return;
      }

      if (!isSupportedProjectImageFile(file)) {
         showNotice("Use PNG, JPG, WEBP, or GIF");

         return;
      }

      if (file.size > 1200000) {
         showNotice("Image is too large. Try one under 1.2 MB");

         return;
      }

      const reader = new FileReader();

      reader.onload = () => {
         const dataUrl = sanitizeProjectImageDataUrl(typeof reader.result === "string" ? reader.result : "");

         if (!dataUrl) {
            showNotice("Image could not be added");

            return;
         }

         setMaterialImageDataUrl(dataUrl);

         setMaterialImageFileName(sanitizeProjectImageFileName(file.name || "Project image"));

         setMaterialImageMimeType(sanitizeProjectImageMimeType(file.type));

         showNotice("Image added");
      };

      reader.onerror = () => {
         showNotice("Image could not be added");
      };

      reader.readAsDataURL(file);
   }

   async function handleProjectMaterialDocumentFile(file?: File | null) {
      if (!file) {
         return;
      }

      if (!isSupportedProjectDocumentFile(file)) {
         showNotice("Use PDF, DOCX, TXT, MD, or DOC");

         return;
      }

      if (file.size > 1800000) {
         showNotice("Document is too large. Try one under 1.8 MB");

         return;
      }

      const mimeType = sanitizeProjectDocumentMimeType(getProjectDocumentMimeType(file));

      const fileName = sanitizeProjectDocumentFileName(file.name || "Project document");

      const isTextDocument = mimeType === "text/plain" || mimeType === "text/markdown";

      const isDocxDocument = isDocxProjectDocumentMimeType(mimeType);

      if (isDocxDocument) {
         try {
            showNotice("Reading document");

            const documentText = await extractProjectDocxText(file);

            if (!documentText) {
               showNotice("Document text could not be read");

               return;
            }

            setMaterialDocumentText(documentText);

            setMaterialDocumentDataUrl("");

            setMaterialDocumentFileName(fileName);

            setMaterialDocumentMimeType(mimeType);

            showNotice("Document added");
         } catch {
            showNotice("Document could not be read");
         }

         return;
      }

      const reader = new FileReader();

      reader.onload = () => {
         if (isTextDocument) {
            const documentText = sanitizeProjectDocumentText(typeof reader.result === "string" ? reader.result : "");

            setMaterialDocumentText(documentText);

            setMaterialDocumentDataUrl("");
         } else {
            const dataUrl = sanitizeProjectDocumentDataUrl(typeof reader.result === "string" ? reader.result : "");

            if (!dataUrl) {
               showNotice("Document could not be added");

               return;
            }

            setMaterialDocumentDataUrl(dataUrl);

            setMaterialDocumentText("");
         }

         setMaterialDocumentFileName(fileName);

         setMaterialDocumentMimeType(mimeType);

         showNotice(isTextDocument || mimeType === "application/pdf" ? "Readable document attached" : "Document attached");
      };

      reader.onerror = () => {
         showNotice("Document could not be added");
      };

      if (isTextDocument) {
         reader.readAsText(file);
      } else {
         reader.readAsDataURL(file);
      }
   }

   function getMaterialKind(material: ProjectMaterial) {
      if (material.type === "Image") {
         return "image" as const;
      }

      if (material.type === "Document") {
         return "document" as const;
      }

      return "text" as const;
   }

   function getMaterialInterpretationSourceText(material: ProjectMaterial) {
      return sanitizeProjectBody(
         [
            material.notes ? `Notes:\n${material.notes}` : "",
            material.summary ? `Summary:\n${material.summary}` : "",
            material.documentText ? `Readable document text:\n${material.documentText}` : "",
            material.documentFileName ? `Document file: ${material.documentFileName}` : "",
            material.imageFileName ? `Image file: ${material.imageFileName}` : "",
         ]
            .filter(Boolean)
            .join("\n\n"),
      );
   }

   function getActiveProjectMilestone(tracking?: ProjectTrackingMeta | null) {
      return tracking?.milestones.find((milestone) => milestone.status === "active") || tracking?.milestones.find((milestone) => milestone.status !== "complete" && milestone.status !== "archived") || null;
   }

   function getCompletedProjectMilestoneTitles(tracking?: ProjectTrackingMeta | null) {
      return (tracking?.milestones || []).filter((milestone) => milestone.status === "complete" || milestone.completed).map((milestone) => milestone.title);
   }

   function getMaterialCheckpointNextStep(material: ProjectMaterial, tracking?: ProjectTrackingMeta | null, modelNextStep?: string) {
      const activeMilestone = getActiveProjectMilestone(tracking);
      const cleanModelNextStep = sanitizeProjectNextStep(modelNextStep);
      const materialText = compactText([material.title, material.notes, material.summary, material.documentText, material.interpretationSummary, material.interpretationUsefulContext].join(" ")).toLowerCase();

      if (!activeMilestone) {
         return cleanModelNextStep || "Use this material to confirm whether the project is ready for its final review.";
      }

      const activeTitle = sanitizeProjectTitle(activeMilestone.title);
      const activeLower = activeTitle.toLowerCase();

      if (/(?:relate|relationship|product roles?|ecosystem)/i.test(activeLower) && ["allevin", "compass", "frontoffice"].every((name) => materialText.includes(name))) {
         return "Use this brief to write one concise sentence for Kin and one distinct sentence for ALLEVIN, Compass, and FrontOffice. Then resolve whether ALLEVIN should lead the feature hierarchy before moving to page structure.";
      }

      const activeWords = activeLower.split(/[^a-z0-9]+/).filter((word) => word.length >= 5);

      const modelSupportsActiveMilestone = cleanModelNextStep && activeWords.some((word) => cleanModelNextStep.toLowerCase().includes(word));

      if (modelSupportsActiveMilestone) {
         return cleanModelNextStep;
      }

      return `Use this material to complete the current checkpoint: ${activeTitle}. Keep the interpretation tied to that checkpoint before moving to later work.`;
   }

   function toggleMaterialProjectReference(project: ProjectLibraryItem, material: ProjectMaterial) {
      const selectedMap = readProjectSelectedMaterialMap();
      const currentIds = selectedMap[project.id] || [];
      const isSelected = currentIds.includes(material.id);
      const nextIds = isSelected ? currentIds.filter((id: string) => id !== material.id) : [...currentIds, material.id];

      saveProjectSelectedMaterialMap({
         ...selectedMap,
         [project.id]: nextIds,
      });

      setSelectedProjectMaterialIds(nextIds);

      window.dispatchEvent(
         new CustomEvent("allevin-project-material-selection-update", {
            detail: {
               projectId: project.id,
               projectTitle: project.title,
               materialId: material.id,
               materialTitle: material.title,
               selected: !isSelected,
               selectedMaterialIds: nextIds,
               updatedAt: getNow(),
            },
         }),
      );

      if (!isSelected) {
         queueMaterialForAIDock(project, material);
      }

      showNotice(isSelected ? "Reference removed from project" : "Material referenced in project");
   }

   async function interpretProjectMaterial(project: ProjectLibraryItem, material: ProjectMaterial) {
      try {
         setActiveMaterialInterpretId(material.id);

         showNotice("Reading material with ALLEVIN");

         const response = await interpretMaterialWithLLM({
            title: material.title,
            focus: material.notes || material.summary || material.title,
            usefulContext: `Project: ${project.title}`,
            nextStep: "Explain how this material can help the active project.",
            rawContent: getMaterialInterpretationSourceText(material),
            userInstruction: `Interpret this material as a senior project lead for the current project.

The first unfinished checkpoint is: ${getActiveProjectMilestone(activeProjectTracking)?.title || activeProjectTracking?.nextStep || "Review the project material"}.

Completed checkpoints:
${
   getCompletedProjectMilestoneTitles(activeProjectTracking).length
      ? getCompletedProjectMilestoneTitles(activeProjectTracking)
           .map((title) => `- ${title}`)
           .join("\n")
      : "- None yet"
}

Explain:
1. What the material adds that was not already clear.
2. Which current decision, risk, or checkpoint it affects.
3. What the user should do now.

Do not recommend returning to a completed checkpoint. Do not give a generic summary. Keep the next move tied to the first unfinished checkpoint. Do not pretend to read unavailable content.`,
            projectStage: "project-material",
            currentLocation: "Projects",
            priority: activeProjectTracking?.priority || "medium",
            maxWords: 220,
            selectedMaterial: {
               materialTitle: material.title,
               materialType: material.type,
               materialKind: getMaterialKind(material),
               materialSource: material.source,
               materialNotes: material.notes,
               materialSummary: material.summary,
               documentFileName: material.documentFileName,
               documentMimeType: material.documentMimeType,
               documentText: material.documentText,
               imageFileName: material.imageFileName,
               imageMimeType: material.imageMimeType,
               imageDataUrl: material.imageDataUrl,
            },
            contextPacket: {
               version: "MK VIII",
               currentProject: {
                  title: project.title,
                  type: getProjectTypeInsight(project).type,
                  location: "Projects",
                  status: activeProjectTracking ? getProjectStatusLabel(activeProjectTracking.status) : "active",
                  priority: activeProjectTracking?.priority || "medium",
                  body: buildProjectWorkspaceBody(project),
                  currentState: getActiveProjectMilestone(activeProjectTracking)?.title ? `Current checkpoint: ${getActiveProjectMilestone(activeProjectTracking)?.title}` : activeProjectTracking?.nextStep || "",
                  latestProjectNote: [project.latestSummary, getCompletedProjectMilestoneTitles(activeProjectTracking).length ? `Completed checkpoints: ${getCompletedProjectMilestoneTitles(activeProjectTracking).join("; ")}` : ""]
                     .filter(Boolean)
                     .join("\n"),
                  recommendedNextAction: getActiveProjectMilestone(activeProjectTracking)?.title || activeProjectTracking?.nextStep || getProjectTypeInsight(project).nextMove,
                  buildOrder: (activeProjectTracking?.milestones || []).map((milestone) => milestone.title),
                  completionCriteria: getCompletedProjectMilestoneTitles(activeProjectTracking),
               },
               projectMaterials: {
                  count: activeProjectMaterials.length,
                  selectedTitles: Array.from(new Set([...activeProjectMaterials.filter((item) => selectedProjectMaterialIds.includes(item.id)).map((item) => item.title), material.title])),
                  titles: activeProjectMaterials.map((item) => item.title),
                  summaries: activeProjectMaterials.map((item) => item.summary || item.notes),
                  usefulSignals: [material.notes, material.summary, material.documentFileName, material.imageFileName].filter(Boolean) as string[],
               },
               responseRules: {
                  tone: "Natural, helpful, conversational, lightly witty, and specific.",
                  format: "Give a short response with one clear next step.",
                  avoid: ["strongest signal", "detected", "analysis", "confidence", "generic advice", "robotic wording", "gremlin", "chaos", "suspicious"],
               },
            },
         });

         const activeMilestone = getActiveProjectMilestone(activeProjectTracking);
         const completedMilestones = getCompletedProjectMilestoneTitles(activeProjectTracking);
         const modelSummary = sanitizeMaterialInterpretation(response.focus || response.summary);
         const modelUsefulContext = sanitizeMaterialInterpretation(response.usefulContext);
         const checkpointNextStep = getMaterialCheckpointNextStep(material, activeProjectTracking, response.nextStep);

         const interpretedMaterial: ProjectMaterial = {
            ...material,
            summary: sanitizeProjectSummary(response.summary || response.focus || material.summary),
            interpretationSummary: sanitizeMaterialInterpretation(
               activeMilestone ? `${modelSummary || "This material adds useful project context."} It should be applied to the current checkpoint: ${activeMilestone.title}.` : modelSummary || response.summary,
            ),
            interpretationUsefulContext: sanitizeMaterialInterpretation(
               [modelUsefulContext, activeMilestone ? `Current checkpoint: ${activeMilestone.title}.` : "", completedMilestones.length ? `Already completed: ${completedMilestones.join("; ")}.` : ""].filter(Boolean).join(" "),
            ),
            interpretationNextStep: sanitizeProjectNextStep(checkpointNextStep),
            interpretedAt: getNow(),
            updatedAt: getNow(),
         };

         const nextMaterials = projectMaterials.map((item) => (item.id === material.id ? interpretedMaterial : item));

         if (!saveProjectMaterials(nextMaterials)) {
            showNotice("Interpretation was too large to save");

            return;
         }

         setProjectMaterials(nextMaterials);

         const selectedMap = readProjectSelectedMaterialMap();
         const currentSelectedIds = selectedMap[project.id] || [];

         if (!currentSelectedIds.includes(material.id)) {
            const nextSelectedIds = [...currentSelectedIds, material.id];

            saveProjectSelectedMaterialMap({
               ...selectedMap,
               [project.id]: nextSelectedIds,
            });

            setSelectedProjectMaterialIds(nextSelectedIds);
         }

         window.dispatchEvent(
            new CustomEvent("allevin-project-material-selection-update", {
               detail: {
                  projectId: project.id,
                  projectTitle: project.title,
                  materialId: material.id,
                  materialTitle: material.title,
                  selected: true,
                  updatedAt: getNow(),
               },
            }),
         );

         setExpandedMaterialIds((current) => (current.includes(material.id) ? current : [...current, material.id]));

         showNotice("Material interpreted");

         notifyAllevin(`Interpreted "${material.title}" for ${project.title}.`, {
            type: "project-material-interpreted",
            projectTitle: project.title,
            materialTitle: material.title,
            materialId: material.id,
         });
      } catch {
         showNotice("Interpretation failed");
      } finally {
         setActiveMaterialInterpretId(null);
      }
   }

   function getProjectSuggestion(project: ProjectLibraryItem) {
      const existing = projectSuggestions[project.id];

      if (existing) {
         return existing;
      }

      const generated = getGeneratedProjectSuggestion(project);

      setProjectSuggestions((current) => ({
         ...current,
         [project.id]: generated,
      }));

      return generated;
   }

   function refreshProjectSuggestion(project: ProjectLibraryItem) {
      const generated = getGeneratedProjectSuggestion(project);

      setProjectSuggestions((current) => ({
         ...current,
         [project.id]: generated,
      }));
   }

   function getProjectTracking(project: ProjectLibraryItem) {
      const storedTracking = projectTrackingMap[project.id];

      const fallbackTracking = getDefaultProjectTracking(project);

      return {
         ...fallbackTracking,
         ...storedTracking,
         milestones: sanitizeProjectMilestones(storedTracking?.milestones, project),
         calendarTaskTitle: storedTracking?.calendarTaskTitle || "",
         calendarTaskDate: storedTracking?.calendarTaskDate || "",
         calendarTaskTime: storedTracking?.calendarTaskTime || "",
         calendarTaskDurationMinutes: Number(storedTracking?.calendarTaskDurationMinutes || fallbackTracking.calendarTaskDurationMinutes || 60),
      };
   }

   function updateProjectTracking(project: ProjectLibraryItem, updates: Partial<ProjectTrackingMeta>, options: { quiet?: boolean } = {}) {
      const currentTracking = getProjectTracking(project);

      const nextTracking: ProjectTrackingMeta = {
         ...currentTracking,
         ...updates,
         nextStep: sanitizeProjectNextStep(updates.nextStep ?? currentTracking.nextStep),
         milestones: sanitizeProjectMilestones(updates.milestones ?? currentTracking.milestones, project),
         calendarTaskTitle: sanitizeLiveProjectTitle(updates.calendarTaskTitle ?? currentTracking.calendarTaskTitle),
         calendarTaskDate: sanitizeProjectPlainText(updates.calendarTaskDate ?? currentTracking.calendarTaskDate, 40),
         calendarTaskTime: sanitizeProjectPlainText(updates.calendarTaskTime ?? currentTracking.calendarTaskTime, 40),
         calendarTaskDurationMinutes: Math.max(15, Math.min(480, Number(updates.calendarTaskDurationMinutes ?? currentTracking.calendarTaskDurationMinutes ?? 60))),
         updatedAt: getNow(),
      };

      const nextMap = {
         ...projectTrackingMap,
         [project.id]: nextTracking,
      };

      setProjectTrackingMap(nextMap);

      saveProjectTrackingMap(nextMap);

      upsertProjectMemory({
         title: project.title,
         body: buildProjectWorkspaceBody(project),
         sourceTitle: project.title,
         sourceContent: buildProjectWorkspaceBody(project),
         workingSummary: project.latestSummary,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
         source: "notes",
         destination: "integrations",
         stage: getProjectMemoryStageFromTrackingStatus(nextTracking.status),
         status: getProjectMemoryStatusFromTrackingStatus(nextTracking.status),
         priority: nextTracking.priority,
         latestMovement: `Projects → ${getProjectStatusLabel(nextTracking.status)}`,
         recommendedNextAction: nextTracking.nextStep || getTrackingGuidance(nextTracking.status),
         projectMetadata: {
            roadmap: nextTracking.milestones.map((milestone) => ({
               id: milestone.id,
               order: milestone.order,
               title: milestone.title,
               status: milestone.status === "complete" ? "completed" : milestone.status === "needs-review" ? "ready-for-review" : milestone.status === "active" ? "in-progress" : milestone.status === "archived" ? "archived" : "not-started",
               goal: milestone.goal,
               whyItMatters: milestone.whyItMatters,
               startingPrompt: milestone.startingPrompt,
               workingContent: milestone.workingContent,
               decisions: milestone.decisions,
               openQuestions: milestone.openQuestions,
               dependencies: [],
               completionCriteria: milestone.completionEvidence,
               createdAt: milestone.createdAt,
               updatedAt: milestone.updatedAt,
            })),
         },
         roadmap: nextTracking.milestones.map((milestone) => ({
            id: milestone.id,
            order: milestone.order,
            title: milestone.title,
            status: milestone.status === "complete" ? "completed" : milestone.status === "needs-review" ? "ready-for-review" : milestone.status === "active" ? "in-progress" : milestone.status === "archived" ? "archived" : "not-started",
            goal: milestone.goal,
            whyItMatters: milestone.whyItMatters,
            startingPrompt: milestone.startingPrompt,
            workingContent: milestone.workingContent,
            decisions: milestone.decisions,
            openQuestions: milestone.openQuestions,
            dependencies: [],
            completionCriteria: milestone.completionEvidence,
            createdAt: milestone.createdAt,
            updatedAt: milestone.updatedAt,
         })),
      });

      window.dispatchEvent(new CustomEvent("allevin-project-memory-update"));

      if (!options.quiet) showNotice("Project updated");
   }

   function saveWorkingNotes(project: ProjectLibraryItem) {
      const body = sanitizeProjectBody(workingNotesDraft);

      if (!body) {
         showNotice("Add a note before saving");

         return;
      }

      const summary = sanitizeProjectSummary(getSummaryFromBody(body) || body);
      const noteId = `${project.id}-working-notes`;

      upsertProjectLibraryNote({
         title: project.title,
         body,
         summary,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
         noteId,
      });

      upsertProjectMemory({
         title: project.title,
         body,
         sourceTitle: project.title,
         sourceContent: body,
         workingSummary: summary,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
         source: "notes",
         destination: "integrations",
         stage: getProjectMemoryStageFromTrackingStatus(getProjectTracking(project).status),
         status: getProjectMemoryStatusFromTrackingStatus(getProjectTracking(project).status),
         priority: getProjectTracking(project).priority,
         latestMovement: "Updated in Projects",
         recommendedNextAction: getProjectTracking(project).nextStep || getProjectTypeInsight(project).nextMove,
      });

      setProjectLibrary(readProjectLibrary());

      window.dispatchEvent(new CustomEvent("allevin-project-memory-update"));
      window.dispatchEvent(new CustomEvent("allevin-project-library-update"));

      showNotice("Working notes saved");
   }

   function normalizeMilestoneStatuses(milestones: ProjectMilestone[]) {
      const ordered = [...milestones]
         .sort((left, right) => left.order - right.order)
         .map((item, index) => ({
            ...item,
            order: index + 1,
         }));

      const explicitActive = ordered.find((item) => item.status === "active");
      const activeId = explicitActive?.id || ordered.find((item) => item.status !== "complete" && item.status !== "archived" && item.status !== "needs-review")?.id;

      return ordered.map((item) => {
         const status: ProjectMilestoneStatus = item.status === "complete" || item.status === "archived" || item.status === "needs-review" ? item.status : item.id === activeId ? "active" : "waiting";

         return {
            ...item,
            status,
            completed: status === "complete",
         };
      });
   }

   function toggleProjectMilestone(project: ProjectLibraryItem, milestoneId: string) {
      const tracking = getProjectTracking(project);
      const now = getNow();
      const targetMilestone = tracking.milestones.find((milestone) => milestone.id === milestoneId);

      if (!targetMilestone) {
         return;
      }

      const reopening = targetMilestone.status === "complete";

      const milestones = normalizeMilestoneStatuses(
         tracking.milestones.map((milestone) => {
            if (milestone.id === milestoneId) {
               return {
                  ...milestone,
                  status: reopening ? ("active" as const) : ("complete" as const),
                  completed: !reopening,
                  completedAt: reopening ? undefined : now,
                  updatedAt: now,
               };
            }

            // Reopening an earlier milestone is an intentional regression.
            // It becomes the current checkpoint and the previously active
            // milestone returns to waiting without losing any saved work.
            if (reopening && milestone.status === "active") {
               return {
                  ...milestone,
                  status: "waiting" as const,
                  completed: false,
                  updatedAt: now,
               };
            }

            return milestone;
         }),
      );

      const nextOpenMilestone = milestones.find((milestone) => milestone.status === "active");
      const visibleMilestones = milestones.filter((milestone) => milestone.status !== "archived");
      const allComplete = visibleMilestones.length > 0 && visibleMilestones.every((milestone) => milestone.status === "complete");

      updateProjectTracking(project, {
         milestones,
         status: allComplete ? "done" : tracking.status === "idea" || tracking.status === "done" ? "active" : tracking.status,
         nextStep: nextOpenMilestone?.title || (allComplete ? "Review the finished project and close any remaining gaps." : tracking.nextStep),
      });

      if (reopening) {
         setSelectedMilestoneWorkspaceId(milestoneId);
      } else if (selectedMilestoneWorkspaceId === milestoneId && nextOpenMilestone?.id) {
         setSelectedMilestoneWorkspaceId(nextOpenMilestone.id);
      }

      window.dispatchEvent(
         new CustomEvent("allevin-project-progress-update", {
            detail: {
               projectId: project.id,
               projectTitle: project.title,
               milestones,
               currentMilestone: nextOpenMilestone?.title || (allComplete ? "Project complete" : ""),
               activeMilestoneId: nextOpenMilestone?.id,
               reopenedMilestoneId: reopening ? milestoneId : undefined,
               createdAt: now,
            },
         }),
      );
   }

   function beginEditingMilestone(milestone: ProjectMilestone) {
      setEditingMilestoneIds((current) => (current.includes(milestone.id) ? current : [...current, milestone.id]));
      setMilestoneEditDrafts((current) => ({ ...current, [milestone.id]: { ...milestone } }));
   }

   function cancelEditingMilestone(milestoneId: string) {
      setEditingMilestoneIds((current) => current.filter((id) => id !== milestoneId));
      setMilestoneEditDrafts((current) => {
         const next = { ...current };
         delete next[milestoneId];
         return next;
      });
   }

   function updateMilestoneEditDraft(milestoneId: string, updates: Partial<ProjectMilestone>) {
      setMilestoneEditDrafts((current) => ({
         ...current,
         [milestoneId]: {
            ...current[milestoneId],
            ...updates,
         },
      }));
   }

   function saveMilestoneStructuralChanges(project: ProjectLibraryItem, milestoneId: string) {
      const tracking = getProjectTracking(project);
      const draft = milestoneEditDrafts[milestoneId];

      if (!draft) return;

      const milestones = normalizeMilestoneStatuses(
         tracking.milestones.map((milestone) =>
            milestone.id === milestoneId
               ? {
                    ...milestone,
                    title: sanitizeProjectTitle(draft.title) || milestone.title,
                    goal: sanitizeProjectSummary(draft.goal) || milestone.goal,
                    whyItMatters: sanitizeProjectSummary(draft.whyItMatters),
                    startingPrompt: sanitizeProjectSummary(draft.startingPrompt),
                    decisions: Array.isArray(draft.decisions)
                       ? draft.decisions
                            .map((item) => sanitizeProjectSummary(item))
                            .filter(Boolean)
                            .slice(0, 40)
                       : milestone.decisions,
                    openQuestions: Array.isArray(draft.openQuestions)
                       ? draft.openQuestions
                            .map((item) => sanitizeProjectSummary(item))
                            .filter(Boolean)
                            .slice(0, 40)
                       : milestone.openQuestions,
                    completionEvidence: Array.isArray(draft.completionEvidence)
                       ? draft.completionEvidence
                            .map((item) => sanitizeProjectSummary(item))
                            .filter(Boolean)
                            .slice(0, 40)
                       : milestone.completionEvidence,
                    updatedAt: getNow(),
                 }
               : milestone,
         ),
      );

      const activeMilestone = milestones.find((item) => item.status === "active");

      updateProjectTracking(project, {
         milestones,
         nextStep: activeMilestone?.title || tracking.nextStep,
      });

      cancelEditingMilestone(milestoneId);
      showNotice("Milestone saved");
   }

   function scheduleMilestoneWorkingContentSave(project: ProjectLibraryItem, milestone: ProjectMilestone, value: string) {
      const safeValue = sanitizeLiveProjectBody(value);

      setMilestoneWorkingDrafts((current) => ({ ...current, [milestone.id]: safeValue }));

      const existingTimer = milestoneAutosaveTimers.current[milestone.id];
      if (existingTimer) clearTimeout(existingTimer);

      milestoneAutosaveTimers.current[milestone.id] = setTimeout(() => {
         const tracking = getProjectTracking(project);
         const milestones = tracking.milestones.map((item) =>
            item.id === milestone.id
               ? {
                    ...item,
                    workingContent: sanitizeProjectBody(safeValue),
                    updatedAt: getNow(),
                 }
               : item,
         );

         updateProjectTracking(project, { milestones }, { quiet: true });
         setMilestoneWorkingDrafts((current) => {
            const next = { ...current };
            delete next[milestone.id];
            return next;
         });

         window.dispatchEvent(
            new CustomEvent("allevin-project-milestone-workspace-update", {
               detail: {
                  projectId: project.id,
                  projectTitle: project.title,
                  milestoneId: milestone.id,
                  milestoneTitle: milestone.title,
                  updatedAt: getNow(),
               },
            }),
         );
      }, 850);
   }

   function addProjectMilestone(project: ProjectLibraryItem) {
      const title = sanitizeProjectTitle(newMilestoneTitle);

      if (!title) return;

      const tracking = getProjectTracking(project);

      if (tracking.milestones.length >= 12) {
         showNotice("Keep progress to twelve milestones or fewer");
         return;
      }

      const now = getNow();
      const milestones = normalizeMilestoneStatuses([
         ...tracking.milestones,
         {
            id: createProjectMilestoneId(project.id, title, tracking.milestones.length),
            title,
            status: "waiting" as const,
            completed: false,
            goal: getMilestoneDefaultGoal(title),
            whyItMatters: getMilestoneDefaultWhyItMatters(title, tracking.milestones.length),
            startingPrompt: getMilestoneDefaultStartingPrompt(title),
            workingContent: "",
            decisions: [],
            openQuestions: [],
            completionEvidence: [],
            order: tracking.milestones.length + 1,
            createdAt: now,
            updatedAt: now,
         },
      ]);

      updateProjectTracking(project, {
         milestones,
         nextStep: milestones.find((milestone) => milestone.status === "active")?.title || title,
      });

      setNewMilestoneTitle("");
   }

   function removeProjectMilestone(project: ProjectLibraryItem, milestoneId: string) {
      const tracking = getProjectTracking(project);
      const target = tracking.milestones.find((milestone) => milestone.id === milestoneId);

      if (!target) return;

      const milestones = milestoneHasSavedWork(target)
         ? normalizeMilestoneStatuses(
              tracking.milestones.map((milestone) =>
                 milestone.id === milestoneId
                    ? {
                         ...milestone,
                         status: "archived" as const,
                         completed: false,
                         updatedAt: getNow(),
                      }
                    : milestone,
              ),
           )
         : normalizeMilestoneStatuses(tracking.milestones.filter((milestone) => milestone.id !== milestoneId));

      const nextOpenMilestone = milestones.find((milestone) => milestone.status === "active");

      updateProjectTracking(project, {
         milestones,
         nextStep: nextOpenMilestone?.title || getProjectTypeInsight(project).nextMove,
      });

      showNotice(milestoneHasSavedWork(target) ? "Milestone archived with its saved work" : "Milestone removed");
   }

   function notifyAllevin(message: string, detail?: Record<string, unknown>) {
      const safeMessage = sanitizeNoticeText(message);

      window.dispatchEvent(
         new CustomEvent("allevin-chat-notice", {
            detail: {
               message: safeMessage,
               ...detail,
               createdAt: getNow(),
            },
         }),
      );
   }

   function showNotice(message: string) {
      setNotice(sanitizeNoticeText(message));

      window.setTimeout(() => {
         setNotice("");
      }, 1400);
   }

   function syncIntegrationStatus(status: "integration-ready" | "focused-work-active" | "workspace-stable" = "integration-ready") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   function logWorkflowEvent({
      title,
      summary,
      workflowId,
      originBoardItemId,
      destination = "system",
   }: {
      title: string;

      summary: string;

      workflowId?: string;

      originBoardItemId?: string;

      destination?: string;
   }) {
      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-log-workflow-event", {
               detail: {
                  id: crypto.randomUUID(),

                  type: "insight",

                  source: "integrations",

                  destination,

                  title,

                  summary,

                  workflowId,

                  originBoardItemId,

                  createdAt: getNow(),
               },
            }),
         );
      }, 0);
   }

   function commitOutputs(nextOutputs: InternalOutputItem[] | ((current: InternalOutputItem[]) => InternalOutputItem[])) {
      setOutputs((current) => {
         const resolved = typeof nextOutputs === "function" ? nextOutputs(current) : nextOutputs;

         saveStoredOutputs(resolved);

         syncIntegrationStatus(resolved.some((item) => item.status !== "canceled") ? "integration-ready" : "workspace-stable");

         return resolved;
      });
   }

   useEffect(() => {
      setMounted(true);

      // MK VI simplified Projects: no confirmation queue.
      // Old queued drafts are cleared so saved work goes directly into Projects.
      localStorage.removeItem(STORAGE_KEY);

      setOutputs([]);

      const nextProjects = readProjectLibrary();
      const persistedProject = resolvePersistedProjectSelection(nextProjects);

      setProjectLibrary(nextProjects);
      setSelectedProjectId(persistedProject?.id || nextProjects[0]?.id || null);

      if (persistedProject) {
         writeActiveProjectSelection(persistedProject);
      }

      setProjectTrackingMap(getProjectTrackingMap());

      setProjectMaterials(readProjectMaterials());

      syncIntegrationStatus("workspace-stable");
   }, []);

   useEffect(() => {
      function refreshProjectLibrary() {
         const nextProjects = readProjectLibrary();
         const persistedProject = resolvePersistedProjectSelection(nextProjects);

         setProjectLibrary(nextProjects);
         setSelectedProjectId((current) => nextProjects.find((project) => project.id === current)?.id || persistedProject?.id || nextProjects[0]?.id || null);

         setProjectTrackingMap(getProjectTrackingMap());

         setProjectMaterials(readProjectMaterials());
      }

      window.addEventListener("allevin-project-library-update", refreshProjectLibrary);

      window.addEventListener("allevin-project-materials-update", refreshProjectLibrary);

      function refreshCalendarSession() {
         setCalendarRevision((current) => current + 1);
      }

      window.addEventListener("allevin-calendar-events-updated", refreshCalendarSession);

      window.addEventListener("allevin-send-to-calendar", refreshCalendarSession);

      window.addEventListener("storage", refreshProjectLibrary);

      function handleProjectMaterialStorageError() {
         showNotice("Storage is full. Remove a large material first.");
      }

      window.addEventListener("allevin-project-materials-storage-error", handleProjectMaterialStorageError);

      return () => {
         window.removeEventListener("allevin-project-library-update", refreshProjectLibrary);

         window.removeEventListener("allevin-project-materials-update", refreshProjectLibrary);

         window.removeEventListener("allevin-calendar-events-updated", refreshCalendarSession);

         window.removeEventListener("allevin-send-to-calendar", refreshCalendarSession);

         window.removeEventListener("storage", refreshProjectLibrary);

         window.removeEventListener("allevin-project-materials-storage-error", handleProjectMaterialStorageError);
      };
   }, []);

   useEffect(() => {
      function handleAddOutput(event: Event) {
         const customEvent = event as CustomEvent<IncomingIntegrationPayload>;

         if (!customEvent.detail?.title && !customEvent.detail?.body) {
            return;
         }

         const output = buildInternalOutputFromPayload({
            ...customEvent.detail,
            destination: "notes",
            objectType: "project-summary",
         });

         void saveOutputToNotes(output);
      }

      window.addEventListener("allevin-prepare-integration", handleAddOutput);

      return () => {
         window.removeEventListener("allevin-prepare-integration", handleAddOutput);
      };
   }, []);

   useEffect(() => {
      function handleApprovedInternalIntegration(event: Event) {
         const customEvent = event as CustomEvent<ApprovedInternalIntegrationPayload>;

         const detail = customEvent.detail;

         if (!detail || detail.target !== "projects") {
            return;
         }

         if (detail.id && hasHandledApprovedIntegrationId(detail.id)) {
            return;
         }

         if (!detail.title && !detail.body && !detail.summary && !detail.sourceContent) {
            return;
         }

         rememberHandledApprovedIntegrationId(detail.id);

         const output = buildOutputFromApprovedInternalIntegration(detail);

         void saveOutputToNotes(output);

         const titleBasedId = getProjectLibraryKey({
            title: output.title,
         });

         setSelectedProjectId(titleBasedId);

         setProjectLibrary(readProjectLibrary());
      }

      window.addEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);

      return () => {
         window.removeEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);
      };
   }, []);

   async function createManualOutput() {
      const cleanTitle = sanitizeProjectTitle(manualTitle);
      const cleanDescription = sanitizeProjectBody(manualDescription);
      const cleanBody = sanitizeProjectBody(manualBody);

      if (!cleanTitle) {
         showNotice("Add a project title");
         return;
      }

      if (!manualDraftGenerated) {
         if (!cleanDescription) {
            showNotice("Describe what you are looking to do");
            return;
         }

         try {
            setManualDraftGenerating(true);
            showNotice("ALLEVIN is shaping the project");

            const response = await requestAllevinLLM({
               mode: "project-guidance",
               source: "projects",
               title: cleanTitle,
               focus: cleanDescription,
               usefulContext: "Act as a senior project lead. Identify the first dependency-aware checkpoint, why it matters, and any important framing the user may have missed.",
               nextStep: "Choose the first move that reduces downstream uncertainty or rework.",
               rawContent: cleanDescription,
               projectStage: "starting-point",
               currentLocation: "ALLEVIN Projects",
               priority: "medium",
               maxWords: 500,
               userInstruction:
                  "Use the user's full description. Do not merely encourage them to define success. Give project-specific judgment about where to begin, what the later checkpoints should accomplish, and why the first checkpoint comes first. Do not invent completed work.",
            });

            const generatedBody = buildDetailedProjectDraft({
               title: cleanTitle,
               description: cleanDescription,
               llmSummary: response.summary || response.focus,
               llmUsefulContext: response.usefulContext,
               llmNextStep: response.nextStep,
            });

            setManualBody(sanitizeLiveProjectBody(generatedBody));
            setManualDraftGenerated(true);
            showNotice("Project guide ready to review");
         } catch {
            const generatedBody = buildDetailedProjectDraft({
               title: cleanTitle,
               description: cleanDescription,
            });

            setManualBody(sanitizeLiveProjectBody(generatedBody));
            setManualDraftGenerated(true);
            showNotice("Project guide ready to review");
         } finally {
            setManualDraftGenerating(false);
         }

         return;
      }

      if (!cleanBody) {
         showNotice("Review or add the Working Notes before saving");
         return;
      }

      const startingPoint = getStructuredProjectSection(cleanBody, ["Recommended Starting Point", "Recommended Move", "Starting Point"]) || "Review the first unfinished progress checkpoint.";

      const output = buildInternalOutputFromPayload({
         title: cleanTitle,
         body: cleanBody,
         destination: "notes",
         objectType: "project-summary",
         source: "manual-generated",
         recommendation: {
            suggestedNextStep: startingPoint,
         },
      });

      setManualTitle("");
      setManualDescription("");
      setManualBody("");
      setManualDraftGenerated(false);
      setManualBuilderOpen(false);

      void saveOutputToNotes(output);
   }

   async function polishOutput(item: InternalOutputItem) {
      try {
         setActivePolishId(item.id);

         commitOutputs((current) =>
            current.map((output) =>
               output.id === item.id
                  ? {
                       ...output,
                       status: "polishing",
                       updatedAt: getNow(),
                    }
                  : output,
            ),
         );

         showNotice("Polishing with ALLEVIN");

         const response = await requestAllevinLLM({
            mode: "project-guidance",
            source: "projects",
            title: item.title,
            focus: item.rawBody || item.body,
            usefulContext: `Keep this saved with the project.`,
            nextStep: item.suggestedNextStep,
            rawContent: item.rawBody || item.body,
            projectStage: "project",
            currentLocation: "ALLEVIN Projects",
            priority: "medium",
            maxWords: 240,
            userInstruction: "Polish this project note. Keep it clear, simple, and useful. Preserve the actual project substance.",
         });

         const polished = sanitizeProjectBody(response.focus || response.summary || response.nextStep || item.body);

         commitOutputs((current) =>
            current.map((output) =>
               output.id === item.id
                  ? {
                       ...output,
                       body: polished || output.body,
                       summary: getSummaryFromBody(polished || output.body),
                       status: "preview",
                       llmPolished: true,
                       llmPolishConfidence: response.confidence,
                       updatedAt: getNow(),
                    }
                  : output,
            ),
         );

         showNotice(getGeneratedProjectsLine("polished"));
      } catch {
         commitOutputs((current) =>
            current.map((output) =>
               output.id === item.id
                  ? {
                       ...output,
                       status: "preview",
                       updatedAt: getNow(),
                    }
                  : output,
            ),
         );

         showNotice("Polish failed");
      } finally {
         setActivePolishId(null);
      }
   }

   async function saveOutputToNotes(item: InternalOutputItem) {
      try {
         setActiveNoteId(item.id);

         const cleanTitle = saveProjectDirectly(item);

         if (item.source === "manual-generated") {
            const nextLibrary = readProjectLibrary();
            const savedProject = nextLibrary.find((project) => sanitizeProjectTitle(project.title).toLowerCase() === cleanTitle.toLowerCase());

            if (savedProject) {
               const milestoneTitles = getProjectMilestoneCandidates(savedProject);
               const now = getNow();
               const milestones = milestoneTitles.map((title, index) => ({
                  id: createProjectMilestoneId(savedProject.id, title, index),
                  title,
                  status: index === 0 ? ("active" as const) : ("waiting" as const),
                  completed: false,
                  goal: getMilestoneDefaultGoal(title),
                  whyItMatters: getMilestoneDefaultWhyItMatters(title, index),
                  startingPrompt: getMilestoneDefaultStartingPrompt(title),
                  workingContent: "",
                  decisions: [],
                  openQuestions: [],
                  completionEvidence: [],
                  order: index + 1,
                  createdAt: now,
                  updatedAt: now,
               }));

               const startingPoint = getStructuredProjectSection(item.body, ["Recommended Starting Point", "Recommended Move", "Starting Point"]) || milestones[0]?.title || "Review the project guide and confirm the first checkpoint.";

               updateProjectTracking(savedProject, {
                  status: "active",
                  milestones,
                  nextStep: startingPoint,
               });

               window.dispatchEvent(
                  new CustomEvent("allevin-project-progress-update", {
                     detail: {
                        projectId: savedProject.id,
                        projectTitle: savedProject.title,
                        milestones,
                        currentMilestone: milestones[0]?.title || startingPoint,
                        createdAt: getNow(),
                     },
                  }),
               );
            }
         }

         // No confirmation queue in MK VIII Projects.
         // If the item came from an old queue, remove it safely.
         commitOutputs((current) => current.filter((output) => output.id !== item.id));

         setExpandedOutputIds((current) => current.filter((outputId) => outputId !== item.id));

         setProjectLibrary(readProjectLibrary());

         showNotice(getGeneratedProjectsLine("saved"));

         if (item.source !== "internal-integration") {
            notifyAllevin(`Saved "${cleanTitle}" to Projects.`, {
               type: "project-saved",
               title: cleanTitle,
               workflowId: item.workflowId,
               originBoardItemId: item.originBoardItemId,
            });
         }
      } catch {
         showNotice("Save failed");
      } finally {
         setActiveNoteId(null);
      }
   }

   function sendOutputToTasks(item: InternalOutputItem) {
      window.dispatchEvent(
         new CustomEvent("allevin-send-to-task", {
            detail: buildTaskPayload(item),
         }),
      );

      commitOutputs((current) =>
         current.map((output) =>
            output.id === item.id
               ? {
                    ...output,
                    destination: "tasks",
                    status: "sent-task",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      logWorkflowEvent({
         title: "Sent to Tasks",
         summary: `Sent to Tasks: ${item.title}`,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
         destination: "task",
      });

      syncIntegrationStatus("focused-work-active");

      showNotice(getGeneratedProjectsLine("tasked"));

      notifyAllevin(`Sent "${item.title}" to Tasks.`, {
         type: "project-sent-to-tasks",
         title: item.title,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
      });
   }

   function sendOutputToCalendar(item: InternalOutputItem) {
      window.dispatchEvent(
         new CustomEvent("allevin-send-to-calendar", {
            detail: buildCalendarPayload(item),
         }),
      );

      commitOutputs((current) =>
         current.map((output) =>
            output.id === item.id
               ? {
                    ...output,
                    destination: "calendar",
                    status: "sent-calendar",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      logWorkflowEvent({
         title: "Project scheduled",
         summary: `Project scheduled: ${item.title}`,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
         destination: "calendar",
      });

      syncIntegrationStatus("focused-work-active");

      showNotice(getGeneratedProjectsLine("scheduled"));

      notifyAllevin(`Scheduled "${item.title}" in Calendar.`, {
         type: "project-scheduled",
         title: item.title,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
      });
   }

   function confirmOutput(item: InternalOutputItem) {
      if (item.destination === "tasks") {
         sendOutputToTasks(item);

         return;
      }

      if (item.destination === "calendar") {
         sendOutputToCalendar(item);

         return;
      }

      if (item.destination === "notes") {
         void saveOutputToNotes(item);

         return;
      }

      commitOutputs((current) =>
         current.map((output) =>
            output.id === item.id
               ? {
                    ...output,
                    status: "confirmed",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      showNotice("Saved");
   }

   function cancelOutput(id: string) {
      commitOutputs((current) =>
         current.map((output) =>
            output.id === id
               ? {
                    ...output,
                    status: "canceled",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      showNotice("Dismissed");
   }

   function removeOutput(id: string) {
      const next = outputs.filter((output) => output.id !== id);

      commitOutputs(next);

      setExpandedOutputIds((current) => current.filter((outputId) => outputId !== id));

      showNotice("Removed");
   }

   function buildProjectWorkspaceBody(project: ProjectLibraryItem) {
      // Treat Projects like reopening a saved document.
      // The full note body is the source of truth; summaries are only previews.
      const latestFullNote = project.notes[0]?.body;

      const bestDocument = chooseLongestProjectDocument(latestFullNote, project.latestSummary);

      return bestDocument || project.title;
   }

   function continueProjectInCanvas(project: ProjectLibraryItem) {
      const body = buildProjectWorkspaceBody(project);

      const materials = projectMaterials.filter((material) => material.projectId === project.id);

      const canvasBody = sanitizeProjectBody(body);

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-canvas", {
            detail: {
               title: sanitizeProjectTitle(project.title),
               body: canvasBody,
               source: "project",
               sourceTitle: sanitizeProjectTitle(project.title),
               sourceContent: canvasBody,
               workingSummary: sanitizeProjectSummary(body),
               cleanSourceContent: canvasBody,
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               projectId: project.id,
               projectMaterials: materials.map((material) => ({
                  id: material.id,
                  title: material.title,
                  type: material.type,
                  source: material.source,
                  summary: material.summary,
                  notes: material.notes,
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
               })),
               referenceMode: "available",
            },
         }),
      );

      workspace.setActiveView("focus");

      workspace.setSystemStatus("focused-work-active");

      workspace.registerWorkspaceActivity("focused-work-active");

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: "canvas",
            },
         }),
      );

      showNotice(getGeneratedProjectsLine("opened"));

      notifyAllevin(`Opened "${project.title}" in Canvas.`, {
         type: "project-opened-canvas",
         title: project.title,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
      });
   }

   function sendProjectToTasks(project: ProjectLibraryItem) {
      const body = buildProjectWorkspaceBody(project);

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-task", {
            detail: {
               title: sanitizeProjectTitle(project.title),
               description: sanitizeProjectBody(body),
               sourceTitle: sanitizeProjectTitle(project.title),
               sourceContent: sanitizeProjectBody(body),
               workingSummary: sanitizeProjectSummary(project.latestSummary || body),
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               priority: "medium",
               source: "projects",
            },
         }),
      );

      workspace.setActiveView("workspace");

      workspace.setSystemStatus("focused-work-active");

      workspace.registerWorkspaceActivity("focused-work-active");

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: "tasks",
            },
         }),
      );

      showNotice(getGeneratedProjectsLine("tasked"));
   }

   function scheduleProjectTime(project: ProjectLibraryItem) {
      const tracking = getProjectTracking(project);

      const taskTitle = sanitizeProjectTitle(tracking.calendarTaskTitle);

      if (!taskTitle) {
         showNotice("Add a calendar task first");

         return;
      }

      if (!tracking.calendarTaskDate || !tracking.calendarTaskTime) {
         showNotice("Add date and time first");

         return;
      }

      const startTime = new Date(`${tracking.calendarTaskDate}T${tracking.calendarTaskTime}`).getTime();

      if (!Number.isFinite(startTime)) {
         showNotice("Check date and time");

         return;
      }

      const durationMinutes = Math.max(15, Number(tracking.calendarTaskDurationMinutes || 60));

      const calendarDescription = sanitizeProjectSummary(taskTitle);

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-calendar", {
            detail: {
               title: sanitizeProjectTitle(`${project.title}: ${taskTitle}`),
               body: calendarDescription,
               description: calendarDescription,
               startTime,
               endTime: startTime + durationMinutes * 60000,
               location: "ALLEVIN Calendar",
               sourceTitle: sanitizeProjectTitle(project.title),
               sourceContent: sanitizeProjectBody(taskTitle),
               workingSummary: sanitizeProjectSummary(taskTitle),
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               priority: tracking.priority,
               projectStage: "scheduled-task",
               recommendedNextAction: taskTitle,
            },
         }),
      );

      updateProjectTracking(project, {
         nextStep: taskTitle,
         calendarTaskTitle: taskTitle,
         calendarTaskDate: tracking.calendarTaskDate,
         calendarTaskTime: tracking.calendarTaskTime,
         calendarTaskDurationMinutes: durationMinutes,
      });

      workspace.setActiveView("workspace");

      workspace.setSystemStatus("schedule-context-active");

      workspace.registerWorkspaceActivity("schedule-context-active");

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: "calendar",
            },
         }),
      );

      showNotice(getGeneratedProjectsLine("scheduled"));
   }

   function createProjectMaterial(project: ProjectLibraryItem) {
      const cleanTitle = sanitizeProjectTitle(materialTitle);

      const cleanNotes = sanitizeProjectBody(materialNotes);

      const cleanSource = sanitizeProjectMaterialSource(materialSource);

      const cleanImageDataUrl = materialType === "Image" ? sanitizeProjectImageDataUrl(materialImageDataUrl) : "";

      const cleanImageFileName = materialType === "Image" ? sanitizeProjectImageFileName(materialImageFileName) : "";

      const cleanImageMimeType = materialType === "Image" ? sanitizeProjectImageMimeType(materialImageMimeType) : "";

      const cleanDocumentDataUrl = materialType === "Document" ? sanitizeProjectDocumentDataUrl(materialDocumentDataUrl) : "";

      const cleanDocumentFileName = materialType === "Document" ? sanitizeProjectDocumentFileName(materialDocumentFileName) : "";

      const cleanDocumentMimeType = materialType === "Document" ? sanitizeProjectDocumentMimeType(materialDocumentMimeType) : "";

      const cleanDocumentText = materialType === "Document" ? sanitizeProjectDocumentText(materialDocumentText) : "";

      if (!cleanTitle && !cleanNotes && !cleanImageDataUrl && !cleanDocumentDataUrl && !cleanDocumentText) {
         showNotice("Add a material title, note, image, or document");

         return;
      }

      const materialDraft: ProjectMaterial = {
         id: crypto.randomUUID(),
         projectId: project.id,
         projectTitle: sanitizeProjectTitle(project.title),
         title: cleanTitle || "Untitled material",
         type: sanitizeProjectMaterialType(materialType),
         source: cleanSource,
         notes: cleanNotes || cleanTitle || (cleanImageDataUrl ? `Image attached: ${cleanImageFileName || "Project image"}` : cleanDocumentDataUrl || cleanDocumentText ? `Document attached: ${cleanDocumentFileName || "Project document"}` : ""),
         summary: "",
         imageDataUrl: cleanImageDataUrl || undefined,
         imageFileName: cleanImageFileName || undefined,
         imageMimeType: cleanImageMimeType || undefined,
         documentDataUrl: cleanDocumentDataUrl || undefined,
         documentFileName: cleanDocumentFileName || undefined,
         documentMimeType: cleanDocumentMimeType || undefined,
         documentText: cleanDocumentText || undefined,
         interpretationSummary: undefined,
         interpretationUsefulContext: undefined,
         interpretationNextStep: undefined,
         interpretedAt: undefined,
         createdAt: getNow(),
         updatedAt: getNow(),
      };

      const nextMaterial = {
         ...materialDraft,
         summary: buildMaterialSummary(materialDraft),
      };

      const nextMaterials = [nextMaterial, ...projectMaterials.filter((material) => material.id !== nextMaterial.id)];

      if (!saveProjectMaterials(nextMaterials)) {
         showNotice("Material is too large for local storage");

         return;
      }

      setProjectMaterials(nextMaterials);

      setMaterialTitle("");

      setMaterialType("Note");

      setMaterialSource("");

      setMaterialNotes("");

      clearMaterialImageUpload();

      clearMaterialDocumentUpload();

      setMaterialBuilderOpen(false);

      showNotice("Material attached to project");

      notifyAllevin(`Attached "${nextMaterial.title}" to ${project.title}.`, {
         type: "project-material-added",
         title: nextMaterial.title,
         projectTitle: project.title,
         projectId: project.id,
         materialId: nextMaterial.id,
      });
   }

   function deleteProjectMaterial(materialId: string) {
      const materialToDelete = projectMaterials.find((material) => material.id === materialId);

      const nextMaterials = projectMaterials.filter((material) => material.id !== materialId);

      if (!saveProjectMaterials(nextMaterials)) {
         showNotice("Material could not be removed");

         return;
      }

      setProjectMaterials(nextMaterials);

      setExpandedMaterialIds((current) => current.filter((id) => id !== materialId));

      if (fullscreenImageMaterial?.id === materialId) {
         setFullscreenImageMaterial(null);
      }

      if (fullscreenDocumentMaterial?.id === materialId) {
         setFullscreenDocumentMaterial(null);
      }

      removeMaterialsFromCanvasSelection([materialId]);

      removeMaterialsFromProjectSelection([materialId]);

      setSelectedProjectMaterialIds((current: string[]) => current.filter((id: string) => id !== materialId));

      window.dispatchEvent(
         new CustomEvent("allevin-project-material-deleted", {
            detail: {
               materialId,
               projectId: materialToDelete?.projectId,
               title: materialToDelete?.title,
               deletedAt: getNow(),
            },
         }),
      );

      showNotice("Material removed");
   }

   function queueMaterialForAIDock(project: ProjectLibraryItem, material: ProjectMaterial) {
      window.dispatchEvent(
         new CustomEvent("allevin-project-material-selected", {
            detail: {
               projectId: project.id,
               projectTitle: project.title,
               materialId: material.id,
               title: material.title,
               type: material.type,
               source: material.source,
               notes: material.notes,
               summary: material.summary,
               createdAt: getNow(),
            },
         }),
      );

      notifyAllevin(`Use "${material.title}" as project context when helping with ${project.title}.`, {
         type: "project-material-context",
         projectTitle: project.title,
         materialTitle: material.title,
         materialId: material.id,
      });

      showNotice("Material context ready for ALLEVIN");
   }

   function deleteProject(project: ProjectLibraryItem) {
      const confirmed = window.confirm(`Delete "${project.title}" from Projects?`);

      if (!confirmed) {
         return;
      }

      rememberDeletedProject(project);

      pruneDeletedProjectFromStorage(project);

      deleteProjectMemory({
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
         title: project.title,
      });

      const nextProjects = projectLibrary.filter((item) => item.id !== project.id);

      const projectMaterialIds = projectMaterials.filter((material) => material.projectId === project.id).map((material) => material.id);

      const nextMaterials = projectMaterials.filter((material) => material.projectId !== project.id);

      if (!saveProjectMaterials(nextMaterials)) {
         showNotice("Project materials could not be cleaned up");

         return;
      }

      setProjectMaterials(nextMaterials);

      removeMaterialsFromCanvasSelection(projectMaterialIds);

      setExpandedMaterialIds((current) => current.filter((materialId) => !projectMaterialIds.includes(materialId)));

      if (fullscreenImageMaterial && projectMaterialIds.includes(fullscreenImageMaterial.id)) {
         setFullscreenImageMaterial(null);
      }

      if (fullscreenDocumentMaterial && projectMaterialIds.includes(fullscreenDocumentMaterial.id)) {
         setFullscreenDocumentMaterial(null);
      }

      saveProjectLibrary(nextProjects);

      setProjectLibrary(nextProjects);

      setProjectSuggestions((current) => {
         const nextSuggestions = { ...current };

         delete nextSuggestions[project.id];

         return nextSuggestions;
      });

      setProjectTrackingMap((current) => {
         const nextTracking = { ...current };

         delete nextTracking[project.id];

         saveProjectTrackingMap(nextTracking);

         return nextTracking;
      });

      setSelectedProjectId(nextProjects[0]?.id || null);

      window.dispatchEvent(
         new CustomEvent("allevin-project-deleted", {
            detail: {
               id: project.id,
               title: project.title,
               sourceTitle: project.title,
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               deletedAt: getNow(),
            },
         }),
      );

      window.dispatchEvent(
         new CustomEvent("allevin-project-memory-deleted", {
            detail: {
               id: project.id,
               title: project.title,
               sourceTitle: project.title,
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               deletedAt: getNow(),
            },
         }),
      );

      window.dispatchEvent(new CustomEvent("allevin-memory-update"));

      showNotice(getGeneratedProjectsLine("deleted"));

      notifyAllevin(`Deleted "${project.title}" from Projects.`, {
         type: "project-deleted",
         title: project.title,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
      });
   }

   function toggleExpanded(id: string) {
      setExpandedOutputIds((current) => (current.includes(id) ? current.filter((outputId) => outputId !== id) : [...current, id]));
   }

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         id="integrations"
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
         <div className="mb-6 flex flex-col gap-5 border-b border-[var(--border-subtle)] pb-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
               <p className="studio-eyebrow">Projects</p>

               <h2 data-editorial-title="true" className="mt-2 text-4xl leading-tight sm:text-5xl">
                  Your project library.
               </h2>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto">
               {notice && <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-blue)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}

               <button onClick={() => setManualBuilderOpen((current) => !current)} className="studio-button-secondary w-full justify-center sm:w-auto">
                  <ChevronDown size={16} strokeWidth={1.7} className={`transition-transform ${manualBuilderOpen ? "rotate-180" : ""}`} />
                  Add Project
               </button>
            </div>
         </div>

         <AnimatePresence initial={false}>
            {manualBuilderOpen && (
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
                  className="mb-5 overflow-hidden lg:mb-6"
               >
                  <div className="studio-paper p-4 sm:p-6">
                     <p className="text-lg font-semibold">Start a Project</p>

                     <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                        Give ALLEVIN as much useful detail as you can about the project goal, the outcome you want, what you already know, important requirements, deadlines, constraints, and anything that may affect the work. ALLEVIN will turn that
                        context into a detailed, editable project guide with Working Notes, progress checkpoints, open questions, and a senior project-lead recommendation for where to begin.
                     </p>

                     <div className="mt-5">
                        <label className="text-sm font-medium text-[var(--color-text-primary)]">Project title</label>

                        <input
                           value={manualTitle}
                           onChange={(event) => {
                              setManualTitle(sanitizeLiveProjectTitle(event.target.value));
                              if (manualDraftGenerated) setManualDraftGenerated(false);
                           }}
                           placeholder="e.g. Casino-Themed Retirement Party"
                           className="mt-2 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        />
                     </div>

                     <div className="mt-4">
                        <label className="text-sm font-medium text-[var(--color-text-primary)]">What are you looking to do?</label>

                        <textarea
                           value={manualDescription}
                           onChange={(event) => {
                              setManualDescription(sanitizeLiveProjectBody(event.target.value));
                              if (manualDraftGenerated) setManualDraftGenerated(false);
                           }}
                           placeholder="Describe the goal, finished outcome, important context, requirements, dates, constraints, decisions already made, and anything else ALLEVIN should understand."
                           className="mt-2 min-h-[140px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                        />
                     </div>

                     {manualDraftGenerated && (
                        <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
                           <div className="flex flex-wrap items-end justify-between gap-3">
                              <div>
                                 <p className="text-sm font-semibold text-[var(--color-text-primary)]">Review the project guide</p>
                                 <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Change anything that does not match your intent. These notes become the project’s starting understanding.</p>
                              </div>

                              <button type="button" onClick={() => setManualDraftGenerated(false)} className="rounded-full border border-[var(--border-subtle)] bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                                 Regenerate
                              </button>
                           </div>

                           <textarea
                              value={manualBody}
                              onChange={(event) => setManualBody(sanitizeLiveProjectBody(event.target.value))}
                              className="mt-3 min-h-[360px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                           />
                        </div>
                     )}

                     <div className="mt-5 flex flex-wrap justify-end gap-3">
                        <button
                           type="button"
                           onClick={() => {
                              setManualBuilderOpen(false);
                              setManualDraftGenerated(false);
                              setManualDraftGenerating(false);
                           }}
                           className="rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                        >
                           Cancel
                        </button>

                        <button
                           onClick={() => void createManualOutput()}
                           disabled={manualDraftGenerating}
                           className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                           {manualDraftGenerating ? <RotateCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                           {manualDraftGenerating ? "Shaping project..." : manualDraftGenerated ? "Save Project" : "Generate Project Guide"}
                        </button>
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>

         <div className="mb-6 min-w-0">
            {projectLibrary.length > 0 ? (
               <div className="space-y-6">
                  <div>
                     <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                           <p className="text-sm font-medium">Saved Projects</p>

                           <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">
                              {projectLibrary.length} project
                              {projectLibrary.length === 1 ? "" : "s"} ready
                           </p>
                        </div>
                     </div>

                     <div className="md:hidden">
                        <label htmlFor="mobile-project-selector" className="sr-only">
                           Select active project
                        </label>

                        <div className="relative rounded-2xl border border-[var(--border-subtle)] bg-white shadow-sm">
                           <select
                              id="mobile-project-selector"
                              value={activeProject?.id || projectLibrary[0]?.id || ""}
                              onChange={(event) => setSelectedProjectId(event.target.value)}
                              className="w-full appearance-none rounded-2xl bg-transparent px-4 py-4 pr-12 text-sm font-semibold text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                           >
                              {projectLibrary.map((project) => (
                                 <option key={project.id} value={project.id}>
                                    {project.title}
                                 </option>
                              ))}
                           </select>

                           <ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-primary)]" />
                        </div>

                        {activeProject && (
                           <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-[var(--color-text-secondary)]">
                              <span className="truncate">Updated {getReadableProjectDate(activeProject.updatedAt)}</span>
                              <span className="shrink-0 font-semibold text-[var(--color-primary)]">Current</span>
                           </div>
                        )}
                     </div>

                     <div className="hidden grid-cols-1 gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
                        {projectLibrary.map((project) => {
                           const selected = selectedProjectId ? selectedProjectId === project.id : projectLibrary[0]?.id === project.id;

                           return (
                              <button
                                 key={project.id}
                                 onClick={() => setSelectedProjectId(project.id)}
                                 className={`
                                    group
                                    relative
                                    w-full
                                    overflow-hidden
                                    border-0
                                    px-4
                                    py-5
                                    text-left
                                    transition-colors

                                    ${selected ? "bg-[var(--color-surface-blue)]" : "bg-transparent hover:bg-[rgba(255,255,255,0.52)]"}
                                 `}
                              >
                                 {selected && <div className="absolute left-0 top-0 h-full w-0.5 bg-[var(--color-primary)]" />}

                                 <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                       {selected && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">Current</p>}

                                       <p className={`${selected ? "mt-2" : ""} truncate text-base font-semibold`}>{project.title}</p>
                                    </div>

                                    <ChevronDown size={16} className={`mt-1 shrink-0 text-[var(--color-text-secondary)] transition-transform ${selected ? "-rotate-90 text-[var(--color-primary)]" : "opacity-50 group-hover:opacity-100"}`} />
                                 </div>

                                 <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">{getShortPreview(project.latestSummary, 120)}</p>

                                 <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                                    <span className="text-xs text-[var(--color-text-secondary)]">{getReadableProjectDate(project.updatedAt)}</span>

                                    <span className={`text-xs font-medium ${selected ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]"}`}>{selected ? "Open" : "Select"}</span>
                                 </div>
                              </button>
                           );
                        })}
                     </div>
                  </div>

                  <div>
                     {(() => {
                        if (!activeProject) {
                           return null;
                        }

                        const projectTracking = getProjectTracking(activeProject);

                        return (
                           <div className="studio-paper min-w-0 p-4 sm:p-6 xl:p-8">
                              <div className="mb-5 flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:pb-5">
                                 <div className="min-w-0 flex-1">
                                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-secondary)]">
                                       <span className="font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">Current Project</span>

                                       <span>Updated {getReadableProjectDate(activeProject.updatedAt)}</span>
                                    </div>

                                    <h3 data-editorial-title="true" className="break-words text-2xl leading-tight sm:text-4xl">
                                       {activeProject.title}
                                    </h3>
                                 </div>

                                 <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[150px]">
                                    <button onClick={() => saveWorkingNotes(activeProject)} className="studio-button-primary w-full justify-center">
                                       Save Project
                                    </button>

                                    <button onClick={() => deleteProject(activeProject)} className="studio-button-secondary w-full justify-center text-[var(--color-text-secondary)]">
                                       Delete
                                    </button>
                                 </div>
                              </div>

                              <section className="mb-6 border-l-2 border-[var(--color-primary)] bg-[var(--color-bg-soft)] px-5 py-4 sm:px-6">
                                 <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Current Focus</p>

                                 <p className="mt-2 max-w-4xl text-base leading-7 text-[var(--color-text-primary)]">{projectTracking.nextStep || "Choose the next meaningful outcome."}</p>
                              </section>

                              <section className="mb-6 border-y border-[var(--border-subtle)] py-6">
                                 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                       <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Working Notes</p>

                                       <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Keep updates, decisions, questions, and anything ALLEVIN should understand in one place.</p>
                                    </div>

                                    <button type="button" onClick={() => saveWorkingNotes(activeProject)} className="studio-button-secondary w-full justify-center sm:w-auto">
                                       Save notes
                                    </button>
                                 </div>

                                 <textarea
                                    value={workingNotesDraft}
                                    onChange={(event) => setWorkingNotesDraft(sanitizeLiveProjectBody(event.target.value))}
                                    rows={16}
                                    maxLength={PROJECT_SANITIZE_LIMITS.body}
                                    placeholder="Add project notes, decisions, updates, questions, or anything ALLEVIN should understand..."
                                    className="mt-4 min-h-[360px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-4 text-sm leading-7 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)]"
                                 />
                              </section>

                              <div className="mb-6 space-y-4">
                                 <section className="rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5">
                                    <div className="flex items-center justify-between gap-3">
                                       <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Progress</p>
                                       </div>

                                       <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                                          {projectTracking.milestones.filter((milestone) => milestone.status === "complete").length}/{projectTracking.milestones.length}
                                       </span>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                       {projectTracking.milestones.map((milestone) => (
                                          <div key={milestone.id} className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[var(--color-bg)]">
                                             <button
                                                type="button"
                                                onClick={() => toggleProjectMilestone(activeProject, milestone.id)}
                                                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-white text-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                                aria-label={`${milestone.status === "complete" ? "Mark incomplete" : "Mark complete"}: ${milestone.title}`}
                                             >
                                                {milestone.status === "complete" ? <CheckCircle2 size={16} /> : <span className="h-2 w-2 rounded-full bg-[var(--border-subtle)]" />}
                                             </button>

                                             <p
                                                className={`min-w-0 flex-1 break-words text-sm leading-6 ${milestone.status === "complete" ? "text-[var(--color-text-secondary)] line-through" : milestone.status === "archived" ? "text-[var(--color-text-tertiary)]" : "text-[var(--color-text-primary)]"}`}
                                             >
                                                {milestone.title}
                                             </p>

                                             <button
                                                type="button"
                                                onClick={() => removeProjectMilestone(activeProject, milestone.id)}
                                                className="px-1 text-xs text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--color-text-primary)] group-hover:opacity-100 focus:opacity-100"
                                                aria-label={`Remove ${milestone.title}`}
                                             >
                                                ×
                                             </button>
                                          </div>
                                       ))}
                                    </div>

                                    <div className="mt-3 flex gap-2">
                                       <input
                                          value={newMilestoneTitle}
                                          onChange={(event) => setNewMilestoneTitle(sanitizeLiveProjectTitle(event.target.value))}
                                          onKeyDown={(event) => {
                                             if (event.key === "Enter") {
                                                event.preventDefault();
                                                addProjectMilestone(activeProject);
                                             }
                                          }}
                                          maxLength={120}
                                          placeholder="Add a milestone"
                                          className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                       />

                                       <button type="button" onClick={() => addProjectMilestone(activeProject)} className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary)]">
                                          Add
                                       </button>
                                    </div>
                                 </section>

                                 <section aria-labelledby="milestone-workspaces-heading" className="space-y-5">
                                    {(() => {
                                       const visibleMilestones = projectTracking.milestones.filter((milestone) => milestone.status !== "archived").sort((left, right) => left.order - right.order);

                                       const currentMilestone = visibleMilestones.find((milestone) => milestone.status === "active") || visibleMilestones.find((milestone) => milestone.status !== "complete") || visibleMilestones[0];

                                       const selectedMilestone = visibleMilestones.find((milestone) => milestone.id === selectedMilestoneWorkspaceId) || currentMilestone;

                                       if (!selectedMilestone) {
                                          return null;
                                       }

                                       const selectedIndex = visibleMilestones.findIndex((milestone) => milestone.id === selectedMilestone.id);
                                       const isEditing = editingMilestoneIds.includes(selectedMilestone.id);
                                       const draft = milestoneEditDrafts[selectedMilestone.id] || selectedMilestone;
                                       const isComplete = selectedMilestone.status === "complete";
                                       const isActive = selectedMilestone.status === "active";
                                       const workingValue = Object.prototype.hasOwnProperty.call(milestoneWorkingDrafts, selectedMilestone.id) ? milestoneWorkingDrafts[selectedMilestone.id] : selectedMilestone.workingContent;

                                       return (
                                          <>
                                             <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                                                <div>
                                                   <p id="milestone-workspaces-heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                                                      Milestone Workspace
                                                   </p>
                                                   <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">Choose a milestone to view or continue its work.</p>
                                                </div>

                                                <div className="w-full sm:max-w-sm">
                                                   <label htmlFor="milestone-workspace-selector" className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
                                                      Select milestone
                                                   </label>
                                                   <div className="relative mt-2">
                                                      <select
                                                         id="milestone-workspace-selector"
                                                         value={selectedMilestone.id}
                                                         onChange={(event) => {
                                                            cancelEditingMilestone(selectedMilestone.id);
                                                            setSelectedMilestoneWorkspaceId(event.target.value);
                                                         }}
                                                         className="w-full appearance-none rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3 pr-10 text-sm font-medium text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                                      >
                                                         {visibleMilestones.map((milestone, index) => (
                                                            <option key={milestone.id} value={milestone.id}>
                                                               {index + 1}. {milestone.title}
                                                               {milestone.status === "active" ? " — Current" : milestone.status === "complete" ? " — Complete" : ""}
                                                            </option>
                                                         ))}
                                                      </select>
                                                      <ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                                                   </div>
                                                </div>
                                             </div>

                                             <section aria-labelledby={`milestone-heading-${selectedMilestone.id}`} className="scroll-mt-24">
                                                <div aria-hidden="true" className="mb-6 flex items-center gap-3">
                                                   <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                                                   <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Milestone {selectedIndex + 1}</span>
                                                   <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                                                </div>

                                                <div className={`rounded-2xl border p-4 sm:p-6 ${isActive ? "border-[var(--color-primary)] bg-[var(--color-bg-soft)]" : "border-[var(--border-subtle)] bg-white"}`}>
                                                   <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                      <div className="min-w-0">
                                                         <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">{isActive ? "Current Milestone" : isComplete ? "Complete" : "Upcoming"}</span>

                                                         <h4 id={`milestone-heading-${selectedMilestone.id}`} className="mt-2 break-words text-xl font-semibold leading-7 text-[var(--color-text-primary)]">
                                                            {selectedMilestone.title}
                                                         </h4>

                                                         {selectedMilestone.goal && <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{selectedMilestone.goal}</p>}
                                                      </div>
                                                   </div>

                                                   <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
                                                      {isEditing ? (
                                                         <div className="space-y-4">
                                                            <div>
                                                               <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Milestone title</label>
                                                               <input
                                                                  value={String(draft.title || "")}
                                                                  onChange={(event) => updateMilestoneEditDraft(selectedMilestone.id, { title: sanitizeLiveProjectTitle(event.target.value) })}
                                                                  className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                                               />
                                                            </div>

                                                            <div className="grid gap-4 lg:grid-cols-2">
                                                               <div>
                                                                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Milestone goal</label>
                                                                  <textarea
                                                                     value={String(draft.goal || "")}
                                                                     onChange={(event) => updateMilestoneEditDraft(selectedMilestone.id, { goal: sanitizeLiveProjectBody(event.target.value) })}
                                                                     rows={4}
                                                                     className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                                                                  />
                                                               </div>

                                                               <div>
                                                                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Why it matters</label>
                                                                  <textarea
                                                                     value={String(draft.whyItMatters || "")}
                                                                     onChange={(event) => updateMilestoneEditDraft(selectedMilestone.id, { whyItMatters: sanitizeLiveProjectBody(event.target.value) })}
                                                                     rows={4}
                                                                     className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                                                                  />
                                                               </div>
                                                            </div>

                                                            <div>
                                                               <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Starting prompt</label>
                                                               <textarea
                                                                  value={String(draft.startingPrompt || "")}
                                                                  onChange={(event) => updateMilestoneEditDraft(selectedMilestone.id, { startingPrompt: sanitizeLiveProjectBody(event.target.value) })}
                                                                  rows={3}
                                                                  className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                                                               />
                                                            </div>

                                                            {[
                                                               { key: "decisions", label: "Decisions", placeholder: "One decision per line" },
                                                               { key: "openQuestions", label: "Open questions", placeholder: "One question per line" },
                                                               { key: "completionEvidence", label: "Completion evidence", placeholder: "What must be true before this milestone is complete?" },
                                                            ].map((field) => (
                                                               <div key={field.key}>
                                                                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">{field.label}</label>
                                                                  <textarea
                                                                     value={Array.isArray((draft as any)[field.key]) ? ((draft as any)[field.key] as string[]).join("\n") : ""}
                                                                     onChange={(event) =>
                                                                        updateMilestoneEditDraft(selectedMilestone.id, {
                                                                           [field.key]: event.target.value
                                                                              .split("\n")
                                                                              .map((item) => sanitizeProjectSummary(item))
                                                                              .filter(Boolean),
                                                                        } as Partial<ProjectMilestone>)
                                                                     }
                                                                     placeholder={field.placeholder}
                                                                     rows={4}
                                                                     className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                                                                  />
                                                               </div>
                                                            ))}

                                                            <div className="flex flex-wrap gap-2">
                                                               <button type="button" onClick={() => saveMilestoneStructuralChanges(activeProject, selectedMilestone.id)} className="studio-button-primary">
                                                                  Save milestone
                                                               </button>
                                                               <button type="button" onClick={() => cancelEditingMilestone(selectedMilestone.id)} className="studio-button-secondary">
                                                                  Cancel
                                                               </button>
                                                            </div>
                                                         </div>
                                                      ) : (
                                                         <>
                                                            {selectedMilestone.whyItMatters && (
                                                               <div className="mb-5">
                                                                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Why this matters</p>
                                                                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-primary)]">{selectedMilestone.whyItMatters}</p>
                                                               </div>
                                                            )}

                                                            {selectedMilestone.startingPrompt && (
                                                               <div className="mb-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3">
                                                                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Starting prompt</p>
                                                                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-primary)]">{selectedMilestone.startingPrompt}</p>
                                                               </div>
                                                            )}

                                                            <div>
                                                               <label htmlFor={`milestone-work-${selectedMilestone.id}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
                                                                  Work on this milestone
                                                               </label>
                                                               <textarea
                                                                  id={`milestone-work-${selectedMilestone.id}`}
                                                                  value={workingValue}
                                                                  onChange={(event) => scheduleMilestoneWorkingContentSave(activeProject, selectedMilestone, event.target.value)}
                                                                  rows={10}
                                                                  maxLength={PROJECT_SANITIZE_LIMITS.body}
                                                                  placeholder={`Add the work, notes, draft, decisions, or evidence for ${selectedMilestone.title}...`}
                                                                  className="mt-2 min-h-[220px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-4 text-sm leading-7 text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)]"
                                                               />
                                                            </div>

                                                            {(selectedMilestone.decisions.length > 0 || selectedMilestone.openQuestions.length > 0 || selectedMilestone.completionEvidence.length > 0) && (
                                                               <div className="mt-5 grid gap-4 lg:grid-cols-3">
                                                                  {[
                                                                     { label: "Decisions", items: selectedMilestone.decisions },
                                                                     { label: "Open questions", items: selectedMilestone.openQuestions },
                                                                     { label: "Completion evidence", items: selectedMilestone.completionEvidence },
                                                                  ].map((group) => (
                                                                     <div key={group.label} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                                                                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">{group.label}</p>
                                                                        {group.items.length ? (
                                                                           <ul className="mt-3 space-y-2">
                                                                              {group.items.map((item, itemIndex) => (
                                                                                 <li key={`${group.label}-${itemIndex}`} className="text-sm leading-6 text-[var(--color-text-primary)]">
                                                                                    {item}
                                                                                 </li>
                                                                              ))}
                                                                           </ul>
                                                                        ) : null}
                                                                     </div>
                                                                  ))}
                                                               </div>
                                                            )}

                                                            <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
                                                               <button type="button" onClick={() => beginEditingMilestone(selectedMilestone)} className="studio-button-secondary">
                                                                  Edit milestone
                                                               </button>
                                                               <button type="button" onClick={() => toggleProjectMilestone(activeProject, selectedMilestone.id)} className="studio-button-secondary">
                                                                  {isComplete ? "Reopen milestone" : "Mark complete"}
                                                               </button>
                                                               <button type="button" onClick={() => removeProjectMilestone(activeProject, selectedMilestone.id)} className="studio-button-secondary text-[var(--color-text-secondary)]">
                                                                  {milestoneHasSavedWork(selectedMilestone) ? "Archive milestone" : "Delete milestone"}
                                                               </button>
                                                            </div>
                                                         </>
                                                      )}
                                                   </div>
                                                </div>
                                             </section>
                                          </>
                                       );
                                    })()}
                                 </section>

                                 <details className="border-y border-[var(--border-subtle)] px-1 py-4">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-2 text-left focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
                                       <div className="min-w-0 sm:flex sm:items-center sm:gap-5">
                                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Next Session</p>

                                          <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)] sm:mt-0">{activeProjectSessionLabel || "Schedule time"}</p>

                                          {activeProjectSessionLabel && activeProjectScheduledTaskLabel && <p className="mt-1 truncate text-xs text-[var(--color-text-secondary)] sm:mt-0">{activeProjectScheduledTaskLabel}</p>}
                                       </div>

                                       <ChevronDown size={17} className="shrink-0 text-[var(--color-text-secondary)]" />
                                    </summary>

                                    <div className="mx-2 mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
                                       <input
                                          value={projectTracking.calendarTaskTitle}
                                          onChange={(event) => updateProjectTracking(activeProject, { calendarTaskTitle: event.target.value })}
                                          placeholder="What should this session accomplish?"
                                          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                       />

                                       <div className="grid grid-cols-2 gap-2">
                                          <input
                                             type="date"
                                             value={projectTracking.calendarTaskDate}
                                             onChange={(event) => updateProjectTracking(activeProject, { calendarTaskDate: event.target.value })}
                                             className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                          />

                                          <input
                                             type="time"
                                             value={projectTracking.calendarTaskTime}
                                             onChange={(event) => updateProjectTracking(activeProject, { calendarTaskTime: event.target.value })}
                                             className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                          />
                                       </div>

                                       <div className="grid grid-cols-[1fr_auto] gap-2">
                                          <select
                                             value={projectTracking.calendarTaskDurationMinutes}
                                             onChange={(event) => updateProjectTracking(activeProject, { calendarTaskDurationMinutes: Number(event.target.value) })}
                                             className="rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                          >
                                             <option value={15}>15 minutes</option>
                                             <option value={30}>30 minutes</option>
                                             <option value={45}>45 minutes</option>
                                             <option value={60}>1 hour</option>
                                             <option value={90}>1.5 hours</option>
                                             <option value={120}>2 hours</option>
                                          </select>

                                          <button type="button" onClick={() => scheduleProjectTime(activeProject)} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-cream)]">
                                             Add to Calendar
                                          </button>
                                       </div>
                                    </div>
                                 </details>
                              </div>

                              <div className="mb-5">
                                 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                       <div className="flex items-center gap-2">
                                          <FileText size={18} />

                                          <p className="font-medium">Project Materials ({activeProjectMaterials.length})</p>
                                       </div>

                                       <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Keep references, feedback, notes, and documents connected to this project.</p>
                                    </div>

                                    <button onClick={() => setMaterialBuilderOpen((current) => !current)} className="studio-button-secondary w-full justify-center sm:w-auto">
                                       {materialBuilderOpen ? "Close" : "Add Material"}
                                    </button>
                                 </div>

                                 <AnimatePresence initial={false}>
                                    {materialBuilderOpen && (
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
                                          <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4">
                                             <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <input
                                                   value={materialTitle}
                                                   onChange={(event) => setMaterialTitle(sanitizeLiveProjectTitle(event.target.value))}
                                                   placeholder={materialGuidance.titlePlaceholder}
                                                   className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                                />

                                                <select
                                                   value={materialType}
                                                   onChange={(event) => handleMaterialTypeChange(event.target.value)}
                                                   className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                                >
                                                   <option value="Note">Note</option>
                                                   <option value="Document">Document</option>
                                                   <option value="Image">Image</option>
                                                   <option value="Research">Research</option>
                                                   <option value="Feedback">Feedback</option>
                                                   <option value="Reference">Reference</option>
                                                </select>
                                             </div>

                                             <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-3">
                                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">{materialGuidance.inputLabel}</p>
                                                <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{materialGuidance.helperText}</p>
                                             </div>

                                             {materialType === "Image" && (
                                                <div className="mt-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-white px-4 py-4 text-sm text-[var(--color-text-secondary)]">
                                                   <div className="flex flex-col gap-3">
                                                      <div>
                                                         <p className="font-medium text-[var(--color-text-primary)]">Attach image</p>
                                                         <p className="mt-1 leading-6">PNG, JPG, WEBP, or GIF up to about 1.2 MB. Local preview only for now — no dramatic cloud adventure.</p>
                                                      </div>

                                                      <input
                                                         type="file"
                                                         accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                                                         onChange={(event) => handleProjectMaterialImageFile(event.target.files?.[0])}
                                                         className="w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm"
                                                      />

                                                      {materialImageDataUrl && (
                                                         <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)]">
                                                            <img src={materialImageDataUrl} alt={materialImageFileName || "Project material preview"} className="max-h-64 w-full object-contain" />

                                                            <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                                               <p className="break-words text-xs text-[var(--color-text-secondary)]">{materialImageFileName || "Image attached"}</p>

                                                               <button onClick={clearMaterialImageUpload} type="button" className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface)]">
                                                                  Remove image
                                                               </button>
                                                            </div>
                                                         </div>
                                                      )}
                                                   </div>
                                                </div>
                                             )}

                                             {materialType === "Document" && (
                                                <div className="mt-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-white px-4 py-4 text-sm text-[var(--color-text-secondary)]">
                                                   <div className="flex flex-col gap-3">
                                                      <div>
                                                         <p className="font-medium text-[var(--color-text-primary)]">Attach document</p>
                                                         <p className="mt-1 leading-6">
                                                            PDF, TXT, Markdown, DOC, or DOCX up to about 1.8 MB. PDFs, text files, Markdown, and readable DOCX files open in ALLEVIN so users can click, scroll, and read. Older DOC files still attach as
                                                            project files.
                                                         </p>
                                                      </div>

                                                      <input
                                                         type="file"
                                                         accept="application/pdf,text/plain,text/markdown,.txt,.md,.markdown,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                                         onChange={(event) => handleProjectMaterialDocumentFile(event.target.files?.[0])}
                                                         className="w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm"
                                                      />

                                                      {(materialDocumentFileName || materialDocumentText || materialDocumentDataUrl) && (
                                                         <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)]">
                                                            <div className="px-3 py-3">
                                                               <p className="break-words text-sm font-medium text-[var(--color-text-primary)]">{materialDocumentFileName || "Document attached"}</p>
                                                               <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{materialDocumentMimeType || "document"}</p>
                                                            </div>

                                                            {materialDocumentText && (
                                                               <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words border-t border-[var(--border-subtle)] bg-white px-3 py-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                                                                  {materialDocumentText}
                                                               </pre>
                                                            )}

                                                            <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                                               <p className="text-xs text-[var(--color-text-secondary)]">{materialDocumentMimeType === "application/pdf" || materialDocumentText ? "Readable preview ready" : "Attached file saved"}</p>

                                                               <button onClick={clearMaterialDocumentUpload} type="button" className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface)]">
                                                                  Remove document
                                                               </button>
                                                            </div>
                                                         </div>
                                                      )}
                                                   </div>
                                                </div>
                                             )}

                                             <input
                                                value={materialSource}
                                                onChange={(event) => setMaterialSource(sanitizeProjectPlainText(event.target.value, PROJECT_SANITIZE_LIMITS.materialSource, { preserveEdges: true }))}
                                                placeholder={materialGuidance.sourcePlaceholder}
                                                className="mt-3 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                             />

                                             <textarea
                                                value={materialNotes}
                                                onChange={(event) => setMaterialNotes(sanitizeLiveProjectBody(event.target.value))}
                                                placeholder={materialGuidance.notesPlaceholder}
                                                className="mt-3 min-h-[110px] w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                                             />

                                             <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-xs leading-5 text-[var(--color-text-secondary)]">Materials stay with this project and can be selected as references in Canvas.</p>

                                                <button onClick={() => createProjectMaterial(activeProject)} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90">
                                                   Attach Material
                                                </button>
                                             </div>
                                          </div>
                                       </motion.div>
                                    )}
                                 </AnimatePresence>

                                 {activeProjectMaterials.length > 0 && (
                                    <div className="mt-4 border-y border-[var(--border-subtle)] py-4">
                                       <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                          <p className="text-sm font-medium">Material view</p>

                                          <select
                                             value={materialTypeFilter}
                                             onChange={(event) => setMaterialTypeFilter(event.target.value as ProjectMaterialFilter)}
                                             className="w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] sm:w-[240px]"
                                          >
                                             {PROJECT_MATERIAL_FILTERS.map((filter) => (
                                                <option key={filter} value={filter}>
                                                   {filter} ({materialFilterCounts[filter] || 0})
                                                </option>
                                             ))}
                                          </select>
                                       </div>
                                    </div>
                                 )}

                                 {activeProjectMaterials.length > 0 ? (
                                    visibleProjectMaterials.length > 0 ? (
                                       <div className="mt-4 grid grid-cols-1 gap-4">
                                          {visibleProjectMaterials.map((material) => (
                                             <div key={material.id} className="min-w-0 overflow-hidden border-b border-[var(--border-subtle)] bg-transparent py-5">
                                                <div className="flex min-w-0 flex-col gap-4">
                                                   <div className="min-w-0 flex-1">
                                                      <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1 text-xs font-medium text-[var(--color-text-secondary)]">
                                                         <span className="uppercase tracking-[0.1em]">{material.type}</span>

                                                         {selectedProjectMaterialIds.includes(material.id) && (
                                                            <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-primary)]">Referenced in project</span>
                                                         )}

                                                         {material.source && <span className="max-w-full break-words">{material.source}</span>}
                                                      </div>

                                                      <p className="mt-3 break-words font-medium leading-6">{material.title}</p>

                                                      <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-secondary)]">{material.summary || getShortPreview(material.notes, 180)}</p>

                                                      {material.interpretationSummary && (
                                                         <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-white p-3">
                                                            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">ALLEVIN read</p>
                                                            <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-primary)]">{getShortPreview(material.interpretationSummary, 260)}</p>
                                                            {material.interpretationNextStep && <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-secondary)]">Next: {getShortPreview(material.interpretationNextStep, 180)}</p>}
                                                         </div>
                                                      )}

                                                      {material.type === "Image" && material.imageDataUrl && (
                                                         <button
                                                            type="button"
                                                            onClick={() => setFullscreenImageMaterial(material)}
                                                            className="mt-3 w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white text-left transition-opacity hover:opacity-90"
                                                            aria-label={`Open ${material.title} full screen`}
                                                         >
                                                            <img src={material.imageDataUrl} alt={material.imageFileName || material.title || "Project image material"} className="max-h-48 w-full object-contain" />
                                                         </button>
                                                      )}

                                                      {material.type === "Document" && (material.documentFileName || material.documentText || material.documentDataUrl) && (
                                                         <button
                                                            type="button"
                                                            onClick={() => setFullscreenDocumentMaterial(material)}
                                                            className="mt-3 w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface)]"
                                                            aria-label={`Open ${material.title} document reader`}
                                                         >
                                                            <p className="break-words text-sm font-medium text-[var(--color-text-primary)]">{material.documentFileName || material.title || "Project document"}</p>
                                                            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{isReadableProjectDocument(material) ? "Click to read" : "Attached document"}</p>
                                                         </button>
                                                      )}
                                                   </div>

                                                   <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                                                      <button
                                                         onClick={() => toggleMaterialPreview(material.id)}
                                                         className="min-h-10 rounded-xl bg-white px-3 py-2 text-center text-xs font-medium leading-5 transition-colors hover:bg-[var(--color-surface)]"
                                                      >
                                                         {expandedMaterialIds.includes(material.id) ? "Hide" : "View"}
                                                      </button>

                                                      <button
                                                         onClick={() => interpretProjectMaterial(activeProject, material)}
                                                         disabled={activeMaterialInterpretId === material.id}
                                                         className="min-h-10 rounded-xl bg-white px-3 py-2 text-center text-xs font-medium leading-5 transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60"
                                                      >
                                                         {activeMaterialInterpretId === material.id ? "Reading..." : material.interpretedAt ? "Re-read" : "Interpret"}
                                                      </button>

                                                      <button
                                                         onClick={() => toggleMaterialProjectReference(activeProject, material)}
                                                         aria-pressed={selectedProjectMaterialIds.includes(material.id)}
                                                         className={`min-h-10 rounded-xl px-3 py-2 text-center text-xs font-medium leading-5 transition-colors ${
                                                            selectedProjectMaterialIds.includes(material.id) ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "bg-white hover:bg-[var(--color-surface)]"
                                                         }`}
                                                      >
                                                         {selectedProjectMaterialIds.includes(material.id) ? "Referenced in Project" : "Reference in Project"}
                                                      </button>
                                                      <button
                                                         onClick={() => deleteProjectMaterial(material.id)}
                                                         className="min-h-10 rounded-xl bg-white px-3 py-2 text-center text-xs font-medium leading-5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
                                                      >
                                                         Delete
                                                      </button>
                                                   </div>
                                                </div>

                                                {expandedMaterialIds.includes(material.id) && (
                                                   <div className="mt-4 rounded-2xl bg-white p-4">
                                                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Material Details</p>

                                                      {material.type === "Image" && material.imageDataUrl && (
                                                         <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)]">
                                                            <button type="button" onClick={() => setFullscreenImageMaterial(material)} className="block w-full transition-opacity hover:opacity-90" aria-label={`Open ${material.title} full screen`}>
                                                               <img src={material.imageDataUrl} alt={material.imageFileName || material.title || "Project image material"} className="max-h-[420px] w-full object-contain" />
                                                            </button>
                                                            {material.imageFileName && <p className="border-t border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">{material.imageFileName}</p>}
                                                         </div>
                                                      )}

                                                      {material.type === "Document" && (material.documentFileName || material.documentText || material.documentDataUrl) && (
                                                         <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)]">
                                                            <button
                                                               type="button"
                                                               onClick={() => setFullscreenDocumentMaterial(material)}
                                                               className="block w-full px-4 py-3 text-left transition-colors hover:bg-white"
                                                               aria-label={`Open ${material.title} document reader`}
                                                            >
                                                               <p className="break-words text-sm font-medium text-[var(--color-text-primary)]">{material.documentFileName || material.title || "Project document"}</p>
                                                               <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{isReadableProjectDocument(material) ? "Open reader" : "Attached document"}</p>
                                                            </button>
                                                         </div>
                                                      )}

                                                      {material.interpretationSummary && (
                                                         <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                                                            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">ALLEVIN Interpretation</p>
                                                            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">{material.interpretationSummary}</p>
                                                            {material.interpretationUsefulContext && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-secondary)]">{material.interpretationUsefulContext}</p>}
                                                            {material.interpretationNextStep && (
                                                               <p className="mt-3 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[var(--color-text-primary)]">Next move: {material.interpretationNextStep}</p>
                                                            )}
                                                         </div>
                                                      )}

                                                      <p className="mt-3 max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                                                         {material.notes || material.summary || "No extra details saved for this material yet."}
                                                      </p>
                                                   </div>
                                                )}
                                             </div>
                                          ))}
                                       </div>
                                    ) : (
                                       <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">No {materialTypeFilter.toLowerCase()} materials in this project yet.</div>
                                    )
                                 ) : (
                                    <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                                       No materials attached yet. Add notes, feedback, references, documents, or planning details so this project has context to work from.
                                    </div>
                                 )}
                              </div>
                           </div>
                        );
                     })()}
                  </div>
               </div>
            ) : (
               <div className="rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)] sm:p-5">No projects yet. Add a project here and keep its notes, progress, materials, and schedule together.</div>
            )}
         </div>

         <AnimatePresence>
            {fullscreenImageMaterial?.imageDataUrl && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Full screen project image"
                  onClick={() => setFullscreenImageMaterial(null)}
               >
                  <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                     <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                           <p className="break-words text-sm font-semibold text-[var(--color-text-primary)]">{fullscreenImageMaterial.title}</p>
                           {fullscreenImageMaterial.imageFileName && <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{fullscreenImageMaterial.imageFileName}</p>}
                        </div>

                        <button
                           type="button"
                           onClick={() => setFullscreenImageMaterial(null)}
                           className="shrink-0 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
                        >
                           Close
                        </button>
                     </div>

                     <div className="flex max-h-[82vh] items-center justify-center overflow-auto bg-[var(--color-bg)] p-3 sm:p-5">
                        <img src={fullscreenImageMaterial.imageDataUrl} alt={fullscreenImageMaterial.imageFileName || fullscreenImageMaterial.title || "Project image material"} className="max-h-[78vh] max-w-full object-contain" />
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>

         <AnimatePresence>
            {fullscreenDocumentMaterial && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Project document reader"
                  onClick={() => setFullscreenDocumentMaterial(null)}
               >
                  <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                     <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                           <p className="break-words text-sm font-semibold text-[var(--color-text-primary)]">{fullscreenDocumentMaterial.title}</p>
                           {fullscreenDocumentMaterial.documentFileName && <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{fullscreenDocumentMaterial.documentFileName}</p>}
                        </div>

                        <button
                           type="button"
                           onClick={() => setFullscreenDocumentMaterial(null)}
                           className="shrink-0 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
                        >
                           Close
                        </button>
                     </div>

                     <div className="max-h-[82vh] overflow-auto bg-[var(--color-bg)] p-3 sm:p-5">
                        {fullscreenDocumentMaterial.documentMimeType === "application/pdf" && fullscreenDocumentMaterial.documentDataUrl ? (
                           <iframe
                              title={fullscreenDocumentMaterial.documentFileName || fullscreenDocumentMaterial.title || "Project document"}
                              src={fullscreenDocumentMaterial.documentDataUrl}
                              className="h-[78vh] w-full rounded-2xl border border-[var(--border-subtle)] bg-white"
                           />
                        ) : fullscreenDocumentMaterial.documentText ? (
                           <pre className="min-h-[70vh] whitespace-pre-wrap break-words rounded-2xl border border-[var(--border-subtle)] bg-white p-4 text-sm leading-7 text-[var(--color-text-secondary)]">{fullscreenDocumentMaterial.documentText}</pre>
                        ) : (
                           <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 text-sm leading-6 text-[var(--color-text-secondary)]">
                              This document is attached to the project, but this file type does not have an in-app reader yet. PDF, TXT, and Markdown are the readable options for this build.
                           </div>
                        )}
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
      </motion.section>
   );
}
