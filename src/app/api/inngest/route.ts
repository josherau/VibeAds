import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
// Import all job functions here as they're created
// import { briefingJob } from "@/lib/inngest/jobs/briefing";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Add job functions here as they're created
  ],
});
