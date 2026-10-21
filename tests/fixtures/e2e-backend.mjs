// Local-only Supabase HTTP test double. SQL/RPCs run against real project migrations.
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export async function startBackend() {
  const db = new PGlite();
  const uid = '00000000-0000-4000-8000-000000000001';
  await db.exec(`create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${uid}');`);
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid}'`);
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:uid,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})}.test-signature`;
  const otherId = '00000000-0000-4000-8000-000000000002';
  await db.exec(`reset role;insert into auth.users values('${otherId}');set role authenticated;`);
  const otherToken = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:otherId,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})}.test-signature`;
  const authCodes = new Map();
  const commitFaults = new Map();
  const rpcArgs = {
    delete_project: ['p_project_id'], create_project: ['p_name','p_files'], rename_project: ['p_project_id','p_name'],
    start_run: ['p_project_id','p_request_key','p_revision','p_prompt'],
    fail_run: ['p_project_id','p_run_id','p_error'],
    commit_version: ['p_project_id','p_revision','p_files','p_summary','p_source','p_run_id','p_restored_from','p_steps'],
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {res.statusCode=204;res.end();return;}
    const send = (status, value) => {res.statusCode=status;res.end(JSON.stringify(value));};
    try {
      const url = new URL(req.url, 'http://localhost:54329');
      let raw=''; for await (const chunk of req) raw+=chunk;
      const body=raw ? JSON.parse(raw) : {};
      if (url.pathname === '/auth/v1/authorize') {
        const redirect=url.searchParams.get('redirect_to'), challenge=url.searchParams.get('code_challenge');
        if (redirect !== 'http://localhost:3001/auth/callback' || !challenge || url.searchParams.get('code_challenge_method')!=='s256') return send(400,{message:'Invalid test OAuth request'});
        const code=randomUUID();authCodes.set(code,{challenge,expires:Date.now()+60000});
        res.statusCode=302;res.setHeader('Location',`${redirect}?code=${code}`);res.end();return;
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
        const grant=authCodes.get(body.auth_code);authCodes.delete(body.auth_code);
        const challenge=createHash('sha256').update(body.code_verifier || '').digest('base64url');
        if (!grant || grant.expires<Date.now() || challenge!==grant.challenge) return send(400,{code:'bad_code_verifier',message:'Invalid or expired authorization code'});
        return send(200,{access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
      }
      if (url.pathname === '/auth/v1/token') {
        if (!['e2e@example.test','other@example.test'].includes(body.email) || body.password !== 'local-e2e-only') return send(400,{message:'Invalid test credentials'});
        return send(200,{access_token:body.email==='other@example.test'?otherToken:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:body.email==='other@example.test'?{...user,id:otherId,email:body.email}:user});
      }
      if (![token,otherToken].some(t=>req.headers.authorization === `Bearer ${t}`)) return send(401,{message:'Test authentication required'});
      const currentId = req.headers.authorization===`Bearer ${otherToken}` ? otherId : uid;
      const query = (sql, values) => db.transaction(async tx => {await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[currentId]);return tx.query(sql,values);});
      if (url.pathname === '/auth/v1/user') return send(200,{...user,id:currentId});
      if (url.pathname === '/auth/v1/logout') return send(200,{});
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name=url.pathname.split('/').at(-1), args=rpcArgs[name];
        if (!args) return send(404,{code:'PGRST202',message:'Unknown test RPC'});
        if (name==='commit_version' && commitFaults.has(body.p_project_id)) {
          const mode=commitFaults.get(body.p_project_id);commitFaults.delete(body.p_project_id);
          return mode==='network' ? send(503,{message:'fetch failed'}) : send(404,{code:'PGRST202',message:'test missing function'});
        }
        const values=args.map(key => body[key] === undefined ? (key==='p_steps' ? [] : null) : body[key]);
        const result=await query(`select to_jsonb(${name}(${args.map((_,i)=>`$${i+1}`).join(',')})) as result`,values.map(v => typeof v==='object' && v!==null ? JSON.stringify(v) : v));
        if(name==='create_project' && ['HTTP_DB_NETWORK','HTTP_DB_MISSING'].includes(body.p_name))
          commitFaults.set(result.rows[0].result.id,body.p_name==='HTTP_DB_NETWORK'?'network':'missing');
        return send(200,result.rows[0].result);
      }
      const table=url.pathname.split('/').at(-1);
      if (!['projects','messages','runs','versions'].includes(table) || req.method!=='GET') return send(404,{message:'Not found'});
      const values=[], filters=[];
      for (const [key,value] of url.searchParams) {
        if (['select','order','limit'].includes(key)) continue;
        if (!['id','project_id','owner_id','run_id'].includes(key) || !value.startsWith('eq.')) throw new Error('Unsupported filter');
        values.push(value.slice(3));filters.push(`${key}=$${values.length}`);
      }
      const select=url.searchParams.get('select') || '*';
      if (!/^(\*|[a-z_,]+)$/.test(select)) throw new Error('Invalid columns');
      let sql=`select ${select} from ${table}`+(filters.length ? ` where ${filters.join(' and ')}`:'');
      const order=url.searchParams.get('order');
      if (order) {const [column,direction]=order.split('.');if (!['created_at','updated_at','number'].includes(column)||!['asc','desc'].includes(direction)) throw new Error('Invalid sort');sql+=` order by ${column} ${direction}`;}
      const limit=url.searchParams.get('limit');if (limit && /^\d+$/.test(limit)) sql+=` limit ${Math.min(Number(limit),500)}`;
      const {rows}=await query(sql,values);
      if (req.headers.accept?.includes('vnd.pgrst.object')) return rows.length===1 ? send(200,rows[0]) : send(406,{code:'PGRST116',message:'Expected one row'});
      return send(200,rows);
    } catch(error) {send(400,{code:error.code ?? 'TEST_ERROR',message:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(54329,'localhost',resolve);});
  return async () => {await new Promise(resolve=>server.close(resolve));await db.close();};
}
