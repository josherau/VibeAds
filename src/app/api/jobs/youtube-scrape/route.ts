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
  console.log(`[YouTube Scrape] Starting Apify actor ${actorId} (timeout: ${timeoutSecs}s)`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSecs + 15) * 1000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify actor ${actorId} failed: HTTP ${res.status} - ${body.slice(0, 200)}`);
  }

  const items = await res.json();
  console.log(`[YouTube Scrape] Actor ${actorId} returned ${Array.isArray(items) ? items.length : 0} items`);
  return Array.isArray(items) ? items : [];
}

// ── YouTube helpers ──────────────────────────────────────────────────

/**
 * Extract a YouTube channel identifier from a URL.
 * Supports formats: /channel/UCXXX, /@handle, /c/name, /user/name
 */
function extractChannelIdentifier(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = parsed.pathname.replace(/\/+$/, "");

    // /channel/UCxxxxxx
    const channelMatch = path.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) return channelMatch[1];

    // /@handle
    const handleMatch = path.match(/\/@([a-zA-Z0-9._-]+)/);
    if (handleMatch) return `@${handleMatch[1]}`;

    // /c/customname or /user/username
    const customMatch = path.match(/\/(?:c|user)\/([a-zA-Z0-9._-]+)/);
    if (customMatch) return customMatch[1];

    // Bare path like youtube.com/channelname
    const barePath = path.replace(/^\//, "");
    if (barePath && !barePath.includes("/")) return barePath;

    return null;
  } catch {
    return null;
  }
}

/**
 * Scrape a YouTube channel using the YouTube Data API v3 (fallback).
 */
async function scrapeWithYouTubeApi(
  channelIdentifier: string,
  apiKey: string
): Promise<{ channel: any; videos: any[] } | null> {
  try {
    // Resolve channel ID
    let channelId = channelIdentifier;

    if (channelIdentifier.startsWith("@") || !channelIdentifier.startsWith("UC")) {
      let resolved = false;

      // Try forHandle first (for @handle format)
      if (channelIdentifier.startsWith("@")) {
        try {
          const handleRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(channelIdentifier.replace("@", ""))}&part=snippet,statistics,contentDetails&key=${apiKey}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (handleRes.ok) {
            const handleData = await handleRes.json();
            if (handleData.items?.length) {
              channelId = handleData.items[0].id;
              resolved = true;
            }
          }
        } catch (e) {
          console.log(`[YouTube Scrape] forHandle failed for ${channelIdentifier}`);
        }
      }

      // Try forUsername (for /user/ format)
      if (!resolved) {
        try {
          const userRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?forUsername=${encodeURIComponent(channelIdentifier.replace("@", ""))}&part=snippet,statistics,contentDetails&key=${apiKey}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (userRes.ok) {
            const userData = await userRes.json();
            if (userData.items?.length) {
              channelId = userData.items[0].id;
              resolved = true;
            }
          }
        } catch (e) {
          console.log(`[YouTube Scrape] forUsername failed for ${channelIdentifier}`);
        }
      }

      // Fallback: search for the channel by name
      if (!resolved) {
        console.log(`[YouTube Scrape] Searching for channel: ${channelIdentifier}`);
        try {
          const searchRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(channelIdentifier.replace(/[-_]/g, " "))}&type=channel&part=snippet&maxResults=1&key=${apiKey}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (!searchRes.ok) return null;
          const searchData = await searchRes.json();
          if (!searchData.items?.length) return null;
          channelId = searchData.items[0].snippet.channelId ?? searchData.items[0].id?.channelId;
          if (!channelId) return null;
        } catch (e) {
          console.error(`[YouTube Scrape] Search failed for ${channelIdentifier}:`, e);
          return null;
        }
      }
    }

    // Get channel details
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=snippet,statistics,contentDetails&key=${apiKey}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!detailRes.ok) return null;
    const detailData = await detailRes.json();
    if (!detailData.items?.length) return null;

    const ch = detailData.items[0];
    const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;

    // Get recent videos from uploads playlist
    const videos: any[] = [];
    if (uploadsPlaylistId) {
      const plRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=snippet,contentDetails&maxResults=25&key=${apiKey}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (plRes.ok) {
        const plData = await plRes.json();
        const videoIds = (plData.items ?? [])
          .map((item: any) => item.contentDetails?.videoId)
          .filter(Boolean);

        if (videoIds.length > 0) {
          // Get video details in batches of 50
          const vidRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.join(",")}&part=snippet,statistics,contentDetails&key=${apiKey}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (vidRes.ok) {
            const vidData = await vidRes.json();
            videos.push(...(vidData.items ?? []));
          }
        }
      }
    }

    return {
      channel: {
        channelId: ch.id,
        channelName: ch.snippet?.title,
        description: ch.snippet?.description,
        subscriberCount: parseInt(ch.statistics?.subscriberCount ?? "0"),
        videoCount: parseInt(ch.statistics?.videoCount ?? "0"),
        viewCount: parseInt(ch.statistics?.viewCount ?? "0"),
        thumbnailUrl: ch.snippet?.thumbnails?.medium?.url ?? ch.snippet?.thumbnails?.default?.url,
      },
      videos: videos.map((v: any) => ({
        videoId: v.id,
        title: v.snippet?.title,
        description: v.snippet?.description,
        viewCount: parseInt(v.statistics?.viewCount ?? "0"),
        likeCount: parseInt(v.statistics?.likeCount ?? "0"),
        commentCount: parseInt(v.statistics?.commentCount ?? "0"),
        duration: v.contentDetails?.duration ?? null,
        publishedAt: v.snippet?.publishedAt,
        thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
        tags: v.snippet?.tags ?? [],
      })),
    };
  } catch (err) {
    console.error(`[YouTube Scrape] YouTube API error for ${channelIdentifier}:`, err);
    return null;
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
      console.error("[YouTube Scrape] Failed to create pipeline run:", runError);
      return NextResponse.json(
        { error: "Failed to create job record" },
        { status: 500 }
      );
    }

    const runId = run.id;
    const startTime = Date.now();

    const apifyToken = process.env.APIFY_API_TOKEN;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    if (!apifyToken && !youtubeApiKey) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "failed",
          error_log: { message: "Neither APIFY_API_TOKEN nor YOUTUBE_API_KEY is configured" },
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json(
        { error: "Neither APIFY_API_TOKEN nor YOUTUBE_API_KEY is configured" },
        { status: 500 }
      );
    }

    // 5. Fetch all active competitors with youtube_url
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .limit(20);

    if (compError) {
      throw compError;
    }

    const ytCompetitors = (competitors ?? []).filter(
      (c: any) => c.youtube_url
    );

    if (ytCompetitors.length === 0) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          steps_completed: ["youtube_scrape"],
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        run_id: runId,
        message:
          "No competitors have YouTube URLs configured. Add YouTube channel URLs on the Competitors page.",
        channels_scraped: 0,
        videos_found: 0,
      });
    }

    console.log(
      `[YouTube Scrape] Found ${ytCompetitors.length} competitors with YouTube URLs`
    );

    let channelsScraped = 0;
    let videosFound = 0;
    const errors: string[] = [];

    // 6. Scrape each competitor's YouTube channel
    const scrapePromises = ytCompetitors.map(async (comp: any) => {
      try {
        const channelIdentifier = extractChannelIdentifier(comp.youtube_url);
        if (!channelIdentifier) {
          errors.push(`${comp.name}: Could not parse YouTube URL "${comp.youtube_url}"`);
          return;
        }

        console.log(
          `[YouTube Scrape] Scraping ${comp.name} — channel: ${channelIdentifier}`
        );

        let channelData: any = null;
        let videoData: any[] = [];

        // Try YouTube Data API first (free, reliable)
        if (youtubeApiKey) {
          console.log(
            `[YouTube Scrape] Using YouTube API for ${comp.name} (${channelIdentifier})`
          );
          const apiResult = await scrapeWithYouTubeApi(
            channelIdentifier,
            youtubeApiKey
          );
          if (apiResult) {
            channelData = apiResult.channel;
            videoData = apiResult.videos;
          }
        }

        // Fallback to Apify if YouTube API didn't work
        if (!channelData && apifyToken) {
          try {
            console.log(
              `[YouTube Scrape] Falling back to Apify for ${comp.name}`
            );
            const channelUrl = comp.youtube_url.startsWith("http")
              ? comp.youtube_url
              : `https://www.youtube.com/${channelIdentifier}`;

            const results = await runApifyActorSync(
              "streamers~youtube-channel-scraper",
              {
                channelUrls: [channelUrl],
                maxVideos: 25,
                sortBy: "newest",
              },
              apifyToken,
              120
            );

            if (results.length > 0) {
              const channelResult = results.find(
                (r: any) => r.channelName || r.channelTitle || r.subscriberCountText
              );

              if (channelResult) {
                channelData = {
                  channelId:
                    channelResult.channelId ??
                    channelResult.id ??
                    channelIdentifier,
                  channelName:
                    channelResult.channelName ??
                    channelResult.channelTitle ??
                    channelResult.title ??
                    comp.name,
                  description:
                    channelResult.channelDescription ??
                    channelResult.description ??
                    null,
                  subscriberCount:
                    channelResult.subscriberCount ??
                    channelResult.numberOfSubscribers ??
                    0,
                  videoCount:
                    channelResult.videoCount ??
                    channelResult.numberOfVideos ??
                    0,
                  viewCount:
                    channelResult.viewCount ??
                    channelResult.numberOfViews ??
                    0,
                  thumbnailUrl:
                    channelResult.channelThumbnail ??
                    channelResult.thumbnailUrl ??
                    null,
                };
              }

              for (const item of results) {
                if (item.title && (item.videoId || item.id || item.url)) {
                  videoData.push({
                    videoId:
                      item.videoId ??
                      item.id ??
                      (item.url?.match(/[?&]v=([^&]+)/)?.[1]) ??
                      null,
                    title: item.title,
                    description: item.description ?? item.text ?? null,
                    viewCount: item.viewCount ?? item.views ?? 0,
                    likeCount: item.likeCount ?? item.likes ?? 0,
                    commentCount:
                      item.commentCount ?? item.commentsCount ?? 0,
                    duration: item.duration ?? null,
                    publishedAt:
                      item.publishedAt ??
                      item.uploadDate ??
                      item.date ??
                      null,
                    thumbnailUrl:
                      item.thumbnailUrl ?? item.thumbnail ?? null,
                    tags: item.tags ?? item.hashtags ?? [],
                  });
                }

                if (item.videos && Array.isArray(item.videos)) {
                  for (const v of item.videos) {
                    videoData.push({
                      videoId:
                        v.videoId ??
                        v.id ??
                        (v.url?.match(/[?&]v=([^&]+)/)?.[1]) ??
                        null,
                      title: v.title,
                      description: v.description ?? null,
                      viewCount: v.viewCount ?? v.views ?? 0,
                      likeCount: v.likeCount ?? v.likes ?? 0,
                      commentCount: v.commentCount ?? v.commentsCount ?? 0,
                      duration: v.duration ?? null,
                      publishedAt:
                        v.publishedAt ?? v.uploadDate ?? v.date ?? null,
                      thumbnailUrl: v.thumbnailUrl ?? v.thumbnail ?? null,
                      tags: v.tags ?? v.hashtags ?? [],
                    });
                  }
                }
              }

              if (!channelData && videoData.length > 0) {
                const first = results[0];
                channelData = {
                  channelId: first.channelId ?? channelIdentifier,
                  channelName: first.channelName ?? first.channelTitle ?? comp.name,
                  description: null,
                  subscriberCount: 0,
                  videoCount: videoData.length,
                  viewCount: 0,
                  thumbnailUrl: null,
                };
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
              `[YouTube Scrape] Apify error for ${comp.name}:`,
              msg
            );
          }
        }

        if (!channelData) {
          errors.push(
            `${comp.name}: Could not scrape YouTube channel "${channelIdentifier}"`
          );
          return;
        }

        // 7. Upsert channel data
        const channelIdStr = String(channelData.channelId);
        const { data: existingChannel } = await supabase
          .from("youtube_channels")
          .select("id")
          .eq("channel_id", channelIdStr)
          .limit(1);

        let dbChannelId: string; // The UUID from youtube_channels table

        if (existingChannel && existingChannel.length > 0) {
          dbChannelId = existingChannel[0].id;
          await supabase
            .from("youtube_channels")
            .update({
              competitor_id: comp.id,
              brand_id: brandId,
              channel_name: channelData.channelName,
              subscriber_count: channelData.subscriberCount ?? 0,
              video_count: channelData.videoCount ?? 0,
              view_count: channelData.viewCount ?? 0,
              description: channelData.description ?? null,
              thumbnail_url: channelData.thumbnailUrl ?? null,
              last_scraped_at: new Date().toISOString(),
            })
            .eq("channel_id", channelIdStr);
        } else {
          const { data: inserted } = await supabase.from("youtube_channels").insert({
            competitor_id: comp.id,
            brand_id: brandId,
            channel_id: channelIdStr,
            channel_name: channelData.channelName,
            subscriber_count: channelData.subscriberCount ?? 0,
            video_count: channelData.videoCount ?? 0,
            view_count: channelData.viewCount ?? 0,
            description: channelData.description ?? null,
            thumbnail_url: channelData.thumbnailUrl ?? null,
            last_scraped_at: new Date().toISOString(),
          }).select("id").single();
          dbChannelId = inserted?.id ?? "";
        }

        if (!dbChannelId) {
          errors.push(`${comp.name}: Failed to get channel DB ID`);
          return;
        }

        channelsScraped++;

        // 8. Upsert videos
        for (const video of videoData) {
          if (!video.videoId) continue;

          const videoIdStr = String(video.videoId);
          const { data: existingVideo } = await supabase
            .from("youtube_videos")
            .select("id")
            .eq("video_id", videoIdStr)
            .limit(1);

          const videoPayload = {
            channel_id: dbChannelId,
            competitor_id: comp.id,
            brand_id: brandId,
            title: video.title ?? null,
            description:
              typeof video.description === "string"
                ? video.description.slice(0, 5000)
                : null,
            view_count: video.viewCount ?? 0,
            like_count: video.likeCount ?? 0,
            comment_count: video.commentCount ?? 0,
            duration: video.duration ?? null,
            published_at: video.publishedAt ?? null,
            thumbnail_url: video.thumbnailUrl ?? null,
            tags: Array.isArray(video.tags) ? video.tags.slice(0, 50) : null,
          };

          if (existingVideo && existingVideo.length > 0) {
            await supabase
              .from("youtube_videos")
              .update(videoPayload)
              .eq("video_id", videoIdStr);
          } else {
            await supabase.from("youtube_videos").insert({
              video_id: videoIdStr,
              ...videoPayload,
            });
          }
          videosFound++;
        }

        console.log(
          `[YouTube Scrape] ${comp.name}: scraped channel + ${videoData.length} videos`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[YouTube Scrape] Error for ${comp.name}:`, msg);
        errors.push(`${comp.name}: ${msg.slice(0, 150)}`);
      }
    });

    await Promise.allSettled(scrapePromises);

    console.log(
      `[YouTube Scrape] Total: ${channelsScraped} channels, ${videosFound} videos, ${errors.length} errors`
    );

    // 9. Run Claude analysis on YouTube data
    let analysisResult = null;
    if (videosFound > 0) {
      try {
        const { data: allVideos } = await supabase
          .from("youtube_videos")
          .select("*, youtube_channels!inner(channel_name)")
          .eq("brand_id", brandId)
          .order("published_at", { ascending: false })
          .limit(100);

        if (allVideos && allVideos.length > 0) {
          const videoSummaries = allVideos.map((v: any) => ({
            channel: (v.youtube_channels as any)?.channel_name ?? "Unknown",
            title: v.title,
            description: (v.description ?? "").slice(0, 200),
            views: v.view_count ?? 0,
            likes: v.like_count ?? 0,
            comments: v.comment_count ?? 0,
            duration: v.duration,
            published: v.published_at,
            tags: (v.tags ?? []).slice(0, 10),
          }));

          const analysisResponse = await askClaude(
            `You are a CMO-grade YouTube content intelligence analyst. Analyze competitor YouTube videos to identify what's working, what's not, and exactly what content the user should create to compete. Be specific, actionable, and data-driven. Return ONLY valid JSON.`,
            `Analyze these competitor YouTube videos and return a JSON object with this structure:
{
  "content_themes": [{ "theme": "string", "count": number, "description": "string", "example_videos": ["string"] }],
  "format_analysis": {
    "avg_duration": "string",
    "most_common_formats": ["string"],
    "best_performing_format": "string"
  },
  "posting_patterns": {
    "most_active_days": ["string"],
    "avg_videos_per_week": number,
    "consistency_score": "string"
  },
  "engagement_insights": {
    "avg_views": number,
    "avg_likes": number,
    "avg_comments": number,
    "view_to_engagement_ratio": "string",
    "best_performing_topics": ["string"]
  },
  "channel_comparison": [{ "name": "string", "video_count": number, "avg_views": number, "avg_engagement": number, "content_focus": "string" }],
  "title_patterns": {
    "common_structures": ["string"],
    "power_words": ["string"],
    "avg_title_length": number
  },
  "top_performers": [
    {
      "title": "string (exact video title)",
      "channel": "string (competitor name)",
      "views": number,
      "likes": number,
      "comments": number,
      "why_it_worked": "string (2-3 sentences explaining what made this video successful — topic, format, hook, timing, etc.)",
      "duplication_blueprint": "string (specific instructions for recreating similar content — title formula, format, key talking points, ideal length, CTA approach)"
    }
  ],
  "content_opportunities": [
    {
      "idea": "string (specific video title/concept)",
      "rationale": "string (why this will work based on competitor data)",
      "format": "string (tutorial, listicle, interview, case study, etc.)",
      "target_length": "string (e.g. '8-12 minutes')",
      "reference_videos": ["string (competitor videos this is inspired by)"],
      "priority": "high | medium | low"
    }
  ],
  "recommendations": ["string"]
}

IMPORTANT for top_performers: Pick the 5-7 best performing videos by engagement (views + likes*10 + comments*30). For each one, write a detailed "why_it_worked" and "duplication_blueprint" that a content team could immediately act on.

IMPORTANT for content_opportunities: Suggest 5-8 specific video ideas the user should create, based on gaps you see and what's performing well for competitors. Be very specific with titles and formats, not generic.

Videos data:
${JSON.stringify(videoSummaries, null, 2).slice(0, 12000)}`
          );

          try {
            const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
            }
          } catch {
            console.error("[YouTube Scrape] Failed to parse analysis JSON");
            analysisResult = { raw_analysis: analysisResponse };
          }

          await supabase.from("competitor_analyses").insert({
            brand_id: brandId,
            analysis_type: "youtube_intelligence",
            title: "YouTube Intelligence Report",
            summary: analysisResult?.recommendations
              ? `Key findings: ${(analysisResult.recommendations as string[]).slice(0, 3).join(". ")}`
              : "YouTube analysis completed",
            patterns: analysisResult?.content_themes ?? null,
            recommendations: analysisResult ?? null,
            content_analyzed: videosFound,
            pipeline_run_id: runId,
          });
        }
      } catch (err) {
        console.error("[YouTube Scrape] Analysis error:", err);
      }
    }

    // 10. Update pipeline run record
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        steps_completed: ["youtube_scrape", "youtube_analysis"],
        social_posts_found: videosFound,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq("id", runId);

    return NextResponse.json({
      success: true,
      run_id: runId,
      channels_scraped: channelsScraped,
      videos_found: videosFound,
      competitors_processed: ytCompetitors.length,
      errors: errors.length > 0 ? errors : undefined,
      analysis: analysisResult ? "completed" : "skipped",
    });
  } catch (err) {
    console.error("[YouTube Scrape] Unhandled error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "YouTube scrape failed",
      },
      { status: 500 }
    );
  }
}
