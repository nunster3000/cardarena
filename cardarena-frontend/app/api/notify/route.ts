import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const { name, email } = await req.json();

  try {
    await resend.emails.send({
      from: "CardArena <onboarding@resend.dev>",
      to: "khris.nunnally@thecardarena.com", // <-- change this
      subject: "New CardArena Waitlist Signup",
      html: `
        <h2>New Signup</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
      `,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response("Email failed", { status: 500 });
  }
}
