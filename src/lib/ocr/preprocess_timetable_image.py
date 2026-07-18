from PIL import Image, ImageOps, ImageFilter
import json
import os
import sys
import numpy as np


def groups(counts, threshold, min_len=1):
    found = []
    start = None
    for index, value in enumerate(counts):
        if value >= threshold and start is None:
            start = index
        if (value < threshold or index == len(counts) - 1) and start is not None:
            end = index - 1 if value < threshold else index
            if end - start + 1 >= min_len:
                found.append((start, end, (start + end) // 2, int(counts[start:end + 1].max())))
            start = None
    return found


def save_ocr_target(image, path, scale=3, trim=False):
    if trim and image.width > 20 and image.height > 20:
        inset = image.crop((8, 8, image.width - 8, image.height - 8))
        values = np.array(ImageOps.grayscale(inset))
        ys, xs = np.where(values < 225)
        if len(xs):
            margin = 8
            image = inset.crop((
                max(0, int(xs.min()) - margin),
                max(0, int(ys.min()) - margin),
                min(inset.width, int(xs.max()) + margin),
                min(inset.height, int(ys.max()) + margin),
            ))
    image = image.resize((max(1, image.width * scale), max(1, image.height * scale)), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.UnsharpMask(radius=1.1, percent=180, threshold=3))
    gray.save(path)


def table_box(image):
    gray = ImageOps.grayscale(image)
    arr = np.array(gray)
    mask = arr < 225
    if not mask.any():
        return (0, 0, image.width, image.height)
    ys, xs = np.where(mask)
    return (
        max(0, int(xs.min()) - 20),
        max(0, int(ys.min()) - 20),
        min(image.width, int(xs.max()) + 20),
        min(image.height, int(ys.max()) + 20),
    )


def period_boundaries(row_lines):
    if len(row_lines) < 14:
        return []
    core = row_lines[1:-1]
    if len(core) >= 14:
        # Common timetable scans include one extra morning separator between period 3 and 4.
        gaps = [core[i + 1] - core[i] for i in range(min(5, len(core) - 1))]
        if len(gaps) >= 5 and max(gaps[:4]) <= 32 and gaps[4] >= 55:
            del core[3]
    return core[:13] if len(core) >= 13 else []


def timetable_geometry(line_dark):
    """Find the main 7-day grid without treating merged-cell dividers as day columns."""
    height, width = line_dark.shape
    full_rows = [item[2] for item in groups(line_dark.sum(axis=1), width * 0.9)]
    if len(full_rows) < 2:
        return None

    header_top, header_bottom = full_rows[0], full_rows[1]
    candidates = [item[2] for item in groups(line_dark.sum(axis=1), width * 0.45) if item[2] > header_bottom]
    early_gaps = [b - a for a, b in zip(candidates[:6], candidates[1:7]) if 100 <= b - a <= 190]
    if not early_gaps:
        return None
    period_height = int(round(float(np.median(early_gaps))))
    main_bottom = header_bottom + period_height * 12
    main_bottom = min(full_rows, key=lambda line: abs(line - main_bottom))
    if abs(main_bottom - (header_bottom + period_height * 12)) > period_height // 2:
        return None

    main = line_dark[header_top:main_bottom + 1, :]
    vertical = groups(main.sum(axis=0), main.shape[0] * 0.9)
    x_lines = [item[2] for item in vertical]
    if len(x_lines) < 10:
        return None
    day_lines = x_lines[-8:]
    bounds = [int(round(header_bottom + period_height * index)) for index in range(13)]
    bounds[-1] = main_bottom
    return header_top, header_bottom, main_bottom, day_lines, bounds


def build_exam_row_targets(crop, dark, row_lines, output_dir, targets):
    if len(row_lines) < 4:
        return False

    height, width = dark.shape
    table_top = max(0, row_lines[0] - 3)
    table_bottom = min(height, row_lines[-1] + 3)
    table_dark = dark[table_top:table_bottom, :]
    if table_dark.size == 0:
        return False

    vertical = groups(table_dark.sum(axis=0), table_dark.shape[0] * 0.45)
    x_lines = [item[2] for item in vertical]
    if len(x_lines) < 5:
        return False

    x0 = max(0, x_lines[0] - 4)
    x1 = min(width, x_lines[-1] + 4)
    saved = 0
    for index, (y0, y1) in enumerate(zip(row_lines[1:-1], row_lines[2:]), start=1):
        if y1 - y0 < 20:
            continue
        inner = dark[y0 + 3:y1 - 3, x0:x1]
        if inner.size == 0 or inner.sum() < 80:
            continue

        row = crop.crop((x0, max(0, y0 - 4), x1, min(height, y1 + 4)))
        filename = f"exam_row_{index}.png"
        row_path = os.path.join(output_dir, filename)
        save_ocr_target(row, row_path, 4)
        targets.append({"kind": "examRow", "path": row_path, "rowIndex": index})

        for column_index, (cx0, cx1) in enumerate(zip(x_lines[:-1], x_lines[1:]), start=1):
            if cx1 - cx0 < 20:
                continue
            cell_inner = dark[y0 + 3:y1 - 3, cx0 + 3:cx1 - 3]
            if cell_inner.size == 0 or cell_inner.sum() < 8:
                continue
            cell = crop.crop((max(0, cx0 - 2), max(0, y0 - 3), min(width, cx1 + 2), min(height, y1 + 3)))
            cell_name = f"exam_cell_{index}_{column_index}.png"
            cell_path = os.path.join(output_dir, cell_name)
            save_ocr_target(cell, cell_path, 5)
            targets.append({
                "kind": "examCell",
                "path": cell_path,
                "rowIndex": index,
                "columnIndex": column_index,
            })
        saved += 1

    return saved >= 2

def build_targets(input_path, output_dir):
    original = Image.open(input_path).convert("RGB")
    crop = original.crop(table_box(original))
    gray = ImageOps.grayscale(crop)
    arr = np.array(gray)
    dark = arr < 190
    line_dark = arr < 225
    height, width = dark.shape

    targets = []
    full_path = os.path.join(output_dir, "ocr_full.png")
    save_ocr_target(crop, full_path, 3)
    targets.append({"kind": "full", "path": full_path})

    geometry = timetable_geometry(line_dark)
    if not geometry:
        horizontal = groups(line_dark.sum(axis=1), width * 0.55)
        row_lines = [item[2] for item in horizontal]
        build_exam_row_targets(crop, dark, row_lines, output_dir, targets)
        return targets

    header_top, header_bottom, main_bottom, day_lines, bounds = geometry

    for column_index, (x0, x1) in enumerate(zip(day_lines[:-1], day_lines[1:]), start=1):
        header = crop.crop((x0 + 3, header_top + 3, x1 - 3, header_bottom - 3))
        header_path = os.path.join(output_dir, f"weekday_header_{column_index}.png")
        save_ocr_target(header, header_path, 4)
        targets.append({"kind": "weekdayHeader", "path": header_path, "columnIndex": column_index})

    period_ranges = [(index + 1, bounds[index], bounds[index + 1]) for index in range(12)]

    for day_index in range(7):
        x0 = day_lines[day_index] + 2
        x1 = day_lines[day_index + 1] - 2
        if x1 <= x0:
            continue
        col_width = x1 - x0
        counts = line_dark[header_bottom:main_bottom + 1, x0:x1].sum(axis=1)
        cell_lines = []
        candidate_lines = [item[2] for item in groups(counts, col_width * 0.85)]
        for relative_line in candidate_lines:
            line = header_bottom + relative_line
            lo = max(0, relative_line - 2)
            hi = min(len(counts), relative_line + 3)
            if counts[lo:hi].max() >= col_width * 0.85:
                cell_lines.append(line)
        for line in (bounds[0], bounds[-1]):
            if line not in cell_lines:
                cell_lines.append(line)
        cell_lines = sorted(set(cell_lines))

        for y0, y1 in zip(cell_lines, cell_lines[1:]):
            if y1 - y0 < 18:
                continue
            inner = dark[y0 + 3:y1 - 3, x0 + 3:x1 - 3]
            if inner.size == 0 or inner.sum() < 80:
                continue
            periods = [period for period, py0, py1 in period_ranges if max(y0, py0) < min(y1, py1) - 3]
            if not periods:
                continue
            pad = 4
            local = line_dark[y0:y1 + 1, x0:x1 + 1]
            local_vertical = [item[2] for item in groups(local.sum(axis=0), local.shape[0] * 0.82)]
            splits = [0] + [line for line in local_vertical if 12 < line < col_width - 12] + [col_width]
            for split_index, (left, right) in enumerate(zip(splits[:-1], splits[1:]), start=1):
                if right - left < 45:
                    continue
                part_x0, part_x1 = x0 + left, x0 + right
                part_inner = dark[y0 + 3:y1 - 3, part_x0 + 3:part_x1 - 3]
                if part_inner.size == 0 or part_inner.sum() < 60:
                    continue
                cell = crop.crop((max(0, part_x0 - pad), max(0, y0 - pad), min(width, part_x1 + pad), min(height, y1 + pad)))
                filename = f"cell_c{day_index + 1}_p{periods[0]}_{periods[-1]}_{split_index}.png"
                cell_path = os.path.join(output_dir, filename)
                save_ocr_target(cell, cell_path, 5)
                targets.append({
                    "kind": "cell",
                    "path": cell_path,
                    "columnIndex": day_index + 1,
                    "periodStart": periods[0],
                    "periodEnd": periods[-1],
                })

    lower_rows = [item[2] for item in groups(line_dark.sum(axis=1), width * 0.9) if item[2] > main_bottom]
    if len(lower_rows) >= 7:
        table_lines = lower_rows[1:8]
        for row_index, (y0, y1) in enumerate(zip(table_lines[1:], table_lines[2:]), start=1):
            row = crop.crop((0, y0 + 2, width, y1 - 2))
            row_path = os.path.join(output_dir, f"course_detail_row_{row_index}.png")
            save_ocr_target(row, row_path, 3)
            targets.append({"kind": "courseDetailRow", "path": row_path, "rowIndex": row_index})

    return targets


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: preprocess_timetable_image.py <image> <output_dir>"}, ensure_ascii=False))
        return
    try:
        os.makedirs(sys.argv[2], exist_ok=True)
        targets = build_targets(sys.argv[1], sys.argv[2])
        print(json.dumps({"success": True, "targets": targets}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
