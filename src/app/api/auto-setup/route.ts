import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface BrandAnalysis {
  brand: {
    name: string;
    description: string;
    voice: string;
    audience: string;
    primary_color: string;
    accent_color: string;
  };
  competitors: Array<{
    name: string;
    website_url: string;
    reason: string;
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
    const { url } = body;

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

    // Step 2: Analyze with Claude
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const analysisPrompt = `You are an expert brand strategist and competitive analyst. Analyze the following website content and extract detailed brand information.

Website URL: ${url}

Website Content:
${websiteContent.substring(0, 15000)}

Based on this website content, provide a comprehensive analysis in the following JSON format. Return ONLY valid JSON with no additional text, markdown formatting, or code blocks.

{
  "brand": {
    "name": "The brand/company name as it appears on the website",
    "description": "A concise 1-2 sentence description of what the company does, its mission, and core offering",
    "voice": "The brand voice style - one of: formal, casual, technical, friendly, authoritative, playful, professional, conversational, inspirational, edgy",
    "audience": "A brief description of the primary target audience (e.g., 'Small business owners aged 25-45 looking for affordable marketing solutions')",
    "primary_color": "The primary brand color as a hex code (e.g., '#1a73e8'). Infer from the website's design if possible, or suggest an appropriate color based on the brand's industry and tone.",
    "accent_color": "A complementary accent color as a hex code that pairs well with the primary color"
  },
  "competitors": [
    {
      "name": "Competitor company name",
      "website_url": "https://www.competitor.com",
      "reason": "Brief explanation of why this is a competitor (e.g., 'Direct competitor offering similar SaaS analytics tools targeting the same SMB market')"
    }
  ],
  "analysis": {
    "tone": "The overall tone of the brand's communication (e.g., 'Inspiring and empowering', 'Authoritative and data-driven', 'Friendly and approachable', 'Playful and witty')",
    "voice_description": "A detailed 2-3 sentence description of how the brand communicates. Include specifics about language style, formality level, use of jargon, emotional appeal, and any distinctive linguistic patterns.",
    "target_customer_profile": "A detailed profile of the ideal customer including demographics (age range, income level, location), psychographics (values, interests, lifestyle), pain points they experience, and what motivates their purchasing decisions.",
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
- For the brand voice, analyze the language used on the website: Is it formal or casual? Technical or accessible? Does it use humor? Is it empathetic?
- For the tone, consider the emotional register: Does it inspire? Educate? Entertain? Reassure?
- For the target customer, look at the language used, the problems addressed, pricing signals, and imagery descriptions to infer who the ideal customer is.
- For competitors, identify 5-8 direct competitors based on the industry, product/service offerings, and market positioning. These should be real companies. Try to provide their actual website URLs.
- For value propositions, identify the key benefits and promises the brand makes to customers.
- For differentiators, identify what makes this brand stand out from the competition.
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
          max_tokens: 4096,
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

    // Upsert the brand record
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .upsert(
        {
          user_id: user.id,
          name: analysis.brand.name,
          description: analysis.brand.description,
          voice: analysis.brand.voice,
          audience: analysis.brand.audience,
          primary_color: analysis.brand.primary_color,
          accent_color: analysis.brand.accent_color,
          website_url: url,
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (brandError) {
      console.error("Brand upsert error:", brandError);
      return NextResponse.json(
        { error: "Failed to save brand data" },
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

    return NextResponse.json({
      brand,
      competitors: competitors || [],
      analysis: analysis.analysis,
    });
  } catch (error) {
    console.error("Auto-setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
