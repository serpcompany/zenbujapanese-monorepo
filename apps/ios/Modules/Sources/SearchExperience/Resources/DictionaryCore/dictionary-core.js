"use strict";
(() => {
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
  var jitenPack = (name) => ({
    kind: "pack",
    packId: `zenbu.jiten.${name}.ja.ordered-v2`
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
  var jlptKanjiLists = jlptLists.map(({ slug, name, level }) => ({
    slug,
    name,
    jlptLevel: level
  }));

  // src/artifact/database.ts
  function searchDatabase(db) {
    return {
      async all(sql, params) {
        return db.all(sql, params);
      },
      interrupted: () => db.interrupted?.() ?? false
    };
  }

  // src/detail/text.ts
  var segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  function graphemes(value) {
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  function isSingleUnitGrapheme(unit) {
    return unit >= 32 && unit <= 126 || unit >= 12288 && unit <= 12543 && !(unit >= 12330 && unit <= 12335) && unit !== 12441 && unit !== 12442 || unit >= 19968 && unit <= 40959 || unit >= 65280 && unit <= 65519 && unit !== 65438 && unit !== 65439;
  }
  function graphemeCount(value) {
    for (let index = 0; index < value.length; index++) {
      if (!isSingleUnitGrapheme(value.charCodeAt(index))) return graphemes(value).length;
    }
    return value.length;
  }

  // src/detail/kanji.ts
  var kanjiWordLimit = 24;
  var compareLowercaseHex = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  var codePointLength = (value) => [...value].length;
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

  // src/detail/frequency.ts
  var formatRank = new Intl.NumberFormat("en-US");

  // src/search/query.ts
  var graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  function graphemes2(value) {
    return Array.from(graphemeSegmenter.segment(value), (segment) => segment.segment);
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
  function normalizeQuery(raw) {
    const folded = raw.normalize("NFKC").toLowerCase();
    if (/^[\x20-\x7e]*$/.test(folded)) return folded.split(" ").filter(Boolean).join(" ");
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
    return Array.from(value).every((character) => (character.codePointAt(0) ?? 0) < 128);
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
  function isJapaneseOnly(value) {
    const segments = japaneseSegments(value);
    return value !== "" && segments.length === 1 && segments[0] === value;
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
  var EvidenceLane = { strongGloss: 0, tokenGloss: 1, romajiOnly: 2 };
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

  // src/results/results.ts
  function compareRelevance(lhs, rhs) {
    return lhs.sourceOrder - rhs.sourceOrder || comparePresentationRanks(lhs.matchRank, rhs.matchRank);
  }

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
    if (!evidence) return [];
    const { rows, glossMatches, romajiMatches } = evidence;
    const ranked = [];
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(db, step++);
      const entry = decodeEntry(row);
      const displayedFormPriority = profile(row);
      const gloss = glossMatches.get(entry.id) ?? [];
      const romaji = romajiMatches.get(entry.id) ?? [];
      const selectedGloss = minimum(gloss, glossEvidencePrecedes);
      const shared = {
        priorityPresenceRank: isMarked(displayedFormPriority) ? 0 : 1,
        priorityProfile: displayedFormPriority,
        headwordLength: graphemeCount(entry.headword),
        semanticFingerprint: row.semantic_fingerprint
      };
      if (!selectedGloss) {
        const romajiRelation = romaji.length > 0 ? Math.min(...romaji) : void 0;
        if (romajiRelation === void 0) continue;
        const rank2 = {
          kind: "english",
          lane: EvidenceLane.romajiOnly,
          corroborationRank: 0,
          romajiSpecificityRank: romajiRelation,
          senseOrder: 0,
          glossOrder: 0,
          ...shared
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
      const corroborated = lane === EvidenceLane.strongGloss && romaji.some(
        (relation) => relation === RomajiRelation.exact || relation === RomajiRelation.prefix
      );
      const rank = {
        kind: "english",
        lane,
        corroborationRank: corroborated ? 0 : 1,
        romajiSpecificityRank: 0,
        senseOrder: selectedGloss.senseOrder,
        glossOrder: selectedGloss.glossOrder,
        ...shared
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
  async function glossEvidence(db, query, match) {
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
       WHERE dictionary_gloss_fts MATCH ?`,
      [match]
    );
    const token = glossToken(query);
    const result = /* @__PURE__ */ new Map();
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(db, step++);
      const senseWrittenForms = JSON.parse(row.written_forms);
      const senseReadings = JSON.parse(row.readings);
      const appliesToShownForms = (senseWrittenForms.length === 0 || senseWrittenForms.includes(normalizeQuery(row.headword))) && (senseReadings.length === 0 || senseReadings.includes(normalizeQuery(row.reading)));
      if (!appliesToShownForms) continue;
      const relation = glossRelation(query, row.text, token);
      if (relation === null) continue;
      const evidence = result.get(row.entry_id) ?? [];
      evidence.push({
        relation,
        senseOrder: row.sense_order,
        glossOrder: row.gloss_order,
        meaning: row.text
      });
      result.set(row.entry_id, evidence);
    }
    return result;
  }
  async function romajiEvidence(db, query, match) {
    const rows = await db.all(
      `SELECT lower(hex(f.entry_id)) AS entry_id, f.form
       FROM dictionary_form_fts x JOIN forms f ON f.rowid = x.docid
       WHERE dictionary_form_fts MATCH ? AND f.kind = ${FormKind.romaji}`,
      [match]
    );
    const result = /* @__PURE__ */ new Map();
    let step = 0;
    for (const row of rows) {
      stopIfInterrupted(db, step++);
      const relation = row.form === query ? RomajiRelation.exact : row.form.startsWith(query) ? RomajiRelation.prefix : RomajiRelation.contains;
      const relations = result.get(row.entry_id) ?? [];
      if (!relations.includes(relation)) relations.push(relation);
      result.set(row.entry_id, relations);
    }
    return result;
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

  // src/search/composition.ts
  var searchResultLimit = 60;
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
          const primary = deinflectedResults[primaryIndex];
          const primaryItems = primary.items.slice(0, primary.leadingLexicalEntryCount);
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

  // src/embedded/dictionary.ts
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
        const answer = JSON.parse(host.all(sql, JSON.stringify(params)));
        if (!answer.rows) throw new Error(answer.error ?? "The host returned no rows");
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
  function relevanceRanks(items) {
    const ordered = [...items].sort(compareRelevance);
    const ranks = /* @__PURE__ */ new Map();
    let rank = 0;
    for (const [index, item] of ordered.entries()) {
      if (index > 0 && compareRelevance(ordered[index - 1], item) !== 0) rank += 1;
      ranks.set(item.entry.id, rank);
    }
    return ranks;
  }
  var EmbeddedDictionary = class {
    db;
    searchDb;
    constructor(host) {
      this.db = hostDatabase(host);
      this.searchDb = withParametersTruncatedAtNul(searchDatabase(this.db));
    }
    async search(query, morphology) {
      const results = await new DictionarySearch(this.searchDb, { morphology }).search(query);
      const ranks = relevanceRanks(results.items);
      return {
        ...results,
        items: results.items.map((item) => ({
          id: item.entry.id,
          relevance: ranks.get(item.entry.id) ?? 0,
          fallbackOrder: item.fallbackOrder,
          matchedSummary: item.matchedSummary,
          match: matchLabel(item.sourceOrder, item.matchRank)
        }))
      };
    }
    async entriesMatchingForms(forms) {
      const queries = new Map(forms.map((form) => [form, normalizeQuery(form)]));
      const japanese = await rankedJapaneseForms(
        this.searchDb,
        [...queries.values()].filter((query) => !isASCII(query))
      );
      const found = /* @__PURE__ */ new Map();
      for (const [form, query] of queries) {
        const ranked = !isASCII(query) ? japanese.get(query) ?? [] : query === "" ? [] : await rankedEnglish(this.searchDb, query, true);
        found.set(
          form,
          ranked.map(({ entry: { id, reading, partsOfSpeech } }) => ({ id, reading, partsOfSpeech }))
        );
      }
      return found;
    }
    async entriesMatchingFirstForms(alternatives) {
      const found = /* @__PURE__ */ new Map();
      let unmatched = alternatives.filter((forms) => forms.length > 0);
      while (unmatched.length > 0) {
        const asked = unmatched.map((forms) => forms[0]).filter((form) => !found.has(form));
        for (const [form, entries] of await this.entriesMatchingForms(asked)) {
          found.set(form, entries);
        }
        unmatched = unmatched.filter((forms) => found.get(forms[0])?.length === 0).map((forms) => forms.slice(1)).filter((forms) => forms.length > 0);
      }
      return Object.fromEntries(found);
    }
    entriesContainingKanji(character) {
      return kanjiWords(character, kanjiCandidateRows(this.db, character)).map((row) => row.id);
    }
  };
  var message = (error) => error instanceof Error ? error.message : String(error);
  function embeddedEndpoint(dictionary) {
    const methods = {
      search: (query, morphology) => dictionary.search(query, morphology),
      entriesMatchingFirstForms: (alternatives) => dictionary.entriesMatchingFirstForms(JSON.parse(alternatives)),
      entriesContainingKanji: (character) => dictionary.entriesContainingKanji(character),
      normalizeQuery
    };
    return {
      begin(method, argument) {
        const unfinished = { error: `${method} did not finish within its call` };
        let outcome = unfinished;
        let answer;
        const morphology = {
          analyze: (text) => new Promise((resolve, reject) => {
            outcome = { analyze: text };
            answer = (answerJSON) => {
              const { words, error } = JSON.parse(answerJSON);
              if (words) resolve(words);
              else reject(new Error(error ?? "The host returned no words"));
            };
          })
        };
        Promise.resolve().then(() => {
          const run = methods[method];
          if (!run) throw new Error(`The core has no ${method}`);
          return run(argument, morphology);
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
            const settle = answer;
            if (!settle) throw new Error(`${method} is waiting for no analysis`);
            answer = void 0;
            outcome = unfinished;
            settle(answerJSON);
          }
        };
      }
    };
  }

  // src/embedded/javascriptcore.ts
  Object.assign(globalThis, { zenbuDictionary: embeddedEndpoint(new EmbeddedDictionary(zenbuHost)) });
})();
