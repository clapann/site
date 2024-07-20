document.addEventListener('DOMContentLoaded', function() {
    const socket = io({ path: '/api/socket.io' });

    const statusText = document.getElementById('statusText');
    const statusColor = document.getElementById('statusColor');
    const songProgress = document.getElementById('song-progress');
    const currentTimeElement = document.getElementById('current-time');
    const totalDuration = document.getElementById('total-duration');
    const spotifyCard = document.getElementById('spotifyCard');
    const activityText = document.getElementById('activityText');
    const largeImage = document.getElementById('largeImage');
    const smallImage = document.getElementById('smallImage');
    const activityName = document.getElementById('activityName');
    const spotifyMisc = document.getElementById('spotifyMisc');
    const unknownActivityElapsed = document.getElementById('unknownActivityElapsed');

    const timeElement = document.getElementById('time');
    const timeContainer = document.getElementById('time-container');
    const activityElapsed = document.getElementById('activityElapsed');
    let sliderTimeout;
    let elapsedTimeout;

    function updateTime() {
        const now = new Date().toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour12: true,
            hour: 'numeric',
            minute: '2-digit'
        });
    
        timeElement.textContent = now;
    }

    function calculateTimeDifference() {
        const now = new Date();
    
        const losAngelesTime = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const laTime = new Date(losAngelesTime);
    
        const timeDifference = now - laTime;
    
        const timeDifferenceHours = Math.floor(timeDifference / 3600000);
        const timeDifferenceMinutes = Math.floor((timeDifference % 3600000) / 60000);
    
        const absoluteHours = Math.abs(timeDifferenceHours);
        const absoluteMinutes = Math.abs(timeDifferenceMinutes);
    
        const hourLabel = absoluteHours === 1 ? 'hour' : 'hours';
        const minuteLabel = absoluteMinutes === 1 ? 'minute' : 'minutes';
    
        let timeDiffText = `${absoluteHours} ${hourLabel}`;
        if (absoluteMinutes > 0) {
            timeDiffText += ` and ${absoluteMinutes} ${minuteLabel}`;
        }
        timeDiffText += ` ${timeDifferenceHours > 0 ? 'behind' : 'ahead of'} your local time`;
    
        return timeDiffText;
    }    

    function updateTitle() {
        const timeDiffText = calculateTimeDifference();
        timeContainer.setAttribute('title', timeDiffText);
    }

    timeContainer.addEventListener('mouseover', updateTitle);
    timeContainer.addEventListener('click', updateTitle);

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

    function elapsed(pastTimestamp) {
        let s = Math.floor((Date.now() - pastTimestamp) / 1000),
            h = Math.floor(s / 3600),
            m = Math.floor((s % 3600) / 60);
        s %= 60;
    
        let timeString = h > 0 ? `${String(h).padStart(2, '0')}:` : '';
        timeString += `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} elapsed`;
    
        activityElapsed.innerHTML = timeString;
    
        clearTimeout(elapsedTimeout);
        elapsedTimeout = setTimeout(() => elapsed(pastTimestamp), 1000);
    };    

    function unknownElapsed(pastTimestamp) {
        const units = [
            { label: 'day', value: 86400 },
            { label: 'hour', value: 3600 },
            { label: 'minute', value: 60 },
        ];
    
        let s = Math.floor((Date.now() - pastTimestamp) / 1000), label, value;
        for ({label, value} of units) {
            if (s >= value) {
                let time = Math.floor(s / value);
                unknownActivityElapsed.innerHTML = `<span class="statusTextBold">for</span> ${time} ${label}${time > 1 ? 's' : ''}`;
                break;
            }
        }
        if (s < 60) unknownActivityElapsed.innerHTML = `<span class="statusTextBold">for</span> 1 minute`;
    
        clearTimeout(elapsedTimeout);
        elapsedTimeout = setTimeout(() => unknownElapsed(pastTimestamp), 1000);
    }
    

    socket.on('update', (data) => {
        if (!data) return;

        var currentClass = statusColor.className.match(/bg-\S+-500/)[0];
        statusColor.className = statusColor.className.replace(currentClass, `bg-${data.statusData.color}-500`);
        statusText.innerText = data.statusData.status

        if (data.spotify) {
            var artists = data.spotify.artist ? data.spotify.artist.split(/[,;]\s+/) : ['Unknown Artist'];
            artists = artists.length > 1 ? `${artists.slice(0, -1).join(", ")} & ${artists[artists.length - 1]}` : artists.join();

            activityText.innerHTML = `<span class="statusTextBold">Listening to</span> ${data.spotify.song} <span class="statusTextBold">by</span> ${artists}`;
            largeImage.src = !data.spotify.album_art_url ? './public/assets/unknown.svg' : data.spotify.album_art_url;
            smallImage.src = './public/assets/spotify.svg';
            activityName.href = `https://open.spotify.com/track/${data.spotify.track_id}`
            activityName.innerText = 'Spotify';

            const startTime = data.spotify.timestamps.start;
            const endTime = data.spotify.timestamps.end;
            const duration = endTime - startTime;
            songProgress.max = duration;
            updateSlider(startTime, duration);

            spotifyCard.classList.remove('hide');
            smallImage.classList.add('hide');
            clearTimeout(elapsedTimeout);
            activityElapsed.classList.add('hard-hide');
            unknownActivityElapsed.classList.add('hard-hide');
            spotifyMisc.classList.remove('hard-hide');
            smallImage.classList.remove('hide');
        } else if(data.activities.length !== 0) {
            const activity = data.activities[0].type !== 6 ? data.activities[0] : data.activities[1];
            if(activity === undefined) return;
           
            largeImage.removeAttribute('title');
            smallImage.removeAttribute('title');
            activityName.removeAttribute('href');
            activityName.innerText = activity.name;
            smallImage.classList.add('hide');
            activityElapsed.classList.remove('hide');

            if(activity.name === 'Visual Studio Code') {
                activityText.innerHTML = `${activity.details.includes('in ') ? `<span class="statusTextBold">in </span>${activity.details.replace('in ', '')}${activity.state !== undefined ? `<br><span class="statusTextBold">editing </span>${activity.state.replace('editing', '')}` : ''}` : `${activity.details}${activity.state !== undefined ? `<br>${activity.state}` : ''}`}`
            } else if(activity.details === undefined) {
                largeImage.src = './public/assets/unknown.svg'
                activityText.innerHTML = `<span class="statusTextBold">Playing </span>${activity.name}${activity.state !== undefined ? `<br>${activity.state}` : ''}`
                activityName.innerText = 'Unknown Game'
                activityElapsed.classList.add('hide');
                unknownActivityElapsed.classList.remove('hard-hide');
            } else {
                activityText.innerHTML = `<span class="statusTextBold">${activity.details}${activity.state !== undefined ? `<br>${activity.state}` : ''}</span>`
            }

            if(activity.assets && activity.assets.large_image !== undefined) {
                largeImage.src = getAsset(activity.assets.large_image, activity.application_id);
                if (activity.assets.large_text) {
                    largeImage.title = activity.assets.large_text;
                }
            }

            if(activity.assets && activity.assets.small_image !== undefined) {
                smallImage.src = getAsset(activity.assets.small_image, activity.application_id);
                smallImage.classList.remove('hide');
                if (activity.assets.small_text) {
                    smallImage.title = activity.assets.small_text;
                }
            }

            if(activity.details !== undefined && activity.timestamps && activity.timestamps.start !== undefined) {
                activityElapsed.classList.remove('hard-hide');
                unknownActivityElapsed.classList.add('hard-hide');
                elapsed(activity.timestamps.start);
            } else if(activity.details === undefined && activity.timestamps && activity.timestamps.start !== undefined) {
                activityElapsed.classList.add('hard-hide');
                unknownActivityElapsed.classList.remove('hard-hide');
                unknownElapsed(activity.timestamps.start);
            }

            spotifyCard.classList.remove('hide');
            spotifyMisc.classList.add('hard-hide');
        } else {
            spotifyCard.classList.add('hide');
        }
    });

    function getAsset(asset, applicationID) {
        if (asset.includes("mp:external")) {
            const parts = asset.split('/');
            const encodedUrl = parts.slice(2).join('/');
            
            const finalUrl = encodedUrl.replace('https/', 'https://');
            
            return finalUrl;
        } else if (!isNaN(asset)) {
            return `https://cdn.discordapp.com/app-assets/${applicationID}/${asset}`;
        }
        
        return asset;
    }

    function renderRepo(repo) {
        return `
            <div class="flex w-full flex-col gap-x-3 gap-y-2 rounded-xl bg-gray-200/60 p-2 dark:bg-white/10 md:min-h-[100px] md:p-4">
                <a href="${repo.repo_url}" class="flex items-center gap-x-2 font-semibold hover:cursor-pointer" target="_blank" rel="noopener noreferrer">
                    <img src="${repo.logo}" width="25" height="25" ${!repo.logo ? 'hidden' : ''}>
                    ${repo.name} 
                </a>
                <div class="flex flex-row flex-wrap gap-1">
                    ${repo.topics.map(topic => `
                        <div class="whitespace-nowrap rounded-full bg-gray-300/60 px-2 py-1 text-xs font-semibold text-gray-600 dark:bg-white/20 dark:text-white">${topic}</div>
                    `).join('')}
                </div>
                <p class="line-clamp-2 text-xs text-gray-600 dark:text-white/50 md:block">${repo.description}</p>
                <div class="flex w-full grow flex-row items-center gap-x-2 self-end">
                    <p class="flex items-center gap-x-1 self-end text-sm text-gray-600 dark:text-white/50">
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                            <path d="M259.3 17.8L194 150.2 47.9 171.5c-26.2 3.8-36.7 36.1-17.7 54.6l105.7 103-25 145.5c-4.5 26.3 23.2 46 46.4 33.7L288 439.6l130.7 68.7c23.2 12.2 50.9-7.4 46.4-33.7l-25-145.5 105.7-103c19-18.5 8.5-50.8-17.7-54.6L382 150.2 316.7 17.8c-11.7-23.6-45.6-23.9-57.4 0z"></path>
                        </svg>${repo.stargazers_count}
                    </p>
                    <p class="flex items-center gap-x-1 self-end text-sm text-gray-600 dark:text-white/50">
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.559 8.855c.166 1.183.789 3.207 3.087 4.079C11 13.829 11 14.534 11 15v.163c-1.44.434-2.5 1.757-2.5 3.337 0 1.93 1.57 3.5 3.5 3.5s3.5-1.57 3.5-3.5c0-1.58-1.06-2.903-2.5-3.337V15c0-.466 0-1.171 2.354-2.065 2.298-.872 2.921-2.896 3.087-4.079C19.912 8.441 21 7.102 21 5.5 21 3.57 19.43 2 17.5 2S14 3.57 14 5.5c0 1.552 1.022 2.855 2.424 3.313-.146.735-.565 1.791-1.778 2.252-1.192.452-2.053.953-2.646 1.536-.593-.583-1.453-1.084-2.646-1.536-1.213-.461-1.633-1.517-1.778-2.252C8.978 8.355 10 7.052 10 5.5 10 3.57 8.43 2 6.5 2S3 3.57 3 5.5c0 1.602 1.088 2.941 2.559 3.355zM17.5 4c.827 0 1.5.673 1.5 1.5S18.327 7 17.5 7 16 6.327 16 5.5 16.673 4 17.5 4zm-4 14.5c0 .827-.673 1.5-1.5 1.5s-1.5-.673-1.5-1.5.673-1.5 1.5-1.5 1.5.673 1.5 1.5zM6.5 4C7.327 4 8 4.673 8 5.5S7.327 7 6.5 7 5 6.327 5 5.5 5.673 4 6.5 4z"></path>
                        </svg>${repo.forks_count}
                    </p>
                    ${repo.main_language ? `
                        <div class="ml-auto flex items-center gap-x-1 self-end text-xs text-gray-600 dark:text-white/50">
                            <div class="h-[10px] w-[10px] rounded-full" style="background-color: ${repo.language_color || ''}"></div> ${repo.main_language}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
})