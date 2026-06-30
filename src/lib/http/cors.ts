import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";

export function corsHeaders(req: NextRequest): HeadersInit {
  const configuredOrigin = process.env.CORS_ALLOW_ORIGIN?.trim();
  const requestOrigin = req.headers.get("origin") ?? "";
  const allowOrigin =
    configuredOrigin && configuredOrigin.length > 0
      ? configuredOrigin
      : requestOrigin || "*";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
  };

  if (allowOrigin !== "*") {
    headers.Vary = "Origin";
  }

  return headers;
}

export function withCors<T extends Response>(response: T, req: NextRequest): T {
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    response.headers.set(key, value);
  }
  return response;
}

export function corsJson(body: unknown, init: ResponseInit | undefined, req: NextRequest) {
  return withCors(NextResponse.json(body, init), req);
}

export function corsPreflight(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req),
  });
}
