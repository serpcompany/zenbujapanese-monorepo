#!/usr/bin/env node
/** Disposable clean kuromoji.js provider for the issue #251 benchmark schema. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function parseArguments() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, value, index, all) => {
      if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
      return pairs;
    }, []),
  );
  if (
    !args.truth ||
    !args.output ||
    !args.dictionary ||
    !args.module ||
    !args.version
  )
    throw new Error(
      'usage: --truth FILE --output FILE --dictionary DIR --module PACKAGE --version VERSION',
    );
  return args;
}

function loadTexts(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (sourcePath.endsWith('.conllu')) {
    const records = [];
    let id = null;
    for (const line of source.split('\n')) {
      if (line.startsWith('# sent_id = ')) id = line.slice(12);
      if (line.startsWith('# text = '))
        records.push({ id, text: line.slice(9) });
    }
    return records;
  }
  return JSON.parse(source).cases.map(({ id, text }) => ({ id, text }));
}

function dictionarySHA256(directory) {
  const digest = crypto.createHash('sha256');
  for (const name of fs.readdirSync(directory).sort()) {
    digest.update(name, 'utf8');
    digest.update(Buffer.from([0]));
    digest.update(fs.readFileSync(path.join(directory, name)));
  }
  return digest.digest('hex');
}

function scalarLength(value) {
  return Array.from(value).length;
}

function coarsePOS(token) {
  if (token.pos === '名詞') {
    if (token.pos_detail_1 === '固有名詞') return 'PROPN';
    if (token.pos_detail_1 === '数') return 'NUM';
    return 'NOUN';
  }
  return (
    {
      代名詞: 'PRON',
      動詞: 'VERB',
      形容詞: 'ADJ',
      連体詞: 'DET',
      副詞: 'ADV',
      助動詞: 'AUX',
      接続詞: 'CCONJ',
      感動詞: 'INTJ',
      記号: token.pos_detail_1 === '一般' ? 'SYM' : 'PUNCT',
      フィラー: 'INTJ',
      助詞:
        token.pos_detail_1 === '接続助詞'
          ? 'SCONJ'
          : token.pos_detail_1 === '終助詞'
            ? 'PART'
            : 'ADP',
    }[token.pos] ?? null
  );
}

function buildTokenizer(dictionaryPath) {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: dictionaryPath })
      .build((error, tokenizer) =>
        error ? reject(error) : resolve(tokenizer),
      );
  });
}

const args = parseArguments();
const kuromoji = require(args.module);
const tokenizer = await buildTokenizer(args.dictionary);
const metadata = {
  schema: 'zenbu.japanese-text-analysis-output.v1',
  engine: args.module,
  engineVersion: args.version,
  dictionary: 'mecab-ipadic-2.7.0-20070801',
  dictionarySHA256: dictionarySHA256(args.dictionary),
};
const rows = loadTexts(args.truth).map((record) => ({
  ...metadata,
  ...record,
  tokens: (() => {
    let cursorUTF16 = 0;
    return tokenizer.tokenize(record.text).map((token) => {
      const startUTF16 = record.text.indexOf(token.surface_form, cursorUTF16);
      if (startUTF16 < 0)
        throw new Error(
          `surface range did not round-trip for ${record.id}: ${token.surface_form}`,
        );
      const endUTF16 = startUTF16 + token.surface_form.length;
      cursorUTF16 = endUTF16;
      return {
        surface: token.surface_form,
        start: scalarLength(record.text.slice(0, startUTF16)),
        end: scalarLength(record.text.slice(0, endUTF16)),
        lemma: token.basic_form === '*' ? null : token.basic_form,
        reading: token.reading === '*' ? null : token.reading,
        pos: coarsePOS(token),
        oov: token.word_type === 'UNKNOWN',
      };
    });
  })(),
}));
fs.writeFileSync(
  args.output,
  `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
);
