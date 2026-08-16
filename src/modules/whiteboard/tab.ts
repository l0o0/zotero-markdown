import { resolveEditorTheme } from "../markdown/editor";
import { getString } from "../../utils/locale";
import { ensureDOMGlobals } from "../../utils/dom";
import { createWhiteboardEditor } from "./editor";
import { writeBoardFile } from "./file-io";
import { parseBoardDocument } from "./snapshot";
import { whiteboardChannel } from "./protocol";
import { whiteboardRegistry, type WhiteboardSession } from "./session-registry";
import { WHITEBOARD_TAB_TYPE } from "./tabHooks";
import { isWhiteboardAttachment } from "./detect";

const AUTOSAVE_MS = 800;

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

function attachmentTitle(item: Zotero.Item) {
  return (
    item.attachmentFilename ||
    item.getField("title") ||
    getString("whiteboard-tab-title")
  );
}

function refreshTabTitle(session: WhiteboardSession) {
  const dirty = isDirty(session) ? " *" : "";
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

function pickZoteroItem(
  win: Window,
  opts: { onlyRegularItems?: boolean } = {},
): number[] | null {
  const Services = ztoolkit.getGlobal("Services") as {
    ww: {
      openWindow: (
        parent: Window | null,
        url: string,
        name: string,
        features: string,
        args: unknown,
      ) => void;
    };
  };
  const io: {
    dataOut?: number[] | null;
    singleSelection: boolean;
    onlyRegularItems?: boolean;
    multiSelect: boolean;
  } = {
    dataOut: null,
    singleSelection: true,
    onlyRegularItems: opts.onlyRegularItems,
    multiSelect: false,
  };
  Services.ww.openWindow(
    null,
    "chrome://zotero/content/selectItemsDialog.xhtml",
    "",
    "chrome,modal,centerscreen,resizable=yes",
    io,
  );
  return io.dataOut?.length ? io.dataOut : null;
}

function promptPageNumber(win: Window): number | null {
  const Services = ztoolkit.getGlobal("Services") as {
    prompt: {
      prompt: (
        parent: Window,
        title: string,
        text: string,
        value: { value: string },
        checkMsg: string | null,
        checkState: { value: boolean },
      ) => boolean;
    };
  };
  const value = { value: "1" };
  const ok = Services.prompt.prompt(
    win,
    getString("whiteboard-pdf-page-title"),
    getString("whiteboard-pdf-page-prompt"),
    value,
    null,
    { value: false },
  );
  if (!ok) return null;
  const page = Number.parseInt(value.value, 10);
  return Number.isFinite(page) && page > 0 ? page : null;
}

function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1] || "image/png";
  const payload = match[3];
  let bytes: Uint8Array;
  if (match[2]) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }
  return { bytes, mimeType };
}

async function renderPdfPageToDataUrl(
  attachment: Zotero.Item,
  pageIndex: number,
): Promise<string | null> {
  const worker = (Zotero as any).PDFWorker;
  if (!worker?.getPageImage) return null;
  const result = await worker.getPageImage(attachment, pageIndex, 1.5);
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    if (typeof result.dataURL === "string") return result.dataURL;
    if (typeof result.dataUrl === "string") return result.dataUrl;
    if (typeof result.image === "string") return result.image;
    if (typeof result.data === "string") return result.data;
  }
  return null;
}

function boardStorageDir(session: WhiteboardSession): string {
  try {
    const item = Zotero.Items.get(session.itemID);
    if (item) {
      const dir = Zotero.Attachments.getStorageDirectory(item);
      if (dir?.path) return dir.path;
    }
  } catch {
    // ignore
  }
  return PathUtils.parent(session.path) ?? session.path;
}

async function saveBoardAsset(
  session: WhiteboardSession,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ relativePath: string }> {
  const root = boardStorageDir(session);
  const assetsDir = PathUtils.join(root, "assets");
  await IOUtils.makeDirectory(assetsDir, { ignoreExisting: true });
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  const filename = `page-${Date.now()}-${Math.random().toString(16).slice(2, 6)}.${extension}`;
  const relativePath = `assets/${filename}`;
  await IOUtils.write(PathUtils.join(assetsDir, filename), bytes);
  return { relativePath };
}

