// BrandShield AI - Frontend Application Logic
const API_BASE = '/api/v1';
let brandsMap = {};

// Real Brand Presets for 1-Click Fast Demonstration
const BRAND_PRESETS = {
  spotify: {
    brand_name: "Spotify",
    personality: "Expressive, Casual, Clever, Music-obsessed",
    mood: "Vibrant, Energetic, Social, Upbeat",
    tone: "Playful, Direct, Colloquial, Authentic",
    audience: "Music and podcast listeners, Gen-Z and Millennials",
    style: "High Contrast, Dark Canvas, Neon Accents, Duotone",
    palette: "#1ED760, #121212, #FFFFFF",
    avoid: "cheap tunes, bargain discount, corporate formal, monotone",
    tagline: "Listening is everything"
  },
  apple: {
    brand_name: "Apple",
    personality: "Understated, Confident, Human, Precise",
    mood: "Sophisticated, Calm, Premium, Focused",
    tone: "Minimalist, Inspiring, Clear, Direct",
    audience: "Creators, professionals, and technology enthusiasts",
    style: "Extreme Minimalism, Negative Space, High-key Lighting",
    palette: "#000000, #FFFFFF, #86868B",
    avoid: "super cheap, bargain discount, miracle deal, clearance sale",
    tagline: "Think different"
  },
  nike: {
    brand_name: "Nike",
    personality: "Athletic, Bold, Inspiring, Competitive",
    mood: "Driven, Triumphant, Relentless, High-energy",
    tone: "Motivational, Direct, Powerful",
    audience: "Athletes, runners, and everyday sports enthusiasts",
    style: "Dynamic Action, Stark High Contrast, Bold Typography",
    palette: "#000000, #FFFFFF, #E32636",
    avoid: "lazy, giving up, cheap sneakers, passive, formal jargon",
    tagline: "Just Do It"
  }
};

