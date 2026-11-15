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
  for (const path of ['INSTRUCTIONS.md', 'routines.md', 'bot.json', 'modules.lock.json', 'modules.lock.schema.json', 'skills/SOURCES.json', ...fixtureNames.map((name) => `fixtures/${name}`), ...expectedSkills.map((name) => `skills/${name}/SKILL.md`)]) {
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

test('the instructions and every skill body start with the template version, so a shared skill library can tell which template wrote a skill', () => {
  const bot = readJson(join(root, 'bot.json'));
  assert.equal(bot.version, templateVersion);
  assert.equal(bot.instructions.split('\n')[0], `Template version: ${templateVersion}`);
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

test('the private data directory rule is exact: modules and module input never read it, and the bot reads only the platform\'s documented reference files there', async () => {
  const instructions = readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8');
  for (const required of [
    'Modules and module input never read `/home/box/agent-data`, the bot\'s private data directory.',
    'Never give a module a path under it, and never put anything read from it into module input.',
    'You yourself may read there only the platform\'s own skill and Page-kit reference files that the platform documents at that location, and nothing else under it.',
  ]) assert(instructions.includes(required), `INSTRUCTIONS.md must say: ${required}`);
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
    assert.equal(routine.timeZone, 'the owner\'s time zone, or UTC until the owner has given one', routine.name);
    assert.equal(routine.destination, 'the owner\'s chat with this bot', routine.name);
    assert(routine.prompt.trim().length > 0, routine.name);
  }
});

test('the selfcheck routine is quiet when nothing is wrong and speaks only about problems, and the instructions say the same', () => {
  const [selfcheck] = readJson(join(root, 'bot.json')).routines;
  assert.match(selfcheck.prompt, /`ambitious-module-installer` skill: run its sync command and nothing else/u);
  assert.match(selfcheck.prompt, /When `ok` is true and `data\.problems` is empty, end the run without posting any message\./u);
  assert.match(selfcheck.prompt, /When `data\.problems` is not empty, post one message to the owner's chat with this bot/u);
  assert.match(selfcheck.prompt, /Do not collect an audit, write a report, or call `send_report`, `send_feedback` or any other connection tool/u);
  assert.doesNotMatch(selfcheck.prompt, /say that every module is installed/u);
  const instructions = readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8');
  assert.doesNotMatch(instructions, /sends nothing/u);
  assert(instructions.includes('It posts nothing when `data.problems` is empty, and posts the problems to the owner\'s chat with this bot when it is not.'));
  assert(instructions.includes('The `ambitious-selfcheck` routine runs the sync command every day at 7:00 AM in the owner\'s time zone.'));
});

test('the instructions state the boundaries a copy of the template must keep', () => {
  const instructions = readFileSync(join(root, 'INSTRUCTIONS.md'), 'utf8');
  for (const required of [
    'Nothing leaves this computer except through the Ambitious MCP tools, each call after the owner\'s tool approval.',
    'Audit data leaves only through `send_report` and `send_feedback`. A Factory tool call carries only the business details the owner gave for that call.',
    'It serves `send_report` and `send_feedback`, and the Factory tools `factory_environment`, `factory_match`, `factory_plan` and `factory_version`.',
    'The command never downloads, installs or runs a newer template release.',
    'A skill is written only when none is stored or the stored one is older.',
    '`/workspace/ambitious/bin`',
    '`/home/box/agent-data`',
    'https://ambitiousbots.com/api/mcp',
    'All reported numbers come from module output.',
    'Write documents in Grok Bot Pages.',
    'On first chat, run the sync command, then follow the `ambitious-getting-started` skill',
  ]) assert(instructions.includes(required), `INSTRUCTIONS.md must say: ${required}`);
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

await import('./releases.test.mjs');
await import('./e2e.test.mjs');
