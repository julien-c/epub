#!/usr/bin/env node --experimental-strip-types

import { EPub } from "./epub.ts";

const file = process.argv[2];
if (!file) {
	console.error("Usage: epub <file.epub>");
	process.exit(1);
}

const epub = new EPub(file);
await epub.parse();

console.log("Metadata:");
for (const [key, value] of Object.entries(epub.metadata)) {
	if (value) {
		console.log(`  ${key}: ${value}`);
	}
}

console.log("\nTable of Contents:");
for (const entry of epub.toc) {
	const indent = "  ".repeat(entry.level + 1);
	console.log(`${indent}${entry.title}`);
}

console.log("\n---\n");
for (const chapter of epub.flow) {
	try {
		const text = await epub.getChapter(chapter.id);
		console.log(text);
		console.log("\n---\n");
	} catch {
		// skip non-chapter files (images, css, etc.)
	}
}
