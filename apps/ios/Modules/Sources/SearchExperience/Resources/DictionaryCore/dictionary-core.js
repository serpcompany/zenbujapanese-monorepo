"use strict";
(() => {
  // src/examples/kana.ts
  var halfwidthAndCircledKatakana = /[｡-ﾟ㋐-㋾]/gu;
  function fold(value) {
    return value.replace(halfwidthAndCircledKatakana, (character) => character.normalize("NFKC"));
  }
  var toHiraganaSpecial = {
    ヵ: "か",
    ヶ: "け",
    ヷ: "わ゙",
    ヸ: "ゐ゙",
    ヹ: "ゑ゙",
    ヺ: "を゙",
    ヽ: "ゝ",
    ヾ: "ゞ",
    "ヿ": "こと",
    "ゟ": "より"
  };
  var toKatakanaSpecial = {
    ゝ: "ヽ",
    ゞ: "ヾ",
    "ゟ": "ヨリ"
  };
  var longestRemembered = 24;
  var remembered = 8192;
  function remembering(convert) {
    const known = /* @__PURE__ */ new Map();
    return (value) => {
      if (value.length > longestRemembered) return convert(value);
      let converted = known.get(value);
      if (converted === void 0) {
        converted = convert(value);
        if (known.size >= remembered) known.clear();
        known.set(value, converted);
      }
      return converted;
    };
  }
  var toHiragana = remembering(
    (value) => fold(value).replace(/[ァ-ヿゟ]/gu, (character) => {
      const special2 = toHiraganaSpecial[character];
      if (special2 !== void 0) return special2;
      const code = character.codePointAt(0) ?? 0;
      return code <= 12532 ? String.fromCodePoint(code - 96) : character;
    }).normalize("NFC")
  );
  var toKatakana = remembering(
    (value) => fold(value).replace(/[ぁ-ゔゝ-ゟ]/gu, (character) => {
      const special2 = toKatakanaSpecial[character];
      if (special2 !== void 0) return special2;
      return String.fromCodePoint((character.codePointAt(0) ?? 0) + 96);
    }).normalize("NFC")
  );

  // src/detail/text.ts
  var segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  function graphemes(value) {
    return everyUnitIsAGrapheme(value) ? value.split("") : Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  var unitsThatAreGraphemes = /^[\x20-\x7e\u3000-\u3029\u3030-\u3098\u309b-\u30ff\u4e00-\u9fff\uff00-\uff9d\uffa0-\uffef]*$/;
  function everyUnitIsAGrapheme(value) {
    return unitsThatAreGraphemes.test(value);
  }
  var highSurrogate = /[\ud800-\udbff]/;
  function scalarCount(value) {
    return highSurrogate.test(value) ? Array.from(value).length : value.length;
  }
  function graphemeCount(value) {
    return everyUnitIsAGrapheme(value) ? value.length : graphemes(value).length;
  }
  function isCJKUnifiedIdeograph(character) {
    for (let index = 0; index < character.length; index++) {
      const unit = character.charCodeAt(index);
      if (unit >= 13312 && unit <= 40959) return true;
    }
    return false;
  }
  function isKanjiCharacter(value) {
    const code = value.codePointAt(0);
    if (code === void 0 || value.length !== (code > 65535 ? 2 : 1)) return false;
    return code >= 13312 && code <= 19903 || code >= 19968 && code <= 40959 || code >= 63744 && code <= 64255 || code >= 131072 && code <= 195103 || code >= 196608 && code <= 205743;
  }
  function hiragana(value) {
    return value.replace(
      /[ァ-ヶ]/gu,
      (character) => String.fromCodePoint((character.codePointAt(0) ?? 0) - 96)
    );
  }
  function katakana(value) {
    return value.replace(
      /[ぁ-ゖ]/gu,
      (character) => String.fromCodePoint((character.codePointAt(0) ?? 0) + 96)
    );
  }
  function listedWithAnd(items) {
    return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
  }
  var glossLength = 18;
  function shortGloss(meaning) {
    const withoutNotes = meaning.replace(/\s*\([^)]*\)/gu, "");
    const first = withoutNotes.split(",").find((part) => part !== "") ?? withoutNotes;
    const trimmed = first.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");
    const gloss = trimmed.startsWith("to ") ? trimmed.slice(3) : trimmed;
    if (!gloss) return null;
    const shown = graphemes(gloss);
    return shown.length > glossLength ? `${shown.slice(0, glossLength - 1).join("")}…` : gloss;
  }

  // src/detail/romaji.ts
  var within = (accepts, step) => (text, start, limit) => {
    let position = start;
    let end = limit;
    for (; ; ) {
      while (position < end && !accepts.test(text[position])) position++;
      let runEnd = position;
      while (runEnd < end && accepts.test(text[runEnd])) runEnd++;
      if (position === runEnd) return end;
      const changedEnd = step(text, position, runEnd);
      end += changedEnd - runEnd;
      position = changedEnd;
    }
  };
  var inOrder = (...steps) => (text, start, limit) => steps.reduce((end, step) => step(text, start, end), limit);
  var rewritten = (rewrite) => (text, start, limit) => {
    const written3 = text.slice(start, limit).join("");
    const changed = rewrite(written3);
    if (changed === written3) return limit;
    const replacement2 = Array.from(changed);
    text.splice(start, limit - start, ...replacement2);
    return start + replacement2.length;
  };
  var normalized = (form) => rewritten((written3) => written3.normalize(form));
  var voicedMark = "゙";
  var voicingMarks = "゙゛";
  var semiVoicingMarks = "゚゜";
  var widened = (text, start, limit) => {
    for (let position = start; position < limit; position++) {
      if (/^[\uff66-\uff9f]$/u.test(text[position])) text[position] = text[position].normalize("NFKC");
    }
    return limit;
  };
  var decomposed = (rules2) => new Map(
    rules2.split(" ").map((rule) => {
      const [kana, latin2] = rule.split(":");
      return [kana.normalize("NFD"), latin2];
    })
  );
  var syllables = decomposed(
    "。:. 、:, ヷ:va ヸ:vi ヹ:ve ヺ:vo ヵ:~ka ヶ:~ke ~ャ:ya ~ィ:yi ~ュ:yu ~ェ:ye ~ョ:yo ア:a バ:ba ビ:bi ブ:bu ベ:be ボ:bo ダ:da ディ:di デゥ:du デ:de ド:do ヅ:dzu ヂャ:dja ヂィ:dji~i ヂュ:dju ヂェ:dje ヂョ:djo ヂ:dji チャ:cha チィ:chi~i チュ:chu チェ:che チョ:cho チ:chi エ:e ガ:ga ギ:gi グ:gu ゲ:ge ゴ:go イ:i ジャ:ja ジィ:ji~i ジュ:ju ジェ:je ジョ:jo ジ:ji カ:ka キ:ki ク:ku ケ:ke コ:ko マ:ma ミ:mi ム:mu メ:me モ:mo ナ:na ニ:ni ヌ:nu ネ:ne ノ:no オ:o パ:pa ピ:pi プ:pu ペ:pe ポ:po ハ:ha ヒ:hi ヘゥ:hu ヘ:he ホ:ho ファ:fa フィ:fi フェ:fe フォ:fo フ:fu ラ:ra リ:ri ル:ru レ:re ロ:ro ザ:za ゼィ:zi ズ:zu ゼ:ze ゾ:zo サ:sa セィ:si ス:su セ:se ソ:so シャ:sha シィ:shi~i シュ:shu シェ:she ショ:sho シ:shi タ:ta ティ:ti テゥ:tu テ:te ト:to ツ:tsu ヴ:vu ウ:u ワ:wa ヰ:wi ヱ:we ヲ:wo ヤ:ya ユ:yu ヨ:yo ー:̄ ァ:~a ィ:~i ゥ:~u ェ:~e ォ:~o ッ:~tsu ヮ:~wa ャ:~ya ュ:~yu ョ:~yo ン:n"
  );
  var longestSyllable = 3;
  var glides = decomposed("ビ:b ギ:g キ:k ミ:m ニ:n ピ:p ヒ:h リ:r");
  var glidingVowels = "ィェャュョ";
  var doubling = [
    ["しシ", voicingMarks, "j"],
    ["はひへほハヒヘホふフ", voicingMarks, "b"],
    ["たちつてとタチツテト", voicingMarks, "d"],
    ["かきくけこカキクケコ", voicingMarks, "g"],
    ["はひへほハヒヘホふフ", semiVoicingMarks, "p"],
    ["さしすせそサシスセソ", voicingMarks, "z"],
    ["ワヰヱヲ", voicedMark, "v"],
    ["かきくけこカキクケコ", null, "k"],
    ["まみむめもマミムメモ", null, "m"],
    ["なにぬねのナニヌネノン", null, "n"],
    ["はひへほハヒヘホ", null, "h"],
    ["ふフ", null, "f"],
    ["らりるれろラリルレロ", null, "r"],
    ["たちつてとタチツテト", null, "t"],
    ["さしすせそサシスセソ", null, "s"],
    ["わゐゑをワヰヱヲ", null, "w"],
    ["やゆよヤユヨ", null, "y"]
  ];
  var nasalBreaks = "アイウエオナニヌネノヤユヨン";
  var repeatedVoicings = [
    ["sh", "j"],
    ["ch", "dj"],
    ["ts", "dz"],
    ["k", "g"],
    ["s", "z"],
    ["t", "d"],
    ["b", "h"],
    ["w", "v"],
    ["j", "j"],
    ["dz", "dz"]
  ];
  var isIn = (characters, character) => character !== void 0 && characters.includes(character);
  function doubledConsonant(text, position) {
    const following = text[position + 1];
    const mark = text[position + 2];
    const found = doubling.find(
      ([characters, marks]) => isIn(characters, following) && (marks === null || isIn(marks, mark))
    );
    return found ? found[2] : null;
  }
  function repeatedSyllable(text, position, limit) {
    const voiced = position + 1 < limit && isIn(voicingMarks, text[position + 1]);
    const length2 = voiced ? 2 : 1;
    if (isIn("aeiou", text[position - 1])) {
      let start = position - 1;
      while (text[start - 1] === "y") start--;
      const glide = text.slice(start, position).join("");
      const before = text.slice(Math.max(0, start - 2), start).join("");
      const voicing = voiced && repeatedVoicings.find(([unvoiced]) => before.endsWith(unvoiced));
      if (voicing) return { length: length2, written: voicing[1] + glide };
      if (/^[b-df-hj-np-tv-z]$/.test(text[start - 1] ?? "")) {
        return { length: length2, written: text[start - 1] + glide };
      }
    }
    const previous = text[position - 1];
    return {
      length: length2,
      written: previous === void 0 || /[\r\n\u2028\u2029]/.test(previous) ? "" : previous
    };
  }
  function replacement(text, position, limit) {
    const character = text[position];
    if (character === "ヽ") return repeatedSyllable(text, position, limit);
    if (character === "ッ") {
      const consonant = doubledConsonant(text, position);
      if (consonant !== null) return { length: 1, written: consonant };
    }
    if (character === "ン" && isIn(nasalBreaks, text[position + 1])) {
      return { length: 1, written: "n'" };
    }
    for (let length2 = Math.min(longestSyllable, limit - position); length2 > 0; length2--) {
      const kana = text.slice(position, position + length2).join("");
      const glide = glides.get(kana);
      if (glide !== void 0 && isIn(glidingVowels, text[position + length2])) {
        return { length: length2, written: `${glide}~`, advance: 1 };
      }
      const latin2 = syllables.get(kana);
      if (latin2 !== void 0) return { length: length2, written: latin2 };
    }
    return null;
  }
  var toLatin = (text, start, limit) => {
    let position = start;
    let end = limit;
    while (position < end) {
      const found = replacement(text, position, end);
      if (found === null) {
        position++;
        continue;
      }
      const written3 = Array.from(found.written);
      text.splice(position, found.length, ...written3);
      end += written3.length - found.length;
      position += found.advance ?? written3.length;
    }
    return end;
  };
  var katakanaLatin = within(
    /^[\u0304\u3099-\u309c -~\u00a2\u00a3\u00a5\u00a6\u00ac\u20a9\uff61-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc\uffe8-\uffee、。がぎぐげござじずぜぞだぢづでどばぱびぴぶぷべぺぼぽゔゞ\u30a0-ヺー-ヾ]$/u,
    inOrder(
      within(/^[\p{sc=Katakana}\u309b\u309c\u30a0ー\uff70\uff9e\uff9f]$/u, widened),
      normalized("NFD"),
      toLatin,
      normalized("NFC")
    )
  );
  var hiraganaLatin = within(
    /^[\u3099ぁ-ゔゝゞガギグゲゴザジズゼゾダヂヅデドバビブベボヴヷ-ヺーヾ]$/u,
    inOrder(normalized("NFD"), rewritten(toKatakana), katakanaLatin, normalized("NFC"))
  );
  var scripts = [
    [/^[\p{sc=Common}\p{sc=Inherited}]$/u, null],
    [/^\p{sc=Hiragana}$/u, hiraganaLatin],
    [/^\p{sc=Katakana}$/u, katakanaLatin]
  ];
  var unscripted = scripts.length;
  var scriptOf = (character) => {
    const found = scripts.findIndex(([pattern]) => pattern.test(character));
    return found < 0 ? unscripted : found;
  };
  var shared = 0;
  function latin(value) {
    const text = Array.from(value);
    let limit = 0;
    while (limit < text.length) {
      let start = limit;
      while (start > 0 && scriptOf(text[start - 1]) === shared) start--;
      let script = shared;
      while (limit < text.length) {
        const next = scriptOf(text[limit]);
        if (next !== shared) {
          if (script === shared) script = next;
          else if (next !== script) break;
        }
        limit++;
      }
      const step = scripts[script]?.[1];
      if (step) limit = step(text, start, limit);
    }
    return text.join("");
  }
  var firstKana = 12353;
  var hiraganaLetter = 1;
  var katakanaLetter = 2;
  var joinsThePrevious = 4;
  var needsTheNext = 8;
  var kanaKinds = new Uint8Array(12540 - firstKana + 1);
  for (let unit = 12353; unit <= 12436; unit++) kanaKinds[unit - firstKana] = hiraganaLetter;
  for (let unit = 12449; unit <= 12534; unit++) kanaKinds[unit - firstKana] = katakanaLetter;
  kanaKinds[12540 - firstKana] = hiraganaLetter | katakanaLetter;
  for (const kana of "ぁぃぅぇぉゃゅょァィゥェォャュョー") {
    kanaKinds[kana.charCodeAt(0) - firstKana] |= joinsThePrevious;
  }
  for (const kana of "っんッン") kanaKinds[kana.charCodeAt(0) - firstKana] |= needsTheNext;
  var longestPiece = 4;
  var rememberedPieces = 8192;
  var knownPieces = /* @__PURE__ */ new Map();
  function pieceLatin(piece) {
    if (piece.length > longestPiece) return void 0;
    let written3 = knownPieces.get(piece);
    if (written3 === void 0) {
      written3 = latin(piece);
      if (knownPieces.size < rememberedPieces) knownPieces.set(piece, written3);
    }
    return written3;
  }
  function plainKanaLatin(reading) {
    let scripts2 = hiraganaLetter | katakanaLetter;
    let written3 = "";
    let start = 0;
    let open = true;
    for (let index = 0; index < reading.length; index++) {
      const kind = kanaKinds[reading.charCodeAt(index) - firstKana] ?? 0;
      scripts2 &= kind;
      if (scripts2 === 0) return void 0;
      if ((kind & joinsThePrevious) === 0) {
        if (!open) {
          const piece = pieceLatin(reading.slice(start, index));
          if (piece === void 0) return void 0;
          written3 += piece;
          start = index;
        }
      } else if (index === 0) {
        return void 0;
      }
      open = (kind & needsTheNext) !== 0;
    }
    const last = pieceLatin(reading.slice(start));
    return last === void 0 ? void 0 : written3 + last;
  }
  var kanji = /[\u3005\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/u;
  function romaji(reading) {
    if (reading === "") return null;
    return plainKanaLatin(reading) ?? (kanji.test(reading) ? null : latin(reading));
  }
  function startsWithALetter(surface) {
    const unit = surface.charCodeAt(0);
    return unit >= 12353 && unit <= 12438 || unit >= 12449 && unit <= 12538 || unit >= 19968 && unit <= 40959 || unit >= 97 && unit <= 122 || unit >= 65 && unit <= 90 || unit >= 48 && unit <= 57;
  }
  function attachment(surface) {
    if (startsWithALetter(surface)) return null;
    if (!/^[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}]+$/u.test(surface)) return null;
    return /^[\p{Ps}\p{Pi}]/u.test(surface) ? "next" : "previous";
  }
  var startsWithSpace = (character) => character !== void 0 && /^\p{White_Space}/u.test(character);
  function endsWithSpace(sentence) {
    const ending = sentence.slice(-2);
    return startsWithSpace(everyUnitIsAGrapheme(ending) ? ending.at(-1) : graphemes(sentence).at(-1));
  }
  function sentenceRomaji(words) {
    if (words.length === 0) return null;
    let sentence = "";
    let previous = null;
    for (const { surface, reading } of words) {
      const isAWord = startsWithALetter(surface);
      if (!isAWord && graphemes(surface).every(startsWithSpace)) {
        sentence += surface;
        previous = null;
        continue;
      }
      const spoken = reading !== null && reading !== "" && reading !== "*" ? reading : surface;
      const piece = romaji(spoken);
      if (piece === null) return null;
      const attaches2 = attachment(surface);
      const joined2 = sentence === "" || attaches2 === "previous" || previous === "next" || endsWithSpace(sentence);
      sentence += joined2 ? piece : ` ${piece}`;
      previous = attaches2;
    }
    return sentence;
  }

  // src/search/query.ts
  var graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  function graphemes2(value) {
    return everyUnitIsAGrapheme(value) ? value.split("") : Array.from(graphemeSegmenter.segment(value), (segment) => segment.segment);
  }
  function compareScalars(lhs, rhs) {
    const left = Array.from(lhs);
    const right = Array.from(rhs);
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const difference = (left[index].codePointAt(0) ?? 0) - (right[index].codePointAt(0) ?? 0);
      if (difference !== 0) return difference;
    }
    return left.length - right.length;
  }
  var isSurrogate = (unit) => unit >= 55296 && unit <= 57343;
  function compareStrings(lhs, rhs) {
    const length2 = Math.min(lhs.length, rhs.length);
    for (let index = 0; index < length2; index++) {
      const left = lhs.charCodeAt(index);
      const right = rhs.charCodeAt(index);
      if (left === right) continue;
      return isSurrogate(left) || isSurrogate(right) ? compareScalars(lhs, rhs) : left - right;
    }
    return lhs.length - rhs.length;
  }
  var whitespace = /\p{White_Space}/u;
  function normalizeQuery(raw) {
    const folded = raw.normalize("NFKC").toLowerCase();
    if (!whitespace.test(folded)) return folded;
    if (everyUnitIsAGrapheme(folded)) return folded.split(" ").filter(Boolean).join(" ");
    const words = [];
    let word = "";
    for (const grapheme of graphemes2(folded)) {
      if (/^\p{White_Space}/u.test(grapheme)) {
        if (word) words.push(word);
        word = "";
      } else {
        word += grapheme;
      }
    }
    if (word) words.push(word);
    return words.join(" ");
  }
  function isASCII(value) {
    return !/[\u0080-\uffff]/.test(value);
  }
  var wildcard = /[*^]/;
  var englishWord = /[0-9a-z]+(?:['-][0-9a-z]+)*/g;
  function englishSentenceWords(value) {
    return wildcard.test(value) ? [] : [...new Set(value.match(englishWord) ?? [])];
  }
  function isJapaneseScalar(codePoint) {
    return codePoint === 12293 || codePoint >= 12352 && codePoint <= 12543 || codePoint >= 13312 && codePoint <= 19903 || codePoint >= 19968 && codePoint <= 40959;
  }
  function japaneseSegments(value) {
    const segments = [];
    let current = "";
    for (const character of graphemes2(value)) {
      if (Array.from(character).every((scalar) => isJapaneseScalar(scalar.codePointAt(0) ?? 0))) {
        current += character;
      } else if (current) {
        segments.push(current);
        current = "";
      }
    }
    if (current) segments.push(current);
    return segments.map(normalizeQuery);
  }
  var japaneseScalars = /^[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+$/;
  function isJapaneseOnly(value) {
    return japaneseScalars.test(value) && normalizeQuery(value) === value;
  }
  function japaneseCandidates(candidates) {
    const kept = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      const query = normalizeQuery(candidate);
      if (isJapaneseOnly(query)) kept.add(query);
    }
    return [...kept];
  }
  function isMixedScript(value) {
    return japaneseSegments(value).length > 0 && /[a-z]/i.test(value);
  }
  var irregularDictionaryForms = /* @__PURE__ */ new Map([
    ["shita", "suru"],
    ["shite", "suru"],
    ["kita", "kuru"],
    ["kite", "kuru"],
    ["itta", "iku"],
    ["itte", "iku"]
  ]);
  function romajiDeinflectedCandidates(value) {
    if (!isASCII(value)) return [];
    const candidates = [];
    const append = (candidate) => {
      const query = normalizeQuery(candidate);
      if (query !== value && !candidates.includes(query)) candidates.push(query);
    };
    const replaceSuffix = (suffix, endings) => {
      if (!value.endsWith(suffix) || value.length <= suffix.length) return;
      const stem = value.slice(0, -suffix.length);
      for (const ending of endings) append(stem + ending);
    };
    const irregular = irregularDictionaryForms.get(value);
    if (irregular) append(irregular);
    replaceSuffix("shita", ["su"]);
    replaceSuffix("shite", ["su"]);
    replaceSuffix("tta", ["u", "tsu", "ru"]);
    replaceSuffix("tte", ["u", "tsu", "ru"]);
    replaceSuffix("nda", ["mu", "bu", "nu"]);
    replaceSuffix("nde", ["mu", "bu", "nu"]);
    replaceSuffix("ita", ["ku"]);
    replaceSuffix("ite", ["ku"]);
    replaceSuffix("ida", ["gu"]);
    replaceSuffix("ide", ["gu"]);
    replaceSuffix("sete", ["seru", "su"]);
    replaceSuffix("ta", ["ru"]);
    replaceSuffix("te", ["ru"]);
    return candidates;
  }
  var literalReplacements = { mondai: "monday" };
  function literalQuery(value) {
    return literalReplacements[value] ?? value;
  }

  // src/browse/lists.ts
  var rankedListLimit = 1e4;
  var rankBandSize = 1e3;
  var rankBands = rankedListLimit / rankBandSize;
  var rankBand = (band) => ({
    band,
    first: (band - 1) * rankBandSize + 1,
    last: band * rankBandSize
  });
  var allRankBands = Array.from(
    { length: rankBands },
    (_, index) => rankBand(index + 1)
  );
  var jitenPack = (name2) => ({
    kind: "pack",
    packId: `zenbu.jiten.${name2}.ja.ordered-v2`
  });
  var rankedLists = [
    { slug: "youtube", name: "YouTube", chip: "YouTube", source: { kind: "tubelex" } },
    {
      slug: "wikipedia",
      name: "Wikipedia",
      chip: "Wikipedia",
      source: { kind: "pack", packId: "zenbu.wikipedia.written.ja.unidic-3.1" }
    },
    {
      slug: "tv-and-movies",
      name: "TV and movies",
      chip: "TV & Movies",
      source: jitenPack("tv-movies")
    },
    { slug: "anime", name: "Anime", chip: "Anime", source: jitenPack("anime") },
    { slug: "manga", name: "Manga", chip: "Manga", source: jitenPack("manga") },
    { slug: "novels", name: "Novels", chip: "Novels", source: jitenPack("novels") },
    {
      slug: "visual-novels",
      name: "Visual novels",
      chip: "Visual Novels",
      source: jitenPack("visual-novels")
    },
    { slug: "video-games", name: "Video games", chip: "Games", source: jitenPack("video-games") }
  ];
  var rankedPackIds = rankedLists.flatMap(
    ({ source }) => source.kind === "pack" ? [source.packId] : []
  );
  var jlptLists = [5, 4, 3, 2, 1].map((level) => ({
    slug: `jlpt-n${level}`,
    name: `JLPT N${level}`,
    level
  }));
  var gradeLists = [1, 2, 3, 4, 5, 6].map((grade) => ({
    slug: `grade-${grade}`,
    name: `Grade ${grade}`,
    grades: [grade]
  }));
  var secondarySchool = {
    slug: "secondary-school",
    name: "Secondary school",
    grades: [8]
  };
  var jinmeiyo = { slug: "jinmeiyo", name: "Jinmeiyō", grades: [9, 10] };
  var schoolLists = [...gradeLists, secondarySchool, jinmeiyo];
  var jlptKanjiLists = jlptLists.map(({ slug, name: name2, level }) => ({
    slug,
    name: name2,
    jlptLevel: level
  }));

  // src/search/database.ts
  var interruptedSearch = "The search was interrupted";
  function stopIfInterrupted(client, step) {
    if ((step & 1023) === 0 && client.interrupted?.()) throw new Error(interruptedSearch);
  }
  function truncatedAtNul(param) {
    return typeof param === "string" ? param.split("\0", 1)[0] : param;
  }
  function withParametersTruncatedAtNul(db) {
    return {
      all(sql, params) {
        return db.all(sql, params.map(truncatedAtNul));
      },
      interrupted: () => db.interrupted?.() ?? false
    };
  }
  var listedIds = "SELECT unhex(value) FROM json_each(?)";
  var FormKind = { written: 0, reading: 1, romaji: 2 };
  var entryColumns = `lower(hex(e.id)) AS id, e.source_record_id, e.headword, e.reading,
  e.summary, e.parts_of_speech_json, lower(hex(e.semantic_fingerprint)) AS semantic_fingerprint`;
  function decodeEntry(row) {
    return {
      id: row.id,
      sourceRecordId: row.source_record_id,
      headword: row.headword,
      reading: row.reading,
      summary: row.summary,
      partsOfSpeech: JSON.parse(row.parts_of_speech_json)
    };
  }
  function profile(row) {
    return {
      primaryMask: row.primary_mask ?? 0,
      secondaryMask: row.secondary_mask ?? 0,
      newsFrequencyBand: row.news_frequency_band
    };
  }

  // src/artifact/database.ts
  function searchDatabase(db) {
    return {
      async all(sql, params) {
        return db.all(sql, params);
      },
      interrupted: () => db.interrupted?.() ?? false
    };
  }
  var attachments = {
    compound_pitch: {
      file: "CompoundPitch.sqlite3",
      schema: "zenbu.compound-pitch.v1",
      languageData: true
    },
    jlpt: {
      file: "JLPTLevelPack.sqlite3",
      schema: "zenbu.level-pack.v1",
      packId: "zenbu.jlpt.waller.levels",
      languageData: true
    },
    tubelex: {
      file: "TUBELEXFrequencyPack.sqlite3",
      schema: "zenbu.frequency-pack.v1",
      packId: "zenbu.tubelex.youtube.ja.unidic-3.1",
      languageData: true
    },
    strokes: {
      file: "KanjiStrokeData.sqlite3",
      schema: "zenbu.kanji-stroke-diagrams.v1",
      source: "kanjivg",
      languageData: false
    },
    word_index: {
      file: "ExampleWordIndex.sqlite3",
      schema: "zenbu.example-word-index.v2",
      languageData: true
    },
    ranked: {
      file: "RankedLists.sqlite3",
      schema: "zenbu.ranked-lists.v1",
      languageData: true
    }
  };
  var exampleIndexMetadata = {
    retrieval_index_schema_version: "zenbu.example-sentence-retrieval-index.v2",
    retrieval_policy_version: "ExampleSentenceRetrievalPolicy/v1",
    retrieval_porter_tokenizer: "fts4/porter",
    retrieval_exact_tokenizer: "fts4/simple",
    retrieval_pair_id_scheme: "esp1-sha256-128-nfc-length-prefixed"
  };
  function metadata(db, schema) {
    const rows = db.all(`SELECT key, value FROM ${schema}.metadata`);
    return new Map(rows.map((row) => [row.key, row.value]));
  }
  var refuse = (message2) => {
    throw new Error(`Refusing the language data: ${message2}`);
  };
  function checkExampleIndex(db) {
    const main = metadata(db, "main");
    for (const [key, expected] of Object.entries(exampleIndexMetadata)) {
      if (main.get(key) !== expected) refuse(`its ${key} is ${main.get(key)}, not ${expected}`);
    }
    for (const key of [
      "retrieval_corpus_sha256",
      "retrieval_index_mapping_sha256",
      "retrieval_importer_sha256",
      "retrieval_provenance_sha256"
    ]) {
      if (!/^[0-9a-f]{64}$/.test(main.get(key) ?? "")) refuse(`its ${key} isn't a SHA-256`);
    }
    const sentences = Number(main.get("example_sentences"));
    const indexed = [
      main.get("retrieval_index_row_count"),
      main.get("retrieval_exact_index_row_count")
    ];
    if (!(sentences > 0) || !(Number(main.get("retrieval_provenance_row_count")) >= sentences) || indexed.some((count) => Number(count) !== sentences)) {
      refuse("its example index counts don't match its example sentences");
    }
  }
  function checkAttached(db, name2) {
    const expected = attachments[name2];
    const recorded = metadata(db, name2);
    const schema = recorded.get("artifact_schema");
    if (schema !== expected.schema) {
      refuse(`${expected.file} is ${schema}; the core reads ${expected.schema}`);
    }
    return recorded;
  }
  function checkWordIndex(db) {
    checkAttached(db, "word_index");
  }
  function checkExamples(db) {
    checkExampleIndex(db);
    checkWordIndex(db);
  }

  // src/detail/ruby.ts
  function isKanjiOrIterationMark(character) {
    return character === "々" || isCJKUnifiedIdeograph(character);
  }
  function rubySegments(surface, reading) {
    const characters = graphemes(surface);
    if (!characters.some(isKanjiOrIterationMark) || surface === reading) return [{ text: surface }];
    const runs = [];
    for (const character of characters) {
      const isKanji = isKanjiOrIterationMark(character);
      const last = runs.at(-1);
      if (last && last.isKanji === isKanji) last.base += character;
      else runs.push({ base: character, isKanji });
    }
    if (!runs.some((run) => run.isKanji) || !runs.some((run) => !run.isKanji)) {
      return [{ text: surface, reading }];
    }
    return alignedSegments(runs, reading) ?? runs.map((run) => ({ text: run.base }));
  }
  function alignedSegments(runs, reading) {
    const originalReading = graphemes(reading);
    const normalizedReading = normalizedKana(reading);
    let cursor = 0;
    const segments = [];
    for (const [index, run] of runs.entries()) {
      if (run.isKanji) {
        const nextKana = runs.slice(index + 1).find((next) => !next.isKanji);
        if (nextKana) {
          const anchorStart = firstIndex(normalizedKana(nextKana.base), normalizedReading, cursor + 1);
          if (anchorStart === null) return null;
          const ruby = originalReading.slice(cursor, anchorStart).join("");
          if (!ruby) return null;
          segments.push({ text: run.base, reading: ruby });
          cursor = anchorStart;
        } else {
          if (cursor >= originalReading.length) return null;
          segments.push({ text: run.base, reading: originalReading.slice(cursor).join("") });
          cursor = originalReading.length;
        }
      } else {
        const anchor = normalizedKana(run.base);
        if (cursor + anchor.length > normalizedReading.length || !sameCharacters(normalizedReading.slice(cursor, cursor + anchor.length), anchor)) {
          return null;
        }
        segments.push({ text: run.base });
        cursor += anchor.length;
      }
    }
    return cursor === originalReading.length ? segments : null;
  }
  var katakanaWithoutPrecomposedHiragana = {
    ヷ: "わ゙",
    ヸ: "ゐ゙",
    ヹ: "ゑ゙",
    ヺ: "を゙"
  };
  function normalizedKana(value) {
    const converted = value.replace(/[ァ-ヶヽヾヷ-ヺ]/gu, (character) => {
      const voiced = katakanaWithoutPrecomposedHiragana[character];
      return voiced ?? String.fromCodePoint((character.codePointAt(0) ?? 0) - 96);
    });
    return graphemes(converted);
  }
  function sameCharacters(left, right) {
    return left.length === right.length && left.every((character, index) => character === right[index]);
  }
  function firstIndex(needle, haystack, start) {
    if (needle.length === 0 || start < 0 || start + needle.length > haystack.length) return null;
    for (let index = start; index <= haystack.length - needle.length; index++) {
      if (sameCharacters(haystack.slice(index, index + needle.length), needle)) return index;
    }
    return null;
  }

  // src/detail/strokes.ts
  var moveOpcode = 0;
  var cubicOpcode = 1;
  var point = (encoded, index) => ({
    x: encoded[index],
    y: encoded[index + 1]
  });
  function strokeSegments(encoded) {
    const segments = [];
    let index = 0;
    while (index < encoded.length) {
      const opcode = encoded[index];
      index += 1;
      if (opcode === moveOpcode) {
        if (index + 1 >= encoded.length) throw new Error("incomplete move command");
        segments.push({ end: point(encoded, index), controls: null });
        index += 2;
      } else if (opcode === cubicOpcode) {
        if (index + 5 >= encoded.length) throw new Error("incomplete cubic command");
        segments.push({
          end: point(encoded, index + 4),
          controls: [point(encoded, index), point(encoded, index + 2)]
        });
        index += 6;
      } else {
        throw new Error("unknown path opcode");
      }
    }
    if (segments.length === 0 || segments[0].controls !== null) {
      throw new Error("stroke does not begin with a move");
    }
    return segments;
  }
  var written = ({ x, y }) => `${x} ${y}`;
  function decodeStroke(encoded) {
    const segments = strokeSegments(encoded);
    return {
      path: segments.map(
        ({ end, controls }) => controls ? `C${[...controls, end].map(written).join(" ")}` : `M${written(end)}`
      ).join(""),
      start: segments[0].end
    };
  }
  function checkStrokeCount(row) {
    if (row.strokes.length === 0 || row.strokes.length !== row.strokeCount) {
      throw new Error("stroke-count mismatch");
    }
  }
  function strokeOrder(row) {
    const strokes = row.strokes.map(decodeStroke);
    checkStrokeCount(row);
    return { viewportSize: row.viewportSize, strokes };
  }
  function strokeDiagram(row) {
    const strokes = row.strokes.map(strokeSegments);
    checkStrokeCount(row);
    return { viewportSize: row.viewportSize, strokes };
  }

  // src/detail/kanji.ts
  var kanjiWordLimit = 24;
  var compareLowercaseHex = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  var codePointLength = (value) => [...value].length;
  var wordsPerReading = 3;
  var meaningsPerElement = 3;
  function kanjiWords(character, rows, limit = kanjiWordLimit) {
    const groups = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const group = groups.get(row.fingerprint) ?? { entries: [], matching: [] };
      group.entries.push(row);
      if (row.containsKanji) group.matching.push(row);
      groups.set(row.fingerprint, group);
    }
    const ranked = [...groups].filter(([, group]) => group.matching.length > 0).map(([fingerprint, { entries, matching }]) => ({
      fingerprint,
      entries,
      startsLater: Math.min(...matching.map((row) => row.headword.startsWith(character) ? 0 : 1)),
      length: Math.min(...matching.map((row) => codePointLength(row.headword))),
      isCommon: matching.some((row) => row.isCommon) ? 1 : 0,
      rankScore: Math.max(...matching.map((row) => row.rankScore))
    })).sort(
      (left, right) => left.startsLater - right.startsLater || left.length - right.length || right.isCommon - left.isCommon || right.rankScore - left.rankScore || compareLowercaseHex(left.fingerprint, right.fingerprint)
    );
    return ranked.slice(0, limit).map(
      ({ entries }) => entries.reduce((smallest, row) => row.id < smallest.id ? row : smallest)
    );
  }
  function wordsForReading(reading, words) {
    const stem = hiragana(reading.value.replaceAll(".", "").replaceAll("-", ""));
    if (!stem) return [];
    return words.filter((word) => hiragana(word.reading).startsWith(stem)).slice(0, wordsPerReading);
  }
  var roleLabels = {
    meaningStructure: "Meaning / structure",
    sound: "Sound",
    soundPattern: "Sound pattern"
  };
  function kanjiElements(structure, elements) {
    if (!structure) return [];
    return structure.elementGlyphs.flatMap((glyph) => {
      const element = elements.find((candidate) => candidate.glyph === glyph);
      if (!element || !isKanjiCharacter(glyph)) return [];
      const role = structure.explicitPhoneticElement === glyph ? "sound" : element.commonLinkedOnReadings.some((reading) => structure.onReadings.includes(reading)) ? "soundPattern" : "meaningStructure";
      const meanings = element.meanings.slice(0, meaningsPerElement);
      const linkedOnReadings = meanings.length > 0 ? [] : element.commonLinkedOnReadings;
      const description = meanings.length > 0 ? meanings.join(", ") : linkedOnReadings.length > 0 ? `Linked on-readings: ${linkedOnReadings.join(", ")}` : "";
      const roleLabel = roleLabels[role];
      const spoken = `Element ${glyph}, ${roleLabel.toLowerCase()}, ${meanings.join(", ")}`;
      return [{ character: glyph, role, roleLabel, meanings, linkedOnReadings, description, spoken }];
    });
  }
  var readingLabels = { on: "On", kun: "Kun", name: "Name" };
  function kanjiShareText(kanji2) {
    const readings = kanji2.readings.map((reading) => reading.value).join("、");
    const heading = readings ? `${kanji2.character}【${readings}】` : kanji2.character;
    return [heading, kanji2.meanings.join(", ")].filter(Boolean).join("\n");
  }
  function kanjiStats(kanji2) {
    const strokes = kanji2.strokeCount === 1 ? "Stroke" : "Strokes";
    const stats = [
      {
        kind: "strokes",
        label: strokes,
        value: `${kanji2.strokeCount}`,
        spoken: `${kanji2.strokeCount} ${strokes}`
      }
    ];
    if (kanji2.grade !== null) {
      stats.push({
        kind: "grade",
        label: "Grade",
        value: `${kanji2.grade}`,
        spoken: `Grade ${kanji2.grade}`
      });
    }
    if (kanji2.jlpt !== null) {
      stats.push({
        kind: "jlpt",
        label: "JLPT",
        value: `N${kanji2.jlpt}`,
        spoken: `JLPT N${kanji2.jlpt}`
      });
    }
    return stats;
  }
  function drawableStrokeOrder(row) {
    try {
      return strokeOrder(row);
    } catch {
      return null;
    }
  }
  function kanjiDetail(rows) {
    const { kanji: kanji2 } = rows;
    const words = rows.words.map((row) => ({
      id: row.id,
      entSeq: row.entSeq,
      headword: row.headword,
      reading: row.reading,
      ruby: rubySegments(row.headword, row.reading),
      summary: row.summary
    }));
    const elements = kanjiElements(rows.structure, rows.elements);
    return {
      character: kanji2.character,
      stats: kanjiStats(kanji2),
      meanings: kanji2.meanings,
      readings: kanji2.readings.map((reading) => ({
        kind: reading.kind,
        label: readingLabels[reading.kind],
        value: reading.value,
        words: wordsForReading(reading, words)
      })),
      components: elements.length === 0 ? kanji2.components : [],
      elements,
      words,
      strokeOrder: rows.strokes ? drawableStrokeOrder(rows.strokes) : null,
      shareText: kanjiShareText(kanji2)
    };
  }

  // src/artifact/kanji.ts
  function kanjiCandidateRows(db, character) {
    const rows = db.all(
      `WITH matching AS (
       SELECT DISTINCT f.entry_id FROM forms f WHERE f.kind = 0 AND instr(f.form, ?) > 0
     ),
     leading AS (
       SELECT m.semantic_fingerprint
       FROM entries m
       WHERE m.id IN (SELECT entry_id FROM matching)
       GROUP BY m.semantic_fingerprint
       ORDER BY MIN(CASE WHEN instr(m.headword, ?) = 1 THEN 0 ELSE 1 END),
         MIN(length(m.headword)), MAX(m.is_common) DESC, MAX(m.rank_score) DESC,
         m.semantic_fingerprint
       LIMIT ?
     )
     SELECT lower(hex(e.id)) AS id, e.source_record_id AS ent_seq, e.headword, e.reading,
       e.summary, lower(hex(e.semantic_fingerprint)) AS fingerprint, e.is_common, e.rank_score,
       e.id IN (SELECT entry_id FROM matching) AS contains_kanji
     FROM entries e
     WHERE e.semantic_fingerprint IN (SELECT semantic_fingerprint FROM leading)
     ORDER BY lower(hex(e.id))`,
      [character, character, kanjiWordLimit]
    );
    return rows.map((row) => ({
      id: row.id,
      entSeq: row.ent_seq,
      headword: row.headword,
      reading: row.reading,
      summary: row.summary,
      fingerprint: row.fingerprint,
      isCommon: row.is_common !== 0,
      rankScore: row.rank_score,
      containsKanji: row.contains_kanji !== 0
    }));
  }

  // src/artifact/words.ts
  var jmdictSource = "edrdg.jmdict";

  // src/detail/links.ts
  var websiteHost = "zenbujapanese.com";
  function decodeSegment(segment) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
  function wordSegment(decoded) {
    const match = decoded.match(/^(?:(.*)-)?(\d+)$/u);
    if (!match) return null;
    const entSeq = Number(match[2]);
    return Number.isSafeInteger(entSeq) ? { slug: match[1] ?? "", entSeq } : null;
  }
  var home = { kind: "home" };
  var surroundingSpace = /^[\p{Z}\t-\r\x85]+|[\p{Z}\t-\r\x85]+$/gu;
  function websitePage(host, path) {
    if (host?.toLowerCase() !== websiteHost) return home;
    const [section, page, detail] = path.split("/").filter(Boolean).map(decodeSegment);
    if (section !== "dictionary" || page === void 0) return home;
    if (page === "search") {
      const query = detail?.replace(surroundingSpace, "") ?? "";
      return query === "" ? home : { kind: "search", query };
    }
    if (page === "kanji") {
      return detail !== void 0 && isKanjiCharacter(detail) ? { kind: "kanji", character: detail } : home;
    }
    const word = wordSegment(page);
    return word ? { kind: "word", ...word } : home;
  }

  // src/detail/frequency.ts
  function tierForRank(rank) {
    if (rank <= 1500) return "veryCommon";
    if (rank <= 5e3) return "common";
    if (rank <= 15e3) return "moderate";
    if (rank <= 3e4) return "uncommon";
    return "rare";
  }
  function tierForLevel(level) {
    if (level >= 4) return "veryCommon";
    if (level >= 2) return "common";
    return "moderate";
  }
  var defaultFrequencyPacks = [
    {
      pack: "jlpt",
      id: "zenbu.jlpt.waller.levels",
      kind: "level",
      name: "JLPT Levels",
      domain: "JLPT study levels (unofficial)",
      description: "Estimated JLPT levels (N5–N1) from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010, so levels are study estimates, not an exam syllabus.",
      version: "2025-08-26",
      source: "JLPT vocabulary lists by Jonathan Waller, with JMdict IDs by stephenmk (CC BY-SA 4.0)",
      coveredSourceRows: 8293
    },
    {
      pack: "tubelex",
      id: "zenbu.tubelex.youtube.ja.unidic-3.1",
      kind: "rank",
      name: "YouTube",
      domain: "Everyday YouTube Japanese · TUBELEX",
      description: "Japanese used in YouTube subtitles across everyday media categories; this is media frequency, not universal Japanese frequency.",
      version: "2025.1",
      source: "TUBELEX Japanese frequency lists by Adam Nohejl and contributors",
      coveredSourceRows: 351453
    }
  ];
  function defaultValue(pack, rows) {
    const row = rows.find((candidate) => candidate.pack === pack);
    return !row ? null : row.pack === "jlpt" ? row.level : row.rank;
  }
  function defaultFrequencyLookups(rows) {
    return defaultFrequencyPacks.map((dictionary) => ({
      dictionary,
      value: defaultValue(dictionary.pack, rows)
    }));
  }
  var familyShortNames = /* @__PURE__ */ new Map([
    ["zenbu.tubelex.youtube", "YouTube"],
    ["zenbu.wikipedia.written", "Wikipedia"],
    ["zenbu.jlpt.waller", "JLPT"],
    ["zenbu.jiten.video-games", "Games"]
  ]);
  function frequencyFamily(id) {
    return id.split(".").filter((part) => part !== "").slice(0, 3).join(".");
  }
  function frequencyShortName(dictionary) {
    return familyShortNames.get(frequencyFamily(dictionary.id)) ?? dictionary.name;
  }
  function frequencySortName(dictionary) {
    return dictionary.kind === "level" ? frequencyShortName(dictionary) : dictionary.name;
  }
  var listed = (lookup) => "unavailable" in lookup || lookup.value === null ? null : { dictionary: lookup.dictionary, value: lookup.value };
  function frequencySortValue(lookup) {
    const found = listed(lookup);
    if (!found) return null;
    return found.dictionary.kind === "level" ? 6 - found.value : found.value;
  }
  function frequencyTier(lookup) {
    const found = listed(lookup);
    if (!found) return null;
    return found.dictionary.kind === "level" ? tierForLevel(found.value) : tierForRank(found.value);
  }
  var levelExplanation = "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010.";
  var tierLabels = {
    veryCommon: "very common",
    common: "common",
    moderate: "moderately common",
    uncommon: "uncommon",
    rare: "rare"
  };
  var formatRank = new Intl.NumberFormat("en-US");
  function levelResult(source, level) {
    return { source, value: `N${level}`, tier: tierForLevel(level), spokenTier: null };
  }
  function rankResult(source, rank) {
    const tier = tierForRank(rank);
    return { source, value: formatRank.format(rank), tier, spokenTier: tierLabels[tier] };
  }
  function topPercent(rank, coveredSourceRows) {
    return `Top ${(rank / coveredSourceRows * 100).toFixed(2)}%`;
  }
  var packDetails = ({
    name: name2,
    domain,
    description,
    version,
    source
  }) => ({ name: name2, domain, description, version, source });
  function listedRow(dictionary, value) {
    const source = frequencyShortName(dictionary);
    const pack = packDetails(dictionary);
    if (value === null) {
      const isLevel = dictionary.kind === "level";
      return {
        pack: dictionary.id,
        source,
        value: isLevel ? "Not listed" : "No rank",
        tier: null,
        spokenTier: null,
        label: isLevel ? `${source} does not list this entry` : `${source} has no rank for this entry`,
        details: {
          pack,
          section: "Frequency",
          rows: [],
          explanation: isLevel ? `${dictionary.name} does not list this entry. ${levelExplanation}` : `${dictionary.name} has no mapped frequency rank for this entry.`
        }
      };
    }
    if (dictionary.kind === "level") {
      const result4 = levelResult(source, value);
      return {
        pack: dictionary.id,
        ...result4,
        label: `${source} level ${result4.value}`,
        details: {
          pack,
          section: "Level",
          rows: [{ label: "JLPT Level", value: result4.value }],
          explanation: null
        }
      };
    }
    const result3 = rankResult(source, value);
    return {
      pack: dictionary.id,
      ...result3,
      label: `${source} frequency rank ${value}, ${result3.spokenTier}`,
      details: {
        pack,
        section: "Frequency",
        rows: [
          { label: "Rank", value: `#${result3.value}` },
          { label: "Percentile", value: topPercent(value, dictionary.coveredSourceRows) }
        ],
        explanation: null
      }
    };
  }
  function frequencyLookupRow(lookup) {
    if (!("unavailable" in lookup)) return listedRow(lookup.dictionary, lookup.value);
    const source = lookup.dictionary ? frequencyShortName(lookup.dictionary) : "Frequency";
    return {
      pack: lookup.dictionary?.id ?? null,
      source,
      value: "Unavailable",
      tier: null,
      spokenTier: null,
      label: `${source} rank unavailable`,
      details: {
        pack: lookup.dictionary ? packDetails(lookup.dictionary) : null,
        section: "Frequency",
        rows: [],
        explanation: lookup.unavailable
      }
    };
  }
  function frequencyRowDetails(rows) {
    return defaultFrequencyPacks.map(
      (dictionary) => listedRow(dictionary, defaultValue(dictionary.pack, rows))
    );
  }
  function frequencyLookupChips(lookups, leadingFamily = null) {
    if (lookups === null) return { chips: [], spoken: "Frequency rank loading" };
    if (lookups.length === 0) return { chips: [], spoken: "No frequency dictionary enabled" };
    const leads = (lookup) => leadingFamily !== null && lookup.dictionary !== null && frequencyFamily(lookup.dictionary.id) === leadingFamily;
    const inOrder2 = [...lookups.filter(leads), ...lookups.filter((lookup) => !leads(lookup))];
    const shown = inOrder2.filter((lookup, offset) => {
      if (listed(lookup)) return true;
      if (!("unavailable" in lookup) && lookup.dictionary.kind === "level") return false;
      return offset === 0;
    });
    if (shown.length === 0) return { chips: [], spoken: "No frequency rank" };
    const rows = shown.map(frequencyLookupRow);
    return {
      chips: rows.map(({ pack, source, value, tier, spokenTier }) => ({
        pack,
        source,
        value: tier === null ? "—" : value,
        tier,
        spokenTier
      })),
      spoken: rows.map((row) => row.label).join(", ")
    };
  }
  function frequencyChips(rows) {
    return frequencyLookupChips(defaultFrequencyLookups(rows)).chips.map(
      ({ source, value, tier, spokenTier }) => ({ source, value, tier, spokenTier })
    );
  }
  function frequencyUnavailableNotice(entries) {
    const dictionaryCount = Math.max(0, ...entries.map((lookups) => lookups.length));
    const unavailable = [];
    for (let position = 0; position < dictionaryCount; position++) {
      for (const lookups of entries) {
        const lookup = lookups[position];
        if (lookup && "unavailable" in lookup) {
          unavailable.push(lookup);
          break;
        }
      }
    }
    if (unavailable.length === 0) return null;
    if (unavailable.length === dictionaryCount) {
      return `Frequency ordering unavailable. Showing dictionary relevance order. ${unavailable[0].unavailable}`;
    }
    const names = unavailable.map(
      ({ dictionary }) => dictionary ? frequencyShortName(dictionary) : "A frequency dictionary"
    );
    return `${listedWithAnd(names)} unavailable. Search is ordered by the other enabled dictionaries.`;
  }

  // src/examples/retrieval.ts
  var exampleLimit = 100;
  var exactExampleCountLimit = 50;
  function reportedExampleCount(matches) {
    return matches > exactExampleCountLimit ? exactExampleCountLimit + 1 : matches;
  }
  var LexicalRelation = {
    selectedWrittenForm: 4,
    alternateWrittenForm: 5,
    reading: 6
  };
  function normalizedEntryEvidence(value) {
    const words = [];
    let word = "";
    for (const character of graphemes(value.normalize("NFKC"))) {
      if (/^\p{White_Space}/u.test(character)) {
        if (word) words.push(word);
        word = "";
      } else {
        word += character;
      }
    }
    if (word) words.push(word);
    return words.join(" ");
  }
  function graphemePosition(term, text) {
    const index = text.indexOf(term);
    if (index < 0) return null;
    return graphemeCount(text.slice(0, index));
  }
  function compareRanks(left, right) {
    if (left.relation !== right.relation) return left.relation - right.relation;
    if (left.position !== right.position) return left.position - right.position;
    if (left.graphemeCount !== right.graphemeCount) return left.graphemeCount - right.graphemeCount;
    return left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0;
  }

  // src/search/rank.ts
  var special = 1;
  var learner = 2;
  var news = 4;
  var loanword = 8;
  var isMarked = (profile2) => profile2.primaryMask !== 0 || profile2.secondaryMask !== 0 || profile2.newsFrequencyBand !== null;
  function category({ primaryMask, secondaryMask }) {
    if (primaryMask & special) return 0;
    if (primaryMask & learner) return 1;
    if (primaryMask & news) return 2;
    if (primaryMask & loanword || secondaryMask & special) return 3;
    if (secondaryMask & (learner | news)) return 4;
    if (secondaryMask & loanword) return 5;
    return 9;
  }
  var bitCount = (value) => value.toString(2).replaceAll("0", "").length;
  function compareProfiles(lhs, rhs) {
    const categories = category(lhs) - category(rhs);
    if (categories !== 0) return categories;
    if (lhs.newsFrequencyBand !== rhs.newsFrequencyBand) {
      return (lhs.newsFrequencyBand ?? 99) - (rhs.newsFrequencyBand ?? 99);
    }
    return bitCount(rhs.primaryMask) - bitCount(lhs.primaryMask);
  }
  var profilesEqual = (lhs, rhs) => lhs.primaryMask === rhs.primaryMask && lhs.secondaryMask === rhs.secondaryMask && lhs.newsFrequencyBand === rhs.newsFrequencyBand;
  var EvidenceLane = {
    strongGloss: 0,
    tokenGloss: 1,
    romajiOnly: 2,
    exampleSentences: 3
  };
  var GlossRelation = {
    exactGloss: 0,
    qualifiedGloss: 1,
    exactInfinitive: 2,
    qualifiedInfinitive: 3,
    glossToken: 4
  };
  var RomajiRelation = { exact: 0, prefix: 1, contains: 2 };
  var FormRelation = {
    writtenExact: 0,
    readingExact: 1,
    writtenPrefix: 2,
    readingPrefix: 3,
    writtenContains: 4,
    readingContains: 5
  };
  function firstDifference(...differences) {
    for (const difference of differences) {
      const value = difference();
      if (value !== 0) return value;
    }
    return 0;
  }
  var isLaterSense = (rank) => rank.lane === EvidenceLane.strongGloss && rank.senseOrder > 0;
  var englishPlacement = (lhs, rhs) => [
    () => lhs.lane - rhs.lane,
    () => lhs.romajiSpecificityRank - rhs.romajiSpecificityRank,
    () => Number(isLaterSense(lhs)) - Number(isLaterSense(rhs))
  ];
  function compareEnglishRanks(lhs, rhs) {
    return firstDifference(
      ...englishPlacement(lhs, rhs),
      () => lhs.priorityPresenceRank - rhs.priorityPresenceRank,
      () => compareProfiles(lhs.priorityProfile, rhs.priorityProfile),
      () => lhs.senseOrder - rhs.senseOrder,
      () => lhs.glossOrder - rhs.glossOrder,
      () => lhs.corroborationRank - rhs.corroborationRank,
      () => lhs.headwordLength - rhs.headwordLength,
      () => compareStrings(lhs.semanticFingerprint, rhs.semanticFingerprint)
    );
  }
  function compareJapaneseRanks(lhs, rhs) {
    return firstDifference(
      () => lhs.relation - rhs.relation,
      () => compareProfiles(lhs.priorityProfile, rhs.priorityProfile),
      () => lhs.senseBreadthRank - rhs.senseBreadthRank,
      () => lhs.headwordLength - rhs.headwordLength,
      () => compareStrings(lhs.semanticFingerprint, rhs.semanticFingerprint)
    );
  }
  function comparePresentationRanks(lhs, rhs) {
    if (lhs.kind === "english" && rhs.kind === "english") {
      return firstDifference(...englishPlacement(lhs, rhs));
    }
    if (lhs.kind === "japanese" && rhs.kind === "japanese") return lhs.relation - rhs.relation;
    return lhs.kind === "english" ? -1 : 1;
  }
  var caseName = (cases, value) => Object.keys(cases).find((key) => cases[key] === value) ?? String(value);
  function matchLabel(sourceOrder, rank) {
    const match = rank.kind === "japanese" ? `japanese ${caseName(FormRelation, rank.relation)}` : `english ${caseName(EvidenceLane, rank.lane)} romaji=${rank.romajiSpecificityRank}` + (rank.lane === EvidenceLane.strongGloss ? ` sense=${isLaterSense(rank) ? "later" : "first"}` : "");
    return `source=${sourceOrder} ${match}`;
  }
  function sameLexicalGroup(lhs, rhs) {
    if (lhs.kind === "english" && rhs.kind === "english") {
      return firstDifference(...englishPlacement(lhs, rhs)) === 0 && lhs.priorityPresenceRank === rhs.priorityPresenceRank && profilesEqual(lhs.priorityProfile, rhs.priorityProfile) && lhs.senseOrder === rhs.senseOrder && lhs.glossOrder === rhs.glossOrder && lhs.corroborationRank === rhs.corroborationRank;
    }
    if (lhs.kind === "japanese" && rhs.kind === "japanese") {
      return lhs.relation === rhs.relation && profilesEqual(lhs.priorityProfile, rhs.priorityProfile) && lhs.senseBreadthRank === rhs.senseBreadthRank;
    }
    return false;
  }

  // src/search/composition.ts
  var searchResultLimit = 60;
  var discoveredWordLimit = 12;
  function noResults() {
    return {
      items: [],
      leadingLexicalEntryCount: 0,
      presentation: "ranked",
      resolution: "direct",
      readingRefinement: null,
      usesPrimaryEntryExamples: false,
      hasExactOrPrefixMatch: false
    };
  }
  function resultItems(ranked) {
    return ranked.map((entry, fallbackOrder) => ({
      entry: entry.entry,
      sourceOrder: 0,
      matchRank: entry.presentationRank,
      fallbackOrder,
      matchedSummary: entry.matchedSummary
    }));
  }
  function composingWordCandidates(words) {
    const items = [];
    for (const [sourceOrder, candidates] of words.entries()) {
      const seen = /* @__PURE__ */ new Set();
      for (const item of candidates) {
        if (seen.has(item.entry.id)) continue;
        seen.add(item.entry.id);
        items.push({ ...item, sourceOrder, fallbackOrder: items.length });
      }
    }
    return {
      ...noResults(),
      items,
      leadingLexicalEntryCount: items.length,
      presentation: "discoveredWords",
      resolution: "analyzed"
    };
  }
  function leadingExactFormCount(items) {
    let count = 0;
    for (const item of items) {
      if (item.matchRank.kind !== "japanese") break;
      if (item.matchRank.relation > FormRelation.readingExact) break;
      count++;
    }
    return count;
  }
  function composing(sources, options) {
    const limit = options.limit ?? searchResultLimit;
    const items = [];
    const seen = /* @__PURE__ */ new Set();
    compose: for (const [sourceOrder, source] of sources.entries()) {
      for (const item of source) {
        if (seen.has(item.entry.id)) continue;
        seen.add(item.entry.id);
        items.push({ ...item, sourceOrder, fallbackOrder: items.length });
        if (items.length === limit) break compose;
      }
    }
    return {
      ...noResults(),
      items,
      leadingLexicalEntryCount: Math.min(options.leadingLexicalEntryCount, items.length),
      resolution: options.resolution ?? "direct",
      usesPrimaryEntryExamples: options.usesPrimaryEntryExamples,
      hasExactOrPrefixMatch: options.hasExactOrPrefixMatch ?? true
    };
  }

  // src/results/ordering.ts
  var tierValue = {
    rare: 1,
    uncommon: 2,
    moderate: 3,
    common: 4,
    veryCommon: 5
  };
  function ranks(lookups) {
    const tier = lookups.map(frequencyTier).find((found) => found !== null);
    return { values: lookups.map(frequencySortValue), tier: tier ? tierValue[tier] : null };
  }
  function orderedByFrequency(results, lookups) {
    const ranksById = new Map(results.map((result3) => [result3.id, ranks(lookups(result3.id) ?? [])]));
    return [...results].sort((lhs, rhs) => {
      if (lhs.relevance !== rhs.relevance) return lhs.relevance - rhs.relevance;
      const left = ranksById.get(lhs.id);
      const right = ranksById.get(rhs.id);
      if (left.tier !== right.tier) {
        if (left.tier === null) return 1;
        if (right.tier === null) return -1;
        return right.tier - left.tier;
      }
      for (let index = 0; index < Math.max(left.values.length, right.values.length); index++) {
        const lhsValue = left.values[index] ?? null;
        const rhsValue = right.values[index] ?? null;
        if (lhsValue !== null && rhsValue !== null && lhsValue !== rhsValue) {
          return lhsValue - rhsValue;
        }
        if (lhsValue !== null && rhsValue === null) return -1;
        if (lhsValue === null && rhsValue !== null) return 1;
      }
      if (lhs.fallbackOrder !== rhs.fallbackOrder) return lhs.fallbackOrder - rhs.fallbackOrder;
      return lhs.id < rhs.id ? -1 : lhs.id > rhs.id ? 1 : 0;
    });
  }
  function firstOfEachGroup(ordered) {
    const groups = /* @__PURE__ */ new Set();
    const listed3 = /* @__PURE__ */ new Set();
    return ordered.filter((result3) => {
      if (groups.has(result3.relevance)) return false;
      groups.add(result3.relevance);
      if (listed3.has(result3.id)) return false;
      listed3.add(result3.id);
      return true;
    });
  }
  var relevanceSort = { by: "relevance" };
  function resultSort(stored) {
    const parts = stored.split("|").filter((part) => part !== "");
    if (parts.length === 1 && parts[0] === "default") return relevanceSort;
    if (parts.length === 2 && parts[0] === "frequency") return { by: "frequency", family: parts[1] };
    if (parts.length === 1 && parts[0] === "known-words") return { by: "knownWords" };
    return relevanceSort;
  }
  function storedSort(sort) {
    if (sort.by === "frequency") return `frequency|${sort.family}`;
    return sort.by === "knownWords" ? "known-words" : "default";
  }
  var sameSort = (lhs, rhs) => storedSort(lhs) === storedSort(rhs);
  function appliedSort(sort, dictionaries) {
    if (sort.by !== "frequency") return sort;
    const isEnabled = dictionaries?.some(({ id }) => frequencyFamily(id) === sort.family) ?? false;
    return isEnabled ? sort : relevanceSort;
  }
  function forgetsSort(sort, dictionaries) {
    return dictionaries !== null && !sameSort(appliedSort(sort, dictionaries), sort);
  }
  function sortedDictionaryName(family, dictionaries) {
    const dictionary = dictionaries.find(({ id }) => frequencyFamily(id) === family);
    return dictionary ? frequencySortName(dictionary) : "Frequency";
  }
  function sortSummary(sort, dictionaries) {
    if (sort.by === "frequency") return sortedDictionaryName(sort.family, dictionaries);
    return sort.by === "knownWords" ? "Known Words" : "Default";
  }
  function sortAnnouncement(sort, dictionaries) {
    if (sort.by === "frequency") {
      return `Sorted by ${sortedDictionaryName(sort.family, dictionaries)}`;
    }
    return sort.by === "knownWords" ? "Sorted by known words" : "Sorted by default order";
  }
  function stablySorted(results, key) {
    return results.map((result3, offset) => ({ result: result3, key: [...key(result3), offset] })).sort((lhs, rhs) => {
      for (let index = 0; index < Math.min(lhs.key.length, rhs.key.length); index++) {
        if (lhs.key[index] !== rhs.key[index]) return lhs.key[index] - rhs.key[index];
      }
      return lhs.key.length - rhs.key.length;
    }).map(({ result: result3 }) => result3);
  }
  function sortedResults(results, sort, lookups, isKnown) {
    if (sort.by === "relevance") return [...results];
    if (sort.by === "knownWords") return stablySorted(results, ({ id }) => [isKnown(id) ? 0 : 1]);
    return stablySorted(results, ({ id }) => {
      const lookup = lookups(id)?.find(
        ({ dictionary }) => dictionary !== null && frequencyFamily(dictionary.id) === sort.family
      );
      const value = lookup ? frequencySortValue(lookup) : null;
      return value === null ? [1] : [0, value];
    });
  }
  var resultFilters = ["all", "known", "unknown"];
  function resultFilter(stored) {
    return resultFilters.find((filter) => filter === stored) ?? "all";
  }
  var filterTitles = {
    all: "All",
    known: "Known",
    unknown: "Unknown"
  };
  function filteredResults(results, filter, isKnown) {
    if (filter === "all") return [...results];
    return results.filter(({ id }) => isKnown(id) === (filter === "known"));
  }
  function hiddenCountTitle(count) {
    return count === 1 ? "1 word hidden by filter" : `${count} words hidden by filter`;
  }
  function shownCountAnnouncement(count) {
    return count === 1 ? "1 word shown" : `${count} words shown`;
  }

  // src/results/results.ts
  function compareRelevance(lhs, rhs) {
    return lhs.sourceOrder - rhs.sourceOrder || comparePresentationRanks(lhs.matchRank, rhs.matchRank);
  }
  var compareWords = (lhs, rhs) => lhs.sourceOrder - rhs.sourceOrder;
  function listedResults(results) {
    const compare = results.resolution === "analyzed" ? compareWords : compareRelevance;
    const byRelevance = [...results.items].sort(compare);
    const relevance = /* @__PURE__ */ new Map();
    let rank = 0;
    for (const [index, item] of byRelevance.entries()) {
      if (index > 0 && compare(byRelevance[index - 1], item) !== 0) rank += 1;
      relevance.set(item, rank);
    }
    return {
      items: results.items.map((item) => ({
        id: item.entry.id,
        entSeq: item.entry.sourceRecordId,
        headword: item.entry.headword,
        reading: item.entry.reading,
        entrySummary: item.entry.summary,
        matchedSummary: item.matchedSummary,
        relevance: relevance.get(item) ?? 0,
        fallbackOrder: item.fallbackOrder
      })),
      presentation: results.presentation,
      resolution: results.resolution,
      readingRefinement: results.readingRefinement,
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
      leadingLexicalEntryCount: results.leadingLexicalEntryCount
    };
  }
  function exampleActionTitle(count) {
    if (count > exactExampleCountLimit) return `View ${exactExampleCountLimit}+ Example Sentences`;
    return `View ${count} Example ${count === 1 ? "Sentence" : "Sentences"}`;
  }
  var primary = (items, headword, query) => items.find((item) => headword(item) === query) ?? items[0];
  var listsOnePerWord = (found) => found.presentation === "discoveredWords" && found.resolution === "analyzed";
  var isEnglishSentence = (found, query) => listsOnePerWord(found) && isASCII(query);
  function primaryItem(results, query) {
    const normalized2 = normalizeQuery(query);
    if (isEnglishSentence(results, normalized2)) return void 0;
    return primary(results.items, (item) => item.entry.headword, normalized2);
  }
  function discoveredWords(layout, lookups) {
    return layout.listsOnePerWord ? firstOfEachGroup(orderedByFrequency(layout.presented, lookups)) : layout.presented;
  }
  function resultsLayout(rawQuery, results, exampleCount, fromRadicals = false) {
    const query = normalizeQuery(rawQuery);
    const leadingOnly = fromRadicals && graphemeCount(query) === 1;
    const singleKanji = isKanjiCharacter(query);
    const isDiscovered = results.presentation === "discoveredWords";
    const found = isEnglishSentence(results, query) ? void 0 : primary(results.items, (item) => item.headword, query);
    const sections = [];
    const examples = exampleCount > 0 ? { title: exampleActionTitle(exampleCount), count: exampleCount } : null;
    if (examples) sections.push("examples");
    const readingRefinement = results.readingRefinement ? { query: results.readingRefinement, title: `Search for「${results.readingRefinement}」` } : null;
    if (readingRefinement) sections.push("readingRefinement");
    if (isDiscovered) sections.push("discoveredWords");
    else if (singleKanji || results.items.length > 0) sections.push("results");
    const presented = listsOnePerWord(results) ? results.items.filter((item) => item.relevance < discoveredWordLimit) : isDiscovered ? results.items.slice(0, discoveredWordLimit) : leadingOnly ? results.items.slice(0, Math.min(results.leadingLexicalEntryCount, results.items.length)) : results.items;
    return {
      query,
      isEmpty: results.items.length === 0 && exampleCount === 0 && !singleKanji,
      sections,
      examples,
      readingRefinement,
      kanji: singleKanji && !isDiscovered ? {
        character: query,
        label: "KANJI",
        summary: found?.entrySummary ?? "Kanji detail",
        entryId: found?.id ?? null
      } : null,
      primary: found,
      presented,
      isDiscovered,
      listsOnePerWord: listsOnePerWord(results)
    };
  }

  // src/search/fts.ts
  function ftsPhrase(value) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  function ftsPrefix(value) {
    return /^[\p{L}\p{M}\p{N}]+$/u.test(value) ? `${value}*` : ftsPhrase(value);
  }

  // src/search/ranked-entries.ts
  function minimum(values, compare) {
    let best;
    for (const value of values) {
      if (best === void 0 || compare(value, best) < 0) best = value;
    }
    return best;
  }
  function deduplicated(ranked, client = {}) {
    const groups = /* @__PURE__ */ new Map();
    let step = 0;
    for (const entry of ranked) {
      stopIfInterrupted(client, step++);
      const group = groups.get(entry.semanticFingerprint);
      if (group) group.push(entry);
      else groups.set(entry.semanticFingerprint, [entry]);
    }
    return [...groups.values()].map((group) => {
      const leading = group[0];
      const strongest = minimum(
        group,
        (lhs, rhs) => comparePresentationRanks(lhs.presentationRank, rhs.presentationRank)
      );
      const canonical = minimum(group, (lhs, rhs) => compareStrings(lhs.entry.id, rhs.entry.id)) ?? leading;
      return {
        entry: {
          ...leading.entry,
          id: canonical.entry.id,
          sourceRecordId: canonical.entry.sourceRecordId
        },
        rank: leading.rank,
        hasExactOrPrefixMatch: group.some((ranked2) => ranked2.hasExactOrPrefixMatch),
        semanticFingerprint: leading.semanticFingerprint,
        presentationRank: strongest?.presentationRank ?? leading.presentationRank,
        matchedSummary: strongest?.matchedSummary ?? null
      };
    });
  }

  // src/search/english.ts
  var displayedFormProfileJoin = `LEFT JOIN form_priority_profiles p
  ON p.entry_id = e.id AND p.form = e.headword
  AND p.kind = CASE WHEN e.headword = e.reading THEN ${FormKind.reading} ELSE ${FormKind.written} END`;
  var hasSearchTerms = (value) => /[\p{L}\p{M}\p{N}]/u.test(value);
  var escapeRegExp = (value) => value.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
  var glossToken = (query) => new RegExp(`(?:^|[^a-z])${escapeRegExp(query)}(?:$|[^a-z])`, "u");
  function closingParenthesis(note) {
    let depth = 0;
    for (let index = 0; index < note.length; index++) {
      if (note[index] === "(") depth++;
      if (note[index] === ")") {
        depth--;
        if (depth === 0) return index;
      }
    }
    return null;
  }
  function endsInNote(gloss, phrase) {
    if (!gloss.startsWith(`${phrase} (`)) return false;
    let notes = gloss.slice(phrase.length + 1);
    for (let close = closingParenthesis(notes); close !== null; close = closingParenthesis(notes)) {
      notes = notes.slice(close + 1);
      if (notes === "") return true;
      if (!notes.startsWith(" (")) return false;
      notes = notes.slice(1);
    }
    return false;
  }
  function glossRelation(query, gloss, token) {
    const value = normalizeQuery(gloss);
    if (value === query) return GlossRelation.exactGloss;
    if (endsInNote(value, query)) return GlossRelation.qualifiedGloss;
    if (value === `to ${query}`) return GlossRelation.exactInfinitive;
    if (endsInNote(value, `to ${query}`)) return GlossRelation.qualifiedInfinitive;
    return token.test(value) ? GlossRelation.glossToken : null;
  }
  function glossEvidencePrecedes(lhs, rhs) {
    const lane = (evidence) => evidence.relation === GlossRelation.glossToken ? 1 : 0;
    return lane(lhs) - lane(rhs) || lhs.senseOrder - rhs.senseOrder || lhs.relation - rhs.relation || lhs.glossOrder - rhs.glossOrder;
  }
  async function rankedEnglish(db, query, exactFormOnly = false) {
    const evidence = exactFormOnly ? await exactRomajiEvidence(db, query) : await englishEvidence(db, query);
    return evidence ? rankedEvidence(db, evidence) : [];
  }
  async function rankedByStrongGloss(db, word) {
    const evidence = await strongGlossEvidence(db, word);
    return evidence ? rankedEvidence(db, evidence) : [];
  }
  function rankedEvidence(db, { rows, glossMatches, romajiMatches }) {
    const ranked = [];
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(db, step++);
      const entry = decodeEntry(row);
      const displayedFormPriority = profile(row);
      const gloss = glossMatches.get(entry.id) ?? [];
      const romaji2 = romajiMatches.get(entry.id) ?? [];
      const selectedGloss = minimum(gloss, glossEvidencePrecedes);
      const shared2 = {
        priorityPresenceRank: isMarked(displayedFormPriority) ? 0 : 1,
        priorityProfile: displayedFormPriority,
        headwordLength: graphemeCount(entry.headword),
        semanticFingerprint: row.semantic_fingerprint
      };
      if (!selectedGloss) {
        const romajiRelation = romaji2.length > 0 ? Math.min(...romaji2) : void 0;
        if (romajiRelation === void 0) continue;
        const rank2 = {
          kind: "english",
          lane: EvidenceLane.romajiOnly,
          corroborationRank: 0,
          romajiSpecificityRank: romajiRelation,
          senseOrder: 0,
          glossOrder: 0,
          ...shared2
        };
        ranked.push({
          entry,
          rank: rank2,
          presentationRank: rank2,
          hasExactOrPrefixMatch: romajiRelation !== RomajiRelation.contains,
          semanticFingerprint: row.semantic_fingerprint,
          matchedSummary: null
        });
        continue;
      }
      const lane = selectedGloss.relation === GlossRelation.glossToken ? EvidenceLane.tokenGloss : EvidenceLane.strongGloss;
      const corroborated = lane === EvidenceLane.strongGloss && romaji2.some(
        (relation) => relation === RomajiRelation.exact || relation === RomajiRelation.prefix
      );
      const rank = {
        kind: "english",
        lane,
        corroborationRank: corroborated ? 0 : 1,
        romajiSpecificityRank: 0,
        senseOrder: selectedGloss.senseOrder,
        glossOrder: selectedGloss.glossOrder,
        ...shared2
      };
      ranked.push({
        entry,
        rank,
        presentationRank: rank,
        hasExactOrPrefixMatch: lane === EvidenceLane.strongGloss || corroborated,
        semanticFingerprint: row.semantic_fingerprint,
        matchedSummary: selectedGloss.meaning
      });
    }
    ranked.sort((lhs, rhs) => {
      stopIfInterrupted(db, step++);
      return compareEnglishRanks(lhs.rank, rhs.rank);
    });
    return deduplicated(ranked, db);
  }
  async function exactRomajiEvidence(db, query) {
    const rows = await db.all(
      `SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM forms f JOIN entries e ON e.id = f.entry_id ${displayedFormProfileJoin}
       WHERE f.kind = ${FormKind.romaji} AND f.form = ?`,
      [query]
    );
    return {
      rows,
      glossMatches: /* @__PURE__ */ new Map(),
      romajiMatches: new Map(rows.map((row) => [row.id, [RomajiRelation.exact]]))
    };
  }
  var afterEveryContinuation = "􏿿";
  async function strongGlossEvidence(db, word) {
    if (!hasSearchTerms(word)) return null;
    const glossMatches = await glossEvidence(db, word, ftsPhrase(word), strongGlossesOf(word));
    if (glossMatches.size === 0) return null;
    const ids = JSON.stringify([...glossMatches.keys()]);
    const [rows, romajiForms] = await Promise.all([
      db.all(
        `SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM entries e ${displayedFormProfileJoin}
       WHERE e.id IN (${listedIds})`,
        [ids]
      ),
      db.all(
        `SELECT lower(hex(f.entry_id)) AS entry_id, f.form FROM forms f
       WHERE f.form >= ? AND f.form < ? AND f.kind = ${FormKind.romaji}
         AND f.entry_id IN (${listedIds})`,
        [word, word + afterEveryContinuation, ids]
      )
    ]);
    return { rows, glossMatches, romajiMatches: romajiRelations(db, word, romajiForms) };
  }
  async function englishEvidence(db, query) {
    if (!hasSearchTerms(query)) return null;
    const glossMatch = ftsPhrase(query);
    const romajiMatch = ftsPrefix(query);
    const [rows, glossMatches, romajiMatches] = await Promise.all([
      db.all(
        `WITH candidates AS (
           SELECT g.entry_id FROM dictionary_gloss_fts x JOIN gloss_atoms g ON g.rowid = x.docid
           WHERE dictionary_gloss_fts MATCH ?
           UNION
           SELECT f.entry_id FROM dictionary_form_fts x JOIN forms f ON f.rowid = x.docid
           WHERE dictionary_form_fts MATCH ? AND f.kind = ${FormKind.romaji}
         )
         SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
         FROM candidates c JOIN entries e ON e.id = c.entry_id ${displayedFormProfileJoin}`,
        [glossMatch, romajiMatch]
      ),
      glossEvidence(db, query, glossMatch),
      romajiEvidence(db, query, romajiMatch)
    ]);
    return { rows, glossMatches, romajiMatches };
  }
  function strongGlossesOf(word) {
    const infinitive2 = `to ${word}`;
    const noteAfter = (phrase) => `${phrase} (`;
    return {
      sql: `AND (g.normalized_text IN (?, ?)
         OR substr(g.normalized_text, 1, ?) = ? OR substr(g.normalized_text, 1, ?) = ?)`,
      params: [
        word,
        infinitive2,
        noteAfter(word).length,
        noteAfter(word),
        noteAfter(infinitive2).length,
        noteAfter(infinitive2)
      ]
    };
  }
  async function glossEvidence(db, query, match, strongOnly) {
    const rows = await db.all(
      `SELECT lower(hex(g.entry_id)) AS entry_id, g.sense_order, g.gloss_order, g.text,
         e.headword, e.reading,
         (SELECT json_group_array(r.form) FROM sense_form_restrictions r
          WHERE r.entry_id = g.entry_id AND r.sense_order = g.sense_order
            AND r.kind = ${FormKind.written}) AS written_forms,
         (SELECT json_group_array(r.form) FROM sense_form_restrictions r
          WHERE r.entry_id = g.entry_id AND r.sense_order = g.sense_order
            AND r.kind = ${FormKind.reading}) AS readings
       FROM dictionary_gloss_fts x
       JOIN gloss_atoms g ON g.rowid = x.docid
       JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
       JOIN entries e ON e.id = g.entry_id
       WHERE dictionary_gloss_fts MATCH ? ${strongOnly?.sql ?? ""}`,
      [match, ...strongOnly?.params ?? []]
    );
    const token = glossToken(query);
    const result3 = /* @__PURE__ */ new Map();
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(db, step++);
      const senseWrittenForms = JSON.parse(row.written_forms);
      const senseReadings = JSON.parse(row.readings);
      const appliesToShownForms = (senseWrittenForms.length === 0 || senseWrittenForms.includes(normalizeQuery(row.headword))) && (senseReadings.length === 0 || senseReadings.includes(normalizeQuery(row.reading)));
      if (!appliesToShownForms) continue;
      const relation = glossRelation(query, row.text, token);
      if (relation === null || strongOnly && relation === GlossRelation.glossToken) continue;
      const evidence = result3.get(row.entry_id) ?? [];
      evidence.push({
        relation,
        senseOrder: row.sense_order,
        glossOrder: row.gloss_order,
        meaning: row.text
      });
      result3.set(row.entry_id, evidence);
    }
    return result3;
  }
  async function romajiEvidence(db, query, match) {
    const rows = await db.all(
      `SELECT lower(hex(f.entry_id)) AS entry_id, f.form
       FROM dictionary_form_fts x JOIN forms f ON f.rowid = x.docid
       WHERE dictionary_form_fts MATCH ? AND f.kind = ${FormKind.romaji}`,
      [match]
    );
    return romajiRelations(db, query, rows);
  }
  function romajiRelations(db, query, rows) {
    const result3 = /* @__PURE__ */ new Map();
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(db, step++);
      const relation = row.form === query ? RomajiRelation.exact : row.form.startsWith(query) ? RomajiRelation.prefix : RomajiRelation.contains;
      const relations = result3.get(row.entry_id) ?? [];
      if (!relations.includes(relation)) relations.push(relation);
      result3.set(row.entry_id, relations);
    }
    return result3;
  }

  // src/search/japanese.ts
  var maximumFormsPerQuery = 100;
  var readingRestrictionFilter = `(
  f.kind != ${FormKind.reading}
  OR NOT EXISTS (
    SELECT 1 FROM reading_form_restrictions r WHERE r.entry_id = f.entry_id AND r.reading = f.form
  )
  OR EXISTS (
    SELECT 1 FROM reading_form_restrictions r
    WHERE r.entry_id = f.entry_id AND r.reading = f.form AND r.written_form = e.headword
  )
)`;
  function containsFilter(query) {
    return { sql: "instr(f.form, ?) > 0", params: [query] };
  }
  function rankJapanese(query, rows, client = {}) {
    const byEntry = /* @__PURE__ */ new Map();
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(client, step++);
      const exact = row.form === query;
      const prefix = row.form.startsWith(query);
      const relation = (row.kind === FormKind.written ? 0 : 1) + (exact ? 0 : prefix ? 2 : 4);
      const current = byEntry.get(row.id) ?? {
        entry: decodeEntry(row),
        fingerprint: row.semantic_fingerprint,
        senseCount: row.sense_count,
        evidence: []
      };
      current.evidence.push({ relation, form: row.form, profile: profile(row) });
      byEntry.set(row.id, current);
    }
    const ranked = [];
    for (const { entry, fingerprint, senseCount, evidence } of byEntry.values()) {
      stopIfInterrupted(client, step++);
      const selected = minimum(evidence, (lhs, rhs) => {
        if (lhs.relation !== rhs.relation) return lhs.relation - rhs.relation;
        const profiles = compareProfiles(lhs.profile, rhs.profile);
        return profiles || compareStrings(lhs.form, rhs.form);
      });
      if (!selected) continue;
      const rank = {
        kind: "japanese",
        relation: selected.relation,
        priorityProfile: selected.profile,
        senseBreadthRank: -senseCount,
        headwordLength: graphemeCount(entry.headword),
        semanticFingerprint: fingerprint
      };
      ranked.push({
        entry,
        rank,
        presentationRank: rank,
        hasExactOrPrefixMatch: selected.relation < FormRelation.writtenContains,
        semanticFingerprint: fingerprint,
        matchedSummary: null
      });
    }
    ranked.sort((lhs, rhs) => {
      stopIfInterrupted(client, step++);
      return compareJapaneseRanks(lhs.rank, rhs.rank);
    });
    return deduplicated(ranked, client);
  }
  async function hasFormContaining(db, query) {
    const filter = containsFilter(query);
    const rows = await db.all(
      `SELECT 1 FROM forms f JOIN entries e ON e.id = f.entry_id
       WHERE f.kind IN (${FormKind.written}, ${FormKind.reading})
         AND ${filter.sql}
         AND ${readingRestrictionFilter}
       LIMIT 1`,
      filter.params
    );
    return rows.length > 0;
  }
  async function rankedJapanese(db, query) {
    const filter = containsFilter(query);
    return rankJapanese(query, await japaneseRows(db, filter.sql, filter.params), db);
  }
  async function rankedJapaneseForms(db, terms) {
    const distinct = [...new Set(terms)].filter((term) => term !== "");
    const batches = [];
    for (let start = 0; start < distinct.length; start += maximumFormsPerQuery) {
      batches.push(distinct.slice(start, start + maximumFormsPerQuery));
    }
    const rowsByTerm = /* @__PURE__ */ new Map();
    const rows = await Promise.all(
      batches.map((batch) => japaneseRows(db, `f.form IN (${batch.map(() => "?").join(", ")})`, batch))
    );
    for (const row of rows.flat()) {
      const termRows = rowsByTerm.get(row.form) ?? [];
      termRows.push(row);
      rowsByTerm.set(row.form, termRows);
    }
    return new Map(distinct.map((term) => [term, rankJapanese(term, rowsByTerm.get(term) ?? [], db)]));
  }
  function japaneseRows(db, where, params) {
    return db.all(
      `SELECT ${entryColumns}, f.form, f.kind,
         (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id) AS sense_count,
         p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM forms f
       JOIN entries e ON e.id = f.entry_id
       LEFT JOIN form_priority_profiles p
         ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
       WHERE f.kind IN (${FormKind.written}, ${FormKind.reading})
         AND ${where}
         AND ${readingRestrictionFilter}`,
      params
    );
  }

  // src/search/deinflect.ts
  function acceptsPartsOfSpeech(wordClass, parts) {
    switch (wordClass) {
      case "ichidan":
        return parts.includes("ichidanVerb");
      case "godan":
        return parts.includes("godanVerb");
      case "kuru":
        return parts.includes("kuruVerb");
      case "suru":
        return parts.includes("suruVerb");
      case "suruNoun":
        return parts.includes("takesSuru") || parts.includes("suruVerb");
      case "iAdjective":
        return parts.includes("iAdjective");
    }
  }
  var maximumDepth = 6;
  var length = graphemeCount;
  var dropLast = (value) => graphemes2(value).slice(0, -1).join("");
  var pastForm = (te) => dropLast(te) + (te.endsWith("で") ? "だ" : "た");
  var ikuSoundChangeStems = ["行", "い"];
  function verbPatterns() {
    const patterns = [
      {
        base: "る",
        wordClass: "ichidan",
        negative: [""],
        continuative: [""],
        te: ["て"],
        ta: ["た"],
        conditional: ["れ"],
        volitional: ["よう"],
        imperative: ["ろ", "よ"],
        derived: ["られる", "させる", "れる"]
      }
    ];
    const godanRows = [
      ["う", "わ", "い", "え", "お", "って"],
      ["く", "か", "き", "け", "こ", "いて"],
      ["ぐ", "が", "ぎ", "げ", "ご", "いで"],
      ["す", "さ", "し", "せ", "そ", "して"],
      ["つ", "た", "ち", "て", "と", "って"],
      ["ぬ", "な", "に", "ね", "の", "んで"],
      ["ぶ", "ば", "び", "べ", "ぼ", "んで"],
      ["む", "ま", "み", "め", "も", "んで"],
      ["る", "ら", "り", "れ", "ろ", "って"]
    ];
    for (const [ending, a, i, e, o, te] of godanRows) {
      patterns.push({
        base: ending,
        wordClass: "godan",
        negative: [a],
        continuative: [i],
        te: [te],
        ta: [pastForm(te)],
        conditional: [e],
        volitional: [`${o}う`],
        imperative: [e],
        derived: [`${a}れる`, `${a}せる`, `${e}る`]
      });
    }
    for (const stem of ikuSoundChangeStems) {
      patterns.push({
        base: `${stem}く`,
        wordClass: "godan",
        negative: [],
        continuative: [],
        te: [`${stem}って`],
        ta: [`${stem}った`],
        conditional: [],
        volitional: [],
        imperative: [],
        derived: []
      });
    }
    for (const [base, prefix] of [
      ["来る", "来"],
      ["くる", ""]
    ]) {
      const k = prefix || "く";
      const ko = prefix || "こ";
      const ki = prefix || "き";
      patterns.push({
        base,
        wordClass: "kuru",
        negative: [ko],
        continuative: [ki],
        te: [`${ki}て`],
        ta: [`${ki}た`],
        conditional: [`${k}れ`],
        volitional: [`${ko}よう`],
        imperative: [`${ko}い`],
        derived: [`${ko}られる`, `${ko}させる`, `${ko}れる`]
      });
    }
    patterns.push({
      base: "する",
      wordClass: "suru",
      negative: ["し"],
      continuative: ["し"],
      te: ["して"],
      ta: ["した"],
      conditional: ["すれ"],
      volitional: ["しよう"],
      imperative: ["しろ", "せよ"],
      derived: ["される", "させる", "できる"]
    });
    return patterns;
  }
  function verbRules(pattern) {
    const rules2 = [];
    const output = [pattern.wordClass];
    const add = (stems, suffixes, input = []) => {
      for (const stem of stems) {
        for (const suffix of suffixes) {
          rules2.push({ inflected: stem + suffix, base: pattern.base, input, output });
        }
      }
    };
    add(pattern.negative, ["ない"], ["iAdjective"]);
    add(pattern.negative, ["ず", "ずに", "ぬ"]);
    add(pattern.continuative, [
      "ます",
      "ました",
      "ません",
      "ませんでした",
      "ましょう",
      "まして",
      "なさい",
      "ながら",
      "そう"
    ]);
    add(pattern.continuative, ["たい"], ["iAdjective"]);
    add(pattern.continuative, ["すぎる"], ["ichidan"]);
    add(pattern.te, ["", "ください"]);
    add(pattern.te, ["いる", "る"], ["ichidan"]);
    add(pattern.te, ["しまう", "おく"], ["godan"]);
    add(pattern.ta, ["", "ら", "り"]);
    add(pattern.conditional, ["ば"]);
    add(pattern.volitional, [""]);
    add(pattern.imperative, [""]);
    add(pattern.derived, [""], ["ichidan"]);
    for (const te of pattern.te) {
      const contractedTeShimau = dropLast(te) + (te.endsWith("で") ? "じゃう" : "ちゃう");
      rules2.push({ inflected: contractedTeShimau, base: pattern.base, input: ["godan"], output });
    }
    return rules2.filter((rule) => rule.inflected !== "");
  }
  function adjectiveRules() {
    const adjective = ["iAdjective"];
    const surface = [
      ["く", []],
      ["くて", []],
      ["かった", []],
      ["かったら", []],
      ["かったり", []],
      ["ければ", []],
      ["さ", []],
      ["そう", []],
      ["かろう", []],
      ["くない", adjective],
      ["すぎる", ["ichidan"]],
      ["くなる", ["godan"]]
    ];
    return [
      ...surface.map(([inflected, input]) => ({ inflected, base: "い", input, output: adjective })),
      { inflected: "ないで", base: "ない", input: [], output: adjective }
    ];
  }
  var rules = [...verbPatterns().flatMap(verbRules), ...adjectiveRules()];
  function deinflect(text) {
    if (!text) return [];
    const results = [];
    const seen = /* @__PURE__ */ new Set([`${text}|`]);
    let frontier = [{ term: text, classes: [] }];
    for (let depth = 1; depth <= maximumDepth; depth++) {
      const next = [];
      for (const { term, classes } of frontier) {
        for (const rule of rules) {
          if (!term.endsWith(rule.inflected)) continue;
          if (!(length(term) > length(rule.inflected) || length(rule.base) > 1)) continue;
          if (classes.length > 0 && !rule.input.some((wordClass) => classes.includes(wordClass))) {
            continue;
          }
          const base = term.slice(0, -rule.inflected.length) + rule.base;
          const key = `${base}|${[...rule.output].sort().join(",")}`;
          if (base === text || seen.has(key)) continue;
          seen.add(key);
          results.push({ term: base, wordClasses: [...rule.output], depth });
          next.push({ term: base, classes: rule.output });
          if (rule.output.includes("suru") && base.endsWith("する") && length(base) > 2) {
            results.push({ term: base.slice(0, -2), wordClasses: ["suruNoun"], depth });
          }
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }
    return results;
  }

  // src/examples/english-irregular-forms.ts
  function basesByForm(basesWithTheirForms) {
    return new Map(
      basesWithTheirForms.flatMap((row) => {
        const [base, ...forms2] = row.split(" ");
        return forms2.map((form) => [form, base]);
      })
    );
  }
  var verbsByIrregularForm = basesByForm([
    "arise arose arisen",
    "awake awoke awoken",
    "be been being",
    "bear bore borne",
    "beat beaten",
    "become became",
    "begin began begun",
    "bend bent",
    "bind bound",
    "bite bitten",
    "blow blew blown",
    "break broke broken",
    "bring brought",
    "build built",
    "burn burnt",
    "buy bought",
    "catch caught",
    "choose chose chosen",
    "cling clung",
    "come came",
    "creep crept",
    "dig dug",
    "do done doing",
    "draw drew drawn",
    "dream dreamt",
    "drink drank",
    "drive drove driven",
    "eat ate eaten",
    "fall fell fallen",
    "feed fed",
    "feel felt",
    "fight fought",
    "find found",
    "flee fled",
    "fling flung",
    "fly flew flown",
    "forbid forbade forbidden",
    "forget forgot forgotten",
    "forgive forgave forgiven",
    "freeze froze frozen",
    "get got gotten",
    "give gave given",
    "go went gone",
    "grow grew grown",
    "hang hung",
    "have has had having",
    "hear heard",
    "hide hid hidden",
    "hold held",
    "keep kept",
    "kneel knelt",
    "know knew known",
    "lead led",
    "lean leant",
    "leap leapt",
    "learn learnt",
    "lend lent",
    "light lit",
    "lose lost",
    "make made",
    "mean meant",
    "meet met",
    "mistake mistook mistaken",
    "overcome overcame",
    "overhear overheard",
    "oversleep overslept",
    "overtake overtook overtaken",
    "pay paid",
    "rebuild rebuilt",
    "redo redid redone",
    "repay repaid",
    "rewrite rewrote rewritten",
    "ring rang rung",
    "rise risen",
    "run ran",
    "say said",
    "see saw seen",
    "seek sought",
    "sell sold",
    "send sent",
    "sew sewn",
    "shake shook shaken",
    "shoot shot",
    "show shown",
    "shrink shrank shrunk",
    "sing sang sung",
    "sink sank sunk",
    "sit sat",
    "sleep slept",
    "slide slid",
    "smell smelt",
    "speak spoke spoken",
    "speed sped",
    "spell spelt",
    "spend spent",
    "spill spilt",
    "spin spun",
    "spit spat",
    "spoil spoilt",
    "spring sprang sprung",
    "stand stood",
    "steal stole stolen",
    "stick stuck",
    "sting stung",
    "stink stank stunk",
    "strike struck stricken",
    "swear swore sworn",
    "sweep swept",
    "swell swollen",
    "swim swam swum",
    "swing swung",
    "take took taken",
    "teach taught",
    "tear tore torn",
    "tell told",
    "think thought",
    "throw threw thrown",
    "undergo underwent undergone",
    "understand understood",
    "undo undid undone",
    "wake woke woken",
    "wear wore worn",
    "weep wept",
    "win won",
    "withdraw withdrew withdrawn",
    "write wrote written"
  ]);
  var nounsByIrregularPlural = basesByForm([
    "child children",
    "foot feet",
    "half halves",
    "knife knives",
    "leaf leaves",
    "life lives",
    "man men",
    "mouse mice",
    "shelf shelves",
    "thief thieves",
    "tooth teeth",
    "wife wives",
    "wolf wolves",
    "woman women"
  ]);
  var adjectivesByIrregularComparative = basesByForm(["good better best", "bad worse worst"]);

  // src/examples/english-inflection.ts
  var wordThatInflects = /^[a-z]{3,}$/;
  var vowel = /[aeiouy]/;
  var doubledFinalConsonant = /([b-df-hj-np-tv-z])\1$/;
  var endingThatTakesEs = /(?:[sxzo]|[cs]h)$/;
  var twoLettersEndingInAVowel = /^[a-z][aeiou]$/;
  var twoConsonants = /^[b-df-hj-np-tv-xz]{2}$/;
  var baseThatDoublesItsLastConsonant = /^[^aeiou]*[aeiou][b-df-hj-np-tvz]$/;
  var fewestLettersInABase = 3;
  var comparativeEndings = ["est", "er"];
  var isLongEnough = (base) => base.length >= fewestLettersInABase;
  var isLongEnoughOrLikeGo = (base) => isLongEnough(base) || twoLettersEndingInAVowel.test(base);
  var isLongEnoughOrAnAbbreviation = (base) => isLongEnough(base) || twoConsonants.test(base);
  var isLongEnoughAndTakesAnEndingAsWritten = (base) => isLongEnough(base) && !baseThatDoublesItsLastConsonant.test(base);
  var isLikeGoOrTakesAnEndingAsWritten = (base) => twoLettersEndingInAVowel.test(base) || isLongEnoughAndTakesAnEndingAsWritten(base);
  function basesBeforeAnEnding(stem, isABase) {
    if (stem.length < 2 || !vowel.test(stem)) return [];
    const withoutItsDoubling = stem.slice(0, -1);
    return [
      ...isABase(stem) ? [stem] : [],
      `${stem}e`,
      ...doubledFinalConsonant.test(stem) && isLongEnough(withoutItsDoubling) ? [withoutItsDoubling] : []
    ];
  }
  function basesOfAPluralOrThirdPerson(word) {
    if (!word.endsWith("s") || word.endsWith("ss")) return [];
    const withoutS = word.slice(0, -1);
    const withoutEs = word.slice(0, -2);
    const bases = word.endsWith("ies") ? [`${word.slice(0, -3)}y`, withoutS] : [withoutS];
    const takesEs = word.endsWith("es") && endingThatTakesEs.test(withoutEs) && isLongEnoughOrLikeGo(withoutEs);
    return [...bases.filter(isLongEnoughOrAnAbbreviation), ...takesEs ? [withoutEs] : []];
  }
  function basesOfAPast(word, isABase = isLongEnough) {
    if (!word.endsWith("ed")) return [];
    const withoutEd = word.slice(0, -2);
    return word.endsWith("ied") ? [`${word.slice(0, -3)}y`, word.slice(0, -1), withoutEd].filter(isLongEnough) : basesBeforeAnEnding(withoutEd, isABase);
  }
  function basesOfAnIngForm(word, isABase = isLongEnoughOrLikeGo) {
    return word.endsWith("ing") ? basesBeforeAnEnding(word.slice(0, -3), isABase) : [];
  }
  function baseIn(basesByForm2, form) {
    const base = basesByForm2.get(form);
    return base === void 0 ? [] : [base];
  }
  function basesOfAComparative(word) {
    const irregular = baseIn(adjectivesByIrregularComparative, word);
    if (irregular.length > 0) return irregular;
    const ending = comparativeEndings.find((candidate) => word.endsWith(candidate));
    if (!ending) return [];
    const stem = word.slice(0, -ending.length);
    return stem.endsWith("i") ? [`${stem.slice(0, -1)}y`].filter(isLongEnough) : basesBeforeAnEnding(stem, isLongEnoughAndTakesAnEndingAsWritten);
  }
  function possibleBaseForms(word) {
    if (!wordThatInflects.test(word)) return [word];
    return [
      word,
      ...basesOfAPluralOrThirdPerson(word),
      ...basesOfAPast(word),
      ...basesOfAnIngForm(word)
    ];
  }
  var bringing = (entries) => (base) => ({ base, entries });
  function baseFormsOf(word) {
    if (!wordThatInflects.test(word)) return [];
    return [
      ...basesOfAPluralOrThirdPerson(word).map(bringing("all")),
      ...basesOfAPast(word, isLongEnoughAndTakesAnEndingAsWritten).map(bringing("allIfAVerb")),
      ...basesOfAnIngForm(word, isLikeGoOrTakesAnEndingAsWritten).map(bringing("allIfAVerb")),
      ...basesOfAComparative(word).map(bringing("adjectives"))
    ];
  }
  function irregularBaseFormsOf(word) {
    return [
      ...baseIn(verbsByIrregularForm, word).map(bringing("verbs")),
      ...baseIn(nounsByIrregularPlural, word).map(bringing("nouns"))
    ];
  }
  function sameWordInAnyForm(word) {
    const lowered = word.toLowerCase();
    const bases = possibleBaseForms(lowered);
    return (other) => {
      const candidate = other.toLowerCase();
      return candidate === lowered || possibleBaseForms(candidate).some((base) => bases.includes(base));
    };
  }

  // src/search/english-function-words.ts
  var wordsThatListNothing = /* @__PURE__ */ new Set([
    "a",
    "an",
    "the",
    "of",
    "to",
    "will"
  ]);
  var desu = 1628500;
  var datta = 2819970;
  var sore = 1006970;
  var nai = 2257550;
  var dekiru = 1340450;
  var kesshite = 1254130;
  var suru = 1157170;
  var fixedEntries = /* @__PURE__ */ new Map([
    ["am", { jmdictEntry: desu, meaning: "be" }],
    ["is", { jmdictEntry: desu, meaning: "is" }],
    ["are", { jmdictEntry: desu, meaning: "be" }],
    ["was", { jmdictEntry: datta, meaning: "was" }],
    ["were", { jmdictEntry: datta, meaning: "were" }],
    ["it", { jmdictEntry: sore, meaning: "it" }],
    ["not", { jmdictEntry: nai, meaning: "not" }],
    ["can", { jmdictEntry: dekiru, meaning: "be able to do" }],
    ["never", { jmdictEntry: kesshite, meaning: "(not) ever" }],
    ["do", { jmdictEntry: suru, meaning: "do" }],
    ["does", { jmdictEntry: suru, meaning: "do" }],
    ["did", { jmdictEntry: suru, meaning: "do" }]
  ]);

  // src/search/english-word-entries.ts
  var wordIndex = "word_index";
  async function hasWordIndex(db) {
    const attached = await db.all("SELECT name FROM pragma_database_list WHERE name = ?", [wordIndex]);
    return attached.length > 0;
  }
  var isAPieceOfAnAbbreviation = (word) => word.length === 1;
  async function entriesExamplesUse(db, words) {
    const asked = [...new Set(words)].filter((word) => !isAPieceOfAnAbbreviation(word));
    const used = /* @__PURE__ */ new Map();
    if (asked.length === 0 || !await hasWordIndex(db)) return used;
    const rows = await db.all(
      `SELECT w.word, w.pairs_with_both,
         (SELECT json_group_array(g.normalized_text) FROM gloss_atoms g
          WHERE g.entry_id = w.entry_id) AS glosses,
         ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM json_each(?) listed
       JOIN ${wordIndex}.english_word_entries w ON w.word = listed.value
       JOIN entries e ON e.id = w.entry_id ${displayedFormProfileJoin}
       ORDER BY w.word, w.place`,
      [JSON.stringify(asked)]
    );
    for (const row of rows) used.set(row.word, [...used.get(row.word) ?? [], row]);
    return used;
  }
  function mentions(used, words) {
    const glosses = JSON.parse(used.glosses);
    return words.some((word) => {
      const asAWholeWord = glossToken(word);
      return glosses.some((gloss) => asAWholeWord.test(gloss));
    });
  }
  var sharedPairsOfASplit = { numerator: 7, denominator: 10 };
  function areSplitBetween(first, other) {
    const { numerator, denominator } = sharedPairsOfASplit;
    return denominator * other.pairs_with_both >= numerator * first.pairs_with_both;
  }
  function usedInExamples(row) {
    const entry = decodeEntry(row);
    const priority = profile(row);
    const matchRank = {
      kind: "english",
      lane: EvidenceLane.exampleSentences,
      corroborationRank: 1,
      romajiSpecificityRank: 0,
      senseOrder: 0,
      glossOrder: 0,
      priorityPresenceRank: isMarked(priority) ? 0 : 1,
      priorityProfile: priority,
      headwordLength: graphemeCount(entry.headword),
      semanticFingerprint: row.semantic_fingerprint
    };
    return { entry, sourceOrder: 0, matchRank, fallbackOrder: 0, matchedSummary: null };
  }

  // src/search/english-sentence.ts
  var sentenceWordLookupLimit = 24;
  var nounParts = /* @__PURE__ */ new Set(["noun"]);
  var adjectiveParts = /* @__PURE__ */ new Set([
    "iAdjective",
    "naAdjective",
    "preNounAdjective",
    "taruAdjective"
  ]);
  var infinitive = (verb) => `to ${verb}`;
  var asWritten = (gloss) => ({ gloss });
  function asTheWordReadsIt({ base, entries }) {
    switch (entries) {
      case "verbs":
      case "allIfAVerb":
        return asWritten(infinitive(base));
      case "nouns":
        return { gloss: base, partsOfSpeech: nounParts };
      case "adjectives":
        return { gloss: base, partsOfSpeech: adjectiveParts };
      case "all":
        return asWritten(base);
    }
  }
  var isAComparative = ({ entries }) => entries === "adjectives";
  var baseFormsOfAnyKind = (word) => [...irregularBaseFormsOf(word), ...baseFormsOf(word)];
  async function entriesThatMean(db, { gloss, partsOfSpeech }) {
    const ranked = await rankedByStrongGloss(db, gloss);
    return partsOfSpeech ? ranked.filter(({ entry }) => entry.partsOfSpeech.some((part) => partsOfSpeech.has(part))) : ranked;
  }
  async function firstRowCandidates(db, meaning) {
    const ranked = (await entriesThatMean(db, meaning)).slice(0, searchResultLimit);
    return resultItems(
      ranked.filter(
        (entry) => comparePresentationRanks(entry.presentationRank, ranked[0].presentationRank) === 0
      )
    );
  }
  var unknownWord = void 0;
  var noEntriesOfAKnownWord = [];
  var entriesOrUnknownWord = (candidates) => candidates.length > 0 ? candidates : unknownWord;
  async function entriesThatMeanEach(db, used, meanings) {
    const meant = used.map(() => void 0);
    for (const meaning of meanings) {
      if (meant.every((entry) => entry !== void 0)) break;
      const entries = await entriesThatMean(db, meaning);
      for (const [place, row] of used.entries()) {
        meant[place] ??= entries.find((ranked) => ranked.entry.id === row.id);
      }
    }
    return meant;
  }
  async function candidatesAmong(db, used, meanings, passesUnmeant) {
    const meant = await entriesThatMeanEach(db, used, meanings);
    const first = used.findIndex((row, place) => meant[place] !== void 0 || passesUnmeant(row));
    if (first < 0) return [];
    const leading = meant[first];
    if (!leading) return [usedInExamples(used[first])];
    const sharingItsUse = used.flatMap((row, place) => {
      const entry = meant[place];
      return entry && place > first && areSplitBetween(used[first], row) ? [entry] : [];
    });
    return resultItems([leading, ...sharingItsUse]);
  }
  function candidatesFromItsExamples(db, word, examples) {
    const inAnyForm = [word, ...baseFormsOfAnyKind(word).map(({ base }) => base)];
    const isAnotherWordsForm = inAnyForm.length > 1;
    return candidatesAmong(
      db,
      examples.get(word) ?? [],
      inAnyForm.map(asWritten),
      (row) => isAnotherWordsForm ? mentions(row, inAnyForm) : true
    );
  }
  function candidatesFromExamplesOfABaseForm(db, baseForm, examples) {
    if (baseForm.entries === "all") return candidatesFromItsExamples(db, baseForm.base, examples);
    const used = examples.get(baseForm.base) ?? [];
    return candidatesAmong(db, used, [asTheWordReadsIt(baseForm)], () => false);
  }
  async function candidatesFromExamples(db, word, examples) {
    const own = await candidatesFromItsExamples(db, word, examples);
    if (own.length > 0) return own;
    const ofItsBaseForms = [];
    for (const baseForm of baseFormsOfAnyKind(word).filter((form) => !isAComparative(form))) {
      ofItsBaseForms.push(...await candidatesFromExamplesOfABaseForm(db, baseForm, examples));
    }
    return ofItsBaseForms;
  }
  async function candidatesOfABaseForm(db, baseForm) {
    if (baseForm.entries !== "allIfAVerb") {
      return entriesOrUnknownWord(await firstRowCandidates(db, asTheWordReadsIt(baseForm)));
    }
    const all = await firstRowCandidates(db, asWritten(baseForm.base));
    if (all.length === 0) return unknownWord;
    const asAVerb = await firstRowCandidates(db, asTheWordReadsIt(baseForm));
    return asAVerb.length > 0 ? all : noEntriesOfAKnownWord;
  }
  async function candidatesOfBaseForms(db, baseForms) {
    let candidates = unknownWord;
    for (const baseForm of baseForms) {
      const found = await candidatesOfABaseForm(db, baseForm);
      if (found) candidates = [...candidates ?? [], ...found];
    }
    return candidates;
  }
  async function fixedCandidates(db, { jmdictEntry, meaning }) {
    const ranked = await rankedByStrongGloss(db, meaning);
    return resultItems(ranked.filter(({ entry }) => entry.sourceRecordId === jmdictEntry));
  }
  async function candidatesFor(db, word, examples) {
    if (wordsThatListNothing.has(word)) return noEntriesOfAKnownWord;
    const fixed = fixedEntries.get(word);
    if (fixed) return entriesOrUnknownWord(await fixedCandidates(db, fixed));
    const fromExamples = await candidatesFromExamples(db, word, examples);
    if (fromExamples.length > 0) return fromExamples;
    const own = await firstRowCandidates(db, asWritten(word));
    const irregular = irregularBaseFormsOf(word);
    if (irregular.length > 0) {
      const ofItsBaseForm = await candidatesOfBaseForms(db, irregular) ?? [];
      return entriesOrUnknownWord([...own, ...ofItsBaseForm]);
    }
    return own.length > 0 ? own : candidatesOfBaseForms(db, baseFormsOf(word));
  }
  async function englishSentenceCandidates(db, query) {
    const words = englishSentenceWords(query).slice(0, sentenceWordLookupLimit);
    const examples = await entriesExamplesUse(
      db,
      words.flatMap((word) => [word, ...baseFormsOfAnyKind(word).map(({ base }) => base)])
    );
    const listed3 = [];
    let knownWords = 0;
    for (const word of words) {
      const candidates = await candidatesFor(db, word, examples);
      if (candidates === unknownWord) continue;
      knownWords++;
      if (candidates.length > 0) listed3.push(candidates);
      if (listed3.length === discoveredWordLimit) break;
    }
    return knownWords > 1 ? listed3 : [];
  }

  // src/search/morphology.ts
  var linkablePartsOfSpeech = /* @__PURE__ */ new Set([
    "名詞",
    "動詞",
    "形容詞",
    "形状詞",
    "代名詞",
    "接頭辞",
    "接尾辞",
    "感動詞"
  ]);
  function lookupSegments(words) {
    return words.flatMap((word) => {
      if (!isJapaneseOnly(normalizeQuery(word.surface)) || !linkablePartsOfSpeech.has(word.partOfSpeech[0] ?? "") || word.isOutOfVocabulary) {
        return [];
      }
      const form = word.dictionaryForm === "*" || word.dictionaryForm === "" ? word.surface : word.dictionaryForm;
      return [normalizeQuery(form)];
    });
  }

  // src/search/search.ts
  function searchFeatures(capabilities) {
    return { sentenceSearch: capabilities.morphology !== void 0 };
  }
  var DictionarySearch = class {
    constructor(db, capabilities = {}) {
      this.capabilities = capabilities;
      this.db = withParametersTruncatedAtNul(db);
      this.features = searchFeatures(capabilities);
    }
    capabilities;
    features;
    db;
    async search(rawQuery) {
      const query = normalizeQuery(rawQuery);
      const exactFormEntry = isASCII(query) && query !== "" ? (await rankedEnglish(this.db, query, true))[0]?.entry : void 0;
      if (exactFormEntry) {
        const refinement = normalizeQuery(exactFormEntry.reading);
        const [hasRefinedResults, literalResults] = await Promise.all([
          this.hasResults(refinement),
          this.searchOnce(literalQuery(query))
        ]);
        if (hasRefinedResults && literalResults.items.length > 0) {
          const usesPrimaryEntryExamples = literalResults.usesPrimaryEntryExamples || literalResults.items.some((item) => item.entry.id === exactFormEntry.id);
          return { ...literalResults, usesPrimaryEntryExamples, readingRefinement: refinement };
        }
      }
      const directResults = await this.searchOnce(query);
      const romajiCandidates = romajiDeinflectedCandidates(query);
      if (!directResults.hasExactOrPrefixMatch && romajiCandidates.length > 0) {
        const deinflectedResults = await Promise.all(
          romajiCandidates.map((candidate) => this.searchOnce(candidate))
        );
        const primaryIndex = deinflectedResults.findIndex((results) => results.items.length > 0);
        if (primaryIndex >= 0) {
          const primary2 = deinflectedResults[primaryIndex];
          const primaryItems = primary2.items.slice(0, primary2.leadingLexicalEntryCount);
          return composing(
            [
              primaryItems,
              ...deinflectedResults.slice(primaryIndex + 1).map((results) => results.items),
              directResults.items
            ],
            {
              leadingLexicalEntryCount: primaryItems.length,
              usesPrimaryEntryExamples: true,
              resolution: "deinflected"
            }
          );
        }
      }
      if (isJapaneseOnly(query)) {
        const deinflectedSources = await this.japaneseDeinflectedSources(query);
        if (deinflectedSources.length > 0) {
          const exactCount = leadingExactFormCount(directResults.items);
          if (exactCount > 0) {
            return composing(
              [
                directResults.items.slice(0, exactCount),
                ...deinflectedSources,
                directResults.items.slice(exactCount)
              ],
              {
                leadingLexicalEntryCount: directResults.leadingLexicalEntryCount,
                usesPrimaryEntryExamples: directResults.usesPrimaryEntryExamples,
                hasExactOrPrefixMatch: directResults.hasExactOrPrefixMatch
              }
            );
          }
          return composing([...deinflectedSources, directResults.items], {
            leadingLexicalEntryCount: deinflectedSources[0].length,
            usesPrimaryEntryExamples: true,
            resolution: "deinflected"
          });
        }
      }
      if (exactFormEntry && directResults.items.some((item) => item.entry.id === exactFormEntry.id)) {
        return { ...directResults, usesPrimaryEntryExamples: true };
      }
      if (directResults.items.length > 0) return directResults;
      if (isASCII(query)) {
        const words = await englishSentenceCandidates(this.db, query);
        return words.length > 0 ? composingWordCandidates(words) : noResults();
      }
      const analyzed = await this.analyzedItems(query);
      if (analyzed.length > 1 || isMixedScript(query) && analyzed.length > 0) {
        return {
          ...composing(
            analyzed.map((item) => [item]),
            {
              leadingLexicalEntryCount: analyzed.length,
              usesPrimaryEntryExamples: false,
              hasExactOrPrefixMatch: false,
              resolution: "analyzed",
              limit: analyzed.length
            }
          ),
          presentation: "discoveredWords"
        };
      }
      if (isMixedScript(query)) {
        for (const segment of japaneseSegments(query)) {
          const results = await this.searchOnce(segment);
          if (results.items.length > 0) {
            return { ...results, presentation: "discoveredWords", hasExactOrPrefixMatch: false };
          }
        }
      }
      return noResults();
    }
    async searchOnce(query) {
      if (query === "") return noResults();
      const ranked = isASCII(query) ? await rankedEnglish(this.db, query) : await rankedJapanese(this.db, query);
      if (ranked.length === 0) return noResults();
      let leadingLexicalEntryCount = 0;
      while (leadingLexicalEntryCount < ranked.length && sameLexicalGroup(ranked[leadingLexicalEntryCount].rank, ranked[0].rank)) {
        leadingLexicalEntryCount++;
      }
      return {
        ...noResults(),
        items: resultItems(ranked.slice(0, searchResultLimit)),
        leadingLexicalEntryCount: Math.min(leadingLexicalEntryCount, searchResultLimit),
        hasExactOrPrefixMatch: ranked.some((entry) => entry.hasExactOrPrefixMatch)
      };
    }
    async hasResults(query) {
      if (query === "") return false;
      if (isASCII(query)) return (await this.searchOnce(query)).items.length > 0;
      return hasFormContaining(this.db, query);
    }
    async analyzedItems(query) {
      const morphology = this.capabilities.morphology;
      if (!morphology || query === "") return [];
      let words;
      try {
        words = await morphology.analyze(query);
      } catch {
        return [];
      }
      const segments = lookupSegments(words);
      const results = await Promise.all(segments.map((segment) => this.searchOnce(segment)));
      return results.flatMap(({ items }, index) => {
        const item = items.find((candidate) => candidate.entry.headword === segments[index]) ?? items[0];
        return item ? [item] : [];
      });
    }
    async japaneseDeinflectedSources(query) {
      const candidates = deinflect(query).map((candidate) => ({
        ...candidate,
        term: normalizeQuery(candidate.term)
      }));
      const matchesByTerm = await rankedJapaneseForms(
        this.db,
        candidates.map((candidate) => candidate.term)
      );
      const sourcesByDepth = /* @__PURE__ */ new Map();
      const seen = /* @__PURE__ */ new Set();
      for (const candidate of candidates) {
        const matches = (matchesByTerm.get(candidate.term) ?? []).filter(
          (ranked) => candidate.wordClasses.some(
            (wordClass) => acceptsPartsOfSpeech(wordClass, ranked.entry.partsOfSpeech)
          )
        );
        for (const match of matches) {
          if (seen.has(match.entry.id)) continue;
          seen.add(match.entry.id);
          const source = sourcesByDepth.get(candidate.depth) ?? [];
          source.push(match);
          sourcesByDepth.set(candidate.depth, source);
        }
      }
      return [...sourcesByDepth.keys()].sort((lhs, rhs) => lhs - rhs).map((depth) => resultItems(sourcesByDepth.get(depth) ?? []));
    }
  };

  // src/embedded/host.ts
  function bytes(hex) {
    const decoded = new Uint8Array(hex.length / 2);
    for (let index = 0; index < decoded.length; index++) {
      decoded[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return decoded;
  }
  function hostDatabase(host) {
    return {
      all(sql, params = []) {
        if (!host.all) throw new Error("The host has no dictionary to read");
        const answer = host.all(sql, JSON.stringify(params));
        if (!answer?.rows) throw new Error(answer?.error ?? "The host returned no rows");
        stopIfInterrupted(host, 0);
        for (const column of answer.blobs ?? []) {
          for (const row of answer.rows) {
            const value = row[column];
            if (typeof value === "string") row[column] = bytes(value);
          }
        }
        return answer.rows;
      },
      interrupted: () => host.interrupted?.() ?? false
    };
  }

  // src/embedded/lookup.ts
  var sameText = (left, right) => left.normalize("NFC") === right.normalize("NFC");
  async function entriesMatchingFirstForms(db, alternatives, found) {
    let unmatched = alternatives.filter((forms2) => forms2.length > 0);
    while (unmatched.length > 0) {
      const asked = [...new Set(unmatched.map((forms2) => forms2[0]))].filter(
        (form) => found.get(form) === void 0
      );
      const queries = new Map(asked.map((form) => [form, normalizeQuery(form)]));
      const japanese = await rankedJapaneseForms(
        db,
        [...queries.values()].filter((query) => !isASCII(query))
      );
      for (const [form, query] of queries) {
        const ranked = !isASCII(query) ? japanese.get(query) ?? [] : query === "" ? [] : await rankedEnglish(db, query, true);
        found.set(
          form,
          ranked.map(({ entry: { id, reading, partsOfSpeech } }) => ({ id, reading, partsOfSpeech }))
        );
      }
      unmatched = unmatched.filter((forms2) => found.get(forms2[0])?.length === 0).map((forms2) => forms2.slice(1)).filter((forms2) => forms2.length > 0);
    }
  }
  var EmbeddedLookup = class {
    db;
    searchDb;
    constructor(host) {
      this.db = hostDatabase(host);
      this.searchDb = withParametersTruncatedAtNul(searchDatabase(this.db));
    }
    checkWordIndex() {
      checkWordIndex(this.db);
      return true;
    }
    async search(query, morphology) {
      const results = await new DictionarySearch(this.searchDb, { morphology }).search(query);
      const listed3 = listedResults(results);
      return {
        ...listed3,
        items: listed3.items.map((item, index) => ({
          ...item,
          match: matchLabel(results.items[index].sourceOrder, results.items[index].matchRank)
        })),
        primaryEntry: primaryItem(results, query)?.entry.id ?? null
      };
    }
    async entriesMatchingFirstForms(alternatives) {
      const found = /* @__PURE__ */ new Map();
      await entriesMatchingFirstForms(this.searchDb, alternatives, found);
      return Object.fromEntries(found);
    }
    entriesContainingKanji(character) {
      return kanjiWords(character, kanjiCandidateRows(this.db, character)).map((row) => row.id);
    }
    websiteRoute(link) {
      const page = websitePage(link.host, link.path);
      if (page.kind !== "word") return page;
      const [entry] = this.db.all(
        `SELECT lower(hex(id)) AS id FROM entries
       WHERE source_identity = ? AND source_record_id = ?`,
        [jmdictSource, page.entSeq]
      );
      if (entry) return { kind: "word", id: entry.id };
      return page.slug === "" ? { kind: "home" } : { kind: "search", query: page.slug };
    }
    async found(query, word, morphology) {
      const { items } = await new DictionarySearch(this.searchDb, { morphology }).search(query);
      const written3 = items.find(
        ({ entry }) => sameText(entry.headword, word.headword) && sameText(entry.reading, word.reading)
      );
      return { written: written3?.entry.id ?? null, first: items[0]?.entry.id ?? null };
    }
    async relatedWord(related, morphology) {
      if (related.targetID !== null) return related.targetID;
      const { written: written3, first } = await this.found(related.query, related, morphology);
      return written3 ?? first;
    }
    async savedWord(saved, morphology) {
      const [stored] = this.db.all(
        "SELECT lower(hex(id)) AS id FROM entries WHERE id = unhex(?)",
        [saved.id]
      );
      if (stored) return saved.id;
      return (await this.found(saved.headword, saved, morphology)).written;
    }
  };

  // src/artifact/cache.ts
  var LruCache = class {
    constructor(capacity) {
      this.capacity = capacity;
      if (!(capacity > 0)) throw new Error("An LruCache needs a positive capacity");
      this.settled = Math.floor(capacity / 2);
    }
    capacity;
    entries = /* @__PURE__ */ new Map();
    settled;
    uses = 0;
    get size() {
      return this.entries.size;
    }
    get(key) {
      const kept = this.entries.get(key);
      if (kept === void 0) return void 0;
      if (this.uses - kept.used >= this.settled) {
        this.entries.delete(key);
        kept.used = ++this.uses;
        this.entries.set(key, kept);
      }
      return kept.value;
    }
    set(key, value) {
      this.entries.delete(key);
      this.entries.set(key, { value, used: ++this.uses });
      if (this.entries.size > this.capacity) {
        const oldest = this.entries.keys().next();
        if (!oldest.done) this.entries.delete(oldest.value);
      }
      return this;
    }
  };

  // src/artifact/kanji-data.ts
  var referenceSources = {
    metadataSourceIdentity: "edrdg.kanjidic2",
    componentSourceIdentity: "edrdg.kradfile"
  };
  var elementsSchema = "zenbu.kanji-elements.v1";
  var isCJKUnifiedIdeograph2 = (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 13312 && code <= 40959;
  };
  function checkKanjiSources(sources) {
    for (const [key, value] of Object.entries(referenceSources)) {
      const recorded = sources[key];
      if (recorded !== value) {
        throw new Error(
          `Refusing the language data: KanjiReferenceData.json's ${key} is ${recorded}, not ${value}`
        );
      }
    }
    if (sources.schema !== elementsSchema) {
      throw new Error(
        `Refusing the language data: KanjiElementReferenceData.json is ${sources.schema}; the core reads ${elementsSchema}`
      );
    }
  }
  var KanjiReference = class {
    constructor(lookup) {
      this.lookup = lookup;
    }
    lookup;
    row(character) {
      const entry = this.lookup.entry(character);
      if (!entry) return null;
      return {
        character: entry.character,
        strokeCount: entry.strokeCount,
        grade: entry.grade,
        jlpt: entry.wallerJlptLevel,
        meanings: entry.meanings,
        readings: entry.readings.map(({ value, kind }) => ({ value, kind })),
        components: entry.components
      };
    }
    glossRows(forms2) {
      const characters = [];
      for (const form of forms2) {
        for (const character of form) {
          if (isCJKUnifiedIdeograph2(character) && !characters.includes(character)) {
            characters.push(character);
          }
        }
      }
      return characters.flatMap((character) => {
        const entry = this.lookup.entry(character);
        if (!entry) return [];
        return [
          {
            character,
            meanings: entry.meanings,
            readings: entry.readings.map(({ value, kind }) => ({ value, kind }))
          }
        ];
      });
    }
    structure(character) {
      const entry = this.lookup.structure(character);
      if (!entry) return null;
      return {
        onReadings: entry.onReadings,
        elementGlyphs: entry.elementGlyphs,
        explicitPhoneticElement: entry.explicitPhoneticElement
      };
    }
    elementPageRows(glyph, sources) {
      const element = this.lookup.element(glyph);
      if (!element) return null;
      const kanji2 = (characters) => characters.flatMap((character) => {
        const entry = this.lookup.structure(character);
        return entry ? [
          {
            character: entry.character,
            meanings: entry.meanings,
            onReadings: entry.onReadings,
            frequencyRank: entry.frequencyRank
          }
        ] : [];
      });
      return {
        glyph,
        meanings: element.meanings,
        commonLinkedOnReadings: element.commonLinkedOnReadings,
        alternatives: element.alternatives,
        family: kanji2([glyph, ...element.alternatives]),
        containing: kanji2(element.containingCharacters),
        structureSource: `${sources.structureSourceIdentity} ${sources.snapshot}`,
        metadataSource: `${sources.metadataSourceIdentity} ${sources.metadataSourceSnapshot}`
      };
    }
    elementRows(glyphs) {
      return glyphs.flatMap((glyph) => {
        const element = this.lookup.element(glyph);
        return element ? [
          {
            glyph,
            meanings: element.meanings,
            commonLinkedOnReadings: element.commonLinkedOnReadings
          }
        ] : [];
      });
    }
  };

  // src/detail/conjugation-table.ts
  var verbKinds = [
    "present-future",
    "past",
    "negative",
    "past-negative",
    "te-form",
    "potential",
    "passive",
    "causative",
    "conditional",
    "volitional",
    "imperative"
  ];
  function verbRules2(surface, reading = surface) {
    return verbKinds.map((kind, index) => ({
      kind,
      surface: surface[index],
      reading: reading[index]
    }));
  }
  function forms(surfaceStem, readingStem, rules2) {
    return rules2.map((rule) => ({
      kind: rule.kind,
      surface: surfaceStem + rule.surface,
      reading: readingStem + rule.reading,
      ending: rule.surface
    }));
  }
  function dropLast2(value, count = 1) {
    return graphemes(value).slice(0, -count).join("");
  }
  function lastCharacter(value) {
    return graphemes(value).at(-1);
  }
  function iAdjectiveTable(entry) {
    if (entry.headword === "いい" || lastCharacter(entry.headword) !== "い" || lastCharacter(entry.reading) !== "い") {
      return null;
    }
    const suffixes = [
      ["present-future", "い"],
      ["past", "かった"],
      ["negative", "くない"],
      ["past-negative", "くなかった"],
      ["te-form", "くて"],
      ["adverb", "く"],
      ["noun", "さ"]
    ];
    return {
      rule: "Drop the final い, then add the ending.",
      plain: forms(
        dropLast2(entry.headword),
        dropLast2(entry.reading),
        suffixes.map(([kind, suffix]) => ({ kind, surface: suffix, reading: suffix }))
      ),
      polite: []
    };
  }
  function naAdjectiveTable(entry) {
    const suffixes = [
      ["standalone", ""],
      ["modifying-a-noun", "な"],
      ["te-form", "で"],
      ["adverb", "に"],
      ["noun", "さ"]
    ];
    return {
      rule: "Keep the word as is and add な, で, or に.",
      plain: forms(
        entry.headword,
        entry.reading,
        suffixes.map(([kind, suffix]) => ({ kind, surface: suffix, reading: suffix }))
      ),
      polite: []
    };
  }
  function suruTable(entry) {
    if (!entry.headword.endsWith("する") || !entry.reading.endsWith("する")) return null;
    const surfaceStem = dropLast2(entry.headword, 2);
    const readingStem = dropLast2(entry.reading, 2);
    return {
      rule: "Conjugate する like an irregular verb after the noun.",
      plain: forms(
        surfaceStem,
        readingStem,
        verbRules2([
          "する",
          "した",
          "しない",
          "しなかった",
          "して",
          "できる",
          "される",
          "させる",
          "すれば",
          "しよう",
          "しろ"
        ])
      ),
      polite: forms(
        surfaceStem,
        readingStem,
        verbRules2([
          "します",
          "しました",
          "しません",
          "しませんでした",
          "して",
          "できます",
          "されます",
          "させます",
          "すれば",
          "しましょう",
          "しなさい"
        ])
      )
    };
  }
  function kuruTable(entry) {
    const surfaceUsesKanji = entry.headword.endsWith("来る");
    const surfaceStem = dropLast2(entry.headword, 2);
    const readingStem = dropLast2(entry.reading, 2);
    const plainReading = [
      "くる",
      "きた",
      "こない",
      "こなかった",
      "きて",
      "こられる",
      "こられる",
      "こさせる",
      "くれば",
      "こよう",
      "こい"
    ];
    const politeReading = [
      "きます",
      "きました",
      "きません",
      "きませんでした",
      "きて",
      "こられます",
      "こられます",
      "こさせます",
      "くれば",
      "きましょう",
      "きなさい"
    ];
    const plainSurface = surfaceUsesKanji ? [
      "来る",
      "来た",
      "来ない",
      "来なかった",
      "来て",
      "来られる",
      "来られる",
      "来させる",
      "来れば",
      "来よう",
      "来い"
    ] : plainReading;
    const politeSurface = surfaceUsesKanji ? [
      "来ます",
      "来ました",
      "来ません",
      "来ませんでした",
      "来て",
      "来られます",
      "来られます",
      "来させます",
      "来れば",
      "来ましょう",
      "来なさい"
    ] : politeReading;
    return {
      rule: "来る is irregular: its reading changes between く, き, and こ.",
      plain: forms(surfaceStem, readingStem, verbRules2(plainSurface, plainReading)),
      polite: forms(surfaceStem, readingStem, verbRules2(politeSurface, politeReading))
    };
  }
  function ichidanTable(entry) {
    if (lastCharacter(entry.headword) !== "る" || lastCharacter(entry.reading) !== "る") return null;
    const surfaceStem = dropLast2(entry.headword);
    const readingStem = dropLast2(entry.reading);
    return {
      rule: "Drop る, then add the ending.",
      plain: forms(
        surfaceStem,
        readingStem,
        verbRules2([
          "る",
          "た",
          "ない",
          "なかった",
          "て",
          "られる",
          "られる",
          "させる",
          "れば",
          "よう",
          "ろ"
        ])
      ),
      polite: forms(
        surfaceStem,
        readingStem,
        verbRules2([
          "ます",
          "ました",
          "ません",
          "ませんでした",
          "て",
          "られます",
          "られます",
          "させます",
          "れば",
          "ましょう",
          "なさい"
        ])
      )
    };
  }
  var godanEndings = {
    う: ["わ", "い", "え", "お", "った", "って"],
    く: ["か", "き", "け", "こ", "いた", "いて"],
    ぐ: ["が", "ぎ", "げ", "ご", "いだ", "いで"],
    す: ["さ", "し", "せ", "そ", "した", "して"],
    つ: ["た", "ち", "て", "と", "った", "って"],
    ぬ: ["な", "に", "ね", "の", "んだ", "んで"],
    ぶ: ["ば", "び", "べ", "ぼ", "んだ", "んで"],
    む: ["ま", "み", "め", "も", "んだ", "んで"],
    る: ["ら", "り", "れ", "ろ", "った", "って"]
  };
  function godanTable(entry) {
    const final = lastCharacter(entry.headword);
    const readingFinal = lastCharacter(entry.reading);
    if (final === void 0 || !Object.hasOwn(godanEndings, final) || readingFinal === void 0 || !Object.hasOwn(godanEndings, readingFinal) || final !== readingFinal) {
      return null;
    }
    const [a, i, e, o, godanPast, godanTe] = godanEndings[final];
    const surfaceStem = dropLast2(entry.headword);
    const readingStem = dropLast2(entry.reading);
    const isIkuException = entry.headword.endsWith("行く");
    const past = isIkuException ? "った" : godanPast;
    const teForm = isIkuException ? "って" : godanTe;
    return {
      rule: "Change the final kana to another vowel sound, then add the ending.",
      plain: forms(
        surfaceStem,
        readingStem,
        verbRules2([
          final,
          past,
          `${a}ない`,
          `${a}なかった`,
          teForm,
          `${e}る`,
          `${a}れる`,
          `${a}せる`,
          `${e}ば`,
          `${o}う`,
          e
        ])
      ),
      polite: forms(
        surfaceStem,
        readingStem,
        verbRules2([
          `${i}ます`,
          `${i}ました`,
          `${i}ません`,
          `${i}ませんでした`,
          teForm,
          `${e}ます`,
          `${a}れます`,
          `${a}せます`,
          `${e}ば`,
          `${i}ましょう`,
          `${i}なさい`
        ])
      )
    };
  }
  function conjugationTable(entry) {
    const has = (part) => entry.partsOfSpeech.includes(part);
    if (has("suruVerb")) return suruTable(entry);
    if (has("kuruVerb") && entry.reading.endsWith("くる")) return kuruTable(entry);
    if (has("ichidanVerb")) return ichidanTable(entry);
    if (has("godanVerb")) return godanTable(entry);
    if (has("iAdjective")) return iAdjectiveTable(entry);
    if (has("naAdjective")) return naAdjectiveTable(entry);
    return null;
  }
  function supportsModes(table) {
    return table.polite.length > 0;
  }
  function formsFor(table, mode) {
    return mode === "Polite" && table.polite.length > 0 ? table.polite : table.plain;
  }

  // src/detail/kanji-split.ts
  function hiraganaCharacters(value) {
    return graphemes(value).map((character) => {
      if (character.length !== 1) return character;
      const code = character.charCodeAt(0);
      return code >= 12449 && code <= 12534 ? String.fromCharCode(code - 96) : character;
    });
  }
  var soundChanges = {
    か: ["が"],
    き: ["ぎ"],
    く: ["ぐ"],
    け: ["げ"],
    こ: ["ご"],
    さ: ["ざ"],
    し: ["じ"],
    す: ["ず"],
    せ: ["ぜ"],
    そ: ["ぞ"],
    た: ["だ"],
    ち: ["ぢ", "じ"],
    つ: ["づ", "ず"],
    て: ["で"],
    と: ["ど"],
    は: ["ば", "ぱ"],
    ひ: ["び", "ぴ"],
    ふ: ["ぶ", "ぷ"],
    へ: ["べ", "ぺ"],
    ほ: ["ぼ", "ぽ"]
  };
  var knownVariants = /* @__PURE__ */ new WeakMap();
  var unread = [];
  function variants(readings) {
    let known = knownVariants.get(readings);
    if (!known) {
      known = readingVariants(readings);
      knownVariants.set(readings, known);
    }
    return known;
  }
  function readingVariants(readings) {
    const forms2 = /* @__PURE__ */ new Map();
    for (const reading of readings) {
      if (reading.kind === "name") continue;
      const pieces = hiraganaCharacters(reading.value).filter((character) => character !== "-").join("").split(".").filter((piece) => piece !== "");
      const base = graphemes(pieces[0] ?? "");
      if (base.length === 0) continue;
      const stems = [
        base,
        ...(soundChanges[base[0]] ?? []).map((changed) => [changed, ...base.slice(1)])
      ];
      for (const stem of stems) {
        forms2.set(stem.join(""), stem);
        const last = stem.at(-1);
        if (stem.length > 1 && last !== void 0 && "つちくき".includes(last)) {
          const small = [...stem.slice(0, -1), "っ"];
          forms2.set(small.join(""), small);
        }
      }
    }
    return [...forms2.values()].sort((left, right) => right.length - left.length);
  }
  function startsWith(target, position, candidate) {
    for (let index = 0; index < candidate.length; index++) {
      if (target[position + index] !== candidate[index]) return false;
    }
    return true;
  }
  function splitKanjiReading(kanji2, reading, readings) {
    const characters = graphemes(kanji2);
    const target = hiraganaCharacters(reading);
    const splitLengths = [];
    const current = [];
    function search(index, position, previous) {
      if (splitLengths.length >= 2) return;
      if (index >= characters.length) {
        if (position === target.length) splitLengths.push([...current]);
        return;
      }
      const character = characters[index];
      const source = character === "々" ? previous : character;
      if (source === null) return;
      for (const candidate of variants(readings.get(source) ?? unread)) {
        if (!startsWith(target, position, candidate)) continue;
        current.push(candidate.length);
        search(index + 1, position + candidate.length, source);
        current.pop();
      }
    }
    search(0, 0, null);
    if (splitLengths.length !== 1) return null;
    const original = graphemes(reading);
    let offset = 0;
    return splitLengths[0].map((length2) => {
      const part = original.slice(offset, offset + length2).join("");
      offset += length2;
      return part;
    });
  }
  function kanjiReadings(segment, readings) {
    if (segment.reading === void 0 || graphemes(segment.text).length <= 1) return null;
    return splitKanjiReading(segment.text, segment.reading, readings);
  }
  function withKanjiReadings(segments, readings) {
    return segments.map((segment) => {
      const split = kanjiReadings(segment, readings);
      return split ? { ...segment, kanjiReadings: split } : segment;
    });
  }

  // src/detail/conjugation.ts
  var conjugationKinds = {
    "present-future": {
      title: "Present/Future",
      explanation: "The non-past form. It can describe a present habit or fact, or a future action or state."
    },
    past: { title: "Past", explanation: "Describes an action or state in the past." },
    negative: {
      title: "Negative",
      explanation: "Says that an action does not happen, or a state is not true."
    },
    "past-negative": {
      title: "Past Negative",
      explanation: "Says that an action did not happen, or a state was not true."
    },
    "te-form": {
      title: "Te-Form",
      explanation: "A connecting form. It can link actions or descriptions and, depending on context, show sequence, cause, or reason."
    },
    potential: {
      title: "Potential",
      explanation: "Expresses ability or possibility: that someone can do the action or that the action is possible."
    },
    passive: {
      title: "Passive",
      explanation: "Presents the person, thing, or event affected by an action as the focus. The exact meaning depends on context."
    },
    causative: {
      title: "Causative",
      explanation: "Expresses causing or allowing another person or thing to perform an action or enter a state."
    },
    conditional: {
      title: "Conditional",
      explanation: "Sets a condition for what follows: if this happens, the next statement can apply."
    },
    volitional: {
      title: "Volitional",
      explanation: "Expresses will or intention. In context, it can also propose doing something together."
    },
    imperative: {
      title: "Imperative",
      explanation: "Gives a strong command or instruction. It can sound forceful, so context matters."
    },
    standalone: {
      title: "Standalone",
      explanation: "The adjective's base form, shown on its own rather than attached to a noun or verb."
    },
    "modifying-a-noun": {
      title: "Modifying a Noun",
      explanation: "Places the adjective before a noun to describe that noun."
    },
    adverb: {
      title: "Adverb",
      explanation: "Places the adjective form before a verb to describe how an action is done."
    },
    noun: {
      title: "Noun",
      explanation: "Turns the adjective into a noun that names the quality or its degree."
    }
  };
  function sharedSpellings(table, form, mode) {
    return formsFor(table, mode).filter((other) => other.kind !== form.kind && other.surface === form.surface).map((other) => conjugationKinds[other.kind].title);
  }
  function rowShowsFurigana(form) {
    return Array.from(form.ending).some((scalar) => {
      const code = scalar.codePointAt(0) ?? 0;
      return code >= 19968 && code <= 40959 || scalar === "々";
    });
  }
  function conjugations(entry, readings) {
    const table = conjugationTable(entry);
    if (!table) return null;
    const modes = supportsModes(table) ? ["Plain", "Polite"] : ["Plain"];
    const rows = (mode) => formsFor(table, mode).map((form) => ({
      ...form,
      ...conjugationKinds[form.kind],
      ruby: withKanjiReadings(rubySegments(form.surface, form.reading), readings),
      rowFurigana: rowShowsFurigana(form),
      sharedSpellings: sharedSpellings(table, form, mode)
    }));
    return { rule: table.rule, modes, rows: { Plain: rows("Plain"), Polite: rows("Polite") } };
  }
  function sharedSpellingNote(titles) {
    return `Same spelling as ${listedWithAnd(titles)}. Context tells them apart.`;
  }

  // src/detail/kanji-element.ts
  var meaningsPerKanji = 3;
  var unified = (character) => character.normalize("NFC").codePointAt(0) ?? 0;
  function mostFrequentFirst(left, right) {
    if (left.frequencyRank !== right.frequencyRank) {
      if (left.frequencyRank === null) return 1;
      if (right.frequencyRank === null) return -1;
      return left.frequencyRank - right.frequencyRank;
    }
    return unified(left.character) - unified(right.character);
  }
  function contribution(row) {
    return {
      character: row.character,
      meanings: row.meanings.slice(0, meaningsPerKanji),
      onReadings: row.onReadings,
      spoken: [row.character, ...row.meanings, ...row.onReadings].join(", ")
    };
  }
  function kanjiElementDetail(rows) {
    const kanji2 = (listed3) => listed3.filter((row) => isKanjiCharacter(row.character));
    const standalone = kanji2(rows.family).sort(mostFrequentFirst).at(0);
    return {
      glyph: rows.glyph,
      meanings: rows.meanings,
      explanation: rows.meanings.length > 0 ? `This element contributes forms associated with ${rows.meanings.join(", ")}.` : null,
      soundPatterns: rows.commonLinkedOnReadings.length > 0 ? `Linked on-readings: ${rows.commonLinkedOnReadings.join(", ")}` : null,
      alternatives: rows.alternatives.filter(isKanjiCharacter),
      standalone: standalone ? contribution(standalone) : null,
      containing: kanji2(rows.containing).filter((row) => !standalone || unified(row.character) !== unified(standalone.character)).map(contribution),
      structureSource: rows.structureSource,
      metadataSource: rows.metadataSource
    };
  }

  // src/detail/examples.ts
  function wordExample(rows) {
    return example(rows);
  }
  function example({
    sentence,
    example: example2
  }) {
    const tokens = example2.tokens ?? sentence.tokens;
    const links = new Map(example2.links.map((link) => [link.token, link]));
    const highlights = new Set(example2.highlights);
    return {
      position: example2.position,
      pairId: sentence.pairId,
      text: sentence.japanese,
      tokens: tokens.map((token, index) => {
        const link = links.get(index);
        const entry = link?.entSeqs.length === 1 ? link.entSeqs[0] : null;
        const reading = link?.reading ?? token.reading;
        return {
          text: token.text,
          ruby: entry !== null && reading ? rubySegments(token.text, reading) : [{ text: token.text }],
          link: link ? entry !== null ? { entSeq: entry } : { entSeqs: link.entSeqs, query: token.dictionaryForm ?? token.text } : null,
          isPageWord: highlights.has(index)
        };
      }),
      translation: sentence.english,
      japanese: {
        id: sentence.japaneseTatoebaId,
        contributor: sentence.japaneseContributor,
        license: sentence.japaneseLicense
      },
      english: {
        id: sentence.englishTatoebaId,
        contributor: sentence.englishContributor,
        license: sentence.englishLicense
      }
    };
  }

  // src/detail/part-of-speech.ts
  var verbClassNames = {
    godanVerb: "Godan verb",
    ichidanVerb: "Ichidan verb",
    suruVerb: "する verb",
    takesSuru: "する verb",
    kuruVerb: "Irregular verb",
    zuruVerb: "Zuru verb",
    archaicVerb: "Archaic verb",
    auxiliaryVerb: "Auxiliary verb"
  };
  var otherNames = {
    pronoun: "Pronoun",
    nounPrefix: "Prefix",
    nounSuffix: "Suffix",
    noAdjective: "Noun (の)",
    prenominal: "Prenominal",
    preNounAdjective: "Pre-noun adjective",
    iAdjective: "I-adjective",
    naAdjective: "Na-adjective",
    taruAdjective: "Taru adjective",
    archaicAdjective: "Archaic adjective",
    archaicNaAdjective: "Archaic na-adjective",
    adverbTo: "Adverb (と)",
    auxiliary: "Auxiliary",
    auxiliaryAdjective: "Auxiliary adjective",
    conjunction: "Conjunction",
    copula: "Copula",
    counter: "Counter",
    expression: "Expression",
    interjection: "Interjection",
    numeric: "Number",
    prefix: "Prefix",
    suffix: "Suffix",
    particle: "Particle"
  };
  var name = (names, part) => Object.hasOwn(names, part) ? names[part] : void 0;
  function partOfSpeechPhrase(parts) {
    const transitive = parts.includes("transitive");
    const intransitive = parts.includes("intransitive");
    const hasVerbClass = parts.some((part) => name(verbClassNames, part) !== void 0);
    let phrases = [];
    for (const part of parts) {
      const verb = name(verbClassNames, part);
      if (verb) phrases.push(verb);
      else if (part === "verb") {
        if (!hasVerbClass) phrases.push("Verb");
      } else if (part === "noun") {
        if (!parts.includes("noAdjective")) phrases.push("Noun");
      } else if (part === "adverb") {
        if (!parts.includes("adverbTo")) phrases.push("Adverb");
      } else {
        const other = name(otherNames, part);
        if (other) phrases.push(other);
      }
    }
    phrases = [...new Set(phrases)];
    if (transitive || intransitive) {
      const modifier = transitive && intransitive ? "transitive or intransitive" : transitive ? "transitive" : "intransitive";
      const verbIndex = phrases.findIndex((phrase) => phrase === "Verb" || phrase.endsWith(" verb"));
      if (verbIndex >= 0) phrases[verbIndex] += ` (${modifier})`;
      else phrases.push(`Verb (${modifier})`);
    }
    return phrases.join(" · ");
  }

  // src/detail/pitch.ts
  var joinsPreviousMora = new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ");
  var heiban = 0;
  var atamadaka = 1;
  var moraWidth = 1;
  var combinedMoraWidth = 1.5;
  function morae(kana) {
    const result3 = [];
    for (const character of graphemes(kana)) {
      const last = result3.at(-1);
      if (joinsPreviousMora.has(character) && last !== void 0)
        result3[result3.length - 1] = last + character;
      else result3.push(character);
    }
    return result3;
  }
  function pitchLevels(downstep, count) {
    const levels = Array.from(
      { length: count },
      (_, index) => downstep === heiban ? index > 0 : downstep === atamadaka ? index === 0 : index > 0 && index < downstep
    );
    return { morae: levels, particle: downstep === heiban };
  }
  var particleWidth = 0.6;
  function pitchGraph(kana, levels) {
    const widths = kana.map((mora) => graphemes(mora).length > 1 ? combinedMoraWidth : moraWidth);
    let x = 0;
    const points = widths.map((width, index) => {
      const point2 = { x: x + width / 2, high: levels.morae[index] };
      x += width;
      return point2;
    });
    return {
      widths,
      points,
      particle: { x: x + particleWidth / 2, high: levels.particle },
      width: x + particleWidth
    };
  }
  function pitchAccent(reading, pitch) {
    const kana = morae(katakana(reading));
    const levels = pitchLevels(pitch.downstep, kana.length);
    return {
      morae: kana.map((mora, index) => ({ mora, high: levels.morae[index] })),
      downstep: pitch.downstep,
      moraCount: pitch.moraCount,
      particleHigh: levels.particle,
      graph: pitchGraph(kana, levels)
    };
  }

  // src/detail/word.ts
  function wordSummary(entry, frequency) {
    return {
      entSeq: entry.entSeq,
      headword: entry.headword,
      reading: entry.reading,
      ruby: rubySegments(entry.headword, entry.reading),
      summary: entry.summary,
      frequency: frequencyChips(frequency)
    };
  }
  function primaryKanji(headword) {
    return [...new Set(graphemes(headword).filter(isCJKUnifiedIdeograph))];
  }
  function alternativeKanji(entry) {
    const primary2 = new Set(primaryKanji(entry.headword));
    const seen = /* @__PURE__ */ new Set();
    return entry.writtenForms.filter((form) => form.value !== entry.headword).flatMap((form) => graphemes(form.value)).filter((character) => {
      if (!isCJKUnifiedIdeograph(character) || primary2.has(character) || seen.has(character)) {
        return false;
      }
      seen.add(character);
      return true;
    });
  }
  function alternativeForms(entry) {
    const seen = /* @__PURE__ */ new Set();
    return [...entry.writtenForms, ...entry.readingForms].filter((form) => {
      if (form.value === entry.headword || form.value === entry.reading) return false;
      if (form.labels.includes("Search only") || seen.has(form.value)) return false;
      seen.add(form.value);
      return true;
    });
  }
  function displayPartOfSpeech(entry) {
    return partOfSpeechPhrase(entry.senses[0]?.partsOfSpeech ?? entry.partsOfSpeech);
  }
  function wordShareText(entry) {
    const heading = entry.reading === entry.headword ? entry.headword : `${entry.headword}【${entry.reading}】`;
    const meanings = entry.senses.map((sense, index) => `${index + 1}. ${sense.meaning}`);
    return [heading, ...meanings].join("\n");
  }
  function formKanji(value) {
    const character = graphemes(value).find(isCJKUnifiedIdeograph);
    return character && isKanjiCharacter(character) ? character : null;
  }
  var meaningsPerKanji2 = 2;
  function wordKanji(characters, glosses) {
    return characters.filter(isKanjiCharacter).map((character) => {
      const meanings = glosses.find((gloss) => gloss.character === character)?.meanings ?? [];
      return {
        character,
        meaning: meanings.length > 0 ? meanings.slice(0, meaningsPerKanji2).join(", ") : null
      };
    });
  }
  function wordDetail(rows) {
    const { entry } = rows;
    const pitch = entry.pitch ?? entry.compoundPitch;
    const summary = wordSummary(entry, rows.frequency);
    const readings = new Map(rows.kanji.map(({ character, readings: readings2 }) => [character, readings2]));
    return {
      ...summary,
      ruby: withKanjiReadings(summary.ruby, readings),
      partOfSpeech: displayPartOfSpeech(entry),
      conjugations: conjugations(entry, readings),
      pitch: pitch ? pitchAccent(entry.reading, pitch) : null,
      senses: entry.senses.map((sense, index) => ({
        number: index + 1,
        meaning: sense.meaning,
        notes: sense.notes
      })),
      frequencyRows: frequencyRowDetails(rows.frequency),
      alternatives: alternativeForms(entry).map((form) => ({
        value: form.value,
        kind: form.kind,
        labels: form.labels,
        kanji: formKanji(form.value)
      })),
      kanji: wordKanji(primaryKanji(entry.headword), rows.kanji),
      alternativeKanji: wordKanji(alternativeKanji(entry), rows.kanji),
      related: entry.relationships.map((relationship) => ({
        headword: relationship.headword,
        reading: relationship.reading,
        ruby: rubySegments(relationship.headword, relationship.reading),
        relation: relationship.relation,
        summary: relationship.summary,
        entSeq: relationship.targetEntSeq
      })),
      examples: rows.examples.map(wordExample),
      exampleCount: rows.exampleCount,
      shareText: wordShareText(entry)
    };
  }

  // src/results/learner.ts
  function evidenceLookups(evidence) {
    if (!evidence) return () => null;
    return (id) => {
      if (!Object.hasOwn(evidence.entries, id)) return null;
      return evidence.entries[id].map((lookup) => {
        const dictionary = lookup.dictionary === null ? null : evidence.dictionaries[lookup.dictionary];
        if ("unavailable" in lookup) {
          return { dictionary: dictionary ?? null, unavailable: lookup.unavailable };
        }
        if (!dictionary) throw new Error(`The evidence names no dictionary ${lookup.dictionary}`);
        return { dictionary, value: lookup.value };
      });
    };
  }
  function enabledDictionaries(ids, lookups) {
    for (const id of ids) {
      const found = lookups(id);
      if (!found) continue;
      const dictionaries = found.flatMap(({ dictionary }) => dictionary ? [dictionary] : []);
      return dictionaries.length === found.length ? dictionaries : null;
    }
    return null;
  }
  function wordRows(items, lookups, isKnown, place, leadingFamily = null) {
    return items.map((item, index) => {
      const chips = frequencyLookupChips(lookups(item.id), leadingFamily);
      return {
        id: item.id,
        summary: item.matchedSummary ?? item.entrySummary,
        chips: chips.chips,
        spoken: [...isKnown(item.id) ? ["Known"] : [], place(index), chips.spoken].join(", ")
      };
    });
  }
  function menu(sort, filter, dictionaries, ordered, isKnown) {
    const sorts = [
      relevanceSort,
      ...dictionaries.map(({ id }) => ({ by: "frequency", family: frequencyFamily(id) })),
      { by: "knownWords" }
    ];
    const summary = sortSummary(sort, dictionaries);
    return {
      status: `Sorted by ${summary}${filter === "all" ? "" : " · 1 filter"}`,
      sort: {
        chosen: storedSort(sort),
        summary,
        options: sorts.map((option, index) => ({
          value: storedSort(option),
          title: option.by === "frequency" ? frequencySortName(dictionaries[index - 1]) : sortSummary(option, dictionaries),
          announcement: sortAnnouncement(option, dictionaries)
        }))
      },
      filter: {
        chosen: filter,
        title: filterTitles[filter],
        options: resultFilters.map((option) => ({
          value: option,
          title: filterTitles[option],
          announcement: shownCountAnnouncement(filteredResults(ordered, option, isKnown).length)
        }))
      }
    };
  }
  function learnerResultsScreen(rawQuery, results, exampleCount, learner2) {
    const layout = resultsLayout(rawQuery, results, exampleCount, learner2.fromRadicals);
    if (layout.isEmpty) return { state: "noResults", query: layout.query };
    const known = new Set(learner2.known);
    const isKnown = (id) => known.has(id);
    const lookups = evidenceLookups(learner2.frequency);
    const frequencyEntries = [...new Set(layout.presented.map((item) => item.id))];
    const dictionaries = enabledDictionaries(frequencyEntries, lookups);
    const chosen = resultSort(learner2.sort);
    const sort = appliedSort(chosen, dictionaries);
    const filter = resultFilter(learner2.filter);
    const ordered = sortedResults(
      orderedByFrequency(layout.presented, lookups),
      sort,
      lookups,
      isKnown
    );
    const shown = filteredResults(ordered, filter, isKnown);
    const isRanked = layout.sections.includes("results");
    const count = shown.length + (layout.kanji ? 1 : 0);
    const discovered = discoveredWords(layout, lookups);
    const rows = layout.isDiscovered ? wordRows(
      discovered,
      lookups,
      isKnown,
      (index) => `Discovered word ${index + 1} of ${discovered.length}`
    ) : isRanked ? wordRows(
      shown,
      lookups,
      isKnown,
      (index) => `Result ${index + (layout.kanji ? 2 : 1)} of ${count}`,
      sort.by === "frequency" ? sort.family : null
    ) : [];
    return {
      state: "results",
      query: layout.query,
      sections: layout.sections,
      menu: !layout.isDiscovered && layout.presented.length > 0 ? menu(sort, filter, dictionaries ?? [], ordered, isKnown) : null,
      forgetsSort: forgetsSort(chosen, dictionaries),
      examples: layout.examples && {
        ...layout.examples,
        highlightedEntry: layout.primary?.id ?? null,
        usesHighlightedEntryExamples: results.usesPrimaryEntryExamples
      },
      readingRefinement: layout.readingRefinement && {
        ...layout.readingRefinement,
        spoken: `Search for Japanese reading ${layout.readingRefinement.query}`
      },
      heading: layout.isDiscovered ? "Discovered Words" : null,
      kanji: layout.kanji && {
        character: layout.kanji.character,
        label: layout.kanji.label,
        summary: layout.kanji.summary,
        entry: layout.kanji.entryId,
        spoken: `Result 1 of ${count}, Kanji primary`
      },
      rows,
      hiddenByFilter: isRanked && shown.length === 0 && ordered.length > 0 ? hiddenCountTitle(ordered.length - shown.length) : null,
      frequencyNotice: isRanked ? frequencyUnavailableNotice(
        frequencyEntries.flatMap((id) => {
          const found = lookups(id);
          return found ? [found] : [];
        })
      ) : null,
      frequencyEntries
    };
  }

  // src/search/radicals.ts
  var radicalSource = "edrdg.kradfile";
  var isText = (value) => typeof value === "string";
  function checkedRadicalFile(read) {
    const file = read ?? {};
    if (file.sourceIdentity !== radicalSource) {
      throw new Error(
        `Refusing the language data: RadicalReferenceData.json's sourceIdentity is ${file.sourceIdentity}, not ${radicalSource}`
      );
    }
    const { components, characters } = file;
    if (!Array.isArray(components) || !Array.isArray(characters) || !components.every(
      (radical) => isText(radical?.id) && isText(radical?.glyph) && Number.isInteger(radical?.strokeCount)
    ) || !characters.every(
      (kanji2) => isText(kanji2?.value) && Array.isArray(kanji2?.components) && kanji2.components.every(isText)
    )) {
      throw new Error(
        "Refusing the language data: RadicalReferenceData.json does not list radicals and the kanji that hold them as the core reads them"
      );
    }
    return { components, characters };
  }
  var RadicalLookup = class {
    constructor(file) {
      this.file = file;
      this.characters = [...file.characters].sort(
        (left, right) => left.components.length - right.components.length || compareStrings(left.value, right.value)
      );
    }
    file;
    characters;
    panel(selected) {
      const chosen = [...new Set(selected)];
      const candidates = chosen.length === 0 ? [] : this.characters.filter(({ components }) => chosen.every((id) => components.includes(id)));
      const available = candidates.length === 0 ? null : new Set(candidates.flatMap(({ components }) => components));
      const groups = /* @__PURE__ */ new Map();
      for (const { id, glyph, strokeCount } of this.file.components) {
        if (available && !available.has(id)) continue;
        const group = groups.get(strokeCount) ?? [];
        group.push({ id, glyph });
        groups.set(strokeCount, group);
      }
      return {
        candidates: candidates.map(({ value }) => value),
        groups: [...groups].sort(([left], [right]) => left - right).map(([strokeCount, radicals]) => ({
          strokeCount,
          label: strokeCount === 1 ? "1 Stroke" : `${strokeCount} Strokes`,
          radicals
        }))
      };
    }
  };

  // src/embedded/presentation.ts
  var rememberedKanji = 4e3;
  var EmbeddedPresentation = class {
    constructor(host) {
      this.host = host;
    }
    host;
    files;
    radicals;
    readingsByKanji = new LruCache(
      rememberedKanji
    );
    kanjiReadings = {
      get: (character) => {
        let readings = this.readingsByKanji.get(character);
        if (!readings) {
          const rows = this.kanji.glossRows([character]);
          readings = rows.find((row) => row.character === character)?.readings ?? [];
          this.readingsByKanji.set(character, readings);
        }
        return readings;
      }
    };
    get kanjiFiles() {
      if (!this.files) {
        const host = this.host;
        const sources = host.kanjiSources?.();
        if (!sources) throw new Error("The host has no kanji files to read");
        checkKanjiSources(sources);
        this.files = {
          reference: new KanjiReference({
            entry: (character) => host.kanjiEntry?.(character) ?? void 0,
            structure: (character) => host.kanjiStructure?.(character) ?? void 0,
            element: (glyph) => host.kanjiElement?.(glyph) ?? void 0
          }),
          elementSources: sources.elements
        };
      }
      return this.files;
    }
    get kanji() {
      return this.kanjiFiles.reference;
    }
    resultsScreen(request) {
      return learnerResultsScreen(
        request.query,
        request.results,
        request.exampleCount,
        request.learner
      );
    }
    wordRows(request) {
      const known = new Set(request.known);
      return wordRows(
        request.entries.map(({ id, summary }) => ({
          id,
          entrySummary: summary,
          matchedSummary: null
        })),
        evidenceLookups(request.frequency),
        (id) => known.has(id),
        (index) => `Result ${index + 1} of ${request.entries.length}`
      );
    }
    frequencyRows(request) {
      return (evidenceLookups(request.frequency)(request.entry) ?? []).map(frequencyLookupRow);
    }
    ruby([surface, reading]) {
      return withKanjiReadings(rubySegments(surface, reading), this.kanjiReadings);
    }
    wordPage(entry) {
      const detail = wordDetail({
        entry: {
          ...entry,
          entSeq: 0,
          senses: entry.senses.map((sense) => ({ ...sense, restrictions: [] })),
          relationships: entry.relationships.map((relationship) => ({
            ...relationship,
            targetEntSeq: null
          })),
          compoundPitch: null
        },
        frequency: [],
        kanji: this.kanji.glossRows([entry.headword, ...entry.writtenForms.map((form) => form.value)]),
        examples: [],
        exampleCount: null
      });
      const noted = (rows) => rows.map((row) => ({
        ...row,
        note: row.sharedSpellings.length > 0 ? sharedSpellingNote(row.sharedSpellings) : null
      }));
      return {
        ruby: detail.ruby,
        partOfSpeech: detail.partOfSpeech,
        conjugations: detail.conjugations && {
          ...detail.conjugations,
          rows: {
            Plain: noted(detail.conjugations.rows.Plain),
            Polite: noted(detail.conjugations.rows.Polite)
          }
        },
        pitch: detail.pitch,
        senses: detail.senses,
        alternatives: detail.alternatives,
        kanji: detail.kanji.map(({ character }) => character),
        alternativeKanji: detail.alternativeKanji.map(({ character }) => character),
        related: detail.related,
        shareText: detail.shareText
      };
    }
    kanjiPage(request) {
      const { character } = request;
      const words = request.words.map((word) => ({ ...word, entSeq: 0 }));
      const kanji2 = this.kanji.row(character);
      const structure = this.kanji.structure(character);
      const elements = structure ? this.kanji.elementRows(structure.elementGlyphs) : [];
      const { strokeOrder: _, ...detail } = kanjiDetail({
        kanji: kanji2 ?? {
          character,
          strokeCount: 0,
          grade: null,
          jlpt: null,
          meanings: [],
          readings: [],
          components: []
        },
        structure,
        elements,
        words,
        strokes: null
      });
      const leading = detail.words.filter((word) => word.id === request.leadingWord);
      return {
        ...detail,
        hasReference: kanji2 !== null,
        stats: kanji2 ? detail.stats : [],
        words: [...leading, ...detail.words.filter((word) => word.id !== request.leadingWord)]
      };
    }
    kanjiMeanings(character) {
      return this.kanji.row(character)?.meanings ?? [];
    }
    kanjiElementPage(glyph) {
      if (!isKanjiCharacter(glyph)) return null;
      const { reference, elementSources } = this.kanjiFiles;
      const rows = reference.elementPageRows(glyph, elementSources);
      return rows && kanjiElementDetail(rows);
    }
    kanjiStrokes(row) {
      return strokeDiagram(row);
    }
    radicalPanel(selected) {
      if (!this.radicals) {
        const file = this.host.radicals?.();
        if (!file) throw new Error("The host has no radical file to read");
        this.radicals = new RadicalLookup(checkedRadicalFile(file));
      }
      return this.radicals.panel(selected);
    }
  };

  // src/artifact/example-retrieval.ts
  var sentenceColumns = "e.rowid AS rowid, lower(hex(e.id)) AS pairId, e.japanese, e.english";
  function result(matches) {
    return {
      sentences: matches.slice(0, exampleLimit).map((match) => match.sentence),
      count: reportedExampleCount(matches.length),
      truncated: matches.length > exampleLimit
    };
  }
  function entryEvidence(db, id) {
    const rows = db.all(
      `SELECT e.reading, f.form, f.kind
     FROM entries e
     JOIN forms f ON f.entry_id = e.id
     WHERE e.id = unhex(?) AND f.kind IN (0, 1)
     ORDER BY f.kind, f.form`,
      [id]
    );
    const reading = rows.at(-1)?.reading;
    const writtenForms = new Set(rows.filter((row) => row.kind === 0).map((row) => row.form));
    const readingForms = new Set(rows.filter((row) => row.kind === 1).map((row) => row.form));
    if (reading === void 0 || !readingForms.has(reading)) return null;
    return { reading, writtenForms };
  }
  function unambiguousEntryCount(db, selectedForm, reading) {
    const [row] = db.all(
      `SELECT count(DISTINCT lower(hex(e.id))) AS count
     FROM entries e
     JOIN forms written ON written.entry_id = e.id AND written.kind = 0 AND written.form = ?
     JOIN forms spoken ON spoken.entry_id = e.id AND spoken.kind = 1 AND spoken.form = ?`,
      [selectedForm, reading]
    );
    return row?.count ?? 0;
  }
  function retrieveIndexedEntry(db, id, selectedForm) {
    const rows = db.all(
      `SELECT ${sentenceColumns}, w.surface
     FROM word_index.entry_sentences w
     JOIN example_sentences e ON e.id = w.pair_id
     WHERE w.entry_id = unhex(?)`,
      [id]
    );
    const matches = [];
    for (const { surface: rawSurface, ...sentence } of rows) {
      const surface = normalizedEntryEvidence(rawSurface);
      const position = graphemePosition(surface, sentence.japanese);
      if (position === null) continue;
      matches.push({
        sentence,
        relation: surface === selectedForm ? LexicalRelation.selectedWrittenForm : LexicalRelation.reading,
        position,
        graphemeCount: graphemeCount(sentence.japanese),
        pairId: sentence.pairId
      });
    }
    return result(matches.sort(compareRanks));
  }
  function retrieveEntryExamples(db, entry) {
    const selectedForm = normalizedEntryEvidence(entry.headword);
    const reading = normalizedEntryEvidence(entry.reading);
    if (entry.id === "" || selectedForm === "" || reading === "") return "missingEntryEvidence";
    const evidence = entryEvidence(db, entry.id);
    if (!evidence || evidence.reading !== reading) return "missingEntryEvidence";
    const isKanaHeadword = selectedForm === reading;
    if (isKanaHeadword) return retrieveIndexedEntry(db, entry.id, selectedForm);
    if (!evidence.writtenForms.has(selectedForm)) return "missingEntryEvidence";
    if (unambiguousEntryCount(db, selectedForm, reading) !== 1) return result([]);
    const alternateForms = entry.writtenForms.map(normalizedEntryEvidence).filter((form) => form !== selectedForm && evidence.writtenForms.has(form));
    const terms = [selectedForm, ...[...new Set(alternateForms)].sort(), reading];
    const rows = db.all(
      `SELECT ${sentenceColumns} FROM example_sentences e
     WHERE ${terms.map(() => "instr(e.japanese, ?) > 0").join(" OR ")}`,
      terms
    );
    const byPair = /* @__PURE__ */ new Map();
    for (const sentence of rows) {
      const evidenceMatches = [];
      const add = (term, relation) => {
        const position = graphemePosition(term, sentence.japanese);
        if (position !== null) evidenceMatches.push({ relation, position });
      };
      add(selectedForm, LexicalRelation.selectedWrittenForm);
      for (const form of alternateForms) add(form, LexicalRelation.alternateWrittenForm);
      add(reading, LexicalRelation.reading);
      const best = evidenceMatches.reduce(
        (min, next) => !min || next.relation < min.relation || next.relation === min.relation && next.position < min.position ? next : min,
        null
      );
      if (!best) continue;
      const match = {
        sentence,
        ...best,
        graphemeCount: graphemeCount(sentence.japanese),
        pairId: sentence.pairId
      };
      const existing = byPair.get(sentence.pairId);
      if (!existing || compareRanks(match, existing) < 0) byPair.set(sentence.pairId, match);
    }
    return result([...byPair.values()].sort(compareRanks));
  }

  // src/artifact/example-search.ts
  var Relation = {
    exactSurfacePhrase: 0,
    porterEquivalentPhrase: 1,
    entireJapaneseSentence: 2,
    containedJapaneseSurface: 3
  };
  var porterTable = "example_sentence_english_porter_fts";
  var exactTable = "example_sentence_english_exact_fts";
  var mapTable = "example_sentence_fts_map";
  var probeTable = "temp.example_sentence_porter_query_probe";
  function compareMatches(left, right) {
    return left.relation - right.relation || left.position - right.position || left.englishTermCount - right.englishTermCount || left.graphemeCount - right.graphemeCount || (left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0);
  }
  function result2(matches) {
    const sorted = matches.sort(compareMatches);
    return {
      sentences: sorted.slice(0, exampleLimit).map((match) => match.sentence),
      count: reportedExampleCount(sorted.length),
      truncated: sorted.length > exampleLimit
    };
  }
  function utf8Boundaries(text) {
    const boundaries = /* @__PURE__ */ new Map();
    let bytes2 = 0;
    let index = 0;
    for (const character of text) {
      boundaries.set(bytes2, index);
      const code = character.codePointAt(0) ?? 0;
      bytes2 += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
      index += character.length;
    }
    boundaries.set(bytes2, index);
    return boundaries;
  }
  function graphemeStarts(text) {
    const starts = /* @__PURE__ */ new Map();
    let index = 0;
    for (const [position, cluster] of graphemes(text).entries()) {
      starts.set(index, position);
      index += cluster.length;
    }
    starts.set(index, starts.size);
    return starts;
  }
  function textOffsets(text) {
    if (/^[\x20-\x7e]*$/.test(text)) {
      const within2 = (offset) => Number.isInteger(offset) && offset >= 0 && offset <= text.length ? offset : void 0;
      return { utf16: within2, grapheme: within2 };
    }
    const boundaries = utf8Boundaries(text);
    const starts = graphemeStarts(text);
    return { utf16: (offset) => boundaries.get(offset), grapheme: (index) => starts.get(index) };
  }
  var numbersPerOffset = 4;
  function parseOffsets(raw) {
    const values = raw.split(" ").filter(Boolean).map(Number);
    if (values.length % numbersPerOffset !== 0 || values.some(Number.isNaN)) return null;
    const offsets = [];
    for (let index = 0; index < values.length; index += numbersPerOffset) {
      offsets.push({
        term: values[index + 1],
        byteOffset: values[index + 2],
        byteLength: values[index + 3]
      });
    }
    return offsets;
  }
  function phraseRange(text, offsets, accepts) {
    if (offsets.length === 0) return null;
    const termCount = Math.max(...offsets.map((offset) => offset.term)) + 1;
    const ordered = [...offsets].sort(
      (left, right) => left.byteOffset === right.byteOffset ? left.term - right.term : left.byteOffset - right.byteOffset
    );
    const offsetsOf = textOffsets(text);
    const slice = (from, to) => {
      const start = offsetsOf.utf16(from);
      const end = offsetsOf.utf16(to);
      return start === void 0 || end === void 0 || start > end ? null : text.slice(start, end);
    };
    for (let start = 0; start < ordered.length; start++) {
      if (ordered[start].term !== 0 || start + termCount > ordered.length) continue;
      const phrase = ordered.slice(start, start + termCount);
      if (!phrase.every((offset, index) => offset.term === index)) continue;
      let crossesSentence = false;
      for (let index = 0; index + 1 < phrase.length; index++) {
        const gap = slice(
          phrase[index].byteOffset + phrase[index].byteLength,
          phrase[index + 1].byteOffset
        );
        if (gap === null || /[.?!]\s/u.test(gap)) {
          crossesSentence = true;
          break;
        }
      }
      if (crossesSentence) continue;
      const words = () => phrase.map((word) => slice(word.byteOffset, word.byteOffset + word.byteLength) ?? "");
      if (accepts && !accepts(words())) continue;
      const last = phrase[phrase.length - 1];
      const from = offsetsOf.utf16(phrase[0].byteOffset);
      const to = offsetsOf.utf16(last.byteOffset + last.byteLength);
      const location = from === void 0 ? void 0 : offsetsOf.grapheme(from);
      const end = to === void 0 ? void 0 : offsetsOf.grapheme(to);
      if (location === void 0 || end === void 0 || end < location) continue;
      return { location, length: end - location };
    }
    return null;
  }
  function porterEmitsTerms(db, query, matchExpression) {
    db.all(`CREATE VIRTUAL TABLE IF NOT EXISTS ${probeTable} USING fts4(value, tokenize=porter)`);
    db.all(`DELETE FROM ${probeTable}`);
    db.all(`INSERT INTO ${probeTable}(value) VALUES (?)`, [query]);
    const [row] = db.all(
      `SELECT count(*) AS count FROM ${probeTable} WHERE example_sentence_porter_query_probe MATCH ?`,
      [matchExpression]
    );
    return row?.count === 1;
  }
  function documentTermCount(matchinfo) {
    if (matchinfo.byteLength < 4) throw new Error("matchinfo returned no column length");
    return new DataView(matchinfo.buffer, matchinfo.byteOffset, 4).getUint32(0, true);
  }
  var sentenceColumns2 = "e.rowid AS rowid, lower(hex(e.id)) AS pairId, e.japanese, e.english";
  function exactPhraseRanges(db, matchExpression) {
    const ranges = /* @__PURE__ */ new Map();
    for (const row of db.all(
      `SELECT lower(hex(m.pair_id)) AS pairId, e.english, offsets(${exactTable}) AS offsets
     FROM ${exactTable} x
     JOIN ${mapTable} m ON m.fts_rowid = x.docid
     JOIN example_sentences e ON e.id = m.pair_id
     WHERE ${exactTable} MATCH ?`,
      [matchExpression]
    )) {
      const offsets = parseOffsets(row.offsets);
      const range = offsets && phraseRange(row.english, offsets);
      if (range) ranges.set(row.pairId, range);
    }
    return ranges;
  }
  function theQuerysWordsInAnyForm(query) {
    const sameWords = (query.match(/[0-9a-z_]+/g) ?? []).map(sameWordInAnyForm);
    return (words) => words.length === sameWords.length && words.every((word, index) => sameWords[index](word));
  }
  function retrieveEnglish(db, query) {
    if (query.includes('"')) return "embeddedQuote";
    const matchExpression = `"${query}"`;
    if (!porterEmitsTerms(db, query, matchExpression)) return "noPorterTerms";
    const exactRanges = exactPhraseRanges(db, matchExpression);
    const someSentenceHasTheExactWords = exactRanges.size > 0;
    if (!someSentenceHasTheExactWords && query.includes("*")) return result2([]);
    const wantedWords = someSentenceHasTheExactWords ? void 0 : theQuerysWordsInAnyForm(query);
    const matches = /* @__PURE__ */ new Map();
    for (const { offsets: rawOffsets, matchinfo, ...sentence } of db.all(
      `SELECT ${sentenceColumns2}, offsets(${porterTable}) AS offsets,
       matchinfo(${porterTable}, 'l') AS matchinfo
     FROM ${porterTable} p
     JOIN ${mapTable} m ON m.fts_rowid = p.docid
     JOIN example_sentences e ON e.id = m.pair_id
     WHERE ${porterTable} MATCH ?`,
      [matchExpression]
    )) {
      if (matches.has(sentence.pairId)) throw new Error("The example index lists a pair twice");
      const offsets = parseOffsets(rawOffsets);
      const porterRange = offsets && phraseRange(sentence.english, offsets, wantedWords);
      if (!porterRange) continue;
      const exactRange = exactRanges.get(sentence.pairId);
      const range = exactRange ?? porterRange;
      matches.set(sentence.pairId, {
        sentence,
        relation: exactRange ? Relation.exactSurfacePhrase : Relation.porterEquivalentPhrase,
        position: range.location,
        englishTermCount: documentTermCount(matchinfo),
        graphemeCount: graphemeCount(sentence.japanese),
        pairId: sentence.pairId
      });
    }
    const candidates = [...matches.values()];
    if (!someSentenceHasTheExactWords) return result2(candidates);
    const oneOfThoseIsListed = candidates.some(
      (candidate) => candidate.relation === Relation.exactSurfacePhrase
    );
    return result2(oneOfThoseIsListed ? candidates : []);
  }
  function retrieveJapanese(db, query) {
    return rankJapanese2(
      query,
      db.all(
        `SELECT ${sentenceColumns2} FROM example_sentences e WHERE instr(e.japanese, ?) > 0`,
        [query]
      )
    );
  }
  function rankJapanese2(query, sentences) {
    const matches = [];
    for (const sentence of sentences) {
      const index = sentence.japanese.indexOf(query);
      if (index < 0) continue;
      matches.push({
        sentence,
        relation: sentence.japanese === query ? Relation.entireJapaneseSentence : Relation.containedJapaneseSurface,
        position: graphemeCount(sentence.japanese.slice(0, index)),
        englishTermCount: 0,
        graphemeCount: graphemeCount(sentence.japanese),
        pairId: sentence.pairId
      });
    }
    return result2(matches);
  }
  function searchExamples(db, rawQuery) {
    const query = normalizeQuery(rawQuery);
    if (query === "") return "empty";
    return isASCII(query) ? retrieveEnglish(db, query) : retrieveJapanese(db, query);
  }

  // src/artifact/lookup.ts
  var exactJapaneseCandidateSQL = `SELECT lower(hex(e.id)) AS id, e.source_record_id, e.headword,
    e.reading, e.summary, e.parts_of_speech_json,
    lower(hex(e.semantic_fingerprint)) AS semantic_fingerprint, f.form, f.kind,
    (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id) AS sense_count,
    p.primary_mask, p.secondary_mask, p.news_frequency_band
  FROM forms f
  JOIN entries e ON e.id = f.entry_id
  LEFT JOIN form_priority_profiles p
    ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
  WHERE f.kind IN (0, 1)
    AND f.form = ?
    AND (
      f.kind != 1
      OR NOT EXISTS (
        SELECT 1 FROM reading_form_restrictions r
        WHERE r.entry_id = f.entry_id AND r.reading = f.form
      )
      OR EXISTS (
        SELECT 1 FROM reading_form_restrictions r
        WHERE r.entry_id = f.entry_id AND r.reading = f.form AND r.written_form = e.headword
      )
    )`;
  function formLookup(db, cache = /* @__PURE__ */ new Map()) {
    return (form) => {
      const cached = cache.get(form);
      if (cached) return cached;
      const query = normalizeQuery(form);
      const entries = query === "" || isASCII(query) ? [] : rankJapanese(query, db.all(exactJapaneseCandidateSQL, [query])).map(
        ({ entry }) => ({
          id: entry.id,
          reading: entry.reading,
          partsOfSpeech: entry.partsOfSpeech
        })
      );
      cache.set(form, entries);
      return entries;
    };
  }

  // src/examples/morphology.ts
  function kuromojiCandidates(text, tokens) {
    let previousEnd = 0;
    const candidates = [];
    for (const token of tokens) {
      const start = token.word_position - 1;
      const end = start + token.surface_form.length;
      if (start !== previousEnd || text.slice(start, end) !== token.surface_form) return null;
      previousEnd = end;
      const dictionaryForm = token.basic_form === "*" ? token.surface_form : token.basic_form;
      candidates.push({
        surface: token.surface_form,
        dictionaryForm,
        normalizedForm: dictionaryForm,
        reading: token.reading ?? token.surface_form,
        partOfSpeech: [token.pos, token.pos_detail_1, token.pos_detail_2, token.pos_detail_3].filter(
          (part) => part !== "" && part !== "*"
        ),
        isOutOfVocabulary: token.word_type !== "KNOWN",
        children: [],
        joinsInflection: false
      });
    }
    return previousEnd === text.length ? candidates : null;
  }
  var functionWordClasses = /* @__PURE__ */ new Set(["助詞", "助動詞", "記号", "補助記号"]);
  function isFunctionWord(candidate) {
    return functionWordClasses.has(candidate.partOfSpeech[0] ?? "");
  }
  var isInflectingHead = (candidate) => candidate.partOfSpeech[0] === "動詞" || candidate.partOfSpeech[0] === "形容詞";
  function isNaAdjectiveStem(candidate) {
    const pos = candidate.partOfSpeech;
    return pos[0] === "形状詞" || pos[0] === "名詞" && pos.includes("形容動詞語幹");
  }
  function attaches(candidate, previous) {
    const pos = candidate.partOfSpeech;
    switch (pos[0]) {
      case "助動詞":
        return true;
      case "助詞":
        return pos.includes("接続助詞") && ["て", "で", "ば"].includes(candidate.surface);
      case "動詞": {
        const isSuffixVerb = pos.includes("接尾");
        if (isSuffixVerb) return true;
        const isHelper = pos.includes("非自立") || pos.includes("非自立可能");
        return isHelper && ["て", "で"].includes(previous.surface);
      }
      default:
        return false;
    }
  }
  function joined(pieces) {
    const [head] = pieces;
    return {
      surface: pieces.map((piece) => piece.surface).join(""),
      dictionaryForm: head.dictionaryForm,
      normalizedForm: head.normalizedForm,
      reading: pieces.map((piece) => piece.reading).join(""),
      partOfSpeech: head.partOfSpeech,
      isOutOfVocabulary: head.isOutOfVocabulary,
      children: pieces,
      joinsInflection: true
    };
  }
  function groupInflections(candidates) {
    const grouped2 = [];
    let index = 0;
    while (index < candidates.length) {
      const head = candidates[index];
      const pieces = [head];
      index += 1;
      if (isInflectingHead(head)) {
        while (index < candidates.length && attaches(candidates[index], pieces[pieces.length - 1])) {
          pieces.push(candidates[index]);
          index += 1;
        }
      } else if (isNaAdjectiveStem(head) && index < candidates.length && ["な", "で", "に"].includes(candidates[index].surface) && ["助動詞", "助詞"].includes(candidates[index].partOfSpeech[0])) {
        pieces.push(candidates[index]);
        index += 1;
      }
      grouped2.push(pieces.length === 1 ? head : joined(pieces));
    }
    return grouped2;
  }

  // src/examples/forms.ts
  function analyzedWords(candidates) {
    return candidates === null ? [] : groupInflections(candidates).map((word) => word.surface);
  }
  function usesForm(japanese, candidates, surface) {
    return japanese.includes(surface) && analyzedWords(candidates).includes(surface);
  }

  // src/examples/linking.ts
  var verbs = /* @__PURE__ */ new Set([
    "verb",
    "godanVerb",
    "ichidanVerb",
    "suruVerb",
    "kuruVerb",
    "zuruVerb",
    "archaicVerb",
    "auxiliaryVerb"
  ]);
  var adjectives = /* @__PURE__ */ new Set([
    "iAdjective",
    "naAdjective",
    "taruAdjective",
    "archaicAdjective",
    "archaicNaAdjective",
    "auxiliaryAdjective"
  ]);
  var nouns = /* @__PURE__ */ new Set([
    "noun",
    "pronoun",
    "nounPrefix",
    "nounSuffix",
    "noAdjective",
    "prenominal",
    "takesSuru"
  ]);
  function isCompatible(part, providerPOS) {
    switch (providerPOS) {
      case "動詞":
        return verbs.has(part);
      case "形容詞":
      case "形状詞":
        return adjectives.has(part);
      case "名詞":
      case "代名詞":
        return nouns.has(part);
      case "副詞":
        return part === "adverb" || part === "adverbTo";
      case "助詞":
        return part === "particle" || part === "conjunction";
      case "助動詞":
        return ["auxiliary", "auxiliaryVerb", "copula", "suffix", "nounSuffix"].includes(part) || adjectives.has(part);
      case "接続詞":
        return part === "conjunction";
      case "連体詞":
        return part === "preNounAdjective";
      case "感動詞":
        return part === "interjection";
      case "接頭辞":
        return part === "prefix" || part === "nounPrefix";
      case "接尾辞":
        return part === "suffix" || part === "nounSuffix";
      default:
        return true;
    }
  }
  function highlightedForms({ entry, query }) {
    return new Set(
      [query, entry.headword, entry.reading, ...entry.writtenForms, ...entry.readingForms].filter(
        (form) => form !== ""
      )
    );
  }
  function isWrittenAs(candidate, forms2) {
    if (!forms2) return false;
    return [candidate.surface, candidate.dictionaryForm, candidate.normalizedForm].some(
      (form) => forms2.has(form)
    );
  }
  function remembered2(compute) {
    const known = /* @__PURE__ */ new WeakMap();
    return (key) => {
      let value = known.get(key);
      if (value === void 0) {
        value = compute(key);
        known.set(key, value);
      }
      return value;
    };
  }
  var grouped = remembered2(groupInflections);
  var isLookedUp = remembered2(
    (candidate) => isJapaneseOnly(normalizeQuery(candidate.surface))
  );
  var lookupForms = remembered2(formsToLookUp);
  function formsToLookUp(candidate) {
    const forms2 = [];
    const append = (value) => {
      if (value !== "" && value !== "*" && !forms2.includes(value)) forms2.push(value);
    };
    const evidence = candidate.joinsInflection ? [candidate.dictionaryForm, candidate.normalizedForm] : [candidate.surface, candidate.dictionaryForm, candidate.normalizedForm];
    for (const form of evidence) {
      append(form);
      append(toHiragana(form));
      append(toKatakana(form));
    }
    return forms2;
  }
  function hasCompatiblePart(entry, providerPOS) {
    for (const part of entry.partsOfSpeech) {
      if (isCompatible(part, providerPOS)) return true;
    }
    return false;
  }
  function preferredEntries(entries, candidate, matchesSurfaceReading) {
    let filtered = entries;
    const providerPOS = candidate.partOfSpeech[0];
    if (providerPOS !== void 0) {
      const compatible = [];
      for (const entry of filtered) {
        if (hasCompatiblePart(entry, providerPOS)) compatible.push(entry);
      }
      if (compatible.length > 0) filtered = compatible;
    }
    if (matchesSurfaceReading && candidate.reading !== "" && candidate.reading !== "*") {
      const readingMatches = [];
      for (const entry of filtered) {
        if (toKatakana(entry.reading) === candidate.reading) readingMatches.push(entry);
      }
      if (readingMatches.length > 0) filtered = readingMatches;
    }
    return filtered;
  }
  function formsLookedUp(candidates, highlighted) {
    const forms2 = highlighted ? highlightedForms(highlighted) : null;
    return grouped(candidates).filter((candidate) => !isWrittenAs(candidate, forms2) && isLookedUp(candidate)).map(lookupForms);
  }
  function linkedTokens(text, candidates, highlighted, lookup) {
    if (candidates === null) {
      return text === "" ? [] : [
        {
          surface: text,
          entry: null,
          candidates: [],
          reading: text,
          dictionaryForm: text,
          partOfSpeech: [],
          lookupForm: null
        }
      ];
    }
    const forms2 = highlighted ? highlightedForms(highlighted) : null;
    const resolve = (candidate) => {
      if (highlighted && isWrittenAs(candidate, forms2)) {
        return { entry: highlighted.entry, candidates: [highlighted.entry], lookupForm: null };
      }
      if (!isLookedUp(candidate)) {
        return { entry: null, candidates: [], lookupForm: null };
      }
      for (const form of lookupForms(candidate)) {
        const family = lookup(form);
        if (family.length === 0) continue;
        const preferred = preferredEntries(family, candidate, form === candidate.surface);
        const found = preferred.length > 0 ? preferred : family;
        return { entry: found.length === 1 ? found[0] : null, candidates: found, lookupForm: form };
      }
      return { entry: null, candidates: [], lookupForm: null };
    };
    const token = (candidate, resolution) => ({
      surface: candidate.surface,
      entry: resolution.entry,
      candidates: resolution.candidates,
      reading: candidate.reading,
      dictionaryForm: candidate.dictionaryForm,
      partOfSpeech: candidate.partOfSpeech,
      lookupForm: resolution.lookupForm
    });
    const tokens = [];
    for (const candidate of grouped(candidates)) {
      const resolution = resolve(candidate);
      if (resolution.candidates.length === 0 && candidate.children.length > 1) {
        const children = candidate.children.map((child) => token(child, resolve(child)));
        if (children.some((child) => child.candidates.length > 0)) {
          tokens.push(...children);
          continue;
        }
      }
      tokens.push(token(candidate, resolution));
    }
    return tokens;
  }
  function displayReading(token, entry) {
    const forms2 = [entry.headword, ...entry.writtenForms, ...entry.readingForms];
    if (forms2.includes(token.surface) || token.reading === "") return entry.reading;
    return toHiragana(token.reading);
  }

  // src/artifact/word-examples.ts
  function linkedEntries(db, ids) {
    if (ids.length === 0) return /* @__PURE__ */ new Map();
    const rows = db.all(
      `SELECT lower(hex(id)) AS id, source_record_id AS ent_seq, headword, reading,
       parts_of_speech_json, written_forms_json, reading_forms_json
     FROM entries WHERE id IN (${listedIds})`,
      [JSON.stringify(ids)]
    );
    const values = (json) => JSON.parse(json).map((form) => form.value);
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          entSeq: row.ent_seq,
          headword: row.headword,
          reading: row.reading,
          partsOfSpeech: JSON.parse(row.parts_of_speech_json),
          writtenForms: values(row.written_forms_json),
          readingForms: values(row.reading_forms_json)
        }
      ])
    );
  }
  var examplesEntries = linkedEntries;
  function tokenSpans(tokens) {
    let start = 0;
    return tokens.map((token) => {
      const end = start + scalarCount(token.surface);
      const span = { start, end };
      start = end;
      return span;
    });
  }
  function occurrences(text, query) {
    if (query === "") return [];
    const scalars = Array.from(text);
    const needle = Array.from(query);
    if (needle.length === 0 || needle.length > scalars.length) return [];
    const found = [];
    for (let start = 0; start + needle.length <= scalars.length; start++) {
      if (needle.every((scalar, index) => scalars[start + index] === scalar)) {
        found.push({ start, end: start + needle.length });
      }
    }
    return found;
  }

  // src/examples/ipadic.ts
  var none = -1;
  var beginning = 0;
  var unreached = Number.MAX_VALUE;
  var rememberedFeatures = 5e4;
  var classesACharacterCanName = 256;
  var punctuation = /、|。/;
  function written2(bytes2) {
    let text = "";
    let at = 0;
    while (at < bytes2.length) {
      const first = bytes2[at++];
      let code;
      if (first < 128) {
        code = first;
      } else if (first >> 5 === 6) {
        code = (first & 31) << 6 | bytes2[at++] & 63;
      } else if (first >> 4 === 14) {
        const second = bytes2[at++];
        code = (first & 15) << 12 | (second & 63) << 6 | bytes2[at++] & 63;
      } else {
        const second = bytes2[at++];
        const third = bytes2[at++];
        code = (first & 7) << 18 | (second & 63) << 12 | (third & 63) << 6 | bytes2[at++] & 63;
      }
      if (code < 65536) {
        text += String.fromCharCode(code);
      } else {
        code -= 65536;
        text += String.fromCharCode(55296 | code >> 10, 56320 | code & 1023);
      }
    }
    return text;
  }
  function writtenFrom(bytes2, start) {
    const end = bytes2.indexOf(0, start);
    return written2(bytes2.subarray(start, end < 0 ? bytes2.length : end));
  }
  var Words = class {
    shorts;
    lists;
    records;
    text;
    listOf;
    features = /* @__PURE__ */ new Map();
    constructor(records, text, lists) {
      this.shorts = new Int16Array(records, 0, records.byteLength >> 1);
      this.records = new DataView(records);
      this.text = new Uint8Array(text);
      this.lists = new Int32Array(lists, 0, lists.byteLength >> 2);
      const listed3 = this.lists[0] ?? 0;
      let listOf = new Int32Array(Math.max(listed3, 1));
      for (let at = 1, read = 0; read < listed3; read++, at += 2 + this.lists[at + 1]) {
        const key = this.lists[at];
        if (key >= listOf.length) {
          const wider = new Int32Array(Math.max(key + 1, listOf.length * 2));
          wider.set(listOf);
          listOf = wider;
        }
        if (listOf[key] !== 0) throw new Error(`The word lists name ${key} twice`);
        if (this.lists[at + 1] > 0) listOf[key] = at + 1;
      }
      this.listOf = listOf;
    }
    list(key) {
      const list = this.listOf[key];
      if (!list) throw new TypeError(`No words are listed for ${key}`);
      return list;
    }
    featuresOf(word) {
      let features = this.features.get(word);
      if (features === void 0) {
        features = writtenFrom(this.text, this.records.getInt32(word + 6, true)).split(",");
        if (this.features.size >= rememberedFeatures) this.features.clear();
        this.features.set(word, features);
      }
      return features;
    }
  };
  function characterClasses(categories, definitions) {
    const bytes2 = new Uint8Array(definitions);
    const names = [];
    const invoked = [];
    const grouped2 = [];
    for (let at = 0; at + 1 < bytes2.length && names.length < classesACharacterCanName; ) {
      invoked.push(bytes2[at]);
      grouped2.push(bytes2[at + 1]);
      const end = bytes2.indexOf(0, at + 6);
      names.push(written2(bytes2.subarray(at + 6, end < 0 ? bytes2.length : end)));
      at = (end < 0 ? bytes2.length : end) + 1;
    }
    const fallback = names.indexOf("DEFAULT");
    const of = new Uint8Array(categories);
    if (fallback < 0 || of.length < 65536) {
      throw new Error("The character classes do not cover every character");
    }
    return {
      of,
      count: names.length,
      alwaysInvoked: Uint8Array.from(invoked),
      grouped: Uint8Array.from(grouped2),
      named: Int32Array.from(names, (name2) => names.indexOf(name2)),
      fallback
    };
  }
  var Lattice = class {
    starts = new Int32Array(1024);
    lefts = new Int32Array(1024);
    rights = new Int32Array(1024);
    costs = new Int32Array(1024);
    words = new Int32Array(1024);
    spans = new Int32Array(1024);
    following = new Int32Array(1024);
    best = new Int32Array(1024);
    shortest = new Float64Array(1024);
    first = new Int32Array(0);
    last = new Int32Array(0);
    count = 0;
    furthest = 0;
    begin(positions) {
      if (this.first.length < positions) {
        this.first = new Int32Array(positions * 2);
        this.last = new Int32Array(positions * 2);
      }
      this.first.fill(none, 0, positions);
      this.count = 0;
      this.furthest = 0;
      this.shortest[this.add(0, 0, none, 0, 0, 0, none)] = 0;
    }
    add(position, start, word, left, right, cost, span) {
      const node = this.count++;
      if (node === this.starts.length) this.widen();
      this.starts[node] = start;
      this.words[node] = word;
      this.lefts[node] = left;
      this.rights[node] = right;
      this.costs[node] = cost;
      this.spans[node] = span;
      this.best[node] = none;
      this.shortest[node] = unreached;
      this.following[node] = none;
      if (this.first[position] === none) this.first[position] = node;
      else this.following[this.last[position]] = node;
      this.last[position] = node;
      if (this.furthest < position) this.furthest = position;
      return node;
    }
    widen() {
      const size = this.starts.length * 2;
      const wider = (old) => {
        const array = new Int32Array(size);
        array.set(old);
        return array;
      };
      this.starts = wider(this.starts);
      this.lefts = wider(this.lefts);
      this.rights = wider(this.rights);
      this.costs = wider(this.costs);
      this.words = wider(this.words);
      this.spans = wider(this.spans);
      this.following = wider(this.following);
      this.best = wider(this.best);
      const shortest = new Float64Array(size);
      shortest.set(this.shortest);
      this.shortest = shortest;
    }
  };
  var Ipadic = class {
    base;
    check;
    known;
    unknown;
    connections;
    classes;
    lattice = new Lattice();
    units = new Int32Array(0);
    offsets = new Int32Array(0);
    kinds = new Uint8Array(0);
    ends = new Int32Array(0);
    utf8 = new Uint8Array(0);
    unitAt = new Int32Array(0);
    bytes = 0;
    constructor(read) {
      if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
        throw new Error("The dictionary files are little-endian, and this machine is not");
      }
      const base = read("base");
      const check = read("check");
      const connections = read("cc");
      this.base = new Int32Array(base, 0, base.byteLength >> 2);
      this.check = new Int32Array(check, 0, check.byteLength >> 2);
      if (this.base.length !== this.check.length) {
        throw new Error("The word index and its check differ in size");
      }
      this.known = new Words(read("tid"), read("tid_pos"), read("tid_map"));
      this.unknown = new Words(read("unk"), read("unk_pos"), read("unk_map"));
      this.connections = new Int16Array(connections, 0, connections.byteLength >> 1);
      this.classes = characterClasses(read("unk_char"), read("unk_invoke"));
    }
    tokenize(text) {
      const tokens = [];
      let rest = text;
      while (rest !== "") {
        const stop = rest.search(punctuation);
        this.sentence(stop < 0 ? rest : rest.substring(0, stop + 1), tokens);
        if (stop < 0) break;
        rest = rest.substring(stop + 1);
      }
      return tokens;
    }
    sentence(text, tokens) {
      const characters = this.read(text);
      const lattice = this.lattice;
      lattice.begin(characters + text.length + 3);
      for (let character = 0; character < characters; character++) {
        this.unknownWords(character, this.knownWords(character));
      }
      const end = Math.max(1, lattice.furthest) + 1;
      const last = lattice.add(lattice.furthest + 1, end, none, 0, 0, 0, none);
      this.search(end);
      this.shape(text, last, tokens);
    }
    read(text) {
      const length2 = text.length;
      if (this.units.length <= length2) {
        this.units = new Int32Array(length2 * 2 + 1);
        this.offsets = new Int32Array(length2 * 2 + 1);
        this.kinds = new Uint8Array(length2 * 2 + 1);
        this.ends = new Int32Array(length2 * 2 + 1);
        this.utf8 = new Uint8Array(length2 * 6 + 4);
        this.unitAt = new Int32Array(length2 * 6 + 5);
      }
      const { units, offsets, kinds } = this;
      const utf8 = this.utf8;
      const unitAt = this.unitAt;
      const { of, fallback, named } = this.classes;
      let characters = 0;
      let bytes2 = 0;
      for (let unit = 0; unit < length2; characters++) {
        const code = text.charCodeAt(unit);
        units[characters] = unit;
        offsets[characters] = bytes2;
        unitAt[bytes2] = unit;
        if (code >= 55296 && code <= 56319) {
          const low = text.charCodeAt(unit + 1);
          if (!(low >= 56320 && low <= 57343)) {
            throw new TypeError("A high surrogate stands without its low surrogate");
          }
          const point2 = (code - 55296) * 1024 + 65536 + (low - 56320);
          utf8[bytes2++] = point2 >>> 18 | 240;
          utf8[bytes2++] = point2 >> 12 & 63 | 128;
          utf8[bytes2++] = point2 >> 6 & 63 | 128;
          utf8[bytes2++] = point2 & 63 | 128;
          kinds[characters] = fallback;
          unit += 2;
          continue;
        }
        if (code < 128) {
          utf8[bytes2++] = code;
        } else if (code < 2048) {
          utf8[bytes2++] = code >>> 6 | 192;
          utf8[bytes2++] = code & 63 | 128;
        } else {
          utf8[bytes2++] = code >>> 12 | 224;
          utf8[bytes2++] = code >> 6 & 63 | 128;
          utf8[bytes2++] = code & 63 | 128;
        }
        kinds[characters] = of[code];
        unit++;
      }
      units[characters] = length2;
      offsets[characters] = bytes2;
      unitAt[bytes2] = length2;
      this.bytes = bytes2;
      const ends = this.ends;
      for (let character = characters - 1; character >= 0; character--) {
        const continues = character + 1 < characters && named[kinds[character + 1]] === named[kinds[character]];
        ends[character] = continues ? ends[character + 1] : character + 1;
      }
      return characters;
    }
    knownWords(character) {
      const { base, check, lattice } = this;
      const utf8 = this.utf8;
      const unitAt = this.unitAt;
      const { shorts, lists } = this.known;
      const from = this.units[character];
      const limit = this.bytes;
      let found = 0;
      let parent = 0;
      for (let at = this.offsets[character]; at < limit; at++) {
        const child = base[parent] + utf8[at];
        if (check[child] !== parent) break;
        parent = child;
        const terminal = base[child];
        if (check[terminal] !== child) continue;
        const value = base[terminal];
        if (value > 0) throw new TypeError("A word in the index has no number");
        found++;
        const list = this.known.list(-value - 1);
        const length2 = unitAt[at + 1] - from;
        for (let listed3 = list + 1; listed3 <= list + lists[list]; listed3++) {
          const word = lists[listed3];
          const record = word >> 1;
          lattice.add(
            character + length2,
            character + 1,
            word,
            shorts[record],
            shorts[record + 1],
            shorts[record + 2],
            none
          );
        }
      }
      return found;
    }
    unknownWords(character, found) {
      const { alwaysInvoked, grouped: grouped2, count } = this.classes;
      const kind = this.kinds[character];
      if (kind >= count) throw new TypeError(`No character class is numbered ${kind}`);
      if (found !== 0 && alwaysInvoked[kind] !== 1) return;
      const units = this.units;
      let end = character + 1;
      let length2 = 1;
      if (grouped2[kind] === 1 && this.ends[character] > end) {
        end = this.ends[character];
        length2 = units[end] - units[character];
      }
      const { shorts, lists } = this.unknown;
      const list = this.unknown.list(kind);
      for (let listed3 = list + 1; listed3 <= list + lists[list]; listed3++) {
        const word = lists[listed3];
        const record = word >> 1;
        this.lattice.add(
          character + length2,
          character + 1,
          word,
          shorts[record],
          shorts[record + 1],
          shorts[record + 2],
          end
        );
      }
    }
    search(end) {
      const { starts, lefts, rights, costs, following, best, shortest, first } = this.lattice;
      const connections = this.connections;
      const across = connections[1];
      let chosen = none;
      for (let position = 1; position <= end; position++) {
        for (let node = first[position]; node !== none; node = following[node]) {
          let previous = first[starts[node] - 1];
          if (previous === none) continue;
          const left = lefts[node] + 2;
          const own = costs[node];
          let cost = unreached;
          for (; previous !== none; previous = following[previous]) {
            const through = shortest[previous] + connections[rights[previous] * across + left] + own;
            if (through < cost) {
              chosen = previous;
              cost = through;
            }
          }
          best[node] = chosen;
          shortest[node] = cost;
        }
      }
    }
    shape(text, last, tokens) {
      const { starts, words, spans, best } = this.lattice;
      const path = [];
      for (let node = best[last]; node !== beginning; node = best[node]) {
        if (node === none) return;
        path.push(node);
      }
      const before = tokens.length > 0 ? tokens[tokens.length - 1].word_position : 0;
      for (let step = path.length - 1; step >= 0; step--) {
        const node = path[step];
        const character = starts[node] - 1;
        const isKnown = spans[node] === none;
        const features = (isKnown ? this.known : this.unknown).featuresOf(words[node]);
        tokens.push({
          word_type: isKnown ? "KNOWN" : "UNKNOWN",
          word_position: before + starts[node],
          surface_form: isKnown ? features[0] : text.slice(this.units[character], this.units[spans[node]]),
          pos: features[1],
          pos_detail_1: features[2],
          pos_detail_2: features[3],
          pos_detail_3: features[4],
          basic_form: features[7],
          reading: isKnown ? features[8] : void 0
        });
      }
    }
  };
  function ipadicTokenizer(read) {
    let dictionary;
    return (text) => {
      dictionary ??= new Ipadic(read);
      return dictionary.tokenize(text);
    };
  }

  // src/embedded/text.ts
  function hostCandidate(word) {
    return {
      surface: word.surface,
      dictionaryForm: word.dictionaryForm,
      normalizedForm: word.normalizedForm ?? word.dictionaryForm,
      reading: word.reading ?? word.surface,
      partOfSpeech: [...word.partOfSpeech],
      isOutOfVocabulary: word.isOutOfVocabulary,
      children: (word.children ?? []).map(hostCandidate),
      joinsInflection: false
    };
  }
  var listed2 = (sentences) => sentences.map(({ pairId, japanese, english }) => ({ id: `esp1_${pairId}`, japanese, english }));
  function answered(found) {
    if (typeof found === "string") throw new Error(found);
    return { sentences: listed2(found.sentences), count: found.count, truncated: found.truncated };
  }
  var EmbeddedText = class {
    db;
    searchDb;
    forms = new LruCache(2e4);
    lookup;
    entries = new LruCache(4e3);
    linked = new LruCache(512);
    searched = new LruCache(32);
    retrieved = new LruCache(64);
    tokenize;
    readsItsFiles;
    constructor(host) {
      this.db = hostDatabase(host);
      this.searchDb = searchDatabase(this.db);
      this.lookup = formLookup(this.db, this.forms);
      this.readsItsFiles = !host.tokenize && host.tokenizerFile !== void 0;
      this.tokenize = host.tokenize ? (text) => host.tokenize?.(text) ?? [] : host.tokenizerFile && ipadicTokenizer((file) => {
        const bytes2 = host.tokenizerFile?.(file);
        if (!bytes2) throw new Error(`The host has no ${file} for the tokenizer`);
        return bytes2;
      });
    }
    found(ids) {
      const found = /* @__PURE__ */ new Map();
      const unread2 = [];
      for (const id of new Set(ids)) {
        const cached = this.entries.get(id);
        if (cached) found.set(id, cached);
        else unread2.push(id);
      }
      for (const [id, entry] of examplesEntries(this.db, unread2)) {
        this.entries.set(id, entry);
        found.set(id, entry);
      }
      return found;
    }
    search(query) {
      const normalized2 = normalizeQuery(query);
      const cached = this.searched.get(normalized2);
      if (cached !== void 0) return cached;
      const found = searchExamples(this.db, normalized2);
      this.searched.set(normalized2, found);
      return found;
    }
    retrieve(id) {
      const cached = this.retrieved.get(id);
      if (cached !== void 0) return cached;
      const entry = this.found([id]).get(id);
      const found = entry ? retrieveEntryExamples(this.db, entry) : "missingEntryEvidence";
      this.retrieved.set(id, found);
      return found;
    }
    checkExamples() {
      checkExamples(this.db);
      return true;
    }
    tokenizerReady() {
      if (!this.readsItsFiles) return this.tokenize !== void 0;
      try {
        return this.tokenize?.("") !== void 0;
      } catch {
        return false;
      }
    }
    exampleCount(query) {
      const found = this.search(query);
      return typeof found === "string" ? 0 : found.count;
    }
    listed(request) {
      return request.usesPrimaryEntryExamples && request.primaryEntry !== null ? this.retrieve(request.primaryEntry) : this.search(request.query);
    }
    resultsExampleCount(request) {
      const found = this.listed(request);
      if (typeof found === "string") return 0;
      return request.usesPrimaryEntryExamples && request.primaryEntry !== null ? found.sentences.length : found.count;
    }
    resultsExamples(request) {
      const found = this.listed(request);
      return typeof found === "string" ? [] : listed2(found.sentences);
    }
    entryExamples(id) {
      return answered(this.retrieve(id));
    }
    async candidates(text, analyze) {
      try {
        if (this.tokenize) return kuromojiCandidates(text, this.tokenize(text));
        return (await analyze(text)).map(hostCandidate);
      } catch {
        return null;
      }
    }
    async formExamples(form, analyze) {
      const found = this.search(form);
      if (typeof found === "string") return [];
      const sentences = [];
      for (const sentence of found.sentences) {
        if (!sentence.japanese.includes(form)) continue;
        if (usesForm(sentence.japanese, await this.candidates(sentence.japanese, analyze), form)) {
          sentences.push(sentence);
        }
      }
      return listed2(sentences);
    }
    async prefetch(candidates, highlighted) {
      const alternatives = formsLookedUp(candidates, highlighted).map(
        (forms2) => forms2.filter((form) => {
          if (this.forms.get(form) !== void 0) return true;
          const query = normalizeQuery(form);
          if (query !== "" && !isASCII(query)) return true;
          this.forms.set(form, []);
          return false;
        })
      );
      await entriesMatchingFirstForms(this.searchDb, alternatives, this.forms);
    }
    async linkedTokens(request, analyze) {
      const { text } = request;
      const query = normalizeQuery(request.query);
      const key = JSON.stringify([text, query, request.highlightedEntry]);
      const known = this.linked.get(key);
      if (known) return known;
      const candidates = await this.candidates(text, analyze);
      const entry = request.highlightedEntry ? this.found([request.highlightedEntry]).get(request.highlightedEntry) ?? null : null;
      const highlighted = entry ? { entry, query } : null;
      if (candidates) await this.prefetch(candidates, highlighted);
      const tokens = linkedTokens(text, candidates, highlighted, this.lookup);
      const linked = this.found(tokens.flatMap((token) => token.entry ? [token.entry.id] : []));
      const matches = occurrences(text, query);
      const answer = tokenSpans(tokens).map(({ start, end }, index) => {
        const token = tokens[index];
        const target = token.entry ? linked.get(token.entry.id) : void 0;
        const furigana = target ? displayReading(token, target) : null;
        const functionWord = isFunctionWord(token);
        return {
          surface: token.surface,
          start,
          end,
          reading: candidates ? token.reading : null,
          isFunctionWord: functionWord,
          entry: token.entry?.id ?? null,
          candidates: token.entry ? [] : token.candidates.map((candidate) => candidate.id),
          furigana,
          ruby: furigana === null ? null : rubySegments(token.surface, furigana),
          isPageWord: entry !== null && token.entry?.id === entry.id,
          matchesQuery: matches.some((match) => match.start < end && start < match.end),
          attaches: attachment(token.surface),
          counted: token.entry !== null && !functionWord
        };
      });
      if (candidates) this.linked.set(key, answer);
      return answer;
    }
  };

  // src/embedded/dictionary.ts
  var message = (error) => error instanceof Error ? error.message : String(error);
  function once(make) {
    let made;
    return () => {
      made ??= make();
      return made;
    };
  }
  function embeddedEndpoint(host) {
    const lookup = once(() => new EmbeddedLookup(host));
    const text = once(() => new EmbeddedText(host));
    const presentation = once(() => new EmbeddedPresentation(host));
    const methods = {
      checkWordIndex: () => lookup().checkWordIndex(),
      search: (query, analyze) => lookup().search(query, { analyze }),
      entriesMatchingFirstForms: (alternatives) => lookup().entriesMatchingFirstForms(JSON.parse(alternatives)),
      entriesContainingKanji: (character) => lookup().entriesContainingKanji(character),
      websiteRoute: (link) => lookup().websiteRoute(JSON.parse(link)),
      relatedWord: (related, analyze) => lookup().relatedWord(JSON.parse(related), { analyze }),
      savedWord: (saved, analyze) => lookup().savedWord(JSON.parse(saved), { analyze }),
      normalizeQuery,
      japaneseCandidates: (candidates) => japaneseCandidates(JSON.parse(candidates)),
      isKanji: isKanjiCharacter,
      romaji,
      sentenceRomaji: (words) => sentenceRomaji(JSON.parse(words)),
      checkExamples: () => text().checkExamples(),
      tokenizerReady: () => text().tokenizerReady(),
      exampleCount: (query) => text().exampleCount(query),
      resultsExampleCount: (request) => text().resultsExampleCount(JSON.parse(request)),
      resultsExamples: (request) => text().resultsExamples(JSON.parse(request)),
      entryExamples: (id) => text().entryExamples(id),
      formExamples: (form, analyze) => text().formExamples(form, analyze),
      linkedTokens: (request, analyze) => text().linkedTokens(JSON.parse(request), analyze),
      resultsScreen: (request) => presentation().resultsScreen(JSON.parse(request)),
      wordRows: (request) => presentation().wordRows(JSON.parse(request)),
      frequencyRows: (request) => presentation().frequencyRows(JSON.parse(request)),
      ruby: (pair) => presentation().ruby(JSON.parse(pair)),
      wordPage: (entry) => presentation().wordPage(JSON.parse(entry)),
      kanjiPage: (request) => presentation().kanjiPage(JSON.parse(request)),
      kanjiMeanings: (character) => presentation().kanjiMeanings(character),
      kanjiElementPage: (glyph) => presentation().kanjiElementPage(glyph),
      kanjiStrokes: (row) => presentation().kanjiStrokes(JSON.parse(row)),
      radicalPanel: (selected) => presentation().radicalPanel(JSON.parse(selected)),
      gloss: shortGloss
    };
    const unanalyzed = () => {
      throw new Error("An answer asked for at once cannot wait for an analysis");
    };
    const answer = (method, argument) => {
      const run = Object.hasOwn(methods, method) ? methods[method] : void 0;
      if (!run) throw new Error(`The core has no ${method}`);
      const value = run(argument, unanalyzed);
      if (value instanceof Promise) throw new Error(`${method} does not answer at once`);
      return value;
    };
    return {
      answer,
      answerJSON: (method, argument) => JSON.stringify(answer(method, argument) ?? null),
      begin(method, argument) {
        const unfinished = { error: `${method} did not finish within its call` };
        let outcome = unfinished;
        let answer2;
        const analyze = (sentence) => new Promise((resolve, reject) => {
          outcome = { analyze: sentence };
          answer2 = (answerJSON) => {
            const { words, error } = JSON.parse(answerJSON);
            if (words) resolve(words);
            else reject(new Error(error ?? "The host returned no words"));
          };
        });
        Promise.resolve().then(() => {
          const run = Object.hasOwn(methods, method) ? methods[method] : void 0;
          if (!run) throw new Error(`The core has no ${method}`);
          return run(argument, analyze);
        }).then(
          (value) => {
            outcome = { value };
          },
          (error) => {
            outcome = { error: message(error) };
          }
        );
        return {
          outcome: () => JSON.stringify(outcome),
          analyzed(answerJSON) {
            const settle = answer2;
            if (!settle) throw new Error(`${method} is waiting for no analysis`);
            answer2 = void 0;
            outcome = unfinished;
            settle(answerJSON);
          }
        };
      }
    };
  }

  // src/embedded/javascriptcore.ts
  Object.assign(globalThis, { zenbuDictionary: embeddedEndpoint(zenbuHost) });
})();
