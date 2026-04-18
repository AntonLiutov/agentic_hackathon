import { useEffect, useState } from "react";

import { ApiError } from "../../shared/api/client";
import { type ApiHealth, type ApiMeta, systemApi } from "../../shared/api/system";

type SystemStatus =
  | { state: "loading" }
  | { state: "ready"; health: ApiHealth; meta: ApiMeta }
  | { state: "error"; message: string };

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({ state: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [health, meta] = await Promise.all([systemApi.getHealth(), systemApi.getMeta()]);

        if (active) {
          setStatus({
            state: "ready",
            health,
            meta,
          });
        }
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof ApiError) {
          setStatus({
            state: "error",
            message: `Backend request failed with status ${error.status}`,
          });
          return;
        }

        setStatus({
          state: "error",
          message: "Unable to reach the backend foundation endpoints.",
        });
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return status;
}
