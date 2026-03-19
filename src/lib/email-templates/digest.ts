// ── Email Digest Template ──────────────────────────────────────────────

interface DigestData {
  brandName: string;
  brandUrl?: string;
  executiveSummary: string;
  competitorMoves: Array<{
    competitor: string;
    move: string;
    implication: string;
  }>;
  viralOutliers: Array<{
    competitor: string;
    title: string;
    platform: string;
    engagementMultiple: number;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    priority: string;
  }>;
  newAdsCount: number;
  totalContentAnalyzed: number;
  healthScore: number | null;
  dashboardUrl: string;
  unsubscribeUrl: string;
  digestDate: string;
}

function priorityBadge(priority: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    high: { bg: "#fee2e2", text: "#991b1b" },
    medium: { bg: "#fef3c7", text: "#92400e" },
    low: { bg: "#dcfce7", text: "#166534" },
  };
  const c = colors[priority] ?? colors.medium;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text};text-transform:uppercase;">${priority}</span>`;
}

function healthScoreColor(score: number): string {
  if (score >= 70) return "#16a34a";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

export function buildDigestEmail(data: DigestData): string {
  const {
    brandName,
    executiveSummary,
    competitorMoves,
    viralOutliers,
    recommendations,
    newAdsCount,
    totalContentAnalyzed,
    healthScore,
    dashboardUrl,
    unsubscribeUrl,
    digestDate,
  } = data;

  const competitorMovesHtml =
    competitorMoves.length > 0
      ? competitorMoves
          .slice(0, 5)
          .map(
            (m) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0 0 4px 0;font-weight:600;color:#111827;font-size:14px;">${m.competitor}</p>
            <p style="margin:0 0 4px 0;color:#374151;font-size:14px;">${m.move}</p>
            <p style="margin:0;color:#6b7280;font-size:13px;font-style:italic;">Impact: ${m.implication}</p>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td style="padding:12px 0;color:#6b7280;font-size:14px;">No major competitor moves detected this period.</td></tr>`;

  const viralOutliersHtml =
    viralOutliers.length > 0
      ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td style="padding:20px 24px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
          <h2 style="margin:0 0 12px 0;font-size:18px;color:#92400e;font-weight:700;">Viral Content Alert</h2>
          <p style="margin:0 0 16px 0;color:#92400e;font-size:14px;">Content performing 3x+ above baseline detected:</p>
          ${viralOutliers
            .slice(0, 5)
            .map(
              (v) => `
          <div style="margin-bottom:12px;padding:8px 12px;background:#ffffff;border-radius:6px;">
            <p style="margin:0 0 2px 0;font-weight:600;color:#111827;font-size:14px;">${v.competitor} on ${v.platform}</p>
            <p style="margin:0 0 2px 0;color:#374151;font-size:13px;">${v.title}</p>
            <p style="margin:0;color:#d97706;font-weight:600;font-size:13px;">${v.engagementMultiple}x above average</p>
          </div>`
            )
            .join("")}
        </td>
      </tr>
    </table>`
      : "";

  const recommendationsHtml =
    recommendations.length > 0
      ? recommendations
          .slice(0, 3)
          .map(
            (r, i) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0 0 4px 0;font-size:14px;">
              <span style="font-weight:700;color:#111827;">${i + 1}. ${r.title}</span>
              &nbsp;${priorityBadge(r.priority)}
            </p>
            <p style="margin:0;color:#374151;font-size:14px;">${r.description}</p>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td style="padding:12px 0;color:#6b7280;font-size:14px;">No recommendations available yet. Run a pipeline to generate intelligence.</td></tr>`;

  const healthScoreHtml =
    healthScore != null
      ? `
    <td style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;width:33%;">
      <p style="margin:0;font-size:32px;font-weight:800;color:${healthScoreColor(healthScore)};">${healthScore}</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Health Score</p>
    </td>`
      : `
    <td style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;width:33%;">
      <p style="margin:0;font-size:32px;font-weight:800;color:#9ca3af;">--</p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Health Score</p>
    </td>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Intelligence Digest - ${brandName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.025em;">VibeAds</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Intelligence Digest for ${brandName}</p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;">${digestDate}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:0;background:#ffffff;border-radius:0 0 12px 12px;">

              <!-- Executive Summary -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:24px;">
                    <h2 style="margin:0 0 12px 0;font-size:18px;color:#111827;font-weight:700;">Executive Summary</h2>
                    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${executiveSummary}</p>
                  </td>
                </tr>
              </table>

              <!-- Key Metrics -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 24px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="8">
                      <tr>
                        ${healthScoreHtml}
                        <td style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;width:33%;">
                          <p style="margin:0;font-size:32px;font-weight:800;color:#6366f1;">${newAdsCount}</p>
                          <p style="margin:4px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">New Ads</p>
                        </td>
                        <td style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;width:33%;">
                          <p style="margin:0;font-size:32px;font-weight:800;color:#6366f1;">${totalContentAnalyzed}</p>
                          <p style="margin:4px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Content Analyzed</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Competitor Moves -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 24px 24px;">
                    <h2 style="margin:0 0 12px 0;font-size:18px;color:#111827;font-weight:700;">Top Competitor Moves</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${competitorMovesHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Viral Outliers -->
              ${viralOutliersHtml ? `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 24px 24px;">${viralOutliersHtml}</td></tr></table>` : ""}

              <!-- AI Recommendations -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 24px 24px;">
                    <h2 style="margin:0 0 12px 0;font-size:18px;color:#111827;font-weight:700;">AI Recommendations</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${recommendationsHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 24px 32px;text-align:center;">
                    <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
                      View Full Dashboard
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;">
                Sent by VibeAds for ${brandName}
              </p>
              <a href="${unsubscribeUrl}" style="color:#9ca3af;font-size:12px;text-decoration:underline;">
                Unsubscribe from digest emails
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
