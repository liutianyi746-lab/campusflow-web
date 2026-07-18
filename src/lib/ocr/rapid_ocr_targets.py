import json
import sys


def main(path):
    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"RapidOCR unavailable: {exc}", "items": []}, ensure_ascii=False))
        return

    payload = json.load(open(path, encoding="utf-8"))
    engine = RapidOCR()
    items = []
    confidences = []
    for target in payload.get("targets", []):
        if target.get("kind") != "cell":
            continue
        result, _ = engine(target["path"])
        lines = [entry[1].strip() for entry in (result or []) if entry[1].strip()]
        confidences.extend(float(entry[2]) for entry in (result or []))
        items.append({
            "kind": target.get("kind"),
            "rowIndex": target.get("rowIndex"),
            "columnIndex": target.get("columnIndex"),
            "dayOfWeek": target.get("dayOfWeek"),
            "periodStart": target.get("periodStart"),
            "periodEnd": target.get("periodEnd"),
            "text": "\n".join(lines),
        })
    confidence = sum(confidences) / len(confidences) if confidences else 0
    print(json.dumps({"success": bool(items), "items": items, "confidence": confidence}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
