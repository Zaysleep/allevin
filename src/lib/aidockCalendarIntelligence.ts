// ========================================
// ALLEVIN MK X AIDock Calendar Intelligence
// Purpose:
// Turn saved Calendar events and the authoritative active-project judgment into
// one project-scoped, time-aware planning packet for AIDock.
//
// Build 6 rules:
// - Calendar facts never replace Project Guidance.
// - AIDock may recommend, preview, reschedule, or remove a session only after
//   the user confirms the pending change.
// - An empty local calendar is not proof that the user is free.
// - A passed session is not treated as failed or incomplete without user input.
// ========================================

import type { AllevinAIDockCalendarEventContext, AllevinAIDockCalendarIntelligencePacket, AllevinAIDockCalendarSessionPlan } from "@/lib/allevinLLMTypes";

export interface AIDockCalendarEventInput {
   id?: string;
   title?: string;
   startTime?: number;
   endTime?: number;
   location?: string;
   description?: string;
   allDay?: boolean;
   repeat?: string;
   source?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originProjectsItemId?: string;
   originBoardItemId?: string;
   projectStage?: string;
   recommendedNextAction?: string;
   createdAt?: number;
}

export interface BuildAIDockCalendarIntelligenceInput {
   prompt?: string;
   projectId?: string;
   projectTitle?: string;
   activeMilestoneTitle?: string;
   recommendation?: string;
   completionCriteria?: string[];
   events?: AIDockCalendarEventInput[];
   now?: number;
}

const CALENDAR_TEXT_LIMITS = {
   title: 180,
   summary: 1200,
   detail: 3000,
   projectId: 220,
} as const;

function compactText(value?: string, limit: number = CALENDAR_TEXT_LIMITS.summary) {
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
   return compactText(value, 1200)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function normalizeProjectKey(value?: string) {
   return normalizeKey(value).replace(/\s+/g, "-");
}

function uniqueStrings(values: Array<string | undefined>, limit = 12) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values) {
      const clean = compactText(value, CALENDAR_TEXT_LIMITS.summary);
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

function isValidTimestamp(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getStartOfDay(timestamp: number) {
   const date = new Date(timestamp);
   date.setHours(0, 0, 0, 0);
   return date.getTime();
}

function getEndOfDay(timestamp: number) {
   const date = new Date(timestamp);
   date.setHours(23, 59, 59, 999);
   return date.getTime();
}

function getStartOfWeek(timestamp: number) {
   const date = new Date(timestamp);
   const day = date.getDay();
   const offset = day === 0 ? -6 : 1 - day;
   date.setDate(date.getDate() + offset);
   date.setHours(0, 0, 0, 0);
   return date.getTime();
}

function getDateTimeLabel(timestamp?: number, allDay = false) {
   if (!isValidTimestamp(timestamp)) {
      return "Time unavailable";
   }

   if (allDay) {
      return new Date(Number(timestamp)).toLocaleDateString([], {
         weekday: "short",
         month: "short",
         day: "numeric",
      });
   }

   return new Date(Number(timestamp)).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
   });
}

function getTimeRangeLabel(event: Pick<AIDockCalendarEventInput, "startTime" | "endTime" | "allDay">) {
   if (!isValidTimestamp(event.startTime) || !isValidTimestamp(event.endTime)) {
      return "Time unavailable";
   }

   if (event.allDay) {
      return `${getDateTimeLabel(event.startTime, true)} · all day`;
   }

   const start = new Date(Number(event.startTime));
   const end = new Date(Number(event.endTime));
   const sameDay = getStartOfDay(start.getTime()) === getStartOfDay(end.getTime());

   const startLabel = start.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
   });

   const endLabel = end.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
   });

   return sameDay ? `${startLabel} to ${endLabel}` : `${startLabel} to ${getDateTimeLabel(end.getTime())}`;
}

function getDurationMinutes(event: Pick<AIDockCalendarEventInput, "startTime" | "endTime">) {
   if (!isValidTimestamp(event.startTime) || !isValidTimestamp(event.endTime)) {
      return 0;
   }

   return Math.max(0, Math.round((Number(event.endTime) - Number(event.startTime)) / 60000));
}

