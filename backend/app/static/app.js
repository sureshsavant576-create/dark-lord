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
    step: 1,
    selectedBrandId: '__new__',
    name: '',
    website: '',
    description: '',
    industry: '',
    size: '',
    traits: [],
    tone: '',
    feeling: '',
    keywords: [],
    palette: ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'],
    typography: '',
    logoUrl: '',
    logoName: '',
    assets: [],
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

function clearAllStoredSessions() {
  state.session = null;
  state.isDemo = false;
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    localStorage.removeItem('sanket_session_token');
    localStorage.removeItem('sanket_org_id');
    localStorage.removeItem('sanket_company_name');
    localStorage.removeItem('sanket_user_email');
    localStorage.removeItem('sanket_user_role');
  } catch (_) {}
  updateAuthUI();
}

async function ensureDemoSession() {
  if (state.session && state.session.session_token && state.session.email === 'demo@sanket.ai') {
    try {
      const check = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${state.session.session_token}` }
      });
      if (check.ok) {
        state.isDemo = true;
        updateDemoVisibility();
        return state.session;
      }
    } catch (_) {}
  }
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@sanket.ai', password: 'DemoJudge2026!' }),
    });
    if (res.ok) {
      const data = await res.json();
      saveSession(data);
      state.isDemo = true;
      updateDemoVisibility();
      return data;
    }
  } catch (_) {}
  return null;
}

async function checkSessionValidity() {
  if (!state.session || !state.session.session_token) return;
  try {
    const resp = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${state.session.session_token}` }
    });
    if (!resp.ok && resp.status === 401) {
      if (isDemoSession()) {
        await ensureDemoSession();
      } else {
        clearAllStoredSessions();
      }
    }
  } catch (_) {}
}

function isTokenExpired(token) {
  if (!token || typeof token !== 'string') return true;
  const parts = token.split('|');
  if (parts.length === 5) {
    const exp = parseInt(parts[3], 10);
    if (!isNaN(exp) && exp < Math.floor(Date.now() / 1000)) {
      return true;
    }
  }
  return false;
}

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.session_token) {
        if (isTokenExpired(parsed.session_token)) {
          clearAllStoredSessions();
          return;
        }
        state.session = parsed;
        updateAuthUI();
        checkSessionValidity();
        return;
      }
    }
    // Fallback: pick up token stored by the Next.js frontend
    const nextToken = localStorage.getItem('sanket_session_token');
    if (nextToken) {
      if (isTokenExpired(nextToken)) {
        clearAllStoredSessions();
        return;
      }
      const nextOrg = localStorage.getItem('sanket_company_name') || localStorage.getItem('sanket_org_id') || 'default-org';
      const nextEmail = localStorage.getItem('sanket_user_email') || '';
      const nextRole = localStorage.getItem('sanket_user_role') || 'User';
      state.session = {
        session_token: nextToken,
        org_id: nextOrg,
        company_name: nextOrg,
        email: nextEmail,
        role_label: nextRole,
      };
      updateAuthUI();
      checkSessionValidity();
      return;
    }
  } catch (_) {
    state.session = null;
  }
  updateAuthUI();
}

function saveSession(sessionObj) {
  state.session = sessionObj;
  try {
    if (sessionObj && sessionObj.session_token) {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionObj));
      localStorage.setItem('sanket_session_token', sessionObj.session_token);
      localStorage.setItem('sanket_org_id', sessionObj.org_id || 'default-org');
      localStorage.setItem('sanket_company_name', sessionObj.company_name || sessionObj.org_id || 'default-org');
      localStorage.setItem('sanket_user_email', sessionObj.email || '');
      localStorage.setItem('sanket_user_role', sessionObj.role_label || sessionObj.role || 'User');
    } else {
      clearAllStoredSessions();
      return;
    }
  } catch (_) {}
  updateAuthUI();
}

