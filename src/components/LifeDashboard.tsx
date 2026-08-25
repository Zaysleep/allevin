"use client";

import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import BackupRestoreSettings from "@/components/BackupRestoreSettings";
import CalendarWorkspace from "@/components/CalendarWorkspace";
import KinDock from "@/components/KinDock";
import LifeItemRow from "@/components/LifeItemRow";
import LifestyleSettingsEditor from "@/components/LifestyleSettingsEditor";
import LiveClock from "@/components/LiveClock";
import RhythmSettingsEditor from "@/components/RhythmSettingsEditor";
import UpNextPanel from "@/components/UpNextPanel";
import { useDailyRhythm } from "@/hooks/useDailyRhythm";
import { useLifeState } from "@/hooks/useLifeState";
import { getFreshAllevinHeroLine } from "@/lib/allevinHeroLine";
import { getAllevinDisplayName, resetAllevinLifeWorkspace, saveAllevinUserProfile } from "@/lib/allevinUserProfile";
import { readAllevinTone, saveAllevinTone, type AllevinTone } from "@/lib/allevinVoice";
import { buildLifeViews, formatLifeDate, getDayGreeting } from "@/lib/lifeEngine";


type FooterInfo = "about" | "privacy" | "terms" | null;

function FooterInfoPanel({ section, onClose }: { section: Exclude<FooterInfo, null>; onClose: () => void }) {
   const content = {
      about: { title: "About ALLEVIN", body: "ALLEVIN is a personal daily assistant from Kin Software LLC." },
      privacy: { title: "Privacy", body: "Your ALLEVIN items, rhythm, recommendations, and conversation are saved in this browser in this version. AI requests may send relevant information to the configured AI service." },
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
   const { state, hydrated, complete, reopen, archive, tomorrow, today } = useLifeState();
   const rhythm = useDailyRhythm();
   const [settingsOpen, setSettingsOpen] = useState(false);
   const [name, setName] = useState("");
   const [tone, setTone] = useState<AllevinTone>("direct");
   const [footerInfo, setFooterInfo] = useState<FooterInfo>(null);
   const [comingUpOpen, setComingUpOpen] = useState(false);
   const [nowMs, setNowMs] = useState(() => Date.now());
   const [heroLine, setHeroLine] = useState("");

   useEffect(() => {
      setName(getAllevinDisplayName(""));
      setTone(readAllevinTone());

      // The hero line is selected once per page load. Its history is stored in
      // the browser, so refreshing produces a different line without creating
      // an AI request, loading state, or stale server-side cache.
      setHeroLine(getFreshAllevinHeroLine());

      const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
      return () => window.clearInterval(timer);
   }, []);

   const views = useMemo(() => buildLifeViews(state), [state]);
   const greetingName = getAllevinDisplayName("");
   const comingUpItems = useMemo(() => {
      const todayEnd = new Date(nowMs);
      todayEnd.setHours(23, 59, 59, 999);

      const futureDated = state.items
         .filter((item) => item.state !== "archived" && item.state !== "done" && item.state !== "waiting" && item.kind !== "routine")
         .filter((item) => {
            const when = item.deferUntil || item.startAt || item.dueAt;
            return Boolean(when && when > todayEnd.getTime());
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
   }, [state.items, views.waiting, views.whenever, nowMs]);

   const comingUpCollapsible = comingUpItems.length >= 3;
   const showComingUpItems = !comingUpCollapsible || comingUpOpen;

   function saveProfile() {
      saveAllevinUserProfile(name);
      saveAllevinTone(tone);
      setSettingsOpen(false);
   }

   function resetLife() {
      if (!window.confirm("Clear your ALLEVIN items and conversation from this browser?")) return;
      resetAllevinLifeWorkspace({ preserveProfile: true });
      setSettingsOpen(false);
   }

   if (!hydrated) return <main className="life-app"><div className="life-loading">Opening ALLEVIN…</div></main>;

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

         {settingsOpen ? (
            <aside className="settings-panel">
               <div className="settings-panel-head"><h2>Settings</h2><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></div>
               <label className="settings-field"><span>Name</span><input value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} placeholder="Your name" maxLength={40} /></label>
               <label className="settings-field"><span>Tone</span><select value={tone} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTone(event.target.value as AllevinTone)}><option value="direct">Direct</option><option value="balanced">Balanced</option><option value="calm">Calm</option></select></label>
               <button className="settings-save" onClick={saveProfile}>Save</button>
               <div className="settings-divider" />
               <RhythmSettingsEditor state={rhythm.state} />
               <div className="settings-divider" />
               <LifestyleSettingsEditor />
               <div className="settings-divider" />
               <BackupRestoreSettings />
               <div className="settings-divider" />
               <div className="settings-reminder-row">
                  <strong>Reminders</strong>
                  {rhythm.notificationPermission === "granted" ? <button className="settings-inline-button" onClick={() => rhythm.setRemindersEnabled(!rhythm.state.remindersEnabled)}>{rhythm.state.remindersEnabled ? "On" : "Off"}</button> : <button className="settings-inline-button" onClick={() => void rhythm.enableReminders()}>Enable</button>}
               </div>
               <div className="settings-divider" />
               <button className="settings-reset" onClick={resetLife}>Clear ALLEVIN data</button>
            </aside>
         ) : null}

         <section className="life-hero">
            <h1>{getDayGreeting()}{greetingName ? `, ${greetingName}` : ""}.</h1>
            {heroLine ? <p className="life-hero-line">{heroLine}</p> : null}
         </section>

         <section className="day-ledger" aria-label="Daily page">
            <UpNextPanel lifeState={state} rhythmState={rhythm.state} nowMs={nowMs} onCompleteRhythm={rhythm.completeEntry} />

            <CalendarWorkspace lifeState={state} rhythmState={rhythm.state} nowMs={nowMs} />

            {comingUpItems.length ? (
               <section className="day-block day-block-ahead">
                  <header className="day-block-header ahead-header">
                     <h2>Coming Up</h2>
                     {comingUpCollapsible ? (
                        <button className="ahead-toggle" onClick={() => setComingUpOpen((value) => !value)} aria-expanded={comingUpOpen}>
                           <b>{comingUpItems.length}</b>
                           {comingUpOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                     ) : null}
                  </header>

                  {showComingUpItems ? (
                     <div className="ahead-list">
                        {comingUpItems.slice(0, 10).map(({ item, meta, waitingMode }) => (
                           <LifeItemRow
                              key={item.id}
                              item={item}
                              meta={meta}
                              onComplete={complete}
                              onTomorrow={tomorrow}
                              onToday={today}
                              onReopen={reopen}
                              onArchive={archive}
                              waitingMode={waitingMode}
                           />
                        ))}
                     </div>
                  ) : null}
               </section>
            ) : null}
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