function getEventProjectText(event: AIDockCalendarEventInput) {
   return [event.sourceTitle, event.sourceContent, event.description, event.workingSummary, event.projectStage, event.title, event.recommendedNextAction]
      .map((value) => compactText(value, CALENDAR_TEXT_LIMITS.detail))
      .filter(Boolean)
      .join(" ");
}

function getMeaningfulProjectTokens(value?: string) {
   const stopWords = new Set(["and", "build", "company", "current", "for", "launch", "project", "session", "software", "the", "this", "work"]);

   return normalizeKey(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !stopWords.has(token));
}

export function calendarEventMatchesProject(event: AIDockCalendarEventInput, projectTitle?: string, projectId?: string) {
   const cleanProjectId = compactText(projectId, CALENDAR_TEXT_LIMITS.projectId);
   const cleanProjectTitle = compactText(projectTitle, CALENDAR_TEXT_LIMITS.title);

   if (!cleanProjectId && !cleanProjectTitle) {
      return false;
   }

   if (cleanProjectId && [event.originProjectsItemId, event.originBoardItemId, event.workflowId].map((value) => compactText(value, CALENDAR_TEXT_LIMITS.projectId)).some((value) => value === cleanProjectId || value.includes(cleanProjectId))) {
      return true;
   }

   const projectKey = normalizeProjectKey(cleanProjectTitle);
   const sourceKey = normalizeProjectKey(event.sourceTitle);

   if (projectKey && sourceKey && (sourceKey === projectKey || sourceKey.includes(projectKey) || projectKey.includes(sourceKey))) {
      return true;
   }

   const projectTokens = getMeaningfulProjectTokens(cleanProjectTitle);

   if (!projectTokens.length) {
      return false;
   }

   const eventText = normalizeKey(getEventProjectText(event));
   const matchedTokens = projectTokens.filter((token) => eventText.includes(token));

   if (projectTokens.length === 1) {
      return matchedTokens.length === 1;
   }

   return matchedTokens.length >= Math.min(2, projectTokens.length);
}

function toCalendarEventContext(event: AIDockCalendarEventInput, projectTitle?: string, projectId?: string, now = Date.now()): AllevinAIDockCalendarEventContext | null {
   const title = compactText(event.title, CALENDAR_TEXT_LIMITS.title);
   const startTime = Number(event.startTime);
   const endTime = Number(event.endTime);

   if (!title || !isValidTimestamp(startTime) || !isValidTimestamp(endTime) || endTime <= startTime) {
      return null;
   }

   return {
      id: compactText(event.id, CALENDAR_TEXT_LIMITS.projectId),
      title,
      startTime,
      endTime,
      allDay: event.allDay === true,
      timeLabel: getTimeRangeLabel(event),
      durationMinutes: getDurationMinutes(event),
      projectTitle: compactText(event.sourceTitle || projectTitle, CALENDAR_TEXT_LIMITS.title),
      milestoneTitle: compactText(event.projectStage, CALENDAR_TEXT_LIMITS.title),
      sessionGoal: compactText(event.workingSummary || event.recommendedNextAction || event.description, CALENDAR_TEXT_LIMITS.summary),
      expectedResult: getExpectedResultFromEvent(event),
      isProjectSession: calendarEventMatchesProject(event, projectTitle, projectId),
      hasPassed: endTime < now,
   };
}

function getExpectedResultFromEvent(event: AIDockCalendarEventInput) {
   const description = compactText(event.description, CALENDAR_TEXT_LIMITS.detail);
   const explicit = description.match(/(?:^|\n)Expected result:\s*(.+?)(?:\n|$)/i)?.[1];

   return compactText(explicit || event.recommendedNextAction || event.workingSummary, CALENDAR_TEXT_LIMITS.summary);
}

export function getRequestedCalendarMinutes(prompt?: string) {
   const clean = normalizeKey(prompt);

   const minuteMatch = clean.match(/\b(15|20|25|30|45|60|75|90|120)\s*(?:minute|minutes|min)\b/);
   if (minuteMatch) {
      return Number(minuteMatch[1]);
   }

   const hourMatch = clean.match(/\b(1|1\.5|2)\s*(?:hour|hours|hr|hrs)\b/);
   if (hourMatch) {
      return Math.round(Number(hourMatch[1]) * 60);
   }

   const hyphenMinuteMatch = clean.match(/\b(15|20|25|30|45|60|75|90|120)[ -]minute\b/);
   return hyphenMinuteMatch ? Number(hyphenMinuteMatch[1]) : undefined;
}

