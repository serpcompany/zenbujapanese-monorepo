#!/usr/bin/env python3
"""Render a local side-by-side Zenbu/JPDB dictionary behavior preview."""

from __future__ import annotations

import argparse
import html
import json
import sqlite3
from pathlib import Path


def scalar_rows(database: sqlite3.Connection, sql: str, parameters: tuple[object, ...]) -> list[tuple]:
    return list(database.execute(sql, parameters))


def json_list(value: str | None) -> list[str]:
    return [str(item) for item in json.loads(value or "[]")]


def current_examples(database: sqlite3.Connection, headword: str, limit: int = 3) -> list[dict[str, str]]:
    return [
        {"japanese": str(japanese), "english": str(english)}
        for japanese, english in database.execute(
            "SELECT japanese,english FROM example_sentences WHERE instr(japanese,?)>0 "
            "ORDER BY length(japanese),hex(id) LIMIT ?",
            (headword, limit),
        )
    ]


def preview_rows(jpdb: sqlite3.Connection, current: sqlite3.Connection) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for local_id, vid, headword, reading, rank in jpdb.execute(
        "SELECT v.id,v.upstream_vid,v.headword,v.primary_reading,f.rank "
        "FROM vocabulary v LEFT JOIN frequencies f ON f.vocabulary_id=v.id AND f.corpus='global' "
        "ORDER BY COALESCE(f.rank,999999999),v.upstream_vid"
    ):
        current_row = current.execute(
            "SELECT headword,reading,summary,meanings_json,parts_of_speech_json,pitch_accent_json,"
            "is_common,rank_score FROM entries WHERE source_record_id=?",
            (vid,),
        ).fetchone()
        if not current_row:
            continue
        jpdb_meanings = [
            str(row[0])
            for row in scalar_rows(
                jpdb,
                "SELECT meaning FROM meanings WHERE vocabulary_id=? ORDER BY ordinal",
                (local_id,),
            )
        ]
        jpdb_pos = [
            str(row[0])
            for row in scalar_rows(
                jpdb,
                "SELECT DISTINCT part_of_speech FROM meaning_parts_of_speech "
                "WHERE vocabulary_id=? ORDER BY meaning_ordinal,part_of_speech",
                (local_id,),
            )
        ]
        frequencies = {
            str(corpus): int(frequency_rank)
            for corpus, frequency_rank in scalar_rows(
                jpdb,
                "SELECT corpus,rank FROM frequencies WHERE vocabulary_id=? ORDER BY corpus",
                (local_id,),
            )
        }
        pronunciations = [
            {"kind": str(kind), "value": str(value)}
            for kind, value in scalar_rows(
                jpdb,
                "SELECT kind,value FROM pronunciations WHERE vocabulary_id=? ORDER BY kind,value",
                (local_id,),
            )
        ]
        jpdb_examples = [
            {"japanese": str(japanese), "english": str(english)}
            for japanese, english in jpdb.execute(
                "SELECT e.japanese,e.english FROM vocabulary_examples v "
                "JOIN example_sentences e ON e.id=v.example_id "
                "WHERE v.vocabulary_id=? ORDER BY v.ordinal,e.id LIMIT 3",
                (local_id,),
            )
        ]
        current_pitch = json.loads(current_row[5]) if current_row[5] else None
        records.append(
            {
                "vid": int(vid),
                "headword": str(headword),
                "jpdbReading": str(reading),
                "jpdbRank": int(rank) if rank is not None else None,
                "jpdbMeanings": jpdb_meanings,
                "jpdbPOS": jpdb_pos,
                "jpdbFrequencies": frequencies,
                "jpdbPronunciations": pronunciations,
                "jpdbExamples": jpdb_examples,
                "currentHeadword": str(current_row[0]),
                "currentReading": str(current_row[1]),
                "currentSummary": str(current_row[2]),
                "currentMeanings": json_list(current_row[3]),
                "currentPOS": json_list(current_row[4]),
                "currentPitch": current_pitch,
                "currentCommon": bool(current_row[6]),
                "currentRankScore": int(current_row[7]),
                "currentExamples": current_examples(current, str(current_row[0])),
            }
        )
    return records


def render(records: list[dict[str, object]]) -> str:
    payload = json.dumps(records, ensure_ascii=False).replace("</", "<\\/")
    count = len(records)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Zenbu × JPDB dictionary preview</title>
