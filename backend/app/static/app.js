'use strict';

/* ============================================================================
 * SANKET AI — STRICTLY 3-PAGE BRAND VIBE GOVERNANCE CLIENT
 * Page 1: /         (Home Hub + Active Company Vibe Profiles)
 * Page 2: /company  (Company Puts Their Vibes + Gemini AI Brand DNA)
 * Page 3: /check    (Developer Checks Whether Work Matches + Auto-Fix + Co-Pilot)
 * ========================================================================== */

const state = {
  page: 'home',
  isDemo: false,
  brands: [],
  session: null,
  company: {
    selectedBrandId: '__new__',
    palette: ['#3B82F6', '#0F172A', '#10B981'],
    logoUrl: '',
    dnaProfile: null,
  },
  dev: {
    selectedBrandId: '',
    selectedFile: null,
    sampleUrl: '',
    sampleName: '',
    activeSource: 'website',
    activeSubView: 'input',
    lastReport: null,
    copilotHistory: [],
  },
};

const STORAGE_SESSION_KEY = 'sanket_workspace_session';

/* ----------------------------------------------------------------------------
 * Utilities & Auth Interceptor
 * ------------------------------------------------------------------------- */
function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHex(raw) {
  if (!raw) return null;
  let c = String(raw).trim().toUpperCase();
  if (!c.startsWith('#')) c = `#${c}`;
  return /^#[0-9A-F]{6}$/.test(c) ? c : null;
}

function parseCsvList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  }, 4200);
}

function setFeedback(elId, message, type = 'info') {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!message) {
    el.className = 'inline-feedback hidden';
    el.textContent = '';
    return;
  }
  el.className = `inline-feedback ${type}`;
  el.textContent = message;
}

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.session_token) {
        state.session = parsed;
      }
    }
  } catch (_) {
    state.session = null;
  }
  updateAuthUI();
}

function saveSession(sessionObj) {
  state.session = sessionObj;
  try {
    if (sessionObj) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionObj));
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  } catch (_) {}
  updateAuthUI();
}

function getSessionInitials(session) {
  if (!session) return 'AC';
  const source = (session.org_id || session.full_name || session.email || 'AC').trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function isDemoSession() {
  return Boolean(state.isDemo || (state.session && state.session.email === 'demo@sanket.ai'));
}

function updateDemoVisibility() {
  const demoMode = isDemoSession();
  document.getElementById('check-demo-only-bar')?.classList.toggle('hidden', !demoMode);
  document.getElementById('btn-load-demo-results')?.classList.toggle('hidden', !demoMode);
}

function toggleHubAccountMenu(forceState) {
  const menu = document.getElementById('hub-account-menu');
  const btn = document.getElementById('hub-avatar-btn');
  if (!menu) return;
  const open = typeof forceState === 'boolean' ? forceState : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleCheckAccountMenu(forceState) {
  const menu = document.getElementById('check-account-menu');
  const btn = document.getElementById('check-avatar-btn');
  if (!menu) return;
  const open = typeof forceState === 'boolean' ? forceState : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateAuthUI() {
  const dot = document.getElementById('auth-dot');
  const label = document.getElementById('auth-pill-label');
  const sessionBox = document.getElementById('auth-session-box');
  const homeSignedIn = document.getElementById('home-signedin-card');
  const homeSigninView = document.getElementById('home-auth-signin-view');
  const homeRegView = document.getElementById('home-auth-register-view');
  const splitShell = document.getElementById('home-split-shell');
  const authHub = document.getElementById('home-authenticated-hub');
  const hubInitials = document.getElementById('hub-avatar-initials');
  const hubEmail = document.getElementById('hub-account-email');
  const hubOrg = document.getElementById('hub-account-org');
  const checkInitials = document.getElementById('check-avatar-initials');
  const checkEmail = document.getElementById('check-account-email');
  const checkOrg = document.getElementById('check-account-org');
  if (!dot || !label) return;

  if (state.session && state.session.session_token) {
    state.isDemo = state.session.email === 'demo@sanket.ai';
    const initials = getSessionInitials(state.session);
    dot.classList.add('online');
    label.textContent = state.session.org_id || state.session.email || 'Signed In';
    if (splitShell) splitShell.classList.add('hidden');
    if (authHub) authHub.classList.remove('hidden');
    if (hubInitials) hubInitials.textContent = initials;
    if (hubEmail) hubEmail.textContent = state.session.email || 'Signed in';
    if (hubOrg) hubOrg.textContent = state.session.org_id || 'default-org';
    if (checkInitials) checkInitials.textContent = initials;
    if (checkEmail) checkEmail.textContent = state.session.email || 'Signed in';
    if (checkOrg) checkOrg.textContent = state.session.org_id || 'default-org';

    if (sessionBox) {
      sessionBox.classList.remove('hidden');
      sessionBox.innerHTML = `
        <div class="session-summary">
          <div><strong>${escapeHtml(state.session.email || '')}</strong></div>
          <div class="mono-sm muted">Org: ${escapeHtml(state.session.org_id || 'default-org')} &middot; Role: ${escapeHtml(state.session.role_label || state.session.role || 'User')}</div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="logoutSession()">Sign Out</button>
        </div>
      `;
    }
    if (homeSignedIn) {
      homeSignedIn.classList.remove('hidden');
      homeSignedIn.innerHTML = `
        <div><strong>Active Session: ${escapeHtml(state.session.email || '')}</strong></div>
        <div class="mono-sm" style="color:#5b616c;">Org: ${escapeHtml(state.session.org_id || 'default-org')} &middot; Role: ${escapeHtml(state.session.role_label || state.session.role || 'User')}</div>
        <div class="drawer-signedin-actions">
          <button type="button" class="cream-submit-btn" style="padding:0.55rem 0.9rem;width:auto;" onclick="navigateTo('company')">Company Vibes &rarr;</button>
          <button type="button" class="cream-accent-link" onclick="navigateTo('check')">Developer Check</button>
          <button type="button" class="cream-text-link" style="margin-left:auto;" onclick="logoutSession()">Sign Out</button>
        </div>
      `;
    }
  } else {
    state.isDemo = false;
    dot.classList.remove('online');
    label.textContent = state.page === 'home' ? 'Sign In' : 'Default Workspace';
    if (splitShell) splitShell.classList.remove('hidden');
    if (authHub) authHub.classList.add('hidden');
    toggleHubAccountMenu(false);
    toggleCheckAccountMenu(false);
    if (checkInitials) checkInitials.textContent = 'GV';
    if (checkEmail) checkEmail.textContent = 'Guest Workspace';
    if (checkOrg) checkOrg.textContent = 'default-org';

    if (sessionBox) {
      sessionBox.classList.add('hidden');
      sessionBox.innerHTML = '';
    }
    if (homeSignedIn) {
      homeSignedIn.classList.add('hidden');
      homeSignedIn.innerHTML = '';
    }
    if (homeSigninView && homeRegView && homeRegView.classList.contains('hidden')) {
      homeSigninView.classList.remove('hidden');
    }
  }
  updateDemoVisibility();
}

async function apiFetch(url, options = {}) {
  const opts = { ...options };
  const headers = new Headers(opts.headers || {});
  if (state.session && state.session.session_token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${state.session.session_token}`);
  }
  opts.headers = headers;

  const resp = await fetch(url, opts);
  const contentType = resp.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await resp.json().catch(() => null);
  } else {
    const txt = await resp.text().catch(() => '');
    data = txt ? { detail: txt } : null;
  }
  if (!resp.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${resp.status})`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = resp.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/* ----------------------------------------------------------------------------
 * Strictly 3-Page Router
 * ------------------------------------------------------------------------- */
function resolveRoutePage(pathname) {
  const p = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (p === '/company' || p === '/company-portal' || p === '/vibes') return 'company';
  if (p === '/check' || p === '/check-vibe' || p === '/developer' || p === '/inspect') return 'check';
  return 'home';
}

function pageToUrl(page) {
  if (page === 'company') return '/company';
  if (page === 'check') return '/check';
  return '/';
}

function navigateTo(page, pushHistory = true) {
  const prevPage = state.page;
  const target = ['home', 'company', 'check'].includes(page) ? page : 'home';
  state.page = target;
  document.body.classList.toggle('is-home', target === 'home');
  document.body.classList.toggle('is-check', target === 'check');

  document.querySelectorAll('.page-view').forEach((sec) => {
    const active = sec.id === `page-${target}`;
    sec.classList.toggle('active', active);
    sec.classList.toggle('hidden', !active);
  });

  document.querySelectorAll('.nav-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.nav === target);
  });

  if (target === 'check' && prevPage !== 'check') {
    switchCheckSubView('input');
    selectBrandInputSource(state.dev.activeSource || 'website');
  }

  if (pushHistory) {
    const nextUrl = pageToUrl(target);
    if (window.location.pathname !== nextUrl) {
      window.history.pushState({ page: target }, '', nextUrl);
    }
  }

  updateAuthUI();
  updateDemoVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindNavLinks() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav);
    });
  });

  window.addEventListener('popstate', () => {
    navigateTo(resolveRoutePage(window.location.pathname), false);
  });
}

/* ----------------------------------------------------------------------------
 * Page 1 Pull-Out Sign-In Slidebar & Demo Launcher
 * ------------------------------------------------------------------------- */
function setHomeSigninFullPage(isFull) {
  const shell = document.getElementById('home-split-shell');
  const btn = document.getElementById('btn-signin-fullview');
  const arrow = document.getElementById('signin-fullview-arrow');
  const text = document.getElementById('signin-fullview-text');
  if (!shell) return;

  shell.classList.toggle('signin-full', isFull);
  if (btn) {
    btn.setAttribute('aria-pressed', isFull ? 'true' : 'false');
    btn.setAttribute('aria-label', isFull ? 'Return to split view' : 'Expand sign in to full page');
    btn.setAttribute('title', isFull ? 'Return to split view' : 'Expand sign in to full page');
  }
  if (arrow) arrow.innerHTML = isFull ? '&rsaquo;' : '&lsaquo;';
  if (text) text.textContent = isFull ? 'Split View' : 'Full View';
}

