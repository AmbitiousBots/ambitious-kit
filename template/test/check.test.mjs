import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative } from 'node:path';
import test from 'node:test';
import { LOCK_PATTERNS, parseLock } from '../../packages/kit/src/domain/lock.ts';
import { buildInstaller, lock, readJson, repoRoot, sha256, sync, templateRoot as root } from './support.mjs';

const schema = readJson(join(root, 'modules.lock.schema.json'));
const sources = readJson(join(root, 'skills', 'SOURCES.json'));
const ownSkills = ['capability-probe', 'getting-started', 'module-installer'];
const expectedSkills = [...ownSkills, ...sources.copied.map(({ skill }) => skill), ...sources.written.map(({ skill }) => skill)].sort();
const pinnedModules = ['audit', 'compliance', 'contracts', 'records', 'tasks', 'video'];
const visibilitySignals = ['auditLog', 'otherBots', 'transcripts', 'usage'];

async function filesIn(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => !(directory === root && entry.name === 'test'));
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `${path}: template files must not be symbolic links`);
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return files.flat().sort();
}

function checkSchema(definition) {
  const common = ['$schema', 'title', 'description', 'type'];
  const keywords = {
    array: ['items'],
    object: ['properties', 'required', 'additionalProperties'],
    string: ['pattern'],
  };
  assert(Object.hasOwn(keywords, definition.type), `Unsupported schema type ${definition.type}`);
  for (const keyword of Object.keys(definition)) {
    assert([...common, ...keywords[definition.type]].includes(keyword), `Unsupported schema keyword ${keyword}`);
  }
  if (definition.type === 'array') checkSchema(definition.items);
  if (definition.type === 'object') {
    assert.equal(definition.additionalProperties, false);
    assert(Array.isArray(definition.required));
    for (const key of definition.required) assert(Object.hasOwn(definition.properties, key));
    for (const child of Object.values(definition.properties)) checkSchema(child);
  }
  if (definition.pattern !== undefined) new RegExp(definition.pattern, 'u');
}

function validate(value, definition, path = 'lock') {
  if (definition.type === 'array') {
    assert(Array.isArray(value), `${path} must be an array`);
    value.forEach((item, index) => validate(item, definition.items, `${path}[${index}]`));
  } else if (definition.type === 'object') {
    assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
    for (const key of definition.required) assert(Object.hasOwn(value, key), `${path}.${key} is required`);
    for (const [key, item] of Object.entries(value)) {
      assert(Object.hasOwn(definition.properties, key), `${path}.${key} is not allowed`);
      validate(item, definition.properties[key], `${path}.${key}`);
    }
  } else {
    assert.equal(typeof value, 'string', `${path} must be a string`);
    if (definition.pattern !== undefined) assert.match(value, new RegExp(definition.pattern, 'u'), path);
  }
}

function validateLock(value) {
  checkSchema(schema);
  validate(value, schema);
  const modules = new Set();
  for (const entry of value) {
    assert(!modules.has(entry.module), `Duplicate module ${entry.module}`);
    modules.add(entry.module);
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    const filename = decodeURIComponent(url.pathname.split('/').at(-1));
    assert(['mjs', 'pyz'].some((extension) => filename === `ambitious-${entry.module}-${entry.version}.${extension}`), 'Asset filename must match its pinned module and version');
  }
}

