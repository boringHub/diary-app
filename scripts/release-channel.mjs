import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')

function fail(message) {
  console.error(`Release channel validation failed: ${message}`)
  process.exit(1)
}

function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

function writeText(relativeOrAbsolutePath, content) {
  const outputPath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(projectRoot, relativeOrAbsolutePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${content.trim()}\n`, 'utf8')
  console.log(outputPath)
}

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? '' : fallback
}

function sectionByHeading(markdown, heading) {
  const startMarker = `## ${heading}`
  const start = markdown.indexOf(startMarker)
  if (start < 0) fail(`missing heading: ${startMarker}`)
  const next = markdown.indexOf('\n## ', start + startMarker.length)
  return markdown.slice(start, next < 0 ? markdown.length : next).trim()
}

function unreleasedBody(markdown) {
  const section = sectionByHeading(markdown, '未发布')
  return section.replace(/^## 未发布\s*/, '').trim()
}

function hasMeaningfulBullet(markdown) {
  return markdown.split('\n').some((line) => {
    const match = line.match(/^\s*-\s+(.+)$/)
    return match && !/^(待填写|待验证|无)$/.test(match[1].trim())
  })
}

function validate() {
  const stableLog = readText('CHANGELOG.md')
  const internalLog = readText('INTERNAL_CHANGELOG.md')
  const stableHeadings = [...stableLog.matchAll(/^## (.+)$/gm)].map((match) => match[1])
  const internalHeadings = [...internalLog.matchAll(/^## (.+)$/gm)].map((match) => match[1])

  for (const heading of stableHeadings) {
    if (heading !== '未发布' && !/^\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/.test(heading)) {
      fail(`CHANGELOG.md contains a non-stable version heading: ${heading}`)
    }
  }
  for (const heading of internalHeadings) {
    if (heading !== '未发布' && !/^\d+\.\d+\.\d+-internal\.\d{8}\.\d{6} - \d{4}-\d{2}-\d{2}$/.test(heading)) {
      fail(`INTERNAL_CHANGELOG.md contains a non-internal version heading: ${heading}`)
    }
  }
  if (stableHeadings[0] !== '未发布' || internalHeadings[0] !== '未发布') {
    fail('both changelogs must keep 未发布 as their first version heading')
  }

  const stableManifest = JSON.parse(readText('release/update.json'))
  if (!/^\d+\.\d+\.\d+$/.test(String(stableManifest.versionName))) {
    fail('release/update.json versionName must be a stable semantic version')
  }
  const stableManifestText = JSON.stringify(stableManifest)
  if (/internal\/|shiguangjian-internal|\.app\.debug/i.test(stableManifestText)) {
    fail('release/update.json contains internal-channel data')
  }
  if (!String(stableManifest.githubUrl).includes(`/releases/download/v${stableManifest.versionName}/`)) {
    fail('release/update.json GitHub URL does not match the stable version')
  }
  if (!String(stableManifest.ossUrl).includes(`/releases/v${stableManifest.versionName}/`)) {
    fail('release/update.json OSS URL does not match the stable version')
  }

  const internalExample = JSON.parse(readText('release/internal-update.example.json'))
  if (!/^\d+\.\d+\.\d+-internal\.\d{8}\.\d{6}$/.test(String(internalExample.versionName))) {
    fail('internal update example must use the internal version format')
  }
  if (!String(internalExample.ossUrl).includes('/internal/') || 'githubUrl' in internalExample) {
    fail('internal update example must be OSS internal-only')
  }

  console.log('Release channel validation passed.')
}

function generateStableNotes() {
  const version = option('release-version', process.argv[3] ?? '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail('stable notes require a positional X.Y.Z version')
  const changelog = readText('CHANGELOG.md')
  const matchingHeading = [...changelog.matchAll(/^## (.+)$/gm)]
    .map((match) => match[1])
    .find((heading) => heading.startsWith(`${version} - `))
  if (!matchingHeading) fail(`CHANGELOG.md has no archived stable version ${version}`)

  const section = sectionByHeading(changelog, matchingHeading)
  const forbidden = [
    'xyz.shiguangjian.app.debug',
    'shiguangjian-internal',
    'internal/latest',
    'internal/builds',
    '-internal.',
  ]
  const leaked = forbidden.find((marker) => section.toLowerCase().includes(marker.toLowerCase()))
  if (leaked) fail(`stable release notes contain internal marker: ${leaked}`)

  const body = section.replace(/^## .+\n*/, '').trim()
  const notes = `# 拾光笺 v${version}\n\n${body}\n\n> 可直接覆盖安装，请勿先卸载；卸载会删除应用私有目录中的本地日记。`
  writeText(option('output', 'release/github-release-notes.md'), notes)
}

function generateInternalNotes() {
  const body = unreleasedBody(readText('INTERNAL_CHANGELOG.md'))
  if (!hasMeaningfulBullet(body)) fail('INTERNAL_CHANGELOG.md 未发布部分没有可发布的测试迭代内容')
  writeText(option('output', 'release/internal-release-notes.md'), body)
}

function archiveInternalNotes() {
  const version = option('version')
  const date = option('date', new Date().toISOString().slice(0, 10))
  if (!/^\d+\.\d+\.\d+-internal\.\d{8}\.\d{6}$/.test(version)) {
    fail('archive-internal requires --version X.Y.Z-internal.YYYYMMDD.HHmmss')
  }

  const relativePath = 'INTERNAL_CHANGELOG.md'
  const markdown = readText(relativePath)
  const section = sectionByHeading(markdown, '未发布')
  const body = section.replace(/^## 未发布\s*/, '').trim()
  if (!hasMeaningfulBullet(body)) fail('cannot archive an empty internal iteration')

  const template = `## 未发布\n\n### 测试目标\n\n- 待填写\n\n### 变更\n\n- 待填写\n\n### 已知问题\n\n- 无\n\n### 验证结果\n\n- 待验证`
  const archived = `## ${version} - ${date}\n\n${body}`
  const updated = markdown.replace(section, `${template}\n\n${archived}`)
  fs.writeFileSync(path.join(projectRoot, relativePath), updated.endsWith('\n') ? updated : `${updated}\n`, 'utf8')
  console.log(`Archived internal changelog: ${version}`)
}

const command = process.argv[2] ?? 'validate'
switch (command) {
  case 'validate':
    validate()
    break
  case 'stable-notes':
    validate()
    generateStableNotes()
    break
  case 'internal-notes':
    validate()
    generateInternalNotes()
    break
  case 'archive-internal':
    archiveInternalNotes()
    validate()
    break
  default:
    fail(`unknown command: ${command}`)
}
