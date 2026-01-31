
"""Smart-Scan Expense Auditor - FastAPI backend."""

import io
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pdf2image import convert_from_bytes
from dotenv import load_dotenv

from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="Smart-Scan Expense Auditor")

# DEMO MODE (no API calls)
DEMO_MODE = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")

BASE_DIR = Path(__file__).resolve().parent
Path("uploads").mkdir(exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_PDF_TYPE = "application/pdf"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

RECEIPT_PROMPT = """
You are a tax assistant. Analyze the attached receipt image and extract the following.
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

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")

    client = genai.Client(api_key=api_key)

    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type=mime_type,
    )

    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[
                RECEIPT_PROMPT,
                image_part,
            ],
        )
        raw = response.text
    except Exception as e:
        msg = str(e).lower()
        if "quota" in msg or "429" in msg or "resource_exhausted" in msg:
            raise HTTPException(
                status_code=429,
                detail="Gemini quota exceeded. Try again later.",
            )
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


@app.get("/")
def index():
    return FileResponse(BASE_DIR / "static" / "index.html")


app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static",
)
