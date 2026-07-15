import { http } from "./http";

const responseCache = new Map();
const inFlightRequests = new Map();
const versions = new Map();

function getVersion(key) {
  return versions.get(key) || 0;
}

function getCacheKey(url) {
  const token = localStorage.getItem("quizroom_token") || "guest";
  return `${token}:${url}`;
}

export function getCached(url, options = {}) {
  const ttl = options.ttl ?? 120_000;
  const key = getCacheKey(url);

  if (options.force) {
    versions.set(key, getVersion(key) + 1);
    responseCache.delete(key);
  }

  const cached = responseCache.get(key);

  if (!options.force && cached?.expiresAt > Date.now()) {
    return Promise.resolve(cached.data);
  }

  const version = getVersion(key);
  const currentRequest = inFlightRequests.get(key);

  if (!options.force && currentRequest?.version === version) {
    return currentRequest.promise;
  }

  const request = http
    .get(url)
    .then(({ data }) => {
      if (version === getVersion(key)) {
        responseCache.set(key, { data, expiresAt: Date.now() + ttl });
      }
      return data;
    })
    .finally(() => {
      if (inFlightRequests.get(key)?.promise === request) {
        inFlightRequests.delete(key);
      }
    });

  inFlightRequests.set(key, { promise: request, version });
  return request;
}

export function invalidateCached(url) {
  const keys = new Set([...responseCache.keys(), ...inFlightRequests.keys()]);

  for (const key of keys) {
    if (!url || key.endsWith(`:${url}`)) {
      versions.set(key, getVersion(key) + 1);
      responseCache.delete(key);
      inFlightRequests.delete(key);
    }
  }
}
