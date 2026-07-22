export type ResultKind = 'folder' | 'doc' | 'text' | 'sheet' | 'img' | 'code'

const CODE_EXT = new Set([
  'rs',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'rb',
  'java',
  'kt',
  'swift',
  'php',
  'sh',
  'bash',
  'zsh',
  'toml',
  'json',
  'yaml',
  'yml',
  'xml',
  'css',
  'scss',
  'html',
  'sql',
])
const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'rtf', 'log', 'text'])
const SHEET_EXT = new Set(['xls', 'xlsx', 'csv', 'tsv', 'numbers', 'ods'])
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico', 'heic'])
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'pages', 'odt', 'epub', 'key', 'ppt', 'pptx'])

export function kindFor(extension: string | null, isDir: boolean): ResultKind {
  if (isDir) {
    return 'folder'
  }
  const ext = (extension || '').toLowerCase()
  if (CODE_EXT.has(ext)) return 'code'
  if (TEXT_EXT.has(ext)) return 'text'
  if (SHEET_EXT.has(ext)) return 'sheet'
  if (IMG_EXT.has(ext)) return 'img'
  if (DOC_EXT.has(ext)) return 'doc'
  return 'doc'
}
