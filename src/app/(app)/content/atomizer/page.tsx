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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  Zap,
  FileText,
  Video,
  Mic,
  BookOpen,
  Mail,
  Quote,
  MessageSquare,
  LayoutGrid,
  Hash,
  Image,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBrand } from "@/lib/brand-context";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/lib/supabase/types";

type ContentAtom = Database["public"]["Tables"]["content_atoms"]["Row"];

interface Atom {
  platform: string;
  type: string;
  content?: string;
  hashtags?: string[];
  media_prompt?: string;
  word_count?: number;
  slides?: Array<{ slide_number: number; headline: string; body: string }>;
  caption?: string;
  subject_line?: string;
  preview_text?: string;
}

const sourceTypes = [
  { value: "blog_post", label: "Blog Post", icon: FileText },
  { value: "video_transcript", label: "Video Transcript", icon: Video },
  { value: "podcast_episode", label: "Podcast Episode", icon: Mic },
  { value: "case_study", label: "Case Study", icon: BookOpen },
  { value: "newsletter", label: "Newsletter", icon: Mail },
  { value: "custom", label: "Custom", icon: FileText },
];

const platformColorMap: Record<string, string> = {
  linkedin: "bg-sky-700",
  twitter: "bg-zinc-700",
  instagram: "bg-pink-600",
  facebook: "bg-blue-600",
  tiktok: "bg-fuchsia-600",
  threads: "bg-zinc-600",
  email: "bg-amber-600",
  all: "bg-purple-600",
};

