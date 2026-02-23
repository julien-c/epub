# epub [![CI](https://github.com/julien-c/epub/actions/workflows/ci.yml/badge.svg)](https://github.com/julien-c/epub/actions/workflows/ci.yml)

**epub** is a pure-JS module to parse EPUB electronic book files.

**NB!** Only ebooks in UTF-8 are currently supported!.

## CLI

Read an Epub directly from your terminal 🔥

```bash
URL="https://github.com/progit/progit2/releases/download/2.1.449/progit.epub"

npx epub "$URL"
# or
pnpx epub "$URL"
```

## Installation

```bash
npm install epub
```

## Usage

```js
import EPub from "epub";
const epub = new EPub(pathToFile);
```

Where

- **pathToFile** is the file path to an EPUB file
- Optional:
  - **imageWebRoot** is the prefix for image URL's. If it's _/images/_ then the actual URL (inside chapter HTML `<img>` blocks) is going to be _/images/IMG_ID/IMG_FILENAME_, `IMG_ID` can be used to fetch the image form the ebook with `getImage`. Default: `/images/`
  - **chapterWebRoot** is the prefix for chapter URL's. If it's _/chapter/_ then the actual URL (inside chapter HTML `<a>` links) is going to be _/chapters/CHAPTER_ID/CHAPTER_FILENAME_, `CHAPTER_ID` can be used to fetch the image form the ebook with `getChapter`. Default: `/links/`

Before the contents of the ebook can be read, it must be parsed:

```js
await epub.parse();
console.log(epub.metadata.title);

const text = await epub.getChapter("chapter_id");
```

## metadata

Property of the _epub_ object that holds several metadata fields about the book.

```js
epub.metadata;
```

Available fields:

- **creator** Author of the book (if multiple authors, then the first on the list) (_Lewis Carroll_)
- **creatorFileAs** Author name on file (_Carroll, Lewis_)
- **title** Title of the book (_Alice's Adventures in Wonderland_)
- **language** Language code (_en_ or _en-us_ etc.)
- **subject** Topic of the book (_Fantasy_)
- **date** creation of the file (_2006-08-12_)
- **description**

## flow

_flow_ is a property of the _epub_ object and holds the actual list of chapters (TOC is just an indication and can link to a # url inside a chapter file)

```js
for (const chapter of epub.flow) {
	console.log(chapter.id);
}
```

Chapter `id` is needed to load the chapters `getChapter`

## toc

_toc_ is a property of the _epub_ object and indicates a list of titles/urls for the TOC. Actual chapter and it's ID needs to be detected with the `href` property

## getChapter(chapter_id)

Load chapter text from the ebook.

```js
const text = await epub.getChapter("chapter1");
```

## getChapterRaw(chapter_id)

Load raw chapter text from the ebook.

## getImage(image_id)

Load image (as a Buffer value) from the ebook.

```js
const { data, mimeType } = await epub.getImage("image1");
```

## getFile(file_id)

Load any file (as a Buffer value) from the ebook.

```js
const { data, mimeType } = await epub.getFile("css1");
```
