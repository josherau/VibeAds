-- ============================================================
-- 007_team_access.sql
-- Organizations, team member access, and granular brand permissions
-- ============================================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);

-- 2. Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by uuid REFERENCES auth.users(id),
  invited_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'deactivated')),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_email ON organization_members(invited_email);
CREATE INDEX idx_org_members_status ON organization_members(status);

-- 3. Brand Access (links brands to organizations)
CREATE TABLE IF NOT EXISTS brand_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, brand_id)
);

CREATE INDEX idx_brand_access_org ON brand_access(organization_id);
CREATE INDEX idx_brand_access_brand ON brand_access(brand_id);

-- 4. Member Brand Access (granular per-member brand visibility)
CREATE TABLE IF NOT EXISTS member_brand_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  permission_level text NOT NULL DEFAULT 'view' CHECK (permission_level IN ('edit', 'view')),
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(member_id, brand_id)
);

CREATE INDEX idx_member_brand_access_member ON member_brand_access(member_id);
CREATE INDEX idx_member_brand_access_brand ON member_brand_access(brand_id);

-- 5. Add organization_id to brands table
ALTER TABLE brands ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brands_org ON brands(organization_id);

-- ============================================================
-- Enable RLS on new tables
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_brand_access ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies for new tables
-- ============================================================

-- Organizations: owners can manage, members can view
CREATE POLICY "Org owners can manage their orgs"
  ON organizations FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "Org members can view their orgs"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Organization Members: org owners/admins can manage, members can view their org's members
CREATE POLICY "Org owners can manage members"
  ON organization_members FOR ALL
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage members"
  ON organization_members FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('admin') AND status = 'active'
    )
  );

CREATE POLICY "Members can view their org members"
  ON organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() AND om2.status = 'active'
    )
  );

-- Brand Access: org owners/admins can manage, members can view
CREATE POLICY "Org owners can manage brand access"
  ON brand_access FOR ALL
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage brand access"
  ON brand_access FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('admin') AND status = 'active'
    )
  );

CREATE POLICY "Members can view brand access"
  ON brand_access FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Member Brand Access: org owners/admins can manage, members can view their own
