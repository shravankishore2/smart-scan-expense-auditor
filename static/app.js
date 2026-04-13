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
    <button class="btn-secondary edit-save-btn" type="button" onclick="addToHistory(${JSON.stringify(data).replace(/"/g, '&quot;')})">Save Entry</button>
  `;
  resultSection.classList.remove("hidden");
}

function openEditModal(item) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.id = "editModal";
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Edit Entry</h3>
      <form id="editForm">
        <div class="form-group">
          <label for="editMerchant">Merchant</label>
          <input type="text" id="editMerchant" value="${escapeHtml(item.merchant)}" required>
        </div>
        <div class="form-group">
          <label for="editTotal">Total ($)</label>
          <input type="number" id="editTotal" step="0.01" value="${escapeHtml(String(item.total))}" required>
        </div>
        <div class="form-group">
          <label for="editCategory">Category</label>
          <select id="editCategory" required>
            <option value="Office Supplies" ${item.category === 'Office Supplies' ? 'selected' : ''}>Office Supplies</option>
            <option value="Meals & Entertainment" ${item.category === 'Meals & Entertainment' ? 'selected' : ''}>Meals & Entertainment</option>
            <option value="Travel" ${item.category === 'Travel' ? 'selected' : ''}>Travel</option>
            <option value="Equipment" ${item.category === 'Equipment' ? 'selected' : ''}>Equipment</option>
            <option value="Software" ${item.category === 'Software' ? 'selected' : ''}>Software</option>
            <option value="Professional Services" ${item.category === 'Professional Services' ? 'selected' : ''}>Professional Services</option>
            <option value="Marketing" ${item.category === 'Marketing' ? 'selected' : ''}>Marketing</option>
            <option value="Utilities" ${item.category === 'Utilities' ? 'selected' : ''}>Utilities</option>
            <option value="Insurance" ${item.category === 'Insurance' ? 'selected' : ''}>Insurance</option>
            <option value="Other" ${item.category === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label for="editJustification">Justification</label>
          <textarea id="editJustification" rows="2">${escapeHtml(item.justification)}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" onclick="closeEditModal()">Cancel</button>
          <button type="submit" class="btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeEditModal();
  });
  document.getElementById("editForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveEdit(item.id);
  });
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal) modal.remove();
}

function saveEdit(id) {
  const history = getHistory();
  const index = history.findIndex(item => item.id === id);
  if (index !== -1) {
    history[index] = {
      ...history[index],
      merchant: document.getElementById("editMerchant").value,
      total: document.getElementById("editTotal").value,
      category: document.getElementById("editCategory").value,
      justification: document.getElementById("editJustification").value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    renderHistory();
  }
  closeEditModal();
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
        <button class="btn-edit" type="button" onclick='openEditModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'>Edit</button>
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
