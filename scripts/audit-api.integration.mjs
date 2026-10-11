import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port=20000+(process.pid%20000), origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['dist/server/entry.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server start timeout')),10000);server.stdout.on('data',data=>{if(String(data).includes('Server listening')){clearTimeout(timer);resolve();}});server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});});
 const post=(body,headers={})=>fetch(`${origin}/api/audit/`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body});
 assert.equal((await post('{}',{Origin:'https://different.example'})).status,403);
 assert.equal((await post('{}',{'Content-Type':'text/plain'})).status,415);
 assert.equal((await post('bad JSON')).status,400);
 assert.equal((await post(JSON.stringify({website:'http://127.0.0.1/'}))).status,422);
 assert.equal((await post(JSON.stringify({website:'file:///etc/passwd'}))).status,400);
 assert.equal((await post('x'.repeat(1025))).status,413);
 for(let i=0;i<3;i++)await post('{}');
 assert.equal((await post('{}')).status,429);
 console.log('API integration passed: origin, content type, malformed input, private IP, unsafe protocol, body limit and rate limit.');
} finally {server.kill();}
