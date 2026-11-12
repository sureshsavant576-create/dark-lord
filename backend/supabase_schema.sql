-- ============================================================================
-- Sanket AI — Complete Supabase PostgreSQL Schema & Row-Level Security (RLS)
-- Covers:
-- 1. Organisations & Company Registration
-- 2. Brand DNA Profiles
-- 3. Brand Knowledge Base (+ pgvector support)
-- 4. AI Content Analysis History
-- 5. Organisational Approval Workflows
-- 6. Brand Insights Reports
-- Run this SQL once in Supabase Dashboard -> SQL Editor for project:
--   xtrkwaoanvnwqrgyzfmh
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Organisations
CREATE TABLE IF NOT EXISTS public.organizations (
  org_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  industry TEXT DEFAULT 'Technology',
  business_description TEXT DEFAULT '',
  website TEXT DEFAULT '',
  primary_domain TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  primary_colors JSONB DEFAULT '[]'::jsonb,
  owner_user_id TEXT NOT NULL,
  subscription_tier TEXT DEFAULT 'Standard',
  ai_provider_preference TEXT DEFAULT 'gemini',
  api_webhook_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Brand DNA Profiles
CREATE TABLE IF NOT EXISTS public.brand_dna_profiles (
  dna_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  status TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT TRUE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  company_facts JSONB NOT NULL,
  ai_recommendations JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Brand Knowledge Base Items
CREATE TABLE IF NOT EXISTS public.brand_knowledge_items (
  item_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  structured_data JSONB DEFAULT '{}'::jsonb,
  confidentiality_level TEXT DEFAULT 'INTERNAL',
  provenance TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT TRUE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  superseded_by TEXT,
  version_notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AI Content Analysis History
CREATE TABLE IF NOT EXISTS public.content_reviews (
  review_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_filename TEXT,
  overall_score DOUBLE PRECISION NOT NULL,
  is_approved BOOLEAN NOT NULL,
  text_model_used TEXT,
  vision_model_used TEXT,
  detected_issues JSONB DEFAULT '[]'::jsonb,
  measurable_properties JSONB DEFAULT '{}'::jsonb,
  extracted_text TEXT DEFAULT '',
  knowledge_base_citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Organisational Approval Workflows
CREATE TABLE IF NOT EXISTS public.workflow_items (
  item_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  current_version INT DEFAULT 1,
  submitted_by_id TEXT,
  submitted_by_name TEXT,
  assigned_reviewer_role TEXT,
  has_high_risk_claims BOOLEAN DEFAULT FALSE,
  versions JSONB DEFAULT '[]'::jsonb,
  comments JSONB DEFAULT '[]'::jsonb,
  audit_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Brand Insights Reports
CREATE TABLE IF NOT EXISTS public.brand_insights_reports (
  report_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  data_sufficiency TEXT NOT NULL,
  total_reviews_analyzed INT DEFAULT 0,
  report_payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on all tenant tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_dna_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_insights_reports ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies (drop first for idempotency)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'organizations',
    'brand_dna_profiles',
    'brand_knowledge_items',
    'content_reviews',
    'workflow_items',
    'brand_insights_reports'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_all" ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_all" ON public.%I FOR ALL ' ||
      'USING (org_id = current_setting(''app.current_org_id'', true) OR org_id = auth.jwt() ->> ''org_id'') ' ||
      'WITH CHECK (org_id = current_setting(''app.current_org_id'', true) OR org_id = auth.jwt() ->> ''org_id'');',
      tbl
    );
  END LOOP;
END $$;
