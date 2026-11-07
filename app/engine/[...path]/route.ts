// Same-origin proxy to the engine: the browser calls /engine/*, this forwards
// to ENGINE_URL. The engine needs no CORS setup, and ENGINE_URL is read per
// request (not baked in at build time), so one build works in any environment.
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const FORWARD_HEADERS = ['accept', 'content-type'];

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const base = (process.env.ENGINE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  const target = `${base}/${params.path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      cache: 'no-store',
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({ error: 'engine unreachable' }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST };
