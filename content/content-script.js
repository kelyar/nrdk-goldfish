// Cyrillic word prefix like "Карта " that nerdik.club prepends to card names
const CYRILLIC_PREFIX_RE = /^[\u0400-\u04FF\s]+\s/;

let cardSet = new Set();

async function loadCards() {
  const data = await chrome.storage.local.get('cards');
  if (data.cards && data.cards.length > 0) {
    cardSet = new Set(data.cards); // already lowercased when stored
  }
}

function extractCardName(rawText) {
  return rawText.replace(CYRILLIC_PREFIX_RE, '').trim().toLowerCase();
}

function processCards() {
  if (cardSet.size === 0) return;

  const links = document.querySelectorAll('.catalogCard-title a:not([data-ng-processed])');
  for (const link of links) {
    link.setAttribute('data-ng-processed', '1');
    const name = extractCardName(link.textContent);
    if (name && cardSet.has(name)) {
      link.closest('.catalogCard-title').classList.add('ng-highlight');
    }
  }
}

// Re-run when new cards are injected into the page (pagination, lazy load)
const observer = new MutationObserver(() => {
  processCards();
});

(async () => {
  await loadCards();
  processCards();
  observer.observe(document.body, { childList: true, subtree: true });
})();
