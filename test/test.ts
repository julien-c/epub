import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EPub } from "../epub.ts";

describe("EPub", () => {
	it("init", () => {
		const epub = new EPub("./example/alice.epub");
		assert.strictEqual(epub.imageroot, "/images/");
	});

	it("basic parsing", async () => {
		const epub = new EPub("./example/alice.epub");

		await epub.parse();

		assert.ok(epub.metadata.title);
		assert.equal(epub.metadata.title, "Alice's Adventures in Wonderland");

		assert.equal(epub.toc.length, 14);

		assert.ok(epub.toc[3].level);
		assert.ok(epub.toc[3].order);
		assert.ok(epub.toc[3].title);
		assert.ok(epub.toc[3].href);
		assert.ok(epub.toc[3].id);

		assert.strictEqual(epub.imageroot, "/images/");
	});

	it("supports empty chapters", () => {
		const branch = [{ navLabel: { text: "" } }];
		const epub = new EPub();
		const res = epub.walkNavMap(branch, [], {});
		assert.ok(res);
	});

	it("raises descriptive errors", async () => {
		const epub = new EPub("./example/alice_broken.epub");

		try {
			await epub.parse();
		} catch (err) {
			assert.ok((err as Error).message.includes("Parsing container XML failed"));
			return;
		}
		assert.fail("should not get here");
	});
});
