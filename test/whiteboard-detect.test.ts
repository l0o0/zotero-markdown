import assert from "node:assert/strict";
import test from "node:test";
import { getExtension } from "../src/modules/whiteboard/detect.ts";

test("recognizes board and legacy zmdboard extensions", () => {
  assert.equal(getExtension("Board-2026.board"), "board");
  assert.equal(getExtension("/tmp/notes/map.BOARD"), "board");
  assert.equal(getExtension("Board-2026.zmdboard"), "zmdboard");
  assert.equal(getExtension("/tmp/notes/map.ZMDBOARD"), "zmdboard");
  assert.equal(getExtension("plain.json"), "json");
});
