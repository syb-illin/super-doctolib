(function exposeQuickSearchCore(globalScope) {
  function slugSegment(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function selectedSearchSegment(options, requestedValue, fallback) {
    const requested = slugSegment(requestedValue);
    if (requested && !isDisabledOption(options, requested)) return requested;

    const selected = slugSegment(options?.value);
    if (selected && !isDisabledOption(options, selected)) return selected;

    const firstEnabled = Array.from(options?.options || [])
      .find((option) => !option.disabled && !option.hidden && slugSegment(option.value));
    return slugSegment(firstEnabled?.value) || fallback;
  }

  function isDisabledOption(options, value) {
    return Array.from(options?.options || [])
      .some((option) => slugSegment(option.value) === value && (option.disabled || option.hidden));
  }

  function titleCaseName(name) {
    return String(name || "")
      .toLocaleLowerCase("fr-FR")
      .replace(/(^|[ '\\-])(\p{L})/gu, (_, separator, letter) => (
        `${separator}${letter.toLocaleUpperCase("fr-FR")}`
      ))
      .trim();
  }

  function normalizedSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  function humanizeSlug(value) {
    return String(value || "")
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function normalizeDoctorSearch(value) {
    return String(value || "")
      .replace(/\bdr\.?\s+/i, "")
      .replace(/\bdocteur\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function doctorSearchUrl(doctorName, location = "paris") {
    const doctor = normalizeDoctorSearch(doctorName);
    const url = new URL("https://www.doctolib.fr/search");
    url.searchParams.set("keyword", doctor);
    url.searchParams.set("location", searchLocationParam(location));
    return url.toString();
  }

  function searchLocationParam(location) {
    const value = String(location || "");
    if (value === "paris") return "paris";

    const postalCode = value.match(/^paris-(750\d{2})$/)?.[1];
    return postalCode ? `${postalCode}-paris` : value;
  }

  const api = {
    humanizeSlug,
    normalizedSearch,
    doctorSearchUrl,
    normalizeDoctorSearch,
    searchLocationParam,
    selectedSearchSegment,
    slugSegment,
    titleCaseName
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.SuperDoctolibCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
