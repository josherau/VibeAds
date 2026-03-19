import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// GET /api/organizations — list user's organizations
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Get orgs the user owns
    const { data: ownedOrgs } = await db
      .from("organizations")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });

    // Get orgs the user is a member of
    const { data: memberships } = await db
      .from("organization_members")
      .select("organization_id, role, status, organizations(*)")
      .eq("user_id", user.id)
      .eq("status", "active");

    // Merge and deduplicate
    const orgMap = new Map<string, { org: Record<string, unknown>; role: string }>();

    for (const org of ownedOrgs ?? []) {
      orgMap.set(org.id, { org, role: "owner" });
    }

    for (const m of memberships ?? []) {
      const org = m.organizations as Record<string, unknown> | null;
      if (org && !orgMap.has(m.organization_id)) {
        orgMap.set(m.organization_id, { org, role: m.role });
      }
    }

    const organizations = Array.from(orgMap.values()).map(({ org, role }) => ({
      ...org,
      user_role: role,
    }));

    return NextResponse.json({ organizations });
  } catch (err) {
    console.error("[Organizations] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

// POST /api/organizations — create a new organization
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, logo_url } = body as { name?: string; logo_url?: string };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Create the organization
    const { data: org, error: orgError } = await db
      .from("organizations")
      .insert({
        name: name.trim(),
        owner_id: user.id,
        logo_url: logo_url || null,
      })
      .select()
      .single();

    if (orgError) {
      throw orgError;
    }

    // Add the creator as an owner member
    await db.from("organization_members").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (err) {
    console.error("[Organizations] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create organization" },
      { status: 500 }
    );
  }
}
