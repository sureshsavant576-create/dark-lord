"use client";

import React, { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { api } from "@/lib/api";

export default function DeveloperCheckPage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [brandId, setBrandId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [copyText, setCopyText] = useState("");
  const [report, setReport] = useState<any>(null);
  const [preflight, setPreflight] = useState<any>(null);
  const [remediation, setRemediation] = useState<any>(null);
  const [copilotInput, setCopilotInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadBrandsList() {
    const list = await api.listBrands().catch(() => []);
    const arr = Array.isArray(list) ? list : [];
    setBrands(arr);
    const params = new URLSearchParams(window.location.search);
    const qBrand = params.get("brand");
    if (qBrand && arr.some((b) => b.brand_id === qBrand)) {
      setBrandId(qBrand);
    } else if (arr.length && !brandId) {
      setBrandId(arr[0].brand_id);
    }
  }

  useEffect(() => {
    loadBrandsList();
  }, []);

  const selectedBrand = brands.find((b) => b.brand_id === brandId);

  function handleFilePick(picked: File | null) {
    setFile(picked);
    setErrorMsg("");
    if (picked && picked.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(picked));
    } else {
      setPreviewUrl("");
    }
  }

  async function handleQuickScan() {
    if (!file) {
      setErrorMsg("Attach an image file first.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (brandId) fd.append("brand_id", brandId);
      const scan = await api.preflightScan(fd);
      setPreflight(scan);
      setReport(null);
    } catch (err: any) {
      setErrorMsg(err?.message || "Quick scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleFullCheck() {
    if (!brandId) {
      setErrorMsg("Select a target company vibe profile.");
      return;
    }
    if (!file && !copyText.trim()) {
      setErrorMsg("Provide a creative upload or copy text.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    setRemediation(null);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (copyText.trim()) fd.append("copy_text", copyText.trim());
      const res = await api.inspectContent(brandId, fd);
      setReport(res);
      setPreflight(null);
    } catch (err: any) {
      setErrorMsg(err?.message || "Match check failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoFix() {
    if (!brandId || !file) {
      setErrorMsg("Upload an image file to run Auto-Fix.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.autoRemediate(brandId, fd);
      setRemediation(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Auto-Fix failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAskCopilot(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId || !copilotInput.trim()) return;
    const msg = copilotInput.trim();
    setCopilotInput("");
    setMessages((prev) => [...prev, { role: "You", text: msg }]);
    try {
      const res = await api.copilotChat(brandId, {
        brand_id: brandId,
        message: msg,
        inspection_id: report?.inspection_id,
        copy_text: copyText.trim() || undefined,
      });
      setMessages((prev) => [...prev, { role: "Co-Pilot", text: res.reply || "" }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "Error", text: err?.message || "Co-Pilot error" }]);
    }
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <TopNav active="check" onAuthChange={loadBrandsList} />

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6">
          <span className="font-mono text-xs font-semibold text-emerald-400">PAGE 03 &middot; DEVELOPER VIBE VERIFIER</span>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">Check Whether Your Work Matches</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300">1. Target Company Vibes</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white"
              >
                {!brands.length && <option value="">No company vibes created yet</option>}
                {brands.map((b) => (
                  <option key={b.brand_id} value={b.brand_id}>
                    {b.brand_name}
                  </option>
                ))}
              </select>
              {selectedBrand && (
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedBrand.approved_palette || []).map((hex: string) => (
                      <span key={hex} className="h-4 w-4 rounded border border-white/15" style={{ backgroundColor: hex }} title={hex} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Avoid: {(selectedBrand.disallowed_elements || []).join(", ") || "None"}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">2. Upload Poster / UI Screenshot / PDF</label>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-center hover:border-emerald-500/60">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
                />
                {previewUrl ? (
                  <img src={previewUrl} alt="Upload preview" className="max-h-40 rounded-lg" />
                ) : (
                  <span className="text-xs text-slate-400">{file ? file.name : "Click to select PNG, JPG, WebP, or PDF"}</span>
                )}
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">3. Paste Copy / Headline / UI Text</label>
              <textarea
                rows={4}
                value={copyText}
                onChange={(e) => setCopyText(e.target.value)}
                placeholder="Paste copy text or marketing claims to check with Groq..."
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white"
              />
            </div>

            {errorMsg && <div className="rounded-xl bg-red-950/60 px-3 py-2 text-xs text-red-300">{errorMsg}</div>}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleFullCheck}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Checking..." : "Check Vibe Match"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleQuickScan}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Quick Color Scan
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-7">
            {!report && !preflight ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-slate-400">
                <h3 className="text-lg font-bold text-white">Ready to Verify Match</h3>
                <p className="mt-2 max-w-md text-xs leading-relaxed">
                  Submit an asset, copy snippet, or both to check color CIELAB match, WCAG contrast, Gemini visual inspection, and Groq copy reasoning.
                </p>
              </div>
            ) : preflight ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Quick Pre-Flight Scan</h2>
                  <span className="rounded-full bg-indigo-500/20 px-3 py-1 font-mono text-xs text-indigo-300">
                    {preflight.brand_alignment ? `${Math.round(preflight.brand_alignment.alignment_score)}% Match` : "Scanned"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(preflight.dominant_swatches || []).map((hex: string) => (
                    <span key={hex} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-xs">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: hex }} />
                      {hex}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-400">{preflight.preliminary_disclaimer}</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div>
                    <span className="font-mono text-xs font-bold text-emerald-400">{report.verdict}</span>
                    <h2 className="text-xl font-bold text-white">{report.brand_name}</h2>
                    <p className="mt-1 text-xs text-slate-400">{report.ai_explanation || "Inspection complete."}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-extrabold text-white">
                      {Math.round(report.overall_score ?? report.deterministic_score ?? 0)}
                    </span>
                    <span className="text-xs text-slate-400">/100</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-mono text-[11px] text-slate-400">MISMATCHES &amp; FIXES</div>
                  {(report.findings || []).filter((f: any) => f.severity !== "PASS" && f.severity !== "INFO").map((f: any) => (
                    <div key={f.id} className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs">
                      <div className="font-bold text-white">{f.title}</div>
                      <p className="mt-1 text-slate-300">{f.explanation}</p>
                      {f.suggested_correction && <p className="mt-1 text-emerald-300">Fix: {f.suggested_correction}</p>}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy || !file}
                    onClick={handleAutoFix}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Auto-Fix Off-Brand Colors
                  </button>
                </div>

                {remediation && (
                  <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-2">
                    <div>
                      <div className="mb-1 font-mono text-[10px] text-slate-400">ORIGINAL</div>
                      <img src={remediation.original_image_url} alt="Original" className="w-full rounded-lg" />
                    </div>
                    <div>
                      <div className="mb-1 font-mono text-[10px] text-emerald-400">AUTO-FIXED ({remediation.color_compliance_score}%)</div>
                      <img src={remediation.remediated_image_url} alt="Remediated" className="w-full rounded-lg" />
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="mb-2 text-xs font-bold text-white">Ask Brand Co-Pilot (Groq)</div>
                  <div className="mb-3 max-h-40 space-y-2 overflow-y-auto text-xs">
                    {messages.map((m, i) => (
                      <div key={i} className="rounded-lg bg-slate-900 px-3 py-2">
                        <strong className="text-indigo-300">{m.role}: </strong>
                        <span className="text-slate-200">{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleAskCopilot} className="flex gap-2">
                    <input
                      value={copilotInput}
                      onChange={(e) => setCopilotInput(e.target.value)}
                      placeholder="Ask how to fix these mismatches..."
                      className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                    />
                    <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                      Send
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
