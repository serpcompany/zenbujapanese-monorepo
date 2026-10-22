const ruby = (s) => s.replace(/\{([^|}]+)\|([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>");
const plain = (s) => s.replace(/\{([^|}]+)\|([^}]+)\}/g, "$1");

const h1 = {
  title: "週末に行きたい東京の美術館5選",
  nav: ["ホーム", "ニュース", "特集", "ランキング", "お問い合わせ"],
  date: "2026年10月22日公開",
  paras: [
    "秋は美術館めぐりにぴったりの季節です。今回は、上野や六本木を中心に、初めての人でも楽しめる美術館を編集部が選びました。入館料や開館時間は変わることがあるので、出かける前に公式サイトで確認してください。",
    "国立西洋美術館では、モネやルノワールなどの印象派の作品を常設展で見ることができます。常設展の観覧料は一般500円です。",
    "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。",
  ],
  side: ["人気の記事", "紅葉の名所を歩く", "京都の朝ごはん", "新幹線の旅のコツ"],
};

const h2 = {
  title: "{新|あたら}しい{駅|えき}ができました",
  body: "{今日|きょう}、{東京|とうきょう}で{新|あたら}しい{駅|えき}が{開|ひら}きました。{朝|あさ}から{多|おお}くの{人|ひと}が{集|あつ}まって、{写真|しゃしん}を{撮|と}っていました。{駅|えき}の{近|ちか}くには{公園|こうえん}や{図書館|としょかん}もあります。",
};

const v1 = {
  title: "蜘蛛の糸",
  author: "芥川龍之介",
  body: "ある日の事でございます。御釈迦様は極楽の蓮池のふちを、独りでぶらぶら御歩きになっていらっしゃいました。池の中に咲いている蓮の花は、みんな玉のようにまっ白で、そのまん中にある金色の蕊からは、何とも云えない好い匂が、絶間なくあたりへ溢れて居ります。極楽は丁度朝なのでございましょう。",
};

const v2 = {
  body: "「ではみなさんは、そういうふうに{川|かわ}だと{云|い}われたり、{乳|ちち}の{流|なが}れたあとだと{云|い}われたりしていたこのぼんやりと白いものがほんとうは何かご{承知|しょうち}ですか。」{先生|せんせい}は、{黒板|こくばん}に{吊|つる}した大きな黒い{星座|せいざ}の{図|ず}の、上から下へ白くけぶった{銀河帯|ぎんがたい}のようなところを{指|さ}しながら、みんなに{問|とい}をかけました。",
};

const f1 = ["この森を抜ければ、町はすぐそこだ。", "でも、日が暮れる前に急がないと。"];
const f2 = { telop: "まさかの展開に一同ビックリ！", caption: "その日、空はいつもより青かった" };

const css = `body{margin:0;background:#fff;color:#222}`;

export const images = [
  {
    id: "h1-web",
    kind: "horizontal",
    viewport: [1280, 800],
    truth: [h1.nav.join(""), h1.title, h1.date, ...h1.paras, ...h1.side].join(""),
    html: `<style>${css}
      body{font-family:"Hiragino Sans";font-size:16px;line-height:1.8}
      header{display:flex;gap:28px;padding:14px 40px;background:#1f3b57;color:#fff;font-size:15px}
      main{display:flex;gap:40px;padding:24px 40px}
      article{width:780px} h1{font-size:28px;margin:0 0 6px} .d{color:#777;font-size:13px}
      blockquote{border-left:4px solid #c33;margin:16px 0;padding:4px 16px;background:#f7f3ee;font-family:"Hiragino Mincho ProN"}
      aside{width:300px;border:1px solid #ddd;padding:12px 16px;font-size:14px;align-self:flex-start} aside b{display:block;margin-bottom:6px}
      </style>
      <header>${h1.nav.map((n) => `<span>${n}</span>`).join("")}</header>
      <main><article><h1>${h1.title}</h1><div class="d">${h1.date}</div>
      <p>${h1.paras[0]}</p><p>${h1.paras[1]}</p><blockquote>${h1.paras[2]}</blockquote></article>
      <aside><b>${h1.side[0]}</b>${h1.side.slice(1).map((s) => `<div>${s}</div>`).join("")}</aside></main>`,
  },
  {
    id: "h2-furigana",
    kind: "horizontal",
    viewport: [1000, 420],
    truth: plain(h2.title) + plain(h2.body),
    html: `<style>${css} body{font-family:"Hiragino Sans";padding:30px 40px;font-size:20px;line-height:2.4} h1{font-size:30px;margin:0} rt{font-size:10px}</style>
      <h1>${ruby(h2.title)}</h1><p>${ruby(h2.body)}</p>`,
  },
  {
    id: "v1-vertical",
    kind: "vertical",
    viewport: [1000, 640],
    truth: v1.title + v1.author + v1.body,
    html: `<style>${css} body{font-family:"Hiragino Mincho ProN";font-size:22px;line-height:1.9;writing-mode:vertical-rl;padding:40px;height:560px;box-sizing:border-box} h1{font-size:30px;margin:0 0 0 30px} .a{margin-left:30px;padding-top:120px}</style>
      <h1>${v1.title}</h1><div class="a">${v1.author}</div><p>${v1.body}</p>`,
  },
  {
    id: "v2-vertical-ruby",
    kind: "vertical",
    viewport: [1000, 560],
    truth: plain(v2.body),
    html: `<style>${css} body{font-family:"Hiragino Mincho ProN";font-size:22px;line-height:2.2;writing-mode:vertical-rl;padding:40px;height:480px;box-sizing:border-box} rt{font-size:11px}</style>
      <p>${ruby(v2.body)}</p>`,
  },
  {
    id: "m1-manga-p1",
    kind: "manga",
    file: "m1-manga-p1.jpg",
    truth: "いけいけ!百科事典娘描いた人カスガみんな知ってるけど名前は知らないものってよくあるじゃない港に生えてる鉄のキノコみたいな物体とか!係船柱!あれって船を港に係留する柱みたいなものでしょ?だから係船柱あれ?",
  },
  {
    id: "m2-manga-p2",
    kind: "manga",
    file: "m2-manga-p2.jpg",
    truth: "あーあせっかくここから『みんな知ってるけど名前は知らない物』の話がふくらむとこだったのにさあぶち壊しですねえっ!?そうだったの!?あれ!?ズーン用意したネタが無駄になったけどもうどうしようもないわね仕方ありませんよそう言や海岸で思い出したんだけどさテトラポッドってあるじゃない四次元怪獣ブルトンみたいなアレですねあれ日本語でもちゃんとした名前があるのかな?誰か知ってる人いる?",
  },
  {
    id: "f1-video-subtitle",
    kind: "video",
    viewport: [1280, 720],
    video: true,
    truth: f1.join(""),
    html: `<style>body{margin:0;width:1280px;height:720px;background:url(src/sintel-5s.png);font-family:"Hiragino Sans";font-weight:600}
      .s{position:absolute;bottom:70px;width:100%;text-align:center;font-size:40px;line-height:1.35;color:#fff;-webkit-text-stroke:6px #000;paint-order:stroke fill}</style>
      <div class="s">${f1[0]}<br>${f1[1]}</div>`,
  },
  {
    id: "f2-video-telop",
    kind: "video",
    viewport: [1280, 720],
    video: true,
    truth: f2.telop + f2.caption,
    html: `<style>body{margin:0;width:1280px;height:720px;background:url(src/sintel-29s.png);font-family:"Hiragino Sans";font-weight:800}
      .t{position:absolute;top:120px;right:60px;font-size:56px;color:#ffe100;-webkit-text-stroke:10px #3a1a00;paint-order:stroke fill;transform:rotate(-3deg)}
      .c{position:absolute;bottom:110px;left:0;width:100%;text-align:center;font-size:34px;font-weight:600;color:#fff;-webkit-text-stroke:5px #000;paint-order:stroke fill}</style>
      <div class="t">${f2.telop}</div><div class="c">${f2.caption}</div>`,
  },
];
