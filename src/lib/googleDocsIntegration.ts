// ========================================
// ALLEVIN Google Docs Integration Handler
// Purpose:
// Frontend bridge for Google Docs exports.
// Sends clean, user-facing document content
// to the ALLEVIN API route, then safely
// falls back to a local placeholder if needed.
//
// MK II Build 3.2:
// Supports export-polished document sections:
// Project Summary / Current Context / Key Progress /
// Recommended Next Step / Export Notes.
// ========================================

import { parsePolishedExportFromText, formatPolishedExportPayload, type RawIntegrationPayload } from "@/lib/exportFormatters";

export interface GoogleDocsExportInput {
   id: string;

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;
}

export interface GoogleDocsExportResult {
   success: boolean;

   documentId: string;

   documentTitle: string;

   documentUrl: string;

   exportedAt: number;

   message: string;
}

// ========================================
// Clean Export Payload
// ========================================

interface CleanGoogleDocsApiPayload {
   id: string;

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   documentMode: "clean";

   includeSummary: false;

   includeMainContentHeading: false;

   includeSuggestedNextStep: false;

   includeWorkflowContext: false;
}

// ========================================
// Text Helpers
// ========================================

function cleanText(value?: string) {
   return (value || "").replace(/\r/g, "").trim();
}

function normalizeSpacing(value: string) {
   return cleanText(value)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
}

function escapeRegex(value: string) {
   return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionByLabel(body: string, label: string, stopLabels: string[]) {
   const escapedLabel = escapeRegex(label);

   const stopPattern = stopLabels.map(escapeRegex).join("|");

   const regex = new RegExp(`(?:^|\\n)\\s*${escapedLabel}:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${stopPattern}):|$)`, "i");

   const match = body.match(regex);

   return normalizeSpacing(match?.[1] || "");
}

function hasExportPolishSections(body: string) {
   const cleanBody = normalizeSpacing(body).toLowerCase();

   return cleanBody.includes("project summary") && cleanBody.includes("current context") && (cleanBody.includes("key progress") || cleanBody.includes("main content")) && (cleanBody.includes("recommended next step") || cleanBody.includes("next step"));
}

function removeMarkdownHeadings(value: string) {
   return normalizeSpacing(value)
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*/g, "")
      .trim();
}

function removeTitleOnlyLinesFromPolishedBody(body: string, title?: string) {
   const cleanTitle = normalizeSpacing(title || "");

   if (!cleanTitle) {
      return body;
   }

   const lines = normalizeSpacing(body).split("\n");

   return normalizeSpacing(
      lines
         .filter((line, index) => {
            const cleanLine = normalizeSpacing(line);

            return !(index < 3 && cleanLine.toLowerCase() === cleanTitle.toLowerCase());
         })
         .join("\n"),
   );
}

function convertPolishedMarkdownToCleanBody(body: string, title?: string) {
   const cleanBody = removeTitleOnlyLinesFromPolishedBody(removeMarkdownHeadings(body), title);

   const projectSummary = extractSectionByLabel(cleanBody, "Project Summary", ["Current Context", "Key Progress", "Recommended Next Step", "Export Notes"]);
   const currentContext = extractSectionByLabel(cleanBody, "Current Context", ["Key Progress", "Recommended Next Step", "Export Notes"]);
   const keyProgress = extractSectionByLabel(cleanBody, "Key Progress", ["Recommended Next Step", "Export Notes"]);
   const recommendedNextStep = extractSectionByLabel(cleanBody, "Recommended Next Step", ["Export Notes"]);
   const exportNotes = extractSectionByLabel(cleanBody, "Export Notes", []);

   const sections = [
      projectSummary ? ["Project Summary", projectSummary] : null,
      currentContext ? ["Current Context", currentContext] : null,
      keyProgress ? ["Key Progress", keyProgress] : null,
      recommendedNextStep ? ["Recommended Next Step", recommendedNextStep] : null,
      exportNotes ? ["Export Notes", exportNotes] : null,
   ].filter(Boolean) as string[][];

   const seen = new Set<string>();

   const rendered = sections
      .filter(([label]) => {
         const key = label.toLowerCase();

         if (seen.has(key)) {
            return false;
         }

         seen.add(key);

         return true;
      })
      .map(([label, value]) => `${label}\n${normalizeSpacing(value)}`);

   return normalizeSpacing(rendered.join("\n\n"));
}

