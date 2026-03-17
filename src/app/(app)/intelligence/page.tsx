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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Loader2,
  MessageSquare,
  Tag,
  Eye,
  MousePointerClick,
  Lightbulb,
  TrendingUp,
  Clock,
  AlertTriangle,
  Target,
  Shield,
  Zap,
  XCircle,
  BarChart3,
  Filter,
  Crosshair,
  Repeat,
  Ban,
  Rocket,
  Trophy,
  ChevronRight,
  Image as ImageIcon,
  Video,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database, Json } from "@/lib/supabase/types";

type Analysis = Database["public"]["Tables"]["competitor_analyses"]["Row"];
type CompetitorAd = Database["public"]["Tables"]["competitor_ads"]["Row"];
type Competitor = Database["public"]["Tables"]["competitors"]["Row"];

// ── Parsed types ───────────────────────────────────────────

interface PatternItem {
  title?: string;
  description?: string;
  examples?: string[];
  frequency?: string;
}

interface Opportunity {
  title?: string;
  description?: string;
  priority?: "high" | "medium" | "low";
  rationale?: string;
}

interface PositioningGap {
  competitor?: string;
  their_positioning?: string;
  gap?: string;
  opportunity?: string;
  severity?: "big" | "medium" | "small";
}

interface WinningPattern {
  category?: string;
  pattern?: string;
  description?: string;
  examples?: string[];
  frequency?: string;
}

interface AntiPattern {
  phrase?: string;
  pattern?: string;
  reason?: string;
  category?: "overused_phrase" | "saturated_angle" | "ineffective_format" | string;
}

interface Recommendations {
  positioning_angles?: { title: string; description: string }[];
  content_gaps?: { title: string; description: string }[];
  quick_wins?: { title: string; description: string }[];
  long_term_plays?: { title: string; description: string }[];
}

interface EngagementMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
  reach?: number;
  spend_estimate?: string;
  [key: string]: unknown;
}

// ── Parsing helpers ────────────────────────────────────────

function parsePatterns(patterns: Json | null): Record<string, PatternItem[]> {
  if (!patterns || typeof patterns !== "object" || Array.isArray(patterns))
    return {};
  return patterns as unknown as Record<string, PatternItem[]>;
}

function parseOpportunities(opps: Json | null): Opportunity[] {
  if (!opps || !Array.isArray(opps)) return [];
  return opps as unknown as Opportunity[];
}

function parsePositioningGaps(gaps: Json | null): PositioningGap[] {
  if (!gaps || !Array.isArray(gaps)) return [];
  return gaps as unknown as PositioningGap[];
}

function parseWinningPatterns(patterns: Json | null): WinningPattern[] {
  if (!patterns || !Array.isArray(patterns)) return [];
  return patterns as unknown as WinningPattern[];
}

function parseAntiPatterns(patterns: Json | null): AntiPattern[] {
  if (!patterns || !Array.isArray(patterns)) return [];
  return patterns as unknown as AntiPattern[];
}

function parseRecommendations(recs: Json | null): Recommendations {
  if (!recs || typeof recs !== "object" || Array.isArray(recs)) return {};
  return recs as unknown as Recommendations;
}

function parseEngagementMetrics(m: Json | null): EngagementMetrics | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  return m as unknown as EngagementMetrics;
}

// ── Schwartz stages ────────────────────────────────────────

const SCHWARTZ_STAGES = [
  {
    stage: 1,
    label: "First to Market",
    description: "Direct claims work. State what you do simply.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
    borderColor: "border-emerald-500/40",
  },
  {
    stage: 2,
    label: "Second to Market",
    description: "Bigger, bolder claims needed to stand out.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/40",
  },
  {
    stage: 3,
    label: "Market Aware",
    description: "Unique mechanism required to differentiate.",
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    borderColor: "border-amber-500/40",
  },
  {
    stage: 4,
    label: "Sophisticated",
    description: "System/methodology positioning wins.",
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    borderColor: "border-orange-500/40",
  },
  {
    stage: 5,
    label: "Skeptical",
    description: "Identity-driven, trust-first approach required.",
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    borderColor: "border-red-500/40",
  },
];

