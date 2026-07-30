// ========================================
// ALLEVIN MK X Conversation Continuity
// Purpose:
// Keep AIDock conversation state isolated by active project, preserve recent
// project turns across project switches, and resolve natural follow-ups such
// as "that", "the second option", "make it shorter", and "I disagree".
//
// Build 3 rules:
// - Conversation continuity is project-scoped.
// - Project Intelligence and Project Guidance remain authoritative.
// - Conversation memory may preserve references, corrections, acceptance, and
//   rejection, but it does not silently rewrite saved project data.
// - Stored conversation text is sanitized, bounded, and local to the browser.
// ========================================

import type { AllevinAIDockResponseMode, AllevinLLMConversationContext } from "@/lib/allevinLLMTypes";
import type { ProjectGuidanceResult, ProjectGuidanceSubject } from "@/lib/projectGuidanceEngine";

export type AIDockConversationRole = "user" | "assistant";

export type AIDockContinuityIntent = "none" | "continue" | "shorten" | "expand" | "simplify" | "rewrite" | "alternate-method" | "accept" | "reject" | "correct" | "option-reference";

export interface AIDockConversationMessage {
   role: AIDockConversationRole;
   content: string;
   createdAt: number;
}

export interface AIDockConversationOption {
   id: string;
   title: string;
   detail: string;
}

export interface AIDockConversationOptionSet {
   id: string;
   topic: string;
   options: AIDockConversationOption[];
   selectedOptionId: string;
}

export interface AIDockConversationThread {
   version: "MK X";
   projectKey: string;
   projectTitle: string;
   messages: AIDockConversationMessage[];
   lastIntent?: ProjectGuidanceResult["intent"];
   lastUserPrompt: string;
   lastAssistantResponse: string;
   lastRecommendation: string;
   canonicalRecommendation: string;
   currentMethod: string;
   acceptedMethod: string;
   rejectedMethods: string[];
   lastMilestoneTitle: string;
   lastSubject: ProjectGuidanceSubject;
   currentTopic: string;
   activeReference: string;
   referencedOption: string;
   optionSet?: AIDockConversationOptionSet;
   requestedTransformation: string;
   acceptedRecommendations: string[];
   rejectedRecommendations: string[];
   corrections: string[];
   responseMode?: AllevinAIDockResponseMode;
   updatedAt: number;
}

interface AIDockConversationStore {
   version: "MK X";
   threads: Record<string, AIDockConversationThread>;
   updatedAt: number;
}

const AIDOCK_CONVERSATION_STORAGE_KEY = "allevin-aidock-conversations-mkx";
const GENERAL_CONVERSATION_TITLE = "General workspace";
const MAX_THREADS = 24;
const MAX_MESSAGES_PER_THREAD = 48;
const MAX_MESSAGE_LENGTH = 7000;
const MAX_MEMORY_ITEMS = 12;

function cleanText(value?: string, limit = MAX_MESSAGE_LENGTH) {
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

function cleanInline(value?: string, limit = 1800) {
   return cleanText(value, limit).replace(/\s+/g, " ").trim();
}

function normalizeKey(value?: string) {
   return (
      cleanInline(value, 300)
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/(^-|-$)/g, "") || "general-workspace"
   );
}

