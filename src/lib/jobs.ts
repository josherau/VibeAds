import { createClient } from "@/lib/supabase/client";

export type JobType =
  | 'competitor_ads' | 'social_scrape' | 'youtube_scrape' | 'landing_pages'
  | 'analyze' | 'generate_ads' | 'generate_social' | 'atomize_content'
  | 'briefing' | 'seo_audit' | 'sync_campaigns' | 'optimize_campaigns'
  | 'generate_email' | 'generate_landing_page';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  brand_id: string | null;
  user_id: string | null;
  job_type: JobType;
  status: JobStatus;
  progress: number;
  progress_message: string | null;
  result: any;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export async function startJob(brandId: string, jobType: JobType): Promise<Job> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if there's already a running job of this type for this brand
  const { data: existingJob } = await supabase
    .from("jobs")
    .select("*")
    .eq("brand_id", brandId)
    .eq("job_type", jobType)
    .eq("status", "running")
    .single();

  if (existingJob) {
    return existingJob as Job;
  }

  // Trigger the job via API
  const res = await fetch("/api/jobs/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand_id: brandId, job_type: jobType }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to start job");
  }

  return await res.json() as Job;
}

export async function pollJob(jobId: string): Promise<Job> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data as Job;
}

export function useJobPolling(jobId: string | null, intervalMs = 3000) {
  // This is a hook pattern - implement with useState/useEffect in the component
  // Returns: { job, isPolling }
}
