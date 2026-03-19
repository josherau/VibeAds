import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../route";

// GET /api/admin/brands — list all brands with owner info, org, competitor count
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    const { data: brands, error } = await db
      .from("brands")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get competitor counts
    const { data: competitors } = await db
      .from("competitors")
      .select("id, brand_id");

    const competitorCountMap = new Map<string, number>();
    for (const c of competitors ?? []) {
      competitorCountMap.set(
        c.brand_id,
        (competitorCountMap.get(c.brand_id) || 0) + 1
      );
    }

    // Get brand member counts
    const { data: brandMembers } = await db
      .from("brand_members")
      .select("brand_id");

    const brandMemberCountMap = new Map<string, number>();
    for (const bm of brandMembers ?? []) {
      brandMemberCountMap.set(
        bm.brand_id,
        (brandMemberCountMap.get(bm.brand_id) || 0) + 1
      );
    }

    // Get brand_access for org assignment
    const { data: brandAccess } = await db
      .from("brand_access")
      .select("brand_id, organization_id, organizations(id, name)");

    const orgMap = new Map<
      string,
      { org_id: string; org_name: string }
    >();
    for (const ba of brandAccess ?? []) {
      const org = ba.organizations as { id: string; name: string } | null;
      if (org) {
        orgMap.set(ba.brand_id, { org_id: org.id, org_name: org.name });
      }
    }

    // Get owner emails
    const ownerIds = [
      ...new Set(
        (brands ?? []).map((b: { user_id: string }) => b.user_id)
      ),
    ];
    const ownerEmails = new Map<string, string>();

    if (ownerIds.length > 0) {
      const { data: authData } = await db.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const u of authData?.users ?? []) {
        if (ownerIds.includes(u.id)) {
          ownerEmails.set(u.id, u.email || "");
        }
      }
    }

    const enrichedBrands = (brands ?? []).map(
      (b: {
        id: string;
        user_id: string;
        name: string;
        industry?: string;
        created_at: string;
        [key: string]: unknown;
      }) => ({
        ...b,
        owner_email: ownerEmails.get(b.user_id) || "",
        organization: orgMap.get(b.id) || null,
        competitor_count: competitorCountMap.get(b.id) || 0,
        brand_member_count: brandMemberCountMap.get(b.id) || 0,
      })
    );

    return NextResponse.json({ brands: enrichedBrands });
  } catch (err) {
    console.error("[Admin Brands] GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch brands",
      },
      { status: 500 }
    );
  }
}