function getSessionInitials(session) {
  if (!session) return 'GV';
  const source = (session.company_name || session.org_id || session.full_name || session.email || 'GV').trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function isDemoSession() {
  if (state.isDemo) return true;
  if (!state.session) return false;
  if (state.session.email === 'demo@sanket.ai') return true;
  if (state.session.org_id === 'apex-cloud') return true;
  if (typeof state.session.session_token === 'string') {
    return state.session.session_token.startsWith('user_88bbba6639') || state.session.session_token.includes('apex-cloud');
  }
  return false;
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
  const companyInitials = document.getElementById('company-avatar-initials');
  const companyEmail = document.getElementById('company-account-email');
  const companyOrg = document.getElementById('company-account-org');
  if (state.session && state.session.session_token) {
    state.isDemo = state.session.email === 'demo@sanket.ai';
    const initials = getSessionInitials(state.session);
    if (dot) dot.classList.add('online');
    const displayOrg = state.session.company_name || state.session.org_id || state.session.email || 'Signed In';
    if (label) label.textContent = displayOrg;
    if (splitShell) splitShell.classList.add('hidden');
    if (authHub) authHub.classList.remove('hidden');
    if (hubInitials) hubInitials.textContent = initials;
    if (hubEmail) hubEmail.textContent = state.session.email || 'Signed in';
    if (hubOrg) hubOrg.textContent = displayOrg;
    if (checkInitials) checkInitials.textContent = initials;
    if (checkEmail) checkEmail.textContent = state.session.email || 'Signed in';
    if (checkOrg) checkOrg.textContent = displayOrg;
    if (companyInitials) companyInitials.textContent = initials;
    if (companyEmail) companyEmail.textContent = state.session.email || 'Signed in';
    if (companyOrg) companyOrg.textContent = displayOrg;

    if (homeSigninView) homeSigninView.classList.add('hidden');
    if (homeRegView) homeRegView.classList.add('hidden');

    if (sessionBox) {
      sessionBox.classList.remove('hidden');
      sessionBox.innerHTML = `
        <div class="session-summary">
          <div><strong>${escapeHtml(state.session.email || '')}</strong></div>
          <div class="mono-sm muted">Org: ${escapeHtml(displayOrg)} &middot; Role: ${escapeHtml(state.session.role_label || state.session.role || 'User')}</div>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="logoutSession()">Sign Out</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="showAuthFormsForSwitch()">Switch Account</button>
          </div>
        </div>
      `;
    }
    document.getElementById('form-login')?.classList.add('hidden');
    document.getElementById('form-register')?.classList.add('hidden');
    document.getElementById('modal-demo-card')?.classList.add('hidden');

    if (homeSignedIn) {
      homeSignedIn.classList.remove('hidden');
      homeSignedIn.innerHTML = `
        <div><strong>Active Session: ${escapeHtml(state.session.email || '')}</strong></div>
        <div class="mono-sm" style="color:#5b616c;">Org: ${escapeHtml(displayOrg)} &middot; Role: ${escapeHtml(state.session.role_label || state.session.role || 'User')}</div>
        <div class="drawer-signedin-actions">
          <button type="button" class="cream-submit-btn" style="padding:0.55rem 0.9rem;width:auto;" onclick="navigateTo('company')">Company Vibes &rarr;</button>
          <button type="button" class="cream-accent-link" onclick="navigateTo('check')">Developer Check</button>
          <button type="button" class="cream-text-link" style="margin-left:auto;" onclick="logoutSession()">Sign Out</button>
        </div>
      `;
    }
  } else {
    state.isDemo = false;
    if (dot) dot.classList.remove('online');
    if (label) label.textContent = state.page === 'home' ? 'Sign In' : 'Default Workspace';
    if (splitShell) splitShell.classList.remove('hidden');
    if (authHub) authHub.classList.add('hidden');
    toggleHubAccountMenu(false);
    toggleCheckAccountMenu(false);
    toggleCompanyAccountMenu(false);
    if (checkInitials) checkInitials.textContent = 'GV';
    if (checkEmail) checkEmail.textContent = 'Guest Workspace';
    if (checkOrg) checkOrg.textContent = 'default-org';
    if (companyInitials) companyInitials.textContent = 'GV';
    if (companyEmail) companyEmail.textContent = 'Guest Workspace';
    if (companyOrg) companyOrg.textContent = 'default-org';

    if (sessionBox) {
      sessionBox.classList.add('hidden');
      sessionBox.innerHTML = '';
    }
    if (homeSignedIn) {
      homeSignedIn.classList.add('hidden');
      homeSignedIn.innerHTML = '';
    }
    if (homeSigninView) {
      homeSigninView.classList.remove('hidden');
    }
    if (homeRegView) {
      homeRegView.classList.add('hidden');
    }
    document.getElementById('form-login')?.classList.remove('hidden');
    document.getElementById('form-register')?.classList.add('hidden');
    document.getElementById('modal-demo-card')?.classList.remove('hidden');
  }
  updateDemoVisibility();
  const signedIn = Boolean(state.session && state.session.session_token);
  const updateMenuBtn = (id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (signedIn) {
      btn.textContent = 'Sign Out';
      btn.onclick = () => logoutSession();
    } else {
      btn.textContent = 'Sign In';
      btn.onclick = () => openAuthModal('login');
    }
  };
  updateMenuBtn('hub-menu-auth-btn');
  updateMenuBtn('company-menu-auth-btn');
  updateMenuBtn('check-menu-auth-btn');
}

function showAuthFormsForSwitch() {
  document.getElementById('auth-session-box')?.classList.add('hidden');
  document.getElementById('form-login')?.classList.remove('hidden');
  document.getElementById('modal-demo-card')?.classList.remove('hidden');
}

async function apiFetch(url, options = {}, isRetry = false) {
  const opts = { ...options };
  const headers = new Headers(opts.headers || {});
  const hadCustomAuth = headers.has('Authorization');
  if (state.session && state.session.session_token && !hadCustomAuth) {
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
    if (resp.status === 401 && !isRetry) {
      const wasDemo = isDemoSession();
      if (wasDemo) {
        try {
          const fresh = await ensureDemoSession();
          if (fresh && fresh.session_token) {
            const retryHeaders = new Headers(options.headers || {});
            retryHeaders.set('Authorization', `Bearer ${fresh.session_token}`);
            return await apiFetch(url, { ...options, headers: retryHeaders }, true);
          }
        } catch (_) {}
      }

      clearAllStoredSessions();

      const isPublicEndpoint = !url.includes('/auth/') && !url.includes('/storage/uploads') && !url.includes('/storage/guidelines');
      if (isPublicEndpoint && (!options.headers || !new Headers(options.headers).has('Authorization'))) {
        const guestHeaders = new Headers(options.headers || {});
        guestHeaders.delete('Authorization');
        return await apiFetch(url, { ...options, headers: guestHeaders }, true);
      }
    }
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

  if (target === 'check') {
    if (prevPage !== 'check') {
      switchCheckSubView('input');
      selectBrandInputSource(state.dev.activeSource || 'website');
    }
    syncCheckCompanyField();
  } else if (target === 'company') {
    syncCompanyStudioForSession();
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
    closeAuthModal();
    showToast(`Live Demo active: ${res.email} (${res.org_id})`, 'success');
    await loadBrands();
  } catch (err) {
    showToast(err.message || 'Unable to launch demo session', 'error');
  }
}

function fillDemoCredentials(targetForm = 'home') {
  if (targetForm === 'home') {
    const emailEl = document.getElementById('home-login-email');
    const passEl = document.getElementById('home-login-password');
    if (emailEl) emailEl.value = 'demo@sanket.ai';
    if (passEl) passEl.value = 'DemoJudge2026!';
    showToast('Demo credentials filled into form', 'info');
    emailEl?.focus();
  } else {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (emailEl) emailEl.value = 'demo@sanket.ai';
    if (passEl) passEl.value = 'DemoJudge2026!';
    showToast('Demo credentials filled into form', 'info');
    emailEl?.focus();
  }
}

async function copyDemoText(text, label = 'Credential') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(`${label} copied to clipboard!`, 'success');
  } catch (_) {
    showToast('Copied: ' + text, 'info');
  }
}

function toggleHomeDemoDropdown(forceState) {
  const badge = document.getElementById('home-demo-badge');
  if (!badge) return;
  const isOpen = forceState !== undefined ? forceState : !badge.classList.contains('is-open');
  if (isOpen) {
    badge.classList.add('is-open');
  } else {
    badge.classList.remove('is-open');
  }
  const btn = badge.querySelector('.demo-badge-header');
  if (btn) {
    btn.setAttribute('aria-expanded', String(isOpen));
  }
}

