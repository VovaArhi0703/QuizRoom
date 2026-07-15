const values = new Map();
const inFlight = new Map();
const versions = new Map();
const DEFAULT_TTL_MS = 120_000;
const DEFAULT_STALE_TTL_MS = 10 * 60_000;

function getVersion(key) {
  return versions.get(key) || 0;
}

async function getCachedData(key, loader, ttlMs = DEFAULT_TTL_MS) {
  const cached = values.get(key);

  if (cached?.expiresAt > Date.now()) {
    return cached.data;
  }

  const version = getVersion(key);
  const currentRequest = inFlight.get(key);

  if (currentRequest?.version === version) {
    return currentRequest.promise;
  }

  const request = Promise.resolve()
    .then(loader)
    .then((data) => {
      // A mutation may invalidate the cache while this request is still loading.
      // In that case return its result to the original caller, but do not cache it.
      if (version === getVersion(key)) {
        values.set(key, {
          data,
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + DEFAULT_STALE_TTL_MS,
        });
      }
      return data;
    })
    .catch((error) => {
      if (version === getVersion(key) && cached?.staleUntil > Date.now()) {
        return cached.data;
      }

      throw error;
    })
    .finally(() => {
      if (inFlight.get(key)?.promise === request) {
        inFlight.delete(key);
      }
    });

  inFlight.set(key, { promise: request, version });
  return request;
}

function setCachedData(key, data, ttlMs = DEFAULT_TTL_MS) {
  values.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    staleUntil: Date.now() + DEFAULT_STALE_TTL_MS,
  });
}

function invalidateCachedData(...prefixes) {
  const keys = new Set([...values.keys(), ...inFlight.keys()]);

  for (const key of keys) {
    if (prefixes.length === 0 || prefixes.some((prefix) => key.startsWith(prefix))) {
      versions.set(key, getVersion(key) + 1);
      inFlight.delete(key);
      values.delete(key);
    }
  }
}

module.exports = { getCachedData, invalidateCachedData, setCachedData };
