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

    // Fetch brand details including positioning and voice data
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
      .select("summary, patterns, opportunities, positioning_gaps, market_sophistication, created_at")
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
      cta: ad.cta_text,
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

    const systemPrompt = `You are an elite competitive intelligence analyst specializing in direct response marketing and the Vibe Marketing Playbook methodology. You combine deep knowledge of Eugene Schwartz's market sophistication theory, positioning strategy, and ad copy analysis.

Your analysis must go beyond surface-level observations. You need to identify strategic positioning gaps, map market sophistication, extract proven patterns, and expose anti-patterns that the brand should avoid.

## ANALYSIS FRAMEWORK

Analyze all competitor data through these five lenses:

### 1. POSITIONING GAP ANALYSIS
Identify what competitors are NOT saying. Look for:
- Unoccupied positioning angles (contrarian, unique mechanism, transformation, enemy, speed/ease, specificity, social proof, risk reversal)
- Emotional territories no one is claiming
- Audience segments being ignored
- Value propositions left unstated
- Messaging themes with no competition

### 2. MARKET SOPHISTICATION MAPPING (Schwartz's 5 Stages)
Determine what stage the market is at:
- Stage 1: Direct claims work. "We do X." Market is still being educated.
- Stage 2: Enlarged claims. Competitors making bigger promises. "We do X BETTER."
- Stage 3: Mechanism stage. Competitors explaining HOW. "Our unique process does X."
- Stage 4: Enhanced mechanism. More specific, improved mechanisms. "Our NEW improved process does X."
- Stage 5: Identity stage. Competitors selling identity/values, not features. "For people who believe X."

Provide evidence for your assessment based on the actual competitor copy analyzed.

### 3. WINNING PATTERN EXTRACTION
Identify copy patterns that appear across multiple successful competitors:
- Headline formulas that get repeated
- Opening hooks that are common
- Proof elements used most frequently
- CTA language and urgency tactics
- Visual/creative patterns
- Offer structures that recur

### 4. ANTI-PATTERN IDENTIFICATION
What are competitors doing that the brand should explicitly NOT do:
- Overused cliches and tired phrases
- Weak positioning that everyone copies
- Generic CTAs that create no urgency
- Claims without proof
- Messaging that commoditizes the category
- Visual styles that make everyone look the same

### 5. COMPETITIVE GAP ANALYSIS (Per Competitor)
For each competitor, identify:
- Their primary positioning angle
- Their biggest weakness/blind spot
- The opportunity they are leaving on the table
- How to differentiate against them specifically

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{
  "title": "Brief analysis title",
  "summary": "2-3 paragraph executive summary covering key strategic insights and recommended actions",
  "patterns": {
    "messaging_themes": ["list of common messaging themes across competitors"],
    "offer_structures": ["how competitors structure their offers"],
    "visual_styles": ["visual/creative style observations"],
    "cta_patterns": ["common CTA patterns and language"],
    "headline_formulas": ["recurring headline structures"],
    "proof_elements": ["types of proof/evidence used"]
  },
  "opportunities": [
    {
      "gap": "Description of the competitive gap",
      "suggestion": "Actionable suggestion to exploit this gap",
      "positioning_angle": "contrarian|unique_mechanism|transformation|enemy|speed_ease|specificity|social_proof|risk_reversal",
      "priority": "high|medium|low",
      "estimated_impact": "Brief description of expected impact"
    }
  ],
  "positioning_gaps": {
    "unoccupied_angles": ["Positioning angles no competitor is using"],
    "emotional_territories": ["Emotional spaces no one is claiming"],
    "ignored_segments": ["Audience segments being overlooked"],
    "unstated_value_props": ["Value propositions no one is articulating"],
    "messaging_voids": ["Topics or themes with zero competition"]
  },
  "market_sophistication": {
    "level": 1-5,
    "evidence": ["Specific examples from competitor copy that demonstrate this level"],
    "implication": "What this means for the brand's copy strategy",
    "recommended_approach": "How to write copy at this sophistication level"
  },
  "winning_patterns": {
    "high_performing_formulas": ["Copy patterns that appear across multiple competitors and likely work"],
    "common_hooks": ["Opening hooks used frequently"],
    "proof_strategies": ["How competitors build credibility"],
    "urgency_tactics": ["How competitors create urgency/scarcity"],
    "offer_frameworks": ["How competitors structure their offers"]
  },
  "anti_patterns": {
    "overused_cliches": ["Tired phrases and messaging everyone uses"],
    "weak_positioning": ["Generic positions that commoditize the market"],
    "generic_ctas": ["CTAs that create no urgency or differentiation"],
    "unsubstantiated_claims": ["Claims made without proof"],
    "visual_sameness": ["Visual patterns that make everyone look identical"],
    "avoid_these": ["Explicit list of things the brand must NOT do"]
  },
  "competitor_gap_analysis": [
    {
      "competitor_name": "Name of competitor",
      "primary_positioning": "Their main angle",
      "biggest_weakness": "Their most exploitable weakness",
      "opportunity": "How to differentiate against them specifically",
      "what_they_do_well": "What to learn from (not copy) them"
    }
  ]
}

Return ONLY valid JSON. No markdown formatting, no code blocks, no explanatory text.`;

    const userPrompt = `Analyze competitive intelligence for "${brand.name}".

BRAND CONTEXT:
- Name: ${brand.name}
- Industry: ${brand.audience ?? "N/A"}
- Description: ${brand.description ?? "N/A"}
- Current voice: ${brand.voice ?? "N/A"}
- Current positioning angles: ${brand.positioning_angles ? JSON.stringify(brand.positioning_angles) : "Not yet defined"}
- Anti-positioning (what we do NOT want to be): ${brand.anti_positioning ?? "Not yet defined"}
- Current market sophistication assessment: ${brand.market_sophistication_level ?? "Not yet assessed"}

RECENT COMPETITOR ADS (${adsSummary.length} total):
${JSON.stringify(adsSummary, null, 2)}

RECENT COMPETITOR CONTENT (${contentSummary.length} total):
${JSON.stringify(contentSummary, null, 2)}

${previousAnalyses?.length ? `PREVIOUS ANALYSIS CONTEXT (for trend tracking):\n${JSON.stringify(previousAnalyses.map((a) => ({ summary: a.summary?.slice(0, 500), positioning_gaps: a.positioning_gaps, market_sophistication: a.market_sophistication, date: a.created_at })), null, 2)}` : "No previous analyses available."}

IMPORTANT: Provide deep strategic analysis, not surface-level observations. Focus on actionable positioning gaps and specific opportunities the brand can exploit. Every insight should be grounded in evidence from the competitor data provided.`;

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
        positioning_gaps: {},
        market_sophistication: { level: 3, evidence: [], implication: "Unable to parse", recommended_approach: "Review manually" },
        winning_patterns: {},
        anti_patterns: {},
        competitor_gap_analysis: [],
      };
    }

    // Insert analysis into database with enhanced fields
    const { data: insertedAnalysis, error: insertError } = await supabase
      .from("competitor_analyses")
      .insert({
        brand_id,
        analysis_type: "competitive_gap",
        title: analysis.title ?? "Competitor Analysis",
        summary: analysis.summary ?? "",
        patterns: analysis.patterns ?? {},
        opportunities: analysis.opportunities ?? [],
        positioning_gaps: analysis.positioning_gaps ?? {},
        market_sophistication: analysis.market_sophistication ?? {},
        winning_patterns: analysis.winning_patterns ?? {},
        anti_patterns: analysis.anti_patterns ?? {},
        competitor_gap_analysis: analysis.competitor_gap_analysis ?? [],
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
