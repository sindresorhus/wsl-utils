import process from 'node:process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
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

test('isWsl', t => {
	t.false(isWsl);
});

test('wslDrivesMountPoint', async t => {
	const result = await wslDrivesMountPoint();
	t.is(typeof result, 'string');
	t.true(result.endsWith('/'));
	t.false(result.includes('"'));
	t.false(result.includes('\''));
});

test('parseMountPointFromConfig', t => {
	// Basic values
	t.is(parseMountPointFromConfig('[automount]\nroot = /mnt/'), '/mnt/');
	t.is(parseMountPointFromConfig('[automount]\nroot=/'), '/');
	t.is(parseMountPointFromConfig('root = /custom/path'), '/custom/path');

	// Quoted values
	t.is(parseMountPointFromConfig('root = "/"'), '/');
	t.is(parseMountPointFromConfig('root = \'/\''), '/');
	t.is(parseMountPointFromConfig('root = "/mnt/"'), '/mnt/');

	// Inline comments
	t.is(parseMountPointFromConfig('root = /mnt/ # comment'), '/mnt/');
	t.is(parseMountPointFromConfig('root = "/" # comment'), '/');
	t.is(parseMountPointFromConfig('root = \'/\' # comment'), '/');

	// Full-line comments (should be ignored)
	t.is(parseMountPointFromConfig('# root = /foo/\nroot = /bar/'), '/bar/');

	// No match
	t.is(parseMountPointFromConfig('[automount]'), undefined);
	t.is(parseMountPointFromConfig('# root = /foo/'), undefined);
});

test('canAccessPowerShell', async t => {
	const result = await canAccessPowerShell();
	t.is(typeof result, 'boolean');
	// On non-Windows systems, this should return false
	if (process.platform !== 'win32' && !isWsl) {
		t.false(result);
	}
});

test('wslDefaultBrowser', async t => {
	// Only test on WSL
	if (!isWsl) {
		t.pass('Skipping test on non-WSL system');
		return;
	}

	const progId = await wslDefaultBrowser();
	t.is(typeof progId, 'string');
	// ProgID should be non-empty on WSL
	t.true(progId.length > 0);
});

test('isUncPath', t => {
	t.true(isUncPath(String.raw`\\wsl.localhost\Ubuntu`));
	t.true(isUncPath(String.raw`\\wsl$\Ubuntu`));
	t.true(isUncPath(String.raw`\\server\share`));
	t.false(isUncPath(String.raw`C:\Users\file.txt`));
	t.false(isUncPath('/home/user'));
	t.false(isUncPath(''));
});

test('convertWindowsPathToWsl', async t => {
	// On non-WSL systems, wslpath fails and returns original path
	const singlePath = String.raw`C:\Users\file.txt`;
	const result = await convertWindowsPathToWsl(singlePath);
	t.is(typeof result, 'string');

	// Array input should return array
	const paths = [String.raw`C:\Users\file.txt`, String.raw`D:\Projects`];
	const results = await convertWindowsPathToWsl(paths);
	t.true(Array.isArray(results));
	t.is(results.length, 2);
});

// Put a fake `wslpath` on `PATH` that, like the real one, only accepts a single path and treats a leading `-` as an option unless it comes after `--`. Tests that use it must be serial, as `PATH` is global.
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

	t.teardown(async () => {
		process.env.PATH = originalPath;
		await fs.rm(directory, {recursive: true, force: true});
	});
};

test.serial('convertWslPathToWindows converts each path in an array', async t => {
	await useFakeWslpath(t);
	t.is(await convertWslPathToWindows('/home'), '-aw:/home');
	t.deepEqual(await convertWslPathToWindows(['/home', 'https://example.com', '/tmp']), ['-aw:/home', 'https://example.com', '-aw:/tmp']);
});

test.serial('convertWslPathToWindows converts a path starting with a dash', async t => {
	await useFakeWslpath(t);
	t.is(await convertWslPathToWindows('-foo'), '-aw:-foo');
});

test.serial('convertWindowsPathToWsl converts each path in an array', async t => {
	await useFakeWslpath(t);
	t.is(await convertWindowsPathToWsl(String.raw`C:\Windows`), String.raw`-u:C:\Windows`);
	t.deepEqual(await convertWindowsPathToWsl([String.raw`C:\Windows`, String.raw`C:\Users`]), [String.raw`-u:C:\Windows`, String.raw`-u:C:\Users`]);
});