test('the required template files and skill frontmatter are present', async () => {
  const files = await filesIn(root);
  const paths = files.map((path) => relative(root, path));
  for (const path of ['INSTRUCTIONS.md', 'routines.md', 'bot.json', 'modules.lock.json', 'modules.lock.schema.json', 'skills/SOURCES.json', ...expectedSkills.map((name) => `skills/${name}/SKILL.md`)]) {
    assert(paths.includes(path), `Missing ${path}`);
  }
  const skills = files.filter((path) => path.endsWith('/SKILL.md'));
  assert.deepEqual(skills.map((path) => relative(join(root, 'skills'), dirname(path))), expectedSkills);
  for (const path of skills) {
    const contents = await readFile(path, 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(contents);
    assert(frontmatter, `${path}: frontmatter must start the file`);
    for (const field of ['name', 'description']) {
      const matches = [...frontmatter[1].matchAll(new RegExp(`^${field}:[ \\t]*(.*?)[ \\t]*$`, 'gm'))];
      assert.equal(matches.length, 1, `${path}: one ${field} is required`);
      const value = matches[0][1].replace(/^(['"])(.*)\1$/u, '$2').trim();
      assert(value.length > 0 && !['null', '~', '|', '>'].includes(value), `${path}: ${field} must be a nonempty inline value`);
      if (field === 'name') assert.equal(value, relative(join(root, 'skills'), dirname(path)).split('/').at(-1));
    }
  }
});

test('template prose and JSON contain no placeholders', async () => {
  for (const path of await filesIn(root)) {
    if (!/\.(?:md|json)$/u.test(path)) continue;
    const contents = await readFile(path, 'utf8');
    assert.doesNotMatch(contents, /\b(?:TODO|TBD|FIXME)\b|<[^>\r\n]+>/u, path);
    assert.doesNotMatch(contents, /\blorem\b|\bplaceholder\b|\bcoming soon\b/iu, path);
  }
});

test('instructions stay within 120 lines', async () => {
  const contents = await readFile(join(root, 'INSTRUCTIONS.md'), 'utf8');
  const lines = contents.replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n');
  assert(lines.length <= 120, `INSTRUCTIONS.md has ${lines.length} lines`);
  assert(contents.trim().length > 0);
});

test('the module lock pins the six released modules, and the schema and the installer agree on what a pin is', () => {
  validateLock(lock());
  assert.deepEqual(parseLock(lock()).map(({ module }) => module).sort(), pinnedModules);
  for (const row of parseLock(lock())) {
    assert.equal(row.url, `https://github.com/AmbitiousBots/ambitious-${row.module}/releases/download/${row.module}-v${row.version}/${row.asset}`);
    assert.equal(row.kind, row.module === 'video' ? 'pyz' : 'mjs');
  }
  for (const [field, pattern] of Object.entries(LOCK_PATTERNS)) assert.equal(schema.items.properties[field].pattern, pattern, field);
});

test('lock validation accepts exact releases and rejects invalid pins', () => {
  const release = {
    module: 'tasks',
    version: '0.1.0',
    url: 'https://example.org/releases/tasks-v0.1.0/ambitious-tasks-0.1.0.mjs',
    sha256: '0123456789abcdef'.repeat(4),
  };
  validateLock([]);
  validateLock([release]);
  validateLock([{ ...release, module: 'video', version: '1.2.3-rc.1+build.2', url: 'https://example.org/releases/ambitious-video-1.2.3-rc.1+build.2.pyz' }]);
  const invalid = [
    {}, null, [null], [release, release],
    [{ ...release, module: '../tasks' }],
    [{ ...release, version: 'latest' }],
    [{ ...release, version: '^0.1.0' }],
    [{ ...release, version: '01.2.3' }],
    [{ ...release, version: '1.2.3-01' }],
    [{ ...release, sha256: 'a'.repeat(63) }],
    [{ ...release, sha256: 'A'.repeat(64) }],
    [{ ...release, url: release.url.replace('https:', 'http:') }],
    [{ ...release, url: release.url.replace('example.org', 'user:password@example.org') }],
    [{ ...release, url: `${release.url}?download=1` }],
    [{ ...release, url: `${release.url}#asset` }],
    [{ ...release, url: release.url.replace('ambitious-tasks', 'ambitious-audit') }],
    [{ ...release, version: '0.2.0' }],
    [{ ...release, extra: true }],
  ];
  for (const key of Object.keys(release)) {
    const missing = { ...release };
    delete missing[key];
    invalid.push([missing], [{ ...release, [key]: 7 }]);
  }
  for (const value of invalid) {
    assert.throws(() => validateLock(value));
    assert.throws(() => parseLock(value));
  }
  assert.equal(parseLock([release]).length, 1);
  assert.throws(() => checkSchema({ ...schema, minItems: 1 }), /Unsupported schema keyword/u);
});

for (const role of ['owner', 'guest']) {
  test(`${role} visibility fixture uses only the collector fields and signals`, async () => {
    const path = join(root, 'skills', 'capability-probe', 'fixtures', `${role}.expected.json`);
    const rows = JSON.parse(await readFile(path, 'utf8'));
    assert(Array.isArray(rows));
    assert.deepEqual(rows.map((row) => row.signal).sort(), visibilitySignals);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['seen', 'signal', 'why']);
      assert.equal(typeof row.seen, 'boolean');
      assert.equal(typeof row.why, 'string');
      assert(row.why.trim().length > 0, `${role}: explain each observation or gap`);
    }
    const expectedSeen = role === 'owner'
      ? { transcripts: true, usage: false, otherBots: true, auditLog: false }
      : { transcripts: false, usage: false, otherBots: false, auditLog: false };
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.signal, row.seen])), expectedSeen);
  });
}

