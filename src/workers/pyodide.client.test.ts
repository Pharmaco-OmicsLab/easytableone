import { afterEach, describe, expect, it, vi } from "vitest";
import { PyodideClient } from "./pyodide.client";

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() { MockWorker.instances.push(this); }
  postMessage(message: { id: number; fnName: string }) {
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: message.fnName === "check_ready" ? true : null } } as MessageEvent));
  }
  terminate() { this.terminated = true; }
}

describe("PyodideClient worker recovery", () => {
  afterEach(() => { vi.unstubAllGlobals(); MockWorker.instances = []; });

  it("rejects pending calls when the worker errors", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const client = new PyodideClient();
    const pending = client.call("hanging_call");
    MockWorker.instances[0].onerror?.({ message: "worker crashed", preventDefault() {} } as ErrorEvent);
    await expect(pending).rejects.toThrow("Analysis engine stopped: worker crashed");
  });

  it("recreates the worker on restart and resolves readiness", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const client = new PyodideClient();
    await expect(client.restart()).resolves.toBe(true);
    expect(MockWorker.instances).toHaveLength(2);
    expect(MockWorker.instances[0].terminated).toBe(true);
  });

  it("does not cache a failed initialization", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const client = new PyodideClient();
    vi.spyOn(client, "call").mockRejectedValueOnce(new Error("temporary init failure")).mockResolvedValue(true);
    await expect(client.isReady()).rejects.toThrow("temporary init failure");
    await expect(client.isReady()).resolves.toBe(true);
  });
});
