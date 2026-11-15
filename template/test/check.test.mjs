import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative } from 'node:path';
import test from 'node:test';
import { LOCK_PATTERNS, parseLock } from '../../packages/kit/src/domain/lock.ts';
import { buildInstaller, lock, readJson, releasedText, repoRoot, sha256, SKILL_PREFIX, sync, templateRoot as root, VERSION_LINE } from './support.mjs';

const schema = readJson(join(root, 'modules.lock.schema.json'));
const sources = readJson(join(root, 'skills', 'SOURCES.json'));
const ownSkills = ['ambitious-capability-probe', 'ambitious-getting-started', 'ambitious-module-installer'];
const expectedSkills = [...ownSkills, ...sources.copied.map(({ skill }) => skill), ...sources.written.map(({ skill }) => skill)].sort();
const pinnedModules = ['audit', 'compliance', 'contracts', 'records', 'tasks', 'video'];
const visibilitySignals = ['transcripts', 'usage', 'otherBots', 'auditLog', 'accountRole', 'tasks', 'pages', 'botActivity', 'routines'];
const { version: templateVersion } = readJson(join(repoRoot, 'package.json'));
const fixtureNames = ['guest', 'owner', 'role-unknown'].map((role) => `ambitious-capability-probe/${role}.expected.json`);
const published = readJson(join(root, 'instructions.json'));
const permissions = readJson(join(root, 'permissions.json'));
const MONITORING_ADDRESS = 'https://ambitiousbots.com/api/mcp';
const skillText = (name) => readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8');
const routineSections = () => Object.fromEntries(readFileSync(join(root, 'routines.md'), 'utf8').split(/^## /mu).slice(1).map((section) => [section.split('\n')[0], section]));

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
  for (const path of ['INSTRUCTIONS.md', 'instructions.json', 'instructions/1.md', 'instructions/2.md', 'permissions.json', 'routines.md', 'bot.json', 'modules.lock.json', 'modules.lock.schema.json', 'skills/SOURCES.json', ...fixtureNames.map((name) => `fixtures/${name}`), ...expectedSkills.map((name) => `skills/${name}/SKILL.md`)]) {
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

test('the instructions are short and hold nothing that changes with a release: no template version, no module list, no schedule and no tool beyond the two that send audit data', async () => {
  const contents = await readFile(join(root, 'INSTRUCTIONS.md'), 'utf8');
  const lines = contents.replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n');
  assert(lines.length <= 60, `INSTRUCTIONS.md has ${lines.length} lines; what changes belongs in a skill`);
  assert.equal(lines[0], `Instructions version: ${published.current}`);
  assert.deepEqual(lines.filter((line) => line.startsWith('# ')), ['# Role', '# Skills', '# Hard limits'], 'identity, a pointer to the skills, and the hard limits');
  assert.doesNotMatch(contents, /Template version|[0-9]+\.[0-9]+\.[0-9]+|[0-9]:[0-9]{2} ?(?:AM|PM)|factory_|data\.[a-z]+|--[a-z]/u);
  for (const module of pinnedModules) assert.doesNotMatch(contents, new RegExp(`ambitious-${module}\\b`, 'u'), `the instructions name the module ${module}; modules come and go with the pins`);
  for (const [, skill] of contents.matchAll(/`(ambitious-[a-z-]+)` skill/gu)) assert(expectedSkills.includes(skill), `the instructions point at ${skill}, which is not a skill of this template`);
  for (const skill of ['ambitious-getting-started', 'ambitious-module-installer']) assert(contents.includes(`\`${skill}\` skill`), `the instructions must point at ${skill}`);
});

const SHA256 = /^[0-9a-f]{64}$/u;

test('instructions.json records every published instructions text by version and SHA-256, the newest is INSTRUCTIONS.md, and the oldest supported is the text of template 0.2.1', () => {
  assert.deepEqual(Object.keys(published), ['current', 'oldestSupported', 'grants', 'versions']);
  assert.deepEqual(published.versions.map(({ version }) => version), published.versions.map((_, index) => index + 1), 'versions are whole numbers counted up from 1');
  assert.equal(published.current, published.versions.length);
  assert.equal(published.oldestSupported, 1);
  for (const entry of published.versions) {
    assert.deepEqual(Object.keys(entry), ['version', 'firstTemplate', 'file', 'sha256', 'variants', 'grants']);
    const text = readFileSync(join(root, entry.file), 'utf8');
    assert.equal(sha256(text), entry.sha256, `${entry.file} is not the text recorded for instructions version ${entry.version}. A published text never changes: a new text is a new version, with the "Instructions version" line raised.`);
    assert.equal(text, `${text.split('\n').map((line) => line.trimEnd()).join('\n').trim()}\n`, `${entry.file}: no trailing spaces or blank lines at either end, so the recorded SHA-256 is that of the text as a bot would write it out`);
    for (const variant of entry.variants) {
      assert.deepEqual(Object.keys(variant), ['template', 'sha256', 'difference']);
      assert.match(variant.sha256, SHA256);
    }
    for (const grant of entry.grants) assert(Object.hasOwn(published.grants, grant), `version ${entry.version} lists the grant ${grant}, which instructions.json does not describe`);
    assert.equal(new Set(entry.grants).size, entry.grants.length);
  }
  const [oldest, middle, current] = published.versions;
  assert.deepEqual([oldest.file, oldest.firstTemplate, middle.file, middle.firstTemplate, current.file], ['instructions/1.md', '0.2.1', 'instructions/2.md', '0.2.4', 'INSTRUCTIONS.md']);
  assert.doesNotMatch(readFileSync(join(root, oldest.file), 'utf8'), /^(?:Instructions|Template) version:/mu);
  assert.match(readFileSync(join(root, middle.file), 'utf8'), /^Template version: 0\.2\.4\n/u);
  const hashes = published.versions.flatMap(({ sha256: hash, variants }) => [hash, ...variants.map((variant) => variant.sha256)]);
  assert.equal(new Set(hashes).size, hashes.length, 'one SHA-256 names one version');
  const oldestGrants = published.versions.find(({ version }) => version === published.oldestSupported).grants;
  for (const entry of published.versions) {
    for (const grant of oldestGrants) assert(entry.grants.includes(grant), `instructions version ${entry.version} does not grant ${grant}, which the oldest supported version grants; a skill written for the oldest would break under it`);
  }
});

test('each recorded instructions text is the one its template release published', (t) => {
  const tagged = (template) => spawnSync('git', ['show', `kit-v${template}:template/INSTRUCTIONS.md`], { cwd: repoRoot, encoding: 'utf8' });
  const releases = published.versions.flatMap(({ version, firstTemplate, sha256: hash, variants }) => [{ version, template: firstTemplate, hash }, ...variants.map((variant) => ({ version, template: variant.template, hash: variant.sha256 }))]);
  const earlier = releases.filter(({ template }) => template !== templateVersion);
  for (const template of ['0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4']) assert(earlier.some((release) => release.template === template), `instructions.json must record the text of template ${template}`);
  if (earlier.some(({ template }) => tagged(template).status !== 0)) {
    t.skip(`Skipped: this checkout does not have every release tag from kit-v0.2.0 to the one before kit-v${templateVersion}, so the recorded texts were not compared with them. Fetch the tags to run it.`);
    return;
  }
  for (const { version, template, hash } of earlier) assert.equal(sha256(tagged(template).stdout), hash, `instructions version ${version}: the SHA-256 recorded for template ${template} is not that of its INSTRUCTIONS.md`);
});

const MARKERS = {
  pages: /\bPages?\b|\bpage tool\b/u,
  'report-tool': /send_report/u,
  'feedback-tool': /send_feedback/u,
  'pinned-downloads': /\bcurl \b|gh release download/u,
  'message-owner': /\bpost(?:s|ing)?\b[^.\n]*\b(?:message|chat)\b|\bmessage the owner\b|\bsend(?:s|ing)? (?:the owner )?(?:a|one) message\b|\bemail the owner\b/iu,
  'factory-tools': /factory_[a-z]+|Factory tools?/u,
  'private-reference-files': /reference files/u,
  'shared-skills': /\b[Ww]rit(?:e|ing) (?:a |one |the )?(?:shared )?skill\b|Write the candidate/u,
  'provider-call': /speech provider|outside provider|_API_KEY/u,
};

const permissionProblems = (name, text, entry, oldestGrants) => {
  const problems = [];
  const lines = text.split('\n');
  const declared = [...entry.requires, ...entry.optional, ...entry.rulesOut];
  for (const grant of declared) if (!Object.hasOwn(published.grants, grant)) problems.push(`${name} declares the grant ${grant}, which instructions.json does not describe`);
  if (new Set(declared).size !== declared.length) problems.push(`${name} declares a grant twice`);
  for (const grant of entry.requires) {
    if (!oldestGrants.includes(grant)) problems.push(`${name} requires ${grant}, which instructions version ${published.oldestSupported} does not grant. Rewrite the step to work without it, or make it optional and say so in the text.`);
  }
  for (const [grant, marker] of Object.entries(MARKERS)) {
    const using = lines.filter((line) => marker.test(line));
    if (using.length > 0 && !declared.includes(grant)) problems.push(`${name} uses ${grant} ("${using[0].slice(0, 80)}") but permissions.json does not list it`);
    if (entry.rulesOut.includes(grant)) {
      for (const line of using) if (!/\b(?:not|never|no|nothing)\b/iu.test(line)) problems.push(`${name} lists ${grant} as ruled out, but this line does not rule it out: "${line.slice(0, 80)}"`);
    }
    if (entry.optional.includes(grant) && !oldestGrants.includes(grant) && !using.some((line) => /only when this bot's instructions (?:allow|say)/u.test(line))) {
      problems.push(`${name} lists ${grant} as optional, so the line that uses it must say it is done "only when this bot's instructions allow" it`);
    }
  }
  return problems;
};

test('no skill and no routine requires a permission that the oldest supported instructions do not grant, and every permission a text uses is in its explicit map', () => {
  const oldestGrants = published.versions.find(({ version }) => version === published.oldestSupported).grants;
  assert.deepEqual(Object.keys(permissions), ['skills', 'routines']);
  assert.deepEqual(Object.keys(permissions.skills), expectedSkills, 'permissions.json has one entry for each skill');
  const sections = routineSections();
  assert.deepEqual(Object.keys(permissions.routines), Object.keys(sections).filter((name) => name !== 'How a copy of this template stays current'));
  const texts = [...expectedSkills.map((name) => [name, skillText(name), permissions.skills[name]]), ...Object.entries(permissions.routines).map(([name, entry]) => [`the routine section "${name}"`, sections[name], entry])];
  for (const [name, text, entry] of texts) {
    assert.deepEqual(Object.keys(entry), ['requires', 'optional', 'rulesOut'], name);
    assert.deepEqual(permissionProblems(name, text, entry, oldestGrants), []);
  }
  for (const grant of ['message-owner', 'private-reference-files']) {
    for (const [name, , entry] of texts) assert(![...entry.requires, ...entry.optional].includes(grant), `${name} must not use ${grant}: instructions version ${published.oldestSupported} forbids it`);
  }

  const caught = (text, entry) => permissionProblems('a skill', text, { requires: [], optional: [], rulesOut: [], ...entry }, oldestGrants).join(' ');
  assert.match(caught('Call `factory_match` for the owner.', {}), /uses factory-tools .* but permissions\.json does not list it/u);
  assert.match(caught('Call `factory_match` for the owner.', { requires: ['factory-tools'] }), /requires factory-tools, which instructions version 1 does not grant/u);
  assert.match(caught('Call `factory_match` for the owner.', { optional: ['factory-tools'] }), /must say it is done "only when this bot's instructions allow" it/u);
  assert.equal(caught('Call `factory_match` only when this bot\'s instructions allow it.', { optional: ['factory-tools'] }), '');
  assert.match(caught('Post one message to the owner\'s chat with this bot.', {}), /uses message-owner/u);
  assert.match(caught('Read the platform\'s reference files in the private data directory.', {}), /uses private-reference-files/u);
  assert.match(caught('Call `send_report` now.', { rulesOut: ['report-tool'] }), /does not rule it out/u);
  assert.equal(caught('Never call `send_report` here.', { rulesOut: ['report-tool'] }), '');
});

test('the time zone comes from the platform when it gives one, is asked for only when it gives none, and is never silently UTC', () => {
  const started = skillText('ambitious-getting-started');
  for (const required of [
    'Use the time zone the platform already gives for the owner',
    'Ask the owner only when the platform gives none.',
    'Never assume UTC silently.',
  ]) assert(started.includes(required), `ambitious-getting-started must say: ${required}`);
  const prose = [readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8'), readFileSync(join(root, 'routines.md'), 'utf8'), ...expectedSkills.map(skillText)];
  for (const text of prose) assert.doesNotMatch(text, /routines? runs? in UTC|or UTC until|Then ask for the owner's time zone/u);
});

test('the monitoring connection is found by its address and not by its name, and a connector with that name and another address is left alone', () => {
  for (const name of ['ambitious-getting-started', 'ambitious-capability-probe']) {
    const text = skillText(name);
    assert(text.includes(`The monitoring connection is the connector whose server address is exactly \`${MONITORING_ADDRESS}\`.`), name);
    assert.match(text, /never by its display name/u, name);
    assert.match(text, /named Ambitious, or anything like it, (?:but has|with) another address is a different connector/u, name);
    assert.match(text, /"a different connector"/u, name);
    assert.match(text, /leave it alone/u, name);
    assert.match(text, /does not show addresses/u, name);
  }
  assert(readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8').includes(`\`${MONITORING_ADDRESS}\``));
});

test('the collector and the task skills take task counts from the counts command of the pinned tasks module', () => {
  const collector = skillText('ambitious-audit-collector');
  assert.match(collector, /`tasks\.open`, `tasks\.stale7d` and `tasks\.blocked` come from `ambitious-tasks counts`\./u);
  for (const field of ['data.open', 'data.stale7d', 'data.blocked']) assert(collector.includes(`\`${field}\``), field);
  assert.match(collector, /Do not count tasks from `list` or `board` output, and do not add the counts of several lists together/u);
  assert.match(skillText('ambitious-capability-probe'), /`ambitious-tasks counts`/u);
  assert.match(skillText('ambitious-tasks-for-bots'), /Use `counts` with a list name/u);
  assert.match(skillText('ambitious-tasks-page'), /run `counts` for the list/u);
});

test('the upgrade from an earlier template is written down in order, in the installer skill and in the README', () => {
  const ordered = (text, steps, where) => {
    let from = 0;
    for (const step of steps) {
      const at = text.indexOf(step, from);
      assert(at !== -1, `${where} must say, in this order: ${step}`);
      from = at + step.length;
    }
  };
  const skill = skillText('ambitious-module-installer');
  const section = skill.split('\n## ').find((part) => part.startsWith('Upgrade a copy made from an earlier template\n')) ?? '';
  ordered(section, ['template 0.2.0 to 0.2.4', '1. The owner brings this skill.', '2. Store this skill', '3. Run the lines under "Fetch the pinned installer"', '4. Run the sync command with `--instructions`', '5. Decide every other `ambitious-*` skill', '6. Read `data.instructions`', '7. Tell the owner that the routines keep the prompts'], 'the installer skill');
  assert.match(section, /cannot fetch a newer one and must not try/u);
  assert.match(section, /`E_USAGE` and names `--instructions`/u);
  assert(skill.indexOf('## Upgrade a copy made from an earlier template') < skill.indexOf('## Fetch the pinned installer'));
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const guide = readme.split('\n### ').find((part) => part.startsWith('Upgrading a bot made from an earlier template\n')) ?? '';
  ordered(guide, ['0.2.0 to 0.2.4', '1. ', '`ambitious-module-installer` skill', '2. ', 'SHA-256', '3. ', '`ambitious-modules sync --json --instructions', '4. ', '`ambitious-modules skills`', '5. ', 'the Page with the proposed text'], 'README.md');
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

for (const role of ['owner', 'guest', 'role-unknown']) {
  test(`${role} visibility fixture uses only the collector fields and signals`, async () => {
    const path = join(root, 'fixtures', 'ambitious-capability-probe', `${role}.expected.json`);
    const rows = JSON.parse(await readFile(path, 'utf8'));
    assert(Array.isArray(rows));
    assert.deepEqual(rows.map((row) => row.signal), visibilitySignals);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['seen', 'signal', 'why']);
      assert.equal(typeof row.seen, 'boolean');
      assert.equal(typeof row.why, 'string');
      assert(row.why.trim().length > 0, `${role}: explain each observation or gap`);
    }
    const expectedSeen = {
      owner: { transcripts: true, usage: false, otherBots: true, auditLog: false, accountRole: true, tasks: true, pages: true, botActivity: true, routines: true },
      guest: { transcripts: false, usage: false, otherBots: false, auditLog: false, accountRole: true, tasks: false, pages: false, botActivity: false, routines: false },
      'role-unknown': { transcripts: false, usage: false, otherBots: true, auditLog: false, accountRole: false, tasks: true, pages: false, botActivity: false, routines: true },
    };
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.signal, row.seen])), expectedSeen[role]);
  });
}

test('every module skill names the pinned release it describes, and a copied skill is the recorded file apart from its recorded name and description lines and its template version line', () => {
  for (const entry of [...sources.copied, ...sources.written]) {
    assert.match(entry.repository, /^AmbitiousBots\/ambitious-[a-z]+$/u);
    const module = entry.repository.split('-').at(-1);
    assert.equal(entry.tag, `${module}-v${lock().find((row) => row.module === module)?.version}`, `${entry.skill}: the record must name the pinned release of ambitious-${module}`);
    assert.match(entry.commit, /^[0-9a-f]{40}$/u);
    assert(lock().some((row) => `${row.module}-v${row.version}` === entry.tag), `${entry.skill}: ${entry.tag} is not a pinned release`);
  }
  for (const entry of sources.copied) {
    assert.deepEqual(Object.keys(entry), ['skill', 'repository', 'tag', 'commit', 'path', 'sha256', 'releasedFrontmatter']);
    assert.deepEqual(Object.keys(entry.releasedFrontmatter), ['name', 'description']);
    const releasedName = entry.skill.slice(SKILL_PREFIX.length);
    assert.equal(entry.path, `skills/${releasedName}/SKILL.md`);
    assert.equal(entry.releasedFrontmatter.name, `name: ${releasedName}`);
    assert.equal(sha256(releasedText(entry)), entry.sha256, `${entry.skill} differs from the file copied from ${entry.tag} in more than its name and description lines and its template version line`);
  }
  for (const entry of sources.written) assert.deepEqual(Object.keys(entry), ['skill', 'repository', 'tag', 'commit']);
  assert.deepEqual(sources.copied.map(({ skill }) => skill), ['ambitious-tasks-page', 'ambitious-audit-page', 'ambitious-snapshot-routine', 'ambitious-send-feedback']);
  assert.deepEqual(sources.written.map(({ skill }) => skill), ['ambitious-audit-collector', 'ambitious-tasks-for-bots', 'ambitious-contracts-for-bots', 'ambitious-compliance-for-bots', 'ambitious-records-for-bots', 'ambitious-video-for-bots']);
});

test('every skill body starts with the template version, so a shared skill library can tell which template wrote a skill, and the instructions start with their own version instead', () => {
  const bot = readJson(join(root, 'bot.json'));
  assert.equal(bot.version, templateVersion);
  assert.equal(bot.instructions.split('\n')[0], `Instructions version: ${published.current}`);
  for (const skill of bot.skills) {
    const [first, second] = skill.body.split('\n');
    assert.match(first, VERSION_LINE, `${skill.name}: the first line of the body must be the template version`);
    assert.equal(first, `Template version: ${templateVersion}`, skill.name);
    assert.equal(second, '', `${skill.name}: a blank line follows the template version`);
  }
});

test('no instruction, routine or skill points at a file that is not on the bot\'s computer', async () => {
  const prose = [join(root, 'INSTRUCTIONS.md'), join(root, 'routines.md'), ...(await filesIn(join(root, 'skills'))).filter((path) => path.endsWith('.md'))];
  const fixtures = (await filesIn(join(root, 'fixtures'))).map((path) => relative(join(root, 'fixtures'), path));
  assert.deepEqual(fixtures, fixtureNames);
  for (const path of prose) {
    const where = relative(root, path);
    const text = await readFile(path, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/gu)) assert.match(target, /^https:\/\//u, `${where}: the link target ${target} is not a public address`);
    for (const line of text.split('\n')) {
      if (/\bREADME\b|\breadme\b/u.test(line)) assert.match(line, /https:\/\/github\.com\/AmbitiousBots\/ambitious-[a-z]+#readme/u, `${where}: a README is named without its public address: ${line}`);
      assert.doesNotMatch(line, /source checkout|template source|beside this skill|verify\/run|\.\.\//u, `${where}: ${line}`);
      for (const [named] of line.matchAll(/[A-Za-z0-9-]+\.expected\.json/gu)) {
        assert(fixtures.some((fixture) => fixture.endsWith(`/${named}`)), `${where} names the fixture ${named}, which the installer does not place`);
      }
    }
    for (const [, directory] of text.matchAll(/template\/fixtures\/([a-z0-9-]+)/gu)) {
      assert(fixtures.some((fixture) => fixture.startsWith(`${directory}/`)), `${where} names template/fixtures/${directory}, which holds no fixture`);
    }
  }
});

test('the private data directory rule is exact: modules and module input never read it, the bot reads only the platform\'s documented reference files there, and no skill asks the bot to read there at all', async () => {
  const instructions = readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8');
  for (const required of [
    'Modules and module input never read `/home/box/agent-data`, the bot\'s private data directory.',
    'Never give a module a path under it or anything read from it.',
    'You yourself may read there only the platform\'s own reference files that the platform documents at that location.',
  ]) assert(instructions.includes(required), `INSTRUCTIONS.md must say: ${required}`);
  for (const name of expectedSkills) assert.doesNotMatch(skillText(name), /may read there|files you may read/u, `${name} must work without reading the private data directory, which the oldest supported instructions forbid`);
  assert.match(skillText('ambitious-module-installer'), /Do not look for skill files in the bot's private data directory\./u);
  for (const path of [join(root, 'INSTRUCTIONS.md'), join(root, 'routines.md'), ...(await filesIn(join(root, 'skills'))).filter((file) => file.endsWith('.md'))]) {
    assert.doesNotMatch(await readFile(path, 'utf8'), /Never read (?:Grok internals or )?`\/home\/box\/agent-data`/u, `${relative(root, path)} still forbids every read of the private data directory`);
  }
});

test('the audit skills write an unseen value as null and never as zero, run with an unknown role, and name the nine visibility signals the same way', () => {
  const skill = (name) => readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8');
  for (const name of ['ambitious-audit-collector', 'ambitious-capability-probe', 'ambitious-getting-started', 'ambitious-audit-page']) {
    const text = skill(name);
    assert.match(text, /`null`/u, `${name} must say an unseen value is null`);
    assert.match(text, /never (?:as |show it as |write )?(?:zero|0)/iu, `${name} must rule out zero for an unseen value`);
    assert.match(text, /`unknown`|does not know its role/u, `${name} must cover an unknown account role`);
    assert.doesNotMatch(text, /defer collector input|older than 0\.2\.0|no `schema` command/u, name);
  }
  for (const name of ['ambitious-audit-collector', 'ambitious-capability-probe', 'ambitious-getting-started']) {
    assert.match(skill(name), /`ambitious-audit schema`/u, `${name} must name the schema command`);
  }
  for (const name of ['ambitious-capability-probe', 'ambitious-getting-started', 'ambitious-audit-page']) {
    assert.match(skill(name), /`partial`/u, `${name} must name the mode the module answers with for an unknown role`);
  }
  const collector = skill('ambitious-audit-collector');
  assert.doesNotMatch(collector, /`source` is optional/u, 'the pinned audit module requires a source on every evidence entry');
  const probe = skill('ambitious-capability-probe');
  const table = [...probe.matchAll(/^\| `([A-Za-z]+)` \| /gmu)].map(([, signal]) => signal);
  assert.deepEqual(table, visibilitySignals, 'the probe skill has one table row for each signal, in the order of the fixtures');
  const listed = /exactly one entry for each of (.+?)\. /u.exec(collector)?.[1] ?? '';
  assert.deepEqual([...listed.matchAll(/`([A-Za-z]+)`/gu)].map(([, signal]) => signal), visibilitySignals, 'the collector skill lists the same signals');
  assert.match(probe, /do not put the audit off/u);
  assert.match(skill('ambitious-getting-started'), /Do not put the audit off/u);
});

test('every skill is named for the Ambitious Bot and says so first in its description', () => {
  const bot = readJson(join(root, 'bot.json'));
  assert.equal(bot.skills.length, expectedSkills.length);
  for (const skill of bot.skills) {
    assert.match(skill.name, /^ambitious-[a-z][a-z-]*[a-z]$/u);
    assert(skill.description.startsWith('For the Ambitious Bot only. '), `${skill.name}: the description must start by saying the skill is for the Ambitious Bot`);
    assert.match(skill.description, /\. Use (?:when|on|in|before|after) .*Ambitious Bot/u, `${skill.name}: the description must say when the Ambitious Bot uses it`);
  }
});

test('no file refers to a skill by its name without the ambitious- prefix', async () => {
  const bareNames = expectedSkills.map((name) => name.slice(SKILL_PREFIX.length));
  const bare = new RegExp(`(?<![A-Za-z0-9-])(?:${bareNames.join('|')})(?![A-Za-z0-9-])`, 'u');
  const record = join(root, 'skills', 'SOURCES.json');
  const templateFiles = [...(await filesIn(root)), ...(await filesIn(join(root, 'test')))].filter((path) => path !== record);
  const repoFiles = [
    ...['README.md', 'AGENTS.md', 'MODULE_CONTRACT.md', 'CONTRIBUTING.md'].map((name) => join(repoRoot, name)),
    ...(await filesIn(join(repoRoot, 'scripts'))),
    ...(await filesIn(join(repoRoot, 'verify'))),
    ...(await filesIn(join(repoRoot, 'packages', 'kit', 'src'))),
    join(repoRoot, 'packages', 'kit', 'README.md'),
  ];
  for (const path of [...templateFiles, ...repoFiles]) {
    const lines = (await readFile(path, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const found = bare.exec(line);
      assert.equal(found, null, `${relative(repoRoot, path)}:${index + 1} names "${found?.[0]}"; the skill is "${SKILL_PREFIX}${found?.[0]}"`);
    });
  }
  for (const entry of sources.copied) assert(bare.test(entry.path), `${entry.skill}: the record keeps the path the file has in its module release`);
});

test('the installer pin in the ambitious-module-installer skill and bot.json are what the generator makes from the other files', () => {
  const check = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'template-generate.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('bot.json is a complete payload for creating the bot', () => {
  const bot = readJson(join(root, 'bot.json'));
  assert.deepEqual(Object.keys(bot), ['name', 'description', 'version', 'instructions', 'skills', 'routines']);
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
    assert.deepEqual(Object.keys(routine), ['name', 'schedule', 'timeZone', 'destination', 'prompt', 'paused']);
    assert.match(routine.schedule, /^every day at (?:[1-9]|1[0-2]):[0-5][0-9] (?:AM|PM)$/u, `${routine.name}: the schedule needs a default time`);
    assert.equal(routine.timeZone, 'the owner\'s time zone as the platform gives it; ask the owner only when it gives none', routine.name);
    assert.equal(routine.destination, 'the run\'s reply, in this bot\'s own chat', routine.name);
    assert(routine.prompt.trim().length > 0, routine.name);
  }
});

test('the selfcheck routine is quiet when nothing is wrong, speaks only about problems and only in this bot\'s own chat, and the ambitious-getting-started skill says the same; routines.md says that a routine has no destination field', () => {
  const [selfcheck] = readJson(join(root, 'bot.json')).routines;
  assert.match(selfcheck.prompt, /`ambitious-module-installer` skill: run its sync command and nothing else/u);
  assert.match(selfcheck.prompt, /Run it without `--instructions`/u);
  assert.match(selfcheck.prompt, /When `ok` is true and `data\.problems` is empty, end the run with an empty reply\./u);
  assert.match(selfcheck.prompt, /When `data\.problems` is not empty, reply once, in this bot's own chat/u);
  assert.match(selfcheck.prompt, /Send nothing anywhere else\./u);
  assert.match(selfcheck.prompt, /Do not collect an audit, write a report, or call `send_report`, `send_feedback` or any other connection tool/u);
  assert.doesNotMatch(selfcheck.prompt, /say that every module is installed/u);
  const started = skillText('ambitious-getting-started');
  assert(started.includes('The `ambitious-selfcheck` routine runs the plain sync command every day at 7:00 AM.'));
  assert(started.includes('Its reply is empty when `data.problems` is empty, and lists the problems when it is not.'));
  const routines = readFileSync(join(root, 'routines.md'), 'utf8');
  assert(routines.includes('It has no destination field: where a run reports is decided by the words of the prompt alone.'));
  assert(started.includes('It has no separate setting for where a run reports'));
});

test('the instructions state the boundaries a copy of the template must keep', () => {
  const instructions = readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8');
  for (const required of [
    'Never change your own instructions or another bot\'s.',
    'Speak to the owner in this bot\'s own chat. Never send email, and never send a message anywhere else.',
    'Nothing leaves this computer except through the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`, each call after the owner\'s tool approval.',
    'Audit data leaves only through `send_report` and `send_feedback`. Any other tool of that connection carries only the business details the owner gave for that call.',
    'Download only the pinned public release files that the `ambitious-module-installer` skill names.',
    'Never edit a pin, install a module by hand or use an unpinned release.',
    'Never expose credentials in prompts, Pages, module input, files, logs or reports. Never ask for or store an access token.',
    '`/workspace/ambitious/bin`',
    '`/home/box/agent-data`',
    'Reported numbers come from module output.',
    'Write documents in Grok Bot Pages.',
    'Never change, rename or delete a skill whose name does not start with `ambitious-`.',
    'Where a skill asks for something these instructions do not allow, do not do it, and tell the owner.',
    'On first chat, follow the `ambitious-getting-started` skill.',
  ]) assert(instructions.includes(required), `INSTRUCTIONS.md must say: ${required}`);
  const installer = skillText('ambitious-module-installer');
  for (const required of [
    'The command only reports it: it never downloads, installs or runs anything from that release',
    'Never write a skill the command did not answer `create` or `update` for.',
    'Never change the instructions yourself, even when a tool would let you, and never change another bot\'s.',
    'pasting it into the bot\'s instructions is the owner\'s choice',
  ]) assert(installer.includes(required), `ambitious-module-installer must say: ${required}`);
});

const scratch = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'ambitious-template-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('each of the three ways to fetch the installer in the ambitious-module-installer skill ends in the same pin check, which alone makes the link', (t) => {
  const built = buildInstaller();
  const asset = `ambitious-modules-${templateVersion}.mjs`;
  const tag = `kit-v${templateVersion}`;
  const skill = readFileSync(join(root, 'skills', 'ambitious-module-installer', 'SKILL.md'), 'utf8');
  const blocks = [...skill.matchAll(/```sh\n([\s\S]*?)```/gu)].map(([, block]) => block);
  const only = (what, test) => {
    const found = blocks.filter(test);
    assert.equal(found.length, 1, `the skill needs exactly one block that ${what}`);
    return found[0];
  };
  const fetches = {
    curl: only('downloads with curl', (block) => block.includes('curl ')),
    gh: only('downloads with the GitHub CLI', (block) => block.includes('gh release download')),
    mirror: only('copies from a mirror', (block) => block.includes('$AMBITIOUS_MODULE_MIRROR')),
  };
  const verify = only('checks the pin', (block) => block.includes('sha256sum'));
  assert(fetches.curl.includes(`https://github.com/AmbitiousBots/ambitious-kit/releases/download/${tag}/${asset}`));
  assert(fetches.gh.includes(`gh release download ${tag} --repo AmbitiousBots/ambitious-kit --pattern ${asset}`));
  assert(fetches.mirror.includes(`"$AMBITIOUS_MODULE_MIRROR/${tag}/${asset}"`));
  assert(verify.includes(`${sha256(readFileSync(built))}  ${asset}`));
  for (const block of Object.values(fetches)) assert.doesNotMatch(block, /ln |chmod |node /u, 'a fetch block must not link or run the file; only the pin check may');
  assert.equal(blocks.filter((block) => block.includes('ln ')).length, 1, 'only the pin check block may make the link');
  assert.doesNotMatch(skill, /another way/u);
  assert(blocks.some((block) => block.trim() === 'node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json'));

  const tools = scratch(t);
  const tampered = join(tools, 'tampered.mjs');
  writeFileSync(tampered, `${readFileSync(built, 'utf8')}\n`);
  const serve = (source) => {
    writeFileSync(join(tools, 'curl'), `#!/bin/sh\nfor last; do :; done\ncp "${source}" "$(basename "$last")"\n`);
    writeFileSync(join(tools, 'gh'), `#!/bin/sh\ncp "${source}" "${asset}"\n`);
    for (const tool of ['curl', 'gh']) chmodSync(join(tools, tool), 0o755);
    const mirror = scratch(t);
    mkdirSync(join(mirror, tag));
    writeFileSync(join(mirror, tag, asset), readFileSync(source));
    return mirror;
  };
  const shell = (block, home, mirror) =>
    spawnSync('sh', ['-c', block], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home, AMBITIOUS_MODULE_MIRROR: mirror, PATH: `${tools}${delimiter}${process.env.PATH}` } });

  for (const [way, fetch] of Object.entries(fetches)) {
    const refusedHome = scratch(t);
    const badMirror = serve(tampered);
    assert.equal(shell(fetch, refusedHome, badMirror).status, 0, way);
    assert.notEqual(shell(verify, refusedHome, badMirror).status, 0, `${way}: a file that does not match the pin must fail the check`);
    assert.throws(() => readlinkSync(join(refusedHome, 'bin', 'ambitious-modules')), `${way}: no link may be made for a file that failed the check`);
    assert.throws(() => readFileSync(join(refusedHome, 'bin', asset)), `${way}: a file that failed the check is deleted`);

    const home = scratch(t);
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'bin', 'ambitious-modules-0.0.1.mjs'), 'an older installer');
    symlinkSync('ambitious-modules-0.0.1.mjs', join(home, 'bin', 'ambitious-modules'));
    const goodMirror = serve(built);
    const fetched = shell(fetch, home, goodMirror);
    assert.equal(fetched.status, 0, `${way}: ${fetched.stdout}${fetched.stderr}`);
    assert.equal(readlinkSync(join(home, 'bin', 'ambitious-modules')), 'ambitious-modules-0.0.1.mjs', `${way}: fetching alone must not switch the link`);
    const checked = shell(verify, home, goodMirror);
    assert.equal(checked.status, 0, `${way}: ${checked.stdout}${checked.stderr}`);
    assert.equal(readlinkSync(join(home, 'bin', 'ambitious-modules')), asset);

    const emptyLock = join(tools, 'empty.lock.json');
    writeFileSync(emptyLock, '[]\n');
    const viaLink = spawnSync(process.execPath, [join(home, 'bin', 'ambitious-modules'), 'sync', '--json', '--lock', emptyLock], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
    const envelope = JSON.parse(viaLink.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.meta.version, templateVersion);
    assert.equal(envelope.data.summary, 'No modules are pinned, so nothing was installed or checked.');
  }
});

test('the installer refuses the private data directory, an unknown command or option and a lock that is not a list of pins', (t) => {
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
  for (const args of [['install'], ['sync', '--updated-from', '0.0.1'], ['sync', '--in', badLock], ['skills', '--lock', badLock]]) {
    const run = spawnSync(process.execPath, [buildInstaller(), ...args], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
    assert.equal(run.status, 1, args.join(' '));
    assert.equal(JSON.parse(run.stdout).errors[0].code, 'E_USAGE', args.join(' '));
  }
  const privateInput = spawnSync(process.execPath, [buildInstaller(), 'skills', '--in', '/home/box/agent-data/skills.json'], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
  assert.equal(JSON.parse(privateInput.stdout).errors[0].code, 'E_FORBIDDEN_PATH');
});

test('sync compares the bot\'s instructions with the template\'s: an earlier published text is instructions-out-of-date with both versions, a text nobody published is instructions-custom, and the bot\'s file is never changed', (t) => {
  buildInstaller();
  const home = scratch(t);
  const emptyLock = join(home, 'empty.lock.json');
  writeFileSync(emptyLock, '[]\n');
  const text = (file) => readFileSync(join(root, file), 'utf8');
  const proposed = join(home, 'template', 'instructions.md');
  const check = (contents) => {
    const file = join(home, 'current-instructions.md');
    writeFileSync(file, contents);
    const { envelope } = sync(home, ['--lock', emptyLock, '--instructions', file]);
    assert.equal(envelope.ok, true, JSON.stringify(envelope.errors));
    assert.equal(readFileSync(file, 'utf8'), contents, 'the installer never writes to the bot\'s instructions file');
    assert.equal(readFileSync(proposed, 'utf8'), text('INSTRUCTIONS.md'), 'the proposed text is the template\'s, exactly');
    assert.deepEqual(Object.keys(envelope.data.instructions), ['state', 'problem', 'current', 'template', 'proposed', 'diff']);
    assert.equal(envelope.data.instructions.template, published.current);
    assert.equal(envelope.data.instructions.proposed, proposed);
    return envelope.data;
  };
  const about = ({ instructions: { state, problem, current } }) => [state, problem, current];

  const unchecked = sync(home, ['--lock', emptyLock]).envelope.data;
  assert.deepEqual(about(unchecked), ['not checked', null, null]);
  assert.deepEqual([unchecked.problems, unchecked.notes], [[], []], 'a routine run, which names no instructions file, has nothing to say about them');

  const current = check(text('INSTRUCTIONS.md'));
  assert.deepEqual(about(current), ['current', null, published.current]);
  assert.deepEqual([current.problems, current.notes, current.instructions.diff], [[], [], []]);

  for (const { version, file } of published.versions.slice(0, -1)) {
    const earlier = check(text(file));
    assert.deepEqual(about(earlier), ['out-of-date', 'instructions-out-of-date', version]);
    assert.equal(earlier.problems.length, 1);
    assert.match(earlier.problems[0], new RegExp(`^instructions-out-of-date: This bot's instructions are version ${version} and this template's are version ${published.current}\\. The template's text is in .*instructions\\.md\\. Nothing was changed: only the owner can replace a bot's instructions, and doing so is the owner's choice\\.$`, 'u'));
    assert(earlier.instructions.diff.includes(`+ Instructions version: ${published.current}`));
    assert(earlier.instructions.diff.every((line) => /^[+-] /u.test(line)));
    const kept = text(file).split('\n').filter((line) => text('INSTRUCTIONS.md').split('\n').includes(line) && line !== '');
    for (const line of kept.slice(0, 3)) assert(!earlier.instructions.diff.includes(`- ${line}`) || earlier.instructions.diff.includes(`+ ${line}`), `a line both texts have in the same order is not a difference: ${line}`);
  }
  const retyped = check(`\r\n${text('instructions/1.md').replaceAll('\n', '  \r\n')}\r\n\r\n`);
  assert.deepEqual(about(retyped), ['out-of-date', 'instructions-out-of-date', 1], 'line endings, trailing spaces and blank lines at either end do not make a published text unknown');

  const none = check('\n');
  assert.deepEqual(about(none), ['out-of-date', 'instructions-out-of-date', null]);
  assert.match(none.problems[0], /^instructions-out-of-date: This bot's instructions have no text/u);

  const rewritten = check('You are a helpful bot for one shop.\nAnswer questions about orders.\n');
  assert.deepEqual(about(rewritten), ['custom', 'instructions-custom', null]);
  assert.match(rewritten.problems[0], /^instructions-custom: This bot's instructions are not a text this template published; they carry no version line.*They were left as they are, so that nothing the owner wrote is lost\./u);
  assert(rewritten.instructions.diff.includes('- You are a helpful bot for one shop.'));

  const editedOld = check(`${text('instructions/2.md')}Always answer in short sentences.\n`);
  assert.deepEqual(about(editedOld), ['custom', 'instructions-custom', null]);
  assert.deepEqual(editedOld.instructions.diff.filter((line) => line.startsWith('- ')).at(-1), '- Always answer in short sentences.');

  const editedCurrent = check(`${text('INSTRUCTIONS.md')}Always answer in short sentences.\n`);
  assert.deepEqual(about(editedCurrent), ['custom', 'instructions-custom', published.current]);
  assert.deepEqual(editedCurrent.problems, [], 'a customised text that already says the template\'s version is a note, not a problem');
  assert.match(editedCurrent.notes[0], /^instructions-custom: This bot's instructions say version 3, the template's version, but their text is not the template's\. They were left as they are\.$/u);
  assert.deepEqual(editedCurrent.instructions.diff, ['- Always answer in short sentences.']);

  const later = check(text('INSTRUCTIONS.md').replace(`Instructions version: ${published.current}`, 'Instructions version: 99'));
  assert.deepEqual(about(later), ['newer', null, 99]);
  assert.deepEqual(later.problems, []);
  assert.match(later.notes[0], /say version 99, which is newer than version 3 that this installer knows\. They were left as they are\./u);

  const forbidden = sync(home, ['--lock', emptyLock, '--instructions', '/home/box/agent-data/instructions.md']);
  assert.equal(forbidden.envelope.errors[0].code, 'E_FORBIDDEN_PATH');
  const missing = sync(home, ['--lock', emptyLock, '--instructions', join(home, 'no-such-file.md')]);
  assert.equal(missing.envelope.errors[0].code, 'E_INPUT_SCHEMA');
  assert.match(missing.envelope.errors[0].hint, /outside the bot's private data directory/u);
  const onSkills = spawnSync(process.execPath, [buildInstaller(), 'skills', '--instructions', join(home, 'current-instructions.md')], { encoding: 'utf8', input: '[]', env: { ...process.env, AMBITIOUS_HOME: home } });
  assert.equal(JSON.parse(onSkills.stdout).errors[0].code, 'E_USAGE');

  const skill = skillText('ambitious-module-installer');
  const block = [...skill.matchAll(/```sh\n([\s\S]*?)```/gu)].map(([, lines]) => lines.trim()).find((lines) => lines.includes('--instructions'));
  assert.equal(block, 'node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json --instructions "${AMBITIOUS_HOME:-/workspace/ambitious}/current-instructions.md"');
  for (const named of ['`state`', '`problem`', '`current`, `template`', '`proposed`', '`diff`', '`instructions-out-of-date`', '`instructions-custom`', '`out-of-date`', '`custom`', '`newer`', '`not checked`']) assert(skill.includes(named), `ambitious-module-installer must name ${named}`);
  assert.match(skill, /Write a Grok Bot Page named "Proposed instructions"\. It holds the two version numbers, a short diff, and then the full text of the `proposed` file, copied exactly\./u);
  assert.match(skillText('ambitious-getting-started'), /write the Page with the proposed text and a short diff, and say in this chat that pasting it is the owner's choice\. Never change the instructions yourself\./u);
});

await import('./releases.test.mjs');
await import('./e2e.test.mjs');
