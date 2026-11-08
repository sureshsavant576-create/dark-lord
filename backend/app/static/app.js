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

const API_BASE = '/api/v1';
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
  initTabs();
  initDropZone();
  initOnboarding();
  initReferenceScanning();
  initPaletteManagerControls();
  initColorStudio();
  initInspection();
  initSidebarState();
  loadProvidersStatus();
  loadBrands();
  loadRecentReport();
});
function switchMainView(view) {
  const landingView = document.getElementById('view-landing');
  const dashboardView = document.getElementById('view-dashboard');
  const btnLanding = document.getElementById('nav-btn-landing');
  const btnDev = document.getElementById('nav-btn-developer');
  const btnCo = document.getElementById('nav-btn-company');
  if (view === 'landing') {
    if (landingView) landingView.classList.remove('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');
    if (btnLanding) btnLanding.classList.add('active');
    if (btnDev) btnDev.classList.remove('active');
    if (btnCo) btnCo.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (view === 'developer') {
    if (landingView) landingView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.remove('hidden');
    if (btnLanding) btnLanding.classList.remove('active');
    if (btnDev) btnDev.classList.add('active');
    if (btnCo) btnCo.classList.remove('active');
    switchDashboardTab('tab-inspect');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (view === 'company') {
    if (landingView) landingView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.remove('hidden');
    if (btnLanding) btnLanding.classList.remove('active');
    if (btnDev) btnDev.classList.remove('active');
    if (btnCo) btnCo.classList.add('active');
    const btnAcc = document.getElementById('nav-btn-account');
    if (btnAcc) btnAcc.classList.remove('active');
    switchDashboardTab('tab-onboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (view === 'account') {
    if (landingView) landingView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.remove('hidden');
    if (btnLanding) btnLanding.classList.remove('active');
    if (btnDev) btnDev.classList.remove('active');
    if (btnCo) btnCo.classList.remove('active');
    const btnAcc = document.getElementById('nav-btn-account');
    if (btnAcc) btnAcc.classList.add('active');
    switchDashboardTab('tab-account');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
window.switchMainView = switchMainView;
function switchDashboardTab(tabId) {
  const landingView = document.getElementById('view-landing');
  const dashboardView = document.getElementById('view-dashboard');
  if (landingView) landingView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.remove('hidden');
  const panes = document.querySelectorAll('.dashboard-tab-pane');
  panes.forEach(p => p.classList.remove('active'));
  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add('active');

  const sideInspect = document.getElementById('side-tab-inspect');
  const sideOnboard = document.getElementById('side-tab-onboard');
  const sideAccount = document.getElementById('side-tab-account');
  const btnDev = document.getElementById('nav-btn-developer');
  const btnCo = document.getElementById('nav-btn-company');
  const btnAcc = document.getElementById('nav-btn-account');
  const btnLanding = document.getElementById('nav-btn-landing');

  if (sideInspect) sideInspect.classList.toggle('active', tabId === 'tab-inspect');
  if (sideOnboard) sideOnboard.classList.toggle('active', tabId === 'tab-onboard');
  if (sideAccount) sideAccount.classList.toggle('active', tabId === 'tab-account');

  if (btnDev) btnDev.classList.toggle('active', tabId === 'tab-inspect');
  if (btnCo) btnCo.classList.toggle('active', tabId === 'tab-onboard');
  if (btnAcc) btnAcc.classList.toggle('active', tabId === 'tab-account');
  if (btnLanding) btnLanding.classList.remove('active');

  if (tabId === 'tab-account') {
    renderAccountPage(currentAccountBrandId);
  }
}
window.switchDashboardTab = switchDashboardTab;
function scrollColorStudio() {
  const studio = document.getElementById('color-studio-container');
  if (studio) {
    studio.classList.remove('hidden');
    studio.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.scrollColorStudio = scrollColorStudio;
function scrollToTrackedReports() {
  const layout = document.getElementById('dashboard-layout');
  const floatBtn = document.getElementById('floating-activity-trigger');
  if (layout && layout.classList.contains('activity-hidden')) {
    layout.classList.remove('activity-hidden');
    if (floatBtn) floatBtn.classList.add('hidden');
    try { localStorage.setItem('sanket_activity_hidden', 'false'); } catch (e) {}
  }
  const panel = document.getElementById('dashboard-activity-panel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.scrollToTrackedReports = scrollToTrackedReports;
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
  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      updateFilePreview(fileInput.files[0]);
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
      triggerDeveloperColorPreFilter(file);
    } else if (filterPanel) {
      filterPanel.classList.add('hidden');
    }
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      fileInput.value = '';
      const thumb = document.getElementById('preview-thumbnail');
      const fallbackIcon = document.getElementById('preview-fallback-icon');
      if (thumb) { thumb.src = ''; thumb.classList.add('hidden'); }
      if (fallbackIcon) fallbackIcon.classList.remove('hidden');
      if (previewInfo) previewInfo.classList.add('hidden');
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
        if (prevName) prevName.textContent = b.brand_name;
        const prevTone = document.getElementById('prev-brand-tone');
        if (prevTone) prevTone.textContent = `Tone: ${(b.communication_tone || []).join(', ') || 'Standard'}`;
        const prevSummary = document.getElementById('prev-palette-summary');
        if (prevSummary) {
          const count = (b.approved_palette || []).length;
          prevSummary.textContent = `${count} Approved Color${count === 1 ? '' : 's'}`;
        }
        preview.classList.remove('hidden');
      };
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
  switchDashboardTab('tab-onboard');
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
      fileInput.value = '';
      if (obPreviewInfo) obPreviewInfo.classList.add('hidden');
      if (feedback) feedback.classList.add('hidden');
      const studio = document.getElementById('color-studio-container');
      if (studio) studio.classList.add('hidden');
    });
  }

  const handleScan = async (file) => {
    if (!file) return;

    if (obPreviewInfo) {
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

    let obTimer1 = setTimeout(() => {
      if (obProgressFill) obProgressFill.style.width = '55%';
      if (obProgressStatus) obProgressStatus.textContent = 'Extracting CIELAB centroids & whitespace density...';
      if (obProgressPercent) obProgressPercent.textContent = '55%';
      if (obStatusTip) obStatusTip.textContent = 'Quantizing 8-dominant color clusters and negative space...';
    }, 350);

    let obTimer2 = setTimeout(() => {
      if (obProgressFill) obProgressFill.style.width = '85%';
      if (obProgressStatus) obProgressStatus.textContent = 'Synthesizing voice guidelines & personality...';
      if (obProgressPercent) obProgressPercent.textContent = '85%';
      if (obStatusTip) obStatusTip.textContent = 'Detecting visual style and typography hierarchy...';
    }, 850);

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/brands/scan-reference`, {
        method: 'POST',
        body: formData
      });
      clearTimeout(obTimer1);
      clearTimeout(obTimer2);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const previewUrl = data.image_url || URL.createObjectURL(file);
      loadCreativeOnCanvas(previewUrl);
      renderExtractedColorStudio(data);

      if (obProgressFill) {
        obProgressFill.className = 'upload-progress-fill done';
        obProgressFill.style.width = '100%';
      }
      if (obProgressStatus) obProgressStatus.textContent = '✓ DNA Centroids Extracted & Loaded to Studio';
      if (obProgressPercent) obProgressPercent.textContent = '100%';
      if (obBadge && obBadgeText) {
        obBadge.className = 'upload-badge badge-success';
        obBadgeText.textContent = '✓ DNA Extracted';
      }
      if (obStatusTip) obStatusTip.textContent = `Extracted ${(data.extracted_palette || []).length} colors & brand guidelines. Ready to lock standards.`;
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
function initOnboarding() {
  const form = document.getElementById('onboarding-form');
  const btn = document.getElementById('btn-create-draft');
  if (!form || !btn) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<span>Saving & Locking Company Vibes...</span>';
    const editingId = document.getElementById('ob-editing-brand-id')?.value;
    const paletteHexArray = currentPalette.map(c => c.hex);
    if (paletteHexArray.length === 0) {
      toast('Please add at least one approved brand color in the Palette Manager.', 'warning');
      btn.disabled = false;
      btn.innerHTML = editingId ? '<span>Update Brand Profile</span>' : '<span>Save Brand Profile</span>';
      return;
    }
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
          confirmed_by: managerEmail
        };
        const confRes = await fetch(`${API_BASE}/brands/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(confirmPayload)
        });
        if (!confRes.ok) throw new Error(await confRes.text());
        const confirmed = await confRes.json();
        await loadBrands();
        toast(`Brand profile for '${confirmed.brand_name}' updated successfully.`, 'success');
        resetOnboardingForm();
        switchDashboardTab('tab-inspect');
        const brandSelect = document.getElementById('inspect-brand-select');
        if (brandSelect) {
          brandSelect.value = confirmed.brand_id;
          brandSelect.dispatchEvent(new Event('change'));
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
        confirmed_by: managerEmail
      };
      const confRes = await fetch(`${API_BASE}/brands/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmPayload)
      });
      if (!confRes.ok) throw new Error(await confRes.text());
      const confirmed = await confRes.json();
      await loadBrands();
      toast(`Brand profile for '${confirmed.brand_name}' created successfully.`, 'success');
      resetOnboardingForm();
      switchDashboardTab('tab-inspect');
      const brandSelect = document.getElementById('inspect-brand-select');
      if (brandSelect) {
        brandSelect.value = confirmed.brand_id;
        brandSelect.dispatchEvent(new Event('change'));
      }
    } catch (err) {
      toast(`Error saving brand profile: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      const editingIdNow = document.getElementById('ob-editing-brand-id')?.value;
      btn.innerHTML = editingIdNow ? '<span>Update Brand Profile</span>' : '<span>Save Brand Profile</span>';
    }
  });
}
function initInspection() {
  const form = document.getElementById('inspection-form');
  const btn = document.getElementById('btn-run-inspect');
  const emptyState = document.getElementById('inspection-empty-state');
  const loadingState = document.getElementById('inspection-loading-state');
  const resultsView = document.getElementById('inspection-results-view');
  const inlineStatus = document.getElementById('inspect-inline-status');
  const inlineText = document.getElementById('inline-status-text');
  const reportPanel = document.getElementById('report-panel');
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
    const formData = new FormData();
    if (activeInputMode === 'text') {
      const textVal = copyTextarea ? copyTextarea.value.trim() : '';
      if (!textVal) {
        toast('Please enter advertising copy or text to inspect.', 'warning');
        return;
      }
      formData.append('copy_text', textVal);
    } else {
      if (!fileInput.files || fileInput.files.length === 0) {
        toast('Please select or drop a poster or graphic asset to inspect.', 'warning');
        return;
      }
      formData.append('file', fileInput.files[0]);
    }
    const uploadBadge = document.getElementById('preview-upload-badge');
    const uploadBadgeText = document.getElementById('preview-upload-badge-text');
    const statusTip = document.getElementById('preview-status-tip');
    const progressFill = document.getElementById('upload-progress-fill');
    const progressStatusText = document.getElementById('upload-progress-status-text');
    const progressPercent = document.getElementById('upload-progress-percent');

    if (emptyState) emptyState.classList.add('hidden');
    if (resultsView) resultsView.classList.add('hidden');
    if (loadingState) loadingState.classList.remove('hidden');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-spinner"></span> <span>Uploading &amp; Inspecting...</span>';
    }

    if (uploadBadge && uploadBadgeText) {
      uploadBadge.className = 'upload-badge badge-uploading';
      uploadBadgeText.textContent = 'Uploading & Analyzing...';
    }
    if (statusTip) {
      statusTip.textContent = 'Transmitting creative payload to server and executing multimodal inspection...';
    }
    if (progressFill) {
      progressFill.className = 'upload-progress-fill uploading';
      progressFill.style.width = '20%';
    }
    if (progressStatusText) progressStatusText.textContent = 'Transmitting creative payload to server...';
    if (progressPercent) progressPercent.textContent = '20%';

    if (inlineStatus) {
      inlineStatus.className = 'inspect-inline-status status-running';
      if (inlineText) inlineText.textContent = 'Analyzing feature vectors and verifying brand compliance...';
      inlineStatus.classList.remove('hidden');
    }
    let stepTimer1 = null, stepTimer2 = null;
    const p1 = document.getElementById('step-pill-1');
    const p2 = document.getElementById('step-pill-2');
    const p3 = document.getElementById('step-pill-3');
    const stageTxt = document.getElementById('loading-stage-text');
    if (p1) p1.className = 'step-pill active';
    if (p2) p2.className = 'step-pill';
    if (p3) p3.className = 'step-pill';
    if (stageTxt) stageTxt.textContent = 'Step 1: Extracting CIELAB color centroids & layout density vectors...';
    stepTimer1 = setTimeout(() => {
      if (p1) p1.className = 'step-pill done';
      if (p2) p2.className = 'step-pill active';
      if (stageTxt) stageTxt.textContent = 'Step 2: Scanning communication vocabulary & prohibited claims...';
      if (progressFill) progressFill.style.width = '70%';
      if (progressStatusText) progressStatusText.textContent = 'Scanning vocabulary & feature vectors...';
      if (progressPercent) progressPercent.textContent = '70%';
    }, 600);
    stepTimer2 = setTimeout(() => {
      if (p2) p2.className = 'step-pill done';
      if (p3) p3.className = 'step-pill active';
      if (stageTxt) stageTxt.textContent = 'Step 3: Synthesizing multimodal aesthetic brand alignment...';
      if (progressFill) progressFill.style.width = '90%';
      if (progressStatusText) progressStatusText.textContent = 'Multimodal Gemini AI analysis running...';
      if (progressPercent) progressPercent.textContent = '90%';
    }, 1400);
    try {
      const res = await fetch(`${API_BASE}/inspect/${brandId}`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errDetail = await res.text();
        throw new Error(errDetail);
      }
      const report = await res.json();
      renderInspectionReport(report);
      loadRecentReport();

      if (progressFill) {
        progressFill.className = 'upload-progress-fill';
        progressFill.style.width = '100%';
      }
      if (progressStatusText) progressStatusText.textContent = 'Inspection complete — Logged to Tracked Inspections';
      if (progressPercent) progressPercent.textContent = '100%';
      if (uploadBadge && uploadBadgeText) {
        uploadBadge.className = 'upload-badge badge-success';
        uploadBadgeText.textContent = '✓ Inspected & Verified';
      }
      if (statusTip) {
        statusTip.textContent = `Audit complete (${report.verdict}). Logged to Tracked Inspections on the right.`;
      }

      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-success';
        const matchPct = report.overall_score !== null && report.overall_score !== undefined ? report.overall_score : report.deterministic_score;
        if (inlineText) inlineText.innerHTML = `Audit complete: <strong>${matchPct}% Match (${report.verdict})</strong> — Logged to Tracked Inspections`;
      }
      if (typeof toggleActivityPanel === 'function') {
        const actPanel = document.getElementById('dashboard-activity-panel');
        if (actPanel && actPanel.classList.contains('collapsed')) {
          toggleActivityPanel(false);
        }
      }
    } catch (err) {
      if (progressFill) {
        progressFill.className = 'upload-progress-fill';
        progressFill.style.width = '100%';
      }
      if (progressStatusText) progressStatusText.textContent = 'Inspection failed';
      if (progressPercent) progressPercent.textContent = 'Error';
      if (uploadBadge && uploadBadgeText) {
        uploadBadge.className = 'upload-badge badge-error';
        uploadBadgeText.textContent = '⚠️ Inspection Failed';
      }
      if (statusTip) {
        statusTip.textContent = `Error: ${err.message}`;
      }

      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-error';
        if (inlineText) inlineText.textContent = `⚠️ Inspection Error: ${err.message}`;
      } else {
        alert(`Inspection Error: ${err.message}`);
      }
      if (emptyState) emptyState.classList.remove('hidden');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      if (p1) p1.className = 'step-pill done';
      if (p2) p2.className = 'step-pill done';
      if (p3) p3.className = 'step-pill done';
      if (loadingState) loadingState.classList.add('hidden');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Run Brand Inspection</span>';
      }
    }
  });
}
function renderInspectionReport(report) {
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

  toast(isHidden ? 'Side content hidden — Distraction-free workspace' : 'Side content expanded');
}
window.toggleSidebar = toggleSidebar;

