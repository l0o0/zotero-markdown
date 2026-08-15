import { resolveEditorTheme } from "../markdown/editor";
import { getString } from "../../utils/locale";
import { ensureDOMGlobals } from "../../utils/dom";
import { createWhiteboardEditor } from "./editor";
import {
  basename,
  pickBoardFile,
  readBoardFile,
  writeBoardFile,
} from "./file-io";
import { parseBoardDocument } from "./snapshot";
import { whiteboardChannel } from "./protocol";
import {
  whiteboardRegistry,
  type WhiteboardSession,
} from "./session-registry";
import { WHITEBOARD_TAB_TYPE } from "./tabHooks";

function newBoardId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `wb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function isDirty(session: WhiteboardSession) {
  return session.currentRev !== session.savedRev;
}

function applyShellTheme(root: HTMLElement | undefined, dark: boolean) {
  if (!root) return;
  root.classList.toggle("theme-dark", dark);
  root.classList.toggle("theme-light", !dark);
}

function bindSessionTheme(
  win: _ZoteroTypes.MainWindow,
  session: WhiteboardSession,
) {
  session.unbindTheme?.();
  const sync = () => {
    const theme = resolveEditorTheme(win);
    applyShellTheme(session.view?.root, theme === "dark");
    session.editor?.setTheme(theme);
  };
  let mql: MediaQueryList | null = null;
  const onMql = () => sync();
  try {
    mql = win.matchMedia?.("(prefers-color-scheme: dark)") || null;
    mql?.addEventListener?.("change", onMql);
  } catch {
    // ignore
  }
  session.unbindTheme = () => {
    try {
      mql?.removeEventListener?.("change", onMql);
    } catch {
      // ignore
    }
  };
  sync();
}

function refreshTabTitle(session: WhiteboardSession) {
  const dirty = isDirty(session) ? " *" : "";
  if (session.view?.titleEl) {
    session.view.titleEl.textContent = `${session.title}${dirty}`;
  }
  const { tab } = session.win.Zotero_Tabs._getTab(session.tabID) || {};
  if (!tab) return;
  tab.title = `${session.title}${dirty}`;
  try {
    (session.win.Zotero_Tabs as any)._update?.();
  } catch {
    // ignore
  }
}

function toast(message: string, type: "success" | "fail" = "fail") {
  new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({ text: message, type })
    .show();
}

async function saveSession(
  session: WhiteboardSession,
  opts: { saveAs?: boolean } = {},
): Promise<boolean> {
  if (!session.editor) return false;
  try {
    await session.editor.ready;
    const shot = await session.editor.requestSnapshot();
    const doc = parseBoardDocument(shot.snapshot);
    let path: string | undefined = session.path;
    if (opts.saveAs || !path) {
      const picked = await pickBoardFile("save", session.win, session.path);
      if (!picked) return false;
      path = picked;
    }
    session.path = await writeBoardFile(path, doc);
    session.title = basename(session.path);
    session.currentRev = shot.rev;
    session.savedRev = shot.rev;
    refreshTabTitle(session);
    toast(getString("whiteboard-saved"), "success");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ztoolkit.log("Failed to save whiteboard", error);
    toast(`${getString("whiteboard-save-failed")}: ${message}`);
    return false;
  }
}

async function openBoardIntoSession(session: WhiteboardSession) {
  if (!session.editor) return;
  const path = await pickBoardFile("open", session.win, session.path);
  if (!path) return;
  try {
    const doc = await readBoardFile(path);
    session.editor.loadSnapshot(doc);
    session.path = path;
    session.title = basename(path);
    session.currentRev = 0;
    session.savedRev = 0;
    refreshTabTitle(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ztoolkit.log("Failed to open whiteboard", error);
    toast(`${getString("whiteboard-open-failed")}: ${message}`);
  }
}

function promptUnsaved(win: Window): "save" | "discard" {
  try {
    const Services = ztoolkit.getGlobal("Services") as {
      prompt: {
        BUTTON_POS_0: number;
        BUTTON_POS_1: number;
        BUTTON_TITLE_SAVE: number;
        BUTTON_TITLE_DONT_SAVE: number;
        confirmEx: (
          parent: Window,
          title: string,
          text: string,
          flags: number,
          b0: string | null,
          b1: string | null,
          b2: string | null,
          check: string | null,
          state: { value: boolean },
        ) => number;
      };
    };
    const flags =
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_SAVE +
      Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_DONT_SAVE;
    const result = Services.prompt.confirmEx(
      win,
      getString("whiteboard-unsaved-title"),
      getString("whiteboard-unsaved-prompt"),
      flags,
      null,
      null,
      null,
      null,
      { value: false },
    );
    return result === 0 ? "save" : "discard";
  } catch {
    return win.confirm(getString("whiteboard-unsaved-prompt"))
      ? "save"
      : "discard";
  }
}

function chromeButton(doc: Document, label: string, onClick: () => void) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "zotero-whiteboard-btn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function mountWhiteboardUI(
  win: _ZoteroTypes.MainWindow,
  container: HTMLElement,
  session: WhiteboardSession,
) {
  const doc = container.ownerDocument;
  const root = doc.createElement("div");
  root.className = "zotero-whiteboard-root zotero-markdown-root";

  const toolbar = doc.createElement("div");
  toolbar.className = "zotero-whiteboard-toolbar";

  const titleEl = doc.createElement("div");
  titleEl.className = "zotero-whiteboard-title";
  titleEl.textContent = session.title;

  const actions = doc.createElement("div");
  actions.className = "zotero-whiteboard-actions";
  const openBtn = chromeButton(doc, getString("whiteboard-open"), () => {
    void openBoardIntoSession(session);
  });
  const saveBtn = chromeButton(doc, getString("whiteboard-save"), () => {
    void saveSession(session);
  });
  actions.append(openBtn, saveBtn);
  toolbar.append(titleEl, actions);

  const host = doc.createElement("div");
  host.className = "zotero-whiteboard-host";

  root.append(toolbar, host);
  container.appendChild(root);

  session.view = { root, host, titleEl, openBtn, saveBtn };
  session.editor = createWhiteboardEditor(host, {
    win,
    channel: whiteboardChannel(session.tabID, session.boardId),
    labels: {
      addItem: getString("whiteboard-add-item"),
      addNote: getString("whiteboard-add-note"),
      addPdf: getString("whiteboard-add-pdf"),
      addFile: getString("whiteboard-add-file"),
    },
    onChange(rev) {
      session.currentRev = rev;
      refreshTabTitle(session);
    },
    onSave() {
      void saveSession(session);
    },
    onError(message) {
      toast(message);
    },
  });
  bindSessionTheme(win, session);
}

export async function openWhiteboardTab(
  options: { win?: _ZoteroTypes.MainWindow } = {},
): Promise<string | null> {
  const win =
    options.win ||
    (Zotero.getMainWindow() as _ZoteroTypes.MainWindow | undefined);
  if (!win) {
    ztoolkit.log("No main window for whiteboard tab");
    return null;
  }

  ensureDOMGlobals(win);
  const boardId = newBoardId();
  const title = getString("whiteboard-tab-title");

  const { id: tabID, container } = win.Zotero_Tabs.add({
    type: WHITEBOARD_TAB_TYPE,
    title,
    data: { boardId },
    select: false,
    onClose: () => {
      void closeWhiteboardSession(tabID);
    },
  });

  const host = container as unknown as HTMLElement;
  host.classList.add("zotero-whiteboard-tab-content");
  try {
    host.setAttribute("flex", "1");
  } catch {
    // ignore
  }

  const session: WhiteboardSession = {
    tabID,
    boardId,
    win,
    title,
    currentRev: 0,
    savedRev: 0,
  };
  whiteboardRegistry.register(session);

  try {
    mountWhiteboardUI(win, host, session);
  } catch (error) {
    ztoolkit.log("Failed to mount whiteboard", error);
    whiteboardRegistry.unregister(tabID);
    try {
      win.Zotero_Tabs.close(tabID);
    } catch {
      // ignore
    }
    throw error;
  }

  try {
    win.Zotero_Tabs.select(tabID);
  } catch (error) {
    ztoolkit.log("select whiteboard tab failed", error);
    refreshTabTitle(session);
    win.Zotero_Tabs.select(tabID);
  }

  return tabID;
}

export async function closeWhiteboardSession(tabID: string) {
  const session = whiteboardRegistry.get(tabID);
  if (!session || session.closing) return;
  if (isDirty(session)) {
    const choice = promptUnsaved(session.win);
    if (choice === "save") {
      await saveSession(session);
    }
  }
  session.closing = true;
  session.unbindTheme?.();
  session.editor?.destroy();
  whiteboardRegistry.unregister(tabID);
}

export async function closeWhiteboardsForWindow(win: Window) {
  await Promise.all(
    whiteboardRegistry
      .sessionsForWindow(win)
      .map((session) => closeWhiteboardSession(session.tabID)),
  );
}

export async function closeAllWhiteboards() {
  await Promise.all(
    whiteboardRegistry
      .all()
      .map((session) => closeWhiteboardSession(session.tabID)),
  );
}
