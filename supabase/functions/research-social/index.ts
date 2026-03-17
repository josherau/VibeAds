import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

const APIFY_BASE = "https://api.apify.com/v2";

async function waitForApifyRun(runId: string, token: string, maxWaitMs = 120000): Promise<any> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    const data = await res.json();
    const status = data.data?.status;

    if (status === "SUCCEEDED") {
      // Fetch dataset items
      const datasetId = data.data.defaultDatasetId;
      const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`);
      return await itemsRes.json();
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }

    // Wait 5 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Apify run ${runId} timed out after ${maxWaitMs}ms`);
}

async function startApifyActor(actorId: string, input: Record<string, unknown>, token: string): Promise<string> {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    if (!apifyToken) {
      throw new Error("APIFY_API_TOKEN not configured");
    }

    // Fetch competitors with social handles
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("is_active", true);

    if (compError) throw compError;

    const socialCompetitors = (competitors ?? []).filter(
      (c) => c.instagram_handle || c.twitter_handle || c.linkedin_url
    );

    console.log(`Found ${socialCompetitors.length} competitors with social profiles`);

    let instagramCount = 0;
    let twitterCount = 0;

    for (const competitor of socialCompetitors) {
      // Instagram scraping
      if (competitor.instagram_handle) {
        try {
          console.log(`Scraping Instagram for ${competitor.name} (@${competitor.instagram_handle})`);

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
              url: post.url ?? post.shortCode ? `https://instagram.com/p/${post.shortCode}` : null,
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
              console.error(`Error upserting Instagram post: ${error.message}`);
            } else {
              instagramCount++;
            }
          }
        } catch (err) {
          console.error(`Instagram scrape error for ${competitor.name}:`, err);
        }
      }

      // Twitter/X scraping
      if (competitor.twitter_handle) {
        try {
          console.log(`Scraping Twitter for ${competitor.name} (@${competitor.twitter_handle})`);

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
              console.error(`Error upserting tweet: ${error.message}`);
            } else {
              twitterCount++;
            }
          }
        } catch (err) {
          console.error(`Twitter scrape error for ${competitor.name}:`, err);
        }
      }
    }

    console.log(`Social scraping complete. Instagram: ${instagramCount}, Twitter: ${twitterCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        instagram_posts: instagramCount,
        twitter_posts: twitterCount,
        total: instagramCount + twitterCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-social error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
