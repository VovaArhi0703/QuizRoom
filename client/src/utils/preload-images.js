function preloadImage(url, timeoutMs) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = async (loaded) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;

      if (loaded && typeof image.decode === "function") {
        await image.decode().catch(() => {});
      }

      resolve({ loaded, url });
    };

    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    image.decoding = "async";
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;

    if (image.complete) {
      finish(image.naturalWidth > 0);
    }
  });
}

export async function preloadImageUrls(urls, { timeoutMs = 45_000 } = {}) {
  const uniqueUrls = [...new Set((urls || []).filter(Boolean))];

  if (uniqueUrls.length === 0) {
    return [];
  }

  return Promise.all(uniqueUrls.map((url) => preloadImage(url, timeoutMs)));
}
