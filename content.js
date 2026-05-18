const DEFAULT_SETTINGS = {
  originAddress: "11 avenue de Ségur 75007 PARIS",
  travelMode: "walking",
  walkingSpeedKmh: 4.5,
  safetyMarginMinutes: 10,
  debugEnabled: false
};

let settings = { ...DEFAULT_SETTINGS };

const MAP_BUTTON_TEXT = /ouvrir la carte|trajet depuis (s[ée]gur|départ|depart)/i;
const FACILITY_DETAILS_TEXT = /détails de l['’]établissement de santé/i;
const APPOINTMENTS_API_URL = "/account/appointments.json?page=0";
const storage = typeof chrome === "undefined" ? undefined : chrome.storage?.sync;
const localStorageArea = typeof chrome === "undefined" ? undefined : chrome.storage?.local;
const patchedButtons = new WeakMap();
let scanTimer = 0;
let appointmentsFetchTimer = 0;
let lastAppointmentsJson = "";
let appointmentDetailsCache = { id: "", promise: null };
let requestedAppointmentActionDone = "";
const APPOINTMENT_CACHE_SCHEMA = 2;
const PENDING_APPOINTMENT_ACTION_KEY = "pendingAppointmentAction";
const PENDING_APPOINTMENT_ACTION_MAX_AGE_MS = 2 * 60 * 1000;
let pendingAppointmentAction = undefined;
let pendingAppointmentActionPromise = null;

if (typeof chrome !== "undefined") {
  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type !== "doctorAutocomplete") return false;

    doctorAutocomplete(message.search)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
}

async function doctorAutocomplete(search) {
  const url = new URL("/api/searchbar/autocomplete.json", window.location.origin);
  url.searchParams.set("search", String(search || ""));

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function weatherRequestIso(appointmentIso) {
  return appointmentIso || new Date().toISOString();
}

function directionsUrl(destination) {
  return googleMapsUrl(destination);
}

function googleMapsUrl(destination) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", settings.originAddress);
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", settings.travelMode);
  return url.toString();
}

function embeddedMapUrl(destination) {
  const url = new URL("https://maps.google.com/maps");
  url.searchParams.set("saddr", settings.originAddress);
  url.searchParams.set("daddr", destination);
  url.searchParams.set("dirflg", directionFlag());
  url.searchParams.set("output", "embed");
  return url.toString();
}

function directionFlag() {
  return {
    bicycling: "b",
    driving: "d",
    transit: "r",
    walking: "w"
  }[settings.travelMode] || "w";
}

function ensureEmbeddedMap(button, destination, url) {
  const container = button.parentElement;
  if (!container) return null;

  const existing = container.querySelector(".segur-map-preview");
  if (existing) return existing;

  const link = document.createElement("a");
  link.className = "segur-map-preview";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", "Ouvrir le trajet dans Google Maps");

  const frame = document.createElement("iframe");
  frame.className = "segur-map-preview-frame";
  frame.src = embeddedMapUrl(destination);
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer-when-downgrade";
  frame.title = `Trajet vers ${destination}`;

  const hint = document.createElement("span");
  hint.className = "segur-map-preview-hint";
  hint.textContent = "Ouvrir dans Google Maps";

  const meta = document.createElement("span");
  meta.className = "segur-map-preview-meta";
  meta.textContent = modeLabel();

  link.append(frame, meta, hint);
  button.insertAdjacentElement("afterend", link);
  return link;
}

