"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const memberId = searchParams.get("member_id");
  const orgId = searchParams.get("org_id");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [orgName, setOrgName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!memberId || !orgId) {
      setStatus("error");
      setErrorMsg("Invalid invitation link. Missing required parameters.");
      return;
    }

    async function acceptInvitation() {
      try {
        const res = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: memberId, org_id: orgId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to accept invitation");
        }

        setOrgName(data.organization_name);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to accept invitation"
        );
      }
    }

    acceptInvitation();
  }, [memberId, orgId]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "loading" && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>Accepting Invitation</CardTitle>
              <CardDescription>Please wait...</CardDescription>
            </>
          )}
          {status === "success" && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Welcome to {orgName}!</CardTitle>
              <CardDescription>
                You have successfully joined the organization. You now have
                access to the shared brands and resources.
              </CardDescription>
            </>
          )}
          {status === "error" && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle>Invitation Error</CardTitle>
              <CardDescription>{errorMsg}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="flex justify-center">
          {status !== "loading" && (
            <Button onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
