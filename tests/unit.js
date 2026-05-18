const {
  normalizedSearch,
  selectedSearchSegment,
  slugSegment,
  titleCaseName
} = require("../quick-search-core.js");

assert(slugSegment("Gynécologue médical") === "gynecologue-medical", "slugSegment removes accents");
assert(normalizedSearch("Franck THOMAS") === "franck thomas", "normalizedSearch lowercases names");
assert(titleCaseName("FRANCK THOMAS") === "Franck Thomas", "titleCaseName formats all-caps names");

const select = {
  value: "",
  options: [
    { value: "gynecologue-medical-et-obstetrique", disabled: true, hidden: true },
    { value: "dentiste", disabled: false, hidden: false }
  ]
};
assert(
  selectedSearchSegment(select, "", "medecin-generaliste") === "dentiste",
  "selectedSearchSegment skips disabled defaults"
);

console.log("unit ok");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
