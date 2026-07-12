// ========================================
// ALLEVIN MK VII Project Intelligence Engine
// Purpose:
// Convert Projects, Canvas, roadmap, status,
// requirements, evidence, and materials into
// one conservative project-lead packet.
// ========================================

import type { ParsedProjectDocument } from "@/lib/allevinProjectMemory";

export type ProjectBuildStatus = "not-started" | "in-progress" | "ready-for-review" | "blocked" | "completed" | "unknown";

export type ProjectBuildStatusSource = "explicit" | "inferred" | "default";

export type ProjectType = "software" | "research" | "writing" | "planning" | "checklist" | "general";

export type ProjectReasoningProfile = ProjectType;

export type ProjectSignalSource = "project" | "canvas" | "roadmap" | "material" | "inference";

export type ProjectEvidenceKind = "status" | "requirement" | "deliverable" | "success-criterion" | "source" | "material" | "completion" | "feedback" | "decision" | "draft" | "milestone";

export type ProjectDependencyState = "satisfied" | "unsatisfied" | "unknown";

export type ProjectChecklistStatus = "not-started" | "in-progress" | "completed";

export interface ProjectBuildStep {
   id: string;
   index: number;
   number: number;
   title: string;
   description: string;
   status: ProjectBuildStatus;
   statusSource: ProjectBuildStatusSource;
   completionSignals: string[];
   readinessCriteria: string[];
   dependencies: string[];
}

export interface ProjectMaterialInput {
   id?: string;
   projectTitle?: string;
   title?: string;
   type?: string;
   summary?: string;
   notes?: string;
   source?: string;
   interpretationSummary?: string;
   interpretationUsefulContext?: string;
   interpretationNextStep?: string;
   createdAt?: number;
   updatedAt?: number;
}

export interface ProjectMaterialSignal {
   id: string;
   title: string;
   type: string;
   summary: string;
   details: string;
   source: string;
   relevantBuildIds: string[];
   updatedAt: number;
}

export interface ProjectEvidenceSignal {
   id: string;
   kind: ProjectEvidenceKind;
   text: string;
   source: ProjectSignalSource;
   strength: "explicit" | "inferred";
   relatedBuildIds: string[];
}

export interface ProjectDependencySignal {
   id: string;
   text: string;
   source: ProjectSignalSource;
   state: ProjectDependencyState;
   relatedBuildIds: string[];
}

export interface ProjectRiskSignal {
   id: string;
   text: string;
   source: ProjectSignalSource;
   severity: "low" | "medium" | "high";
   relatedBuildIds: string[];
}

export interface ProjectChecklistItem {
   id: string;
   text: string;
   status: ProjectChecklistStatus;
   source: ProjectSignalSource;
}

export interface ProjectProfileSignals {
   currentStage: string;
   deliverable: string;
   researchQuestion: string;
   audience: string;
   currentDraft: string;
   revisionStage: string;
   requirements: string[];
   successCriteria: string[];
   sourceRequirements: string[];
   sourceCountRequired?: number;
   sourceCountAvailable: number;
   missingResearch: string[];
   outlineSections: string[];
   milestones: string[];
   timeline: string[];
   blockedItems: string[];
   priorities: string[];
   testerFeedback: string[];
   technicalDebt: string[];
   architecture: string[];
   decisions: string[];
   options: string[];
   assumptions: string[];
   constraints: string[];
   availableEvidence: string[];
   explicitDependencies: string[];
   knownRisks: string[];
   logistics: string[];
   checklistItems: ProjectChecklistItem[];
}

export interface ProjectReasoningProfileDetection {
   projectType: ProjectType;
   reasoningProfile: ProjectReasoningProfile;
   reason: string;
   confidence: number;
   scores: Record<ProjectType, number>;
}

export interface ProjectReadinessAssessment {
   state: "not-started" | "in-progress" | "needs-review" | "blocked" | "complete" | "unknown";
   reason: string;
   missingChecks: string[];
}

export interface ProjectIntelligencePacket {
   version: "MK VII";
   projectTitle: string;
   projectGoal: string;
   currentState: string;
   projectType: ProjectType;
   reasoningProfile: ProjectReasoningProfile;
   reasoningProfileReason: string;
   reasoningProfileConfidence: number;
   profileSignals: ProjectProfileSignals;
   buildOrder: ProjectBuildStep[];
   currentBuild?: ProjectBuildStep;
   nextBuild?: ProjectBuildStep;
   completedBuilds: ProjectBuildStep[];
   blockedBuilds: ProjectBuildStep[];
   materials: ProjectMaterialSignal[];
   evidence: ProjectEvidenceSignal[];
   dependencies: ProjectDependencySignal[];
   risks: ProjectRiskSignal[];
   readiness: ProjectReadinessAssessment;
   confidence: number;
   generatedAt: number;
}

export interface BuildProjectIntelligenceInput {
   title: string;
   projectDocument: ParsedProjectDocument;
   projectBody: string;
   canvasContent: string;
   materials?: ProjectMaterialInput[];
}

interface StructuredSection {
   key: string;
   label: string;
   values: string[];
   source: "project" | "canvas";
}

interface InternalBuildCandidate extends ProjectBuildStep {
   sourceRank: number;
}

const PROJECT_TYPES: ProjectType[] = ["software", "research", "writing", "planning", "checklist", "general"];

// ========================================
// Text helpers
// ========================================

