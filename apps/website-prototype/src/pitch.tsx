import {useLayoutEffect,useRef,useState} from 'react';
export function Pitch({reading,downstep,moraCount}:{reading:string,downstep:number,moraCount:number}){
 const ref=useRef<HTMLSpanElement>(null);const [width,setWidth]=useState(0);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[reading]);
 const count=Math.max(moraCount,1),drop=downstep===0?count:Math.min(Math.max(downstep,1),count),dropX=width*drop/count;
 const path=`M 0 1 L ${dropX} 1${downstep>0?` L ${Math.min(width,dropX+5)} 6 L ${width} 6`:''}`;
 const katakana=Array.from(reading).map(c=>{const v=c.codePointAt(0)!;return v>=0x3041&&v<=0x3096?String.fromCodePoint(v+0x60):c;}).join('');
 return <span className="native-pitch" aria-label={`Pitch accent for ${reading}, downstep ${downstep}, ${moraCount} mora`}><span ref={ref} lang="ja">{katakana}<svg width={width} height="7" aria-hidden="true"><path d={path} fill="none" stroke="var(--pitch-downstep)" strokeWidth="1.5" strokeLinecap="round"/></svg></span></span>;
}
