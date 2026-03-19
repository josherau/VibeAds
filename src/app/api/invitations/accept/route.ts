import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// POST /api/invitations/accept — accept an invitation
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
    const { member_id, org_id } = body as { member_id?: string; org_id?: string };

    if (!member_id || !org_id) {
      return NextResponse.json(
        { error: "member_id and org_id are required" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Find the invitation
    const { data: invitation } = await db
      .from("organization_members")
      .select("*")
      .eq("id", member_id)
      .eq("organization_id", org_id)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (invitation.status === "active") {
      return NextResponse.json({ error: "Invitation already accepted" }, { status: 409 });
    }

    if (invitation.status === "deactivated") {
      return NextResponse.json({ error: "This invitation has been revoked" }, { status: 403 });
    }

    // Verify the email matches
    const userEmail = user.email?.toLowerCase();
    if (invitation.invited_email && invitation.invited_email !== userEmail) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    // Accept the invitation
    const { data: updated, error: updateError } = await db
      .from("organization_members")
      .update({
        user_id: user.id,
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .eq("id", member_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Get the organization name for the response
    const { data: org } = await db
      .from("organizations")
      .select("name")
      .eq("id", org_id)
      .single();

    return NextResponse.json({
      success: true,
      member: updated,
      organization_name: org?.name ?? "Unknown",
    });
  } catch (err) {
    console.error("[Accept Invitation] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
