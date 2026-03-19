import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

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

// ── Firecrawl scraper ──────────────────────────────────────────────────

interface ScrapedPage {
  url: string;
  markdown: string;
  html: string;
  title?: string;
}

async function scrapeWithFirecrawl(
  url: string,
  firecrawlKey: string
): Promise<ScrapedPage | null> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: true,
        timeout: 30000,
      }),
    });

    if (!res.ok) {
      console.error(
        `[Landing Scrape] Firecrawl error for ${url}: HTTP ${res.status}`
      );
      return null;
    }

    const data = await res.json();
    if (!data.success || !data.data) {
      console.error(`[Landing Scrape] Firecrawl returned no data for ${url}`);
      return null;
    }

    return {
      url,
      markdown: data.data.markdown ?? "",
      html: data.data.html ?? "",
      title: data.data.metadata?.title ?? "",
    };
  } catch (err) {
    console.error(
      `[Landing Scrape] Firecrawl fetch failed for ${url}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ── Extract landing page elements with Claude ─────────────────────────

interface LandingPageElements {
  headline: string;
  sub_headline: string;
  value_proposition: string;
  ctas: string[];
  social_proof: {
    testimonials: string[];
    logos: string[];
    stats: string[];
  };
  pricing_mentions: string[];
  key_messaging_themes: string[];
  page_structure: string[];
  unique_selling_points: string[];
}

async function extractLandingPageElements(
  markdown: string,
  url: string
): Promise<LandingPageElements | null> {
  try {
    const truncated = markdown.slice(0, 12000);
    const response = await askClaude(
      `You are a landing page analyst. Extract key elements from landing page content. Return ONLY valid JSON.`,
      `Analyze this landing page from ${url} and extract all key elements. Return a JSON object with this structure:
{
  "headline": "The main headline/H1",
  "sub_headline": "The secondary headline if present",
  "value_proposition": "The core value proposition being communicated",
  "ctas": ["List of all call-to-action button texts found"],
  "social_proof": {
    "testimonials": ["Any testimonial quotes found"],
    "logos": ["Company/brand logos mentioned or referenced"],
    "stats": ["Any statistics used as social proof, e.g. '10,000+ customers'"]
  },
  "pricing_mentions": ["Any pricing information found"],
  "key_messaging_themes": ["List of key themes in the messaging"],
  "page_structure": ["List of main page sections in order"],
  "unique_selling_points": ["List of USPs or differentiators mentioned"]
}

Landing page content:
${truncated}`,
      2048
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as LandingPageElements;
    }
    return null;
  } catch (err) {
    console.error(
      `[Landing Scrape] Element extraction failed for ${url}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ── Discover key pages from homepage ──────────────────────────────────

function discoverKeyPages(
  html: string,
  baseUrl: string
): string[] {
  const keyPaths = [
    "/pricing",
    "/features",
    "/about",
    "/product",
    "/solutions",
    "/why",
    "/platform",
    "/how-it-works",
    "/use-cases",
    "/customers",
    "/case-studies",
    "/enterprise",
  ];

  const found: string[] = [];
  const normalizedBase = baseUrl.replace(/\/$/, "");

  // Check for links in the HTML
  for (const path of keyPaths) {
    const patterns = [
      `href="${normalizedBase}${path}`,
      `href="${path}"`,
      `href="${path}/`,
      `href="/${path.slice(1)}"`,
    ];

    for (const pattern of patterns) {
      if (html.toLowerCase().includes(pattern.toLowerCase())) {
        found.push(`${normalizedBase}${path}`);
        break;
      }
    }
  }

  // Limit to 4 additional pages to avoid excessive API calls
  return found.slice(0, 4);
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

    // 4. Check Firecrawl API key
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      return NextResponse.json(
        { error: "FIRECRAWL_API_KEY not configured" },
        { status: 500 }
      );
    }

    // 5. Create pipeline run record
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
      console.error(
        "[Landing Scrape] Failed to create pipeline run:",
        runError
      );
      return NextResponse.json(
        { error: "Failed to create job record" },
        { status: 500 }
      );
    }

    const runId = run.id;
    const startTime = Date.now();

    // 6. Fetch all active competitors with website_url
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .not("website_url", "is", null)
      .limit(20);

    if (compError) {
      throw compError;
    }

    if (!competitors || competitors.length === 0) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          steps_completed: ["landing_scrape"],
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        })
        .eq("id", runId);

      return NextResponse.json({
        success: true,
        run_id: runId,
        message:
          "No competitors with website URLs found for this brand. Add website URLs to your competitors first.",
        pages_scraped: 0,
      });
    }

    console.log(
      `[Landing Scrape] Found ${competitors.length} competitors with website URLs for brand ${brandId}`
    );

    let totalPagesScraped = 0;
    const errors: string[] = [];
    const allCompetitorData: {
      name: string;
      url: string;
      elements: LandingPageElements;
    }[] = [];

    // 7. Scrape each competitor's landing pages
    for (const competitor of competitors) {
      const websiteUrl = competitor.website_url!;
      console.log(
        `[Landing Scrape] Scraping ${competitor.name} (${websiteUrl})`
      );

      try {
        // Scrape homepage
        const homepage = await scrapeWithFirecrawl(websiteUrl, firecrawlKey);
        if (!homepage) {
          errors.push(
            `Failed to scrape homepage for ${competitor.name} (${websiteUrl})`
          );
          continue;
        }

        // Discover and scrape key pages
        const keyPageUrls = discoverKeyPages(homepage.html, websiteUrl);
        console.log(
          `[Landing Scrape] Found ${keyPageUrls.length} key pages for ${competitor.name}: ${keyPageUrls.join(", ")}`
        );

        const allPages: ScrapedPage[] = [homepage];

        // Scrape key pages in parallel (limited)
        if (keyPageUrls.length > 0) {
          const keyPageResults = await Promise.allSettled(
            keyPageUrls.map((url) => scrapeWithFirecrawl(url, firecrawlKey))
          );

          for (const result of keyPageResults) {
            if (result.status === "fulfilled" && result.value) {
              allPages.push(result.value);
            }
          }
        }

        console.log(
          `[Landing Scrape] Scraped ${allPages.length} pages for ${competitor.name}`
        );

        // Extract elements from each page
        for (const page of allPages) {
          const elements = await extractLandingPageElements(
            page.markdown,
            page.url
          );

          // Check for duplicate
          const { data: existing } = await supabase
            .from("competitor_content")
            .select("id")
            .eq("competitor_id", competitor.id)
            .eq("content_type", "landing_page")
            .eq("source", "website")
            .eq("external_id", page.url)
            .limit(1);

          if (existing && existing.length > 0) {
            // Update existing record
            await supabase
              .from("competitor_content")
              .update({
                title: elements?.headline ?? page.title ?? null,
                body_text: page.markdown.slice(0, 50000),
                raw_data: {
                  url: page.url,
                  scraped_at: new Date().toISOString(),
                  elements: elements as any,
                  page_title: page.title,
                } as any,
                engagement_metrics: {
                  cta_count: elements?.ctas?.length ?? 0,
                  social_proof_count:
                    (elements?.social_proof?.testimonials?.length ?? 0) +
                    (elements?.social_proof?.logos?.length ?? 0) +
                    (elements?.social_proof?.stats?.length ?? 0),
                  usp_count: elements?.unique_selling_points?.length ?? 0,
                },
              })
              .eq("id", existing[0].id);
          } else {
            // Insert new record
            await supabase.from("competitor_content").insert({
              competitor_id: competitor.id,
              source: "website",
              external_id: page.url,
              content_type: "landing_page",
              title: elements?.headline ?? page.title ?? null,
              body_text: page.markdown.slice(0, 50000),
              raw_data: {
                url: page.url,
                scraped_at: new Date().toISOString(),
                elements: elements as any,
                page_title: page.title,
              } as any,
              engagement_metrics: {
                cta_count: elements?.ctas?.length ?? 0,
                social_proof_count:
                  (elements?.social_proof?.testimonials?.length ?? 0) +
                  (elements?.social_proof?.logos?.length ?? 0) +
                  (elements?.social_proof?.stats?.length ?? 0),
                usp_count: elements?.unique_selling_points?.length ?? 0,
              },
            });
          }

          totalPagesScraped++;

          if (elements) {
            allCompetitorData.push({
              name: competitor.name,
              url: page.url,
              elements,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[Landing Scrape] Error scraping ${competitor.name}:`,
          msg
        );
        errors.push(`${competitor.name}: ${msg.slice(0, 150)}`);
      }
    }

    console.log(
      `[Landing Scrape] Total pages scraped: ${totalPagesScraped}, errors: ${errors.length}`
    );

    // 8. Run Claude analysis comparing competitor landing pages
    let analysisResult = null;
    if (allCompetitorData.length > 0) {
      try {
        const summaryForAnalysis = allCompetitorData.map((d) => ({
          competitor: d.name,
          url: d.url,
          headline: d.elements.headline,
          value_proposition: d.elements.value_proposition,
          ctas: d.elements.ctas,
          social_proof: d.elements.social_proof,
          pricing: d.elements.pricing_mentions,
          themes: d.elements.key_messaging_themes,
          usps: d.elements.unique_selling_points,
          page_structure: d.elements.page_structure,
        }));

        const analysisResponse = await askClaude(
          `You are a landing page and conversion optimization expert. Analyze competitor landing pages and extract actionable intelligence. Return ONLY valid JSON.`,
          `Analyze these competitor landing pages and return a JSON object with this structure:
{
  "cta_analysis": {
    "most_common_ctas": [{ "cta": "string", "count": number, "competitors_using": ["string"] }],
    "cta_patterns": ["string - patterns observed in CTA usage"],
    "missing_ctas": ["string - CTA types that could be used but aren't"]
  },
  "messaging_patterns": {
    "common_themes": [{ "theme": "string", "description": "string", "competitors_using": ["string"] }],
    "unique_angles": [{ "competitor": "string", "angle": "string" }],
    "tone_analysis": "string - overall tone/voice analysis"
  },
  "social_proof_analysis": {
    "types_used": [{ "type": "string", "count": number, "effectiveness": "string" }],
    "best_practices": ["string"],
    "gaps": ["string"]
  },
  "value_prop_comparison": [{ "competitor": "string", "value_prop": "string", "strength": "strong|moderate|weak", "reasoning": "string" }],
  "gap_analysis": {
    "messaging_gaps": ["string - messaging/positioning gaps found"],
    "structural_gaps": ["string - page structure/UX gaps"],
    "content_gaps": ["string - content/information gaps"]
  },
  "recommendations": ["string - actionable recommendations for outperforming competitors"],
  "page_structure_patterns": {
    "common_sections": ["string - sections most competitors use"],
    "innovative_sections": [{ "section": "string", "competitor": "string", "why_effective": "string" }]
  }
}

Competitor landing page data:
${JSON.stringify(summaryForAnalysis, null, 2).slice(0, 14000)}`,
          4096
        );

        try {
          const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysisResult = JSON.parse(jsonMatch[0]);
          }
        } catch {
          console.error("[Landing Scrape] Failed to parse analysis JSON");
          analysisResult = { raw_analysis: analysisResponse };
        }

        // Store analysis
        await supabase.from("competitor_analyses").insert({
          brand_id: brandId,
          analysis_type: "landing_page_intelligence",
          title: "Landing Page Intelligence Report",
          summary: analysisResult?.recommendations
            ? `Key findings: ${(analysisResult.recommendations as string[]).slice(0, 3).join(". ")}`
            : "Landing page analysis completed",
          patterns: analysisResult?.messaging_patterns ?? null,
          recommendations: analysisResult ?? null,
          content_analyzed: totalPagesScraped,
          pipeline_run_id: runId,
        });
      } catch (err) {
        console.error("[Landing Scrape] Analysis error:", err);
      }
    }

    // 9. Update pipeline run record
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        steps_completed: ["landing_scrape", "landing_analysis"],
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq("id", runId);

    // 10. Return success
    return NextResponse.json({
      success: true,
      run_id: runId,
      pages_scraped: totalPagesScraped,
      competitors_processed: competitors.length,
      errors: errors.length > 0 ? errors : undefined,
      analysis: analysisResult ? "completed" : "skipped",
    });
  } catch (err) {
    console.error("[Landing Scrape] Unhandled error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Landing page scrape failed",
      },
      { status: 500 }
    );
  }
}
