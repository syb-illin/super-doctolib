const DEFAULT_SETTINGS = {
  originAddress: "11 avenue de Ségur 75007 PARIS",
  travelMode: "walking",
  walkingSpeedKmh: 4.5,
  safetyMarginMinutes: 10,
  patientFilter: "",
  appointmentDensity: "comfortable",
  debugEnabled: false
};

const form = document.querySelector("#settings-form");
const patientFilter = document.querySelector("#patient-filter");
const originAddress = document.querySelector("#origin-address");
const travelMode = document.querySelector("#travel-mode");
const walkingSpeed = document.querySelector("#walking-speed");
const safetyMargin = document.querySelector("#safety-margin");
const appointmentDensity = document.querySelector("#appointment-density");
const debugEnabled = document.querySelector("#debug-enabled");
const resetButton = document.querySelector("#reset-button");
const openOptionsButton = document.querySelector("#open-options");
const quickSearchForm = document.querySelector("#quick-search-form");
const quickSearchDoctor = document.querySelector("#quick-search-doctor");
const quickSearchDoctorStatus = document.querySelector("#quick-search-doctor-status");
const doctorSuggestions = document.querySelector("#doctor-suggestions");
const quickSearchSpecialty = document.querySelector("#quick-search-specialty");
const quickSearchLocation = document.querySelector("#quick-search-location");
const quickSearchSubmit = document.querySelector("#quick-search-submit");
const recentSearches = document.querySelector("#recent-searches");
const extensionVersion = document.querySelector("#extension-version");
const status = document.querySelector("#status");
const appointmentsList = document.querySelector("#appointments-list");
const appointmentsEmpty = document.querySelector("#appointments-empty");
const cancelDialog = document.querySelector("#cancel-dialog");
const cancelDialogDetails = document.querySelector("#cancel-dialog-details");
const cancelDialogClose = document.querySelector("#cancel-dialog-close");
const cancelDialogConfirm = document.querySelector("#cancel-dialog-confirm");
let currentSettings = { ...DEFAULT_SETTINGS };
let cachedAppointments = [];
let cachedAppointmentsUpdatedAt = 0;
let appointmentsRefreshPromise = null;
let pendingCancelAppointment = null;
let availabilityHoverController = null;
let doctorValidationController = null;
let doctorValidationTimer = 0;
let doctorValidation = { key: "", url: "" };
let doctorSuggestionMatches = [];
let doctorSuggestionByUrl = new Map();
let suppressDoctorValidation = false;
let selectingDoctorSuggestion = false;
const availabilityCache = new Map();
const ADDRESS_MIN_SCORE = 0.55;
const APPOINTMENT_CACHE_SCHEMA = 3;
const AVAILABILITY_CACHE_TTL_MS = 5 * 60 * 1000;
const DOCTOR_VALIDATION_DELAY_MS = 350;
const PENDING_APPOINTMENT_ACTION_KEY = "pendingAppointmentAction";
const RECENT_SEARCHES_KEY = "quickSearchRecent";
const RECENT_SEARCHES_LIMIT = 5;
const FAVORITE_SEARCHES = new Set([
  "radiologue:paris-75007",
  "dentiste:paris-75015",
  "dermatologue:paris"
]);
const SPECIALTY_ALIASES = {
  addictologue: ["addictologue"],
  allergologue: ["allergologue"],
  angiologue: ["angiologue", "phlebologue", "phlébologue"],
  cardiologue: ["cardiologue"],
  "chirurgien-general": ["chirurgien general", "chirurgien général"],
  "chirurgien-orthopediste": ["chirurgien orthopediste", "chirurgien orthopédiste"],
  "chirurgien-oral": ["chirurgien oral"],
  "chirurgien-visceral-et-digestif": ["chirurgien visceral", "chirurgien viscéral", "chirurgien digestif"],
  dentiste: ["dentiste", "chirurgien dentiste", "chirurgien-dentiste"],
  dermatologue: ["dermatologue"],
  dieteticien: ["dieteticien", "diététicien"],
  endocrinologue: ["endocrinologue"],
  "gastro-enterologue": ["gastro enterologue", "gastro-entérologue", "gastroenterologue"],
  "gynecologue-medical-et-obstetrique": ["gynecologue", "gynécologue"],
  infirmier: ["infirmier", "infirmiere", "infirmière"],
  "masseur-kinesitherapeute": ["masseur kinesitherapeute", "masseur-kinésithérapeute", "kinesitherapeute", "kinésithérapeute"],
  "medecin-generaliste": ["medecin generaliste", "médecin généraliste"],
  neurologue: ["neurologue"],
  ophtalmologue: ["ophtalmologue"],
  "orl-oto-rhino-laryngologie": ["orl", "oto rhino laryngologie", "oto-rhino-laryngologie"],
  orthoptiste: ["orthoptiste"],
  osteopathe: ["osteopathe", "ostéopathe"],
  pediatre: ["pediatre", "pédiatre"],
  "pedicure-podologue": ["pedicure podologue", "pédicure-podologue", "podologue"],
  pneumologue: ["pneumologue"],
  psychiatre: ["psychiatre"],
  psychologue: ["psychologue"],
  radiologue: ["radiologue"],
  rhumatologue: ["rhumatologue"],
  "sage-femme": ["sage femme", "sage-femme"],
  urologue: ["urologue"]
};
const MALE_FIRST_NAMES = new Set([
  "franck",
  "franc",
  "francois",
  "jean",
  "pierre",
  "paul",
  "jacques",
  "michel",
  "philippe",
  "alain",
  "patrick",
  "nicolas",
  "julien",
  "thomas",
  "antoine",
  "maxime",
  "alexandre",
  "david",
  "cedric",
  "laurent",
  "christophe"
]);
let lastAddressValidation = { query: "", result: null };