function toggleHomeSigninFullPage() {
  const shell = document.getElementById('home-split-shell');
  if (!shell) return;
  if (!shell.classList.contains('signin-open')) {
    setHomeSigninOpen(true);
  }
  const isFull = shell.classList.contains('signin-full');
  setHomeSigninFullPage(!isFull);
}

function setHomeSigninOpen(isOpen) {
  const shell = document.getElementById('home-split-shell');
  const handle = document.getElementById('home-pull-handle');
  const drawer = document.getElementById('home-signin-drawer');
  const chevron = document.getElementById('home-pull-chevron');
  const label = document.getElementById('home-pull-label');
  if (!shell) return;

  shell.classList.toggle('signin-open', isOpen);
  if (!isOpen) {
    setHomeSigninFullPage(false);
  }
  if (handle) handle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (drawer) drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (chevron) chevron.innerHTML = isOpen ? '&rsaquo;' : '&lsaquo;';
  if (label) label.textContent = isOpen ? 'CLOSE' : 'SIGN IN';

  if (isOpen) {
    setTimeout(() => {
      const emailInput = document.getElementById('home-login-email');
      if (emailInput && (!state.session || !state.session.session_token)) {
        emailInput.focus({ preventScroll: true });
      }
    }, 240);
  }
}

function openHomeSignin() {
  setHomeSigninOpen(true);
}

function closeHomeSignin() {
  setHomeSigninOpen(false);
}

function toggleHomeSignin() {
  const shell = document.getElementById('home-split-shell');
  const isOpen = shell ? shell.classList.contains('signin-open') : false;
  setHomeSigninOpen(!isOpen);
}

function handleTopbarAuthClick() {
  if (state.page === 'home') {
    toggleHomeSignin();
  } else {
    openAuthModal();
  }
}

function bindHomePullSlidebar() {
  const handle = document.getElementById('home-pull-handle');
  if (!handle) return;

  let startX = null;
  let dragged = false;

  handle.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    dragged = false;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  handle.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 22) {
      dragged = true;
      if (dx < -28) {
        openHomeSignin();
        startX = null;
      } else if (dx > 28) {
        closeHomeSignin();
        startX = null;
      }
    }
  });

  const endPointer = () => {
    startX = null;
  };
  handle.addEventListener('pointerup', endPointer);
  handle.addEventListener('pointercancel', endPointer);

  handle.addEventListener('click', (e) => {
    if (dragged) {
      dragged = false;
      e.preventDefault();
      return;
    }
    toggleHomeSignin();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.page === 'home') {
      closeHomeSignin();
    }
  });
}

function setHomeAuthFeedback(message, isError = false) {
  const box = document.getElementById('home-auth-feedback');
  if (!box) return;
  if (!message) {
    box.className = 'drawer-feedback hidden';
    box.textContent = '';
    return;
  }
  box.className = `drawer-feedback${isError ? ' error' : ''}`;
  box.textContent = message;
}

function switchHomeAuthView(tab) {
  setHomeAuthFeedback('');
  document.getElementById('home-auth-signin-view')?.classList.toggle('hidden', tab !== 'login');
  document.getElementById('home-auth-register-view')?.classList.toggle('hidden', tab !== 'register');
}

function toggleHomePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  if (btn) btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
}

function handleForgotPassword() {
  setHomeAuthFeedback('Self-serve password reset is disabled in this local demo. Use your org admin credentials or click "Launch Live Demo" below.');
}

async function submitHomeLogin(e) {
  e.preventDefault();
  setHomeAuthFeedback('');
  const email = document.getElementById('home-login-email')?.value.trim();
  const password = document.getElementById('home-login-password')?.value || '';
  if (!email || !password) return;
  try {
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    saveSession(res);
    closeHomeSignin();
    showToast(`Signed in to ${res.org_id}`, 'success');
    await loadBrands();
  } catch (err) {
    setHomeAuthFeedback(err.message || 'Sign in failed', true);
    showToast(err.message || 'Sign in failed', 'error');
  }
}

async function submitHomeRegister(e) {
  e.preventDefault();
  setHomeAuthFeedback('');
  const company_name = document.getElementById('home-reg-company')?.value.trim();
  const admin_email = document.getElementById('home-reg-email')?.value.trim();
  const admin_password = document.getElementById('home-reg-password')?.value || '';
  if (!company_name || !admin_email || !admin_password) return;
  try {
    const res = await apiFetch('/api/v1/orgs/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name, admin_email, admin_password }),
    });
    saveSession(res);
    closeHomeSignin();
    showToast(`Created isolated workspace for ${company_name}`, 'success');
    await loadBrands();
  } catch (err) {
    setHomeAuthFeedback(err.message || 'Registration failed', true);
    showToast(err.message || 'Registration failed', 'error');
  }
}

async function launchDemoWorkspace() {
  setHomeAuthFeedback('');
  try {
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@sanket.ai',
        password: 'DemoJudge2026!',
      }),
    });
    saveSession(res);
    closeHomeSignin();
    showToast(`Live Demo active (${res.org_id})`, 'success');
    await loadBrands();
  } catch (err) {
    showToast(err.message || 'Unable to launch demo session', 'error');
  }
}

/* ----------------------------------------------------------------------------
 * Auth Modal Handlers (Overlay only, never a 4th page)
 * ------------------------------------------------------------------------- */
function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.modal-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('form-login')?.classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register')?.classList.toggle('hidden', tab !== 'register');
}

async function submitLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value || '';
  if (!email || !password) return;
  try {
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    saveSession(res);
    closeAuthModal();
    showToast(`Signed in to ${res.org_id}`, 'success');
    await loadBrands();
  } catch (err) {
    showToast(err.message || 'Sign in failed', 'error');
  }
}

async function submitRegisterCompany(e) {
  e.preventDefault();
  const company_name = document.getElementById('reg-company')?.value.trim();
  const admin_email = document.getElementById('reg-email')?.value.trim();
  const admin_password = document.getElementById('reg-password')?.value || '';
  if (!company_name || !admin_email || !admin_password) return;
  try {
    const res = await apiFetch('/api/v1/orgs/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name, admin_email, admin_password }),
    });
    saveSession(res);
    closeAuthModal();
    showToast(`Created isolated workspace for ${company_name}`, 'success');
    await loadBrands();
    navigateTo('company');
  } catch (err) {
    showToast(err.message || 'Registration failed', 'error');
  }
}

function resetCheckWorkspaceUI() {
  state.dev.selectedBrandId = '';
  state.dev.lastReport = null;
  state.dev.lastScan = null;
  state.dev.copilotHistory = [];
  ['check-company-name', 'check-website-url', 'check-social-input', 'dev-copy-input', 'copilot-prompt'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const msgEl = document.getElementById('copilot-messages');
  if (msgEl) msgEl.innerHTML = '';
  document.getElementById('copilot-box')?.classList.add('hidden');
  document.getElementById('autofix-output')?.classList.add('hidden');
  document.getElementById('check-results-body')?.classList.add('hidden');
  document.getElementById('check-results-empty')?.classList.remove('hidden');
  const revList = document.getElementById('check-reviews-list');
  if (revList) revList.innerHTML = '';
  clearDevFile();
  switchCheckSubView('input');
}

async function logoutSession() {
  state.isDemo = false;
  saveSession(null);
  closeAuthModal();
  toggleHubAccountMenu(false);
  toggleCheckAccountMenu(false);
  resetCheckWorkspaceUI();
  showToast('Signed out', 'info');
  await loadBrands();
  navigateTo('home');
}

/* ----------------------------------------------------------------------------
 * Service Status + Brands Directory (Home + Both Studios)
 * ------------------------------------------------------------------------- */
async function loadSystemPills() {
  const host = document.getElementById('home-service-pills');
  if (!host) return;
  try {
    const data = await apiFetch('/api/v1/status');
    const p = (data && data.providers) || {};
    const items = [
      { label: 'Gemini', ok: Boolean(p.gemini?.configured ?? p.gemini_configured) },
      { label: 'Groq', ok: Boolean(p.groq?.configured ?? p.groq_configured) },
      { label: 'Supabase', ok: Boolean(p.supabase?.configured ?? p.supabase_configured) },
    ];
    host.innerHTML = items
      .map(
        (item) =>
          `<span class="svc-pill ${item.ok ? 'svc-ok' : 'svc-off'}"><i class="svc-dot"></i>${item.label}</span>`
      )
      .join('');
  } catch (_) {
    host.innerHTML = '<span class="svc-pill svc-off">API offline</span>';
  }
}

async function loadBrands(manual = false) {
  try {
    const brands = await apiFetch('/api/v1/brands');
    state.brands = Array.isArray(brands) ? brands : [];
    renderHomeBrands();
    populateBrandSelectors();
    if (manual) showToast(`Loaded ${state.brands.length} company vibe profile(s)`, 'info');
  } catch (err) {
    const grid = document.getElementById('home-brands-grid');
    if (grid) {
      grid.innerHTML = `<div class="empty-card">Unable to load brands: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderHomeBrands() {
  const grid = document.getElementById('home-brands-grid');
  if (!grid) return;

  if (!state.brands.length) {
    grid.innerHTML = `
      <div class="empty-card">
        No company vibe profiles exist in this workspace yet. Click <strong>Open Company Vibes Studio</strong> above to publish the first one.
      </div>`;
    return;
  }

  grid.innerHTML = state.brands
    .map((b) => {
      const palette = (b.approved_palette || []).slice(0, 6);
      const traits = [...(b.personality || []), ...(b.mood || []), ...(b.communication_tone || [])].slice(0, 4);
      const swatchesHtml = palette
        .map((hex) => `<span class="mini-swatch" style="background:${escapeHtml(hex)}" title="${escapeHtml(hex)}"></span>`)
        .join('');
      const traitsHtml = traits
        .map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`)
        .join('');
      const isConfirmed = b.is_human_confirmed || b.status === 'CONFIRMED';

      return `
        <article class="brand-card">
          <div class="brand-card-top">
            <div class="brand-card-title-row">
              ${b.logo_url ? `<img src="${escapeHtml(b.logo_url)}" alt="" class="brand-card-logo">` : ''}
              <div>
                <h4>${escapeHtml(b.brand_name)}</h4>
                <span class="mono-sm muted">${escapeHtml(b.target_audience || 'General Audience')}</span>
              </div>
            </div>
            <span class="status-tag ${isConfirmed ? 'status-confirmed' : ''}">${isConfirmed ? 'LOCKED' : 'DRAFT'}</span>
          </div>
          <div class="brand-card-swatches">${swatchesHtml || '<span class="muted mono-sm">No palette set</span>'}</div>
          <div class="brand-card-tags">${traitsHtml}</div>
          <div class="brand-card-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="openBrandInCompany('${escapeHtml(b.brand_id)}')">Edit Vibes</button>
            <button type="button" class="btn btn-emerald btn-sm" onclick="openBrandInCheck('${escapeHtml(b.brand_id)}')">Check Work &rarr;</button>
          </div>
        </article>`;
    })
    .join('');
}