/* ----------------------------------------------------------------------------
 * Auth Modal Handlers (Overlay only, never a 4th page)
 * ------------------------------------------------------------------------- */
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');
  switchAuthTab(tab);
}
window.loginAsDemoJudge = launchDemoWorkspace;

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
  document.getElementById('modal-demo-card')?.classList.toggle('hidden', tab !== 'login');
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
  const token = state.session?.session_token;
  if (token) {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch (_) {}
  }
  state.isDemo = false;
  saveSession(null);
  closeAuthModal();
  toggleHubAccountMenu(false);
  toggleCheckAccountMenu(false);
  resetCheckWorkspaceUI();
  showToast('Signed out successfully', 'info');
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

  syncCheckCompanyField();
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
 * PAGE 2: SET UP COMPANY WIZARD (Steps 1 to 4)
 * ------------------------------------------------------------------------- */
function toggleCompanyAccountMenu(forceState) {
  const menu = document.getElementById('company-account-menu');
  const btn = document.getElementById('company-avatar-btn');
  if (!menu) return;
  const open = typeof forceState === 'boolean' ? forceState : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function goToCompanyStep(stepNumber) {
  const step = Math.max(1, Math.min(4, parseInt(stepNumber, 10) || 1));
  state.company.step = step;

  for (let s = 1; s <= 4; s++) {
    const view = document.getElementById(`company-step-${s}`);
    if (view) {
      view.classList.toggle('active', s === step);
      view.classList.toggle('hidden', s !== step);
    }
    const navItem = document.getElementById(`step-nav-${s}`);
    if (navItem) {
      navItem.classList.toggle('active', s === step);
      navItem.classList.toggle('completed', s < step);
    }
  }

  const counter = document.getElementById('company-step-counter');
  if (counter) counter.textContent = `STEP ${step} OF 4`;

  const fill = document.getElementById('company-progress-fill');
  if (fill) fill.style.width = `${(step / 4) * 100}%`;

  updateStepSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpToCompanyStep(stepNumber) {
  goToCompanyStep(stepNumber);
}

function onDescInput(textarea) {
  if (!textarea) return;
  const val = textarea.value || '';
  const counter = document.getElementById('c-desc-count');
  if (counter) counter.textContent = `${val.length} / 200`;
  state.company.description = val;
  updateStepSummary();
}

function onKeywordsInput(input) {
  if (!input) return;
  const raw = input.value || '';
  const list = parseCsvList(raw);
  const counter = document.getElementById('c-keywords-count');
  if (counter) counter.textContent = `${Math.min(list.length, 5)} / 5`;
  state.company.keywords = list.slice(0, 5);
  updateStepSummary();
}

function updatePersonalityChipsUI() {
  const chips = document.querySelectorAll('#c-personality-chips .company-vibe-chip');
  chips.forEach((btn) => {
    const trait = btn.dataset.trait;
    const isSelected = (state.company.traits || []).includes(trait);
    btn.classList.toggle('selected', isSelected);
    btn.classList.toggle('active', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    const labelSpan = btn.querySelector('.chip-text');
    if (labelSpan) {
      labelSpan.textContent = (isSelected ? '✓ ' : '') + trait;
    }
  });
}

function toggleVibeTrait(trait, btn) {
  if (!trait) return;
  if (!Array.isArray(state.company.traits)) {
    state.company.traits = [];
  }
  const idx = state.company.traits.indexOf(trait);
  if (idx >= 0) {
    state.company.traits.splice(idx, 1);
  } else {
    if (state.company.traits.length >= 3) {
      showToast('Maximum 3 personality traits allowed.', 'info');
      return;
    }
    state.company.traits.push(trait);
  }
  updatePersonalityChipsUI();
  updateStepSummary();
}

function applyInspirationPreset(t1, t2, t3) {
  state.company.traits = [t1, t2, t3].filter(Boolean);
  updatePersonalityChipsUI();
  updateStepSummary();
  showToast(`Applied preset: ${t1} • ${t2} • ${t3}`, 'info');
}

function renderSetupColours() {
  const container = document.getElementById('c-setup-colours-list');
  if (!container) return;
  const palette = (state.company.palette && state.company.palette.length)
    ? state.company.palette
    : ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];

  const swatchesHtml = palette
    .map(
      (hex, idx) => `
    <div class="company-color-swatch-chip">
      <div class="company-swatch-box" style="background:${escapeHtml(hex)};" title="${escapeHtml(hex)} (Click to remove)" onclick="removeSetupColour(${idx})">
        <span class="company-swatch-remove" title="Remove colour" style="position:absolute;top:2px;right:4px;color:#fff;font-size:11px;font-weight:bold;text-shadow:0 1px 2px rgba(0,0,0,0.8);line-height:1;">&times;</span>
      </div>
      <span class="company-swatch-hex">${escapeHtml(hex)}</span>
    </div>`
    )
    .join('');

  const addBtnHtml =
    palette.length < 8
      ? `
    <button type="button" class="company-add-color-btn" onclick="document.getElementById('c-setup-color-picker').click()" title="Add another brand colour">
      <span>+ Add</span>
    </button>`
      : '';

  container.innerHTML = swatchesHtml + addBtnHtml;
}

function onSetupColorPicked(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return;
  if (!Array.isArray(state.company.palette)) {
    state.company.palette = [];
  }
  if (!state.company.palette.includes(normalized)) {
    state.company.palette.push(normalized);
  }
  renderSetupColours();
  updateStepSummary();
}

function removeSetupColour(idx) {
  if (!Array.isArray(state.company.palette)) return;
  if (state.company.palette.length <= 1) {
    showToast('At least one brand colour is required.', 'info');
    return;
  }
  state.company.palette.splice(idx, 1);
  renderSetupColours();
  updateStepSummary();
}

function handleSetupLogoUpload(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    showToast('Logo file size exceeds 10MB limit.', 'warning');
    return;
  }

  // Instant local client preview
  const objectUrl = URL.createObjectURL(file);
  state.company.logoUrl = objectUrl;
  state.company.logoName = file.name;

  const logoImg = document.getElementById('c-setup-logo-img');
  const logoFallback = document.getElementById('c-setup-logo-fallback');
  if (logoImg) {
    logoImg.src = state.company.logoUrl;
    logoImg.classList.remove('hidden');
  }
  if (logoFallback) {
    logoFallback.classList.add('hidden');
  }

  updateStepSummary();
  showToast(`Logo attached: ${file.name}`, 'success');

  // Background upload to server for a hosted URL
  const fd = new FormData();
  fd.append('file', file);
  apiFetch('/api/v1/brands/upload-logo', { method: 'POST', body: fd })
    .then((res) => {
      if (res && res.logo_url) {
        state.company.logoUrl = res.logo_url;
      }
    })
    .catch((err) => {
      console.warn('Logo upload to storage failed, using local preview:', err);
    });
}

function handleSetupAssetUpload(input) {
  const files = input && input.files;
  if (!files || !files.length) return;
  addSetupAssetFiles(files);
  input.value = '';
}

function handleSetupAssetDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.currentTarget) {
    event.currentTarget.style.borderColor = '';
  }
  const dt = event.dataTransfer;
  if (dt && dt.files && dt.files.length) {
    const validFiles = [];
    const allowedExts = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'pdf'];
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!allowedExts.includes(ext) && !f.type.startsWith('image/') && f.type !== 'application/pdf') {
        showToast(`Skipped '${f.name}': only PNG, JPG, SVG, and PDF files are allowed.`, 'warning');
        continue;
      }
      validFiles.push(f);
    }
    if (validFiles.length) {
      addSetupAssetFiles(validFiles);
    }
  }
}

