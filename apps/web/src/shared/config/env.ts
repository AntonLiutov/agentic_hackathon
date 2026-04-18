const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function buildWebSocketBaseUrl(httpBaseUrl: string) {
  if (httpBaseUrl.startsWith("https://")) {
    return httpBaseUrl.replace("https://", "wss://");
  }

  if (httpBaseUrl.startsWith("http://")) {
    return httpBaseUrl.replace("http://", "ws://");
  }

  return httpBaseUrl;
}

export const env = {
  apiBaseUrl,
  webSocketBaseUrl: buildWebSocketBaseUrl(apiBaseUrl),
} as const;
