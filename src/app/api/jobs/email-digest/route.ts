import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { buildDigestEmail } from "@/lib/email-templates/digest";

export const maxDuration = 300;

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

    // 2. Get params from body
    const body = await request.json();
    const { brand_id, test } = body as { brand_id?: string; test?: boolean };

    if (!brand_id) {
      return NextResponse.json(
        { error: "brand_id is required" },
        { status: 400 }
      );
    }

    const db = createServiceRoleClient();

    // 3. Fetch brand
    const { data: brand } = await db
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // 4. Collect intelligence data
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: competitors } = await db
      .from("competitors")
      .select("id, name, website_url")
      .eq("brand_id", brand_id)
      .eq("is_active", true);

    const competitorIds = (competitors ?? []).map((c) => c.id);

    const [analysesRes, adsRes, contentRes, briefingsRes] = await Promise.all([
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
        : Promise.resolve({ data: [] as never[] }),

      // Recent competitor content
      competitorIds.length > 0
        ? db
            .from("competitor_content")
            .select("*")
            .in("competitor_id", competitorIds)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as never[] }),

      // Latest briefing for health score
      db
        .from("briefings")
        .select("health_score, action_items, competitor_moves")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const analyses = analysesRes.data ?? [];
    const ads = adsRes.data ?? [];
    const content = contentRes.data ?? [];
    const latestBriefing = (briefingsRes.data ?? [])[0] ?? null;

    // Build competitor name map
    const competitorNameMap: Record<string, string> = {};
    (competitors ?? []).forEach((c) => {
      competitorNameMap[c.id] = c.name;
    });

    // Enrich data
    const enrichedAds = ads.map((ad) => ({
      competitor_name: competitorNameMap[ad.competitor_id] || "Unknown",
      headline: ad.headline,
      body_text: ad.body_text?.slice(0, 200),
      ad_type: ad.ad_type,
      cta_text: ad.cta_text,
      first_seen_at: ad.first_seen_at,
    }));

    const enrichedContent = content.map((c) => ({
      competitor_name: competitorNameMap[c.competitor_id] || "Unknown",
      title: c.title,
      content_type: c.content_type,
      source: c.source,
      engagement_metrics: c.engagement_metrics,
      published_at: c.published_at,
    }));

    // 5. Call Claude for executive summary and structured digest
    const systemPrompt = `You are an expert marketing analyst creating an email digest summary. Analyze the competitive intelligence data and produce a structured JSON response.

You must respond with ONLY valid JSON (no markdown, no code fences). The JSON must follow this exact structure:
{
  "executive_summary": "A concise 3-4 sentence strategic overview of the competitive landscape and key developments this period.",
  "competitor_moves": [
    {"competitor": "Name", "move": "What they did", "implication": "What this means for us"}
  ],
  "viral_outliers": [
    {"competitor": "Name", "title": "Content title", "platform": "instagram", "engagement_multiple": 3.5}
  ],
  "recommendations": [
    {"title": "Action title", "description": "Specific actionable recommendation", "priority": "high"}
  ]
}

Rules:
- executive_summary: Be specific and reference actual data, not generic
- competitor_moves: Include 3-5 of the most significant moves. If data is sparse, note what we know
- viral_outliers: Content performing significantly above baseline. Only include if evidence suggests outlier performance. Use empty array if none
- recommendations: Top 3 most actionable items. priority must be "high", "medium", or "low"
- Keep all text concise and suitable for email format`;

    const userPrompt = `Generate an email digest for this brand:

## Brand
- Name: ${brand.name}
- URL: ${brand.url || "Not set"}
- Description: ${brand.description || "Not provided"}

## Competitors (${(competitors ?? []).length} active)
${(competitors ?? []).map((c) => `- ${c.name} (${c.website_url || "no URL"})`).join("\n") || "No competitors configured yet"}

## Recent Intelligence Analyses (last 7 days): ${analyses.length} analyses
${
  analyses.length > 0
    ? analyses
        .map(
          (a) =>
            `- [${a.analysis_type}] ${a.title || "Untitled"}: ${a.summary?.slice(0, 200) || "No summary"}`
        )
        .join("\n")
    : "No analyses yet"
}

## Recent Competitor Ads (last 7 days): ${ads.length} new ads
${
  enrichedAds.length > 0
    ? enrichedAds
        .slice(0, 20)
        .map(
          (a) =>
            `- [${a.competitor_name}] ${a.headline || "No headline"} (${a.ad_type || "unknown"}) — CTA: ${a.cta_text || "none"}`
        )
        .join("\n")
    : "No competitor ads tracked yet"
}

## Recent Competitor Content (last 7 days): ${content.length} pieces
${
  enrichedContent.length > 0
    ? enrichedContent
        .slice(0, 20)
        .map(
          (c) =>
            `- [${c.competitor_name}] ${c.title || "Untitled"} (${c.content_type || "unknown"} via ${c.source}) engagement: ${JSON.stringify(c.engagement_metrics ?? {})}`
        )
        .join("\n")
    : "No competitor content tracked yet"
}

Generate the email digest JSON now.`;

    const rawResponse = await askClaude(systemPrompt, userPrompt, 2048);

    // 6. Parse response
    let digestData: {
      executive_summary: string;
      competitor_moves: Array<{
        competitor: string;
        move: string;
        implication: string;
      }>;
      viral_outliers: Array<{
        competitor: string;
        title: string;
        platform: string;
        engagement_multiple: number;
      }>;
      recommendations: Array<{
        title: string;
        description: string;
        priority: string;
      }>;
    };

    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      digestData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", rawResponse);
      throw new Error(
        `Failed to parse digest response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
      );
    }

    // 7. Build the email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibeads.ai";
    const digestDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const emailHtml = buildDigestEmail({
      brandName: brand.name,
      brandUrl: brand.url ?? undefined,
      executiveSummary: digestData.executive_summary,
      competitorMoves: digestData.competitor_moves ?? [],
      viralOutliers: (digestData.viral_outliers ?? []).map((v) => ({
        competitor: v.competitor,
        title: v.title,
        platform: v.platform,
        engagementMultiple: v.engagement_multiple,
      })),
      recommendations: digestData.recommendations ?? [],
      newAdsCount: ads.length,
      totalContentAnalyzed: content.length + analyses.length,
      healthScore: latestBriefing?.health_score ?? null,
      dashboardUrl: `${appUrl}/dashboard`,
      unsubscribeUrl: `${appUrl}/settings`,
      digestDate,
    });

    // 8. Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const userEmail = user.email;
    if (!userEmail) {
      throw new Error("User email not found");
    }

    const subjectPrefix = test ? "[TEST] " : "";
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "VibeAds <digest@vibeads.ai>",
        to: [userEmail],
        subject: `${subjectPrefix}Weekly Intelligence Digest - ${brand.name}`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend API error (${emailRes.status}): ${errBody}`);
    }

    const emailResult = await emailRes.json();

    // 9. Record the send in pipeline_runs
    await db.from("pipeline_runs").insert({
      brand_id,
      status: "completed",
      steps_completed: ["email_digest"],
      meta_ads_found: 0,
      social_posts_found: 0,
      pages_analyzed: 0,
      creatives_generated: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      emailId: emailResult.id,
      sentTo: userEmail,
      test: test ?? false,
      digestSummary: digestData.executive_summary,
    });
  } catch (error) {
    console.error("Email digest failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send email digest",
      },
      { status: 500 }
    );
  }
}
