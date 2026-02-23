import { EventEmitter } from "node:events";
import xml2js from "xml2js";
import AdmZip from "adm-zip";

const xml2jsOptions = (xml2js.defaults as Record<string, unknown>)["0.1"] as Record<string, unknown>;

interface ZipLike {
	names: string[];
	count: number;
	readFile(name: string, cb: (err: Error | null, data: Buffer) => void): void;
}

function openZip(filename: string): ZipLike {
	const admZip = new AdmZip(filename);
	const names = admZip.getEntries().map((e) => e.entryName);
	return {
		names,
		count: names.length,
		readFile(name: string, cb: (err: Error | null, data: Buffer) => void) {
			const entry = admZip.getEntry(name);
			if (!entry) {
				return cb(new Error(`Entry not found: ${name}`), Buffer.alloc(0));
			}
			admZip.readFileAsync(entry, (buffer, error) => {
				// `error` is bogus right now, so let's just drop it.
				// see https://github.com/cthackers/adm-zip/pull/88
				cb(null, buffer as Buffer);
			});
		},
	};
}

function readFileAsync(zip: ZipLike, name: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		zip.readFile(name, (err, data) => {
			if (err) return reject(err);
			resolve(data);
		});
	});
}

function parseXml(xml: string): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const parser = new xml2js.Parser(xml2jsOptions);
		parser.on("end", resolve);
		parser.on("error", reject);
		parser.parseString(xml);
	});
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

export interface ParseOptions {
	xml2jsOptions?: Record<string, unknown>;
}

function extractIdentifiers(metadataValue: Record<string, unknown>, out: Metadata): void {
	const attrs = metadataValue["@"] as Record<string, string> | undefined;
	const contents = metadataValue["#"];
	if (attrs) {
		if (attrs["opf:scheme"]) {
			(out as Record<string, unknown>)[attrs["opf:scheme"]] = String(contents || "").trim();
		} else if (attrs.id && attrs.id.match(/uuid/i)) {
			out.UUID = String(contents || "").replace("urn:uuid:", "").toUpperCase().trim();
		}
	}
}

export class EPub extends EventEmitter {
	filename: string;
	imageroot: string;
	linkroot: string;

	metadata: Metadata = {} as Metadata;
	manifest: Record<string, Record<string, unknown>> = {};
	guide: Record<string, unknown>[] = [];
	spine: { toc: Record<string, unknown> | false; contents: Record<string, unknown>[] } = {
		toc: false,
		contents: [],
	};
	flow: Record<string, unknown>[] = [];
	toc: TocElement[] = [];
	version: string = "2.0";

	zip!: ZipLike;
	containerFile: string | false = false;
	mimeFile: string | false = false;
	rootFile: string | false = false;

	constructor(fname?: string, imageroot?: string, linkroot?: string) {
		super();

		this.filename = fname ?? "";

		this.imageroot = (imageroot || "/images/").trim();
		this.linkroot = (linkroot || "/links/").trim();

		if (!this.imageroot.endsWith("/")) {
			this.imageroot += "/";
		}
		if (!this.linkroot.endsWith("/")) {
			this.linkroot += "/";
		}
	}

	parse(options: ParseOptions = {}): void {
		if (options.xml2jsOptions) {
			Object.assign(xml2jsOptions, options.xml2jsOptions);
		}

		this.containerFile = false;
		this.mimeFile = false;
		this.rootFile = false;

		this.metadata = {} as Metadata;
		this.manifest = {};
		this.guide = [];
		this.spine = { toc: false, contents: [] };
		this.flow = [];
		this.toc = [];

		this._parse();
	}

	private async _parse(): Promise<void> {
		try {
			this._open();
			await this._checkMimeType();
			await this._getRootFiles();
			const rootfileData = await this._handleRootFile();
			this._parseRootFile(rootfileData);

			if (this.spine.toc) {
				await this._parseTOC();
			}

			this.emit("end");
		} catch (err) {
			this.emit("error", err instanceof Error ? err : new Error(String(err)));
		}
	}

	private _open(): void {
		try {
			this.zip = openZip(this.filename);
		} catch {
			throw new Error("Invalid/missing file");
		}

		if (!this.zip.names || !this.zip.names.length) {
			throw new Error("No files in archive");
		}
	}

	private async _checkMimeType(): Promise<void> {
		for (const name of this.zip.names) {
			if (name.toLowerCase() === "mimetype") {
				this.mimeFile = name;
				break;
			}
		}
		if (!this.mimeFile) {
			throw new Error("No mimetype file in archive");
		}
		const data = await readFileAsync(this.zip, this.mimeFile);
		const txt = data.toString("utf-8").toLowerCase().trim();
		if (txt !== "application/epub+zip") {
			throw new Error("Unsupported mime type");
		}
	}

