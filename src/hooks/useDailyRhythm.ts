"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { enableAllevinNotifications, listenForNotificationReceipts, registerAllevinServiceWorker, runRhythmReminderCheck } from "@/lib/allevinNotifications";
import { refreshNotificationHealth, syncServerNotificationSchedule } from "@/lib/allevinServerPushClient";
import { NOTIFICATION_PREFERENCES_UPDATED_EVENT } from "@/lib/allevinNotificationHealth";
import { ALLEVIN_TONE_UPDATED_EVENT } from "@/lib/allevinVoice";
import { LIFE_STATE_UPDATED_EVENT } from "@/lib/lifeStore";
import {
   buildTodayRhythm,
   DAILY_RHYTHM_UPDATED_EVENT,
   readDailyRhythm,
   saveDailyRhythm,
   setRhythmCompletion,
   type DailyRhythmState,
   type RhythmAnchorId,
} from "@/lib/dailyRhythm";

export function useDailyRhythm() {
   const [state, setState] = useState<DailyRhythmState>(() => readDailyRhythm());
   const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
   const [clockTick, setClockTick] = useState(() => Date.now());

   const refresh = useCallback(() => setState(readDailyRhythm()), []);

   useEffect(() => {
      refresh();
      if ("Notification" in window) setNotificationPermission(Notification.permission);
      else setNotificationPermission("unsupported");
      void registerAllevinServiceWorker();
      const stopReceiptListener = listenForNotificationReceipts();

      let syncTimer: number | undefined;
      const syncServerPlan = () => {
         window.clearTimeout(syncTimer);
         // Replacing the server plan after every meaningful state change is how
         // moved/cancelled items automatically cancel obsolete push jobs.
         syncTimer = window.setTimeout(() => void syncServerNotificationSchedule(), 450);
      };
      const onUpdate = () => {
         refresh();
         syncServerPlan();
      };
      const catchUpAfterResume = () => {
         if (document.visibilityState !== "visible") return;

         // Mobile browsers suspend timers aggressively. Re-run the reminder
         // orchestrator as soon as the installed PWA becomes active again.
         setClockTick(Date.now());
         refresh();
         void syncServerNotificationSchedule();
         void refreshNotificationHealth();
         void runRhythmReminderCheck();
      };

      window.addEventListener(DAILY_RHYTHM_UPDATED_EVENT, onUpdate);
      window.addEventListener(LIFE_STATE_UPDATED_EVENT, syncServerPlan);
      window.addEventListener(ALLEVIN_TONE_UPDATED_EVENT, syncServerPlan);
      window.addEventListener(NOTIFICATION_PREFERENCES_UPDATED_EVENT, syncServerPlan);
      window.addEventListener("storage", onUpdate);
      window.addEventListener("focus", catchUpAfterResume);
      window.addEventListener("online", catchUpAfterResume);
      window.addEventListener("pageshow", catchUpAfterResume);
      document.addEventListener("visibilitychange", catchUpAfterResume);

      const timer = window.setInterval(() => {
         setClockTick(Date.now());
         void runRhythmReminderCheck();
      }, 30_000);
      // Reconcile the background queue throughout long-running desktop/PWA
      // sessions. This also catches midnight, timezone changes, restored
      // connectivity, and server jobs that were removed after delivery.
      const repairTimer = window.setInterval(() => {
         void syncServerNotificationSchedule();
         void refreshNotificationHealth();
      }, 15 * 60_000);
      void syncServerNotificationSchedule();
      void runRhythmReminderCheck();

      return () => {
         window.removeEventListener(DAILY_RHYTHM_UPDATED_EVENT, onUpdate);
         window.removeEventListener(LIFE_STATE_UPDATED_EVENT, syncServerPlan);
      window.removeEventListener(ALLEVIN_TONE_UPDATED_EVENT, syncServerPlan);
         window.removeEventListener(NOTIFICATION_PREFERENCES_UPDATED_EVENT, syncServerPlan);
         window.removeEventListener("storage", onUpdate);
         window.removeEventListener("focus", catchUpAfterResume);
         window.removeEventListener("online", catchUpAfterResume);
         window.removeEventListener("pageshow", catchUpAfterResume);
         document.removeEventListener("visibilitychange", catchUpAfterResume);
         window.clearInterval(timer);
         window.clearInterval(repairTimer);
         window.clearTimeout(syncTimer);
         stopReceiptListener();
      };
   }, [refresh]);

   const todayEntries = useMemo(() => buildTodayRhythm(state), [state, clockTick]);

   async function enableReminders() {
      const permission = await enableAllevinNotifications();
      if (permission === "granted") {
         saveDailyRhythm({ ...readDailyRhythm(), remindersEnabled: true });
         await syncServerNotificationSchedule();
      }
      setNotificationPermission(permission);
      refresh();
      return permission;
   }

   function setRemindersEnabled(enabled: boolean) {
      saveDailyRhythm({ ...readDailyRhythm(), remindersEnabled: enabled });
      void syncServerNotificationSchedule();
   }

   function completeEntry(id: RhythmAnchorId, done: boolean) {
      setRhythmCompletion(readDailyRhythm(), id, done);
   }

   return {
      state,
      todayEntries,
      notificationPermission,
      enableReminders,
      setRemindersEnabled,
      completeEntry,
   };
}
