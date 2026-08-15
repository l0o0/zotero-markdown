/**
 * iframe-side whiteboard: React + @xyflow/react.
 */
/// <reference lib="dom" />

import { createRoot } from "react-dom/client";
import { WhiteboardApp, type WhiteboardRuntime } from "./app";
import {
  WHITEBOARD_MESSAGE_SOURCE,
  WHITEBOARD_PROTOCOL_VERSION,
  isWhiteboardProtocolMessage,
  type ParentToWhiteboardMessage,
  type WhiteboardLabels,
  type WhiteboardSnapshot,
  type WhiteboardTheme,
} from "../modules/whiteboard/protocol";

const channel =
  new URL(window.location.href).searchParams.get("channel") || "";

let theme: WhiteboardTheme = "light";
let pendingSnapshot: WhiteboardSnapshot | null = null;
let labels: WhiteboardLabels | undefined;
let runtime: WhiteboardRuntime | null = null;
let rev = 0;

function postToParent(message: {
  type: "ready" | "change" | "snapshot" | "save" | "error";
  payload?: unknown;
}) {
  window.parent?.postMessage(
    {
      source: WHITEBOARD_MESSAGE_SOURCE,
      channel,
      v: WHITEBOARD_PROTOCOL_VERSION,
      ...message,
    },
    "*",
  );
}

function applyDocumentTheme(next: WhiteboardTheme) {
  theme = next;
  document.documentElement.dataset.theme = next;
  document.body.style.background = next === "dark" ? "#1a1d24" : "#fbfbfc";
}

function handleParentMessage(data: ParentToWhiteboardMessage) {
  switch (data.type) {
    case "init":
      applyDocumentTheme(data.payload.theme);
      pendingSnapshot = data.payload.snapshot ?? null;
      labels = data.payload.labels;
      if (data.payload.labels) runtime?.setLabels(data.payload.labels);
      runtime?.setTheme(data.payload.theme);
      if (data.payload.snapshot) runtime?.loadSnapshot(data.payload.snapshot);
      break;
    case "setTheme":
      applyDocumentTheme(data.payload.theme);
      runtime?.setTheme(data.payload.theme);
      break;
    case "loadSnapshot":
      pendingSnapshot = data.payload.snapshot;
      runtime?.loadSnapshot(data.payload.snapshot);
      break;
    case "requestSnapshot":
      postToParent({
        type: "snapshot",
        payload: {
          requestId: data.payload.requestId,
          rev,
          snapshot: runtime?.getSnapshot() ?? pendingSnapshot ?? { v: 1, engine: "xyflow", nodes: [], edges: [] },
        },
      });
      break;
    case "command":
      if (data.payload.command === "undo") runtime?.undo();
      if (data.payload.command === "redo") runtime?.redo();
      break;
    case "focus":
      window.focus();
      document.getElementById("whiteboard-root")?.focus();
      break;
    case "destroy":
      runtime = null;
      break;
    default:
      break;
  }
}

function onWindowMessage(event: MessageEvent) {
  if (!isWhiteboardProtocolMessage(event.data)) return;
  if (event.data.channel && event.data.channel !== channel) return;
  try {
    handleParentMessage(event.data as ParentToWhiteboardMessage);
  } catch (error) {
    postToParent({
      type: "error",
      payload: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function boot() {
  const host = document.getElementById("whiteboard-root");
  if (!host) {
    postToParent({
      type: "error",
      payload: { message: "Missing #whiteboard-root" },
    });
    return;
  }
  applyDocumentTheme("light");
  window.addEventListener("message", onWindowMessage);
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      postToParent({ type: "save" });
    }
  });
  createRoot(host).render(
    <WhiteboardApp
      theme={theme}
      labels={labels}
      initialSnapshot={pendingSnapshot}
      onReady={(next) => {
        runtime = next;
        if (pendingSnapshot) next.loadSnapshot(pendingSnapshot);
        next.setTheme(theme);
      }}
      onChange={(nextRev) => {
        rev = nextRev;
        postToParent({ type: "change", payload: { rev } });
      }}
      onError={(message) => postToParent({ type: "error", payload: { message } })}
    />,
  );
  postToParent({ type: "ready" });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
