import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { adminProducts, adminCategories, bulkUpdateProductImage, uploadImage, aiImages } from '../api';

function isPlaceholderImage(url) {
  if (!url) return true;
  return url.includes('cover.php') || url.includes('windows-10-enterprise-ltsc-2021.png');
}

export default function AdminProducts() {
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [bulkImageFile, setBulkImageFile] = useState(null);
  const [bulkImagePreview, setBulkImagePreview] = useState(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGeneratingId, setAiGeneratingId] = useState(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    adminCategories.list().then((r) => setCategories(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    adminProducts.list({ category_id: categoryFilter || undefined }).then((r) => {
      setList(r.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [categoryFilter]);

  useEffect(() => {
    setAiLoading(true);
    aiImages.status().then((r) => {
      setAiStatus(r.data || null);
    }).catch(() => {}).finally(() => setAiLoading(false));
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!openMenuId) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openMenuId]);

  const handleDelete = (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    adminProducts.delete(id).then(() => setList((prev) => prev.filter((p) => p.id !== id))).catch((e) => alert(e.message));
  };

  const handleBulkImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setBulkImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setBulkImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleBulkImageApply = async () => {
    if (!bulkImageFile) {
      alert('Please select an image first.');
      return;
    }
    if (!window.confirm('This will replace the image for ALL products. Continue?')) return;
    setBulkApplying(true);
    try {
      const r = await bulkUpdateProductImage(bulkImageFile);
      alert(r.message || `Updated ${r.count} products.`);
      setBulkImageFile(null);
      setBulkImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      adminProducts.list({ category_id: categoryFilter || undefined }).then((res) => setList(res.data || []));
    } catch (err) {
      alert(err.message || 'Failed');
    } finally {
      setBulkApplying(false);
    }
  };

  const handleGenerateAiImage = async (product) => {
    const confirmed = window.confirm(
      `Generate a unique AI image for "${product.name}"?\n\n` +
      'This calls DALL-E 3 (~$0.04) and updates the product image immediately.'
    );
    if (!confirmed) return;

    setAiGeneratingId(product.id);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || '/api'}/admin/ai-images/index.php?action=generate&id=${product.id}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin_token') || ''}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || resp.statusText);
      }

      // Update the product in the list with the new image URL
      setList((prev) => prev.map((p) =>
        p.id === product.id ? { ...p, image_url: data.image_url } : p
      ));

      // Refresh AI status
      aiImages.status().then((r) => setAiStatus(r.data || null)).catch(() => {});

      alert(`Image generated for "${product.name}"!`);
    } catch (err) {
      alert(err.message || 'AI generation failed. Ensure OPENAI_API_KEY is set on the server.');
    } finally {
      setAiGeneratingId(null);
    }
  };

  const handleUploadProductImage = async (product) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        await adminProducts.update({ id: product.id, image_url: url });
        setList((prev) => prev.map((p) =>
          p.id === product.id ? { ...p, image_url: url } : p
        ));
        alert('Image uploaded and applied to this product.');
      } catch (err) {
        alert(err.message || 'Upload failed');
      }
    };
    input.click();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem' }}>Products</h1>
        <Link to="/admin/products/new" className="btn btn-primary">Add product</Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Set image for all products</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Upload an image to replace the product image for every product in your store. Use this for a default product box image (e.g. Windows 8.1 Pro Retail Key).
        </p>
        <div className="admin-bulk-image-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleBulkImageSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose image
          </button>
          {bulkImagePreview && (
            <>
              <img src={bulkImagePreview} alt="Preview" style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)' }} />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleBulkImageApply}
                disabled={bulkApplying}
              >
                {bulkApplying ? 'Applying…' : 'Apply to all products'}
              </button>
            </>
          )}
      </div>
    </div>

    <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>AI Product Images</h3>
      {aiLoading ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Checking image coverage…</p>
      ) : aiStatus ? (
        <>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            {aiStatus.total || 0} active products · {aiStatus.needing_images || 0} need images · {aiStatus.with_images || 0} have images
          </p>
          {aiStatus.needing_images > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const confirmed = window.confirm(
                    `Generate AI images for ${aiStatus.needing_images} products using DALL-E 3?\n\n` +
                    'This will create a Python script run on the server. Estimate: $0.04/image × ' + aiStatus.needing_images + ` ≈ $${(aiStatus.needing_images * 0.04).toFixed(2)}.\n` +
                    'Run the CLI command locally and upload results after.'
                  );
                  if (!confirmed) return;
                  alert('Copy and run this command in your terminal:\n\npython scripts/ai_images.py all\n\nThen return here and refresh.');
                }}
              >
                Generate via CLI (DALL-E 3)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    const r = await aiImages.getPrompt(list[0]?.id || 1);
                    if (r.success) {
                      navigator.clipboard.writeText(r.prompt);
                      alert(`Prompt for "${r.product?.name}" copied to clipboard:\n\n${r.prompt.substring(0, 200)}...`);
                    }
                  } catch (e) {
                    alert(e.message);
                  }
                }}
              >
                Copy sample prompt
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                CLI command: <code>python scripts/ai_images.py all</code>
              </span>
            </div>
          )}
          {aiStatus.needing_images === 0 && (
            <p style={{ fontSize: '0.875rem', color: 'var(--success)' }}>All products have images. No action needed.</p>
          )}
        </>
      ) : (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Unable to fetch status.</p>
      )}
    </div>

    <div className="form-group" style={{ maxWidth: 280, marginBottom: '1rem' }}>
        <label>Category</label>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Image</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th style={{ width: 120 }}>AI Image</th>
                  <th>Featured</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const placeholder = isPlaceholderImage(p.image_url);
                  return (
                  <tr key={p.id}>
                    <td>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="admin-product-thumb" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }} />
                      ) : (
                        <span className="admin-product-no-img" style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px dashed var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 10 }} title="No image">—</span>
                      )}
                    </td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.category_name}</td>
                    <td>₹{p.price_min}{p.price_max > p.price_min ? ` – ₹${p.price_max}` : ''}</td>
                    <td>
                      {placeholder ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }}></span>
                          Placeholder
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }}></span>
                          Custom
                        </span>
                      )}
                    </td>
                    <td>{p.is_featured ? 'Yes' : 'No'}</td>
                    <td>{p.is_active ? 'Yes' : 'No'}</td>
                    <td style={{ position: 'relative' }}>
                      <div ref={openMenuId === p.id ? menuRef : null} style={{ display: 'inline-block' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label="Actions"
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId((cur) => (cur === p.id ? null : p.id));
                          }}
                          style={{ width: 36, padding: 0, justifyContent: 'center' }}
                        >
                          ⋮
                        </button>
                        {openMenuId === p.id && (
                          <div
                            role="menu"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 'calc(100% + 6px)',
                              minWidth: 160,
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 10,
                              boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
                              padding: 6,
                              zIndex: 50,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              to={`/admin/products/edit/${p.id}`}
                              role="menuitem"
                              className="btn btn-secondary btn-sm"
                              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                              onClick={() => setOpenMenuId(null)}
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              className="btn btn-secondary btn-sm"
                              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                              onClick={() => {
                                setOpenMenuId(null);
                                handleUploadProductImage(p);
                              }}
                            >
                              Upload image
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="btn btn-secondary btn-sm"
                              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                              onClick={() => {
                                setOpenMenuId(null);
                                handleGenerateAiImage(p);
                              }}
                              disabled={aiGeneratingId === p.id}
                            >
                              {aiGeneratingId === p.id ? 'Generating…' : 'AI generate'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="btn btn-danger btn-sm"
                              style={{ width: '100%', justifyContent: 'flex-start' }}
                              onClick={() => {
                                setOpenMenuId(null);
                                handleDelete(p.id, p.name);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No products yet. Add one to get started.</p>}
        </div>
      )}
    </>
  );
}
