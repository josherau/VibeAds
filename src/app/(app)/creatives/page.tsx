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
import {
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Palette,
  Filter,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

export default function CreativesPage() {
  const supabase = createClient();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Creative | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchCreatives = useCallback(async () => {
    let query = supabase
      .from("generated_creatives")
      .select("*")
      .order("created_at", { ascending: false });

    if (filterPlatform !== "all") query = query.eq("platform", filterPlatform);
    if (filterFormat !== "all") query = query.eq("format", filterFormat);
    if (filterStatus !== "all") query = query.eq("status", filterStatus);

    const { data, error } = await query.limit(50);
    if (error) {
      toast.error("Failed to load creatives");
      return;
    }
    setCreatives(data ?? []);
    setLoading(false);
  }, [supabase, filterPlatform, filterFormat, filterStatus]);

  useEffect(() => {
    fetchCreatives();
  }, [fetchCreatives]);

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
          <h1 className="text-3xl font-bold tracking-tight">Creatives</h1>
          <p className="text-muted-foreground mt-1">
            AI-generated ad creatives based on competitive intelligence
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
            {["all", "single_image", "carousel", "video", "story", "text"].map(
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

                {c.competitive_angle && (
                  <Badge variant="outline" className="text-xs">
                    {c.competitive_angle}
                  </Badge>
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
              {selected.headline && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Headline
                  </h3>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{selected.headline}</p>
                    <CopyButton text={selected.headline} label="Headline" />
                  </div>
                </div>
              )}

              {selected.headline_variants &&
                selected.headline_variants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Headline Variants
                    </h3>
                    <div className="space-y-2">
                      {selected.headline_variants.map((v, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg border border-border p-2"
                        >
                          <p className="text-sm">{v}</p>
                          <CopyButton text={v} label="Variant" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <Separator />

              {selected.primary_text && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Primary Text
                  </h3>
                  <div className="flex items-start gap-2">
                    <p className="text-sm leading-relaxed">{selected.primary_text}</p>
                    <CopyButton text={selected.primary_text} label="Primary text" />
                  </div>
                </div>
              )}

              {selected.primary_text_variants &&
                selected.primary_text_variants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Primary Text Variants
                    </h3>
                    <div className="space-y-2">
                      {selected.primary_text_variants.map((v, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm">{v}</p>
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

              {selected.image_prompt && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Image Prompt
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
