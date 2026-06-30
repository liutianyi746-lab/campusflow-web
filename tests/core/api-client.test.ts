import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { apiUrl } from "../../src/lib/http/api-client.ts";

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  if (originalApiBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
  }
});

describe("apiUrl", () => {
  it("keeps relative API paths for the local full-stack app", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    assert.equal(apiUrl("/api/upload"), "/api/upload");
    assert.equal(apiUrl("api/parse"), "/api/parse");
  });

  it("prefixes API paths with a configured backend origin", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com/";

    assert.equal(apiUrl("/api/upload"), "https://api.example.com/api/upload");
    assert.equal(apiUrl("api/ics"), "https://api.example.com/api/ics");
  });
});