import { proposeWithQwen } from "@/lib/qwen";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { job?: string; page?: string };

  if (!body.job && !body.page) {
    return Response.json({ error: "A job or page is required" }, { status: 400 });
  }

  const proposal = await proposeWithQwen(body.job ?? "Follow the page.", body.page);
  return Response.json({ proposal });
}
