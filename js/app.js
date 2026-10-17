import {
  ADVICE_API, topicError, normaliseAdvice, readSearch, filterAdvice,
  translationURL, readTranslation, readSaved, collectionText, requestJSON,
} from "./data.js";

const find = id => document.getElementById(id);
const card = find("advice-card");
const adviceText = find("advice-text");
const status = find("status");
const newButton = find("new-advice");
const searchForm = find("search-form");
const searchInput = find("search-input");
const searchButton = find("search-button");
const resultLimit = find("result-limit");
const shortOnly = find("short-only");
const savedKey = "webtech-saved-advice-v1";
const palettes = [
  ["#dbeaf1", "#1d1a45"], ["#ffe1de", "#702b3c"],
  ["#e4e0fa", "#312b68"], ["#d9f0df", "#204f3a"],
  ["#fff0c9", "#664b20"], ["#f6deeb", "#632c53"],
];
let current = null;
let saved = [];
let searchResults = [];
let searchedTopic = "";
let visibleResults = 5;
let searchBusy = false;
let translationBusy = false;
let cardVersion = 0;
let lastPalette = -1;
const translations = new Map();

find("year").textContent = new Date().getFullYear();

function focusCard() {
  // Focusing the selected content gives keyboard users the same destination.
  card.focus({ preventScroll: true });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "center" });
}

function showAdvice(slip, moveFocus = false) {
  current = normaliseAdvice(slip);
  cardVersion += 1;
  adviceText.textContent = current.advice;
  for (const id of ["copy-advice", "save-advice", "save-button"]) {
    find(id).disabled = false;
  }
  find("translate-button").disabled = translationBusy;
  find("translation").hidden = true;
  find("translation-text").textContent = "";
  find("translation-status").textContent = "";
  find("save-status").textContent = "";
  find("personal-note").value = saved.find(item => item.advice === current.advice)?.note ?? "";
  // Pick a different palette without retrying random values in a loop.
  lastPalette = (lastPalette + 1 + Math.floor(Math.random() * (palettes.length - 1))) % palettes.length;
  card.style.setProperty("--card-bg", palettes[lastPalette][0]);
  card.style.setProperty("--card-fg", palettes[lastPalette][1]);
  if (moveFocus) focusCard();
}

async function getAdvice() {
  if (newButton.disabled) return;
  const version = ++cardVersion;
  newButton.disabled = true;
  card.setAttribute("aria-busy", "true");
  status.textContent = "Finding a little wisdom…";
  try {
    const data = await requestJSON(`${ADVICE_API}/advice?timestamp=${Date.now()}`);
    // A result selected while this request was running takes priority.
    if (version !== cardVersion) return;
    const previous = current?.advice;
    showAdvice(data.slip);
    status.textContent = previous === current.advice
      ? "The service returned the same advice. Give it a moment, then try again."
      : "A fresh perspective, just for you.";
  } catch (error) {
    if (version === cardVersion) status.textContent = error.message;
  } finally {
    newButton.disabled = false;
    card.removeAttribute("aria-busy");
  }
}

function makeButton(text, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}

function renderResults(focusNew = false) {
  const filtered = filterAdvice(searchResults, shortOnly.checked);
  const list = find("result-list");
  const previousCount = list.children.length;
  const items = filtered.slice(0, visibleResults);
  list.replaceChildren();
  for (const slip of items) {
    const li = document.createElement("li");
    const text = document.createElement("p");
    text.textContent = slip.advice;
    li.append(text, makeButton("View", `View advice: ${slip.advice}`, () => {
      showAdvice(slip, true);
      status.textContent = "Here is your selected advice.";
    }));
    list.append(li);
  }
  const total = filtered.length;
  find("results-status").textContent = total
    ? `Showing ${items.length} of ${total} results for “${searchedTopic}”${shortOnly.checked ? " (short advice only)" : ""}.`
    : searchResults.length
      ? "No short advice matches. Untick the short-advice filter to see all results."
      : `No advice found for “${searchedTopic}”. Try another topic, such as life or work.`;
  find("show-more").hidden = items.length >= total;
  if (focusNew) list.children[previousCount]?.querySelector("button").focus();
}

searchInput.addEventListener("input", () => {
  find("search-error").textContent = "";
  searchInput.removeAttribute("aria-invalid");
});
searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (searchBusy) return;
  const error = topicError(searchInput.value);
  find("search-error").textContent = error;
  if (error) {
    searchInput.setAttribute("aria-invalid", "true");
    searchInput.focus();
    return;
  }
  searchInput.removeAttribute("aria-invalid");
  searchedTopic = searchInput.value.trim();
  searchInput.value = searchedTopic;
  searchBusy = true;
  searchButton.disabled = true;
  find("search-results").hidden = false;
  find("search-results").setAttribute("aria-busy", "true");
  find("results-status").textContent = "Searching for advice…";
  find("result-list").replaceChildren();
  find("show-more").hidden = true;
  try {
    const data = await requestJSON(`${ADVICE_API}/advice/search/${encodeURIComponent(searchedTopic)}`);
    searchResults = readSearch(data);
    visibleResults = Number(resultLimit.value);
    renderResults();
  } catch (error) {
    searchResults = [];
    find("results-status").textContent = error.message;
  } finally {
    searchBusy = false;
    searchButton.disabled = false;
    find("search-results").removeAttribute("aria-busy");
  }
});
for (const control of [resultLimit, shortOnly]) {
  control.addEventListener("change", () => {
    visibleResults = Number(resultLimit.value);
    if (searchedTopic && !searchBusy) renderResults();
  });
}
find("show-more").addEventListener("click", () => {
  visibleResults += Number(resultLimit.value);
  renderResults(true);
});

