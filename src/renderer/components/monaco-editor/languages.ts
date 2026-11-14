// Extension → Monaco language id map, split out of MonacoEditorWindow.

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', js: 'javascript', tsx: 'typescript', jsx: 'javascript',
  json: 'json', html: 'html', css: 'css', md: 'markdown',
  py: 'python', rs: 'rust', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml', sh: 'shell', bat: 'bat', ps1: 'powershell',
  cpp: 'cpp', c: 'c', cs: 'csharp', java: 'java',
  go: 'go', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
};

export function languageForExtension(ext: string): string {
  return LANGUAGE_BY_EXT[ext] || 'plaintext';
}
