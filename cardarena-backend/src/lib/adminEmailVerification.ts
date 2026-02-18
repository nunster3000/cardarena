import crypto from "crypto";

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
}

export async function createAdminEmailVerificationToken(
  prisma: any,
  userId: string
) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);

  const expiresInMinutes = Number(process.env.ADMIN_VERIFY_TOKEN_MINUTES || 15);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await prisma.adminEmailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

export function hashAdminVerificationToken(rawToken: string) {
  return sha256(rawToken);
}

export async function sendAdminDomainVerificationEmail(params: {
  to: string;
  username: string;
  token: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const from = process.env.RESEND_FROM_EMAIL || "CardArena <onboarding@resend.dev>";
  const verifyUrl = `${getFrontendBaseUrl()}/verify-admin?token=${encodeURIComponent(params.token)}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "Verify your CardArena admin email",
      html: `<h3>Verify Admin Access</h3><p>Hello ${params.username},</p><p>Click this link to verify your @thecardarena.com email and activate admin access:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires shortly for security.</p>`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to send admin verification email: ${response.status} ${text}`);
  }
}
