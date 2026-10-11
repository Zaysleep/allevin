"use client";

import { ChevronDown, X } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import BackupRestoreSettings from "@/components/BackupRestoreSettings";
import InterestsSettings from "@/components/InterestsSettings";
import LanguageConnectionStatus from "@/components/LanguageConnectionStatus";
import RhythmSettingsEditor from "@/components/RhythmSettingsEditor";
import { sendAllevinTestNotification } from "@/lib/allevinNotifications";
import {
   NOTIFICATION_HEALTH_UPDATED_EVENT,
   readNotificationHealth,
   readNotificationPreferences,
   saveNotificationPreferences,
   type NotificationHealth,
   type NotificationPreferences,
} from "@/lib/allevinNotificationHealth";
import { refreshNotificationHealth, repairNotificationSchedule } from "@/lib/allevinServerPushClient";
import { ALLEVIN_INTERESTS_UPDATED_EVENT, interestSummary, readInterestPreferences } from "@/lib/allevinInterests";
import { formatClock, type DailyRhythmState } from "@/lib/dailyRhythm";
import type { AllevinTone } from "@/lib/allevinVoice";

type SettingsSection = "profile" | "schedule" | "routines" | "interests" | "notifications" | "data";

function AccordionSection({
   id,
   title,
   summary,
   open,
   onToggle,
   children,
}: {
   id: SettingsSection;
   title: string;
   summary: string;
   open: boolean;
   onToggle: (id: SettingsSection) => void;
   children: ReactNode;
}) {
   const panelId = `settings-${id}-panel`;
   return (
      <section className={`settings-accordion ${open ? "settings-accordion-open" : ""}`}>
         <button
            type="button"
            className="settings-accordion-trigger"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => onToggle(id)}
         >
            <span><strong>{title}</strong><small>{summary}</small></span>
            <ChevronDown size={18} aria-hidden="true" />
         </button>
         {open ? <div className="settings-accordion-panel" id={panelId}>{children}</div> : null}
      </section>
   );
}

function daySummary(days: number[]) {
   const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
   if (days.join(",") === "1,2,3,4,5") return "Mon–Fri";
   return days.map((day) => labels[day]).join(", ") || "No days";
}

