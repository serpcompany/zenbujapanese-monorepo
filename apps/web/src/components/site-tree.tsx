import Link from 'next/link'
import type { TreeNode } from '@/lib/dictionary/browse/site-tree'

function Branch({ node }: { node: TreeNode }) {
  return (
    <li>
      <Link href={node.path}>{node.title}</Link>
      {node.children ? (
        <ul className="mt-1.5 flex flex-col gap-1.5 border-l pl-4">
          {node.children.map(child => (
            <Branch key={child.path} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function SiteTree({ title, trees }: { title: string; trees: readonly TreeNode[] }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-5">
      <h1 className="mb-8 text-2xl font-semibold">{title}</h1>
      <div className="grid gap-10 md:grid-cols-2 [&_a]:underline [&_a]:underline-offset-3">
        {trees.map(tree => (
          <ul key={tree.path} className="flex flex-col gap-1.5 font-medium [&_ul]:font-normal">
            <Branch node={tree} />
          </ul>
        ))}
      </div>
    </main>
  )
}
