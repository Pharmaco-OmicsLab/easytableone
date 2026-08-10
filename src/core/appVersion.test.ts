import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { APP_VERSION } from "./appVersion";

describe("APP_VERSION", () => {
  it("matches package.json", () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });
});
