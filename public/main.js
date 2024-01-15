document.addEventListener('DOMContentLoaded', function() {
    const socket = io({ path: '/api/socket.io' });

    const statusText = document.getElementById('statusText');
    const statusColor = document.getElementById('statusColor');
    const songProgress = document.getElementById('song-progress');
    const currentTimeElement = document.getElementById('current-time');
    const totalDuration = document.getElementById('total-duration');
    const spotifyCard = document.getElementById('spotifyCard');
    const songTitle = document.getElementById('songTitle');
    const songImage = document.getElementById('songImage');
    const songLink = document.getElementById('songLink');

    const timeElement = document.getElementById('time');
    let sliderTimeout;

    function updateTime() {
        const now = new Date().toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour12: true,
            hour: 'numeric',
            minute: '2-digit'
        });

        timeElement.textContent = now;
    }

    setInterval(updateTime, 1000);
    updateTime();

    function updateSlider(startTime, duration) {
        const currentTime = Date.now();
        const elapsedTime = currentTime - startTime;

        if (elapsedTime >= duration) return;

        const progressPercentage = Math.min((elapsedTime / duration) * 100, 100);
        songProgress.value = elapsedTime;

        songProgress.style.background = `linear-gradient(to right, white 0%, white ${progressPercentage}%, #333 ${progressPercentage}%, #333 100%)`;

        const currentMinutes = Math.floor(elapsedTime / 60000);
        const currentSeconds = Math.floor((elapsedTime % 60000) / 1000);
        currentTimeElement.textContent = `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')}`;

        const totalMinutes = Math.floor(duration / 60000);
        const totalSeconds = Math.floor((duration % 60000) / 1000);
        totalDuration.textContent = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;

        clearTimeout(sliderTimeout);
        sliderTimeout = setTimeout(() => updateSlider(startTime, duration), 1000);
    }

    socket.on('update', (data) => {
        if (!data) return;

        var currentClass = statusColor.className.match(/bg-\S+-500/)[0];
        statusColor.className = statusColor.className.replace(currentClass, `bg-${data.statusData.color}-500`);
        statusText.innerText = data.statusData.status

        if (data.spotify) {
            songTitle.textContent = `${data.spotify.song} by ${data.spotify.artist.split(';')[0]}`;
            songImage.src = data.spotify.album_art_url;
            songLink.href = `https://open.spotify.com/track/${data.spotify.track_id}`

            const startTime = data.spotify.timestamps.start;
            const endTime = data.spotify.timestamps.end;
            const duration = endTime - startTime;
            songProgress.max = duration;
            updateSlider(startTime, duration);

            spotifyCard.classList.remove('hide');
        } else {
            spotifyCard.classList.add('hide');
        }
    });
})