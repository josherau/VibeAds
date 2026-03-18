"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  Filter,
  Hash,
  Image,
  Target,
  Brain,
  Pencil,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBrand } from "@/lib/brand-context";
import type { Database } from "@/lib/supabase/types";

type SocialPost = Database["public"]["Tables"]["social_posts"]["Row"];

const platforms = [
  { value: "instagram", label: "Instagram", color: "bg-pink-600 hover:bg-pink-700" },
  { value: "twitter", label: "Twitter/X", color: "bg-zinc-700 hover:bg-zinc-800" },
  { value: "linkedin", label: "LinkedIn", color: "bg-sky-700 hover:bg-sky-800" },
  { value: "facebook", label: "Facebook", color: "bg-blue-600 hover:bg-blue-700" },
  { value: "tiktok", label: "TikTok", color: "bg-fuchsia-600 hover:bg-fuchsia-700" },
  { value: "threads", label: "Threads", color: "bg-zinc-600 hover:bg-zinc-700" },
];

const postTypes = [
  { value: "text", label: "Text Post" },
  { value: "carousel", label: "Carousel" },
  { value: "reel_script", label: "Reel Script" },
  { value: "story", label: "Story" },
  { value: "thread", label: "Thread" },
];

const postCounts = [3, 5, 8];

