"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Zap,
  Loader2,
  Check,
  Globe,
  Users,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Target,
  Shield,
  Megaphone,
  BarChart3,
  X,
} from "lucide-react";

interface VoiceProfile {
  summary: string;
  personality_traits: Array<{
    name: string;
    description: string;
  }>;
  tone_dimensions: {
    formal_casual: number;
    serious_playful: number;
    technical_accessible: number;
    reserved_enthusiastic: number;
  };
  vocabulary: {
    use: string[];
    avoid: string[];
  };
}

interface PositioningAngle {
  name: string;
  type: string;
  hook: string;
  headline_directions: string[];
  psychology: string;
  confidence_score: number;
}

interface CompetitorDetail {
  name: string;
  website_url: string;
  reason: string;
  competitive_gap: string;
  positioning_comparison: string;
}

interface BrandResult {
  name: string;
  description: string;
  voice: string;
  tone: string;
  target_customer: string;
}

interface CompetitorResult {
  name: string;
  url: string;
  reason: string;
}

interface SetupResult {
  brand: BrandResult;
  competitors: CompetitorResult[];
  analysis: {
    tone: string;
    voice_description: string;
    target_customer_profile: string;
    value_propositions: string[];
    differentiators: string[];
  };
  voice_profile: VoiceProfile;
  positioning_angles: PositioningAngle[];
  market_sophistication_level: number;
  market_sophistication_reasoning: string;
  anti_positioning: string;
  competitor_details: CompetitorDetail[];
}

const analysisSteps = [
  { label: "Scraping your website...", doneLabel: "Website scraped" },
  { label: "Analyzing your brand voice...", doneLabel: "Brand voice analyzed" },
  {
    label: "Building positioning angles...",
    doneLabel: "Positioning mapped",
  },
  {
    label: "Identifying your competitors...",
    doneLabel: "Competitors identified",
  },
  {
    label: "Setting up your dashboard...",
    doneLabel: "Dashboard configured",
  },
];

const sophisticationStages = [
  { level: 1, name: "Pioneer", description: "First to market -- simple direct claims work" },
  { level: 2, name: "Enlargement", description: "Bigger, bolder claims needed to stand out" },
  { level: 3, name: "Mechanism", description: "Unique mechanism required to differentiate" },
  { level: 4, name: "System", description: "Methodology or system positioning needed" },
  { level: 5, name: "Identity", description: "Skeptical market -- identity-driven messaging" },
];

const angleTypeLabels: Record<string, string> = {
  contrarian: "Contrarian",
  unique_mechanism: "Unique Mechanism",
  transformation: "Transformation",
  enemy: "Common Enemy",
  speed_ease: "Speed & Ease",
  specificity: "Specificity",
  social_proof: "Social Proof",
  risk_reversal: "Risk Reversal",
};