CREATE POLICY "Org owners can manage member brand access"
  ON member_brand_access FOR ALL
  USING (
    member_id IN (
      SELECT om.id FROM organization_members om
      JOIN organizations o ON o.id = om.organization_id
      WHERE o.owner_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage member brand access"
  ON member_brand_access FOR ALL
  USING (
    member_id IN (
      SELECT om.id FROM organization_members om
      WHERE om.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role IN ('admin') AND status = 'active'
      )
    )
  );

CREATE POLICY "Members can view their own brand access"
  ON member_brand_access FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- Helper function for team brand access check
-- ============================================================

CREATE OR REPLACE FUNCTION user_has_brand_access(check_brand_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM brands WHERE id = check_brand_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM member_brand_access mba
    JOIN organization_members om ON om.id = mba.member_id
    WHERE mba.brand_id = check_brand_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Update existing RLS policies to include team member access
-- ============================================================

-- competitors: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view their own competitors" ON competitors;
DROP POLICY IF EXISTS "Users can insert their own competitors" ON competitors;
DROP POLICY IF EXISTS "Users can update their own competitors" ON competitors;
DROP POLICY IF EXISTS "Users can delete their own competitors" ON competitors;

CREATE POLICY "Users can view their own competitors"
  ON competitors FOR SELECT
  USING (
    user_id = auth.uid()
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert their own competitors"
  ON competitors FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own competitors"
  ON competitors FOR UPDATE
  USING (
    user_id = auth.uid()
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND mba.permission_level = 'edit'
    )
  );

CREATE POLICY "Users can delete their own competitors"
  ON competitors FOR DELETE
  USING (user_id = auth.uid());

-- competitor_ads: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view ads for their competitors" ON competitor_ads;
DROP POLICY IF EXISTS "Users can insert ads for their competitors" ON competitor_ads;
DROP POLICY IF EXISTS "Users can update ads for their competitors" ON competitor_ads;
DROP POLICY IF EXISTS "Users can delete ads for their competitors" ON competitor_ads;

CREATE POLICY "Users can view ads for their competitors"
  ON competitor_ads FOR SELECT
  USING (
    competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid())
    OR competitor_id IN (
      SELECT c.id FROM competitors c
      JOIN member_brand_access mba ON mba.brand_id = c.brand_id
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert ads for their competitors"
  ON competitor_ads FOR INSERT
  WITH CHECK (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can update ads for their competitors"
  ON competitor_ads FOR UPDATE
  USING (
    competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid())
    OR competitor_id IN (
      SELECT c.id FROM competitors c
      JOIN member_brand_access mba ON mba.brand_id = c.brand_id
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND mba.permission_level = 'edit'
    )
  );

CREATE POLICY "Users can delete ads for their competitors"
  ON competitor_ads FOR DELETE
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

-- competitor_content: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view content for their competitors" ON competitor_content;
DROP POLICY IF EXISTS "Users can insert content for their competitors" ON competitor_content;
DROP POLICY IF EXISTS "Users can update content for their competitors" ON competitor_content;
DROP POLICY IF EXISTS "Users can delete content for their competitors" ON competitor_content;

CREATE POLICY "Users can view content for their competitors"
  ON competitor_content FOR SELECT
  USING (
    competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid())
    OR competitor_id IN (
      SELECT c.id FROM competitors c
      JOIN member_brand_access mba ON mba.brand_id = c.brand_id
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert content for their competitors"
  ON competitor_content FOR INSERT
  WITH CHECK (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

CREATE POLICY "Users can update content for their competitors"
  ON competitor_content FOR UPDATE
  USING (
    competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid())
    OR competitor_id IN (
      SELECT c.id FROM competitors c
      JOIN member_brand_access mba ON mba.brand_id = c.brand_id
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND mba.permission_level = 'edit'
    )
  );

CREATE POLICY "Users can delete content for their competitors"
  ON competitor_content FOR DELETE
  USING (competitor_id IN (SELECT id FROM competitors WHERE user_id = auth.uid()));

-- competitor_analyses: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view analyses for their brands" ON competitor_analyses;
DROP POLICY IF EXISTS "Users can insert analyses for their brands" ON competitor_analyses;
DROP POLICY IF EXISTS "Users can update analyses for their brands" ON competitor_analyses;
DROP POLICY IF EXISTS "Users can delete analyses for their brands" ON competitor_analyses;

CREATE POLICY "Users can view analyses for their brands"
  ON competitor_analyses FOR SELECT
  USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert analyses for their brands"
  ON competitor_analyses FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update analyses for their brands"
  ON competitor_analyses FOR UPDATE
  USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND mba.permission_level = 'edit'
    )
  );

CREATE POLICY "Users can delete analyses for their brands"
  ON competitor_analyses FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- pipeline_runs: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view pipeline runs for their brands" ON pipeline_runs;
DROP POLICY IF EXISTS "Users can insert pipeline runs for their brands" ON pipeline_runs;
DROP POLICY IF EXISTS "Users can update pipeline runs for their brands" ON pipeline_runs;
DROP POLICY IF EXISTS "Users can delete pipeline runs for their brands" ON pipeline_runs;

CREATE POLICY "Users can view pipeline runs for their brands"
  ON pipeline_runs FOR SELECT
  USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert pipeline runs for their brands"
  ON pipeline_runs FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update pipeline runs for their brands"
  ON pipeline_runs FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete pipeline runs for their brands"
  ON pipeline_runs FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- youtube_channels: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view youtube channels for their brands" ON youtube_channels;
DROP POLICY IF EXISTS "Users can insert youtube channels for their brands" ON youtube_channels;
DROP POLICY IF EXISTS "Users can update youtube channels for their brands" ON youtube_channels;
DROP POLICY IF EXISTS "Users can delete youtube channels for their brands" ON youtube_channels;

CREATE POLICY "Users can view youtube channels for their brands"
  ON youtube_channels FOR SELECT
  USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert youtube channels for their brands"
  ON youtube_channels FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update youtube channels for their brands"
  ON youtube_channels FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete youtube channels for their brands"
  ON youtube_channels FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- youtube_videos: drop and recreate with team access
DROP POLICY IF EXISTS "Users can view youtube videos for their brands" ON youtube_videos;
DROP POLICY IF EXISTS "Users can insert youtube videos for their brands" ON youtube_videos;
DROP POLICY IF EXISTS "Users can update youtube videos for their brands" ON youtube_videos;
DROP POLICY IF EXISTS "Users can delete youtube videos for their brands" ON youtube_videos;

CREATE POLICY "Users can view youtube videos for their brands"
  ON youtube_videos FOR SELECT
  USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    OR brand_id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY "Users can insert youtube videos for their brands"
  ON youtube_videos FOR INSERT
  WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update youtube videos for their brands"
  ON youtube_videos FOR UPDATE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete youtube videos for their brands"
  ON youtube_videos FOR DELETE
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- Brands: add team access for SELECT
DROP POLICY IF EXISTS "Users can view their own brands" ON brands;

CREATE POLICY "Users can view their own brands"
  ON brands FOR SELECT
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT mba.brand_id FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );
