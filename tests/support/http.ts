import { expect, type APIRequestContext } from "@playwright/test";
export const files = (text = "HTTP test") => ({
  "/App.tsx": `export default function App(){return <h1>${text}</h1>}`,
});
export const uuid = () => crypto.randomUUID();
export const root = "/api/projects";
export async function create(api: APIRequestContext, name = "HTTP test") {
  const r = await api.post(root, { data: { name } });
  expect(r.status()).toBe(201);
  return (await r.json()).project;
}
export async function detail(api: APIRequestContext, id: string) {
  const r = await api.get(`${root}/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
export async function save(
  api: APIRequestContext,
  id: string,
  revision = 0,
  text = "saved",
) {
  return api.post(`${root}/${id}/save`, {
    data: { revision, files: files(text) },
  });
}
export function chat(
  api: APIRequestContext,
  id: string,
  prompt: string,
  revision = 0,
  requestKey = uuid(),
) {
  return api.post(`${root}/${id}/chat`, {
    data: { prompt, revision, requestKey },
    timeout: 60000,
  });
}
export async function startSlow(api: APIRequestContext, id: string) {
  const pending = chat(
    api,
    id,
    "E2E_SLOW",
    (await detail(api, id)).project.revision,
  );
  let runId = "";
  await expect
    .poll(async () => {
      runId = (await detail(api, id)).project.active_run_id;
      return !!runId;
    })
    .toBe(true);
  return { pending, runId };
}
