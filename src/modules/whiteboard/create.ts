import { emptyBoard, type BoardDocument } from "./snapshot";
import { serializeBoardDocument } from "./file-io";
import { defaultBoardFilename } from "./detect";

function notePreview(item: Zotero.Item): string {
  try {
    const html = (item as any).getNote?.();
    if (typeof html === "string") {
      return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
    }
  } catch {
    // ignore
  }
  return "";
}

export async function createWhiteboardAttachment(
  parentItem?: Zotero.Item | null,
  options: { doc?: BoardDocument } = {},
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
  const content = serializeBoardDocument(options.doc ?? emptyBoard());

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

function buildCollectionBoard(collection: Zotero.Collection): BoardDocument {
  const doc = emptyBoard();
  const items = collection.getChildItems();
  let y = 80;
  let seq = 0;
  for (const item of items) {
    if (!item.isRegularItem() || item.parentItem) continue;
    if (seq >= 50) break;
    const itemId = `col-item-${seq}`;
    const date = item.getField?.("date");
    doc.nodes.push({
      id: itemId,
      type: "item",
      position: { x: 80, y },
      data: {
        kind: "item",
        title:
          (item as any).getDisplayTitle?.() ||
          item.getField?.("title") ||
          "Untitled",
        subtitle: [creatorsText(item), date].filter(Boolean).join(" · "),
        itemID: item.id,
      },
    });

    const pdf = item
      .getAttachments()
      .map((id) => Zotero.Items.get(id))
      .find(
        (child): child is Zotero.Item =>
          !!child &&
          child.isAttachment() &&
          (child.attachmentContentType === "application/pdf" ||
            /\.pdf$/i.test(child.attachmentFilename || "")),
      );
    if (pdf) {
      const pdfId = `${itemId}-pdf`;
      doc.nodes.push({
        id: pdfId,
        type: "pdf",
        position: { x: 360, y },
        data: {
          kind: "pdf",
          title: pdf.attachmentFilename || "PDF",
          subtitle: "PDF",
          attachmentID: pdf.id,
        },
      });
      doc.edges.push({ id: `${itemId}-e-pdf`, source: itemId, target: pdfId });
    }

    const note = item
      .getNotes()
      .map((id) => Zotero.Items.get(id))
      .find((child): child is Zotero.Item => !!child && child.isNote?.());
    if (note) {
      const noteId = `${itemId}-note`;
      doc.nodes.push({
        id: noteId,
        type: "note",
        position: { x: 80, y: y + 180 },
        data: {
          kind: "note",
          title: note.getField?.("title") || "Note",
          preview: notePreview(note) || "Empty note",
          noteID: note.id,
        },
      });
      doc.edges.push({
        id: `${itemId}-e-note`,
        source: itemId,
        target: noteId,
      });
    }

    y += 360;
    seq += 1;
  }
  return doc;
}

export async function createWhiteboardFromCollection(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const selectedCollections = pane?.getSelectedCollections?.(true);
  const collectionID = selectedCollections?.[0] as number | undefined;
  if (!collectionID) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({ text: "Select a collection first", type: "fail" })
      .show();
    return;
  }
  const collection = Zotero.Collections.get(collectionID);
  if (!collection) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({ text: "Collection not found", type: "fail" })
      .show();
    return;
  }
  const doc = buildCollectionBoard(collection);
  const attachment = await createWhiteboardAttachment(null, { doc });
  if (attachment) {
    const { openWhiteboardAttachment } = await import("./open");
    await openWhiteboardAttachment(attachment);
  }
}