if (extensionVersion && chrome.runtime?.getManifest) {
  extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
}

function showStatus(message) {
  if (!status) return;
  status.textContent = message;
  window.clearTimeout(showStatus.timeout);
  showStatus.timeout = window.setTimeout(() => {
    status.textContent = "";
  }, 2200);
}

function setDoctorStatus(type, message) {
  if (!quickSearchDoctorStatus) return;

  quickSearchDoctorStatus.hidden = !message;
  quickSearchDoctorStatus.className = `doctor-search-status doctor-search-status-${type}`;
  quickSearchDoctorStatus.textContent = message || "";
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  currentSettings = normalizeSettings(result);

  if (patientFilter) await loadPatientChoices();
  if (originAddress) originAddress.value = currentSettings.originAddress;
  if (travelMode) travelMode.value = currentSettings.travelMode;
  if (walkingSpeed) walkingSpeed.value = currentSettings.walkingSpeedKmh;
  if (safetyMargin) safetyMargin.value = currentSettings.safetyMarginMinutes;
  if (appointmentDensity) appointmentDensity.value = currentSettings.appointmentDensity;
  if (debugEnabled) debugEnabled.checked = currentSettings.debugEnabled;
  applyAppointmentDensity();
  syncQuickSearchSpecialties();
}

async function loadPatientChoices() {
  try {
    renderPatientChoices(await SuperDoctolibApi.masterPatients());
  } catch {
    renderPatientChoices([]);
  }
}

function renderPatientChoices(patients) {
  if (!patientFilter) return;
  const selectedValue = currentSettings.patientFilter;
  patientFilter.replaceChildren(new Option("Toutes les personnes", ""));

  patients
    .map(patientName)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "fr"))
    .forEach((name) => {
      patientFilter.append(new Option(name, name));
    });

  if (selectedValue && !Array.from(patientFilter.options).some((option) => option.value === selectedValue)) {
    patientFilter.append(new Option(selectedValue, selectedValue));
  }

  patientFilter.value = selectedValue;
  syncQuickSearchSpecialties();
}

function syncQuickSearchSpecialties() {
  if (!quickSearchSpecialty) return;

  const gynecology = quickSearchSpecialty.querySelector(
    "option[value='gynecologue-medical-et-obstetrique']"
  );
  if (!gynecology) return;

  const hideGynecology = isLikelyMalePatient(currentSettings.patientFilter);
  gynecology.hidden = hideGynecology;
  gynecology.disabled = hideGynecology;

  if (hideGynecology && quickSearchSpecialty.value === gynecology.value) {
    quickSearchSpecialty.value = "";
  }
}

function isLikelyMalePatient(name) {
  const firstName = normalizedSearch(name).split(/\s+/)[0];
  return MALE_FIRST_NAMES.has(firstName);
}

async function loadAppointments() {
  if (!appointmentsList || !appointmentsEmpty) return;
  renderLoading();

  const result = await chrome.storage.local.get({
    upcomingAppointments: [],
    upcomingAppointmentsUpdatedAt: 0
  });
  cachedAppointments = result.upcomingAppointments;
  cachedAppointmentsUpdatedAt = result.upcomingAppointmentsUpdatedAt;

  if (hasCurrentAppointmentSchema(cachedAppointments)) {
    renderAppointments(cachedAppointments, cachedAppointmentsUpdatedAt);
  }
  refreshAppointmentsFromApi();
}

