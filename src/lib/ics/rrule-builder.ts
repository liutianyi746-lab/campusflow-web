export function buildRrule(fd: Date, wt: string, we: number, semStart: string): string | null {
  const sem = new Date(semStart); const dow = fd.getDay() || 7
  const endDate = (wn: number) => {
    const d = (dow - (sem.getDay()||7) + 7) % 7
    const e = new Date(sem); e.setDate(e.getDate() + d + 7*(wn-1))
    return `${e.getFullYear()}${String(e.getMonth()+1).padStart(2,'0')}${String(e.getDate()).padStart(2,'0')}T235959Z`
  }
  switch(wt) {
    case "EVERY_WEEK": return `FREQ=WEEKLY;INTERVAL=1;UNTIL=${endDate(we)}`
    case "ODD_WEEK": case "EVEN_WEEK": return `FREQ=WEEKLY;INTERVAL=2;UNTIL=${endDate(we)}`
    case "SPECIFIC_WEEKS": return null
    default: return `FREQ=WEEKLY;INTERVAL=1;UNTIL=${endDate(we)}`
  }
}
