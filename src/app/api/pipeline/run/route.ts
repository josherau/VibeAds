import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Json = Database["public"]["Tables"]["competitor_analyses"]["Row"]["patterns"];

export const maxDuration = 300;

// ── Helpers ────────────────────────────────────────────────────────────

const APIFY_BASE = "https://api.apify.com/v2";

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
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const block = data.content?.[0];
  return block?.type === "text" ? block.text : "";
}

async function startApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  token: string
): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to start Apify actor ${actorId}: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.data.id;
}

async function waitForApifyRun(
  runId: string,
  token: string,
  maxWaitMs = 45000
): Promise<any[]> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    const data = await res.json();
    const status = data.data?.status;

    if (status === "SUCCEEDED") {
      const datasetId = data.data.defaultDatasetId;
      const itemsRes = await fetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`
      );
      return await itemsRes.json();
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Apify run ${runId} timed out after ${maxWaitMs}ms`);
}

// ── Step implementations ───────────────────────────────────────────────

async function stepResearchMetaAds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
) {
  const metaAccessToken = process.env.META_ACCESS_TOKEN;
  if (!metaAccessToken) {
    console.log("META_ACCESS_TOKEN not configured, skipping Meta ads research");
    return { ads_found: 0, skipped: true, reason: "META_ACCESS_TOKEN not configured" };
  }

  const { data: competitors, error: compError } = await supabase
    .from("competitors")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .not("meta_page_id", "is", null);

  if (compError) throw compError;

  console.log(`[Meta Ads] Found ${competitors?.length ?? 0} competitors with Meta page IDs`);

  let totalAdsFound = 0;

  for (const competitor of competitors ?? []) {
    try {
      console.log(`[Meta Ads] Fetching ads for ${competitor.name} (page: ${competitor.meta_page_id})`);

      let nextCursor: string | null = null;
      let competitorAdsCount = 0;

      do {
        const params = new URLSearchParams({
          search_page_ids: competitor.meta_page_id!,
          ad_reached_countries: '["US"]',
          fields:
            "ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms",
          access_token: metaAccessToken,
          limit: "25",
        });

        if (nextCursor) {
          params.set("after", nextCursor);
        }

        const url = `https://graph.facebook.com/v21.0/ads_archive?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[Meta Ads] API error for ${competitor.name}: ${response.status} ${errorBody}`);
          break;
        }

        const data = await response.json();
        const ads = data.data ?? [];

        for (const ad of ads) {
          const adRecord = {
            competitor_id: competitor.id,
            brand_id: competitor.brand_id,
            source: "meta_ad_library",
            platform: (ad.publisher_platforms ?? []).join(", ") || "facebook",
            headline: ad.ad_creative_link_titles?.[0] ?? null,
            body_text: ad.ad_creative_bodies?.[0] ?? null,
            description: ad.ad_creative_link_descriptions?.[0] ?? null,
            caption: ad.ad_creative_link_captions?.[0] ?? null,
            snapshot_url: ad.ad_snapshot_url ?? null,
            started_at: ad.ad_delivery_start_time ?? null,
            stopped_at: ad.ad_delivery_stop_time ?? null,
            external_id: ad.ad_snapshot_url ?? ad.id ?? null,
            raw_data: ad,
            fetched_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from("competitor_ads")
            .upsert(adRecord, { onConflict: "external_id" });

          if (upsertError) {
            console.error(`[Meta Ads] Upsert error: ${upsertError.message}`);
          } else {
            competitorAdsCount++;
          }
        }

        nextCursor = data.paging?.cursors?.after ?? null;
        const hasNextPage = data.paging?.next != null;
        if (!hasNextPage) nextCursor = null;
      } while (nextCursor);

      console.log(`[Meta Ads] Found ${competitorAdsCount} ads for ${competitor.name}`);
      totalAdsFound += competitorAdsCount;
    } catch (err) {
      console.error(`[Meta Ads] Error processing competitor ${competitor.name}:`, err);
    }
  }

  console.log(`[Meta Ads] Total ads found: ${totalAdsFound}`);
  return { ads_found: totalAdsFound };
}

