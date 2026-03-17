import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { askClaude } from "../_shared/claude.ts";
import { corsHeaders } from "../_shared/cors.ts";

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

    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlApiKey) {
      throw new Error("FIRECRAWL_API_KEY not configured");
    }

    // Fetch competitors with website URLs
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("is_active", true)
      .not("website_url", "is", null);

    if (compError) throw compError;

    console.log(`Found ${competitors?.length ?? 0} competitors with website URLs`);

    let pagesScraped = 0;

    for (const competitor of competitors ?? []) {
      try {
        console.log(`Scraping landing page for ${competitor.name}: ${competitor.website_url}`);

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
        });

        if (!scrapeRes.ok) {
          const errBody = await scrapeRes.text();
          console.error(`Firecrawl error for ${competitor.name}: ${scrapeRes.status} ${errBody}`);
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const markdown = scrapeData.data?.markdown ?? "";

        if (!markdown) {
          console.log(`No markdown content for ${competitor.name}`);
          continue;
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
          // Extract JSON from Claude's response (handle markdown code blocks)
          const jsonMatch = parsedContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            structured = JSON.parse(jsonMatch[0]);
          }
        } catch (parseErr) {
          console.error(`Failed to parse Claude response for ${competitor.name}:`, parseErr);
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
          raw_data: { markdown: markdown.slice(0, 20000), firecrawl_metadata: scrapeData.data?.metadata },
          fetched_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from("competitor_content")
          .upsert(record, { onConflict: "external_id" });

        if (upsertError) {
          console.error(`Error upserting landing page for ${competitor.name}: ${upsertError.message}`);
        } else {
          pagesScraped++;
        }
      } catch (err) {
        console.error(`Error processing landing page for ${competitor.name}:`, err);
      }
    }

    console.log(`Landing page scraping complete. Pages scraped: ${pagesScraped}`);

    return new Response(
      JSON.stringify({ success: true, pages_scraped: pagesScraped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-landing-pages error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