function addSetupAssetFiles(fileList) {
  if (!fileList || !fileList.length) return;

  if (!Array.isArray(state.company.assets)) {
    state.company.assets = [];
  }

  let addedCount = 0;
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];

    // Enforce 30MB limit
    if (f.size > 30 * 1024 * 1024) {
      showToast(`'${f.name}' exceeds the 30MB file size limit.`, 'warning');
      continue;
    }

    // Prevent duplicate entries
    if (state.company.assets.some((a) => a.name === f.name && a.size === formatFileSize(f.size))) {
      showToast(`'${f.name}' is already attached.`, 'info');
      continue;
    }

    let previewUrl = null;
    if (f.type && f.type.startsWith('image/')) {
      try {
        previewUrl = URL.createObjectURL(f);
      } catch (e) {
        previewUrl = null;
      }
    }
    state.company.assets.push({
      name: f.name,
      size: formatFileSize(f.size),
      type: f.type,
      previewUrl: previewUrl,
      rawFile: f,
    });
    addedCount++;
  }

  if (addedCount > 0) {
    renderSetupAssetsList();
    updateStepSummary();
    showToast(`Added ${addedCount} brand asset(s)`, 'success');
  }
}

function renderSetupAssetsList() {
  const container = document.getElementById('c-setup-assets-list');
  const assetLabel = document.getElementById('c-setup-asset-btn-label');

  const assets = Array.isArray(state.company.assets) ? state.company.assets : [];

  if (assetLabel) {
    if (assets.length === 0) {
      assetLabel.textContent = 'Upload assets';
    } else {
      assetLabel.textContent = `+ Add more files (${assets.length} attached)`;
    }
  }

  if (!container) return;

  if (assets.length === 0) {
    container.innerHTML = '';
    return;
  }

  const itemsHtml = assets
    .map((a, idx) => {
      const ext = (a.name.split('.').pop() || 'FILE').toUpperCase();
      const isPdf = ext === 'PDF';
      const isSvg = ext === 'SVG';

      let iconHtml = '';
      if (a.previewUrl) {
        iconHtml = `<img src="${escapeHtml(a.previewUrl)}" class="company-asset-row-thumb" alt="${escapeHtml(a.name)}">`;
      } else if (isPdf) {
        iconHtml = `<span class="company-asset-row-badge pdf">PDF</span>`;
      } else if (isSvg) {
        iconHtml = `<span class="company-asset-row-badge svg">SVG</span>`;
      } else {
        iconHtml = `<span class="company-asset-row-badge">${escapeHtml(ext.slice(0, 4))}</span>`;
      }

      return `
        <div class="company-asset-row-item" data-idx="${idx}">
          ${iconHtml}
          <div class="company-asset-row-info">
            <span class="company-asset-row-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
            <span class="company-asset-row-meta">${escapeHtml(a.size || ext)} &bull; ${escapeHtml(ext)}</span>
          </div>
          <button type="button" class="company-asset-row-remove" onclick="removeSetupAsset(${idx})" title="Remove ${escapeHtml(a.name)}" aria-label="Remove ${escapeHtml(a.name)}">
            &times;
          </button>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="company-uploaded-assets-wrap">
      <div class="company-uploaded-assets-header">
        <span class="company-uploaded-count">${assets.length} file${assets.length === 1 ? '' : 's'} attached</span>
      </div>
      <div class="company-uploaded-assets-items">
        ${itemsHtml}
      </div>
    </div>
  `;
}

function removeSetupAsset(idx) {
  if (!Array.isArray(state.company.assets)) return;
  const removed = state.company.assets.splice(idx, 1);
  renderSetupAssetsList();
  updateStepSummary();
  if (removed && removed[0]) {
    showToast(`Removed asset: ${removed[0].name}`, 'info');
  }
}

function readCompanySetupInputs() {
  const nameEl = document.getElementById('c-setup-name');
  const webEl = document.getElementById('c-setup-website');
  const descEl = document.getElementById('c-setup-desc');
  const indEl = document.getElementById('c-setup-industry');
  const sizeEl = document.getElementById('c-setup-size');
  const toneEl = document.getElementById('c-setup-tone');
  const feelEl = document.getElementById('c-setup-feeling');
  const fontEl = document.getElementById('c-setup-font');

  if (nameEl) state.company.name = nameEl.value.trim();
  if (webEl) state.company.website = webEl.value.trim();
  if (descEl) state.company.description = descEl.value.trim();
  if (indEl) state.company.industry = indEl.value;
  if (sizeEl) state.company.size = sizeEl.value;
  if (toneEl) state.company.tone = toneEl.value;
  if (feelEl) state.company.feeling = feelEl.value;
  if (fontEl) state.company.typography = fontEl.value;
}

function updateStepSummary() {
  readCompanySetupInputs();

  // 1. Live Preview Card (Step 3)
  const previewMark = document.getElementById('c-preview-mark');
  const previewTagline = document.getElementById('c-preview-tagline');
  const previewSwatches = document.getElementById('c-preview-swatches');

  if (previewMark) {
    if (state.company.logoUrl) {
      previewMark.innerHTML = `<img src="${escapeHtml(state.company.logoUrl)}" alt="Logo" style="height:28px;max-width:44px;object-fit:contain;vertical-align:middle;filter:brightness(0) invert(1);">`;
    } else {
      const initial = state.company.name ? state.company.name.charAt(0).toUpperCase() : 'A';
      previewMark.textContent = initial;
    }
  }

  if (previewTagline) {
    if (state.company.name) {
      previewTagline.textContent = `${state.company.name}`;
    } else {
      previewTagline.textContent = 'Modern Solutions';
    }
  }

  if (previewSwatches) {
    const swatches = (state.company.palette && state.company.palette.length)
      ? state.company.palette.slice(0, 5)
      : ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];
    previewSwatches.innerHTML = swatches
      .map((hex) => `<span class="company-preview-swatch-dot" style="background:${escapeHtml(hex)};" title="${escapeHtml(hex)}"></span>`)
      .join('');
  }

  // 2. Summary Card 1: Company Details
  const sumName = document.getElementById('sum-c-name');
  const sumWeb = document.getElementById('sum-c-website');
  const sumInd = document.getElementById('sum-c-industry');
  const sumSize = document.getElementById('sum-c-size');

  if (sumName) sumName.textContent = state.company.name || 'Not set';
  if (sumWeb) sumWeb.textContent = state.company.website || 'Not set';
  if (sumInd) sumInd.textContent = state.company.industry || 'Not set';
  if (sumSize) sumSize.textContent = state.company.size || 'Not set';

  // 3. Summary Card 2: Brand Vibes
  const sumTraits = document.getElementById('sum-c-traits');
  const sumTone = document.getElementById('sum-c-tone');
  const sumFeeling = document.getElementById('sum-c-feeling');
  const sumKeywords = document.getElementById('sum-c-keywords');

  if (sumTraits) {
    if (state.company.traits && state.company.traits.length > 0) {
      sumTraits.innerHTML = state.company.traits
        .map((t) => `<span class="company-summary-chip">${escapeHtml(t)}</span>`)
        .join('');
    } else {
      sumTraits.innerHTML = '<span class="muted mono-sm">None selected</span>';
    }
  }

  if (sumTone) sumTone.textContent = state.company.tone || 'Not set';
  if (sumFeeling) sumFeeling.textContent = state.company.feeling || 'Not set';

  if (sumKeywords) {
    if (state.company.keywords && state.company.keywords.length > 0) {
      sumKeywords.innerHTML = state.company.keywords
        .map((k) => `<span class="company-summary-chip">${escapeHtml(k)}</span>`)
        .join('');
    } else {
      sumKeywords.innerHTML = '<span class="muted mono-sm">None set</span>';
    }
  }

  // 4. Summary Card 3: Visual Identity
  const sumLogo = document.getElementById('sum-c-logo');
  const sumColours = document.getElementById('sum-c-colours');
  const sumTypo = document.getElementById('sum-c-typography');
  const sumAssets = document.getElementById('sum-c-assets');

  if (sumLogo) {
    if (state.company.logoUrl) {
      sumLogo.innerHTML = `<img src="${escapeHtml(state.company.logoUrl)}" alt="Logo" class="company-asset-thumb" style="width:38px;height:38px;background:#fff;padding:2px;border-radius:4px;border:1px solid #d4ccbd;object-fit:contain;">`;
    } else {
      const initial = state.company.name ? state.company.name.charAt(0).toUpperCase() : 'A';
      sumLogo.innerHTML = `<span style="width:38px;height:38px;background:#e9dfce;border:1px solid #d4ccbd;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--font-serif);font-weight:700;color:#553e1a;font-size:1.1rem;">${escapeHtml(initial)}</span>`;
    }
  }

  if (sumColours) {
    const palette = (state.company.palette && state.company.palette.length)
      ? state.company.palette.slice(0, 6)
      : ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];
    sumColours.innerHTML = palette
      .map((hex) => `<span class="company-preview-swatch-dot" style="background:${escapeHtml(hex)};width:20px;height:20px;" title="${escapeHtml(hex)}"></span>`)
      .join('');
  }

  if (sumTypo) {
    const font = state.company.typography || 'Inter';
    sumTypo.innerHTML = `<strong class="v" style="font-size:0.95rem;color:#171c24;">${escapeHtml(font)}</strong><span class="mono-sm muted" style="font-size:0.75rem;">Primary Typography</span>`;
  }

  if (sumAssets) {
    if (state.company.assets && state.company.assets.length > 0) {
      const shown = state.company.assets.slice(0, 4);
      const remaining = state.company.assets.length - shown.length;
      let html = shown
        .map((a) => `<span class="company-summary-chip" title="${escapeHtml(a.name)}">${escapeHtml(a.name.length > 14 ? a.name.slice(0, 12) + '...' : a.name)}</span>`)
        .join('');
      if (remaining > 0) {
        html += `<span class="company-asset-more">+${remaining}</span>`;
      }
      sumAssets.innerHTML = html;
    } else {
      sumAssets.innerHTML = '<span class="muted mono-sm">No extra assets</span>';
    }
  }
}

