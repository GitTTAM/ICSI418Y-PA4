const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5050/api";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  const data = await response.json().catch(() => ({ message: "We couldn't read the server's reply. Try again." }));
  if (!response.ok) throw new Error(data.message || "That didn't go through. Try again.");
  return data;
}
