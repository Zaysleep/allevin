// ========================================
// ALLEVIN MK XIV — Conversation Intelligence
// Deterministic completeness and title guards. The model may improve phrasing
// and capitalization, but it cannot turn an unfinished thought into life state.
// ========================================

export interface IncompleteConversationRequest {
   incomplete: boolean;
   clarification?: string;
   reason?: "ellipsis" | "dangling-word" | "missing-object";
}

const DANGLING_WORDS = new Set([
   "a",
   "about",
   "after",
   "an",
   "and",
   "at",
   "before",
   "by",
   "for",
   "from",
   "into",
   "my",
   "of",
   "on",
   "or",
   "our",
   "the",
   "their",
   "to",
   "with",
   "your",
]);

const TITLE_STOP_WORDS = new Set([
   "a",
   "an",
   "and",
   "at",
   "for",
   "from",
   "in",
   "my",
   "of",
   "on",
   "our",
   "the",
   "to",
   "with",
]);

function inline(value: unknown, limit = 500) {
   return String(value ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

function normalized(value: string) {
   return value
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function titleCaseFirst(value: string) {
   return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function stripTrailingTiming(value: string) {
   return value
      .replace(/[, ]+\b(?:today|tonight|tomorrow|day after tomorrow|next week|next month)\b(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?[.!?]*$/i, "")
      .replace(/[, ]+\bin\s+(?:(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:days?|weeks?|months?)\b[.!?]*$/i, "")
      .replace(/[, ]+\b(?:on\s+)?(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?[.!?]*$/i, "")
      .replace(/[, ]+\b(?:at|around|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b[.!?]*$/i, "")
      .trim();
}

/**
 * Extract the action the user wants to see in Calendar/Coming Up. Temporal and
 * assistant-command language can appear before or after the action.
 */
export function canonicalTaskTitleFromPrompt(value: string) {
   const raw = inline(value).replace(/[.!?]+$/, "").trim();
   if (!raw) return "";

   const reminder = raw.match(
      /\b(?:remind\s+me|remember|don['’]?t\s+let\s+me\s+forget|do\s+not\s+let\s+me\s+forget)\b[\s\S]*?\bto\s+(.+)$/i,
   );
   let title = reminder?.[1] || raw;

   title = title
      .replace(/^(?:okay[, ]+|alright[, ]+|actually[, ]+)/i, "")
      .replace(/^(?:in\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:days?|weeks?|months?)|today|tonight|tomorrow|next\s+(?:week|month))[, ]+/i, "")
      .replace(/^(?:can you\s+)?(?:please\s+)?(?:remind me to|remember to|don['’]?t let me forget(?: to)?|do not let me forget(?: to)?|i need(?: to)?|i have to|i['’]?ve got to|i should|we need(?: to)?|we have to|need to|need)\s+/i, "")
      .replace(/^(?:add|schedule|book|create|put)\s+(?:my|our|a|an|the)?\s*/i, "")
      .replace(/^(?:i|we)\s+(?:have|have got|got)\s+(?:a|an|the)?\s*/i, "")
      .replace(/^i(?:'|’)ve\s+got\s+(?:a|an|the)?\s*/i, "")
      .replace(/^(?:i|we)\s+want\s+to\s+/i, "")
      .replace(/^i['’]?m\s+waiting\s+(?:on|for)\s+/i, "")
      .replace(/^we['’]?re\s+waiting\s+(?:on|for)\s+/i, "");

   title = stripTrailingTiming(title)
      .replace(/\s+(?:sometime|eventually)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

   const responseMatch = title.match(/^(?:the\s+)?(.+?)\s+to\s+(?:respond|reply)$/i);
   if (responseMatch?.[1]) title = `${responseMatch[1]} response`;
   return titleCaseFirst(title);
}

function relativeTimingPhrase(value: string) {
   const normalizedValue = normalized(value);
   const relative = normalizedValue.match(/\bin\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:day|week|month)s?\b/)?.[0];
   if (relative) return relative;
   return normalizedValue.match(/\b(?:today|tonight|tomorrow|day after tomorrow|next week|next month)\b/)?.[0] || "";
}

function clarificationFor(value: string) {
   const lower = normalized(value);
   const timing = relativeTimingPhrase(value);
   const suffix = timing ? ` ${timing}` : "";
   if (/\bcheck(?:\s+on)?\b/.test(lower)) return `What would you like me to check on${suffix}?`;
   if (/\b(?:call|email|message|text|contact)\b/.test(lower)) return `Who would you like me to contact${suffix}?`;
   if (/\b(?:lunch|dinner|coffee|meeting|appointment)\b.*\bwith$/.test(lower)) return "Who is this with?";
   if (/\b(?:at|around|by)$/.test(lower)) return "What time should I use?";
   if (/\b(?:buy|order|pick up|pickup|get)\b/.test(lower)) return `What would you like to get${suffix}?`;
   return "What detail should I add before I save this?";
}

function actionNeedsObject(title: string) {
   const lower = normalized(title);
   if (!lower) return true;
   if (/^(?:check|check on|call|email|message|text|contact|buy|order|pick up|pickup|send|submit|pay|renew|return|book|schedule)$/.test(lower)) return true;
   return /\b(?:check on|call|email|message|text|contact|buy|order|pick up|pickup|send|submit|pay|renew|return|book|schedule)\s+(?:my|our|the|a|an)$/.test(lower);
}

/** Block state mutation when the user's action is visibly unfinished. */
export function analyzeIncompleteConversationRequest(value: string): IncompleteConversationRequest {
   const raw = inline(value);
   if (!raw) return { incomplete: false };
   const looksActionable = /\b(?:remind me|remember|don['’]?t let me forget|i need|i have to|add|create|schedule|book|buy|order|pick up|pickup|call|email|send|submit|pay|renew|return)\b/i.test(raw);
   if (!looksActionable) return { incomplete: false };

   const withoutPunctuation = raw.replace(/[.!?]+$/, "").trim();
   const lastWord = normalized(withoutPunctuation).split(" ").filter(Boolean).at(-1) || "";
   const title = canonicalTaskTitleFromPrompt(withoutPunctuation);

   if (/\.{2,}$|…$/.test(raw)) {
      return { incomplete: true, clarification: clarificationFor(raw), reason: "ellipsis" };
   }
   if (DANGLING_WORDS.has(lastWord)) {
      return { incomplete: true, clarification: clarificationFor(raw), reason: "dangling-word" };
   }
   if (actionNeedsObject(title)) {
      return { incomplete: true, clarification: clarificationFor(raw), reason: "missing-object" };
   }
   return { incomplete: false };
}

export function mergeConversationDraft(originalPrompt: string, continuation: string) {
   const base = inline(originalPrompt).replace(/(?:\.{2,}|…)[.!?]*$/, "").trim();
   const next = inline(continuation);
   if (!base) return next;
   if (!next) return base;
   return `${base} ${next}`.replace(/\s+/g, " ").trim();
}

export function looksLikeNewStandaloneRequest(value: string) {
   return /^(?:actually[, ]+|instead[, ]+)?(?:remind me|don['’]?t let me forget|add|create|schedule|book|move|cancel|remove|delete|mark|complete)\b/i.test(inline(value));
}

export function canonicalTitleIsSafe(candidate: string, refined: unknown) {
   const safeCandidate = inline(candidate, 180);
   const safeRefined = inline(refined, 180).replace(/[.!?]+$/, "").trim();
   if (!safeCandidate || safeRefined.length < 2 || safeRefined.length > 120) return null;
   if (/\b(?:remind me|don['’]?t let me forget|add this|create this)\b/i.test(safeRefined)) return null;

   const candidateTokens = normalized(safeCandidate).split(" ").filter((word) => word.length > 1 && !TITLE_STOP_WORDS.has(word));
   const refinedTokens = new Set(normalized(safeRefined).split(" ").filter((word) => word.length > 1 && !TITLE_STOP_WORDS.has(word)));
   const overlap = candidateTokens.filter((word) => refinedTokens.has(word)).length;
   const required = Math.max(1, Math.ceil(candidateTokens.length * 0.4));
   if (overlap < required) return null;
   return titleCaseFirst(safeRefined);
}