function removeSentenceEnding(value?: string) {
   return compactText(value, CALENDAR_TEXT_LIMITS.summary)
      .replace(/[.!?]+$/, "")
      .trim();
}

const CALENDAR_ACTION_VERBS = /^(?:draft|write|create|prepare|define|finalize|confirm|review|compare|choose|decide|test|inspect|implement|build|organize|map|identify|document|complete|outline|list|verify|resolve|establish|select)\b/i;

function cleanCalendarActionCandidate(value?: string) {
   return removeSentenceEnding(value)
      .replace(/^[-•*\d.)\s]+/, "")
      .replace(/^(?:recommended starting point|recommended next action|recommended action|next action|next step)\s*:\s*/i, "")
      .replace(/^(?:start with|begin with)\s+/i, "")
      .replace(/\s+first$/i, "")
      .replace(/\s+/g, " ")
      .trim();
}

function getCalendarActionCandidate(recommendation?: string, activeMilestoneTitle?: string) {
   const source = compactText(recommendation, CALENDAR_TEXT_LIMITS.detail);
   const labeled = source.match(/(?:recommended starting point|recommended next action|recommended action|next action|next step)\s*:\s*([\s\S]+)/i)?.[1];

   if (labeled) {
      const cleanLabeled = cleanCalendarActionCandidate(labeled.split(/\n{2,}|\n(?=[A-Z][^\n:]{2,80}:)/)[0]);
      if (cleanLabeled) {
         return cleanLabeled;
      }
   }

   const candidates = (source.match(/[^.!?\n]+[.!?]?/g) || [])
      .map((candidate) => cleanCalendarActionCandidate(candidate))
      .filter(Boolean)
      .map((candidate) => {
         const normalized = normalizeKey(candidate);
         let score = 0;

         if (CALENDAR_ACTION_VERBS.test(candidate)) score += 8;
         if (/\b(?:artifact|draft|option|decision|criteria|outline|plan|brief|prototype|test|review|message|language|promise|positioning|relationship|workflow)\b/i.test(candidate)) score += 3;
         if (/\b(?:who is|what should|is there|do we|does the|unfinished part|current status|open question)\b/i.test(candidate)) score -= 8;
         if (candidate.includes("?")) score -= 10;
         if (normalized.split(" ").length >= 4 && normalized.split(" ").length <= 28) score += 2;

         return { candidate, score };
      })
      .sort((a, b) => b.score - a.score || a.candidate.length - b.candidate.length);

   if (candidates[0]?.score > 0) {
      return candidates[0].candidate;
   }

   return cleanCalendarActionCandidate(activeMilestoneTitle) || "Choose one clear next action";
}

function getActionObject(action?: string) {
   const clean = removeSentenceEnding(action)
      .replace(/^(?:start by|begin by|first,?\s*)/i, "")
      .replace(/^(?:draft|write|create|prepare|define|finalize|confirm|review|compare|choose|decide|test|inspect|implement|build|organize|map|identify|document|complete)\s+/i, "")
      .trim();

   return clean || removeSentenceEnding(action) || "the planned work";
}

function inferExpectedResult(action?: string) {
   const clean = removeSentenceEnding(action);
   const object = getActionObject(clean);

   if (/^(?:draft|write|create|prepare|outline|define)\b/i.test(clean)) {
      const result = `${object.charAt(0).toUpperCase()}${object.slice(1)}`;
      const verb = /^(?:two|three|four|five|several|multiple)\b/i.test(object) ? "are" : "is";
      return `${result} ${verb} ready for review`;
   }

   if (/^(?:compare|choose|decide|select|finalize|confirm)\b/i.test(clean)) {
      return `A recorded decision about ${object} with the reason preserved`;
   }

   if (/^(?:test|inspect|review|audit|verify)\b/i.test(clean)) {
      return `Findings recorded for ${object}, with the next adjustment identified`;
   }

   if (/^(?:implement|build|configure|set up|install|migrate)\b/i.test(clean)) {
      return `A working, testable increment of ${object}`;
   }

   return `Visible progress on ${object}`;
}

