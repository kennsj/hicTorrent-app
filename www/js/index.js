var ipcRenderer = require('electron').ipcRenderer;

let movies = document.querySelector('.movies-wrapper');
let videoPlayer = document.querySelector('.video-wrapper');
let card = document.querySelector('.card');

// videoPlayer.classList.add('hide');


card.addEventListener('click', () => {

    movies.classList.add('hide');
    videoPlayer.classList.remove('hide');

    ipcRenderer.send("resize", {
        w: 1280,
        h: 550
    });
});

// Asd

videoPlayer.addEventListener('click', () => {

    videoPlayer.classList.add('hide');
    movies.classList.remove('hide');

    ipcRenderer.send("resize", {
        w: 1024,
        h: 1000
    });

    // var videoWidth = document.querySelector('video').offsetWidth;

});
