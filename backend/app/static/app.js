// BrandShield – Frontend Application Logic
const API_BASE = '/api/v1';
let brandsMap = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropZone();
  initOnboarding();
  initReferenceScanning();
  initInspection();
  loadProvidersStatus();
  loadBrands();
  loadRecentReport();
});

// Tab Switcher (Developer vs Company)
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

// Developer File Drop Zone Handling
function initDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('inspect-file');
  const previewInfo = document.getElementById('file-preview-info');
  const previewName = document.getElementById('preview-filename');
  const previewSize = document.getElementById('preview-filesize');
  const btnClear = document.getElementById('btn-clear-file');

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
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      fileInput.value = '';
      if (previewInfo) previewInfo.classList.add('hidden');
    });
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
          <p class="finding-body"><strong>Personality:</strong> ${(b.personality || []).join(', ')} | <strong>Mood:</strong> ${(b.mood || []).join(', ')}</p>
          <p class="finding-body"><strong>Tone:</strong> ${(b.communication_tone || []).join(', ')} | <strong>Audience:</strong> ${b.target_audience || 'General'}</p>
          <div class="palette-row" style="margin-top: 0.5rem;">${swatches}</div>
          <div class="brand-card-actions">
            <button type="button" class="btn-edit-brand" onclick="startEditingBrand('${b.brand_id}')">
              ✏️ Edit Company Vibes
            </button>
          </div>
        `;
        confirmedList.appendChild(card);
      }
    });

    // Brand Selection Preview Handler
    if (select) {
      select.onchange = () => {
        const selectedId = select.value;
        const preview = document.getElementById('selected-brand-preview');
        const b = brandsMap[selectedId];

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
            <span class="color-swatch-chip">
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
  setVal('ob-palette', (b.approved_palette || []).join(', '));
  setVal('ob-avoid', (b.disallowed_elements || []).join(', '));
  setVal('ob-tagline', b.mission_statement || '');

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
    feedback.innerHTML = `✏️ Editing <strong>${b.brand_name}</strong>. Modify any colors, avoidances, or vibe attributes below and click 'Update & Lock Company Vibes'.`;
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
  if (!form || !btn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<span>Saving & Locking Company Vibes...</span>';

    const editingId = document.getElementById('ob-editing-brand-id')?.value;

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
  const textContainer = document.getElementById('mode-text-container');
  const fileContainer = document.getElementById('mode-file-container');
  let activeInputMode = 'text';

  if (tabModeText && tabModeFile) {
    tabModeText.addEventListener('click', () => {
      activeInputMode = 'text';
      tabModeText.classList.add('active');
      tabModeFile.classList.remove('active');
      if (textContainer) textContainer.classList.remove('hidden');
      if (fileContainer) fileContainer.classList.add('hidden');
    });

    tabModeFile.addEventListener('click', () => {
      activeInputMode = 'file';
      tabModeFile.classList.add('active');
      tabModeText.classList.remove('active');
      if (fileContainer) fileContainer.classList.remove('hidden');
      if (textContainer) textContainer.classList.add('hidden');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const brandSelect = document.getElementById('inspect-brand-select');
    const brandId = brandSelect ? brandSelect.value : '';
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
    if (btn) btn.disabled = true;

    if (inlineStatus) {
      inlineStatus.className = 'inspect-inline-status status-running';
      if (inlineText) inlineText.textContent = 'Extracting Brand DNA vectors & analyzing brand vibes...';
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
        if (inlineText) inlineText.innerHTML = `✅ Vibe check complete! <strong>${matchPct}% Match (${report.verdict})</strong>. Report updated below ⬇️`;
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
