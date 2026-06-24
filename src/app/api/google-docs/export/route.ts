import { NextResponse } from "next/server";

import { google } from "googleapis";

// ========================================
// ALLEVIN Google Docs Export API Route
// Purpose:
// Create a real Google Doc from a confirmed
// ALLEVIN Google Docs export object.
// Supports clean user-facing export mode.
// ========================================

interface GoogleDocsExportRequest {
   id: string;

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   documentMode?: "clean" | "structured";

   includeSummary?: boolean;

   includeMainContentHeading?: boolean;

   includeSuggestedNextStep?: boolean;

   includeWorkflowContext?: boolean;
}

interface ParsedExportBody {
   summary: string;

   mainContent: string;

   workflowContext: string;

   suggestedNextStep: string;
}

// ========================================
// Helpers
// ========================================

function getRequiredEnv(name: string) {
   const value = process.env[name];

   if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
   }

   return value;
}

function cleanText(value?: string) {
   return (value || "").replace(/\r/g, "").trim();
}

function normalizeLines(value: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
}

function normalizeParagraphs(value: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n");
}

function stripMarkdownHeadings(value: string) {
   return cleanText(value)
      .replace(/^#\s+/gm, "")
      .replace(/^##\s+/gm, "")
      .replace(/^###\s+/gm, "")
      .trim();
}

function escapeRegex(value: string) {
   return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMarkdownSection(body: string, heading: string) {
   const escapedHeading = escapeRegex(heading);

   const regex = new RegExp(`##\\s*${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");

   const match = body.match(regex);

   return cleanText(match?.[1]);
}

function getLabelSection(body: string, label: string, stopLabels: string[]) {
   const escapedLabel = escapeRegex(label);

   const stopPattern = stopLabels.map(escapeRegex).join("|");

   const regex = new RegExp(`(?:^|\\n)\\s*${escapedLabel}:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${stopPattern}):|$)`, "i");

   const match = body.match(regex);

   return cleanText(match?.[1]);
}

function removeInternalExportSections(body: string) {
   let cleaned = cleanText(body);

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

   return normalizeParagraphs(cleaned);
}

function extractCleanMainContent(body: string) {
   const cleanBody = cleanText(body);

   const mainContent = getLabelSection(cleanBody, "Main Content", ["Current Working View", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   const primaryFromMain = getLabelSection(mainContent, "Primary Content", ["Current Working View", "Focus", "Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (primaryFromMain) {
      return normalizeParagraphs(primaryFromMain);
   }

   const primaryContent = getLabelSection(cleanBody, "Primary Content", ["Current Working View", "Focus", "Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (primaryContent) {
      return normalizeParagraphs(primaryContent);
   }

   const focusFromMain = getLabelSection(mainContent, "Focus", ["Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (focusFromMain) {
      return removeInternalExportSections(focusFromMain);
   }

   const focusContent = getLabelSection(cleanBody, "Focus", ["Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (focusContent) {
      return removeInternalExportSections(focusContent);
   }

   if (mainContent) {
      return removeInternalExportSections(mainContent);
   }

   const markdownMainContent = getMarkdownSection(cleanBody, "Main Content");

   if (markdownMainContent) {
      return removeInternalExportSections(markdownMainContent);
   }

   return removeInternalExportSections(stripMarkdownHeadings(cleanBody));
}

function parseExportBody(body: string): ParsedExportBody {
   const summary = getMarkdownSection(body, "Summary") || getLabelSection(body, "Summary", ["Main Content", "Current Working View", "Workflow Context", "Suggested Next Step"]);

   const mainContent = extractCleanMainContent(body) || "No main content provided.";

   const workflowContext = getMarkdownSection(body, "Workflow Context") || getLabelSection(body, "Workflow Context", ["Suggested Next Step"]);

   const suggestedNextStep = getMarkdownSection(body, "Suggested Next Step") || getLabelSection(body, "Suggested Next Step", ["ALLEVIN Recommendation"]);

   return {
      summary: summary || "No summary provided.",

      mainContent,

      workflowContext,

      suggestedNextStep: suggestedNextStep || "Review this exported document and decide the next useful action.",
   };
}

function buildCleanDocumentText(title: string, body: string) {
   const mainContent = extractCleanMainContent(body);

   return `${title}\n\n${mainContent || "No document content provided."}\n`;
}

function buildStructuredDocumentText(
   title: string,
   parsed: ParsedExportBody,
   options: {
      includeSummary: boolean;
      includeMainContentHeading: boolean;
      includeWorkflowContext: boolean;
      includeSuggestedNextStep: boolean;
   },
) {
   const sections = [
      title,

      options.includeSummary ? ["Summary", normalizeLines(parsed.summary)].join("\n") : null,

      options.includeMainContentHeading ? ["Main Content", normalizeLines(parsed.mainContent)].join("\n") : normalizeLines(parsed.mainContent),

      options.includeWorkflowContext && parsed.workflowContext ? ["Workflow Context", normalizeLines(parsed.workflowContext)].join("\n") : null,

      options.includeSuggestedNextStep ? ["Suggested Next Step", normalizeLines(parsed.suggestedNextStep)].join("\n") : null,
   ].filter(Boolean);

   return `${sections.join("\n\n")}\n`;
}

function buildDocumentText(title: string, body: string, parsed: ParsedExportBody, payload: Partial<GoogleDocsExportRequest>) {
   const isCleanMode = payload.documentMode === "clean";

   if (isCleanMode) {
      return buildCleanDocumentText(title, body);
   }

   return buildStructuredDocumentText(title, parsed, {
      includeSummary: payload.includeSummary ?? true,

      includeMainContentHeading: payload.includeMainContentHeading ?? true,

      includeWorkflowContext: payload.includeWorkflowContext ?? true,

      includeSuggestedNextStep: payload.includeSuggestedNextStep ?? true,
   });
}

function findRanges(documentText: string, payload: Partial<GoogleDocsExportRequest>) {
   const title = documentText.split("\n")[0];

   const ranges: {
      label: string;
      startIndex: number;
      endIndex: number;
      type: "title" | "heading";
   }[] = [];

   function addRange(label: string, type: "title" | "heading") {
      const start = documentText.indexOf(label);

      if (start === -1) return;

      ranges.push({
         label,

         startIndex: start + 1,

         endIndex: start + label.length + 1,

         type,
      });
   }

   addRange(title, "title");

   if (payload.documentMode !== "clean") {
      if (payload.includeSummary ?? true) {
         addRange("Summary", "heading");
      }

      if (payload.includeMainContentHeading ?? true) {
         addRange("Main Content", "heading");
      }

      if (payload.includeWorkflowContext ?? true) {
         addRange("Workflow Context", "heading");
      }

      if (payload.includeSuggestedNextStep ?? true) {
         addRange("Suggested Next Step", "heading");
      }
   }

   return ranges;
}

export async function POST(request: Request) {
   try {
      const payload = (await request.json()) as Partial<GoogleDocsExportRequest>;

      const title = payload.title?.trim() || "ALLEVIN Export";

      const body = payload.body?.trim() || "";

      if (!body) {
         return NextResponse.json(
            {
               success: false,

               message: "No document body was provided.",
            },
            {
               status: 400,
            },
         );
      }

      // ========================================
      // OAuth Client
      // ========================================

      const oauth2Client = new google.auth.OAuth2(
         getRequiredEnv("GOOGLE_CLIENT_ID"),

         getRequiredEnv("GOOGLE_CLIENT_SECRET"),

         "https://developers.google.com/oauthplayground",
      );

      oauth2Client.setCredentials({
         refresh_token: getRequiredEnv("GOOGLE_REFRESH_TOKEN"),
      });

      const docs = google.docs({
         version: "v1",

         auth: oauth2Client,
      });

      // ========================================
      // Create Document
      // ========================================

      const createdDoc = await docs.documents.create({
         requestBody: {
            title,
         },
      });

      const documentId = createdDoc.data.documentId;

      if (!documentId) {
         return NextResponse.json(
            {
               success: false,

               message: "Google Docs did not return a document ID.",
            },
            {
               status: 500,
            },
         );
      }

      // ========================================
      // Build Document Content
      // ========================================

      const parsedBody = parseExportBody(body);

      const documentText = buildDocumentText(title, body, parsedBody, payload);

      const ranges = findRanges(documentText, payload);

      // ========================================
      // Insert Content
      // ========================================

      await docs.documents.batchUpdate({
         documentId,

         requestBody: {
            requests: [
               {
                  insertText: {
                     location: {
                        index: 1,
                     },

                     text: documentText,
                  },
               },

               ...ranges.map((range) => ({
                  updateTextStyle: {
                     range: {
                        startIndex: range.startIndex,

                        endIndex: range.endIndex,
                     },

                     textStyle: {
                        bold: true,
                     },

                     fields: "bold",
                  },
               })),

               ...ranges.map((range) => ({
                  updateParagraphStyle: {
                     range: {
                        startIndex: range.startIndex,

                        endIndex: range.endIndex,
                     },

                     paragraphStyle: {
                        namedStyleType: range.type === "title" ? "TITLE" : "HEADING_2",
                     },

                     fields: "namedStyleType",
                  },
               })),
            ],
         },
      });

      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      return NextResponse.json({
         success: true,

         documentId,

         documentTitle: title,

         documentUrl,

         exportedAt: Date.now(),

         message: payload.documentMode === "clean" ? "Live Google Docs export completed. A clean Google Doc was created in your Google Drive." : "Live Google Docs export completed. A formatted Google Doc was created in your Google Drive.",

         workflowId: payload.documentMode === "clean" ? undefined : payload.workflowId,

         originBoardItemId: payload.documentMode === "clean" ? undefined : payload.originBoardItemId,
      });
   } catch (error) {
      console.error("Google Docs export failed:", error);

      const message = error instanceof Error ? error.message : "Google Docs export route failed.";

      return NextResponse.json(
         {
            success: false,

            message,
         },
         {
            status: 500,
         },
      );
   }
}
