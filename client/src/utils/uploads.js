export function resolveUploadUrl(path) {
  if (!path || path.startsWith("blob:") || path.startsWith("http")) {
    return path;
  }

  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const serverUrl = apiUrl.replace(/\/api\/?$/, "");

  return `${serverUrl}${path}`;
}