const typeIcons: Record<string, typeof FileText> = {
  post: MessageSquare,
  thread: MessageSquare,
  carousel: LayoutGrid,
  video_script: Video,
  newsletter: Mail,
  pull_quote: Quote,
  blog_summary: FileText,
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

function AtomCard({ atom }: { atom: Atom }) {
  const Icon = typeIcons[atom.type] ?? FileText;
  const fullContent = getAtomFullContent(atom);

  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Badge
              className={cn(
                "text-xs capitalize",
                platformColorMap[atom.platform] ?? "bg-zinc-600"
              )}
            >
              {atom.platform === "twitter" ? "Twitter/X" : atom.platform === "all" ? "All Platforms" : atom.platform}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Icon className="mr-1 h-3 w-3" />
              {atom.type.replace(/_/g, " ")}
            </Badge>
          </div>
          {atom.word_count && (
            <span className="text-xs text-muted-foreground">
              {atom.word_count} words
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Email-specific fields */}
        {atom.type === "newsletter" && atom.subject_line && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Subject Line</span>
              <CopyButton text={atom.subject_line} label="Subject line" />
            </div>
            <p className="text-sm font-semibold">{atom.subject_line}</p>
            {atom.preview_text && (
              <p className="text-xs text-muted-foreground italic">{atom.preview_text}</p>
            )}
            <Separator className="my-2" />
          </div>
        )}

        {/* Carousel slides */}
        {atom.type === "carousel" && atom.slides && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              {atom.slides.length} Slides
            </span>
            <div className="space-y-1.5">
              {atom.slides.map((slide) => (
                <div
                  key={slide.slide_number}
                  className="rounded border border-border p-2 space-y-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs h-5 w-5 p-0 justify-center">
                      {slide.slide_number}
                    </Badge>
                    <span className="text-sm font-medium">{slide.headline}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{slide.body}</p>
                </div>
              ))}
            </div>
            {atom.caption && (
              <>
                <Separator className="my-2" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Caption</span>
                  <div className="flex items-start justify-between gap-2 mt-1">
                    <p className="text-sm whitespace-pre-wrap">{atom.caption}</p>
                    <CopyButton text={atom.caption} label="Caption" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Standard content */}
        {atom.content && atom.type !== "carousel" && (
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-8">
              {atom.content}
            </p>
            <CopyButton text={atom.content} label="Content" />
          </div>
        )}

        {/* Hashtags */}
        {atom.hashtags && atom.hashtags.length > 0 && (
          <div className="flex items-start gap-1.5">
            <Hash className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {atom.hashtags.map((t) => `#${t}`).join(" ")}
            </p>
          </div>
        )}

        {/* Media prompt */}
        {atom.media_prompt && (
          <div className="flex items-start gap-1.5">
            <Image className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground italic">{atom.media_prompt}</p>
          </div>
        )}

        {/* Copy all button */}
        {fullContent && (
          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
              await navigator.clipboard.writeText(fullContent);
              toast.success("Full content copied");
            }}>
              <Copy className="mr-1 h-3 w-3" />
              Copy All
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getAtomFullContent(atom: Atom): string {
  const parts: string[] = [];
  if (atom.subject_line) parts.push(`Subject: ${atom.subject_line}`);
  if (atom.preview_text) parts.push(`Preview: ${atom.preview_text}`);
  if (atom.slides) {
    atom.slides.forEach((s) => {
      parts.push(`Slide ${s.slide_number}: ${s.headline}\n${s.body}`);
    });
  }
  if (atom.caption) parts.push(`Caption: ${atom.caption}`);
  if (atom.content) parts.push(atom.content);
  if (atom.hashtags && atom.hashtags.length > 0) {
    parts.push(atom.hashtags.map((t) => `#${t}`).join(" "));
  }
  return parts.join("\n\n");
}

function AtomSection({
  title,
  atoms,
  icon: Icon,
}: {
  title: string;
  atoms: Atom[];
  icon: typeof FileText;
}) {
  if (atoms.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        {title}
        <Badge variant="secondary" className="text-xs">
          {atoms.length}
        </Badge>
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {atoms.map((atom, i) => (
          <AtomCard key={`${atom.platform}-${atom.type}-${i}`} atom={atom} />
        ))}
      </div>
    </div>
  );
}

export default function ContentAtomizerPage() {
  const supabase = createClient();
  const { selectedBrandId, selectedBrand, loading: brandLoading } = useBrand();

  // Input state
  const [sourceType, setSourceType] = useState("blog_post");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [atomizing, setAtomizing] = useState(false);

  // Output state
  const [currentAtoms, setCurrentAtoms] = useState<Atom[]>([]);
  const [currentSummary, setCurrentSummary] = useState<string | null>(null);
  const [atomCount, setAtomCount] = useState(0);

  // History state
  const [history, setHistory] = useState<ContentAtom[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!selectedBrandId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("content_atoms")
      .select("*")
      .eq("brand_id", selectedBrandId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      toast.error("Failed to load history");
      return;
    }
    setHistory(data ?? []);
    setLoading(false);
  }, [supabase, selectedBrandId]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchHistory();
    }
  }, [fetchHistory, brandLoading, selectedBrandId]);

  async function handleAtomize() {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }
    if (!sourceTitle.trim() || !sourceContent.trim()) {
      toast.error("Please enter a title and content");
      return;
    }

    setAtomizing(true);
    try {
      const res = await fetch("/api/jobs/atomize-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: selectedBrandId,
          source_type: sourceType,
          source_title: sourceTitle,
          source_content: sourceContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Atomization failed");

      setCurrentAtoms(data.atoms as Atom[]);
      setCurrentSummary(data.source_summary);
      setAtomCount(data.atom_count);
      toast.success(`Created ${data.atom_count} content atoms!`);
      fetchHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Atomization failed");
    } finally {
      setAtomizing(false);
    }
  }

  function viewHistoryItem(item: ContentAtom) {
    const atoms = (Array.isArray(item.atoms) ? item.atoms : []) as unknown as Atom[];
    setCurrentAtoms(atoms);
    setCurrentSummary(item.source_summary);
    setAtomCount(item.atom_count);
    setViewingHistory(item.id);
  }

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group atoms by section
  const socialPosts = currentAtoms.filter(
    (a) => a.type === "post" && ["linkedin", "twitter", "instagram", "facebook", "threads"].includes(a.platform)
  );
  const carousels = currentAtoms.filter((a) => a.type === "carousel");
  const videoScripts = currentAtoms.filter((a) => a.type === "video_script");
  const newsletters = currentAtoms.filter((a) => a.type === "newsletter");
  const pullQuotes = currentAtoms.filter((a) => a.type === "pull_quote");
  const threads = currentAtoms.filter((a) => a.type === "thread");
  const blogSummaries = currentAtoms.filter((a) => a.type === "blog_summary");

  const SourceIcon = sourceTypes.find((s) => s.value === sourceType)?.icon ?? FileText;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content Atomizer</h1>
        <p className="text-muted-foreground mt-1">
          {selectedBrand
            ? `Turn 1 piece of content into 20+ platform-optimized assets for ${selectedBrand.name}`
            : "Turn 1 piece of content into 20+ platform-optimized assets"}
        </p>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Source Content
          </CardTitle>
          <CardDescription>
            Paste your content below and we will atomize it into platform-specific pieces
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Source Type */}
            <div className="space-y-2">
              <Label>Source Type</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="w-full justify-between" />}
                >
                  <span className="flex items-center gap-2">
                    <SourceIcon className="h-4 w-4" />
                    {sourceTypes.find((s) => s.value === sourceType)?.label ?? sourceType}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {sourceTypes.map((s) => (
                    <DropdownMenuItem key={s.value} onClick={() => setSourceType(s.value)}>
                      <s.icon className="mr-2 h-4 w-4" />
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Enter the title of your content..."
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
              />
            </div>
          </div>

          {/* Content Area */}
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              placeholder="Paste your blog post, transcript, case study, or any content here..."
              className="min-h-[200px] resize-y"
              value={sourceContent}
              onChange={(e) => setSourceContent(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {sourceContent.split(/\s+/).filter(Boolean).length} words
              </span>
              <Button
                onClick={handleAtomize}
                disabled={atomizing || !selectedBrandId || !sourceTitle.trim() || !sourceContent.trim()}
              >
                {atomizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Atomize Content
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Output Section */}
      {currentAtoms.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Atomized Content
                <Badge variant="secondary" className="ml-2 text-sm">
                  {atomCount} atoms
                </Badge>
              </h2>
              {currentSummary && (
                <p className="text-sm text-muted-foreground mt-1">{currentSummary}</p>
              )}
            </div>
            {viewingHistory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentAtoms([]);
                  setCurrentSummary(null);
                  setAtomCount(0);
                  setViewingHistory(null);
                }}
              >
                Clear View
              </Button>
            )}
          </div>

          <Separator />

          <AtomSection title="Social Posts" atoms={socialPosts} icon={MessageSquare} />
          <AtomSection title="Carousels" atoms={carousels} icon={LayoutGrid} />
          <AtomSection title="Twitter/X Threads" atoms={threads} icon={MessageSquare} />
          <AtomSection title="Short-form Video Scripts" atoms={videoScripts} icon={Video} />
          <AtomSection title="Email Newsletter" atoms={newsletters} icon={Mail} />
          <AtomSection title="Pull Quotes" atoms={pullQuotes} icon={Quote} />
          <AtomSection title="Blog Summary" atoms={blogSummaries} icon={FileText} />
        </div>
      )}

      {/* Previous Atomizations */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Previous Atomizations</CardTitle>
            <CardDescription>Click to view previous content atomizations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50",
                    viewingHistory === item.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => viewHistoryItem(item)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {item.source_type.replace(/_/g, " ")}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.source_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.atom_count} atoms &middot;{" "}
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
