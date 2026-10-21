import { afterEach, expect, it, vi } from "vitest";
import { startHeartbeat } from "@/lib/agent/heartbeat";
afterEach(() => vi.useRealTimers());
it("keeps silent generations alive and releases the timer on completion", () => {
  vi.useFakeTimers();
  const write = vi.fn(),
    abort = vi.fn();
  const stop = startHeartbeat(write, abort);
  vi.advanceTimersByTime(35000);
  expect(write).toHaveBeenCalledTimes(3);
  expect(abort).not.toHaveBeenCalled();
  stop();
  vi.advanceTimersByTime(20000);
  expect(write).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts and clears the timer when the stream is no longer writable", () => {
  vi.useFakeTimers();
  const abort = vi.fn();
  startHeartbeat(() => {
    throw Error("closed");
  }, abort);
  vi.advanceTimersByTime(40000);
  expect(abort).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
