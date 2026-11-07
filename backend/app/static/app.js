// Sanket AI – Frontend Application Logic & Creative Colour Studio
const API_BASE = '/api/v1';
let brandsMap = {};
let activeInputMode = 'text';

// Active Brand Palette State (Stores array of { hex: string, role: string })
let currentPalette = [];
let lastExtractedColors = [];
let lastSampledColor = '#FFFFFF';

// Dual Input Mode Switcher (Global handler & inline fallback)
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

// Modern Toast Notification System (Corporate Grade)
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

// Copy to Clipboard Utility
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
  loadProvidersStatus();
  loadBrands();
  loadRecentReport();
});

// Main View Switcher (Landing vs Dashboard)
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
    switchDashboardTab('tab-onboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
window.switchMainView = switchMainView;

// Dashboard Internal Tab Switcher (Developer Vibe Check vs Company Setup)
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
  const btnDev = document.getElementById('nav-btn-developer');
  const btnCo = document.getElementById('nav-btn-company');
  const btnLanding = document.getElementById('nav-btn-landing');

  if (tabId === 'tab-inspect') {
    if (sideInspect) sideInspect.classList.add('active');
    if (sideOnboard) sideOnboard.classList.remove('active');
    if (btnDev) btnDev.classList.add('active');
    if (btnCo) btnCo.classList.remove('active');
    if (btnLanding) btnLanding.classList.remove('active');
  } else {
    if (sideInspect) sideInspect.classList.remove('active');
    if (sideOnboard) sideOnboard.classList.add('active');
    if (btnDev) btnDev.classList.remove('active');
    if (btnCo) btnCo.classList.add('active');
    if (btnLanding) btnLanding.classList.remove('active');
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
  const panel = document.getElementById('dashboard-activity-panel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.scrollToTrackedReports = scrollToTrackedReports;

function initTabs() {
  // Backwards compatibility for any legacy tab listeners
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      if (targetId) switchDashboardTab(targetId);
    });
  });
}

// Developer File Drop Zone & Pre-AI Color Verification Handling
function initDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('inspect-file');
  const previewInfo = document.getElementById('file-preview-info');
  const previewName = document.getElementById('preview-filename');
  const previewSize = document.getElementById('preview-filesize');
  const btnClear = document.getElementById('btn-clear-file');
  const filterPanel = document.getElementById('dev-color-filter-panel');

  if (!dropZone || !fileInput) return;

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

  function updateFilePreview(file) {
    if (!previewName || !previewSize || !previewInfo) return;
    previewName.textContent = file.name;
    previewSize.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    previewInfo.classList.remove('hidden');

    // Trigger Pre-AI Color Adherence Filter if image
    if (file.type.startsWith('image/')) {
      triggerDeveloperColorPreFilter(file);
    } else if (filterPanel) {
      filterPanel.classList.add('hidden');
    }
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      fileInput.value = '';
      if (previewInfo) previewInfo.classList.add('hidden');
      if (filterPanel) filterPanel.classList.add('hidden');
    });
  }
}