function actionLooksLikeLargeScope(action?: string) {
   const clean = normalizeKey(action);

   return /\b(?:complete|entire|full|finalize|launch|migrate|overhaul|production|end to end|all remaining)\b/.test(clean) || (/\b(?:build|implement|create|prepare)\b/.test(clean) && clean.split(" ").length > 18);
}

function inferRecommendedMinutes(action?: string, activeMilestoneTitle?: string) {
   const clean = normalizeKey(`${action || ""} ${activeMilestoneTitle || ""}`);

   if (actionLooksLikeLargeScope(action)) {
      return 90;
   }

   if (/\b(?:brand language|company promise|brand promise|positioning|tagline|identity statement|core message)\b/.test(clean)) {
      return 45;
   }

   if (/\b(?:implement|build|configure|install|test|prototype|draft|write|compare)\b/.test(clean)) {
      return 45;
   }

   if (/\b(?:review|confirm|choose|decide|outline|list|identify|define)\b/.test(clean)) {
      return 30;
   }

   return 45;
}

function getTimeBoundedSessionGoal(action: string, availableMinutes: number, recommendedMinutes: number, activeMilestoneTitle?: string) {
   const clean = removeSentenceEnding(action);
   const combined = `${clean} ${removeSentenceEnding(activeMilestoneTitle)}`;

   if (!clean) {
      return "Choose and complete one concrete part of the active milestone";
   }

   if (/\b(?:brand language|company promise|brand promise|positioning|tagline|identity statement|core message)\b/i.test(combined)) {
      const subject = /\bcompany promise\b/i.test(combined)
         ? "the company promise"
         : /\bbrand promise\b/i.test(combined)
           ? "the brand promise"
           : /\bpositioning\b/i.test(combined)
             ? "the positioning statement"
             : /\btagline\b/i.test(combined)
               ? "the tagline"
               : /\bbrand language\b/i.test(combined)
                 ? "the brand language"
                 : "the core brand message";
      const relationshipQualifier = /\b(?:product|ecosystem|parent brand|portfolio|belong together|fit within|relate)\b/i.test(clean) ? " that explain how the product family fits together" : "";

      return `Draft three one-sentence versions of ${subject}${relationshipQualifier}`;
   }

   if (availableMinutes >= recommendedMinutes || !actionLooksLikeLargeScope(clean)) {
      return clean;
   }

   if (/^(?:draft|write|create|prepare)\b/i.test(clean)) {
      return `Create the smallest complete first draft of ${getActionObject(clean)}`;
   }

   if (/^(?:implement|build|configure|set up|install|migrate)\b/i.test(clean)) {
      return `Complete the first testable slice of ${getActionObject(clean)}`;
   }

   if (/^(?:finalize|complete|launch)\b/i.test(clean)) {
      return `Resolve the first unfinished decision inside ${getActionObject(clean)}`;
   }

   return `Complete one clearly bounded part of ${getActionObject(clean)}`;
}

export function buildAIDockCalendarSessionPlan(input: { prompt?: string; projectTitle?: string; activeMilestoneTitle?: string; recommendation?: string; completionCriteria?: string[] }): AllevinAIDockCalendarSessionPlan {
   const action = getCalendarActionCandidate(input.recommendation, input.activeMilestoneTitle);
   const requestedMinutes = getRequestedCalendarMinutes(input.prompt);
   const recommendedMinutes = inferRecommendedMinutes(action, input.activeMilestoneTitle);
   const durationMinutes = requestedMinutes || recommendedMinutes;
   const sessionGoal = getTimeBoundedSessionGoal(action, durationMinutes, recommendedMinutes, input.activeMilestoneTitle);
   const expectedResult = inferExpectedResult(sessionGoal);
   const needsMultipleSessions = recommendedMinutes > durationMinutes || actionLooksLikeLargeScope(action);
   const completionCriteria = uniqueStrings(input.completionCriteria || [], 4);

   const reason = requestedMinutes
      ? requestedMinutes < recommendedMinutes
         ? `${requestedMinutes} minutes is enough for one bounded result, not the whole milestone.`
         : `${requestedMinutes} minutes is enough for the current action.`
      : needsMultipleSessions
        ? `The current action is larger than one ordinary focus block, so ALLEVIN should protect a first bounded result.`
        : `${recommendedMinutes} minutes is a realistic block for the current action.`;

   return {
      projectTitle: compactText(input.projectTitle, CALENDAR_TEXT_LIMITS.title),
      milestoneTitle: compactText(input.activeMilestoneTitle, CALENDAR_TEXT_LIMITS.title),
      sessionGoal,
      expectedResult,
      durationMinutes,
      recommendedDurationMinutes: recommendedMinutes,
      needsMultipleSessions,
      reason,
      completionCriteria,
   };
}

