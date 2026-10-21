// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Home } from "@/components/home";
import { AuthPage } from "@/components/auth-page";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: mocks }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("routes anonymous creation to login with a preserved draft", () => {
  render(<Home configured />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "我的贪吃蛇" },
  });
  fireEvent.click(screen.getByRole("button", { name: "开始构建" }));
  expect(mocks.push).toHaveBeenCalledWith("/login?next=build");
  expect(sessionStorage.getItem("forma:login-draft")).toBe("我的贪吃蛇");
});
it.each([false, true])(
  "Google login and signup preserve build intent and always request account selection: %s",
  async (signup) => {
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    render(<AuthPage configured build signup={signup} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: signup ? "使用 Google 注册" : "使用 Google 登录",
      }),
    );
    await waitFor(() =>
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      }),
    );
  },
);
it("prevents double project creation and hands off an automatic prompt", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ project: { id: "new" } }));
  vi.stubGlobal("fetch", fetcher);
  render(<Home configured signedIn />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "做一个游戏" },
  });
  const button = screen.getByRole("button", { name: "开始构建" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/projects/new"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("autostart:new")).toBe("1");
  expect(sessionStorage.getItem("prompt:new")).toBe("做一个游戏");
});
it("keeps the draft and unlocks after a create error", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ error: "连接失败" }, { status: 503 })),
  );
  render(<Home configured signedIn />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "保存需求" },
  });
  fireEvent.click(screen.getByRole("button", { name: "开始构建" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("连接失败"),
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "保存需求",
  );
  expect(
    (screen.getByRole("button", { name: "开始构建" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("shows signout errors and allows another attempt", async () => {
  mocks.signOut.mockResolvedValue({ error: new Error("network") });
  render(<Home configured signedIn />);
  fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("退出登录失败"),
  );
  expect(
    (screen.getByRole("button", { name: "退出登录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