function dedupeFinalExportSections(body: string, title?: string) {
   let cleanBody = normalizeSpacing(body);

   const cleanTitle = normalizeSpacing(title || "");

   if (cleanTitle) {
      const lines = cleanBody.split("\n");

      cleanBody = normalizeSpacing(
         lines
            .filter((line, index) => {
               const cleanLine = normalizeSpacing(line).replace(/^#+\s*/, "");

               return !(index < 4 && cleanLine.toLowerCase() === cleanTitle.toLowerCase());
            })
            .join("\n"),
      );
   }

   const labels = ["Project Summary", "Current Context", "Key Progress", "Recommended Next Step", "Export Notes"];
   const parts: string[] = [];
   const seen = new Set<string>();

   labels.forEach((label, index) => {
      const nextLabels = labels.slice(index + 1);
      const value = extractSectionByLabel(cleanBody, label, nextLabels);

      if (value && !seen.has(label.toLowerCase())) {
         seen.add(label.toLowerCase());
         parts.push(`${label}\n${value}`);
      }
   });

   return parts.length ? normalizeSpacing(parts.join("\n\n")) : cleanBody;
}

function removeInternalExportSections(body: string) {
   let cleaned = normalizeSpacing(body);

   cleaned = cleaned.replace(/(?:^|\n)\s*Summary\s*[\s\S]*?(?=\n\s*Main Content\s*$|\n\s*Main Content:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Current Working View:\s*[\s\S]*?(?=\n\s*Workflow Context\s*$|\n\s*Workflow Context:|\n\s*Suggested Next Step\s*$|\n\s*Suggested Next Step:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Workflow Context\s*[\s\S]*?(?=\n\s*Suggested Next Step\s*$|\n\s*Suggested Next Step:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Suggested Next Step\s*[\s\S]*$/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Useful Context:\s*[\s\S]*?(?=\n\s*Next Step:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Next Step:\s*[\s\S]*$/im, "");

   cleaned = cleaned
      .replace(/^Summary\s*$/gim, "")
      .replace(/^No summary provided\.\s*$/gim, "")
      .replace(/^Main Content\s*$/gim, "")
      .replace(/^Suggested Next Step\s*$/gim, "")
      .replace(/^Review this exported document and decide the next useful action\.\s*$/gim, "")
      .replace(/^Title:\s*$/gim, "")
      .replace(/^Primary Content:\s*$/gim, "")
      .replace(/^Current Working View:\s*$/gim, "")
      .replace(/^Focus:\s*$/gim, "")
      .replace(/^Useful Context:\s*$/gim, "")
      .replace(/^Next Step:\s*$/gim, "")
      .replace(/^Workflow Context\s*$/gim, "")
      .replace(/^Source:\s*.*$/gim, "")
      .replace(/^Thread ID:\s*.*$/gim, "")
      .replace(/^Board ID:\s*.*$/gim, "")
      .replace(/^Destination:\s*.*$/gim, "")
      .replace(/^Object Type:\s*.*$/gim, "")
      .replace(/^Confidence:\s*.*$/gim, "")
      .replace(/^Risk:\s*.*$/gim, "")
      .replace(/^Reason:\s*.*$/gim, "")
      .replace(/^ALLEVIN Recommendation:\s*[\s\S]*$/gim, "");

   return normalizeSpacing(cleaned);
}

function buildPolishedGoogleDocsBody(input: GoogleDocsExportInput) {
   const body = normalizeSpacing(input.body);

   if (!hasExportPolishSections(body)) {
      return "";
   }

   const parsedSections = parsePolishedExportFromText(body);

   const formatted = formatPolishedExportPayload(
      {
         destination: "google-docs",
         objectType: "project-summary",
         title: input.title,
         body,
         workflowId: input.workflowId,
         originBoardItemId: input.originBoardItemId,
         source: "system",
      } satisfies RawIntegrationPayload,
      parsedSections,
   );

   const cleanBody = convertPolishedMarkdownToCleanBody(formatted.formattedBody, input.title);

   return cleanBody || convertPolishedMarkdownToCleanBody(body, input.title);
}

function buildCleanGoogleDocsBody(input: GoogleDocsExportInput) {
   const polishedBody = buildPolishedGoogleDocsBody(input);

   if (polishedBody) {
      return polishedBody;
   }

   const body = normalizeSpacing(input.body);

   const mainContent = extractSectionByLabel(body, "Main Content", ["Current Working View", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   const primaryFromMain = extractSectionByLabel(mainContent, "Primary Content", ["Current Working View", "Focus", "Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (primaryFromMain) {
      return primaryFromMain;
   }

   const primaryContent = extractSectionByLabel(body, "Primary Content", ["Current Working View", "Focus", "Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (primaryContent) {
      return primaryContent;
   }

   const focusFromMain = extractSectionByLabel(mainContent, "Focus", ["Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (focusFromMain) {
      return removeInternalExportSections(focusFromMain);
   }

   const focusContent = extractSectionByLabel(body, "Focus", ["Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (focusContent) {
      return removeInternalExportSections(focusContent);
   }

   if (mainContent) {
      return removeInternalExportSections(mainContent);
   }

   return removeInternalExportSections(body);
}

function buildCleanGoogleDocsPayload(input: GoogleDocsExportInput): CleanGoogleDocsApiPayload {
   const safeTitle = input.title.trim() || "ALLEVIN Export";

   const cleanBody = dedupeFinalExportSections(buildCleanGoogleDocsBody(input), safeTitle) || "No document content provided.";

   return {
      id: input.id,

      title: safeTitle,

      body: cleanBody,

      // Keep these undefined for clean external docs.
      // ALLEVIN keeps workflow context internally in the Integrations Hub.
      workflowId: undefined,

      originBoardItemId: undefined,

      documentMode: "clean",

      includeSummary: false,

      includeMainContentHeading: false,

      includeSuggestedNextStep: false,

      includeWorkflowContext: false,
   };
}

// ========================================
// Local Placeholder Fallback
// ========================================

function createSlug(value: string) {
   return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
}

export async function createGoogleDocPlaceholder(input: GoogleDocsExportInput): Promise<GoogleDocsExportResult> {
   const cleanPayload = buildCleanGoogleDocsPayload(input);

   const safeTitle = cleanPayload.title.trim() || "ALLEVIN Export";

   const documentId = `mock-doc-${createSlug(safeTitle)}-${Date.now()}`;

   return {
      success: true,

      documentId,

      documentTitle: safeTitle,

      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,

      exportedAt: Date.now(),

      message: "Google Docs local placeholder export completed. Live API connection will replace this handler later.",
   };
}

// ========================================
// API Route Bridge
// ========================================

export async function createGoogleDocViaApi(input: GoogleDocsExportInput): Promise<GoogleDocsExportResult> {
   const cleanPayload = buildCleanGoogleDocsPayload(input);

   const response = await fetch("/api/google-docs/export", {
      method: "POST",

      headers: {
         "Content-Type": "application/json",
      },

      body: JSON.stringify(cleanPayload),
   });

   const data = await response.json();

   if (!response.ok || !data.success) {
      throw new Error(data.message || "Google Docs API export failed.");
   }

   return {
      success: true,

      documentId: data.documentId,

      documentTitle: data.documentTitle || cleanPayload.title,

      documentUrl: data.documentUrl,

      exportedAt: data.exportedAt || Date.now(),

      message: data.message || "Google Doc created successfully.",
   };
}

// ========================================
// Main Export Function
// Used by IntegrationAdapterLayer
// ========================================

export async function createGoogleDoc(input: GoogleDocsExportInput): Promise<GoogleDocsExportResult> {
   try {
      return await createGoogleDocViaApi(input);
   } catch {
      return await createGoogleDocPlaceholder(input);
   }
}
