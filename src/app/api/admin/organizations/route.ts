import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../route";

// GET /api/admin/organizations — list all orgs with member counts, brand counts
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    const { data: orgs, error } = await db
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get member counts
    const { data: memberCounts } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("status", "active");

    // Get brands linked to orgs (via organization_id)
    const { data: orgBrands } = await db
      .from("brands")
      .select("id, name, organization_id")
      .not("organization_id", "is", null);

    const orgBrandsMap = new Map<
      string,
      Array<{ id: string; name: string }>
    >();
    for (const b of orgBrands ?? []) {
      if (!b.organization_id) continue;
      if (!orgBrandsMap.has(b.organization_id))
        orgBrandsMap.set(b.organization_id, []);
      orgBrandsMap.get(b.organization_id)!.push({ id: b.id, name: b.name });
    }

    // Get brand_access counts (backward compat)
    const { data: brandAccess } = await db
      .from("brand_access")
      .select("organization_id, brand_id");

    // Build count maps
    const memberCountMap = new Map<string, number>();
    for (const m of memberCounts ?? []) {
      memberCountMap.set(
        m.organization_id,
        (memberCountMap.get(m.organization_id) || 0) + 1
      );
    }

    const brandCountMap = new Map<string, number>();
    for (const ba of brandAccess ?? []) {
      brandCountMap.set(
        ba.organization_id,
        (brandCountMap.get(ba.organization_id) || 0) + 1
      );
    }

    // Get owner emails
    const ownerIds = [...new Set((orgs ?? []).map((o: { owner_id: string }) => o.owner_id))];
    const ownerEmails = new Map<string, string>();

    if (ownerIds.length > 0) {
      const { data: authData } = await db.auth.admin.listUsers({ perPage: 1000 });
      for (const u of authData?.users ?? []) {
        if (ownerIds.includes(u.id)) {
          ownerEmails.set(u.id, u.email || "");
        }
      }
    }

    const organizations = (orgs ?? []).map(
      (o: {
        id: string;
        name: string;
        owner_id: string;
        logo_url: string | null;
        created_at: string;
      }) => ({
        ...o,
        owner_email: ownerEmails.get(o.owner_id) || "",
        member_count: memberCountMap.get(o.id) || 0,
        brand_count: brandCountMap.get(o.id) || 0,
        brands: orgBrandsMap.get(o.id) || [],
      })
    );

    return NextResponse.json({ organizations });
  } catch (err) {
    console.error("[Admin Orgs] GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch organizations",
      },
      { status: 500 }
    );
  }
}

// POST /api/admin/organizations — create org (admin can set owner)
export async function POST(request: Request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, owner_id } = body as {
      name?: string;
      owner_id?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    const effectiveOwner = owner_id || admin.id;

    const { data: org, error } = await db
      .from("organizations")
      .insert({
        name: name.trim(),
        owner_id: effectiveOwner,
      })
      .select()
      .single();

    if (error) throw error;

    // Add owner as member
    await db.from("organization_members").insert({
      organization_id: org.id,
      user_id: effectiveOwner,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (err) {
    console.error("[Admin Orgs] POST error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create organization",
      },
      { status: 500 }
    );
  }
}
