"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Shield,
  Users,
  Building2,
  Palette,
  Activity,
  Search,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Megaphone,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  BarChart3,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Ban,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name: string;
  is_super_admin: boolean;
  brands: Array<{ id: string; name: string }>;
  organizations: Array<{ org_id: string; org_name: string; role: string }>;
  last_sign_in_at: string | null;
  created_at: string | null;
  banned_until: string | null;
}

interface AdminOrg {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  logo_url: string | null;
  member_count: number;
  brand_count: number;
  created_at: string;
}

interface AdminOrgMember {
  id: string;
  organization_id: string;
  user_id: string | null;
  role: string;
  status: string;
  email: string | null;
  invited_email: string | null;
  joined_at: string | null;
  created_at: string;
}

interface AdminBrand {
  id: string;
  name: string;
  user_id: string;
  owner_email: string;
  industry: string | null;
  organization: { org_id: string; org_name: string } | null;
  competitor_count: number;
  created_at: string;
}

interface PlatformStats {
  total_users: number;
  total_brands: number;
  total_competitors: number;
  total_organizations: number;
  total_pipeline_runs: number;
  active_pipeline_runs: number;
  total_ads_tracked: number;
  recent_pipeline_runs: Array<{
    id: string;
    brand_name: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
  }>;
  recent_brands: Array<{
    id: string;
    name: string;
    owner_email: string;
    created_at: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge
          variant="outline"
          className="bg-green-500/10 text-green-500 border-green-500/20"
        >
          <CheckCircle className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    case "running":
      return (
        <Badge
          variant="outline"
          className="bg-blue-500/10 text-blue-500 border-blue-500/20"
        >
          <Activity className="mr-1 h-3 w-3 animate-pulse" />
          Running
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="outline"
          className="bg-red-500/10 text-red-500 border-red-500/20"
        >
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />
          {status}
        </Badge>
      );
  }
}

