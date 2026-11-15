import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildInstaller, gh, ghSignedIn, lock, NO_GH, releaseOf, sha256, sync } from './support.mjs';

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
  });

  await t.test('a second run changes nothing', () => {
    assert.deepEqual(statesOf(run()), all('unchanged'));
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
    assert.equal(readlinkSync(join(bin, 'ambitious-records')), 'ambitious-records-0.1.0.mjs');
  });

  const bumpedLock = join(work, 'bumped.lock.json');
  await t.test('a lock row moved to a newer version upgrades that module and keeps the old file', () => {
    const fixture = Buffer.concat([readFileSync(fileOf('contracts')), Buffer.from('\n')]);
    mkdirSync(join(mirror, 'contracts-v0.1.1'));
    writeFileSync(join(mirror, 'contracts-v0.1.1', 'ambitious-contracts-0.1.1.mjs'), fixture);
    writeFileSync(join(mirror, 'contracts-v0.1.1', 'SHA256SUMS'), `${sha256(fixture)}  ambitious-contracts-0.1.1.mjs\n`);
    const bumped = rows.map((row) =>
      row.module === 'contracts' ? { ...row, version: '0.1.1', url: row.url.replaceAll('0.1.0', '0.1.1'), sha256: sha256(fixture) } : row,
    );
    writeFileSync(bumpedLock, JSON.stringify(bumped));
    const envelope = run(['--lock', bumpedLock]);
    assert.deepEqual(statesOf(envelope), all('unchanged', { contracts: 'upgraded' }));
    assert.equal(envelope.data.modules.find(({ module }) => module === 'contracts').version, '0.1.1');
    assert.equal(readlinkSync(join(bin, 'ambitious-contracts')), 'ambitious-contracts-0.1.1.mjs');
    assert(existsSync(fileOf('contracts')), 'the old version stays beside the new one');
  });

  await t.test('after the upgrade a further run changes nothing', () => {
    assert.deepEqual(statesOf(run(['--lock', bumpedLock])), all('unchanged'));
  });

  await t.test('an installed module answers through its link in bin', () => {
    const answer = spawnSync(process.execPath, [join(bin, 'ambitious-tasks'), 'commands'], { encoding: 'utf8', env: { ...process.env, AMBITIOUS_HOME: home } });
    assert.equal(JSON.parse(answer.stdout).module, 'tasks');
  });
});
