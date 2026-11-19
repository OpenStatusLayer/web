import { StatusMap } from '@/components/StatusMap';

export default function Home() {
  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb' }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>OpenStatusLayer</h1>
        <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 13 }}>
          Dependency-aware status — the map shows blast radius, not just a flat list.
        </p>
      </header>
      <div style={{ flex: 1 }}>
        <StatusMap />
      </div>
    </main>
  );
}
