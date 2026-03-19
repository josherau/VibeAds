import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../route";

// GET /api/admin/users — list all users with brands, org memberships, roles
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Fetch all auth users via admin API
    const { data: authData, error: authError } =
      await db.auth.admin.listUsers({ perPage: 1000 });

    if (authError) {
      throw authError;
    }

    const authUsers = authData?.users ?? [];

    // Fetch all user_roles
    const { data: userRoles } = await db
      .from("user_roles")
      .select("user_id, is_super_admin");

    // Fetch all brands
    const { data: brands } = await db
      .from("brands")
      .select("id, name, user_id");

    // Fetch all organization memberships
    const { data: memberships } = await db
      .from("organization_members")
      .select("user_id, organization_id, role, status, organizations(id, name)")
      .eq("status", "active");

    // Build user_roles map
    const rolesMap = new Map<string, boolean>();
    for (const r of userRoles ?? []) {
      rolesMap.set(r.user_id, r.is_super_admin);
    }

    // Build brands map
    const brandsMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const b of brands ?? []) {
      if (!brandsMap.has(b.user_id)) brandsMap.set(b.user_id, []);
      brandsMap.get(b.user_id)!.push({ id: b.id, name: b.name });
    }

    // Build memberships map
    const membershipsMap = new Map<
      string,
      Array<{ org_id: string; org_name: string; role: string }>
    >();
    for (const m of memberships ?? []) {
      const org = m.organizations as { id: string; name: string } | null;
      if (!org) continue;
      if (!membershipsMap.has(m.user_id)) membershipsMap.set(m.user_id, []);
      membershipsMap.get(m.user_id)!.push({
        org_id: org.id,
        org_name: org.name,
        role: m.role,
      });
    }

    const users = authUsers.map(
      (u: {
        id: string;
        email?: string;
        user_metadata?: { full_name?: string; name?: string };
        last_sign_in_at?: string;
        created_at?: string;
        banned_until?: string;
      }) => ({
        id: u.id,
        email: u.email || "",
        name:
          u.user_metadata?.full_name || u.user_metadata?.name || "",
        is_super_admin: rolesMap.get(u.id) ?? false,
        brands: brandsMap.get(u.id) ?? [],
        organizations: membershipsMap.get(u.id) ?? [],
        last_sign_in_at: u.last_sign_in_at || null,
        created_at: u.created_at || null,
        banned_until: u.banned_until || null,
      })
    );

    return NextResponse.json({ users });
  } catch (err) {
    console.error("[Admin Users] GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch users",
      },
      { status: 500 }
    );
  }
}
