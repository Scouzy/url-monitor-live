export async function checkUrl(url) {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    const elapsed = Math.round(performance.now() - start);
    return {
      isUp: true,
      responseTime: elapsed,
      status: resp.type === "opaque" ? "CORS" : resp.status,
    };
  } catch (e) {
    const elapsed = Math.round(performance.now() - start);
    if (e.name === "AbortError") {
      return { isUp: false, responseTime: elapsed, status: "Timeout" };
    }
    return { isUp: false, responseTime: elapsed, status: "Erreur" };
  }
}
