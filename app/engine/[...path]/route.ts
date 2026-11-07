// Same-origin, read-only proxy to the engine: the browser calls /engine/*, this
// forwards to ENGINE_URL. The engine needs no CORS setup, and ENGINE_URL is read
// per request (not baked in at build time), so one build works in any
// environment.
//
// The engine has no auth yet and this app will serve public status pages, so
// the proxy only forwards GETs to an allowlist of read endpoints. Writes
// (/ingest, /incidents, CRUD) must go to the engine directly, never through
// a page anyone can load.
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const READ_ROOTS = new Set(['status', 'services', 'dependencies', 'systems', 'incidents', 'health']);
const UPSTREAM_TIMEOUT_MS = 8_000;

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = params.path;
  // Reject dot segments so a request can't climb out of ENGINE_URL's path
  // prefix (e.g. /engine/%2e%2e/x when ENGINE_URL is http://host/api).
  if (
    segments.length === 0 ||
    !READ_ROOTS.has(segments[0]) ||
    segments.some((s) => s === '' || s === '.' || s === '..')
  ) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const base = (process.env.ENGINE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  const target = `${base}/${segments.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  try {
    const res = await fetch(target, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    const timedOut = (err as Error).name === 'TimeoutError';
    return Response.json(
      { error: timedOut ? 'engine timed out' : 'engine unreachable' },
      { status: timedOut ? 504 : 502 },
    );
  }
}
