// Use relative /api when served with PHP (same origin). For Vite dev, set proxy in vite.config to your PHP backend path.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const token = localStorage.getItem('admin_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem('admin_token');
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
      window.location.href = `${base}/admin/login`;
      throw new Error(data.message || 'Session expired. Please log in again.');
    }
  }
  const errMsg = data.message || (res.status === 400 ? 'Username and password required' : null) || res.statusText || 'Request failed';
  if (!res.ok) throw new Error(errMsg);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// Public store APIs (no auth)
export const products = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`products/index.php${q ? `?${q}` : ''}`);
  },
  get: (idOrSlug) => {
    const isNum = /^\d+$/.test(String(idOrSlug));
    const param = isNum ? `id=${encodeURIComponent(idOrSlug)}` : `slug=${encodeURIComponent(idOrSlug)}`;
    return api.get(`products/single.php?${param}`);
  },
};

export const categories = {
  list: () => api.get('categories/index.php'),
};

export const blog = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`blog/index.php${q ? `?${q}` : ''}`);
  },
  get: (slug) => api.get(`blog/single.php?slug=${encodeURIComponent(slug)}`),
};

// Site settings (public)
export const settings = {
  get: () => api.get('settings/index.php'),
};

// Admin settings (requires auth)
export const adminSettings = {
  update: (data) => api.put('admin/settings/update.php', data),
};

export const orders = {
  create: (data) => api.post('orders/create.php', data),
  get: (orderNumber) => api.get(`orders/get.php?order_number=${encodeURIComponent(orderNumber)}`),
};

// Auth - send as form-urlencoded so PHP $_POST is set (works when proxy forwards request)
export const auth = {
  login: async (username, password) => {
    const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    const url = `${base}/auth/login.php`;
    const body = new URLSearchParams({
      username: String(username),
      password: String(password),
    }).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    const errMsg = data.message || data.error || (res.status === 400 ? 'Username and password required' : null) || res.statusText || 'Request failed';
    if (!res.ok) throw new Error(errMsg);
    return data;
  },
};

// Admin (requires token)
const admin = (entity) => ({
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`admin/${entity}/index.php${q ? `?${q}` : ''}`);
  },
  get: (id) => entity === 'products' ? api.get(`admin/products/single.php?id=${id}`) : Promise.reject(new Error('Not supported')),
  create: (body) => api.post(`admin/${entity}/create.php`, body),
  update: (body) => api.put(`admin/${entity}/update.php`, body),
  delete: (id) => api.delete(`admin/${entity}/delete.php?id=${id}`),
});

export const adminProducts = admin('products');
export const adminCategories = admin('categories');
export const adminOrders = admin('orders');
export const adminBlog = admin('blog');

// Admin: AI image generation helpers
export const aiImages = {
  status: () => api.get('admin/ai-images/index.php?action=status'),
  listProducts: () => api.get('admin/ai-images/index.php?action=products_needing_images'),
  getPrompt: (id) => api.get(`admin/ai-images/index.php?action=prompt&id=${encodeURIComponent(id)}`),
};

export async function bulkUpdateProductImage(fileOrUrl) {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const url = `${base}/admin/products/bulk_image.php`;
  const token = localStorage.getItem('admin_token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body;
  if (typeof fileOrUrl === 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ image_url: fileOrUrl });
  } else {
    const formData = new FormData();
    formData.append('image', fileOrUrl);
    body = formData;
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText || 'Failed');
  return data;
}

export async function bulkUpdateCategoryImage(fileOrUrl) {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const url = `${base}/admin/categories/bulk_image.php`;
  const token = localStorage.getItem('admin_token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body;
  if (typeof fileOrUrl === 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ image_url: fileOrUrl });
  } else {
    const formData = new FormData();
    formData.append('image', fileOrUrl);
    body = formData;
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText || 'Failed');
  return data;
}

export async function uploadImage(file) {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const url = `${base}/admin/upload.php`;
  const formData = new FormData();
  formData.append('image', file);
  const token = localStorage.getItem('admin_token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', body: formData, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText || 'Upload failed');
  return data.url;
}
