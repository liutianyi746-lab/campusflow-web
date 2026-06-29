import datetime
import json
import re
import sys

try:
    import pdfplumber
except Exception as exc:
    print(json.dumps({"success": False, "error": f"pdfplumber unavailable: {exc}"}, ensure_ascii=False))
    sys.exit(0)

WEEKDAY_BY_HEADER = {
    "星期一": "周一",
    "星期二": "周二",
    "星期三": "周三",
    "星期四": "周四",
    "星期五": "周五",
    "星期六": "周六",
    "星期日": "周日",
}


def clean(value):
    return re.sub(r"\s+", "", value or "")


def display_clean(value):
    return re.sub(r"\s+", "", value or "").replace("▲", "").strip()


def split_entries(cell):
    entries = []
    current = None
    for raw_line in (cell or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if "▲" in line:
            if current:
                entries.append(current)
            current = {"title": display_clean(line), "details": []}
        elif current:
            current["details"].append(line)
    if current:
        entries.append(current)
    return entries


def normalize_entry(weekday, entry):
    details = clean("".join(entry["details"]))
    period = re.search(r"\((\d{1,2})-(\d{1,2})节\)", details)
    week = re.search(r"\)\s*([^/]*?周(?:\([^)]*\))?)\s*/", details)
    location = re.search(r"场地:([^/]+?)(?:/教师:|$)", details)
    teacher = re.search(r"教师:([^/]+?)(?:/课程|/学分|$)", details)
    if not period:
        return None

    line = f"{weekday} {period.group(1)}-{period.group(2)}节 {entry['title']}"
    if teacher:
        line += f" {teacher.group(1)}老师"
    if location:
        line += f" {location.group(1)}"
    if week:
        line += f" {week.group(1).replace('(单)', ' 单周').replace('(双)', ' 双周')}"
    return line


def table_to_lines(table):
    header_index = None
    headers = []
    for idx, row in enumerate(table):
        normalized = [clean(cell) for cell in row]
        if any(cell in WEEKDAY_BY_HEADER for cell in normalized):
            header_index = idx
            headers = normalized
            break
    if header_index is None:
        return []

    lines = []
    for row in table[header_index + 1:]:
        for col_index, cell in enumerate(row):
            if not cell or col_index >= len(headers):
                continue
            weekday = WEEKDAY_BY_HEADER.get(headers[col_index])
            if not weekday:
                continue
            for entry in split_entries(cell):
                line = normalize_entry(weekday, entry)
                if line:
                    lines.append(line)
    return lines


def infer_semester_start(text):
    match = re.search(r"(\d{4})-\d{4}学年第([12])学期", text or "")
    if not match:
        return None
    year = int(match.group(1))
    term = int(match.group(2))
    date = datetime.date(year, 9, 1) if term == 1 else datetime.date(year + 1, 2, 20)
    while date.weekday() != 0:
        date += datetime.timedelta(days=1)
    return date.isoformat()


def main(path):
    all_lines = []
    fallback_text = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text:
                fallback_text.append(text)
            for table in page.extract_tables() or []:
                all_lines.extend(table_to_lines(table))

    source_text = "\n".join(fallback_text).strip()
    semester_start = infer_semester_start(source_text)

    deduped = []
    seen = set()
    for line in all_lines:
        if line not in seen:
            seen.add(line)
            deduped.append(line)

    if deduped:
        text = "课程表\n" + "\n".join(deduped)
        print(json.dumps({"success": True, "text": text, "mode": "table", "count": len(deduped), "semesterStart": semester_start}, ensure_ascii=False))
        return

    print(json.dumps({"success": bool(source_text), "text": source_text, "mode": "text", "count": 0, "semesterStart": semester_start}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
