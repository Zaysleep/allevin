"use client";

import { ArrowUp, ChevronDown, MessageSquare, Trash2 } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { recordLanguageValidationFailure, requestKinLLM } from "@/lib/allevinLLMClient";
import { clearConversationDraft, readConversationDraft, stageConversationDraft } from "@/lib/allevinConversationDraft";
import { analyzeIncompleteConversationRequest, canonicalTitleIsSafe, looksLikeNewStandaloneRequest, mergeConversationDraft, replyPreservesClockFact } from "@/lib/allevinConversationIntelligence";
import { adaptationReplySuffix, captureGeneralDayContext, interpretAdaptiveDayConversation, previewAdaptiveDayConversation, reconcileLifeEventsWithRhythm } from "@/lib/allevinDayAdaptation";
import { buildRecommendationContext, interpretRecommendationConversation } from "@/lib/allevinRecommendations";
import { answerMemoryQuestion, buildMemoryContext } from "@/lib/allevinMemory";
import { answerContextualScheduleQuestion, interpretContextualLifeMutation } from "@/lib/contextualLifeIntelligence";
import { clearPendingAssistantChange, isPendingConfirmation, isPendingDecline, readPendingAssistantChange, stagePendingAssistantChange } from "@/lib/allevinPendingChange";
import { getAllevinDisplayName } from "@/lib/allevinUserProfile";
import { captureAssistantUndo, undoLastAssistantChange } from "@/lib/allevinUndo";
import { readAllevinTone } from "@/lib/allevinVoice";
import { answerDayIntelligence, assistantScheduleRelations, mergeScheduleRelationReply, preflightAssistantActions } from "@/lib/dayIntelligence";
import { buildRhythmContextForPrompt, buildRhythmNarrationContextForPrompt, interpretRhythmConversation, isRhythmMutationPrompt, readDailyRhythm } from "@/lib/dailyRhythm";
import { analyzeRecurringReminderRequest, buildDeterministicLifeReadback, interpretKinLocally } from "@/lib/lifeEngine";
import { applyKinActions, getLifeSnapshot, readLifeState } from "@/lib/lifeStore";
import { appendKinMessage, clearKinConversation, KIN_CONVERSATION_UPDATED_EVENT, readKinConversation, type KinMessage } from "@/lib/kinConversation";

export const KIN_FOCUS_EVENT = "allevin-kin-focus";

function isUndoPrompt(prompt: string) {
   return /^(?:undo(?: that)?|put it back|revert that|actually never mind|never mind that)[.!?]?$/i.test(prompt.trim());
}

