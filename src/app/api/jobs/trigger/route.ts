import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { brand_id, job_type } = await request.json();

    if (!brand_id || !job_type) {
      return NextResponse.json({ error: "brand_id and job_type are required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Create the job record
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        brand_id,
        user_id: user.id,
        job_type,
        status: "queued",
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    // TODO: Trigger Inngest function based on job_type
    // For now, we'll process inline via separate API routes
    // In Phase 1, each page calls its own /api/jobs/{type} endpoint

    return NextResponse.json(job);
  } catch (err: any) {
    console.error("Job trigger error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
