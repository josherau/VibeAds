"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Megaphone,
  Eye,
  Clock,
  TrendingUp,
  BarChart3,
  Sparkles,
  ArrowRight,
  Users,
  Zap,
  Target,
  Activity,
  Globe,
  Lightbulb,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Video,
  Layout,
  Type,
  Search,
  Shield,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  subDays,
  differenceInDays,
} from "date-fns";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database, Json } from "@/lib/supabase/types";

// ── Types ──────────────────────────────────────────────────────

type CompetitorAd = Database["public"]["Tables"]["competitor_ads"]["Row"];
type Competitor = Database["public"]["Tables"]["competitors"]["Row"];
type Analysis = Database["public"]["Tables"]["competitor_analyses"]["Row"];

interface AdWithCompetitor extends CompetitorAd {
  competitor_name?: string;
}

interface TopPerformingAd {
  competitor: string;
  headline: string;
  body_preview: string;
  source: string;
  why_it_works: string;
  replication_blueprint: string;
}

interface AdCopyPatterns {
  hooks?: string[];
  ctas?: string[];
  emotional_triggers?: string[];
  headline_formulas?: string[];
}

interface CreativeAnalysis {
  ad_types_breakdown?: { type: string; count: number; percentage: number }[];
  visual_patterns?: string[];
  media_usage_trends?: string[];
}

interface CompetitivePositioning {
  competitor: string;
  positioning_summary: string;
  key_claims?: string[];
  tone?: string;
  target_audience_signals?: string;
}

interface ContentOpportunity {
  concept: string;
  rationale: string;
  headline_draft: string;
  body_draft: string;
  cta_draft: string;
  platform: string;
  priority: "high" | "medium" | "low";
}

interface SpendIndicators {
  active_vs_inactive_ratio?: string;
  avg_ad_lifespan_days?: number;
  high_frequency_advertisers?: string[];
  signals?: string[];
}

interface AdIntelligenceAnalysis {
  top_performing_ads?: TopPerformingAd[];
  ad_copy_patterns?: AdCopyPatterns;
  creative_analysis?: CreativeAnalysis;
  competitive_positioning?: CompetitivePositioning[];
  content_opportunities?: ContentOpportunity[];
  spend_indicators?: SpendIndicators;
  recommendations?: string[];
}

// ── Helpers ────────────────────────────────────────────────────

const TIME_PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "all", label: "All time" },
];

