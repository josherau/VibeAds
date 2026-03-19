import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

// GET /api/organizations/[id]/members — list organization members
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
    const { data: membership } = await db
      .from("organization_members")
      .select("id, role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    const { data: org } = await db
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .single();

    if (!membership && org?.owner_id !== user.id) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    // Fetch all members with their brand access
    const { data: members, error: membersError } = await db
      .from("organization_members")
      .select("*, member_brand_access(id, brand_id, permission_level)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    if (membersError) throw membersError;

    return NextResponse.json({ members: members ?? [] });
  } catch (err) {
    console.error("[Org Members] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch members" },
      { status: 500 }
    );
  }
}

// POST /api/organizations/[id]/members — invite a member by email
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
    const { email, role, brand_ids } = body as {
      email?: string;
      role?: string;
      brand_ids?: string[];
    };

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const memberRole = role || "member";
    if (!["admin", "member", "viewer"].includes(memberRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Verify user is owner or admin of this org
    const { data: org } = await db
      .from("organizations")
      .select("id, name, owner_id")
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
        return NextResponse.json({ error: "Only owners and admins can invite members" }, { status: 403 });
      }
    }

    // Check if already a member
    const { data: existing } = await db
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("invited_email", email.trim().toLowerCase())
      .single();

    if (existing) {
      if (existing.status === "active") {
        return NextResponse.json({ error: "This user is already a member" }, { status: 409 });
      }
      if (existing.status === "pending") {
        return NextResponse.json({ error: "An invitation is already pending for this email" }, { status: 409 });
      }
    }

    // Check if the invited email matches an existing user
    const { data: existingUsers } = await db.auth.admin.listUsers();
    const invitedUser = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    // Create the member record
    const { data: member, error: memberError } = await db
      .from("organization_members")
      .insert({
        organization_id: orgId,
        user_id: invitedUser?.id || null,
        role: memberRole,
        invited_by: user.id,
        invited_email: email.trim().toLowerCase(),
        status: "pending",
      })
      .select()
      .single();

    if (memberError) throw memberError;

    // Grant brand access if specified
    if (brand_ids && brand_ids.length > 0 && member) {
      const brandAccessInserts = brand_ids.map((brandId) => ({
        member_id: member.id,
        brand_id: brandId,
        permission_level: "view" as const,
        granted_by: user.id,
      }));

      await db.from("member_brand_access").insert(brandAccessInserts);
    }

    // Send invitation email via SendGrid
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibeads.ai";

    if (sendgridApiKey) {
      const acceptUrl = `${appUrl}/invitations/accept?member_id=${member.id}&org_id=${orgId}`;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #e5e5e5; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #171717; border-radius: 12px; padding: 40px; border: 1px solid #262626;">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background-color: #6366f1; border-radius: 8px; padding: 8px; margin-bottom: 16px;">
        <span style="color: white; font-size: 20px; font-weight: bold;">VA</span>
      </div>
      <h1 style="color: #f5f5f5; font-size: 24px; margin: 0 0 8px;">You've been invited!</h1>
      <p style="color: #a3a3a3; font-size: 14px; margin: 0;">
        ${user.email} has invited you to join <strong style="color: #e5e5e5;">${org.name}</strong> on VibeAds
      </p>
    </div>

    <div style="background-color: #1e1e1e; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #333;">
      <p style="color: #a3a3a3; font-size: 13px; margin: 0 0 4px;">Your role</p>
      <p style="color: #e5e5e5; font-size: 16px; font-weight: 600; margin: 0; text-transform: capitalize;">${memberRole}</p>
    </div>

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${acceptUrl}" style="display: inline-block; background-color: #6366f1; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Accept Invitation
      </a>
    </div>

    <p style="color: #737373; font-size: 12px; text-align: center; margin: 0;">
      If you didn't expect this invitation, you can ignore this email.
    </p>
  </div>
</body>
</html>`;

      try {
        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sendgridApiKey}`,
          },
          body: JSON.stringify({
            personalizations: [
              {
                to: [{ email: email.trim().toLowerCase() }],
                subject: `You've been invited to ${org.name} on VibeAds`,
              },
            ],
            from: { email: "team@vibeads.ai", name: "VibeAds" },
            content: [{ type: "text/html", value: emailHtml }],
          }),
        });
      } catch (emailErr) {
        console.error("[Org Members] Failed to send invitation email:", emailErr);
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("[Org Members] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to invite member" },
      { status: 500 }
    );
  }
}