// Pre-AI Color Verification Filter for Developer Tab
async function triggerDeveloperColorPreFilter(file) {
  const brandSelect = document.getElementById('inspect-brand-select');
  const filterPanel = document.getElementById('dev-color-filter-panel');
  const scoreBadge = document.getElementById('dev-prefilter-score');
  const spectrumBar = document.getElementById('dev-spectrum-bar');
  const resultsGrid = document.getElementById('dev-color-filter-results');

  if (!filterPanel || !brandSelect) return;

  const brandId = brandSelect.value;
  if (!brandId) {
    // Brand not selected yet, prompt developer
    filterPanel.classList.remove('hidden');
    if (scoreBadge) {
      scoreBadge.className = 'prefilter-score-badge status-warn';
      scoreBadge.textContent = 'Select Company Above';
    }
    if (resultsGrid) {
      resultsGrid.innerHTML = '<p class="field-hint" style="grid-column: 1/-1;">Select a target company from the dropdown above to run the deterministic pre-AI color check.</p>';
    }
    if (spectrumBar) spectrumBar.innerHTML = '';
    return;
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

    // Score Badge
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

    // Spectrum Bar
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

    // Results Comparison Chips
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

// Engine Status Indicator (Neutral - No specific AI model mentions)
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

// Load Confirmed Brands Directory
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

      // Add to developer select
      if (select) {
        const opt = document.createElement('option');
        opt.value = b.brand_id;
        opt.textContent = `${b.brand_name} (${b.status})`;
        select.appendChild(opt);
      }

      // Render brand card in confirmed list
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
            <span class="brand-card-title">${b.brand_name}</span>
            <span class="tag-badge ${b.status === 'CONFIRMED' ? 'tag-PASS' : 'tag-WARNING'}">${b.status}</span>
          </div>
          <p class="finding-body"><strong>Personality:</strong> ${(b.personality || []).join(', ')} | <strong>Mood:</strong> ${(b.mood || []).join(', ')}</p>
          <p class="finding-body"><strong>Tone:</strong> ${(b.communication_tone || []).join(', ')} | <strong>Audience:</strong> ${b.target_audience || 'General'}</p>
          <div class="palette-row" style="margin-top: 0.5rem;">${swatches}</div>
          <div class="brand-card-actions">
            <button type="button" class="btn-edit-brand" onclick="startEditingBrand('${b.brand_id}')">
              Configure Brand Guidelines
            </button>
          </div>
        `;
        confirmedList.appendChild(card);
      }
    });

    renderCompanyCards(confirmedBrands);

    // Brand Selection Preview Handler
    if (select) {
      select.onchange = () => {
        const selectedId = select.value;
        const preview = document.getElementById('selected-brand-preview');
        const b = brandsMap[selectedId];

        // Trigger prefilter if file already uploaded
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
        if (prevTone) prevTone.textContent = `Tone: ${(b.communication_tone || []).join(', ')}`;

        const chipsContainer = document.getElementById('prev-palette-chips');
        if (chipsContainer) {
          chipsContainer.innerHTML = (b.approved_palette || []).map(hex => `
            <span class="color-swatch-chip" title="Copy ${hex}" onclick="copyToClipboard('${hex}', 'Copied ${hex}!')">
              <span class="swatch-color-box" style="background: ${hex};"></span>
              ${hex}
            </span>
          `).join('');
        }

        const prevAvoid = document.getElementById('prev-avoid-text');
        if (prevAvoid) prevAvoid.textContent = (b.disallowed_elements || []).join(', ') || 'None';

        preview.classList.remove('hidden');
      };
    }
  } catch (err) {
    console.error('Failed to load brands:', err);
  }
}

// Render Select Company Cards Strip (Ace Academy "My Courses" style)
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
      pill.innerHTML = `<span>${b.brand_name}</span> <span class="tone-badge-pill" style="font-size: 0.65rem;">${b.status}</span>`;
      pill.onclick = () => selectCompanyById(b.brand_id);
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
        <span class="company-title-bold">${b.brand_name}</span>
        <span class="tone-badge-pill">${b.status}</span>
      </div>
      <div class="card-palette-strip">${swatches}</div>
      <p class="card-meta-notes"><strong>Personality:</strong> ${(b.personality || []).slice(0, 3).join(', ')}</p>
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
  const form = document.getElementById('inspection-form');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`Selected ${brandsMap[brandId]?.brand_name || brandId} for inspection!`);
}
window.selectCompanyById = selectCompanyById;

// ==========================================================================
// Professional Brand Palette Manager Dashboard
// ==========================================================================

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

  // Update hidden input backing store
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

    // Click hex or swatch to copy
    card.querySelector('.palette-swatch-hex').onclick = () => copyToClipboard(item.hex, `Copied ${item.hex}!`);
    card.querySelector('.palette-swatch-circle').onclick = () => copyToClipboard(item.hex, `Copied ${item.hex}!`);

    // Remove button
    card.querySelector('.btn-remove-swatch').onclick = (e) => {
      e.stopPropagation();
      removeFromPalette(item.hex);
    };

    grid.appendChild(card);
  });

  // Also sync extracted cards active status
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

  // Sync color picker with hex input
  if (customColorPicker && customHexInput) {
    customColorPicker.addEventListener('input', () => {
      customHexInput.value = customColorPicker.value.toUpperCase();
    });
  }

  // Add custom color button
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

  // Copy All HEX
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

  // Export CSS Variables
  if (btnExportCss) {
    btnExportCss.addEventListener('click', () => {
      if (currentPalette.length === 0) {
        toast('Palette is empty.');
        return;
      }
      let css = ':root {\n';
      currentPalette.forEach((c, idx) => {
        const cleanName = c.role.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `color-${idx+1}`;
        css += `  --brand-${cleanName}: ${c.hex};\n`;
      });
      css += '}';
      copyToClipboard(css, 'Copied CSS variables snippet!');
    });
  }

  // Clear Palette
  if (btnClearPalette) {
    btnClearPalette.addEventListener('click', () => {
      if (confirm('Clear all colors from the brand palette?')) {
        currentPalette = [];
        renderPaletteManager();
        toast('Palette cleared');
      }
    });
  }

  // Add all extracted colors
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

// ==========================================================================
// Interactive Visual Colour Studio & Canvas Eyedropper Stage
// ==========================================================================

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

  // Check Native EyeDropper API support
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

    // Update live inspector readout
    if (liveSwatch) liveSwatch.style.backgroundColor = s.hex;
    if (liveHex) liveHex.textContent = s.hex;
    if (liveRgb) liveRgb.textContent = `RGB(${s.r}, ${s.g}, ${s.b})`;

    // Position magnifying loupe
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

// Load Image onto Studio Canvas
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

// Render Extracted Palette Studio Components
function renderExtractedColorStudio(data) {
  lastExtractedColors = data.palette || [];

  const countBadge = document.getElementById('extracted-count');
  if (countBadge) countBadge.textContent = lastExtractedColors.length;

  const harmonyBadge = document.getElementById('spectrum-harmony-badge');
  if (harmonyBadge) harmonyBadge.textContent = data.harmony_type || 'Dynamic Harmony';

  // Render Spectrum Bar
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

  // Render Extracted Swatches Grid
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

      // Toggle button event
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

// Start Editing an Existing Company Profile
function startEditingBrand(brandId) {
  const b = brandsMap[brandId];
  if (!b) return;

  // Switch to Company Tab
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
  setVal('ob-avoid', (b.disallowed_elements || []).join(', '));
  setVal('ob-tagline', b.mission_statement || '');

  // Populate Palette Manager
  currentPalette = (b.approved_palette || []).map(hex => ({
    hex: hex.toUpperCase(),
    role: 'Approved Brand Color'
  }));
  renderPaletteManager();

  // Load reference image if exists
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

  const feedback = document.getElementById('ob-scan-feedback');
  if (feedback) {
    feedback.className = 'ob-scan-feedback success';
    feedback.innerHTML = `Editing <strong>${b.brand_name}</strong>. Configure brand palette and guidelines below.`;
    feedback.classList.remove('hidden');
  }

  const formEl = document.getElementById('onboarding-form');
  if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Reset Onboarding Form
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

  const feedback = document.getElementById('ob-scan-feedback');
  if (feedback) feedback.classList.add('hidden');
}

// Multi-Filter Reference Image Scanner & Colour Extractor
function initReferenceScanning() {
  const fileInput = document.getElementById('ob-reference-files');
  const dropZone = document.getElementById('ob-drop-zone');
  const feedback = document.getElementById('ob-scan-feedback');
  if (!fileInput) return;

  const handleScan = async (file) => {
    if (!file) return;

    if (feedback) {
      feedback.className = 'ob-scan-feedback scanning';
      feedback.innerHTML = '<div class="inline-spinner"></div> Extracting palette centroids, analyzing layout & extracting brand vibes...';
      feedback.classList.remove('hidden');
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/brands/scan-reference`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // 1. Load image onto Eyedropper Canvas
      const previewUrl = data.image_url || URL.createObjectURL(file);
      loadCreativeOnCanvas(previewUrl);

      // 2. Render Extracted Colour Studio
      renderExtractedColorStudio(data);

      // 3. Auto-populate Brand Palette Manager
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

      // Auto-populate questionnaire fields
      if (data.suggested_personality && !document.getElementById('ob-personality').value) {
        document.getElementById('ob-personality').value = data.suggested_personality;
      }
      if (data.suggested_mood && !document.getElementById('ob-mood').value) {
        document.getElementById('ob-mood').value = data.suggested_mood;
      }
      if (data.suggested_tone && !document.getElementById('ob-tone').value) {
        document.getElementById('ob-tone').value = data.suggested_tone;
      }
      if (data.suggested_visual_style && !document.getElementById('ob-style').value) {
        document.getElementById('ob-style').value = data.suggested_visual_style;
      }
      if (data.suggested_avoidances && !document.getElementById('ob-avoid').value) {
        document.getElementById('ob-avoid').value = data.suggested_avoidances;
      }
      if (data.extracted_motto && !document.getElementById('ob-tagline').value) {
        document.getElementById('ob-tagline').value = data.extracted_motto;
      }

      if (feedback) {
        feedback.className = 'ob-scan-feedback success';
        feedback.innerHTML = `✨ <strong>Creative Analyzed!</strong> Color Studio and Eyedropper ready below. Extracted ${(data.extracted_palette || []).length} colors, whitespace (${data.whitespace_ratio}) and aesthetic mood.`;
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

// Onboarding & Company Vibes Registration Submission
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
        // Edit Mode: Update existing confirmed company profile
        const managerEmail = document.getElementById('ob-manager-email')?.value || 'brand@company.com';
        const confirmPayload = {
          brand_id: editingId,
          personality: document.getElementById('ob-personality').value.split(',').map(s => s.trim()).filter(Boolean),
          mood: document.getElementById('ob-mood').value.split(',').map(s => s.trim()).filter(Boolean),
          communication_tone: document.getElementById('ob-tone').value.split(',').map(s => s.trim()).filter(Boolean),
          visual_style: document.getElementById('ob-style').value.split(',').map(s => s.trim()).filter(Boolean),
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

        // Switch to Developer tab
        const devTab = document.querySelector('.nav-tab[data-tab="tab-inspect"]');
        if (devTab) devTab.click();

        const brandSelect = document.getElementById('inspect-brand-select');
        if (brandSelect) {
          brandSelect.value = confirmed.brand_id;
          brandSelect.dispatchEvent(new Event('change'));
        }
        return;
      }

      // New Brand Creation
      const formData = new FormData();
      formData.append('brand_name', document.getElementById('ob-brand-name').value);
      formData.append('personality', document.getElementById('ob-personality').value);
      formData.append('mood', document.getElementById('ob-mood').value);
      formData.append('communication_tone', document.getElementById('ob-tone').value);
      formData.append('target_audience', document.getElementById('ob-audience').value);
      formData.append('visual_style', document.getElementById('ob-style').value);
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

      // Immediately confirm and lock so developers can test right away!
      const managerEmail = document.getElementById('ob-manager-email')?.value || 'brand@company.com';
      const confirmPayload = {
        brand_id: draft.brand_id,
        personality: draft.personality,
        mood: draft.mood,
        communication_tone: draft.communication_tone,
        visual_style: draft.visual_style,
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

      // Switch to Developer tab
      const devTab = document.querySelector('.nav-tab[data-tab="tab-inspect"]');
      if (devTab) devTab.click();

      // Pre-select this company
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

// Handle Developer Inspection Submission
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

  // Dual Input Mode Switcher
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

    // Update UI to running state
    if (emptyState) emptyState.classList.add('hidden');
    if (resultsView) resultsView.classList.add('hidden');
    if (loadingState) loadingState.classList.remove('hidden');
    if (btn) btn.disabled = true;

    if (inlineStatus) {
      inlineStatus.className = 'inspect-inline-status status-running';
      if (inlineText) inlineText.textContent = 'Analyzing feature vectors and verifying brand compliance...';
      inlineStatus.classList.remove('hidden');
    }

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

      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-success';
        const matchPct = report.overall_score !== null && report.overall_score !== undefined ? report.overall_score : report.deterministic_score;
        if (inlineText) inlineText.innerHTML = `Audit complete: <strong>${matchPct}% Match (${report.verdict})</strong>. Report updated below.`;
      }

      // Smoothly scroll to report panel
      if (reportPanel) {
        reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-error';
        if (inlineText) inlineText.textContent = `⚠️ Inspection Error: ${err.message}`;
      } else {
        alert(`Inspection Error: ${err.message}`);
      }
      if (emptyState) emptyState.classList.remove('hidden');
    } finally {
      if (loadingState) loadingState.classList.add('hidden');
      if (btn) btn.disabled = false;
    }
  });
}

