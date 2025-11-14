import process from 'node:process';
import test from 'ava';
import {isWsl, canAccessPowerShell} from './index.js';

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
