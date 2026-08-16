# Research Board Tab for Zotero Markdown

| Field  | Value                                      |
| ------ | ------------------------------------------ |
| Status | Draft                                      |
| Date   | 2026-08-15                                 |
| Author | Zotero Markdown                            |
| Scope  | v1 card canvas, no Zotero item association |

## Overview

A standalone research board opens as a Zotero tab. The canvas is **`@xyflow/react` (MIT)** inside `chrome://zoteromarkdown/content/whiteboard/`. v1 does not bind Zotero items. Persistence is a user-chosen `.board` JSON file (legacy `.zmdboard` files still open).

tldraw was evaluated and **rejected**: its production license needs a key for every downstream user and is not open source.

## Goals

- Tools menu “New Whiteboard” / “新建白板…”, no selected item required.
- Card nodes: item, note, pdf, attachment; shape nodes: text, rect, ellipse, line, arrow; eraser tool.
- Adding an item card opens Zotero’s item-select dialog and fills title/creators/date.
- Adding a PDF card opens the item-select dialog, prompts for a page, renders the page snapshot, and stores it under the board’s `assets/` directory.
- Pan, zoom, select, connect, add cards, undo/redo, save (toolbar icons + keyboard).
- Light/dark follows Zotero/OS.
- New board creates a standalone `.board` JSON attachment (same `importFromFile` path as Markdown notes). Save writes that attachment. Double-click / item menu opens it.
- Chrome and add-card labels are localized.

## Non-Goals (v1)

- Binding note/attachment cards to real Zotero notes or attachment metadata.
- Storing the board as a library attachment.
- Freehand ink, tldraw, Excalidraw, or multiplayer.

## Architecture

```
Tools menu
  → openWhiteboardTab()
  → Zotero_Tabs type = "whiteboard"
  → chrome: title · Open · Save
  → iframe chrome://…/whiteboard/
       → React Flow + academic card nodeTypes
```

Document shape (`src/modules/whiteboard/snapshot.ts`):

```json
{
  "v": 1,
  "engine": "xyflow",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "n1",
      "type": "item",
      "position": { "x": 0, "y": 0 },
      "data": { "kind": "item", "title": "…" }
    }
  ],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2" }]
}
```

Later Zotero IDs live only in `data` (`itemID`, `noteID`, `attachmentID`, `pdfPage`).

## Key Decisions

1. **`@xyflow/react`, not tldraw** — MIT, custom nodes are React components (needed for academic cards).
2. **Separate chrome:// iframe** — same split as the Markdown editor; React stays out of CodeMirror.
3. **No item association in v1** — sessions keyed by `tabID` + `boardId`.
4. **User-chosen `.board` file** — no library schema.
5. **Tab type `whiteboard`** — Zotero splits tab types on `-`.

## Remaining after v1

- Drag items/notes/attachments from the library onto the board.
- Render a real PDF page in the `pdf` card.
- Double-click a card to open the Zotero item.
- Optional: save the board as a Zotero attachment.