function ensureAssistPanel(mapLink, destination, appointmentIso) {
  if (!mapLink) return;

  const panel = document.createElement("div");
  panel.className = "segur-assist-panel";

  const route = document.createElement("div");
  route.className = "segur-assist-pill";
  route.textContent = routeDefaultText();

  const weather = document.createElement("div");
  weather.className = "segur-assist-pill segur-weather-pill";
  renderWeatherLoading(weather);

  const departure = document.createElement("div");
  departure.className = "segur-assist-pill segur-departure-pill";
  departure.textContent = departureDefaultText(appointmentIso);

  const copyButton = actionButton("Copier l'adresse");
  copyButton.addEventListener("click", () => copyAddress(copyButton, destination));

  const entranceLink = document.createElement("a");
  entranceLink.className = "segur-assist-action";
  entranceLink.href = entranceUrl(destination);
  entranceLink.target = "_blank";
  entranceLink.rel = "noopener noreferrer";
  entranceLink.textContent = "Voir l'entrée";

  const calendarLink = calendarAction(destination, appointmentIso);

  panel.append(route, departure, weather, copyButton, entranceLink, calendarLink);
  mapLink.insertAdjacentElement("afterend", panel);

  updateWalkingEstimate(route, departure, destination, appointmentIso);
  updateWeather(weather, destination, appointmentIso);
  updateEntranceLink(entranceLink, destination);
}

function modeLabel() {
  return {
    bicycling: "Trajet vélo",
    driving: "Trajet voiture",
    transit: "Trajet transports",
    walking: "Trajet à pied"
  }[settings.travelMode] || "Trajet";
}

function routeDefaultText() {
  if (settings.travelMode === "walking") {
    return `À pied · estimation ${settings.walkingSpeedKmh} km/h`;
  }
  return modeLabel();
}

function departureDefaultText(appointmentIso) {
  const appointment = new Date(appointmentIso);
  if (Number.isNaN(appointment.getTime())) return "Heure du RDV non détectée";
  return `RDV ${formatTime(appointment)} · marge ${settings.safetyMarginMinutes} min`;
}

async function updateWalkingEstimate(routeTarget, departureTarget, destination, appointmentIso) {
  if (
    settings.travelMode !== "walking" ||
    typeof chrome === "undefined" ||
    !chrome.runtime?.sendMessage
  ) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "estimateWalkingRoute",
      origin: settings.originAddress,
      destination
    });
    if (!routeTarget.isConnected || !response?.ok) return;

    const km = response.distanceMeters / 1000;
    const minutes = Math.max(1, Math.round((km / settings.walkingSpeedKmh) * 60));
    routeTarget.textContent = `À pied · ${formatDistance(km)} · env. ${minutes} min à ${settings.walkingSpeedKmh} km/h`;
    renderDepartureAdvice(departureTarget, appointmentIso, minutes);
  } catch {
    if (!routeTarget.isConnected) return;
    routeTarget.textContent = routeDefaultText();
  }
}

function renderDepartureAdvice(target, appointmentIso, routeMinutes) {
  if (!target.isConnected) return;

  const appointment = new Date(appointmentIso);
  if (Number.isNaN(appointment.getTime())) return;

  const leaveAt = new Date(
    appointment.getTime() - (routeMinutes + settings.safetyMarginMinutes) * 60 * 1000
  );
  target.textContent = `Partir vers ${formatTime(leaveAt)} · marge ${settings.safetyMarginMinutes} min`;
}

async function updateWeather(target, destination, appointmentIso) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "weatherForecast",
      destination,
      appointmentIso: weatherRequestIso(appointmentIso)
    });
    if (!response?.ok) {
      if (!target.isConnected) return;
      renderWeatherUnavailable(target);
      return;
    }

    if (!target.isConnected) return;
    renderWeather(target, response, Boolean(appointmentIso));
  } catch {
    if (!target.isConnected) return;
    renderWeatherUnavailable(target);
  }
}

function renderWeatherLoading(target) {
  target.replaceChildren(weatherGlyph("cloud"), textBlock("Météo", "Chargement"));
}

function renderWeatherUnavailable(target) {
  target.dataset.weather = "unknown";
  target.replaceChildren(weatherGlyph("cloud"), textBlock("Météo", "Indisponible"));
}

