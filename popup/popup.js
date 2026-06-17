const updateBtn = document.getElementById('update-btn');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const cardCountEl = document.getElementById('card-count');
const updatedAtEl = document.getElementById('updated-at');

function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

async function loadStats() {
  const data = await chrome.storage.local.get(['cards', 'updatedAt']);
  if (data.cards && data.cards.length > 0) {
    cardCountEl.textContent = data.cards.length;
    updatedAtEl.textContent = formatDate(data.updatedAt);
    statsEl.classList.remove('hidden');
  }
}

function setRunning(running) {
  updateBtn.disabled = running;
  updateBtn.textContent = running ? 'Updating…' : 'Update Database';
}

updateBtn.addEventListener('click', () => {
  setRunning(true);
  statusEl.textContent = 'Starting…';
  chrome.runtime.sendMessage({ action: 'updateDatabase' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    statusEl.textContent = message.status;
  } else if (message.action === 'done') {
    statusEl.textContent = message.status;
    cardCountEl.textContent = message.count;
    updatedAtEl.textContent = formatDate(message.updatedAt);
    statsEl.classList.remove('hidden');
    setRunning(false);
  } else if (message.action === 'error') {
    statusEl.textContent = message.status;
    setRunning(false);
  }
});

loadStats();