async function stepResearchSocial(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
) {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    console.log("APIFY_API_TOKEN not configured, skipping social research");
    return { total: 0, skipped: true, reason: "APIFY_API_TOKEN not configured" };
  }

  const { data: competitors, error: compError } = await supabase
    .from("competitors")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true);

  if (compError) throw compError;

  const socialCompetitors = (competitors ?? []).filter(
    (c: any) => c.instagram_handle || c.twitter_handle || c.linkedin_url
  );

  // Skip early if no competitors have social profiles configured
  if (socialCompetitors.length === 0) {
    console.log("[Social] No competitors have social profiles configured, skipping");
    return { total: 0, skipped: true, reason: "No competitors with social profiles" };
  }

  console.log(`[Social] Found ${socialCompetitors.length} competitors with social profiles`);

  let instagramCount = 0;
  let twitterCount = 0;

  for (const competitor of socialCompetitors) {
    // Instagram scraping
    if (competitor.instagram_handle) {
      try {
        console.log(`[Social] Scraping Instagram for ${competitor.name} (@${competitor.instagram_handle})`);

        const runId = await startApifyActor(
          "apify~instagram-profile-scraper",
          { usernames: [competitor.instagram_handle], resultsLimit: 20 },
          apifyToken
        );

        const results = await waitForApifyRun(runId, apifyToken);

        for (const post of Array.isArray(results) ? results : []) {
          const record = {
            competitor_id: competitor.id,
            brand_id: competitor.brand_id,
            content_type: "social_post",
            platform: "instagram",
            source: "apify",
            title: post.caption?.slice(0, 200) ?? null,
            body_text: post.caption ?? null,
            url:
              post.url ??
              (post.shortCode
                ? `https://instagram.com/p/${post.shortCode}`
                : null),
            engagement_likes: post.likesCount ?? null,
            engagement_comments: post.commentsCount ?? null,
            posted_at: post.timestamp ?? null,
            external_id: post.id ?? post.shortCode ?? null,
            raw_data: post,
            fetched_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("competitor_content")
            .upsert(record, { onConflict: "external_id" });

          if (error) {
            console.error(`[Social] Instagram upsert error: ${error.message}`);
          } else {
            instagramCount++;
          }
        }
      } catch (err) {
        console.error(`[Social] Instagram scrape error for ${competitor.name}:`, err);
      }
    }

    // Twitter/X scraping
    if (competitor.twitter_handle) {
      try {
        console.log(`[Social] Scraping Twitter for ${competitor.name} (@${competitor.twitter_handle})`);

        const runId = await startApifyActor(
          "apify~twitter-scraper",
          { handles: [competitor.twitter_handle], maxTweets: 20 },
          apifyToken
        );

        const results = await waitForApifyRun(runId, apifyToken);

        for (const tweet of Array.isArray(results) ? results : []) {
          const record = {
            competitor_id: competitor.id,
            brand_id: competitor.brand_id,
            content_type: "social_post",
            platform: "twitter",
            source: "apify",
            title: tweet.text?.slice(0, 200) ?? null,
            body_text: tweet.text ?? null,
            url: tweet.url ?? null,
            engagement_likes: tweet.likeCount ?? tweet.favoriteCount ?? null,
            engagement_comments: tweet.replyCount ?? null,
            engagement_shares: tweet.retweetCount ?? null,
            posted_at: tweet.createdAt ?? null,
            external_id: tweet.id ?? null,
            raw_data: tweet,
            fetched_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("competitor_content")
            .upsert(record, { onConflict: "external_id" });

          if (error) {
            console.error(`[Social] Twitter upsert error: ${error.message}`);
          } else {
            twitterCount++;
          }
        }
      } catch (err) {
        console.error(`[Social] Twitter scrape error for ${competitor.name}:`, err);
      }
    }
  }

  console.log(`[Social] Complete. Instagram: ${instagramCount}, Twitter: ${twitterCount}`);
  return {
    instagram_posts: instagramCount,
    twitter_posts: twitterCount,
    total: instagramCount + twitterCount,
  };
}

async function scrapeSingleLandingPage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  competitor: any,
  firecrawlApiKey: string
): Promise<boolean> {
  try {
    console.log(`[Landing Pages] Scraping ${competitor.name}: ${competitor.website_url}`);

    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url: competitor.website_url,
        formats: ["markdown"],
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout per scrape
    });

    if (!scrapeRes.ok) {
      const errBody = await scrapeRes.text();
      console.error(`[Landing Pages] Firecrawl error for ${competitor.name}: ${scrapeRes.status} ${errBody}`);
      return false;
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData.data?.markdown ?? "";

    if (!markdown) {
      console.log(`[Landing Pages] No markdown content for ${competitor.name}`);
      return false;
    }

    // Use Claude to parse the markdown into structured data
    const parsedContent = await askClaude(
      `You are a marketing analyst. Parse the following landing page content and extract structured data. Return ONLY valid JSON with this structure:
{
  "headline": "main H1 headline",
  "subheadline": "supporting subheadline if present",
  "ctas": ["list of call-to-action button texts"],
  "offers": ["list of offers, deals, or pricing mentioned"],
  "trust_signals": ["testimonials, client logos, certifications, stats mentioned"],
  "value_propositions": ["key value props or benefits listed"],
  "key_messaging_themes": ["recurring themes or angles"]
}`,
      `Landing page content for ${competitor.name} (${competitor.website_url}):\n\n${markdown.slice(0, 8000)}`
    );

    let structured: Record<string, unknown> = {};
    try {
      const jsonMatch = parsedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error(`[Landing Pages] Failed to parse Claude response for ${competitor.name}:`, parseErr);
      structured = { raw_analysis: parsedContent };
    }

    const record = {
      competitor_id: competitor.id,
      brand_id: competitor.brand_id,
      content_type: "landing_page",
      platform: "website",
      source: "website",
      title: (structured.headline as string) ?? null,
      body_text: markdown.slice(0, 10000),
      url: competitor.website_url,
      structured_data: structured,
      external_id: `lp_${competitor.id}_${new Date().toISOString().split("T")[0]}`,
      raw_data: {
        markdown: markdown.slice(0, 20000),
        firecrawl_metadata: scrapeData.data?.metadata,
      },
      fetched_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("competitor_content")
      .upsert(record, { onConflict: "external_id" });

    if (upsertError) {
      console.error(`[Landing Pages] Upsert error for ${competitor.name}: ${upsertError.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Landing Pages] Error for ${competitor.name}:`, err);
    return false;
  }
}

async function stepResearchLandingPages(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
) {
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlApiKey) {
    console.log("FIRECRAWL_API_KEY not configured, skipping landing page research");
    return { pages_scraped: 0, skipped: true, reason: "FIRECRAWL_API_KEY not configured" };
  }

  const { data: competitors, error: compError } = await supabase
    .from("competitors")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .not("website_url", "is", null)
    .limit(3); // Limit to 3 competitors to stay within serverless timeout

  if (compError) throw compError;

  console.log(`[Landing Pages] Scraping ${competitors?.length ?? 0} competitor landing pages in parallel`);

  // Scrape all landing pages in parallel instead of sequentially
  const results = await Promise.allSettled(
    (competitors ?? []).map((comp) => scrapeSingleLandingPage(supabase, comp, firecrawlApiKey))
  );

  const pagesScraped = results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;

  console.log(`[Landing Pages] Complete. Pages scraped: ${pagesScraped}`);
  return { pages_scraped: pagesScraped };
}

