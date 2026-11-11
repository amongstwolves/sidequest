import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateAgent, DEMO_AGENT_ID } from "@/lib/agents";
import { buildMcpServer } from "@/lib/mcp/server";

// MCP endpoint (Streamable HTTP, stateless JSON mode): one server + transport per request.
// Auth: Authorization: Bearer <MCP_AGENT_API_KEY>, mapped to the demo agent principal.

function appUrl(request: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function handle(request: Request): Promise<Response> {
  if (!authenticateAgent(request.headers.get("authorization"))) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: send Authorization: Bearer <agent API key>" }, id: null },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="sidequest"' } },
    );
  }
  const server = buildMcpServer(DEMO_AGENT_ID, appUrl(request));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Stateless: nothing to keep once the JSON response is built.
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
