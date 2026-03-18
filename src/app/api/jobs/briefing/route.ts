import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export const maxDuration = 120;

// ── Helpers ────────────────────────────────────────────────────────────

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

// ── POST handler ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get brand_id from body
    const body = await request.json();
    const { brand_id } = body;

    if (!brand_id) {
      return NextResponse.json(
        { error: "brand_id is required" },
        { status: 400 }
      );
    }

    const db = createServiceRoleClient();

    // 3. Collect data for the briefing
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Fetch brand details
    const { data: brand } = await db
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Fetch competitor IDs for this brand
    const { data: competitors } = await db
      .from("competitors")
      .select("id, name, website_url")
      .eq("brand_id", brand_id)
      .eq("is_active", true);

    const competitorIds = (competitors ?? []).map((c) => c.id);

    // Fetch all data in parallel
    const [
      analysesRes,
      adsRes,
      contentRes,
      creativesRes,
      pipelineRunsRes,
    ] = await Promise.all([
      // Recent competitor analyses
      db
        .from("competitor_analyses")
        .select("*")
        .eq("brand_id", brand_id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10),

      // Recent competitor ads
      competitorIds.length > 0
        ? db
            .from("competitor_ads")
            .select("*")
            .in("competitor_id", competitorIds)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], count: 0 }),

      // Recent competitor content
      competitorIds.length > 0
        ? db
            .from("competitor_content")
            .select("*")
            .in("competitor_id", competitorIds)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),

      // Recent generated creatives
      db
        .from("generated_creatives")
        .select("*", { count: "exact", head: true })
        .eq("brand_id", brand_id)
        .gte("created_at", sevenDaysAgo),

      // Recent pipeline runs
      db
        .from("pipeline_runs")
        .select("*")
        .eq("brand_id", brand_id)
        .gte("started_at", sevenDaysAgo)
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

    const analyses = analysesRes.data ?? [];
    const ads = adsRes.data ?? [];
    const content = contentRes.data ?? [];
    const creativesCount = creativesRes.count ?? 0;
    const pipelineRuns = pipelineRunsRes.data ?? [];

    // Build competitor name map
    const competitorNameMap: Record<string, string> = {};
    (competitors ?? []).forEach((c) => {
      competitorNameMap[c.id] = c.name;
    });

    // Enrich ads with competitor names
    const enrichedAds = ads.map((ad) => ({
      competitor_name: competitorNameMap[ad.competitor_id] || "Unknown",
      headline: ad.headline,
      body_text: ad.body_text?.slice(0, 200),
      ad_type: ad.ad_type,
      cta_text: ad.cta_text,
      first_seen_at: ad.first_seen_at,
    }));

    // Enrich content with competitor names
    const enrichedContent = content.map((c) => ({
      competitor_name: competitorNameMap[c.competitor_id] || "Unknown",
      title: c.title,
      content_type: c.content_type,
      source: c.source,
      published_at: c.published_at,
    }));

    // 4. Build Claude prompt
    const systemPrompt = `You are an expert AI Chief Marketing Officer providing a daily intelligence briefing. You analyze competitive intelligence data and provide actionable, strategic insights. Be specific and data-driven. Avoid generic advice — ground everything in the actual data provided.

You must respond with ONLY valid JSON (no markdown, no code fences). The JSON must follow this exact structure:
{
  "executive_summary": "3-5 sentence strategic overview of the marketing landscape right now",
  "health_score": 72,
  "key_metrics": {
    "total_competitor_ads_tracked": 0,
    "new_ads_this_week": 0,
    "creatives_generated": 0,
    "content_pieces_analyzed": 0,
    "positioning_gaps_found": 0,
    "market_sophistication_level": 3
  },
  "wins": [
    {"title": "Win title", "description": "Details about the win", "impact": "high"}
  ],
  "concerns": [
    {"title": "Concern title", "description": "Details about the concern", "severity": "high"}
  ],
  "action_items": [
    {"title": "Action to take", "description": "Specific steps", "priority": "high", "category": "content"}
  ],
  "competitor_moves": [
    {"competitor": "Competitor Name", "move": "What they did", "implication": "What this means for us"}
  ],
  "content_recommendations": [
    {"type": "blog", "topic": "Topic idea", "reasoning": "Why this matters now", "platform": "website"}
  ]
}

Rules for scoring:
- health_score: 0-100 based on competitive position, data freshness, creative output, and market awareness
- impact/severity/priority: must be "high", "medium", or "low"
- category: must be "content", "ads", "competitors", or "strategy"
- type: must be "blog", "social", "ad", "email", or "video"
- If data is sparse, note it honestly and provide lower confidence scores
- Always provide at least 1-2 items in each array, even if data is limited (use recommendations based on brand context)`;

    const userPrompt = `Generate a CMO briefing for this brand:

## Brand
- Name: ${brand.name}
- URL: ${brand.url || "Not set"}
- Description: ${brand.description || "Not provided"}
- Voice: ${brand.voice || "Not defined"}
- Audience: ${brand.audience || "Not defined"}
- Market Sophistication Level: ${brand.market_sophistication_level ?? "Unknown"}

## Competitors (${(competitors ?? []).length} active)
${(competitors ?? []).map((c) => `- ${c.name} (${c.website_url || "no URL"})`).join("\n") || "No competitors configured yet"}

## Recent Intelligence Analyses (last 7 days): ${analyses.length} analyses
${analyses.length > 0
  ? analyses
      .map(
        (a) =>
          `- [${a.analysis_type}] ${a.title || "Untitled"}: ${a.summary?.slice(0, 200) || "No summary"}`
      )
      .join("\n")
  : "No analyses yet"
}

## Recent Competitor Ads (last 7 days): ${ads.length} new ads found
${enrichedAds.length > 0
  ? enrichedAds
      .slice(0, 20)
      .map(
        (a) =>
          `- [${a.competitor_name}] ${a.headline || "No headline"} (${a.ad_type || "unknown type"}) — CTA: ${a.cta_text || "none"}`
      )
      .join("\n")
  : "No competitor ads tracked yet"
}

## Recent Competitor Content (last 7 days): ${content.length} pieces
${enrichedContent.length > 0
  ? enrichedContent
      .slice(0, 20)
      .map(
        (c) =>
          `- [${c.competitor_name}] ${c.title || "Untitled"} (${c.content_type || "unknown"} via ${c.source})`
      )
      .join("\n")
  : "No competitor content tracked yet"
}

## Creative Output (last 7 days): ${creativesCount} creatives generated

## Pipeline Activity (last 7 days): ${pipelineRuns.length} runs
${pipelineRuns
  .map(
    (r) =>
      `- ${r.status} on ${r.started_at} — ads: ${r.meta_ads_found}, posts: ${r.social_posts_found}, pages: ${r.pages_analyzed}, creatives: ${r.creatives_generated}`
  )
  .join("\n") || "No pipeline runs yet"
}

Generate the full CMO briefing JSON now.`;

    // 5. Call Claude
    const rawResponse = await askClaude(systemPrompt, userPrompt, 4096);

    // 6. Parse the response
    let briefingData;
    try {
      // Try to extract JSON from the response (handle potential markdown fences)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      briefingData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", rawResponse);
      throw new Error(
        `Failed to parse briefing response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
      );
    }

    // 7. Save to briefings table
    const { data: briefing, error: insertError } = await db
      .from("briefings")
      .insert({
        brand_id,
        executive_summary: briefingData.executive_summary || null,
        health_score: briefingData.health_score ?? null,
        key_metrics: briefingData.key_metrics || null,
        wins: briefingData.wins || null,
        concerns: briefingData.concerns || null,
        action_items: briefingData.action_items || null,
        competitor_moves: briefingData.competitor_moves || null,
        content_recommendations: briefingData.content_recommendations || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save briefing:", insertError);
      // Still return the data even if save fails
      return NextResponse.json({
        briefing: briefingData,
        saved: false,
        error: insertError.message,
      });
    }

    return NextResponse.json({ briefing, saved: true });
  } catch (error) {
    console.error("Briefing generation failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate briefing",
      },
      { status: 500 }
    );
  }
}