function ToneDimensionBar({ label, value, leftLabel, rightLabel }: {
  label: string;
  value: number;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span className="font-medium text-foreground">{label}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-primary transition-all"
          style={{ width: `${(value / 10) * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-primary bg-background transition-all"
          style={{ left: `calc(${(value / 10) * 100}% - 8px)` }}
        />
      </div>
    </div>
  );
}

function PositioningAngleCard({ angle, index }: { angle: PositioningAngle; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{angle.name}</span>
            <Badge variant="outline" className="text-xs">
              {angleTypeLabels[angle.type] || angle.type}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground italic">
            &ldquo;{angle.hook}&rdquo;
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  angle.confidence_score >= 8
                    ? "bg-emerald-500"
                    : angle.confidence_score >= 5
                      ? "bg-amber-500"
                      : "bg-red-500"
                )}
                style={{ width: `${(angle.confidence_score / 10) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {angle.confidence_score}/10
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-accent/20">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Headline Directions
            </p>
            <ul className="space-y-1.5">
              {angle.headline_directions.map((headline, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                  <span>{headline}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Why This Works
            </p>
            <p className="text-sm text-muted-foreground">{angle.psychology}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");
  const [currentAnalysisStep, setCurrentAnalysisStep] = useState(0);
  const [result, setResult] = useState<SetupResult | null>(null);
  const abortRef = useRef(false);

  // Simulate step progression during analysis
  useEffect(() => {
    if (step !== 2) return;

    abortRef.current = false;
    const intervals = [2000, 3000, 4000, 5000]; // delays between steps
    const timeouts: NodeJS.Timeout[] = [];

    let cumulative = 0;
    intervals.forEach((delay, i) => {
      cumulative += delay;
      const t = setTimeout(() => {
        if (!abortRef.current) {
          setCurrentAnalysisStep(i + 1);
        }
      }, cumulative);
      timeouts.push(t);
    });

    return () => {
      abortRef.current = true;
      timeouts.forEach(clearTimeout);
    };
  }, [step]);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Please enter a website URL");
      return;
    }

    setStep(2);
    setCurrentAnalysisStep(0);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/auto-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");

      setResult(data);
      // Ensure all animation steps show as complete before moving on
      setCurrentAnalysisStep(analysisSteps.length);
      await new Promise((r) => setTimeout(r, 800));
      setStep(3);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to analyze website"
      );
      setStep(1);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className={cn(
        "w-full space-y-8",
        step === 3 ? "max-w-4xl" : "max-w-2xl"
      )}>
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Zap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to VibeAds
          </h1>
          <p className="text-muted-foreground text-lg">
            Let&apos;s set up your competitive intelligence in seconds
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step > s ? (
                  <Check className="h-4 w-4" />
                ) : (
                  s
                )}
              </div>
              {s < 3 && (
                <div
                  className={cn(
                    "h-0.5 w-12 transition-colors",
                    step > s ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Enter URL */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Enter Your Website
              </CardTitle>
              <CardDescription>
                We&apos;ll analyze your site to understand your brand, voice, and
                competitive landscape
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAnalyze} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="website-url">Website URL</Label>
                  <Input
                    id="website-url"
                    type="url"
                    placeholder="https://yourcompany.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="h-12 text-lg"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Analyze My Brand
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Analyzing */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Analyzing your brand...</CardTitle>
              <CardDescription>
                This usually takes 15-30 seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysisSteps.map((s, i) => {
                  const isDone = currentAnalysisStep > i;
                  const isActive = currentAnalysisStep === i;

                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 transition-all",
                        isDone
                          ? "bg-emerald-500/10"
                          : isActive
                            ? "bg-accent"
                            : "opacity-40"
                      )}
                    >
                      {isDone ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                          <Check className="h-3.5 w-3.5 text-white" />
                        </div>
                      ) : isActive ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isDone
                            ? "text-emerald-400"
                            : isActive
                              ? "text-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        {isDone ? s.doneLabel : s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Results */}
        {step === 3 && result && (
          <div className="space-y-6">
            {/* Brand Overview Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Your Brand
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold">{result.brand.name}</h3>
                  <p className="mt-1 text-muted-foreground">
                    {result.brand.description}
                  </p>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Voice
                    </p>
                    <Badge variant="secondary">{result.brand.voice}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Tone
                    </p>
                    <Badge variant="secondary">{result.analysis?.tone || result.brand.tone}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Target Customer
                    </p>
                    <Badge variant="secondary">
                      {result.brand.target_customer || result.analysis?.target_customer_profile?.substring(0, 60) + "..."}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Brand Voice Profile Card */}
            {result.voice_profile && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Brand Voice Profile
                  </CardTitle>
                  <CardDescription>
                    {result.voice_profile.summary}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Personality Traits */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                      Personality Traits
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.voice_profile.personality_traits.map((trait, i) => (
                        <div
                          key={i}
                          className="group relative"
                        >
                          <Badge
                            variant="secondary"
                            className="cursor-help px-3 py-1.5 text-sm hover:bg-primary/20 transition-colors"
                          >
                            {trait.name}
                          </Badge>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-10">
                            {trait.description}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 h-2 w-2 rotate-45 border-b border-r border-border bg-popover" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Tone Dimensions */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                      Tone Dimensions
                    </p>
                    <div className="space-y-4">
                      <ToneDimensionBar
                        label="Formality"
                        value={result.voice_profile.tone_dimensions.formal_casual}
                        leftLabel="Formal"
                        rightLabel="Casual"
                      />
                      <ToneDimensionBar
                        label="Mood"
                        value={result.voice_profile.tone_dimensions.serious_playful}
                        leftLabel="Serious"
                        rightLabel="Playful"
                      />
                      <ToneDimensionBar
                        label="Complexity"
                        value={result.voice_profile.tone_dimensions.technical_accessible}
                        leftLabel="Technical"
                        rightLabel="Accessible"
                      />
                      <ToneDimensionBar
                        label="Energy"
                        value={result.voice_profile.tone_dimensions.reserved_enthusiastic}
                        leftLabel="Reserved"
                        rightLabel="Enthusiastic"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Vocabulary Guide */}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                      Vocabulary Guide
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <p className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                          <Check className="h-4 w-4" />
                          Words to Use
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.voice_profile.vocabulary.use.map((word, i) => (
                            <span
                              key={i}
                              className="inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-500/20"
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                        <p className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                          <X className="h-4 w-4" />
                          Words to Avoid
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.voice_profile.vocabulary.avoid.map((word, i) => (
                            <span
                              key={i}
                              className="inline-block rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-300 border border-red-500/20"
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Positioning Angles Card */}
            {result.positioning_angles && result.positioning_angles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Positioning Angles
                  </CardTitle>
                  <CardDescription>
                    {result.positioning_angles.length} strategic angles for your ad campaigns -- click to expand
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.positioning_angles.map((angle, i) => (
                      <PositioningAngleCard key={i} angle={angle} index={i} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Market Sophistication & Anti-Positioning */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Market Sophistication */}
              {result.market_sophistication_level && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      Market Sophistication
                    </CardTitle>
                    <CardDescription>
                      Schwartz&apos;s Stage {result.market_sophistication_level} of 5
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {sophisticationStages.map((stage) => {
                        const isActive = stage.level === result.market_sophistication_level;
                        const isPast = stage.level < result.market_sophistication_level!;
                        return (
                          <div
                            key={stage.level}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                              isActive
                                ? "bg-primary/10 border border-primary/30"
                                : isPast
                                  ? "opacity-40"
                                  : "opacity-25"
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : isPast
                                    ? "bg-muted text-muted-foreground"
                                    : "border border-muted-foreground/30 text-muted-foreground"
                              )}
                            >
                              {stage.level}
                            </div>
                            <div className="min-w-0">
                              <span className={cn(
                                "font-medium",
                                isActive ? "text-foreground" : "text-muted-foreground"
                              )}>
                                {stage.name}
                              </span>
                              {isActive && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {stage.description}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {result.market_sophistication_reasoning && (
                      <p className="text-xs text-muted-foreground border-t border-border pt-3">
                        {result.market_sophistication_reasoning}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Anti-Positioning */}
              {result.anti_positioning && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shield className="h-5 w-5 text-primary" />
                      What We&apos;re NOT
                    </CardTitle>
                    <CardDescription>
                      Anti-positioning creates clarity by contrast
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border border-border bg-accent/30 p-4">
                      <p className="text-sm leading-relaxed italic text-foreground/90">
                        &ldquo;{result.anti_positioning}&rdquo;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Competitors Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Competitors Identified
                </CardTitle>
                <CardDescription>
                  We found {(result.competitor_details || result.competitors).length} competitor
                  {(result.competitor_details || result.competitors).length !== 1 ? "s" : ""} in your space
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(result.competitor_details || []).map((comp, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="font-semibold">{comp.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {comp.website_url}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {comp.reason}
                          </p>
                        </div>
                        {comp.competitive_gap && (
                          <div className="rounded-md bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                            <p className="text-xs font-medium text-amber-400 mb-0.5">Competitive Gap</p>
                            <p className="text-xs text-muted-foreground">{comp.competitive_gap}</p>
                          </div>
                        )}
                        {comp.positioning_comparison && (
                          <div className="rounded-md bg-blue-500/5 border border-blue-500/20 px-3 py-2">
                            <p className="text-xs font-medium text-blue-400 mb-0.5">Positioning Difference</p>
                            <p className="text-xs text-muted-foreground">{comp.positioning_comparison}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Fallback to old competitor format if competitor_details not available */}
                  {!result.competitor_details && result.competitors.map((comp, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{comp.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {comp.url}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {comp.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => router.push("/settings")}
              >
                Edit Settings
              </Button>
              <Button
                size="lg"
                onClick={() => router.push("/dashboard")}
              >
                Looks Good &mdash; Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
