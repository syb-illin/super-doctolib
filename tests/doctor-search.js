const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const apiSource = fs.readFileSync(path.join(root, "doctolib-api.js"), "utf8");
const harPath = "/Users/ft/Downloads/www.doctolib phillpart.fr.har";
const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
const harAutocomplete = har.log.entries.find((entry) => (
  entry.request.url.includes("/api/searchbar/autocomplete.json")
));
const harPayload = JSON.parse(harAutocomplete.response.content.text);

const requestedSearches = [];
const createdTabs = [];
const removedTabs = [];
const context = {
  AbortController,
  DOMException,
  URL,
  chrome: {
    tabs: {
      query: async () => ([{ active: true, id: 42, url: "https://www.doctolib.fr/account/appointments" }]),
      create: async ({ url }) => {
        const tab = { id: 84, url };
        createdTabs.push(tab);
        return tab;
      },
      onUpdated: {
        addListener: () => {},
        removeListener: () => {}
      },
      remove: async (tabId) => {
        removedTabs.push(tabId);
      }
    },
    scripting: {
      executeScript: async ({ args }) => {
        const searches = args[0];
        let lastPayload = { profiles: [] };
        for (const search of searches) {
          requestedSearches.push(search);
          const payload = search === "dr philippart" ? harPayload : { profiles: [] };
          payload.__superDoctolibDebug = { matchedQuery: search };
          if (payload.profiles.length) return [{ result: payload }];
          lastPayload = payload;
        }
        return [{ result: lastPayload }];
      }
    }
  },
  clearTimeout,
  console,
  fetch: async () => {
    throw new Error("direct fetch should not be used for doctor autocomplete");
  },
  setTimeout
};
vm.createContext(context);
vm.runInContext(apiSource, context);

(async () => {
  const payload = await context.SuperDoctolibApi.doctorSearch({ keyword: "philippart" });
  assert(requestedSearches.includes("dr philippart"), "doctor search should try Doctolib's lowercase dr query");
  assert(payload.profiles.length === 7, "doctor search should return the HAR profile list");
  assert(
    payload.profiles.some((profile) => profile.link === "/chirurgien-oral/paris/frederic-philippart"),
    "doctor search should include Dr Frederic PHILIPPART"
  );

  requestedSearches.length = 0;
  const cachedPayload = await context.SuperDoctolibApi.doctorSearch({ keyword: "philippart" });
  assert(cachedPayload.profiles.length === 7, "doctor search should return cached HAR profiles");
  assert(requestedSearches.length === 0, "doctor search cache should avoid repeated page execution");

  context.chrome.tabs.query = async () => [];
  context.chrome.tabs.onUpdated.addListener = (listener) => {
    setTimeout(() => listener(84, { status: "complete" }), 0);
  };

  const temporaryPayload = await context.SuperDoctolibApi.doctorSearch({ keyword: "philippart rochaix" });
  assert(createdTabs[0]?.url === "https://www.doctolib.fr/", "doctor search should create a temporary Doctolib tab when none is open");
  assert(removedTabs.includes(84), "doctor search should close the temporary Doctolib tab");
  assert(Array.isArray(temporaryPayload.profiles), "temporary Doctolib tab search should return a normalized profile array");
  console.log("doctor search ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
