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
  type BoardNodeKind,
} from "../modules/whiteboard/snapshot";
import { boardNodeTypes, type AcademicNode } from "./nodes";

const DEFAULT_LABELS: WhiteboardLabels = {
  addItem: "Item",
  addNote: "Note",
  addPdf: "PDF",
  addFile: "File",
};

export interface WhiteboardAppProps {
  theme: WhiteboardTheme;
  labels?: WhiteboardLabels;
  initialSnapshot?: BoardDocument | Record<string, unknown> | null;
  onReady: (api: WhiteboardRuntime) => void;
  onChange: (rev: number) => void;
  onError: (message: string) => void;
}

export interface WhiteboardRuntime {
  setTheme: (theme: WhiteboardTheme) => void;
  setLabels: (labels: WhiteboardLabels) => void;
  loadSnapshot: (snapshot: BoardDocument | Record<string, unknown>) => void;
  getSnapshot: () => BoardDocument;
  undo: () => void;
  redo: () => void;
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
  const viewportRef = useRef<Viewport>(
    initial.viewport ?? { x: 0, y: 0, zoom: 1 },
  );
  const revRef = useRef(0);
  const historyRef = useRef<BoardDocument[]>([]);
  const futureRef = useRef<BoardDocument[]>([]);
  const flowRef = useRef<ReactFlowInstance<AcademicNode> | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

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
      bump();
    },
    [bump, pushHistory],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type === "remove")) pushHistory();
      setEdges((current) => applyEdgeChanges(changes, current));
      bump();
    },
    [bump, pushHistory],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      setEdges((current) => addEdge({ ...connection, id: newId("edge") }, current));
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
      setNodes((current) => [
        ...current,
        toFlow({
          v: 1,
          engine: "xyflow",
          nodes: [createBoardNode(kind, center, newId(kind))],
          edges: [],
        }).nodes[0],
      ]);
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
    };
    propsRef.current.onReady(runtime);
  }, [applyDocument, bump, snapshotNow]);
  // onReady once: getSnapshot/undo read refs, so they stay current.

  useEffect(() => {
    setTheme(props.theme);
  }, [props.theme]);

  return (
    <div className="zmd-board-host" data-theme={theme}>
      <div className="zmd-board-toolbar">
        <button type="button" onClick={() => addNode("item")}>
          {labels.addItem}
        </button>
        <button type="button" onClick={() => addNode("note")}>
          {labels.addNote}
        </button>
        <button type="button" onClick={() => addNode("pdf")}>
          {labels.addPdf}
        </button>
        <button type="button" onClick={() => addNode("attachment")}>
          {labels.addFile}
        </button>
      </div>
      <ReactFlow<AcademicNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={boardNodeTypes}
        defaultViewport={initial.viewport}
        fitView={!props.initialSnapshot}
        deleteKeyCode={["Backspace", "Delete"]}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={pushHistory}
        onMoveEnd={(_, viewport) => {
          viewportRef.current = viewport;
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
