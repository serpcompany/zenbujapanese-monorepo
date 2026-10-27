const sections: Record<string, string> = {
  Meaning: '英語の意味',
  Frequency: '使用頻度',
  Conjugations: '活用',
  Alternatives: '別の表記',
  Kanji: '漢字',
  'Alternative kanji': '別表記の漢字',
  'Related words': '関連語',
  Lists: 'リスト',
  Notes: 'メモ',
  Examples: '例文',
  Readings: '読み方',
  Components: '部品',
  Elements: '構成要素',
  Words: '単語',
  'Alternative forms': '異体字',
  'Meaning / structure': '意味・構造',
  'Sound patterns': '音のパターン',
  'As a standalone kanji': '単独の漢字として',
  'Kanji containing this element': 'この要素を含む漢字',
  Source: '出典'
}

const kanji: Record<string, string> = {
  Sound: '音符',
  'Sound pattern': '音のパターン',
  On: '音読み',
  Kun: '訓読み',
  Name: '名乗り',
  Stroke: '画数',
  Strokes: '画数',
  Grade: '学年',
  'Stroke Order': '書き順',
  'Previous stroke': '前の画',
  'Play stroke order': '書き順を再生',
  'Pause stroke order': '書き順を一時停止',
  'Next stroke': '次の画'
}

const partsOfSpeech: Record<string, string> = {
  Verb: '動詞',
  'Godan verb': '五段動詞',
  'Ichidan verb': '一段動詞',
  'する verb': 'サ変動詞',
  'Irregular verb': 'カ変動詞',
  'Zuru verb': 'ずる動詞',
  'Archaic verb': '文語動詞',
  'Auxiliary verb': '助動詞',
  Noun: '名詞',
  Pronoun: '代名詞',
  Prefix: '接頭辞',
  Suffix: '接尾辞',
  'Noun (の)': '名詞（の）',
  Prenominal: '連体修飾語',
  'Pre-noun adjective': '連体詞',
  'I-adjective': '形容詞',
  'Na-adjective': '形容動詞',
  'Taru adjective': 'タルト形容動詞',
  'Archaic adjective': '文語形容詞',
  'Archaic na-adjective': '文語形容動詞',
  Adverb: '副詞',
  'Adverb (と)': '副詞（と）',
  Auxiliary: '補助語',
  'Auxiliary adjective': '補助形容詞',
  Conjunction: '接続詞',
  Copula: '断定の助動詞',
  Counter: '助数詞',
  Expression: '表現',
  Interjection: '感動詞',
  Number: '数詞',
  Particle: '助詞',
  transitive: '他動詞',
  intransitive: '自動詞',
  'transitive or intransitive': '自動詞・他動詞',
  'Dictionary entry': '辞書項目'
}

const languageData: Record<string, string> = {
  'Usually written in kana': '通常はかな書き',
  Archaic: '古語',
  Obsolete: '古い用法',
  Honorific: '尊敬語',
  Humble: '謙譲語',
  Colloquial: '口語',
  Rare: 'まれ',
  'Search only': '検索用',
  'Irregular kana': '不規則なかな',
  'Irregular kanji': '不規則な漢字',
  'Irregular okurigana': '不規則な送り仮名',
  'See also': '参照',
  'Related intransitive verb': '対応する自動詞',
  'Related transitive verb': '対応する他動詞'
}

