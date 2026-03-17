import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    const body = await request.json().catch(() => ({}));
    const brand_id = body.brand_id;

    // If no brand_id provided, get the user's first brand
    let resolvedBrandId = brand_id;
    if (!resolvedBrandId) {
      const { data: brands } = await supabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      resolvedBrandId = brands?.id;
    }

    if (!resolvedBrandId) {
      return NextResponse.json(
        { error: "No brand found. Please create a brand in Settings first." },
        { status: 400 }
      );
    }

    // Call the run-pipeline Edge Function
    const { data, error } = await supabase.functions.invoke("run-pipeline", {
      body: { brand_id: resolvedBrandId },
    });

    if (error) {
      console.error("Pipeline invocation error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to invoke pipeline" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      run_id: data?.run_id ?? null,
      message: "Pipeline started",
    });
  } catch (err) {
    console.error("Pipeline route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
