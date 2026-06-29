import { create } from "zustand"
type Step = "landing" | "upload" | "ocr" | "review" | "editor" | "export"

interface StepStore {
  currentStep: Step; imageUrl: string | null; ocrText: string | null; ocrHash: string | null
  setStep: (s: Step) => void; setImageUrl: (u: string | null) => void
  setOcrResult: (t: string, h: string) => void; reset: () => void
}

export const useStepStore = create<StepStore>((set) => ({
  currentStep: "landing", imageUrl: null, ocrText: null, ocrHash: null,
  setStep: (s) => set({ currentStep: s }),
  setImageUrl: (u) => set({ imageUrl: u, currentStep: "ocr" }),
  setOcrResult: (t, h) => set({ ocrText: t, ocrHash: h, currentStep: "review" }),
  reset: () => set({ currentStep: "landing", imageUrl: null, ocrText: null, ocrHash: null }),
}))
