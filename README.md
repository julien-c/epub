#epub

**epub** is a node.js module to parse EPUB electronic book files.

**NB!** Only ebooks in UTF-8 are currently supported!.

## Installation

    npm install epub

## Usage

	var EPub = require("epub");
    var epub = new EPub(epubfile, imagewebroot, chapterwebroot);

Where

  * **epubfile** is the file path to an EPUB file
  * **imagewebroot** is the prefix for image URL's. If it's */images/* then the actual URL (inside chapter HTML `<img>` blocks) is going to be */images/IMG_ID/IMG_FILENAME*, `IMG_ID` can be used to fetch the image form the ebook with `getImage`
  * **chapterwebroot** is the prefix for chapter URL's. If it's */chapter/* then the actual URL (inside chapter HTML `<a>` links) is going to be */chapters/CHAPTER_ID/CHAPTER_FILENAME*, `CHAPTER_ID` can be used to fetch the image form the ebook with `getChapter`
 
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

    var epub = new EPub(...);
    ...
    epub.getChapter("chapter1", function(error, text){});

## getImage(image_id, callback)

Load image (as a Buffer value) from the ebook.

    var epub = new EPub(...);
    ...
    epub.getImage("image1", function(error, img, mimeType){});

