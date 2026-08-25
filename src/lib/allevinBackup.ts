// ========================================
// ALLEVIN MK XII.8 — Local Backup / Restore
// Purpose:
// Move a Personal Alpha state between browsers without introducing accounts or
// cloud sync yet.
//
// The bundle intentionally captures every localStorage key prefixed "allevin-"
// so future local-first modules are included automatically.
// ========================================

export interface AllevinBackupBundle {
   format: "allevin-local-backup";
   version: 1;
   exportedAt: string;
   entries: Record<string, string>;
}

const PREFIX = "allevin-";

// Delivery logs belong to one browser/device. Copying them to a phone could
// suppress a reminder just because the Mac already displayed it.
const DEVICE_LOCAL_PREFIXES = [
   "allevin-notification-log",
   "allevin-push-device-id",
   "allevin-server-push-active",
];

function isBrowser() {
   return typeof window !== "undefined";
}

export function createAllevinBackup(): AllevinBackupBundle {
   const entries: Record<string, string> = {};

   if (isBrowser()) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
         const key = window.localStorage.key(index);
         if (!key || !key.startsWith(PREFIX)) continue;
         if (DEVICE_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
         const value = window.localStorage.getItem(key);
         if (value !== null) entries[key] = value;
      }
   }

   return {
      format: "allevin-local-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
   };
}

export function downloadAllevinBackup() {
   if (!isBrowser()) return;

   const bundle = createAllevinBackup();
   const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
   const url = URL.createObjectURL(blob);
   const stamp = new Date().toISOString().replace(/[:.]/g, "-");
   const anchor = document.createElement("a");
   anchor.href = url;
   anchor.download = `ALLEVIN_BACKUP_${stamp}.json`;
   document.body.appendChild(anchor);
   anchor.click();
   anchor.remove();

   // iOS can begin the file transfer asynchronously. Give Safari a moment to
   // claim the Blob URL before releasing it.
   window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function parseBundle(raw: string): AllevinBackupBundle {
   const parsed = JSON.parse(raw) as Partial<AllevinBackupBundle>;
   if (
      parsed.format !== "allevin-local-backup" ||
      parsed.version !== 1 ||
      !parsed.entries ||
      typeof parsed.entries !== "object"
   ) {
      throw new Error("This is not a valid ALLEVIN backup.");
   }

   const entries = Object.fromEntries(
      Object.entries(parsed.entries)
         .filter(
            ([key, value]) =>
               key.startsWith(PREFIX) &&
               !DEVICE_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
               typeof value === "string",
         )
         .slice(0, 200),
   );

   return {
      format: "allevin-local-backup",
      version: 1,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
      entries,
   };
}

export async function restoreAllevinBackup(file: File) {
   if (!isBrowser()) return 0;

   const bundle = parseBundle(await file.text());

   // Restore is intentionally exact rather than additive. Clear the existing
   // ALLEVIN namespace only after the backup validates, then write the imported
   // state. Browser permissions and device-local delivery logs stay untouched.
   const existingKeys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index),
   ).filter(
      (key): key is string =>
         Boolean(
            key?.startsWith(PREFIX) &&
            !DEVICE_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix)),
         ),
   );

   for (const key of existingKeys) window.localStorage.removeItem(key);

   for (const [key, value] of Object.entries(bundle.entries)) {
      window.localStorage.setItem(key, value);
   }

   return Object.keys(bundle.entries).length;
}
