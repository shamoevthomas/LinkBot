const API_BASE = 'https://linkbot-api.onrender.com/api';

async function getToken() {
  const { linkbot_token } = await chrome.storage.local.get('linkbot_token');
  return linkbot_token || null;
}

async function apiRequest(method, path, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (res.status === 401) {
    await chrome.storage.local.remove('linkbot_token');
    return { error: 'unauthorized', status: 401 };
  }
  if (res.status === 204) return { ok: true };

  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.detail || 'Erreur serveur', status: res.status };
  return { data };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'isLoggedIn': {
          const token = await getToken();
          if (!token) return sendResponse({ loggedIn: false });
          const res = await apiRequest('GET', '/user/me');
          if (res.error) return sendResponse({ loggedIn: false });
          sendResponse({ loggedIn: true, user: res.data });
          break;
        }
        case 'login': {
          const res = await apiRequest('POST', '/auth/login', {
            email: msg.email,
            password: msg.password,
          });
          if (res.error) return sendResponse({ error: res.error });
          await chrome.storage.local.set({ linkbot_token: res.data.access_token });
          const me = await apiRequest('GET', '/user/me');
          sendResponse({ ok: true, user: me.data });
          break;
        }
        case 'logout': {
          await chrome.storage.local.remove('linkbot_token');
          sendResponse({ ok: true });
          break;
        }
        case 'getMe': {
          const res = await apiRequest('GET', '/user/me');
          sendResponse(res);
          break;
        }
        case 'getCRMs': {
          const res = await apiRequest('GET', '/crms');
          sendResponse(res);
          break;
        }
        case 'getStats': {
          const res = await apiRequest('GET', '/dashboard/stats');
          sendResponse(res);
          break;
        }
        case 'addContact': {
          const res = await apiRequest('POST', `/crms/${msg.crmId}/contacts`, {
            linkedin_url: msg.linkedinUrl,
          });
          sendResponse(res);
          break;
        }
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true; // Keep channel open for async response
});