newButton.addEventListener("click", getAdvice);
find("copy-advice").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(current.advice);
    status.textContent = "Copied to clipboard.";
  } catch {
    status.textContent = "Copy is unavailable. Select the advice text and copy it manually.";
  }
});

find("translation-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = find("translate-button");
  if (!current || translationBusy) return;
  const version = cardVersion;
  const language = find("language").value;
  const cacheKey = `${language}:${current.advice}`;
  translationBusy = true;
  button.disabled = true;
  find("translation-status").textContent = "Translating…";
  try {
    const url = translationURL(current.advice, language);
    let text = translations.get(cacheKey);
    if (!text) {
      text = readTranslation(await requestJSON(url));
      // Decode API-escaped entities as text, without inserting API HTML into the page.
      const decoder = document.createElement("textarea");
      decoder.innerHTML = text.replace(/</g, "&lt;");
      text = decoder.value;
      translations.set(cacheKey, text);
    }
    if (version !== cardVersion) return;
    find("translation-text").textContent = text;
    find("translation-text").lang = language;
    find("translation").hidden = false;
    find("translation-status").textContent = "Translation ready, below the original advice.";
  } catch (error) {
    if (version === cardVersion) find("translation-status").textContent = error.message;
  } finally {
    translationBusy = false;
    button.disabled = false;
  }
});

function persistSaved(next) {
  try {
    localStorage.setItem(savedKey, JSON.stringify(next));
    saved = next;
    return true;
  } catch {
    return false;
  }
}

function renderSaved() {
  find("saved-count").textContent = saved.length;
  find("export-saved").disabled = saved.length === 0;
  find("saved-status").textContent = saved.length
    ? `${saved.length} saved ${saved.length === 1 ? "piece" : "pieces"} of advice. Stored in this browser.`
    : "Your saved advice will appear here.";
  const list = find("saved-list");
  list.replaceChildren();
  saved.forEach((item, index) => {
    const li = document.createElement("li");
    const quote = document.createElement("blockquote");
    quote.textContent = item.advice;
    li.append(quote);
    if (item.note) {
      const note = document.createElement("p");
      note.className = "saved-note";
      note.textContent = `My note: ${item.note}`;
      li.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    actions.append(
      makeButton("View / edit note", `View saved advice and edit note: ${item.advice}`, () => {
        showAdvice(item, true);
        status.textContent = "Loaded from your collection. Open Keep this advice to edit your note.";
      }),
      makeButton("Remove", `Remove saved advice: ${item.advice}`, () => {
        if (!persistSaved(saved.filter(entry => entry.advice !== item.advice))) {
          find("saved-status").textContent = "Could not update this browser's storage. Your collection has not changed.";
          return;
        }
        renderSaved();
        find("saved-status").textContent = "Advice removed from your collection.";
        const remaining = find("saved-list").querySelectorAll("button");
        (remaining[Math.min(index * 2, remaining.length - 1)] ?? find("saved-title")).focus();
      }),
    );
    li.append(actions);
    list.append(li);
  });
}

find("saved-title").tabIndex = -1;
find("save-advice").addEventListener("click", () => {
  find("save-panel").open = true;
  find("personal-note").focus();
});
find("save-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!current) return;
  if (!find("save-form").reportValidity()) return;
  const entry = { ...current, note: find("personal-note").value.trim() };
  const exists = saved.some(item => item.advice === current.advice);
  if (!exists && saved.length >= 100) {
    find("save-status").textContent = "Your collection holds up to 100 pieces. Download it or remove an item before adding more.";
    return;
  }
  const next = exists
    ? saved.map(item => item.advice === entry.advice ? entry : item)
    : [...saved, entry];
  if (!persistSaved(next)) {
    find("save-status").textContent = "This browser could not save your advice. Storage may be full or blocked. Copy the advice to keep it.";
    return;
  }
  renderSaved();
  find("save-status").textContent = exists ? "Your note has been updated." : "Saved to your collection.";
});
find("export-saved").addEventListener("click", () => {
  const blob = new Blob([collectionText(saved)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-saved-advice.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Keep open tabs in step when a collection changes on this device.
window.addEventListener("storage", event => {
  if (event.key !== savedKey && event.key !== null) return;
  try {
    saved = readSaved(event.newValue);
    renderSaved();
  } catch {
    find("saved-status").textContent = "The collection changed in another tab but could not be read. Reload before saving more advice.";
  }
});

try {
  saved = readSaved(localStorage.getItem(savedKey));
  renderSaved();
} catch {
  renderSaved();
  find("saved-status").textContent = "Saved advice could not be read. Nothing has been overwritten. You can still browse and copy advice.";
}
getAdvice();
