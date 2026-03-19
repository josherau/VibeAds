-- ============================================================
-- 008_permission_hierarchy.sql
-- Clean org -> brand hierarchy with direct brand membership
-- ============================================================

-- 1. Create brand_members table (direct brand-level access)
CREATE TABLE IF NOT EXISTS brand_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  invited_by uuid REFERENCES auth.users(id),
  invited_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'deactivated')),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, user_id)
);

CREATE INDEX idx_brand_members_brand ON brand_members(brand_id);
CREATE INDEX idx_brand_members_user ON brand_members(user_id);
CREATE INDEX idx_brand_members_email ON brand_members(invited_email);

ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;

-- RLS for brand_members: brand owners can manage
CREATE POLICY "Brand owners can manage brand members"
  ON brand_members FOR ALL
  USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );

-- RLS for brand_members: org owners can manage
CREATE POLICY "Org owners can manage brand members"
  ON brand_members FOR ALL
  USING (
    brand_id IN (
      SELECT b.id FROM brands b
      JOIN organizations o ON o.id = b.organization_id
      WHERE o.owner_id = auth.uid()
    )
  );

-- RLS for brand_members: org admins can manage
CREATE POLICY "Org admins can manage brand members"
  ON brand_members FOR ALL
  USING (
    brand_id IN (
      SELECT b.id FROM brands b
      WHERE b.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
      )
    )
  );

-- RLS for brand_members: members can view their own membership
CREATE POLICY "Brand members can view their own membership"
  ON brand_members FOR SELECT
  USING (user_id = auth.uid());

-- 2. Update user_accessible_brand_ids() with clean 3-tier resolution
CREATE OR REPLACE FUNCTION user_accessible_brand_ids()
RETURNS SETOF uuid AS $$
BEGIN
  -- Super admins see everything
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_super_admin = true) THEN
    RETURN QUERY SELECT id FROM brands;
    RETURN;
  END IF;

  RETURN QUERY
    -- 1. Brands I own directly
    SELECT id FROM brands WHERE user_id = auth.uid()
    UNION
    -- 2. Brands in orgs I'm a member of
    SELECT b.id FROM brands b
    WHERE b.organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    UNION
    -- 3. Brands I have direct brand membership on
    SELECT brand_id FROM brand_members
    WHERE user_id = auth.uid() AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. Update brands SELECT policy to include all 3 access paths
DROP POLICY IF EXISTS "Users can view their own brands" ON brands;

CREATE POLICY "Users can view their own brands"
  ON brands FOR SELECT
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT b.id FROM brands b
      WHERE b.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
    OR id IN (
      SELECT brand_id FROM brand_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_super_admin = true
    )
  );