function normalizeComparable(value?: string) {
   return cleanInline(value, 2400)
      .toLowerCase()
      .replace(/[^a-z0-9$%]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function uniqueStrings(values: string[], limit = MAX_MEMORY_ITEMS) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values) {
      const clean = cleanInline(value, 1800);
      const key = normalizeComparable(clean);

      if (!clean || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(clean);
      if (result.length >= limit) break;
   }

   return result;
}

function sanitizeMessages(messages?: Array<{ role?: string; content?: string; createdAt?: number }>) {
   if (!Array.isArray(messages)) return [] as AIDockConversationMessage[];

   return messages
      .map((message) => ({
         role: message?.role === "user" ? ("user" as const) : ("assistant" as const),
         content: cleanText(message?.content, MAX_MESSAGE_LENGTH),
         createdAt: typeof message?.createdAt === "number" && Number.isFinite(message.createdAt) ? message.createdAt : Date.now(),
      }))
      .filter((message) => message.content)
      .slice(-MAX_MESSAGES_PER_THREAD);
}

function sanitizeConversationOption(option?: Partial<AIDockConversationOption>, index = 0): AIDockConversationOption {
   const title = cleanInline(option?.title, 500);
   const detail = cleanText(option?.detail, 1800);
   return {
      id: cleanInline(option?.id, 180) || `option-${index + 1}`,
      title: title || detail || `Option ${index + 1}`,
      detail: detail || title,
   };
}

function sanitizeConversationOptionSet(optionSet?: Partial<AIDockConversationOptionSet>): AIDockConversationOptionSet | undefined {
   if (!optionSet) return undefined;

   const options = Array.isArray(optionSet.options)
      ? optionSet.options
           .map((option, index) => sanitizeConversationOption(option, index))
           .filter((option) => option.title || option.detail)
           .slice(0, 8)
      : [];

   if (options.length < 2) return undefined;

   const selectedOptionId = cleanInline(optionSet.selectedOptionId, 180);
   return {
      id: cleanInline(optionSet.id, 180) || `option-set-${Date.now()}`,
      topic: cleanInline(optionSet.topic, 900),
      options,
      selectedOptionId: options.some((option) => option.id === selectedOptionId) ? selectedOptionId : "",
   };
}

function sanitizeSubject(subject?: Partial<ProjectGuidanceSubject>): ProjectGuidanceSubject {
   const kind = subject?.kind;
   const allowedKinds = ["project", "fact", "milestone", "decision", "recommendation", "risk", "update", "none"];

   return {
      kind: allowedKinds.includes(String(kind)) ? (kind as ProjectGuidanceSubject["kind"]) : "none",
      title: cleanInline(subject?.title, 500),
      detail: cleanText(subject?.detail, 1400),
      id: cleanInline(subject?.id, 180) || undefined,
   };
}

export function getAIDockConversationProjectKey(projectTitle?: string) {
   return normalizeKey(projectTitle || GENERAL_CONVERSATION_TITLE);
}

export function createEmptyAIDockConversationThread(projectTitle?: string): AIDockConversationThread {
   const cleanTitle = cleanInline(projectTitle, 240) || GENERAL_CONVERSATION_TITLE;

   return {
      version: "MK X",
      projectKey: getAIDockConversationProjectKey(cleanTitle),
      projectTitle: cleanTitle,
      messages: [],
      lastIntent: undefined,
      lastUserPrompt: "",
      lastAssistantResponse: "",
      lastRecommendation: "",
      canonicalRecommendation: "",
      currentMethod: "",
      acceptedMethod: "",
      rejectedMethods: [],
      lastMilestoneTitle: "",
      lastSubject: { kind: "none", title: "", detail: "" },
      currentTopic: "",
      activeReference: "",
      referencedOption: "",
      optionSet: undefined,
      requestedTransformation: "",
      acceptedRecommendations: [],
      rejectedRecommendations: [],
      corrections: [],
      responseMode: undefined,
      updatedAt: Date.now(),
   };
}

function sanitizeThread(thread?: Partial<AIDockConversationThread>, fallbackTitle?: string): AIDockConversationThread {
   const empty = createEmptyAIDockConversationThread(thread?.projectTitle || fallbackTitle);
   const lastIntent = cleanInline(thread?.lastIntent, 120) as ProjectGuidanceResult["intent"] | "";
   const hasSeparatedRecommendationState = Boolean(
      thread && (Object.prototype.hasOwnProperty.call(thread, "canonicalRecommendation") || Object.prototype.hasOwnProperty.call(thread, "currentMethod") || Object.prototype.hasOwnProperty.call(thread, "rejectedMethods")),
   );
   const canonicalRecommendation = hasSeparatedRecommendationState ? cleanText(thread?.canonicalRecommendation || thread?.lastRecommendation, 2400) : "";

   return {
      ...empty,
      projectKey: getAIDockConversationProjectKey(thread?.projectTitle || fallbackTitle),
      projectTitle: cleanInline(thread?.projectTitle || fallbackTitle, 240) || GENERAL_CONVERSATION_TITLE,
      messages: sanitizeMessages(thread?.messages),
      lastIntent: lastIntent || undefined,
      lastUserPrompt: cleanText(thread?.lastUserPrompt, 8000),
      lastAssistantResponse: cleanText(thread?.lastAssistantResponse, MAX_MESSAGE_LENGTH),
      lastRecommendation: canonicalRecommendation,
      canonicalRecommendation,
      currentMethod: cleanText(thread?.currentMethod, 2400),
      acceptedMethod: cleanText(thread?.acceptedMethod, 2400),
      rejectedMethods: uniqueStrings(thread?.rejectedMethods || []),
      lastMilestoneTitle: cleanInline(thread?.lastMilestoneTitle, 500),
      lastSubject: sanitizeSubject(thread?.lastSubject),
      currentTopic: cleanInline(thread?.currentTopic, 900),
      activeReference: cleanText(thread?.activeReference, 1800),
      referencedOption: cleanText(thread?.referencedOption, 1800),
      optionSet: sanitizeConversationOptionSet(thread?.optionSet),
      requestedTransformation: cleanInline(thread?.requestedTransformation, 600),
      acceptedRecommendations: uniqueStrings(thread?.acceptedRecommendations || []),
      rejectedRecommendations: uniqueStrings(thread?.rejectedRecommendations || []),
      corrections: uniqueStrings(thread?.corrections || []),
      responseMode: thread?.responseMode === "focused" || thread?.responseMode === "creative" ? thread.responseMode : thread?.responseMode === "balanced" ? "balanced" : undefined,
      updatedAt: typeof thread?.updatedAt === "number" && Number.isFinite(thread.updatedAt) ? thread.updatedAt : Date.now(),
   };
}

function readStore(): AIDockConversationStore {
   if (typeof window === "undefined") {
      return { version: "MK X", threads: {}, updatedAt: 0 };
   }

   try {
      const parsed = JSON.parse(window.localStorage.getItem(AIDOCK_CONVERSATION_STORAGE_KEY) || "{}") as Partial<AIDockConversationStore>;
      const entries = Object.entries(parsed?.threads || {})
         .map(([key, value]) => [key, sanitizeThread(value)] as const)
         .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
         .slice(0, MAX_THREADS);

      return {
         version: "MK X",
         threads: Object.fromEntries(entries),
         updatedAt: typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0,
      };
   } catch {
      return { version: "MK X", threads: {}, updatedAt: 0 };
   }
}

function writeStore(store: AIDockConversationStore) {
   if (typeof window === "undefined") return;

   try {
      const entries = Object.entries(store.threads)
         .map(([key, value]) => [key, sanitizeThread(value)] as const)
         .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
         .slice(0, MAX_THREADS);

      window.localStorage.setItem(
         AIDOCK_CONVERSATION_STORAGE_KEY,
         JSON.stringify({
            version: "MK X",
            threads: Object.fromEntries(entries),
            updatedAt: Date.now(),
         } satisfies AIDockConversationStore),
      );
   } catch {
      // Conversation persistence is helpful but non-critical. AIDock continues
      // in-memory if storage is unavailable or full.
   }
}

export function readAIDockConversationThread(projectTitle?: string) {
   const key = getAIDockConversationProjectKey(projectTitle);
   const stored = readStore().threads[key];
   return stored ? sanitizeThread(stored, projectTitle) : createEmptyAIDockConversationThread(projectTitle);
}

export function writeAIDockConversationThread(thread: AIDockConversationThread) {
   const safe = sanitizeThread({ ...thread, updatedAt: Date.now() }, thread.projectTitle);
   const store = readStore();
   store.threads[safe.projectKey] = safe;
   writeStore(store);
   return safe;
}

export function deleteAIDockConversationThread(projectTitle?: string) {
   const key = getAIDockConversationProjectKey(projectTitle);
   const store = readStore();
   if (!store.threads[key]) return;
   delete store.threads[key];
   writeStore(store);
}

export function setAIDockConversationMessages(thread: AIDockConversationThread, messages: Array<{ role: AIDockConversationRole; content: string }>) {
   const sanitizedMessages = sanitizeMessages(
      messages.map((message, index) => ({
         role: message.role,
         content: message.content,
         createdAt: Date.now() + index,
      })),
   );
   const lastUserMessage = [...sanitizedMessages].reverse().find((message) => message.role === "user");
   const lastAssistantMessage = [...sanitizedMessages].reverse().find((message) => message.role === "assistant");

   return sanitizeThread({
      ...thread,
      messages: sanitizedMessages,
      // Keep conversational references usable even when a response came from a
      // general or tool path rather than Project Guidance. Guidance recording
      // may still replace these fields with the more authoritative turn data.
      lastUserPrompt: lastUserMessage?.content || thread.lastUserPrompt,
      lastAssistantResponse: lastAssistantMessage?.content || thread.lastAssistantResponse,
      updatedAt: Date.now(),
   });
}

function getOrdinalIndex(prompt?: string) {
   const lower = normalizeComparable(prompt);
   const wordMap: Record<string, number> = {
      first: 0,
      "1st": 0,
      one: 0,
      second: 1,
      "2nd": 1,
      two: 1,
      third: 2,
      "3rd": 2,
      three: 2,
      fourth: 3,
      "4th": 3,
      four: 3,
      fifth: 4,
      "5th": 4,
      five: 4,
   };

   for (const [token, index] of Object.entries(wordMap)) {
      if (new RegExp(`\\b${token}\\b`, "i").test(lower)) return index;
   }

   const numeric = lower.match(/\b(?:option|choice|approach|idea)?\s*([1-5])\b/i)?.[1];
   return numeric ? Number(numeric) - 1 : -1;
}

function cleanOptionMarkup(value?: string) {
   return cleanInline(value, 1800)
      .replace(/^\*\*(.+?)\*\*\s*[:\-—]?\s*/i, "$1: ")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim();
}

function splitOptionTitleAndDetail(value?: string, index = 0): AIDockConversationOption {
   const clean = cleanOptionMarkup(value);
   const colonIndex = clean.indexOf(":");
   const title = colonIndex > 0 && colonIndex <= 80 ? clean.slice(0, colonIndex).trim() : `Option ${index + 1}`;
   const detail = colonIndex > 0 && colonIndex <= 80 ? clean.slice(colonIndex + 1).trim() : clean;

   return {
      id: `option-${index + 1}`,
      title: title || `Option ${index + 1}`,
      detail: detail || clean,
   };
}

function extractStructuredOptions(value?: string) {
   const clean = cleanText(value, MAX_MESSAGE_LENGTH);
   const lines = clean
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
   const numbered: AIDockConversationOption[] = [];

   for (const line of lines) {
      const match = line.match(/^(?:option\s*)?(\d+)[.):\-—]\s*(.+)$/i);
      if (!match) continue;
      const index = Number(match[1]) - 1;
      if (index < 0 || index > 9) continue;
      numbered[index] = splitOptionTitleAndDetail(match[2], index);
   }

   const dense = numbered.filter(Boolean);
   if (dense.length >= 2) return dense;

   const bullets = lines
      .map((line) => line.match(/^[-•]\s+(.+)$/)?.[1] || "")
      .filter(Boolean)
      .map((line, index) => splitOptionTitleAndDetail(line, index));

   return bullets.length >= 2 && bullets.length <= 8 ? bullets : [];
}

