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

4. **Add your Gemini API key** (free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)):
   ```bash
   cp .env.example .env
   # Edit .env: GEMINI_API_KEY=your-key-here
   ```

## Run

```bash
uvicorn main:app --reload
```

Open http://127.0.0.1:8000
