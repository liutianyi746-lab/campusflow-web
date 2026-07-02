import { NextRequest, NextResponse } from "next/server";

import { corsJson, corsPreflight, withCors } from "@/lib/http/cors";
import { buildIcs } from "@/lib/ics/ics-builder";
import { normalizeSemesterStart } from "@/lib/semester/default-semester";
import type { CampusEvent, Period } from "@/lib/types/campus-event";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      events?: CampusEvent[];
      semesterStart?: string;
      periods?: Period[];
      noClassDates?: string[];
      calendarName?: string;
    };

    if (!body.events?.length) {
      return corsJson(
        {
          success: false,
          error: { code: "NO_EVENTS", message: "没有可导出的事件" },
        },
        { status: 400 },
        req,
      );
    }

    const calendarName = body.calendarName ?? "CampusFlow AI";
    const ics = buildIcs(
      body.events,
      normalizeSemesterStart(body.semesterStart),
      calendarName,
      body.periods?.length ? body.periods : undefined,
      body.noClassDates,
    );

    return withCors(
      new NextResponse(ics, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(
            calendarName,
          )}.ics"`,
        },
      }),
      req,
    );
  } catch (error) {
    return corsJson(
      {
        success: false,
        error: { code: "ICS_FAILED", message: String(error) },
      },
      { status: 500 },
      req,
    );
  }
}
