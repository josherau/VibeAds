import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export const maxDuration = 120;

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

async function startApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  token: string
): Promise<string> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to start Apify actor ${actorId}: ${res.status} ${body}`
    );
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
    const res = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    const data = await res.json();
    const status = data.data?.status;

    if (status === "SUCCEEDED") {
      const datasetId = data.data.defaultDatasetId;
      const itemsRes = await fetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`
      );
      return await itemsRes.json();
    }

    if (
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Apify run ${runId} timed out after ${maxWaitMs}ms`);
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

    // 5. Fetch competitors with social handles (limit 3)
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true);

    if (compError) {
      throw compError;
    }

    const socialCompetitors = (competitors ?? [])
      .filter((c: any) => c.instagram_handle || c.twitter_handle)
      .slice(0, 3); // Limit to 3 to stay within timeout

    if (socialCompetitors.length === 0) {
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
        message: "No competitors with social handles found",
        posts_found: 0,
      });
    }

    console.log(
      `[Social Scrape] Processing ${socialCompetitors.length} competitors`
    );

    let instagramCount = 0;
    let twitterCount = 0;

    // 6. Instagram scraping
    for (const competitor of socialCompetitors) {
      if (competitor.instagram_handle) {
        try {
          console.log(
            `[Social Scrape] Scraping Instagram for ${competitor.name} (@${competitor.instagram_handle})`
          );

          const apifyRunId = await startApifyActor(
            "apify~instagram-profile-scraper",
            {
              usernames: [competitor.instagram_handle],
              resultsLimit: 20,
            },
            apifyToken
          );

          const results = await waitForApifyRun(apifyRunId, apifyToken);

          for (const post of Array.isArray(results) ? results : []) {
            const extId = post.id ?? post.shortCode ?? null;

            // Skip if we already have this post
            if (extId) {
              const { data: existing } = await supabase
                .from("competitor_content")
                .select("id")
                .eq("external_id", extId)
                .limit(1);
              if (existing && existing.length > 0) {
                instagramCount++;
                continue;
              }
            }

            const record = {
              competitor_id: competitor.id,
              source: "instagram",
              external_id: extId,
              content_type: "social_post",
              title: post.caption?.slice(0, 200) ?? null,
              body_text: post.caption ?? null,
              media_urls: post.displayUrl ? [post.displayUrl] : null,
              engagement_metrics: {
                likes: post.likesCount ?? 0,
                comments: post.commentsCount ?? 0,
                shares: 0,
                url: post.url ?? (post.shortCode ? `https://instagram.com/p/${post.shortCode}` : null),
              },
              published_at: post.timestamp ?? null,
              raw_data: post,
            };

            const { error } = await supabase
              .from("competitor_content")
              .insert(record);

            if (error) {
              console.error(
                `[Social Scrape] Instagram insert error: ${error.message}`
              );
            } else {
              instagramCount++;
            }
          }
        } catch (err) {
          console.error(
            `[Social Scrape] Instagram error for ${competitor.name}:`,
            err
          );
        }
      }

      // 7. Twitter/X scraping
      if (competitor.twitter_handle) {
        try {
          console.log(
            `[Social Scrape] Scraping Twitter for ${competitor.name} (@${competitor.twitter_handle})`
          );

          const apifyRunId = await startApifyActor(
            "apify~twitter-scraper",
            { handles: [competitor.twitter_handle], maxTweets: 20 },
            apifyToken
          );

          const results = await waitForApifyRun(apifyRunId, apifyToken);

          for (const tweet of Array.isArray(results) ? results : []) {
            const extId = tweet.id ?? null;

            // Skip if we already have this tweet
            if (extId) {
              const { data: existing } = await supabase
                .from("competitor_content")
                .select("id")
                .eq("external_id", extId)
                .limit(1);
              if (existing && existing.length > 0) {
                twitterCount++;
                continue;
              }
            }

            const record = {
              competitor_id: competitor.id,
              source: "twitter",
              external_id: extId,
              content_type: "social_post",
              title: tweet.text?.slice(0, 200) ?? null,
              body_text: tweet.text ?? null,
              engagement_metrics: {
                likes: tweet.likeCount ?? tweet.favoriteCount ?? 0,
                comments: tweet.replyCount ?? 0,
                shares: tweet.retweetCount ?? 0,
                url: tweet.url ?? null,
              },
              published_at: tweet.createdAt ?? null,
              raw_data: tweet,
            };

            const { error } = await supabase
              .from("competitor_content")
              .insert(record);

            if (error) {
              console.error(
                `[Social Scrape] Twitter insert error: ${error.message}`
              );
            } else {
              twitterCount++;
            }
          }
        } catch (err) {
          console.error(
            `[Social Scrape] Twitter error for ${competitor.name}:`,
            err
          );
        }
      }
    }

    const totalPosts = instagramCount + twitterCount;

    // 8. Analyze social content with Claude
    let analysisResult = null;
    if (totalPosts > 0) {
      try {
        // Fetch all social posts for this brand
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

          // Save analysis to competitor_analyses
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

    // 10. Return success
    return NextResponse.json({
      success: true,
      run_id: runId,
      instagram_posts: instagramCount,
      twitter_posts: twitterCount,
      total_posts: totalPosts,
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
