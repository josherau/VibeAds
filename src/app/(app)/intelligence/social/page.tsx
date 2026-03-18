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
  Hash,
  Calendar,
  Clock,
  BarChart3,
  Sparkles,
  ArrowRight,
  Users,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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
  primary_platform: string;
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

function getTotalEngagement(post: SocialPost): number {
  return (
    (post.engagement_likes ?? 0) +
    (post.engagement_comments ?? 0) +
    (post.engagement_shares ?? 0)
  );
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
        .limit(200);

      const enrichedPosts: SocialPost[] = (contentData ?? []).map(
        (post: any) => ({
          ...post,
          competitor_name: competitorMap.get(post.competitor_id) ?? "Unknown",
          platform: post.platform ?? post.source,
          engagement_likes: post.engagement_likes ?? 0,
          engagement_comments: post.engagement_comments ?? 0,
          engagement_shares: post.engagement_shares ?? 0,
          posted_at: post.posted_at ?? post.published_at,
        })
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

  async function handleRefresh() {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }
    setScraping(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 115000);

      const res = await fetch("/api/jobs/social-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrandId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Social scrape failed");

      toast.success(
        `Social scrape complete! Found ${data.total_posts ?? 0} posts.`
      );
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

  // Filter posts by platform
  const filteredPosts = useMemo(() => {
    if (platformFilter === "all") return posts;
    return posts.filter((p) => p.platform === platformFilter);
  }, [posts, platformFilter]);

  // Sort by total engagement
  const sortedPosts = useMemo(() => {
    return [...filteredPosts].sort(
      (a, b) => getTotalEngagement(b) - getTotalEngagement(a)
    );
  }, [filteredPosts]);

  // Available platforms from data
  const platforms = useMemo(() => {
    const set = new Set(posts.map((p) => p.platform).filter(Boolean));
    return Array.from(set) as string[];
  }, [posts]);

  // Compute competitor activity from posts if no analysis
  const competitorActivity = useMemo(() => {
    if (analysis?.competitor_activity) return analysis.competitor_activity;

    const map = new Map<
      string,
      { posts: number; engagement: number; platform: string }
    >();
    for (const post of posts) {
      const name = post.competitor_name ?? "Unknown";
      const existing = map.get(name) ?? {
        posts: 0,
        engagement: 0,
        platform: post.platform ?? "unknown",
      };
      existing.posts += 1;
      existing.engagement += getTotalEngagement(post);
      map.set(name, existing);
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        post_count: data.posts,
        avg_engagement: Math.round(data.engagement / data.posts),
        primary_platform: data.platform,
      }))
      .sort((a, b) => b.post_count - a.post_count);
  }, [posts, analysis]);

  // Extract hashtags from post text
  const computedHashtags = useMemo(() => {
    if (analysis?.hashtag_trends) return analysis.hashtag_trends;

    const tagMap = new Map<string, { count: number; totalEng: number }>();
    for (const post of posts) {
      const text = post.body_text ?? "";
      const tags = text.match(/#[\w]+/g) ?? [];
      for (const tag of tags) {
        const lower = tag.toLowerCase();
        const existing = tagMap.get(lower) ?? { count: 0, totalEng: 0 };
        existing.count += 1;
        existing.totalEng += getTotalEngagement(post);
        tagMap.set(lower, existing);
      }
    }

    return Array.from(tagMap.entries())
      .map(([hashtag, data]) => ({
        hashtag,
        count: data.count,
        avg_engagement: Math.round(data.totalEng / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [posts, analysis]);

  // Posting patterns from data
  const computedPatterns = useMemo((): PostingPatterns | null => {
    if (analysis?.posting_patterns) return analysis.posting_patterns;
    if (posts.length === 0) return null;

    const dayCounts = new Map<string, number>();
    const hourCounts = new Map<string, number>();
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    for (const post of posts) {
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

    return {
      most_active_days: sortedDays,
      peak_hours: sortedHours,
      avg_posts_per_week: posts.length > 0 ? Math.round(posts.length / 4) : 0,
    };
  }, [posts, analysis]);

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
          <Button
            onClick={handleRefresh}
            disabled={scraping || !selectedBrandId}
          >
            {scraping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Social Data
          </Button>
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
                ? "Add competitors with Instagram or Twitter handles first, then click \"Refresh Social Data\" to scrape their social posts."
                : competitors.some(
                      (c) => c.instagram_handle || c.twitter_handle
                    )
                  ? "Click \"Refresh Social Data\" to scrape competitor social media posts and generate intelligence."
                  : "Your competitors don't have Instagram or Twitter handles configured. Add social handles in the Competitors page."}
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
            Competitor social media analysis
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
          Refresh Social Data
        </Button>
      </div>

      {/* Stats overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Posts
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{posts.length}</div>
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
              {formatEngagement(
                posts.length > 0
                  ? Math.round(
                      posts.reduce((s, p) => s + getTotalEngagement(p), 0) /
                        posts.length
                    )
                  : 0
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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

        {/* All tab content + platform-specific tabs share same content */}
        {["all", ...platforms].map((platform) => (
          <TabsContent key={platform} value={platform}>
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Posts</CardTitle>
                <CardDescription>
                  Competitor posts sorted by engagement
                  {platform !== "all"
                    ? ` on ${getPlatformLabel(platform)}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sortedPosts.slice(0, 12).map((post) => (
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
                        {post.posted_at && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(post.posted_at), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>

                      {/* Post content */}
                      <p className="mb-3 flex-1 text-sm text-muted-foreground line-clamp-4">
                        {post.body_text ?? post.title ?? "No content"}
                      </p>

                      {/* Engagement metrics */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                    </div>
                  ))}
                </div>
                {sortedPosts.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No posts found for this platform.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Engagement Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-400" />
            Competitor Activity
          </CardTitle>
          <CardDescription>
            Which competitors are most active on social media
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {competitorActivity.map((comp) => {
              const maxPosts = Math.max(
                ...competitorActivity.map((c) => c.post_count),
                1
              );
              const widthPercent = Math.round(
                (comp.post_count / maxPosts) * 100
              );
              return (
                <div key={comp.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {getPlatformIcon(comp.primary_platform)}
                      <span className="font-medium">{comp.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{comp.post_count} posts</span>
                      <span>
                        {formatEngagement(comp.avg_engagement)} avg eng
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${widthPercent}%` }}
                    />
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
              Most used hashtags by competitors
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
                    <span className="ml-1 opacity-70">({tag.count})</span>
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
