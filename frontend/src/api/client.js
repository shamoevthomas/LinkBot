import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('linkbot_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    // Retry once on 5xx or network error, GET only
    if (
      config &&
      !config._retried &&
      (!error.response || error.response.status >= 500) &&
      config.method === 'get'
    ) {
      config._retried = true;
      await new Promise((r) => setTimeout(r, 2000));
      return client(config);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('linkbot_token');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