	private async _getRootFiles(): Promise<void> {
		for (const name of this.zip.names) {
			if (name.toLowerCase() === "meta-inf/container.xml") {
				this.containerFile = name;
				break;
			}
		}
		if (!this.containerFile) {
			throw new Error("No container file in archive");
		}

		const data = await readFileAsync(this.zip, this.containerFile);
		const xml = data.toString("utf-8").toLowerCase().trim();
		const result = (await parseXml(xml)) as Record<string, unknown>;

		const rootfiles = result.rootfiles as Record<string, unknown> | undefined;
		if (!rootfiles || !rootfiles.rootfile) {
			throw new Error("No rootfiles found");
		}

		const rootfile = rootfiles.rootfile as Record<string, unknown> | Record<string, unknown>[];
		let filename: string | false = false;

		if (Array.isArray(rootfile)) {
			for (const rf of rootfile) {
				const attrs = rf["@"] as Record<string, string> | undefined;
				if (
					attrs &&
					attrs["media-type"] === "application/oebps-package+xml" &&
					attrs["full-path"]
				) {
					filename = attrs["full-path"].toLowerCase().trim();
					break;
				}
			}
		} else {
			const attrs = (rootfile as Record<string, unknown>)["@"] as Record<string, string> | undefined;
			if (!attrs || attrs["media-type"] !== "application/oebps-package+xml" || !attrs["full-path"]) {
				throw new Error("Rootfile in unknown format");
			}
			filename = attrs["full-path"].toLowerCase().trim();
		}

		if (!filename) {
			throw new Error("Empty rootfile");
		}

		for (const name of this.zip.names) {
			if (name.toLowerCase() === filename) {
				this.rootFile = name;
				break;
			}
		}

		if (!this.rootFile) {
			throw new Error("Rootfile not found from archive");
		}
	}

	private async _handleRootFile(): Promise<Record<string, unknown>> {
		const data = await readFileAsync(this.zip, this.rootFile as string);
		const xml = data.toString("utf-8");
		return parseXml(xml);
	}

	private _parseRootFile(rootfile: Record<string, unknown>): void {
		const attrs = rootfile["@"] as Record<string, string> | undefined;
		this.version = attrs?.version || "2.0";

		for (const fullKey of Object.keys(rootfile)) {
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
			const metadataValue = metadata[fullKey];
			const key = (fullKey.split(":").pop() || "").toLowerCase().trim();

			switch (key) {
				case "publisher":
				case "language":
				case "title":
				case "description":
				case "date": {
					const val = this._extractSimpleValue(metadataValue);
					(this.metadata as Record<string, unknown>)[key] =
						key === "language" ? val.toLowerCase() : val;
					break;
				}
				case "subject": {
					if (Array.isArray(metadataValue)) {
						if (metadataValue.length < 1) {
							this.metadata.subject = "";
						} else {
							this.metadata.subjects = metadataValue.map((v) =>
								String((v as Record<string, unknown>)["#"] || v || "").trim()
							);
							if (this.metadata.subjects.length > 0) {
								this.metadata.subject = this.metadata.subjects[0];
							}
						}
					} else {
						const mv = metadataValue as Record<string, unknown>;
						this.metadata.subject = String(mv["#"] || mv || "").trim();
						this.metadata.subjects = [this.metadata.subject];
					}
					break;
				}
				case "creator": {
					if (Array.isArray(metadataValue)) {
						const first = metadataValue[0] as Record<string, unknown> | undefined;
						this.metadata.creator = String(
							(first && first["#"]) || first || ""
						).trim();
						const firstAttrs = first?.["@"] as Record<string, string> | undefined;
						this.metadata.creatorFileAs = String(
							firstAttrs?.["opf:file-as"] || this.metadata.creator
						).trim();
					} else {
						const mv = metadataValue as Record<string, unknown>;
						this.metadata.creator = String(mv["#"] || mv || "").trim();
						const attrs = mv["@"] as Record<string, string> | undefined;
						this.metadata.creatorFileAs = String(
							attrs?.["opf:file-as"] || this.metadata.creator
						).trim();
					}
					break;
				}
				case "identifier": {
					if (Array.isArray(metadataValue)) {
						for (const v of metadataValue) {
							extractIdentifiers(v as Record<string, unknown>, this.metadata);
						}
					} else {
						extractIdentifiers(metadataValue as Record<string, unknown>, this.metadata);
					}
					break;
				}
				case "source": {
					if (Array.isArray(metadataValue)) {
						if (metadataValue.length > 0) {
							const firstVal = metadataValue[0] as Record<string, unknown>;
							this.metadata.source = String(firstVal["#"] || firstVal || "").trim();
						} else {
							this.metadata.source = "";
						}
					} else {
						const mv = metadataValue as Record<string, unknown>;
						this.metadata.source = String(mv["#"] || mv || "").trim();
					}
					break;
				}
			}
		}

		const metas = (metadata["meta"] || {}) as Record<string, Record<string, unknown>>;
		for (const k of Object.keys(metas)) {
			const meta = metas[k];
			const attrs = meta["@"] as Record<string, string> | undefined;
			if (attrs?.name) {
				(this.metadata as Record<string, unknown>)[attrs.name] = attrs.content;
			}
			if (meta["#"] && attrs?.property) {
				(this.metadata as Record<string, unknown>)[attrs.property] = meta["#"];
			}
			if ((meta as Record<string, unknown>).name === "cover") {
				(this.metadata as Record<string, unknown>)[(meta as Record<string, unknown>).name as string] =
					(meta as Record<string, unknown>).content;
			}
		}
	}

