import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import JSZip from "jszip";

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	ignoreDeclaration: true,
});

/**
 * Parse XML string, validate it, strip the root element, and return the children.
 */
function parseXml(xml: string): Record<string, unknown> {
	const validation = XMLValidator.validate(xml);
	if (validation !== true) {
		const e = validation.err;
		throw new Error(`${e.msg}\nLine: ${e.line}\nColumn: ${e.col}\nChar: `);
	}
	const raw = xmlParser.parse(xml) as Record<string, unknown>;
	// Strip root element (equivalent to xml2js explicitRoot: false)
	const keys = Object.keys(raw);
	if (keys.length === 1) {
		return raw[keys[0]] as Record<string, unknown>;
	}
	return raw;
}

/** Extract text content from a parsed XML value (string, or object with #text). */
function textOf(val: unknown): string {
	if (val == null) {
		return "";
	}
	if (typeof val === "string") {
		return val.trim();
	}
	if (typeof val === "number") {
		return String(val);
	}
	if (typeof val === "object" && "#text" in (val as object)) {
		return String((val as Record<string, unknown>)["#text"] ?? "").trim();
	}
	return "";
}

/** Extract all @_ prefixed attributes from a parsed element into a clean object. */
function attrsOf(obj: Record<string, unknown>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const key of Object.keys(obj)) {
		if (key.startsWith("@_")) {
			result[key.slice(2)] = String(obj[key]);
		}
	}
	return result;
}

/** Ensure value is an array. */
function asArray<T>(val: T | T[] | undefined): T[] {
	if (val == null) {
		return [];
	}
	return Array.isArray(val) ? val : [val];
}

export interface ManifestItem {
	id: string;
	href: string;
	"media-type": string;
	[key: string]: unknown;
}

export interface TocElement {
	level: number;
	order: number;
	title: string;
	id: string;
	href: string;
	"media-type"?: string;
	[key: string]: unknown;
}

export interface Metadata {
	creator: string;
	creatorFileAs: string;
	title: string;
	language: string;
	subject: string;
	subjects?: string[];
	date: string;
	description: string;
	publisher?: string;
	source?: string;
	UUID?: string;
	[key: string]: unknown;
}

function extractIdentifiers(val: unknown, out: Metadata): void {
	if (typeof val !== "object" || val == null) {
		return;
	}
	const obj = val as Record<string, unknown>;
	const scheme = obj["@_opf:scheme"] as string | undefined;
	const id = obj["@_id"] as string | undefined;
	const contents = textOf(obj);
	if (scheme) {
		(out as Record<string, unknown>)[scheme] = contents;
	} else if (id && id.match(/uuid/i)) {
		out.UUID = contents.replace("urn:uuid:", "").toUpperCase().trim();
	}
}

export class EPub {
	filename: string;
	imageroot: string;
	linkroot: string;

	metadata: Metadata = {} as Metadata;
	manifest: Record<string, ManifestItem> = {};
	guide: Record<string, string>[] = [];
	spine: { toc: ManifestItem | false; contents: ManifestItem[] } = {
		toc: false,
		contents: [],
	};
	flow: ManifestItem[] = [];
	toc: TocElement[] = [];
	version: string = "2.0";

	zip!: JSZip;
	containerFile: string | false = false;
	mimeFile: string | false = false;
	rootFile: string | false = false;

	constructor(fname: string, imageroot?: string, linkroot?: string) {
		this.filename = fname;

		this.imageroot = (imageroot || "/images/").trim();
		this.linkroot = (linkroot || "/links/").trim();

		if (!this.imageroot.endsWith("/")) {
			this.imageroot += "/";
		}
		if (!this.linkroot.endsWith("/")) {
			this.linkroot += "/";
		}
	}

	async parse(): Promise<void> {
		this.containerFile = false;
		this.mimeFile = false;
		this.rootFile = false;

		this.metadata = {} as Metadata;
		this.manifest = {};
		this.guide = [];
		this.spine = { toc: false, contents: [] };
		this.flow = [];
		this.toc = [];

		await this._open();
		await this._checkMimeType();
		await this._getRootFiles();
		const rootfileData = await this._handleRootFile();
		this._parseRootFile(rootfileData);

		if (this.spine.toc) {
			await this._parseTOC();
		}
	}

	private async _readFile(name: string): Promise<Buffer> {
		const file = this.zip.file(name);
		if (!file) {
			throw new Error(`Entry not found: ${name}`);
		}
		return file.async("nodebuffer");
	}