const platformColorMap: Record<string, string> = {
  instagram: "bg-pink-600 hover:bg-pink-700",
  twitter: "bg-zinc-700 hover:bg-zinc-800",
  linkedin: "bg-sky-700 hover:bg-sky-800",
  facebook: "bg-blue-600 hover:bg-blue-700",
  tiktok: "bg-fuchsia-600 hover:bg-fuchsia-700",
  threads: "bg-zinc-600 hover:bg-zinc-700",
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

function PostCard({
  post,
  onFeedback,
}: {
  post: SocialPost;
  onFeedback: (id: string, feedback: "up" | "down") => void;
}) {
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Badge
              className={cn(
                "text-xs capitalize",
                platformColorMap[post.platform] ?? "bg-zinc-600"
              )}
            >
              {post.platform === "twitter" ? "Twitter/X" : post.platform}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {post.post_type.replace(/_/g, " ")}
            </Badge>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs capitalize",
              post.status === "draft"
                ? "bg-zinc-600/20 text-zinc-300"
                : post.status === "scheduled"
                  ? "bg-purple-600/20 text-purple-300"
                  : "bg-emerald-600/20 text-emerald-300"
            )}
          >
            {post.status}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {post.positioning_angle_type && angleTypeLabels[post.positioning_angle_type] && (
            <Badge
              variant="outline"
              className={cn("text-xs border", angleTypeLabels[post.positioning_angle_type].color)}
            >
              <Target className="mr-1 h-3 w-3" />
              {angleTypeLabels[post.positioning_angle_type].label}
            </Badge>
          )}
          {post.copywriting_framework && (
            <Badge
              variant="outline"
              className="text-xs bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
            >
              <Brain className="mr-1 h-3 w-3" />
              {frameworkLabels[post.copywriting_framework] ?? post.copywriting_framework}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">
            {post.content}
          </p>
          <CopyButton text={post.content} label="Post content" />
        </div>

        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex items-start gap-1.5">
            <Hash className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground line-clamp-2">
              {post.hashtags.map((t) => `#${t}`).join(" ")}
            </p>
          </div>
        )}

        {(post.media_prompts as any) && (
          <div className="flex items-start gap-1.5">
            <Image className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground italic line-clamp-2">
              {(post.media_prompts as any)}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              <Calendar className="mr-1 h-3 w-3" />
              Schedule
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                post.feedback === "up" && "text-emerald-400"
              )}
              onClick={() => onFeedback(post.id, "up")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                post.feedback === "down" && "text-red-400"
              )}
              onClick={() => onFeedback(post.id, "down")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SocialContentPage() {
  const supabase = createClient();
  const { selectedBrandId, selectedBrand, loading: brandLoading } = useBrand();

  // Generation controls
  const [platform, setPlatform] = useState("instagram");
  const [postType, setPostType] = useState("text");
  const [topic, setTopic] = useState("");
  const [postCount, setPostCount] = useState(5);
  const [generating, setGenerating] = useState(false);

  // Posts state
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("generated");

  const fetchPosts = useCallback(async () => {
    if (!selectedBrandId) {
      setPosts([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("social_posts")
      .select("*")
      .eq("brand_id", selectedBrandId)
      .order("created_at", { ascending: false });

    if (filterPlatform !== "all") query = query.eq("platform", filterPlatform);
    if (filterStatus !== "all") query = query.eq("status", filterStatus);

    const { data, error } = await query.limit(50);
    if (error) {
      toast.error("Failed to load posts");
      return;
    }
    setPosts(data ?? []);
    setLoading(false);
  }, [supabase, selectedBrandId, filterPlatform, filterStatus]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchPosts();
    }
  }, [fetchPosts, brandLoading, selectedBrandId]);

  async function handleGenerate() {
    if (!selectedBrandId) {
      toast.error("Please select a business first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/jobs/generate-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: selectedBrandId,
          platform,
          post_type: postType,
          topic: topic || undefined,
          count: postCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      toast.success(`Generated ${data.posts.length} posts!`);
      setActiveTab("generated");
      fetchPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleFeedback(id: string, feedback: "up" | "down") {
    const { error } = await supabase
      .from("social_posts")
      .update({ feedback })
      .eq("id", id);

    if (error) {
      toast.error("Failed to save feedback");
      return;
    }
    toast.success(feedback === "up" ? "Marked as good" : "Marked as needs work");
    fetchPosts();
  }

  if (loading || brandLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const draftPosts = posts.filter((p) => p.status === "draft");
  const scheduledPosts = posts.filter((p) => p.status === "scheduled");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Content Studio</h1>
          <p className="text-muted-foreground mt-1">
            {selectedBrand
              ? `AI-generated social content for ${selectedBrand.name}`
              : "AI-powered social content generation based on brand voice and competitor intelligence"}
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating || !selectedBrandId}>
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate Posts
        </Button>
      </div>

      {/* Generation Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generation Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Platform Selector */}
            <div className="space-y-2">
              <Label>Platform</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="w-full justify-between" />}
                >
                  {platforms.find((p) => p.value === platform)?.label ?? platform}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {platforms.map((p) => (
                    <DropdownMenuItem key={p.value} onClick={() => setPlatform(p.value)}>
                      {p.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Post Type Selector */}
            <div className="space-y-2">
              <Label>Post Type</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="w-full justify-between" />}
                >
                  {postTypes.find((t) => t.value === postType)?.label ?? postType}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {postTypes.map((t) => (
                    <DropdownMenuItem key={t.value} onClick={() => setPostType(t.value)}>
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Post Count */}
            <div className="space-y-2">
              <Label>Number of Posts</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="w-full justify-between" />}
                >
                  {postCount} posts
                  <ChevronDown className="ml-2 h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {postCounts.map((c) => (
                    <DropdownMenuItem key={c} onClick={() => setPostCount(c)}>
                      {c} posts
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Topic Input */}
            <div className="space-y-2">
              <Label>Topic / Angle (optional)</Label>
              <Input
                placeholder="Auto-generate from intel..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Generated / Draft / Scheduled */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="generated">
              All Posts ({posts.length})
            </TabsTrigger>
            <TabsTrigger value="drafts">
              Drafts ({draftPosts.length})
            </TabsTrigger>
            <TabsTrigger value="scheduled">
              Scheduled ({scheduledPosts.length})
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" />}
              >
                <Filter className="mr-2 h-3 w-3" />
                Platform: {filterPlatform === "all" ? "All" : filterPlatform}
                <ChevronDown className="ml-2 h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterPlatform("all")}>
                  All Platforms
                </DropdownMenuItem>
                {platforms.map((p) => (
                  <DropdownMenuItem key={p.value} onClick={() => setFilterPlatform(p.value)}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
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
                {["all", "draft", "scheduled", "published"].map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setFilterStatus(s)}>
                    {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value="generated" className="mt-6">
          {posts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">No posts yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure your settings above and click &quot;Generate Posts&quot; to create social content
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onFeedback={handleFeedback} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="drafts" className="mt-6">
          {draftPosts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Pencil className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">No drafts</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Generated posts start as drafts
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {draftPosts.map((post) => (
                <PostCard key={post.id} post={post} onFeedback={handleFeedback} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scheduled" className="mt-6">
          {scheduledPosts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">No scheduled posts</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Schedule posts from the drafts tab
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scheduledPosts.map((post) => (
                <PostCard key={post.id} post={post} onFeedback={handleFeedback} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
