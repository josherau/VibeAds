import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
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

    const { brand_id, pipeline_run_id } = await req.json();
    if (!brand_id || !pipeline_run_id) {
      return new Response(JSON.stringify({ error: "brand_id and pipeline_run_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    console.log(`Delivering results for brand ${brand_id}, pipeline run ${pipeline_run_id}`);

    // Fetch pipeline run stats
    const { data: pipelineRun, error: runError } = await supabase
      .from("pipeline_runs")
      .select("*")
      .eq("id", pipeline_run_id)
      .single();

    if (runError) throw runError;

    // Fetch brand and user email
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*, profiles(email, full_name)")
      .eq("id", brand_id)
      .single();

    if (brandError) throw brandError;

    const userEmail = brand.profiles?.email;
    const userName = brand.profiles?.full_name ?? "there";

    if (!userEmail) {
      throw new Error("No email found for brand owner");
    }

    // Fetch latest analysis
    const { data: analysis } = await supabase
      .from("competitor_analyses")
      .select("*")
      .eq("brand_id", brand_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch top 3 generated creatives by confidence
    const { data: topCreatives } = await supabase
      .from("generated_creatives")
      .select("*")
      .eq("brand_id", brand_id)
      .order("confidence_score", { ascending: false })
      .limit(3);

    // Build stats from pipeline run
    const metaAdsFound = pipelineRun.meta_ads_found ?? 0;
    const socialPostsFound = pipelineRun.social_posts_found ?? 0;
    const pagesScraped = pipelineRun.pages_scraped ?? 0;
    const creativesGenerated = pipelineRun.creatives_generated ?? 0;

    // Build email HTML
    const opportunitiesHtml = (analysis?.opportunities ?? [])
      .map(
        (opp: any) =>
          `<li style="margin-bottom:8px;"><strong>[${opp.priority?.toUpperCase()}]</strong> ${opp.gap}<br/><em>${opp.suggestion}</em></li>`
      )
      .join("");

    const creativesHtml = (topCreatives ?? [])
      .map(
        (c: any) =>
          `<div style="background:#f8f9fa;padding:16px;border-radius:8px;margin-bottom:12px;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">${c.platform} - ${c.format}</div>
            <div style="font-size:16px;font-weight:bold;margin-bottom:4px;">${c.headline}</div>
            <div style="font-size:14px;color:#374151;margin-bottom:8px;">${c.primary_text?.slice(0, 150)}${(c.primary_text?.length ?? 0) > 150 ? "..." : ""}</div>
            <div style="font-size:12px;color:#6b7280;">Confidence: ${Math.round((c.confidence_score ?? 0) * 100)}% | CTA: ${c.cta}</div>
          </div>`
      )
      .join("");

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#7c3aed;margin-bottom:4px;">VibeAds</h1>
    <p style="color:#6b7280;font-size:14px;">Competitor Intelligence Report</p>
  </div>

  <p>Hi ${userName},</p>
  <p>Your competitor intelligence pipeline just completed for <strong>${brand.name}</strong>. Here's what we found:</p>

  <div style="background:#ede9fe;padding:16px;border-radius:8px;margin:20px 0;">
    <h3 style="margin-top:0;color:#7c3aed;">Pipeline Summary</h3>
    <table style="width:100%;font-size:14px;">
      <tr><td>Meta ads discovered</td><td style="text-align:right;font-weight:bold;">${metaAdsFound}</td></tr>
      <tr><td>Social posts collected</td><td style="text-align:right;font-weight:bold;">${socialPostsFound}</td></tr>
      <tr><td>Landing pages analyzed</td><td style="text-align:right;font-weight:bold;">${pagesScraped}</td></tr>
      <tr><td>New ad creatives generated</td><td style="text-align:right;font-weight:bold;">${creativesGenerated}</td></tr>
    </table>
  </div>

  ${analysis ? `
  <h3>Analysis: ${analysis.title ?? "Competitor Analysis"}</h3>
  <p style="font-size:14px;line-height:1.6;">${analysis.summary?.slice(0, 500) ?? ""}${(analysis.summary?.length ?? 0) > 500 ? "..." : ""}</p>

  ${opportunitiesHtml ? `<h3>Opportunities</h3><ul style="padding-left:20px;">${opportunitiesHtml}</ul>` : ""}
  ` : ""}

  ${creativesHtml ? `<h3>Top Generated Creatives</h3>${creativesHtml}` : ""}

  <div style="text-align:center;margin-top:32px;">
    <a href="${Deno.env.get("APP_URL") ?? "https://vibeads.app"}/dashboard" style="background:#7c3aed;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View Full Report</a>
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
  <p style="font-size:12px;color:#9ca3af;text-align:center;">
    VibeAds - Competitive Intelligence for Modern Brands<br/>
    <a href="${Deno.env.get("APP_URL") ?? "https://vibeads.app"}/settings/notifications" style="color:#9ca3af;">Manage notification preferences</a>
  </p>
</body>
</html>`;

    // Send via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "VibeAds <notifications@vibeads.app>",
        to: [userEmail],
        subject: `VibeAds: ${metaAdsFound} competitor ads found, ${creativesGenerated} new creatives ready`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error(`Resend API error: ${emailRes.status} ${errBody}`);
      throw new Error(`Failed to send email: ${emailRes.status}`);
    }

    const emailResult = await emailRes.json();
    console.log(`Email sent successfully. Resend ID: ${emailResult.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        email_sent_to: userEmail,
        resend_id: emailResult.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("deliver-results error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
