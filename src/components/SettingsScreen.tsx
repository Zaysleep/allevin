"use client";

import { ChevronDown, X } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import BackupRestoreSettings from "@/components/BackupRestoreSettings";
import LanguageConnectionStatus from "@/components/LanguageConnectionStatus";
import LifestyleSettingsEditor from "@/components/LifestyleSettingsEditor";
import RhythmSettingsEditor from "@/components/RhythmSettingsEditor";
import { sendAllevinTestNotification } from "@/lib/allevinNotifications";
import { readLifestyleProfile } from "@/lib/allevinLifestyleProfile";
import { formatClock, type DailyRhythmState } from "@/lib/dailyRhythm";
import type { AllevinTone } from "@/lib/allevinVoice";

type SettingsSection = "profile" | "schedule" | "routines" | "lifestyle" | "choices" | "notifications" | "data";

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
   onOpenSetup,
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
   onOpenSetup: () => void;
   onOpenInstall: () => void;
   onReset: () => void;
}) {
   const [active, setActive] = useState<SettingsSection | null>("profile");
   const [testSubject, setTestSubject] = useState("Take a quick break from the screen");
   const [testMessage, setTestMessage] = useState("");
   const lifestyle = useMemo(() => open ? readLifestyleProfile() : null, [open]);

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

   if (!open) return null;

   const firstSchedule = rhythmState.scheduleBlocks[0];
   const scheduleSummary = firstSchedule
      ? `${firstSchedule.title} · ${daySummary(firstSchedule.days)} · ${formatClock(firstSchedule.start)}–${formatClock(firstSchedule.end)}`
      : "No regular schedule yet";
   const choiceSummary = lifestyle?.flexibleChoiceSets.flatMap((set) => set.choices).slice(0, 3).join(", ") || "No flexible choices yet";
   const lifestyleSummary = [
      lifestyle?.preferredBedtime ? `Bedtime ${formatClock(lifestyle.preferredBedtime)}` : "No bedtime",
      lifestyle?.commuteMinutes ? `${lifestyle.commuteMinutes}-min travel` : "No travel time",
   ].join(" · ");
   const toggle = (id: SettingsSection) => setActive((current) => current === id ? null : id);

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

            <AccordionSection id="routines" title="Routines" summary={`${rhythmState.anchors.length} ${rhythmState.anchors.length === 1 ? "routine" : "routines"}`} open={active === "routines"} onToggle={toggle}>
               <RhythmSettingsEditor state={rhythmState} view="routines" />
            </AccordionSection>

            <AccordionSection id="lifestyle" title="Lifestyle" summary={lifestyleSummary} open={active === "lifestyle"} onToggle={toggle}>
               <LifestyleSettingsEditor view="lifestyle" />
            </AccordionSection>

            <AccordionSection id="choices" title="Flexible choices" summary={choiceSummary} open={active === "choices"} onToggle={toggle}>
               <LifestyleSettingsEditor view="choices" />
            </AccordionSection>

            <AccordionSection id="notifications" title="Notifications" summary={`${rhythmState.remindersEnabled ? "On" : "Off"} · Personal language`} open={active === "notifications"} onToggle={toggle}>
               <div className="settings-reminder-row">
                  <div><strong>Phone reminders</strong><span>{rhythmState.remindersEnabled ? "ALLEVIN can reach you when the app is closed." : "Turn these on when you want ALLEVIN to nudge you."}</span></div>
                  {notificationPermission === "granted" ? <button className="settings-inline-button" onClick={() => onSetRemindersEnabled(!rhythmState.remindersEnabled)}>{rhythmState.remindersEnabled ? "On" : "Off"}</button> : <button className="settings-inline-button" onClick={() => void onEnableReminders()}>Enable</button>}
               </div>
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
                  <button className="settings-guide-button" type="button" onClick={onOpenSetup}>Set up ALLEVIN again</button>
                  <button className="settings-guide-button" type="button" onClick={onOpenInstall}>Add ALLEVIN to your phone</button>
                  <button className="settings-reset" onClick={onReset}>Clear ALLEVIN data</button>
               </div>
            </AccordionSection>
         </div>
      </div>
   );
}
