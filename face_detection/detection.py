import cv2
import numpy as np
from typing import Dict, Tuple, Optional


def _score_bbox(w: int, h: int, area: int) -> float:
    # Favor typical plate aspect ratios ~ 2–6 and reasonable area
    if h == 0:
        return 0.0
    ratio = w / float(h)
    if ratio < 1.5 or ratio > 7.0:
        return 0.0
    # Normalize score by rectangularity and size
    base = 1.0 - abs((ratio - 3.0) / 4.0)  # peak near ratio ~3
    size_term = min(area / 5000.0, 1.0)
    return max(base, 0) * size_term


def detect_plate(image_bytes: bytes) -> Dict:
    """Detect likely number plate region in an image.

    Returns a dict with keys:
      - image_bytes: PNG bytes of annotated image
      - has_plate: bool
      - bbox: (x, y, w, h) or None
      - confidence: float in [0, 1]
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        # Return blank with failure
        return {
            "image_bytes": image_bytes,
            "has_plate": False,
            "bbox": None,
            "confidence": 0.0,
        }

    h0, w0 = img.shape[:2]

    # Preprocess
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)
    edges = cv2.Canny(gray, 50, 150)

    # Morphology to strengthen rectangular regions
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    m = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    m = cv2.dilate(m, kernel, iterations=1)

    # Find contours
    result = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = result[-2] if len(result) == 3 else result[0]
    best: Optional[Tuple[int, int, int, int, float]] = None  # x,y,w,h,score

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        area = w * h
        if area < 1000:
            continue
        rect_area = cv2.contourArea(cnt)
        rectangularity = rect_area / float(area)
        if rectangularity < 0.4:
            continue
        score = _score_bbox(w, h, area) * rectangularity
        if best is None or score > best[4]:
            best = (x, y, w, h, score)

    annotated = img.copy()
    has_plate = False
    bbox = None
    confidence = 0.0

    if best is not None and best[4] > 0.1:
        x, y, w, h, score = best
        has_plate = True
        bbox = (int(x), int(y), int(w), int(h))
        confidence = float(min(max(score, 0.0), 1.0))
        cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
        label = f"Plate candidate: {confidence:.2f}"
        cv2.putText(annotated, label, (x, max(0, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    else:
        cv2.putText(annotated, "No plate detected", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)

    # Encode to PNG
    ok, buf = cv2.imencode(".png", annotated)
    if not ok:
        # Fallback to original bytes if encoding fails
        return {
            "image_bytes": image_bytes,
            "has_plate": has_plate,
            "bbox": bbox,
            "confidence": confidence,
        }

    return {
        "image_bytes": buf.tobytes(),
        "has_plate": has_plate,
        "bbox": bbox,
        "confidence": confidence,
    }
