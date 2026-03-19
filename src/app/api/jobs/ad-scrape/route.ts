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

// ── Meta Ad Library ────────────────────────────────────────────────────

async function scrapeMetaAds(
  competitor: any,
  metaAccessToken: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string
): Promise<number> {
  if (!competitor.meta_page_id) return 0;

  console.log(
    `[Ad Scrape] Fetching Meta ads for ${competitor.name} (page: ${competitor.meta_page_id})`
  );

  let totalAds = 0;
  let nextCursor: string | null = null;

  do {
    const params = new URLSearchParams({
      search_page_ids: competitor.meta_page_id,
      ad_reached_countries: '["US"]',
      fields:
        "ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,page_name",
      access_token: metaAccessToken,
      limit: "25",
    });

    if (nextCursor) {
      params.set("after", nextCursor);
    }

    const url = `https://graph.facebook.com/v21.0/ads_archive?${params.toString()}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Ad Scrape] Meta API error for ${competitor.name}: ${response.status} ${errorBody}`
      );
      break;
    }

    const data = await response.json();
    const ads = data.data ?? [];

    for (const ad of ads) {
      const isActive = !ad.ad_delivery_stop_time;
      const externalId =
        ad.ad_snapshot_url ?? `meta_${competitor.meta_page_id}_${totalAds}`;

      const adRecord = {
        competitor_id: competitor.id,
        source: "meta_ad_library" as const,
        external_id: externalId,
        ad_type: "image" as const,
        headline: ad.ad_creative_link_titles?.[0] ?? null,
        body_text: ad.ad_creative_bodies?.[0] ?? null,
        cta_text: ad.ad_creative_link_captions?.[0] ?? null,
        landing_page_url: null as string | null,
        is_active: isActive,
        first_seen_at: ad.ad_delivery_start_time ?? new Date().toISOString(),
        last_seen_at: isActive
          ? new Date().toISOString()
          : (ad.ad_delivery_stop_time ?? new Date().toISOString()),
        raw_data: ad,
      };

      const { error: upsertError } = await supabase
        .from("competitor_ads")
        .upsert(adRecord, { onConflict: "external_id" });

      if (upsertError) {
        console.error(`[Ad Scrape] Upsert error: ${upsertError.message}`);
      } else {
        totalAds++;
      }
    }

    nextCursor = data.paging?.cursors?.after ?? null;
    const hasNextPage = data.paging?.next != null;
    if (!hasNextPage) nextCursor = null;
  } while (nextCursor);

  console.log(
    `[Ad Scrape] Found ${totalAds} Meta ads for ${competitor.name}`
  );
  return totalAds;
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

    const metaAccessToken = process.env.META_ACCESS_TOKEN;
    const apifyToken = process.env.APIFY_API_TOKEN;

    if (!metaAccessToken && !apifyToken) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "failed",
          error_log: {
            message:
              "Neither META_ACCESS_TOKEN nor APIFY_API_TOKEN is configured",
          },
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json(
        {
          error:
            "Neither META_ACCESS_TOKEN nor APIFY_API_TOKEN is configured",
        },
        { status: 500 }
      );
    }

    // 5. Fetch all active competitors
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .limit(20);

    if (compError) {
      throw compError;
    }

    if (!competitors || competitors.length === 0) {
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

    // 5b. Auto-discover missing Meta Page IDs before scraping
    const missingMetaPageIds = competitors.filter(
      (c: any) => !c.meta_page_id
    );
    if (missingMetaPageIds.length > 0 && (metaAccessToken || process.env.APIFY_API_TOKEN)) {
      console.log(
        `[Ad Scrape] ${missingMetaPageIds.length} competitors missing Meta Page IDs — auto-discovering...`
      );

      try {
        const enrichRes = await fetch(
          new URL("/api/competitors/enrich", request.url).toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: request.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              brand_id: brandId,
              mode: "meta_page_id_only",
            }),
            signal: AbortSignal.timeout(90000),
          }
        );

        if (enrichRes.ok) {
          const enrichData = await enrichRes.json();
          const discovered = (enrichData.results || []).filter(
            (r: any) => r.found?.meta_page_id
          );
          console.log(
            `[Ad Scrape] Auto-discovered ${discovered.length}/${missingMetaPageIds.length} Meta Page IDs`
          );

          // Refresh competitor data after enrichment
          if (discovered.length > 0) {
            const { data: refreshed } = await supabase
              .from("competitors")
              .select("*")
              .eq("brand_id", brandId)
              .eq("is_active", true)
              .limit(20);
            if (refreshed) {
              competitors.length = 0;
              competitors.push(...refreshed);
            }
          }
        }
      } catch (enrichErr) {
        console.error(
          "[Ad Scrape] Auto-discovery failed (non-blocking):",
          enrichErr
        );
      }
    }

    let totalMetaAds = 0;
    let totalGoogleAds = 0;
    const errors: string[] = [];

    // 6. Scrape ads from each source
    const scrapePromises = competitors.map(async (comp: any) => {
      try {
        // Meta Ad Library
        if (metaAccessToken && comp.meta_page_id) {
          const metaCount = await scrapeMetaAds(
            comp,
            metaAccessToken,
            supabase,
            brandId
          );
          totalMetaAds += metaCount;
        }

        // Google Ads Transparency (via Apify)
        if (apifyToken) {
          const googleCount = await scrapeGoogleAds(
            comp,
            apifyToken,
            supabase,
            brandId
          );
          totalGoogleAds += googleCount;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Ad Scrape] Error for ${comp.name}:`, msg);
        errors.push(`${comp.name}: ${msg.slice(0, 150)}`);
      }
    });

    await Promise.allSettled(scrapePromises);

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
      competitors_processed: competitors.length,
      competitors_with_meta_page_id: competitors.filter((c: any) => c.meta_page_id).length,
      meta_page_ids_auto_discovered: missingMetaPageIds.length > 0
        ? competitors.filter((c: any) => c.meta_page_id).length - (competitors.length - missingMetaPageIds.length)
        : 0,
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
