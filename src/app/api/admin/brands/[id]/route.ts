import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../../route";

// PATCH /api/admin/brands/[id] — reassign brand to different user/org
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

    // Update brand owner
    if (typeof body.user_id === "string") {
      const { error } = await db
        .from("brands")
        .update({ user_id: body.user_id })
        .eq("id", id);
      if (error) throw error;
    }

    // Update org assignment
    if (typeof body.organization_id === "string") {
      // Remove existing org assignment
      await db.from("brand_access").delete().eq("brand_id", id);

      if (body.organization_id) {
        // Add new org assignment
        const { error } = await db.from("brand_access").insert({
          organization_id: body.organization_id,
          brand_id: id,
        });
        if (error) throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Brands] PATCH error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update brand",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/brands/[id] — delete brand
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

    // Remove brand_access
    await db.from("brand_access").delete().eq("brand_id", id);

    // Remove member_brand_access
    await db.from("member_brand_access").delete().eq("brand_id", id);

    // Remove competitors
    await db.from("competitors").delete().eq("brand_id", id);

    // Delete brand
    const { error } = await db.from("brands").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Brands] DELETE error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete brand",
      },
      { status: 500 }
    );
  }
}
