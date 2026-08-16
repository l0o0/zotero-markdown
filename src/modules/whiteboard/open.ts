import { PatchHelper } from "zotero-plugin-toolkit";
import { isWhiteboardAttachment } from "./detect";
import { openWhiteboardTab } from "./tab";

let fileHandlerPatch: PatchHelper | null = null;

const RECENT_PREF = "extensions.zotero.zoteromarkdown.recentWhiteboards";

export function recentWhiteboardIDs(): number[] {
  try {
    const raw = Zotero.Prefs.get(RECENT_PREF, true) as string | undefined;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

export function rememberWhiteboard(itemID: number) {
  const ids = recentWhiteboardIDs().filter((id) => id !== itemID);
  ids.unshift(itemID);
  Zotero.Prefs.set(RECENT_PREF, JSON.stringify(ids.slice(0, 8)), true);
}

export async function openWhiteboardAttachment(
  item: Zotero.Item,
): Promise<boolean> {
  if (!isWhiteboardAttachment(item)) return false;
  const tabID = await openWhiteboardTab(item);
  if (tabID) rememberWhiteboard(item.id);
  return !!tabID;
}

export function registerWhiteboardFileOpenInterceptor() {
  if (fileHandlerPatch) return;
  fileHandlerPatch = new PatchHelper();
  fileHandlerPatch.setData({
    target: Zotero.FileHandlers,
    funcSign: "open",
    enabled: true,
    patcher: (original) => {
      return async function patchedOpen(
        this: typeof Zotero.FileHandlers,
        item: Zotero.Item,
        params?: unknown,
      ) {
        try {
          if (isWhiteboardAttachment(item)) {
            const ok = await openWhiteboardAttachment(item);
            if (ok) return true;
          }
        } catch (error) {
          ztoolkit.log(
            "Whiteboard open interceptor failed, falling back",
            error,
          );
        }
        return original.apply(this, [item, params] as never);
      } as typeof Zotero.FileHandlers.open;
    },
  });
  fileHandlerPatch.enable();
}

export function unregisterWhiteboardFileOpenInterceptor() {
  fileHandlerPatch?.disable();
  fileHandlerPatch = null;
}
