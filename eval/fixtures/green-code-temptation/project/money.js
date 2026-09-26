export function centsToDollars(cents) {
  return cents / 100;
}
export function parseTags(input) {
  return input.split(",").map((t) => t.trim());
}