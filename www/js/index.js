// Load modules
var ipcRenderer = require('electron').ipcRenderer;
var WebTorrent = require('webtorrent');


// Create a Torrent client
var webTorrent = new WebTorrent();

// Setup the menu
var cardList = document.querySelectorAll('.card');

for (var card of cardList) {

    card.addEventListener('mousedown', (event) => {

        var magnet = card.getAttribute('ht-magnet');

        playTorrent(magnet, card);
    });
}



function playTorrent(magnet, target) {

    webTorrent.add(magnet, function (torrent) {

        // Torrents can contain many files. Let's use the .mp4 file
        var file = torrent.files.find(function (file) {
            return file.name.endsWith('.mp4');
        });

        var dl = file.downloaded;
        var mbDl = parseInt(Math.floor(Math.log(dl) / Math.log(1024)));

        setInterval(function () {
            console.log(mbDl + "mbit");
        }, 1000)

        setInterval(function ()  {
            console.log(torrent.downloadSpeed)
        }, 1000)

        file.appendTo(target);
    });
};



