// Thin API client for the OpenStatusLayer engine.
// Types are generated from the engine's OpenAPI contract via `npm run gen:types`
// into ./schema.d.ts — do not hand-write request/response shapes here.
import type { components } from './schema';

export type Status = components['schemas']['Status'];
export type Service = components['schemas']['Service'];
export type Dependency = components['schemas']['Dependency'];
export type ServiceStatus = components['schemas']['ServiceStatus'];
export type StatusGraph = components['schemas']['StatusGraph'];

// Same-origin path proxied to the engine (see app/engine/[...path]/route.ts).
export const API_BASE = '/engine';

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}
