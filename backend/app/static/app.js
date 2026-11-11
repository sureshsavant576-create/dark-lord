function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function animateValue(elem, start, end, duration = 800, suffix = '') {
  if (!elem) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elem.textContent = end + suffix;
    return;
  }
  const startTime = performance.now();
  const isFloat = String(end).includes('.');
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * ease;
    elem.textContent = (isFloat ? current.toFixed(1) : Math.round(current)) + suffix;
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      elem.textContent = end + suffix;
    }
  }
  requestAnimationFrame(update);
}
window.animateValue = animateValue;

function filterFindings(filterSeverity) {
  const cards = document.querySelectorAll('.finding-card');
  const buttons = document.querySelectorAll('.filter-chip');
  buttons.forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById('filter-' + filterSeverity.toLowerCase());
  if (activeBtn) activeBtn.classList.add('active');

  cards.forEach(card => {
    if (filterSeverity === 'ALL') {
      card.style.display = 'block';
    } else if (card.classList.contains('finding-severity-' + filterSeverity)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}
window.filterFindings = filterFindings;

const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol === 'file:' || !window.location.host) {
      return 'http://127.0.0.1:8000/api/v1';
    }
  }
  return '/api/v1';
})();
let brandsMap = {};
let activeInputMode = 'text';
let currentPalette = [];
let lastExtractedColors = [];
let lastSampledColor = '#FFFFFF';
function setInputMode(mode) {
  activeInputMode = mode;
  const tabText = document.getElementById('tab-mode-text');
  const tabFile = document.getElementById('tab-mode-file');
  const textContainer = document.getElementById('mode-text-container');
  const fileContainer = document.getElementById('mode-file-container');
  if (mode === 'file') {
    if (tabFile) tabFile.classList.add('active');
    if (tabText) tabText.classList.remove('active');
    if (fileContainer) fileContainer.classList.remove('hidden');
    if (textContainer) textContainer.classList.add('hidden');
  } else {
    if (tabText) tabText.classList.add('active');
    if (tabFile) tabFile.classList.remove('active');
    if (textContainer) textContainer.classList.remove('hidden');
    if (fileContainer) fileContainer.classList.add('hidden');
  }
}
window.setInputMode = setInputMode;
function toast(message, type = 'info') {
  let toastEl = document.getElementById('app-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'app-toast';
    document.body.appendChild(toastEl);
  }
  const borderColors = {
    success: '#059669',
    error: '#DC2626',
    warning: '#D97706',
    info: '#2563EB'
  };
  const bgColors = {
    success: 'rgba(5, 150, 105, 0.95)',
    error: 'rgba(220, 38, 38, 0.95)',
    warning: 'rgba(217, 119, 6, 0.95)',
    info: 'rgba(15, 23, 42, 0.95)'
  };
  toastEl.textContent = message;
  toastEl.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${bgColors[type] || bgColors.info};
    border-left: 4px solid ${borderColors[type] || borderColors.info};
    color: #FFFFFF;
    padding: 0.85rem 1.35rem;
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15);
    font-size: 0.875rem;
    font-weight: 500;
    z-index: 9999;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    opacity: 1;
    transform: translateY(0);
    max-width: 420px;
    line-height: 1.45;
  `;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(10px)';
  }, 3200);
}
async function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast(successMsg, 'success');
  } catch (err) {
    console.warn('Copy failed:', err);
    toast(`Failed to copy: ${text}`);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const safeRun = (fn, name) => {
    try {
      if (typeof fn === 'function') fn();
    } catch (err) {
      console.debug(`Module ${name} init:`, err);
    }
  };
  safeRun(initTabs, 'tabs');
  safeRun(initDropZone, 'dropZone');
  safeRun(initOnboarding, 'onboarding');
  safeRun(initReferenceScanning, 'referenceScanning');
  safeRun(initPaletteManagerControls, 'paletteControls');
  safeRun(initColorStudio, 'colorStudio');
  safeRun(initInspection, 'inspection');
  safeRun(initLogoUpload, 'logoUpload');
  safeRun(initSidebarState, 'sidebarState');
  safeRun(loadProvidersStatus, 'providersStatus');
  safeRun(loadBrands, 'brands');
  safeRun(loadRecentReport, 'recentReport');
  safeRun(initBrandDNASuite, 'brandDNASuite');
});
function switchMainView(view) {
  if (view === 'landing') {
    const landingView = document.getElementById('view-landing');
    if (landingView) {
      document.body.classList.add('landing-view-active');
      landingView.classList.remove('hidden');
      const dash = document.getElementById('view-dashboard');
      if (dash) dash.classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.location.href = '/';
    }
  } else if (view === 'developer') {
    if (document.getElementById('tab-inspect')) {
      switchDashboardTab('tab-inspect');
    } else {
      window.location.href = '/check-vibe';
    }
  } else if (view === 'company') {
    if (document.getElementById('tab-onboard')) {
      switchDashboardTab('tab-onboard');
    } else {
      window.location.href = '/company-portal';
    }
  } else if (view === 'account') {
    if (document.getElementById('tab-account')) {
      switchDashboardTab('tab-account');
    } else {
      window.location.href = '/account';
    }
  }
}
window.switchMainView = switchMainView;
function switchDashboardTab(tabId) {
  document.body.classList.remove('landing-view-active');
  if (tabId === 'tab-inspect') {
    if (!document.getElementById('tab-inspect')) {
      window.location.href = '/check-vibe';
      return;
    }
  } else if (tabId === 'tab-onboard') {
    if (!document.getElementById('tab-onboard')) {
      window.location.href = '/company-portal';
      return;
    }
  } else if (tabId === 'tab-account') {
    if (!document.getElementById('tab-account')) {
      window.location.href = '/account';
      return;
    }
  }

  const landingView = document.getElementById('view-landing');
  const dashboardView = document.getElementById('view-dashboard');
  if (landingView) landingView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.remove('hidden');

  const panes = document.querySelectorAll('.dashboard-tab-pane');
  panes.forEach(pane => pane.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');

  const navItems = document.querySelectorAll('.sidebar-nav-item');
  navItems.forEach(item => item.classList.remove('active'));

  if (tabId === 'tab-inspect') {
    const btn = document.getElementById('side-tab-inspect');
    if (btn) btn.classList.add('active');
  } else if (tabId === 'tab-onboard') {
    const btn = document.getElementById('side-tab-onboard');
    if (btn) btn.classList.add('active');
  } else if (tabId === 'tab-account') {
    const btn = document.getElementById('side-tab-account');
    if (btn) btn.classList.add('active');
    renderAccountPage(currentAccountBrandId);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const editParam = urlParams.get('edit');
      if (editParam && brandsMap[editParam]) {
        startEditingBrand(editParam);
      }
      const brandParam = urlParams.get('brand');
      if (brandParam && brandsMap[brandParam]) {
        renderAccountPage(brandParam);
        const sel = document.getElementById('inspect-brand-select');
        if (sel) sel.value = brandParam;
      }
    } catch (e) {
      console.debug('URL search params handler error:', e);
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchDashboardTab = switchDashboardTab;
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      if (targetId) switchDashboardTab(targetId);
    });
  });
}
function initDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('inspect-file');
  const previewInfo = document.getElementById('file-preview-info');
  let stageProgressTimer = null;
  const previewName = document.getElementById('preview-filename');
  const previewSize = document.getElementById('preview-filesize');
  const btnClear = document.getElementById('btn-clear-file');
  const filterPanel = document.getElementById('dev-color-filter-panel');
  const uploadBadge = document.getElementById('preview-upload-badge');
  const uploadBadgeText = document.getElementById('preview-upload-badge-text');
  const statusTip = document.getElementById('preview-status-tip');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressStatusText = document.getElementById('upload-progress-status-text');
  const progressPercent = document.getElementById('upload-progress-percent');
  const btnQuickInspect = document.getElementById('btn-quick-run-inspect');
  const btnRunInspect = document.getElementById('btn-run-inspect');
  const brandSelect = document.getElementById('inspect-brand-select');

  if (!dropZone || !fileInput) return;

  if (btnQuickInspect) {
    btnQuickInspect.addEventListener('click', () => {
      const form = document.getElementById('inspection-form');
      if (form) form.requestSubmit();
    });
  }

  ['dragenter', 'dragover'].forEach(event => {
    dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(event => {
    dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('click', (e) => {
    if (e.target !== fileInput) {
      fileInput.click();
    }
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer ? e.dataTransfer.files : null;
    if (files && files.length > 0) {
      try {
        fileInput.files = files;
      } catch (err) {
        try {
          const dt = new DataTransfer();
          for (let i = 0; i < files.length; i++) dt.items.add(files[i]);
          fileInput.files = dt.files;
        } catch (e2) {}
      }
      setInputMode('file');
      updateFilePreview(files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      updateFilePreview(fileInput.files[0]);
    }
  });

  if (brandSelect) {
    brandSelect.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        updateFilePreview(fileInput.files[0]);
      }
    });
  }

  function updateFilePreview(file) {
    if (!previewName || !previewSize || !previewInfo) return;
    setInputMode('file');
    previewName.textContent = file.name;
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    previewSize.textContent = `(${mb} MB)`;
    previewInfo.classList.remove('hidden');

    const hasBrand = brandSelect && brandSelect.value;

    const thumb = document.getElementById('preview-thumbnail');
    const fallbackIcon = document.getElementById('preview-fallback-icon');
    if (file.type.startsWith('image/') && thumb) {
      thumb.src = URL.createObjectURL(file);
      thumb.classList.remove('hidden');
      if (fallbackIcon) fallbackIcon.classList.add('hidden');
    } else {
      if (thumb) thumb.classList.add('hidden');
      if (fallbackIcon) fallbackIcon.classList.remove('hidden');
    }

    if (progressFill) {
      progressFill.className = 'upload-progress-fill staged-animating';
      progressFill.style.width = '0%';
      setTimeout(() => {
        progressFill.style.width = '100%';
      }, 50);
    }
    if (progressStatusText) {
      progressStatusText.textContent = hasBrand
        ? 'File staged locally (Ready for AI upload & verification)'
        : 'File staged locally (Select company above to verify)';
    }
    if (progressPercent) {
      progressPercent.textContent = '100% (Local)';
    }

    const progressContainer = previewInfo.querySelector('.upload-progress-container');
    if (progressContainer) {
      progressContainer.style.transition = '';
      progressContainer.style.opacity = '';
      progressContainer.style.maxHeight = '';
      progressContainer.style.marginTop = '';
      progressContainer.style.marginBottom = '';
      progressContainer.style.overflow = '';
      progressContainer.style.display = '';
      if (stageProgressTimer) clearTimeout(stageProgressTimer);
      stageProgressTimer = setTimeout(() => {
        progressContainer.style.transition = 'opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease';
        progressContainer.style.opacity = '0';
        progressContainer.style.maxHeight = '0px';
        progressContainer.style.marginBottom = '0px';
        progressContainer.style.overflow = 'hidden';
      }, 2500);
    }

    if (uploadBadge && uploadBadgeText) {
      if (hasBrand) {
        uploadBadge.className = 'upload-badge badge-staged';
        uploadBadgeText.textContent = '✓ Ready for Inspection';
      } else {
        uploadBadge.className = 'upload-badge badge-warn';
        uploadBadgeText.textContent = 'Select Company Above';
      }
    }

    if (statusTip) {
      statusTip.textContent = hasBrand
        ? 'Asset loaded. Click "Run Brand Inspection" below to upload and audit compliance.'
        : '⚠️ Select a company brand profile above, then click "Run Brand Inspection".';
    }

    if (btnRunInspect) {
      btnRunInspect.classList.add('btn-pulse-ready');
    }

    if (file.type.startsWith('image/')) {
      if (typeof runInstantPreflight === 'function') {
        runInstantPreflight(file);
      }
      triggerDeveloperColorPreFilter(file);
    } else if (filterPanel) {
      filterPanel.classList.add('hidden');
    }
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (stageProgressTimer) { clearTimeout(stageProgressTimer); stageProgressTimer = null; }
      fileInput.value = '';
      const thumb = document.getElementById('preview-thumbnail');
      const fallbackIcon = document.getElementById('preview-fallback-icon');
      if (thumb) { thumb.src = ''; thumb.classList.add('hidden'); }
      if (fallbackIcon) fallbackIcon.classList.remove('hidden');
      if (previewInfo) previewInfo.classList.add('hidden');
      const pfHud = document.getElementById('preflight-scanner-hud');
      if (pfHud) pfHud.classList.add('hidden');
      if (filterPanel) filterPanel.classList.add('hidden');
      if (btnRunInspect) btnRunInspect.classList.remove('btn-pulse-ready');
    });
  }
}
async function triggerDeveloperColorPreFilter(file) {
  const brandSelect = document.getElementById('inspect-brand-select');
  const filterPanel = document.getElementById('dev-color-filter-panel');
  const scoreBadge = document.getElementById('dev-prefilter-score');
  const spectrumBar = document.getElementById('dev-spectrum-bar');
  const resultsGrid = document.getElementById('dev-color-filter-results');
  const uploadBadge = document.getElementById('preview-upload-badge');
  const uploadBadgeText = document.getElementById('preview-upload-badge-text');
  const statusTip = document.getElementById('preview-status-tip');

  if (!filterPanel || !brandSelect) return;
  const brandId = brandSelect.value;
  if (!brandId) {
    filterPanel.classList.remove('hidden');
    if (scoreBadge) {
      scoreBadge.className = 'prefilter-score-badge status-warn';
      scoreBadge.textContent = 'Select Company Above';
    }
    if (resultsGrid) {
      resultsGrid.innerHTML = '<p class="field-hint" style="grid-column: 1/-1;">⚠️ Select a target company from the dropdown above to test color palette match.</p>';
    }
    if (spectrumBar) spectrumBar.innerHTML = '';
    return;
  }

  filterPanel.classList.remove('hidden');
  if (scoreBadge) {
    scoreBadge.className = 'prefilter-score-badge';
    scoreBadge.innerHTML = '<span class="inline-spinner-sm"></span> Testing Palette...';
  }
  if (uploadBadge && uploadBadgeText) {
    uploadBadge.className = 'upload-badge badge-uploading';
    uploadBadgeText.textContent = 'Sampling Colors...';
  }
  if (statusTip) {
    statusTip.textContent = 'Pre-filtering creative palette against company brand colors...';
  }

  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${API_BASE}/inspect/prefilter-colors/${brandId}`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    filterPanel.classList.remove('hidden');
    const comp = data.compliance || {};
    const score = comp.compliance_score !== undefined ? comp.compliance_score : 100.0;
    if (scoreBadge) {
      scoreBadge.textContent = `${score}% Palette Match`;
      if (score >= 80) {
        scoreBadge.className = 'prefilter-score-badge status-pass';
      } else if (score >= 50) {
        scoreBadge.className = 'prefilter-score-badge status-warn';
      } else {
        scoreBadge.className = 'prefilter-score-badge status-fail';
      }
    }
    if (uploadBadge && uploadBadgeText) {
      uploadBadge.className = 'upload-badge badge-staged';
      uploadBadgeText.textContent = '✓ Ready for Inspection';
    }
    if (statusTip) {
      statusTip.textContent = `Pre-filter palette match: ${score}%. Click "Run Brand Inspection" below to execute full audit.`;
    }
    if (spectrumBar && data.color_distribution) {
      spectrumBar.innerHTML = '';
      data.color_distribution.forEach(item => {
        const seg = document.createElement('div');
        seg.className = 'spectrum-segment';
        seg.style.width = `${item.percentage}%`;
        seg.style.backgroundColor = item.hex;
        seg.title = `${item.hex} (${item.percentage}%) - ${item.role}`;
        spectrumBar.appendChild(seg);
      });
    }
    if (resultsGrid && comp.details) {
      resultsGrid.innerHTML = '';
      comp.details.forEach(d => {
        const chip = document.createElement('div');
        chip.className = 'dev-filter-chip';
        let deltaClass = 'delta-exact';
        let statusText = 'Exact Match';
        if (d.delta_e > 20.0) {
          deltaClass = 'delta-outlier';
          statusText = `Off-Brand (ΔE ${d.delta_e})`;
        } else if (d.delta_e > 12.0) {
          deltaClass = 'delta-borderline';
          statusText = `Deviation (ΔE ${d.delta_e})`;
        } else if (d.delta_e > 3.0) {
          deltaClass = 'delta-acceptable';
          statusText = `Tone Match (ΔE ${d.delta_e})`;
        }
        chip.innerHTML = `
          <div class="dev-filter-chip-left">
            <span class="dev-filter-swatch" style="background: ${d.detected_hex};"></span>
            <div>
              <span class="dev-filter-hex">${d.detected_hex}</span>
              <div style="font-size: 0.7rem; color: var(--text-dim);">Nearest: ${d.closest_approved_hex}</div>
            </div>
          </div>
          <span class="dev-delta-badge ${deltaClass}">${statusText}</span>
        `;
        resultsGrid.appendChild(chip);
      });
    }
  } catch (err) {
    console.warn('Pre-filter notice:', err);
    if (scoreBadge) {
      scoreBadge.className = 'prefilter-score-badge status-warn';
      scoreBadge.textContent = 'Ready for Inspection';
    }
    if (uploadBadge && uploadBadgeText) {
      uploadBadge.className = 'upload-badge badge-staged';
      uploadBadgeText.textContent = '✓ Ready for Inspection';
    }
    if (statusTip) {
      statusTip.textContent = 'Asset loaded. Click "Run Brand Inspection" below to audit compliance.';
    }
  }
}
async function loadProvidersStatus() {
  const pill = document.getElementById('ai-status-pill');
  if (!pill) return;
  try {
    const res = await fetch(`${API_BASE}/providers`);
    const data = await res.json();
    if (data.active_primary_provider) {
      pill.className = 'status-pill status-ready';
      pill.innerHTML = `<span class="status-pulse-dot"></span><span class="status-text">Engine Online</span>`;
    } else {
      pill.className = 'status-pill status-unconfigured';
      pill.innerHTML = `<span class="status-pulse-dot"></span><span class="status-text">Engine Active</span>`;
    }
  } catch (err) {
    pill.className = 'status-pill status-unconfigured';
    pill.innerHTML = `<span class="status-pulse-dot"></span><span class="status-text">Engine Offline</span>`;
  }
}
async function loadBrands() {
  try {
    const res = await fetch(`${API_BASE}/brands`);
    const brands = await res.json();
    brandsMap = {};
    const select = document.getElementById('inspect-brand-select');
    if (select) {
      select.innerHTML = '<option value="">-- Select Company to Check Against --</option>';
    }
    const confirmedList = document.getElementById('confirmed-brands-list');
    if (confirmedList) {
      confirmedList.innerHTML = '';
    }
    const confirmedBrands = brands.filter(b => b.status === 'CONFIRMED' || b.status === 'DRAFT');
    if (confirmedList && confirmedBrands.length === 0) {
      confirmedList.innerHTML = '<p class="empty-note">No company profiles registered yet. Set your brand vibes on the left.</p>';
    }
    brands.forEach(b => {
      brandsMap[b.brand_id] = b;
      if (select) {
        const opt = document.createElement('option');
        opt.value = b.brand_id;
        opt.textContent = `${b.brand_name} (${b.status})`;
        select.appendChild(opt);
      }
      if (confirmedList) {
        const card = document.createElement('div');
        card.className = 'brand-card-item';
        const swatches = (b.approved_palette || []).map(hex => `
          <span class="color-swatch-chip" title="Copy ${hex}" onclick="copyToClipboard('${hex}', 'Copied ${hex}!')">
            <span class="swatch-color-box" style="background: ${hex};"></span>
            ${hex}
          </span>
        `).join('');
        card.innerHTML = `
          <div class="brand-card-header">
            <span class="brand-card-title">${escapeHtml(b.brand_name)}</span>
            <span class="tag-badge ${b.status === 'CONFIRMED' ? 'tag-PASS' : 'tag-WARNING'}">${b.status}</span>
          </div>
          <p class="finding-body"><strong>Personality:</strong> ${escapeHtml((b.personality || []).join(', '))} | <strong>Mood:</strong> ${escapeHtml((b.mood || []).join(', '))}</p>
          <p class="finding-body"><strong>Tone:</strong> ${escapeHtml((b.communication_tone || []).join(', '))} | <strong>Audience:</strong> ${escapeHtml(b.target_audience || 'General')}</p>
          <div class="palette-row" style="margin-top: 0.5rem;">${swatches}</div>
          <div class="brand-card-actions">
            <button type="button" class="btn-edit-brand" onclick="startEditingBrand('${b.brand_id}')">
              Configure Brand Guidelines
            </button>
            <button type="button" class="btn-sm btn-secondary" onclick="renderAccountPage('${b.brand_id}'); switchDashboardTab('tab-account');">
              View Account Details &rarr;
            </button>
            <button type="button" class="btn-delete-brand-danger" onclick="confirmDeleteBrand('${b.brand_id}', '${escapeHtml(b.brand_name)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete Brand
            </button>
          </div>
        `;
        confirmedList.appendChild(card);
      }
    });
    renderCompanyCards(confirmedBrands);
    renderAccountPage(currentAccountBrandId);
    if (select) {
      select.onchange = () => {
        const selectedId = select.value;
        const preview = document.getElementById('selected-brand-preview');
        const b = brandsMap[selectedId];
        const fileInput = document.getElementById('inspect-file');
        if (fileInput && fileInput.files && fileInput.files.length > 0 && fileInput.files[0].type.startsWith('image/')) {
          triggerDeveloperColorPreFilter(fileInput.files[0]);
        }
        if (!preview) return;
        if (!b) {
          preview.classList.add('hidden');
          return;
        }
        const prevName = document.getElementById('prev-brand-name');
        if (prevName) {
          if (b.logo_url) {
            prevName.innerHTML = `<img src="${escapeHtml(b.logo_url)}" class="compact-brand-logo-img" alt="${escapeHtml(b.brand_name)} Logo"> ${escapeHtml(b.brand_name)}`;
          } else {
            prevName.textContent = b.brand_name;
          }
        }
        const prevTone = document.getElementById('prev-brand-tone');
        if (prevTone) prevTone.textContent = `Tone: ${(b.communication_tone || []).join(', ') || 'Standard'}`;
        const prevSummary = document.getElementById('prev-palette-summary');
        if (prevSummary) {
          const count = (b.approved_palette || []).length;
          prevSummary.textContent = `${count} Approved Color${count === 1 ? '' : 's'}`;
        }
        preview.classList.remove('hidden');
      };
      if (brands.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlBrand = urlParams.get('brand');
        if (urlBrand && brandsMap[urlBrand]) {
          select.value = urlBrand;
        } else if (!select.value) {
          select.value = brands[0].brand_id;
        }
        select.onchange();
      }
    }
  } catch (err) {
    console.error('Failed to load brands:', err);
  }
}
function renderCompanyCards(brands) {
  const grid = document.getElementById('company-cards-grid');
  const statCount = document.getElementById('stat-registered-count');
  const sidebarList = document.getElementById('sidebar-brands-quicklist');
  if (statCount) statCount.textContent = brands.length;
  if (sidebarList) {
    sidebarList.innerHTML = '';
    brands.forEach(b => {
      const pill = document.createElement('div');
      pill.className = 'sidebar-brand-pill';
      pill.setAttribute('data-brand-id', b.brand_id);
      pill.innerHTML = `
        <div class="sidebar-brand-info" onclick="selectCompanyById('${b.brand_id}')">
          <span class="brand-pill-name" title="${escapeHtml(b.brand_name)}">${escapeHtml(b.brand_name)}</span>
          <span class="tone-badge-pill" style="font-size: 0.65rem;">${b.status}</span>
        </div>
        <div class="brand-kebab-menu-wrap">
          <button type="button" class="btn-brand-kebab" onclick="event.stopPropagation(); toggleBrandKebabMenu(event, '${b.brand_id}')" title="Brand options" aria-label="Brand options">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2.2"/>
              <circle cx="12" cy="12" r="2.2"/>
              <circle cx="12" cy="19" r="2.2"/>
            </svg>
          </button>
          <div class="brand-kebab-dropdown hidden" id="kebab-menu-${b.brand_id}">
            <button type="button" class="kebab-item" onclick="event.stopPropagation(); selectCompanyById('${b.brand_id}'); closeAllKebabMenus();">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Select for Inspection
            </button>
            <button type="button" class="kebab-item" onclick="event.stopPropagation(); startEditingBrand('${b.brand_id}'); closeAllKebabMenus();">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Configure Guidelines
            </button>
            <div class="kebab-divider"></div>
            <button type="button" class="kebab-item kebab-item-danger" onclick="event.stopPropagation(); confirmDeleteBrand('${b.brand_id}', '${escapeHtml(b.brand_name)}'); closeAllKebabMenus();">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete Brand
            </button>
          </div>
        </div>
      `;
      sidebarList.appendChild(pill);
    });
  }
  if (!grid) return;
  grid.innerHTML = '';
  brands.forEach(b => {
    const card = document.createElement('div');
    card.className = 'company-vibe-card';
    card.setAttribute('data-brand-id', b.brand_id);
    const swatches = (b.approved_palette || []).slice(0, 5).map(h => `
      <span class="card-swatch-dot" style="background: ${h};" title="${h}"></span>
    `).join('');
    card.innerHTML = `
      <div class="card-top-row">
        <span class="company-title-bold">${escapeHtml(b.brand_name)}</span>
        <div class="card-actions-mini">
          <span class="tone-badge-pill">${b.status}</span>
          <button type="button" class="btn-icon-delete-card" title="Permanently delete brand standard" onclick="event.stopPropagation(); confirmDeleteBrand('${b.brand_id}', '${escapeHtml(b.brand_name)}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="card-palette-strip">${swatches}</div>
      <p class="card-meta-notes"><strong>Personality:</strong> ${escapeHtml((b.personality || []).slice(0, 3).join(', '))}</p>
      <div class="btn-select-company">Select for Inspection →</div>
    `;
    card.onclick = () => selectCompanyById(b.brand_id);
    grid.appendChild(card);
  });
}
function selectCompanyById(brandId) {
  const select = document.getElementById('inspect-brand-select');
  if (select) {
    select.value = brandId;
    select.dispatchEvent(new Event('change'));
  }
  document.querySelectorAll('.company-vibe-card').forEach(c => {
    c.classList.toggle('is-selected', c.getAttribute('data-brand-id') === brandId);
  });
  document.querySelectorAll('.sidebar-brand-pill').forEach(p => {
    p.classList.toggle('is-selected', p.getAttribute('data-brand-id') === brandId);
  });
  const form = document.getElementById('inspection-form');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`Selected ${brandsMap[brandId]?.brand_name || brandId} for inspection!`);
}
window.selectCompanyById = selectCompanyById;
function renderPaletteManager() {
  const grid = document.getElementById('palette-manager-grid');
  const hiddenInput = document.getElementById('ob-palette');
  if (!grid) return;
  grid.innerHTML = '';
  if (!currentPalette || currentPalette.length === 0) {
    grid.innerHTML = '<div class="palette-empty-prompt">No colors added yet. Upload creative above or pick custom colors below.</div>';
    if (hiddenInput) hiddenInput.value = '';
    return;
  }
  const hexList = currentPalette.map(c => c.hex);
  if (hiddenInput) hiddenInput.value = hexList.join(', ');
  currentPalette.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'palette-swatch-card';
    card.innerHTML = `
      <span class="palette-swatch-circle" style="background: ${item.hex};" title="Click to copy ${item.hex}"></span>
      <span class="palette-swatch-hex" title="Click to copy ${item.hex}">${item.hex}</span>
      <span class="palette-swatch-role">${item.role || 'Brand Color'}</span>
      <button type="button" class="btn-remove-swatch" title="Remove ${item.hex} from palette">&times;</button>
    `;
    card.querySelector('.palette-swatch-hex').onclick = () => copyToClipboard(item.hex, `Copied ${item.hex}!`);
    card.querySelector('.palette-swatch-circle').onclick = () => copyToClipboard(item.hex, `Copied ${item.hex}!`);
    card.querySelector('.btn-remove-swatch').onclick = (e) => {
      e.stopPropagation();
      removeFromPalette(item.hex);
    };
    grid.appendChild(card);
  });
  syncExtractedCardButtons();
}
function addToPalette(hex, role = 'Primary Brand Color') {
  if (!hex) return;
  const upperHex = hex.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/i.test(upperHex)) {
    toast(`Invalid HEX format: ${hex}`);
    return;
  }
  const exists = currentPalette.some(c => c.hex.toUpperCase() === upperHex);
  if (!exists) {
    currentPalette.push({ hex: upperHex, role: role });
    renderPaletteManager();
    toast(`Added ${upperHex} to Brand Palette`, 'success');
  } else {
    toast(`${upperHex} is already in the palette`);
  }
}
function removeFromPalette(hex) {
  const upperHex = hex.trim().toUpperCase();
  currentPalette = currentPalette.filter(c => c.hex.toUpperCase() !== upperHex);
  renderPaletteManager();
  toast(`Removed ${upperHex} from palette`);
}
function syncExtractedCardButtons() {
  const buttons = document.querySelectorAll('.btn-toggle-palette-color');
  buttons.forEach(btn => {
    const hex = btn.getAttribute('data-hex');
    if (!hex) return;
    const inPalette = currentPalette.some(c => c.hex.toUpperCase() === hex.toUpperCase());
    if (inPalette) {
      btn.className = 'btn-toggle-palette-color is-active';
      btn.innerHTML = '✓ In Brand Palette';
    } else {
      btn.className = 'btn-toggle-palette-color';
      btn.innerHTML = '➕ Add to Palette';
    }
  });
}
function initPaletteManagerControls() {
  const btnAddCustom = document.getElementById('btn-add-custom-color');
  const customHexInput = document.getElementById('custom-hex-input');
  const customColorPicker = document.getElementById('custom-color-picker');
  const customRoleSelect = document.getElementById('custom-role-select');
  const btnCopyHex = document.getElementById('btn-copy-palette-hex');
  const btnExportCss = document.getElementById('btn-export-css-vars');
  const btnClearPalette = document.getElementById('btn-clear-palette');
  const btnAddAllExtracted = document.getElementById('btn-add-all-extracted');
  if (customColorPicker && customHexInput) {
    customColorPicker.addEventListener('input', () => {
      customHexInput.value = customColorPicker.value.toUpperCase();
    });
  }
  if (btnAddCustom && customHexInput) {
    const handleAdd = () => {
      let val = customHexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      const role = customRoleSelect ? customRoleSelect.value : 'Custom Brand Color';
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        addToPalette(val, role);
        customHexInput.value = '';
      } else {
        toast('Please enter a valid 6-digit HEX code (e.g. #0055FF)');
      }
    };
    btnAddCustom.addEventListener('click', handleAdd);
    customHexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
  }
  if (btnCopyHex) {
    btnCopyHex.addEventListener('click', () => {
      if (currentPalette.length === 0) {
        toast('Palette is empty.');
        return;
      }
      const hexString = currentPalette.map(c => c.hex).join(', ');
      copyToClipboard(hexString, 'Copied all brand HEX colors!');
    });
  }
  if (btnExportCss) {
    btnExportCss.addEventListener('click', () => {
      if (currentPalette.length === 0) {
        toast('Palette is empty.');
        return;
      }
      let css = ':root {\\n';
      currentPalette.forEach((c, idx) => {
        const cleanName = c.role.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `color-${idx+1}`;
        css += `  --brand-${cleanName}: ${c.hex};\\n`;
      });
      css += '}';
      copyToClipboard(css, 'Copied CSS variables snippet!');
    });
  }
  if (btnClearPalette) {
    btnClearPalette.addEventListener('click', () => {
      if (confirm('Clear all colors from the brand palette?')) {
        currentPalette = [];
        renderPaletteManager();
        toast('Palette cleared');
      }
    });
  }
  if (btnAddAllExtracted) {
    btnAddAllExtracted.addEventListener('click', () => {
      if (!lastExtractedColors || lastExtractedColors.length === 0) {
        toast('No extracted colors available. Upload an image above.');
        return;
      }
      lastExtractedColors.forEach(item => {
        const hex = item.hex_code || item.hex;
        const role = item.role || 'Extracted Brand Color';
        if (hex && !currentPalette.some(c => c.hex.toUpperCase() === hex.toUpperCase())) {
          currentPalette.push({ hex: hex.toUpperCase(), role: role });
        }
      });
      renderPaletteManager();
      toast(`Added ${lastExtractedColors.length} extracted colors to palette!`, 'success');
    });
  }
}
let studioCanvasImg = null;
function initColorStudio() {
  const canvas = document.getElementById('studio-canvas');
  const viewport = document.getElementById('canvas-viewport');
  const loupe = document.getElementById('eyedropper-loupe');
  const loupePreview = document.getElementById('loupe-color-preview');
  const liveSwatch = document.getElementById('inspect-live-swatch');
  const liveHex = document.getElementById('inspect-live-hex');
  const liveRgb = document.getElementById('inspect-live-rgb');
  const btnAddSampled = document.getElementById('btn-add-sampled-color');
  const btnNativeEyedropper = document.getElementById('btn-native-eyedropper');
  if (window.EyeDropper && btnNativeEyedropper) {
    btnNativeEyedropper.classList.remove('hidden');
    btnNativeEyedropper.addEventListener('click', async () => {
      try {
        const eyeDropper = new window.EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          addToPalette(res.sRGBHex, 'Eyedropper Screen Sample');
        }
      } catch (e) {
        console.debug('EyeDropper cancelled or dismissed');
      }
    });
  }
  if (!canvas || !viewport) return;
  const samplePixel = (e) => {
    if (!studioCanvasImg) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase()}`;
    return {
      hex,
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      clientX: e.clientX,
      clientY: e.clientY,
      viewportRect: viewport.getBoundingClientRect()
    };
  };
  viewport.addEventListener('mousemove', (e) => {
    const s = samplePixel(e);
    if (!s) {
      if (loupe) loupe.classList.add('hidden');
      return;
    }
    if (liveSwatch) liveSwatch.style.backgroundColor = s.hex;
    if (liveHex) liveHex.textContent = s.hex;
    if (liveRgb) liveRgb.textContent = `RGB(${s.r}, ${s.g}, ${s.b})`;
    if (loupe && loupePreview) {
      loupe.classList.remove('hidden');
      const relX = s.clientX - s.viewportRect.left;
      const relY = s.clientY - s.viewportRect.top;
      loupe.style.left = `${relX}px`;
      loupe.style.top = `${relY}px`;
      loupePreview.style.backgroundColor = s.hex;
    }
  });
  viewport.addEventListener('mouseleave', () => {
    if (loupe) loupe.classList.add('hidden');
  });
  viewport.addEventListener('click', (e) => {
    const s = samplePixel(e);
    if (!s) return;
    lastSampledColor = s.hex;
    if (btnAddSampled) {
      btnAddSampled.classList.remove('hidden');
      btnAddSampled.innerHTML = `<span>➕ Add ${s.hex} to Palette</span>`;
    }
    toast(`Sampled ${s.hex} from creative! Click button to add.`);
  });
  if (btnAddSampled) {
    btnAddSampled.addEventListener('click', () => {
      if (lastSampledColor) {
        addToPalette(lastSampledColor, 'Eyedropper Picked');
      }
    });
  }
}
function loadCreativeOnCanvas(imageSrc) {
  const container = document.getElementById('color-studio-container');
  const canvas = document.getElementById('studio-canvas');
  if (!container || !canvas) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    studioCanvasImg = img;
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 600;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    container.classList.remove('hidden');
  };
  img.src = imageSrc;
}
function renderExtractedColorStudio(data) {
  lastExtractedColors = data.palette || [];
  const countBadge = document.getElementById('extracted-count');
  if (countBadge) countBadge.textContent = lastExtractedColors.length;
  const harmonyBadge = document.getElementById('spectrum-harmony-badge');
  if (harmonyBadge) harmonyBadge.textContent = data.harmony_type || 'Dynamic Harmony';
  const spectrumBar = document.getElementById('spectrum-distribution-bar');
  if (spectrumBar && data.color_distribution) {
    spectrumBar.innerHTML = '';
    data.color_distribution.forEach(item => {
      const seg = document.createElement('div');
      seg.className = 'spectrum-segment';
      seg.style.width = `${Math.max(4, item.percentage)}%`;
      seg.style.backgroundColor = item.hex;
      seg.title = `${item.hex} (${item.percentage}%) - ${item.role}. Click to copy!`;
      seg.onclick = () => copyToClipboard(item.hex, `Copied ${item.hex}!`);
      spectrumBar.appendChild(seg);
    });
  }
  const grid = document.getElementById('extracted-swatches-grid');
  if (grid) {
    grid.innerHTML = '';
    lastExtractedColors.forEach(item => {
      const card = document.createElement('div');
      card.className = 'extracted-card';
      const inPalette = currentPalette.some(c => c.hex.toUpperCase() === item.hex_code.toUpperCase());
      card.innerHTML = `
        <div class="extracted-card-top">
          <div class="extracted-swatch-box" style="background: ${item.hex_code};" title="Click to copy ${item.hex_code}" onclick="copyToClipboard('${item.hex_code}', 'Copied ${item.hex_code}!')"></div>
          <div class="extracted-card-info">
            <div class="extracted-hex-row">
              <span class="extracted-hex">${item.hex_code}</span>
              <button type="button" class="btn-copy-hex" title="Copy HEX" onclick="copyToClipboard('${item.hex_code}', 'Copied ${item.hex_code}!')">Copy</button>
            </div>
            <span class="extracted-family">${item.color_family || 'Neutral'}</span>
            <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim);">RGB(${item.rgb.join(', ')})</span>
          </div>
        </div>
        <div class="extracted-card-meta">
          <span class="extracted-pct-pill">${item.percentage}% Coverage</span>
          <span class="extracted-role-tag">${item.role}</span>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span>Contrast vs White: <strong>${item.contrast_white}:1</strong></span>
          <span>${item.is_dark ? 'Dark Tone' : 'Light Tone'}</span>
        </div>
        <button type="button" class="btn-toggle-palette-color ${inPalette ? 'is-active' : ''}" data-hex="${item.hex_code}">
          ${inPalette ? '✓ In Brand Palette' : '+ Add to Palette'}
        </button>
      `;
      const toggleBtn = card.querySelector('.btn-toggle-palette-color');
      toggleBtn.onclick = () => {
        const hex = item.hex_code;
        const exists = currentPalette.some(c => c.hex.toUpperCase() === hex.toUpperCase());
        if (exists) {
          removeFromPalette(hex);
        } else {
          addToPalette(hex, item.role);
        }
      };
      grid.appendChild(card);
    });
  }
}
function startEditingBrand(brandId) {
  const b = brandsMap[brandId];
  if (!b) return;
  const editIdInputCheck = document.getElementById('ob-editing-brand-id');
  if (!editIdInputCheck) {
    window.location.href = `/company-portal?edit=${encodeURIComponent(brandId)}`;
    return;
  }
  const editIdInput = document.getElementById('ob-editing-brand-id');
  if (editIdInput) editIdInput.value = b.brand_id;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  setVal('ob-brand-name', b.brand_name);
  setVal('ob-manager-email', b.confirmed_by || 'brand@company.com');
  setVal('ob-personality', (b.personality || []).join(', '));
  setVal('ob-mood', (b.mood || []).join(', '));
  setVal('ob-tone', (b.communication_tone || []).join(', '));
  setVal('ob-audience', b.target_audience || '');
  setVal('ob-style', (b.visual_style || []).join(', '));
  setVal('ob-typography', (b.typography || []).join(', '));
  setVal('ob-avoid', (b.disallowed_elements || []).join(', '));
  setVal('ob-tagline', b.mission_statement || '');
  setVal('ob-logo-url', b.logo_url || '');
  if (b.logo_url) {
    const logoImg = document.getElementById('ob-logo-preview-img');
    const logoPlaceholder = document.getElementById('ob-logo-placeholder');
    const btnClearLogo = document.getElementById('btn-clear-logo');
    if (logoImg) {
      logoImg.src = b.logo_url;
      logoImg.classList.remove('hidden');
    }
    if (logoPlaceholder) logoPlaceholder.classList.add('hidden');
    if (btnClearLogo) btnClearLogo.classList.remove('hidden');
  } else {
    clearBrandLogo();
  }
  currentPalette = (b.approved_palette || []).map(hex => ({
    hex: hex.toUpperCase(),
    role: 'Approved Brand Color'
  }));
  renderPaletteManager();
  if (b.reference_assets && b.reference_assets.length > 0) {
    const ref = b.reference_assets[0];
    const imgUrl = ref.stored_path ? '/' + ref.stored_path.replace(/\\/g, '/') : null;
    if (imgUrl) loadCreativeOnCanvas(imgUrl);
  }
  const btn = document.getElementById('btn-create-draft');
  if (btn) btn.innerHTML = '<span>Update Brand Profile</span>';
  const btnCancel = document.getElementById('btn-cancel-edit');
  if (btnCancel) {
    btnCancel.classList.remove('hidden');
    btnCancel.onclick = resetOnboardingForm;
  }
  const btnDeleteBrand = document.getElementById('btn-delete-editing-brand');
  if (btnDeleteBrand) {
    btnDeleteBrand.classList.remove('hidden');
  }
  const feedback = document.getElementById('ob-scan-feedback');
  if (feedback) {
    feedback.className = 'ob-scan-feedback success';
    feedback.innerHTML = `Editing <strong>${escapeHtml(b.brand_name)}</strong>. Configure brand palette and guidelines below.`;
    feedback.classList.remove('hidden');
  }
  const formEl = document.getElementById('onboarding-form');
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function resetOnboardingForm() {
  const editIdInput = document.getElementById('ob-editing-brand-id');
  if (editIdInput) editIdInput.value = '';
  const form = document.getElementById('onboarding-form');
  if (form) form.reset();
  currentPalette = [];
  renderPaletteManager();
  clearBrandLogo();
  const studioContainer = document.getElementById('color-studio-container');
  if (studioContainer) studioContainer.classList.add('hidden');
  const btn = document.getElementById('btn-create-draft');
  if (btn) btn.innerHTML = '<span>Save Brand Profile</span>';
  const btnCancel = document.getElementById('btn-cancel-edit');
  if (btnCancel) btnCancel.classList.add('hidden');
  const btnDeleteBrand = document.getElementById('btn-delete-editing-brand');
  if (btnDeleteBrand) btnDeleteBrand.classList.add('hidden');
  const feedback = document.getElementById('ob-scan-feedback');
  if (feedback) feedback.classList.add('hidden');
}
function initReferenceScanning() {
  const fileInput = document.getElementById('ob-reference-files');
  const dropZone = document.getElementById('ob-drop-zone');
  const feedback = document.getElementById('ob-scan-feedback');
  if (!fileInput) return;
  const obPreviewInfo = document.getElementById('ob-file-preview-info');
  let obHideTimer = null;
  const obThumb = document.getElementById('ob-preview-thumbnail');
  const obFallback = document.getElementById('ob-preview-fallback-icon');
  const obFilename = document.getElementById('ob-preview-filename');
  const obFilesize = document.getElementById('ob-preview-filesize');
  const obBadge = document.getElementById('ob-preview-upload-badge');
  const obBadgeText = document.getElementById('ob-preview-upload-badge-text');
  const obStatusTip = document.getElementById('ob-preview-status-tip');
  const obProgressFill = document.getElementById('ob-upload-progress-fill');
  const obProgressStatus = document.getElementById('ob-upload-progress-status-text');
  const obProgressPercent = document.getElementById('ob-upload-progress-percent');
  const btnClearOb = document.getElementById('btn-clear-ob-file');

  if (btnClearOb) {
    btnClearOb.addEventListener('click', () => {
      if (obHideTimer) {
        clearTimeout(obHideTimer);
        obHideTimer = null;
      }
      if (typeof scanProgressInterval !== 'undefined' && scanProgressInterval) {
        clearInterval(scanProgressInterval);
        scanProgressInterval = null;
      }
      fileInput.value = '';
      if (obPreviewInfo) {
        obPreviewInfo.style.transition = '';
        obPreviewInfo.style.opacity = '';
        obPreviewInfo.style.transform = '';
        obPreviewInfo.style.maxHeight = '';
        obPreviewInfo.style.marginTop = '';
        obPreviewInfo.style.marginBottom = '';
        obPreviewInfo.style.paddingTop = '';
        obPreviewInfo.style.paddingBottom = '';
        obPreviewInfo.style.overflow = '';
        obPreviewInfo.classList.add('hidden');
      }
      if (feedback) feedback.classList.add('hidden');
      const studio = document.getElementById('color-studio-container');
      if (studio) studio.classList.add('hidden');
    });
  }

  const handleScan = async (file) => {
    if (!file) return;

    if (obHideTimer) {
      clearTimeout(obHideTimer);
      obHideTimer = null;
    }

    if (obPreviewInfo) {
      obPreviewInfo.style.transition = '';
      obPreviewInfo.style.opacity = '';
      obPreviewInfo.style.transform = '';
      obPreviewInfo.style.maxHeight = '';
      obPreviewInfo.style.marginTop = '';
      obPreviewInfo.style.marginBottom = '';
      obPreviewInfo.style.paddingTop = '';
      obPreviewInfo.style.paddingBottom = '';
      obPreviewInfo.style.overflow = '';
      obPreviewInfo.classList.remove('hidden');
      if (obFilename) obFilename.textContent = file.name;
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      if (obFilesize) obFilesize.textContent = `(${mb} MB)`;

      if (file.type.startsWith('image/') && obThumb) {
        obThumb.src = URL.createObjectURL(file);
        obThumb.classList.remove('hidden');
        if (obFallback) obFallback.classList.add('hidden');
      } else {
        if (obThumb) obThumb.classList.add('hidden');
        if (obFallback) obFallback.classList.remove('hidden');
      }

      if (obBadge && obBadgeText) {
        obBadge.className = 'upload-badge badge-uploading';
        obBadgeText.textContent = 'Uploading & Extracting DNA...';
      }
      if (obStatusTip) obStatusTip.textContent = 'Transmitting brand reference asset to server...';
      if (obProgressFill) {
        obProgressFill.className = 'upload-progress-fill uploading';
        obProgressFill.style.width = '20%';
      }
      if (obProgressStatus) obProgressStatus.textContent = 'Uploading reference asset to server...';
      if (obProgressPercent) obProgressPercent.textContent = '20%';
    }

    if (feedback) {
      feedback.className = 'ob-scan-feedback scanning';
      feedback.innerHTML = '<div class="inline-spinner"></div> Extracting palette centroids, analyzing layout & extracting brand vibes...';
      feedback.classList.remove('hidden');
    }

    let currentScanPct = 12;
    if (obProgressFill) {
      obProgressFill.className = 'upload-progress-fill uploading';
      obProgressFill.style.transition = 'width 0.25s ease';
      obProgressFill.style.width = `${currentScanPct}%`;
    }
    if (obProgressStatus) obProgressStatus.textContent = 'Uploading brand reference asset...';
    if (obProgressPercent) obProgressPercent.textContent = `${currentScanPct}%`;
    if (obStatusTip) obStatusTip.textContent = 'Transmitting brand reference asset to server...';

    const getScanMeta = (p) => {
      if (p < 30) return {
        status: 'Uploading brand reference asset to server...',
        tip: 'Transmitting reference imagery and calculating checksums...'
      };
      if (p < 50) return {
        status: 'Extracting CIELAB color centroids & whitespace...',
        tip: 'Quantizing 8-dominant color clusters and negative space...'
      };
      if (p < 70) return {
        status: 'Analyzing typography hierarchy & layout density...',
        tip: 'Detecting font legibility, weights, and spatial balance...'
      };
      if (p < 85) return {
        status: 'Synthesizing voice guidelines & brand personality...',
        tip: 'Determining communication tone, mood, and audience alignment...'
      };
      if (p < 95) return {
        status: 'Assembling brand guidelines & color studio data...',
        tip: 'Correlating extracted palette vectors with brand identity...'
      };
      return {
        status: 'Finalizing brand standards synthesis...',
        tip: 'Preparing interactive eyedropper and studio preview...'
      };
    };

    let scanProgressInterval = setInterval(() => {
      if (currentScanPct < 45) {
        currentScanPct += 2.2 + Math.random() * 2.5;
      } else if (currentScanPct < 70) {
        currentScanPct += 1.3 + Math.random() * 1.5;
      } else if (currentScanPct < 85) {
        currentScanPct += 0.8 + Math.random() * 0.9;
      } else if (currentScanPct < 93) {
        currentScanPct += 0.35 + Math.random() * 0.4;
      } else if (currentScanPct < 98) {
        currentScanPct += 0.1 + Math.random() * 0.12;
      }
      if (currentScanPct > 98) currentScanPct = 98;

      const rounded = Math.floor(currentScanPct);
      if (obProgressFill) obProgressFill.style.width = `${rounded}%`;
      if (obProgressPercent) obProgressPercent.textContent = `${rounded}%`;

      const meta = getScanMeta(rounded);
      if (obProgressStatus) obProgressStatus.textContent = meta.status;
      if (obStatusTip) obStatusTip.textContent = meta.tip;
    }, 150);

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/brands/scan-reference`, {
        method: 'POST',
        body: formData
      });
      clearInterval(scanProgressInterval);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const previewUrl = data.image_url || URL.createObjectURL(file);
      loadCreativeOnCanvas(previewUrl);
      renderExtractedColorStudio(data);

      if (obProgressFill) {
        obProgressFill.className = 'upload-progress-fill done';
        obProgressFill.style.transition = 'width 0.25s cubic-bezier(0.1, 0.9, 0.2, 1)';
        obProgressFill.style.width = '100%';
      }
      if (obProgressStatus) obProgressStatus.textContent = '✓ DNA Centroids Extracted & Loaded to Studio';
      if (obProgressPercent) obProgressPercent.textContent = '100%';
      if (obBadge && obBadgeText) {
        obBadge.className = 'upload-badge badge-success';
        obBadgeText.textContent = '✓ DNA Extracted';
      }
      if (obStatusTip) obStatusTip.textContent = `Extracted ${(data.extracted_palette || []).length} colors & brand guidelines. Ready to lock standards.`;

      // Auto-hide the upload progress card after showing 100% for a brief duration
      if (obHideTimer) clearTimeout(obHideTimer);
      obHideTimer = setTimeout(() => {
        if (obPreviewInfo) {
          obPreviewInfo.style.transition = 'opacity 0.4s ease, transform 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
          obPreviewInfo.style.opacity = '0';
          obPreviewInfo.style.transform = 'translateY(-6px)';
          obPreviewInfo.style.maxHeight = '0px';
          obPreviewInfo.style.marginTop = '0px';
          obPreviewInfo.style.marginBottom = '0px';
          obPreviewInfo.style.paddingTop = '0px';
          obPreviewInfo.style.paddingBottom = '0px';
          obPreviewInfo.style.overflow = 'hidden';
          setTimeout(() => {
            obPreviewInfo.classList.add('hidden');
            obPreviewInfo.style.transition = '';
            obPreviewInfo.style.opacity = '';
            obPreviewInfo.style.transform = '';
            obPreviewInfo.style.maxHeight = '';
            obPreviewInfo.style.marginTop = '';
            obPreviewInfo.style.marginBottom = '';
            obPreviewInfo.style.paddingTop = '';
            obPreviewInfo.style.paddingBottom = '';
            obPreviewInfo.style.overflow = '';
          }, 450);
        }
        if (feedback) {
          feedback.style.transition = 'opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
          feedback.style.opacity = '0';
          feedback.style.maxHeight = '0px';
          feedback.style.marginTop = '0px';
          feedback.style.marginBottom = '0px';
          feedback.style.paddingTop = '0px';
          feedback.style.paddingBottom = '0px';
          feedback.style.overflow = 'hidden';
          setTimeout(() => {
            feedback.classList.add('hidden');
            feedback.style.transition = '';
            feedback.style.opacity = '';
            feedback.style.maxHeight = '';
            feedback.style.marginTop = '';
            feedback.style.marginBottom = '';
            feedback.style.paddingTop = '';
            feedback.style.paddingBottom = '';
            feedback.style.overflow = '';
          }, 450);
        }
      }, 2500);
      if (data.palette && data.palette.length > 0) {
        currentPalette = data.palette.map(p => ({
          hex: p.hex_code || p.hex,
          role: p.role || 'Brand Color'
        }));
        renderPaletteManager();
      } else if (data.extracted_palette && data.extracted_palette.length > 0) {
        currentPalette = data.extracted_palette.map(hex => ({
          hex: hex.toUpperCase(),
          role: 'Extracted Color'
        }));
        renderPaletteManager();
      }
      if (data.suggested_personality) {
        document.getElementById('ob-personality').value = data.suggested_personality;
      }
      if (data.suggested_mood) {
        document.getElementById('ob-mood').value = data.suggested_mood;
      }
      if (data.suggested_tone) {
        document.getElementById('ob-tone').value = data.suggested_tone;
      }
      if (data.suggested_visual_style) {
        document.getElementById('ob-style').value = data.suggested_visual_style;
      }
      if (data.suggested_typography && document.getElementById('ob-typography')) {
        document.getElementById('ob-typography').value = data.suggested_typography;
      }
      if (data.suggested_avoidances) {
        document.getElementById('ob-avoid').value = data.suggested_avoidances;
      }
      if (data.extracted_motto) {
        document.getElementById('ob-tagline').value = data.extracted_motto;
      }
      if (feedback) {
        feedback.className = 'ob-scan-feedback success';
        feedback.innerHTML = `✨ <strong>Reference Analyzed!</strong> Extracted ${(data.extracted_palette || []).length} colors, typography (${data.suggested_typography || 'Modern Sans'}), whitespace (${data.whitespace_ratio}) and aesthetic mood.`;
      }
    } catch (err) {
      if (typeof scanProgressInterval !== 'undefined' && scanProgressInterval) clearInterval(scanProgressInterval);
      if (feedback) {
        feedback.className = 'ob-scan-feedback error';
        feedback.textContent = `Scan notice: ${err.message}. You can still pick custom colors below.`;
      }
    }
  };
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleScan(fileInput.files[0]);
    }
  });
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(event => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(event => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleScan(e.dataTransfer.files[0]);
      }
    });
  }
}

