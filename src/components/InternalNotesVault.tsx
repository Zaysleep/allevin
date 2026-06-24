"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { NotebookPen, Search, RotateCcw, Clock3, FileText, Trash2, ChevronDown } from "lucide-react";

import { getInternalNotes, type InternalNoteRecord } from "@/lib/notesIntegration";

// ========================================
// Storage
// ========================================

const NOTES_STORAGE_KEY = "allevin-internal-notes";

// ========================================
// Component
// ========================================

export default function InternalNotesVault() {
   const [mounted, setMounted] = useState(false);

   const [notes, setNotes] = useState<InternalNoteRecord[]>([]);

   const [query, setQuery] = useState("");

   const [notice, setNotice] = useState("");

   const [expandedNoteIds, setExpandedNoteIds] = useState<string[]>([]);

   const [vaultOpen, setVaultOpen] = useState(false);

   // ========================================
   // Load
   // ========================================

   useEffect(() => {
      setMounted(true);

      setNotes(getInternalNotes());
   }, []);

   // ========================================
   // Auto-refresh when new note is saved
   // ========================================

   useEffect(() => {
      function handleNoteSaved() {
         setNotes(getInternalNotes());

         showNotice("Note saved");

         // Keep Advanced calm.
         // New notes update the count, but the vault does not expand automatically.
         setVaultOpen(false);
      }

      window.addEventListener("allevin-internal-note-saved", handleNoteSaved);

      return () => {
         window.removeEventListener("allevin-internal-note-saved", handleNoteSaved);
      };
   }, []);

   // ========================================
   // Notices
   // ========================================

   function showNotice(message: string) {
      setNotice(message);

      setTimeout(() => {
         setNotice("");
      }, 1200);
   }

   // ========================================
   // Refresh
   // ========================================

   function refreshNotes() {
      setNotes(getInternalNotes());

      showNotice("Refreshed");
   }

   // ========================================
   // Toggle Vault
   // ========================================

   function toggleVault() {
      setVaultOpen((current) => !current);
   }

   // ========================================
   // Toggle Note
   // ========================================

   function toggleNote(noteId: string) {
      setExpandedNoteIds((prev) => (prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]));
   }

   // ========================================
   // Delete Note
   // ========================================

   function deleteNote(noteId: string) {
      const updatedNotes = notes.filter((note) => note.noteId !== noteId);

      setNotes(updatedNotes);

      setExpandedNoteIds((prev) => prev.filter((id) => id !== noteId));

      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(updatedNotes));

      showNotice("Removed");
   }

   // ========================================
   // Clear All
   // ========================================

   function clearNotes() {
      localStorage.removeItem(NOTES_STORAGE_KEY);

      setNotes([]);

      setExpandedNoteIds([]);

      setQuery("");

      showNotice("Cleared");
   }

   // ========================================
   // Filtered Notes
   // ========================================

   const filteredNotes = useMemo(() => {
      const lowerQuery = query.toLowerCase().trim();

      if (!lowerQuery) {
         return notes;
      }

      return notes.filter((note) => {
         const searchableText = `
            ${note.noteTitle}
            ${note.noteBody}
            ${note.workflowId ?? ""}
            ${note.originBoardItemId ?? ""}
         `.toLowerCase();

         return searchableText.includes(lowerQuery);
      });
   }, [notes, query]);

   // ========================================
   // Latest Note
   // ========================================

   const latestNote = useMemo(() => {
      return [...notes].sort((a, b) => b.savedAt - a.savedAt)[0];
   }, [notes]);

   // ========================================
   // Time Label
   // ========================================

   function getTimeLabel(timestamp: number) {
      return new Date(timestamp).toLocaleString([], {
         month: "short",

         day: "numeric",

         hour: "numeric",

         minute: "2-digit",
      });
   }

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         id="internal-notes-vault"
         layout
         initial={{
            opacity: 0,
            y: 10,
         }}
         animate={{
            opacity: 1,
            y: 0,
         }}
         transition={{
            duration: 0.35,
         }}
         className="
            rounded-[32px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-6
            shadow-[var(--shadow-soft)]
         "
      >
         {/* Header */}

         <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <button
               type="button"
               onClick={toggleVault}
               className="
                  flex
                  min-w-0
                  flex-1
                  items-center
                  gap-4
                  text-left
               "
            >
               <div
                  className="
                     flex
                     h-14
                     w-14
                     shrink-0
                     items-center
                     justify-center
                     rounded-2xl
                     bg-[var(--color-bg)]
                  "
               >
                  <NotebookPen size={24} />
               </div>

               <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                     <p className="text-sm text-[var(--color-text-secondary)]">Advanced memory</p>

                     <span className="rounded-xl bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        {notes.length} note{notes.length === 1 ? "" : "s"}
                     </span>
                  </div>

                  <h2 className="mt-1 text-3xl">Internal Notes Vault</h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Saved project notes are stored here for review. Keep this closed when you only need the high-level Advanced view.</p>
               </div>
            </button>

            <div className="flex flex-wrap items-center gap-3">
               {notice && <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}

               <button
                  onClick={refreshNotes}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-5
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <RotateCcw size={16} />
                  Refresh
               </button>

               <button
                  onClick={toggleVault}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     bg-[var(--color-primary)]
                     px-5
                     py-3
                     text-sm
                     font-medium
                     text-[var(--color-cream)]
                     transition-opacity
                     hover:opacity-90
                  "
               >
                  <ChevronDown
                     size={16}
                     className={`
                        transition-transform
                        duration-200

                        ${vaultOpen ? "rotate-180" : ""}
                     `}
                  />

                  {vaultOpen ? "Hide Notes" : "Show Notes"}
               </button>
            </div>
         </div>

         {/* Collapsed Summary */}

         {!vaultOpen && (
            <div className="mt-6 rounded-3xl bg-[var(--color-bg)] p-5">
               <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div>
                     <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Notes</p>

                     <p className="mt-2 text-2xl font-medium">{notes.length}</p>
                  </div>

                  <div>
                     <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Latest</p>

                     <p className="mt-2 line-clamp-1 text-sm font-medium">{latestNote ? latestNote.noteTitle : "No notes saved yet"}</p>

                     {latestNote && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{getTimeLabel(latestNote.savedAt)}</p>}
                  </div>

                  <div>
                     <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">View</p>

                     <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Open the vault only when you want to search, inspect, or remove saved notes.</p>
                  </div>
               </div>
            </div>
         )}

         {/* Expanded Vault */}

         <AnimatePresence initial={false}>
            {vaultOpen && (
               <motion.div
                  initial={{
                     opacity: 0,
                     height: 0,
                  }}
                  animate={{
                     opacity: 1,
                     height: "auto",
                  }}
                  exit={{
                     opacity: 0,
                     height: 0,
                  }}
                  transition={{
                     duration: 0.25,
                  }}
                  className="overflow-hidden"
               >
                  <div className="mt-6">
                     {/* Metrics */}

                     <div className="mb-6 grid grid-cols-3 gap-4">
                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Notes</p>

                           <p className="mt-2 text-xl font-medium">{notes.length}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Visible</p>

                           <p className="mt-2 text-xl font-medium">{filteredNotes.length}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Open</p>

                           <p className="mt-2 text-xl font-medium">{expandedNoteIds.length}</p>
                        </div>
                     </div>

                     {/* Search / Clear */}

                     <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto]">
                        <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-4">
                           <div className="flex items-center gap-3">
                              <Search size={18} />

                              <input
                                 value={query}
                                 onChange={(event) => setQuery(event.target.value)}
                                 placeholder="Search saved ALLEVIN notes..."
                                 className="
                                    w-full
                                    bg-transparent
                                    text-sm
                                    outline-none
                                    placeholder:text-[var(--color-text-secondary)]
                                 "
                              />
                           </div>
                        </div>

                        <button
                           onClick={clearNotes}
                           className="
                              flex
                              items-center
                              justify-center
                              gap-2
                              rounded-2xl
                              border
                              border-[var(--border-subtle)]
                              bg-white
                              px-5
                              py-3
                              text-sm
                              font-medium
                              transition-colors
                              hover:bg-[var(--color-bg)]
                           "
                        >
                           <Trash2 size={16} />
                           Clear
                        </button>
                     </div>

                     {/* Notes */}

                     <div className="space-y-4">
                        <AnimatePresence>
                           {filteredNotes.map((note) => {
                              const isExpanded = expandedNoteIds.includes(note.noteId);

                              return (
                                 <motion.div
                                    key={note.noteId}
                                    layout
                                    initial={{
                                       opacity: 0,
                                       y: 8,
                                    }}
                                    animate={{
                                       opacity: 1,
                                       y: 0,
                                    }}
                                    exit={{
                                       opacity: 0,
                                       scale: 0.96,
                                    }}
                                    className="
                                       rounded-3xl
                                       border
                                       border-[var(--border-subtle)]
                                       bg-white
                                       p-5
                                    "
                                 >
                                    <div className="flex items-start justify-between gap-4">
                                       <button
                                          type="button"
                                          onClick={() => toggleNote(note.noteId)}
                                          className="
                                             flex
                                             flex-1
                                             items-start
                                             gap-3
                                             text-left
                                          "
                                       >
                                          <div className="rounded-2xl bg-[var(--color-bg)] p-3">
                                             <FileText size={18} />
                                          </div>

                                          <div>
                                             <div className="mb-2 flex flex-wrap items-center gap-2">
                                                <span className="rounded-xl bg-[var(--color-bg)] px-3 py-1 text-xs font-medium">Internal Note</span>

                                                <span className="rounded-xl bg-[var(--color-bg)] px-3 py-1 text-xs font-medium">Project Memory</span>
                                             </div>

                                             <p className="text-xl font-medium">{note.noteTitle}</p>

                                             <div className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                                                <Clock3 size={14} />

                                                <span>{getTimeLabel(note.savedAt)}</span>
                                             </div>
                                          </div>
                                       </button>

                                       <div className="flex items-center gap-2">
                                          <button
                                             type="button"
                                             onClick={() => toggleNote(note.noteId)}
                                             className="
                                                flex
                                                h-10
                                                w-10
                                                items-center
                                                justify-center
                                                rounded-xl
                                                bg-[var(--color-bg)]
                                                transition-transform
                                             "
                                          >
                                             <ChevronDown
                                                size={18}
                                                className={`
                                                   transition-transform
                                                   duration-200

                                                   ${isExpanded ? "rotate-180" : ""}
                                                `}
                                             />
                                          </button>

                                          <button
                                             onClick={() => deleteNote(note.noteId)}
                                             className="
                                                rounded-xl
                                                bg-[var(--color-bg)]
                                                px-3
                                                py-2
                                                text-sm
                                                transition-colors
                                                hover:bg-white
                                             "
                                          >
                                             Remove
                                          </button>
                                       </div>
                                    </div>

                                    <AnimatePresence>
                                       {isExpanded && (
                                          <motion.div
                                             initial={{
                                                opacity: 0,
                                                height: 0,
                                             }}
                                             animate={{
                                                opacity: 1,
                                                height: "auto",
                                             }}
                                             exit={{
                                                opacity: 0,
                                                height: 0,
                                             }}
                                             transition={{
                                                duration: 0.2,
                                             }}
                                             className="overflow-hidden"
                                          >
                                             <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4">
                                                <p className="mb-2 text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Note Body</p>

                                                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--color-text-secondary)]">{note.noteBody}</pre>
                                             </div>

                                             {(note.workflowId || note.originBoardItemId) && (
                                                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                   {note.workflowId && (
                                                      <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                                         <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Thread ID</p>

                                                         <p className="mt-2 break-all text-xs text-[var(--color-text-secondary)]">{note.workflowId}</p>
                                                      </div>
                                                   )}

                                                   {note.originBoardItemId && (
                                                      <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                                         <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Board ID</p>

                                                         <p className="mt-2 break-all text-xs text-[var(--color-text-secondary)]">{note.originBoardItemId}</p>
                                                      </div>
                                                   )}
                                                </div>
                                             )}
                                          </motion.div>
                                       )}
                                    </AnimatePresence>
                                 </motion.div>
                              );
                           })}
                        </AnimatePresence>

                        {filteredNotes.length === 0 && <div className="rounded-2xl bg-[var(--color-bg)] p-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">No internal notes found. Save a note from Projects to populate the vault.</div>}
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
      </motion.section>
   );
}
