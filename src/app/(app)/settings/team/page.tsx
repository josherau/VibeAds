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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  Plus,
  Users,
  Building2,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  Crown,
  Eye,
  Pencil,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  owner_id: string;
  logo_url: string | null;
  created_at: string;
  user_role: string;
}

interface MemberBrandAccess {
  id: string;
  brand_id: string;
  permission_level: string;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string | null;
  role: string;
  invited_by: string | null;
  invited_email: string | null;
  status: string;
  joined_at: string | null;
  created_at: string;
  member_brand_access: MemberBrandAccess[];
}

interface OrgBrand {
  id: string;
  name: string;
  primary_color: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────

function roleColor(role: string) {
  switch (role) {
    case "owner":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "admin":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "member":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "viewer":
      return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    default:
      return "";
  }
}

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "pending":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "deactivated":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "";
  }
}

function RoleIcon({ role }: { role: string }) {
  switch (role) {
    case "owner":
      return <Crown className="h-3.5 w-3.5" />;
    case "admin":
      return <Shield className="h-3.5 w-3.5" />;
    case "viewer":
      return <Eye className="h-3.5 w-3.5" />;
    default:
      return <Pencil className="h-3.5 w-3.5" />;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle className="h-3.5 w-3.5" />;
    case "pending":
      return <Clock className="h-3.5 w-3.5" />;
    case "deactivated":
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

// ── Main Component ──────────────────────────────────────────────

export default function TeamSettingsPage() {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);
  const { brands: userBrands } = useBrand();

  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [orgBrands, setOrgBrands] = useState<OrgBrand[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Dialog states
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showAssignBrand, setShowAssignBrand] = useState(false);

  // Form states
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null);
  const [editRole, setEditRole] = useState("");
  const [removingMember, setRemovingMember] = useState<OrgMember | null>(null);
  const [assignBrandMember, setAssignBrandMember] = useState<OrgMember | null>(null);
  const [assignBrandId, setAssignBrandId] = useState("");
  const [assignPermission, setAssignPermission] = useState("view");

  // Loading states
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [updatingMember, setUpdatingMember] = useState(false);
  const [removingMemberLoading, setRemovingMemberLoading] = useState(false);
  const [assigningBrand, setAssigningBrand] = useState(false);

  // ── Fetch Functions ──────────────────────────────────────────

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch("/api/organizations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrganizations(data.organizations ?? []);
      return data.organizations ?? [];
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
      return [];
    }
  }, []);

  const fetchMembers = useCallback(async (orgId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMembers(data.members ?? []);
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  }, []);

  const fetchOrgBrands = useCallback(async (orgId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/brands`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrgBrands(data.brands ?? []);
    } catch (err) {
      console.error("Failed to fetch org brands:", err);
    }
  }, []);

  // ── Initial Load ──────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const orgs = await fetchOrganizations();
      if (orgs.length > 0) {
        setSelectedOrg(orgs[0]);
      }
      setLoading(false);
    }
    init();
  }, [supabase, fetchOrganizations]);

  // Fetch members when org changes
  useEffect(() => {
    if (selectedOrg) {
      fetchMembers(selectedOrg.id);
      fetchOrgBrands(selectedOrg.id);
    } else {
      setMembers([]);
      setOrgBrands([]);
    }
  }, [selectedOrg, fetchMembers, fetchOrgBrands]);

  // ── Action Handlers ──────────────────────────────────────────

  async function createOrganization() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Organization "${newOrgName.trim()}" created`);
      setNewOrgName("");
      setShowCreateOrg(false);

      const orgs = await fetchOrganizations();
      const newOrg = orgs.find(
        (o: Organization) => o.id === data.organization.id
      );
      if (newOrg) setSelectedOrg(newOrg);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create organization"
      );
    } finally {
      setCreatingOrg(false);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim() || !selectedOrg) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          brand_ids: selectedBrandIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteRole("member");
      setSelectedBrandIds([]);
      setShowInvite(false);
      fetchMembers(selectedOrg.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send invitation"
      );
    } finally {
      setInviting(false);
    }
  }

  async function updateMember() {
    if (!editingMember || !selectedOrg) return;
    setUpdatingMember(true);
    try {
      const res = await fetch(
        `/api/organizations/${selectedOrg.id}/members/${editingMember.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: editRole }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Member updated");
      setShowEditMember(false);
      setEditingMember(null);
      fetchMembers(selectedOrg.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update member"
      );
    } finally {
      setUpdatingMember(false);
    }
  }

  async function removeMember() {
    if (!removingMember || !selectedOrg) return;
    setRemovingMemberLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/${selectedOrg.id}/members/${removingMember.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Member removed");
      setShowRemoveConfirm(false);
      setRemovingMember(null);
      fetchMembers(selectedOrg.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove member"
      );
    } finally {
      setRemovingMemberLoading(false);
    }
  }

  async function assignBrand() {
    if (!assignBrandMember || !selectedOrg || !assignBrandId) return;
    setAssigningBrand(true);
    try {
      const res = await fetch(
        `/api/organizations/${selectedOrg.id}/members/${assignBrandMember.id}/brands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: assignBrandId,
            permission_level: assignPermission,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Brand access granted");
      setShowAssignBrand(false);
      setAssignBrandMember(null);
      setAssignBrandId("");
      setAssignPermission("view");
      fetchMembers(selectedOrg.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to grant brand access"
      );
    } finally {
      setAssigningBrand(false);
    }
  }

  async function revokeBrandAccess(memberId: string, brandId: string) {
    if (!selectedOrg) return;
    try {
      const res = await fetch(
        `/api/organizations/${selectedOrg.id}/members/${memberId}/brands?brand_id=${brandId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Brand access revoked");
      fetchMembers(selectedOrg.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke brand access"
      );
    }
  }

  async function assignBrandToOrg(brandId: string) {
    if (!selectedOrg) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/brands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Brand added to organization");
      fetchOrgBrands(selectedOrg.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to assign brand"
      );
    }
  }

  // ── Derived State ──────────────────────────────────────────

  const isOwnerOrAdmin =
    selectedOrg &&
    (selectedOrg.user_role === "owner" || selectedOrg.user_role === "admin");

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  const unassignedBrands = userBrands.filter(
    (b) => !orgBrands.some((ob) => ob.id === b.id)
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
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Team & Organizations
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization, team members, and brand access
          </p>
        </div>
      </div>

      {/* Organization Selector / Creator */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization
              </CardTitle>
              <CardDescription>
                Select or create an organization to manage team access
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateOrg(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Organization
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium mb-1">
                No organizations yet
              </p>
              <p className="text-xs mb-4">
                Create an organization to start inviting team members
              </p>
              <Button size="sm" onClick={() => setShowCreateOrg(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    selectedOrg?.id === org.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-foreground/30 hover:bg-accent"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  {org.name}
                  <Badge
                    variant="outline"
                    className={`ml-1 text-[10px] ${roleColor(org.user_role)}`}
                  >
                    {org.user_role}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organization Brands */}
      {selectedOrg && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Organization Brands</CardTitle>
                <CardDescription>
                  Brands shared within {selectedOrg.name}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {orgBrands.length === 0 && unassignedBrands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No brands available. Create a brand in Settings first.
              </p>
            ) : (
              <div className="space-y-3">
                {orgBrands.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {orgBrands.map((brand) => (
                      <div
                        key={brand.id}
                        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <div
                          className="h-5 w-5 rounded"
                          style={{
                            backgroundColor: brand.primary_color || "#6366f1",
                          }}
                        />
                        {brand.name}
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      </div>
                    ))}
                  </div>
                )}
                {isOwnerOrAdmin && unassignedBrands.length > 0 && (
                  <>
                    {orgBrands.length > 0 && <Separator />}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Add brands to this organization:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {unassignedBrands.map((brand) => (
                          <button
                            key={brand.id}
                            onClick={() => assignBrandToOrg(brand.id)}
                            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                          >
                            <div
                              className="h-4 w-4 rounded opacity-50"
                              style={{
                                backgroundColor:
                                  brand.primary_color || "#6366f1",
                              }}
                            />
                            {brand.name}
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      {selectedOrg && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members
                </CardTitle>
                <CardDescription>
                  {activeMembers.length} active member
                  {activeMembers.length !== 1 ? "s" : ""}
                  {pendingMembers.length > 0 &&
                    ` / ${pendingMembers.length} pending`}
                </CardDescription>
              </div>
              {isOwnerOrAdmin && (
                <Button size="sm" onClick={() => setShowInvite(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No team members yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium">
                      {(member.invited_email?.[0] || "?").toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {member.invited_email || "Unknown"}
                        </span>
                        {member.user_id === currentUserId && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-primary/10 text-primary border-primary/20"
                          >
                            You
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${roleColor(member.role)}`}
                        >
                          <RoleIcon role={member.role} />
                          <span className="ml-1 capitalize">{member.role}</span>
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColor(member.status)}`}
                        >
                          <StatusIcon status={member.status} />
                          <span className="ml-1 capitalize">
                            {member.status}
                          </span>
                        </Badge>
                      </div>

                      {/* Brand access chips */}
                      {member.member_brand_access &&
                        member.member_brand_access.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {member.member_brand_access.map((ba) => {
                              const brand = orgBrands.find(
                                (b) => b.id === ba.brand_id
                              ) ||
                                userBrands.find(
                                  (b) => b.id === ba.brand_id
                                );
                              return (
                                <div
                                  key={ba.id}
                                  className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-[11px]"
                                >
                                  <div
                                    className="h-2.5 w-2.5 rounded-sm"
                                    style={{
                                      backgroundColor:
                                        brand?.primary_color || "#6366f1",
                                    }}
                                  />
                                  <span>{brand?.name || "Unknown"}</span>
                                  <span className="text-muted-foreground">
                                    ({ba.permission_level})
                                  </span>
                                  {isOwnerOrAdmin &&
                                    member.role !== "owner" && (
                                      <button
                                        onClick={() =>
                                          revokeBrandAccess(
                                            member.id,
                                            ba.brand_id
                                          )
                                        }
                                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                      >
                                        <XCircle className="h-3 w-3" />
                                      </button>
                                    )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </div>

                    {/* Actions */}
                    {isOwnerOrAdmin && member.role !== "owner" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setAssignBrandMember(member);
                            setShowAssignBrand(true);
                          }}
                          title="Manage brand access"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingMember(member);
                            setEditRole(member.role);
                            setShowEditMember(true);
                          }}
                          title="Edit role"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            setRemovingMember(member);
                            setShowRemoveConfirm(true);
                          }}
                          title="Remove member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending Invitations Section */}
      {selectedOrg && pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              {pendingMembers.length} invitation
              {pendingMembers.length !== 1 ? "s" : ""} awaiting acceptance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {pendingMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">
                        {member.invited_email}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        Role: {member.role}
                      </p>
                    </div>
                  </div>
                  {isOwnerOrAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setRemovingMember(member);
                        setShowRemoveConfirm(true);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Dialogs ───────────────────────────────────────── */}

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage team access to your brands
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g., My Agency, Marketing Team"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createOrganization();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={createOrganization}
              disabled={creatingOrg || !newOrgName.trim()}
            >
              {creatingOrg && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {selectedOrg?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    Admin - Can manage members and brands
                  </SelectItem>
                  <SelectItem value="member">
                    Member - Can edit shared brands
                  </SelectItem>
                  <SelectItem value="viewer">
                    Viewer - Read-only access
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {orgBrands.length > 0 && (
              <div className="space-y-2">
                <Label>Grant access to brands</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {orgBrands.map((brand) => (
                    <label
                      key={brand.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBrandIds.includes(brand.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBrandIds([
                              ...selectedBrandIds,
                              brand.id,
                            ]);
                          } else {
                            setSelectedBrandIds(
                              selectedBrandIds.filter((id) => id !== brand.id)
                            );
                          }
                        }}
                        className="rounded border-border"
                      />
                      <div
                        className="h-4 w-4 rounded-sm"
                        style={{
                          backgroundColor: brand.primary_color || "#6366f1",
                        }}
                      />
                      <span className="text-sm">{brand.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={inviteMember}
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Mail className="mr-2 h-4 w-4" />
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={showEditMember} onOpenChange={setShowEditMember}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Member Role</DialogTitle>
            <DialogDescription>
              Change the role for {editingMember?.invited_email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => v && setEditRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={updateMember} disabled={updatingMember}>
              {updatingMember && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <strong>{removingMember?.invited_email}</strong> from{" "}
              {selectedOrg?.name}? This will revoke all their brand access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRemoveConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={removeMember}
              disabled={removingMemberLoading}
            >
              {removingMemberLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Brand Access Dialog */}
      <Dialog open={showAssignBrand} onOpenChange={setShowAssignBrand}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Brand Access</DialogTitle>
            <DialogDescription>
              Grant {assignBrandMember?.invited_email} access to a brand
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={assignBrandId} onValueChange={(v) => v && setAssignBrandId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {orgBrands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                  {userBrands
                    .filter((b) => !orgBrands.some((ob) => ob.id === b.id))
                    .map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permission Level</Label>
              <Select
                value={assignPermission}
                onValueChange={(v) => v && setAssignPermission(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View - Read-only access</SelectItem>
                  <SelectItem value="edit">
                    Edit - Can modify brand data
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={assignBrand}
              disabled={assigningBrand || !assignBrandId}
            >
              {assigningBrand && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
