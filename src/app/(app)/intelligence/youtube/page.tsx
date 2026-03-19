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
  Youtube,
  Eye,
  ThumbsUp,
  MessageCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Sparkles,
  ArrowRight,
  Users,
  Flame,
  Zap,
  Target,
  Activity,
  Play,
  Calendar,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  subDays,
  differenceInWeeks,
  differenceInDays,
} from "date-fns";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database, Json } from "@/lib/supabase/types";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────

type YouTubeChannel =
  Database["public"]["Tables"]["youtube_channels"]["Row"];
type YouTubeVideoRow =
  Database["public"]["Tables"]["youtube_videos"]["Row"];

interface YouTubeVideo extends YouTubeVideoRow {
  competitor_name?: string;
  channel_name?: string;
  weighted_engagement?: number;
}

interface ContentTheme {
  theme: string;
  count: number;
  description: string;
  example_videos?: string[];
}

interface YouTubeAnalysis {
  content_themes?: ContentTheme[];
  format_analysis?: {
    avg_duration?: string;
    most_common_formats?: string[];
    best_performing_format?: string;
  };
  posting_patterns?: {
    most_active_days?: string[];
    avg_videos_per_week?: number;
    consistency_score?: string;
  };
  engagement_insights?: {
    avg_views?: number;
    avg_likes?: number;
    avg_comments?: number;
    view_to_engagement_ratio?: string;
    best_performing_topics?: string[];
  };
  channel_comparison?: {
    name: string;
    video_count: number;
    avg_views: number;
    avg_engagement: number;
    content_focus: string;
  }[];
  title_patterns?: {
    common_structures?: string[];
    power_words?: string[];
    avg_title_length?: number;
  };
  recommendations?: string[];
}

interface ChannelActivity {
  name: string;
  channel_name: string;
  subscriber_count: number;
  video_count: number;
  total_views: number;
  avg_views: number;
  avg_weighted_engagement: number;
  videos_per_week: number;
  velocity_trend: "up" | "down" | "stable";
}

// ── Helpers ────────────────────────────────────────────────────

const TIME_PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "all", label: "All time" },
];