<style>
:root{{--ink:#1c2025;--muted:#69717c;--paper:#f5f3ee;--card:#fff;--jp:#225b4d;--zen:#54418c;}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.48 system-ui,sans-serif}}
header{{padding:36px max(24px,calc((100vw - 1120px)/2));background:#17231f;color:white}}
h1{{margin:0 0 8px;font-size:30px}} header p{{margin:0;color:#cbd8d3;max-width:800px}}
main{{max-width:1120px;margin:auto;padding:24px}} .controls{{display:flex;gap:12px;align-items:center;margin-bottom:18px}}
input{{flex:1;padding:12px 14px;border:1px solid #c8c5bc;border-radius:10px;font-size:16px}}
.count{{color:var(--muted)}} .card{{background:var(--card);border:1px solid #ddd8ce;border-radius:16px;margin:14px 0;overflow:hidden}}
.title{{display:flex;gap:12px;align-items:baseline;padding:18px 20px 10px}} .word{{font-size:28px;font-weight:700}}
.reading{{font-size:17px;color:var(--muted)}} .rank{{margin-left:auto;background:#e1eee9;color:var(--jp);padding:4px 9px;border-radius:99px;font-weight:650}}
.columns{{display:grid;grid-template-columns:1fr 1fr}} .pane{{padding:16px 20px 20px;border-top:1px solid #eee9df}}
.pane+ .pane{{border-left:1px solid #eee9df}} h2{{font-size:13px;text-transform:uppercase;letter-spacing:.09em;margin:0 0 10px}}
.zen h2{{color:var(--zen)}} .jp h2{{color:var(--jp)}} ul{{padding-left:20px;margin:8px 0}} .meta{{color:var(--muted);font-size:13px}}
.example{{padding:9px 0;border-top:1px dashed #ddd8ce}} .example:first-child{{border:0}} .ja{{font-size:17px}} .en{{color:var(--muted)}}
.warning{{background:#fff4d7;border:1px solid #ead38c;padding:12px 14px;border-radius:10px;margin-bottom:18px}}
@media(max-width:760px){{.columns{{grid-template-columns:1fr}}.pane+ .pane{{border-left:0}}}}
</style></head><body>
<header><h1>Zenbu × JPDB dictionary preview</h1><p>{count} owner-authorized JPDB vocabulary records mapped to the current Zenbu/JMdict entries. Search and compare proposed JPDB frequency bands and source-linked examples without waiting for the complete crawl.</p></header>
<main><div class="warning">Preview data is intentionally partial. “Top 100” is a tied JPDB frequency band, not a unique #100 position. Frequency remains secondary to Zenbu’s exact/prefix match lanes.</div>
<div class="controls"><input id="q" placeholder="Filter headword, reading, or meaning"><span class="count" id="count"></span></div><div id="cards"></div></main>
<script>const rows={payload};
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
const list=xs=>'<ul>'+xs.slice(0,8).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
const examples=xs=>xs.map(x=>'<div class="example"><div class="ja">'+esc(x.japanese)+'</div><div class="en">'+esc(x.english)+'</div></div>').join('')||'<span class="meta">No examples in this sample</span>';
function draw(){{const q=document.querySelector('#q').value.toLowerCase();const shown=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q));document.querySelector('#count').textContent=shown.length+' / '+rows.length;document.querySelector('#cards').innerHTML=shown.map(r=>`<article class="card"><div class="title"><span class="word">${{esc(r.headword)}}</span><span class="reading">${{esc(r.jpdbReading||r.currentReading)}}</span><span class="rank">JPDB Top ${{esc(r.jpdbRank??'—')}} band</span></div><div class="columns"><section class="pane zen"><h2>Current Zenbu</h2><div class="meta">${{esc(r.currentReading)}} · rank score ${{r.currentRankScore}} · ${{r.currentCommon?'common':'not marked common'}}</div>${{list(r.currentMeanings)}}<h2>Examples</h2>${{examples(r.currentExamples)}}</section><section class="pane jp"><h2>JPDB-backed proposal</h2><div class="meta">${{esc(r.jpdbReading)}}${{r.jpdbReading!==r.currentReading?' ⚠ differs from current reading':''}} · ${{esc(r.jpdbPOS.join(' · '))}}</div>${{list(r.jpdbMeanings)}}<div class="meta">Corpus bands: ${{esc(Object.entries(r.jpdbFrequencies).map(([k,v])=>k+' Top '+v).join(' · '))}}</div><h2>Source-linked examples</h2>${{examples(r.jpdbExamples)}}</section></div></article>`).join('')}}
document.querySelector('#q').addEventListener('input',draw);draw();</script></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jpdb", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    jpdb = sqlite3.connect(f"file:{arguments.jpdb}?mode=ro", uri=True)
    current = sqlite3.connect(f"file:{arguments.current}?mode=ro", uri=True)
    try:
        records = preview_rows(jpdb, current)
    finally:
        jpdb.close()
        current.close()
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(render(records), encoding="utf-8")
    print(json.dumps({"records": len(records), "output": str(arguments.output)}, indent=2))


if __name__ == "__main__":
    main()
