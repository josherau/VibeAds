import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  authHeader: string
): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
  console.log(`Calling edge function: ${functionName}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${functionName} failed (${res.status}): ${errBody}`);
  }

  return await res.json();
}

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

    let brandIds: string[] = [];

    try {
      const body = await req.json();
      if (body.brand_id) {
        brandIds = [body.brand_id];
      }
    } catch {
      // No body or invalid JSON - run for all active brands
    }

    // If no specific brand, get all active brands
    if (brandIds.length === 0) {
      const { data: brands, error } = await supabase
        .from("brands")
        .select("id")
        .eq("is_active", true);

      if (error) throw error;
      brandIds = (brands ?? []).map((b) => b.id);
    }

    if (brandIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active brands found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Running pipeline for ${brandIds.length} brand(s): ${brandIds.join(", ")}`);

    const results: any[] = [];

    for (const brandId of brandIds) {
      const startTime = Date.now();

      // Create pipeline run record
      const { data: pipelineRun, error: runError } = await supabase
        .from("pipeline_runs")
        .insert({
          brand_id: brandId,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (runError) {
        console.error(`Failed to create pipeline run for brand ${brandId}:`, runError);
        continue;
      }

      const pipelineRunId = pipelineRun.id;
      const stepResults: Record<string, any> = {};
      let pipelineError: string | null = null;

      try {
        // Step 1: Research Meta Ads
        console.log(`[${brandId}] Step 1/6: Research Meta Ads`);
        try {
          const metaResult = await callEdgeFunction("research-meta-ads", {}, authHeader);
          stepResults.meta_ads = metaResult;
          await supabase
            .from("pipeline_runs")
            .update({ meta_ads_found: metaResult.ads_found ?? 0 })
            .eq("id", pipelineRunId);
        } catch (err) {
          console.error(`[${brandId}] Meta ads research failed:`, err);
          stepResults.meta_ads = { error: err.message };
        }

        // Step 2: Research Social
        console.log(`[${brandId}] Step 2/6: Research Social`);
        try {
          const socialResult = await callEdgeFunction("research-social", {}, authHeader);
          stepResults.social = socialResult;
          await supabase
            .from("pipeline_runs")
            .update({ social_posts_found: socialResult.total ?? 0 })
            .eq("id", pipelineRunId);
        } catch (err) {
          console.error(`[${brandId}] Social research failed:`, err);
          stepResults.social = { error: err.message };
        }

        // Step 3: Research Landing Pages
        console.log(`[${brandId}] Step 3/6: Research Landing Pages`);
        try {
          const landingResult = await callEdgeFunction("research-landing-pages", {}, authHeader);
          stepResults.landing_pages = landingResult;
          await supabase
            .from("pipeline_runs")
            .update({ pages_scraped: landingResult.pages_scraped ?? 0 })
            .eq("id", pipelineRunId);
        } catch (err) {
          console.error(`[${brandId}] Landing page research failed:`, err);
          stepResults.landing_pages = { error: err.message };
        }

        // Step 4: Analyze Competitors
        console.log(`[${brandId}] Step 4/6: Analyze Competitors`);
        let analysisId: string | null = null;
        try {
          const analysisResult = await callEdgeFunction(
            "analyze-competitors",
            { brand_id: brandId },
            authHeader
          );
          stepResults.analysis = analysisResult;
          analysisId = analysisResult.analysis_id ?? null;
        } catch (err) {
          console.error(`[${brandId}] Analysis failed:`, err);
          stepResults.analysis = { error: err.message };
        }

        // Step 5: Generate Ads (requires analysis_id from step 4)
        console.log(`[${brandId}] Step 5/6: Generate Ads`);
        if (analysisId) {
          try {
            const generateResult = await callEdgeFunction(
              "generate-ads",
              { brand_id: brandId, analysis_id: analysisId },
              authHeader
            );
            stepResults.generate = generateResult;
            await supabase
              .from("pipeline_runs")
              .update({ creatives_generated: generateResult.creatives_generated ?? 0 })
              .eq("id", pipelineRunId);
          } catch (err) {
            console.error(`[${brandId}] Ad generation failed:`, err);
            stepResults.generate = { error: err.message };
          }
        } else {
          console.log(`[${brandId}] Skipping ad generation - no analysis available`);
          stepResults.generate = { skipped: true, reason: "No analysis_id available" };
        }

        // Step 6: Deliver Results
        console.log(`[${brandId}] Step 6/6: Deliver Results`);
        try {
          const deliverResult = await callEdgeFunction(
            "deliver-results",
            { brand_id: brandId, pipeline_run_id: pipelineRunId },
            authHeader
          );
          stepResults.deliver = deliverResult;
        } catch (err) {
          console.error(`[${brandId}] Delivery failed:`, err);
          stepResults.deliver = { error: err.message };
        }

        // Mark pipeline as completed
        const durationMs = Date.now() - startTime;
        await supabase
          .from("pipeline_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            duration_ms: durationMs,
            step_results: stepResults,
          })
          .eq("id", pipelineRunId);

        console.log(`[${brandId}] Pipeline completed in ${durationMs}ms`);
        results.push({ brand_id: brandId, pipeline_run_id: pipelineRunId, status: "completed", duration_ms: durationMs, steps: stepResults });
      } catch (err) {
        pipelineError = err.message;
        console.error(`[${brandId}] Pipeline failed:`, err);

        const durationMs = Date.now() - startTime;
        await supabase
          .from("pipeline_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: durationMs,
            error_log: pipelineError,
            step_results: stepResults,
          })
          .eq("id", pipelineRunId);

        results.push({ brand_id: brandId, pipeline_run_id: pipelineRunId, status: "failed", error: pipelineError, duration_ms: durationMs });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-pipeline error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
