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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Palette,
  Filter,
  ChevronDown,
  Target,
  Brain,
  Lightbulb,
  Image,
  Video,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBrand } from "@/lib/brand-context";
import type { Database } from "@/lib/supabase/types";

type Creative = Database["public"]["Tables"]["generated_creatives"]["Row"];

const platformColors: Record<string, string> = {
  meta: "bg-blue-600 hover:bg-blue-700",
  google: "bg-green-600 hover:bg-green-700",
  linkedin: "bg-sky-700 hover:bg-sky-800",
};

const statusColors: Record<string, string> = {
  draft: "bg-zinc-600",
  approved: "bg-emerald-600",
  rejected: "bg-red-600",
  launched: "bg-purple-600",
};

const angleTypeLabels: Record<string, { label: string; color: string }> = {
  contrarian: { label: "Contrarian", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  unique_mechanism: { label: "Unique Mechanism", color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  transformation: { label: "Transformation", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  enemy: { label: "Enemy", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  speed_ease: { label: "Speed & Ease", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  specificity: { label: "Specificity", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  social_proof: { label: "Social Proof", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  risk_reversal: { label: "Risk Reversal", color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
};

const frameworkLabels: Record<string, string> = {
  curiosity_gap: "Curiosity Gap",
  specific_numbers: "Specific Numbers",
  before_after: "Before/After",
  problem_agitate_solve: "PAS",
  fear_of_missing_out: "FOMO",
  social_proof_lead: "Social Proof Lead",
  direct_benefit: "Direct Benefit",
  story_lead: "Story Lead",
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label ? `${label} copied` : "Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

function ConfidenceBar({ score }: { score: number | null }) {
  const pct = Math.round((score ?? 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className={cn(
            "h-1.5 rounded-full transition-all",
            pct >= 80
              ? "bg-emerald-500"
              : pct >= 50
                ? "bg-amber-500"
                : "bg-red-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function AngleTypeBadge({ angleType }: { angleType: string | null }) {
  if (!angleType) return null;
  const config = angleTypeLabels[angleType];
  if (!config) return <Badge variant="outline" className="text-xs">{angleType}</Badge>;
  return (
    <Badge variant="outline" className={cn("text-xs border", config.color)}>
      <Target className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function FrameworkBadge({ framework }: { framework: string | null }) {
  if (!framework) return null;
  const label = frameworkLabels[framework] ?? framework;
  return (
    <Badge variant="outline" className="text-xs bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
      <Brain className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

function SophisticationBadge({ level }: { level: number | null }) {
  if (!level) return null;
  return (
    <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-300 border-orange-500/30">
      <Zap className="mr-1 h-3 w-3" />
      Schwartz L{level}
    </Badge>
  );
}

function ImageConceptsSection({ concepts }: { concepts: any }) {
  if (!concepts || !Array.isArray(concepts) || concepts.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Image className="h-4 w-4" />
        Image Concepts ({concepts.length})
      </h3>
      <div className="space-y-3">
        {concepts.map((concept: any, i: number) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Concept {i + 1} — {concept.style ?? "N/A"}
              </span>
              {concept.prompt && (
                <CopyButton text={concept.prompt} label="Image prompt" />
              )}
            </div>
            <p className="text-sm">{concept.concept}</p>
            {concept.prompt && (
              <p className="text-xs font-mono text-muted-foreground bg-muted rounded p-2">
                {concept.prompt}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoScriptSection({ script }: { script: string | null }) {
  if (!script) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Video className="h-4 w-4" />
        Video Script Concept
      </h3>
      <div className="flex items-start gap-2 rounded-lg border border-border p-3">
        <p className="text-sm flex-1 whitespace-pre-wrap">{script}</p>
        <CopyButton text={script} label="Video script" />
      </div>
    </div>
  );
}

function PlatformVariantsSection({ creative }: { creative: Creative }) {
  const hasGoogleVariants = creative.google_headlines?.length || creative.google_descriptions?.length;
  const hasLinkedInVariants = creative.linkedin_intro_text || creative.linkedin_headline;

  if (!hasGoogleVariants && !hasLinkedInVariants) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Platform-Specific Variants
      </h3>
      <Tabs defaultValue={hasGoogleVariants ? "google" : "linkedin"}>
        <TabsList>
          {hasGoogleVariants && (
            <TabsTrigger value="google">Google Ads</TabsTrigger>
          )}
          {hasLinkedInVariants && (
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
          )}
        </TabsList>
        {hasGoogleVariants && (
          <TabsContent value="google" className="space-y-3 pt-3">
            {creative.google_headlines && creative.google_headlines.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Headlines (30 char max)
                </p>
                <div className="space-y-1.5">
                  {creative.google_headlines.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-border px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{h}</span>
                        <span className="text-xs text-muted-foreground">
                          ({h.length}/30)
                        </span>
                      </div>
                      <CopyButton text={h} label="Google headline" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {creative.google_descriptions && creative.google_descriptions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Descriptions (90 char max)
                </p>
                <div className="space-y-1.5">
                  {creative.google_descriptions.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-border px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{d}</span>
                        <span className="text-xs text-muted-foreground">
                          ({d.length}/90)
                        </span>
                      </div>
                      <CopyButton text={d} label="Google description" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        )}
        {hasLinkedInVariants && (
          <TabsContent value="linkedin" className="space-y-3 pt-3">
            {creative.linkedin_headline && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Headline</p>
                <div className="flex items-center justify-between rounded border border-border px-2.5 py-1.5">
                  <span className="text-sm">{creative.linkedin_headline}</span>
                  <CopyButton text={creative.linkedin_headline} label="LinkedIn headline" />
                </div>
              </div>
            )}
            {creative.linkedin_intro_text && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Intro Text</p>
                <div className="flex items-start justify-between rounded border border-border p-2.5">
                  <span className="text-sm flex-1">{creative.linkedin_intro_text}</span>
                  <CopyButton text={creative.linkedin_intro_text} label="LinkedIn intro" />
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function CreativesPage() {
  const supabase = createClient();
  const { selectedBrandId, selectedBrand, loading: brandLoading } = useBrand();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Creative | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAngle, setFilterAngle] = useState<string>("all");

  const fetchCreatives = useCallback(async () => {
    if (!selectedBrandId) {
      setCreatives([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("generated_creatives")
      .select("*")
      .eq("brand_id", selectedBrandId)
      .order("created_at", { ascending: false });

    if (filterPlatform !== "all") query = query.eq("platform", filterPlatform);
    if (filterFormat !== "all") query = query.eq("format", filterFormat);
    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    if (filterAngle !== "all") query = query.eq("positioning_angle_type", filterAngle);

    const { data, error } = await query.limit(50);
    if (error) {
      toast.error("Failed to load creatives");
      return;
    }
    setCreatives(data ?? []);
    setLoading(false);
  }, [supabase, selectedBrandId, filterPlatform, filterFormat, filterStatus, filterAngle]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchCreatives();
    }
  }, [fetchCreatives, brandLoading, selectedBrandId]);

  async function handleFeedback(id: string, feedback: "positive" | "negative") {
    try {
      const res = await fetch(`/api/creatives/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      if (!res.ok) throw new Error("Failed to save feedback");
      toast.success(
        feedback === "positive" ? "Marked as good" : "Marked as needs improvement"
      );
      fetchCreatives();
    } catch {
      toast.error("Failed to save feedback");
    }
  }

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
          <h1 className="text-3xl font-bold tracking-tight">Creatives</h1>
          <p className="text-muted-foreground mt-1">
            {selectedBrand
              ? `AI-generated ad creatives for ${selectedBrand.name}`
              : "AI-generated ad creatives based on competitive intelligence and direct response frameworks"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <Filter className="mr-2 h-3 w-3" />
            Platform: {filterPlatform === "all" ? "All" : filterPlatform}
            <ChevronDown className="ml-2 h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["all", "meta", "google", "linkedin"].map((p) => (
              <DropdownMenuItem key={p} onClick={() => setFilterPlatform(p)}>
                {p === "all" ? "All Platforms" : p.charAt(0).toUpperCase() + p.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <Filter className="mr-2 h-3 w-3" />
            Format: {filterFormat === "all" ? "All" : filterFormat}
            <ChevronDown className="ml-2 h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["all", "single_image", "carousel", "video_script", "search_ad"].map(
              (f) => (
                <DropdownMenuItem key={f} onClick={() => setFilterFormat(f)}>
                  {f === "all" ? "All Formats" : f.replace(/_/g, " ")}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <Filter className="mr-2 h-3 w-3" />
            Status: {filterStatus === "all" ? "All" : filterStatus}
            <ChevronDown className="ml-2 h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["all", "draft", "approved", "rejected", "launched"].map((s) => (
              <DropdownMenuItem key={s} onClick={() => setFilterStatus(s)}>
                {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <Target className="mr-2 h-3 w-3" />
            Angle: {filterAngle === "all" ? "All" : (angleTypeLabels[filterAngle]?.label ?? filterAngle)}
            <ChevronDown className="ml-2 h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterAngle("all")}>
              All Angles
            </DropdownMenuItem>
            {Object.entries(angleTypeLabels).map(([key, { label }]) => (
              <DropdownMenuItem key={key} onClick={() => setFilterAngle(key)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {creatives.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Palette className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No creatives yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run the pipeline to generate ad creatives from competitive insights
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creatives.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer transition-colors hover:border-foreground/20"
              onClick={() => setSelected(c)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Badge
                      className={cn(
                        "text-xs capitalize",
                        platformColors[c.platform] ?? "bg-zinc-600"
                      )}
                    >
                      {c.platform}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {c.format.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <Badge
                    className={cn(
                      "text-xs capitalize",
                      statusColors[c.status] ?? "bg-zinc-600"
                    )}
                  >
                    {c.status}
                  </Badge>
                </div>
                {/* Positioning Angle & Framework Badges */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <AngleTypeBadge angleType={c.positioning_angle_type} />
                  <FrameworkBadge framework={c.copywriting_framework} />
                  <SophisticationBadge level={c.schwartz_sophistication_level} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.headline && (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight line-clamp-2">
                      {c.headline}
                    </p>
                    <CopyButton text={c.headline} label="Headline" />
                  </div>
                )}

                {c.primary_text && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {c.primary_text}
                  </p>
                )}

                {c.cta && (
                  <Badge variant="secondary" className="text-xs">
                    {c.cta}
                  </Badge>
                )}

                <ConfidenceBar score={c.confidence_score} />

                {c.psychological_trigger && (
                  <p className="text-xs text-muted-foreground italic">
                    <Lightbulb className="inline h-3 w-3 mr-1" />
                    {c.psychological_trigger}
                  </p>
                )}

                <div className="flex items-center justify-end gap-1 pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      c.feedback === "positive" && "text-emerald-400"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFeedback(c.id, "positive");
                    }}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      c.feedback === "negative" && "text-red-400"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFeedback(c.id, "negative");
                    }}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "capitalize",
                    platformColors[selected.platform] ?? "bg-zinc-600"
                  )}
                >
                  {selected.platform}
                </Badge>
                <Badge variant="outline">{selected.format.replace(/_/g, " ")}</Badge>
                <Badge
                  className={cn(
                    "capitalize",
                    statusColors[selected.status] ?? "bg-zinc-600"
                  )}
                >
                  {selected.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Strategy Badges */}
              <div className="flex flex-wrap gap-2">
                <AngleTypeBadge angleType={selected.positioning_angle_type} />
                <FrameworkBadge framework={selected.copywriting_framework} />
                <SophisticationBadge level={selected.schwartz_sophistication_level} />
              </div>

              {selected.positioning_framework && (
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Positioning Framework</p>
                  <p className="text-sm">{selected.positioning_framework}</p>
                </div>
              )}

              {selected.psychological_trigger && (
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Psychological Trigger</p>
                  <p className="text-sm">{selected.psychological_trigger}</p>
                </div>
              )}

              <Separator />

              {/* Headline with A/B Variants */}
              {selected.headline && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Headline (Primary)
                  </h3>
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="font-semibold flex-1">{selected.headline}</p>
                    <CopyButton text={selected.headline} label="Headline" />
                  </div>
                </div>
              )}

              {selected.headline_variants &&
                selected.headline_variants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Headline A/B Variants
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selected.headline_variants.map((v, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg border border-border p-2.5"
                        >
                          <div>
                            <span className="text-xs text-muted-foreground">Variant {String.fromCharCode(65 + i)}</span>
                            <p className="text-sm font-medium">{v}</p>
                          </div>
                          <CopyButton text={v} label="Variant" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <Separator />

              {/* Primary Text with A/B Variants */}
              {selected.primary_text && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Primary Text (Short)
                  </h3>
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="text-sm leading-relaxed flex-1">{selected.primary_text}</p>
                    <CopyButton text={selected.primary_text} label="Primary text" />
                  </div>
                </div>
              )}

              {selected.primary_text_variants &&
                selected.primary_text_variants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Copy Variants
                    </h3>
                    <div className="space-y-2">
                      {selected.primary_text_variants.map((v, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <span className="text-xs text-muted-foreground">
                                {i === 0 ? "Long Version" : `Variant ${String.fromCharCode(65 + i)}`}
                              </span>
                              <p className="text-sm mt-1">{v}</p>
                            </div>
                            <CopyButton text={v} label="Variant" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <Separator />

              {selected.description && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Description
                  </h3>
                  <p className="text-sm">{selected.description}</p>
                </div>
              )}

              {selected.cta && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Call to Action
                  </h3>
                  <Badge variant="secondary" className="text-sm">
                    {selected.cta}
                  </Badge>
                </div>
              )}

              <Separator />

              {/* Platform-Specific Variants */}
              <PlatformVariantsSection creative={selected} />

              <Separator />

              {/* Image Concepts */}
              {selected.image_prompt && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Primary Image Prompt
                  </h3>
                  <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
                    <p className="text-sm font-mono flex-1">
                      {selected.image_prompt}
                    </p>
                    <CopyButton text={selected.image_prompt} label="Image prompt" />
                  </div>
                </div>
              )}

              {selected.image_concept_description && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Image Concept
                  </h3>
                  <p className="text-sm">{selected.image_concept_description}</p>
                </div>
              )}

              <ImageConceptsSection concepts={selected.image_concepts} />

              <Separator />

              {/* Video Script */}
              <VideoScriptSection script={selected.video_script_concept} />

              <Separator />

              {selected.target_audience && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Target Audience
                  </h3>
                  <p className="text-sm">{selected.target_audience}</p>
                </div>
              )}

              {selected.competitive_angle && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Competitive Angle
                  </h3>
                  <p className="text-sm">{selected.competitive_angle}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Confidence Score
                </h3>
                <ConfidenceBar score={selected.confidence_score} />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant={
                    selected.feedback === "positive" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => handleFeedback(selected.id, "positive")}
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Good
                </Button>
                <Button
                  variant={
                    selected.feedback === "negative" ? "destructive" : "outline"
                  }
                  size="sm"
                  onClick={() => handleFeedback(selected.id, "negative")}
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Needs Work
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
