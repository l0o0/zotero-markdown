import type { Edge } from "@xyflow/react";
import type { BoardDocument } from "../modules/whiteboard/snapshot";
import type { AcademicNode } from "./nodes";

function boundsOf(nodes: AcademicNode[]) {
  if (!nodes.length) return { x: 0, y: 0, width: 800, height: 600 };
  const left = Math.min(...nodes.map((n) => n.position.x));
  const top = Math.min(...nodes.map((n) => n.position.y));
  const right = Math.max(...nodes.map((n) => n.position.x + (n.width ?? 200)));
  const bottom = Math.max(
    ...nodes.map((n) => n.position.y + (n.height ?? 120)),
  );
  return {
    x: left - 40,
    y: top - 40,
    width: right - left + 80,
    height: bottom - top + 80,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildBoardSvg(doc: BoardDocument): string {
  const bounds = boundsOf(doc.nodes as unknown as AcademicNode[]);
  const shapes = doc.nodes
    .map((node) => {
      const x = node.position.x;
      const y = node.position.y;
      const width = node.width ?? 200;
      const height = node.height ?? 120;
      const title = escapeXml(node.data.title || node.type);
      if (node.type === "ellipse") {
        return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="#f8fafc" stroke="#94a3b8"/>`;
      }
      if (node.type === "line" || node.type === "arrow") {
        const arrow = node.type === "arrow" ? ` marker-end="url(#arrow)"` : "";
        return `<line x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}" stroke="#94a3b8" stroke-width="2"${arrow}/>`;
      }
      const rx = node.type === "rect" ? 4 : 8;
      return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="#ffffff" stroke="#94a3b8"/><text x="${x + 12}" y="${y + 24}" font-size="12" fill="#111827">${title}</text></g>`;
    })
    .join("\n");
  const edges = doc.edges
    .map((edge) => {
      const source = doc.nodes.find((n) => n.id === edge.source);
      const target = doc.nodes.find((n) => n.id === edge.target);
      if (!source || !target) return "";
      const sx = source.position.x + (source.width ?? 200) / 2;
      const sy = source.position.y + (source.height ?? 120) / 2;
      const tx = target.position.x + (target.width ?? 200) / 2;
      const ty = target.position.y + (target.height ?? 120) / 2;
      return `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    })
    .filter(Boolean)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker></defs>
<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#fbfbfc"/>
${edges}
${shapes}
</svg>`;
}

export function buildBoardMarkdown(doc: BoardDocument): string {
  const lines = ["# Whiteboard outline", ""];
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of doc.edges) {
    const list = outgoing.get(edge.source) || [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }
  const visited = new Set<string>();
  const visit = (id: string, indent: number) => {
    const node = byId.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);
    const prefix = "  ".repeat(indent) + "- ";
    const title = node.data.title || node.type;
    lines.push(`${prefix}${title} (${node.type})`);
    for (const next of outgoing.get(id) || []) visit(next, indent + 1);
  };
  for (const node of doc.nodes) visit(node.id, 0);
  return lines.join("\n") + "\n";
}

export function svgToPngDataUrl(
  svg: string,
  width = 1600,
  height = 1200,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.fillStyle = "#fbfbfc";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    image.onerror = () => reject(new Error("SVG render failed"));
    image.src = `data:image/svg+xml;charset=utf-8,${encoded}`;
  });
}