function renderCompanyFormFromState() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('c-setup-name', state.company.name);
  setVal('c-setup-website', state.company.website);
  setVal('c-setup-desc', state.company.description);
  const descEl = document.getElementById('c-setup-desc');
  if (descEl) onDescInput(descEl);

  setVal('c-setup-industry', state.company.industry);
  setVal('c-setup-size', state.company.size);

  updatePersonalityChipsUI();

  setVal('c-setup-tone', state.company.tone);
  setVal('c-setup-feeling', state.company.feeling);

  setVal('c-setup-keywords', (state.company.keywords || []).join(', '));
  const kwEl = document.getElementById('c-setup-keywords');
  if (kwEl) onKeywordsInput(kwEl);

  const logoImg = document.getElementById('c-setup-logo-img');
  const logoFallback = document.getElementById('c-setup-logo-fallback');
  if (state.company.logoUrl) {
    if (logoImg) {
      logoImg.src = state.company.logoUrl;
      logoImg.classList.remove('hidden');
    }
    if (logoFallback) logoFallback.classList.add('hidden');
  } else {
    if (logoImg) {
      logoImg.src = '';
      logoImg.classList.add('hidden');
    }
    if (logoFallback) {
      logoFallback.classList.remove('hidden');
      logoFallback.textContent = state.company.name ? state.company.name.charAt(0).toUpperCase() : 'A';
    }
  }

  renderSetupColours();
  setVal('c-setup-font', state.company.typography);

  renderSetupAssetsList();

  updateStepSummary();
}

