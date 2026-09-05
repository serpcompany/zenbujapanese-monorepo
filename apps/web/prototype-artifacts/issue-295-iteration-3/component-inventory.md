# Issue 295 iteration 3 component inventory

Written before page composition. This prototype uses the current official shadcn CLI output from preset `b1PzeK` (`base-nova`, Base UI, Neutral, Blue, Inter, Lucide, CSS variables, pointer controls).

| Visible area | Primary implementation | Why |
| --- | --- | --- |
| Site header | `Button` links + `Separator` | The header itself is document layout; all interactive elements and its boundary use library primitives. |
| Breadcrumb | `Breadcrumb` | Native semantic path treatment. |
| Compact dictionary introduction | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | A conventional contained search introduction without a hand-designed marketing hero. |
| Search control | `InputGroup`, `InputGroupInput`, `InputGroupAddon`, `InputGroupButton` | One joined, accessible search affordance from the approved component set. |
| Result scope control | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` where the variant calls for switching | Library state and keyboard behavior instead of custom tab buttons. |
| Result collection | `ItemGroup`, `Item`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemFooter`, `ItemSeparator` | Dictionary results map directly to the library's rich list-item composition. |
| Result emphasis | `Card`, `CardHeader`, `CardContent` | Used only for grouped or featured surfaces, not as a raw styled substitute. |
| POS/common markers | `Badge` | Semantic labels; frequency stays plain text to avoid a badge wall. |
| Listen action | `Button` + `Tooltip` | Explicit text label with optional supporting tooltip; the speaker icon is meaningful and never stands alone. |
| Secondary-sense disclosure | `Accordion` | Variant C uses library disclosure behavior rather than a custom expander. |
| Section boundaries | `Separator` | Consistent semantic visual division. |
| Footer | `Separator` + `Button` links | Document layout plus library navigation actions. |
| Prototype switcher | `Button`, `Badge` | Dev-only evaluation tool with library controls and native links for robust pointer navigation. |

## Planned custom wrappers

These wrappers compose page regions but do not imitate a library control:

- `SiteHeader`: constrains brand/navigation width and responsive placement; shadcn does not provide a generic public-site header primitive.
- `DictionarySearchIntro`: named semantic section that composes `Breadcrumb`, `Card`, and `InputGroup`; no custom hero surface.
- `ResultsHeading`: provides the submitted query and count around library tabs/items.
- `ResultSection`: gives variant A a semantic heading and description above an `ItemGroup`; shadcn intentionally has no generic document-section primitive.
- `ResultMetadata`: arranges POS/common badges, frequency text, and pitch display; no single shadcn primitive represents dictionary evidence.
- `PitchAccent`: small domain-specific visualization; custom CSS is limited to the pitch line/dot.
- `ExampleSentence`: bilingual `<figure>` content because this is domain content, not a generic alert/card control.
- `ListenButton`: gives the library `Button` and `Tooltip` one consistent, explicitly labeled pronunciation action.
- `DictionaryResultItem`: maps one lexical fixture into the slots of shadcn `Item`; it adds no replacement surface or interaction behavior.
- `SiteFooter`: constrains the legal/navigation row; shadcn has no page-footer primitive.
- `PrototypeSwitcher`: URL/keyboard orchestration around shadcn controls; it exists only in development.
- `VariantA`, `VariantB`, `VariantC`: alternate page compositions required by the prototype, built from the same named sections and primitives.

Any additional custom wrapper added during composition must be recorded here before handoff.
