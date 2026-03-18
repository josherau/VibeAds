import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * POST /api/competitors/[id]/analyze
 * Deep-dive analysis of a single competitor using their website + social presence.
 * Crawls their site via Firecrawl, then sends everything to Claude for a comprehensive
 * marketing teardown.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: competitorId } = await params;

  try {
    // Auth
    const authSupabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Fetch the competitor
    const { data: competitor, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("id", competitorId)
      .single();

    if (compError || !competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    // Fetch our brand for comparison context
    const { data: brand } = await supabase
      .from("brands")
      .select("id, name, description, voice, audience, voice_profile, positioning_angles, anti_positioning, market_sophistication_level")
      .eq("id", competitor.brand_id)
      .single();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Step 1: Scrape competitor's website
    let websiteContent = "";
    if (competitor.website_url) {
      websiteContent = await scrapeWebsite(competitor.website_url);
    }

    // Step 2: Check for existing competitor ads/content in our DB
    const { data: existingAds } = await supabase
      .from("competitor_ads")
      .select("headline, description, platform, creative_type, landing_page_url")
      .eq("competitor_id", competitorId)
      .limit(20);

    const { data: existingContent } = await supabase
      .from("competitor_content")
      .select("platform, content_type, content_text, engagement_likes, engagement_comments, engagement_shares")
      .eq("competitor_id", competitorId)
      .order("engagement_likes", { ascending: false })
      .limit(20);

    // Step 3: Build the mega-prompt for Claude
    const analysis = await analyzeCompetitor({
      competitor,
      brand,
      websiteContent,
      existingAds: existingAds || [],
      existingContent: existingContent || [],
    });

    // Step 4: Save the analysis
    // Check if a profile already exists for this competitor
    const { data: existingProfile } = await supabase
      .from("competitor_profiles")
      .select("id")
      .eq("competitor_id", competitorId)
      .single();

    const profileData = {
      competitor_id: competitorId,
      brand_id: competitor.brand_id,
      // Core Identity
      positioning_statement: analysis.positioning_statement,
      value_proposition: analysis.value_proposition,
      target_audience: analysis.target_audience,
      brand_voice_assessment: analysis.brand_voice_assessment,
      // Market Position
      market_sophistication_level: analysis.market_sophistication_level,
      positioning_type: analysis.positioning_type,
      unique_mechanism: analysis.unique_mechanism,
      // Strengths & Weaknesses
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      opportunities_for_us: analysis.opportunities_for_us,
      threats_from_them: analysis.threats_from_them,
      // Marketing Breakdown
      messaging_analysis: analysis.messaging_analysis,
      content_strategy_assessment: analysis.content_strategy_assessment,
      ad_strategy_assessment: analysis.ad_strategy_assessment,
      funnel_analysis: analysis.funnel_analysis,
      pricing_analysis: analysis.pricing_analysis,
      // Social Presence
      social_presence_assessment: analysis.social_presence_assessment,
      top_performing_themes: analysis.top_performing_themes,
      // Strategic Recommendations
      attack_vectors: analysis.attack_vectors,
      defensive_moves: analysis.defensive_moves,
      quick_wins: analysis.quick_wins,
      long_term_plays: analysis.long_term_plays,
      // Meta
      overall_threat_level: analysis.overall_threat_level,
      overall_score: analysis.overall_score,
      executive_summary: analysis.executive_summary,
      raw_response: JSON.stringify(analysis),
      analyzed_at: new Date().toISOString(),
    };

    if (existingProfile) {
      await supabase
        .from("competitor_profiles")
        .update(profileData)
        .eq("id", existingProfile.id);
    } else {
      await supabase
        .from("competitor_profiles")
        .insert(profileData);
    }

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    console.error("[Competitor Analysis] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function scrapeWebsite(url: string): Promise<string> {
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
          url,
          formats: ["markdown"],
          onlyMainContent: false,
          timeout: 30000,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.data?.markdown || "").slice(0, 15000);
      }
    } catch (e) {
      console.log("[Competitor Analysis] Firecrawl failed, falling back");
    }
  }

  // Fallback: direct fetch
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    // Strip HTML tags for a rough text extraction
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);
  } catch {
    return "";
  }
}

interface AnalysisInput {
  competitor: any;
  brand: any;
  websiteContent: string;
  existingAds: any[];
  existingContent: any[];
}

