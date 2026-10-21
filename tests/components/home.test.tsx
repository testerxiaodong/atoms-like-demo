// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Home } from "@/components/home";
const auth = vi.hoisted(() => ({ signInWithOAuth: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
it("gates anonymous creation with a login dialog and retains the user's draft", () => {
  render(<Home configured />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "我的贪吃蛇" } });
  fireEvent.click(screen.getByRole("button", { name: "创建应用" }));
  expect(screen.getByRole("dialog", { name: "欢迎来到 Forma" })).toBeTruthy();
  expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭登录窗口" }));
  expect((input as HTMLTextAreaElement).value).toBe("我的贪吃蛇");
});
it("always requests Google's account picker and preserves the draft across OAuth", async () => {
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  render(<Home configured />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "做一个小游戏" } });
  fireEvent.click(screen.getByRole("button", { name: "注册 / 登录" }));
  fireEvent.click(screen.getByRole("button", { name: "使用 Google 注册 / 登录" }));
  await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { prompt: "select_account" } } }));
  expect(sessionStorage.getItem("forma:login-draft")).toBe("做一个小游戏");
});
it("shows signout errors and allows another attempt rather than staying busy", async () => {
  auth.signOut.mockResolvedValue({ error: new Error("network unavailable") });
  render(<Home configured signedIn />);
  fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("退出登录失败"));
  expect((screen.getByRole("button", { name: "退出登录" }) as HTMLButtonElement).disabled).toBe(false);
  expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
});
