import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Phase A (Automation Reliability) test support: a tiny local stand-in for
// Meta's Graph API, controlled per-test via a handler function. Points
// graph-client.ts / instagram-oauth.ts at it via META_GRAPH_API_BASE_URL —
// the exact seam those modules' doc comments describe existing for this
// purpose. No real network call is ever made by these tests.

export type MockMetaResponse =
  // `delayMs`, if set, holds the response for that long before writing it
  // — used to simulate slow Meta calls in per-item deadline tests, without
  // relying on graph-client.ts's real 15s request timeout.
  | { status: number; body: unknown; delayMs?: number }
  // Destroys the connection after the request is received but before any
  // response is written — the fastest reliable way to make `fetch()`
  // itself throw (an ECONNRESET-style failure), simulating "the request
  // reached the server but the response was lost," which is exactly the
  // ambiguous-outcome case Phase A's DELIVERY_UNCERTAIN classification
  // exists for.
  | "reset";

export type MockMetaHandler = (info: { url: string; method: string }) => MockMetaResponse;

export class MockMetaServer {
  private server: Server;
  private handler: MockMetaHandler;
  baseUrl = "";

  constructor(initialHandler: MockMetaHandler) {
    this.handler = initialHandler;
    this.server = createServer((req, res) => {
      const result = this.handler({ url: req.url ?? "", method: req.method ?? "GET" });
      if (result === "reset") {
        req.socket.destroy();
        return;
      }
      const respond = () => {
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.body));
      };
      if (result.delayMs) setTimeout(respond, result.delayMs);
      else respond();
    });
  }

  setHandler(handler: MockMetaHandler): void {
    this.handler = handler;
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((err) => (err ? reject(err) : resolve())));
  }
}

// Convenience canned responses for the most common test scenarios.
export const metaSuccessPrivateReply = (messageId = "mid.test"): MockMetaResponse => ({
  status: 200,
  body: { recipient_id: "recipient-test", message_id: messageId },
});

export const metaSuccessPublicReply = (id = "reply.test"): MockMetaResponse => ({
  status: 200,
  body: { id },
});

export const metaTransient5xx: MockMetaResponse = {
  status: 503,
  body: { error: { message: "Service unavailable", code: 2, error_subcode: 0 } },
};

export const metaRateLimited: MockMetaResponse = {
  status: 429,
  body: { error: { message: "Application request limit reached", code: 4 } },
};

export const metaPermanentBadRequest: MockMetaResponse = {
  status: 400,
  body: { error: { message: "Invalid parameter", code: 100 } },
};

export const metaAuthExpiredToken: MockMetaResponse = {
  status: 401,
  body: { error: { message: "Error validating access token", code: 190, error_subcode: 463 } },
};

// A 403 that is NOT a token problem — a permission/policy rejection. Must
// classify PERMANENT, not AUTH (see meta-api-error.ts).
export const metaPermissionForbidden: MockMetaResponse = {
  status: 403,
  body: { error: { message: "Permission denied for this action", code: 200 } },
};

// A 403 that Meta uses to signal a confirmed invalid/expired token — the
// code (190), not the status, is what makes this AUTH.
export const metaConfirmedTokenInvalid403: MockMetaResponse = {
  status: 403,
  body: { error: { message: "Error validating access token", code: 190, error_subcode: 460 } },
};
