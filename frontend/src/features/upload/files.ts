/* Where the files come from: the two pickers and the drop target.
   All three produce the same thing — a file plus the folder path it arrived
   under — so a dropped folder groups into a book exactly like a picked one. */

export interface SelectedFile {
  file: File;
  /** "Book/ch1.mp3" for anything inside a folder; "" for a loose file. */
  path: string;
}

/** The file picker's own answer: the folder picker fills in webkitRelativePath. */
export const fromInput = (files: FileList | null): SelectedFile[] =>
  [...(files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || "" }));

const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
  entry.isDirectory;

const readFile = (entry: FileSystemFileEntry): Promise<File | null> =>
  new Promise((resolve) => entry.file(resolve, () => resolve(null)));

/* A directory reader hands back its children in batches and signals the end
   with an empty one — a single call can silently truncate a long book. */
const readBatch = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));

/** Everything dropped, with dropped folders walked to their leaves. */
export async function fromDataTransfer(dt: DataTransfer): Promise<SelectedFile[]> {
  const entries = [...(dt.items ?? [])]
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry != null);

  // Some sources hand over files without entries; those are loose files.
  if (entries.length === 0) return [...(dt.files ?? [])].map((file) => ({ file, path: "" }));

  const out: SelectedFile[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (isDirectory(entry)) {
      const reader = entry.createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await readBatch(reader);
        for (const child of batch) await walk(child);
      } while (batch.length > 0);
      return;
    }
    const file = await readFile(entry as FileSystemFileEntry);
    // fullPath is "/Book/ch1.mp3" — the same shape webkitRelativePath gives.
    if (file) out.push({ file, path: (entry.fullPath || "").replace(/^\//, "") });
  };
  for (const entry of entries) await walk(entry);
  return out;
}
