export const hasOpenLayer = (root: ParentNode) =>
  root.querySelector('[data-base-ui-portal] [data-open]') !== null

export const isExpanded = (root: ParentNode) =>
  root.querySelector('[data-word-popup][data-expanded]') !== null
