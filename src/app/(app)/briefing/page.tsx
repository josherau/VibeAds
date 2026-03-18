"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Sparkles,
  Trophy,
  AlertTriangle,
  CheckSquare,
  Swords,
  Lightbulb,
  Clock,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  BarChart3,
  Megaphone,
  Palette,
  FileText,
  Crosshair,
  Layers,
  ArrowRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database, Json } from "@/lib/supabase/types";

type Briefing = Database["public"]["Tables"]["briefings"]["Row"];

// ── Parsed types ─────────────────────────────────────────────

interface Win {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

interface Concern {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
}

interface ActionItem {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "content" | "ads" | "competitors" | "strategy";
}

interface CompetitorMove {
  competitor: string;
  move: string;
  implication: string;
}

interface ContentRecommendation {
  type: "blog" | "social" | "ad" | "email" | "video";
  topic: string;
  reasoning: string;
  platform: string;
}

interface KeyMetrics {
  total_competitor_ads_tracked: number;
  new_ads_this_week: number;
  creatives_generated: number;
  content_pieces_analyzed: number;
  positioning_gaps_found: number;
  market_sophistication_level: number;
}

// ── Helpers ──────────────────────────────────────────────────

function parseJson<T>(val: Json | null, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  return val as unknown as T;
}

function severityColor(level: string) {
  switch (level) {
    case "high":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "low":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function impactColor(level: string) {
  switch (level) {
    case "high":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "medium":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "low":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function priorityDot(level: string) {
  switch (level) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-blue-500";
    default:
      return "bg-zinc-500";
  }
}

function categoryIcon(cat: string) {
  switch (cat) {
    case "content":
      return <FileText className="h-3.5 w-3.5" />;
    case "ads":
      return <Megaphone className="h-3.5 w-3.5" />;
    case "competitors":
      return <Swords className="h-3.5 w-3.5" />;
    case "strategy":
      return <Crosshair className="h-3.5 w-3.5" />;
    default:
      return <Layers className="h-3.5 w-3.5" />;
  }
}

function contentTypeLabel(type: string) {
  switch (type) {
    case "blog":
      return "Blog Post";
    case "social":
      return "Social Media";
    case "ad":
      return "Advertisement";
    case "email":
      return "Email";
    case "video":
      return "Video";
    default:
      return type;
  }
}

// ── Health Score Gauge ───────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (clampedScore / 100) * circumference;

  let strokeColor = "stroke-red-500";
  let glowColor = "drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]";
  let label = "Needs Attention";

  if (clampedScore >= 80) {
    strokeColor = "stroke-emerald-500";
    glowColor = "drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    label = "Excellent";
  } else if (clampedScore >= 60) {
    strokeColor = "stroke-amber-500";
    glowColor = "drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]";
    label = "Good";
  } else if (clampedScore >= 40) {
    strokeColor = "stroke-orange-500";
    glowColor = "drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]";
    label = "Fair";
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${glowColor}`}>
        <svg width="140" height="140" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-zinc-800"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${strokeColor} transition-all duration-1000 ease-out`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{clampedScore}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function BriefingPage() {
  const supabase = createClient();
  const {
    selectedBrandId,
    selectedBrand,
    brands,
    loading: brandLoading,
  } = useBrand();

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [previousBriefings, setPreviousBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);

  const fetchBriefings = useCallback(async () => {
    if (!selectedBrandId) {
      setBriefing(null);
      setPreviousBriefings([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("briefings")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        setBriefing(data[0]);
        setPreviousBriefings(data.slice(1));
      } else {
        setBriefing(null);
        setPreviousBriefings([]);
      }
    } catch {
      toast.error("Failed to load briefings");
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedBrandId]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchBriefings();
    }
  }, [fetchBriefings, brandLoading, selectedBrandId]);

  async function generateBriefing() {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/jobs/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrandId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate briefing");

      toast.success("Briefing generated successfully!");
      fetchBriefings();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate briefing"
      );
    } finally {
      setGenerating(false);
    }
  }

  // Parse briefing data
  const execSummary = briefing?.executive_summary ?? null;
  const healthScore = briefing?.health_score ?? 0;
  const metrics = parseJson<KeyMetrics>(briefing?.key_metrics ?? null, {
    total_competitor_ads_tracked: 0,
    new_ads_this_week: 0,
    creatives_generated: 0,
    content_pieces_analyzed: 0,
    positioning_gaps_found: 0,
    market_sophistication_level: 0,
  });
  const wins = parseJson<Win[]>(briefing?.wins ?? null, []);
  const concerns = parseJson<Concern[]>(briefing?.concerns ?? null, []);
  const actionItems = parseJson<ActionItem[]>(
    briefing?.action_items ?? null,
    []
  );
  const competitorMoves = parseJson<CompetitorMove[]>(
    briefing?.competitor_moves ?? null,
    []
  );
  const contentRecs = parseJson<ContentRecommendation[]>(
    briefing?.content_recommendations ?? null,
    []
  );

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────

  if (!briefing) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              AI CMO Briefing
            </h1>
            <p className="text-muted-foreground mt-1">
              {selectedBrand
                ? `Marketing intelligence for ${selectedBrand.name}`
                : "Your AI-powered marketing briefing"}
            </p>
          </div>
        </div>

        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-6 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-semibold">
                No briefing generated yet
              </p>
              <p className="text-muted-foreground max-w-md">
                Generate your first AI CMO briefing to get an executive overview
                of your competitive landscape, key wins, concerns, and
                actionable recommendations.
              </p>
            </div>
            <Button
              size="lg"
              onClick={generateBriefing}
              disabled={generating || !selectedBrandId}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generating ? "Generating Briefing..." : "Generate First Briefing"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Full briefing view ──────────────────────────────────

  const metricCards = [
    {
      label: "Competitor Ads Tracked",
      value: metrics.total_competitor_ads_tracked,
      icon: Megaphone,
      color: "text-amber-400",
    },
    {
      label: "New Ads This Week",
      value: metrics.new_ads_this_week,
      icon: TrendingUp,
      color: "text-blue-400",
    },
    {
      label: "Creatives Generated",
      value: metrics.creatives_generated,
      icon: Palette,
      color: "text-emerald-400",
    },
    {
      label: "Content Analyzed",
      value: metrics.content_pieces_analyzed,
      icon: FileText,
      color: "text-purple-400",
    },
    {
      label: "Positioning Gaps",
      value: metrics.positioning_gaps_found,
      icon: Crosshair,
      color: "text-red-400",
    },
    {
      label: "Market Sophistication",
      value: `Level ${metrics.market_sophistication_level}`,
      icon: BarChart3,
      color: "text-cyan-400",
      isText: true,
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            AI CMO Briefing
          </h1>
          <p className="text-muted-foreground mt-1">
            {selectedBrand
              ? `Marketing intelligence for ${selectedBrand.name}`
              : "Your AI-powered marketing briefing"}{" "}
            &mdash;{" "}
            {format(new Date(briefing.created_at), "MMMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <Button
          onClick={generateBriefing}
          disabled={generating || !selectedBrandId}
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {generating ? "Generating..." : "Generate New Briefing"}
        </Button>
      </div>

      {/* ── Health Score + Executive Summary ────────────── */}
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card className="flex items-center justify-center px-8 py-6">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Marketing Health
            </p>
            <HealthGauge score={healthScore} />
          </div>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base leading-relaxed text-foreground/90">
              {execSummary || "No summary available."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Key Metrics Grid ───────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((m) => (
          <Card key={m.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {m.label}
              </CardTitle>
              <m.icon className={`h-4 w-4 ${m.color}`} />
            </CardHeader>
            <CardContent>
              <div
                className={
                  m.isText ? "text-lg font-bold" : "text-3xl font-bold"
                }
              >
                {m.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Wins + Concerns (side by side on large screens) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Wins */}
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <Trophy className="h-5 w-5" />
              Wins
            </CardTitle>
            <CardDescription>Recent positive developments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {wins.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No wins identified yet.
              </p>
            ) : (
              wins.map((w, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-emerald-300">{w.title}</p>
                    <Badge
                      variant="outline"
                      className={impactColor(w.impact)}
                    >
                      {w.impact}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {w.description}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Concerns */}
        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Concerns
            </CardTitle>
            <CardDescription>Issues requiring attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {concerns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No concerns identified.
              </p>
            ) : (
              concerns.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-red-300">{c.title}</p>
                    <Badge
                      variant="outline"
                      className={severityColor(c.severity)}
                    >
                      {c.severity}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Action Items ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            Action Items
          </CardTitle>
          <CardDescription>
            Prioritized tasks based on current intelligence
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No action items right now.
            </p>
          ) : (
            actionItems.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${priorityDot(item.priority)}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{item.title}</p>
                    <Badge
                      variant="outline"
                      className="gap-1 text-xs capitalize"
                    >
                      {categoryIcon(item.category)}
                      {item.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${severityColor(item.priority)}`}
                    >
                      {item.priority} priority
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Competitor Moves ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-orange-400" />
            Competitor Moves
          </CardTitle>
          <CardDescription>
            What competitors have done since your last briefing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {competitorMoves.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No competitor moves detected.
            </p>
          ) : (
            competitorMoves.map((move, i) => (
              <div
                key={i}
                className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="text-orange-400 border-orange-500/30">
                    {move.competitor}
                  </Badge>
                </div>
                <p className="font-medium text-sm">{move.move}</p>
                <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                  <span>{move.implication}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Content Recommendations ────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-400" />
            Content Recommendations
          </CardTitle>
          <CardDescription>
            AI-suggested content ideas based on competitive gaps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {contentRecs.length === 0 ? (
              <p className="text-sm text-muted-foreground col-span-2">
                No content recommendations yet.
              </p>
            ) : (
              contentRecs.map((rec, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant="outline"
                      className="text-yellow-400 border-yellow-500/30 text-xs"
                    >
                      {contentTypeLabel(rec.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {rec.platform}
                    </span>
                  </div>
                  <p className="font-medium text-sm">{rec.topic}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {rec.reasoning}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Previous Briefings ─────────────────────────── */}
      {previousBriefings.length > 0 && (
        <Card>
          <CardHeader>
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  Previous Briefings
                </CardTitle>
                <CardDescription className="mt-1">
                  {previousBriefings.length} earlier briefing
                  {previousBriefings.length !== 1 ? "s" : ""} available
                </CardDescription>
              </div>
              {showPrevious ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showPrevious && (
            <CardContent className="space-y-2">
              {previousBriefings.map((prev) => (
                <button
                  key={prev.id}
                  onClick={() => {
                    setBriefing(prev);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                      <span className="text-sm font-bold">
                        {prev.health_score ?? "--"}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {format(
                          new Date(prev.created_at),
                          "MMMM d, yyyy"
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(prev.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
