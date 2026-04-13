# Smart-Scan Expense Auditor

Upload receipt photos or PDFs. AI extracts merchant, total, and tax category with justification. Expense history is stored in your browser.

## Setup

1. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate   # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **PDF support** (optional, for PDF receipts): Install poppler:
   ```bash
   brew install poppler   # macOS
   ```

4. **Add your OpenRouter API key** (get one at [openrouter.ai/keys](https://openrouter.ai/keys)):
   ```bash
   cp .env.example .env
   # Edit .env: OPENROUTER_API_KEY=your-key-here
   ```

5. **OCR Mode** (recommended - uses local OCR first to reduce API tokens):
   - `USE_OCR_MODE=1` (default) - Runs local OCR first, sends extracted text to AI
   - `USE_OCR_MODE=0` - Sends image directly to AI (uses more tokens)

6. **Choose a model** (in `.env`):
   - `OPENROUTER_MODEL=google/gemini-2.0-flash-001` (default, fast & cheap)
   - Other options: `anthropic/claude-3-haiku`, `openai/gpt-4o-mini`

## Run

```bash
uvicorn main:app --reload
```

Open http://127.0.0.1:8000
