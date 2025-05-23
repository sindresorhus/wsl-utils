import test from 'ava';
import {isWsl} from './index.js';

test('isWsl', t => {
	t.false(isWsl);
});
