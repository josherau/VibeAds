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
    const mode = body.mode || "full"; // "full" | "meta_page_id_only"
    let competitorIds: string[] = body.competitor_ids
      ? body.competitor_ids
      : body.competitor_id
        ? [body.competitor_id]
        : [];

    const supabase = createServiceRoleClient();

    // If brand_id is provided with no specific IDs, enrich all competitors for the brand
    // For "meta_page_id_only" mode, only fetch competitors missing meta_page_id
    if (competitorIds.length === 0 && body.brand_id) {
      let query = supabase
        .from("competitors")
        .select("id")
        .eq("brand_id", body.brand_id)
        .eq("is_active", true);

      if (mode === "meta_page_id_only") {
        query = query.is("meta_page_id", null);
      }

      const { data: brandCompetitors } = await query;
      competitorIds = (brandCompetitors || []).map((c: any) => c.id);
    }

    if (competitorIds.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        message: mode === "meta_page_id_only"
          ? "All competitors already have Meta Page IDs"
          : "No competitor IDs provided",
      });
    }

    // Fetch competitors
    const { data: competitors, error: fetchError } = await supabase
      .from("competitors")
      .select("id, name, website_url, instagram_handle, twitter_handle, linkedin_url, youtube_url, meta_page_id")
      .in("id", competitorIds);

    if (fetchError || !competitors?.length) {
      return NextResponse.json({ error: "Competitors not found" }, { status: 404 });
    }

    const results: Array<{ id: string; name: string; found: Record<string, string | null>; error?: string }> = [];

    for (const competitor of competitors) {
      try {
        if (mode === "meta_page_id_only") {
          // Fast path: only resolve Meta Page ID, skip full social discovery
          if (competitor.meta_page_id) {
            results.push({
              id: competitor.id,
              name: competitor.name,
              found: { meta_page_id: competitor.meta_page_id },
            });
            continue;
          }

          // Try to find the Facebook URL from the website if we don't have it
          let facebookUrl: string | null = null;
          if (competitor.website_url) {
            const socialLinks = await discoverSocialLinks(competitor.website_url);
            facebookUrl = socialLinks.facebook;

            // If we found a Facebook URL, save it
            if (facebookUrl) {
              // Store in notes for reference
              const { data: current } = await supabase
                .from("competitors")
                .select("notes")
                .eq("id", competitor.id)
                .single();
              const existingNotes = current?.notes || "";
              if (!existingNotes.includes("facebook.com")) {
                await supabase
                  .from("competitors")
                  .update({ notes: existingNotes ? `${existingNotes}\nFacebook: ${facebookUrl}` : `Facebook: ${facebookUrl}` })
                  .eq("id", competitor.id);
              }
            }
          }

          // Multi-strategy resolution
          const metaPageId = await resolveMetaPageId(
            facebookUrl,
            competitor.name,
            competitor.website_url ?? undefined
          );

          if (metaPageId) {
            await supabase
              .from("competitors")
              .update({ meta_page_id: metaPageId })
              .eq("id", competitor.id);
            console.log(`[Enrich] Resolved Meta Page ID for ${competitor.name}: ${metaPageId}`);
          } else {
            console.log(`[Enrich] Could not resolve Meta Page ID for ${competitor.name}`);
          }

          results.push({
            id: competitor.id,
            name: competitor.name,
            found: { meta_page_id: metaPageId || null },
          });
          continue;
        }

        // Full enrichment mode
        if (!competitor.website_url) {
          results.push({ id: competitor.id, name: competitor.name, found: {}, error: "No website URL" });
          continue;
        }

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

        // Step 2: Try to find Meta/Facebook page ID (multi-strategy)
        let metaPageId = competitor.meta_page_id;
        if (!metaPageId) {
          metaPageId = await resolveMetaPageId(
            socialLinks.facebook,
            competitor.name,
            competitor.website_url ?? undefined
          );
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
        if (!competitor.youtube_url && socialLinks.youtube) {
          updates.youtube_url = socialLinks.youtube;
        }
        if (metaPageId && !competitor.meta_page_id) {
          updates.meta_page_id = metaPageId;
        }

        // Add TikTok and other extras to notes if found
        const extraSocials: string[] = [];
        if (socialLinks.tiktok) extraSocials.push(`TikTok: ${socialLinks.tiktok}`);
        if (socialLinks.pinterest) extraSocials.push(`Pinterest: ${socialLinks.pinterest}`);
        if (socialLinks.facebook && !metaPageId) extraSocials.push(`Facebook: ${socialLinks.facebook}`);

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
          queries: [query],
          maxPagesPerQuery: 1,
          resultsPerPage: 10,
        }),
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!res.ok) {
      console.log(`[Enrich] Google search failed: ${res.status}`);
      return result;
    }

    const items = await res.json();
    const organicResults = Array.isArray(items)
      ? items.flatMap((i: any) => i.organicResults || [])
      : items?.organicResults || [];

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
 * Uses multiple strategies in order of reliability:
 * 1. Meta Graph API (requires META_ACCESS_TOKEN)
 * 2. Scrape the Facebook page HTML for the page ID
 * 3. Meta Ad Library API search by page name
 * 4. Google search for the Facebook page ID
 */
