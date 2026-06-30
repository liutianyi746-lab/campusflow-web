export type CampusEventType =
  | "COURSE"
  | "EXAM"
  | "HOMEWORK"
  | "MEETING"
  | "ACTIVITY"
  | "REMINDER";

export type WeekType =
  | "EVERY_WEEK"
  | "ODD_WEEK"
  | "EVEN_WEEK"
  | "SPECIFIC_WEEKS";

export type EventSource =
  | "IMAGE"
  | "PDF"
  | "EXCEL"
  | "TEXT"
  | "MANUAL"
  | "OCR_STUB"
  | "AI";

export type RecognitionIntent =
  | "AUTO"
  | "COURSE"
  | "SCHEDULE"
  | "EXAM"
  | "HOMEWORK"
  | "NOTICE"
  | "NATURAL_LANGUAGE";

export interface Period {
  periodNumber: number;
  startTime: string;
  endTime: string;
  label?: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  schoolName?: string | null;
  semester?: string | null;
  isActive: boolean;
  periods: Period[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WeekRule {
  weekStart: number;
  weekEnd: number;
  weekType: WeekType;
  specificWeeks?: number[];
}

export interface CourseFields extends WeekRule {
  courseName: string;
  teacher?: string;
  classroom?: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
}

export interface CampusEvent {
  id: string;
  title: string;
  type: CampusEventType;
  startTime?: string;
  endTime?: string;
  location?: string;
  seatNumber?: string;
  description?: string;
  reminderMinutes?: number;
  rrule?: string | null;
  weekType?: WeekType;
  source: EventSource;
  confidence: number;
  userEdited?: boolean;
  course?: CourseFields;
  rawText?: string;
  warnings?: string[];
}

export interface OcrResult {
  success: boolean;
  ocrText: string;
  confidence: number;
  processingTimeMs: number;
  inputHash: string;
  source?: EventSource;
  error?: string;
}

export interface RecognitionResult {
  success: boolean;
  events: CampusEvent[];
  rawText?: string;
  unrecognizedItems: string[];
  overallConfidence: number;
  templateApplied: boolean;
  warnings?: string[];
  error?: string;
}

export interface IcsRequest {
  events: CampusEvent[];
  semesterStart: string;
  calendarName: string;
  periods?: Period[];
}

export type LegacyCourseEvent = CourseFields & {
  id: string;
  sourceType: CampusEventType | "CUSTOM";
  location?: string;
  startTime?: string;
  endTime?: string;
  confidence: number;
  userEdited: boolean;
};