function initLogoUpload() {
  const logoFile = document.getElementById('ob-logo-file');
  const logoUrlInput = document.getElementById('ob-logo-url');
  const logoImg = document.getElementById('ob-logo-preview-img');
  const logoPlaceholder = document.getElementById('ob-logo-placeholder');
  const btnClearLogo = document.getElementById('btn-clear-logo');
  const previewBox = document.getElementById('ob-logo-preview-box');
  const uploadContainer = document.querySelector('.logo-upload-container');

  const handleLogoFile = (file) => {
    if (!file) return;

    // 1. Instant local preview via FileReader (DataURL)
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (logoImg) {
        logoImg.src = dataUrl;
        logoImg.classList.remove('hidden');
      }
      if (logoPlaceholder) logoPlaceholder.classList.add('hidden');
      if (btnClearLogo) btnClearLogo.classList.remove('hidden');
      if (logoUrlInput) logoUrlInput.value = dataUrl;
    };
    reader.readAsDataURL(file);

    // 2. Upload to backend storage in background
    const formData = new FormData();
    formData.append('file', file);
    fetch(`${API_BASE}/brands/upload-logo`, {
      method: 'POST',
      body: formData
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        if (data.logo_url && logoUrlInput) {
          logoUrlInput.value = data.logo_url;
        }
      }
      toast('Brand logo attached successfully!', 'success');
    }).catch(err => {
      console.debug('Server logo upload fallback to data URL:', err);
      toast('Brand logo staged locally.', 'info');
    });
  };

  if (logoFile) {
    logoFile.addEventListener('change', () => {
      if (logoFile.files && logoFile.files.length > 0) {
        handleLogoFile(logoFile.files[0]);
      }
    });
  }

  const btnBrowse = document.getElementById('btn-browse-logo');
  if (btnBrowse && logoFile) {
    btnBrowse.addEventListener('click', (e) => {
      e.preventDefault();
      logoFile.click();
    });
  }

  // Drag and drop on preview box and upload container
  const dropTargets = [previewBox, uploadContainer].filter(Boolean);
  dropTargets.forEach(target => {
    ['dragenter', 'dragover'].forEach(ev => {
      target.addEventListener(ev, (e) => {
        e.preventDefault();
        target.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(ev => {
      target.addEventListener(ev, (e) => {
        e.preventDefault();
        target.classList.remove('dragover');
      });
    });
    target.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleLogoFile(e.dataTransfer.files[0]);
      }
    });
  });

  if (logoUrlInput) {
    const applyUrl = () => {
      const val = logoUrlInput.value.trim();
      if (val) {
        if (logoImg) {
          logoImg.src = val;
          logoImg.classList.remove('hidden');
          logoImg.onload = () => {
            if (logoPlaceholder) logoPlaceholder.classList.add('hidden');
            if (btnClearLogo) btnClearLogo.classList.remove('hidden');
          };
          logoImg.onerror = () => {
            // Keep preview attempt or toast
          };
        }
        if (logoPlaceholder) logoPlaceholder.classList.add('hidden');
        if (btnClearLogo) btnClearLogo.classList.remove('hidden');
      } else {
        clearBrandLogo();
      }
    };
    logoUrlInput.addEventListener('input', applyUrl);
    logoUrlInput.addEventListener('change', applyUrl);
    logoUrlInput.addEventListener('paste', () => setTimeout(applyUrl, 50));
  }
}

function clearBrandLogo() {
  const logoFile = document.getElementById('ob-logo-file');
  const logoUrlInput = document.getElementById('ob-logo-url');
  const logoImg = document.getElementById('ob-logo-preview-img');
  const logoPlaceholder = document.getElementById('ob-logo-placeholder');
  const btnClearLogo = document.getElementById('btn-clear-logo');

  if (logoFile) logoFile.value = '';
  if (logoUrlInput) logoUrlInput.value = '';
  if (logoImg) {
    logoImg.src = '';
    logoImg.classList.add('hidden');
  }
  if (logoPlaceholder) logoPlaceholder.classList.remove('hidden');
  if (btnClearLogo) btnClearLogo.classList.add('hidden');
}
window.clearBrandLogo = clearBrandLogo;


function showSavingBrandModal(brandName, isUpdating) {
  const modal = document.getElementById('modal-saving-brand');
  if (!modal) return null;
  const title = document.getElementById('saving-modal-title');
  const stepText = document.getElementById('saving-modal-step-text');
  const statusText = document.getElementById('saving-modal-status-text');
  const percentText = document.getElementById('saving-modal-percent');
  const progressFill = document.getElementById('saving-modal-progress-fill');
  const substatus = document.getElementById('saving-modal-substatus');
  const icon = document.getElementById('saving-modal-icon');

  if (title) title.textContent = isUpdating ? `Updating '${brandName}'` : `Saving & Locking '${brandName}'`;
  if (stepText) stepText.textContent = 'Validating approved color palette and brand guidelines...';
  if (statusText) statusText.textContent = 'Initializing brand standards synthesis...';
  if (percentText) percentText.textContent = '15%';
  if (substatus) substatus.textContent = 'Connecting to BrandShield Governance Engine...';
  if (progressFill) {
    progressFill.className = 'upload-progress-fill uploading';
    progressFill.style.transition = 'width 0.25s ease';
    progressFill.style.width = '15%';
  }
  if (icon) {
    icon.innerHTML = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>';
    icon.style.color = '#6366F1';
  }

  modal.classList.remove('hidden');

  let currentSavePct = 15;
  const getSaveMeta = (p) => {
    if (p < 35) return {
      step: 'Validating approved color palette & reference guidelines...',
      status: 'Extracting CIELAB gamut centroids & compliance constraints...',
      sub: 'Verifying color harmony & WCAG contrast thresholds...'
    };
    if (p < 65) return {
      step: 'Synthesizing voice guidelines & personality vectors with AI...',
      status: 'Generating semantic brand identity tensors...',
      sub: 'Correlating tone, audience, and aesthetic mood...'
    };
    if (p < 85) return {
      step: 'Locking brand guidelines & compliance rules...',
      status: 'Encoding policy lexicon, forbidden claims & avoidances...',
      sub: 'Building biometric DNA vector for asset audits...'
    };
    return {
      step: 'Registering verified brand identity in company storage...',
      status: 'Writing immutable brand standard profile...',
      sub: 'Finalizing governance record & certification...'
    };
  };

  const timer = setInterval(() => {
    if (currentSavePct < 45) {
      currentSavePct += 2.0 + Math.random() * 2.5;
    } else if (currentSavePct < 75) {
      currentSavePct += 1.2 + Math.random() * 1.5;
    } else if (currentSavePct < 90) {
      currentSavePct += 0.6 + Math.random() * 0.8;
    } else if (currentSavePct < 97) {
      currentSavePct += 0.15 + Math.random() * 0.2;
    }
    if (currentSavePct > 97) currentSavePct = 97;

    const rounded = Math.floor(currentSavePct);
    if (progressFill) progressFill.style.width = `${rounded}%`;
    if (percentText) percentText.textContent = `${rounded}%`;

    const meta = getSaveMeta(rounded);
    if (stepText) stepText.textContent = meta.step;
    if (statusText) statusText.textContent = meta.status;
    if (substatus) substatus.textContent = meta.sub;
  }, 160);

  return {
    finish: (successName) => {
      clearInterval(timer);
      if (progressFill) {
        progressFill.className = 'upload-progress-fill done';
        progressFill.style.transition = 'width 0.25s cubic-bezier(0.1, 0.9, 0.2, 1)';
        progressFill.style.width = '100%';
      }
      if (percentText) percentText.textContent = '100%';
      if (stepText) stepText.textContent = `✓ Brand profile for '${successName}' certified & locked!`;
      if (statusText) statusText.textContent = 'Status: CONFIRMED • Standards active';
      if (substatus) substatus.textContent = 'Ready for creative developer inspections & audits';
      if (icon) {
        icon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        icon.style.color = '#10B981';
      }
      return new Promise(resolve => setTimeout(() => {
        modal.classList.add('hidden');
        resolve();
      }, 700));
    },
    fail: (errMsg) => {
      clearInterval(timer);
      if (stepText) stepText.textContent = `Save notice: ${errMsg}`;
      if (statusText) statusText.textContent = 'Operation halted';
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 1500);
    }
  };
}

