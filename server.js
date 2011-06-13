var http = require('http'),
    EPub = require("./epub"),
    fs = require("fs");

var EPUBFILE = "tasuja.epub";

var epub = new EPub(EPUBFILE, "/epubimg", "/chapter");
epub.on("error", function(err){
    console.log("ERROR\n-----");
    throw err;
});

epub.on("end", function(){
    
    startserver();
    
});

epub.parse();


function startserver(){
    http.createServer(function (req, res) {
        
        if(req.url.match(/^\/contents/)){
            res.writeHead(200, {'Content-Type': 'text/javascript'});
            res.end(JSON.stringify({toc: epub.toc, flow: epub.spine.contents}));
            return;
        }
        
        if(req.url.match(/^\/chapter/)){
            var parts = req.url.split("/");
            epub.getChapter(parts[2], function(err, data){
                if(err){
                    res.writeHead(500, {'Content-Type': 'text/html'});
                    res.end("<h1>Error</h1><p>"+err.message+"</p>");
                    return;
                }
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(data);
            });
            return;
        }
        
        if(req.url.match(/^\/epubimg/)){
            var parts = req.url.split("/");
            epub.getImage(parts[2], function(err, data, mimeType){
                if(err){
                    res.writeHead(500, {'Content-Type': 'text/html'});
                    res.end("<h1>Error</h1><p>"+err.message+"</p>");
                    return;
                }
                res.writeHead(200, {'Content-Type': mimeType});
                res.end(data);
            });
            return;
        }
        
        if(req.url == "/"){
            fs.readFile("index.html", function(err, data){
                if(err){
                    res.writeHead(500, {'Content-Type': 'text/html'});
                    res.end("<h1>Error</h1><p>"+err.message+"</p>");
                    return;
                }
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(data);
            });
            return;
        }
        
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
        
    }).listen(8080);
    console.log('Server running');    
}