function renderWeather(target, weather, isAppointmentWeather) {
  const kind = weatherKind(weather.weatherCode);
  target.dataset.weather = kind;
  target.replaceChildren(
    weatherGlyph(kind),
    textBlock(
      `${isAppointmentWeather ? "RDV" : "Actuelle"} · ${weather.temperature}°C`,
      `Pluie ${weather.rainProbability}% · vent ${weather.windSpeed} km/h`
    )
  );
}

function textBlock(title, detail) {
  const block = document.createElement("span");
  block.className = "segur-weather-text";

  const titleNode = document.createElement("span");
  titleNode.className = "segur-weather-title";
  titleNode.textContent = title;

  const detailNode = document.createElement("span");
  detailNode.className = "segur-weather-detail";
  detailNode.textContent = detail;

  block.append(titleNode, detailNode);
  return block;
}

function weatherKind(code) {
  if ([0, 1].includes(code)) return "sun";
  if ([2, 3].includes(code)) return "cloud";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloud";
}

function weatherGlyph(kind) {
  const span = document.createElement("span");
  span.className = `segur-weather-icon segur-weather-icon-${kind}`;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = weatherSvg(kind);
  return span;
}

function weatherSvg(kind) {
  const icons = {
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7.2 18.2h9.6a4.2 4.2 0 0 0 .5-8.4A6.1 6.1 0 0 0 5.7 11.6a3.4 3.4 0 0 0 1.5 6.6Z"/></svg>',
    fog: '<svg viewBox="0 0 24 24"><path d="M7.2 15.2h9.6a3.7 3.7 0 0 0 .5-7.4A5.6 5.6 0 0 0 6.6 9.5a3 3 0 0 0 .6 5.7Z"/><path d="M5 18.5h14M7 21h10"/></svg>',
    rain: '<svg viewBox="0 0 24 24"><path d="M7.2 14.8h9.6a3.7 3.7 0 0 0 .5-7.4A5.6 5.6 0 0 0 6.6 9.1a3 3 0 0 0 .6 5.7Z"/><path d="M8.2 18.2 7 21M12.4 18.2 11.2 21M16.6 18.2 15.4 21"/></svg>',
    snow: '<svg viewBox="0 0 24 24"><path d="M7.2 14.8h9.6a3.7 3.7 0 0 0 .5-7.4A5.6 5.6 0 0 0 6.6 9.1a3 3 0 0 0 .6 5.7Z"/><path d="M8 19h.1M12 21h.1M16 19h.1"/></svg>',
    storm: '<svg viewBox="0 0 24 24"><path d="M7.2 14.8h9.6a3.7 3.7 0 0 0 .5-7.4A5.6 5.6 0 0 0 6.6 9.1a3 3 0 0 0 .6 5.7Z"/><path d="m13 16-2 3h2l-1 3 3.2-4h-2.1l1.2-2Z"/></svg>'
  };
  return icons[kind] || icons.cloud;
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function formatTime(date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function actionButton(label) {
  const button = document.createElement("button");
  button.className = "segur-assist-action";
  button.type = "button";
  button.textContent = label;
  return button;
}

async function copyAddress(button, destination) {
  try {
    await navigator.clipboard.writeText(destination);
    button.textContent = "Adresse copiée";
  } catch {
    button.textContent = destination;
  }

  window.setTimeout(() => {
    if (button.isConnected) button.textContent = "Copier l'adresse";
  }, 1800);
}

function calendarUrl(destination, appointmentIso) {
  const start = new Date(appointmentIso);
  if (Number.isNaN(start.getTime())) return "";

  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", "Rendez-vous médical");
  url.searchParams.set("ctz", "Europe/Paris");
  url.searchParams.set("dates", `${calendarDateParis(start)}/${calendarDateParis(end)}`);
  url.searchParams.set("location", destination);
  url.searchParams.set(
    "details",
    `Adresse: ${destination}\nDépart: ${settings.originAddress}\nCarte: ${directionsUrl(destination)}`
  );
  return url.toString();
}

function calendarAction(destination, appointmentIso) {
  const url = calendarUrl(destination, appointmentIso);

  if (!url) {
    const disabled = actionButton("Calendrier indispo");
    disabled.disabled = true;
    disabled.title = "Date et heure du RDV non détectées sur Doctolib";
    return disabled;
  }

  const link = document.createElement("a");
  link.className = "segur-assist-action";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Ajouter au calendrier";
  return link;
}

function entranceUrl(destination) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", destination);
  return url.toString();
}

async function updateEntranceLink(link, destination) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "streetViewUrl",
      destination
    });

    if (!link.isConnected || !response?.ok) return;
    link.href = response.url;
    link.textContent = "Street View";
  } catch {
    if (link.isConnected) link.href = entranceUrl(destination);
  }
}

