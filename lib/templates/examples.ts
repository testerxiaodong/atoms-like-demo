import { demoFiles } from "./react";
import type { FileMap } from "@/lib/types";
const style = `*{box-sizing:border-box}body{margin:0;background:#f6f4ed;color:#24382d;font:16px system-ui}main{max-width:760px;margin:0 auto;padding:48px 24px}h1{font-size:42px;letter-spacing:-2px}button,input{font:inherit;padding:12px 18px;border:1px solid #c8d2c6;border-radius:12px;margin:4px;background:white}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #467452}section{padding:24px;background:#fff;border-radius:20px;margin:20px 0}small{color:#657365}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric{font-size:32px;font-weight:600}button[aria-pressed=true]{background:#294b35;color:white}`;
const files = (source: string): FileMap => ({
  "/App.tsx":
    'import React, {useState, useEffect} from "react"; import "./styles.css";\n' +
    source,
  "/styles.css": style,
});
export const examples = [
  {
    id: "tasks",
    name: "小事清单",
    category: "效率工具",
    description: "收集待办、完成小事，给生活留一点余地。",
    prompt: "基于这个小事清单，增加优先级和截止日期。",
    color: "sage",
    files: demoFiles,
  },
  {
    id: "timer",
    name: "留白时钟",
    category: "专注工具",
    description: "开始一段专注，暂停、重置，找回自己的节奏。",
    prompt: "基于这个专注时钟，增加短休息模式和完成统计。",
    color: "peach",
    files: files(
      `export default function App(){const [seconds,setSeconds]=useState(1500),[running,setRunning]=useState(false);useEffect(()=>{if(!running||seconds===0)return;const timer=setInterval(()=>setSeconds(s=>Math.max(0,s-1)),1000);return()=>clearInterval(timer)},[running,seconds]);return <main><small>ROOM TO FOCUS</small><h1>留白时钟</h1><p>一次只做一件事。</p><section style={{textAlign:'center'}}><p style={{fontSize:72,fontVariantNumeric:'tabular-nums'}}>{Math.floor(seconds/60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</p><button onClick={()=>setRunning(!running)}>{running?'暂停':'开始专注'}</button><button onClick={()=>{setRunning(false);setSeconds(1500)}}>重置</button></section></main>}`,
    ),
  },
  {
    id: "studio",
    name: "山间工作室",
    category: "品牌网站",
    description: "一个安静的设计工作室，可筛选作品、留下联系意向。",
    prompt: "基于这个设计工作室网站，增加服务介绍和项目详情。",
    color: "lavender",
    files: files(
      `export default function App(){const [filter,setFilter]=useState('全部'),[sent,setSent]=useState(false);return <main><small>SHANJIAN / DESIGN STUDIO</small><h1>为日常，设计一点不同。</h1><p>独立品牌与数字体验工作室。</p>{['全部','品牌','网站'].map(x=><button key={x} aria-pressed={filter===x} onClick={()=>setFilter(x)}>{x}</button>)}{[{name:'林间咖啡',type:'品牌'},{name:'向海而行',type:'网站'},{name:'日常器物',type:'品牌'}].filter(x=>filter==='全部'||filter===x.type).map(x=><section key={x.name}><small>{x.type}</small><h2>{x.name}</h2></section>)}<form onSubmit={e=>{e.preventDefault();setSent(true)}}><h2>聊聊你的想法</h2><input type="email" aria-label="联系邮箱" placeholder="你的邮箱" required/><button>留下意向</button>{sent&&<p role="status">已记录在本页演示中，未发送邮件。</p>}</form></main>}`,
    ),
  },
  {
    id: "dashboard",
    name: "生长看板",
    category: "数据展示",
    description: "切换时间范围，查看一间小店的模拟经营数据。",
    prompt: "基于这个经营看板，增加销售趋势和分类筛选。",
    color: "sand",
    files: files(
      `export default function App(){const [period,setPeriod]=useState('本周');const values=period==='本周'?[12840,86,149]:[48600,324,150];return <main><small>GROWTH NOTES / 示例数据</small><h1>每一点生长，都看得见。</h1>{['本周','本月'].map(x=><button key={x} aria-pressed={period===x} onClick={()=>setPeriod(x)}>{x}</button>)}<div className="grid">{['销售额','订单数','客单价'].map((x,i)=><section key={x}><small>{x}</small><p className="metric">{values[i].toLocaleString()}</p></section>)}</div><section><h2>产品表现</h2>{['手冲咖啡','烘焙甜点','生活杂货'].map((x,i)=><div key={x}><p>{x}</p><div style={{height:16,borderRadius:8,background:'#8ca88c',width:(period==='本周'?85-i*23:70-i*15)+'%'}}/></div>)}</section></main>}`,
    ),
  },
];
export function getExample(id?: string) {
  return examples.find((example) => example.id === id);
}
