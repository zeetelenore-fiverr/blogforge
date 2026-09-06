export const dynamic = 'force-dynamic';

/**
 * A React page that touches nothing: no settings, no database, no components.
 * It still renders through the root layout, so it is the direct analogue of a
 * minimal Next app -- which serves in 450ms on this same Vercel team. If this
 * hangs, rendering itself is at fault; if it serves, the fault is in what the
 * other pages load.
 */
export default function Ping() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>ping ok</h1>
      <p>node {process.version}</p>
      <p>{new Date().toISOString()}</p>
    </main>
  );
}
