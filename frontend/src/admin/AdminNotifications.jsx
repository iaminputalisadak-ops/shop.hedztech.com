import React, { useEffect, useState } from 'react';
import { api } from '../api';

const useNotifications = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get('admin/dashboard/index.php?action=notifications')
      .then(res => {
        setData(res.data || []);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error, refresh: () => {
    setLoading(true);
    api.get('admin/dashboard/index.php?action=notifications')
      .then(res => setData(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }};
};

export default function AdminNotifications() {
  const { data, loading, error } = useNotifications();

  const markAsRead = async (id) => {
    try {
      await api.post('admin/dashboard/index.php?action=mark_notification', { id });
    } catch (e) {
      console.error('Failed to mark notification', e);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const getBadgeClass = (type) => {
    switch (type) {
      case 'warning': return 'badge-warning';
      case 'error': return 'badge-error';
      default: return 'badge-info';
    }
  };

  return (
    <>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: '1.5rem' }}>Notifications</h1>

      {loading && <p>Loading notifications…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <div className="table-wrap">
          <table style={{ minWidth: 400 }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Message</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No notifications.
                  </td>
                </tr>
              )}
              {data.map((n) => (
                <tr key={n.id} style={{ backgroundColor: n.is_read ? 'var(--bg)' : '#fff3cd' }}>
                  <td>
                    <span className={`badge badge-${n.type}`}>{n.type}</span>
                  </td>
                  <td>{n.message}</td>
                  <td>
                    <span className="badge" style={{ background: n.is_read ? '#6c757d' : '#0d6efd', color: '#fff' }}>
                      {n.is_read ? 'Read' : 'Unread'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(n.created_at)}</td>
                  <td>
                    {!n.is_read && (
                      <button className="btn btn-secondary btn-sm" onClick={() => markAsRead(n.id)}>
                        Mark Read
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}