test('every module skill names where it came from, and a copied skill is byte for byte the recorded file', () => {
  for (const entry of [...sources.copied, ...sources.written]) {
    assert.match(entry.repository, /^AmbitiousBots\/ambitious-[a-z]+$/u);
    assert.equal(entry.tag, `${entry.repository.split('-').at(-1)}-v0.1.0`);
    assert.match(entry.commit, /^[0-9a-f]{40}$/u);
    assert(lock().some((row) => `${row.module}-v${row.version}` === entry.tag), `${entry.skill}: ${entry.tag} is not a pinned release`);
  }
  for (const entry of sources.copied) {
    assert.equal(entry.path, `skills/${entry.skill}/SKILL.md`);
    assert.equal(sha256(readFileSync(join(root, entry.path))), entry.sha256, `${entry.skill} differs from the file copied from ${entry.tag}`);
  }
  assert.deepEqual(sources.copied.map(({ skill }) => skill), ['tasks-for-bots', 'tasks-page', 'audit-collector', 'audit-page', 'snapshot-routine', 'send-feedback', 'contracts-for-bots']);
  assert.deepEqual(sources.written.map(({ skill }) => skill), ['compliance-for-bots', 'records-for-bots', 'video-for-bots']);
});

test('the installer pin in the module-installer skill and bot.json are what the generator makes from the other files', () => {
  const check = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'template-generate.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('bot.json is a complete payload for creating the bot', () => {
  const bot = readJson(join(root, 'bot.json'));
  assert.deepEqual(Object.keys(bot), ['name', 'description', 'instructions', 'skills', 'routines']);
  assert.equal(bot.name, 'Ambitious Bot');
  assert(bot.description.length > 0 && bot.description.length <= 300);
  assert.equal(bot.instructions, readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8'));
  assert.deepEqual(bot.skills.map(({ name }) => name), expectedSkills);
  for (const skill of bot.skills) {
    assert.deepEqual(Object.keys(skill), ['name', 'description', 'body']);
    assert(skill.description.trim().length > 0 && skill.body.trim().length > 0, skill.name);
    assert(!skill.body.startsWith('---'), `${skill.name}: the body must not repeat the frontmatter`);
  }
  assert.deepEqual(bot.routines.map(({ name, paused }) => [name, paused]), [['ambitious-selfcheck', false], ['ambitious-snapshot', true]]);
  for (const routine of bot.routines) {
    assert.deepEqual(Object.keys(routine), ['name', 'schedule', 'prompt', 'paused']);
    assert(routine.schedule.trim().length > 0 && routine.prompt.trim().length > 0, routine.name);
  }
  const [selfcheck] = bot.routines;
  assert.match(selfcheck.prompt, /`module-installer` skill: run its sync command and nothing else/u);
  assert.match(selfcheck.prompt, /Do not collect an audit, write a report or send anything/u);
});

test('the instructions state the boundaries a copy of the template must keep', () => {
  const instructions = readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8');
  for (const required of [
    'Nothing leaves this computer except through `send_report` and `send_feedback`, each after the owner\'s tool approval.',
    '`/workspace/ambitious/bin`',
    '`/home/box/agent-data`',
    'https://ambitiousbots.com/api/mcp',
    'All reported numbers come from module output.',
    'Write documents in Grok Bot Pages.',
    'On first chat, run the sync command, then follow the `getting-started` skill',
  ]) assert(instructions.includes(required), `INSTRUCTIONS.md must say: ${required}`);
});

const scratch = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'ambitious-template-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('the first-run lines in the module-installer skill fetch the pinned installer, and it then runs', (t) => {
  const built = buildInstaller();
  const { version } = readJson(join(repoRoot, 'package.json'));
  const asset = `ambitious-modules-${version}.mjs`;
  const skill = readFileSync(join(root, 'skills', 'module-installer', 'SKILL.md'), 'utf8');
  const blocks = [...skill.matchAll(/```sh\n([\s\S]*?)```/gu)].map(([, block]) => block);
  const firstRun = blocks.find((block) => block.includes('sha256sum'));
  assert(firstRun, 'the skill needs a first-run block that checks the pin');
  assert(firstRun.includes(`https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-v${version}/${asset}`));
  assert(firstRun.includes(`${sha256(readFileSync(built))}  ${asset}`));
  assert(blocks.some((block) => block.trim() === 'node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json'));

  const tools = scratch(t);
  const fakeCurl = (source) => {
    writeFileSync(join(tools, 'curl'), `#!/bin/sh\nfor last; do :; done\ncp "${source}" "$(basename "$last")"\n`);
    chmodSync(join(tools, 'curl'), 0o755);
  };
  const firstRunIn = (home) => spawnSync('sh', ['-c', firstRun], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home, PATH: `${tools}${delimiter}${process.env.PATH}` } });

  const tampered = join(tools, 'tampered.mjs');
  writeFileSync(tampered, `${readFileSync(built, 'utf8')}\n`);
  fakeCurl(tampered);
  const refusedHome = scratch(t);
  assert.notEqual(firstRunIn(refusedHome).status, 0, 'a download that does not match the pin must stop the first run');
  assert.throws(() => readlinkSync(join(refusedHome, 'bin', 'ambitious-modules')));

  fakeCurl(built);
  const home = scratch(t);
  const run = firstRunIn(home);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(readlinkSync(join(home, 'bin', 'ambitious-modules')), asset);

  const emptyLock = join(tools, 'empty.lock.json');
  writeFileSync(emptyLock, '[]\n');
  const viaLink = spawnSync(process.execPath, [join(home, 'bin', 'ambitious-modules'), 'sync', '--json', '--lock', emptyLock], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
  const envelope = JSON.parse(viaLink.stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.meta.version, version);
  assert.equal(envelope.data.summary, 'No modules are pinned, so nothing was installed or checked.');
});

test('the sync command refuses the private data directory, an unknown command and a lock that is not a list of pins', (t) => {
  buildInstaller();
  const home = scratch(t);
  const forbidden = sync('/home/box/agent-data/ambitious');
  assert.equal(forbidden.status, 1);
  assert.equal(forbidden.envelope.errors[0].code, 'E_FORBIDDEN_PATH');
  const badLock = join(home, 'bad.lock.json');
  writeFileSync(badLock, JSON.stringify([{ module: 'tasks', version: 'latest', url: 'https://example.org/x/ambitious-tasks-latest.mjs', sha256: '0'.repeat(64) }]));
  const invalid = sync(home, ['--lock', badLock]);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.envelope.errors[0].code, 'E_INPUT_SCHEMA');
  mkdirSync(join(home, 'mirror'));
  const run = spawnSync(process.execPath, [buildInstaller(), 'install'], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).errors[0].code, 'E_USAGE');
});

await import('./releases.test.mjs');
await import('./e2e.test.mjs');