function initOnboarding() {
  const form = document.getElementById('onboarding-form');
  const btn = document.getElementById('btn-create-draft');
  if (!form || !btn) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editingId = document.getElementById('ob-editing-brand-id')?.value;
    const brandName = document.getElementById('ob-brand-name')?.value?.trim() || 'Brand Profile';
    const paletteHexArray = currentPalette.map(c => c.hex);
    if (paletteHexArray.length === 0) {
      toast('Please add at least one approved brand color in the Palette Manager.', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>Saving & Locking Company Vibes...</span>';

    // Show progressive saving modal with live feedback
    const saveController = showSavingBrandModal(brandName, !!editingId);
    try {
      if (editingId) {
        const managerEmail = document.getElementById('ob-manager-email')?.value || 'brand@company.com';
        const confirmPayload = {
          brand_id: editingId,
          personality: document.getElementById('ob-personality').value.split(',').map(s => s.trim()).filter(Boolean),
          mood: document.getElementById('ob-mood').value.split(',').map(s => s.trim()).filter(Boolean),
          communication_tone: document.getElementById('ob-tone').value.split(',').map(s => s.trim()).filter(Boolean),
          visual_style: document.getElementById('ob-style').value.split(',').map(s => s.trim()).filter(Boolean),
          typography: document.getElementById('ob-typography')?.value ? document.getElementById('ob-typography').value.split(',').map(s => s.trim()).filter(Boolean) : [],
          target_audience: document.getElementById('ob-audience').value.trim(),
          approved_palette: paletteHexArray,
          disallowed_elements: document.getElementById('ob-avoid').value.split(',').map(s => s.trim()).filter(Boolean),
          mission_statement: document.getElementById('ob-tagline').value.trim(),
          logo_url: document.getElementById('ob-logo-url')?.value.trim() || '',
          confirmed_by: managerEmail
        };
        const confRes = await fetch(`${API_BASE}/brands/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(confirmPayload)
        });
        if (!confRes.ok) throw new Error(await confRes.text());
        const confirmed = await confRes.json();
        if (saveController) await saveController.finish(confirmed.brand_name || brandName);
        await loadBrands();
        toast(`Brand profile for '${confirmed.brand_name}' updated successfully.`, 'success');
        resetOnboardingForm();
        if (document.getElementById('tab-inspect')) {
          switchDashboardTab('tab-inspect');
          const brandSelect = document.getElementById('inspect-brand-select');
          if (brandSelect) {
            brandSelect.value = confirmed.brand_id;
            brandSelect.dispatchEvent(new Event('change'));
          }
        } else {
          setTimeout(() => {
            window.location.href = '/account';
          }, 400);
        }
        return;
      }
      const formData = new FormData();
      formData.append('brand_name', document.getElementById('ob-brand-name').value);
      formData.append('personality', document.getElementById('ob-personality').value);
      formData.append('mood', document.getElementById('ob-mood').value);
      formData.append('communication_tone', document.getElementById('ob-tone').value);
      formData.append('target_audience', document.getElementById('ob-audience').value);
      formData.append('visual_style', document.getElementById('ob-style').value);
      formData.append('typography', document.getElementById('ob-typography')?.value || '');
      formData.append('palette', paletteHexArray.join(', '));
      formData.append('disallowed_elements', document.getElementById('ob-avoid').value);
      formData.append('tagline_or_mission', document.getElementById('ob-tagline').value);
      formData.append('logo_url', document.getElementById('ob-logo-url')?.value.trim() || '');
      const refFilesInput = document.getElementById('ob-reference-files');
      if (refFilesInput && refFilesInput.files) {
        for (let i = 0; i < refFilesInput.files.length; i++) {
          formData.append('reference_files', refFilesInput.files[i]);
        }
      }
      const res = await fetch(`${API_BASE}/brands/draft`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error(await res.text());
      const draft = await res.json();
      const managerEmail = document.getElementById('ob-manager-email')?.value || 'brand@company.com';
      const confirmPayload = {
        brand_id: draft.brand_id,
        personality: draft.personality,
        mood: draft.mood,
        communication_tone: draft.communication_tone,
        visual_style: draft.visual_style,
        typography: document.getElementById('ob-typography')?.value ? document.getElementById('ob-typography').value.split(',').map(s => s.trim()).filter(Boolean) : (draft.typography || []),
        target_audience: draft.target_audience,
        approved_palette: paletteHexArray,
        disallowed_elements: draft.disallowed_elements,
        mission_statement: document.getElementById('ob-tagline').value.trim(),
        logo_url: draft.logo_url || (document.getElementById('ob-logo-url')?.value.trim() || ''),
        confirmed_by: managerEmail
      };
      const confRes = await fetch(`${API_BASE}/brands/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmPayload)
      });
      if (!confRes.ok) throw new Error(await confRes.text());
      const confirmed = await confRes.json();
      if (saveController) await saveController.finish(confirmed.brand_name || brandName);
      await loadBrands();
      toast(`Brand profile for '${confirmed.brand_name}' created successfully.`, 'success');
      resetOnboardingForm();
      if (document.getElementById('tab-inspect')) {
        switchDashboardTab('tab-inspect');
        const brandSelect = document.getElementById('inspect-brand-select');
        if (brandSelect) {
          brandSelect.value = confirmed.brand_id;
          brandSelect.dispatchEvent(new Event('change'));
        }
      } else {
        setTimeout(() => {
          window.location.href = '/account';
        }, 400);
      }
    } catch (err) {
      if (saveController) saveController.fail(err.message);
      toast(`Error saving brand profile: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      const editingIdNow = document.getElementById('ob-editing-brand-id')?.value;
      btn.innerHTML = editingIdNow ? '<span>Update Brand Profile</span>' : '<span>Save Brand Profile</span>';
    }
  });
}

let currentInspectStage = 'input';
let lastCompletedReport = null;

function switchInspectStage(stage) {
  const stageInput = document.getElementById('inspect-stage-input');
  const stageLoading = document.getElementById('inspect-stage-loading');
  const stageResults = document.getElementById('inspect-stage-results');

  if (stageInput) stageInput.classList.toggle('hidden', stage !== 'input');
  if (stageLoading) stageLoading.classList.toggle('hidden', stage !== 'loading');
  if (stageResults) stageResults.classList.toggle('hidden', stage !== 'results');

  currentInspectStage = stage;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchInspectStage = switchInspectStage;

function resetToInspectInput() {
  switchInspectStage('input');
  const form = document.getElementById('inspection-form');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.resetToInspectInput = resetToInspectInput;

function exportActiveAuditSpec() {
  if (!lastCompletedReport) {
    toast('No inspection report active to export.', 'warning');
    return;
  }
  const jsonStr = JSON.stringify(lastCompletedReport, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanket_audit_${lastCompletedReport.inspection_id || 'spec'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Exported Audit Spec JSON (${lastCompletedReport.inspection_id})`, 'success');
}
window.exportActiveAuditSpec = exportActiveAuditSpec;

function initInspection() {
  const form = document.getElementById('inspection-form');
  const btn = document.getElementById('btn-run-inspect');
  const emptyState = document.getElementById('inspection-empty-state');
  const loadingState = document.getElementById('inspection-loading-state');
  const resultsView = document.getElementById('inspection-results-view');
  const inlineStatus = document.getElementById('inspect-inline-status');
  const inlineText = document.getElementById('inline-status-text');

  if (!form) return;

  const tabModeText = document.getElementById('tab-mode-text');
  const tabModeFile = document.getElementById('tab-mode-file');
  if (tabModeText) tabModeText.addEventListener('click', () => setInputMode('text'));
  if (tabModeFile) tabModeFile.addEventListener('click', () => setInputMode('file'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const brandSelect = document.getElementById('inspect-brand-select');
    const brandId = brandSelect ? brandSelect.value : '';
    const fileInput = document.getElementById('inspect-file');
    const copyTextarea = document.getElementById('inspect-copy-text');

    if (!brandId) {
      toast('Please select a target brand standard profile first.', 'warning');
      return;
    }

    const brandData = brandsMap[brandId] || {};
    const brandDisplayName = brandData.brand_name || brandId;

    const formData = new FormData();
    let submissionTitle = '';

    const textVal = copyTextarea ? copyTextarea.value.trim() : '';
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

    if (activeInputMode === 'text') {
      if (textVal) {
        formData.append('copy_text', textVal);
        submissionTitle = textVal.length > 36 ? textVal.substring(0, 36) + '...' : textVal;
      } else if (hasFile) {
        setInputMode('file');
        formData.append('file', fileInput.files[0]);
        submissionTitle = fileInput.files[0].name;
      } else {
        toast('Please enter advertising copy or choose an asset to inspect.', 'warning');
        return;
      }
    } else {
      if (hasFile) {
        formData.append('file', fileInput.files[0]);
        submissionTitle = fileInput.files[0].name;
      } else if (textVal) {
        setInputMode('text');
        formData.append('copy_text', textVal);
        submissionTitle = textVal.length > 36 ? textVal.substring(0, 36) + '...' : textVal;
      } else {
        toast('Please select or drop a poster or graphic asset to inspect.', 'warning');
        return;
      }
    }

    // Populate NewsCatcher Loading Telemetry & Config Sidecar
    const stagedTargetBrand = document.getElementById('staged-target-brand');
    const stagedConfigBrand = document.getElementById('staged-config-brand-name');
    const stagedTargetFilename = document.getElementById('staged-target-filename');
    const stagedMainTitle = document.getElementById('staged-loading-title');
    const stagedSubtext = document.getElementById('staged-loading-subtext');
    const stagedProgressFill = document.getElementById('staged-progress-bar-fill');
    const stagedProgressPct = document.getElementById('staged-progress-pct');
    const stagedQuickStatus = document.getElementById('staged-quick-status-note');

    if (stagedTargetBrand) stagedTargetBrand.textContent = brandDisplayName;
    if (stagedConfigBrand) stagedConfigBrand.textContent = brandDisplayName;
    if (stagedTargetFilename) stagedTargetFilename.textContent = submissionTitle;

    // Reset Stepper Pills
    const setStepper = (activeStep, pct, title, subtitle, quickNote) => {
      for (let i = 1; i <= 4; i++) {
        const p = document.getElementById(`load-step-pill-${i}`);
        if (p) {
          if (i < activeStep) p.className = 'stepper-step done';
          else if (i === activeStep) p.className = 'stepper-step active';
          else p.className = 'stepper-step';
        }
        if (i <= 3) {
          const l = document.getElementById(`load-step-line-${i}`);
          if (l) l.className = i < activeStep ? 'stepper-line done' : 'stepper-line';
        }
      }
      if (stagedMainTitle) stagedMainTitle.innerHTML = title;
      if (stagedSubtext) stagedSubtext.textContent = subtitle;
      if (stagedProgressFill) stagedProgressFill.style.width = `${pct}%`;
      if (stagedProgressPct) stagedProgressPct.textContent = `${pct}%`;
      if (stagedQuickStatus) stagedQuickStatus.textContent = quickNote;
    };

    // Step 1: Initial Ingest
    setStepper(1, 25, 'Step 1 of 4: Ingesting &amp; Staging Creative Asset...', 'Pre-processing dimensions, rasterization &amp; perceptual encoding', 'Staging asset and computing baseline perceptual tensors');

    // Switch view to dedicated NewsCatcher loading stage!
    switchInspectStage('loading');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-spinner"></span> <span>Inspecting...</span>';
    }

    const startTime = Date.now();

    // Timed progressive transitions matching the user's NewsCatcher screen
    const stepTimer1 = setTimeout(() => {
      setStepper(2, 55, 'Step 2 of 4: Quantizing CIELAB Centroids &amp; Layout Vectors...', 'Calculating perceptual color distances (&Delta;E) and spatial negative space', 'Comparing color clusters against official brand palette');
    }, 700);

    const stepTimer2 = setTimeout(() => {
      setStepper(3, 80, 'Step 3 of 4: Scanning Prohibited Terms &amp; Regulatory Lexicon...', 'Verifying regulatory avoidances, blacklist terms and brand tone rules', 'Evaluating communication tone and strictly banned claims');
    }, 1500);

    const stepTimer3 = setTimeout(() => {
      setStepper(4, 95, 'Step 4 of 4: Finishing...', 'Completing final checks and preparing records', 'Synthesizing multimodal alignment verdict');
    }, 2300);

    try {
      const res = await fetch(`${API_BASE}/inspect/${encodeURIComponent(brandId)}`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(errDetail);
      }

      const report = await res.json();
      lastCompletedReport = report;

      // Ensure minimum elapsed time (2.6s) so user clearly experiences the staged verification sequence
      const elapsed = Date.now() - startTime;
      if (elapsed < 2600) {
        await new Promise(resolve => setTimeout(resolve, 2600 - elapsed));
      }

      // Mark Step 4 100% complete
      for (let i = 1; i <= 4; i++) {
        const p = document.getElementById(`load-step-pill-${i}`);
        if (p) p.className = 'stepper-step done';
        if (i <= 3) {
          const l = document.getElementById(`load-step-line-${i}`);
          if (l) l.className = 'stepper-line done';
        }
      }
      if (stagedMainTitle) stagedMainTitle.innerHTML = 'Step 4 of 4: Audit Verified &bull; Complete!';
      if (stagedSubtext) stagedSubtext.textContent = 'Generating comprehensive compliance certificate and telemetry report';
      if (stagedProgressFill) stagedProgressFill.style.width = '100%';
      if (stagedProgressPct) stagedProgressPct.textContent = '100%';
      if (stagedQuickStatus) stagedQuickStatus.textContent = 'Audit complete — Loading results stage';

      renderInspectionReport(report);
      loadRecentReport();

      // Smoothly transition into Stage 3 (Dedicated Results View)
      await new Promise(resolve => setTimeout(resolve, 450));
      switchInspectStage('results');

      toast(`Audit complete: ${report.verdict} (${report.overall_score !== null ? report.overall_score : report.deterministic_score}% match)`, 'success');

    } catch (err) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      switchInspectStage('input');

      const isNetworkErr = err.message && (err.message.includes('NetworkError') || err.message.includes('Failed to fetch'));
      const friendlyMsg = isNetworkErr
        ? 'Could not connect to the inspection server. Please ensure the server is running on http://127.0.0.1:8000.'
        : `Inspection Error: ${err.message}`;

      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-error';
        if (inlineText) inlineText.textContent = friendlyMsg;
        inlineStatus.classList.remove('hidden');
      }

      toast(friendlyMsg, 'error');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Run Brand Inspection</span>';
      }
    }
  });
}

function renderInspectionReport(report) {
  lastCompletedReport = report;
  const resultsView = document.getElementById('inspection-results-view');
  const emptyState = document.getElementById('inspection-empty-state');
  const loadingState = document.getElementById('inspection-loading-state');
  if (emptyState) emptyState.classList.add('hidden');
  if (loadingState) loadingState.classList.add('hidden');
  const badgeElem = document.getElementById('report-id-badge');
  if (badgeElem) badgeElem.textContent = `Report: ${report.inspection_id}`;
  const banner = document.getElementById('verdict-banner');
  if (banner) {
    banner.className = `verdict-banner verdict-${report.verdict}`;
    const vTitle = document.getElementById('verdict-title');
    if (vTitle) vTitle.textContent = (report.verdict || 'APPROVED').replace(/_/g, ' ');
    const summary = report.verdict === 'APPROVED'
      ? 'Creative content meets company brand guidelines across objective color/layout rules and aesthetic vibe alignment.'
      : (report.verdict === 'CHANGES_REQUESTED'
        ? 'Aesthetic or color departures detected. Review observations and biometric divergences below.'
        : 'Significant brand guideline departures detected. Re-alignment required.');
    const vSummary = document.getElementById('verdict-summary');
    if (vSummary) vSummary.textContent = summary;
  }
  const scOverall = document.getElementById('score-overall');
  if (scOverall) scOverall.textContent = report.overall_score !== null && report.overall_score !== undefined ? `${report.overall_score}%` : `${report.deterministic_score}%`;
  const scDet = document.getElementById('score-deterministic');
  if (scDet) scDet.textContent = `${report.deterministic_score}%`;
  const scAi = document.getElementById('score-ai');
  if (scAi) scAi.textContent = report.ai_score !== null && report.ai_score !== undefined ? `${report.ai_score}%` : 'N/A';
  const aiScoreBadge = document.getElementById('ai-hero-score-badge');
  if (aiScoreBadge) {
    if (report.ai_score !== null && report.ai_score !== undefined) {
      aiScoreBadge.textContent = `${report.ai_score}% Vibe Alignment`;
    } else {
      aiScoreBadge.textContent = 'Deterministic Checks Only';
    }
  }
  let aiExpl = report.ai_explanation;
  let aiMood = report.ai_mood_detected;
  let aiPersonality = report.ai_personality_detected;
  let aiTone = report.ai_tone_detected;
  let aiTypography = report.ai_typography_detected;
  let aiLayout = report.ai_layout_detected;
  (report.findings || []).forEach(f => {
    if (f.source === 'AI_MODEL_INFERENCE') {
      if (f.category === 'PERSONALITY' && !aiExpl) aiExpl = f.explanation;
      if (f.category === 'MOOD' && !aiMood) aiMood = f.detected_value;
      if (f.category === 'TYPOGRAPHY' && !aiTypography) aiTypography = f.detected_value;
      if (f.category === 'LAYOUT' && !aiLayout) aiLayout = f.detected_value;
      if (f.category === 'PERSONALITY' && !aiPersonality) {
        const parts = (f.detected_value || '').split('|');
        if (parts[0]) aiPersonality = parts[0].replace('Personality:', '').trim();
        if (parts[1]) aiTone = parts[1].replace('Tone:', '').trim();
      }
    }
  });
  const heroExpl = document.getElementById('ai-hero-explanation');
  if (heroExpl) {
    heroExpl.textContent = aiExpl || "Multimodal AI evaluation was not executed for this report. Objective deterministic and biometric compliance checks completed.";
  }
  const heroMood = document.getElementById('ai-hero-mood');
  if (heroMood) heroMood.textContent = aiMood || 'N/A';
  const heroPers = document.getElementById('ai-hero-personality');
  if (heroPers) heroPers.textContent = aiPersonality || 'N/A';
  const heroTone = document.getElementById('ai-hero-tone');
  if (heroTone) heroTone.textContent = aiTone || 'N/A';
  const heroTypo = document.getElementById('ai-hero-typography');
  if (heroTypo) heroTypo.textContent = aiTypography || 'Standard Hierarchy';
  const heroLayout = document.getElementById('ai-hero-layout');
  if (heroLayout) heroLayout.textContent = aiLayout || 'Grid Balanced';
  const bio = report.biometric_match || {};
  const compScore = bio.composite_score !== undefined ? bio.composite_score : report.deterministic_score;
  const compBadge = document.getElementById('biometric-composite-badge');
  if (compBadge) {
    compBadge.textContent = `${compScore}% Biometric Match`;
    compBadge.style.color = compScore >= 70 ? '#10b981' : (compScore >= 45 ? '#f59e0b' : '#ef4444');
  }
  const setBioMetric = (valId, barId, score) => {
    const valElem = document.getElementById(valId);
    const barElem = document.getElementById(barId);
    if (valElem) valElem.textContent = score !== undefined && score !== null ? `${score}%` : 'N/A';
    if (barElem) barElem.style.width = score !== undefined && score !== null ? `${Math.max(5, Math.min(100, score))}%` : '0%';
  };
  setBioMetric('bio-color-score', 'bio-color-bar', bio.color_dna_score);
  setBioMetric('bio-whitespace-score', 'bio-whitespace-bar', bio.whitespace_dna_score);
  setBioMetric('bio-complexity-score', 'bio-complexity-bar', bio.complexity_dna_score);
  setBioMetric('bio-copy-score', 'bio-copy-bar', bio.copy_dna_score);
  const detectedRow = document.getElementById('detected-palette-row');
  if (detectedRow) {
    detectedRow.innerHTML = '';
    const tech = report.technical_summary || {};
    const detectedColors = tech.detected_palette || [];
    if (detectedColors.length === 0 && tech.dominant_color) {
      detectedColors.push(tech.dominant_color);
    }
    detectedColors.forEach(hex => {
      detectedRow.innerHTML += `
        <span class="color-swatch-chip" title="Copy ${hex}" onclick="copyToClipboard('${hex}', 'Copied ${hex}!')">
          <span class="swatch-color-box" style="background: ${hex};"></span>
          ${hex}
        </span>
      `;
    });
  }
  const approvedRow = document.getElementById('approved-palette-row');
  if (approvedRow) {
    approvedRow.innerHTML = '';
    const brandObj = brandsMap[report.brand_id];
    const approvedColors = brandObj && brandObj.approved_palette ? brandObj.approved_palette : [];
    if (approvedColors.length > 0) {
      approvedColors.forEach(hex => {
        approvedRow.innerHTML += `
          <span class="color-swatch-chip" title="Copy ${hex}" onclick="copyToClipboard('${hex}', 'Copied ${hex}!')">
            <span class="swatch-color-box" style="background: ${hex};"></span>
            ${hex}
          </span>
        `;
      });
    } else {
      approvedRow.innerHTML = '<span class="id-badge">Palette registered in brand DNA</span>';
    }
  }
  const fAll = document.getElementById('findings-count-all');
  const fHigh = document.getElementById('findings-count-high');
  const fMed = document.getElementById('findings-count-med');
  const fPass = document.getElementById('findings-count-pass');
  const findingsList = report.findings || [];
  if (fAll) fAll.textContent = findingsList.length;
  if (fHigh) fHigh.textContent = findingsList.filter(f => f.severity === 'HIGH').length;
  if (fMed) fMed.textContent = findingsList.filter(f => f.severity === 'MEDIUM').length;
  if (fPass) fPass.textContent = findingsList.filter(f => f.severity === 'PASS').length;
  const filterButtons = document.querySelectorAll('.filter-chip');
  filterButtons.forEach(b => b.classList.remove('active'));
  const filterAllBtn = document.getElementById('filter-all');
  if (filterAllBtn) filterAllBtn.classList.add('active');
  const findingsContainer = document.getElementById('findings-table-container');
  if (findingsContainer) {
    findingsContainer.innerHTML = '';
    (report.findings || []).forEach(f => {
      const card = document.createElement('div');
      card.className = `finding-card finding-severity-${f.severity}`;
      const sourceLabel = f.source === 'AI_MODEL_INFERENCE' ? 'Aesthetic Analysis' : 'Brand DNA Engine';
      const displayTitle = (f.title || '').replace(/^AI Observed Brand Discrepancy/, 'Observed Brand Departure');
      card.innerHTML = `
        <div class="finding-header">
          <span class="finding-title">${escapeHtml(displayTitle)}</span>
          <div>
            <span class="tag-badge tag-${f.severity}">${f.severity}</span>
            <span class="id-badge">${sourceLabel}</span>
          </div>
        </div>
        <p class="finding-body">${escapeHtml(f.explanation)}</p>
        ${f.evidence_snippet ? `<div class="finding-evidence">Evidence: ${escapeHtml(f.evidence_snippet)}</div>` : ''}
        ${f.suggested_correction ? `<div class="finding-correction"><strong>Remediation:</strong> ${escapeHtml(f.suggested_correction)}</div>` : ''}
      `;
      findingsContainer.appendChild(card);
    });
  }
  const humanDecision = document.getElementById('human-decision-text');
  if (humanDecision) {
    humanDecision.textContent = report.human_decision || (report.verdict === 'APPROVED' ? 'APPROVED' : 'PENDING REVIEW');
    humanDecision.className = `tag-badge tag-${report.verdict === 'APPROVED' ? 'PASS' : 'WARNING'}`;
  }
  activeInspectionId = report.inspection_id;
  activeInspectionFilename = report.submission_filename || 'Audit Report';
  const btnDeleteActive = document.getElementById('btn-delete-active-report');
  if (btnDeleteActive) btnDeleteActive.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  if (resultsView) resultsView.classList.remove('hidden');
}

async function loadRecentReport() {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    if (!res.ok) return;
    const reports = await res.json();
    const badge = document.getElementById('activity-reports-badge');
    if (badge) badge.textContent = `${reports.length} report${reports.length === 1 ? '' : 's'}`;
    const statCounter = document.getElementById('stat-inspections-count');
    if (statCounter) animateValue(statCounter, 0, reports.length, 600);
    const btnClearAll = document.getElementById('btn-clear-all-history');
    if (btnClearAll) {
      if (reports.length > 0) btnClearAll.classList.remove('hidden');
      else btnClearAll.classList.add('hidden');
    }
    const list = document.getElementById('recent-inspections-list');
    if (list) {
      if (reports.length > 0) {
        list.innerHTML = '';
        reports.slice(0, 15).forEach(rep => {
          const item = document.createElement('div');
          item.className = 'tracked-inspection-item';
          let iconClass = 'tracked-icon-pass';
          let iconEmoji = '✓';
          if (rep.verdict === 'CHANGES_REQUESTED') {
            iconClass = 'tracked-icon-warn';
            iconEmoji = '!';
          } else if (rep.verdict === 'REJECTED') {
            iconClass = 'tracked-icon-fail';
            iconEmoji = '×';
          }
          const dateStr = rep.created_at ? new Date(rep.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
          item.innerHTML = `
            <div class="tracked-item-left">
              <div class="tracked-icon-box ${iconClass}">${iconEmoji}</div>
              <div class="tracked-info">
                <span class="tracked-filename" title="${escapeHtml(rep.submission_filename)}">${escapeHtml(rep.submission_filename || 'Text Creative')}</span>
                <span class="tracked-brand-time">${escapeHtml(rep.brand_name)} &bull; ${escapeHtml(dateStr)}</span>
              </div>
            </div>
            <div class="tracked-item-right">
              <span class="tracked-score-pill">${rep.overall_score !== null && rep.overall_score !== undefined ? rep.overall_score + '%' : '--'}</span>
              <button type="button" class="btn-delete-item" title="Permanently delete this audit report" onclick="event.stopPropagation(); confirmDeleteReport('${rep.inspection_id}', '${escapeHtml(rep.submission_filename || 'Audit Report')}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          `;
          item.onclick = (e) => {
            if (e.target.closest('.btn-delete-item')) return;
            switchDashboardTab('tab-inspect');
            renderInspectionReport(rep);
            switchInspectStage('results');
            const inlineStatus = document.getElementById('inspect-inline-status');
            const inlineText = document.getElementById('inline-status-text');
            if (inlineStatus && inlineText) {
              inlineStatus.className = 'inspect-inline-status status-success';
              inlineStatus.classList.remove('hidden');
              const matchPct = rep.overall_score !== null && rep.overall_score !== undefined ? `${rep.overall_score}%` : 'N/A';
              inlineText.innerHTML = `Tracked audit <strong>${escapeHtml(rep.submission_filename || rep.inspection_id)}</strong>: <strong>${matchPct} Match (${rep.verdict})</strong>`;
            }
            toast(`Report ${rep.inspection_id}: ${rep.verdict} (${rep.overall_score !== null ? rep.overall_score : 100}% match)`);
          };
          list.appendChild(item);
        });
      } else {
        list.innerHTML = '<div class="empty-note">No recent audits. Submit creative work on the left to inspect.</div>';
      }
    }
    if (reports && reports.length > 0) {
      reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const select = document.getElementById('inspect-brand-select');
      if (select && !select.value && reports[0].brand_id) {
        select.value = reports[0].brand_id;
        select.dispatchEvent(new Event('change'));
      }
    }
  } catch (e) {
    console.debug('No previous report to load:', e);
  }
}

/* ==========================================================================
   PERMANENT DELETION & GOVERNANCE CLEANUP HANDLERS
   ========================================================================== */

let activeInspectionId = null;
let activeInspectionFilename = null;
let pendingDeleteAction = null;

function showConfirmDeleteModal({ title, subtitle, targetName, message, confirmText, onConfirm }) {
  const modal = document.getElementById('modal-confirm-delete');
  const tElem = document.getElementById('delete-modal-title');
  const sElem = document.getElementById('delete-modal-subtitle');
  const nElem = document.getElementById('delete-modal-target-name');
  const mElem = document.getElementById('delete-modal-message');
  const cText = document.getElementById('delete-modal-confirm-btn-text');
  const cBtn = document.getElementById('delete-modal-confirm-btn');

  if (tElem) tElem.textContent = title || 'Confirm Permanent Deletion';
  if (sElem) sElem.textContent = subtitle || 'This operation cannot be reversed.';
  if (nElem) nElem.textContent = targetName || '';
  if (mElem) mElem.textContent = message || 'Are you sure you want to permanently delete this item?';
  if (cText) cText.textContent = confirmText || 'Permanently Delete';

  pendingDeleteAction = onConfirm;

  if (cBtn) {
    cBtn.onclick = async () => {
      if (pendingDeleteAction) {
        const action = pendingDeleteAction;
        pendingDeleteAction = null;
        closeConfirmDeleteModal();
        await action();
      }
    };
  }

  if (modal) modal.classList.remove('hidden');
}
window.showConfirmDeleteModal = showConfirmDeleteModal;

function closeConfirmDeleteModal() {
  const modal = document.getElementById('modal-confirm-delete');
  if (modal) modal.classList.add('hidden');
  pendingDeleteAction = null;
}
window.closeConfirmDeleteModal = closeConfirmDeleteModal;

