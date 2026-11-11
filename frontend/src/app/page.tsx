"use client";

import React, { useState, useEffect } from "react";
import { api, SystemStatus, ContentReviewReport, ClaimVerificationResult, WorkflowItem, BrandInsightReport, AuditEvent } from "@/lib/api";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [orgId, setOrgId] = useState<string>("default-org");
  const [userRole, setUserRole] = useState<string>("Administrator");

  // Sample data states
  const [reviewReport, setReviewReport] = useState<ContentReviewReport | null>(null);
  const [verifiedClaims, setVerifiedClaims] = useState<ClaimVerificationResult[]>([]);
  const [workflowItems, setWorkflowItems] = useState<WorkflowItem[]>([]);
  const [insights, setInsights] = useState<BrandInsightReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [claimsInput, setClaimsInput] = useState<string>("We are #1 in cloud reliability.\nGuaranteed 100% uptime or full refund.\nSOC 2 Type II certified data centers.");

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const status = await api.getSystemStatus();
        setSystemStatus(status);
        const wf = await api.listWorkflowItems(orgId);
        setWorkflowItems(wf);
        const rep = await api.getBrandInsights(orgId);
        setInsights(rep);
        const logs = await api.getAuditLogs(orgId, userRole);
        setAuditLogs(logs);
      } catch (err) {
        console.warn("Backend not yet responding on Next.js proxy:", err);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [orgId, userRole]);

  const handleVerifyClaims = async () => {
    try {
      const claimsList = claimsInput.split("\n").map(s => s.trim()).filter(Boolean);
      const results = await api.verifyClaims(claimsList, orgId);
      setVerifiedClaims(results);
    } catch (err: any) {
      alert(`Claim verification failed: ${err.message}`);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#090d16] text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-[#0c1220] flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center gap-3 px-2 py-4 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">
              S
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white">SANKET AI</h1>
              <p className="text-[11px] text-slate-400">Brand Governance Engine</p>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            {[
              { id: "overview", label: "Overview & Status", icon: "📊" },
              { id: "review", label: "Content Review Audit", icon: "🔍" },
              { id: "claims", label: "Claim Verification", icon: "🛡️" },
              { id: "workflow", label: "Review & Approval", icon: "📋" },
              { id: "insights", label: "Brand Insights", icon: "📈" },
              { id: "audit", label: "Audit & Security Logs", icon: "🔒" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tenant & Role Controls */}
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-2">Tenant Scope</div>
          <select
            value={orgId}
            onChange={e => setOrgId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-xs rounded px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="default-org">default-org (Apex Cloud)</option>
            <option value="nike">nike (Nike Global)</option>
            <option value="acme-corp">acme-corp (Acme Enterprise)</option>
          </select>

          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-2 mt-2">Active Role</div>
          <select
            value={userRole}
            onChange={e => setUserRole(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-xs rounded px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="Creator">Creator</option>
            <option value="Manager">Manager</option>
            <option value="Authorised Reviewer">Authorised Reviewer</option>
            <option value="Administrator">Administrator</option>
          </select>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center pb-6 border-b border-slate-800/60 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white capitalize">{activeTab.replace("-", " ")}</h2>
            <p className="text-xs text-slate-400 mt-1">Multi-tenant AI Brand Governance & Architecture</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              FastAPI Core Operational
            </span>
          </div>
        </header>

        {/* Tab 1: Overview & Status */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="text-slate-400 text-xs font-medium">Multimodal AI Engine</div>
                <div className="text-lg font-bold text-white mt-1">Gemini API + Groq API</div>
                <div className="text-xs text-blue-400 mt-2">Modular Vision & Reasoning</div>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="text-slate-400 text-xs font-medium">Database & Vectors</div>
                <div className="text-lg font-bold text-white mt-1">Supabase + pgvector</div>
                <div className="text-xs text-emerald-400 mt-2">RLS Row Level Isolation</div>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="text-slate-400 text-xs font-medium">Vision & OCR Pipeline</div>
                <div className="text-lg font-bold text-white mt-1">OpenCV + Tesseract</div>
                <div className="text-xs text-indigo-400 mt-2">Deterministic Measurements</div>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="text-slate-400 text-xs font-medium">Cloud Hosting</div>
                <div className="text-lg font-bold text-white mt-1">Render Cloud</div>
                <div className="text-xs text-amber-400 mt-2">FastAPI + Next.js React</div>
              </div>
            </div>

            {/* AI Provider Status Card */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Modular AI Providers</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-800/80 rounded-lg p-4 bg-slate-900/50">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-slate-200">Google Gemini API</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Primary Multimodal</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Handles complex visual aesthetics, tone analysis, brand DNA synthesis, and multimodal inspection.
                  </p>
                </div>

                <div className="border border-slate-800/80 rounded-lg p-4 bg-slate-900/50">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-slate-200">Groq Cloud API</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Llama 3.2 Vision</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Provides ultra-low latency inference, high-throughput claim parsing, and instant visual verification.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Claims Verification */}
        {activeTab === "claims" && (
          <div className="space-y-6">
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white mb-2">Factual Accuracy & Promotional Claim Verification</h3>
              <p className="text-xs text-slate-400 mb-4">
                Extracts claims and compares against official Knowledge Base evidence. High-risk claims require human sign-off.
              </p>
              <textarea
                value={claimsInput}
                onChange={e => setClaimsInput(e.target.value)}
                rows={4}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleVerifyClaims}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
              >
                Verify Against Knowledge Base
              </button>
            </div>

            {verifiedClaims.length > 0 && (
              <div className="space-y-3">
                {verifiedClaims.map(res => (
                  <div key={res.claim_id} className="bg-[#0f172a] border border-slate-800 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-sm text-white">"{res.claim_text}"</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                        res.classification === "VERIFIED"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {res.classification}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{res.explanation}</p>
                    <div className="mt-2 text-xs text-blue-400 font-medium">Recommended: {res.recommended_action}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Workflow */}
        {activeTab === "workflow" && (
          <div className="space-y-4">
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white mb-4">Review & Approval Workflow Queue ({orgId})</h3>
              <div className="divide-y divide-slate-800/80">
                {workflowItems.map(item => (
                  <div key={item.item_id} className="py-3 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-white">{item.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Version {item.current_version} • Created by {item.created_by}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.has_high_risk_claims && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
                          High-Risk Claim
                        </span>
                      )}
                      <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-medium">
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Insights */}
        {activeTab === "insights" && insights && (
          <div className="space-y-6">
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white mb-2">Recurring Guideline Violations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {insights.repeated_violations.map((v, i) => (
                  <div key={i} className="border border-slate-800 rounded-lg p-4 bg-slate-900/40">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs text-slate-200">{v.category}</span>
                      <span className="text-xs text-amber-400 font-bold">{v.incident_count} incidents</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">Risk: {v.risk_level}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Audit Logs */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-white mb-4">Immutable Audit Trail ({orgId})</h3>
              <div className="divide-y divide-slate-800/80 font-mono text-xs">
                {auditLogs.slice(0, 15).map(log => (
                  <div key={log.id} className="py-2.5 flex justify-between items-center text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="font-semibold text-blue-400">{log.event_type}</span>
                      <span className="text-slate-400">by {log.user_id} ({log.user_role})</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      log.severity === "CRITICAL" || log.severity === "HIGH"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {log.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
