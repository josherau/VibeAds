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
  Loader2,
  RefreshCw,
  Globe,
  BarChart3,
  Sparkles,
  ArrowRight,
  Users,
  Zap,
  Target,
  Eye,
  MousePointer,
  FileText,
  Quote,
  Shield,
  Layers,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database } from "@/lib/supabase/types";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────

type CompetitorContent =
  Database["public"]["Tables"]["competitor_content"]["Row"];
type Competitor = Database["public"]["Tables"]["competitors"]["Row"];

interface LandingPageElements {
  headline?: string;
  sub_headline?: string;
  value_proposition?: string;
  ctas?: string[];
  social_proof?: {
    testimonials?: string[];
    logos?: string[];
    stats?: string[];
  };
  pricing_mentions?: string[];
  key_messaging_themes?: string[];
  page_structure?: string[];
  unique_selling_points?: string[];
}

interface LandingPage extends CompetitorContent {
  competitor_name?: string;
  elements?: LandingPageElements;
  page_url?: string;
  cta_count?: number;
  social_proof_count?: number;
  usp_count?: number;
}

interface CtaAnalysisItem {
  cta: string;
  count: number;
  competitors_using?: string[];
}

interface MessagingTheme {
  theme: string;
  description: string;
  competitors_using?: string[];
}

interface ValuePropComparison {
  competitor: string;
  value_prop: string;
  strength: "strong" | "moderate" | "weak";
  reasoning: string;
}

interface SocialProofType {
  type: string;
  count: number;
  effectiveness: string;
}

interface InnovativeSection {
  section: string;
  competitor: string;
  why_effective: string;
}

interface LandingAnalysis {
  cta_analysis?: {
    most_common_ctas?: CtaAnalysisItem[];
    cta_patterns?: string[];
    missing_ctas?: string[];
  };
  messaging_patterns?: {
    common_themes?: MessagingTheme[];
    unique_angles?: { competitor: string; angle: string }[];
    tone_analysis?: string;
  };
  social_proof_analysis?: {
    types_used?: SocialProofType[];
    best_practices?: string[];
    gaps?: string[];
  };
  value_prop_comparison?: ValuePropComparison[];
  gap_analysis?: {
    messaging_gaps?: string[];
    structural_gaps?: string[];
    content_gaps?: string[];
  };
  recommendations?: string[];
  page_structure_patterns?: {
    common_sections?: string[];
    innovative_sections?: InnovativeSection[];
  };
}

// ── Helpers ────────────────────────────────────────────────────