function toggleActivityPanel() {
  const layout = document.getElementById('dashboard-layout');
  const floatBtn = document.getElementById('floating-activity-trigger');
  if (!layout) return;

  const isHidden = layout.classList.toggle('activity-hidden');
  if (floatBtn) {
    if (isHidden) {
      floatBtn.classList.remove('hidden');
    } else {
      floatBtn.classList.add('hidden');
    }
  }

  try {
    localStorage.setItem('sanket_activity_hidden', isHidden ? 'true' : 'false');
  } catch (e) {}

  toast(isHidden ? 'Tracked reports hidden — Expanded workspace' : 'Tracked reports expanded');
}
window.toggleActivityPanel = toggleActivityPanel;

function initSidebarState() {
  try {
    const savedSidebar = localStorage.getItem('sanket_sidebar_hidden');
    if (savedSidebar === 'true') {
      const layout = document.getElementById('dashboard-layout');
      const floatBtn = document.getElementById('floating-sidebar-trigger');
      if (layout) layout.classList.add('sidebar-hidden');
      if (floatBtn) floatBtn.classList.remove('hidden');
    }
    const savedActivity = localStorage.getItem('sanket_activity_hidden');
    if (savedActivity === 'true') {
      const layout = document.getElementById('dashboard-layout');
      const floatActBtn = document.getElementById('floating-activity-trigger');
      if (layout) layout.classList.add('activity-hidden');
      if (floatActBtn) floatActBtn.classList.remove('hidden');
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
    const initials = (b.brand_name || 'CO').trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
    avatarBox.textContent = initials || 'CO';
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
  const b = brandsMap[currentAccountBrandId];
  const select = document.getElementById('inspect-brand-select');
  if (select) {
    select.value = currentAccountBrandId;
    select.dispatchEvent(new Event('change'));
  }
  switchDashboardTab('tab-inspect');
  toast(`Selected '${b ? b.brand_name : currentAccountBrandId}' for verification in Check Vibe.`);
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
  const brandId = select ? select.value : currentAccountBrandId;
  if (brandId) {
    renderAccountPage(brandId);
  }
  switchDashboardTab('tab-account');
}
window.viewSelectedBrandInAccount = viewSelectedBrandInAccount;