export function buildAIDockCalendarIntelligence(input: BuildAIDockCalendarIntelligenceInput): AllevinAIDockCalendarIntelligencePacket {
   const now = isValidTimestamp(input.now) ? Number(input.now) : Date.now();
   const projectTitle = compactText(input.projectTitle, CALENDAR_TEXT_LIMITS.title);
   const projectId = compactText(input.projectId, CALENDAR_TEXT_LIMITS.projectId);
   const activeMilestoneTitle = compactText(input.activeMilestoneTitle, CALENDAR_TEXT_LIMITS.title);
   const recommendation = compactText(input.recommendation, CALENDAR_TEXT_LIMITS.summary);

   const allEvents = (Array.isArray(input.events) ? input.events : []).map((event) => toCalendarEventContext(event, projectTitle, projectId, now)).filter(Boolean) as AllevinAIDockCalendarEventContext[];

   allEvents.sort((a, b) => a.startTime - b.startTime);

   const upcomingEvents = allEvents.filter((event) => event.endTime >= now);
   const todayStart = getStartOfDay(now);
   const todayEnd = getEndOfDay(now);
   const todayEvents = upcomingEvents.filter((event) => event.startTime <= todayEnd && event.endTime >= todayStart);
   const projectSessions = upcomingEvents.filter((event) => event.isProjectSession);
   const todayProjectSessions = todayEvents.filter((event) => event.isProjectSession);
   const nextEvent = upcomingEvents[0];
   const nextProjectSession = projectSessions[0];

   const weekStart = getStartOfWeek(now);
   const passedProjectSessionsThisWeek = allEvents.filter((event) => event.isProjectSession && event.endTime < now && event.endTime >= weekStart);

   const sessionPlan = buildAIDockCalendarSessionPlan({
      prompt: input.prompt,
      projectTitle,
      activeMilestoneTitle,
      recommendation,
      completionCriteria: input.completionCriteria,
   });

   const hasCalendarData = allEvents.length > 0;
   const availabilityNote = hasCalendarData ? "Calendar conflicts are based only on the events ALLEVIN can currently read." : "No readable Calendar events are available, so ALLEVIN will not assume the remaining time is free.";

   return {
      version: "MK X",
      projectTitle,
      projectId,
      activeMilestoneTitle,
      recommendation,
      hasCalendarData,
      hasUpcomingEvents: upcomingEvents.length > 0,
      todayEvents,
      todayProjectSessions,
      projectSessions,
      passedProjectSessionsThisWeek,
      nextEvent,
      nextProjectSession,
      todaySummary: todayEvents.length
         ? todayEvents
              .map((event) => `${event.title} — ${event.timeLabel}`)
              .slice(0, 5)
              .join("\n")
         : "No readable events are scheduled today.",
      nextEventSummary: nextEvent ? `${nextEvent.title} — ${nextEvent.timeLabel}` : "No upcoming event is available.",
      nextProjectSessionSummary: nextProjectSession ? `${nextProjectSession.title} — ${nextProjectSession.timeLabel}` : projectTitle ? `No upcoming ${projectTitle} project session is scheduled.` : "No upcoming project session is scheduled.",
      availabilityNote,
      sessionPlan,
      generatedAt: now,
   };
}

function formatSessionReadback(event: AllevinAIDockCalendarEventContext) {
   const details = [event.title, event.timeLabel, event.milestoneTitle ? `Milestone: ${event.milestoneTitle}` : "", event.sessionGoal ? `Goal: ${event.sessionGoal}` : ""].filter(Boolean);

   return details.join("\n");
}

function getProjectSessionLabel(packet: AllevinAIDockCalendarIntelligencePacket) {
   return packet.projectTitle ? `${packet.projectTitle} session` : "project session";
}

