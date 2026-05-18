const GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const ROUTE_ENDPOINT = "https://router.project-osrm.org/route/v1/foot";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CACHE_LIMIT = 80;
const FETCH_TIMEOUT_MS = 8000;
const geocodeCache = new Map();
const routeCache = new Map();
const weatherCache = new Map();
const DOCTOR_CONTEXT_MENU_ID = "super-doctolib-search-doctor";

updateBadgeFromStorage();
installContextMenu();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "updateAppointmentBadge") {
    updateAppointmentBadge(message.count);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "estimateWalkingRoute") {
    estimateWalkingRoute(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "weatherForecast") {
    weatherForecast(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "streetViewUrl") {
    streetViewUrl(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.upcomingAppointments) return;

  updateAppointmentBadge(upcomingAppointmentCount(changes.upcomingAppointments.newValue));
});

chrome.contextMenus?.onClicked?.addListener((info) => {
  if (info.menuItemId !== DOCTOR_CONTEXT_MENU_ID) return;

  const doctor = normalizeDoctorSelection(info.selectionText);
  if (!doctor) return;

  const url = new URL("https://www.doctolib.fr/search");
  url.searchParams.set("keyword", doctor);
  url.searchParams.set("location", "paris");
  chrome.tabs.create({ url: url.toString() });
});

function installContextMenu() {
  if (!chrome.contextMenus) return;

  chrome.runtime.onInstalled.addListener(createDoctorContextMenu);
  chrome.runtime.onStartup?.addListener(createDoctorContextMenu);
  createDoctorContextMenu();
}

function createDoctorContextMenu() {
  chrome.contextMenus.remove(DOCTOR_CONTEXT_MENU_ID, () => {
    // Chrome signale une erreur normale si le menu n'existe pas encore.
    void chrome.runtime.lastError;

    chrome.contextMenus.create({
      id: DOCTOR_CONTEXT_MENU_ID,
      title: "Rechercher ce médecin sur Doctolib",
      contexts: ["selection"]
    }, () => {
      // La création peut être appelée par plusieurs hooks du service worker.
      void chrome.runtime.lastError;
    });
  });
}

function normalizeDoctorSelection(value) {
  return String(value || "")
    .replace(/\bdr\.?\s+/i, "")
    .replace(/\bdocteur\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function updateBadgeFromStorage() {
  try {
    const result = await chrome.storage.local.get({ upcomingAppointments: [] });
    updateAppointmentBadge(upcomingAppointmentCount(result.upcomingAppointments));
  } catch {
    updateAppointmentBadge(0);
  }
}

function upcomingAppointmentCount(appointments) {
  if (!Array.isArray(appointments)) return 0;

  return appointments.filter((appointment) => (
    appointment?.is_in_future !== false &&
    appointment?.past !== true &&
    appointment?.canceled !== true &&
    appointment?.deleted !== true
  )).length;
}

function updateAppointmentBadge(count) {
  const safeCount = Math.max(0, Math.min(99, Number(count) || 0));
  chrome.action.setBadgeText({ text: safeCount > 0 ? String(safeCount) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#0079d7" });
}

async function estimateWalkingRoute({ origin, destination }) {
  const cacheKey = cacheKeyFor(origin, destination);
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey);

  const [from, to] = await Promise.all([
    geocode(origin),
    geocode(destination)
  ]);

  const url = new URL(`${ROUTE_ENDPOINT}/${from.lon},${from.lat};${to.lon},${to.lat}`);
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");

  const response = await timedFetch(url);
  if (!response.ok) throw new Error("Route impossible");

  const data = await response.json();
  const distanceMeters = data?.routes?.[0]?.distance;
  if (!distanceMeters) throw new Error("Distance indisponible");

  const result = { ok: true, distanceMeters };
  remember(routeCache, cacheKey, result);
  return result;
}

async function weatherForecast({ destination, appointmentIso }) {
  const targetIso = appointmentIso || new Date().toISOString();
  const cacheKey = cacheKeyFor(destination, targetIso.slice(0, 13));
  if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey);

  const place = await geocode(destination);
  const url = new URL(WEATHER_ENDPOINT);
  url.searchParams.set("latitude", place.lat);
  url.searchParams.set("longitude", place.lon);
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code,wind_speed_10m");
  url.searchParams.set("forecast_days", "16");
  url.searchParams.set("timezone", "auto");

  const response = await timedFetch(url);
  if (!response.ok) throw new Error("Météo indisponible");

  const data = await response.json();
  const index = nearestHourIndex(data.hourly?.time || [], targetIso);
  if (index < 0) throw new Error("Météo hors plage");

  const result = {
    ok: true,
    temperature: Math.round(data.hourly.temperature_2m[index]),
    rainProbability: Math.round(data.hourly.precipitation_probability[index] || 0),
    weatherCode: Number(data.hourly.weather_code[index]),
    windSpeed: Math.round(data.hourly.wind_speed_10m[index])
  };
  remember(weatherCache, cacheKey, result);
  return result;
}

async function streetViewUrl({ destination }) {
  const place = await geocode(destination);
  const url = new URL("https://www.google.com/maps/@");
  url.searchParams.set("api", "1");
  url.searchParams.set("map_action", "pano");
  url.searchParams.set("viewpoint", `${place.lat},${place.lon}`);
  return { ok: true, url: url.toString() };
}

async function geocode(query) {
  const key = cacheKeyFor(query);
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await timedFetch(url, {
    headers: {
      "Accept": "application/json",
      "Accept-Language": "fr"
    }
  });
  if (!response.ok) throw new Error("Adresse introuvable");

  const data = await response.json();
  const match = data?.[0];
  if (!match) throw new Error("Adresse introuvable");

  const place = {
    lat: match.lat,
    lon: match.lon
  };
  remember(geocodeCache, key, place);
  return place;
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKeyFor(...parts) {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .join("::");
}

function remember(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);

  while (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
}

function nearestHourIndex(times, appointmentIso) {
  const target = new Date(appointmentIso).getTime();
  let bestIndex = -1;
  let bestDelta = Infinity;

  times.forEach((time, index) => {
    const delta = Math.abs(new Date(time).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });

  return bestDelta <= 90 * 60 * 1000 ? bestIndex : -1;
}
