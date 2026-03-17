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

    // Fetch brand details including positioning angles, voice profile, and vocabulary
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (brandError) throw brandError;

    // Fetch the analysis (including enhanced fields)
    const { data: analysis, error: analysisError } = await supabase
      .from("competitor_analyses")
      .select("*")
      .eq("id", analysis_id)
      .single();

    if (analysisError) throw analysisError;

    // Fetch previously liked creatives for style guidance
    const { data: likedCreatives } = await supabase
      .from("generated_creatives")
      .select("headline, primary_text, platform, format, competitive_angle, positioning_angle_type, copywriting_framework")
      .eq("brand_id", brand_id)
      .eq("feedback", "up")
      .order("created_at", { ascending: false })
      .limit(10);

    // Build positioning angles context
    const positioningAngles = brand.positioning_angles ?? null;
    const voiceProfile = brand.voice_profile ?? null;
    const vocabularyGuide = brand.vocabulary_guide ?? null;
    const antiPositioning = brand.anti_positioning ?? null;
    const marketSophLevel = brand.market_sophistication_level ?? (analysis.market_sophistication as any)?.level ?? 3;

    const systemPrompt = `You are an elite direct response copywriter and ad creative director trained in the Vibe Marketing Playbook methodology. You combine deep knowledge of Eugene Schwartz's market sophistication theory, proven direct response frameworks, and modern platform-specific ad optimization.

Your job is to generate high-converting ad concepts that are strategically differentiated from competitors and grounded in specific positioning angles.

## POSITIONING ANGLE TYPES
Each ad concept MUST use one of these positioning angles:
- **contrarian**: Challenge conventional wisdom in the market. Say the opposite of what everyone else says.
- **unique_mechanism**: Highlight a proprietary method, system, or process that makes the brand different.
- **transformation**: Focus on the before/after state of the customer. Paint a vivid picture of life after using the product.
- **enemy**: Identify a common enemy (bad practices, outdated tools, industry lies) and position the brand against it.
- **speed_ease**: Emphasize how fast or easy the result comes. Remove friction and objections about effort.
- **specificity**: Use ultra-specific numbers, timeframes, and results to build credibility.
- **social_proof**: Lead with testimonials, case studies, user counts, or authority signals.
- **risk_reversal**: Remove all risk from the purchase decision. Guarantees, free trials, no-commitment offers.

## DIRECT RESPONSE HEADLINE FRAMEWORKS
Use these tested patterns for headlines:
- **curiosity_gap**: Create an information gap that compels the click. "The [X] mistake that [audience] makes every [time period]"
- **specific_numbers**: Lead with concrete data. "How [X] [audience] achieved [specific result] in [timeframe]"
- **before_after**: Contrast the painful present with the desired future. "Stop [pain point]. Start [desired outcome]."
- **problem_agitate_solve**: Name the problem, twist the knife, then present the solution.
- **fear_of_missing_out**: Create urgency through scarcity or social momentum.
- **social_proof_lead**: Open with proof before making any claims.
- **direct_benefit**: State the primary benefit clearly and immediately.
- **story_lead**: Open with a compelling micro-story that hooks attention.

## SCHWARTZ MARKET SOPHISTICATION LEVELS
Write copy appropriate to the market's sophistication level:
- Level 1: Be direct. Simply state what you do and why it matters. The market is unaware.
- Level 2: Make bigger, bolder claims. Enlarge on the existing promise.
- Level 3: Introduce a UNIQUE MECHANISM. Show HOW your solution works differently.
- Level 4: Emphasize an improved, expanded, or more specific mechanism.
- Level 5: Identify with the prospect's worldview. Lead with story, identity, and values — not claims.

The current market sophistication level is: ${marketSophLevel}

## OUTPUT FORMAT
Generate exactly 8 ad concepts as a JSON array. For each concept, create platform-specific variants and A/B test options.

Each ad object must follow this exact structure:
{
  "platform": "meta" | "google" | "linkedin",
  "format": "single_image" | "carousel" | "video_script" | "search_ad",
  "positioning_angle_type": "contrarian" | "unique_mechanism" | "transformation" | "enemy" | "speed_ease" | "specificity" | "social_proof" | "risk_reversal",
  "positioning_framework": "Brief description of the specific angle being used",
  "copywriting_framework": "curiosity_gap" | "specific_numbers" | "before_after" | "problem_agitate_solve" | "fear_of_missing_out" | "social_proof_lead" | "direct_benefit" | "story_lead",
  "psychological_trigger": "The specific psychological trigger being leveraged (e.g., loss aversion, authority bias, social proof, reciprocity)",
  "schwartz_sophistication_level": 1-5,
  "headline": "Primary headline (Meta: any length, Google: max 30 chars)",
  "headline_variants": ["A/B variant headline 1", "A/B variant headline 2"],
  "primary_text": "Main ad body text - SHORT version (2-3 sentences for Meta, max 90 chars for Google descriptions)",
  "primary_text_variants": ["LONG version body text (4-6 sentences, story-driven or detailed)", "Alternative short version with different angle"],
  "description": "Link description / ad description",
  "cta": "Call to action text that matches the positioning angle",
  "image_prompt": "Detailed AI image generation prompt for the primary visual",
  "image_concept_description": "Brief human-readable description of the visual concept",
  "image_concepts": [
    {"concept": "Visual concept 1 description", "prompt": "Detailed AI generation prompt for concept 1", "style": "photo|illustration|abstract|lifestyle"},
    {"concept": "Visual concept 2 description", "prompt": "Detailed AI generation prompt for concept 2", "style": "photo|illustration|abstract|lifestyle"},
    {"concept": "Visual concept 3 description", "prompt": "Detailed AI generation prompt for concept 3", "style": "photo|illustration|abstract|lifestyle"}
  ],
  "video_script_concept": "15-30 second video script concept with: Hook (0-3s), Problem (3-8s), Solution (8-18s), Proof (18-25s), CTA (25-30s)",
  "google_headlines": ["Headline 1 (max 30 chars)", "Headline 2 (max 30 chars)", "Headline 3 (max 30 chars)"],
  "google_descriptions": ["Description 1 (max 90 chars)", "Description 2 (max 90 chars)"],
  "linkedin_intro_text": "LinkedIn-specific intro text (professional tone, thought leadership angle)",
  "linkedin_headline": "LinkedIn headline (professional, value-driven)",
  "target_audience": "Specific audience segment this ad targets",
  "competitive_angle": "What competitive insight or gap this ad exploits",
  "confidence_score": 0.0 to 1.0
}

## DISTRIBUTION REQUIREMENTS
Generate this mix of 8 ads:
- 3 for Meta (Facebook/Instagram): 2 single_image + 1 carousel or video_script
- 3 for Google: search_ad format with proper character limits
- 2 for LinkedIn: sponsored_content format with professional tone

## CRITICAL RULES
- Each ad MUST use a DIFFERENT positioning angle type — do NOT repeat the same angle across ads
- Each ad MUST use a DIFFERENT copywriting framework — vary the headline approach
- Google headlines MUST be 30 characters or fewer
- Google descriptions MUST be 90 characters or fewer
- Headlines must create genuine curiosity or state a clear benefit — no vague clickbait
- Every CTA must be specific to the angle (not generic "Learn More")
- Image prompts must be detailed enough for AI image generation (style, composition, mood, colors)
- Video scripts must follow the Hook-Problem-Solution-Proof-CTA structure
- Return ONLY a valid JSON array of 8 objects. No markdown, no explanation.`;

    // Build voice and vocabulary instructions
    let voiceInstructions = "";
    if (voiceProfile) {
      voiceInstructions += `\n\nBRAND VOICE PROFILE:\n${JSON.stringify(voiceProfile, null, 2)}`;
    }
    if (brand.voice) {
      voiceInstructions += `\nBrand voice summary: ${brand.voice}`;
    }
    if (vocabularyGuide) {
      const vocab = vocabularyGuide as any;
      if (vocab.words_to_use) {
        voiceInstructions += `\n\nWORDS TO USE (incorporate these into copy):\n${Array.isArray(vocab.words_to_use) ? vocab.words_to_use.join(", ") : JSON.stringify(vocab.words_to_use)}`;
      }
      if (vocab.words_to_avoid) {
        voiceInstructions += `\n\nWORDS TO AVOID (never use these):\n${Array.isArray(vocab.words_to_avoid) ? vocab.words_to_avoid.join(", ") : JSON.stringify(vocab.words_to_avoid)}`;
      }
      if (vocab.phrases_to_use) {
        voiceInstructions += `\n\nPHRASES TO USE:\n${Array.isArray(vocab.phrases_to_use) ? vocab.phrases_to_use.join(", ") : JSON.stringify(vocab.phrases_to_use)}`;
      }
      if (vocab.tone_descriptors) {
        voiceInstructions += `\n\nTONE DESCRIPTORS:\n${Array.isArray(vocab.tone_descriptors) ? vocab.tone_descriptors.join(", ") : JSON.stringify(vocab.tone_descriptors)}`;
      }
    }

    // Build positioning angles context
    let positioningContext = "";
    if (positioningAngles) {
      positioningContext = `\n\nBRAND POSITIONING ANGLES (use these as the foundation for ad concepts):\n${JSON.stringify(positioningAngles, null, 2)}`;
    }

    // Build anti-positioning context
    let antiContext = "";
    if (antiPositioning) {
      antiContext = `\n\nANTI-POSITIONING (what we explicitly do NOT want to say or be associated with):\n${antiPositioning}`;
    }

    // Build competitive intelligence context
    let competitiveContext = "";
    if (analysis) {
      competitiveContext = `\n\nCOMPETITIVE ANALYSIS:\nTitle: ${analysis.title ?? "N/A"}\nSummary: ${analysis.summary ?? "N/A"}`;
      if (analysis.patterns) {
        competitiveContext += `\nPatterns: ${JSON.stringify(analysis.patterns, null, 2)}`;
      }
      if (analysis.opportunities) {
        competitiveContext += `\nOpportunities: ${JSON.stringify(analysis.opportunities, null, 2)}`;
      }
      if (analysis.positioning_gaps) {
        competitiveContext += `\nPositioning Gaps (areas competitors are NOT covering): ${JSON.stringify(analysis.positioning_gaps, null, 2)}`;
      }
      if (analysis.anti_patterns) {
        competitiveContext += `\nAnti-Patterns (what competitors do that we should NOT do): ${JSON.stringify(analysis.anti_patterns, null, 2)}`;
      }
      if (analysis.winning_patterns) {
        competitiveContext += `\nWinning Patterns (proven approaches): ${JSON.stringify(analysis.winning_patterns, null, 2)}`;
      }
      if (analysis.competitor_gap_analysis) {
        competitiveContext += `\nCompetitor Gap Analysis: ${JSON.stringify(analysis.competitor_gap_analysis, null, 2)}`;
      }
      if (analysis.market_sophistication) {
        competitiveContext += `\nMarket Sophistication Assessment: ${JSON.stringify(analysis.market_sophistication, null, 2)}`;
      }
    }

    const userPrompt = `Generate 8 direct-response ad concepts for "${brand.name}".

BRAND DETAILS:
- Name: ${brand.name}
- Industry: ${brand.audience ?? "N/A"}
- Description: ${brand.description ?? "N/A"}
- Target audience: ${brand.audience ?? "N/A"}
- Brand colors: Primary ${brand.primary_color ?? "N/A"}, Accent ${brand.accent_color ?? "N/A"}
- Market sophistication level: ${marketSophLevel}
${voiceInstructions}
${positioningContext}
${antiContext}
${competitiveContext}

${likedCreatives?.length ? `PREVIOUSLY LIKED AD STYLES (the user prefers ads like these — learn from the patterns):\n${JSON.stringify(likedCreatives, null, 2)}` : "No previous creative preferences available."}

IMPORTANT: Generate 8 ads with the exact distribution specified (3 Meta, 3 Google, 2 LinkedIn). Each ad must use a different positioning angle type and copywriting framework. Ensure Google headlines are max 30 chars and descriptions are max 90 chars. Return ONLY a valid JSON array.`;

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

    // Insert all creatives with enhanced fields
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
      image_concepts: creative.image_concepts ?? null,
      video_script_concept: creative.video_script_concept ?? null,
      target_audience: creative.target_audience,
      competitive_angle: creative.competitive_angle,
      confidence_score: creative.confidence_score ?? 0.5,
      positioning_angle_type: creative.positioning_angle_type ?? null,
      positioning_framework: creative.positioning_framework ?? null,
      copywriting_framework: creative.copywriting_framework ?? null,
      schwartz_sophistication_level: creative.schwartz_sophistication_level ?? null,
      psychological_trigger: creative.psychological_trigger ?? null,
      google_headlines: creative.google_headlines ?? null,
      google_descriptions: creative.google_descriptions ?? null,
      linkedin_intro_text: creative.linkedin_intro_text ?? null,
      linkedin_headline: creative.linkedin_headline ?? null,
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
