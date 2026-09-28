/* eslint-disable node-test/no-conditional-assertion, node-test/prefer-test-context-assert -- Each platform branch below is the environment the test is meant to run on, so the guarded assertion is exactly what should be checked there. `t.assert` is not portable across the supported Node.js range, so the imported `assert` is the one that must be used. */
import process from 'node:process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMountPointFromConfig} from './utilities.js';
import {
	isWsl,
	canAccessPowerShell,
	wslDefaultBrowser,
	wslDrivesMountPoint,
	isUncPath,
	convertWslPathToWindows,
	convertWindowsPathToWsl,
} from './index.js';

test('isWsl', () => {
	assert.equal(isWsl, false);
});

test('wslDrivesMountPoint', async () => {
	const result = await wslDrivesMountPoint();
	assert.equal(typeof result, 'string');
	assert.equal(result.endsWith('/'), true);
	assert.equal(result.includes('"'), false);
	assert.equal(result.includes('\''), false);
});

test('parseMountPointFromConfig', () => {
	// Basic values
	assert.equal(parseMountPointFromConfig('[automount]\nroot = /mnt/'), '/mnt/');
	assert.equal(parseMountPointFromConfig('[automount]\nroot=/'), '/');
	assert.equal(parseMountPointFromConfig('root = /custom/path'), '/custom/path');

	// Quoted values
	assert.equal(parseMountPointFromConfig('root = "/"'), '/');
	assert.equal(parseMountPointFromConfig('root = \'/\''), '/');
	assert.equal(parseMountPointFromConfig('root = "/mnt/"'), '/mnt/');

	// Inline comments
	assert.equal(parseMountPointFromConfig('root = /mnt/ # comment'), '/mnt/');
	assert.equal(parseMountPointFromConfig('root = "/" # comment'), '/');
	assert.equal(parseMountPointFromConfig('root = \'/\' # comment'), '/');

	// Full-line comments (should be ignored)
	assert.equal(parseMountPointFromConfig('# root = /foo/\nroot = /bar/'), '/bar/');

	// No match
	assert.equal(parseMountPointFromConfig('[automount]'), undefined);
	assert.equal(parseMountPointFromConfig('# root = /foo/'), undefined);
});

test('canAccessPowerShell', async () => {
	const result = await canAccessPowerShell();
	assert.equal(typeof result, 'boolean');
	// On non-Windows systems, this should return false
	if (!isWsl && process.platform !== 'win32') {
		assert.equal(result, false);
	}
});

test('wslDefaultBrowser', async t => {
	// Only test on WSL
	if (!isWsl) {
		t.skip('Skipping test on non-WSL system');
		return;
	}

	const progId = await wslDefaultBrowser();
	assert.equal(typeof progId, 'string');
	// ProgID should be non-empty on WSL
	assert.equal(progId.length > 0, true);
});

test('isUncPath', () => {
	assert.equal(isUncPath(String.raw`\\wsl.localhost\Ubuntu`), true);
	assert.equal(isUncPath(String.raw`\\wsl$\Ubuntu`), true);
	assert.equal(isUncPath(String.raw`\\server\share`), true);
	assert.equal(isUncPath(String.raw`C:\Users\file.txt`), false);
	assert.equal(isUncPath('/home/user'), false);
	assert.equal(isUncPath(''), false);
});

test('convertWindowsPathToWsl', async () => {
	// On non-WSL systems, wslpath fails and returns original path
	const singlePath = String.raw`C:\Users\file.txt`;
	const result = await convertWindowsPathToWsl(singlePath);
	assert.equal(typeof result, 'string');

	// Array input should return array
	const paths = [String.raw`C:\Users\file.txt`, String.raw`D:\Projects`];
	const results = await convertWindowsPathToWsl(paths);
	assert.equal(Array.isArray(results), true);
	assert.equal(results.length, 2);
});

// Put a fake `wslpath` on `PATH` that, like the real one, only accepts a single path and treats a leading `-` as an option unless it comes after `--`.
const useFakeWslpath = async t => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wsl-utils-'));

	const script = [
		'#!/bin/sh',
		'flag="$1"',
		'shift',
		'case "$1" in',
		'\t--) shift ;;',
		'\t-*) echo "Invalid command line argument: $1" >&2; exit 1 ;;',
		'esac',
		'if [ "$#" -ne 1 ]; then',
		'\techo "Invalid command line argument: $2" >&2',
		'\texit 1',
		'fi',
		String.raw`printf '%s:%s\n' "$flag" "$1"`,
	].join('\n');

	await fs.writeFile(path.join(directory, 'wslpath'), `${script}\n`, {mode: 0o755});

	const originalPath = process.env.PATH;
	process.env.PATH = `${directory}${path.delimiter}${originalPath}`;

	t.after(async () => {
		process.env.PATH = originalPath;
		await fs.rm(directory, {recursive: true, force: true});
	});
};

test('convertWslPathToWindows converts each path in an array', async t => {
	await useFakeWslpath(t);
	assert.equal(await convertWslPathToWindows('/home'), '-aw:/home');
	assert.deepEqual(await convertWslPathToWindows(['/home', 'https://example.com', '/tmp']), ['-aw:/home', 'https://example.com', '-aw:/tmp']);
});

test('convertWslPathToWindows converts a path starting with a dash', async t => {
	await useFakeWslpath(t);
	assert.equal(await convertWslPathToWindows('-foo'), '-aw:-foo');
});

test('convertWindowsPathToWsl converts each path in an array', async t => {
	await useFakeWslpath(t);
	assert.equal(await convertWindowsPathToWsl(String.raw`C:\Windows`), String.raw`-u:C:\Windows`);
	assert.deepEqual(await convertWindowsPathToWsl([String.raw`C:\Windows`, String.raw`C:\Users`]), [String.raw`-u:C:\Windows`, String.raw`-u:C:\Users`]);
});
