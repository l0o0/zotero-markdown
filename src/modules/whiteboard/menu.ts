import { getString } from "../../utils/locale";
import { createWhiteboardAttachment } from "./create";
import { isWhiteboardAttachment } from "./detect";
import { openWhiteboardAttachment } from "./open";

const itemCleanups = new Map<Window, () => void>();

function icon() {
  return `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;
}

async function createAndOpen(parent?: Zotero.Item | null) {
  const attachment = await createWhiteboardAttachment(parent);
  if (attachment) await openWhiteboardAttachment(attachment);
}

export function registerWhiteboardMenus(win: _ZoteroTypes.MainWindow) {
  unregisterWhiteboardMenus(win);
  const doc = win.document;
  const tools =
    (doc.querySelector("#menu_ToolsPopup") as HTMLElement | null) ||
    (doc.querySelector("#menu_toolsPopup") as HTMLElement | null);
  const itemPopup = doc.querySelector("#zotero-itemmenu") as HTMLElement | null;

  const cleanups: Array<() => void> = [];

  if (tools) {
    const item = doc.createXULElement("menuitem") as HTMLElement;
    item.id = `${addon.data.config.addonRef}-tools-whiteboard`;
    item.setAttribute("label", getString("menuitem-new-whiteboard"));
    item.setAttribute("class", "menuitem-iconic");
    item.style.listStyleImage = `url(${icon()})`;
    item.addEventListener("command", () => {
      void createAndOpen(null);
    });
    tools.appendChild(item);
    cleanups.push(() => item.remove());
  } else {
    ztoolkit.log("Tools popup missing; whiteboard tools menu not registered");
  }

  if (itemPopup) {
    const openItem = doc.createXULElement("menuitem") as HTMLElement;
    openItem.id = `${addon.data.config.addonRef}-item-open-board`;
    openItem.setAttribute("label", getString("menuitem-open-whiteboard"));
    openItem.setAttribute("class", "menuitem-iconic");
    openItem.style.listStyleImage = `url(${icon()})`;
    const onOpen = () => {
      const selected = win.ZoteroPane?.getSelectedItems?.() || [];
      const board = selected.find(isWhiteboardAttachment);
      if (board) void openWhiteboardAttachment(board);
    };
    const onShowing = () => {
      const selected = win.ZoteroPane?.getSelectedItems?.() || [];
      openItem.hidden = !(
        selected.length === 1 && isWhiteboardAttachment(selected[0])
      );
    };
    openItem.addEventListener("command", onOpen);
    itemPopup.addEventListener("popupshowing", onShowing);
    itemPopup.append(openItem);
    cleanups.push(() => {
      itemPopup.removeEventListener("popupshowing", onShowing);
      openItem.remove();
    });
  }

  itemCleanups.set(win, () => {
    for (const cleanup of cleanups) cleanup();
  });
}

export function unregisterWhiteboardMenus(win: Window) {
  itemCleanups.get(win)?.();
  itemCleanups.delete(win);
}
