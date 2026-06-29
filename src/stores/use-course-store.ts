import { create } from "zustand"
import type { CourseEvent } from "@/lib/types/course-event"

interface CourseStore {
  courses: CourseEvent[]; selectedIds: Set<string>
  setCourses: (c: CourseEvent[]) => void
  updateCourse: (id: string, p: Partial<CourseEvent>) => void
  removeCourse: (id: string) => void
  toggleSelect: (id: string) => void; selectAll: () => void
  addCustomEvent: (e: CourseEvent) => void; reset: () => void
}

export const useCourseStore = create<CourseStore>((set) => ({
  courses: [], selectedIds: new Set(),
  setCourses: (c) => set({ courses: c, selectedIds: new Set(c.map(x => x.id)) }),
  updateCourse: (id, p) => set((s) => ({ courses: s.courses.map(c => c.id === id ? { ...c, ...p, userEdited: true } : c) })),
  removeCourse: (id) => set((s) => { const n = new Set(s.selectedIds); n.delete(id); return { courses: s.courses.filter(c => c.id !== id), selectedIds: n } }),
  toggleSelect: (id) => set((s) => {
    const n = new Set(s.selectedIds);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return { selectedIds: n };
  }),
  selectAll: () => set((s) => ({ selectedIds: new Set(s.courses.map(c => c.id)) })),
  addCustomEvent: (e) => set((s) => { const n = new Set(s.selectedIds); n.add(e.id); return { courses: [...s.courses, e], selectedIds: n } }),
  reset: () => set({ courses: [], selectedIds: new Set() }),
}))
