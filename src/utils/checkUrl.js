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

export async function checkMultiStep(monitoring) {
  const start = performance.now();
  try {
    const resp = await fetch("/api/multi-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(monitoring),
      signal: AbortSignal.timeout(60000),
    });
    const data = await resp.json();
    const elapsed = Math.round(performance.now() - start);
    if (data.error) {
      return { isUp: false, responseTime: elapsed, status: "Erreur", steps: [], error: data.error };
    }
    /* Code 622 = changement visuel détecté par comparaison d'images */
    const has622 = (data.steps || []).some(s => s.error_code === 622);
    return {
      isUp: data.ok,
      responseTime: elapsed,
      status: has622 ? "622" : (data.ok ? "OK" : "Échec"),
      steps: data.steps || [],
      error_code: data.error_code || (has622 ? 622 : null),
    };
  } catch (e) {
    const elapsed = Math.round(performance.now() - start);
    return { isUp: false, responseTime: elapsed, status: e.name === "TimeoutError" ? "Timeout" : "Erreur", steps: [] };
  }
}
