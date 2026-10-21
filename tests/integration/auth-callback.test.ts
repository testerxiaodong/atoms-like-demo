import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({exchange:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.client}));
import { GET } from '@/app/auth/callback/route';
beforeEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();mocks.client.mockResolvedValue({auth:{exchangeCodeForSession:mocks.exchange}});mocks.exchange.mockResolvedValue({error:null});});
it('exchanges a valid code and redirects to projects',async()=>{
  const response=await GET(new Request('http://localhost:3000/auth/callback?code=valid'));
  expect(mocks.exchange).toHaveBeenCalledWith('valid');expect(new URL(response.headers.get('location')!).pathname).toBe('/projects');
});
it.each(['','?error=access_denied','?error=access_denied&code=ignored'])('rejects missing codes and denied consent without an exchange: %s',async query=>{
  const response=await GET(new Request(`http://localhost:3000/auth/callback${query}`));
  expect(mocks.exchange).not.toHaveBeenCalled();expect(new URL(response.headers.get('location')!).search).toBe('?error=auth');
});
it.each(['returned','thrown'])('returns an actionable login screen on %s exchange failure',async mode=>{
  if(mode==='returned')mocks.exchange.mockResolvedValue({error:new Error('invalid code')});else mocks.exchange.mockRejectedValue(new Error('network unavailable'));
  const response=await GET(new Request('http://localhost:3000/auth/callback?code=bad'));
  expect(response.status).toBe(307);expect(new URL(response.headers.get('location')!).search).toBe('?error=auth');
});

it('uses the configured HTTPS demo origin behind the local reverse proxy',async()=>{
  vi.stubEnv('FORMA_DEMO','1');vi.stubEnv('DEMO_ORIGIN','https://demo.example.com');
  try {
    const response=await GET(new Request('http://localhost:3002/auth/callback?code=valid'));
    expect(response.headers.get('location')).toBe('https://demo.example.com/projects');
  } finally {vi.unstubAllEnvs();}
});
