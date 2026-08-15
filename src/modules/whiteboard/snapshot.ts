/**
 * Versioned board document. Pure JSON, no Zotero types.
 * Later Zotero IDs live in node.data only (itemID, noteID, ...).
 */

export const BOARD_DOCUMENT_VERSION = 1;
export const BOARD_ENGINE = "xyflow" as const;

export type BoardNodeKind = "item" | "note" | "pdf" | "attachment";

export interface BoardNodeData {
  kind: BoardNodeKind;
  title: string;
  subtitle?: string;
  preview?: string;
  itemID?: number;
  noteID?: number;
  attachmentID?: number;
  pdfPage?: number;
  [key: string]: unknown;
}

export interface BoardNode {
  id: string;
  type: BoardNodeKind;
  position: { x: number; y: number };
  data: BoardNodeData;
  width?: number;
  height?: number;
}

export interface BoardEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardDocument {
  v: typeof BOARD_DOCUMENT_VERSION;
  engine: typeof BOARD_ENGINE;
  nodes: BoardNode[];
  edges: BoardEdge[];
  viewport?: BoardViewport;
}

export type WhiteboardSnapshot = BoardDocument;

const KINDS = new Set<BoardNodeKind>(["item", "note", "pdf", "attachment"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseNode(value: unknown): BoardNode | null {
  const node = asRecord(value);
  if (!node || typeof node.id !== "string") return null;
  const type = node.type;
  if (type !== "item" && type !== "note" && type !== "pdf" && type !== "attachment") {
    return null;
  }
  const position = asRecord(node.position);
  if (
    !position ||
    typeof position.x !== "number" ||
    typeof position.y !== "number"
  ) {
    return null;
  }
  const data = asRecord(node.data) ?? {};
  const kind = KINDS.has(data.kind as BoardNodeKind)
    ? (data.kind as BoardNodeKind)
    : type;
  return {
    id: node.id,
    type,
    position: { x: position.x, y: position.y },
    width: typeof node.width === "number" ? node.width : undefined,
    height: typeof node.height === "number" ? node.height : undefined,
    data: {
      kind,
      title: typeof data.title === "string" ? data.title : "Untitled",
      subtitle: typeof data.subtitle === "string" ? data.subtitle : undefined,
      preview: typeof data.preview === "string" ? data.preview : undefined,
      itemID: typeof data.itemID === "number" ? data.itemID : undefined,
      noteID: typeof data.noteID === "number" ? data.noteID : undefined,
      attachmentID:
        typeof data.attachmentID === "number" ? data.attachmentID : undefined,
      pdfPage: typeof data.pdfPage === "number" ? data.pdfPage : undefined,
    },
  };
}

function parseEdge(value: unknown): BoardEdge | null {
  const edge = asRecord(value);
  if (!edge || typeof edge.id !== "string") return null;
  if (typeof edge.source !== "string" || typeof edge.target !== "string") {
    return null;
  }
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle:
      typeof edge.sourceHandle === "string" ? edge.sourceHandle : null,
    targetHandle:
      typeof edge.targetHandle === "string" ? edge.targetHandle : null,
  };
}

export function emptyBoard(): BoardDocument {
  return {
    v: BOARD_DOCUMENT_VERSION,
    engine: BOARD_ENGINE,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** Sample cards so an empty v1 tab is inspectable. Not bound to library items. */
export function demoBoard(): BoardDocument {
  return {
    v: BOARD_DOCUMENT_VERSION,
    engine: BOARD_ENGINE,
    viewport: { x: 80, y: 40, zoom: 1 },
    nodes: [
      {
        id: "demo-item",
        type: "item",
        position: { x: 40, y: 80 },
        data: {
          kind: "item",
          title: "Attention Is All You Need",
          subtitle: "Vaswani et al. · 2017 · journalArticle",
        },
      },
      {
        id: "demo-pdf",
        type: "pdf",
        position: { x: 360, y: 40 },
        data: {
          kind: "pdf",
          title: "Attention Is All You Need.pdf",
          subtitle: "Page 3",
          pdfPage: 3,
        },
      },
      {
        id: "demo-note",
        type: "note",
        position: { x: 40, y: 280 },
        data: {
          kind: "note",
          title: "Reading note",
          preview:
            "The scaled dot-product attention is the piece to reread against the later sparse variants.",
        },
      },
      {
        id: "demo-file",
        type: "attachment",
        position: { x: 360, y: 360 },
        data: {
          kind: "attachment",
          title: "supplement.zip",
          subtitle: "Linked file",
        },
      },
    ],
    edges: [
      {
        id: "e-item-pdf",
        source: "demo-item",
        target: "demo-pdf",
      },
      {
        id: "e-item-note",
        source: "demo-item",
        target: "demo-note",
      },
    ],
  };
}

export function parseBoardDocument(value: unknown): BoardDocument {
  const raw = asRecord(value);
  if (!raw) return emptyBoard();
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map(parseNode).filter((node): node is BoardNode => !!node)
    : [];
  const edges = Array.isArray(raw.edges)
    ? raw.edges.map(parseEdge).filter((edge): edge is BoardEdge => !!edge)
    : [];
  const viewport = asRecord(raw.viewport);
  return {
    v: BOARD_DOCUMENT_VERSION,
    engine: BOARD_ENGINE,
    nodes,
    edges,
    viewport:
      viewport &&
      typeof viewport.x === "number" &&
      typeof viewport.y === "number" &&
      typeof viewport.zoom === "number"
        ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
        : { x: 0, y: 0, zoom: 1 },
  };
}

export function createBoardNode(
  kind: BoardNodeKind,
  position: { x: number; y: number },
  id: string,
): BoardNode {
  const titles: Record<BoardNodeKind, BoardNodeData> = {
    item: { kind, title: "New item", subtitle: "Zotero item" },
    note: { kind, title: "New note", preview: "" },
    pdf: { kind, title: "PDF page", subtitle: "Page 1", pdfPage: 1 },
    attachment: { kind, title: "Attachment", subtitle: "File" },
  };
  return { id, type: kind, position, data: titles[kind] };
}
