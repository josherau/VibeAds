import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// PATCH /api/organizations/[id]/members/[memberId] — update role or status
export async function PATCH(
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

    const body = await request.json();
    const { role, status } = body as { role?: string; status?: string };

    const updates: Record<string, unknown> = {};
    if (role && ["owner", "admin", "member", "viewer"].includes(role)) {
      updates.role = role;
    }
    if (status && ["active", "deactivated"].includes(status)) {
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
    }

    // Don't allow modifying the org owner's membership
    const { data: targetMember } = await db
      .from("organization_members")
      .select("user_id, role")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMember.role === "owner" && targetMember.user_id === org.owner_id) {
      return NextResponse.json({ error: "Cannot modify the organization owner" }, { status: 403 });
    }

    const { data: updated, error: updateError } = await db
      .from("organization_members")
      .update(updates)
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ member: updated });
  } catch (err) {
    console.error("[Org Member] PATCH error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update member" },
      { status: 500 }
    );
  }
}

// DELETE /api/organizations/[id]/members/[memberId] — remove a member
export async function DELETE(
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

    // Don't allow removing the org owner
    const { data: targetMember } = await db
      .from("organization_members")
      .select("user_id, role")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMember.role === "owner" && targetMember.user_id === org.owner_id) {
      return NextResponse.json({ error: "Cannot remove the organization owner" }, { status: 403 });
    }

    // Delete brand access first (cascade should handle, but be explicit)
    await db
      .from("member_brand_access")
      .delete()
      .eq("member_id", memberId);

    // Delete the member
    const { error: deleteError } = await db
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", orgId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Org Member] DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove member" },
      { status: 500 }
    );
  }
}
