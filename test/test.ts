import * as assert from 'assert';
import * as mocha from 'mocha';
import pEvent = require('p-event')

const EPub = require('../../epub');

mocha.describe('EPub', () => {
	mocha.it('init', () => {
		const epub = new EPub('./example/alice.epub');
		assert.strictEqual(
			epub.imageroot,
			`/images/`
		);
	});

	mocha.it('basic parsing', async () => {
		const epub = new EPub('./example/alice.epub');

		epub.parse()
		await pEvent(epub, 'end')

		assert.ok(epub.metadata.title)
		assert.equal(epub.metadata.title, "Alice's Adventures in Wonderland")

		assert.equal(epub.toc.length, 14)

		assert.ok(epub.toc[3].level)
		assert.ok(epub.toc[3].order)
		assert.ok(epub.toc[3].title)
		assert.ok(epub.toc[3].href)
		assert.ok(epub.toc[3].id)

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

	mocha.it('raises descriptive errors', async () => {
		const epub = new EPub('./example/alice_broken.epub')

		try {
			epub.parse()
			await pEvent(epub, 'end')
		} catch (err) {
			assert.ok(err.message.includes('Parsing container XML failed in TOC: Invalid character in entity name'))
			return
		}
		assert.fail('should not get here')
	})
});
