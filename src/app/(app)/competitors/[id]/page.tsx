"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Loader2, Globe, Instagram, Twitter, Linkedin, Youtube,
  Wand2, Shield, Swords, Target, Zap, AlertTriangle,
  TrendingUp, TrendingDown, Clock, DollarSign, Eye,
  MessageSquare, BarChart3, Megaphone, Lightbulb, CheckCircle2,
  XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

type Competitor = Database["public"]["Tables"]["competitors"]["Row"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Profile = any;

const THREAT_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
  negligible: "bg-gray-400",
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

function ThreatBadge({ level }: { level: string }) {
  return (
    <Badge className={`${THREAT_COLORS[level] || "bg-gray-400"} text-white uppercase text-[10px]`}>
      {level}
    </Badge>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`text-3xl font-bold ${GRADE_COLORS[grade] || "text-muted-foreground"}`}>
      {grade}
    </span>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#ef4444" : score >= 60 ? "#f97316" : score >= 40 ? "#eab308" : "#22c55e";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-[10px] text-muted-foreground">THREAT</span>
      </div>
    </div>
  );
}

function ToneDimensionBar({ label, value }: { label: string; value: number }) {
  const labels = label.split("_");
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="capitalize">{labels[0]}</span>
        <span className="capitalize">{labels[1]}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/30">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function ExpandableSection({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

export default function CompetitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const competitorId = params.id as string;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  const [competitor, setCompetitor] = useState<Competitor | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState("");

  const fetchData = useCallback(async () => {
    const { data: comp } = await supabase
      .from("competitors")
      .select("*")
      .eq("id", competitorId)
      .single();

    if (!comp) {
      toast.error("Competitor not found");
      router.push("/competitors");
      return;
    }
    setCompetitor(comp);

    // Fetch profile
    const { data: prof } = await supabase
      .from("competitor_profiles")
      .select("*")
      .eq("competitor_id", competitorId)
      .single();

    setProfile(prof);
    setLoading(false);
  }, [supabase, competitorId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeStatus("Scraping website and gathering intelligence...");

    try {
      const res = await fetch(`/api/competitors/${competitorId}/analyze`, {
        method: "POST",
        signal: AbortSignal.timeout(115000),
      });

      setAnalyzeStatus("Building competitive dossier...");
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Analysis failed");

      toast.success("Competitive analysis complete!");
      setProfile({
        ...data.analysis,
        analyzed_at: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
      setAnalyzeStatus("");
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!competitor) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/competitors")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{competitor.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              {competitor.website_url && (
                <a href={competitor.website_url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Globe className="h-3.5 w-3.5" />
                  {competitor.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
              {competitor.instagram_handle && (
                <span className="flex items-center gap-1">
                  <Instagram className="h-3.5 w-3.5" /> {competitor.instagram_handle}
                </span>
              )}
              {competitor.twitter_handle && (
                <span className="flex items-center gap-1">
                  <Twitter className="h-3.5 w-3.5" /> {competitor.twitter_handle}
                </span>
              )}
              {competitor.linkedin_url && (
                <span className="flex items-center gap-1">
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </span>
              )}
              {competitor.youtube_url && (
                <a href={competitor.youtube_url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Youtube className="h-3.5 w-3.5" /> YouTube
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {profile ? "Re-Analyze" : "Run Deep Analysis"}
          </Button>
          {analyzeStatus && (
            <p className="text-xs text-muted-foreground animate-pulse">{analyzeStatus}</p>
          )}
          {profile?.analyzed_at && (
            <p className="text-xs text-muted-foreground">
              Last analyzed: {new Date(profile.analyzed_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {!profile ? (
        /* No analysis yet */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Target className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No analysis yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Run a deep analysis to get a comprehensive marketing dossier on {competitor.name}
            </p>
            <Button onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Run Deep Analysis
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overview Row */}
          <div className="grid gap-4 md:grid-cols-4">
            {/* Threat Score */}
            <Card>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="text-sm text-muted-foreground">Threat Level</p>
                  <ThreatBadge level={profile.overall_threat_level || "medium"} />
                </div>
                <ScoreGauge score={profile.overall_score || 50} />
              </CardContent>
            </Card>

            {/* Market Sophistication */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">Market Sophistication</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div key={level} className={`h-3 flex-1 rounded ${
                      level <= (profile.market_sophistication_level || 1)
                        ? "bg-primary"
                        : "bg-muted/30"
                    }`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Stage {profile.market_sophistication_level || "?"} of 5
                </p>
              </CardContent>
            </Card>

            {/* Positioning Type */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">Positioning Type</p>
                <Badge variant="outline" className="text-sm capitalize">
                  {(profile.positioning_type || "unknown").replace(/_/g, " ")}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {profile.unique_mechanism || "No unique mechanism identified"}
                </p>
              </CardContent>
            </Card>

            {/* Funnel Grade */}
            <Card>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="text-sm text-muted-foreground">Funnel Grade</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Biggest leak: {profile.funnel_analysis?.biggest_leak || "Unknown"}
                  </p>
                </div>
                <GradeBadge grade={profile.funnel_analysis?.overall_grade || "?"} />
              </CardContent>
            </Card>
          </div>

          {/* Executive Summary */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {profile.executive_summary || "No summary available"}
              </p>
            </CardContent>
          </Card>

          {/* Core Identity */}
          <ExpandableSection title="Core Identity & Positioning" icon={Target}>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Positioning Statement
                </p>
                <p className="text-sm">{profile.positioning_statement || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Value Proposition
                </p>
                <p className="text-sm">{profile.value_proposition || "—"}</p>
              </div>
              {profile.target_audience && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Primary Audience
                    </p>
                    <p className="text-sm">{profile.target_audience.primary || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Secondary Audience
                    </p>
                    <p className="text-sm">{profile.target_audience.secondary || "—"}</p>
                  </div>
                  {profile.target_audience.pain_points_addressed?.length > 0 && (
                    <div className="md:col-span-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Pain Points Addressed
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.target_audience.pain_points_addressed.map((p: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ExpandableSection>

          {/* Brand Voice Assessment */}
          {profile.brand_voice_assessment && (
            <ExpandableSection title="Brand Voice Assessment" icon={MessageSquare}>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {profile.brand_voice_assessment.personality_traits?.map((t: string, i: number) => (
                    <Badge key={i} className="bg-primary/10 text-primary">{t}</Badge>
                  ))}
                </div>
                {profile.brand_voice_assessment.tone_dimensions && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(profile.brand_voice_assessment.tone_dimensions).map(
                      ([key, value]: [string, any]) => (
                        <ToneDimensionBar key={key} label={key} value={value} />
                      )
                    )}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  {profile.brand_voice_assessment.assessment}
                </p>
              </div>
            </ExpandableSection>
          )}

          {/* SWOT Analysis */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Strengths */}
            <ExpandableSection title="Strengths" icon={Shield}>
              <div className="space-y-3">
                {(profile.strengths || []).map((s: any, i: number) => (
                  <div key={i} className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium">{s.area}</p>
                      <ThreatBadge level={s.threat_level} />
                    </div>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                    {s.evidence && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">
                        Evidence: {s.evidence}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ExpandableSection>

            {/* Weaknesses */}
            <ExpandableSection title="Weaknesses" icon={AlertTriangle}>
              <div className="space-y-3">
                {(profile.weaknesses || []).map((w: any, i: number) => (
                  <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium">{w.area}</p>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {w.exploitability} exploit
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{w.detail}</p>
                    {w.evidence && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">
                        Evidence: {w.evidence}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ExpandableSection>

            {/* Opportunities */}
            <ExpandableSection title="Opportunities For Us" icon={TrendingUp}>
              <div className="space-y-3">
                {(profile.opportunities_for_us || []).map((o: any, i: number) => (
                  <div key={i} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-sm font-medium mb-1">{o.opportunity}</p>
                    <p className="text-xs text-muted-foreground mb-2">{o.strategy}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        Effort: {o.effort}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Impact: {o.impact}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {o.timeframe}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableSection>

            {/* Threats */}
            <ExpandableSection title="Threats From Them" icon={TrendingDown}>
              <div className="space-y-3">
                {(profile.threats_from_them || []).map((t: any, i: number) => (
                  <div key={i} className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium">{t.threat}</p>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {t.likelihood} likelihood
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.mitigation}</p>
                  </div>
                ))}
              </div>
            </ExpandableSection>
          </div>

          {/* Messaging Analysis */}
          {profile.messaging_analysis && (
            <ExpandableSection title="Messaging & Copy Analysis" icon={Megaphone}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      Headline Approach
                    </p>
                    <p className="text-sm">{profile.messaging_analysis.primary_headline_approach}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-1">Copy Grade</p>
                    <GradeBadge grade={profile.messaging_analysis.copywriting_grade || "?"} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {profile.messaging_analysis.key_claims?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Key Claims</p>
                      <ul className="space-y-1">
                        {profile.messaging_analysis.key_claims.map((c: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {profile.messaging_analysis.missing_elements?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Missing Elements</p>
                      <ul className="space-y-1">
                        {profile.messaging_analysis.missing_elements.map((m: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {profile.messaging_analysis.emotional_triggers?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Emotional Triggers</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.messaging_analysis.emotional_triggers.map((t: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-sm text-muted-foreground">{profile.messaging_analysis.assessment}</p>
              </div>
            </ExpandableSection>
          )}

          {/* Funnel Analysis */}
          {profile.funnel_analysis && (
            <ExpandableSection title="Funnel Analysis" icon={BarChart3}>
              <div className="space-y-4">
                {["awareness", "consideration", "decision", "retention"].map((stage) => {
                  const data = profile.funnel_analysis[stage];
                  if (!data) return null;
                  const effectColors: Record<string, string> = {
                    high: "text-green-400",
                    medium: "text-yellow-400",
                    low: "text-red-400",
                  };
                  return (
                    <div key={stage} className="flex items-start gap-3">
                      <div className="w-28 shrink-0">
                        <p className="text-sm font-medium capitalize">{stage}</p>
                        <p className={`text-xs ${effectColors[data.effectiveness] || ""}`}>
                          {data.effectiveness}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.tactics?.map((t: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ExpandableSection>
          )}

          {/* Content Strategy */}
          {profile.content_strategy_assessment && (
            <ExpandableSection title="Content Strategy" icon={Eye} defaultOpen={false}>
              <div className="space-y-3">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Content Types</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.content_strategy_assessment.content_types?.map((t: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Frequency</p>
                    <p className="text-sm">{profile.content_strategy_assessment.content_frequency}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Quality</p>
                    <p className="text-sm capitalize">{profile.content_strategy_assessment.content_quality}</p>
                  </div>
                </div>
                {profile.content_strategy_assessment.content_gaps?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Content Gaps We Can Exploit</p>
                    <ul className="space-y-1">
                      {profile.content_strategy_assessment.content_gaps.map((g: string, i: number) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <Lightbulb className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">{profile.content_strategy_assessment.assessment}</p>
              </div>
            </ExpandableSection>
          )}

          {/* Ad Strategy */}
          {profile.ad_strategy_assessment && (
            <ExpandableSection title="Ad Strategy" icon={Megaphone} defaultOpen={false}>
              <div className="space-y-3">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Platforms</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.ad_strategy_assessment.platforms_used?.map((p: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs capitalize">{p}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Funnel Sophistication</p>
                    <p className="text-sm capitalize">{profile.ad_strategy_assessment.funnel_sophistication}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Monthly Spend</p>
                    <p className="text-sm">{profile.ad_strategy_assessment.estimated_monthly_spend || "Unknown"}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{profile.ad_strategy_assessment.assessment}</p>
              </div>
            </ExpandableSection>
          )}

          {/* Pricing */}
          {profile.pricing_analysis && (
            <ExpandableSection title="Pricing Analysis" icon={DollarSign} defaultOpen={false}>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Model</p>
                  <p className="text-sm capitalize">{profile.pricing_analysis.pricing_model?.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Position</p>
                  <p className="text-sm capitalize">{profile.pricing_analysis.price_positioning?.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Transparency</p>
                  <p className="text-sm capitalize">{profile.pricing_analysis.pricing_transparency?.replace(/_/g, " ")}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">{profile.pricing_analysis.assessment}</p>
            </ExpandableSection>
          )}

          {/* Strategic Playbook */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Attack Vectors */}
            <ExpandableSection title="Attack Vectors" icon={Swords}>
              <div className="space-y-3">
                {(profile.attack_vectors || []).map((a: any, i: number) => (
                  <div key={i} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm font-medium mb-1">{a.vector}</p>
                    <p className="text-xs text-muted-foreground mb-2">{a.strategy}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">Impact: {a.expected_impact}</Badge>
                      <Badge variant="outline" className="text-[10px]">Risk: {a.risk}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableSection>

            {/* Defensive Moves */}
            <ExpandableSection title="Defensive Moves" icon={Shield}>
              <div className="space-y-3">
                {(profile.defensive_moves || []).map((d: any, i: number) => (
                  <div key={i} className="rounded-lg border border-muted p-3">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium">{d.move}</p>
                      <Badge variant="outline" className="text-[10px] uppercase">{d.priority}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Trigger: {d.trigger}</p>
                  </div>
                ))}
              </div>
            </ExpandableSection>
          </div>

          {/* Quick Wins & Long-Term Plays */}
          <div className="grid gap-4 md:grid-cols-2">
            <ExpandableSection title="Quick Wins" icon={Zap}>
              <div className="space-y-3">
                {(profile.quick_wins || []).map((q: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <Clock className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{q.action}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{q.timeframe}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{q.expected_result}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ExpandableSection>

            <ExpandableSection title="Long-Term Plays" icon={TrendingUp}>
              <div className="space-y-3">
                {(profile.long_term_plays || []).map((l: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="text-sm font-medium mb-1">{l.play}</p>
                    <div className="flex gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">{l.timeframe}</Badge>
                      <Badge variant="outline" className="text-[10px]">Investment: {l.investment}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{l.expected_outcome}</p>
                  </div>
                ))}
              </div>
            </ExpandableSection>
          </div>
        </>
      )}
    </div>
  );
}
