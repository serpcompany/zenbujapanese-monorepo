export function gate() {
  let open = () => {}
  const opened = new Promise<void>(resolve => {
    open = resolve
  })
  return { open, opened }
}
