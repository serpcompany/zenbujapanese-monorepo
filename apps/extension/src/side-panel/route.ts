export type PanelPage =
  | { page: 'word'; entSeq: number; entries?: number[] }
  | { page: 'kanji'; character: string }
  | { page: 'form'; form: string }
  | { page: 'test'; text: string }

export type PanelPageProps<P extends PanelPage = PanelPage> = {
  page: P
  open(page: PanelPage): void
}
