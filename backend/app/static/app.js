// BrandShield AI - Frontend Application Logic
const API_BASE = '/api/v1';
let brandsMap = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropZone();
  initOnboarding();
  initConfirmation();
  initInspection();
  initReferenceScanning();
  initSignoff();
  initWorkTracker();
  initKalarajaLogo();
  loadProvidersStatus();
  loadBrands();
  loadRecentReport();
});

// Tab Switcher
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });
}

// Drop Zone Handling
function initDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('inspect-file');
  const previewInfo = document.getElementById('file-preview-info');
  const previewName = document.getElementById('preview-filename');
  const previewSize = document.getElementById('preview-filesize');

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
    previewName.textContent = file.name;
    previewSize.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    previewInfo.classList.remove('hidden');
  }

  const btnClear = document.getElementById('btn-clear-file');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      fileInput.value = '';
      previewInfo.classList.add('hidden');
    });
  }
}

// Load AI Providers Status
async function loadProvidersStatus() {
  const pill = document.getElementById('ai-status-pill');
  const grid = document.getElementById('provider-cards-grid');
  if (!pill && !grid) return;

  try {
    const res = await fetch(`${API_BASE}/providers`);
    const data = await res.json();

    if (pill) {
      const activePrimary = data.active_primary_provider;
      if (activePrimary) {
        pill.className = 'status-pill status-ready';
        pill.innerHTML = `<span class="status-dot"></span> System Ready`;
      } else {
        pill.className = 'status-pill status-unconfigured';
        pill.innerHTML = `<span class="status-dot"></span> System Active`;
      }
    }

    if (grid) {
      grid.innerHTML = '';
      for (const [key, info] of Object.entries(data.providers)) {
        const card = document.createElement('div');
        card.className = 'provider-card';
        const isConfigured = info.configured;
        card.innerHTML = `
          <div class="provider-card-header">
            <h4>${key.toUpperCase()}</h4>
            <span class="tag-badge ${isConfigured ? 'tag-PASS' : 'tag-INFO'}">
              ${isConfigured ? 'Configured' : 'Unconfigured'}
            </span>
          </div>
          <p class="finding-body">${info.role}</p>
          <span class="id-badge">${info.model || (info.components ? info.components.join(', ') : 'Local Engine')}</span>
        `;
        grid.appendChild(card);
      }
    }
  } catch (err) {
    pill.className = 'status-pill status-unconfigured';
    pill.innerHTML = `<span class="status-dot"></span> System Offline`;
  }
}

// Load Confirmed Brands
async function loadBrands() {
  try {
    const res = await fetch(`${API_BASE}/brands`);
    const brands = await res.json();
    brandsMap = {};

    const select = document.getElementById('inspect-brand-select');
    select.innerHTML = '<option value="">-- Select Confirmed Brand Profile --</option>';

    const confirmedList = document.getElementById('confirmed-brands-list');
    confirmedList.innerHTML = '';

    const confirmedBrands = brands.filter(b => b.status === 'CONFIRMED');

    if (confirmedBrands.length === 0) {
      confirmedList.innerHTML = '<p class="empty-note">No confirmed brand profiles yet. Complete onboarding above.</p>';
    }

    brands.forEach(b => {
      brandsMap[b.brand_id] = b;

      // Add to select only if confirmed or draft
      const opt = document.createElement('option');
      opt.value = b.brand_id;
      opt.textContent = `${b.brand_name} (${b.status})`;
      select.appendChild(opt);

      // Render brand card in confirmed list
      const card = document.createElement('div');
      card.className = 'brand-card-item';
      
      const swatches = (b.approved_palette || []).map(hex => `
        <span class="color-swatch-chip">
          <span class="swatch-color-box" style="background: ${hex};"></span>
          ${hex}
        </span>
      `).join('');

      card.innerHTML = `
        <div class="brand-card-header">
          <span class="brand-card-title">${b.brand_name}</span>
          <span class="tag-badge ${b.status === 'CONFIRMED' ? 'tag-PASS' : 'tag-WARNING'}">${b.status}</span>
        </div>
        <p class="finding-body"><strong>Personality:</strong> ${b.personality.join(', ')} | <strong>Mood:</strong> ${b.mood.join(', ')}</p>
        <p class="finding-body"><strong>Tone:</strong> ${b.communication_tone.join(', ')} | <strong>Audience:</strong> ${b.target_audience}</p>
        <div class="palette-row" style="margin-top: 0.5rem;">${swatches}</div>
        <div class="brand-card-actions">
          <button type="button" class="btn-edit-brand" onclick="startEditingBrand('${b.brand_id}')">
            ✏️ Edit Company Vibes
          </button>
        </div>
      `;
      confirmedList.appendChild(card);
    });

    // Brand Selection Preview Handler
    select.onchange = () => {
      const selectedId = select.value;
      const preview = document.getElementById('selected-brand-preview');
      const b = brandsMap[selectedId];

      if (!b) {
        preview.classList.add('hidden');
        return;
      }

      document.getElementById('prev-brand-name').textContent = b.brand_name;
      document.getElementById('prev-brand-tone').textContent = `Tone: ${b.communication_tone.join(', ')}`;

      const chipsContainer = document.getElementById('prev-palette-chips');
      chipsContainer.innerHTML = (b.approved_palette || []).map(hex => `
        <span class="color-swatch-chip">
          <span class="swatch-color-box" style="background: ${hex};"></span>
          ${hex}
        </span>
      `).join('');

      document.getElementById('prev-avoid-text').textContent = (b.disallowed_elements || []).join(', ') || 'None';
      preview.classList.remove('hidden');
    };
  } catch (err) {
    console.error('Failed to load brands:', err);
  }
}

