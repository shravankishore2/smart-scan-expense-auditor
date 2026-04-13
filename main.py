
"""Smart-Scan Expense Auditor - FastAPI backend."""

import io
import json
import os
import re
import base64
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pdf2image import convert_from_bytes
from dotenv import load_dotenv
from PIL import Image
import pytesseract

load_dotenv()

app = FastAPI(title="Smart-Scan Expense Auditor")

# DEMO MODE (no API calls)
DEMO_MODE = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")

# OCR MODE - uses local OCR first, then sends text to AI (lower tokens)
USE_OCR_MODE = os.getenv("USE_OCR_MODE", "").lower() in ("1", "true", "yes")

# OPENROUTER CONFIG
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

BASE_DIR = Path(__file__).resolve().parent
Path("uploads").mkdir(exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_PDF_TYPE = "application/pdf"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

OCR_PROMPT = """You are a tax assistant. Analyze the following OCR text extracted from a receipt and extract the relevant information.
Return ONLY valid JSON. No markdown. No extra text.

OCR Text from receipt:
{ocr_text}

Extract:
{{
  "merchant": "name of the business/store",
  "total": "total amount as a number (e.g., 42.99)",
  "category": "one of: Office Supplies, Meals & Entertainment, Travel, Equipment, Software, Professional Services, Marketing, Utilities, Insurance, Other",
  "justification": "1-2 sentence explanation of why this category applies"
}}

If the text is unreadable or insufficient, return:
{{"error": "Could not read receipt. Please upload a clearer image."}}
""".strip()

IMAGE_PROMPT = """You are a tax assistant. Analyze the attached receipt image and extract the following.
Return ONLY valid JSON. No markdown. No extra text.

{
  "merchant": "name of the business/store",
  "total": "total amount as a number (e.g., 42.99)",
  "category": "one of: Office Supplies, Meals & Entertainment, Travel, Equipment, Software, Professional Services, Marketing, Utilities, Insurance, Other",
  "justification": "1-2 sentence explanation of why this category applies"
}

If the receipt is unreadable, return:
{"error": "Could not read receipt. Please upload a clearer image."}
""".strip()


def get_image_for_analysis(file: UploadFile, content: bytes) -> tuple[bytes, str]:
    content_type = file.content_type or ""

    if content_type in ALLOWED_IMAGE_TYPES:
        return content, content_type

    if content_type == ALLOWED_PDF_TYPE:
        images = convert_from_bytes(content, first_page=1, last_page=1)
        if not images:
            raise HTTPException(status_code=400, detail="Could not convert PDF to image")
        buffer = io.BytesIO()
        images[0].save(buffer, format="PNG")
        return buffer.getvalue(), "image/png"

    raise HTTPException(
        status_code=400,
        detail="Invalid file type. Upload JPEG, PNG, WebP, or PDF.",
    )


def parse_llm_response(text: str) -> dict:
    text = text.strip()
    if "```" in text:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if match:
            text = match.group(1)
    return json.loads(text)


def extract_text_from_image(image_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(image_bytes))
    text = pytesseract.image_to_string(image, config="--psm 4")
    return text.strip()


def call_openrouter(prompt: str, image_base64: str = None, mime_type: str = None):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not set")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://expense-auditor.local",
        "X-Title": "Smart-Scan Expense Auditor",
    }

    content = [{"type": "text", "text": prompt}]

    if image_base64 and mime_type:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime_type};base64,{image_base64}"
            }
        })

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 1024,
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
        )

    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"API error: {response.text}")

    data = response.json()
    return data["choices"][0]["message"]["content"]


@app.post("/api/analyze")
async def analyze_receipt(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    image_bytes, mime_type = get_image_for_analysis(file, content)

    if DEMO_MODE:
        return {
            "merchant": "Demo Store",
            "total": "42.99",
            "category": "Office Supplies",
            "justification": "Demo mode enabled. No AI call was made.",
        }

    try:
        if USE_OCR_MODE:
            ocr_text = extract_text_from_image(image_bytes)
            if ocr_text and len(ocr_text) >= 10:
                raw = call_openrouter(OCR_PROMPT.format(ocr_text=ocr_text))
            else:
                image_base64 = base64.b64encode(image_bytes).decode()
                raw = call_openrouter(IMAGE_PROMPT, image_base64, mime_type)
        else:
            image_base64 = base64.b64encode(image_bytes).decode()
            raw = call_openrouter(IMAGE_PROMPT, image_base64, mime_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    if not raw:
        raise HTTPException(status_code=500, detail="Empty AI response")

    try:
        result = parse_llm_response(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid AI JSON response")

    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    return {
        "merchant": result.get("merchant", "Unknown"),
        "total": result.get("total", "0"),
        "category": result.get("category", "Other"),
        "justification": result.get("justification", ""),
    }


@app.put("/api/entries/{entry_id}")
async def update_entry(entry_id: str, data: dict):
    return {
        "id": entry_id,
        "merchant": data.get("merchant", ""),
        "total": data.get("total", "0"),
        "category": data.get("category", "Other"),
        "justification": data.get("justification", ""),
        "date": data.get("date", ""),
    }


@app.get("/")
def index():
    return FileResponse(BASE_DIR / "static" / "index.html")


app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static",
)