function calendarDateParis(date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${values.month}${values.day}T${values.hour}${values.minute}${values.second}`;
}

function updateButtonLabel(button) {
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    if (MAP_BUTTON_TEXT.test(current.nodeValue || "")) {
      current.nodeValue = current.nodeValue.replace(
        MAP_BUTTON_TEXT,
        "Trajet depuis départ"
      );
      return;
    }

    current = walker.nextNode();
  }

  button.setAttribute("aria-label", "Trajet depuis départ");
  button.setAttribute("title", "Trajet depuis départ");
}

async function loadAppointmentDetails() {
  const id = currentAppointmentId();
  if (!id) return null;

  if (appointmentDetailsCache.id !== id) {
    appointmentDetailsCache = { id, promise: null };
  }

  if (!appointmentDetailsCache.promise) {
    appointmentDetailsCache.promise = fetchAppointmentDetails(id);
  }

  return appointmentDetailsCache.promise;
}

async function fetchAppointmentDetails(id) {
  try {
    const response = await fetch(`/appointments/${encodeURIComponent(id)}`, {
      credentials: "include",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function currentAppointmentId() {
  const match = window.location.pathname.match(
    /\/(?:account\/appointments\/details|appointments)\/([^/?#]+)/
  );
  return match ? decodeURIComponent(match[1]) : "";
}

function appointmentDestination(details) {
  return normalizeText(
    details?.practice?.full_address ||
    [details?.practice?.address, [details?.practice?.zipcode, details?.practice?.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ")
  );
}

async function patchMapButton(button) {
  if (patchedButtons.has(button) || button.dataset.segurDirections === "ready") return;

  const controller = new AbortController();
  patchedButtons.set(button, controller);
  button.dataset.segurDirections = "loading";

  const appointment = await loadAppointmentDetails();
  if (controller.signal.aborted || !button.isConnected) return;

  const destination = appointmentDestination(appointment);
  const appointmentIso = appointment?.start_date || "";
  if (!destination) {
    patchedButtons.delete(button);
    delete button.dataset.segurDirections;
    return;
  }

  const url = directionsUrl(destination);
  button.dataset.segurDirections = "ready";
  button.dataset.segurDestination = destination;
  button.classList.add("segur-directions-link");
  updateButtonLabel(button);
  const mapPreview = ensureEmbeddedMap(button, destination, url);
  button.classList.add("segur-hidden-map-button");
  button.setAttribute("aria-hidden", "true");
  button.setAttribute("tabindex", "-1");
  ensureAssistPanel(mapPreview, destination, appointmentIso);

  if (button.tagName === "A") {
    button.href = url;
    button.target = "_blank";
    button.rel = "noopener noreferrer";
  }

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.open(url, "_blank", "noopener,noreferrer");
    },
    { capture: true, signal: controller.signal }
  );
}

function moveFacilityDetailsCard(root = document) {
  const appointmentCard = findAppointmentDetailsCard(root);
  const facilityCard = findFacilityDetailsCard(appointmentCard);

  if (!appointmentCard || !facilityCard) return;
  if (facilityCard.previousElementSibling === appointmentCard) return;

  appointmentCard.insertAdjacentElement("afterend", facilityCard);
  facilityCard.dataset.segurMovedFacilityDetails = "ready";
  facilityCard.classList.add("segur-moved-facility-card");
}

function findAppointmentDetailsCard(root = document) {
  if (root.matches?.(".main-card-appointment-details")) return root;

  const classMatch = document.querySelector(".main-card-appointment-details");
  if (classMatch) return classMatch;

  return Array.from(document.querySelectorAll(".dl-card"))
    .filter((card) => {
      const text = card.textContent || "";
      return (
        /déplacer le rdv/i.test(text) &&
        /annuler le rdv/i.test(text) &&
        (/radiologue|cone beam|informations du rendez-vous|rdv/i.test(text))
      );
    })
    .sort((a, b) => (b.textContent || "").length - (a.textContent || "").length)[0];
}

function storeUpcomingAppointments() {
  if (!localStorageArea) return;

  scheduleAppointmentsApiRefresh();
}

function scheduleAppointmentsApiRefresh() {
  if (appointmentsFetchTimer) return;

  appointmentsFetchTimer = window.setTimeout(() => {
    appointmentsFetchTimer = 0;
    refreshAppointmentsFromApi();
  }, 500);
}

async function refreshAppointmentsFromApi() {
  if (!localStorageArea) return;

  try {
    const response = await fetch(APPOINTMENTS_API_URL, {
      credentials: "include",
      headers: {
        "Accept": "application/json"
      }
    });
    if (!response.ok && response.status !== 304) return;

    const payload = await response.json();
    const appointments = normalizeAppointmentsPayload(payload);
    rememberUpcomingAppointments(appointments);
  } catch {
    // La liste popup reste volontairement alignée sur l'API Doctolib.
  }
}

function normalizeAppointmentsPayload(payload) {
  return (payload?.data?.confirmed || [])
    .filter((appointment) => (
      appointment?.is_in_future === true &&
      appointment?.past !== true &&
      appointment?.canceled !== true &&
      appointment?.deleted !== true
    ))
    .map((appointment) => ({
      schemaVersion: APPOINTMENT_CACHE_SCHEMA,
      id: String(appointment.id || `${appointment.start_date}|${appointment.profile?.name_with_title || ""}`),
      appointmentIso: appointment.start_date || "",
      dateLabel: formatAppointmentLabel(appointment.start_date),
      doctor: appointment.substitute_name || appointment.profile?.name_with_title || "Praticien non détecté",
      substitution: appointment.substitution_wording || "",
      specialty: appointment.profile?.speciality || "",
      motive: appointment.visit_motive?.name || "",
      patient: patientName(appointment.patient),
      photoUrl: profilePhotoUrl(appointment.profile?.cloudinary_public_id),
      sourceUrl: appointment.id
        ? `https://www.doctolib.fr/account/appointments/details/${encodeURIComponent(appointment.id)}`
        : "https://www.doctolib.fr/account/appointments"
    }))
    .sort((a, b) => (a.appointmentIso || "").localeCompare(b.appointmentIso || ""));
}