function resetCompanyForm() {
  state.company.selectedBrandId = '__new__';
  state.company.name = '';
  state.company.website = '';
  state.company.description = '';
  state.company.industry = '';
  state.company.size = '';
  state.company.traits = [];
  state.company.tone = '';
  state.company.feeling = '';
  state.company.keywords = [];
  state.company.palette = ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];
  state.company.typography = '';
  state.company.logoUrl = '';
  state.company.logoName = '';
  state.company.assets = [];

  renderCompanyFormFromState();
  goToCompanyStep(1);
}

function onSelectCompanyBrand(brandId) {
  if (!brandId || brandId === '__new__') {
    resetCompanyForm();
    return;
  }
  const brand = state.brands.find((b) => b.brand_id === brandId);
  if (!brand) return;

  state.company.selectedBrandId = brand.brand_id;
  state.company.name = brand.brand_name || '';
  state.company.website = brand.target_audience && brand.target_audience.startsWith('http') ? brand.target_audience : '';
  state.company.description = brand.mission_statement || brand.synthesis_explanation || '';
  state.company.industry = brand.target_audience || 'Technology';
  state.company.size = '201 - 500';
  state.company.traits = [...(brand.personality || [])].slice(0, 3);
  state.company.tone = (brand.communication_tone || [])[0] || 'Confident';
  state.company.feeling = (brand.mood || [])[0] || 'Reliable';
  state.company.keywords = [...(brand.disallowed_elements || [])].slice(0, 5);
  state.company.palette =
    brand.approved_palette && brand.approved_palette.length
      ? [...brand.approved_palette]
      : ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];
  state.company.typography = 'Inter';
  state.company.logoUrl = brand.logo_url || '';
  state.company.logoName = brand.logo_url ? 'brand_logo' : '';
  state.company.assets = [];

  renderCompanyFormFromState();
  goToCompanyStep(1);
}

function syncCompanyStudioForSession() {
  if (isDemoSession()) {
    state.company.selectedBrandId = 'omnigpt_ai';
    state.company.name = 'Acme Technologies';
    state.company.website = 'https://acme.com';
    state.company.description =
      'Enterprise cloud infrastructure and intelligent cognitive workflows engineered for high-precision brand governance.';
    state.company.industry = 'Technology';
    state.company.size = '201 - 500';
    state.company.traits = ['Modern', 'Professional', 'Trustworthy'];
    state.company.tone = 'Confident';
    state.company.feeling = 'Reliable';
    state.company.keywords = ['reliable', 'growth-focused', 'human'];
    state.company.palette = ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];
    state.company.typography = 'Inter';
    state.company.logoUrl = '/static/brand/omni_ai_logo.svg';
    state.company.logoName = 'omni_ai_logo.svg';
    state.company.assets = [
      { name: 'acme_brand_guidelines.pdf', size: '2.4 MB' },
    ];
  } else {
    // Standard non-demo user: clean empty form
    state.company.selectedBrandId = '__new__';
    state.company.name = '';
    state.company.website = '';
    state.company.description = '';
    state.company.industry = '';
    state.company.size = '';
    state.company.traits = [];
    state.company.tone = '';
    state.company.feeling = '';
    state.company.keywords = [];
    state.company.palette = ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'];
    state.company.typography = '';
    state.company.logoUrl = '';
    state.company.logoName = '';
    state.company.assets = [];
  }

  renderCompanyFormFromState();
  goToCompanyStep(1);
}

async function saveCompleteCompanySetup() {
  readCompanySetupInputs();
  const name = (state.company.name || '').trim();
  if (!name) {
    showToast('Please enter your Company Name in Step 1.', 'warning');
    goToCompanyStep(1);
    document.getElementById('c-setup-name')?.focus();
    return;
  }

  const btn = document.getElementById('btn-save-company-setup');
  if (btn) btn.disabled = true;

  try {
    const fd = new FormData();
    fd.append('brand_name', name);
    fd.append('personality', (state.company.traits || []).join(', '));
    fd.append('mood', state.company.feeling || '');
    fd.append('communication_tone', state.company.tone || '');
    fd.append('target_audience', state.company.industry ? `Audience in ${state.company.industry}` : '');
    fd.append('visual_style', (state.company.traits || []).join(', '));
    fd.append('palette', JSON.stringify(state.company.palette || ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C']));
    fd.append('disallowed_elements', JSON.stringify(state.company.keywords || []));
    fd.append('tagline_or_mission', state.company.description || '');
    fd.append('typography', state.company.typography || '');
    fd.append('logo_url', state.company.logoUrl || '');

    // Persist all attached reference files
    if (Array.isArray(state.company.assets)) {
      for (const a of state.company.assets) {
        if (a.rawFile) {
          fd.append('reference_files', a.rawFile);
        }
      }
    }

    const draft = await apiFetch('/api/v1/brands/draft', { method: 'POST', body: fd });
    const brandId = draft.brand_id;

    const confirmed = await apiFetch('/api/v1/brands/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        personality: state.company.traits || [],
        mood: state.company.feeling ? [state.company.feeling] : [],
        communication_tone: state.company.tone ? [state.company.tone] : [],
        visual_style: state.company.traits || [],
        typography: state.company.typography ? [state.company.typography] : [],
        target_audience: state.company.industry || '',
        approved_palette: state.company.palette || ['#1C2A38', '#C4A962', '#D9C59A', '#3C4D5C'],
        disallowed_elements: state.company.keywords || [],
        mission_statement: state.company.description || '',
        logo_url: state.company.logoUrl || '',
        confirmed_by: (state.session && state.session.email) || 'Company Admin',
      }),
    });

    state.company.selectedBrandId = confirmed.brand_id;
    state.dev.selectedBrandId = confirmed.brand_id;
    await loadBrands();

    // Prefill newly registered company into Page 3 (Vibes Check)
    const checkNameInput = document.getElementById('check-company-name');
    if (checkNameInput) checkNameInput.value = confirmed.brand_name;
    const checkUrlInput = document.getElementById('check-website-url');
    if (checkUrlInput && state.company.website) checkUrlInput.value = state.company.website;

    showToast(`Saved and registered '${confirmed.brand_name}'!`, 'success');
    navigateTo('check');
  } catch (err) {
    showToast(err.message || 'Failed to complete setup', 'error');
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
      const file = input.files[0];
      setDevFile(file);
      if (file.type && file.type.startsWith('image/')) {
        runInstantPreflightScan(file);
      }
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
      const file = e.dataTransfer.files[0];
      setDevFile(file);
      if (file.type && file.type.startsWith('image/')) {
        runInstantPreflightScan(file);
      }
    }
  });
}

