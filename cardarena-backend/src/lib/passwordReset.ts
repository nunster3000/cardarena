import crypto from "crypto";

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
}

export function hashPasswordResetToken(rawToken: string) {
  return sha256(rawToken);
}

export async function createPasswordResetToken(prisma: any, userId: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresInMinutes = Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return rawToken;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  username: string;
  token: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const from = process.env.RESEND_FROM_EMAIL || "CardArena <onboarding@resend.dev>";
  const resetUrl = `${getFrontendBaseUrl()}/reset-password?token=${encodeURIComponent(params.token)}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "Reset your CardArena password",
      html: `<h3>Password Reset Request</h3><p>Hello ${params.username},</p><p>Click to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires shortly.</p>`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to send password reset email: ${response.status} ${text}`);
  }
}