function cleanText(value?: string, limit = 100000) {
   const clean = (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function compactText(value?: string, limit = 1500) {
   return cleanText(value, limit)
      .replace(/\bsaving inside ALLEVIN whether\b/gi, "confirming whether")
      .replace(/\bsaving inside ALLEVIN if\b/gi, "confirming whether")
      .replace(/\s+/g, " ")
      .trim();
}

function cleanTitle(value?: string) {
   return compactText(value, 160).replace(/\n+/g, " ").trim();
}

function normalizeProjectKey(value?: string) {
   return cleanTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
}

function normalizeSectionKey(value?: string) {
   return compactText(value, 100)
      .toLowerCase()
      .replace(/[*_`#]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function getLines(value?: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
}

function stripListMarker(value?: string) {
   return compactText(value, 2000)
      .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
      .replace(/^\[[ xX]\]\s*/, "")
      .trim();
}

function uniqueStrings(values: string[], limit = 40) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values) {
      const clean = compactText(value, 1200);
      const key = clean.toLowerCase();

      if (!clean || seen.has(key)) {
         continue;
      }

      seen.add(key);
      result.push(clean);

      if (result.length >= limit) {
         break;
      }
   }

   return result;
}

function stableHash(value: string) {
   let hash = 2166136261;

   for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
   }

   return Math.abs(hash >>> 0).toString(36);
}

function createSafeId(value?: string, fallback = "signal") {
   const clean = compactText(value, 240)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .trim();

   if (clean) {
      return clean;
   }

   return `${fallback}-${stableHash(`${fallback}:${value || "empty"}`)}`;
}

function getDocumentField(projectDocument: ParsedProjectDocument, fieldNames: string[]) {
   const record = projectDocument as unknown as Record<string, unknown>;

   for (const fieldName of fieldNames) {
      const value = record[fieldName];

      if (typeof value === "string" && compactText(value)) {
         return compactText(value, 4000);
      }

      if (Array.isArray(value)) {
         const combined = value.filter((item): item is string => typeof item === "string").join("\n");

         if (compactText(combined)) {
            return compactText(combined, 4000);
         }
      }
   }

   return "";
}

function hasPhrase(text: string, phrases: string[]) {
   const lower = text.toLowerCase();
   return phrases.some((phrase) => lower.includes(phrase.toLowerCase()));
}

function countMatches(text: string, pattern: RegExp) {
   return Array.from(text.matchAll(pattern)).length;
}

// ========================================
// Structured project parsing
// ========================================

function parseStructuredSections(value: string, source: "project" | "canvas") {
   const lines = cleanText(value).split("\n");
   const sections: StructuredSection[] = [];
   let activeSection: StructuredSection | undefined;

   const startSection = (label: string, inlineValue = "") => {
      const key = normalizeSectionKey(label);

      if (!key) {
         return;
      }

      activeSection = {
         key,
         label: cleanTitle(label),
         values: [],
         source,
      };

      if (compactText(inlineValue)) {
         activeSection.values.push(stripListMarker(inlineValue));
      }

      sections.push(activeSection);
   };

   for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
         continue;
      }

      const plainBuildHeading = trimmed.match(/^(?:[-*]\s*)?(?:\[[ xX]\]\s*)?(?:build|phase|step|milestone)\s+\d+(?:\s*[—–:-]\s*|\s+).+$/i);

      if (plainBuildHeading) {
         activeSection = undefined;
         continue;
      }

      const markdownHeading = trimmed.match(/^#{1,6}\s+(.+?)(?:\s*:\s*(.*))?$/);

      if (markdownHeading) {
         startSection(markdownHeading[1], markdownHeading[2] || "");
         continue;
      }

      const boldLabel = trimmed.match(/^\*\*([^*:\n]{2,80})\s*:?\*\*\s*:?\s*(.*)$/);

      if (boldLabel) {
         startSection(boldLabel[1], boldLabel[2] || "");
         continue;
      }

      const labeledLine = trimmed.match(/^([A-Za-z][A-Za-z0-9 &'’/()+_-]{1,64})\s*:\s*(.*)$/);

      if (labeledLine) {
         startSection(labeledLine[1], labeledLine[2] || "");
         continue;
      }

      if (activeSection) {
         activeSection.values.push(stripListMarker(trimmed));
      }
   }

   return sections;
}

function getSections(projectBody: string, canvasContent: string) {
   return [...parseStructuredSections(projectBody, "project"), ...parseStructuredSections(canvasContent, "canvas")];
}

function sectionMatches(section: StructuredSection, aliases: string[]) {
   return aliases.some((alias) => {
      const normalizedAlias = normalizeSectionKey(alias);

      return section.key === normalizedAlias || section.key.startsWith(`${normalizedAlias} `) || normalizedAlias.startsWith(`${section.key} `);
   });
}

function getSectionItems(sections: StructuredSection[], aliases: string[], limit = 30) {
   const values = sections
      .filter((section) => sectionMatches(section, aliases))
      .flatMap((section) => section.values)
      .flatMap((value) =>
         value
            .split(/\n|;(?![^()]*\))/)
            .map((item) => stripListMarker(item))
            .filter(Boolean),
      );

   return uniqueStrings(values, limit);
}

function getSectionText(sections: StructuredSection[], aliases: string[], limit = 3000) {
   return compactText(getSectionItems(sections, aliases, 20).join(" "), limit);
}

function findLabeledValue(value: string, labels: string[]) {
   const lines = cleanText(value).split("\n");

   for (const rawLine of lines) {
      const line = rawLine.trim();

      for (const label of labels) {
         const pattern = new RegExp(`^(?:[-*]\\s*)?(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\*\\*)?\\s*:\\s*(.+)$`, "i");

         const match = line.match(pattern);

         if (match?.[1]) {
            return compactText(match[1], 2000);
         }
      }
   }

   return "";
}

function getLabeledBlockItems(value: string, labels: string[], limit = 20) {
   const lines = cleanText(value).split("\n");
   const normalizedLabels = labels.map((label) => normalizeSectionKey(label));
   const values: string[] = [];
   let collecting = false;

   for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
         continue;
      }

      const labelMatch = line.match(/^(?:[-*]\s*)?(?:\*\*)?([A-Za-z][A-Za-z0-9 &'’/()+_-]{1,64})(?:\*\*)?\s*:\s*(.*)$/);

      if (labelMatch) {
         const labelKey = normalizeSectionKey(labelMatch[1]);
         collecting = normalizedLabels.includes(labelKey);

         if (collecting && compactText(labelMatch[2])) {
            values.push(
               ...labelMatch[2]
                  .split(/[;,]/)
                  .map((item) => stripListMarker(item))
                  .filter(Boolean),
            );
         }

         continue;
      }

      if (/^(?:build|phase|step|milestone)\s+\d+/i.test(line.replace(/^#{1,6}\s*/, ""))) {
         collecting = false;
         continue;
      }

      if (collecting) {
         values.push(stripListMarker(line));
      }
   }

   return uniqueStrings(values, limit);
}

// ========================================
// Project-type and reasoning-profile detection
// ========================================

function normalizeExplicitProjectType(value: string): ProjectType | undefined {
   const lower = compactText(value, 500).toLowerCase();

   if (!lower) {
      return undefined;
   }

   if (hasPhrase(lower, ["software", "engineering", "development", "web app", "application", "coding", "product build"])) {
      return "software";
   }

   if (hasPhrase(lower, ["research", "school", "academic", "study", "literature review"])) {
      return "research";
   }

   if (hasPhrase(lower, ["writing", "essay", "article", "report", "script", "documentation", "content"])) {
      return "writing";
   }

   if (hasPhrase(lower, ["planning", "plan", "event", "trip", "logistics", "schedule", "launch plan"])) {
      return "planning";
   }

   if (hasPhrase(lower, ["checklist", "to-do", "todo", "task list"])) {
      return "checklist";
   }

   if (lower.includes("general")) {
      return "general";
   }

   return undefined;
}

export function detectProjectReasoningProfile(input: { title: string; projectDocument: ParsedProjectDocument; projectBody: string; canvasContent: string; materials?: ProjectMaterialInput[] }): ProjectReasoningProfileDetection {
   const combined = cleanText([input.title, input.projectBody, input.canvasContent, getDocumentField(input.projectDocument, ["type", "projectType", "category", "goal", "currentState"])].filter(Boolean).join("\n\n"), 80000);

   const lower = combined.toLowerCase();
   const scores: Record<ProjectType, number> = {
      software: 0,
      research: 0,
      writing: 0,
      planning: 0,
      checklist: 0,
      general: 1,
   };

   const explicitTypeValue = findLabeledValue(combined, ["Project Type", "Type", "Category"]) || getDocumentField(input.projectDocument, ["projectType", "type", "category"]);

   const explicitType = normalizeExplicitProjectType(explicitTypeValue);

   if (explicitType) {
      scores[explicitType] += 18;
   }

   const softwareSignals: Array<[string[], number]> = [
      [["current build", "next build", "completed builds"], 7],
      [["frontend", "backend", "api", "database", "component"], 3],
      [["typescript", "javascript", "react", "next.js", "supabase"], 4],
      [["architecture", "technical debt", "regression", "deployment"], 4],
      [["tester feedback", "bug", "feature", "implementation"], 3],
      [["github", "vercel", "code", "software"], 3],
   ];

   const researchSignals: Array<[string[], number]> = [
      [["research question"], 10],
      [["sources needed", "credible sources", "citations"], 8],
      [["evidence", "key findings", "methodology"], 4],
      [["literature", "study", "standards", "research"], 3],
      [["assignment goal", "success criteria"], 3],
   ];

   const writingSignals: Array<[string[], number]> = [
      [["current draft", "revision stage"], 8],
      [["audience", "outline", "sections"], 4],
      [["draft", "revise", "clarity", "tone"], 3],
      [["essay", "article", "report", "brief", "script"], 3],
      [["introduction", "conclusion", "thesis"], 2],
   ];

   const planningSignals: Array<[string[], number]> = [
      [["milestones", "timeline", "logistics"], 7],
      [["blocked items", "dependencies", "priority"], 5],
      [["schedule", "deadline", "budget"], 3],
      [["plan", "planning", "coordination"], 2],
   ];

   const checklistSignals: Array<[string[], number]> = [
      [["checklist", "task list", "to-do", "todo"], 8],
      [["done when", "acceptance checks"], 4],
   ];

   const addSignals = (projectType: ProjectType, groups: Array<[string[], number]>) => {
      for (const [phrases, weight] of groups) {
         for (const phrase of phrases) {
            if (lower.includes(phrase)) {
               scores[projectType] += weight;
            }
         }
      }
   };

   addSignals("software", softwareSignals);
   addSignals("research", researchSignals);
   addSignals("writing", writingSignals);
   addSignals("planning", planningSignals);
   addSignals("checklist", checklistSignals);

   const buildHeadingCount = countMatches(lower, /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:[-*][ \t]*)?(?:\[[ x]\][ \t]*)?(?:build|phase)[ \t]+\d+(?:(?:[ \t]*[—–:-][ \t]*)|[ \t]+)[^\n]+/gim);

   const checkboxCount = countMatches(lower, /(?:^|\n)\s*[-*]?\s*\[[ x]\]\s+/gim);

   if (buildHeadingCount >= 2) {
      scores.software += Math.min(12, buildHeadingCount * 2);
   }

   if (checkboxCount >= 3) {
      scores.checklist += Math.min(10, checkboxCount);
   }

   const materialText = (input.materials || [])
      .map((material) => `${material.type || ""} ${material.title || ""} ${material.summary || ""}`)
      .join(" ")
      .toLowerCase();

   if (hasPhrase(materialText, ["source", "article", "study", "research", "citation"])) {
      scores.research += 3;
   }

   if (hasPhrase(materialText, ["code", "screenshot", "test", "architecture"])) {
      scores.software += 2;
   }

   // Research should win over Writing when the project explicitly depends
   // on sources or a research question. Writing remains the profile once
   // drafting and revision are the primary state.
   if (lower.includes("research question") && hasPhrase(lower, ["sources needed", "credible sources", "evidence"])) {
      scores.research += 8;
   }

   const ranked = PROJECT_TYPES.map((projectType) => ({
      projectType,
      score: scores[projectType],
   })).sort((a, b) => b.score - a.score);

   const best = ranked[0];
   const second = ranked[1];
   const winningType = best.score >= 4 ? best.projectType : "general";
   const gap = Math.max(0, best.score - second.score);
   const confidence = Math.min(98, Math.max(winningType === "general" ? 35 : 50, 48 + best.score * 2 + gap * 3));

   const reason =
      explicitType === winningType
         ? `Project Type explicitly indicates ${winningType}.`
         : winningType === "software"
           ? "The project contains software-build, architecture, implementation, or testing signals."
           : winningType === "research"
             ? "The project is organized around a research question, sources, evidence, or findings."
             : winningType === "writing"
               ? "The project is organized around a draft, audience, sections, or revision work."
               : winningType === "planning"
                 ? "The project is organized around milestones, timing, dependencies, or logistics."
                 : winningType === "checklist"
                   ? "The project is primarily represented as ordered tasks or completion checks."
                   : "No stronger structured workflow was detected, so ALLEVIN should use the general profile.";

   return {
      projectType: winningType,
      reasoningProfile: winningType,
      reason,
      confidence: Math.round(confidence),
      scores,
   };
}

// ========================================
// Build-plan parsing
// ========================================

export function normalizeProjectBuildStatus(value?: string): ProjectBuildStatus {
   const lower = compactText(value).toLowerCase();

   if (!lower) {
      return "unknown";
   }

   if (["ready for review", "ready-to-review", "review ready", "needs review", "in review"].some((signal) => lower.includes(signal))) {
      return "ready-for-review";
   }

   if (["blocked", "waiting on", "cannot continue", "can't continue", "stalled", "paused by"].some((signal) => lower.includes(signal))) {
      return "blocked";
   }

   if (["not started", "not-started", "planned", "queued", "up next", "todo", "to do"].some((signal) => lower.includes(signal))) {
      return "not-started";
   }

   if (["in progress", "in-progress", "active", "working on", "underway", "started"].some((signal) => lower.includes(signal))) {
      return "in-progress";
   }

   if (["completed", "complete", "done", "finished", "shipped", "passed", "closed"].some((signal) => lower.includes(signal))) {
      return "completed";
   }

   return "unknown";
}

function getProjectBuildStatusFromSegment(segment: string) {
   const explicitStatus = segment.match(/(?:^|\n)\s*(?:status|build status|state)\s*:\s*([^\n]+)/i)?.[1];

   if (explicitStatus) {
      const status = normalizeProjectBuildStatus(explicitStatus);

      if (status !== "unknown") {
         return {
            status,
            statusSource: "explicit" as const,
         };
      }
   }

   const lines = getLines(segment);
   const firstLine = lines[0] || "";

   if (/^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?\[[xX]\]/.test(firstLine) || /✅|☑️/.test(firstLine)) {
      return {
         status: "completed" as const,
         statusSource: "explicit" as const,
      };
   }

   if (/^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?\[\s\]/.test(firstLine)) {
      return {
         status: "not-started" as const,
         statusSource: "explicit" as const,
      };
   }

   const titleStatus = firstLine.match(/\((completed|complete|done|in progress|blocked|ready for review|not started)\)\s*$/i)?.[1];

   if (titleStatus) {
      return {
         status: normalizeProjectBuildStatus(titleStatus),
         statusSource: "explicit" as const,
      };
   }

   const statusOnlyLine = lines.slice(1, 6).find((line) => /^(?:completed|complete|done|in progress|active|blocked|ready for review|not started)$/i.test(line));

   if (statusOnlyLine) {
      return {
         status: normalizeProjectBuildStatus(statusOnlyLine),
         statusSource: "inferred" as const,
      };
   }

   const narrativeStatusLine = lines
      .slice(1, 8)
      .filter((line) => !/^(?:completion criteria|ready when|readiness|done when|depends on|dependency|dependencies|success criteria)\s*:/i.test(line))
      .find((line) => /\b(?:build|phase|step|milestone|work)\b.{0,35}\b(?:is|remains|currently)\b.{0,20}\b(?:completed|complete|in progress|active|blocked|ready for review|not started)\b/i.test(line));

   if (narrativeStatusLine) {
      return {
         status: normalizeProjectBuildStatus(narrativeStatusLine),
         statusSource: "inferred" as const,
      };
   }

   return {
      status: "not-started" as const,
      statusSource: "default" as const,
   };
}

function extractBuildDescription(segment: string) {
   const controlLabels = ["status", "build status", "state", "completion criteria", "ready when", "readiness", "done when", "depends on", "dependency", "dependencies"];

   const projectLevelLabels = [
      "project type",
      "project goal",
      "assignment goal",
      "current status",
      "research question",
      "key topics",
      "sources needed",
      "deliverable",
      "success criteria",
      "audience",
      "outline",
      "sections",
      "milestones",
      "timeline",
      "blocked items",
      "priority",
      "tester feedback",
      "user feedback",
      "technical debt",
      "architecture",
      "decisions",
   ];

   const lines = getLines(segment).slice(1);
   const description: string[] = [];
   let insideControlBlock = false;

   for (const line of lines) {
      const labelMatch = line.match(/^(?:[-*]\s*)?([A-Za-z][A-Za-z0-9 &'’/()+_-]{1,64})\s*:\s*(.*)$/);

      if (labelMatch) {
         const key = normalizeSectionKey(labelMatch[1]);

         if (projectLevelLabels.includes(key)) {
            insideControlBlock = true;
            continue;
         }

         insideControlBlock = controlLabels.includes(key);

         if (!insideControlBlock && compactText(labelMatch[2])) {
            description.push(`${cleanTitle(labelMatch[1])}: ${compactText(labelMatch[2])}`);
         }

         continue;
      }

      if (!insideControlBlock) {
         description.push(stripListMarker(line));
      }
   }

   return compactText(description.join(" "), 2400);
}

function parseBuildCandidates(value: string, sourceRank: number) {
   const clean = cleanText(value);

   if (!clean) {
      return [] as InternalBuildCandidate[];
   }

   const buildPattern = /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:[-*][ \t]*)?(?:\[[ xX]\][ \t]*)?(?:build|phase|step|milestone)[ \t]+(\d+)(?:(?:[ \t]*[—–:-][ \t]*)|[ \t]+)([^\n]+)/gi;

   const matches = Array.from(clean.matchAll(buildPattern));

   return matches.map((match, index) => {
      const number = Number(match[1]);
      const rawTitle = cleanTitle(match[2]);
      const segmentStart = match.index || 0;
      const segmentEnd = index + 1 < matches.length ? matches[index + 1].index || clean.length : clean.length;
      const segment = cleanText(clean.slice(segmentStart, segmentEnd));
      const statusResult = getProjectBuildStatusFromSegment(segment);
      const completionSignals = getLabeledBlockItems(segment, ["completion criteria", "ready when", "readiness", "done when"]);
      const dependencies = getLabeledBlockItems(segment, ["depends on", "dependency", "dependencies"]);

      return {
         id: `build-${number}`,
         index,
         number,
         title:
            rawTitle
               .replace(/[✅☑️]/g, "")
               .replace(/\s*\((?:completed|complete|done|in progress|blocked|ready for review|not started)\)\s*$/i, "")
               .trim() || `Build ${number}`,
         description: extractBuildDescription(segment),
         status: statusResult.status,
         statusSource: statusResult.statusSource,
         completionSignals,
         readinessCriteria: completionSignals,
         dependencies,
         sourceRank,
      } satisfies InternalBuildCandidate;
   });
}

function getStatusSourceScore(source: ProjectBuildStatusSource) {
   if (source === "explicit") {
      return 3;
   }

   if (source === "inferred") {
      return 2;
   }

   return 1;
}

function mergeBuildCandidates(candidates: InternalBuildCandidate[]) {
   const byNumber = new Map<number, InternalBuildCandidate[]>();

   for (const candidate of candidates) {
      const existing = byNumber.get(candidate.number) || [];
      existing.push(candidate);
      byNumber.set(candidate.number, existing);
   }

   return Array.from(byNumber.entries())
      .map(([number, group]) => {
         const ranked = [...group].sort((a, b) => {
            const sourceDifference = b.sourceRank - a.sourceRank;

            if (sourceDifference !== 0) {
               return sourceDifference;
            }

            const statusDifference = getStatusSourceScore(b.statusSource) - getStatusSourceScore(a.statusSource);

            if (statusDifference !== 0) {
               return statusDifference;
            }

            return b.description.length - a.description.length;
         });

         const primary = ranked[0];
         const statusCandidate = [...group].sort((a, b) => {
            const sourceDifference = b.sourceRank - a.sourceRank;
            const statusDifference = getStatusSourceScore(b.statusSource) - getStatusSourceScore(a.statusSource);

            if (a.statusSource !== "default" || b.statusSource !== "default") {
               return statusDifference || sourceDifference;
            }

            return sourceDifference;
         })[0];

         return {
            id: `build-${number}`,
            index: 0,
            number,
            title: primary.title,
            description: ranked.find((candidate) => candidate.description)?.description || "",
            status: statusCandidate.status,
            statusSource: statusCandidate.statusSource,
            completionSignals: uniqueStrings(
               group.flatMap((candidate) => candidate.completionSignals),
               20,
            ),
            readinessCriteria: uniqueStrings(
               group.flatMap((candidate) => candidate.readinessCriteria),
               20,
            ),
            dependencies: uniqueStrings(
               group.flatMap((candidate) => candidate.dependencies),
               20,
            ),
         } satisfies ProjectBuildStep;
      })
      .filter((build) => build.number > 0)
      .sort((a, b) => a.number - b.number)
      .map((build, index) => ({
         ...build,
         index,
      }));
}

export function parseProjectBuildPlan(projectBody: string, canvasContent: string) {
   return mergeBuildCandidates([...parseBuildCandidates(projectBody, 1), ...parseBuildCandidates(canvasContent, 2)]);
}

// ========================================
// Materials-to-project alignment
// ========================================

export function getProjectMaterialSignals(projectTitle: string, buildOrder: ProjectBuildStep[], materials: ProjectMaterialInput[] = []) {
   const projectTitleKey = normalizeProjectKey(projectTitle);

   if (!projectTitleKey) {
      return [] as ProjectMaterialSignal[];
   }

   return materials
      .filter((material) => material && typeof material.title === "string")
      .filter((material) => normalizeProjectKey(material.projectTitle) === projectTitleKey)
      .map((material) => {
         const searchable = compactText(
            `${material.title || ""} ${material.summary || ""} ${material.notes || ""} ${material.source || ""} ${material.interpretationSummary || ""} ${material.interpretationUsefulContext || ""} ${material.interpretationNextStep || ""}`,
            8000,
         ).toLowerCase();

         const relevantBuildIds = buildOrder
            .filter((build) => {
               const buildNumberSignal = new RegExp(`\\b(?:build|phase|step|milestone)\\s+${build.number}\\b`, "i").test(searchable);

               const buildTitleKey = compactText(build.title).toLowerCase();
               const buildTitleSignal = buildTitleKey.length >= 5 && searchable.includes(buildTitleKey);

               return buildNumberSignal || buildTitleSignal;
            })
            .map((build) => build.id);

         const details = compactText([material.title, material.summary, material.notes, material.source, material.interpretationSummary, material.interpretationUsefulContext, material.interpretationNextStep].filter(Boolean).join("\n"), 12000);

         const fallbackSeed = `${projectTitle}:${material.title}:${material.createdAt || 0}`;

         return {
            id: createSafeId(material.id || stableHash(fallbackSeed), "material"),
            title: cleanTitle(material.title) || "Untitled material",
            type: compactText(material.type, 120) || "Reference",
            summary: compactText(material.interpretationSummary || material.interpretationUsefulContext || material.summary || material.notes || material.title, 2200),
            details,
            source: compactText(material.source, 500),
            relevantBuildIds,
            updatedAt:
               typeof material.updatedAt === "number" && Number.isFinite(material.updatedAt) && material.updatedAt > 0
                  ? material.updatedAt
                  : typeof material.createdAt === "number" && Number.isFinite(material.createdAt) && material.createdAt > 0
                    ? material.createdAt
                    : 0,
         } satisfies ProjectMaterialSignal;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
}

// ========================================
// Profile-specific signal extraction
// ========================================

function extractRequiredCount(values: string[]) {
   const text = values.join(" ").toLowerCase();
   const digitMatch = text.match(/\b(?:at least|minimum of|minimum|required|need(?:ed)?|find|collect)?\s*(\d{1,2})\s+(?:credible\s+|reliable\s+|academic\s+)?(?:sources?|references?|citations?|studies?|articles?)\b/i);

   if (digitMatch?.[1]) {
      return Number(digitMatch[1]);
   }

   const wordNumbers: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
   };

   const wordMatch = text.match(
      /\b(?:at least|minimum of|minimum|required|need(?:ed)?|find|collect)?\s*(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:credible\s+|reliable\s+|academic\s+)?(?:sources?|references?|citations?|studies?|articles?)\b/i,
   );

   return wordMatch?.[1] ? wordNumbers[wordMatch[1].toLowerCase()] : undefined;
}

function isLikelyResearchSource(material: ProjectMaterialSignal) {
   const searchable = `${material.type} ${material.title} ${material.summary} ${material.source}`.toLowerCase();

   return hasPhrase(searchable, ["source", "reference", "article", "study", "research", "citation", "journal", "paper", "report", "standard", "guideline", "pdf", "web page", "website", "link"]);
}

function extractChecklistItems(projectBody: string, canvasContent: string) {
   const sources: Array<{
      value: string;
      source: ProjectSignalSource;
   }> = [
      { value: projectBody, source: "project" },
      { value: canvasContent, source: "canvas" },
   ];
   const items: ProjectChecklistItem[] = [];

   for (const entry of sources) {
      for (const rawLine of cleanText(entry.value).split("\n")) {
         const line = rawLine.trim();
         const checkbox = line.match(/^(?:[-*]\s*)?\[([ xX])\]\s*(.+)$/);

         if (checkbox) {
            const text = compactText(checkbox[2]);

            if (text) {
               items.push({
                  id: `check-${stableHash(`${entry.source}:${text}`)}`,
                  text,
                  status: checkbox[1].toLowerCase() === "x" ? "completed" : "not-started",
                  source: entry.source,
               });
            }

            continue;
         }

         const statusItem = line.match(/^(?:[-*]\s*)?(.+?)\s+\((completed|done|in progress|active|not started|todo)\)\s*$/i);

         if (statusItem) {
            const normalized = normalizeProjectBuildStatus(statusItem[2]);

            items.push({
               id: `check-${stableHash(`${entry.source}:${statusItem[1]}`)}`,
               text: compactText(statusItem[1]),
               status: normalized === "completed" ? "completed" : normalized === "in-progress" ? "in-progress" : "not-started",
               source: entry.source,
            });
         }
      }
   }

   const seen = new Set<string>();

   return items
      .filter((item) => {
         const key = item.text.toLowerCase();

         if (seen.has(key)) {
            return false;
         }

         seen.add(key);
         return true;
      })
      .slice(0, 60);
}

function buildProfileSignals(projectDocument: ParsedProjectDocument, sections: StructuredSection[], projectBody: string, canvasContent: string, materials: ProjectMaterialSignal[]): ProjectProfileSignals {
   const currentStage = getSectionText(sections, ["Current Stage", "Current Status", "Project Status"]) || getDocumentField(projectDocument, ["currentStage", "currentState", "status"]);

   const deliverable = getSectionText(sections, ["Deliverable", "Deliverables", "Final Deliverable", "Expected Output", "Output"]);

   const researchQuestion = getSectionText(sections, ["Research Question", "Core Question", "Question"]);

   const audience = getSectionText(sections, ["Audience", "Target Audience", "Reader", "Readers", "Users"]);

   const currentDraft = getSectionText(sections, ["Current Draft", "Draft", "Draft Status"]);

   const revisionStage = getSectionText(sections, ["Revision Stage", "Editing Stage", "Review Stage"]);

   const requirements = getSectionItems(sections, ["Requirements", "Assignment Requirements", "Project Requirements", "Needed", "Must Include"]);

   const successCriteria = getSectionItems(sections, ["Success Criteria", "Acceptance Criteria", "Completion Criteria", "Done When"]);

   const sourceRequirements = getSectionItems(sections, ["Sources Needed", "Source Requirements", "Required Sources", "Evidence Needed", "Research Needed"]);

   const sourceCountRequired = extractRequiredCount([...sourceRequirements, ...requirements, deliverable]);

   const sourceCountAvailable = materials.filter(isLikelyResearchSource).length;

   const explicitMissingResearch = getSectionItems(sections, ["Missing Research", "Research Gaps", "Missing Evidence", "Open Questions"]);

   const missingResearch = uniqueStrings([
      ...explicitMissingResearch,
      ...(typeof sourceCountRequired === "number" && sourceCountAvailable < sourceCountRequired
         ? [`${sourceCountRequired - sourceCountAvailable} additional credible ${sourceCountRequired - sourceCountAvailable === 1 ? "source is" : "sources are"} still needed.`]
         : []),
   ]);

   const outlineSections = getSectionItems(sections, ["Outline", "Sections", "Document Structure", "Brief Structure", "Chapter Structure"]);

   const milestones = getSectionItems(sections, ["Milestones", "Roadmap", "Phases", "Major Steps"]);

   const timeline = getSectionItems(sections, ["Timeline", "Schedule", "Dates", "Deadlines"]);

   const blockedItems = getSectionItems(sections, ["Blocked Items", "Blockers", "Blocked", "Waiting On"]);

   const priorities = getSectionItems(sections, ["Priority", "Priorities", "Current Priority", "Focus"]);

   const testerFeedback = getSectionItems(sections, ["Tester Feedback", "User Feedback", "Review Feedback", "Feedback"]);

   const technicalDebt = getSectionItems(sections, ["Technical Debt", "Known Issues", "Deferred Work"]);

   const architecture = getSectionItems(sections, ["Architecture", "Technical Architecture", "System Design", "Tech Stack"]);

   const decisions = getSectionItems(sections, ["Decisions", "Decision", "Confirmed Direction", "Design Decisions"]);

   const options = getSectionItems(sections, ["Options Being Considered", "Options", "Alternatives", "Choices", "Approaches"]);

   const assumptions = getSectionItems(sections, ["Current Assumption", "Assumptions", "Working Assumption", "Hypothesis"]);

   const constraints = getSectionItems(sections, ["Constraints", "Limits", "Guardrails", "Requirements and Constraints"]);

   const availableEvidence = getSectionItems(sections, ["Available Evidence", "Current Evidence", "Evidence", "Known Facts", "Findings"]);

   const explicitDependencies = getSectionItems(sections, ["Dependencies", "Prerequisites", "Decision Gates", "Must Happen First"]);

   const knownRisks = getSectionItems(sections, ["Known Risks", "Risks", "Concerns", "Failure Modes"]);

   const logistics = getSectionItems(sections, ["Logistics", "Resources", "Equipment", "Budget"]);

   return {
      currentStage,
      deliverable,
      researchQuestion,
      audience,
      currentDraft,
      revisionStage,
      requirements,
      successCriteria,
      sourceRequirements,
      sourceCountRequired,
      sourceCountAvailable,
      missingResearch,
      outlineSections,
      milestones,
      timeline,
      blockedItems,
      priorities,
      testerFeedback,
      technicalDebt,
      architecture,
      decisions,
      options,
      assumptions,
      constraints,
      availableEvidence,
      explicitDependencies,
      knownRisks,
      logistics,
      checklistItems: extractChecklistItems(projectBody, canvasContent),
   };
}

// ========================================
// Current-build and readiness selection
// ========================================

export function selectCurrentProjectBuild(buildOrder: ProjectBuildStep[]) {
   return (
      buildOrder.find((build) => build.status === "in-progress") ||
      buildOrder.find((build) => build.status === "ready-for-review") ||
      buildOrder.find((build) => build.status === "blocked") ||
      buildOrder.find((build) => build.status === "not-started") ||
      buildOrder[buildOrder.length - 1]
   );
}

export function selectNextProjectBuild(buildOrder: ProjectBuildStep[], currentBuild?: ProjectBuildStep) {
   if (!currentBuild) {
      return buildOrder.find((build) => build.status !== "completed");
   }

   return buildOrder.find((build) => build.number > currentBuild.number && build.status !== "completed");
}

export function assessProjectBuildReadiness(currentBuild?: ProjectBuildStep, _materials: ProjectMaterialSignal[] = []): ProjectReadinessAssessment {
   if (!currentBuild) {
      return {
         state: "unknown",
         reason: "No ordered build plan was detected yet.",
         missingChecks: [],
      };
   }

   const missingChecks: string[] = [];

   if (currentBuild.statusSource === "default") {
      missingChecks.push(`Add an explicit status for Build ${currentBuild.number}.`);
   }

   if (!currentBuild.readinessCriteria.length) {
      missingChecks.push(`Define what must be true before Build ${currentBuild.number} is considered ready.`);
   }

   if (currentBuild.status === "blocked") {
      return {
         state: "blocked",
         reason: `Build ${currentBuild.number} is marked blocked and should not be treated as ready.`,
         missingChecks,
      };
   }

   if (currentBuild.status === "ready-for-review") {
      return {
         state: "needs-review",
         reason: `Build ${currentBuild.number} is ready for review, but it is not complete until its readiness checks pass.`,
         missingChecks,
      };
   }

   if (currentBuild.status === "completed") {
      return {
         state: "complete",
         reason: `Build ${currentBuild.number} is marked complete.`,
         missingChecks,
      };
   }

   if (currentBuild.status === "in-progress") {
      return {
         state: "in-progress",
         reason: `Build ${currentBuild.number} is the active build.`,
         missingChecks,
      };
   }

   return {
      state: "not-started",
      reason: `Build ${currentBuild.number} is the first unfinished build in the roadmap.`,
      missingChecks,
   };
}

function assessProfileReadiness(profile: ProjectReasoningProfile, profileSignals: ProjectProfileSignals, buildReadiness: ProjectReadinessAssessment): ProjectReadinessAssessment {
   if (profile === "software") {
      return buildReadiness;
   }

   if (profile === "research") {
      const missingChecks: string[] = [];

      if (!profileSignals.researchQuestion) {
         missingChecks.push("Define the research question.");
      }

      if (typeof profileSignals.sourceCountRequired === "number" && profileSignals.sourceCountAvailable < profileSignals.sourceCountRequired) {
         missingChecks.push(`Collect ${profileSignals.sourceCountRequired - profileSignals.sourceCountAvailable} more required ${profileSignals.sourceCountRequired - profileSignals.sourceCountAvailable === 1 ? "source" : "sources"}.`);
      }

      if (!profileSignals.deliverable) {
         missingChecks.push("Define the expected deliverable.");
      }

      if (profileSignals.blockedItems.length) {
         return {
            state: "blocked",
            reason: "The research project has an explicit blocker that should be resolved before advancing.",
            missingChecks: uniqueStrings([...profileSignals.blockedItems, ...missingChecks]),
         };
      }

      if (missingChecks.length) {
         return {
            state: profileSignals.currentStage ? "in-progress" : "not-started",
            reason: "The research structure is present, but required evidence or framing is still incomplete.",
            missingChecks,
         };
      }

      return {
         state: "in-progress",
         reason: "The research question, deliverable, and required evidence are present.",
         missingChecks: [],
      };
   }

   if (profile === "writing") {
      const missingChecks: string[] = [];

      if (!profileSignals.audience) {
         missingChecks.push("Clarify the intended audience.");
      }

      if (!profileSignals.currentDraft && !profileSignals.outlineSections.length) {
         missingChecks.push("Add an outline or current draft.");
      }

      if (profileSignals.blockedItems.length) {
         return {
            state: "blocked",
            reason: "The writing project has an explicit blocker that should be resolved before revision continues.",
            missingChecks: uniqueStrings([...profileSignals.blockedItems, ...missingChecks]),
         };
      }

      return {
         state: missingChecks.length ? "not-started" : "in-progress",
         reason: missingChecks.length ? "The writing project is missing enough structure to choose a reliable revision action." : "The writing project has enough audience and draft structure to guide the next revision.",
         missingChecks,
      };
   }

   if (profile === "planning") {
      const missingChecks: string[] = [];

      if (!profileSignals.milestones.length) {
         missingChecks.push("Define the major milestones.");
      }

      if (profileSignals.blockedItems.length) {
         return {
            state: "blocked",
            reason: "The plan contains blocked items that affect sequencing.",
            missingChecks: uniqueStrings([...profileSignals.blockedItems, ...missingChecks]),
         };
      }

      return {
         state: missingChecks.length ? "not-started" : "in-progress",
         reason: missingChecks.length
            ? "The plan is missing major outcome milestones."
            : profileSignals.timeline.length
              ? "The plan has milestones, timing, and dependency-aware structure."
              : "The plan has enough milestone and dependency structure to guide the next decision; timing can be added after the active decision gate is resolved.",
         missingChecks,
      };
   }

   if (profile === "checklist") {
      const items = profileSignals.checklistItems;

      if (!items.length) {
         return {
            state: "unknown",
            reason: "No checklist items were detected.",
            missingChecks: ["Add checklist items with completion states."],
         };
      }

      if (items.every((item) => item.status === "completed")) {
         return {
            state: "complete",
            reason: "Every detected checklist item is complete.",
            missingChecks: [],
         };
      }

      if (profileSignals.blockedItems.length) {
         return {
            state: "blocked",
            reason: "The checklist contains an explicit blocker.",
            missingChecks: profileSignals.blockedItems,
         };
      }

      return {
         state: "in-progress",
         reason: "The checklist contains unfinished work.",
         missingChecks: items
            .filter((item) => item.status !== "completed")
            .slice(0, 8)
            .map((item) => item.text),
      };
   }

   if (profileSignals.blockedItems.length) {
      return {
         state: "blocked",
         reason: "The project contains an explicit blocker.",
         missingChecks: profileSignals.blockedItems,
      };
   }

   return {
      state: profileSignals.currentStage ? "in-progress" : "unknown",
      reason: profileSignals.currentStage ? "A current project state is available." : "The project does not yet contain enough structured state to assess readiness.",
      missingChecks: profileSignals.currentStage ? [] : ["Add the current state and intended outcome."],
   };
}

// ========================================
// Evidence, dependency, and risk extraction
// ========================================

function buildEvidenceSignals(input: { currentState: string; profileSignals: ProjectProfileSignals; buildOrder: ProjectBuildStep[]; materials: ProjectMaterialSignal[] }) {
   const evidence: ProjectEvidenceSignal[] = [];
   const add = (kind: ProjectEvidenceKind, text: string, source: ProjectSignalSource, strength: "explicit" | "inferred" = "explicit", relatedBuildIds: string[] = []) => {
      const clean = compactText(text, 1400);

      if (!clean) {
         return;
      }

      evidence.push({
         id: `evidence-${stableHash(`${kind}:${source}:${clean}`)}`,
         kind,
         text: clean,
         source,
         strength,
         relatedBuildIds,
      });
   };

   add("status", input.currentState, "project");

   for (const requirement of input.profileSignals.requirements) {
      add("requirement", requirement, "canvas");
   }

   for (const deliverable of [input.profileSignals.deliverable]) {
      add("deliverable", deliverable, "canvas");
   }

   for (const criterion of input.profileSignals.successCriteria) {
      add("success-criterion", criterion, "canvas");
   }

   for (const sourceRequirement of input.profileSignals.sourceRequirements) {
      add("requirement", sourceRequirement, "canvas");
   }

   for (const feedback of input.profileSignals.testerFeedback) {
      add("feedback", feedback, "canvas");
   }

   for (const decision of input.profileSignals.decisions) {
      add("decision", decision, "canvas");
   }

   for (const option of input.profileSignals.options) {
      add("decision", `Option: ${option}`, "canvas");
   }

   for (const assumption of input.profileSignals.assumptions) {
      add("decision", `Assumption: ${assumption}`, "canvas");
   }

   for (const constraint of input.profileSignals.constraints) {
      add("requirement", `Constraint: ${constraint}`, "canvas");
   }

   for (const fact of input.profileSignals.availableEvidence) {
      add("status", `Available evidence: ${fact}`, "canvas");
   }

   add("draft", input.profileSignals.currentDraft, "canvas");

   for (const milestone of input.profileSignals.milestones) {
      add("milestone", milestone, "canvas");
   }

   for (const build of input.buildOrder) {
      if (build.status === "completed") {
         add("completion", `Build ${build.number}: ${build.title}`, "roadmap", build.statusSource === "explicit" ? "explicit" : "inferred", [build.id]);
      }
   }

   for (const material of input.materials) {
      add(
         isLikelyResearchSource(material) ? "source" : "material",
         material.details ? `${material.title}: ${material.details}` : material.summary ? `${material.title}: ${material.summary}` : material.title,
         "material",
         "explicit",
         material.relevantBuildIds,
      );
   }

   const seen = new Set<string>();

   return evidence
      .filter((item) => {
         const key = `${item.kind}:${item.text.toLowerCase()}`;

         if (seen.has(key)) {
            return false;
         }

         seen.add(key);
         return true;
      })
      .slice(0, 80);
}

function resolveDependencyState(text: string, buildOrder: ProjectBuildStep[]): ProjectDependencyState {
   const buildMatch = text.match(/\b(?:build|phase|step|milestone)\s+(\d+)\b/i);

   if (!buildMatch?.[1]) {
      return "unknown";
   }

   const referencedBuild = buildOrder.find((build) => build.number === Number(buildMatch[1]));

   if (!referencedBuild) {
      return "unknown";
   }

   return referencedBuild.status === "completed" ? "satisfied" : "unsatisfied";
}

function getDecisionTokens(value?: string) {
   return new Set(
      compactText(value, 5000)
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .filter((token) => token.length >= 4)
         .filter((token) => !["before", "deciding", "decision", "must", "should", "would", "could", "current", "existing", "project", "available", "practical"].includes(token)),
   );
}

function getDecisionOverlap(left?: string, right?: string) {
   const leftTokens = getDecisionTokens(left);
   const rightTokens = getDecisionTokens(right);
   let score = 0;

   for (const token of leftTokens) {
      if (rightTokens.has(token)) {
         score += 1;
      }
   }

   return score;
}

function isPurchaseGuardrailText(value?: string) {
   const lower = compactText(value).toLowerCase();

   return lower.includes("should not be purchased") || lower.includes("do not purchase") || lower.includes("before purchasing") || lower.includes("until the architecture is selected") || lower.includes("until the option is selected");
}

function inferExplicitDependencyState(dependency: string, materials: ProjectMaterialSignal[], availableEvidence: string[]): ProjectDependencyState {
   const confirmingSignals = ["confirmed", "successfully", "passed", "tested", "identified", "verified", "available", "works", "working", "reached", "negotiates", "no packet loss"];
   const unresolvedSignals = ["not tested", "not confirmed", "not identified", "unknown", "has not been tested", "has not been confirmed", "has not been identified", "still needs"];
   const dependencyLower = compactText(dependency).toLowerCase();

   if (unresolvedSignals.some((signal) => dependencyLower.includes(signal))) {
      return "unsatisfied";
   }

   const candidates = [...availableEvidence, ...materials.flatMap((material) => [material.title, material.summary, material.details])];

   if (isPurchaseGuardrailText(dependency)) {
      const decisionEvidence = compactText(candidates.join(" "), 36000);

      if (
         /architecture (?:is|was|has been) selected|confirmed architecture|wired access points are technically practical|strongest supported option|finalize the equipment list/i.test(decisionEvidence) ||
         (/successfully negotiates|throughput test|no packet loss/i.test(decisionEvidence) && /wired access point|wired wireless access point|existing ethernet/i.test(decisionEvidence))
      ) {
         return "satisfied";
      }

      return "unknown";
   }

   for (const candidate of candidates) {
      const lower = compactText(candidate, 5000).toLowerCase();
      const overlap = getDecisionOverlap(dependency, lower);

      const asksForIdentification = /\b(?:identify|identified|model|capability|supports?|poe capability)\b/i.test(dependency);
      const hasIdentificationFact = /\b(?:identified|model|supports?|does not support|non-poe|poe|gigabit|unmanaged|managed)\b/i.test(lower) || /\b(?:switch|router|cable|run)\s+is\b/i.test(lower);

      if (overlap >= 2 && !unresolvedSignals.some((signal) => lower.includes(signal)) && (confirmingSignals.some((signal) => lower.includes(signal)) || (asksForIdentification && hasIdentificationFact))) {
         return "satisfied";
      }
   }

   return "unknown";
}

function buildDependencySignals(input: { buildOrder: ProjectBuildStep[]; currentBuild?: ProjectBuildStep; profileSignals: ProjectProfileSignals; materials: ProjectMaterialSignal[] }) {
   const dependencies: ProjectDependencySignal[] = [];
   const add = (text: string, source: ProjectSignalSource, relatedBuildIds: string[] = [], state?: ProjectDependencyState) => {
      const clean = compactText(text, 1200);

      if (!clean) {
         return;
      }

      dependencies.push({
         id: `dependency-${stableHash(`${source}:${clean}`)}`,
         text: clean,
         source,
         state: state || resolveDependencyState(clean, input.buildOrder),
         relatedBuildIds,
      });
   };

   for (const build of input.buildOrder) {
      for (const dependency of build.dependencies) {
         add(dependency, "roadmap", [build.id]);
      }
   }

   for (const blockedItem of input.profileSignals.blockedItems) {
      add(blockedItem, "canvas", [], "unsatisfied");
   }

   for (const dependency of input.profileSignals.explicitDependencies) {
      add(dependency, "canvas", [], inferExplicitDependencyState(dependency, input.materials, input.profileSignals.availableEvidence));
   }

   if (typeof input.profileSignals.sourceCountRequired === "number" && input.profileSignals.sourceCountAvailable < input.profileSignals.sourceCountRequired) {
      add(`${input.profileSignals.sourceCountRequired} required sources must be available before evidence-based drafting; ${input.profileSignals.sourceCountAvailable} are currently available.`, "inference", [], "unsatisfied");
   }

   if (input.currentBuild) {
      const earlierUnfinished = input.buildOrder.filter((build) => build.number < input.currentBuild!.number && build.status !== "completed");

      for (const build of earlierUnfinished) {
         add(`Build ${build.number} remains unfinished before Build ${input.currentBuild.number}.`, "inference", [build.id, input.currentBuild.id], "unsatisfied");
      }
   }

   const seen = new Set<string>();

   return dependencies
      .filter((item) => {
         const key = item.text.toLowerCase();

         if (seen.has(key)) {
            return false;
         }

         seen.add(key);
         return true;
      })
      .slice(0, 50);
}

function buildRiskSignals(input: {
   profile: ProjectReasoningProfile;
   profileSignals: ProjectProfileSignals;
   buildOrder: ProjectBuildStep[];
   currentBuild?: ProjectBuildStep;
   dependencies: ProjectDependencySignal[];
   readiness: ProjectReadinessAssessment;
}) {
   const risks: ProjectRiskSignal[] = [];
   const add = (text: string, source: ProjectSignalSource, severity: "low" | "medium" | "high", relatedBuildIds: string[] = []) => {
      const clean = compactText(text, 1200);

      if (!clean) {
         return;
      }

      risks.push({
         id: `risk-${stableHash(`${source}:${severity}:${clean}`)}`,
         text: clean,
         source,
         severity,
         relatedBuildIds,
      });
   };

   for (const build of input.buildOrder.filter((candidate) => candidate.status === "blocked")) {
      add(`Build ${build.number} is blocked: ${build.title}.`, "roadmap", "high", [build.id]);
   }

   for (const dependency of input.dependencies.filter((candidate) => candidate.state === "unsatisfied")) {
      add(dependency.text, dependency.source, "high", dependency.relatedBuildIds);
   }

   for (const debt of input.profileSignals.technicalDebt) {
      add(debt, "canvas", "medium");
   }

   for (const knownRisk of input.profileSignals.knownRisks) {
      add(knownRisk, "canvas", "medium");
   }

   if (input.profile === "writing" && !input.profileSignals.audience) {
      add("The intended audience is not defined, which weakens revision decisions.", "inference", "medium");
   }

   if (input.profile === "planning" && !input.profileSignals.timeline.length) {
      add("The plan has no detected timeline, so milestone sequencing may be unreliable.", "inference", "medium");
   }

   for (const missingCheck of input.readiness.missingChecks.slice(0, 8)) {
      if (input.profile === "research" && /\bsources?\b/i.test(missingCheck) && typeof input.profileSignals.sourceCountRequired === "number" && input.profileSignals.sourceCountAvailable < input.profileSignals.sourceCountRequired) {
         continue;
      }

      add(missingCheck, "inference", "low");
   }

   const seen = new Set<string>();

   return risks
      .filter((item) => {
         const key = item.text.toLowerCase();

         if (seen.has(key)) {
            return false;
         }

         seen.add(key);
         return true;
      })
      .slice(0, 40);
}

function inferMaterialDrivenCurrentState(profile: ProjectReasoningProfile, declaredState: string, materials: ProjectMaterialSignal[]) {
   const latestMaterialText = compactText(
      materials
         .slice(0, 6)
         .flatMap((material) => [material.title, material.summary, material.details])
         .join(" "),
      36000,
   );

   if (profile === "planning" && latestMaterialText) {
      if (
         /post[- ]installation|installation is complete|final validation|validation has not passed|post-installation validation|test results/i.test(latestMaterialText) ||
         (/roaming/i.test(latestMaterialText) && /interruption|packet loss|latency|mbps|coverage/i.test(latestMaterialText))
      ) {
         return "Post-installation validation";
      }

      if (/audit|inspection|findings|assessment|existing cabling|ethernet run/i.test(latestMaterialText) && /architecture|option|access point|wired|practical|feasible|successfully negotiates|throughput/i.test(latestMaterialText)) {
         return "Architecture selection";
      }
   }

   return declaredState;
}

function getActivePlanningKnownRisks(currentState: string, knownRisks: string[], materials: ProjectMaterialSignal[]) {
   const state = compactText(currentState).toLowerCase();
   const materialText = compactText(
      materials
         .slice(0, 8)
         .flatMap((material) => [material.title, material.summary, material.details])
         .join(" "),
      42000,
   ).toLowerCase();

   const validationStage = state.includes("validation") || materialText.includes("installation is complete") || materialText.includes("post-installation") || materialText.includes("validation has not passed");

   const architectureSelected =
      validationStage ||
      state.includes("architecture selection") ||
      (/wired access point|two wired wireless access points|wired wi-fi 6 access points/i.test(materialText) && /technically practical|strongest supported option|architecture/i.test(materialText));

   if (validationStage) {
      const active = knownRisks.filter((risk) => {
         const lower = risk.toLowerCase();

         if (/buying mesh|ethernet backhaul|replacing the router|spending the full budget|before testing the simplest solution|equipment should not be purchased|switch model|poe capability|architecture is selected/.test(lower)) {
            return false;
         }

         return /placement|coverage|weak area|roaming|latency|packet loss|speed alone|interference|configuration|channel|transmit power/.test(lower);
      });

      return active.length ? active : ["Poor access-point placement or configuration may be causing the remaining weak area.", "Evaluating the network by speed alone can hide roaming, latency, or packet-loss problems."];
   }

   if (architectureSelected) {
      const active = knownRisks.filter((risk) => !/buying mesh|ethernet backhaul|replacing the router|equipment should not be purchased|switch model|poe capability/i.test(risk));

      return active.length ? active : ["Poor access-point placement could weaken an otherwise sound architecture.", "Buying expansion hardware without a current requirement could waste the remaining budget."];
   }

   return knownRisks;
}

// ========================================
// Packet builders
// ========================================

export function buildProjectIntelligencePacket(input: BuildProjectIntelligenceInput): ProjectIntelligencePacket {
   const sections = getSections(input.projectBody, input.canvasContent);
   const profileDetection = detectProjectReasoningProfile(input);
   const buildOrder = parseProjectBuildPlan(input.projectBody, input.canvasContent);
   const currentBuild = selectCurrentProjectBuild(buildOrder);
   const nextBuild = selectNextProjectBuild(buildOrder, currentBuild);
   const materials = getProjectMaterialSignals(input.title, buildOrder, input.materials);
   const rawProfileSignals = buildProfileSignals(input.projectDocument, sections, input.projectBody, input.canvasContent, materials);

   const projectGoal = compactText(input.projectDocument.goal) || getSectionText(sections, ["Project Goal", "Assignment Goal", "Goal", "Objective"]);

   const declaredCurrentState = compactText(input.projectDocument.currentState) || rawProfileSignals.currentStage;

   const currentState = inferMaterialDrivenCurrentState(profileDetection.reasoningProfile, declaredCurrentState, materials);

   const profileSignals: ProjectProfileSignals =
      profileDetection.reasoningProfile === "planning"
         ? {
              ...rawProfileSignals,
              knownRisks: getActivePlanningKnownRisks(currentState, rawProfileSignals.knownRisks, materials),
           }
         : rawProfileSignals;

   const buildReadiness = assessProjectBuildReadiness(currentBuild, materials);

   const readiness = assessProfileReadiness(profileDetection.reasoningProfile, profileSignals, buildReadiness);

   const evidence = buildEvidenceSignals({
      currentState,
      profileSignals,
      buildOrder,
      materials,
   });

   const dependencies = buildDependencySignals({
      buildOrder,
      currentBuild,
      profileSignals,
      materials,
   });

   const risks = buildRiskSignals({
      profile: profileDetection.reasoningProfile,
      profileSignals,
      buildOrder,
      currentBuild,
      dependencies,
      readiness,
   });

   const explicitStatusCount = buildOrder.filter((build) => build.statusSource === "explicit").length;

   const structuredSignalCount = [
      profileSignals.currentStage,
      profileSignals.deliverable,
      profileSignals.researchQuestion,
      profileSignals.audience,
      profileSignals.currentDraft,
      ...profileSignals.requirements,
      ...profileSignals.successCriteria,
      ...profileSignals.milestones,
      ...profileSignals.timeline,
   ].filter(Boolean).length;

   const confidence = Math.min(
      98,
      Math.round(
         30 +
            profileDetection.confidence * 0.25 +
            (projectGoal ? 8 : 0) +
            (currentState ? 7 : 0) +
            Math.min(buildOrder.length * 3, 15) +
            Math.min(explicitStatusCount * 3, 12) +
            Math.min(materials.length * 2, 10) +
            Math.min(structuredSignalCount * 2, 14) +
            Math.min(evidence.length, 8),
      ),
   );

   return {
      version: "MK VII",
      projectTitle: cleanTitle(input.title),
      projectGoal,
      currentState,
      projectType: profileDetection.projectType,
      reasoningProfile: profileDetection.reasoningProfile,
      reasoningProfileReason: profileDetection.reason,
      reasoningProfileConfidence: profileDetection.confidence,
      profileSignals,
      buildOrder,
      currentBuild,
      nextBuild,
      completedBuilds: buildOrder.filter((build) => build.status === "completed"),
      blockedBuilds: buildOrder.filter((build) => build.status === "blocked"),
      materials,
      evidence,
      dependencies,
      risks,
      readiness,
      confidence,
      generatedAt: Date.now(),
   };
}

export function getEmptyProjectIntelligencePacket(): ProjectIntelligencePacket {
   return {
      version: "MK VII",
      projectTitle: "",
      projectGoal: "",
      currentState: "",
      projectType: "general",
      reasoningProfile: "general",
      reasoningProfileReason: "No active project is available yet.",
      reasoningProfileConfidence: 0,
      profileSignals: {
         currentStage: "",
         deliverable: "",
         researchQuestion: "",
         audience: "",
         currentDraft: "",
         revisionStage: "",
         requirements: [],
         successCriteria: [],
         sourceRequirements: [],
         sourceCountAvailable: 0,
         missingResearch: [],
         outlineSections: [],
         milestones: [],
         timeline: [],
         blockedItems: [],
         priorities: [],
         testerFeedback: [],
         technicalDebt: [],
         architecture: [],
         decisions: [],
         options: [],
         assumptions: [],
         constraints: [],
         availableEvidence: [],
         explicitDependencies: [],
         knownRisks: [],
         logistics: [],
         checklistItems: [],
      },
      buildOrder: [],
      completedBuilds: [],
      blockedBuilds: [],
      materials: [],
      evidence: [],
      dependencies: [],
      risks: [],
      readiness: {
         state: "unknown",
         reason: "No active project is available yet.",
         missingChecks: [],
      },
      confidence: 0,
      generatedAt: Date.now(),
   };
}
