import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

/**
 * Verify that the current user is a super admin.
 * Returns the user object if they are, or null if not.
 */
export async function verifySuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any;
  const { data: role } = await db
    .from("user_roles")
    .select("is_super_admin")
    .eq("user_id", user.id)
    .single();

  if (!role?.is_super_admin) {
    return null;
  }

  return user;
}

// GET /api/admin — simple health check / auth verify
export async function GET() {
  const user = await verifySuperAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, user_id: user.id });
}