	private async _open(): Promise<void> {
		try {
			const buf = await readFile(this.filename);
			this.zip = await JSZip.loadAsync(buf);
		} catch {
			throw new Error("Invalid/missing file");
		}

		if (!Object.keys(this.zip.files).length) {
			throw new Error("No files in archive");
		}
	}

	private async _checkMimeType(): Promise<void> {
		for (const name of Object.keys(this.zip.files)) {
			if (name.toLowerCase() === "mimetype") {
				this.mimeFile = name;
				break;
			}
		}
		if (!this.mimeFile) {
			throw new Error("No mimetype file in archive");
		}
		const data = await this._readFile(this.mimeFile);
		const txt = data.toString("utf-8").toLowerCase().trim();
		if (txt !== "application/epub+zip") {
			throw new Error("Unsupported mime type");
		}
	}

	private async _getRootFiles(): Promise<void> {
		for (const name of Object.keys(this.zip.files)) {
			if (name.toLowerCase() === "meta-inf/container.xml") {
				this.containerFile = name;
				break;
			}
		}
		if (!this.containerFile) {
			throw new Error("No container file in archive");
		}

		const data = await this._readFile(this.containerFile);
		const xml = data.toString("utf-8").trim();
		const result = parseXml(xml);

		const rootfiles = result.rootfiles as Record<string, unknown> | undefined;
		if (!rootfiles || !rootfiles.rootfile) {
			throw new Error("No rootfiles found");
		}

		for (const rf of asArray(rootfiles.rootfile) as Record<string, unknown>[]) {
			if (
				String(rf["@_media-type"]).toLowerCase() === "application/oebps-package+xml" &&
				rf["@_full-path"]
			) {
				this.rootFile = String(rf["@_full-path"]);
				break;
			}
		}

		if (!this.rootFile) {
			throw new Error("Rootfile not found from archive");
		}
	}

	private async _handleRootFile(): Promise<Record<string, unknown>> {
		const data = await this._readFile(this.rootFile as string);
		const xml = data.toString("utf-8");
		return parseXml(xml);
	}

	private _parseRootFile(rootfile: Record<string, unknown>): void {
		this.version = String(rootfile["@_version"] || "2.0");

		for (const fullKey of Object.keys(rootfile)) {
			if (fullKey.startsWith("@_")) {
				continue;
			}
			const key = (fullKey.split(":").pop() || "").toLowerCase().trim();
			switch (key) {
				case "metadata":
					this._parseMetadata(rootfile[fullKey] as Record<string, unknown>);
					break;
				case "manifest":
					this._parseManifest(rootfile[fullKey] as Record<string, unknown>);
					break;
				case "spine":
					this._parseSpine(rootfile[fullKey] as Record<string, unknown>);
					break;
				case "guide":
					this._parseGuide(rootfile[fullKey] as Record<string, unknown>);
					break;
			}
		}
	}

	private _parseMetadata(metadata: Record<string, unknown>): void {
		for (const fullKey of Object.keys(metadata)) {
			if (fullKey.startsWith("@_")) {
				continue;
			}
			const metadataValue = metadata[fullKey];
			const key = (fullKey.split(":").pop() || "").toLowerCase().trim();

			switch (key) {
				case "publisher":
				case "title":
				case "description":
				case "date": {
					if (Array.isArray(metadataValue)) {
						(this.metadata as Record<string, unknown>)[key] = textOf(metadataValue[0]);
					} else {
						(this.metadata as Record<string, unknown>)[key] = textOf(metadataValue);
					}
					break;
				}
				case "language": {
					if (Array.isArray(metadataValue)) {
						this.metadata.language = textOf(metadataValue[0]).toLowerCase();
					} else {
						this.metadata.language = textOf(metadataValue).toLowerCase();
					}
					break;
				}
				case "subject": {
					const subjects = asArray(metadataValue);
					if (subjects.length === 0) {
						this.metadata.subject = "";
					} else {
						this.metadata.subjects = subjects.map((v) => textOf(v));
						this.metadata.subject = this.metadata.subjects[0] ?? "";
					}
					break;
				}
				case "creator": {
					if (Array.isArray(metadataValue)) {
						const first = metadataValue[0] as Record<string, unknown> | string | undefined;
						this.metadata.creator = textOf(first);
						this.metadata.creatorFileAs = String(
							(typeof first === "object" && first?.["@_opf:file-as"]) || this.metadata.creator,
						).trim();
					} else {
						this.metadata.creator = textOf(metadataValue);
						const fileAs =
							typeof metadataValue === "object" &&
							metadataValue != null &&
							(metadataValue as Record<string, unknown>)["@_opf:file-as"];
						this.metadata.creatorFileAs = String(fileAs || this.metadata.creator).trim();
					}
					break;
				}
				case "identifier": {
					for (const v of asArray(metadataValue)) {
						extractIdentifiers(v, this.metadata);
					}
					break;
				}
				case "source": {
					const sources = asArray(metadataValue);
					this.metadata.source = sources.length > 0 ? textOf(sources[0]) : "";
					break;
				}
			}
		}

		for (const meta of asArray(metadata.meta) as Record<string, unknown>[]) {
			const name = meta["@_name"] as string | undefined;
			const content = meta["@_content"] as string | undefined;
			const property = meta["@_property"] as string | undefined;

			if (name) {
				(this.metadata as Record<string, unknown>)[name] = content;
			}
			if (meta["#text"] && property) {
				(this.metadata as Record<string, unknown>)[property] = meta["#text"];
			}
		}
	}

