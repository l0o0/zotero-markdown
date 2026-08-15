import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoardNode,
  parseBoardDocument,
} from "../src/modules/whiteboard/snapshot.ts";
import {
  ensureBoardExtension,
  serializeBoardDocument,
} from "../src/modules/whiteboard/file-io.ts";

test("recovers an empty board from junk input", () => {
  const empty = parseBoardDocument(null);
  assert.equal(empty.engine, "xyflow");
  assert.deepEqual(empty.nodes, []);
  assert.deepEqual(empty.edges, []);
});

test("keeps academic node kinds and drops unknown records", () => {
  const doc = parseBoardDocument({
    nodes: [
      {
        id: "n1",
        type: "item",
        position: { x: 10, y: 20 },
        data: { title: "Paper", itemID: 44 },
      },
      { id: "bad", type: "sticky", position: { x: 0, y: 0 } },
    ],
    edges: [{ id: "e1", source: "n1", target: "missing" }, { id: 3 }],
  });
  assert.equal(doc.nodes.length, 1);
  assert.equal(doc.nodes[0].data.kind, "item");
  assert.equal(doc.nodes[0].data.itemID, 44);
  assert.equal(doc.edges.length, 1);
  assert.equal(doc.edges[0].target, "missing");
});

test("serializes a board as pretty JSON with a zmdboard suffix", () => {
  const json = serializeBoardDocument(
    parseBoardDocument({
      nodes: [
        {
          id: "n1",
          type: "note",
          position: { x: 0, y: 0 },
          data: { title: "Hello" },
        },
      ],
    }),
  );
  assert.match(json, /"engine": "xyflow"/);
  assert.match(json, /"title": "Hello"/);
  assert.equal(ensureBoardExtension("/tmp/board"), "/tmp/board.zmdboard");
  assert.equal(ensureBoardExtension("/tmp/board.json"), "/tmp/board.json");
});

test("createBoardNode stamps a kind-specific placeholder", () => {
  const pdf = createBoardNode("pdf", { x: 1, y: 2 }, "pdf-1");
  assert.equal(pdf.type, "pdf");
  assert.equal(pdf.data.pdfPage, 1);
});
