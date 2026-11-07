// Pure layered layout for the dependency map. Dependents sit to the left of
// what they depend on, so failures visibly flow right-to-left:
//   web  ->  api  ->  db
//                 ->  cache
// Column = length of the longest chain of dependents above a service. Cycles
// are allowed by the engine, so edges that close a cycle (back edges in a DFS)
// are ignored for layout; the rest is a DAG and each column is its longest
// path. A cycle therefore costs at most one extra column, not one per service.

export interface LayoutEdge {
  serviceId: string; // dependent
  dependsOnId: string; // dependency
}

export interface Point {
  x: number;
  y: number;
}

export const COLUMN_GAP = 240;
export const ROW_GAP = 90;

export function layoutColumns(ids: string[], edges: LayoutEdge[]): Map<string, number> {
  const known = new Set(ids);
  const deps = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (known.has(e.serviceId) && known.has(e.dependsOnId) && e.serviceId !== e.dependsOnId) {
      deps.get(e.serviceId)!.push(e.dependsOnId);
    }
  }

  // Iterative DFS (no recursion limit) that keeps only non-back edges and
  // records a post-order; reversed, that is a topological order of the DAG.
  const state = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0])); // 0 new, 1 on stack, 2 done
  const dag = new Map<string, string[]>(ids.map((id) => [id, []]));
  const post: string[] = [];
  for (const root of [...ids].sort()) {
    if (state.get(root) !== 0) continue;
    const stack: [string, number][] = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [id, i] = top;
      const next = deps.get(id)![i];
      if (next === undefined) {
        state.set(id, 2);
        post.push(id);
        stack.pop();
        continue;
      }
      top[1] += 1;
      const st = state.get(next);
      if (st === 1) continue; // back edge: closes a cycle, ignore for layout
      dag.get(id)!.push(next);
      if (st === 0) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  }

  const col = new Map(ids.map((id) => [id, 0]));
  for (const id of post.reverse()) {
    for (const d of dag.get(id)!) col.set(d, Math.max(col.get(d)!, col.get(id)! + 1));
  }
  return col;
}

/** Positions for every id; rows within a column are ordered by `label`. */
export function layout(
  nodes: { id: string; label: string }[],
  edges: LayoutEdge[],
): Map<string, Point> {
  const cols = layoutColumns(
    nodes.map((n) => n.id),
    edges,
  );
  const byCol = new Map<number, { id: string; label: string }[]>();
  for (const n of nodes) {
    const c = cols.get(n.id)!;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c)!.push(n);
  }
  const tallest = Math.max(0, ...[...byCol.values()].map((list) => list.length));
  const out = new Map<string, Point>();
  for (const [c, list] of byCol) {
    list.sort((a, b) => a.label.localeCompare(b.label));
    // Center shorter columns against the tallest one.
    const offset = ((tallest - list.length) * ROW_GAP) / 2;
    list.forEach((n, row) => out.set(n.id, { x: c * COLUMN_GAP, y: offset + row * ROW_GAP }));
  }
  return out;
}