	private _parseManifest(manifest: Record<string, unknown>): void {
		const path = (this.rootFile as string).split("/");
		path.pop();
		const pathStr = path.join("/");

		for (const item of asArray(manifest.item) as Record<string, unknown>[]) {
			const element = attrsOf(item) as unknown as ManifestItem;
			if (element.href && element.href.substring(0, pathStr.length) !== pathStr) {
				element.href = path.concat([element.href]).join("/");
			}
			if (element.id) {
				this.manifest[element.id] = element;
			}
		}
	}

	private _parseGuide(guide: Record<string, unknown>): void {
		const path = (this.rootFile as string).split("/");
		path.pop();
		const pathStr = path.join("/");

		for (const ref of asArray(guide.reference) as Record<string, unknown>[]) {
			const element = attrsOf(ref);
			if (element.href && element.href.substring(0, pathStr.length) !== pathStr) {
				element.href = path.concat([element.href]).join("/");
			}
			this.guide.push(element);
		}
	}

	private _parseSpine(spine: Record<string, unknown>): void {
		const toc = spine["@_toc"] as string | undefined;
		if (toc) {
			this.spine.toc = this.manifest[toc] || false;
		}

		for (const itemref of asArray(spine.itemref) as Record<string, unknown>[]) {
			const idref = itemref["@_idref"] as string | undefined;
			if (idref) {
				const element = this.manifest[idref];
				if (element) {
					this.spine.contents.push(element);
				}
			}
		}
		this.flow = this.spine.contents;
	}

	private async _parseTOC(): Promise<void> {
		const tocHref = (this.spine.toc as ManifestItem).href;
		const path = tocHref.split("/");
		path.pop();

		const idList: Record<string, string> = {};
		for (const key of Object.keys(this.manifest)) {
			idList[this.manifest[key].href as string] = key;
		}

		const data = await this._readFile(tocHref);
		const xml = data.toString("utf-8");
		let result: Record<string, unknown>;
		try {
			result = parseXml(xml);
		} catch (err) {
			throw new Error(
				"Parsing container XML failed in TOC: " +
					(err instanceof Error ? err.message : String(err)),
			);
		}

		const navMap = result.navMap as Record<string, unknown> | undefined;
		if (navMap?.navPoint) {
			this.toc = this.walkNavMap(navMap.navPoint as Record<string, unknown>[], path, idList);
		}
	}

	walkNavMap(
		branch: Record<string, unknown> | Record<string, unknown>[],
		path: string[],
		idList: Record<string, string>,
		level: number = 0,
	): TocElement[] {
		if (level > 7) {
			return [];
		}

		const output: TocElement[] = [];
		const items = Array.isArray(branch) ? branch : [branch];

		for (const item of items) {
			const navLabel = item.navLabel as Record<string, unknown> | undefined;
			if (navLabel) {
				let title = "";
				if (typeof navLabel.text === "string") {
					title = navLabel.text.trim();
				}

				let order = Number(item["@_playOrder"] || 0);
				if (isNaN(order)) {
					order = 0;
				}

				let href = "";
				const content = item.content as Record<string, unknown> | undefined;
				if (typeof content?.["@_src"] === "string") {
					href = (content["@_src"] as string).trim();
				}

				let element: TocElement = { level, order, title, id: "", href: "" };

				if (href) {
					href = path.concat([href]).join("/");
					element.href = href;

					if (idList[element.href]) {
						element = this.manifest[idList[element.href]] as ManifestItem & TocElement;
						element.title = title;
						element.order = order;
						element.level = level;
					} else {
						element.href = href;
						element.id = String(item["@_id"] || "").trim();
					}

					output.push(element);
				}
			}
			if (item.navPoint) {
				output.push(
					...this.walkNavMap(item.navPoint as Record<string, unknown>[], path, idList, level + 1),
				);
			}
		}
		return output;
	}

