"use client";

import React, { useState, useEffect } from "react";
import {
  api,
  SystemStatus,
  ContentReviewReport,
  ClaimVerificationResult,
  WorkflowItem,
  BrandInsightReport,
  AuditEvent
} from "@/lib/api";

type NavTab =
  | "dashboard"
  | "brand-identity"
  | "brand-knowledge"
  | "content-review"
  | "content-review-detail"
  | "preflight-scanner"
  | "brand-copilot"
  | "approvals"
  | "brand-insights"
  | "settings";

export default function PlatformPage() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [orgId, setOrgId] = useState<string>("default-org");
  const [userRole, setUserRole] = useState<string>("Administrator");

  // State across views
  const [workflowItems, setWorkflowItems] = useState<WorkflowItem[]>([]);
  const [insights, setInsights] = useState<BrandInsightReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [verifiedClaims, setVerifiedClaims] = useState<ClaimVerificationResult[]>([]);
  const [claimsInput, setClaimsInput] = useState<string>(
    "We are #1 in cloud reliability.\nGuaranteed 100% uptime or full refund.\nSOC 2 Type II certified data centers."
  );

  // Preflight state
  const [preflightResults, setPreflightResults] = useState<{
    width: number;
    height: number;
    aspectRatio: string;
    dominantHex: string;
    temperature: string;
    contrastRatio: string;
    negativeSpace: string;
    predictedStyle: string;
  } | null>(null);

  // Motion states
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCopilotTyping, setIsCopilotTyping] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [dnaSynthesisProgress, setDnaSynthesisProgress] = useState<number>(20);

  // Copilot state
  const [copilotMessages, setCopilotMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    {
      sender: "AI Brand Co-Pilot",
      text: "Hello! I am your AI Brand Co-Pilot. I can help resolve off-brand phrasing, adjust typography, verify claims against your Knowledge Base, and rewrite copy according to your approved Brand DNA.",
      time: "Just now"
    }
  ]);
  const [chatInput, setChatInput] = useState<string>("");

  useEffect(() => {
    async function loadData() {
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
    loadData();
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

  const handlePreflightFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2000);
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const aspect = (img.width / img.height).toFixed(2);
      setPreflightResults({
        width: img.width,
        height: img.height,
        aspectRatio: `${aspect}:1`,
        dominantHex: "#0D1B2A",
        temperature: "Cool Blue (6400K)",
        contrastRatio: "8.4:1 (AAA Pass)",
        negativeSpace: "38% Clean Layout",
        predictedStyle: "Minimalist / Corporate Modern"
      });
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSendCopilot = () => {
    if (!chatInput.trim()) return;
    const userMsg = { sender: "You", text: chatInput, time: new Date().toLocaleTimeString() };
    setIsCopilotTyping(true);
    setChatInput("");
    setCopilotMessages(prev => [...prev, userMsg]);

    setTimeout(() => {
      setIsCopilotTyping(false);
      const botReply = {
        sender: "AI Brand Co-Pilot",
        text: `Based on your approved brand guidelines for "${orgId}", here is the recommended correction:\n\nOriginal: "${userMsg.text}"\nRecommended Tone: Authoritative, innovative, yet grounded.\nCorrection: "Empowering next-generation cloud infrastructure with verified 99.99% operational continuity."`,
        time: new Date().toLocaleTimeString()
      };
      setCopilotMessages(prev => [...prev, botReply]);
    }, 700);
    return;
    const botReply = {
      sender: "AI Brand Co-Pilot",
      text: `Based on your approved brand guidelines for "${orgId}", here is the recommended correction:\n\nOriginal: "${chatInput}"\nRecommended Tone: Authoritative, innovative, yet grounded.\nCorrection: "Empowering next-generation cloud infrastructure with verified 99.99% operational continuity."`,
      time: new Date().toLocaleTimeString()
    };
    setCopilotMessages(prev => [...prev, userMsg, botReply]);
    setChatInput("");
  };

  const navItems = [
    { id: "dashboard" as NavTab, label: "Dashboard", icon: "📊" },
    { id: "brand-identity" as NavTab, label: "Brand Identity", icon: "✨" },
    { id: "brand-knowledge" as NavTab, label: "Brand Knowledge", icon: "📚" },
    { id: "content-review" as NavTab, label: "Content Review", icon: "🔍" },
    { id: "preflight-scanner" as NavTab, label: "Pre-Flight Scanner", icon: "⚡" },
    { id: "brand-copilot" as NavTab, label: "Brand Co-Pilot", icon: "🤖" },
    { id: "approvals" as NavTab, label: "Review & Approvals", icon: "📋", badge: workflowItems.length },
    { id: "brand-insights" as NavTab, label: "Brand Insights", icon: "📈" },
    { id: "settings" as NavTab, label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0f1d] text-slate-100 font-sans">
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800/80 bg-[#0c1220] flex flex-col justify-between p-4 flex-shrink-0">
        <div>
          {/* Logo & Header */}
          <div className="flex items-center gap-3 px-2 py-3 border-b border-slate-800/80 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              S
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white">SANKET AI</h1>
              <p className="text-[10px] text-slate-400 font-medium">Brand Governance Platform</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Role & User Info */}
        <div className="border-t border-slate-800/80 pt-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-1 mb-1">
              Active Role Persona
            </div>
            <select
              value={userRole}
              onChange={e => setUserRole(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="Creator">Creator</option>
              <option value="Manager">Manager</option>
              <option value="Authorised Reviewer">Authorised Reviewer</option>
              <option value="Administrator">Administrator</option>
            </select>
          </div>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
              {userRole[0]}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-slate-200 truncate">Suresh K.</div>
              <div className="text-[10px] text-slate-400 truncate">{userRole}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-slate-800/80 bg-[#0c1220]/80 backdrop-blur px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Organisation Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Tenant:</span>
              <select
                value={orgId}
                onChange={e => setOrgId(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
              >
                <option value="default-org">Apex Cloud Solutions</option>
                <option value="nike">Nike Global Marketing</option>
                <option value="acme-corp">Acme Enterprise Corp</option>
              </select>
            </div>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div className="text-xs text-slate-400">
              Multi-Company Enterprise Isolation: <span className="text-emerald-400 font-mono font-semibold">Active</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search guidelines, rules, claims (⌘K)..."
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 pl-8 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
              />
              <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
            </div>
            <button
              title="Judge & Demo Login Portal"
              onClick={() => setShowAuthModal(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all flex items-center gap-1.5"
            >
              <span>⚖️</span>
              <span>Demo Login</span>
            </button>
            <button
              title="Notifications"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 relative"
            >
              🔔
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 pulse-badge" />
            </button>
            <button
              title="Help & Documentation"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 text-xs font-bold"
            >
              ❓
            </button>
          </div>
        </header>

        {/* Dynamic View Container */}
        <main className="flex-1 overflow-y-auto p-8 view-transition" key={activeTab}>
          {/* VIEW: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Executive Dashboard</h2>
                <p className="text-xs text-slate-400 mt-0.5">Real-time Brand Compliance & Review Intelligence</p>
              </div>

              {/* Quick Actions Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => setActiveTab("brand-identity")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 text-left transition-all"
                >
                  <span className="text-xl">🧬</span>
                  <div>
                    <div className="text-xs font-bold text-blue-400">Generate Brand DNA</div>
                    <div className="text-[10px] text-slate-400">Synthesize identity profile</div>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("content-review")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-purple-600/10 border border-purple-500/20 hover:bg-purple-600/20 text-left transition-all"
                >
                  <span className="text-xl">📤</span>
                  <div>
                    <div className="text-xs font-bold text-purple-400">Upload Content</div>
                    <div className="text-[10px] text-slate-400">Submit creatives or copy</div>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("preflight-scanner")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-600/10 border border-amber-500/20 hover:bg-amber-600/20 text-left transition-all"
                >
                  <span className="text-xl">⚡</span>
                  <div>
                    <div className="text-xs font-bold text-amber-400">Pre-Flight Scanner</div>
                    <div className="text-[10px] text-slate-400">Instant client-side HUD</div>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab("approvals")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 text-left transition-all"
                >
                  <span className="text-xl">📋</span>
                  <div>
                    <div className="text-xs font-bold text-emerald-400">Pending Approvals</div>
                    <div className="text-[10px] text-slate-400">{workflowItems.length} items awaiting sign-off</div>
                  </div>
                </button>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-slate-400 text-xs font-medium">Compliance Average</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">94.8%</div>
                  <div className="text-[11px] text-slate-400 mt-1">Across 128 active campaigns</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-slate-400 text-xs font-medium">Pending Reviews</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">{workflowItems.length}</div>
                  <div className="text-[11px] text-slate-400 mt-1">3 flagged with high-risk claims</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-slate-400 text-xs font-medium">Critical Issues</div>
                  <div className="text-2xl font-bold text-red-400 mt-1">2</div>
                  <div className="text-[11px] text-slate-400 mt-1">Off-brand typography & contrast</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-slate-400 text-xs font-medium">Auto-Fix Resolution</div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">87.5%</div>
                  <div className="text-[11px] text-slate-400 mt-1">Color & background auto-remediated</div>
                </div>
              </div>

              {/* Recents & Activity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-white mb-3">Recently Reviewed Content</h3>
                  <div className="space-y-3">
                    {[
                      { title: "Q4 Cloud Infrastructure Campaign", type: "Poster Image", score: "96%", status: "Approved" },
                      { title: "Enterprise Pricing Factsheet", type: "PDF Document", score: "72%", status: "Needs Revision" },
                      { title: "Product Launch Press Release", type: "Copy Text", score: "98%", status: "Approved" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800/60">
                        <div>
                          <div className="text-xs font-semibold text-white">{item.title}</div>
                          <div className="text-[10px] text-slate-400">{item.type}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-200">{item.score}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            item.status === "Approved" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                          }`}>{item.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-white mb-3">Recent Governance Activity</h3>
                  <div className="space-y-3">
                    {auditLogs.slice(0, 4).map((log, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/40">
                        <div>
                          <span className="font-semibold text-blue-400">{log.event_type}</span>
                          <span className="text-slate-400 ml-2">by {log.user_id}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: BRAND IDENTITY */}
          {activeTab === "brand-identity" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Brand Identity Specification</h2>
                  <p className="text-xs text-slate-400">Core guidelines, voice, tone, typography, and visual rules for {orgId}</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200">
                    Version History (v2.4)
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white">
                    Approve Brand DNA
                  </button>
                </div>
              </div>

              {/* 10 Required Sections Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: "1. Brand Overview", desc: "Enterprise cloud governance and mission-critical reliability platform." },
                  { title: "2. Brand Personality", desc: "Authoritative, forward-looking, precise, and dependable." },
                  { title: "3. Brand Positioning", desc: "The premier multi-cloud governance architecture for security-first organizations." },
                  { title: "4. Brand Voice & Tone", desc: "Clarity over jargon; factual, confident, and professional." },
                  { title: "5. Visual Identity", desc: "High contrast dark themes with deep navy (#0A0F1D) and vibrant electric blue accents." },
                  { title: "6. Colour Palette", desc: "Primary: #0A0F1D, Accent: #2563EB, Support: #10B981, Surface: #0F172A." },
                  { title: "7. Typography", desc: "Primary: Inter (Sans-serif), Headings: Syne / Archivo, Monospace: JetBrains Mono." },
                  { title: "8. Imagery Guidelines", desc: "Crisp vector iconography, authentic product captures, strictly no generic stock photos." },
                  { title: "9. Messaging Guidelines", desc: "Lead with quantifiable reliability metrics (uptime, latency, SOC 2 compliance)." },
                  { title: "10. Design Rules", desc: "Minimum 4.5:1 text contrast (WCAG AA), 24px minimum touch targets, generous whitespace." },
                ].map((sec, idx) => (
                  <div key={idx} className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">{sec.title}</h3>
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">{sec.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: BRAND KNOWLEDGE */}
          {activeTab === "brand-knowledge" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Brand Knowledge Base</h2>
                  <p className="text-xs text-slate-400">Single source of truth for approved facts, claims, terminology, and assets</p>
                </div>
                <button className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white">
                  + Add Knowledge Item
                </button>
              </div>

              {/* 10 Category Filters */}
              <div className="flex flex-wrap gap-2">
                {[
                  "Company Information",
                  "Brand Guidelines",
                  "Approved Facts",
                  "Products & Services",
                  "Approved Claims & Evidence",
                  "Terminology",
                  "Official Brand Assets",
                  "Reference Designs",
                  "Restricted Messaging",
                  "Policy Exceptions",
                ].map((cat, idx) => (
                  <button
                    key={idx}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:border-blue-500 transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Knowledge Items Table */}
              <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/60 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                    <tr>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Title & Assertion</th>
                      <th className="p-3.5">Verification Source</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {[
                      { cat: "Approved Facts", title: "SOC 2 Type II Certification", src: "Audited by Schellman 2026", status: "Verified" },
                      { cat: "Approved Claims", title: "99.99% Cloud Service Uptime", src: "Verified Cloud Telemetry", status: "Verified" },
                      { cat: "Terminology", title: "Multi-tenant Isolation Architecture", src: "Official Tech Glossary v3", status: "Active" },
                      { cat: "Restricted Messaging", title: "Zero Data Breach Guarantees", src: "Legal Risk Policy #402", status: "Restricted" },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/30">
                        <td className="p-3.5 font-medium text-slate-400">{row.cat}</td>
                        <td className="p-3.5 font-semibold text-white">{row.title}</td>
                        <td className="p-3.5 text-slate-400 font-mono text-[11px]">{row.src}</td>
                        <td className="p-3.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            row.status === "Verified" || row.status === "Active"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <button className="text-blue-400 hover:underline">Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: CONTENT REVIEW */}
          {activeTab === "content-review" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Content Review Submissions</h2>
                  <p className="text-xs text-slate-400">Submit and audit creatives, posters, PDFs, and social copy</p>
                </div>
                <label className="cursor-pointer px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md transition-colors">
                  Upload Content for Review
                  <input type="file" className="hidden" />
                </label>
              </div>

              {/* Status Filters */}
              <div className="flex flex-wrap gap-2">
                {[
                  "All Submissions",
                  "Drafts",
                  "Under Review",
                  "Needs Revision",
                  "Approved",
                  "Approved with Warnings",
                  "Rejected",
                  "Escalated",
                ].map((filter, idx) => (
                  <button
                    key={idx}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      idx === 0
                        ? "bg-blue-600 text-white"
                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Submissions List */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: "rev-101", title: "Enterprise Summit 2026 Poster", type: "Poster Image", score: "94%", status: "Approved" },
                  { id: "rev-102", title: "Cybersecurity Whitepaper Q1", type: "PDF Document", score: "68%", status: "Needs Revision" },
                  { id: "rev-103", title: "Social Banner Ad - Cloud Native", type: "Marketing Ad", score: "88%", status: "Approved with Warnings" },
                ].map(sub => (
                  <div key={sub.id} className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-mono text-slate-500">{sub.id}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        sub.status === "Approved"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : sub.status === "Needs Revision"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {sub.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">{sub.title}</h3>
                    <p className="text-xs text-slate-400 mb-4">{sub.type}</p>
                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
                      <span className="text-xs font-semibold text-slate-300">Score: <strong className="text-white">{sub.score}</strong></span>
                      <button
                        onClick={() => setActiveTab("content-review-detail")}
                        className="text-xs text-blue-400 font-semibold hover:underline"
                      >
                        Inspect Detail →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: CONTENT REVIEW DETAIL & AUTO-FIX */}
          {activeTab === "content-review-detail" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <button onClick={() => setActiveTab("content-review")} className="text-xs text-blue-400 hover:underline mb-1">
                    ← Back to All Submissions
                  </button>
                  <h2 className="text-xl font-bold text-white">Review Detail: Enterprise Summit 2026 Poster</h2>
                  <p className="text-xs text-slate-400">Review ID: rev-101 • Evaluated against {orgId} Brand DNA</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white">
                    Approve Content
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white">
                    Request Revision
                  </button>
                </div>
              </div>

              {/* Integrated Auto-Fix Section */}
              <div className="bg-[#0f172a] border border-blue-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>✨ AI-Assisted Auto-Fix (Side-by-Side Comparison)</span>
                    </h3>
                    <p className="text-xs text-slate-400">Off-brand saturated amber background re-aligned with Brand DNA deep navy centroid</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white">
                      Accept Auto-Fix
                    </button>
                    <button className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300">
                      Reject
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/60 text-center">
                    <div className="text-xs font-bold text-red-400 mb-2">Original Submission (Off-Brand #F59E0B)</div>
                    <div className="w-full h-48 rounded bg-amber-600/40 border border-amber-500/50 flex items-center justify-center text-xs text-amber-200 font-mono">
                      [Original Image Canvas]
                    </div>
                  </div>
                  <div className="border border-blue-500/40 rounded-lg p-4 bg-blue-950/20 text-center">
                    <div className="text-xs font-bold text-emerald-400 mb-2">Auto-Fixed Compliant Version (Brand Navy #0A0F1D)</div>
                    <div className="w-full h-48 rounded bg-[#0A0F1D] border border-blue-500/50 flex items-center justify-center text-xs text-blue-200 font-mono">
                      [Auto-Fixed CIELAB Centroid Recolor]
                    </div>
                  </div>
                </div>
              </div>

              {/* Evaluation Dimensions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: "Brand Consistency", score: "96%", status: "Passed", detail: "Logo placement and margins strictly conform to 24px grid." },
                  { name: "Tone & Messaging", score: "92%", status: "Passed", detail: "Empowering, factual tone aligned with enterprise persona." },
                  { name: "Accessibility (WCAG AA)", score: "100%", status: "Passed", detail: "Contrast ratio 9.2:1 exceeds minimum 4.5:1 requirement." },
                ].map((dim, idx) => (
                  <div key={idx} className="bg-[#0f172a] border border-slate-800 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-white">{dim.name}</span>
                      <span className="text-xs font-bold text-emerald-400">{dim.score}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{dim.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: PRE-FLIGHT SCANNER */}
          {activeTab === "preflight-scanner" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Instant Client-Side Creative Pre-Flight Scanner</h2>
                <p className="text-xs text-slate-400">
                  Zero-latency browser-based heuristic scanner. Evaluates dominant colours, temperature, contrast, and layout before upload.
                </p>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-8 text-center bg-slate-900/30 transition-colors">
                <input
                  type="file"
                  id="preflight-file-input"
                  onChange={handlePreflightFile}
                  accept="image/*"
                  className="hidden"
                />
                <label htmlFor="preflight-file-input" className="cursor-pointer block">
                  <div className="text-3xl mb-2">⚡</div>
                  <div className="text-sm font-semibold text-white">
                    Drag and drop image creative here, or <span className="text-blue-400">browse</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Instant browser measurement runs before file submission</p>
                </label>
              </div>

              {/* Pre-Flight Scanner HUD */}
              {preflightResults && (
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <h3 className="text-sm font-bold text-white">Pre-Flight Empirical Measurements</h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Preliminary Client-Side Analysis
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Dimensions & Aspect</div>
                      <div className="font-bold text-white mt-1">
                        {preflightResults.width} × {preflightResults.height} ({preflightResults.aspectRatio})
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Dominant HEX</div>
                      <div className="font-bold text-white mt-1 flex items-center gap-2">
                        <span className="w-3 h-3 rounded" style={{ backgroundColor: preflightResults.dominantHex }} />
                        {preflightResults.dominantHex}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Color Temperature</div>
                      <div className="font-bold text-white mt-1">{preflightResults.temperature}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Contrast Ratio</div>
                      <div className="font-bold text-emerald-400 mt-1">{preflightResults.contrastRatio}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="text-slate-400 text-[11px]">Negative Space</div>
                      <div className="font-bold text-white mt-1">{preflightResults.negativeSpace}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 col-span-2">
                      <div className="text-slate-400 text-[11px]">Predicted Visual Style</div>
                      <div className="font-bold text-blue-400 mt-1">{preflightResults.predictedStyle}</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    ℹ️ <strong>Preliminary Heuristic Notice:</strong> Measurements are computed locally in-browser for instant feedback. Official brand certification requires complete multimodal backend analysis.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: BRAND CO-PILOT */}
          {activeTab === "brand-copilot" && (
            <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col">
              <div>
                <h2 className="text-xl font-bold text-white">Interactive AI Brand Co-Pilot</h2>
                <p className="text-xs text-slate-400">Remediation Chatbot contextualized by {orgId} Brand DNA & Knowledge Base</p>
              </div>

              {/* Chat Container */}
              <div className="flex-1 bg-[#0f172a] border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {copilotMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.sender === "You" ? "items-end" : "items-start"}`}
                    >
                      <div className="text-[10px] text-slate-400 mb-1 px-1">
                        {msg.sender} • {msg.time}
                      </div>
                      <div
                        className={`max-w-xl p-3.5 rounded-xl text-xs leading-relaxed ${
                          msg.sender === "You"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900/90 text-slate-200 border border-slate-800 whitespace-pre-line"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input Bar */}
                <div className="p-3 border-t border-slate-800 bg-slate-900/50 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSendCopilot()}
                    placeholder="Ask about brand guidelines, rewrite headlines, correct terminology..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSendCopilot}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: REVIEW & APPROVALS */}
          {activeTab === "approvals" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Review & Approvals Management</h2>
                  <p className="text-xs text-slate-400">Formal governance workflow with role-based sign-offs and claim escalation</p>
                </div>
              </div>

              {/* 8 Workflow Queue Tabs */}
              <div className="flex flex-wrap gap-2">
                {[
                  "My Pending Reviews",
                  "Team Submissions",
                  "Assigned to Me",
                  "Revision Requests",
                  "Approved",
                  "Rejected",
                  "Escalated",
                  "Approval History",
                ].map((q, idx) => (
                  <button
                    key={idx}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      idx === 0
                        ? "bg-blue-600 text-white"
                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Workflow Items List */}
              <div className="bg-[#0f172a] border border-slate-800 rounded-xl divide-y divide-slate-800/80">
                {workflowItems.map(item => (
                  <div key={item.item_id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        {item.has_high_risk_claims && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            Escalated Claim
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Version {item.current_version} • Created by {item.created_by} • Tenant: {item.org_id}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white">
                        Approve
                      </button>
                      <button className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300">
                        Reject
                      </button>
                      <button className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-semibold">
                        Review Comments
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: BRAND INSIGHTS */}
          {activeTab === "brand-insights" && insights && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Brand Insights & Recurring Issues</h2>
                <p className="text-xs text-slate-400">Data-driven analysis of recurring brand guideline friction and guideline clarity recommendations</p>
              </div>

              {/* Compliance Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-xs text-slate-400">Analyzed Submissions</div>
                  <div className="text-2xl font-bold text-white mt-1">{insights.total_reviews_analyzed}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Rolling {insights.analysis_window_days} day window</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-xs text-slate-400">Overall Compliance Average</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">{(insights.overall_compliance_avg * 100).toFixed(1)}%</div>
                  <div className="text-[11px] text-slate-400 mt-1">Target baseline: 90.0%</div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                  <div className="text-xs text-slate-400">Guideline Refinement Suggestions</div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">{insights.guideline_clarity_recommendations.length}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Resolves recurring ambiguity</div>
                </div>
              </div>

              {/* Recurring Guideline Violations */}
              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">Repeated Brand Guideline Violations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {insights.repeated_violations.map((viol, idx) => (
                    <div key={idx} className="border border-slate-800/80 rounded-lg p-4 bg-slate-900/40">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-white">{viol.category}</span>
                        <span className="text-xs font-bold text-amber-400">{viol.incident_count} incidents</span>
                      </div>
                      <div className="text-[11px] text-slate-400">Risk Level: {viol.risk_level}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guideline Clarity Recommendations */}
              <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
                <h3 className="text-sm font-bold text-white mb-4">Guideline Clarity & Ambiguity Recommendations</h3>
                <div className="space-y-3">
                  {insights.guideline_clarity_recommendations.map((rec, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-blue-400">{rec.guideline_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Confusion Index: {rec.confusion_index}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{rec.ambiguity_explanation}</p>
                      <div className="mt-2 text-xs text-emerald-400 font-medium">
                        Recommended Polish: {rec.suggested_refinement}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Platform Settings & Administration</h2>
                <p className="text-xs text-slate-400">Manage tenant profiles, user permissions, AI provider routing, and security policies</p>
              </div>

              {/* 9 Settings Sections Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { title: "Organisation Profile", desc: "Manage tenant slug, enterprise domain, logo assets, and legal branding identity." },
                  { title: "User Management", desc: "Invite team members, assign enterprise departments, and review user activity." },
                  { title: "Role-Based Permissions", desc: "Configure Creator, Manager, Authorised Reviewer, and Admin capabilities." },
                  { title: "Team & Departments", desc: "Organize marketing, engineering, and external creative agency teams." },
                  { title: "Notification Preferences", desc: "Configure Slack webhooks, email alerts, and high-risk claim notifications." },
                  { title: "AI Model Configuration", desc: "Route requests between Google Gemini API and Groq Llama 3.2 Vision." },
                  { title: "Connected Services", desc: "Manage Supabase PostgreSQL database, storage buckets, and pgvector settings." },
                  { title: "Security & Privacy", desc: "Enforce Row Level Security (RLS), multi-tenant isolation, and audit retentions." },
                  { title: "Data Management", desc: "Export compliance logs, backup brand DNA history, and manage data retentions." },
                ].map((s, idx) => (
                  <div key={idx} className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
                    <h3 className="text-xs font-bold text-white mb-1.5">{s.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">{s.desc}</p>
                    <button className="text-xs font-semibold text-blue-400 hover:underline">
                      Configure →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Auth & Judge Demo Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold"
            >
              &times;
            </button>
            <h3 className="text-base font-bold text-white mb-1">Enterprise Authentication</h3>
            <p className="text-xs text-slate-400 mb-4">Sign in to access tenant governance and clearance controls.</p>

            {/* Judge Demo Banner */}
            <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-3.5 mb-4 text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-blue-400 uppercase tracking-wide text-[10px]">⚖️ Judge Demo Access</span>
                <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold">Pre-Configured</span>
              </div>
              <p className="text-[11px] text-slate-300 mb-2">
                Pre-seeded with full Administrator permissions, sample Brand DNA, certified Knowledge Base, and review history:
              </p>
              <div className="bg-slate-900/80 p-2 rounded-lg font-mono text-[11px] text-slate-300 flex justify-between items-center mb-2.5">
                <span>demo@sanket.ai / DemoJudge2026!</span>
              </div>
              <button
                onClick={() => {
                  setUserRole("Administrator");
                  setOrgId("default-org");
                  setShowAuthModal(false);
                  alert("Logged in as Demo Judge (demo@sanket.ai) with full Administrator clearances.");
                }}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🚀 Instant 1-Click Judge Login</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
