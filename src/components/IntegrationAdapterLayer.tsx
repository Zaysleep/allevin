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

   // Hidden milestone intelligence. The Progress list stays light, while
   // AIDock and the milestone workspace can reason from real dependencies,
   // completion checks, and recorded evidence.
   dependencies: string[];
   completionCriteria: string[];
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
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .split(/(?<=[.!?])\s+|\n+|;\s+(?=[A-Z0-9])/)
      .map((sentence) => compactText(sentence))
      .filter(Boolean);
}

const PROJECT_INTAKE_FILLER_PATTERNS = [
   /^(?:so|okay|alright|basically|essentially|honestly|currently|right now)\b\s*,?\s*/i,
   /^(?:i just wanted to say|i wanted to explain|the idea is that|what i am thinking is|what i'm thinking is)\b\s*/i,
   /^(?:also|another thing is|one more thing is|and then)\b\s*/i,
];

function cleanProjectIntakeStatement(value?: string, limit = 520) {
   let clean = sanitizeProjectBody(value)
      .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();

   PROJECT_INTAKE_FILLER_PATTERNS.forEach((pattern) => {
      clean = clean.replace(pattern, "");
   });

   clean = clean
      .replace(/^(?:and|but)\s+/i, "")
      .replace(/\b(?:you know|kind of|sort of)\b/gi, "")
      .replace(/\s+/g, " ")
      .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
      .trim();

   if (!clean) {
      return "";
   }

   const clipped = clean.length > limit ? `${clean.slice(0, limit).trim()}…` : clean;
   return `${clipped.charAt(0).toUpperCase()}${clipped.slice(1)}`;
}

function getProjectIntakeStatementKey(value?: string) {
   return cleanProjectIntakeStatement(value, 700)
      .toLowerCase()
      .replace(/\b(?:the|a|an|this|that|project|should|will|must|needs?|need|want|would|could)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function uniqueProjectIntakeStatements(values: string[], limit = 8) {
   const result: string[] = [];
   const keys: string[] = [];

   for (const value of values) {
      const clean = cleanProjectIntakeStatement(value);
      const key = getProjectIntakeStatementKey(clean);

      if (!clean || clean.length < 8 || !key || keys.some((existing) => existing === key || existing.includes(key) || key.includes(existing))) {
         continue;
      }

      keys.push(key);
      result.push(clean.replace(/[.!?]+$/, ""));

      if (result.length >= limit) {
         break;
      }
   }

   return result;
}

function splitProjectIntakeClauses(value?: string) {
   return splitProjectDescriptionSentences(value)
      .flatMap((sentence) => sentence.split(/,\s+(?=(?:and\s+)?(?:i|we|it|this|that)\b)|\s+(?:and then|also)\s+/i).map((part) => cleanProjectIntakeStatement(part)))
      .filter(Boolean);
}

function projectStatementIsUncertain(value: string) {
   return /\b(?:may|might|could|possibly|probably|perhaps|thinking about|considering|not sure|unsure|do not know|don't know|does not know|doesn't know|still need to (?:decide|choose|confirm|determine|select|finalize)|need to (?:decide|choose|confirm|determine|select|finalize)|have not (?:yet )?(?:decided|chosen|confirmed|selected|finalized)|has not (?:yet )?(?:decided|chosen|confirmed|selected|finalized)|haven't (?:decided|chosen|confirmed|selected|finalized)|hasn't (?:decided|chosen|confirmed|selected|finalized)|not decided|not chosen|not confirmed|not finalized|whether|which approach|what should|who should)\b/i.test(
      value,
   );
}

function projectStatementIsCurrentFact(value: string) {
   const clean = cleanProjectIntakeStatement(value, 900);
   if (!clean) return false;

   if (/\b(?:have|has|had|we|i)\s+(?:already\s+)?(?:decided|chosen|selected|confirmed|committed)\b|\b(?:has|have)\s+been\s+(?:decided|chosen|selected|confirmed)\b/i.test(clean)) {
      return false;
   }

   return (
      projectStatementIsSituation(clean) ||
      /\b(?:currently includes?|currently contains?|current lease ends?|lease ends? in|already own|already have|(?:i|we)\s+(?:already\s+)?have\s+(?!already\s+(?:decided|chosen|selected|confirmed))|(?:i|we)\s+do\s+not\s+(?:yet\s+)?have|collection includes?|collection contains?|consists of|is spread across|are spread across|stored across|some .{0,100} (?:have|include|contain)|many .{0,80} do not|total number of .{0,80} (?:is|are) not known|not yet inventoried|nothing has been)\b/i.test(
         clean,
      )
   );
}

function projectStatementIsDecision(value: string) {
   const clean = cleanProjectIntakeStatement(value);

   if (!clean || projectStatementIsUncertain(clean) || /\b(?:do not|don't|cannot|can't|would|could|may|might)\b/i.test(clean)) {
      return false;
   }

   if (/\b(?:need|needs|must|has|have)\s+to\s+come\s+before\b/i.test(clean)) {
      return true;
   }

   return /\b(?:will|will be|is scheduled|is set|has been chosen|has been selected|has been decided|has been confirmed|is confirmed|is approved|uses|will use|built with|using|deployed through|deployed on|hosted on|comes before|takes priority|is the priority|remains|will remain|includes|will include|excludes|will exclude|must preserve|must remain)\b/i.test(
      clean,
   );
}

function projectStatementIsSuccess(value: string) {
   return /\b(?:success means|success would mean|success looks like|success will mean|successful when|project is successful when|done means|done when|complete when|ready when|must be true|should feel|should allow|should help|should be able to|users? can|ready to share|ready to launch)\b/i.test(
      value,
   );
}

function projectStatementIsSituation(value: string) {
   return /\b(?:currently|right now|at the moment|early in|early planning|planning stage|draft stage|research underway|waiting for|implementation in progress|in progress|not started|already|nothing has been|have not|has not|haven't|hasn't|no .{0,80}\b(?:selected|chosen|confirmed|completed|started|finalized))\b/i.test(
      value,
   );
}

function projectStatementIsConstraint(value: string) {
   return /\b(?:budget|deadline|time limit|within\s+\d+|only|cannot|can't|do not|don't|must|needs? to|required|requirement|constraint|accessible|accessibility|wcag|privacy|security|legal|policy|emissions|insurance|safety|reliability|maintenance|compatibility|platform|browser|mobile|keyboard|screen reader|quality|service|resale|noise|sound limits?|sound should|sound must|sound cannot|quiet[- ]hours?|walkways?|entrances?|emergency access|shared space|environment|small team|solo developer|one volunteer|one person|single person|comfort|fitment|support|maintainability|avoid|preserve|without)\b/i.test(
      value,
   );
}

function projectStatementIsGoal(value: string) {
   return (
      /\b(?:start|starting|build|building|create|creating|design|designing|plan|planning|organize|organizing|launch|launching|write|writing|research|researching|develop|developing|prepare|preparing|complete|completing|produce|producing|improve|improving|replace|replacing|introduce|introducing|modify|modifying|upgrade|upgrading|deliver|delivering|establish|establishing)\b/i.test(
         value,
      ) &&
      !/\b(?:do not|don't|avoid|without|cannot|can't)\b/i.test(value) &&
      !projectStatementIsSuccess(value) &&
      !projectStatementIsSituation(value)
   );
}

function stripProjectIntakeLead(value: string) {
   return cleanProjectIntakeStatement(value)
      .replace(/^(?:i|we)\s+(?:want|would like|would love|plan|hope|need)\s+to\s+/i, "")
      .replace(/^(?:the goal is to|my goal is to|our goal is to)\s+/i, "")
      .replace(/^(?:start|create|set up)\s+(?:a\s+)?project\s+(?:around|about|to)\s+/i, "")
      .replace(/[.!?,;:\s]+$/, "")
      .trim();
}

function normalizeProjectQuestionSubject(value: string) {
   return cleanProjectIntakeStatement(value, 220)
      .replace(/^(?:and|or)\s+/i, "")
      .replace(/^(?:the\s+)?question\s+of\s+/i, "")
      .replace(/[.!?]+$/, "")
      .trim();
}

function makeProjectIntakeQuestion(value: string) {
   let clean = normalizeProjectQuestionSubject(value)
      .replace(/^(?:i|we)\s+(?:still\s+)?need\s+to\s+(?:decide|choose|confirm|determine|figure out|clarify|select|finalize)\s+/i, "")
      .replace(/^(?:i|we)\s+(?:am|are)\s+not\s+sure\s+(?:about\s+)?/i, "")
      .replace(/^(?:i|we)\s+(?:have|has)\s+not\s+(?:yet\s+)?(?:chosen|decided|confirmed|selected|finalized)\s+/i, "")
      .trim();

   if (!clean) return "";
   if (/^(?:who|what|when|where|why|how|which|is|are|can|should|will|does|do)\b/i.test(clean)) return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}?`;
   if (/^whether\s+/i.test(clean)) {
      const subject = clean.replace(/^whether\s+/i, "").trim();
      return subject ? `Should ${subject.charAt(0).toLowerCase()}${subject.slice(1)}?` : "";
   }
   const roleMatch = clean.match(/^(?:the\s+)?(?:actual\s+)?(purpose|role|scope|direction|priority)\s+of\s+(.+)$/i);
   if (roleMatch) return `What ${roleMatch[1].toLowerCase()} should ${roleMatch[2]} have?`;
   const budgetMatch = clean.match(/^(?:the\s+)?(?:final\s+)?budgets?\s+(?:for|of)\s+(.+)$/i);
   if (budgetMatch) return `What is the budget for ${budgetMatch[1]}?`;
   const targetMatch = clean.match(/^(.+?)\s+targets?$/i);
   if (targetMatch) return `What should the ${targetMatch[1].toLowerCase()} target be?`;
   const specMatch = clean.match(/^(.+?)\s+specifications?$/i);
   if (specMatch) return `What specifications should be used for ${specMatch[1].toLowerCase()}?`;
   if (/^(?:exact\s+)?(?:parts?|options?|tools?|vendors?|sources?|systems?|platforms?|methods?|approaches?)$/i.test(clean)) return `Which ${clean.toLowerCase()} should be chosen?`;
   if (/^(?:final\s+)?(?:budgets?|requirements?|dates?|owners?|locations?|limits?)$/i.test(clean)) return `What are the ${clean.toLowerCase()}?`;
   return `What still needs to be decided about ${clean.charAt(0).toLowerCase()}${clean.slice(1)}?`;
}

function splitProjectDecisionItems(value: string) {
   const normalized = cleanProjectIntakeStatement(value, 900)
      .replace(/\s+or\s+whether\s+/gi, ", whether ")
      .replace(/\s+and\s+whether\s+/gi, ", whether ");

   return normalized
      .split(/,\s*(?=(?:which|what|whether|who|how|the|a|an|exact|final|ride|wheel|exhaust|installation|budget|timeline|deadline|owner|platform|tool|location)\b)|\s+and\s+(?=(?:which|what|whether|who|how)\b)/i)
      .map((item) => normalizeProjectQuestionSubject(item))
      .filter((item) => item.length >= 4);
}

function extractProjectSuccessCriteria(description: string) {
   const clean = sanitizeProjectBody(description);
   const marker = /(?:success\s+(?:means|would\s+mean|looks\s+like|will\s+mean)|the\s+project\s+is\s+successful\s+when|done\s+means|done\s+when|complete\s+when)\s*[:,-]?\s*/i;
   const match = marker.exec(clean);

   if (!match) {
      return uniqueProjectIntakeStatements(splitProjectDescriptionSentences(clean).filter(projectStatementIsSuccess), 5);
   }

   const tail = clean.slice(match.index + match[0].length).split(/\n{2,}|\b(?:current situation|confirmed decisions|open questions|constraints|working notes|initial milestones|recommended starting point)\s*:/i)[0];
   const criteria = splitProjectDescriptionSentences(tail)
      .map((sentence) => stripProjectIntakeLead(sentence.replace(/^(?:success\s+)?(?:would\s+)?mean\s*/i, "").replace(/^(?:and|also)\s+/i, "")))
      .filter((sentence) => sentence.length >= 10);

   return uniqueProjectIntakeStatements(criteria, 6);
}

function normalizeConfirmedProjectDecision(value: string) {
   const original = cleanProjectIntakeStatement(value, 700)
      .replace(/[.!?]+$/, "")
      .trim();
   if (!original || projectStatementIsSuccess(original) || projectStatementIsCurrentFact(original)) return "";

   const explicitDecision = original.match(/^(?:i|we)\s+(?:have|had)\s+(?:already\s+)?decided\s+that\s+(.+)$/i);
   if (explicitDecision) {
      const statement = explicitDecision[1].trim();
      return statement ? `${statement.charAt(0).toUpperCase()}${statement.slice(1)}` : "";
   }

   const phaseBudget = original.match(/^(?:i|we)\s+(?:would like|want|plan|intend)\s+to\s+keep\s+(.+?)\s+(?:under|below|within|at)\s+(\$[\d,]+(?:\.\d{1,2})?)/i);
   if (phaseBudget) {
      const rawSubject = phaseBudget[1].replace(/^(?:the\s+)?/i, "").trim();
      const subject = rawSubject.replace(/\s+budget$/i, "").trim();
      return `The ${subject ? `${subject} ` : ""}budget will stay at or below ${phaseBudget[2]}`;
   }

   const limitedFirstVersion = original.match(/^(?:the\s+)?(?:event|project|first\s+(?:version|phase|release|setup))\s+should\s+(?:probably\s+)?be\s+limited\s+to\s+(.+?)(?:\s+for\s+the\s+first\s+(?:version|phase|event))?$/i);
   if (limitedFirstVersion && !/\bprobably\b/i.test(original)) {
      const scope = limitedFirstVersion[1]
         .replace(/\s+for\s+the\s+first\s+(?:version|phase|event)$/i, "")
         .replace(/\s+and\s+should\s+/i, " and will ")
         .trim();
      return `The first version will be limited to ${scope}`;
   }

   const noPublicPromotion = original.match(/^(?:i|we)\s+(?:do not|don't)\s+want\s+to\s+(?:promote|advertise|publish|share)\s+(?:it|the\s+event|the\s+project)?\s*publicly\s+until\s+(.+)$/i);
   if (noPublicPromotion) {
      return `The first version will not be promoted publicly until ${noPublicPromotion[1]}`;
   }

   const firstVersionFocus = original.match(/^(?:the\s+)?(?:first|initial)\s+(?:version|phase|release|setup)\s+(?:should\s+|will\s+)?(?:focus\s+on|start\s+with|cover)\s+(.+)$/i);
   if (firstVersionFocus && !/\b(?:probably|may|might|considering)\b/i.test(original)) {
      return `The first version will focus on ${firstVersionFocus[1]}`;
   }

   const firstVersionAvoid = original.match(/^(?:the\s+)?(?:first|initial)\s+(?:version|phase|release|setup)\s+(?:should\s+not|will\s+not|must\s+not)\s+(.+)$/i);
   if (firstVersionAvoid) {
      return `The first version will not ${firstVersionAvoid[1]}`;
   }

   const firstVersionSupport = original.match(/^(?:the\s+)?(?:first|initial)\s+(?:version|phase|release|setup)\s+(?:should\s+(?:probably\s+)?|will\s+)?(?:support|include|cover|handle)\s+(.+)$/i);
   if (firstVersionSupport && !/\bprobably\b/i.test(original)) return `The first version will support ${firstVersionSupport[1]}`;

   const limitedRule = original.match(/^(.+?)\s+should\s+be\s+limited\s+to\s+(.+)$/i);
   if (limitedRule && !/\bprobably\b/i.test(original)) {
      return `${limitedRule[1].replace(/^./, (character) => character.toUpperCase())} will be limited to ${limitedRule[2]}`;
   }

   const preservationRule = original.match(/^(?:i|we)\s+want\s+(.+?)\s+to\s+(preserve|retain|remain|use|support|include|protect)\s+(.+)$/i);
   if (preservationRule && !/\b(?:probably|may|might|considering)\b/i.test(original)) {
      const subject = preservationRule[1].replace(/^the\s+/i, "").trim();
      return `${subject.replace(/^./, (character) => character.toUpperCase())} will ${preservationRule[2].toLowerCase()} ${preservationRule[3]}`;
   }

   const excludedAtFirst = original.match(/^(.+?)\s+should\s+be\s+excluded\s+(?:at\s+first|from\s+the\s+first\s+(?:version|phase|release|setup))$/i);
   if (excludedAtFirst) return `${excludedAtFirst[1].replace(/^./, (character) => character.toUpperCase())} will be excluded from the first phase`;

   const excludedScope = original.match(/^(?:i|we)\s+(?:do not|don't)\s+need\s+(?:the\s+first\s+(?:version|phase|release|setup)\s+)?to\s+(?:support|include|cover|handle)\s+(.+)$/i);
   if (excludedScope) return `The first version will not include ${excludedScope[1]}`;

   if (/\b(?:garage|room|space|workspace|studio|shop)\b/i.test(original) && /\b(?:cannot|can't)\s+dedicate\s+(?:the\s+)?(?:entire|whole)\b/i.test(original)) {
      return "The space will remain available for more than one use";
   }

   if (projectStatementIsUncertain(original)) return "";
   if (!projectStatementIsDecision(original) && !/\bshould\s+(?:be|remain|use|include|exclude|preserve|avoid|support)\b/i.test(original)) return "";
   return original.trim();
}

function splitProjectQuestionList(value: string) {
   const clean = cleanProjectIntakeStatement(value, 1600).replace(/\s+(?:or|and)\s+(?=(?:whether|which|what|how|where|who|when)\b)/gi, ", ");

   const hasInterrogativeClauses = /\b(?:whether|how|what|which|where|who|when)\b/i.test(clean);
   const parts = hasInterrogativeClauses ? clean.split(/,\s*(?=(?:whether|how|what|which|where|who|when)\b)|\s+and\s+(?=(?:whether|how|what|which|where|who|when)\b)/i) : clean.split(/,\s*|\s+and\s+/i);

   return parts.map((item) => normalizeProjectQuestionSubject(item)).filter((item) => item.length >= 4);
}

function makeProjectGapQuestion(value: string) {
   const clean = normalizeProjectQuestionSubject(value)
      .replace(/^(?:the\s+)?(?:exact\s+)?/i, "")
      .replace(/\s+(?:have|has)\s+not\s+been\s+(?:finalized|decided|confirmed|selected|chosen)$/i, "")
      .replace(/\s+yet$/i, "")
      .trim();

   if (!clean) return "";

   const whetherAllows = clean.match(/^whether\s+(.+?)\s+allows?\s+(.+)$/i);
   if (whetherAllows) return `Will ${whetherAllows[1]} allow ${whetherAllows[2]}?`;

   const whetherIs = clean.match(/^whether\s+(.+?)\s+is\s+(.+)$/i);
   if (whetherIs) return `Is ${whetherIs[1]} ${whetherIs[2]}?`;

   const naturalEventQuestions: Array<[RegExp, string]> = [
      [/^(?:a\s+)?date$/i, "What date should the event use?"],
      [/^(?:the\s+)?movie(?:\s+choice)?$/i, "Which movie should be shown?"],
      [/^(?:the\s+)?equipment\s+setup$/i, "What equipment setup should be used?"],
      [/^(?:the\s+)?(?:exact\s+)?courtyard\s+location$/i, "Which courtyard location should be used?"],
      [/^(?:the\s+)?attendance\s+estimate$/i, "What attendance estimate should the first event plan for?"],
      [/^(?:the\s+)?sound\s+limits?$/i, "What sound limits apply?"],
      [/^(?:the\s+)?weather\s+backup$/i, "What is the weather backup plan?"],
      [/^(?:the\s+)?cleanup\s+responsibilit(?:y|ies)$/i, "Who is responsible for cleanup?"],
      [/^(?:the\s+)?management\s+approval$/i, "What approval is required from management?"],
      [/^(?:the\s+)?licensing$/i, "What licensing is required?"],
      [/^(?:the\s+)?power$/i, "Is power available where the project will operate?"],
   ];
   const naturalEventQuestion = naturalEventQuestions.find(([pattern]) => pattern.test(clean));
   if (naturalEventQuestion) return naturalEventQuestion[1];

   const naturalProjectQuestions: Array<[RegExp, string]> = [
      [/^(?:the\s+)?priority\s+collection$/i, "Which collection should be handled first?"],
      [/^(?:the\s+)?priority\s+(?:set|batch|sample|case|group)$/i, "Which starting set, batch, sample, case, or group should be handled first?"],
      [/^(?:the\s+)?inventory\s+(?:method|approach|system)$/i, "What inventory method should be used?"],
      [/^(?:the\s+)?(?:file[- ]?)?naming\s+(?:system|approach|convention)$/i, "What naming system should be used?"],
      [/^(?:the\s+)?folder\s+structure$/i, "How should the folders be organized?"],
      [/^(?:the\s+)?(?:metadata\s+)?fields?$/i, "Which metadata fields are required?"],
      [/^(?:the\s+)?(?:metadata\s+)?approach$/i, "How should metadata be recorded?"],
      [/^(?:the\s+)?(?:quality|scanning|digitization|capture|review)\s+standards?$/i, "What quality and handling standards should be used?"],
      [/^(?:the\s+)?privacy\s+rules?$/i, "What privacy and access rules apply?"],
      [/^(?:the\s+)?access\s+rules?$/i, "What access rules apply?"],
      [/^(?:the\s+)?(?:family[- ]?|stakeholder[- ]?|peer[- ]?)?review\s+process$/i, "How should review input be collected and resolved?"],
      [/^(?:the\s+)?identification\s+process$/i, "How should unknown or incomplete details be identified and resolved?"],
      [/^(?:the\s+)?backup\s+plan$/i, "What backup plan should be used?"],
      [/^(?:the\s+)?preservation\s+supplies$/i, "Which preservation supplies are needed?"],
      [/^(?:the\s+)?book\s+format$/i, "What format should the final book use?"],
      [/^(?:the\s+)?(?:printing|book)\s+(?:service|vendor|provider)$/i, "Which printing service or provider should be used?"],
      [/^(?:the\s+)?(?:first|initial)\s+(?:tool|resource|item)\s+list$/i, "Which tools, resources, or items should be included in the first set?"],
      [/^(?:the\s+)?(?:borrowing|checkout|check-out)\s+records?$/i, "How should borrowing and return records be kept?"],
      [/^(?:the\s+)?labels?$/i, "How should the resources or items be labeled?"],
      [/^(?:the\s+)?storage\s+location$/i, "Where should the first version be stored?"],
      [/^(?:the\s+)?volunteer\s+ownership$/i, "Who will own day-to-day maintenance?"],
      [/^(?:the\s+)?pilot\s+length$/i, "How long should the pilot run?"],
      [/^(?:the\s+)?(?:exact\s+)?budget$/i, "How should the available budget be allocated?"],
      [/^(?:the\s+)?target\s+neighborhood$/i, "Which neighborhoods fit the commute, budget, and daily-life needs?"],
      [/^(?:the\s+)?apartment$/i, "Which apartment best fits the confirmed must-haves and budget?"],
      [/^(?:the\s+)?(?:exact\s+)?move\s+date$/i, "What move date best fits the lease and notice timeline?"],
      [/^(?:the\s+)?lease\s+overlap$/i, "Can the budget support one week of lease overlap?"],
      [/^(?:the\s+)?mover$/i, "Which mover should handle the large furniture?"],
      [/^(?:the\s+)?packing\s+schedule$/i, "What packing schedule fits the available weekends?"],
      [/^(?:the\s+)?utility\s+dates?$/i, "When should each utility be transferred or started?"],
      [/^(?:the\s+)?address[- ]change\s+checklist$/i, "Which address changes must be completed, and when?"],
      [/^(?:the\s+)?disposal\s+plan$/i, "What should be kept, sold, donated, or replaced?"],
      [/^(?:the\s+)?cleaning\s+responsibilit(?:y|ies)$/i, "Who will clean and document the old apartment?"],
      [/^(?:the\s+)?contingency\s+plan$/i, "What is the fallback if approval, moving day, or internet setup is delayed?"],
      [/^(?:the\s+)?final\s+budget$/i, "What is the final relocation budget?"],
   ];
   const naturalProjectQuestion = naturalProjectQuestions.find(([pattern]) => pattern.test(clean));
   if (naturalProjectQuestion) return naturalProjectQuestion[1];

   const genericMethod = clean.match(/^(.+?)\s+(method|approach|system|process|workflow)$/i);
   if (genericMethod) {
      const rawSubject = genericMethod[1].replace(/^(?:the|a|an)\s+/i, "").trim();
      const subject = rawSubject.replace(/^./, (character) => character.toLowerCase());
      return genericMethod[2].toLowerCase() === "process" || genericMethod[2].toLowerCase() === "workflow" ? `How should the ${subject} ${genericMethod[2].toLowerCase()} work?` : `What ${subject} ${genericMethod[2].toLowerCase()} should be used?`;
   }

   const genericStructure = clean.match(/^(.+?)\s+(structure|model|framework|plan)$/i);
   if (genericStructure) {
      const rawSubject = genericStructure[1].replace(/^(?:the|a|an)\s+/i, "").trim();
      const subject = rawSubject.replace(/^./, (character) => character.toLowerCase());
      return genericStructure[2].toLowerCase() === "plan" ? `What ${subject} plan should be used?` : `How should the ${subject} ${genericStructure[2].toLowerCase()} be organized?`;
   }

   const genericStandards = clean.match(/^(.+?)\s+(standards?|criteria|rules?|requirements?)$/i);
   if (genericStandards) {
      const rawSubject = genericStandards[1].replace(/^(?:the|a|an)\s+/i, "").trim();
      const subject = rawSubject.replace(/^./, (character) => character.toLowerCase());
      return `What ${subject} ${genericStandards[2].toLowerCase()} should apply?`;
   }

   const processFor = clean.match(/^(?:the\s+)?process\s+for\s+(.+)$/i);
   if (processFor) return `How should ${processFor[1]} be handled?`;

   const howLong = clean.match(/^how\s+long\s+(.+?)\s+should\s+(.+)$/i);
   if (howLong) return `How long should ${howLong[1]} ${howLong[2]}?`;

   const insuranceRules = clean.match(/^(?:whether\s+)?(?:the\s+)?(?:building['’]s\s+)?insurance\s+or\s+lease\s+rules\s+(.+)$/i);
   if (insuranceRules) return "What insurance or lease restrictions apply?";

   const whetherWill = clean.match(/^whether\s+(i|we|he|she|they|the project|the team)\s+will\s+(.+)$/i);
   if (whetherWill) {
      const subject = /^i$/i.test(whetherWill[1]) ? "I" : whetherWill[1];
      return `Should ${subject} ${whetherWill[2]}?`;
   }

   const whetherShould = clean.match(/^whether\s+(.+?)\s+should\s+(.+)$/i);
   if (whetherShould) return `Should ${whetherShould[1]} ${whetherShould[2]}?`;

   const howShould = clean.match(/^how\s+(.+?)\s+should\s+(.+)$/i);
   if (howShould) return `How should ${howShould[1]} ${howShould[2]}?`;

   const howCan = clean.match(/^how\s+(.+?)\s+can\s+(.+)$/i);
   if (howCan) return `How can ${howCan[1]} ${howCan[2]}?`;

   const whereCan = clean.match(/^where\s+(.+?)\s+can\s+(.+)$/i);
   if (whereCan) return `Where can ${whereCan[1]} ${whereCan[2]}?`;

   if (/^(?:whether|how|what|which|where|who|when)\b/i.test(clean)) return makeProjectIntakeQuestion(clean);
   if (/\b(?:capacity|sufficient|safe|adequate)\b/i.test(clean)) return `What must be confirmed about ${clean.charAt(0).toLowerCase()}${clean.slice(1)}?`;
   if (/\b(?:layout|plan|approach|format|method|tool|equipment|workbench|surface|location|date|owner|responsibility|budget|scope|priority|requirements?|needs?)\b/i.test(clean)) {
      return `What should be decided about ${clean.charAt(0).toLowerCase()}${clean.slice(1)}?`;
   }
   return makeProjectIntakeQuestion(clean);
}

function isProjectResourceGap(value: string) {
   return /^(?:i|we)\s+(?:do not|don't)\s+(?:own|have|currently have)|\b(?:do not|don't)\s+have\s+(?:a|an|any)\b/i.test(value);
}

function joinProjectLabels(labels: string[]) {
   const values: string[] = [];
   const seen = new Set<string>();
   for (const label of labels) {
      const clean = label.trim().toLowerCase();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      values.push(clean);
   }
   if (!values.length) return "";
   if (values.length === 1) return values[0];
   if (values.length === 2) return `${values[0]} and ${values[1]}`;
   return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function isEventProjectIntake(description: string) {
   const source = sanitizeProjectBody(description);
   if (/\b(?:event|movie night|film night|gathering|meetup|party|festival|ceremony|conference|fair)\b/i.test(source) || /\b(?:film|movie|public)\s+screening\b/i.test(source)) return true;

   const logistics = [
      /\b(?:event date|date should|choose a date|scheduled for|schedule the)\b/i,
      /\b(?:attendees?|guests?|attendance estimate|rsvp)\b/i,
      /\b(?:venue|courtyard|viewing area|seating layout|stage|room booking)\b/i,
      /\b(?:quiet hours?|sound limits?|weather backup|rain plan)\b/i,
      /\b(?:projector|screen|outdoor speakers?|microphone|pa system)\b/i,
   ];

   return logistics.filter((pattern) => pattern.test(source)).length >= 3;
}

function inferEventProjectOpenQuestions(description: string) {
   if (!isEventProjectIntake(description)) return [];

   const source = sanitizeProjectBody(description);
   const questions: string[] = [];
   const add = (condition: boolean, question: string) => {
      if (condition) questions.push(question);
   };

   add(/\b(?:management approval|apartment management|venue management|building management|management.{0,50}(?:allow|approve)|approval.{0,40}(?:event|required)|building rules?)\b/i.test(source), "What approval is required from management?");
   add(/\b(?:public performance license|performance rights?|screening rights?|licens(?:e|ing))\b/i.test(source), "Is a public performance license required?");
   add(/\b(?:have not|has not|haven't|hasn't|not)\b.{0,70}\bdate\b|\bdate\b.{0,50}\b(?:unresolved|not finalized|not chosen)\b/i.test(source), "What date should the event use?");
   add(/\battendance estimate\b|\bexpected attendance\b|\bhow many (?:people|residents|guests|attendees)\b/i.test(source), "What attendance estimate should the first event plan for?");
   add(/\b(?:have not|has not|haven't|hasn't|not)\b.{0,70}\bmovie\b|\bmovie choice\b.{0,50}\b(?:unresolved|not finalized|not chosen)\b/i.test(source), "Which movie should be shown?");
   add(
      /\b(?:equipment setup|screen|outdoor speakers?|projector setup|equipment)\b.{0,80}\b(?:unresolved|not finalized|not chosen|borrow|rent|minimal|simple setup)\b|\b(?:borrow|rent)\b.{0,50}\bequipment\b/i.test(source),
      "What equipment setup should be used?",
   );
   add(/\bprojector\b.{0,100}\b(?:bright enough|brightness|outdoor)\b/i.test(source), "Is the existing projector bright enough for the planned outdoor setting?");
   add(/\b(?:courtyard location|viewing area|exact courtyard location|exact location)\b/i.test(source), "Which courtyard or viewing location can support access, power, and emergency clearance?");
   add(/\b(?:power is available|power available|availability of power|outlets? near|electrical access)\b/i.test(source), "Is power available at the viewing area?");
   add(/\b(?:quiet[- ]hour rules?|sound limits?|sound should not disturb|noise limits?|nearby apartments)\b/i.test(source), "What quiet-hour and sound limits apply?");
   add(/\b(?:seating layout|chairs? or blankets?|bring their own chairs?|walkways?|entrances?|emergency access)\b/i.test(source), "What seating layout preserves walkways, entrances, and emergency access?");
   add(/\b(?:weather backup|weather contingency|rain plan|weather plan)\b/i.test(source), "What is the weather backup plan?");
   add(/\b(?:cleanup responsibilities?|cleanup supplies?|responsible for cleanup|restore the shared space)\b/i.test(source), "Who is responsible for setup, cleanup, and restoring the shared space?");
   add(/\b(?:borrow equipment|rent (?:it|equipment)|keep the event small enough|simple setup|minimal setup)\b/i.test(source), "Should equipment be borrowed, rented, or kept to a minimal setup?");

   return uniqueProjectIntakeStatements(questions, 16);
}

function inferEventProjectWorkingAssumptions(description: string) {
   if (!isEventProjectIntake(description)) return [];

   const source = sanitizeProjectBody(description);
   const assumptions: string[] = [];
   const firstEventScope = source.match(/(?:the\s+)?event\s+should\s+(?:probably\s+)?be\s+limited\s+to\s+(.+?)(?:\s+for\s+the\s+first\s+(?:version|event|phase))?[.!?]/i);
   if (firstEventScope) {
      assumptions.push(`Working assumption: The first event will be limited to ${firstEventScope[1].replace(/\s+for\s+the\s+first\s+(?:version|event|phase)$/i, "").trim()}`);
   }

   if (/\bbring their own chairs? or blankets?\b/i.test(source)) {
      assumptions.push("Working assumption: Attendees will bring their own chairs or blankets");
   }

   if (/\b(?:borrow equipment|rent (?:it|equipment)|keep the event small enough to use a simple setup)\b/i.test(source)) {
      assumptions.push("Working assumption: Use the smallest viable equipment setup until attendance and site requirements are confirmed");
   }

   return uniqueProjectIntakeStatements(assumptions, 4);
}

function inferGeneralProjectWorkingAssumptions(description: string) {
   const assumptions: string[] = [];

   for (const sentence of splitProjectDescriptionSentences(description)) {
      const clean = cleanProjectIntakeStatement(sentence, 420)
         .replace(/[.!?]+$/, "")
         .trim();
      if (!clean) continue;

      const probable = clean.match(/^(?:the\s+)?(.+?)\s+should\s+probably\s+(.+)$/i);
      if (probable) {
         assumptions.push(`Working assumption: ${probable[1].replace(/^./, (character) => character.toUpperCase())} will ${probable[2]}`);
         continue;
      }

      const considering = clean.match(/^(?:i|we)\s+(?:am|are)\s+considering\s+(?:starting\s+with|using|choosing|focusing\s+on)\s+(.+)$/i);
      if (considering) {
         assumptions.push(`Working candidate: ${considering[1]}`);
         continue;
      }

      const likelyStart = clean.match(/^(?:i|we)\s+(?:would|may|might)\s+(?:start|begin)\s+with\s+(.+)$/i);
      if (likelyStart) {
         assumptions.push(`Working candidate: ${likelyStart[1]}`);
         continue;
      }

      const provisional = clean.match(/^(?:for\s+now|for\s+the\s+first\s+(?:version|phase|release|pass))\s*,?\s*(.+)$/i);
      if (provisional && !projectStatementIsDecision(clean)) {
         assumptions.push(`Working assumption: ${provisional[1]}`);
      }
   }

   return uniqueProjectIntakeStatements(assumptions, 5);
}

function inferProjectDraftGoal(title: string, description: string) {
   const cleanDescription = sanitizeProjectBody(description);
   const sentences = splitProjectDescriptionSentences(cleanDescription);
   const explicit = cleanDescription.match(/(?:project goal|goal|objective)\s*:\s*([^\n]+)/i)?.[1];
   const directProjectSentence = sentences.find((sentence) =>
      /^(?:i|we)\s+(?:want|would like|plan|hope|need)\s+to\s+(?:build|create|organize|design|develop|launch|write|research|prepare|improve|replace|introduce|upgrade|deliver|establish|preserve|set up)\b/i.test(sentence),
   );
   const explicitSentence = sentences.find((sentence) => /^(?:the\s+)?(?:main\s+)?goal\s+is\s+to\b/i.test(sentence));
   const startAround = cleanDescription.match(/\b(?:start|create|set up)\s+(?:a\s+)?project\s+(?:around|about|to)\s+([^.!?]+)/i)?.[1];
   const candidate = explicit || directProjectSentence || explicitSentence || startAround || sentences.find(projectStatementIsGoal) || sentences[0] || `Complete ${title}`;

   let goal = stripProjectIntakeLead(candidate)
      .replace(/^(?:the\s+)?(?:main\s+)?goal\s+is\s+to\s+/i, "")
      .replace(/\bbut\s+(?:i|we)\s+[\s\S]*$/i, "")
      .replace(/[,\s]+$/, "")
      .trim();

   if (/^have\s+(?:a|an)\s+/i.test(goal)) goal = goal.replace(/^have\s+/i, "Create ");

   const verbMap: Record<string, string> = {
      Modifying: "Modify",
      Building: "Build",
      Creating: "Create",
      Designing: "Design",
      Planning: "Plan",
      Organizing: "Organize",
      Launching: "Launch",
      Writing: "Write",
      Researching: "Research",
      Developing: "Develop",
      Preparing: "Prepare",
      Improving: "Improve",
      Replacing: "Replace",
      Introducing: "Introduce",
      Upgrading: "Upgrade",
      Delivering: "Deliver",
      Establishing: "Establish",
   };
   const firstWord = goal.split(/\s+/)[0] || "";
   if (verbMap[firstWord]) goal = `${verbMap[firstWord]}${goal.slice(firstWord.length)}`;

   return sanitizeProjectBody(
      goal.length > 320
         ? `${goal
              .slice(0, 317)
              .replace(/\s+\S*$/, "")
              .trim()}…`
         : goal,
   );
}

function inferProjectDraftSuccess(description: string) {
   return extractProjectSuccessCriteria(description);
}

function inferProjectDraftSituation(description: string) {
   return uniqueProjectIntakeStatements(
      splitProjectDescriptionSentences(description)
         .filter((statement) => projectStatementIsCurrentFact(statement) && !projectStatementIsSuccess(statement))
         .map((statement) => cleanProjectIntakeStatement(statement, 360)),
      6,
   );
}

function isParticipantProgramProjectIntake(value?: string) {
   const clean = sanitizeProjectBody(value);
   if (!clean || /\b(?:software program|computer program|degree program|academic program of study)\b/i.test(clean)) return false;
   if (/\b(?:lend|lending|borrow|borrowing|check[- ]?out|returns?|tool[- ]lending|shared resource|resource library)\b/i.test(clean)) return false;

   const programSignal = /\b(?:program|pilot|mentorship|mentoring|peer support|cohort|volunteer initiative|service initiative)\b/i.test(clean);
   const participantSignal = /\b(?:participants?|students?|mentors?|mentees?|volunteers?|clients?|members?|pairs?|coordinator|applications?|eligibility|matching|orientation|recruitment|meetings?)\b/i.test(clean);
   const operatingSignal = /\b(?:create|start|launch|run|operate|set up|pair|match|recruit|train|orient|manage|coordinate)\b/i.test(clean);

   return programSignal && participantSignal && operatingSignal;
}

function inferParticipantProgramOpenQuestions(description: string) {
   const source = sanitizeProjectBody(description);
   if (!isParticipantProgramProjectIntake(source)) return [] as string[];

   const questions: string[] = [];
   const add = (supported: boolean, value: string) => {
      if (supported) questions.push(value);
   };

   add(/\b(?:not approved|approval|approve|sponsor(?:ed|ship)?)\b/i.test(source), "What approval is required before the program can launch?");
   add(/\b(?:department|owner|ownership|oversee|sponsor|coordinator)\b/i.test(source), "Which department or role will own the program day to day?");
   add(/\b(?:privacy|personal information|private phone numbers?|data minimization|what information can be collected)\b/i.test(source), "What participant information can be collected, who can see it, and how should it be protected?");
   add(/\b(?:background checks?|volunteers? require training|screening)\b/i.test(source), "Do volunteers require screening, background checks, or additional training?");
   add(/\b(?:report|reporting|escalat|outside the .* role|boundaries|emergency support)\b/i.test(source), "Which situations must be reported or escalated, and to whom?");
   add(/\b(?:apply|application questions?|applications?)\b/i.test(source), "How should participants apply, and which questions are necessary?");
   add(/\b(?:eligibility|first year|completed at least|who can join|who should participate)\b/i.test(source), "What eligibility rules should be used for each participant role?");
   add(/\b(?:match|matching|paired|pairing|pairs?)\b/i.test(source), "How should participants be matched, and which criteria matter most?");
   add(/\b(?:how often|meeting expectations?|meetings? should|regular contact)\b/i.test(source), "How often should participants meet or check in?");
   add(/\b(?:in person|online|virtual|meeting format)\b/i.test(source), "Should meetings happen in person, online, or both?");
   add(/\b(?:communication|phone numbers?|contact information|message|messaging)\b/i.test(source), "Which communication method protects privacy and is easy to manage?");
   add(/\b(?:orientation|mentor training|volunteer training|active listening|campus resources)\b/i.test(source), "What must the orientation or training cover before participants begin?");
   add(/\b(?:incentive|stipend|service hours?|recognition|compensation)\b/i.test(source), "What incentive, recognition, or compensation should be offered?");
   add(/\b(?:pairing is not working|stops? responding|leaves? during|reassignment|rematch|missed meetings?)\b/i.test(source), "What happens when a match is not working, someone stops responding, or a participant leaves?");
   add(/\b(?:recruitment plan|recruit|recruiting)\b/i.test(source), "What recruitment plan should be used?");
   add(/\b(?:pilot dates?|start date|end date|when should the pilot|timeline)\b/i.test(source), "When should the pilot start and end?");
   add(/\b(?:budget allocation|under \$[\d,]+|below \$[\d,]+|stay under \$[\d,]+)\b/i.test(source), "How should the pilot budget be allocated?");
   add(/\b(?:evaluation measures?|survey|midpoint check|participation records?|comments?|continue, change, or stop)\b/i.test(source), "Which simple measures will show whether the pilot should continue, change, or stop?");

   return uniqueProjectIntakeStatements(questions, 20);
}

function inferExplicitProjectCommitments(description: string) {
   const commitments: string[] = [];
   const source = sanitizeProjectBody(description);

   for (const sentence of splitProjectDescriptionSentences(source)) {
      const clean = cleanProjectIntakeStatement(sentence, 900)
         .replace(/[.!?]+$/, "")
         .trim();
      if (!clean) continue;

      const decided = clean.match(/^(?:i|we)\s+(?:have|had)\s+(?:already\s+)?decided\s+that\s+(.+)$/i);
      if (decided) {
         const statement = decided[1].trim();
         if (statement) commitments.push(`${statement.charAt(0).toUpperCase()}${statement.slice(1)}`);
      }

      const deadline = clean.match(/\b(?:finish|complete|deliver|launch|publish|produce|have)\s+(.+?)\s+(?:within|in no more than)\s+((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?|months?))\b/i);
      if (deadline) {
         const deliverable = deadline[1]
            .replace(/^(?:the\s+)?/i, "")
            .replace(/\s+and\s+keep[\s\S]*$/i, "")
            .trim();
         if (deliverable) commitments.push(`The ${deliverable} will be finished within ${deadline[2]}`);
      }

      const budget = clean.match(/\bkeep\s+(?:the\s+)?(.+?)\s+(?:under|below|within|at\s+or\s+below)\s+(\$[\d,]+(?:\.\d{1,2})?)/i);
      const stayUnderBudget = clean.match(/^(?:the\s+)?(.+?)\s+should\s+stay\s+(?:under|below|at\s+or\s+below)\s+(\$[\d,]+(?:\.\d{1,2})?)/i);
      const matchedBudget = budget || stayUnderBudget;
      if (matchedBudget && !/\b(?:already\s+)?decided\s+that\b/i.test(clean)) {
         const subject = matchedBudget[1]
            .replace(/^first\s+phase$/i, "first-phase budget")
            .replace(/\s+budget$/i, " budget")
            .trim();
         const label = /budget$/i.test(subject) ? subject : `${subject} budget`;
         commitments.push(`The ${label} will stay at or below ${matchedBudget[2]}`);
      }
   }

   return uniqueProjectIntakeStatements(commitments, 8);
}

function inferProjectDraftDecisions(description: string) {
   return uniqueProjectIntakeStatements(
      [
         ...splitProjectDescriptionSentences(description)
            .filter((statement) => !projectStatementIsCurrentFact(statement) && !projectStatementIsGoal(statement))
            .map(normalizeConfirmedProjectDecision)
            .filter(Boolean),
         ...inferExplicitProjectCommitments(description),
      ],
      12,
   );
}

function inferProjectDraftOpenQuestions(description: string) {
   const questions: string[] = [];

   for (const sentence of splitProjectDescriptionSentences(description)) {
      const clean = cleanProjectIntakeStatement(sentence, 1800)
         .replace(/[.!?]+$/, "")
         .trim();
      if (!clean) continue;

      if (/\?$/.test(clean)) {
         questions.push(makeProjectIntakeQuestion(clean));
         continue;
      }

      const approvalGap = clean.match(/^(.+?)\s+(?:has|have)\s+not\s+(?:yet\s+)?approved\s+(.+?)(?:\s+yet)?$/i);
      if (approvalGap) {
         const approver = approvalGap[1].trim().replace(/^The\s+/i, "the ");
         const rawSubject = approvalGap[2].replace(/\s+yet$/i, "").trim();
         const subject = /^(?:the\s+)?idea$/i.test(rawSubject) ? "the project" : rawSubject;
         questions.push(`Will ${approver} approve ${subject}?`);
         continue;
      }

      const explicitDecision = clean.match(/\b(?:still\s+)?need\s+to\s+(?:decide|choose|confirm|determine|select|finalize|figure out|clarify)\s+(.+)$/i);
      if (explicitDecision) {
         splitProjectQuestionList(explicitDecision[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
         continue;
      }

      const unresolved = clean.match(/\b(?:have|has)\s+not\s+(?:yet\s+)?(?:decided|chosen|confirmed|selected|finalized)\s+(.+?)(?:\s+yet)?$/i);
      if (unresolved) {
         splitProjectQuestionList(unresolved[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
         continue;
      }

      const unresolvedList = clean.match(/^(.+?)\s+(?:are|remain)\s+(?:still\s+)?unresolved$/i);
      if (unresolvedList) {
         splitProjectQuestionList(unresolvedList[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
         continue;
      }

      const unknown = clean.match(/\b(?:do|does)\s+not\s+know\s+((?:whether|how|what|which|where|who|when)\s+.+)$/i);
      if (unknown) {
         splitProjectQuestionList(unknown[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
         continue;
      }

      const unsure = clean.match(/\b(?:am|are|is)\s+not\s+sure\s+((?:what|which|whether|who|how|where|when)\s+.+)$/i);
      if (unsure) {
         splitProjectQuestionList(unsure[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
         continue;
      }

      const needToKnow = clean.match(/\b(?:need|needs)\s+to\s+(?:understand|confirm|know|determine|verify|find out)\s+((?:whether|how|what|which|where|who|when)\s+.+)$/i);
      if (needToKnow) {
         splitProjectQuestionList(needToKnow[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
         continue;
      }

      const notFinalized = clean.match(/(.+?)\s+(?:have|has)\s+not\s+been\s+(?:finalized|decided|confirmed|selected|chosen)$/i);
      if (notFinalized) splitProjectQuestionList(notFinalized[1]).forEach((item) => questions.push(makeProjectGapQuestion(item)));
   }

   const programQuestions = inferParticipantProgramOpenQuestions(description);
   const eventQuestions = inferEventProjectOpenQuestions(description);
   const unique = uniqueProjectIntakeStatements([...programQuestions, ...eventQuestions, ...questions.filter(Boolean)], 48);
   const result: string[] = [];
   const topic = (value: string) => {
      const lower = value.toLowerCase();
      const topics: Array<[RegExp, string]> = [
         [/\b(?:program can launch|pilot can launch|college approve|program approval|approval is required|still needs to be decided about approval)\b/i, "approval"],
         [/\b(?:department or role will own|department ownership|formally oversee|day-to-day owner|program owner)\b/i, "program-owner"],
         [/\b(?:participant information|what information can be collected|protect.*information|privacy(?: and access)? rules?)\b/i, "privacy"],
         [/\b(?:background checks?|screening|additional training)\b/i, "program-screening"],
         [/\b(?:reported or escalated|report or escalate|reporting boundaries|escalation boundaries|situations must be reported)\b/i, "program-escalation"],
         [/\b(?:participants? apply|application questions?|application process)\b/i, "program-applications"],
         [/\b(?:eligibility(?: rules?)?|who can join|who should participate)\b/i, "program-eligibility"],
         [/\b(?:participants? be matched|matching criteria|pairing criteria)\b/i, "program-matching"],
         [/\b(?:how often should|meeting expectations?|regular contact)\b/i, "program-meeting-frequency"],
         [/\b(?:in person, online|meeting format|in person or online)\b/i, "program-meeting-mode"],
         [/\b(?:communication method|communication tools?|private phone numbers?)\b/i, "program-communication"],
         [/\b(?:orientation or training|mentor training|volunteer training)\b/i, "program-training"],
         [/\b(?:incentives?|stipend|service hours?|recognition|compensation)\b/i, "program-incentive"],
         [/\b(?:match is not working|stops responding|participant leaves|reassignment|rematch)\b/i, "program-reassignment"],
         [/\brecruitment plan\b/i, "program-recruitment"],
         [/\bpilot start and end|pilot dates?\b/i, "program-dates"],
         [/\b(?:pilot budget|budget allocation)\b/i, "program-budget"],
         [/\b(?:simple measures|evaluation measures?|survey|continue, change, or stop)\b/i, "program-evaluation"],
         [/\b(?:approval|approve|management approval|apartment management.{0,40}allow|management.{0,40}allow|approve the event|approval.{0,24}required from management)\b/i, "approval"],
         [/\b(?:public performance license|licensing|required license)\b/i, "licensing"],
         [/\bdate\b/i, "date"],
         [/\battendance estimate\b/i, "attendance"],
         [/\bmovie\b/i, "movie"],
         [/\b(?:bright enough|projector brightness|outdoor brightness)\b/i, "projector-brightness"],
         [/\b(?:borrowed|rented|minimal setup|equipment sourcing)\b/i, "equipment-sourcing"],
         [/\b(?:equipment setup|equipment|screen|speakers?|projector)\b/i, "event-equipment"],
         [/\b(?:courtyard location|viewing area|exact location)\b/i, "event-location"],
         [/\bquiet[- ]hour rules?\b/i, "quiet-hours"],
         [/\b(?:electrical|power|outlets?)\b/i, "electrical"],
         [/\b(?:sound limits?|sound should|noise)\b/i, "sound"],
         [/\bseating\b/i, "seating"],
         [/\bweather backup\b/i, "weather"],
         [/\bcleanup\b/i, "cleanup"],
         [/\b(?:public promotion|promoted publicly|advertised publicly)\b/i, "promotion-scope"],
         [/\blighting\b/i, "lighting"],
         [/\bventilation\b/i, "ventilation"],
         [/\bdust\b/i, "dust"],
         [/\b(?:flammable|finishes?|material storage)\b/i, "materials"],
         [/\blayout\b/i, "layout"],
         [/\bstorage\b/i, "storage"],
         [/\bworkbench\b/i, "workbench"],
         [/\b(?:major tool|first tool|power tool)\b/i, "tool"],
         [/\bfirst projects?\b/i, "first-projects"],
         [/\b(?:priority collection|first collection|starting collection|collection should be handled first)\b/i, "priority-collection"],
         [/\binventory\b/i, "inventory"],
         [/\b(?:file[- ]?naming|naming system|naming convention)\b/i, "naming"],
         [/\b(?:folder structure|folders? be organized)\b/i, "folder-structure"],
         [/\bmetadata\b/i, "metadata"],
         [/\b(?:scanning|digitization|capture)\s+(?:standards?|quality)|\bquality and handling standards?\b/i, "quality-standards"],
         [/\b(?:privacy|access rules?)\b/i, "privacy"],
         [/\b(?:review process|review input|identification process|unknown details?|identifying unknown)\b/i, "review-identification"],
         [/\bbackup\b/i, "backup"],
         [/\bpreservation supplies?\b/i, "preservation-supplies"],
         [/\b(?:book format|printing service|book service|provider)\b/i, "finished-output"],
         [/\b(?:exact budget|budget allocation)\b/i, "budget-allocation"],
         [/\b(?:first tool list|first resource set|tools? belong in the first|resources? should be included)\b/i, "resource-set"],
         [/\b(?:borrowing records?|return records?|checkout records?|check-out records?)\b/i, "recordkeeping"],
         [/\b(?:items? will be labeled|resources? or items? be labeled|labels?|labeling)\b/i, "labeling"],
         [/\b(?:volunteer ownership|day-to-day maintenance|who will own)\b/i, "ownership"],
         [/\b(?:target neighborhood|neighborhoods? fit)\b/i, "target-neighborhood"],
         [/\b(?:which apartment|apartment best fits)\b/i, "apartment-choice"],
         [/\b(?:move date|lease and notice timeline)\b/i, "move-date"],
         [/\b(?:lease overlap|week of overlap)\b/i, "lease-overlap"],
         [/\b(?:which mover|mover should)\b/i, "mover"],
         [/\bpacking schedule\b/i, "packing-schedule"],
         [/\butility.*(?:transferred|started|dates?)\b/i, "utility-dates"],
         [/\baddress changes?\b/i, "address-changes"],
         [/\b(?:kept|sold|donated|replaced|disposal plan)\b/i, "disposal-plan"],
         [/\b(?:clean and document|cleaning responsibilities?)\b/i, "cleaning"],
         [/\b(?:fallback|contingency plan)\b/i, "contingency"],
         [/\bfinal relocation budget\b/i, "relocation-budget"],
         [/\b(?:loan length|how long should loans? last)\b/i, "loan-length"],
         [/\b(?:pilot length|how long should the pilot)\b/i, "pilot-length"],
      ];
      return topics.find(([pattern]) => pattern.test(lower))?.[1] || "";
   };

   for (const item of unique) {
      const itemTopic = topic(item);
      if (itemTopic && result.some((existing) => topic(existing) === itemTopic)) continue;
      if (result.some((existing) => getProjectIntakeSemanticOverlap(existing, item) >= 0.6)) continue;
      result.push(item);
      if (result.length >= 20) break;
   }

   return result;
}

function normalizeProjectConstraint(value: string) {
   let clean = cleanProjectIntakeStatement(value, 520)
      .replace(/[.!?]+$/, "")
      .trim();
   if (!clean) return "";

   if (/\bwithout\s+(?:knowing|understanding|deciding|confirming)\b/i.test(clean)) return "";

   let transformed = false;
   const comparativeLead = clean.match(/\bbut\s+(?:i|we)\s+know\s+(.+?)\s+matter(?:s)?\s+more\s+than\s+(.+)$/i);
   const directComparative = clean.match(/^(.+?)\s+matter(?:s)?\s+more\s+than\s+(.+)$/i);
   const comparative = comparativeLead || directComparative;

   if (comparative) {
      clean = `Prioritize ${comparative[1]} over ${comparative[2]}`;
      transformed = true;
   } else {
      const negativeAfterBut = clean.match(/\bbut\s+(?:i|we)\s+(?:do not|don't)\s+want\s+(?:them|it|the project|the result|the work|the output)?\s*(?:to\s+)?(.+)$/i);
      const directNegative = clean.match(/^(?:i|we)\s+(?:also\s+)?(?:do not|don't)\s+want\s+(?:them|it|the project|the result|the work|the output)?\s*(?:to\s+)?(.+)$/i);
      const accountMatch = clean.match(/^(?:i|we)\s+(?:also\s+)?need\s+to\s+(?:think about|account for|consider)\s+(.+)$/i);
      const projectAccountMatch = clean.match(/^.+?\s+needs?\s+to\s+account\s+for\s+(.+)$/i);
      const withoutMatch = clean.match(/\bwithout\s+(.+)$/i);

      if (negativeAfterBut || directNegative) {
         clean = `Avoid ${(negativeAfterBut || directNegative)![1]}`;
         transformed = true;
      } else if (accountMatch || projectAccountMatch) {
         clean = `Account for ${(accountMatch || projectAccountMatch)![1]}`;
         transformed = true;
      } else if (withoutMatch) {
         clean = `Avoid ${withoutMatch[1]}`;
         transformed = true;
      }
   }

   const onePersonCapacity = clean.match(/^(?:i|we)\s+(?:also\s+)?want\s+(.+?)\s+(?:to\s+be\s+)?simple\s+enough\s+that\s+(?:one|a single)\s+(?:volunteer|person|owner|operator)\s+can\s+(.+)$/i);
   if (onePersonCapacity) {
      clean = `Keep ${onePersonCapacity[1]} simple enough for one person to ${onePersonCapacity[2]}`;
      transformed = true;
   }

   clean = clean
      .replace(/^avoid\s+lose\b/i, "Avoid losing")
      .replace(/^avoid\s+spend\b/i, "Avoid spending")
      .replace(/^avoid\s+build\b/i, "Avoid building")
      .replace(/^avoid\s+give\b/i, "Avoid giving")
      .replace(/^avoid\s+buy\b/i, "Avoid buying")
      .replace(/\bor\s+buy\b/gi, "or buying")
      .replace(/^avoid\s+turn\b/i, "Avoid turning")
      .replace(/^avoid\s+choose\b/i, "Avoid choosing")
      .replace(/^avoid\s+become\b/i, "Avoid becoming")
      .replace(/^avoid\s+make\b/i, "Avoid making")
      .replace(/^avoid\s+look\b/i, "Avoid looking")
      .replace(/^avoid\s+feel\b/i, "Avoid feeling")
      .replace(/^avoid\s+force\b/i, "Avoid forcing")
      .replace(/^avoid\s+interfere\b/i, "Avoid interfering")
      .replace(/^avoid\s+ruin\b/i, "Avoid ruining")
      .replace(/^avoid\s+resemble\b/i, "Avoid resembling")
      .replace(/^avoid\s+collect\b/i, "Avoid collecting")
      .replace(/^avoid\s+endless feedback to delay\b/i, "Avoid letting endless feedback delay")
      .replace(/\bor\s+feel\s+like\s+(?:i|we)\s+(?:am|are)\s+forcing\s+(?:it|them)\s+to\s+be\s+something\s+(?:it|they)\s+(?:is|are)\s+not\b/gi, "or forcing a direction that does not fit")
      .replace(/\bor\s+feel\b/gi, "or feeling")
      .replace(/,\s*become\b/gi, ", becoming")
      .replace(/\s+or\s+end\s+up\b/gi, ", or ending up")
      .replace(/,\s*,+/g, ",")
      .replace(/\s+/g, " ")
      .trim();

   const privacyExposure = clean.match(/^privacy matters because\s+(.+?)\s+should\s+not\s+expose\s+(.+?)(?:\s+to\s+everyone)?$/i);
   if (privacyExposure) {
      clean = `Protect ${privacyExposure[2]} from broad access`;
      transformed = true;
   } else if (/^privacy matters$/i.test(clean)) {
      clean = "Protect sensitive information and limit access to the intended audience";
      transformed = true;
   }

   if (!transformed && /^(?:i|we)\s+(?:also\s+)?(?:want|would like|am thinking|are thinking)\b/i.test(clean)) return "";
   if (!clean || clean.length < 8 || /^preserve\s+(?:knowing|understanding)\b/i.test(clean)) return "";
   if (clean.length > 180)
      clean =
         clean
            .slice(0, 177)
            .replace(/\s+\S*$/, "")
            .trim() + "…";
   return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
}

function inferProjectDraftConstraints(description: string, decisions: string[]) {
   const decisionKeys = new Set(decisions.map(getProjectIntakeStatementKey));

   return uniqueProjectIntakeStatements(
      splitProjectDescriptionSentences(description)
         .filter(
            (statement) =>
               projectStatementIsConstraint(statement) &&
               !projectStatementIsCurrentFact(statement) &&
               !projectStatementIsGoal(statement) &&
               !isProjectResourceGap(statement) &&
               !projectStatementIsUncertain(statement) &&
               !projectStatementIsSuccess(statement) &&
               !/\b(?:need|needs)\s+to\s+(?:understand|confirm|know|determine|verify|find out)\b/i.test(statement) &&
               !/\b(?:do|does)\s+not\s+know\s+(?:whether|how|what|which|where|who|when)\b/i.test(statement) &&
               !/\b(?:are|remain)\s+(?:still\s+)?unresolved\b/i.test(statement) &&
               !/\bmay\s+need\s+to\s+cover\b/i.test(statement),
         )
         .map(normalizeProjectConstraint)
         .filter((statement) => {
            if (!statement) return false;
            const key = getProjectIntakeStatementKey(statement);
            if (decisionKeys.has(key)) return false;
            const tokens = new Set(key.split(/\s+/).filter((token) => token.length > 2));
            return !decisions.some((decision) => {
               const decisionTokens = new Set(
                  getProjectIntakeStatementKey(decision)
                     .split(/\s+/)
                     .filter((token) => token.length > 2),
               );
               let shared = 0;
               tokens.forEach((token) => {
                  if (decisionTokens.has(token)) shared += 1;
               });
               return tokens.size > 0 && decisionTokens.size > 0 && shared / Math.min(tokens.size, decisionTokens.size) >= 0.65;
            });
         }),
      6,
   );
}

function getProjectIntakeSemanticOverlap(leftValue: string, rightValue: string) {
   const toTokens = (value: string) =>
      new Set(
         getProjectIntakeStatementKey(value)
            .split(/\s+/)
            .filter((token) => token.length > 2),
      );
   const left = toTokens(leftValue);
   const right = toTokens(rightValue);
   if (!left.size || !right.size) return 0;
   let shared = 0;
   left.forEach((token) => {
      if (right.has(token)) shared += 1;
   });
   return shared / Math.min(left.size, right.size);
}

function normalizeProjectCheckpoint(value?: string) {
   const clean = stripProjectIntakeLead(value || "")
      .replace(/^(?:before\s+.+?,\s*)/i, "")
      .replace(/^(?:and|then|but)\s+/i, "")
      .replace(/^(?:i|we)\s+(?:need|should|must|want|plan)\s+to\s+/i, "")
      .replace(/[.;]+$/g, "")
      .trim();
   if (!clean || /^(?:or|and|but|become|interfere|avoid|without)\b/i.test(clean)) return "";
   const title = `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
   return sanitizeProjectTitle(title.length > 90 ? `${title.slice(0, 87).replace(/\s+\S*$/, "")}…` : title);
}

function getProjectMilestoneSubject(question: string) {
   const clean = cleanProjectIntakeStatement(question, 220)
      .replace(/[.?]+$/, "")
      .trim();
   const role = clean.match(/^What\s+(?:purpose|role|scope|direction)\s+should\s+(.+?)\s+have$/i);
   if (role) return role[1].trim();
   const first = clean.match(/^Which\s+(.+?)\s+should\s+(?:receive attention|go|come|be handled)\s+first$/i);
   if (first) return first[1].trim();
   return "";
}

function getProjectOptionLabel(sentences: string[]) {
   const labels: Array<[RegExp, string]> = [
      [/\bparts?\b/i, "parts"],
      [/\btools?\b/i, "tools"],
      [/\bvendors?\b/i, "vendors"],
      [/\bsources?\b/i, "sources"],
      [/\bmaterials?\b/i, "materials"],
      [/\bplatforms?\b/i, "platforms"],
      [/\bapproaches?\b/i, "approaches"],
      [/\boptions?\b/i, "options"],
   ];
   const found = labels.filter(([pattern]) => sentences.some((item) => pattern.test(item))).map(([, label]) => label);
   const specific = found.filter((label) => label !== "options");
   const selected = (specific.length ? specific : found).slice(0, 3);
   if (!selected.length) return "options";
   if (selected.length === 1) return selected[0];
   if (selected.length === 2) return `${selected[0]} and ${selected[1]}`;
   return `${selected.slice(0, -1).join(", ")}, and ${selected[selected.length - 1]}`;
}

function normalizeProjectMilestoneSubject(value?: string) {
   return sanitizeProjectTitle(value)
      .replace(/^both\s+/i, "each ")
      .replace(/^the\s+/i, "")
      .replace(/[.?]+$/, "")
      .trim();
}

function getProjectComparisonCriteria(description: string) {
   const criteria: Array<[RegExp, string]> = [
      [/\b(?:price|cost|budget)\b/i, "cost"],
      [/\bquality\b/i, "quality"],
      [/\b(?:compatibility|compatible|fitment)\b/i, "compatibility"],
      [/\b(?:installation|install|setup)\b/i, "installation needs"],
      [/\b(?:maintenance|serviceability|servicing)\b/i, "maintenance impact"],
      [/\b(?:reliability|dependability)\b/i, "reliability"],
      [/\b(?:accessibility|wcag|keyboard navigation|screen reader)\b/i, "accessibility"],
      [/\b(?:risk|safety)\b/i, "risk"],
      [/\b(?:performance|speed|handling)\b/i, "performance"],
      [/\b(?:credibility|credible|evidence quality)\b/i, "evidence quality"],
   ];

   return criteria
      .filter(([pattern]) => pattern.test(description))
      .map(([, label]) => label)
      .slice(0, 4);
}

interface HumanCoordinationMilestones {
   constraints: string;
   outcome: string;
   sequence: string;
   budget: string;
   options: string;
   preparation: string;
   execution: string;
   closeout: string;
}

function getHumanCoordinationMilestones(source: string): HumanCoordinationMilestones {
   const relocationProject =
      /\b(?:move|moving|relocat(?:e|ion|ing)|new apartment|old apartment|lease ends?|give notice|movers?|moving costs?)\b/i.test(source) && /\b(?:apartment|lease|rent|housing|utilities?|address changes?|neighborhood|commute)\b/i.test(source);

   if (relocationProject) {
      return {
         constraints: "Lock down the move timeline and lease deadlines",
         outcome: "Decide what the new apartment needs to have",
         sequence: "Plan the move, responsibilities, and backup options",
         budget: "Set the relocation budget",
         options: "Compare neighborhoods, apartments, and movers",
         preparation: "Book the move and get the logistics ready",
         execution: "Move in and get the essentials working",
         closeout: "Close out the old apartment and finish the move",
      };
   }

   const travelProject = /\b(?:trip|travel|flight|hotel|lodging|itinerary|passport|destination)\b/i.test(source) && /\b(?:book|booking|depart|return|travel dates?|transportation)\b/i.test(source);

   if (travelProject) {
      return {
         constraints: "Lock down the travel dates and hard limits",
         outcome: "Decide what the trip needs to include",
         sequence: "Plan the itinerary, responsibilities, and backup options",
         budget: "Set the trip budget",
         options: "Compare routes, stays, and travel options",
         preparation: "Book the trip and prepare the essentials",
         execution: "Take the trip and handle the first-day setup",
         closeout: "Finish the remaining follow-up and review the trip",
      };
   }

   return {
      constraints: "Confirm the deadlines and hard limits",
      outcome: "Decide what a good finished result needs to include",
      sequence: "Plan the order of work, responsibilities, and backup options",
      budget: "Set the working budget and resource priorities",
      options: "Compare the main options and providers",
      preparation: "Book what is needed and prepare the logistics",
      execution: "Carry out the plan and get the essentials working",
      closeout: "Finish the loose ends and review the result",
   };
}

function extractProjectDescriptionMilestones(description?: string, openQuestions: string[] = []) {
   const cleanDescription = sanitizeProjectBody(description);
   const source = [cleanDescription, ...openQuestions].join("\n");
   const result: string[] = [];

   const add = (value: string, supported: boolean) => {
      if (!supported) return;
      const clean = normalizeProjectCheckpoint(value);
      if (clean && !result.some((item) => getProjectIntakeSemanticOverlap(item, clean) >= 0.72)) result.push(clean);
   };

   const has = (pattern: RegExp) => pattern.test(source);
   const eventProject = isEventProjectIntake(source);
   const workspaceTransformation =
      (has(/\b(?:garage|workspace|work area|shop space|studio space|workbench|work surface)\b/i) && has(/\b(?:convert|turn|set up|organize|build|layout|install|mobile|folding|permanent)\b/i)) ||
      (has(/\b(?:garage|workspace|work area)\b/i) && has(/\b(?:tool storage|shop vacuum|table saw|miter saw|track saw|dust collection|workbench)\b/i));
   const physicalWorkspace = !eventProject && workspaceTransformation;
   const firstUseNeed = has(/\b(?:first|initial|exact)\s+projects?\b|\bprojects?\s+(?:the\s+)?(?:space|workspace|setup|first version)\s+(?:must|should|will)\s+support\b|\bprojects?\s+(?:i|we)\s+actually\s+want\s+to\s+complete\b/i);
   const complianceNeed = has(/\b(?:permit|license|licensing|legal|regulation|policy|insurance|inspection|compliance|approved facility)\b/i);
   const safetyNeed = has(/\b(?:safety|safe|electrical|power|outlets?|lighting|ventilation|dust|noise|flammable|fire|refrigeration|water|wastewater|structural)\b/i);
   const layoutNeed = has(/\b(?:layout|storage plan|workbench|work surface|mobile tool stands?|mount tools?|portable|permanent|clear enough space|larger items|access path|floor space)\b/i);
   const explicitAudienceNeed = has(/\b(?:target audience|primary audience|target users?|customers?|participants?|guests?|readers?|viewers?|listeners?|stakeholders?)\b/i);
   const scopeNeed = has(/\b(?:first version|first release|initial phase|first phase|pilot scope|minimum viable|exact first projects?|initial scope)\b/i);
   const discoveryNeed = has(/\b(?:find out|identify|learn|understand|assess|inspect|audit|baseline|requirements review|risk assessment|have not researched|need to verify|need to confirm)\b/i);
   const governanceNeed = has(/\b(?:privacy|personal information|sensitive information|data sharing|security|permission|consent|rights|source attribution|fact-checking|access rules?)\b/i);
   const formatNeed = has(/\b(?:format|approach|method|platform|channel|transport|narrated|interview-based|portable setup|permanent setup)\b/i);
   const workflowNeed = has(/\b(?:workflow|process|service flow|one person|solo|staffing|capacity|throughput|setup and cleanup|setup|cleanup|handoff|responsible for|ownership)\b/i);
   const budgetNeed = has(/\b(?:budget|under\s+\$[\d,]+|below\s+\$[\d,]+|first phase under|initial investment|startup cost)\b/i);
   const commercialNeed = has(/\b(?:pricing|price per|break-even|break even|margin|revenue|sales volume|customer demand|profitable|commercial viability)\b/i);
   const equipmentNeed = has(/\b(?:major tool|power tool|equipment|tools?|materials?|parts?|hardware|software|recording equipment|safety equipment)\b/i);
   const buildNeed = has(/\b(?:build|install|set up|create|produce|assemble|organize|implement|develop|draft|record|publish)\b/i);
   const validationNeed = has(/\b(?:test|validate|verify|review|drill|rehearse|pilot|usability|quality check|real evidence|measure|feedback|success would mean|complete several real projects?|use the space)\b/i);

   if (eventProject) {
      const approvalNeed = complianceNeed || has(/\b(?:management approval|building rules?|quiet hours?|public performance license|permission)\b/i);
      const dateScopeWeatherNeed = has(/\b(?:date|attendance estimate|residents?|invited guests?|weather backup|rain plan|first version)\b/i);
      const siteEquipmentNeed = has(/\b(?:courtyard|location|walkways?|entrances?|emergency access|power|projector|screen|speakers?|sound|equipment)\b/i);
      const eventPlanNeed = has(/\b(?:movie choice|family-friendly movie|seating|chairs?|blankets?|snacks?|cleanup|communications?|invite|invited)\b/i);

      add("Confirm approval, licensing, and operating rules", approvalNeed || true);
      add("Set the date, attendance scope, and weather backup", dateScopeWeatherNeed);
      add("Confirm the viewing area, access, power, sound, and equipment", siteEquipmentNeed);
      add("Set the event budget and sourcing plan", budgetNeed);
      add("Finalize the movie, seating, communication, and cleanup plan", eventPlanNeed || workflowNeed);
      add("Run the event and review what to change", validationNeed || true);
   } else if (physicalWorkspace) {
      add("Choose the first projects the workspace must support", firstUseNeed || scopeNeed);
      const safetyLabels: string[] = [];
      if (has(/\b(?:electrical|power|outlets?)\b/i)) safetyLabels.push("power");
      if (has(/\blighting\b/i)) safetyLabels.push("lighting");
      if (has(/\bventilation\b/i)) safetyLabels.push("ventilation");
      if (has(/\bdust\b/i)) safetyLabels.push("dust control");
      if (has(/\bnoise\b/i)) safetyLabels.push("noise control");
      if (has(/\b(?:flammable|fire|finishes?)\b/i)) safetyLabels.push("safe material storage");
      const safetySubject = joinProjectLabels(safetyLabels.slice(0, 4));
      add(safetySubject ? `Check ${safetySubject} needs` : "Check the workspace safety and infrastructure requirements", safetyNeed);
      add("Plan a flexible layout for work, storage, and access", layoutNeed);
      add("Set the first-phase budget and upgrade priorities", budgetNeed);
      add("Choose the first major tool and required safety equipment", equipmentNeed && has(/\b(?:which major tool|first major tool|table saw|miter saw|track saw|power tool|safety equipment)\b/i));
      add("Build and organize the first usable setup", buildNeed || layoutNeed || equipmentNeed);
      add("Complete real projects and review what needs to change", validationNeed);
   } else {
      const circulationOrServiceProject = has(/\b(?:lend|lending|borrow|borrowing|loan|loans|check[- ]?out|returns?|membership program|service program|volunteer[- ]run|shared resource)\b/i);
      const collectionCoreNeed = has(/\b(?:family archive|photo archive|document archive|digital archive|historical archive|collection|catalog|repository|media library|record collection|photo collection|document collection|artifacts?|specimens?)\b/i);
      const collectionMaterialNeed = has(/\b(?:photographs?|photos?|letters?|certificates?|historical documents?|family records?|physical records?|albums?)\b/i);
      const collectionOperationNeed = has(/\b(?:inventory|catalog|digitize|scan|metadata|file[- ]?naming|folder structure|identify unknown|preserv|archival|backup)\b/i);
      const collectionOrCatalogProject = !circulationOrServiceProject && (collectionCoreNeed || (collectionMaterialNeed && collectionOperationNeed && has(/\b(?:organize|preserve|catalog|archive|digitize|inventory)\b/i)));
      const preservationNeed = has(/\b(?:preserv|archival|fragile|original image|historical accuracy|damage cleanup|protect the original|safely returned|long-term storage)\b/i);
      const organizationNeed = has(/\b(?:file[- ]?naming|naming system|folder structure|metadata|tagging|catalog|organization system|indexing|classification)\b/i);
      const backupOrStorageNeed = has(/\b(?:backup|backed up|cloud storage|local drives?|external drives?|storage structure|more than one place|redundant storage)\b/i);
      const reviewOrIdentificationNeed = has(/\b(?:identify unknown|unknown people|unknown items|review with|family review|stakeholder review|collect their input|annotations?|fact checking|resolve unknown)\b/i);
      const qualityStandardNeed = has(/\b(?:quality standard|useful quality|resolution|scanning standard|capture standard|editing should be limited|acceptance criteria|professional(?:ly)? scanned|specialist handling)\b/i);
      const secondaryDeliverableNeed = has(/\b(?:printed book|memory book|report|presentation|exhibit|portfolio|publication|shareable version|final deliverable)\b/i);
      const softwareProject = has(/\b(?:software|app|website|web application|browser[- ]based|api|codebase|database|user flow|frontend|backend)\b/i);
      const participantProgramProject = isParticipantProgramProjectIntake(source);
      const explicitResearchArtifact = has(/\b(?:research question|research brief|literature review|evidence review|credible sources?|citations?|bibliography|research findings?|field observations?|research interviews?)\b/i);
      const structuredResearchStudy = has(/\b(?:study design|data collection plan|research methods?|hypothesis|sample size|control group|analysis plan)\b/i) && has(/\b(?:research|study|findings?|data|evidence)\b/i);
      const researchDeliverablePair = has(/\b(?:research paper|research report|evidence report|literature review|source-based brief|research findings report)\b/i);
      const researchProject = !participantProgramProject && !has(/\b(?:not|without)\b.{0,28}\b(?:research study|complicated research|formal study)\b/i) && (explicitResearchArtifact || structuredResearchStudy || researchDeliverablePair);
      const narrativeProject = has(/\b(?:story|novel|short story|picture book|children['’]s book|screenplay|script|comic|graphic novel|characters?|plot|story arc|ending|manuscript)\b/i) && !researchProject;
      const writingProject = (narrativeProject || has(/\b(?:article|essay|newsletter|copywriting|manuscript|draft|write|writing|book)\b/i)) && !collectionOrCatalogProject && !researchProject;
      const illustratedNarrativeProject = narrativeProject && has(/\b(?:illustrated|illustrations?|artwork|visual style|character sketches?|page layouts?|picture[- ]book|page-by-page|spreads?)\b/i);
      const storyStructureNeed = narrativeProject && has(/\b(?:story structure|story arc|plot|tension|ending|character change|emotional progression|what finally helps|how .* changes?)\b/i);
      const pageFlowNeed = narrativeProject && has(/\b(?:page-by-page|page plan|page range|picture[- ]book format|spreads?|24-to-32-page|24 to 32 page)\b/i);
      const manuscriptNeed = writingProject && has(/\b(?:manuscript|complete draft|word count|under \d+ words?|script|text draft)\b/i);
      const visualApproachNeed = illustratedNarrativeProject && has(/\b(?:illustration process|visual style|create all the illustrations|hand-drawn|digital artwork|hire an illustrator|artwork process)\b/i);
      const visualProductionNeed = illustratedNarrativeProject && has(/\b(?:finished artwork|illustrations?|page layouts?|typography|text difficult to see|pictures?)\b/i);
      const audienceReviewNeed = has(/\b(?:read aloud|review the manuscript|reviewers?|beta readers?|family members to review|child before final|observe where|feedback)\b/i);
      const publicationNeed = has(/\b(?:printer|printing service|book-making service|print-ready|file requirements|proof copies?|printed proof|paper options|delivery times?|minimum quantities?)\b/i);
      const serviceOrProgramProject =
         circulationOrServiceProject ||
         participantProgramProject ||
         has(/\b(?:create|launch|run|operate|start|design|set up)\b.{0,90}\b(?:service|program|pilot)\b|\b(?:service|program|pilot)\b.{0,90}\b(?:participants?|clients?|intake|delivery|pilot|operations?|applications?|matching|orientation|recruitment)\b/i);
      const coordinationSignalCount = [
         /\b(?:deadline|timeline|within \d+ (?:days?|weeks?|months?)|by [A-Z][a-z]+ \d{1,2})\b/i,
         /\b(?:budget|cost|deposit|fees?|quotes?|afford)\b/i,
         /\b(?:schedule|sequence|before|after|dependency|depends on)\b/i,
         /\b(?:vendor|provider|contractor|mover|service|appointment|booking)\b/i,
         /\b(?:responsible|ownership|family members?|stakeholders?|coordinate|handoff)\b/i,
         /\b(?:contingency|backup plan|risk|delay|cancellation|fallback)\b/i,
         /\b(?:location|destination|housing|lease|utilities|transportation|travel|move|relocat|transition)\b/i,
      ].filter((pattern) => pattern.test(source)).length;
      const coordinationPlanningProject =
         !softwareProject &&
         !researchProject &&
         !writingProject &&
         !collectionOrCatalogProject &&
         !serviceOrProgramProject &&
         coordinationSignalCount >= 3 &&
         has(/\b(?:plan|prepare|coordinate|organize|arrange|move|relocat|transition|change|complete)\b/i);
      const comparisonNeed = has(/\b(?:compare|choose between|options?|quotes?|providers?|vendors?|services?|approaches?)\b/i);
      const transitionExecutionNeed = has(/\b(?:move|relocat|transition|switch|change over|cut over|handoff|first day|first week|go live)\b/i);
      const coordinationLanguage = getHumanCoordinationMilestones(source);
      const explicitFirstSet = has(/\b(?:first|priority|initial|pilot|sample|meaningful)\s+(?:collection|set|batch|group|case|segment|folder|archive|records?|materials?|items?)\b|\bfocus\s+on\s+one\b/i);

      if (participantProgramProject) {
         const programLabel = has(/\bpilot\b/i) ? "pilot" : "program";
         add(`Get the ${programLabel} approved and assign an owner`, true);
         add("Set privacy, role boundaries, and escalation rules", true);
         add(has(/\b(?:apply|application|eligibility|match|matching|pairing)\b/i) ? "Finalize applications, eligibility, and matching" : "Finalize participant eligibility and intake", true);
         add(has(/\b(?:orientation|training|active listening|resource guide|coordinator support)\b/i) ? "Prepare orientation and coordinator support" : "Prepare staff and volunteer support", true);
         const scheduledService = has(/\b(?:rides?|drivers?|transportation|pickups?|drop[- ]?offs?|deliveries?|appointments?|shifts?|scheduled sessions?)\b/i);
         add(
            scheduledService
               ? "Set communication, scheduling, and exception rules"
               : has(/\b(?:communication|meetings?|check-ins?|missed meetings?|reassignment|stops? responding|leaves? during)\b/i)
                 ? "Set communication, meeting, and exception rules"
                 : "Set day-to-day operating and exception rules",
            true,
         );
         add(`Set the ${programLabel} budget, dates, and recruitment plan`, budgetNeed || true);
         add(`Recruit participants and run the ${programLabel}`, true);
         add(`Review the ${programLabel} and decide what changes next`, validationNeed || true);
         return result.slice(0, 8);
      }

      if (coordinationPlanningProject) {
         add(coordinationLanguage.constraints, true);
      } else if (complianceNeed) {
         add(has(/\b(?:insurance|lease rules?)\b/i) ? "Confirm approval, insurance, and operating rules" : "Confirm permissions, legal requirements, and operating rules", true);
      }

      if (serviceOrProgramProject) {
         add(circulationOrServiceProject ? "Choose and inventory the first resource set" : "Define the first service scope and who it must support", true);
      } else if (collectionOrCatalogProject && explicitFirstSet) {
         add("Choose and inventory the first collection", true);
      } else if (softwareProject) {
         add("Define the smallest complete user flow", scopeNeed || true);
      } else if (researchProject) {
         add("Confirm the research question and evidence standard", scopeNeed || discoveryNeed || true);
      } else if (narrativeProject) {
         add(storyStructureNeed ? "Define the story arc and emotional progression" : "Define the narrative promise and complete story arc", true);
      } else if (writingProject) {
         add("Confirm the purpose, audience, and central argument", scopeNeed || explicitAudienceNeed || true);
      } else if (serviceOrProgramProject && explicitAudienceNeed) {
         add("Define the first service scope and who it must support", scopeNeed || true);
      } else if (coordinationPlanningProject) {
         add(coordinationLanguage.outcome, true);
      } else {
         add("Choose the first useful scope and define what it must prove", scopeNeed || explicitAudienceNeed || collectionOrCatalogProject || true);
      }

      if (serviceOrProgramProject) {
         add(circulationOrServiceProject ? "Define eligibility, privacy, safety, and exception rules" : "Define eligibility, privacy, quality, and service rules", governanceNeed || safetyNeed || circulationOrServiceProject);
      } else if (collectionOrCatalogProject && (governanceNeed || organizationNeed || reviewOrIdentificationNeed)) {
         add("Define privacy, naming, metadata, and identification rules", true);
      } else if (governanceNeed && !coordinationPlanningProject) {
         const governanceLabels: string[] = [];
         if (has(/\b(?:privacy|personal information|sensitive information|access rules?)\b/i)) governanceLabels.push("privacy and access");
         if (has(/\b(?:permission|consent|rights|source attribution)\b/i)) governanceLabels.push("permission and rights");
         if (has(/\b(?:evidence|fact-checking|source quality)\b/i)) governanceLabels.push("evidence");
         add(`Set the ${joinProjectLabels(governanceLabels) || "information and governance"} rules`, true);
      }

      if (qualityStandardNeed || preservationNeed) {
         add(collectionOrCatalogProject ? "Set quality standards and specialist-handling criteria" : "Set the quality and acceptance standards", true);
      } else if (coordinationPlanningProject && discoveryNeed) {
         add("Confirm the facts, blockers, and dependencies that shape the plan", true);
      } else if (discoveryNeed && !researchProject && !collectionOrCatalogProject && !serviceOrProgramProject && !writingProject) {
         add("Gather the facts and requirements that later decisions depend on", true);
      }

      if (serviceOrProgramProject && circulationOrServiceProject) {
         add("Choose the storage, labeling, and recordkeeping approach", true);
      } else if (collectionOrCatalogProject && (organizationNeed || backupOrStorageNeed)) {
         add("Choose the organization, storage, and backup structure", true);
      } else if (softwareProject && (formatNeed || organizationNeed || backupOrStorageNeed)) {
         add("Choose the technical structure and data model", true);
      } else if (narrativeProject && pageFlowNeed) {
         add("Build the page-by-page story map", true);
      } else if (writingProject && formatNeed) {
         add("Choose the structure and delivery format", true);
      } else if ((formatNeed || organizationNeed || backupOrStorageNeed) && !coordinationPlanningProject) {
         add("Choose the structure and operating approach", true);
      }

      if (serviceOrProgramProject && circulationOrServiceProject) {
         add("Define the intake, checkout, return, and ownership workflow", true);
      } else if (coordinationPlanningProject) {
         add(coordinationLanguage.sequence, true);
      } else if (!collectionOrCatalogProject && !writingProject && workflowNeed) {
         add("Define the workflow, capacity, and ownership", true);
      }

      add(commercialNeed ? "Build the budget, pricing, and viability model" : coordinationPlanningProject ? coordinationLanguage.budget : "Set the first-phase budget and resource priorities", (budgetNeed || commercialNeed) && !narrativeProject);

      if (equipmentNeed && !collectionOrCatalogProject && !serviceOrProgramProject && !writingProject && !coordinationPlanningProject) {
         add("Choose the tools, equipment, and materials that fit the confirmed requirements", true);
      }

      if (serviceOrProgramProject) {
         add(circulationOrServiceProject ? "Set up and run the first lending pilot" : "Set up and run the first service pilot", buildNeed || validationNeed || true);
         add("Review the pilot and decide what should continue, change, or stop", validationNeed || true);
      } else if (collectionOrCatalogProject) {
         add("Process and organize the priority collection", buildNeed || true);
         add("Review the collection, resolve unknown details, and preserve the finished set", reviewOrIdentificationNeed || preservationNeed || secondaryDeliverableNeed);
         add("Test access, backups, and whether the workflow can be repeated", validationNeed || backupOrStorageNeed || true);
      } else if (softwareProject) {
         add("Build the first end-to-end version", buildNeed || true);
         add("Test the flow with realistic user scenarios", validationNeed || true);
      } else if (researchProject) {
         add("Collect and organize the required evidence", discoveryNeed || true);
         add("Build the argument or deliverable from the evidence", buildNeed || true);
         add("Review the result against the research question and evidence standard", validationNeed || true);
      } else if (narrativeProject) {
         add(manuscriptNeed ? "Draft and revise the complete manuscript" : "Draft and revise the complete story", buildNeed || true);
         if (visualApproachNeed) {
            add("Choose the visual approach and production plan", true);
         }
         if (illustratedNarrativeProject || visualProductionNeed) {
            add("Create the illustrations and page layouts", true);
         }
         if (audienceReviewNeed || validationNeed) {
            add("Run focused read-aloud and visual-comprehension reviews", true);
         }
         if (publicationNeed) {
            add("Prepare print-ready files and choose the production service", true);
            add("Order and review the first proof", true);
         } else {
            add("Finalize the complete publishable version", true);
         }
      } else if (writingProject) {
         add("Draft the complete piece", buildNeed || true);
         add("Revise it against the intended outcome", validationNeed || true);
      } else if (coordinationPlanningProject) {
         add(coordinationLanguage.options, comparisonNeed);
         add(coordinationLanguage.preparation, true);
         add(transitionExecutionNeed ? coordinationLanguage.execution : "Carry out the plan", true);
         add(coordinationLanguage.closeout, validationNeed || true);
      } else {
         add("Create the first usable version", buildNeed || true);
         add("Test the result in realistic conditions and review the evidence", validationNeed || true);
      }
   }

   return result.slice(0, 8);
}

function buildDependencyAwareMilestones(description: string, openQuestions: string[], constraints: string[]) {
   const result = extractProjectDescriptionMilestones(description, openQuestions);
   if (result.length) return result;

   const clean = sanitizeProjectBody([description, ...openQuestions, ...constraints].join("\n"));
   if (/\b(?:software|app|website|web application|browser-based|api|code)\b/i.test(clean)) {
      return ["Define the smallest complete user flow", "Build the first end-to-end version", "Test the flow with realistic user scenarios"];
   }
   if (/\b(?:research question|research brief|literature review|evidence review|credible sources?|citations?|bibliography|study design|research findings?)\b/i.test(clean)) {
      return ["Confirm the research question and evidence standard", "Collect and organize the required evidence", "Review the findings against the research question"];
   }
   if (/\b(?:story|novel|picture book|children['’]s book|screenplay|script|comic|graphic novel|characters?|plot|ending|manuscript)\b/i.test(clean)) {
      return ["Define the story arc and emotional progression", "Draft and revise the complete manuscript", "Test the story with its intended audience"];
   }
   if (/\b(?:article|book|essay|writing|draft|newsletter|copywriting)\b/i.test(clean)) {
      return ["Confirm the purpose, audience, and central message", "Draft the complete piece", "Revise it against the intended outcome"];
   }
   return ["Define the finished outcome and the first dependency", "Create the smallest usable version", "Validate it against the success criteria"];
}

function inferSeniorProjectStartingPoint(milestones: string[], openQuestions: string[], constraints: string[], llmNextStep?: string) {
   const first = milestones[0] || "Define the finished outcome and first dependency";
   const cleanLLMNextStep = sanitizeProjectNextStep(llmNextStep);

   if (cleanLLMNextStep && cleanLLMNextStep.length <= 420 && !/^(?:let'?s|get started|start by defining what success looks like|choose the first move|act as|identify the first dependency-aware checkpoint)/i.test(cleanLLMNextStep)) {
      return cleanLLMNextStep;
   }

   let reason = "It resolves the earliest dependency the later work relies on.";
   if (/\b(?:choose|select)\b.{0,40}\b(?:first|priority|initial)\b.{0,40}\b(?:collection|set|batch|sample|case|group)\b|\binventory\b.{0,30}\b(?:first|priority|initial)\b/i.test(first)) {
      reason = "One bounded starting set reveals the real volume, condition, information gaps, access needs, and workflow demands before the project scales.";
   } else if (/\b(?:move timeline|lease deadlines?)\b/i.test(first)) {
      reason = "The lease end, notice window, approval timing, and move window determine when the project can safely commit without creating a housing gap or unnecessary overlap.";
   } else if (/\b(?:deadlines? and hard limits|travel dates? and hard limits|external constraints?|commitments?|decision deadlines?)\b/i.test(first)) {
      reason = "The fixed dates, rules, and irreversible commitments determine which options are realistic and what must happen first.";
   } else if (/\bfirst projects?\b|\bprojects? the workspace must support\b/i.test(first)) {
      reason = "The first real projects determine the work surface, cutting needs, storage, tool choices, and space the initial setup actually needs.";
   } else if (/\b(?:approval|insurance|licensing|operating rules?|management|permission)\b/i.test(first)) {
      if (/\binsurance\b/i.test(first)) {
         reason = "Approval, insurance, and operating conditions determine whether the program can proceed and what rules the first version must follow.";
      } else if (/\b(?:event|movie|screening|quiet hours?|venue|courtyard)\b/i.test([...openQuestions, ...constraints].join(" "))) {
         reason = "Management approval, licensing, quiet-hour rules, and shared-space requirements determine whether and how the event can happen, so confirm them before choosing a date, movie, or equipment setup.";
      } else {
         reason = "Permissions and operating requirements determine whether the project can proceed and which later choices are actually allowed.";
      }
   } else if (/\b(?:power|lighting|ventilation|dust control|noise control|safety|infrastructure|legal|operating requirements?)\b/i.test(first)) {
      reason = "Those checks can rule out unsafe layouts, purchases, or operating choices before money or permanent effort is committed.";
   } else if (/\b(?:layout|storage|access|work surface|workbench)\b/i.test(first)) {
      reason = "The arrangement must support the intended work while preserving the space's other uses.";
   } else if (/\b(?:budget|resource priorities|upgrade priorities)\b/i.test(first)) {
      reason = "It keeps early spending tied to the work the first version must support.";
   } else if (/\b(?:scope|who it must serve|what it must prove)\b/i.test(first)) {
      reason = "That defines what the first version is responsible for and prevents the project from expanding without evidence.";
   } else if (/\b(?:pilot|program)\s+approved|assign an owner/i.test(first)) {
      reason = "Formal ownership, approval, privacy, and escalation rules determine whether participant recruitment and matching can begin safely.";
   } else if (/\b(?:research|compare|evaluate|options|requirements|facts)\b/i.test(first)) {
      reason = "It gives the later decisions enough evidence to avoid preventable rework.";
   }

   return `Start with ${first.replace(/[.]+$/, "")}. ${reason}`;
}

function makeProjectWorkingNoteReadable(value: string) {
   let clean = cleanProjectIntakeStatement(value, 260)
      .replace(/[.!?]+$/, "")
      .trim();
   if (!clean || /^(?:for|about|regarding)\s+.{1,80}$/i.test(clean)) return "";
   if (/\b(?:are|remain)\s+(?:still\s+)?unresolved$/i.test(clean)) return "";
   if (/^Nothing has been (?:booked|purchased|installed|started)/i.test(clean)) return "";

   const priorityShift = clean.match(/\bbut\s+(?:i|we)\s+(?:probably\s+)?(?:should|need\s+to|must)\s+(.+)$/i);
   if (priorityShift) {
      clean = `Important first check: ${priorityShift[1].replace(/^make\s+sure\s+/i, "confirm ")}`;
   }

   clean = clean
      .replace(/^(?:i|we)\s+want\s+to\s+start\s+(?:a\s+)?project\s+(?:around|about|to)\s+/i, "Project focus: ")
      .replace(/^(?:i|we)\s+(?:also\s+)?have\s+ideas?\s+(?:around|for|about)\s+/i, "Ideas include ")
      .replace(/^(?:i|we)\s+keep\s+(?:thinking|going back and forth)\s+(?:about\s+)?/i, "Possible direction: ")
      .replace(/^(?:i|we)\s+(?:also\s+)?want\s+/i, "Desired result: ")
      .replace(/^(?:i|we)\s+(?:also\s+)?need\s+to\s+/i, "Need to ")
      .replace(/\b(?:i|we)\s+probably\s+should\b/gi, "Should")
      .replace(/\s+/g, " ")
      .trim();

   const butIndex = clean.search(/\s+but\s+/i);
   if (!/^Important first check:/i.test(clean) && butIndex > 24) clean = clean.slice(0, butIndex).trim();
   if (/^(?:project focus|desired result):/i.test(clean)) return "";
   if (clean.length > 220) clean = `${clean.slice(0, 217).replace(/\s+\S*$/, "")}…`;

   return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : "";
}

function inferProjectWorkingNotes(description: string, used: string[]) {
   const candidates = splitProjectIntakeClauses(description)
      .filter((statement) => statement.length <= 240 && !used.some((usedValue) => getProjectIntakeSemanticOverlap(statement, usedValue) >= 0.55))
      .map(makeProjectWorkingNoteReadable)
      .filter(Boolean);

   return uniqueProjectIntakeStatements(candidates, 5);
}

function renderProjectDraftItems(items: string[], fallback: string) {
   return items.length ? items.map((item) => `- ${item.replace(/[.!?]+$/, "")}`).join("\n") : fallback;
}

function buildDetailedProjectDraft({ title, description, llmSummary, llmUsefulContext, llmNextStep }: { title: string; description: string; llmSummary?: string; llmUsefulContext?: string; llmNextStep?: string }) {
   const goal = inferProjectDraftGoal(title, description);
   const success = inferProjectDraftSuccess(description);
   const situation = inferProjectDraftSituation(description);
   const decisions = inferProjectDraftDecisions(description);
   const openQuestions = inferProjectDraftOpenQuestions(description);
   const constraints = inferProjectDraftConstraints(description, decisions);
   const milestones = buildDependencyAwareMilestones(description, openQuestions, constraints);
   const startingPoint = inferSeniorProjectStartingPoint(milestones, openQuestions, constraints, llmNextStep);
   const workingAssumptions = uniqueProjectIntakeStatements([...inferEventProjectWorkingAssumptions(description), ...inferGeneralProjectWorkingAssumptions(description)], 6);
   const workingNotes = inferProjectWorkingNotes(description, [goal, ...success, ...situation, ...decisions, ...openQuestions, ...constraints, ...milestones, ...workingAssumptions]);

   const structuredSections = [goal, ...success, ...situation, ...decisions, ...openQuestions, ...constraints, ...milestones, ...workingAssumptions, ...workingNotes];
   const modelNotes = uniqueProjectIntakeStatements(
      [llmSummary || "", llmUsefulContext || ""].filter(
         (value) =>
            value &&
            value.length > 30 &&
            value.length <= 220 &&
            !/[.!?].+[.!?]/.test(value) &&
            !/^(?:let'?s|act as|identify the first|you are|system|assistant|project lead instructions?)/i.test(value) &&
            !structuredSections.some((existing) => getProjectIntakeSemanticOverlap(value, existing) >= 0.55),
      ),
      2,
   );

   return sanitizeProjectBody(`Project Goal:
${goal}

Success Looks Like:
${renderProjectDraftItems(success, "- Define the observable result that would make this project complete and useful")}

Current Situation:
${renderProjectDraftItems(situation, "- The project is at its starting point")}

Confirmed Decisions:
${renderProjectDraftItems(decisions, "None confirmed yet.")}

Open Questions:
${renderProjectDraftItems(openQuestions, "None identified yet.")}

Constraints:
${renderProjectDraftItems(constraints, "None confirmed yet.")}

Working Notes:
${renderProjectDraftItems([...workingAssumptions, ...workingNotes, ...modelNotes].slice(0, 8), "- Add useful details as the project develops")}

Initial Milestones:
${milestones.map((milestone, index) => `${index + 1}. ${milestone}`).join("\n")}

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

function getMilestoneMetadataTokens(value?: string) {
   const stopWords = new Set([
      "after",
      "against",
      "before",
      "build",
      "check",
      "choose",
      "complete",
      "create",
      "current",
      "decide",
      "define",
      "first",
      "from",
      "into",
      "milestone",
      "needs",
      "plan",
      "project",
      "review",
      "select",
      "setup",
      "should",
      "that",
      "their",
      "then",
      "this",
      "what",
      "when",
      "where",
      "which",
      "with",
      "work",
   ]);

   return new Set(
      sanitizeProjectBody(value)
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .filter((token) => token.length >= 3 && !stopWords.has(token)),
   );
}

function getMilestoneMetadataOverlap(left?: string, right?: string) {
   const leftTokens = getMilestoneMetadataTokens(left);
   const rightTokens = getMilestoneMetadataTokens(right);
   if (!leftTokens.size || !rightTokens.size) return 0;

   let overlap = 0;
   leftTokens.forEach((token) => {
      if (rightTokens.has(token)) overlap += 1;
   });

   return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function getMilestoneProjectSectionItems(project: ProjectLibraryItem, labels: string[]) {
   return sanitizeProjectBody(getStructuredProjectSection(project.notes[0]?.body || project.latestSummary, labels))
      .split("\n")
      .map((line) => sanitizeProjectSummary(line.replace(/^\s*(?:[-*•]|\d+[.)]|[☐☑✓○])\s*/, "")))
      .filter((line) => line && !/^(?:none|none confirmed|none confirmed yet|none identified yet)\.?$/i.test(line))
      .slice(0, 40);
}

function getMilestoneRelatedItems(title: string, items: string[], limit = 8) {
   const titleTokens = getMilestoneMetadataTokens(title);

   return items
      .map((item, index) => {
         const itemTokens = getMilestoneMetadataTokens(item);
         let shared = 0;
         titleTokens.forEach((token) => {
            if (itemTokens.has(token)) shared += 1;
         });

         const directCategoryMatch =
            (/\b(?:power|electrical|outlet)\b/i.test(title) && /\b(?:power|electrical|outlet)\b/i.test(item)) ||
            (/\b(?:light|lighting)\b/i.test(title) && /\b(?:light|lighting)\b/i.test(item)) ||
            (/\b(?:ventilation|airflow)\b/i.test(title) && /\b(?:ventilation|airflow)\b/i.test(item)) ||
            (/\b(?:dust|noise)\b/i.test(title) && /\b(?:dust|noise)\b/i.test(item)) ||
            (/\b(?:layout|storage|access|workbench|workspace)\b/i.test(title) && /\b(?:layout|storage|access|workbench|workspace|portable|mobile|permanent)\b/i.test(item)) ||
            (/\b(?:budget|cost|price|resource)\b/i.test(title) && /\b(?:budget|cost|price|spend|resource)\b/i.test(item)) ||
            (/\b(?:tool|equipment|material)\b/i.test(title) && /\b(?:tool|equipment|material|saw|hardware|software)\b/i.test(item)) ||
            (/\b(?:audience|user|participant|customer)\b/i.test(title) && /\b(?:audience|user|participant|customer)\b/i.test(item)) ||
            (/\b(?:brand|language|promise|positioning)\b/i.test(title) && /\b(?:brand|language|promise|positioning|identity)\b/i.test(item)) ||
            (/\b(?:research|source|evidence|fact)\b/i.test(title) && /\b(?:research|source|evidence|fact|archive|interview)\b/i.test(item));

         return {
            item,
            index,
            score: shared * 2 + (directCategoryMatch ? 3 : 0) + getMilestoneMetadataOverlap(title, item),
         };
      })
      .filter((candidate) => candidate.score >= 2)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map((candidate) => candidate.item)
      .filter((item, index, all) => all.findIndex((candidate) => getProjectIntakeSemanticOverlap(candidate, item) >= 0.84) === index)
      .slice(0, limit);
}

function getGeneratedProjectMilestoneCategory(title: string) {
   const clean = sanitizeProjectTitle(title);
   if (
      /\b(?:move timeline|lease deadlines?|new apartment|plan the move|relocation budget|neighborhoods?|apartments?|movers?|book the move|move in|old apartment|finish the move|deadlines? and hard limits|finished result needs to include|order of work|backup options|prepare the logistics|carry out the plan|finish the loose ends|travel dates?|trip needs to include|itinerary|book the trip)\b/i.test(
         clean,
      )
   )
      return "coordination";
   if (/\b(?:first projects?|initial projects?|first uses?|use cases?|scenarios?|first useful scope|pilot scope|initial scope|must support|first collection|priority collection|first resource set|first batch|first set|inventory the first)\b/i.test(clean))
      return "first-scope";
   if (/\b(?:choose|select|decide|finalize|confirm)\b/i.test(clean) && /\b(?:tool|equipment|material|format|platform|approach|option|vendor|source|parts?)\b/i.test(clean)) return "selection";
   if (
      /\b(?:requirements?|power|electrical|lighting|ventilation|dust|noise|safety|risk|legal|permit|privacy|permission|compliance|infrastructure|quality|standards?|criteria|metadata|naming|identification|eligibility|exception|insurance|liability)\b/i.test(
         clean,
      )
   )
      return "requirements";
   if (/\b(?:layout|storage|access|workbench|workspace|structure|hierarchy|editorial|information architecture|outline|organization|folder|backup|recordkeeping|labeling)\b/i.test(clean)) return "layout";
   if (/\b(?:budget|cost|pricing|resources?|capacity|upgrade priorities|viability|margin)\b/i.test(clean)) return "budget";
   return "general";
}

function getGeneratedProjectCriterionCategory(criterion: string) {
   const clean = sanitizeProjectSummary(criterion);
   if (
      /\b(?:lease end|notice deadline|move window|approval timing|housing requirements|must-have apartment|move sequence|backup plan|relocation budget|neighborhood|apartment|mover|booking|first-night essentials|old apartment|remaining address|remaining obligation)\b/i.test(
         clean,
      )
   )
      return "coordination";
   if (/\b(?:initial projects?|uses?|scenarios?).*\bnamed\b|\boperations? or capabilities?.*\blisted\b|\bcapabilities intentionally excluded\b|\bmobility, reset, access, audience, or operating requirements\b/i.test(clean)) return "first-scope";
   if (
      /\belectrical or power capacity\b|\bcurrent lighting\b|\bventilation or airflow approach\b|\bdust-control approach\b|\bnoise-control\b|\bsafety risks, required controls\b|\brequired changes are separated from optional upgrades\b|\bremaining unknown has a clear owner\b/i.test(
         clean,
      )
   )
      return "requirements";
   if (/\bwork, storage, and access zones\b|\barrangement supports\b|\bshared-space, mobility, and reset requirements\b|\blayout identifies\b/i.test(clean)) return "layout";
   if (/\bmaximum budget or capacity boundary\b|\brequired spending or resource categories\b|\bpriority upgrades\b|\bdefer list\b/i.test(clean)) return "budget";
   if (/\bstrongest realistic options\b|\bworking option has been selected\b|\breason for the selection\b|\bpurchase, approval, dependency, or installation condition\b/i.test(clean)) return "selection";
   return "";
}

function isGeneratedProjectCriterionCompatible(title: string, criterion: string) {
   const criterionCategory = getGeneratedProjectCriterionCategory(criterion);
   return !criterionCategory || criterionCategory === getGeneratedProjectMilestoneCategory(title);
}

interface GeneratedProjectMilestoneMetadata {
   goal: string;
   whyItMatters: string;
   startingPrompt: string;
   decisions: string[];
   openQuestions: string[];
   dependencies: string[];
   completionCriteria: string[];
}

function getScopedMilestoneQuestions(title: string, questions: string[]) {
   const cleanTitle = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   const firstUseOrScope =
      /\b(?:first projects?|initial projects?|first uses?|use cases?|scenarios?|first useful scope|pilot scope|initial scope|must support|first collection|priority collection|first resource set|first batch|first set|inventory the first)\b/i.test(
         cleanTitle,
      );
   const requirementsOrSafety =
      /\b(?:requirements?|power|electrical|lighting|ventilation|dust|noise|safety|risk|legal|permit|privacy|permission|approval|management|license|licensing|operating rules?|quiet hours?|compliance|infrastructure|quality|standards?|criteria|metadata|naming|identification|eligibility|exception|insurance|liability)\b/i.test(
         cleanTitle,
      );
   const layoutOrStructure = /\b(?:layout|storage|access|workbench|workspace|structure|hierarchy|editorial|information architecture|outline|organization|folder|backup|recordkeeping|labeling)\b/i.test(cleanTitle);
   const budgetOrResources = /\b(?:budget|cost|pricing|resources?|capacity|upgrade priorities|viability|margin)\b/i.test(cleanTitle);
   const selection = /\b(?:choose|select|decide|finalize|confirm)\b/i.test(cleanTitle) && /\b(?:tool|equipment|material|format|platform|approach|option|vendor|source|parts?)\b/i.test(cleanTitle);
   const brandOrPositioning = /\b(?:brand|language|promise|positioning|identity|message|tone)\b/i.test(cleanTitle);
   const relationship = /\b(?:relate|relationship|parent|ecosystem|family|portfolio|role of each)\b/i.test(cleanTitle);
   const workflow = /\b(?:workflow|process|processing|capacity|responsibilities|handoffs|operating model|service flow|production|review cycle|identification)\b/i.test(cleanTitle);
   const research = /\b(?:research|sources?|evidence|facts?|archive|interview|requirements gathering|discovery)\b/i.test(cleanTitle);
   const coordination =
      /\b(?:move timeline|lease deadlines?|new apartment|plan the move|relocation budget|neighborhoods?|apartments?|movers?|book the move|move in|old apartment|finish the move|deadlines? and hard limits|finished result needs to include|order of work|backup options|prepare the logistics|carry out the plan|finish the loose ends|travel dates?|trip needs to include|itinerary|book the trip)\b/i.test(
         cleanTitle,
      );

   if (coordination) {
      return questions.filter((question) =>
         /\b(?:deadline|lease|notice|approval|move date|overlap|neighborhood|apartment|commute|rent|parking|noise|security|laundry|internet|mover|packing|utility|address|disposal|cleaning|contingency|budget|travel date|booking|provider|responsibility)\b/i.test(
            question,
         ),
      );
   }
   if (firstUseOrScope) {
      return questions.filter((question) =>
         /\b(?:first|initial|priority)\s+(?:projects?|uses?|use cases?|scenarios?|scope|collection|resource set|batch|set)\b|\bprojects?\b.*\b(?:support|include|cover)\b|\b(?:inventory|collection|resource set|condition|acceptance|use cases?|scenarios?|scope|must support|operations?|capabilities?)\b/i.test(
            question,
         ),
      );
   }
   if (selection) {
      return questions.filter((question) => /\b(?:tool|equipment|material|format|platform|approach|option|vendor|source|part)\b/i.test(question));
   }
   if (requirementsOrSafety) {
      return questions.filter((question) =>
         /\b(?:power|electrical|outlet|lighting|light|ventilation|airflow|dust|noise|sound|safety|risk|flammable|finish|fire|legal|permit|privacy|permission|approval|management|license|licensing|rights|quiet[- ]hours?|operating hours?|shared space|courtyard|walkway|entrance|emergency access|compliance)\b/i.test(
            question,
         ),
      );
   }
   if (layoutOrStructure) {
      return questions.filter((question) => /\b(?:layout|storage|access|workbench|workspace|mobile|movable|portable|permanent|wall|mount|structure|hierarchy|editorial|outline)\b/i.test(question));
   }
   if (budgetOrResources) {
      return questions.filter((question) => /\b(?:budget|cost|price|spend|resource|capacity|priority|afford)\b/i.test(question));
   }
   if (brandOrPositioning) {
      return questions.filter((question) => /\b(?:brand|language|promise|positioning|identity|message|tone)\b/i.test(question));
   }
   if (relationship) {
      return questions.filter((question) => /\b(?:relate|relationship|parent|ecosystem|family|portfolio|role)\b/i.test(question));
   }
   if (workflow) {
      return questions.filter((question) => /\b(?:workflow|process|capacity|responsibilities|handoff|operating|production)\b/i.test(question));
   }
   if (research) {
      return questions.filter((question) => /\b(?:research|source|evidence|fact|archive|interview|discovery)\b/i.test(question));
   }

   return questions;
}

function buildGeneratedProjectMilestoneMetadata(project: ProjectLibraryItem, title: string, index: number, allTitles: string[]): GeneratedProjectMilestoneMetadata {
   const cleanTitle = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   const lower = cleanTitle.toLowerCase();
   const projectBody = sanitizeProjectBody(project.notes[0]?.body || project.latestSummary);
   const confirmed = getMilestoneProjectSectionItems(project, ["Confirmed Decisions", "Decisions", "Decided"]);
   const openQuestions = getMilestoneProjectSectionItems(project, ["Open Questions", "Questions", "Unresolved Decisions"]);
   const constraints = getMilestoneProjectSectionItems(project, ["Constraints", "Requirements", "Limits"]);
   const relatedDecisions = getMilestoneRelatedItems(cleanTitle, confirmed, 8);
   const relatedQuestions = getMilestoneRelatedItems(cleanTitle, openQuestions, 8);
   void getMilestoneRelatedItems(cleanTitle, constraints, 6);
   const previousTitle = index > 0 ? allTitles[index - 1] : "";
   const nextTitle = allTitles[index + 1] || "";

   let goal = `Produce a clear, reviewable result for ${cleanTitle.toLowerCase()}.`;
   let whyItMatters = nextTitle
      ? `${cleanTitle} gives ${nextTitle.replace(/^./, (character) => character.toLowerCase())} a dependable starting point instead of forcing the later work to rely on assumptions.`
      : `${cleanTitle} closes the remaining gap between the current project state and a usable finished result.`;
   let startingPrompt = `Create the smallest concrete result that would prove ${cleanTitle.toLowerCase()} is ready to close.`;
   let completionCriteria: string[] = [];

   const collectionScope = /\b(?:choose|select)\b.{0,50}\b(?:first|priority|initial)\b.{0,50}\b(?:collection|resource set|set|batch|sample|case|group|records?|items?)\b|\b(?:inventory|catalog)\b.{0,40}\b(?:first|priority|initial)\b/i.test(cleanTitle);
   const collectionRules = /\b(?:privacy|access|naming|metadata|identification|cataloging|tagging)\b/i.test(cleanTitle);
   const qualityStandards = /\b(?:quality|capture|scanning|digitization|handling|preservation)\b.{0,40}\b(?:standards?|criteria|rules?)\b|\b(?:standards?|criteria)\b.{0,40}\b(?:quality|handling|preservation|specialist)\b/i.test(cleanTitle);
   const collectionStructure = /\b(?:organization|folder|storage|backup|repository|archive)\b/i.test(cleanTitle) && /\b(?:structure|system|approach|plan|choose|define|set)\b/i.test(cleanTitle);
   const collectionProcessing = /\b(?:process|digitize|scan|catalog|organize|preserve)\b/i.test(cleanTitle) && /\b(?:collection|records?|items?|materials?|set|archive)\b/i.test(cleanTitle);
   const collectionReview = /\b(?:review|resolve|identify|unknown|preserve)\b/i.test(cleanTitle) && /\b(?:collection|details?|items?|set|records?)\b/i.test(cleanTitle);
   const firstUseOrScope = /\b(?:first projects?|initial projects?|first uses?|use cases?|scenarios?|first useful scope|pilot scope|initial scope|must support|first collection|priority collection|first batch|first set|first resource set)\b/i.test(
      cleanTitle,
   );
   const eventApproval = /\b(?:approval|management|license|licensing|operating rules?|quiet hours?|insurance)\b/i.test(cleanTitle);
   const programApproval = /\binsurance\b/i.test(cleanTitle) || /\b(?:lending|borrowing|checkout|check-out|loan|service program|pilot program)\b/i.test(projectBody);
   const serviceResourceScope = /\b(?:choose|select)\b.{0,50}\b(?:first|priority|initial)\b.{0,50}\b(?:resource set|tool set|service set|offering set)\b/i.test(cleanTitle);
   const serviceRecordStructure = /\b(?:storage|labeling|recordkeeping|checkout records?|borrowing records?)\b/i.test(cleanTitle) && /\b(?:approach|structure|system|plan|choose|define|set)\b/i.test(cleanTitle);
   const selection = /\b(?:choose|select|decide|finalize|confirm)\b/i.test(cleanTitle) && /\b(?:tool|equipment|material|format|platform|approach|option|vendor|source|parts?)\b/i.test(cleanTitle);
   const requirementsOrSafety =
      /\b(?:requirements?|power|electrical|lighting|ventilation|dust|noise|safety|risk|legal|permit|privacy|permission|approval|management|license|licensing|operating rules?|quiet hours?|compliance|infrastructure|quality|standards?|criteria|metadata|naming|identification|handling|preservation)\b/i.test(
         cleanTitle,
      ) && !selection;
   const layoutOrStructure = /\b(?:layout|storage|access|workbench|workspace|structure|hierarchy|editorial|information architecture|outline|organization|folder|backup|repository)\b/i.test(cleanTitle);
   const budgetOrResources = /\b(?:budget|cost|pricing|resources?|capacity|upgrade priorities|viability|margin)\b/i.test(cleanTitle);
   const brandOrPositioning = /\b(?:brand|language|promise|positioning|identity|message|tone)\b/i.test(cleanTitle);
   const relationship = /\b(?:relate|relationship|parent|ecosystem|family|portfolio|role of each)\b/i.test(cleanTitle);
   const workflow = /\b(?:workflow|process|capacity|responsibilities|handoffs|operating model|service flow|production)\b/i.test(cleanTitle);
   const research = /\b(?:research|sources?|evidence|facts?|archive|interview|requirements gathering|discovery)\b/i.test(cleanTitle);
   const buildOrCreate = /\b(?:build|create|produce|implement|install|organize|assemble|develop|write|record|publish|process|digitize|scan|catalog|preserve)\b/i.test(cleanTitle);
   const validation = /\b(?:test|review|pilot|validate|verify|rehearse|complete real projects|collect evidence|evaluate)\b/i.test(cleanTitle);
   const coordination =
      /\b(?:move timeline|lease deadlines?|new apartment|plan the move|relocation budget|neighborhoods?|apartments?|movers?|book the move|move in|old apartment|finish the move|deadlines? and hard limits|finished result needs to include|order of work|backup options|prepare the logistics|carry out the plan|finish the loose ends|travel dates?|trip needs to include|itinerary|book the trip)\b/i.test(
         cleanTitle,
      );

   const milestoneQuestions = getScopedMilestoneQuestions(cleanTitle, relatedQuestions);

   if (coordination) {
      const relocationMilestone = /\b(?:move|apartment|lease|mover|relocation)\b/i.test(`${cleanTitle} ${projectBody}`);

      if (/\b(?:move timeline|lease deadlines?|deadlines? and hard limits|travel dates? and hard limits)\b/i.test(cleanTitle)) {
         goal = relocationMilestone ? "Put the lease end, notice window, approval timing, and move window on one dependable timeline." : "Put the fixed dates, rules, and irreversible commitments on one dependable timeline.";
         whyItMatters = nextTitle
            ? `The hard dates and commitment rules need to be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the project may make an irreversible choice too early.`
            : "The fixed dates and irreversible commitments determine what can safely happen next.";
         startingPrompt = relocationMilestone
            ? "Write the lease-end date, notice deadline, target move window, and latest safe date for signing the next lease on one simple timeline; verify the notice rule first."
            : "Write the fixed dates, approval or notice rules, and irreversible commitments on one simple timeline; verify the earliest blocker first.";
         completionCriteria = relocationMilestone
            ? [
                 "The lease-end date and required notice window are recorded",
                 "The target move window and latest safe lease-signing date are clear",
                 "The rule for giving notice only after approval is recorded",
                 "Any acceptable overlap or same-week fallback is identified",
              ]
            : ["The fixed dates and deadlines are recorded", "Approval, notice, or commitment rules are clear", "The earliest irreversible decision is identified", "A fallback exists for the first major timing risk"];
      } else if (/\b(?:new apartment needs to have|good finished result needs to include|trip needs to include)\b/i.test(cleanTitle)) {
         goal = relocationMilestone ? "Turn the commute, cost, lease, comfort, and service needs into a short apartment must-have list." : "Turn the project goal and constraints into a short list of must-haves and tradeoffs.";
         whyItMatters = nextTitle
            ? `The must-haves need to be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so the project can compare real options without drifting.`
            : "A short must-have list keeps later choices tied to the outcome that actually matters.";
         startingPrompt = relocationMilestone
            ? "Write the apartment must-haves, nice-to-haves, and deal-breakers for commute, total cost, parking, noise, security, laundry, internet, and lease terms."
            : "Write the must-haves, nice-to-haves, and deal-breakers that define a good finished result.";
         completionCriteria = relocationMilestone
            ? [
                 "The commute and total housing-cost limits are recorded",
                 "Apartment and neighborhood must-haves are separated from preferences",
                 "Lease, parking, security, laundry, noise, and internet needs are clear",
                 "The deal-breakers and acceptable tradeoffs are recorded",
              ]
            : ["The must-haves are recorded", "Preferences are separated from non-negotiables", "The acceptable tradeoffs are clear", "The list can be used to compare real options"];
      } else if (/\b(?:plan the move|order of work|itinerary|backup options)\b/i.test(cleanTitle)) {
         goal = relocationMilestone ? "Map the move from lease approval through old-apartment closeout, including ownership and backup options." : "Map the work in the order it must happen, including ownership and backup options.";
         whyItMatters = nextTitle
            ? `The sequence and ownership need to be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so later bookings and purchases do not create avoidable conflicts.`
            : "A clear sequence prevents deadlines, handoffs, and backup needs from being discovered too late.";
         startingPrompt = relocationMilestone
            ? "Lay out the move from apartment approval to notice, packing, utilities, moving day, cleaning, and key return; assign an owner and backup for each step."
            : "Lay out the work in order, assign ownership, and add a backup for the first two failure points.";
         completionCriteria = relocationMilestone
            ? [
                 "The move sequence is mapped from lease approval through key return",
                 "Packing, utilities, movers, cleaning, and address changes have clear owners",
                 "Dependencies between notice, overlap, moving day, and service setup are visible",
                 "A same-week move and internet-access fallback are recorded",
              ]
            : ["The work is ordered from first dependency to closeout", "Responsibilities are assigned", "Important handoffs and dependencies are visible", "The main backup options are recorded"];
      } else if (/\b(?:relocation budget|working budget|trip budget)\b/i.test(cleanTitle)) {
         goal = relocationMilestone
            ? "Set a relocation budget that covers the deposit, movers, overlap, setup, and closeout without breaking the housing limit."
            : "Set a working budget that covers the required work and protects the most important priorities.";
         whyItMatters = nextTitle
            ? `The budget needs to be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so the project compares options it can actually afford.`
            : "A realistic budget keeps the project from creating a plan it cannot sustain.";
         startingPrompt = relocationMilestone
            ? "List the deposit, movers, overlap, utility setup, cleaning, replacements, and contingency costs; set a maximum total and mark what can be cut first."
            : "List the required cost categories, set the maximum spend, and mark the optional items that can wait.";
         completionCriteria = relocationMilestone
            ? ["The maximum relocation budget is recorded", "Deposit, movers, overlap, setup, cleaning, and contingency are estimated", "The plan still fits the monthly housing-cost limit", "Optional spending and cut-first items are identified"]
            : ["The maximum spend is recorded", "Required cost categories are estimated", "Optional spending is separated from required spending", "A contingency amount or fallback is recorded"];
      } else if (/\b(?:neighborhoods?|apartments?|movers?|main options and providers|routes?|stays?|travel options)\b/i.test(cleanTitle)) {
         goal = relocationMilestone ? "Compare the strongest neighborhoods, apartments, and mover options against the confirmed must-haves and budget." : "Compare the strongest options against the confirmed must-haves, limits, and budget.";
         whyItMatters = nextTitle
            ? `The main choices need to be compared before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so the project can commit with a clear reason instead of reacting to the first available option.`
            : "A simple comparison turns preferences into a defensible choice.";
         startingPrompt = relocationMilestone
            ? "Create one comparison table for neighborhoods and apartments, and a smaller quote comparison for movers; choose the leading option only after the must-haves and total cost are visible."
            : "Put the strongest options in one comparison table and choose the leading option against the confirmed must-haves and constraints.";
         completionCriteria = relocationMilestone
            ? [
                 "The strongest neighborhoods and apartments are compared against the must-haves",
                 "Commute, total cost, parking, noise, security, laundry, internet, and lease terms are visible",
                 "Mover quotes and service limits are compared",
                 "A leading apartment and moving approach are recorded with reasons",
              ]
            : ["The strongest realistic options are compared", "The comparison uses the confirmed must-haves and limits", "Cost and provider conditions are visible", "A leading option is recorded with a reason"];
      } else if (/\b(?:book the move|book what is needed|book the trip|prepare the logistics)\b/i.test(cleanTitle)) {
         goal = relocationMilestone ? "Book the move and prepare the packing, service, access, and first-night details." : "Book what is needed and prepare the logistics for a smooth handoff into execution.";
         whyItMatters = nextTitle
            ? `The bookings and logistics need to be ready before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so execution is not blocked by missing access, services, or supplies.`
            : "Prepared logistics keep execution from becoming a last-minute scramble.";
         startingPrompt = relocationMilestone
            ? "Confirm the lease and notice sequence, book the mover, set packing dates, schedule utilities and internet, and prepare access, parking, first-night, and work-continuity checklists."
            : "Confirm the bookings, access, supplies, owners, and fallback arrangements needed for execution.";
         completionCriteria = relocationMilestone
            ? [
                 "The lease, notice, mover, and move-date sequence is confirmed",
                 "Packing, access, parking, and moving-day logistics are ready",
                 "Utilities, internet, insurance, and first-night essentials are scheduled",
                 "Work-continuity and same-week fallback plans are ready",
              ]
            : ["Required bookings and access are confirmed", "Supplies and responsibilities are ready", "The first-day essentials are covered", "The main fallback remains usable"];
      } else if (/\b(?:move in|carry out the plan|take the trip|essentials working)\b/i.test(cleanTitle)) {
         goal = relocationMilestone ? "Complete the move and make the new apartment usable on the first night." : "Carry out the plan and make the first-stage result usable immediately.";
         whyItMatters = nextTitle
            ? `The transition needs to be usable before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so closeout is not hiding unresolved setup problems.`
            : "The project is not complete until the new state works in real conditions.";
         startingPrompt = relocationMilestone
            ? "Run the moving-day plan, protect work-critical electronics and documents, confirm utilities and internet, and set up the first-night essentials before unpacking lower-priority items."
            : "Carry out the plan, protect the critical items, and confirm the essentials work before handling lower-priority setup.";
         completionCriteria = relocationMilestone
            ? ["The move is completed before the old lease ends", "Essential utilities and internet work", "Critical documents, electronics, and first-night items are accounted for", "Any damage, missing item, or service issue is recorded for follow-up"]
            : ["The transition is completed", "The essential services or capabilities work", "Critical items are accounted for", "Remaining issues are recorded"];
      } else {
         goal = relocationMilestone ? "Close out the old apartment and finish the remaining move obligations." : "Finish the remaining obligations and review whether the transition met the project goal.";
         whyItMatters = "Closeout protects the deposit, prevents missed obligations, and turns the transition into a finished project rather than a lingering checklist.";
         startingPrompt = relocationMilestone
            ? "Clean and document the old apartment, return keys, finish address changes and service cancellations, confirm the deposit process, and record any remaining follow-up."
            : "Close the remaining obligations, document the result, and record what still needs follow-up.";
         completionCriteria = relocationMilestone
            ? [
                 "The old apartment is cleaned and documented",
                 "Keys, utilities, insurance, mail, and remaining address changes are closed out",
                 "The deposit and any final charges are tracked",
                 "The final transition cost and remaining follow-up are recorded",
              ]
            : ["The remaining obligations are closed", "The result is documented", "Any final costs or follow-up are recorded", "The outcome has been checked against the project goal"];
      }
   } else if (eventApproval) {
      if (programApproval) {
         goal = "Confirm whether the program can proceed and record the approval, insurance, storage, and responsibility conditions the first version must respect.";
         whyItMatters = nextTitle
            ? `Approval, insurance, and operating rules must be confirmed before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the program may be designed around a model the host cannot support.`
            : "Approval, insurance, and operating rules determine whether the program can proceed and who carries responsibility.";
         startingPrompt = "Create a blocker checklist for host approval, insurance or lease restrictions, allowed storage, and responsibility for loss, damage, and unsafe use; confirm the host decision first.";
         completionCriteria = [
            "The host or management decision and any conditions are recorded",
            "Insurance, lease, liability, or policy restrictions are confirmed",
            "Allowed storage and access conditions are recorded",
            "Responsibility for loss, damage, and unsafe use is defined",
            "Any blocker or condition is carried into the resource set, rules, and operating workflow",
         ];
      } else {
         goal = "Confirm whether the event can proceed and record the operating conditions that later planning must respect.";
         whyItMatters = nextTitle
            ? `Approval, licensing, and operating rules must be confirmed before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the event may be scheduled around a format that is not permitted.`
            : "Approval, licensing, and operating rules determine whether the event can happen and under what conditions.";
         startingPrompt = "Create an approval checklist, confirm management permission and licensing first, then record quiet-hour, sound, access, and shared-space conditions.";
         completionCriteria = [
            "The management decision and any approval conditions are recorded",
            "The public-performance licensing requirement is confirmed",
            "Quiet-hour, sound, and operating-time rules are recorded",
            "Shared-space, walkway, entrance, and emergency-access conditions are recorded",
            "Any blocker or condition is carried into the date, site, and equipment plan",
         ];
      }
   } else if (serviceResourceScope) {
      goal = "Select one bounded first resource set and record what belongs in it before the program launches.";
      whyItMatters = nextTitle
         ? `The first resource set must be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or rules and workflows may be designed around items that are unsafe, unnecessary, or too difficult to maintain.`
         : "A bounded first resource set keeps the program safe, maintainable, and easy to evaluate.";
      startingPrompt = "List the strongest candidate resources, define acceptance and safety checks, exclude high-risk items, then inventory the first approved set.";
      completionCriteria = [
         "The first approved resource set is named",
         "Each item or resource is inventoried",
         "Acceptance, condition, and safety checks are documented",
         "Items excluded from the first version are recorded",
         "The selected set fits the intended users, storage, maintenance, and pilot scope",
      ];
   } else if (collectionScope) {
      goal = "Select one bounded starting collection and understand what it contains before the project scales.";
      whyItMatters = nextTitle
         ? `A bounded inventory must be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or later rules and workflows may be designed around the wrong volume, condition, or information gaps.`
         : "A bounded inventory gives the project real scope, condition, and information evidence instead of forcing it to plan for an unknown whole.";
      startingPrompt = "Compare the strongest candidate collections by importance, size, condition, access, and available identification support; choose one, then create a simple container-level inventory before processing anything.";
      completionCriteria = [
         "One bounded starting collection is selected",
         "Its containers, folders, albums, files, or item groups are inventoried",
         "Approximate volume, condition, and access constraints are recorded",
         "Known labels, missing details, and available reviewers or contributors are noted",
         "The first phase explicitly excludes the rest of the collection",
      ];
   } else if (collectionRules) {
      goal = "Create the rules that keep the collection understandable, private, and consistent as work progresses.";
      whyItMatters = nextTitle
         ? `Naming, metadata, access, and identification rules must be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the project may create files and records that are difficult to trust or reorganize later.`
         : "Consistent rules prevent the collection from becoming searchable in theory but confusing in practice.";
      startingPrompt = "Draft the naming convention, required metadata fields, privacy and access levels, and a simple process for recording and resolving unknown details.";
      completionCriteria = [
         "A naming convention is documented",
         "Required metadata fields and unknown-value handling are documented",
         "Privacy and access rules are clear",
         "The identification and review process is defined",
         "The rules can be applied consistently to the selected first collection",
      ];
   } else if (qualityStandards) {
      goal = "Define the quality, authenticity, and handling standard the work must meet.";
      whyItMatters = nextTitle
         ? `The quality and handling standard must be settled before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or work may need to be repeated or may damage material that should have been handled differently.`
         : "A clear standard separates acceptable corrective work from changes that compromise accuracy, quality, or preservation.";
      startingPrompt = "Define the minimum acceptable quality, the allowed corrections, the specialist-handling triggers, and the checks that prove an item meets the standard.";
      completionCriteria = [
         "The minimum usable quality standard is documented",
         "Allowed corrections and prohibited alterations are clear",
         "Specialist-handling or escalation criteria are recorded",
         "Originals and working copies are distinguished",
         "A repeatable quality check is defined",
      ];
   } else if (serviceRecordStructure) {
      goal = "Choose a storage, labeling, and recordkeeping approach that makes the first program easy to operate and audit.";
      whyItMatters = nextTitle
         ? `Storage and recordkeeping must be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the program may lose track of resources, users, and exceptions.`
         : "A simple recordkeeping structure makes shared resources accountable without creating unnecessary administrative work.";
      startingPrompt = "Choose the storage location, labeling convention, minimum borrowing record, privacy-safe identifiers, and the method for tracking availability and condition.";
      completionCriteria = [
         "The approved storage location and access method are recorded",
         "The labeling convention is documented",
         "The minimum checkout and return record is defined",
         "Privacy-safe user identification is defined",
         "Availability, condition, late, missing, and damaged states can be tracked",
      ];
   } else if (collectionStructure) {
      goal = "Choose an organization, storage, and backup structure that can support both current work and future growth.";
      whyItMatters = nextTitle
         ? `The structure must be settled before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or processed work may be stored inconsistently and require later reorganization.`
         : "A durable structure keeps the collection browsable, recoverable, and reusable without rebuilding it for each output.";
      startingPrompt = "Sketch the folder or repository structure, define where originals and working files live, and choose a backup pattern with at least two independent copies.";
      completionCriteria = [
         "The organization or folder structure is documented",
         "Originals, working files, and finished outputs have clear locations",
         "Local, cloud, or hybrid storage roles are decided",
         "At least two independent backup locations are defined",
         "The structure supports browsing and future outputs without reorganization",
      ];
   } else if (collectionProcessing) {
      goal = "Process and organize the selected collection using the confirmed rules and standards.";
      whyItMatters = nextTitle
         ? `A complete processed collection is needed before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so review and validation are based on a real finished set rather than a partial workflow.`
         : "Processing one bounded collection proves whether the chosen standards, structure, and workflow are usable.";
      startingPrompt = "Process a small representative batch from start to finish, confirm the workflow works, then complete the rest of the selected collection while recording exceptions.";
      completionCriteria = [
         "The selected collection is processed at the required quality",
         "Files or records follow the naming and metadata rules",
         "Originals and working copies are stored correctly",
         "Exceptions, failed items, and specialist-handling needs are recorded",
         "The completed set is backed up in the confirmed locations",
      ];
   } else if (collectionReview) {
      goal = "Resolve unknown details, preserve the finished set, and prepare the first useful output.";
      whyItMatters = nextTitle
         ? `The finished set needs review and preservation before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or validation may overlook missing identities, privacy issues, or physical-storage gaps.`
         : "Review converts a technically processed set into a trustworthy and useful family, team, or institutional record.";
      startingPrompt = "Review the finished set with the people who can resolve unknown details, record unresolved items clearly, return originals to safe storage, and assemble the first finished output from the organized collection.";
      completionCriteria = [
         "Reviewers or contributors have examined the selected set",
         "Resolved identities, dates, locations, or context are recorded",
         "Unresolved details remain clearly labeled rather than guessed",
         "Originals are returned to appropriate storage",
         "The first finished output can be created without reorganizing the collection",
      ];
   } else if (firstUseOrScope) {
      goal = "Define the first real work the initial version must support and the capabilities that work requires.";
      whyItMatters = nextTitle
         ? `The first real uses set the standard for ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so later requirements and purchases can be judged against actual work instead of an imagined ideal setup.`
         : "The first real uses set the standard for the scope, requirements, tools, workflow, and evidence that follow.";
      startingPrompt = "Choose three to five realistic first projects, uses, or scenarios and list the operations or capabilities each one requires.";
      completionCriteria = [
         "The initial projects, uses, or scenarios are named",
         "The operations or capabilities each one requires are listed",
         "Capabilities intentionally excluded from the first version are recorded",
         "Any mobility, reset, access, audience, or operating requirements created by those uses are clear",
      ];
   } else if (requirementsOrSafety) {
      goal = "Turn the current conditions and unknowns into a clear list of safe, usable requirements.";
      whyItMatters = nextTitle
         ? `The project needs verified requirements before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the next milestone may be designed around unsafe, unavailable, or unnecessary assumptions.`
         : "Verified requirements prevent the project from committing to a design or purchase that cannot be used safely or reliably.";
      startingPrompt = "Record the current conditions, identify what must be verified, and separate required changes from optional improvements.";
      const requirementChecks: string[] = [];
      if (/\b(?:power|electrical|outlet)\b/i.test(cleanTitle)) requirementChecks.push("The available electrical or power capacity has been checked against the planned work");
      if (/\b(?:lighting|light)\b/i.test(cleanTitle)) requirementChecks.push("The current lighting has been assessed and any required improvement is identified");
      if (/\b(?:ventilation|airflow)\b/i.test(cleanTitle)) requirementChecks.push("The ventilation or airflow approach is documented");
      if (/\b(?:dust)\b/i.test(cleanTitle)) requirementChecks.push("The dust-control approach is documented for the planned work");
      if (/\b(?:noise)\b/i.test(cleanTitle)) requirementChecks.push("The noise-control limits or approach are documented");
      if (/\b(?:safety|risk|flammable|fire)\b/i.test(`${cleanTitle} ${projectBody}`)) requirementChecks.push("The safety risks, required controls, and safe storage rules are recorded");
      if (/\b(?:legal|permit|privacy|permission|rights|compliance)\b/i.test(cleanTitle)) requirementChecks.push("The applicable rules, permissions, or approval requirements are confirmed");
      completionCriteria = uniqueProjectIntakeStatements([...requirementChecks, "Required changes are separated from optional upgrades", "Any remaining unknown has a clear owner, source, or verification step"], 8);
   } else if (layoutOrStructure) {
      goal = /\b(?:editorial|hierarchy|information architecture|outline)\b/i.test(cleanTitle)
         ? "Create a clear structure that communicates priority, relationship, and sequence."
         : "Create a workable arrangement that supports the planned work while preserving access, storage, and reset needs.";
      whyItMatters = nextTitle
         ? `A usable structure needs to be settled before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or implementation may be built around an arrangement that later has to change.`
         : "A workable structure turns requirements into an arrangement that can be built and tested.";
      startingPrompt = /\b(?:editorial|hierarchy|information architecture|outline)\b/i.test(cleanTitle)
         ? "Sketch two viable structures, label what each one communicates, and choose the one that best supports the project goal."
         : "Sketch the work zones, storage, access paths, and movable or permanent elements, then test whether the space can be reset.";
      completionCriteria = /\b(?:editorial|hierarchy|information architecture|outline)\b/i.test(cleanTitle)
         ? [
              "The major sections or elements are placed in a clear order",
              "The hierarchy communicates the intended priority and relationships",
              "Every required piece of content has a clear place",
              "The structure has been checked against the audience and success criteria",
           ]
         : [
              "Work, storage, and access zones are shown",
              "The arrangement supports the planned operations or uses",
              "Shared-space, mobility, and reset requirements are preserved",
              "The layout identifies where required safety or infrastructure controls belong",
           ];
   } else if (budgetOrResources) {
      goal = "Set a realistic boundary for spending, capacity, and upgrade priorities.";
      whyItMatters = nextTitle
         ? `A clear resource boundary is needed before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so the project does not select options it cannot sustain.`
         : "A realistic resource boundary prevents the project from overcommitting before its needs are proven.";
      startingPrompt = "Write the maximum first-phase budget, the required spending categories, the priority order, and the purchases or upgrades that can wait.";
      completionCriteria = [
         "The maximum budget or capacity boundary is recorded",
         "Required spending or resource categories are estimated",
         "Priority upgrades are separated from optional upgrades",
         "A defer list protects the project from premature purchases or commitments",
      ];
   } else if (selection) {
      goal = `Choose the option for ${cleanTitle.replace(/^(?:choose|select|decide|finalize|confirm)\s+/i, "").toLowerCase()} that best fits the confirmed requirements.`;
      whyItMatters = nextTitle
         ? `The selection should be made against confirmed requirements before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so later work is not organized around an attractive but unsuitable option.`
         : "The selection converts the project’s requirements into a defensible commitment.";
      startingPrompt = "Compare the strongest options against the required capabilities, constraints, cost, reliability, and implementation needs, then record the working choice.";
      completionCriteria = [
         "The strongest realistic options have been compared against the confirmed requirements",
         "A working option has been selected",
         "The reason for the selection and the rejected alternatives are recorded",
         "Any purchase, approval, dependency, or installation condition is clear",
      ];
   } else if (brandOrPositioning) {
      goal = "Create a usable project-level promise and language standard that the work that follows can apply consistently.";
      whyItMatters = nextTitle
         ? `The language standard needs to be usable before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the later work may describe strong parts without a coherent reason they belong together.`
         : "A usable language standard gives later copy, structure, and design decisions a consistent test.";
      startingPrompt = "Draft three concise versions of the core promise, test each against the full project, and choose a working statement.";
      completionCriteria = [
         "At least two or three viable statements have been drafted",
         "Each statement has been tested against the full project and intended audience",
         "A working statement has been selected",
         "The reason it fits and the language it rules out are recorded",
      ];
   } else if (relationship) {
      goal = "Define how the major parts relate, what each part owns, and what they share.";
      whyItMatters = nextTitle
         ? `The relationship model must be clear before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or the later hierarchy may communicate the wrong level of importance or independence.`
         : "A clear relationship model prevents overlap, gaps, and contradictory positioning.";
      startingPrompt = "Write one sentence for the role of each part and one sentence explaining what they share under the parent project.";
      completionCriteria = ["Each major part has a distinct role", "The shared parent-level promise is clear", "Overlap, gaps, and hierarchy are resolved", "The relationship can guide the structure or workflow that follows"];
   } else if (workflow) {
      goal = "Define a repeatable workflow that fits the project’s real capacity and responsibilities.";
      whyItMatters = nextTitle
         ? `The operating workflow determines what ${nextTitle.replace(/^./, (character) => character.toLowerCase())} must support and prevents the project from designing around capacity it does not have.`
         : "A repeatable workflow turns the plan into work that can be carried out reliably.";
      startingPrompt = "Map the work from start to finish, assign ownership, and identify the capacity limit, handoffs, and failure points.";
      completionCriteria = [
         "The workflow is mapped from start to finish",
         "Ownership and handoffs are clear",
         "Capacity and reset or maintenance requirements are documented",
         "The workflow has been checked against the project’s constraints and quality standard",
      ];
   } else if (research) {
      goal = "Gather enough reliable evidence to support the decisions and deliverables that follow.";
      whyItMatters = nextTitle
         ? `The evidence standard must be met before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, or later commitments may rest on weak or unavailable information.`
         : "Reliable evidence separates viable directions from attractive assumptions.";
      startingPrompt = "Define the evidence standard, gather the strongest available sources or observations, and note what remains uncertain.";
      completionCriteria = [
         "The evidence or source standard is clear",
         "The required facts, sources, interviews, or observations have been collected",
         "Conflicts, gaps, and uncertainty are documented",
         "The evidence is strong enough to support the next decision",
      ];
   } else if (validation) {
      goal = "Test the result under realistic conditions and use the evidence to decide what should change.";
      whyItMatters = "The project needs real evidence before it expands, closes, or commits to permanent upgrades.";
      startingPrompt = "Run the result in realistic conditions, record what worked and failed, and compare the evidence with the success criteria.";
      completionCriteria = [
         "The result has been used or tested in realistic conditions",
         "Performance, quality, effort, and failure points are recorded",
         "The evidence has been compared with the success criteria",
         "The next decision—continue, revise, expand, or stop—is recorded",
      ];
   } else if (buildOrCreate) {
      goal = "Create the first complete, usable result that satisfies the confirmed requirements.";
      whyItMatters = nextTitle
         ? `A usable result must exist before ${nextTitle.replace(/^./, (character) => character.toLowerCase())}, so validation can test the real experience instead of a partial concept.`
         : "A complete first result turns the plan into something that can be used and reviewed.";
      startingPrompt = "Build the smallest complete version that includes the required capabilities and can be used end to end.";
      completionCriteria = [
         "The required first-version capabilities are present",
         "The result can be used from start to finish",
         "Required safety, accessibility, reliability, or quality controls are in place",
         "Known issues and deferred work are recorded",
      ];
   }

   const criteriaFromQuestions = milestoneQuestions.map((question) => `A supported answer is recorded for: ${question.replace(/[.?]+$/, "")}`);
   completionCriteria = uniqueProjectIntakeStatements([...completionCriteria, ...criteriaFromQuestions], 10);

   return {
      goal: sanitizeProjectSummary(goal),
      whyItMatters: sanitizeProjectSummary(whyItMatters),
      startingPrompt: sanitizeProjectSummary(startingPrompt),
      decisions: uniqueProjectIntakeStatements(relatedDecisions, 12),
      openQuestions: uniqueProjectIntakeStatements(milestoneQuestions, 12),
      dependencies: previousTitle ? [sanitizeProjectTitle(previousTitle)] : [],
      completionCriteria: completionCriteria.length
         ? completionCriteria
         : [sanitizeProjectSummary(`A concrete result exists for ${cleanTitle.toLowerCase()}`), sanitizeProjectSummary("The result has been checked against the project goal, constraints, and next dependency")],
   };
}

function getMilestoneDefaultGoal(title: string) {
   const clean = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   return clean ? `Produce a clear, reviewable result for ${clean.toLowerCase()}.` : "Produce a clear, reviewable result for this milestone.";
}

function getMilestoneDefaultWhyItMatters(title: string, index: number) {
   const clean = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   return index === 0 ? `This comes first because ${clean.toLowerCase()} sets the standard for the work that follows.` : `${clean} closes a dependency the next milestone relies on.`;
}

function getMilestoneDefaultStartingPrompt(title: string) {
   const clean = sanitizeProjectTitle(title).replace(/[.!?]+$/, "");
   return clean ? `Create the smallest concrete result that would prove ${clean.toLowerCase()} is ready to close.` : "Create the smallest concrete result that would prove this milestone is ready to close.";
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
   const titles = getProjectMilestoneCandidates(project);

   return titles.map((title, index) => {
      const metadata = buildGeneratedProjectMilestoneMetadata(project, title, index, titles);

      return {
         id: createProjectMilestoneId(project.id, title, index),
         title,
         status: index === 0 ? "active" : "waiting",
         completed: false,
         goal: metadata.goal,
         whyItMatters: metadata.whyItMatters,
         startingPrompt: metadata.startingPrompt,
         workingContent: "",
         decisions: metadata.decisions,
         openQuestions: metadata.openQuestions,
         dependencies: metadata.dependencies,
         completionCriteria: metadata.completionCriteria,
         completionEvidence: [],
         order: index + 1,
         createdAt: now,
         updatedAt: now,
      };
   });
}

function sanitizeProjectMilestones(value: unknown, project: ProjectLibraryItem): ProjectMilestone[] {
   if (!Array.isArray(value)) {
      return getDefaultProjectMilestones(project);
   }

   const now = getNow();
   const rawTitles = value
      .filter((item) => item && typeof item === "object")
      .map((item: any) => sanitizeProjectTitle(item.title))
      .filter(Boolean)
      .slice(0, 12);

   const milestones = value
      .filter((item) => item && typeof item === "object")
      .map((item: any, index) => {
         const title = sanitizeProjectTitle(item.title);
         const completed = Boolean(item.completed) || item.status === "complete";
         const status = getMilestoneStatus(item.status, completed);
         const metadata = buildGeneratedProjectMilestoneMetadata(project, title, index, rawTitles);

         return {
            id: sanitizeProjectPlainText(item.id, 180) || createProjectMilestoneId(project.id, title, index),
            title,
            status,
            completed: status === "complete",
            completedAt: isValidProjectTimestamp(item.completedAt) ? item.completedAt : status === "complete" ? now : undefined,
            goal: sanitizeProjectSummary(item.goal) || metadata.goal,
            whyItMatters: sanitizeProjectSummary(item.whyItMatters) || metadata.whyItMatters,
            startingPrompt: sanitizeProjectSummary(item.startingPrompt) || metadata.startingPrompt,
            workingContent: sanitizeProjectBody(item.workingContent),
            decisions: Array.isArray(item.decisions) ? uniqueProjectIntakeStatements([...item.decisions.map((entry: unknown) => sanitizeProjectSummary(String(entry))), ...metadata.decisions], 40) : metadata.decisions,
            openQuestions: Array.isArray(item.openQuestions)
               ? uniqueProjectIntakeStatements(
                    [
                       ...getScopedMilestoneQuestions(
                          title,
                          item.openQuestions.map((entry: unknown) => sanitizeProjectSummary(String(entry))),
                       ),
                       ...metadata.openQuestions,
                    ],
                    40,
                 )
               : metadata.openQuestions,
            dependencies: Array.isArray(item.dependencies) ? uniqueProjectIntakeStatements([...item.dependencies.map((entry: unknown) => sanitizeProjectSummary(String(entry))), ...metadata.dependencies], 16) : metadata.dependencies,
            completionCriteria: Array.isArray(item.completionCriteria)
               ? uniqueProjectIntakeStatements(
                    [
                       ...item.completionCriteria
                          .map((entry: unknown) => sanitizeProjectSummary(String(entry)))
                          .filter((entry: string) => {
                             if (!isGeneratedProjectCriterionCompatible(title, entry)) return false;
                             if (!/^A supported answer is recorded for:/i.test(entry)) return true;
                             return metadata.completionCriteria.some((criterion) => getProjectIntakeSemanticOverlap(criterion, entry) >= 0.72);
                          }),
                       ...metadata.completionCriteria,
                    ],
                    40,
                 )
               : metadata.completionCriteria,
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

   const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);

   const projectSelectorRef = useRef<HTMLDivElement | null>(null);

   const projectOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

   function closeProjectSelector() {
      setProjectSelectorOpen(false);
   }

   function selectProjectFromLibrary(projectId: string) {
      const project = projectLibrary.find((item) => item.id === projectId) || null;

      setSelectedProjectId(projectId);

      if (project) {
         writeActiveProjectSelection(project);
      }

      closeProjectSelector();
   }

   function focusProjectOption(index: number) {
      const optionCount = projectLibrary.length;

      if (!optionCount) {
         return;
      }

      const wrappedIndex = (index + optionCount) % optionCount;

      window.requestAnimationFrame(() => {
         projectOptionRefs.current[wrappedIndex]?.focus();
      });
   }

   function openProjectSelectorAndFocusActive() {
      const activeIndex = Math.max(
         0,
         projectLibrary.findIndex((project) => project.id === activeProject?.id),
      );

      setProjectSelectorOpen(true);
      focusProjectOption(activeIndex);
   }

   useEffect(() => {
      if (!projectSelectorOpen) {
         return;
      }

      function handlePointerDown(event: MouseEvent) {
         if (!projectSelectorRef.current?.contains(event.target as Node)) {
            closeProjectSelector();
         }
      }

      function handleEscape(event: KeyboardEvent) {
         if (event.key === "Escape") {
            closeProjectSelector();
         }
      }

      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleEscape);

      return () => {
         document.removeEventListener("mousedown", handlePointerDown);
         document.removeEventListener("keydown", handleEscape);
      };
   }, [projectSelectorOpen]);

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
               dependencies: milestone.dependencies,
               completionCriteria: milestone.completionCriteria,
               completionEvidence: milestone.completionEvidence,
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
            dependencies: milestone.dependencies,
            completionCriteria: milestone.completionCriteria,
            completionEvidence: milestone.completionEvidence,
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
                    dependencies: Array.isArray(draft.dependencies)
                       ? draft.dependencies
                            .map((item) => sanitizeProjectSummary(item))
                            .filter(Boolean)
                            .slice(0, 16)
                       : milestone.dependencies,
                    completionCriteria: Array.isArray(draft.completionCriteria)
                       ? draft.completionCriteria
                            .map((item) => sanitizeProjectSummary(item))
                            .filter(Boolean)
                            .slice(0, 40)
                       : milestone.completionCriteria,
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
      const allTitles = [...tracking.milestones.map((milestone) => milestone.title), title];
      const metadata = buildGeneratedProjectMilestoneMetadata(project, title, tracking.milestones.length, allTitles);
      const milestones = normalizeMilestoneStatuses([
         ...tracking.milestones,
         {
            id: createProjectMilestoneId(project.id, title, tracking.milestones.length),
            title,
            status: "waiting" as const,
            completed: false,
            goal: metadata.goal,
            whyItMatters: metadata.whyItMatters,
            startingPrompt: metadata.startingPrompt,
            workingContent: "",
            decisions: metadata.decisions,
            openQuestions: metadata.openQuestions,
            dependencies: metadata.dependencies,
            completionCriteria: metadata.completionCriteria,
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

         const nextLibrary = readProjectLibrary();
         const savedProject = nextLibrary.find((project) => sanitizeProjectTitle(project.title).toLowerCase() === cleanTitle.toLowerCase()) || null;
         const shouldFocusCreatedProject = item.source === "manual-generated";

         if (shouldFocusCreatedProject && savedProject) {
            // A newly generated project becomes the workspace focus immediately.
            // Persist the same selection before the library refresh so Projects,
            // MemoryEngine, and AIDock switch together without a manual dropdown change.
            setSelectedProjectId(savedProject.id);
            writeActiveProjectSelection(savedProject);
         }

         if (item.source === "manual-generated") {
            if (savedProject) {
               const milestoneTitles = getProjectMilestoneCandidates(savedProject);
               const now = getNow();
               const milestones = milestoneTitles.map((title, index) => {
                  const metadata = buildGeneratedProjectMilestoneMetadata(savedProject, title, index, milestoneTitles);
                  return {
                     id: createProjectMilestoneId(savedProject.id, title, index),
                     title,
                     status: index === 0 ? ("active" as const) : ("waiting" as const),
                     completed: false,
                     goal: metadata.goal,
                     whyItMatters: metadata.whyItMatters,
                     startingPrompt: metadata.startingPrompt,
                     workingContent: "",
                     decisions: metadata.decisions,
                     openQuestions: metadata.openQuestions,
                     dependencies: metadata.dependencies,
                     completionCriteria: metadata.completionCriteria,
                     completionEvidence: [],
                     order: index + 1,
                     createdAt: now,
                     updatedAt: now,
                  };
               });

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

         setProjectLibrary(nextLibrary);

         if (shouldFocusCreatedProject && savedProject) {
            setSelectedProjectId(savedProject.id);
         }

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

                     <div ref={projectSelectorRef} className="relative">
                        <span id="saved-project-selector-label" className="sr-only">
                           Select the active saved project
                        </span>

                        <button
                           type="button"
                           aria-labelledby="saved-project-selector-label saved-project-selector-title"
                           aria-haspopup="listbox"
                           aria-expanded={projectSelectorOpen}
                           aria-controls="saved-project-selector-listbox"
                           onClick={() => setProjectSelectorOpen((open) => !open)}
                           onKeyDown={(event) => {
                              if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                                 event.preventDefault();
                                 openProjectSelectorAndFocusActive();
                              }
                           }}
                           className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-4 text-left shadow-sm outline-none transition hover:border-[var(--color-primary)]/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 sm:px-5"
                        >
                           <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                 <span id="saved-project-selector-title" className="truncate text-base font-semibold text-[var(--color-text-primary)]">
                                    {activeProject?.title || "Choose a project"}
                                 </span>

                                 <span className="rounded-full bg-[var(--color-surface-blue)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-primary)]">Current</span>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                                 <span>
                                    {projectLibrary.length} saved project
                                    {projectLibrary.length === 1 ? "" : "s"}
                                 </span>

                                 {activeProject && <span>Updated {getReadableProjectDate(activeProject.updatedAt)}</span>}
                              </div>

                              {activeProject?.latestSummary && <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">{getShortPreview(activeProject.latestSummary, 180)}</p>}
                           </div>

                           <ChevronDown aria-hidden="true" size={20} className={`shrink-0 text-[var(--color-primary)] transition-transform duration-200 ${projectSelectorOpen ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence>
                           {projectSelectorOpen && (
                              <motion.div
                                 initial={{ opacity: 0, y: -8, scale: 0.99 }}
                                 animate={{ opacity: 1, y: 0, scale: 1 }}
                                 exit={{ opacity: 0, y: -8, scale: 0.99 }}
                                 transition={{ duration: 0.16 }}
                                 className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-xl"
                              >
                                 <div className="border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">Project library</p>
                                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Choose a project to open its workspace.</p>
                                 </div>

                                 <div id="saved-project-selector-listbox" role="listbox" aria-labelledby="saved-project-selector-label" className="max-h-80 overflow-y-auto p-2">
                                    {projectLibrary.map((project, index) => {
                                       const selected = activeProject?.id === project.id;

                                       return (
                                          <button
                                             key={project.id}
                                             ref={(element) => {
                                                projectOptionRefs.current[index] = element;
                                             }}
                                             type="button"
                                             role="option"
                                             aria-selected={selected}
                                             onClick={() => selectProjectFromLibrary(project.id)}
                                             onKeyDown={(event) => {
                                                if (event.key === "ArrowDown") {
                                                   event.preventDefault();
                                                   focusProjectOption(index + 1);
                                                } else if (event.key === "ArrowUp") {
                                                   event.preventDefault();
                                                   focusProjectOption(index - 1);
                                                } else if (event.key === "Home") {
                                                   event.preventDefault();
                                                   focusProjectOption(0);
                                                } else if (event.key === "End") {
                                                   event.preventDefault();
                                                   focusProjectOption(projectLibrary.length - 1);
                                                } else if (event.key === "Escape") {
                                                   event.preventDefault();
                                                   closeProjectSelector();
                                                }
                                             }}
                                             className={`w-full rounded-xl px-3 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${selected ? "bg-[var(--color-surface-blue)]" : "hover:bg-[var(--color-bg)]"}`}
                                          >
                                             <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0 flex-1">
                                                   <div className="flex flex-wrap items-center gap-2">
                                                      <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{project.title}</span>
                                                      {selected && <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-primary)]">Open</span>}
                                                   </div>

                                                   {project.latestSummary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">{getShortPreview(project.latestSummary, 130)}</p>}
                                                </div>

                                                <span className="shrink-0 pt-0.5 text-xs text-[var(--color-text-secondary)]">{getReadableProjectDate(project.updatedAt)}</span>
                                             </div>
                                          </button>
                                       );
                                    })}
                                 </div>
                              </motion.div>
                           )}
                        </AnimatePresence>
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
                                                               { key: "completionCriteria", label: "Completion criteria", placeholder: "What must be true before this milestone is complete?" },
                                                               { key: "completionEvidence", label: "Recorded evidence", placeholder: "One verified result or supporting source per line" },
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

                                                            {(selectedMilestone.decisions.length > 0 || selectedMilestone.openQuestions.length > 0 || selectedMilestone.completionCriteria.length > 0 || selectedMilestone.completionEvidence.length > 0) && (
                                                               <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                                                  {[
                                                                     { label: "Decisions", items: selectedMilestone.decisions },
                                                                     { label: "Open questions", items: selectedMilestone.openQuestions },
                                                                     { label: "Completion criteria", items: selectedMilestone.completionCriteria },
                                                                     { label: "Recorded evidence", items: selectedMilestone.completionEvidence },
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
