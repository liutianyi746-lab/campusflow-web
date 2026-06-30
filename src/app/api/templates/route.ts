import { NextRequest } from "next/server";

import { corsJson, corsPreflight } from "@/lib/http/cors";
import { DEFAULT_PERIODS, DEFAULT_SCHEDULE_TEMPLATE } from "@/lib/schedule/default-template";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest) {
  return corsJson(
    {
      success: true,
      data: [DEFAULT_SCHEDULE_TEMPLATE],
      defaults: DEFAULT_PERIODS,
      persistence: "memory-only",
    },
    undefined,
    req,
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    schoolName?: string;
    semester?: string;
    isActive?: boolean;
    periods?: Array<{
      periodNumber: number;
      startTime: string;
      endTime: string;
      label?: string;
    }>;
  };

  if (!body.name?.trim()) {
    return corsJson(
      {
        success: false,
        error: { code: "INVALID_TEMPLATE", message: "模板名称不能为空" },
      },
      { status: 400 },
      req,
    );
  }

  const periods = body.periods?.length ? body.periods : DEFAULT_PERIODS;
  return corsJson(
    {
      success: true,
      data: {
        id: `memory-template-${Date.now()}`,
        name: body.name.trim(),
        schoolName: body.schoolName ?? null,
        semester: body.semester ?? null,
        isActive: body.isActive ?? false,
        periods,
      },
      persistence: "not-saved",
    },
    undefined,
    req,
  );
}