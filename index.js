var EPub = require("./epub");

var epub = new EPub("img.epub", "tere", "vana");
epub.on("error", function(err){
    console.log("ERROR\n-----");
    throw err;
});

epub.on("end", function(err){
    console.log("PARSED\n-----");
    console.log(epub.metadata);
    console.log(epub.manifest);
    console.log(epub.spine);
    console.log(epub.toc);

    epub.getChapter("item259", function(err, data){
        console.log(err || data);
    });

    epub.getImage("item262", function(err, data, mimeType){
        console.log(err || data);
        console.log(mimeType)
    });
    
});

epub.parse();