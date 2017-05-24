console.log('let\'s pirate!');


var WebTorrent = require('webtorrent');


var client = new WebTorrent();

// var magnetURI = 'https://archive.org/download/rival_pitchers_1402_thumb/rival_pitchers_1402_thumb_archive.torrent';


client.add(magnetURI, function (torrent) {

    // Got torrent metadata!
    console.log('Client is downloading:', torrent.path);

    torrent.files.forEach(function (file) {
        /*
        console.log('torrent files');
        */
    });

    torrent.on('download', function (bytes) {
        /*
        console.log('--- --- ---');
        console.log('just downloaded: ' + bytes);
        console.log('total downloaded: ' + torrent.downloaded);
        console.log('download speed: ' + torrent.downloadSpeed);
        console.log('progress: ' + torrent.progress);
        */
    });

    torrent.on('done', function () {
        console.log('torrent finished downloading');
        
        var file = torrent.files[0];
        console.log(file.name);
        console.log(torrent.path +'/'+ file.path);
        
        /*torrent.files.forEach(function (file) {
            // do something with file
            console.log('file', file);
        })*/
        
        
        
    })
});

// Drag-drop download, pre-load, open folder and play