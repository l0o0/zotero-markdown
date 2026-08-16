import { PatchHelper } from "zotero-plugin-toolkit";
import { isWhiteboardAttachment } from "./detect";
import { openWhiteboardTab } from "./tab";

let fileHandlerPatch: PatchHelper | null = null;

export async function openWhiteboardAttachment(
  item: Zotero.Item,
): Promise<boolean> {
  if (!isWhiteboardAttachment(item)) return false;
  const tabID = await openWhiteboardTab(item);
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
