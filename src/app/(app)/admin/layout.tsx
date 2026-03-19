import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check super admin status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceRoleClient() as any;
  const { data: role } = await db
    .from("user_roles")
    .select("is_super_admin")
    .eq("user_id", user.id)
    .single();

  if (!role?.is_super_admin) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
