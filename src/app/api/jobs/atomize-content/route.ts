import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const maxDuration = 120;

async function askClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192
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

export async function POST(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { source_type, source_title, source_content, brand_id } = body;

    if (!source_type || !source_title || !source_content) {
      return NextResponse.json(
        { error: "source_type, source_title, and source_content are required" },
        { status: 400 }
      );
    }

    let brandId = brand_id;
    if (!brandId) {
      const { data: brands } = await authSupabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      brandId = brands?.id;
    }

    if (!brandId) {
      return NextResponse.json(
        { error: "No brand found. Please create a brand first." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch brand details
    const { data: brand } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single();

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const systemPrompt = `You are an expert content strategist who specializes in content atomization — taking one piece of content and transforming it into many platform-optimized pieces.

BRAND VOICE:
Name: ${brand.name}
Description: ${brand.description ?? "N/A"}
Voice: ${brand.voice ?? "N/A"}
Audience: ${brand.audience ?? "N/A"}
Voice Profile: ${brand.voice_profile ? JSON.stringify(brand.voice_profile) : "N/A"}
Positioning Angles: ${brand.positioning_angles ? JSON.stringify(brand.positioning_angles) : "N/A"}
Vocabulary Guide: ${brand.vocabulary_guide ? JSON.stringify(brand.vocabulary_guide) : "N/A"}
Anti-Positioning (avoid these): ${brand.anti_positioning ?? "N/A"}
Market Sophistication Level: ${brand.market_sophistication_level ?? "N/A"}

RULES:
- Every piece of atomized content must match the brand voice
- Adapt content for each platform's best practices and audience expectations
- LinkedIn: professional, thought leadership, 1300 char sweet spot
- Twitter/X: max 280 chars per tweet, punchy, thread-friendly
- Instagram: visual-first, line breaks in captions, up to 30 hashtags
- Facebook: longer form, engagement hooks, story-driven
- Email: compelling subject line, scannable format
- Video scripts: hook in first 3 seconds, clear CTA
- Pull quotes: memorable, shareable, image-worthy
- Carousel: 8-10 slides, one idea per slide, visual hierarchy

IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

    const userPrompt = `Atomize this ${source_type} into 20+ content pieces across all platforms.

SOURCE TITLE: ${source_title}
SOURCE CONTENT:
${source_content.slice(0, 12000)}

Return this exact JSON structure:
{
  "atoms": [
    {
      "platform": "linkedin",
      "type": "post",
      "content": "The post content...",
      "hashtags": ["tag1", "tag2"],
      "media_prompt": "Image description if needed",
      "word_count": 150
    },
    {
      "platform": "twitter",
      "type": "thread",
      "content": "Tweet 1\\n---\\nTweet 2\\n---\\nTweet 3",
      "word_count": 200
    },
    {
      "platform": "twitter",
      "type": "post",
      "content": "A standalone tweet...",
      "word_count": 40
    },
    {
      "platform": "instagram",
      "type": "carousel",
      "slides": [
        {"slide_number": 1, "headline": "...", "body": "..."},
        {"slide_number": 2, "headline": "...", "body": "..."}
      ],
      "caption": "Instagram caption...",
      "hashtags": ["..."],
      "word_count": 300
    },
    {
      "platform": "instagram",
      "type": "post",
      "content": "Instagram caption...",
      "hashtags": ["..."],
      "media_prompt": "Photo/graphic concept...",
      "word_count": 100
    },
    {
      "platform": "facebook",
      "type": "post",
      "content": "Facebook post content...",
      "word_count": 200
    },
    {
      "platform": "all",
      "type": "video_script",
      "content": "Hook (0-3s): ...\\nProblem (3-8s): ...\\nSolution (8-18s): ...\\nProof (18-25s): ...\\nCTA (25-30s): ...",
      "word_count": 150
    },
    {
      "platform": "email",
      "type": "newsletter",
      "subject_line": "...",
      "preview_text": "...",
      "content": "...",
      "word_count": 400
    },
    {
      "platform": "all",
      "type": "pull_quote",
      "content": "The quotable text",
      "media_prompt": "Image background suggestion",
      "word_count": 30
    },
    {
      "platform": "all",
      "type": "blog_summary",
      "content": "A blog-format summary...",
      "word_count": 300
    }
  ],
  "atom_count": 20,
  "source_summary": "Brief summary of what was atomized"
}

Generate at least:
- 3-5 LinkedIn posts (different angles)
- 3-5 Twitter/X posts + 1 thread
- 2-3 Instagram posts + 1 carousel
- 2-3 Facebook posts
- 1 short-form video script
- 1 email newsletter version
- 3-5 pull quotes with image prompts
- 1 blog summary (if source is video/podcast/case study)`;

    const raw = await askClaude(systemPrompt, userPrompt, 16384);

    // Parse JSON from response
    let parsed: {
      atoms: Array<Record<string, unknown>>;
      atom_count: number;
      source_summary: string;
    };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw },
        { status: 500 }
      );
    }

    if (!parsed.atoms || !Array.isArray(parsed.atoms)) {
      return NextResponse.json(
        { error: "Invalid response structure", raw },
        { status: 500 }
      );
    }

    // Save to content_atoms table
    const { data: saved, error: insertError } = await supabase
      .from("content_atoms")
      .insert({
        brand_id: brandId,
        user_id: user.id,
        source_type,
        source_title,
        source_content: source_content.slice(0, 50000),
        atoms: parsed.atoms as unknown as Database["public"]["Tables"]["content_atoms"]["Insert"]["atoms"],
        atom_count: parsed.atom_count ?? parsed.atoms.length,
        source_summary: parsed.source_summary ?? null,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save atoms", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: saved.id,
      atoms: parsed.atoms,
      atom_count: parsed.atom_count ?? parsed.atoms.length,
      source_summary: parsed.source_summary,
    });
  } catch (err) {
    console.error("Content atomization error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
