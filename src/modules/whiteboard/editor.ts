/**
 * Parent-side board: mounts a chrome:// iframe and bridges via postMessage.
 */
import { resolveEditorTheme } from "../markdown/editor";
import { ensureDOMGlobals } from "../../utils/dom";
import {
  WHITEBOARD_MESSAGE_SOURCE,
  WHITEBOARD_PROTOCOL_VERSION,
  isWhiteboardProtocolMessageForChannel,
  type ParentToWhiteboardMessage,
  type WhiteboardLabels,
  type WhiteboardSnapshot,
  type WhiteboardTheme,
  type WhiteboardToParentMessage,
} from "./protocol";
import type { BoardNodeData } from "./snapshot";

export interface WhiteboardHandle {
  ready: Promise<void>;
  focus: () => void;
  destroy: () => void;
  setTheme: (theme: WhiteboardTheme) => void;
  loadSnapshot: (snapshot: WhiteboardSnapshot) => void;
  requestSnapshot: () => Promise<{
    rev: number;
    snapshot: WhiteboardSnapshot;
  }>;
  command: (command: "undo" | "redo") => void;
  resolvePick: (requestId: string, nodeId: string, data: BoardNodeData) => void;
  rejectPick: (requestId: string, message: string) => void;
}

function whiteboardPageURL() {
  const ref = addon.data.config.addonRef;
  return `chrome://${ref}/content/whiteboard/index.html`;
}

type PendingCommand = Extract<
  ParentToWhiteboardMessage,
  {
    type:
      | "init"
      | "setTheme"
      | "loadSnapshot"
      | "command"
      | "focus"
      | "destroy"
      | "itemPicked"
      | "pickFailed";
  }
>;

export function createWhiteboardEditor(
  parent: HTMLElement,
  options: {
    win?: Window;
    channel?: string;
    snapshot?: WhiteboardSnapshot | null;
    labels?: WhiteboardLabels;
    onChange?: (rev: number) => void;
    onSave?: () => void;
    onError?: (message: string) => void;
    onPickItem?: (
      requestId: string,
      nodeId: string,
      kind: "item" | "pdf",
    ) => void;
  } = {},
): WhiteboardHandle {
  const ownerWin =
    options.win || parent.ownerDocument?.defaultView || undefined;
  ensureDOMGlobals(ownerWin || undefined);

  const channel = options.channel || "";
  const documentRef = parent.ownerDocument || (globalThis as any).document;
  if (!documentRef) {
    throw new Error("No document available for whiteboard");
  }

  while (parent.firstChild) parent.removeChild(parent.firstChild);

  const wrap = documentRef.createElement("div");
  wrap.className = "zmd-whiteboard-wrap";

  const iframe = documentRef.createElement("iframe") as HTMLIFrameElement;
  iframe.className = "zmd-whiteboard-iframe";
  iframe.setAttribute(
    "src",
    `${whiteboardPageURL()}?channel=${encodeURIComponent(channel)}`,
  );
  Object.assign(iframe.style, {
    border: "none",
    width: "100%",
    height: "100%",
    flex: "1 1 auto",
    minHeight: "0",
    minWidth: "0",
    display: "block",
    background: "transparent",
  });

  wrap.appendChild(iframe);
  parent.appendChild(wrap);

  let destroyed = false;
  let iframeReady = false;
  let pendingSnapshot = options.snapshot ?? null;
  const pending: PendingCommand[] = [];
  const snapshotWaiters = new Map<
    string,
    (value: { rev: number; snapshot: WhiteboardSnapshot }) => void
  >();

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const post = (message: ParentToWhiteboardMessage) => {
    const target = iframe.contentWindow;
    if (!target) return false;
    target.postMessage(
      { ...message, channel, v: WHITEBOARD_PROTOCOL_VERSION },
      "*",
    );
    return true;
  };

  const sendOrQueue = (message: PendingCommand) => {
    if (destroyed) return;
    if (!iframeReady) {
      if (
        message.type === "init" ||
        message.type === "setTheme" ||
        message.type === "loadSnapshot"
      ) {
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].type === message.type) pending.splice(i, 1);
        }
      }
      pending.push(message);
      return;
    }
    post(message);
  };

  const onMessage = (event: MessageEvent) => {
    if (destroyed) return;
    if (event.source && event.source !== iframe.contentWindow) return;
    if (!isWhiteboardProtocolMessageForChannel(event.data, channel)) return;

    const data = event.data as WhiteboardToParentMessage;
    switch (data.type) {
      case "ready": {
        iframeReady = true;
        post({
          source: WHITEBOARD_MESSAGE_SOURCE,
          type: "init",
          payload: {
            theme: resolveEditorTheme(ownerWin),
            snapshot: pendingSnapshot,
            labels: options.labels,
          },
        });
        for (const cmd of pending.splice(0, pending.length)) post(cmd);
        resolveReady();
        break;
      }
      case "change":
        options.onChange?.(data.payload.rev);
        break;
      case "snapshot": {
        const waiter = snapshotWaiters.get(data.payload.requestId);
        snapshotWaiters.delete(data.payload.requestId);
        waiter?.({
          rev: data.payload.rev,
          snapshot: data.payload.snapshot,
        });
        break;
      }
      case "save":
        options.onSave?.();
        break;
      case "pickItem":
        options.onPickItem?.(
          data.payload.requestId,
          data.payload.nodeId,
          data.payload.kind,
        );
        break;
      case "error":
        options.onError?.(data.payload.message);
        break;
      default:
        break;
    }
  };

  ownerWin?.addEventListener("message", onMessage);

  return {
    ready,
    focus() {
      sendOrQueue({ source: WHITEBOARD_MESSAGE_SOURCE, type: "focus" });
      try {
        iframe.focus();
      } catch {
        // ignore
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ownerWin?.removeEventListener("message", onMessage);
      post({ source: WHITEBOARD_MESSAGE_SOURCE, type: "destroy" });
      iframe.remove();
      wrap.remove();
    },
    setTheme(theme) {
      sendOrQueue({
        source: WHITEBOARD_MESSAGE_SOURCE,
        type: "setTheme",
        payload: { theme },
      });
    },
    loadSnapshot(snapshot) {
      pendingSnapshot = snapshot;
      sendOrQueue({
        source: WHITEBOARD_MESSAGE_SOURCE,
        type: "loadSnapshot",
        payload: { snapshot },
      });
    },
    requestSnapshot() {
      const requestId = `snap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return new Promise((resolve, reject) => {
        if (destroyed) {
          reject(new Error("whiteboard destroyed"));
          return;
        }
        snapshotWaiters.set(requestId, resolve);
        post({
          source: WHITEBOARD_MESSAGE_SOURCE,
          type: "requestSnapshot",
          payload: { requestId },
        });
        ownerWin?.setTimeout?.(() => {
          if (snapshotWaiters.delete(requestId)) {
            reject(new Error("snapshot timeout"));
          }
        }, 8000);
      });
    },
    command(command) {
      sendOrQueue({
        source: WHITEBOARD_MESSAGE_SOURCE,
        type: "command",
        payload: { command },
      });
    },
    resolvePick(requestId, nodeId, data) {
      sendOrQueue({
        source: WHITEBOARD_MESSAGE_SOURCE,
        type: "itemPicked",
        payload: { requestId, nodeId, data },
      });
    },
    rejectPick(requestId, message) {
      sendOrQueue({
        source: WHITEBOARD_MESSAGE_SOURCE,
        type: "pickFailed",
        payload: { requestId, message },
      });
    },
  };
}