async function resolveMetaPageId(facebookUrl: string | null, companyName?: string, websiteUrl?: string): Promise<string | null> {
  // Strategy 1: Meta Graph API (most reliable if token exists)
  if (facebookUrl) {
    const metaToken = process.env.META_ACCESS_TOKEN;
    if (metaToken) {
      try {
        const match = facebookUrl.match(/facebook\.com\/([^/?#]+)/);
        if (match) {
          const pageName = match[1];
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${pageName}?fields=id,name&access_token=${metaToken}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.id) {
              console.log(`[Enrich] Graph API resolved ${pageName} → ${data.id}`);
              return data.id;
            }
          }
        }
      } catch {
        console.log("[Enrich] Graph API resolution failed, trying next strategy");
      }
    }

    // Strategy 2: Scrape the Facebook page HTML for embedded page ID
    try {
      const pageId = await scrapeMetaPageIdFromHtml(facebookUrl);
      if (pageId) {
        console.log(`[Enrich] HTML scrape resolved ${facebookUrl} → ${pageId}`);
        return pageId;
      }
    } catch {
      console.log("[Enrich] HTML scrape failed, trying next strategy");
    }
  }

  // Strategy 3: Meta Ad Library API search by company name
  const metaToken = process.env.META_ACCESS_TOKEN;
  if (metaToken && companyName) {
    try {
      const pageId = await searchMetaAdLibraryForPage(companyName, metaToken);
      if (pageId) {
        console.log(`[Enrich] Ad Library search resolved ${companyName} → ${pageId}`);
        return pageId;
      }
    } catch {
      console.log("[Enrich] Ad Library search failed, trying next strategy");
    }
  }

  // Strategy 4: Google search for Facebook page ID
  if (companyName) {
    try {
      const pageId = await searchGoogleForMetaPageId(companyName, websiteUrl);
      if (pageId) {
        console.log(`[Enrich] Google search resolved ${companyName} → ${pageId}`);
        return pageId;
      }
    } catch {
      console.log("[Enrich] Google search for page ID failed");
    }
  }

  return null;
}

/**
 * Scrapes a Facebook page's HTML to extract the page ID from meta tags
 * and embedded JSON data. Facebook pages embed the page ID in several places.
 */
async function scrapeMetaPageIdFromHtml(facebookUrl: string): Promise<string | null> {
  try {
    const res = await fetch(facebookUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Pattern 1: "pageID":"123456789"
    const pageIdMatch = html.match(/"pageID"\s*:\s*"(\d+)"/);
    if (pageIdMatch) return pageIdMatch[1];

    // Pattern 2: content="fb://page/123456789"
    const fbPageMatch = html.match(/fb:\/\/page\/(\d+)/);
    if (fbPageMatch) return fbPageMatch[1];

    // Pattern 3: "page_id":"123456789" or "page_id":123456789
    const pageIdMatch2 = html.match(/"page_id"\s*:\s*"?(\d+)"?/);
    if (pageIdMatch2) return pageIdMatch2[1];

    // Pattern 4: og:url or al:android:url with page ID
    const ogMatch = html.match(/content="https?:\/\/www\.facebook\.com\/(\d+)/);
    if (ogMatch) return ogMatch[1];

    // Pattern 5: entity_id in JSON
    const entityMatch = html.match(/"entity_id"\s*:\s*"(\d+)"/);
    if (entityMatch) return entityMatch[1];

    // Pattern 6: data-page-id attribute
    const dataPageMatch = html.match(/data-page-id="(\d+)"/);
    if (dataPageMatch) return dataPageMatch[1];

  } catch (e) {
    console.log("[Enrich] Facebook HTML scrape error:", e);
  }

  return null;
}

/**
 * Searches the Meta Ad Library API for pages matching a company name.
 * Returns the page ID of the best match.
 */
async function searchMetaAdLibraryForPage(companyName: string, metaToken: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      search_terms: companyName,
      ad_type: "ALL",
      ad_reached_countries: '["US"]',
      fields: "page_id,page_name",
      access_token: metaToken,
      limit: "5",
    });

    const res = await fetch(
      `https://graph.facebook.com/v21.0/ads_archive?${params.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const ads = data.data ?? [];

    if (ads.length === 0) return null;

    // Find the most common page_id (the actual advertiser)
    const pageIdCounts: Record<string, { count: number; name: string }> = {};
    for (const ad of ads) {
      const pid = ad.page_id;
      const pname = ad.page_name ?? "";
      if (pid) {
        if (!pageIdCounts[pid]) {
          pageIdCounts[pid] = { count: 0, name: pname };
        }
        pageIdCounts[pid].count++;
      }
    }

    // Return the page ID that appears most often, preferring name matches
    let bestId: string | null = null;
    let bestScore = 0;
    const searchLower = companyName.toLowerCase();

    for (const [pid, info] of Object.entries(pageIdCounts)) {
      const nameMatch = info.name.toLowerCase().includes(searchLower) ||
        searchLower.includes(info.name.toLowerCase()) ? 100 : 0;
      const score = info.count + nameMatch;
      if (score > bestScore) {
        bestScore = score;
        bestId = pid;
      }
    }

    return bestId;
  } catch {
    return null;
  }
}

/**
 * Uses Google search to find a company's Facebook page ID.
 * Searches for the company's Facebook page and extracts the numeric ID.
 */
async function searchGoogleForMetaPageId(companyName: string, websiteUrl?: string): Promise<string | null> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return null;

  try {
    const domain = websiteUrl
      ? new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname.replace("www.", "")
      : "";
    const query = domain
      ? `"${companyName}" OR "${domain}" site:facebook.com`
      : `"${companyName}" facebook page`;

    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: [query],
          maxPagesPerQuery: 1,
          resultsPerPage: 5,
        }),
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!res.ok) return null;

    const items = await res.json();
    const organicResults = Array.isArray(items)
      ? items.flatMap((i: any) => i.organicResults || [])
      : items?.organicResults || [];

    for (const item of organicResults) {
      const url = item.url || item.link || "";
      // Look for facebook.com/pagename or facebook.com/profile.php?id=123
      const fbMatch = url.match(/facebook\.com\/([^/?#]+)/);
      if (fbMatch) {
        const pageName = fbMatch[1];
        // If it's already a numeric ID, use it directly
        if (/^\d+$/.test(pageName)) {
          return pageName;
        }
        // Skip generic Facebook paths
        const skipPaths = new Set(["share", "sharer", "login", "help", "about", "pages", "groups", "events", "marketplace", "watch", "gaming", "search"]);
        if (!skipPaths.has(pageName.toLowerCase())) {
          // We found the Facebook page URL — try to scrape the ID from it
          const scrapedId = await scrapeMetaPageIdFromHtml(url);
          if (scrapedId) return scrapedId;
          // If scraping failed, store the page name as a fallback
          // The ad library can sometimes use page names too
        }
      }
      // Check for profile.php?id=123 pattern
      const profileMatch = url.match(/facebook\.com\/profile\.php\?id=(\d+)/);
      if (profileMatch) return profileMatch[1];
    }
  } catch {
    // Silently fail
  }

  return null;
}
