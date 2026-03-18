import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 120;

async function askClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096
): Promise<string> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const block = data.content?.[0];
  return block?.type === "text" ? block.text : "";
}

export async function POST(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { platform, post_type, topic, count, brand_id } = body;

    if (!platform || !post_type) {
      return NextResponse.json(
        { error: "platform and post_type are required" },
        { status: 400 }
      );
    }

    let brandId = brand_id;
    if (!brandId) {
      const { data: brands } = await authSupabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      brandId = brands?.id;
    }

    if (!brandId) {
      return NextResponse.json(
        { error: "No brand found. Please create a brand first." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch brand details
    const { data: brand } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Fetch recent competitor content for inspiration
    const { data: competitors } = await supabase
      .from("competitors")
      .select("id, name")
      .eq("brand_id", brandId)
      .eq("is_active", true);

    let competitorContent: string[] = [];
    if (competitors && competitors.length > 0) {
      const compIds = competitors.map((c) => c.id);
      const { data: content } = await supabase
        .from("competitor_content")
        .select("title, body_text, source, engagement_metrics")
        .in("competitor_id", compIds)
        .order("created_at", { ascending: false })
        .limit(10);

      if (content) {
        competitorContent = content.map(
          (c) =>
            `[${c.source}] ${c.title ?? ""}: ${(c.body_text ?? "").slice(0, 200)}`
        );
      }
    }

    // Fetch previously liked posts for preference learning
    const { data: likedPosts } = await supabase
      .from("social_posts")
      .select("content, platform, post_type")
      .eq("brand_id", brandId)
      .eq("feedback", "up")
      .order("created_at", { ascending: false })
      .limit(5);

    const postCount = count ?? 5;

    const platformRules: Record<string, string> = {
      twitter: "Max 280 characters. Punchy, provocative. Thread-friendly format. No fluff.",
      linkedin: "Professional tone, thought leadership. 1300 character sweet spot. Use line breaks for readability. Add a hook in the first line.",
      instagram: "Visual-first mindset. Caption with strategic line breaks. Up to 30 hashtags. Emoji usage encouraged. Include a call-to-action.",
      tiktok: "Hook in first 3 seconds (for scripts). Trending format awareness. Casual, authentic tone. Pattern interrupt opening.",
      facebook: "Longer form ok. Engagement-bait hooks. Story-driven content. Question-based openings perform well.",
      threads: "Conversational, concise. No hashtags needed. Authentic voice. Hot takes and opinions perform well.",
    };

    const systemPrompt = `You are an expert social media content strategist and copywriter. You create high-performing, platform-specific social media content.

BRAND VOICE:
Name: ${brand.name}
Description: ${brand.description ?? "N/A"}
Voice: ${brand.voice ?? "N/A"}
Audience: ${brand.audience ?? "N/A"}
Voice Profile: ${brand.voice_profile ? JSON.stringify(brand.voice_profile) : "N/A"}
Positioning Angles: ${brand.positioning_angles ? JSON.stringify(brand.positioning_angles) : "N/A"}
Vocabulary Guide: ${brand.vocabulary_guide ? JSON.stringify(brand.vocabulary_guide) : "N/A"}
Anti-Positioning (avoid these): ${brand.anti_positioning ?? "N/A"}
Market Sophistication Level: ${brand.market_sophistication_level ?? "N/A"}

PLATFORM RULES for ${platform.toUpperCase()}:
${platformRules[platform] ?? "Standard social media best practices."}

${competitorContent.length > 0 ? `COMPETITOR CONTENT (for inspiration, NOT to copy):
${competitorContent.join("\n")}` : ""}

${likedPosts && likedPosts.length > 0 ? `PREVIOUSLY LIKED POSTS (match this style/tone):
${likedPosts.map((p) => `[${p.platform}/${p.post_type}]: ${p.content.slice(0, 200)}`).join("\n")}` : ""}

IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

    const userPrompt = `Generate ${postCount} ${post_type} posts for ${platform}.${topic ? `\n\nTopic/Angle: ${topic}` : "\n\nAuto-generate topics based on brand positioning and competitor intelligence."}

Return this exact JSON structure:
{
  "posts": [
    {
      "content": "The full post content...",
      "hashtags": ["tag1", "tag2"],
      "media_prompt": "A description of an ideal image/visual to pair with this post",
      "positioning_angle_type": "contrarian|unique_mechanism|transformation|enemy|speed_ease|specificity|social_proof|risk_reversal",
      "copywriting_framework": "curiosity_gap|specific_numbers|before_after|problem_agitate_solve|fear_of_missing_out|social_proof_lead|direct_benefit|story_lead"
    }
  ]
}`;

    const raw = await askClaude(systemPrompt, userPrompt, 8192);

    // Parse JSON from response
    let parsed: { posts: Array<{
      content: string;
      hashtags?: string[];
      media_prompt?: string;
      positioning_angle_type?: string;
      copywriting_framework?: string;
    }> };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw },
        { status: 500 }
      );
    }

    if (!parsed.posts || !Array.isArray(parsed.posts)) {
      return NextResponse.json(
        { error: "Invalid response structure", raw },
        { status: 500 }
      );
    }

    // Save to social_posts table
    const inserts = parsed.posts.map((post) => ({
      brand_id: brandId,
      user_id: user.id,
      platform,
      post_type,
      content: post.content,
      hashtags: post.hashtags ?? null,
      media_prompt: post.media_prompt ?? null,
      positioning_angle_type: post.positioning_angle_type ?? null,
      copywriting_framework: post.copywriting_framework ?? null,
      topic: topic ?? null,
      status: "draft",
    }));

    const { data: savedPosts, error: insertError } = await supabase
      .from("social_posts")
      .insert(inserts)
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save posts", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ posts: savedPosts });
  } catch (err) {
    console.error("Social content generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
