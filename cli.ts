#!/usr/bin/env node

import { EPub } from "./epub.ts";

function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<\/h[1-6]>/gi, "\n\n")
		.replace(/<\/div>/gi, "\n")
		.replace(/<\/li>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

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
		console.log(htmlToText(text));
		console.log("\n---\n");
	} catch {
		// skip non-chapter files (images, css, etc.)
	}
}
