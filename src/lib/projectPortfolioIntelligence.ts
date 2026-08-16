// ========================================
// ALLEVIN MK XI Portfolio Intelligence
// Purpose:
// Lightweight cross-project awareness without mixing project facts.
// Each project is independently interpreted, then summarized at portfolio level.
// Open options are remembered but do not make an otherwise moving project look blocked.
// ========================================

import { parseProjectDocument } from "@/lib/allevinProjectMemory";
import { buildProjectIntelligencePacket } from "@/lib/projectIntelligenceEngine";
import { readCanonicalProjectLibrary } from "@/lib/projectStateAuthority";
import { getActiveProjectLeadBlocker } from "@/lib/projectLeadMemory";
import { formatMilestoneCheckpoint, formatWorkJournalForIntelligence, readProjectMilestoneWorkJournal, readProjectWorkJournal } from "@/lib/projectWorkJournal";

const PROJECT_TRACKING_STORAGE_KEY = "allevin-project-tracking-map";

export interface PortfolioProjectSnapshot {
   projectId: string;
   title: string;
   goal: string;
   activeMilestone: string;
   nextMove: string;
   health: "moving" | "needs-decision" | "blocked" | "at-risk" | "stale" | "ready" | "unclear";
   reason: string;
   updatedAt: number;
}

function clean(value?: string, limit = 1800) {
   const text = (value || "").replace(/<[^>]+>/g, "").replace(/\r/g, "\n").trim();
   return text.length > limit ? text.slice(0, limit).trim() : text;
}