function buildConversationOptionSet(response: string, topic: string, previous?: AIDockConversationOptionSet) {
   const options = extractStructuredOptions(response);
   if (options.length < 2) return previous;

   const signature = normalizeComparable(`${topic}-${options.map((option) => `${option.title}-${option.detail}`).join("-")}`).slice(0, 120);
   return sanitizeConversationOptionSet({
      id: `option-set-${signature || Date.now()}`,
      topic: cleanInline(topic, 900),
      options,
      selectedOptionId: "",
   });
}

export function resolveAIDockConversationReference(prompt: string, thread: AIDockConversationThread) {
   const ordinalIndex = getOrdinalIndex(prompt);
   const asksForOption = /\b(?:option|choice|approach|idea|one)\b/i.test(prompt) && ordinalIndex >= 0;

   if (asksForOption) {
      const option = thread.optionSet?.options?.[ordinalIndex];
      if (option) return cleanText(`${option.title}: ${option.detail}`, 1800);
      return "";
   }

   const lower = normalizeComparable(prompt);
   if (/\b(?:that|this|it|that one|this one|the recommendation|the next step|the decision|the milestone|the approach)\b/i.test(lower)) {
      return cleanText(thread.referencedOption || thread.lastSubject.title || thread.lastRecommendation || thread.activeReference, 1800);
   }

   return "";
}

