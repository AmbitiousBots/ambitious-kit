import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildInstaller, gh, ghSignedIn, installer, lock, NO_GH, readJson, releaseOf, repoRoot, sha256, sync, templateRoot } from './support.mjs';

const givenMirror = process.env.AMBITIOUS_MODULE_MIRROR ?? '';
const skip =
  givenMirror !== '' || ghSignedIn()
    ? false
    : `Skipped: ${NO_GH}, and AMBITIOUS_MODULE_MIRROR does not name a directory that holds them. The six released modules were not installed in this run.`;

const hasPython313 = ['python3.13', 'python3'].some((candidate) => {
  const probe = spawnSync(candidate, ['-c', "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: 'utf8' });
  return probe.status === 0 && probe.stdout.trim() === '3.13';
});

const rows = lock();
const names = rows.map(({ module }) => module);

const populate = (mirror) => {
  for (const row of rows) {
    const { repository, tag } = releaseOf(row);
    if (givenMirror !== '') cpSync(join(givenMirror, tag), join(mirror, tag), { recursive: true });
    else gh(['release', 'download', tag, '--repo', repository, '--dir', join(mirror, tag)]);
  }
};

const NEWER = '99.0.0';

const plantNewerRelease = (mirror, marker) => {
  const asset = `ambitious-modules-${NEWER}.mjs`;
  const trap = [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync(${JSON.stringify(marker)}, 'the newer release was run');`,
    `process.stdout.write(JSON.stringify({ ok: true, schemaVersion: 1, module: 'modules', command: 'sync', data: { problems: [], modules: [] }, errors: [], meta: { now: '2026-01-01T00:00:00.000Z', seed: 0, version: '${NEWER}' } }) + '\\n');`,
    '',
  ].join('\n');
  mkdirSync(join(mirror, `kit-v${NEWER}`), { recursive: true });
  writeFileSync(join(mirror, `kit-v${NEWER}`, asset), trap);
  writeFileSync(join(mirror, `kit-v${NEWER}`, 'SHA256SUMS'), `${sha256(Buffer.from(trap))}  ${asset}\n`);
  return asset;
};

const assertNewerOnlyReported = (envelope, home, marker) => {
  assert.equal(envelope.data.template.update, 'available');
  assert.equal(envelope.data.template.latest, NEWER);
  assert.equal(envelope.data.notes.length, 1);
  assert.match(envelope.data.notes[0], /A newer template is available: release 99\.0\.0.*Update the bot's template to get it\. Nothing from the newer release was downloaded, installed or run\./u);
  assert(!envelope.data.problems.some((problem) => /newer template|99\.0\.0/iu.test(problem)), 'a newer template is a note, never a problem');
  assert.equal(existsSync(marker), false, 'the newer release\'s installer must never be run');
  const bin = join(home, 'bin');
  const placed = existsSync(bin) ? readdirSync(bin) : [];
  assert.deepEqual(placed.filter((name) => name.includes(NEWER) || name === 'ambitious-modules'), [], 'nothing of the newer release may be placed in bin');
  assert.equal(envelope.meta.version, readJson(join(repoRoot, 'package.json')).version, 'the run was answered by this installer, not handed over');
};

const scratch = (t, name) => {
  const directory = mkdtempSync(join(tmpdir(), `ambitious-template-${name}-`));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('a newer template release with a tampered installer and a matching SHA256SUMS beside it is reported, never fetched or run, and the selfcheck routine has problems to post only when a module has one', (t) => {
  buildInstaller();
  const work = scratch(t, 'newer');
  const [home, mirror, marker] = [join(work, 'home'), join(work, 'mirror'), join(work, 'trap-ran')];
  plantNewerRelease(mirror, marker);

  const unreachable = sync(home, ['--from', mirror]);
  assert.equal(unreachable.envelope.ok, true);
  assertNewerOnlyReported(unreachable.envelope, home, marker);
  assert.deepEqual(statesOf(unreachable.envelope), all('failed'));
  assert.equal(unreachable.envelope.data.problems.length, rows.length);
  for (const problem of unreachable.envelope.data.problems) assert.match(problem, /^ambitious-[a-z]+: .*could not be downloaded/u);

  const emptyLock = join(work, 'empty.lock.json');
  writeFileSync(emptyLock, '[]\n');
  const quiet = sync(home, ['--from', mirror, '--lock', emptyLock]);
  assert.equal(quiet.envelope.ok, true);
  assert.deepEqual(quiet.envelope.data.problems, [], 'with nothing wrong the selfcheck routine has nothing to post');
  assert.equal(existsSync(marker), false);

  const handOver = sync(home, ['--from', mirror, '--updated-from', '0.0.1']);
  assert.equal(handOver.envelope.errors[0].code, 'E_USAGE', 'the hand-over option of earlier installers is gone');
  assert.equal(existsSync(marker), false);
});

test('the routines in bot.json carry a default time, the owner\'s time zone and a destination, and the selfcheck prompt is keyed on data.problems', () => {
  const { routines } = readJson(join(templateRoot, 'bot.json'));
  assert.deepEqual(routines.map(({ name, schedule }) => [name, schedule]), [['ambitious-selfcheck', 'every day at 7:00 AM'], ['ambitious-snapshot', 'every day at 8:00 AM']]);
  for (const routine of routines) {
    assert.match(routine.timeZone, /^the owner's time zone/u);
    assert.equal(routine.destination, 'the owner\'s chat with this bot');
  }
  const [selfcheck] = routines;
  assert.match(selfcheck.prompt, /`data\.problems` is empty, end the run without posting any message/u);
  assert.match(selfcheck.prompt, /`data\.problems` is not empty, post one message to the owner's chat with this bot/u);
});

test('the installer places the template fixtures where the skills point, and decides every shared skill write by template version', (t) => {
  buildInstaller();
  const work = scratch(t, 'shared');
  const home = join(work, 'home');
  const emptyLock = join(work, 'empty.lock.json');
  writeFileSync(emptyLock, '[]\n');
  const { version } = readJson(join(repoRoot, 'package.json'));
  const bot = readJson(join(templateRoot, 'bot.json'));

  const first = sync(home, ['--lock', emptyLock]);
  const fixtures = join(home, 'template', 'fixtures');
  assert.equal(first.envelope.data.template.fixtures, fixtures);
  const shipped = join(templateRoot, 'fixtures', 'ambitious-capability-probe');
  const names = readdirSync(shipped).sort();
  assert.deepEqual(readdirSync(join(fixtures, 'ambitious-capability-probe')).sort(), names);
  for (const name of names) assert.equal(readFileSync(join(fixtures, 'ambitious-capability-probe', name), 'utf8'), readFileSync(join(shipped, name), 'utf8'));
  const probe = bot.skills.find(({ name }) => name === 'ambitious-capability-probe').body;
  assert(probe.includes('`template/fixtures/ambitious-capability-probe` under `AMBITIOUS_HOME`'));
  for (const name of names) assert(probe.includes(`\`${name}\``), `the probe skill must name ${name}`);
  writeFileSync(join(fixtures, 'ambitious-capability-probe', names[0]), 'altered');
  sync(home, ['--lock', emptyLock]);
  assert.equal(readFileSync(join(fixtures, 'ambitious-capability-probe', names[0]), 'utf8'), readFileSync(join(shipped, names[0]), 'utf8'));

  const decide = (offers, viaStdin = false) => {
    const file = join(work, 'skills.json');
    writeFileSync(file, JSON.stringify(offers));
    const run = spawnSync(process.execPath, [installer, 'skills', '--json', ...(viaStdin ? [] : ['--in', file])], { encoding: 'utf8', input: viaStdin ? JSON.stringify(offers) : undefined, env: { ...process.env, AMBITIOUS_HOME: home } });
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.ok, true, run.stdout);
    assert.equal(envelope.command, 'skills');
    return envelope.data;
  };
  const actions = (data) => [...new Set(data.skills.map(({ action }) => action))];
  const offers = (stored) => bot.skills.map(({ name, body }) => ({ name, stored: stored(body), candidate: body }));
  const reversion = (body, to) => body.replace(`Template version: ${version}`, `Template version: ${to}`);

  const fresh = decide(offers(() => null));
  assert.equal(fresh.skills.length, bot.skills.length);
  assert.deepEqual(actions(fresh), ['create']);
  assert.deepEqual(actions(decide(offers((body) => body), true)), ['unchanged']);
  assert.deepEqual(actions(decide(offers((body) => reversion(body, '0.0.1')))), ['update']);
  assert.deepEqual(actions(decide(offers((body) => body.split('\n').slice(2).join('\n')))), ['update']);
  assert.deepEqual([fresh, decide(offers((body) => reversion(body, '0.0.1')))].flatMap(({ tellOwner }) => tellOwner), []);

  const owned = decide(offers((body) => reversion(body, NEWER)));
  assert.deepEqual(actions(owned), ['keep'], 'a newer template\'s skill is never replaced by an older one');
  assert.equal(owned.tellOwner.length, bot.skills.length);
  assert.match(owned.tellOwner[0], new RegExp(`belongs to template version 99\\.0\\.0, which is newer than this bot's template version ${version.replaceAll('.', '\\.')}`, 'u'));

  const edited = decide(offers((body) => `${body}\nEdited by hand.\n`));
  assert.deepEqual(actions(edited), ['keep'], 'a skill of the same version with different text is not overwritten');
  assert.match(edited.tellOwner[0], /its text differs/u);
});

