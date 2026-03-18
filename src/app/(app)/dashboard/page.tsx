"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Megaphone,
  Palette,
  Clock,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useBrand } from "@/lib/brand-context";
import type { Database } from "@/lib/supabase/types";

type PipelineRun = Database["public"]["Tables"]["pipeline_runs"]["Row"];

export default function DashboardPage() {
  const supabase = createClient();
  const { selectedBrandId, selectedBrand, brands, loading: brandLoading } = useBrand();
  const [competitorCount, setCompetitorCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [creativesCount, setCreativesCount] = useState(0);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!selectedBrandId) {
      setCompetitorCount(0);
      setAdsCount(0);
      setCreativesCount(0);
      setPipelineRuns([]);
      setLastRunAt(null);
      setLoading(false);
      return;
    }

    try {
      const [compRes, creativeRes, runsRes] = await Promise.all([
        supabase
          .from("competitors")
          .select("*", { count: "exact", head: true })
          .eq("brand_id", selectedBrandId),
        supabase
          .from("generated_creatives")
          .select("*", { count: "exact", head: true })
          .eq("brand_id", selectedBrandId),
        supabase
          .from("pipeline_runs")
          .select("*")
          .eq("brand_id", selectedBrandId)
          .order("started_at", { ascending: false })
          .limit(10),
      ]);

      // Count ads through competitors for this brand
      const { data: compIds } = await supabase
        .from("competitors")
        .select("id")
        .eq("brand_id", selectedBrandId);

      let adCount = 0;
      if (compIds && compIds.length > 0) {
        const { count } = await supabase
          .from("competitor_ads")
          .select("*", { count: "exact", head: true })
          .in("competitor_id", compIds.map((c) => c.id));
        adCount = count ?? 0;
      }

      setCompetitorCount(compRes.count ?? 0);
      setAdsCount(adCount);
      setCreativesCount(creativeRes.count ?? 0);
      const runs = (runsRes.data ?? []) as PipelineRun[];
      setPipelineRuns(runs);

      if (runs && runs.length > 0) {
        setLastRunAt(runs[0].started_at);
      } else {
        setLastRunAt(null);
      }
    } catch {
      toast.error("Failed to load dashboard data");
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

  async function runPipeline() {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }
    setIsRunning(true);

    const steps = [
      { key: "meta_ads", label: "Researching competitor ads..." },
      { key: "social", label: "Scraping social media..." },
      { key: "landing_pages", label: "Analyzing landing pages..." },
      { key: "analysis", label: "Running competitive analysis..." },
      { key: "generate", label: "Generating ad creatives..." },
    ];

    let runId: string | undefined;
    let failedSteps = 0;

    for (const step of steps) {
      setPipelineStatus(step.label);
      try {
        const res = await fetch("/api/pipeline/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: selectedBrandId,
            step: step.key,
            run_id: runId,
          }),
          signal: AbortSignal.timeout(280000),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error(`Step ${step.key} failed:`, data.error);
          failedSteps++;
        } else {
          if (!runId) runId = data.run_id;
        }
      } catch (err) {
        console.error(`Step ${step.key} error:`, err);
        failedSteps++;
      }
    }

    setPipelineStatus("");
    setIsRunning(false);

    if (failedSteps === 0) {
      toast.success("Pipeline completed successfully!");
    } else if (failedSteps < steps.length) {
      toast.warning(`Pipeline completed with ${failedSteps} step(s) having issues. Check results.`);
    } else {
      toast.error("Pipeline failed. Check logs for details.");
    }
    fetchData();
  }

  function getStatusBadge(status: string, startedAt?: string) {
    // Detect stale "running" runs (older than 10 minutes)
    if (status === "running" && startedAt) {
      const startedTime = new Date(startedAt).getTime();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (startedTime < tenMinutesAgo) {
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Timed Out
          </Badge>
        );
      }
    }

    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Running
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="mr-1 h-3 w-3" />
            {status}
          </Badge>
        );
    }
  }

  const stats = [
    {
      label: "Competitors Tracked",
      value: competitorCount,
      icon: Users,
      color: "text-blue-400",
    },
    {
      label: "Competitor Ads Found",
      value: adsCount,
      icon: Megaphone,
      color: "text-amber-400",
    },
    {
      label: "Creatives Generated",
      value: creativesCount,
      icon: Palette,
      color: "text-emerald-400",
    },
    {
      label: "Last Pipeline Run",
      value: lastRunAt
        ? formatDistanceToNow(new Date(lastRunAt), { addSuffix: true })
        : "Never",
      icon: Clock,
      color: "text-purple-400",
      isText: true,
    },
  ];

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {selectedBrand
              ? `Competitive intelligence for ${selectedBrand.name}`
              : "Your competitive intelligence overview"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={runPipeline} disabled={isRunning || !selectedBrandId}>
            {isRunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isRunning ? "Running..." : "Run Pipeline Now"}
          </Button>
          {pipelineStatus && (
            <p className="text-xs text-muted-foreground animate-pulse">{pipelineStatus}</p>
          )}
        </div>
      </div>

      {brands.length === 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-4 py-8 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-lg">Get started by analyzing your brand</p>
                <p className="text-sm text-muted-foreground">
                  Enter your website URL and we&apos;ll set up everything automatically
                </p>
              </div>
            </div>
            <Link href="/setup">
              <Button size="lg">
                Start Setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className={stat.isText ? "text-lg font-bold" : "text-3xl font-bold"}>
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Pipeline Runs</CardTitle>
          <CardDescription>
            History of pipeline executions{selectedBrand ? ` for ${selectedBrand.name}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pipelineRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Play className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="text-lg font-medium">No pipeline runs yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click &quot;Run Pipeline Now&quot; to start your first analysis
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Ads Found</TableHead>
                  <TableHead className="text-right">Posts Found</TableHead>
                  <TableHead className="text-right">Pages Analyzed</TableHead>
                  <TableHead className="text-right">Creatives</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipelineRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{getStatusBadge(run.status, run.started_at)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(run.started_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.duration_ms
                        ? `${(run.duration_ms / 1000).toFixed(1)}s`
                        : "--"}
                    </TableCell>
                    <TableCell className="text-right">{run.meta_ads_found}</TableCell>
                    <TableCell className="text-right">{run.social_posts_found}</TableCell>
                    <TableCell className="text-right">{run.pages_analyzed}</TableCell>
                    <TableCell className="text-right">{run.creatives_generated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
