-- Competitor deep-dive profiles
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  -- Core Identity
  positioning_statement text,
  value_proposition text,
  target_audience jsonb,
  brand_voice_assessment jsonb,

  -- Market Position
  market_sophistication_level integer CHECK (market_sophistication_level >= 1 AND market_sophistication_level <= 5),
  positioning_type text,
  unique_mechanism text,

  -- SWOT
  strengths jsonb,
  weaknesses jsonb,
  opportunities_for_us jsonb,
  threats_from_them jsonb,

  -- Marketing Breakdown
  messaging_analysis jsonb,
  content_strategy_assessment jsonb,
  ad_strategy_assessment jsonb,
  funnel_analysis jsonb,
  pricing_analysis jsonb,

  -- Social
  social_presence_assessment jsonb,
  top_performing_themes jsonb,

  -- Strategic Playbook
  attack_vectors jsonb,
  defensive_moves jsonb,
  quick_wins jsonb,
  long_term_plays jsonb,

  -- Meta
  overall_threat_level text CHECK (overall_threat_level IN ('critical', 'high', 'medium', 'low', 'negligible')),
  overall_score integer CHECK (overall_score >= 0 AND overall_score <= 100),
  executive_summary text,
  raw_response text,

  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  UNIQUE(competitor_id)
);

CREATE INDEX idx_competitor_profiles_brand ON competitor_profiles(brand_id);
CREATE INDEX idx_competitor_profiles_competitor ON competitor_profiles(competitor_id);

ALTER TABLE competitor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view competitor profiles for their brands"
  ON competitor_profiles FOR SELECT
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));
