const KEY = "capacity-settings";

export const CAPACITY_DEFAULTS = {
  cpuThreshold:   90,
  ramThreshold:   90,
  diskThreshold:  90,
  alertCooldownH: 1,
};

export function loadCapacitySettings() {
  try { return { ...CAPACITY_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return { ...CAPACITY_DEFAULTS }; }
}

export function saveCapacitySettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...CAPACITY_DEFAULTS, ...s })); } catch {}
}
