import { Link } from 'react-router-dom';

export function Header() {
  return (
    <header style={{
      padding: '12px 24px',
      background: '#111',
      borderBottom: '1px solid #333',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <Link to="/" style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
        Adventure Racing
      </Link>
      <span style={{ color: '#666', fontSize: 14 }}>3D Track Viewer</span>
    </header>
  );
}
