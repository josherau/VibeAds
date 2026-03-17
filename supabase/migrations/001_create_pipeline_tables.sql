-- ============================================================
-- 001_create_pipeline_tables.sql
-- Competitor Intelligence Pipeline Tables
-- ============================================================

-- 1. competitors
CREATE TABLE competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  website_url text,
  meta_page_id text,
  instagram_handle text,
  twitter_handle text,
  linkedin_url text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_competitors_brand_id ON competitors(brand_id);
CREATE INDEX idx_competitors_user_id ON competitors(user_id);
CREATE INDEX idx_competitors_is_active ON competitors(is_active);

-- 2. competitor_ads
CREATE TABLE competitor_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('meta_ad_library','instagram','twitter','linkedin','landing_page')),
  external_id text,
  ad_type text CHECK (ad_type IN ('image','video','carousel','text')),
  headline text,
  body_text text,
  cta_text text,
  media_urls text[],
  landing_page_url text,
  engagement_metrics jsonb,
  is_active boolean,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source, external_id)
);

CREATE INDEX idx_competitor_ads_competitor_id ON competitor_ads(competitor_id);
CREATE INDEX idx_competitor_ads_source ON competitor_ads(source);
CREATE INDEX idx_competitor_ads_first_seen_at ON competitor_ads(first_seen_at);
CREATE INDEX idx_competitor_ads_is_active ON competitor_ads(is_active);

-- 3. competitor_content
CREATE TABLE competitor_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('instagram','twitter','linkedin','website')),
  external_id text,
  content_type text CHECK (content_type IN ('post','story','reel','article','landing_page')),
  title text,
  body_text text,
  media_urls text[],
  engagement_metrics jsonb,
  published_at timestamptz,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source, external_id)
);

CREATE INDEX idx_competitor_content_competitor_id ON competitor_content(competitor_id);
CREATE INDEX idx_competitor_content_source ON competitor_content(source);
CREATE INDEX idx_competitor_content_published_at ON competitor_content(published_at);

-- 4. pipeline_runs (created before competitor_analyses so it can be referenced)
CREATE TABLE pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id),
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  steps_completed text[],
  error_log jsonb,
  meta_ads_found integer DEFAULT 0,
  social_posts_found integer DEFAULT 0,
  pages_analyzed integer DEFAULT 0,
  creatives_generated integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer
);

CREATE INDEX idx_pipeline_runs_brand_id ON pipeline_runs(brand_id);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_started_at ON pipeline_runs(started_at);

-- 5. competitor_analyses
CREATE TABLE competitor_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  analysis_type text NOT NULL CHECK (analysis_type IN ('weekly_summary','trend_alert','competitive_gap')),
  title text,
  summary text,
  patterns jsonb,
  opportunities jsonb,
  pipeline_run_id uuid REFERENCES pipeline_runs(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_competitor_analyses_brand_id ON competitor_analyses(brand_id);
CREATE INDEX idx_competitor_analyses_analysis_type ON competitor_analyses(analysis_type);
CREATE INDEX idx_competitor_analyses_pipeline_run_id ON competitor_analyses(pipeline_run_id);

-- 6. generated_creatives
CREATE TABLE generated_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  analysis_id uuid REFERENCES competitor_analyses(id),
  platform text NOT NULL CHECK (platform IN ('meta','google','linkedin','general')),
  format text NOT NULL CHECK (format IN ('single_image','carousel','video_script','search_ad')),
  headline text,
  headline_variants text[],
  primary_text text,
  primary_text_variants text[],
  description text,
  cta text,
  image_prompt text,
  image_concept_description text,
  suggested_colors jsonb,
  target_audience text,
  competitive_angle text,
  confidence_score numeric(3,2),
  status text DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','launched')),
  feedback text CHECK (feedback IN ('up','down') OR feedback IS NULL),
  pipeline_run_id uuid REFERENCES pipeline_runs(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_generated_creatives_brand_id ON generated_creatives(brand_id);
CREATE INDEX idx_generated_creatives_user_id ON generated_creatives(user_id);
CREATE INDEX idx_generated_creatives_analysis_id ON generated_creatives(analysis_id);
CREATE INDEX idx_generated_creatives_platform ON generated_creatives(platform);
CREATE INDEX idx_generated_creatives_status ON generated_creatives(status);
CREATE INDEX idx_generated_creatives_pipeline_run_id ON generated_creatives(pipeline_run_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- competitors: users manage their own competitors
CREATE POLICY "Users can view their own competitors"
  ON competitors FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own competitors"
  ON competitors FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own competitors"
  ON competitors FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own competitors"
  ON competitors FOR DELETE
  USING (user_id = auth.uid());

-- competitor_ads: access through competitor ownership
CREATE POLICY "Users can view ads for their competitors"
  ON competitor_ads FOR SELECT
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert ads for their competitors"
  ON competitor_ads FOR INSERT
  WITH CHECK (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can update ads for their competitors"
  ON competitor_ads FOR UPDATE
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete ads for their competitors"
  ON competitor_ads FOR DELETE
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

-- competitor_content: access through competitor ownership
CREATE POLICY "Users can view content for their competitors"
  ON competitor_content FOR SELECT
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert content for their competitors"
  ON competitor_content FOR INSERT
  WITH CHECK (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can update content for their competitors"
  ON competitor_content FOR UPDATE
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete content for their competitors"
  ON competitor_content FOR DELETE
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

-- competitor_analyses: access through brand ownership
CREATE POLICY "Users can view analyses for their brands"
  ON competitor_analyses FOR SELECT
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert analyses for their brands"
  ON competitor_analyses FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update analyses for their brands"
  ON competitor_analyses FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete analyses for their brands"
  ON competitor_analyses FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- generated_creatives: users manage their own creatives
CREATE POLICY "Users can view their own creatives"
  ON generated_creatives FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own creatives"
  ON generated_creatives FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own creatives"
  ON generated_creatives FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own creatives"
  ON generated_creatives FOR DELETE
  USING (user_id = auth.uid());

-- pipeline_runs: access through brand ownership
CREATE POLICY "Users can view pipeline runs for their brands"
  ON pipeline_runs FOR SELECT
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert pipeline runs for their brands"
  ON pipeline_runs FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update pipeline runs for their brands"
  ON pipeline_runs FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete pipeline runs for their brands"
  ON pipeline_runs FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- ============================================================
-- Updated_at trigger for competitors
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_competitors_updated_at
  BEFORE UPDATE ON competitors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