export function getAIDockContinuityIntent(prompt?: string): AIDockContinuityIntent {
   const lower = normalizeComparable(prompt);
   if (!lower) return "none";

   if (/\b(?:another|different|alternate|alternative)\s+(?:way|approach|method|route)\b/i.test(lower)) return "alternate-method";
   if (/\b(?:make|say|rewrite)\s+(?:that|this|it)\s+(?:shorter|brief|concise)\b|\bshorten\s+(?:that|this|it)\b/i.test(lower)) return "shorten";
   if (/\b(?:give me more detail|tell me more|expand on (?:that|this|it)|go deeper|explain (?:that|this|it) in more detail)\b/i.test(lower)) return "expand";
   if (/\b(?:make|say|explain)\s+(?:that|this|it)\s+(?:simpler|more simply|easier)\b|\bsimplify\s+(?:that|this|it)\b/i.test(lower)) return "simplify";
   if (/\b(?:rewrite|rephrase|say)\s+(?:that|this|it)\b|\bmake\s+(?:that|this|it)\s+(?:less formal|more direct|more editorial)\b/i.test(lower)) return "rewrite";

   if (/\b(?:i do not agree|i don t agree|i disagree|i do not want that|i don t want that|not that approach|that does not fit|that doesn t fit|reject that|do not use that|don t use that)\b/i.test(lower)) return "reject";
   if (/\b(?:that works|sounds good|let s do that|lets do that|i agree|go with that|use that approach|keep that plan)\b/i.test(lower)) return "accept";
   if (/^(?:actually|correction\b|i meant\b)|\b(?:that is wrong|that s wrong|that was wrong|is incorrect|should be|the correct .+ is)\b/i.test(lower)) return "correct";

   if (getOrdinalIndex(prompt) >= 0 && /\b(?:option|choice|approach|idea|one)\b/i.test(lower)) return "option-reference";
   if (/^(?:why|and then|what next|what about that|what about it|does that still make sense|what did you mean|what were we discussing|where were we|continue|keep going)\b/i.test(lower)) return "continue";

   return "none";
}

