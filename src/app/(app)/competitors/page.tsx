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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Globe,
  Instagram,
  Twitter,
  Linkedin,
  Loader2,
  Users,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database } from "@/lib/supabase/types";

type Competitor = Database["public"]["Tables"]["competitors"]["Row"];

const emptyForm = {
  name: "",
  website_url: "",
  meta_page_id: "",
  instagram_handle: "",
  twitter_handle: "",
  linkedin_url: "",
  notes: "",
};

export default function CompetitorsPage() {
  const supabase = createClient();
  const { selectedBrandId, selectedBrand, loading: brandLoading } = useBrand();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchCompetitors = useCallback(async () => {
    if (!selectedBrandId) {
      setCompetitors([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", selectedBrandId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load competitors");
      return;
    }
    setCompetitors(data ?? []);
    setLoading(false);
  }, [supabase, selectedBrandId]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchCompetitors();
    }
  }, [fetchCompetitors, brandLoading, selectedBrandId]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: Competitor) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      website_url: c.website_url ?? "",
      meta_page_id: c.meta_page_id ?? "",
      instagram_handle: c.instagram_handle ?? "",
      twitter_handle: c.twitter_handle ?? "",
      linkedin_url: c.linkedin_url ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);

    if (!selectedBrandId) {
      toast.error("Please select a business first");
      setSaving(false);
      return;
    }

    const payload = {
      brand_id: selectedBrandId,
      name: form.name.trim(),
      website_url: form.website_url || null,
      meta_page_id: form.meta_page_id || null,
      instagram_handle: form.instagram_handle || null,
      twitter_handle: form.twitter_handle || null,
      linkedin_url: form.linkedin_url || null,
      notes: form.notes || null,
    };

    try {
      if (editingId) {
        const res = await fetch(`/api/competitors/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update competitor");
        toast.success("Competitor updated");
      } else {
        const res = await fetch("/api/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create competitor");
        toast.success("Competitor added");
      }
      setDialogOpen(false);
      fetchCompetitors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/competitors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Competitor deleted");
      fetchCompetitors();
    } catch {
      toast.error("Failed to delete competitor");
    }
  }

  async function toggleActive(c: Competitor) {
    try {
      const res = await fetch(`/api/competitors/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(c.is_active ? "Competitor deactivated" : "Competitor activated");
      fetchCompetitors();
    } catch {
      toast.error("Failed to toggle status");
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
          <h1 className="text-3xl font-bold tracking-tight">Competitors</h1>
          <p className="text-muted-foreground mt-1">
            {selectedBrand
              ? `Competitive landscape for ${selectedBrand.name}`
              : "Track and manage your competitive landscape"}
          </p>
        </div>
        <Button onClick={openCreate} disabled={!selectedBrandId}>
          <Plus className="mr-2 h-4 w-4" />
          Add Competitor
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Competitor" : "Add Competitor"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Competitor name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  value={form.website_url}
                  onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta_page_id">Meta Page ID</Label>
                <Input
                  id="meta_page_id"
                  value={form.meta_page_id}
                  onChange={(e) => setForm({ ...form, meta_page_id: e.target.value })}
                  placeholder="Facebook/Meta page ID"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="instagram_handle">Instagram</Label>
                  <Input
                    id="instagram_handle"
                    value={form.instagram_handle}
                    onChange={(e) =>
                      setForm({ ...form, instagram_handle: e.target.value })
                    }
                    placeholder="@handle"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twitter_handle">Twitter / X</Label>
                  <Input
                    id="twitter_handle"
                    value={form.twitter_handle}
                    onChange={(e) =>
                      setForm({ ...form, twitter_handle: e.target.value })
                    }
                    placeholder="@handle"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                <Input
                  id="linkedin_url"
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  placeholder="https://linkedin.com/company/..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="ghost" />}
                >
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Add Competitor"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {competitors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No competitors yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Start tracking your competitors to gain insights
            </p>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Competitor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => (
            <Card key={c.id} className="relative">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1 pr-8">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  {c.website_url && (
                    <a
                      href={c.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      {c.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(c)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(c)}>
                        {c.is_active ? (
                          <>
                            <ToggleLeft className="mr-2 h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <ToggleRight className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {c.meta_page_id && (
                    <Badge variant="outline" className="text-xs">
                      Meta
                    </Badge>
                  )}
                  {c.instagram_handle && (
                    <Badge variant="outline" className="text-xs">
                      <Instagram className="mr-1 h-3 w-3" />
                      {c.instagram_handle}
                    </Badge>
                  )}
                  {c.twitter_handle && (
                    <Badge variant="outline" className="text-xs">
                      <Twitter className="mr-1 h-3 w-3" />
                      {c.twitter_handle}
                    </Badge>
                  )}
                  {c.linkedin_url && (
                    <Badge variant="outline" className="text-xs">
                      <Linkedin className="mr-1 h-3 w-3" />
                      LinkedIn
                    </Badge>
                  )}
                </div>
                {c.notes && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                    {c.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
