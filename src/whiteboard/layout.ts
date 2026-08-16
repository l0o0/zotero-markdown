import type { AcademicNode } from "./nodes";

export interface FlowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nodeRect(node: AcademicNode): FlowRect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? 200,
    height: node.height ?? 120,
  };
}

export type AlignMode =
  "left" | "right" | "top" | "bottom" | "horizontal" | "vertical";

export function alignNodes(
  nodes: AcademicNode[],
  mode: AlignMode,
): AcademicNode[] {
  if (nodes.length < 2) return nodes;
  const rects = nodes.map(nodeRect);
  const bounds = rects.reduce(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.x),
      right: Math.max(acc.right, rect.x + rect.width),
      top: Math.min(acc.top, rect.y),
      bottom: Math.max(acc.bottom, rect.y + rect.height),
    }),
    {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    },
  );
  const center = (bounds.left + bounds.right) / 2;
  const middle = (bounds.top + bounds.bottom) / 2;

  return nodes.map((node) => {
    const rect = nodeRect(node);
    let x = node.position.x;
    let y = node.position.y;
    switch (mode) {
      case "left":
        x = bounds.left;
        break;
      case "right":
        x = bounds.right - rect.width;
        break;
      case "top":
        y = bounds.top;
        break;
      case "bottom":
        y = bounds.bottom - rect.height;
        break;
      case "horizontal":
        x = center - rect.width / 2;
        break;
      case "vertical":
        y = middle - rect.height / 2;
        break;
    }
    return { ...node, position: { x, y } };
  });
}

export function distributeNodes(
  nodes: AcademicNode[],
  direction: "horizontal" | "vertical",
): AcademicNode[] {
  if (nodes.length < 3) return nodes;
  const sorted = [...nodes].sort((a, b) =>
    direction === "horizontal"
      ? a.position.x - b.position.x
      : a.position.y - b.position.y,
  );
  const first = nodeRect(sorted[0]);
  const last = nodeRect(sorted[sorted.length - 1]);
  const firstCenter =
    direction === "horizontal"
      ? first.x + first.width / 2
      : first.y + first.height / 2;
  const lastCenter =
    direction === "horizontal"
      ? last.x + last.width / 2
      : last.y + last.height / 2;
  const step = (lastCenter - firstCenter) / (sorted.length - 1);
  const result = sorted.map((node, index) => {
    const rect = nodeRect(node);
    const center = firstCenter + step * index;
    return {
      ...node,
      position:
        direction === "horizontal"
          ? { x: center - rect.width / 2, y: node.position.y }
          : { x: node.position.x, y: center - rect.height / 2 },
    };
  });
  // Preserve original order in the returned array.
  const order = new Map(result.map((node, index) => [node.id, index]));
  return nodes.map((node) => result[order.get(node.id)!]);
}

export function autoLayoutNodes(nodes: AcademicNode[]): AcademicNode[] {
  if (nodes.length < 2) return nodes;
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const gapX = 40;
  const gapY = 40;
  const origin = sorted.reduce(
    (acc, node) => ({
      x: Math.min(acc.x, node.position.x),
      y: Math.min(acc.y, node.position.y),
    }),
    { x: Infinity, y: Infinity },
  );
  return sorted.map((node, index) => {
    const rect = nodeRect(node);
    const col = index % columns;
    const row = Math.floor(index / columns);
    const colWidth = Math.max(...sorted.map((n) => nodeRect(n).width)) + gapX;
    const rowHeight = Math.max(...sorted.map((n) => nodeRect(n).height)) + gapY;
    return {
      ...node,
      position: {
        x: origin.x + col * colWidth,
        y: origin.y + row * rowHeight,
      },
    };
  });
}
