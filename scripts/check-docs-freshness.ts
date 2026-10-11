/* eslint-disable no-console */
// Flags flow documents whose code has moved since they were last verified.
//
// Each file in docs/flows/ records `Last verified against commit: <sha>` and
// names the code paths it describes. If any of those paths has a commit that is
// not an ancestor of the recorded sha, the document is describing older code.
//
// "Keep the flows updated" is otherwise a hope. This makes staleness visible.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FLOWS_DIR = 'docs/flows'
const SHA_PATTERN = /Last verified against commit:\s*(\S+)/
const ANCHOR_PATTERN = /\b((?:apps|packages|scripts)\/[\w./[\]-]*\.(?:ts|tsx|prisma))\b/g

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function isAncestor(candidate: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', candidate, descendant], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

let problems = 0

for (const file of readdirSync(FLOWS_DIR).filter((name) => name.endsWith('.md'))) {
  const path = join(FLOWS_DIR, file)
  const content = readFileSync(path, 'utf8')

  const shaMatch = SHA_PATTERN.exec(content)
  if (!shaMatch?.[1] || shaMatch[1].startsWith('REPLACE')) {
    console.error(`${path}: no verified commit recorded`)
    problems += 1
    continue
  }
  const verifiedSha = shaMatch[1]

  const anchors = [...new Set([...content.matchAll(ANCHOR_PATTERN)].map((match) => match[1]!))]

  const missing = anchors.filter((anchor) => !existsSync(anchor))
  for (const anchor of missing) {
    console.error(`${path}: anchor no longer exists — ${anchor}`)
    problems += 1
  }

  const moved: string[] = []
  for (const anchor of anchors.filter((anchor) => existsSync(anchor))) {
    const lastCommit = git(['log', '-1', '--format=%H', '--', anchor])
    if (!lastCommit) continue
    if (!isAncestor(lastCommit, verifiedSha)) moved.push(anchor)
  }

  if (moved.length > 0) {
    console.error(
      `${path}: stale — verified at ${verifiedSha.slice(0, 8)}, but these changed since:`,
    )
    for (const anchor of moved) console.error(`  ${anchor}`)
    problems += 1
  }
}

if (problems > 0) {
  console.error('')
  console.error(
    `${problems} flow document issue(s). Update the affected docs and bump their verified commit.`,
  )
  process.exit(1)
}

console.error('All flow documents are current.')
