import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_PERIODS, DEFAULT_SCHEDULE_TEMPLATE } from "@/lib/schedule/default-template";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [DEFAULT_SCHEDULE_TEMPLATE],
    defaults: DEFAULT_PERIODS,
    persistence: "memory-only",
  });
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
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_TEMPLATE", message: "模板名称不能为空" },
      },
      { status: 400 },
    );
  }

  const periods = body.periods?.length ? body.periods : DEFAULT_PERIODS;
  return NextResponse.json({
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
  });
}
