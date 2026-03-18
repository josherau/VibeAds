import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface VoiceProfile {
  summary: string;
  personality_traits: Array<{
    name: string;
    description: string;
  }>;
  tone_dimensions: {
    formal_casual: number;
    serious_playful: number;
    technical_accessible: number;
    reserved_enthusiastic: number;
  };
  vocabulary: {
    use: string[];
    avoid: string[];
  };
}

interface PositioningAngle {
  name: string;
  type: string;
  hook: string;
  headline_directions: string[];
  psychology: string;
  confidence_score: number;
}

interface BrandAnalysis {
  brand: {
    name: string;
    description: string;
    voice: string;
    audience: string;
    primary_color: string;
    accent_color: string;
  };
  voice_profile: VoiceProfile;
  positioning_angles: PositioningAngle[];
  market_sophistication_level: number;
  market_sophistication_reasoning: string;
  anti_positioning: string;
  competitors: Array<{
    name: string;
    website_url: string;
    reason: string;
    competitive_gap: string;
    positioning_comparison: string;
  }>;
  analysis: {
    tone: string;
    voice_description: string;
    target_customer_profile: string;
    value_propositions: string[];
    differentiators: string[];
  };
}

export async function POST(request: Request) {
  try {
    // Authenticate the user via Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { url, mode } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Step 1: Scrape the website with Firecrawl
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlApiKey) {
      return NextResponse.json(
        { error: "Firecrawl API key not configured" },
        { status: 500 }
      );
    }

    const scrapeResponse = await fetch(
      "https://api.firecrawl.dev/v1/scrape",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
        }),
      }
    );

    if (!scrapeResponse.ok) {
      const scrapeError = await scrapeResponse.text();
      console.error("Firecrawl error:", scrapeError);
      return NextResponse.json(
        { error: "Failed to scrape website. Please check the URL and try again." },
        { status: 502 }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const websiteContent = scrapeData?.data?.markdown;

    if (!websiteContent) {
      return NextResponse.json(
        { error: "No content could be extracted from the website" },
        { status: 422 }
      );
    }

    // Step 2: Analyze with Claude using Vibe Marketing Playbook methodology
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const analysisPrompt = `You are an elite brand strategist who follows the Vibe Marketing Playbook methodology. You specialize in Eugene Schwartz's market sophistication framework, positioning psychology, and brand voice architecture.

Analyze the following website content and produce a deep brand analysis.

Website URL: ${url}

Website Content:
${websiteContent.substring(0, 15000)}

Based on this website content, provide a comprehensive Vibe Marketing analysis in the following JSON format. Return ONLY valid JSON with no additional text, markdown formatting, or code blocks.

{
  "brand": {
    "name": "The brand/company name as it appears on the website",
    "description": "A concise 1-2 sentence description of what the company does, its mission, and core offering",
    "voice": "The brand voice style - one of: formal, casual, technical, friendly, authoritative, playful, professional, conversational, inspirational, edgy",
    "audience": "A brief description of the primary target audience (e.g., 'Small business owners aged 25-45 looking for affordable marketing solutions')",
    "primary_color": "The primary brand color as a hex code (e.g., '#1a73e8'). Infer from the website's design if possible, or suggest an appropriate color based on the brand's industry and tone.",
    "accent_color": "A complementary accent color as a hex code that pairs well with the primary color"
  },
  "voice_profile": {
    "summary": "A 2-3 sentence description of how this brand sounds. Be specific — reference actual language patterns, sentence structures, and emotional register you observed on the website. Example: 'Speaks like a confident friend who happens to be an expert. Uses short, punchy sentences mixed with data. Never talks down to the reader but doesn't oversimplify either.'",
    "personality_traits": [
      {
        "name": "Trait Name (e.g., 'Confidently Boring')",
        "description": "What this trait means for the brand's communication (e.g., 'Leans into the unsexy fundamentals rather than chasing trends. Says things like we just do the basics really well.')"
      }
    ],
    "tone_dimensions": {
      "formal_casual": 7,
      "serious_playful": 4,
      "technical_accessible": 6,
      "reserved_enthusiastic": 5
    },
    "vocabulary": {
      "use": ["words and phrases that match this brand's voice — be specific, include actual phrases from the site and ones that fit the pattern"],
      "avoid": ["words and phrases that would feel off-brand — be specific about what would clash with the voice"]
    }
  },
  "positioning_angles": [
    {
      "name": "A short name for this angle (e.g., 'The Contrarian', 'The Quiet Expert')",
      "type": "One of: contrarian, unique_mechanism, transformation, enemy, speed_ease, specificity, social_proof, risk_reversal",
      "hook": "The one-liner positioning statement (e.g., 'AI marketing for the industries the cool agencies ignore')",
      "headline_directions": [
        "First headline idea using this angle",
        "Second headline idea",
        "Third headline idea"
      ],
      "psychology": "Why this angle works for this specific brand and audience — reference the psychological principle at play",
      "confidence_score": 8
    }
  ],
  "market_sophistication_level": 3,
  "market_sophistication_reasoning": "A 2-3 sentence explanation of why this brand sits at this level of Schwartz's 5 stages. Stage 1: First to market (simple claims work). Stage 2: Second to market (bigger claims needed). Stage 3: Market aware (unique mechanism required). Stage 4: Sophisticated market (system/methodology positioning). Stage 5: Skeptical market (identity-driven, 'people like us do things like this').",
  "anti_positioning": "A clear statement of what this brand is NOT and what it stands against. Frame as 'We are not X. We don't believe in Y. While others Z, we...' — this creates clarity by contrast.",
  "competitors": [
    {
      "name": "Competitor company name",
      "website_url": "https://www.competitor.com",
      "reason": "Brief explanation of why this is a competitor",
      "competitive_gap": "What opportunity or weakness this competitor leaves open that the analyzed brand can exploit",
      "positioning_comparison": "How this competitor positions themselves vs how the analyzed brand should position differently"
    }
  ],
  "analysis": {
    "tone": "The overall tone of the brand's communication (e.g., 'Inspiring and empowering', 'Authoritative and data-driven')",
    "voice_description": "A detailed 2-3 sentence description of how the brand communicates. Include specifics about language style, formality level, use of jargon, emotional appeal, and any distinctive linguistic patterns.",
    "target_customer_profile": "A detailed profile of the ideal customer including demographics, psychographics, pain points, and purchasing motivations.",
    "value_propositions": [
      "First key value proposition the brand offers",
      "Second key value proposition",
      "Third key value proposition"
    ],
    "differentiators": [
      "First thing that makes this brand unique compared to competitors",
      "Second differentiator",
      "Third differentiator"
    ]
  }
}

Important instructions:
- For voice_profile.personality_traits, provide exactly 4-5 traits. Each should be distinctive and memorable — avoid generic traits like "professional" or "friendly". Think more like "Confidently Boring" or "Aggressively Helpful".
- For tone_dimensions, use a 1-10 scale where 1 is the first word and 10 is the second (e.g., formal_casual: 1 = very formal, 10 = very casual).
- For vocabulary.use, provide 8-12 specific words/phrases. Include both single words and multi-word phrases.
- For vocabulary.avoid, provide 6-10 specific words/phrases that would feel off-brand.
- For positioning_angles, provide 3-5 angles. At least one should be "contrarian" type. Each confidence_score should be 1-10.
- For market_sophistication_level, carefully assess which of Schwartz's 5 stages the market is at — this determines the entire ad strategy.
- For anti_positioning, be bold and specific. Vague anti-positioning is useless.
- For competitors, identify 5-8 real companies with actual website URLs. Include competitive_gap and positioning_comparison for each.
- Return ONLY the JSON object. No explanations, no markdown, no code fences.`;

    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: analysisPrompt,
            },
          ],
        }),
      }
    );

    if (!claudeResponse.ok) {
      const claudeError = await claudeResponse.text();
      console.error("Anthropic API error:", claudeError);
      return NextResponse.json(
        { error: "Failed to analyze website content" },
        { status: 502 }
      );
    }

    const claudeData = await claudeResponse.json();
    const analysisText = claudeData?.content?.[0]?.text;

    if (!analysisText) {
      return NextResponse.json(
        { error: "No analysis could be generated" },
        { status: 422 }
      );
    }

    // Parse the JSON response from Claude
    let analysis: BrandAnalysis;
    try {
      // Try to extract JSON if Claude wrapped it in code fences
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", analysisText);
      return NextResponse.json(
        { error: "Failed to parse analysis results" },
        { status: 500 }
      );
    }

    // Step 3: Save to Supabase using service role client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Build brand data
    const brandData = {
      user_id: user.id,
      name: analysis.brand.name,
      description: analysis.brand.description,
      voice: analysis.brand.voice,
      audience: analysis.brand.audience,
      primary_color: analysis.brand.primary_color,
      accent_color: analysis.brand.accent_color,
      url,
      voice_profile: analysis.voice_profile as unknown as Record<string, unknown>,
      positioning_angles: analysis.positioning_angles as unknown as Record<string, unknown>[],
      vocabulary_guide: (analysis.voice_profile?.vocabulary || null) as unknown as Record<string, unknown>,
      anti_positioning: analysis.anti_positioning,
      market_sophistication_level: analysis.market_sophistication_level,
    };

    let brand;
    let brandError;

    if (mode === "new") {
      // Always create a new brand
      const result = await supabase
        .from("brands")
        .insert(brandData)
        .select()
        .single();
      brand = result.data;
      brandError = result.error;
    } else {
      // Legacy behavior: check if brand already exists for this user with same URL
      const { data: existingBrand } = await supabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .eq("url", url)
        .limit(1)
        .single();

      if (existingBrand) {
        // Update existing brand
        const result = await supabase
          .from("brands")
          .update(brandData)
          .eq("id", existingBrand.id)
          .select()
          .single();
        brand = result.data;
        brandError = result.error;
      } else {
        // Insert new brand
        const result = await supabase
          .from("brands")
          .insert(brandData)
          .select()
          .single();
        brand = result.data;
        brandError = result.error;
      }
    }

    if (brandError || !brand) {
      console.error("Brand save error:", brandError);
      return NextResponse.json(
        { error: `Failed to save brand data: ${brandError?.message || "unknown error"}`, details: brandError },
        { status: 500 }
      );
    }

    // Create competitor records
    const competitorRecords = analysis.competitors.map((competitor) => ({
      brand_id: brand.id,
      user_id: user.id,
      name: competitor.name,
      website_url: competitor.website_url || null,
      notes: competitor.reason || null,
    }));

    // Delete existing competitors for this brand before inserting new ones
    await supabase
      .from("competitors")
      .delete()
      .eq("brand_id", brand.id);

    const { data: competitors, error: competitorsError } = await supabase
      .from("competitors")
      .insert(competitorRecords)
      .select();

    if (competitorsError) {
      console.error("Competitors insert error:", competitorsError);
      // Don't fail the whole request if competitors fail
    }

    // Auto-enrich competitors with social accounts (fire and forget - don't block response)
    if (competitors && competitors.length > 0) {
      const competitorIds = competitors.map((c: any) => c.id);
      // Call our own enrich endpoint asynchronously
      const baseUrl = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
      if (baseUrl) {
        fetch(`${baseUrl}/api/competitors/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitor_ids: competitorIds }),
        }).catch((err) => {
          console.error("Auto-enrich failed (non-blocking):", err);
        });
      }
    }

    return NextResponse.json({
      brand,
      competitors: competitors || [],
      analysis: analysis.analysis,
      voice_profile: analysis.voice_profile,
      positioning_angles: analysis.positioning_angles,
      market_sophistication_level: analysis.market_sophistication_level,
      market_sophistication_reasoning: analysis.market_sophistication_reasoning,
      anti_positioning: analysis.anti_positioning,
      competitor_details: analysis.competitors,
    });
  } catch (error) {
    console.error("Auto-setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
