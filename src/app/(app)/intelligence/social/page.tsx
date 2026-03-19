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
  Instagram,
  Twitter,
  Linkedin,
  Globe,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  TrendingDown,
  Hash,
  Calendar,
  Clock,
  BarChart3,
  Sparkles,
  ArrowRight,
  Users,
  Flame,
  Zap,
  Target,
  Activity,
  Eye,
} from "lucide-react";
import { format, formatDistanceToNow, subDays, differenceInWeeks, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database, Json } from "@/lib/supabase/types";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────

type CompetitorContent =
  Database["public"]["Tables"]["competitor_content"]["Row"];
type Competitor = Database["public"]["Tables"]["competitors"]["Row"];

interface SocialPost extends CompetitorContent {
  competitor_name?: string;
  platform?: string;
  engagement_likes?: number;
  engagement_comments?: number;
  engagement_shares?: number;
  engagement_views?: number;
  posted_at?: string;
  url?: string;
}

interface ContentTheme {
  theme: string;
  count: number;
  description: string;
  example_posts?: string[];
}

interface HashtagTrend {
  hashtag: string;
  count: number;
  avg_engagement: number;
}

interface PostingPatterns {
  most_active_days: string[];
  peak_hours: string[];
  avg_posts_per_week: number;
}

interface CompetitorActivity {
  name: string;
  post_count: number;
  avg_engagement: number;
  weighted_engagement: number;
  primary_platform: string;
  posts_per_week: number;
  velocity_trend: "up" | "down" | "stable";
}

interface SocialAnalysis {
  content_themes?: ContentTheme[];
  hashtag_trends?: HashtagTrend[];
  posting_patterns?: PostingPatterns;
  engagement_insights?: {
    top_content_types?: string[];
    avg_engagement_rate?: string;
    best_performing_topics?: string[];
  };
  competitor_activity?: CompetitorActivity[];
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

function getPlatformIcon(platform: string) {
  switch (platform) {
    case "instagram":
      return <Instagram className="h-4 w-4 text-pink-400" />;
    case "twitter":
      return <Twitter className="h-4 w-4 text-sky-400" />;
    case "linkedin":
      return <Linkedin className="h-4 w-4 text-blue-500" />;
    default:
      return <Globe className="h-4 w-4 text-muted-foreground" />;
  }
}

function getPlatformLabel(platform: string) {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "twitter":
      return "Twitter/X";
    case "linkedin":
      return "LinkedIn";
    default:
      return platform;
  }
}

