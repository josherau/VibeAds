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
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
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
  brand_memberships: Array<{
    brand_id: string;
    brand_name: string;
    role: string;
  }>;
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
  brands: Array<{ id: string; name: string }>;
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
  organization_id: string | null;
  competitor_count: number;
  brand_member_count: number;
  created_at: string;
}

interface AdminBrandMember {
  id: string;
  brand_id: string;
  user_id: string | null;
  role: string;
  status: string;
  email: string | null;
  invited_email: string | null;
  joined_at: string | null;
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

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    owner: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    admin: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    member: "bg-green-500/10 text-green-500 border-green-500/20",
    editor: "bg-green-500/10 text-green-500 border-green-500/20",
    viewer: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };
  return (
    <Badge variant="outline" className={colors[role] || ""}>
      {role}
    </Badge>
  );
}

function memberStatusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    deactivated: "bg-red-500/10 text-red-500 border-red-500/20",
  };
  return (
    <Badge variant="outline" className={colors[status] || ""}>
      {status}
    </Badge>
  );
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

  // Expanded org for viewing members/brands
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<AdminOrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Expanded brand for viewing members
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
  const [brandMembers, setBrandMembers] = useState<AdminBrandMember[]>([]);
  const [loadingBrandMembers, setLoadingBrandMembers] = useState(false);

  // Add member dialog
  const [showAddOrgMember, setShowAddOrgMember] = useState(false);
  const [addMemberOrgId, setAddMemberOrgId] = useState<string>("");
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("member");
  const [addingMember, setAddingMember] = useState(false);

  // Change role dialog
  const [showChangeRole, setShowChangeRole] = useState(false);
  const [changeRoleMember, setChangeRoleMember] = useState<AdminOrgMember | null>(null);
  const [changeRoleOrgId, setChangeRoleOrgId] = useState<string>("");
  const [newRole, setNewRole] = useState("");
  const [changingRole, setChangingRole] = useState(false);

  // Assign brand to org dialog
  const [showAssignBrand, setShowAssignBrand] = useState(false);
  const [assignBrandOrgId, setAssignBrandOrgId] = useState<string>("");
  const [selectedAssignBrandId, setSelectedAssignBrandId] = useState("");
  const [assigningBrand, setAssigningBrand] = useState(false);

  // Create org dialog
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Add brand member dialog
  const [showAddBrandMember, setShowAddBrandMember] = useState(false);
  const [addBrandMemberBrandId, setAddBrandMemberBrandId] = useState("");
  const [addBrandMemberEmail, setAddBrandMemberEmail] = useState("");
  const [addBrandMemberRole, setAddBrandMemberRole] = useState("viewer");
  const [addingBrandMember, setAddingBrandMember] = useState(false);

  // Assign brand to org from brands tab
  const [showBrandOrgAssign, setShowBrandOrgAssign] = useState(false);
  const [brandOrgAssignBrandId, setBrandOrgAssignBrandId] = useState("");
  const [brandOrgAssignOrgId, setBrandOrgAssignOrgId] = useState("");
  const [assigningBrandOrg, setAssigningBrandOrg] = useState(false);

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

  const fetchBrandMembers = useCallback(async (brandId: string) => {
    setLoadingBrandMembers(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/members`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBrandMembers(data.members ?? []);
    } catch (err) {
      console.error("Failed to fetch brand members:", err);
      toast.error("Failed to load brand members");
    } finally {
      setLoadingBrandMembers(false);
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
        await Promise.all([fetchOrganizations(), fetchBrands(), fetchStats()]);
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

  async function removeBrandMember(brandId: string, member: AdminBrandMember) {
    setConfirmAction({
      type: "remove_brand_member",
      title: "Remove Brand Member",
      description: `Are you sure you want to remove ${member.email || member.invited_email || "this member"} from this brand?`,
      onConfirm: async () => {
        const res = await fetch(
          `/api/admin/brands/${brandId}/members?member_id=${member.id}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success("Brand member removed");
        await fetchBrandMembers(brandId);
        await fetchBrands();
      },
    });
  }

  async function executeConfirmAction() {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      await confirmAction.onConfirm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }

  async function handleAddOrgMember() {
    if (!addMemberEmail.trim() || !addMemberOrgId) return;
    setAddingMember(true);
    try {
      const res = await fetch(
        `/api/admin/organizations/${addMemberOrgId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: addMemberEmail.trim(),
            role: addMemberRole,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Member added to organization`);
      setShowAddOrgMember(false);
      setAddMemberEmail("");
      setAddMemberRole("member");
      await fetchOrgMembers(addMemberOrgId);
      await fetchOrganizations();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add member"
      );
    } finally {
      setAddingMember(false);
    }
  }

  async function handleChangeRole() {
    if (!changeRoleMember || !changeRoleOrgId || !newRole) return;
    setChangingRole(true);
    try {
      // Use the admin org members endpoint — we need to patch the member
      const res = await fetch(
        `/api/organizations/${changeRoleOrgId}/members/${changeRoleMember.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Role updated");
      setShowChangeRole(false);
      setChangeRoleMember(null);
      await fetchOrgMembers(changeRoleOrgId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update role"
      );
    } finally {
      setChangingRole(false);
    }
  }

  async function handleAssignBrandToOrg() {
    if (!selectedAssignBrandId || !assignBrandOrgId) return;
    setAssigningBrand(true);
    try {
      const res = await fetch(
        `/api/admin/organizations/${assignBrandOrgId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assign_brand_id: selectedAssignBrandId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Brand assigned to organization");
      setShowAssignBrand(false);
      setSelectedAssignBrandId("");
      await Promise.all([fetchOrganizations(), fetchBrands()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to assign brand"
      );
    } finally {
      setAssigningBrand(false);
    }
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Organization "${newOrgName.trim()}" created`);
      setShowCreateOrg(false);
      setNewOrgName("");
      await Promise.all([fetchOrganizations(), fetchStats()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create organization"
      );
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleAddBrandMember() {
    if (!addBrandMemberEmail.trim() || !addBrandMemberBrandId) return;
    setAddingBrandMember(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${addBrandMemberBrandId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: addBrandMemberEmail.trim(),
            role: addBrandMemberRole,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Brand member added");
      setShowAddBrandMember(false);
      setAddBrandMemberEmail("");
      setAddBrandMemberRole("viewer");
      await fetchBrandMembers(addBrandMemberBrandId);
      await fetchBrands();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add brand member"
      );
    } finally {
      setAddingBrandMember(false);
    }
  }

  async function handleBrandOrgAssign() {
    if (!brandOrgAssignBrandId) return;
    setAssigningBrandOrg(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${brandOrgAssignBrandId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organization_id: brandOrgAssignOrgId || "",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(
        brandOrgAssignOrgId
          ? "Brand assigned to organization"
          : "Brand unassigned from organization"
      );
      setShowBrandOrgAssign(false);
      setBrandOrgAssignBrandId("");
      setBrandOrgAssignOrgId("");
      await Promise.all([fetchBrands(), fetchOrganizations()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update brand org"
      );
    } finally {
      setAssigningBrandOrg(false);
    }
  }

  async function unassignBrandFromOrg(orgId: string, brandId: string) {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unassign_brand_id: brandId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Brand removed from organization");
      await Promise.all([fetchOrganizations(), fetchBrands()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to unassign brand"
      );
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

  const unassignedBrands = brands.filter((b) => !b.organization && !b.organization_id);

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
          <TabsTrigger value="organizations">
            <Building2 className="mr-2 h-4 w-4" />
            Organizations
          </TabsTrigger>
          <TabsTrigger value="brands">
            <Palette className="mr-2 h-4 w-4" />
            Brands
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Users
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
                <CardDescription>Pipeline Runs</CardDescription>
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
                <CardDescription>Ads Tracked</CardDescription>
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

        {/* ── Organizations Tab ──────────────────────────────── */}
        <TabsContent value="organizations" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {organizations.length} organization
              {organizations.length !== 1 ? "s" : ""}
            </span>
            <Button
              size="sm"
              onClick={() => setShowCreateOrg(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </Button>
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
                            {org.brands.length} brand
                            {org.brands.length !== 1 ? "s" : ""} &middot;
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

                  {/* Expanded view */}
                  {expandedOrgId === org.id && (
                    <CardContent className="pt-0 space-y-6">
                      <Separator />

                      {/* Org Members Section */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Org Members
                          </h3>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAddMemberOrgId(org.id);
                              setShowAddOrgMember(true);
                            }}
                          >
                            <UserPlus className="mr-2 h-3.5 w-3.5" />
                            Add Member
                          </Button>
                        </div>
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
                                <TableHead className="hidden md:table-cell">
                                  Joined
                                </TableHead>
                                <TableHead className="text-right">
                                  Actions
                                </TableHead>
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
                                  <TableCell>{roleBadge(member.role)}</TableCell>
                                  <TableCell>
                                    {memberStatusBadge(member.status)}
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
                                    <div className="flex items-center justify-end gap-1">
                                      {member.role !== "owner" && (
                                        <>
                                          <Select
                                            value={member.role}
                                            onValueChange={async (val) => {
                                              if (val && val !== member.role) {
                                                setChangeRoleMember(member);
                                                setChangeRoleOrgId(org.id);
                                                setNewRole(val);
                                                setShowChangeRole(true);
                                              }
                                            }}
                                          >
                                            <SelectTrigger className="h-8 w-24 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="admin">
                                                admin
                                              </SelectItem>
                                              <SelectItem value="member">
                                                member
                                              </SelectItem>
                                              <SelectItem value="viewer">
                                                viewer
                                              </SelectItem>
                                            </SelectContent>
                                          </Select>
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
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>

                      {/* Brands in this Org Section */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Brands in this Org
                          </h3>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAssignBrandOrgId(org.id);
                              setShowAssignBrand(true);
                            }}
                            disabled={unassignedBrands.length === 0}
                          >
                            <Plus className="mr-2 h-3.5 w-3.5" />
                            Assign Brand
                          </Button>
                        </div>
                        {org.brands.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">
                            No brands assigned to this organization
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {org.brands.map((brand) => {
                              const fullBrand = brands.find(
                                (b) => b.id === brand.id
                              );
                              return (
                                <div
                                  key={brand.id}
                                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                                >
                                  <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                                  {brand.name}
                                  {fullBrand && (
                                    <span className="text-xs text-muted-foreground">
                                      ({fullBrand.brand_member_count} direct member
                                      {fullBrand.brand_member_count !== 1
                                        ? "s"
                                        : ""}
                                      )
                                    </span>
                                  )}
                                  <button
                                    onClick={() =>
                                      unassignBrandFromOrg(org.id, brand.id)
                                    }
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                    title="Remove brand from org"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
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

          <div className="space-y-3">
            {filteredBrands.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Palette className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No brands found</p>
                </CardContent>
              </Card>
            ) : (
              filteredBrands.map((brand) => (
                <Card key={brand.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (expandedBrandId === brand.id) {
                              setExpandedBrandId(null);
                              setBrandMembers([]);
                            } else {
                              setExpandedBrandId(brand.id);
                              fetchBrandMembers(brand.id);
                            }
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedBrandId === brand.id ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </button>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            {brand.name}
                          </CardTitle>
                          <CardDescription>
                            Owner: {brand.owner_email} &middot;{" "}
                            {brand.organization ? (
                              <>
                                Org:{" "}
                                <span className="font-medium">
                                  {brand.organization.org_name}
                                </span>
                              </>
                            ) : (
                              "Unassigned"
                            )}
                            {brand.industry && (
                              <> &middot; {brand.industry}</>
                            )}
                            {" "}&middot; {brand.competitor_count} competitor
                            {brand.competitor_count !== 1 ? "s" : ""}
                            {" "}&middot; {brand.brand_member_count} direct member
                            {brand.brand_member_count !== 1 ? "s" : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setBrandOrgAssignBrandId(brand.id);
                            setBrandOrgAssignOrgId(
                              brand.organization?.org_id || ""
                            );
                            setShowBrandOrgAssign(true);
                          }}
                          title="Assign to organization"
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteBrand(brand)}
                          title="Delete brand"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Expanded brand members */}
                  {expandedBrandId === brand.id && (
                    <CardContent className="pt-0 space-y-4">
                      <Separator />
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Brand Members (direct access)
                        </h3>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAddBrandMemberBrandId(brand.id);
                            setShowAddBrandMember(true);
                          }}
                        >
                          <UserPlus className="mr-2 h-3.5 w-3.5" />
                          Add Brand Member
                        </Button>
                      </div>

                      {loadingBrandMembers ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : brandMembers.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No direct brand members
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {brandMembers.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell className="text-sm">
                                  {member.email ||
                                    member.invited_email ||
                                    "Unknown"}
                                </TableCell>
                                <TableCell>{roleBadge(member.role)}</TableCell>
                                <TableCell>
                                  {memberStatusBadge(member.status)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() =>
                                      removeBrandMember(brand.id, member)
                                    }
                                    title="Remove member"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
              {filteredUsers.length} user
              {filteredUsers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Orgs
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Brands (owned)
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Brand Access
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Last Sign In
                    </TableHead>
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
                            <Badge
                              variant="outline"
                              className="text-muted-foreground"
                            >
                              User
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {user.organizations.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            ) : (
                              user.organizations.map((org) => (
                                <Badge
                                  key={org.org_id}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {org.org_name} ({org.role})
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {user.brands.length}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {user.brand_memberships.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            ) : (
                              user.brand_memberships.map((bm) => (
                                <Badge
                                  key={bm.brand_id}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {bm.brand_name} ({bm.role})
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {user.last_sign_in_at
                            ? formatDistanceToNow(
                                new Date(user.last_sign_in_at),
                                { addSuffix: true }
                              )
                            : "Never"}
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
      </Tabs>

      {/* ── Dialogs ───────────────────────────────────────── */}

      {/* Confirmation Dialog */}
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

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization. You will be set as the owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-org-name">Organization Name</Label>
              <Input
                id="new-org-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g., My Agency"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOrg();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateOrg}
              disabled={creatingOrg || !newOrgName.trim()}
            >
              {creatingOrg && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Org Member Dialog */}
      <Dialog open={showAddOrgMember} onOpenChange={setShowAddOrgMember}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Organization Member</DialogTitle>
            <DialogDescription>
              Add a member to this organization. They will have access to all
              brands in the org based on their role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-member-email">Email Address</Label>
              <Input
                id="add-member-email"
                type="email"
                value={addMemberEmail}
                onChange={(e) => setAddMemberEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={addMemberRole}
                onValueChange={(v) => v && setAddMemberRole(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    Admin - Manage members + edit all brands
                  </SelectItem>
                  <SelectItem value="member">
                    Member - Edit all brands
                  </SelectItem>
                  <SelectItem value="viewer">
                    Viewer - Read-only all brands
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddOrgMember}
              disabled={addingMember || !addMemberEmail.trim()}
            >
              {addingMember && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Confirmation Dialog */}
      <Dialog open={showChangeRole} onOpenChange={setShowChangeRole}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Change role for{" "}
              {changeRoleMember?.email || changeRoleMember?.invited_email} to{" "}
              <strong>{newRole}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowChangeRole(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleChangeRole} disabled={changingRole}>
              {changingRole && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Brand to Org Dialog */}
      <Dialog open={showAssignBrand} onOpenChange={setShowAssignBrand}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Brand to Organization</DialogTitle>
            <DialogDescription>
              Select an unassigned brand to add to this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select
                value={selectedAssignBrandId}
                onValueChange={(v) => v && setSelectedAssignBrandId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedBrands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name} ({brand.owner_email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAssignBrandToOrg}
              disabled={assigningBrand || !selectedAssignBrandId}
            >
              {assigningBrand && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Assign Brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Brand Member Dialog */}
      <Dialog open={showAddBrandMember} onOpenChange={setShowAddBrandMember}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Brand Member</DialogTitle>
            <DialogDescription>
              Add a member with direct access to this brand only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="brand-member-email">Email Address</Label>
              <Input
                id="brand-member-email"
                type="email"
                value={addBrandMemberEmail}
                onChange={(e) => setAddBrandMemberEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={addBrandMemberRole}
                onValueChange={(v) => v && setAddBrandMemberRole(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">
                    Editor - Can edit this brand
                  </SelectItem>
                  <SelectItem value="viewer">
                    Viewer - Read-only access
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddBrandMember}
              disabled={addingBrandMember || !addBrandMemberEmail.trim()}
            >
              {addingBrandMember && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Brand to Org (from brands tab) */}
      <Dialog open={showBrandOrgAssign} onOpenChange={setShowBrandOrgAssign}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to Organization</DialogTitle>
            <DialogDescription>
              Choose an organization for this brand, or leave empty to unassign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select
                value={brandOrgAssignOrgId || "__none__"}
                onValueChange={(v) =>
                  setBrandOrgAssignOrgId(v === "__none__" ? "" : (v ?? ""))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (Unassigned)</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleBrandOrgAssign}
              disabled={assigningBrandOrg}
            >
              {assigningBrandOrg && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
