import process from 'node:process';
import test from 'ava';
import {isWsl, canAccessPowerShell, wslDefaultBrowser} from './index.js';

test('isWsl', t => {
	t.false(isWsl);
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
