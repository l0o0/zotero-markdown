/**
 * postMessage protocol between the Zotero tab (parent) and the
 * chrome:// whiteboard iframe (@xyflow/react host).
 *
 * Pure module: no Zotero APIs. Distinct source from the Markdown editor
 * so the two iframes cannot accept each other's messages.
 */

import type { BoardDocument, BoardNodeData } from "./snapshot";

export const WHITEBOARD_MESSAGE_SOURCE = "zotero-markdown-whiteboard" as const;
export const WHITEBOARD_PROTOCOL_VERSION = 1;

export type WhiteboardTheme = "light" | "dark";

export type WhiteboardCommand = "undo" | "redo";

/** Versioned xyflow document. Extra keys are ignored by parseBoardDocument. */
export type WhiteboardSnapshot = BoardDocument | Record<string, unknown>;

export interface WhiteboardProtocolMessage {
  source: typeof WHITEBOARD_MESSAGE_SOURCE;
  channel?: string;
  v?: typeof WHITEBOARD_PROTOCOL_VERSION;
}

export interface WhiteboardLabels {
  addItem: string;
  addNote: string;
  addPdf: string;
  addFile: string;
  addText: string;
  addRect: string;
  addEllipse: string;
  addLine: string;
  addArrow: string;
  eraser: string;
  undo: string;
  redo: string;
  save: string;
  editText: string;
  copy: string;
  delete: string;
  openItem: string;
  alignLeft: string;
  alignRight: string;
  alignTop: string;
  alignBottom: string;
  alignHorizontal: string;
  alignVertical: string;
  distributeHorizontal: string;
  distributeVertical: string;
  fitView: string;
  autoLayout: string;
  edgeColor: string;
  edgeDash: string;
  edgeArrow: string;
  saved: string;
  saving: string;
  saveFailed: string;
  exportPng: string;
  exportSvg: string;
  exportMarkdown: string;
}

export interface WhiteboardInitPayload {
  theme: WhiteboardTheme;
  snapshot?: WhiteboardSnapshot | null;
  labels?: WhiteboardLabels;
}

export type ParentToWhiteboardMessage = WhiteboardProtocolMessage &
  (
    | { type: "init"; payload: WhiteboardInitPayload }
    | { type: "setTheme"; payload: { theme: WhiteboardTheme } }
    | { type: "loadSnapshot"; payload: { snapshot: WhiteboardSnapshot } }
    | { type: "requestSnapshot"; payload: { requestId: string } }
    | { type: "command"; payload: { command: WhiteboardCommand } }
    | { type: "focus" }
    | { type: "destroy" }
    | {
        type: "itemPicked";
        payload: { requestId: string; nodeId: string; data: BoardNodeData };
      }
    | {
        type: "pickFailed";
        payload: { requestId: string; message: string };
      }
    | {
        type: "saveState";
        payload: { state: "saved" | "saving" | "error" };
      }
  );

export type WhiteboardToParentMessage = WhiteboardProtocolMessage &
  (
    | { type: "ready" }
    | { type: "change"; payload: { rev: number } }
    | {
        type: "snapshot";
        payload: {
          requestId: string;
          rev: number;
          snapshot: WhiteboardSnapshot;
        };
      }
    | { type: "save" }
    | { type: "error"; payload: { message: string } }
    | {
        type: "pickItem";
        payload: {
          requestId: string;
          nodeId: string;
          kind: "item" | "pdf" | "note" | "attachment";
        };
      }
    | {
        type: "openItem";
        payload: {
          itemID?: number;
          attachmentID?: number;
          noteID?: number;
          pdfPage?: number;
        };
      }
    | {
        type: "dropItems";
        payload: {
          requestId: string;
          nodeId: string;
          raw: Record<string, string>;
        };
      }
    | {
        type: "exportFile";
        payload: {
          requestId: string;
          format: "png" | "svg" | "md";
          mimeType: string;
          dataUrl?: string;
          text?: string;
        };
      }
  );

export function isWhiteboardProtocolMessage(
  data: unknown,
): data is WhiteboardProtocolMessage & { type: string } {
  if (!data || typeof data !== "object") return false;
  const message = data as Partial<WhiteboardProtocolMessage> & {
    type?: unknown;
  };
  return (
    message.source === WHITEBOARD_MESSAGE_SOURCE &&
    (message.v === undefined || message.v === WHITEBOARD_PROTOCOL_VERSION) &&
    typeof message.type === "string"
  );
}

export function isWhiteboardProtocolMessageForChannel(
  data: unknown,
  channel: string,
): data is WhiteboardToParentMessage {
  return (
    isWhiteboardProtocolMessage(data) &&
    (data.channel === undefined || data.channel === channel)
  );
}

export function whiteboardChannel(tabID: string, boardId: string) {
  return `${tabID}:${boardId}`;
}
