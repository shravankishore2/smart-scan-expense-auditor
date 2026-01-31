const STORAGE_KEY = "expenseHistory";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const loading = document.getElementById("loading");
const errorEl = document.getElementById("error");
const resultSection = document.getElementById("resultSection");
const resultCard = document.getElementById("resultCard");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");

function showError(msg) {
  errorEl.innerHTML = `<span class="error-text">${escapeHtml(msg)}</span><button class="error-dismiss" type="button" aria-label="Dismiss">×</button>`;
  errorEl.classList.remove("hidden");
  errorEl.querySelector(".error-dismiss").addEventListener("click", hideError);
  errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
  errorEl.classList.add("hidden");
}

function showLoading() {
  loading.classList.remove("hidden");
  resultSection.classList.add("hidden");
  hideError();
}

function hideLoading() {
  loading.classList.add("hidden");
}

function renderResult(data) {
  resultCard.innerHTML = `
    <div class="result-row">
      <span class="result-label">Merchant</span>
      <span class="result-value">${escapeHtml(data.merchant)}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Total</span>
      <span class="result-value total">$${escapeHtml(String(data.total))}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Tax Category</span>
      <span class="result-value">${escapeHtml(data.category)}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Justification</span>
      <span class="result-value justification">${escapeHtml(data.justification)}</span>
    </div>
  `;
  resultSection.classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addToHistory(data) {
  const history = getHistory();
  const item = {
    id: crypto.randomUUID(),
    merchant: data.merchant,
    total: data.total,
    category: data.category,
    justification: data.justification,
    date: new Date().toISOString(),
  };
  history.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistory();
}

function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = "<li class='history-item' style='color: var(--text-muted); font-size: 0.9rem;'>No expenses yet. Upload a receipt to get started.</li>";
    return;
  }
  historyList.innerHTML = history
    .map(
      (item) => `
      <li class="history-item">
        <div class="history-item-header">
          <span class="history-merchant">${escapeHtml(item.merchant)}</span>
          <span class="history-total">$${escapeHtml(String(item.total))}</span>
        </div>
        <div class="history-meta">
          <span class="category">${escapeHtml(item.category)}</span>
          · ${formatDate(item.date)}
        </div>
      </li>
    `
    )
    .join("");
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function analyzeFile(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  showLoading();
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
      throw new Error(msg || "Analysis failed");
    }
    renderResult(data);
    addToHistory(data);
  } catch (err) {
    showError(err.message || "Something went wrong. Try again.");
  } finally {
    hideLoading();
  }
}

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) analyzeFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) analyzeFile(file);
  fileInput.value = "";
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

renderHistory();
