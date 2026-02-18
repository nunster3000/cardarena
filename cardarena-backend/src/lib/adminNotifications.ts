export async function createSignupReviewNotification(
  prisma: {
    adminNotification: {
      create: (args: {
        data: {
          type: string;
          title: string;
          message: string;
          userId: string;
          payload: {
            userId: string;
            username: string;
            email: string;
          };
        };
      }) => Promise<unknown>;
    };
  },
  params: { userId: string; username: string; email: string }
) {
  return prisma.adminNotification.create({
    data: {
      type: "SIGNUP_REVIEW",
      title: "New signup pending approval",
      message: `${params.username} (${params.email}) is requesting beta access.`,
      userId: params.userId,
      payload: {
        userId: params.userId,
        username: params.username,
        email: params.email,
      },
    },
  });
}

export async function sendAdminSignupEmail(params: {
  username: string;
  email: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!apiKey || !to) return;

  const from = process.env.RESEND_FROM_EMAIL || "CardArena <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "CardArena signup approval request",
      html: `<h3>New signup pending review</h3><p><strong>Username:</strong> ${params.username}</p><p><strong>Email:</strong> ${params.email}</p>`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to send admin signup email: ${response.status} ${text}`);
  }
}
