// Prints the section of CHANGELOG.md for one version (without its heading), for release notes.
//   node scripts/changelog-section.mjs 1.2.3
import { readFileSync } from 'node:fs';

/** The text between "## [version]" and the next "## [" heading or the link list at the end. */
export function changelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && (l.startsWith('## [') || /^\[[^\]]+\]: /.test(l)));
  if (end === -1) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const version = process.argv[2];
  const section = version && changelogSection(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version);
  if (!section) {
    console.error(`CHANGELOG.md has no section for version ${version}`);
    process.exit(1);
  }
  console.log(section);
}