function formatEngagement(num: number | null | undefined): string {
  if (num == null) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatDuration(duration: string | null): string {
  if (!duration) return "--";
  // Handle ISO 8601 duration (PT1H2M3S)
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (match) {
    const h = parseInt(match[1] ?? "0");
    const m = parseInt(match[2] ?? "0");
    const s = parseInt(match[3] ?? "0");
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  // Already formatted or other format
  return duration;
}

/** Weighted engagement: comments 3x, shares 2x (N/A for YT), likes 1x */
function getWeightedEngagement(video: YouTubeVideo): number {
  return (
    (video.like_count ?? 0) * 1 +
    (video.comment_count ?? 0) * 3
  );
}

function categorizeVideo(text: string): string {
  const lower = text.toLowerCase();
  if (
    lower.includes("how to") ||
    lower.includes("tutorial") ||
    lower.includes("tips") ||
    lower.includes("guide") ||
    lower.includes("learn") ||
    lower.includes("explained") ||
    lower.includes("what is")
  )
    return "Educational";
  if (
    lower.includes("demo") ||
    lower.includes("walkthrough") ||
    lower.includes("review") ||
    lower.includes("hands on") ||
    lower.includes("hands-on") ||
    lower.includes("unbox")
  )
    return "Product Demo";
  if (
    lower.includes("testimonial") ||
    lower.includes("customer") ||
    lower.includes("case study") ||
    lower.includes("success story") ||
    lower.includes("results")
  )
    return "Testimonial";
  if (
    lower.includes("behind the scenes") ||
    lower.includes("bts") ||
    lower.includes("day in") ||
    lower.includes("vlog") ||
    lower.includes("team") ||
    lower.includes("office")
  )
    return "Behind the Scenes";
  if (
    lower.includes("announce") ||
    lower.includes("launch") ||
    lower.includes("new") ||
    lower.includes("introducing") ||
    lower.includes("update") ||
    lower.includes("release")
  )
    return "Announcement";
  if (
    lower.includes("interview") ||
    lower.includes("podcast") ||
    lower.includes("conversation") ||
    lower.includes("talk")
  )
    return "Interview";
  if (
    lower.includes("vs") ||
    lower.includes("comparison") ||
    lower.includes("compared") ||
    lower.includes("best")
  )
    return "Comparison";
  if (lower.includes("live") || lower.includes("stream") || lower.includes("q&a"))
    return "Live/Q&A";
  return "Other";
}

// ── Component ──────────────────────────────────────────────────

export default function YouTubeIntelligencePage() {
  const supabase = createClient();
  const {
    selectedBrandId,
    selectedBrand,
    loading: brandLoading,
  } = useBrand();

  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [analysis, setAnalysis] = useState<YouTubeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [timePeriod, setTimePeriod] = useState("90");

  const fetchData = useCallback(async () => {
    if (!selectedBrandId) {
      setVideos([]);
      setChannels([]);
      setAnalysis(null);
      setLoading(false);
      return;
    }

    try {
      // Fetch channels
      const { data: channelData } = await supabase
        .from("youtube_channels")
        .select("*")
        .eq("brand_id", selectedBrandId);

      const channelList = channelData ?? [];
      setChannels(channelList);

      // Build channel name map
      const channelNameMap = new Map(
        channelList.map((c) => [c.channel_id, c.channel_name ?? "Unknown"])
      );

      // Fetch competitor names
      const { data: competitors } = await supabase
        .from("competitors")
        .select("id, name")
        .eq("brand_id", selectedBrandId)
        .eq("is_active", true);

      const competitorMap = new Map(
        (competitors ?? []).map((c) => [c.id, c.name])
      );

      // Fetch videos
      const { data: videoData } = await supabase
        .from("youtube_videos")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .order("published_at", { ascending: false })
        .limit(500);

      const enrichedVideos: YouTubeVideo[] = (videoData ?? []).map(
        (v: any) => ({
          ...v,
          competitor_name: competitorMap.get(v.competitor_id) ?? "Unknown",
          channel_name: channelNameMap.get(v.channel_id) ?? "Unknown",
          weighted_engagement: (v.like_count ?? 0) * 1 + (v.comment_count ?? 0) * 3,
        })
      );

      setVideos(enrichedVideos);

      // Fetch latest YouTube analysis
      const { data: analysisData } = await supabase
        .from("competitor_analyses")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .eq("analysis_type", "youtube_intelligence")
        .order("created_at", { ascending: false })
        .limit(1);

      if (analysisData && analysisData.length > 0) {
        const rec = analysisData[0].recommendations;
        if (rec && typeof rec === "object" && !Array.isArray(rec)) {
          setAnalysis(rec as unknown as YouTubeAnalysis);
        } else {
          setAnalysis(null);
        }
      } else {
        setAnalysis(null);
      }
    } catch {
      toast.error("Failed to load YouTube data");
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedBrandId]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchData();
    }
  }, [fetchData, brandLoading, selectedBrandId]);

  async function handleRefresh() {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }
    setScraping(true);
    try {
      toast.info("Scraping YouTube channels...");

      const res = await fetch("/api/jobs/youtube-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrandId }),
        signal: AbortSignal.timeout(290000),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "YouTube scrape failed");

      if (data.videos_found > 0) {
        toast.success(
          `YouTube scrape complete! Found ${data.videos_found} videos from ${data.channels_scraped} channels.`
        );
      } else if (data.message) {
        toast.warning(data.message);
      } else {
        toast.warning(
          "YouTube scrape complete but no videos were found. Make sure competitors have YouTube URLs."
        );
      }

      if (data.errors && Array.isArray(data.errors)) {
        for (const e of data.errors) {
          toast.error(e, { duration: 8000 });
        }
      }
      fetchData();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("YouTube scrape timed out. Partial results may be saved.");
      } else {
        toast.error(
          err instanceof Error ? err.message : "YouTube scrape failed"
        );
      }
      fetchData();
    } finally {
      setScraping(false);
    }
  }

  // ── Time-filtered videos ──────────────────────────────────────
  const timeFilteredVideos = useMemo(() => {
    if (timePeriod === "all") return videos;
    const cutoff = subDays(new Date(), parseInt(timePeriod));
    return videos.filter((v) => {
      if (!v.published_at) return false;
      try {
        return new Date(v.published_at) >= cutoff;
      } catch {
        return false;
      }
    });
  }, [videos, timePeriod]);

  // Sort by weighted engagement
  const sortedVideos = useMemo(() => {
    return [...timeFilteredVideos].sort(
      (a, b) => getWeightedEngagement(b) - getWeightedEngagement(a)
    );
  }, [timeFilteredVideos]);

  // ── Channel activity with velocity tracking ────────────────
  const channelActivity = useMemo((): ChannelActivity[] => {
    const map = new Map<
      string,
      {
        name: string;
        channel_name: string;
        subscriber_count: number;
        video_count: number;
        total_views: number;
        videos: YouTubeVideo[];
        totalWeightedEng: number;
      }
    >();

    for (const video of timeFilteredVideos) {
      const competitorName = video.competitor_name ?? "Unknown";
      const channel = channels.find((c) => c.channel_id === video.channel_id);
      const key = video.competitor_id ?? competitorName;

      const existing = map.get(key) ?? {
        name: competitorName,
        channel_name: channel?.channel_name ?? video.channel_name ?? "Unknown",
        subscriber_count: channel?.subscriber_count ?? 0,
        video_count: channel?.video_count ?? 0,
        total_views: channel?.view_count ?? 0,
        videos: [],
        totalWeightedEng: 0,
      };

      existing.videos.push(video);
      existing.totalWeightedEng += getWeightedEngagement(video);
      map.set(key, existing);
    }

    return Array.from(map.values())
      .map((data) => {
        const postDates = data.videos
          .map((v) => v.published_at)
          .filter(Boolean)
          .map((d) => new Date(d!))
          .sort((a, b) => a.getTime() - b.getTime());

        let videosPerWeek = 0;
        let velocityTrend: "up" | "down" | "stable" = "stable";

        if (postDates.length >= 2) {
          const firstDate = postDates[0];
          const lastDate = postDates[postDates.length - 1];
          const weeks = Math.max(differenceInWeeks(lastDate, firstDate), 1);
          videosPerWeek =
            Math.round((data.videos.length / weeks) * 10) / 10;

          const midIdx = Math.floor(postDates.length / 2);
          const firstHalfDays = Math.max(
            differenceInDays(postDates[midIdx], firstDate),
            1
          );
          const secondHalfDays = Math.max(
            differenceInDays(lastDate, postDates[midIdx]),
            1
          );
          const firstHalfRate = midIdx / firstHalfDays;
          const secondHalfRate =
            (postDates.length - midIdx) / secondHalfDays;

          if (secondHalfRate > firstHalfRate * 1.2) velocityTrend = "up";
          else if (secondHalfRate < firstHalfRate * 0.8)
            velocityTrend = "down";
        }

        const avgViews =
          data.videos.length > 0
            ? Math.round(
                data.videos.reduce((s, v) => s + (v.view_count ?? 0), 0) /
                  data.videos.length
              )
            : 0;

        return {
          name: data.name,
          channel_name: data.channel_name,
          subscriber_count: data.subscriber_count,
          video_count: data.video_count,
          total_views: data.total_views,
          avg_views: avgViews,
          avg_weighted_engagement:
            data.videos.length > 0
              ? Math.round(data.totalWeightedEng / data.videos.length)
              : 0,
          videos_per_week: videosPerWeek,
          velocity_trend: velocityTrend,
        };
      })
      .sort((a, b) => b.avg_weighted_engagement - a.avg_weighted_engagement);
  }, [timeFilteredVideos, channels]);

  // ── Viral Outliers (3x+ avg engagement) ────────────────────
  const viralOutliers = useMemo(() => {
    const compAvgs = new Map<string, number>();
    const compCounts = new Map<string, number>();

    for (const video of timeFilteredVideos) {
      const name = video.competitor_name ?? "Unknown";
      compAvgs.set(
        name,
        (compAvgs.get(name) ?? 0) + getWeightedEngagement(video)
      );
      compCounts.set(name, (compCounts.get(name) ?? 0) + 1);
    }

    const avgMap = new Map<string, number>();
    for (const [name, total] of compAvgs.entries()) {
      avgMap.set(name, total / (compCounts.get(name) ?? 1));
    }

    return timeFilteredVideos
      .filter((video) => {
        const compAvg =
          avgMap.get(video.competitor_name ?? "Unknown") ?? 0;
        if (compAvg === 0) return false;
        return getWeightedEngagement(video) >= compAvg * 3;
      })
      .sort(
        (a, b) => getWeightedEngagement(b) - getWeightedEngagement(a)
      )
      .slice(0, 10);
  }, [timeFilteredVideos]);

  // ── Content Category Analysis ────────────────────────────────
  const contentCategories = useMemo(() => {
    const categories = new Map<
      string,
      { count: number; totalViews: number; totalWeightedEng: number }
    >();

    for (const video of timeFilteredVideos) {
      const text = `${video.title ?? ""} ${video.description ?? ""}`;
      const category = categorizeVideo(text);
      const existing = categories.get(category) ?? {
        count: 0,
        totalViews: 0,
        totalWeightedEng: 0,
      };
      existing.count += 1;
      existing.totalViews += video.view_count ?? 0;
      existing.totalWeightedEng += getWeightedEngagement(video);
      categories.set(category, existing);
    }

    return Array.from(categories.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        percentage:
          timeFilteredVideos.length > 0
            ? Math.round((data.count / timeFilteredVideos.length) * 100)
            : 0,
        avg_views:
          data.count > 0 ? Math.round(data.totalViews / data.count) : 0,
        avg_weighted:
          data.count > 0
            ? Math.round(data.totalWeightedEng / data.count)
            : 0,
      }))
      .sort((a, b) => b.avg_weighted - a.avg_weighted);
  }, [timeFilteredVideos]);

  // ── Gap Analysis ────────────────────────────────────────────
  const gapAnalysis = useMemo(() => {
    const gaps: { insight: string; opportunity: string }[] = [];

    // Find high-engagement, low-frequency categories
    for (const mix of contentCategories) {
      if (mix.percentage < 10 && mix.avg_weighted > 0) {
        const overallAvg =
          contentCategories.reduce((s, m) => s + m.avg_weighted, 0) /
          Math.max(contentCategories.length, 1);
        if (mix.avg_weighted > overallAvg * 1.3) {
          gaps.push({
            insight: `"${mix.category}" videos get ${Math.round((mix.avg_weighted / overallAvg) * 100 - 100)}% more engagement than average`,
            opportunity: `Only ${mix.percentage}% of competitor videos are ${mix.category}. High engagement signals an underserved content type.`,
          });
        }
      }
    }

    // Posting frequency gap
    const avgVelocity =
      channelActivity.length > 0
        ? channelActivity.reduce((s, c) => s + c.videos_per_week, 0) /
          channelActivity.length
        : 0;
    if (avgVelocity < 2) {
      gaps.push({
        insight: `Average competitor uploads only ${avgVelocity.toFixed(1)} videos per week`,
        opportunity:
          "Outpace competitors by publishing 3+ videos per week with a consistent upload schedule.",
      });
    }

    // Subscriber to views ratio gap
    for (const ch of channelActivity) {
      if (ch.subscriber_count > 0 && ch.avg_views > 0) {
        const ratio = ch.avg_views / ch.subscriber_count;
        if (ratio < 0.05) {
          gaps.push({
            insight: `${ch.name} gets low view-to-subscriber ratio (${(ratio * 100).toFixed(1)}%)`,
            opportunity: `Their audience is not highly engaged. Target their subscribers with better content.`,
          });
          break; // Only show one
        }
      }
    }

    // Comment engagement gap
    const avgCommentRatio =
      timeFilteredVideos.length > 0
        ? timeFilteredVideos.reduce(
            (s, v) =>
              s +
              ((v.comment_count ?? 0) /
                Math.max(v.view_count ?? 1, 1)),
            0
          ) / timeFilteredVideos.length
        : 0;
    if (avgCommentRatio < 0.01) {
      gaps.push({
        insight: `Average comment-to-view ratio is only ${(avgCommentRatio * 100).toFixed(2)}%`,
        opportunity:
          "Use strong CTAs, questions, and pinned comments to drive 2-3x higher comment engagement.",
      });
    }

    return gaps.slice(0, 5);
  }, [timeFilteredVideos, contentCategories, channelActivity]);

  // ── Summary stats ──────────────────────────────────────────
  const stats = useMemo(() => {
    const totalViews = timeFilteredVideos.reduce(
      (s, v) => s + (v.view_count ?? 0),
      0
    );
    const avgViews =
      timeFilteredVideos.length > 0
        ? Math.round(totalViews / timeFilteredVideos.length)
        : 0;
    const totalWeighted = timeFilteredVideos.reduce(
      (s, v) => s + getWeightedEngagement(v),
      0
    );
    const avgWeighted =
      timeFilteredVideos.length > 0
        ? Math.round(totalWeighted / timeFilteredVideos.length)
        : 0;

    return {
      totalVideos: timeFilteredVideos.length,
      channelsTracked: channels.length,
      avgViews,
      avgWeighted,
      totalViews,
    };
  }, [timeFilteredVideos, channels]);

  // ── Loading state ──────────────────────────────────────────

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────

  if (videos.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              YouTube Intelligence
            </h1>
            <p className="text-muted-foreground mt-1">
              Competitor YouTube analysis
              {selectedBrand ? ` for ${selectedBrand.name}` : ""}
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={scraping || !selectedBrandId}
          >
            {scraping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh YouTube Data
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Youtube className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No YouTube data yet</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {channels.length === 0
                ? 'Add YouTube channel URLs to your competitors first, then click "Refresh YouTube Data" to scrape their videos.'
                : 'Click "Refresh YouTube Data" to scrape competitor YouTube channels and generate intelligence.'}
            </p>
            <Link href="/competitors" className="mt-4">
              <Button variant="outline">
                <ArrowRight className="mr-2 h-4 w-4" />
                Go to Competitors
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main content ───────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            YouTube Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            CMO-grade competitive YouTube analysis
            {selectedBrand ? ` for ${selectedBrand.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={timePeriod}
            onValueChange={(val) => {
              if (val) setTimePeriod(val);
            }}
          >
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
            onClick={handleRefresh}
            disabled={scraping || !selectedBrandId}
          >
            {scraping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Videos Analyzed
            </CardTitle>
            <Play className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalVideos}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {timePeriod !== "all" ? `last ${timePeriod} days` : "all time"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Channels Tracked
            </CardTitle>
            <Youtube className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.channelsTracked}</div>
            <p className="text-xs text-muted-foreground mt-1">
              competitor channels
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Views
            </CardTitle>
            <Eye className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatEngagement(stats.avgViews)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">per video</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Weighted Eng
            </CardTitle>
            <Zap className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatEngagement(stats.avgWeighted)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">C:3x L:1x</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Views
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatEngagement(stats.totalViews)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              across all videos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Viral Outliers */}
      {viralOutliers.length > 0 && (
        <Card className="border-orange-500/30 bg-gradient-to-r from-orange-500/5 to-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Viral Outliers
              <Badge variant="secondary" className="ml-2 text-xs">
                3x+ avg engagement
              </Badge>
            </CardTitle>
            <CardDescription>
              Videos that significantly outperformed their channel&apos;s
              average -- study these for patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {viralOutliers.map((video) => (
                <div
                  key={video.id}
                  className="flex flex-col rounded-lg border border-orange-500/20 bg-card p-4 transition-colors hover:bg-accent/30"
                >
                  {video.thumbnail_url && (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title ?? ""}
                      className="mb-3 rounded-md w-full aspect-video object-cover"
                    />
                  )}
                  <div className="mb-2 flex items-center gap-2">
                    <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {video.competitor_name}
                    </span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-xs text-muted-foreground"
                    >
                      {formatDuration(video.duration)}
                    </Badge>
                  </div>

                  <p className="mb-3 flex-1 text-sm font-medium line-clamp-2">
                    {video.title ?? "Untitled"}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5 text-blue-400" />
                      {formatEngagement(video.view_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5 text-green-400" />
                      {formatEngagement(video.like_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
                      {formatEngagement(video.comment_count)}
                    </span>
                    <span className="ml-auto font-semibold text-orange-500">
                      WE: {formatEngagement(getWeightedEngagement(video))}
                    </span>
                  </div>
                  <a
                    href={`https://youtube.com/watch?v=${video.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Watch on YouTube
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Performing Videos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top Performing Videos</CardTitle>
              <CardDescription>
                Sorted by weighted engagement (Comments 3x, Likes 1x)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedVideos.slice(0, 12).map((video) => (
              <div
                key={video.id}
                className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/30"
              >
                {video.thumbnail_url && (
                  <img
                    src={video.thumbnail_url}
                    alt={video.title ?? ""}
                    className="mb-3 rounded-md w-full aspect-video object-cover"
                  />
                )}
                <div className="mb-2 flex items-center gap-2">
                  <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {video.competitor_name}
                  </span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-xs text-muted-foreground"
                  >
                    {formatDuration(video.duration)}
                  </Badge>
                </div>

                <p className="mb-3 flex-1 text-sm font-medium line-clamp-2">
                  {video.title ?? "Untitled"}
                </p>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5 text-blue-400" />
                    {formatEngagement(video.view_count)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5 text-green-400" />
                    {formatEngagement(video.like_count)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
                    {formatEngagement(video.comment_count)}
                  </span>
                  <a
                    href={`https://youtube.com/watch?v=${video.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-primary hover:underline"
                  >
                    Watch
                  </a>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {video.published_at
                      ? formatDistanceToNow(new Date(video.published_at), {
                          addSuffix: true,
                        })
                      : ""}
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    WE: {formatEngagement(getWeightedEngagement(video))}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {sortedVideos.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No videos found in the selected time period.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Channel Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-400" />
            Channel Comparison & Content Velocity
          </CardTitle>
          <CardDescription>
            Subscriber count, posting frequency, weighted engagement, and
            velocity trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
              <div className="col-span-3">Channel</div>
              <div className="col-span-2 text-center">Subscribers</div>
              <div className="col-span-1 text-center">Videos</div>
              <div className="col-span-2 text-center">Avg Views</div>
              <div className="col-span-1 text-center">Vids/Wk</div>
              <div className="col-span-1 text-center">Trend</div>
              <div className="col-span-2 text-center">Avg WE</div>
            </div>
            <Separator />
            {channelActivity.map((ch) => {
              const maxWeighted = Math.max(
                ...channelActivity.map((c) => c.avg_weighted_engagement),
                1
              );
              const widthPercent = Math.round(
                (ch.avg_weighted_engagement / maxWeighted) * 100
              );
              return (
                <div key={ch.name} className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 items-center text-sm px-2">
                    <div className="col-span-3 flex items-center gap-2">
                      <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium truncate block">
                          {ch.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate block">
                          {ch.channel_name}
                        </span>
                      </div>
                    </div>
                    <div className="col-span-2 text-center text-muted-foreground">
                      {formatEngagement(ch.subscriber_count)}
                    </div>
                    <div className="col-span-1 text-center text-muted-foreground">
                      {ch.video_count}
                    </div>
                    <div className="col-span-2 text-center text-muted-foreground">
                      {formatEngagement(ch.avg_views)}
                    </div>
                    <div className="col-span-1 text-center font-medium">
                      {ch.videos_per_week}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {ch.velocity_trend === "up" && (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      )}
                      {ch.velocity_trend === "down" && (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      {ch.velocity_trend === "stable" && (
                        <span className="text-xs text-muted-foreground">
                          --
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-primary w-10 text-right">
                          {formatEngagement(ch.avg_weighted_engagement)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {channelActivity.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No channel activity data available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content Analysis + Gap Analysis row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Content Category Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-indigo-400" />
              Content Analysis
            </CardTitle>
            <CardDescription>
              Video content categories and their performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contentCategories.length > 0 ? (
              <div className="space-y-3">
                {contentCategories.map((cat) => {
                  const maxWE = Math.max(
                    ...contentCategories.map((m) => m.avg_weighted),
                    1
                  );
                  const barWidth = Math.round(
                    (cat.avg_weighted / maxWE) * 100
                  );
                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cat.category}</span>
                          <Badge variant="outline" className="text-xs">
                            {cat.percentage}%
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <span>{cat.count} videos</span>
                          <span>
                            <Eye className="inline h-3 w-3 mr-0.5" />
                            {formatEngagement(cat.avg_views)}
                          </span>
                          <span className="font-semibold text-primary">
                            WE: {formatEngagement(cat.avg_weighted)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Not enough data for content analysis.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gap Analysis */}
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-500" />
              Opportunity Gaps
            </CardTitle>
            <CardDescription>
              Underserved areas where you can outperform competitors on YouTube
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gapAnalysis.length > 0 ? (
              <div className="space-y-4">
                {gapAnalysis.map((gap, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3 space-y-1"
                  >
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{gap.insight}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {gap.opportunity}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No significant gaps detected. Competitors are well-covered
                  across YouTube content types.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations */}
      {analysis?.recommendations && analysis.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Recommendations
            </CardTitle>
            <CardDescription>
              Actionable insights from YouTube intelligence analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {analysis.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <p className="text-sm text-muted-foreground">{rec}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