// ── Sub-components ─────────────────────────────────────────

function PriorityBadge({ priority }: { priority?: string }) {
  switch (priority) {
    case "high":
      return <Badge className="bg-red-600 hover:bg-red-700">High</Badge>;
    case "medium":
      return (
        <Badge className="bg-amber-600 hover:bg-amber-700">Medium</Badge>
      );
    case "low":
      return <Badge variant="secondary">Low</Badge>;
    default:
      return <Badge variant="outline">{priority ?? "Unknown"}</Badge>;
  }
}

function SeverityBadge({ severity }: { severity?: string }) {
  switch (severity) {
    case "big":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700">
          Big Opportunity
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-amber-600 hover:bg-amber-700">
          Medium Opportunity
        </Badge>
      );
    case "small":
      return <Badge variant="secondary">Small Opportunity</Badge>;
    default:
      return <Badge variant="outline">{severity ?? "Opportunity"}</Badge>;
  }
}

function MarketSophisticationStepper({
  currentStage,
}: {
  currentStage: number | null;
}) {
  const stage = currentStage ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-violet-400" />
          Market Sophistication Level
        </CardTitle>
        <CardDescription>
          Schwartz&apos;s 5 stages of market awareness — determines your
          positioning strategy
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stage === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Market sophistication has not been assessed yet. Run the pipeline to
            determine your market&apos;s stage.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Horizontal stepper */}
            <div className="flex items-center gap-1">
              {SCHWARTZ_STAGES.map((s, idx) => {
                const isActive = s.stage === stage;
                const isPast = s.stage < stage;
                return (
                  <div key={s.stage} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center flex-1 gap-1">
                      <div
                        className={`
                          flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all
                          ${
                            isActive
                              ? `${s.borderColor} ${s.bgColor} ${s.color} ring-2 ring-offset-2 ring-offset-background ring-current scale-110`
                              : isPast
                              ? "border-muted-foreground/40 bg-muted-foreground/20 text-muted-foreground"
                              : "border-border bg-background text-muted-foreground/40"
                          }
                        `}
                      >
                        {s.stage}
                      </div>
                      <span
                        className={`text-[10px] sm:text-xs text-center font-medium leading-tight ${
                          isActive ? s.color : "text-muted-foreground"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {idx < SCHWARTZ_STAGES.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 mx-1 mt-[-18px] ${
                          isPast
                            ? "bg-muted-foreground/40"
                            : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active stage details */}
            {stage > 0 && stage <= 5 && (
              <div
                className={`rounded-lg border ${SCHWARTZ_STAGES[stage - 1].borderColor} ${SCHWARTZ_STAGES[stage - 1].bgColor} p-4`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-sm font-semibold ${SCHWARTZ_STAGES[stage - 1].color}`}
                  >
                    Stage {stage}: {SCHWARTZ_STAGES[stage - 1].label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {SCHWARTZ_STAGES[stage - 1].description}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PositioningGapMap({ gaps }: { gaps: PositioningGap[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crosshair className="h-5 w-5 text-cyan-400" />
          Positioning Gap Map
        </CardTitle>
        <CardDescription>
          Where competitors are positioned and where the opportunities lie
        </CardDescription>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No positioning gaps identified yet. Run the pipeline with active
            competitors to generate gap analysis.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {gaps.map((gap, idx) => {
              const borderClass =
                gap.severity === "big"
                  ? "border-emerald-500/50"
                  : gap.severity === "medium"
                  ? "border-amber-500/50"
                  : "border-border";
              return (
                <div
                  key={idx}
                  className={`rounded-lg border-2 ${borderClass} bg-card p-4 space-y-3`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      {gap.competitor ?? `Competitor ${idx + 1}`}
                    </span>
                    <SeverityBadge severity={gap.severity} />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Their Positioning
                      </p>
                      <p className="text-sm text-foreground">
                        {gap.their_positioning ?? "Not identified"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        The Gap
                      </p>
                      <p className="text-sm text-amber-300/90">
                        {gap.gap ?? "Not identified"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Our Opportunity
                      </p>
                      <p className="text-sm text-emerald-300/90">
                        {gap.opportunity ?? "Not identified"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WinningPatternsSection({ patterns }: { patterns: WinningPattern[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, WinningPattern[]> = {};
    patterns.forEach((p) => {
      const cat = p.category ?? "General";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [patterns]);

  const categoryIcons: Record<string, React.ReactNode> = {
    hooks: <MessageSquare className="h-4 w-4" />,
    ctas: <MousePointerClick className="h-4 w-4" />,
    visual: <Eye className="h-4 w-4" />,
    messaging: <MessageSquare className="h-4 w-4" />,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          Winning Patterns
        </CardTitle>
        <CardDescription>
          Patterns identified across competitor ads that are working
        </CardDescription>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No winning patterns identified yet. Run the pipeline to analyze
            competitor strategies.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(grouped).map(([category, items]) => (
              <div
                key={category}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  {categoryIcons[category.toLowerCase()] ?? (
                    <Repeat className="h-4 w-4" />
                  )}
                  <h4 className="text-sm font-semibold capitalize">
                    {category}
                  </h4>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-md bg-muted/50 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">
                          {item.pattern ?? item.description ?? "Pattern"}
                        </p>
                        {item.frequency && (
                          <Badge variant="secondary" className="text-[10px]">
                            {item.frequency}
                          </Badge>
                        )}
                      </div>
                      {item.description && item.pattern && (
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      {item.examples && item.examples.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.examples.slice(0, 3).map((ex, i) => (
                            <p
                              key={i}
                              className="text-[11px] text-muted-foreground pl-2 border-l-2 border-border"
                            >
                              &ldquo;{ex}&rdquo;
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AntiPatternsSection({
  antiPatterns,
}: {
  antiPatterns: AntiPattern[];
}) {
  const categoryLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    overused_phrase: {
      label: "Overused Phrases",
      icon: <Ban className="h-4 w-4" />,
    },
    saturated_angle: {
      label: "Saturated Angles",
      icon: <XCircle className="h-4 w-4" />,
    },
    ineffective_format: {
      label: "Ineffective Formats",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-400" />
          Anti-Patterns
        </CardTitle>
        <CardDescription>
          What NOT to do based on competitive analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        {antiPatterns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No anti-patterns identified yet.
          </p>
        ) : (
          <div className="space-y-2">
            {antiPatterns.map((ap, idx) => {
              const catInfo = categoryLabels[ap.category ?? ""] ?? {
                label: ap.category ?? "Avoid",
                icon: <AlertTriangle className="h-4 w-4" />,
              };
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                >
                  <div className="mt-0.5 text-red-400 shrink-0">
                    {catInfo.icon}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {ap.phrase ?? ap.pattern ?? `Anti-pattern ${idx + 1}`}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[10px] text-red-400 border-red-500/30"
                      >
                        {catInfo.label}
                      </Badge>
                    </div>
                    {ap.reason && (
                      <p className="text-xs text-muted-foreground">
                        {ap.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompetitorAdGallery({
  ads,
  competitors,
}: {
  ads: (CompetitorAd & { competitor_name?: string })[];
  competitors: Competitor[];
}) {
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [competitorFilter, setCompetitorFilter] = useState<string>("all");

  const competitorMap = useMemo(() => {
    const map: Record<string, string> = {};
    competitors.forEach((c) => (map[c.id] = c.name));
    return map;
  }, [competitors]);

  const enrichedAds = useMemo(
    () =>
      ads.map((ad) => ({
        ...ad,
        competitor_name: competitorMap[ad.competitor_id] ?? "Unknown",
      })),
    [ads, competitorMap]
  );

  const platforms = useMemo(
    () => [...new Set(enrichedAds.map((a) => a.source))],
    [enrichedAds]
  );
  const competitorNames = useMemo(
    () => [...new Set(enrichedAds.map((a) => a.competitor_name))],
    [enrichedAds]
  );

  const filteredAds = useMemo(() => {
    let result = enrichedAds;
    if (platformFilter !== "all")
      result = result.filter((a) => a.source === platformFilter);
    if (competitorFilter !== "all")
      result = result.filter((a) => a.competitor_name === competitorFilter);
    return result;
  }, [enrichedAds, platformFilter, competitorFilter]);

  // Group by competitor
  const grouped = useMemo(() => {
    const map: Record<
      string,
      (CompetitorAd & { competitor_name?: string })[]
    > = {};
    filteredAds.forEach((ad) => {
      const name = ad.competitor_name ?? "Unknown";
      if (!map[name]) map[name] = [];
      map[name].push(ad);
    });
    return map;
  }, [filteredAds]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-400" />
              Competitor Ad Gallery
            </CardTitle>
            <CardDescription className="mt-1">
              {enrichedAds.length} ads tracked across {competitorNames.length}{" "}
              competitors
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="all">All Platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={competitorFilter}
              onChange={(e) => setCompetitorFilter(e.target.value)}
            >
              <option value="all">All Competitors</option>
              {competitorNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredAds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No competitor ads found. Add competitors and run the pipeline to
            start tracking.
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([name, compAds]) => (
              <div key={name} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    {name}
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    {compAds.length} ads
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {compAds.map((ad) => {
                    const metrics = parseEngagementMetrics(
                      ad.engagement_metrics
                    );
                    const isActive = ad.is_active !== false;
                    return (
                      <div
                        key={ad.id}
                        className={`rounded-lg border p-3 space-y-2 ${
                          isActive
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {ad.ad_type === "video" ? (
                              <Video className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ImageIcon className="h-3 w-3 text-muted-foreground" />
                            )}
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {ad.source.replace(/_/g, " ")}
                            </Badge>
                            {ad.ad_type && (
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {ad.ad_type}
                              </Badge>
                            )}
                          </div>
                          {isActive ? (
                            <Badge className="bg-emerald-600 text-[10px]">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Inactive
                            </Badge>
                          )}
                        </div>

                        {ad.headline && (
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {ad.headline}
                          </p>
                        )}

                        {ad.body_text && (
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {ad.body_text}
                          </p>
                        )}

                        {ad.cta_text && (
                          <div className="flex items-center gap-1 text-xs text-blue-400">
                            <MousePointerClick className="h-3 w-3" />
                            {ad.cta_text}
                          </div>
                        )}

                        {metrics && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {metrics.likes != null && (
                              <span className="text-[10px] text-muted-foreground">
                                {metrics.likes.toLocaleString()} likes
                              </span>
                            )}
                            {metrics.comments != null && (
                              <span className="text-[10px] text-muted-foreground">
                                {metrics.comments.toLocaleString()} comments
                              </span>
                            )}
                            {metrics.shares != null && (
                              <span className="text-[10px] text-muted-foreground">
                                {metrics.shares.toLocaleString()} shares
                              </span>
                            )}
                          </div>
                        )}

                        {ad.first_seen_at && (
                          <p className="text-[10px] text-muted-foreground/60">
                            First seen:{" "}
                            {format(
                              new Date(ad.first_seen_at),
                              "MMM d, yyyy"
                            )}
                          </p>
                        )}

                        {ad.landing_page_url && (
                          <a
                            href={ad.landing_page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Landing page
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationsSection({ recs }: { recs: Recommendations }) {
  const sections = [
    {
      key: "positioning_angles" as const,
      title: "Top Positioning Angles to Pursue",
      icon: <Target className="h-4 w-4 text-violet-400" />,
      items: recs.positioning_angles ?? [],
      color: "border-violet-500/30",
      bgColor: "bg-violet-500/5",
    },
    {
      key: "content_gaps" as const,
      title: "Content Gaps to Fill",
      icon: <Lightbulb className="h-4 w-4 text-amber-400" />,
      items: recs.content_gaps ?? [],
      color: "border-amber-500/30",
      bgColor: "bg-amber-500/5",
    },
    {
      key: "quick_wins" as const,
      title: "Quick Wins (Next 7 Days)",
      icon: <Zap className="h-4 w-4 text-emerald-400" />,
      items: recs.quick_wins ?? [],
      color: "border-emerald-500/30",
      bgColor: "bg-emerald-500/5",
    },
    {
      key: "long_term_plays" as const,
      title: "Long-Term Plays (90 Days)",
      icon: <Rocket className="h-4 w-4 text-blue-400" />,
      items: recs.long_term_plays ?? [],
      color: "border-blue-500/30",
      bgColor: "bg-blue-500/5",
    },
  ];

  const hasAnyRecs = sections.some((s) => s.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          Strategic Recommendations
        </CardTitle>
        <CardDescription>
          AI-generated action items based on competitive intelligence
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAnyRecs ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No recommendations generated yet. Run the pipeline to get strategic
            recommendations.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map(
              (section) =>
                section.items.length > 0 && (
                  <div
                    key={section.key}
                    className={`rounded-lg border ${section.color} ${section.bgColor} p-4 space-y-3`}
                  >
                    <div className="flex items-center gap-2">
                      {section.icon}
                      <h4 className="text-sm font-semibold text-foreground">
                        {section.title}
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {section.items.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium text-foreground">
                              {item.title}
                            </p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab configuration (original patterns) ──────────────────

const tabConfig = [
  { value: "messaging", label: "Messaging", icon: MessageSquare },
  { value: "offers", label: "Offers", icon: Tag },
  { value: "visual", label: "Visual", icon: Eye },
  { value: "cta", label: "CTAs", icon: MousePointerClick },
];

// ── Main page component ────────────────────────────────────

export default function IntelligencePage() {
  const supabase = createClient();
  const { selectedBrandId, selectedBrand, loading: brandLoading } = useBrand();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [ads, setAds] = useState<CompetitorAd[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!selectedBrandId) {
      setAnalyses([]);
      setAds([]);
      setCompetitors([]);
      setLoading(false);
      return;
    }

    const [analysesRes, competitorsRes] = await Promise.all([
      supabase
        .from("competitor_analyses")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("competitors")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .eq("is_active", true),
    ]);

    if (analysesRes.error) {
      toast.error("Failed to load intelligence data");
    }

    const competitorsList = competitorsRes.data ?? [];

    // Fetch ads for this brand's competitors
    let adsList: CompetitorAd[] = [];
    if (competitorsList.length > 0) {
      const { data: adsData } = await supabase
        .from("competitor_ads")
        .select("*")
        .in("competitor_id", competitorsList.map((c) => c.id))
        .order("created_at", { ascending: false })
        .limit(100);
      adsList = adsData ?? [];
    }

    setAnalyses(analysesRes.data ?? []);
    setAds(adsList);
    setCompetitors(competitorsList);
    setLoading(false);
  }, [supabase, selectedBrandId]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchData();
    }
  }, [fetchData, brandLoading, selectedBrandId]);

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const latestAnalysis = analyses[0] ?? null;
  const patterns = latestAnalysis ? parsePatterns(latestAnalysis.patterns) : {};
  const opportunities = latestAnalysis
    ? parseOpportunities(latestAnalysis.opportunities)
    : [];
  const positioningGaps = latestAnalysis
    ? parsePositioningGaps(latestAnalysis.positioning_gaps)
    : [];
  const winningPatterns = latestAnalysis
    ? parseWinningPatterns(latestAnalysis.winning_patterns)
    : [];
  const antiPatterns = latestAnalysis
    ? parseAntiPatterns(latestAnalysis.anti_patterns)
    : [];
  const marketSophistication = latestAnalysis?.market_sophistication ?? null;
  const recommendations = latestAnalysis
    ? parseRecommendations(latestAnalysis.recommendations)
    : {};

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          {selectedBrand
            ? `Competitive analysis for ${selectedBrand.name}`
            : "AI-powered competitive analysis and market insights based on the Vibe Marketing Playbook"}
        </p>
      </div>

      {analyses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No intelligence yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run the pipeline to generate competitive intelligence from tracked
              competitors
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Latest analysis summary */}
          {latestAnalysis && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {latestAnalysis.title ?? "Latest Analysis"}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {latestAnalysis.analysis_type} &middot;{" "}
                      {format(
                        new Date(latestAnalysis.created_at),
                        "MMM d, yyyy HH:mm"
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    Latest
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {latestAnalysis.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {latestAnalysis.summary}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 1. Market Sophistication Stepper */}
          <MarketSophisticationStepper currentStage={marketSophistication} />

          {/* 2. Positioning Gap Map */}
          <PositioningGapMap gaps={positioningGaps} />

          {/* 3. Winning Patterns */}
          <WinningPatternsSection patterns={winningPatterns} />

          {/* 4. Anti-Patterns */}
          <AntiPatternsSection antiPatterns={antiPatterns} />

          {/* 5. Competitor Ad Gallery */}
          <CompetitorAdGallery ads={ads} competitors={competitors} />

          {/* 6. Strategic Recommendations */}
          <RecommendationsSection recs={recommendations} />

          {/* Original pattern tabs (messaging, offers, visual, CTA) */}
          <Tabs defaultValue="messaging" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              {tabConfig.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-2"
                >
                  <tab.icon className="h-4 w-4 hidden sm:inline" />
                  <span className="text-xs sm:text-sm">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {tabConfig.map((tab) => {
              const items = patterns[tab.value] ?? [];
              return (
                <TabsContent key={tab.value} value={tab.value}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <tab.icon className="h-5 w-5" />
                        {tab.label} Patterns
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                          No {tab.label.toLowerCase()} patterns detected yet.
                          Run the pipeline with active competitors to generate
                          insights.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {items.map((item, idx) => (
                            <div key={idx} className="space-y-2">
                              {idx > 0 && <Separator />}
                              <div className="pt-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-sm">
                                    {item.title ?? `Pattern ${idx + 1}`}
                                  </h4>
                                  {item.frequency && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {item.frequency}
                                    </Badge>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {item.description}
                                  </p>
                                )}
                                {item.examples &&
                                  item.examples.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {item.examples.map((ex, i) => (
                                        <p
                                          key={i}
                                          className="text-xs text-muted-foreground pl-3 border-l-2 border-border"
                                        >
                                          {ex}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>

          {/* Opportunities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-400" />
                Opportunities
              </CardTitle>
              <CardDescription>
                Gaps and opportunities identified from competitive analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No opportunities identified yet
                </p>
              ) : (
                <div className="space-y-4">
                  {opportunities.map((opp, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-4 rounded-lg border border-border p-4"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">
                            {opp.title ?? `Opportunity ${idx + 1}`}
                          </h4>
                          <PriorityBadge priority={opp.priority} />
                        </div>
                        {opp.description && (
                          <p className="text-sm text-muted-foreground">
                            {opp.description}
                          </p>
                        )}
                        {opp.rationale && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            {opp.rationale}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Timeline */}
          {analyses.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Analysis Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analyses.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-4 rounded-lg border border-border p-3"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {a.title ?? a.analysis_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.summary
                            ? a.summary.slice(0, 120) +
                              (a.summary.length > 120 ? "..." : "")
                            : "No summary"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.market_sophistication && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                          >
                            Stage {a.market_sophistication}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-xs shrink-0"
                        >
                          {format(new Date(a.created_at), "MMM d, yyyy")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
