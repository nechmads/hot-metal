import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CfApiClient } from "../src/cf-api";

afterEach(() => vi.unstubAllGlobals());

describe("dispatch asset uploads", () => {
  it.each([257, 16 * 1024 * 1024])(
    "uploads a %i-byte binary view as exact base64 with its browser MIME type",
    async (size) => {
      // The view deliberately excludes padding in the underlying buffer.
      const backing = new Uint8Array(size + 8);
      const bytes = backing.subarray(4, size + 4);
      bytes.fill(0xa5);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const hash = digest.slice(0, 32);
      let uploaded = false;
      const fetcher = vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/assets-upload-session")) {
          expect(JSON.parse(init.body as string)).toEqual({
            manifest: { "/admin.js": { hash, size } },
          });
          return Response.json({
            success: true,
            result: { jwt: "upload-token", buckets: [[hash]] },
          });
        }
        if (url.endsWith("/workers/assets/upload?base64=true")) {
          expect(init.headers).toMatchObject({
            Authorization: "Bearer upload-token",
          });
          const file = (init.body as FormData).get(hash) as File;
          expect(file.type).toBe("text/javascript");
          const encoded = await file.text();
          expect(encoded.length).toBe(Math.ceil(size / 3) * 4);
          const decoded = Buffer.from(encoded, "base64");
          expect(decoded.byteLength).toBe(size);
          expect(createHash("sha256").update(decoded).digest("hex")).toBe(
            digest,
          );
          uploaded = true;
          return Response.json({
            success: true,
            result: { jwt: "completion-token" },
          });
        }
        expect(url).toContain("/scripts/pub-test");
        const metadata = JSON.parse(
          await ((init.body as FormData).get("metadata") as File).text(),
        );
        expect(metadata.assets).toEqual({ jwt: "completion-token" });
        return Response.json({ success: true, result: {} });
      });
      vi.stubGlobal("fetch", fetcher);
      await new CfApiClient(
        "test-account",
        "test-api-token",
      ).uploadDispatchScript("test-namespace", {
        scriptName: "pub-test",
        mainModule: "index.mjs",
        modules: [
          {
            name: "index.mjs",
            content: new TextEncoder().encode("export default {}"),
          },
        ],
        assets: [
          { path: "/admin.js", content: bytes, contentType: "text/javascript" },
        ],
        bindings: [],
        compatibilityDate: "2026-02-24",
      });
      expect(uploaded).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
});
