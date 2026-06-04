# OpenStatusLayer — Web

The frontend of **OpenStatusLayer**: the dependency-map UI and public status pages for the
service-status intelligence platform. The backend engine lives in
[`OpenStatusLayer/engine`](https://github.com/OpenStatusLayer/engine).

## Stack

- [Next.js](https://nextjs.org/) (App Router) + React + TypeScript
- [React Flow](https://reactflow.dev/) for the dependency-graph visualization
- Types generated from the engine's OpenAPI contract — no hand-written API types

## The contract

The engine owns the API contract at
[`engine/openapi/openstatuslayer.yaml`](https://github.com/OpenStatusLayer/engine/blob/main/openapi/openstatuslayer.yaml).
We generate `src/lib/api.d.ts` from it so the UI and engine never drift:

```bash
npm run gen:types
```

This pulls the spec straight from the engine repo's `main` branch. Re-run it whenever the
engine API changes.

## Quickstart

```bash
cp .env.example .env.local   # point NEXT_PUBLIC_API_URL at the engine
npm install
npm run gen:types
npm run dev                  # http://localhost:3000
```

The engine must be running (default http://localhost:8080) for live data.

## License

Apache-2.0. See [LICENSE](LICENSE).
