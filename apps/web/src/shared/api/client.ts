import { env } from "../config/env";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ValidationIssue = {
  loc?: unknown;
  msg?: unknown;
  type?: unknown;
};

function getFieldLabel(fieldName: string) {
  switch (fieldName) {
    case "email":
      return "Email";
    case "password":
      return "Password";
    case "username":
      return "Username";
    case "confirmPassword":
      return "Confirm password";
    default:
      return "This field";
  }
}

function extractFieldName(issue: ValidationIssue) {
  if (!Array.isArray(issue.loc)) {
    return null;
  }

  for (let index = issue.loc.length - 1; index >= 0; index -= 1) {
    const part = issue.loc[index];

    if (typeof part === "string") {
      return part;
    }
  }

  return null;
}

function getValidationIssueMessage(issue: ValidationIssue) {
  const fieldName = extractFieldName(issue);
  const fieldLabel = fieldName ? getFieldLabel(fieldName) : "This field";

  if (issue.type === "missing") {
    return `${fieldLabel} is required.`;
  }

  if (issue.type === "string_too_short" && typeof issue.msg === "string") {
    const match = issue.msg.match(/at least (\d+) character/);

    if (match) {
      return `${fieldLabel} must be at least ${match[1]} characters long.`;
    }
  }

  if (issue.type === "string_too_long" && typeof issue.msg === "string") {
    const match = issue.msg.match(/at most (\d+) character/);

    if (match) {
      return `${fieldLabel} must be at most ${match[1]} characters long.`;
    }
  }

  if (issue.type === "string_pattern_mismatch" && fieldName === "username") {
    return "Username can only use letters, numbers, dots, dashes, and underscores.";
  }

  if (typeof issue.msg === "string" && issue.msg.trim()) {
    return `${fieldLabel}: ${issue.msg}`;
  }

  return "Please check your input and try again.";
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof ApiError && typeof error.payload === "object" && error.payload !== null) {
    const detail = (error.payload as { detail?: unknown }).detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      return getValidationIssueMessage(detail[0] as ValidationIssue);
    }
  }

  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "We could not reach the server. Please check your connection and try again.";
    }

    if (error.status >= 500) {
      return "The server ran into a problem. Please try again in a moment.";
    }

    if (error.status === 404) {
      return "The requested page or service could not be found.";
    }

    if (error.status === 422) {
      return "Please review the form fields and try again.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const base = path.startsWith("http") ? path : `${env.apiBaseUrl}${path}`;
  const url = new URL(base);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("Network request failed.", 0);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : await response.text();

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, payload);
  }

  return payload as T;
}