function patientName(patient) {
  return normalizeText(
    [patient?.first_name, patient?.last_name]
      .filter(Boolean)
      .join(" ")
  );
}

function profilePhotoUrl(publicId) {
  if (!publicId) return "";
  return `https://media.doctolib.com/image/upload/q_auto:eco,f_auto,dpr_2/w_62,h_62,c_fill,g_face/${publicId}`;
}

function rememberUpcomingAppointments(appointments) {
  const json = JSON.stringify(appointments);

  if (json === lastAppointmentsJson) return;

  lastAppointmentsJson = json;
  localStorageArea.set({
    upcomingAppointments: appointments,
    upcomingAppointmentsUpdatedAt: Date.now()
  });
}

function formatAppointmentLabel(appointmentIso) {
  const date = new Date(appointmentIso);
  if (Number.isNaN(date.getTime())) return "Date non détectée";

  return date.toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  });
}

function findFacilityDetailsCard(appointmentCard) {
  return Array.from(document.querySelectorAll(".dl-card"))
    .filter((candidate) => (
      candidate !== appointmentCard &&
      !candidate.contains(appointmentCard) &&
      FACILITY_DETAILS_TEXT.test(candidate.textContent || "")
    ))
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
}

function resetPatchedButtons() {
  document.querySelectorAll("[data-segur-directions]").forEach((button) => {
    patchedButtons.get(button)?.abort();
    patchedButtons.delete(button);
    delete button.dataset.segurDirections;
    button.classList.remove("segur-hidden-map-button");
    button.removeAttribute("aria-hidden");
    button.removeAttribute("tabindex");
    button.parentElement?.querySelector(".segur-map-preview")?.remove();
    button.parentElement?.querySelector(".segur-assist-panel")?.remove();
  });
}

