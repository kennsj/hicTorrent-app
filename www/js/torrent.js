var WebTorrent = require('webtorrent');
var client = new WebTorrent();

/*

// Sintel magnet
var torrentId = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent';

*/

// Cosmos Laundromat First Cycle
var torrentId = 'magnet:?xt=urn:btih:6a02592d2bbc069628cd5ed8a54f88ee06ac0ba5&dn=CosmosLaundromatFirstCycle&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.io&ws=http%3A%2F%2Fia601508.us.archive.org%2F14%2Fitems%2F&ws=http%3A%2F%2Fia801508.us.archive.org%2F14%2Fitems%2F&ws=https%3A%2F%2Farchive.org%2Fdownload%2F'



// var torrentId = 'https://yts.ag/torrent/download/AE28BAEC7A304E9714228E0C70D45E4CB194EE91';

// Append video player
var videoPlayer = document.querySelector('#my-video');
var bigBuckBunny = document.querySelector('.bunny');

bigBuckBunny.addEventListener('click', function () {
    client.add(torrentId, function (torrent) {
        // Torrents can contain many files. Let's use the .mp4 file
        var file = torrent.files.find(function (file) {
            return file.name.endsWith('.mp4');
        })



        var dl = file.downloaded;
        var mbDl = parseInt(Math.floor(Math.log(dl) / Math.log(1024)));

        setInterval(function () {
            console.log(mbDl + "mbit");
        }, 1000)

        setInterval(function ()  {
            console.log(torrent.downloadSpeed)
        }, 1000)



        // console.log(parseInt(Math.floor(Math.log(file.downloaded) / Math.log(1024))))


        // Display the file by adding it to the DOM. Supports video, audio, image, etc. files
        file.appendTo("#video-output");

        console.log('Current download speed ' + torrent.downloadSpeed)

        // console.log(torrent.progress * 100 + "%")

        // console.log('Number of peers ' + torrent.numPeers)

        // Adds a download link to the torrent
        /*
    
        file.getBlobURL(function (err, url) {
            if (err) throw err
            var a = document.createElement('a')
            a.download = file.name
            a.href = url
            a.textContent = 'Download ' + file.name
            document.body.appendChild(a)
            console.log(getBlobURL);
        })
    
        */

    })
})
