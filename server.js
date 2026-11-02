import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data/app.db');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, answer TEXT NOT NULL, category TEXT NOT NULL, difficulty TEXT NOT NULL, tags TEXT NOT NULL, author_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL REFERENCES questions(id), user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS bookmarks(user_id INTEGER REFERENCES users(id), question_id INTEGER REFERENCES questions(id), PRIMARY KEY(user_id,question_id));
`);
if (!db.prepare('SELECT id FROM questions LIMIT 1').get()) {
  const id = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('QA Path 编辑部','editor@qa-path.invalid','disabled').lastInsertRowid;
  const insert = db.prepare('INSERT INTO questions(title,content,answer,category,difficulty,tags,author_id) VALUES(?,?,?,?,?,?,?)');
  for (const q of seed) insert.run(q.title,q.content,q.answer,q.category,q.difficulty,JSON.stringify(q.tags),id);
}
const categories = ['全部题目','测试基础','接口测试','自动化测试','性能测试','测试开发','数据库与 SQL','计算机基础'];
const hash = token => createHash('sha256').update(token).digest('hex');
const passwordHash = password => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password,salt,64).toString('hex'); };
const checkPassword = (password, stored) => { const [salt,key] = stored.split(':'); return !!key && timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64)); };
function userFor(req) {
  const token = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);
  return token ? db.prepare('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash(token),Date.now()) : null;
}
function fail(status,message) { throw Object.assign(new Error(message),{status}); }
async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data)>65536) fail(413,'内容过长，请缩短后再试'); }
  try { const parsed=JSON.parse(data || '{}'); if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) fail(400,'请求格式不正确'); return parsed; } catch { fail(400,'请求格式不正确'); }
}
function field(data,name,min,max) { const v=data[name]; if(typeof v!=='string'||v.trim().length<min||v.trim().length>max) fail(400,`${name==='title'?'标题':name==='answer'?'标准答案':name==='body'?'回答':name==='name'?'昵称':name==='password'?'密码':'内容'}需为 ${min}–${max} 个字符`); return v.trim(); }
const attempts = new Map();
function rateLimit(req) {
  const key=req.socket.remoteAddress, now=Date.now();
  const a=attempts.get(key); if(!a||a.until<now) { attempts.set(key,{count:1,until:now+600000}); return; }
  if(++a.count>30) fail(429,'尝试次数过多，请 10 分钟后重试');
}
const server = http.createServer(async (req,res)=>{
  const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin!==`${process.env.COOKIE_SECURE==='1'?'https':'http'}://${req.headers.host}`) fail(403,'不允许的请求来源');
      const user=userFor(req), p=url.pathname, method=req.method;
      if(p==='/api/me'&&method==='GET') return send(200,{user:user||null});
      if ((p==='/api/register'||p==='/api/login')&&method==='POST') {
        rateLimit(req); const data=await body(req); const email=field(data,'email',3,254).toLowerCase();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'请输入有效邮箱');
        if(typeof data.password!=='string'||data.password.length<8||data.password.length>128) fail(400,'密码需为 8–128 个字符');
        const password=data.password; let u;
        if(p==='/api/register') {
          const name=field(data,'name',2,24);
          if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail(409,'此邮箱已注册，请登录');
          const id=db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,passwordHash(password)).lastInsertRowid;
          u=db.prepare('SELECT id,name,email FROM users WHERE id=?').get(id);
        } else { const found=db.prepare('SELECT * FROM users WHERE email=?').get(email); if(!found||!checkPassword(password,found.password)) fail(401,'邮箱或密码不正确'); u={id:found.id,name:found.name,email:found.email}; }
        const token=randomBytes(32).toString('hex'); db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),u.id,Date.now()+604800000);
        return send(200,{user:u},{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`});
      }
      if(p==='/api/logout'&&method==='POST') { const token=(req.headers.cookie||'').match(/(?:^|;\s*)session=([^;]+)/)?.[1]; if(token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token)); return send(200,{ok:true},{'Set-Cookie':'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}); }
      if(p==='/api/questions'&&method==='GET') {
        const questions=db.prepare(`SELECT q.*,u.name author,(SELECT count(*) FROM replies r WHERE r.question_id=q.id) reply_count,EXISTS(SELECT 1 FROM bookmarks b WHERE b.question_id=q.id AND b.user_id=?) bookmarked FROM questions q JOIN users u ON u.id=q.author_id ORDER BY q.id DESC`).all(user?.id||0).map(q=>({...q,tags:JSON.parse(q.tags),answer:undefined,content:undefined}));
        return send(200,{questions,categories});
      }
      if(p==='/api/questions'&&method==='POST') {
        if(!user) fail(401,'请先登录，再分享题目'); const data=await body(req);
        const title=field(data,'title',5,160), content=field(data,'content',10,5000), answer=field(data,'answer',10,12000);
        if(!categories.slice(1).includes(data.category)||!['简单','中等','困难'].includes(data.difficulty)) fail(400,'请选择有效分类和难度');
        const tags=field({...data,tags:data.tags||''},'tags',0,100).split(/[,，]/).map(t=>t.trim()).filter(Boolean).slice(0,5);
        const result=db.prepare('INSERT INTO questions(title,content,answer,category,difficulty,tags,author_id) VALUES(?,?,?,?,?,?,?)').run(title,content,answer,data.category,data.difficulty,JSON.stringify(tags),user.id);
        return send(201,{id:Number(result.lastInsertRowid)});
      }
      const match=p.match(/^\/api\/questions\/(\d+)(?:\/(replies|bookmark))?$/);
      if(match) {
        const id=Number(match[1]); const q=db.prepare('SELECT q.*,u.name author FROM questions q JOIN users u ON u.id=q.author_id WHERE q.id=?').get(id); if(!q) fail(404,'题目不存在');
        if(!match[2]&&method==='GET') { q.tags=JSON.parse(q.tags); q.replies=db.prepare('SELECT r.*,u.name author FROM replies r JOIN users u ON u.id=r.user_id WHERE question_id=? ORDER BY r.id DESC').all(id); return send(200,q); }
        if(method==='POST'&&match[2]) {
          if(!user) fail(401,'请先登录后操作');
          if(match[2]==='replies') { const data=await body(req); const value=field(data,'body',5,8000); db.prepare('INSERT INTO replies(question_id,user_id,body) VALUES(?,?,?)').run(id,user.id,value); return send(201,{ok:true}); }
          const exists=db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND question_id=?').get(user.id,id);
          if(exists) db.prepare('DELETE FROM bookmarks WHERE user_id=? AND question_id=?').run(user.id,id); else db.prepare('INSERT INTO bookmarks VALUES(?,?)').run(user.id,id);
          return send(200,{bookmarked:!exists});
        }
      }
      fail(404,'接口不存在');
    }
    if(req.method!=='GET'&&req.method!=='HEAD') fail(405,'不支持的请求方法');
    const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
    const file=files[url.pathname]; if(!file) fail(404,'页面不存在');
    const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
    res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'}); res.end(req.method==='HEAD'?undefined:readFileSync(join(root,'public',file)));
  } catch(e) { if(!e.status) console.error(e); send(e.status||500,{error:e.status?e.message:'服务暂时不可用，请稍后重试'}); }
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`QA Path listening on port ${process.env.PORT||3000}`));
