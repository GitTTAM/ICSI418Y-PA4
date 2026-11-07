const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5050/api";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  const data = await response.json().catch(() => ({ message: "The server sent back an unreadable response." }));
  if (!response.ok) throw new Error(data.message || "Could not complete the request.");
  return data;
}
