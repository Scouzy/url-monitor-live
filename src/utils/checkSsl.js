export async function checkSsl(url) {
  if (!url.startsWith('https://')) return { notHttps: true };
  try {
    const res = await fetch(`/api/ssl-check?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}
