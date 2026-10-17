# Links from zenbujapanese.com

What a zenbujapanese.com link opens in Zenbu, and the links Zenbu's **Share** sends. The rest of
the dictionary's behavior is in [Dictionary](dictionary.md); how the links work is in
[`ios-website-links.md`](../../../../docs/agents/ios-website-links.md).

Tapping a zenbujapanese.com dictionary link in another app, such as Tomodachi's **Open in
Zenbu**, opens it in Zenbu rather than the browser. From any tab, Translate included, Zenbu
switches to the Search tab and closes an open word sheet. A running Translate conversation keeps
going, and the bar above the tab bar returns to it. Then:

- a word, `/dictionary/<slug>-<number>/` such as `/dictionary/見る-1259290/`, opens that word's
  Word Detail on top of what Search was showing. The number is JMdict's entry number, which
  decides the word whatever the slug says. A word the app's dictionary doesn't have searches the
  slug's text instead, or returns to the Search screen when the URL has no slug;
- a search, `/dictionary/search/<query>/`, returns to the Search screen and searches the query;
- a kanji, `/dictionary/kanji/<kanji>/`, opens the detail of that exact character. The website
  removed these pages and redirects them to the kanji's search, but the app has a kanji detail to
  open; and
- any other zenbujapanese.com URL returns to the Search screen.

A word's old conjugation pages open the word, and a search's old Example Sentences page the search,
as the website redirects them. iOS opens Zenbu only for the URLs the website's association file
claims ([website product docs](../../../web/docs/product/dictionary.md#urls-seo-and-indexing));
until the website has Zenbu's Apple team ID, links open the website.

The links Zenbu's own **Share** sends are these URLs: a word's page and a kanji's search
([Dictionary and kanji details](dictionary.md#dictionary-and-kanji-details)). The shared core
builds them with the website's URL rules, so a link shared from Zenbu opens the same word or
search in Zenbu where it's installed, and the website's page for it elsewhere. On iPhone and iPad
the share sheet gets the link as a web link and the text as its message, under a preview titled
with the word or kanji; on the Mac, the sharing picker gets the text and the link as two items.

- Source: #568, part of #563; Share's links, #467.
- Check: package `WebsiteLinkTests` (`apps/ios/Modules/Tests/SearchExperienceTests/WebsiteLinkTests.swift`)
  for what each URL opens, against the bundled dictionary; core `detail/links.test.ts` for how
  each URL reads, with the parser the website reads its own word URLs with, and that the links
  Share sends are the website's canonical URLs and read back as the same page; package
  `WordDetailShareTests` for the links the app shares, opened again. That iOS hands a tapped link
  to Zenbu, and that a shared link arrives with its text, is by hand, on a device.
