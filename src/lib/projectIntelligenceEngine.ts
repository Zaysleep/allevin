// ========================================
// ALLEVIN MK VIII Project Understanding Engine
// Purpose:
// Convert Projects, Working Notes, saved progress,
// materials, and project structure into one
// canonical senior project-lead understanding.
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

   // MK VIII milestone workspace context.
   goal?: string;
   whyItMatters?: string;
   startingPrompt?: string;
   workingContent?: string;
   decisions?: string[];
   openQuestions?: string[];
   order?: number;
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

export type ProjectMomentum = "definition" | "planning" | "decision" | "execution" | "validation" | "complete";

export interface ProjectLeadState {
   goal: string;
   situation: string;
   momentum: ProjectMomentum;
   nextMove: string;
   whyNow: string;
   afterNextMove: string;
   unresolvedWork: string[];
   blockers: string[];
   risks: string[];
   opportunities: string[];
}

export type ProjectUnderstandingMilestoneStatus = "waiting" | "active" | "needs-confirmation" | "complete";

export interface ProjectUnderstandingMilestone {
   id: string;
   title: string;
   status: ProjectUnderstandingMilestoneStatus;
   purpose: string;
   completionEvidence: string[];
   dependencies: string[];
   risks: string[];

   goal: string;
   whyItMatters: string;
   startingPrompt: string;
   workingContent: string;
   decisions: string[];
   openQuestions: string[];
   order: number;
}

export interface ProjectUnderstandingTimelineSignal {
   id: string;
   label: string;
   dateText: string;
   importance: "low" | "medium" | "high";
}

export interface ProjectUnderstandingDependency {
   id: string;
   before: string;
   after: string;
   reason: string;
   state: ProjectDependencyState;
}

export interface ProjectUnderstandingRisk {
   id: string;
   title: string;
   consequence: string;
   mitigation: string;
   severity: "low" | "medium" | "high";
}

export interface ProjectUnderstandingMaterial {
   id: string;
   title: string;
   usefulContext: string;
   relatedMilestones: string[];
   decisionsAffected: string[];
}

export type ProjectDecisionStatus = "confirmed" | "unresolved" | "assumed";

export interface ProjectEvidenceReference {
   sourceType: "project" | "milestone" | "material" | "conversation" | "inference";
   sourceId: string;
   quote: string;
}

export interface ProjectDecision {
   id: string;
   statement: string;
   status: ProjectDecisionStatus;
   evidence: ProjectEvidenceReference[];
   affects: string[];
}

export interface ProjectOption {
   id: string;
   name: string;
   advantages: string[];
   disadvantages: string[];
   dependencies: string[];
   risks: string[];
   fitWithGoal: string;
   evidence: ProjectEvidenceReference[];
}

export interface ProjectTension {
   id: string;
   sideA: string;
   sideB: string;
   consequence: string;
   decisionNeeded: string;
   evidence: ProjectEvidenceReference[];
}

export interface ProjectConstraint {
   id: string;
   statement: string;
   evidence: ProjectEvidenceReference[];
}

export interface ProjectSuccessCriterion {
   id: string;
   statement: string;
   satisfied: boolean;
   evidence: ProjectEvidenceReference[];
}

export interface ProjectUnderstanding {
   version: "MK VIII";
   goal: string;
   successState: string;
   situation: string;
   momentum: ProjectMomentum;
   milestones: ProjectUnderstandingMilestone[];
   activeMilestoneId?: string;
   timeline: ProjectUnderstandingTimelineSignal[];
   openWork: string[];
   completedWork: string[];
   decisions: string[];
   confirmedDecisions: ProjectDecision[];
   unresolvedDecisions: ProjectDecision[];
   assumptions: ProjectDecision[];
   options: ProjectOption[];
   tensions: ProjectTension[];
   constraints: ProjectConstraint[];
   successCriteria: ProjectSuccessCriterion[];
   dependencies: ProjectUnderstandingDependency[];
   risks: ProjectUnderstandingRisk[];
   materials: ProjectUnderstandingMaterial[];
   conversation: {
      currentTopic: string;
      recentDecisions: string[];
      unresolvedQuestions: string[];
      lastMeaningfulMove: string;
   };
   recommendedMove: string;
   whyNow: string;
   whatItUnlocks: string;
   afterThis: string;
   watchOuts: string[];
   confidence: number;
   updatedAt: number;
}

