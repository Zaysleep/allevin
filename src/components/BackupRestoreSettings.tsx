"use client";

import { Download, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";

import { downloadAllevinBackup, restoreAllevinBackup } from "@/lib/allevinBackup";

/**
 * Personal Alpha stays local-first, so Backup/Restore is the deliberate bridge
 * between a desktop browser and the phone PWA until account sync exists.
 */
export default function BackupRestoreSettings() {
   const inputRef = useRef<HTMLInputElement>(null);
   const [message, setMessage] = useState("");

   async function importBackup(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
         const count = await restoreAllevinBackup(file);
         setMessage(`Restored ${count} ALLEVIN data records. Reloading…`);
         window.setTimeout(() => window.location.reload(), 600);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : "That backup could not be restored.");
      }
   }

   return (
      <section className="settings-group">
         <div className="settings-group-heading">
            <strong>Backup</strong>
         </div>

         <div className="settings-transfer-actions">
            <button
               type="button"
               className="settings-inline-button settings-transfer-button"
               onClick={() => downloadAllevinBackup()}
            >
               <Download size={14} /> Export
            </button>

            <button
               type="button"
               className="settings-inline-button settings-transfer-button"
               onClick={() => inputRef.current?.click()}
            >
               <Upload size={14} /> Import
            </button>

            <input
               ref={inputRef}
               className="settings-file-input"
               type="file"
               accept="application/json,.json"
               onChange={(event) => void importBackup(event)}
            />
         </div>

         {message ? <p className="settings-transfer-message">{message}</p> : null}
      </section>
   );
}
