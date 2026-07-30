// ========================================
// ALLEVIN MK X Shared Response Authority
// Purpose:
// Convert Project Guidance into one mode-invariant response judgment before
// Balanced, Focused, or Creative changes how that judgment is delivered.
//
// Build 3 rule:
// The response mode may change tone, length, structure, and exploratory depth.
// It must not change project facts, the recommendation, rationale, caution,
// next action, material grounding, calendar context, uncertainty, or the
// project-scoped conversational reference currently being resolved.
// ========================================

import type { AllevinAIDockCalendarIntelligencePacket, AllevinAIDockMaterialGroundingPacket, AllevinAIDockResponseJudgment, AllevinAIDockResponseMode, AllevinLLMResponseStyle } from "@/lib/allevinLLMTypes";
import { appendAIDockMaterialGroundingLine } from "@/lib/aidockMaterialGrounding";
import type { ProjectGuidanceResult } from "@/lib/projectGuidanceEngine";
import type { ProjectIntelligencePacket } from "@/lib/projectIntelligenceEngine";

export interface BuildAIDockResponseJudgmentInput {
   prompt: string;
   guidance: ProjectGuidanceResult;
   packet: ProjectIntelligencePacket;
   materialsUsed?: string[];
   materialGrounding?: AllevinAIDockMaterialGroundingPacket;
   calendarIntelligence?: AllevinAIDockCalendarIntelligencePacket;
   calendarContext?: string;
}

export interface AIDockResponseModeProfile {
   mode: AllevinAIDockResponseMode;
   label: "Balanced" | "Focused" | "Creative";
   responseStyle: AllevinLLMResponseStyle;
   maxWords: number;
   deliveryRule: string;
}

