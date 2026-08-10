#!/usr/bin/env node
/**
 * scripts/patch-pyodide-lock.cjs
 *
 * Patches public/pyodide-314.0.0a1/pyodide-lock.json after extracting the
 * upstream tarball. The alpha tarball (314.0.0a1) ships a numpy lock entry
 * that references pyemscripten_2026_0_wasm32.whl, but only the
 * pyodide_2026_0_wasm32.whl variant is present in the distribution.
 *
 * Package patched : numpy
 * Reason          : Upstream alpha lock-file inconsistency — the file_name
 *                   field references a wheel that is absent; only the
 *                   pyodide_ (not pyemscripten_) platform variant is present.
 * Original file_name  : numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl
 * Patched  file_name  : numpy-2.4.3-cp314-cp314-pyodide_2026_0_wasm32.whl
 * Original sha256 : a1a613dc4332db26c4f049ccde6b84749453c0c8cb78f589f2840fae2a0fee5d
 * Patched  sha256 : 0608c7657d32cc30896b884a15fb0607a5eacca968bc532fad36a57f4a603ecb
 *
 * Note: an earlier (Round 6b) version of this script wrote
 *   9c37baca62a54611f4f42856894063598eeb7241049399d39596d1b64f5af1ef
 * as the patched SHA — that value did NOT match the actual numpy wheel and
 * was corrected in Round 7b Session B (2026-05-11) to the value above.
 * Pyodide does not validate the in-lock SHA against the on-disk wheel
 * at runtime when bytes are loaded from a local URL, which is why the
 * mismatch went undetected until the integrity test was added.
 *
 * This patch becomes OBSOLETE in the next stable Pyodide release (0.30.x+)
 * when the upstream lock file is consistent with the distributed wheels.
 * When upgrading Pyodide, verify that pyodide-lock.json points to files that
 * actually exist in the tarball before applying or removing this patch.
 *
 * Usage:
 *   node scripts/patch-pyodide-lock.cjs
 *
 * After re-extracting the tarball:
 *   tar -xjf pyodide-314.0.0a1.tar.bz2 -C public/
 *   node scripts/patch-pyodide-lock.cjs
 */

'use strict';
const fs = require('fs');
const path = require('path');

const LOCK_PATH = path.resolve(__dirname, '../public/pyodide-314.0.0a1/pyodide-lock.json');

const ORIGINAL_FILE_NAME = 'numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl';
const ORIGINAL_SHA256 = 'a1a613dc4332db26c4f049ccde6b84749453c0c8cb78f589f2840fae2a0fee5d';

const PATCHED_FILE_NAME = 'numpy-2.4.3-cp314-cp314-pyodide_2026_0_wasm32.whl';
const PATCHED_SHA256 = '0608c7657d32cc30896b884a15fb0607a5eacca968bc532fad36a57f4a603ecb';
const FONTTOOLS_FILE_NAME = 'fonttools-4.62.1-py3-none-any.whl';
const FONTTOOLS_SHA256 = '7487782e2113861f4ddcc07c3436450659e3caa5e470b27dc2177cade2d8e7fd';

if (!fs.existsSync(LOCK_PATH)) {
  console.error(`ERROR: Lock file not found: ${LOCK_PATH}`);
  console.error('  Have you extracted the Pyodide tarball? See public/pyodide-314.0.0a1/README.md');
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
const numpyEntry = lock.packages?.numpy;
const fonttoolsEntry = lock.packages?.fonttools;

if (!numpyEntry) {
  console.error('ERROR: numpy entry not found in pyodide-lock.json');
  process.exit(1);
}

if (!fonttoolsEntry) {
  console.error('ERROR: fonttools entry not found in pyodide-lock.json');
  process.exit(1);
}

const currentFileName = numpyEntry.file_name;
const currentSha256 = numpyEntry.sha256;
let changed = false;

if (fonttoolsEntry.file_name !== FONTTOOLS_FILE_NAME) {
  console.error('ERROR: fonttools entry in pyodide-lock.json has unexpected file_name:');
  console.error(`  file_name : ${fonttoolsEntry.file_name}`);
  console.error(`  expected  : ${FONTTOOLS_FILE_NAME}`);
  process.exit(1);
}

if (fonttoolsEntry.sha256 !== FONTTOOLS_SHA256) {
  lock.packages.fonttools.sha256 = FONTTOOLS_SHA256;
  changed = true;
  console.log(`Patched pyodide-lock.json fonttools sha256:`);
  console.log(`  sha256:   ${fonttoolsEntry.sha256}`);
  console.log(`          -> ${FONTTOOLS_SHA256}`);
}

// Check: already patched?
if (currentFileName === PATCHED_FILE_NAME && currentSha256 === PATCHED_SHA256) {
  if (changed) {
    fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2), 'utf8');
    process.exit(0);
  }
  console.log('pyodide-lock.json is already patched. Nothing to do.');
  process.exit(0);
}

// Check: unpatched (original upstream state) → apply patch
if (currentFileName === ORIGINAL_FILE_NAME && currentSha256 === ORIGINAL_SHA256) {
  lock.packages.numpy.file_name = PATCHED_FILE_NAME;
  lock.packages.numpy.sha256 = PATCHED_SHA256;
  fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2), 'utf8');
  console.log(`Patched pyodide-lock.json numpy entry:`);
  console.log(`  file_name: ${ORIGINAL_FILE_NAME}`);
  console.log(`          → ${PATCHED_FILE_NAME}`);
  console.log(`  sha256:   ${ORIGINAL_SHA256}`);
  console.log(`          → ${PATCHED_SHA256}`);
  process.exit(0);
}

// Neither original nor patched — something unexpected
console.error('ERROR: numpy entry in pyodide-lock.json has unexpected values:');
console.error(`  file_name : ${currentFileName}`);
console.error(`  sha256    : ${currentSha256}`);
console.error('Cannot safely patch. Manual inspection required.');
process.exit(1);
