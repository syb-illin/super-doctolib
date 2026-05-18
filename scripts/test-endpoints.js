#!/usr/bin/env node

const DEFAULTS = {
  agendaId: "681546",
  limit: "5",
  practiceId: "184149",
  startDate: new Date().toISOString().slice(0, 10),
  timeoutMs: 8000,
  visitMotiveId: "2797494"
};

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "availabilities";
const READ_ONLY_COMMANDS = new Set(["availabilities", "practice-only", "compare"]);

main().catch((error) => {
  console.error(`ERROR ${error.name}: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (args.help || args.h) {
    printHelp();
    return;
  }

  if (!READ_ONLY_COMMANDS.has(command)) {
    throw new Error("Script lecture seule: commandes destructives interdites");
  }

  if (command === "availabilities") {
    await testAvailabilities({ full: true });
    return;
  }

  if (command === "practice-only") {
    await testAvailabilities({ full: false });
    return;
  }

  if (command === "compare") {
    await testAvailabilities({ full: true });
    await testAvailabilities({ full: false });
    return;
  }

  throw new Error(`Commande inconnue: ${command}`);
}

async function testAvailabilities({ full }) {
  const url = availabilityUrl(full);
  const response = await timedFetch(url);
  const text = await response.text();
  const json = safeJson(text);

  console.log(`\n${full ? "FULL" : "PRACTICE_ONLY"} ${response.status} ${response.statusText}`);
  console.log(url.toString());

  if (json) {
    const summary = availabilitySummary(json);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(text.slice(0, 1200));
}

function availabilityUrl(full) {
  const url = new URL("https://www.doctolib.fr/availabilities.json");
  url.searchParams.set("practice_ids", value("practice-id", DEFAULTS.practiceId));
  url.searchParams.set("telehealth", value("telehealth", "false"));
  url.searchParams.set("start_date", value("start-date", DEFAULTS.startDate));
  url.searchParams.set("limit", value("limit", DEFAULTS.limit));
  url.searchParams.set("ignore_current_draft", value("ignore-current-draft", "true"));

  if (full) {
    url.searchParams.set("visit_motive_ids", value("visit-motive-id", DEFAULTS.visitMotiveId));
    url.searchParams.set("agenda_ids", value("agenda-id", DEFAULTS.agendaId));
  }

  return url;
}

async function timedFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(value("timeout-ms", DEFAULTS.timeoutMs)));

  try {
    return await fetch(url, {
      headers: {
        "Accept": "application/json"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function availabilitySummary(payload) {
  const days = Array.isArray(payload.availabilities) ? payload.availabilities : [];
  const slots = days.flatMap((day) => Array.isArray(day.slots) ? day.slots : []);

  return {
    total: payload.total ?? slots.length,
    nextSlot: payload.next_slot || slots[0] || null,
    days: days.map((day) => ({
      date: day.date,
      slots: Array.isArray(day.slots) ? day.slots.length : 0,
      firstSlot: Array.isArray(day.slots) ? day.slots[0] || null : null
    }))
  };
}

function value(name, fallback) {
  return String(args[name] ?? args[camelCase(name)] ?? fallback);
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=");
    const nextValue = argv[index + 1];
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
    } else if (nextValue && !nextValue.startsWith("--")) {
      parsed[rawKey] = nextValue;
      index += 1;
    } else {
      parsed[rawKey] = true;
    }
  }

  return parsed;
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/test-endpoints.js availabilities [options]
  node scripts/test-endpoints.js practice-only [options]
  node scripts/test-endpoints.js compare [options]

Lecture seule: ce script appelle uniquement GET /availabilities.json.

Options:
  --practice-id 184149
  --agenda-id 681546
  --visit-motive-id 2797494
  --start-date YYYY-MM-DD
  --limit 5
  --telehealth false
  --timeout-ms 8000
`);
}