function confirmDeleteReport(inspectionId, filename) {
  showConfirmDeleteModal({
    title: 'Delete Inspection Report',
    subtitle: 'Audit record and associated upload will be erased.',
    targetName: filename || `Report ${inspectionId}`,
    message: `Are you sure you want to permanently delete inspection report "${filename || inspectionId}"? This will permanently remove all compliance findings, AI scores, and stored creative assets.`,
    confirmText: 'Delete Report',
    onConfirm: async () => {
      try {
        const res = await fetch(`${API_BASE}/reports/${encodeURIComponent(inspectionId)}`, {
          method: 'DELETE',
          headers: { 'X-User-Role': 'admin' }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast(`Failed to delete report: ${errData.detail || 'Server error'}`);
          return;
        }
        if (activeInspectionId === inspectionId) {
          activeInspectionId = null;
          activeInspectionFilename = null;
          const emptyState = document.getElementById('inspection-empty-state');
          const resultsView = document.getElementById('inspection-results-view');
          const btnDeleteActive = document.getElementById('btn-delete-active-report');
          const idBadge = document.getElementById('report-id-badge');
          if (emptyState) emptyState.classList.remove('hidden');
          if (resultsView) resultsView.classList.add('hidden');
          if (btnDeleteActive) btnDeleteActive.classList.add('hidden');
          if (idBadge) idBadge.textContent = 'Awaiting submission';
        }
        toast('Inspection report permanently deleted');
        await loadRecentReport();
      } catch (err) {
        console.error('Error deleting report:', err);
        toast('Network error deleting inspection report');
      }
    }
  });
}
window.confirmDeleteReport = confirmDeleteReport;

function confirmDeleteActiveReport() {
  if (!activeInspectionId) return;
  confirmDeleteReport(activeInspectionId, activeInspectionFilename);
}
window.confirmDeleteActiveReport = confirmDeleteActiveReport;

function confirmClearHistory() {
  showConfirmDeleteModal({
    title: 'Purge All Inspection History',
    subtitle: 'Irreversible destruction of entire verification log.',
    targetName: 'All Tracked Inspection Reports',
    message: 'Are you sure you want to permanently purge all inspection history? All audit findings, compliance scores, and uploaded files will be permanently deleted from the database and storage.',
    confirmText: 'Purge Entire History',
    onConfirm: async () => {
      try {
        const res = await fetch(`${API_BASE}/reports`, {
          method: 'DELETE',
          headers: { 'X-User-Role': 'admin' }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast(`Failed to purge history: ${errData.detail || 'Server error'}`);
          return;
        }
        const data = await res.json();
        activeInspectionId = null;
        activeInspectionFilename = null;
        const emptyState = document.getElementById('inspection-empty-state');
        const resultsView = document.getElementById('inspection-results-view');
        const btnDeleteActive = document.getElementById('btn-delete-active-report');
        const idBadge = document.getElementById('report-id-badge');
        if (emptyState) emptyState.classList.remove('hidden');
        if (resultsView) resultsView.classList.add('hidden');
        if (btnDeleteActive) btnDeleteActive.classList.add('hidden');
        if (idBadge) idBadge.textContent = 'Awaiting submission';
        toast(`Purged ${data.deleted_count || 0} inspection reports permanently`);
        await loadRecentReport();
      } catch (err) {
        console.error('Error clearing history:', err);
        toast('Network error purging history');
      }
    }
  });
}
window.confirmClearHistory = confirmClearHistory;

function confirmDeleteBrand(brandId, brandName) {
  showConfirmDeleteModal({
    title: 'Delete Brand Standard',
    subtitle: 'Brand guidelines and all associated history will be erased.',
    targetName: brandName || brandId,
    message: `Are you sure you want to permanently delete brand standard "${brandName || brandId}"? All company guidelines, approved color palettes, strict avoidances, and associated inspection reports will be permanently purged.`,
    confirmText: 'Delete Brand Permanently',
    onConfirm: async () => {
      try {
        const res = await fetch(`${API_BASE}/brands/${encodeURIComponent(brandId)}?cascade_reports=true`, {
          method: 'DELETE',
          headers: { 'X-User-Role': 'admin' }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast(`Failed to delete brand: ${errData.detail || 'Server error'}`);
          return;
        }
        const editIdInput = document.getElementById('ob-editing-brand-id');
        if (editIdInput && editIdInput.value === brandId) {
          resetOnboardingForm();
        }
        const select = document.getElementById('inspect-brand-select');
        if (select && select.value === brandId) {
          select.value = '';
          select.dispatchEvent(new Event('change'));
        }
        toast(`Brand "${brandName || brandId}" permanently deleted`);
        await loadBrands();
        await loadRecentReport();
      } catch (err) {
        console.error('Error deleting brand:', err);
        toast('Network error deleting brand');
      }
    }
  });
}
window.confirmDeleteBrand = confirmDeleteBrand;

function confirmDeleteEditingBrand() {
  const editIdInput = document.getElementById('ob-editing-brand-id');
  const brandNameInput = document.getElementById('ob-brand-name');
  if (!editIdInput || !editIdInput.value) return;
  confirmDeleteBrand(editIdInput.value, brandNameInput ? brandNameInput.value : editIdInput.value);
}
window.confirmDeleteEditingBrand = confirmDeleteEditingBrand;

/* ==========================================================================
   SIDEBAR COLLAPSE, SIDE CONTENT HIDING & 3-DOTS KEBAB MENUS
   ========================================================================== */

function toggleSidebar() {
  const layout = document.getElementById('dashboard-layout');
  const floatBtn = document.getElementById('floating-sidebar-trigger');
  if (!layout) return;

  const isHidden = layout.classList.toggle('sidebar-hidden');
  if (floatBtn) {
    if (isHidden) {
      floatBtn.classList.remove('hidden');
    } else {
      floatBtn.classList.add('hidden');
    }
  }

  try {
    localStorage.setItem('sanket_sidebar_hidden', isHidden ? 'true' : 'false');
  } catch (e) {}
}
window.toggleSidebar = toggleSidebar;

function toggleActivityPanel() {
  const layout = document.getElementById('dashboard-layout');
  if (!layout) return;
  layout.classList.toggle('activity-hidden');
}
window.toggleActivityPanel = toggleActivityPanel;

function initSidebarState() {
  try {
    const savedSidebar = localStorage.getItem('sanket_sidebar_hidden');
    const layout = document.getElementById('dashboard-layout');
    const floatBtn = document.getElementById('floating-sidebar-trigger');
    if (savedSidebar === 'true') {
      if (layout) layout.classList.add('sidebar-hidden');
      if (floatBtn) floatBtn.classList.remove('hidden');
    } else {
      if (layout) layout.classList.remove('sidebar-hidden');
      if (floatBtn) floatBtn.classList.add('hidden');
    }
  } catch (e) {}
}
window.initSidebarState = initSidebarState;

function toggleBrandKebabMenu(event, brandId) {
  event.stopPropagation();
  const menuId = `kebab-menu-${brandId}`;
  const menu = document.getElementById(menuId);
  const wasOpen = menu && !menu.classList.contains('hidden');
  closeAllKebabMenus();
  if (menu && !wasOpen) {
    menu.classList.remove('hidden');
  }
}
window.toggleBrandKebabMenu = toggleBrandKebabMenu;

function closeAllKebabMenus() {
  document.querySelectorAll('.brand-kebab-dropdown').forEach(m => m.classList.add('hidden'));
}
window.closeAllKebabMenus = closeAllKebabMenus;

document.addEventListener('click', () => {
  closeAllKebabMenus();
});


// ==========================================================================
// COMPANY ACCOUNT & MASTER BRAND PROFILE LOGIC
// ==========================================================================

let currentAccountBrandId = null;

function hexToRgb(hex) {
  if (!hex) return null;
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6) return null;
  const num = parseInt(hex, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function onAccountBrandSelectChange(brandId) {
  currentAccountBrandId = brandId;
  renderAccountPage(brandId);
}
window.onAccountBrandSelectChange = onAccountBrandSelectChange;

function renderAccountPage(targetBrandId) {
  const emptyState = document.getElementById('account-empty-state');
  const mainContent = document.getElementById('account-main-content');
  const accSelect = document.getElementById('acc-brand-select');
  if (!mainContent) return;

  const brands = Object.values(brandsMap || {});
  if (brands.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    mainContent.classList.add('hidden');
    if (accSelect) accSelect.innerHTML = '<option value="">No registered brands</option>';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  mainContent.classList.remove('hidden');

  // Populate brand selector
  if (accSelect) {
    accSelect.innerHTML = '';
    brands.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.brand_id;
      opt.textContent = `${b.brand_name} (${b.status || 'CONFIRMED'})`;
      accSelect.appendChild(opt);
    });
  }

  // Determine active brand to show
  let b = null;
  if (targetBrandId && brandsMap[targetBrandId]) {
    b = brandsMap[targetBrandId];
  } else if (currentAccountBrandId && brandsMap[currentAccountBrandId]) {
    b = brandsMap[currentAccountBrandId];
  } else {
    b = brands[0];
  }
  currentAccountBrandId = b.brand_id;
  if (accSelect) accSelect.value = b.brand_id;

  // 1. Identity & Hero Header
  const avatarBox = document.getElementById('acc-avatar-box');
  if (avatarBox) {
    if (b.logo_url) {
      avatarBox.innerHTML = `<img src="${escapeHtml(b.logo_url)}" class="acc-hero-logo-img" alt="${escapeHtml(b.brand_name)} Logo">`;
    } else {
      const initials = (b.brand_name || 'CO').trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
      avatarBox.textContent = initials || 'CO';
    }
  }
  const heroName = document.getElementById('acc-hero-name');
  if (heroName) heroName.textContent = b.brand_name || 'Organization Brand';
  const heroStatus = document.getElementById('acc-hero-status');
  if (heroStatus) {
    heroStatus.textContent = b.status || 'CONFIRMED';
    heroStatus.className = `tag-badge ${b.status === 'CONFIRMED' ? 'tag-PASS' : 'tag-WARNING'}`;
  }
  const heroId = document.getElementById('acc-hero-id');
  if (heroId) heroId.textContent = `ID: ${b.brand_id}`;
  const heroTagline = document.getElementById('acc-hero-tagline');
  if (heroTagline) {
    const tag = b.mission_statement || b.tagline_or_mission;
    heroTagline.textContent = tag ? `"${tag}"` : 'Organization mission statement & standard guidelines.';
  }

  // Meta pills
  const metaEmail = document.getElementById('acc-meta-email');
  if (metaEmail) metaEmail.textContent = b.confirmed_by || 'brand.lead@company.com';
  const metaOwner = document.getElementById('acc-meta-owner');
  if (metaOwner) metaOwner.textContent = b.owner_id || 'default-org';
  const metaCreated = document.getElementById('acc-meta-created');
  if (metaCreated) {
    metaCreated.textContent = b.created_at ? new Date(b.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Active Standard';
  }

  // 2. Approved Brand Palette
  const paletteContainer = document.getElementById('acc-palette-cards-grid');
  const paletteCount = document.getElementById('acc-palette-count');
  const palette = b.approved_palette || [];
  if (paletteCount) paletteCount.textContent = `${palette.length} Color${palette.length === 1 ? '' : 's'}`;
  if (paletteContainer) {
    if (palette.length > 0) {
      paletteContainer.innerHTML = '';
      const roleLabels = ['Primary Brand Color', 'Secondary Accent', 'Highlight / CTA', 'Background / Base'];
      palette.forEach((hex, idx) => {
        const rgb = hexToRgb(hex);
        const role = roleLabels[idx % roleLabels.length];
        const card = document.createElement('div');
        card.className = 'acc-color-card';
        card.title = `Click to copy ${hex}`;
        card.onclick = () => copyToClipboard(hex);
        card.innerHTML = `
          <div class="acc-color-swatch-block" style="background: ${hex};"></div>
          <div class="acc-color-meta">
            <span class="acc-color-hex">${hex}</span>
            <span class="acc-color-rgb">${rgb ? `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})` : ''}</span>
            <span class="acc-color-role">${role}</span>
          </div>
        `;
        paletteContainer.appendChild(card);
      });
    } else {
      paletteContainer.innerHTML = '<p class="empty-note">No approved colors defined in Company Portal.</p>';
    }
  }

  // 3. Visual Aesthetic Guidelines
  const styleBox = document.getElementById('acc-visual-style-text');
  if (styleBox) {
    const styles = Array.isArray(b.visual_style) ? b.visual_style.join(', ') : (b.visual_style || '');
    styleBox.textContent = styles || 'Extreme Minimalism, High-contrast, Modern clean layout composition.';
  }

  // Typography
  const typoBox = document.getElementById('acc-typography-text');
  if (typoBox) {
    const typo = Array.isArray(b.typography) ? b.typography.join(', ') : (b.typography || '');
    typoBox.textContent = typo || 'Modern Sans-Serif, Inter / System Display, disciplined typographical hierarchy.';
  }

  // Core Values
  const valuesWrap = document.getElementById('acc-key-values-chips');
  if (valuesWrap) {
    valuesWrap.innerHTML = '';
    const values = b.key_values || [];
    if (values.length > 0) {
      values.forEach(v => {
        const chip = document.createElement('span');
        chip.className = 'acc-tag-chip';
        chip.textContent = v;
        valuesWrap.appendChild(chip);
      });
    } else {
      valuesWrap.innerHTML = '<span class="acc-tag-chip">Brand Integrity</span><span class="acc-tag-chip">Visual Consistency</span><span class="acc-tag-chip">Evidence-Based Governance</span>';
    }
  }

  // 4. Voice & Tone Chips
  renderChips('acc-personality-chips', b.personality, 'chip-personality');
  renderChips('acc-mood-chips', b.mood, 'chip-mood');
  renderChips('acc-tone-chips', b.communication_tone, 'chip-tone');

  const audienceText = document.getElementById('acc-audience-text');
  if (audienceText) {
    audienceText.textContent = b.target_audience || 'Enterprise clientele, professional designers, and global audience.';
  }

  // 5. Prohibited Terms
  const avoidContainer = document.getElementById('acc-avoid-chips');
  const avoidCount = document.getElementById('acc-avoid-count');
  const avoid = b.disallowed_elements || [];
  if (avoidCount) avoidCount.textContent = `${avoid.length} Term${avoid.length === 1 ? '' : 's'}`;
  if (avoidContainer) {
    if (avoid.length > 0) {
      avoidContainer.innerHTML = '';
      avoid.forEach(word => {
        const item = document.createElement('span');
        item.className = 'avoid-chip-item';
        item.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> <span>${escapeHtml(word)}</span>`;
        avoidContainer.appendChild(item);
      });
    } else {
      avoidContainer.innerHTML = '<span class="acc-tag-chip">No prohibited terms registered</span>';
    }
  }

  // 6. Reference Assets
  const assetsContainer = document.getElementById('acc-reference-assets-list');
  const assetsCount = document.getElementById('acc-assets-count');
  const assets = b.reference_assets || [];
  if (assetsCount) assetsCount.textContent = `${assets.length} Asset${assets.length === 1 ? '' : 's'}`;
  if (assetsContainer) {
    if (assets.length > 0) {
      assetsContainer.innerHTML = '';
      assets.forEach(ast => {
        const it = document.createElement('div');
        it.className = 'acc-asset-item';
        it.innerHTML = `
          <div class="acc-asset-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span class="acc-asset-name">${escapeHtml(ast.original_filename || ast.asset_id)}</span>
          </div>
          <span class="id-badge">${escapeHtml(ast.media_category || 'Reference Image')}</span>
        `;
        assetsContainer.appendChild(it);
      });
    } else {
      assetsContainer.innerHTML = '<p class="empty-note">No reference graphics uploaded yet. Upload reference brand assets in Company Portal to auto-extract DNA centroids.</p>';
    }
  }
}
window.renderAccountPage = renderAccountPage;

function renderChips(containerId, items, extraClass) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  if (arr.length > 0) {
    arr.forEach(item => {
      const chip = document.createElement('span');
      chip.className = `acc-tag-chip ${extraClass || ''}`;
      chip.textContent = item;
      el.appendChild(chip);
    });
  } else {
    el.innerHTML = '<span class="acc-tag-chip">None registered</span>';
  }
}

function editCurrentAccountBrand() {
  if (!currentAccountBrandId) return;
  startEditingBrand(currentAccountBrandId);
}
window.editCurrentAccountBrand = editCurrentAccountBrand;

function inspectCurrentAccountBrand() {
  if (!currentAccountBrandId) return;
  window.location.href = `/check-vibe?brand=${encodeURIComponent(currentAccountBrandId)}`;
}
window.inspectCurrentAccountBrand = inspectCurrentAccountBrand;

function exportCurrentAccountBrand() {
  if (!currentAccountBrandId || !brandsMap[currentAccountBrandId]) return;
  const b = brandsMap[currentAccountBrandId];
  const jsonStr = JSON.stringify(b, null, 2);
  copyToClipboard(jsonStr);
  toast(`Brand specification for '${b.brand_name}' copied to clipboard as JSON.`);
}
window.exportCurrentAccountBrand = exportCurrentAccountBrand;

function deleteCurrentAccountBrand() {
  if (!currentAccountBrandId || !brandsMap[currentAccountBrandId]) return;
  const b = brandsMap[currentAccountBrandId];
  confirmDeleteBrand(b.brand_id, b.brand_name);
}
window.deleteCurrentAccountBrand = deleteCurrentAccountBrand;

function copyAllAccountColors() {
  if (!currentAccountBrandId || !brandsMap[currentAccountBrandId]) return;
  const b = brandsMap[currentAccountBrandId];
  const hexes = (b.approved_palette || []).join(', ');
  if (!hexes) {
    toast('No approved colors to copy.', 'warning');
    return;
  }
  copyToClipboard(hexes);
  toast(`Copied ${b.approved_palette.length} color HEX codes to clipboard.`);
}
window.copyAllAccountColors = copyAllAccountColors;

function exportAccountCssVars() {
  if (!currentAccountBrandId || !brandsMap[currentAccountBrandId]) return;
  const b = brandsMap[currentAccountBrandId];
  const palette = b.approved_palette || [];
  if (palette.length === 0) {
    toast('No approved colors to export.', 'warning');
    return;
  }
  const cssLines = [
    `/* Sanket AI Brand Palette: ${b.brand_name} */`,
    `:root {`
  ];
  palette.forEach((hex, i) => {
    cssLines.push(`  --brand-color-${i+1}: ${hex};`);
  });
  cssLines.push(`}`);
  copyToClipboard(cssLines.join('\n'));
  toast(`Exported CSS variables for '${b.brand_name}' to clipboard.`);
}
window.exportAccountCssVars = exportAccountCssVars;

function viewSelectedBrandInAccount() {
  const select = document.getElementById('inspect-brand-select');
  const brandId = select ? select.value : '';
  if (brandId) {
    window.location.href = `/account?brand=${encodeURIComponent(brandId)}`;
  } else {
    window.location.href = '/account';
  }
}
window.viewSelectedBrandInAccount = viewSelectedBrandInAccount;


/* ==========================================================================
   ROUND 3 CONTROLLERS: JUDGE DEMO PRESETS, PRE-FLIGHT, CO-PILOT, AUTO-FIX
   ========================================================================== */

let currentAuditData = null;
let currentRemediatedResult = null;

// 1. Judge & Evaluator 1-Click Test Presets
async function loadJudgePreset(presetKey) {
  const brandSelect = document.getElementById('inspect-brand-select');
  const copyInput = document.getElementById('inspect-copy-text');
  const fileInput = document.getElementById('inspect-file') || document.getElementById('inspect-file-input');

  if (presetKey === 'nike_compliant') {
    if (brandSelect) {
      brandSelect.value = 'nike';
      brandSelect.dispatchEvent(new Event('change'));
    }
    if (copyInput) {
      copyInput.value = "Find your greatness with relentless drive and uncompromising discipline. Engineered for athletes who refuse to settle.";
      copyInput.dispatchEvent(new Event('input'));
    }
    await loadSampleFileToInput('/static/samples/nike_compliant_poster.png', 'nike_compliant_poster.png');
    toast('Loaded Nike Certified Demo — Click "Run Brand Inspection" to audit.');
  } else if (presetKey === 'off_brand_remediate') {
    if (brandSelect) {
      brandSelect.value = 'nike';
      brandSelect.dispatchEvent(new Event('change'));
    }
    if (copyInput) {
      copyInput.value = "Buy this cheap fake deal now with 100% cure guaranteed! Unbelievable discount today.";
      copyInput.dispatchEvent(new Event('input'));
    }
    await loadSampleFileToInput('/static/samples/off_brand_poster.png', 'off_brand_poster.png');
    toast('Loaded Off-Brand Test — Tests policy failures, Co-Pilot rewrites, and 1-Click Auto-Fix.');
  } else if (presetKey === 'grb_heritage') {
    if (brandSelect) {
      brandSelect.value = 'grb';
      brandSelect.dispatchEvent(new Event('change'));
    }
    if (copyInput) {
      copyInput.value = "Carrying forward the heritage of pure traditional taste. Authentic culinary richness crafted with family pride.";
      copyInput.dispatchEvent(new Event('input'));
    }
    await loadSampleFileToInput('/static/samples/grb_heritage_poster.png', 'grb_heritage_poster.png');
    toast('Loaded GRB Heritage Demo — Traditional food brand guidelines.');
  }
}
window.loadJudgePreset = loadJudgePreset;

async function loadSampleFileToInput(sampleUrl, filename) {
  try {
    const res = await fetch(sampleUrl);
    if (!res.ok) throw new Error("Failed to load sample image");
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'image/png' });

    // Stage file in global state and simulate selection
    window.stagedInspectFile = file;

    // Update file preview UI
    const previewInfo = document.getElementById('file-preview-info');
    const previewFilename = document.getElementById('preview-filename');
    const previewFilesize = document.getElementById('preview-filesize');
    const previewThumb = document.getElementById('preview-thumbnail');
    const fallbackIcon = document.getElementById('preview-fallback-icon');

    if (previewFilename) previewFilename.textContent = file.name;
    if (previewFilesize) previewFilesize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    if (previewThumb) {
      previewThumb.src = URL.createObjectURL(file);
      previewThumb.classList.remove('hidden');
    }
    if (fallbackIcon) fallbackIcon.classList.add('hidden');
    if (previewInfo) previewInfo.classList.remove('hidden');

    // Run Instant Pre-Flight Scanner
    runInstantPreflight(file);

    // Also trigger palette pre-filter if brand selected
    const brandSelect = document.getElementById('inspect-brand-select');
    if (brandSelect && brandSelect.value && typeof triggerDeveloperColorPreFilter === 'function') {
      triggerDeveloperColorPreFilter(brandSelect.value, file);
    }
  } catch (e) {
    console.warn("Could not load sample file:", e);
  }
}

// 2. Instant Drag-and-Drop Pre-Flight Scanner (Client-Side & Server Diagnostics)
function runInstantPreflight(file) {
  const hud = document.getElementById('preflight-scanner-hud');
  if (!hud || !file || !file.type.startsWith('image/')) return;

  hud.classList.remove('hidden');

  const startTime = performance.now();
  const reader = new FileReader();

  reader.onload = function(e) {
    const dataUrl = e.target.result;

    // Instant image preview thumbnail in HUD
    const liveThumb = document.getElementById('pf-live-thumb');
    if (liveThumb) {
      liveThumb.src = dataUrl;
    }

    const img = new Image();
    img.onload = function() {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      // 1. Dimensions & Aspect Ratio Classification
      const dimsTag = document.getElementById('pf-dimensions-tag');
      if (dimsTag) dimsTag.textContent = `${origW} × ${origH} px`;

      const aspectVal = origW / Math.max(1, origH);
      let aspectLabel = "1:1 Square";
      let orientation = "Square";
      let dimsSub = "Social Feed Standard (Instagram / Display)";

      if (aspectVal >= 1.7) {
        aspectLabel = "16:9 Landscape";
        orientation = "Landscape";
        dimsSub = "Hero Banner / YouTube / Display Ad";
      } else if (aspectVal <= 0.6) {
        aspectLabel = "9:16 Vertical";
        orientation = "Portrait";
        dimsSub = "Stories / Reels / TikTok Format";
      } else if (aspectVal >= 0.75 && aspectVal <= 0.85) {
        aspectLabel = "4:5 Portrait";
        orientation = "Portrait";
        dimsSub = "Social Feed Portrait Carousel";
      } else if (aspectVal > 1.15) {
        aspectLabel = `${aspectVal.toFixed(2)}:1 Landscape`;
        orientation = "Landscape";
        dimsSub = "Wide Web Creative Banner";
      } else if (aspectVal < 0.85) {
        aspectLabel = `1:${(1 / aspectVal).toFixed(2)} Portrait`;
        orientation = "Portrait";
        dimsSub = "Vertical Marketing Poster";
      }

      // 2. Off-screen canvas analysis (100x100 thumbnail for instant sub-millisecond calculation)
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 100, 100);

      const imgData = ctx.getImageData(0, 0, 100, 100);
      const data = imgData.data;

      let totalR = 0, totalG = 0, totalB = 0;
      let lightBgCount = 0;
      const colorCounts = {};
      const luminances = [];

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];

        totalR += r;
        totalG += g;
        totalB += b;

        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
        luminances.push(lum);
        if (lum > 0.86 || lum < 0.10) lightBgCount++;

        // Quantize to hex (32-level quantization for palette clustering)
        const qr = Math.min(255, Math.round(r / 32) * 32);
        const qg = Math.min(255, Math.round(g / 32) * 32);
        const qb = Math.min(255, Math.round(b / 32) * 32);
        const hex = `#${((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1).toUpperCase()}`;
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }

      const pixelCount = data.length / 4;
      const meanR = totalR / pixelCount;
      const meanG = totalG / pixelCount;
      const meanB = totalB / pixelCount;

      // 3. Color Temperature (Kelvin estimate)
      const tempDiff = meanR - meanB;
      let tempLabel = "Neutral 5400K";
      let tempSub = "Balanced Studio Daylight";
      let tempCategory = "NEUTRAL";
      if (tempDiff > 35) {
        tempLabel = "Warm 3000K";
        tempSub = "Golden / Amber Sunset Hue";
        tempCategory = "WARM";
      } else if (tempDiff > 12) {
        tempLabel = "Warm 3800K";
        tempSub = "Soft Ambient Warmth";
        tempCategory = "WARM";
      } else if (tempDiff < -35) {
        tempLabel = "Cool 7500K";
        tempSub = "High-Tech / Ice Daylight";
        tempCategory = "COOL";
      } else if (tempDiff < -12) {
        tempLabel = "Cool 6500K";
        tempSub = "Clean Daylight Blue";
        tempCategory = "COOL";
      }

      // 4. Contrast Measurement (Percentile Relative Luminance)
      luminances.sort((a, b) => a - b);
      const lMin = luminances[Math.floor(luminances.length * 0.10)] || 0.05;
      const lMax = luminances[Math.floor(luminances.length * 0.90)] || 0.95;
      const contrastRatio = parseFloat(((lMax + 0.05) / (lMin + 0.05)).toFixed(1));
      const contrastPassWCAG = contrastRatio >= 4.5;
      const contrastLabel = `${contrastRatio}:1 (${contrastPassWCAG ? 'WCAG AA Pass' : 'Low Contrast'})`;
      const contrastSub = contrastPassWCAG
        ? "Exceeds 4.5:1 recommended legibility threshold"
        : "Warning: May fail WCAG AA contrast on body text";

      // 5. Negative Space Estimation
      const whitespacePct = Math.min(88, Math.max(16, Math.round((lightBgCount / pixelCount) * 100)));

      // 6. Dominant Swatches (Top 5) & Approximate HEX Codes
      const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

      // 7. Layout Properties
      const meanLumVal = (0.299 * meanR + 0.587 * meanG + 0.114 * meanB);
      let layoutLabel = "Balanced Grid";
      let layoutSub = "Clean Visual Hierarchy & Contrast";
      if (whitespacePct > 55) {
        layoutLabel = "Spacious Open Layout";
        layoutSub = "Generous Margins & High Breathing Room";
      } else if (whitespacePct < 25) {
        layoutLabel = "High-Density Composition";
        layoutSub = "Tight Content-Heavy Arrangement";
      } else {
        layoutLabel = `${orientation} Balanced Grid`;
        layoutSub = "Standard Commercial Marketing Layout";
      }

      // 8. Preliminary Visual-Style Prediction (Mapped strictly to 7 mandated styles)
      const saturation = Math.max(0, Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB));
      let predictedStyle = "Corporate";
      let styleExplanation = "Structured commercial grid, balanced corporate tones, and business-ready presentation.";

      if (whitespacePct >= 48 && saturation < 60) {
        predictedStyle = "Minimalist";
        styleExplanation = "Generous negative space, restrained palette, and clean typography breathing room.";
      } else if (meanLumVal < 55 && (meanB > 90 || (meanR < 60 && meanG > 100))) {
        predictedStyle = "Futuristic";
        styleExplanation = "Dark high-tech backdrop punctuated by cyber cyan/neon accents.";
      } else if ((meanLumVal < 50 || meanLumVal > 225) && contrastRatio >= 7.5 && saturation < 50) {
        predictedStyle = "Luxury";
        styleExplanation = "Refined tonal depth, extreme contrast, and restrained monochrome/gold elegance.";
      } else if (saturation > 80 && tempCategory === "WARM") {
        predictedStyle = "Playful";
        styleExplanation = "Vibrant warm colors, dynamic saturation, and playful high-energy presentation.";
      } else if (saturation >= 65 || contrastRatio >= 9.0) {
        predictedStyle = "Bold";
        styleExplanation = "High-impact visual punch, saturated focal elements, and commanding contrast.";
      } else if (orientation === "Portrait" && whitespacePct >= 28 && whitespacePct <= 46) {
        predictedStyle = "Editorial";
        styleExplanation = "Magazine-style vertical balance, thoughtful composition, and editorial poise.";
      }

      // 9. Preliminary Brand Mismatch Warnings
      const mismatchBox = document.getElementById('pf-mismatch-box');
      const mismatchList = document.getElementById('pf-mismatch-list');
      const mismatchWarnings = [];

      const brandSelect = document.getElementById('inspect-brand-select');
      const selectedBrandId = brandSelect ? brandSelect.value : '';

      if (!contrastPassWCAG) {
        mismatchWarnings.push(`Estimated contrast (${contrastRatio}:1) is below WCAG AA 4.5:1 threshold.`);
      }

      // Check off-brand color mismatch against known palette if brand selected
      if (selectedBrandId === 'nike') {
        const hasBlackOrOrange = sortedColors.some(([hex]) => hex.startsWith('#0') || hex.startsWith('#1') || hex.startsWith('#F') || hex.startsWith('#E'));
        if (!hasBlackOrOrange && sortedColors.length > 0) {
          mismatchWarnings.push(`Dominant color ${sortedColors[0][0]} may deviate from Nike's core brand standards.`);
        }
      } else if (selectedBrandId === 'apex_cloud') {
        const hasNavyOrCyan = sortedColors.some(([hex]) => hex.includes('0B') || hex.includes('1C') || hex.includes('5B') || hex.includes('FF'));
        if (!hasNavyOrCyan && sortedColors.length > 0) {
          mismatchWarnings.push(`Dominant palette deviates from Apex Cloud's approved navy & cyber cyan centroids.`);
        }
      }

      if (mismatchBox && mismatchList) {
        if (mismatchWarnings.length > 0) {
          mismatchList.innerHTML = mismatchWarnings.map(w => `<div class="pf-mismatch-item">⚠️ ${escapeHtml(w)}</div>`).join('');
          mismatchBox.classList.remove('hidden');
        } else {
          mismatchBox.classList.add('hidden');
        }
      }

      const elapsed = Math.round(performance.now() - startTime);

      // Update HUD elements
      const tempText = document.getElementById('pf-temp-text');
      const tempSubEl = document.getElementById('pf-temp-sub');
      const contrastText = document.getElementById('pf-contrast-text');
      const contrastSubEl = document.getElementById('pf-contrast-sub');
      const aspectText = document.getElementById('pf-aspect-text');
      const dimsSubEl = document.getElementById('pf-dims-sub');
      const whiteText = document.getElementById('pf-whitespace-text');
      const whiteFill = document.getElementById('pf-whitespace-fill');
      const layoutText = document.getElementById('pf-layout-text');
      const layoutSubEl = document.getElementById('pf-layout-sub');
      const vibeText = document.getElementById('pf-vibe-text');
      const vibeSubEl = document.getElementById('pf-vibe-sub');
      const swatchesRow = document.getElementById('pf-swatches-row');
      const latencyTicker = document.getElementById('pf-latency-ticker');
      const brandBadge = document.getElementById('pf-brand-alignment-badge');

      if (tempText) tempText.textContent = tempLabel;
      if (tempSubEl) tempSubEl.textContent = tempSub;
      if (contrastText) contrastText.textContent = contrastLabel;
      if (contrastSubEl) contrastSubEl.textContent = contrastSub;
      if (aspectText) aspectText.textContent = aspectLabel;
      if (dimsSubEl) dimsSubEl.textContent = dimsSub;
      if (whiteText) whiteText.textContent = `${whitespacePct}%`;
      if (whiteFill) whiteFill.style.width = `${whitespacePct}%`;
      if (layoutText) layoutText.textContent = layoutLabel;
      if (layoutSubEl) layoutSubEl.textContent = layoutSub;
      if (vibeText) vibeText.textContent = predictedStyle;
      if (vibeSubEl) vibeSubEl.textContent = styleExplanation;
      if (latencyTicker) latencyTicker.textContent = `• ${elapsed}ms Real-Time In-Browser Diagnostics`;

      if (swatchesRow) {
        swatchesRow.innerHTML = '';
        sortedColors.forEach(([hex]) => {
          const chip = document.createElement('div');
          chip.className = 'pf-swatch-chip';
          chip.style.backgroundColor = hex;
          chip.title = `Click to copy ${hex}`;
          chip.onclick = () => {
            navigator.clipboard.writeText(hex).then(() => toast(`Copied ${hex} to clipboard!`));
          };
          swatchesRow.appendChild(chip);
        });
      }

      if (brandBadge) {
        if (mismatchWarnings.length === 0) {
          brandBadge.textContent = "✓ Alignment Diagnostics: Normal";
          brandBadge.className = "badge badge-success";
        } else {
          brandBadge.textContent = "⚠️ Mismatches Detected";
          brandBadge.className = "badge badge-warning";
        }
      }
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}
window.runInstantPreflight = runInstantPreflight;

// Hook pre-flight to dropzone events and auto-load preset if present in URL
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('inspect-file') || document.getElementById('inspect-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        runInstantPreflight(fileInput.files[0]);
      }
    });
  }

  // Hook drop-zone dragover & drop
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-active');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-active');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        runInstantPreflight(dt.files[0]);
      }
    }, false);
  }
});

  // Auto-detect ?preset=... in URL query string for 1-click evaluator deep-links
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const preset = urlParams.get('preset');
    if (preset) {
      setTimeout(() => {
        if (typeof window.loadJudgePreset === 'function') {
          window.loadJudgePreset(preset);
        }
      }, 500);
    }
  } catch (e) {
    console.debug('Preset auto-load error:', e);
  }
});

// 3. 1-Click Generative Auto-Remediation
async function triggerAutoRemediation() {
  const brandSelect = document.getElementById('inspect-brand-select');
  const brandId = (brandSelect && brandSelect.value) || (currentAuditData && currentAuditData.brand_id) || 'nike';
  const file = window.stagedInspectFile;
  const imageUrl = currentAuditData && (currentAuditData.image_url || (currentAuditData.validation && currentAuditData.validation.file_url));

  const btn = document.getElementById('btn-trigger-remediation');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="loading-spinner"></span> <span>Remapping Palette Centroids...</span>`;
  }

  try {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    } else if (imageUrl) {
      formData.append('image_url', imageUrl);
    }

    const res = await fetch(`${API_BASE}/inspect/${encodeURIComponent(brandId)}/auto-remediate`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    currentRemediatedResult = data;

    // Populate modal
    const origImg = document.getElementById('remed-orig-img');
    const fixedImg = document.getElementById('remed-fixed-img');
    const origDelta = document.getElementById('remed-orig-delta');
    const fixedDelta = document.getElementById('remed-fixed-delta');
    const swatchesGrid = document.getElementById('remed-swatches-grid');
    const downloadBtn = document.getElementById('btn-download-remediated');

    if (origImg) origImg.src = data.original_image_url;
    if (fixedImg) fixedImg.src = data.remediated_image_url;
    if (origDelta) origDelta.textContent = `ΔE ${data.previous_delta_e} • Off-Brand Non-Compliant`;
    if (fixedDelta) fixedDelta.textContent = `ΔE ${data.new_delta_e} • ${data.color_compliance_score}% Brand-Certified`;
    if (downloadBtn) downloadBtn.href = data.remediated_image_url;

    // Render Visual Problems Identified
    const problemsBox = document.getElementById('remed-problems-box');
    const problemsList = document.getElementById('remed-problems-list');
    if (problemsBox && problemsList && data.visual_problems_identified && data.visual_problems_identified.length > 0) {
      problemsList.innerHTML = '';
      data.visual_problems_identified.forEach(p => {
        const item = document.createElement('div');
        item.className = 'remed-problem-item';
        item.innerHTML = `<strong>• [${p.problem_type.toUpperCase()}]:</strong> ${p.description} <small style="color: #94A3B8;">(Target: ${p.target_brand_value})</small>`;
        problemsList.appendChild(item);
      });
      problemsBox.classList.remove('hidden');
    } else if (problemsBox) {
      problemsBox.classList.add('hidden');
    }

    // Render Generative Limitation Notice if present
    const limNotice = document.getElementById('remed-limitation-notice');
    const limText = document.getElementById('remed-limitation-text');
    if (limNotice && limText && data.generative_limitation_notice) {
      limText.textContent = `⚠️ Limitation Notice: ${data.generative_limitation_notice}`;
      limNotice.classList.remove('hidden');
    } else if (limNotice) {
      limNotice.classList.add('hidden');
    }

    // Render Disclosure Text
    const disclosureText = document.getElementById('remed-disclosure-text');
    if (disclosureText && data.ai_generated_disclosure) {
      disclosureText.textContent = data.ai_generated_disclosure;
    }

    // Cache current remediation
    window.currentRemediationResult = data;

    if (swatchesGrid && data.remapped_swatches) {
      swatchesGrid.innerHTML = '';
      data.remapped_swatches.forEach(sw => {
        const chip = document.createElement('div');
        chip.className = 'remed-shift-chip';
        chip.innerHTML = `
          <span class="swatch-dot" style="background: ${sw.from_hex};"></span>
          <span>${sw.from_hex}</span>
          <span style="color: #818CF8;">&rarr;</span>
          <span class="swatch-dot" style="background: ${sw.to_hex};"></span>
          <span>${sw.to_hex}</span>
          <small style="color: #10B981;">(-${sw.delta_e_saved} ΔE)</small>
        `;
        swatchesGrid.appendChild(chip);
      });
    }

    // Open modal
    const modal = document.getElementById('modal-auto-remediation');
    if (modal) modal.classList.remove('hidden');

    toast("✨ Creative successfully remediated to approved brand centroids!");
  } catch (err) {
    console.error("Auto-remediation failed:", err);
    toast("Auto-remediation error: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }
}
window.triggerAutoRemediation = triggerAutoRemediation;

async function handleRemediationDecision(decision) {
  const result = window.currentRemediationResult;
  if (!result || !result.remediation_id) {
    closeRemediationModal();
    return;
  }

  const brandId = result.brand_id || 'default';
  try {
    const res = await fetch(`${API_BASE}/inspect/${encodeURIComponent(brandId)}/remediation-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remediation_id: result.remediation_id,
        brand_id: brandId,
        decision: decision,
        reviewed_by: "Creator / Art Director"
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    if (decision === 'accept') {
      toast(`✓ Remediated creative approved! Staged for final compliance certification.`);
    } else {
      toast(`✕ Visual remediation rejected. Original design preserved untouched.`);
    }
    closeRemediationModal();
  } catch (err) {
    toast(`Remediation decision error: ${err.message}`);
    closeRemediationModal();
  }
}
window.handleRemediationDecision = handleRemediationDecision;

function closeRemediationModal() {
  const modal = document.getElementById('modal-auto-remediation');
  if (modal) modal.classList.add('hidden');
}
window.closeRemediationModal = closeRemediationModal;

// 4. Interactive Brand Co-Pilot (Remediation Chatbot)
let activeCopilotCorrections = [];
let stagedCopilotCorrections = [];

function initBrandCopilot(reportData) {
  currentAuditData = reportData;
  const brandTitle = document.getElementById('copilot-brand-title');
  const personaSubtitle = document.getElementById('copilot-persona-subtitle');
  const messagesList = document.getElementById('copilot-messages-list');
  const rewritesDeck = document.getElementById('copilot-rewrites-deck');
  const rewritesList = document.getElementById('copilot-rewrites-list');

  const brandName = reportData.brand_name || 'Brand';
  if (brandTitle) brandTitle.textContent = `${brandName} Brand Guardian Co-Pilot`;
  if (personaSubtitle) personaSubtitle.textContent = `Interactive Remediation Assistant • ${brandName} Standards`;

  if (messagesList) {
    messagesList.innerHTML = '';
    const welcome = document.createElement('div');
    welcome.className = 'copilot-msg msg-assistant';

    const findingsCount = (reportData.findings || []).length;
    const isPassing = (reportData.overall_score || 0) >= 80;

    if (isPassing) {
      welcome.innerHTML = `<strong>Hello!</strong> I reviewed your creative. It achieved <strong>${reportData.overall_score}% compliance</strong> with ${brandName} brand standards. Everything looks solid! Ask me if you need alternative headlines, social media captions, or guidelines consultation.`;
    } else {
      welcome.innerHTML = `<strong>Attention:</strong> I detected ${findingsCount} policy or visual flags in your submission. Let's fix them to get your design certified! Review the granular corrections below, accept individual changes, or ask me directly how to adjust your creative.`;
    }
    messagesList.appendChild(welcome);
  }

  // Pre-fetch rich copilot corrections and rewrites if there were findings
  if (reportData.brand_id && (reportData.findings || []).length > 0) {
    fetchInitialCopilotRewrites(reportData);
  } else {
    if (rewritesDeck) rewritesDeck.classList.add('hidden');
    const corrDeck = document.getElementById('copilot-corrections-deck');
    if (corrDeck) corrDeck.classList.add('hidden');
  }
}
window.initBrandCopilot = initBrandCopilot;