function looksLikeTodayWorkQuestion(prompt: string) {
   const lower = normalizeKey(prompt);
   return lower.includes("what am i working on today") || lower.includes("what should i work on today") || lower.includes("what do i have today") || lower.includes("calendar today") || lower.includes("schedule today");
}

function looksLikeNextProjectSessionQuestion(prompt: string) {
   const lower = normalizeKey(prompt);
   return lower.includes("next project session") || lower.includes("next session") || /\b(?:what|when)\s+(?:is\s+)?my\s+next\b.*\b(?:session|work block)\b/.test(lower) || (lower.includes("project") && lower.includes("session"));
}

function looksLikeMissedSessionQuestion(prompt: string) {
   const lower = normalizeKey(prompt);
   return lower.includes("what did i miss") || lower.includes("missed this week") || lower.includes("past project sessions") || lower.includes("sessions have passed");
}

function looksLikeTimeFitQuestion(prompt: string) {
   const lower = normalizeKey(prompt);
   return getRequestedCalendarMinutes(prompt) !== undefined && (lower.includes("what should i do") || lower.includes("what part") || lower.includes("what fits") || lower.includes("only have") || lower.includes("time for"));
}

function looksLikeGeneralCalendarReadback(prompt: string) {
   const lower = normalizeKey(prompt);
   return lower.includes("what is on my calendar") || lower.includes("what s on my calendar") || lower.includes("what do i have scheduled") || lower.includes("next event") || lower.includes("calendar summary");
}

export function buildAIDockCalendarReadback(prompt: string, packet: AllevinAIDockCalendarIntelligencePacket): string {
   if (looksLikeTimeFitQuestion(prompt)) {
      const plan = packet.sessionPlan;
      const caution = plan.needsMultipleSessions ? `Keep the rest of ${packet.activeMilestoneTitle || "the milestone"} for another session.` : "";

      return [`Use the ${plan.durationMinutes} minutes for this: ${plan.sessionGoal}.`, `Expected result: ${plan.expectedResult}.`, plan.reason, caution].filter(Boolean).join("\n\n");
   }

   if (looksLikeMissedSessionQuestion(prompt)) {
      if (!packet.passedProjectSessionsThisWeek.length) {
         return `No ${getProjectSessionLabel(packet)} has passed earlier this week.`;
      }

      const sessionHeading = packet.passedProjectSessionsThisWeek.length === 1 ? `This ${getProjectSessionLabel(packet)} has passed this week:` : `These ${getProjectSessionLabel(packet)}s have passed this week:`;

      return [
         sessionHeading,
         packet.passedProjectSessionsThisWeek
            .slice(0, 5)
            .map((event, index) => `${index + 1}. ${event.title} — ${event.timeLabel}`)
            .join("\n"),
         "Calendar cannot tell whether you completed the work. You can mark it complete, record partial progress, or prepare a new session.",
      ].join("\n\n");
   }

   if (looksLikeNextProjectSessionQuestion(prompt)) {
      if (!packet.nextProjectSession) {
         return `${packet.nextProjectSessionSummary}\n\n${packet.availabilityNote}`;
      }

      return [`Your next ${getProjectSessionLabel(packet)} is:`, formatSessionReadback(packet.nextProjectSession)].join("\n\n");
   }

   if (looksLikeTodayWorkQuestion(prompt)) {
      if (packet.todayProjectSessions.length) {
         return [
            `Your project work today:`,
            packet.todayProjectSessions
               .slice(0, 5)
               .map((event, index) => `${index + 1}. ${formatSessionReadback(event)}`)
               .join("\n\n"),
         ].join("\n\n");
      }

      if (packet.todayEvents.length) {
         return [
            `No ${getProjectSessionLabel(packet)} is scheduled today.`,
            `Other Calendar items:\n${packet.todayEvents
               .slice(0, 5)
               .map((event, index) => `${index + 1}. ${event.title} — ${event.timeLabel}`)
               .join("\n")}`,
         ].join("\n\n");
      }

      return `No project session is scheduled today.\n\n${packet.availabilityNote}`;
   }

   if (looksLikeGeneralCalendarReadback(prompt)) {
      if (!packet.hasUpcomingEvents) {
         return `No upcoming Calendar events are available.\n\n${packet.availabilityNote}`;
      }

      return [
         packet.todayEvents.length
            ? `Today:\n${packet.todayEvents
                 .slice(0, 5)
                 .map((event, index) => `${index + 1}. ${event.title} — ${event.timeLabel}`)
                 .join("\n")}`
            : "No readable events are scheduled today.",
         packet.nextEvent ? `Next: ${packet.nextEvent.title} — ${packet.nextEvent.timeLabel}` : "",
      ]
         .filter(Boolean)
         .join("\n\n");
   }

   return packet.nextProjectSession ? `Your next ${getProjectSessionLabel(packet)} is ${packet.nextProjectSession.title} — ${packet.nextProjectSession.timeLabel}.` : `${packet.nextProjectSessionSummary}\n\n${packet.availabilityNote}`;
}

