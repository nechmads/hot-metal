import { describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
vi.mock("@hotmetal/shared", () => ({
  logger: () => ({ error: vi.fn(), info: vi.fn() }),
}));
import webhooks from "../../../apps/web/src/api/webhooks";

const secret = `whsec_${Buffer.from("hotmetal-test-signing-secret").toString("base64")}`;
const body = JSON.stringify({ type: "test.ignored", data: {} });
const id = "msg_test";
const timestamp = new Date();
const headers = {
  "Content-Type": "application/json",
  "svix-id": id,
  "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
  "svix-signature": new Webhook(secret).sign(id, timestamp, body),
};

describe("Clerk webhook signature contract with Svix 2", () => {
  it("parses a signed event after verification, which now returns undefined", async () => {
    const response = await webhooks.request(
      "/clerk",
      { method: "POST", body, headers },
      { CLERK_WEBHOOK_SECRET: secret },
    );
    expect(response.status).toBe(200);
  });

  it("rejects a body changed after signing", async () => {
    const response = await webhooks.request(
      "/clerk",
      { method: "POST", body: body + " ", headers },
      { CLERK_WEBHOOK_SECRET: secret },
    );
    expect(response.status).toBe(400);
  });

  it("rejects missing signature headers", async () => {
    const response = await webhooks.request(
      "/clerk",
      { method: "POST", body },
      { CLERK_WEBHOOK_SECRET: secret },
    );
    expect(response.status).toBe(400);
  });
});
