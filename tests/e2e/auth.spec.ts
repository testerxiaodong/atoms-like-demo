import { test, expect, type Page } from '@playwright/test';
async function login(page:Page) {
  await page.getByRole('button',{name:'注册 / 登录',exact:true}).click();
  await page.getByRole('button',{name:'使用 Google 注册 / 登录'}).click();
}
test('OAuth callback exchanges PKCE code, sets session and restores draft',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('OAuth 后继续创建的作品');
  let callback='';page.on('request',req=>{if(req.isNavigationRequest()&&req.url().includes('/auth/callback?code='))callback=req.url();});
  await login(page);
  await expect(page).toHaveURL('http://localhost:3001/projects');
  await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'描述你的应用'})).toHaveValue('OAuth 后继续创建的作品');
  expect((await page.request.get('/api/projects')).status()).toBe(200);
  await page.reload();await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.getByRole('button',{name:'注册 / 登录',exact:true})).toBeVisible();
  expect(callback).toContain('code=');await page.goto(callback);
  await expect(page).toHaveURL('http://localhost:3001/?error=auth');
  expect((await page.request.get('/api/projects')).status()).toBe(401);
});
test('rejected authorization restores draft, shows error and permits another login',async({page})=>{
  await page.route('http://localhost:54329/auth/v1/authorize**',route=>route.fulfill({status:302,headers:{location:'http://localhost:3001/auth/callback?code=expired-test-code'}}));
  await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('失败后保留的需求');await login(page);
  await expect(page).toHaveURL('http://localhost:3001/?error=auth');
  await expect(page.getByRole('alert').filter({hasText:'登录未完成'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'描述你的应用'})).toHaveValue('失败后保留的需求');
  expect((await page.request.get('/api/projects')).status()).toBe(401);
  await page.unroute('http://localhost:54329/auth/v1/authorize**');await login(page);
  await expect(page).toHaveURL('http://localhost:3001/projects');await expect(page.getByRole('textbox',{name:'描述你的应用'})).toHaveValue('失败后保留的需求');
});
test('missing code and cancelled consent remain signed out with a retryable error',async({page})=>{
  for(const suffix of ['', '?error=access_denied']) {
    await page.goto(`/auth/callback${suffix}`);await expect(page).toHaveURL('http://localhost:3001/?error=auth');
    await expect(page.getByRole('alert').filter({hasText:'登录未完成'})).toBeVisible();
    expect((await page.request.get('/api/projects')).status()).toBe(401);
  }
});
