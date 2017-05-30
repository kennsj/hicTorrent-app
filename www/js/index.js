// Load modules
var ipcRenderer = require('electron').ipcRenderer;
var WebTorrent = require('webtorrent');
var dragDrop = require('drag-drop');

// Create a Torrent client
//var webTorrent = new WebTorrent();

// Setup the menu
var cardList = document.querySelectorAll('.card');
var playBtn = document.querySelector('.play-btn');
var close = document.querySelector('.close');



// Scripts



// Runs a loop of the cards and gets an array
for (let card of cardList) {

    playBtn.addEventListener('click', (event) => {

        // If the player is visible, the closing button will appear
        //if (card.isActive) {
        //    return;
        // }
        /* else {
            // Sets the display of close and the appended video of none
            close.addEventListener('click', function () {
                console.log('Close this shit and pause')
                document.querySelector('video').pause();
                close.style.display = 'none';
                // document.querySelector('video').style.display = 'none';
            })
        } */

        // card.isActive = true;

        // Selects the custom magnet attribute and starts the playTorrent function
        var magnet = card.getAttribute('ht-magnet');
        playTorrent(magnet, card);
    });
};



/*
function playerLoaded() {
    
    if(video === paused) {
        resumeVideoPlaying(); //DERP
    }
}
*/

// Starts the function to convert a magnet to a .mp4 file and ready to stream directly
function playTorrent(magnet, target) {
    
    var webTorrent = new WebTorrent();
    
    webTorrent.add(magnet, function (torrent) {

        // Torrents can contain many files. Let's use the .mp4 file
        var file = torrent.files.find(function (file) {
            return file.name.endsWith('.mp4');
        });

        // Appends a file to the video player and sets the video player display to relative
        file.appendTo(target);
        
        console.log('Movie is playing');
        
        close.classList.toggle('hidden');
        close.addEventListener('mousedown', () => {
            var video = target.querySelector('video');
            if(video != null) {
                video.parentNode.removeChild(video);
                close.classList.toggle('hidden');
                console.log('Movie has stopped playing');
            }
        });
    });
};



// Allow drag and drop function to the client
// When a user drops files in the div, it creates a magnet URI and starts to seed it
dragDrop('.upload-card', function (files) {
    webTorrent.seed(files, function (torrent) {
        document.querySelector('h3').innerHTML = "Here is your magnet link:" + '<br>' + '<br>' + torrent.magnetURI;
    })
})