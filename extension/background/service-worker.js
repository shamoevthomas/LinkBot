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
        case 'createCRM': {
          const res = await apiRequest('POST', '/crms', {
            name: msg.name,
            description: msg.description || '',
          });
          sendResponse(res);
          break;
        }
        case 'extractCookies': {
          const [liAtCookie, jsessionCookie] = await Promise.all([
            chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }),
            chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' }),
          ]);
          const li_at = liAtCookie?.value || null;
          let jsessionid = jsessionCookie?.value || null;
          // JSESSIONID is often stored with surrounding quotes — strip them
          if (jsessionid) jsessionid = jsessionid.replace(/^"|"$/g, '');
          sendResponse({ li_at, jsessionid });
          break;
        }
        case 'saveCookies': {
          const res = await apiRequest('PUT', '/user/cookies', {
            li_at: msg.li_at,
            jsessionid: msg.jsessionid,
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

// --- Auto-sync LinkedIn cookies on change ---
let cookieSyncTimer = null;

chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;
  // Only care about LinkedIn li_at / JSESSIONID
  if (cookie.domain !== '.linkedin.com' && cookie.domain !== 'www.linkedin.com') return;
  if (cookie.name !== 'li_at' && cookie.name !== 'JSESSIONID') return;
  if (removed) return;

  // Debounce — both cookies often change together (e.g. on login)
  clearTimeout(cookieSyncTimer);
  cookieSyncTimer = setTimeout(() => syncCookies(), 2000);
});

async function syncCookies() {
  // Only sync if user is logged into LinkBot
  const token = await getToken();
  if (!token) return;

  const [liAtCookie, jsessionCookie] = await Promise.all([
    chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' }),
    chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' }),
  ]);

  const li_at = liAtCookie?.value || null;
  let jsessionid = jsessionCookie?.value || null;
  if (jsessionid) jsessionid = jsessionid.replace(/^"|"$/g, '');

  if (!li_at || !jsessionid) return;

  // Check if cookies actually changed compared to last sync
  const { linkbot_last_li_at, linkbot_last_jsessionid } = await chrome.storage.local.get([
    'linkbot_last_li_at',
    'linkbot_last_jsessionid',
  ]);
  if (li_at === linkbot_last_li_at && jsessionid === linkbot_last_jsessionid) return;

  // Send to backend
  const res = await apiRequest('PUT', '/user/cookies', { li_at, jsessionid });
  if (!res.error) {
    await chrome.storage.local.set({ linkbot_last_li_at: li_at, linkbot_last_jsessionid: jsessionid });
  }
}
