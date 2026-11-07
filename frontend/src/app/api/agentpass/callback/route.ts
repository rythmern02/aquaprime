import { completeApproval } from "@/server/agentpass";
import { HttpError } from "@/server/env";

export const dynamic = "force-dynamic";

/** OIDC redirect target. Resolves the attempt server-side, then notifies the opener window. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let payload: { attemptId?: string; status: string; reason?: string };
  try {
    payload = await completeApproval(url.searchParams);
  } catch (e) {
    payload = { status: "error", reason: e instanceof HttpError ? e.message : "callback_failed" };
    if (!(e instanceof HttpError)) console.error(e);
  }
  const data = JSON.stringify({ type: "aquaprime-agentpass", ...payload }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(url.origin);
  const html = `<!doctype html><meta charset="utf-8"><title>AquaPrime · Agent Pass</title>
<body style="background:linear-gradient(#B4E0FC,#F4F9FE);color:#06223D;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p>${payload.status === "approved" ? "Human approval recorded. You can close this window." : "Approval not granted. You can close this window."}</p>
<script>
  const msg = ${data};
  if (window.opener) { window.opener.postMessage(msg, ${origin}); setTimeout(() => window.close(), 400); }
</script></body>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}
