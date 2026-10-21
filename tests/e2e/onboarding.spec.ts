import { test as anonymous, expect } from '@playwright/test';
import { test } from '../support/auth';
async function generated(page: import('@playwright/test').Page){await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading',{name:'恢复验证作品'})).toBeVisible();}
test('home submit generates immediately once; reload and revisit do not repeat it',async({page})=>{
 await page.goto('/');await expect(page).toHaveURL('http://localhost:3001/');
 let requests=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/chat'))requests++;});
 await page.getByRole('textbox',{name:'描述你的应用'}).fill('E2E_SUCCESS');await page.getByRole('button',{name:'开始构建'}).dblclick();await generated(page);
 const url=page.url();await page.reload();await generated(page);await page.goto('/');await page.goto(url);await generated(page);expect(requests).toBe(1);
});
anonymous('signup preserves an anonymous build and continues exactly once after OAuth',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('E2E_SUCCESS');await page.getByRole('button',{name:'开始构建'}).click();await expect(page).toHaveURL(/\/login\?next=build$/);
 await page.getByRole('link',{name:'创建账号'}).click();await expect(page).toHaveURL(/\/signup\?next=build$/);
 let creates=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/projects')creates++;});
 await page.getByRole('button',{name:'使用 Google 注册'}).click();await generated(page);await page.reload();await generated(page);expect(creates).toBe(1);
});
test('failed automatic generation keeps draft and allows a successful retry',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('E2E_FAIL');await page.getByRole('button',{name:'开始构建'}).click();await expect(page.getByRole('alert').filter({hasText:'连接中断'})).toBeVisible();
 const input=page.getByRole('textbox',{name:'给构建助手发消息'});await expect(input).toHaveValue('E2E_FAIL');await input.fill('E2E_SUCCESS');await input.press('Enter');await generated(page);
});
anonymous('all public examples render and support interaction without login',async({page})=>{
 await page.goto('/demo?example=timer');let frame=page.frameLocator('iframe[title="应用实时预览"]');await frame.getByRole('button',{name:'开始专注'}).click();await expect(frame.getByRole('button',{name:'暂停'})).toBeVisible();await frame.getByRole('button',{name:'重置'}).click();await expect(frame.getByRole('button',{name:'开始专注'})).toBeVisible();
 await page.goto('/demo?example=studio');frame=page.frameLocator('iframe[title="应用实时预览"]');await frame.getByRole('button',{name:'网站',exact:true}).click();await expect(frame.getByRole('heading',{name:'向海而行'})).toBeVisible();await expect(frame.getByRole('heading',{name:'林间咖啡'})).toHaveCount(0);
 await page.goto('/demo?example=dashboard');frame=page.frameLocator('iframe[title="应用实时预览"]');await frame.getByRole('button',{name:'本月'}).click();await expect(frame.getByText('48,600')).toBeVisible();
 await page.goto('/demo?example=tasks');await expect(page.frameLocator('iframe[title="应用实时预览"]').locator('body')).toContainText('小事');
});
test('example creation copies its source and rejects unknown example IDs',async({page})=>{
 const response=await page.request.post('/api/projects',{data:{name:'clone timer',exampleId:'timer'}});expect(response.status()).toBe(201);expect((await response.json()).project.working_files['/App.tsx']).toContain('留白时钟');
 expect((await page.request.post('/api/projects',{data:{name:'invalid',exampleId:'unknown'}})).status()).toBe(400);
 await page.goto('/?example=timer');await expect(page.getByRole('textbox',{name:'描述你的应用'})).toHaveValue(/专注时钟/);
});
anonymous('mobile home offers examples and real external links without overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('link',{name:'预览小事清单'})).toBeVisible();await expect(page.getByRole('button',{name:'创建新项目'})).toHaveCount(0);await expect(page.getByRole('link',{name:'参考产品 Atoms'})).toHaveAttribute('href','https://atoms.dev/zh');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('automatic generation can be stopped and a new request sent immediately',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('E2E_SLOW');await page.getByRole('button',{name:'开始构建'}).click();
 await expect(page.getByText(/端到端测试：已收到请求/)).toBeVisible();await page.getByRole('button',{name:'停止任务',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'已停止'})).toBeVisible();const input=page.getByRole('textbox',{name:'给构建助手发消息'});await input.fill('E2E_SUCCESS');await input.press('Enter');await generated(page);
});
anonymous('denied OAuth retains build intent and retries without losing the original prompt',async({page})=>{
 await page.route('http://localhost:54329/auth/v1/authorize**',route=>route.fulfill({status:302,headers:{location:'http://localhost:3001/auth/callback?error=access_denied'}}));
 await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('E2E_SUCCESS');await page.getByRole('button',{name:'开始构建'}).click();await page.getByRole('button',{name:'使用 Google 登录'}).click();
 await expect(page.getByRole('alert').filter({hasText:'登录未完成'})).toBeVisible();await page.unroute('http://localhost:54329/auth/v1/authorize**');await page.getByRole('button',{name:'使用 Google 登录'}).click();await generated(page);
});
