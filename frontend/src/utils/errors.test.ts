import { describe, expect, it } from "vitest";
import {
  getApiErrorMessage,
  getErrorMessage,
  getErrorName,
  getResponseData,
  getResponseStatus,
} from "./errors";

const axiosLike = (status: number, data: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });

describe("error helpers", () => {
  it("reads messages and names", () => {
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(getErrorMessage("nope", "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(getErrorName(new DOMException("x", "AbortError"))).toBe("AbortError");
    expect(getErrorName(null)).toBeUndefined();
  });

  it("reads axios-style responses", () => {
    const error = axiosLike(404, { message: "Not here" });
    expect(getResponseStatus(error)).toBe(404);
    expect(getResponseData(error)).toEqual({ message: "Not here" });
    expect(getResponseStatus(new Error("x"))).toBeUndefined();
    expect(getResponseData(axiosLike(400, '{"error":"Bad name"}'))).toEqual({
      error: "Bad name",
    });
  });

  it("prefers the backend's message for API errors", () => {
    expect(getApiErrorMessage(axiosLike(400, { message: "Bad" }), "f")).toBe("Bad");
    expect(getApiErrorMessage(axiosLike(500, { error: "Oops" }), "f")).toBe("Oops");
    expect(getApiErrorMessage(axiosLike(500, "html"), "f")).toBe(
      "Request failed with status code 500"
    );
    expect(getApiErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
