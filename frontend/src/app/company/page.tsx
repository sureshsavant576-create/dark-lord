"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { api } from "@/lib/api";

export default function CompanyVibesPage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("__new__");
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("Technology");
  const [audience, setAudience] = useState("");
  const [products, setProducts] = useState("");
  const [mission, setMission] = useState("");
  const [personality, setPersonality] = useState("");
  const [mood, setMood] = useState("");
  const [tone, setTone] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [disallowed, setDisallowed] = useState("");
  const [description, setDescription] = useState("");
  const [palette, setPalette] = useState<string[]>(["#3B82F6", "#0F172A", "#10B981"]);
  const [hexInput, setHexInput] = useState("#3B82F6");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandAssets, setBrandAssets] = useState<{ name: string; url: string; preview?: string }[]>([]);
  const [dnaProfile, setDnaProfile] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function refreshBrands() {
    const list = await api.listBrands().catch(() => []);
    setBrands(Array.isArray(list) ? list : []);
    return Array.isArray(list) ? list : [];
  }

  useEffect(() => {
    refreshBrands().then((list) => {
      const params = new URLSearchParams(window.location.search);
      const qBrand = params.get("brand");
      if (qBrand) {
        selectBrand(qBrand, list);
      } else {
        const omni = list.find((b: any) => b.brand_id === "omnigpt_ai" || b.brand_id === "omnigpt-ai");
        if (omni) selectBrand(omni.brand_id, list);
      }
    });
  }, []);

  function selectBrand(id: string, brandSource = brands) {
    setSelectedId(id);
    setDnaProfile(null);
    setStatusMsg("");
    if (!id || id === "__new__") {
      setBrandName("");
      setAudience("");
      setProducts("");
      setMission("");
      setPersonality("");
      setMood("");
      setTone("");
      setVisualStyle("");
      setDisallowed("");
      setDescription("");
      setPalette(["#3B82F6", "#0F172A", "#10B981"]);
      setLogoUrl("");
      setBrandAssets([]);
      return;
    }
    const b = brandSource.find((x) => x.brand_id === id);
    if (!b) return;
    setBrandName(b.brand_name || "");
    setAudience(b.target_audience || "");
    setMission(b.mission_statement || "");
    setPersonality((b.personality || []).join(", "));
    setMood((b.mood || []).join(", "));
    setTone((b.communication_tone || []).join(", "));
    setVisualStyle((b.visual_style || []).join(", "));
    setDisallowed((b.disallowed_elements || []).join(", "));
    setDescription(b.synthesis_explanation || "");
    setPalette(b.approved_palette || []);
    setLogoUrl(b.logo_url || "");
    setBrandAssets(
      Array.isArray(b.brand_assets)
        ? b.brand_assets.map((a: any) =>
            typeof a === "string" ? { name: a.split("/").pop() || a, url: a } : a
          )
        : []
    );
  }

  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  function addHex() {
    let h = hexInput.trim().toUpperCase();
    if (!h.startsWith("#")) h = `#${h}`;
    if (/^#[0-9A-F]{6}$/.test(h) && !palette.includes(h)) {
      setPalette([...palette, h]);
    }
  }

  async function handleExtractPalette(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setStatusMsg("Extracting brand palette...");
    try {
      const res = await api.extractPalette(fd);
      if (res?.hex_list?.length) {
        setPalette(res.hex_list.slice(0, 6));
        setStatusMsg(`Extracted ${res.hex_list.slice(0, 6).length} colors.`);
      }
    } catch (err: any) {
      setStatusMsg(err?.message || "Palette extraction failed");
    }
  }

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.uploadLogo(fd);
      if (res?.logo_url) {
        setLogoUrl(res.logo_url);
        setStatusMsg(`Uploaded logo: ${file.name}`);
      }
    } catch (err: any) {
      setStatusMsg(err?.message || "Logo upload failed");
    }
  }

  async function handleUploadAsset(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStatusMsg(`Uploading ${files.length} asset(s)...`);
    const results: { name: string; url: string; preview?: string }[] = [];
    for (const file of files) {
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.secureUpload(fd);
        results.push({ name: file.name, url: res.path || previewUrl || file.name, preview: previewUrl });
      } catch {
        results.push({ name: file.name, url: previewUrl || file.name, preview: previewUrl });
      }
    }
    setBrandAssets((prev) => [...prev, ...results]);
    setStatusMsg(`Added ${results.length} brand asset(s).`);
    // reset input so same file can be re-picked
    e.target.value = "";
  }

  async function handleGenerateDna() {
    if (!brandName.trim()) {
      setStatusMsg("Enter a Company / Brand Name first.");
      return;
    }
    setBusy(true);
    setStatusMsg("Generating complete vibes with Gemini AI...");
    try {
      const dna = await api.generateBrandDna({
        company_name: brandName.trim(),
        industry: industry.trim() || "Technology",
        business_description: description.trim() || mission.trim() || `${brandName} operating in ${industry}`,
        products_and_services: products.trim() || "Digital platform & services",
        target_audience: audience.trim() || "Modern digital customers",
        company_values: personality.trim() || "Authentic, Focused",
        brand_positioning: mission.trim() || `${visualStyle || "Clean"} leader in ${industry}`,
        desired_customer_perception: `${mood || "Confident"}; ${visualStyle || "Clean"}`,
        communication_personality: `${personality || "Authentic"}; tone: ${tone || "Direct"}`,
        reference_brands: "",
      });
      setDnaProfile(dna);
      const ai = dna.ai_recommendations || {};
      if (ai.colour_hex_codes?.length) setPalette(ai.colour_hex_codes.slice(0, 6));
      if (ai.brand_personality?.length) setPersonality(ai.brand_personality.slice(0, 5).join(", "));
      if (ai.words_to_avoid?.length && !disallowed.trim()) setDisallowed(ai.words_to_avoid.slice(0, 6).join(", "));
      if (ai.brand_positioning && !mission.trim()) setMission(ai.brand_positioning);
      setStatusMsg(`Gemini synthesized Brand DNA (${dna.dna_id}). Review and approve.`);
    } catch (err: any) {
      setStatusMsg(err?.message || "Gemini DNA generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveDna() {
    if (!dnaProfile?.dna_id) return;
    setBusy(true);
    try {
      const approved = await api.approveBrandDna(dnaProfile.dna_id, {
        approved_by: "Company Admin",
        approval_notes: "Approved from Next.js Company Vibes Studio",
        sync_to_platform_brand: true,
      });
      setDnaProfile(approved);
      const list = await refreshBrands();
      selectBrand(approved.brand_id, list);
      setStatusMsg(`Published '${approved.company_name}' vibes for developers.`);
    } catch (err: any) {
      setStatusMsg(err?.message || "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAndLock() {
    if (!brandName.trim()) {
      setStatusMsg("Company / Brand Name is required.");
      return;
    }
    setBusy(true);
    setStatusMsg("Saving & locking brand vibes...");
    try {
      const fd = new FormData();
      fd.append("brand_name", brandName.trim());
      fd.append("personality", personality.trim() || "Authentic");
      fd.append("mood", mood.trim() || "Focused");
      fd.append("communication_tone", tone.trim() || "Direct");
      fd.append("target_audience", audience.trim() || "General customers");
      fd.append("visual_style", visualStyle.trim() || "Clean, High-Contrast");
      fd.append("palette", JSON.stringify(palette));
      fd.append("disallowed_elements", JSON.stringify(csv(disallowed)));
      fd.append("tagline_or_mission", mission.trim() || description.trim());
      fd.append("logo_url", logoUrl);
      fd.append("brand_assets", JSON.stringify(brandAssets));

      const draft = await api.createBrandDraft(fd);
      const confirmed = await api.confirmBrand({
        brand_id: draft.brand_id,
        personality: csv(personality || "Authentic"),
        mood: csv(mood || "Focused"),
        communication_tone: csv(tone || "Direct"),
        visual_style: csv(visualStyle || "Clean"),
        target_audience: audience.trim() || "General customers",
        approved_palette: palette,
        disallowed_elements: csv(disallowed),
        mission_statement: mission.trim() || description.trim(),
        logo_url: logoUrl,
        confirmed_by: "Company Admin",
      });
      const list = await refreshBrands();
      selectBrand(confirmed.brand_id, list);
      setStatusMsg(`Saved & locked '${confirmed.brand_name}'.`);
    } catch (err: any) {
      setStatusMsg(err?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <TopNav active="company" onAuthChange={refreshBrands} />

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-xs font-semibold text-indigo-400">PAGE 02 &middot; COMPANY VIBE STUDIO</span>
            <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">Put Your Company&rsquo;s Vibes</h1>
          </div>
          <select
            value={selectedId}
            onChange={(e) => selectBrand(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="__new__">+ New Company Vibe Profile</option>
            {brands.map((b) => (
              <option key={b.brand_id} value={b.brand_id}>
                {b.brand_name} ({b.status})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-7">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Company / Brand Name *
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Apex Cloud Systems"
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Industry
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Technology"
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Personality Vibe
                <input
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="Architectural, Minimalist"
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Atmosphere / Mood
                <input
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  placeholder="Calm, Futuristic"
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Communication Tone
                <input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="Direct, Technically Rigorous"
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Visual Aesthetic
                <input
                  value={visualStyle}
                  onChange={(e) => setVisualStyle(e.target.value)}
                  placeholder="Swiss Grid, High Contrast"
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2 text-xs font-semibold text-slate-300">Approved Color Palette</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : "#3B82F6"}
                  onChange={(e) => setHexInput(e.target.value.toUpperCase())}
                  className="h-9 w-10 cursor-pointer rounded border border-slate-700 bg-transparent"
                />
                <input
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  maxLength={7}
                  className="w-28 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-white"
                />
                <button type="button" onClick={addHex} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                  + Add Color
                </button>
                <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  Extract from Image
                  <input type="file" accept="image/*" hidden onChange={handleExtractPalette} />
                </label>
                <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  Upload Logo
                  <input type="file" accept="image/*" hidden onChange={handleUploadLogo} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {palette.map((hex) => (
                  <span key={hex} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-xs">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: hex }} />
                    {hex}
                    <button type="button" onClick={() => setPalette(palette.filter((x) => x !== hex))} className="text-slate-400 hover:text-white">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <label className="block text-xs text-slate-400">
              Disallowed Words / Off-Brand Claims (comma-separated)
              <input
                value={disallowed}
                onChange={(e) => setDisallowed(e.target.value)}
                placeholder="cheap, guaranteed 100%, magic hack"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block text-xs text-slate-400">
              Mission / Approved Product Truths
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Verified facts, positioning, and messaging truths..."
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>

            {/* Brand Assets Upload */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-xs font-semibold text-slate-300">Brand Assets <span className="font-normal text-slate-500">(Optional)</span></div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Add other key assets like icons, patterns or imagery.</div>
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {brandAssets.length > 0 ? "Add more" : "Upload files"}
                  <input
                    type="file"
                    multiple
                    accept="image/*,.svg,.pdf"
                    hidden
                    onChange={handleUploadAsset}
                  />
                </label>
              </div>

              {brandAssets.length === 0 ? (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/40 py-4 text-center hover:border-slate-500 hover:bg-slate-900/60 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mb-1.5 h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-xs text-slate-400">Drag &amp; drop or click to browse</span>
                  <span className="mt-0.5 font-mono text-[10px] text-slate-600">PNG, SVG, JPG, PDF</span>
                  <input type="file" multiple accept="image/*,.svg,.pdf" hidden onChange={handleUploadAsset} />
                </label>
              ) : (
                <div className="space-y-1.5">
                  {brandAssets.map((asset, i) => {
                    const ext = asset.name.split(".").pop()?.toUpperCase() || "FILE";
                    const isImage = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(asset.name);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                      >
                        {/* Icon / thumbnail */}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 overflow-hidden">
                          {isImage && (asset.preview || (asset.url && (asset.url.startsWith("blob:") || asset.url.startsWith("http") || asset.url.startsWith("/")))) ? (
                            <img src={asset.preview || asset.url} alt={asset.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="font-mono text-[9px] font-bold text-slate-400">{ext}</span>
                          )}
                        </div>
                        {/* File name */}
                        <span className="flex-1 truncate text-xs text-slate-200" title={asset.name}>
                          {asset.name}
                        </span>
                        {/* Badge */}
                        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[9px] text-slate-500">
                          {ext}
                        </span>
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => setBrandAssets((prev) => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-slate-500 hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                  <div className="pt-0.5 text-right font-mono text-[10px] text-slate-600">
                    {brandAssets.length} file{brandAssets.length !== 1 ? "s" : ""} attached
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleGenerateDna}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Generate Full Vibes (Gemini AI)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveAndLock}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Save &amp; Lock Vibes
              </button>
            </div>
            {statusMsg && <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-indigo-300">{statusMsg}</div>}
          </div>

          <aside className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-5">
            <div className="space-y-5">
              <div>
                <span className="font-mono text-[11px] text-slate-400">LIVE VIBE BLUEPRINT</span>
                <h2 className="mt-1 text-2xl font-bold text-white">{brandName || "Your Brand Vibes"}</h2>
              </div>

              {logoUrl && <img src={logoUrl} alt="Company logo" className="h-14 w-auto rounded-lg border border-slate-800 bg-slate-950 p-1.5" />}

              <div>
                <div className="mb-2 font-mono text-[11px] text-slate-400">COLOR SYSTEM</div>
                <div className="flex flex-wrap gap-2">
                  {palette.map((hex) => (
                    <div key={hex} className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-center">
                      <div className="h-8 w-12 rounded" style={{ backgroundColor: hex }} />
                      <span className="font-mono text-[10px] text-slate-300">{hex}</span>
                    </div>
                  ))}
                </div>
              </div>

              {brandAssets.length > 0 && (
                <div>
                  <div className="mb-2 font-mono text-[11px] text-slate-400">BRAND ASSETS</div>
                  <div className="flex flex-wrap gap-2">
                    {brandAssets.map((asset, i) => (
                      <span
                        key={i}
                        title={asset.name}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#decfae] bg-[#f0e7d6] px-2.5 py-1 font-mono text-xs font-semibold text-[#2c333e] shadow-sm"
                      >
                        <svg className="h-3 w-3 shrink-0 text-[#786951]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="max-w-[120px] truncate">{asset.name.length > 14 ? asset.name.slice(0, 12) + "..." : asset.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {dnaProfile?.ai_recommendations && (
                <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 text-xs">
                  <div className="font-mono text-[11px] font-semibold text-indigo-300">GEMINI SYNTHESIZED BRAND DNA</div>
                  <p className="text-slate-300">{dnaProfile.ai_recommendations.brand_positioning}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleApproveDna}
                    className="mt-2 w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-500"
                  >
                    Approve &amp; Publish AI Vibes
                  </button>
                </div>
              )}
            </div>

            <Link
              href={selectedId && selectedId !== "__new__" ? `/check?brand=${encodeURIComponent(selectedId)}` : "/check"}
              className="mt-6 block rounded-xl border border-slate-700 bg-slate-950 py-2.5 text-center text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Test This Brand in Developer Check &rarr;
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