function renderAppointments(appointments, updatedAt) {
  if (!appointmentsList || !appointmentsEmpty) return;
  const visibleAppointments = patientFilteredAppointments(
    visibleStoredAppointments(appointments)
  );

  appointmentsList.replaceChildren();
  appointmentsEmpty.hidden = visibleAppointments.length > 0;
  updateAppointmentBadge(visibleAppointments.length);

  visibleAppointments.slice(0, appointmentDisplayLimit()).forEach((appointment) => {
    const item = document.createElement("div");
    const url = appointmentUrl(appointment);
    item.className = "appointment-item";
    item.role = "link";
    item.tabIndex = 0;
    item.addEventListener("click", (event) => {
      if (event.target.closest(".appointment-action")) return;
      event.preventDefault();
      openAppointmentTab(url);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openAppointmentTab(url);
    });
    item.addEventListener("mouseenter", () => showAvailabilityHint(item, appointment));
    item.addEventListener("mouseleave", hideAvailabilityHint);
    item.addEventListener("focus", () => showAvailabilityHint(item, appointment));
    item.addEventListener("blur", hideAvailabilityHint);

    const photo = document.createElement("img");
    photo.className = "appointment-photo";
    photo.alt = "";
    photo.loading = "lazy";
    photo.src = appointment.photoUrl || "icons/icon-48.png";

    const text = document.createElement("span");
    text.className = "appointment-text";

    const date = document.createElement("span");
    date.className = "appointment-date";
    date.textContent = appointment.dateLabel || "Date non détectée";

    const doctor = document.createElement("span");
    doctor.className = "appointment-doctor";
    doctor.textContent = appointment.doctor || "Praticien non détecté";

    const specialty = document.createElement("span");
    specialty.className = "appointment-specialty";
    specialty.textContent = [appointment.substitution, appointment.specialty, appointment.motive]
      .filter(Boolean)
      .join(" · ") || "Spécialité non détectée";

    const patient = document.createElement("span");
    patient.className = "appointment-patient";
    patient.textContent = titleCaseName(appointment.patient);
    patient.hidden = !appointment.patient;

    const actions = document.createElement("span");
    actions.className = "appointment-actions";
    actions.append(
      appointmentActionButton("Déplacer", appointment, "move"),
      appointmentActionButton("Annuler", appointment, "cancel")
    );

    text.append(date, doctor, specialty, patient, actions);
    item.append(photo, text);
    appointmentsList.append(item);
  });

  if (visibleAppointments.length > 0 && updatedAt) {
    const updated = document.createElement("p");
    updated.className = "appointments-updated";
    updated.textContent = `Mis à jour ${new Date(updatedAt).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
    appointmentsList.append(updated);
  }
}

function appointmentDisplayLimit() {
  return currentSettings.appointmentDensity === "compact" ? 12 : 8;
}

function applyAppointmentDensity() {
  if (!document.body) return;
  document.body.classList.toggle("density-compact", currentSettings.appointmentDensity === "compact");
}

function renderLoading() {
  if (!appointmentsList || !appointmentsEmpty) return;
  appointmentsEmpty.hidden = true;
  appointmentsList.replaceChildren();

  const loading = document.createElement("div");
  loading.className = "appointments-loading";

  const spinner = document.createElement("span");
  spinner.className = "spinner";

  const label = document.createElement("span");
  label.textContent = "Chargement des RDV...";

  loading.append(spinner, label);
  appointmentsList.append(loading);
}

async function refreshAppointmentsFromApi() {
  if (appointmentsRefreshPromise) return appointmentsRefreshPromise;

  appointmentsRefreshPromise = doRefreshAppointmentsFromApi()
    .finally(() => {
      appointmentsRefreshPromise = null;
    });

  return appointmentsRefreshPromise;
}

async function doRefreshAppointmentsFromApi() {
  try {
    const payload = await SuperDoctolibApi.appointments();
    const appointments = normalizeAppointmentsPayload(payload);
    const updatedAt = Date.now();
    const appointmentsJson = JSON.stringify(appointments);

    if (appointmentsJson !== JSON.stringify(cachedAppointments)) {
      cachedAppointments = appointments;
      cachedAppointmentsUpdatedAt = updatedAt;
      await chrome.storage.local.set({
        upcomingAppointments: appointments,
        upcomingAppointmentsUpdatedAt: updatedAt
      });
    }

    renderAppointments(appointments, updatedAt);
  } catch {
    appointmentsEmpty.textContent = "Ouvre Doctolib connecté pour rafraîchir cette liste.";
  }
}

function updateAppointmentBadge(count) {
  try {
    chrome.runtime?.sendMessage?.({ type: "updateAppointmentBadge", count });
  } catch {
    // Le badge est cosmétique et ne doit jamais bloquer le popup.
  }
}

async function showAvailabilityHint(item, appointment) {
  if (!hasAvailabilityIds(appointment)) return;

  availabilityHoverController?.abort();
  availabilityHoverController = new AbortController();
  const controller = availabilityHoverController;
  const hint = ensureAvailabilityHint(item);
  hint.textContent = "Recherche prochain créneau...";
  hint.hidden = false;

  try {
    const result = await appointmentAvailability(appointment, controller.signal);
    if (controller.signal.aborted || !item.isConnected) return;

    hint.textContent = result.nextSlot
      ? `Prochain créneau · ${formatAvailabilitySlot(result.nextSlot)}`
      : "Aucun créneau proche trouvé";
  } catch {
    if (controller.signal.aborted || !item.isConnected) return;
    hint.textContent = "Dispos indisponibles";
  }
}

function hideAvailabilityHint() {
  availabilityHoverController?.abort();
  availabilityHoverController = null;
  document.querySelectorAll(".availability-hint").forEach((hint) => {
    hint.hidden = true;
  });
}

function ensureAvailabilityHint(item) {
  const existing = item.querySelector(".availability-hint");
  if (existing) return existing;

  const hint = document.createElement("span");
  hint.className = "availability-hint";
  hint.hidden = true;
  item.append(hint);
  return hint;
}

async function appointmentAvailability(appointment, signal) {
  const key = availabilityKey(appointment);
  const cached = availabilityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) availabilityCache.delete(key);

  const payload = await SuperDoctolibApi.availabilities({
    agendaId: appointment.agendaId,
    practiceId: appointment.practiceId,
    signal,
    visitMotiveId: appointment.visitMotiveId
  });
  const slots = (payload?.availabilities || []).flatMap((day) => (
    Array.isArray(day.slots) ? day.slots : []
  ));
  const result = {
    nextSlot: slots[0] || payload?.next_slot || ""
  };

  rememberAvailability(key, result);
  return result;
}

function hasAvailabilityIds(appointment) {
  return Boolean(appointment?.agendaId && appointment?.practiceId && appointment?.visitMotiveId);
}

function availabilityKey(appointment) {
  return [appointment.practiceId, appointment.agendaId, appointment.visitMotiveId]
    .map((value) => String(value || ""))
    .join(":");
}

function rememberAvailability(key, value) {
  if (availabilityCache.has(key)) availabilityCache.delete(key);
  availabilityCache.set(key, {
    expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
    value
  });

  while (availabilityCache.size > 24) {
    availabilityCache.delete(availabilityCache.keys().next().value);
  }
}

function formatAvailabilitySlot(slotIso) {
  const date = new Date(slotIso);
  if (Number.isNaN(date.getTime())) return "date inconnue";

  return date.toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  });
}

function normalizeAppointmentsPayload(payload) {
  return visibleApiAppointments(payload?.data?.confirmed || [])
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
      agendaId: appointment.agenda_id || "",
      practiceId: appointment.practice?.id || appointment.practice_id || "",
      visitMotiveId: appointment.visit_motive?.id || "",
      sourceUrl: appointmentUrlFromId(appointment.id)
    }))
    .sort((a, b) => (a.appointmentIso || "").localeCompare(b.appointmentIso || ""));
}

function hasCurrentAppointmentSchema(appointments) {
  return appointments.length > 0 &&
    appointments.every((appointment) => appointment?.schemaVersion === APPOINTMENT_CACHE_SCHEMA);
}

function appointmentUrl(appointment) {
  return appointmentUrlFromId(appointment?.id) ||
    appointment?.sourceUrl ||
    "https://www.doctolib.fr/account/appointments";
}

function appointmentUrlFromId(id) {
  const value = String(id || "");
  if (!value || value.includes("|")) return "";
  return `https://www.doctolib.fr/account/appointments/details/${encodeURIComponent(value)}`;
}

function actionUrl(url, action) {
  const target = new URL(url);
  if (action === "move") {
    target.pathname = target.pathname.replace(/\/account\/appointments\/details\//, "/appointments/");
    target.pathname = `${target.pathname.replace(/\/$/, "")}/move/new`;
    target.hash = "";
    return target.toString();
  }

  target.hash = action === "cancel"
    ? "super-doctolib-annuler"
    : "super-doctolib-deplacer";
  return target.toString();
}

function appointmentActionButton(label, appointment, action) {
  const button = document.createElement("button");
  button.className = `appointment-action appointment-action-${label.toLowerCase()}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = actionUrl(appointmentUrl(appointment), action);
    if (action === "cancel") {
      showCancelConfirmation(appointment);
      return;
    }

    if (action !== "move") {
      await rememberPendingAppointmentAction(appointment, action);
    }
    if (action === "move") {
      openAppointmentTab(url);
      return;
    }

    openAppointmentActionWindow(url);
  });
  return button;
}

function showCancelConfirmation(appointment) {
  if (!cancelDialog || !cancelDialogDetails || !cancelDialogConfirm) return;

  pendingCancelAppointment = appointment;
  cancelDialogDetails.textContent = [
    appointment.dateLabel || "Date non détectée",
    appointment.doctor || "Praticien non détecté",
    appointment.patient || ""
  ].filter(Boolean).join(" · ");
  cancelDialog.hidden = false;
  cancelDialogConfirm.disabled = false;
  cancelDialogConfirm.textContent = "Annuler le RDV";
  cancelDialogConfirm.focus();
}

function hideCancelConfirmation() {
  if (!cancelDialog) return;

  pendingCancelAppointment = null;
  cancelDialog.hidden = true;
}

async function cancelAppointment(appointment) {
  const id = String(appointment?.id || "");
  if (!id || id.includes("|")) throw new Error("invalid appointment id");

  await SuperDoctolibApi.cancelAppointment(id);
}

async function removeCanceledAppointment(appointment) {
  cachedAppointments = cachedAppointments.filter((candidate) => candidate.id !== appointment.id);
  cachedAppointmentsUpdatedAt = Date.now();
  await chrome.storage.local.set({
    upcomingAppointments: cachedAppointments,
    upcomingAppointmentsUpdatedAt: cachedAppointmentsUpdatedAt
  });
  renderAppointments(cachedAppointments, cachedAppointmentsUpdatedAt);
}

async function rememberPendingAppointmentAction(appointment, action) {
  const id = String(appointment?.id || "");
  if (!id || id.includes("|")) return;

  try {
    await chrome.storage.local.set({
      [PENDING_APPOINTMENT_ACTION_KEY]: {
        appointmentId: id,
        action,
        createdAt: Date.now()
      }
    });
  } catch {
    // Le hash reste présent dans l'URL en repli.
  }
}

function openAppointmentTab(url) {
  if (chrome.tabs?.create) {
    chrome.tabs.create({ url });
    window.close();
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function openAppointmentActionWindow(url) {
  if (chrome.windows?.create) {
    chrome.windows.create({
      url,
      type: "popup",
      focused: true,
      state: "normal",
      left: 160,
      top: 80,
      width: 980,
      height: 760
    });
    window.close();
    return;
  }

  openAppointmentTab(url);
}

function quickSearchUrl(specialtyValue, locationValue, doctorValue = "") {
  const doctor = normalizeDoctorSearch(doctorValue);
  const location = selectedSearchSegment(quickSearchLocation, locationValue, "paris");
  if (doctor) {
    const url = new URL("https://www.doctolib.fr/search");
    url.searchParams.set("keyword", doctor);
    url.searchParams.set("location", searchLocationParam(location));
    return url.toString();
  }

  const specialty = selectedSpecialtySegment(specialtyValue);
  if (!specialty) {
    const url = new URL("https://www.doctolib.fr/search");
    url.searchParams.set("location", searchLocationParam(location));
    return url.toString();
  }

  return `https://www.doctolib.fr/${specialty}/${location}`;
}

function openQuickSearch(specialty, location, doctor = "") {
  const safeDoctor = normalizeDoctorSearch(doctor);
  const safeSpecialty = selectedSpecialtySegment(specialty);
  const safeLocation = selectedSearchSegment(quickSearchLocation, location, "paris");
  const key = doctorValidationKey(safeDoctor, safeLocation);
  if (safeDoctor && doctorValidation.key !== key && doctorSuggestionMatches.length > 1) {
    showDoctorSuggestions(doctorSuggestionMatches, safeLocation);
    setDoctorStatus("empty", "Choisis un profil dans la liste");
    return;
  }

  const url = safeDoctor && doctorValidation.key === key && doctorValidation.url
    ? doctorValidation.url
    : quickSearchUrl(safeSpecialty, safeLocation, safeDoctor);

  if (chrome.tabs?.create) {
    chrome.tabs.create({ url });
    rememberQuickSearch(safeSpecialty, safeLocation, safeDoctor);
    window.close();
    return;
  }

  rememberQuickSearch(safeSpecialty, safeLocation, safeDoctor);
  window.open(url, "_blank", "noopener,noreferrer");
}

function selectDoctorProfile(provider, location) {
  if (!provider?.link) return;

  selectingDoctorSuggestion = false;
  const safeLocation = selectedSearchSegment(quickSearchLocation, location, "paris");
  const displayName = formatProviderName(provider.label);
  const doctor = normalizeDoctorSearch(displayName);
  const url = new URL(provider.link, "https://www.doctolib.fr").toString();
  doctorValidation = {
    key: doctorValidationKey(doctor, safeLocation),
    url
  };

  suppressDoctorValidation = true;
  window.clearTimeout(doctorValidationTimer);
  doctorValidationController?.abort();
  clearDoctorSuggestions();
  if (quickSearchDoctor) quickSearchDoctor.value = displayName;
  setDoctorStatus("ok", `${displayName} sélectionné · clique la loupe`);
}

function formatProviderName(label) {
  return String(label || "")
    .replace(/\s+/g, " ")
    .replace(/^dr\b/i, "Dr")
    .replace(/^mme\b/i, "Mme")
    .replace(/^m\.\b/i, "M.")
    .trim();
}

async function rememberQuickSearch(specialty, location, doctor = "") {
  const item = {
    doctor,
    specialty,
    location,
    label: quickSearchLabel(specialty, location, doctor)
  };

  try {
    const result = await chrome.storage.local.get({ [RECENT_SEARCHES_KEY]: [] });
    const recent = Array.isArray(result[RECENT_SEARCHES_KEY])
      ? result[RECENT_SEARCHES_KEY]
      : [];
    const next = [
      item,
      ...recent.filter((candidate) => (
        candidate?.doctor !== item.doctor ||
        candidate?.specialty !== item.specialty ||
        candidate?.location !== item.location
      ))
    ].slice(0, RECENT_SEARCHES_LIMIT);

    await chrome.storage.local.set({ [RECENT_SEARCHES_KEY]: next });
  } catch {
    // L'historique ne doit jamais empêcher l'ouverture de la recherche.
  }
}

async function renderRecentSearches() {
  if (!recentSearches) return;

  try {
    const result = await chrome.storage.local.get({ [RECENT_SEARCHES_KEY]: [] });
    const recent = Array.isArray(result[RECENT_SEARCHES_KEY])
      ? result[RECENT_SEARCHES_KEY]
      : [];

    recentSearches.replaceChildren();
    const visibleRecent = recent.filter((item) => {
      const specialty = slugSegment(item?.specialty);
      const location = slugSegment(item?.location);
      const doctor = String(item?.doctor || "").trim();
      return specialty && location && (doctor || !FAVORITE_SEARCHES.has(`${specialty}:${location}`));
    });

    recentSearches.hidden = visibleRecent.length === 0;

    visibleRecent.forEach((item) => {
      const specialty = slugSegment(item?.specialty);
      const location = slugSegment(item?.location);
      const doctor = String(item?.doctor || "").trim();

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item?.label || quickSearchLabel(specialty, location, doctor);
      button.addEventListener("click", () => openQuickSearch(specialty, location, doctor));
      recentSearches.append(button);
    });
  } catch {
    recentSearches.hidden = true;
  }
}

function quickSearchLabel(specialty, location, doctor = "") {
  const doctorName = String(doctor || "").trim();
  if (doctorName) return `${doctorName} · ${searchLocationLabel(location)}`;

  const specialtyLabel = selectedSpecialtySegment(specialty)
    ? optionLabel(quickSearchSpecialty, specialty) || humanizeSlug(specialty)
    : "Toutes spécialités";
  return `${specialtyLabel} ${searchLocationLabel(location)}`;
}

function searchLocationLabel(location) {
  return location === "paris" ? "Paris" : String(location || "").replace("paris-", "");
}

function searchLocationParam(location) {
  const value = String(location || "");
  if (value === "paris") return "paris";

  const postalCode = value.match(/^paris-(750\d{2})$/)?.[1];
  return postalCode ? `${postalCode}-paris` : value;
}

function normalizeDoctorSearch(value) {
  return String(value || "")
    .replace(/\bdr\.?\s+/i, "")
    .replace(/\bdocteur\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scheduleDoctorValidation() {
  if (suppressDoctorValidation) return;
  window.clearTimeout(doctorValidationTimer);
  doctorValidationTimer = window.setTimeout(validateDoctorSearch, DOCTOR_VALIDATION_DELAY_MS);
}

async function validateDoctorSearch() {
  if (suppressDoctorValidation) return;
  if (!quickSearchDoctorStatus) return;

  const doctor = normalizeDoctorSearch(quickSearchDoctor?.value);
  const location = selectedSearchSegment(quickSearchLocation, quickSearchLocation?.value, "paris");

  doctorValidationController?.abort();
  doctorValidation = { key: "", url: "" };
  doctorSuggestionMatches = [];
  clearDoctorSuggestions();

  if (!doctor) {
    setDoctorStatus("loading", "");
    return;
  }

  doctorValidationController = new AbortController();
  const controller = doctorValidationController;
  setDoctorStatus("loading", "Recherche...");

  try {
    const payload = await SuperDoctolibApi.doctorSearch({
      keyword: doctor,
      location,
      signal: controller.signal
    });
    if (controller.signal.aborted) return;

    const suggestions = normalizeDoctorSuggestions(payload);
    const filteredSuggestions = filterDoctorSuggestions(
      suggestions,
      selectedSpecialtySegment(quickSearchSpecialty?.value),
      location
    );
    const match = bestDoctorMatch(filteredSuggestions.length ? filteredSuggestions : suggestions, doctor);
    match.isFiltered = filteredSuggestions.length > 0;
    doctorSuggestionMatches = match.matches;
    const provider = match.provider;
    if (match.matches.length > 0) {
      setDoctorStatus("loading", `${match.matches.length} profil${match.matches.length > 1 ? "s" : ""} trouvé${match.matches.length > 1 ? "s" : ""} · sélectionne un profil`);
      showDoctorSuggestions(match.matches, location);
      return;
    }

    if (!provider?.link) {
      setDoctorStatus("empty", doctorSearchEmptyMessage(payload));
      return;
    }
    if (match.isAmbiguous) {
      setDoctorStatus("empty", `${match.count} profils trouvés · choisis le bon`);
      showDoctorSuggestions(match.matches, location);
      return;
    }

    doctorValidation = {
      key: doctorValidationKey(doctor, location),
      url: new URL(provider.link, "https://www.doctolib.fr").toString()
    };
    setDoctorStatus("ok", `✓ ${provider.label}`);
  } catch (error) {
    if (controller.signal.aborted) return;
    setDoctorStatus("empty", doctorSearchErrorMessage(error));
  }
}

function doctorSearchEmptyMessage(payload) {
  const debug = payload?.__superDoctolibDebug;
  if (debug?.source) {
    const lastAttempt = Array.isArray(debug.attempts) ? debug.attempts.at(-1) : null;
    const query = debug.matchedQuery ? ` · ${debug.matchedQuery}` : "";
    const sample = firstNonEmptySample(lastAttempt);
    if (sample) return `Aucun profil · ${query} · ${sample}`;
    const keys = Array.isArray(debug.keys) && debug.keys.length ? ` · ${debug.keys.join(",")}` : "";
    return `Aucun profil reçu (${debug.source}${query}${keys})`;
  }

  return "Aucun profil reçu";
}

function firstNonEmptySample(attempt) {
  const samples = [
    ...(attempt?.profileSamples || []),
    ...(attempt?.organizationSamples || []),
    ...(attempt?.specialitySamples || [])
  ].filter(Boolean);
  return samples[0] || "";
}

function doctorSearchErrorMessage(error) {
  const message = String(error?.message || "").trim();
  return message ? `Recherche impossible · ${message}` : "Recherche impossible";
}

function filterDoctorSuggestions(providers, specialty, location) {
  const specialtyFiltered = filterDoctorSuggestionsBySpecialty(providers, specialty);
  return filterDoctorSuggestionsByLocation(specialtyFiltered, location);
}

function filterDoctorSuggestionsBySpecialty(providers, specialty) {
  if (!specialty) return providers;

  const aliases = SPECIALTY_ALIASES[specialty] || [optionLabel(quickSearchSpecialty, specialty), specialty];
  const normalizedAliases = aliases.map(normalizedSearch).filter(Boolean);
  if (!normalizedAliases.length) return providers;

  return providers.filter((provider) => {
    const kind = normalizedSearch(provider.kind);
    return normalizedAliases.some((alias) => kind.includes(alias) || alias.includes(kind));
  });
}

function filterDoctorSuggestionsByLocation(providers, location) {
  const safeLocation = slugSegment(location);
  if (!safeLocation || safeLocation === "paris") return providers;

  const postalCode = safeLocation.match(/^paris-(750\d{2})$/)?.[1];
  if (!postalCode) return providers;

  return providers.filter((provider) => {
    const city = normalizedSearch(provider.city);
    const link = normalizedSearch(provider.link);
    return city === "paris" || link.includes("/paris/");
  });
}

function bestDoctorMatch(providers, doctor) {
  const normalizedDoctor = normalizedSearch(doctor);
  const tokens = normalizedDoctor.split(/\s+/).filter(Boolean);
  const matches = providers.filter((provider) => {
    const fullName = normalizedSearch(provider.label);
    return fullName && tokens.every((part) => fullName.includes(part));
  });
  const exact = matches.find((provider) => normalizedSearch(provider.label) === normalizedDoctor);

  if (exact) {
    return { count: 1, isAmbiguous: false, matches: [exact], provider: exact };
  }

  if (matches.length > 1 && tokens.length < 2) {
    return { count: matches.length, isAmbiguous: true, matches, provider: null };
  }

  if (matches.length > 1) {
    return {
      count: matches.length,
      isAmbiguous: true,
      matches,
      provider: null
    };
  }

  const fallbackMatches = matches.length ? matches : providers.slice(0, 6);
  return {
    count: matches.length || providers.length,
    isAmbiguous: false,
    matches: fallbackMatches,
    provider: matches[0] || providers[0] || null
  };
}

function showDoctorSuggestions(providers, location) {
  if (!doctorSuggestions) return;

  const safeLocation = selectedSearchSegment(quickSearchLocation, location, "paris");
  const fragment = document.createDocumentFragment();
  const nextSuggestions = new Map();
  providers.slice(0, 6).forEach((provider) => {
    const button = document.createElement("button");
    const label = document.createElement("strong");
    const meta = document.createElement("span");
    const url = new URL(provider.link, "https://www.doctolib.fr").toString();
    nextSuggestions.set(url, provider);

    button.type = "button";
    button.className = "doctor-suggestion";
    button.dataset.url = url;
    button.dataset.location = safeLocation;
    label.textContent = provider.label;
    meta.textContent = [provider.kind, provider.city].filter(Boolean).join(" · ");
    button.append(label, meta);
    fragment.append(button);
  });

  doctorSuggestionByUrl = nextSuggestions;
  doctorSuggestions.replaceChildren(fragment);
  doctorSuggestions.hidden = providers.length === 0;
}

function clearDoctorSuggestions() {
  if (!doctorSuggestions) return;
  doctorSuggestionByUrl = new Map();
  doctorSuggestions.replaceChildren();
  doctorSuggestions.hidden = true;
}

function normalizeDoctorSuggestions(payload) {
  const rawSuggestions = Array.isArray(payload)
    ? payload
    : payload?.profiles ||
      payload?.results ||
      payload?.doctors ||
      payload?.healthcareProviders ||
      payload?.suggestions ||
      [];

  return rawSuggestions
    .map((item) => {
      const label = normalizeTextValue(
        item.label ||
        item.nameWithTitle ||
        item.name_with_title ||
        [item.title, item.firstName || item.first_name, item.name || item.lastName || item.last_name]
          .filter(Boolean)
          .join(" ")
      );
      const link = item.link || item.url || item.profilePath || item.path || "";
      const city = normalizeTextValue(item.city || item.location);
      const kind = normalizeTextValue(item.kind || item.speciality || item.specialty);
      const rankingText = `${label} ${kind} ${city}`;
      return { city, kind, label, link, rankingText };
    })
    .filter((item) => item.label && item.link);
}

function normalizeTextValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function doctorValidationKey(doctor, location) {
  return `${normalizedSearch(doctor)}::${slugSegment(location)}`;
}

function optionLabel(select, value) {
  return Array.from(select?.options || [])
    .find((option) => option.value === value)
    ?.textContent
    ?.trim() || "";
}

function selectedSearchSegment(select, requestedValue, fallback) {
  return SuperDoctolibCore.selectedSearchSegment(select, requestedValue, fallback);
}

function selectedSpecialtySegment(requestedValue) {
  const requested = slugSegment(requestedValue);
  if (requested && !isDisabledOption(quickSearchSpecialty, requested)) return requested;

  const selected = slugSegment(quickSearchSpecialty?.value);
  if (selected && !isDisabledOption(quickSearchSpecialty, selected)) return selected;

  return "";
}

function isDisabledOption(select, value) {
  return Array.from(select?.options || [])
    .some((option) => slugSegment(option.value) === value && (option.disabled || option.hidden));
}

function humanizeSlug(value) {
  return SuperDoctolibCore.humanizeSlug(value);
}

function slugSegment(value) {
  return SuperDoctolibCore.slugSegment(value);
}

function visibleStoredAppointments(appointments) {
  return appointments.filter((appointment) => {
    return (
      appointment?.is_in_future !== false &&
      appointment?.past !== true &&
      appointment?.canceled !== true &&
      appointment?.deleted !== true
    );
  });
}

function visibleApiAppointments(appointments) {
  return appointments.filter((appointment) => (
    appointment?.is_in_future === true &&
    appointment?.past !== true &&
    appointment?.canceled !== true &&
    appointment?.deleted !== true
  ));
}

function patientFilteredAppointments(appointments) {
  const filter = normalizedSearch(currentSettings.patientFilter);
  if (!filter) return appointments;

  return appointments.filter((appointment) => (
    normalizedSearch(appointment.patient).includes(filter)
  ));
}

function patientName(patient) {
  return titleCaseName([patient?.first_name, patient?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim());
}

function titleCaseName(name) {
  return SuperDoctolibCore.titleCaseName(name);
}

function profilePhotoUrl(publicId) {
  if (!publicId) return "";
  return `https://media.doctolib.com/image/upload/q_auto:eco,f_auto,dpr_2/w_62,h_62,c_fill,g_face/${publicId}`;
}

function normalizedSearch(value) {
  return SuperDoctolibCore.normalizedSearch(value);
}

async function validateFrenchAddress(address) {
  const query = normalizedSearch(address);
  if (!query) return null;

  if (lastAddressValidation.query === query) {
    return lastAddressValidation.result;
  }

  const result = await SuperDoctolibApi.validateFrenchAddress(address);

  lastAddressValidation = { query, result };
  return result;
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

async function saveSettings() {
  const requestedAddress = originAddress?.value.trim() || DEFAULT_SETTINGS.originAddress;
  const addressValidation = await validateFrenchAddress(requestedAddress);
  if (!addressValidation || addressValidation.score < ADDRESS_MIN_SCORE) {
    showStatus("Adresse introuvable dans la Base Adresse Nationale.");
    originAddress?.focus();
    return false;
  }

  if (originAddress && addressValidation.label) {
    originAddress.value = addressValidation.label;
  }

  currentSettings = normalizeSettings({
    patientFilter: patientFilter?.value,
    originAddress: addressValidation.label || requestedAddress,
    travelMode: travelMode?.value || DEFAULT_SETTINGS.travelMode,
    walkingSpeedKmh: numberOrDefault(walkingSpeed?.value, DEFAULT_SETTINGS.walkingSpeedKmh),
    safetyMarginMinutes: numberOrDefault(
      safetyMargin?.value,
      DEFAULT_SETTINGS.safetyMarginMinutes
    ),
    appointmentDensity: appointmentDensity?.value || DEFAULT_SETTINGS.appointmentDensity,
    debugEnabled: debugEnabled?.checked
  });

  await chrome.storage.sync.set(currentSettings);
  return true;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await saveSettings();
    if (saved) showStatus("Réglages sauvegardés.");
  });
}

if (resetButton) {
  resetButton.addEventListener("click", async () => {
    if (patientFilter) patientFilter.value = DEFAULT_SETTINGS.patientFilter;
    if (originAddress) originAddress.value = DEFAULT_SETTINGS.originAddress;
    if (travelMode) travelMode.value = DEFAULT_SETTINGS.travelMode;
    if (walkingSpeed) walkingSpeed.value = DEFAULT_SETTINGS.walkingSpeedKmh;
    if (safetyMargin) safetyMargin.value = DEFAULT_SETTINGS.safetyMarginMinutes;
    if (appointmentDensity) appointmentDensity.value = DEFAULT_SETTINGS.appointmentDensity;
    if (debugEnabled) debugEnabled.checked = DEFAULT_SETTINGS.debugEnabled;
    const saved = await saveSettings();
    if (saved) showStatus("Réglages par défaut restaurés.");
  });
}

if (openOptionsButton) {
  openOptionsButton.addEventListener("click", () => {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      window.close();
      return;
    }

    window.open("options.html", "_blank", "noopener,noreferrer");
  });
}

if (quickSearchForm) {
  quickSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    openQuickSearch(quickSearchSpecialty?.value, quickSearchLocation?.value, quickSearchDoctor?.value);
  });
}

if (quickSearchSubmit) {
  quickSearchSubmit.addEventListener("click", (event) => {
    event.preventDefault();
    openQuickSearch(quickSearchSpecialty?.value, quickSearchLocation?.value, quickSearchDoctor?.value);
  });
}

if (quickSearchDoctor) {
  quickSearchDoctor.addEventListener("input", () => {
    suppressDoctorValidation = false;
    scheduleDoctorValidation();
  });
  quickSearchDoctor.addEventListener("blur", () => {
    if (selectingDoctorSuggestion || suppressDoctorValidation) return;
    validateDoctorSearch();
  });
}

if (doctorSuggestions) {
  doctorSuggestions.addEventListener("pointerdown", (event) => {
    const button = event.target?.closest?.(".doctor-suggestion");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    selectingDoctorSuggestion = true;
    selectDoctorProfile(doctorSuggestionByUrl.get(button.dataset.url), button.dataset.location);
  });
  doctorSuggestions.addEventListener("mousedown", (event) => {
    if (!event.target?.closest?.(".doctor-suggestion")) return;
    event.preventDefault();
    event.stopPropagation();
  });
  doctorSuggestions.addEventListener("click", (event) => {
    if (!event.target?.closest?.(".doctor-suggestion")) return;
    event.preventDefault();
    event.stopPropagation();
  });
}

if (quickSearchLocation) {
  quickSearchLocation.addEventListener("change", scheduleDoctorValidation);
}

if (quickSearchSpecialty) {
  quickSearchSpecialty.addEventListener("change", scheduleDoctorValidation);
}

if (patientFilter) {
  patientFilter.addEventListener("change", () => {
    currentSettings = normalizeSettings({
      ...currentSettings,
      patientFilter: patientFilter.value
    });
    syncQuickSearchSpecialties();
  });
}

document.querySelectorAll("[data-search-specialty][data-search-location]").forEach((button) => {
  button.addEventListener("click", () => {
    openQuickSearch(button.dataset.searchSpecialty, button.dataset.searchLocation);
  });
});

if (cancelDialogClose) {
  cancelDialogClose.addEventListener("click", hideCancelConfirmation);
}

if (cancelDialog) {
  cancelDialog.addEventListener("click", (event) => {
    if (event.target === cancelDialog) hideCancelConfirmation();
  });
}

if (cancelDialogConfirm) {
  cancelDialogConfirm.addEventListener("click", async () => {
    if (!pendingCancelAppointment) return;

    const appointment = pendingCancelAppointment;
    cancelDialogConfirm.disabled = true;
    cancelDialogConfirm.textContent = "Annulation...";

    try {
      await cancelAppointment(appointment);
      hideCancelConfirmation();
      await removeCanceledAppointment(appointment);
      refreshAppointmentsFromApi();
    } catch {
      cancelDialogConfirm.disabled = false;
      cancelDialogConfirm.textContent = "Réessayer";
      if (cancelDialogDetails) {
        cancelDialogDetails.textContent = "Impossible d'annuler ce RDV depuis l'extension. Ouvre Doctolib pour vérifier.";
      }
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cancelDialog && !cancelDialog.hidden) {
    hideCancelConfirmation();
  }
});

init();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") {
    loadSettings().then(() => {
      renderAppointments(cachedAppointments, cachedAppointmentsUpdatedAt);
    });
    return;
  }

  if (areaName === "local" && changes.upcomingAppointments) {
    cachedAppointments = changes.upcomingAppointments.newValue || [];
    if (changes.upcomingAppointmentsUpdatedAt) {
      cachedAppointmentsUpdatedAt = changes.upcomingAppointmentsUpdatedAt.newValue || 0;
    }
    renderAppointments(cachedAppointments, cachedAppointmentsUpdatedAt);
    return;
  }

  if (areaName === "local" && changes[RECENT_SEARCHES_KEY]) {
    renderRecentSearches();
  }
});

function normalizeSettings(rawSettings) {
  return {
    patientFilter: String(rawSettings.patientFilter || "").trim(),
    originAddress: rawSettings.originAddress || DEFAULT_SETTINGS.originAddress,
    travelMode: rawSettings.travelMode || DEFAULT_SETTINGS.travelMode,
    walkingSpeedKmh: numberOrDefault(
      rawSettings.walkingSpeedKmh,
      DEFAULT_SETTINGS.walkingSpeedKmh
    ),
    safetyMarginMinutes: numberOrDefault(
      rawSettings.safetyMarginMinutes,
      DEFAULT_SETTINGS.safetyMarginMinutes
    ),
    appointmentDensity: ["compact", "comfortable"].includes(rawSettings.appointmentDensity)
      ? rawSettings.appointmentDensity
      : DEFAULT_SETTINGS.appointmentDensity,
    debugEnabled: Boolean(rawSettings.debugEnabled)
  };
}

async function init() {
  await loadSettings();
  await renderRecentSearches();
  await loadAppointments();
}