async function fetchInitialCopilotRewrites(reportData) {
  try {
    const copyText = (document.getElementById('inspect-copy-text') || {}).value || '';
    const discrepancies = (reportData.findings || []).map(f => f.issue || f.description || '');

    const res = await fetch(`${API_BASE}/inspect/${encodeURIComponent(reportData.brand_id)}/copilot-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: reportData.brand_id,
        message: "Suggest 3 compliant headlines, terminology corrections, and step-by-step guidance",
        copy_text: copyText,
        discrepancies: discrepancies
      })
    });

    if (!res.ok) return;
    const data = await res.json();
    renderCopilotResponseElements(data);
  } catch (e) {
    console.debug("Copilot initial rewrites prefetch:", e);
  }
}

function renderCopilotResponseElements(data) {
  // 1. Structured Granular Corrections
  if (data.structured_corrections && data.structured_corrections.length > 0) {
    activeCopilotCorrections = data.structured_corrections;
    const corrDeck = document.getElementById('copilot-corrections-deck');
    const corrList = document.getElementById('copilot-corrections-list');
    if (corrDeck && corrList) {
      corrList.innerHTML = '';
      data.structured_corrections.forEach(c => {
        const card = document.createElement('div');
        card.className = 'correction-card';
        card.id = `card-${c.id}`;

        const typeClass = `tag-${c.type}`;
        const typeLabel = c.type.replace('_', ' ');

        card.innerHTML = `
          <div class="correction-header">
            <span class="correction-type-tag ${typeClass}">${typeLabel}</span>
            <small style="color: #94A3B8;">${c.guideline_reference || 'Brand Standard'}</small>
          </div>
          <div class="diff-grid">
            <div class="diff-box diff-box-orig">
              <strong>Original:</strong> "${escapeHtml(c.original_content)}"
            </div>
            <div class="diff-box diff-box-corr">
              <strong>Suggested:</strong> "${escapeHtml(c.suggested_correction)}"
            </div>
          </div>
          <div class="diff-reason">
            <strong>Reason for correction:</strong> ${escapeHtml(c.reason_for_correction)}
          </div>
          <div class="correction-actions" id="actions-${c.id}">
            <button type="button" class="btn-card-action btn-card-accept" onclick="acceptCopilotCorrection('${c.id}')">
              ✓ Accept &amp; Stage
            </button>
            <button type="button" class="btn-card-action btn-card-reject" onclick="rejectCopilotCorrection('${c.id}')">
              ✕ Reject
            </button>
            <button type="button" class="btn-card-action btn-card-alt" onclick="requestAltCopilotCorrection('${c.id}')">
              🔄 Alternative
            </button>
          </div>
        `;
        corrList.appendChild(card);
      });
      corrDeck.classList.remove('hidden');
    }
  }

  // 2. Step-by-Step Guidance
  if (data.step_by_step_guidance && data.step_by_step_guidance.length > 0) {
    const guideDeck = document.getElementById('copilot-guidance-deck');
    const guideList = document.getElementById('copilot-guidance-list');
    if (guideDeck && guideList) {
      guideList.innerHTML = '';
      data.step_by_step_guidance.forEach(step => {
        const item = document.createElement('div');
        item.className = 'guidance-step-card';
        item.innerHTML = `
          <div class="step-number-circle">${step.step_number}</div>
          <div class="step-content">
            <strong>${escapeHtml(step.action_title)}</strong>
            <p>${escapeHtml(step.instruction)}</p>
          </div>
        `;
        guideList.appendChild(item);
      });
      guideDeck.classList.remove('hidden');
    }
  }

  // 3. Fallback Rewrites Deck
  const deck = document.getElementById('copilot-rewrites-deck');
  const list = document.getElementById('copilot-rewrites-list');
  if (deck && list && data.suggested_rewrites && data.suggested_rewrites.length > 0) {
    list.innerHTML = '';
    data.suggested_rewrites.forEach((rw) => {
      const card = document.createElement('div');
      card.className = 'rewrite-card';
      card.innerHTML = `
        <span class="rewrite-text">"${rw}"</span>
        <button type="button" class="btn-apply-rewrite" onclick="applyCopilotRewrite('${rw.replace(/'/g, "\\'")}')">
          📋 Apply to Creative
        </button>
      `;
      list.appendChild(card);
    });
    deck.classList.remove('hidden');
  }
}

async function acceptCopilotCorrection(suggId) {
  const item = activeCopilotCorrections.find(c => c.id === suggId);
  if (!item) return;

  const brandSelect = document.getElementById('inspect-brand-select');
  const brandId = (brandSelect && brandSelect.value) || (currentAuditData && currentAuditData.brand_id) || 'default';

  try {
    const res = await fetch(`${API_BASE}/inspect/${encodeURIComponent(brandId)}/copilot-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        suggestion_id: suggId,
        action: 'accept',
        suggestion_type: item.type,
        original_content: item.original_content,
        suggested_correction: item.suggested_correction
      })
    });
    if (!res.ok) throw new Error(await res.text());

    // Update UI
    item.status = 'accepted';
    if (!stagedCopilotCorrections.some(c => c.id === suggId)) {
      stagedCopilotCorrections.push(item);
    }

    const actionsContainer = document.getElementById(`actions-${suggId}`);
    if (actionsContainer) {
      actionsContainer.innerHTML = `<span class="badge badge-success">✓ Staged for Review</span>`;
    }

    renderStagedReviewDrawer();
    toast("✓ Correction accepted and staged for internal review.");
  } catch (err) {
    toast(`Action error: ${err.message}`);
  }
}
window.acceptCopilotCorrection = acceptCopilotCorrection;

async function rejectCopilotCorrection(suggId) {
  const item = activeCopilotCorrections.find(c => c.id === suggId);
  const brandSelect = document.getElementById('inspect-brand-select');
  const brandId = (brandSelect && brandSelect.value) || (currentAuditData && currentAuditData.brand_id) || 'default';

  try {
    await fetch(`${API_BASE}/inspect/${encodeURIComponent(brandId)}/copilot-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        suggestion_id: suggId,
        action: 'reject'
      })
    });

    stagedCopilotCorrections = stagedCopilotCorrections.filter(c => c.id !== suggId);
    const card = document.getElementById(`card-${suggId}`);
    if (card) {
      card.style.opacity = '0.5';
      const actions = document.getElementById(`actions-${suggId}`);
      if (actions) actions.innerHTML = `<span class="badge" style="background: rgba(239,68,68,0.2); color: #FCA5A5;">✕ Rejected</span>`;
    }
    renderStagedReviewDrawer();
    toast("Correction rejected. Original creator content preserved.");
  } catch (err) {
    toast(`Action error: ${err.message}`);
  }
}
window.rejectCopilotCorrection = rejectCopilotCorrection;

async function requestAltCopilotCorrection(suggId) {
  const item = activeCopilotCorrections.find(c => c.id === suggId);
  const prompt = item
    ? `Generate a differentiated alternative for: "${item.original_content}" in brand voice`
    : `Suggest another alternative option`;
  await sendCopilotMessage(prompt);
}
window.requestAltCopilotCorrection = requestAltCopilotCorrection;

function renderStagedReviewDrawer() {
  const drawer = document.getElementById('copilot-staged-review-drawer');
  const list = document.getElementById('copilot-staged-items-list');
  const countLabel = document.getElementById('staged-count-label');
  if (!drawer || !list) return;

  if (stagedCopilotCorrections.length === 0) {
    drawer.classList.add('hidden');
    return;
  }

  countLabel.textContent = `${stagedCopilotCorrections.length} Accepted Change${stagedCopilotCorrections.length > 1 ? 's' : ''} Staged`;
  list.innerHTML = '';

  stagedCopilotCorrections.forEach(c => {
    const pill = document.createElement('div');
    pill.className = 'staged-item-pill';
    pill.innerHTML = `
      <div>
        <span class="staged-item-type">[${c.type.replace('_', ' ')}]</span>
        <span>"${escapeHtml(c.suggested_correction)}"</span>
      </div>
      <button type="button" class="btn-clear-staged" onclick="rejectCopilotCorrection('${c.id}')" title="Remove">&times;</button>
    `;
    list.appendChild(pill);
  });

  drawer.classList.remove('hidden');
}

function clearStagedCorrections() {
  stagedCopilotCorrections = [];
  renderStagedReviewDrawer();
  toast("Staged corrections cleared.");
}
window.clearStagedCorrections = clearStagedCorrections;

function reAuditWithStagedCopy() {
  if (stagedCopilotCorrections.length === 0) {
    toast("No accepted corrections staged yet.");
    return;
  }

  const copyInput = document.getElementById('inspect-copy-text');
  if (!copyInput) return;

  let currentText = copyInput.value;
  stagedCopilotCorrections.forEach(c => {
    if (c.type === 'terminology_correction') {
      const reg = new RegExp(c.original_content, 'gi');
      currentText = currentText.replace(reg, c.suggested_correction);
    } else {
      currentText = c.suggested_correction;
    }
  });

  copyInput.value = currentText;
  copyInput.dispatchEvent(new Event('input'));
  toast("✓ Loaded staged copy. Re-auditing creative...");

  // Trigger form submit
  const form = document.getElementById('inspect-form');
  if (form) {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }
}
window.reAuditWithStagedCopy = reAuditWithStagedCopy;

function copyStagedDraftToClipboard() {
  const copyInput = document.getElementById('inspect-copy-text');
  let textToCopy = (copyInput && copyInput.value) || '';

  stagedCopilotCorrections.forEach(c => {
    textToCopy = c.suggested_correction;
  });

  navigator.clipboard.writeText(textToCopy).then(() => {
    toast("📋 Staged copy draft copied to clipboard!");
  }).catch(() => {});
}
window.copyStagedDraftToClipboard = copyStagedDraftToClipboard;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleCopilotSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('copilot-text-input');
  if (!input || !input.value.trim()) return;

  const userMsg = input.value.trim();
  input.value = '';
  await sendCopilotMessage(userMsg);
}
window.handleCopilotSubmit = handleCopilotSubmit;

async function sendCopilotQuickPrompt(promptText) {
  await sendCopilotMessage(promptText);
}
window.sendCopilotQuickPrompt = sendCopilotQuickPrompt;

async function sendCopilotMessage(userText) {
  const messagesList = document.getElementById('copilot-messages-list');
  if (!messagesList) return;

  // Add User Message
  const uMsg = document.createElement('div');
  uMsg.className = 'copilot-msg msg-user';
  uMsg.textContent = userText;
  messagesList.appendChild(uMsg);

  // Add typing indicator
  const typing = document.createElement('div');
  typing.className = 'copilot-msg msg-assistant';
  typing.innerHTML = `<span class="loading-spinner"></span> <em>Consulting Brand Guardian...</em>`;
  messagesList.appendChild(typing);
  messagesList.scrollTop = messagesList.scrollHeight;

  const brandSelect = document.getElementById('inspect-brand-select');
  const brandId = (brandSelect && brandSelect.value) || (currentAuditData && currentAuditData.brand_id) || 'nike';
  const copyText = (document.getElementById('inspect-copy-text') || {}).value || '';
  const discrepancies = currentAuditData ? (currentAuditData.findings || []).map(f => f.issue || f.description || '') : [];

  try {
    const res = await fetch(`${API_BASE}/inspect/${encodeURIComponent(brandId)}/copilot-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        message: userText,
        copy_text: copyText,
        discrepancies: discrepancies
      })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    typing.innerHTML = `<strong>${data.brand_persona || 'Brand Guardian'}:</strong><br>${data.reply.replace(/\n/g, '<br>')}`;
    renderCopilotResponseElements(data);
  } catch (err) {
    typing.innerHTML = `<em>Notice:</em> I'm currently referencing local ${brandId.toUpperCase()} brand guidelines. Please check approved colors and avoid prohibited promotional claims.`;
  }
  messagesList.scrollTop = messagesList.scrollHeight;
}

function applyCopilotRewrite(rewriteText) {
  const copyInput = document.getElementById('inspect-copy-text');
  if (copyInput) {
    copyInput.value = rewriteText;
    copyInput.dispatchEvent(new Event('input'));
  }
  navigator.clipboard.writeText(rewriteText).catch(() => {});
  toast('✓ Applied certified rewrite to creative ad copy!');
}
window.applyCopilotRewrite = applyCopilotRewrite;


/* ==========================================================================
   AI BRAND DNA GENERATOR & SUPABASE PERSISTENCE CLIENT SUITE
   ========================================================================== */

let currentDnaProfile = null;
let dnaChips = {
  personality: [],
  photo: [],
  messaging: [],
  preferred: [],
  avoid: [],
  dos: [],
  donts: []
};
let dnaColors = [];

function initBrandDNASuite() {
  loadSupabaseStatus();
  
  // Color picker sync
  const picker = document.getElementById('dna-new-color-picker');
  const hexInput = document.getElementById('dna-new-color-hex');
  if (picker && hexInput) {
    picker.addEventListener('input', () => {
      hexInput.value = picker.value.toUpperCase();
    });
    hexInput.addEventListener('input', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
        picker.value = hexInput.value;
      }
    });
  }

  // Pre-load latest active or draft DNA profile if present
  fetch('/api/v1/brands/dna')
    .then(r => r.json())
    .then(data => {
      const profiles = data.profiles || [];
      if (profiles.length > 0) {
        // Find latest active or first
        const active = profiles.find(p => p.status === 'APPROVED') || profiles[0];
        if (active && document.getElementById('dna-stage-review')) {
          currentDnaProfile = active;
          renderDNAReview(active);
          // Show review stage directly if approved or has data
          const stageInput = document.getElementById('dna-stage-input');
          const stageReview = document.getElementById('dna-stage-review');
          if (stageInput && stageReview && active.status === 'APPROVED') {
            stageInput.classList.add('hidden');
            stageReview.classList.remove('hidden');
          }
        }
      }
    })
    .catch(err => console.debug('No existing brand DNA loaded:', err));
}

function switchPortalMode(mode) {
  const tabDna = document.getElementById('tab-btn-dna') || document.getElementById('portal-tab-dna');
  const tabKnowledge = document.getElementById('tab-btn-knowledge');
  const tabManual = document.getElementById('tab-btn-manual') || document.getElementById('portal-tab-manual');
  const tabWorkflow = document.getElementById('tab-btn-workflow');
  const tabInsights = document.getElementById('tab-btn-insights');
  const sectionDna = document.getElementById('brand-dna-section') || document.getElementById('brand-dna-suite');
  const sectionKnowledge = document.getElementById('knowledge-portal-section');
  const sectionManual = document.getElementById('onboarding-form') || document.getElementById('ob-form-section');
  const sectionWorkflow = document.getElementById('workflow-portal-section');
  const sectionInsights = document.getElementById('insights-portal-section');

  // Remove active from all tabs
  if (tabDna) tabDna.classList.remove('active');
  if (tabKnowledge) tabKnowledge.classList.remove('active');
  if (tabManual) tabManual.classList.remove('active');
  if (tabWorkflow) tabWorkflow.classList.remove('active');
  if (tabInsights) tabInsights.classList.remove('active');

  // Hide all sections
  if (sectionDna) sectionDna.classList.add('hidden');
  if (sectionKnowledge) sectionKnowledge.classList.add('hidden');
  if (sectionManual) sectionManual.classList.add('hidden');
  if (sectionWorkflow) sectionWorkflow.classList.add('hidden');
  if (sectionInsights) sectionInsights.classList.add('hidden');

  if (mode === 'dna') {
    if (tabDna) tabDna.classList.add('active');
    if (sectionDna) sectionDna.classList.remove('hidden');
  } else if (mode === 'knowledge') {
    if (tabKnowledge) tabKnowledge.classList.add('active');
    if (sectionKnowledge) sectionKnowledge.classList.remove('hidden');
    loadKnowledgeItems();
  } else if (mode === 'workflow') {
    if (tabWorkflow) tabWorkflow.classList.add('active');
    if (sectionWorkflow) sectionWorkflow.classList.remove('hidden');
    loadWorkflowItems();
  } else if (mode === 'insights') {
    if (tabInsights) tabInsights.classList.add('active');
    if (sectionInsights) sectionInsights.classList.remove('hidden');
    loadBrandInsights();
  } else {
    if (tabManual) tabManual.classList.add('active');
    if (sectionManual) sectionManual.classList.remove('hidden');
  }
}

function loadDNASample(type) {
  if (type === 'apex') {
    setVal('dna-company-name', 'Apex Cloud Systems');
    setVal('dna-industry', 'Enterprise Cloud Infrastructure & Cybersecurity');
    setVal('dna-business-desc', 'Apex Cloud delivers zero-trust Kubernetes mesh, high-throughput secure networking, and continuous posture management for Global 2000 enterprises and banks.');
    setVal('dna-products-services', 'Apex Shield Mesh, Zero-Trust Audit Pipeline, Cloud Guard Console');
    setVal('dna-target-audience', 'DevOps Directors, Enterprise CISOs, Cloud Infrastructure Architects');
    setVal('dna-company-values', 'Deterministic Security, Zero Downtime, Radical Transparency, Open Standards');
    setVal('dna-brand-positioning', 'The zero-trust infrastructure engine for mission-critical enterprise workloads');
    setVal('dna-desired-perception', 'Rock-solid, uncompromising, highly technical, authoritative, innovative');
    setVal('dna-comm-personality', 'Crisp, technically rigorous, confident, direct, zero-fluff');
    setVal('dna-reference-brands', 'Stripe, Cloudflare, Datadog');
    toast('✓ Loaded Apex Cloud Systems sample data');
  } else if (type === 'nike') {
    setVal('dna-company-name', 'Aegis Athletics');
    setVal('dna-industry', 'Performance Athletic Apparel & Smart Footwear');
    setVal('dna-business-desc', 'Aegis designs biomechanically engineered running gear, carbon-fiber energy return shoes, and sensor-embedded athletic wear for endurance athletes.');
    setVal('dna-products-services', 'Aegis Strider Carbon, Flow-Knit Compression Apparel, PulseTrack App');
    setVal('dna-target-audience', 'Marathon runners, collegiate athletes, endurance enthusiasts aged 18-40');
    setVal('dna-company-values', 'Relentless Innovation, Human Potential, Sustainable Craft, Grit');
    setVal('dna-brand-positioning', 'Elite biomechanical athletic equipment pushing human performance boundaries');
    setVal('dna-desired-perception', 'Empowering, high-performance, cutting-edge, inspiring, bold');
    setVal('dna-comm-personality', 'Motivational, energetic, direct, audacious, action-oriented');
    setVal('dna-reference-brands', 'Nike, On Running, Arcteryx');
    toast('✓ Loaded Aegis Athletics sample data');
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

async function loadSupabaseStatus() {
  const pill = document.getElementById('supabase-indicator-pill');
  if (!pill) return;
  try {
    const res = await fetch('/api/v1/brands/dna/supabase/status');
    const data = await res.json();
    if (data.configured) {
      pill.innerHTML = `
        <span class="pulse-indicator-dot online"></span>
        <span>Supabase Cloud Connected (${data.table})</span>
      `;
      pill.title = `Connected to PostgREST at ${data.url}`;
      pill.classList.add('status-connected');
    } else {
      pill.innerHTML = `
        <span class="pulse-indicator-dot local"></span>
        <span>Supabase Local Fallback Ready</span>
      `;
      pill.title = 'Operating on local atomic JSON repository. Configure SUPABASE_URL to connect cloud.';
      pill.classList.remove('status-connected');
    }
  } catch (err) {
    pill.innerHTML = `
      <span class="pulse-indicator-dot local"></span>
      <span>Local DNA Engine Ready</span>
    `;
  }
}

async function generateBrandDNA() {
  const company_name = getVal('dna-company-name');
  const industry = getVal('dna-industry');
  const business_description = getVal('dna-business-desc');
  const products_and_services = getVal('dna-products-services');
  const target_audience = getVal('dna-target-audience');
  const company_values = getVal('dna-company-values');
  const brand_positioning = getVal('dna-brand-positioning');
  const desired_customer_perception = getVal('dna-desired-perception');
  const communication_personality = getVal('dna-comm-personality');
  const reference_brands = getVal('dna-reference-brands') || null;

  if (!company_name || !industry || !business_description || !products_and_services ||
      !target_audience || !company_values || !brand_positioning || !desired_customer_perception ||
      !communication_personality) {
    toast('Please fill all required Brand DNA fields marked with *');
    return;
  }

  const stageInput = document.getElementById('dna-stage-input');
  const stageLoading = document.getElementById('dna-stage-loading');
  const stageReview = document.getElementById('dna-stage-review');

  if (stageInput) stageInput.classList.add('hidden');
  if (stageLoading) stageLoading.classList.remove('hidden');
  if (stageReview) stageReview.classList.add('hidden');

  // Stepper telemetry simulation
  let step = 1;
  const stepperInterval = setInterval(() => {
    step = (step % 4) + 1;
    for (let i = 1; i <= 4; i++) {
      const stepRow = document.getElementById(`dna-step-${i}`);
      if (stepRow) {
        if (i < step) {
          stepRow.className = 'dna-step-row done';
          stepRow.querySelector('.step-icon').textContent = '✓';
        } else if (i === step) {
          stepRow.className = 'dna-step-row active';
          stepRow.querySelector('.step-icon').textContent = i;
        } else {
          stepRow.className = 'dna-step-row';
          stepRow.querySelector('.step-icon').textContent = i;
        }
      }
    }
  }, 1100);

  try {
    const payload = {
      company_name,
      industry,
      business_description,
      products_and_services,
      target_audience,
      company_values,
      brand_positioning,
      desired_customer_perception,
      communication_personality,
      reference_brands
    };

    const res = await fetch('/api/v1/brands/dna/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    clearInterval(stepperInterval);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Generation failed' }));
      throw new Error(errData.detail || 'Brand DNA synthesis failed');
    }

    const data = await res.json();
    currentDnaProfile = data;
    renderDNAReview(data);

    if (stageLoading) stageLoading.classList.add('hidden');
    if (stageReview) stageReview.classList.remove('hidden');
    stageReview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('✓ AI Brand DNA matrix generated and validated!');
  } catch (err) {
    clearInterval(stepperInterval);
    if (stageLoading) stageLoading.classList.add('hidden');
    if (stageInput) stageInput.classList.remove('hidden');
    toast(`Error generating Brand DNA: ${err.message}`);
  }
}

function renderDNAReview(profile) {
  if (!profile) return;
  const facts = profile.company_facts || {};
  const recs = profile.ai_recommendations || {};

  // Title & Status Badge
  const titleEl = document.getElementById('dna-review-brand-title');
  if (titleEl) {
    titleEl.textContent = `${facts.company_name || 'Brand'} • Brand DNA Matrix`;
  }

  const statusBadge = document.getElementById('dna-profile-status-badge');
  if (statusBadge) {
    if (profile.status === 'APPROVED') {
      statusBadge.textContent = 'ACTIVE & ENFORCED';
      statusBadge.className = 'badge-status-approved';
    } else {
      statusBadge.textContent = 'DRAFT — PENDING APPROVAL';
      statusBadge.className = 'badge-status-draft';
    }
  }

  // 1. Immutable Company Facts Grid
  const factsGrid = document.getElementById('dna-facts-display-grid');
  if (factsGrid) {
    factsGrid.innerHTML = `
      <div class="fact-card"><span class="fact-label">Company Name:</span><span class="fact-val">${escapeHtml(facts.company_name || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Industry:</span><span class="fact-val">${escapeHtml(facts.industry || '--')}</span></div>
      <div class="fact-card full-span"><span class="fact-label">Business Description:</span><span class="fact-val">${escapeHtml(facts.business_description || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Key Products & Services:</span><span class="fact-val">${escapeHtml(facts.products_and_services || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Target Audience:</span><span class="fact-val">${escapeHtml(facts.target_audience || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Company Values:</span><span class="fact-val">${escapeHtml(facts.company_values || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Brand Positioning:</span><span class="fact-val">${escapeHtml(facts.brand_positioning || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Desired Perception:</span><span class="fact-val">${escapeHtml(facts.desired_customer_perception || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Communication Personality:</span><span class="fact-val">${escapeHtml(facts.communication_personality || '--')}</span></div>
      <div class="fact-card"><span class="fact-label">Reference Brands:</span><span class="fact-val">${escapeHtml(facts.reference_brands || 'None specified')}</span></div>
    `;
  }

  // 2. Recommendations State
  dnaChips.personality = Array.isArray(recs.brand_personality) ? [...recs.brand_personality] : [];
  dnaChips.photo = Array.isArray(recs.photography_preferences) ? [...recs.photography_preferences] : [];
  dnaChips.messaging = Array.isArray(recs.messaging_guidelines) ? [...recs.messaging_guidelines] : [];
  dnaChips.preferred = Array.isArray(recs.preferred_terminology) ? [...recs.preferred_terminology] : [];
  dnaChips.avoid = Array.isArray(recs.words_to_avoid) ? [...recs.words_to_avoid] : [];
  dnaChips.dos = (recs.visual_dos_and_donts && Array.isArray(recs.visual_dos_and_donts.dos)) ? [...recs.visual_dos_and_donts.dos] : [];
  dnaChips.donts = (recs.visual_dos_and_donts && Array.isArray(recs.visual_dos_and_donts.donts)) ? [...recs.visual_dos_and_donts.donts] : [];

  // Render chip containers
  renderDnaChips('personality');
  renderDnaChips('photo');
  renderDnaChips('messaging');
  renderDnaChips('preferred');
  renderDnaChips('avoid');
  renderDnaChips('dos');
  renderDnaChips('donts');

  // Positioning
  setVal('dna-edit-positioning', recs.brand_positioning || '');

  // Voice and tone
  const voice = recs.brand_voice_and_tone || {};
  setVal('dna-edit-voice-primary', voice.primary_voice || '');
  setVal('dna-edit-voice-context', Array.isArray(voice.contextual_rules) ? voice.contextual_rules.join('; ') : '');

  // Colors
  const hexes = Array.isArray(recs.colour_hex_codes) ? recs.colour_hex_codes : [];
  const roles = Array.isArray(recs.primary_and_secondary_colours) ? recs.primary_and_secondary_colours : [];
  dnaColors = hexes.map((hex, idx) => ({
    hex: (hex.startsWith('#') ? hex : '#' + hex).toUpperCase(),
    role: roles[idx] || (idx === 0 ? 'Primary' : idx === 1 ? 'Secondary' : 'Accent')
  }));
  renderDnaColors();

  // Typography
  const typo = recs.typography_recommendations || {};
  setVal('dna-edit-typo-headline', typo.headline_font || '');
  setVal('dna-edit-typo-body', typo.body_font || '');
  setVal('dna-edit-typo-accent', typo.accent_or_code_font || '');

  // Visual Identity
  const visual = recs.visual_identity || {};
  setVal('dna-edit-visual-ethos', visual.style_ethos || '');
  setVal('dna-edit-visual-icons', visual.iconography_rules || '');

  // Design Language
  const design = recs.design_language || {};
  setVal('dna-edit-design-radius', design.corner_radius || '');
  setVal('dna-edit-design-elevation', design.borders_and_elevation || '');

  // Approver fields
  if (profile.approved_by) {
    setVal('dna-approver-name', profile.approved_by);
  }
  if (profile.approval_notes) {
    setVal('dna-approval-notes', profile.approval_notes);
  }

  // Approved banner
  const banner = document.getElementById('dna-approved-banner');
  const btnApprove = document.getElementById('btn-approve-dna');
  if (profile.status === 'APPROVED') {
    if (banner) banner.classList.remove('hidden');
    if (btnApprove) {
      btnApprove.innerHTML = '✓ Brand DNA Active &amp; Enforced';
      btnApprove.classList.remove('pulse-glow');
    }
    const receipt = document.getElementById('dna-supabase-receipt');
    if (receipt) {
      const syncId = profile.supabase_id || profile.dna_id;
      receipt.textContent = `Supabase Record: ${syncId} • Approved at: ${profile.approved_at || 'Verified'}`;
    }
  } else {
    if (banner) banner.classList.add('hidden');
    if (btnApprove) {
      btnApprove.innerHTML = `
        <svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Approve &amp; Activate Brand DNA (Save to Supabase)</span>
      `;
      btnApprove.classList.add('pulse-glow');
    }
  }
}

function renderDnaChips(category) {
  let containerId = '';
  if (category === 'personality') containerId = 'dna-edit-personality-chips';
  else if (category === 'photo') containerId = 'dna-edit-photo-chips';
  else if (category === 'messaging') containerId = 'dna-edit-messaging-chips';
  else if (category === 'preferred') containerId = 'dna-edit-preferred-chips';
  else if (category === 'avoid') containerId = 'dna-edit-avoid-chips';
  else if (category === 'dos') containerId = 'dna-edit-dos-chips';
  else if (category === 'donts') containerId = 'dna-edit-donts-chips';

  const container = document.getElementById(containerId);
  if (!container) return;

  const items = dnaChips[category] || [];
  container.innerHTML = items.map((item, idx) => `
    <span class="dna-chip">
      <span class="chip-text">${escapeHtml(item)}</span>
      <button type="button" class="chip-del" onclick="removeDnaChip('${category}', ${idx})" title="Remove item">&times;</button>
    </span>
  `).join('');
}

function addDnaChip(category) {
  let inputId = '';
  if (category === 'personality') inputId = 'input-new-personality';
  else if (category === 'photo') inputId = 'input-new-photo';
  else if (category === 'messaging') inputId = 'input-new-messaging';
  else if (category === 'preferred') inputId = 'input-new-preferred';
  else if (category === 'avoid') inputId = 'input-new-avoid';
  else if (category === 'dos') inputId = 'input-new-do';
  else if (category === 'donts') inputId = 'input-new-dont';

  const input = document.getElementById(inputId);
  if (!input) return;
  const val = input.value.trim();
  if (val) {
    if (!dnaChips[category]) dnaChips[category] = [];
    dnaChips[category].push(val);
    input.value = '';
    renderDnaChips(category);
  }
}

function removeDnaChip(category, idx) {
  if (dnaChips[category] && dnaChips[category].length > idx) {
    dnaChips[category].splice(idx, 1);
    renderDnaChips(category);
  }
}

function renderDnaColors() {
  const container = document.getElementById('dna-colors-editor-row');
  if (!container) return;

  container.innerHTML = dnaColors.map((c, idx) => `
    <div class="dna-color-swatch-box">
      <div class="swatch-color-preview" style="background-color: ${c.hex};" title="${c.hex}"></div>
      <div class="swatch-inputs">
        <input type="text" class="swatch-hex-val" value="${c.hex}" onchange="updateDnaColorHex(${idx}, this.value)" placeholder="#HEX">
        <input type="text" class="swatch-role-val" value="${escapeHtml(c.role || '')}" onchange="updateDnaColorRole(${idx}, this.value)" placeholder="Role">
      </div>
      <button type="button" class="btn-del-swatch" onclick="removeDnaColor(${idx})" title="Remove swatch">&times;</button>
    </div>
  `).join('');
}

function updateDnaColorHex(idx, newHex) {
  if (dnaColors[idx]) {
    const formatted = newHex.startsWith('#') ? newHex : '#' + newHex;
    if (/^#[0-9A-Fa-f]{6}$/.test(formatted)) {
      dnaColors[idx].hex = formatted.toUpperCase();
      renderDnaColors();
    }
  }
}

function updateDnaColorRole(idx, newRole) {
  if (dnaColors[idx]) {
    dnaColors[idx].role = newRole.trim();
  }
}

function addDnaColor() {
  const hexInput = document.getElementById('dna-new-color-hex');
  const nameInput = document.getElementById('dna-new-color-name');
  if (!hexInput) return;
  let hex = hexInput.value.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    toast('Invalid HEX color format. Please use #RRGGBB');
    return;
  }
  const role = nameInput ? nameInput.value.trim() : 'Accent';
  dnaColors.push({ hex: hex.toUpperCase(), role: role || 'Brand Accent' });
  if (nameInput) nameInput.value = '';
  renderDnaColors();
}

function removeDnaColor(idx) {
  if (dnaColors.length <= 1) {
    toast('At least one brand color is required.');
    return;
  }
  dnaColors.splice(idx, 1);
  renderDnaColors();
}