async function stepAnalyzeCompetitors(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
): Promise<{ analysis_id: string | null }> {
  // Fetch brand details
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .single();

  if (brandError) throw brandError;

  // Fetch recent competitor ads (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentAds, error: adsError } = await supabase
    .from("competitor_ads")
    .select("*, competitors(name)")
    .eq("brand_id", brandId)
    .gte("fetched_at", sevenDaysAgo)
    .limit(50);

  if (adsError) throw adsError;

  // Fetch recent competitor content (last 7 days)
  const { data: recentContent, error: contentError } = await supabase
    .from("competitor_content")
    .select("*, competitors(name)")
    .eq("brand_id", brandId)
    .gte("fetched_at", sevenDaysAgo)
    .limit(50);

  if (contentError) throw contentError;

  // Fetch previous analysis for context
  const { data: previousAnalyses } = await supabase
    .from("competitor_analyses")
    .select("summary, patterns, opportunities, positioning_gaps, market_sophistication, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(3);

  console.log(
    `[Analysis] Data collected - Ads: ${recentAds?.length ?? 0}, Content: ${recentContent?.length ?? 0}, Previous analyses: ${previousAnalyses?.length ?? 0}`
  );

  // Prepare data summaries for Claude
  const adsSummary = (recentAds ?? []).map((ad: any) => ({
    competitor: ad.competitors?.name,
    platform: ad.platform,
    headline: ad.headline,
    body: ad.body_text?.slice(0, 300),
    description: ad.description,
    cta: ad.cta_text,
    started: ad.started_at,
  }));

  const contentSummary = (recentContent ?? []).map((c: any) => ({
    competitor: c.competitors?.name,
    type: c.content_type,
    platform: c.platform,
    title: c.title,
    body: c.body_text?.slice(0, 300),
    structured: c.structured_data,
    engagement: {
      likes: c.engagement_likes,
      comments: c.engagement_comments,
      shares: c.engagement_shares,
    },
  }));

  const systemPrompt = `You are an elite competitive intelligence analyst specializing in direct response marketing and the Vibe Marketing Playbook methodology. You combine deep knowledge of Eugene Schwartz's market sophistication theory, positioning strategy, and ad copy analysis.

Your analysis must go beyond surface-level observations. You need to identify strategic positioning gaps, map market sophistication, extract proven patterns, and expose anti-patterns that the brand should avoid.

## ANALYSIS FRAMEWORK

Analyze all competitor data through these five lenses:

### 1. POSITIONING GAP ANALYSIS
Identify what competitors are NOT saying. Look for:
- Unoccupied positioning angles (contrarian, unique mechanism, transformation, enemy, speed/ease, specificity, social proof, risk reversal)
- Emotional territories no one is claiming
- Audience segments being ignored
- Value propositions left unstated
- Messaging themes with no competition

### 2. MARKET SOPHISTICATION MAPPING (Schwartz's 5 Stages)
Determine what stage the market is at:
- Stage 1: Direct claims work. "We do X." Market is still being educated.
- Stage 2: Enlarged claims. Competitors making bigger promises. "We do X BETTER."
- Stage 3: Mechanism stage. Competitors explaining HOW. "Our unique process does X."
- Stage 4: Enhanced mechanism. More specific, improved mechanisms. "Our NEW improved process does X."
- Stage 5: Identity stage. Competitors selling identity/values, not features. "For people who believe X."

Provide evidence for your assessment based on the actual competitor copy analyzed.

### 3. WINNING PATTERN EXTRACTION
Identify copy patterns that appear across multiple successful competitors:
- Headline formulas that get repeated
- Opening hooks that are common
- Proof elements used most frequently
- CTA language and urgency tactics
- Visual/creative patterns
- Offer structures that recur

### 4. ANTI-PATTERN IDENTIFICATION
What are competitors doing that the brand should explicitly NOT do:
- Overused cliches and tired phrases
- Weak positioning that everyone copies
- Generic CTAs that create no urgency
- Claims without proof
- Messaging that commoditizes the category
- Visual styles that make everyone look the same

### 5. COMPETITIVE GAP ANALYSIS (Per Competitor)
For each competitor, identify:
- Their primary positioning angle
- Their biggest weakness/blind spot
- The opportunity they are leaving on the table
- How to differentiate against them specifically

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{
  "title": "Brief analysis title",
  "summary": "2-3 paragraph executive summary covering key strategic insights and recommended actions",
  "patterns": {
    "messaging_themes": ["list of common messaging themes across competitors"],
    "offer_structures": ["how competitors structure their offers"],
    "visual_styles": ["visual/creative style observations"],
    "cta_patterns": ["common CTA patterns and language"],
    "headline_formulas": ["recurring headline structures"],
    "proof_elements": ["types of proof/evidence used"]
  },
  "opportunities": [
    {
      "gap": "Description of the competitive gap",
      "suggestion": "Actionable suggestion to exploit this gap",
      "positioning_angle": "contrarian|unique_mechanism|transformation|enemy|speed_ease|specificity|social_proof|risk_reversal",
      "priority": "high|medium|low",
      "estimated_impact": "Brief description of expected impact"
    }
  ],
  "positioning_gaps": {
    "unoccupied_angles": ["Positioning angles no competitor is using"],
    "emotional_territories": ["Emotional spaces no one is claiming"],
    "ignored_segments": ["Audience segments being overlooked"],
    "unstated_value_props": ["Value propositions no one is articulating"],
    "messaging_voids": ["Topics or themes with zero competition"]
  },
  "market_sophistication": {
    "level": 1-5,
    "evidence": ["Specific examples from competitor copy that demonstrate this level"],
    "implication": "What this means for the brand's copy strategy",
    "recommended_approach": "How to write copy at this sophistication level"
  },
  "winning_patterns": {
    "high_performing_formulas": ["Copy patterns that appear across multiple competitors and likely work"],
    "common_hooks": ["Opening hooks used frequently"],
    "proof_strategies": ["How competitors build credibility"],
    "urgency_tactics": ["How competitors create urgency/scarcity"],
    "offer_frameworks": ["How competitors structure their offers"]
  },
  "anti_patterns": {
    "overused_cliches": ["Tired phrases and messaging everyone uses"],
    "weak_positioning": ["Generic positions that commoditize the market"],
    "generic_ctas": ["CTAs that create no urgency or differentiation"],
    "unsubstantiated_claims": ["Claims made without proof"],
    "visual_sameness": ["Visual patterns that make everyone look identical"],
    "avoid_these": ["Explicit list of things the brand must NOT do"]
  },
  "competitor_gap_analysis": [
    {
      "competitor_name": "Name of competitor",
      "primary_positioning": "Their main angle",
      "biggest_weakness": "Their most exploitable weakness",
      "opportunity": "How to differentiate against them specifically",
      "what_they_do_well": "What to learn from (not copy) them"
    }
  ]
}

Return ONLY valid JSON. No markdown formatting, no code blocks, no explanatory text.`;

  const userPrompt = `Analyze competitive intelligence for "${brand.name}".

BRAND CONTEXT:
- Name: ${brand.name}
- Industry: ${brand.audience ?? "N/A"}
- Description: ${brand.description ?? "N/A"}
- Current voice: ${brand.voice ?? "N/A"}
- Current positioning angles: ${brand.positioning_angles ? JSON.stringify(brand.positioning_angles) : "Not yet defined"}
- Anti-positioning (what we do NOT want to be): ${brand.anti_positioning ?? "Not yet defined"}
- Current market sophistication assessment: ${brand.market_sophistication_level ?? "Not yet assessed"}

RECENT COMPETITOR ADS (${adsSummary.length} total):
${JSON.stringify(adsSummary, null, 2)}

RECENT COMPETITOR CONTENT (${contentSummary.length} total):
${JSON.stringify(contentSummary, null, 2)}

${
  previousAnalyses?.length
    ? `PREVIOUS ANALYSIS CONTEXT (for trend tracking):\n${JSON.stringify(
        previousAnalyses.map((a: any) => ({
          summary: a.summary?.slice(0, 500),
          positioning_gaps: a.positioning_gaps,
          market_sophistication: a.market_sophistication,
          date: a.created_at,
        })),
        null,
        2
      )}`
    : "No previous analyses available."
}

IMPORTANT: Provide deep strategic analysis, not surface-level observations. Focus on actionable positioning gaps and specific opportunities the brand can exploit. Every insight should be grounded in evidence from the competitor data provided.`;

  const analysisResponse = await askClaude(systemPrompt, userPrompt, 8192);

  // Parse the analysis
  let analysis: Record<string, unknown> = {};
  try {
    const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    }
  } catch (parseErr) {
    console.error("[Analysis] Failed to parse response:", parseErr);
    analysis = {
      title: "Competitor Analysis",
      summary: analysisResponse,
      patterns: {},
      opportunities: [],
      positioning_gaps: {},
      market_sophistication: {
        level: 3,
        evidence: [],
        implication: "Unable to parse",
        recommended_approach: "Review manually",
      },
      winning_patterns: {},
      anti_patterns: {},
      competitor_gap_analysis: [],
    };
  }

  // Insert analysis into database
  const { data: insertedAnalysis, error: insertError } = await supabase
    .from("competitor_analyses")
    .insert({
      brand_id: brandId,
      analysis_type: "competitive_gap",
      title: (analysis.title as string) ?? "Competitor Analysis",
      summary: (analysis.summary as string) ?? "",
      patterns: (analysis.patterns ?? {}) as unknown as Json,
      opportunities: (analysis.opportunities ?? []) as unknown as Json,
      positioning_gaps: (analysis.positioning_gaps ?? []) as unknown as Json,
      market_sophistication: typeof analysis.market_sophistication === "number" ? analysis.market_sophistication : null,
      winning_patterns: (analysis.winning_patterns ?? []) as unknown as Json,
      anti_patterns: (analysis.anti_patterns ?? []) as unknown as Json,
      recommendations: (analysis.recommendations ?? {}) as unknown as Json,
      competitor_gap_analysis: (analysis.competitor_gap_analysis ?? []) as unknown as Json,
      ads_analyzed: recentAds?.length ?? 0,
      content_analyzed: recentContent?.length ?? 0,
      raw_response: analysisResponse,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  console.log(`[Analysis] Complete. ID: ${insertedAnalysis.id}`);
  return { analysis_id: insertedAnalysis.id };
}

async function stepGenerateAds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string,
  analysisId: string,
  userId: string
): Promise<{ creatives_generated: number }> {
  // Fetch brand details
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .single();

  if (brandError) throw brandError;

  // Fetch the analysis
  const { data: analysis, error: analysisError } = await supabase
    .from("competitor_analyses")
    .select("*")
    .eq("id", analysisId)
    .single();

  if (analysisError) throw analysisError;

  // Fetch previously liked creatives for style guidance
  const { data: likedCreatives } = await supabase
    .from("generated_creatives")
    .select(
      "headline, primary_text, platform, format, competitive_angle, positioning_angle_type, copywriting_framework"
    )
    .eq("brand_id", brandId)
    .eq("feedback", "up")
    .order("created_at", { ascending: false })
    .limit(10);

  const positioningAngles = brand.positioning_angles ?? null;
  const voiceProfile = brand.voice_profile ?? null;
  const vocabularyGuide = brand.vocabulary_guide ?? null;
  const antiPositioning = brand.anti_positioning ?? null;
  const marketSophLevel =
    brand.market_sophistication_level ??
    (analysis.market_sophistication as any)?.level ??
    3;

  const systemPrompt = `You are an elite direct response copywriter and ad creative director trained in the Vibe Marketing Playbook methodology. You combine deep knowledge of Eugene Schwartz's market sophistication theory, proven direct response frameworks, and modern platform-specific ad optimization.

Your job is to generate high-converting ad concepts that are strategically differentiated from competitors and grounded in specific positioning angles.

## POSITIONING ANGLE TYPES
Each ad concept MUST use one of these positioning angles:
- **contrarian**: Challenge conventional wisdom in the market. Say the opposite of what everyone else says.
- **unique_mechanism**: Highlight a proprietary method, system, or process that makes the brand different.
- **transformation**: Focus on the before/after state of the customer. Paint a vivid picture of life after using the product.
- **enemy**: Identify a common enemy (bad practices, outdated tools, industry lies) and position the brand against it.
- **speed_ease**: Emphasize how fast or easy the result comes. Remove friction and objections about effort.
- **specificity**: Use ultra-specific numbers, timeframes, and results to build credibility.
- **social_proof**: Lead with testimonials, case studies, user counts, or authority signals.
- **risk_reversal**: Remove all risk from the purchase decision. Guarantees, free trials, no-commitment offers.

## DIRECT RESPONSE HEADLINE FRAMEWORKS
Use these tested patterns for headlines:
- **curiosity_gap**: Create an information gap that compels the click. "The [X] mistake that [audience] makes every [time period]"
- **specific_numbers**: Lead with concrete data. "How [X] [audience] achieved [specific result] in [timeframe]"
- **before_after**: Contrast the painful present with the desired future. "Stop [pain point]. Start [desired outcome]."
- **problem_agitate_solve**: Name the problem, twist the knife, then present the solution.
- **fear_of_missing_out**: Create urgency through scarcity or social momentum.
- **social_proof_lead**: Open with proof before making any claims.
- **direct_benefit**: State the primary benefit clearly and immediately.
- **story_lead**: Open with a compelling micro-story that hooks attention.

## SCHWARTZ MARKET SOPHISTICATION LEVELS
Write copy appropriate to the market's sophistication level:
- Level 1: Be direct. Simply state what you do and why it matters. The market is unaware.
- Level 2: Make bigger, bolder claims. Enlarge on the existing promise.
- Level 3: Introduce a UNIQUE MECHANISM. Show HOW your solution works differently.
- Level 4: Emphasize an improved, expanded, or more specific mechanism.
- Level 5: Identify with the prospect's worldview. Lead with story, identity, and values — not claims.

The current market sophistication level is: ${marketSophLevel}

## OUTPUT FORMAT
Generate exactly 8 ad concepts as a JSON array. For each concept, create platform-specific variants and A/B test options.

Each ad object must follow this exact structure:
{
  "platform": "meta" | "google" | "linkedin",
  "format": "single_image" | "carousel" | "video_script" | "search_ad",
  "positioning_angle_type": "contrarian" | "unique_mechanism" | "transformation" | "enemy" | "speed_ease" | "specificity" | "social_proof" | "risk_reversal",
  "positioning_framework": "Brief description of the specific angle being used",
  "copywriting_framework": "curiosity_gap" | "specific_numbers" | "before_after" | "problem_agitate_solve" | "fear_of_missing_out" | "social_proof_lead" | "direct_benefit" | "story_lead",
  "psychological_trigger": "The specific psychological trigger being leveraged (e.g., loss aversion, authority bias, social proof, reciprocity)",
  "schwartz_sophistication_level": 1-5,
  "headline": "Primary headline (Meta: any length, Google: max 30 chars)",
  "headline_variants": ["A/B variant headline 1", "A/B variant headline 2"],
  "primary_text": "Main ad body text - SHORT version (2-3 sentences for Meta, max 90 chars for Google descriptions)",
  "primary_text_variants": ["LONG version body text (4-6 sentences, story-driven or detailed)", "Alternative short version with different angle"],
  "description": "Link description / ad description",
  "cta": "Call to action text that matches the positioning angle",
  "image_prompt": "Detailed AI image generation prompt for the primary visual",
  "image_concept_description": "Brief human-readable description of the visual concept",
  "image_concepts": [
    {"concept": "Visual concept 1 description", "prompt": "Detailed AI generation prompt for concept 1", "style": "photo|illustration|abstract|lifestyle"},
    {"concept": "Visual concept 2 description", "prompt": "Detailed AI generation prompt for concept 2", "style": "photo|illustration|abstract|lifestyle"},
    {"concept": "Visual concept 3 description", "prompt": "Detailed AI generation prompt for concept 3", "style": "photo|illustration|abstract|lifestyle"}
  ],
  "video_script_concept": "15-30 second video script concept with: Hook (0-3s), Problem (3-8s), Solution (8-18s), Proof (18-25s), CTA (25-30s)",
  "google_headlines": ["Headline 1 (max 30 chars)", "Headline 2 (max 30 chars)", "Headline 3 (max 30 chars)"],
  "google_descriptions": ["Description 1 (max 90 chars)", "Description 2 (max 90 chars)"],
  "linkedin_intro_text": "LinkedIn-specific intro text (professional tone, thought leadership angle)",
  "linkedin_headline": "LinkedIn headline (professional, value-driven)",
  "target_audience": "Specific audience segment this ad targets",
  "competitive_angle": "What competitive insight or gap this ad exploits",
  "confidence_score": 0.0 to 1.0
}

## DISTRIBUTION REQUIREMENTS
Generate this mix of 8 ads:
- 3 for Meta (Facebook/Instagram): 2 single_image + 1 carousel or video_script
- 3 for Google: search_ad format with proper character limits
- 2 for LinkedIn: sponsored_content format with professional tone

## CRITICAL RULES
- Each ad MUST use a DIFFERENT positioning angle type — do NOT repeat the same angle across ads
- Each ad MUST use a DIFFERENT copywriting framework — vary the headline approach
- Google headlines MUST be 30 characters or fewer
- Google descriptions MUST be 90 characters or fewer
- Headlines must create genuine curiosity or state a clear benefit — no vague clickbait
- Every CTA must be specific to the angle (not generic "Learn More")
- Image prompts must be detailed enough for AI image generation (style, composition, mood, colors)
- Video scripts must follow the Hook-Problem-Solution-Proof-CTA structure
- Return ONLY a valid JSON array of 8 objects. No markdown, no explanation.`;

  // Build voice and vocabulary instructions
  let voiceInstructions = "";
  if (voiceProfile) {
    voiceInstructions += `\n\nBRAND VOICE PROFILE:\n${JSON.stringify(voiceProfile, null, 2)}`;
  }
  if (brand.voice) {
    voiceInstructions += `\nBrand voice summary: ${brand.voice}`;
  }
  if (vocabularyGuide) {
    const vocab = vocabularyGuide as any;
    if (vocab.words_to_use) {
      voiceInstructions += `\n\nWORDS TO USE (incorporate these into copy):\n${
        Array.isArray(vocab.words_to_use)
          ? vocab.words_to_use.join(", ")
          : JSON.stringify(vocab.words_to_use)
      }`;
    }
    if (vocab.words_to_avoid) {
      voiceInstructions += `\n\nWORDS TO AVOID (never use these):\n${
        Array.isArray(vocab.words_to_avoid)
          ? vocab.words_to_avoid.join(", ")
          : JSON.stringify(vocab.words_to_avoid)
      }`;
    }
    if (vocab.phrases_to_use) {
      voiceInstructions += `\n\nPHRASES TO USE:\n${
        Array.isArray(vocab.phrases_to_use)
          ? vocab.phrases_to_use.join(", ")
          : JSON.stringify(vocab.phrases_to_use)
      }`;
    }
    if (vocab.tone_descriptors) {
      voiceInstructions += `\n\nTONE DESCRIPTORS:\n${
        Array.isArray(vocab.tone_descriptors)
          ? vocab.tone_descriptors.join(", ")
          : JSON.stringify(vocab.tone_descriptors)
      }`;
    }
  }

  // Build positioning angles context
  let positioningContext = "";
  if (positioningAngles) {
    positioningContext = `\n\nBRAND POSITIONING ANGLES (use these as the foundation for ad concepts):\n${JSON.stringify(
      positioningAngles,
      null,
      2
    )}`;
  }

  // Build anti-positioning context
  let antiContext = "";
  if (antiPositioning) {
    antiContext = `\n\nANTI-POSITIONING (what we explicitly do NOT want to say or be associated with):\n${antiPositioning}`;
  }

  // Build competitive intelligence context
  let competitiveContext = "";
  if (analysis) {
    competitiveContext = `\n\nCOMPETITIVE ANALYSIS:\nTitle: ${analysis.title ?? "N/A"}\nSummary: ${analysis.summary ?? "N/A"}`;
    if (analysis.patterns) {
      competitiveContext += `\nPatterns: ${JSON.stringify(analysis.patterns, null, 2)}`;
    }
    if (analysis.opportunities) {
      competitiveContext += `\nOpportunities: ${JSON.stringify(analysis.opportunities, null, 2)}`;
    }
    if (analysis.positioning_gaps) {
      competitiveContext += `\nPositioning Gaps (areas competitors are NOT covering): ${JSON.stringify(
        analysis.positioning_gaps,
        null,
        2
      )}`;
    }
    if (analysis.anti_patterns) {
      competitiveContext += `\nAnti-Patterns (what competitors do that we should NOT do): ${JSON.stringify(
        analysis.anti_patterns,
        null,
        2
      )}`;
    }
    if (analysis.winning_patterns) {
      competitiveContext += `\nWinning Patterns (proven approaches): ${JSON.stringify(
        analysis.winning_patterns,
        null,
        2
      )}`;
    }
    if (analysis.competitor_gap_analysis) {
      competitiveContext += `\nCompetitor Gap Analysis: ${JSON.stringify(
        analysis.competitor_gap_analysis,
        null,
        2
      )}`;
    }
    if (analysis.market_sophistication) {
      competitiveContext += `\nMarket Sophistication Assessment: ${JSON.stringify(
        analysis.market_sophistication,
        null,
        2
      )}`;
    }
  }

  const userPrompt = `Generate 8 direct-response ad concepts for "${brand.name}".

BRAND DETAILS:
- Name: ${brand.name}
- Industry: ${brand.audience ?? "N/A"}
- Description: ${brand.description ?? "N/A"}
- Target audience: ${brand.audience ?? "N/A"}
- Brand colors: Primary ${brand.primary_color ?? "N/A"}, Accent ${brand.accent_color ?? "N/A"}
- Market sophistication level: ${marketSophLevel}
${voiceInstructions}
${positioningContext}
${antiContext}
${competitiveContext}

${
  likedCreatives?.length
    ? `PREVIOUSLY LIKED AD STYLES (the user prefers ads like these — learn from the patterns):\n${JSON.stringify(
        likedCreatives,
        null,
        2
      )}`
    : "No previous creative preferences available."
}

IMPORTANT: Generate 8 ads with the exact distribution specified (3 Meta, 3 Google, 2 LinkedIn). Each ad must use a different positioning angle type and copywriting framework. Ensure Google headlines are max 30 chars and descriptions are max 90 chars. Return ONLY a valid JSON array.`;

  const creativesResponse = await askClaude(systemPrompt, userPrompt, 8192);

  // Parse the creatives
  let creatives: any[] = [];
  try {
    const jsonMatch = creativesResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      creatives = JSON.parse(jsonMatch[0]);
    }
  } catch (parseErr) {
    console.error("[Generate] Failed to parse creatives response:", parseErr);
    throw new Error("Failed to parse generated creatives from Claude response");
  }

  if (!Array.isArray(creatives) || creatives.length === 0) {
    throw new Error("No creatives generated");
  }

  console.log(`[Generate] Generated ${creatives.length} ad creatives`);

  // Insert all creatives
  const records = creatives.map((creative: Record<string, unknown>) => ({
    brand_id: brandId,
    user_id: userId,
    analysis_id: analysisId,
    platform: (creative.platform as string) ?? "meta",
    format: (creative.format as string) ?? "single_image",
    headline: (creative.headline as string) ?? null,
    headline_variants: (creative.headline_variants as string[]) ?? null,
    primary_text: (creative.primary_text as string) ?? null,
    primary_text_variants: (creative.primary_text_variants as string[]) ?? null,
    description: (creative.description as string) ?? null,
    cta: (creative.cta as string) ?? null,
    image_prompt: (creative.image_prompt as string) ?? null,
    image_concept_description: (creative.image_concept_description as string) ?? null,
    image_concepts: (creative.image_concepts ?? null) as unknown as Json,
    video_script_concept: (creative.video_script_concept as string) ?? null,
    target_audience: (creative.target_audience as string) ?? null,
    competitive_angle: (creative.competitive_angle as string) ?? null,
    confidence_score: (creative.confidence_score as number) ?? 0.5,
    positioning_angle_type: (creative.positioning_angle_type as string) ?? null,
    positioning_framework: (creative.positioning_framework as string) ?? null,
    copywriting_framework: (creative.copywriting_framework as string) ?? null,
    schwartz_sophistication_level: (creative.schwartz_sophistication_level as number) ?? null,
    psychological_trigger: (creative.psychological_trigger as string) ?? null,
    google_headlines: (creative.google_headlines as string[]) ?? null,
    google_descriptions: (creative.google_descriptions as string[]) ?? null,
    linkedin_intro_text: (creative.linkedin_intro_text as string) ?? null,
    linkedin_headline: (creative.linkedin_headline as string) ?? null,
  }));

  const { data: insertedCreatives, error: insertError } = await supabase
    .from("generated_creatives")
    .insert(records)
    .select();

  if (insertError) throw insertError;

  console.log(`[Generate] Inserted ${insertedCreatives?.length ?? 0} creatives into database`);
  return { creatives_generated: insertedCreatives?.length ?? 0 };
}

