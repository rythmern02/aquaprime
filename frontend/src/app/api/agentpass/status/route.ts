import { attemptStatus } from "@/server/agentpass";
import { errorResponse, HttpError } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id", "bad_request");
    const a = await attemptStatus(id);
    if (!a) throw new HttpError(404, "Unknown approval", "not_found");
    return Response.json(a);
  } catch (e) {
    return errorResponse(e);
  }
}