export interface ProjectIntelligencePacket {
   version: "MK VIII";
   projectTitle: string;
   projectGoal: string;
   currentState: string;
   projectUnderstanding: ProjectUnderstanding;
   projectLeadState: ProjectLeadState;
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

export interface ProjectMilestoneWorkspaceInput {
   id: string;
   title: string;
   status?: string;
   goal?: string;
   whyItMatters?: string;
   startingPrompt?: string;
   workingContent?: string;
   decisions?: string[];
   openQuestions?: string[];
   completionEvidence?: string[];
   dependencies?: string[];
   order?: number;
}

export interface BuildProjectIntelligenceInput {
   title: string;
   projectDocument: ParsedProjectDocument;
   projectBody: string;
   canvasContent: string;
   materials?: ProjectMaterialInput[];
   milestoneWorkspaces?: ProjectMilestoneWorkspaceInput[];
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

function buildProjectPlanFromMilestoneWorkspaces(workspaces: ProjectMilestoneWorkspaceInput[] = []) {
   return workspaces
      .filter((workspace) => workspace && workspace.status !== "archived")
      .map((workspace, index) => {
         const statusText = compactText(workspace.status).toLowerCase();
         const status: ProjectBuildStatus =
            statusText === "complete" || statusText === "completed"
               ? "completed"
               : statusText === "needs-review" || statusText === "ready-for-review"
                 ? "ready-for-review"
                 : statusText === "blocked"
                   ? "blocked"
                   : statusText === "active" || statusText === "in-progress"
                     ? "in-progress"
                     : "not-started";

         return {
            id: createSafeId(workspace.id || `milestone-${index + 1}`, "milestone"),
            index,
            number: index + 1,
            title: cleanTitle(workspace.title) || `Milestone ${index + 1}`,
            description: compactText(workspace.goal || workspace.whyItMatters || workspace.startingPrompt, 1200),
            status,
            statusSource: "explicit" as const,
            completionSignals: uniqueStrings(workspace.completionEvidence || [], 20),
            readinessCriteria: uniqueStrings(workspace.completionEvidence || [], 20),
            dependencies: uniqueStrings(workspace.dependencies || [], 20),
            goal: compactText(workspace.goal, 1500),
            whyItMatters: compactText(workspace.whyItMatters, 1500),
            startingPrompt: compactText(workspace.startingPrompt, 1500),
            workingContent: cleanText(workspace.workingContent, 100000),
            decisions: uniqueStrings(workspace.decisions || [], 40),
            openQuestions: uniqueStrings(workspace.openQuestions || [], 40),
            order: typeof workspace.order === "number" && Number.isFinite(workspace.order) ? workspace.order : index + 1,
         } satisfies ProjectBuildStep;
      })
      .sort((left, right) => (left.order || left.number) - (right.order || right.number))
      .map((item, index) => ({ ...item, index, number: index + 1 }));
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

   const explicitMissingResearch = getSectionItems(sections, ["Missing Research", "Research Gaps", "Missing Evidence"]);

   const missingResearch = uniqueStrings([
      ...explicitMissingResearch,
      ...(typeof sourceCountRequired === "number" && sourceCountAvailable < sourceCountRequired
         ? [`${sourceCountRequired - sourceCountAvailable} additional credible ${sourceCountRequired - sourceCountAvailable === 1 ? "source is" : "sources are"} still needed.`]
         : []),
   ]);

   const outlineSections = getSectionItems(sections, ["Outline", "Sections", "Document Structure", "Brief Structure", "Chapter Structure"]);

   const milestones = getSectionItems(sections, ["Initial Milestones", "Milestones", "Progress Points", "Roadmap", "Phases", "Major Steps"]);

   const timeline = getSectionItems(sections, ["Timeline", "Schedule", "Dates", "Deadlines"]);

   const blockedItems = getSectionItems(sections, ["Blocked Items", "Blockers", "Blocked", "Waiting On"]);

   const priorities = getSectionItems(sections, ["Recommended Starting Point", "Recommended Move", "Starting Point", "Priority", "Priorities", "Current Priority", "Focus"]);

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

   const inferredOpenWork = uniqueStrings([...profileSignals.priorities, ...profileSignals.milestones, ...profileSignals.logistics, ...profileSignals.requirements].filter(Boolean), 8);

   return {
      state: inferredOpenWork.length ? "in-progress" : "unknown",
      reason: inferredOpenWork.length ? "The project contains unfinished work inferred from its notes and progress." : "The available notes do not yet identify unfinished work or a finished outcome.",
      missingChecks: inferredOpenWork,
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

function isWeakDeclaredCurrentState(value?: string) {
   const state = compactText(value).toLowerCase();

   if (!state) {
      return true;
   }

   return /^(?:starting point|idea|planning|in planning|working on it|in progress|active|drafting|unknown|not applicable|not detected)$/i.test(state);
}

function getActionableSituationSentences(value?: string) {
   const text = cleanText(value, 60000);

   if (!text) {
      return [] as string[];
   }

   return uniqueStrings(
      text
         .split(/(?<=[.!?])\s+|\n+/)
         .map((sentence) => compactText(sentence, 700))
         .filter(Boolean)
         .filter((sentence) => {
            const lower = sentence.toLowerCase();

            if (/^(?:write|describe|list|add|define|record)\b/.test(lower)) {
               return false;
            }

            return /\b(?:need(?:s)? to|must|should|has to|have to|due|deadline|tomorrow|today|scheduled|send|confirm|book|reserve|test|finish|finalize|complete|deliver|waiting|blocked)\b/i.test(sentence);
         }),
      8,
   );
}

function lowerProjectSentenceStart(value?: string) {
   const sentence = compactText(value, 700);

   if (!sentence || !/^[A-Z][a-z]/.test(sentence)) {
      return sentence;
   }

   return `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}

function inferProjectSituationState(input: { declaredState: string; projectBody: string; canvasContent: string; profileSignals: ProjectProfileSignals; buildOrder: ProjectBuildStep[]; materials: ProjectMaterialSignal[] }) {
   if (!isWeakDeclaredCurrentState(input.declaredState)) {
      return input.declaredState;
   }

   const unfinishedBuilds = input.buildOrder.filter((build) => build.status !== "completed").slice(0, 4);
   const actionSentences = getActionableSituationSentences([input.projectBody, input.canvasContent].filter(Boolean).join("\n"));
   const urgentSentence =
      actionSentences.find((sentence) => /\b(?:today|tomorrow|tonight)\b/i.test(sentence)) || actionSentences.find((sentence) => /\b(?:due|deadline)\b/i.test(sentence)) || actionSentences.find((sentence) => /\bscheduled\b/i.test(sentence));
   const otherActions = actionSentences
      .filter((sentence) => sentence !== urgentSentence)
      .filter((sentence) => !/\bis scheduled for\b/i.test(sentence))
      .slice(0, 3);

   if (urgentSentence) {
      const followUp = otherActions.length ? ` The remaining work includes ${otherActions.map((sentence) => lowerProjectSentenceStart(sentence).replace(/[.!?]+$/, "")).join("; ")}.` : "";

      return compactText(`${urgentSentence}${followUp}`, 1800);
   }

   if (unfinishedBuilds.length) {
      const titles = unfinishedBuilds.map((build) => build.title);
      return `Execution is underway, with ${titles.join(", ")} still open.`;
   }

   if (actionSentences.length) {
      return actionSentences.slice(0, 4).join(" ");
   }

   const signalFallback = uniqueStrings([...input.profileSignals.priorities, ...input.profileSignals.blockedItems, ...input.profileSignals.milestones, ...input.profileSignals.timeline, ...input.profileSignals.logistics], 4);

   if (signalFallback.length) {
      return `The project is moving through ${signalFallback.join(", ")}.`;
   }

   const materialState = inferMaterialDrivenCurrentState("general", "", input.materials);

   return materialState;
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

function getNaturalProjectSentences(value?: string) {
   return uniqueStrings(
      cleanText(value, 40000)
         .split(/\n+|(?<=[.!?])\s+/)
         .map((sentence) => compactText(sentence, 1000))
         .filter(Boolean),
      40,
   );
}

function isProjectLeadActionSentence(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower || /\bsuccess means\b/.test(lower)) {
      return false;
   }

   // A project or event date is context, not unfinished work by itself.
   if (/^the\s+.+?\s+is scheduled for\b/.test(lower) && !/\b(?:send|book|confirm|coordinate|test|finish|complete|finalize|prepare|reserve|deliver|review|verify|contact)\b/.test(lower)) {
      return false;
   }

   return Boolean(
      /\b(?:need|needs|must|should|have to|has to|required|remaining|unfinished|still)\b/.test(lower) ||
      /^(?:send|book|confirm|coordinate|test|finish|complete|finalize|prepare|reserve|deliver|review|verify|schedule|contact|collect|write|build|decide)\b/.test(lower),
   );
}

function getProjectLeadActionScore(value: string) {
   const lower = compactText(value).toLowerCase();
   let score = 0;

   if (/\btoday\b/.test(lower)) score += 120;
   if (/\btomorrow\b|\btonight\b/.test(lower)) score += 110;
   if (/\bdeadline\b|\bdue\b/.test(lower)) score += 90;
   if (/\bbefore\b/.test(lower)) score += 60;
   if (/\bmust\b|\bneeds? to\b|\bhave to\b|\brequired\b/.test(lower)) score += 45;
   if (/^(?:send|book|confirm|coordinate|test|finish|complete|finalize|prepare|reserve|deliver|review|verify|schedule|contact)\b/.test(lower)) score += 35;
   if (/\bevent begins\b|\bguests arrive\b|\bparty\b/.test(lower)) score += 15;

   return score;
}

function projectLeadActionFromSentence(value?: string) {
   const sentence = compactText(value, 900).replace(/[.!?]+$/, "");

   if (!sentence) return "";

   const passive = sentence.match(/^The\s+(.+?)\s+(?:needs?|has)\s+to\s+be\s+(.+)$/i);
   if (passive) {
      const subject = passive[1].trim();
      const rest = passive[2].replace(/\s+so\b[\s\S]*$/i, "").trim();
      const match = rest.match(/^(sent|confirmed|booked|tested|finished|completed|finalized|prepared|reserved|delivered)(?:\s+(.*))?$/i);

      if (match) {
         const verbs: Record<string, string> = {
            sent: "Send",
            confirmed: "Confirm",
            booked: "Book",
            tested: "Test",
            finished: "Finish",
            completed: "Complete",
            finalized: "Finalize",
            prepared: "Prepare",
            reserved: "Reserve",
            delivered: "Confirm delivery of",
         };
         const timing = compactText(match[2]);
         return compactText(`${verbs[match[1].toLowerCase()] || "Complete"} ${match[1].toLowerCase() === "delivered" ? subject : `the ${subject}`}${timing ? ` ${timing}` : ""}`, 700);
      }
   }

   const activeNeed = sentence.match(/^(?:I|We|You)\s+(?:need|have)\s+to\s+(.+)$/i);
   if (activeNeed) return compactText(activeNeed[1], 700);

   const directNeed = sentence.match(/^(?:Need to|Must|Should|Have to)\s+(.+)$/i);
   if (directNeed) return compactText(directNeed[1], 700);

   return sentence;
}

function inferProjectLeadFollowUp(actions: string[], nextMove: string) {
   const remaining = actions.filter((action) => action.toLowerCase() !== nextMove.toLowerCase());
   const combined = remaining.join(" ").toLowerCase();

   // Prefer prerequisites over downstream validation work.
   if (/rsvp|attendance|guest count/i.test(nextMove)) {
      const coordination = remaining.find((action) => /coordinate with|reserve support|\bit department\b|\bit team\b/i.test(action));
      if (coordination) return coordination;
   }

   if (/slideshow|presentation|video|a\/v/i.test(combined)) {
      const coordination = remaining.find((action) => /coordinate with|reserve support|\bit department\b|\bit team\b/i.test(action));
      if (coordination) return coordination;
   }

   return remaining[0] || "";
}

function inferProjectLeadGoal(title: string, explicitGoal: string, sentences: string[]) {
   const cleanExplicitGoal = compactText(explicitGoal, 1200);
   const scheduled = sentences.find((sentence) => /\bis scheduled for\b/i.test(sentence));

   // A success condition describes what "done" looks like; it should not replace
   // the project goal itself. Event-style notes often use "Success means..." as
   // their only structured outcome, so derive the goal from the project and date.
   if (cleanExplicitGoal && !/^(?:success means|everything is confirmed|all .* (?:is|are) confirmed)/i.test(cleanExplicitGoal)) {
      return cleanExplicitGoal;
   }

   if (scheduled) {
      const scheduledFor = scheduled.match(/\bis scheduled for\s+(.+?)(?:[.!?]|$)/i)?.[1];
      return compactText(scheduledFor ? `Run ${title} successfully on ${scheduledFor}` : `Run ${title} successfully by the scheduled date`, 1200);
   }

   return compactText(`Complete ${title} successfully`, 1200);
}

function inferProjectLeadMomentum(sentences: string[], unresolvedWork: string[], readiness: ProjectReadinessAssessment): ProjectMomentum {
   const combined = compactText(sentences.join(" "), 30000).toLowerCase();

   if (readiness.state === "complete" || (!unresolvedWork.length && /\bcomplete|finished|done\b/.test(combined))) return "complete";
   const validationWork = unresolvedWork.filter((item) => /\btest|verify|validate|review|quality check\b/i.test(item));
   if (unresolvedWork.length && validationWork.length === unresolvedWork.length) return "validation";
   if (/\bchoose|decide|option|selection|approve\b/.test(combined)) return "decision";
   if (unresolvedWork.length && /\bneed|must|confirm|coordinate|send|book|deliver|finish|complete|test|verify\b/.test(combined)) return "execution";
   if (/\bplan|schedule|organize|timeline|roadmap\b/.test(combined)) return "planning";
   return "definition";
}

function inferProjectLeadWhyNow(nextSentence: string, action: string, sentences: string[], goal: string) {
   const lowerAction = action.toLowerCase();

   if (/rsvp|attendance|guest count/.test(lowerAction)) {
      return "Attendance affects the remaining setup decisions, including seating, delivery quantities, and room preparation.";
   }

   if (/it|a\/v|audio|video|slideshow|presentation/.test(lowerAction)) {
      return "A/V support and equipment availability determine whether the presentation can be tested under real event conditions.";
   }

   if (/chair|delivery/.test(lowerAction)) {
      return "The delivery window affects room setup and leaves little recovery time if anything changes.";
   }

   const causal = nextSentence.match(/\bso\s+(.+)$/i)?.[1]?.replace(/[.!?]+$/, "");
   if (causal) {
      return ensureProjectLeadSentence(`Completing this now means ${lowerProjectSentenceStart(causal)}`);
   }

   const supporting = sentences.find((sentence) => sentence !== nextSentence && /\baffect|depend|before|so\b/i.test(sentence));
   if (supporting) return ensureProjectLeadSentence(supporting);

   return ensureProjectLeadSentence(`It is the clearest unfinished step that moves the project toward ${lowerProjectSentenceStart(goal)}`);
}

function ensureProjectLeadSentence(value?: string) {
   const clean = compactText(value, 1200);
   if (!clean) return "";
   return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function inferProjectLeadRisks(sentences: string[], unresolvedWork: string[]) {
   const risks: string[] = [];

   for (const sentence of sentences) {
      const lower = sentence.toLowerCase();

      if (/\bslideshow\b|\bvideo\b|\bpresentation equipment\b|\ba\/v\b/.test(lower) && /\btest|verify|working|playback|audio|timing\b/.test(lower)) {
         risks.push("The slideshow could fail on the actual presentation setup unless audio, video playback, and slide timing are tested there.");
      }

      if (/\bit department\b|\bit team\b|\ba\/v support\b/.test(lower) && /\bcoordinate|reserve|available|book\b/.test(lower)) {
         risks.push("IT availability is not confirmed yet, which could leave the A/V test or event setup without support.");
      }

      if (/\bchair\b|\bdelivery\b/.test(lower) && /\bevening before|morning of|confirm\b/.test(lower)) {
         risks.push("The chair delivery window is narrow, so a missed or unclear handoff could disrupt day-of setup.");
      }

      if (/\brsvp\b|\battendance\b/.test(lower) && /\btomorrow|deadline|finalized\b/.test(lower)) {
         risks.push("A delayed RSVP reminder could leave the final attendance count unresolved and compress later setup decisions.");
      }
   }

   if (unresolvedWork.length >= 4) {
      risks.push("Several execution details remain open close to the event, so ownership and sequencing matter more than adding new work.");
   }

   return uniqueStrings(risks, 6);
}

function buildProjectLeadState(input: {
   title: string;
   projectGoal: string;
   currentState: string;
   projectBody: string;
   canvasContent: string;
   profileSignals: ProjectProfileSignals;
   dependencies: ProjectDependencySignal[];
   readiness: ProjectReadinessAssessment;
}) {
   const sentences = getNaturalProjectSentences([input.projectBody, input.canvasContent].filter(Boolean).join("\n"));
   const actionSentences = sentences.filter(isProjectLeadActionSentence).sort((left, right) => getProjectLeadActionScore(right) - getProjectLeadActionScore(left));
   const actions = uniqueStrings(actionSentences.map(projectLeadActionFromSentence).filter(Boolean), 10);
   const nextSentence = actionSentences[0] || "";
   const nextMove = actions[0] || input.profileSignals.priorities[0] || input.profileSignals.milestones[0] || "";
   const afterNextMove = inferProjectLeadFollowUp(actions, nextMove);
   const goal = inferProjectLeadGoal(input.title, input.projectGoal, sentences);
   const blockers = uniqueStrings([...input.profileSignals.blockedItems, ...input.dependencies.filter((dependency) => dependency.state !== "satisfied").map((dependency) => dependency.text)], 8);
   const risks = inferProjectLeadRisks(sentences, actions);
   const momentum = inferProjectLeadMomentum(sentences, actions, input.readiness);
   const situation = nextSentence
      ? ensureProjectLeadSentence(nextSentence)
      : input.currentState && !/\bthe remaining work includes\b/i.test(input.currentState)
        ? input.currentState
        : actions.length
          ? `${actions.length} unfinished ${actions.length === 1 ? "outcome remains" : "outcomes remain"} before the project is ready.`
          : `The project is moving toward ${goal}.`;
   const opportunities = uniqueStrings(
      [
         /it|a\/v|slideshow|presentation/i.test(actions.join(" ")) ? "Book A/V support before the equipment test so the test reflects the actual event setup." : "",
         /rsvp|attendance/i.test(actions.join(" ")) && /chair|delivery|seating/i.test(actions.join(" ")) ? "Use the RSVP responses to confirm the final chair count and room setup." : "",
      ],
      4,
   );

   return {
      goal,
      situation,
      momentum,
      nextMove,
      whyNow: inferProjectLeadWhyNow(nextSentence, nextMove, sentences, goal),
      afterNextMove,
      unresolvedWork: actions,
      blockers,
      risks,
      opportunities,
   } satisfies ProjectLeadState;
}

interface StoredProjectProgressMilestone {
   id: string;
   title: string;
   completed: boolean;
   completedAt?: number;
}

interface StoredProjectProgress {
   milestones: StoredProjectProgressMilestone[];
   nextStep: string;
   status: string;
}

function readStoredProjectProgress(projectTitle: string): StoredProjectProgress | null {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const libraryRaw = localStorage.getItem("allevin-project-library");
      const trackingRaw = localStorage.getItem("allevin-project-tracking-map");
      const library = libraryRaw ? (JSON.parse(libraryRaw) as Array<{ id?: string; title?: string }>) : [];
      const tracking = trackingRaw ? (JSON.parse(trackingRaw) as Record<string, Partial<StoredProjectProgress>>) : {};
      const project = library.find((item) => normalizeProjectKey(item.title) === normalizeProjectKey(projectTitle));

      if (!project?.id) {
         return null;
      }

      const stored = tracking[project.id];

      if (!stored || !Array.isArray(stored.milestones)) {
         return null;
      }

      return {
         milestones: stored.milestones
            .filter((milestone): milestone is StoredProjectProgressMilestone => Boolean(milestone && typeof milestone.title === "string"))
            .map((milestone, index) => ({
               id: cleanTitle(milestone.id) || `stored-milestone-${index}`,
               title: cleanTitle(milestone.title),
               completed: milestone.completed === true,
               completedAt: typeof milestone.completedAt === "number" ? milestone.completedAt : undefined,
            }))
            .filter((milestone) => milestone.title),
         nextStep: compactText(stored.nextStep),
         status: compactText(stored.status),
      };
   } catch {
      return null;
   }
}

function getStructuredProjectValue(sections: StructuredSection[], aliases: string[]) {
   return getSectionText(sections, aliases, 8000);
}

function getStructuredProjectItems(sections: StructuredSection[], aliases: string[]) {
   return getSectionItems(sections, aliases, 20);
}

function inferMilestoneWhyNow(nextMove: string, projectBody: string, goal: string) {
   const next = compactText(nextMove).toLowerCase();
   const body = compactText(projectBody, 50000).toLowerCase();

   if (/\bbrand language|company promise|positioning\b/.test(next)) {
      return "The company promise and positioning determine how the products are introduced, which stories receive emphasis, and what the visual system needs to communicate.";
   }

   if (/\brelate|relationship|ecosystem|parent company|parent brand\b/.test(next)) {
      return "The relationship between the parent company and its products determines the page hierarchy, feature-story emphasis, and copy.";
   }

   if (/\beditorial structure|page structure|information architecture|hierarchy\b/.test(next)) {
      return "The page structure should translate the positioning into a clear reading order before implementation begins.";
   }

   if (/\bbuild|implement|develop|code\b/.test(next) && /\bwebsite|site|app|software\b/.test(body)) {
      return "The key positioning and structure decisions should be stable before implementation so the build does not have to absorb avoidable rework.";
   }

   if (/\bresponsive|accessibility|wcag|keyboard|contrast\b/.test(next)) {
      return "Responsive behavior and accessibility are part of the product quality bar, so they need to be validated before the work is treated as ready to share.";
   }

   if (/\bdeploy|deployment|launch|release\b/.test(next)) {
      return "Deployment should come after the experience, content hierarchy, responsiveness, and accessibility checks are complete.";
   }

   if (/\brsvp|attendance\b/.test(next) && /\bparty|event|guests|retirement\b/.test(body)) {
      return "Attendance affects the remaining setup decisions, including seating, delivery quantities, and room preparation.";
   }

   if (/\bit|a\/v|slideshow|presentation\b/.test(next) && /\bparty|event|guests|retirement\b/.test(body)) {
      return "A/V support and equipment availability determine whether the presentation can be tested under real event conditions.";
   }

   return ensureProjectLeadSentence(`This is the first unfinished checkpoint that materially advances ${lowerProjectSentenceStart(goal)}`);
}

function inferDomainProjectRisks(projectBody: string, milestones: string[]) {
   const body = compactText(projectBody, 50000).toLowerCase();
   const risks: string[] = [];

   if (/\bwebsite|site|web app|software company|product ecosystem\b/.test(body)) {
      if (/\bbrand|positioning|parent brand|parent company|ecosystem\b/.test(body)) {
         risks.push("If the parent company and product roles are not clearly differentiated, the website may feel like several unrelated products sharing one page.");
      }

      if (/\bone-page|one page|magazine-style|editorial\b/.test(body)) {
         risks.push("A one-page editorial layout can become too text-heavy unless the reading order and feature-story hierarchy are decided early.");
      }

      if (/\biphone|mobile|tablet|responsive\b/.test(body)) {
         risks.push("The magazine hierarchy may weaken on smaller screens unless the mobile stacking order is designed deliberately.");
      }

      if (/\bwcag|accessibility|keyboard|contrast\b/.test(body)) {
         risks.push("Accessibility could become a late-stage repair if contrast, semantics, focus behavior, and keyboard navigation are not treated as design constraints from the start.");
      }
   }

   if (/\bparty|event|guests|retirement\b/.test(body)) {
      risks.push(...inferProjectLeadRisks(getNaturalProjectSentences(projectBody), milestones));
   }

   return uniqueStrings(risks, 6);
}

function getProjectUnderstandingSuccessState(goal: string, profileSignals: ProjectProfileSignals, projectBody: string) {
   const explicit = profileSignals.successCriteria[0] || getNaturalProjectSentences(projectBody).find((sentence) => /^success means\b/i.test(sentence));

   if (explicit) {
      return ensureProjectLeadSentence(explicit.replace(/^success means\s*/i, ""));
   }

   return ensureProjectLeadSentence(goal ? `${goal.replace(/[.!?]+$/, "")} with the remaining work confirmed and validated` : "The intended outcome is complete and validated");
}

function getProjectUnderstandingTimeline(projectBody: string, profileSignals: ProjectProfileSignals): ProjectUnderstandingTimelineSignal[] {
   const sentences = getNaturalProjectSentences(projectBody);
   const timingPattern =
      /\b(?:today|tomorrow|tonight|morning of|evening before|before|after|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*|\d{1,2}[/-]\d{1,2})\b/i;
   const candidates = uniqueStrings([...profileSignals.timeline, ...sentences.filter((sentence) => timingPattern.test(sentence))], 12).filter(
      (value) => !/^success means\b/i.test(value) && !/\?$/.test(value) && !/^[-*]\s*(?:who|what|when|where|why|how|is|are|do|does|should|could|would)\b/i.test(value),
   );

   return candidates.map((value) => ({
      id: `timeline-${stableHash(value)}`,
      label: value,
      dateText: value,
      importance: /\b(?:tomorrow|today|deadline|before the event|morning of|evening before)\b/i.test(value) ? "high" : /\b(?:before|after|scheduled|date|thursday|wednesday|friday|monday|tuesday|saturday|sunday)\b/i.test(value) ? "medium" : "low",
   }));
}

function getProjectUnderstandingMilestones(input: { lead: ProjectLeadState; buildOrder: ProjectBuildStep[]; profileSignals: ProjectProfileSignals; risks: ProjectRiskSignal[] }): ProjectUnderstandingMilestone[] {
   const completedTitles = uniqueStrings([...input.buildOrder.filter((build) => build.status === "completed").map((build) => build.title), ...input.profileSignals.checklistItems.filter((item) => item.status === "completed").map((item) => item.text)], 12);
   const openTitles = uniqueStrings(
      [...input.lead.unresolvedWork, ...input.buildOrder.filter((build) => build.status !== "completed").map((build) => build.title), ...input.profileSignals.checklistItems.filter((item) => item.status !== "completed").map((item) => item.text)],
      12,
   );
   const titles = uniqueStrings([...completedTitles, ...openTitles], 12);
   const activeTitle = input.lead.nextMove || openTitles[0] || "";

   return titles.map((title, index) => {
      const isComplete = completedTitles.some((item) => normalizeProjectKey(item) === normalizeProjectKey(title));
      const isActive = !isComplete && normalizeProjectKey(title) === normalizeProjectKey(activeTitle);
      const matchingBuild = input.buildOrder.find((build) => normalizeProjectKey(build.title) === normalizeProjectKey(title));
      const relatedRisks = input.risks.filter((risk) => getDecisionOverlap(risk.text, title) > 0).map((risk) => risk.text);

      return {
         id: matchingBuild?.id || `milestone-${stableHash(`${index}:${title}`)}`,
         title,
         status: isComplete ? "complete" : isActive ? "active" : matchingBuild?.status === "ready-for-review" ? "needs-confirmation" : "waiting",
         purpose: matchingBuild?.whyItMatters || (isActive ? input.lead.whyNow : ensureProjectLeadSentence(`This checkpoint helps move the project toward ${lowerProjectSentenceStart(input.lead.goal)}`)),
         completionEvidence: uniqueStrings([...(matchingBuild?.completionSignals || []), ...(matchingBuild?.readinessCriteria || [])], 20),
         dependencies: matchingBuild?.dependencies || [],
         risks: relatedRisks,
         goal: compactText(matchingBuild?.goal || matchingBuild?.description || title, 1500),
         whyItMatters: compactText(matchingBuild?.whyItMatters || (isActive ? input.lead.whyNow : ensureProjectLeadSentence(`This checkpoint helps move the project toward ${lowerProjectSentenceStart(input.lead.goal)}`)), 1500),
         startingPrompt: compactText(matchingBuild?.startingPrompt || `What must be decided, created, or verified to complete ${lowerProjectSentenceStart(title)}?`, 1500),
         workingContent: cleanText(matchingBuild?.workingContent, 100000),
         decisions: uniqueStrings(matchingBuild?.decisions || [], 40),
         openQuestions: uniqueStrings(matchingBuild?.openQuestions || [], 40),
         order: matchingBuild?.order || index + 1,
      } satisfies ProjectUnderstandingMilestone;
   });
}

interface SemanticProjectSource {
   sourceType: ProjectEvidenceReference["sourceType"];
   sourceId: string;
   text: string;
   affects: string[];
}

interface SemanticProjectExtraction {
   confirmed: ProjectDecision[];
   unresolved: ProjectDecision[];
   assumptions: ProjectDecision[];
   options: ProjectOption[];
   tensions: ProjectTension[];
   constraints: ProjectConstraint[];
   successCriteria: ProjectSuccessCriterion[];
}

function buildEvidenceReference(sourceType: ProjectEvidenceReference["sourceType"], sourceId: string, quote: string): ProjectEvidenceReference {
   return {
      sourceType,
      sourceId: cleanTitle(sourceId) || sourceType,
      quote: compactText(quote, 1200),
   };
}

function splitSemanticStatements(value?: string) {
   const clean = cleanText(value, 100000)
      .replace(/\r/g, "\n")
      .replace(/[•●▪◦]/g, "\n- ")
      .replace(/\n{3,}/g, "\n\n");

   if (!clean) return [];

   const statements: string[] = [];

   clean.split(/\n+/).forEach((line) => {
      const normalizedLine = line
         .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
         .replace(/^\s*(?:decision|constraint|assumption|option|question|risk|dependency|success criterion)\s*:\s*/i, "")
         .trim();

      if (!normalizedLine) return;

      const sentenceParts = normalizedLine
         .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
         .map((part) => compactText(part, 1400))
         .filter(Boolean);

      statements.push(...sentenceParts);
   });

   return uniqueStrings(
      statements.filter((statement) => {
         if (statement.length < 8 || statement.length > 1400) return false;
         if (/^(?:project|goal|current status|current state|milestones?|materials?|notes?|overview|summary|background|context)$/i.test(statement)) return false;
         return true;
      }),
      160,
   );
}

function buildSemanticProjectSources(input: { projectBody: string; canvasContent: string; milestones: ProjectUnderstandingMilestone[]; materials: ProjectMaterialSignal[] }): SemanticProjectSource[] {
   const sources: SemanticProjectSource[] = [
      {
         sourceType: "project",
         sourceId: "project-foundation",
         text: input.projectBody,
         affects: [],
      },
      {
         sourceType: "project",
         sourceId: "canvas-working-state",
         text: input.canvasContent,
         affects: input.milestones.filter((milestone) => milestone.status === "active").map((milestone) => milestone.id),
      },
      ...input.milestones.map((milestone) => ({
         sourceType: "milestone" as const,
         sourceId: milestone.id,
         // Only user-authored milestone workspace content belongs in semantic
         // extraction. Goal, purpose, starter prompts, and completion evidence
         // may be generated by Project Intelligence and must not be promoted
         // back into decisions or unresolved questions.
         text: [milestone.workingContent, ...milestone.decisions, ...milestone.openQuestions].filter(Boolean).join("\n"),
         affects: [milestone.id],
      })),
      ...input.materials.map((material) => ({
         sourceType: "material" as const,
         sourceId: material.id,
         text: [material.title, material.summary, material.details].filter(Boolean).join("\n"),
         affects: material.relevantBuildIds,
      })),
   ];

   return sources.filter((source) => compactText(source.text, 100000));
}

function splitSemanticActionSequence(statement: string) {
   const clean = compactText(statement, 1600);
   const firstVerb = clean.match(/\b(define|decide|choose|determine|confirm|verify|select|clarify|finalize|identify|establish|resolve|compare|validate|approve|lock|settle|map|specify|build|test)\b/i);

   if (!firstVerb) return [clean];

   const prefix = clean.slice(0, firstVerb.index || 0).trim();
   const sequence = clean.slice(firstVerb.index || 0).trim();

   const parts = sequence
      .split(
         /,\s+(?=(?:define|decide|choose|determine|confirm|verify|select|clarify|finalize|identify|establish|resolve|compare|validate|approve|lock|settle|map|specify|build|test)\b)|\s+and\s+(?=(?:define|decide|choose|determine|confirm|verify|select|clarify|finalize|identify|establish|resolve|compare|validate|approve|lock|settle|map|specify|build|test)\b)/i,
      )
      .map((part) => compactText(part, 900))
      .filter(Boolean);

   if (parts.length <= 1) return [clean];

   return parts.map((part, index) => (index === 0 && prefix ? `${prefix} ${part}` : part));
}

function isGeneratedOrDescriptiveProjectStatement(statement: string) {
   return (
      /^(?:i am|i'm|we are|we're)\s+(?:planning|building|creating|developing|working on)\b/i.test(statement) ||
      /\bproject is currently\b/i.test(statement) ||
      /^(?:the project|this project)\s+(?:is|exists|focuses|centers|aims)\b/i.test(statement) ||
      /^(?:success means|done when|complete when|ready when)\b/i.test(statement) ||
      /^(?:before|after)\s+(?:development|implementation|launch|design|testing)\b/i.test(statement) ||
      /\b(?:will help|helps? to|is crucial|is important|is essential|is key|reducing the risk|gives the decision an evidence base|directly aligned|clarifies how|inform how)\b/i.test(statement) ||
      /^(?:this material|the material|this document|the document)\b/i.test(statement) ||
      /^(?:this is the first|this is the next|this checkpoint|the current checkpoint)\b/i.test(statement)
   );
}

function looksLikeSemanticQuestion(statement: string) {
   return /\?$/.test(statement) || /^(?:who|what|when|where|why|how|which|whether|is|are|do|does|did|can|could|should|would|will)\b/i.test(statement);
}

function looksLikeSemanticWorkItem(statement: string) {
   return /^(?:define|decide|choose|determine|confirm|verify|select|clarify|finalize|identify|establish|resolve|compare|validate|approve|lock|settle|map|specify)\b/i.test(statement);
}

function looksLikeExplicitDecisionStatement(statement: string) {
   if (looksLikeSemanticQuestion(statement) || looksLikeSemanticWorkItem(statement) || isGeneratedOrDescriptiveProjectStatement(statement)) {
      return false;
   }

   if (
      /^(?:should|could|would|may|might|consider|recommend|suggest|try|use|review|create|build|add|write|test|schedule)\b/i.test(statement) ||
      /\b(?:TBD|to be decided|not yet decided|still undecided|unknown)\b/i.test(statement) ||
      /\b(?:must|must not|required|requirement|cannot|can't|at least|at most|within|WCAG|keyboard navigation|screen readers?)\b/i.test(statement)
   ) {
      return false;
   }

   const explicitCommitment = /\b(?:selected|chosen|approved|confirmed|decided|agreed|finalized|locked)\b/i.test(statement);

   const scopedCommitment =
      /^(?:the|this|our|its)\s+(?:first|initial|public|pilot|release|deliverable|website|application|app|product|portal|company|brand|project)\b/i.test(statement) &&
      /\b(?:is|will be|will serve|will use|will include|will exclude|will remain|will launch|uses|includes|excludes|remains)\b/i.test(statement);

   const namedCommitment = /^[A-Z][A-Za-z0-9'’& -]{1,80}\s+(?:is|will be|will serve as|uses|includes|remains)\b/.test(statement);

   return explicitCommitment || scopedCommitment || namedCommitment;
}

function looksLikeConstraintStatement(statement: string) {
   return (
      /\b(?:only|limited to|not\b|cannot|can't|must|must not|required|requirement|within|without|no more than|at most|at least|browser-only|browser based|browser-based|internal-only|single-page|one-page)\b/i.test(statement) ||
      /\b(?:deadline|budget|WCAG|accessibility|platform|stack)\b/i.test(statement)
   );
}

function looksLikeAssumptionStatement(statement: string) {
   return /^(?:assume|assuming|assumption)\b/i.test(statement) || /\b(?:we expect|expected to|likely to|probably|presume|for now we are treating)\b/i.test(statement);
}

function looksLikeSuccessCriterionStatement(statement: string) {
   return /^(?:success means|done when|complete when|ready when|considered ready when)\b/i.test(statement) || /\b(?:must be true before|completion criteria|success criteria|acceptance criteria)\b/i.test(statement);
}

function extractSemanticChoicePair(statement: string) {
   const whetherMatch = statement.match(/\bwhether\s+(.+?)\s+or\s+(.+?)(?:[.!?]|$)/i);
   if (whetherMatch) {
      return [compactText(whetherMatch[1], 500), compactText(whetherMatch[2], 500)].filter(Boolean);
   }

   const eitherMatch = statement.match(/\beither\s+(.+?)\s+or\s+(.+?)(?:[.!?]|$)/i);
   if (eitherMatch) {
      return [compactText(eitherMatch[1], 500), compactText(eitherMatch[2], 500)].filter(Boolean);
   }

   const betweenMatch = /\b(?:choose|decide|select|compare|choice|option)\b/i.test(statement) ? statement.match(/\bbetween\s+([^,]+?)\s+and\s+([^,]+?)(?:[.!?]|$)/i) : null;

   if (betweenMatch) {
      return [compactText(betweenMatch[1], 500), compactText(betweenMatch[2], 500)].filter(Boolean);
   }

   const versusMatch = statement.match(/(.+?)\s+(?:versus|vs\.?)\s+(.+?)(?:[.!?]|$)/i);
   if (versusMatch) {
      return [compactText(versusMatch[1], 500), compactText(versusMatch[2], 500)].filter(Boolean);
   }

   return [];
}

function extractSemanticContrast(statement: string) {
   const match = statement.match(/^(.+?)(?:,\s*|\s+)(?:but|however|whereas|while|rather than|instead of)\s+(.+)$/i);

   if (!match) return [];

   const left = compactText(match[1], 700);
   const right = compactText(match[2], 700);

   return left && right ? [left, right] : [];
}

function mergeProjectDecisions(values: ProjectDecision[], limit = 40) {
   const merged: ProjectDecision[] = [];

   values.forEach((value) => {
      const key = normalizeProjectKey(value.statement);
      if (!key) return;

      const existing = merged.find((item) => normalizeProjectKey(item.statement) === key);

      if (existing) {
         existing.evidence = [
            ...existing.evidence,
            ...value.evidence.filter((evidence) => !existing.evidence.some((item) => item.sourceType === evidence.sourceType && item.sourceId === evidence.sourceId && normalizeProjectKey(item.quote) === normalizeProjectKey(evidence.quote))),
         ].slice(0, 12);
         existing.affects = uniqueStrings([...existing.affects, ...value.affects], 20);
         return;
      }

      merged.push({
         ...value,
         evidence: value.evidence.slice(0, 12),
         affects: uniqueStrings(value.affects, 20),
      });
   });

   return merged.slice(0, limit);
}

function extractSemanticProjectUnderstanding(input: { projectBody: string; canvasContent: string; milestones: ProjectUnderstandingMilestone[]; materials: ProjectMaterialSignal[]; goal: string }): SemanticProjectExtraction {
   const sources = buildSemanticProjectSources(input);
   const confirmed: ProjectDecision[] = [];
   const unresolved: ProjectDecision[] = [];
   const assumptions: ProjectDecision[] = [];
   const options: ProjectOption[] = [];
   const tensions: ProjectTension[] = [];
   const constraints: ProjectConstraint[] = [];
   const successCriteria: ProjectSuccessCriterion[] = [];

   sources.forEach((source) => {
      splitSemanticStatements(source.text)
         .flatMap((statement) => splitSemanticActionSequence(statement))
         .forEach((statement) => {
            const evidence = [buildEvidenceReference(source.sourceType, source.sourceId, statement)];
            const choicePair = extractSemanticChoicePair(statement);
            const contrastPair = extractSemanticContrast(statement);

            if (looksLikeSemanticQuestion(statement) || looksLikeSemanticWorkItem(statement) || /\b(?:TBD|to be decided|not yet decided|still undecided)\b/i.test(statement)) {
               unresolved.push({
                  id: `semantic-unresolved-${stableHash(`${source.sourceId}:${statement}`)}`,
                  statement: statement
                     .replace(/^before .+?,\s*i need to\s+/i, "")
                     .replace(/^i need to\s+/i, "")
                     .replace(/\?+$/, ""),
                  status: "unresolved",
                  evidence,
                  affects: source.affects,
               });
            }

            if (looksLikeExplicitDecisionStatement(statement) && !looksLikeSuccessCriterionStatement(statement)) {
               confirmed.push({
                  id: `semantic-confirmed-${stableHash(`${source.sourceId}:${statement}`)}`,
                  statement,
                  status: "confirmed",
                  evidence,
                  affects: source.affects,
               });
            }

            if (looksLikeAssumptionStatement(statement)) {
               assumptions.push({
                  id: `semantic-assumption-${stableHash(`${source.sourceId}:${statement}`)}`,
                  statement,
                  status: "assumed",
                  evidence,
                  affects: source.affects,
               });
            }

            if (looksLikeConstraintStatement(statement)) {
               constraints.push({
                  id: `semantic-constraint-${stableHash(`${source.sourceId}:${statement}`)}`,
                  statement,
                  evidence,
               });
            }

            if (looksLikeSuccessCriterionStatement(statement)) {
               successCriteria.push({
                  id: `semantic-success-${stableHash(`${source.sourceId}:${statement}`)}`,
                  statement,
                  satisfied: false,
                  evidence,
               });
            }

            if (choicePair.length === 2) {
               choicePair.forEach((name) => {
                  if (!options.some((option) => normalizeProjectKey(option.name) === normalizeProjectKey(name))) {
                     options.push({
                        id: `semantic-option-${stableHash(`${source.sourceId}:${name}`)}`,
                        name,
                        advantages: [],
                        disadvantages: [],
                        dependencies: [],
                        risks: [],
                        fitWithGoal: input.goal ? ensureProjectLeadSentence(`This option should be judged by how directly it supports ${lowerProjectSentenceStart(input.goal)}`) : "This option should be judged against the stated project goal.",
                        evidence,
                     });
                  }
               });

               tensions.push({
                  id: `semantic-tension-choice-${stableHash(`${source.sourceId}:${statement}`)}`,
                  sideA: choicePair[0],
                  sideB: choicePair[1],
                  consequence: "The project cannot treat both directions as settled until the choice is resolved.",
                  decisionNeeded: statement.replace(/\?+$/, ""),
                  evidence,
               });
            }

            if (contrastPair.length === 2) {
               tensions.push({
                  id: `semantic-tension-contrast-${stableHash(`${source.sourceId}:${statement}`)}`,
                  sideA: contrastPair[0],
                  sideB: contrastPair[1],
                  consequence: "These two directions may produce different downstream requirements.",
                  decisionNeeded: `Resolve how ${lowerProjectSentenceStart(contrastPair[0])} should coexist with ${lowerProjectSentenceStart(contrastPair[1])}`,
                  evidence,
               });
            }
         });
   });

   const completedEvidenceKeys = new Set(
      input.milestones
         .filter((milestone) => milestone.status === "complete")
         .flatMap((milestone) => milestone.completionEvidence)
         .map((item) => normalizeProjectKey(item)),
   );

   return {
      confirmed: mergeProjectDecisions(confirmed, 50),
      unresolved: mergeProjectDecisions(unresolved, 50),
      assumptions: mergeProjectDecisions(assumptions, 30),
      options: options.slice(0, 20),
      tensions: tensions.filter((tension, index, all) => all.findIndex((item) => normalizeProjectKey(item.sideA) === normalizeProjectKey(tension.sideA) && normalizeProjectKey(item.sideB) === normalizeProjectKey(tension.sideB)) === index).slice(0, 20),
      constraints: constraints.filter((constraint, index, all) => all.findIndex((item) => normalizeProjectKey(item.statement) === normalizeProjectKey(constraint.statement)) === index).slice(0, 40),
      successCriteria: successCriteria
         .filter((criterion, index, all) => all.findIndex((item) => normalizeProjectKey(item.statement) === normalizeProjectKey(criterion.statement)) === index)
         .map((criterion) => ({
            ...criterion,
            satisfied: completedEvidenceKeys.has(normalizeProjectKey(criterion.statement)),
         }))
         .slice(0, 40),
   };
}

function buildGenericProjectDecisions(
   milestones: ProjectUnderstandingMilestone[],
   profileSignals: ProjectProfileSignals,
): {
   confirmed: ProjectDecision[];
   unresolved: ProjectDecision[];
   assumptions: ProjectDecision[];
} {
   const confirmedStatements = uniqueStrings([...profileSignals.decisions, ...milestones.flatMap((milestone) => milestone.decisions)], 40);

   const unresolvedStatements = uniqueStrings([...milestones.flatMap((milestone) => milestone.openQuestions)], 40);

   const assumptionStatements = uniqueStrings(profileSignals.assumptions, 30);

   const confirmed = confirmedStatements.map((statement) => {
      const milestone = milestones.find((item) => item.decisions.some((decision) => normalizeProjectKey(decision) === normalizeProjectKey(statement)));

      return {
         id: `decision-confirmed-${stableHash(statement)}`,
         statement,
         status: "confirmed" as const,
         evidence: [buildEvidenceReference(milestone ? "milestone" : "project", milestone?.id || "project-foundation", statement)],
         affects: milestone ? [milestone.id] : [],
      };
   });

   const unresolved = unresolvedStatements.map((statement) => {
      const milestone = milestones.find((item) => item.openQuestions.some((question) => normalizeProjectKey(question) === normalizeProjectKey(statement)));

      return {
         id: `decision-unresolved-${stableHash(statement)}`,
         statement,
         status: "unresolved" as const,
         evidence: [buildEvidenceReference(milestone ? "milestone" : "project", milestone?.id || "project-foundation", statement)],
         affects: milestone ? [milestone.id] : [],
      };
   });

   const assumptions = assumptionStatements.map((statement) => ({
      id: `decision-assumed-${stableHash(statement)}`,
      statement,
      status: "assumed" as const,
      evidence: [buildEvidenceReference("project", "project-foundation", statement)],
      affects: [],
   }));

   return { confirmed, unresolved, assumptions };
}

function buildGenericProjectOptions(profileSignals: ProjectProfileSignals, goal: string): ProjectOption[] {
   return uniqueStrings(profileSignals.options, 20).map((name) => ({
      id: `option-${stableHash(name)}`,
      name,
      advantages: [],
      disadvantages: [],
      dependencies: [],
      risks: [],
      fitWithGoal: goal ? ensureProjectLeadSentence(`This option should be judged by how directly it supports ${lowerProjectSentenceStart(goal)}`) : "This option should be judged against the stated project goal.",
      evidence: [buildEvidenceReference("project", "project-foundation", name)],
   }));
}

function buildGenericProjectTensions(decisions: ProjectDecision[], unresolved: ProjectDecision[], options: ProjectOption[]): ProjectTension[] {
   const tensions: ProjectTension[] = [];

   if (options.length >= 2) {
      const [sideA, sideB] = options;
      tensions.push({
         id: `tension-options-${stableHash(`${sideA.name}:${sideB.name}`)}`,
         sideA: sideA.name,
         sideB: sideB.name,
         consequence: "Choosing one direction may reduce the value or feasibility of the other.",
         decisionNeeded: `Decide between ${sideA.name} and ${sideB.name} using the project goal, constraints, dependencies, and risks.`,
         evidence: [...sideA.evidence, ...sideB.evidence],
      });
   }

   // Co-location inside the same milestone is not evidence of conflict.
   // Only explicit options or explicit contrast language may create tension.
   void decisions;
   void unresolved;

   return tensions.slice(0, 12);
}

function buildGenericProjectConstraints(profileSignals: ProjectProfileSignals): ProjectConstraint[] {
   return uniqueStrings(profileSignals.constraints, 30).map((statement) => ({
      id: `constraint-${stableHash(statement)}`,
      statement,
      evidence: [buildEvidenceReference("project", "project-foundation", statement)],
   }));
}

function buildGenericSuccessCriteria(profileSignals: ProjectProfileSignals, milestones: ProjectUnderstandingMilestone[]): ProjectSuccessCriterion[] {
   const criteria = uniqueStrings([...profileSignals.successCriteria, ...milestones.flatMap((milestone) => milestone.completionEvidence)], 40);

   return criteria.map((statement) => {
      const milestone = milestones.find((item) => item.completionEvidence.some((criterion) => normalizeProjectKey(criterion) === normalizeProjectKey(statement)));

      return {
         id: `success-${stableHash(statement)}`,
         statement,
         satisfied: milestone?.status === "complete",
         evidence: [buildEvidenceReference(milestone ? "milestone" : "project", milestone?.id || "project-foundation", statement)],
      };
   });
}

function buildProjectUnderstanding(input: {
   title: string;
   projectBody: string;
   canvasContent: string;
   lead: ProjectLeadState;
   buildOrder: ProjectBuildStep[];
   profileSignals: ProjectProfileSignals;
   materials: ProjectMaterialSignal[];
   dependencies: ProjectDependencySignal[];
   risks: ProjectRiskSignal[];
   readiness: ProjectReadinessAssessment;
   confidence: number;
}): ProjectUnderstanding {
   const storedProgress = readStoredProjectProgress(input.title);
   const inferredMilestones = getProjectUnderstandingMilestones({
      lead: input.lead,
      buildOrder: input.buildOrder,
      profileSignals: input.profileSignals,
      risks: input.risks,
   });
   const milestones: ProjectUnderstandingMilestone[] = storedProgress?.milestones.length
      ? storedProgress.milestones.map((milestone, index, all) => {
           const firstOpenIndex = all.findIndex((item) => !item.completed);
           const isActive = !milestone.completed && index === firstOpenIndex;

           const matchingBuild = input.buildOrder.find((build) => normalizeProjectKey(build.title) === normalizeProjectKey(milestone.title));
           const purpose =
              matchingBuild?.whyItMatters || (isActive ? inferMilestoneWhyNow(milestone.title, input.projectBody, input.lead.goal) : ensureProjectLeadSentence(`This checkpoint helps move the project toward ${lowerProjectSentenceStart(input.lead.goal)}`));

           return {
              id: milestone.id || matchingBuild?.id || `stored-milestone-${stableHash(`${index}:${milestone.title}`)}`,
              title: milestone.title,
              status: milestone.completed ? "complete" : isActive ? "active" : "waiting",
              purpose,
              completionEvidence: uniqueStrings([...(matchingBuild?.completionSignals || []), ...(matchingBuild?.readinessCriteria || []), ...(milestone.completedAt ? [`Completed ${new Date(milestone.completedAt).toLocaleDateString()}`] : [])], 20),
              dependencies: matchingBuild?.dependencies?.length ? matchingBuild.dependencies : index > 0 ? [all[index - 1].title] : [],
              risks: [],
              goal: compactText(matchingBuild?.goal || matchingBuild?.description || milestone.title, 1500),
              whyItMatters: compactText(purpose, 1500),
              startingPrompt: compactText(matchingBuild?.startingPrompt || `What must be decided, created, or verified to complete ${lowerProjectSentenceStart(milestone.title)}?`, 1500),
              workingContent: cleanText(matchingBuild?.workingContent, 100000),
              decisions: uniqueStrings(matchingBuild?.decisions || [], 40),
              openQuestions: uniqueStrings(matchingBuild?.openQuestions || [], 40),
              order: matchingBuild?.order || index + 1,
           } satisfies ProjectUnderstandingMilestone;
        })
      : inferredMilestones;

   const activeMilestone = milestones.find((milestone) => milestone.status === "active");
   const completedWork = milestones.filter((milestone) => milestone.status === "complete").map((milestone) => milestone.title);
   const openWork = milestones.filter((milestone) => milestone.status !== "complete").map((milestone) => milestone.title);
   const recommendedMove = activeMilestone?.title || storedProgress?.nextStep || input.lead.nextMove;
   const afterThis = milestones.find((milestone) => milestone.status === "waiting")?.title || input.lead.afterNextMove;
   const domainRisks = inferDomainProjectRisks(input.projectBody, openWork);
   const combinedRisks = uniqueStrings([...domainRisks, ...input.lead.risks, ...input.risks.map((risk) => risk.text)], 12).filter((risk) => {
      const body = compactText(input.projectBody, 50000).toLowerCase();
      const eventRisk = /\ba\/v|slideshow|chair delivery|attendance|rsvp|close to the event\b/i.test(risk);
      return !eventRisk || /\bparty|event|guests|retirement\b/.test(body);
   });

   const fieldDecisions = buildGenericProjectDecisions(milestones, input.profileSignals);
   const fieldOptions = buildGenericProjectOptions(input.profileSignals, input.lead.goal);
   const fieldConstraints = buildGenericProjectConstraints(input.profileSignals);
   const fieldSuccessCriteria = buildGenericSuccessCriteria(input.profileSignals, milestones);
   const semanticExtraction = extractSemanticProjectUnderstanding({
      projectBody: input.projectBody,
      canvasContent: input.canvasContent,
      milestones,
      materials: input.materials,
      goal: input.lead.goal,
   });

   const structuredDecisions = {
      confirmed: mergeProjectDecisions([...fieldDecisions.confirmed, ...semanticExtraction.confirmed], 50),
      unresolved: mergeProjectDecisions([...fieldDecisions.unresolved, ...semanticExtraction.unresolved], 50),
      assumptions: mergeProjectDecisions([...fieldDecisions.assumptions, ...semanticExtraction.assumptions], 30),
   };

   const options = [...fieldOptions, ...semanticExtraction.options.filter((option) => !fieldOptions.some((item) => normalizeProjectKey(item.name) === normalizeProjectKey(option.name)))].slice(0, 20);

   const tensions = [...semanticExtraction.tensions, ...buildGenericProjectTensions(structuredDecisions.confirmed, structuredDecisions.unresolved, options)]
      .filter((tension, index, all) => all.findIndex((item) => normalizeProjectKey(item.sideA) === normalizeProjectKey(tension.sideA) && normalizeProjectKey(item.sideB) === normalizeProjectKey(tension.sideB)) === index)
      .slice(0, 20);

   const constraints = [...fieldConstraints, ...semanticExtraction.constraints.filter((constraint) => !fieldConstraints.some((item) => normalizeProjectKey(item.statement) === normalizeProjectKey(constraint.statement)))].slice(0, 40);

   const successCriteria = [...fieldSuccessCriteria, ...semanticExtraction.successCriteria.filter((criterion) => !fieldSuccessCriteria.some((item) => normalizeProjectKey(item.statement) === normalizeProjectKey(criterion.statement)))].slice(0, 40);
   const whyNow = inferMilestoneWhyNow(recommendedMove, input.projectBody, input.lead.goal);
   const whatItUnlocks = afterThis
      ? ensureProjectLeadSentence(`Completing this should allow the project to move into ${lowerProjectSentenceStart(afterThis)}`)
      : ensureProjectLeadSentence("Completing this should reduce the most immediate uncertainty in the project");
   const watchOuts = uniqueStrings([...combinedRisks.slice(0, 3), ...structuredDecisions.unresolved.slice(0, 2).map((decision) => decision.statement)], 5);

   return {
      version: "MK VIII",
      goal: input.lead.goal,
      successState: getProjectUnderstandingSuccessState(input.lead.goal, input.profileSignals, input.projectBody),
      situation: input.lead.situation,
      momentum: storedProgress?.status === "done" ? "complete" : input.lead.momentum,
      milestones,
      activeMilestoneId: activeMilestone?.id,
      timeline: getProjectUnderstandingTimeline(input.projectBody, input.profileSignals),
      openWork,
      completedWork,
      decisions: structuredDecisions.confirmed.map((decision) => decision.statement),
      confirmedDecisions: structuredDecisions.confirmed,
      unresolvedDecisions: structuredDecisions.unresolved,
      assumptions: structuredDecisions.assumptions,
      options,
      tensions,
      constraints,
      successCriteria,
      dependencies: milestones.slice(1).map((milestone, index) => ({
         id: `understanding-dependency-${stableHash(`${milestones[index].title}:${milestone.title}`)}`,
         before: milestones[index].title,
         after: milestone.title,
         reason: `${milestones[index].title} informs ${milestone.title}.`,
         state: milestones[index].status === "complete" ? "satisfied" : "unsatisfied",
      })),
      risks: combinedRisks.map((riskText) => {
         const packetRisk = input.risks.find((risk) => risk.text === riskText);
         return {
            id: packetRisk?.id || `understanding-risk-${stableHash(riskText)}`,
            title: getFirstMeaningfulProjectClause(riskText),
            consequence: riskText,
            mitigation: recommendedMove,
            severity: packetRisk?.severity || "medium",
         } satisfies ProjectUnderstandingRisk;
      }),
      materials: input.materials.map((material) => ({
         id: material.id,
         title: material.title,
         usefulContext: material.summary || material.details,
         relatedMilestones: material.relevantBuildIds,
         decisionsAffected: input.profileSignals.decisions.filter((decision) => getDecisionOverlap(decision, `${material.title} ${material.summary} ${material.details}`) > 0),
      })),
      conversation: {
         currentTopic: activeMilestone?.title || recommendedMove,
         recentDecisions: uniqueStrings(input.profileSignals.decisions, 6),
         unresolvedQuestions: uniqueStrings([...structuredDecisions.unresolved.map((decision) => decision.statement), ...getSectionItems(getSections(input.projectBody, input.canvasContent), ["Open Questions"], 8)], 12),
         lastMeaningfulMove: completedWork[completedWork.length - 1] || recommendedMove,
      },
      recommendedMove,
      whyNow,
      whatItUnlocks,
      afterThis,
      watchOuts,
      confidence: Math.max(input.confidence, storedProgress?.milestones.length ? 78 : input.confidence),
      updatedAt: Date.now(),
   };
}

function getFirstMeaningfulProjectClause(value?: string) {
   const clean = compactText(value, 600);
   if (!clean) return "Project risk";
   return clean
      .split(/[.;:]/)[0]
      .replace(/^(?:one thing to keep an eye on is\s+)/i, "")
      .trim();
}

// ========================================
// Packet builders
// ========================================

export function buildProjectIntelligencePacket(input: BuildProjectIntelligenceInput): ProjectIntelligencePacket {
   const sections = getSections(input.projectBody, input.canvasContent);
   const profileDetection = detectProjectReasoningProfile(input);
   const workspaceBuildOrder = buildProjectPlanFromMilestoneWorkspaces(input.milestoneWorkspaces);
   const buildOrder = workspaceBuildOrder.length ? workspaceBuildOrder : parseProjectBuildPlan(input.projectBody, input.canvasContent);
   const currentBuild = selectCurrentProjectBuild(buildOrder);
   const nextBuild = selectNextProjectBuild(buildOrder, currentBuild);
   const materials = getProjectMaterialSignals(input.title, buildOrder, input.materials);
   const rawProfileSignals = buildProfileSignals(input.projectDocument, sections, input.projectBody, input.canvasContent, materials);

   const structuredGoal = getStructuredProjectValue(sections, ["Project Goal", "Assignment Goal", "Goal", "Objective"]);
   const projectGoal = structuredGoal || compactText(input.projectDocument.goal);

   const structuredSituation = getStructuredProjectValue(sections, ["Current Situation", "Situation", "Current State", "Current Status"]);
   const declaredCurrentState = structuredSituation || compactText(input.projectDocument.currentState) || rawProfileSignals.currentStage;

   const inferredSituationState = inferProjectSituationState({
      declaredState: declaredCurrentState,
      projectBody: input.projectBody,
      canvasContent: input.canvasContent,
      profileSignals: rawProfileSignals,
      buildOrder,
      materials,
   });

   const currentState = inferMaterialDrivenCurrentState(profileDetection.reasoningProfile, inferredSituationState, materials);

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

   const rawRisks = buildRiskSignals({
      profile: profileDetection.reasoningProfile,
      profileSignals,
      buildOrder,
      currentBuild,
      dependencies,
      readiness,
   }).filter((risk) => !/add the current state|record the current state|intended outcome|before-and-after condition/i.test(risk.text));
   const projectBodyLower = compactText(input.projectBody, 50000).toLowerCase();
   const risks = rawRisks.filter((risk) => {
      const eventRisk = /a\/v|slideshow|chair delivery|attendance|rsvp|close to the event/i.test(risk.text);
      return !eventRisk || /party|event|guests|retirement/.test(projectBodyLower);
   });

   const baseProjectLeadState = buildProjectLeadState({
      title: cleanTitle(input.title),
      projectGoal,
      currentState,
      projectBody: input.projectBody,
      canvasContent: input.canvasContent,
      profileSignals,
      dependencies,
      readiness,
   });

   const storedProgress = readStoredProjectProgress(input.title);
   const structuredStart = getStructuredProjectValue(sections, ["Recommended Starting Point", "Recommended Move", "Starting Point"]);
   const structuredMilestones = getStructuredProjectItems(sections, ["Initial Milestones", "Milestones", "Progress Points"]);
   const storedOpenMilestones = storedProgress?.milestones.filter((milestone) => !milestone.completed).map((milestone) => milestone.title) || [];
   const authoritativeOpenWork = storedOpenMilestones.length ? storedOpenMilestones : structuredMilestones;
   const authoritativeNextMove = authoritativeOpenWork[0] || storedProgress?.nextStep || structuredStart || baseProjectLeadState.nextMove;
   const authoritativeAfter = authoritativeOpenWork[1] || baseProjectLeadState.afterNextMove;
   const projectLeadState: ProjectLeadState = {
      ...baseProjectLeadState,
      goal: projectGoal || baseProjectLeadState.goal,
      situation: structuredSituation || baseProjectLeadState.situation,
      nextMove: authoritativeNextMove,
      whyNow: inferMilestoneWhyNow(authoritativeNextMove, input.projectBody, projectGoal || baseProjectLeadState.goal),
      afterNextMove: authoritativeAfter,
      unresolvedWork: authoritativeOpenWork.length ? authoritativeOpenWork : baseProjectLeadState.unresolvedWork,
      risks: inferDomainProjectRisks(input.projectBody, authoritativeOpenWork.length ? authoritativeOpenWork : baseProjectLeadState.unresolvedWork),
      opportunities: [],
   };

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
            Math.min(evidence.length, 8) +
            (projectLeadState.goal ? 5 : 0) +
            (projectLeadState.nextMove ? 5 : 0) +
            (projectLeadState.unresolvedWork.length >= 2 ? 5 : 0) +
            (projectLeadState.risks.length ? 3 : 0),
      ),
   );

   const projectUnderstanding = buildProjectUnderstanding({
      title: cleanTitle(input.title),
      projectBody: input.projectBody,
      canvasContent: input.canvasContent,
      lead: projectLeadState,
      buildOrder,
      profileSignals,
      materials,
      dependencies,
      risks,
      readiness,
      confidence,
   });

   return {
      version: "MK VIII",
      projectTitle: cleanTitle(input.title),
      projectGoal,
      currentState,
      projectUnderstanding,
      projectLeadState,
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
      version: "MK VIII",
      projectTitle: "",
      projectGoal: "",
      currentState: "",
      projectUnderstanding: {
         version: "MK VIII",
         goal: "",
         successState: "",
         situation: "",
         momentum: "definition",
         milestones: [],
         activeMilestoneId: undefined,
         timeline: [],
         openWork: [],
         completedWork: [],
         decisions: [],
         confirmedDecisions: [],
         unresolvedDecisions: [],
         assumptions: [],
         options: [],
         tensions: [],
         constraints: [],
         successCriteria: [],
         dependencies: [],
         risks: [],
         materials: [],
         conversation: {
            currentTopic: "",
            recentDecisions: [],
            unresolvedQuestions: [],
            lastMeaningfulMove: "",
         },
         recommendedMove: "",
         whyNow: "",
         whatItUnlocks: "",
         afterThis: "",
         watchOuts: [],
         confidence: 0,
         updatedAt: Date.now(),
      },
      projectLeadState: {
         goal: "",
         situation: "",
         momentum: "definition",
         nextMove: "",
         whyNow: "",
         afterNextMove: "",
         unresolvedWork: [],
         blockers: [],
         risks: [],
         opportunities: [],
      },
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