const conjugations: Record<string, string> = {
  'Present/Future': '現在・未来形',
  Past: '過去形',
  Negative: '否定形',
  'Past Negative': '過去否定形',
  'Te-Form': 'て形',
  Potential: '可能形',
  Passive: '受身形',
  Causative: '使役形',
  Conditional: '条件形',
  Volitional: '意向形',
  Imperative: '命令形',
  Standalone: '基本形',
  'Modifying a Noun': '名詞修飾形',
  Plain: '普通形',
  Polite: '丁寧形',
  'The non-past form. It can describe a present habit or fact, or a future action or state.':
    '過去ではない形です。現在の習慣や事実、または未来の動作や状態を表します。',
  'Describes an action or state in the past.': '過去の動作や状態を表します。',
  'Says that an action does not happen, or a state is not true.':
    '動作が起こらないこと、または状態が当てはまらないことを表します。',
  'Says that an action did not happen, or a state was not true.':
    '動作が起こらなかったこと、または状態が当てはまらなかったことを表します。',
  'A connecting form. It can link actions or descriptions and, depending on context, show sequence, cause, or reason.':
    '文をつなぐ形です。動作や説明をつなぎ、文脈によって順序・原因・理由を表します。',
  'Expresses ability or possibility: that someone can do the action or that the action is possible.':
    '能力や可能性を表します。その動作ができること、またはその動作が起こりうることを示します。',
  'Presents the person, thing, or event affected by an action as the focus. The exact meaning depends on context.':
    '動作の影響を受ける人・物・出来事を中心にして表します。正確な意味は文脈によって決まります。',
  'Expresses causing or allowing another person or thing to perform an action or enter a state.':
    'ほかの人や物にある動作をさせること、または許すこと、ある状態にさせることを表します。',
  'Sets a condition for what follows: if this happens, the next statement can apply.':
    '後に続く内容の条件を表します。これが起これば、次の内容が当てはまります。',
  'Expresses will or intention. In context, it can also propose doing something together.':
    '意志や意図を表します。文脈によっては、一緒に何かをしようと誘う意味にもなります。',
  'Gives a strong command or instruction. It can sound forceful, so context matters.':
    '強い命令や指示を表します。きつく聞こえることがあるため、使う場面に気をつけます。',
  "The adjective's base form, shown on its own rather than attached to a noun or verb.":
    '形容詞の基本の形です。名詞や動詞に付けず、単独で示します。',
  'Places the adjective before a noun to describe that noun.':
    '名詞の前に置いて、その名詞を説明する形です。',
  'Places the adjective form before a verb to describe how an action is done.':
    '動詞の前に置いて、動作のしかたを説明する形です。',
  'Turns the adjective into a noun that names the quality or its degree.':
    '性質やその程度を表す名詞にする形です。',
  'Drop the final い, then add the ending.': '最後の「い」を取り、語尾を付けます。',
  'Keep the word as is and add な, で, or に.': 'そのままの形に「な」「で」「に」を付けます。',
  'Conjugate する like an irregular verb after the noun.':
    '名詞の後ろの「する」を、サ変動詞として活用させます。',
  '来る is irregular: its reading changes between く, き, and こ.':
    '「来る」は不規則に活用し、読みが「く」「き」「こ」と変わります。',
  'Drop る, then add the ending.': '「る」を取り、語尾を付けます。',
  'Change the final kana to another vowel sound, then add the ending.':
    '最後のかなを別の段の音に変え、語尾を付けます。'
}

const frequency: Record<string, string> = {
  'very common': 'とてもよく使われる',
  common: 'よく使われる',
  'moderately common': 'ときどき使われる',
  uncommon: 'あまり使われない',
  rare: 'まれ',
  'Not listed': '掲載なし',
  'No rank': '順位なし',
  Unavailable: '取得できません',
  Level: 'レベル',
  'JLPT Level': 'JLPTレベル',
  Rank: '順位',
  Percentile: 'パーセンタイル',
  'JLPT Levels': 'JLPTレベル',
  'JLPT study levels (unofficial)': 'JLPTの学習レベル（非公式）',
  'Everyday YouTube Japanese · TUBELEX': '日常的なYouTubeの日本語・TUBELEX',
  "Estimated JLPT levels (N5–N1) from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010, so levels are study estimates, not an exam syllabus.":
    'Jonathan Wallerの語彙リストに基づく推定JLPTレベル（N5〜N1）です。JLPTは2010年以降、公式の語彙リストを公表していないため、レベルは学習の目安であり、試験の出題範囲ではありません。',
  'Japanese used in YouTube subtitles across everyday media categories; this is media frequency, not universal Japanese frequency.':
    '日常的なさまざまなジャンルのYouTube字幕で使われる日本語です。メディアでの使用頻度であり、日本語全体での使用頻度ではありません。',
  'JLPT vocabulary lists by Jonathan Waller, with JMdict IDs by stephenmk (CC BY-SA 4.0)':
    'Jonathan WallerのJLPT語彙リスト（JMdictとの対応付けはstephenmk、CC BY-SA 4.0）',
  'TUBELEX Japanese frequency lists by Adam Nohejl and contributors':
    'Adam NohejlらによるTUBELEX日本語頻度リスト',
  "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010.":
    'JLPTのレベルは、Jonathan Wallerの語彙リストに基づく学習の目安です。JLPTは2010年以降、公式の語彙リストを公表していません。',
  'Frequency rank loading': '頻度順位を読み込み中',
  'No frequency dictionary enabled': '頻度辞書が有効になっていません',
  'No frequency rank': '頻度順位なし',
  'A frequency dictionary': '頻度辞書',
  Games: 'ゲーム',
  'TV & Movies': 'テレビ・映画',
  Anime: 'アニメ',
  Manga: 'マンガ',
  Novels: '小説',
  'Visual Novels': 'ビジュアルノベル',
  'TV and movies': 'テレビ・映画',
  'Visual novels': 'ビジュアルノベル',
  'Video games': 'ゲーム',
  'Secondary school': '中学校以降',
  Jinmeiyō: '人名用漢字'
}

