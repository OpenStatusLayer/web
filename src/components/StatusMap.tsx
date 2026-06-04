'use client';

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';

// Placeholder topology. Day 8–9: replace with live data from GET /status and color
// nodes by derived status, highlighting the blast radius of any degraded service.
const statusColor: Record<string, string> = {
  operational: '#16a34a',
  degraded: '#d97706',
  down: '#dc2626',
};

function node(id: string, label: string, status: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    data: { label },
    style: {
      borderColor: statusColor[status],
      borderWidth: 2,
      borderRadius: 8,
      padding: 8,
      fontSize: 12,
    },
  };
}

export function StatusMap() {
  const nodes = useMemo<Node[]>(
    () => [
      node('web', 'Web', 'degraded', 0, 0),
      node('api', 'API', 'degraded', 220, 0),
      node('db', 'Postgres', 'down', 440, -60),
      node('cache', 'Redis', 'operational', 440, 60),
    ],
    [],
  );
  const edges = useMemo<Edge[]>(
    () => [
      { id: 'web-api', source: 'web', target: 'api', label: 'hard' },
      { id: 'api-db', source: 'api', target: 'db', label: 'hard' },
      { id: 'api-cache', source: 'api', target: 'cache', label: 'soft' },
    ],
    [],
  );

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView>
      <Background />
      <Controls />
    </ReactFlow>
  );
}