function scanPage(root = document) {
  const scope = root?.querySelectorAll ? root : document;

  moveFacilityDetailsCard(scope);
  highlightRequestedAppointmentAction();
  storeUpcomingAppointments();

  const elements = Array.from(
    scope.querySelectorAll("a, button, [role='button']")
  );

  if (scope.matches?.("a, button, [role='button']")) elements.unshift(scope);

  elements
    .filter((element) => MAP_BUTTON_TEXT.test(element.textContent || ""))
    .forEach(patchMapButton);
}

function highlightRequestedAppointmentAction() {
  const hashAction = {
    "#super-doctolib-deplacer": {
      key: "move",
      label: "Déplacer le RDV",
      pattern: /déplacer le rdv/i
    },
    "#super-doctolib-annuler": {
      key: "cancel",
      label: "Annuler le RDV",
      pattern: /annuler le rdv/i
    }
  }[window.location.hash];
  const storedAction = activeStoredAppointmentAction();
  const requestedAction = storedAction || hashAction;
  if (!requestedAction) return;

  const actionKey = `${currentAppointmentId()}|${requestedAction.key}`;
  if (requestedAppointmentActionDone === actionKey || requestedAppointmentActionDone === window.location.hash) return;

  const action = Array.from(document.querySelectorAll("a, button, [role='button']"))
    .find((element) => requestedAction.pattern.test(element.textContent || ""));
  if (!action || action.dataset.segurHighlightedAction === "ready") return;

  requestedAppointmentActionDone = actionKey;
  action.dataset.segurHighlightedAction = "ready";
  action.classList.add("segur-highlight-action");
  action.scrollIntoView({ block: "center", behavior: "smooth" });
  action.focus?.({ preventScroll: true });
  clearPendingAppointmentAction();
  if (window.location.hash) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  triggerAppointmentAction(action);
}

function triggerAppointmentAction(action) {
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window
  };

  action.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
  action.dispatchEvent(new MouseEvent("mousedown", eventOptions));
  action.dispatchEvent(new PointerEvent("pointerup", eventOptions));
  action.dispatchEvent(new MouseEvent("mouseup", eventOptions));
  action.click();
}

function activeStoredAppointmentAction() {
  const storedAction = pendingStoredAppointmentAction();
  if (!storedAction) return null;

  const appointmentId = currentAppointmentId();
  if (!appointmentId || storedAction.appointmentId !== appointmentId) return null;

  return appointmentActionDescriptor(storedAction.action);
}

function pendingStoredAppointmentAction() {
  if (pendingAppointmentAction === undefined) {
    loadPendingAppointmentAction().then(scheduleScan);
    return null;
  }

  if (!pendingAppointmentAction) return null;

  const age = Date.now() - numberOrDefault(pendingAppointmentAction.createdAt, 0);
  if (age > PENDING_APPOINTMENT_ACTION_MAX_AGE_MS) {
    clearPendingAppointmentAction();
    return null;
  }

  return pendingAppointmentAction;
}

