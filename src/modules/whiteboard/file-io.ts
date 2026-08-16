import { getString } from "../../utils/locale";
import { parseBoardDocument, type BoardDocument } from "./snapshot";

const BOARD_FILTER: [string, string] = ["Research Board (*.board)", "*.board"];

export function serializeBoardDocument(doc: BoardDocument): string {
  return `${JSON.stringify(parseBoardDocument(doc), null, 2)}\n`;
}

export function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

export function ensureBoardExtension(path: string): string {
  return /\.(board|zmdboard|json)$/i.test(path) ? path : `${path}.board`;
}

export async function pickBoardFile(
  mode: "open" | "save",
  win?: Window,
  suggestion = "whiteboard.board",
): Promise<string | null> {
  const title = getString(
    mode === "open" ? "whiteboard-open" : "whiteboard-save",
  );
  const picked = await new ztoolkit.FilePicker(
    title,
    mode,
    [BOARD_FILTER],
    mode === "save" ? suggestion : undefined,
    win,
  ).open();
  return picked || null;
}

export async function readBoardFile(path: string): Promise<BoardDocument> {
  const text = (await Zotero.File.getContentsAsync(path)) as string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid board file");
  }
  return parseBoardDocument(parsed);
}

export async function writeBoardFile(
  path: string,
  doc: BoardDocument,
): Promise<string> {
  const target = ensureBoardExtension(path);
  await Zotero.File.putContentsAsync(target, serializeBoardDocument(doc));
  return target;
}
