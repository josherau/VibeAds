import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * POST /api/competitors/enrich
 * Crawls a competitor's website to discover social media accounts,
 * Meta page ID, and other profile info, then updates the competitor record.
 *
 * Body: { competitor_id: string } or { competitor_ids: string[] }
 */
export async function POST(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const competitorIds: string[] = body.competitor_ids
      ? body.competitor_ids
      : body.competitor_id
        ? [body.competitor_id]
        : [];

    if (competitorIds.length === 0) {
      return NextResponse.json({ error: "No competitor IDs provided" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch competitors
    const { data: competitors, error: fetchError } = await supabase
      .from("competitors")
      .select("id, name, website_url, instagram_handle, twitter_handle, linkedin_url, meta_page_id")
      .in("id", competitorIds);

    if (fetchError || !competitors?.length) {
      return NextResponse.json({ error: "Competitors not found" }, { status: 404 });
    }

    const results: Array<{ id: string; name: string; found: Record<string, string | null>; error?: string }> = [];

    for (const competitor of competitors) {
      if (!competitor.website_url) {
        results.push({ id: competitor.id, name: competitor.name, found: {}, error: "No website URL" });
        continue;
      }

      try {
        // Step 1: Fetch the website HTML to find social links
        const socialLinks = await discoverSocialLinks(competitor.website_url);

        // Step 1b: If website scraping didn't find socials, use Claude web search
        const foundFromSite = Object.values(socialLinks).filter(Boolean).length;
        if (foundFromSite < 2) {
          const searchResults = await searchForSocials(competitor.name, competitor.website_url);
          for (const [platform, value] of Object.entries(searchResults)) {
            if (value && !socialLinks[platform]) {
              socialLinks[platform] = value;
            }
          }
        }

        // Step 2: Try to find Meta/Facebook page ID
        let metaPageId = competitor.meta_page_id;
        if (!metaPageId && socialLinks.facebook) {
          metaPageId = await resolveMetaPageId(socialLinks.facebook);
        }

        // Step 3: Update the competitor record with discovered data
        const updates: Record<string, string | null> = {};

        if (!competitor.instagram_handle && socialLinks.instagram) {
          updates.instagram_handle = socialLinks.instagram;
        }
        if (!competitor.twitter_handle && socialLinks.twitter) {
          updates.twitter_handle = socialLinks.twitter;
        }
        if (!competitor.linkedin_url && socialLinks.linkedin) {
          updates.linkedin_url = socialLinks.linkedin;
        }
        if (!metaPageId && socialLinks.facebook) {
          // Store the Facebook URL in notes if we can't resolve the page ID
          updates.meta_page_id = metaPageId || null;
        } else if (metaPageId && !competitor.meta_page_id) {
          updates.meta_page_id = metaPageId;
        }

        // Add YouTube and TikTok to notes if found
        const extraSocials: string[] = [];
        if (socialLinks.youtube) extraSocials.push(`YouTube: ${socialLinks.youtube}`);
        if (socialLinks.tiktok) extraSocials.push(`TikTok: ${socialLinks.tiktok}`);
        if (socialLinks.pinterest) extraSocials.push(`Pinterest: ${socialLinks.pinterest}`);

        if (extraSocials.length > 0) {
          // Append to existing notes
          const { data: current } = await supabase
            .from("competitors")
            .select("notes")
            .eq("id", competitor.id)
            .single();
          const existingNotes = current?.notes || "";
          const newNotes = existingNotes
            ? `${existingNotes}\n\nDiscovered socials:\n${extraSocials.join("\n")}`
            : `Discovered socials:\n${extraSocials.join("\n")}`;
          updates.notes = newNotes;
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("competitors")
            .update(updates)
            .eq("id", competitor.id);
        }

        results.push({
          id: competitor.id,
          name: competitor.name,
          found: { ...socialLinks, meta_page_id: metaPageId || null },
        });
      } catch (err: any) {
        console.error(`[Enrich] Failed for ${competitor.name}:`, err);
        results.push({
          id: competitor.id,
          name: competitor.name,
          found: {},
          error: err.message,
        });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("[Enrich] Route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Crawls a website to discover social media links.
 * Uses Firecrawl if available, falls back to direct fetch.
 */
async function discoverSocialLinks(websiteUrl: string): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {
    instagram: null,
    twitter: null,
    linkedin: null,
    facebook: null,
    youtube: null,
    tiktok: null,
    pinterest: null,
  };

  let html = "";

  // Try Firecrawl first for better JS-rendered content
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
          timeout: 30000,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        html = data.data?.html || "";
      }
    } catch (e) {
      console.log("[Enrich] Firecrawl failed, falling back to direct fetch");
    }
  }

  // Fallback: direct fetch
  if (!html) {
    try {
      const res = await fetch(websiteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });
      html = await res.text();
    } catch (e) {
      console.log("[Enrich] Direct fetch also failed for", websiteUrl);
      return result;
    }
  }

  // Extract social links using regex patterns
  const patterns: Record<string, RegExp[]> = {
    instagram: [
      /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/gi,
    ],
    twitter: [
      /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/?/gi,
    ],
    linkedin: [
      /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)\/?/gi,
    ],
    facebook: [
      /https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/gi,
    ],
    youtube: [
      /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)([a-zA-Z0-9_-]+)\/?/gi,
    ],
    tiktok: [
      /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._-]+)\/?/gi,
    ],
    pinterest: [
      /https?:\/\/(?:www\.)?pinterest\.com\/([a-zA-Z0-9_-]+)\/?/gi,
    ],
  };

  // Excluded handles (common false positives)
  const excludedHandles = new Set([
    "share", "sharer", "intent", "hashtag", "home", "login", "signup",
    "search", "explore", "settings", "help", "about", "privacy", "terms",
    "policies", "ads", "business", "developers", "p", "watch", "embed",
    "channel", "playlist", "feed", "stories", "reels", "direct",
    "accounts", "oauth", "dialog", "plugins", "tr", "flx",
  ]);

  for (const [platform, regexes] of Object.entries(patterns)) {
    for (const regex of regexes) {
      const matches = [...html.matchAll(regex)];
      for (const match of matches) {
        const handle = match[1];
        if (handle && !excludedHandles.has(handle.toLowerCase())) {
          if (platform === "instagram" || platform === "twitter") {
            result[platform] = handle.startsWith("@") ? handle : `@${handle}`;
          } else if (platform === "linkedin") {
            result[platform] = match[0]; // Full URL for LinkedIn
          } else if (platform === "facebook") {
            result[platform] = match[0]; // Full URL for Facebook
          } else if (platform === "youtube") {
            result[platform] = match[0]; // Full URL for YouTube
          } else if (platform === "tiktok") {
            result[platform] = `@${handle.replace(/^@/, "")}`;
          } else {
            result[platform] = match[0];
          }
          break; // Take the first valid match per platform
        }
      }
    }
  }

  // If regex didn't find enough, try Claude to extract from the content
  const foundCount = Object.values(result).filter(Boolean).length;
  if (foundCount < 2 && html.length > 500) {
    try {
      const claudeResults = await extractSocialsWithClaude(html, websiteUrl);
      for (const [platform, value] of Object.entries(claudeResults)) {
        if (value && !result[platform]) {
          result[platform] = value;
        }
      }
    } catch (e) {
      console.log("[Enrich] Claude extraction failed:", e);
    }
  }

  return result;
}

