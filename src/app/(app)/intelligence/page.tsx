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
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Database, Json } from "@/lib/supabase/types";

type Analysis = Database["public"]["Tables"]["competitor_analyses"]["Row"];

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

function parsePatterns(patterns: Json | null): Record<string, PatternItem[]> {
  if (!patterns || typeof patterns !== "object" || Array.isArray(patterns)) {
    return {};
  }
  return patterns as unknown as Record<string, PatternItem[]>;
}

function parseOpportunities(opps: Json | null): Opportunity[] {
  if (!opps || !Array.isArray(opps)) return [];
  return opps as unknown as Opportunity[];
}

function PriorityBadge({ priority }: { priority?: string }) {
  switch (priority) {
    case "high":
      return <Badge className="bg-red-600 hover:bg-red-700">High</Badge>;
    case "medium":
      return <Badge className="bg-amber-600 hover:bg-amber-700">Medium</Badge>;
    case "low":
      return <Badge variant="secondary">Low</Badge>;
    default:
      return <Badge variant="outline">{priority ?? "Unknown"}</Badge>;
  }
}

const tabConfig = [
  { value: "messaging", label: "Messaging Patterns", icon: MessageSquare },
  { value: "offers", label: "Offer Structures", icon: Tag },
  { value: "visual", label: "Visual Styles", icon: Eye },
  { value: "cta", label: "CTA Patterns", icon: MousePointerClick },
];

export default function IntelligencePage() {
  const supabase = createClient();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalyses = useCallback(async () => {
    const { data, error } = await supabase
      .from("competitor_analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      toast.error("Failed to load intelligence data");
      return;
    }
    setAnalyses(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  if (loading) {
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          AI-powered competitive analysis and market insights
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

          <Tabs defaultValue="messaging" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              {tabConfig.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
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
                        {tab.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                          No {tab.label.toLowerCase()} detected yet. Run the pipeline
                          with active competitors to generate insights.
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
                                    <Badge variant="secondary" className="text-xs">
                                      {item.frequency}
                                    </Badge>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {item.description}
                                  </p>
                                )}
                                {item.examples && item.examples.length > 0 && (
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
                      <Badge variant="outline" className="text-xs shrink-0">
                        {format(new Date(a.created_at), "MMM d, yyyy")}
                      </Badge>
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
