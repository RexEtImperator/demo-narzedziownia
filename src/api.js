import supabase from './utils/supabase';
import { sanitizeObject } from './utils/sanitize';

// Use environment variable for API base URL in development
// If not set, use relative URLs (works with Vite proxy and same-origin deployments)
let API_BASE_URL = '';
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
  API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
}
// Ensure cookie consistency in dev: always use proxy (relative) on port 3001
try {
  if (typeof window !== 'undefined') {
    const port = String(window.location.port || '');
    if (port === '3001') {
      // In development (port 3001), always use relative URL to leverage Vite proxy.
      // This ensures cookies work correctly even when accessing via IP (e.g. 192.168.x.x).
      API_BASE_URL = '';
    }
  }
} catch (_) { /* noop */ }

const IS_SUPABASE_MODE = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DB_SOURCE === 'supabase';

let _handleSupabaseRequest = null;
const getHandleSupabaseRequest = async () => {
  if (_handleSupabaseRequest) return _handleSupabaseRequest;
  const mod = await import('./api/supabaseMapping');
  _handleSupabaseRequest = mod?.handleSupabaseRequest || null;
  return _handleSupabaseRequest;
};

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.token = null;
    this.csrfToken = null;
    this._refreshInFlight = null;
  }

  setToken(token) {
    this.token = token || null;
  }

  setRefreshToken() { /* no-op: refresh token lives in httpOnly cookie */ }

  async fetchCsrfToken() {
    if (IS_SUPABASE_MODE) return null;
    if (this.csrfToken) return this.csrfToken;
    try {
      const resp = await fetch(`${this.baseURL}/api/auth/csrf-token`, {
        method: 'GET',
        credentials: 'include'
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.token) {
          this.csrfToken = data.token;
          return data.token;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch CSRF token', e);
    }
    return null;
  }

  async ensureToken() {
    if (IS_SUPABASE_MODE) {
       // In Supabase mode, we don't have a backend to refresh token via cookie.
       // We rely on the token we generated during login or stored in sessionStorage.
       return this.token;
    }

    try {
      if (this.token) {
        let expired = false;
        try {
          const parts = String(this.token).split('.');
          if (parts.length === 3 && typeof window !== 'undefined' && window.atob) {
            const payloadRaw = window.atob(parts[1]);
            const payload = JSON.parse(payloadRaw);
            const exp = Number(payload?.exp || 0);
            const now = Math.floor(Date.now() / 1000);
            const leeway = 30; // seconds
            expired = !exp || (exp - leeway) <= now;
          }
        } catch (_) { expired = false; }
        if (!expired) return this.token;
      }
    } catch (_) { /* noop */ }
    if (!this._refreshInFlight) {
      this._refreshInFlight = (async () => {
        try {
          const refreshUrl = '/api/auth/refresh';
          const resp = await fetch(refreshUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.token) {
              this.setToken(data.token);
              try { 
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                  window.dispatchEvent(new CustomEvent('auth:refreshed'));
                  
                  // If backend returns a new supabase_token, notify useAuth
                  if (data.supabase_token) {
                     window.dispatchEvent(new CustomEvent('auth:supabase-token', { detail: { supabase_token: data.supabase_token } }));
                  }
                } 
              } catch (_) { /* noop */ }
              return data.token;
            }
          }
        } catch (_) { /* swallow */ }
        this.setToken(null);
        return null;
      })();
    }
    const token = await this._refreshInFlight;
    this._refreshInFlight = null;
    return token;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async request(url, config = {}) {
    // Sanitize request body if it's a JSON object/array
    if (config.body && typeof config.body === 'object' && config.body !== null &&
        !(typeof FormData !== 'undefined' && config.body instanceof FormData) &&
        !(typeof Blob !== 'undefined' && config.body instanceof Blob)) {
      config.body = sanitizeObject(config.body);
    }

    // Append query params to URL if present
    let finalUrl = url;
    if (config && typeof config.params === 'object' && config.params !== null) {
      const queryParams = new URLSearchParams();
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      const qs = queryParams.toString();
      if (qs) {
        finalUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${qs}`;
      }
    }

    if (IS_SUPABASE_MODE && supabase) {
      if (!config.skipAuth && url !== '/api/login') {
        await this.ensureToken();
      }
      const headers = { ...config.headers };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      // Pass the original body object (not stringified)
      // Use handleSupabaseRequest for all requests in Supabase mode, including login
      const fn = await getHandleSupabaseRequest();
      if (typeof fn !== 'function') {
        throw new Error('Supabase mapping is not available (missing handleSupabaseRequest export)');
      }
      return await fn(finalUrl, config.method || 'GET', config.body, headers, supabase);
    }

    let fullUrl = `${this.baseURL}${finalUrl}`;
    if (!config.skipAuth) {
      await this.ensureToken();
    }
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    // CSRF Protection
    const method = (config.method || 'GET').toUpperCase();
    if (!IS_SUPABASE_MODE && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      if (!this.csrfToken) {
        await this.fetchCsrfToken();
      }
      if (this.csrfToken) {
        headers['X-CSRF-Token'] = this.csrfToken;
      }
    }

    // If body is a non-null object and not a string, stringify it
    if (config.body && typeof config.body === 'object' && config.body !== null && typeof config.body !== 'string') {
      config.body = JSON.stringify(config.body);
    }

    const requestConfig = {
      ...config,
      headers,
      credentials: 'include'
    };
    if (method === 'GET') {
      requestConfig.cache = 'no-store';
      requestConfig.headers = {
        ...requestConfig.headers,
        'Cache-Control': 'no-cache'
      };
    }

    // Debug: request details variables retained for potential future use
    const debugMethod = requestConfig.method || 'GET';
    const authHeader = requestConfig.headers?.Authorization || requestConfig.headers?.authorization;
    const tokenSnippet = this.token ? String(this.token).substring(0, 20) + '...' : null;
    const hasAuth = !!authHeader;
    const hasToken = !!tokenSnippet;
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('api:request-debug', { detail: { url: fullUrl, method: debugMethod, hasAuth, hasToken } }));
      }
    } catch (_) { void 0; }
    let response = await fetch(fullUrl, requestConfig);

    if (response.status === 429) {
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('api:ratelimit', { detail: { message: 'Zbyt wiele zapytań. Spróbuj ponownie za chwilę.' } }));
        }
      } catch (_) { /* noop */ }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let message = errorText;
      let code = null;
      let messageKey = null;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed && typeof parsed.error === 'string') message = parsed.error;
        else if (parsed && typeof parsed.message === 'string') message = parsed.message;
        if (parsed && typeof parsed.code === 'string') code = parsed.code;
        if (parsed && typeof parsed.messageKey === 'string') messageKey = parsed.messageKey;
      } catch (_) { void 0; }
      const isMissingTokenMsg = typeof message === 'string' && (
        message.toLowerCase().includes('missing authentication token') ||
        message.toLowerCase().includes('missing token') ||
        message.includes('Brak tokena')
      );
      const isAuthError = (
        response.status === 401 ||
        (response.status === 403 && (
          isMissingTokenMsg ||
          !hasAuth ||
          (typeof message === 'string' && message.toLowerCase().includes('invalid token')) ||
          (typeof message === 'string' && message.includes('Nieprawidłowy token'))
        ))
      );
      if (isAuthError && !config.skipAuth) {
        const token = await this.ensureToken();
        if (token) {
          requestConfig.headers.Authorization = `Bearer ${token}`;
          response = await fetch(fullUrl, requestConfig);
        }
      }
      if (!response.ok) {
        const err = new Error(message || `HTTP error! status: ${response.status}`);
        err.status = response.status;
        if (code) err.code = code;
        if (messageKey) err.messageKey = messageKey;
        
        // Only clear token/logout if it's a genuine authentication error
        if (isAuthError) {
          this.setToken(null);
          if (!config.skipAuth) {
            try {
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                const detail = { reason: message || 'Invalid or expired token', status: response.status };
                window.dispatchEvent(new CustomEvent('auth:invalid', { detail }));
              }
            } catch (_) { void 0; }
          }
        }
        throw err;
      }
    }

    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('api:response-debug', { detail: { url: fullUrl, method, status: response.status } }));
      }
    } catch (_) { void 0; }
    if (response.status === 204 || response.status === 304) {
      return null;
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options
    });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: data,
      ...options
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data,
      ...options
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options
    });
  }

  // Alias for backward compatibility
  async del(endpoint) {
    return this.delete(endpoint);
  }

  // API-specific methods
  async getAuditLogs(params = {}) {
    const queryParams = new URLSearchParams();
    
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        queryParams.append(key, params[key]);
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/api/audit${queryString ? `?${queryString}` : ''}`;
    
    return this.get(endpoint);
  }

  // Support multipart/form-data (FormData) without setting Content-Type
  async postForm(endpoint, formData) {
    await this.ensureToken();

    if (IS_SUPABASE_MODE && supabase) {
      const headers = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      const fn = await getHandleSupabaseRequest();
      if (typeof fn !== 'function') {
        throw new Error('Supabase mapping is not available (missing handleSupabaseRequest export)');
      }
      return await fn(endpoint, 'POST', formData, headers, supabase);
    }

    const fullUrl = `${this.baseURL}${endpoint}`;
    const headers = {};
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (!IS_SUPABASE_MODE) {
      if (!this.csrfToken) await this.fetchCsrfToken();
      if (this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;
    }

    const method = 'POST';
    const authHeader = headers?.Authorization || headers?.authorization;
    const tokenSnippet = this.token ? String(this.token).substring(0, 20) + '...' : null;
    const hasAuth = !!authHeader;
    const hasToken = !!tokenSnippet;
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('api:request-debug', { detail: { url: fullUrl, method, hasAuth, hasToken } }));
      }
    } catch (_) { void 0; }
    let response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const errorText = await response.text();
      let message = errorText;
      let code = null;
      let messageKey = null;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed && typeof parsed.error === 'string') message = parsed.error;
        else if (parsed && typeof parsed.message === 'string') message = parsed.message;
        if (parsed && typeof parsed.code === 'string') code = parsed.code;
        if (parsed && typeof parsed.messageKey === 'string') messageKey = parsed.messageKey;
      } catch (_) { void 0; }
    const isMissingTokenMsg = typeof message === 'string' && (
      message.toLowerCase().includes('missing authentication token') ||
      message.toLowerCase().includes('missing token') ||
      message.includes('Brak tokena')
    );
    const isAuthError = (
      response.status === 401 ||
      (response.status === 403 && (
        isMissingTokenMsg ||
        !hasAuth ||
        (typeof message === 'string' && message.toLowerCase().includes('invalid token')) ||
        (typeof message === 'string' && message.includes('Nieprawidłowy token'))
      ))
    );
      if (isAuthError) {
        const token = await this.ensureToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          response = await fetch(fullUrl, { method: 'POST', headers, body: formData, credentials: 'include' });
        }
      }
      if (!response.ok) {
        const err = new Error(message || `HTTP error! status: ${response.status}`);
        err.status = response.status;
        if (code) err.code = code;
        if (messageKey) err.messageKey = messageKey;
        
        if (isAuthError) {
          this.setToken(null);
          try {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
              const detail = { reason: message || 'Invalid or expired token', status: response.status };
              window.dispatchEvent(new CustomEvent('auth:invalid', { detail }));
            }
          } catch (_) { void 0; }
        }
        throw err;
      }

      const err = new Error(message || `HTTP error! status: ${response.status}`);
      err.status = response.status;
      if (code) err.code = code;
      if (messageKey) err.messageKey = messageKey;
      throw err;
    }

    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('api:response-debug', { detail: { url: fullUrl, method, status: response.status } }));
      }
    } catch (_) { void 0; }
    try {
      return await response.json();
    } catch (_) {
      return {};
    }
  }

  async postFormWithProgress(endpoint, formData, onProgress) {
    await this.ensureToken();

    if (IS_SUPABASE_MODE && supabase) {
      const headers = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      // Note: Progress is not currently supported in Supabase mapping
      if (onProgress) onProgress(50);
      const fn = await getHandleSupabaseRequest();
      if (typeof fn !== 'function') {
        throw new Error('Supabase mapping is not available (missing handleSupabaseRequest export)');
      }
      const result = await fn(endpoint, 'POST', formData, headers, supabase);
      if (onProgress) onProgress(100);
      return result;
    }

    const fullUrl = `${this.baseURL}${endpoint}`;
    return await new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', fullUrl, true);
        if (this.token) {
          xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
        }
        xhr.withCredentials = true;
        if (xhr.upload && typeof onProgress === 'function') {
          xhr.upload.onprogress = (evt) => {
            try {
              if (evt && evt.lengthComputable) {
                const pct = Math.round((evt.loaded / evt.total) * 100);
                onProgress(pct);
              }
            } catch (_) { /* noop */ }
          };
        }
        xhr.onreadystatechange = () => {
          try {
            if (xhr.readyState === 4) {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText || '{}');
                  resolve(data);
                } catch (_) {
                  resolve({});
                }
              } else {
                reject(new Error(`HTTP ${xhr.status}`));
              }
            }
          } catch (e) { reject(e); }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      } catch (e) {
        reject(e);
      }
    });
  }
}

const api = new ApiClient();

// Try to restore token immediately from localStorage (client-side only)
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsed = JSON.parse(userData);
      if (parsed.token) {
        api.setToken(parsed.token);
      }
    }
  } catch (_) { /* noop */ }
}

export default api;
