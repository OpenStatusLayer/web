// Thin API client for the OpenStatusLayer engine.
// Types are generated from the engine's OpenAPI contract via `npm run gen:types`
// into ./api.d.ts — do not hand-write request/response shapes here.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

// Once gen:types has run, import the generated types like:
//   import type { components } from './api';
//   type StatusGraph = components['schemas']['StatusGraph'];
// and parameterize apiGet<StatusGraph>('/status').
