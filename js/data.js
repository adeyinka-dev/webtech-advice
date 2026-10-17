// API reference: https://api.adviceslip.com/
export const ADVICE_API = "https://api.adviceslip.com";
export const LANGUAGES = ["fr", "es", "de", "it", "pt"];

export function topicError(value) {
  const length = value.trim().length;
  if (length < 2) return "Enter a topic with at least 2 characters.";
  if (length > 40) return "Keep your topic to 40 characters or fewer.";
  return "";
}

export function normaliseAdvice(slip) {
  if (!slip || typeof slip.advice !== "string" || !slip.advice.trim()) {
    throw new Error("The advice service returned an unreadable result. Please try again.");
  }
  return { id: String(slip.id ?? slip.slip_id ?? ""), advice: slip.advice.trim() };
}

export function readSearch(data) {
  if (Array.isArray(data?.slips)) {
    // A broken item should not hide the other valid search results.
    const valid = data.slips.filter(slip => typeof slip?.advice === "string" && slip.advice.trim());
    return [...new Map(valid.map(slip => {
      const item = normaliseAdvice(slip);
      return [item.advice, item];
    })).values()];
  }
  if (data?.message?.type === "notice") return [];
  throw new Error("The advice service could not complete this search. Please try again.");
}

export function filterAdvice(slips, shortOnly) {
  return shortOnly ? slips.filter(slip => [...slip.advice].length <= 100) : slips;
}

// MyMemory GET parameters: https://mymemory.translated.net/doc/spec.php
export function translationURL(text, language) {
  if (!LANGUAGES.includes(language)) throw new Error("Choose a supported language.");
  if (new TextEncoder().encode(text).length > 500) {
    throw new Error("This advice is too long to translate. Try a shorter piece.");
  }
  const params = new URLSearchParams({ q: text, langpair: `en|${language}` });
  return `https://api.mymemory.translated.net/get?${params}`;
}

export function readTranslation(data) {
  if (data?.quotaFinished) throw new Error("The translation service has reached its daily limit. Please try again later.");
  const text = data?.responseData?.translatedText;
  if (Number(data?.responseStatus) !== 200 || typeof text !== "string" || !text.trim()) {
    throw new Error("Translation is unavailable. Your English advice is still here.");
  }
  return text.trim();
}

export function readSaved(raw) {
  const entries = JSON.parse(raw ?? "[]");
  if (!Array.isArray(entries)) throw new Error("Invalid saved collection");
  return entries.filter(item => typeof item?.advice === "string" && item.advice.trim())
    .slice(0, 100).map(item => ({
      ...normaliseAdvice(item),
      note: typeof item.note === "string" ? item.note.slice(0, 240) : "",
    }));
}

export function collectionText(entries) {
  return entries.map(item => `${item.advice}${item.note ? `\nMy note: ${item.note}` : ""}\nSource: Advice Slip`).join("\n\n");
}

export async function requestJSON(url, { fetcher = fetch, timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("The service is unavailable. Please try again shortly.");
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The request took too long. Please try again.");
    if (error instanceof TypeError) throw new Error("Could not connect. Check your internet connection and try again.");
    if (error instanceof SyntaxError) throw new Error("The service returned an unreadable response. Please try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