function languageVariationNonce() {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
   return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function smallNumberWord(value: number) {
   const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
   const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty"];
   if (value >= 0 && value < small.length) return small[value];
   if (value >= 20 && value <= 69) {
      const ten = Math.floor(value / 10);
      const one = value % 10;
      return one ? `${tens[ten]}-${small[one]}` : tens[ten];
   }
   return "";
}

function groundedReplyIsSafe(
   reply: string,
   receipt: string,
   recentConversation: KinMessage[],
   candidateTitle = "",
   originalPrompt = "",
   responseMode: "state-ack" | "grounded" | "clarify" | "mutation-ack" = "state-ack",
   allowRepeatedWording = false,
) {
   const normalizedReply = reply.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
   if (!normalizedReply) return false;
   if (/\b(?:this is a good time to begin|get into it|keep the next step simple|you have space for this now|you've got the space for this now|use this window well|keep the transition clean|reminder (?:is )?set|scheduled reminder|stay on track|create a time buffer)\b/i.test(normalizedReply)) return false;
   if (!allowRepeatedWording && recentConversation.some((message) => message.role === "assistant" && message.content.toLowerCase().replace(/\s+/g, " ").trim() === normalizedReply)) return false;

   const normalizedReceipt = receipt.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
   if (!allowRepeatedWording && normalizedReply === normalizedReceipt) return false;

   const normalizedTitle = candidateTitle.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
   const comparableReply = normalizedReply.replace(/[^a-z0-9]+/g, " ").trim();
   // Reject a bare copied title, but do not reject a useful sentence merely
   // because it naturally begins with the action. The former length threshold
   // incorrectly discarded personal replies such as “Move the laundry … so it
   // doesn’t sit forgotten” and later reported that as a connection failure.
   if (normalizedTitle && comparableReply === normalizedTitle) return false;

   // Clock facts are strict, but natural phrasing may say "this morning"
   // instead of repeating the literal AM suffix. This keeps truth intact while
   // no longer rejecting the human wording MK XV is trying to produce.
   const clocks = receipt.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi) || [];
   const promptClocks = originalPrompt.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi) || [];
   const replyClocks = reply.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi) || [];
   const relativeMatch = originalPrompt.match(/\b(?:in|after)\s+(\d+)\s+(minutes?|hours?|days?|weeks?)\b/i);
   const relativeTiming = relativeMatch?.[0].toLowerCase().replace(/\s+/g, " ");
   const relativeWord = relativeMatch ? smallNumberWord(Number(relativeMatch[1])) : "";
   const relativeUnit = relativeMatch?.[2].toLowerCase() || "";
   const keepsRelativeTiming = Boolean(
      relativeTiming && (
         normalizedReply.includes(relativeTiming) ||
         normalizedReply.includes(`${relativeMatch?.[1]} ${relativeUnit} from now`) ||
         (relativeWord && (
            normalizedReply.includes(`${relativeWord} ${relativeUnit}`) ||
            normalizedReply.includes(`${relativeWord}-${relativeUnit.replace(/s$/, "")}`)
         ))
      ),
   );
   // Never let the model introduce a clock that is absent from the verified
   // result or the user's own request. The former implementation checked the
   // opposite direction and required every clock from a broad reminder-list
   // receipt to be repeated. That discarded useful, truthful answers when the
   // model summarized a list or focused on the reminder the user had edited.
   const authoritativeClocks = [...clocks, ...promptClocks];
   for (const clock of replyClocks) {
      if (!authoritativeClocks.some((fact) => replyPreservesClockFact(clock, fact))) return false;
   }

   // A mutation acknowledgement should still repeat its verified timing when
   // timing is the substance of the change. Read-only answers and clarification
   // questions may summarize or focus without restating every clock in state.
   if ((responseMode === "state-ack" || responseMode === "mutation-ack") && clocks.length && !keepsRelativeTiming) {
      if (!clocks.some((clock) => replyPreservesClockFact(normalizedReply, clock))) return false;
   }
   return true;
}

function replyIsQuestion(value: string) {
   const normalized = value.trim();
   return /\?\s*$/.test(normalized) || /^(?:should|would|do|does|did|is|are|am|can|could|will|what|when|where|which|who|how)\b/i.test(normalized);
}

/**
 * Date-scoped judgment should be grounded in ALLEVIN's authoritative state,
 * not in prose from earlier turns. A previous message may describe Thursday
 * while the user is now asking about "now"; the stored reality overlay already
 * preserves the useful fact with its date, so replaying that prose only creates
 * a second, less reliable source of temporal truth.
 *
 * This is deliberately general: any explicit present/future-day judgment uses
 * state as the continuity layer rather than trying to infer date scope from old
 * chat wording.
 */
function conversationForJudgment(prompt: string, conversation: KinMessage[]) {
   const lower = prompt.toLowerCase();
   const asksScopedJudgment =
      /\b(?:now|today|tonight|tomorrow|day after tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower) &&
      /\b(?:what|how|should|when|free|next|change|look like|do)\b/.test(lower);

   return asksScopedJudgment ? [] : conversation.slice(-10);
}

/**
 * Deterministic code owns the state mutation; the model only owns delivery.
 * This prevents ALLEVIN's reality engine from depending on an LLM while also
 * avoiding canned implementation-sounding acknowledgements in the chat UI.
 */
