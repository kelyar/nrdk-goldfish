const FORMATS = ['standard', 'modern'];
const TOP_N = 15;
const FETCH_DELAY_MS = 400;
const BASE = 'https://www.mtggoldfish.com';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Open a real browser tab, wait for it to load, run an extractor function in
// the page context, then close the tab. Returns the extractor's return value.
function extractFromTab(url, extractorFn) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;

      function onUpdated(updatedTabId, info) {
        if (updatedTabId !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        chrome.scripting.executeScript(
          { target: { tabId }, func: extractorFn, world: 'MAIN' },
          (results) => {
            chrome.tabs.remove(tabId);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(results?.[0]?.result);
            }
          }
        );
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// Runs inside the metagame tab — extracts top archetype hrefs from the live DOM.
function extractArchetypeLinks() {
  const seen = new Set();
  const links = [];
  document.querySelectorAll('a[href*="/archetype/"]').forEach((a) => {
    const href = a.href; // already absolute
    // Strip hash fragment
    const clean = href.split('#')[0];
    if (!seen.has(clean)) {
      seen.add(clean);
      links.push(clean);
    }
  });
  return links;
}

// Runs inside an archetype tab (MAIN world).
// Primary: parse the Card Kingdom builder link — its `c=` param contains the full
// deck list in "4 Card Name\r\n" format and is server-rendered (no fetch needed).
// Fallback: scrape card name links from the deck table.
function extractCardsFromArchetypePage() {
  // Primary: Card Kingdom builder link
  const ckLink = document.querySelector('a[href*="cardkingdom.com/builder"]');
  if (ckLink) {
    try {
      const deckText = new URL(ckLink.href).searchParams.get('c');
      if (deckText) {
        const cards = [];
        for (const line of deckText.split(/\r?\n/)) {
          const m = line.trim().match(/^\d+\s+(.+)$/);
          if (m) cards.push(m[1].trim());
        }
        if (cards.length > 0) return cards;
      }
    } catch (_) { /* fall through */ }
  }

  // Fallback: deck table DOM
  const cards = [];
  document.querySelectorAll('td.deck-col-card a').forEach((a) => {
    const n = a.textContent.trim();
    if (n) cards.push(n);
  });
  return cards;
}

function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may be closed — ignore
  });
}

async function updateDatabase() {
  const allCards = new Set();
  const allArchetypeUrls = [];

  notifyPopup({ action: 'progress', status: 'Opening metagame pages…', current: 0, total: 0 });

  for (const format of FORMATS) {
    const metagameUrl = `${BASE}/metagame/${format}`;
    console.log(`[nerdik-goldfish] Opening tab: ${metagameUrl}`);
    notifyPopup({ action: 'progress', status: `Loading ${format} metagame…`, current: 0, total: 0 });

    const links = await extractFromTab(metagameUrl, extractArchetypeLinks);
    const top = (links || []).slice(0, TOP_N);
    console.log(`[nerdik-goldfish] ${format}: ${top.length} decks`, top);
    allArchetypeUrls.push(...top);
  }

  const total = allArchetypeUrls.length;
  notifyPopup({ action: 'progress', status: `Fetching ${total} deck lists…`, current: 0, total });

  for (let i = 0; i < allArchetypeUrls.length; i++) {
    const archetypeUrl = allArchetypeUrls[i];
    notifyPopup({
      action: 'progress',
      status: `Fetching deck ${i + 1} of ${total}…`,
      current: i + 1,
      total,
    });

    try {
      const cards = await extractFromTab(archetypeUrl, extractCardsFromArchetypePage);
      console.log(`[nerdik-goldfish] deck ${i + 1}: ${(cards || []).length} cards from ${archetypeUrl}`);
      for (const card of (cards || [])) {
        allCards.add(card.toLowerCase());
      }
    } catch (err) {
      console.error(`[nerdik-goldfish] Error processing ${archetypeUrl}:`, err);
    }

    await delay(FETCH_DELAY_MS);
  }

  const cardsArray = Array.from(allCards);
  await chrome.storage.local.set({ cards: cardsArray, updatedAt: Date.now() });

  notifyPopup({
    action: 'done',
    status: `Done! ${cardsArray.length} unique cards saved.`,
    count: cardsArray.length,
    updatedAt: Date.now(),
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'updateDatabase') {
    updateDatabase().catch((err) => {
      console.error('[nerdik-goldfish] updateDatabase failed:', err);
      notifyPopup({ action: 'error', status: `Error: ${err.message}` });
    });
    sendResponse({ started: true });
  }
  return false;
});
