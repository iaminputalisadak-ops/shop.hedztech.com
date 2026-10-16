import React, { useEffect, useState } from 'react';
import { api } from '../api';

const SETTINGS_KEYS = {
  CHART_RANGE: 'dashboard_chart_range',
  ITEMS_PER_PAGE: 'dashboard_items_per_page',
  LAST_SYNCED: 'dashboard_last_sync',
};

const defaultSettings = {
  [SETTINGS_KEYS.CHART_RANGE]: '30',
  [SETTINGS_KEYS.ITEMS_PER_PAGE]: '20',
  [SETTINGS_KEYS.LAST_SYNCED]: '',
};

export default function AdminSettings() {
  const [editMode, setEditMode] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    let updated = { ...defaultSettings };
    const promises = Object.values(SETTINGS_KEYS).map(key =>
      api.get(`admin/dashboard/index.php?action=settings&key=${key}`)
        .then(res => {
          if (res.success && res.data?.value !== null) {
            updated[key] = res.data.value;
          }
        })
        .catch(() => {})
    );
    Promise.all(promises).then(() => {
      setSettings(updated);
      setLoading(false);
    });
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSetting = async (key) => {
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      await api.post('admin/dashboard/index.php?action=settings', { key, value: settings[key] });
      setSuccess('Saved!');
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      await Promise.all(
        Object.entries(settings).map(([key, value]) =>
          api.post('admin/dashboard/index.php?action=settings', { key, value })
        )
      );
      setSuccess('All settings saved!');
      setEditMode(false);
    } catch (e) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading settings…</p>;

  return (
    <>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: '1.5rem' }}>Dashboard Settings</h1>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {success && <p style={{ color: 'var(--success)' }}>{success}</p>}

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <strong>Chart Range (days):</strong>
          {editMode ? (
            <input
              type="number"
              value={settings[SETTINGS_KEYS.CHART_RANGE]}
              onChange={e => handleChange(SETTINGS_KEYS.CHART_RANGE, e.target.value)}
              style={{ width: 80, padding: '0.25rem' }}
              min="1"
              max="365"
            />
          ) : (
            <span>{settings[SETTINGS_KEYS.CHART_RANGE]}</span>
          )}
          {editMode && <button className="btn btn-primary btn-sm" onClick={() => saveSetting(SETTINGS_KEYS.CHART_RANGE)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
          {!editMode && <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}>Edit</button>}
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <strong>Items Per Page:</strong>
          {editMode ? (
            <input
              type="number"
              value={settings[SETTINGS_KEYS.ITEMS_PER_PAGE]}
              onChange={e => handleChange(SETTINGS_KEYS.ITEMS_PER_PAGE, e.target.value)}
              style={{ width: 80, padding: '0.25rem' }}
              min="5"
              max="100"
            />
          ) : (
            <span>{settings[SETTINGS_KEYS.ITEMS_PER_PAGE]}</span>
          )}
          {editMode && <button className="btn btn-primary btn-sm" onClick={() => saveSetting(SETTINGS_KEYS.ITEMS_PER_PAGE)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <strong>Last Sync:</strong>
          <span>{settings[SETTINGS_KEYS.LAST_SYNCED] || 'Never'}</span>
        </div>
      </div>

      {editMode && (
        <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
          {saving ? 'Saving all…' : 'Save All Settings'}
        </button>
      )}
    </>
  );
}