function getStrengthColor(
  strength: string
): string {
  switch (strength) {
    case "strong":
      return "text-emerald-500";
    case "moderate":
      return "text-amber-500";
    case "weak":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

function getStrengthBadgeVariant(
  strength: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (strength) {
    case "strong":
      return "default";
    case "moderate":
      return "secondary";
    case "weak":
      return "destructive";
    default:
      return "outline";
  }
}

// ── Component ──────────────────────────────────────────────────

export default function LandingPageIntelligencePage() {
  const supabase = createClient();
  const {
    selectedBrandId,
    selectedBrand,
    loading: brandLoading,
  } = useBrand();

  const [pages, setPages] = useState<LandingPage[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [analysis, setAnalysis] = useState<LandingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  const fetchData = useCallback(async () => {
    if (!selectedBrandId) {
      setPages([]);
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
        setPages([]);
        setAnalysis(null);
        setLoading(false);
        return;
      }

      const competitorIds = competitorList.map((c) => c.id);
      const competitorMap = new Map(
        competitorList.map((c) => [c.id, c.name])
      );

      // Fetch landing page content
      const { data: contentData } = await supabase
        .from("competitor_content")
        .select("*")
        .in("competitor_id", competitorIds)
        .eq("content_type", "landing_page")
        .order("created_at", { ascending: false })
        .limit(200);

      const enrichedPages: LandingPage[] = (contentData ?? []).map(
        (page: any) => {
          const rawData = page.raw_data ?? {};
          const metrics = page.engagement_metrics ?? {};
          return {
            ...page,
            competitor_name:
              competitorMap.get(page.competitor_id) ?? "Unknown",
            elements: rawData.elements ?? null,
            page_url: rawData.url ?? page.external_id ?? null,
            cta_count: metrics.cta_count ?? 0,
            social_proof_count: metrics.social_proof_count ?? 0,
            usp_count: metrics.usp_count ?? 0,
          };
        }
      );

      setPages(enrichedPages);

      // Fetch latest landing page analysis
      const { data: analysisData } = await supabase
        .from("competitor_analyses")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .eq("analysis_type", "landing_page_intelligence")
        .order("created_at", { ascending: false })
        .limit(1);

      if (analysisData && analysisData.length > 0) {
        const rec = analysisData[0].recommendations;
        if (rec && typeof rec === "object" && !Array.isArray(rec)) {
          setAnalysis(rec as unknown as LandingAnalysis);
        } else {
          setAnalysis(null);
        }
      } else {
        setAnalysis(null);
      }
    } catch {
      toast.error("Failed to load landing page data");
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
      toast.info("Scraping competitor landing pages...");

      const res = await fetch("/api/jobs/landing-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrandId }),
        signal: AbortSignal.timeout(290000),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Landing page scrape failed");

      const totalPages = data.pages_scraped ?? 0;
      if (totalPages > 0) {
        toast.success(
          `Landing page scrape complete! Analyzed ${totalPages} pages from ${data.competitors_processed ?? 0} competitors.`
        );
      } else if (data.message) {
        toast.warning(data.message);
      } else {
        toast.warning(
          "Landing page scrape complete but no pages were found. Make sure competitors have website URLs."
        );
      }

      if (data.errors && Array.isArray(data.errors)) {
        for (const e of data.errors.slice(0, 3)) {
          toast.info(e, { duration: 8000 });
        }
      }
      fetchData();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error(
          "Landing page scrape timed out. Partial results may be saved."
        );
      } else {
        toast.error(
          err instanceof Error ? err.message : "Landing page scrape failed"
        );
      }
      fetchData();
    } finally {
      setScraping(false);
    }
  }

  // ── Computed data ──────────────────────────────────────────────

  // Group pages by competitor
  const pagesByCompetitor = useMemo(() => {
    const map = new Map<
      string,
      { competitorName: string; pages: LandingPage[] }
    >();
    for (const page of pages) {
      const name = page.competitor_name ?? "Unknown";
      const existing = map.get(name) ?? { competitorName: name, pages: [] };
      existing.pages.push(page);
      map.set(name, existing);
    }
    return Array.from(map.values());
  }, [pages]);

  // Stats
  const stats = useMemo(() => {
    const totalPages = pages.length;
    const competitorsTracked = pagesByCompetitor.length;
    const avgCtaCount =
      totalPages > 0
        ? Math.round(
            pages.reduce((s, p) => s + (p.cta_count ?? 0), 0) / totalPages
          )
        : 0;

    // Count common patterns from analysis
    const commonPatterns =
      analysis?.messaging_patterns?.common_themes?.length ??
      analysis?.page_structure_patterns?.common_sections?.length ??
      0;

    return { totalPages, competitorsTracked, avgCtaCount, commonPatterns };
  }, [pages, pagesByCompetitor, analysis]);

  // Aggregate all CTAs
  const allCtas = useMemo(() => {
    const ctaMap = new Map<
      string,
      { cta: string; count: number; competitors: Set<string> }
    >();
    for (const page of pages) {
      const ctas = page.elements?.ctas ?? [];
      const compName = page.competitor_name ?? "Unknown";
      for (const cta of ctas) {
        const normalized = cta.trim().toLowerCase();
        if (!normalized) continue;
        const existing = ctaMap.get(normalized) ?? {
          cta: cta.trim(),
          count: 0,
          competitors: new Set<string>(),
        };
        existing.count += 1;
        existing.competitors.add(compName);
        ctaMap.set(normalized, existing);
      }
    }
    return Array.from(ctaMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [pages]);

  // Aggregate messaging themes
  const allThemes = useMemo(() => {
    const themeMap = new Map<
      string,
      { theme: string; count: number; competitors: Set<string> }
    >();
    for (const page of pages) {
      const themes = page.elements?.key_messaging_themes ?? [];
      const compName = page.competitor_name ?? "Unknown";
      for (const theme of themes) {
        const normalized = theme.trim().toLowerCase();
        if (!normalized) continue;
        const existing = themeMap.get(normalized) ?? {
          theme: theme.trim(),
          count: 0,
          competitors: new Set<string>(),
        };
        existing.count += 1;
        existing.competitors.add(compName);
        themeMap.set(normalized, existing);
      }
    }
    return Array.from(themeMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [pages]);

  // ── Loading state ──────────────────────────────────────────

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────

  if (pages.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Landing Page Intelligence
            </h1>
            <p className="text-muted-foreground mt-1">
              Competitor landing page analysis
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
            Scrape Landing Pages
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Globe className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">
              No landing page data yet
            </h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {competitors.length === 0
                ? "Add competitors with website URLs first, then click \"Scrape Landing Pages\" to analyze their websites."
                : competitors.some((c) => c.website_url)
                  ? "Click \"Scrape Landing Pages\" to analyze competitor websites and extract intelligence."
                  : "Your competitors don't have website URLs configured. Add them on the Competitors page."}
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
            Landing Page Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Competitor website & conversion analysis
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
          Refresh
        </Button>
      </div>

      {/* Stats overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pages Analyzed
            </CardTitle>
            <FileText className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPages}</div>
            <p className="text-xs text-muted-foreground mt-1">
              landing pages scraped
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Competitors Tracked
            </CardTitle>
            <Users className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.competitorsTracked}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              with website data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg CTA Count
            </CardTitle>
            <MousePointer className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgCtaCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              per landing page
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Common Patterns
            </CardTitle>
            <Layers className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.commonPatterns}</div>
            <p className="text-xs text-muted-foreground mt-1">
              identified across competitors
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Competitor Landing Pages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-400" />
            Competitor Landing Pages
          </CardTitle>
          <CardDescription>
            Key elements extracted from each competitor&apos;s website
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagesByCompetitor.map((comp) => {
              // Use the homepage (first page) as the primary
              const primaryPage = comp.pages[0];
              const elements = primaryPage?.elements;
              const allCtas = comp.pages.flatMap(
                (p) => p.elements?.ctas ?? []
              );
              const allProof = comp.pages.reduce(
                (acc, p) => {
                  const sp = p.elements?.social_proof;
                  if (sp) {
                    acc.testimonials.push(...(sp.testimonials ?? []));
                    acc.logos.push(...(sp.logos ?? []));
                    acc.stats.push(...(sp.stats ?? []));
                  }
                  return acc;
                },
                {
                  testimonials: [] as string[],
                  logos: [] as string[],
                  stats: [] as string[],
                }
              );
              const allThemes = comp.pages.flatMap(
                (p) => p.elements?.key_messaging_themes ?? []
              );

              return (
                <div
                  key={comp.competitorName}
                  className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/30"
                >
                  {/* Header */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-semibold truncate">
                        {comp.competitorName}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {comp.pages.length} page
                      {comp.pages.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {/* Headline */}
                  {elements?.headline && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Headline
                      </p>
                      <p className="text-sm font-medium line-clamp-2">
                        {elements.headline}
                      </p>
                    </div>
                  )}

                  {/* Value Proposition */}
                  {elements?.value_proposition && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Value Proposition
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {elements.value_proposition}
                      </p>
                    </div>
                  )}

                  {/* CTAs */}
                  {allCtas.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                        CTAs
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(allCtas)].slice(0, 5).map((cta, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-xs"
                          >
                            {cta}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Social Proof */}
                  {(allProof.testimonials.length > 0 ||
                    allProof.logos.length > 0 ||
                    allProof.stats.length > 0) && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                        Social Proof
                      </p>
                      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {allProof.testimonials.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Quote className="h-3 w-3" />
                            {allProof.testimonials.length} testimonial
                            {allProof.testimonials.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {allProof.logos.length > 0 && (
                          <span className="flex items-center gap-1 ml-2">
                            <Shield className="h-3 w-3" />
                            {allProof.logos.length} logo
                            {allProof.logos.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {allProof.stats.length > 0 && (
                          <span className="flex items-center gap-1 ml-2">
                            <BarChart3 className="h-3 w-3" />
                            {allProof.stats.length} stat
                            {allProof.stats.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Messaging Themes */}
                  {allThemes.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                        Key Themes
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(allThemes)].slice(0, 4).map((theme, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-xs"
                          >
                            {theme}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer with link */}
                  {primaryPage?.page_url && (
                    <div className="mt-auto pt-2">
                      <a
                        href={primaryPage.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Visit site
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {pagesByCompetitor.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No competitor landing page data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* CTA Analysis + Messaging Patterns row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* CTA Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MousePointer className="h-5 w-5 text-emerald-400" />
              CTA Analysis
            </CardTitle>
            <CardDescription>
              Most common calls-to-action across competitor landing pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(analysis?.cta_analysis?.most_common_ctas ?? allCtas).length >
            0 ? (
              <div className="space-y-3">
                {(
                  analysis?.cta_analysis?.most_common_ctas ??
                  allCtas.map((c) => ({
                    cta: c.cta,
                    count: c.count,
                    competitors_using: Array.from(c.competitors),
                  }))
                )
                  .slice(0, 10)
                  .map((item, i) => {
                    const maxCount = Math.max(
                      ...(
                        analysis?.cta_analysis?.most_common_ctas ??
                        allCtas.map((c) => ({
                          cta: c.cta,
                          count: c.count,
                        }))
                      ).map((c) => c.count),
                      1
                    );
                    const barWidth = Math.round(
                      (item.count / maxCount) * 100
                    );
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {item.cta}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {item.count}x
                            {item.competitors_using
                              ? ` (${item.competitors_using.join(", ")})`
                              : ""}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                {/* CTA Patterns */}
                {analysis?.cta_analysis?.cta_patterns &&
                  analysis.cta_analysis.cta_patterns.length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                          CTA Patterns
                        </p>
                        <ul className="space-y-1">
                          {analysis.cta_analysis.cta_patterns.map(
                            (pattern, i) => (
                              <li
                                key={i}
                                className="text-xs text-muted-foreground flex gap-2"
                              >
                                <span className="text-emerald-500 shrink-0">
                                  --
                                </span>
                                {pattern}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    </>
                  )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No CTA data available. Run a landing page scrape first.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Messaging Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-indigo-400" />
              Messaging Patterns
            </CardTitle>
            <CardDescription>
              Common themes across competitor landing pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(analysis?.messaging_patterns?.common_themes ?? allThemes)
              .length > 0 ? (
              <div className="space-y-3">
                {analysis?.messaging_patterns?.common_themes ? (
                  analysis.messaging_patterns.common_themes
                    .slice(0, 8)
                    .map((theme, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {theme.theme}
                          </span>
                          {theme.competitors_using && (
                            <span className="text-xs text-muted-foreground">
                              {theme.competitors_using.length} competitor
                              {theme.competitors_using.length !== 1
                                ? "s"
                                : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {theme.description}
                        </p>
                      </div>
                    ))
                ) : (
                  allThemes.slice(0, 10).map((theme, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm">{theme.theme}</span>
                      <Badge variant="outline" className="text-xs">
                        {theme.count}x ({Array.from(theme.competitors).join(", ")})
                      </Badge>
                    </div>
                  ))
                )}

                {/* Tone analysis */}
                {analysis?.messaging_patterns?.tone_analysis && (
                  <>
                    <Separator className="my-3" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                        Overall Tone
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {analysis.messaging_patterns.tone_analysis}
                      </p>
                    </div>
                  </>
                )}

                {/* Unique angles */}
                {analysis?.messaging_patterns?.unique_angles &&
                  analysis.messaging_patterns.unique_angles.length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                          Unique Angles
                        </p>
                        {analysis.messaging_patterns.unique_angles.map(
                          (angle, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 mb-1"
                            >
                              <span className="text-xs font-medium text-primary shrink-0">
                                {angle.competitor}:
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {angle.angle}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </>
                  )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No messaging pattern data available. Run a landing page scrape
                first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Value Proposition Comparison */}
      {analysis?.value_prop_comparison &&
        analysis.value_prop_comparison.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                Value Proposition Comparison
              </CardTitle>
              <CardDescription>
                How each competitor positions their offering
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  <div className="col-span-2">Competitor</div>
                  <div className="col-span-5">Value Proposition</div>
                  <div className="col-span-1 text-center">Strength</div>
                  <div className="col-span-4">Reasoning</div>
                </div>
                <Separator />
                {analysis.value_prop_comparison.map((vp, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 items-start text-sm px-2"
                  >
                    <div className="col-span-2 font-medium truncate">
                      {vp.competitor}
                    </div>
                    <div className="col-span-5 text-muted-foreground">
                      {vp.value_prop}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Badge
                        variant={getStrengthBadgeVariant(vp.strength)}
                        className="text-xs"
                      >
                        {vp.strength}
                      </Badge>
                    </div>
                    <div className="col-span-4 text-xs text-muted-foreground">
                      {vp.reasoning}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Gap Analysis + Social Proof Analysis row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gap Analysis */}
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-500" />
              Gap Analysis
            </CardTitle>
            <CardDescription>
              What messaging and positioning is missing from competitor pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis?.gap_analysis ? (
              <div className="space-y-4">
                {/* Messaging Gaps */}
                {analysis.gap_analysis.messaging_gaps &&
                  analysis.gap_analysis.messaging_gaps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                        Messaging Gaps
                      </p>
                      {analysis.gap_analysis.messaging_gaps.map((gap, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3 mb-2"
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-muted-foreground">
                              {gap}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Structural Gaps */}
                {analysis.gap_analysis.structural_gaps &&
                  analysis.gap_analysis.structural_gaps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                        Structural Gaps
                      </p>
                      {analysis.gap_analysis.structural_gaps.map((gap, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-blue-500/10 bg-blue-500/5 p-3 mb-2"
                        >
                          <div className="flex items-start gap-2">
                            <Layers className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-muted-foreground">
                              {gap}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Content Gaps */}
                {analysis.gap_analysis.content_gaps &&
                  analysis.gap_analysis.content_gaps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                        Content Gaps
                      </p>
                      {analysis.gap_analysis.content_gaps.map((gap, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-3 mb-2"
                        >
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-muted-foreground">
                              {gap}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Run a landing page scrape to generate gap analysis.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Social Proof Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-sky-400" />
              Social Proof Analysis
            </CardTitle>
            <CardDescription>
              How competitors use social proof on their landing pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis?.social_proof_analysis ? (
              <div className="space-y-4">
                {/* Types used */}
                {analysis.social_proof_analysis.types_used &&
                  analysis.social_proof_analysis.types_used.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                        Types Used
                      </p>
                      <div className="space-y-2">
                        {analysis.social_proof_analysis.types_used.map(
                          (type, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {type.type}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {type.count}x
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {type.effectiveness}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* Best practices */}
                {analysis.social_proof_analysis.best_practices &&
                  analysis.social_proof_analysis.best_practices.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                          Best Practices Observed
                        </p>
                        <ul className="space-y-1">
                          {analysis.social_proof_analysis.best_practices.map(
                            (bp, i) => (
                              <li
                                key={i}
                                className="text-xs text-muted-foreground flex gap-2"
                              >
                                <span className="text-sky-400 shrink-0">
                                  --
                                </span>
                                {bp}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    </>
                  )}

                {/* Gaps */}
                {analysis.social_proof_analysis.gaps &&
                  analysis.social_proof_analysis.gaps.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                          Social Proof Gaps
                        </p>
                        <ul className="space-y-1">
                          {analysis.social_proof_analysis.gaps.map(
                            (gap, i) => (
                              <li
                                key={i}
                                className="text-xs text-muted-foreground flex gap-2"
                              >
                                <span className="text-amber-500 shrink-0">
                                  !!
                                </span>
                                {gap}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    </>
                  )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Show aggregate data from pages */}
                {pages.some(
                  (p) =>
                    (p.elements?.social_proof?.testimonials?.length ?? 0) > 0 ||
                    (p.elements?.social_proof?.logos?.length ?? 0) > 0 ||
                    (p.elements?.social_proof?.stats?.length ?? 0) > 0
                ) ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Quote className="h-4 w-4" />
                        Testimonials
                      </span>
                      <span className="font-medium">
                        {pages.reduce(
                          (s, p) =>
                            s +
                            (p.elements?.social_proof?.testimonials?.length ??
                              0),
                          0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Logo Badges
                      </span>
                      <span className="font-medium">
                        {pages.reduce(
                          (s, p) =>
                            s +
                            (p.elements?.social_proof?.logos?.length ?? 0),
                          0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Statistics
                      </span>
                      <span className="font-medium">
                        {pages.reduce(
                          (s, p) =>
                            s +
                            (p.elements?.social_proof?.stats?.length ?? 0),
                          0
                        )}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Run a landing page scrape to analyze social proof usage.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Page Structure Patterns */}
      {analysis?.page_structure_patterns && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-400" />
              Page Structure Patterns
            </CardTitle>
            <CardDescription>
              Common and innovative page structures across competitor sites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Common sections */}
              {analysis.page_structure_patterns.common_sections &&
                analysis.page_structure_patterns.common_sections.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                      Common Sections
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.page_structure_patterns.common_sections.map(
                        (section, i) => (
                          <Badge
                            key={i}
                            variant={i < 3 ? "default" : "secondary"}
                          >
                            {section}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                )}

              {/* Innovative sections */}
              {analysis.page_structure_patterns.innovative_sections &&
                analysis.page_structure_patterns.innovative_sections.length >
                  0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                      Innovative Sections
                    </p>
                    <div className="space-y-2">
                      {analysis.page_structure_patterns.innovative_sections.map(
                        (item, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-purple-500/10 bg-purple-500/5 p-3"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">
                                {item.section}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {item.competitor}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {item.why_effective}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      {analysis?.recommendations && analysis.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Recommendations
            </CardTitle>
            <CardDescription>
              Actionable insights for outperforming competitor landing pages
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
