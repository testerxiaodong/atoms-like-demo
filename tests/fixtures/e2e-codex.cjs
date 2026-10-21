#!/usr/bin/env node
// Deterministic model double for the dedicated localhost E2E server only.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
  const current = input.split('Current request:\n').at(-1).split('Output JSON schema:')[0];
  emit({type:'item.completed',item:{type:'agent_message',text:'端到端测试：已收到请求，正在处理。'}});
  if (current.includes('E2E_FAIL')) {
    setTimeout(() => { emit({type:'turn.failed',error:{message:'network connection failed (injected E2E failure)'}}); }, 1500);
    return;
  }
  if (current.includes('E2E_SLOW')) {
    const timer = setInterval(() => {}, 1000);
    process.on('SIGTERM', () => {clearInterval(timer);process.exit(0);});
    return;
  }
  const files = [
    {path:'/App.tsx',content:'import {Counter} from "./components/Counter"; import "./styles.css"; export default function App(){return <main><h1>恢复验证作品</h1><Counter/></main>}'},
    {path:'/components/Counter.tsx',content:'import {useState} from "react"; export function Counter(){const [count,setCount]=useState(0);return <button onClick={()=>setCount(count+1)}>计数：{count}</button>}'},
    {path:'/styles.css',content:'body{margin:0;background:#eef3e6;color:#253924;font:18px system-ui} main{padding:48px}button{padding:16px;border:1px solid;border-radius:12px;background:white;font:inherit}'}
  ];
  files.forEach((file, index) => setTimeout(() => {
    emit({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({type:'file',...file})}});
  }, 100 + index * 250));
  setTimeout(() => {
    emit({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({summary:'端到端测试作品已生成。点击右侧计数按钮验证预览交互。',filePaths:files.map(file=>file.path)})}});
    emit({type:'turn.completed'});
  }, current.includes("E2E_FILE_PROGRESS") ? 5000 : 1500);
});
