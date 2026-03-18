"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Eye, EyeOff, Key } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import type { Database } from "@/lib/supabase/types";

type Brand = Database["public"]["Tables"]["brands"]["Row"];

function MaskedInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3"
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);
  const { selectedBrandId, selectedBrand, refreshBrands, loading: brandLoading } = useBrand();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [brand, setBrand] = useState<Brand | null>(null);
  const [brandForm, setBrandForm] = useState({
    name: "",
    url: "",
    description: "",
    voice: "",
    audience: "",
    primary_color: "#6366f1",
    accent_color: "#8b5cf6",
  });

  const [apiKeys, setApiKeys] = useState({
    meta_access_token: "",
    openai_api_key: "",
    anthropic_api_key: "",
  });

  const [pipelineSchedule, setPipelineSchedule] = useState("daily");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState("");

  const fetchSettings = useCallback(async () => {
    if (!selectedBrandId) {
      setBrand(null);
      setBrandForm({
        name: "",
        url: "",
        description: "",
        voice: "",
        audience: "",
        primary_color: "#6366f1",
        accent_color: "#8b5cf6",
      });
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from("brands")
        .select("*")
        .eq("id", selectedBrandId)
        .single();
      const brandData = data as Brand | null;

      if (brandData) {
        setBrand(brandData);
        setBrandForm({
          name: brandData.name,
          url: brandData.url ?? "",
          description: brandData.description ?? "",
          voice: brandData.voice ?? "",
          audience: brandData.audience ?? "",
          primary_color: brandData.primary_color ?? "#6366f1",
          accent_color: brandData.accent_color ?? "#8b5cf6",
        });
      }
    } catch {
      // No brand yet
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedBrandId]);

  useEffect(() => {
    if (!brandLoading) {
      setLoading(true);
      fetchSettings();
    }
  }, [fetchSettings, brandLoading, selectedBrandId]);

  async function saveBrandSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (brand) {
        const { error } = await supabase
          .from("brands")
          .update({
            name: brandForm.name,
            url: brandForm.url || null,
            description: brandForm.description || null,
            voice: brandForm.voice || null,
            audience: brandForm.audience || null,
            primary_color: brandForm.primary_color || null,
            accent_color: brandForm.accent_color || null,
          })
          .eq("id", brand.id);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.from("brands").insert({
          user_id: user.id,
          name: brandForm.name,
          url: brandForm.url || null,
          description: brandForm.description || null,
          voice: brandForm.voice || null,
          audience: brandForm.audience || null,
          primary_color: brandForm.primary_color || null,
          accent_color: brandForm.accent_color || null,
        });
        if (error) throw error;
      }
      toast.success("Brand settings saved");
      await refreshBrands();
      fetchSettings();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          {selectedBrand
            ? `Configure settings for ${selectedBrand.name}`
            : "Configure your brand, API keys, and pipeline preferences"}
        </p>
      </div>

      <form onSubmit={saveBrandSettings} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Brand Settings</CardTitle>
            <CardDescription>
              Your brand identity used to generate on-brand ad creatives
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="brand-name">Brand Name</Label>
                <Input
                  id="brand-name"
                  value={brandForm.name}
                  onChange={(e) =>
                    setBrandForm({ ...brandForm, name: e.target.value })
                  }
                  placeholder="Your brand name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-url">Website URL</Label>
                <Input
                  id="brand-url"
                  value={brandForm.url}
                  onChange={(e) =>
                    setBrandForm({ ...brandForm, url: e.target.value })
                  }
                  placeholder="https://yourbrand.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand-description">Description</Label>
              <Textarea
                id="brand-description"
                value={brandForm.description}
                onChange={(e) =>
                  setBrandForm({ ...brandForm, description: e.target.value })
                }
                placeholder="Brief description of your brand and what you do..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand-voice">Brand Voice</Label>
              <Textarea
                id="brand-voice"
                value={brandForm.voice}
                onChange={(e) =>
                  setBrandForm({ ...brandForm, voice: e.target.value })
                }
                placeholder="Describe your brand voice (e.g., professional, friendly, bold, innovative)..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand-audience">Target Audience</Label>
              <Textarea
                id="brand-audience"
                value={brandForm.audience}
                onChange={(e) =>
                  setBrandForm({ ...brandForm, audience: e.target.value })
                }
                placeholder="Describe your target audience (e.g., SaaS founders, 25-45, US-based)..."
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="primary-color">Primary Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="primary-color"
                    value={brandForm.primary_color}
                    onChange={(e) =>
                      setBrandForm({ ...brandForm, primary_color: e.target.value })
                    }
                    className="h-10 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <Input
                    value={brandForm.primary_color}
                    onChange={(e) =>
                      setBrandForm({ ...brandForm, primary_color: e.target.value })
                    }
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accent-color">Accent Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="accent-color"
                    value={brandForm.accent_color}
                    onChange={(e) =>
                      setBrandForm({ ...brandForm, accent_color: e.target.value })
                    }
                    className="h-10 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <Input
                    value={brandForm.accent_color}
                    onChange={(e) =>
                      setBrandForm({ ...brandForm, accent_color: e.target.value })
                    }
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              API keys for data collection and AI services. Keys are stored
              securely and never exposed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MaskedInput
              id="meta-token"
              label="Meta / Facebook Access Token"
              value={apiKeys.meta_access_token}
              onChange={(val) =>
                setApiKeys({ ...apiKeys, meta_access_token: val })
              }
              placeholder="EAA..."
            />
            <MaskedInput
              id="openai-key"
              label="OpenAI API Key"
              value={apiKeys.openai_api_key}
              onChange={(val) =>
                setApiKeys({ ...apiKeys, openai_api_key: val })
              }
              placeholder="sk-..."
            />
            <MaskedInput
              id="anthropic-key"
              label="Anthropic API Key"
              value={apiKeys.anthropic_api_key}
              onChange={(val) =>
                setApiKeys({ ...apiKeys, anthropic_api_key: val })
              }
              placeholder="sk-ant-..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline Configuration</CardTitle>
            <CardDescription>
              Set your pipeline schedule and notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="schedule">Pipeline Schedule</Label>
              <select
                id="schedule"
                value={pipelineSchedule}
                onChange={(e) => setPipelineSchedule(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="manual">Manual only</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
              </select>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Email Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Receive email when pipeline completes
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={emailNotifications}
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    emailNotifications ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      emailNotifications ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {emailNotifications && (
                <div className="space-y-2">
                  <Label htmlFor="notification-email">Notification Email</Label>
                  <Input
                    id="notification-email"
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
