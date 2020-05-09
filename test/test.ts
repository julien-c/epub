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

		epub.on('end', ()=> {
			assert.ok(epub.metadata.title)
			assert.equal(epub.metadata.title, "Alice's Adventures in Wonderland")
		})

		epub.parse();

		assert.strictEqual(
			epub.imageroot,
			`/images/`
		);
	});

	mocha.it('supports empty chapters', () => {
		var branch = [{navLabel: { text: '' }}];
		const epub = new EPub();
		var res = epub.walkNavMap(branch, [], []);
		assert.ok(res);
	});

	mocha.it('raises descriptive errors', () => {
		// const epub = new EPub('./example/alice.epub')
		const epub = new EPub('./example/alice_broken.epub')

		epub.on('error', (err) => {
			assert.ok(err.message.includes('Error: Parsing container XML failed in TOC Error: Invalid character in entity name'))
		})

		epub.on('end', () => {
			assert.fail('should not have gotten here')
		})

		epub.parse()
	})
});
