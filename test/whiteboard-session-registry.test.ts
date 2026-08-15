import assert from "node:assert/strict";
import test from "node:test";
import {
  WhiteboardSessionRegistry,
  type WhiteboardSession,
} from "../src/modules/whiteboard/session-registry.ts";

function session(
  tabID: string,
  win: Window,
  boardId = tabID,
): WhiteboardSession {
  return {
    tabID,
    boardId,
    win: win as WhiteboardSession["win"],
    title: "Whiteboard",
    currentRev: 0,
    savedRev: 0,
  };
}

test("registers boards by tab id and isolates windows", () => {
  const registry = new WhiteboardSessionRegistry();
  const winA = {} as Window;
  const winB = {} as Window;
  registry.register(session("tab-a", winA, "board-1"));
  registry.register(session("tab-b", winA, "board-2"));
  registry.register(session("tab-c", winB, "board-3"));

  assert.equal(registry.get("tab-a")?.boardId, "board-1");
  assert.equal(registry.sessionsForWindow(winA).length, 2);
  assert.equal(registry.sessionsForWindow(winB).length, 1);

  registry.unregister("tab-a");
  assert.equal(registry.get("tab-a"), undefined);
  assert.equal(registry.sessionsForWindow(winA).length, 1);
  assert.equal(registry.sessionsForWindow(winB).length, 1);
});

test("does not key sessions on a Zotero item id", () => {
  const registry = new WhiteboardSessionRegistry();
  const win = {} as Window;
  const first = session("tab-1", win, "board-1");
  const second = session("tab-2", win, "board-2");
  registry.register(first);
  registry.register(second);
  assert.deepEqual(
    registry.all().map((item) => item.boardId).sort(),
    ["board-1", "board-2"],
  );
  assert.equal("itemID" in first, false);
});
