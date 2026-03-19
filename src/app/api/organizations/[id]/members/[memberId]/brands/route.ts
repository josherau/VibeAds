import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// GET /api/organizations/[id]/members/[memberId]/brands — list member's brand access
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: orgId, memberId } = await params;
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

    // Verify caller has access to this org
    const { data: org } = await db
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .single();

    const { data: callerMembership } = await db
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!callerMembership && org?.owner_id !== user.id) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    // Get member's brand access
    const { data: brandAccess } = await db
      .from("member_brand_access")
      .select("*, brands(id, name, primary_color)")
      .eq("member_id", memberId);

    return NextResponse.json({ brand_access: brandAccess ?? [] });
  } catch (err) {
    console.error("[Member Brands] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch brand access" },
      { status: 500 }
    );
  }
}

// POST /api/organizations/[id]/members/[memberId]/brands — grant brand access
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: orgId, memberId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { brand_id, permission_level } = body as {
      brand_id?: string;
      permission_level?: string;
    };

    if (!brand_id) {
      return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
    }

    const level = permission_level || "view";
    if (!["edit", "view"].includes(level)) {
      return NextResponse.json({ error: "Invalid permission_level" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Verify caller is owner or admin
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

    // Verify member belongs to this org
    const { data: member } = await db
      .from("organization_members")
      .select("id")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Member not found in this organization" }, { status: 404 });
    }

    // Grant access
    const { data: access, error: accessError } = await db
      .from("member_brand_access")
      .upsert(
        {
          member_id: memberId,
          brand_id,
          permission_level: level,
          granted_by: user.id,
        },
        { onConflict: "member_id,brand_id" }
      )
      .select()
      .single();

    if (accessError) throw accessError;

    return NextResponse.json({ brand_access: access }, { status: 201 });
  } catch (err) {
    console.error("[Member Brands] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to grant brand access" },
      { status: 500 }
    );
  }
}

// DELETE /api/organizations/[id]/members/[memberId]/brands — revoke brand access
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: orgId, memberId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brand_id");

    if (!brandId) {
      return NextResponse.json({ error: "brand_id query parameter is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Verify caller is owner or admin
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

    const { error: deleteError } = await db
      .from("member_brand_access")
      .delete()
      .eq("member_id", memberId)
      .eq("brand_id", brandId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Member Brands] DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke brand access" },
      { status: 500 }
    );
  }
}
