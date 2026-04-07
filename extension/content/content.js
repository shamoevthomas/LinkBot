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

    // Strategy: find the "..." (more) button or "Message" button on the profile,
    // then insert our button next to it in the same parent container.
    let anchor = null;

    // 1. Try the "more actions" overflow button (the "..." button) — always present
    const moreButtons = document.querySelectorAll('div.artdeco-dropdown button, button.artdeco-button--muted');
    for (const b of moreButtons) {
      const parent = b.closest('.pvs-profile-actions, .pv-top-card-v2-ctas, .scaffold-layout__detail');
      if (parent && b.querySelector('svg, li-icon, [data-test-icon]')) {
        anchor = b;
        break;
      }
    }

    // 2. Fallback: find any button with text "Message", "Se connecter", "Suivre", "Prendre un rendez-vous"
    if (!anchor) {
      const allBtns = document.querySelectorAll('button, a.artdeco-button');
      for (const b of allBtns) {
        const text = b.textContent.trim().toLowerCase();
        if (
          (text.includes('message') || text.includes('connecter') || text.includes('connect') ||
           text.includes('suivre') || text.includes('follow') || text.includes('rendez-vous')) &&
          b.offsetParent !== null // visible
        ) {
          anchor = b;
          break;
        }
      }
    }

    if (!anchor) return;

    const container = anchor.parentElement;
    if (!container) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'linkbot-btn';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Importer
    `;
    btn.style.position = 'relative';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown(btn);
    });

    // Insert after the last button in the container
    container.appendChild(btn);
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
    dropdownOpen = false;

    // Re-inject if on a profile page
    if (location.pathname.startsWith('/in/')) {
      // Delay to let LinkedIn render the new profile
      setTimeout(injectButton, 1000);
      setTimeout(injectButton, 2500);
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

  // --- Initial injection ---
  injectButton();
  // Retry after a delay (LinkedIn may still be loading)
  setTimeout(injectButton, 1500);
  setTimeout(injectButton, 3000);
})();
