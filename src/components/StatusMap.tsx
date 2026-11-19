'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Position,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { apiGet, type Service, type ServiceStatus, type Status, type StatusGraph } from '@/lib/api';
import { layout } from '@/lib/layout';

const POLL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 8_000;

const COLOR: Record<Status, string> = {
  operational: '#16a34a',
  degraded: '#d97706',
  down: '#dc2626',
};
const TINT: Record<Status, string> = {
  operational: '#f0fdf4',
  degraded: '#fffbeb',
  down: '#fef2f2',
};
const LABEL: Record<Status, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
};

interface Snapshot {
  graph: StatusGraph;
  names: Map<string, string>;
}

function useStatus() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      // /status carries ids only; /services supplies display names.
      const [graph, services] = await Promise.all([
        apiGet<StatusGraph>('/status', signal),
        apiGet<Service[]>('/services', signal),
      ]);
      setSnapshot({ graph, names: new Map(services.map((s) => [s.id, s.name])) });
      setError(null);
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') return; // unmounted
      setError(e.name === 'TimeoutError' ? 'request timed out' : e.message);
    }
  }, []);

  // One request in flight at a time: the next poll is scheduled only after the
  // previous one settles, and each poll times out, so a slow engine can't pile
  // up requests or have an old response overwrite a newer one.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await load(AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]));
      if (!controller.signal.aborted) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return { snapshot, error };
}

function NodeLabel({ name, s }: { name: string; s: ServiceStatus }) {
  const inherited = s.derivedStatus !== s.directStatus;
  return (
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ color: COLOR[s.derivedStatus], fontSize: 11 }}>{LABEL[s.derivedStatus]}</div>
      {inherited && (
        <div style={{ color: '#6b7280', fontSize: 10 }}>own check: {LABEL[s.directStatus].toLowerCase()}</div>
      )}
    </div>
  );
}

