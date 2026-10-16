import React, { useEffect, useState } from 'react';
import { api, adminAudit } from '../api';

// Add to api.js endpoint first
const fetchAudit = (page = 1) => api.get(`admin/dashboard/index.php?action=audit&page=${page}`);

const useAudit = () => {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchAudit(page)
      .then(res => {
        setData(res.data || []);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  return { data, page, setPage, loading, error };
};

export default function AdminAudit() {
  const { data, page, setPage, loading, error } = useAudit();

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: '1.5rem' }}>Audit Log</h1>

      {loading && <p>Loading audit entries…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <>
          <div className="table-wrap">
            <table style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No audit entries found.
                    </td>
                  </tr>
                )}
                {data.map((entry, idx) => (
                  <tr key={entry.id}>
                    <td>{(page - 1) * 20 + idx + 1}</td>
                    <td><strong>{entry.username}</strong></td>
                    <td>{entry.action}</td>
                    <td>{entry.target_id || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry.details || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span style={{ alignSelf: 'center' }}>Page {page}</span>
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => p + 1)}
              disabled={data.length < 20}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}