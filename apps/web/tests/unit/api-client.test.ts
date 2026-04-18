import { describe, expect, it } from "vitest";

import { ApiError, getApiErrorMessage } from "../../src/shared/api/client";

describe("getApiErrorMessage", () => {
  it("returns backend detail strings when available", () => {
    const error = new ApiError("Request failed with status 401", 401, {
      detail: "Invalid email or password.",
    });

    expect(getApiErrorMessage(error)).toBe("Invalid email or password.");
  });

  it("translates validation payloads into friendly field guidance", () => {
    const error = new ApiError("Request failed with status 422", 422, {
      detail: [
        {
          type: "string_too_short",
          loc: ["body", "password"],
          msg: "String should have at least 8 characters",
        },
      ],
    });

    expect(getApiErrorMessage(error)).toBe("Password must be at least 8 characters long.");
  });

  it("returns a human message for network failures", () => {
    const error = new ApiError("Network request failed.", 0);

    expect(getApiErrorMessage(error)).toBe(
      "We could not reach the server. Please check your connection and try again.",
    );
  });
});
