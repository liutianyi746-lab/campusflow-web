import type { Period, ScheduleTemplate } from "@/lib/types/campus-event";

export const DEFAULT_PERIODS: Period[] = [
  { periodNumber: 1, startTime: "08:00", endTime: "08:45", label: "第一节" },
  { periodNumber: 2, startTime: "08:55", endTime: "09:40", label: "第二节" },
  { periodNumber: 3, startTime: "10:10", endTime: "10:55", label: "第三节" },
  { periodNumber: 4, startTime: "11:05", endTime: "11:50", label: "第四节" },
  { periodNumber: 5, startTime: "14:00", endTime: "14:45", label: "第五节" },
  { periodNumber: 6, startTime: "14:55", endTime: "15:40", label: "第六节" },
  { periodNumber: 7, startTime: "16:10", endTime: "16:55", label: "第七节" },
  { periodNumber: 8, startTime: "17:05", endTime: "17:50", label: "第八节" },
  { periodNumber: 9, startTime: "19:00", endTime: "19:45", label: "第九节" },
  { periodNumber: 10, startTime: "19:55", endTime: "20:40", label: "第十节" },
  { periodNumber: 11, startTime: "20:50", endTime: "21:35", label: "第十一节" },
  { periodNumber: 12, startTime: "21:45", endTime: "22:30", label: "第十二节" },
];

export const DEFAULT_SCHEDULE_TEMPLATE: ScheduleTemplate = {
  id: "default-campusflow-template",
  name: "通用大学作息模板",
  schoolName: "CampusFlow AI",
  semester: "MVP",
  isActive: true,
  periods: DEFAULT_PERIODS,
};
