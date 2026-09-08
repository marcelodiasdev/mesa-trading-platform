import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

class InertEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readyState = InertEventSource.CONNECTING;

  constructor(url: string | URL) {
    this.url = String(url);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.readyState = InertEventSource.CLOSED;
  }
}

Object.defineProperty(globalThis, "EventSource", {
  writable: true,
  configurable: true,
  value: InertEventSource,
});

afterEach(() => {
  cleanup();
});
