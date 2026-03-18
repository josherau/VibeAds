-- Phase 1: Platform Expansion Tables

-- Jobs table (replaces monolithic pipeline_runs for new features)
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN (
    'competitor_ads', 'social_scrape', 'youtube_scrape', 'landing_pages',
    'analyze', 'generate_ads', 'generate_social', 'atomize_content',
    'briefing', 'seo_audit', 'sync_campaigns', 'optimize_campaigns',
    'generate_email', 'generate_landing_page'
  )),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  progress_message text,
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer
);

CREATE INDEX idx_jobs_brand_id ON jobs(brand_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(job_type);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, user_id)
);

CREATE INDEX idx_team_members_brand ON team_members(brand_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

-- Team invites
CREATE TABLE IF NOT EXISTS team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

-- Social posts (AI-generated social content)
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'threads', 'youtube', 'pinterest')),
  post_type text NOT NULL CHECK (post_type IN ('text', 'carousel', 'reel_script', 'story', 'thread', 'video_script', 'pin')),
  content text NOT NULL,
  media_prompts jsonb,
  media_urls text[],
  hashtags text[],
  scheduled_for timestamptz,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  ghl_post_id text,
  source_content_id uuid,
  engagement_likes integer,
  engagement_comments integer,
  engagement_shares integer,
  engagement_views integer,
  competitor_inspiration jsonb,
  positioning_angle_type text,
  copywriting_framework text,
  feedback text CHECK (feedback IN ('up', 'down')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_social_posts_brand ON social_posts(brand_id);
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_social_posts_platform ON social_posts(platform);

-- Content atoms (content atomizer output)
CREATE TABLE IF NOT EXISTS content_atoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('blog', 'video', 'podcast', 'whitepaper', 'case_study', 'webinar', 'newsletter', 'custom')),
  source_title text,
  source_content text NOT NULL,
  source_url text,
  atoms jsonb NOT NULL DEFAULT '[]',
  atom_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_content_atoms_brand ON content_atoms(brand_id);

-- AI CMO Briefings
CREATE TABLE IF NOT EXISTS briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  briefing_type text NOT NULL DEFAULT 'daily' CHECK (briefing_type IN ('daily', 'weekly', 'monthly')),
  executive_summary text,
  health_score integer CHECK (health_score >= 0 AND health_score <= 100),
  key_metrics jsonb,
  wins jsonb,
  concerns jsonb,
  action_items jsonb,
  competitor_moves jsonb,
  content_recommendations jsonb,
  budget_recommendations jsonb,
  raw_response text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, briefing_date, briefing_type)
);

CREATE INDEX idx_briefings_brand ON briefings(brand_id);
CREATE INDEX idx_briefings_date ON briefings(briefing_date DESC);

-- Marketing calendar
CREATE TABLE IF NOT EXISTS marketing_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('content', 'campaign', 'holiday', 'competitor_event', 'milestone', 'custom')),
  title text NOT NULL,
  description text,
  platform text,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'planned', 'published', 'cancelled')),
  content_id uuid,
  campaign_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_calendar_brand ON marketing_calendar(brand_id);
CREATE INDEX idx_calendar_date ON marketing_calendar(date);

-- YouTube channels (for Phase 2 but create table now)
CREATE TABLE IF NOT EXISTS youtube_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES competitors(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text,
  subscriber_count integer,
  video_count integer,
  view_count bigint,
  description text,
  thumbnail_url text,
  last_scraped_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(competitor_id, channel_id)
);

-- YouTube videos
CREATE TABLE IF NOT EXISTS youtube_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES youtube_channels(id) ON DELETE CASCADE,
  competitor_id uuid REFERENCES competitors(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  video_id text NOT NULL UNIQUE,
  title text,
  description text,
  view_count integer,
  like_count integer,
  comment_count integer,
  duration text,
  published_at timestamptz,
  thumbnail_url text,
  tags text[],
  transcript text,
  analysis jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_youtube_videos_brand ON youtube_videos(brand_id);
CREATE INDEX idx_youtube_videos_channel ON youtube_videos(channel_id);

-- Ad accounts (for Phase 2 but create table now)
CREATE TABLE IF NOT EXISTS ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'linkedin', 'tiktok', 'youtube', 'x')),
  account_id text NOT NULL,
  account_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'disconnected')),
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, platform, account_id)
);

-- GHL integration settings
CREATE TABLE IF NOT EXISTS ghl_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'disconnected')),
  connected_platforms text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, location_id)
);

-- Enable RLS on all new tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_atoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role bypasses, so these are for client-side access)
CREATE POLICY "Users can view their own jobs" ON jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own jobs" ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view team memberships" ON team_members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their social posts" ON social_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their social posts" ON social_posts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their content atoms" ON content_atoms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their content atoms" ON content_atoms FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their briefings" ON briefings FOR SELECT USING (brand_id IN (SELECT brand_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can view their calendar" ON marketing_calendar FOR SELECT USING (brand_id IN (SELECT brand_id FROM team_members WHERE user_id = auth.uid()));
