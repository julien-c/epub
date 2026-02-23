var EPub = require("../epub");

async function main() {
	var epub = new EPub("alice.epub", "/imagewebroot/", "/articlewebroot/");

	await epub.parse();

	console.log("METADATA:\n");
	console.log(epub.metadata);

	console.log("\nSPINE:\n");
	console.log(epub.flow);

	console.log("\nTOC:\n");
	console.log(epub.toc);

	// get first chapter
	var data = await epub.getChapter(epub.spine.contents[0].id);
	console.log("\nFIRST CHAPTER:\n");
	console.log(data.substr(0, 512) + "..."); // first 512 bytes
}

main();
