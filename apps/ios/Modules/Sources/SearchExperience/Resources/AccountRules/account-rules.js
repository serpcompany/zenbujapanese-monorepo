"use strict";
(() => {
  // src/text.ts
  var surrogates = /\p{Cs}/gu;
  var controls = /\p{Cc}/gu;
  var invisible = /\p{Cc}|\p{Cf}|\p{Cs}/u;
  var replacement = "�";
  var codePoints = (text) => [...text].length;
  var hasInvisibleCharacters = (text) => invisible.test(text);
  var isBlank = (text) => text.trim() === "";
  var plainText = (raw) => raw.replace(surrogates, replacement).replace(controls, " ").normalize("NFC").trim();
  var cutText = (raw, most2) => [...plainText(raw)].slice(0, most2).join("").trim();
  var keptWithin = (text, least, most2) => {
    const length = codePoints(text);
    return length >= least && length <= most2;
  };

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
  var surrogates2 = /\p{Cs}/gu;
  var controlsButLinesAndTabs = /[^\P{Cc}\n\t]/gu;
  var keptNoteText = (typed) => typed.replace(lineBreaks, "\n").replace(surrogates2, "�").replace(controlsButLinesAndTabs, " ").normalize("NFC").trim();
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

  // src/embedded/answers.ts
  var answers = {
    accountName,
    accountUsername,
    removesTheUsername,
    signInCode: signInCodeOf,
    listName: listNameCutToFit,
    keptNoteText,
    noteText,
    watchText,
    fitsTheWatch: (request) => {
      const [field, value] = JSON.parse(request);
      return fitsTheWatch(field, value);
    }
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
