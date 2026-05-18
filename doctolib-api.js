(function exposeDoctolibApi(globalScope) {
  const DEFAULT_TIMEOUT_MS = 8000;
  const DOCTOR_SEARCH_CACHE_TTL_MS = 90 * 1000;
  const doctorSearchCache = createTtlCache({
    limit: 12,
    ttlMs: DOCTOR_SEARCH_CACHE_TTL_MS
  });

  async function timedFetch(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const timeoutController = new AbortController();
    const timeout = globalScope.setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = anySignal([timeoutController.signal, options.signal].filter(Boolean));

    try {
      const { signal: _signal, timeoutMs: _timeoutMs, ...fetchOptions } = options;
      return await fetch(url, {
        ...fetchOptions,
        signal
      });
    } finally {
      globalScope.clearTimeout(timeout);
    }
  }

  function anySignal(signals) {
    const controller = new AbortController();

    signals.forEach((signal) => {
      if (signal.aborted) {
        controller.abort();
        return;
      }

      signal.addEventListener("abort", () => controller.abort(), { once: true });
    });

    return controller.signal;
  }

  async function fetchJson(url, options = {}) {
    const response = await timedFetch(url, {
      ...options,
      headers: {
        "Accept": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function appointments() {
    return fetchJson("https://www.doctolib.fr/account/appointments.json?page=0", {
      credentials: "include"
    });
  }

  function masterPatients() {
    return fetchJson("https://www.doctolib.fr/account/master_patients.json", {
      credentials: "include"
    });
  }

  async function csrfToken() {
    const response = await timedFetch("https://www.doctolib.fr/account/appointments", {
      credentials: "include",
      headers: {
        "Accept": "text/html"
      }
    });
    if (!response.ok) return "";

    const html = await response.text();
    return html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']csrf-token["']/i)?.[1] ||
      "";
  }

  async function cancelAppointment(id) {
    const token = await csrfToken();
    const response = await timedFetch(
      `https://www.doctolib.fr/account/appointments/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json; charset=utf-8",
          ...(token ? { "X-CSRF-Token": token } : {})
        },
        body: JSON.stringify({ reason: "cancelled_after_booking" })
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  }

  function availabilities({ agendaId, practiceId, signal, startDateTime, visitMotiveId }) {
    const url = new URL("https://www.doctolib.fr/search/availabilities.json");
    url.searchParams.set("telehealth", "false");
    url.searchParams.set("limit", "5");
    url.searchParams.set("start_date_time", startDateTime || new Date().toISOString());
    url.searchParams.set("visit_motive_id", String(visitMotiveId));
    url.searchParams.set("agenda_ids", String(agendaId));
    url.searchParams.set("practice_ids", String(practiceId));

    return fetchJson(url, {
      credentials: "include",
      signal
    });
  }

  async function doctorSearch({ keyword, location, signal }) {
    const cleanKeyword = String(keyword || "").trim();
    const queries = doctorSearchQueries(cleanKeyword);
    const cacheKey = queries.join("\n");
    const cached = doctorSearchCache.get(cacheKey);
    if (cached) return clonePayload(cached);

    const payload = await doctorSearchbarAutocomplete(queries, signal);
    doctorSearchCache.set(cacheKey, payload);
    return clonePayload(payload);
  }

  function createTtlCache({ limit, ttlMs }) {
    const store = new Map();

    return {
      get(key) {
        const entry = store.get(key);
        if (!entry) return null;
        if (Date.now() - entry.time > ttlMs) {
          store.delete(key);
          return null;
        }

        store.delete(key);
        store.set(key, entry);
        return entry.value;
      },
      set(key, value) {
        store.set(key, {
          time: Date.now(),
          value: clonePayload(value)
        });

        while (store.size > limit) {
          store.delete(store.keys().next().value);
        }
      }
    };
  }

  function doctorSearchQueries(keyword) {
    const cleanKeyword = String(keyword || "").trim();
    const withoutTitle = cleanKeyword.replace(/^d(?:r|octeur)\.?\s+/i, "").trim();
    const queries = [
      cleanKeyword,
      withoutTitle,
      `dr ${withoutTitle}`,
      `docteur ${withoutTitle}`,
      titleCaseSearch(withoutTitle),
      `Dr ${titleCaseSearch(withoutTitle)}`
    ];

    return Array.from(new Set(queries.filter(Boolean)));
  }

  function titleCaseSearch(value) {
    return String(value || "")
      .toLocaleLowerCase("fr-FR")
      .replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) => (
        `${separator}${letter.toLocaleUpperCase("fr-FR")}`
      ));
  }

  async function doctorSearchbarAutocomplete(queries, signal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    return searchbarAutocompleteFromDoctolibTab(queries);
  }

  async function searchbarAutocompleteFromDoctolibTab(queries) {
    if (!globalScope.chrome?.tabs?.query) throw new Error("Onglet Doctolib introuvable");

    const tabs = await globalScope.chrome.tabs.query({
      url: "https://www.doctolib.fr/*"
    });
    let tab = preferredDoctolibTab(tabs);
    let shouldCloseTab = false;

    if (!tab?.id) {
      tab = await createTemporaryDoctolibTab();
      shouldCloseTab = true;
    }

    try {
      const payload = await searchbarAutocompleteInPageWorld(tab.id, queries);
      payload.__superDoctolibDebug = {
        ...(payload.__superDoctolibDebug || {}),
        keys: Object.keys(payload || {}),
        profileCount: Array.isArray(payload?.profiles) ? payload.profiles.length : 0,
        source: shouldCloseTab ? "temporary-page-main-world" : "page-main-world",
        tabId: tab.id
      };
      return payload;
    } finally {
      if (shouldCloseTab) closeTemporaryTab(tab.id);
    }
  }

  async function searchbarAutocompleteInPageWorld(tabId, queries) {
    if (!globalScope.chrome?.scripting?.executeScript) throw new Error("Permission scripting absente");

    const [result] = await globalScope.chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [queries],
      func: async (searches) => {
        let lastPayload = { profiles: [] };
        const attempts = [];
        const csrfToken = document.querySelector("meta[name='csrf-token']")?.content || "";

        for (const search of searches) {
          const url = new URL("/api/searchbar/autocomplete.json", window.location.origin);
          url.searchParams.set("search", search);
          const response = await fetch(url, {
            credentials: "include",
            headers: {
              "Accept": "application/json",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {})
            }
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const payload = await response.json();
          const profileCount = Array.isArray(payload?.profiles) ? payload.profiles.length : 0;
          const profileSamples = Array.isArray(payload?.profiles)
            ? payload.profiles.slice(0, 3).map((profile) => profile.name_with_title || profile.name || profile.label || "")
            : [];
          const specialitySamples = Array.isArray(payload?.specialities)
            ? payload.specialities.slice(0, 3).map((speciality) => speciality.label || speciality.name || speciality.text || "")
            : [];
          const organizationSamples = Array.isArray(payload?.organization_statuses)
            ? payload.organization_statuses.slice(0, 3).map((organization) => organization.label || organization.name || organization.name_with_title || "")
            : [];
          attempts.push({
            keys: Object.keys(payload || {}),
            organizationSamples,
            profileCount,
            profileSamples,
            query: search,
            specialitySamples
          });
          payload.__superDoctolibDebug = {
            attempts,
            attemptedQueries: searches,
            matchedQuery: search
          };
          if (profileCount > 0) return payload;
          lastPayload = payload;
        }

        return lastPayload;
      }
    });

    return result?.result || null;
  }

  function preferredDoctolibTab(tabs) {
    const usableTabs = tabs.filter((tab) => Number.isInteger(tab.id));
    return usableTabs.find((tab) => tab.active) ||
      usableTabs.find((tab) => !tab.discarded) ||
      usableTabs[0] ||
      null;
  }

  async function createTemporaryDoctolibTab() {
    if (!globalScope.chrome?.tabs?.create) throw new Error("Création d'onglet indisponible");

    const tab = await globalScope.chrome.tabs.create({
      active: false,
      url: "https://www.doctolib.fr/"
    });
    if (!tab?.id) throw new Error("Onglet Doctolib temporaire impossible");

    await waitForTabReady(tab.id);
    return tab;
  }

  function waitForTabReady(tabId) {
    return new Promise((resolve, reject) => {
      if (!globalScope.chrome?.tabs?.onUpdated) {
        resolve();
        return;
      }

      const timeout = globalScope.setTimeout(() => {
        cleanup();
        reject(new Error("Chargement Doctolib trop long"));
      }, 8000);

      function cleanup() {
        globalScope.clearTimeout(timeout);
        globalScope.chrome.tabs.onUpdated.removeListener(listener);
      }

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        cleanup();
        resolve();
      }

      globalScope.chrome.tabs.onUpdated.addListener(listener);
    });
  }

  function closeTemporaryTab(tabId) {
    Promise.resolve(globalScope.chrome?.tabs?.remove?.(tabId)).catch(() => {
      // Un onglet temporaire déjà fermé ne doit pas faire échouer la recherche.
    });
  }

  function clonePayload(payload) {
    return payload ? JSON.parse(JSON.stringify(payload)) : payload;
  }

  async function validateFrenchAddress(address) {
    const url = new URL("https://api-adresse.data.gouv.fr/search/");
    url.searchParams.set("q", address);
    url.searchParams.set("limit", "1");
    url.searchParams.set("autocomplete", "0");

    const payload = await fetchJson(url);
    const feature = payload?.features?.[0];
    return feature
      ? {
        label: feature.properties?.label || address,
        score: Number(feature.properties?.score || 0)
      }
      : null;
  }

  globalScope.SuperDoctolibApi = {
    appointments,
    availabilities,
    cancelAppointment,
    doctorSearch,
    masterPatients,
    timedFetch,
    validateFrenchAddress
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
