import { test as anonymous, expect, type Page } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { test } from '../support/auth';
const input = (page:Page) => page.getByRole('textbox',{name:'给构建助手发消息'});
async function create(page:Page,name:string) {
  const response=await page.request.post('/api/projects',{data:{name}});
  expect(response.status()).toBe(201);
  await page.goto(`/projects/${(await response.json()).project.id}`);
  await input(page).fill(name);
}
async function send(page:Page,text:string) {
  await input(page).fill(text);
  const completed = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/chat'));
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  const response = await completed;
  expect(response.ok()).toBe(true);
  await response.finished();
  await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeVisible();
  await expect(input(page)).toBeEnabled();
}
async function state(page:Page) {
  const response=await page.request.get(page.url().replace('/projects/','/api/projects/'));
  expect(response.ok()).toBe(true);return response.json();
}
anonymous('anonymous home gates creation, retains draft and protects API',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'描述你的应用'}).fill('匿名草稿');
  await page.getByRole('button',{name:'开始构建',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?next=build$/);
  await page.getByRole('link',{name:'返回首页'}).click();
  await expect(page.getByRole('textbox',{name:'描述你的应用'})).toHaveValue('匿名草稿');
  expect((await page.request.post('/api/projects',{data:{name:'forbidden'}})).status()).toBe(401);
  await page.goto('/projects');await expect(page).toHaveURL('http://localhost:3001/');
  await page.getByRole('link',{name:'探索示例'}).click();
  await page.getByRole('link',{name:'预览小事清单'}).click();
  await expect(page.frameLocator('iframe[title="应用实时预览"]').locator('body')).toContainText('小事');
  await expect(input(page)).toBeDisabled();
});
test('create, list, reopen, greeting, Enter and multiline composition persist without empty versions',async({page})=>{
  const name=`项目生命周期 ${Date.now()}`;await create(page,name);const url=page.url();
  await expect(input(page)).toHaveValue(name);
  await input(page).fill('你好');await input(page).press('Shift+Enter');
  await expect(input(page)).toHaveValue('你好\n');
  await expect(page.getByRole('button',{name:'停止任务',exact:true})).toHaveCount(0);
  await input(page).press('Enter');
  await expect(page.getByText(/我是 Forma，你的应用开发伙伴/)).toBeVisible();
  await expect(input(page)).toBeEnabled();
  expect((await state(page)).project.revision).toBe(0);
  await page.getByRole('link',{name:'返回项目'}).click();
  await page.getByRole('link').filter({hasText:name}).click();await expect(page).toHaveURL(url);
  await expect(page.getByText(/我是 Forma，你的应用开发伙伴/)).toBeVisible();
});
test('generation streams progress, exposes multiple files and supports continued conversation',async({page})=>{
  await create(page,'生成与迭代');await input(page).fill('E2E_SUCCESS');await input(page).press('Enter');
  await expect(page.getByText(/端到端测试：已收到请求/)).toBeVisible();
  await expect(page.getByRole('button',{name:'停止任务',exact:true})).toBeVisible();
  await expect(input(page)).toBeEnabled();
  await page.getByRole('button',{name:'代码',exact:true}).click();
  const tree=page.getByRole('navigation',{name:'项目文件'});
  await expect(tree.getByRole('button',{name:'components/Counter.tsx',exact:true})).toBeVisible();
  await tree.getByRole('button',{name:'components/Counter.tsx',exact:true}).click();
  await expect(page.locator('.cm-content')).toContainText('useState');
  await send(page,'你好');expect((await state(page)).project.revision).toBe(1);
});
test('edit live code, block dirty generation, save, inspect and restore immutable versions',async({page})=>{
  await create(page,'代码与版本');await send(page,'E2E_SUCCESS');
  await page.getByRole('button',{name:'代码',exact:true}).click();
  const editor=page.locator('.cm-content');
  await editor.fill('export default function App(){return <h1>手动编辑版本</h1>}');
  await expect(page.getByText('有未保存的修改')).toBeVisible();
  await input(page).fill('不应发送');await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'预览',exact:true}).click();
  await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading',{name:'手动编辑版本'})).toBeVisible();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('.status-pill')).toHaveText('v2');
  await page.reload();await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading',{name:'手动编辑版本'})).toBeVisible();
  await page.getByRole('button',{name:'版本历史',exact:true}).click();
  await page.locator('.version-card').filter({hasText:'v1'}).click();
  await expect(input(page)).toBeDisabled();
  await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading',{name:'恢复验证作品'})).toBeVisible();
  await page.getByRole('button',{name:'回到当前版本'}).click();
  await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading',{name:'手动编辑版本'})).toBeVisible();
  await page.locator('.version-card').filter({hasText:'v1'}).click();
  await page.getByRole('button',{name:'恢复此版本'}).click();
  await expect(page.locator('.status-pill')).toHaveText('v3');
  expect((await state(page)).project.revision).toBe(3);
  await page.getByRole('button',{name:'版本历史',exact:true}).click();
  await expect(page.locator('.version-card')).toHaveCount(3);
});
test('syntax errors show inline and recover after fixing code; standalone preview works',async({page})=>{
  await create(page,'预览错误恢复');await send(page,'E2E_SUCCESS');
  await page.getByRole('button',{name:'代码',exact:true}).click();await page.locator('.cm-content').fill('export default <');
  await page.getByRole('button',{name:'预览',exact:true}).click();
  await expect(page.locator('.local-preview [role="alert"]')).toBeVisible();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('.chat-panel [role="alert"]')).toBeVisible();
  expect((await state(page)).project.revision).toBe(1);
  await page.getByRole('button',{name:'代码',exact:true}).click();await page.locator('.cm-content').fill('export default function App(){return <h1>预览已恢复</h1>}');
  await page.getByRole('button',{name:'预览',exact:true}).click();await expect(page.frameLocator('iframe[title="应用实时预览"]').getByRole('heading',{name:'预览已恢复'})).toBeVisible();
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.status-pill')).toHaveText('v2');
  const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'独立预览'}).click();const popup=await popupPromise;
  await expect(popup.getByRole('heading',{name:'预览已恢复'})).toBeVisible();await popup.close();
});
test('a different user cannot read or modify an owned project',async({page,browser})=>{
  await create(page,'隔离验证');const url=page.url(),api=url.replace('/projects/','/api/projects/');
  const other=await browser.newContext();
  try {
    const auth=createServerClient('http://localhost:54329','local-test-key',{cookies:{getAll:()=>[],setAll:async values=>{await other.addCookies(values.map(({name,value})=>({name,value,domain:'localhost',path:'/',sameSite:'Lax' as const})));}}});
    const {error}=await auth.auth.signInWithPassword({email:'other@example.test',password:'local-e2e-only'});expect(error).toBeNull();
    expect((await other.request.get(api)).status()).toBe(404);
    expect((await other.request.post(`${api}/save`,{data:{revision:0,files:{'/App.tsx':'export default function App(){return null}'}}})).status()).toBe(404);
    const otherPage=await other.newPage();await otherPage.goto(url);await expect(otherPage.getByText('404', {exact:true})).toBeVisible();
    expect((await state(page)).project.revision).toBe(0);
  }finally{await other.close();}
});
test('logout clears the app session and protected pages require login again',async({page})=>{
  await create(page,'退出测试');const url=page.url();await page.getByRole('link',{name:'返回项目'}).click();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await expect(page.getByRole('link',{name:'登录',exact:true})).toBeVisible();
  await page.goto(url);await expect(page).toHaveURL('http://localhost:3001/');
  expect((await page.request.get('/api/projects')).status()).toBe(401);
});