// ── Main Component ──────────────────────────────────────────────

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organizations, setOrganizations] = useState<AdminOrg[]>([]);
  const [brands, setBrands] = useState<AdminBrand[]>([]);

  // Search states
  const [userSearch, setUserSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");

  // Dialog states
  const [confirmAction, setConfirmAction] = useState<{
    type: string;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Expanded org for viewing members
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<AdminOrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── Fetch Functions ──────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data.stats);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      toast.error("Failed to load platform stats");
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users ?? []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast.error("Failed to load users");
    }
  }, []);

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/organizations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrganizations(data.organizations ?? []);
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
      toast.error("Failed to load organizations");
    }
  }, []);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/brands");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBrands(data.brands ?? []);
    } catch (err) {
      console.error("Failed to fetch brands:", err);
      toast.error("Failed to load brands");
    }
  }, []);

  const fetchOrgMembers = useCallback(async (orgId: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/members`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrgMembers(data.members ?? []);
    } catch (err) {
      console.error("Failed to fetch org members:", err);
      toast.error("Failed to load members");
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // ── Initial Load ──────────────────────────────────────────

  useEffect(() => {
    async function init() {
      await Promise.all([
        fetchStats(),
        fetchUsers(),
        fetchOrganizations(),
        fetchBrands(),
      ]);
      setLoading(false);
    }
    init();
  }, [fetchStats, fetchUsers, fetchOrganizations, fetchBrands]);

  // ── Action Handlers ──────────────────────────────────────────

  async function toggleSuperAdmin(user: AdminUser) {
    const newVal = !user.is_super_admin;
    const action = newVal ? "grant" : "revoke";
    setConfirmAction({
      type: "toggle_admin",
      title: `${newVal ? "Grant" : "Revoke"} Super Admin`,
      description: `Are you sure you want to ${action} super admin privileges for ${user.email}?`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_super_admin: newVal }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(
          `Super admin ${newVal ? "granted to" : "revoked from"} ${user.email}`
        );
        await fetchUsers();
      },
    });
  }

  async function toggleBanUser(user: AdminUser) {
    const isBanned = !!user.banned_until;
    setConfirmAction({
      type: "ban_user",
      title: isBanned ? "Unban User" : "Ban User",
      description: isBanned
        ? `Are you sure you want to unban ${user.email}?`
        : `Are you sure you want to ban ${user.email}? They will not be able to sign in.`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ banned: !isBanned }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(
          isBanned ? `${user.email} unbanned` : `${user.email} banned`
        );
        await fetchUsers();
      },
    });
  }

  async function deleteUser(user: AdminUser) {
    setConfirmAction({
      type: "delete_user",
      title: "Delete User",
      description: `Are you sure you want to permanently delete ${user.email}? This action cannot be undone.`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(`${user.email} deleted`);
        await Promise.all([fetchUsers(), fetchStats()]);
      },
    });
  }

  async function deleteOrg(org: AdminOrg) {
    setConfirmAction({
      type: "delete_org",
      title: "Delete Organization",
      description: `Are you sure you want to delete "${org.name}"? This will remove all members and brand associations. This action cannot be undone.`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/organizations/${org.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(`"${org.name}" deleted`);
        if (expandedOrgId === org.id) {
          setExpandedOrgId(null);
          setOrgMembers([]);
        }
        await Promise.all([fetchOrganizations(), fetchStats()]);
      },
    });
  }

  async function removeOrgMember(orgId: string, member: AdminOrgMember) {
    setConfirmAction({
      type: "remove_member",
      title: "Remove Member",
      description: `Are you sure you want to remove ${member.email || member.invited_email || "this member"} from the organization?`,
      onConfirm: async () => {
        const res = await fetch(
          `/api/admin/organizations/${orgId}/members?member_id=${member.id}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success("Member removed");
        await fetchOrgMembers(orgId);
        await fetchOrganizations();
      },
    });
  }

  async function deleteBrand(brand: AdminBrand) {
    setConfirmAction({
      type: "delete_brand",
      title: "Delete Brand",
      description: `Are you sure you want to delete "${brand.name}"? This will remove all competitors and data. This action cannot be undone.`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/brands/${brand.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(`"${brand.name}" deleted`);
        await Promise.all([fetchBrands(), fetchStats()]);
      },
    });
  }

  async function executeConfirmAction() {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      await confirmAction.onConfirm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Action failed"
      );
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }

  // ── Filtered Data ──────────────────────────────────────────

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredBrands = brands.filter(
    (b) =>
      b.name.toLowerCase().includes(brandSearch.toLowerCase()) ||
      b.owner_email.toLowerCase().includes(brandSearch.toLowerCase())
  );

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">
            Platform-wide management and monitoring
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            Promise.all([
              fetchStats(),
              fetchUsers(),
              fetchOrganizations(),
              fetchBrands(),
            ]).then(() => setLoading(false));
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="organizations">
            <Building2 className="mr-2 h-4 w-4" />
            Organizations
          </TabsTrigger>
          <TabsTrigger value="brands">
            <Palette className="mr-2 h-4 w-4" />
            Brands
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span className="text-2xl font-bold">
                    {stats?.total_users ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Brands</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-purple-500" />
                  <span className="text-2xl font-bold">
                    {stats?.total_brands ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Organizations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">
                    {stats?.total_organizations ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Competitors</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  <span className="text-2xl font-bold">
                    {stats?.total_competitors ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Pipeline Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-400 animate-pulse" />
                  <span className="text-2xl font-bold">
                    {stats?.active_pipeline_runs ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Pipeline Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-500" />
                  <span className="text-2xl font-bold">
                    {stats?.total_pipeline_runs ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Ads Tracked</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-pink-500" />
                  <span className="text-2xl font-bold">
                    {stats?.total_ads_tracked ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent Pipeline Runs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Recent Pipeline Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.recent_pipeline_runs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No pipeline runs yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stats?.recent_pipeline_runs.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {statusBadge(run.status)}
                          <span className="truncate text-muted-foreground">
                            {run.brand_name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {formatDistanceToNow(new Date(run.started_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Brands */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Recent Brands
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.recent_brands ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No brands yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stats?.recent_brands.map((brand) => (
                      <div
                        key={brand.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div>
                          <span className="font-medium">{brand.name}</span>
                          <span className="text-muted-foreground ml-2">
                            by {brand.owner_email}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(brand.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Users Tab ──────────────────────────────── */}
        <TabsContent value="users" className="space-y-4 mt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell">Brands</TableHead>
                    <TableHead className="hidden md:table-cell">Orgs</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Sign In</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-8"
                      >
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">
                              {user.email}
                            </div>
                            {user.name && (
                              <div className="text-xs text-muted-foreground">
                                {user.name}
                              </div>
                            )}
                            {user.banned_until && (
                              <Badge
                                variant="outline"
                                className="mt-1 bg-red-500/10 text-red-500 border-red-500/20 text-[10px]"
                              >
                                <Ban className="mr-1 h-3 w-3" />
                                Banned
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.is_super_admin ? (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              Super Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              User
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">
                            {user.brands.length}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">
                            {user.organizations.length}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {user.last_sign_in_at
                            ? formatDistanceToNow(
                                new Date(user.last_sign_in_at),
                                { addSuffix: true }
                              )
                            : "Never"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {user.created_at
                            ? format(new Date(user.created_at), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleSuperAdmin(user)}
                              title={
                                user.is_super_admin
                                  ? "Revoke super admin"
                                  : "Grant super admin"
                              }
                            >
                              {user.is_super_admin ? (
                                <ShieldOff className="h-4 w-4 text-amber-500" />
                              ) : (
                                <ShieldCheck className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleBanUser(user)}
                              title={
                                user.banned_until ? "Unban user" : "Ban user"
                              }
                            >
                              {user.banned_until ? (
                                <UserCheck className="h-4 w-4 text-green-500" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteUser(user)}
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Organizations Tab ──────────────────────────────── */}
        <TabsContent value="organizations" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {organizations.length} organization
              {organizations.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-3">
            {organizations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No organizations yet</p>
                </CardContent>
              </Card>
            ) : (
              organizations.map((org) => (
                <Card key={org.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (expandedOrgId === org.id) {
                              setExpandedOrgId(null);
                              setOrgMembers([]);
                            } else {
                              setExpandedOrgId(org.id);
                              fetchOrgMembers(org.id);
                            }
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedOrgId === org.id ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </button>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            {org.name}
                          </CardTitle>
                          <CardDescription>
                            Owner: {org.owner_email} &middot;{" "}
                            {org.member_count} member
                            {org.member_count !== 1 ? "s" : ""} &middot;{" "}
                            {org.brand_count} brand
                            {org.brand_count !== 1 ? "s" : ""} &middot;
                            Created{" "}
                            {format(new Date(org.created_at), "MMM d, yyyy")}
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteOrg(org)}
                        title="Delete organization"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  {/* Expanded Members View */}
                  {expandedOrgId === org.id && (
                    <CardContent className="pt-0">
                      <Separator className="mb-4" />
                      {loadingMembers ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : orgMembers.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No members
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden md:table-cell">Joined</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orgMembers.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell className="text-sm">
                                  {member.email ||
                                    member.invited_email ||
                                    "Unknown"}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      member.role === "owner"
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        : member.role === "admin"
                                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                          : ""
                                    }
                                  >
                                    {member.role}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      member.status === "active"
                                        ? "bg-green-500/10 text-green-500 border-green-500/20"
                                        : member.status === "pending"
                                          ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                          : ""
                                    }
                                  >
                                    {member.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                  {member.joined_at
                                    ? format(
                                        new Date(member.joined_at),
                                        "MMM d, yyyy"
                                      )
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {member.role !== "owner" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() =>
                                        removeOrgMember(org.id, member)
                                      }
                                      title="Remove member"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Brands Tab ──────────────────────────────── */}
        <TabsContent value="brands" className="space-y-4 mt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or owner..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredBrands.length} brand
              {filteredBrands.length !== 1 ? "s" : ""}
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="hidden md:table-cell">Organization</TableHead>
                    <TableHead className="hidden md:table-cell">Competitors</TableHead>
                    <TableHead className="hidden lg:table-cell">Industry</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBrands.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-8"
                      >
                        No brands found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBrands.map((brand) => (
                      <TableRow key={brand.id}>
                        <TableCell>
                          <span className="font-medium text-sm">
                            {brand.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {brand.owner_email}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {brand.organization ? (
                            <Badge variant="outline">
                              <Building2 className="mr-1 h-3 w-3" />
                              {brand.organization.org_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              None
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {brand.competitor_count}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {brand.industry || "-"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {format(
                            new Date(brand.created_at),
                            "MMM d, yyyy"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteBrand(brand)}
                            title="Delete brand"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Confirmation Dialog ───────────────────────────────── */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>
              {confirmAction?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmAction?.type.includes("delete") ||
                confirmAction?.type === "ban_user"
                  ? "destructive"
                  : "default"
              }
              onClick={executeConfirmAction}
              disabled={actionLoading}
            >
              {actionLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