function formatEngagement(num: number | null | undefined): string {
  if (num == null) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/** Raw total engagement (unweighted) */
function getTotalEngagement(post: SocialPost): number {
  return (
    (post.engagement_likes ?? 0) +
    (post.engagement_comments ?? 0) +
    (post.engagement_shares ?? 0)
  );
}

/** Weighted engagement: comments 3x, shares 2x, likes 1x */
function getWeightedEngagement(post: SocialPost): number {
  return (
    (post.engagement_likes ?? 0) * 1 +
    (post.engagement_comments ?? 0) * 3 +
    (post.engagement_shares ?? 0) * 2
  );
}

function getEngagementQualityLabel(post: SocialPost): { label: string; color: string } {
  const comments = post.engagement_comments ?? 0;
  const shares = post.engagement_shares ?? 0;
  const likes = post.engagement_likes ?? 0;
  const total = comments + shares + likes;
  if (total === 0) return { label: "No data", color: "text-muted-foreground" };

  const commentRatio = comments / total;
  const shareRatio = shares / total;

  if (commentRatio > 0.15 && shareRatio > 0.05) return { label: "High quality", color: "text-emerald-500" };
  if (commentRatio > 0.08 || shareRatio > 0.03) return { label: "Good quality", color: "text-blue-500" };
  return { label: "Passive", color: "text-amber-500" };
}

// ── Component ──────────────────────────────────────────────────

export default function SocialIntelligencePage() {
  const supabase = createClient();
  const {
    selectedBrandId,
    selectedBrand,
    loading: brandLoading,
  } = useBrand();

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [analysis, setAnalysis] = useState<SocialAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [timePeriod, setTimePeriod] = useState("90");

  const fetchData = useCallback(async () => {
    if (!selectedBrandId) {
      setPosts([]);
      setCompetitors([]);
      setAnalysis(null);
      setLoading(false);
      return;
    }

    try {
      // Fetch competitors for this brand
      const { data: comps } = await supabase
        .from("competitors")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .eq("is_active", true);

      const competitorList = comps ?? [];
      setCompetitors(competitorList);

      if (competitorList.length === 0) {
        setPosts([]);
        setAnalysis(null);
        setLoading(false);
        return;
      }

      const competitorIds = competitorList.map((c) => c.id);
      const competitorMap = new Map(
        competitorList.map((c) => [c.id, c.name])
      );

      // Fetch social posts
      const { data: contentData } = await supabase
        .from("competitor_content")
        .select("*")
        .in("competitor_id", competitorIds)
        .eq("content_type", "social_post")
        .order("created_at", { ascending: false })
        .limit(500);

      const enrichedPosts: SocialPost[] = (contentData ?? []).map(
        (post: any) => {
          const metrics = post.engagement_metrics ?? {};
          return {
            ...post,
            competitor_name: competitorMap.get(post.competitor_id) ?? "Unknown",
            platform: post.platform ?? post.source,
            engagement_likes: metrics.likes ?? post.engagement_likes ?? 0,
            engagement_comments: metrics.comments ?? post.engagement_comments ?? 0,
            engagement_shares: metrics.shares ?? post.engagement_shares ?? 0,
            engagement_views: metrics.views ?? metrics.impressions ?? 0,
            url: metrics.url ?? post.url ?? null,
            posted_at: post.posted_at ?? post.published_at,
          };
        }
      );

      setPosts(enrichedPosts);

      // Fetch latest social analysis
      const { data: analysisData } = await supabase
        .from("competitor_analyses")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .eq("analysis_type", "social_intelligence")
        .order("created_at", { ascending: false })
        .limit(1);

      if (analysisData && analysisData.length > 0) {
        const rec = analysisData[0].recommendations;
        if (rec && typeof rec === "object" && !Array.isArray(rec)) {
          setAnalysis(rec as unknown as SocialAnalysis);
        } else {
          setAnalysis(null);
        }
      } else {
        setAnalysis(null);
      }
    } catch {
      toast.error("Failed to load social data");
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

  async function handleRefresh(force = false) {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }
    setScraping(true);
    try {
      // First, auto-discover social handles for competitors that don't have them
      const compsWithoutSocials = competitors.filter(
        (c) => !c.instagram_handle && !c.twitter_handle && !c.linkedin_url && c.website_url
      );
      if (compsWithoutSocials.length > 0) {
        toast.info(`Discovering social accounts for ${compsWithoutSocials.length} competitor(s)...`);
        try {
          await fetch("/api/competitors/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              competitor_ids: compsWithoutSocials.map((c) => c.id),
            }),
          });
          const { data: updatedComps } = await supabase
            .from("competitors")
            .select("*")
            .eq("brand_id", selectedBrandId)
            .eq("is_active", true);
          if (updatedComps) {
            setCompetitors(updatedComps as Competitor[]);
          }
        } catch (e) {
          console.error("Enrich failed:", e);
        }
      }

      toast.info(force
        ? "Force refreshing all social media posts..."
        : "Updating social posts (skipping recently scraped competitors)..."
      );

      const res = await fetch("/api/jobs/social-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrandId, force }),
        signal: AbortSignal.timeout(290000),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Social scrape failed");

      const totalPosts = data.total_posts ?? data.posts_found ?? 0;
      if (totalPosts > 0) {
        toast.success(`Social scrape complete! Found ${totalPosts} posts (${data.instagram_posts ?? 0} IG, ${data.twitter_posts ?? 0} TW, ${data.linkedin_posts ?? 0} LI).`);
      } else if (data.message) {
        toast.warning(data.message);
      } else {
        toast.warning("Social scrape complete but no posts were found. Make sure competitors have Instagram, Twitter, or LinkedIn handles.");
      }

      if (data.warnings && Array.isArray(data.warnings)) {
        for (const w of data.warnings) {
          toast.info(w, { duration: 8000 });
        }
      }
      fetchData();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("Social scrape timed out. Partial results may be saved.");
      } else {
        toast.error(
          err instanceof Error ? err.message : "Social scrape failed"
        );
      }
      fetchData();
    } finally {
      setScraping(false);
    }
  }

  // ── Time-filtered posts ──────────────────────────────────────
  const timeFilteredPosts = useMemo(() => {
    if (timePeriod === "all") return posts;
    const cutoff = subDays(new Date(), parseInt(timePeriod));
    return posts.filter((p) => {
      const date = p.posted_at ?? p.published_at;
      if (!date) return false;
      try {
        return new Date(date) >= cutoff;
      } catch {
        return false;
      }
    });
  }, [posts, timePeriod]);

  // Filter posts by platform
  const filteredPosts = useMemo(() => {
    if (platformFilter === "all") return timeFilteredPosts;
    return timeFilteredPosts.filter((p) => p.platform === platformFilter);
  }, [timeFilteredPosts, platformFilter]);

  // Sort by WEIGHTED engagement
  const sortedPosts = useMemo(() => {
    return [...filteredPosts].sort(
      (a, b) => getWeightedEngagement(b) - getWeightedEngagement(a)
    );
  }, [filteredPosts]);

  // Available platforms from data
  const platforms = useMemo(() => {
    const set = new Set(posts.map((p) => p.platform).filter(Boolean));
    return Array.from(set) as string[];
  }, [posts]);

  // ── Competitor activity with velocity tracking ────────────────
  const competitorActivity = useMemo((): CompetitorActivity[] => {
    const map = new Map<
      string,
      {
        posts: SocialPost[];
        totalEng: number;
        weightedEng: number;
        platformCounts: Map<string, number>;
      }
    >();

    for (const post of timeFilteredPosts) {
      const name = post.competitor_name ?? "Unknown";
      const existing = map.get(name) ?? {
        posts: [],
        totalEng: 0,
        weightedEng: 0,
        platformCounts: new Map<string, number>(),
      };
      existing.posts.push(post);
      existing.totalEng += getTotalEngagement(post);
      existing.weightedEng += getWeightedEngagement(post);
      const plat = post.platform ?? "unknown";
      existing.platformCounts.set(plat, (existing.platformCounts.get(plat) ?? 0) + 1);
      map.set(name, existing);
    }

    return Array.from(map.entries())
      .map(([name, data]) => {
        // Calculate content velocity (posts per week)
        const postDates = data.posts
          .map((p) => p.posted_at ?? p.published_at)
          .filter(Boolean)
          .map((d) => new Date(d!))
          .sort((a, b) => a.getTime() - b.getTime());

        let postsPerWeek = 0;
        let velocityTrend: "up" | "down" | "stable" = "stable";

        if (postDates.length >= 2) {
          const firstDate = postDates[0];
          const lastDate = postDates[postDates.length - 1];
          const weeks = Math.max(differenceInWeeks(lastDate, firstDate), 1);
          postsPerWeek = Math.round((data.posts.length / weeks) * 10) / 10;

          // Compare first half vs second half velocity
          const midIdx = Math.floor(postDates.length / 2);
          const firstHalfDays = Math.max(differenceInDays(postDates[midIdx], firstDate), 1);
          const secondHalfDays = Math.max(differenceInDays(lastDate, postDates[midIdx]), 1);
          const firstHalfRate = midIdx / firstHalfDays;
          const secondHalfRate = (postDates.length - midIdx) / secondHalfDays;

          if (secondHalfRate > firstHalfRate * 1.2) velocityTrend = "up";
          else if (secondHalfRate < firstHalfRate * 0.8) velocityTrend = "down";
        }

        // Find primary platform
        let primaryPlatform = "unknown";
        let maxCount = 0;
        for (const [plat, count] of data.platformCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            primaryPlatform = plat;
          }
        }

        return {
          name,
          post_count: data.posts.length,
          avg_engagement: data.posts.length > 0 ? Math.round(data.totalEng / data.posts.length) : 0,
          weighted_engagement: data.posts.length > 0 ? Math.round(data.weightedEng / data.posts.length) : 0,
          primary_platform: primaryPlatform,
          posts_per_week: postsPerWeek,
          velocity_trend: velocityTrend,
        };
      })
      .sort((a, b) => b.weighted_engagement - a.weighted_engagement);
  }, [timeFilteredPosts]);

  // ── Viral Outliers (3x+ avg engagement) ────────────────────────
  const viralOutliers = useMemo(() => {
    // Calculate per-competitor average weighted engagement
    const compAvgs = new Map<string, number>();
    const compCounts = new Map<string, number>();

    for (const post of timeFilteredPosts) {
      const name = post.competitor_name ?? "Unknown";
      compAvgs.set(name, (compAvgs.get(name) ?? 0) + getWeightedEngagement(post));
      compCounts.set(name, (compCounts.get(name) ?? 0) + 1);
    }

    const avgMap = new Map<string, number>();
    for (const [name, total] of compAvgs.entries()) {
      avgMap.set(name, total / (compCounts.get(name) ?? 1));
    }

    // Find posts with 3x+ their competitor's average
    return timeFilteredPosts
      .filter((post) => {
        const compAvg = avgMap.get(post.competitor_name ?? "Unknown") ?? 0;
        if (compAvg === 0) return false;
        return getWeightedEngagement(post) >= compAvg * 3;
      })
      .sort((a, b) => getWeightedEngagement(b) - getWeightedEngagement(a))
      .slice(0, 10);
  }, [timeFilteredPosts]);

  // ── Content Mix Analysis ────────────────────────────────────
  const contentMix = useMemo(() => {
    const categories = new Map<string, { count: number; totalEng: number; weightedEng: number }>();

    const categorize = (text: string): string => {
      const lower = text.toLowerCase();
      // Educational/thought leadership
      if (
        lower.includes("how to") ||
        lower.includes("tips") ||
        lower.includes("guide") ||
        lower.includes("learn") ||
        lower.includes("strategy") ||
        lower.includes("insight") ||
        lower.includes("research") ||
        lower.includes("data shows") ||
        lower.includes("study") ||
        lower.includes("framework")
      ) return "Educational";
      // Promotional
      if (
        lower.includes("sale") ||
        lower.includes("discount") ||
        lower.includes("offer") ||
        lower.includes("buy") ||
        lower.includes("shop") ||
        lower.includes("promo") ||
        lower.includes("deal") ||
        lower.includes("limited") ||
        lower.includes("free trial") ||
        lower.includes("sign up")
      ) return "Promotional";
      // Social proof / testimonials
      if (
        lower.includes("testimonial") ||
        lower.includes("review") ||
        lower.includes("customer") ||
        lower.includes("case study") ||
        lower.includes("success story") ||
        lower.includes("results")
      ) return "Social Proof";
      // Culture / behind the scenes
      if (
        lower.includes("team") ||
        lower.includes("behind the scenes") ||
        lower.includes("culture") ||
        lower.includes("hiring") ||
        lower.includes("welcome") ||
        lower.includes("meet") ||
        lower.includes("celebrating") ||
        lower.includes("milestone")
      ) return "Culture";
      // Engagement bait / questions
      if (
        lower.includes("?") ||
        lower.includes("what do you think") ||
        lower.includes("agree?") ||
        lower.includes("poll") ||
        lower.includes("vote")
      ) return "Engagement";
      // News / announcements
      if (
        lower.includes("announce") ||
        lower.includes("launch") ||
        lower.includes("new") ||
        lower.includes("update") ||
        lower.includes("introducing") ||
        lower.includes("excited to share")
      ) return "Announcements";

      return "Other";
    };

    for (const post of timeFilteredPosts) {
      const text = post.body_text ?? post.title ?? "";
      const category = categorize(text);
      const existing = categories.get(category) ?? { count: 0, totalEng: 0, weightedEng: 0 };
      existing.count += 1;
      existing.totalEng += getTotalEngagement(post);
      existing.weightedEng += getWeightedEngagement(post);
      categories.set(category, existing);
    }

    return Array.from(categories.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        percentage: timeFilteredPosts.length > 0 ? Math.round((data.count / timeFilteredPosts.length) * 100) : 0,
        avg_engagement: data.count > 0 ? Math.round(data.totalEng / data.count) : 0,
        avg_weighted: data.count > 0 ? Math.round(data.weightedEng / data.count) : 0,
      }))
      .sort((a, b) => b.avg_weighted - a.avg_weighted);
  }, [timeFilteredPosts]);

  // ── Gap Analysis ────────────────────────────────────────────
  const gapAnalysis = useMemo(() => {
    // What content types get high engagement but competitors post rarely?
    const gaps: { insight: string; opportunity: string; icon: string }[] = [];

    // Find high-engagement, low-frequency categories
    const totalPosts = timeFilteredPosts.length;
    for (const mix of contentMix) {
      if (mix.percentage < 10 && mix.avg_weighted > 0) {
        // Get the average across all categories
        const overallAvg = contentMix.reduce((s, m) => s + m.avg_weighted, 0) / Math.max(contentMix.length, 1);
        if (mix.avg_weighted > overallAvg * 1.3) {
          gaps.push({
            insight: `"${mix.category}" content gets ${Math.round((mix.avg_weighted / overallAvg) * 100 - 100)}% more engagement than average`,
            opportunity: `Only ${mix.percentage}% of competitor posts are ${mix.category.toLowerCase()}. This is an underserved content type with proven engagement.`,
            icon: "target",
          });
        }
      }
    }

    // Platform gaps
    const platformPostCounts = new Map<string, number>();
    for (const post of timeFilteredPosts) {
      const plat = post.platform ?? "unknown";
      platformPostCounts.set(plat, (platformPostCounts.get(plat) ?? 0) + 1);
    }

    if (!platformPostCounts.has("linkedin") || (platformPostCounts.get("linkedin") ?? 0) < 5) {
      gaps.push({
        insight: "Competitors have minimal LinkedIn presence",
        opportunity: "LinkedIn is underutilized by competitors. Early mover advantage for B2B thought leadership.",
        icon: "linkedin",
      });
    }

    // Posting frequency gap
    const avgVelocity = competitorActivity.length > 0
      ? competitorActivity.reduce((s, c) => s + c.posts_per_week, 0) / competitorActivity.length
      : 0;
    if (avgVelocity < 3) {
      gaps.push({
        insight: `Average competitor posts only ${avgVelocity.toFixed(1)}x per week`,
        opportunity: "Outpace competitors by posting 4-5x per week with a consistent content calendar.",
        icon: "activity",
      });
    }

    // Engagement quality gap
    const highQualityPosts = timeFilteredPosts.filter((p) => {
      const q = getEngagementQualityLabel(p);
      return q.label === "High quality";
    });
    const hqRatio = totalPosts > 0 ? highQualityPosts.length / totalPosts : 0;
    if (hqRatio < 0.15) {
      gaps.push({
        insight: `Only ${Math.round(hqRatio * 100)}% of competitor posts drive high-quality engagement (comments + shares)`,
        opportunity: "Create conversation-starting content with clear CTAs and hot takes to drive comment-heavy engagement.",
        icon: "zap",
      });
    }

    return gaps.slice(0, 5);
  }, [timeFilteredPosts, contentMix, competitorActivity]);

  // Extract hashtags from post text
  const computedHashtags = useMemo(() => {
    if (analysis?.hashtag_trends) return analysis.hashtag_trends;

    const tagMap = new Map<string, { count: number; totalEng: number }>();
    for (const post of timeFilteredPosts) {
      const text = post.body_text ?? "";
      const tags = text.match(/#[\w]+/g) ?? [];
      for (const tag of tags) {
        const lower = tag.toLowerCase();
        const existing = tagMap.get(lower) ?? { count: 0, totalEng: 0 };
        existing.count += 1;
        existing.totalEng += getWeightedEngagement(post);
        tagMap.set(lower, existing);
      }
    }

    return Array.from(tagMap.entries())
      .map(([hashtag, data]) => ({
        hashtag,
        count: data.count,
        avg_engagement: Math.round(data.totalEng / data.count),
      }))
      .sort((a, b) => b.avg_engagement - a.avg_engagement)
      .slice(0, 20);
  }, [timeFilteredPosts, analysis]);

  // Posting patterns from data
  const computedPatterns = useMemo((): PostingPatterns | null => {
    if (analysis?.posting_patterns) return analysis.posting_patterns;
    if (timeFilteredPosts.length === 0) return null;

    const dayCounts = new Map<string, number>();
    const hourCounts = new Map<string, number>();
    const days = [
      "Sunday", "Monday", "Tuesday", "Wednesday",
      "Thursday", "Friday", "Saturday",
    ];

    for (const post of timeFilteredPosts) {
      const dateStr = post.posted_at ?? post.published_at;
      if (!dateStr) continue;
      try {
        const d = new Date(dateStr);
        const day = days[d.getUTCDay()];
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
        const hour = `${d.getUTCHours().toString().padStart(2, "0")}:00`;
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      } catch {
        // skip invalid dates
      }
    }

    const sortedDays = Array.from(dayCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d);

    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h + " UTC");

    // Calculate actual posts per week from date range
    const postDates = timeFilteredPosts
      .map((p) => p.posted_at ?? p.published_at)
      .filter(Boolean)
      .map((d) => new Date(d!))
      .sort((a, b) => a.getTime() - b.getTime());

    let avgPerWeek = 0;
    if (postDates.length >= 2) {
      const weeks = Math.max(differenceInWeeks(postDates[postDates.length - 1], postDates[0]), 1);
      avgPerWeek = Math.round((timeFilteredPosts.length / weeks) * 10) / 10;
    }

    return {
      most_active_days: sortedDays,
      peak_hours: sortedHours,
      avg_posts_per_week: avgPerWeek,
    };
  }, [timeFilteredPosts, analysis]);

  // ── Summary stats ──────────────────────────────────────────
  const stats = useMemo(() => {
    const totalWeighted = timeFilteredPosts.reduce((s, p) => s + getWeightedEngagement(p), 0);
    const avgWeighted = timeFilteredPosts.length > 0 ? Math.round(totalWeighted / timeFilteredPosts.length) : 0;
    const totalRaw = timeFilteredPosts.reduce((s, p) => s + getTotalEngagement(p), 0);
    const avgRaw = timeFilteredPosts.length > 0 ? Math.round(totalRaw / timeFilteredPosts.length) : 0;

    return { avgWeighted, avgRaw, totalPosts: timeFilteredPosts.length };
  }, [timeFilteredPosts]);

  // ── Loading state ──────────────────────────────────────────

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────

  if (posts.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Social Intelligence
            </h1>
            <p className="text-muted-foreground mt-1">
              Competitor social media analysis
              {selectedBrand ? ` for ${selectedBrand.name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleRefresh(false)}
              disabled={scraping || !selectedBrandId}
            >
              {scraping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Update
            </Button>
            <Button
              onClick={() => handleRefresh(true)}
              disabled={scraping || !selectedBrandId}
              variant="outline"
              title="Re-scrape all competitors, even recently scraped ones"
            >
              Force Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">
              No social data yet
            </h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {competitors.length === 0
                ? "Add competitors with social handles first, then click \"Refresh Social Data\" to scrape their social posts."
                : competitors.some(
                      (c) => c.instagram_handle || c.twitter_handle || c.linkedin_url
                    )
                  ? "Click \"Refresh Social Data\" to scrape competitor social media posts and generate intelligence."
                  : "Your competitors don't have social handles configured. Add Instagram, Twitter, or LinkedIn in the Competitors page."}
            </p>
            {competitors.length === 0 && (
              <Link href="/competitors" className="mt-4">
                <Button variant="outline">
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Go to Competitors
                </Button>
              </Link>
            )}
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
            Social Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            CMO-grade competitive analysis
            {selectedBrand ? ` for ${selectedBrand.name}` : ""}
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
          <div className="flex gap-2">
            <Button
              onClick={() => handleRefresh(false)}
              disabled={scraping || !selectedBrandId}
            >
              {scraping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Update
            </Button>
            <Button
              onClick={() => handleRefresh(true)}
              disabled={scraping || !selectedBrandId}
              variant="outline"
            >
              Force Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Posts Analyzed
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPosts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {timePeriod !== "all" ? `last ${timePeriod} days` : "all time"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platforms
            </CardTitle>
            <Globe className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{platforms.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {platforms.map(getPlatformLabel).join(", ") || "none"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Competitors
            </CardTitle>
            <Users className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {competitorActivity.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">active in period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Engagement
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatEngagement(stats.avgRaw)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">raw (L+C+S)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Weighted Score
            </CardTitle>
            <Zap className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatEngagement(stats.avgWeighted)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">C:3x S:2x L:1x</p>
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
              Posts that significantly outperformed their competitor&apos;s average -- study these for patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {viralOutliers.map((post) => {
                const quality = getEngagementQualityLabel(post);
                return (
                  <div
                    key={post.id}
                    className="flex flex-col rounded-lg border border-orange-500/20 bg-card p-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {getPlatformIcon(post.platform ?? "")}
                      <span className="text-sm font-medium truncate">
                        {post.competitor_name}
                      </span>
                      <Badge variant="outline" className={`ml-auto text-xs ${quality.color}`}>
                        {quality.label}
                      </Badge>
                    </div>

                    <p className="mb-3 flex-1 text-sm text-muted-foreground line-clamp-3">
                      {post.body_text ?? post.title ?? "No content"}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5 text-red-400" />
                        {formatEngagement(post.engagement_likes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
                        {formatEngagement(post.engagement_comments)}
                      </span>
                      {(post.engagement_shares ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Share2 className="h-3.5 w-3.5 text-green-400" />
                          {formatEngagement(post.engagement_shares)}
                        </span>
                      )}
                      <span className="ml-auto font-semibold text-orange-500">
                        WE: {formatEngagement(getWeightedEngagement(post))}
                      </span>
                    </div>
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        View original post
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Tabs + Top Posts */}
      <Tabs
        defaultValue="all"
        onValueChange={(val: any) => setPlatformFilter(val as string)}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {platforms.includes("instagram") && (
            <TabsTrigger value="instagram">
              <Instagram className="mr-1 h-3.5 w-3.5" />
              Instagram
            </TabsTrigger>
          )}
          {platforms.includes("twitter") && (
            <TabsTrigger value="twitter">
              <Twitter className="mr-1 h-3.5 w-3.5" />
              Twitter/X
            </TabsTrigger>
          )}
          {platforms.includes("linkedin") && (
            <TabsTrigger value="linkedin">
              <Linkedin className="mr-1 h-3.5 w-3.5" />
              LinkedIn
            </TabsTrigger>
          )}
        </TabsList>

        {["all", ...platforms].map((platform) => (
          <TabsContent key={platform} value={platform}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Top Performing Posts</CardTitle>
                    <CardDescription>
                      Sorted by weighted engagement (Comments 3x, Shares 2x, Likes 1x)
                      {platform !== "all"
                        ? ` on ${getPlatformLabel(platform)}`
                        : ""}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sortedPosts.slice(0, 12).map((post) => {
                    const quality = getEngagementQualityLabel(post);
                    return (
                      <div
                        key={post.id}
                        className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/30"
                      >
                        {/* Post header */}
                        <div className="mb-3 flex items-center gap-2">
                          {getPlatformIcon(post.platform ?? "")}
                          <span className="text-sm font-medium truncate">
                            {post.competitor_name}
                          </span>
                          <span className={`ml-auto text-xs ${quality.color}`}>
                            {quality.label}
                          </span>
                        </div>

                        {/* Post content */}
                        <p className="mb-3 flex-1 text-sm text-muted-foreground line-clamp-4">
                          {post.body_text ?? post.title ?? "No content"}
                        </p>

                        {/* Engagement metrics */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5 text-red-400" />
                            {formatEngagement(post.engagement_likes)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
                            {formatEngagement(post.engagement_comments)}
                          </span>
                          {(post.engagement_shares ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <Share2 className="h-3.5 w-3.5 text-green-400" />
                              {formatEngagement(post.engagement_shares)}
                            </span>
                          )}
                          {post.url && (
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto text-primary hover:underline"
                            >
                              View
                            </a>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {post.posted_at
                              ? formatDistanceToNow(new Date(post.posted_at), { addSuffix: true })
                              : ""}
                          </span>
                          <span className="text-xs font-semibold text-primary">
                            WE: {formatEngagement(getWeightedEngagement(post))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sortedPosts.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No posts found for this platform in the selected time period.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Competitor Activity + Content Velocity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-400" />
            Competitor Activity & Content Velocity
          </CardTitle>
          <CardDescription>
            Posting frequency, weighted engagement, and velocity trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
              <div className="col-span-3">Competitor</div>
              <div className="col-span-2 text-center">Posts</div>
              <div className="col-span-2 text-center">Posts/Week</div>
              <div className="col-span-2 text-center">Avg WE</div>
              <div className="col-span-1 text-center">Trend</div>
              <div className="col-span-2"></div>
            </div>
            <Separator />
            {competitorActivity.map((comp) => {
              const maxWeighted = Math.max(
                ...competitorActivity.map((c) => c.weighted_engagement),
                1
              );
              const widthPercent = Math.round(
                (comp.weighted_engagement / maxWeighted) * 100
              );
              return (
                <div key={comp.name} className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 items-center text-sm px-2">
                    <div className="col-span-3 flex items-center gap-2">
                      {getPlatformIcon(comp.primary_platform)}
                      <span className="font-medium truncate">{comp.name}</span>
                    </div>
                    <div className="col-span-2 text-center text-muted-foreground">
                      {comp.post_count}
                    </div>
                    <div className="col-span-2 text-center font-medium">
                      {comp.posts_per_week}
                    </div>
                    <div className="col-span-2 text-center font-semibold text-primary">
                      {formatEngagement(comp.weighted_engagement)}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {comp.velocity_trend === "up" && (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      )}
                      {comp.velocity_trend === "down" && (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      {comp.velocity_trend === "stable" && (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {competitorActivity.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No competitor activity data available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content Mix Analysis + Gap Analysis row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Content Mix */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-indigo-400" />
              Content Mix Analysis
            </CardTitle>
            <CardDescription>
              What types of content competitors post and how each performs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contentMix.length > 0 ? (
              <div className="space-y-3">
                {contentMix.map((mix) => {
                  const maxWE = Math.max(...contentMix.map((m) => m.avg_weighted), 1);
                  const barWidth = Math.round((mix.avg_weighted / maxWE) * 100);
                  return (
                    <div key={mix.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{mix.category}</span>
                          <Badge variant="outline" className="text-xs">
                            {mix.percentage}%
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <span>{mix.count} posts</span>
                          <span className="font-semibold text-primary">
                            WE: {formatEngagement(mix.avg_weighted)}
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
                Not enough data for content mix analysis.
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
              Underserved areas where you can outperform competitors
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
                  No significant gaps detected. Competitors are well-covered across content types and platforms.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content Themes + Hashtags + Posting Patterns row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Content Themes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Content Themes
            </CardTitle>
            <CardDescription>
              AI-analyzed themes across competitor content
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis?.content_themes && analysis.content_themes.length > 0 ? (
              <div className="space-y-3">
                {analysis.content_themes.slice(0, 8).map((theme, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {theme.theme}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {theme.count} posts
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {theme.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Run a social scrape to generate theme analysis.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Hashtag Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-sky-400" />
              Hashtag Analysis
            </CardTitle>
            <CardDescription>
              Top hashtags sorted by weighted engagement
            </CardDescription>
          </CardHeader>
          <CardContent>
            {computedHashtags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {computedHashtags.slice(0, 20).map((tag, i) => (
                  <Badge
                    key={i}
                    variant={i < 5 ? "default" : "secondary"}
                    className="cursor-default"
                  >
                    {tag.hashtag}
                    <span className="ml-1 opacity-70">
                      ({tag.count}) WE:{formatEngagement(tag.avg_engagement)}
                    </span>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hashtags found in competitor posts.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Posting Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-400" />
              Posting Patterns
            </CardTitle>
            <CardDescription>
              When competitors post most frequently
            </CardDescription>
          </CardHeader>
          <CardContent>
            {computedPatterns ? (
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Most Active Days
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {computedPatterns.most_active_days.map((day) => (
                      <Badge key={day} variant="outline">
                        <Calendar className="mr-1 h-3 w-3" />
                        {day}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Peak Hours
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {computedPatterns.peak_hours.map((hour) => (
                      <Badge key={hour} variant="outline">
                        <Clock className="mr-1 h-3 w-3" />
                        {hour}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Avg posts/week
                  </span>
                  <span className="text-sm font-semibold">
                    {computedPatterns.avg_posts_per_week}
                  </span>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Not enough data to determine posting patterns.
              </p>
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
              Actionable insights from social media analysis
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
