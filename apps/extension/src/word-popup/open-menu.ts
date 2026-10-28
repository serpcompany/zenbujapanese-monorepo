export const hasOpenMenu = (root: ParentNode) =>
  root.querySelector('[role="menu"][data-open]') !== null
