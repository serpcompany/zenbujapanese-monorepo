# Issue 193: conjugation-kind explanation research

## Decision

Zenbu can add a short app-owned explanation for every existing
`ConjugatedForm.Kind` without changing `DictionaryEntry`, `JapaneseConjugationClient`,
or any conjugation rule. The copy below describes what the already-produced category
means. It does not teach how to derive a form and does not claim that one isolated form
has only one possible use.

The primary grammar authority is the Japan Foundation's *Irodori: Japanese for Life in
Japan*, whose Grammar Notes explicitly cover form, meaning, and usage. The Agency for
Cultural Affairs materials independently confirm the established Japanese-language
teaching categories, including potential, passive, causative, volitional, conditional,
imperative, and adjective adverbial forms.

## Approved app-owned explanations

| Existing kind | Concise explanation |
| --- | --- |
| Present/Future | The non-past form. It can describe a present habit or fact, or a future action or state. |
| Past | Describes an action or state in the past. |
| Negative | Says that an action does not happen, or a state is not true. |
| Past Negative | Says that an action did not happen, or a state was not true. |
| Te-Form | A connecting form. It can link actions or descriptions and, depending on context, show sequence, cause, or reason. |
| Potential | Expresses ability or possibility: that someone can do the action or that the action is possible. |
| Passive | Presents the person, thing, or event affected by an action as the focus. The exact meaning depends on context. |
| Causative | Expresses causing or allowing another person or thing to perform an action or enter a state. |
| Conditional | Sets a condition for what follows: if this happens, the next statement can apply. |
| Volitional | Expresses will or intention. In context, it can also propose doing something together. |
| Imperative | Gives a strong command or instruction. It can sound forceful, so context matters. |
| Standalone | The adjective's base form, shown on its own rather than attached to a noun or verb. |
| Modifying a Noun | Places the adjective before a noun to describe that noun. |
| Adverb | Places the adjective form before a verb to describe how an action is done. |
| Noun | Turns the adjective into a noun that names the quality or its degree. |

## Evidence map

- **Present/Future, Past, Negative, Past Negative:** *Irodori* says Japanese verbs
  distinguish past and non-past, that non-past covers present habits/facts and future,
  and presents affirmative/negative tables for both tenses
  ([Grammar Notes, pp. 53-54](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=53)).
  Its adjective tables likewise distinguish non-past/past and affirmative/negative
  ([pp. 76-78](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=76)).
- **Te-Form:** *Irodori* defines the verb Te-form as ending in `て` or `で` and documents
  its use to connect actions/events and express reasons or causes
  ([pp. 67 and 84](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=67)).
  It separately documents adjective `で` / `くて` forms as connecting descriptions
  ([p. 79](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=79)).
- **Potential:** *Irodori* states that the potential form expresses ability and
  possibility ([p. 135](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=135)).
- **Passive:** *Irodori* documents passive uses that focus events, affected people, and
  affected objects rather than only the actor
  ([pp. 143-144 and 195-196](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=195)).
- **Causative:** *Irodori* documents causative constructions in which one participant
  causes another to act or experience a state
  ([pp. 207-208](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=207)).
  The Agency for Cultural Affairs teacher-training syllabus distinguishes coercive and
  permissive causative uses
  ([curriculum, p. 7](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/kyoiku_jinzaiyosei/pdf/92577001_02.pdf#page=7)).
- **Conditional:** *Irodori* states that `V-ば` expresses a condition necessary for the
  following statement to be realized
  ([p. 202](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=202)).
- **Volitional:** *Irodori* states that the volitional form expresses will and is used
  for future hopes or plans ([p. 178](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=178));
  its `V-ましょう` notes document joint proposals and encouragement
  ([pp. 37-38](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=37)).
- **Imperative:** *Irodori* describes the imperative as a firm instruction and warns
  that it is stronger than `V-なさい` and Te-form instructions
  ([pp. 172-173 and 205](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=172)).
- **Standalone and Modifying a Noun:** *Irodori* contrasts an adjective at sentence end
  with the form placed before a noun, including the na-adjective and i-adjective patterns
  ([pp. 46-47](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=46)).
- **Adverb:** *Irodori* states that na-adjective `に` and i-adjective `く` forms are
  placed before verbs and describe how an action is done
  ([p. 169](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=169)).
- **Noun:** *Irodori* states that adjective `さ` forms turn adjectives into nouns and
  express a quality's degree
  ([pp. 197-198](https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf#page=197)).
- **Category corroboration:** the Agency for Cultural Affairs curriculum inventory
  names potential, passive, causative, volitional, conditional, imperative, and
  adjective-to-adverb forms as established teaching categories
  ([program inventory](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/seikatsusha/h25_nihongo_program_a/pdf/a_26_2.pdf)).

## Rights and implementation boundary

The proposed sentences above are new, concise Zenbu wording synthesized from grammar
facts; none copies an Irodori explanation or example. This distinction matters because
the Japan Foundation's Irodori terms reserve its text and restrict reproduction or
alteration outside private/school use
([Irodori terms](https://www.irodori.jpf.go.jp/en/privacy.html#terms)). Irodori is used
as a read-only primary authority, not as reusable app copy.

Agency for Cultural Affairs pages on `bunka.go.jp` fall under the MEXT website terms
unless a page states otherwise. Those terms allow reproduction, translation, adaptation,
and commercial use with attribution and are compatible with CC BY 4.0
([MEXT terms](https://www.mext.go.jp/b_menu/1351168.htm)). The app wording remains
independently authored, while this research note retains source attribution.

Do not extend these explanations into formation rules, exceptions, translations of a
specific conjugated word, or claims that every use is captured. Any such expansion needs
separate language research and review.