export function StatusMap() {
  const { snapshot, error } = useStatus();
  const [selected, setSelected] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map((snapshot?.graph.services ?? []).map((s) => [s.serviceId, s])),
    [snapshot],
  );
  const nameOf = useCallback(
    (id: string) => snapshot?.names.get(id) ?? id.slice(0, 8),
    [snapshot],
  );

  // Drop a selection that no longer exists (e.g. service deleted).
  const current = selected && byId.has(selected) ? byId.get(selected)! : null;
  const blast = useMemo(() => new Set(current?.blastRadius ?? []), [current]);

  const { nodes, edges } = useMemo(() => {
    if (!snapshot) return { nodes: [] as Node[], edges: [] as Edge[] };
    const services = snapshot.graph.services;
    const positions = layout(
      services.map((s) => ({ id: s.serviceId, label: nameOf(s.serviceId) })),
      snapshot.graph.edges,
    );
    const focus = (id: string) => !current || id === current.serviceId || blast.has(id);

    const nodes: Node[] = services.map((s) => {
      const isSelected = current?.serviceId === s.serviceId;
      const inBlast = blast.has(s.serviceId);
      return {
        id: s.serviceId,
        position: positions.get(s.serviceId) ?? { x: 0, y: 0 },
        // Left-to-right layout: dependents on the left, dependencies on the right.
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: <NodeLabel name={nameOf(s.serviceId)} s={s} /> },
        style: {
          border: `2px solid ${COLOR[s.derivedStatus]}`,
          background: TINT[s.derivedStatus],
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
          width: 150,
          opacity: focus(s.serviceId) ? 1 : 0.3,
          boxShadow: isSelected
            ? `0 0 0 4px ${COLOR[s.derivedStatus]}55`
            : inBlast
              ? '0 0 0 3px #dc262633'
              : undefined,
          cursor: 'pointer',
        },
      };
    });

    const edges: Edge[] = snapshot.graph.edges
      .filter((e) => byId.has(e.serviceId) && byId.has(e.dependsOnId))
      .map((e) => {
        const dep = byId.get(e.dependsOnId)!.derivedStatus;
        const carries = dep !== 'operational'; // failure flowing to the dependent
        const color = carries ? COLOR[e.kind === 'soft' ? 'degraded' : dep] : '#9ca3af';
        const visible = focus(e.serviceId) && focus(e.dependsOnId);
        return {
          id: e.id,
          source: e.serviceId,
          target: e.dependsOnId,
          label: e.kind,
          animated: carries,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: {
            stroke: color,
            strokeWidth: carries ? 2 : 1.25,
            strokeDasharray: e.kind === 'soft' ? '6 4' : undefined,
            opacity: visible ? 1 : 0.15,
          },
          labelStyle: { fontSize: 10, fill: '#6b7280' },
        };
      });

    return { nodes, edges };
  }, [snapshot, byId, current, blast, nameOf]);

  // React Flow measures each node after it renders and hides nodes it hasn't
  // measured. Nodes are rebuilt on every poll and selection, so keep them in
  // React Flow's state (which records measured sizes via onNodesChange) and
  // carry each node's measured size over to its rebuilt version.
  const [rfNodes, setRfNodes, applyNodeChanges] = useNodesState([]);
  // Only let React Flow record measured sizes. Removal (Backspace) and its own
  // selection state would fight the engine-driven nodes and our selection.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => applyNodeChanges(changes.filter((c) => c.type === 'dimensions')),
    [applyNodeChanges],
  );
  useEffect(() => {
    setRfNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return nodes.map((n) => {
        const p = old.get(n.id);
        return p ? { ...n, width: p.width, height: p.height } : n;
      });
    });
  }, [nodes, setRfNodes]);

  const graphKey = useMemo(
    () => (snapshot?.graph.services ?? []).map((s) => s.serviceId).sort().join(','),
    [snapshot],
  );

  const counts = useMemo(() => {
    const c: Record<Status, number> = { operational: 0, degraded: 0, down: 0 };
    for (const s of snapshot?.graph.services ?? []) c[s.derivedStatus] += 1;
    return c;
  }, [snapshot]);

  return (
    <div className="osl-layout">
      <div className="osl-map">
        <div style={{ position: 'absolute', zIndex: 5, top: 12, left: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(COLOR) as Status[]).map((st) => (
            <span key={st} style={pill(COLOR[st])}>
              {LABEL[st]} {counts[st]}
            </span>
          ))}
          <span style={{ ...pill('#6b7280'), borderStyle: 'dashed' }}>dashed = soft dependency</span>
        </div>
        {error && (
          <div role="alert" style={banner}>
            Can&apos;t reach the engine ({error}).{' '}
            {snapshot ? 'Showing the last status received.' : 'Is it running? Retrying every 10s.'}
          </div>
        )}
        {snapshot && snapshot.graph.services.length === 0 && (
          <div style={empty}>No services yet. Run <code>npm run seed</code> in the engine to load a demo topology.</div>
        )}
        <ReactFlow
          key={graphKey}
          nodes={rfNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          deleteKeyCode={null}
          nodesDraggable={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesConnectable={false}
          onNodeClick={(_, n) => setSelected((cur) => (cur === n.id ? null : n.id))}
          onPaneClick={() => setSelected(null)}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="osl-panel">
        {current ? (
          <Details s={current} nameOf={nameOf} onPick={setSelected} />
        ) : (
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            <p style={{ marginTop: 0 }}>Click a service to see why it&apos;s in its state and what it takes down.</p>
            {snapshot?.graph.computedAt && (
              <p>Computed {new Date(snapshot.graph.computedAt).toLocaleTimeString()} · refreshes every 10s</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Details({
  s,
  nameOf,
  onPick,
}: {
  s: ServiceStatus;
  nameOf: (id: string) => string;
  onPick: (id: string) => void;
}) {
  const radius = s.blastRadius ?? [];
  return (
    <div style={{ fontSize: 13 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{nameOf(s.serviceId)}</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0 }}>
        <dt style={dt}>Status</dt>
        <dd style={{ margin: 0, color: COLOR[s.derivedStatus], fontWeight: 600 }}>{LABEL[s.derivedStatus]}</dd>
        <dt style={dt}>Own check</dt>
        <dd style={{ margin: 0, color: COLOR[s.directStatus] }}>{LABEL[s.directStatus]}</dd>
      </dl>
      {s.reason && (
        <>
          <h3 style={h3}>Why</h3>
          <p style={{ margin: 0 }}>{s.reason}</p>
        </>
      )}
      <h3 style={h3}>Blast radius</h3>
      {radius.length === 0 ? (
        <p style={{ margin: 0, color: '#6b7280' }}>
          {s.derivedStatus === 'operational' ? 'Healthy — not impairing anything.' : 'Not impairing any other service.'}
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 6px' }}>
            Impairs {radius.length} other service{radius.length === 1 ? '' : 's'} on its own:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {radius.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => onPick(id)} style={linkButton}>
                  {nameOf(id)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const pill = (color: string): React.CSSProperties => ({
  border: `1px solid ${color}`,
  color,
  background: '#fff',
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 12,
});
const banner: React.CSSProperties = {
  position: 'absolute',
  zIndex: 5,
  bottom: 12,
  left: 12,
  right: 12,
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
};
const empty: React.CSSProperties = {
  position: 'absolute',
  zIndex: 4,
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: '#6b7280',
  fontSize: 14,
  pointerEvents: 'none',
};
const dt: React.CSSProperties = { color: '#6b7280' };
const h3: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', color: '#6b7280', margin: '16px 0 6px' };
const linkButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#2563eb',
  cursor: 'pointer',
  font: 'inherit',
};
