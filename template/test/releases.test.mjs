import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { gh, ghSignedIn, lock, NO_GH, readJson, releaseOf, releasedText, sha256, templateRoot } from './support.mjs';

const skip = ghSignedIn() ? false : `Skipped: ${NO_GH}. The pins were not compared with the published releases in this run.`;
const sources = readJson(join(templateRoot, 'skills', 'SOURCES.json'));

for (const row of lock()) {
  test(`the pin for ambitious-${row.module} ${row.version} matches the published file and its release's SHA256SUMS`, { skip }, () => {
    const { repository, tag, asset } = releaseOf(row);
    const download = (file) => gh(['release', 'download', tag, '--repo', repository, '--pattern', file, '--output', '-']);
    const listed = download('SHA256SUMS').toString('utf8').split('\n').filter((line) => line.endsWith(`  ${asset}`));
    assert.deepEqual(listed, [`${row.sha256}  ${asset}`]);
    assert.equal(sha256(download(asset)), row.sha256);
  });
}

for (const entry of [...sources.copied, ...sources.written]) {
  test(`the skill ${entry.skill} is recorded against the commit that ${entry.tag} names`, { skip }, () => {
    const commit = gh(['api', `repos/${entry.repository}/commits/${entry.tag}`, '--jq', '.sha']).toString('utf8').trim();
    assert.equal(commit, entry.commit);
    if (entry.path === undefined) return;
    const published = gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${entry.repository}/contents/${entry.path}?ref=${entry.commit}`]);
    assert.equal(sha256(published), entry.sha256, `${entry.skill}: the recorded SHA-256 is not that of ${entry.path} at ${entry.tag}`);
    assert.equal(sha256(releasedText(entry)), sha256(published), `${entry.skill} differs from the file at ${entry.tag} in more than its recorded frontmatter lines`);
  });
}
