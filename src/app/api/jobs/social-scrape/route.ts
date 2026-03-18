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
 * Uses run-sync-get-dataset-items which waits server-side (up to timeoutSecs).
 */
async function runApifyActorSync(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  timeoutSecs = 90
): Promise<any[]> {
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}`;
  console.log(`[Social Scrape] Starting Apify actor ${actorId} (timeout: ${timeoutSecs}s)`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSecs + 15) * 1000), // client timeout slightly longer
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify actor ${actorId} failed: HTTP ${res.status} - ${body.slice(0, 200)}`);
  }

  const items = await res.json();
  console.log(`[Social Scrape] Actor ${actorId} returned ${Array.isArray(items) ? items.length : 0} items`);
  return Array.isArray(items) ? items : [];
}

// ── Social discovery ──────────────────────────────────────────────────

async function discoverSocialLinks(
  websiteUrl: string
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {
    instagram: null,
    twitter: null,
    linkedin: null,
    facebook: null,
    youtube: null,
    tiktok: null,
  };

  let html = "";

  // Try Firecrawl first
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({
          url: websiteUrl,
          formats: ["html"],
          onlyMainContent: false,
          timeout: 20000,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        html = data.data?.html || "";
      }
    } catch {
      // fall through
    }
  }

  // Fallback: direct fetch
  if (!html) {
    try {
      const res = await fetch(websiteUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });
      html = await res.text();
    } catch {
      return result;
    }
  }

  // Regex patterns
  const patterns: Record<string, RegExp> = {
    instagram:
      /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})\/?/gi,
    twitter:
      /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})\/?/gi,
    linkedin:
      /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)\/?/gi,
    facebook:
      /https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/gi,
    youtube:
      /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)([a-zA-Z0-9_-]+)\/?/gi,
    tiktok:
      /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._-]+)\/?/gi,
  };

  const excluded = new Set([
    "share", "sharer", "intent", "hashtag", "home", "login", "signup",
    "search", "explore", "settings", "help", "about", "privacy", "terms",
    "policies", "ads", "business", "developers", "p", "watch", "embed",
    "channel", "playlist", "feed", "stories", "reels", "direct",
    "accounts", "oauth", "dialog", "plugins", "tr", "flx",
  ]);

  for (const [platform, regex] of Object.entries(patterns)) {
    const matches = [...html.matchAll(regex)];
    for (const match of matches) {
      const handle = match[1];
      if (handle && !excluded.has(handle.toLowerCase())) {
        if (platform === "instagram" || platform === "twitter" || platform === "tiktok") {
          result[platform] = handle.startsWith("@") ? handle : `@${handle}`;
        } else {
          result[platform] = match[0];
        }
        break;
      }
    }
  }

  // If regex didn't find enough, try Claude
  const foundCount = Object.values(result).filter(Boolean).length;
  if (foundCount < 2 && html.length > 500) {
    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        const truncated = html.slice(0, 15000);
        const claudeRes = await askClaude(
          `Extract social media profile URLs/handles from website HTML. Look everywhere: href, data attributes, scripts, JSON-LD, meta tags, og:tags, etc. Return ONLY JSON: {"instagram":"@handle or null","twitter":"@handle or null","linkedin":"URL or null","facebook":"URL or null","youtube":"URL or null","tiktok":"@handle or null"}`,
          `Extract social profiles from ${websiteUrl}:\n\n${truncated}`,
          500
        );
        const jsonMatch = claudeRes.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const [p, v] of Object.entries(parsed)) {
            if (v && !result[p]) result[p] = v as string;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return result;
}

/**
 * Searches Google for a company's social media accounts using Apify.
 */
