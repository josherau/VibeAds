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

    const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
    if (!metaAccessToken) {
      throw new Error("META_ACCESS_TOKEN not configured");
    }

    // Fetch active competitors with meta_page_id
    const { data: competitors, error: compError } = await supabase
      .from("competitors")
      .select("*")
      .eq("is_active", true)
      .not("meta_page_id", "is", null);

    if (compError) throw compError;

    console.log(`Found ${competitors?.length ?? 0} competitors with Meta page IDs`);

    let totalAdsFound = 0;

    for (const competitor of competitors ?? []) {
      try {
        console.log(`Fetching Meta ads for ${competitor.name} (page: ${competitor.meta_page_id})`);

        let nextCursor: string | null = null;
        let competitorAdsCount = 0;

        do {
          const params = new URLSearchParams({
            search_page_ids: competitor.meta_page_id,
            ad_reached_countries: '["US"]',
            fields: "ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms",
            access_token: metaAccessToken,
            limit: "25",
          });

          if (nextCursor) {
            params.set("after", nextCursor);
          }

          const url = `https://graph.facebook.com/v19.0/ads_archive?${params.toString()}`;
          const response = await fetch(url);

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Meta API error for ${competitor.name}: ${response.status} ${errorBody}`);
            break;
          }

          const data = await response.json();
          const ads = data.data ?? [];

          for (const ad of ads) {
            const adRecord = {
              competitor_id: competitor.id,
              brand_id: competitor.brand_id,
              source: "meta_ad_library",
              platform: (ad.publisher_platforms ?? []).join(", ") || "facebook",
              headline: ad.ad_creative_link_titles?.[0] ?? null,
              body_text: ad.ad_creative_bodies?.[0] ?? null,
              description: ad.ad_creative_link_descriptions?.[0] ?? null,
              caption: ad.ad_creative_link_captions?.[0] ?? null,
              snapshot_url: ad.ad_snapshot_url ?? null,
              started_at: ad.ad_delivery_start_time ?? null,
              stopped_at: ad.ad_delivery_stop_time ?? null,
              external_id: ad.ad_snapshot_url ?? ad.id ?? null,
              raw_data: ad,
              fetched_at: new Date().toISOString(),
            };

            const { error: upsertError } = await supabase
              .from("competitor_ads")
              .upsert(adRecord, { onConflict: "external_id" });

            if (upsertError) {
              console.error(`Error upserting ad: ${upsertError.message}`);
            } else {
              competitorAdsCount++;
            }
          }

          // Handle pagination
          nextCursor = data.paging?.cursors?.after ?? null;
          const hasNextPage = data.paging?.next != null;
          if (!hasNextPage) nextCursor = null;
        } while (nextCursor);

        console.log(`Found ${competitorAdsCount} ads for ${competitor.name}`);
        totalAdsFound += competitorAdsCount;
      } catch (err) {
        console.error(`Error processing competitor ${competitor.name}:`, err);
      }
    }

    console.log(`Total Meta ads found: ${totalAdsFound}`);

    return new Response(
      JSON.stringify({ success: true, ads_found: totalAdsFound }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("research-meta-ads error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
