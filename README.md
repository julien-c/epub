# epub [![Build Status](https://travis-ci.org/julien-c/epub.svg?branch=master)](https://travis-ci.org/julien-c/epub)

**epub** is a node.js module to parse EPUB electronic book files.

**NB!** Only ebooks in UTF-8 are currently supported!.

## Installation

    npm install epub

Or, if you want a pure-JS version (useful if used in a Node-Webkit app for example):

    npm install epub --no-optional


## Usage

    const EPub = require("epub");
    let epub = new EPub(epubfile, imagewebroot, chapterwebroot);

Where

  * **epubfile** is the file path to an EPUB file
  * **imagewebroot** is the prefix for image URL's. If it's */images/* then the actual URL (inside chapter HTML `<img>` blocks) is going to be */images/IMG_ID/IMG_FILENAME*, `IMG_ID` can be used to fetch the image form the ebook with `getImage`. Default: `/images/`
  * **chapterwebroot** is the prefix for chapter URL's. If it's */chapter/* then the actual URL (inside chapter HTML `<a>` links) is going to be */chapters/CHAPTER_ID/CHAPTER_FILENAME*, `CHAPTER_ID` can be used to fetch the image form the ebook with `getChapter`. Default: `/links/`
 
Before the contents of the ebook can be read, it must be opened (`EPub` is an `EventEmitter`).

    epub.on("end", function(){
    	// epub is now usable
    	console.log(epub.metadata.title);

    	epub.getChapter("chapter_id", function(err, text){});
    });
    epub.parse();


## metadata

Property of the *epub* object that holds several metadata fields about the book.

    epub = new EPub(...);
    ...
    epub.metadata;

Available fields:

  * **creator** Author of the book (if multiple authors, then the first on the list) (*Lewis Carroll*)
  * **creatorFileAs** Author name on file (*Carroll, Lewis*)
  * **title** Title of the book (*Alice's Adventures in Wonderland*)
  * **language** Language code (*en* or *en-us* etc.)
  * **subject** Topic of the book (*Fantasy*)
  * **date** creation of the file (*2006-08-12*)
  * **description**

## flow

*flow* is a property of the *epub* object and holds the actual list of chapters (TOC is just an indication and can link to a # url inside a chapter file)

    epub = new EPub(...);
    ...
    epub.flow.forEach(function(chapter){
    	console.log(chapter.id);
    });

Chapter `id` is needed to load the chapters `getChapter`

## toc
*toc* is a property of the *epub* object and indicates a list of titles/urls for the TOC. Actual chapter and it's ID needs to be detected with the `href` property


## getChapter(chapter_id, callback)

Load chapter text from the ebook.

    const epub = new EPub(...);
    ...
    epub.getChapter("chapter1", function(error, text){});

## getChapterRaw(chapter_id, callback)

Load raw chapter text from the ebook.

## getImage(image_id, callback)

Load image (as a Buffer value) from the ebook.

    const epub = new EPub(...);
    ...
    epub.getImage("image1", function(error, img, mimeType){});

## getFile(file_id, callback)

Load any file (as a Buffer value) from the ebook.

    const epub = new EPub(...);
    ...
    epub.getFile("css1", function(error, data, mimeType){});

