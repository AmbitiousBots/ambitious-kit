import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { gh, ghSignedIn, lock, NO_GH, readJson, releaseOf, releasedText, sha256, templateRoot } from './support.mjs';

const mirror = process.env.AMBITIOUS_MODULE_MIRROR;
const sourceMirror = process.env.AMBITIOUS_RELEASE_SOURCE_MIRROR;
const skip = mirror && sourceMirror || ghSignedIn() ? false : `Skipped: ${NO_GH}. The pins were not compared with the published releases in this run.`;
const sources = readJson(join(templateRoot, 'skills', 'SOURCES.json'));

function cachedSource(directory, entry) {
  const git = (args) => execFileSync('git', ['--no-replace-objects', `--git-dir=${join(directory, entry.tag, '.git')}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let commit;
  let object;
  try {
    commit = git(['rev-parse', '--verify', `refs/tags/${entry.tag}^{commit}`]).toString('utf8').trim();
    object = git(['cat-file', 'commit', commit]);
  } catch (cause) {
    throw new Error(`${entry.tag}: cache requires a Git clone with the pinned tag and commit object; a commit text file is not provenance`, { cause });
  }
  assert.equal(commit, entry.commit, `${entry.tag}: cached tag does not name the pinned commit`);
  const objectHash = createHash('sha1').update(`commit ${object.length}\0`).update(object).digest('hex');
  assert.equal(objectHash, entry.commit, `${entry.tag}: cached commit object does not hash to the pinned commit`);
  return entry.path === undefined ? undefined : git(['show', `${entry.commit}:${entry.path}`]);
}

for (const row of lock()) {
  test(`the pin for ambitious-${row.module} ${row.version} matches the published file and its release's SHA256SUMS`, { skip }, () => {
    const { repository, tag, asset } = releaseOf(row);
    const download = (file) => mirror ? readFileSync(join(mirror, tag, file)) : gh(['release', 'download', tag, '--repo', repository, '--pattern', file, '--output', '-']);
    const listed = download('SHA256SUMS').toString('utf8').split('\n').filter((line) => line.endsWith(`  ${asset}`));
    assert.deepEqual(listed, [`${row.sha256}  ${asset}`]);
    assert.equal(sha256(download(asset)), row.sha256);
  });
}

for (const entry of [...sources.copied, ...sources.written]) {
  test(sourceMirror ? `the cached Git objects for ${entry.skill} match the pinned commit and ${entry.tag}` : `the public tag ${entry.tag} for ${entry.skill} names the pinned commit`, { skip }, () => {
    let published;
    if (sourceMirror) published = cachedSource(sourceMirror, entry);
    else {
      const commit = gh(['api', `repos/${entry.repository}/commits/${entry.tag}`, '--jq', '.sha']).toString('utf8').trim();
      assert.equal(commit, entry.commit);
      if (entry.path !== undefined) published = gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${entry.repository}/contents/${entry.path}?ref=${entry.commit}`]);
    }
    if (entry.path === undefined) return;
    assert.equal(sha256(published), entry.sha256, `${entry.skill}: the recorded SHA-256 is not that of ${entry.path} at ${entry.tag}`);
    assert.equal(sha256(releasedText(entry)), sha256(published), `${entry.skill} differs from the file at ${entry.tag} in more than its recorded frontmatter lines`);
  });
}

test('a fabricated source mirror with a matching commit text file is refused', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ambitious-source-mirror-'));
  try {
    const entry = sources.written[0];
    mkdirSync(join(directory, entry.tag));
    writeFileSync(join(directory, entry.tag, 'commit'), `${entry.commit}\n`);
    assert.throws(() => cachedSource(directory, entry), /cache requires a Git clone/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('cached source comes from verified Git objects, and fabricated objects or tags are refused', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ambitious-source-objects-'));
  const tag = 'fixture-v1.0.0';
  const clone = join(directory, tag);
  const git = (args) => execFileSync('git', ['-C', clone, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
  try {
    mkdirSync(clone);
    git(['init', '--object-format=sha1']);
    writeFileSync(join(clone, 'skill.md'), 'published skill\n');
    git(['add', 'skill.md']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture']);
    const commit = git(['rev-parse', 'HEAD']);
    git(['tag', tag]);
    const entry = { tag, commit, path: 'skill.md' };
    writeFileSync(join(clone, 'skill.md'), 'fabricated working tree\n');
    assert.equal(cachedSource(directory, entry).toString('utf8'), 'published skill\n');
    assert.throws(() => cachedSource(directory, { ...entry, commit: '0'.repeat(40) }), /cached tag does not name the pinned commit/);
    const original = git(['cat-file', 'commit', commit]);
    const forged = Buffer.from(`${original}\nforged\n`);
    const bytes = Buffer.concat([Buffer.from(`commit ${forged.length}\0`), forged]);
    const objectPath = join(clone, '.git', 'objects', commit.slice(0, 2), commit.slice(2));
    rmSync(objectPath);
    writeFileSync(objectPath, deflateSync(bytes));
    assert.throws(() => cachedSource(directory, entry), /cached commit object does not hash to the pinned commit|cache requires a Git clone/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
