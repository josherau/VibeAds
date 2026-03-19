import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../../route";

// PATCH /api/admin/users/[id] — toggle super_admin, ban/unban user
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

    // Toggle super admin
    if (typeof body.is_super_admin === "boolean") {
      // Upsert user_roles
      const { error } = await db.from("user_roles").upsert(
        {
          user_id: id,
          is_super_admin: body.is_super_admin,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    }

    // Ban/unban user
    if (typeof body.banned === "boolean") {
      if (id === admin.id) {
        return NextResponse.json(
          { error: "Cannot ban yourself" },
          { status: 400 }
        );
      }

      if (body.banned) {
        const { error } = await db.auth.admin.updateUserById(id, {
          ban_duration: "876000h", // ~100 years
        });
        if (error) throw error;
      } else {
        const { error } = await db.auth.admin.updateUserById(id, {
          ban_duration: "none",
        });
        if (error) throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Users] PATCH error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update user",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id] — delete user (removes from auth + cascades)
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

    if (id === admin.id) {
      return NextResponse.json(
        { error: "Cannot delete yourself" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Remove user_roles
    await db.from("user_roles").delete().eq("user_id", id);

    // Remove organization memberships
    await db.from("organization_members").delete().eq("user_id", id);

    // Remove brand memberships
    await db.from("brand_members").delete().eq("user_id", id);

    // Delete user from auth
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Users] DELETE error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete user",
      },
      { status: 500 }
    );
  }
}