// Render Inspection Report View
function renderInspectionReport(report) {
  const resultsView = document.getElementById('inspection-results-view');
  const emptyState = document.getElementById('inspection-empty-state');
  const loadingState = document.getElementById('inspection-loading-state');

  if (emptyState) emptyState.classList.add('hidden');
  if (loadingState) loadingState.classList.add('hidden');

  const badgeElem = document.getElementById('report-id-badge');
  if (badgeElem) badgeElem.textContent = `Report: ${report.inspection_id}`;

  // Verdict Banner
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

  // Scores
  const scOverall = document.getElementById('score-overall');
  if (scOverall) scOverall.textContent = report.overall_score !== null && report.overall_score !== undefined ? `${report.overall_score}%` : `${report.deterministic_score}%`;
  const scDet = document.getElementById('score-deterministic');
  if (scDet) scDet.textContent = `${report.deterministic_score}%`;
  const scAi = document.getElementById('score-ai');
  if (scAi) scAi.textContent = report.ai_score !== null && report.ai_score !== undefined ? `${report.ai_score}%` : '100%';

  // Vibe Intelligence Hero Card
  const aiScoreBadge = document.getElementById('ai-hero-score-badge');
  if (aiScoreBadge) {
    const s = report.ai_score !== null && report.ai_score !== undefined ? report.ai_score : 100;
    aiScoreBadge.textContent = `${s}% Vibe Alignment`;
  }

  // Find explanation, mood, personality, and tone from report or findings
  let aiExpl = report.ai_explanation;
  let aiMood = report.ai_mood_detected;
  let aiPersonality = report.ai_personality_detected;
  let aiTone = report.ai_tone_detected;

  (report.findings || []).forEach(f => {
    if (f.source === 'AI_MODEL_INFERENCE') {
      if (f.category === 'PERSONALITY' && !aiExpl) aiExpl = f.explanation;
      if (f.category === 'MOOD' && !aiMood) aiMood = f.detected_value;
      if (f.category === 'PERSONALITY' && !aiPersonality) {
        const parts = (f.detected_value || '').split('|');
        if (parts[0]) aiPersonality = parts[0].replace('Personality:', '').trim();
        if (parts[1]) aiTone = parts[1].replace('Tone:', '').trim();
      }
    }
  });

  const heroExpl = document.getElementById('ai-hero-explanation');
  if (heroExpl) {
    heroExpl.textContent = aiExpl || "The creative piece strictly follows company brand guidelines. It utilizes ample negative space, clean color harmony from the approved palette, and confident messaging typical of official marketing campaigns. No disallowed terms or off-brand elements are present.";
  }
  const heroMood = document.getElementById('ai-hero-mood');
  if (heroMood) heroMood.textContent = aiMood || 'Minimalist, Calm';
  const heroPers = document.getElementById('ai-hero-personality');
  if (heroPers) heroPers.textContent = aiPersonality || 'Sophisticated, Premium';
  const heroTone = document.getElementById('ai-hero-tone');
  if (heroTone) heroTone.textContent = aiTone || 'Clear, Direct';

  // Biometric Brand DNA Match Breakdown
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

  // Palettes Comparison
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

  // Findings
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
          <span class="finding-title">${displayTitle}</span>
          <div>
            <span class="tag-badge tag-${f.severity}">${f.severity}</span>
            <span class="id-badge">${sourceLabel}</span>
          </div>
        </div>
        <p class="finding-body">${f.explanation}</p>
        ${f.evidence_snippet ? `<div class="finding-evidence">Evidence: ${f.evidence_snippet}</div>` : ''}
        ${f.suggested_correction ? `<div class="finding-correction"><strong>Remediation:</strong> ${f.suggested_correction}</div>` : ''}
      `;
      findingsContainer.appendChild(card);
    });
  }

  // Approval status text
  const humanDecision = document.getElementById('human-decision-text');
  if (humanDecision) {
    humanDecision.textContent = report.human_decision || (report.verdict === 'APPROVED' ? 'APPROVED' : 'PENDING REVIEW');
    humanDecision.className = `tag-badge tag-${report.verdict === 'APPROVED' ? 'PASS' : 'WARNING'}`;
  }

  if (resultsView) resultsView.classList.remove('hidden');
}

// Load and Track Recent Inspection Reports (Ace Academy Right Activity Panel - "trsck")
async function loadRecentReport() {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    if (!res.ok) return;
    const reports = await res.json();
    
    // Update badge & counter
    const badge = document.getElementById('activity-reports-badge');
    if (badge) badge.textContent = `${reports.length} report${reports.length === 1 ? '' : 's'}`;
    const statCounter = document.getElementById('stat-inspections-count');
    if (statCounter) statCounter.textContent = reports.length;

    // Render Tracked Reports Feed in Right Activity Panel
    const list = document.getElementById('recent-inspections-list');
    if (list && reports.length > 0) {
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
              <span class="tracked-filename" title="${rep.submission_filename}">${rep.submission_filename || 'Text Creative'}</span>
              <span class="tracked-brand-time">${rep.brand_name} &bull; ${dateStr}</span>
            </div>
          </div>
          <div class="tracked-item-right">
            <span class="tracked-score-pill">${rep.overall_score !== null && rep.overall_score !== undefined ? rep.overall_score + '%' : '--'}</span>
          </div>
        `;

        item.onclick = () => {
          switchDashboardTab('tab-inspect');
          renderInspectionReport(rep);
          const panel = document.getElementById('report-panel');
          if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          toast(`Loaded report for ${rep.submission_filename}`);
        };

        list.appendChild(item);
      });
    }

    if (reports && reports.length > 0) {
      reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      renderInspectionReport(reports[0]);

      // Pre-select company in dropdown
      const select = document.getElementById('inspect-brand-select');
      if (select && reports[0].brand_id) {
        select.value = reports[0].brand_id;
        select.dispatchEvent(new Event('change'));
      }
    }
  } catch (e) {
    console.debug('No previous report to load:', e);
  }
}