function compactText(value?: string, limit = 7000) {
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
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function normalizeKey(value?: string) {
   return compactText(value, 1800)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function uniqueStrings(values: Array<string | undefined>, limit = 12) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values) {
      const clean = compactText(value, 1200);
      const key = normalizeKey(clean);

      if (!clean || !key || seen.has(key)) {
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

function getFirstMeaningfulSentence(value?: string) {
   const clean = compactText(value, 1800);

   if (!clean) {
      return "";
   }

   return clean.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || clean;
}

function ensureSentence(value?: string) {
   const clean = compactText(value, 1800).replace(/\s+/g, " ").trim();

   if (!clean) {
      return "";
   }

   return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function normalizeUnlockLanguage(value?: string) {
   return compactText(value, 1800).replace(/\bshould unlock\s+(?=(?:define|build|create|draft|write|decide|choose|confirm|finalize|implement|test|plan|establish|set up|organize|prepare|review|inspect)\b)/gi, "should make it possible to ");
}

function sentenceWithoutDuplicate(value: string, existing: string[]) {
   const clean = ensureSentence(value);
   const key = normalizeKey(clean);

   if (!clean || !key) {
      return "";
   }

   const duplicatesExisting = existing.some((item) => {
      const itemKey = normalizeKey(item);
      return itemKey === key || (itemKey.length > 36 && (itemKey.includes(key) || key.includes(itemKey)));
   });

   return duplicatesExisting ? "" : clean;
}

function collectModeSentences(values: Array<string | undefined>, limit: number) {
   const result: string[] = [];

   for (const value of values) {
      const sentence = sentenceWithoutDuplicate(value || "", result);

      if (sentence) {
         result.push(sentence);
      }

      if (result.length >= limit) {
         break;
      }
   }

   return result;
}

function createTruthSignature(values: string[]) {
   const source = values
      .map((value) => normalizeKey(value))
      .filter(Boolean)
      .join("|");

   let hash = 2166136261;

   for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
   }

   return `mkx-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getRelevantUncertainty(packet: ProjectIntelligencePacket, guidance: ProjectGuidanceResult) {
   const understanding = packet.projectUnderstanding;
   const intent = guidance.intent;
   const uncertaintyRelevant =
      intent === "unresolved" ||
      intent === "decision-status" ||
      intent === "decision-requirements" ||
      intent === "missing-information" ||
      intent === "risk" ||
      intent === "readiness" ||
      intent === "premature-decision" ||
      intent === "option-comparison" ||
      intent === "option-recommendation" ||
      intent === "project-lead" ||
      intent === "senior-assessment";

   if (!uncertaintyRelevant) {
      return [] as string[];
   }

   return uniqueStrings([...understanding.unresolvedDecisions.map((decision) => decision.statement), ...understanding.assumptions.map((assumption) => assumption.statement), ...understanding.conversation.unresolvedQuestions], 6);
}

export function normalizeAIDockResponseMode(value?: string): AllevinAIDockResponseMode {
   const clean = compactText(value, 80).toLowerCase();

   if (clean === "creative") {
      return "creative";
   }

   if (clean === "focused" || clean === "focus" || clean === "deep-work" || clean === "deep work" || clean === "context-switching") {
      return "focused";
   }

   return "balanced";
}

export function getAIDockResponseModeProfile(value?: string): AIDockResponseModeProfile {
   const mode = normalizeAIDockResponseMode(value);

   if (mode === "focused") {
      return {
         mode,
         label: "Focused",
         responseStyle: "direct",
         maxWords: 110,
         deliveryRule: "Answer first. Keep only the reason needed to act and one concrete next move. Avoid extra branches.",
      };
   }

   if (mode === "creative") {
      return {
         mode,
         label: "Creative",
         responseStyle: "editorial",
         maxWords: 320,
         deliveryRule: "Explore the shape of the answer and grounded alternatives while preserving the same recommendation and facts.",
      };
   }

   return {
      mode: "balanced",
      label: "Balanced",
      responseStyle: "conversational",
      maxWords: 240,
      deliveryRule: "Respond naturally with the answer, enough context to trust it, and one clear next move.",
   };
}

export function buildAIDockResponseJudgment(input: BuildAIDockResponseJudgmentInput): AllevinAIDockResponseJudgment {
   const { guidance, packet } = input;
   const understanding = packet.projectUnderstanding;
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId) || understanding.milestones.find((milestone) => milestone.status === "active");

   const authoritativeResponse =
      compactText(guidance.response, 7000) || compactText(guidance.currentUnderstanding, 2400) || compactText(guidance.assessment, 2400) || compactText(guidance.nextAction, 1600) || "I do not have enough grounded project context to answer that yet.";

   const directAnswer = getFirstMeaningfulSentence(guidance.currentUnderstanding) || getFirstMeaningfulSentence(guidance.assessment) || getFirstMeaningfulSentence(guidance.judgment) || getFirstMeaningfulSentence(authoritativeResponse);

   const recommendation = compactText(guidance.nextAction, 1600);
   const reason = compactText(guidance.reason, 2400);
   const caution = compactText(guidance.watchOut, 1800);
   const whatItUnlocks = recommendation ? normalizeUnlockLanguage(understanding.whatItUnlocks) : "";

   const relevantFacts = uniqueStrings([...guidance.evidenceUsed, activeMilestone?.title, guidance.subject?.detail, packet.projectGoal], 12);

   const materialGrounding = input.materialGrounding?.hasRelevantMaterials ? input.materialGrounding : undefined;
   const materialsUsed = uniqueStrings(materialGrounding?.usedTitles?.length ? materialGrounding.usedTitles : input.materialsUsed || [], 12);
   const calendarIntelligence = input.calendarIntelligence;
   const calendarContext = compactText(input.calendarContext || [calendarIntelligence?.todaySummary, calendarIntelligence?.nextProjectSessionSummary, calendarIntelligence?.availabilityNote].filter(Boolean).join(" "), 1800);
   const uncertainty = uniqueStrings([...(getRelevantUncertainty(packet, guidance) || []), ...(materialGrounding?.uncertainty || [])], 12);
   const materialTruth = [
      ...(materialGrounding?.facts || []).map((fact) => `${fact.sourceTitle}: ${fact.statement}`),
      ...(materialGrounding?.contradictions || []).flatMap((conflict) => [conflict.firstStatement, conflict.secondStatement, conflict.guidance]),
   ];

   const truthSignature = createTruthSignature([
      guidance.intent,
      directAnswer,
      guidance.currentUnderstanding,
      guidance.assessment,
      recommendation,
      reason,
      whatItUnlocks,
      caution,
      ...relevantFacts,
      ...materialsUsed,
      ...materialTruth,
      calendarContext,
      calendarIntelligence?.projectTitle || "",
      calendarIntelligence?.activeMilestoneTitle || "",
      calendarIntelligence?.nextProjectSessionSummary || "",
      calendarIntelligence?.sessionPlan?.sessionGoal || "",
      calendarIntelligence?.sessionPlan?.expectedResult || "",
      ...uncertainty,
   ]);

   return {
      version: "MK X",
      authority: "shared-project-judgment",
      intent: guidance.intent,
      subject: {
         kind: guidance.subject?.kind || "none",
         title: compactText(guidance.subject?.title, 300),
         detail: compactText(guidance.subject?.detail, 700),
         id: compactText(guidance.subject?.id, 180),
      },
      authoritativeResponse,
      directAnswer,
      currentUnderstanding: compactText(guidance.currentUnderstanding, 2400),
      assessment: compactText(guidance.assessment, 2400),
      recommendation,
      reason,
      nextAction: recommendation,
      whatItUnlocks,
      caution,
      relevantFacts,
      materialsUsed,
      materialGrounding,
      calendarIntelligence,
      calendarContext,
      uncertainty,
      confidence: Math.max(0, Math.min(100, Math.round(guidance.confidence || packet.confidence || 0))),
      truthSignature,
   };
}

function intentPrefersReason(intent?: string) {
   return ["rationale", "priority-rationale", "milestone-rationale", "material-rationale", "hierarchy-explanation"].includes(intent || "");
}

function intentPrefersAlternativeMethod(intent?: string) {
   return intent === "recommendation-method";
}

function intentIsConversationContinuity(intent?: string) {
   return ["conversation-recall", "conversation-reference", "conversation-correction", "recommendation-acceptance", "recommendation-rejection", "conversation-transform", "conversation-options"].includes(intent || "");
}

function renderContinuityAIDockResponse(judgment: AllevinAIDockResponseJudgment, mode: AllevinAIDockResponseMode) {
   const understanding = ensureSentence(judgment.currentUnderstanding || judgment.directAnswer);
   const assessment = ensureSentence(judgment.assessment);
   const recommendation = ensureSentence(judgment.recommendation);
   const reason = ensureSentence(judgment.reason);
   const caution = ensureSentence(judgment.caution);

   if (judgment.intent === "recommendation-rejection") {
      const lines = mode === "focused" ? collectModeSentences([understanding, assessment, recommendation], 3) : collectModeSentences([understanding, assessment, recommendation, reason], mode === "creative" ? 4 : 4);

      return mode === "focused" ? limitWords(lines.join("\n\n"), 90) : lines.join("\n\n");
   }

   if (judgment.intent === "conversation-options") {
      return compactText(judgment.authoritativeResponse, 5200);
   }

   if (judgment.intent === "conversation-correction") {
      const lines = mode === "focused" ? collectModeSentences([understanding, reason], 2) : collectModeSentences([understanding, assessment, reason], 3);

      return mode === "focused" ? limitWords(lines.join("\n\n"), 80) : lines.join("\n\n");
   }

   if (judgment.intent === "recommendation-acceptance") {
      const lines = collectModeSentences([understanding, assessment], mode === "focused" ? 1 : 2);
      return mode === "focused" ? limitWords(lines.join("\n\n"), 60) : lines.join("\n\n");
   }

   if (judgment.intent === "conversation-reference" || judgment.intent === "conversation-recall") {
      const lines = collectModeSentences([understanding, assessment, reason, caution], mode === "focused" ? 2 : 4);
      return mode === "focused" ? limitWords(lines.join("\n\n"), 90) : lines.join("\n\n");
   }

   const fallback = compactText(judgment.authoritativeResponse, 5200);
   return mode === "focused" ? limitWords(fallback, 90) : fallback;
}

function intentPrefersUnlock(intent?: string) {
   return intent === "subject-unlock";
}

function intentPrefersCaution(intent?: string) {
   return ["risk", "skip-risk", "readiness", "premature-decision", "completed-project-risk"].includes(intent || "");
}

function intentPrefersRecommendation(intent?: string) {
   return ["next-action", "next-action-detail", "priority-decision", "recommendation-fit", "material-next", "material-recommendation", "option-recommendation", "purchase-deferral", "milestone-focus", "project-lead", "senior-assessment"].includes(
      intent || "",
   );
}

function isCriticalFocusedCaution(value?: string) {
   return /\b(?:safety|unsafe|privacy|private|legal|permit|permission|insurance|security|data loss|irreversible|deadline|blocked|cannot proceed|must confirm)\b/i.test(compactText(value, 1200));
}

function limitWords(value: string, maxWords: number) {
   const words = compactText(value, 3000).split(/\s+/).filter(Boolean);

   if (words.length <= maxWords) {
      return words.join(" ");
   }

   return `${words
      .slice(0, maxWords)
      .join(" ")
      .replace(/[,;:]$/, "")}.`;
}

function renderFocusedAIDockResponse(judgment: AllevinAIDockResponseJudgment) {
   const shortReason = getFirstMeaningfulSentence(judgment.reason);
   const shortUnlock = getFirstMeaningfulSentence(judgment.whatItUnlocks);
   const shortAnswer = getFirstMeaningfulSentence(judgment.directAnswer);
   const criticalCaution = isCriticalFocusedCaution(judgment.caution) ? getFirstMeaningfulSentence(judgment.caution) : "";

   if (intentIsConversationContinuity(judgment.intent)) {
      return renderContinuityAIDockResponse(judgment, "focused");
   }

   const alternativeMethod = intentPrefersAlternativeMethod(judgment.intent) ? getFirstMeaningfulSentence(judgment.assessment) : "";

   const first = intentPrefersAlternativeMethod(judgment.intent)
      ? alternativeMethod || judgment.recommendation || shortAnswer
      : intentPrefersUnlock(judgment.intent)
        ? shortUnlock || shortAnswer
        : intentPrefersReason(judgment.intent)
          ? // Rationale intents store the actual answer in directAnswer/assessment;
            // reason may describe only the downstream unlock.
            shortAnswer || shortReason
          : intentPrefersCaution(judgment.intent)
            ? getFirstMeaningfulSentence(judgment.caution) || shortAnswer
            : intentPrefersRecommendation(judgment.intent)
              ? judgment.recommendation || shortAnswer
              : shortAnswer || judgment.recommendation;

   const second = intentPrefersAlternativeMethod(judgment.intent)
      ? ""
      : intentPrefersUnlock(judgment.intent)
        ? ""
        : intentPrefersReason(judgment.intent)
          ? shortReason && normalizeKey(shortReason) !== normalizeKey(first)
             ? shortReason
             : ""
          : intentPrefersCaution(judgment.intent)
            ? judgment.recommendation || shortReason
            : intentPrefersRecommendation(judgment.intent)
              ? ""
              : shortReason;

   const third = criticalCaution;
   const sentences = collectModeSentences([first, second, third], 3);

   return limitWords(sentences.join("\n\n") || compactText(judgment.authoritativeResponse, 2200), 90);
}

function renderCreativeAIDockResponse(judgment: AllevinAIDockResponseJudgment) {
   const authoritative = compactText(judgment.authoritativeResponse, 5200);

   if (intentIsConversationContinuity(judgment.intent)) {
      // Continuity answers should feel natural, but Creative must not turn an
      // accepted, rejected, corrected, or referenced item into a new idea.
      return renderContinuityAIDockResponse(judgment, "creative");
   }

   if (intentPrefersAlternativeMethod(judgment.intent)) {
      const method = ensureSentence(judgment.assessment);
      const recommendation = ensureSentence(judgment.recommendation);
      const reason = ensureSentence(judgment.reason);

      return collectModeSentences(["Try a different route to the same deliverable.", method, recommendation ? `The priority remains: ${recommendation}` : "", reason], 4).join("\n\n");
   }
   const recommendation = ensureSentence(judgment.recommendation);
   const reason = ensureSentence(judgment.reason);
   const anchor = ensureSentence(judgment.relevantFacts[0]);
   const unlock = ensureSentence(judgment.whatItUnlocks);
   const caution = ensureSentence(judgment.caution);

   if (!recommendation && authoritative) {
      return authoritative;
   }

   const explorationLine = recommendation ? `There is room to explore how you carry it out, but the project priority stays the same: ${recommendation}` : "";
   const groundingLine = anchor ? `Use this as the boundary that keeps the exploration grounded: ${anchor}` : reason;
   const closingLine = unlock || caution;

   const paragraphs = collectModeSentences([judgment.directAnswer || judgment.currentUnderstanding || judgment.assessment, explorationLine, reason, groundingLine, closingLine, caution], 5);

   return paragraphs.join("\n\n") || authoritative;
}

export function renderAIDockResponseJudgment(judgment?: AllevinAIDockResponseJudgment, mode: AllevinAIDockResponseMode | string = "balanced") {
   if (!judgment) {
      return "";
   }

   const normalizedMode = normalizeAIDockResponseMode(mode);
   let rendered = "";

   if (normalizedMode === "focused") {
      rendered = renderFocusedAIDockResponse(judgment);
   } else if (normalizedMode === "creative") {
      rendered = renderCreativeAIDockResponse(judgment);
   } else if (intentIsConversationContinuity(judgment.intent)) {
      rendered = renderContinuityAIDockResponse(judgment, "balanced");
   } else {
      const authoritative = compactText(judgment.authoritativeResponse, 7000);
      rendered = authoritative || collectModeSentences([judgment.directAnswer, judgment.currentUnderstanding, judgment.assessment, judgment.recommendation, judgment.reason, judgment.caution], 8).join(" ");
   }

   return appendAIDockMaterialGroundingLine(rendered, judgment.materialGrounding, normalizedMode);
}

export function getAIDockJudgmentTruthTerms(judgment?: AllevinAIDockResponseJudgment) {
   if (!judgment) {
      return [] as string[];
   }

   return uniqueStrings(
      [
         judgment.directAnswer,
         judgment.recommendation,
         judgment.reason,
         judgment.whatItUnlocks,
         judgment.caution,
         ...judgment.relevantFacts,
         ...judgment.materialsUsed,
         ...(judgment.materialGrounding?.facts || []).map((fact) => fact.statement),
         ...(judgment.materialGrounding?.contradictions || []).flatMap((conflict) => [conflict.firstStatement, conflict.secondStatement]),
         judgment.calendarContext,
         ...judgment.uncertainty,
      ],
      32,
   );
}
