import { DictionaryPrototype } from "./prototype"
export const metadata = {
  title: "Japanese dictionary · Zenbu prototype",
  robots: { index: false, follow: false },
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const variant =
    query.variant === "B" || query.variant === "C" ? query.variant : "A"
  return (
    <DictionaryPrototype
      variant={variant}
      search={typeof query.search === "string" ? query.search : "hello"}
    />
  )
}
