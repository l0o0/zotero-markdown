import assert from "node:assert/strict";
import test from "node:test";
import {
  EDITOR_MESSAGE_SOURCE,
  isEditorProtocolMessageForChannel,
} from "../src/modules/markdown/editor-protocol.ts";
import {
  WHITEBOARD_MESSAGE_SOURCE,
  isWhiteboardProtocolMessage,
  isWhiteboardProtocolMessageForChannel,
  whiteboardChannel,
} from "../src/modules/whiteboard/protocol.ts";

test("whiteboard channel is tab plus board id", () => {
  assert.equal(whiteboardChannel("tab-9", "board-a"), "tab-9:board-a");
});

test("accepts whiteboard messages only from the matching session channel", () => {
  const message = {
    source: WHITEBOARD_MESSAGE_SOURCE,
    channel: "tab-9:board-a",
    type: "change",
    payload: { rev: 3 },
  };
  assert.equal(
    isWhiteboardProtocolMessageForChannel(message, "tab-9:board-a"),
    true,
  );
  assert.equal(
    isWhiteboardProtocolMessageForChannel(message, "tab-1:board-b"),
    false,
  );
});

test("rejects markdown editor messages as whiteboard traffic", () => {
  const editorMessage = {
    source: EDITOR_MESSAGE_SOURCE,
    channel: "tab-9:board-a",
    type: "ready",
  };
  assert.equal(isWhiteboardProtocolMessage(editorMessage), false);
  assert.equal(
    isEditorProtocolMessageForChannel(editorMessage, "tab-9:board-a"),
    true,
  );
});
