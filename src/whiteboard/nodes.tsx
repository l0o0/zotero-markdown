/// <reference lib="dom" />

import type { ReactNode } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type {
  BoardNodeData,
  BoardNodeKind,
} from "../modules/whiteboard/snapshot";

export type AcademicNode = Node<BoardNodeData, BoardNodeKind>;

const LABELS: Record<BoardNodeKind, string> = {
  item: "Item",
  note: "Note",
  pdf: "PDF",
  attachment: "File",
  text: "Text",
  rect: "Shape",
  ellipse: "Shape",
  line: "Line",
  arrow: "Arrow",
};

function CardShell(props: {
  kind: BoardNodeKind;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={`zmd-board-card is-${props.kind}${props.selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <span className="zmd-board-card-kind">{LABELS[props.kind]}</span>
      {props.children}
    </article>
  );
}

export function ItemNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <CardShell kind="item" selected={selected}>
      <h3 className="zmd-board-card-title">{data.title}</h3>
      {data.subtitle ? (
        <p className="zmd-board-card-meta">{data.subtitle}</p>
      ) : null}
    </CardShell>
  );
}

export function NoteNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <CardShell kind="note" selected={selected}>
      <h3 className="zmd-board-card-title">{data.title}</h3>
      {data.preview ? (
        <p className="zmd-board-card-preview">{data.preview}</p>
      ) : (
        <p className="zmd-board-card-meta">Empty note</p>
      )}
    </CardShell>
  );
}

export function PdfNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <CardShell kind="pdf" selected={selected}>
      {data.image ? (
        <img
          className="zmd-board-pdf-image"
          src={data.image}
          alt={data.title || "PDF page"}
        />
      ) : (
        <div className="zmd-board-pdf-page" aria-hidden="true">
          <span>{data.pdfPage ? `p. ${data.pdfPage}` : "PDF"}</span>
        </div>
      )}
      <h3 className="zmd-board-card-title">{data.title}</h3>
      {data.subtitle ? (
        <p className="zmd-board-card-meta">{data.subtitle}</p>
      ) : null}
    </CardShell>
  );
}

export function AttachmentNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <CardShell kind="attachment" selected={selected}>
      <h3 className="zmd-board-card-title">{data.title}</h3>
      {data.subtitle ? (
        <p className="zmd-board-card-meta">{data.subtitle}</p>
      ) : null}
    </CardShell>
  );
}

export function TextNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <CardShell kind="text" selected={selected}>
      <p className="zmd-board-card-title">{data.title || "Text"}</p>
    </CardShell>
  );
}

export function RectNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <div className={`zmd-board-shape is-rect${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {data.title ? <span>{data.title}</span> : null}
    </div>
  );
}

export function EllipseNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <div
      className={`zmd-board-shape is-ellipse${selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {data.title ? <span>{data.title}</span> : null}
    </div>
  );
}

export function LineNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <div className={`zmd-board-shape is-line${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="zmd-board-stick" />
      {data.title ? <span>{data.title}</span> : null}
    </div>
  );
}

export function ArrowNode({ data, selected }: NodeProps<AcademicNode>) {
  return (
    <div
      className={`zmd-board-shape is-arrow${selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="zmd-board-stick has-arrow" />
      {data.title ? <span>{data.title}</span> : null}
    </div>
  );
}

export const boardNodeTypes = {
  item: ItemNode,
  note: NoteNode,
  pdf: PdfNode,
  attachment: AttachmentNode,
  text: TextNode,
  rect: RectNode,
  ellipse: EllipseNode,
  line: LineNode,
  arrow: ArrowNode,
};
