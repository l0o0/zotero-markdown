import { getString } from "../../utils/locale";
import {
  createWhiteboardAttachment,
  createWhiteboardFromCollection,
} from "./create";
import { isWhiteboardAttachment } from "./detect";
import { openWhiteboardAttachment, recentWhiteboardIDs } from "./open";

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

    const fromCollection = doc.createXULElement("menuitem") as HTMLElement;
    fromCollection.id = `${addon.data.config.addonRef}-tools-whiteboard-collection`;
    fromCollection.setAttribute(
      "label",
      getString("menuitem-new-whiteboard-from-collection"),
    );
    fromCollection.setAttribute("class", "menuitem-iconic");
    fromCollection.style.listStyleImage = `url(${icon()})`;
    fromCollection.addEventListener("command", () => {
      void createWhiteboardFromCollection();
    });
    tools.appendChild(fromCollection);
    cleanups.push(() => fromCollection.remove());

    const recentMenu = doc.createXULElement("menu") as HTMLElement;
    recentMenu.id = `${addon.data.config.addonRef}-tools-whiteboard-recent`;
    recentMenu.setAttribute("label", getString("menuitem-recent-whiteboards"));
    recentMenu.setAttribute("class", "menuitem-iconic");
    recentMenu.style.listStyleImage = `url(${icon()})`;
    const recentPopup = doc.createXULElement("menupopup") as HTMLElement;
    recentMenu.appendChild(recentPopup);
    const refreshRecent = () => {
      while (recentPopup.firstChild) {
        (recentPopup.firstChild as HTMLElement).remove();
      }
      const ids = recentWhiteboardIDs();
      for (const id of ids) {
        const item = Zotero.Items.get(id);
        if (!item || !isWhiteboardAttachment(item)) continue;
        const recentItem = doc.createXULElement("menuitem") as HTMLElement;
        recentItem.setAttribute(
          "label",
          item.attachmentFilename || item.getField("title") || "Whiteboard",
        );
        recentItem.setAttribute("class", "menuitem-iconic");
        recentItem.style.listStyleImage = `url(${icon()})`;
        recentItem.addEventListener("command", () => {
          void openWhiteboardAttachment(item);
        });
        recentPopup.appendChild(recentItem);
      }
      if (!recentPopup.firstChild) {
        const empty = doc.createXULElement("menuitem") as HTMLElement;
        empty.setAttribute(
          "label",
          getString("menuitem-recent-whiteboards-empty"),
        );
        empty.setAttribute("disabled", "true");
        recentPopup.appendChild(empty);
      }
    };
    recentPopup.addEventListener("popupshowing", refreshRecent);
    tools.appendChild(recentMenu);
    cleanups.push(() => recentMenu.remove());
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
