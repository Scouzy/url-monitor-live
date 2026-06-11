const KEY = "capacity-todos";
const MAX  = 500;

export function loadTodos() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

export function saveTodos(todos) {
  try {
    localStorage.setItem(KEY, JSON.stringify(todos.slice(-MAX)));
    window.dispatchEvent(new CustomEvent("todos-changed", { detail: todos }));
  } catch {}
}

export function makeTodo({ title, description = "", type = "manual", priority = "medium", source = "", status = "todo" }) {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    type,
    status,
    priority,
    source,
    createdAt: Date.now(),
    doneAt: null,
  };
}

export function updateTodo(todos, id, patch) {
  const next = todos.map(t => {
    if (t.id !== id) return t;
    const updated = { ...t, ...patch };
    if (patch.status === "done" && t.status !== "done") updated.doneAt = Date.now();
    if (patch.status && patch.status !== "done") updated.doneAt = null;
    return updated;
  });
  saveTodos(next);
  return next;
}

export function deleteTodo(todos, id) {
  const next = todos.filter(t => t.id !== id);
  saveTodos(next);
  return next;
}
