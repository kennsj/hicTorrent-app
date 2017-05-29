// Load modules
var ipcRenderer = require('electron').ipcRenderer;
var WebTorrent = require('webtorrent');
var dragDrop = require('drag-drop');

// Create a Torrent client
var webTorrent = new WebTorrent();

// Setup the menu
var cardList = document.querySelectorAll('.card');
var close = document.querySelector('.close');

const videoPlayer = document.querySelector('video');

for (let card of cardList) {

    var cardClick = card.addEventListener('click', (event) => {

        console.log('Start torrent process')

        // If video is active, return out of function
        if (card.isActive) {
            close.addEventListener('click', function ()  {
                console.log('Close video player');
            })

            return;
        }

        var video = document.querySelector('video');

        card.isActive = true;


        var magnet = card.getAttribute('ht-magnet');
        playTorrent(magnet, card);
    });
};

function playTorrent(magnet, target) {

    webTorrent.add(magnet, function (torrent) {

        // Torrents can contain many files. Let's use the .mp4 file
        var file = torrent.files.find(function (file) {
            return file.name.endsWith('.mp4');
        });

        if (target.isActive) {
            console.log('Close appears');
            close.classList.toggle('hidden');
        }

        setInterval(function () {
            var dlProgress = (torrent.downloaded / 1024);
            var dlProgress = (dlProgress / 1024);
            var dlProgress = dlProgress.toFixed(1);
            console.log(dlProgress + ' megabyte is downloaded');
        }, 1000);

        console.log('Movie playing');

        file.appendTo(target);
    });
};



close.addEventListener('click', function () {

    console.log('Close this shit');

})


// Allow drag and drop function to the client
var uploadCard = document.querySelector('.upload-card');

// When user drops files on the browser, create a new torrent and start seeding it!
dragDrop('.upload-card', function (files) {
    webTorrent.seed(files, function (torrent) {
        document.querySelector('h3').innerHTML = "Here is your magnet link:" + '<br>' + '<br>' + torrent.magnetURI;
    })
})


/*

// Add functions to pause and play video
var videoPlayer = document.querySelector('video');

function pauseVideo()  {
    console.log('Video is paused');
    videoPlayer.pause();
}

function playVideo()  {
    videoPlayer.play();
    console.log('Video is resumed');
}

*/