function getCorrectionStatement(prompt: string) {
   const clean = cleanInline(prompt, 1800)
      .replace(/^(?:actually|correction|i meant)\s*[:\-,]?\s*/i, "")
      .trim();
   return clean || cleanInline(prompt, 1800);
}

function isContinuityGuidanceIntent(intent?: ProjectGuidanceResult["intent"]) {
   return ["conversation-transform", "conversation-recall", "conversation-reference", "conversation-correction", "recommendation-acceptance", "recommendation-rejection", "recommendation-method", "conversation-options"].includes(intent || "");
}

function isUsableSemanticTopic(value?: string) {
   const clean = cleanInline(value, 900);
   if (!clean) return false;
   if (/^(?:what|why|how|when|where|which|who|can|could|would|should|do|does|did|is|are|give|make|tell|show)\b/i.test(clean)) return false;
   if (/\?$/.test(clean)) return false;
   return true;
}

function getSemanticConversationTopic(base: AIDockConversationThread, input: { guidance: ProjectGuidanceResult; activeMilestoneTitle?: string; optionSet?: AIDockConversationOptionSet }) {
   const keepsExistingTopic =
      isContinuityGuidanceIntent(input.guidance.intent) || ["rationale", "priority-rationale", "milestone-rationale", "material-rationale", "subject-unlock", "next-milestone"].includes(input.guidance.intent) || input.guidance.subject?.kind === "project";

   if (keepsExistingTopic && base.currentTopic) {
      return base.currentTopic;
   }

   const subjectTitle = cleanInline(input.guidance.subject?.title, 900);
   if (isUsableSemanticTopic(subjectTitle) && normalizeComparable(subjectTitle) !== normalizeComparable(base.projectTitle)) return subjectTitle;

   const milestone = cleanInline(input.activeMilestoneTitle, 500);
   return base.currentTopic || milestone || input.optionSet?.topic || base.projectTitle;
}

