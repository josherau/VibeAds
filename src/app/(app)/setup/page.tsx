"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

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
  analysis: string;
}

const analysisSteps = [
  { label: "Scraping your website...", doneLabel: "Website scraped" },
  { label: "Analyzing your brand voice...", doneLabel: "Brand voice analyzed" },
  {
    label: "Identifying your competitors...",
    doneLabel: "Competitors identified",
  },
  {
    label: "Setting up your dashboard...",
    doneLabel: "Dashboard configured",
  },
];

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
    const intervals = [2000, 3500, 5000]; // delays between steps
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
      const res = await fetch("/api/auto-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      <div className="w-full max-w-2xl space-y-8">
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
            {/* Brand Card */}
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
                    <Badge variant="secondary">{result.brand.tone}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Target Customer
                    </p>
                    <Badge variant="secondary">
                      {result.brand.target_customer}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Competitors Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Competitors Identified
                </CardTitle>
                <CardDescription>
                  We found {result.competitors.length} competitor
                  {result.competitors.length !== 1 ? "s" : ""} in your space
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.competitors.map((comp, i) => (
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
