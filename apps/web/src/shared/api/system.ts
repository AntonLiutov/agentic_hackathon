import { apiRequest } from "./client";

export type ApiHealth = {
  status: "ok" | "degraded";
  service: string;
  environment: string;
  dependencies: {
    database: boolean;
    redis: boolean;
  };
};

export type ApiMeta = {
  app: string;
  environment: string;
  api_port: number;
  cors_origins: string[];
};

export const systemApi = {
  getHealth: () => apiRequest<ApiHealth>("/healthz"),
  getMeta: () => apiRequest<ApiMeta>("/api/meta"),
};
