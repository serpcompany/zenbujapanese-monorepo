"use strict";
(() => {
  // src/daily-lists.ts
  var dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  var idPattern = /^00000000-da11-4000-8000-0000(\d{4})(\d{2})(\d{2})$/i;
  function existingDay(year, month, date) {
    const moment = /* @__PURE__ */ new Date(0);
    moment.setUTCFullYear(Number(year), Number(month) - 1, Number(date));
    const exists = moment.getUTCFullYear() === Number(year) && moment.getUTCMonth() === Number(month) - 1 && moment.getUTCDate() === Number(date);
    return exists ? `${year}-${month}-${date}` : null;
  }
  function dailyListId(day) {
    const parts = dayPattern.exec(day);
    if (!parts) return null;
    const [, year = "", month = "", date = ""] = parts;
    return existingDay(year, month, date) ? `00000000-da11-4000-8000-0000${year}${month}${date}` : null;
  }
  function dailyListDay(id) {
    const parts = idPattern.exec(id);
    if (!parts) return null;
    const [, year = "", month = "", date = ""] = parts;
    return existingDay(year, month, date);
  }

  // src/text.ts
  var unsafe = /[\p{Cc}\p{Cs}]/u;
  var everyUnsafe = /[\p{Cc}\p{Cs}]/gu;
  var surrogate = /\p{Cs}/u;
  var invisible = /\p{Cc}|\p{Cf}|\p{Cs}/u;
  var replacement = "�";
  var madeSafe = (character) => surrogate.test(character) ? replacement : " ";
  var codePoints = (text) => [...text].length;
  var hasInvisibleCharacters = (text) => invisible.test(text);
  var isBlank = (text) => text.trim() === "";
  var plainText = (raw) => (unsafe.test(raw) ? raw.replace(everyUnsafe, madeSafe) : raw).normalize("NFC").trim();
  function cutText(raw, most2) {
    const plain = plainText(raw);
    return plain.length <= most2 ? plain : [...plain].slice(0, most2).join("").trim();
  }
  function keptWithin(text, least, most2) {
    if (text.length < least) return false;
    if (text.length <= most2 && text.length >= 2 * least) return true;
    const length = codePoints(text);
    return length >= least && length <= most2;
  }

  // src/lists.ts
  var listLimits = {
    lists: 500,
    wordsPerList: 5e3,
    position: 1e5,
    nameLength: 500
  };
  function listNameCutToFit(typed) {
    const name = cutText(typed, listLimits.nameLength);
    return name === "" ? null : name;
  }

  // src/notes.ts
  var noteTextLength = 1e4;
  var lineBreaks = /\r\n?/g;
  var surrogates = /\p{Cs}/gu;
  var controlsButLinesAndTabs = /[^\P{Cc}\n\t]/gu;
  var keptNoteText = (typed) => typed.replace(lineBreaks, "\n").replace(surrogates, "�").replace(controlsButLinesAndTabs, " ").normalize("NFC").trim();
  function noteText(typed) {
    const text = keptNoteText(typed);
    return keptWithin(text, 1, noteTextLength) ? text : null;
  }

  // src/profile.ts
  var profileLimits = { nameLength: 100, usernameLength: { min: 3, max: 30 } };
  var { min, max } = profileLimits.usernameLength;
  var usernamePattern = new RegExp(`^[a-z0-9_]{${min},${max}}$`);
  var spacesInside = /[^\S\u{FEFF}]+/gu;
  var nameRule = `A name is 1 to ${profileLimits.nameLength} characters, with no control characters.`;
  var usernameRule = `A username is ${min} to ${max} letters a to z, digits, or underscores.`;
  function accountName(typed) {
    const name = typed.normalize("NFC").trim().replace(spacesInside, " ");
    return keptWithin(name, 1, profileLimits.nameLength) && !hasInvisibleCharacters(name) ? name : null;
  }
  function accountUsername(typed) {
    const username = typed.normalize("NFKC").trim().toLowerCase();
    return usernamePattern.test(username) ? username : null;
  }
  var removesTheUsername = isBlank;
  var usernameToSave = (typed) => removesTheUsername(typed) ? "" : accountUsername(typed);

  // src/sign-in-code.ts
  var digits = "[0-9]{6}";
  var signInCode = { length: 6, typedPattern: `\\s*${digits}\\s*` };
  var wholeCode = new RegExp(`^${digits}$`);
  function signInCodeOf(typed) {
    const code = typed.trim();
    return wholeCode.test(code) ? code : null;
  }

  // src/watch.ts
  var watchLimits = { textLength: 200, seconds: 1e7, comprehension: 1 };
  var most = {
    duration: watchLimits.seconds,
    position: watchLimits.seconds,
    comprehension: watchLimits.comprehension
  };
  var watchNumbers = Object.keys(most);
  function watchText(typed) {
    const text = cutText(typed, watchLimits.textLength);
    return text === "" ? null : text;
  }
  var fitsTheWatch = (field, value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= most[field];
  var sentText = (value) => typeof value === "string" ? watchText(value) : null;
  var sentWatch = ([title, author, duration, position, comprehension]) => [
    sentText(title),
    sentText(author),
    fitsTheWatch("duration", duration) ? duration : null,
    fitsTheWatch("position", position) ? position : null,
    fitsTheWatch("comprehension", comprehension) ? comprehension : null
  ];
  function sentWatchMarks(watches) {
    const replaced = [];
    let marks = "";
    for (const watch of watches) {
      const sent = sentWatch(watch);
      for (let field = 0; field < sent.length; field += 1) {
        const value = sent[field];
        if (value === null) marks += "-";
        else if (value === watch[field]) marks += "k";
        else {
          marks += "r";
          replaced.push(String(value));
        }
      }
    }
    return replaced.length === 0 ? marks : `${marks}
${JSON.stringify(replaced)}`;
  }

  // src/embedded/answers.ts
  var answers = {
    accountName,
    accountUsername,
    usernameToSave,
    signInCode: signInCodeOf,
    listName: listNameCutToFit,
    dailyListId,
    dailyListDay,
    keptNoteText,
    noteText,
    sentWatches: (watches) => sentWatchMarks(JSON.parse(watches))
  };
  function answer(rule, argument) {
    const run = Object.hasOwn(answers, rule) ? answers[rule] : void 0;
    if (!run) throw new Error(`The account rules have no ${rule}`);
    return run(argument);
  }

  // src/embedded/javascriptcore.ts
  Object.assign(globalThis, {
    zenbuAccountRules: {
      answer,
      answerJSON: (rule, argument) => JSON.stringify(answer(rule, argument))
    }
  });
})();