function creatorsText(item: Zotero.Item): string {
  const creators = item.getCreators?.() || [];
  return creators
    .map((creator: any) =>
      creator.lastName
        ? `${creator.firstName ? creator.firstName + " " : ""}${creator.lastName}`
        : creator.name || "",
    )
    .filter(Boolean)
    .join(", ");
}

function notePreview(item: Zotero.Item): string {
  try {
    const html = (item as any).getNote?.();
    if (typeof html === "string") {
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, 220);
    }
  } catch {
    // ignore
  }
  return "";
}

async function handlePickItem(
  session: WhiteboardSession,
  requestId: string,
  nodeId: string,
  kind: "item" | "pdf" | "note" | "attachment",
) {
  const editor = session.editor;
  if (!editor) return;
  try {
    const itemIDs = pickZoteroItem(session.win, {
      onlyRegularItems: kind === "item",
    });
    if (!itemIDs) return;
    const item = Zotero.Items.get(itemIDs[0]);
    if (!item) throw new Error("Item not found");

    if (kind === "item") {
      if (!item.isRegularItem())
        throw new Error("Selected item is not a regular item");
      const date = item.getField?.("date");
      editor.resolvePick(requestId, nodeId, {
        kind: "item",
        title:
          (item as any).getDisplayTitle?.() ||
          item.getField?.("title") ||
          "Untitled",
        subtitle: [creatorsText(item), date].filter(Boolean).join(" · "),
        itemID: item.id,
      });
      return;
    }

    if (kind === "note") {
      if (!item.isNote?.()) throw new Error("Selected item is not a note");
      const preview = notePreview(item);
      editor.resolvePick(requestId, nodeId, {
        kind: "note",
        title: item.getField?.("title") || "Note",
        preview: preview || "Empty note",
        noteID: item.id,
      });
      return;
    }

    if (kind === "attachment") {
      if (!item.isAttachment())
        throw new Error("Selected item is not an attachment");
      const filename =
        item.attachmentFilename || item.getField?.("title") || "Attachment";
      const size = (item as any).attachmentSize;
      editor.resolvePick(requestId, nodeId, {
        kind: "attachment",
        title: filename,
        subtitle: size ? `${Math.ceil(size / 1024)} KB` : "File",
        attachmentID: item.id,
      });
      return;
    }

    // pdf
    if (!item.isAttachment()) {
      throw new Error("Selected item is not an attachment");
    }
    const filename = item.attachmentFilename || "";
    const isPdf =
      item.attachmentContentType === "application/pdf" ||
      /\.pdf$/i.test(filename);
    if (!isPdf) throw new Error("Selected attachment is not a PDF");

    const page = promptPageNumber(session.win);
    if (page == null) return;

    const dataUrl = await renderPdfPageToDataUrl(item, page);
    if (!dataUrl) {
      throw new Error("PDF page rendering is not available in this Zotero");
    }
    const parsed = dataUrlToBytes(dataUrl);
    if (!parsed) throw new Error("Invalid rendered image data");
    const { relativePath } = await saveBoardAsset(
      session,
      parsed.bytes,
      parsed.mimeType,
    );
    editor.resolvePick(requestId, nodeId, {
      kind: "pdf",
      title: filename || item.getField?.("title") || "PDF",
      subtitle: `p. ${page}`,
      pdfPage: page,
      attachmentID: item.id,
      image: dataUrl,
      asset: relativePath,
    });
  } catch (error) {
    editor.rejectPick(
      requestId,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function openZoteroItem(payload: {
  itemID?: number;
  attachmentID?: number;
  noteID?: number;
  pdfPage?: number;
}) {
  const pane = Zotero.getActiveZoteroPane();
  if (!pane) return;
  if (payload.noteID) {
    try {
      (pane as any).openNoteWindow?.(payload.noteID);
      return;
    } catch {
      // fall through to selectItem
    }
    pane.selectItem(payload.noteID);
    return;
  }
  if (payload.attachmentID) {
    const attachment = Zotero.Items.get(payload.attachmentID);
    if (attachment) {
      if (payload.pdfPage) {
        try {
          const reader = (Zotero as any).Reader;
          if (reader?.open) {
            void reader.open(attachment.id, { pageIndex: payload.pdfPage });
            return;
          }
        } catch {
          // fall back to the default file handler
        }
      }
      void Zotero.FileHandlers.open(attachment);
      return;
    }
    pane.selectItem(payload.attachmentID);
    return;
  }
  if (payload.itemID) {
    pane.selectItem(payload.itemID);
  }
}

function parseDroppedItemID(raw: Record<string, string>): number | null {
  for (const value of Object.values(raw)) {
    if (!value) continue;
    const direct = Number.parseInt(value, 10);
    if (Number.isFinite(direct) && direct > 0) return direct;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "number" && parsed > 0) return parsed;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const id =
            typeof entry === "number"
              ? entry
              : entry && typeof entry === "object"
                ? entry.itemID || entry.id
                : null;
          if (typeof id === "number" && id > 0) return id;
        }
      }
      if (parsed && typeof parsed === "object") {
        const id = parsed.itemID || parsed.id;
        if (typeof id === "number" && id > 0) return id;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function handleDropItems(
  session: WhiteboardSession,
  requestId: string,
  nodeId: string,
  raw: Record<string, string>,
) {
  const editor = session.editor;
  if (!editor) return;
  try {
    const itemID = parseDroppedItemID(raw);
    if (!itemID) throw new Error("Could not parse dropped item");
    const item = Zotero.Items.get(itemID);
    if (!item) throw new Error("Dropped item not found");

    if (item.isRegularItem()) {
      const date = item.getField?.("date");
      editor.resolvePick(requestId, nodeId, {
        kind: "item",
        title:
          (item as any).getDisplayTitle?.() ||
          item.getField?.("title") ||
          "Untitled",
        subtitle: [creatorsText(item), date].filter(Boolean).join(" · "),
        itemID: item.id,
      });
      return;
    }
    if (item.isNote?.()) {
      editor.resolvePick(requestId, nodeId, {
        kind: "note",
        title: item.getField?.("title") || "Note",
        preview: notePreview(item) || "Empty note",
        noteID: item.id,
      });
      return;
    }
    if (item.isAttachment()) {
      const filename =
        item.attachmentFilename || item.getField?.("title") || "Attachment";
      const isPdf =
        item.attachmentContentType === "application/pdf" ||
        /\.pdf$/i.test(filename);
      if (isPdf) {
        const dataUrl = await renderPdfPageToDataUrl(item, 1);
        if (!dataUrl) throw new Error("PDF page rendering is not available");
        const parsed = dataUrlToBytes(dataUrl);
        if (!parsed) throw new Error("Invalid rendered image data");
        const { relativePath } = await saveBoardAsset(
          session,
          parsed.bytes,
          parsed.mimeType,
        );
        editor.resolvePick(requestId, nodeId, {
          kind: "pdf",
          title: filename,
          subtitle: "p. 1",
          pdfPage: 1,
          attachmentID: item.id,
          image: dataUrl,
          asset: relativePath,
        });
        return;
      }
      editor.resolvePick(requestId, nodeId, {
        kind: "attachment",
        title: filename,
        subtitle: "File",
        attachmentID: item.id,
      });
      return;
    }
    throw new Error("Unsupported dropped item type");
  } catch (error) {
    editor.rejectPick(
      requestId,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function handleExportFile(
  session: WhiteboardSession,
  payload: {
    requestId: string;
    format: "png" | "svg" | "md";
    mimeType: string;
    dataUrl?: string;
    text?: string;
  },
) {
  try {
    const extension =
      payload.format === "png"
        ? "png"
        : payload.format === "svg"
          ? "svg"
          : "md";
    const picked = await new ztoolkit.FilePicker(
      getString("whiteboard-export-title"),
      "save",
      [[`${payload.format.toUpperCase()} (*.${extension})`, `*.${extension}`]],
      `whiteboard.${extension}`,
      session.win,
    ).open();
    if (!picked) return;
    if (payload.dataUrl) {
      const parsed = dataUrlToBytes(payload.dataUrl);
      if (!parsed) throw new Error("Invalid image data");
      await IOUtils.write(picked, parsed.bytes);
    } else if (payload.text != null) {
      await Zotero.File.putContentsAsync(picked, payload.text);
    } else {
      throw new Error("Nothing to export");
    }
    toast(getString("whiteboard-exported"), "success");
  } catch (error) {
    toast(
      `${getString("whiteboard-export-failed")}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function scheduleAutosave(session: WhiteboardSession) {
  if (session.autosaveTimer) {
    session.win.clearTimeout(session.autosaveTimer);
  }
  session.autosaveTimer = session.win.setTimeout(() => {
    session.autosaveTimer = undefined;
    void saveSession(session, { silent: true });
  }, AUTOSAVE_MS);
}

async function cleanupUnusedAssets(
  session: WhiteboardSession,
  doc: ReturnType<typeof parseBoardDocument>,
) {
  try {
    const root = boardStorageDir(session);
    const assetsDir = PathUtils.join(root, "assets");
    if (!(await IOUtils.exists(assetsDir))) return;
    const referenced = new Set<string>();
    for (const node of doc.nodes) {
      const asset = node.data?.asset;
      if (typeof asset === "string") {
        referenced.add(asset.split("/").pop() || asset);
      }
    }
    const children = await IOUtils.getChildren(assetsDir);
    for (const name of children) {
      if (referenced.has(name)) continue;
      const full = PathUtils.join(assetsDir, name);
      try {
        const info = await IOUtils.stat(full);
        if (info.type !== "directory") await IOUtils.remove(full);
      } catch (error) {
        ztoolkit.log("cleanup asset failed", name, error);
      }
    }
  } catch (error) {
    ztoolkit.log("cleanup unused whiteboard assets failed", error);
  }
}

async function saveSession(
  session: WhiteboardSession,
  opts: { silent?: boolean } = {},
): Promise<boolean> {
  if (!session.editor) return false;
  if (!isDirty(session) && opts.silent) return true;
  session.editor.setSaveState("saving");
  try {
    await session.editor.ready;
    const item = Zotero.Items.get(session.itemID);
    if (!item || !isWhiteboardAttachment(item)) {
      throw new Error("Board attachment is gone");
    }
    const path = (await item.getFilePathAsync()) || session.path;
    if (!path) throw new Error("Board file not found");
    const shot = await session.editor.requestSnapshot();
    const doc = parseBoardDocument(shot.snapshot);
    session.path = await writeBoardFile(path, doc);
    await cleanupUnusedAssets(session, doc);
    // Keep currentRev as-is: changes may have arrived while we were
    // awaiting the snapshot, and currentRev only moves forward via
    // onChange. savedRev tracks what is actually on disk.
    session.savedRev = shot.rev;
    session.title = attachmentTitle(item);
    refreshTabTitle(session);
    session.editor.setSaveState("saved");
    if (!opts.silent) toast(getString("whiteboard-saved"), "success");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ztoolkit.log("Failed to save whiteboard", error);
    session.editor.setSaveState("error");
    if (!opts.silent) {
      toast(`${getString("whiteboard-save-failed")}: ${message}`);
    }
    return false;
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

function mountWhiteboardUI(
  win: _ZoteroTypes.MainWindow,
  container: HTMLElement,
  session: WhiteboardSession,
  initialSnapshot: unknown,
) {
  const doc = container.ownerDocument;
  const root = doc.createElement("div");
  root.className = "zotero-whiteboard-root zotero-markdown-root";

  const host = doc.createElement("div");
  host.className = "zotero-whiteboard-host";

  root.appendChild(host);
  container.appendChild(root);

  session.view = { root, host };
  session.editor = createWhiteboardEditor(host, {
    win,
    channel: whiteboardChannel(session.tabID, session.boardId),
    snapshot: parseBoardDocument(initialSnapshot),
    labels: {
      addItem: getString("whiteboard-add-item"),
      addNote: getString("whiteboard-add-note"),
      addPdf: getString("whiteboard-add-pdf"),
      addFile: getString("whiteboard-add-file"),
      addText: getString("whiteboard-add-text"),
      addRect: getString("whiteboard-add-rect"),
      addEllipse: getString("whiteboard-add-ellipse"),
      addLine: getString("whiteboard-add-line"),
      addArrow: getString("whiteboard-add-arrow"),
      eraser: getString("whiteboard-eraser"),
      undo: getString("whiteboard-undo"),
      redo: getString("whiteboard-redo"),
      save: getString("whiteboard-save"),
      editText: getString("whiteboard-edit-text"),
      copy: getString("whiteboard-copy"),
      delete: getString("whiteboard-delete"),
      openItem: getString("whiteboard-open-item"),
      alignLeft: getString("whiteboard-align-left"),
      alignRight: getString("whiteboard-align-right"),
      alignTop: getString("whiteboard-align-top"),
      alignBottom: getString("whiteboard-align-bottom"),
      alignHorizontal: getString("whiteboard-align-horizontal"),
      alignVertical: getString("whiteboard-align-vertical"),
      distributeHorizontal: getString("whiteboard-distribute-horizontal"),
      distributeVertical: getString("whiteboard-distribute-vertical"),
      fitView: getString("whiteboard-fit-view"),
      autoLayout: getString("whiteboard-auto-layout"),
      edgeColor: getString("whiteboard-edge-color"),
      edgeDash: getString("whiteboard-edge-dash"),
      edgeArrow: getString("whiteboard-edge-arrow"),
      saved: getString("whiteboard-save-saved"),
      saving: getString("whiteboard-save-saving"),
      saveFailed: getString("whiteboard-save-failed-short"),
      exportPng: getString("whiteboard-export-png"),
      exportSvg: getString("whiteboard-export-svg"),
      exportMarkdown: getString("whiteboard-export-markdown"),
    },
    onChange(rev) {
      session.currentRev = rev;
      refreshTabTitle(session);
      scheduleAutosave(session);
    },
    onSave() {
      void saveSession(session);
    },
    onError(message) {
      toast(message);
    },
    onPickItem(requestId, nodeId, kind) {
      void handlePickItem(session, requestId, nodeId, kind);
    },
    onOpenItem(payload) {
      openZoteroItem(payload);
    },
    onDropItems(requestId, nodeId, raw) {
      void handleDropItems(session, requestId, nodeId, raw);
    },
    onExportFile(payload) {
      void handleExportFile(session, payload);
    },
  });
  bindSessionTheme(win, session);
}

export async function openWhiteboardTab(
  item: Zotero.Item,
  options: { win?: _ZoteroTypes.MainWindow } = {},
): Promise<string | null> {
  if (!isWhiteboardAttachment(item)) return null;
  const win =
    options.win ||
    (Zotero.getMainWindow() as _ZoteroTypes.MainWindow | undefined);
  if (!win) {
    ztoolkit.log("No main window for whiteboard tab");
    return null;
  }

  ensureDOMGlobals(win);

  const existing = whiteboardRegistry.findByItem(item.id);
  if (existing) {
    const existingWin = existing.win;
    const tabInfo = existingWin.Zotero_Tabs._getTab(existing.tabID);
    if (tabInfo?.tab) {
      if (existingWin !== win) {
        try {
          existingWin.focus();
        } catch {
          // ignore
        }
      }
      try {
        existingWin.Zotero_Tabs.select(existing.tabID);
      } catch {
        existingWin.Zotero_Tabs.select(existing.tabID);
      }
      existing.editor?.focus();
      return existing.tabID;
    }
    whiteboardRegistry.unregister(existing.tabID);
  }

  const path = await item.getFilePathAsync();
  if (!path) {
    toast(getString("whiteboard-open-failed"));
    return null;
  }

  let initial: unknown = {};
  try {
    const text = (await Zotero.File.getContentsAsync(path)) as string;
    if (text.trim()) {
      initial = JSON.parse(text);
    }
  } catch (error) {
    ztoolkit.log("Failed to read whiteboard file", error);
    toast(getString("whiteboard-open-failed"));
    return null;
  }

  const boardId = newBoardId();
  const title = attachmentTitle(item);
  const { id: tabID, container } = win.Zotero_Tabs.add({
    type: WHITEBOARD_TAB_TYPE,
    title,
    data: { itemID: item.id, boardId },
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
    itemID: item.id,
    win,
    path,
    title,
    currentRev: 0,
    savedRev: 0,
  };
  whiteboardRegistry.register(session);

  try {
    mountWhiteboardUI(win, host, session, initial);
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
  win.setTimeout(() => session.editor?.focus(), 50);

  return tabID;
}

export async function closeWhiteboardSession(tabID: string) {
  const session = whiteboardRegistry.get(tabID);
  if (!session || session.closing) return;
  if (session.autosaveTimer) {
    session.win.clearTimeout(session.autosaveTimer);
    session.autosaveTimer = undefined;
  }
  if (isDirty(session)) {
    const choice = promptUnsaved(session.win);
    if (choice === "save") await saveSession(session);
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