export function recordAIDockConversationUserPrompt(thread: AIDockConversationThread, prompt: string) {
   const safe = sanitizeThread(thread, thread.projectTitle);
   const cleanPrompt = cleanText(prompt, 8000);
   const continuityIntent = getAIDockContinuityIntent(cleanPrompt);
   const resolvedReference = resolveAIDockConversationReference(cleanPrompt, safe);
   const correctionStatement = continuityIntent === "correct" ? getCorrectionStatement(cleanPrompt) : "";
   const transformsPreviousResponse = ["shorten", "expand", "simplify", "rewrite"].includes(continuityIntent);
   const transformsRecommendation = continuityIntent === "alternate-method";
   const canonicalRecommendation = safe.canonicalRecommendation || safe.lastRecommendation;
   const methodReference = safe.currentMethod || safe.acceptedMethod || canonicalRecommendation;
   const rejectionTarget = continuityIntent === "reject" ? methodReference || safe.activeReference : "";
   const acceptanceTarget = continuityIntent === "accept" ? methodReference || safe.activeReference : "";
   const activeReference =
      correctionStatement || (transformsPreviousResponse ? safe.lastAssistantResponse : "") || (transformsRecommendation ? canonicalRecommendation : "") || rejectionTarget || acceptanceTarget || resolvedReference || safe.activeReference;
   const referencedOption = continuityIntent === "option-reference" ? resolvedReference : safe.referencedOption;
   const ordinalIndex = continuityIntent === "option-reference" ? getOrdinalIndex(cleanPrompt) : -1;
   const optionSet = safe.optionSet
      ? {
           ...safe.optionSet,
           selectedOptionId: ordinalIndex >= 0 && safe.optionSet.options[ordinalIndex] ? safe.optionSet.options[ordinalIndex].id : safe.optionSet.selectedOptionId,
        }
      : undefined;

   const accepted = continuityIntent === "accept" ? uniqueStrings([canonicalRecommendation, ...safe.acceptedRecommendations]) : safe.acceptedRecommendations;
   const rejected = safe.rejectedRecommendations;
   const acceptedMethod = continuityIntent === "accept" ? acceptanceTarget : safe.acceptedMethod;
   const rejectedMethods = continuityIntent === "reject" ? uniqueStrings([rejectionTarget, ...safe.rejectedMethods]) : safe.rejectedMethods;
   const corrections = continuityIntent === "correct" ? uniqueStrings([correctionStatement, ...safe.corrections]) : safe.corrections;
   const requestedTransformation = ["shorten", "expand", "simplify", "rewrite", "alternate-method"].includes(continuityIntent) ? cleanPrompt : "";

   return sanitizeThread({
      ...safe,
      lastUserPrompt: cleanPrompt,
      canonicalRecommendation,
      lastRecommendation: canonicalRecommendation,
      activeReference,
      referencedOption,
      optionSet,
      requestedTransformation,
      acceptedMethod,
      rejectedMethods,
      acceptedRecommendations: accepted,
      rejectedRecommendations: rejected,
      corrections,
      updatedAt: Date.now(),
   });
}

