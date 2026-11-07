// Pure layered layout for the dependency map. Dependents sit to the left of
// what they depend on, so failures visibly flow right-to-left:
//   web  ->  api  ->  db
//                 ->  cache
// Column = length of the longest chain of dependents above a service. Cycles are
// tolerated: relaxation stops after |services| passes.

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
  const usable = edges.filter(
    (e) => known.has(e.serviceId) && known.has(e.dependsOnId) && e.serviceId !== e.dependsOnId,
  );
  const col = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    for (const e of usable) {
      const want = col.get(e.serviceId)! + 1;
      if (want > col.get(e.dependsOnId)! && want < ids.length) {
        col.set(e.dependsOnId, want);
        changed = true;
      }
    }
    if (!changed) break;
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
