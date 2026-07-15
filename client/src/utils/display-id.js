export function getDisplayId(id) {
  const value = String(id || "");

  if (!value) {
    return "000000";
  }

  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000000;
  }

  return String(hash).padStart(6, "0");
}
