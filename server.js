import express from 'express';
import dotenv from 'dotenv';
import fetch from 'cross-fetch';
import { createServer } from "http";
import { Server } from "socket.io";
import { WebSocket } from "ws";
import { readFileSync } from 'fs';

dotenv.config();
const app = express();
const server = createServer(app);
const io = new Server(server, { // This socket will be used to send Spotify updates as well as Discord status updates.
    path: '/api/socket.io'
});

let userData = {}; // Cache userData to be able to load the site without having to wait for an update.
let languageColorCache = {}; // Cache languageColor data to use up less resources from constantly calling colors.
let socket = null; // Holds Lanyard socket connection.
let isAttemptingReconnect = false; // Prevent multiple reconnections.

app.use('/public', express.static('public'));
app.set('view engine', 'ejs');

io.on('connection', () => {
    return io.emit('update', userData);
});

app.get('/', async (req, res) => {
    return res.render('index', {
        repos: await fetchUserRepos(process.env.GH_USERNAME) || [],
        icons: getSelectedIcons(),
        status: userData.statusData,
        settings: {
            name: process.env.NAME,
            description: process.env.DESCRIPTION,
            image: `https://cdn.discordapp.com/avatars/${process.env.DISCORD_ID}/${userData.discord_user.avatar}?size=1024`,
            githubUsername: process.env.GH_USERNAME,
            discordID: process.env.DISCORD_ID
        }
    });
});

connectLanyardWebSocket();

// Start the server
const port = process.env.PORT || 3000
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

async function getStatusColor(status) {
    const colors = {
        'online': 'green',
        'idle': 'yellow',
        'dnd': 'red',
        'offline': 'gray'
    };

    const statusText = (status === 'dnd') ? 'Do Not Disturb' : status.charAt(0).toUpperCase() + status.slice(1);

    return {
        color: colors[status] || 'gray',
        status: statusText
    };
}

async function fetchRepoDetails(repo) {
    const topicsUrl = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/topics`;

    const [topicsResponse, languageColor] = await Promise.all([
        fetch(topicsUrl, {
            headers: {
                'Accept': 'application/vnd.github.mercy-preview+json',
                'Authorization': `token ${process.env.GH_PERSONAL_TOKEN}`
            }
        }),
        getLanguageColor(repo.language)
    ]);

    let topics = [];
    if (topicsResponse.ok) {
        const topicsData = await topicsResponse.json();
        topics = topicsData.names;
    }

    const readmeUrl = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/contents/README.md`;
    let imageUrl = null;

    try {
        const readmeResponse = await fetch(readmeUrl, {
            headers: {
                'Authorization': `token ${process.env.GH_PERSONAL_TOKEN}`
            }
        });

        if (readmeResponse.ok) {
            const readmeData = await readmeResponse.json();
            const readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
            imageUrl = extractFirstImageUrl(readmeContent, repo.owner.login, repo.name);
        }
    } catch (error) {
        return;
    }

    return {
        name: repo.name,
        description: repo.description,
        forks_count: repo.forks_count,
        stargazers_count: repo.stargazers_count,
        main_language: repo.language,
        language_color: languageColor,
        topics: topics,
        repo_url: repo.html_url,
        logo: imageUrl
    };
}

function extractFirstImageUrl(readmeContent, owner, repo) {
    const regex = /<img [^>]*src="([^"]*)"/i;
    const match = regex.exec(readmeContent);

    if (match && match[1]) {
        let imagePath = match[1];
        
        if (/^(http|https):\/\/[^ "]+$/.test(imagePath)) {
            return imagePath;
        }

        if (imagePath.startsWith('./')) {
            imagePath = imagePath.substring(2);
        }
        return `https://raw.githubusercontent.com/${owner}/${repo}/main/${imagePath}`;
    }

    return null;
}

async function fetchUserRepos(username) {
    const url = `https://api.github.com/users/${username}/repos`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${process.env.GH_PERSONAL_TOKEN}`
            }
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
        const repos = await response.json();
        const filteredRepos = repos.filter(repo => !process.env.IGNORED_REPOS.split(',').includes(repo.name) && repo.name.toLowerCase() !== username.toLowerCase());
        const detailedRepos = await Promise.all(filteredRepos.map(fetchRepoDetails));
        return detailedRepos;
    } catch (error) {
        return;
    }
}

function getLanguageColor(language) {
    const colors = JSON.parse(readFileSync('./utils/languageColors.json', 'utf-8'))

    if (languageColorCache[language]) {
        return languageColorCache[language];
    }

    languageColorCache[language] = colors[language] || '#000000';
    return colors[language] || '#000000';
}

function connectLanyardWebSocket() {
    if (socket !== null && socket.readyState === WebSocket.OPEN) return;

    isAttemptingReconnect = false;
    socket = new WebSocket("wss://api.lanyard.rest/socket");

    socket.on("open", () => {
        console.log('Connected to Lanyard websocket.');
    });

    socket.on("message", async (eventData) => {
        const data = JSON.parse(eventData);

        if (data.op === 1) {
            socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: process.env.DISCORD_ID } }));

            setInterval(() => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ op: 3 }));
                }
            }, data.d.heartbeat_interval);
        } else if (data.op === 0) {
            const statusColor = await getStatusColor(data.d.discord_status);
            userData = { ...data.d, statusData: statusColor };
            io.emit('update', userData);
        }
    });

    socket.on("close", () => {
        console.log('Lanyard connection is closed. Reconnecting...');
        if (!isAttemptingReconnect) {
            isAttemptingReconnect = true;
            setTimeout(connectLanyardWebSocket, 1000);
        }
    });

    socket.on("error", (error) => {
        console.log('Lanyard connection errored. Closing & reconnecting...', error.message);
        if (!isAttemptingReconnect) {
            socket.close();
            isAttemptingReconnect = true;
            setTimeout(connectLanyardWebSocket, 1000);
        }
    });
}

function getSelectedIcons() {
    const jsonIcons = JSON.parse(readFileSync('./utils/devicons.json', 'utf-8'));

    let selectedIcons = Object.keys(jsonIcons).reduce((acc, category) => {
        acc[category] = [];
        return acc;
    }, {});

    function categoryToEnvVar(category) {
        return category.replace(/ & /g, '_AND_').replace(/ /g, '_').toUpperCase();
    }

    Object.keys(jsonIcons).forEach(category => {
        const envVar = categoryToEnvVar(category);
        const iconNames = process.env[envVar];

        if (iconNames) {
            iconNames.split(',').forEach(iconName => {
                const icon = jsonIcons[category].find(icon => iconName in icon);
                if (icon) {
                    selectedIcons[category].push(icon[iconName]);
                }
            });
        }
    });

    return selectedIcons;
}