	private _extractSimpleValue(val: unknown): string {
		if (Array.isArray(val)) {
			const first = val[0] as Record<string, unknown> | undefined;
			return String((first && first["#"]) || first || "").trim();
		}
		const v = val as Record<string, unknown>;
		return String(v["#"] || v || "").trim();
	}

	private _parseManifest(manifest: Record<string, unknown>): void {
		const path = (this.rootFile as string).split("/");
		path.pop();
		const pathStr = path.join("/");

		const items = manifest.item as Record<string, unknown>[] | undefined;
		if (!items) return;

		for (const item of items) {
			const attrs = item["@"] as Record<string, string> | undefined;
			if (attrs) {
				const element = { ...attrs } as Record<string, unknown>;
				if (element.href && (element.href as string).substring(0, pathStr.length) !== pathStr) {
					element.href = path.concat([element.href as string]).join("/");
				}
				this.manifest[attrs.id] = element;
			}
		}
	}

	private _parseGuide(guide: Record<string, unknown>): void {
		const path = (this.rootFile as string).split("/");
		path.pop();
		const pathStr = path.join("/");

		let refs = guide.reference as Record<string, unknown>[] | Record<string, unknown> | undefined;
		if (!refs) return;
		if (!Array.isArray(refs)) {
			refs = [refs];
		}

		for (const ref of refs) {
			const attrs = ref["@"] as Record<string, string> | undefined;
			if (attrs) {
				const element = { ...attrs } as Record<string, unknown>;
				if (element.href && (element.href as string).substring(0, pathStr.length) !== pathStr) {
					element.href = path.concat([element.href as string]).join("/");
				}
				this.guide.push(element);
			}
		}
	}

	private _parseSpine(spine: Record<string, unknown>): void {
		const attrs = spine["@"] as Record<string, string> | undefined;
		if (attrs?.toc) {
			this.spine.toc = this.manifest[attrs.toc] || false;
		}

		let itemrefs = spine.itemref as Record<string, unknown>[] | Record<string, unknown> | undefined;
		if (!itemrefs) return;
		if (!Array.isArray(itemrefs)) {
			itemrefs = [itemrefs];
		}

		for (const itemref of itemrefs) {
			const iattrs = itemref["@"] as Record<string, string> | undefined;
			if (iattrs) {
				const element = this.manifest[iattrs.idref];
				if (element) {
					this.spine.contents.push(element);
				}
			}
		}
		this.flow = this.spine.contents;
	}

	private async _parseTOC(): Promise<void> {
		const tocHref = (this.spine.toc as Record<string, unknown>).href as string;
		const path = tocHref.split("/");
		path.pop();

		const idList: Record<string, string> = {};
		for (const key of Object.keys(this.manifest)) {
			idList[this.manifest[key].href as string] = key;
		}

		const data = await readFileAsync(this.zip, tocHref);
		const xml = data.toString("utf-8");
		let result: Record<string, unknown>;
		try {
			result = (await parseXml(xml)) as Record<string, unknown>;
		} catch (err) {
			throw new Error(
				"Parsing container XML failed in TOC: " + (err instanceof Error ? err.message : String(err))
			);
		}

		const navMap = result.navMap as Record<string, unknown> | undefined;
		if (navMap?.navPoint) {
			this.toc = this.walkNavMap(
				navMap.navPoint as Record<string, unknown>[],
				path,
				idList
			);
		}
	}