export function findAIDockCalendarSession(
   events: AIDockCalendarEventInput[],
   options: {
      projectTitle?: string;
      projectId?: string;
      reference?: string;
      now?: number;
      includePassed?: boolean;
   } = {},
) {
   const now = isValidTimestamp(options.now) ? Number(options.now) : Date.now();
   const reference = normalizeKey(options.reference);
   const projectMatches = events
      .filter((event) => {
         if (!isValidTimestamp(event.startTime) || !isValidTimestamp(event.endTime)) {
            return false;
         }

         if (!options.includePassed && Number(event.endTime) < now) {
            return false;
         }

         return calendarEventMatchesProject(event, options.projectTitle, options.projectId);
      })
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));

   if (!reference) {
      return projectMatches[0] || null;
   }

   const referenceTokens = reference.split(" ").filter((token) => token.length >= 3);

   const scored = projectMatches
      .map((event) => {
         const eventText = normalizeKey(getEventProjectText(event));
         const score = referenceTokens.reduce((total, token) => total + (eventText.includes(token) ? 1 : 0), 0);

         return { event, score };
      })
      .sort((a, b) => b.score - a.score || Number(a.event.startTime || 0) - Number(b.event.startTime || 0));

   return scored[0]?.score ? scored[0].event : projectMatches[0] || null;
}

export function buildAIDockCalendarSessionDescription(plan: AllevinAIDockCalendarSessionPlan) {
   return [
      plan.projectTitle ? `Project: ${plan.projectTitle}` : "",
      plan.milestoneTitle ? `Milestone: ${plan.milestoneTitle}` : "",
      `Session goal: ${plan.sessionGoal}`,
      `Expected result: ${plan.expectedResult}`,
      `Duration: ${plan.durationMinutes} minutes`,
   ]
      .filter(Boolean)
      .join("\n");
}

export function buildAIDockCalendarPreview(input: { action: "create" | "reschedule" | "delete"; event: AIDockCalendarEventInput; previousEvent?: AIDockCalendarEventInput; plan?: AllevinAIDockCalendarSessionPlan }) {
   const plan = input.plan;
   const event = input.event;
   const actionLabel = input.action === "create" ? "I can schedule this project session:" : input.action === "reschedule" ? "I can move this project session:" : "I can remove this project session:";

   const lines = [
      actionLabel,
      plan?.projectTitle || event.sourceTitle ? `Project: ${plan?.projectTitle || event.sourceTitle}` : "",
      plan?.milestoneTitle || event.projectStage ? `Milestone: ${plan?.milestoneTitle || event.projectStage}` : "",
      plan?.sessionGoal || event.workingSummary ? `Session goal: ${plan?.sessionGoal || event.workingSummary}` : "",
      plan?.expectedResult || getExpectedResultFromEvent(event) ? `Expected result: ${plan?.expectedResult || getExpectedResultFromEvent(event)}` : "",
      input.action === "reschedule" && input.previousEvent ? `From: ${getTimeRangeLabel(input.previousEvent)}` : "",
      input.action !== "delete" ? `Time: ${getTimeRangeLabel(event)}` : `Scheduled time: ${getTimeRangeLabel(event)}`,
      input.action !== "delete" ? `Duration: ${plan?.durationMinutes || getDurationMinutes(event)} minutes` : "",
      "",
      input.action === "delete" ? "Approve removal? Reply yes or no." : input.action === "reschedule" ? "Approve this change? Reply yes or no." : "Approve this session? Reply yes or no.",
   ].filter((line) => line !== "");

   return lines.join("\n");
}