function formatNumber(num: number | null | undefined): string {
  if (num == null) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function getPlatformBadge(source: string) {
  const s = source?.toLowerCase() ?? "";
  if (s.includes("meta") || s.includes("facebook"))
    return { label: "Meta", className: "bg-blue-500/20 text-blue-400" };
  if (s.includes("google"))
    return { label: "Google", className: "bg-green-500/20 text-green-400" };
  if (s.includes("instagram"))
    return { label: "Instagram", className: "bg-pink-500/20 text-pink-400" };
  if (s.includes("twitter") || s.includes("x"))
    return { label: "X/Twitter", className: "bg-gray-500/20 text-gray-400" };
  if (s.includes("linkedin"))
    return {
      label: "LinkedIn",
      className: "bg-sky-500/20 text-sky-400",
    };
  return { label: source, className: "bg-purple-500/20 text-purple-400" };
}

function getAdTypeIcon(adType: string | null) {
  switch (adType?.toLowerCase()) {
    case "video":
      return Video;
    case "carousel":
      return Layout;
    case "image":
      return ImageIcon;
    default:
      return Type;
  }
}

function priorityColor(priority: string | undefined) {
  switch (priority) {
    case "high":
      return "bg-red-500/20 text-red-400";
    case "medium":
      return "bg-amber-500/20 text-amber-400";
    case "low":
      return "bg-green-500/20 text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ── Component ──────────────────────────────────────────────────

export default function AdIntelligencePage() {
  const supabase = createClient();
  const { selectedBrand } = useBrand();
  const brandId = selectedBrand?.id;

  const [ads, setAds] = useState<AdWithCompetitor[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [analysis, setAnalysis] = useState<AdIntelligenceAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState("90");
  const [platformFilter, setPlatformFilter] = useState("all");

  // ── Data fetching ────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);

    try {
      // Fetch competitors
      const { data: compData } = await supabase
        .from("competitors")
        .select("*")
        .eq("brand_id", brandId)
        .eq("is_active", true);

      const comps = compData ?? [];
      setCompetitors(comps);

      if (comps.length === 0) {
        setAds([]);
        setAnalysis(null);
        setLoading(false);
        return;
      }

      const compIds = comps.map((c) => c.id);
      const compLookup: Record<string, string> = {};
      for (const c of comps) {
        compLookup[c.id] = c.name;
      }

      // Fetch ads
      let query = supabase
        .from("competitor_ads")
        .select("*")
        .in("competitor_id", compIds)
        .order("first_seen_at", { ascending: false })
        .limit(500);

      if (timePeriod !== "all") {
        const cutoff = subDays(new Date(), parseInt(timePeriod)).toISOString();
        query = query.gte("first_seen_at", cutoff);
      }

      const { data: adData } = await query;

      const enrichedAds: AdWithCompetitor[] = (adData ?? []).map((ad) => ({
        ...ad,
        competitor_name: compLookup[ad.competitor_id] ?? "Unknown",
      }));

      setAds(enrichedAds);

      // Fetch latest ad_intelligence analysis
      const { data: analyses } = await supabase
        .from("competitor_analyses")
        .select("*")
        .eq("brand_id", brandId)
        .eq("analysis_type", "ad_intelligence")
        .order("created_at", { ascending: false })
        .limit(1);

      if (analyses && analyses.length > 0) {
        const rec = analyses[0].recommendations;
        if (rec && typeof rec === "object" && !Array.isArray(rec)) {
          setAnalysis(rec as unknown as AdIntelligenceAnalysis);
        }
      }
    } catch (err) {
      console.error("Failed to fetch ad intelligence data:", err);
      toast.error("Failed to load ad intelligence data");
    } finally {
      setLoading(false);
    }
  }, [brandId, supabase, timePeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Refresh handler ──────────────────────────────────────────

  const handleRefresh = useCallback(async (force = false) => {
    if (!brandId || refreshing) return;
    setRefreshing(true);
    toast.info(force
      ? "Force refreshing all competitor ads..."
      : "Updating ads (skipping recently scraped competitors)..."
    );

    try {
      const res = await fetch("/api/jobs/ad-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, force }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ad scrape failed");
      }

      const skippedMsg = data.competitors_skipped
        ? ` (${data.competitors_skipped} skipped — recently scraped)`
        : "";
      toast.success(
        `Ad scrape complete! Found ${data.total_ads ?? 0} ads across ${data.competitors_processed ?? 0} competitors.${skippedMsg}`
      );
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ad scrape failed";
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  }, [brandId, refreshing, fetchData]);

  // ── Computed values ──────────────────────────────────────────

  const filteredAds = useMemo(() => {
    if (platformFilter === "all") return ads;
    return ads.filter((ad) => {
      const s = ad.source?.toLowerCase() ?? "";
      if (platformFilter === "meta")
        return s.includes("meta") || s.includes("facebook");
      if (platformFilter === "google") return s.includes("google");
      return s.includes(platformFilter);
    });
  }, [ads, platformFilter]);

  const stats = useMemo(() => {
    const activeAds = ads.filter((a) => a.is_active);
    const lifespans = ads
      .filter((a) => a.first_seen_at && a.last_seen_at)
      .map((a) =>
        differenceInDays(
          new Date(a.last_seen_at!),
          new Date(a.first_seen_at!)
        )
      )
      .filter((d) => d >= 0);

    const avgLifespan =
      lifespans.length > 0
        ? Math.round(lifespans.reduce((s, d) => s + d, 0) / lifespans.length)
        : 0;

    const uniqueCompetitors = new Set(ads.map((a) => a.competitor_id)).size;

    const sources = new Set(ads.map((a) => a.source));

    return {
      total: ads.length,
      active: activeAds.length,
      avgLifespan,
      competitorsTracked: uniqueCompetitors,
      sources: Array.from(sources),
    };
  }, [ads]);

  // ── Loading / empty states ───────────────────────────────────

  if (!brandId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">
          Select a business to view ad intelligence.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Ad Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deep analysis of competitor advertising across Meta, Google, and
            more.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timePeriod} onValueChange={(val) => { if (val) setTimePeriod(val); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_PERIODS.map((tp) => (
                <SelectItem key={tp.value} value={tp.value}>
                  {tp.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => handleRefresh(false)}
            disabled={refreshing}
            size="sm"
            className="gap-2"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {refreshing ? "Scraping..." : "Update"}
          </Button>
          <Button
            onClick={() => handleRefresh(true)}
            disabled={refreshing}
            size="sm"
            variant="outline"
            className="gap-2"
            title="Re-scrape all competitors, even recently scraped ones"
          >
            Force Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatNumber(stats.total)}</p>
                <p className="text-xs text-muted-foreground">Total Ads Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Activity className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatNumber(stats.active)}</p>
                <p className="text-xs text-muted-foreground">Active Ads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats.avgLifespan}
                  <span className="text-sm font-normal text-muted-foreground ml-1">days</span>
                </p>
                <p className="text-xs text-muted-foreground">Avg Ad Lifespan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Users className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats.competitorsTracked}
                </p>
                <p className="text-xs text-muted-foreground">Competitors Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ads.length === 0 && !analysis ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No ads tracked yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Click &ldquo;Refresh&rdquo; to scrape competitor ads from Meta Ad
              Library and Google Ads Transparency. Meta Page IDs will be
              automatically discovered for your competitors.
            </p>
            <Button onClick={() => handleRefresh(false)} disabled={refreshing} className="gap-2">
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Scrape Competitor Ads
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Ad Gallery */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Ad Gallery
                  </CardTitle>
                  <CardDescription>
                    {filteredAds.length} ads across {stats.sources.length} platform
                    {stats.sources.length !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
                <Tabs
                  value={platformFilter}
                  onValueChange={setPlatformFilter}
                  className="w-auto"
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs px-3">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="meta" className="text-xs px-3">
                      Meta
                    </TabsTrigger>
                    <TabsTrigger value="google" className="text-xs px-3">
                      Google
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAds.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No ads found for this platform filter.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAds.slice(0, 24).map((ad) => {
                    const platform = getPlatformBadge(ad.source);
                    const AdTypeIcon = getAdTypeIcon(ad.ad_type);

                    return (
                      <div
                        key={ad.id}
                        className="rounded-lg border border-border bg-accent/30 p-4 space-y-3 hover:bg-accent/50 transition-colors"
                      >
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${platform.className}`}
                            >
                              {platform.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${
                                ad.is_active
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {ad.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <AdTypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </div>

                        {/* Competitor name */}
                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                          {ad.competitor_name}
                        </p>

                        {/* Ad creative image/video */}
                        {ad.media_urls && (ad.media_urls as string[]).length > 0 && (
                          <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={(ad.media_urls as string[])[0]}
                              alt={ad.headline ?? "Ad creative"}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                            {(ad.media_urls as string[]).length > 1 && (
                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                                +{(ad.media_urls as string[]).length - 1} more
                              </div>
                            )}
                          </div>
                        )}

                        {/* Headline */}
                        {ad.headline && (
                          <p className="text-sm font-semibold leading-tight line-clamp-2">
                            {ad.headline}
                          </p>
                        )}

                        {/* Body preview */}
                        {ad.body_text && (
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {ad.body_text}
                          </p>
                        )}

                        {/* CTA */}
                        {ad.cta_text && (
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-3 w-3 text-primary" />
                            <span className="text-xs font-medium text-primary">
                              {ad.cta_text}
                            </span>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground">
                            {ad.first_seen_at
                              ? `First seen ${formatDistanceToNow(new Date(ad.first_seen_at), { addSuffix: true })}`
                              : "Unknown date"}
                          </span>
                          {ad.landing_page_url && (
                            <a
                              href={ad.landing_page_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {filteredAds.length > 24 && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Showing 24 of {filteredAds.length} ads
                </p>
              )}
            </CardContent>
          </Card>

          {/* AI Analysis Sections */}
          {analysis && (
            <>
              {/* Top Performing Ads */}
              {analysis.top_performing_ads &&
                analysis.top_performing_ads.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-400" />
                        Top Performing Ads
                      </CardTitle>
                      <CardDescription>
                        Ads that appear most effective based on longevity,
                        positioning clarity, and copy quality
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {analysis.top_performing_ads.map((ad, i) => {
                        const platform = getPlatformBadge(ad.source);
                        return (
                          <div
                            key={i}
                            className="rounded-lg border border-border bg-accent/20 p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    {ad.competitor}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${platform.className}`}
                                  >
                                    {platform.label}
                                  </Badge>
                                </div>
                                {ad.headline && (
                                  <p className="font-semibold text-sm">
                                    {ad.headline}
                                  </p>
                                )}
                                {ad.body_preview && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {ad.body_preview}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-md bg-green-500/5 border border-green-500/20 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400 mb-1">
                                  Why It Works
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {ad.why_it_works}
                                </p>
                              </div>
                              <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
                                  Replication Blueprint
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {ad.replication_blueprint}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

              {/* Ad Copy Patterns */}
              {analysis.ad_copy_patterns && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Copy className="h-5 w-5 text-amber-400" />
                      Ad Copy Patterns
                    </CardTitle>
                    <CardDescription>
                      Common hooks, CTAs, emotional triggers, and headline
                      formulas used across competitor ads
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {analysis.ad_copy_patterns.hooks &&
                        analysis.ad_copy_patterns.hooks.length > 0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">
                              Opening Hooks
                            </p>
                            <ul className="space-y-2">
                              {analysis.ad_copy_patterns.hooks.map(
                                (hook, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <span className="text-amber-400 mt-0.5 shrink-0">
                                      &bull;
                                    </span>
                                    {hook}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                      {analysis.ad_copy_patterns.ctas &&
                        analysis.ad_copy_patterns.ctas.length > 0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-3">
                              Call-to-Action Patterns
                            </p>
                            <ul className="space-y-2">
                              {analysis.ad_copy_patterns.ctas.map((cta, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-muted-foreground flex items-start gap-2"
                                >
                                  <ArrowRight className="h-3 w-3 text-green-400 mt-1 shrink-0" />
                                  {cta}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {analysis.ad_copy_patterns.emotional_triggers &&
                        analysis.ad_copy_patterns.emotional_triggers.length >
                          0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-3">
                              Emotional Triggers
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {analysis.ad_copy_patterns.emotional_triggers.map(
                                (trigger, i) => (
                                  <Badge
                                    key={i}
                                    variant="outline"
                                    className="bg-red-500/10 text-red-400 text-xs"
                                  >
                                    {trigger}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {analysis.ad_copy_patterns.headline_formulas &&
                        analysis.ad_copy_patterns.headline_formulas.length >
                          0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-purple-400 mb-3">
                              Headline Formulas
                            </p>
                            <ul className="space-y-2">
                              {analysis.ad_copy_patterns.headline_formulas.map(
                                (formula, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <Zap className="h-3 w-3 text-purple-400 mt-1 shrink-0" />
                                    {formula}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Creative Analysis */}
              {analysis.creative_analysis && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-sky-400" />
                      Creative Analysis
                    </CardTitle>
                    <CardDescription>
                      Ad type breakdown, visual patterns, and media usage trends
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {/* Ad Types Breakdown */}
                      {analysis.creative_analysis.ad_types_breakdown &&
                        analysis.creative_analysis.ad_types_breakdown.length >
                          0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-3">
                              Ad Type Breakdown
                            </p>
                            <div className="space-y-3">
                              {analysis.creative_analysis.ad_types_breakdown.map(
                                (item, i) => (
                                  <div key={i}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="font-medium capitalize">
                                        {item.type}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {item.count} ({item.percentage}%)
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-sky-400 rounded-full transition-all"
                                        style={{
                                          width: `${Math.min(item.percentage, 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Visual Patterns */}
                      {analysis.creative_analysis.visual_patterns &&
                        analysis.creative_analysis.visual_patterns.length >
                          0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-3">
                              Visual Patterns
                            </p>
                            <ul className="space-y-2">
                              {analysis.creative_analysis.visual_patterns.map(
                                (pattern, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <Eye className="h-3 w-3 text-sky-400 mt-1 shrink-0" />
                                    {pattern}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                      {/* Media Usage Trends */}
                      {analysis.creative_analysis.media_usage_trends &&
                        analysis.creative_analysis.media_usage_trends.length >
                          0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-3">
                              Media Usage Trends
                            </p>
                            <ul className="space-y-2">
                              {analysis.creative_analysis.media_usage_trends.map(
                                (trend, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <TrendingUp className="h-3 w-3 text-sky-400 mt-1 shrink-0" />
                                    {trend}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Competitive Positioning */}
              {analysis.competitive_positioning &&
                analysis.competitive_positioning.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-400" />
                        Competitive Positioning
                      </CardTitle>
                      <CardDescription>
                        How each competitor positions their product/service in
                        their advertising
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {analysis.competitive_positioning.map((cp, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-border bg-accent/20 p-4 space-y-3"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/20 text-xs font-bold text-indigo-400">
                                {cp.competitor?.charAt(0).toUpperCase() ?? "?"}
                              </div>
                              <p className="font-semibold text-sm">
                                {cp.competitor}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {cp.positioning_summary}
                            </p>
                            {cp.key_claims && cp.key_claims.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                  Key Claims
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {cp.key_claims.map((claim, j) => (
                                    <Badge
                                      key={j}
                                      variant="outline"
                                      className="text-[10px] bg-indigo-500/10 text-indigo-400"
                                    >
                                      {claim}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {cp.tone && (
                              <p className="text-[10px] text-muted-foreground">
                                <span className="font-semibold uppercase tracking-wider">
                                  Tone:
                                </span>{" "}
                                {cp.tone}
                              </p>
                            )}
                            {cp.target_audience_signals && (
                              <p className="text-[10px] text-muted-foreground">
                                <span className="font-semibold uppercase tracking-wider">
                                  Target Audience:
                                </span>{" "}
                                {cp.target_audience_signals}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Ad Opportunities */}
              {analysis.content_opportunities &&
                analysis.content_opportunities.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-400" />
                        Ad Opportunities
                      </CardTitle>
                      <CardDescription>
                        Specific ad concepts to create with draft copy, based on
                        competitor gaps and winning patterns
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {analysis.content_opportunities.map((opp, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-accent/20 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm">
                                  {opp.concept}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${priorityColor(opp.priority)}`}
                                >
                                  {opp.priority}
                                </Badge>
                                {opp.platform && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-muted text-muted-foreground"
                                  >
                                    {opp.platform}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {opp.rationale}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md bg-yellow-500/5 border border-yellow-500/20 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400 mb-1">
                                Headline Draft
                              </p>
                              <p className="text-xs font-medium">
                                {opp.headline_draft}
                              </p>
                            </div>
                            <div className="rounded-md bg-yellow-500/5 border border-yellow-500/20 p-3 sm:col-span-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400 mb-1">
                                Body Draft
                              </p>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {opp.body_draft}
                              </p>
                            </div>
                          </div>

                          {opp.cta_draft && (
                            <div className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 text-yellow-400" />
                              <span className="text-xs font-medium text-yellow-400">
                                CTA: {opp.cta_draft}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

              {/* Spend Indicators */}
              {analysis.spend_indicators && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-emerald-400" />
                      Spend Indicators
                    </CardTitle>
                    <CardDescription>
                      Signals about competitor ad spending based on activity
                      patterns
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {analysis.spend_indicators.active_vs_inactive_ratio && (
                        <div className="rounded-lg border border-border bg-accent/20 p-4 text-center">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            Active/Inactive Ratio
                          </p>
                          <p className="text-lg font-bold text-emerald-400">
                            {analysis.spend_indicators.active_vs_inactive_ratio}
                          </p>
                        </div>
                      )}
                      {analysis.spend_indicators.avg_ad_lifespan_days !=
                        null && (
                        <div className="rounded-lg border border-border bg-accent/20 p-4 text-center">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            Avg Ad Lifespan
                          </p>
                          <p className="text-lg font-bold text-emerald-400">
                            {analysis.spend_indicators.avg_ad_lifespan_days} days
                          </p>
                        </div>
                      )}
                      {analysis.spend_indicators.high_frequency_advertisers &&
                        analysis.spend_indicators.high_frequency_advertisers
                          .length > 0 && (
                          <div className="rounded-lg border border-border bg-accent/20 p-4 sm:col-span-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Highest Volume Advertisers
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {analysis.spend_indicators.high_frequency_advertisers.map(
                                (name, i) => (
                                  <Badge
                                    key={i}
                                    variant="outline"
                                    className="bg-emerald-500/10 text-emerald-400"
                                  >
                                    {name}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                    {analysis.spend_indicators.signals &&
                      analysis.spend_indicators.signals.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {analysis.spend_indicators.signals.map(
                            (signal, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-sm text-muted-foreground"
                              >
                                <Activity className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                {signal}
                              </div>
                            )
                          )}
                        </div>
                      )}
                  </CardContent>
                </Card>
              )}

              {/* AI Recommendations */}
              {analysis.recommendations &&
                analysis.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        AI Recommendations
                      </CardTitle>
                      <CardDescription>
                        Actionable recommendations based on competitor ad
                        analysis
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analysis.recommendations.map((rec, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 rounded-lg border border-border bg-accent/20 p-3"
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                              {i + 1}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {rec}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
            </>
          )}
        </>
      )}
    </div>
  );
}