const examples: Record<string, string> = {
  '1 example': '例文1件',
  'No source-matched examples': 'この言葉に対応する例文はありません',
  'No example sentences use this form yet.': 'この活用形を使った例文はまだありません。'
}

const results: Record<string, string> = {
  'No Dictionary Matches': '一致する言葉は見つかりませんでした',
  'Discovered Words': '文中の単語',
  KANJI: '漢字',
  'Kanji detail': '漢字の詳細',
  Known: '覚えた',
  Unknown: 'まだ覚えていない',
  Learning: '学習中',
  All: 'すべて',
  'Known Words': '覚えた単語',
  Default: '標準',
  'Sorted by known words': '覚えた単語順',
  'Sorted by default order': '標準の順',
  '1 word hidden by filter': '1語がフィルターで非表示',
  '1 word shown': '1語を表示',
  'The search was interrupted': '検索が中断されました'
}

const credits: Record<string, string> = {
  'JLPT vocabulary lists': 'JLPT語彙リスト',
  'JLPT kanji lists': 'JLPT漢字リスト',
  'Zenbu converts each source into its own formats and shares converted Creative Commons data under the same licence.':
    'Zenbuは各データを独自の形式に変換し、変換したCreative Commonsライセンスのデータを、同じライセンスで公開しています。',
  'Dictionary data by the Electronic Dictionary Research and Development Group.':
    '電子辞書研究開発グループ（EDRDG）による辞書データ。',
  'Kanji data by the Electronic Dictionary Research and Development Group.':
    '電子辞書研究開発グループ（EDRDG）による漢字データ。',
  'Radical data by the Electronic Dictionary Research and Development Group.':
    '電子辞書研究開発グループ（EDRDG）による部首データ。',
  'Kanji stroke data by Ulrich Apel.': 'Ulrich Apelによる漢字の筆画データ。',
  'Kanji structure data by Uros O.': 'Uros O.による漢字の構成データ。',
  'Pitch-accent data by the National Institute for Japanese Language and Linguistics.':
    '国立国語研究所によるアクセントデータ。',
  "Unofficial level estimates from Jonathan Waller's lists, matched to JMdict by stephenmk.":
    'Jonathan Wallerのリストに基づく非公式の推定レベル。JMdictとの対応付けはstephenmkによるもの。',
  "Unofficial level estimates from Jonathan Waller's JLPT kanji lists (tanos.co.uk).":
    'Jonathan WallerのJLPT漢字リスト（tanos.co.uk）に基づく非公式の推定レベル。',
  'YouTube frequency data by Adam Nohejl and contributors.':
    'Adam NohejlらによるYouTubeの使用頻度データ。',
  'Wikipedia frequency data by Adam Nohejl and contributors.':
    'Adam NohejlらによるWikipediaの使用頻度データ。',
  'TV and movie, anime, manga, novel, visual novel, and video game frequency data by Jiten (jiten.moe), modified.':
    'Jiten（jiten.moe）によるテレビ・映画、アニメ、マンガ、小説、ビジュアルノベル、ゲームの使用頻度データ（改変あり）。',
  'The rankings from Jiten are adapted from its data, and are shared under the same licence, CC BY-SA 4.0.':
    'Jitenの順位はそのデータを改変したもので、同じCC BY-SA 4.0ライセンスで公開しています。',
  'Japanese word analysis by Sudachi.rs and SudachiDict.':
    'Sudachi.rsとSudachiDictによる日本語の単語解析。',
  'Interactive text parsing ported from kuromoji.js, with MeCab IPADIC.':
    'kuromoji.jsから移植したテキスト解析（MeCab IPADICを使用）。',
  'Example sentences by Tatoeba contributors.': 'Tatoebaの協力者による例文。',
  'Handwriting recognition by Dario Radmann and contributors.':
    'Dario Radmannらによる手書き文字認識。'
}

export const japaneseLabels: Readonly<Record<string, string>> = {
  ...sections,
  ...kanji,
  ...partsOfSpeech,
  ...languageData,
  ...conjugations,
  ...frequency,
  ...examples,
  ...results,
  ...credits
}
