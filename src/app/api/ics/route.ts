import { NextRequest, NextResponse } from "next/server";

import { buildIcs } from "@/lib/ics/ics-builder";
import type { CampusEvent } from "@/lib/types/campus-event";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      events?: CampusEvent[];
      semesterStart?: string;
      calendarName?: string;
    };

    if (!body.events?.length) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NO_EVENTS", message: "没有可导出的事件" },
        },
        { status: 400 },
      );
    }

    const calendarName = body.calendarName ?? "CampusFlow AI";
    const ics = buildIcs(
      body.events,
      body.semesterStart ?? "2026-02-23",
      calendarName,
    );

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          calendarName,
        )}.ics"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "ICS_FAILED", message: String(error) },
      },
      { status: 500 },
    );
  }
}