	async getChapter(id: string): Promise<string> {
		const str = await this.getChapterRaw(id);

		const path = (this.rootFile as string).split("/");
		path.pop();
		const keys = Object.keys(this.manifest);

		// remove linebreaks (no multi line matches in JS regex!)
		let s = str.replace(/\r?\n/g, "\u0000");

		// keep only <body> contents
		s.replace(/<body[^>]*?>(.*)<\/body[^>]*?>/i, (_o, d) => {
			s = d.trim();
			return "";
		});

		// remove <script> blocks
		s = s.replace(/<script[^>]*?>(.*?)<\/script[^>]*?>/gi, () => "");

		// remove <style> blocks
		s = s.replace(/<style[^>]*?>(.*?)<\/style[^>]*?>/gi, () => "");

		// remove onEvent handlers
		s = s.replace(/(\s)(on\w+)(\s*=\s*["']?[^"'\s>]*?["'\s>])/g, (_o, a, b, c) => {
			return a + "skip-" + b + c;
		});

		// replace images
		s = s.replace(/(\ssrc\s*=\s*["']?)([^"'\s>]*?)(["'\s>])/g, (_o, a, b, c) => {
			const img = path.concat([b]).join("/").trim();
			let element: Record<string, unknown> | undefined;

			for (const k of keys) {
				if (this.manifest[k].href === img) {
					element = this.manifest[k];
					break;
				}
			}

			if (element) {
				return a + this.imageroot + element.id + "/" + img + c;
			}
			return "";
		});

		// replace links
		s = s.replace(/(\shref\s*=\s*["']?)([^"'\s>]*?)(["'\s>])/g, (_o, a, b, c) => {
			const linkparts = b ? b.split("#") : [];
			let link = linkparts.length
				? path
						.concat([linkparts.shift() || ""])
						.join("/")
						.trim()
				: "";
			let element: Record<string, unknown> | undefined;

			for (const k of keys) {
				if ((this.manifest[k].href as string).split("#")[0] === link) {
					element = this.manifest[k];
					break;
				}
			}

			if (linkparts.length) {
				link += "#" + linkparts.join("#");
			}

			if (element) {
				return a + this.linkroot + element.id + "/" + link + c;
			}
			return a + b + c;
		});

		// bring back linebreaks
		// eslint-disable-next-line no-control-regex
		s = s.replace(/\u0000/g, "\n").trim();

		return s;
	}

	async getChapterRaw(id: string): Promise<string> {
		if (!this.manifest[id]) {
			throw new Error("File not found");
		}
		const mediaType = this.manifest[id]["media-type"];
		if (mediaType !== "application/xhtml+xml" && mediaType !== "image/svg+xml") {
			throw new Error("Invalid mime type for chapter");
		}
		const data = await this._readFile(this.manifest[id].href);
		return data ? data.toString("utf-8") : "";
	}

	async getImage(id: string): Promise<{ data: Buffer; mimeType: string }> {
		if (!this.manifest[id]) {
			throw new Error("File not found");
		}
		const mediaType = (this.manifest[id]["media-type"] || "").toLowerCase().trim();
		if (!mediaType.startsWith("image/")) {
			throw new Error("Invalid mime type for image");
		}
		return this.getFile(id);
	}

	async getFile(id: string): Promise<{ data: Buffer; mimeType: string }> {
		if (!this.manifest[id]) {
			throw new Error("File not found");
		}
		const data = await this._readFile(this.manifest[id].href);
		return { data, mimeType: this.manifest[id]["media-type"] };
	}

	async readFile(filename: string, encoding?: BufferEncoding): Promise<Buffer | string> {
		const data = await this._readFile(filename);
		if (encoding) {
			return data.toString(encoding);
		}
		return data;
	}

	hasDRM(): boolean {
		return this.zip.file("META-INF/encryption.xml") !== null;
	}
}

export default EPub;
