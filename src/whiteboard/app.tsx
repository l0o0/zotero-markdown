/// <reference lib="dom" />

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./board.css";
import type {
  WhiteboardLabels,
  WhiteboardTheme,
} from "../modules/whiteboard/protocol";
import {
  createBoardNode,
  demoBoard,
  parseBoardDocument,
  type BoardDocument,
  type BoardNodeData,
  type BoardNodeKind,
} from "../modules/whiteboard/snapshot";
import { boardNodeTypes, type AcademicNode } from "./nodes";
import {
  alignNodes,
  autoLayoutNodes,
  distributeNodes,
  type AlignMode,
} from "./layout";
import { buildBoardMarkdown, buildBoardSvg, svgToPngDataUrl } from "./export";
import {
  IconAlignBottom,
  IconAlignHCenter,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconAlignVCenter,
  IconArrow,
  IconCopy,
  IconDistributeH,
  IconDistributeV,
  IconEdit,
  IconEllipse,
  IconEraser,
  IconExport,
  IconFile,
  IconFitView,
  IconItem,
  IconLayout,
  IconLine,
  IconNote,
  IconOpen,
  IconPdf,
  IconRect,
  IconRedo,
  IconSave,
  IconText,
  IconTrash,
  IconUndo,
} from "./icons";

const DEFAULT_LABELS: WhiteboardLabels = {
  addItem: "Item",
  addNote: "Note",
  addPdf: "PDF",
  addFile: "File",
  addText: "Text",
  addRect: "Rect",
  addEllipse: "Oval",
  addLine: "Line",
  addArrow: "Arrow",
  eraser: "Eraser",
  undo: "Undo",
  redo: "Redo",
  save: "Save",
  editText: "Edit text",
  copy: "Copy",
  delete: "Delete",
  openItem: "Open item",
  alignLeft: "Align left",
  alignRight: "Align right",
  alignTop: "Align top",
  alignBottom: "Align bottom",
  alignHorizontal: "Align horizontal center",
  alignVertical: "Align vertical center",
  distributeHorizontal: "Distribute horizontally",
  distributeVertical: "Distribute vertically",
  fitView: "Fit view",
  autoLayout: "Auto layout",
  edgeColor: "Edge color",
  edgeDash: "Toggle dashed",
  edgeArrow: "Toggle arrow",
  saved: "Saved",
  saving: "Saving…",
  saveFailed: "Save failed",
  exportPng: "Export PNG",
  exportSvg: "Export SVG",
  exportMarkdown: "Export Markdown",
};

export interface WhiteboardAppProps {
  theme: WhiteboardTheme;
  labels?: WhiteboardLabels;
  initialSnapshot?: BoardDocument | Record<string, unknown> | null;
  onReady: (api: WhiteboardRuntime) => void;
  onChange: (rev: number) => void;
  onError: (message: string) => void;
  onSave: () => void;
  onPickItem: (
    requestId: string,
    nodeId: string,
    kind: "item" | "pdf" | "note" | "attachment",
  ) => void;
  onOpenItem: (payload: {
    itemID?: number;
    attachmentID?: number;
    noteID?: number;
    pdfPage?: number;
  }) => void;
  onDropItems: (
    requestId: string,
    nodeId: string,
    raw: Record<string, string>,
  ) => void;
  onExportFile: (payload: {
    requestId: string;
    format: "png" | "svg" | "md";
    mimeType: string;
    dataUrl?: string;
    text?: string;
  }) => void;
}

export interface WhiteboardRuntime {
  setTheme: (theme: WhiteboardTheme) => void;
  setLabels: (labels: WhiteboardLabels) => void;
  loadSnapshot: (snapshot: BoardDocument | Record<string, unknown>) => void;
  getSnapshot: () => BoardDocument;
  undo: () => void;
  redo: () => void;
  resolvePick: (requestId: string, nodeId: string, data: BoardNodeData) => void;
  rejectPick: (requestId: string, message: string) => void;
  setSaveState: (state: "saved" | "saving" | "error") => void;
}