const statesOf = (envelope) => Object.fromEntries(envelope.data.modules.map(({ module, state }) => [module, state]));
const all = (state, except = {}) => ({ ...Object.fromEntries(names.map((module) => [module, state])), ...except });

const assertHealthy = (envelope) => {
  assert.equal(envelope.ok, true);
  for (const report of envelope.data.modules) {
    if (report.module === 'video' && !hasPython313) {
      assert.equal(report.selfcheck, 'not run');
      assert.match(report.problems.join(' '), /Python 3\.13 was not found/u);
    } else {
      assert.equal(report.selfcheck, 'ok', `${report.module}: ${report.problems.join(' ')}`);
      assert.deepEqual(report.problems, []);
    }
  }
  assert.equal(envelope.data.problems.length, hasPython313 ? 0 : 1);
};

test('the six released modules install, repair, upgrade and selfcheck in a fresh AMBITIOUS_HOME', { skip }, async (t) => {
  buildInstaller();
  const work = mkdtempSync(join(tmpdir(), 'ambitious-template-e2e-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const [home, mirror] = [join(work, 'home'), join(work, 'mirror')];
  const bin = join(home, 'bin');
  mkdirSync(mirror);
  populate(mirror);
  const run = (args = []) => {
    const result = sync(home, ['--from', mirror, ...args]);
    assert.equal(result.status, 0, result.stderr);
    assertHealthy(result.envelope);
    return result.envelope;
  };
  const fileOf = (module) => join(bin, rows.find((row) => row.module === module).url.split('/').at(-1));
  const pinOf = (module) => rows.find((row) => row.module === module).sha256;

  await t.test('a first run installs all six at their pinned versions, and each selfcheck is ok', () => {
    const envelope = run();
    assert.deepEqual(statesOf(envelope), all('installed'));
    assert.deepEqual(envelope.data.modules.map(({ module, version }) => `${module} ${version}`), rows.map(({ module, version }) => `${module} ${version}`));
    for (const row of rows) {
      assert.equal(sha256(readFileSync(fileOf(row.module))), row.sha256);
      assert.equal(readlinkSync(join(bin, `ambitious-${row.module}`)), row.url.split('/').at(-1));
    }
    assert.equal(envelope.data.template.update, 'current');
    assert.deepEqual(envelope.data.notes, []);
  });

  const marker = join(work, 'trap-ran');
  await t.test('a second run changes nothing, and a newer template release that appeared meanwhile is a note the selfcheck routine does not post', () => {
    plantNewerRelease(mirror, marker);
    const envelope = run();
    assert.deepEqual(statesOf(envelope), all('unchanged'));
    assertNewerOnlyReported(envelope, home, marker);
  });

  await t.test('a deleted module binary is installed again', () => {
    rmSync(fileOf('tasks'));
    assert.deepEqual(statesOf(run()), all('unchanged', { tasks: 'reinstalled' }));
    assert.equal(sha256(readFileSync(fileOf('tasks'))), pinOf('tasks'));
  });

  await t.test('an altered module binary is replaced by the pinned one', () => {
    appendFileSync(fileOf('audit'), '\nprocess.exit(1);\n');
    assert.deepEqual(statesOf(run()), all('unchanged', { audit: 'reinstalled' }));
    assert.equal(sha256(readFileSync(fileOf('audit'))), pinOf('audit'));
  });

  await t.test('a removed link is put back', () => {
    rmSync(join(bin, 'ambitious-records'));
    assert.deepEqual(statesOf(run()), all('unchanged', { records: 'reinstalled' }));
    assert.equal(readlinkSync(join(bin, 'ambitious-records')), rows.find((row) => row.module === 'records').url.split('/').at(-1));
  });

  const bumpedLock = join(work, 'bumped.lock.json');
  await t.test('a lock row moved to a newer version upgrades that module and keeps the old file', () => {
    const fixture = Buffer.concat([readFileSync(fileOf('contracts')), Buffer.from('\n')]);
    mkdirSync(join(mirror, `contracts-v${NEWER}`));
    writeFileSync(join(mirror, `contracts-v${NEWER}`, `ambitious-contracts-${NEWER}.mjs`), fixture);
    writeFileSync(join(mirror, `contracts-v${NEWER}`, 'SHA256SUMS'), `${sha256(fixture)}  ambitious-contracts-${NEWER}.mjs\n`);
    const bumped = rows.map((row) =>
      row.module === 'contracts' ? { ...row, version: NEWER, url: row.url.replaceAll(row.version, NEWER), sha256: sha256(fixture) } : row,
    );
    writeFileSync(bumpedLock, JSON.stringify(bumped));
    const envelope = run(['--lock', bumpedLock]);
    assert.deepEqual(statesOf(envelope), all('unchanged', { contracts: 'upgraded' }));
    assert.equal(envelope.data.modules.find(({ module }) => module === 'contracts').version, NEWER);
    assert.equal(readlinkSync(join(bin, 'ambitious-contracts')), `ambitious-contracts-${NEWER}.mjs`);
    assert(existsSync(fileOf('contracts')), 'the old version stays beside the new one');
  });

  await t.test('after the upgrade a further run changes nothing', () => {
    assert.deepEqual(statesOf(run(['--lock', bumpedLock])), all('unchanged'));
  });

  await t.test('a pin that no release file matches is one problem for that module, which the selfcheck routine posts; the working version stays linked', () => {
    const badLock = join(work, 'bad.lock.json');
    writeFileSync(badLock, JSON.stringify(rows.map((row) => (row.module === 'tasks' ? { ...row, sha256: '0'.repeat(64) } : row))));
    const { envelope } = sync(home, ['--from', mirror, '--lock', badLock]);
    assert.equal(envelope.ok, true);
    assert.equal(statesOf(envelope).tasks, 'failed');
    const about = envelope.data.problems.filter((problem) => problem.startsWith('ambitious-tasks: '));
    assert.equal(about.length, 1);
    assert.match(about[0], /pinned checksum/u);
    assert.equal(readlinkSync(join(bin, 'ambitious-tasks')), rows.find((row) => row.module === 'tasks').url.split('/').at(-1));
  });

  await t.test('after every run above, the newer release\'s installer was still never run', () => {
    assert.equal(existsSync(marker), false);
  });

  await t.test('an installed module answers through its link in bin', () => {
    const answer = spawnSync(process.execPath, [join(bin, 'ambitious-tasks'), 'commands'], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
    assert.equal(JSON.parse(answer.stdout).module, 'tasks');
  });

  const audit = (command, input) => {
    const file = join(work, 'audit-input.json');
    if (input !== undefined) writeFileSync(file, JSON.stringify(input));
    const answer = spawnSync(process.execPath, [join(bin, 'ambitious-audit'), ...command, ...(input === undefined ? [] : ['--in', file])], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
    return JSON.parse(answer.stdout);
  };
  const inputSchema = (...command) => {
    const answer = audit(['schema', ...command]);
    assert.equal(answer.ok, true, JSON.stringify(answer.errors));
    return answer.data.schema;
  };
  const skillText = (name) => readFileSync(join(templateRoot, 'skills', name, 'SKILL.md'), 'utf8');
  const named = (text, values, where) => {
    for (const value of values) assert(text.includes(`\`${value}\``), `${where} must name \`${value}\`, which the pinned audit module's schema lists`);
  };
  const shapeOfSchema = (schema) => {
    const [fields, values] = [{}, {}];
    const walk = (node, path) => {
      const at = node.$ref === undefined ? node : schema.$defs[node.$ref.slice('#/$defs/'.length)];
      if (at.enum !== undefined) values[path] = at.enum.map(String);
      if (Object.hasOwn(at, 'const')) values[path] = [String(at.const)];
      if (at.items !== undefined) walk(at.items, `${path}[]`);
      if (at.properties === undefined) return;
      const required = at.required ?? [];
      fields[path] = { required, optional: Object.keys(at.properties).filter((name) => !required.includes(name)) };
      for (const [name, child] of Object.entries(at.properties)) walk(child, path === '' ? name : `${path}.${name}`);
    };
    walk(schema, '');
    return { fields, values };
  };
  const VALUES_HEADING = 'These fields take only the values listed:';
  const shapeInSkill = (text) => {
    const section = text.split('\n## ').find((part) => part.startsWith('Fields\n')) ?? '';
    const quoted = (line) => [...line.matchAll(/`([^`]+)`/gu)].map(([, name]) => name);
    const lists = (block) =>
      block.split('\n').filter((line) => line.startsWith('- ')).flatMap((line) => {
        const colon = line.indexOf(': ');
        const head = line.slice(2, colon);
        return (head === 'The document' ? [''] : quoted(head)).map((path) => [path, line.slice(colon + 2)]);
      });
    const [fieldLists, valueLists = ''] = section.split(VALUES_HEADING);
    return {
      fields: Object.fromEntries(lists(fieldLists).map(([path, list]) => {
        const [required, optional = ''] = list.split('; optional ');
        return [path, { required: quoted(required), optional: quoted(optional) }];
      })),
      values: Object.fromEntries(lists(valueLists).map(([path, list]) => [path, quoted(list)])),
    };
  };
  const jsonBlocks = (text) => [...text.matchAll(/```json\n([\s\S]*?)\n```/gu)].map(([, block]) => JSON.parse(block));
  const probeFixture = (role) => readJson(join(home, 'template', 'fixtures', 'ambitious-capability-probe', `${role}.expected.json`));

  await t.test('the audit skills name exactly the signals, values, limits and commands that the pinned audit module\'s schema command prints', () => {
    assert.equal(audit(['commands']).meta.version, rows.find((row) => row.module === 'audit').version);
    const collector = inputSchema();
    assert.deepEqual(collector, inputSchema('snapshot'), 'schema alone prints the collector schema');
    const defs = collector.$defs;
    const signals = defs.visibilityEntry.properties.signal.enum;
    assert.equal(defs.visibility.minItems, signals.length);
    assert.equal(defs.visibility.maxItems, signals.length);

    const collectorSkill = skillText('ambitious-audit-collector');
    const probeSkill = skillText('ambitious-capability-probe');
    const signalsIn = (text, pattern) => [...(pattern.exec(text)?.[1] ?? text).matchAll(/`([A-Za-z]+)`/gu)].map(([, signal]) => signal);
    assert.deepEqual(signalsIn(collectorSkill, /exactly one entry for each of (.+?)\. /u), signals);
    assert.deepEqual([...probeSkill.matchAll(/^\| `([A-Za-z]+)` \| /gmu)].map(([, signal]) => signal), signals);
    for (const role of ['owner', 'guest', 'role-unknown']) assert.deepEqual(probeFixture(role).map(({ signal }) => signal), signals, `${role} fixture`);

    for (const group of ['tasks', 'pages']) named(collectorSkill, collector.properties[group].required.map((field) => `${group}.${field}`), 'ambitious-audit-collector');
    named(probeSkill, collector.properties.account.properties.kind.enum, 'ambitious-capability-probe');
    for (const unit of defs.usage.properties.unit.enum) assert(collectorSkill.includes(`"unit": "${unit}"`), `ambitious-audit-collector must show usage in ${unit}`);
    assert(defs.usage.type.includes('null') && defs.lastSeen.type.includes('null'));
    assert.match(defs.lastSeen.pattern, /never/u);
    named(collectorSkill, ['never', 'source'], 'ambitious-audit-collector');
    assert(defs.evidence.required.includes('source'));
    assert(collectorSkill.includes(`evidence text is at most ${defs.evidence.properties.text.maxLength} characters`));

    const routine = skillText('ambitious-snapshot-routine');
    const feedback = skillText('ambitious-send-feedback');
    const commands = audit(['schema']).data.commands;
    assert.deepEqual(commands, ['snapshot', 'baseline set', 'diff', 'findings', 'recommend', 'report build', 'report mark', 'feedback build']);
    named(routine, commands.filter((command) => command !== 'feedback build'), 'ambitious-snapshot-routine');
    assert(feedback.includes('ambitious-audit feedback build --in'));
    const build = inputSchema('report', 'build');
    assert.deepEqual(build.required, ['snapshotId', 'reviewRequired']);
    named(routine, ['reviewRequired'], 'ambitious-snapshot-routine');
    const mark = inputSchema('report', 'mark');
    assert.deepEqual(mark.required, ['reportId', 'state', 'at']);
    named(routine, [...mark.properties.state.enum, 'reportId', 'at'], 'ambitious-snapshot-routine');
    const note = inputSchema('feedback', 'build');
    assert.deepEqual(note.required, ['text', 'from']);
    assert.deepEqual(Object.keys(note.properties), ['reportId', 'text', 'from']);
    named(feedback, ['reportId', 'text'], 'ambitious-send-feedback');
    for (const from of note.properties.from.enum) assert(feedback.includes(`"${from}"`), `ambitious-send-feedback must name the sender "${from}"`);
    assert(feedback.includes(`at most ${note.properties.text.maxLength} characters`));
  });

  await t.test('the field lists in the collector skill are exactly the objects, required and optional fields, and allowed values that the pinned audit module\'s collector schema holds', () => {
    const inSchema = shapeOfSchema(inputSchema());
    const collectorSkill = skillText('ambitious-audit-collector');
    const inSkill = shapeInSkill(collectorSkill);
    assert.deepEqual(Object.keys(inSkill.fields).sort(), Object.keys(inSchema.fields).sort(), 'the collector skill must have one field list for each object in the schema');
    for (const [path, listed] of Object.entries(inSchema.fields)) assert.deepEqual(inSkill.fields[path], listed, `the collector skill's field list for ${path === '' ? 'the document' : path} must be the schema's`);
    assert.deepEqual(inSkill.values, inSchema.values, 'the collector skill must list the allowed values of every field the schema restricts');

    assert(inSchema.fields['evidence[]'].required.includes('kind') && inSchema.values['evidence[].kind'].length > 0, 'the schema walk reaches fields behind a list and a reference');
    assert.notDeepEqual(shapeInSkill(collectorSkill.replace('`id`, `kind`, `text`', '`id`, `text`')).fields, inSchema.fields, 'a field list that omits a required field is caught');
    assert.notDeepEqual(shapeInSkill(collectorSkill.replace('`excerpt`, `count`', '`excerpt`')).values, inSchema.values, 'a value list that omits an allowed value is caught');
  });

  await t.test('the two examples in the collector skill are accepted as written: the document with nothing observed and an unknown role, and the evidence entry once it is added to that document', () => {
    const [entry, nothingObserved, ...rest] = jsonBlocks(skillText('ambitious-audit-collector'));
    assert.deepEqual(rest, []);
    assert.equal(nothingObserved.account.kind, 'unknown');
    assert.deepEqual([nothingObserved.bots, nothingObserved.routines, nothingObserved.connectors, nothingObserved.evidence], [[], [], [], []]);
    assert.deepEqual([...Object.values(nothingObserved.tasks), ...Object.values(nothingObserved.pages)], [null, null, null, null, null]);
    assert.deepEqual(nothingObserved.visibility.map(({ seen }) => seen), nothingObserved.visibility.map(() => false));

    const snapshot = audit(['snapshot'], nothingObserved);
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot.errors));
    assert.equal(audit(['findings'], { snapshotId: snapshot.data.snapshotId }).data.mode, 'partial');

    const withEvidence = audit(['snapshot'], { ...nothingObserved, evidence: [entry] });
    assert.equal(withEvidence.ok, true, JSON.stringify(withEvidence.errors));
    const { kind: _kind, ...withoutKind } = entry;
    const refused = audit(['snapshot'], { ...nothingObserved, evidence: [withoutKind] });
    assert.equal(refused.ok, false);
    assert.match(refused.errors.map(({ message }) => message).join(' '), /\/evidence\/0\/kind is required/u);
  });

  const collected = (role) => {
    const visibility = probeFixture(role);
    const seen = Object.fromEntries(visibility.map((entry) => [entry.signal, entry.seen]));
    const usage = seen.usage ? { unit: 'credits', amount7d: 12 } : null;
    return {
      schemaVersion: 1,
      collectedAt: '2026-01-08T00:00:00Z',
      account: { kind: seen.accountRole ? role : 'unknown', label: 'Example account' },
      bots: [{ id: 'bot-1', name: 'First bot', lastActiveAt: seen.botActivity ? 'never' : null, routineCount: seen.routines ? 1 : null, usage }],
      routines: [{ id: 'routine-1', botId: 'bot-1', schedule: 'every day at 7:00 AM', state: 'failing', lastRunAt: seen.routines ? '2026-01-07T07:00:00Z' : null, usage, lastError: 'The connector needs to be signed in again.' }],
      connectors: [{ name: 'documents', status: 'needsGrant' }],
      tasks: seen.tasks ? { open: 4, stale7d: 2, blocked: 0 } : { open: null, stale7d: null, blocked: null },
      pages: seen.pages ? { count: 3, updated7d: 0 } : { count: null, updated7d: null },
      visibility,
      evidence: [
        { id: 'ev-1', kind: 'excerpt', text: 'The connector needs to be signed in again.', source: 'routine-1' },
        { id: 'ev-2', kind: 'count', text: '2 open tasks have not changed in 7 days.', source: 'tasks' },
      ],
    };
  };

  for (const role of ['owner', 'guest', 'role-unknown']) {
    await t.test(`a collector document written the way the audit skills say, with the installed ${role} fixture as its visibility, runs through the pinned audit module from snapshot to a report that waits for review`, () => {
      const document = collected(role);
      const unseen = document.visibility.filter(({ seen }) => !seen).map(({ signal }) => signal);
      const snapshot = audit(['snapshot'], document);
      assert.equal(snapshot.ok, true, JSON.stringify(snapshot.errors));
      const id = { snapshotId: snapshot.data.snapshotId };
      assert.deepEqual(snapshot.data.normalized.pages, document.pages, 'an unseen count stays null');

      const mode = role === 'role-unknown' ? 'partial' : 'full';
      const findings = audit(['findings'], id);
      assert.equal(findings.data.mode, mode);
      assert.deepEqual([...new Set(findings.data.findings.map(({ kind }) => kind))].sort(), ['rule', 'visibility']);
      assert.equal(findings.data.findings.filter(({ kind }) => kind === 'visibility').length, unseen.length, 'one visibility finding for each unseen signal');
      const withheld = findings.data.findings.filter((finding) => finding.withheld !== undefined);
      assert.equal(withheld.length > 0, mode === 'partial', 'findings are marked withheld only when the role is unknown');

      const advice = audit(['recommend'], id);
      assert.equal(advice.data.mode, mode);
      assert(advice.data.recommendations.length >= 1 && advice.data.recommendations.length <= 3);
      for (const recommendation of advice.data.recommendations) {
        assert.deepEqual(Object.keys(recommendation).sort(), ['effort', 'evidenceIds', 'id', 'title', 'why']);
        assert(recommendation.evidenceIds.length > 0);
      }
      assert.deepEqual(advice.data.withheld, withheld.map(({ ruleId }) => ruleId));

      assert.equal(audit(['baseline', 'set'], id).ok, true);
      assert.deepEqual(audit(['diff'], { to: id.snapshotId }).data.changes, []);

      const report = audit(['report', 'build'], { ...id, reviewRequired: true });
      assert.equal(report.ok, true, JSON.stringify(report.errors));
      assert.deepEqual(report.data.next, { kind: 'waitForReview', reportId: report.data.reportId });
      const { payload } = report.data;
      assert.equal(payload.accountKind, document.account.kind);
      assert.deepEqual(payload.moduleVersions, { audit: rows.find((row) => row.module === 'audit').version });
      assert.deepEqual(payload.counts.pages, document.pages);
      assert.deepEqual(payload.counts.tasks, document.tasks);
      assert.deepEqual(payload.visibility.filter(({ seen }) => !seen).map(({ signal }) => signal), unseen);
      assert.equal(Object.hasOwn(payload, 'organisationId') || Object.hasOwn(payload, 'organizationId'), false);
      const reviewed = audit(['report', 'mark'], { reportId: report.data.reportId, state: 'reviewed', at: '2026-01-08T00:05:00Z' });
      assert.equal(reviewed.ok, true, JSON.stringify(reviewed.errors));
      assert.equal(reviewed.data.next.kind, 'send');
    });
  }

  await t.test('the pinned audit module refuses what the skills rule out: the four signals of an earlier version, an unseen value marked as seen, a guessed role and evidence without a source', () => {
    const refusal = (document) => {
      const answer = audit(['snapshot'], document);
      assert.equal(answer.ok, false);
      for (const error of answer.errors) assert.equal(error.code, 'E_INPUT_SCHEMA');
      return answer.errors.map(({ message }) => message).join(' ');
    };
    const owner = collected('owner');
    assert.match(refusal({ ...owner, visibility: owner.visibility.slice(0, 4) }), /\/visibility must have one entry whose signal is "accountRole"/u);
    assert.match(refusal({ ...owner, pages: { count: null, updated7d: 0 } }), /\/visibility\/6\/seen must be false, because \/pages\/count is null/u);
    assert.match(refusal({ ...collected('role-unknown'), account: { kind: 'owner', label: 'Example account' } }), /\/visibility\/4\/seen|\/account\/kind/u);
    assert.match(refusal({ ...owner, evidence: [{ id: 'ev-1', kind: 'excerpt', text: 'No source.' }] }), /\/evidence\/0\/source is required/u);
  });

  await t.test('the feedback document the ambitious-send-feedback skill describes builds a payload with no organisation id', () => {
    const answer = audit(['feedback', 'build'], { text: 'The weekly report is useful.', from: 'customer' });
    assert.equal(answer.ok, true, JSON.stringify(answer.errors));
    assert.equal(answer.data.payload.text, 'The weekly report is useful.');
    assert.equal(Object.keys(answer.data.payload).some((key) => /organi[sz]ation/iu.test(key)), false);
  });
});
