import { getString } from "../../utils/locale";
import { openWhiteboardTab } from "./tab";

const itemCleanups = new Map<Window, () => void>();

function icon() {
  return `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;
}

export function registerWhiteboardMenus(win: _ZoteroTypes.MainWindow) {
  unregisterWhiteboardMenus(win);
  const doc = win.document;
  const popup =
    (doc.querySelector("#menu_ToolsPopup") as HTMLElement | null) ||
    (doc.querySelector("#menu_toolsPopup") as HTMLElement | null);
  if (!popup) {
    ztoolkit.log("Tools popup missing; whiteboard menu not registered");
    return;
  }

  const item = doc.createXULElement("menuitem") as HTMLElement;
  item.id = `${addon.data.config.addonRef}-tools-whiteboard`;
  item.setAttribute("label", getString("menuitem-new-whiteboard"));
  item.setAttribute("class", "menuitem-iconic");
  item.style.listStyleImage = `url(${icon()})`;
  item.addEventListener("command", () => {
    void openWhiteboardTab({ win });
  });
  popup.appendChild(item);

  itemCleanups.set(win, () => {
    item.remove();
  });
}

export function unregisterWhiteboardMenus(win: Window) {
  itemCleanups.get(win)?.();
  itemCleanups.delete(win);
}
