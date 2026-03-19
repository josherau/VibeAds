import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../../route";

// PATCH /api/admin/organizations/[id] — update org, assign/unassign brands
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Handle brand assignment
    if (typeof body.assign_brand_id === "string") {
      // Set brand's organization_id
      const { error: brandError } = await db
        .from("brands")
        .update({ organization_id: id })
        .eq("id", body.assign_brand_id);
      if (brandError) throw brandError;

      // Also insert into brand_access for backward compat
      await db.from("brand_access").upsert(
        { organization_id: id, brand_id: body.assign_brand_id },
        { onConflict: "organization_id,brand_id" }
      );

      return NextResponse.json({ ok: true });
    }

    // Handle brand unassignment
    if (typeof body.unassign_brand_id === "string") {
      // Clear brand's organization_id
      const { error: brandError } = await db
        .from("brands")
        .update({ organization_id: null })
        .eq("id", body.unassign_brand_id);
      if (brandError) throw brandError;

      // Remove from brand_access
      await db
        .from("brand_access")
        .delete()
        .eq("organization_id", id)
        .eq("brand_id", body.unassign_brand_id);

      return NextResponse.json({ ok: true });
    }

    // Handle org field updates
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.owner_id === "string") {
      updates.owner_id = body.owner_id;
    }
    if (typeof body.logo_url === "string") {
      updates.logo_url = body.logo_url || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const { data: org, error } = await db
      .from("organizations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ organization: org });
  } catch (err) {
    console.error("[Admin Orgs] PATCH error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update organization",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/organizations/[id] — delete org (cascade members, brand_access)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Delete member_brand_access for all members of this org
    const { data: members } = await db
      .from("organization_members")
      .select("id")
      .eq("organization_id", id);

    if (members && members.length > 0) {
      const memberIds = members.map((m: { id: string }) => m.id);
      await db
        .from("member_brand_access")
        .delete()
        .in("member_id", memberIds);
    }

    // Delete organization members
    await db
      .from("organization_members")
      .delete()
      .eq("organization_id", id);

    // Delete brand_access
    await db.from("brand_access").delete().eq("organization_id", id);

    // Delete the organization
    const { error } = await db
      .from("organizations")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Orgs] DELETE error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to delete organization",
      },
      { status: 500 }
    );
  }
}