async function phraseStateAcknowledgement(
   prompt: string,
   stateReceipt: string,
   narrationFacts: string[] = [],
   recentConversation: KinMessage[] = [],
   responseMode: "state-ack" | "grounded" | "clarify" = "state-ack",
) {
   const lifeState = readLifeState();
   const rhythmState = readDailyRhythm();
   const snapshot = getLifeSnapshot(lifeState);
   const recentReplies = recentConversation
      .filter((message) => message.role === "assistant")
      .slice(-10)
      .map((message) => message.content);
   let rejectedReply = "";
   let providerUnavailable = false;

   // A second targeted attempt is cheaper and more useful than immediately
   // exposing a machine receipt when the first response is repetitive. The
   // retry still receives only verified state and can never mutate anything.
   for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await requestKinLLM({
         mode: "kin-life",
         responseMode,
         // The receipt sent to the model is intentionally neutral. The actual
         // adaptation result is already visible in authoritative state below.
         // Feeding implementation-flavored fallback copy ("recovery mode",
         // "occurrence", etc.) made the model echo those phrases back to users.
         stateReceipt: narrationFacts.length
            ? [
                 "The requested state change was applied successfully.",
                 "Do not ask for confirmation. The action is already complete.",
                 "Use these facts as factual anchors, not as copy:",
                 ...narrationFacts.map((fact) => `- ${fact}`),
              ].join("\n")
            : responseMode === "clarify"
               ? `Ask the user this one unresolved question. Do not answer it for them:\n${stateReceipt}`
               : `The verified result below is already final. Do not ask for confirmation or another follow-up question:\n${stateReceipt}`,
         input: prompt,
         nowIso: new Date().toISOString(),
         timezoneOffsetMinutes: new Date().getTimezoneOffset(),
         displayName: getAllevinDisplayName(""),
         assistantContext: buildRhythmNarrationContextForPrompt(rhythmState, prompt),
         voiceStyle: readAllevinTone(),
         lifeItems: snapshot.items,
         conversation: [],
         recentReplies: [...recentReplies, ...(rejectedReply ? [rejectedReply] : [])],
         variationNonce: languageVariationNonce(),
         rejectedReply: rejectedReply || undefined,
      });
      if (response.usedFallback || !response.reply) {
         providerUnavailable = providerUnavailable || response.usedFallback;
         continue;
      }

      const natural = response.reply
         .replace(/^(?:got it|understood|noted|okay|all right|alright)[.!,:;—-]*\s*/i, "")
         .trim();
      const questionShapeIsSafe = responseMode === "clarify" ? replyIsQuestion(natural) : !replyIsQuestion(natural);
      if (natural && questionShapeIsSafe && groundedReplyIsSafe(
         natural,
         stateReceipt,
         recentConversation,
         "",
         prompt,
         responseMode,
         attempt === 2,
      )) return natural;
      rejectedReply = natural || response.reply;
   }
   if (responseMode === "state-ack" && rejectedReply) recordLanguageValidationFailure(responseMode, "generated-copy-rejected");
   if (providerUnavailable || rejectedReply) return "";
   return "";
}

async function prepareMutationLanguage(
   prompt: string,
   stateReceipt: string,
   candidateTitle: string,
   recentConversation: KinMessage[],
) {
   const lifeState = readLifeState();
   const rhythmState = readDailyRhythm();
   const recentReplies = recentConversation
      .filter((message) => message.role === "assistant")
      .slice(-10)
      .map((message) => message.content);
   let rejectedReply = "";
   let refinedTitle = candidateTitle;
   let providerUnavailable = false;

   for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await requestKinLLM({
         mode: "kin-life",
         responseMode: "mutation-ack",
         stateReceipt,
         candidateTitle,
         input: prompt,
         nowIso: new Date().toISOString(),
         timezoneOffsetMinutes: new Date().getTimezoneOffset(),
         displayName: getAllevinDisplayName(""),
         assistantContext: buildRhythmNarrationContextForPrompt(rhythmState, prompt),
         voiceStyle: readAllevinTone(),
         lifeItems: getLifeSnapshot(lifeState).items,
         conversation: [],
         recentReplies: [...recentReplies, ...(rejectedReply ? [rejectedReply] : [])],
         variationNonce: languageVariationNonce(),
         rejectedReply: rejectedReply || undefined,
      });
      refinedTitle = canonicalTitleIsSafe(candidateTitle, response.canonicalTitle) || refinedTitle;
      if (response.usedFallback || !response.reply) {
         providerUnavailable = providerUnavailable || response.usedFallback;
         continue;
      }
      if (!replyIsQuestion(response.reply) && groundedReplyIsSafe(
         response.reply,
         stateReceipt,
         recentConversation,
         candidateTitle,
         prompt,
         "mutation-ack",
         attempt === 2,
      )) {
         return { reply: response.reply, title: refinedTitle };
      }
      rejectedReply = response.reply;
   }

   if (rejectedReply) recordLanguageValidationFailure("mutation-ack", "generated-copy-rejected");
   return {
      reply: "",
      title: refinedTitle,
   };
}

