"use client";

import { ArrowUp, ChevronDown, MessageSquare, Trash2 } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { requestKinLLM } from "@/lib/allevinLLMClient";
import { adaptationReplySuffix, captureGeneralDayContext, interpretAdaptiveDayConversation, previewAdaptiveDayConversation, reconcileLifeEventsWithRhythm } from "@/lib/allevinDayAdaptation";
import { buildRecommendationContext, interpretRecommendationConversation } from "@/lib/allevinRecommendations";
import { buildLifestyleContext, interpretLifestyleConversation, readLifestyleProfile } from "@/lib/allevinLifestyleProfile";
import { answerMemoryQuestion, buildMemoryContext } from "@/lib/allevinMemory";
import { answerContextualScheduleQuestion, interpretContextualLifeMutation } from "@/lib/contextualLifeIntelligence";
import { clearPendingAssistantChange, isPendingConfirmation, isPendingDecline, readPendingAssistantChange, stagePendingAssistantChange } from "@/lib/allevinPendingChange";
import { getAllevinDisplayName } from "@/lib/allevinUserProfile";
import { captureAssistantUndo, undoLastAssistantChange } from "@/lib/allevinUndo";
import { readAllevinTone } from "@/lib/allevinVoice";
import { answerDayIntelligence, assistantScheduleRelations, mergeScheduleRelationReply, preflightAssistantActions } from "@/lib/dayIntelligence";
import { buildRhythmContextForPrompt, buildRhythmNarrationContextForPrompt, interpretRhythmConversation, isRhythmMutationPrompt, readDailyRhythm, setRhythmCompletion, skipRhythmAnchor } from "@/lib/dailyRhythm";
import { buildDeterministicLifeReadback, interpretKinLocally } from "@/lib/lifeEngine";
import { applyKinActions, getLifeSnapshot, readLifeState } from "@/lib/lifeStore";
import { appendKinMessage, clearKinConversation, KIN_CONVERSATION_UPDATED_EVENT, readKinConversation, type KinMessage } from "@/lib/kinConversation";

export const KIN_FOCUS_EVENT = "allevin-kin-focus";

function isUndoPrompt(prompt: string) {
   return /^(?:undo(?: that)?|put it back|revert that|actually never mind|never mind that)[.!?]?$/i.test(prompt.trim());
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
) {
   const lifeState = readLifeState();
   const rhythmState = readDailyRhythm();
   const snapshot = getLifeSnapshot(lifeState);
   const response = await requestKinLLM({
      mode: "kin-life",
      responseMode: "state-ack",
      // The receipt sent to the model is intentionally neutral. The actual
      // adaptation result is already visible in authoritative state below.
      // Feeding implementation-flavored fallback copy ("recovery mode",
      // "occurrence", etc.) made the model echo those phrases back to users.
      stateReceipt: narrationFacts.length
         ? [
              "The requested state change was applied successfully.",
              "Use these facts as factual anchors, not as copy:",
              ...narrationFacts.map((fact) => `- ${fact}`),
           ].join("\n")
         : "The requested temporary day-state change was applied successfully. Describe only the practical consequence supported by the authoritative state.",
      input: prompt,
      nowIso: new Date().toISOString(),
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      displayName: getAllevinDisplayName(""),
      // A state acknowledgement only needs the visible result of that change.
      // Lifestyle/recommendation memory is intentionally omitted so unrelated
      // preferences cannot color a simple factual acknowledgement.
      assistantContext: buildRhythmNarrationContextForPrompt(rhythmState, prompt),
      voiceStyle: readAllevinTone(),
      lifeItems: snapshot.items,
      // Acknowledging a completed mutation does not need prior prose. The
      // current state is the continuity source, which also prevents a future
      // day's language from leaking into the acknowledgement.
      conversation: [],
   });

   // The deterministic receipt remains the offline/provider-failure fallback.
   // It is never allowed to make a second mutation; the server forces actions
   // to [] for state-ack requests.
   if (response.usedFallback || !response.reply) return stateReceipt;

   // Short acknowledgement filler makes ALLEVIN sound like a ticketing system.
   // Strip only generic lead-ins; the model still owns the substantive wording.
   const natural = response.reply
      .replace(/^(?:got it|understood|noted|okay|all right|alright)[.!,:;—-]*\s*/i, "")
      .trim();
   return natural || stateReceipt;
}