function dateTimeLabel(timestamp?: number) {
   if (!timestamp) return "Not recorded yet";
   return new Date(timestamp).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function notificationHealthCopy(health: NotificationHealth, enabled: boolean) {
   if (!enabled) return { label: "Off", detail: "Turn on phone reminders when you want ALLEVIN to reach you." };
   if (health.state === "checking") return { label: "Checking", detail: "ALLEVIN is refreshing the next notification window." };
   if (health.state === "ready") return { label: "Ready", detail: health.queuedJobs ? `${health.queuedJobs} notifications are queued safely.` : "Nothing needs to be queued right now." };
   if (health.state === "local-only") return { label: "App-only backup", detail: "Reminders can appear while ALLEVIN is open. Repair the background connection for closed-app delivery." };
   return { label: "Needs attention", detail: health.lastError || "The notification schedule needs to be refreshed." };
}

export default function SettingsScreen({
   open,
   onClose,
   name,
   tone,
   onNameChange,
   onToneChange,
   onSaveProfile,
   rhythmState,
   notificationPermission,
   onEnableReminders,
   onSetRemindersEnabled,
   onOpenInstall,
   onReset,
}: {
   open: boolean;
   onClose: () => void;
   name: string;
   tone: AllevinTone;
   onNameChange: (value: string) => void;
   onToneChange: (value: AllevinTone) => void;
   onSaveProfile: () => void;
   rhythmState: DailyRhythmState;
   notificationPermission: NotificationPermission | "unsupported";
   onEnableReminders: () => Promise<NotificationPermission | "unsupported">;
   onSetRemindersEnabled: (enabled: boolean) => void;
   onOpenInstall: () => void;
   onReset: () => void;
}) {
   const [active, setActive] = useState<SettingsSection | null>("profile");
   const [testSubject, setTestSubject] = useState("Take a quick break from the screen");
   const [testMessage, setTestMessage] = useState("");
   const [health, setHealth] = useState<NotificationHealth>(() => readNotificationHealth());
   const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(() => readNotificationPreferences());
   const [interestPreferences, setInterestPreferences] = useState(() => readInterestPreferences());
   const [repairing, setRepairing] = useState(false);

   useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === "Escape") onClose();
      };
      document.body.classList.add("settings-screen-active");
      window.addEventListener("keydown", onKeyDown);
      return () => {
         document.body.classList.remove("settings-screen-active");
         window.removeEventListener("keydown", onKeyDown);
      };
   }, [open, onClose]);

   useEffect(() => {
      if (!open) return;
      const updateHealth = () => setHealth(readNotificationHealth());
      const updateInterests = () => setInterestPreferences(readInterestPreferences());
      window.addEventListener(NOTIFICATION_HEALTH_UPDATED_EVENT, updateHealth);
      window.addEventListener(ALLEVIN_INTERESTS_UPDATED_EVENT, updateInterests);
      void refreshNotificationHealth().then(setHealth);
      return () => {
         window.removeEventListener(NOTIFICATION_HEALTH_UPDATED_EVENT, updateHealth);
         window.removeEventListener(ALLEVIN_INTERESTS_UPDATED_EVENT, updateInterests);
      };
   }, [open]);

   if (!open) return null;

   const firstSchedule = rhythmState.scheduleBlocks[0];
   const scheduleSummary = firstSchedule
      ? `${firstSchedule.title} · ${daySummary(firstSchedule.days)} · ${formatClock(firstSchedule.start)}–${formatClock(firstSchedule.end)}`
      : rhythmState.bedtime ? `Bedtime · ${formatClock(rhythmState.bedtime)}` : "No regular schedule yet";
   const toggle = (id: SettingsSection) => setActive((current) => current === id ? null : id);
   const healthCopy = notificationHealthCopy(health, rhythmState.remindersEnabled);

   function updateNotificationPreferences(changes: Partial<NotificationPreferences>) {
      const next = { ...notificationPreferences, ...changes };
      setNotificationPreferences(next);
      saveNotificationPreferences(next);
   }

   async function repairNotifications() {
      setRepairing(true);
      const repaired = await repairNotificationSchedule();
      setHealth(await refreshNotificationHealth());
      setTestMessage(repaired ? "Your notification schedule is refreshed." : "Background delivery still needs attention. App-open reminders remain available.");
      setRepairing(false);
   }

   return (
      <div className="settings-screen" role="dialog" aria-modal="true" aria-label="ALLEVIN settings">
         <header className="settings-screen-header">
            <div><span>ALLEVIN</span><h2>Settings</h2></div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
         </header>

         <div className="settings-screen-body">
            <AccordionSection id="profile" title="Profile" summary={`${name || "No name"} · ${tone === "calm" ? "Gentle" : tone.charAt(0).toUpperCase() + tone.slice(1)}`} open={active === "profile"} onToggle={toggle}>
               <label className="settings-field"><span>Name</span><input value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value)} placeholder="Your name" maxLength={40} /></label>
               <label className="settings-field"><span>Tone</span><select value={tone} onChange={(event: ChangeEvent<HTMLSelectElement>) => onToneChange(event.target.value as AllevinTone)}><option value="direct">Direct</option><option value="balanced">Balanced</option><option value="calm">Gentle</option></select></label>
               <button className="settings-save" onClick={() => { onSaveProfile(); setActive(null); }}>Save profile</button>
            </AccordionSection>

            <AccordionSection id="schedule" title="Schedule" summary={scheduleSummary} open={active === "schedule"} onToggle={toggle}>
               <RhythmSettingsEditor state={rhythmState} view="schedule" />
            </AccordionSection>

            <AccordionSection id="routines" title="Daily activities" summary={`${rhythmState.anchors.length} ${rhythmState.anchors.length === 1 ? "activity" : "activities"}`} open={active === "routines"} onToggle={toggle}>
               <RhythmSettingsEditor state={rhythmState} view="routines" />
            </AccordionSection>

            <AccordionSection id="interests" title="Interests" summary={interestSummary(interestPreferences)} open={active === "interests"} onToggle={toggle}>
               <InterestsSettings />
            </AccordionSection>

            <AccordionSection id="notifications" title="Notifications" summary={`${rhythmState.remindersEnabled ? "On" : "Off"} · Personal language`} open={active === "notifications"} onToggle={toggle}>
               <section className={`notification-health-card notification-health-${health.state}`} aria-live="polite">
                  <header><span>Notification health</span><strong>{healthCopy.label}</strong></header>
                  <p>{healthCopy.detail}</p>
                  <dl>
                     <div><dt>Next</dt><dd>{health.nextDueAt ? dateTimeLabel(health.nextDueAt) : "Nothing queued"}</dd></div>
                     <div><dt>Last shown</dt><dd>{dateTimeLabel(health.lastShownAt)}</dd></div>
                     <div><dt>Background check</dt><dd>{dateTimeLabel(health.lastSchedulerRunAt)}</dd></div>
                     <div><dt>Last checked</dt><dd>{dateTimeLabel(health.lastSyncAt)}</dd></div>
                  </dl>
                  <button type="button" className="settings-inline-button" disabled={repairing || !rhythmState.remindersEnabled} onClick={() => void repairNotifications()}>{repairing ? "Repairing…" : "Repair notifications"}</button>
               </section>
               <div className="settings-reminder-row">
                  <div><strong>Phone reminders</strong><span>{rhythmState.remindersEnabled ? "ALLEVIN can reach you when the app is closed." : "Turn these on when you want ALLEVIN to nudge you."}</span></div>
                  {notificationPermission === "granted" ? <button className="settings-inline-button" onClick={() => onSetRemindersEnabled(!rhythmState.remindersEnabled)}>{rhythmState.remindersEnabled ? "On" : "Off"}</button> : <button className="settings-inline-button" onClick={() => void onEnableReminders()}>Enable</button>}
               </div>
               <div className="settings-reminder-row settings-quiet-day-row">
                  <div><strong>Quiet-day check-in</strong><span>One thoughtful morning note when your day has no activities or reminders.</span></div>
                  <button className="settings-inline-button" type="button" onClick={() => updateNotificationPreferences({ quietDayEnabled: !notificationPreferences.quietDayEnabled })}>{notificationPreferences.quietDayEnabled ? "On" : "Off"}</button>
               </div>
               {notificationPreferences.quietDayEnabled ? <label className="settings-field settings-quiet-day-time"><span>Check-in time</span><input type="time" value={notificationPreferences.quietDayTime} onChange={(event) => updateNotificationPreferences({ quietDayTime: event.target.value })} /></label> : null}
               <div className="settings-preference-group">
                  <div className="settings-reminder-row">
                     <div><strong>Contextual check-ins</strong><span>Opening selected preparation alerts can ask whether the plan is still happening.</span></div>
                     <button className="settings-inline-button" type="button" onClick={() => updateNotificationPreferences({ contextualCheckInsEnabled: !notificationPreferences.contextualCheckInsEnabled })}>{notificationPreferences.contextualCheckInsEnabled ? "On" : "Off"}</button>
                  </div>
                  {notificationPreferences.contextualCheckInsEnabled ? (
                     <div className="settings-check-in-options" aria-label="Contextual check-in types">
                        <label><input type="checkbox" checked={notificationPreferences.checkInWorkSchool} onChange={(event) => updateNotificationPreferences({ checkInWorkSchool: event.target.checked })} /> Work & school</label>
                        <label><input type="checkbox" checked={notificationPreferences.checkInAppointments} onChange={(event) => updateNotificationPreferences({ checkInAppointments: event.target.checked })} /> Appointments</label>
                        <label><input type="checkbox" checked={notificationPreferences.checkInCommutes} onChange={(event) => updateNotificationPreferences({ checkInCommutes: event.target.checked })} /> Commutes</label>
                        <label><input type="checkbox" checked={notificationPreferences.checkInRoutines} onChange={(event) => updateNotificationPreferences({ checkInRoutines: event.target.checked })} /> Preparation routines</label>
                     </div>
                  ) : null}
               </div>
               <div className="settings-preference-group">
                  <div className="settings-reminder-row">
                     <div><strong>Quiet hours</strong><span>Routine nudges wait outside this window. Important commitments can remain allowed.</span></div>
                     <button className="settings-inline-button" type="button" onClick={() => updateNotificationPreferences({ quietHoursEnabled: !notificationPreferences.quietHoursEnabled })}>{notificationPreferences.quietHoursEnabled ? "On" : "Off"}</button>
                  </div>
                  {notificationPreferences.quietHoursEnabled ? (
                     <div className="settings-quiet-hours">
                        <label className="settings-field"><span>Starts</span><input type="time" value={notificationPreferences.quietHoursStart} onChange={(event) => updateNotificationPreferences({ quietHoursStart: event.target.value })} /></label>
                        <label className="settings-field"><span>Ends</span><input type="time" value={notificationPreferences.quietHoursEnd} onChange={(event) => updateNotificationPreferences({ quietHoursEnd: event.target.value })} /></label>
                        <label className="settings-check-row"><input type="checkbox" checked={notificationPreferences.allowImportantDuringQuietHours} onChange={(event) => updateNotificationPreferences({ allowImportantDuringQuietHours: event.target.checked })} /> Allow important commitments</label>
                     </div>
                  ) : null}
               </div>
               {health.preview.length ? (
                  <div className="notification-preview">
                     <strong>Next notifications</strong>
                     <div>{health.preview.slice(0, 4).map((item) => <p key={item.id}><span>{item.phase === "checkpoint" ? "Before" : "At time"}</span><b>{item.title}</b><time>{dateTimeLabel(item.dueAt)}</time></p>)}</div>
                  </div>
               ) : null}
               <div className="settings-notification-test">
                  <label><span>Test reminder</span><input value={testSubject} onChange={(event) => setTestSubject(event.target.value)} maxLength={120} /></label>
                  <button type="button" className="settings-inline-button" onClick={() => void sendAllevinTestNotification(testSubject).then((sent) => setTestMessage(sent ? "Test sent." : "Turn on notifications first, then try again."))}>Send test</button>
                  {testMessage ? <p aria-live="polite">{testMessage}</p> : null}
               </div>
               <LanguageConnectionStatus />
            </AccordionSection>

            <AccordionSection id="data" title="Data & setup" summary="Backup, phone setup, and reset" open={active === "data"} onToggle={toggle}>
               <BackupRestoreSettings />
               <div className="settings-data-actions">
                  <button className="settings-guide-button" type="button" onClick={onOpenInstall}>Add ALLEVIN to your phone</button>
                  <button className="settings-reset" type="button" onClick={onReset}>Start fresh with ALLEVIN</button>
               </div>
            </AccordionSection>
         </div>
      </div>
   );
}