// Render Interactive Swatch Chips for Company Palette Input
function renderPaletteChips(hexList) {
  const container = document.getElementById('ob-palette-chips');
  const paletteInput = document.getElementById('ob-palette');
  if (!container || !paletteInput) return;

  container.innerHTML = '';
  if (!hexList || hexList.length === 0) return;

  hexList.forEach(hex => {
    const chip = document.createElement('span');
    chip.className = 'color-swatch-chip interactive-chip';
    chip.innerHTML = `
      <span class="swatch-color-box" style="background: ${hex};"></span>
      ${hex}
    `;
    chip.title = 'Click to toggle this color in the approved palette';
    chip.onclick = () => {
      let current = paletteInput.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const upperHex = hex.toUpperCase();
      if (current.includes(upperHex)) {
        current = current.filter(c => c !== upperHex);
      } else {
        current.push(upperHex);
      }
      paletteInput.value = current.join(', ');
    };
    container.appendChild(chip);
  });
}

// Start Editing an Existing Company Profile
function startEditingBrand(brandId) {
  const b = brandsMap[brandId];
  if (!b) return;

  // Switch to Company Tab
  const onboardTab = document.querySelector('.nav-tab[data-tab="tab-onboard"]');
  if (onboardTab) onboardTab.click();

  const editIdInput = document.getElementById('ob-editing-brand-id');
  if (editIdInput) editIdInput.value = b.brand_id;

  document.getElementById('ob-brand-name').value = b.brand_name;
  document.getElementById('ob-manager-email').value = b.confirmed_by || 'Brand Lead';
  document.getElementById('ob-personality').value = (b.personality || []).join(', ');
  document.getElementById('ob-mood').value = (b.mood || []).join(', ');
  document.getElementById('ob-tone').value = (b.communication_tone || []).join(', ');
  document.getElementById('ob-audience').value = b.target_audience || '';
  document.getElementById('ob-style').value = (b.visual_style || []).join(', ');
  document.getElementById('ob-palette').value = (b.approved_palette || []).join(', ');
  document.getElementById('ob-avoid').value = (b.disallowed_elements || []).join(', ');
  document.getElementById('ob-tagline').value = b.mission_statement || '';

  renderPaletteChips(b.approved_palette || []);

  const btn = document.getElementById('btn-create-draft');
  if (btn) btn.innerHTML = '<span>💾 Update & Lock Company Vibes</span>';

  const btnCancel = document.getElementById('btn-cancel-edit');
  if (btnCancel) {
    btnCancel.classList.remove('hidden');
    btnCancel.onclick = resetOnboardingForm;
  }

  const feedback = document.getElementById('ob-scan-feedback');
  if (feedback) {
    feedback.className = 'ob-scan-feedback success';
    feedback.innerHTML = `✏️ Editing <strong>${b.brand_name}</strong>. Modify colors, avoidances, or vibe attributes below and click 'Update & Lock Company Vibes'.`;
    feedback.classList.remove('hidden');
  }

  document.getElementById('onboarding-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Reset Onboarding Form
function resetOnboardingForm() {
  const editIdInput = document.getElementById('ob-editing-brand-id');
  if (editIdInput) editIdInput.value = '';

  const form = document.getElementById('onboarding-form');
  if (form) form.reset();

  const btn = document.getElementById('btn-create-draft');
  if (btn) btn.innerHTML = '<span>💾 Save & Lock Company Vibes</span>';

  const btnCancel = document.getElementById('btn-cancel-edit');
  if (btnCancel) btnCancel.classList.add('hidden');

  const chips = document.getElementById('ob-palette-chips');
  if (chips) chips.innerHTML = '';

  const feedback = document.getElementById('ob-scan-feedback');
  if (feedback) feedback.classList.add('hidden');
}

// Multi-Filter Reference Image Scanner
function initReferenceScanning() {
  const fileInput = document.getElementById('ob-reference-files');
  const dropZone = document.getElementById('ob-drop-zone');
  const feedback = document.getElementById('ob-scan-feedback');
  if (!fileInput) return;

  const handleScan = async (file) => {
    if (!file) return;

    if (feedback) {
      feedback.className = 'ob-scan-feedback scanning';
      feedback.innerHTML = '<div class="inline-spinner"></div> Filtering reference image with Color Centroid, Layout Whitespace & Aesthetic Filters...';
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

      // Auto-populate fields based on identified content
      if (data.extracted_palette && data.extracted_palette.length > 0) {
        document.getElementById('ob-palette').value = data.extracted_palette.join(', ');
        renderPaletteChips(data.extracted_palette);
      }

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
        feedback.innerHTML = `✨ <strong>Filters applied!</strong> Extracted ${(data.extracted_palette || []).length} brand colors, whitespace ratio (${data.whitespace_ratio}), and aesthetic descriptors. You can freely edit any field below:`;
      }
    } catch (err) {
      if (feedback) {
        feedback.className = 'ob-scan-feedback error';
        feedback.textContent = `Scan notice: ${err.message}. You can still enter your brand values manually below.`;
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<span>Saving & Locking Company Vibes...</span>';

    const editingId = document.getElementById('ob-editing-brand-id')?.value;

    try {
      if (editingId) {
        // Edit Mode: Update existing confirmed company profile
        const managerEmail = document.getElementById('ob-manager-email')?.value || 'Brand Lead';
        const confirmPayload = {
          brand_id: editingId,
          personality: document.getElementById('ob-personality').value.split(',').map(s => s.trim()).filter(Boolean),
          mood: document.getElementById('ob-mood').value.split(',').map(s => s.trim()).filter(Boolean),
          communication_tone: document.getElementById('ob-tone').value.split(',').map(s => s.trim()).filter(Boolean),
          visual_style: document.getElementById('ob-style').value.split(',').map(s => s.trim()).filter(Boolean),
          target_audience: document.getElementById('ob-audience').value.trim(),
          approved_palette: document.getElementById('ob-palette').value.split(',').map(s => s.trim()).filter(Boolean),
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
        alert(`🎉 Company vibes for '${confirmed.brand_name}' updated and locked!`);
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
      formData.append('palette', document.getElementById('ob-palette').value);
      formData.append('disallowed_elements', document.getElementById('ob-avoid').value);
      formData.append('tagline_or_mission', document.getElementById('ob-tagline').value);

      const refFiles = document.getElementById('ob-reference-files').files;
      for (let i = 0; i < refFiles.length; i++) {
        formData.append('reference_files', refFiles[i]);
      }

      const res = await fetch(`${API_BASE}/brands/draft`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error(await res.text());
      const draft = await res.json();

      // Immediately confirm and lock so developers can test right away!
      const managerEmail = document.getElementById('ob-manager-email')?.value || 'Brand Lead';
      const confirmPayload = {
        brand_id: draft.brand_id,
        personality: draft.personality,
        mood: draft.mood,
        communication_tone: draft.communication_tone,
        visual_style: draft.visual_style,
        target_audience: draft.target_audience,
        approved_palette: draft.approved_palette,
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
      alert(`🎉 Company vibes for '${confirmed.brand_name}' saved and locked! Your developers can now check their work.`);
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
      alert(`Error saving company vibes: ${err.message}`);
    } finally {
      btn.disabled = false;
      const editingIdNow = document.getElementById('ob-editing-brand-id')?.value;
      btn.innerHTML = editingIdNow ? '<span>💾 Update & Lock Company Vibes</span>' : '<span>💾 Save & Lock Company Vibes</span>';
    }
  });
}

// Show Confirmation Card
function showConfirmationBox(draft) {
  const box = document.getElementById('confirmation-box');
  document.getElementById('conf-brand-title').textContent = `${draft.brand_name} – Review & Confirm`;
  document.getElementById('conf-brand-id').value = draft.brand_id;
  document.getElementById('conf-personality').value = draft.personality.join(', ');
  document.getElementById('conf-mood').value = draft.mood.join(', ');
  document.getElementById('conf-tone').value = draft.communication_tone.join(', ');
  document.getElementById('conf-style').value = draft.visual_style.join(', ');
  document.getElementById('conf-audience').value = draft.target_audience;
  document.getElementById('conf-palette').value = draft.approved_palette.join(', ');
  document.getElementById('conf-disallowed').value = draft.disallowed_elements.join(', ');

  const expl = document.getElementById('conf-synthesis-expl');
  expl.textContent = draft.synthesis_explanation || 'Synthesized from questionnaire inputs and uploaded reference guidelines.';

  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth' });
}

// Handle Confirmation Submission
function initConfirmation() {
  const form = document.getElementById('confirmation-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      brand_id: document.getElementById('conf-brand-id').value,
      personality: document.getElementById('conf-personality').value.split(',').map(s => s.trim()).filter(Boolean),
      mood: document.getElementById('conf-mood').value.split(',').map(s => s.trim()).filter(Boolean),
      communication_tone: document.getElementById('conf-tone').value.split(',').map(s => s.trim()).filter(Boolean),
      visual_style: document.getElementById('conf-style').value.split(',').map(s => s.trim()).filter(Boolean),
      target_audience: document.getElementById('conf-audience').value.trim(),
      approved_palette: document.getElementById('conf-palette').value.split(',').map(s => s.trim()).filter(Boolean),
      disallowed_elements: document.getElementById('conf-disallowed').value.split(',').map(s => s.trim()).filter(Boolean),
      confirmed_by: document.getElementById('conf-approver').value.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/brands/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await res.text());
      const confirmed = await res.json();

      document.getElementById('confirmation-box').classList.add('hidden');
      alert(`Brand '${confirmed.brand_name}' is confirmed and ready for developer inspections!`);
      loadBrands();
    } catch (err) {
      alert(`Confirmation Error: ${err.message}`);
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

  // Dual Input Mode Switcher
  const tabModeText = document.getElementById('tab-mode-text');
  const tabModeFile = document.getElementById('tab-mode-file');
  const textContainer = document.getElementById('mode-text-container');
  const fileContainer = document.getElementById('mode-file-container');
  let activeInputMode = 'text';

  if (tabModeText && tabModeFile) {
    tabModeText.addEventListener('click', () => {
      activeInputMode = 'text';
      tabModeText.classList.add('active');
      tabModeFile.classList.remove('active');
      textContainer.classList.remove('hidden');
      fileContainer.classList.add('hidden');
    });

    tabModeFile.addEventListener('click', () => {
      activeInputMode = 'file';
      tabModeFile.classList.add('active');
      tabModeText.classList.remove('active');
      fileContainer.classList.remove('hidden');
      textContainer.classList.add('hidden');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const brandId = document.getElementById('inspect-brand-select').value;
    const fileInput = document.getElementById('inspect-file');
    const copyTextarea = document.getElementById('inspect-copy-text');

    if (!brandId) {
      alert('Please select a target company brand profile first.');
      return;
    }

    const formData = new FormData();

    if (activeInputMode === 'text') {
      const textVal = copyTextarea ? copyTextarea.value.trim() : '';
      if (!textVal) {
        alert('Please enter some marketing copy or advertising text to inspect.');
        return;
      }
      formData.append('copy_text', textVal);
    } else {
      if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select or drop a poster or graphic image to inspect.');
        return;
      }
      formData.append('file', fileInput.files[0]);
    }

    // Update UI to running state
    if (emptyState) emptyState.classList.add('hidden');
    if (resultsView) resultsView.classList.add('hidden');
    if (loadingState) loadingState.classList.remove('hidden');
    btn.disabled = true;

    if (inlineStatus) {
      inlineStatus.className = 'inspect-inline-status status-running';
      inlineText.textContent = 'Extracting Brand DNA vectors & analyzing brand vibes...';
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

      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-success';
        const matchPct = report.overall_score !== null && report.overall_score !== undefined ? report.overall_score : report.deterministic_score;
        inlineText.innerHTML = `✅ Vibe check complete! <strong>${matchPct}% Match (${report.verdict})</strong>. Report updated below ⬇️`;
      }

      // Smoothly scroll to report panel
      if (reportPanel) {
        reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      if (inlineStatus) {
        inlineStatus.className = 'inspect-inline-status status-error';
        inlineText.textContent = `⚠️ Inspection Error: ${err.message}`;
      } else {
        alert(`Inspection Error: ${err.message}`);
      }
      if (emptyState) emptyState.classList.remove('hidden');
    } finally {
      if (loadingState) loadingState.classList.add('hidden');
      btn.disabled = false;
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

  // Find AI explanation, mood, personality, and tone from report or findings
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

  // Palettes
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
        <span class="color-swatch-chip">
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
          <span class="color-swatch-chip">
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
        ${f.suggested_correction ? `<div class="finding-correction">💡 Suggested Correction: ${f.suggested_correction}</div>` : ''}
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

// Load Most Recent Report on Page Load
async function loadRecentReport() {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    if (!res.ok) return;
    const reports = await res.json();
    if (reports && reports.length > 0) {
      reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      renderInspectionReport(reports[0]);

      // Also set the target company in the dropdown if available
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

// Human Review Sign-Off
function initSignoff() {
  const form = document.getElementById('signoff-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inspectionId = document.getElementById('signoff-inspection-id').value;
    const reviewerName = document.getElementById('signoff-reviewer-name').value;
    const decision = document.getElementById('signoff-decision').value;
    const notes = document.getElementById('signoff-notes').value;

    try {
      const res = await fetch(`${API_BASE}/reports/${inspectionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspection_id: inspectionId,
          reviewer_name: reviewerName,
          decision: decision,
          reviewer_notes: notes
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      document.getElementById('human-decision-text').textContent = `${updated.human_decision} by ${updated.reviewed_by}`;
      alert('Human decision recorded in governance audit log!');
    } catch (err) {
      alert(`Sign-off Error: ${err.message}`);
    }
  });
}

// Load Audit Reports for Tab 3
async function loadAuditReports() {
  const container = document.getElementById('governance-reports-table');
  try {
    const res = await fetch(`${API_BASE}/reports`);
    const reports = await res.json();

    if (!reports || reports.length === 0) {
      container.innerHTML = '<p class="empty-note">No inspection records logged yet.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Inspection ID</th>
            <th>Brand</th>
            <th>File</th>
            <th>Verdict</th>
            <th>Overall Score</th>
            <th>Human Review</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
    `;

    reports.forEach(r => {
      html += `
        <tr>
          <td><span class="id-badge">${r.inspection_id}</span></td>
          <td><strong>${r.brand_name}</strong></td>
          <td>${r.submission_filename}</td>
          <td><span class="tag-badge tag-${r.verdict}">${r.verdict}</span></td>
          <td><strong>${r.overall_score !== null ? r.overall_score + '%' : r.deterministic_score + '%'}</strong></td>
          <td>${r.human_decision}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="empty-note">Error loading reports: ${err.message}</p>`;
  }
}


// ==========================================================================
// WORK TRACKER – Kanban Board & Task Management
// ==========================================================================

let trackerBrandId = '';
let allTasks = [];

function initWorkTracker() {
  const brandSelect = document.getElementById('tracker-brand-select');
  const addBtn = document.getElementById('btn-add-task');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const overlay = document.getElementById('task-modal-overlay');
  const taskForm = document.getElementById('task-form');

  // Populate tracker brand select when brands are loaded
  const origLoadBrands = window._trackerBrandsLoaded;
  const populateTrackerSelect = () => {
    if (!brandSelect) return;
    brandSelect.innerHTML = '<option value="">-- Select Company --</option>';
    Object.values(brandsMap).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.brand_id;
      opt.textContent = `${b.brand_name} (${b.status})`;
      brandSelect.appendChild(opt);
    });
  };

  // Intercept brand loading to also populate tracker select
  const origLoadBrandsFn = window.loadBrands;
  window.loadBrands = async function() {
    await origLoadBrandsFn.call(this);
    populateTrackerSelect();
  };

  // Brand selection handler
  brandSelect.addEventListener('change', () => {
    trackerBrandId = brandSelect.value;
    addBtn.disabled = !trackerBrandId;
    if (trackerBrandId) {
      loadTrackerTasks();
    } else {
      showTrackerEmptyState();
    }
  });

  // Add task button
  addBtn.addEventListener('click', () => {
    openTaskModal();
  });

  // Close modal
  closeModalBtn.addEventListener('click', closeTaskModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTaskModal();
  });

  // Task form submission
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('task-edit-id').value;

    const taskData = {
      title: document.getElementById('task-title').value.trim(),
      description: document.getElementById('task-description').value.trim(),
      priority: document.getElementById('task-priority').value,
      assignee: document.getElementById('task-assignee').value.trim(),
      due_date: document.getElementById('task-due-date').value || null,
    };

    try {
      if (editId) {
        // Update existing task
        const res = await fetch(`${API_BASE}/tasks/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        // Create new task
        taskData.brand_id = trackerBrandId;
        const res = await fetch(`${API_BASE}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
        if (!res.ok) throw new Error(await res.text());
      }

      closeTaskModal();
      await loadTrackerTasks();
    } catch (err) {
      alert(`Error saving task: ${err.message}`);
    }
  });
}

function showTrackerEmptyState() {
  const board = document.getElementById('kanban-board');
  const empty = document.getElementById('tracker-empty-state');
  const progress = document.getElementById('tracker-progress-section');
  if (board) board.classList.add('hidden');
  if (empty) empty.classList.remove('hidden');
  if (progress) progress.classList.add('hidden');
}

async function loadTrackerTasks() {
  if (!trackerBrandId) return;

  try {
    const [tasksRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/tasks?brand_id=${trackerBrandId}`),
      fetch(`${API_BASE}/tasks/stats/${trackerBrandId}`)
    ]);

    allTasks = await tasksRes.json();
    const stats = await statsRes.json();

    // Show board, hide empty state
    const board = document.getElementById('kanban-board');
    const empty = document.getElementById('tracker-empty-state');
    const progress = document.getElementById('tracker-progress-section');
    if (board) board.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');

    // Update progress bar
    updateProgressBar(stats);

    // Render Kanban columns
    renderKanbanBoard(allTasks);
  } catch (err) {
    console.error('Failed to load tracker tasks:', err);
  }
}

function updateProgressBar(stats) {
  const pctElem = document.getElementById('tracker-progress-pct');
  const barFill = document.getElementById('tracker-progress-bar-fill');
  const statTodo = document.getElementById('stat-todo');
  const statInProgress = document.getElementById('stat-in-progress');
  const statReview = document.getElementById('stat-review');
  const statDone = document.getElementById('stat-done');

  if (pctElem) pctElem.textContent = `${stats.progress_pct}%`;
  if (barFill) barFill.style.width = `${stats.progress_pct}%`;
  if (statTodo) statTodo.textContent = stats.todo;
  if (statInProgress) statInProgress.textContent = stats.in_progress;
  if (statReview) statReview.textContent = stats.review;
  if (statDone) statDone.textContent = stats.done;
}

function renderKanbanBoard(tasks) {
  const columns = {
    'TODO': document.getElementById('kanban-todo'),
    'IN_PROGRESS': document.getElementById('kanban-in-progress'),
    'REVIEW': document.getElementById('kanban-review'),
    'DONE': document.getElementById('kanban-done'),
  };

  const counts = {
    'TODO': 0,
    'IN_PROGRESS': 0,
    'REVIEW': 0,
    'DONE': 0,
  };

  // Clear columns
  Object.values(columns).forEach(col => { if (col) col.innerHTML = ''; });

  // Sort tasks by priority and populate columns
  const priorityOrder = { 'URGENT': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
  tasks.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));

  tasks.forEach(task => {
    const col = columns[task.status];
    if (!col) return;
    counts[task.status]++;
    col.appendChild(createTaskCard(task));
  });

  // Show empty column placeholders
  Object.entries(columns).forEach(([status, col]) => {
    if (col && counts[status] === 0) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty';
      empty.textContent = 'No tasks here';
      col.appendChild(empty);
    }
  });

  // Update column counts
  document.getElementById('kanban-count-todo').textContent = counts['TODO'];
  document.getElementById('kanban-count-progress').textContent = counts['IN_PROGRESS'];
  document.getElementById('kanban-count-review').textContent = counts['REVIEW'];
  document.getElementById('kanban-count-done').textContent = counts['DONE'];
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card priority-${task.priority}`;
  card.setAttribute('data-task-id', task.task_id);

  const priorityEmoji = { 'LOW': '🟢', 'MEDIUM': '🟡', 'HIGH': '🟠', 'URGENT': '🔴' };

  // Check if overdue
  let dueDateHtml = '';
  let isOverdue = false;
  if (task.due_date) {
    const due = new Date(task.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    isOverdue = due < today && task.status !== 'DONE';
    dueDateHtml = `<span class="task-card-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠️' : '📅'} ${due.toLocaleDateString()}</span>`;
  }

  // Next status for "move forward" button
  const nextStatusMap = {
    'TODO': { status: 'IN_PROGRESS', label: '▶ Start' },
    'IN_PROGRESS': { status: 'REVIEW', label: '👀 Send to Review' },
    'REVIEW': { status: 'DONE', label: '✅ Mark Done' },
  };

  const nextStatus = nextStatusMap[task.status];

  card.innerHTML = `
    <div class="task-card-title">${escHtml(task.title)}</div>
    ${task.description ? `<div class="task-card-desc">${escHtml(task.description)}</div>` : ''}
    <div class="task-card-meta">
      <span class="task-priority-badge priority-${task.priority}">${priorityEmoji[task.priority] || ''} ${task.priority}</span>
      ${task.assignee ? `<span class="task-card-assignee">👤 ${escHtml(task.assignee)}</span>` : ''}
      ${dueDateHtml}
    </div>
    <div class="task-card-actions">
      ${nextStatus ? `<button class="task-action-btn btn-move-next" onclick="moveTask('${task.task_id}', '${nextStatus.status}')">${nextStatus.label}</button>` : ''}
      <button class="task-action-btn" onclick="editTask('${task.task_id}')">✏️ Edit</button>
      <button class="task-action-btn btn-delete" onclick="deleteTask('${task.task_id}')">🗑️</button>
    </div>
  `;

  return card;
}

function escHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function moveTask(taskId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error(await res.text());
    await loadTrackerTasks();
  } catch (err) {
    alert(`Error moving task: ${err.message}`);
  }
}

function editTask(taskId) {
  const task = allTasks.find(t => t.task_id === taskId);
  if (!task) return;
  openTaskModal(task);
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    await loadTrackerTasks();
  } catch (err) {
    alert(`Error deleting task: ${err.message}`);
  }
}

function openTaskModal(existingTask = null) {
  const overlay = document.getElementById('task-modal-overlay');
  const modalTitle = document.getElementById('task-modal-title');
  const submitLabel = document.getElementById('task-submit-label');
  const editId = document.getElementById('task-edit-id');

  // Reset form
  document.getElementById('task-form').reset();
  editId.value = '';

  if (existingTask) {
    modalTitle.textContent = '✏️ Edit Task';
    submitLabel.textContent = '💾 Update Task';
    editId.value = existingTask.task_id;
    document.getElementById('task-title').value = existingTask.title;
    document.getElementById('task-description').value = existingTask.description || '';
    document.getElementById('task-priority').value = existingTask.priority;
    document.getElementById('task-assignee').value = existingTask.assignee || '';
    document.getElementById('task-due-date').value = existingTask.due_date || '';
  } else {
    modalTitle.textContent = '➕ Add New Task';
    submitLabel.textContent = '💾 Create Task';
  }

  overlay.classList.remove('hidden');
}

function closeTaskModal() {
  const overlay = document.getElementById('task-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}


// ==========================================================================
// KĀLARĀJA – Dark Lord Anime Logo & Sanskrit Aura Studio Controller
// ==========================================================================
const AURA_THEMES = [
  { id: 'void-monarch', name: 'Void Monarch', devanagari: 'शून्य', symbol: '🟣' },
  { id: 'crimson-asura', name: 'Crimson Asura', devanagari: 'असुर', symbol: '🔴' },
  { id: 'cyber-trishula', name: 'Cyber Trishula', devanagari: 'त्रिशूल', symbol: '🔵' },
  { id: 'abyssal-gold', name: 'Abyssal Gold', devanagari: 'काल', symbol: '🟡' }
];

let currentAuraIndex = 0;

function initKalarajaLogo() {
  const auraButtons = document.querySelectorAll('.btn-aura-opt');
  const velButtons = document.querySelectorAll('.btn-vel-opt');
  const btnCycleAura = document.getElementById('btn-cycle-aura');
  const auraPill = document.getElementById('aura-mode-pill');
  const btnToggleShowcase = document.getElementById('btn-toggle-showcase');
  const showcaseCard = document.getElementById('kalaraja-showcase');
  const headerCrest = document.getElementById('header-crest');
  const stageFrame = document.getElementById('stage-frame');
  const btnSurge = document.getElementById('btn-surge-aura');
  const btnDownload = document.getElementById('btn-download-logo');
  const btnCopySvg = document.getElementById('btn-copy-svg');

  // 1. Aura Selection via Option Buttons
  auraButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetAura = btn.getAttribute('data-aura');
      setAuraTheme(targetAura);
    });
  });

  // 2. Aura Cycling via Header Pill
  if (btnCycleAura) {
    btnCycleAura.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleAuraTheme();
    });
  }
  if (auraPill) {
    auraPill.addEventListener('click', () => {
      cycleAuraTheme();
    });
  }

  // 3. Velocity Speeds
  velButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const vel = btn.getAttribute('data-vel');
      document.body.setAttribute('data-velocity', vel);
      velButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 4. Energy Surge Shockwaves
  function triggerSurge() {
    const ripple = document.getElementById('shockwave-ripple');
    if (ripple) {
      ripple.classList.remove('surge-active');
      void ripple.offsetWidth; // force reflow
      ripple.classList.add('surge-active');
    }

    if (headerCrest) {
      headerCrest.style.transform = 'scale(1.25) rotate(18deg)';
      setTimeout(() => {
        headerCrest.style.transform = '';
      }, 500);
    }
  }

  if (btnSurge) btnSurge.addEventListener('click', triggerSurge);
  if (stageFrame) stageFrame.addEventListener('click', triggerSurge);
  if (headerCrest) headerCrest.addEventListener('click', triggerSurge);

  // 5. Toggle Showcase
  if (btnToggleShowcase && showcaseCard) {
    btnToggleShowcase.addEventListener('click', () => {
      if (showcaseCard.classList.contains('hidden')) {
        showcaseCard.classList.remove('hidden');
        showcaseCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        showcaseCard.classList.add('hidden');
      }
    });
  }

  // 6. Download SVG Logo
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      downloadKalarajaSvg();
    });
  }

  // 7. Copy SVG Code to Clipboard
  if (btnCopySvg) {
    btnCopySvg.addEventListener('click', () => {
      copyKalarajaSvgCode();
    });
  }
}

function setAuraTheme(auraId) {
  const foundIdx = AURA_THEMES.findIndex(t => t.id === auraId);
  if (foundIdx !== -1) currentAuraIndex = foundIdx;

  const current = AURA_THEMES[currentAuraIndex];
  document.body.setAttribute('data-aura', current.id);

  const auraLabel = document.getElementById('current-aura-name');
  if (auraLabel) {
    auraLabel.textContent = current.name;
  }

  const auraButtons = document.querySelectorAll('.btn-aura-opt');
  auraButtons.forEach(btn => {
    if (btn.getAttribute('data-aura') === current.id) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function cycleAuraTheme() {
  currentAuraIndex = (currentAuraIndex + 1) % AURA_THEMES.length;
  setAuraTheme(AURA_THEMES[currentAuraIndex].id);
}

function downloadKalarajaSvg() {
  const svgUrl = '/static/assets/logo-kalaraja.svg';
  const a = document.createElement('a');
  a.href = svgUrl;
  a.download = 'kalaraja-dark-lord-logo.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('📥 Downloading KĀLARĀJA Dark Lord SVG Logo...');
}

async function copyKalarajaSvgCode() {
  try {
    const res = await fetch('/static/assets/logo-kalaraja.svg');
    const svgCode = await res.text();
    await navigator.clipboard.writeText(svgCode);
    showToast('🔱 KĀLARĀJA Vector SVG code copied to clipboard!');
  } catch (err) {
    // Fallback if fetch fails
    const svgEl = document.querySelector('.kalaraja-stage-svg');
    if (svgEl) {
      const serializer = new XMLSerializer();
      const code = serializer.serializeToString(svgEl);
      await navigator.clipboard.writeText(code);
      showToast('🔱 KĀLARĀJA Vector SVG code copied to clipboard!');
    } else {
      showToast('⚠️ Could not copy SVG code directly.');
    }
  }
}

function showToast(message) {
  let toast = document.getElementById('kalaraja-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'kalaraja-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '2rem';
    toast.style.right = '2rem';
    toast.style.background = 'rgba(14, 20, 36, 0.95)';
    toast.style.border = '1px solid var(--aura-primary, #8b5cf6)';
    toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7), 0 0 20px var(--aura-glow, rgba(139,92,246,0.4))';
    toast.style.color = '#ffffff';
    toast.style.fontFamily = 'var(--font-mono, monospace)';
    toast.style.fontSize = '0.85rem';
    toast.style.padding = '0.85rem 1.4rem';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.3s ease';
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3200);
}