anonymous('Google login requests account selection and keeps the draft before redirect',async({page})=>{
  await page.route('http://localhost:54329/auth/v1/authorize**',route=>route.fulfill({contentType:'text/html',body:'<h1>测试授权入口</h1>'}));
  await page.goto('/');await page.getByRole('textbox',{name:'描述你的应用'}).fill('登录后继续的需求');
  await page.getByRole('link',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'使用 Google 登录'}).click();
  await expect(page).toHaveURL(/\/auth\/v1\/authorize/);
  const url=new URL(page.url());expect(url.searchParams.get('provider')).toBe('google');expect(url.searchParams.get('prompt')).toBe('select_account');
  expect(url.searchParams.get('redirect_to')).toBe('http://localhost:3001/auth/callback');
  // Return to the app origin to verify draft restoration without pretending to authenticate Google.
  await page.goto('/');await expect(page.getByRole('textbox',{name:'描述你的应用'})).toHaveValue('登录后继续的需求');
});
test('a stale tab cannot overwrite a newly saved version and retains its unsaved work',async({page,context})=>{
  await create(page,'并发编辑');await send(page,'E2E_SUCCESS');
  const stale=await context.newPage();await stale.goto(page.url());
  for(const tab of [page,stale]) await tab.getByRole('button',{name:'代码',exact:true}).click();
  await stale.locator('.cm-content').fill('export default function App(){return <h1>旧页修改</h1>}');
  await expect(stale.getByText('有未保存的修改')).toBeVisible();
  await page.locator('.cm-content').fill('export default function App(){return <h1>最新已保存</h1>}');
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.status-pill')).toHaveText('v2');
  await stale.getByRole('button',{name:'保存',exact:true}).click();
  await expect(stale.getByRole('alert').filter({hasText:'项目已有新版本'})).toBeVisible();
  await expect(stale.locator('.cm-content')).toContainText('旧页修改');
  const saved=await state(page);expect(saved.project.revision).toBe(2);expect(saved.project.working_files['/App.tsx']).toContain('最新已保存');
  await stale.close();
});