// ── Main route handler ─────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Authenticate the user via cookie-based session
    const authSupabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    let brandId = body.brand_id;

    // If no brand_id provided, get the user's first brand
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
        { error: "No brand found. Please create a brand in Settings first." },
        { status: 400 }
      );
    }

    // Use service role client for all pipeline writes (bypasses RLS)
    const supabase = createServiceRoleClient();

    // Clean up stale "running" pipeline runs (older than 10 minutes = timed out)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase
      .from("pipeline_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_log: "Timed out - serverless function was killed before completion",
      })
      .eq("status", "running")
      .lt("started_at", tenMinutesAgo);

    // Get brand with voice/positioning data
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select(
        "id, name, voice_profile, positioning_angles, vocabulary_guide, anti_positioning, market_sophistication_level"
      )
      .eq("id", brandId)
      .single();

    if (brandError || !brand) {
      return NextResponse.json(
        { error: "Brand not found" },
        { status: 404 }
      );
    }

    // Get competitors
    const { data: competitors } = await supabase
      .from("competitors")
      .select("id, name")
      .eq("brand_id", brandId)
      .eq("is_active", true);

    console.log(
      `[Pipeline] Starting for brand "${brand.name}" (${brandId}) with ${competitors?.length ?? 0} competitors`
    );

    // Create pipeline_runs record
    const startTime = Date.now();
    const { data: pipelineRun, error: runError } = await supabase
      .from("pipeline_runs")
      .insert({
        brand_id: brandId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runError) {
      console.error("[Pipeline] Failed to create pipeline run:", runError);
      return NextResponse.json(
        { error: "Failed to create pipeline run" },
        { status: 500 }
      );
    }

    const pipelineRunId = pipelineRun.id;
    const stepResults: Record<string, any> = {};

    try {
      // ── Step 1: Research Meta Ads ──────────────────────────────────
      console.log(`[Pipeline] Step 1/5: Research Meta Ads`);
      try {
        const metaResult = await stepResearchMetaAds(supabase, brandId);
        stepResults.meta_ads = metaResult;
        await supabase
          .from("pipeline_runs")
          .update({ meta_ads_found: metaResult.ads_found ?? 0 })
          .eq("id", pipelineRunId);
      } catch (err: any) {
        console.error("[Pipeline] Meta ads research failed:", err);
        stepResults.meta_ads = { error: err.message };
      }

      // ── Step 2: Research Social ────────────────────────────────────
      console.log(`[Pipeline] Step 2/5: Research Social`);
      try {
        const socialResult = await stepResearchSocial(supabase, brandId);
        stepResults.social = socialResult;
        await supabase
          .from("pipeline_runs")
          .update({ social_posts_found: socialResult.total ?? 0 })
          .eq("id", pipelineRunId);
      } catch (err: any) {
        console.error("[Pipeline] Social research failed:", err);
        stepResults.social = { error: err.message };
      }

      // ── Step 3: Research Landing Pages ─────────────────────────────
      console.log(`[Pipeline] Step 3/5: Research Landing Pages`);
      try {
        const landingResult = await stepResearchLandingPages(supabase, brandId);
        stepResults.landing_pages = landingResult;
        await supabase
          .from("pipeline_runs")
          .update({ pages_analyzed: landingResult.pages_scraped ?? 0 })
          .eq("id", pipelineRunId);
      } catch (err: any) {
        console.error("[Pipeline] Landing page research failed:", err);
        stepResults.landing_pages = { error: err.message };
      }

      // ── Step 4: Analyze Competitors ────────────────────────────────
      console.log(`[Pipeline] Step 4/5: Analyze Competitors`);
      let analysisId: string | null = null;
      try {
        const analysisResult = await stepAnalyzeCompetitors(supabase, brandId);
        stepResults.analysis = analysisResult;
        analysisId = analysisResult.analysis_id;
      } catch (err: any) {
        console.error("[Pipeline] Analysis failed:", err);
        stepResults.analysis = { error: err.message };
      }

      // ── Step 5: Generate Ads ───────────────────────────────────────
      console.log(`[Pipeline] Step 5/5: Generate Ads`);
      if (analysisId) {
        try {
          const generateResult = await stepGenerateAds(
            supabase,
            brandId,
            analysisId,
            user.id
          );
          stepResults.generate = generateResult;
          await supabase
            .from("pipeline_runs")
            .update({
              creatives_generated: generateResult.creatives_generated ?? 0,
            })
            .eq("id", pipelineRunId);
        } catch (err: any) {
          console.error("[Pipeline] Ad generation failed:", err);
          stepResults.generate = { error: err.message };
        }
      } else {
        console.log("[Pipeline] Skipping ad generation - no analysis available");
        stepResults.generate = {
          skipped: true,
          reason: "No analysis_id available",
        };
      }

      // ── Step 6: Mark pipeline as completed ─────────────────────────
      const durationMs = Date.now() - startTime;
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq("id", pipelineRunId);

      console.log(`[Pipeline] Completed in ${durationMs}ms`);

      return NextResponse.json({
        success: true,
        run_id: pipelineRunId,
        message: "Pipeline completed",
        duration_ms: durationMs,
        steps: stepResults,
      });
    } catch (err: any) {
      // Unexpected top-level error
      const durationMs = Date.now() - startTime;
      await supabase
        .from("pipeline_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          error_log: err.message,
        })
        .eq("id", pipelineRunId);

      console.error("[Pipeline] Failed:", err);
      return NextResponse.json(
        {
          error: err.message,
          run_id: pipelineRunId,
          steps: stepResults,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("[Pipeline] Route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
