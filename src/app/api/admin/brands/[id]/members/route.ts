import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../../../route";

// GET /api/admin/brands/[id]/members — list brand members
export async function GET(
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

    const { data: members, error } = await db
      .from("brand_members")
      .select("*")
      .eq("brand_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Get user emails for members with user_id
    const userIds = (members ?? [])
      .map((m: { user_id: string | null }) => m.user_id)
      .filter(Boolean);

    const emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: authData } = await db.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const u of authData?.users ?? []) {
        if (userIds.includes(u.id)) {
          emailMap.set(u.id, u.email || "");
        }
      }
    }

    // Filter out super admins
    const { data: superAdmins } = await db
      .from("user_roles")
      .select("user_id")
      .eq("is_super_admin", true);

    const superAdminIds = new Set(
      (superAdmins ?? []).map((r: { user_id: string }) => r.user_id)
    );

    const enrichedMembers = (members ?? [])
      .filter(
        (m: { user_id: string | null }) =>
          !m.user_id || !superAdminIds.has(m.user_id)
      )
      .map(
        (m: {
          user_id: string | null;
          invited_email: string | null;
          [key: string]: unknown;
        }) => ({
          ...m,
          email: m.user_id
            ? emailMap.get(m.user_id) || m.invited_email
            : m.invited_email,
        })
      );

    return NextResponse.json({ members: enrichedMembers });
  } catch (err) {
    console.error("[Admin Brand Members] GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch brand members",
      },
      { status: 500 }
    );
  }
}

// POST /api/admin/brands/[id]/members — add brand member
export async function POST(
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
    const { email, role, user_id } = body as {
      email?: string;
      role?: string;
      user_id?: string;
    };

    if (!email && !user_id) {
      return NextResponse.json(
        { error: "Email or user_id is required" },
        { status: 400 }
      );
    }

    const validRoles = ["editor", "viewer"];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // If user_id provided, add directly as active member
    if (user_id) {
      const { data: existing } = await db
        .from("brand_members")
        .select("id")
        .eq("brand_id", id)
        .eq("user_id", user_id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "User is already a brand member" },
          { status: 400 }
        );
      }

      // Look up email for invited_email field
      let userEmail = email;
      if (!userEmail) {
        const { data: authData } = await db.auth.admin.getUserById(user_id);
        userEmail = authData?.user?.email || null;
      }

      const { data: member, error } = await db
        .from("brand_members")
        .insert({
          brand_id: id,
          user_id,
          role: role || "viewer",
          status: "active",
          invited_by: admin.id,
          invited_email: userEmail,
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ member }, { status: 201 });
    }

    // Look up user by email
    const { data: authData } = await db.auth.admin.listUsers({ perPage: 1000 });
    const matchedUser = (authData?.users ?? []).find(
      (u: { email?: string }) =>
        u.email?.toLowerCase() === email?.toLowerCase()
    );

    if (matchedUser) {
      // Check if already a member
      const { data: existing } = await db
        .from("brand_members")
        .select("id")
        .eq("brand_id", id)
        .eq("user_id", matchedUser.id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "User is already a brand member" },
          { status: 400 }
        );
      }

      const { data: member, error } = await db
        .from("brand_members")
        .insert({
          brand_id: id,
          user_id: matchedUser.id,
          role: role || "viewer",
          status: "active",
          invited_by: admin.id,
          invited_email: email,
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ member }, { status: 201 });
    }

    // User not found — create pending invitation
    const { data: member, error } = await db
      .from("brand_members")
      .insert({
        brand_id: id,
        invited_email: email,
        role: role || "viewer",
        status: "pending",
        invited_by: admin.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("[Admin Brand Members] POST error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to add brand member",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/brands/[id]/members — remove brand member by member_id query param
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("member_id");

    if (!memberId) {
      return NextResponse.json(
        { error: "member_id query parameter is required" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    const { error } = await db
      .from("brand_members")
      .delete()
      .eq("id", memberId)
      .eq("brand_id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Brand Members] DELETE error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to remove brand member",
      },
      { status: 500 }
    );
  }
}