function appointmentActionDescriptor(action) {
  return {
    move: {
      key: "move",
      label: "Déplacer le RDV",
      pattern: /déplacer le rdv/i
    },
    cancel: {
      key: "cancel",
      label: "Annuler le RDV",
      pattern: /annuler le rdv/i
    }
  }[action] || null;
}

async function loadPendingAppointmentAction() {
  if (!localStorageArea) {
    pendingAppointmentAction = null;
    return null;
  }

  if (!pendingAppointmentActionPromise) {
    pendingAppointmentActionPromise = localStorageArea
      .get({ [PENDING_APPOINTMENT_ACTION_KEY]: null })
      .then((result) => {
        pendingAppointmentAction = result[PENDING_APPOINTMENT_ACTION_KEY] || null;
        return pendingAppointmentAction;
      })
      .catch(() => {
        pendingAppointmentAction = null;
        return null;
      })
      .finally(() => {
        pendingAppointmentActionPromise = null;
      });
  }

  return pendingAppointmentActionPromise;
}

function clearPendingAppointmentAction() {
  pendingAppointmentAction = null;
  if (!localStorageArea) return;

  localStorageArea.remove(PENDING_APPOINTMENT_ACTION_KEY).catch(() => {
    // Le clic a déjà été lancé, le nettoyage est best-effort.
  });
}

function scheduleScan(root = document) {
  if (scanTimer) return;

  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    scanPage(root);
  }, 120);
}

async function loadSettings() {
  if (!storage) return { ...DEFAULT_SETTINGS };

  try {
    const result = await storage.get(DEFAULT_SETTINGS);
    return normalizeSettings(result);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function start() {
  try {
    settings = await loadSettings();
    scanPage();
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }

  if (typeof chrome === "undefined") return;

  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (
      areaName !== "sync" ||
      (
        !changes.originAddress &&
        !changes.travelMode &&
        !changes.walkingSpeedKmh &&
        !changes.safetyMarginMinutes &&
        !changes.debugEnabled
      )
    ) return;

    settings = normalizeSettings({
      ...settings,
      originAddress: changes.originAddress?.newValue ?? settings.originAddress,
      travelMode: changes.travelMode?.newValue ?? settings.travelMode,
      walkingSpeedKmh: changes.walkingSpeedKmh?.newValue ?? settings.walkingSpeedKmh,
      safetyMarginMinutes:
        changes.safetyMarginMinutes?.newValue ?? settings.safetyMarginMinutes,
      debugEnabled: changes.debugEnabled?.newValue ?? settings.debugEnabled
    });
    resetPatchedButtons();
    scheduleScan();
    });
  } catch {
    // Ancien content script après rechargement de l'extension.
  }
}

start();

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
    scheduleScan();
  }
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener("pagehide", () => {
  window.clearTimeout(scanTimer);
  window.clearTimeout(appointmentsFetchTimer);
  resetPatchedButtons();
  observer.disconnect();
}, { once: true });

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSettings(rawSettings) {
  return {
    originAddress: normalizeText(
      rawSettings.originAddress || DEFAULT_SETTINGS.originAddress
    ),
    travelMode: rawSettings.travelMode || DEFAULT_SETTINGS.travelMode,
    walkingSpeedKmh: numberOrDefault(
      rawSettings.walkingSpeedKmh,
      DEFAULT_SETTINGS.walkingSpeedKmh
    ),
    safetyMarginMinutes: numberOrDefault(
      rawSettings.safetyMarginMinutes,
      DEFAULT_SETTINGS.safetyMarginMinutes
    ),
    debugEnabled: Boolean(rawSettings.debugEnabled)
  };
}