async function analyzeCompetitor(input: AnalysisInput) {
  const { competitor, brand, websiteContent, existingAds, existingContent } = input;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const systemPrompt = `You are a world-class competitive intelligence analyst and marketing strategist. You combine the analytical rigor of a McKinsey consultant with the creative instincts of a top CMO and the tactical knowledge of a direct response marketing expert.

Your job is to produce an exhaustive marketing dossier on a competitor that will give our brand actionable strategic advantages. Be specific, opinionated, and tactical — not generic.

Apply these frameworks:
- Eugene Schwartz's 5 Stages of Market Sophistication
- 8 Positioning Angle Types: contrarian, unique_mechanism, transformation, enemy, speed_ease, specificity, social_proof, risk_reversal
- SWOT Analysis with marketing specificity
- Funnel analysis (awareness → consideration → decision → retention)
- Brand voice architecture (personality traits, tone dimensions)
- Content strategy teardown
- Direct response copywriting assessment

Return a JSON object with this exact structure:
{
  "executive_summary": "2-3 paragraph strategic overview of this competitor and what they mean for our brand",

  "positioning_statement": "Their implied positioning statement based on their marketing",
  "value_proposition": "Their core value proposition as communicated",
  "target_audience": {
    "primary": "Description of primary audience",
    "secondary": "Description of secondary audience",
    "psychographics": ["list", "of", "psychographic", "traits"],
    "pain_points_addressed": ["pain1", "pain2"]
  },

  "brand_voice_assessment": {
    "personality_traits": ["trait1", "trait2", "trait3"],
    "tone_dimensions": {
      "formal_casual": 0.0-1.0,
      "serious_playful": 0.0-1.0,
      "technical_simple": 0.0-1.0,
      "corporate_human": 0.0-1.0
    },
    "vocabulary_level": "basic|intermediate|advanced|expert",
    "emotional_vs_rational": 0.0-1.0,
    "assessment": "Brief assessment of voice effectiveness"
  },

  "market_sophistication_level": 1-5,
  "market_sophistication_reasoning": "Why this level",
  "positioning_type": "contrarian|unique_mechanism|transformation|enemy|speed_ease|specificity|social_proof|risk_reversal",
  "positioning_type_reasoning": "Why they use this type",
  "unique_mechanism": "Their unique mechanism or differentiator if any",

  "strengths": [
    {"area": "Area name", "detail": "Specific detail", "evidence": "What we observed", "threat_level": "high|medium|low"}
  ],
  "weaknesses": [
    {"area": "Area name", "detail": "Specific detail", "evidence": "What we observed", "exploitability": "high|medium|low"}
  ],
  "opportunities_for_us": [
    {"opportunity": "Description", "strategy": "How to exploit it", "effort": "low|medium|high", "impact": "low|medium|high", "timeframe": "immediate|short_term|long_term"}
  ],
  "threats_from_them": [
    {"threat": "Description", "likelihood": "high|medium|low", "mitigation": "How to defend"}
  ],

  "messaging_analysis": {
    "primary_headline_approach": "What headline framework they use most",
    "key_claims": ["claim1", "claim2"],
    "proof_elements": ["proof1", "proof2"],
    "calls_to_action": ["cta1", "cta2"],
    "emotional_triggers": ["trigger1", "trigger2"],
    "missing_elements": ["What they should be saying but aren't"],
    "copywriting_grade": "A|B|C|D|F",
    "assessment": "Overall messaging assessment"
  },

  "content_strategy_assessment": {
    "content_types": ["blog", "video", "podcast"],
    "content_frequency": "How often they publish",
    "content_quality": "high|medium|low",
    "seo_focus": "Their apparent SEO strategy",
    "top_themes": ["theme1", "theme2"],
    "content_gaps": ["gap1", "gap2"],
    "assessment": "Overall content strategy assessment"
  },

  "ad_strategy_assessment": {
    "platforms_used": ["meta", "google"],
    "ad_types": ["image", "video", "carousel"],
    "primary_angles": ["angle1", "angle2"],
    "landing_page_quality": "high|medium|low",
    "funnel_sophistication": "basic|intermediate|advanced",
    "estimated_monthly_spend": "rough estimate if possible",
    "assessment": "Overall ad strategy assessment"
  },

  "funnel_analysis": {
    "awareness": {"tactics": ["tactic1"], "effectiveness": "high|medium|low"},
    "consideration": {"tactics": ["tactic1"], "effectiveness": "high|medium|low"},
    "decision": {"tactics": ["tactic1"], "effectiveness": "high|medium|low"},
    "retention": {"tactics": ["tactic1"], "effectiveness": "high|medium|low"},
    "overall_grade": "A|B|C|D|F",
    "biggest_leak": "Where they lose the most prospects"
  },

  "pricing_analysis": {
    "pricing_model": "subscription|one_time|freemium|usage_based|custom",
    "price_positioning": "premium|mid_market|budget|value",
    "pricing_transparency": "transparent|semi_transparent|opaque",
    "assessment": "Pricing strategy assessment"
  },

  "social_presence_assessment": {
    "strongest_platform": "Which platform they're best on",
    "weakest_platform": "Which platform they're weakest on",
    "engagement_quality": "high|medium|low",
    "community_building": "strong|moderate|weak|none",
    "assessment": "Overall social presence assessment"
  },

  "top_performing_themes": [
    {"theme": "Theme name", "why_it_works": "Explanation", "how_to_counter": "Our counter-strategy"}
  ],

  "attack_vectors": [
    {"vector": "Description", "strategy": "How to execute", "expected_impact": "high|medium|low", "risk": "high|medium|low"}
  ],
  "defensive_moves": [
    {"move": "Description", "trigger": "When to deploy this", "priority": "high|medium|low"}
  ],
  "quick_wins": [
    {"action": "Specific action to take", "timeframe": "This week|This month", "expected_result": "What we expect to gain"}
  ],
  "long_term_plays": [
    {"play": "Description", "timeframe": "3 months|6 months|12 months", "investment": "low|medium|high", "expected_outcome": "What this achieves"}
  ],

  "overall_threat_level": "critical|high|medium|low|negligible",
  "overall_score": 0-100
}`;

  const userPrompt = `Analyze this competitor for our brand:

## OUR BRAND
Name: ${brand.name}
Description: ${brand.description || "Not provided"}
Target Audience: ${brand.audience || "Not provided"}
Voice: ${brand.voice || "Not provided"}
Voice Profile: ${brand.voice_profile ? JSON.stringify(brand.voice_profile) : "Not analyzed yet"}
Positioning Angles: ${brand.positioning_angles ? JSON.stringify(brand.positioning_angles) : "Not analyzed yet"}
Anti-Positioning: ${brand.anti_positioning ? JSON.stringify(brand.anti_positioning) : "Not analyzed yet"}
Market Sophistication Level: ${brand.market_sophistication_level || "Not analyzed"}

## COMPETITOR
Name: ${competitor.name}
Website: ${competitor.website_url || "Unknown"}
Instagram: ${competitor.instagram_handle || "None found"}
Twitter/X: ${competitor.twitter_handle || "None found"}
LinkedIn: ${competitor.linkedin_url || "None found"}
Meta Page ID: ${competitor.meta_page_id || "None found"}

## COMPETITOR WEBSITE CONTENT
${websiteContent || "Could not scrape website"}

## COMPETITOR ADS WE'VE FOUND (${existingAds.length})
${existingAds.length > 0
    ? existingAds.map((ad, i) =>
        `${i + 1}. [${ad.platform}/${ad.creative_type}] "${ad.headline}" — ${ad.description?.slice(0, 200) || "No description"}`
      ).join("\n")
    : "No ads collected yet"}

## COMPETITOR SOCIAL CONTENT WE'VE FOUND (${existingContent.length})
${existingContent.length > 0
    ? existingContent.map((c, i) =>
        `${i + 1}. [${c.platform}/${c.content_type}] ${c.content_text?.slice(0, 200) || "No text"} (👍${c.engagement_likes || 0} 💬${c.engagement_comments || 0} 🔄${c.engagement_shares || 0})`
      ).join("\n")
    : "No social content collected yet"}

Produce the comprehensive analysis. Be specific and actionable — use actual observations from the website content, ads, and social posts. Don't be generic.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

  // Parse JSON from Claude's response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse analysis JSON from Claude");

  return JSON.parse(jsonMatch[0]);
}