function populateBrandSelectors() {
  const companySel = document.getElementById('company-brand-select');
  const devSel = document.getElementById('dev-brand-select');

  if (companySel) {
    const prev = state.company.selectedBrandId || '__new__';
    companySel.innerHTML =
      '<option value="__new__">+ New Company Vibe Profile</option>' +
      state.brands
        .map((b) => `<option value="${escapeHtml(b.brand_id)}">${escapeHtml(b.brand_name)} (${escapeHtml(b.status)})</option>`)
        .join('');
    companySel.value = state.brands.some((b) => b.brand_id === prev) ? prev : '__new__';
  }

  if (devSel) {
    const baseOption = '<option value="">Custom / Auto-match Company</option>';
    if (!state.brands.length) {
      devSel.innerHTML = baseOption;
      state.dev.selectedBrandId = '';
    } else {
      const prev = state.dev.selectedBrandId;
      devSel.innerHTML =
        baseOption +
        state.brands
          .map((b) => `<option value="${escapeHtml(b.brand_id)}">${escapeHtml(b.brand_name)}</option>`)
          .join('');
      const chosen = prev && state.brands.some((b) => b.brand_id === prev) ? prev : '';
      devSel.value = chosen;
      state.dev.selectedBrandId = chosen;
    }
    renderDevTargetPreview();
  }
}

function openBrandInCompany(brandId) {
  navigateTo('company');
  onSelectCompanyBrand(brandId);
}

function openBrandInCheck(brandId) {
  navigateTo('check');
  onSelectDevBrand(brandId);
}

/* ----------------------------------------------------------------------------
 * PAGE 2: COMPANY PUTS THEIR VIBES
 * ------------------------------------------------------------------------- */
function resetCompanyForm() {
  state.company.selectedBrandId = '__new__';
  state.company.palette = ['#3B82F6', '#0F172A', '#10B981'];
  state.company.logoUrl = '';
  state.company.dnaProfile = null;

  const sel = document.getElementById('company-brand-select');
  if (sel) sel.value = '__new__';

  const setVal = (id, v = '') => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  setVal('c-brand-name', '');
  setVal('c-industry', 'Technology');
  setVal('c-audience', '');
  setVal('c-products', '');
  setVal('c-mission', '');
  setVal('c-personality', '');
  setVal('c-mood', '');
  setVal('c-tone', '');
  setVal('c-visual-style', '');
  setVal('c-disallowed', '');
  setVal('c-description', '');

  const logoStatus = document.getElementById('c-logo-status');
  if (logoStatus) logoStatus.textContent = '';
  document.getElementById('bp-dna-section')?.classList.add('hidden');
  setFeedback('company-action-status', '');

  renderPaletteEditor();
  renderLiveBlueprint();
}

function onSelectCompanyBrand(brandId) {
  if (!brandId || brandId === '__new__') {
    resetCompanyForm();
    return;
  }
  const brand = state.brands.find((b) => b.brand_id === brandId);
  if (!brand) return;

  state.company.selectedBrandId = brand.brand_id;
  state.company.palette = [...(brand.approved_palette || [])];
  state.company.logoUrl = brand.logo_url || '';
  state.company.dnaProfile = null;

  const sel = document.getElementById('company-brand-select');
  if (sel) sel.value = brand.brand_id;

  const setVal = (id, v = '') => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  setVal('c-brand-name', brand.brand_name || '');
  setVal('c-audience', brand.target_audience || '');
  setVal('c-mission', brand.mission_statement || '');
  setVal('c-personality', (brand.personality || []).join(', '));
  setVal('c-mood', (brand.mood || []).join(', '));
  setVal('c-tone', (brand.communication_tone || []).join(', '));
  setVal('c-visual-style', (brand.visual_style || []).join(', '));
  setVal('c-disallowed', (brand.disallowed_elements || []).join(', '));
  setVal('c-description', brand.synthesis_explanation || '');

  const logoStatus = document.getElementById('c-logo-status');
  if (logoStatus) {
    logoStatus.textContent = brand.logo_url ? 'Logo attached' : '';
  }
  document.getElementById('bp-dna-section')?.classList.add('hidden');
  setFeedback('company-action-status', '');

  renderPaletteEditor();
  renderLiveBlueprint();
}

function appendChip(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const items = parseCsvList(input.value);
  if (!items.some((x) => x.toLowerCase() === value.toLowerCase())) {
    items.push(value);
  }
  input.value = items.join(', ');
  renderLiveBlueprint();
}

function addPaletteHex(customHex = null) {
  const picker = document.getElementById('c-color-picker');
  const textInput = document.getElementById('c-color-hex');
  const raw = customHex || (textInput && textInput.value.trim()) || (picker && picker.value);
  const hex = normalizeHex(raw);
  if (!hex) {
    showToast('Enter a valid 6-digit HEX code like #3B82F6', 'warning');
    return;
  }
  if (!state.company.palette.includes(hex)) {
    state.company.palette.push(hex);
  }
  if (textInput && !customHex) textInput.value = '';
  renderPaletteEditor();
  renderLiveBlueprint();
}

function removePaletteHex(hex) {
  state.company.palette = state.company.palette.filter((c) => c !== hex);
  renderPaletteEditor();
  renderLiveBlueprint();
}

function renderPaletteEditor() {
  const host = document.getElementById('c-palette-chips');
  if (!host) return;
  if (!state.company.palette.length) {
    host.innerHTML = '<span class="muted mono-sm">Add at least one brand HEX color.</span>';
    return;
  }
  host.innerHTML = state.company.palette
    .map(
      (hex) => `
      <span class="swatch-chip">
        <i class="swatch-dot" style="background:${escapeHtml(hex)}"></i>
        <span>${escapeHtml(hex)}</span>
        <button type="button" class="swatch-rm" onclick="removePaletteHex('${escapeHtml(hex)}')" aria-label="Remove ${escapeHtml(hex)}">&times;</button>
      </span>`
    )
    .join('');
}

async function extractPaletteFromImage(inputEl) {
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    setFeedback('company-action-status', 'Extracting color palette from image...', 'info');
    const res = await apiFetch('/api/v1/brands/extract-palette', { method: 'POST', body: fd });
    const hexes = (res && res.hex_list) || [];
    if (hexes.length) {
      state.company.palette = hexes.slice(0, 6).map(normalizeHex).filter(Boolean);
      renderPaletteEditor();
      renderLiveBlueprint();
      setFeedback('company-action-status', `Extracted ${state.company.palette.length} brand colors from ${file.name}.`, 'success');
      showToast('Brand color palette extracted', 'success');
    } else {
      setFeedback('company-action-status', 'No dominant colors detected in that file.', 'warning');
    }
  } catch (err) {
    setFeedback('company-action-status', err.message, 'error');
    showToast(err.message, 'error');
  } finally {
    inputEl.value = '';
  }
}

