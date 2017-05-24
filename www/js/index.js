var movies = document.querySelector('.movies-wrapper');
var videoPlayer = document.querySelector('.video-wrapper');
var card = document.querySelector('.card');

card.addEventListener('click', ()=> {
    movies.style.transition = '1s';
    movies.style.transform = 'scale(0)';
    // videoPlayer.style.transition = '.8s';
    // videoPlayer.style.transform = 'scale(1)';
})

videoPlayer.addEventListener('click', ()=> {
    videoPlayer.style.transform = 'scale(0)';
    movies.style.transition = '.8s ease-out';
    movies.style.transform = 'scale(1)';
})

/* card.addEventListener('click', () => {
    movies.classList.add('hide');
    videoPlayer.classList.add('show');
}) */