export default function KinDock() {
   const [open, setOpen] = useState(false);
   const [input, setInput] = useState("");
   const [messages, setMessages] = useState<KinMessage[]>([]);
   const [busy, setBusy] = useState(false);
   const [languageStatus, setLanguageStatus] = useState("");
   const [checkpointTitle, setCheckpointTitle] = useState("");
   const inputRef = useRef<HTMLInputElement>(null);
   const scrollRef = useRef<HTMLDivElement>(null);
   const sendLockRef = useRef(false);

   useEffect(() => {
      const initialRefresh = window.setTimeout(() => setMessages(readKinConversation()), 0);
      const refresh = () => setMessages(readKinConversation());
      const focusAllevin = () => {
         setOpen(true);
         window.setTimeout(() => inputRef.current?.focus(), 60);
      };
      window.addEventListener(KIN_CONVERSATION_UPDATED_EVENT, refresh);
      window.addEventListener(KIN_FOCUS_EVENT, focusAllevin);
      return () => {
         window.clearTimeout(initialRefresh);
         window.removeEventListener(KIN_CONVERSATION_UPDATED_EVENT, refresh);
         window.removeEventListener(KIN_FOCUS_EVENT, focusAllevin);
      };
   }, []);

   useEffect(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("allevinCheckpoint") !== "1" && url.searchParams.get("allevinEvent") !== "1") return;
      const title = (url.searchParams.get("title") || "").trim().slice(0, 80);
      setCheckpointTitle(title);
      setOpen(true);
      for (const key of ["allevinCheckpoint", "allevinEvent", "source", "id", "date", "title"]) url.searchParams.delete(key);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.setTimeout(() => inputRef.current?.focus(), 80);
   }, []);

   useEffect(() => {
      if (open) window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 30);
   }, [messages, open, busy]);

   const quickPrompts = useMemo(() => ["What should I do next?", "When am I free?", "What’s coming up?"], []);

   function deliver(content: string) {
      if (content.trim()) {
         setLanguageStatus("");
         appendKinMessage("assistant", content);
      } else {
         setLanguageStatus("That reply didn’t make it through. You don’t need to repeat yourself—your saved reminders are still available in Coming Up.");
      }
   }

   async function send(text: string) {
      const submittedPrompt = text.trim();
      if (!submittedPrompt || busy || sendLockRef.current) return;
      sendLockRef.current = true;
      setOpen(true);
      setInput("");
      setBusy(true);
      const conversationBefore = readKinConversation();
      let prompt = submittedPrompt;
      if (
         checkpointTitle &&
         /^(?:it|that|this|the event|the appointment|the meeting)?\s*(?:is|was|got|has been)?\s*(?:cancelled|canceled|off|not happening)|^(?:i'?m|i am)\s+(?:not going|running late)|^running\s+\d{1,3}\s+minutes?\s+late/i.test(submittedPrompt)
      ) {
         // The visible chat preserves the user's natural follow-up. Internally,
         // attach only the verified title from the notification they opened so
         // deterministic matching can resolve "it" without guessing.
         prompt = `${checkpointTitle}: ${submittedPrompt}`;
      }
      appendKinMessage("user", submittedPrompt);
      setLanguageStatus("");

      try {
         if (isUndoPrompt(prompt)) {
            const undone = undoLastAssistantChange();
            const reply = await phraseStateAcknowledgement(
               prompt,
               undone.restored ? "The most recent assistant change was restored." : "There is no recent assistant change available to restore.",
               [],
               conversationBefore,
               "grounded",
            );
            deliver(reply);
            return;
         }

         const tone = readAllevinTone();
         const currentState = readLifeState();
         const currentRhythm = readDailyRhythm();

         const conversationDraft = readConversationDraft();
         if (conversationDraft && isPendingDecline(submittedPrompt)) {
            clearConversationDraft();
            const reply = await phraseStateAcknowledgement(
               submittedPrompt,
               "The unfinished request was discarded. Nothing was saved.",
               [],
               conversationBefore,
               "grounded",
            );
            deliver(reply);
            return;
         }
         if (conversationDraft) {
            if (looksLikeNewStandaloneRequest(submittedPrompt)) clearConversationDraft();
            else prompt = mergeConversationDraft(conversationDraft.prompt, submittedPrompt);
         }

         const recurringCompleteness = analyzeRecurringReminderRequest(prompt, currentRhythm.bedtime);
         const completeness = recurringCompleteness.incomplete
            ? { incomplete: true, clarification: recurringCompleteness.clarification }
            : analyzeIncompleteConversationRequest(prompt);
         if (completeness.incomplete) {
            stageConversationDraft(prompt);
            const factualClarification = completeness.clarification || "What detail should I add before I save this?";
            const reply = await phraseStateAcknowledgement(
               prompt,
               factualClarification,
               [],
               conversationBefore,
               "clarify",
            );
            deliver(reply);
            return;
         }
         if (conversationDraft) clearConversationDraft();

         // Significant cascades and explicit conflicts are staged before any
         // state write. Confirmation reuses the deterministic plan; the LLM
         // never becomes the authority for what changed.
         const pending = readPendingAssistantChange();
         if (pending && isPendingDecline(prompt)) {
            clearPendingAssistantChange();
            const reply = await phraseStateAcknowledgement(
               prompt,
               "The proposed change was not applied. The schedule remains unchanged.",
               [],
               conversationBefore,
               "grounded",
            );
            deliver(reply);
            return;
         }
         if (pending && isPendingConfirmation(prompt)) {
            clearPendingAssistantChange();
            if (pending.kind === "adaptation") {
               const confirmed = interpretAdaptiveDayConversation(pending.prompt, currentState, currentRhythm, tone);
               const reply = await phraseStateAcknowledgement(pending.prompt, confirmed.reply, confirmed.narrationFacts, conversationBefore);
               deliver(reply);
               return;
            }
            captureAssistantUndo(pending.prompt);
            const relations = assistantScheduleRelations(pending.actions, currentState, currentRhythm, pending.prompt);
            const applied = applyKinActions(pending.actions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const rawReply = pending.reply || (applied.applied.length ? applied.applied.join(". ") : "Done.");
            const factualReply = `${mergeScheduleRelationReply(rawReply, relations)}${adaptationReplySuffix(reconciled)}`;
            const reply = await phraseStateAcknowledgement(pending.prompt, factualReply, [], conversationBefore);
            deliver(reply);
            return;
         }

         const adaptivePreview = previewAdaptiveDayConversation(prompt, currentRhythm);
         if (adaptivePreview.handled) {
            if (adaptivePreview.requiresConfirmation) stagePendingAssistantChange({ kind: "adaptation", prompt });
            const reply = await phraseStateAcknowledgement(prompt, adaptivePreview.reply, [], conversationBefore, "clarify");
            deliver(reply);
            return;
         }

         const contextualMutation = interpretContextualLifeMutation(prompt, currentState, currentRhythm, conversationBefore);
         if (contextualMutation.handled) {
            if (!contextualMutation.actions.length) {
               const reply = await phraseStateAcknowledgement(prompt, contextualMutation.reply, [], conversationBefore, "grounded");
               deliver(reply);
               return;
            }
            const conflict = preflightAssistantActions(contextualMutation.actions, currentState, currentRhythm, prompt);
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: contextualMutation.reply, actions: contextualMutation.actions });
               const reply = await phraseStateAcknowledgement(prompt, `${conflict} Confirmation is required before applying the change.`, [], conversationBefore, "clarify");
               deliver(reply);
               return;
            }
            captureAssistantUndo(prompt);
            applyKinActions(contextualMutation.actions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const factualReply = `${contextualMutation.reply}${adaptationReplySuffix(reconciled)}`;
            const reply = await phraseStateAcknowledgement(prompt, factualReply, [], conversationBefore);
            deliver(reply);
            return;
         }

         // High-confidence reality changes are applied before recommendations or
         // the LLM. "Skip gym today" must never be interpreted as deleting the
         // permanent Exercise routine.
         const adaptation = interpretAdaptiveDayConversation(prompt, currentState, currentRhythm, tone);
         if (adaptation.handled) {
            const reply = await phraseStateAcknowledgement(
               prompt,
               adaptation.reply,
               adaptation.narrationFacts,
               conversationBefore,
            );
            deliver(reply);
            return;
         }

         // Even when there is no deterministic mutation to make, situational
         // context is saved as a today-only overlay so downstream judgment can
         // use what the user just told ALLEVIN.
         const contextReply = captureGeneralDayContext(prompt, currentRhythm);
         const effectiveRhythm = contextReply ? readDailyRhythm() : currentRhythm;

         // Context-only facts should stay in the date-scoped reality overlay.
         // Do not send them on to the LLM where they could accidentally become
         // fake Calendar commitments (for example, a car being in the shop).
         if (contextReply) {
            const reply = await phraseStateAcknowledgement(prompt, contextReply, [], conversationBefore);
            deliver(reply);
            return;
         }

         const recommendation = interpretRecommendationConversation(prompt, currentState, effectiveRhythm, tone);
         if (recommendation.handled) {
            const reply = await phraseStateAcknowledgement(prompt, recommendation.reply, [], conversationBefore, "grounded");
            deliver(reply);
            return;
         }

         const contextualAnswer = answerContextualScheduleQuestion(prompt, currentState, effectiveRhythm, conversationBefore, {
            bedtime: effectiveRhythm.bedtime,
         });
         if (contextualAnswer.handled) {
            const reply = await phraseStateAcknowledgement(prompt, contextualAnswer.reply, [], conversationBefore, "grounded");
            deliver(reply);
            return;
         }

         const memoryAnswer = answerMemoryQuestion(prompt, effectiveRhythm, tone);
         if (memoryAnswer.handled) {
            const reply = await phraseStateAcknowledgement(prompt, memoryAnswer.reply, [], conversationBefore, "grounded");
            deliver(reply);
            return;
         }

         const dayIntelligence = answerDayIntelligence(prompt, currentState, effectiveRhythm, tone);
         if (dayIntelligence.handled) {
            const reply = await phraseStateAcknowledgement(prompt, dayIntelligence.reply, [], conversationBefore, "grounded");
            deliver(reply);
            return;
         }

         if (isRhythmMutationPrompt(prompt)) captureAssistantUndo(prompt);
         const rhythmResult = interpretRhythmConversation(prompt, effectiveRhythm, tone);
         if (rhythmResult.handled) {
            // A newly added/moved routine may collide with an already-recorded
            // one-off commitment, so re-run the deterministic event reconciler.
            if (rhythmResult.changed) reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const reply = await phraseStateAcknowledgement(
               prompt,
               rhythmResult.reply,
               [],
               conversationBefore,
               rhythmResult.changed ? "state-ack" : "grounded",
            );
            deliver(reply);
            return;
         }

         const deterministicReadback = buildDeterministicLifeReadback(prompt, currentState);
         if (deterministicReadback) {
            const reply = await phraseStateAcknowledgement(prompt, deterministicReadback, [], conversationBefore, "grounded");
            deliver(reply);
            return;
         }

         // Obvious create/move/complete/remove requests should not depend on the
         // model returning a tool action. The model can still handle ambiguous
         // language, but deterministic ALLEVIN state logic owns high-confidence
         // mutations such as “I have a dentist appointment at 4:45” or
         // “Remind me at 4:45 to test notifications.”
         const deterministicMutation = interpretKinLocally(prompt, currentState);
         if (deterministicMutation.actions.length) {
            let mutationActions = deterministicMutation.actions;
            let preparedReply = "";
            const createIndex = mutationActions.findIndex((action) => action.type === "create_item" && action.item?.title);
            if (createIndex >= 0) {
               const candidateTitle = mutationActions[createIndex].item?.title || "";
               const preliminaryRelations = assistantScheduleRelations(
                  mutationActions,
                  currentState,
                  effectiveRhythm,
                  prompt,
               );
               const language = await prepareMutationLanguage(
                  prompt,
                  mergeScheduleRelationReply(deterministicMutation.reply, preliminaryRelations),
                  candidateTitle,
                  conversationBefore,
               );
               mutationActions = mutationActions.map((action, index) =>
                  index === createIndex
                     ? { ...action, item: { ...action.item, title: language.title } }
                     : action,
               );
               preparedReply = language.reply;
            }
            const conflict = preflightAssistantActions(
               mutationActions,
               currentState,
               effectiveRhythm,
               prompt,
            );
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: preparedReply || deterministicMutation.reply, actions: mutationActions });
               const reply = await phraseStateAcknowledgement(prompt, `${conflict} Confirmation is required before adding it.`, [], conversationBefore, "clarify");
               deliver(reply);
               return;
            }

            const relations = assistantScheduleRelations(
               mutationActions,
               currentState,
               effectiveRhythm,
               prompt,
            );
            captureAssistantUndo(prompt);
            const applied = applyKinActions(mutationActions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const rawReply = deterministicMutation.reply || (applied.applied.length ? applied.applied.join(". ") : "Done.");
            const factualReply = `${mergeScheduleRelationReply(rawReply, relations)}${adaptationReplySuffix(reconciled)}`;
            const reply = await phraseStateAcknowledgement(prompt, factualReply, [], conversationBefore);
            deliver(reply);
            return;
         }

         const snapshot = getLifeSnapshot(currentState);
         const response = await requestKinLLM({
            mode: "kin-life",
            input: prompt,
            nowIso: new Date().toISOString(),
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            displayName: getAllevinDisplayName(""),
            assistantContext: `${buildRhythmContextForPrompt(effectiveRhythm, prompt)}
${buildRecommendationContext()}
${buildMemoryContext(effectiveRhythm, tone)}`,
            voiceStyle: tone,
            lifeItems: snapshot.items,
            conversation: conversationForJudgment(prompt, conversationBefore)
               .map((message) => ({ role: message.role, content: message.content })),
            recentReplies: conversationBefore
               .filter((message) => message.role === "assistant")
               .slice(-10)
               .map((message) => message.content),
            variationNonce: languageVariationNonce(),
         });

         if (!response.usedFallback && (response.reply || response.actions.length)) {
            const conflict = preflightAssistantActions(response.actions, currentState, effectiveRhythm, prompt);
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: response.reply, actions: response.actions });
               const reply = await phraseStateAcknowledgement(prompt, `${conflict} Confirmation is required before applying the change.`, [], conversationBefore, "clarify");
               deliver(reply);
               return;
            }

            const relations = assistantScheduleRelations(
               response.actions,
               currentState,
               effectiveRhythm,
               prompt,
            );
            if (response.actions.length) captureAssistantUndo(prompt);
            const applied = applyKinActions(response.actions);

            // Life events are authoritative hard commitments. After the LLM
            // creates/moves/cancels one, recalculate elastic routines for the
            // affected near-term days instead of stacking everything blindly.
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const rawReply = response.reply || (applied.applied.length ? applied.applied.join(". ") : "Done.");
            const factualReply = `${mergeScheduleRelationReply(rawReply, relations)}${adaptationReplySuffix(reconciled)}`;
            const reply = response.actions.length
               ? await phraseStateAcknowledgement(prompt, factualReply, [], conversationBefore)
               : response.reply;
            deliver(reply);
         } else {
            const local = interpretKinLocally(prompt, currentState);
            const conflict = preflightAssistantActions(local.actions, currentState, effectiveRhythm, prompt);
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: local.reply, actions: local.actions });
               const reply = await phraseStateAcknowledgement(prompt, `${conflict} Confirmation is required before applying the change.`, [], conversationBefore, "clarify");
               deliver(reply);
               return;
            }

            if (local.actions.length) captureAssistantUndo(prompt);
            const applied = applyKinActions(local.actions);
            reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const factualReply = local.reply || (applied.applied.length ? applied.applied.join(". ") : "I couldn’t confidently apply that request.");
            const reply = await phraseStateAcknowledgement(prompt, factualReply, [], conversationBefore, local.incomplete ? "clarify" : "grounded");
            deliver(reply);
         }
      } catch {
         const currentState = readLifeState();
         const currentRhythm = readDailyRhythm();
         const local = interpretKinLocally(prompt, currentState);
         const conflict = preflightAssistantActions(local.actions, currentState, currentRhythm, prompt);
         if (conflict) {
            stagePendingAssistantChange({ kind: "actions", prompt, reply: local.reply, actions: local.actions });
            const reply = await phraseStateAcknowledgement(prompt, `${conflict} Confirmation is required before applying the change.`, [], conversationBefore, "clarify");
            deliver(reply);
            return;
         }
         if (local.actions.length) captureAssistantUndo(prompt);
         const applied = applyKinActions(local.actions);
         reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
         const factualReply = local.reply || (applied.applied.length ? applied.applied.join(". ") : "I couldn’t confidently apply that request.");
         const reply = await phraseStateAcknowledgement(prompt, factualReply, [], conversationBefore, local.incomplete ? "clarify" : "grounded");
         deliver(reply);
      } finally {
         sendLockRef.current = false;
         setBusy(false);
      }
   }

   function submit(event: FormEvent) {
      event.preventDefault();
      void send(input);
   }

   return (
      <div className={`kin-shell ${open ? "kin-shell-open" : ""}`}>
         {open ? (
            <section className="kin-panel" aria-label="ALLEVIN conversation">
               <header className="kin-panel-header">
                  <div className="kin-title">
                     <img className="kin-logo-image" src="/allevin-mark.svg" alt="" aria-hidden="true" />
                     <strong>ALLEVIN</strong>
                  </div>
                  <div className="kin-header-actions">
                     <button className="icon-button" onClick={() => { clearKinConversation(); clearConversationDraft(); setMessages([]); }} aria-label="Clear ALLEVIN conversation"><Trash2 size={16} /></button>
                     <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close ALLEVIN"><ChevronDown size={18} /></button>
                  </div>
               </header>

               <div className="kin-messages" ref={scrollRef}>
                  {messages.length ? (
                     messages.slice(-24).map((message) => (
                        <div key={message.id} className={`kin-message ${message.role === "user" ? "kin-message-user" : "kin-message-assistant"}`}>
                           <p>{message.content}</p>
                        </div>
                     ))
                  ) : (
                     <div className="kin-empty">
                        <img className="kin-empty-logo" src="/allevin-mark.svg" alt="" aria-hidden="true" />
                        <strong>What’s on your mind?</strong>
                     </div>
                  )}
                  {busy ? <div className="kin-thinking">Working through it…</div> : null}
                  {languageStatus ? <div className="kin-language-status" role="status">{languageStatus}</div> : null}
               </div>

               {!messages.length ? (
                  <div className="kin-quick-prompts">
                     {quickPrompts.map((prompt) => <button key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}
                  </div>
               ) : null}

               <form className="kin-composer" onSubmit={submit}>
                  <input
                     ref={inputRef}
                     value={input}
                     onChange={(event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value)}
                     placeholder={checkpointTitle ? `What changed with ${checkpointTitle}?` : "Tell ALLEVIN what changed…"}
                     aria-label="Talk to ALLEVIN"
                     disabled={busy}
                  />
                  <button className="kin-send" type="submit" disabled={!input.trim() || busy} aria-label="Send to ALLEVIN"><ArrowUp size={18} /></button>
               </form>
            </section>
         ) : (
            <button
               type="button"
               className="kin-launch"
               onClick={() => {
                  setOpen(true);
                  window.setTimeout(() => inputRef.current?.focus(), 60);
               }}
               aria-label="Talk to ALLEVIN"
            >
               <MessageSquare size={16} />
               <span>Talk to ALLEVIN</span>
            </button>
         )}
      </div>
   );
}
