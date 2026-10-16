export const pageProps = <Params>(params: Params) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve({})
})
