import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

test('账户、题库、回答、收藏和持久化完整流程',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'qa-path-'));const port=32187;let child;
  async function start(){child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_PATH:join(dir,'test.db')},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('服务未启动');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('启动超时')),10000);timer.unref();})]);}
  async function stop(){const exited=once(child,'exit');child.kill();await exited;}
  t.after(async()=>{if(child?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});});await start();
  let cookie='';async function req(path,data,auth=true){const response=await fetch(`http://127.0.0.1:${port}${path}`,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};}
  const initial=await req('/api/questions');assert.equal(initial.status,200);assert.equal(initial.data.questions.length,12);
  assert.equal((await req('/api/questions',{title:'未登录用户发布问题'})).status,401);
  assert.equal((await req('/api/register',{name:'测试人',email:'bad',password:'password123'})).status,400);
  const user=await req('/api/register',{name:'测试同学',email:'test@example.com',password:'password123'});assert.equal(user.status,200);assert.match(user.cookie,/HttpOnly/);cookie=user.cookie.split(';')[0];
  assert.equal((await req('/api/me')).data.user.name,'测试同学');
  assert.equal((await req('/api/register',{name:'测试人',email:'test@example.com',password:'password123'})).status,409);
  const created=await req('/api/questions',{title:'如何验证测试数据隔离？',content:'请解释并行运行接口自动化时的数据隔离方式。',answer:'每个测试创建独立数据，使用唯一 ID，在清理阶段删除关联记录。',category:'接口测试',difficulty:'中等',tags:'自动化,测试数据'});assert.equal(created.status,201);const id=created.data.id;
  assert.equal((await req(`/api/questions/${id}/replies`,{body:'独立数据能避免并行测试之间互相影响。'})).status,201);
  assert.equal((await req(`/api/questions/${id}`)).data.replies.length,1);
  assert.equal((await req(`/api/questions/${id}/bookmark`,{})).data.bookmarked,true);
  assert.equal((await req('/api/questions')).data.questions.find(q=>q.id===id).bookmarked,1);
  assert.equal((await req(`/api/questions/${id}/bookmark`,{})).data.bookmarked,false);
  assert.equal((await req(`/api/questions/${id}/replies`,{body:'短'})).status,400);
  const csrf=await fetch(`http://127.0.0.1:${port}/api/logout`,{method:'POST',headers:{Origin:'https://evil.example',Cookie:cookie}});assert.equal(csrf.status,403);
  assert.equal((await req('/api/logout',{})).status,200);assert.equal((await req('/api/me')).data.user,null);
  assert.equal((await req('/api/login',{email:'test@example.com',password:'wrong-password'})).status,401);
  const login=await req('/api/login',{email:'test@example.com',password:'password123'});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];
  await stop();await start();assert.equal((await req(`/api/questions/${id}`)).data.replies.length,1);assert.equal((await req('/api/me')).data.user.name,'测试同学');
  assert.equal((await req('/api/questions/99999')).status,404);
  const page=await fetch(`http://127.0.0.1:${port}/`);assert.equal(page.status,200);assert.match(await page.text(),/QA Path/);
  // Forwarded client headers must not bypass limits in the default direct mode.
  let denied;for(let i=1;i<=31;i++)denied=await fetch(`http://127.0.0.1:${port}/api/login`,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':`198.51.100.${i}`},body:JSON.stringify({email:'invalid',password:'test-password-123'})});assert.equal(denied.status,429);
});

test('HTTPS 隧道支持登录且按可信客户端 IP 分别限流',{timeout:20000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'qa-public-'));const port=32188;
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',COOKIE_SECURE:'1',TRUST_CLOUDFLARE:'1',DB_PATH:join(dir,'test.db')},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}rmSync(dir,{recursive:true,force:true});});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('服务未启动');})]);
  const hostname='qa-test.trycloudflare.com';
  async function request(path,data,{ip='198.51.100.10',origin=`https://${hostname}`,cookie=''}={}){
    // Native HTTP preserves the external Host exactly as the tunnel does.
    return new Promise((resolve,reject)=>{
      const req=httpRequest({hostname:'127.0.0.1',port,path:'/api'+path,method:data?'POST':'GET',headers:{Host:hostname,Origin:origin,'CF-Connecting-IP':ip,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}},res=>{
        let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:{get:key=>{const value=res.headers[key.toLowerCase()];return Array.isArray(value)?value[0]:value;}},json:async()=>JSON.parse(body)}));
      });
      req.on('error',reject);req.end(data?JSON.stringify(data):undefined);
    });
  }
  const register=await request('/register',{name:'公网测试',email:'public@example.com',password:'test-password-123'});assert.equal(register.status,200);assert.match(register.headers.get('set-cookie'),/; Secure/);const cookie=register.headers.get('set-cookie').split(';')[0];
  const publish=await request('/questions',{title:'公网隧道如何验证登录？',content:'验证 HTTPS 代理下的 Cookie、来源校验及数据保存。',answer:'通过 HTTPS 注册后检查会话，提交题目和回答，并验证刷新仍能读取。',category:'接口测试',difficulty:'中等',tags:'HTTPS,登录'},{cookie});assert.equal(publish.status,201);const {id}=await publish.json();
  const reply=await request(`/questions/${id}/replies`,{body:'这条回答由模拟公网 HTTPS 会话提交。'},{cookie});assert.equal(reply.status,201);
  const me=await request('/me',null,{cookie});assert.equal((await me.json()).user.name,'公网测试');
  const wrongOrigin=await request('/logout',{}, {cookie,origin:'https://evil.example'});assert.equal(wrongOrigin.status,403);
  const httpOrigin=await request('/logout',{}, {cookie,origin:`http://${hostname}`});assert.equal(httpOrigin.status,403);
  for(let i=0;i<31;i++)await request('/login',{email:'invalid',password:'test-password-123'},{ip:'198.51.100.20'});
  assert.equal((await request('/login',{email:'public@example.com',password:'test-password-123'},{ip:'198.51.100.20'})).status,429);
  assert.equal((await request('/login',{email:'public@example.com',password:'test-password-123'},{ip:'198.51.100.21'})).status,200);
});
