import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifySuperAdmin } from "../route";

// GET /api/admin/stats — platform-wide statistics
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceRoleClient() as any;

    // Run all counts in parallel
    const [
      usersRes,
      brandsRes,
      competitorsRes,
      orgsRes,
      pipelineRunsRes,
      activePipelineRes,
      adsRes,
      recentRunsRes,
      recentBrandsRes,
    ] = await Promise.all([
      db.auth.admin.listUsers({ perPage: 1 }),
      db.from("brands").select("id", { count: "exact", head: true }),
      db
        .from("competitors")
        .select("id", { count: "exact", head: true }),
      db
        .from("organizations")
        .select("id", { count: "exact", head: true }),
      db
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true }),
      db
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running"),
      db
        .from("competitor_ads")
        .select("id", { count: "exact", head: true }),
      // Recent pipeline runs
      db
        .from("pipeline_runs")
        .select("id, brand_id, status, started_at, completed_at, duration_ms")
        .order("started_at", { ascending: false })
        .limit(10),
      // Recent brands
      db
        .from("brands")
        .select("id, name, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Get total user count from auth
    const totalUsers = usersRes.data?.users
      ? (await db.auth.admin.listUsers({ perPage: 1000 })).data?.users
          ?.length ?? 0
      : 0;

    // Get brand names for recent pipeline runs
    const recentRuns = recentRunsRes.data ?? [];
    const brandIds = [
      ...new Set(
        recentRuns
          .map((r: { brand_id: string | null }) => r.brand_id)
          .filter(Boolean)
      ),
    ];
    let brandNameMap = new Map<string, string>();
    if (brandIds.length > 0) {
      const { data: brandNames } = await db
        .from("brands")
        .select("id, name")
        .in("id", brandIds);
      for (const b of brandNames ?? []) {
        brandNameMap.set(b.id, b.name);
      }
    }

    // Get owner emails for recent brands
    const recentBrands = recentBrandsRes.data ?? [];
    const ownerIds = [
      ...new Set(
        recentBrands.map((b: { user_id: string }) => b.user_id)
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

    const stats = {
      total_users: totalUsers,
      total_brands: brandsRes.count ?? 0,
      total_competitors: competitorsRes.count ?? 0,
      total_organizations: orgsRes.count ?? 0,
      total_pipeline_runs: pipelineRunsRes.count ?? 0,
      active_pipeline_runs: activePipelineRes.count ?? 0,
      total_ads_tracked: adsRes.count ?? 0,
      recent_pipeline_runs: recentRuns.map(
        (r: {
          id: string;
          brand_id: string | null;
          status: string;
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
        }) => ({
          ...r,
          brand_name: r.brand_id
            ? brandNameMap.get(r.brand_id) || "Unknown"
            : "N/A",
        })
      ),
      recent_brands: recentBrands.map(
        (b: {
          id: string;
          name: string;
          user_id: string;
          created_at: string;
        }) => ({
          ...b,
          owner_email: ownerEmails.get(b.user_id) || "",
        })
      ),
    };

    return NextResponse.json({ stats });
  } catch (err) {
    console.error("[Admin Stats] GET error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch stats",
      },
      { status: 500 }
    );
  }
}