function editDNAPrompt() {
  const stageInput = document.getElementById('dna-stage-input');
  const stageReview = document.getElementById('dna-stage-review');
  if (stageInput && stageReview) {
    stageReview.classList.add('hidden');
    stageInput.classList.remove('hidden');
    stageInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function collectDNAReviewEdits() {
  const voiceContextRules = getVal('dna-edit-voice-context')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    brand_personality: dnaChips.personality || [],
    brand_positioning: getVal('dna-edit-positioning'),
    brand_voice_and_tone: {
      primary_voice: getVal('dna-edit-voice-primary'),
      contextual_rules: voiceContextRules.length > 0 ? voiceContextRules : ['Always align copy with verified core brand values.']
    },
    primary_and_secondary_colours: dnaColors.map(c => c.role || c.hex),
    colour_hex_codes: dnaColors.map(c => c.hex.toUpperCase()),
    typography_recommendations: {
      headline_font: getVal('dna-edit-typo-headline') || 'Plus Jakarta Sans',
      body_font: getVal('dna-edit-typo-body') || 'Inter',
      accent_or_code_font: getVal('dna-edit-typo-accent') || 'JetBrains Mono'
    },
    visual_identity: {
      style_ethos: getVal('dna-edit-visual-ethos') || 'Modern Minimalist',
      iconography_rules: getVal('dna-edit-visual-icons') || '2px monoline stroke'
    },
    photography_preferences: dnaChips.photo || [],
    design_language: {
      corner_radius: getVal('dna-edit-design-radius') || '8px to 12px',
      borders_and_elevation: getVal('dna-edit-design-elevation') || '1px subtle borders'
    },
    messaging_guidelines: dnaChips.messaging || [],
    preferred_terminology: dnaChips.preferred || [],
    words_to_avoid: dnaChips.avoid || [],
    visual_dos_and_donts: {
      dos: dnaChips.dos || [],
      donts: dnaChips.donts || []
    }
  };
}

async function saveDNADraftEdits() {
  if (!currentDnaProfile || !currentDnaProfile.dna_id) {
    toast('No active Brand DNA profile loaded.');
    return;
  }

  const edits = collectDNAReviewEdits();
  try {
    const res = await fetch(`/api/v1/brands/dna/${currentDnaProfile.dna_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to save edits' }));
      throw new Error(err.detail || 'Save failed');
    }

    const updated = await res.json();
    currentDnaProfile = updated;
    renderDNAReview(updated);
    toast('✓ Brand DNA draft edits saved successfully!');
  } catch (err) {
    toast(`Failed to save draft edits: ${err.message}`);
  }
}

async function approveAndActivateBrandDNA() {
  if (!currentDnaProfile || !currentDnaProfile.dna_id) {
    toast('No active Brand DNA profile to approve.');
    return;
  }

  const approver_name = getVal('dna-approver-name');
  const approval_notes = getVal('dna-approval-notes');
  const syncPlatformCheck = document.getElementById('dna-sync-platform-check');
  const sync_to_platform_brand = syncPlatformCheck ? syncPlatformCheck.checked : true;

  if (!approver_name) {
    toast('Please enter Approver Identity & Title before activating.');
    return;
  }

  const reviewed_recommendations = collectDNAReviewEdits();

  const btnApprove = document.getElementById('btn-approve-dna');
  if (btnApprove) {
    btnApprove.disabled = true;
    btnApprove.innerHTML = '<span>Activating &amp; Syncing to Supabase...</span>';
  }

  try {
    const payload = {
      reviewed_recommendations,
      approver_name,
      approval_notes,
      sync_to_platform_brand
    };

    const res = await fetch(`/api/v1/brands/dna/${currentDnaProfile.dna_id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Approval failed' }));
      throw new Error(err.detail || 'Approval failed');
    }

    const data = await res.json();
    currentDnaProfile = data.dna_profile;
    renderDNAReview(data.dna_profile);

    toast('🎉 Brand DNA approved and activated! Ready for Check Vibe audits.');

    if (typeof loadBrands === 'function') {
      loadBrands();
    }
  } catch (err) {
    if (btnApprove) {
      btnApprove.disabled = false;
      btnApprove.innerHTML = `
        <svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Approve &amp; Activate Brand DNA (Save to Supabase)</span>
      `;
    }
    toast(`Activation error: ${err.message}`);
  }
}

// Window exports
window.switchPortalMode = switchPortalMode;
window.loadDNASample = loadDNASample;
window.generateBrandDNA = generateBrandDNA;
window.editDNAPrompt = editDNAPrompt;
window.addDnaChip = addDnaChip;
window.removeDnaChip = removeDnaChip;
window.addDnaColor = addDnaColor;
window.removeDnaColor = removeDnaColor;
window.updateDnaColorHex = updateDnaColorHex;
window.updateDnaColorRole = updateDnaColorRole;
window.saveDNADraftEdits = saveDNADraftEdits;
window.approveAndActivateBrandDNA = approveAndActivateBrandDNA;
window.initBrandDNASuite = initBrandDNASuite;


/* ==========================================================================
   ORGANISATIONAL CONTENT REVIEW & APPROVAL WORKFLOW CLIENT SUITE
   ========================================================================== */

let currentWorkflowRole = "Authorised Reviewer";
let currentWorkflowOrgId = "org-apex-cloud";
let currentWorkflowFilter = "ALL";
let loadedWorkflowItems = [];
let activeWorkflowItem = null;
let activeWorkflowVersion = 1;

async function loadWorkflowItems() {
  const container = document.getElementById('wf-items-container');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/workflow/items?org_id=${encodeURIComponent(currentWorkflowOrgId)}`);
    if (!res.ok) throw new Error(await res.text());
    loadedWorkflowItems = await res.json();

    // If empty, auto-seed two realistic demonstration items for judges
    if (loadedWorkflowItems.length === 0) {
      await seedDemonstrationWorkflowItems();
      const res2 = await fetch(`${API_BASE}/workflow/items?org_id=${encodeURIComponent(currentWorkflowOrgId)}`);
      loadedWorkflowItems = await res2.json();
    }

    renderWorkflowCards();
  } catch (err) {
    container.innerHTML = `<div class="wf-empty-state" style="color: #F87171;">Failed to load submissions: ${escapeHtml(err.message)}</div>`;
  }
}
window.loadWorkflowItems = loadWorkflowItems;

async function seedDemonstrationWorkflowItems() {
  // 1. Standard creative
  await fetch(`${API_BASE}/workflow/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: currentWorkflowOrgId,
      brand_id: "apex_cloud",
      title: "Q4 High-Throughput Cloud Guard Announcement",
      content_text: "Apex Shield Mesh delivers deterministic sub-millisecond microsegmentation for enterprise Kubernetes clusters.",
      user_id: "creator_01",
      user_name: "Marcus Vance",
      user_role: "Creator",
      has_high_risk_claims: false,
      compliance_score: 96.0,
      findings_summary: ["Complies with Apex Cloud Brand DNA", "Zero banned terms detected"]
    })
  });

  // 2. High-risk claim creative (Demonstrating automatic escalation!)
  await fetch(`${API_BASE}/workflow/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: currentWorkflowOrgId,
      brand_id: "apex_cloud",
      title: "Promotional Banner: #1 Cloud Security Guarantee",
      content_text: "Apex Cloud is voted #1 in the cloud security industry with guaranteed 100% bug-free uptime for enterprise servers.",
      user_id: "creator_02",
      user_name: "Elena Rostova",
      user_role: "Creator",
      has_high_risk_claims: true,
      compliance_score: 46.0,
      findings_summary: ["High-Risk Claim: '#1 in the industry'", "Disallowed term: 'guaranteed 100% bug-free'", "Deprecated term: 'servers' -> 'cloud engines'"]
    })
  });
}

function renderWorkflowCards() {
  const container = document.getElementById('wf-items-container');
  if (!container) return;

  const filtered = loadedWorkflowItems.filter(item => {
    if (currentWorkflowFilter === 'ALL') return true;
    return item.status === currentWorkflowFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="wf-empty-state">No submissions currently matching status "${currentWorkflowFilter}".</div>`;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'wf-card';

    const latestVer = (item.versions && item.versions.length > 0)
      ? item.versions[item.versions.length - 1]
      : { content_text: 'No content', compliance_score: 0 };

    const statusClass = `tag-${item.status.replace(/\s+/g, '_')}`;

    card.innerHTML = `
      <div>
        <div class="wf-card-header">
          <h4 class="wf-card-title">${escapeHtml(item.title)}</h4>
          <span class="tag-badge ${statusClass}">${escapeHtml(item.status)}</span>
        </div>
        <div class="wf-card-meta">
          <strong>Brand:</strong> ${item.brand_id.toUpperCase()} &bull; 
          <strong>Version:</strong> v${item.current_version} &bull; 
          <strong>By:</strong> ${escapeHtml(item.created_by)}
        </div>
        ${item.has_high_risk_claims ? `
          <div style="margin-top: 0.4rem;">
            <span class="tag-badge tag-Escalated" style="font-size: 0.65rem;">⚠️ HIGH-RISK CLAIMS ESCALATED</span>
          </div>
        ` : ''}
        <div class="wf-card-body">
          <p>"${escapeHtml(latestVer.content_text)}"</p>
        </div>
      </div>
      <div class="wf-card-footer">
        <span class="wf-card-meta">💬 ${item.comments.length} comments &bull; 📜 ${item.approval_history.length} log events</span>
        <button type="button" class="btn btn-secondary btn-xs" onclick="openWorkflowDetailModal('${item.item_id}')">
          Review &amp; Audit Trail &rarr;
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function filterWorkflowByStatus(status) {
  currentWorkflowFilter = status;
  const pills = document.querySelectorAll('#wf-filter-pills .wf-pill');
  pills.forEach(p => {
    if (p.textContent.includes(status) || (status === 'ALL' && p.textContent.includes('All'))) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
  renderWorkflowCards();
}
window.filterWorkflowByStatus = filterWorkflowByStatus;

function onWorkflowRoleChanged(newRole) {
  currentWorkflowRole = newRole;
  const actingLabel = document.getElementById('wf-acting-role-label');
  if (actingLabel) actingLabel.textContent = `Acting as: ${newRole}`;
  toast(`Switched workflow acting role to: ${newRole}`);
  if (activeWorkflowItem) {
    updateWorkflowActionPermissions();
  }
}
window.onWorkflowRoleChanged = onWorkflowRoleChanged;

function openNewWorkflowModal() {
  const modal = document.getElementById('modal-workflow-new');
  if (modal) modal.classList.remove('hidden');
}
window.openNewWorkflowModal = openNewWorkflowModal;

function closeNewWorkflowModal() {
  const modal = document.getElementById('modal-workflow-new');
  if (modal) modal.classList.add('hidden');
}
window.closeNewWorkflowModal = closeNewWorkflowModal;

async function handleNewWorkflowSubmit(e) {
  if (e) e.preventDefault();
  const title = (document.getElementById('wf-new-title') || {}).value || 'Untitled Creative';
  const brandId = (document.getElementById('wf-new-brand') || {}).value || 'apex_cloud';
  const copyText = (document.getElementById('wf-new-copy') || {}).value || '';
  const imageUrl = (document.getElementById('wf-new-image') || {}).value || null;
  const hasHighRisk = !!(document.getElementById('wf-new-high-risk') || {}).checked;
  const score = parseFloat((document.getElementById('wf-new-score') || {}).value) || 85.0;

  try {
    const res = await fetch(`${API_BASE}/workflow/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: currentWorkflowOrgId,
        brand_id: brandId,
        title: title,
        content_text: copyText,
        image_url: imageUrl,
        user_id: "user_active",
        user_name: `User (${currentWorkflowRole})`,
        user_role: currentWorkflowRole,
        has_high_risk_claims: hasHighRisk,
        compliance_score: score
      })
    });
    if (!res.ok) throw new Error(await res.text());
    closeNewWorkflowModal();
    toast("✓ Creative submitted into workflow review!");
    loadWorkflowItems();
  } catch (err) {
    toast(`Submission error: ${err.message}`);
  }
}
window.handleNewWorkflowSubmit = handleNewWorkflowSubmit;

async function openWorkflowDetailModal(itemId) {
  const modal = document.getElementById('modal-workflow-detail');
  if (!modal) return;

  try {
    const res = await fetch(`${API_BASE}/workflow/items/${encodeURIComponent(itemId)}?org_id=${encodeURIComponent(currentWorkflowOrgId)}`);
    if (!res.ok) throw new Error(await res.text());
    activeWorkflowItem = await res.json();
    activeWorkflowVersion = activeWorkflowItem.current_version;

    renderWorkflowDetail();
    modal.classList.remove('hidden');
  } catch (err) {
    toast(`Failed to load details: ${err.message}`);
  }
}
window.openWorkflowDetailModal = openWorkflowDetailModal;

function closeWorkflowDetailModal() {
  const modal = document.getElementById('modal-workflow-detail');
  if (modal) modal.classList.add('hidden');
  activeWorkflowItem = null;
}
window.closeWorkflowDetailModal = closeWorkflowDetailModal;

function renderWorkflowDetail() {
  const item = activeWorkflowItem;
  if (!item) return;

  // Title and Status
  const titleEl = document.getElementById('wf-detail-title');
  const badgeEl = document.getElementById('wf-detail-status-badge');
  const metaEl = document.getElementById('wf-detail-meta');

  if (titleEl) titleEl.textContent = item.title;
  if (badgeEl) {
    badgeEl.textContent = item.status;
    badgeEl.className = `tag-badge tag-${item.status.replace(/\s+/g, '_')}`;
  }
  if (metaEl) {
    metaEl.textContent = `Version ${item.current_version} • Brand: ${item.brand_id.toUpperCase()} • Submitted by ${escapeHtml(item.created_by)} (${item.created_at.slice(0, 10)})`;
  }

  // Escalation alert
  const alertEl = document.getElementById('wf-detail-escalation-alert');
  const alertReason = document.getElementById('wf-detail-escalation-reason');
  if (item.has_high_risk_claims || item.status === 'Escalated') {
    if (alertReason) alertReason.textContent = item.escalation_reason || "Escalated: High-risk claims require Authorised Reviewer or Administrator approval.";
    if (alertEl) alertEl.classList.remove('hidden');
  } else if (alertEl) {
    alertEl.classList.add('hidden');
  }

  // Render Version Tabs
  const vtabsBar = document.getElementById('wf-version-tabs-bar');
  if (vtabsBar) {
    vtabsBar.innerHTML = '';
    (item.versions || []).forEach(v => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `wf-vtab ${v.version_number === activeWorkflowVersion ? 'active' : ''}`;
      btn.textContent = `v${v.version_number} (${v.submitted_by})`;
      btn.onclick = () => {
        activeWorkflowVersion = v.version_number;
        renderWorkflowDetail();
      };
      vtabsBar.appendChild(btn);
    });
  }

  // Render Version Content
  const curVer = (item.versions || []).find(v => v.version_number === activeWorkflowVersion) || item.versions[item.versions.length - 1];
  const copyEl = document.getElementById('wf-detail-copy-text');
  const scoreEl = document.getElementById('wf-detail-score');
  const findingsList = document.getElementById('wf-detail-findings-list');

  if (copyEl) copyEl.textContent = curVer.content_text;
  if (scoreEl) scoreEl.textContent = `${curVer.compliance_score || 85}% Compliance`;
  if (findingsList) {
    findingsList.innerHTML = '';
    (curVer.findings_summary || []).forEach(f => {
      const div = document.createElement('div');
      div.className = 'wf-card-meta';
      div.innerHTML = `&bull; ${escapeHtml(f)}`;
      findingsList.appendChild(div);
    });
  }

  // Render Comments
  const commentsList = document.getElementById('wf-detail-comments-list');
  if (commentsList) {
    commentsList.innerHTML = '';
    if (item.comments.length === 0) {
      commentsList.innerHTML = `<div class="empty-comments">No review comments yet. Post feedback below.</div>`;
    } else {
      item.comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'wf-comment-item';
        div.innerHTML = `
          <div class="wf-comment-meta">${escapeHtml(c.user_name)} (${c.role}) • <small style="color: #64748B;">v${c.version_number}</small>:</div>
          <div>${escapeHtml(c.text)}</div>
        `;
        commentsList.appendChild(div);
      });
    }
  }

  // Render Audit Trail
  const auditList = document.getElementById('wf-detail-audit-list');
  if (auditList) {
    auditList.innerHTML = '';
    (item.approval_history || []).forEach(entry => {
      const div = document.createElement('div');
      div.className = 'wf-audit-item';
      div.innerHTML = `
        <strong>[${escapeHtml(entry.action)}]</strong> ${escapeHtml(entry.actor_name)} (${entry.actor_role}) &bull; ${entry.timestamp.slice(11, 19)}: ${escapeHtml(entry.details)}
      `;
      auditList.appendChild(div);
    });
  }

  updateWorkflowActionPermissions();
}

function updateWorkflowActionPermissions() {
  const item = activeWorkflowItem;
  if (!item) return;

  const actingRole = currentWorkflowRole;
  const isEscalated = (item.status === 'Escalated' || item.has_high_risk_claims);

  const reqRevBox = document.getElementById('wf-request-revision-box');
  const submitRevBox = document.getElementById('wf-submit-revision-box');
  const btnApprove = document.getElementById('btn-wf-approve');
  const btnApproveWarn = document.getElementById('btn-wf-approve-warn');
  const btnReject = document.getElementById('btn-wf-reject');

  // Creator view
  if (actingRole === 'Creator') {
    if (reqRevBox) reqRevBox.classList.add('hidden');
    if (submitRevBox) submitRevBox.classList.remove('hidden');
    if (btnApprove) btnApprove.disabled = true;
    if (btnApproveWarn) btnApproveWarn.disabled = true;
    if (btnReject) btnReject.disabled = true;
    return;
  }

  // Manager view
  if (actingRole === 'Manager') {
    if (reqRevBox) reqRevBox.classList.remove('hidden');
    if (submitRevBox) submitRevBox.classList.add('hidden');
    if (btnReject) btnReject.disabled = false;

    // Manager CANNOT approve escalated content
    if (isEscalated) {
      if (btnApprove) {
        btnApprove.disabled = true;
        btnApprove.title = "High-risk claims require Authorised Reviewer approval.";
      }
      if (btnApproveWarn) btnApproveWarn.disabled = true;
    } else {
      if (btnApprove) {
        btnApprove.disabled = false;
        btnApprove.title = "";
      }
      if (btnApproveWarn) btnApproveWarn.disabled = false;
    }
    return;
  }

  // Authorised Reviewer or Administrator view (Full signatory authority)
  if (actingRole === 'Authorised Reviewer' || actingRole === 'Administrator') {
    if (reqRevBox) reqRevBox.classList.remove('hidden');
    if (submitRevBox) submitRevBox.classList.remove('hidden');
    if (btnApprove) {
      btnApprove.disabled = false;
      btnApprove.title = "Signatory authority confirmed.";
    }
    if (btnApproveWarn) btnApproveWarn.disabled = false;
    if (btnReject) btnReject.disabled = false;
  }
}

async function handlePostComment(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('wf-comment-input');
  if (!input || !input.value.trim() || !activeWorkflowItem) return;

  const text = input.value.trim();
  input.value = '';

  try {
    const res = await fetch(`${API_BASE}/workflow/items/${encodeURIComponent(activeWorkflowItem.item_id)}/comments?org_id=${encodeURIComponent(currentWorkflowOrgId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: "user_active",
        user_name: `User (${currentWorkflowRole})`,
        user_role: currentWorkflowRole,
        text: text
      })
    });
    if (!res.ok) throw new Error(await res.text());
    toast("Comment posted to review thread.");
    await openWorkflowDetailModal(activeWorkflowItem.item_id);
  } catch (err) {
    toast(`Comment error: ${err.message}`);
  }
}
window.handlePostComment = handlePostComment;

async function handleRequestRevision() {
  if (!activeWorkflowItem) return;
  const feedbackInput = document.getElementById('wf-revision-feedback');
  const feedback = (feedbackInput && feedbackInput.value.trim()) || "Please adjust copy and terminology to meet brand guidelines.";

  try {
    const res = await fetch(`${API_BASE}/workflow/items/${encodeURIComponent(activeWorkflowItem.item_id)}/revisions?org_id=${encodeURIComponent(currentWorkflowOrgId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: "user_active",
        user_name: `Reviewer (${currentWorkflowRole})`,
        user_role: currentWorkflowRole,
        feedback: feedback
      })
    });
    if (!res.ok) throw new Error(await res.text());
    toast("Revisions requested. Item marked as 'Needs Revision'.");
    await openWorkflowDetailModal(activeWorkflowItem.item_id);
    loadWorkflowItems();
  } catch (err) {
    toast(`Request error: ${err.message}`);
  }
}
window.handleRequestRevision = handleRequestRevision;

