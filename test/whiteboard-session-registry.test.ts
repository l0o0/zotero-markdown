import assert from "node:assert/strict";
import test from "node:test";
import {
  WhiteboardSessionRegistry,
  type WhiteboardSession,
} from "../src/modules/whiteboard/session-registry.ts";

function session(
  tabID: string,
  win: Window,
  itemID: number,
  boardId = tabID,
): WhiteboardSession {
  return {
    tabID,
    boardId,
    itemID,
    path: `/tmp/${boardId}.board`,
    win: win as WhiteboardSession["win"],
    title: "Whiteboard",
    currentRev: 0,
    savedRev: 0,
  };
}

test("registers boards by tab and item id and isolates windows", () => {
  const registry = new WhiteboardSessionRegistry();
  const winA = {} as Window;
  const winB = {} as Window;
  registry.register(session("tab-a", winA, 11, "board-1"));
  registry.register(session("tab-b", winA, 12, "board-2"));
  registry.register(session("tab-c", winB, 13, "board-3"));

  assert.equal(registry.get("tab-a")?.boardId, "board-1");
  assert.equal(registry.findByItem(12)?.tabID, "tab-b");
  assert.equal(registry.sessionsForWindow(winA).length, 2);
  assert.equal(registry.sessionsForWindow(winB).length, 1);

  registry.unregister("tab-a");
  assert.equal(registry.get("tab-a"), undefined);
  assert.equal(registry.findByItem(11), undefined);
  assert.equal(registry.sessionsForWindow(winA).length, 1);
});