/**
 * Uses Claude to extract social media links from HTML/markdown content.
 * Handles cases where links are in JavaScript, data attributes, or icon-based links.
 */
async function extractSocialsWithClaude(
  content: string,
  websiteUrl: string
): Promise<Record<string, string | null>> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return {};

  // Truncate content to avoid token limits
  const truncated = content.slice(0, 20000);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You extract social media profile URLs/handles from website HTML or markdown content. Look everywhere: href attributes, data attributes, JavaScript variables, JSON-LD, meta tags, og:tags, inline scripts, SVG links, etc.

Return ONLY a JSON object with these keys. Use null if not found:
{
  "instagram": "@handle or null",
  "twitter": "@handle or null",
  "linkedin": "full URL or null",
  "facebook": "full URL or null",
  "youtube": "full URL or null",
  "tiktok": "@handle or null",
  "pinterest": "full URL or null"
}`,
      messages: [{
        role: "user",
        content: `Extract social media profiles from this website (${websiteUrl}):\n\n${truncated}`,
      }],
    }),
  });

  if (!res.ok) return {};

  const data = await res.json();
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {};
  }
}

/**
 * Searches Google for a company's social media accounts using Apify's Google Search scraper.
 * Much more reliable than HEAD requests to social platforms (which block server IPs).
 */
async function searchForSocials(
  companyName: string,
  websiteUrl: string
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (!apifyToken) {
    console.log("[Enrich] No APIFY_API_TOKEN, skipping Google search for socials");
    return result;
  }

  try {
    // Search Google for the company's social profiles
    const query = `"${companyName}" site:instagram.com OR site:twitter.com OR site:x.com OR site:linkedin.com OR site:facebook.com OR site:youtube.com OR site:tiktok.com`;

    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: query,
          maxPagesPerQuery: 1,
          resultsPerPage: 10,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      console.log(`[Enrich] Google search failed: ${res.status}`);
      return result;
    }

    const items = await res.json();
    const organicResults = items?.[0]?.organicResults || items?.flatMap?.((i: any) => i.organicResults || []) || [];

    // Social platform URL patterns
    const platformPatterns: Record<string, RegExp> = {
      instagram: /instagram\.com\/([a-zA-Z0-9._]+)/i,
      twitter: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i,
      linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)/i,
      facebook: /facebook\.com\/([a-zA-Z0-9._-]+)/i,
      youtube: /youtube\.com\/(?:@|channel\/|c\/|user\/)([a-zA-Z0-9_-]+)/i,
      tiktok: /tiktok\.com\/@([a-zA-Z0-9._-]+)/i,
    };

    const excluded = new Set([
      "share", "sharer", "intent", "hashtag", "explore", "p", "watch",
      "search", "login", "signup", "settings", "help", "about",
    ]);

    for (const item of organicResults) {
      const url = item.url || item.link || "";
      for (const [platform, pattern] of Object.entries(platformPatterns)) {
        if (result[platform]) continue; // Already found
        const match = url.match(pattern);
        if (match && match[1] && !excluded.has(match[1].toLowerCase())) {
          if (platform === "instagram" || platform === "twitter" || platform === "tiktok") {
            result[platform] = `@${match[1].replace(/^@/, "")}`;
          } else if (platform === "linkedin" || platform === "facebook" || platform === "youtube") {
            result[platform] = url;
          }
        }
      }
    }

    console.log(`[Enrich] Google search results for ${companyName}: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[Enrich] Google search error for ${companyName}:`, err);
  }

  return result;
}

/**
 * Tries to resolve a Facebook page URL to a Meta page ID.
 * Uses the Meta Graph API if a token is available.
 */
async function resolveMetaPageId(facebookUrl: string): Promise<string | null> {
  const metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) return null;

  try {
    // Extract page name from URL
    const match = facebookUrl.match(/facebook\.com\/([^/?]+)/);
    if (!match) return null;
    const pageName = match[1];

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageName}?fields=id,name&access_token=${metaToken}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (res.ok) {
      const data = await res.json();
      return data.id || null;
    }
  } catch {
    // Silently fail — Meta page ID is optional
  }

  return null;
}
