import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// GET /api/organizations/[id]/brands — list brands linked to this org
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
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

    // Verify user has access to this org
    const { data: org } = await db
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .single();

    const { data: membership } = await db
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership && org?.owner_id !== user.id) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    // Get brands linked to this org
    const { data: brandAccess } = await db
      .from("brand_access")
      .select("brand_id, brands(id, name, url, primary_color, description)")
      .eq("organization_id", orgId);

    const brands = (brandAccess ?? [])
      .map((ba: { brands: unknown }) => ba.brands)
      .filter(Boolean);

    return NextResponse.json({ brands });
  } catch (err) {
    console.error("[Org Brands] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch brands" },
      { status: 500 }
    );
  }
}

// POST /api/organizations/[id]/brands — assign a brand to this org
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { brand_id } = body as { brand_id?: string };

    if (!brand_id) {
      return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Verify user is owner or admin of this org
    const { data: org } = await db
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const isOwner = org.owner_id === user.id;
    if (!isOwner) {
      const { data: callerMembership } = await db
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
    }

    // Verify the user owns this brand
    const { data: brand } = await db
      .from("brands")
      .select("id, user_id")
      .eq("id", brand_id)
      .single();

    if (!brand || brand.user_id !== user.id) {
      return NextResponse.json({ error: "You can only assign brands you own" }, { status: 403 });
    }

    // Create the brand_access link
    const { data: access, error: accessError } = await db
      .from("brand_access")
      .insert({
        organization_id: orgId,
        brand_id,
      })
      .select()
      .single();

    if (accessError) {
      if (accessError.code === "23505") {
        return NextResponse.json({ error: "Brand is already assigned to this organization" }, { status: 409 });
      }
      throw accessError;
    }

    // Update brand's organization_id
    await db
      .from("brands")
      .update({ organization_id: orgId })
      .eq("id", brand_id);

    return NextResponse.json({ brand_access: access }, { status: 201 });
  } catch (err) {
    console.error("[Org Brands] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to assign brand" },
      { status: 500 }
    );
  }
}