function newId(kind: string) {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

function toFlow(doc: BoardDocument): { nodes: AcademicNode[]; edges: Edge[] } {
  return {
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      width: node.width,
      height: node.height,
    })),
    edges: doc.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      label: edge.label,
      style: {
        stroke: edge.color ?? "#9ca3af",
        strokeDasharray: edge.dashed ? "6 4" : undefined,
      },
      markerEnd: edge.color
        ? {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: edge.color,
          }
        : { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    })),
  };
}

function fromFlow(
  nodes: AcademicNode[],
  edges: Edge[],
  viewport: Viewport,
): BoardDocument {
  return {
    v: 1,
    engine: "xyflow",
    viewport,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type as BoardNodeKind) || "item",
      position: node.position,
      width: node.width,
      height: node.height,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      label: typeof edge.label === "string" ? edge.label : undefined,
      dashed: edge.style?.strokeDasharray ? true : undefined,
      color:
        typeof edge.style?.stroke === "string" ? edge.style.stroke : undefined,
    })),
  };
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

export function WhiteboardApp(props: WhiteboardAppProps): ReactElement {
  const initial = useMemo(
    () => parseBoardDocument(props.initialSnapshot ?? demoBoard()),
    [props.initialSnapshot],
  );
  const seed = useMemo(() => toFlow(initial), [initial]);
  const [nodes, setNodes] = useState<AcademicNode[]>(seed.nodes);
  const [edges, setEdges] = useState<Edge[]>(seed.edges);
  const [theme, setTheme] = useState<WhiteboardTheme>(props.theme);
  const [labels, setLabels] = useState<WhiteboardLabels>(
    props.labels ?? DEFAULT_LABELS,
  );
  const [eraser, setEraser] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [editing, setEditing] = useState<{
    nodeId: string;
    value: string;
  } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const viewportRef = useRef<Viewport>(
    initial.viewport ?? { x: 0, y: 0, zoom: 1 },
  );
  const revRef = useRef(0);
  const historyRef = useRef<BoardDocument[]>([]);
  const futureRef = useRef<BoardDocument[]>([]);
  const flowRef = useRef<ReactFlowInstance<AcademicNode> | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const pendingPicksRef = useRef(new Map<string, string>());
  const runtimeRef = useRef<WhiteboardRuntime | null>(null);

  const bump = useCallback(() => {
    revRef.current += 1;
    propsRef.current.onChange(revRef.current);
  }, []);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const snapshotNow = useCallback(
    () => fromFlow(nodesRef.current, edgesRef.current, viewportRef.current),
    [],
  );

  const pushHistory = useCallback(() => {
    historyRef.current.push(snapshotNow());
    if (historyRef.current.length > 80) historyRef.current.shift();
    futureRef.current = [];
  }, [snapshotNow]);

  const applyDocument = useCallback((doc: BoardDocument) => {
    const next = toFlow(parseBoardDocument(doc));
    setNodes(next.nodes);
    setEdges(next.edges);
    viewportRef.current = doc.viewport ?? { x: 0, y: 0, zoom: 1 };
    flowRef.current?.setViewport(viewportRef.current);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<AcademicNode>[]) => {
      const structural = changes.some(
        (change) => change.type === "remove" || change.type === "add",
      );
      if (structural) pushHistory();
      setNodes((current) => applyNodeChanges(changes, current));
      if (changes.some((change) => change.type !== "select")) bump();
    },
    [bump, pushHistory],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type === "remove")) pushHistory();
      setEdges((current) => applyEdgeChanges(changes, current));
      if (changes.some((change) => change.type !== "select")) bump();
    },
    [bump, pushHistory],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      setEdges((current) =>
        addEdge({ ...connection, id: newId("edge") }, current),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const addNode = useCallback(
    (kind: BoardNodeKind) => {
      pushHistory();
      const center = flowRef.current?.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }) ?? { x: 120, y: 120 };
      const nodeId = newId(kind);
      setNodes((current) => [
        ...current,
        toFlow({
          v: 1,
          engine: "xyflow",
          nodes: [createBoardNode(kind, center, nodeId)],
          edges: [],
        }).nodes[0],
      ]);
      bump();
      if (
        kind === "item" ||
        kind === "pdf" ||
        kind === "note" ||
        kind === "attachment"
      ) {
        const requestId = `pick-${nodeId}-${Date.now().toString(36)}`;
        pendingPicksRef.current.set(requestId, nodeId);
        propsRef.current.onPickItem(requestId, nodeId, kind);
      }
    },
    [bump, pushHistory],
  );

  const eraseNode = useCallback(
    (id: string) => {
      pushHistory();
      setNodes((current) => current.filter((node) => node.id !== id));
      setEdges((current) =>
        current.filter((edge) => edge.source !== id && edge.target !== id),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const eraseEdge = useCallback(
    (id: string) => {
      pushHistory();
      setEdges((current) => current.filter((edge) => edge.id !== id));
      bump();
    },
    [bump, pushHistory],
  );

  const updateNode = useCallback(
    (nodeId: string, updater: (node: AcademicNode) => AcademicNode) => {
      pushHistory();
      setNodes((current) =>
        current.map((node) => (node.id === nodeId ? updater(node) : node)),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const startEdit = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    setMenu(null);
    setEraser(false);
    setEditing({ nodeId, value: node.data.title || "" });
  }, []);

  const openNode = useCallback(
    (node: AcademicNode) => {
      const data = node.data;
      if (data.noteID) {
        propsRef.current.onOpenItem({ noteID: data.noteID });
      } else if (data.attachmentID && node.type === "pdf") {
        propsRef.current.onOpenItem({
          attachmentID: data.attachmentID,
          pdfPage: data.pdfPage,
        });
      } else if (data.attachmentID) {
        propsRef.current.onOpenItem({ attachmentID: data.attachmentID });
      } else if (data.itemID) {
        propsRef.current.onOpenItem({ itemID: data.itemID });
      } else {
        startEdit(node.id);
      }
    },
    [startEdit],
  );

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const { nodeId, value } = editing;
    setEditing(null);
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    if (node.data.title === value) return;
    updateNode(nodeId, (current) => ({
      ...current,
      data: { ...current.data, title: value },
    }));
  }, [editing, updateNode]);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const copyNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node) return;
      pushHistory();
      const id = newId(node.type || "item");
      setNodes((current) => [
        ...current,
        {
          ...node,
          id,
          selected: false,
          position: { x: node.position.x + 24, y: node.position.y + 24 },
        },
      ]);
      bump();
    },
    [bump, pushHistory],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setMenu(null);
      eraseNode(nodeId);
    },
    [eraseNode],
  );

  const alignSelected = useCallback(
    (mode: AlignMode) => {
      const selected = nodesRef.current.filter((node) => node.selected);
      if (selected.length < 2) return;
      pushHistory();
      const aligned = alignNodes(selected, mode);
      setNodes((current) =>
        current.map((node) => {
          const target = aligned.find((item) => item.id === node.id);
          return target ? { ...node, position: target.position } : node;
        }),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const distributeSelected = useCallback(
    (direction: "horizontal" | "vertical") => {
      const selected = nodesRef.current.filter((node) => node.selected);
      if (selected.length < 3) return;
      pushHistory();
      const distributed = distributeNodes(selected, direction);
      setNodes((current) =>
        current.map((node) => {
          const target = distributed.find((item) => item.id === node.id);
          return target ? { ...node, position: target.position } : node;
        }),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const autoLayout = useCallback(() => {
    pushHistory();
    setNodes((current) => autoLayoutNodes(current));
    bump();
  }, [bump, pushHistory]);

  const fitView = useCallback(() => {
    void flowRef.current?.fitView({ padding: 0.2, duration: 300 });
  }, []);

  const EDGE_COLORS = ["#9ca3af", "#2563eb", "#059669", "#d97706", "#dc2626"];

  const cycleEdgeColor = useCallback(
    (edgeId: string) => {
      const edge = edgesRef.current.find((item) => item.id === edgeId);
      if (!edge) return;
      const current = edge.style?.stroke ?? "#9ca3af";
      const next =
        EDGE_COLORS[
          (EDGE_COLORS.indexOf(String(current)) + 1) % EDGE_COLORS.length
        ];
      pushHistory();
      setEdges((currentEdges) =>
        currentEdges.map((item) =>
          item.id === edgeId
            ? {
                ...item,
                style: {
                  ...(item.style ?? {}),
                  stroke: next,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 16,
                  height: 16,
                  color: next,
                },
              }
            : item,
        ),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const toggleEdgeDashed = useCallback(
    (edgeId: string) => {
      const edge = edgesRef.current.find((item) => item.id === edgeId);
      if (!edge) return;
      const dashed = !edge.style?.strokeDasharray;
      pushHistory();
      setEdges((currentEdges) =>
        currentEdges.map((item) =>
          item.id === edgeId
            ? {
                ...item,
                style: {
                  ...(item.style ?? {}),
                  strokeDasharray: dashed ? "6 4" : undefined,
                },
              }
            : item,
        ),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const toggleEdgeArrow = useCallback(
    (edgeId: string) => {
      const edge = edgesRef.current.find((item) => item.id === edgeId);
      if (!edge) return;
      const hasArrow = !!edge.markerEnd;
      pushHistory();
      setEdges((currentEdges) =>
        currentEdges.map((item) =>
          item.id === edgeId
            ? {
                ...item,
                markerEnd: hasArrow
                  ? undefined
                  : {
                      type: MarkerType.ArrowClosed,
                      width: 16,
                      height: 16,
                      color: String(item.style?.stroke ?? "#9ca3af"),
                    },
              }
            : item,
        ),
      );
      bump();
    },
    [bump, pushHistory],
  );

  const exportAs = useCallback(
    (format: "png" | "svg" | "md") => {
      setMenu(null);
      const doc = snapshotNow();
      const requestId = `export-${Date.now().toString(36)}`;
      if (format === "md") {
        propsRef.current.onExportFile({
          requestId,
          format,
          mimeType: "text/markdown",
          text: buildBoardMarkdown(doc),
        });
        return;
      }
      const svg = buildBoardSvg(doc);
      if (format === "svg") {
        propsRef.current.onExportFile({
          requestId,
          format,
          mimeType: "image/svg+xml",
          dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        });
        return;
      }
      void svgToPngDataUrl(svg).then((dataUrl) => {
        propsRef.current.onExportFile({
          requestId,
          format,
          mimeType: "image/png",
          dataUrl,
        });
      });
    },
    [snapshotNow],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setEraser(false);
      const position = flowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? { x: 120, y: 120 };
      const nodeId = newId("item");
      pushHistory();
      setNodes((current) => [
        ...current,
        toFlow({
          v: 1,
          engine: "xyflow",
          nodes: [createBoardNode("item", position, nodeId)],
          edges: [],
        }).nodes[0],
      ]);
      bump();
      const raw: Record<string, string> = {};
      const types = Array.from(event.dataTransfer?.types || []);
      for (const type of types) {
        try {
          raw[type] = event.dataTransfer.getData(type);
        } catch {
          // ignore
        }
      }
      const requestId = `drop-${nodeId}-${Date.now().toString(36)}`;
      pendingPicksRef.current.set(requestId, nodeId);
      propsRef.current.onDropItems(requestId, nodeId, raw);
    },
    [bump, pushHistory],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editing) return;
      if (event.key === "Escape") {
        setMenu(null);
        setEraser(false);
        setEditing(null);
        return;
      }
      if (event.key.startsWith("Arrow")) {
        const selected = nodesRef.current.filter((node) => node.selected);
        if (!selected.length) return;
        event.preventDefault();
        const step = event.shiftKey ? 16 : 1;
        const dx =
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0;
        const dy =
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0;
        if (!dx && !dy) return;
        pushHistory();
        setNodes((current) =>
          current.map((node) =>
            node.selected
              ? {
                  ...node,
                  position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                  },
                }
              : node,
          ),
        );
        bump();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, bump, pushHistory]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".zmd-board-context-menu")) {
        setMenu(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menu]);

  useEffect(() => {
    const runtime: WhiteboardRuntime = {
      setTheme,
      setLabels,
      loadSnapshot(snapshot) {
        applyDocument(parseBoardDocument(snapshot));
        bump();
      },
      getSnapshot: snapshotNow,
      undo() {
        const previous = historyRef.current.pop();
        if (!previous) return;
        futureRef.current.push(snapshotNow());
        applyDocument(previous);
        bump();
      },
      redo() {
        const next = futureRef.current.pop();
        if (!next) return;
        historyRef.current.push(snapshotNow());
        applyDocument(next);
        bump();
      },
      resolvePick(requestId, nodeId, data) {
        if (pendingPicksRef.current.get(requestId) !== nodeId) return;
        pendingPicksRef.current.delete(requestId);
        pushHistory();
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId ? { ...node, type: data.kind, data } : node,
          ),
        );
        bump();
      },
      rejectPick(requestId, message) {
        if (!pendingPicksRef.current.delete(requestId)) return;
        propsRef.current.onError(message);
      },
      setSaveState(state) {
        setSaveState(state);
      },
    };
    runtimeRef.current = runtime;
    propsRef.current.onReady(runtime);
  }, [applyDocument, bump, pushHistory, snapshotNow]);

  useEffect(() => {
    setTheme(props.theme);
  }, [props.theme]);

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const editingNode = editing
    ? nodes.find((node) => node.id === editing.nodeId)
    : null;
  const editingScreen = editingNode
    ? flowRef.current?.flowToScreenPosition(editingNode.position)
    : null;
  const menuNode = menu ? nodes.find((node) => node.id === menu.nodeId) : null;

  return (
    <div
      className={`zmd-board-host${eraser ? " is-eraser" : ""}`}
      data-theme={theme}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.length) event.preventDefault();
      }}
      onDrop={handleDrop}
    >
      <div className="zmd-board-toolbar">
        <button
          type="button"
          title={labels.addItem}
          onClick={() => addNode("item")}
        >
          <IconItem />
        </button>
        <button
          type="button"
          title={labels.addNote}
          onClick={() => addNode("note")}
        >
          <IconNote />
        </button>
        <button
          type="button"
          title={labels.addPdf}
          onClick={() => addNode("pdf")}
        >
          <IconPdf />
        </button>
        <button
          type="button"
          title={labels.addFile}
          onClick={() => addNode("attachment")}
        >
          <IconFile />
        </button>
        <span className="zmd-board-toolbar-sep" />
        <button
          type="button"
          title={labels.addText}
          onClick={() => addNode("text")}
        >
          <IconText />
        </button>
        <button
          type="button"
          title={labels.addRect}
          onClick={() => addNode("rect")}
        >
          <IconRect />
        </button>
        <button
          type="button"
          title={labels.addEllipse}
          onClick={() => addNode("ellipse")}
        >
          <IconEllipse />
        </button>
        <button
          type="button"
          title={labels.addLine}
          onClick={() => addNode("line")}
        >
          <IconLine />
        </button>
        <button
          type="button"
          title={labels.addArrow}
          onClick={() => addNode("arrow")}
        >
          <IconArrow />
        </button>
        <span className="zmd-board-toolbar-sep" />
        <button
          type="button"
          title={labels.eraser}
          className={eraser ? "is-active" : ""}
          onClick={() => setEraser((value) => !value)}
        >
          <IconEraser />
        </button>
        <span className="zmd-board-toolbar-sep" />
        <button
          type="button"
          title={labels.undo}
          onClick={() => runtimeRef.current?.undo()}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          title={labels.redo}
          onClick={() => runtimeRef.current?.redo()}
        >
          <IconRedo />
        </button>
        <button
          type="button"
          title={labels.save}
          onClick={propsRef.current.onSave}
        >
          <IconSave />
        </button>
        {selectedNodes.length >= 2 ? (
          <>
            <span className="zmd-board-toolbar-sep" />
            <button
              type="button"
              title={labels.alignLeft}
              onClick={() => alignSelected("left")}
            >
              <IconAlignLeft />
            </button>
            <button
              type="button"
              title={labels.alignRight}
              onClick={() => alignSelected("right")}
            >
              <IconAlignRight />
            </button>
            <button
              type="button"
              title={labels.alignTop}
              onClick={() => alignSelected("top")}
            >
              <IconAlignTop />
            </button>
            <button
              type="button"
              title={labels.alignBottom}
              onClick={() => alignSelected("bottom")}
            >
              <IconAlignBottom />
            </button>
            <button
              type="button"
              title={labels.alignHorizontal}
              onClick={() => alignSelected("horizontal")}
            >
              <IconAlignHCenter />
            </button>
            <button
              type="button"
              title={labels.alignVertical}
              onClick={() => alignSelected("vertical")}
            >
              <IconAlignVCenter />
            </button>
            {selectedNodes.length >= 3 ? (
              <>
                <button
                  type="button"
                  title={labels.distributeHorizontal}
                  onClick={() => distributeSelected("horizontal")}
                >
                  <IconDistributeH />
                </button>
                <button
                  type="button"
                  title={labels.distributeVertical}
                  onClick={() => distributeSelected("vertical")}
                >
                  <IconDistributeV />
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {selectedEdges.length >= 1 ? (
          <>
            <span className="zmd-board-toolbar-sep" />
            <button
              type="button"
              title={labels.edgeColor}
              onClick={() => cycleEdgeColor(selectedEdges[0].id)}
            >
              <IconLine />
            </button>
            <button
              type="button"
              title={labels.edgeDash}
              onClick={() => toggleEdgeDashed(selectedEdges[0].id)}
            >
              <IconLine />
            </button>
            <button
              type="button"
              title={labels.edgeArrow}
              onClick={() => toggleEdgeArrow(selectedEdges[0].id)}
            >
              <IconArrow />
            </button>
          </>
        ) : null}
        <span className="zmd-board-toolbar-sep" />
        <button type="button" title={labels.fitView} onClick={fitView}>
          <IconFitView />
        </button>
        <button type="button" title={labels.autoLayout} onClick={autoLayout}>
          <IconLayout />
        </button>
        <span className={`zmd-board-save-state is-${saveState}`}>
          {saveState === "saving"
            ? labels.saving
            : saveState === "error"
              ? labels.saveFailed
              : labels.saved}
        </span>
      </div>
      <ReactFlow<AcademicNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={boardNodeTypes}
        defaultViewport={initial.viewport}
        fitView={!props.initialSnapshot}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        }}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={editing ? null : ["Backspace", "Delete"]}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesDraggable={!eraser && !editing}
        nodesConnectable={!eraser}
        onNodeClick={(event, node) => {
          if (!eraser) return;
          event.preventDefault();
          eraseNode(node.id);
        }}
        onNodeDoubleClick={(event, node) => {
          event.preventDefault();
          openNode(node);
        }}
        onEdgeClick={(event, edge) => {
          if (!eraser) return;
          event.preventDefault();
          eraseEdge(edge.id);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
        }}
        onPaneClick={() => {
          if (eraser) setEraser(false);
          setMenu(null);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, nodeId: "" });
        }}
        onNodeDragStart={pushHistory}
        onMoveEnd={(_, viewport) => {
          const previous = viewportRef.current;
          if (
            previous.x === viewport.x &&
            previous.y === viewport.y &&
            previous.zoom === viewport.zoom
          ) {
            return;
          }
          viewportRef.current = viewport;
          bump();
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {editing && editingNode && editingScreen ? (
        <div
          className="zmd-board-editor"
          style={{
            left: editingScreen.x,
            top: editingScreen.y,
            width: Math.max(editingNode.width ?? 200, 160),
          }}
        >
          <textarea
            autoFocus
            value={editing.value}
            rows={2}
            onChange={(event) =>
              setEditing({ nodeId: editing.nodeId, value: event.target.value })
            }
            onBlur={commitEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commitEdit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
          />
        </div>
      ) : null}
      {menu ? (
        <div
          className="zmd-board-context-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {menuNode ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  startEdit(menuNode.id);
                }}
              >
                <IconEdit />
                <span>{labels.editText}</span>
              </button>
              {(menuNode.data.itemID ||
                menuNode.data.attachmentID ||
                menuNode.data.noteID) && (
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    openNode(menuNode);
                  }}
                >
                  <IconOpen />
                  <span>{labels.openItem}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  copyNode(menuNode.id);
                }}
              >
                <IconCopy />
                <span>{labels.copy}</span>
              </button>
              <button type="button" onClick={() => deleteNode(menuNode.id)}>
                <IconTrash />
                <span>{labels.delete}</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => exportAs("png")}>
                <IconExport />
                <span>{labels.exportPng}</span>
              </button>
              <button type="button" onClick={() => exportAs("svg")}>
                <IconExport />
                <span>{labels.exportSvg}</span>
              </button>
              <button type="button" onClick={() => exportAs("md")}>
                <IconExport />
                <span>{labels.exportMarkdown}</span>
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