function normalize(value?: string) {
   return clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function safeNumber(value: unknown) {
   return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readTrackingMap() {
   if (typeof window === "undefined") return {} as Record<string, any>;
   try {
      const parsed = JSON.parse(localStorage.getItem(PROJECT_TRACKING_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
   } catch {
      return {} as Record<string, any>;
   }
}

function getPendingCheckpoint(tracking: any, activeMilestoneId?: string) {
   const milestones = Array.isArray(tracking?.milestones) ? tracking.milestones : [];
   const active = milestones.find((item: any) => item?.id === activeMilestoneId) || milestones.find((item: any) => item?.status === "active");
   if (!active) return "";
   const criteria = Array.isArray(active.completionCriteria) ? active.completionCriteria.map((item: unknown) => formatMilestoneCheckpoint(String(item))).filter(Boolean) : [];
   const completed = Array.isArray(active.completedCriteria) ? active.completedCriteria.map((item: unknown) => formatMilestoneCheckpoint(String(item))).filter(Boolean) : [];
   return criteria.find((criterion: string) => !completed.some((item: string) => normalize(item) === normalize(criterion))) || "";
}

function buildSnapshot(project: ReturnType<typeof readCanonicalProjectLibrary>[number], trackingMap: Record<string, any>): PortfolioProjectSnapshot {
   const body = clean(project.notes?.[0]?.body || project.notes?.[0]?.summary || project.latestSummary, 100000);
   const sourceBrief = clean(project.sourceBrief, 100000);
   const intelligenceBody = sourceBrief && !body.includes(sourceBrief) ? `${body}\n\nOriginal Project Brief:\n${sourceBrief}` : body;
   const parsed = parseProjectDocument(body);
   const projectId = clean(project.id, 220);
   const projectTitle = clean(project.title, 180);
   const tracking = project.id ? trackingMap[project.id] : undefined;
   const projectJournal = readProjectWorkJournal(projectId, projectTitle);

   const milestoneWorkspaces = Array.isArray(tracking?.milestones)
      ? tracking.milestones.map((item: any, index: number) => {
           const milestoneId = clean(item?.id, 220) || `${projectId || "project"}-milestone-${index + 1}`;
           const milestoneTitle = clean(item?.title, 240);
           const journalText = formatWorkJournalForIntelligence(readProjectMilestoneWorkJournal(projectId, projectTitle, milestoneId, milestoneTitle));
           return {
              id: milestoneId,
              title: milestoneTitle,
              status: item?.status || "waiting",
              goal: clean(item?.goal),
              whyItMatters: clean(item?.whyItMatters),
              startingPrompt: clean(item?.startingPrompt),
              workingContent: [clean(item?.workingContent, 100000), journalText ? `Project updates:\n${journalText}` : ""].filter(Boolean).join("\n\n"),
              decisions: Array.isArray(item?.decisions) ? item.decisions : [],
              openQuestions: Array.isArray(item?.openQuestions) ? item.openQuestions : [],
              completionCriteria: Array.isArray(item?.completionCriteria) ? item.completionCriteria.map((entry: unknown) => formatMilestoneCheckpoint(String(entry))).filter(Boolean) : [],
              completedCriteria: Array.isArray(item?.completedCriteria) ? item.completedCriteria.map((entry: unknown) => formatMilestoneCheckpoint(String(entry))).filter(Boolean) : [],
              dependencies: Array.isArray(item?.dependencies) ? item.dependencies : [],
              order: typeof item?.order === "number" ? item.order : index + 1,
           };
        })
      : undefined;

   const packet = buildProjectIntelligencePacket({
      title: projectTitle,
      projectDocument: parsed,
      projectBody: intelligenceBody,
      canvasContent: "",
      milestoneWorkspaces,
   });
   const understanding = packet.projectUnderstanding;
   const activeMilestone = understanding.milestones.find((item) => item.id === understanding.activeMilestoneId) || understanding.milestones.find((item) => item.status === "active");
   const latestJournal = projectJournal[projectJournal.length - 1];
   const updatedAt = Math.max(safeNumber(project.updatedAt), safeNumber(project.notes?.[0]?.savedAt), safeNumber(project.createdAt), safeNumber(latestJournal?.createdAt));
   const ageDays = updatedAt ? (Date.now() - updatedAt) / 86_400_000 : 0;

   const durableBlocker = getActiveProjectLeadBlocker(projectId, projectTitle);
   const highRisk = understanding.risks.find((item) => item.severity === "high");
   const pendingCheckpoint = getPendingCheckpoint(tracking, activeMilestone?.id);

   let health: PortfolioProjectSnapshot["health"] = "moving";
   let reason = pendingCheckpoint ? `Next checkpoint: ${pendingCheckpoint}` : understanding.whyNow || "The current milestone has a clear next move.";

   if (durableBlocker) {
      health = "blocked";
      reason = durableBlocker.summary;
   } else if (highRisk) {
      health = "at-risk";
      reason = highRisk.consequence || highRisk.title || "A project risk needs attention.";
   } else if (ageDays >= 10 && understanding.momentum !== "complete") {
      health = "stale";
      reason = "This project has not moved recently.";
   } else if (understanding.momentum === "complete" || packet.readiness.state === "complete") {
      health = "ready";
      reason = "The current planned work is complete or ready for review.";
   } else if (!activeMilestone?.title && !understanding.recommendedMove) {
      health = "unclear";
      reason = "ALLEVIN does not yet have a clear current milestone.";
   }

   return {
      projectId,
      title: projectTitle,
      goal: clean(understanding.goal || parsed.goal),
      activeMilestone: clean(activeMilestone?.title, 300),
      nextMove: clean(pendingCheckpoint || understanding.recommendedMove || tracking?.nextStep || parsed.immediateNextStep),
      health,
      reason: clean(reason),
      updatedAt,
   };
}

export function readPortfolioProjectSnapshots() {
   const trackingMap = readTrackingMap();
   return readCanonicalProjectLibrary().map((project) => buildSnapshot(project, trackingMap));
}

function priorityScore(item: PortfolioProjectSnapshot) {
   const healthScore = item.health === "blocked" ? 5 : item.health === "at-risk" ? 4.5 : item.health === "stale" ? 3 : item.health === "moving" ? 2 : item.health === "unclear" ? 1 : 0;
   const recentBonus = item.updatedAt && Date.now() - item.updatedAt < 3 * 86_400_000 ? 0.4 : 0;
   return healthScore + recentBonus;
}

export function buildPortfolioRundown() {
   const projects = readPortfolioProjectSnapshots();
   if (!projects.length) return "There are no saved projects yet.";

   const ordered = [...projects].sort((a, b) => priorityScore(b) - priorityScore(a));
   const first = ordered[0];
   const lines = ordered.slice(0, 5).map((item) => {
      const focus = item.activeMilestone || item.nextMove || item.goal || "No clear next move yet";
      const status = item.health === "blocked" ? "is blocked" : item.health === "at-risk" ? "needs attention" : item.health === "stale" ? "has gone quiet" : item.health === "ready" ? "is ready for review" : item.health === "moving" ? "is moving" : "needs clarification";
      return `${item.title} ${status}: ${focus}.`;
   });

   const recommendation = first.nextMove ? `If you want one place to start, I’d use ${first.title}: ${first.nextMove}.` : `If you want one place to start, I’d open ${first.title} and resolve what is unclear.`;
   return `${lines.join("\n")}\n\n${recommendation}`;
}
