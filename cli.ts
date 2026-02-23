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
		.replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

const arg = process.argv[2];
if (!arg) {
	console.error("Usage: epub <file.epub | url>");
	process.exit(1);
}

let input: string | ArrayBuffer;
if (arg.startsWith("http://") || arg.startsWith("https://")) {
	const res = await fetch(arg);
	if (!res.ok) {
		console.error(`Failed to download: ${res.status} ${res.statusText}`);
		process.exit(1);
	}
	input = await res.arrayBuffer();
} else {
	input = arg;
}

const epub = new EPub(input);
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
