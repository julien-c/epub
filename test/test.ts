import * as assert from 'assert';
import * as mocha from 'mocha';
const EPub = require('../../epub');

mocha.describe('EPub', () => {
	mocha.it('init', () => {
		const epub = new EPub('./example/alice.epub');
		assert.strictEqual(
			epub.imageroot,
			`/images/`
		);
	});
	
	mocha.it('basic parsing', () => {
		const epub = new EPub('./example/alice.epub');
		epub.parse();
		
		assert.strictEqual(
			epub.imageroot,
			`/images/`
		);
	});
});
