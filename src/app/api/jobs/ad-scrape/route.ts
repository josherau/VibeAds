import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

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

/**
 * Run an Apify actor synchronously and return dataset items.
 */
async function runApifyActorSync(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  timeoutSecs = 90
): Promise<any[]> {
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}`;
  console.log(
    `[Ad Scrape] Starting Apify actor ${actorId} (timeout: ${timeoutSecs}s)`
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSecs + 15) * 1000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Apify actor ${actorId} failed: HTTP ${res.status} - ${body.slice(0, 200)}`
    );
  }

  const items = await res.json();
  console.log(
    `[Ad Scrape] Actor ${actorId} returned ${Array.isArray(items) ? items.length : 0} items`
  );
  return Array.isArray(items) ? items : [];
}

// ── Meta Ad Library (via Apify) ────────────────────────────────────────

/**
 * Scrape Meta ads for a competitor using Apify's Meta Ad Library scraper.
 * This bypasses the Meta Graph API (which requires special app permissions)
 * and scrapes the public Ad Library website directly.
 *
 * Uses the `whoareyouanas/meta-ad-scraper` Apify actor (128K+ runs, well-maintained).
 */
async function scrapeMetaAds(
  competitor: any,
  apifyToken: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
): Promise<number> {
  // Build search query — use company name (keyword search on Ad Library)
  const searchQuery = competitor.name;

  console.log(
    `[Ad Scrape] Fetching Meta ads for ${competitor.name} via Apify (query: "${searchQuery}")`
  );

  try {
    const results = await runApifyActorSync(
      "whoareyouanas~meta-ad-scraper",
      {
        searchQuery: searchQuery,
        country: "US",
        activeStatus: "active",
        adType: "all",
        maxAds: 25,
      },
      apifyToken,
      120
    );

    let adsFound = 0;

    for (const item of results) {
      // Use libraryID as unique identifier
      const externalId = item.libraryID
        ? `meta_${item.libraryID}`
        : `meta_${competitor.id}_${adsFound}`;

      // Determine if ad is from the competitor (keyword search can return tangential results)
      // We'll store all results but tag them properly
      const adFormat = item.format ?? (item.videos?.length > 0 ? "video" : "image");
      const isActive = item.active !== false;

      // Parse dates
      let firstSeen = new Date().toISOString();
      let lastSeen = new Date().toISOString();
      try {
        if (item.startDate) {
          const parsed = new Date(item.startDate);
          if (!isNaN(parsed.getTime())) firstSeen = parsed.toISOString();
        }
        if (item.endDate) {
          const parsed = new Date(item.endDate);
          if (!isNaN(parsed.getTime())) lastSeen = parsed.toISOString();
        }
      } catch { /* use defaults */ }

      // Extract media URLs
      const mediaUrls: string[] = [];
      if (item.images?.length > 0) {
        for (const img of item.images) {
          if (img.url) mediaUrls.push(img.url);
        }
      }
      if (item.videos?.length > 0) {
        for (const vid of item.videos) {
          if (vid.url) mediaUrls.push(vid.url);
        }
      }

      const adRecord = {
        competitor_id: competitor.id,
        source: "meta_ad_library" as const,
        external_id: externalId,
        ad_type: adFormat as string,
        headline: item.linkTitle || null,
        body_text: item.body || null,
        cta_text: item.ctaText || null,
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        landing_page_url: item.linkUrl || item.ctaUrl || null,
        is_active: isActive,
        first_seen_at: firstSeen,
        last_seen_at: lastSeen,
        raw_data: {
          ...item,
          advertiser_name: item.brand,
          platforms: item.platforms,
          similar_ad_count: item.similarAdCount,
        },
      };

      const { error: upsertError } = await supabase
        .from("competitor_ads")
        .upsert(adRecord, { onConflict: "external_id" });

      if (upsertError) {
        console.error(`[Ad Scrape] Meta upsert error: ${upsertError.message}`);
      } else {
        adsFound++;
      }
    }

    console.log(
      `[Ad Scrape] Found ${adsFound} Meta ads for ${competitor.name}`
    );
    return adsFound;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Ad Scrape] Meta Apify error for ${competitor.name}: ${msg}`);
    return 0;
  }
}

// ── Google Ads Transparency (via Apify) ────────────────────────────────

async function scrapeGoogleAds(
  competitor: any,
  apifyToken: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
): Promise<number> {
  if (!competitor.website_url && !competitor.name) return 0;

  const searchQuery = competitor.website_url
    ? new URL(
        competitor.website_url.startsWith("http")
          ? competitor.website_url
          : `https://${competitor.website_url}`
      ).hostname.replace("www.", "")
    : competitor.name;

  console.log(
    `[Ad Scrape] Fetching Google ads for ${competitor.name} (query: ${searchQuery})`
  );

  try {
    const results = await runApifyActorSync(
      "apify~google-ads-transparency-scraper",
      {
        queries: [searchQuery],
        maxResults: 25,
        countryCode: "US",
      },
      apifyToken,
      120
    );

    let adsFound = 0;

    for (const item of results) {
      const externalId =
        item.adId ??
        item.id ??
        `google_${searchQuery}_${adsFound}`;

      const adRecord = {
        competitor_id: competitor.id,
        source: "google_ads" as const,
        external_id: String(externalId),
        ad_type: (item.format ?? "text") as string,
        headline:
          item.title ?? item.headline ?? item.advertiserName ?? null,
        body_text:
          item.text ?? item.description ?? item.bodyText ?? null,
        cta_text: item.ctaText ?? null,
        media_urls: item.imageUrl
          ? [item.imageUrl]
          : item.mediaUrls ?? null,
        landing_page_url: item.destinationUrl ?? item.url ?? null,
        is_active: true,
        first_seen_at:
          item.firstShown ?? item.startDate ?? new Date().toISOString(),
        last_seen_at:
          item.lastShown ?? item.endDate ?? new Date().toISOString(),
        raw_data: item,
      };

      const { error: upsertError } = await supabase
        .from("competitor_ads")
        .upsert(adRecord, { onConflict: "external_id" });

      if (upsertError) {
        console.error(`[Ad Scrape] Google upsert error: ${upsertError.message}`);
      } else {
        adsFound++;
      }
    }

    console.log(
      `[Ad Scrape] Found ${adsFound} Google ads for ${competitor.name}`
    );
    return adsFound;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Ad Scrape] Google Ads Apify error for ${competitor.name}: ${msg}`);
    return 0;
  }
}

// ── POST handler ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // 1. Authenticate
    const authSupabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get brand_id
    const body = await request.json();
    const brandId = body.brand_id;
    if (!brandId) {
      return NextResponse.json(
        { error: "brand_id is required" },
        { status: 400 }
      );
    }

    // 3. Service role client for writes
    const supabase = createServiceRoleClient();

    // 4. Create pipeline run record
    const { data: run, error: runError } = await supabase
      .from("pipeline_runs")
      .insert({
        brand_id: brandId,
        status: "running",
        steps_completed: [],
      })
      .select()
      .single();

    if (runError) {
      console.error("[Ad Scrape] Failed to create pipeline run:", runError);
      return NextResponse.json(
        { error: "Failed to create job record" },
        { status: 500 }
      );
    }

    const runId = run.id;
    const startTime = Date.now();

    const apifyToken = process.env.APIFY_API_TOKEN;

    if (!apifyToken) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "failed",
          error_log: {
            message:
              "APIFY_API_TOKEN is not configured — required for Meta & Google ad scraping",
          },
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json(
        {
          error:
            "APIFY_API_TOKEN is not configured — required for Meta & Google ad scraping",
        },
        { status: 500 }
      );
    }

    const force = body.force === true;
    const AD_COOLDOWN_HOURS = 24;

    // 5. Fetch all active competitors
    const { data: allCompetitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .limit(20);

    if (compError) {
      throw compError;
    }

    // Mutable array we'll filter for freshness
    const competitors: any[] = allCompetitors ? [...allCompetitors] : [];

    if (competitors.length === 0) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          steps_completed: ["ad_scrape"],
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        run_id: runId,
        message: "No active competitors found. Add competitors first.",
        meta_ads_found: 0,
        google_ads_found: 0,
        competitors_processed: 0,
      });
    }

    console.log(
      `[Ad Scrape] Found ${competitors.length} active competitors`
    );

    // 5a. Skip recently scraped competitors (unless force=true)
    let skippedCount = 0;
    if (!force && competitors.length > 0) {
      const cooldownCutoff = new Date(Date.now() - AD_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const compIds = competitors.map((c: any) => c.id);

      // Check most recent ad scrape per competitor
      const { data: recentAds } = await supabase
        .from("competitor_ads")
        .select("competitor_id, created_at")
        .in("competitor_id", compIds)
        .gte("created_at", cooldownCutoff)
        .order("created_at", { ascending: false });

      if (recentAds && recentAds.length > 0) {
        const recentlyScrapedIds = new Set(recentAds.map((a: any) => a.competitor_id));
        const before = competitors.length;
        const filtered = competitors.filter((c: any) => !recentlyScrapedIds.has(c.id));
        skippedCount = before - filtered.length;
        competitors.length = 0;
        competitors.push(...filtered);
        if (skippedCount > 0) {
          console.log(`[Ad Scrape] Skipped ${skippedCount} competitors scraped within last ${AD_COOLDOWN_HOURS}h (use force=true to override)`);
        }
      }
    }

    let totalMetaAds = 0;
    let totalGoogleAds = 0;
    const errors: string[] = [];

    // 6. Scrape ads — process sequentially with time guard (max 240s to leave room for analysis)
    const MAX_SCRAPE_TIME_MS = 240_000;
    const MAX_COMPETITORS_PER_RUN = 5; // Each competitor takes ~30-60s for Meta + Google
    const compsToProcess = competitors.slice(0, MAX_COMPETITORS_PER_RUN);
    const compsDeferred = competitors.length - compsToProcess.length;

    if (compsDeferred > 0) {
      console.log(
        `[Ad Scrape] Processing ${compsToProcess.length} of ${competitors.length} competitors (${compsDeferred} deferred to next run)`
      );
    }

    for (const comp of compsToProcess) {
      // Time guard — stop if we're running low on time
      if (Date.now() - startTime > MAX_SCRAPE_TIME_MS) {
        console.log(`[Ad Scrape] Time limit reached, stopping scrape loop`);
        errors.push("Time limit reached — some competitors deferred to next run");
        break;
      }

      try {
        // Meta Ad Library (via Apify scraper — no Meta API token needed)
        const metaCount = await scrapeMetaAds(
          comp,
          apifyToken,
          supabase,
          brandId
        );
        totalMetaAds += metaCount;

        // Google Ads Transparency (via Apify)
        const googleCount = await scrapeGoogleAds(
          comp,
          apifyToken,
          supabase,
          brandId
        );
        totalGoogleAds += googleCount;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Ad Scrape] Error for ${comp.name}:`, msg);
        errors.push(`${comp.name}: ${msg.slice(0, 150)}`);
      }
    }

    const totalAds = totalMetaAds + totalGoogleAds;
    console.log(
      `[Ad Scrape] Total: ${totalMetaAds} Meta ads, ${totalGoogleAds} Google ads, ${errors.length} errors`
    );

    // 7. Run Claude analysis on collected ads
    let analysisResult: Record<string, any> | null = null;
    if (totalAds > 0 || true) {
      try {
        // Fetch all competitor_ids for this brand
        const compIds = competitors.map((c: any) => c.id);

        const { data: allAds } = await supabase
          .from("competitor_ads")
          .select("*")
          .in("competitor_id", compIds)
          .order("first_seen_at", { ascending: false })
          .limit(150);

        if (allAds && allAds.length > 0) {
          // Build competitor name lookup
          const compLookup: Record<string, string> = {};
          for (const c of competitors) {
            compLookup[c.id] = c.name;
          }

          const adSummaries = allAds.map((ad: any) => ({
            competitor: compLookup[ad.competitor_id] ?? "Unknown",
            source: ad.source,
            headline: ad.headline,
            body: (ad.body_text ?? "").slice(0, 300),
            cta: ad.cta_text,
            ad_type: ad.ad_type,
            is_active: ad.is_active,
            first_seen: ad.first_seen_at,
            last_seen: ad.last_seen_at,
            landing_page: ad.landing_page_url,
          }));

          const analysisResponse = await askClaude(
            `You are a CMO-grade ad intelligence analyst. Analyze competitor ad campaigns to identify what's working, uncover patterns, and provide specific actionable recommendations. Be data-driven and specific. Return ONLY valid JSON.`,
            `Analyze these competitor ads and return a JSON object with this structure:
{
  "top_performing_ads": [
    {
      "competitor": "string",
      "headline": "string",
      "body_preview": "string",
      "source": "string",
      "why_it_works": "string (2-3 sentences explaining the psychological triggers, positioning, and appeal)",
      "replication_blueprint": "string (specific step-by-step instructions to create a similar ad — headline formula, body structure, CTA approach, positioning angle)"
    }
  ],
  "ad_copy_patterns": {
    "hooks": ["string (common opening hooks used across ads)"],
    "ctas": ["string (call-to-action patterns)"],
    "emotional_triggers": ["string (emotional triggers being leveraged)"],
    "headline_formulas": ["string (headline structures/formulas used)"]
  },
  "creative_analysis": {
    "ad_types_breakdown": [{ "type": "string", "count": number, "percentage": number }],
    "visual_patterns": ["string (common visual elements and styles)"],
    "media_usage_trends": ["string (how media is being used)"]
  },
  "competitive_positioning": [
    {
      "competitor": "string",
      "positioning_summary": "string (how they position themselves in ads)",
      "key_claims": ["string"],
      "tone": "string",
      "target_audience_signals": "string"
    }
  ],
  "content_opportunities": [
    {
      "concept": "string (specific ad concept to create)",
      "rationale": "string (why this will work based on competitor gaps)",
      "headline_draft": "string",
      "body_draft": "string (draft ad copy)",
      "cta_draft": "string",
      "platform": "string (meta, google, both)",
      "priority": "high | medium | low"
    }
  ],
  "spend_indicators": {
    "active_vs_inactive_ratio": "string",
    "avg_ad_lifespan_days": number,
    "high_frequency_advertisers": ["string (competitors running the most ads)"],
    "signals": ["string (what the activity patterns suggest about spend)"]
  },
  "recommendations": [
    "string (specific actionable recommendation)"
  ]
}

IMPORTANT for top_performing_ads: Pick the 5-8 most interesting/effective ads based on copy quality, positioning clarity, and longevity (active ads that have been running longer are likely performing well). Write detailed why_it_works and replication_blueprint for each.

IMPORTANT for content_opportunities: Suggest 5-8 specific ad concepts with full draft copy. Be very specific — include actual headline and body copy drafts, not generic ideas.

Competitor ads data:
${JSON.stringify(adSummaries, null, 2).slice(0, 14000)}`,
            6000
          );

          try {
            const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
            }
          } catch {
            console.error("[Ad Scrape] Failed to parse analysis JSON");
            analysisResult = { raw_analysis: analysisResponse };
          }

          // Store analysis
          await supabase.from("competitor_analyses").insert({
            brand_id: brandId,
            analysis_type: "ad_intelligence",
            title: "Ad Intelligence Report",
            summary: analysisResult?.recommendations
              ? `Key findings: ${(analysisResult.recommendations as string[]).slice(0, 3).join(". ")}`
              : "Ad intelligence analysis completed",
            patterns: analysisResult?.ad_copy_patterns ?? null,
            recommendations: analysisResult ?? null,
            ads_analyzed: allAds.length,
            content_analyzed: 0,
            pipeline_run_id: runId,
          });
        }
      } catch (err) {
        console.error("[Ad Scrape] Analysis error:", err);
      }
    }

    // 8. Update pipeline run record
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        steps_completed: ["ad_scrape", "ad_analysis"],
        meta_ads_found: totalMetaAds + totalGoogleAds,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq("id", runId);

    return NextResponse.json({
      success: true,
      run_id: runId,
      meta_ads_found: totalMetaAds,
      google_ads_found: totalGoogleAds,
      total_ads: totalAds,
      competitors_processed: compsToProcess.length,
      competitors_skipped_cooldown: skippedCount,
      competitors_deferred: compsDeferred,
      errors: errors.length > 0 ? errors : undefined,
      analysis: analysisResult ? "completed" : "skipped",
    });
  } catch (err) {
    console.error("[Ad Scrape] Unhandled error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Ad scrape failed",
      },
      { status: 500 }
    );
  }
}
