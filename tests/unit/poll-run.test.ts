import { afterEach, expect, it, vi } from "vitest";
import { pollRun } from "@/lib/agent/poll-run";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("polls cumulative steps without duplicates and delivers completion", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ run: { status: "running" }, steps: ["one"] }),
    )
    .mockResolvedValueOnce(
      Response.json({
        run: { status: "completed" },
        steps: ["one", "two"],
        result: {
          project: { id: "p" },
          version: null,
          message: { content: "done" },
        },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const event = vi.fn();
  const task = pollRun("p", "r", new AbortController().signal, event);
  await vi.runAllTimersAsync();
  await task;
  expect(event.mock.calls.map(([e]) => e.type)).toEqual([
    "run",
    "step",
    "step",
    "done",
  ]);
});
it("aborts immediately while waiting for the next poll", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ run: { status: "running" }, steps: [] }),
      ),
  );
  const controller = new AbortController();
  const task = pollRun("p", "r", controller.signal, () => {});
  const rejection = expect(task).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(10);
  controller.abort();
  await rejection;
});
it("surfaces failed generation rather than waiting indefinitely", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          run: { status: "failed", error: "stopped" },
          steps: [],
        }),
      ),
  );
  await expect(
    pollRun("p", "r", new AbortController().signal, () => {}),
  ).rejects.toThrow("stopped");
});
