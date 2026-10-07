export const categoryDescriptions: Readonly<Record<string, string>> = {
  nouns:
    'Nouns name people, things, places, and ideas. They never change form; particles such as が and を mark their role in a sentence.',
  pronouns:
    'Pronouns stand in for a noun, such as これ (this), それ (that), and 自分 (oneself). Japanese often leaves them out when the context is clear.',
  'suru-verbs':
    'Nouns that become verbs with する, as 紹介 (introduction) becomes 紹介する (to introduce), and する itself.',
  'godan-verbs':
    'Godan verbs change their last kana across the five vowel sounds as they conjugate, as 言う becomes 言わない and 言います.',
  'ichidan-verbs':
    'Ichidan verbs end in る after an i or e sound and drop the る to conjugate, as 見る becomes 見ない and 見ます.',
  'irregular-verbs':
    'Verbs that follow neither the godan nor the ichidan pattern: 来る (to come) and the verbs ending in ずる, such as 信ずる (to believe). する and its compounds are under suru verbs.',
  'transitive-verbs':
    'Transitive verbs take a direct object, usually marked with を, as 使う (to use) does in 道具を使う (to use a tool).',
  'intransitive-verbs':
    'Intransitive verbs take no direct object, such as 有る (to be) and 行く (to go). Many pair with a transitive verb, as 出る (to leave) does with 出す (to take out).',
  'auxiliary-verbs':
    'Auxiliary verbs follow another verb to add tense, politeness, or the passive, as た, ます, and れる do.',
  'i-adjectives':
    'I-adjectives end in い and conjugate on their own, as 高い (high) becomes 高くない and 高かった.',
  'na-adjectives':
    'Na-adjectives take な before a noun, as in 必要な物 (something necessary), and conjugate with だ and です.',
  'no-adjectives':
    'Nouns that describe another noun with の, as 本当 does in 本当の話 (a true story).',
  'taru-adjectives':
    'Literary adjectives that take たる before a noun, or と as an adverb, as 堂々 does in 堂々と (with dignity).',
  'pre-noun-adjectives':
    'Pre-noun adjectives (rentaishi) come only before a noun and never conjugate, as この (this), そんな (such), and 大きな (big) do.',
  adverbs:
    'Adverbs say how, when, or how much, such as もう (already), ちょっと (a little), and こう (like this).',
  expressions:
    'Phrases of more than one word that JMdict lists as one entry, such as 宜しく (please treat me well) and 世の中 (the world).',
  interjections:
    'Words that stand on their own as exclamations or replies, such as はい (yes), ああ (ah), and 有難う (thank you).',
  conjunctions:
    'Conjunctions join words, clauses, or sentences, such as そして (and then), けれど (but), and ながら (while).',
  particles:
    'Particles follow a word to mark its role in a sentence or add nuance, such as は (the topic), を (the object), and ね (seeking agreement).',
  counters:
    'Counters follow a number to count a kind of thing, such as 枚 for flat things, 個 for small things, and 回 for times.',
  prefixes:
    'Prefixes attach to the front of a word, such as 不 (un-), 超 (super-), and 第, which makes ordinal numbers.',
  suffixes:
    'Suffixes attach to the end of a word, such as 的 (-ical), くらい (about), and みたい (-like).',
  numbers:
    'Numerals, such as 十 (ten), 百 (hundred), 千 (thousand), 万 (ten thousand), and 億 (hundred million).',
  onomatopoeia:
    'Giongo imitate sounds, such as どんどん (banging), and gitaigo describe states and movements, such as ゆっくり (slowly) and しっかり (firmly).',
  yojijukugo:
    'Yojijukugo are idioms of four kanji, many from Chinese classics, such as 不可思議 (a mystery) and 有耶無耶 (vague).',
  proverbs:
    'Kotowaza are traditional sayings that give advice or state a truth, such as 愛は盲目 (love is blind).',
  idioms:
    'Expressions whose meaning isn’t the sum of their words, such as 奥の手 (an ace up one’s sleeve) and 瓜二つ (exactly alike).',
  'honorific-language':
    'Sonkeigo raises the person spoken about, as いらっしゃる does for 行く and 来る, and なさる does for する.',
  'humble-language':
    'Kenjōgo lowers the speaker and their side to show respect to others, as 参る does for 行く and 頂く does for もらう.',
  'polite-language':
    'Teineigo is the everyday polite register, built on です and ます, with words such as ござる.',
  slang: 'Informal words and senses used among friends or within groups, such as キモイ (gross).',
  'internet-slang':
    'Words and senses used mostly online, on message boards and social media, such as ツイ (Twitter) and イッチ (the original poster).',
  'manga-slang':
    'Words used mostly in or about manga and anime, such as 萌えキャラ (a cute character).',
  colloquialisms: 'Casual spoken words and forms, such as じゃん (isn’t it?) and 色んな (various).',
  'familiar-language':
    'Words used with friends, family, or people below the speaker, such as お前 (you) and こいつ (this guy).',
  'formal-language':
    'Formal and literary words, used in writing and speeches rather than conversation, such as 昨年 (last year) and べし (should).',
  'poetic-words':
    'Words used in poetry and lyrical writing, such as 今宵 (this evening) and 暁 (dawn).',
  'childrens-language':
    'Words young children use, or that adults use with them, such as 抱っこ (being carried in someone’s arms) and ぽんぽん (tummy).',
  'feminine-language':
    'Words and sentence endings used mostly by women, such as かしら (I wonder) and あら (oh!).',
  'masculine-language':
    'Words and sentence endings used mostly by men, such as 俺 (I), お前 (you), and ぜ.',
  'jocular-words': 'Words used humorously or tongue in cheek, such as 社畜 (a corporate drone).',
  euphemisms:
    'Gentler words for death, the body, and other delicate subjects, such as 亡くなる (to pass away).',
  abbreviations:
    'Shortened words and phrases, such as スマホ (smartphone, from スマートフォン) and 高校 (high school, from 高等学校).',
  'archaic-words':
    'Words and senses from older Japanese that are no longer in everyday use, such as ござる (to be).',
  'obsolete-words': 'Words and senses that have fallen out of use, such as 文房 (a study).',
  'dated-words':
    'Words that sound old-fashioned today but are still understood, such as 婦人 (lady) and 吾輩 (I).',
  'historical-terms':
    'Words for things of the past, such as 明治 (the Meiji era), 侍 (samurai), and ソ連 (the Soviet Union).',
  'kana-words':
    'Words that have kanji but are usually written in kana, such as する (to do), 事 (thing), and 有る (to be).',
  'kansai-dialect':
    'Words from the Kansai region around Osaka, Kyoto, and Kobe, such as ほんま (truth) and しんどい (tired).',
  'osaka-dialect': 'Words from Osaka, such as いちびり (a joker) and パチる (to steal).',
  'kyoto-dialect': 'Words from Kyoto, such as ぶぶ漬け (rice with tea poured over it).',
  'tohoku-dialect':
    'Words from the Tōhoku region in the north of Honshu, such as べこ (cow) and めんこい (adorable).',
  'kanto-dialect':
    'Words from the Kantō region around Tokyo, such as 落っこちる (to fall) and 落っことす (to drop).',
  'kyushu-dialect': 'Words from Kyūshū, such as ばってん (but) and 濃ゆい (deep, of a colour).',
  'hokkaido-dialect': 'Words from Hokkaidō, such as なまら (very) and ザンギ (deep-fried chicken).',
  'ryukyu-dialect':
    'Words from the Ryūkyū Islands and Okinawa, such as ゴーヤ (bitter melon) and チャンプルー (an Okinawan stir-fry).',
  'tosa-dialect':
    'Words from Tosa, today’s Kōchi Prefecture on Shikoku, such as いごっそう (a stubborn person).',
  'tsugaru-dialect': 'Words from Tsugaru, in the west of Aomori Prefecture, such as わや (very).',
  'nagano-dialect': 'Words from Nagano Prefecture, such as ずく (putting oneself into something).',
  'brazilian-japanese':
    'Words used by Japanese communities in Brazil, such as 耕地 (a fazenda, a large estate) and 火酒 (cachaça).',
  agriculture:
    'Farming terms, such as 休耕 (leaving a field fallow) and 追熟 (ripening after harvest).',
  anatomy:
    'Words for the parts of the body, such as 脳 (brain), 関節 (joint), and 血管 (blood vessel).',
  archeology:
    'Terms from archeology, such as 勾玉 (magatama, comma-shaped beads) and 窯跡 (a kiln site).',
  architecture:
    'Building and carpentry terms, many from traditional Japanese houses, such as 敷居 (threshold) and 欄間 (transom).',
  'art-and-aesthetics':
    'Terms from painting, ceramics, and aesthetics, such as 油絵 (oil painting).',
  astronomy:
    'Words for stars, planets, and space, such as 銀河 (the Milky Way) and 衛星 (satellite).',
  audiovisual:
    'Terms from audio and video equipment, such as 全高調波歪 (total harmonic distortion).',
  aviation: 'Terms from flying and aircraft, such as 失速 (stall) and 翼端 (wingtip).',
  baseball: 'Baseball terms, such as 投手 (pitcher), 三振 (strikeout), and 打点 (runs batted in).',
  biochemistry: 'Terms from biochemistry, such as 酵素 (enzyme) and 核酸 (nucleic acid).',
  biology: 'Terms from biology, such as 細胞 (cell), 進化 (evolution), and 抗体 (antibody).',
  botany: 'Words for plants and how they grow, such as 葉脈 (leaf veins) and 雄しべ (stamen).',
  boxing: 'Boxing terms, such as スパーリング (sparring) and フック (hook).',
  buddhism: 'Buddhist terms, such as 菩薩 (bodhisattva), 浄土 (Pure Land), and 念仏 (nembutsu).',
  business: 'Business terms, such as リスケ (rescheduling) and 値動き (price movement).',
  'card-games': 'Terms from card games, such as 切り札 (trump card) and ババ抜き (old maid).',
  chemistry:
    'Terms from chemistry, such as 原子 (atom), 酸化 (oxidation), and 濃度 (concentration).',
  'chinese-mythology':
    'Places and creatures from Chinese mythology, such as 蓬莱 (Mount Penglai) and 鵬 (the peng, a giant bird).',
  christianity: 'Christian terms, such as 聖書 (the Bible) and 洗礼 (baptism).',
  'civil-engineering': 'Civil engineering terms, such as 法面 (a slope face) and 水制 (a groyne).',
  clothing:
    'Words for clothes and how they’re cut, such as 前開き (front-opening) and ステテコ (long men’s underpants).',
  computing:
    'Computing terms, many of them abbreviations, such as ＣＰＵ, 変数 (variable), and 端末 (terminal).',
  crystallography: 'Terms from crystallography, such as 空間格子 (space lattice).',
  dentistry: 'Dentistry terms, such as 虫歯 (tooth decay) and 歯石 (tartar).',
  ecology: 'Terms from ecology, such as 遷移 (succession) and ニッチ (niche).',
  economics: 'Economics terms, such as 需要 (demand) and 寡占 (oligopoly).',
  'electrical-engineering':
    'Electrical engineering terms, such as 回路 (circuit) and 接地 (grounding).',
  electronics: 'Electronics terms, such as 基板 (circuit board) and インダクタ (inductor).',
  embryology: 'Terms from embryology, such as 胞胚 (blastula) and 原腸胚 (gastrula).',
  engineering: 'General engineering terms, such as 応力 (stress) and 張力 (tension).',
  entomology: 'Words for insects and their life cycle, such as 蛹 (pupa) and 成虫 (adult insect).',
  'figure-skating':
    'Figure skating terms, such as アクセル (Axel jump) and イナバウアー (Ina Bauer).',
  film: 'Filmmaking terms, such as クランクイン (the start of filming) and フェードイン (fade-in).',
  finance:
    'Finance terms, such as 株 (stock), 金利 (interest rate), and 損切り (cutting one’s losses).',
  fishing: 'Fishing terms, such as 投げ釣り (surf casting) and 根掛かり (a snagged hook).',
  'food-and-cooking':
    'Words for food, dishes, and cooking, such as 寿司 (sushi), 出し (dashi), and 団子 (dango).',
  gardening: 'Gardening terms, such as 取り木 (layering a plant) and 根腐れ (root rot).',
  genetics: 'Terms from genetics, such as 顕性 (dominance) and 転座 (translocation).',
  geography: 'Terms from geography, such as 砂嘴 (spit) and 陸橋 (land bridge).',
  geology: 'Terms from geology, such as 断層 (fault) and 浸食 (erosion).',
  geometry: 'Geometry terms, such as 頂点 (vertex), 円錐 (cone), and 斜辺 (hypotenuse).',
  go: 'Terms from the board game go, such as 布石 (the opening strategy) and 天元 (the center point).',
  golf: 'Golf terms, such as バーディー (birdie) and ドッグレッグ (dogleg).',
  grammar: 'Grammar terms, such as 動詞 (verb), 名詞 (noun), and 助詞 (particle).',
  'greek-mythology':
    'Gods and figures from Greek mythology, such as アテーナー (Athena) and パンドラ (Pandora).',
  hanafuda:
    'Terms from hanafuda, the Japanese flower cards, such as こいこい (koi-koi, a hanafuda game).',
  'horse-racing': 'Horse racing terms, such as 馬券 (betting ticket) and 逃げ馬 (front runner).',
  internet:
    'Words for the internet and its services, such as ＳＮＳ (social networking service) and ＵＲＬ.',
  'japanese-mythology':
    'Figures and creatures from Japanese myth and folklore, such as 八咫烏 (Yatagarasu) and 猫又 (nekomata).',
  kabuki:
    'Kabuki theater terms, such as 花道 (the walkway through the audience) and 黒子 (stage assistants dressed in black).',
  law: 'Legal terms, such as 被告 (defendant), 原告 (plaintiff), and 判例 (precedent).',
  linguistics:
    'Linguistics terms, such as 母音 (vowel), 子音 (consonant), and 敬語 (honorific language).',
  logic: 'Terms from logic, such as 命題 (proposition) and 選言 (disjunction).',
  'martial-arts':
    'Terms from judo, karate, kendo, and other martial arts, such as 竹刀 (bamboo sword) and 合気 (aiki).',
  mahjong: 'Mahjong terms, such as ロン (winning on a discard) and 聴牌 (tenpai).',
  manga: 'Terms from making manga, such as ネーム (storyboard) and 掛け網 (cross-hatching).',
  mathematics:
    'Mathematics terms, such as 関数 (function), 変数 (variable), and 微分 (differentiation).',
  'mechanical-engineering':
    'Mechanical engineering terms, such as スパーギア (spur gear) and 連結棒 (coupling rod).',
  medicine: 'Medical terms, such as 感染 (infection), 疾患 (disease), and 麻酔 (anesthesia).',
  meteorology: 'Weather terms, such as 前線 (weather front) and ラニーニャ (La Niña).',
  military:
    'Military terms and ranks, such as 大将 (general), 大佐 (colonel), and 陣地 (position).',
  mineralogy: 'Words for minerals, such as 石英 (quartz), 瑪瑙 (agate), and 長石 (feldspar).',
  mining: 'Mining terms, such as 落盤 (cave-in) and 切羽 (working face).',
  motorsport:
    'Motorsport terms, such as ピットイン (entering the pits) and チェッカーフラッグ (checkered flag).',
  music: 'Music terms, such as 楽譜 (sheet music), 拍子 (meter), and 音域 (range).',
  noh: 'Noh theater terms, such as 仕手 (the lead role) and 狂言 (kyōgen, comic plays between noh plays).',
  ornithology: 'Words for birds and their feathers, such as 綿羽 (down feather) and 鳴管 (syrinx).',
  paleontology: 'Terms from paleontology, such as 示準化石 (index fossil).',
  pathology: 'Terms from pathology, such as 封入体 (inclusion body).',
  pharmacology:
    'Words for medicines and their doses, such as 頓服 (medicine taken as needed) and 剤形 (dosage form).',
  philosophy:
    'Terms from philosophy, such as 自我 (ego), 命題 (proposition), and 唯物 (materialism).',
  photography: 'Photography terms, such as 露光 (exposure) and ネガ (negative).',
  physics: 'Physics terms, such as 電子 (electron), 重力 (gravity), and 圧力 (pressure).',
  physiology: 'Terms for how the body works, such as 脈拍 (pulse) and 嚥下 (swallowing).',
  politics: 'Political terms, such as 左翼 (the left wing) and 右派 (the right wing).',
  printing: 'Printing terms, such as 活版 (letterpress) and 製版 (platemaking).',
  'professional-wrestling':
    'Professional wrestling terms, such as 延髄斬り (enzuigiri) and 逆エビ固め (Boston crab).',
  psychiatry:
    'Psychiatry terms, such as 躁うつ病 (manic depression) and ＢＰＤ (borderline personality disorder).',
  psychoanalysis: 'Terms from psychoanalysis, such as イド (id) and 欲動 (drive).',
  psychology: 'Psychology terms, such as 錯覚 (illusion) and 強化 (reinforcement).',
  railways: 'Railway terms, such as 客車 (passenger car) and 枕木 (railroad tie).',
  'roman-mythology': 'Gods from Roman mythology, such as ユノ (Juno) and マーキュリー (Mercury).',
  shinto: 'Shinto terms, such as 絵馬 (votive tablet) and 神棚 (household shrine).',
  shogi: 'Terms from shogi, Japanese chess, such as 飛車 (rook) and 桂馬 (knight).',
  skiing: 'Skiing terms, such as モーグル (moguls) and 回転 (slalom).',
  sports: 'General sports terms, such as ＭＶＰ (most valuable player) and 反則 (foul).',
  statistics: 'Statistics terms, such as 分散 (variance) and 標本 (sample).',
  'stock-market':
    'Stock market terms, such as 利確 (profit-taking) and 寄り付き (the opening session).',
  sumo: 'Sumo terms, such as 力士 (sumo wrestler), 横綱 (yokozuna), and 土俵 (the ring).',
  surgery: 'Surgical terms, such as 開頭 (craniotomy) and 開創器 (retractor).',
  telecommunications:
    'Telecommunications terms, many of them abbreviations, such as ＡＤＳＬ and ＭＶＮＯ (mobile virtual network operator).',
  trademarks:
    'Brand and product names, such as ポケモン (Pokémon) and ウォシュレット (Washlet, an electronic bidet).',
  television:
    'Television production terms, such as ＰＩＰ (picture-in-picture) and フェードイン (fade-in).',
  'veterinary-medicine': 'Terms from veterinary medicine, such as 狂牛病 (mad cow disease).',
  'video-games':
    'Video game terms, such as ＮＰＣ (non-player character) and ＤＬＣ (downloadable content).',
  zoology: 'Terms from zoology, such as 触手 (tentacle) and 複眼 (compound eye).',
  'common-words':
    'JMdict marks a word common when it’s in one of its priority lists, which are drawn from newspapers and other everyday sources.'
}
