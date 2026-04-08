(() => {
  const BUTTON_ID = 'linkbot-import-btn';
  const DROPDOWN_ID = 'linkbot-dropdown';
  let currentUrl = location.href;
  let dropdownOpen = false;

  // --- Helpers ---

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  function getLinkedInUrl() {
    const url = new URL(location.href);
    // Clean URL to just /in/public_id/
    const match = url.pathname.match(/\/in\/([^/]+)/);
    if (!match) return null;
    return `https://www.linkedin.com/in/${match[1]}/`;
  }

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.linkbot-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `linkbot-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // --- Button injection ---

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;
    if (!location.pathname.startsWith('/in/')) return;

    // Find the "Message" button on the profile — it's always an <a> or <button>
    // with the text "Message" inside the profile action bar.
    let messageBtn = null;
    const candidates = document.querySelectorAll('a, button');
    for (const el of candidates) {
      const text = el.textContent.trim();
      // Match "Message" button specifically (not messaging nav link)
      if (text === 'Message' || text === '  Message') {
        // Make sure it's in the profile area, not the top nav
        const rect = el.getBoundingClientRect();
        if (rect.top > 200 && rect.top < 700) {
          messageBtn = el;
          break;
        }
      }
    }

    // Fallback: try "Se connecter", "Suivre", "Prendre un rendez-vous"
    if (!messageBtn) {
      for (const el of candidates) {
        const text = el.textContent.trim().toLowerCase();
        if ((text.includes('connecter') || text.includes('suivre') || text.includes('rendez-vous')) &&
            el.getBoundingClientRect().top > 200) {
          messageBtn = el;
          break;
        }
      }
    }

    if (!messageBtn) return;

    const container = messageBtn.parentElement;
    if (!container) return;

    // Find the "..." (More) button — it's the last button/div in the action bar,
    // typically has aria-label containing "Plus" or "More" or contains only an icon
    let moreBtn = null;
    const children = container.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const ariaLabel = (child.getAttribute('aria-label') || '').toLowerCase();
      const text = child.textContent.trim();
      // The "..." button has aria-label "Plus"/"More actions" or has no meaningful text
      if (ariaLabel.includes('plus') || ariaLabel.includes('more') ||
          (child.tagName === 'DIV' && text.length <= 3 && child.querySelector('svg'))) {
        moreBtn = child;
        break;
      }
    }
    // Fallback: use the very last child
    if (!moreBtn) {
      moreBtn = container.lastElementChild;
    }

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'linkbot-btn';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      Importer
    `;
    btn.style.position = 'relative';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown(btn);
    });

    // Insert right before the "..." button
    container.insertBefore(btn, moreBtn);
  }

  // --- Dropdown ---

  async function toggleDropdown(anchorBtn) {
    const existing = document.getElementById(DROPDOWN_ID);
    if (existing) {
      existing.remove();
      dropdownOpen = false;
      return;
    }

    dropdownOpen = true;
    const dropdown = document.createElement('div');
    dropdown.id = DROPDOWN_ID;
    dropdown.className = 'linkbot-dropdown';
    dropdown.innerHTML = '<div class="linkbot-loading"><div class="linkbot-spinner"></div></div>';
    anchorBtn.appendChild(dropdown);

    // Check auth
    const authRes = await send({ action: 'isLoggedIn' });
    if (!authRes.loggedIn) {
      dropdown.innerHTML = `
        <div class="linkbot-login-msg">
          Connectez-vous a LinkBot<br>
          <a href="#" id="linkbot-open-popup">Ouvrir l'extension</a>
        </div>
      `;
      dropdown.querySelector('#linkbot-open-popup').addEventListener('click', (e) => {
        e.preventDefault();
        // Open the extension popup
        chrome.runtime.sendMessage({ action: 'openPopup' });
        dropdown.remove();
        dropdownOpen = false;
      });
      return;
    }

    // Load CRMs
    const crmsRes = await send({ action: 'getCRMs' });
    if (crmsRes.error || !crmsRes.data) {
      dropdown.innerHTML = '<div class="linkbot-login-msg">Erreur de chargement</div>';
      return;
    }

    const crms = crmsRes.data;
    if (crms.length === 0) {
      dropdown.innerHTML = '<div class="linkbot-login-msg">Aucun CRM. Creez-en un dans LinkBot.</div>';
      return;
    }

    dropdown.innerHTML = `
      <div class="linkbot-dropdown-header">Importer sur LinkBot</div>
      <div class="linkbot-dropdown-list">
        ${crms.map((crm) => `
          <label class="linkbot-dropdown-item">
            <input type="checkbox" value="${crm.id}" data-crm-name="${crm.name}">
            <span class="linkbot-dropdown-item-name">${escapeHtml(crm.name)}</span>
            <span class="linkbot-dropdown-item-count">${crm.contact_count}</span>
          </label>
        `).join('')}
      </div>
      <div class="linkbot-dropdown-footer">
        <button class="linkbot-import-btn" id="linkbot-do-import" disabled>Selectionner un CRM</button>
      </div>
    `;

    // Handle checkbox changes
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    const importBtn = dropdown.querySelector('#linkbot-do-import');

    checkboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const checked = dropdown.querySelectorAll('input[type="checkbox"]:checked');
        importBtn.disabled = checked.length === 0;
        importBtn.textContent = checked.length > 0
          ? `Importer dans ${checked.length} CRM${checked.length > 1 ? 's' : ''}`
          : 'Selectionner un CRM';
      });
    });

    // Handle import
    importBtn.addEventListener('click', async () => {
      const linkedinUrl = getLinkedInUrl();
      if (!linkedinUrl) {
        showToast('Impossible de detecter le profil', 'error');
        return;
      }

      const selected = [...dropdown.querySelectorAll('input[type="checkbox"]:checked')];
      if (selected.length === 0) return;

      importBtn.disabled = true;
      importBtn.textContent = 'Importation...';

      let successCount = 0;
      let errorMsg = null;

      for (const cb of selected) {
        const crmId = cb.value;
        const res = await send({ action: 'addContact', crmId, linkedinUrl });
        if (res.error) {
          if (res.status === 409) {
            // Already exists — not really an error
            successCount++;
          } else {
            errorMsg = res.error;
          }
        } else {
          successCount++;
        }
      }

      dropdown.remove();
      dropdownOpen = false;

      if (errorMsg && successCount === 0) {
        showToast(errorMsg, 'error');
      } else if (successCount > 0) {
        const names = selected.map((cb) => cb.dataset.crmName).join(', ');
        showToast(`Importe dans ${names}`, 'success');
      }
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!dropdownOpen) return;
    const dropdown = document.getElementById(DROPDOWN_ID);
    const btn = document.getElementById(BUTTON_ID);
    if (dropdown && !dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      dropdown.remove();
      dropdownOpen = false;
    }
  });

  // --- SPA navigation handling ---

  function onUrlChange() {
    const newUrl = location.href;
    if (newUrl === currentUrl) return;
    currentUrl = newUrl;

    // Remove old button and dropdown
    const oldBtn = document.getElementById(BUTTON_ID);
    if (oldBtn) oldBtn.remove();
    const oldDropdown = document.getElementById(DROPDOWN_ID);
    if (oldDropdown) oldDropdown.remove();
    const oldSearchCard = document.getElementById(SEARCH_CARD_ID);
    if (oldSearchCard) oldSearchCard.remove();
    dropdownOpen = false;

    // Re-inject if on a profile page
    if (location.pathname.startsWith('/in/')) {
      setTimeout(injectButton, 1000);
      setTimeout(injectButton, 2500);
    }
    // Re-inject if on a search page
    if (isSearchPage()) {
      setTimeout(injectSearchCard, 1000);
      setTimeout(injectSearchCard, 2500);
      setTimeout(injectSearchCard, 5000);
    }
  }

  // Observe URL changes (LinkedIn SPA)
  const observer = new MutationObserver(() => onUrlChange());
  observer.observe(document.querySelector('head > title') || document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Also listen to popstate and pushState
  window.addEventListener('popstate', onUrlChange);
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    setTimeout(onUrlChange, 100);
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    setTimeout(onUrlChange, 100);
  };

  // --- DOM observer to retry injection ---
  // LinkedIn loads profile sections lazily
  const bodyObserver = new MutationObserver(() => {
    if (location.pathname.startsWith('/in/') && !document.getElementById(BUTTON_ID)) {
      injectButton();
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  function escapeHtml(str) {
    const d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
  }

  // =====================================================================
  // SEARCH PAGE — sidebar card to bulk-import search results
  // =====================================================================

  const SEARCH_CARD_ID = 'linkbot-search-card';
  const SEARCH_MODAL_ID = 'linkbot-search-modal';

  function isSearchPage() {
    return location.pathname.startsWith('/search/');
  }

  function getSearchProfileUrls() {
    const urls = [];
    const links = document.querySelectorAll('a[href*="/in/"]');
    const seen = new Set();
    for (const link of links) {
      const match = link.href.match(/linkedin\.com\/in\/([^/?]+)/);
      if (!match) continue;
      const publicId = match[1];
      if (seen.has(publicId)) continue;
      seen.add(publicId);

      // Try to get name from the link or nearby elements
      let name = '';
      const nameEl = link.querySelector('span[aria-hidden="true"]') || link;
      const raw = nameEl.textContent.trim();
      if (raw && raw.length < 80 && !raw.includes('…')) name = raw;

      urls.push({ publicId, url: `https://www.linkedin.com/in/${publicId}/`, name });
    }
    return urls;
  }

  function findSidebar() {
    // Strategy 1: class-based selectors (try many variants)
    const classSelectors = [
      'div.search-reusables__side-panel',
      '[class*="search-reusables__side"]',
      'aside[class*="side-panel"]',
      'aside.scaffold-layout__aside',
      '.search-results-container aside',
      '[class*="scaffold-layout__aside"]',
      '[class*="search-reusables__sidebar"]',
    ];
    for (const sel of classSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Strategy 2: find "Sur cette page" / "On this page" text via TreeWalker (reliable)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim().toLowerCase();
      if (text === 'sur cette page' || text === 'on this page') {
        // Walk up from the text node's parent to find the sidebar container
        let parent = walker.currentNode.parentElement;
        for (let i = 0; i < 8 && parent && parent !== document.body; i++) {
          const w = parent.offsetWidth;
          // The sidebar is a narrow column (< ~450px wide) with some height
          if (w > 100 && w < 450 && parent.offsetHeight > 80) {
            return parent;
          }
          parent = parent.parentElement;
        }
      }
    }

    // Strategy 3: find <nav> elements in a narrow left column
    const navs = document.querySelectorAll('nav');
    for (const nav of navs) {
      if (nav.offsetWidth > 100 && nav.offsetWidth < 450 && nav.offsetHeight > 80) {
        const rect = nav.getBoundingClientRect();
        // Must be on the left side of the page
        if (rect.left < 500) return nav.parentElement || nav;
      }
    }

    return null;
  }

  function injectSearchCard() {
    if (!isSearchPage()) return;
    if (document.getElementById(SEARCH_CARD_ID)) return;

    const sidebar = findSidebar();
    if (!sidebar) return;

    const card = document.createElement('div');
    card.id = SEARCH_CARD_ID;
    card.className = 'linkbot-search-card';
    card.innerHTML = `
      <div class="linkbot-search-card-header">
        <div class="linkbot-search-card-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
        </div>
        <span class="linkbot-search-card-title">LinkBot</span>
      </div>
      <p class="linkbot-search-card-desc">Importez les profils de cette recherche dans votre CRM</p>
      <button class="linkbot-search-card-btn" id="linkbot-search-import-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Importer les profils
      </button>
    `;

    card.querySelector('#linkbot-search-import-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSearchModal();
    });

    // Insert after the first child (the "Sur cette page" nav)
    if (sidebar.firstChild) {
      sidebar.insertBefore(card, sidebar.firstChild.nextSibling);
    } else {
      sidebar.appendChild(card);
    }
  }

  async function openSearchModal() {
    // Remove existing
    const existing = document.getElementById(SEARCH_MODAL_ID);
    if (existing) { existing.remove(); return; }

    const profiles = getSearchProfileUrls();

    const overlay = document.createElement('div');
    overlay.id = SEARCH_MODAL_ID;
    overlay.className = 'linkbot-modal-overlay';
    overlay.innerHTML = `
      <div class="linkbot-modal">
        <div class="linkbot-modal-header">
          <span>Importer dans LinkBot</span>
          <button class="linkbot-modal-close" id="linkbot-modal-close">&times;</button>
        </div>
        <div class="linkbot-modal-body">
          <div class="linkbot-modal-loading"><div class="linkbot-spinner"></div></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#linkbot-modal-close').addEventListener('click', () => overlay.remove());

    // Check auth
    const authRes = await send({ action: 'isLoggedIn' });
    if (!authRes.loggedIn) {
      overlay.querySelector('.linkbot-modal-body').innerHTML = `
        <div class="linkbot-login-msg">
          Connectez-vous a LinkBot via l'extension<br>
          <a href="#" id="linkbot-modal-open-popup">Ouvrir l'extension</a>
        </div>
      `;
      overlay.querySelector('#linkbot-modal-open-popup').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ action: 'openPopup' });
        overlay.remove();
      });
      return;
    }

    // Load CRMs
    const crmsRes = await send({ action: 'getCRMs' });
    const crms = crmsRes.data || [];

    const body = overlay.querySelector('.linkbot-modal-body');
    body.innerHTML = `
      <div class="linkbot-modal-section">
        <label class="linkbot-modal-label">Profils detectes sur cette page</label>
        <p class="linkbot-modal-info">${profiles.length} profil${profiles.length > 1 ? 's' : ''} trouve${profiles.length > 1 ? 's' : ''}</p>
      </div>

      <div class="linkbot-modal-section">
        <label class="linkbot-modal-label">Nombre a importer</label>
        <input type="number" id="linkbot-import-count" class="linkbot-modal-input" min="1" max="${profiles.length}" value="${profiles.length}">
      </div>

      <div class="linkbot-modal-section">
        <label class="linkbot-modal-label">CRM de destination</label>
        <select id="linkbot-crm-select" class="linkbot-modal-input">
          ${crms.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.contact_count})</option>`).join('')}
          <option value="__new__">+ Creer un nouveau CRM</option>
        </select>
      </div>

      <div id="linkbot-new-crm-section" class="linkbot-modal-section" style="display:none;">
        <label class="linkbot-modal-label">Nom du nouveau CRM</label>
        <input type="text" id="linkbot-new-crm-name" class="linkbot-modal-input" placeholder="Ex: Prospects Closer">
      </div>

      <div id="linkbot-progress-section" class="linkbot-modal-section" style="display:none;">
        <div class="linkbot-progress-bar">
          <div class="linkbot-progress-fill" id="linkbot-progress-fill"></div>
        </div>
        <p class="linkbot-progress-text" id="linkbot-progress-text">0 / 0</p>
      </div>

      <button class="linkbot-modal-submit" id="linkbot-do-search-import">
        Importer les profils
      </button>
    `;

    // Toggle new CRM input
    const crmSelect = body.querySelector('#linkbot-crm-select');
    const newCrmSection = body.querySelector('#linkbot-new-crm-section');
    crmSelect.addEventListener('change', () => {
      newCrmSection.style.display = crmSelect.value === '__new__' ? 'block' : 'none';
    });

    // Handle import
    body.querySelector('#linkbot-do-search-import').addEventListener('click', async () => {
      const count = parseInt(body.querySelector('#linkbot-import-count').value) || profiles.length;
      let crmId = crmSelect.value;

      // Create new CRM if needed
      if (crmId === '__new__') {
        const name = body.querySelector('#linkbot-new-crm-name').value.trim();
        if (!name) { showToast('Entrez un nom pour le CRM', 'error'); return; }
        const res = await send({ action: 'createCRM', name });
        if (res.error) { showToast(res.error, 'error'); return; }
        crmId = res.data.id;
      }

      const toImport = profiles.slice(0, count);
      const submitBtn = body.querySelector('#linkbot-do-search-import');
      const progressSection = body.querySelector('#linkbot-progress-section');
      const progressFill = body.querySelector('#linkbot-progress-fill');
      const progressText = body.querySelector('#linkbot-progress-text');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Importation...';
      progressSection.style.display = 'block';

      let imported = 0;
      let errors = 0;

      for (let i = 0; i < toImport.length; i++) {
        const profile = toImport[i];
        const res = await send({ action: 'addContact', crmId, linkedinUrl: profile.url });
        if (res.error && res.status !== 409) {
          errors++;
        } else {
          imported++;
        }
        const pct = Math.round(((i + 1) / toImport.length) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = `${i + 1} / ${toImport.length}`;
      }

      submitBtn.textContent = 'Termine !';
      setTimeout(() => {
        overlay.remove();
        if (errors > 0) {
          showToast(`${imported} importe(s), ${errors} erreur(s)`, imported > 0 ? 'success' : 'error');
        } else {
          showToast(`${imported} profil${imported > 1 ? 's' : ''} importe${imported > 1 ? 's' : ''} !`, 'success');
        }
      }, 800);
    });
  }

  // --- Search page observer ---
  function onSearchPageChange() {
    if (isSearchPage() && !document.getElementById(SEARCH_CARD_ID)) {
      injectSearchCard();
    }
  }

  const searchObserver = new MutationObserver(() => onSearchPageChange());
  searchObserver.observe(document.body, { childList: true, subtree: true });

  // --- Initial injection ---
  injectButton();
  injectSearchCard();
  // Retry after a delay (LinkedIn may still be loading)
  setTimeout(injectButton, 1500);
  setTimeout(injectButton, 3000);
  setTimeout(injectSearchCard, 1500);
  setTimeout(injectSearchCard, 3000);
  setTimeout(injectSearchCard, 5000);
  setTimeout(injectSearchCard, 8000);
})();