async function uploadCompanyLogo(inputEl) {
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await apiFetch('/api/v1/brands/upload-logo', { method: 'POST', body: fd });
    if (res && res.logo_url) {
      state.company.logoUrl = res.logo_url;
      const logoStatus = document.getElementById('c-logo-status');
      if (logoStatus) logoStatus.textContent = `Uploaded: ${res.filename || file.name}`;
      renderLiveBlueprint();
      showToast('Company logo uploaded', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    inputEl.value = '';
  }
}

function readCompanyFormValues() {
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  return {
    brandName: val('c-brand-name'),
    industry: val('c-industry') || 'Technology',
    audience: val('c-audience') || 'Modern digital customers',
    products: val('c-products') || 'Core products and digital experiences',
    mission: val('c-mission'),
    personality: val('c-personality') || 'Authentic, Crisp',
    mood: val('c-mood') || 'Focused, Modern',
    tone: val('c-tone') || 'Clear, Direct',
    visualStyle: val('c-visual-style') || 'Clean, High-Contrast',
    disallowed: val('c-disallowed'),
    description: val('c-description'),
  };
}

function renderLiveBlueprint() {
  const f = readCompanyFormValues();
  const existing = state.brands.find((b) => b.brand_id === state.company.selectedBrandId);

  const nameEl = document.getElementById('bp-name');
  if (nameEl) nameEl.textContent = f.brandName || 'Your Brand Vibes';

  const statusEl = document.getElementById('bp-status');
  if (statusEl) {
    const locked = existing && (existing.is_human_confirmed || existing.status === 'CONFIRMED');
    statusEl.textContent = locked ? 'LOCKED' : existing ? 'DRAFT SAVED' : 'DRAFTING';
    statusEl.classList.toggle('status-confirmed', Boolean(locked));
  }

  const logoWrap = document.getElementById('bp-logo-wrap');
  const logoImg = document.getElementById('bp-logo-img');
  if (logoWrap && logoImg) {
    if (state.company.logoUrl) {
      logoImg.src = state.company.logoUrl;
      logoWrap.classList.remove('hidden');
    } else {
      logoWrap.classList.add('hidden');
    }
  }

  const colorsEl = document.getElementById('bp-colors');
  if (colorsEl) {
    colorsEl.innerHTML = state.company.palette
      .map(
        (hex) => `
        <div class="bp-color-tile">
          <span class="bp-color-block" style="background:${escapeHtml(hex)}"></span>
          <span class="mono-sm">${escapeHtml(hex)}</span>
        </div>`
      )
      .join('');
  }

  const traitsEl = document.getElementById('bp-traits');
  if (traitsEl) {
    const allTraits = [
      ...parseCsvList(f.personality),
      ...parseCsvList(f.mood),
      ...parseCsvList(f.tone),
      ...parseCsvList(f.visualStyle),
    ];
    traitsEl.innerHTML = allTraits.length
      ? allTraits.map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')
      : '<span class="muted mono-sm">Fill traits on the left...</span>';
  }

  const missionEl = document.getElementById('bp-mission');
  if (missionEl) {
    missionEl.textContent = f.mission || f.description || '';
  }

  const avoidEl = document.getElementById('bp-avoid');
  if (avoidEl) {
    const avoid = parseCsvList(f.disallowed);
    avoidEl.innerHTML = avoid.length
      ? avoid.map((w) => `<span class="avoid-tag">${escapeHtml(w)}</span>`).join('')
      : '<span class="muted mono-sm">None defined yet</span>';
  }
}

async function generateBrandVibesWithAI() {
  const f = readCompanyFormValues();
  if (!f.brandName) {
    showToast('Enter a Company / Brand Name first.', 'warning');
    document.getElementById('c-brand-name')?.focus();
    return;
  }

  const btn = document.getElementById('btn-generate-dna');
  if (btn) btn.disabled = true;
  setFeedback('company-action-status', 'Asking Gemini AI to synthesize full Brand Vibes & rules...', 'info');

  try {
    const payload = {
      company_name: f.brandName,
      industry: f.industry,
      business_description: f.description || f.mission || `${f.brandName} operates in ${f.industry} serving ${f.audience}.`,
      products_and_services: f.products,
      target_audience: f.audience,
      company_values: f.personality,
      brand_positioning: f.mission || `${f.visualStyle} identity in ${f.industry}`,
      desired_customer_perception: `${f.mood}; ${f.visualStyle}`,
      communication_personality: `${f.personality}; tone: ${f.tone}`,
      reference_brands: '',
      org_id: (state.session && state.session.org_id) || undefined,
    };

    const dna = await apiFetch('/api/v1/brands/dna/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    state.company.dnaProfile = dna;
    const ai = (dna && dna.ai_recommendations) || {};

    // Hydrate form & palette with Gemini's synthesized vibes so user can inspect or tweak before approving
    if (Array.isArray(ai.brand_personality) && ai.brand_personality.length) {
      document.getElementById('c-personality').value = ai.brand_personality.slice(0, 5).join(', ');
    }
    if (Array.isArray(ai.words_to_avoid) && ai.words_to_avoid.length && !document.getElementById('c-disallowed').value.trim()) {
      document.getElementById('c-disallowed').value = ai.words_to_avoid.slice(0, 6).join(', ');
    }
    if (ai.brand_positioning && !document.getElementById('c-mission').value.trim()) {
      document.getElementById('c-mission').value = ai.brand_positioning;
    }
    if (Array.isArray(ai.colour_hex_codes) && ai.colour_hex_codes.length) {
      state.company.palette = ai.colour_hex_codes.map(normalizeHex).filter(Boolean).slice(0, 6);
      renderPaletteEditor();
    }

    renderDNAPreview(dna);
    renderLiveBlueprint();
    setFeedback('company-action-status', `Gemini generated Brand Vibes (${dna.dna_id}). Review the preview and click Approve & Publish AI Vibes.`, 'success');
    showToast('Gemini AI vibes generated!', 'success');
  } catch (err) {
    setFeedback('company-action-status', err.message, 'error');
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderDNAPreview(dna) {
  const sec = document.getElementById('bp-dna-section');
  const box = document.getElementById('bp-dna-details');
  if (!sec || !box || !dna) return;
  const ai = dna.ai_recommendations || {};
  const pillars = (ai.messaging_guidelines || []).slice(0, 3);
  const avoid = (ai.words_to_avoid || []).slice(0, 4);

  box.innerHTML = `
    <div class="dna-item"><strong>Positioning:</strong> ${escapeHtml(ai.brand_positioning || 'Synthesized')}</div>
    <div class="dna-item"><strong>AI Palette:</strong> ${(ai.colour_hex_codes || []).map((c) => `<code>${escapeHtml(c)}</code>`).join(' ')}</div>
    ${pillars.length ? `<div class="dna-item"><strong>Messaging Pillars:</strong> ${pillars.map((p) => escapeHtml(p)).join(' &bull; ')}</div>` : ''}
    ${avoid.length ? `<div class="dna-item"><strong>Words to Avoid:</strong> ${avoid.map((w) => escapeHtml(w)).join(', ')}</div>` : ''}
    <div class="mono-sm muted">Model: ${escapeHtml(dna.ai_model_used || 'gemini')}</div>
  `;
  sec.classList.remove('hidden');
}

async function approveGeneratedDNA() {
  const dna = state.company.dnaProfile;
  if (!dna || !dna.dna_id) return;
  const btn = document.getElementById('btn-approve-dna');
  if (btn) btn.disabled = true;
  try {
    const approved = await apiFetch(`/api/v1/brands/dna/${encodeURIComponent(dna.dna_id)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved_by: (state.session && state.session.email) || 'Company Brand Owner',
        approval_notes: 'Published via Company Vibes Studio',
        sync_to_platform_brand: true,
      }),
    });
    state.company.dnaProfile = approved;
    state.company.selectedBrandId = approved.brand_id;
    state.dev.selectedBrandId = approved.brand_id;
    await loadBrands();
    onSelectCompanyBrand(approved.brand_id);
    setFeedback('company-action-status', `AI Vibes approved and published for developers as '${approved.brand_id}'.`, 'success');
    showToast(`Published ${approved.company_name} vibes!`, 'success');
  } catch (err) {
    setFeedback('company-action-status', err.message, 'error');
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveAndConfirmBrand() {
  const f = readCompanyFormValues();
  if (!f.brandName) {
    showToast('Company / Brand Name is required.', 'warning');
    document.getElementById('c-brand-name')?.focus();
    return;
  }
  const btn = document.getElementById('btn-save-brand');
  if (btn) btn.disabled = true;
  setFeedback('company-action-status', 'Saving & locking brand vibes...', 'info');

  try {
    let brandId = state.company.selectedBrandId !== '__new__' ? state.company.selectedBrandId : null;

    const fd = new FormData();
    fd.append('brand_name', f.brandName);
    fd.append('personality', f.personality);
    fd.append('mood', f.mood);
    fd.append('communication_tone', f.tone);
    fd.append('target_audience', f.audience);
    fd.append('visual_style', f.visualStyle);
    fd.append('palette', JSON.stringify(state.company.palette));
    fd.append('disallowed_elements', JSON.stringify(parseCsvList(f.disallowed)));
    fd.append('tagline_or_mission', f.mission || f.description);
    fd.append('logo_url', state.company.logoUrl || '');

    const draft = await apiFetch('/api/v1/brands/draft', { method: 'POST', body: fd });
    brandId = draft.brand_id;

    const confirmed = await apiFetch('/api/v1/brands/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        personality: parseCsvList(f.personality),
        mood: parseCsvList(f.mood),
        communication_tone: parseCsvList(f.tone),
        visual_style: parseCsvList(f.visualStyle),
        target_audience: f.audience,
        approved_palette: state.company.palette,
        disallowed_elements: parseCsvList(f.disallowed),
        mission_statement: f.mission || f.description,
        logo_url: state.company.logoUrl || '',
        confirmed_by: (state.session && state.session.email) || 'Company Admin',
      }),
    });

    state.company.selectedBrandId = confirmed.brand_id;
    state.dev.selectedBrandId = confirmed.brand_id;
    await loadBrands();
    onSelectCompanyBrand(confirmed.brand_id);
    setFeedback('company-action-status', `Saved & locked '${confirmed.brand_name}'. Developers can now test against it.`, 'success');
    showToast(`Saved & locked ${confirmed.brand_name}`, 'success');
  } catch (err) {
    setFeedback('company-action-status', err.message, 'error');
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function jumpToCheckWithCurrentBrand() {
  const targetId =
    state.company.selectedBrandId && state.company.selectedBrandId !== '__new__'
      ? state.company.selectedBrandId
      : state.brands[0]?.brand_id || '';
  if (targetId) {
    state.dev.selectedBrandId = targetId;
  }
  navigateTo('check');
  populateBrandSelectors();
}

/* ----------------------------------------------------------------------------
 * PAGE 3: DEVELOPER CHECKS WHETHER THEIR WORK MATCHES
 * ------------------------------------------------------------------------- */
function onSelectDevBrand(brandId) {
  state.dev.selectedBrandId = brandId;
  const sel = document.getElementById('dev-brand-select');
  if (sel && sel.value !== brandId) sel.value = brandId;
  renderDevTargetPreview();
}

function renderDevTargetPreview() {
  const host = document.getElementById('dev-target-preview');
  if (!host) return;
  const brand = state.brands.find((b) => b.brand_id === state.dev.selectedBrandId);
  if (!brand) {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }
  host.classList.remove('hidden');
  const palette = (brand.approved_palette || [])
    .slice(0, 5)
    .map((h) => `<span class="vibes-target-swatch" style="background:${escapeHtml(h)}" title="${escapeHtml(h)}"></span>`)
    .join('');
  const traits = [...(brand.personality || []), ...(brand.mood || []), ...(brand.communication_tone || [])].slice(0, 4);

  host.innerHTML = `
    <span class="vibes-target-name">Target: <strong>${escapeHtml(brand.brand_name)}</strong></span>
    <span class="vibes-target-swatches">${palette}</span>
    ${traits.map((t) => `<span class="vibes-target-tag">${escapeHtml(t)}</span>`).join('')}
  `;
}

function bindDeveloperDropzone() {
  const dz = document.getElementById('dev-dropzone');
  const input = document.getElementById('dev-file-input');
  if (!dz || !input) return;

  dz.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    input.click();
  });
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) {
      setDevFile(input.files[0]);
    }
  });
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('dragover');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      setDevFile(e.dataTransfer.files[0]);
    }
  });
}

function setDevFile(file) {
  state.dev.selectedFile = file;
  state.dev.sampleUrl = '';
  state.dev.sampleName = file.name;
  updateDevFilePreview(file.name, file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
}

async function loadSampleAsset(url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Sample asset not found (${resp.status})`);
    const blob = await resp.blob();
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    state.dev.selectedFile = file;
    state.dev.sampleUrl = url;
    state.dev.sampleName = filename;
    updateDevFilePreview(filename, url);
    showToast(`Loaded sample: ${filename}`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateDevFilePreview(name, imgSrc) {
  const emptyBox = document.getElementById('dev-dropzone-empty');
  const prevBox = document.getElementById('dev-file-preview');
  const img = document.getElementById('dev-preview-img');
  const nameEl = document.getElementById('dev-preview-name');

  if (!name) {
    emptyBox?.classList.remove('hidden');
    prevBox?.classList.add('hidden');
    if (img) {
      img.src = '';
      img.classList.add('hidden');
    }
    return;
  }

  emptyBox?.classList.add('hidden');
  prevBox?.classList.remove('hidden');
  if (nameEl) nameEl.textContent = name;
  if (img) {
    if (imgSrc) {
      img.src = imgSrc;
      img.classList.remove('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
    }
  }
}

function clearDevFile(e) {
  if (e) e.stopPropagation();
  state.dev.selectedFile = null;
  state.dev.sampleUrl = '';
  state.dev.sampleName = '';
  const input = document.getElementById('dev-file-input');
  if (input) input.value = '';
  updateDevFilePreview('', '');
}

function switchCheckSubView(sub) {
  const target = ['input', 'results', 'reviews'].includes(sub) ? sub : 'input';
  state.dev.activeSubView = target;

  ['input', 'results', 'reviews'].forEach((key) => {
    document.getElementById(`tab-check-${key}`)?.classList.toggle('active', key === target);
    const panel = document.getElementById(`check-subview-${key}`);
    if (panel) panel.classList.toggle('hidden', key !== target);
  });

  if (target === 'results') {
    const hasResult = Boolean(state.dev.lastReport || state.dev.lastScan);
    document.getElementById('check-results-empty')?.classList.toggle('hidden', hasResult);
    document.getElementById('check-results-body')?.classList.toggle('hidden', !hasResult);
  } else if (target === 'reviews') {
    loadCheckReviews(false);
  }

  updateDemoVisibility();
}

function selectBrandInputSource(source) {
  const valid = ['website', 'social', 'assets', 'others'].includes(source) ? source : 'website';
  state.dev.activeSource = valid;

  document.querySelectorAll('.vibes-source-card[data-source]').forEach((card) => {
    card.classList.toggle('active', card.dataset.source === valid);
  });

  ['website', 'social', 'assets', 'others'].forEach((key) => {
    const panel = document.getElementById(`source-panel-${key}`);
    if (panel) panel.classList.toggle('hidden', key !== valid);
  });
}

function collectVibesSubmissionMeta() {
  return {
    companyName: (document.getElementById('check-company-name')?.value || '').trim(),
    websiteUrl: (document.getElementById('check-website-url')?.value || '').trim(),
    socialText: (document.getElementById('check-social-input')?.value || '').trim(),
    otherCopy: (document.getElementById('dev-copy-input')?.value || '').trim(),
    hasAsset: Boolean(state.dev.selectedFile || state.dev.sampleUrl),
  };
}

function setScoreRingProgress(scoreNum) {
  const ring = document.getElementById('res-ring-progress');
  const scoreEl = document.getElementById('res-overall-score');
  const circumference = 314.16;

  if (!Number.isFinite(scoreNum)) {
    if (scoreEl) scoreEl.textContent = '--%';
    if (ring) ring.style.strokeDashoffset = String(circumference);
    return;
  }

  const clamped = Math.max(0, Math.min(100, Math.round(scoreNum)));
  if (scoreEl) scoreEl.textContent = `${clamped}%`;
  if (ring) {
    const offset = circumference - (clamped / 100) * circumference;
    ring.style.strokeDashoffset = offset.toFixed(2);
  }
}

function renderVibesDashboard({
  score,
  overallLabel,
  summary,
  enginesLabel,
  chips = [],
  previewTiles = [],
  breakdown = [],
  insights = [],
  channels = [],
  isDemoPreview = false,
}) {
  document.getElementById('check-results-empty')?.classList.add('hidden');
  document.getElementById('check-results-body')?.classList.remove('hidden');

  setScoreRingProgress(score);

  const badgeEl = document.getElementById('res-analysis-badge');
  if (badgeEl) {
    const labelSpan = badgeEl.querySelector('span');
    if (labelSpan) labelSpan.textContent = isDemoPreview ? 'Live Demo Sample' : 'AI-Powered Analysis';
  }

  const titleEl = document.getElementById('res-verdict-title');
  if (titleEl) titleEl.textContent = overallLabel || 'Evaluated';

  const summaryEl = document.getElementById('res-verdict-summary');
  if (summaryEl) summaryEl.textContent = summary || '';

  const engEl = document.getElementById('res-engines');
  if (engEl) engEl.textContent = enginesLabel || '';

  const chipsEl = document.getElementById('res-status-chips');
  if (chipsEl) {
    chipsEl.innerHTML = chips
      .map((c) => {
        const cls = c.warn ? 'vibes-status-chip warn' : 'vibes-status-chip';
        const icon = c.warn ? '&#9888;' : '&#10003;';
        return `<span class="${cls}">${icon} ${escapeHtml(c.label)}</span>`;
      })
      .join('');
  }

  const prevGrid = document.getElementById('res-brand-preview-grid');
  if (prevGrid) {
    prevGrid.innerHTML = previewTiles.length
      ? previewTiles
          .slice(0, 4)
          .map((tile) => {
            if (tile.imgSrc) {
              return `<div class="vibes-preview-tile"><img src="${escapeHtml(tile.imgSrc)}" alt="${escapeHtml(tile.label || 'Preview')}"></div>`;
            }
            const styleAttr = tile.bg ? ` style="background:${escapeHtml(tile.bg)};${tile.color ? `color:${escapeHtml(tile.color)};` : ''}"` : '';
            const cls = tile.dark ? 'vibes-preview-tile dark' : 'vibes-preview-tile';
            return `<div class="${cls}"${styleAttr}><span>${escapeHtml(tile.label || '')}</span></div>`;
          })
          .join('')
      : '<div class="vibes-preview-tile"><span>No visual tile</span></div>';
  }

  const barsEl = document.getElementById('res-breakdown-bars');
  if (barsEl) {
    barsEl.innerHTML = breakdown
      .map((row) => {
        const val = row.pct === null || row.pct === undefined ? null : Math.max(0, Math.min(100, Math.round(row.pct)));
        const widthPct = val === null ? 0 : val;
        const valText = val === null ? 'N/A' : `${val}%`;
        return `
          <div class="vibes-bar-row">
            <span class="vibes-bar-label">${escapeHtml(row.label)}</span>
            <div class="vibes-bar-track"><div class="vibes-bar-fill" style="width:${widthPct}%"></div></div>
            <span class="vibes-bar-val">${escapeHtml(valText)}</span>
          </div>`;
      })
      .join('');
  }

  const insightsEl = document.getElementById('res-ai-insights');
  if (insightsEl) {
    insightsEl.innerHTML = insights.length
      ? insights
          .slice(0, 5)
          .map((item) => {
            const sym = item.type === 'warn' ? '!' : item.type === 'tip' ? '&#9733;' : '&#10003;';
            return `
              <li class="vibes-insight-item">
                <span class="vibes-insight-dot">${sym}</span>
                <span>${escapeHtml(item.text)}</span>
              </li>`;
          })
          .join('')
      : '<li class="vibes-insight-item"><span class="vibes-insight-dot">&#10003;</span><span>No discrepancies flagged across your submitted brand inputs.</span></li>';
  }

  const chanEl = document.getElementById('res-channel-grid');
  if (chanEl) {
    chanEl.innerHTML = channels.length
      ? channels
          .map(
            (ch) => `
            <div class="vibes-platform-tile">
              <span>${escapeHtml(ch.name)}</span>
              <strong>${escapeHtml(ch.value)}</strong>
            </div>`
          )
          .join('')
      : '<div class="vibes-platform-tile"><span>Submission</span><strong>Direct Check</strong></div>';
  }
}

async function ensureDraftBrandForQuickCheck(companyName, meta) {
  const cleanName = companyName || 'Evaluated Brand';
  const fd = new FormData();
  fd.append('brand_name', cleanName);
  fd.append('personality', 'Modern, Professional, Trustworthy');
  fd.append('mood', 'Refined & Consistent');
  fd.append('communication_tone', 'Clear, Confident, Enterprise-Ready');
  fd.append('target_audience', 'Primary customers & brand stakeholders');
  fd.append('visual_style', 'Clean Editorial Design');
  if (meta.websiteUrl) {
    fd.append('tagline_or_mission', `Website: ${meta.websiteUrl}`);
  }
  const draft = await apiFetch('/api/v1/brands/draft', { method: 'POST', body: fd });
  state.dev.selectedBrandId = draft.brand_id;
  await loadBrands();
  onSelectDevBrand(draft.brand_id);
  return draft;
}

async function runDeveloperMatchCheck() {
  const meta = collectVibesSubmissionMeta();
  const hasAnyContent = Boolean(meta.hasAsset || meta.websiteUrl || meta.socialText || meta.otherCopy);
  if (!hasAnyContent) {
    showToast('Enter a Website URL, Social Media handle/copy, Brand Asset, or copy to check.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-run-check');
  const prevHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Running AI Vibes Check...';
  }
  document.getElementById('autofix-output')?.classList.add('hidden');
  document.getElementById('copilot-box')?.classList.add('hidden');

  try {
    let brandId = state.dev.selectedBrandId;
    if (!brandId && meta.companyName) {
      const matched = state.brands.find(
        (b) => (b.brand_name || '').toLowerCase().trim() === meta.companyName.toLowerCase().trim()
      );
      if (matched) {
        brandId = matched.brand_id;
        state.dev.selectedBrandId = brandId;
      }
    }

    // If user uploaded only a visual asset without selecting or naming a brand, run real OpenCV Pre-Flight scan
    if (!brandId && !meta.companyName && meta.hasAsset && !meta.websiteUrl && !meta.socialText && !meta.otherCopy) {
      const fd = new FormData();
      if (state.dev.selectedFile) {
        fd.append('file', state.dev.selectedFile);
      } else if (state.dev.sampleUrl) {
        fd.append('image_url', state.dev.sampleUrl);
      }
      const scan = await apiFetch('/api/v1/inspect/preflight-scan', { method: 'POST', body: fd });
      state.dev.lastScan = scan;
      state.dev.lastReport = null;
      renderPreflightOnlyResult(scan, meta);
      switchCheckSubView('results');
      showToast('Visual vibes scan complete', 'success');
      return;
    }

    // Create a clean workspace draft brand from the submitted company details if none selected yet
    if (!brandId) {
      await ensureDraftBrandForQuickCheck(meta.companyName || 'Brand Evaluation', meta);
      brandId = state.dev.selectedBrandId;
    }

    const combinedCopy = [
      meta.companyName ? `Company: ${meta.companyName}` : '',
      meta.websiteUrl ? `Website URL: ${meta.websiteUrl}` : '',
      meta.socialText ? `Social Media: ${meta.socialText}` : '',
      meta.otherCopy,
    ]
      .filter(Boolean)
      .join('\n');

    const fd = new FormData();
    if (state.dev.selectedFile) {
      fd.append('file', state.dev.selectedFile);
    }
    if (combinedCopy) {
      fd.append('copy_text', combinedCopy);
    }

    const report = await apiFetch(`/api/v1/inspect/${encodeURIComponent(brandId)}`, {
      method: 'POST',
      body: fd,
    });
    state.dev.lastReport = report;
    state.dev.lastScan = null;
    state.dev.copilotHistory = [];
    renderInspectionReport(report, meta);
    switchCheckSubView('results');
    showToast('Vibes check complete', 'success');
  } catch (err) {
    showToast(err.message || 'Vibes check failed', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  }
}

function renderPreflightOnlyResult(scan, meta = {}) {
  const align = scan.brand_alignment;
  const score = align ? Math.round(align.alignment_score) : null;
  const pass = align ? Boolean(align.predicted_pass) : true;
  const detectedSwatches = Array.isArray(scan.dominant_swatches) ? scan.dominant_swatches : [];

  const previewTiles = [];
  const imgPreviewSrc = document.getElementById('dev-preview-img')?.getAttribute('src');
  if (imgPreviewSrc) {
    previewTiles.push({ imgSrc: imgPreviewSrc, label: 'Uploaded Asset' });
  }
  detectedSwatches.slice(0, 4 - previewTiles.length).forEach((hex) => {
    previewTiles.push({ bg: hex, color: '#ffffff', label: hex });
  });

  const warnings = Array.isArray(scan.mismatch_warnings) ? scan.mismatch_warnings : [];
  const insights = [
    scan.predicted_style?.style ? { type: 'ok', text: `Detected style: ${scan.predicted_style.style}` } : null,
    ...warnings.map((w) => ({ type: 'warn', text: w })),
    !warnings.length ? { type: 'tip', text: 'Visual contrast and color balance passed preliminary OpenCV checks.' } : null,
  ].filter(Boolean);

  renderVibesDashboard({
    score,
    overallLabel: (scan.predicted_style && scan.predicted_style.style) || 'Visual Color Telemetry',
    summary: scan.preliminary_disclaimer || 'OpenCV color and visual hierarchy evaluation complete.',
    enginesLabel: 'OpenCV CIELAB + WCAG',
    chips: [
      { label: pass ? 'Color Aligned' : 'Color Drift Detected', warn: !pass },
      scan.contrast?.label ? { label: scan.contrast.label, warn: false } : null,
    ].filter(Boolean),
    previewTiles,
    breakdown: [
      { label: 'Color Alignment', pct: score },
      { label: 'Whitespace Balance', pct: scan.whitespace?.score ?? null },
      { label: 'Contrast Health', pct: scan.contrast?.score ?? null },
    ],
    insights,
    channels: [
      { name: 'Brand Assets', value: score !== null ? `${score}%` : 'Scanned' },
      scan.dimensions?.label ? { name: 'Dimensions', value: scan.dimensions.label } : null,
      meta.websiteUrl ? { name: 'Website URL', value: 'Queued' } : null,
    ].filter(Boolean),
    isDemoPreview: false,
  });
}

function renderInspectionReport(report, meta = {}) {
  const score =
    report.overall_score !== null && report.overall_score !== undefined
      ? Math.round(report.overall_score)
      : Math.round(report.deterministic_score || 0);

  const detScore =
    report.deterministic_score !== null && report.deterministic_score !== undefined
      ? Math.round(report.deterministic_score)
      : null;
  const aiScore =
    report.ai_score !== null && report.ai_score !== undefined
      ? Math.round(report.ai_score)
      : null;

  const verdictRaw = String(report.verdict || 'REQUIRES_HUMAN_REVIEW').toUpperCase();
  const brand = state.brands.find((b) => b.brand_id === report.brand_id);
  const brandLabel = report.brand_name || meta.companyName || 'Brand Profile';

  let overallLabel = `Partial Match · ${brandLabel}`;
  if (verdictRaw === 'APPROVED') {
    overallLabel = brand?.personality?.length
      ? brand.personality.slice(0, 3).join(' • ')
      : `Aligned · ${brandLabel}`;
  } else if (verdictRaw === 'REJECTED') {
    overallLabel = `Off-Brand · ${brandLabel}`;
  }

  const tech = report.technical_summary || {};
  const actionFindings = (report.findings || []).filter((f) => f.severity !== 'PASS' && f.severity !== 'INFO');
  const passFindings = (report.findings || []).filter((f) => f.severity === 'PASS');

  const chips = [
    {
      label: verdictRaw === 'APPROVED' ? 'Consistent' : verdictRaw === 'REJECTED' ? 'Off-Brand' : 'Needs Review',
      warn: verdictRaw !== 'APPROVED',
    },
    { label: `${passFindings.length} Aligned`, warn: false },
    { label: `${actionFindings.length} Gap${actionFindings.length === 1 ? '' : 's'}`, warn: actionFindings.length > 0 },
  ];

  // Preview tiles from actual uploaded visual, detected swatches, or brand palette
  const previewTiles = [];
  const imgPreviewSrc = document.getElementById('dev-preview-img')?.getAttribute('src');
  if (imgPreviewSrc) {
    previewTiles.push({ imgSrc: imgPreviewSrc, label: 'Submitted Creative' });
  }
  previewTiles.push({ dark: true, label: brandLabel });

  const detectedColors = tech.detected_colors || tech.dominant_colors || brand?.approved_palette || [];
  detectedColors.forEach((c) => {
    if (previewTiles.length >= 4) return;
    const hex = typeof c === 'string' ? c : c.hex_code || c.hex || '';
    if (hex) previewTiles.push({ bg: hex, color: '#ffffff', label: hex });
  });
  if (previewTiles.length < 4 && (brand?.typography || meta.websiteUrl)) {
    previewTiles.push({ label: brand?.typography || meta.websiteUrl });
  }

  const breakdown = [
    { label: 'Rule Consistency', pct: detScore },
    { label: 'AI Vibe Alignment', pct: aiScore },
    { label: 'Overall Score', pct: score },
  ];

  const insights = [];
  (report.matching_characteristics || []).slice(0, 2).forEach((m) => {
    insights.push({ type: 'ok', text: m });
  });
  actionFindings.slice(0, 3).forEach((f) => {
    insights.push({
      type: f.severity === 'CRITICAL' ? 'warn' : 'tip',
      text: `${f.title}: ${f.suggested_correction || f.explanation}`,
    });
  });
  if (!insights.length && report.ai_explanation) {
    insights.push({ type: 'ok', text: report.ai_explanation });
  }

  const channels = [];
  if (meta.websiteUrl) channels.push({ name: 'Website', value: `${score}%` });
  if (meta.socialText) channels.push({ name: 'Social Media', value: aiScore !== null ? `${aiScore}%` : `${score}%` });
  if (meta.hasAsset) channels.push({ name: 'Brand Assets', value: detScore !== null ? `${detScore}%` : `${score}%` });
  if (meta.otherCopy) channels.push({ name: 'Copy / Other', value: aiScore !== null ? `${aiScore}%` : `${score}%` });
  if (!channels.length) {
    channels.push({ name: 'Submitted Asset', value: `${score}%` });
  }

  renderVibesDashboard({
    score,
    overallLabel,
    summary:
      report.ai_explanation ||
      (report.mismatches && report.mismatches[0]) ||
      `Governance scan completed for ${brandLabel}.`,
    enginesLabel: tech.ai_provider_used || tech.ai_engine || 'OpenCV + AI Engine',
    chips,
    previewTiles,
    breakdown,
    insights,
    channels,
    isDemoPreview: false,
  });
}

/* ----------------------------------------------------------------------------
 * Live Demo Only Helpers (Strictly hidden for regular registered users)
 * ------------------------------------------------------------------------- */
async function fillDemoVibesCheck() {
  if (!isDemoSession()) return;

  const targetBrand =
    state.brands.find((b) => (b.brand_name || '').toLowerCase().includes('nike')) ||
    state.brands[0];

  const nameEl = document.getElementById('check-company-name');
  const urlEl = document.getElementById('check-website-url');
  const socialEl = document.getElementById('check-social-input');
  const copyEl = document.getElementById('dev-copy-input');

  if (targetBrand) {
    onSelectDevBrand(targetBrand.brand_id);
    if (nameEl) nameEl.value = targetBrand.brand_name;
  } else if (nameEl) {
    nameEl.value = 'Acme Technologies';
  }

  if (urlEl) urlEl.value = 'https://acmetech.example.com';
  if (socialEl) socialEl.value = '@acmetech — Modern cloud governance without compromise.';
  if (copyEl) copyEl.value = 'Enterprise brand consistency across every campaign and touchpoint.';

  await loadSampleAsset('/static/samples/nike_compliant_poster.png', 'nike_compliant_poster.png');
  selectBrandInputSource('website');
  showToast('Live Demo inputs populated — click Run Vibes Check with AI', 'info');
}

function loadLiveDemoResultsPreview() {
  if (!isDemoSession()) {
    showToast('Live Demo preview is available only in Demo Mode.', 'info');
    return;
  }

  state.dev.lastReport = {
    inspection_id: 'demo-preview-acme',
    brand_id: state.dev.selectedBrandId || state.brands[0]?.brand_id || 'demo-brand',
    brand_name: 'Acme Technologies',
    overall_score: 84,
    deterministic_score: 88,
    ai_score: 82,
    verdict: 'APPROVED',
    findings: [
      { severity: 'PASS', title: 'Consistent Tone', explanation: 'Modern and credible enterprise tone across hero copy.' },
      { severity: 'WARNING', title: 'Social Media Visual Drift', explanation: 'Social posts diverge slightly in accent warmth.', suggested_correction: 'Standardise warm sand highlights on social posts.' },
    ],
  };

  renderVibesDashboard({
    score: 84,
    overallLabel: 'Modern • Professional • Trustworthy',
    summary: 'Live Demo preview: A complete brand governance scan across your digital presence.',
    enginesLabel: 'Live Demo Simulation',
    chips: [
      { label: 'Consistent', warn: false },
      { label: 'On-Brand', warn: false },
      { label: 'Minor Gaps', warn: true },
    ],
    previewTiles: [
      { dark: true, label: 'A' },
      { imgSrc: '/static/brand/card-vibes-arch.jpg', label: 'Architecture' },
      { label: 'Acme Technologies' },
      { bg: '#15251f', color: '#d6b684', label: '#15251F' },
    ],
    breakdown: [
      { label: 'Consistency', pct: 90 },
      { label: 'Tone of Voice', pct: 85 },
      { label: 'Visual Identity', pct: 82 },
      { label: 'Cross-Platform Alignment', pct: 78 },
    ],
    insights: [
      { type: 'ok', text: 'Your brand feels modern and credible across platforms.' },
      { type: 'warn', text: 'Social media visuals are slightly less consistent in tone.' },
      { type: 'tip', text: 'Consider aligning your colour usage and typography for a stronger, unified vibe.' },
    ],
    channels: [
      { name: 'Website', value: '88%' },
      { name: 'Instagram', value: '82%' },
      { name: 'LinkedIn', value: '84%' },
      { name: 'YouTube', value: '78%' },
      { name: 'X', value: '80%' },
    ],
    isDemoPreview: true,
  });

  switchCheckSubView('results');
}

/* ----------------------------------------------------------------------------
 * Next Steps: Improvement Plan (Co-Pilot + Auto-Fix) & Download Report
 * ------------------------------------------------------------------------- */
function formatAiMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Headings ### or ##
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:0.75rem 0 0.35rem 0;color:#38bdf8;font-size:0.92rem;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:0.85rem 0 0.4rem 0;color:#ffffff;font-size:1rem;">$1</h3>');
  // Bullet lists
  html = html.replace(/^\* (.*$)/gim, '<li style="margin-left:1.2rem;margin-bottom:0.25rem;">$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li style="margin-left:1.2rem;margin-bottom:0.25rem;">$1</li>');
  // Numbered lists
  html = html.replace(/^(\d+)\. (.*$)/gim, '<li style="margin-left:1.2rem;margin-bottom:0.35rem;list-style-type:decimal;">$2</li>');
  // Paragraph linebreaks
  html = html.replace(/\n\n/g, '</p><p style="margin:0.45rem 0;">');
  return `<p style="margin:0.45rem 0;">${html}</p>`;
}

async function openImprovementPlan() {
  const box = document.getElementById('copilot-box');
  if (box) {
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('copilot-prompt')?.focus();
  }

  // Trigger parallel visual auto-fix
  if (state.dev.selectedFile || state.dev.sampleUrl) {
    runVisualAutoFix();
  }

  const feed = document.getElementById('copilot-messages');
  const report = state.dev.lastReport || state.dev.lastScan;
  const brandId = state.dev.selectedBrandId || state.brands[0]?.brand_id;
  if (!feed || !brandId) return;

  // Active AI generation status
  feed.innerHTML = `
    <div class="chat-msg chat-ai">
      <div style="display:flex;align-items:center;gap:0.55rem;margin-bottom:0.4rem;">
        <span class="ai-pulse-indicator"></span>
        <strong>Brand Co-Pilot AI</strong>
        <span class="copilot-badge">Live LLM Synthesis</span>
      </div>
      <p class="muted" style="margin:0.3rem 0;">Synthesizing a prioritized AI Improvement Plan based on your creative scan and official Brand DNA...</p>
    </div>
  `;

  try {
    const gaps = (report?.findings || []).filter((f) => f.severity !== 'PASS' && f.severity !== 'INFO');
    const discrepancies = gaps.map((g) => `${g.title}: ${g.explanation || g.suggested_correction || ''}`);
    const copyText = (document.getElementById('dev-copy-input')?.value || report?.copy_text || '').trim();

    const res = await apiFetch(`/api/v1/inspect/${encodeURIComponent(brandId)}/copilot-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        message: 'Generate a comprehensive, prioritized AI Improvement Plan to resolve all scan findings and achieve 100% brand compliance.',
        copy_text: copyText || undefined,
        discrepancies: discrepancies,
        intent: 'ai_improvement_plan',
        detected_issues: gaps,
      }),
    });

    state.dev.copilotHistory = [
      { role: 'user', content: 'Generate AI Improvement Plan' },
      { role: 'assistant', content: res.reply || '' }
    ];

    const rewritesHtml = (res.suggested_rewrites || [])
      .slice(0, 3)
      .map((rw) => `<div class="rewrite-pill" onclick="applyCopilotRewrite(this)"><strong>Compliant Rewrite:</strong> ${escapeHtml(rw)}</div>`)
      .join('');

    const formattedReply = formatAiMarkdown(res.reply || '');

    feed.innerHTML = `
      <div class="chat-msg chat-ai">
        <div style="display:flex;align-items:center;gap:0.55rem;margin-bottom:0.5rem;">
          <span class="ai-pulse-indicator"></span>
          <strong>Brand Co-Pilot AI (${escapeHtml(res.brand_name || 'Brand Guardian')})</strong>
          <span class="copilot-badge">AI Plan Ready</span>
        </div>
        <div class="copilot-plan-body">
          ${formattedReply}
        </div>
        ${rewritesHtml ? `<div style="margin-top:0.75rem;"><strong style="font-size:0.82rem;color:#38bdf8;">Click to use recommended variations:</strong>${rewritesHtml}</div>` : ''}
      </div>
    `;
    feed.scrollTop = feed.scrollHeight;
  } catch (err) {
    // Graceful fallback with scan findings if LLM network was temporarily unreachable
    const gaps = (report?.findings || []).filter((f) => f.severity !== 'PASS' && f.severity !== 'INFO');
    const planHtml = gaps.length
      ? gaps
          .slice(0, 4)
          .map((g) => `<div class="rewrite-pill"><strong>${escapeHtml(g.title)}:</strong> ${escapeHtml(g.suggested_correction || g.explanation)}</div>`)
          .join('')
      : '<div class="rewrite-pill">Ask a question below to generate tailored copy rewrites or campaign alignment advice.</div>';
    feed.innerHTML = `
      <div class="chat-msg chat-ai">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
          <span class="ai-pulse-indicator"></span>
          <strong>Brand Co-Pilot:</strong>
        </div>
        <p>Suggested improvement steps based on your scan:</p>
        ${planHtml}
      </div>
    `;
  }
}

function applyCopilotRewrite(el) {
  const text = el.innerText.replace('Compliant Rewrite:', '').trim();
  const input = document.getElementById('dev-copy-input');
  if (input) {
    input.value = text;
    showToast('Applied rewrite to copy input', 'success');
  }
}

function downloadVibesReport() {
  const payload = state.dev.lastReport || state.dev.lastScan;
  if (!payload) {
    showToast('Run a Vibes Check first to download a report.', 'warning');
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanket-vibes-report-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Report downloaded', 'success');
}

/* ----------------------------------------------------------------------------
 * Reviews Sub-Tab (Real Workspace Inspection History — Empty Until Populated)
 * ------------------------------------------------------------------------- */
async function loadCheckReviews(notify = false) {
  const host = document.getElementById('check-reviews-list');
  if (!host) return;
  host.innerHTML = '<div class="muted">Loading reviews...</div>';

  try {
    const reports = await apiFetch('/api/v1/reports');
    const items = Array.isArray(reports) ? reports : [];
    if (!items.length) {
      host.innerHTML = `
        <div class="vibes-empty-state" style="grid-column:1 / -1;">
          <h2>No Reviews Yet</h2>
          <p>Run a check on the <strong>Vibes Check</strong> tab and your submitted audits will appear here.</p>
          <button type="button" class="vibes-run-btn vibes-btn-inline" onclick="switchCheckSubView('input')">
            <span>Start a Vibes Check</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>`;
      return;
    }

    host.innerHTML = items
      .slice(0, 12)
      .map((r) => {
        const score = r.overall_score !== null && r.overall_score !== undefined ? `${Math.round(r.overall_score)}%` : '--';
        const verdict = String(r.verdict || 'REVIEW');
        const created = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
        return `
          <article class="vibes-review-card">
            <div class="vibes-card-head">
              <strong>${escapeHtml(r.brand_name || 'Brand Audit')}</strong>
              <span class="vibes-status-chip${verdict === 'REJECTED' ? ' warn' : ''}">${escapeHtml(verdict)} · ${escapeHtml(score)}</span>
            </div>
            <p class="vibes-results-sub">${escapeHtml(r.ai_explanation || (r.mismatches && r.mismatches[0]) || 'Inspection recorded.')}</p>
            <div class="vibes-label-row" style="margin-top:auto;padding-top:0.5rem;">
              <span class="mono-sm" style="color:#7a746a;">${escapeHtml(created)}</span>
              <button type="button" class="cream-accent-link" onclick="viewSavedReview('${escapeHtml(r.inspection_id)}')">View Result &rarr;</button>
            </div>
          </article>`;
      })
      .join('');

    if (notify) showToast('Reviews refreshed', 'info');
  } catch (err) {
    host.innerHTML = `<div class="inline-feedback error">${escapeHtml(err.message || 'Unable to load reviews')}</div>`;
  }
}

async function viewSavedReview(inspectionId) {
  try {
    const reports = await apiFetch('/api/v1/reports');
    const match = (reports || []).find((r) => r.inspection_id === inspectionId);
    if (!match) {
      showToast('Report not found', 'warning');
      return;
    }
    state.dev.lastReport = match;
    state.dev.lastScan = null;
    if (match.brand_id) state.dev.selectedBrandId = match.brand_id;
    renderInspectionReport(match);
    switchCheckSubView('results');
  } catch (err) {
    showToast(err.message || 'Failed to open review', 'error');
  }
}

/* ----------------------------------------------------------------------------
 * Inline Remediation: Auto-Fix Colors & Groq Brand Co-Pilot
 * ------------------------------------------------------------------------- */
async function runVisualAutoFix() {
  const brandId = state.dev.selectedBrandId;
  if (!brandId) return;
  if (!state.dev.selectedFile && !state.dev.sampleUrl) {
    return;
  }

  const out = document.getElementById('autofix-output');
  if (out) {
    out.classList.remove('hidden');
    out.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.55rem;padding:0.4rem 0;">
        <span class="ai-pulse-indicator"></span>
        <span class="muted">Google Gemini Multimodal Vision is analyzing asset contours &amp; calculating brand palette remediation...</span>
      </div>
    `;
  }

  try {
    const fd = new FormData();
    if (state.dev.selectedFile) {
      fd.append('file', state.dev.selectedFile);
    } else {
      fd.append('image_url', state.dev.sampleUrl);
    }
    const res = await apiFetch(`/api/v1/inspect/${encodeURIComponent(brandId)}/auto-remediate`, {
      method: 'POST',
      body: fd,
    });

    if (out) {
      out.innerHTML = `
        <div class="autofix-header">
          <strong>
            <span class="ai-pulse-indicator"></span>
            Auto-Fixed Preview (Original Preserved)
          </strong>
          <span class="autofix-badge">Score: ${escapeHtml(res.color_compliance_score)}% &middot; WCAG ${escapeHtml(res.new_contrast_ratio)}:1</span>
        </div>
        ${res.ai_vision_diagnosis ? `
          <div class="ai-vision-pill">
            <strong>✨ Gemini Multimodal Vision AI:</strong> ${escapeHtml(res.ai_vision_diagnosis)}
          </div>
        ` : ''}
        ${res.generative_limitation_notice ? `<div class="autofix-note">${escapeHtml(res.generative_limitation_notice)}</div>` : ''}
        <div class="autofix-compare">
          <div>
            <span class="compare-tag tag-orig">ORIGINAL SUBMISSION</span>
            <img src="${escapeHtml(res.original_image_url)}" alt="Original submission">
          </div>
          <div>
            <span class="compare-tag tag-remed">AI REMEDIATED (ΔE &lt; 5.0)</span>
            <img src="${escapeHtml(res.remediated_image_url)}" alt="Remediated output">
          </div>
        </div>
        <div class="autofix-actions">
          <button type="button" class="vibes-run-btn vibes-btn-sm" onclick="acceptRemediation('${escapeHtml(res.remediation_id)}', '${escapeHtml(brandId)}')">
            <span>Accept AI Fix</span>
          </button>
          <button type="button" class="vibes-outline-btn vibes-btn-sm" onclick="rejectRemediation('${escapeHtml(res.remediation_id)}', '${escapeHtml(brandId)}')">
            <span>Keep Original</span>
          </button>
        </div>
      `;
    }
  } catch (err) {
    if (out) out.innerHTML = `<div class="inline-feedback error">${escapeHtml(err.message)}</div>`;
  }
}

async function acceptRemediation(remId, brandId) {
  try {
    const res = await apiFetch(`/api/v1/inspect/${encodeURIComponent(brandId)}/remediation-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        remediation_id: remId,
        decision: 'accept',
        reviewed_by: 'creator_ui',
        notes: 'Remediated variation accepted by creator.'
      })
    });
    showToast('AI Remediation accepted! Staged for final brand signoff.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function rejectRemediation(remId, brandId) {
  try {
    const res = await apiFetch(`/api/v1/inspect/${encodeURIComponent(brandId)}/remediation-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        remediation_id: remId,
        decision: 'reject',
        reviewed_by: 'creator_ui',
        notes: 'Creator opted to keep original file.'
      })
    });
    showToast('Original asset preserved untouched.', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleCopilotBox() {
  const box = document.getElementById('copilot-box');
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    document.getElementById('copilot-prompt')?.focus();
  }
}

async function askBrandCopilot() {
  const brandId = state.dev.selectedBrandId || state.brands[0]?.brand_id;
  const input = document.getElementById('copilot-prompt');
  const feed = document.getElementById('copilot-messages');
  if (!input || !feed) return;
  if (!brandId) {
    showToast('Select or run a brand check first so Co-Pilot has a brand profile.', 'warning');
    return;
  }

  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  feed.innerHTML += `<div class="chat-msg chat-user"><strong>You:</strong> ${escapeHtml(msg)}</div>`;
  feed.scrollTop = feed.scrollHeight;

  const thinkingId = 'cp-think-' + Date.now();
  feed.innerHTML += `
    <div id="${thinkingId}" class="chat-msg chat-ai" style="opacity:0.85;">
      <span class="ai-pulse-indicator"></span>
      <span class="muted">Brand Co-Pilot is analyzing guidelines...</span>
    </div>
  `;
  feed.scrollTop = feed.scrollHeight;

  const report = state.dev.lastReport;
  const copyText = (document.getElementById('dev-copy-input')?.value || '').trim();
  const discrepancies = report
    ? (report.findings || [])
        .filter((f) => f.severity !== 'PASS')
        .map((f) => `${f.title}: ${f.explanation}`)
    : [];

  try {
    const res = await apiFetch(`/api/v1/inspect/${encodeURIComponent(brandId)}/copilot-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        message: msg,
        inspection_id: report?.inspection_id || undefined,
        copy_text: copyText || undefined,
        discrepancies,
        history: state.dev.copilotHistory.slice(-6),
      }),
    });

    state.dev.copilotHistory.push({ role: 'user', content: msg });
    state.dev.copilotHistory.push({ role: 'assistant', content: res.reply || '' });

    const thinkEl = document.getElementById(thinkingId);
    if (thinkEl) thinkEl.remove();

    const rewrites = (res.suggested_rewrites || [])
      .slice(0, 3)
      .map((rw) => `<div class="rewrite-pill" onclick="applyCopilotRewrite(this)"><strong>Compliant Rewrite:</strong> ${escapeHtml(rw)}</div>`)
      .join('');

    const formattedReply = formatAiMarkdown(res.reply || '');

    feed.innerHTML += `
      <div class="chat-msg chat-ai">
        <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.35rem;">
          <span class="ai-pulse-indicator"></span>
          <strong>Brand Co-Pilot:</strong>
        </div>
        ${formattedReply}
        ${rewrites ? `<div style="margin-top:0.6rem;">${rewrites}</div>` : ''}
      </div>`;
    feed.scrollTop = feed.scrollHeight;
  } catch (err) {
    const thinkEl = document.getElementById(thinkingId);
    if (thinkEl) thinkEl.remove();
    feed.innerHTML += `<div class="chat-msg chat-error" style="background:#2a1215;border:1px solid #7f1d1d;color:#fca5a5;padding:0.65rem 0.85rem;border-radius:10px;">${escapeHtml(err.message)}</div>`;
  }
}

/* ----------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadSavedSession();
  bindNavLinks();
  bindHomePullSlidebar();
  bindDeveloperDropzone();

  document.getElementById('c-color-picker')?.addEventListener('input', (e) => {
    const hexEl = document.getElementById('c-color-hex');
    if (hexEl) hexEl.value = e.target.value.toUpperCase();
  });

  document.getElementById('copilot-prompt')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      askBrandCopilot();
    }
  });

  document.addEventListener('click', (e) => {
    const hubWrap = document.querySelector('.hub-avatar-wrap:not(.check-avatar-wrap)');
    if (hubWrap && !hubWrap.contains(e.target)) {
      toggleHubAccountMenu(false);
    }
    const checkWrap = document.querySelector('.check-avatar-wrap');
    if (checkWrap && !checkWrap.contains(e.target)) {
      toggleCheckAccountMenu(false);
    }
  });

  renderPaletteEditor();
  renderLiveBlueprint();

  const initialPage = resolveRoutePage(window.location.pathname);
  navigateTo(initialPage, false);

  loadSystemPills();
  loadBrands();
});
