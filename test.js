import process from 'node:process';
import test from 'ava';
import {parseMountPointFromConfig} from './utilities.js';
import {
	isWsl,
	canAccessPowerShell,
	wslDefaultBrowser,
	wslDrivesMountPoint,
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
