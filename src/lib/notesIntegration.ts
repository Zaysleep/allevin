// ========================================
// ALLEVIN Internal Notes Integration
// Purpose:
// Save research notes, insights, workflow reviews,
// and lightweight memory objects inside ALLEVIN.
// ========================================

const NOTES_STORAGE_KEY = "allevin-internal-notes";

export interface InternalNoteInput {
   id: string;

   title: string;

   body: string;

   summary?: string;

   workflowId?: string;

   originBoardItemId?: string;
}

export interface InternalNoteResult {
   success: boolean;

   noteId: string;

   noteTitle: string;

   noteBody: string;

   savedAt: number;

   message: string;
}

export interface InternalNoteRecord extends InternalNoteResult {
   sourceExportId: string;

   workflowId?: string;

   originBoardItemId?: string;
}

function getStoredNotes(): InternalNoteRecord[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(NOTES_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      return JSON.parse(stored) as InternalNoteRecord[];
   } catch {
      localStorage.removeItem(NOTES_STORAGE_KEY);
      return [];
   }
}

export function getInternalNotes() {
   return getStoredNotes();
}

export async function createInternalNote(input: InternalNoteInput): Promise<InternalNoteResult> {
   const safeTitle = input.title.trim() || "ALLEVIN Note";

   const safeBody = input.body.trim() || "No note body provided.";

   const noteId = `note-${crypto.randomUUID()}`;

   const savedAt = Date.now();

   const noteRecord: InternalNoteRecord = {
      success: true,

      sourceExportId: input.id,

      noteId,

      noteTitle: safeTitle,

      noteBody: safeBody,

      savedAt,

      message: "Internal ALLEVIN Note saved. This note is stored locally inside ALLEVIN.",

      workflowId: input.workflowId,

      originBoardItemId: input.originBoardItemId,
   };

   const previousNotes = getStoredNotes();

   const updatedNotes = [noteRecord, ...previousNotes].slice(0, 100);

   localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(updatedNotes));

   window.dispatchEvent(
      new CustomEvent("allevin-internal-note-saved", {
         detail: noteRecord,
      }),
   );

   return {
      success: true,

      noteId,

      noteTitle: safeTitle,

      noteBody: safeBody,

      savedAt,

      message: noteRecord.message,
   };
}