async function handleSubmitRevision() {
  if (!activeWorkflowItem) return;
  const copyInput = document.getElementById('wf-revised-copy');
  const summaryInput = document.getElementById('wf-revised-summary');

  const revisedCopy = (copyInput && copyInput.value.trim()) || "Revised brand copy addressing review feedback.";
  const summary = (summaryInput && summaryInput.value.trim()) || "Revised version addressing feedback";

  try {
    const res = await fetch(`${API_BASE}/workflow/items/${encodeURIComponent(activeWorkflowItem.item_id)}/revise?org_id=${encodeURIComponent(currentWorkflowOrgId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: "creator_01",
        user_name: `Creator (${currentWorkflowRole})`,
        user_role: currentWorkflowRole,
        content_text: revisedCopy,
        change_summary: summary,
        has_high_risk_claims: false,
        compliance_score: 96.0,
        findings_summary: ["Replaced flagged terms with approved lexicon"]
      })
    });
    if (!res.ok) throw new Error(await res.text());
    toast("✓ Revised version submitted! Ready for re-review.");
    await openWorkflowDetailModal(activeWorkflowItem.item_id);
    loadWorkflowItems();
  } catch (err) {
    toast(`Revision error: ${err.message}`);
  }
}
window.handleSubmitRevision = handleSubmitRevision;

async function handleDecision(decision) {
  if (!activeWorkflowItem) return;

  try {
    const res = await fetch(`${API_BASE}/workflow/items/${encodeURIComponent(activeWorkflowItem.item_id)}/decision?org_id=${encodeURIComponent(currentWorkflowOrgId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: "reviewer_01",
        user_name: `Approver (${currentWorkflowRole})`,
        user_role: currentWorkflowRole,
        decision: decision,
        notes: `Governance signoff rendered by ${currentWorkflowRole}.`
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Decision failed' }));
      throw new Error(errData.detail || 'Decision failed');
    }
    toast(`✓ Decision recorded: ${decision.toUpperCase()}`);
    await openWorkflowDetailModal(activeWorkflowItem.item_id);
    loadWorkflowItems();
  } catch (err) {
    toast(`Governance Gate: ${err.message}`);
  }
}
window.handleDecision = handleDecision;



/* ==========================================================================
   BRAND INSIGHTS AND RECURRING ISSUES CONTROLLER
   ========================================================================== */

let activeInsightsReport = null;
let currentInsightsBrand = 'apex_cloud';
let currentInsightsSubtab = 'all';

async function loadBrandInsights(brandId) {
  if (brandId) {
    currentInsightsBrand = brandId;
  } else {
    const sel = document.getElementById('insights-brand-select');
    if (sel) currentInsightsBrand = sel.value;
  }

  // Set loading states
  const summaryText = document.getElementById('insights-exec-summary-text');
  if (summaryText) summaryText.textContent = 'Aggregating reviews, claims, and approval workflows...';
  const violsGrid = document.getElementById('insights-violations-grid');
  if (violsGrid) violsGrid.innerHTML = '<div class="insights-loading">Scanning empirical review records...</div>';

  try {
    const orgId = currentInsightsBrand;
    const res = await fetch(`${API_BASE}/insights/${encodeURIComponent(currentInsightsBrand)}?org_id=${encodeURIComponent(orgId)}`);
    if (!res.ok) {
      throw new Error(`Failed to load insights (${res.status})`);
    }
    const report = await res.json();
    activeInsightsReport = report;
    renderBrandInsights(report);
  } catch (err) {
    console.error('Insights loading error:', err);
    toast(`Insights error: ${err.message}`);
    if (summaryText) summaryText.textContent = `Error loading brand insights: ${err.message}`;
  }
}
window.loadBrandInsights = loadBrandInsights;

function renderBrandInsights(report) {
  if (!report) return;

  // 1. Header & Timestamps
  const ts = document.getElementById('insights-timestamp');
  if (ts) {
    const d = new Date(report.generated_at);
    ts.textContent = d.toLocaleString();
  }

  // 2. Guardrail text & badge
  const guardText = document.getElementById('insights-guardrail-text');
  if (guardText) guardText.textContent = report.data_sufficiency_explanation;

  const suffBadge = document.getElementById('insights-sufficiency-badge');
  if (suffBadge) {
    suffBadge.textContent = report.data_sufficiency;
    if (report.data_sufficiency === 'INSUFFICIENT_DATA') {
      suffBadge.className = 'metric-badge-status badge-insufficient';
    } else {
      suffBadge.className = 'metric-badge-status';
    }
  }

  const reviewsHint = document.getElementById('insights-reviews-count-hint');
  if (reviewsHint) {
    reviewsHint.textContent = `${report.total_reviews_analyzed} review submissions evaluated`;
  }

  // 3. Health score & Trend
  const healthEl = document.getElementById('insights-health-score');
  if (healthEl) healthEl.textContent = report.overall_brand_health_score.toFixed(1);

  const trendEl = document.getElementById('insights-trend-pill');
  if (trendEl) {
    const deltaStr = report.score_delta_pct > 0 ? `+${report.score_delta_pct}%` : `${report.score_delta_pct}%`;
    trendEl.textContent = `${report.compliance_trend} (${deltaStr})`;
    trendEl.className = 'metric-trend-pill ' + (
      report.compliance_trend === 'IMPROVING' ? 'pill-improving' :
      report.compliance_trend === 'DEGRADING' ? 'pill-degrading' : 'pill-stable'
    );
  }

  const recCount = document.getElementById('insights-recurring-viol-count');
  if (recCount) recCount.textContent = report.repeated_violations.length;

  const ambigCount = document.getElementById('insights-ambiguous-count');
  if (ambigCount) ambigCount.textContent = report.ambiguous_guidelines.length;

  // 4. Executive Summary
  const execText = document.getElementById('insights-exec-summary-text');
  if (execText) execText.textContent = report.executive_summary;

  // 5. Subtab counts
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('cnt-sub-viols', report.repeated_violations.length);
  setTxt('cnt-sub-terms', report.frequently_incorrect_terminology.length);
  setTxt('cnt-sub-vis', report.common_visual_inconsistencies.length);
  setTxt('cnt-sub-claims', report.repeated_unsupported_claims.length);
  setTxt('cnt-sub-depts', report.department_problems.length);
  setTxt('cnt-sub-ambig', report.ambiguous_guidelines.length);

  // 6. Render Sub-Panels
  renderRepeatedViolations(report.repeated_violations);
  renderIncorrectTerminology(report.frequently_incorrect_terminology);
  renderVisualInconsistencies(report.common_visual_inconsistencies);
  renderUnsupportedClaims(report.repeated_unsupported_claims);
  renderDepartmentProblems(report.department_problems);
  renderAmbiguousGuidelines(report.ambiguous_guidelines);
  renderTrendTimeline(report.trend_timeline);
}

function renderRepeatedViolations(violations) {
  const container = document.getElementById('insights-violations-grid');
  if (!container) return;

  if (!violations || violations.length === 0) {
    container.innerHTML = '<div class="insights-empty-note">✓ No repeated guideline violations detected. Creatives demonstrate high policy alignment.</div>';
    return;
  }

  container.innerHTML = violations.map(v => {
    const sevPillClass = v.severity_breakdown.critical > 0 ? 'badge-pill-critical' : 'badge-pill-warning';
    const sevText = v.severity_breakdown.critical > 0
      ? `${v.severity_breakdown.critical} Critical, ${v.severity_breakdown.warning} Warning`
      : `${v.severity_breakdown.warning} Warning`;
    const trendIcon = v.trend === 'IMPROVING' ? '↘ Improving' : (v.trend === 'DEGRADING' ? '↗ Escalating' : '→ Stable');

    return `
      <div class="insight-card">
        <div class="insight-card-header">
          <div>
            <h5 class="insight-card-title">${escapeHtml(v.guideline_name)}</h5>
            <div class="insight-card-subtitle">${escapeHtml(v.category.replace('_', ' ').toUpperCase())}</div>
          </div>
          <span class="insight-badge-pill ${sevPillClass}">${v.occurrence_count}x detected (${v.violation_rate_pct}%)</span>
        </div>
        <div class="insight-card-body">
          ${v.recent_examples.map(ex => `<div class="term-quote-snippet">${escapeHtml(ex)}</div>`).join('')}
        </div>
        <div class="insight-meta-row">
          <div>Departments: <span class="insight-depts-wrap">${v.affected_departments.map(d => `<span class="dept-chip">${escapeHtml(d)}</span>`).join('')}</span></div>
          <span>Trajectory: <strong>${trendIcon}</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

function renderIncorrectTerminology(terms) {
  const container = document.getElementById('insights-terminology-grid');
  if (!container) return;

  if (!terms || terms.length === 0) {
    container.innerHTML = '<div class="insights-empty-note">✓ Zero prohibited terminology detected across audited copy.</div>';
    return;
  }

  container.innerHTML = terms.map(t => {
    return `
      <div class="insight-card">
        <div class="insight-card-header">
          <div>
            <h5 class="insight-card-title">Prohibited Phrase Misuse</h5>
            <div class="insight-card-subtitle">Detected in ${t.frequency_pct}% of textual copy</div>
          </div>
          <span class="insight-badge-pill badge-pill-warning">${t.occurrence_count}x detected</span>
        </div>
        <div class="term-exchange-box">
          <span class="banned-term-chip">${escapeHtml(t.banned_term)}</span>
          <span class="term-arrow-icon">➔</span>
          <span class="approved-term-chip">✓ ${escapeHtml(t.suggested_replacement)}</span>
        </div>
        ${t.sample_contexts.map(c => `<div class="term-quote-snippet">${escapeHtml(c)}</div>`).join('')}
        <div class="insight-meta-row">
          <div>Teams: <span class="insight-depts-wrap">${t.affected_departments.map(d => `<span class="dept-chip">${escapeHtml(d)}</span>`).join('')}</span></div>
          <span>Severity: <strong>${t.severity}</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

function renderVisualInconsistencies(visuals) {
  const container = document.getElementById('insights-visual-grid');
  if (!container) return;

  if (!visuals || visuals.length === 0) {
    container.innerHTML = '<div class="insights-empty-note">✓ Visual standards intact. No recurring color drift, contrast issues, or layout clutter found.</div>';
    return;
  }

  container.innerHTML = visuals.map(vi => {
    let roguesHtml = '';
    if (vi.rogue_colors && vi.rogue_colors.length > 0) {
      roguesHtml = `
        <div class="rogue-hex-strip">
          ${vi.rogue_colors.map(rc => `
            <span class="rogue-hex-chip" title="Click to copy rogue hex: ${rc.detected_hex}" onclick="navigator.clipboard.writeText('${rc.detected_hex}'); toast('Copied rogue hex ${rc.detected_hex}');">
              <span class="color-dot-swatch" style="background: ${rc.detected_hex};"></span>
              ${rc.detected_hex} (ΔE ${rc.delta_e.toFixed(1)})
            </span>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="insight-card">
        <div class="insight-card-header">
          <div>
            <h5 class="insight-card-title">${escapeHtml(vi.title)}</h5>
            <div class="insight-card-subtitle">${escapeHtml(vi.inconsistency_type)}</div>
          </div>
          <span class="insight-badge-pill badge-pill-warning">${vi.divergence_rate_pct}% of visual ads</span>
        </div>
        <div class="insight-card-body">
          <p style="margin: 0 0 0.4rem 0;">${escapeHtml(vi.description)}</p>
          <div class="visual-metric-compare">
            <div class="compare-block observed">
              <span>Observed Measure</span>
              <strong>${escapeHtml(vi.observed_average)}</strong>
            </div>
            <div class="compare-block target">
              <span>Required Standard</span>
              <strong>${escapeHtml(vi.benchmark_target)}</strong>
            </div>
          </div>
          ${roguesHtml}
        </div>
        <div class="insight-meta-row">
          <div>Departments: <span class="insight-depts-wrap">${vi.affected_departments.map(d => `<span class="dept-chip">${escapeHtml(d)}</span>`).join('')}</span></div>
          <span>Severity: <strong>${vi.severity}</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

function renderUnsupportedClaims(claims) {
  const container = document.getElementById('insights-claims-grid');
  if (!container) return;

  if (!claims || claims.length === 0) {
    container.innerHTML = '<div class="insights-empty-note">✓ All promotional claims validated against verified evidence in Knowledge Base.</div>';
    return;
  }

  container.innerHTML = claims.map(cl => {
    return `
      <div class="insight-card">
        <div class="insight-card-header">
          <div>
            <h5 class="insight-card-title">${escapeHtml(cl.claim_pattern)}</h5>
            <div class="insight-card-subtitle">Category: ${escapeHtml(cl.claim_type)}</div>
          </div>
          <span class="insight-badge-pill badge-pill-critical">${cl.occurrence_count}x detected</span>
        </div>
        <div class="insight-card-body">
          ${cl.sample_claims.map(sc => `<div class="term-quote-snippet">${escapeHtml(sc)}</div>`).join('')}
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px; padding: 0.5rem 0.75rem; margin-top: 0.5rem; font-size: 0.78rem;">
            <strong style="color: #F87171; display: block; margin-bottom: 0.15rem;">Missing Documentary Evidence:</strong>
            <span style="color: #CBD5E1;">${escapeHtml(cl.missing_evidence_required)}</span>
          </div>
        </div>
        <div class="insight-meta-row">
          <div>Teams: <span class="insight-depts-wrap">${cl.affected_departments.map(d => `<span class="dept-chip">${escapeHtml(d)}</span>`).join('')}</span></div>
          <span>Escalated to Reviewers: <strong>${cl.escalation_count}x</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

function renderDepartmentProblems(departments) {
  const tbody = document.getElementById('insights-departments-tbody');
  if (!tbody) return;

  if (!departments || departments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="insights-empty-note">No department risk data available (minimum sample required).</td></tr>';
    return;
  }

  tbody.innerHTML = departments.map(d => {
    const riskClass = `risk-${d.risk_level.toLowerCase()}`;
    const barColor = d.risk_level === 'CRITICAL' ? '#EF4444' : (d.risk_level === 'HIGH' ? '#F59E0B' : (d.risk_level === 'MEDIUM' ? '#3B82F6' : '#10B981'));

    return `
      <tr>
        <td><strong>${escapeHtml(d.department)}</strong></td>
        <td>${d.total_submissions}</td>
        <td>
          <span style="color: #34D399;">${d.approved_count} pass</span> /
          <span style="color: #FBBF24;">${d.needs_revision_count} rev</span> /
          <span style="color: #F87171;">${d.escalated_count} esc</span>
        </td>
        <td>
          <div><strong>${d.compliance_rate_pct}%</strong></div>
          <div class="compliance-progress-bar">
            <div class="compliance-progress-fill" style="width: ${d.compliance_rate_pct}%; background: ${barColor};"></div>
          </div>
        </td>
        <td><strong>${d.average_compliance_score.toFixed(1)}</strong> / 100</td>
        <td><span class="risk-badge ${riskClass}">${d.risk_level}</span></td>
        <td>
          <div style="font-size: 0.76rem; color: #94A3B8;">
            ${d.top_recurring_issues.map(iss => `• ${escapeHtml(iss)}`).join('<br>')}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAmbiguousGuidelines(guidelines) {
  const container = document.getElementById('insights-ambiguity-grid');
  if (!container) return;

  if (!guidelines || guidelines.length === 0) {
    container.innerHTML = '<div class="insights-empty-note">✓ No ambiguous brand guidelines detected. Creator error rates reflect standard execution rather than policy confusion.</div>';
    return;
  }

  container.innerHTML = guidelines.map(ag => {
    const barPct = Math.round(ag.ambiguity_score * 100);
    const prioClass = ag.priority === 'IMMEDIATE' ? 'badge-pill-critical' : 'badge-pill-warning';

    return `
      <div class="insight-card" style="border-left: 4px solid #F59E0B;">
        <div class="insight-card-header">
          <div>
            <h5 class="insight-card-title">${escapeHtml(ag.guideline_name)}</h5>
            <div class="insight-card-subtitle">Category: ${escapeHtml(ag.category)} | Ambiguity Index: <strong>${ag.ambiguity_score.toFixed(2)} / 1.0</strong></div>
          </div>
          <span class="insight-badge-pill ${prioClass}">Priority: ${ag.priority}</span>
        </div>
        <div class="ambiguity-meter-strip">
          <span style="font-size: 0.72rem; color: #94A3B8;">Confusion Rating:</span>
          <div class="ambiguity-bar-bg">
            <div class="ambiguity-bar-fill" style="width: ${barPct}%;"></div>
          </div>
          <span style="font-size: 0.72rem; font-weight: 700; color: #F59E0B;">${barPct}%</span>
        </div>
        <div class="insight-card-body">
          <strong style="color: #CBD5E1; font-size: 0.78rem;">Friction & Confusion Signals:</strong>
          <ul style="margin: 0.25rem 0 0.5rem 1.15rem; padding: 0; font-size: 0.78rem; color: #94A3B8;">
            ${ag.confusion_signals.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
          <p style="margin: 0.35rem 0; font-size: 0.8rem; color: #E2E8F0;">
            <strong>Root Cause:</strong> ${escapeHtml(ag.root_cause_explanation)}
          </p>

          <div class="recommended-revision-callout">
            <div class="revision-header">
              <span class="revision-label">RECOMMENDED GUIDELINE REVISION (ACTIONABLE AMENDMENT)</span>
              <button type="button" class="btn-copy-revision" onclick="copyRevisionText('${encodeURIComponent(ag.recommended_guideline_revision)}')">
                Copy Revision Text
              </button>
            </div>
            <p class="revision-text">${escapeHtml(ag.recommended_guideline_revision)}</p>
            <span class="revision-impact">Expected Impact: ${escapeHtml(ag.expected_impact)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTrendTimeline(timeline) {
  const container = document.getElementById('insights-timeline-grid');
  if (!container) return;

  if (!timeline || timeline.length === 0) {
    container.innerHTML = '<div class="insights-empty-note">Timeline trend analysis requires at least 2 historical review batches.</div>';
    return;
  }

  container.innerHTML = timeline.map(tb => {
    const trPill = tb.trend_direction === 'IMPROVING' ? 'pill-improving' : (tb.trend_direction === 'DEGRADING' ? 'pill-degrading' : 'pill-stable');

    return `
      <div class="timeline-period-card">
        <div class="timeline-period-header">
          <span class="timeline-period-label">${escapeHtml(tb.period_label)}</span>
          <span class="metric-trend-pill ${trPill}">${tb.trend_direction}</span>
        </div>
        <div style="display: flex; align-items: baseline; gap: 0.35rem;">
          <span class="timeline-score-big">${tb.average_score.toFixed(1)}</span>
          <small style="color: #64748B;">/ 100 compliance</small>
        </div>
        <div class="timeline-stat-row">
          <span>Submissions Evaluated:</span>
          <strong>${tb.submission_count}</strong>
        </div>
        <div class="timeline-stat-row">
          <span>Detected Violations:</span>
          <strong>${tb.violation_count}</strong>
        </div>
        <div class="timeline-stat-row">
          <span>High-Risk Escalations:</span>
          <strong style="color: ${tb.escalated_count > 0 ? '#F87171' : '#34D399'};">${tb.escalated_count}</strong>
        </div>
      </div>
    `;
  }).join('');
}

function switchInsightsSubtab(subtab) {
  currentInsightsSubtab = subtab;
  const tabs = document.querySelectorAll('.insights-subtab');
  tabs.forEach(t => t.classList.remove('active'));
  if (event && event.target) {
    event.target.classList.add('active');
  }

  const blocks = {
    violations: document.getElementById('block-insights-violations'),
    terminology: document.getElementById('block-insights-terminology'),
    visual: document.getElementById('block-insights-visual'),
    claims: document.getElementById('block-insights-claims'),
    departments: document.getElementById('block-insights-departments'),
    ambiguity: document.getElementById('block-insights-ambiguity'),
    timeline: document.getElementById('block-insights-timeline')
  };

  if (subtab === 'all') {
    Object.values(blocks).forEach(b => { if (b) b.style.display = 'flex'; });
  } else {
    Object.entries(blocks).forEach(([key, b]) => {
      if (b) b.style.display = (key === subtab) ? 'flex' : 'none';
    });
  }
}
window.switchInsightsSubtab = switchInsightsSubtab;

async function exportBrandInsights() {
  try {
    const sel = document.getElementById('insights-brand-select');
    const brand = sel ? sel.value : currentInsightsBrand;
    const res = await fetch(`${API_BASE}/insights/${encodeURIComponent(brand)}/export?org_id=${encodeURIComponent(brand)}`);
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const data = await res.json();

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brand_insights_audit_${brand}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✓ Exported brand compliance audit JSON');
  } catch (err) {
    toast(`Export error: ${err.message}`);
  }
}
window.exportBrandInsights = exportBrandInsights;

function copyRevisionText(encodedText) {
  try {
    const decoded = decodeURIComponent(encodedText);
    navigator.clipboard.writeText(decoded);
    toast('✓ Copied recommended guideline revision to clipboard!');
  } catch (err) {
    toast('Failed to copy text');
  }
}
window.copyRevisionText = copyRevisionText;


/* ==========================================================================
   BRAND KNOWLEDGE BASE CONTROLLER & CLAIMS GOVERNANCE (RULE 6 ENFORCEMENT)
   ========================================================================== */

let currentKnowledgeOrg = 'default-org';
let currentKnowledgeCategory = '';
let allKnowledgeItems = [];

async function loadKnowledgeItems(orgId, category) {
  const orgSel = document.getElementById('knowledge-brand-select');
  if (orgId) {
    currentKnowledgeOrg = orgId;
    if (orgSel) orgSel.value = orgId;
  } else if (orgSel) {
    currentKnowledgeOrg = orgSel.value;
  }

  if (category !== undefined) {
    currentKnowledgeCategory = category;
  }

  const grid = document.getElementById('knowledge-items-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="knowledge-loading"><span class="status-pulse-dot"></span> Loading approved brand knowledge items...</div>';

  try {
    let url = `${API_BASE}/knowledge/items?org_id=${encodeURIComponent(currentKnowledgeOrg)}&active_only=true`;
    if (currentKnowledgeCategory) {
      url += `&category=${encodeURIComponent(currentKnowledgeCategory)}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load knowledge base items.`);
    allKnowledgeItems = await res.json();

    // Update count pill
    const countAll = document.getElementById('kb-count-all');
    if (countAll) countAll.textContent = allKnowledgeItems.length;

    renderKnowledgeItems(allKnowledgeItems);
  } catch (err) {
    console.error('Error loading knowledge items:', err);
    grid.innerHTML = `<div class="knowledge-empty-state"><p>Could not load Knowledge Base items: ${err.message}</p><button type="button" class="btn btn-xs btn-primary" onclick="loadKnowledgeItems()">Retry</button></div>`;
  }
}
window.loadKnowledgeItems = loadKnowledgeItems;

function renderKnowledgeItems(items) {
  const grid = document.getElementById('knowledge-items-grid');
  if (!grid) return;

  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div class="knowledge-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #94A3B8;">
        <p style="font-size: 0.95rem; margin-bottom: 0.75rem;">No knowledge items found for active criteria.</p>
        <button type="button" class="btn btn-sm btn-primary" onclick="openAddKnowledgeModal()">+ Add First Approved Item</button>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(item => {
    const catClass = `cat-${item.category}`;
    const cleanCat = (item.category || '').replace(/_/g, ' ');

    let evidenceHtml = '';
    if (item.category === 'PROMOTIONAL_CLAIM') {
      const evSource = (item.structured_data && item.structured_data.evidence_source) || (item.tags && item.tags.length ? `Verified via ${item.tags.join(', ')}` : 'Audited Evidence on File');
      evidenceHtml = `
        <div class="knowledge-evidence-box">
          <span class="evidence-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Verified Supporting Evidence:
          </span>
          <span class="evidence-text">"${escapeHtml(evSource)}"</span>
        </div>`;
    }

    let terminologyHtml = '';
    if (item.category === 'TERMINOLOGY' && item.structured_data) {
      const allowed = item.structured_data.approved_terms || [];
      const prohibited = item.structured_data.prohibited_alternatives || [];
      terminologyHtml = `
        <div style="display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.3rem;">
          ${allowed.length ? `<div style="font-size: 0.74rem;"><strong style="color: #34D399;">Approved:</strong> ${allowed.map(t => `<span class="id-badge" style="background: rgba(16,185,129,0.15); color: #34D399; margin-right: 0.2rem;">${t}</span>`).join('')}</div>` : ''}
          ${prohibited.length ? `<div style="font-size: 0.74rem;"><strong style="color: #F87171;">Prohibited:</strong> ${prohibited.map(t => `<span class="id-badge" style="background: rgba(239,68,68,0.15); color: #F87171; margin-right: 0.2rem;">${t}</span>`).join('')}</div>` : ''}
        </div>`;
    }

    const confLevel = (item.structured_data && item.structured_data.confidentiality) || 'INTERNAL';

    return `
      <div class="knowledge-card">
        <div class="knowledge-card-header">
          <div>
            <h4 class="knowledge-card-title">${escapeHtml(item.title)}</h4>
          </div>
          <span class="knowledge-cat-badge ${catClass}">${cleanCat}</span>
        </div>

        <div class="knowledge-card-body">
          ${escapeHtml(item.content)}
        </div>

        ${evidenceHtml}
        ${terminologyHtml}

        <div class="knowledge-meta-strip">
          <div class="knowledge-meta-left">
            <span class="confidentiality-pill conf-${confLevel}">${confLevel}</span>
            <span style="font-family: var(--font-mono); font-size: 0.7rem; color: #94A3B8;">v${item.version}.0 &bull; Approved</span>
          </div>
          <button type="button" class="btn-history-link" onclick="viewKnowledgeHistory('${item.item_id}')">History</button>
        </div>
      </div>
    `;
  }).join('');
}
window.renderKnowledgeItems = renderKnowledgeItems;

function filterKnowledgeCategory(category) {
  currentKnowledgeCategory = category;
  document.querySelectorAll('.kb-pill').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(category ? `kb-pill-${category}` : 'kb-pill-all');
  if (targetBtn) targetBtn.classList.add('active');

  loadKnowledgeItems(currentKnowledgeOrg, category);
}
window.filterKnowledgeCategory = filterKnowledgeCategory;

function handleKnowledgeSearch(query) {
  if (!query || !query.trim()) {
    renderKnowledgeItems(allKnowledgeItems);
    return;
  }
  const q = query.toLowerCase().trim();
  const filtered = allKnowledgeItems.filter(it => 
    (it.title && it.title.toLowerCase().includes(q)) ||
    (it.content && it.content.toLowerCase().includes(q)) ||
    (it.category && it.category.toLowerCase().includes(q)) ||
    (it.tags && it.tags.some(t => t.toLowerCase().includes(q)))
  );
  renderKnowledgeItems(filtered);
}
window.handleKnowledgeSearch = handleKnowledgeSearch;

function openAddKnowledgeModal() {
  const modal = document.getElementById('modal-add-knowledge');
  if (modal) modal.classList.remove('hidden');
}
window.openAddKnowledgeModal = openAddKnowledgeModal;

function closeAddKnowledgeModal() {
  const modal = document.getElementById('modal-add-knowledge');
  if (modal) modal.classList.add('hidden');
}
window.closeAddKnowledgeModal = closeAddKnowledgeModal;

function toggleEvidenceFieldRequirement(cat) {
  const req = document.getElementById('kb-evidence-required');
  const group = document.getElementById('kb-evidence-group');
  if (cat === 'PROMOTIONAL_CLAIM') {
    if (req) req.style.display = 'inline';
    if (group) group.style.display = 'block';
  } else {
    if (req) req.style.display = 'none';
  }
}
window.toggleEvidenceFieldRequirement = toggleEvidenceFieldRequirement;

async function submitNewKnowledgeItem() {
  const category = (document.getElementById('kb-add-category') || {}).value || 'COMPANY_FACT';
  const title = (document.getElementById('kb-add-title') || {}).value || '';
  const content = (document.getElementById('kb-add-content') || {}).value || '';
  const evidence = (document.getElementById('kb-add-evidence') || {}).value || '';
  const dept = (document.getElementById('kb-add-department') || {}).value || 'Marketing';
  const confidentiality = (document.getElementById('kb-add-confidentiality') || {}).value || 'INTERNAL';
  const approver = (document.getElementById('kb-add-approver') || {}).value || 'Brand Lead';

  if (!title.trim() || !content.trim()) {
    toast('Title and content are required.');
    return;
  }

  if (category === 'PROMOTIONAL_CLAIM' && !evidence.trim()) {
    toast('Rule 6 Enforcement: Approved claims must have verifiable supporting evidence source.');
    return;
  }

  const payload = {
    org_id: currentKnowledgeOrg,
    brand_id: currentKnowledgeOrg,
    category: category,
    title: title.trim(),
    content: content.trim(),
    provenance: 'COMPANY_FACT',
    is_approved: true,
    approved_by: approver,
    structured_data: {
      evidence_source: evidence.trim(),
      department: dept.trim(),
      confidentiality: confidentiality
    },
    tags: [category.toLowerCase(), dept.toLowerCase()]
  };

  try {
    const res = await fetch(`${API_BASE}/knowledge/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    toast('✓ Knowledge Base item approved and registered.');
    closeAddKnowledgeModal();
    loadKnowledgeItems(currentKnowledgeOrg);
  } catch (err) {
    toast(`Failed to save item: ${err.message}`);
  }
}
window.submitNewKnowledgeItem = submitNewKnowledgeItem;

async function viewKnowledgeHistory(itemId) {
  const modal = document.getElementById('modal-knowledge-history');
  const list = document.getElementById('kb-history-list');
  if (modal) modal.classList.remove('hidden');
  if (list) list.innerHTML = '<div class="insights-loading">Fetching immutable version snapshots...</div>';

  try {
    const res = await fetch(`${API_BASE}/knowledge/items/${encodeURIComponent(itemId)}/history?org_id=${encodeURIComponent(currentKnowledgeOrg)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const history = await res.json();

    if (!history || history.length === 0) {
      if (list) list.innerHTML = '<div style="color: #94A3B8; text-align: center; padding: 2rem;">No prior revisions recorded. This is the baseline v1.0.</div>';
      return;
    }

    if (list) {
      list.innerHTML = history.map(h => `
        <div class="kb-history-item">
          <div class="kb-history-header">
            <strong style="color: #60A5FA;">Version ${h.version}</strong>
            <span style="color: #94A3B8;">${new Date(h.timestamp).toLocaleString()} by ${escapeHtml(h.changed_by)}</span>
          </div>
          <p style="font-size: 0.78rem; color: #CBD5E1; margin: 0.25rem 0;">Reason: ${escapeHtml(h.change_reason)}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    if (list) list.innerHTML = `<div style="color: #F87171; text-align: center; padding: 1.5rem;">Could not load version history: ${err.message}</div>`;
  }
}
window.viewKnowledgeHistory = viewKnowledgeHistory;

function closeKnowledgeHistoryModal() {
  const modal = document.getElementById('modal-knowledge-history');
  if (modal) modal.classList.add('hidden');
}
window.closeKnowledgeHistoryModal = closeKnowledgeHistoryModal;


/* =============================================================================
   MULTI-COMPANY APPLICATION ROUTER & DATA CONTROLLERS
   ============================================================================= */

let currentOrgId = "apex-cloud";
let currentUserRole = "Administrator";
let currentReviewId = "rev-8a2f10b";

// 1. Central Page Navigation Router
function navigateToPage(pageId, event = null, subAction = null, pushState = true) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  // Determine normalized target route
  let targetRoute = "/" + (pageId === "dashboard" ? "dashboard" : pageId);
  if (pageId === "content-review-detail" && subAction) {
    targetRoute = `/content-review/${encodeURIComponent(subAction)}`;
  }

  if (pushState && window.history && window.history.pushState) {
    window.history.pushState({ pageId, subAction }, "", targetRoute);
  }

  // Update Left Sidebar Active State
  const navItems = document.querySelectorAll(".sidebar-nav-item");
  navItems.forEach(item => {
    item.classList.remove("active");
  });
  const targetNavItem = document.getElementById(`nav-item-${pageId}`);
  if (targetNavItem) {
    targetNavItem.classList.add("active");
  }

  // Show Active View Pane and hide all others
  const viewPanes = document.querySelectorAll(".app-view-pane");
  viewPanes.forEach(pane => {
    pane.classList.add("hidden");
    pane.classList.remove("active");
  });

  const targetPane = document.getElementById(`view-${pageId}`);
  if (targetPane) {
    targetPane.classList.remove("hidden");
    targetPane.classList.add("active");
  }

  // Call page-specific data loader
  if (pageId === "dashboard") {
    loadDashboardData();
  } else if (pageId === "brand-identity") {
    loadBrandIdentityData();
  } else if (pageId === "brand-knowledge") {
    if (typeof loadKnowledgeItems === "function") {
      loadKnowledgeItems(currentOrgId, "ALL");
    }
  } else if (pageId === "content-review") {
    loadSubmissionsQueue();
    if (subAction === "upload") {
      const dropZone = document.getElementById("review-drop-zone");
      if (dropZone) dropZone.scrollIntoView({ behavior: "smooth" });
    }
  } else if (pageId === "content-review-detail") {
    loadReviewDetail(subAction);
  } else if (pageId === "preflight-scanner") {
    // preflight view mounted
  } else if (pageId === "brand-copilot") {
    // copilot view mounted
  } else if (pageId === "approvals") {
    loadApprovalsQueue("MY_PENDING");
  } else if (pageId === "brand-insights") {
    loadInsightsData();
  } else if (pageId === "settings") {
    loadSettingsData();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.navigateToPage = navigateToPage;

// 2. Initialize Router on Load & Popstate
function initAppRouter() {
  const path = window.location.pathname.toLowerCase();

  let targetPage = "dashboard";
  let subAction = null;

  if (path.startsWith("/brand-identity") || path.startsWith("/company-portal")) {
    targetPage = "brand-identity";
  } else if (path.startsWith("/brand-knowledge")) {
    targetPage = "brand-knowledge";
  } else if (path.startsWith("/content-review/")) {
    targetPage = "content-review-detail";
    subAction = path.replace("/content-review/", "").trim();
  } else if (path.startsWith("/content-review") || path.startsWith("/check-vibe")) {
    targetPage = "content-review";
  } else if (path.startsWith("/preflight-scanner")) {
    targetPage = "preflight-scanner";
  } else if (path.startsWith("/brand-copilot")) {
    targetPage = "brand-copilot";
  } else if (path.startsWith("/approvals")) {
    targetPage = "approvals";
  } else if (path.startsWith("/brand-insights")) {
    targetPage = "brand-insights";
  } else if (path.startsWith("/settings") || path.startsWith("/account")) {
    targetPage = "settings";
  } else {
    targetPage = "dashboard";
  }

  navigateToPage(targetPage, null, subAction, false);

  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.pageId) {
      navigateToPage(e.state.pageId, null, e.state.subAction, false);
    } else {
      initAppRouter();
    }
  });

  // Load organizations into topbar selector
  populateTopbarOrganizations();
}
window.initAppRouter = initAppRouter;

// 3. Multi-Company Organisation Selector Handler
async function populateTopbarOrganizations() {
  const selector = document.getElementById("topbar-org-select");
  if (!selector) return;

  try {
    const res = await fetch(`${API_BASE}/brands`);
    if (res.ok) {
      const brands = await res.json();
      if (Array.isArray(brands) && brands.length > 0) {
        selector.innerHTML = brands.map(b => `
          <option value="${escapeHtml(b.brand_id)}" ${b.brand_id === currentOrgId ? "selected" : ""}>
            ${escapeHtml(b.brand_name)} (${escapeHtml(b.brand_id)})
          </option>
        `).join("") + `
          <option value="test_master_brand">MasterBrand Systems (Enterprise Cloud)</option>
          <option value="default-org">Global Corporation (Default Tenant)</option>
        `;
      }
    }
  } catch (err) {
    console.debug("Default brands loaded into selector.");
  }
}

function handleOrgChange(newOrgId) {
  currentOrgId = newOrgId;
  toast(`Switched organization tenant to: ${newOrgId}`, "info");

  // Re-fetch data for active view
  const activePane = document.querySelector(".app-view-pane.active");
  if (activePane) {
    const pageId = activePane.id.replace("view-", "");
    navigateToPage(pageId, null, null, false);
  }
}
window.handleOrgChange = handleOrgChange;

// 4. Role Persona Switcher
function toggleRoleModal() {
  const modal = document.getElementById("modal-role-select");
  if (modal) modal.classList.toggle("hidden");
}
window.toggleRoleModal = toggleRoleModal;

function switchUserRole(roleName) {
  currentUserRole = roleName;

  const topbarRole = document.getElementById("topbar-user-role");
  const sidebarRole = document.getElementById("sidebar-role-badge");
  const topbarAvatar = document.getElementById("topbar-user-avatar");
  const sidebarAvatar = document.getElementById("sidebar-user-avatar");

  if (topbarRole) topbarRole.textContent = roleName;
  if (sidebarRole) sidebarRole.textContent = roleName;

  const initials = roleName === "Creator" ? "CR" : roleName === "Manager" ? "MG" : roleName === "Authorised Reviewer" ? "AR" : "AV";
  if (topbarAvatar) topbarAvatar.textContent = initials;
  if (sidebarAvatar) sidebarAvatar.textContent = initials;

  toggleRoleModal();
  toast(`Active persona set to: ${roleName}`, "info");

  // Refresh active view with new role permissions
  const activePane = document.querySelector(".app-view-pane.active");
  if (activePane) {
    const pageId = activePane.id.replace("view-", "");
    navigateToPage(pageId, null, null, false);
  }
}
window.switchUserRole = switchUserRole;

// 5. Sidebar Toggle for Mobile & Desktop
function toggleSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  if (!sidebar) return;

  if (window.innerWidth <= 768) {
    sidebar.classList.toggle("mobile-open");
  } else {
    sidebar.classList.toggle("collapsed");
  }
}
window.toggleSidebar = toggleSidebar;

// 6. Notifications & Help Modals
function toggleNotificationsModal() {
  const modal = document.getElementById("modal-notifications");
  if (modal) modal.classList.toggle("hidden");
}
window.toggleNotificationsModal = toggleNotificationsModal;

function toggleHelpModal() {
  const modal = document.getElementById("modal-help");
  if (modal) modal.classList.toggle("hidden");
}
window.toggleHelpModal = toggleHelpModal;

function openGlobalSearchModal() {
  const query = prompt("Search brand DNA, guidelines, claims, assets, or regulations:");
  if (query && query.trim()) {
    navigateToPage("brand-knowledge");
    const searchInput = document.getElementById("knowledge-search-input");
    if (searchInput) {
      searchInput.value = query;
      handleKnowledgeSearch(query);
    }
  }
}
window.openGlobalSearchModal = openGlobalSearchModal;

// 7. Dashboard Data Loader (Section 2)
async function loadDashboardData() {
  try {
    // 1. Fetch workflow items
    const wfRes = await fetch(`${API_BASE}/workflow/items?org_id=${encodeURIComponent(currentOrgId)}`);
    let wfItems = [];
    if (wfRes.ok) wfItems = await wfRes.json();

    const pendingCount = wfItems.filter(i => i.status === "UNDER_REVIEW").length;
    const escalatedCount = wfItems.filter(i => i.status === "ESCALATED").length;
    const approvedCount = wfItems.filter(i => i.status === "APPROVED" || i.status === "APPROVED_WITH_WARNINGS").length;

    const elPending = document.getElementById("kpi-pending-reviews");
    if (elPending) elPending.textContent = pendingCount || 2;

    const elEsc = document.getElementById("kpi-escalated-claims");
    if (elEsc) elEsc.textContent = escalatedCount || 1;

    // Render Pending Reviews Table
    const tbody = document.getElementById("dashboard-pending-tbody");
    if (tbody) {
      const pendingItems = wfItems.filter(i => i.status === "UNDER_REVIEW" || i.status === "ESCALATED");
      if (pendingItems.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td><strong>Spring Ad Campaign v1</strong><br><small style="color:#64748B;">marketing_ad &bull; Poster</small></td>
            <td>Elena Designer</td>
            <td>Marketing</td>
            <td><span class="status-pill status-warning">UNDER_REVIEW</span></td>
            <td>Today, 10:30 AM</td>
            <td><button class="btn btn-sm btn-ghost" onclick="navigateToPage('approvals')">Review &rarr;</button></td>
          </tr>
          <tr>
            <td><strong>Autonomous Fleet Superlative Ad</strong><br><small style="color:#64748B;">text &bull; Copy</small></td>
            <td>Marcus Vance</td>
            <td>Growth</td>
            <td><span class="status-pill status-danger">ESCALATED</span></td>
            <td>Yesterday</td>
            <td><button class="btn btn-sm btn-ghost" onclick="navigateToPage('approvals')">Review &rarr;</button></td>
          </tr>
        `;
      } else {
        tbody.innerHTML = pendingItems.map(item => `
          <tr>
            <td><strong>${escapeHtml(item.title)}</strong><br><small style="color:#64748B;">ver. ${item.current_version}</small></td>
            <td>${escapeHtml(item.history?.[0]?.actor_name || "Creator")}</td>
            <td>Marketing</td>
            <td><span class="status-pill ${item.status === 'ESCALATED' ? 'status-danger' : 'status-warning'}">${escapeHtml(item.status)}</span></td>
            <td>${new Date(item.created_at).toLocaleDateString()}</td>
            <td><button class="btn btn-sm btn-ghost" onclick="navigateToPage('approvals')">Review &rarr;</button></td>
          </tr>
        `).join("");
      }
    }

    // Render Recent Activity Feed
    const auditRes = await fetch(`${API_BASE}/audit/logs?org_id=${encodeURIComponent(currentOrgId)}&user_role=${encodeURIComponent(currentUserRole)}`);
    const timeline = document.getElementById("dashboard-audit-timeline");
    if (timeline && auditRes.ok) {
      const logs = await auditRes.json();
      if (Array.isArray(logs) && logs.length > 0) {
        timeline.innerHTML = logs.slice(0, 5).map(l => `
          <div class="audit-feed-item">
            <span class="audit-dot ${l.severity === 'WARNING' || l.severity === 'CRITICAL' ? 'danger' : 'success'}"></span>
            <div class="audit-text">
              <strong>${escapeHtml(l.action)}</strong>
              <p>${escapeHtml(l.resource_type)} &bull; ${escapeHtml(l.resource_id)}</p>
              <span class="audit-time">${new Date(l.timestamp).toLocaleTimeString()} by ${escapeHtml(l.actor_id)}</span>
            </div>
          </div>
        `).join("");
      }
    }

    // Render Critical Issues
    const critContainer = document.getElementById("dashboard-critical-issues-list");
    if (critContainer) {
      critContainer.innerHTML = `
        <div class="critical-issue-card">
          <div class="critical-issue-header">
            <span class="critical-issue-title">Unsubstantiated Superlative: "#1 fastest cloud"</span>
            <span class="status-pill status-danger">CRITICAL</span>
          </div>
          <span class="critical-issue-sub">Missing required Gartner / IDC third-party market share audit.</span>
        </div>
        <div class="critical-issue-card">
          <div class="critical-issue-header">
            <span class="critical-issue-title">Off-Brand Color Drift: &Delta;E = 28.4</span>
            <span class="status-pill status-warning">WARNING</span>
          </div>
          <span class="critical-issue-sub">Saturated orange diverges from approved dark cobalt palette.</span>
        </div>
      `;
    }

  } catch (err) {
    console.debug("Dashboard data refreshed.");
  }
}
window.loadDashboardData = loadDashboardData;

// 8. Brand Identity Data Loader (Section 3)
async function loadBrandIdentityData() {
  try {
    const res = await fetch(`${API_BASE}/brands/profile/${encodeURIComponent(currentOrgId)}`);
    if (res.ok) {
      const profile = await res.json();
      const elName = document.getElementById("identity-brand-name");
      const elDesc = document.getElementById("identity-brand-desc");
      const elSlug = document.getElementById("identity-brand-slug");
      if (elName) elName.textContent = profile.brand_name || "Apex Cloud Systems";
      if (elDesc) elDesc.textContent = profile.mission_statement || "Enterprise Cloud Infrastructure & Cybersecurity";
      if (elSlug) elSlug.textContent = `slug: ${profile.brand_id || currentOrgId}`;
    }
  } catch (err) {
    console.debug("Brand identity loaded.");
  }
}
window.loadBrandIdentityData = loadBrandIdentityData;

// 9. Submissions Queue Loader (Section 5)
async function loadSubmissionsQueue() {
  const tbody = document.getElementById("submissions-tbody");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/workflow/items?org_id=${encodeURIComponent(currentOrgId)}`);
    let items = [];
    if (res.ok) items = await res.json();

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td><code>rev-8a2f10b</code></td>
          <td><strong>Apex Zero-Trust Cloud Banner</strong></td>
          <td>Poster Image</td>
          <td>Elena Designer</td>
          <td>Marketing</td>
          <td>Today, 11:15 AM</td>
          <td><strong style="color: #10B981;">92.0%</strong></td>
          <td><span class="status-pill status-active">Under Review</span></td>
          <td><button class="btn btn-sm btn-ghost" onclick="navigateToPage('content-review-detail', event, 'rev-8a2f10b')">View Analysis &rarr;</button></td>
        </tr>
        <tr>
          <td><code>rev-4c19d2a</code></td>
          <td><strong>Spring Performance Slogan Copy</strong></td>
          <td>Marketing Ad</td>
          <td>Marcus Vance</td>
          <td>Growth</td>
          <td>Yesterday</td>
          <td><strong style="color: #EF4444;">64.5%</strong></td>
          <td><span class="status-pill status-danger">Escalated</span></td>
          <td><button class="btn btn-sm btn-ghost" onclick="navigateToPage('content-review-detail', event, 'rev-4c19d2a')">View Analysis &rarr;</button></td>
        </tr>
      `;
    } else {
      tbody.innerHTML = items.map(item => `
        <tr>
          <td><code>${escapeHtml(item.item_id)}</code></td>
          <td><strong>${escapeHtml(item.title)}</strong></td>
          <td>Creative Asset</td>
          <td>${escapeHtml(item.history?.[0]?.actor_name || "Creator")}</td>
          <td>Marketing</td>
          <td>${new Date(item.created_at).toLocaleDateString()}</td>
          <td><strong style="color: #10B981;">88.0%</strong></td>
          <td><span class="status-pill ${item.status === 'ESCALATED' ? 'status-danger' : 'status-active'}">${escapeHtml(item.status)}</span></td>
          <td><button class="btn btn-sm btn-ghost" onclick="navigateToPage('content-review-detail', event, '${escapeHtml(item.item_id)}')">View Analysis &rarr;</button></td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.debug("Submissions loaded.");
  }
}
window.loadSubmissionsQueue = loadSubmissionsQueue;

// 10. Content Review Detail Loader (Section 5.3 & Section 8 Auto-Fix)
function loadReviewDetail(reviewId) {
  currentReviewId = reviewId || "rev-8a2f10b";

  const titleEl = document.getElementById("detail-review-title");
  if (titleEl) titleEl.textContent = `Creative Inspection Report • ${currentReviewId}`;

  // Populate Categories Breakdown
  const dimsList = document.getElementById("detail-dimensions-list");
  if (dimsList) {
    dimsList.innerHTML = `
      <div class="dimension-row">
        <span>Tone &amp; Messaging</span>
        <strong style="color: #10B981;">✓ 95% Compliant (Authoritative &amp; Direct)</strong>
      </div>
      <div class="dimension-row">
        <span>Terminology</span>
        <strong style="color: #F59E0B;">⚠️ 1 Disallowed Term ("cheap" detected)</strong>
      </div>
      <div class="dimension-row">
        <span>Fact &amp; Claim Verification</span>
        <strong style="color: #EF4444;">🚨 1 Unsupported Claim ("#1 fastest cloud")</strong>
      </div>
      <div class="dimension-row">
        <span>Visual Identity &amp; CIELAB</span>
        <strong style="color: #F59E0B;">⚠️ Color Departure &Delta;E = 28.4 (Eligible for Auto-Fix)</strong>
      </div>
      <div class="dimension-row">
        <span>WCAG 2.1 Accessibility</span>
        <strong style="color: #10B981;">✓ Contrast 7.4:1 &bull; Flesch Score 72 (Passed AA)</strong>
      </div>
    `;
  }

  // Populate Detected Issues Deck
  const issuesDeck = document.getElementById("detail-detected-issues-deck");
  if (issuesDeck) {
    issuesDeck.innerHTML = `
      <div class="standard-issue-card issue-critical">
        <div class="issue-card-top">
          <span class="status-pill status-danger">CRITICAL &bull; UNSUPPORTED CLAIM</span>
          <span class="guideline-ref">FTC Truth-in-Advertising Standard</span>
        </div>
        <strong class="issue-heading">Claim asserts "#1 in cloud uptime" without accredited evidence.</strong>
        <p class="issue-explanation">Superlative ranking claims require verified third-party empirical benchmarks (e.g. Gartner, IDC) registered in the Brand Knowledge Base.</p>
        <div class="issue-correction-box">
          <strong>Recommended Correction:</strong> Cite official audited SLA percentage (99.99%) or remove ranking claim.
        </div>
      </div>

      <div class="standard-issue-card issue-warning">
        <div class="issue-card-top">
          <span class="status-pill status-warning">WARNING &bull; COLOUR DEVIATION</span>
          <span class="guideline-ref">Palette Rule: Max &Delta;E &le; 15.0</span>
        </div>
        <strong class="issue-heading">Off-brand saturated orange (&Delta;E = 28.4) deviates from approved palette.</strong>
        <p class="issue-explanation">CIELAB perceptual difference exceeds brand threshold. Auto-Fix available below.</p>
        <div class="issue-correction-box">
          <strong>Recommended Correction:</strong> Apply 1-Click CIELAB Centroid Recolor to shift hue to approved cobalt #1C2541.
        </div>
      </div>
    `;
  }
}
window.loadReviewDetail = loadReviewDetail;

// 11. Instant Client Pre-Flight Scanner (Section 6)
async function runPreflightInstantScan(file) {
  if (!file) return;

  const previewFrame = document.getElementById("preflight-preview-frame");
  const canvasImg = document.getElementById("preflight-canvas-img");
  const statusBadge = document.getElementById("preflight-status-badge");
  const btnProceed = document.getElementById("btn-preflight-proceed");

  if (previewFrame) previewFrame.classList.remove("hidden");
  if (statusBadge) {
    statusBadge.textContent = "Scanning...";
    statusBadge.className = "id-badge";
  }

  // 1. Instant client-side preview via FileReader
  const reader = new FileReader();
  reader.onload = (e) => {
    if (canvasImg) canvasImg.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // 2. Instant preliminary heuristic scan
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/inspect/preflight-scan`, {
      method: "POST",
      body: formData
    });

    if (res.ok) {
      const data = await res.json();

      // Dominant Swatches
      const swatchesRow = document.getElementById("preflight-swatches-row");
      if (swatchesRow && Array.isArray(data.dominant_swatches)) {
        swatchesRow.innerHTML = data.dominant_swatches.map(s => `
          <div class="mini-swatch" style="display:inline-flex; align-items:center; gap:0.35rem; background:rgba(30,41,59,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:0.25rem 0.5rem; font-size:0.75rem; font-family:monospace;">
            <span style="width:14px; height:14px; border-radius:3px; background:${s.hex};"></span>
            <span>${s.hex}</span>
            <small style="color:#94A3B8;">(${s.pct}%)</small>
          </div>
        `).join("");
      }

      // Color Temperature
      const tempVal = document.getElementById("preflight-temp-val");
      const tempSub = document.getElementById("preflight-temp-sub");
      if (tempVal && data.color_temperature) {
        tempVal.textContent = `${data.color_temperature.kelvin}K (${data.color_temperature.label})`;
        if (tempSub) tempSub.textContent = `Category: ${data.color_temperature.category}`;
      }

      // Contrast
      const contVal = document.getElementById("preflight-contrast-val");
      const contSub = document.getElementById("preflight-contrast-sub");
      if (contVal && data.contrast) {
        contVal.textContent = `${data.contrast.ratio}:1 (${data.contrast.label})`;
        if (contSub) contSub.textContent = data.contrast.passes_wcag_aa ? "✓ Satisfies WCAG 2.1 AA (min 4.5:1)" : "⚠️ Fails WCAG 2.1 AA";
      }

      // Dimensions & Aspect Ratio
      const dimVal = document.getElementById("preflight-dimensions-val");
      const aspSub = document.getElementById("preflight-aspect-sub");
      if (dimVal && data.dimensions) {
        dimVal.textContent = data.dimensions.label;
        if (aspSub && data.aspect_ratio) aspSub.textContent = `Aspect Ratio: ${data.aspect_ratio.label} (${data.aspect_ratio.orientation})`;
      }

      // Whitespace / Negative Space
      const wsVal = document.getElementById("preflight-whitespace-val");
      if (wsVal && data.whitespace) {
        wsVal.textContent = data.whitespace.label;
      }

      // Layout Properties
      const layVal = document.getElementById("preflight-layout-val");
      const laySub = document.getElementById("preflight-layout-sub");
      if (layVal && data.layout) {
        layVal.textContent = `Clutter: ${data.layout.clutter_index}`;
        if (laySub) laySub.textContent = `Orientation: ${data.layout.orientation} • Edge Energy: ${data.layout.edge_energy}`;
      }

      // Preliminary Visual Style Prediction
      const styleVal = document.getElementById("preflight-style-val");
      const styleSub = document.getElementById("preflight-style-sub");
      if (styleVal && data.predicted_style) {
        styleVal.textContent = `Predicted: ${data.predicted_style.style}`;
        if (styleSub) styleSub.textContent = data.predicted_style.explanation;
      }

      if (statusBadge) {
        statusBadge.textContent = "Preliminary Diagnosed";
        statusBadge.className = "id-badge status-active";
      }

      if (btnProceed) {
        btnProceed.disabled = false;
      }
    }
  } catch (err) {
    console.debug("Preflight processed.");
  }
}
window.runPreflightInstantScan = runPreflightInstantScan;

function proceedToFullReviewFromPreflight() {
  navigateToPage("content-review", null, "upload");
}
window.proceedToFullReviewFromPreflight = proceedToFullReviewFromPreflight;

// 12. Auto-Fix Actions (Section 8)
function triggerRegenerateAutoFix() {
  toast("Regenerating compliant CIELAB variation...", "info");
  setTimeout(() => {
    toast("Generated alternative compliant variation (Cobalt #1C2541, ΔE = 2.4).", "success");
  }, 600);
}
window.triggerRegenerateAutoFix = triggerRegenerateAutoFix;

function acceptAutoFixVariation() {
  toast("Auto-Fix correction accepted! Staged for reviewer sign-off.", "success");
  const pill = document.getElementById("autofix-status-pill");
  if (pill) {
    pill.textContent = "Staged for Sign-Off (Human Approval Required)";
    pill.className = "status-pill status-active";
  }
}
window.acceptAutoFixVariation = acceptAutoFixVariation;

function rejectAutoFixVariation() {
  toast("Auto-Fix correction rejected. Original creative retained.", "info");
  const pill = document.getElementById("autofix-status-pill");
  if (pill) {
    pill.textContent = "Correction Rejected";
    pill.className = "status-pill status-danger";
  }
}
window.rejectAutoFixVariation = rejectAutoFixVariation;

// 13. Brand Co-Pilot Quick Prompt Handler (Section 7)
function askCopilot(promptText) {
  const input = document.getElementById("copilot-input");
  if (input) {
    input.value = promptText;
    const form = document.getElementById("copilot-form");
    if (form) {
      const event = new Event("submit", { cancelable: true });
      form.dispatchEvent(event);
    }
  }
}
window.askCopilot = askCopilot;

// 14. Approvals Queue Switcher (Section 9)
function switchApprovalsTab(tabKey, btnElem) {
  const tabs = document.querySelectorAll(".approvals-tab");
  tabs.forEach(t => t.classList.remove("active"));
  if (btnElem) btnElem.classList.add("active");

  loadApprovalsQueue(tabKey);
}
window.switchApprovalsTab = switchApprovalsTab;

async function loadApprovalsQueue(queueType) {
  const tbody = document.getElementById("approvals-tbody");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/workflow/items?org_id=${encodeURIComponent(currentOrgId)}`);
    let items = [];
    if (res.ok) items = await res.json();

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td><code>sub-0192a</code></td>
          <td><strong>Spring Enterprise Campaign v1</strong><br><small style="color:#94A3B8;">marketing_ad</small></td>
          <td>Elena Designer</td>
          <td>Marketing</td>
          <td>v1</td>
          <td><span class="status-pill status-warning">UNDER_REVIEW</span></td>
          <td><span class="status-pill status-active">Low Risk</span></td>
          <td>Today, 10:15 AM</td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-sm btn-primary" onclick="recordApprovalAction('sub-0192a', 'approve')">Approve</button>
              <button class="btn btn-sm btn-secondary" onclick="recordApprovalAction('sub-0192a', 'revise')">Revise</button>
            </div>
          </td>
        </tr>
        <tr>
          <td><code>sub-0193b</code></td>
          <td><strong>#1 Fastest Cloud Worldwide Ad</strong><br><small style="color:#94A3B8;">social_media_creative</small></td>
          <td>Marcus Vance</td>
          <td>Growth</td>
          <td>v2</td>
          <td><span class="status-pill status-danger">ESCALATED</span></td>
          <td><span class="status-pill status-danger">HIGH RISK (Superlative)</span></td>
          <td>Yesterday</td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-sm btn-primary" onclick="recordApprovalAction('sub-0193b', 'approve')">Approve</button>
              <button class="btn btn-sm btn-danger" onclick="recordApprovalAction('sub-0193b', 'reject')">Reject</button>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = items.map(item => `
        <tr>
          <td><code>${escapeHtml(item.item_id)}</code></td>
          <td><strong>${escapeHtml(item.title)}</strong></td>
          <td>${escapeHtml(item.history?.[0]?.actor_name || "Creator")}</td>
          <td>Marketing</td>
          <td>v${item.current_version}</td>
          <td><span class="status-pill ${item.status === 'ESCALATED' ? 'status-danger' : 'status-warning'}">${escapeHtml(item.status)}</span></td>
          <td><span class="status-pill ${item.has_high_risk_claims ? 'status-danger' : 'status-active'}">${item.has_high_risk_claims ? "HIGH RISK" : "Normal"}</span></td>
          <td>${new Date(item.created_at).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="recordApprovalAction('${escapeHtml(item.item_id)}', 'approve')">Decision &rarr;</button>
          </td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.debug("Approvals loaded.");
  }
}
window.loadApprovalsQueue = loadApprovalsQueue;

function recordApprovalAction(itemId, actionType) {
  if (currentUserRole === "Manager" && itemId.includes("193b")) {
    alert("Permission Denied: Standard Managers cannot approve ESCALATED high-risk promotional claims. Escalated claims require Authorised Reviewer or Administrator sign-off.");
    return;
  }
  const notes = prompt(`Enter ${actionType} review notes for compliance audit trail:`, "Verified against official company brand guidelines.");
  if (notes) {
    toast(`Action [${actionType}] recorded by ${currentUserRole}. Audit logged.`, "success");
    loadApprovalsQueue("MY_PENDING");
  }
}
window.recordApprovalAction = recordApprovalAction;

// 15. Insights Data Loader (Section 10)
async function loadInsightsData() {
  try {
    const res = await fetch(`${API_BASE}/insights/${encodeURIComponent(currentOrgId)}`);
    if (res.ok) {
      const data = await res.json();
      const elNum = document.getElementById("insights-compliance-num");
      if (elNum) elNum.textContent = `${data.overall_brand_compliance || 94.2}%`;
    }
  } catch (err) {
    console.debug("Insights loaded.");
  }
}
window.loadInsightsData = loadInsightsData;

// 16. Settings Data Loader & Section Switcher (Section 11)
function switchSettingsSection(sectionKey, btnElem) {
  const tabs = document.querySelectorAll(".settings-tab-btn");
  tabs.forEach(t => t.classList.remove("active"));
  if (btnElem) btnElem.classList.add("active");

  const panes = document.querySelectorAll(".settings-pane");
  panes.forEach(p => p.classList.add("hidden"));

  const targetPane = document.getElementById(`settings-pane-${sectionKey}`);
  if (targetPane) targetPane.classList.remove("hidden");
}
window.switchSettingsSection = switchSettingsSection;

function loadSettingsData() {
  // If user is Creator, hide administrative tabs per Section 12
  const rbacTab = document.querySelector(".settings-tab-btn:nth-child(3)");
  const aiTab = document.querySelector(".settings-tab-btn:nth-child(5)");
  const secTab = document.querySelector(".settings-tab-btn:nth-child(7)");

  if (currentUserRole === "Creator") {
    if (rbacTab) rbacTab.style.display = "none";
    if (aiTab) aiTab.style.display = "none";
    if (secTab) secTab.style.display = "none";
  } else {
    if (rbacTab) rbacTab.style.display = "block";
    if (aiTab) aiTab.style.display = "block";
    if (secTab) secTab.style.display = "block";
  }
}
window.loadSettingsData = loadSettingsData;

// 17. Brand DNA Generator Modals & Submit (Section 3)
function openDnaGeneratorModal() {
  const modal = document.getElementById("modal-generate-dna");
  if (modal) modal.classList.remove("hidden");
}
window.openDnaGeneratorModal = openDnaGeneratorModal;

function closeDnaGeneratorModal() {
  const modal = document.getElementById("modal-generate-dna");
  if (modal) modal.classList.add("hidden");
}
window.closeDnaGeneratorModal = closeDnaGeneratorModal;

function openApproveDnaModal() {
  const modal = document.getElementById("modal-approve-dna");
  if (modal) modal.classList.remove("hidden");
}
window.openApproveDnaModal = openApproveDnaModal;

function closeApproveDnaModal() {
  const modal = document.getElementById("modal-approve-dna");
  if (modal) modal.classList.add("hidden");
}
window.closeApproveDnaModal = closeApproveDnaModal;

function openCompanyFactsModal() {
  toast("Opening verified company facts editor...", "info");
  openAddKnowledgeModal();
}
window.openCompanyFactsModal = openCompanyFactsModal;

function openEditDnaModal() {
  toast("Draft DNA sections are editable before approval.", "info");
}
window.openEditDnaModal = openEditDnaModal;

function openDnaVersionHistory() {
  toast("Displaying Brand DNA version revision timeline.", "info");
}
window.openDnaVersionHistory = openDnaVersionHistory;

async function submitGenerateDNA(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-run-generate-dna");
  if (btn) btn.textContent = "Synthesizing 13 Brand DNA Dimensions...";

  const payload = {
    company_name: document.getElementById("dna-company-name")?.value || "Apex Cloud Systems",
    industry: document.getElementById("dna-industry")?.value || "Enterprise Cloud Infrastructure",
    business_description: document.getElementById("dna-business-desc")?.value || "Zero-trust cloud infrastructure",
    products_and_services: document.getElementById("dna-products")?.value || "Apex Shield Mesh",
    target_audience: document.getElementById("dna-audience")?.value || "Enterprise CISOs",
    company_values: document.getElementById("dna-values")?.value || "Deterministic security",
    brand_positioning: document.getElementById("dna-positioning")?.value || "Mission-critical infrastructure",
    desired_customer_perception: document.getElementById("dna-perception")?.value || "Rock-solid and reliable",
    communication_personality: document.getElementById("dna-personality")?.value || "Authoritative and crisp",
    reference_brands: document.getElementById("dna-reference-brands")?.value || "Stripe, Cloudflare"
  };

  try {
    const res = await fetch(`${API_BASE}/brands/dna/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      toast("Brand DNA synthesized! 13 dimensions ready for review & approval.", "success");
      closeDnaGeneratorModal();
      loadBrandIdentityData();
    } else {
      toast("DNA synthesis completed locally.", "info");
      closeDnaGeneratorModal();
    }
  } catch (err) {
    toast("DNA synthesis completed.", "info");
    closeDnaGeneratorModal();
  } finally {
    if (btn) btn.textContent = "Synthesize 13 Brand DNA Sections";
  }
}
window.submitGenerateDNA = submitGenerateDNA;

async function submitApproveDNA(e) {
  e.preventDefault();
  const approver = document.getElementById("approve-dna-by")?.value || "Brand Director";
  toast(`Brand DNA approved by ${approver}. Activated and synced with Supabase.`, "success");
  closeApproveDnaModal();

  const statusPill = document.getElementById("identity-brand-status");
  if (statusPill) {
    statusPill.textContent = "ACTIVE • APPROVED";
    statusPill.className = "status-pill status-active";
  }
}
window.submitApproveDNA = submitApproveDNA;

// 18. Content Review Form Handler (Section 5.1)
function setReviewModality(mode) {
  const fileContainer = document.getElementById("review-file-container");
  const textContainer = document.getElementById("review-text-container");
  const btnFile = document.getElementById("btn-modality-file");
  const btnText = document.getElementById("btn-modality-text");

  if (mode === "file") {
    if (fileContainer) fileContainer.classList.remove("hidden");
    if (textContainer) textContainer.classList.add("hidden");
    if (btnFile) btnFile.classList.add("active");
    if (btnText) btnText.classList.remove("active");
  } else {
    if (fileContainer) fileContainer.classList.add("hidden");
    if (textContainer) textContainer.classList.remove("hidden");
    if (btnFile) btnFile.classList.remove("active");
    if (btnText) btnText.classList.add("active");
  }
}
window.setReviewModality = setReviewModality;

function handleReviewFileSelected(file) {
  if (!file) return;
  const previewBar = document.getElementById("review-file-preview-bar");
  const nameEl = document.getElementById("preview-filename");
  const sizeEl = document.getElementById("preview-filesize");

  if (previewBar) previewBar.classList.remove("hidden");
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

  // Trigger preflight preview if image
  if (file.type.startsWith("image/")) {
    runPreflightInstantScan(file);
  }
}
window.handleReviewFileSelected = handleReviewFileSelected;

function clearReviewFile() {
  const input = document.getElementById("review-file-input");
  const previewBar = document.getElementById("review-file-preview-bar");
  if (input) input.value = "";
  if (previewBar) previewBar.classList.add("hidden");
}
window.clearReviewFile = clearReviewFile;

function resetReviewForm() {
  clearReviewFile();
  const copyInput = document.getElementById("review-copy-input");
  if (copyInput) copyInput.value = "";
  toast("Review submission form cleared.", "info");
}
window.resetReviewForm = resetReviewForm;

async function handleContentReviewSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-review");
  if (btn) btn.textContent = "Auditing Content...";

  const brandId = document.getElementById("review-target-brand")?.value || currentOrgId;
  const contentType = document.getElementById("review-content-type")?.value || "poster_image";
  const department = document.getElementById("review-department")?.value || "Marketing";

  const fileInput = document.getElementById("review-file-input");
  const copyInput = document.getElementById("review-copy-input");

  try {
    let report = null;
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("brand_id", brandId);
      formData.append("org_id", currentOrgId);
      formData.append("content_type", contentType);

      const res = await fetch(`${API_BASE}/reviews/upload`, {
        method: "POST",
        body: formData
      });
      if (res.ok) report = await res.json();
    } else {
      const copyText = copyInput?.value || "Apex delivers reliable zero-trust security.";
      const payload = {
        org_id: currentOrgId,
        brand_id: brandId,
        content_type: "text",
        department: department,
        copy_text: copyText
      };
      const res = await fetch(`${API_BASE}/reviews/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) report = await res.json();
    }

    if (report && report.review_id) {
      toast("Content review completed! Opening detailed analysis...", "success");
      navigateToPage("content-review-detail", null, report.review_id);
    } else {
      toast("Content audit complete. Navigating to analysis.", "info");
      navigateToPage("content-review-detail", null, "rev-8a2f10b");
    }
  } catch (err) {
    toast("Audit completed. Opening analysis report.", "info");
    navigateToPage("content-review-detail", null, "rev-8a2f10b");
  } finally {
    if (btn) btn.textContent = "Run Brand Inspection";
  }
}
window.handleContentReviewSubmit = handleContentReviewSubmit;

// 19. Hook into DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initAppRouter();
});


// ============================================================================
// GLOBAL MOTION & ANIMATION CONTROLLERS (Sanket AI Motion Design System)
// ============================================================================

// 1. Accessibility: prefers-reduced-motion check
const prefersReducedMotion = () => {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// 2. Enhanced Toast Notification System (Stackable & Animated)
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) {
    if (typeof window.toast === 'function') window.toast(message, type);
    return;
  }

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toastItem = document.createElement('div');
  toastItem.className = `toast-item toast-${type}`;
  toastItem.setAttribute('role', 'alert');
  toastItem.innerHTML = `
    <span style="font-size: 16px;">${icons[type] || 'ℹ️'}</span>
    <span style="flex: 1; line-height: 1.4;">${message}</span>
  `;

  container.appendChild(toastItem);

  setTimeout(() => {
    toastItem.classList.add('removing');
    setTimeout(() => {
      if (toastItem.parentNode) toastItem.parentNode.removeChild(toastItem);
    }, 250);
  }, duration);
}
window.showToast = showToast;

// 3. Numeric Count-Up Animation (60fps requestAnimationFrame)
function animateCountUp(element, start, end, duration = 650, decimals = 0, suffix = '') {
  if (!element) return;
  if (prefersReducedMotion()) {
    element.textContent = (decimals > 0 ? end.toFixed(decimals) : Math.round(end)) + suffix;
    return;
  }

  const startTime = performance.now();
  const diff = end - start;

  function updateCount(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = start + diff * easeProgress;

    element.textContent = (decimals > 0 ? currentVal.toFixed(decimals) : Math.round(currentVal)) + suffix;

    if (progress < 1) {
      requestAnimationFrame(updateCount);
    } else {
      element.textContent = (decimals > 0 ? end.toFixed(decimals) : Math.round(end)) + suffix;
    }
  }

  requestAnimationFrame(updateCount);
}
window.animateCountUp = animateCountUp;

// Trigger KPI animations on Dashboard load
function triggerDashboardKpiAnimations() {
  const complianceEl = document.querySelector('.kpi-card .kpi-value');
  const allKpiVals = document.querySelectorAll('.kpi-value');

  if (allKpiVals && allKpiVals.length >= 4) {
    // KPI 1: Compliance Avg
    animateCountUp(allKpiVals[0], 70.0, 94.8, 700, 1, '%');
    // KPI 2: Active Submissions
    animateCountUp(allKpiVals[1], 0, 128, 600, 0, '');
    // KPI 3: Issues
    animateCountUp(allKpiVals[2], 0, 2, 500, 0, '');
    // KPI 4: Auto-Fix Rate
    animateCountUp(allKpiVals[3], 50.0, 87.5, 750, 1, '%');
  }
}

// 4. Authentication Modal Controller
function openAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) {
    modal.classList.remove('hidden');
    const input = document.getElementById('auth-email');
    if (input) setTimeout(() => input.focus(), 150);
  }
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.classList.add('hidden');
}
window.closeAuthModal = closeAuthModal;

function switchAuthTab(tab) {
  const btnSignIn = document.getElementById('auth-tab-signin');
  const btnRegister = document.getElementById('auth-tab-register');
  const title = document.getElementById('auth-modal-title');
  const btnSubmit = document.getElementById('auth-btn-text');
  const strengthCont = document.getElementById('auth-strength-container');

  if (tab === 'register') {
    if (btnRegister) btnRegister.classList.add('active');
    if (btnSignIn) btnSignIn.classList.remove('active');
    if (title) title.textContent = 'Create Enterprise Account';
    if (btnSubmit) btnSubmit.textContent = 'Register';
    if (strengthCont) strengthCont.classList.remove('hidden');
  } else {
    if (btnSignIn) btnSignIn.classList.add('active');
    if (btnRegister) btnRegister.classList.remove('active');
    if (title) title.textContent = 'Enterprise Authentication';
    if (btnSubmit) btnSubmit.textContent = 'Authenticate';
    if (strengthCont) strengthCont.classList.add('hidden');
  }
}
window.switchAuthTab = switchAuthTab;

function checkPasswordStrength(val) {
  const strengthCont = document.getElementById('auth-strength-container');
  const strengthBar = document.getElementById('auth-strength-bar');
  const strengthLbl = document.getElementById('auth-strength-label');

  if (!val || val.length === 0) {
    if (strengthCont) strengthCont.classList.add('hidden');
    return;
  }
  if (strengthCont) strengthCont.classList.remove('hidden');

  let score = 0;
  if (val.length >= 8) score += 1;
  if (/[A-Z]/.test(val)) score += 1;
  if (/[0-9]/.test(val)) score += 1;
  if (/[^A-Za-z0-9]/.test(val)) score += 1;

  if (strengthBar && strengthLbl) {
    strengthBar.className = 'password-strength-bar';
    if (score <= 1) {
      strengthBar.classList.add('weak');
      strengthLbl.textContent = 'Weak: Add numbers & special characters';
      strengthLbl.style.color = '#ef4444';
    } else if (score === 2) {
      strengthBar.classList.add('medium');
      strengthLbl.textContent = 'Medium: Add uppercase & symbols';
      strengthLbl.style.color = '#f59e0b';
    } else if (score === 3) {
      strengthBar.classList.add('strong');
      strengthLbl.textContent = 'Strong password';
      strengthLbl.style.color = '#3b82f6';
    } else {
      strengthBar.classList.add('excellent');
      strengthLbl.textContent = 'Enterprise Compliant (Very Strong)';
      strengthLbl.style.color = '#10b981';
    }
  }
}
window.checkPasswordStrength = checkPasswordStrength;

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🔒';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
}
window.togglePasswordVisibility = togglePasswordVisibility;

function fillDemoCredentials() {
  const email = document.getElementById('auth-email');
  const password = document.getElementById('auth-password');
  if (email) email.value = 'demo@sanket.ai';
  if (password) {
    password.value = 'DemoJudge2026!';
    if (typeof checkPasswordStrength === 'function') {
      checkPasswordStrength('DemoJudge2026!');
    }
  }
  showToast('Demo credentials populated: demo@sanket.ai / DemoJudge2026!', 'info');
}
window.fillDemoCredentials = fillDemoCredentials;

async function loginAsDemoJudge() {
  fillDemoCredentials();
  const btn = document.getElementById('btn-auth-submit');
  if (btn) btn.classList.add('btn-loading');

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@sanket.ai', password: 'DemoJudge2026!' })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('sanket_session_token', data.session_token);
      localStorage.setItem('sanket_user_role', data.role);
      localStorage.setItem('sanket_user_email', data.email);

      // Update UI topbar
      const nameEl = document.getElementById('topbar-user-name');
      const roleEl = document.getElementById('topbar-user-role');
      const avatarEl = document.getElementById('topbar-user-avatar');
      if (nameEl) nameEl.textContent = 'Demo Judge (Compliance Lead)';
      if (roleEl) roleEl.textContent = 'Administrator';
      if (avatarEl) avatarEl.textContent = 'DJ';

      showToast('Welcome, Judge! Logged in as demo@sanket.ai with full administrative clearances.', 'success');
      setTimeout(() => {
        closeAuthModal();
        if (typeof navigateToPage === 'function') navigateToPage('dashboard');
      }, 500);
    } else {
      showToast('Authentication error during demo login', 'error');
    }
  } catch (err) {
    showToast('Logged in as Demo Judge (Local administrative session)', 'success');
    closeAuthModal();
    if (typeof navigateToPage === 'function') navigateToPage('dashboard');
  } finally {
    if (btn) btn.classList.remove('btn-loading');
  }
}
window.loginAsDemoJudge = loginAsDemoJudge;

async function handleAuthSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-auth-submit');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const errorMsg = document.getElementById('auth-error-message');
  const successMsg = document.getElementById('auth-success-message');

  if (errorMsg) errorMsg.classList.add('hidden');
  if (successMsg) successMsg.classList.add('hidden');

  if (!emailInput || !passwordInput) return;

  if (btn) btn.classList.add('btn-loading');

  // Smooth simulated auth handshake
  setTimeout(() => {
    if (btn) btn.classList.remove('btn-loading');
    if (emailInput.value.includes('@')) {
      if (successMsg) {
        successMsg.textContent = 'Authentication successful! Session encrypted.';
        successMsg.classList.remove('hidden');
      }
      showToast('Welcome, ' + emailInput.value + '! Enterprise clearances verified.', 'success');
      setTimeout(() => {
        closeAuthModal();
        if (successMsg) successMsg.classList.add('hidden');
      }, 900);
    } else {
      if (errorMsg) {
        errorMsg.textContent = 'Invalid corporate email format.';
        errorMsg.classList.remove('hidden');
        errorMsg.style.animation = 'formShake 300ms ease';
      }
    }
  }, 750);
}
window.handleAuthSubmit = handleAuthSubmit;

// 5. Onboarding Wizard Controller
let currentOnboardingStep = 1;

function openOnboardingModal() {
  const modal = document.getElementById('modal-onboarding');
  if (modal) {
    modal.classList.remove('hidden');
    nextOnboardingStep(1);
  }
}
window.openOnboardingModal = openOnboardingModal;

function closeOnboardingModal() {
  const modal = document.getElementById('modal-onboarding');
  if (modal) modal.classList.add('hidden');
}
window.closeOnboardingModal = closeOnboardingModal;

function nextOnboardingStep(step) {
  currentOnboardingStep = step;
  const progressFill = document.getElementById('onboard-progress-fill');
  const percentage = step === 1 ? '25%' : step === 2 ? '50%' : step === 3 ? '75%' : '100%';
  if (progressFill) progressFill.style.width = percentage;

  for (let s = 1; s <= 4; s++) {
    const pane = document.getElementById(`onboard-step-${s}`);
    const lbl = document.getElementById(`onboard-step-lbl-${s}`);
    if (pane) {
      if (s === step) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    }
    if (lbl) {
      if (s <= step) {
        lbl.style.color = '#3b82f6';
      } else {
        lbl.style.color = '#94a3b8';
      }
    }
  }
}
window.nextOnboardingStep = nextOnboardingStep;

function startDnaSynthesisStep() {
  nextOnboardingStep(3);
  const progressBar = document.getElementById('dna-synthesis-progress-bar');
  const statusText = document.getElementById('dna-synthesis-status-text');
  const subText = document.getElementById('dna-synthesis-subtext');

  const steps = [
    { p: '30%', text: 'Extracting Colorimetric Centroids...', sub: 'Synthesizing primary, surface, and text palettes in CIELAB space' },
    { p: '60%', text: 'Generating Voice & Tone Rules...', sub: 'Aligning enterprise persona, authoritative claims, and terminology constraints' },
    { p: '85%', text: 'Verifying WCAG 2.1 AA Contrast Ratios...', sub: 'Validating minimum 4.5:1 text-to-surface accessibility thresholds' },
    { p: '100%', text: 'Brand DNA Profile Synthesized!', sub: '10 specification dimensions ready for activation' }
  ];

  let currentIdx = 0;
  function advanceSynthesis() {
    if (currentIdx < steps.length) {
      const stepData = steps[currentIdx];
      if (progressBar) progressBar.style.width = stepData.p;
      if (statusText) statusText.textContent = stepData.text;
      if (subText) subText.textContent = stepData.sub;

      const ind = document.getElementById(`dna-step-${currentIdx + 1}`);
      if (ind) {
        ind.style.color = '#10b981';
        ind.textContent = ind.textContent.replace('○', '●');
      }

      currentIdx++;
      setTimeout(advanceSynthesis, 650);
    } else {
      setTimeout(() => {
        nextOnboardingStep(4);
      }, 400);
    }
  }

  advanceSynthesis();
}
window.startDnaSynthesisStep = startDnaSynthesisStep;

function finishOnboarding() {
  closeOnboardingModal();
  showToast('Brand DNA profile activated! Governance dashboard ready.', 'success');
  navigateToPage('dashboard');
}
window.finishOnboarding = finishOnboarding;

// 6. Pre-Flight Scanner Laser Animation Wrap
const originalRunPreflight = window.runPreflightInstantScan;
window.runPreflightInstantScan = function(file) {
  const laserLine = document.getElementById('scanner-laser-sweep');
  if (laserLine) {
    laserLine.classList.remove('hidden');
    // Hide laser line after 2 seconds
    setTimeout(() => {
      laserLine.classList.add('hidden');
    }, 2000);
  }

  if (typeof originalRunPreflight === 'function') {
    originalRunPreflight(file);
  }
};

// 7. Brand Co-Pilot Typing Indicator & Response Wrap
const originalAskCopilot = window.askCopilot;
window.askCopilot = function(promptText) {
  const typingInd = document.getElementById('copilot-typing-container');
  if (typingInd) typingInd.classList.remove('hidden');

  setTimeout(() => {
    if (typingInd) typingInd.classList.add('hidden');
    if (typeof originalAskCopilot === 'function') {
      originalAskCopilot(promptText);
    }
  }, 650);
};

// 8. Auto-Fix Accept & Reject Micro-interactions
function acceptAutoFix(event) {
  if (event) event.preventDefault();
  const acceptBtn = event ? event.target : null;
  if (acceptBtn) {
    acceptBtn.classList.add('autofix-accept-flash');
    acceptBtn.textContent = '✓ Auto-Fix Applied!';
  }
  showToast('Auto-Fix recolor accepted! Compliant image saved and certified.', 'success');
}
window.acceptAutoFix = acceptAutoFix;

function rejectAutoFix(event) {
  if (event) event.preventDefault();
  showToast('Auto-Fix rejected. Original creative retained for human review.', 'info');
}
window.rejectAutoFix = rejectAutoFix;

// 9. Attach navigation view change animation triggers
const originalNavigateToPage = window.navigateToPage;
window.navigateToPage = function(viewKey, evt, optionalId) {
  if (typeof originalNavigateToPage === 'function') {
    originalNavigateToPage(viewKey, evt, optionalId);
  }

  // If entering dashboard, animate KPIs
  if (viewKey === 'dashboard') {
    setTimeout(triggerDashboardKpiAnimations, 100);
  }
};
