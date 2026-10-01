"""Render the first page of each Resource Center guide PDF into a cover image."""
import fitz  # PyMuPDF
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR = os.path.join(ROOT, "assets", "documents")
OUT_DIR = os.path.join(ROOT, "assets", "resource-covers")
os.makedirs(OUT_DIR, exist_ok=True)

TARGET_W, TARGET_H = 900, 1200

MAPPING = {
    "battles-reader-discussion-guide": "Battles_Beyond_the_Waves_Discussion_Guide_JPP.pdf",
    "our-stories-matter": "Our_Stories_Matter_JPP_Guide.pdf",
    "before-you-publish": "Before_You_Publish_JPP_Guide.pdf",
    "junior-detective-observation-kit": "Junior_Detective_Observation_Kit_JPP.pdf",
    "read-it-forward-guide": "Read_It_Forward_JPP_Guide (2).pdf",
    "beyond-the-uniform": "Beyond_the_Uniform_JPP_Guide (3).pdf",
}

for slug, filename in MAPPING.items():
    src = os.path.join(DOCS_DIR, filename)
    doc = fitz.open(src)
    page = doc.load_page(0)
    page_rect = page.rect
    zoom = max(TARGET_W / page_rect.width, TARGET_H / page_rect.height) * 2
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    doc.close()

    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    src_ratio = img.width / img.height
    target_ratio = TARGET_W / TARGET_H
    if src_ratio > target_ratio:
        new_width = int(img.height * target_ratio)
        left = (img.width - new_width) // 2
        img = img.crop((left, 0, left + new_width, img.height))
    else:
        new_height = int(img.width / target_ratio)
        top = (img.height - new_height) // 2
        img = img.crop((0, top, img.width, top + new_height))
    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    out_path = os.path.join(OUT_DIR, f"{slug}.webp")
    img.save(out_path, "WEBP", quality=85)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"{slug}: {out_path} ({size_kb:.1f} KB)")