window.loadBrandPreset = function(key) {
  const data = BRAND_PRESETS[key];
  if (!data) return;
  document.getElementById('ob-brand-name').value = data.brand_name;
  document.getElementById('ob-personality').value = data.personality;
  document.getElementById('ob-mood').value = data.mood;
  document.getElementById('ob-tone').value = data.tone;
  document.getElementById('ob-audience').value = data.audience;
  document.getElementById('ob-style').value = data.style;
  document.getElementById('ob-palette').value = data.palette;
  document.getElementById('ob-avoid').value = data.avoid;
  document.getElementById('ob-tagline').value = data.tagline;
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDropZone();
  initOnboarding();
  initConfirmation();
  initInspection();
  initSignoff();
  loadProvidersStatus();
  loadBrands();
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

  try {
    const res = await fetch(`${API_BASE}/providers`);
    const data = await res.json();

    const activePrimary = data.active_primary_provider;
    if (activePrimary) {
      pill.className = 'status-pill status-ready';
      pill.innerHTML = `<span class="status-dot"></span> 🟢 AI Engine: Gemini 3.5 Lite Active`;
    } else {
      pill.className = 'status-pill status-unconfigured';
      pill.innerHTML = `<span class="status-dot"></span> Local Brand DNA Engine Active`;
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

// Onboarding & Company Vibes Registration Submission
function initOnboarding() {
  const form = document.getElementById('onboarding-form');
  const btn = document.getElementById('btn-create-draft');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<span>Saving & Locking Company Vibes...</span>';

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

    try {
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
      btn.innerHTML = '<span>💾 Save & Lock Company Vibes</span>';
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

  // 1-Click Real Company Sample Chips
  const sampleChips = document.querySelectorAll('.btn-sample-chip');
  sampleChips.forEach(chip => {
    chip.addEventListener('click', async () => {
      const sampleKey = chip.getAttribute('data-sample');
      if (!sampleKey) return;

      emptyState.classList.add('hidden');
      resultsView.classList.add('hidden');
      loadingState.classList.remove('hidden');
      btn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/inspect/sample/${sampleKey}`, {
          method: 'POST'
        });

        if (!res.ok) {
          const errDetail = await res.text();
          throw new Error(errDetail);
        }

        const report = await res.json();

        // Automatically sync brand selector
        const brandSelect = document.getElementById('inspect-brand-select');
        if (brandSelect && report.brand_id) {
          brandSelect.value = report.brand_id;
          brandSelect.dispatchEvent(new Event('change'));
        }

        renderInspectionReport(report);
      } catch (err) {
        alert(`Sample Inspection Error: ${err.message}`);
        emptyState.classList.remove('hidden');
      } finally {
        loadingState.classList.add('hidden');
        btn.disabled = false;
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const brandId = document.getElementById('inspect-brand-select').value;
    const fileInput = document.getElementById('inspect-file');
    const copyTextarea = document.getElementById('inspect-copy-text');
    const aiProvider = document.getElementById('ai-provider-select').value;

    if (!brandId) {
      alert('Please select a target company brand profile.');
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
        alert('Please select or drop a creative asset file to inspect.');
        return;
      }
      formData.append('file', fileInput.files[0]);
    }

    if (aiProvider) formData.append('preferred_ai_provider', aiProvider);

    emptyState.classList.add('hidden');
    resultsView.classList.add('hidden');
    loadingState.classList.remove('hidden');
    btn.disabled = true;

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
    } catch (err) {
      alert(`Inspection Error: ${err.message}`);
      emptyState.classList.remove('hidden');
    } finally {
      loadingState.classList.add('hidden');
      btn.disabled = false;
    }
  });
}

// Render Inspection Report View
function renderInspectionReport(report) {
  const resultsView = document.getElementById('inspection-results-view');
  document.getElementById('report-id-badge').textContent = `Report: ${report.inspection_id}`;

  // Verdict Banner
  const banner = document.getElementById('verdict-banner');
  banner.className = `verdict-banner verdict-${report.verdict}`;
  document.getElementById('verdict-title').textContent = report.verdict.replace(/_/g, ' ');

  const summary = report.verdict === 'APPROVED'
    ? 'Creative content meets brand guidelines across objective rules and aesthetic alignment.'
    : (report.verdict === 'CHANGES_REQUESTED'
      ? 'Discrepancies identified. Review detected violations and suggested corrections below.'
      : 'Significant brand guideline violations detected. Re-alignment required.');
  document.getElementById('verdict-summary').textContent = summary;

  // Scores
  document.getElementById('score-overall').textContent = report.overall_score !== null ? `${report.overall_score}%` : `${report.deterministic_score}%`;
  document.getElementById('score-deterministic').textContent = `${report.deterministic_score}%`;
  document.getElementById('score-ai').textContent = report.ai_score !== null ? `${report.ai_score}%` : 'Unconfigured';

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
    if (valElem) valElem.textContent = score !== undefined ? `${score}%` : 'N/A';
    if (barElem) barElem.style.width = score !== undefined ? `${Math.max(5, Math.min(100, score))}%` : '0%';
  };

  setBioMetric('bio-color-score', 'bio-color-bar', bio.color_dna_score);
  setBioMetric('bio-whitespace-score', 'bio-whitespace-bar', bio.whitespace_dna_score);
  setBioMetric('bio-complexity-score', 'bio-complexity-bar', bio.complexity_dna_score);
  setBioMetric('bio-copy-score', 'bio-copy-bar', bio.copy_dna_score);

  // Palettes
  const detectedRow = document.getElementById('detected-palette-row');
  detectedRow.innerHTML = '';
  const detectedColors = report.technical_summary.detected_palette || [];
  if (detectedColors.length === 0 && report.technical_summary.dominant_color) {
    detectedColors.push(report.technical_summary.dominant_color);
  }
  detectedColors.forEach(hex => {
    detectedRow.innerHTML += `
      <span class="color-swatch-chip">
        <span class="swatch-color-box" style="background: ${hex};"></span>
        ${hex}
      </span>
    `;
  });

  const approvedRow = document.getElementById('approved-palette-row');
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
    approvedRow.innerHTML = '<span class="id-badge">No palette registered</span>';
  }

  // Findings
  const findingsContainer = document.getElementById('findings-table-container');
  findingsContainer.innerHTML = '';

  report.findings.forEach(f => {
    const card = document.createElement('div');
    card.className = `finding-card finding-severity-${f.severity}`;
    card.innerHTML = `
      <div class="finding-header">
        <span class="finding-title">${f.title}</span>
        <div>
          <span class="tag-badge tag-${f.severity}">${f.severity}</span>
          <span class="id-badge">${f.source}</span>
        </div>
      </div>
      <p class="finding-body">${f.explanation}</p>
      ${f.evidence_snippet ? `<div class="finding-evidence">Evidence: ${f.evidence_snippet}</div>` : ''}
      ${f.suggested_correction ? `<div class="finding-correction">💡 Suggested Correction: ${f.suggested_correction}</div>` : ''}
    `;
    findingsContainer.appendChild(card);
  });

  // Human Review Form Setup
  document.getElementById('signoff-inspection-id').value = report.inspection_id;
  document.getElementById('human-decision-text').textContent = report.human_decision;

  resultsView.classList.remove('hidden');
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
