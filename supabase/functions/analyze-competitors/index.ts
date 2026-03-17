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

    const { brand_id } = await req.json();
    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Starting competitor analysis for brand ${brand_id}`);

    // Fetch brand details
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (brandError) throw brandError;

    // Fetch recent competitor ads (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentAds, error: adsError } = await supabase
      .from("competitor_ads")
      .select("*, competitors(name)")
      .eq("brand_id", brand_id)
      .gte("fetched_at", sevenDaysAgo)
      .limit(50);

    if (adsError) throw adsError;

    // Fetch recent competitor content (last 7 days)
    const { data: recentContent, error: contentError } = await supabase
      .from("competitor_content")
      .select("*, competitors(name)")
      .eq("brand_id", brand_id)
      .gte("fetched_at", sevenDaysAgo)
      .limit(50);

    if (contentError) throw contentError;

    // Fetch previous analysis for context
    const { data: previousAnalyses } = await supabase
      .from("competitor_analyses")
      .select("summary, patterns, opportunities, created_at")
      .eq("brand_id", brand_id)
      .order("created_at", { ascending: false })
      .limit(3);

    console.log(`Data collected - Ads: ${recentAds?.length ?? 0}, Content: ${recentContent?.length ?? 0}, Previous analyses: ${previousAnalyses?.length ?? 0}`);

    // Prepare data summaries for Claude
    const adsSummary = (recentAds ?? []).map((ad) => ({
      competitor: ad.competitors?.name,
      platform: ad.platform,
      headline: ad.headline,
      body: ad.body_text?.slice(0, 300),
      description: ad.description,
      started: ad.started_at,
    }));

    const contentSummary = (recentContent ?? []).map((c) => ({
      competitor: c.competitors?.name,
      type: c.content_type,
      platform: c.platform,
      title: c.title,
      body: c.body_text?.slice(0, 300),
      structured: c.structured_data,
      engagement: {
        likes: c.engagement_likes,
        comments: c.engagement_comments,
        shares: c.engagement_shares,
      },
    }));

    const systemPrompt = `You are a competitive intelligence analyst for a services/agency business. Analyze the competitor data and return a JSON object with:
{
  "title": "Brief analysis title",
  "summary": "2-3 paragraph executive summary of findings",
  "patterns": {
    "messaging_themes": ["list of common messaging themes across competitors"],
    "offer_structures": ["how competitors structure their offers"],
    "visual_styles": ["visual/creative style observations"],
    "cta_patterns": ["common CTA patterns and language"]
  },
  "opportunities": [
    {
      "gap": "Description of the competitive gap",
      "suggestion": "Actionable suggestion to exploit this gap",
      "priority": "high|medium|low"
    }
  ]
}

Return ONLY valid JSON.`;

    const userPrompt = `Analyze competitive intelligence for "${brand.name}".

Brand context: ${JSON.stringify({ name: brand.name, industry: brand.industry, description: brand.description })}

Recent competitor ads (${adsSummary.length} total):
${JSON.stringify(adsSummary, null, 2)}

Recent competitor content (${contentSummary.length} total):
${JSON.stringify(contentSummary, null, 2)}

${previousAnalyses?.length ? `Previous analysis context:\n${JSON.stringify(previousAnalyses.map((a) => ({ summary: a.summary?.slice(0, 500), date: a.created_at })), null, 2)}` : "No previous analyses available."}`;

    const analysisResponse = await askClaude(systemPrompt, userPrompt);

    // Parse the analysis
    let analysis: Record<string, unknown> = {};
    try {
      const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("Failed to parse analysis response:", parseErr);
      analysis = {
        title: "Competitor Analysis",
        summary: analysisResponse,
        patterns: {},
        opportunities: [],
      };
    }

    // Insert analysis into database
    const { data: insertedAnalysis, error: insertError } = await supabase
      .from("competitor_analyses")
      .insert({
        brand_id,
        title: analysis.title ?? "Competitor Analysis",
        summary: analysis.summary ?? "",
        patterns: analysis.patterns ?? {},
        opportunities: analysis.opportunities ?? [],
        ads_analyzed: recentAds?.length ?? 0,
        content_analyzed: recentContent?.length ?? 0,
        raw_response: analysisResponse,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Analysis complete. ID: ${insertedAnalysis.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: insertedAnalysis.id,
        analysis: insertedAnalysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("analyze-competitors error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
