/* ============================================================
   API Client - All backend communication
   ============================================================ */

const API_BASE = 'http://localhost:5000/api';

const Api = (() => {
  // ---- Token management ----
  const getToken = () => localStorage.getItem('sdt_token');
  const setToken = (t) => localStorage.setItem('sdt_token', t);
  const clearToken = () => localStorage.removeItem('sdt_token');

  // ---- Base fetch wrapper ----
  const request = async (method, path, data = null) => {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const token = getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (data) opts.body = JSON.stringify(data);

    const res = await fetch(`${API_BASE}${path}`, opts);
    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));

    if (!res.ok) {
      throw new Error(json.message || `HTTP ${res.status}`);
    }

    return json;
  };

  // ---- Auth ----
  const auth = {
    register: (data) => request('POST', '/auth/register', data),
    login: (data) => request('POST', '/auth/login', data),
    me: () => request('GET', '/auth/me'),
    updateTheme: (theme) => request('PATCH', '/auth/theme', { theme })
  };

  // ---- Collections ----
  const collections = {
    getAll: () => request('GET', '/collections'),
    create: (data) => request('POST', '/collections', data),
    update: (id, data) => request('PUT', `/collections/${id}`, data),
    delete: (id) => request('DELETE', `/collections/${id}`),
    export: async (id) => {
      const res = await fetch(`${API_BASE}/collections/${id}/export`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const blob = await res.blob();
      return blob;
    }
  };

  // ---- Requests ----
  const requests = {
    getAll: (collectionId) => {
      const qs = collectionId ? `?collection=${collectionId}` : '';
      return request('GET', `/requests${qs}`);
    },
    getById: (id) => request('GET', `/requests/${id}`),
    create: (data) => request('POST', '/requests', data),
    update: (id, data) => request('PUT', `/requests/${id}`, data),
    delete: (id) => request('DELETE', `/requests/${id}`),
    execute: (data) => request('POST', '/requests/execute', data)
  };

  // ---- History ----
  const history = {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('GET', `/history${qs ? '?' + qs : ''}`);
    },
    clear: () => request('DELETE', '/history'),
    deleteOne: (id) => request('DELETE', `/history/${id}`)
  };

  // ---- Health ----
  const health = () => request('GET', '/health');

  return { getToken, setToken, clearToken, auth, collections, requests, history, health };
})();
