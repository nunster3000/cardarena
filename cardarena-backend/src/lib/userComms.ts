type UserNoticeInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
};

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "CardArena <onboarding@resend.dev>";
}

async function sendEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromEmail(),
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to send user email: ${response.status} ${text}`);
  }
}

export async function createUserNotification(prisma: any, input: UserNoticeInput) {
  return prisma.adminNotification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      payload: input.payload ?? {},
      status: "OPEN",
    },
  });
}

export async function sendSignupDecisionEmail(params: {
  to: string;
  username: string;
  decision: "APPROVED" | "WAITLISTED";
}) {
  const title =
    params.decision === "APPROVED"
      ? "Your CardArena account is approved"
      : "Your CardArena account is waitlisted";
  const body =
    params.decision === "APPROVED"
      ? `<p>Your beta access has been approved. You can login and start competing.</p>`
      : `<p>Your account is currently waitlisted due to beta capacity. We will notify you when access opens.</p>`;

  await sendEmail({
    to: params.to,
    subject: title,
    html: `<h3>Hello ${params.username},</h3>${body}<p>- CardArena Team</p>`,
  });
}

export async function sendAccountRestrictionEmail(params: {
  to: string;
  username: string;
  scope: "ACCOUNT" | "WALLET" | "WITHDRAWALS";
  action: "FROZEN" | "UNFROZEN" | "BLOCKED" | "UNBLOCKED";
  reason?: string | null;
}) {
  const subject = `CardArena ${params.scope.toLowerCase()} status updated`;
  const reasonHtml = params.reason ? `<p><strong>Reason:</strong> ${params.reason}</p>` : "";
  await sendEmail({
    to: params.to,
    subject,
    html: `<h3>Hello ${params.username},</h3><p>Your ${params.scope.toLowerCase()} is now marked as <strong>${params.action.toLowerCase()}</strong>.</p>${reasonHtml}<p>If you need support, contact CardArena support.</p>`,
  });
}

export async function sendRiskFlagEmail(params: {
  to: string;
  username: string;
  flagType: string;
  severity: string;
  reason: string;
}) {
  await sendEmail({
    to: params.to,
    subject: "CardArena account compliance alert",
    html: `<h3>Hello ${params.username},</h3><p>Your account was flagged for compliance review.</p><p><strong>Type:</strong> ${params.flagType}</p><p><strong>Severity:</strong> ${params.severity}</p><p><strong>Reason:</strong> ${params.reason}</p><p>If this appears incorrect, contact CardArena support.</p>`,
  });
}
