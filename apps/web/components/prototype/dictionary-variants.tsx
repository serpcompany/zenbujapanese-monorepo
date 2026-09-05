"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ItemGroup, ItemSeparator } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { additionalMatches, allResults, bestMatches, type DictionaryResult } from "@/lib/prototype-data"
import { DictionaryResultItem, ExampleSentence, ListenButton, ResultMetadata } from "./dictionary-sections"

function ResultSection({ results, title, description }: { results: DictionaryResult[]; title: string; description: string }) {
  return (
    <section aria-labelledby={`${title.replaceAll(" ", "-").toLowerCase()}-title`} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold" id={`${title.replaceAll(" ", "-").toLowerCase()}-title`}>{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ItemGroup>{results.map((result) => <DictionaryResultItem key={result.id} result={result} />)}</ItemGroup>
    </section>
  )
}

export function VariantA() {
  return (
    <div className="space-y-9">
      <ResultSection description="The most likely everyday greetings." results={bestMatches} title="Best matches" />
      <Separator />
      <ResultSection description="Related greetings and alternate expressions." results={additionalMatches} title="Additional matches" />
    </div>
  )
}

export function VariantB() {
  return (
    <Tabs defaultValue="best">
      <TabsList aria-label="Result groups" className="mb-3" variant="line">
        <TabsTrigger value="best">Best matches <Badge variant="secondary">{bestMatches.length}</Badge></TabsTrigger>
        <TabsTrigger value="additional">Additional <Badge variant="secondary">{additionalMatches.length}</Badge></TabsTrigger>
      </TabsList>
      <TabsContent value="best">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Best matches</CardTitle>
            <CardDescription>Full lexical evidence for the most relevant results.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ItemGroup className="gap-0">
              {bestMatches.map((result, index) => (
                <div key={result.id}>
                  <DictionaryResultItem result={result} surface="plain" />
                  {index < bestMatches.length - 1 ? <ItemSeparator className="my-0" /> : null}
                </div>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="additional">
        <Card>
          <CardContent className="px-0">
            <ItemGroup className="gap-0">
              {additionalMatches.map((result, index) => (
                <div key={result.id}>
                  <DictionaryResultItem result={result} surface="plain" />
                  {index < additionalMatches.length - 1 ? <ItemSeparator className="my-0" /> : null}
                </div>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

export function VariantC() {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Dictionary matches</CardTitle>
        <CardDescription>Scan the essentials, then open a result for senses and examples.</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion defaultValue={[bestMatches[0].id]} multiple>
          {allResults.map((result) => (
            <AccordionItem key={result.id} value={result.id}>
              <AccordionTrigger className="no-underline hover:no-underline">
                <span className="flex min-w-0 flex-1 flex-col gap-2 pr-3 text-left">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-heading text-xl" lang="ja">{result.headword}</span>
                    <span className="font-normal text-muted-foreground">{result.reading} · {result.romanization}</span>
                  </span>
                  <ResultMetadata result={result} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-1 pb-4">
                <ol className="ml-5 list-decimal space-y-1 text-sm leading-relaxed sm:text-base">
                  {result.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}
                </ol>
                {result.example ? <ExampleSentence example={result.example} /> : <p className="text-muted-foreground">No linked example sentence.</p>}
                <ListenButton />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
