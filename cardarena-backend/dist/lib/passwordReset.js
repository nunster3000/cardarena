"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPasswordResetToken = hashPasswordResetToken;
exports.createPasswordResetToken = createPasswordResetToken;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const crypto_1 = __importDefault(require("crypto"));
function sha256(value) {
    return crypto_1.default.createHash("sha256").update(value).digest("hex");
}
function getFrontendBaseUrl() {
    return (process.env.FRONTEND_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
}
function hashPasswordResetToken(rawToken) {
    return sha256(rawToken);
}
async function createPasswordResetToken(prisma, userId) {
    const rawToken = crypto_1.default.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken);
    const expiresInMinutes = Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    await prisma.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt },
    });
    return rawToken;
}
async function sendPasswordResetEmail(params) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey)
        return;
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
