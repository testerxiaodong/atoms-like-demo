import { expect } from '@playwright/test';
import { test } from '../support/auth';
test.beforeEach(async ({ page }) => {
  const response=await page.request.post('/api/projects',{data:{name:`E2E ${test.info().title}`.slice(0, 80)}});
  expect(response.status()).toBe(201);
  await page.goto(`/projects/${(await response.json()).project.id}`);
});
async function send(page: import('@playwright/test').Page, prompt: string) {
  await page.getByRole('textbox', { name: '给构建助手发消息' }).fill(prompt);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toBeVisible();
}
async function success(page: import('@playwright/test').Page) {
  await send(page, 'E2E_SUCCESS');
  await expect(page.getByRole('button', { name: '停止任务', exact: true })).toHaveCount(0);
  const frame = page.frameLocator('iframe[title="应用实时预览"]');
  await expect(frame.getByRole('heading', { name: '恢复验证作品' })).toBeVisible();
  await frame.getByRole('button', { name: '计数：0' }).click();
  await expect(frame.getByRole('button', { name: '计数：1' })).toBeVisible();
}
test('failed generation restores draft, unlocks and permits a saved retry', async ({ page }) => {
  await send(page, 'E2E_FAIL');
  await expect(page.getByRole('alert').filter({ hasText: '连接中断' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '给构建助手发消息' })).toHaveValue('E2E_FAIL');
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled();
  await success(page);
  await page.reload();
  await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading', { name: '恢复验证作品' })).toBeVisible();
  const response = await page.request.get(page.url().replace('/projects/', '/api/projects/'));
  const saved = await response.json();
  expect(saved.project.revision).toBe(1);
  expect(saved.project.active_run_id).toBeNull();
  expect(saved.messages.some((m: { content: string }) => m.content.includes('连接中断'))).toBe(true);
});
test('stop terminates a long run and permits another send without refreshing', async ({ page }) => {
  await send(page, 'E2E_SLOW');
  await expect(page.getByText(/端到端测试：已收到请求/)).toBeVisible();
  await page.getByRole('button', { name: '停止任务', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '已停止' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '给构建助手发消息' })).toBeEnabled();
  await success(page);
});
test('embedded preview is visible, interactive and reloadable at mobile width', async ({ page }) => {
  await success(page);
  await page.getByRole('button', { name: '手机预览' }).click();
  const iframe = page.locator('iframe[title="应用实时预览"]');
  await expect(iframe).toBeVisible();
  expect((await iframe.boundingBox())!.width).toBeLessThanOrEqual(400);
  await page.getByRole('button', { name: '刷新预览', exact: true }).click();
  const frame=page.frameLocator('iframe[title="应用实时预览"]');
  await frame.getByRole('button', { name: '计数：0' }).click();
  await expect(frame.getByRole('button', { name: '计数：1' })).toBeVisible();
});
test('switching code and preview preserves the running app; refresh reuses compiled output', async ({ page }) => {
  await success(page);
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/preview') requests.push(request.url());
  });
  const frame = page.frameLocator('iframe[title="应用实时预览"]');
  await page.getByRole('button', { name: '代码', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(frame.getByRole('button', { name: '计数：1' })).toBeVisible();
  await page.getByRole('button', { name: '刷新预览', exact: true }).click();
  await expect(frame.getByRole('button', { name: '计数：0' })).toBeVisible();
  // Allow the old 400ms debounce to elapse so an accidental rebuild is detected.
  await page.waitForTimeout(700);
  expect(requests).toEqual([]);
});
