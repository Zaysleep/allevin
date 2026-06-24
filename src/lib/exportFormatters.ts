// ========================================
// ALLEVIN Export Formatters
// Purpose:
// Convert ALLEVIN workflow objects into
// cleaner destination-ready export previews
// before live integrations are connected.
//
// MK II Build 3.2:
// Adds an export-polish structure that can be used by the
// Light LLM Helper while keeping deterministic formatting
// as the safe fallback.
// ========================================

export type IntegrationDestination = "google-docs" | "notes" | "calendar" | "tasks" | "drive";

export type IntegrationObjectType = "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review";

export type IntegrationSource = "canvas" | "research" | "task" | "board" | "intel" | "system" | "manual";

export interface RawIntegrationPayload {
   destination: IntegrationDestination;

   objectType: IntegrationObjectType;

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   source: IntegrationSource;
}

export interface FormattedIntegrationPayload extends RawIntegrationPayload {
   formattedTitle: string;

   formattedBody: string;

   summary: string;

   suggestedNextStep: string;
}

export interface ExportPolishInput {
   title: string;

   rawBody: string;

   destination: IntegrationDestination;

   objectType: IntegrationObjectType;

   source: IntegrationSource;

   summary: string;

   workflowContext: string;

   suggestedNextStep: string;

   deterministicPreview: string;
}

export interface ExportDocumentSections {
   documentTitle: string;

   projectSummary: string;

   currentContext: string;

   keyProgress: string;

   recommendedNextStep: string;

   exportNotes: string;
}

// ========================================
// Helpers
// ========================================

function cleanText(value?: string) {
   return (value || "").replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function getFallbackTitle(payload: RawIntegrationPayload) {
   const title = cleanText(payload.title);

   if (title) {
      return title;
   }

   switch (payload.objectType) {
      case "canvas-draft":
         return "Canvas Draft";

      case "research-note":
         return "Research Note";

      case "project-summary":
         return "Project Summary";

      case "task-action":
         return "Task Action";

      case "workflow-review":
         return "Workflow Review";

      default:
         return "ALLEVIN Export";
   }
}

function getDestinationLabel(destination: IntegrationDestination) {
   switch (destination) {
      case "google-docs":
         return "Google Docs";

      case "notes":
         return "Notes Vault";

      case "calendar":
         return "Calendar";

      case "tasks":
         return "Task Vault";

      case "drive":
         return "Drive";

      default:
         return "Export";
   }
}

function getObjectTypeLabel(objectType: IntegrationObjectType) {
   switch (objectType) {
      case "canvas-draft":
         return "Canvas Draft";

      case "research-note":
         return "Research Note";

      case "project-summary":
         return "Project Summary";

      case "task-action":
         return "Task Action";

      case "workflow-review":
         return "Workflow Review";

      default:
         return "ALLEVIN Work";
   }
}

function getShortSummary(body: string) {
   const cleanBody = cleanText(body);

   if (!cleanBody) {
      return "No summary available yet.";
   }

   const focus = extractSection(cleanBody, "Focus");

   if (focus) {
      return compactText(focus).length > 180 ? `${compactText(focus).slice(0, 180)}...` : compactText(focus);
   }

   const firstUsefulLine = cleanBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !isFormattingLabel(line))
      .find(Boolean);

   if (!firstUsefulLine) {
      return "No summary available yet.";
   }

   return firstUsefulLine.length > 180 ? `${firstUsefulLine.slice(0, 180)}...` : firstUsefulLine;
}

function getSuggestedNextStep(payload: RawIntegrationPayload) {
   const extractedNextStep = extractSection(payload.body, "Next Step");

   if (extractedNextStep) {
      return compactText(extractedNextStep);
   }

   if (payload.destination === "google-docs") {
      return "Review the document preview, then confirm when it is ready to become a Google Doc.";
   }

   if (payload.destination === "notes") {
      return "Save this as a lightweight note for future recall.";
   }

   if (payload.destination === "calendar") {
      return "Review the purpose and timing before creating a calendar block.";
   }

   if (payload.destination === "tasks") {
      return "Confirm this should become a clear next action.";
   }

   if (payload.destination === "drive") {
      return "Review whether this should be stored as a project file.";
   }

   return "Review this export before sending it forward.";
}

