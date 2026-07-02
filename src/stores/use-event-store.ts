import { create } from "zustand";
import { DEFAULT_NO_CLASS_DATES, normalizeNoClassDates } from "@/lib/calendar/no-class-dates";
import { DEFAULT_SCHEDULE_TEMPLATE } from "@/lib/schedule/default-template";
import { DEFAULT_SEMESTER_START, normalizeSemesterStart } from "@/lib/semester/default-semester";
import type { CampusEvent, ScheduleTemplate } from "@/lib/types/campus-event";

interface EventStore {
  events: CampusEvent[];
  selectedIds: Set<string>;
  scheduleTemplate: ScheduleTemplate;
  semesterStart: string;
  noClassDates: string[];
  setEvents: (events: CampusEvent[]) => void;
  appendEvents: (events: CampusEvent[]) => void;
  updateEvent: (id: string, patch: Partial<CampusEvent>) => void;
  removeEvent: (id: string) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSemesterStart: (date: string) => void;
  addNoClassDate: (date: string) => void;
  removeNoClassDate: (date: string) => void;
  resetNoClassDates: () => void;
  setScheduleTemplate: (template: ScheduleTemplate) => void;
  resetScheduleTemplate: () => void;
  reset: () => void;
}

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  selectedIds: new Set(),
  scheduleTemplate: DEFAULT_SCHEDULE_TEMPLATE,
  semesterStart: DEFAULT_SEMESTER_START,
  noClassDates: DEFAULT_NO_CLASS_DATES,
  setEvents: (events) => set({ events, selectedIds: new Set(events.map((event) => event.id)) }),
  appendEvents: (events) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      events.forEach((event) => selectedIds.add(event.id));
      return { events: [...state.events, ...events], selectedIds };
    }),
  updateEvent: (id, patch) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id === id ? { ...event, ...patch, userEdited: true } : event,
      ),
    })),
  removeEvent: (id) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      selectedIds.delete(id);
      return { events: state.events.filter((event) => event.id !== id), selectedIds };
    }),
  toggleSelect: (id) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      return { selectedIds };
    }),
  selectAll: () => set((state) => ({ selectedIds: new Set(state.events.map((event) => event.id)) })),
  clearSelection: () => set({ selectedIds: new Set() }),
  setSemesterStart: (date) => set({ semesterStart: normalizeSemesterStart(date) }),
  addNoClassDate: (date) =>
    set((state) => ({ noClassDates: normalizeNoClassDates([...state.noClassDates, date]) })),
  removeNoClassDate: (date) =>
    set((state) => ({ noClassDates: state.noClassDates.filter((item) => item !== date) })),
  resetNoClassDates: () => set({ noClassDates: DEFAULT_NO_CLASS_DATES }),
  setScheduleTemplate: (template) => set({ scheduleTemplate: template }),
  resetScheduleTemplate: () => set({ scheduleTemplate: DEFAULT_SCHEDULE_TEMPLATE }),
  reset: () =>
    set({
      events: [],
      selectedIds: new Set(),
      scheduleTemplate: DEFAULT_SCHEDULE_TEMPLATE,
      semesterStart: DEFAULT_SEMESTER_START,
      noClassDates: DEFAULT_NO_CLASS_DATES,
    }),
}));
