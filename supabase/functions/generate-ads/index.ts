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

    const { brand_id, analysis_id } = await req.json();
    if (!brand_id || !analysis_id) {
      return new Response(JSON.stringify({ error: "brand_id and analysis_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating ads for brand ${brand_id} based on analysis ${analysis_id}`);

    // Fetch brand details
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (brandError) throw brandError;

    // Fetch the analysis
    const { data: analysis, error: analysisError } = await supabase
      .from("competitor_analyses")
      .select("*")
      .eq("id", analysis_id)
      .single();

    if (analysisError) throw analysisError;

    // Fetch previously liked creatives for style guidance
    const { data: likedCreatives } = await supabase
      .from("generated_creatives")
      .select("headline, primary_text, platform, format, competitive_angle")
      .eq("brand_id", brand_id)
      .eq("feedback", "up")
      .order("created_at", { ascending: false })
      .limit(10);

    const systemPrompt = `You are an expert ad creative director. Generate 6 ad concepts (2 for Meta, 2 for Google Search, 2 for LinkedIn) as a JSON array. Each ad object must have:
{
  "platform": "meta" | "google_search" | "linkedin",
  "format": "single_image" | "carousel" | "search_ad" | "sponsored_content",
  "headline": "Primary headline text",
  "headline_variants": ["Alternative headline 1", "Alternative headline 2"],
  "primary_text": "Main ad body text",
  "primary_text_variants": ["Alternative body 1", "Alternative body 2"],
  "description": "Ad description/link description",
  "cta": "Call to action text",
  "image_prompt": "Detailed AI image generation prompt for the ad creative visual",
  "image_concept_description": "Brief description of the visual concept",
  "target_audience": "Who this ad is targeting",
  "competitive_angle": "What competitive insight this ad leverages",
  "confidence_score": 0.0 to 1.0
}

Return ONLY a valid JSON array of 6 objects. Ensure each ad is differentiated and leverages different competitive insights.`;

    const userPrompt = `Generate ad creatives for "${brand.name}".

Brand details:
- Name: ${brand.name}
- Industry: ${brand.industry ?? "N/A"}
- Brand voice: ${brand.brand_voice ?? "Professional and approachable"}
- Target audience: ${brand.target_audience ?? "N/A"}
- Brand colors: ${brand.brand_colors ?? "N/A"}
- Description: ${brand.description ?? "N/A"}

Competitive analysis:
${JSON.stringify({ title: analysis.title, summary: analysis.summary, patterns: analysis.patterns, opportunities: analysis.opportunities }, null, 2)}

${likedCreatives?.length ? `Previously liked ad styles (user preferences):\n${JSON.stringify(likedCreatives, null, 2)}` : "No previous creative preferences available."}`;

    const creativesResponse = await askClaude(systemPrompt, userPrompt);

    // Parse the creatives
    let creatives: any[] = [];
    try {
      const jsonMatch = creativesResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        creatives = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("Failed to parse creatives response:", parseErr);
      throw new Error("Failed to parse generated creatives from Claude response");
    }

    if (!Array.isArray(creatives) || creatives.length === 0) {
      throw new Error("No creatives generated");
    }

    console.log(`Generated ${creatives.length} ad creatives`);

    // Insert all creatives
    const records = creatives.map((creative) => ({
      brand_id,
      analysis_id,
      platform: creative.platform,
      format: creative.format,
      headline: creative.headline,
      headline_variants: creative.headline_variants ?? [],
      primary_text: creative.primary_text,
      primary_text_variants: creative.primary_text_variants ?? [],
      description: creative.description,
      cta: creative.cta,
      image_prompt: creative.image_prompt,
      image_concept_description: creative.image_concept_description,
      target_audience: creative.target_audience,
      competitive_angle: creative.competitive_angle,
      confidence_score: creative.confidence_score ?? 0.5,
    }));

    const { data: insertedCreatives, error: insertError } = await supabase
      .from("generated_creatives")
      .insert(records)
      .select();

    if (insertError) throw insertError;

    console.log(`Inserted ${insertedCreatives?.length ?? 0} creatives into database`);

    return new Response(
      JSON.stringify({
        success: true,
        creatives_generated: insertedCreatives?.length ?? 0,
        creatives: insertedCreatives,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-ads error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