export default function KinDock() {
   const [open, setOpen] = useState(false);
   const [input, setInput] = useState("");
   const [messages, setMessages] = useState<KinMessage[]>([]);
   const [busy, setBusy] = useState(false);
   const inputRef = useRef<HTMLInputElement>(null);
   const scrollRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      setMessages(readKinConversation());
      const refresh = () => setMessages(readKinConversation());
      const focusAllevin = () => {
         setOpen(true);
         window.setTimeout(() => inputRef.current?.focus(), 60);
      };
      window.addEventListener(KIN_CONVERSATION_UPDATED_EVENT, refresh);
      window.addEventListener(KIN_FOCUS_EVENT, focusAllevin);
      return () => {
         window.removeEventListener(KIN_CONVERSATION_UPDATED_EVENT, refresh);
         window.removeEventListener(KIN_FOCUS_EVENT, focusAllevin);
      };
   }, []);

   useEffect(() => {
      // Notification buttons return intent to the foreground app. Only this
      // deterministic state layer may mark/skip an occurrence; the service
      // worker itself never claims completion or replans a day.
      const processAction = () => {
         const params = new URLSearchParams(window.location.search);
         const action = params.get("allevinNotificationAction");
         const source = params.get("source");
         const id = params.get("id");
         const dateKey = params.get("date");
         if (!action || !id || !dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
         const [year, month, day] = dateKey.split("-").map(Number);
         const date = new Date(year, month - 1, day, 12, 0, 0, 0);

         if (action === "running-late") {
            setOpen(true);
            setInput("I’m running late by ");
            appendKinMessage("assistant", "How many minutes late are you? I’ll preview what needs to move before changing the day.");
            window.setTimeout(() => inputRef.current?.focus(), 60);
         } else if (source === "rhythm" && action === "done") {
            const rhythm = readDailyRhythm();
            const title = rhythm.anchors.find((anchor) => anchor.id === id)?.title || "That routine";
            setRhythmCompletion(rhythm, id, true, date);
            appendKinMessage("assistant", `${title} is done.`);
         } else if (source === "rhythm" && action === "skip") {
            const rhythm = readDailyRhythm();
            const title = rhythm.anchors.find((anchor) => anchor.id === id)?.title || "That routine";
            skipRhythmAnchor(rhythm, id, date, "skipped", "Skipped from notification action");
            appendKinMessage("assistant", `${title} is skipped for this day.`);
         } else if (source === "life" && (action === "done" || action === "skip")) {
            applyKinActions([{ type: action === "done" ? "complete_item" : "archive_item", targetId: id }]);
            appendKinMessage("assistant", action === "done" ? "Marked done." : "Removed from the active day.");
         }

         params.delete("allevinNotificationAction");
         params.delete("source");
         params.delete("id");
         params.delete("date");
         const query = params.toString();
         window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      };
      const timeout = window.setTimeout(processAction, 0);
      return () => window.clearTimeout(timeout);
   }, []);

   useEffect(() => {
      if (open) window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 30);
   }, [messages, open, busy]);

   const quickPrompts = useMemo(() => ["What should I do next?", "When am I free?", "What’s coming up?"], []);

   async function send(text: string) {
      const prompt = text.trim();
      if (!prompt || busy) return;
      setOpen(true);
      setInput("");
      setBusy(true);
      const conversationBefore = readKinConversation();
      appendKinMessage("user", prompt);

      try {
         if (isUndoPrompt(prompt)) {
            const undone = undoLastAssistantChange();
            appendKinMessage("assistant", undone.restored ? "Put it back." : "There is nothing recent to undo.");
            return;
         }

         const tone = readAllevinTone();
         const currentState = readLifeState();
         const currentRhythm = readDailyRhythm();

         // Significant cascades and explicit conflicts are staged before any
         // state write. Confirmation reuses the deterministic plan; the LLM
         // never becomes the authority for what changed.
         const pending = readPendingAssistantChange();
         if (pending && isPendingDecline(prompt)) {
            clearPendingAssistantChange();
            appendKinMessage("assistant", "Left it alone.");
            return;
         }
         if (pending && isPendingConfirmation(prompt)) {
            clearPendingAssistantChange();
            if (pending.kind === "adaptation") {
               const confirmed = interpretAdaptiveDayConversation(pending.prompt, currentState, currentRhythm, tone);
               const reply = await phraseStateAcknowledgement(pending.prompt, confirmed.reply, confirmed.narrationFacts);
               appendKinMessage("assistant", reply);
               return;
            }
            captureAssistantUndo(pending.prompt);
            const relations = assistantScheduleRelations(pending.actions, currentState, currentRhythm, pending.prompt);
            const applied = applyKinActions(pending.actions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const rawReply = pending.reply || (applied.applied.length ? applied.applied.join(". ") : "Done.");
            appendKinMessage("assistant", `${mergeScheduleRelationReply(rawReply, relations)}${adaptationReplySuffix(reconciled)}`);
            return;
         }

         const adaptivePreview = previewAdaptiveDayConversation(prompt, currentRhythm);
         if (adaptivePreview.handled) {
            if (adaptivePreview.requiresConfirmation) stagePendingAssistantChange({ kind: "adaptation", prompt });
            appendKinMessage("assistant", adaptivePreview.reply);
            return;
         }

         const contextualMutation = interpretContextualLifeMutation(prompt, currentState, currentRhythm, conversationBefore);
         if (contextualMutation.handled) {
            if (!contextualMutation.actions.length) {
               appendKinMessage("assistant", contextualMutation.reply);
               return;
            }
            const conflict = preflightAssistantActions(contextualMutation.actions, currentState, currentRhythm, prompt);
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: contextualMutation.reply, actions: contextualMutation.actions });
               appendKinMessage("assistant", `${conflict}\n\nMake the change anyway?`);
               return;
            }
            captureAssistantUndo(prompt);
            applyKinActions(contextualMutation.actions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            appendKinMessage("assistant", `${contextualMutation.reply}${adaptationReplySuffix(reconciled)}`);
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
            );
            appendKinMessage("assistant", reply);
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
            const reply = await phraseStateAcknowledgement(prompt, contextReply);
            appendKinMessage("assistant", reply);
            return;
         }

         const lifestyle = interpretLifestyleConversation(prompt, currentState, effectiveRhythm, tone);
         if (lifestyle.handled) {
            appendKinMessage("assistant", lifestyle.reply);
            return;
         }

         const recommendation = interpretRecommendationConversation(prompt, currentState, effectiveRhythm, tone);
         if (recommendation.handled) {
            appendKinMessage("assistant", recommendation.reply);
            return;
         }

         const lifestyleProfile = readLifestyleProfile();
         const contextualAnswer = answerContextualScheduleQuestion(prompt, currentState, effectiveRhythm, conversationBefore, {
            travelMinutes: lifestyleProfile.commuteMinutes,
            bedtime: lifestyleProfile.preferredBedtime,
         });
         if (contextualAnswer.handled) {
            appendKinMessage("assistant", contextualAnswer.reply);
            return;
         }

         const memoryAnswer = answerMemoryQuestion(prompt, effectiveRhythm, tone);
         if (memoryAnswer.handled) {
            appendKinMessage("assistant", memoryAnswer.reply);
            return;
         }

         const dayIntelligence = answerDayIntelligence(prompt, currentState, effectiveRhythm, tone);
         if (dayIntelligence.handled) {
            appendKinMessage("assistant", dayIntelligence.reply);
            return;
         }

         if (isRhythmMutationPrompt(prompt)) captureAssistantUndo(prompt);
         const rhythmResult = interpretRhythmConversation(prompt, effectiveRhythm, tone);
         if (rhythmResult.handled) {
            // A newly added/moved routine may collide with an already-recorded
            // one-off commitment, so re-run the deterministic event reconciler.
            if (rhythmResult.changed) reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            appendKinMessage("assistant", rhythmResult.reply);
            return;
         }

         const deterministicReadback = buildDeterministicLifeReadback(prompt, currentState);
         if (deterministicReadback) {
            appendKinMessage("assistant", deterministicReadback);
            return;
         }

         // Obvious create/move/complete/remove requests should not depend on the
         // model returning a tool action. The model can still handle ambiguous
         // language, but deterministic ALLEVIN state logic owns high-confidence
         // mutations such as “I have a dentist appointment at 4:45” or
         // “Remind me at 4:45 to test notifications.”
         const deterministicMutation = interpretKinLocally(prompt, currentState);
         if (deterministicMutation.actions.length) {
            const conflict = preflightAssistantActions(
               deterministicMutation.actions,
               currentState,
               effectiveRhythm,
               prompt,
            );
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: deterministicMutation.reply, actions: deterministicMutation.actions });
               appendKinMessage("assistant", `${conflict}\n\nAdd it anyway?`);
               return;
            }

            const relations = assistantScheduleRelations(
               deterministicMutation.actions,
               currentState,
               effectiveRhythm,
               prompt,
            );
            captureAssistantUndo(prompt);
            const applied = applyKinActions(deterministicMutation.actions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const rawReply = deterministicMutation.reply || (applied.applied.length ? applied.applied.join(". ") : "Done.");
            const reply = mergeScheduleRelationReply(rawReply, relations);
            appendKinMessage("assistant", `${reply}${adaptationReplySuffix(reconciled)}`);
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
${buildLifestyleContext()}
${buildRecommendationContext()}
${buildMemoryContext(effectiveRhythm, tone)}`,
            voiceStyle: tone,
            lifeItems: snapshot.items,
            conversation: conversationForJudgment(prompt, conversationBefore)
               .map((message) => ({ role: message.role, content: message.content })),
         });

         if (!response.usedFallback && (response.reply || response.actions.length)) {
            const conflict = preflightAssistantActions(response.actions, currentState, effectiveRhythm, prompt);
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: response.reply, actions: response.actions });
               appendKinMessage("assistant", `${conflict}\n\nMake the change anyway?`);
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
            const reply = mergeScheduleRelationReply(rawReply, relations);
            appendKinMessage("assistant", `${reply}${adaptationReplySuffix(reconciled)}`);
         } else {
            const local = interpretKinLocally(prompt, currentState);
            const conflict = preflightAssistantActions(local.actions, currentState, effectiveRhythm, prompt);
            if (conflict) {
               stagePendingAssistantChange({ kind: "actions", prompt, reply: local.reply, actions: local.actions });
               appendKinMessage("assistant", `${conflict}\n\nMake the change anyway?`);
               return;
            }

            const relations = assistantScheduleRelations(
               local.actions,
               currentState,
               effectiveRhythm,
               prompt,
            );
            if (local.actions.length) captureAssistantUndo(prompt);
            const applied = applyKinActions(local.actions);
            const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
            const rawReply = local.reply || (applied.applied.length ? applied.applied.join(". ") : "Got it.");
            const reply = mergeScheduleRelationReply(rawReply, relations);
            appendKinMessage("assistant", `${reply}${adaptationReplySuffix(reconciled)}`);
         }
      } catch {
         const currentState = readLifeState();
         const currentRhythm = readDailyRhythm();
         const local = interpretKinLocally(prompt, currentState);
         const conflict = preflightAssistantActions(local.actions, currentState, currentRhythm, prompt);
         if (conflict) {
            stagePendingAssistantChange({ kind: "actions", prompt, reply: local.reply, actions: local.actions });
            appendKinMessage("assistant", `${conflict}\n\nMake the change anyway?`);
            return;
         }
         const relations = assistantScheduleRelations(
            local.actions,
            currentState,
            currentRhythm,
            prompt,
         );
         if (local.actions.length) captureAssistantUndo(prompt);
         applyKinActions(local.actions);
         const reconciled = reconcileLifeEventsWithRhythm(readLifeState(), readDailyRhythm());
         const rawReply = local.reply || "That stayed local. Try the change again if you want me to move something.";
         const reply = mergeScheduleRelationReply(rawReply, relations);
         appendKinMessage("assistant", `${reply}${adaptationReplySuffix(reconciled)}`);
      } finally {
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
                     <button className="icon-button" onClick={() => { clearKinConversation(); setMessages([]); }} aria-label="Clear ALLEVIN conversation"><Trash2 size={16} /></button>
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
                     placeholder="Tell ALLEVIN what changed…"
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
