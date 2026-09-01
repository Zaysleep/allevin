"use client";

import { BellPlus, ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import CalendarWorkspace from "@/components/CalendarWorkspace";
import AppUpdateNotice from "@/components/AppUpdateNotice";
import KinDock from "@/components/KinDock";
import LifeItemRow from "@/components/LifeItemRow";
import ManualReminderForm from "@/components/ManualReminderForm";
import RecurringReminderRow from "@/components/RecurringReminderRow";
import LiveClock from "@/components/LiveClock";
import OnboardingFlow from "@/components/OnboardingFlow";
import SettingsScreen from "@/components/SettingsScreen";
import UpNextPanel from "@/components/UpNextPanel";
import { useDailyRhythm } from "@/hooks/useDailyRhythm";
import { useLifeState } from "@/hooks/useLifeState";
import { readOnboardingStatus, shouldShowNewUserOnboarding, type OnboardingMode } from "@/lib/allevinOnboarding";
import { getAllevinDisplayName, resetAllevinLifeWorkspace, saveAllevinUserProfile } from "@/lib/allevinUserProfile";
import { readAllevinTone, saveAllevinTone, type AllevinTone } from "@/lib/allevinVoice";
import { buildLifeViews, formatLifeDate, getDayGreeting } from "@/lib/lifeEngine";


type FooterInfo = "about" | "privacy" | "terms" | null;

function FooterInfoPanel({ section, onClose }: { section: Exclude<FooterInfo, null>; onClose: () => void }) {
   const content = {
      about: { title: "About ALLEVIN", body: "ALLEVIN is a personal daily assistant from Kin Software LLC." },
      privacy: { title: "Privacy", body: "Your ALLEVIN items, rhythm, recommendations, and conversation are saved in this browser. AI requests may send relevant information to the configured AI service. For notification wording, ALLEVIN sends only the current item and its nearby verified schedule context. If server reminders are enabled, the next notification window and this device’s push subscription are temporarily stored in the configured server notification store so reminders can arrive while the app is closed." },
      terms: { title: "Terms", body: "ALLEVIN uses AI to interpret requests and offer suggestions. Important details should still be checked before you rely on them." },
   }[section];

   return (
      <section className="footer-info-panel" aria-live="polite">
         <div><h2>{content.title}</h2><p>{content.body}</p></div>
         <button type="button" onClick={onClose}>Close</button>
      </section>
   );
}

export default function LifeDashboard() {
   const { state, hydrated, create, complete, reopen, archive, tomorrow, today, update } = useLifeState();
   const rhythm = useDailyRhythm();
   const [settingsOpen, setSettingsOpen] = useState(false);
   const [name, setName] = useState("");
   const [tone, setTone] = useState<AllevinTone>("direct");
   const [footerInfo, setFooterInfo] = useState<FooterInfo>(null);
   const [comingUpOpen, setComingUpOpen] = useState(false);
   const [manualReminderOpen, setManualReminderOpen] = useState(false);
   const [nowMs, setNowMs] = useState(() => Date.now());
   const [onboardingMode, setOnboardingMode] = useState<OnboardingMode | null>(null);
   const [firstRunOnboarding, setFirstRunOnboarding] = useState(false);
   const [onboardingSession, setOnboardingSession] = useState(0);
   const [freshStartOnboarding, setFreshStartOnboarding] = useState(false);

   useEffect(() => {
      setName(getAllevinDisplayName(""));
      setTone(readAllevinTone());

      // New users should meet ALLEVIN before they meet an empty dashboard.
      // Existing users are never forced through setup after an upgrade; they
      // can reopen the same guide from Settings whenever they want.
      if (shouldShowNewUserOnboarding()) {
         setFirstRunOnboarding(true);
         setOnboardingMode(readOnboardingStatus()?.state === "phone-pending" ? "install" : "setup");
      }

      const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
      return () => window.clearInterval(timer);
   }, []);

   const views = useMemo(() => buildLifeViews(state), [state]);
   const greetingName = getAllevinDisplayName("");
   const comingUpItems = useMemo(() => {
      const todayEnd = new Date(nowMs);
      todayEnd.setHours(23, 59, 59, 999);

      const futureDated = state.items
         .filter((item) => item.state !== "archived" && item.state !== "done" && item.state !== "waiting")
         .filter((item) => {
            const when = item.deferUntil || item.startAt || item.dueAt;
            return item.recurrence !== "none" || Boolean(when && when > todayEnd.getTime());
         })
         .map((item) => ({ item, waitingMode: false, meta: undefined as string | undefined }));

      const waiting = views.waiting.map((item) => ({
         item,
         waitingMode: true,
         meta: item.followUpAt ? `Follow up ${formatLifeDate(item.followUpAt)}` : "Waiting",
      }));

      const later = views.whenever.map((item) => ({
         item,
         waitingMode: false,
         meta: undefined as string | undefined,
      }));

      const unique = new Map<string, { item: (typeof state.items)[number]; waitingMode: boolean; meta?: string }>();
      for (const entry of [...futureDated, ...waiting, ...later]) {
         if (!unique.has(entry.item.id)) unique.set(entry.item.id, entry);
      }

      return [...unique.values()].sort((left, right) => {
         const leftTime = left.item.followUpAt || left.item.deferUntil || left.item.startAt || left.item.dueAt || Number.MAX_SAFE_INTEGER;
         const rightTime = right.item.followUpAt || right.item.deferUntil || right.item.startAt || right.item.dueAt || Number.MAX_SAFE_INTEGER;
         return leftTime - rightTime || left.item.title.localeCompare(right.item.title);
      });
   }, [state, views.waiting, views.whenever, nowMs]);

   const comingUpCollapsible = comingUpItems.length >= 3;
   const showComingUpItems = !comingUpCollapsible || comingUpOpen;
   const visibleComingUpItems = comingUpItems.slice(0, 10);
   const recurringComingUpItems = visibleComingUpItems.filter(({ item }) => item.recurrence !== "none");
   const laterComingUpItems = visibleComingUpItems.filter(({ item }) => item.recurrence === "none");

   function saveProfile() {
      saveAllevinUserProfile(name);
      saveAllevinTone(tone);
   }

   function resetLife() {
      if (!window.confirm("Start ALLEVIN fresh? This clears your schedule, activities, reminders, chat, and profile from this browser.")) return;
      resetAllevinLifeWorkspace({ preserveProfile: false });
      setName("");
      setTone("balanced");
      setSettingsOpen(false);
      setFreshStartOnboarding(true);
      setOnboardingSession((value) => value + 1);
      setFirstRunOnboarding(true);
      setOnboardingMode("setup");
   }

   function finishOnboarding() {
      setFirstRunOnboarding(false);
      setOnboardingMode(null);
      setFreshStartOnboarding(false);
      setName(getAllevinDisplayName(""));
      setTone(readAllevinTone());
   }

   if (!hydrated) return <main className="life-app"><div className="life-loading">Opening ALLEVIN…</div></main>;

   if (firstRunOnboarding && onboardingMode === "setup") {
      return (
         <OnboardingFlow
            key={`first-${onboardingSession}`}
            mode="setup"
            freshStart={freshStartOnboarding}
            onClose={() => { setFirstRunOnboarding(false); setOnboardingMode(null); }}
            onComplete={finishOnboarding}
            onEnableReminders={rhythm.enableReminders}
            remindersEnabled={rhythm.state.remindersEnabled}
         />
      );
   }

   return (
      <main className="life-app">
         <header className="life-topbar">
            <div className="life-brand" aria-label="ALLEVIN">
               <img className="life-brand-logo-full" src="/allevin-logo-clean.png" alt="ALLEVIN" />
            </div>
            <div className="life-topbar-right">
               <LiveClock />
               <button className="icon-button topbar-settings" onClick={() => setSettingsOpen((value) => !value)} aria-label="ALLEVIN settings"><Settings2 size={18} /></button>
            </div>
         </header>
         <AppUpdateNotice />

         <SettingsScreen
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            name={name}
            tone={tone}
            onNameChange={setName}
            onToneChange={setTone}
            onSaveProfile={saveProfile}
            rhythmState={rhythm.state}
            notificationPermission={rhythm.notificationPermission}
            onEnableReminders={rhythm.enableReminders}
            onSetRemindersEnabled={rhythm.setRemindersEnabled}
            onOpenInstall={() => { setSettingsOpen(false); setOnboardingMode("install"); }}
            onReset={resetLife}
         />

         {onboardingMode ? (
            <OnboardingFlow
               key={`overlay-${onboardingSession}-${onboardingMode}`}
               mode={onboardingMode}
               freshStart={freshStartOnboarding && onboardingMode === "setup"}
               onClose={() => { setFreshStartOnboarding(false); setOnboardingMode(null); }}
               onComplete={finishOnboarding}
               onEnableReminders={rhythm.enableReminders}
               remindersEnabled={rhythm.state.remindersEnabled}
            />
         ) : null}

         <section className="life-hero">
            <h1>{getDayGreeting()}{greetingName ? `, ${greetingName}` : ""}.</h1>
         </section>

         <section className="day-ledger" aria-label="Daily page">
            <UpNextPanel lifeState={state} rhythmState={rhythm.state} nowMs={nowMs} onCompleteRhythm={rhythm.completeEntry} />

            <CalendarWorkspace lifeState={state} rhythmState={rhythm.state} nowMs={nowMs} />

            <section className="day-block day-block-ahead">
                  <header className="day-block-header ahead-header">
                     <h2>Coming Up</h2>
                     <div className="ahead-header-actions">
                        <button className="ahead-add" type="button" onClick={() => { setManualReminderOpen(true); setComingUpOpen(true); }} aria-expanded={manualReminderOpen}>
                           <BellPlus size={16} /> Add reminder
                        </button>
                        {comingUpCollapsible ? (
                           <button className="ahead-toggle" onClick={() => setComingUpOpen((value) => !value)} aria-expanded={comingUpOpen}>
                              <b>{comingUpItems.length}</b>
                              {comingUpOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                           </button>
                        ) : null}
                     </div>
                  </header>

                  {manualReminderOpen ? <ManualReminderForm onCreate={create} onClose={() => setManualReminderOpen(false)} /> : null}

                  {showComingUpItems && comingUpItems.length ? (
                     <div className="ahead-groups">
                        {recurringComingUpItems.length ? (
                           <section className="ahead-group" aria-labelledby="repeating-reminders-heading">
                              <header className="ahead-group-heading">
                                 <div>
                                    <h3 id="repeating-reminders-heading">Repeating reminders</h3>
                                    <p>Ongoing reminders that keep their schedule.</p>
                                 </div>
                                 <span>{recurringComingUpItems.length} active</span>
                              </header>
                              <div className="ahead-list ahead-list-recurring">
                                 {recurringComingUpItems.map(({ item }) => (
                                    <RecurringReminderRow key={item.id} item={item} onUpdate={update} onArchive={archive} />
                                 ))}
                              </div>
                           </section>
                        ) : null}

                        {laterComingUpItems.length ? (
                           <section className="ahead-group" aria-labelledby="later-items-heading">
                              <header className="ahead-group-heading">
                                 <div>
                                    <h3 id="later-items-heading">Later</h3>
                                    <p>One-time reminders and things waiting ahead.</p>
                                 </div>
                                 <span>{laterComingUpItems.length}</span>
                              </header>
                              <div className="ahead-list">
                                 {laterComingUpItems.map(({ item, meta, waitingMode }) => (
                                    <LifeItemRow key={item.id} item={item} meta={meta} onComplete={complete} onTomorrow={tomorrow} onToday={today} onReopen={reopen} onArchive={archive} waitingMode={waitingMode} />
                                 ))}
                              </div>
                           </section>
                        ) : null}
                     </div>
                  ) : !manualReminderOpen ? <p className="ahead-empty">No reminders waiting ahead. Add one here or tell ALLEVIN in chat.</p> : null}
               </section>
         </section>

         {footerInfo ? <FooterInfoPanel section={footerInfo} onClose={() => setFooterInfo(null)} /> : null}
         <footer className="life-footer">
            <div className="life-footer-brand"><strong>ALLEVIN</strong><span>Kin Software LLC</span></div>
            <div className="life-footer-right"><nav aria-label="ALLEVIN information"><button type="button" onClick={() => setFooterInfo(footerInfo === "about" ? null : "about")}>About</button><button type="button" onClick={() => setFooterInfo(footerInfo === "privacy" ? null : "privacy")}>Privacy</button><button type="button" onClick={() => setFooterInfo(footerInfo === "terms" ? null : "terms")}>Terms</button></nav><p>ALLEVIN uses AI to help interpret and organize what you share.</p></div>
         </footer>

         <KinDock />
      </main>
   );
}
