import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';

export default function AdminLayout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('admin_token');
    navigate('/admin/login');
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div style={{ padding: '0 1rem 1rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <Link to="/admin" style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', textDecoration: 'none' }}>Nepal TechGuard</Link>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Admin</span>
        </div>
        <nav style={{ padding: '0 0.75rem' }}>
          <Link to="/admin/dashboard" style={linkStyle}>Dashboard</Link>
          <Link to="/admin/orders" style={linkStyle}>Orders</Link>
          <Link to="/admin/blog" style={linkStyle}>Blog</Link>
          <Link to="/admin/products" style={linkStyle}>Products</Link>
          <Link to="/admin/products/new" style={linkStyle}>Add Product</Link>
          <Link to="/admin/ai-seo" style={{ ...linkStyle, color: 'var(--primary)', fontWeight: 'bold' }}>✨ AI SEO & Images</Link>
          <Link to="/admin/categories" style={linkStyle}>Categories</Link>
          <Link to="/admin/audit" style={linkStyle}>Audit Log</Link>
          <Link to="/admin/notifications" style={linkStyle}>Notifications</Link>
          <Link to="/admin/settings" style={linkStyle}>Footer & Settings</Link>
          <Link to="/admin/pages" style={linkStyle}>Pages</Link>
        </nav>
        <div style={{ padding: '1rem 0.75rem', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          <Link to="/" style={linkStyle}>View Store</Link>
          <button type="button" onClick={logout} style={{ ...linkStyle, background: 'none', border: 'none', width: '100%', textAlign: 'left', color: 'var(--danger)', cursor: 'pointer' }}>Logout</button>
        </div>
      </aside>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}

const linkStyle = {
  display: 'block',
  padding: '0.5rem 0.75rem',
  borderRadius: 'var(--radius)',
  color: 'var(--text-muted)',
  textDecoration: 'none',
  marginBottom: 4,
  fontSize: 14,
};
