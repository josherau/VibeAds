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
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import type { Database } from "@/lib/supabase/types";

type PipelineRun = Database["public"]["Tables"]["pipeline_runs"]["Row"];

export default function DashboardPage() {
  const supabase = createClient();
  const [competitorCount, setCompetitorCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [creativesCount, setCreativesCount] = useState(0);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [compRes, adRes, creativeRes, runsRes] = await Promise.all([
        supabase.from("competitors").select("*", { count: "exact", head: true }),
        supabase.from("competitor_ads").select("*", { count: "exact", head: true }),
        supabase.from("generated_creatives").select("*", { count: "exact", head: true }),
        supabase
          .from("pipeline_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(10),
      ]);

      setCompetitorCount(compRes.count ?? 0);
      setAdsCount(adRes.count ?? 0);
      setCreativesCount(creativeRes.count ?? 0);
      const runs = (runsRes.data ?? []) as PipelineRun[];
      setPipelineRuns(runs);

      if (runs && runs.length > 0) {
        setLastRunAt(runs[0].started_at);
      }
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function runPipeline() {
    setIsRunning(true);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run pipeline");
      toast.success("Pipeline started successfully");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run pipeline");
    } finally {
      setIsRunning(false);
    }
  }

  function getStatusBadge(status: string) {
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

  if (loading) {
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
            Your competitive intelligence overview
          </p>
        </div>
        <Button onClick={runPipeline} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run Pipeline Now
        </Button>
      </div>

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
            History of your competitive intelligence pipeline executions
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
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
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
