// Throwaway: three dictionary layouts, shareable on /?variant=A|B|C. Issue #298.
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Link, useLocation, useSearchParams} from 'react-router-dom';
import {ArrowLeft, ArrowRight, Search, Volume2, BookOpen, ArrowUpRight} from 'lucide-react';
import {Card, Switch} from './ui';
import {Badge} from './badge';
import {Pitch} from './pitch';
import './theme.css';
import './style.css';
import './selected-a.css';

const entries=[
 {word:'昨日',reading:'きのう',romaji:'kinō',definition:'yesterday',pos:'Noun · Adverb',frequency:349,pitch:'0 · Heiban',mora:['き','の','う'],pattern:[0,1,1],example:'昨日はいい天気でした。',translation:'The weather was nice yesterday.'},
 {word:'今日',reading:'きょう',romaji:'kyō',definition:'today; this day',pos:'Noun · Adverb',frequency:128,pitch:'1 · Atamadaka',mora:['きょ','う'],pattern:[1,0],example:'今日は何をしますか。',translation:'What are you doing today?'},
 {word:'明日',reading:'あした',romaji:'ashita',definition:'tomorrow',pos:'Noun · Adverb',frequency:263,pitch:'3 · Odaka',mora:['あ','し','た'],pattern:[0,1,1],example:'また明日会いましょう。',translation:'Let’s meet again tomorrow.'},
 {word:'毎日',reading:'まいにち',romaji:'mainichi',definition:'every day; daily',pos:'Noun · Adverb',frequency:650,pitch:'1 · Atamadaka',mora:['ま','い','に','ち'],pattern:[1,0,0,0],example:'毎日、日本語を勉強します。',translation:'I study Japanese every day.'},
 {word:'週末',reading:'しゅうまつ',romaji:'shūmatsu',definition:'weekend',pos:'Noun',frequency:2138,pitch:'0 · Heiban',mora:['しゅ','う','ま','つ'],pattern:[0,1,1,1]},
 {word:'時間',reading:'じかん',romaji:'jikan',definition:'time; hour; duration',pos:'Noun',frequency:110,pitch:'0 · Heiban',mora:['じ','か','ん'],pattern:[0,1,1],example:'少し時間があります。',translation:'I have a little time.'}
];
const names={A:'Quiet dictionary',B:'Reading room',C:'Word collection'};
type Entry=typeof entries[number];
function App(){
 const location=useLocation();const entryWord=location.pathname.startsWith('/entry/')?decodeURIComponent(location.pathname.slice(7)):null;
 const [params,setParams]=useSearchParams(); const key=params.get('variant');const variant=(key==='B'||key==='C'?key:'A') as keyof typeof names;
 const [romaji,setRomaji]=useState(true),[furigana,setFurigana]=useState(true),[query,setQuery]=useState(''),[status,setStatus]=useState('');
 const results=entries.filter(e=>[e.word,e.reading,e.romaji,e.definition].some(s=>s.toLowerCase().includes(query.trim().toLowerCase())));
 const cycle=(n:number)=>setParams({variant:['A','B','C'][(['A','B','C'].indexOf(variant)+n+3)%3]});
 useEffect(()=>{function keydown(e:KeyboardEvent){if((e.target as HTMLElement).closest('input,textarea,[contenteditable="true"],[role="switch"]'))return;if(e.key==='ArrowRight')cycle(1);if(e.key==='ArrowLeft')cycle(-1);}window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[variant]);
 function speak(e:Entry){if(!('speechSynthesis'in window)){setStatus('Speech is unavailable in this browser.');return;}const voices=speechSynthesis.getVoices();const japanese=voices.find(v=>v.lang==='ja-JP')??voices.find(v=>v.lang.startsWith('ja'));if(!japanese){setStatus('No Japanese voice is installed. Audio unavailable.');return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(e.reading);u.lang='ja-JP';u.voice=japanese;u.rate=.82;u.onend=()=>setStatus('');u.onerror=()=>setStatus('Audio unavailable.');speechSynthesis.speak(u);setStatus(`Playing ${e.reading}`);}
 useEffect(()=>{if('speechSynthesis'in window)speechSynthesis.getVoices();},[]);
 const search=<div className="search-area">{!entryWord?<form onSubmit={e=>e.preventDefault()} className="search-box"><Search size={21}/><input aria-label="Search dictionary" placeholder="Search Japanese, romaji, or English" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" aria-label="Search"><ArrowRight size={20}/></button></form>:null}<div className="reading-controls"><label htmlFor="romaji"><Switch id="romaji" checked={romaji} onCheckedChange={setRomaji}/>Romaji</label><label htmlFor="furigana"><Switch id="furigana" checked={furigana} onCheckedChange={setFurigana}/>Furigana</label></div></div>;
 const cards=results.map((e,i)=><EntryCard key={e.word} e={e} index={i} romaji={romaji} furigana={furigana} speak={speak}/>);
 const resultHeading=<div className="result-heading">{query?<h2>{`Results for “${query}”`}</h2>:<span/>}<span>{results.length} words</span></div>;
 const selected=entries.find(e=>e.word===entryWord);
 return <div className={`page variant-${variant}`}>
 {entryWord?<><section className="hero"><h1>Zenbu Dictionary</h1>{search}</section><main><Link className="back-link" to="/?variant=A"><ArrowLeft size={16}/> Back to results</Link>{selected?<EntryCard e={selected} index={entries.indexOf(selected)} romaji={romaji} furigana={furigana} speak={speak} detail/>:<p>Entry not found.</p>}</main></>:variant==='A'?<VariantA search={search} heading={resultHeading} cards={cards}/>:variant==='B'?<VariantB search={search} heading={resultHeading} cards={cards}/>:<VariantC search={search} heading={resultHeading} cards={cards}/>}
 {results.length===0?<div className="empty">No fixture words found. Try “today”, “昨日”, or clear your search.</div>:null}
 <div role="status" className="audio-status">{status}</div>
 {import.meta.env.DEV?<div className="prototype-switcher"><button aria-label="Previous design" onClick={()=>cycle(-1)}><ArrowLeft size={16}/></button><div><strong>SET 1 · {variant} — {names[variant]}</strong><small>Romaji {romaji?'on':'off'} · Furigana {furigana?'on':'off'} · {results.length} results</small></div><button aria-label="Next design" onClick={()=>cycle(1)}><ArrowRight size={16}/></button></div>:null}</div>;
}
function VariantA({search,heading,cards}:any){return <><section className="hero"><h1>Zenbu Dictionary</h1>{search}</section><main>{heading}<div className="entries">{cards}</div></main></>}
function VariantB({search,heading,cards}:any){return <><section className="hero"><div className="hero-copy"><div className="eyebrow">THE EVERYDAY DICTIONARY</div><h1>A word.<br/>A whole world.</h1><p>Meaning, sound, and a little context.<br/>Make Japanese part of your day.</p></div><div className="hero-search"><BookOpen size={27}/><h2>What are you curious about?</h2>{search}</div></section><main><aside><span className="eyebrow">ON THESE PAGES</span><h2>Days &<br/>moments.</h2><p>Useful words for the time we spend, and the plans we make.</p><span className="aside-note">06 / SAMPLE WORDS</span></aside><div className="results">{heading}<div className="entries">{cards}</div></div></main></>}
function VariantC({search,heading,cards}:any){return <><section className="hero"><div className="eyebrow">YOUR JAPANESE COMPANION</div><h1>One word closer.</h1><p>Find a meaning. Hear a sound. See it in a sentence.</p>{search}<div className="hero-caption"><span>日本語 → English</span><span>Made for the curious <ArrowUpRight size={13}/></span></div></section><main>{heading}<div className="entries">{cards}</div></main></>}
function EntryCard({e,index,romaji,furigana,speak,detail=false}:{e:Entry,index:number,romaji:boolean,furigana:boolean,speak:(e:Entry)=>void,detail?:boolean}){return <Card className="entry"><div className="word-column"><span className="entry-index">{String(index+1).padStart(2,'0')}</span><h3 lang="ja"><Link to={`/entry/${encodeURIComponent(e.word)}?variant=A`}><ruby>{e.word}{furigana?<rt>{e.reading}</rt>:null}</ruby></Link></h3>{romaji?<p className="romaji">{e.romaji}</p>:null}{!detail?<Link className="entry-link" to={`/entry/${encodeURIComponent(e.word)}?variant=A`}>View entry <ArrowUpRight size={13}/></Link>:null}</div><div className="meaning-column"><div className="entry-topline"><span className="pos">{e.pos}</span><Badge aria-label={`Frequency rank ${e.frequency}`}>#{e.frequency}</Badge></div><p className="definition">{e.definition}</p><div className="pronunciation"><button onClick={()=>speak(e)} aria-label={`Listen to ${e.word}`}><Volume2 size={17}/><span>Listen</span></button><Pitch reading={e.reading} downstep={Number(e.pitch.split(' ')[0])} moraCount={e.mora.length}/></div>{e.example?<div className="example"><p lang="ja">{e.example}</p><p>{e.translation}</p></div>:null}</div></Card>}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
