-- ============================================================
-- 002_vibe_marketing_enhancements.sql
-- Enhanced fields for the Vibe Marketing Playbook methodology:
-- - Brand voice profiles & positioning angles
-- - Direct response copywriting frameworks
-- - Competitive intelligence (gaps, patterns, anti-patterns)
-- - Platform-specific ad variants & content atomizer output
-- ============================================================

-- ========================
-- brands: voice + positioning
-- ========================
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS voice_profile jsonb,
  ADD COLUMN IF NOT EXISTS positioning_angles jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS vocabulary_guide jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS anti_positioning text,
  ADD COLUMN IF NOT EXISTS market_sophistication_level integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_market_sophistication_level_check'
  ) THEN
    ALTER TABLE brands
      ADD CONSTRAINT brands_market_sophistication_level_check
      CHECK (market_sophistication_level IS NULL OR (market_sophistication_level >= 1 AND market_sophistication_level <= 5));
  END IF;
END $$;

-- ========================
-- competitor_analyses: richer analysis
-- ========================
ALTER TABLE competitor_analyses
  ADD COLUMN IF NOT EXISTS positioning_gaps jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS winning_patterns jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS anti_patterns jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS market_sophistication integer,
  ADD COLUMN IF NOT EXISTS recommendations jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitor_gap_analysis jsonb,
  ADD COLUMN IF NOT EXISTS ads_analyzed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_analyzed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_response text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'competitor_analyses_market_sophistication_check'
  ) THEN
    ALTER TABLE competitor_analyses
      ADD CONSTRAINT competitor_analyses_market_sophistication_check
      CHECK (market_sophistication IS NULL OR (market_sophistication >= 1 AND market_sophistication <= 5));
  END IF;
END $$;

-- ========================
-- generated_creatives: direct response + atomizer
-- ========================
ALTER TABLE generated_creatives
  ADD COLUMN IF NOT EXISTS angle_type text,
  ADD COLUMN IF NOT EXISTS positioning_angle_type text,
  ADD COLUMN IF NOT EXISTS positioning_framework text,
  ADD COLUMN IF NOT EXISTS copywriting_framework text,
  ADD COLUMN IF NOT EXISTS schwartz_sophistication_level integer,
  ADD COLUMN IF NOT EXISTS psychological_trigger text,
  ADD COLUMN IF NOT EXISTS platform_variants jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ab_variants jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_concepts jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS video_script text,
  ADD COLUMN IF NOT EXISTS video_script_concept text,
  ADD COLUMN IF NOT EXISTS google_headlines text[],
  ADD COLUMN IF NOT EXISTS google_descriptions text[],
  ADD COLUMN IF NOT EXISTS linkedin_intro_text text,
  ADD COLUMN IF NOT EXISTS linkedin_headline text;

-- Check constraints for enum-like fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_creatives_angle_type_check'
  ) THEN
    ALTER TABLE generated_creatives
      ADD CONSTRAINT generated_creatives_angle_type_check
      CHECK (positioning_angle_type IS NULL OR positioning_angle_type IN (
        'contrarian','unique_mechanism','transformation','enemy',
        'speed_ease','specificity','social_proof','risk_reversal'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_creatives_framework_check'
  ) THEN
    ALTER TABLE generated_creatives
      ADD CONSTRAINT generated_creatives_framework_check
      CHECK (copywriting_framework IS NULL OR copywriting_framework IN (
        'curiosity_gap','specific_numbers','before_after',
        'problem_agitate_solve','fear_of_missing_out','social_proof_lead',
        'direct_benefit','story_lead'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_creatives_schwartz_check'
  ) THEN
    ALTER TABLE generated_creatives
      ADD CONSTRAINT generated_creatives_schwartz_check
      CHECK (schwartz_sophistication_level IS NULL OR (schwartz_sophistication_level >= 1 AND schwartz_sophistication_level <= 5));
  END IF;
END $$;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_generated_creatives_angle_type
  ON generated_creatives(positioning_angle_type);
CREATE INDEX IF NOT EXISTS idx_generated_creatives_framework
  ON generated_creatives(copywriting_framework);
