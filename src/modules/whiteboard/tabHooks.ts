import { WHITEBOARD_MESSAGE_SOURCE } from "./protocol";
import { whiteboardRegistry } from "./session-registry";

/**
 * Zotero parses tab types as `${contentType}-${state}` (split on `-`).
 * Use a single token, same rule as MARKDOWN_TAB_TYPE = "markdown".
 */
export const WHITEBOARD_TAB_TYPE = "whiteboard";

export function registerWhiteboardTabHooks(win: _ZoteroTypes.MainWindow) {
  const tabs = win.Zotero_Tabs as any;
  if (!tabs?.tabHooks) return;

  tabs.tabHooks.getTitle ??= {};
  tabs.tabHooks.refocus ??= {};
  tabs.tabHooks.focusFirst ??= {};

  tabs.tabHooks.getTitle[WHITEBOARD_TAB_TYPE] = async (tab: {
    id?: string;
    data?: { boardId?: string };
  }) => {
    const session = tab.id ? whiteboardRegistry.get(tab.id) : undefined;
    if (!session) return "Whiteboard";
    const dirty = session.currentRev !== session.savedRev ? " *" : "";
    return `${session.title}${dirty}`;
  };

  tabs.tabHooks.refocus[WHITEBOARD_TAB_TYPE] = async (tab: {
    id: string;
    data?: { boardId?: string };
  }) => {
    const host = win.document
      .getElementById(tab.id)
      ?.querySelector(".zotero-whiteboard-host") as HTMLElement | null;
    const iframe = host?.querySelector(
      "iframe.zmd-whiteboard-iframe",
    ) as HTMLIFrameElement | null;
    if (!iframe) return;
    try {
      iframe.focus();
      iframe.contentWindow?.postMessage(
        {
          source: WHITEBOARD_MESSAGE_SOURCE,
          channel: `${tab.id}:${tab.data?.boardId ?? ""}`,
          type: "focus",
        },
        "*",
      );
    } catch {
      // ignore
    }
  };

  tabs.tabHooks.focusFirst[WHITEBOARD_TAB_TYPE] =
    tabs.tabHooks.refocus[WHITEBOARD_TAB_TYPE];
}
