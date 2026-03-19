import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../../../route";

// GET /api/admin/organizations/[id]/members — list org members
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
      .from("organization_members")
      .select("*, member_brand_access(id, brand_id, permission_level)")
      .eq("organization_id", id)
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

    const enrichedMembers = (members ?? []).map(
      (m: {
        user_id: string | null;
        invited_email: string | null;
        [key: string]: unknown;
      }) => ({
        ...m,
        email: m.user_id ? emailMap.get(m.user_id) || m.invited_email : m.invited_email,
      })
    );

    return NextResponse.json({ members: enrichedMembers });
  } catch (err) {
    console.error("[Admin Org Members] GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch members",
      },
      { status: 500 }
    );
  }
}

// POST /api/admin/organizations/[id]/members — add member
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // If user_id provided, add directly as active member
    if (user_id) {
      // Check if already a member
      const { data: existing } = await db
        .from("organization_members")
        .select("id")
        .eq("organization_id", id)
        .eq("user_id", user_id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "User is already a member" },
          { status: 400 }
        );
      }

      const { data: member, error } = await db
        .from("organization_members")
        .insert({
          organization_id: id,
          user_id,
          role: role || "member",
          status: "active",
          invited_by: admin.id,
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ member }, { status: 201 });
    }

    // Otherwise, create pending invitation by email
    const { data: member, error } = await db
      .from("organization_members")
      .insert({
        organization_id: id,
        invited_email: email,
        role: role || "member",
        status: "pending",
        invited_by: admin.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("[Admin Org Members] POST error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to add member",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/organizations/[id]/members — remove member by member_id query param
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

    // Remove brand access first
    await db.from("member_brand_access").delete().eq("member_id", memberId);

    // Remove the member
    const { error } = await db
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Admin Org Members] DELETE error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to remove member",
      },
      { status: 500 }
    );
  }
}
