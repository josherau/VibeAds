import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("competitors")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // Use brand_id from body, or fall back to first brand
    let brandId = body.brand_id;
    if (!brandId) {
      const { data: brand } = await supabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!brand) {
        return NextResponse.json(
          { error: "No brand found. Please create a brand in Settings first." },
          { status: 400 }
        );
      }
      brandId = brand.id;
    }

    const { data, error } = await supabase
      .from("competitors")
      .insert({
        brand_id: brandId,
        user_id: user.id,
        name: body.name.trim(),
        website_url: body.website_url || null,
        meta_page_id: body.meta_page_id || null,
        instagram_handle: body.instagram_handle || null,
        twitter_handle: body.twitter_handle || null,
        linkedin_url: body.linkedin_url || null,
        youtube_url: body.youtube_url || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
