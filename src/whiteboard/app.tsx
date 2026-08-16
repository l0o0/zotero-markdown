/// <reference lib="dom" />

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  ConnectionMode,
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
  IconArrow,
  IconEllipse,
  IconEraser,
  IconFile,
  IconItem,
  IconLine,
  IconNote,
  IconPdf,
  IconRect,
  IconRedo,
  IconSave,
  IconText,
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
};

export interface WhiteboardAppProps {
  theme: WhiteboardTheme;
  labels?: WhiteboardLabels;
  initialSnapshot?: BoardDocument | Record<string, unknown> | null;
  onReady: (api: WhiteboardRuntime) => void;
  onChange: (rev: number) => void;
  onError: (message: string) => void;
  onSave: () => void;
  onPickItem: (requestId: string, nodeId: string, kind: "item" | "pdf") => void;
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
    })),
  };
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
      if (kind === "item" || kind === "pdf") {
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
            node.id === nodeId ? { ...node, data } : node,
          ),
        );
        bump();
      },
      rejectPick(requestId, message) {
        if (!pendingPicksRef.current.delete(requestId)) return;
        propsRef.current.onError(message);
      },
    };
    runtimeRef.current = runtime;
    propsRef.current.onReady(runtime);
  }, [applyDocument, bump, pushHistory, snapshotNow]);
  // onReady once: getSnapshot/undo read refs, so they stay current.

  useEffect(() => {
    setTheme(props.theme);
  }, [props.theme]);

  return (
    <div
      className={`zmd-board-host${eraser ? " is-eraser" : ""}`}
      data-theme={theme}
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
        deleteKeyCode={["Backspace", "Delete"]}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesDraggable={!eraser}
        nodesConnectable={!eraser}
        onNodeClick={(event, node) => {
          if (!eraser) return;
          event.preventDefault();
          eraseNode(node.id);
        }}
        onEdgeClick={(event, edge) => {
          if (!eraser) return;
          event.preventDefault();
          eraseEdge(edge.id);
        }}
        onPaneClick={() => {
          if (eraser) setEraser(false);
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
    </div>
  );
}
