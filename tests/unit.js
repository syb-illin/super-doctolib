const {
  normalizedSearch,
  selectedSearchSegment,
  slugSegment,
  titleCaseName
} = require("../quick-search-core.js");

assert(slugSegment("Gynécologue médical") === "gynecologue-medical", "slugSegment removes accents");
assert(normalizedSearch("Roger RABBIT") === "roger rabbit", "normalizedSearch lowercases names");
assert(titleCaseName("ROGER RABBIT") === "Roger Rabbit", "titleCaseName formats all-caps names");

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