function getWorkflowContext(payload: RawIntegrationPayload) {
   const lines = [
      payload.source ? `Source: ${payload.source}` : null,
      `Destination: ${getDestinationLabel(payload.destination)}`,
      `Object type: ${getObjectTypeLabel(payload.objectType)}`,
      payload.workflowId ? `Thread ID: ${payload.workflowId}` : null,
      payload.originBoardItemId ? `Board ID: ${payload.originBoardItemId}` : null,
   ].filter(Boolean);

   return lines.join("\n");
}

function isFormattingLabel(value?: string) {
   const lower = compactText(value).toLowerCase();

   return ["focus:", "useful context:", "next step:", "summary:", "main content:", "workflow context:", "suggested next step:"].includes(lower);
}

function extractSection(text: string, label: string) {
   const pattern = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:Focus|Useful Context|Next Step|Summary|Main Content|Workflow Context|Suggested Next Step|Project Summary|Current Context|Key Progress|Recommended Next Step|Export Notes)\\s*:|$)`,
      "i",
   );

   const match = text.match(pattern);

   return cleanText(match?.[1]);
}

function stripMarkdownHeading(value?: string) {
   return cleanText(value)
      .replace(/^#+\s*/gm, "")
      .trim();
}

function getCleanMainContent(body: string) {
   const cleanBody = cleanText(body);

   if (!cleanBody) {
      return "No content provided.";
   }

   const focus = extractSection(cleanBody, "Focus");

   if (focus) {
      return focus;
   }

   const mainContent = extractSection(cleanBody, "Main Content");

   if (mainContent) {
      return mainContent;
   }

   return cleanBody;
}

function getUsefulContext(body: string, payload: RawIntegrationPayload) {
   const usefulContext = extractSection(body, "Useful Context");

   const workflowContext = getWorkflowContext(payload);

   return [usefulContext, workflowContext].filter(Boolean).join("\n");
}

function buildExportDocumentSections(payload: RawIntegrationPayload): ExportDocumentSections {
   const title = getFallbackTitle(payload);

   const mainContent = getCleanMainContent(payload.body);

   const usefulContext = getUsefulContext(payload.body, payload);

   const summary = getShortSummary(payload.body);

   const nextStep = getSuggestedNextStep(payload);

   return {
      documentTitle: title,

      projectSummary: summary,

      currentContext: usefulContext || `Prepared from ${payload.source} for ${getDestinationLabel(payload.destination)}.`,

      keyProgress: mainContent,

      recommendedNextStep: nextStep,

      exportNotes: "Prepared by ALLEVIN MK II. Review the content before final export.",
   };
}

function renderGoogleDocsDocument(sections: ExportDocumentSections) {
   return [
      `# ${sections.documentTitle}`,

      `## Project Summary\n${sections.projectSummary}`,

      `## Current Context\n${sections.currentContext}`,

      `## Key Progress\n${sections.keyProgress}`,

      `## Recommended Next Step\n${sections.recommendedNextStep}`,

      `## Export Notes\n${sections.exportNotes}`,
   ].join("\n\n");
}

function renderNotesDocument(sections: ExportDocumentSections) {
   return [`Note: ${sections.documentTitle}`, `Summary:\n${sections.projectSummary}`, `Context:\n${sections.currentContext}`, `Details:\n${sections.keyProgress}`, `Next:\n${sections.recommendedNextStep}`].join("\n\n");
}

function renderCalendarDocument(sections: ExportDocumentSections) {
   return [
      `Event Title:\n${sections.documentTitle}`,
      `Purpose:\n${sections.projectSummary}`,
      `Preparation Notes:\n${sections.keyProgress}`,
      `Suggested Duration:\n30 minutes`,
      `Related Context:\n${sections.currentContext}`,
      `Next:\n${sections.recommendedNextStep}`,
   ].join("\n\n");
}

function renderTaskDocument(sections: ExportDocumentSections) {
   return [`Action:\n${sections.documentTitle}`, `Why it matters:\n${sections.projectSummary}`, `Current Context:\n${sections.currentContext}`, `Action Details:\n${sections.keyProgress}`, `Next:\n${sections.recommendedNextStep}`].join("\n\n");
}

function renderDriveDocument(sections: ExportDocumentSections) {
   return [`File Name:\n${sections.documentTitle}`, `File Summary:\n${sections.projectSummary}`, `File Content:\n${sections.keyProgress}`, `Workflow Context:\n${sections.currentContext}`, `Next:\n${sections.recommendedNextStep}`].join("\n\n");
}

