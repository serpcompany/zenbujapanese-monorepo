import { alreadyTold, toldFile } from '../route.mjs'
import { failureReport, runChecks, selectFiles } from './checks'
import { root } from './files'
import { stopRule } from './rules'
import { perFileChecks } from './stop'

export async function stopHook(changed: string[], session: string | undefined): Promise<never> {
  const touched = selectFiles(changed)
  const outcomes = [
    ...(touched.files.length
      ? await runChecks(perFileChecks, touched.files, touched.prefixes)
      : []),
    ...(await runChecks(['docs'], selectFiles([]).files, []))
  ]
  const report = failureReport(outcomes)
  if (!report || alreadyTold(toldFile(root, session), report)) process.exit(0)

  console.error(`${report}\n\n${stopRule}`)
  process.exit(2)
}
