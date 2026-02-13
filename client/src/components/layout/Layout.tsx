import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function Layout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
