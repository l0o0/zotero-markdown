/** .board is the current extension; .zmdboard is accepted for legacy files. */
const BOARD_EXTENSIONS = new Set(["board", "zmdboard"]);

export function isWhiteboardAttachment(
  item: Zotero.Item | false | undefined,
): item is Zotero.Item {
  if (!item || !item.isAttachment()) return false;
  if (item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
    return false;
  }
  const filename = item.attachmentFilename || "";
  const ext = getExtension(filename);
  return ext ? BOARD_EXTENSIONS.has(ext) : false;
}

export function getExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || filename;
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx + 1).toLowerCase();
}

export function defaultBoardFilename(
  title?: string,
  now: Date = new Date(),
): string {
  const raw = (title || "Whiteboard").trim() || "Whiteboard";
  const safe = Zotero.File.getValidFileName(raw).replace(
    /\.(board|zmdboard)$/i,
    "",
  );
  const timestamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    pad2(now.getHours()),
    pad2(now.getMinutes()),
  ].join("-");
  const base = (safe || "Whiteboard")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "Whiteboard"}-${timestamp}.board`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