function formatWithSections(payload: RawIntegrationPayload, sections: ExportDocumentSections): FormattedIntegrationPayload {
   let formattedBody = "";

   switch (payload.destination) {
      case "google-docs":
         formattedBody = renderGoogleDocsDocument(sections);
         break;

      case "notes":
         formattedBody = renderNotesDocument(sections);
         break;

      case "calendar":
         formattedBody = renderCalendarDocument(sections);
         break;

      case "tasks":
         formattedBody = renderTaskDocument(sections);
         break;

      case "drive":
         formattedBody = renderDriveDocument(sections);
         break;

      default:
         formattedBody = renderGoogleDocsDocument(sections);
         break;
   }

   return {
      ...payload,

      title: sections.documentTitle,

      formattedTitle: sections.documentTitle,

      formattedBody,

      summary: sections.projectSummary,

      suggestedNextStep: sections.recommendedNextStep,
   };
}

// ========================================
// Export Polish Prep
// ========================================

export function prepareExportPolishInput(payload: RawIntegrationPayload): ExportPolishInput {
   const deterministicPreview = formatIntegrationPayloadDeterministic(payload);

   return {
      title: deterministicPreview.formattedTitle,

      rawBody: cleanText(payload.body),

      destination: payload.destination,

      objectType: payload.objectType,

      source: payload.source,

      summary: deterministicPreview.summary,

      workflowContext: getWorkflowContext(payload),

      suggestedNextStep: deterministicPreview.suggestedNextStep,

      deterministicPreview: deterministicPreview.formattedBody,
   };
}

export function formatPolishedExportPayload(payload: RawIntegrationPayload, polished?: Partial<ExportDocumentSections>): FormattedIntegrationPayload {
   const deterministicSections = buildExportDocumentSections(payload);

   const sections: ExportDocumentSections = {
      documentTitle: cleanText(polished?.documentTitle) || deterministicSections.documentTitle,

      projectSummary: cleanText(polished?.projectSummary) || deterministicSections.projectSummary,

      currentContext: cleanText(polished?.currentContext) || deterministicSections.currentContext,

      keyProgress: cleanText(polished?.keyProgress) || deterministicSections.keyProgress,

      recommendedNextStep: cleanText(polished?.recommendedNextStep) || deterministicSections.recommendedNextStep,

      exportNotes: cleanText(polished?.exportNotes) || deterministicSections.exportNotes,
   };

   return formatWithSections(payload, sections);
}

export function parsePolishedExportFromText(value?: string): Partial<ExportDocumentSections> {
   const text = stripMarkdownHeading(value);

   if (!text) {
      return {};
   }

   return {
      documentTitle: extractSection(text, "Document Title") || extractSection(text, "Title"),

      projectSummary: extractSection(text, "Project Summary") || extractSection(text, "Summary"),

      currentContext: extractSection(text, "Current Context") || extractSection(text, "Useful Context"),

      keyProgress: extractSection(text, "Key Progress") || extractSection(text, "Main Content") || extractSection(text, "Focus"),

      recommendedNextStep: extractSection(text, "Recommended Next Step") || extractSection(text, "Next Step"),

      exportNotes: extractSection(text, "Export Notes"),
   };
}

// ========================================
// Destination Formatters
// ========================================

function formatForGoogleDocs(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   return formatWithSections(payload, buildExportDocumentSections(payload));
}

function formatForNotes(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   return formatWithSections(payload, buildExportDocumentSections(payload));
}

function formatForCalendar(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   return formatWithSections(payload, buildExportDocumentSections(payload));
}

function formatForTasks(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   return formatWithSections(payload, buildExportDocumentSections(payload));
}

function formatForDrive(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   return formatWithSections(payload, buildExportDocumentSections(payload));
}

// ========================================
// Main Formatter
// ========================================

export function formatIntegrationPayloadDeterministic(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   switch (payload.destination) {
      case "google-docs":
         return formatForGoogleDocs(payload);

      case "notes":
         return formatForNotes(payload);

      case "calendar":
         return formatForCalendar(payload);

      case "tasks":
         return formatForTasks(payload);

      case "drive":
         return formatForDrive(payload);

      default:
         return formatForGoogleDocs(payload);
   }
}

export function formatIntegrationPayload(payload: RawIntegrationPayload): FormattedIntegrationPayload {
   return formatIntegrationPayloadDeterministic(payload);
}
