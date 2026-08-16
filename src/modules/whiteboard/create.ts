import { emptyBoard } from "./snapshot";
import { serializeBoardDocument } from "./file-io";
import { defaultBoardFilename } from "./detect";

export async function createWhiteboardAttachment(
  parentItem?: Zotero.Item | null,
): Promise<Zotero.Item | null> {
  let parent: Zotero.Item | undefined;
  if (parentItem) {
    if (
      parentItem.isAttachment() ||
      parentItem.isNote() ||
      parentItem.isAnnotation()
    ) {
      parent = parentItem.parentItem || undefined;
    } else if (parentItem.isRegularItem()) {
      parent = parentItem;
    }
  }

  const titleBase = parent
    ? parent.getField("title") || parent.getDisplayTitle()
    : "Whiteboard";
  const filename = defaultBoardFilename(String(titleBase));
  const content = serializeBoardDocument(emptyBoard());

  const tmpDir = Zotero.getTempDirectory().path;
  const tmpPath = PathUtils.join(
    tmpDir,
    `zotero-whiteboard-${Date.now()}-${filename}`,
  );
  await Zotero.File.putContentsAsync(tmpPath, content);

  try {
    const pane = Zotero.getActiveZoteroPane();
    const selectedLibraryIDs = pane?.getSelectedLibraryIDs?.();
    const libraryID =
      parent?.libraryID ??
      (selectedLibraryIDs?.[0] as number | undefined) ??
      Zotero.Libraries.userLibraryID;
    const selectedCollections = pane?.getSelectedCollections?.(true);
    const collection = !parent
      ? (selectedCollections?.[0] as number | undefined)
      : undefined;
    const collections =
      typeof collection === "number" && collection > 0
        ? [collection]
        : undefined;

    const attachment = await Zotero.Attachments.importFromFile({
      file: tmpPath,
      parentItemID: parent?.id,
      libraryID: parent ? undefined : libraryID,
      collections,
      title: filename,
      contentType: "application/json",
      charset: "utf-8",
    });

    if (!attachment?.id) {
      throw new Error("importFromFile returned no attachment item");
    }
    if (attachment.attachmentContentType !== "application/json") {
      attachment.attachmentContentType = "application/json";
      await attachment.saveTx({ skipSelect: true });
    }

    try {
      if (pane?.selectItem) await pane.selectItem(attachment.id);
    } catch (error) {
      ztoolkit.log("selectItem after create whiteboard failed", error);
    }

    return attachment;
  } catch (error) {
    ztoolkit.log("createWhiteboardAttachment failed", error);
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: `Create failed: ${error instanceof Error ? error.message : String(error)}`,
        type: "fail",
      })
      .show();
    return null;
  } finally {
    try {
      if (await IOUtils.exists(tmpPath)) await IOUtils.remove(tmpPath);
    } catch {
      // ignore
    }
  }
}

export async function createWhiteboardForSelection(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const selected = pane?.getSelectedItems?.() || [];
  let parent: Zotero.Item | null = null;
  for (const item of selected) {
    if (item.isRegularItem()) {
      parent = item;
      break;
    }
    if (item.isAttachment() || item.isNote()) {
      parent = item.parentItem || null;
      if (parent) break;
    }
  }
  const attachment = await createWhiteboardAttachment(parent);
  if (attachment) {
    const { openWhiteboardAttachment } = await import("./open");
    await openWhiteboardAttachment(attachment);
  }
}
