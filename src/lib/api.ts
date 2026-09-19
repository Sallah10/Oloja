import { Platform } from "react-native";

import { ApiError } from "./errors";
import { mockRequest } from "./mock-api";
import {
  bootOffline,
  captureLists,
  enqueueAndSimulate,
  hasMirror,
  localRead,
  requestSync,
  setOnline,
} from "./offline";
import { CustomerSummary, ProductSummary, TransactionSummary } from "./types";

// Demo mode: EXPO_PUBLIC_USE_MOCK_API=true answers every request with local
// fake data (see mock-api.ts), so the app is fully clickable before the phone
// can reach the real API. Set it to false once the network works.
export const isMockMode = process.env.EXPO_PUBLIC_USE_MOCK_API === "true";

// The API client has two layers:
//  - rawRequest(): a plain fetch + Bearer token. Never falls back, never
//    simulates. Used by the offline sync (which must talk to the REAL server)
//    and by the top of api().
//  - api(): the screen-facing layer. It tries the network first; if the
//    network is unreachable it serves reads from the local mirror and queues
//    supported mutations (sale / payment / restock) into the outbox, so the
//    app keeps working on the shop floor until the connection returns. See
//    offline.ts for the mirror/outbox design.
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function hasAuthToken(): boolean {
  return authToken !== null;
}

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (Platform.OS === "web") return "http://localhost:4000";
  throw new ApiError(
    0,
    "Set EXPO_PUBLIC_API_URL in a .env file to reach the API from this device",
  );
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

// A fresh key per logical mutation keeps the outbox safe to replay: the
// server stores key -> response, so a send that reached it but whose reply got
// lost can never double-apply. Good enough uniqueness for a shop ledger (no
// security need); avoids depending on crypto.randomUUID in Hermes.
export function freshIdempotencyKey(): string {
  const rand = () => Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

export async function rawRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const baseUrl = resolveBaseUrl();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  // A throw here is a network-level failure (no response at all). That is NOT
  // an ApiError, and callers use that distinction to decide "go offline".
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return parsed as T;
}

function captureOnSuccess(path: string, result: unknown): void {
  if (path === "/api/products") {
    captureLists(result as { products: ProductSummary[] }, null, null);
  } else if (path === "/api/customers") {
    captureLists(null, result as { customers: CustomerSummary[] }, null);
  } else if (path === "/api/transactions") {
    captureLists(null, null, result as { transactions: TransactionSummary[] });
  }
}

let bootPromise: Promise<void> | null = null;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (isMockMode) return mockRequest<T>(path, options);
  bootPromise ??= bootOffline();
  await bootPromise;

  const method = options.method ?? "GET";
  const isMutation = method !== "GET";

  let body = options.body;
  let idempotencyKey: string | undefined;
  if (isMutation && body && typeof body === "object") {
    const existing = (body as Record<string, unknown>).idempotencyKey;
    idempotencyKey =
      typeof existing === "string" && existing.length >= 8 ? existing : freshIdempotencyKey();
    body = { ...(body as object), idempotencyKey };
  }

  try {
    const result = await rawRequest<T>(method, path, body);
    setOnline(true);
    captureOnSuccess(path, result);
    if (isMutation && authToken) void requestSync(rawRequest);
    return result;
  } catch (err) {
    if (err instanceof ApiError) {
      // The server answered (4xx/5xx): a real refusal, not a dead network.
      throw err;
    }

    // Network-level failure -> offline.
    setOnline(false);

    if (!isMutation) {
      const cached = localRead(path);
      if (cached !== undefined) return cached as T;
    }

    if (isMutation && hasMirror() && idempotencyKey && body && typeof body === "object") {
      // v1 offline writes are the shop-floor ones; simulateMutation() throws a
      // clear "needs a connection" ApiError for everything else (and pushes
      // nothing to the outbox when it does).
      const simulated = enqueueAndSimulate(method, path, body as Record<string, unknown>, idempotencyKey);
      return simulated as T;
    }

    throw err;
  }
}