	walkNavMap(
		branch: Record<string, unknown> | Record<string, unknown>[],
		path: string[],
		idList: Record<string, string>,
		level: number = 0
	): TocElement[] {
		if (level > 7) return [];

		const output: TocElement[] = [];
		const items = Array.isArray(branch) ? branch : [branch];

		for (const item of items) {
			const navLabel = item.navLabel as Record<string, unknown> | undefined;
			if (navLabel) {
				let title = "";
				if (typeof navLabel.text === "string") {
					title =
						navLabel.text.length > 0
							? (navLabel.text || "").trim()
							: "";
				}

				const attrs = item["@"] as Record<string, string> | undefined;
				let order = Number(attrs?.playOrder || 0);
				if (isNaN(order)) order = 0;

				let href = "";
				const content = item.content as Record<string, unknown> | undefined;
				const contentAttrs = content?.["@"] as Record<string, string> | undefined;
				if (typeof contentAttrs?.src === "string") {
					href = contentAttrs.src.trim();
				}

				let element: TocElement = { level, order, title, id: "", href: "" };

				if (href) {
					href = path.concat([href]).join("/");
					element.href = href;

					if (idList[element.href]) {
						element = this.manifest[idList[element.href]] as unknown as TocElement;
						element.title = title;
						element.order = order;
						element.level = level;
					} else {
						element.href = href;
						element.id = (attrs?.id || "").trim();
					}

					output.push(element);
				}
			}
			if (item.navPoint) {
				output.push(
					...this.walkNavMap(
						item.navPoint as Record<string, unknown>[],
						path,
						idList,
						level + 1
					)
				);
			}
		}
		return output;
	}

	getChapter(id: string, callback: (error: Error | null, text?: string) => void): void {
		this.getChapterRaw(id, (err, str) => {
			if (err) return callback(err);

			const path = (this.rootFile as string).split("/");
			path.pop();
			const keys = Object.keys(this.manifest);

			// remove linebreaks (no multi line matches in JS regex!)
			let s = (str as string).replace(/\r?\n/g, "\u0000");

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
					? path.concat([linkparts.shift() || ""]).join("/").trim()
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
			s = s.replace(/\u0000/g, "\n").trim();

			callback(null, s);
		});
	}

	getChapterRaw(id: string, callback: (error: Error | null, text?: string) => void): void {
		if (this.manifest[id]) {
			const mediaType = this.manifest[id]["media-type"] as string;
			if (mediaType !== "application/xhtml+xml" && mediaType !== "image/svg+xml") {
				return callback(new Error("Invalid mime type for chapter"));
			}

			this.zip.readFile(this.manifest[id].href as string, (err, data) => {
				if (err) return callback(new Error("Reading archive failed"));
				callback(null, data ? data.toString("utf-8") : "");
			});
		} else {
			callback(new Error("File not found"));
		}
	}

	getImage(
		id: string,
		callback: (error: Error | null, data?: Buffer, mimeType?: string) => void
	): void {
		if (this.manifest[id]) {
			const mediaType = ((this.manifest[id]["media-type"] as string) || "").toLowerCase().trim();
			if (!mediaType.startsWith("image/")) {
				return callback(new Error("Invalid mime type for image"));
			}
			this.getFile(id, callback);
		} else {
			callback(new Error("File not found"));
		}
	}

	getFile(
		id: string,
		callback: (error: Error | null, data?: Buffer, mimeType?: string) => void
	): void {
		if (this.manifest[id]) {
			this.zip.readFile(this.manifest[id].href as string, (err, data) => {
				if (err) return callback(new Error("Reading archive failed"));
				callback(null, data, this.manifest[id]["media-type"] as string);
			});
		} else {
			callback(new Error("File not found"));
		}
	}

	readFile(
		filename: string,
		options?: string | ((err: Error | null, data?: Buffer | string) => void),
		callback_?: (err: Error | null, data?: Buffer | string) => void
	): void {
		const callback = (callback_ ?? options) as (err: Error | null, data?: Buffer | string) => void;

		if (typeof options === "function" || !options) {
			this.zip.readFile(filename, callback as (err: Error | null, data: Buffer) => void);
		} else if (typeof options === "string") {
			this.zip.readFile(filename, (err, data) => {
				if (err) return callback(new Error("Reading archive failed"));
				callback(null, data.toString(options as BufferEncoding));
			});
		} else {
			throw new TypeError("Bad arguments");
		}
	}

	hasDRM(): boolean {
		return this.zip.names.includes("META-INF/encryption.xml");
	}
}

export default EPub;