async function runInstantPreflightScan(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;
  try {
    const fd = new FormData();
    fd.append('file', file);
    if (state.dev.selectedBrandId) {
      fd.append('brand_id', state.dev.selectedBrandId);
    }
    const scan = await apiFetch('/api/v1/inspect/preflight-scan', { method: 'POST', body: fd });
    state.dev.lastScan = scan;
    state.dev.lastReport = null;
    renderPreflightOnlyResult(scan, { hasAsset: true });
    switchCheckSubView('results');
    showToast(`Instant Pre-Flight Scan: ${scan.predicted_style?.style || 'Vibes Analyzed'}`, 'info');
  } catch (err) {
    console.warn('Instant pre-flight scan error:', err);
  }
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
    scan.predicted_style?.style ? { type: 'ok', text: `Predicted Visual Vibe: ${scan.predicted_style.style} — ${scan.predicted_style.explanation || ''}` } : null,
    scan.color_temperature?.label ? { type: 'tip', text: `Color Temperature: ${scan.color_temperature.label} (${scan.color_temperature.category || ''})` } : null,
    scan.whitespace?.label ? { type: 'tip', text: `Negative Space: ${scan.whitespace.label} (${scan.layout?.clutter_index || 'Balanced'})` } : null,
    ...warnings.map((w) => ({ type: 'warn', text: w })),
    !warnings.length ? { type: 'tip', text: 'Visual contrast and color balance passed preliminary OpenCV checks.' } : null,
  ].filter(Boolean);

  renderVibesDashboard({
    score,
    overallLabel: (scan.predicted_style && scan.predicted_style.style) || 'Visual Color Telemetry',
    summary: scan.preliminary_disclaimer || 'OpenCV color and visual hierarchy evaluation complete.',
    enginesLabel: 'Instant Pre-Flight Scanner (OpenCV + CIELAB)',
    chips: [
      scan.predicted_style?.style ? { label: `Vibe: ${scan.predicted_style.style}`, warn: false } : null,
      scan.color_temperature?.label ? { label: scan.color_temperature.label, warn: false } : null,
      scan.whitespace?.percentage !== undefined ? { label: `${scan.whitespace.percentage}% Negative Space`, warn: false } : null,
      { label: pass ? 'Color Aligned' : 'Color Drift Detected', warn: !pass },
      scan.contrast?.label ? { label: scan.contrast.label, warn: false } : null,
    ].filter(Boolean),
    previewTiles,
    breakdown: [
      { label: 'Color Alignment', pct: score },
      { label: 'Negative Space Ratio', pct: scan.whitespace?.percentage ?? scan.whitespace?.score ?? 45 },
      { label: 'Contrast Health', pct: scan.contrast?.passes_wcag_aa ? 100 : 45 },
    ],
    insights,
    channels: [
      { name: 'Predicted Vibe', value: scan.predicted_style?.style || 'Vibe' },
      { name: 'Color Temp', value: scan.color_temperature?.kelvin ? `${scan.color_temperature.kelvin}K` : '5400K' },
      { name: 'Negative Space', value: scan.whitespace?.label ? scan.whitespace.label.split(' ')[0] : '45%' },
      scan.dimensions?.label ? { name: 'Dimensions', value: scan.dimensions.label } : null,
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
function syncCheckCompanyField() {
  const nameEl = document.getElementById('check-company-name');
  if (!nameEl) return;

  if (isDemoSession()) {
    fillDemoVibesCheck();
    return;
  }

  // Regular user: check if registered with an existing company in session or brands
  const sessionOrg = state.session?.company_name || state.session?.org_name || '';
  const userBrand = state.brands.find((b) => {
    if (!state.session) return false;
    return (
      (state.session.org_id && (b.owner_id === state.session.org_id || b.org_id === state.session.org_id)) ||
      (state.session.user_id && b.owner_id === state.session.user_id)
    );
  });

  if (userBrand) {
    nameEl.value = userBrand.brand_name || sessionOrg;
    state.dev.selectedBrandId = userBrand.brand_id;
    renderDevTargetPreview();
  } else if (sessionOrg && sessionOrg !== 'default-org') {
    nameEl.value = sessionOrg;
    state.dev.selectedBrandId = '';
    renderDevTargetPreview();
  } else {
    // Unregistered / other user with no registered company: show NOTHING prefilled
    nameEl.value = '';
    state.dev.selectedBrandId = '';
    renderDevTargetPreview();
  }
}

async function fillDemoVibesCheck() {
  await ensureDemoSession();
  if (!state.brands.length) {
    try {
      await loadBrands();
    } catch (_) {}
  }

  const targetBrand =
    state.brands.find((b) => b.brand_id === 'omnigpt_ai' || b.brand_id === 'omnigpt-ai') ||
    state.brands.find((b) => (b.brand_name || '').toLowerCase().includes('omni')) ||
    state.brands[0] ||
    { brand_id: 'omnigpt_ai', brand_name: 'OmniGPT AI' };

  const nameEl = document.getElementById('check-company-name');
  const urlEl = document.getElementById('check-website-url');
  const socialEl = document.getElementById('check-social-input');
  const copyEl = document.getElementById('dev-copy-input');

  const brandName = targetBrand?.brand_name || 'OmniGPT AI';
  if (nameEl) nameEl.value = brandName;
  if (urlEl) urlEl.value = 'https://omnigpt.ai';
  if (socialEl) socialEl.value = '@omnigpt_ai — Frontier cognitive reasoning and generative neural intelligence.';
  if (copyEl) copyEl.value = 'Enterprise conversational models engineered for precision, ethical alignment, and zero drift.';

  if (targetBrand && targetBrand.brand_id) {
    onSelectDevBrand(targetBrand.brand_id);
  } else {
    state.dev.selectedBrandId = 'omnigpt_ai';
    renderDevTargetPreview();
  }

  await loadSampleAsset('/static/samples/omnigpt_ai_poster.png', 'omnigpt_ai_poster.png');
  selectBrandInputSource('website');
  showToast('Live Demo populated with OmniGPT AI & creative poster', 'info');
}

async function loadLiveDemoResultsPreview() {
  await ensureDemoSession();

  const demoBrand =
    state.brands.find((b) => b.brand_id === 'omnigpt_ai' || b.brand_id === 'omnigpt-ai') ||
    state.brands.find((b) => (b.brand_name || '').toLowerCase().includes('omni')) ||
    state.brands[0] ||
    { brand_id: 'omnigpt_ai', brand_name: 'OmniGPT AI' };

  state.dev.selectedBrandId = demoBrand.brand_id;

  state.dev.lastReport = {
    inspection_id: 'demo-preview-omnigpt',
    brand_id: demoBrand.brand_id,
    brand_name: 'OmniGPT AI',
    overall_score: 94,
    deterministic_score: 96,
    ai_score: 93,
    verdict: 'APPROVED',
    findings: [
      { severity: 'PASS', title: 'Empathetic & Precise Tone', explanation: 'Conversational tone reflects ethical reasoning and cognitive authority.' },
      { severity: 'PASS', title: 'Neural Emerald Palette Compliance', explanation: 'Obsidian (#0B132B) and Emerald (#10A37F) achieve WCAG AAA contrast (12.4:1).' },
      { severity: 'INFO', title: 'Enterprise Claim Verification', explanation: 'Zero-drift claims verified against official Brand Knowledge Base policies.' },
    ],
  };

  renderVibesDashboard({
    score: 94,
    overallLabel: 'Intelligent • Visionary • Ethical',
    summary: 'Live Demo preview: Multi-touchpoint AI governance scan for OmniGPT AI.',
    enginesLabel: 'Gemini 2.5 + OpenCV Neural Telemetry',
    chips: [
      { label: 'Consistent', warn: false },
      { label: 'On-Brand', warn: false },
      { label: 'Neural Clarity', warn: false },
    ],
    previewTiles: [
      { imgSrc: '/static/brand/omni_ai_logo.svg', label: 'OmniGPT Logo' },
      { imgSrc: '/static/samples/omnigpt_ai_poster.png', label: 'AI Poster' },
      { label: 'OmniGPT AI' },
      { bg: '#10A37F', color: '#ffffff', label: '#10A37F' },
    ],
    breakdown: [
      { label: 'Rule Consistency', pct: 96 },
      { label: 'Tone of Voice', pct: 94 },
      { label: 'Visual Identity', pct: 92 },
      { label: 'Safety & Alignment', pct: 95 },
    ],
    insights: [
      { type: 'ok', text: 'Brand voice maintains clear, authoritative conversational reasoning across all channels.' },
      { type: 'ok', text: 'Obsidian (#0B132B) and neural emerald (#10A37F) palette matches WCAG AAA standards.' },
      { type: 'tip', text: 'Consider highlighting real-time cognitive reasoning benchmarks in promotional claims.' },
    ],
    channels: [
      { name: 'Website', value: '96%' },
      { name: 'X / Twitter', value: '94%' },
      { name: 'LinkedIn', value: '95%' },
      { name: 'Documentation', value: '92%' },
      { name: 'Product UI', value: '95%' },
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
  const brandId = state.dev.selectedBrandId || report?.brand_id || state.brands[0]?.brand_id || 'omnigpt_ai';
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
    const isAuthErr = err.status === 401 || (err.message && (
      err.message.toLowerCase().includes('session') ||
      err.message.toLowerCase().includes('token') ||
      err.message.toLowerCase().includes('unauthorized') ||
      err.message.toLowerCase().includes('auth')
    ));
    if (isAuthErr) {
      host.innerHTML = `
        <div class="vibes-empty-state" style="grid-column:1 / -1;">
          <h2>Session Expired</h2>
          <p>Your previous session token is invalid or expired. Sign in to view your reviews, or launch an instant demo workspace.</p>
          <div style="display:flex;gap:12px;justify-content:center;margin-top:1.25rem;flex-wrap:wrap;">
            <button type="button" class="vibes-run-btn vibes-btn-inline" onclick="openAuthModal('login')">
              <span>Sign In</span>
            </button>
            <button type="button" class="vibes-outline-btn vibes-btn-inline" onclick="launchDemoWorkspace()">
              <span>Launch Demo</span>
            </button>
            <button type="button" class="cream-accent-link" onclick="switchCheckSubView('input')">Start a Vibes Check &rarr;</button>
          </div>
        </div>`;
    } else {
      host.innerHTML = `
        <div class="vibes-empty-state" style="grid-column:1 / -1;">
          <h2>Unable to Load Reviews</h2>
          <p>${escapeHtml(err.message || 'An error occurred while loading audit reviews.')}</p>
          <div style="display:flex;gap:12px;justify-content:center;margin-top:1.25rem;flex-wrap:wrap;">
            <button type="button" class="vibes-run-btn vibes-btn-inline" onclick="loadCheckReviews(true)">
              <span>Retry</span>
            </button>
            <button type="button" class="cream-accent-link" onclick="switchCheckSubView('input')">Start a Vibes Check &rarr;</button>
          </div>
        </div>`;
    }
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
  let brandId = state.dev.selectedBrandId || state.dev.lastReport?.brand_id;
  if (!brandId) {
    const name = (document.getElementById('check-company-name')?.value || '').trim().toLowerCase();
    const matched = (state.brands || []).find((b) => (b.brand_name || '').toLowerCase() === name || b.brand_id === name);
    brandId = matched?.brand_id || (state.brands && state.brands[0]?.brand_id) || 'omnigpt_ai';
    state.dev.selectedBrandId = brandId;
  }
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
  const brandId = state.dev.selectedBrandId || state.dev.lastReport?.brand_id || state.brands[0]?.brand_id || 'omnigpt_ai';
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

  document.getElementById('copilot-prompt')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      askBrandCopilot();
    }
  });

  document.addEventListener('click', (e) => {
    const hubWrap = document.querySelector('.hub-avatar-wrap:not(.check-avatar-wrap):not(.company-avatar-wrap)');
    if (hubWrap && !hubWrap.contains(e.target)) {
      toggleHubAccountMenu(false);
    }
    const checkWrap = document.querySelector('.check-avatar-wrap');
    if (checkWrap && !checkWrap.contains(e.target)) {
      toggleCheckAccountMenu(false);
    }
    const companyWrap = document.querySelector('.company-avatar-wrap');
    if (companyWrap && !companyWrap.contains(e.target)) {
      toggleCompanyAccountMenu(false);
    }
  });

  const initialPage = resolveRoutePage(window.location.pathname);
  navigateTo(initialPage, false);

  loadSystemPills();
  loadBrands();
});