export function recordAIDockConversationGuidance(
   thread: AIDockConversationThread,
   input: {
      prompt: string;
      guidance: ProjectGuidanceResult;
      response: string;
      projectTitle: string;
      activeMilestoneTitle?: string;
      responseMode?: AllevinAIDockResponseMode;
   },
) {
   const safe = sanitizeThread(thread, input.projectTitle);
   const sameProject = safe.projectKey === getAIDockConversationProjectKey(input.projectTitle);
   const base = sameProject ? safe : createEmptyAIDockConversationThread(input.projectTitle);
   const continuityTurn = isContinuityGuidanceIntent(input.guidance.intent);
   const subject = continuityTurn || input.guidance.subject.kind === "none" ? base.lastSubject : sanitizeSubject(input.guidance.subject);
   const incomingAction = cleanText(input.guidance.nextAction, 2400);
   const previousCanonical = base.canonicalRecommendation || base.lastRecommendation;
   const changesOnlyMethod = input.guidance.intent === "recommendation-method" || input.guidance.intent === "recommendation-rejection";
   const canonicalRecommendation =
      changesOnlyMethod || input.guidance.intent === "conversation-transform" || input.guidance.intent === "conversation-reference" || input.guidance.intent === "conversation-recall" || input.guidance.intent === "conversation-correction"
         ? previousCanonical
         : incomingAction || previousCanonical;
   const actionMethod = ["next-action", "next-action-detail", "priority-decision", "project-lead", "senior-assessment"].includes(input.guidance.intent) ? cleanText(input.guidance.assessment, 2400) : "";
   const currentMethod =
      input.guidance.intent === "recommendation-method"
         ? cleanText(input.guidance.assessment, 2400) || base.currentMethod
         : input.guidance.intent === "recommendation-rejection"
           ? incomingAction || cleanText(input.guidance.assessment, 2400) || base.currentMethod
           : canonicalRecommendation && previousCanonical && normalizeComparable(canonicalRecommendation) !== normalizeComparable(previousCanonical)
             ? actionMethod
             : actionMethod || base.currentMethod;
   const optionSet = buildConversationOptionSet(input.response, base.currentTopic || cleanInline(input.activeMilestoneTitle, 500) || input.projectTitle, base.optionSet);
   const topic = getSemanticConversationTopic(base, { guidance: input.guidance, activeMilestoneTitle: input.activeMilestoneTitle, optionSet });
   const selectedOption = optionSet?.options.find((option) => option.id === optionSet.selectedOptionId);
   const activeReference =
      input.guidance.intent === "conversation-reference" && selectedOption
         ? `${selectedOption.title}: ${selectedOption.detail}`
         : input.guidance.intent === "recommendation-method" || input.guidance.intent === "recommendation-rejection"
           ? currentMethod || canonicalRecommendation || base.activeReference
           : canonicalRecommendation || subject.title || base.activeReference;

   return sanitizeThread({
      ...base,
      projectTitle: input.projectTitle,
      projectKey: getAIDockConversationProjectKey(input.projectTitle),
      lastIntent: input.guidance.intent,
      lastUserPrompt: cleanText(input.prompt, 8000),
      lastAssistantResponse: cleanText(input.response, MAX_MESSAGE_LENGTH),
      lastRecommendation: canonicalRecommendation,
      canonicalRecommendation,
      currentMethod,
      lastMilestoneTitle: subject.kind === "milestone" ? subject.title : cleanInline(input.activeMilestoneTitle, 500) || base.lastMilestoneTitle,
      lastSubject: subject,
      currentTopic: topic,
      activeReference,
      referencedOption: input.guidance.intent === "conversation-reference" && selectedOption ? `${selectedOption.title}: ${selectedOption.detail}` : base.referencedOption,
      optionSet,
      requestedTransformation: "",
      responseMode: input.responseMode || base.responseMode,
      updatedAt: Date.now(),
   });
}

export function buildAIDockLLMConversationContext(thread: AIDockConversationThread, prompt = ""): AllevinLLMConversationContext {
   const safe = sanitizeThread(thread, thread.projectTitle);
   const continuityIntent = getAIDockContinuityIntent(prompt || safe.lastUserPrompt);
   const resolvedReference = resolveAIDockConversationReference(prompt, safe);
   const transformsPreviousResponse = ["shorten", "expand", "simplify", "rewrite"].includes(continuityIntent);
   const transformsRecommendation = continuityIntent === "alternate-method";
   const activeReference = (transformsPreviousResponse ? safe.lastAssistantResponse : "") || (transformsRecommendation ? safe.lastRecommendation : "") || resolvedReference || safe.activeReference;
   const referencedOption = continuityIntent === "option-reference" ? resolvedReference || safe.referencedOption : safe.referencedOption;

   return {
      projectKey: safe.projectKey,
      projectTitle: safe.projectTitle,
      lastUserPrompt: cleanText(prompt || safe.lastUserPrompt, 8000),
      lastAssistantResponse: safe.lastAssistantResponse,
      lastRecommendation: safe.canonicalRecommendation || safe.lastRecommendation,
      canonicalRecommendation: safe.canonicalRecommendation || safe.lastRecommendation,
      currentMethod: safe.currentMethod,
      acceptedMethod: safe.acceptedMethod,
      rejectedMethods: safe.rejectedMethods,
      currentTopic: safe.currentTopic || safe.lastMilestoneTitle,
      requestedTransformation: safe.requestedTransformation,
      continuityIntent,
      activeReference,
      referencedOption,
      optionSet: safe.optionSet,
      acceptedRecommendations: safe.acceptedRecommendations,
      rejectedRecommendations: safe.rejectedRecommendations,
      corrections: safe.corrections,
      recentMessages: safe.messages.slice(-10).map((message) => ({ role: message.role, content: message.content })),
   };
}

export function isAIDockConversationThreadForProject(thread: AIDockConversationThread, projectTitle?: string) {
   return thread.projectKey === getAIDockConversationProjectKey(projectTitle);
}
