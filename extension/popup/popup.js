const APP_URL = 'https://link-bot-kappa.vercel.app';

const $ = (id) => document.getElementById(id);
const show = (el) => { el.style.display = ''; };
const hide = (el) => { el.style.display = 'none'; };

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function init() {
  const res = await send({ action: 'isLoggedIn' });
  hide($('loading'));
  if (res.loggedIn) {
    showDashboard(res.user);
  } else {
    show($('login-screen'));
  }
}

// --- Login ---
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  const errEl = $('login-error');
  hide(errEl);
  btn.disabled = true;
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loading').style.display = '';

  const res = await send({
    action: 'login',
    email: $('login-email').value,
    password: $('login-password').value,
  });

  btn.disabled = false;
  btn.querySelector('.btn-text').style.display = '';
  btn.querySelector('.btn-loading').style.display = 'none';

  if (res.error) {
    errEl.textContent = res.error === 'unauthorized' ? 'Identifiants incorrects' : res.error;
    show(errEl);
    return;
  }

  hide($('login-screen'));
  showDashboard(res.user);
});

// --- Dashboard ---
async function showDashboard(user) {
  show($('dashboard-screen'));
  $('user-name').textContent = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
    : '';

  // Show profile picture
  const avatarEl = $('user-avatar');
  if (user && user.profile_picture_path) {
    const base = 'https://linkbot-api.onrender.com';
    avatarEl.innerHTML = `<img src="${base}${user.profile_picture_path.startsWith('/') ? '' : '/'}${user.profile_picture_path}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
  } else {
    avatarEl.innerHTML = user ? (user.first_name || user.email || 'L').charAt(0).toUpperCase() : 'L';
  }

  // Load stats and CRMs in parallel
  const [statsRes, crmsRes] = await Promise.all([
    send({ action: 'getStats' }),
    send({ action: 'getCRMs' }),
  ]);

  if (statsRes.data) {
    $('stat-contacts').textContent = statsRes.data.total_contacts ?? '-';
    $('stat-campaigns').textContent = statsRes.data.active_campaigns ?? '-';
    $('stat-actions').textContent = statsRes.data.actions_today ?? '-';
  }

  const list = $('crm-list');
  if (crmsRes.data && crmsRes.data.length > 0) {
    list.innerHTML = crmsRes.data.map((crm) => `
      <a class="crm-item" href="${APP_URL}/dashboard/crm/${crm.id}" target="_blank">
        <span class="crm-name">${escapeHtml(crm.name)}</span>
        <span class="crm-count">${crm.contact_count}</span>
      </a>
    `).join('');
  } else {
    list.innerHTML = '<div class="placeholder">Aucun CRM</div>';
  }
}

// --- Actions ---
$('logout-btn').addEventListener('click', async () => {
  await send({ action: 'logout' });
  hide($('dashboard-screen'));
  show($('login-screen'));
  $('login-email').value = '';
  $('login-password').value = '';
});

$('open-app-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: `${APP_URL}/dashboard` });
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

init();