async function probeForSocials(
  companyName: string,
  _websiteUrl: string
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return result;

  try {
    const query = `"${companyName}" site:instagram.com OR site:twitter.com OR site:x.com OR site:linkedin.com`;
    console.log(`[Social Scrape] Google search query: ${query}`);

    const items = await runApifyActorSync(
      "apify~google-search-scraper",
      {
        queries: [query],
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
      },
      apifyToken,
      30
    );

    // Apify returns array of search result pages; each has organicResults
    const organicResults = items.flatMap((i: any) => i.organicResults || []);
    console.log(`[Social Scrape] Google search found ${organicResults.length} organic results for ${companyName}`);

    const excluded = new Set(["share", "sharer", "intent", "hashtag", "explore", "p", "watch", "search", "login"]);

    for (const item of organicResults) {
      const url = item.url || item.link || "";

      if (!result.instagram) {
        const m = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
        if (m && m[1] && !excluded.has(m[1].toLowerCase())) result.instagram = `@${m[1]}`;
      }
      if (!result.twitter) {
        const m = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
        if (m && m[1] && !excluded.has(m[1].toLowerCase())) result.twitter = `@${m[1]}`;
      }
      if (!result.linkedin) {
        const m = url.match(/linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)/i);
        if (m && m[1] && !excluded.has(m[1].toLowerCase())) result.linkedin = url;
      }
    }

    console.log(`[Social Scrape] Google search found for ${companyName}: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[Social Scrape] Google search failed for ${companyName}:`, err);
  }
  return result;
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
      console.error("[Social Scrape] Failed to create pipeline run:", runError);
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
          error_log: { message: "APIFY_API_TOKEN not configured" },
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json(
        { error: "APIFY_API_TOKEN not configured" },
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
          steps_completed: ["social_scrape"],
          social_posts_found: 0,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        run_id: runId,
        message: "No competitors found for this brand",
        posts_found: 0,
      });
    }

    console.log(`[Social Scrape] Found ${competitors.length} competitors for brand ${brandId}`);

    // 5b. Auto-enrich competitors that are missing social handles
    const needsEnrichment = competitors.filter(
      (c: any) => c.website_url && !c.instagram_handle && !c.twitter_handle
    );

    console.log(`[Social Scrape] ${needsEnrichment.length} competitors need social handle enrichment`);

    if (needsEnrichment.length > 0) {
      for (const comp of needsEnrichment) {
        try {
          // First try website scraping
          console.log(`[Social Scrape] Discovering socials for ${comp.name} (${comp.website_url})`);
          const socials = await discoverSocialLinks(comp.website_url!);
          console.log(`[Social Scrape] Website scrape found for ${comp.name}: ${JSON.stringify(socials)}`);

          // If website didn't have links, probe social platforms directly
          if (!socials.instagram && !socials.twitter) {
            console.log(`[Social Scrape] Website had no social links for ${comp.name}, trying Google search`);
            const probed = await probeForSocials(comp.name, comp.website_url!);
            if (probed.instagram) socials.instagram = probed.instagram;
            if (probed.twitter) socials.twitter = probed.twitter;
            if (probed.linkedin) socials.linkedin = probed.linkedin;
          }

          const updates: Record<string, string | null> = {};
          if (socials.instagram) updates.instagram_handle = socials.instagram;
          if (socials.twitter) updates.twitter_handle = socials.twitter;
          if (socials.linkedin) updates.linkedin_url = socials.linkedin;

          if (Object.keys(updates).length > 0) {
            await supabase
              .from("competitors")
              .update(updates)
              .eq("id", comp.id);

            // Update our local copy too
            Object.assign(comp, updates);
            console.log(`[Social Scrape] Enriched ${comp.name}: ${JSON.stringify(updates)}`);
          } else {
            console.log(`[Social Scrape] Could not find social handles for ${comp.name}`);
          }
        } catch (err) {
          console.error(`[Social Scrape] Enrich failed for ${comp.name}:`, err);
        }
      }
    }

    // 5c. Filter to competitors that now have social handles
    const socialCompetitors = competitors
      .filter((c: any) => c.instagram_handle || c.twitter_handle);

    console.log(`[Social Scrape] ${socialCompetitors.length} competitors have social handles: ${socialCompetitors.map((c: any) => `${c.name} (IG:${c.instagram_handle || 'none'} TW:${c.twitter_handle || 'none'})`).join(', ')}`);

    if (socialCompetitors.length === 0) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          steps_completed: ["enrich", "social_scrape"],
          social_posts_found: 0,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        run_id: runId,
        message:
          "Could not find Instagram or Twitter handles for any competitors. Try adding them manually on the Competitors page.",
        posts_found: 0,
        enriched: needsEnrichment.length,
      });
    }

    let instagramCount = 0;
    let twitterCount = 0;
    const errors: string[] = [];

    // 6. Instagram scraping — use run-sync-get-dataset-items for reliable execution
    for (const competitor of socialCompetitors) {
      if (competitor.instagram_handle) {
        try {
          const igHandle = competitor.instagram_handle.replace(/^@/, "");
          console.log(`[Social Scrape] Scraping Instagram for ${competitor.name} (${igHandle})`);

          // Use the Instagram scraper with direct URLs for more reliable results
          const profileUrl = `https://www.instagram.com/${igHandle}/`;
          const results = await runApifyActorSync(
            "apify~instagram-scraper",
            {
              directUrls: [profileUrl],
              resultsType: "posts",
              resultsLimit: 12,
              searchType: "user",
            },
            apifyToken,
            90
          );

          console.log(`[Social Scrape] Instagram returned ${results.length} items for ${competitor.name}, first keys: ${JSON.stringify(Object.keys(results[0] || {})).slice(0, 300)}`);

          // The scraper may return posts directly or nested in profile objects
          const igPosts: any[] = [];
          for (const item of results) {
            if (item.latestPosts && Array.isArray(item.latestPosts)) {
              igPosts.push(...item.latestPosts);
            } else if (item.posts && Array.isArray(item.posts)) {
              igPosts.push(...item.posts);
            } else if (item.caption !== undefined || item.shortCode || item.type === "Image" || item.type === "Video" || item.type === "Sidecar") {
              // Item itself is a post
              igPosts.push(item);
            }
          }

          console.log(`[Social Scrape] Instagram extracted ${igPosts.length} posts for ${competitor.name}`);

          for (const post of igPosts) {
            const extId = post.id ?? post.shortCode ?? post.inputUrl ?? null;

            // Skip if we already have this post
            if (extId) {
              const { data: existing } = await supabase
                .from("competitor_content")
                .select("id")
                .eq("external_id", String(extId))
                .limit(1);
              if (existing && existing.length > 0) {
                instagramCount++;
                continue;
              }
            }

            const caption = post.caption ?? post.text ?? post.alt ?? "";
            const record = {
              competitor_id: competitor.id,
              source: "instagram",
              external_id: extId ? String(extId) : null,
              content_type: "social_post",
              title: caption.slice(0, 200) || null,
              body_text: caption || null,
              media_urls: post.displayUrl
                ? [post.displayUrl]
                : post.imageUrl
                  ? [post.imageUrl]
                  : post.url
                    ? [post.url]
                    : null,
              engagement_metrics: {
                likes: post.likesCount ?? post.likes ?? 0,
                comments: post.commentsCount ?? post.comments ?? 0,
                shares: post.sharesCount ?? 0,
                url:
                  post.url ??
                  (post.shortCode
                    ? `https://instagram.com/p/${post.shortCode}`
                    : null),
              },
              published_at: post.timestamp ?? post.takenAt ?? null,
              raw_data: post,
            };

            const { error } = await supabase
              .from("competitor_content")
              .insert(record);

            if (error) {
              console.error(`[Social Scrape] Instagram insert error: ${error.message}`);
            } else {
              instagramCount++;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Social Scrape] Instagram error for ${competitor.name}:`, msg);
          errors.push(`IG ${competitor.name}: ${msg.slice(0, 100)}`);
        }
      }

      // 7. Twitter/X scraping
      if (competitor.twitter_handle) {
        try {
          const twHandle = competitor.twitter_handle.replace(/^@/, "");
          console.log(`[Social Scrape] Scraping Twitter for ${competitor.name} (${twHandle})`);

          const results = await runApifyActorSync(
            "apify~tweet-scraper-v2",
            {
              handles: [twHandle],
              maxItems: 12,
              sort: "Latest",
            },
            apifyToken,
            90
          );

          console.log(`[Social Scrape] Twitter returned ${results.length} items for ${competitor.name}, first keys: ${JSON.stringify(Object.keys(results[0] || {})).slice(0, 300)}`);

          // Twitter scraper may return tweets directly or nested
          const tweets: any[] = [];
          for (const item of results) {
            if (item.tweets && Array.isArray(item.tweets)) {
              tweets.push(...item.tweets);
            } else if (item.text || item.full_text || item.tweet) {
              tweets.push(item);
            }
          }

          console.log(`[Social Scrape] Twitter extracted ${tweets.length} tweets for ${competitor.name}`);

          for (const tweet of tweets) {
            const extId = tweet.id ?? tweet.id_str ?? null;

            if (extId) {
              const { data: existing } = await supabase
                .from("competitor_content")
                .select("id")
                .eq("external_id", String(extId))
                .limit(1);
              if (existing && existing.length > 0) {
                twitterCount++;
                continue;
              }
            }

            const tweetText =
              tweet.text ?? tweet.full_text ?? tweet.tweet?.text ?? "";
            const record = {
              competitor_id: competitor.id,
              source: "twitter",
              external_id: extId ? String(extId) : null,
              content_type: "social_post",
              title: tweetText.slice(0, 200) || null,
              body_text: tweetText || null,
              engagement_metrics: {
                likes:
                  tweet.likeCount ??
                  tweet.favoriteCount ??
                  tweet.favorite_count ??
                  0,
                comments: tweet.replyCount ?? tweet.reply_count ?? 0,
                shares: tweet.retweetCount ?? tweet.retweet_count ?? 0,
                url:
                  tweet.url ??
                  (tweet.id_str
                    ? `https://x.com/i/status/${tweet.id_str}`
                    : null),
              },
              published_at: tweet.createdAt ?? tweet.created_at ?? null,
              raw_data: tweet,
            };

            const { error } = await supabase
              .from("competitor_content")
              .insert(record);

            if (error) {
              console.error(`[Social Scrape] Twitter insert error: ${error.message}`);
            } else {
              twitterCount++;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Social Scrape] Twitter error for ${competitor.name}:`, msg);
          errors.push(`TW ${competitor.name}: ${msg.slice(0, 100)}`);
        }
      }
    }

    const totalPosts = instagramCount + twitterCount;
    console.log(`[Social Scrape] Total posts scraped: ${totalPosts} (IG: ${instagramCount}, TW: ${twitterCount}), errors: ${errors.length}`);

    // 8. Analyze social content with Claude
    let analysisResult = null;
    if (totalPosts > 0) {
      try {
        const { data: allPosts } = await supabase
          .from("competitor_content")
          .select("*, competitors!inner(name)")
          .eq("competitors.brand_id", brandId)
          .eq("content_type", "social_post")
          .order("created_at", { ascending: false })
          .limit(100);

        if (allPosts && allPosts.length > 0) {
          const postSummaries = allPosts.map((p: any) => {
            const metrics = p.engagement_metrics ?? {};
            return {
              competitor: p.competitors?.name,
              platform: p.source,
              text: (p.body_text ?? "").slice(0, 300),
              likes: metrics.likes ?? 0,
              comments: metrics.comments ?? 0,
              shares: metrics.shares ?? 0,
              date: p.published_at,
            };
          });

          const analysisResponse = await askClaude(
            `You are a social media intelligence analyst. Analyze competitor social media posts and extract actionable insights. Return ONLY valid JSON.`,
            `Analyze these competitor social media posts and return a JSON object with this structure:
{
  "content_themes": [{ "theme": "string", "count": number, "description": "string", "example_posts": ["string"] }],
  "hashtag_trends": [{ "hashtag": "string", "count": number, "avg_engagement": number }],
  "posting_patterns": {
    "most_active_days": ["string"],
    "peak_hours": ["string"],
    "avg_posts_per_week": number
  },
  "engagement_insights": {
    "top_content_types": ["string"],
    "avg_engagement_rate": "string",
    "best_performing_topics": ["string"]
  },
  "competitor_activity": [{ "name": "string", "post_count": number, "avg_engagement": number, "primary_platform": "string" }],
  "recommendations": ["string"]
}

Posts data:
${JSON.stringify(postSummaries, null, 2).slice(0, 12000)}`
          );

          try {
            const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
            }
          } catch {
            console.error("[Social Scrape] Failed to parse analysis JSON");
            analysisResult = { raw_analysis: analysisResponse };
          }

          await supabase.from("competitor_analyses").insert({
            brand_id: brandId,
            analysis_type: "social_intelligence",
            title: "Social Media Intelligence Report",
            summary: analysisResult?.recommendations
              ? `Key findings: ${(analysisResult.recommendations as string[]).slice(0, 3).join(". ")}`
              : "Social media analysis completed",
            patterns: analysisResult?.content_themes ?? null,
            recommendations: analysisResult ?? null,
            content_analyzed: totalPosts,
            pipeline_run_id: runId,
          });
        }
      } catch (err) {
        console.error("[Social Scrape] Analysis error:", err);
      }
    }

    // 9. Update pipeline run record
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        steps_completed: ["social_scrape", "social_analysis"],
        social_posts_found: totalPosts,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq("id", runId);

    // 10. Return success with detailed info
    return NextResponse.json({
      success: true,
      run_id: runId,
      instagram_posts: instagramCount,
      twitter_posts: twitterCount,
      total_posts: totalPosts,
      competitors_processed: socialCompetitors.length,
      errors: errors.length > 0 ? errors : undefined,
      analysis: analysisResult ? "completed" : "skipped",
    });
  } catch (err) {
    console.error("[Social Scrape] Unhandled error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Social scrape failed",
      },
      { status: 500 }
    );
  }
}
