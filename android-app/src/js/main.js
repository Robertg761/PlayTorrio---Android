console.log('[MAIN.JS] Script file loaded - this appears BEFORE imports');

import { StorageService } from '../services/storage';
import { TorrentioService } from '../services/scrapers/torrentio';
// DISABLED: WebTorrent has Node.js dependencies incompatible with browser builds
// import { TorrentService } from '../services/torrent';
import { PlayerService } from '../services/player';
import { BookService } from '../services/BookService';
import { MusicService } from '../services/MusicService';


// Shim electronAPI (Enhanced for Android)
window.electronAPI = window.electronAPI || {};
window.electronAPI.platform = 'android';

// -- Fake Backend Interceptor (for Androidless Server) --
const REAL_FETCH = window.fetch;
const MOCK_API_BASE = 'http://mock-backend';

// Redirect old base URL to mock
const API_BASE_URL = MOCK_API_BASE; // Was http://localhost:6987/api

window.fetch = async (url, options) => {
    let urlStr = url.toString();

    // Check if this is a request to our missing backend
    if (urlStr.startsWith(MOCK_API_BASE) || urlStr.includes('localhost:6987')) {
        console.log('[FakeBackend]', options?.method || 'GET', urlStr);
        const path = urlStr.replace(MOCK_API_BASE, '').replace('http://localhost:6987/api', '').split('?')[0];

        // 1. Settings
        if (path === '/settings') {
            const currentSettings = JSON.parse(localStorage.getItem('mock_settings') || '{}');
            if (options?.method === 'POST') {
                const body = JSON.parse(options.body);
                const newSettings = { ...currentSettings, ...body };
                localStorage.setItem('mock_settings', JSON.stringify(newSettings));
                return new Response(JSON.stringify({ success: true, settings: newSettings }), { status: 200 });
            }
            return new Response(JSON.stringify(currentSettings), { status: 200 });
        }

        // 2. Auth / API Key
        if (path === '/check-api-key' || path === '/get-api-key') {
            // Pretend we are always authenticated or let user set key in UI
            return new Response(JSON.stringify({ hasApiKey: true, useTorrentless: true, apiKey: 'mock-key' }), { status: 200 });
        }

        // 3. Resume Points
        if (path === '/resume' || path === '/resume/all') {
            const resumeData = JSON.parse(localStorage.getItem('mock_resume') || '{}');
            if (options?.method === 'POST') {
                const body = JSON.parse(options.body);
                if (body.key) {
                    resumeData[body.key] = body;
                    localStorage.setItem('mock_resume', JSON.stringify(resumeData));
                }
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            if (options?.method === 'DELETE') {
                // extract key from url params if needed, or body
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            // GET
            if (path === '/resume/all') return new Response(JSON.stringify(Object.values(resumeData)), { status: 200 });
            return new Response(JSON.stringify(resumeData), { status: 200 });
        }

        // 4. Debrid (Mock failures gracefully)
        if (path.startsWith('/debrid')) {
            return new Response(JSON.stringify({ success: false, message: 'Debrid not supported in standalone mode yet' }), { status: 200 });
        }

        // Default mock response
        console.warn('[FakeBackend] Unhandled route:', path);
        return new Response(JSON.stringify({ success: false, error: 'Route not mocked' }), { status: 404 });
    }

    // Pass through to real fetch for external APIs (TMDB, etc.)
    return REAL_FETCH(url, options);
};

// -- Mocks for Missing Electron Features --

// 1. Player Mocks (redirect to Capacitor PlayerService)
window.electronAPI.spawnMpvjsPlayer = async (data) => {
    console.log('[ElectronShim] spawnMpvjsPlayer', data);
    try {
        // data.url is the stream URL
        await PlayerService.play(data.url);
        return { success: true };
    } catch (e) {
        console.error('[ElectronShim] Player Error', e);
        return { success: false, message: e.message };
    }
};

window.electronAPI.openMpvDirect = async (url) => {
    console.log('[ElectronShim] openMpvDirect', url);
    try {
        await PlayerService.play(url);
        return { success: true };
    } catch (e) {
        console.error('[ElectronShim] Player Error', e);
        return { success: false, message: e.message };
    }
};

window.electronAPI.openInVLC = async (data) => {
    console.log('[ElectronShim] openInVLC', data);
    const url = typeof data === 'string' ? data : (data.url || data.streamUrl);
    try {
        await PlayerService.playInVlc(url);
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
};

window.electronAPI.openInIINA = async (data) => {
    // IINA is macOS only, fall back to native player
    console.log('[ElectronShim] openInIINA fallback', data);
    const url = typeof data === 'string' ? data : (data.url || data.streamUrl);
    try {
        await PlayerService.play(url);
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
};

window.electronAPI.openMPVDirect = window.electronAPI.openMpvDirect; // Alias check

// 2. System/Shell Mocks
window.electronAPI.openExternal = async (url) => {
    console.log('[ElectronShim] openExternal', url);
    window.open(url, '_system');
    return Promise.resolve();
};

window.electronAPI.showSaveDialog = async () => ({ canceled: true }); // Disable for now
window.electronAPI.showOpenDialog = async () => ({ canceled: true }); // Disable for now
window.electronAPI.writeFile = async () => ({ success: false, error: 'Not supported on Android yet' });
window.electronAPI.readFile = async () => ({ success: false, error: 'Not supported on Android yet' });
window.electronAPI.showFolderInExplorer = async () => { };

// 3. Discord RPC Mocks (No-op)
window.electronAPI.updateDiscordPresence = async () => { };
window.electronAPI.clearDiscordPresence = async () => { };

// 4. Chromecast (Mock failure or stub)
window.electronAPI.discoverChromecastDevices = async () => ({ success: false, devices: [] });
window.electronAPI.castToChromecast = async () => ({ success: false });

// 5. Updater Mocks
window.electronAPI.onUpdateChecking = () => { };
window.electronAPI.onUpdateNotAvailable = () => { };
window.electronAPI.onUpdateAvailable = () => { };
window.electronAPI.onUpdateProgress = () => { };
window.electronAPI.onUpdateDownloaded = () => { };
window.electronAPI.installUpdateNow = async () => { };

// 6. Other Utils
window.electronAPI.clearCache = async () => ({ success: true });
window.electronAPI.selectCacheFolder = async () => ({ canceled: true });
window.electronAPI.clearWebtorrentTemp = async () => ({ success: true });
window.electronAPI.getFullscreen = async () => false;
window.electronAPI.setFullscreen = async () => { };
// UI Mode Management
let currentUIMode = localStorage.getItem('uiMode') || 'new';

// Apply UI mode on page load
function applyUIMode(mode) {
    currentUIMode = mode;
    document.body.classList.remove('ui-old', 'ui-new');
    document.body.classList.add(`ui-${mode}`);
    localStorage.setItem('uiMode', mode);
}

// Initialize UI mode immediately (before DOM loads)
applyUIMode(currentUIMode);

// Theme Management
const themes = {
    'default': {
        primary: '#2a1847',
        secondary: '#8b5cf6',
        tertiary: '#c084fc',
        dark: '#120a1f',
        light: '#f8f9fa',
        gray: '#6c757d',
        accent: '#a855f7',
        cardBg: '#2a1847',
        modalBg: 'linear-gradient(135deg, #2a1847, #120a1f)',
        headerBg: '#2a1847',
        inputBg: 'rgba(255, 255, 255, 0.1)',
        hoverBg: 'rgba(168, 85, 247, 0.2)'
    },
    'green-forest': {
        primary: '#1a3a2e',
        secondary: '#4caf50',
        tertiary: '#81c784',
        dark: '#0f1e17',
        light: '#f1f8f4',
        gray: '#6c8073',
        accent: '#66bb6a',
        cardBg: '#1e4d3a',
        modalBg: 'linear-gradient(135deg, #1a3a2e, #0f1e17)',
        headerBg: '#1a3a2e',
        inputBg: 'rgba(76, 175, 80, 0.15)',
        hoverBg: 'rgba(76, 175, 80, 0.25)'
    },
    'cyberpunk-neon': {
        primary: '#1a1a2e',
        secondary: '#ff00ff',
        tertiary: '#00ffff',
        dark: '#0f0f1e',
        light: '#f0f0ff',
        gray: '#7070a0',
        accent: '#ff00aa',
        cardBg: '#252540',
        modalBg: 'linear-gradient(135deg, #1a1a2e, #0f0f1e)',
        headerBg: '#1a1a2e',
        inputBg: 'rgba(255, 0, 255, 0.15)',
        hoverBg: 'rgba(255, 0, 255, 0.3)'
    },
    'ocean-breeze': {
        primary: '#1e3a5f',
        secondary: '#2196f3',
        tertiary: '#64b5f6',
        dark: '#0d1f36',
        light: '#e3f2fd',
        gray: '#607d8b',
        accent: '#42a5f5',
        cardBg: '#2a4a6f',
        modalBg: 'linear-gradient(135deg, #1e3a5f, #0d1f36)',
        headerBg: '#1e3a5f',
        inputBg: 'rgba(33, 150, 243, 0.15)',
        hoverBg: 'rgba(33, 150, 243, 0.25)'
    },
    'cherry-blossom': {
        primary: '#4a2545',
        secondary: '#ff4081',
        tertiary: '#ff80ab',
        dark: '#1a0e1a',
        light: '#fff0f5',
        gray: '#8e7a8b',
        accent: '#f48fb1',
        cardBg: '#5a3555',
        modalBg: 'linear-gradient(135deg, #4a2545, #1a0e1a)',
        headerBg: '#4a2545',
        inputBg: 'rgba(255, 64, 129, 0.15)',
        hoverBg: 'rgba(255, 64, 129, 0.25)'
    },
    'midnight-dark': {
        primary: '#1c1c2e',
        secondary: '#6366f1',
        tertiary: '#818cf8',
        dark: '#0a0a14',
        light: '#e0e7ff',
        gray: '#64748b',
        accent: '#7c3aed',
        cardBg: '#2a2a40',
        modalBg: 'linear-gradient(135deg, #1c1c2e, #0a0a14)',
        headerBg: '#1c1c2e',
        inputBg: 'rgba(99, 102, 241, 0.15)',
        hoverBg: 'rgba(99, 102, 241, 0.25)'
    },
    'sunset-orange': {
        primary: '#3d2a1f',
        secondary: '#ff9800',
        tertiary: '#ffb74d',
        dark: '#1a0f0a',
        light: '#fff3e0',
        gray: '#8d6e63',
        accent: '#fb8c00',
        cardBg: '#4d3a2f',
        modalBg: 'linear-gradient(135deg, #3d2a1f, #1a0f0a)',
        headerBg: '#3d2a1f',
        inputBg: 'rgba(255, 152, 0, 0.15)',
        hoverBg: 'rgba(255, 152, 0, 0.25)'
    }
};

let currentTheme = localStorage.getItem('appTheme') || 'default';

function applyTheme(themeName) {
    const theme = themes[themeName] || themes['default'];
    const root = document.documentElement;

    // Base colors
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--tertiary', theme.tertiary);
    root.style.setProperty('--dark', theme.dark);
    root.style.setProperty('--light', theme.light);
    root.style.setProperty('--gray', theme.gray);
    root.style.setProperty('--vlc-orange', theme.accent);

    // Extended colors for comprehensive theming
    root.style.setProperty('--card-bg', theme.cardBg);
    root.style.setProperty('--modal-bg', theme.modalBg);
    root.style.setProperty('--header-bg', theme.headerBg);
    root.style.setProperty('--input-bg', theme.inputBg);
    root.style.setProperty('--hover-bg', theme.hoverBg);

    currentTheme = themeName;
    localStorage.setItem('appTheme', themeName);
}

// Initialize theme immediately
applyTheme(currentTheme);

// API configuration
const TMDB_API_KEY = 'b3556f3b206e16f82df4d1f6fd4545e6';
// const API_BASE_URL = 'http://localhost:6987/api'; // REPLACED BY FAKE BACKEND ABOVE

// Streaming Settings (Global)
let useStreamingServers = localStorage.getItem('useStreamingServers') === 'true';
let selectedServer = localStorage.getItem('selectedServer') || 'VidSrc TO';

// Global cache state (accessible from all scopes)
let doneWatchingCache = [];
let myListCache = [];

console.log('[DEBUG] JavaScript loaded, useStreamingServers:', useStreamingServers);

// DOM elements - Home
const moviesGrid = document.getElementById('moviesGrid');
const loadingIndicator = document.getElementById('loadingIndicator');
const homePageEl = document.getElementById('homePage');

// DOM elements - Genres
const genresBtn = document.getElementById('genresBtn');
const genresPageEl = document.getElementById('genresPage');
const genresGrid = document.getElementById('genresGrid');
const genresLoading = document.getElementById('genresLoading');

// DOM elements - Genre Details
const genreDetailsPageEl = document.getElementById('genreDetailsPage');
const genreTitleEl = document.getElementById('genreTitle');
const toggleMoviesBtn = document.getElementById('toggleMovies');
const toggleTVBtn = document.getElementById('toggleTV');
const genreResultsGrid = document.getElementById('genreResultsGrid');
const genreLoadingIndicator = document.getElementById('genreLoadingIndicator');
const genreEmptyMessage = document.getElementById('genreEmptyMessage');

// DOM elements - Modal and others
const detailsModal = document.getElementById('detailsModal');
const modalClose = document.getElementById('modalClose');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalPoster = document.getElementById('modalPoster');
const modalTitle = document.getElementById('modalTitle');
const modalRating = document.getElementById('modalRating');
const modalYear = document.getElementById('modalYear');
const modalRuntime = document.getElementById('modalRuntime');
const modalTagline = document.getElementById('modalTagline');
const modalOverview = document.getElementById('modalOverview');
const castGrid = document.getElementById('castGrid');
const similarGrid = document.getElementById('similarGrid');
const torrentsList = document.getElementById('torrentsList');
const notification = document.getElementById('notification');
const watchNowBtn = document.getElementById('watchNowBtn');
const modalDoneWatchingBtn = document.getElementById('modalDoneWatchingBtn');
const traktWatchlistBtn = document.getElementById('traktWatchlistBtn');
const seasonsContainer = document.getElementById('seasonsContainer');
const seasonSelector = document.getElementById('seasonSelector');
const episodesGrid = document.getElementById('episodesGrid');
const refreshTorrents = document.getElementById('refreshTorrents');
const torrentsContainer = document.getElementById('torrentsContainer');
const torrentKeywordFilter = document.getElementById('torrentKeywordFilter');

// API Setup Modal elements - REMOVED (modal disabled)
const apiSetupModal = null; // Modal removed
const firstTimeApiKey = null;
const saveFirstTimeApiKey = null;
const openJackettLinkBtn = null;

// Donate modal removed - no DOM elements

// Discord Modal elements
const discordModal = document.getElementById('discordModal');
const discordClose = document.getElementById('discordClose');
const discordJoinBtn = document.getElementById('discordJoinBtn');
const discordDontShowBtn = document.getElementById('discordDontShowBtn');
const discordBtn = document.getElementById('discordBtn');

// Settings Modal elements
const settingsModal = document.getElementById('settingsModal');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const settingsClose = document.getElementById('settingsClose');
const currentApiKey = document.getElementById('currentApiKey');
const newApiKey = document.getElementById('newApiKey');
const saveSettings = document.getElementById('saveSettings');
const cancelSettings = document.getElementById('cancelSettings');
const useTorrentlessToggle = document.getElementById('useTorrentlessToggle');
const jackettUrlInput = document.getElementById('jackettUrl');
const cacheLocationInput = document.getElementById('cacheLocation');
const selectCacheBtn = document.getElementById('selectCacheBtn');
// Debrid controls
const useDebridToggle = document.getElementById('useDebridToggle');
const debridProviderSel = document.getElementById('debridProvider');
const debridStatus = document.getElementById('debridStatus');
const debridTokenInput = document.getElementById('debridToken');
const saveDebridTokenBtn = document.getElementById('saveDebridToken');
const clearDebridTokenBtn = document.getElementById('clearDebridToken');
const rdClientIdInput = document.getElementById('rdClientId');
const rdDeviceLoginBtn = document.getElementById('rdDeviceLogin');
const rdClientIdGroup = document.getElementById('rdClientIdGroup');
const rdButtons = document.getElementById('rdButtons');
const rdTokenGroup = document.getElementById('rdTokenGroup');
const rdTokenButtons = document.getElementById('rdTokenButtons');
const rdCodePanel = document.getElementById('rdCodePanel');
const rdUserCodeEl = document.getElementById('rdUserCode');
const rdVerifyUrlEl = document.getElementById('rdVerifyUrl');
const rdOpenVerifyBtn = document.getElementById('rdOpenVerify');
const rdCopyCodeBtn = document.getElementById('rdCopyCode');
const rdCancelLoginBtn = document.getElementById('rdCancelLogin');
const rdLoginStatusEl = document.getElementById('rdLoginStatus');
// AllDebrid controls
const adSection = document.getElementById('adSection');
const adStartPinBtn = document.getElementById('adStartPin');
const adPinPanel = document.getElementById('adPinPanel');
const adPinCodeEl = document.getElementById('adPinCode');
const adUserUrlEl = document.getElementById('adUserUrl');
const adOpenUserUrlBtn = document.getElementById('adOpenUserUrl');
const adCopyPinBtn = document.getElementById('adCopyPin');
const adCancelPinBtn = document.getElementById('adCancelPin');
const adLoginStatusEl = document.getElementById('adLoginStatus');
const adApiKeyInput = document.getElementById('adApiKey');
const adSaveApiKeyBtn = document.getElementById('adSaveApiKey');
const adClearApiKeyBtn = document.getElementById('adClearApiKey');
// TorBox controls
const tbSection = document.getElementById('tbSection');
const tbTokenInput = document.getElementById('tbToken');
const tbSaveTokenBtn = document.getElementById('tbSaveToken');
const tbClearTokenBtn = document.getElementById('tbClearToken');
// Premiumize controls
const pmSection = document.getElementById('pmSection');
const pmApiKeyInput = document.getElementById('pmApiKey');
const pmSaveApiKeyBtn = document.getElementById('pmSaveApiKey');
const pmClearApiKeyBtn = document.getElementById('pmClearApiKey');

// Trakt controls
const traktNotConnected = document.getElementById('traktNotConnected');
const traktConnected = document.getElementById('traktConnected');
const traktStatus = document.getElementById('traktStatus');
const traktConnectedStatus = document.getElementById('traktConnectedStatus');
const traktUsername = document.getElementById('traktUsername');
const traktLoginBtn = document.getElementById('traktLogin');
const traktViewWatchlistBtn = document.getElementById('traktViewWatchlist');
const traktViewHistoryBtn = document.getElementById('traktViewHistory');
const traktViewStatsBtn = document.getElementById('traktViewStats');
const traktDisconnectBtn = document.getElementById('traktDisconnect');
const traktCodePanel = document.getElementById('traktCodePanel');
const traktUserCodeEl = document.getElementById('traktUserCode');
const traktVerifyUrlEl = document.getElementById('traktVerifyUrl');
const traktOpenVerifyBtn = document.getElementById('traktOpenVerify');
const traktCopyCodeBtn = document.getElementById('traktCopyCode');
const traktCancelLoginBtn = document.getElementById('traktCancelLogin');
const traktLoginStatusEl = document.getElementById('traktLoginStatus');
const traktAutoScrobbleToggle = document.getElementById('traktAutoScrobble');
const traktScrobbleProgressToggle = document.getElementById('traktScrobbleProgress');
const traktSyncWatchlistToggle = document.getElementById('traktSyncWatchlist');

// MPV Player elements
const mpvPlayerContainer = document.getElementById('mpvPlayerContainer');
const playerTitle = document.getElementById('mpvPlayerTitle');
const closePlayerBtn = document.getElementById('closePlayerBtn');
const fileSelector = document.getElementById('fileSelector');
const fileList = document.getElementById('fileList');
const subtitleControls = document.getElementById('subtitleControls');
const subtitleList = document.getElementById('subtitleList');
const mpvPlayerArea = document.getElementById('mpvPlayerArea');
const mpvLoading = document.getElementById('mpvLoading');
const mpvControls = document.getElementById('mpvControls');
// Helper: get base filename from a path
function baseName(p) {
    try { return String(p || '').split(/[\\\/]/).pop(); } catch (_) { return p || ''; }
}
const openMPVBtn = document.getElementById('openMPVBtn');
const openVLCBtn = document.getElementById('openVLCBtn');

// On macOS, change MPV button to IINA
if (window.electronAPI && window.electronAPI.platform === 'darwin') {
    if (openMPVBtn) {
        openMPVBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open in IINA';
        openMPVBtn.id = 'openIINABtn'; // Change ID for clarity
    }
}

const copyStreamBtn = document.getElementById('copyStreamBtn');
const playNowBtn = document.getElementById('playNowBtn');
const streamSourceBadge = document.getElementById('streamSourceBadge');

// Custom Player elements
const customPlayerContainer = document.getElementById('customPlayerContainer');
const customPlayerTitle = document.getElementById('customPlayerTitle');
const customSourceBadge = document.getElementById('customSourceBadge');
const closeCustomPlayer = document.getElementById('closeCustomPlayer');
const customVideo = document.getElementById('customVideo');
const videoSource = document.getElementById('videoSource');
const loadingOverlay = document.getElementById('loadingOverlay');
const subtitleDisplay = document.getElementById('subtitleDisplay');
const videoControls = document.getElementById('videoControls');
const progressBar = document.getElementById('progressBar');
const progressFilled = document.getElementById('progressFilled');
const currentTime = document.getElementById('currentTime');
const totalTime = document.getElementById('totalTime');
const playPauseBtn = document.getElementById('playPauseBtn');
const rewindBtn = document.getElementById('rewindBtn');
const forwardBtn = document.getElementById('forwardBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const subtitleFile = document.getElementById('subtitleFile');
const htmlMuteBtn = document.getElementById('htmlMuteBtn');
const htmlVolume = document.getElementById('htmlVolume');
const htmlSubsBtn = document.getElementById('htmlSubsBtn');
const htmlSubsPanel = document.getElementById('htmlSubsPanel');
const htmlSubsList = document.getElementById('htmlSubsList');
const htmlSubsClose = document.getElementById('htmlSubsClose');

// Subtitle customization elements
const htmlSubsUploadBtn = document.getElementById('htmlSubsUploadBtn');
const subsSizeInput = document.getElementById('subsSize');
const subsSizeValue = document.getElementById('subsSizeValue');
const subsColorInput = document.getElementById('subsColor');
const subsBackgroundInput = document.getElementById('subsBackground');
const subsBackgroundOpacityInput = document.getElementById('subsBackgroundOpacity');
const subsOpacityValue = document.getElementById('subsOpacityValue');
const subsFontSelect = document.getElementById('subsFont');

// Subtitle settings
let subtitleSettings = {
    size: 22,
    color: '#ffffff',
    background: '#000000',
    backgroundOpacity: 75,
    font: 'Arial, sans-serif'
};

// WCJS Player elements
const wcjsPlayerContainer = document.getElementById('wcjsPlayerContainer');
const wcjsPlayerTitle = document.getElementById('wcjsPlayerTitle');
const wcjsCanvas = document.getElementById('wcjsCanvas');
const wcjsLoading = document.getElementById('wcjsLoading');
const closeWcjsPlayer = document.getElementById('closeWcjsPlayer');
const wcjsControls = document.getElementById('wcjsControls');
const wcjsProgressBar = document.getElementById('wcjsProgressBar');
const wcjsProgressFilled = document.getElementById('wcjsProgressFilled');
const wcjsCurrentTime = document.getElementById('wcjsCurrentTime');
const wcjsTotalTime = document.getElementById('wcjsTotalTime');
const wcjsPlayPauseBtn = document.getElementById('wcjsPlayPauseBtn');
const wcjsRewindBtn = document.getElementById('wcjsRewindBtn');
const wcjsForwardBtn = document.getElementById('wcjsForwardBtn');
const wcjsFullscreenBtn = document.getElementById('wcjsFullscreenBtn');
const wcjsMuteBtn = document.getElementById('wcjsMuteBtn');
const wcjsVolume = document.getElementById('wcjsVolume');
const wcjsSubtitleFile = document.getElementById('wcjsSubtitleFile');
const wcjsSubsBtn = document.getElementById('wcjsSubsBtn');
const wcjsAudioBtn = document.getElementById('wcjsAudioBtn');
const wcjsSubsPanel = document.getElementById('wcjsSubsPanel');
const wcjsAudioPanel = document.getElementById('wcjsAudioPanel');
const wcjsSubsList = document.getElementById('wcjsSubsList');
const wcjsAudioList = document.getElementById('wcjsAudioList');
const wcjsSubsRefresh = document.getElementById('wcjsSubsRefresh');
const wcjsSubsClose = document.getElementById('wcjsSubsClose');
const wcjsAudioClose = document.getElementById('wcjsAudioClose');

// Global variables
let currentPage = 1; // home page pagination
let isLoading = false; // route-scoped loading flag
let currentContent = null;
let currentMediaType = 'movie';
let currentMovie = null; // Store current movie/show data for Trakt
let currentSeason = 1;
let torrentsLoaded = false;
let currentTorrentData = null;
let currentStreamUrl = null;
let currentSelectedVideoName = null; // track selected torrent file name
let currentDebridTorrentId = null; // track active debrid torrent ID for cleanup
// Guard to cancel debrid polling when user exits or starts a new debrid flow
let debridFlowSession = 0;
let currentSubtitleUrl = null;
let currentSubtitles = [];
let subtitleTrack = null;
let currentSubtitleFile = null; // filename served under /subtitles to delete on switch
let selectedProvider = 'jackett'; // Default provider: jackett, torrentio, torrentless, nuvio, comet, 111477, moviebox
let lastSearchedSeason = null; // Track last searched season for provider switching
let lastSearchedEpisode = null; // Track last searched episode for provider switching

// Sort and Filter state
let currentSort = 'popularity'; // popularity, rating, date
let currentFilter = 'all'; // all, hd, 4k
let allMoviesCache = []; // Cache for sorting/filtering

// Resume state
let resumeKey = null; // stable key per item (provider/hash/file or direct link)
let resumeInfo = null; // { position, duration, updatedAt }
let resumeTimer = null;
let lastResumeSend = 0;
let hasApiKey = false;
let useTorrentless = false; // global toggle for Torrentless mode
let useDebrid = false; // global toggle for Debrid
let debridAuth = false; // token presence depending on provider
let debridProvider = 'realdebrid';
let rdAvailabilityDisabled = false; // flag when RD instant availability endpoint is disabled
let currentCategory = 'all';
let allTorrents = [];
let torrentsPage = 1;
const torrentsPerPage = 20;
let torrentSortMode = 'seeders'; // 'seeders' | 'size-asc' | 'size-desc'
let torrentSizeFilter = 'all'; // 'all' | 'gte-1g' | 'gte-2g' | '2-4g' | '4-8g' | 'gte-8g'
let allNuvioStreams = []; // Cache for Nuvio streams to enable sorting

/**
 * Reset all streaming-related state to ensure clean slate for new streams.
 * Call this when closing player AND before starting a new stream.
 */
function resetStreamingState() {
    console.log('[Cleanup] Resetting streaming state...');

    // Core stream data
    currentStreamUrl = null;
    currentTorrentData = null;
    currentSelectedVideoName = null;

    // Debrid state
    currentDebridTorrentId = null;

    // Subtitle state
    currentSubtitleUrl = null;
    currentSubtitleFile = null;

    // Resume state for this stream
    resumeKey = null;
    resumeInfo = null;
    if (resumeTimer) {
        clearInterval(resumeTimer);
        resumeTimer = null;
    }

    // Destroy HLS instance if exists
    if (window.hls) {
        try {
            window.hls.destroy();
            console.log('[Cleanup] HLS instance destroyed');
        } catch (e) {
            console.warn('[Cleanup] Error destroying HLS:', e?.message);
        }
        window.hls = null;
    }

    console.log('[Cleanup] Streaming state reset complete');
}

// Search state tracking
let isSearchMode = false;
let lastSearchResults = [];
let lastSearchQuery = '';

// Discord Rich Presence tracking
let discordStreamingActive = false;
let discordMusicActive = false;
let discordActivityEnabled = true; // Cached value, updated when settings change

// Check if Discord activity is enabled
async function isDiscordActivityEnabled() {
    try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        if (res.ok) {
            const settings = await res.json();
            // Default ON if missing (undefined), but respect explicit false
            discordActivityEnabled = settings.discordActivity === undefined ? true : settings.discordActivity;
            return discordActivityEnabled;
        }
    } catch (e) {
        console.error('[Discord] Failed to check activity setting:', e);
    }
    return discordActivityEnabled; // Return cached value if error
}

// Update Discord presence for streaming
async function updateDiscordForStreaming(contentTitle, provider = 'PlayTorrio', season = null) {
    if (!window.electronAPI?.updateDiscordPresence) return;

    // Check if Discord activity is enabled
    const activityEnabled = await isDiscordActivityEnabled();
    if (!activityEnabled) {
        // Clear Discord presence if disabled
        if (discordStreamingActive) {
            try {
                await window.electronAPI.updateDiscordPresence(null);
                discordStreamingActive = false;
            } catch (e) {
                console.error('[Discord] Failed to clear presence:', e);
            }
        }
        return;
    }

    try {
        discordStreamingActive = true;

        // For TV shows, append season info (no episode number)
        let displayTitle = contentTitle;
        if (season !== null && season !== undefined) {
            displayTitle = `${contentTitle} - Season ${season}`;
        }

        const details = `Watching: ${displayTitle}`;
        const state = `via ${provider}`;

        await window.electronAPI.updateDiscordPresence({
            details,
            state,
            startTimestamp: new Date(),
            largeImageKey: 'icon',
            largeImageText: 'PlayTorrio App',
            smallImageKey: 'play',
            smallImageText: 'Streaming',
            buttons: [
                { label: 'Download App', url: 'https://github.com/ayman707-ux/PlayTorrio' }
            ]
        });
    } catch (e) {
        console.error('[Discord] Failed to update streaming presence:', e);
    }
}

// Update Discord presence for music
async function updateDiscordForMusic(songTitle, artist, album) {
    if (!window.electronAPI?.updateDiscordPresence) return;

    // Check if Discord activity is enabled
    const activityEnabled = await isDiscordActivityEnabled();
    if (!activityEnabled) {
        // Clear Discord presence if disabled
        if (discordMusicActive) {
            try {
                await window.electronAPI.updateDiscordPresence(null);
                discordMusicActive = false;
            } catch (e) {
                console.error('[Discord] Failed to clear presence:', e);
            }
        }
        return;
    }

    try {
        discordMusicActive = true;
        const details = `🎵 ${songTitle}`;
        const state = artist ? `by ${artist}${album ? ` - ${album}` : ''}` : (album || 'Music');

        await window.electronAPI.updateDiscordPresence({
            details,
            state,
            startTimestamp: new Date(),
            largeImageKey: 'icon',
            largeImageText: 'PlayTorrio App',
            smallImageKey: 'music',
            smallImageText: 'Listening',
            buttons: [
                { label: 'Download App', url: 'https://github.com/ayman707-ux/PlayTorrio' }
            ]
        });
    } catch (e) {
        console.error('[Discord] Failed to update music presence:', e);
    }
}

// Clear Discord presence
async function clearDiscordPresence() {
    if (!window.electronAPI?.clearDiscordPresence) return;

    try {
        discordStreamingActive = false;
        discordMusicActive = false;
        await window.electronAPI.clearDiscordPresence();
    } catch (e) {
        console.error('[Discord] Failed to clear presence:', e);
    }
}

// Cache for filename -> TMDB lookup
const filenameTmdbCache = new Map();

// Parse title/season/episode from a torrent filename
function parseFromFilename(name = '') {
    try {
        const base = String(name).replace(/\.[^.]+$/, '');
        const cleaned = base
            .replace(/[\[\(].*?[\)\]]/g, ' ')
            .replace(/[_]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
        const patterns = [
            { re: /(s)(\d{1,2})[ ._-]*e(\d{1,3})/i, season: 2, episode: 3 },
            { re: /\b(\d{1,2})[xX](\d{1,3})\b/, season: 1, episode: 2 },
            { re: /\b(\d{1,2})[ ._-]+(\d{1,2})\b/, season: 1, episode: 2 },
        ];
        let season = null, episode = null, title = cleaned, m = null, idx = -1;
        for (const p of patterns) {
            const mm = cleaned.match(p.re);
            if (mm) {
                const sVal = parseInt(mm[p.season], 10);
                const eVal = parseInt(mm[p.episode], 10);
                if (!isNaN(sVal) && !isNaN(eVal) && sVal <= 99 && eVal <= 999) {
                    season = sVal; episode = eVal; m = mm; idx = mm.index; break;
                }
            }
        }
        if (m && idx >= 0) title = cleaned.slice(0, idx).replace(/[-_.]+$/, '').trim();
        title = title
            .replace(/\b(\d{3,4}p|4k|bluray|web[- ]?dl|webrip|bdrip|hdr|dv|x264|x265|hevc|h264)\b/ig, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        const type = season && episode ? 'tv' : 'movie';
        return { title, season, episode, type };
    } catch { return { title: '', season: null, episode: null, type: 'movie' }; }
}

async function getTmdbFromFilename(filename) {
    if (!filename) return null;
    if (filenameTmdbCache.has(filename)) return filenameTmdbCache.get(filename);
    const parsed = parseFromFilename(filename);
    const result = { id: null, type: parsed.type, season: parsed.season, episode: parsed.episode, title: parsed.title };
    if (!parsed.title) { filenameTmdbCache.set(filename, result); return result; }
    try {
        const endpoint = parsed.type === 'tv' ? 'search/tv' : 'search/movie';
        const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(parsed.title)}`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            const items = Array.isArray(data.results) ? data.results : [];
            if (items.length) {
                result.id = items[0].id;
            }
        }
    } catch { }
    filenameTmdbCache.set(filename, result);
    return result;
}

// Routing and genres state
let activeRoute = 'home';
let genresMap = new Map(); // nameLower -> { name, movieId?, tvId? }
let genresLoaded = false;
let currentGenre = null; // {name, movieId?, tvId?}
let currentGenreType = 'movie'; // 'movie' | 'tv'
let genreCurrentPage = 1;

// Initialize the app
function initializeCast() {
    // Wait for Cast SDK to load
    window['__onGCastApiAvailable'] = function (isAvailable) {
        if (isAvailable) {
            try {
                const castContext = window.cast.framework.CastContext.getInstance();
                castContext.setOptions({
                    receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                    autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
                });
                console.log('Google Cast initialized successfully');
            } catch (error) {
                console.error('Error initializing Cast:', error);
            }
        }
    };
}

async function init() {
    // UI Init - Do this first so the app feels responsive
    setupMobileNavigation(); // Initialize mobile bottom navigation
    setupEventListeners();
    initializeSettingsTabs(); // Initialize settings page tab switching

    // Backend Init - potentially flaky on Android without local server
    try {
        await checkApiKeyStatus();
    } catch (e) {
        console.warn('Backend check failed (expected on Android without server):', e);
    }

    try {
        await ensureDebridState();
    } catch (e) {
        console.warn('Debrid state check failed:', e);
    }

    if (typeof initIptvSourceSelector === 'function') initIptvSourceSelector(); // Initialize IPTV dropdown
    if (typeof initializeBookTorrio === 'function') initializeBookTorrio(); // Initialize BookTorrio functionality
    if (typeof initializeAudioBooks === 'function') initializeAudioBooks(); // Initialize AudioBooks functionality
    if (typeof initializeAnime === 'function') initializeAnime(); // Initialize Anime functionality
    // Comics initialization moved to showSection when page is shown
    if (typeof initializeManga === 'function') initializeManga(); // Initialize Manga functionality

    if (typeof setWindowsUsername === 'function') setWindowsUsername(); // Set Windows username in sidebar
    if (typeof handleRoute === 'function') handleRoute(); // route-aware initial load

    // Update announcement modals removed
    if (typeof checkDiscordPrompt === 'function') checkDiscordPrompt(); // Show Discord modal if user hasn't joined
    if (typeof initializeCast === 'function') initializeCast(); // Initialize Google Cast SDK

    // Initialize new UI components if enabled
    if (document.body.classList.contains('ui-new')) {
        console.log('[DEBUG] ui-new class found, calling initializeNewUI...');
        await initializeNewUI();
    }

    // Initialize mobile sidebar hamburger menu
    console.log('[DEBUG] Calling initMobileSidebar...');
    initMobileSidebar();
}

// Mobile Sidebar Logic - defined at module scope so it's available when init() runs
function initMobileSidebar() {
    console.log('[MobileSidebar] Initializing mobile sidebar...');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const appSidebar = document.getElementById('appSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    console.log('[MobileSidebar] Elements found:', {
        mobileMenuBtn: !!mobileMenuBtn,
        appSidebar: !!appSidebar,
        sidebarOverlay: !!sidebarOverlay,
        sidebarCloseBtn: !!sidebarCloseBtn
    });

    // Function to toggle sidebar
    function toggleSidebar(show) {
        console.log('[MobileSidebar] toggleSidebar called with show:', show);

        if (!appSidebar || !sidebarOverlay) {
            console.error('[MobileSidebar] Missing elements - cannot toggle sidebar');
            return;
        }

        if (show) {
            console.log('[MobileSidebar] Adding mobile-open class');
            appSidebar.classList.add('mobile-open');
            sidebarOverlay.classList.add('active');
            document.body.classList.add('sidebar-open');
            document.body.style.overflow = 'hidden';
        } else {
            appSidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
            document.body.style.overflow = '';
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            console.log('[MobileSidebar] Hamburger button clicked!');
            e.stopPropagation();
            toggleSidebar(true);
        });
    } else {
        console.error('[MobileSidebar] mobileMenuBtn not found!');
    }

    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }

    // Handle Sidebar Settings & Quick Acts
    const sidebarSettings = document.getElementById('sidebarSettings');
    if (sidebarSettings) {
        sidebarSettings.addEventListener('click', () => {
            toggleSidebar(false);
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                settingsModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    }

    const quickRefresh = document.getElementById('quickRefresh');
    if (quickRefresh) {
        quickRefresh.addEventListener('click', () => {
            toggleSidebar(false);
            window.location.reload();
        });
    }

    // Close sidebar when clicking on a nav item AND Navigate
    const navItems = document.querySelectorAll('.app-sidebar .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            toggleSidebar(false);
            const page = item.getAttribute('data-page');
            if (page) {
                if (page === 'home') window.location.hash = '#/';
                else window.location.hash = '#/' + page;
            }
        });
    });

    // Handle resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) toggleSidebar(false);
    });
}

function setupMobileNavigation() {
    const navItems = document.querySelectorAll('.bottom-nav-item');
    console.log('[MobileNav] Setting up listeners for', navItems.length, 'items');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const page = item.dataset.page;
            console.log('[MobileNav] Clicked:', page);

            if (page) {
                // Handle navigation
                let newHash = '';
                if (page === 'home') newHash = '#/';
                else newHash = '#/' + page;

                // If hash is different, browser handles it.
                // If hash is same, we might want to force a refresh of the view?
                if (window.location.hash === newHash) {
                    console.log('[MobileNav] Already on page, forcing view update');
                    // Manually trigger handleRoute logic for current page if needed
                    // handleRoute(); // This might cause double-fetch, but safe to leave to router usually.
                    // For now, just ensure UI reflects it.
                    updateActiveSection(page === 'home' ? 'home' : (page === 'genres' ? 'genreDetails' : page));
                } else {
                    window.location.hash = newHash;
                }
            }
        });
    });
}

// Set Windows username from temp directory path
function setWindowsUsername() {
    const usernameEl = document.getElementById('windowsUsername');
    if (usernameEl) {
        try {
            // Try to get username from electron API first
            if (window.electronAPI && window.electronAPI.getUsername) {
                window.electronAPI.getUsername().then(result => {
                    if (result.success && result.username) {
                        usernameEl.textContent = result.username;
                    }
                }).catch(() => {
                    // Fallback to extracting from temp path
                    fallbackUsernameExtraction(usernameEl);
                });
            } else {
                // Fallback to extracting from temp path
                fallbackUsernameExtraction(usernameEl);
            }
        } catch (error) {
            console.error('Error getting username:', error);
        }
    }
}

// Fallback method to extract username from localStorage or other sources
function fallbackUsernameExtraction(usernameEl) {
    // Try to extract from previously stored cache location or temp directory
    const cacheLocation = localStorage.getItem('cacheLocation');
    if (cacheLocation && cacheLocation.includes('Users\\')) {
        const match = cacheLocation.match(/Users\\([^\\]+)/);
        if (match && match[1]) {
            usernameEl.textContent = match[1];
            return;
        }
    }
    // If no cache location, try to get it from API
    fetch(`${API_BASE_URL}/settings`).then(res => res.json()).then(settings => {
        if (settings.cacheLocation && settings.cacheLocation.includes('Users\\')) {
            const match = settings.cacheLocation.match(/Users\\([^\\]+)/);
            if (match && match[1]) {
                usernameEl.textContent = match[1];
            }
        }
    }).catch(() => { });
}

// Check if user has joined Discord and show modal if not
async function checkDiscordPrompt() {
    try {
        // Use file-based preference for reliability on Linux
        const result = (await StorageService.get('discord_dismissed')) === 'true';
        const dismissed = result?.success ? result.value : localStorage.getItem('pt_discord_dismissed_v1');

        if (!dismissed) {
            // Wait a bit for the page to fully load before showing the discord modal
            setTimeout(() => {
                showDiscordModal();
            }, 1000);
        }
    } catch (err) {
        console.error('[Discord] Failed to check preference:', err);
        // Fallback to localStorage
        const hasJoinedDiscord = localStorage.getItem('pt_discord_dismissed_v1');
        if (!hasJoinedDiscord) {
            setTimeout(() => {
                showDiscordModal();
            }, 1000);
        }
    }
}

// Show Discord modal
function showDiscordModal() {
    if (discordModal) {
        discordModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Hide Discord modal
function hideDiscordModal() {
    if (discordModal) {
        discordModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Show Update modal
function showUpdateModal() {
    const updateModal = document.getElementById('updateModal');
    if (updateModal) {
        updateModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Hide Update modal
function hideUpdateModal() {
    const updateModal = document.getElementById('updateModal');
    if (updateModal) {
        updateModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Check if user has seen the update announcement
function checkUpdateAnnouncement() {
    // Update key for v1.5.3 so existing users see the new notes
    const hasSeenUpdate = localStorage.getItem('hasSeenUpdate_v153');
    if (!hasSeenUpdate) {
        // Wait a bit for the page to fully load before showing the update modal
        setTimeout(() => {
            showUpdateModal();
            localStorage.setItem('hasSeenUpdate_v153', 'true');
        }, 1500);
    }
}

// Check if this is the first launch and show donate modal
function checkFirstLaunch() {
    const hasSeenDonateModal = localStorage.getItem('hasSeenDonateModal');
    if (!hasSeenDonateModal) {
        // Wait a bit for the page to fully load before showing the donate modal
        setTimeout(() => {
            showDonateModal();
            localStorage.setItem('hasSeenDonateModal', 'true');
        }, 500);
    }
}

// v1.6.3 modal controls
function showVersion163Modal() {
    const modal = document.getElementById('version163Modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}
function hideVersion163Modal() {
    const modal = document.getElementById('version163Modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Get provider display name for notifications and UI
function getProviderDisplayName(provider) {
    switch (provider) {
        case 'alldebrid': return 'AllDebrid';
        case 'torbox': return 'TorBox';
        case 'premiumize': return 'Premiumize';
        case 'realdebrid':
        default: return 'Real‑Debrid';
    }
}

// Ensure debrid flags are loaded at startup and before streaming
async function ensureDebridState() {
    try {
        const r = await fetch(`${API_BASE_URL}/settings`);
        if (r.ok) {
            const s = await r.json();
            useDebrid = !!s.useDebrid;
            debridAuth = !!s.debridAuth;
            debridProvider = s.debridProvider || 'realdebrid';
            console.log('[UI][Debrid] state', { useDebrid, debridAuth, debridProvider });
        }
    } catch (e) { console.warn('[UI][Debrid] state load failed', e?.message); }
}

// Check API key status
async function checkApiKeyStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/check-api-key`);
        const data = await response.json();
        hasApiKey = data.hasApiKey;
        useTorrentless = !!data.useTorrentless;
        // Modal removed - no longer showing setup prompt
        if (hasApiKey || useTorrentless) {
            await loadCurrentApiKey();
        }
    } catch (error) {
        console.error('Error checking API key status:', error);
        // Modal removed - silently continue
    }
}

// Load current API key for display
async function loadCurrentApiKey() {
    try {
        const response = await fetch(`${API_BASE_URL}/get-api-key`);
        const data = await response.json();

        const text = data.hasApiKey ? `Current: ${data.apiKey}` : 'No API key configured';
        // Update ALL elements with id currentApiKey (there are duplicates)
        document.querySelectorAll('#currentApiKey').forEach(el => {
            el.textContent = text;
        });
    } catch (error) {
        console.error('Error loading current API key:', error);
        // Also fetch debrid settings for global flags
        try {
            const sres = await fetch(`${API_BASE_URL}/settings`);
            if (sres.ok) {
                const s = await sres.json();
                useDebrid = !!s.useDebrid;
                debridAuth = !!s.debridAuth;
            }
        } catch (_) { }
        document.querySelectorAll('#currentApiKey').forEach(el => {
            el.textContent = 'Error loading API key';
        });
    }
}

// Show API setup modal - DISABLED (modal removed)
function showApiSetupModal() {
    // Modal removed - do nothing
}

// Hide API setup modal - DISABLED (modal removed)
function hideApiSetupModal() {
    // Modal removed - do nothing
}

// Donate modal functionality removed

// Show settings modal
async function showSettingsModal() {
    // Navigate to settings page instead of showing modal
    window.location.hash = '#/settings';
}

// Load all settings data
async function loadSettingsData() {
    await loadCurrentApiKey();

    // Clear API key input for ALL instances
    const newApiKeyElements = document.querySelectorAll('#newApiKey');
    newApiKeyElements.forEach(input => {
        input.value = '';
    });

    // Load UI mode setting for ALL instances
    const uiModeNewElements = document.querySelectorAll('#uiModeNew');
    const uiModeOldElements = document.querySelectorAll('#uiModeOld');

    uiModeNewElements.forEach(el => {
        if (currentUIMode === 'new') {
            el.checked = true;
        }
    });
    uiModeOldElements.forEach(el => {
        if (currentUIMode === 'old') {
            el.checked = true;
        }
    });

    // Load theme setting for ALL instances
    const themeSelectors = document.querySelectorAll('#themeSelector');
    themeSelectors.forEach(themeSelector => {
        if (themeSelector) {
            themeSelector.value = currentTheme;
        }
    });

    // Load fullscreen setting for ALL instances
    const fullscreenToggles = document.querySelectorAll('#fullscreenToggle');

    // Check Trakt authentication status
    await checkTraktStatus();
    if (fullscreenToggles.length > 0 && window.electronAPI && window.electronAPI.getFullscreen) {
        try {
            const result = await window.electronAPI.getFullscreen();
            if (result.success) {
                fullscreenToggles.forEach(toggle => {
                    toggle.checked = result.isFullscreen;
                });
            }
        } catch (error) {
            console.error('Error loading fullscreen state:', error);
        }
    }

    // Load useTorrentless setting state for ALL instances
    try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        if (res.ok) {
            const s = await res.json();
            console.log('[Settings] Loaded settings:', s);
            useTorrentless = !!s.useTorrentless;
            // Auto‑Updater toggle (default ON if missing)
            const autoUpdate = s.autoUpdate !== false; // treat undefined as true
            const autoUpdateToggles = document.querySelectorAll('#autoUpdateToggle');
            autoUpdateToggles.forEach(t => { t.checked = !!autoUpdate; });

            // Discord Activity toggle (default ON if missing)
            const discordActivity = s.discordActivity === undefined ? true : s.discordActivity;
            discordActivityEnabled = discordActivity; // Update cached value
            const discordActivityToggles = document.querySelectorAll('#discordActivityToggle');
            discordActivityToggles.forEach(t => { t.checked = !!discordActivity; });

            const useTorrentlessToggles = document.querySelectorAll('#useTorrentlessToggle');
            useTorrentlessToggles.forEach(toggle => {
                toggle.checked = useTorrentless;
            });
            // Load torrent source preference (default to 'torrentio')
            const currentSource = s.torrentSource || 'torrentio';
            console.log('[Settings] Set torrent source to:', currentSource);

            // Update button states for ALL instances
            const torrentioBtns = document.querySelectorAll('#torrentioBtn');
            const inAppScraperBtns = document.querySelectorAll('#inAppScraperBtn');
            if (torrentioBtns.length > 0 && inAppScraperBtns.length > 0) {
                if (currentSource === 'torrentio') {
                    torrentioBtns.forEach(btn => btn.classList.add('active'));
                    inAppScraperBtns.forEach(btn => btn.classList.remove('active'));
                } else {
                    torrentioBtns.forEach(btn => btn.classList.remove('active'));
                    inAppScraperBtns.forEach(btn => btn.classList.add('active'));
                }
            }
            // Load Jackett URL for ALL instances
            const jackettUrlElements = document.querySelectorAll('#jackettUrl');
            if (jackettUrlElements.length > 0 && s.jackettUrl) {
                jackettUrlElements.forEach(input => {
                    input.value = s.jackettUrl;
                });
            }
            // Load cache location for ALL instances
            const cacheLocationElements = document.querySelectorAll('#cacheLocation');
            if (cacheLocationElements.length > 0 && s.cacheLocation) {
                cacheLocationElements.forEach(input => {
                    input.value = s.cacheLocation;
                });
            }
            // Debrid: populate form for ALL instances
            const useDebridToggles = document.querySelectorAll('#useDebridToggle');
            if (useDebridToggles.length > 0 && s.useDebrid !== undefined) {
                useDebridToggles.forEach(toggle => {
                    toggle.checked = !!s.useDebrid;
                });
            }

            const prov = s.debridProvider || 'realdebrid';
            const debridProviders = document.querySelectorAll('#debridProvider');
            debridProviders.forEach(select => {
                select.value = prov;
            });

            const debridStatuses = document.querySelectorAll('#debridStatus');
            debridStatuses.forEach(status => {
                status.textContent = s.debridAuth ? 'Logged in' : 'Not logged in';
            });

            // Load rdClientId for ALL instances
            const rdClientIdInputs = document.querySelectorAll('#rdClientId');
            if (rdClientIdInputs.length > 0 && s.rdClientId) {
                rdClientIdInputs.forEach(input => {
                    input.value = s.rdClientId;
                });
            }

            useDebrid = !!s.useDebrid; debridAuth = !!s.debridAuth;
            // Toggle provider-specific UI for ALL instances
            const isRD = prov === 'realdebrid';
            const isAD = prov === 'alldebrid';
            const isTB = prov === 'torbox';
            const isPM = prov === 'premiumize';

            document.querySelectorAll('#rdClientIdGroup').forEach(el => el.style.display = isRD ? '' : 'none');
            document.querySelectorAll('#rdButtons').forEach(el => el.style.display = isRD ? '' : 'none');
            document.querySelectorAll('#rdTokenGroup').forEach(el => el.style.display = isRD ? '' : 'none');
            document.querySelectorAll('#rdTokenButtons').forEach(el => el.style.display = isRD ? '' : 'none');
            document.querySelectorAll('#rdCodePanel').forEach(el => el.style.display = 'none');
            document.querySelectorAll('#adSection').forEach(el => el.style.display = isAD ? '' : 'none');
            document.querySelectorAll('#tbSection').forEach(el => el.style.display = isTB ? '' : 'none');
            document.querySelectorAll('#pmSection').forEach(el => el.style.display = isPM ? '' : 'none');
        }
    } catch (_) { }
}

// Hide settings modal
function hideSettingsModal() {
    settingsModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Settings Page Tab Switching
function initializeSettingsTabs() {
    const settingsTabs = document.querySelectorAll('.settings-tab');
    const settingsSections = document.querySelectorAll('.settings-section');

    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetSection = tab.getAttribute('data-section');

            // Remove active class from all tabs and sections
            settingsTabs.forEach(t => t.classList.remove('active'));
            settingsSections.forEach(s => s.classList.remove('active'));

            // Add active class to clicked tab and corresponding section
            tab.classList.add('active');
            const targetElement = document.getElementById(`${targetSection}Content`);
            if (targetElement) {
                targetElement.classList.add('active');
            }
        });
    });
}

// Save API key (first time setup)
async function saveFirstTimeApiKey_() {
    const apiKey = firstTimeApiKey.value.trim();

    if (!apiKey) {
        showNotification('Please enter an API key');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/set-api-key`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apiKey })
        });

        const data = await response.json();

        if (response.ok) {
            hasApiKey = true;
            hideApiSetupModal();
            showNotification('API key saved successfully!');
            await loadCurrentApiKey();
        } else {
            showNotification(data.error || 'Failed to save API key');
        }
    } catch (error) {
        console.error('Error saving API key:', error);
        showNotification('Error saving API key');
    }
}

// ===== TRAKT FUNCTIONS =====

let traktPollingInterval = null;
let traktCurrentScrobble = null;

// Parse media title to extract info for Trakt
function parseMediaTitle(title) {
    if (!title) return { title: 'Unknown', type: 'movie', year: null };

    // Clean up the title
    let cleanTitle = title
        .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i, '') // Remove file extensions
        .replace(/\.(720p|1080p|4k|2160p|480p|hdtv|bdrip|webrip|dvdrip|cam|ts|hdrip)/gi, '') // Remove quality tags
        .replace(/\.(x264|x265|h264|h265|xvid|divx)/gi, '') // Remove codec tags
        .replace(/\.(aac|ac3|dts|mp3|flac)/gi, '') // Remove audio tags
        .replace(/[\[\]()]/g, ' ') // Remove brackets
        .replace(/\b(repack|proper|real|retail|uncut|unrated|extended|directors?\.cut)\b/gi, '') // Remove release tags
        .trim();

    // Check if it's a TV show (contains S##E## or Season/Episode patterns)
    const tvPatterns = [
        /(.+?)[\s\.]S(\d{1,2})E(\d{1,2})/i, // Title S01E01
        /(.+?)[\s\.]Season[\s\.](\d{1,2})[\s\.]Episode[\s\.](\d{1,2})/i, // Title Season 1 Episode 1
        /(.+?)[\s\.](\d{1,2})x(\d{1,2})/i, // Title 1x01
    ];

    for (const pattern of tvPatterns) {
        const match = cleanTitle.match(pattern);
        if (match) {
            const showTitle = match[1].trim().replace(/[.\-_]/g, ' ');
            const season = parseInt(match[2]);
            const episode = parseInt(match[3]);

            // Extract year if present
            const yearMatch = showTitle.match(/\b(19\d{2}|20\d{2})\b/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;
            const titleWithoutYear = showTitle.replace(/\b(19\d{2}|20\d{2})\b/, '').trim();

            return {
                title: titleWithoutYear || showTitle,
                type: 'show',
                year: year,
                season: season,
                episode: episode
            };
        }
    }

    // If not a TV show, treat as movie
    const yearMatch = cleanTitle.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    const titleWithoutYear = cleanTitle.replace(/\b(19\d{2}|20\d{2})\b/, '').trim();

    return {
        title: titleWithoutYear || cleanTitle,
        type: 'movie',
        year: year
    };
}

// Check Trakt authentication status
async function checkTraktStatus() {
    try {
        const response = await fetch(`/api/trakt/status?ts=${Date.now()}`, { cache: 'no-store' });
        const data = await response.json();

        if (data.authenticated && data.user) {
            showTraktConnected(data.user);
        } else {
            showTraktDisconnected();
        }
    } catch (error) {
        console.error('[TRAKT] Status check failed:', error);
        showTraktDisconnected();
    }
}

function showTraktConnected(user) {
    // Update ALL instances of Trakt status elements
    const traktNotConnectedEls = document.querySelectorAll('#traktNotConnected');
    const traktConnectedEls = document.querySelectorAll('#traktConnected');
    const traktUsernameEls = document.querySelectorAll('#traktUsername');
    const traktStatusEls = document.querySelectorAll('#traktStatus');

    traktNotConnectedEls.forEach(el => el.style.display = 'none');
    traktConnectedEls.forEach(el => el.style.display = 'block');
    traktUsernameEls.forEach(el => el.textContent = user.username || user.name || 'User');
    traktStatusEls.forEach(el => {
        el.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
        el.style.color = '#198754';
    });
}

function showTraktDisconnected() {
    // Update ALL instances of Trakt status elements
    const traktNotConnectedEls = document.querySelectorAll('#traktNotConnected');
    const traktConnectedEls = document.querySelectorAll('#traktConnected');
    const traktStatusEls = document.querySelectorAll('#traktStatus');

    traktNotConnectedEls.forEach(el => el.style.display = 'block');
    traktConnectedEls.forEach(el => el.style.display = 'none');
    traktStatusEls.forEach(el => {
        el.innerHTML = '<i class="fas fa-times-circle"></i> Not connected';
        el.style.color = '#dc3545';
    });
}

// Start Trakt authentication flow (unified to new device/code + verify endpoints)
async function startTraktLogin() {
    try {
        // Update ALL login buttons
        const traktLoginBtns = document.querySelectorAll('#traktLogin');
        traktLoginBtns.forEach(btn => {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        });

        // Get device code
        const response = await fetch('/api/trakt/device/code', { method: 'POST' });
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to get device code');
        }

        // Show the code panel on ALL instances
        const traktCodePanels = document.querySelectorAll('#traktCodePanel');
        const traktUserCodeEls = document.querySelectorAll('#traktUserCode');
        traktCodePanels.forEach(panel => panel.style.display = 'block');
        traktUserCodeEls.forEach(el => el.textContent = data.user_code);

        const traktVerifyUrlEls = document.querySelectorAll('#traktVerifyUrl');
        const traktLoginStatusEls = document.querySelectorAll('#traktLoginStatus');
        traktVerifyUrlEls.forEach(el => el.href = data.verification_url);
        traktLoginStatusEls.forEach(el => el.textContent = 'Waiting for authorization…');

        // Start polling verification (server reads stored device_code)
        startTraktPolling(data.device_code, data.interval || 5);

    } catch (error) {
        console.error('[TRAKT] Login error:', error);
        showNotification('Failed to start Trakt login: ' + error.message, 'error');
        resetTraktLogin();
    }
}

function startTraktPolling(deviceCode, interval) {
    if (traktPollingInterval) {
        clearInterval(traktPollingInterval);
    }

    traktPollingInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/trakt/device/verify', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                // Authentication successful
                clearInterval(traktPollingInterval);
                traktPollingInterval = null;
                if (traktCodePanel) traktCodePanel.style.display = 'none';
                showNotification('Successfully connected to Trakt!', 'success');
                await checkTraktStatus();
                resetTraktLogin();
            } else if (data.error === 'pending') {
                // Still waiting for user authorization
                if (traktLoginStatusEl) traktLoginStatusEl.textContent = 'Waiting for authorization…';
            } else {
                // Other verification error
                throw new Error(data.error || 'Verification failed');
            }
        } catch (error) {
            console.error('[TRAKT] Polling error:', error);
            clearInterval(traktPollingInterval);
            traktPollingInterval = null;
            showNotification('Authentication failed: ' + error.message, 'error');
            resetTraktLogin();
        }
    }, interval * 1000);
}

function resetTraktLogin() {
    const traktLoginBtns = document.querySelectorAll('#traktLogin');
    const traktCodePanels = document.querySelectorAll('#traktCodePanel');

    traktLoginBtns.forEach(btn => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Connect to Trakt';
    });
    traktCodePanels.forEach(panel => panel.style.display = 'none');

    if (traktPollingInterval) {
        clearInterval(traktPollingInterval);
        traktPollingInterval = null;
    }
}

function cancelTraktLogin() {
    resetTraktLogin();
    showNotification('Trakt login cancelled', 'info');
}

async function disconnectTrakt() {
    try {
        const response = await fetch('/api/trakt/logout', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            // Hide any device code panels in Settings
            document.querySelectorAll('#traktCodePanel').forEach(p => p.style.display = 'none');
            showTraktDisconnected();
            // Re-check status to sync all UI instances
            try { await checkTraktStatus(); } catch (_) { }
            // If Trakt page is loaded, refresh its status too
            try { if (typeof updateTraktPageStatus === 'function') await updateTraktPageStatus(); } catch (_) { }
            showNotification('Disconnected from Trakt', 'success');
        } else {
            throw new Error(data.error || 'Failed to logout');
        }
    } catch (error) {
        console.error('[TRAKT] Logout error:', error);
        showNotification('Failed to disconnect: ' + error.message, 'error');
    }
}

// Scrobbling functions
async function scrobbleStart(title, type, year, season, episode, progress = 0) {
    if (!traktAutoScrobbleToggle.checked) return;

    try {
        const response = await fetch('/api/trakt/scrobble/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, year, season, episode, progress })
        });

        const data = await response.json();
        if (data.success) {
            traktCurrentScrobble = { title, type, year, season, episode };
            console.log('[TRAKT] Started scrobbling:', title);
        } else {
            console.error('[TRAKT] Scrobble start failed:', data.error);
        }
    } catch (error) {
        console.error('[TRAKT] Scrobble start error:', error);
    }
}

async function scrobblePause(progress) {
    if (!traktCurrentScrobble || !traktScrobbleProgressToggle.checked) return;

    try {
        const response = await fetch('/api/trakt/scrobble/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...traktCurrentScrobble, progress })
        });

        if (response.ok) {
            console.log('[TRAKT] Paused scrobbling at', progress + '%');
        }
    } catch (error) {
        console.error('[TRAKT] Scrobble pause error:', error);
    }
}

async function scrobbleStop(progress) {
    if (!traktCurrentScrobble) return;

    try {
        const response = await fetch('/api/trakt/scrobble/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...traktCurrentScrobble, progress })
        });

        if (response.ok) {
            console.log('[TRAKT] Stopped scrobbling at', progress + '%');
            traktCurrentScrobble = null;
        }
    } catch (error) {
        console.error('[TRAKT] Scrobble stop error:', error);
    }
}

// Utility functions
function copyTraktCode() {
    const code = traktUserCodeEl.textContent;
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Code copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy code', 'error');
    });
}

function openTraktVerify() {
    const url = traktVerifyUrlEl.href;
    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

// Watchlist management
async function setupTraktWatchlistButton() {
    if (!traktWatchlistBtn || !currentMovie) return;

    // Check if user is authenticated with Trakt
    try {
        const statusResponse = await fetch('/api/trakt/status');
        const statusData = await statusResponse.json();

        if (!statusData.authenticated) {
            traktWatchlistBtn.style.display = 'none';
            return;
        }

        traktWatchlistBtn.style.display = 'block';

        // Check if item is already in watchlist
        const title = currentMovie.title || currentMovie.name;
        const year = parseInt((currentMovie.release_date || currentMovie.first_air_date || '').substring(0, 4));

        // For now, assume it's not in watchlist - could check against API in the future
        updateWatchlistButton(false);

    } catch (error) {
        console.error('[TRAKT] Error setting up watchlist button:', error);
        traktWatchlistBtn.style.display = 'none';
    }
}

function updateWatchlistButton(isInWatchlist) {
    if (!traktWatchlistBtn) return;

    if (isInWatchlist) {
        traktWatchlistBtn.innerHTML = '<i class="fas fa-check"></i> In Watchlist';
        traktWatchlistBtn.classList.remove('btn-secondary');
        traktWatchlistBtn.classList.add('btn-success');
        traktWatchlistBtn.onclick = removeFromTraktWatchlist;
    } else {
        traktWatchlistBtn.innerHTML = '<i class="fas fa-plus"></i> Add to Watchlist';
        traktWatchlistBtn.classList.remove('btn-success');
        traktWatchlistBtn.classList.add('btn-secondary');
        traktWatchlistBtn.onclick = addToTraktWatchlist;
    }
}

async function addToTraktWatchlist() {
    if (!currentMovie) return;

    try {
        traktWatchlistBtn.disabled = true;
        traktWatchlistBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

        const title = currentMovie.title || currentMovie.name;
        const year = parseInt((currentMovie.release_date || currentMovie.first_air_date || '').substring(0, 4));
        const type = currentMediaType === 'tv' ? 'show' : 'movie';

        const response = await fetch('/api/trakt/watchlist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, year })
        });

        const data = await response.json();

        if (data.success) {
            updateWatchlistButton(true);
            showNotification(`Added "${title}" to your Trakt watchlist!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to add to watchlist');
        }

    } catch (error) {
        console.error('[TRAKT] Add to watchlist error:', error);
        showNotification('Failed to add to watchlist: ' + error.message, 'error');
        updateWatchlistButton(false);
    } finally {
        traktWatchlistBtn.disabled = false;
    }
}

async function removeFromTraktWatchlist() {
    if (!currentMovie) return;

    try {
        traktWatchlistBtn.disabled = true;
        traktWatchlistBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Removing...';

        const title = currentMovie.title || currentMovie.name;
        const year = parseInt((currentMovie.release_date || currentMovie.first_air_date || '').substring(0, 4));
        const type = currentMediaType === 'tv' ? 'show' : 'movie';

        const response = await fetch('/api/trakt/watchlist/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, year })
        });

        const data = await response.json();

        if (data.success) {
            updateWatchlistButton(false);
            showNotification(`Removed "${title}" from your Trakt watchlist`, 'success');
        } else {
            throw new Error(data.error || 'Failed to remove from watchlist');
        }

    } catch (error) {
        console.error('[TRAKT] Remove from watchlist error:', error);
        showNotification('Failed to remove from watchlist: ' + error.message, 'error');
        updateWatchlistButton(true);
    } finally {
        traktWatchlistBtn.disabled = false;
    }
}

// ===== END TRAKT FUNCTIONS =====

// ===== TRAKT PAGE FUNCTIONS =====

// Global Trakt page state
let traktPageInitialized = false;
let traktDeviceCodeInterval = null;
let traktStats = null;

async function initializeTraktPage() {
    if (traktPageInitialized) return;

    try {
        await updateTraktPageStatus();
        setupTraktPageEventListeners();
        traktPageInitialized = true;
        console.log('[TRAKT PAGE] Initialized successfully');
    } catch (error) {
        console.error('[TRAKT PAGE] Initialization error:', error);
    }
}

function setupTraktPageEventListeners() {
    // Helper to avoid duplicate listeners when DOM is re-rendered
    function bindById(id, handler) {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.parentNode.replaceChild(fresh, el);
        fresh.addEventListener('click', handler);
    }

    // Authenticate button
    bindById('traktAuthenticateBtn', startTraktPageAuth);

    // Disconnect buttons (both variants)
    bindById('traktPageDisconnect', disconnectTraktFromPage);
    bindById('traktDisconnectBtn', disconnectTraktFromPage);

    // Refresh status button
    bindById('traktPageRefresh', () => { updateTraktPageStatus(); });

    // Re-sync Library button
    bindById('traktPageResyncLibrary', manualResyncTraktLibrary);

    // View statistics button
    bindById('traktPageStats', () => { try { showDetailedTraktStatistics(); } catch (_) { } });

    // Verify Device Code button
    bindById('traktVerifyDeviceBtn', verifyTraktDeviceCode);

    // Open Trakt URL button
    bindById('traktOpenUrlBtn', () => {
        const url = document.getElementById('traktPageVerificationUrl')?.textContent;
        if (url) {
            window.electronAPI?.openExternal(url);
        }
    });

    // Copy device code button
    bindById('traktCopyCodeBtn', copyTraktDeviceCode);

    // Action cards (rebinding safely)
    document.querySelectorAll('.trakt-action-card').forEach(card => {
        const fresh = card.cloneNode(true);
        card.parentNode.replaceChild(fresh, card);
        fresh.addEventListener('click', handleTraktActionClick);
    });

    // Settings toggles
    const autoScrobbleToggle = document.getElementById('traktPageAutoScrobble');
    const progressToggle = document.getElementById('traktPageScrobbleProgress');
    const watchlistToggle = document.getElementById('traktPageWatchlistSync');

    if (autoScrobbleToggle) {
        autoScrobbleToggle.addEventListener('change', () => {
            if (traktAutoScrobbleToggle) {
                traktAutoScrobbleToggle.checked = autoScrobbleToggle.checked;
            }
        });
    }

    if (progressToggle) {
        progressToggle.addEventListener('change', () => {
            if (traktScrobbleProgressToggle) {
                traktScrobbleProgressToggle.checked = progressToggle.checked;
            }
        });
    }

    if (watchlistToggle) {
        watchlistToggle.addEventListener('change', () => {
            if (traktSyncWatchlistToggle) {
                traktSyncWatchlistToggle.checked = watchlistToggle.checked;
            }
        });
    }
}

async function updateTraktPageStatus() {
    try {
        const response = await fetch(`/api/trakt/status?ts=${Date.now()}`, { cache: 'no-store' });
        const data = await response.json();

        const statusIndicator = document.getElementById('traktStatusIndicator');
        const statusDescription = document.getElementById('traktStatusDescription');
        const statusActions = document.getElementById('traktStatusActions');
        const deviceCodePanel = document.getElementById('traktDeviceCodePanel');
        const traktPageNotConnected = document.getElementById('traktPageNotConnected');
        const traktPageConnected = document.getElementById('traktPageConnected');
        const traktPageUsername = document.getElementById('traktPageUsername');

        if (data.authenticated) {
            // Connected state: show connected card, set username
            if (traktPageNotConnected) traktPageNotConnected.style.display = 'none';
            if (traktPageConnected) traktPageConnected.style.display = '';
            if (traktPageUsername) traktPageUsername.textContent = (data.user?.username || data.user?.name || 'User');

            if (deviceCodePanel) {
                deviceCodePanel.style.display = 'none';
                delete deviceCodePanel.dataset.manual;
            }
            // Update action grid with stats
            await loadTraktStats();
            // One-time import from Trakt into local caches
            importTraktDataOnceIfNeeded();

        } else {
            // Disconnected state: show not-connected card with connect action
            if (traktPageConnected) traktPageConnected.style.display = 'none';
            if (traktPageNotConnected) traktPageNotConnected.style.display = '';
            if (statusIndicator) {
                statusIndicator.className = 'trakt-status-indicator disconnected';
                statusIndicator.innerHTML = '<i class="fas fa-times-circle"></i><span>Not Connected</span>';
            }
            if (statusDescription) {
                statusDescription.textContent = 'Connect your Trakt account to automatically track what you watch, sync your watchlist, and get personalized recommendations.';
            }
            if (statusActions) {
                statusActions.innerHTML = `
                            <button id="traktAuthenticateBtn" class="trakt-btn trakt-btn-primary">
                                <i class="fas fa-link"></i>Connect to Trakt
                            </button>
                        `;
            }

            // Only hide code panel if not manually shown during an active auth flow
            if (deviceCodePanel && deviceCodePanel.dataset.manual !== 'true') {
                deviceCodePanel.style.display = 'none';
            }

            // Clear action grid
            clearTraktActionGrid();
        }

        // Sync settings toggles
        syncTraktPageSettings();

        // Re-setup event listeners after DOM update
        setupTraktPageEventListeners();

    } catch (error) {
        console.error('[TRAKT PAGE] Status update error:', error);
        // Surface the actual error for clarity
        const msg = (error && error.message) ? error.message : 'Unknown error';
        showNotification('Trakt status error: ' + msg, 'error');
    }
}

async function startTraktPageAuth() {
    try {
        const response = await fetch('/api/trakt/device/code', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showTraktDeviceCode(data.device_code, data.user_code, data.verification_url, data.expires_in);

            // Start polling for verification
            traktDeviceCodeInterval = setInterval(async () => {
                await verifyTraktDeviceCode();
            }, data.interval * 1000 || 5000);

        } else {
            throw new Error(data.error || 'Failed to get device code');
        }
    } catch (error) {
        console.error('[TRAKT PAGE] Auth start error:', error);
        showNotification('Failed to start authentication: ' + error.message, 'error');
    }
}

function showTraktDeviceCode(deviceCode, userCode, verificationUrl, expiresIn) {
    const deviceCodePanel = document.getElementById('traktDeviceCodePanel');
    const userCodeSpan = document.getElementById('traktPageUserCode');
    const verificationUrlSpan = document.getElementById('traktPageVerificationUrl');
    const statusMessage = document.getElementById('traktDeviceCodeStatus');

    if (deviceCodePanel) {
        deviceCodePanel.style.display = 'block';
        deviceCodePanel.dataset.manual = 'true';
    }
    if (userCodeSpan) userCodeSpan.textContent = userCode;
    if (verificationUrlSpan) verificationUrlSpan.textContent = verificationUrl;
    if (statusMessage) {
        statusMessage.innerHTML = '<span>Waiting for authorization... Please enter the code above on Trakt.tv</span>';
    }

    // Set timeout to hide panel after expiration
    setTimeout(() => {
        if (traktDeviceCodeInterval) {
            clearInterval(traktDeviceCodeInterval);
            traktDeviceCodeInterval = null;
            if (deviceCodePanel) {
                deviceCodePanel.style.display = 'none';
                delete deviceCodePanel.dataset.manual;
            }
            showNotification('Device code expired. Please try again.', 'error');
        }
    }, expiresIn * 1000);
}

async function verifyTraktDeviceCode() {
    try {
        const response = await fetch('/api/trakt/device/verify', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            // Success! Clear interval and update page
            if (traktDeviceCodeInterval) {
                clearInterval(traktDeviceCodeInterval);
                traktDeviceCodeInterval = null;
            }

            const deviceCodePanel = document.getElementById('traktDeviceCodePanel');
            if (deviceCodePanel) deviceCodePanel.style.display = 'none';

            showNotification('Successfully connected to Trakt!', 'success');
            await updateTraktPageStatus();

        } else if (data.error === 'pending') {
            // Still waiting, update status
            const statusMessage = document.getElementById('traktDeviceCodeStatus');
            if (statusMessage) {
                statusMessage.innerHTML = '<span>Waiting for authorization... Please enter the code above on Trakt.tv</span>';
            }
        } else {
            throw new Error(data.error || 'Verification failed');
        }
    } catch (error) {
        console.error('[TRAKT PAGE] Verify error:', error);
        if (error.message !== 'pending') {
            showNotification('Verification failed: ' + error.message, 'error');
        }
    }
}

async function disconnectTraktFromPage() {
    try {
        const response = await fetch('/api/trakt/logout', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            // Hide device code panel if visible
            const deviceCodePanel = document.getElementById('traktDeviceCodePanel');
            if (deviceCodePanel) deviceCodePanel.style.display = 'none';
            // Refresh both Trakt page and Settings page status
            try { await updateTraktPageStatus(); } catch (_) { }
            try { await checkTraktStatus(); } catch (_) { }
            showNotification('Successfully disconnected from Trakt', 'success');
        } else {
            throw new Error(data.error || 'Failed to disconnect');
        }
    } catch (error) {
        console.error('[TRAKT PAGE] Disconnect error:', error);
        showNotification('Failed to disconnect: ' + error.message, 'error');
    }
}

function copyTraktDeviceCode() {
    // Prefer Trakt page code span, fallback to Settings panel span
    const userCode = (document.getElementById('traktPageUserCode')?.textContent)
        || (document.querySelector('#traktCodePanel #traktUserCode')?.textContent)
        || (document.getElementById('traktUserCode')?.textContent);
    if (userCode && navigator.clipboard) {
        navigator.clipboard.writeText(userCode).then(() => {
            showNotification('Device code copied to clipboard!', 'success');
        }).catch(() => {
            showNotification('Failed to copy code', 'error');
        });
    }
}

async function showDetailedTraktStatistics() {
    try {
        showNotification('Loading your statistics...', 'info', 2000);

        const response = await fetch('/api/trakt/user/stats');
        const data = await response.json();

        if (data.success && data.stats) {
            displayTraktStatisticsModal(data.stats);
            showNotification('Statistics loaded successfully!', 'success', 2000);
        } else {
            throw new Error(data.error || 'Failed to load statistics');
        }
    } catch (error) {
        console.error('[TRAKT] Detailed statistics error:', error);
        showNotification('Unable to load detailed statistics. Please ensure you\'re connected to Trakt and try again.', 'error', 4000);
    }
}

function displayTraktStatisticsModal(stats) {
    // Create statistics modal
    const modal = document.createElement('div');
    modal.id = 'traktStatisticsModal';
    modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(8px);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 2rem;
                animation: fadeIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
            `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
                background: linear-gradient(135deg, rgba(30, 30, 30, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
                border-radius: 16px;
                padding: 2rem;
                max-width: 800px;
                width: 100%;
                max-height: 80vh;
                overflow-y: auto;
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            `;

    // Calculate totals
    const movieStats = stats.movies || { watched: 0, collected: 0, ratings: 0, plays: 0, minutes: 0 };
    const showStats = stats.shows || { watched: 0, collected: 0, ratings: 0, plays: 0, minutes: 0 };
    const episodeStats = stats.episodes || { watched: 0, collected: 0, ratings: 0, plays: 0, minutes: 0 };

    const totalWatched = movieStats.watched + showStats.watched;
    const totalMinutes = movieStats.minutes + episodeStats.minutes;
    const totalHours = Math.round(totalMinutes / 60);
    const totalDays = Math.round(totalHours / 24);

    modalContent.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h2 style="margin: 0; color: #ed1c24; font-size: 1.8rem;">
                        <i class="fas fa-chart-bar"></i> Your Trakt Statistics
                    </h2>
                    <button onclick="closeTraktStatisticsModal()" style="
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        color: white;
                        padding: 0.5rem;
                        border-radius: 50%;
                        cursor: pointer;
                        font-size: 1.2rem;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">×</button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                    <div style="background: rgba(237, 28, 36, 0.1); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #ed1c24;">
                        <div style="font-size: 2rem; font-weight: bold; color: #ed1c24;">${totalWatched}</div>
                        <div style="color: #ccc; margin-top: 0.5rem;">Total Content Watched</div>
                        <div style="font-size: 0.9rem; color: #999; margin-top: 0.25rem;">Movies + Shows</div>
                    </div>
                    
                    <div style="background: rgba(34, 197, 94, 0.1); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #22c55e;">
                        <div style="font-size: 2rem; font-weight: bold; color: #22c55e;">${totalDays}</div>
                        <div style="color: #ccc; margin-top: 0.5rem;">Days Watched</div>
                        <div style="font-size: 0.9rem; color: #999; margin-top: 0.25rem;">${totalHours} hours total</div>
                    </div>
                    
                    <div style="background: rgba(59, 130, 246, 0.1); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #3b82f6;">
                        <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${stats.watchlist?.length || 0}</div>
                        <div style="color: #ccc; margin-top: 0.5rem;">Watchlist Items</div>
                        <div style="font-size: 0.9rem; color: #999; margin-top: 0.25rem;">Pending to watch</div>
                    </div>
                    
                    <div style="background: rgba(245, 158, 11, 0.1); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #f59e0b;">
                        <div style="font-size: 2rem; font-weight: bold; color: #f59e0b;">${stats.ratings?.length || 0}</div>
                        <div style="color: #ccc; margin-top: 0.5rem;">Items Rated</div>
                        <div style="font-size: 0.9rem; color: #999; margin-top: 0.25rem;">Your taste profile</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 12px;">
                        <h3 style="margin: 0 0 1rem 0; color: #ed1c24;">
                            <i class="fas fa-film"></i> Movies
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Watched:</span>
                                <span style="color: white; font-weight: bold;">${movieStats.watched || 0}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Collected:</span>
                                <span style="color: white; font-weight: bold;">${movieStats.collected || 0}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Rated:</span>
                                <span style="color: white; font-weight: bold;">${movieStats.ratings || 0}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Watch Time:</span>
                                <span style="color: white; font-weight: bold;">${Math.round((movieStats.minutes || 0) / 60)}h</span>
                            </div>
                        </div>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 12px;">
                        <h3 style="margin: 0 0 1rem 0; color: #ed1c24;">
                            <i class="fas fa-tv"></i> TV Shows
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Shows Watched:</span>
                                <span style="color: white; font-weight: bold;">${showStats.watched || 0}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Episodes:</span>
                                <span style="color: white; font-weight: bold;">${episodeStats.watched || 0}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Shows Rated:</span>
                                <span style="color: white; font-weight: bold;">${showStats.ratings || 0}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ccc;">Watch Time:</span>
                                <span style="color: white; font-weight: bold;">${Math.round((episodeStats.minutes || 0) / 60)}h</span>
                            </div>
                        </div>
                    </div>
                </div>

                ${stats.network ? `
                <div style="background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
                    <h3 style="margin: 0 0 1rem 0; color: #ed1c24;">
                        <i class="fas fa-users"></i> Social Network
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align: center;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">${stats.network.friends || 0}</div>
                            <div style="color: #ccc; font-size: 0.9rem;">Friends</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #22c55e;">${stats.network.followers || 0}</div>
                            <div style="color: #ccc; font-size: 0.9rem;">Followers</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${stats.network.following || 0}</div>
                            <div style="color: #ccc; font-size: 0.9rem;">Following</div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <div style="text-align: center; margin-top: 2rem;">
                    <button onclick="window.electronAPI?.openExternal('https://trakt.tv/users/me')" style="
                        background: linear-gradient(135deg, #ed1c24 0%, #d41920 100%);
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        margin-right: 1rem;
                    ">
                        <i class="fas fa-external-link-alt"></i> View Profile on Trakt
                    </button>
                    <button onclick="closeTraktStatisticsModal()" style="
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        padding: 0.75rem 1.5rem;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                    ">
                        Close
                    </button>
                </div>
            `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Add click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeTraktStatisticsModal();
        }
    });

    showNotification('Statistics loaded successfully!', 'success');
}

function closeTraktStatisticsModal() {
    const modal = document.getElementById('traktStatisticsModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// Add fade animations
const fadeStyle = document.createElement('style');
fadeStyle.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes fadeOut {
                from { opacity: 1; transform: scale(1); }
                to { opacity: 0; transform: scale(0.9); }
            }
        `;
document.head.appendChild(fadeStyle);

async function loadTraktStats() {
    try {
        const response = await fetch('/api/trakt/user/stats');
        const data = await response.json();

        if (data.success) {
            traktStats = data.stats;
            updateTraktActionGrid(data.stats);
            console.log('[TRAKT PAGE] Stats loaded successfully');
        } else {
            // Silently use placeholder stats - don't show error notifications
            console.log('[TRAKT PAGE] Using placeholder stats:', data.error);
            const placeholderStats = {
                watchlist: [],
                collection: { movies: [], shows: [] },
                ratings: [],
                movies: { watched: 0, collected: 0, ratings: 0 },
                shows: { watched: 0, collected: 0, ratings: 0 }
            };
            updateTraktActionGrid(placeholderStats);
        }
    } catch (error) {
        // Don't show error notifications for stats loading - just use placeholders
        console.log('[TRAKT PAGE] Stats loading failed, using placeholders:', error);
        const placeholderStats = {
            watchlist: [],
            collection: { movies: [], shows: [] },
            ratings: [],
            movies: { watched: 0, collected: 0, ratings: 0 },
            shows: { watched: 0, collected: 0, ratings: 0 }
        };
        updateTraktActionGrid(placeholderStats);
    }
}

function updateTraktActionGrid(stats) {
    const actionCards = document.querySelectorAll('.trakt-action-card');

    actionCards.forEach(card => {
        const action = card.dataset.action;
        const countEl = card.querySelector('.trakt-action-count');

        switch (action) {
            case 'watchlist':
                if (countEl) {
                    const count = stats.watchlist?.length || 0;
                    countEl.textContent = count;
                    countEl.style.display = count > 0 ? 'inline-block' : 'none';
                }
                break;
            case 'history':
                if (countEl) {
                    const movieCount = stats.movies?.watched || 0;
                    const showCount = stats.shows?.watched || 0;
                    const totalCount = movieCount + showCount;
                    countEl.textContent = totalCount;
                    countEl.style.display = totalCount > 0 ? 'inline-block' : 'none';
                }
                break;
            case 'collection':
                if (countEl) {
                    const movieCount = stats.collection?.movies?.length || 0;
                    const showCount = stats.collection?.shows?.length || 0;
                    const totalCount = movieCount + showCount;
                    countEl.textContent = totalCount;
                    countEl.style.display = totalCount > 0 ? 'inline-block' : 'none';
                }
                break;
            case 'ratings':
                if (countEl) {
                    const count = stats.ratings?.length || 0;
                    countEl.textContent = count;
                    countEl.style.display = count > 0 ? 'inline-block' : 'none';
                }
                break;
        }
    });

    console.log('[TRAKT PAGE] Action grid updated with stats');
}

function clearTraktActionGrid() {
    const actionCards = document.querySelectorAll('.trakt-action-card');
    actionCards.forEach(card => {
        const countEl = card.querySelector('.trakt-action-count');
        if (countEl) countEl.textContent = '0';
    });
}

async function handleTraktActionClick(event) {
    const card = event.currentTarget;
    const action = card.dataset.action;

    // Show detailed information for each action
    switch (action) {
        case 'watchlist':
            await showTraktWatchlistDetails();
            break;
        case 'history':
            await showTraktHistoryDetails();
            break;
        case 'collection':
            await showTraktCollectionDetails();
            break;
        case 'ratings':
            await showTraktRatingsDetails();
            break;
        default:
            showNotification('Feature coming soon!', 'info');
    }
}

async function showTraktWatchlistDetails() {
    try {
        const response = await fetch('/api/trakt/watchlist');
        const data = await response.json();

        if (data.success && data.watchlist) {
            const count = data.watchlist.length;
            if (count > 0) {
                showNotification(`Your watchlist has ${count} items. They will appear automatically when browsing!`, 'success');
            } else {
                showNotification('Your watchlist is empty. Add items by clicking the + button on movies and shows!', 'info');
            }
        } else {
            showNotification('Could not load watchlist. Make sure you\'re connected to Trakt.', 'error');
        }
    } catch (error) {
        console.error('[TRAKT] Watchlist details error:', error);
        showNotification('Failed to load watchlist details', 'error');
    }
}

async function showTraktHistoryDetails() {
    try {
        const response = await fetch('/api/trakt/history');
        const data = await response.json();

        if (data.success && data.history) {
            const count = data.history.length;
            if (count > 0) {
                showNotification(`You've watched ${count} items. Your watch history is automatically tracked!`, 'success');
            } else {
                showNotification('No watch history yet. Start watching content and it will be tracked automatically!', 'info');
            }
        } else {
            showNotification('Could not load watch history. Make sure you\'re connected to Trakt.', 'error');
        }
    } catch (error) {
        console.error('[TRAKT] History details error:', error);
        showNotification('Failed to load watch history', 'error');
    }
}

async function showTraktCollectionDetails() {
    try {
        const response = await fetch('/api/trakt/collection');
        const data = await response.json();

        if (data.success && data.collection) {
            const movieCount = data.collection.movies?.length || 0;
            const showCount = data.collection.shows?.length || 0;
            const total = movieCount + showCount;

            if (total > 0) {
                showNotification(`Your collection has ${movieCount} movies and ${showCount} shows (${total} total)`, 'success');
            } else {
                showNotification('Your collection is empty. Items are added automatically when you finish watching!', 'info');
            }
        } else {
            showNotification('Could not load collection. Make sure you\'re connected to Trakt.', 'error');
        }
    } catch (error) {
        console.error('[TRAKT] Collection details error:', error);
        showNotification('Failed to load collection details', 'error');
    }
}

async function showTraktRatingsDetails() {
    try {
        const response = await fetch('/api/trakt/ratings');
        const data = await response.json();

        if (data.success && data.ratings) {
            const count = data.ratings.length;
            if (count > 0) {
                showNotification(`You've rated ${count} items on Trakt. Visit trakt.tv to rate more content!`, 'success');
            } else {
                showNotification('You haven\'t rated anything yet. Visit trakt.tv to start rating movies and shows!', 'info');
            }
        } else {
            showNotification('Could not load ratings. Make sure you\'re connected to Trakt.', 'error');
        }
    } catch (error) {
        console.error('[TRAKT] Ratings details error:', error);
        showNotification('Failed to load ratings details', 'error');
    }
}

function syncTraktPageSettings() {
    // Sync main settings with page settings
    const autoScrobbleToggle = document.getElementById('traktPageAutoScrobble');
    const progressToggle = document.getElementById('traktPageScrobbleProgress');
    const watchlistToggle = document.getElementById('traktPageWatchlistSync');

    if (autoScrobbleToggle && traktAutoScrobbleToggle) {
        autoScrobbleToggle.checked = traktAutoScrobbleToggle.checked;
    }

    if (progressToggle && traktScrobbleProgressToggle) {
        progressToggle.checked = traktScrobbleProgressToggle.checked;
    }

    if (watchlistToggle && traktSyncWatchlistToggle) {
        watchlistToggle.checked = traktSyncWatchlistToggle.checked;
    }
}

// ===== TRAKT IMPORT (My List + Done Watching) =====
let traktImportedOnce = false;

async function fetchTmdbDetailsById(type, tmdbId) {
    try {
        if (!tmdbId) return null;
        const base = 'https://api.themoviedb.org/3';
        const endpoint = type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
        const url = `${base}${endpoint}?api_key=${TMDB_API_KEY}`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const j = await resp.json();
        return j;
    } catch (_) { return null; }
}

function normalizeYear(from) {
    try { return (from || '').substring(0, 4) || ''; } catch { return ''; }
}

async function importTraktWatchlistToMyList(maxPages = 50, pageSize = 100) {
    try {
        // Ensure current list loaded
        await loadMyList();

        let totalAdded = 0;
        for (let page = 1; page <= maxPages; page++) {
            const res = await fetch(`/api/trakt/watchlist?type=mixed&page=${page}&limit=${pageSize}`);
            const data = await res.json();
            if (!data.success || !Array.isArray(data.watchlist) || data.watchlist.length === 0) break;

            let addedThisPage = 0;
            for (const entry of data.watchlist) {
                const isMovie = !!entry.movie;
                const isShow = !!entry.show;
                const type = isMovie ? 'movie' : (isShow ? 'tv' : null);
                const ids = (entry.movie?.ids || entry.show?.ids || {});
                const tmdbId = ids.tmdb || null;
                if (!type || !tmdbId) continue;

                // Skip if already present
                if (myListCache.some(it => it.id === tmdbId && it.media_type === type)) continue;

                // Fetch TMDB details to enrich poster/year/rating/title
                const details = await fetchTmdbDetailsById(type, tmdbId);
                const title = type === 'tv' ? (details?.name || entry.show?.title || '') : (details?.title || entry.movie?.title || '');
                const poster_path = details?.poster_path || '';
                const year = type === 'tv' ? normalizeYear(details?.first_air_date || entry.show?.year) : normalizeYear(details?.release_date || entry.movie?.year);
                const vote_average = Number(details?.vote_average || 0);
                const listItem = {
                    id: tmdbId,
                    media_type: type,
                    title,
                    poster_path,
                    year,
                    vote_average,
                    added_date: entry.listed_at || new Date().toISOString()
                };
                myListCache.unshift(listItem);
                addedThisPage++;
            }
            totalAdded += addedThisPage;

            // If we got less than pageSize items, we've reached the end
            if (data.watchlist.length < pageSize) break;
        }

        if (totalAdded > 0) {
            await saveMyList();
            // Refresh page if open
            if (document.getElementById('myListPage')?.style.display !== 'none') {
                await displayMyList();
            }
        }
        return totalAdded;
    } catch (e) {
        console.log('[TRAKT IMPORT] My List failed:', e?.message);
        return 0;
    }
}

async function importTraktHistoryToDoneWatching(maxPages = 50, pageSize = 100) {
    try {
        await loadDoneWatching();
        let totalAdded = 0;
        for (let page = 1; page <= maxPages; page++) {
            const res = await fetch(`/api/trakt/history?type=mixed&page=${page}&limit=${pageSize}`);
            const data = await res.json();
            if (!data.success || !Array.isArray(data.history) || data.history.length === 0) break;

            for (const h of data.history) {
                const watchedAt = h.watched_at || new Date().toISOString();
                if (h.movie) {
                    const ids = h.movie.ids || {};
                    const tmdbId = ids.tmdb || null;
                    if (!tmdbId) continue;
                    // Skip if already have movie marked done (whole title)
                    if (doneWatchingCache.some(it => it.id === tmdbId && it.media_type === 'movie' && !it.season && !it.episode)) continue;
                    const details = await fetchTmdbDetailsById('movie', tmdbId);
                    const item = {
                        id: tmdbId,
                        media_type: 'movie',
                        title: details?.title || h.movie.title || '',
                        poster_path: details?.poster_path || '',
                        year: normalizeYear(details?.release_date || h.movie.year),
                        vote_average: Number(details?.vote_average || 0),
                        completed_date: watchedAt
                    };
                    doneWatchingCache.unshift(item);
                    totalAdded++;
                } else if (h.episode && h.show) {
                    const ids = h.show.ids || {};
                    const tmdbId = ids.tmdb || null;
                    if (!tmdbId) continue;
                    const season = h.episode.season;
                    const episode = h.episode.number;
                    // Skip if this exact episode already present
                    if (doneWatchingCache.some(it => it.id === tmdbId && it.media_type === 'tv' && it.season === season && it.episode === episode)) continue;
                    const details = await fetchTmdbDetailsById('tv', tmdbId);
                    const item = {
                        id: tmdbId,
                        media_type: 'tv',
                        title: details?.name || h.show.title || '',
                        poster_path: details?.poster_path || '',
                        year: normalizeYear(details?.first_air_date || h.show.year),
                        vote_average: Number(details?.vote_average || 0),
                        completed_date: watchedAt,
                        season,
                        episode,
                        episode_title: h.episode.title || `S${season}E${episode}`
                    };
                    doneWatchingCache.unshift(item);
                    totalAdded++;
                }
            }

            // If we received less than requested, we reached the end
            if (data.history.length < pageSize) break;
        }

        if (totalAdded > 0) {
            await saveDoneWatching();
            if (document.getElementById('doneWatchingPage')?.style.display !== 'none') {
                await displayDoneWatching();
            }
        }
        return totalAdded;
    } catch (e) {
        console.log('[TRAKT IMPORT] Done Watching failed:', e?.message);
        return 0;
    }
}

async function importTraktDataOnceIfNeeded() {
    try {
        if (traktImportedOnce) return;
        // Check if we've imported in the last 24 hours (not just once ever)
        const lastImport = localStorage.getItem('traktLastImport');
        if (lastImport) {
            const hoursSinceImport = (Date.now() - parseInt(lastImport)) / (1000 * 60 * 60);
            if (hoursSinceImport < 24) {
                traktImportedOnce = true;
                return;
            }
        }

        showNotification('Importing your Trakt data (watchlist & history)...', 'info');
        const [addedList, addedDone] = await Promise.all([
            importTraktWatchlistToMyList(),
            importTraktHistoryToDoneWatching(),
        ]);
        traktImportedOnce = true;
        localStorage.setItem('traktLastImport', Date.now().toString());
        const msg = `Imported ${addedList} to My List and ${addedDone} to Done Watching from Trakt`;
        showNotification(msg, 'success');
        // Optionally update visible cards' buttons state
        try {
            document.querySelectorAll('.movie-card').forEach(card => {
                // Attempt to extract id/mediaType from onclick attributes
                const addBtn = card.querySelector('.add-to-list-btn');
                const doneBtn = card.querySelector('.done-watching-btn');
                const attr = (addBtn?.getAttribute('onclick') || doneBtn?.getAttribute('onclick') || '') + '';
                const idMatch = attr.match(/,(\s*)(\d+)(\s*),\s*'(movie|tv)'/);
                if (idMatch) {
                    const id = parseInt(idMatch[2], 10);
                    const mediaType = idMatch[4];
                    updateCardListStatus(card, id, mediaType);
                    updateCardDoneStatus(card, id, mediaType);
                }
            });
        } catch (_) { }
    } catch (e) {
        console.log('[TRAKT IMPORT] unexpected error:', e?.message);
    }
}

async function manualResyncTraktLibrary() {
    try {
        const btn = document.getElementById('traktPageResyncLibrary');
        if (!btn) return;

        // Disable button and show loading state
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';

        showNotification('Starting full Trakt library sync...', 'info');

        // Force re-sync by resetting the import flag
        traktImportedOnce = false;
        localStorage.removeItem('traktLastImport');

        // Import with higher page limits (50 pages × 100 = 5000 items max)
        const [addedList, addedDone] = await Promise.all([
            importTraktWatchlistToMyList(50, 100),
            importTraktHistoryToDoneWatching(50, 100),
        ]);

        // Update timestamp
        traktImportedOnce = true;
        localStorage.setItem('traktLastImport', Date.now().toString());

        const msg = `Sync complete! Imported ${addedList} to My List and ${addedDone} to Done Watching from Trakt`;
        showNotification(msg, 'success');

        // Update all visible cards
        try {
            document.querySelectorAll('.movie-card').forEach(card => {
                const addBtn = card.querySelector('.add-to-list-btn');
                const doneBtn = card.querySelector('.done-watching-btn');
                const attr = (addBtn?.getAttribute('onclick') || doneBtn?.getAttribute('onclick') || '') + '';
                const idMatch = attr.match(/,(\s*)(\d+)(\s*),\s*'(movie|tv)'/);
                if (idMatch) {
                    const id = parseInt(idMatch[2], 10);
                    const mediaType = idMatch[4];
                    updateCardListStatus(card, id, mediaType);
                    updateCardDoneStatus(card, id, mediaType);
                }
            });
        } catch (_) { }

        // Re-enable button
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    } catch (e) {
        console.log('[TRAKT RESYNC] Error:', e?.message);
        showNotification('Trakt sync failed: ' + e?.message, 'error');
        // Re-enable button
        const btn = document.getElementById('traktPageResyncLibrary');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Re-sync Library';
        }
    }
}

// ===== END TRAKT PAGE FUNCTIONS =====

// ===== TRAKT SYNC FUNCTIONS FOR IN-APP LISTS =====

async function syncWithTraktWatchlist(action, title, mediaType, year) {
    try {
        // Check if user is authenticated
        const statusResponse = await fetch('/api/trakt/status');
        const statusData = await statusResponse.json();
        if (!statusData.authenticated) {
            console.log('[TRAKT SYNC] User not authenticated, skipping watchlist sync');
            return;
        }

        const endpoint = action === 'add' ? '/api/trakt/watchlist/add' : '/api/trakt/watchlist/remove';
        const type = mediaType === 'movie' ? 'movie' : 'show';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, year: parseInt(year) })
        });

        const data = await response.json();

        if (data.success) {
            const actionText = action === 'add' ? 'Added to' : 'Removed from';
            showNotification(`${actionText} Trakt watchlist: "${title}"`, 'success');
            console.log(`[TRAKT SYNC] ${actionText} watchlist:`, title);
        } else {
            console.log(`[TRAKT SYNC] Watchlist ${action} failed:`, data.error);
        }
    } catch (error) {
        console.log('[TRAKT SYNC] Watchlist sync error:', error);
    }
}

async function syncWithTraktWatched(mediaType, title, year) {
    try {
        // Check if user is authenticated
        const statusResponse = await fetch('/api/trakt/status');
        const statusData = await statusResponse.json();
        if (!statusData.authenticated) {
            console.log('[TRAKT SYNC] User not authenticated, skipping watched sync');
            return;
        }

        // Use scrobble/stop to mark as watched (100% progress)
        const response = await fetch('/api/trakt/scrobble/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                type: mediaType,
                year: parseInt(year),
                progress: 100
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Marked "${title}" as watched on Trakt`, 'success');
            console.log('[TRAKT SYNC] Marked as watched:', title);
        } else {
            console.log('[TRAKT SYNC] Watched sync failed:', data.error);
        }
    } catch (error) {
        console.log('[TRAKT SYNC] Watched sync error:', error);
    }
}

async function syncWithTraktWatchedEpisode(showTitle, year, season, episode) {
    try {
        // Check if user is authenticated
        const statusResponse = await fetch('/api/trakt/status');
        const statusData = await statusResponse.json();
        if (!statusData.authenticated) {
            console.log('[TRAKT SYNC] User not authenticated, skipping episode sync');
            return;
        }

        // Use scrobble/stop to mark episode as watched
        const response = await fetch('/api/trakt/scrobble/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: showTitle,
                type: 'show',
                year: parseInt(year),
                season: parseInt(season),
                episode: parseInt(episode),
                progress: 100
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Marked S${season}E${episode} of "${showTitle}" as watched on Trakt`, 'success');
            console.log('[TRAKT SYNC] Marked episode as watched:', showTitle, `S${season}E${episode}`);
        } else {
            console.log('[TRAKT SYNC] Episode watched sync failed:', data.error);
        }
    } catch (error) {
        console.log('[TRAKT SYNC] Episode watched sync error:', error);
    }
}

async function syncWithTraktCollection(action, title, mediaType, year) {
    try {
        // Check if user is authenticated
        const statusResponse = await fetch('/api/trakt/status');
        const statusData = await statusResponse.json();
        if (!statusData.authenticated) {
            console.log('[TRAKT SYNC] User not authenticated, skipping collection sync');
            return;
        }

        const endpoint = action === 'add' ? '/api/trakt/collection/add' : '/api/trakt/collection/remove';
        const type = mediaType === 'movie' ? 'movie' : 'show';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, year: parseInt(year) })
        });

        const data = await response.json();

        if (data.success) {
            const actionText = action === 'add' ? 'Added to' : 'Removed from';
            console.log(`[TRAKT SYNC] ${actionText} collection:`, title);
        } else {
            console.log(`[TRAKT SYNC] Collection ${action} failed:`, data.error);
        }
    } catch (error) {
        console.log('[TRAKT SYNC] Collection sync error:', error);
    }
}

// Function to add episode-specific done watching
function addEpisodeToDoneWatching(showId, showTitle, season, episode, episodeTitle, year, poster) {
    const episodeItem = {
        id: showId,
        media_type: 'tv',
        title: showTitle,
        episode_title: episodeTitle,
        season: season,
        episode: episode,
        poster_path: poster,
        year: year,
        vote_average: 0,
        completed_date: new Date().toISOString()
    };

    // Check if this episode is already in done watching
    const existingIndex = doneWatchingCache.findIndex(item =>
        item.id === showId && item.media_type === 'tv' &&
        item.season === season && item.episode === episode
    );

    if (existingIndex === -1) {
        doneWatchingCache.unshift(episodeItem);
        saveDoneWatching();

        // Sync with Trakt
        syncWithTraktWatchedEpisode(showTitle, year, season, episode);

        showNotification(`Added S${season}E${episode} "${episodeTitle}" to done watching`, 'success');
    } else {
        showNotification(`S${season}E${episode} is already in done watching`, 'info');
    }
}

// Toggle episode-specific done watching
async function toggleEpisodeDoneWatching(event, showId, showTitle, season, episode, episodeTitle, year, poster) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.target.closest('.episode-done-btn');
    if (!button) return;

    const existingIndex = doneWatchingCache.findIndex(item =>
        item.id === showId && item.media_type === 'tv' &&
        item.season === season && item.episode === episode
    );

    if (existingIndex >= 0) {
        // Remove episode from done watching
        doneWatchingCache.splice(existingIndex, 1);
        button.classList.remove('is-done');
        button.innerHTML = '<i class="fas fa-check"></i>';
        button.title = 'Mark Episode as Done Watching';

        showNotification(`Removed S${season}E${episode} from done watching`, 'info');
    } else {
        // Add episode to done watching
        const episodeItem = {
            id: showId,
            media_type: 'tv',
            title: showTitle,
            episode_title: episodeTitle,
            season: season,
            episode: episode,
            poster_path: poster,
            year: year,
            vote_average: 0,
            completed_date: new Date().toISOString()
        };

        doneWatchingCache.unshift(episodeItem);
        button.classList.add('is-done');
        button.innerHTML = '<i class="fas fa-check-circle"></i>';
        button.title = 'Remove from Done Watching';

        // Sync with Trakt
        await syncWithTraktWatchedEpisode(showTitle, year, season, episode);

        showNotification(`Marked S${season}E${episode} "${episodeTitle}" as watched`, 'success');
    }

    await saveDoneWatching();

    // Refresh Done Watching page if it's currently open
    if (document.getElementById('doneWatchingPage').style.display !== 'none') {
        displayDoneWatching();
    }
    // Also update any other cards for the same show immediately
    updateAllDoneButtons(showId, 'tv');
}

// Update all .done-watching-btn in DOM for a given id/mediaType
function updateAllDoneButtons(id, mediaType) {
    document.querySelectorAll('.done-watching-btn').forEach(btn => {
        const onClick = btn.getAttribute('onclick') || '';
        if (onClick.includes('toggleDoneWatching') && onClick.includes(`, ${id},`) && onClick.includes(`'${mediaType}'`)) {
            const card = btn.closest('.movie-card');
            if (card) updateCardDoneStatus(card, id, mediaType);
        }
    });
}

// ===== END TRAKT SYNC FUNCTIONS =====

// Save Settings: persist useTorrentless and optionally API key, then close modal
async function saveSettings_() {
    // Get API key from any instance (prefer visible, else any non-empty)
    const apiKeyElements = document.querySelectorAll('#newApiKey');
    let apiKey = '';
    for (const el of apiKeyElements) {
        const val = (el.value || '').trim();
        if (val) {
            apiKey = val;
            // Prefer the visible one but accept hidden if that's the only filled one
            if (el.offsetParent !== null) break;
        }
    }

    // Get the toggle that is actually checked (either modal or settings page)
    const toggleElements = document.querySelectorAll('#useTorrentlessToggle');
    let toggleEl = null;
    for (const el of toggleElements) {
        if (el.offsetParent !== null) { // Check if element is visible
            toggleEl = el;
            break;
        }
    }
    const desiredTorrentless = toggleEl ? !!toggleEl.checked : useTorrentless;

    // Get Jackett URL (prefer visible, else any non-empty)
    const jackettUrlElements = document.querySelectorAll('#jackettUrl');
    let jackettUrl = '';
    for (const el of jackettUrlElements) {
        const val = (el.value || '').trim();
        if (val) {
            jackettUrl = val;
            if (el.offsetParent !== null) break;
        }
    }

    // Get cache location (prefer visible, else any non-empty)
    const cacheLocationElements = document.querySelectorAll('#cacheLocation');
    let cacheLocation = '';
    for (const el of cacheLocationElements) {
        const val = (el.value || '').trim();
        if (val) {
            cacheLocation = val;
            if (el.offsetParent !== null) break;
        }
    }

    // Get Auto‑Updater setting (prefer visible)
    const autoUpdateToggles = document.querySelectorAll('#autoUpdateToggle');
    let autoUpdateEnabled = true; // default ON
    for (const el of autoUpdateToggles) {
        if (el.offsetParent !== null) {
            autoUpdateEnabled = !!el.checked;
            break;
        }
    }

    // Get Discord Activity setting (prefer visible)
    const discordActivityToggles = document.querySelectorAll('#discordActivityToggle');
    let discordActivityEnabled = true; // default ON
    for (const el of discordActivityToggles) {
        if (el.offsetParent !== null) {
            discordActivityEnabled = !!el.checked;
            break;
        }
    }

    // Handle fullscreen toggle - get the visible one
    const fullscreenToggles = document.querySelectorAll('#fullscreenToggle');
    let fullscreenToggle = null;
    for (const el of fullscreenToggles) {
        if (el.offsetParent !== null) {
            fullscreenToggle = el;
            break;
        }
    }

    if (fullscreenToggle && window.electronAPI && window.electronAPI.setFullscreen) {
        try {
            const result = await window.electronAPI.setFullscreen(fullscreenToggle.checked);
            if (!result.success) {
                console.error('Failed to set fullscreen:', result.message);
                showNotification('Failed to change fullscreen mode');
            }
        } catch (error) {
            console.error('Error setting fullscreen:', error);
            showNotification('Error changing fullscreen mode');
        }
    }

    // Handle UI mode change - get the visible radios
    const uiModeNewElements = document.querySelectorAll('#uiModeNew');
    const uiModeOldElements = document.querySelectorAll('#uiModeOld');
    let uiModeNew = null;
    let uiModeOld = null;

    for (const el of uiModeNewElements) {
        if (el.offsetParent !== null) {
            uiModeNew = el;
            break;
        }
    }
    for (const el of uiModeOldElements) {
        if (el.offsetParent !== null) {
            uiModeOld = el;
            break;
        }
    }

    let selectedUIMode = 'new';
    if (uiModeOld && uiModeOld.checked) {
        selectedUIMode = 'old';
    }

    // Apply UI mode change immediately
    if (selectedUIMode !== currentUIMode) {
        applyUIMode(selectedUIMode);
    }

    let apiResult = null;
    try {
        // Build settings object
        const settings = {
            useTorrentless: desiredTorrentless,
            autoUpdate: !!autoUpdateEnabled,
            discordActivity: !!discordActivityEnabled
        };
        if (jackettUrl) settings.jackettUrl = jackettUrl;
        if (cacheLocation) settings.cacheLocation = cacheLocation;

        // Persist all settings including Jackett URL and cache location
        await fetch(`${API_BASE_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        useTorrentless = desiredTorrentless;

        // Update the cached Discord activity flag
        discordActivityEnabled = !!discordActivityEnabled;

        // If Discord activity was disabled, clear the presence immediately
        if (!discordActivityEnabled) {
            console.log('[Settings] Discord activity disabled, clearing presence');
            await clearDiscordPresence();
        }

        // If an API key was provided, attempt to save it; otherwise skip quietly
        if (apiKey) {
            const response = await fetch(`${API_BASE_URL}/set-api-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });
            let keyLoc = null;
            try {
                apiResult = await response.json();
            } catch (_) { apiResult = null; }
            if (response.ok) {
                hasApiKey = true;
                // Confirm and show where it was saved
                try {
                    const locRes = await fetch(`${API_BASE_URL}/key-location`);
                    if (locRes.ok) keyLoc = await locRes.json();
                } catch (_) { }
                await loadCurrentApiKey();
                if (keyLoc?.hasApiKey && keyLoc?.path) {
                    showNotification(`Settings saved. API key updated at ${keyLoc.path}`);
                } else {
                    showNotification('Settings saved. API key updated.');
                }
                // Clear ALL API key inputs after success
                document.querySelectorAll('#newApiKey').forEach(el => { el.value = ''; });
            } else {
                showNotification(apiResult?.error || 'Failed to update API key');
            }
        } else {
            showNotification('Settings saved.');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        // Even if API key call fails, close the modal when toggling Torrentless is desired
    } finally {
        // Check if we're on settings page or in modal
        if (window.location.hash === '#/settings') {
            // Stay on settings page, just show notification
            // Navigation will be handled by cancel button if needed
        } else {
            hideSettingsModal();
        }
    }
}

// Helper functions for page navigation (used by sidebar)
function showHomePage() {
    window.location.hash = '#/';
}

function showGenresPage() {
    window.location.hash = '#/genres';
}

function showCustomMagnetModal() {
    const modal = document.getElementById('custom-magnet-modal');
    const input = document.getElementById('custom-magnet-input');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }
    }
}

function showMyListPage() {
    window.location.hash = '#/my-list';
}

function showDoneWatchingPage() {
    window.location.hash = '#/done-watching';
}

function showTraktPage() {
    window.location.hash = '#/trakt';
}

function showLiveTvPage() {
    window.location.hash = '#/livetv';
}

function showIptvPage() {
    window.location.hash = '#/iptv';
    try { updateIptvActionButton(); } catch (_) { }
}

function reloadIptvPage() {
    const iptvIframe = document.getElementById('iptv-iframe');
    const iptvSelector = document.getElementById('iptv-source-select');
    if (iptvIframe) {
        // Get current selected source URL
        const currentSrc = iptvSelector ? iptvSelector.value : 'https://iptvplaytorrio.pages.dev/';
        // Clear the src first to force a complete reload
        iptvIframe.src = 'about:blank';
        // Use a timeout to ensure the blank page loads before setting the new src
        setTimeout(() => {
            iptvIframe.src = currentSrc;
            // Auto-scroll the IPTV page itself (not the iframe content) to show the iframe
            setTimeout(() => {
                const iptvPageEl = document.getElementById('iptv-page');
                if (iptvPageEl) {
                    // Scroll the main page to focus on the iframe area
                    iptvIframe.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    console.log('[IPTV] Auto-scrolled IPTV page to show iframe');
                }
            }, 300); // Quick scroll after iframe starts loading
        }, 100);
        console.log('[IPTV] Page reloaded fresh with source:', currentSrc);
    }
}

// IPTV source selector handler
function initIptvSourceSelector() {
    const iptvSelector = document.getElementById('iptv-source-select');
    const iptvIframe = document.getElementById('iptv-iframe');

    if (iptvSelector && iptvIframe) {
        iptvSelector.addEventListener('change', (event) => {
            const selectedUrl = event.target.value;
            const selectedOption = event.target.selectedOptions[0];
            const isExternal = selectedOption.hasAttribute('data-external');

            console.log('[IPTV] Switching to source:', selectedUrl, 'external:', isExternal);

            if (isExternal) {
                // Open in external browser for sites that don't allow embedding
                if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(selectedUrl);
                    showNotification('Opening IPTV Web App in browser...', 'info');
                    // Reset dropdown to previous working option
                    setTimeout(() => {
                        iptvSelector.value = 'https://iptvplaytorrio.pages.dev/';
                    }, 100);
                }
            } else {
                // Show loading indication
                iptvIframe.style.opacity = '0.5';

                // Clear and load new source
                iptvIframe.src = 'about:blank';
                setTimeout(() => {
                    iptvIframe.src = selectedUrl;
                    iptvIframe.style.opacity = '1';
                    showNotification('Loading IPTV source...', 'info');
                }, 100);
            }
        });

        // Add error handling for iframe loading
        iptvIframe.addEventListener('load', () => {
            console.log('[IPTV] Iframe loaded successfully');
            iptvIframe.style.opacity = '1';
        });

        iptvIframe.addEventListener('error', (e) => {
            console.error('[IPTV] Iframe failed to load:', e);
            showNotification('Failed to load IPTV source. Site may block embedding.', 'error');
            iptvIframe.style.opacity = '1';
        });

        console.log('[IPTV] Source selector initialized');
    }
}

function clearIptvPage() {
    const iptvIframe = document.getElementById('iptv-iframe');
    if (iptvIframe) {
        // Clear the iframe to stop any ongoing streams
        iptvIframe.src = 'about:blank';
        console.log('[IPTV] Page cleared - stopping all streams');
    }
}

// ===== Custom IPTV (Xtream Codes) =====
function disableIptvIframe() {
    try {
        const iptvIframe = document.getElementById('iptv-iframe');
        if (iptvIframe) {
            iptvIframe.src = 'about:blank';
            iptvIframe.style.display = 'none';
            console.log('[IPTV] Default iframe disabled (custom Xtream active)');
        }
    } catch (_) { }
}

function enableIptvIframe() {
    try {
        const iptvIframe = document.getElementById('iptv-iframe');
        if (iptvIframe) {
            iptvIframe.style.display = '';
            if (!iptvIframe.src || iptvIframe.src === 'about:blank') {
                iptvIframe.src = 'https://iptvplaytorrio.pages.dev/';
            }
            console.log('[IPTV] Default iframe enabled');
        }
    } catch (_) { }
}
const xtreamState = {
    base: '',
    username: '',
    password: '',
    tab: 'live', // 'live' | 'vod' | 'series'
    active: false,
    mode: 'none', // 'none' | 'xtream' | 'm3u'
    liveCategories: [],
    vodCategories: [],
    seriesCategories: [],
    lastStreams: [],
    m3u: { items: [], categories: [] },
    displayedIndex: 0,
    pageSize: 50,
};

// Persistent IPTV settings helpers
async function iptvLoadSettings() {
    try {
        const resp = await fetch('/api/iptv/settings', { cache: 'no-store' });
        const data = await resp.json();
        return data?.iptv || { lastMode: 'iframe', rememberCreds: false, xtream: { base: '', username: '', password: '' }, m3u: { url: '' } };
    } catch {
        // Fallback to localStorage for backward compatibility
        try {
            const saved = JSON.parse(localStorage.getItem('xtreamCodesCreds') || '{}');
            return { lastMode: 'iframe', rememberCreds: !!(saved.base || saved.username || saved.password), xtream: { base: saved.base || '', username: saved.username || '', password: saved.password || '' }, m3u: { url: '' } };
        } catch { return { lastMode: 'iframe', rememberCreds: false, xtream: { base: '', username: '', password: '' }, m3u: { url: '' } }; }
    }
}

async function iptvSaveSettings(patch = {}) {
    try {
        await fetch('/api/iptv/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    } catch (e) {
        console.warn('[IPTV] Failed to save settings', e);
    }
}

// Auto-restore IPTV state from saved settings on app load
async function xtreamAutoLogin(base, username, password) {
    try {
        let apiBase = xtreamNormalizeBase(base);
        const loginParams = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        async function attemptLogin(baseUrl) {
            const url = `/api/proxy/xtream?base=${encodeURIComponent(baseUrl)}&params=${encodeURIComponent(loginParams)}`;
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Server returned ' + resp.status);
            const data = await resp.json();
            return { data, baseUrl };
        }
        let { data, baseUrl } = await attemptLogin(apiBase);
        if (!data || data.nonJson || (!data.user_info && !data.server_info)) {
            try {
                const flipped = apiBase.startsWith('https://') ? apiBase.replace(/^https:\/\//i, 'http://') : apiBase.replace(/^http:\/\//i, 'https://');
                const retry = await attemptLogin(flipped);
                if (retry?.data && !retry.data.nonJson && (retry.data.user_info || retry.data.server_info)) {
                    data = retry.data; baseUrl = retry.baseUrl; apiBase = flipped;
                }
            } catch { }
        }
        if (!data || data.nonJson) throw new Error('Non-JSON response');
        if (data.user_info && String(data.user_info.status).toLowerCase() !== 'active') throw new Error('Account is not active');
        xtreamState.base = apiBase; xtreamState.username = username; xtreamState.password = password; xtreamState.tab = 'live';
        xtreamState.active = true; xtreamState.mode = 'xtream';
        await xtreamLoadAllCategories();
        try { clearIptvPage(); disableIptvIframe(); } catch (_) { }
        hideXtreamLoginModal();
        showXtreamBrowser();
        await xtreamRenderCurrentTab();
        updateIptvActionButton();
        showNotification('Xtream Codes connected (restored)', 'success');
    } catch (e) {
        console.warn('[XTREAM] auto-login failed:', e?.message || e);
        // Fall back to iframe to keep UI usable
        try { enableIptvIframe(); } catch (_) { }
        updateIptvActionButton();
    }
}

async function iptvAutoRestore() {
    try {
        const saved = await iptvLoadSettings();
        const mode = saved?.lastMode || 'iframe';
        if (mode === 'iframe') {
            try { enableIptvIframe(); hideXtreamBrowser(); } catch (_) { }
            updateIptvActionButton();
            return;
        }
        if (mode === 'm3u' && saved?.m3u?.url) {
            await loadM3UFromUrl(saved.m3u.url);
            return;
        }
        if (mode === 'xtream' && saved?.rememberCreds && saved?.xtream?.base && saved?.xtream?.username && saved?.xtream?.password) {
            await xtreamAutoLogin(saved.xtream.base, saved.xtream.username, saved.xtream.password);
            return;
        }
        // Default fallback
        try { enableIptvIframe(); hideXtreamBrowser(); } catch (_) { }
        updateIptvActionButton();
    } catch (e) {
        console.warn('[IPTV] auto-restore failed:', e?.message || e);
        try { enableIptvIframe(); hideXtreamBrowser(); } catch (_) { }
        updateIptvActionButton();
    }
}

function xtreamNormalizeBase(url) {
    if (!url) return '';
    let u = (url + '').trim();
    // Add scheme if missing
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    // Remove query/fragment for base
    try { const tmp = new URL(u); u = tmp.origin + tmp.pathname; } catch { }
    // Strip common portal/file suffixes
    u = u.replace(/\/+$/, '');
    u = u.replace(/\/(player_api\.php|xmltv\.php|get\.php)$/i, '');
    u = u.replace(/\/(c|panel_api|client_area)\/?$/i, '');
    // Final trim of trailing slashes
    u = u.replace(/\/+$/, '');
    return u;
}

async function showXtreamLoginModal(prefill = true) {
    const modal = document.getElementById('xtream-login-modal');
    if (!modal) return;
    // prefill from storage
    if (prefill) {
        try {
            const saved = await iptvLoadSettings();
            const baseEl = document.getElementById('xtream-base-url');
            const userEl = document.getElementById('xtream-username');
            const passEl = document.getElementById('xtream-password');
            const remEl = document.getElementById('xtream-remember');
            const m3uEl = document.getElementById('xtream-m3u-url');
            if (saved?.xtream) {
                if (saved.rememberCreds) {
                    if (baseEl) baseEl.value = saved.xtream.base || '';
                    if (userEl) userEl.value = saved.xtream.username || '';
                    if (passEl) passEl.value = saved.xtream.password || '';
                }
                if (remEl) remEl.checked = !!saved.rememberCreds;
            }
            if (m3uEl && saved?.m3u?.url) m3uEl.value = saved.m3u.url;
        } catch (_) { }
    }
    modal.style.display = 'flex';
}

function hideXtreamLoginModal() {
    const modal = document.getElementById('xtream-login-modal');
    if (modal) modal.style.display = 'none';
}

function showXtreamBrowser() {
    const inline = document.getElementById('xtream-inline');
    const grid = document.getElementById('xtream-grid');
    const empty = document.getElementById('xtream-empty');
    const search = document.getElementById('xtream-search');
    const cat = document.getElementById('xtream-category-select');
    if (inline) inline.style.display = 'block';
    if (grid) grid.innerHTML = '';
    if (empty) empty.style.display = '';
    if (search) search.value = '';
    if (cat) cat.innerHTML = '<option value="">All Categories</option>';
}

function hideXtreamBrowser() {
    const inline = document.getElementById('xtream-inline');
    if (inline) inline.style.display = 'none';
}

let xtreamHls = null;

function ensureHlsScriptLoaded() {
    return new Promise((resolve, reject) => {
        if (window.Hls) return resolve();
        const existing = document.getElementById('hlsjs-script');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Failed to load hls.js')));
            return;
        }
        const s = document.createElement('script');
        s.id = 'hlsjs-script';
        s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load hls.js'));
        document.head.appendChild(s);
    });
}

async function showXtreamPlayer(title, url) {
    const modal = document.getElementById('xtream-player-modal');
    const video = document.getElementById('xtream-video');
    const label = document.getElementById('xtream-player-title');
    const openBtn = document.getElementById('xtream-open-external');
    const openMpvBtn = document.getElementById('xtream-open-mpv');
    const openIinaBtn = document.getElementById('xtream-open-iina');
    const openVlcBtn = document.getElementById('xtream-open-vlc');
    if (!modal || !video) return;
    // reset any previous playback and hls instance
    try { video.pause(); } catch (_) { }
    try { if (xtreamHls) { xtreamHls.destroy(); xtreamHls = null; } } catch (_) { }
    video.removeAttribute('src');
    video.load();
    video.crossOrigin = 'anonymous';
    if (label) label.textContent = title || 'Playing';

    // Toggle buttons per platform
    const platform = window.electronAPI?.platform;
    if (openMpvBtn) openMpvBtn.style.display = (platform === 'win32') ? 'inline-flex' : 'none';
    if (openIinaBtn) openIinaBtn.style.display = (platform === 'darwin') ? 'inline-flex' : 'none';

    // External open buttons
    if (openBtn) {
        openBtn.onclick = () => {
            if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
            else window.open(url, '_blank');
        };
    }
    if (openMpvBtn) {
        openMpvBtn.onclick = async () => {
            try {
                // Windows: use native mpv.js player
                if (window.electronAPI && window.electronAPI.platform === 'win32' && window.electronAPI.spawnMpvjsPlayer) {
                    const payload = { url };
                    const result = await window.electronAPI.spawnMpvjsPlayer(payload);
                    if (!result || !result.success) {
                        showNotification(result?.message || 'Failed to launch mpv.js player');
                    }
                    return;
                }
                showNotification('mpv.js player only available on Windows');
            } catch (e) {
                showNotification('Failed to launch player: ' + (e?.message || e));
            }
        };
    }
    if (openIinaBtn) {
        openIinaBtn.onclick = async () => {
            try {
                if (!window.electronAPI || !window.electronAPI.openInIINA) {
                    showNotification('IINA integration not available in this environment');
                    return;
                }
                const data = { streamUrl: url };
                const result = await window.electronAPI.openInIINA(data);
                if (!result || !result.success) {
                    showNotification(result?.message || 'Failed to launch IINA');
                }
            } catch (e) {
                showNotification('Failed to launch IINA: ' + (e?.message || e));
            }
        };
    }
    if (openVlcBtn) {
        openVlcBtn.onclick = async () => {
            try {
                if (!window.electronAPI || !window.electronAPI.openInVLC) {
                    showNotification('VLC integration not available in this environment');
                    return;
                }
                const data = { streamUrl: url };
                const result = await window.electronAPI.openInVLC(data);
                if (!result || !result.success) {
                    showNotification(result?.message || 'Failed to launch VLC');
                }
            } catch (e) {
                showNotification('Failed to launch VLC: ' + (e?.message || e));
            }
        };
    }
    modal.style.display = 'flex';
    // Choose playback method
    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls) {
        try {
            await ensureHlsScriptLoaded();
            if (window.Hls && window.Hls.isSupported()) {
                xtreamHls = new window.Hls({ enableWorker: true });
                xtreamHls.loadSource(url);
                xtreamHls.attachMedia(video);
                xtreamHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    try { video.play().catch(() => { }); } catch (_) { }
                });
                xtreamHls.on(window.Hls.Events.ERROR, (e, data) => {
                    if (data && data.fatal) {
                        try { xtreamHls.destroy(); } catch (_) { }
                        xtreamHls = null;
                        // If this is an Xtream live stream, try TS fallback before opening browser
                        if ((xtreamState.mode === 'xtream') && /\.m3u8(\?|$)/i.test(url)) {
                            const tsUrl = url.replace(/\.m3u8(\?.*)?$/i, '.ts$1');
                            try {
                                video.src = tsUrl;
                                video.load();
                                video.play().catch(() => {
                                    showNotification('HLS failed. TS fallback also failed. Use "Open in Browser" if desired.', 'error');
                                });
                            } catch (_) {
                                showNotification('HLS failed. Use "Open in Browser" if desired.', 'error');
                            }
                        } else {
                            showNotification('HLS playback error. Use "Open in Browser" if desired.', 'error');
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                setTimeout(() => { try { video.play().catch(() => { }); } catch (_) { } }, 50);
            } else {
                // No HLS support
                showNotification('HLS not supported by this device. Use "Open in Browser" or external players.', 'warning');
            }
        } catch (e) {
            console.error('[HLS] load error:', e);
            showNotification('Failed to initialize HLS. Use "Open in Browser" if desired.', 'error');
        }
    } else {
        // Regular file/stream
        try {
            video.src = url;
            video.currentTime = 0;
            video.load();
            setTimeout(() => { try { video.play().catch(() => { }); } catch (_) { } }, 50);
        } catch {
            showNotification('Playback failed. Use "Open in Browser" if desired.', 'error');
        }
    }
    // add basic error fallback
    const onError = () => {
        showNotification('Playback error. Use "Open in Browser" if desired.', 'error');
    };
    video.onerror = onError;
}

function hideXtreamPlayer() {
    const modal = document.getElementById('xtream-player-modal');
    const video = document.getElementById('xtream-video');
    if (video) { try { video.pause(); } catch (_) { } video.removeAttribute('src'); video.load(); }
    try { if (xtreamHls) { xtreamHls.destroy(); xtreamHls = null; } } catch (_) { }
    if (modal) modal.style.display = 'none';
}

function updateIptvActionButton() {
    const btn = document.getElementById('iptv-custom-btn');
    if (!btn) return;
    if (xtreamState.active) {
        btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Use PlayTorrio IPTV';
        btn.title = 'Switch back to the default IPTV page';
    } else {
        btn.innerHTML = '<i class="fas fa-user-lock"></i> Custom IPTV (Xtream Codes)';
        btn.title = 'Login with your Xtream Codes provider';
    }
}

function iptvActionButtonClick() {
    if (xtreamState.active) {
        // Switch back to default IPTV
        try { hideXtreamBrowser(); } catch (_) { }
        try { hideXtreamPlayer(); } catch (_) { }
        try { enableIptvIframe(); } catch (_) { }
        xtreamState.active = false;
        // persist last mode
        iptvSaveSettings({ lastMode: 'iframe' });
        updateIptvActionButton();
        showNotification('Switched to PlayTorrio IPTV', 'success');
    } else {
        // Open login for custom Xtream
        showXtreamLoginModal(true);
    }
}

async function xtreamLogin() {
    const baseEl = document.getElementById('xtream-base-url');
    const userEl = document.getElementById('xtream-username');
    const passEl = document.getElementById('xtream-password');
    const remember = document.getElementById('xtream-remember')?.checked;
    const status = document.getElementById('xtream-login-status');
    const btn = document.getElementById('xtream-login-submit');

    const base = xtreamNormalizeBase(baseEl.value);
    const username = (userEl.value || '').trim();
    const password = (passEl.value || '').trim();
    if (!base || !username || !password) {
        if (status) status.textContent = 'Please fill all fields.';
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...'; }
    if (status) status.textContent = 'Contacting server...';
    try {
        let apiBase = xtreamNormalizeBase(base);
        const loginParams = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        async function attemptLogin(baseUrl) {
            const url = `/api/proxy/xtream?base=${encodeURIComponent(baseUrl)}&params=${encodeURIComponent(loginParams)}`;
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) throw new Error('Server returned ' + resp.status);
            const data = await resp.json();
            return { data, baseUrl };
        }

        let { data, baseUrl } = await attemptLogin(apiBase);
        // If non-JSON or invalid, retry once with scheme flipped (http<->https)
        if (!data || data.nonJson || (!data.user_info && !data.server_info)) {
            try {
                const flipped = apiBase.startsWith('https://')
                    ? apiBase.replace(/^https:\/\//i, 'http://')
                    : apiBase.replace(/^http:\/\//i, 'https://');
                const retry = await attemptLogin(flipped);
                if (retry?.data && !retry.data.nonJson && (retry.data.user_info || retry.data.server_info)) {
                    data = retry.data; baseUrl = retry.baseUrl; apiBase = flipped;
                }
            } catch { }
        }

        if (!data || data.nonJson) {
            const detail = data?.contentType ? ` (${data.contentType}${data.status ? ', ' + data.status : ''})` : '';
            throw new Error('Server returned non-JSON response' + detail);
        }
        if (!data.user_info && !data.server_info) throw new Error('Invalid response');
        if (data.user_info && String(data.user_info.status).toLowerCase() !== 'active') {
            throw new Error('Account is not active');
        }
        xtreamState.base = apiBase; xtreamState.username = username; xtreamState.password = password; xtreamState.tab = 'live';
        xtreamState.active = true; xtreamState.mode = 'xtream';
        // persist settings (respect remember toggle for credentials)
        if (remember) {
            await iptvSaveSettings({ lastMode: 'xtream', rememberCreds: true, xtream: { base, username, password } });
        } else {
            await iptvSaveSettings({ lastMode: 'xtream', rememberCreds: false, xtream: { base: '', username: '', password: '' } });
        }
        if (status) status.textContent = 'Login successful. Loading categories...';
        await xtreamLoadAllCategories();
        // Disable the default IPTV iframe when using custom Xtream
        try { clearIptvPage(); disableIptvIframe(); } catch (_) { }
        hideXtreamLoginModal();
        showXtreamBrowser();
        await xtreamRenderCurrentTab();
        showNotification('Xtream Codes connected', 'success');
        updateIptvActionButton();
    } catch (e) {
        console.error('[XTREAM] Login error:', e);
        if (status) status.textContent = 'Login failed: ' + (e?.message || 'Unknown error');
        showNotification('Xtream login failed: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login'; }
    }
}

// ---- M3U/M3U8 Support ----
function parseM3U(text) {
    const lines = (text || '').split(/\r?\n/);
    const items = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF:')) {
            // Parse attributes from EXTINF
            const attrPart = line.substring(line.indexOf(',') > -1 ? 0 : line.length);
            const name = line.substring(line.indexOf(',') + 1).trim();
            const attrs = {};
            const attrRegex = /(\w[\w-]*)=\"([^\"]*)\"/g;
            let m;
            while ((m = attrRegex.exec(line)) !== null) {
                attrs[m[1]] = m[2];
            }
            current = {
                name: name || attrs['tvg-name'] || attrs['channel-name'] || 'Channel',
                logo: attrs['tvg-logo'] || '',
                group: attrs['group-title'] || 'Other',
                url: ''
            };
        } else if (!line.startsWith('#') && current) {
            current.url = line;
            items.push(current);
            current = null;
        }
    }
    // Build categories
    const cats = Array.from(new Set(items.map(it => it.group || 'Other'))).sort();
    return { items, categories: cats };
}

async function loadM3UFromUrl(url) {
    const status = document.getElementById('xtream-login-status');
    try {
        if (status) status.textContent = 'Loading playlist...';
        const proxyUrl = `/api/proxy/fetch-text?url=${encodeURIComponent(url)}`;
        const resp = await fetch(proxyUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Playlist request failed: ' + resp.status);
        const text = await resp.text();
        const parsed = parseM3U(text);
        if (!parsed.items.length) throw new Error('No channels found in playlist');
        xtreamState.m3u = parsed;
        xtreamState.tab = 'live';
        xtreamState.active = true; xtreamState.mode = 'm3u';
        // persist last mode and playlist URL
        await iptvSaveSettings({ lastMode: 'm3u', m3u: { url } });
        // Disable default IPTV iframe
        try { clearIptvPage(); disableIptvIframe(); } catch (_) { }
        hideXtreamLoginModal();
        showXtreamBrowser();
        await xtreamRenderCurrentTab();
        updateIptvActionButton();
        showNotification(`Loaded ${parsed.items.length} playlist items`, 'success');
    } catch (e) {
        console.error('[M3U] Load error:', e);
        if (status) status.textContent = 'Failed to load playlist: ' + (e?.message || 'Unknown error');
        showNotification('Failed to load playlist: ' + (e?.message || 'Unknown error'), 'error');
    }
}

function isDirectMediaUrl(u) {
    try {
        const url = (u || '').toLowerCase();
        return /\.(m3u8|mp4|mp3|aac|m4a|ts|webm|mkv|mov|avi)(\?|$)/.test(url);
    } catch { return false; }
}

async function xtreamFetch(pathParams) {
    const { base, username, password } = xtreamState;
    const qs = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${pathParams ? '&' + pathParams : ''}`;
    async function attempt(baseUrl) {
        const url = `/api/proxy/xtream?base=${encodeURIComponent(baseUrl)}&params=${encodeURIComponent(qs)}`;
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Request failed: ' + resp.status);
        const data = await resp.json();
        return { data, baseUrl };
    }
    let { data, baseUrl } = await attempt(base);
    if (!data || data.nonJson) {
        try {
            const flipped = base.startsWith('https://') ? base.replace(/^https:\/\//i, 'http://') : base.replace(/^http:\/\//i, 'https://');
            const retry = await attempt(flipped);
            if (retry?.data && !retry.data.nonJson) { data = retry.data; baseUrl = retry.baseUrl; }
        } catch { }
    }
    if (!data || data.nonJson) {
        const detail = data?.contentType ? ` (${data.contentType}${data.status ? ', ' + data.status : ''})` : '';
        throw new Error('Xtream API returned non-JSON' + detail);
    }
    return data;
}

async function xtreamLoadAllCategories() {
    try {
        const [live, vod, series] = await Promise.all([
            xtreamFetch('action=get_live_categories').catch(() => []),
            xtreamFetch('action=get_vod_categories').catch(() => []),
            xtreamFetch('action=get_series_categories').catch(() => [])
        ]);
        xtreamState.liveCategories = Array.isArray(live) ? live : [];
        xtreamState.vodCategories = Array.isArray(vod) ? vod : [];
        xtreamState.seriesCategories = Array.isArray(series) ? series : [];
    } catch (e) {
        console.warn('[XTREAM] Failed to load some categories:', e);
    }
}

function xtreamPopulateCategories() {
    const select = document.getElementById('xtream-category-select');
    if (!select) return;
    const tab = xtreamState.tab;
    let cats = [];
    if (xtreamState.mode === 'm3u') {
        // Only one logical tab: live
        cats = (xtreamState.m3u?.categories) || [];
    } else {
        if (tab === 'live') cats = xtreamState.liveCategories; else if (tab === 'vod') cats = xtreamState.vodCategories; else cats = xtreamState.seriesCategories;
    }
    const current = select.value;
    select.innerHTML = '<option value="">All Categories</option>';

    // Show all categories - dropdown will naturally scroll
    if (xtreamState.mode === 'm3u') {
        cats.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    } else {
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.category_id;
            opt.textContent = c.category_name || ('Category ' + c.category_id);
            select.appendChild(opt);
        });
    }
    // try keep selection if exists
    if ([...select.options].some(o => o.value === current)) select.value = current;
}

function xtreamBuildStreamUrl(kind, stream) {
    const { base, username, password } = xtreamState;
    if (!stream) return '';
    if (xtreamState.mode === 'm3u') {
        return stream.url || '';
    }
    const id = stream.stream_id || stream.series_id || stream.id;
    if (kind === 'live') {
        const ext = (stream?.container_extension) ? stream.container_extension.replace(/^\./, '') : 'm3u8';
        return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.${ext}`;
    } else if (kind === 'vod') {
        const ext = (stream?.container_extension) ? stream.container_extension.replace(/^\./, '') : 'mp4';
        return `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.${ext}`;
    }
    return '';
}

async function xtreamLoadStreamsForCurrentTab(categoryId = '') {
    const tab = xtreamState.tab;
    try {
        let list = [];
        if (xtreamState.mode === 'm3u') {
            const all = (xtreamState.m3u?.items) || [];
            if (!categoryId) list = all;
            else list = all.filter(it => (it.group || '') === categoryId);
        } else if (tab === 'live') {
            const p = categoryId ? `action=get_live_streams&category_id=${encodeURIComponent(categoryId)}` : 'action=get_live_streams';
            list = await xtreamFetch(p);
        } else if (tab === 'vod') {
            const p = categoryId ? `action=get_vod_streams&category_id=${encodeURIComponent(categoryId)}` : 'action=get_vod_streams';
            list = await xtreamFetch(p);
        } else {
            const p = categoryId ? `action=get_series&category_id=${encodeURIComponent(categoryId)}` : 'action=get_series';
            list = await xtreamFetch(p);
        }
        xtreamState.lastStreams = Array.isArray(list) ? list : [];
        // Initialize pagination
        xtreamState.displayedIndex = 0;
        xtreamState.pageSize = 50; // Load 50 items at a time
    } catch (e) {
        console.error('[XTREAM] Load streams error:', e);
        xtreamState.lastStreams = [];
    }
}

function xtreamRenderGrid(append = false) {
    const grid = document.getElementById('xtream-grid');
    const empty = document.getElementById('xtream-empty');
    const search = (document.getElementById('xtream-search')?.value || '').toLowerCase().trim();
    if (!grid || !empty) return;

    let items = xtreamState.lastStreams || [];
    if (search) {
        items = items.filter(it => ((it.name || it.title || '').toLowerCase().includes(search)));
    }

    // Pagination logic
    const start = append ? xtreamState.displayedIndex : 0;
    const end = start + xtreamState.pageSize;
    const itemsToRender = items.slice(start, end);

    if (!append) {
        grid.innerHTML = '';
    }

    if (!items.length) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    const tab = xtreamState.tab;
    itemsToRender.forEach(it => {
        const card = document.createElement('div');
        card.className = 'music-card';
        card.style.cursor = 'default';
        const name = xtreamState.mode === 'm3u' ? (it.name || 'Channel') : (it.name || it.title || `ID ${it.stream_id || it.series_id || ''}`);
        const poster = xtreamState.mode === 'm3u' ? (it.logo || '') : (it.stream_icon || it.cover || it.movie_image || '');
        const playUrl = (tab === 'series' && xtreamState.mode !== 'm3u') ? '' : xtreamBuildStreamUrl(tab, it);
        const btns = (tab === 'series' && xtreamState.mode !== 'm3u') ? `
                    <button class="btn" style="padding:.4rem .7rem; border:none; border-radius:6px; background:linear-gradient(135deg,#f59e0b,#b45309); color:#fff; cursor:pointer;" data-action="series" data-id="${it.series_id}">
                        <i class="fas fa-list"></i> Episodes
                    </button>
                ` : `
                    <button class="btn" style="padding:.4rem .7rem; border:none; border-radius:6px; background:linear-gradient(135deg,#10b981,#059669); color:#fff; cursor:pointer;" data-action="play" data-url="${playUrl}" data-name="${name.replace(/"/g, '&quot;')}">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <button class="btn" style="padding:.4rem .7rem; border:none; border-radius:6px; background:linear-gradient(135deg,#3b82f6,#2563eb); color:#fff; cursor:pointer;" data-action="open" data-url="${playUrl}">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                    <button class="btn" style="padding:.4rem .7rem; border:none; border-radius:6px; background:rgba(255,255,255,.1); color:#fff; cursor:pointer;" data-action="copy" data-url="${playUrl}">
                        <i class="fas fa-copy"></i>
                    </button>
                `;
        card.innerHTML = `
                    <div class="music-cover">
                        ${poster ? `<img loading="lazy" src="${poster}" alt="${name}" onerror="this.style.display='none'">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05)"><i class='fas fa-tv'></i></div>`}
                    </div>
                    <div class="music-info">
                        <div class="music-title">${name}</div>
                        <div class="music-actions" style="flex-wrap:wrap; gap:.4rem; margin-top:.4rem;">${btns}</div>
                    </div>
                `;
        grid.appendChild(card);
    });

    // Update displayed index
    xtreamState.displayedIndex = end;

    // wire buttons (only for newly added items)
    const newCards = Array.from(grid.children).slice(-itemsToRender.length);
    newCards.forEach(card => {
        card.querySelectorAll('[data-action="play"]').forEach(b => b.addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            const name = e.currentTarget.getAttribute('data-name');
            if (!url) { showNotification('No stream URL found', 'error'); return; }
            showXtreamPlayer(name, url);
        }));
        card.querySelectorAll('[data-action="open"]').forEach(b => b.addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            if (!url) { showNotification('No stream URL found', 'error'); return; }
            if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url); else window.open(url, '_blank');
        }));
        card.querySelectorAll('[data-action="copy"]').forEach(b => b.addEventListener('click', async (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            try { await navigator.clipboard.writeText(url); showNotification('Stream URL copied', 'success'); } catch { showNotification('Copy failed', 'error'); }
        }));
        card.querySelectorAll('[data-action="series"]').forEach(b => b.addEventListener('click', (e) => {
            const seriesId = e.currentTarget.getAttribute('data-id');
            xtreamShowSeriesEpisodes(seriesId);
        }));
    });
}

async function xtreamShowSeriesEpisodes(seriesId) {
    try {
        const info = await xtreamFetch(`action=get_series_info&series_id=${encodeURIComponent(seriesId)}`);
        const episodesData = (info?.episodes) ? Object.values(info.episodes).flat() : [];
        if (!episodesData.length) { showNotification('No episodes found', 'info'); return; }

        // Group episodes by season
        const seasonMap = {};
        episodesData.forEach(ep => {
            const season = ep.season || '1';
            if (!seasonMap[season]) seasonMap[season] = [];
            seasonMap[season].push(ep);
        });

        // Render season cards with collapsible episodes
        const grid = document.getElementById('xtream-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const seasons = Object.keys(seasonMap).sort((a, b) => parseInt(a) - parseInt(b));

        seasons.forEach(seasonNum => {
            const episodes = seasonMap[seasonNum];
            const seasonCard = document.createElement('div');
            seasonCard.className = 'music-card';
            seasonCard.style.gridColumn = '1 / -1'; // Full width
            seasonCard.style.cursor = 'pointer';
            seasonCard.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(37,99,235,0.05))';
            seasonCard.style.border = '1px solid rgba(59,130,246,0.3)';

            const seasonId = `season-${seriesId}-${seasonNum}`;
            seasonCard.innerHTML = `
                        <div style="padding:1rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h3 style="color:#fff; margin:0; font-size:1.1rem;">
                                    <i class="fas fa-tv" style="color:#3b82f6;"></i> Season ${seasonNum}
                                    <span style="color:#9ca3af; font-size:0.9rem; margin-left:0.5rem;">(${episodes.length} episodes)</span>
                                </h3>
                                <button class="season-toggle" data-season-id="${seasonId}" style="background:rgba(59,130,246,0.2); border:1px solid rgba(59,130,246,0.4); color:#3b82f6; padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">
                                    <i class="fas fa-chevron-down"></i> Show Episodes
                                </button>
                            </div>
                            <div id="${seasonId}" style="display:none; margin-top:1rem;">
                                <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:0.75rem;"></div>
                            </div>
                        </div>
                    `;
            grid.appendChild(seasonCard);

            // Add toggle functionality
            const toggleBtn = seasonCard.querySelector('.season-toggle');
            const episodesContainer = seasonCard.querySelector(`#${seasonId}`);
            const episodesGrid = episodesContainer.querySelector('div');

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = episodesContainer.style.display === 'none';

                if (isHidden) {
                    // Render episodes if not already rendered
                    if (episodesGrid.children.length === 0) {
                        episodes.forEach(ep => {
                            const name = `E${ep.episode_num} - ${ep.title || 'Episode'}`;
                            const url = `${xtreamState.base}/series/${encodeURIComponent(xtreamState.username)}/${encodeURIComponent(xtreamState.password)}/${ep.id}.${(ep.container_extension || 'mp4').replace(/^\./, '')}`;

                            const epCard = document.createElement('div');
                            epCard.style.cssText = 'background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:0.75rem; display:flex; flex-direction:column; gap:0.5rem;';
                            epCard.innerHTML = `
                                        <div style="color:#fff; font-weight:600; font-size:0.9rem;">${name}</div>
                                        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                                            <button class="btn" style="padding:.3rem .6rem; border:none; border-radius:6px; background:linear-gradient(135deg,#10b981,#059669); color:#fff; cursor:pointer; font-size:0.85rem;" data-action="play" data-url="${url}" data-name="${name.replace(/"/g, '&quot;')}">
                                                <i class="fas fa-play"></i> Play
                                            </button>
                                            <button class="btn" style="padding:.3rem .6rem; border:none; border-radius:6px; background:linear-gradient(135deg,#3b82f6,#2563eb); color:#fff; cursor:pointer; font-size:0.85rem;" data-action="open" data-url="${url}">
                                                <i class="fas fa-external-link-alt"></i>
                                            </button>
                                            <button class="btn" style="padding:.3rem .6rem; border:none; border-radius:6px; background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:0.85rem;" data-action="copy" data-url="${url}">
                                                <i class="fas fa-copy"></i>
                                            </button>
                                        </div>
                                    `;
                            episodesGrid.appendChild(epCard);
                        });

                        // Wire episode buttons
                        episodesGrid.querySelectorAll('[data-action="play"]').forEach(b => b.addEventListener('click', (e) => {
                            const url = e.currentTarget.getAttribute('data-url');
                            const name = e.currentTarget.getAttribute('data-name');
                            if (!url) { showNotification('No stream URL found', 'error'); return; }
                            showXtreamPlayer(name, url);
                        }));
                        episodesGrid.querySelectorAll('[data-action="open"]').forEach(b => b.addEventListener('click', (e) => {
                            const url = e.currentTarget.getAttribute('data-url');
                            if (!url) { showNotification('No stream URL found', 'error'); return; }
                            if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url); else window.open(url, '_blank');
                        }));
                        episodesGrid.querySelectorAll('[data-action="copy"]').forEach(b => b.addEventListener('click', async (e) => {
                            const url = e.currentTarget.getAttribute('data-url');
                            try { await navigator.clipboard.writeText(url); showNotification('Stream URL copied', 'success'); } catch { showNotification('Copy failed', 'error'); }
                        }));
                    }
                    episodesContainer.style.display = '';
                    toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Hide Episodes';
                } else {
                    episodesContainer.style.display = 'none';
                    toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Show Episodes';
                }
            });
        });

    } catch (e) {
        console.error('[XTREAM] Series info error:', e);
        showNotification('Failed to load episodes: ' + (e?.message || 'Unknown'), 'error');
    }
}

async function xtreamRenderCurrentTab() {
    xtreamPopulateCategories();
    const select = document.getElementById('xtream-category-select');
    const catId = select ? select.value : '';
    const empty = document.getElementById('xtream-empty');
    if (empty) { empty.style.display = ''; empty.textContent = 'Loading...'; }
    await xtreamLoadStreamsForCurrentTab(catId);
    xtreamRenderGrid();
}

function bindXtreamUi() {
    const openBtn = document.getElementById('iptv-custom-btn');
    if (openBtn) openBtn.addEventListener('click', iptvActionButtonClick);

    const closeLogin = document.getElementById('xtream-login-close');
    const cancelLogin = document.getElementById('xtream-login-cancel');
    const submitLogin = document.getElementById('xtream-login-submit');
    if (closeLogin) closeLogin.addEventListener('click', hideXtreamLoginModal);
    if (cancelLogin) cancelLogin.addEventListener('click', hideXtreamLoginModal);
    if (submitLogin) submitLogin.addEventListener('click', xtreamLogin);

    // Setup infinite scroll for content
    const contentContainer = document.getElementById('xtream-inline-content');
    if (contentContainer) {
        contentContainer.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = contentContainer;
            // Load more when user scrolls to bottom (with 200px threshold)
            if (scrollTop + clientHeight >= scrollHeight - 200) {
                const search = (document.getElementById('xtream-search')?.value || '').toLowerCase().trim();
                let items = xtreamState.lastStreams || [];
                if (search) {
                    items = items.filter(it => ((it.name || it.title || '').toLowerCase().includes(search)));
                }
                // Only load more if there are more items to show
                if (xtreamState.displayedIndex < items.length) {
                    xtreamRenderGrid(true); // append mode
                }
            }
        });
    }

    // No inline close button; switching is handled by the header action button

    const catSel = document.getElementById('xtream-category-select');
    if (catSel) catSel.addEventListener('change', () => xtreamRenderCurrentTab());

    const search = document.getElementById('xtream-search');
    if (search) search.addEventListener('input', () => {
        // Reset pagination on search
        xtreamState.displayedIndex = 0;
        xtreamRenderGrid(false);
    });

    // Tab buttons
    document.querySelectorAll('.xtream-tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.xtream-tab-btn').forEach(b => { b.style.background = 'transparent'; b.style.color = '#ddd'; });
            const b = e.currentTarget; b.style.background = '#1b1b1b'; b.style.color = '#fff';
            const nextTab = b.getAttribute('data-tab');
            if (xtreamState.mode === 'm3u' && nextTab !== 'live') {
                showNotification('This playlist only supports Live channels', 'info');
                // re-highlight Live
                const liveBtn = document.querySelector('.xtream-tab-btn[data-tab="live"]');
                if (liveBtn) { liveBtn.style.background = '#1b1b1b'; liveBtn.style.color = '#fff'; }
                xtreamState.tab = 'live';
                return;
            }
            xtreamState.tab = nextTab;
            await xtreamRenderCurrentTab();
        });
    });

    // Player controls
    const closePlayer = document.getElementById('xtream-player-close');
    if (closePlayer) closePlayer.addEventListener('click', hideXtreamPlayer);
    const modalOuter = document.getElementById('xtream-player-modal');
    if (modalOuter) modalOuter.addEventListener('click', (e) => { if (e.target === modalOuter) hideXtreamPlayer(); });

    // M3U submit
    const m3uBtn = document.getElementById('xtream-m3u-submit');
    const m3uInput = document.getElementById('xtream-m3u-url');
    if (m3uBtn) m3uBtn.addEventListener('click', async () => {
        const url = (m3uInput?.value || '').trim();
        if (!url) { showNotification('Please enter a playlist URL', 'warning'); return; }
        const status = document.getElementById('xtream-login-status');
        if (status) status.textContent = '';
        if (isDirectMediaUrl(url)) {
            // Treat as single stream
            try { clearIptvPage(); disableIptvIframe(); } catch (_) { }
            hideXtreamLoginModal();
            xtreamState.active = true; xtreamState.mode = 'direct';
            updateIptvActionButton();
            showXtreamPlayer('Custom Stream', url);
        } else {
            await loadM3UFromUrl(url);
        }
    });
    if (m3uInput) m3uInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const url = (m3uInput?.value || '').trim();
            if (!url) { showNotification('Please enter a playlist URL', 'warning'); return; }
            if (isDirectMediaUrl(url)) {
                try { clearIptvPage(); disableIptvIframe(); } catch (_) { }
                hideXtreamLoginModal();
                xtreamState.active = true; xtreamState.mode = 'direct';
                updateIptvActionButton();
                showXtreamPlayer('Custom Stream', url);
            } else {
                await loadM3UFromUrl(url);
            }
        }
    });

    // Recommended M3U presets
    const presetButtons = document.querySelectorAll('#xtream-m3u-recommended .m3u-preset');
    presetButtons.forEach(btn => btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-url');
        const input = document.getElementById('xtream-m3u-url');
        if (input) input.value = url;
        if (url) {
            await loadM3UFromUrl(url);
        }
    }));
}

// Games Downloader page functions
function showGamesDownloaderPage() {
    window.location.hash = '#/games-downloader';
}

async function loadGameCategories() {
    try {
        console.log('[GAMES] Loading categories...');
        const categorySelect = document.getElementById('games-category-select');

        if (!categorySelect) {
            console.error('[GAMES] Category select element not found');
            return;
        }

        // Hardcoded categories list
        const categories = [
            "Action",
            "Adventure",
            "Anime",
            "Building",
            "First-person Shooter Games",
            "Horror",
            "Indie",
            "Multiplayer",
            "Nudity",
            "Open World",
            "Racing",
            "Role-playing game",
            "Sci-fi",
            "Shooters",
            "Simulation",
            "Sports",
            "Strategy",
            "Survival",
            "Uncategorized",
            "Virtual Reality"
        ];

        // Populate dropdown
        categorySelect.innerHTML = '<option value="" style="background: var(--bg-secondary); color: var(--secondary); padding: 0.5rem; font-weight: 500;">Select a category...</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            option.style.cssText = 'background: var(--card-bg); color: var(--light); padding: 0.5rem; font-weight: 500;';
            categorySelect.appendChild(option);
        });

        console.log('[GAMES] Categories populated in dropdown:', categories.length);
    } catch (error) {
        console.error('[GAMES] Failed to load categories:', error);
    }
}

async function browseByCategory(category) {
    const statusEl = document.getElementById('games-search-status');
    const resultsSection = document.getElementById('games-results-section');
    const emptyState = document.getElementById('games-empty-state');
    const resultsGrid = document.getElementById('games-results-grid');
    const resultsCount = document.getElementById('games-results-count');

    try {
        statusEl.textContent = `Loading ${category} games...`;
        statusEl.style.color = '#8b5cf6';
        emptyState.style.display = 'none';

        const response = await fetch(`http://localhost:6987/api/games/category/${encodeURIComponent(category)}`);
        if (!response.ok) throw new Error('Failed to load category');

        const data = await response.json();

        if (!data.games || data.games.length === 0) {
            statusEl.textContent = `No games found in ${category}`;
            statusEl.style.color = '#ef4444';
            emptyState.style.display = '';
            return;
        }

        // Store games and display first 20
        window.allGames = data.games;
        window.currentGameIndex = 0;
        window.gamesPerLoad = 20;

        resultsGrid.innerHTML = '';
        resultsSection.style.display = '';
        loadMoreGames();

    } catch (error) {
        console.error('Browse by category error:', error);
        statusEl.style.color = '#ef4444';
        emptyState.style.display = '';
    }
}

async function searchGames(query) {
    const statusEl = document.getElementById('games-search-status');
    const resultsSection = document.getElementById('games-results-section');
    const emptyState = document.getElementById('games-empty-state');
    const resultsGrid = document.getElementById('games-results-grid');
    const resultsCount = document.getElementById('games-results-count');

    if (!query || !query.trim()) {
        statusEl.textContent = 'Please enter a game name';
        statusEl.style.color = '#ef4444';
        return;
    }

    try {
        statusEl.textContent = 'Searching...';
        statusEl.style.color = '#8b5cf6';
        resultsSection.style.display = 'none';
        emptyState.style.display = 'none';

        const response = await fetch(`http://localhost:6987/api/games/search/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();

        if (!data.games || data.games.length === 0) {
            statusEl.textContent = 'No games found';
            statusEl.style.color = '#ef4444';
            emptyState.style.display = '';
            return;
        }

        // Display results
        statusEl.textContent = `Found ${data.count} game${data.count !== 1 ? 's' : ''}`;
        statusEl.style.color = '#10b981';
        resultsCount.textContent = `${data.count} game${data.count !== 1 ? 's' : ''}`;

        resultsGrid.innerHTML = '';
        data.games.forEach(game => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.style.cursor = 'default';

            // Handle new API structure - download_links is an object with arrays
            let downloadLinksHtml = '';
            if (game.download_links && typeof game.download_links === 'object') {
                const links = [];

                // Iterate through all link types (1fichier, buzzheavier, megadb, etc.)
                Object.keys(game.download_links).forEach(linkType => {
                    const urls = game.download_links[linkType];
                    if (Array.isArray(urls)) {
                        urls.forEach((url, index) => {
                            // Add protocol if missing
                            const fullUrl = url.startsWith('//') ? 'https:' + url : url;
                            const displayName = linkType.charAt(0).toUpperCase() + linkType.slice(1) + (urls.length > 1 ? ` ${index + 1}` : '');
                            links.push({ name: displayName, url: fullUrl });
                        });
                    } else if (typeof urls === 'string') {
                        const fullUrl = urls.startsWith('//') ? 'https:' + urls : urls;
                        const displayName = linkType.charAt(0).toUpperCase() + linkType.slice(1);
                        links.push({ name: displayName, url: fullUrl });
                    }
                });

                if (links.length > 0) {
                    downloadLinksHtml = links.map(link => `
                                <button class="game-download-link" data-url="${link.url}" style="padding: 0.4rem 0.8rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border: none; border-radius: 6px; color: white; font-size: 0.85rem; cursor: pointer; margin: 0.2rem; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                    <i class="fas fa-download"></i> ${link.name}
                                </button>
                            `).join('');
                }
            }

            if (!downloadLinksHtml) {
                downloadLinksHtml = '<span style="color: var(--secondary); font-size: 0.85rem;">No download links available</span>';
            }

            // Get image URL
            const imageUrl = game.imgID
                ? `http://localhost:6987/api/games/image/${game.imgID}`
                : 'https://via.placeholder.com/300x400?text=No+Image';

            // Use game.game or game.name as title
            const gameTitle = game.game || game.name || 'Unknown Game';

            // Format categories
            const categories = Array.isArray(game.category)
                ? game.category.join(', ')
                : (game.category || 'N/A');

            card.innerHTML = `
                        <div class="music-cover">
                            <img loading="lazy" src="${imageUrl}" alt="${gameTitle}" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
                        </div>
                        <div class="music-info">
                            <div class="music-title">${gameTitle}</div>
                            <div class="music-artist" style="color: #8b5cf6;">${categories}</div>
                            ${game.size ? `<div style="color: var(--secondary); font-size: 0.85rem; margin: 0.3rem 0;"><i class="fas fa-hdd"></i> Size: ${game.size}</div>` : ''}
                            ${game.version ? `<div style="color: var(--secondary); font-size: 0.85rem; margin: 0.3rem 0;"><i class="fas fa-tag"></i> Version: ${game.version}</div>` : ''}
                            ${game.description ? `<div style="color: var(--secondary); font-size: 0.85rem; margin: 0.5rem 0; line-height: 1.4;">${game.description.substring(0, 150)}${game.description.length > 150 ? '...' : ''}</div>` : ''}
                            <div class="music-actions" style="flex-wrap: wrap; margin-top: 0.5rem;">
                                ${downloadLinksHtml}
                            </div>
                        </div>
                    `;
            resultsGrid.appendChild(card);
        });

        // Add click handlers to download links
        resultsGrid.querySelectorAll('.game-download-link').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const url = e.currentTarget.getAttribute('data-url');
                if (url && window.electronAPI?.openExternal) {
                    await window.electronAPI.openExternal(url);
                    showNotification('Opening download link in browser...', 'info');
                }
            });
        });

        resultsSection.style.display = '';
        emptyState.style.display = 'none';

    } catch (error) {
        console.error('Games search error:', error);
        statusEl.textContent = 'Search failed. Please try again.';
        statusEl.style.color = '#ef4444';
        emptyState.style.display = '';
    }
}

async function browseAllGames() {
    const statusEl = document.getElementById('games-search-status');
    const resultsSection = document.getElementById('games-results-section');
    const emptyState = document.getElementById('games-empty-state');
    const resultsGrid = document.getElementById('games-results-grid');
    const resultsCount = document.getElementById('games-results-count');

    try {
        statusEl.textContent = 'Loading games...';
        statusEl.style.color = '#8b5cf6';
        emptyState.style.display = 'none';

        const response = await fetch('http://localhost:6987/api/games/all');
        if (!response.ok) throw new Error('Failed to load games');

        const data = await response.json();

        if (!data.games || data.games.length === 0) {
            statusEl.textContent = 'No games available';
            statusEl.style.color = '#ef4444';
            emptyState.style.display = '';
            return;
        }

        // Store all games globally and display first 20
        window.allGames = data.games;
        window.currentGameIndex = 0;
        window.gamesPerLoad = 20;

        resultsGrid.innerHTML = '';
        resultsSection.style.display = '';
        loadMoreGames();

    } catch (error) {
        console.error('Browse all games error:', error);

        statusEl.style.color = '#ef4444';
        emptyState.style.display = '';
    }
}

function loadMoreGames() {
    const statusEl = document.getElementById('games-search-status');
    const resultsSection = document.getElementById('games-results-section');
    const resultsGrid = document.getElementById('games-results-grid');
    const resultsCount = document.getElementById('games-results-count');

    if (!window.allGames || window.allGames.length === 0) return;

    const startIndex = window.currentGameIndex;
    const endIndex = Math.min(startIndex + window.gamesPerLoad, window.allGames.length);
    const gamesToLoad = window.allGames.slice(startIndex, endIndex);

    // Display status
    statusEl.textContent = `Showing ${endIndex} of ${window.allGames.length} games`;
    statusEl.style.color = '#10b981';
    resultsCount.textContent = `${endIndex} / ${window.allGames.length} games`;

    gamesToLoad.forEach(game => {
        const card = document.createElement('div');
        card.className = 'music-card';
        card.style.cursor = 'default';

        // Handle new API structure - download_links is an object with arrays
        let downloadLinksHtml = '';
        if (game.download_links && typeof game.download_links === 'object') {
            const links = [];

            // Iterate through all link types (1fichier, buzzheavier, megadb, etc.)
            Object.keys(game.download_links).forEach(linkType => {
                const urls = game.download_links[linkType];
                if (Array.isArray(urls)) {
                    urls.forEach((url, index) => {
                        // Add protocol if missing
                        const fullUrl = url.startsWith('//') ? 'https:' + url : url;
                        const displayName = linkType.charAt(0).toUpperCase() + linkType.slice(1) + (urls.length > 1 ? ` ${index + 1}` : '');
                        links.push({ name: displayName, url: fullUrl });
                    });
                } else if (typeof urls === 'string') {
                    const fullUrl = urls.startsWith('//') ? 'https:' + urls : urls;
                    const displayName = linkType.charAt(0).toUpperCase() + linkType.slice(1);
                    links.push({ name: displayName, url: fullUrl });
                }
            });

            if (links.length > 0) {
                downloadLinksHtml = links.map(link => `
                            <button class="game-download-link" data-url="${link.url}" style="padding: 0.4rem 0.8rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border: none; border-radius: 6px; color: white; font-size: 0.85rem; cursor: pointer; margin: 0.2rem; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                <i class="fas fa-download"></i> ${link.name}
                            </button>
                        `).join('');
            }
        }

        if (!downloadLinksHtml) {
            downloadLinksHtml = '<span style="color: var(--secondary); font-size: 0.85rem;">No download links available</span>';
        }

        // Get image URL
        const imageUrl = game.imgID
            ? `http://localhost:6987/api/games/image/${game.imgID}`
            : 'https://via.placeholder.com/300x400?text=No+Image';

        // Use game.game or game.name as title
        const gameTitle = game.game || game.name || 'Unknown Game';

        // Format categories
        const categories = Array.isArray(game.category)
            ? game.category.join(', ')
            : (game.category || 'N/A');

        card.innerHTML = `
                    <div class="music-cover">
                        <img loading="lazy" src="${imageUrl}" alt="${gameTitle}" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x400?text=${encodeURIComponent(gameTitle)}'">
                    </div>
                    <div class="music-info">
                        <div class="music-title">${gameTitle}</div>
                        <div class="music-artist" style="color: #8b5cf6;">${categories}</div>
                        ${game.size ? `<div style="color: var(--secondary); font-size: 0.85rem; margin: 0.3rem 0;"><i class="fas fa-hdd"></i> Size: ${game.size}</div>` : ''}
                        ${game.version ? `<div style="color: var(--secondary); font-size: 0.85rem; margin: 0.3rem 0;"><i class="fas fa-tag"></i> Version: ${game.version}</div>` : ''}
                        ${game.description ? `<div style="color: var(--secondary); font-size: 0.85rem; margin: 0.5rem 0; line-height: 1.4;">${game.description.substring(0, 150)}${game.description.length > 150 ? '...' : ''}</div>` : ''}
                        <div class="music-actions" style="flex-wrap: wrap; margin-top: 0.5rem;">
                            ${downloadLinksHtml}
                        </div>
                    </div>
                `;
        resultsGrid.appendChild(card);
    });

    // Add click handlers to download links
    resultsGrid.querySelectorAll('.game-download-link').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            if (url && window.electronAPI?.openExternal) {
                await window.electronAPI.openExternal(url);
                showNotification('Opening download link in browser...', 'info');
            }
        });
    });

    window.currentGameIndex = endIndex;

    // Show/hide Load More button
    let loadMoreBtn = document.getElementById('games-load-more-btn');
    if (!loadMoreBtn) {
        loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'games-load-more-btn';
        loadMoreBtn.innerHTML = '<i class="fas fa-arrow-down"></i> Load More Games';
        loadMoreBtn.style.cssText = 'display: block; margin: 2rem auto; padding: 0.75rem 2rem; background: linear-gradient(135deg, #f97316, #ea580c); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); font-size: 1rem;';
        loadMoreBtn.onmouseover = () => loadMoreBtn.style.transform = 'scale(1.05)';
        loadMoreBtn.onmouseout = () => loadMoreBtn.style.transform = 'scale(1)';
        loadMoreBtn.onclick = loadMoreGames;
        resultsGrid.parentElement.appendChild(loadMoreBtn);
    }

    if (window.currentGameIndex >= window.allGames.length) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'block';
    }

    resultsSection.style.display = '';
    emptyState.style.display = 'none';
}

// Initialize Games Downloader search + bind Xtream UI
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Enable performance mode by default (can be toggled later if needed)
        const pref = localStorage.getItem('perfMode');
        const enabled = pref == null ? true : (pref === 'true');
        if (enabled) document.body.classList.add('perf-mode');
    } catch (_) { }

    // Sidebar toggle functionality
    const sidebar = document.getElementById('appSidebar');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

    // Load sidebar state from localStorage
    const sidebarHidden = localStorage.getItem('sidebarHidden') === 'true';
    if (sidebarHidden && sidebar) {
        sidebar.classList.add('sidebar-hidden');
    }

    // Close button handler
    if (sidebarCloseBtn && sidebar) {
        sidebarCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.add('sidebar-hidden');
            localStorage.setItem('sidebarHidden', 'true');
        });
    }

    // Toggle button handler
    if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.remove('sidebar-hidden');
            localStorage.setItem('sidebarHidden', 'false');
        });
    }

    const searchInput = document.getElementById('games-search-input');
    const searchBtn = document.getElementById('games-search-btn');
    const browseAllBtn = document.getElementById('games-browse-all-btn');
    const categorySelect = document.getElementById('games-category-select');
    const categoryBtn = document.getElementById('games-category-btn');

    if (searchInput && searchBtn) {
        searchBtn.addEventListener('click', () => {
            searchGames(searchInput.value);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchGames(searchInput.value);
            }
        });
    }

    if (browseAllBtn) {
        browseAllBtn.addEventListener('click', () => {
            browseAllGames();
        });
    }

    if (categorySelect && categoryBtn) {
        categoryBtn.addEventListener('click', () => {
            const selectedCategory = categorySelect.value;
            if (selectedCategory) {
                browseByCategory(selectedCategory);
            }
        });

        // Also trigger on dropdown change
        categorySelect.addEventListener('change', (e) => {
            const selectedCategory = e.target.value;
            if (selectedCategory) {
                browseByCategory(selectedCategory);
            }
        });
    }

    // Bind Xtream UI after DOM ready and set initial button label, then auto-restore last used mode
    try { bindXtreamUi(); updateIptvActionButton(); } catch (e) { console.warn('[XTREAM] bind failed', e); }
    iptvAutoRestore();
});


// MiniGames page functions
function showMiniGamesPage() {
    window.location.hash = '#/minigames';
}

function reloadMiniGamesPage() {
    const miniGamesIframe = document.getElementById('minigames-iframe');
    if (miniGamesIframe) {
        // Reload the iframe
        miniGamesIframe.src = 'about:blank';
        setTimeout(() => {
            miniGamesIframe.src = 'https://playtorriogames.pages.dev/';
            // Auto-scroll the MiniGames page to show the iframe
            setTimeout(() => {
                const miniGamesPageEl = document.getElementById('minigames-page');
                if (miniGamesPageEl) {
                    miniGamesIframe.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    console.log('[MINIGAMES] Auto-scrolled MiniGames page to show iframe');
                }
            }, 50);
        }, 100);
        console.log('[MINIGAMES] Page reloaded fresh');
    }
}

function clearMiniGamesPage() {
    const miniGamesIframe = document.getElementById('minigames-iframe');
    if (miniGamesIframe) {
        // Clear MiniGames iframe
        miniGamesIframe.src = 'about:blank';
        console.log('[MINIGAMES] Page cleared');
    }
}

function showBooksPage() {
    window.location.hash = '#/books';
}

function showMusicPage() {
    window.location.hash = '#/music';
}

function showAudioBooksPage() {
    window.location.hash = '#/audiobooks';
    loadInitialAudioBooks();
}

let allAudioBooks = [];
let isAudioBookSearchMode = false;
let currentAudioBookChapters = [];
let currentAudioBookChapterIndex = 0;
let currentAudioBookTitle = '';
let currentAudioBookPage = 1;
let isLoadingMoreAudioBooks = false;

async function loadInitialAudioBooks() {
    try {
        const booksView = document.getElementById('audiobooks-books-view');
        const chaptersView = document.getElementById('audiobooks-chapters-view');
        const resultsContainer = document.getElementById('audiobookSearchResults');
        const loadingEl = document.getElementById('audiobookLoading');
        const clearBtn = document.getElementById('clearAudioBookSearchBtn');
        const loadMoreContainer = document.getElementById('audiobookLoadMoreContainer');

        // Reset page counter
        currentAudioBookPage = 1;
        isAudioBookSearchMode = false;

        // Show books view, hide chapters view
        booksView.style.display = 'block';
        chaptersView.style.display = 'none';
        clearBtn.style.display = 'none';

        resultsContainer.innerHTML = '';
        loadingEl.style.display = 'block';

        const response = await fetch('/api/audiobooks/all');
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            allAudioBooks = data.data;
            // Filter out specific audiobooks for home page display
            const filteredBooks = data.data.filter(book => {
                const title = book.title.toLowerCase();
                return !title.includes('1001 nights') && !title.includes('the fox and the wolf');
            });
            displayAudioBooks(filteredBooks);
            loadMoreContainer.style.display = 'block';
        } else {
            resultsContainer.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
                            <h3>No AudioBooks Found</h3>
                            <p>Unable to load audiobooks at this time</p>
                        </div>
                    `;
            loadMoreContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading audiobooks:', error);
        const resultsContainer = document.getElementById('audiobookSearchResults');
        resultsContainer.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
                        <h3>Error Loading AudioBooks</h3>
                        <p>${error.message}</p>
                    </div>
                `;
        document.getElementById('audiobookLoadMoreContainer').style.display = 'none';
    } finally {
        document.getElementById('audiobookLoading').style.display = 'none';
    }
}

async function loadMoreAudioBooks() {
    if (isLoadingMoreAudioBooks || isAudioBookSearchMode) return;

    try {
        isLoadingMoreAudioBooks = true;
        const loadMoreBtn = document.getElementById('audiobookLoadMoreBtn');
        const originalText = loadMoreBtn.innerHTML;
        loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        loadMoreBtn.disabled = true;

        currentAudioBookPage++;
        const response = await fetch(`/api/audiobooks/more/${currentAudioBookPage}`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            allAudioBooks = [...allAudioBooks, ...data.data];
            // Filter out specific audiobooks from display
            const filteredBooks = allAudioBooks.filter(book => {
                const title = book.title.toLowerCase();
                return !title.includes('1001 nights') && !title.includes('the fox and the wolf');
            });
            displayAudioBooks(filteredBooks);
            loadMoreBtn.innerHTML = originalText;
            loadMoreBtn.disabled = false;
        } else {
            loadMoreBtn.innerHTML = '<i class="fas fa-check-circle"></i> No More Books';
            setTimeout(() => {
                document.getElementById('audiobookLoadMoreContainer').style.display = 'none';
            }, 2000);
        }
    } catch (error) {
        console.error('Error loading more audiobooks:', error);
        currentAudioBookPage--; // Revert page increment
        const loadMoreBtn = document.getElementById('audiobookLoadMoreBtn');
        loadMoreBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Load More';
        loadMoreBtn.disabled = false;
        showNotification('Error loading more books', 'error');
    } finally {
        isLoadingMoreAudioBooks = false;
    }
}

async function searchAudioBooks(query) {
    try {
        const resultsContainer = document.getElementById('audiobookSearchResults');
        const loadingEl = document.getElementById('audiobookLoading');
        const clearBtn = document.getElementById('clearAudioBookSearchBtn');
        const loadMoreContainer = document.getElementById('audiobookLoadMoreContainer');

        resultsContainer.innerHTML = '';
        loadingEl.style.display = 'block';

        const response = await fetch(`/api/audiobooks/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            isAudioBookSearchMode = true;
            clearBtn.style.display = 'inline-block';
            loadMoreContainer.style.display = 'none';
            displayAudioBooks(data.data);
        } else {
            clearBtn.style.display = 'inline-block';
            loadMoreContainer.style.display = 'none';
            resultsContainer.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-search" style="font-size: 3rem; color: #8b5cf6; margin-bottom: 1rem;"></i>
                            <h3>No Results Found</h3>
                            <p>Try searching for something else</p>
                        </div>
                    `;
        }
    } catch (error) {
        console.error('Error searching audiobooks:', error);
        const resultsContainer = document.getElementById('audiobookSearchResults');
        resultsContainer.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
                        <h3>Search Error</h3>
                        <p>${error.message}</p>
                    </div>
                `;
        document.getElementById('audiobookLoadMoreContainer').style.display = 'none';
    } finally {
        document.getElementById('audiobookLoading').style.display = 'none';
    }
}

function displayAudioBooks(audiobooks) {
    const resultsContainer = document.getElementById('audiobookSearchResults');
    resultsContainer.innerHTML = '';

    audiobooks.forEach(book => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        bookCard.style.cursor = 'pointer';

        bookCard.innerHTML = `
                    <div class="book-cover-container">
                        <img src="${book.image || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22280%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-family=%22Arial%22 font-size=%2216%22%3ENo Image%3C/text%3E%3C/svg%3E'}" 
                             alt="${book.title}" 
                             class="book-cover"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22280%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-family=%22Arial%22 font-size=%2216%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                        <div class="playtorrio-logo">PlayTorrio</div>
                    </div>
                    <div class="book-info">
                        <h3 class="book-title">${book.title}</h3>
                    </div>
                `;

        bookCard.onclick = () => openAudioBookChapters(book);
        resultsContainer.appendChild(bookCard);
    });
}

async function openAudioBookChapters(book) {
    try {
        const booksView = document.getElementById('audiobooks-books-view');
        const chaptersView = document.getElementById('audiobooks-chapters-view');
        const chapterTitle = document.getElementById('audiobooksChapterBookTitle').querySelector('span');
        const chaptersList = document.getElementById('audiobooksChaptersList');
        const chapterLoading = document.getElementById('audiobooksChapterLoading');

        currentAudioBookTitle = book.title;
        chapterTitle.textContent = book.title;

        booksView.style.display = 'none';
        chaptersView.style.display = 'block';
        chapterLoading.style.display = 'block';
        chaptersList.innerHTML = '';

        const response = await fetch(`/api/audiobooks/chapters/${book.post_name}`);
        const data = await response.json();

        if (data.success && data.data) {
            currentAudioBookChapters = data.data;
            renderAudioBookChapters();
        } else {
            chaptersList.innerHTML = `
                        <div style="text-align: center; padding: 2rem; color: #666;">
                            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
                            <h3>Failed to Load Chapters</h3>
                            <p>Unable to load chapters for this audiobook</p>
                        </div>
                    `;
        }
    } catch (error) {
        console.error('Error loading chapters:', error);
        const chaptersList = document.getElementById('audiobooksChaptersList');
        chaptersList.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #666;">
                        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
                        <h3>Error Loading Chapters</h3>
                        <p>${error.message}</p>
                    </div>
                `;
    } finally {
        document.getElementById('audiobooksChapterLoading').style.display = 'none';
    }
}

function renderAudioBookChapters() {
    const chaptersList = document.getElementById('audiobooksChaptersList');
    chaptersList.innerHTML = '';

    currentAudioBookChapters.forEach((chapter, index) => {
        const chapterItem = document.createElement('div');
        chapterItem.className = 'book-card';
        chapterItem.style.cursor = 'pointer';
        chapterItem.style.padding = '15px 20px';
        chapterItem.style.display = 'flex';
        chapterItem.style.justifyContent = 'space-between';
        chapterItem.style.alignItems = 'center';
        chapterItem.style.gap = '10px';
        chapterItem.setAttribute('data-chapter-index', index);

        const chapterInfo = document.createElement('div');
        chapterInfo.style.flex = '1';
        chapterInfo.style.display = 'flex';
        chapterInfo.style.justifyContent = 'space-between';
        chapterInfo.style.alignItems = 'center';
        chapterInfo.style.minWidth = '0';
        chapterInfo.innerHTML = `
                    <span style="font-weight: 600; font-size: 15px;">${chapter.track}. ${chapter.name}</span>
                    <span style="color: #666; font-size: 13px;">${chapter.duration}</span>
                `;
        chapterInfo.onclick = () => playAudioBookChapter(index);

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'action-btn';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        downloadBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            downloadAudioBookChapter(chapter, index);
        };

        chapterItem.appendChild(chapterInfo);
        chapterItem.appendChild(downloadBtn);
        chaptersList.appendChild(chapterItem);
    });
}

async function playAudioBookChapter(index) {
    try {
        currentAudioBookChapterIndex = index;
        const chapter = currentAudioBookChapters[index];

        // Skip welcome track
        if (chapter.chapter_id === "0" || chapter.post_id === "0") {
            if (index < currentAudioBookChapters.length - 1) {
                playAudioBookChapter(index + 1);
            }
            return;
        }

        const playerEl = document.getElementById('audiobooksPlayer');
        const audioEl = document.getElementById('audiobooksAudioElement');
        const titleEl = document.getElementById('audiobooksPlayerTitle');
        const chapterEl = document.getElementById('audiobooksPlayerChapter');
        const playPauseBtn = document.getElementById('audiobooksPlayPauseBtn');

        updateAudioBookChapterActive(index);
        titleEl.textContent = currentAudioBookTitle;
        chapterEl.textContent = chapter.name;
        playerEl.style.display = 'block';

        const response = await fetch('/api/audiobooks/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chapterId: parseInt(chapter.chapter_id),
                serverType: 1
            })
        });

        const data = await response.json();

        if (data.success && data.data.link_mp3) {
            audioEl.src = data.data.link_mp3;
            audioEl.play();
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            showNotification('Failed to get audio stream', 'error');
        }
    } catch (error) {
        console.error('Error playing chapter:', error);
        showNotification('Error playing chapter: ' + error.message, 'error');
    }
}

async function downloadAudioBookChapter(chapter, index) {
    try {
        if (chapter.chapter_id === "0" || chapter.post_id === "0") {
            showNotification('Cannot download welcome track', 'error');
            return;
        }

        const response = await fetch('/api/audiobooks/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chapterId: parseInt(chapter.chapter_id),
                serverType: 1
            })
        });

        const data = await response.json();

        if (data.success && data.data.link_mp3) {
            // Open download link in default browser
            if (window.electronAPI && window.electronAPI.openExternal) {
                await window.electronAPI.openExternal(data.data.link_mp3);
                showNotification('Opening download in browser', 'success');
            } else {
                // Fallback for non-Electron environments
                window.open(data.data.link_mp3, '_blank');
                showNotification('Download opened', 'success');
            }
        } else {
            showNotification('Failed to get download link', 'error');
        }
    } catch (error) {
        console.error('Error downloading chapter:', error);
        showNotification('Error downloading: ' + error.message, 'error');
    }
}

function updateAudioBookChapterActive(index) {
    const items = document.querySelectorAll('#audiobooksChaptersList .book-card');
    items.forEach((item, i) => {
        if (i === index) {
            item.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
            item.style.color = 'white';
            item.querySelector('span:last-child').style.color = 'rgba(255,255,255,0.9)';
        } else {
            item.style.background = '';
            item.style.color = '';
            item.querySelector('span:last-child').style.color = '#666';
        }
    });
}

function formatAudioTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showBookTorrioPage() {
    window.location.hash = '#/booktorrio';
}

function showAnimePage() {
    window.location.hash = '#/anime';
}

function showMangaPage() {
    window.location.hash = '#/manga';
}

function showComicsPage() {
    window.location.hash = '#/comics';
}

function showDownloaderPage() {
    window.location.hash = '#/downloader';
}

// Live TV Functionality
let liveTvMatches = [];
let liveTvCategories = [];

async function initLiveTv() {
    const categorySelect = document.getElementById('livetv-category-select');
    const grid = document.getElementById('livetv-grid');
    const empty = document.getElementById('livetv-empty');

    if (!categorySelect) return;

    try {
        // Show loading
        if (empty) {
            empty.style.display = '';
            empty.innerHTML = '<div class="livetv-loading"><i class="fas fa-spinner"></i><p>Loading sports...</p></div>';
        }
        if (grid) grid.innerHTML = '';

        // Fetch available sports from watchfooty.st
        console.log('[LiveTV] Fetching sports from API...');
        const sportsResponse = await fetch('https://watchfooty.st/api/v1/sports');

        if (!sportsResponse.ok) {
            throw new Error(`API returned ${sportsResponse.status}: ${sportsResponse.statusText}`);
        }

        const sportsData = await sportsResponse.json();
        console.log('[LiveTV] Received sports:', sportsData);

        if (!Array.isArray(sportsData) || sportsData.length === 0) {
            throw new Error('No sports data received from API');
        }

        // Store sports and populate dropdown
        liveTvCategories = sportsData.map(s => s.name);
        console.log('[LiveTV] Available categories:', liveTvCategories);

        categorySelect.innerHTML = '';
        sportsData.forEach(sport => {
            const option = document.createElement('option');
            option.value = sport.name;
            const icons = {
                'football': '⚽',
                'soccer': '⚽',
                'tennis': '🎾',
                'basketball': '🏀',
                'hockey': '🏒',
                'baseball': '⚾',
                'rugby': '🏉',
                'cricket': '🏏',
                'motorsport': '🏎️',
                'motor-sport': '🏎️',
                'golf': '⛳',
                'boxing': '🥊',
                'mma': '🥋',
                'ufc': '🥋',
                'fighting': '🥋',
                'other': '📺'
            };
            const icon = icons[sport.name.toLowerCase()] || '📺';
            option.textContent = `${icon} ${sport.displayName}`;
            categorySelect.appendChild(option);
        });

        console.log('[LiveTV] Populated dropdown with', sportsData.length, 'sports');
        console.log('[LiveTV] Sports list:', liveTvCategories);

        // Set default to football if available
        if (liveTvCategories.includes('football')) {
            categorySelect.value = 'football';
            console.log('[LiveTV] Default sport set to: football');
        } else if (liveTvCategories.length > 0) {
            categorySelect.value = liveTvCategories[0];
            console.log('[LiveTV] Default sport set to:', liveTvCategories[0]);
        }

        // Load matches for default category
        console.log('[LiveTV] Loading matches for:', categorySelect.value);
        await loadLiveTvMatches(categorySelect.value);
    } catch (error) {
        console.error('[LiveTV] Error during initialization:', error);
        if (empty) {
            empty.style.display = '';
            empty.innerHTML = `<i class="fas fa-exclamation-triangle" style="font-size: 3em; opacity: 0.3; color: #ef4444;"></i><p>Failed to load Live TV: ${error.message}</p><p style="font-size: 0.9em; opacity: 0.7;">Check console for details</p>`;
        }
    }
}

async function loadLiveTvMatches(category) {
    const grid = document.getElementById('livetv-grid');
    const empty = document.getElementById('livetv-empty');
    const searchInput = document.getElementById('livetv-search-input');

    if (!grid || !empty) return;

    try {
        // Show loading
        empty.style.display = '';
        empty.innerHTML = '<div class="livetv-loading"><i class="fas fa-spinner"></i><p>Loading matches...</p></div>';
        grid.innerHTML = '';

        // Fetch matches for the selected sport
        console.log(`[LiveTV] Fetching matches for category: ${category}`);
        const response = await fetch(`https://watchfooty.st/api/v1/matches/${category}`);
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        liveTvMatches = await response.json();
        console.log(`[LiveTV] Received ${liveTvMatches.length} matches for ${category}`);

        // Get search query
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

        // Apply search filter if query exists
        let filtered = liveTvMatches;
        if (searchQuery) {
            filtered = filtered.filter(m => {
                const title = (m.title || '').toLowerCase();
                const league = (m.league || '').toLowerCase();
                const homeTeam = (m.teams?.home?.name || '').toLowerCase();
                const awayTeam = (m.teams?.away?.name || '').toLowerCase();
                return title.includes(searchQuery) || league.includes(searchQuery) ||
                    homeTeam.includes(searchQuery) || awayTeam.includes(searchQuery);
            });
            console.log(`[LiveTV] Filtered to ${filtered.length} matches matching "${searchQuery}"`);
        }

        // Sort matches: Live first, then upcoming, then finished
        // Status values: 'in' = live, 'pre' = upcoming, 'post' = finished
        filtered.sort((a, b) => {
            const statusPriority = { 'in': 0, 'pre': 1, 'post': 2 };
            const aPriority = statusPriority[a.status] ?? 3;
            const bPriority = statusPriority[b.status] ?? 3;
            if (aPriority !== bPriority) return aPriority - bPriority;
            // If same status, sort by timestamp (earlier first)
            return (a.timestamp || 0) - (b.timestamp || 0);
        });

        if (filtered.length === 0) {
            grid.innerHTML = '';
            empty.style.display = '';
            if (searchQuery) {
                empty.innerHTML = `<i class="fas fa-search" style="font-size: 3em; opacity: 0.3;"></i><p>No matches found for "${searchQuery}"</p>`;
            } else {
                empty.innerHTML = `<i class="fas fa-tv" style="font-size: 3em; opacity: 0.3;"></i><p>No matches available for ${category}</p>`;
            }
            console.log('[LiveTV] No matches to display');
            return;
        }

        empty.style.display = 'none';
        grid.innerHTML = '';

        // Count matches by status
        const liveMatchCount = filtered.filter(m => m.status === 'in').length;
        const upcomingMatchCount = filtered.filter(m => m.status === 'pre').length;
        const finishedMatchCount = filtered.filter(m => m.status === 'post').length;
        console.log(`[LiveTV] Match breakdown: ${liveMatchCount} live, ${upcomingMatchCount} upcoming, ${finishedMatchCount} finished`);
        console.log('[LiveTV] Rendering match grid...');

        // Count live matches and update the count display
        const liveCount = filtered.filter(m => m.status === 'in').length;
        const upcomingCount = filtered.filter(m => m.status === 'pre').length;

        // Update the match count display next to dropdown
        const countDisplay = document.getElementById('livetv-match-count');
        if (countDisplay && (liveCount > 0 || upcomingCount > 0)) {
            let countText = '';
            if (liveCount > 0) {
                countText += `<span style="display: inline-flex; align-items: center; gap: 0.4rem; color: #ef4444; font-weight: 600; letter-spacing: 0.5px;"><i class="fas fa-circle" style="font-size: 0.4rem; animation: blink 1s infinite;"></i>${liveCount} LIVE</span>`;
            }
            if (upcomingCount > 0) {
                if (countText) countText += '<span style="color: rgba(255,255,255,0.3); font-weight: 300;">•</span>';
                countText += `<span style="display: inline-flex; align-items: center; gap: 0.4rem; color: #60a5fa; font-weight: 500;"><i class="far fa-clock" style="font-size: 0.75rem;"></i>${upcomingCount} Upcoming</span>`;
            }
            countDisplay.innerHTML = countText;
            countDisplay.style.display = 'inline-flex';
        } else if (countDisplay) {
            countDisplay.style.display = 'none';
        }

        // Render match cards
        filtered.forEach(match => {
            const card = document.createElement('div');
            card.className = 'livetv-match-card';

            // Use watchfooty poster or fallback
            const posterUrl = match.poster ? `https://watchfooty.st${match.poster}` : '';
            const posterHTML = posterUrl
                ? `<img loading="lazy" src="${posterUrl}" alt="${match.title}" class="livetv-poster" onerror="this.parentElement.querySelector('.livetv-poster-placeholder').style.display='flex'; this.style.display='none';">
                           <div class="livetv-poster-placeholder" style="display:none;"><i class="fas fa-play-circle"></i></div>`
                : `<div class="livetv-poster-placeholder"><i class="fas fa-play-circle"></i></div>`;

            // Format match status and time
            const matchDate = new Date(match.date);
            const timeStr = matchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // Status badge with better colors
            let statusBadge = '';
            if (match.status === 'in') {
                // Live match - red pulsing badge
                const minute = match.currentMinute || 'LIVE';
                statusBadge = `<span style="background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; animation: pulse 2s infinite; box-shadow: 0 0 10px rgba(239,68,68,0.5);"><i class="fas fa-circle" style="font-size: 0.5rem; margin-right: 0.25rem; animation: blink 1s infinite;"></i>${minute}</span>`;
            } else if (match.status === 'pre') {
                // Upcoming match
                statusBadge = `<span style="background: rgba(59,130,246,0.2); color: #3b82f6; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(59,130,246,0.3);">UPCOMING</span>`;
            } else if (match.status === 'post') {
                // Finished match
                statusBadge = `<span style="background: rgba(107,114,128,0.2); color: #9ca3af; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">FINISHED</span>`;
            }

            const scoreBadge = (match.scores?.home !== undefined && match.scores?.away !== undefined)
                ? `<span style="background: rgba(16,185,129,0.2); color: #10b981; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; border: 1px solid rgba(16,185,129,0.3);">${match.scores.home} - ${match.scores.away}</span>`
                : '';

            card.innerHTML = `
                        ${posterHTML}
                        <div class="livetv-match-info">
                            <h4 class="livetv-match-title">${match.title}</h4>
                            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap;">
                                <span class="livetv-match-category">${match.league || match.sport}</span>
                                ${statusBadge}
                                ${scoreBadge}
                            </div>
                            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-top: 0.25rem;">
                                <i class="fas fa-clock"></i> ${timeStr}
                            </div>
                            <button class="livetv-watch-btn">
                                <i class="fas fa-play"></i> Watch Now (${match.streams?.length || 0} streams)
                            </button>
                        </div>
                    `;

            const watchBtn = card.querySelector('.livetv-watch-btn');
            watchBtn.addEventListener('click', () => openStreamsModal(match));

            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading matches:', error);
        grid.innerHTML = '';
        empty.style.display = '';
        empty.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 3em; opacity: 0.3; color: #ef4444;"></i><p>Failed to load matches. Please try again.</p>';
    }
}

async function openStreamsModal(match) {
    const modal = document.getElementById('livetv-streams-modal');
    const title = document.getElementById('livetv-streams-title');
    const list = document.getElementById('livetv-streams-list');

    if (!modal || !title || !list) return;

    title.textContent = match.title;
    list.innerHTML = '<div class="livetv-loading"><i class="fas fa-spinner"></i><p>Preparing streams...</p></div>';
    modal.style.display = 'flex';

    try {
        // Streams are already included in the match object from watchfooty.live API
        const allStreams = match.streams || [];

        if (allStreams.length === 0) {
            list.innerHTML = '<div class="livetv-empty"><p>No streams available for this match</p></div>';
            return;
        }

        // Render streams with embedded iframes
        list.innerHTML = '';
        allStreams.forEach((stream, index) => {
            const streamItem = document.createElement('div');
            streamItem.className = 'livetv-stream-item';

            const language = stream.language || 'Unknown';
            const quality = stream.quality || 'SD';
            const hdBadge = quality.toLowerCase().includes('hd') || quality === '1080p' || quality === '720p'
                ? '<span class="livetv-stream-badge hd">HD</span>'
                : '';
            const adsBadge = stream.ads ? '<span class="livetv-stream-badge ads" style="background: rgba(239,68,68,0.2); color: #ef4444;"><i class="fas fa-ad"></i> Ads</span>' : '';
            const nsfwBadge = stream.nsfw ? '<span class="livetv-stream-badge nsfw" style="background: rgba(168,85,247,0.2); color: #a855f7;">18+</span>' : '';

            streamItem.innerHTML = `
                        <div class="livetv-stream-info">
                            <div class="livetv-stream-source">
                                <i class="fas fa-broadcast-tower"></i> Stream ${index + 1}
                            </div>
                            <div class="livetv-stream-details">
                                ${hdBadge}
                                <span class="livetv-stream-badge quality">
                                    <i class="fas fa-video"></i> ${quality}
                                </span>
                                <span class="livetv-stream-badge language">
                                    <i class="fas fa-language"></i> ${language}
                                </span>
                                ${adsBadge}
                                ${nsfwBadge}
                            </div>
                        </div>
                        <div class="livetv-stream-actions">
                            <button class="livetv-play-stream-btn" data-stream-url="${stream.url}">
                                <i class="fas fa-play"></i> Play Stream
                            </button>
                            <button class="livetv-copy-link-btn">
                                <i class="fas fa-copy"></i> Copy Link
                            </button>
                        </div>
                    `;

            // Play stream button - embed in app
            const playBtn = streamItem.querySelector('.livetv-play-stream-btn');
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const streamUrl = stream.url;

                console.log('[LiveTV] Playing stream:', streamUrl);

                // Close streams modal
                modal.style.display = 'none';

                // Create fullscreen iframe viewer with back button
                const existingViewer = document.getElementById('livetv-stream-viewer');
                if (existingViewer) {
                    existingViewer.remove();
                }

                const viewer = document.createElement('div');
                viewer.id = 'livetv-stream-viewer';
                viewer.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; z-index: 99999; display: flex; flex-direction: column;';

                viewer.innerHTML = `
                            <div style="position: absolute; top: 1rem; left: 1rem; z-index: 100000;">
                                <button id="livetv-back-btn" style="
                                    background: linear-gradient(135deg, #ef4444, #dc2626);
                                    color: #fff;
                                    border: none;
                                    padding: 0.75rem 1.5rem;
                                    border-radius: 8px;
                                    font-weight: 700;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    gap: 0.5rem;
                                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                                    transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                                " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(239,68,68,0.6)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.5)';">
                                    <i class="fas fa-arrow-left"></i> Back
                                </button>
                            </div>
                            <iframe 
                                src="${streamUrl}" 
                                style="width: 100%; height: 100%; border: none;"
                                frameborder="0"
                                scrolling="no"
                                allowfullscreen="true"
                                webkitallowfullscreen="true"
                                mozallowfullscreen="true"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerpolicy="origin"
                            ></iframe>
                        `;

                document.body.appendChild(viewer);

                // Back button handler
                const backBtn = document.getElementById('livetv-back-btn');
                backBtn.addEventListener('click', () => {
                    viewer.remove();
                    console.log('[LiveTV] Stream viewer closed');
                });

                // ESC key to close
                const escHandler = (e) => {
                    if (e.key === 'Escape') {
                        viewer.remove();
                        document.removeEventListener('keydown', escHandler);
                        console.log('[LiveTV] Stream viewer closed via ESC');
                    }
                };
                document.addEventListener('keydown', escHandler);
            });

            const copyBtn = streamItem.querySelector('.livetv-copy-link-btn');
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(stream.url);
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    copyBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                        copyBtn.style.background = '';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });

            list.appendChild(streamItem);
        });
    } catch (error) {
        console.error('Error loading streams:', error);
        list.innerHTML = '<div class="livetv-empty"><p>Failed to load streams. Please try again.</p></div>';
    }
}



function setupEventListeners() {
    // Custom Title Bar Controls (REMOVED for mobile-only)
    // const minimizeBtn = document.getElementById('minimizeBtn');
    // const maximizeBtn = document.getElementById('maximizeBtn');
    // const closeBtn = document.getElementById('closeBtn');

    // Initialize Video.js player
    if (typeof videojs !== 'undefined') {
        try {
            window.vjsPlayer = videojs('customVideo', {
                controls: false,
                preload: 'metadata',
                fluid: false,
                fill: true
            });
            console.log('Video.js initialized');
        } catch (e) {
            console.warn('Video.js initialization failed:', e);
        }
    }

    // API Setup Modal - REMOVED (event listeners disabled)
    // saveFirstTimeApiKey button removed
    // useTorrentlessSetup button removed
    // videoTutorialFirst button removed

    // Donate modal removed

    // Discord Modal
    if (discordClose) {
        discordClose.addEventListener('click', hideDiscordModal);
    }
    if (discordJoinBtn) {
        discordJoinBtn.addEventListener('click', async () => {
            const url = 'https://discord.gg/bbkVHRHnRk';
            try {
                if (window.electronAPI?.openExternal) {
                    await window.electronAPI.openExternal(url);
                } else {
                    window.open(url, '_blank', 'noopener');
                }
                // Save to both file and localStorage for reliability
                localStorage.setItem('pt_discord_dismissed_v1', 'true');
                if (window.electronAPI?.setUserPref) {
                    await StorageService.set('discord_dismissed', 'true');
                }
                hideDiscordModal();
                showNotification('Opening Discord invite...', 'success');
            } catch (err) {
                console.error('Failed to open Discord:', err);
                showNotification('Failed to open Discord link', 'error');
            }
        });
    }
    if (discordDontShowBtn) {
        discordDontShowBtn.addEventListener('click', async () => {
            // Save to both file and localStorage for reliability
            localStorage.setItem('pt_discord_dismissed_v1', 'true');
            if (window.electronAPI?.setUserPref) {
                await StorageService.set('discord_dismissed', 'true');
            }
            hideDiscordModal();
            showNotification("We'll stop showing this.", 'success');
        });
    }

    // Update & What's New modals removed

    if (discordBtn) {
        discordBtn.addEventListener('click', async () => {
            const url = 'https://discord.gg/bbkVHRHnRk';
            try {
                if (window.electronAPI?.openExternal) {
                    await window.electronAPI.openExternal(url);
                } else {
                    window.open(url, '_blank', 'noopener');
                }
                showNotification('Opening Discord...', 'success');
            } catch (err) {
                console.error('Failed to open Discord:', err);
                showNotification('Failed to open Discord link', 'error');
            }
        });
    }
    // Donate button (persistent)
    const donateBtn = document.getElementById('donateBtn');
    if (donateBtn) {
        donateBtn.addEventListener('click', async () => {
            const url = 'https://ko-fi.com/ayman228x';
            try {
                if (window.electronAPI?.openExternal) {
                    await window.electronAPI.openExternal(url);
                } else {
                    window.open(url, '_blank', 'noopener');
                }
                showNotification('Opening Ko-fi...', 'success');
            } catch (err) {
                console.error('Failed to open Ko-fi:', err);
                showNotification('Failed to open Ko-fi link', 'error');
            }
        });
    }

    // Chromecast Device Modal
    const closeChromecastModal = document.getElementById('close-chromecast-modal');
    if (closeChromecastModal) {
        closeChromecastModal.addEventListener('click', () => {
            const modal = document.getElementById('chromecast-device-modal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
            }
        });
    }

    // Settings Modal
    clearCacheBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.clearCache();
        showNotification(result.message, result.success ? 'success' : 'error');
    });
    // Cache folder browse buttons (attach to ALL instances)
    if (window.electronAPI && window.electronAPI.selectCacheFolder) {
        const selectCacheBtns = document.querySelectorAll('#selectCacheBtn');
        selectCacheBtns.forEach(btn => btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const result = await window.electronAPI.selectCacheFolder();
                if (result.success && result.path) {
                    // Prefer the cacheLocation input in the same card/section as the clicked button
                    const scope = btn.closest('.settings-card-body, .api-input-group, .form-group') || document;
                    const scopedInput = scope.querySelector('#cacheLocation');
                    if (scopedInput) {
                        scopedInput.value = result.path;
                    } else {
                        // Fallback: update the visible cacheLocation input
                        const allInputs = document.querySelectorAll('#cacheLocation');
                        let updated = false;
                        for (const input of allInputs) {
                            if (input.offsetParent !== null) { input.value = result.path; updated = true; break; }
                        }
                        if (!updated && allInputs.length > 0) { allInputs[0].value = result.path; }
                    }
                }
            } catch (error) {
                console.error('Error selecting cache folder:', error);
                showNotification('Failed to select folder');
            }
        }));
    }
    // MPV install helpers removed
    settingsClose.addEventListener('click', hideSettingsModal);
    saveSettings.addEventListener('click', saveSettings_);
    cancelSettings.addEventListener('click', hideSettingsModal);

    // Settings page buttons
    const saveSettingsPage = document.getElementById('saveSettingsPage');
    const cancelSettingsPage = document.getElementById('cancelSettingsPage');
    if (saveSettingsPage) {
        saveSettingsPage.addEventListener('click', saveSettings_);
    }
    if (cancelSettingsPage) {
        cancelSettingsPage.addEventListener('click', () => {
            window.history.back();
        });
    }

    // Theme selector (attach to all instances - modal and settings page)
    const themeSelectors = document.querySelectorAll('#themeSelector');
    themeSelectors.forEach(themeSelector => {
        if (themeSelector) {
            themeSelector.addEventListener('change', (e) => {
                const selectedTheme = e.target.value;
                applyTheme(selectedTheme);
                showNotification(`Theme changed to ${e.target.options[e.target.selectedIndex].text}`, 'success');
            });
        }
    });

    const videoTutorialBtns = document.querySelectorAll('#videoTutorialBtn');
    videoTutorialBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = 'https://www.youtube.com/watch?v=3igLReZFFzg';
            if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(url);
        });
    });

    // Watch without Jackett toggle - attach to ALL instances
    const useTorrentlessToggles = document.querySelectorAll('#useTorrentlessToggle');
    useTorrentlessToggles.forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const enabled = !!e.target.checked;
            try {
                const res = await fetch(`${API_BASE_URL}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ useTorrentless: enabled })
                });
                if (res.ok) {
                    useTorrentless = enabled;
                    // Update all other toggles
                    useTorrentlessToggles.forEach(t => t.checked = enabled);
                    showNotification(enabled ? 'Watch without Jackett enabled.' : 'Watch without Jackett disabled.');
                } else {
                    e.target.checked = !enabled;
                    showNotification('Failed to update setting.');
                }
            } catch {
                e.target.checked = !enabled;
                showNotification('Failed to update setting.');
            }
        });
    });

    // Torrent source buttons - attach to ALL instances
    const torrentioBtns = document.querySelectorAll('#torrentioBtn');
    const inAppScraperBtns = document.querySelectorAll('#inAppScraperBtn');

    if (torrentioBtns.length > 0 && inAppScraperBtns.length > 0) {
        const handleSourceChange = async (source) => {
            console.log('=================================');
            console.log('[Settings] Button clicked! Changing source to:', source);
            try {
                const res = await fetch(`${API_BASE_URL}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ torrentSource: source })
                });
                const responseData = await res.json();
                console.log('[Settings] Server response:', responseData);

                if (res.ok) {
                    // Update UI immediately for ALL button instances
                    if (source === 'torrentio') {
                        torrentioBtns.forEach(btn => btn.classList.add('active'));
                        inAppScraperBtns.forEach(btn => btn.classList.remove('active'));
                        console.log('[Settings] UI updated: Torrentio active');
                    } else {
                        torrentioBtns.forEach(btn => btn.classList.remove('active'));
                        inAppScraperBtns.forEach(btn => btn.classList.add('active'));
                        console.log('[Settings] UI updated: In-App Scraper active');
                    }
                    console.log('[Settings] SUCCESS! Setting saved:', source);
                    console.log('=================================');
                    showNotification(`Torrent source changed to ${source === 'torrentio' ? 'Torrentio' : 'In-App Scraper'}`);
                } else {
                    console.error('[Settings] FAILED to save setting');
                    console.log('=================================');
                    showNotification('Failed to update torrent source.');
                }
            } catch (err) {
                console.error('[Settings] ERROR:', err);
                console.log('=================================');
                showNotification('Failed to update torrent source.');
            }
        };

        torrentioBtns.forEach(btn => {
            btn.addEventListener('click', () => handleSourceChange('torrentio'));
        });
        inAppScraperBtns.forEach(btn => {
            btn.addEventListener('click', () => handleSourceChange('in-app-scraper'));
        });
    }

    // Debrid settings
    if (useDebridToggle || debridProviderSel) {
        const onDebridChange = async () => {
            // Get visible useDebridToggle
            const useDebridToggles = document.querySelectorAll('#useDebridToggle');
            let enabled = false;
            for (const toggle of useDebridToggles) {
                if (toggle.offsetParent !== null) {
                    enabled = !!toggle.checked;
                    break;
                }
            }

            // Get visible debridProvider
            const debridProviders = document.querySelectorAll('#debridProvider');
            let provider = 'realdebrid';
            for (const select of debridProviders) {
                if (select.offsetParent !== null) {
                    provider = select.value;
                    break;
                }
            }

            // Get visible rdClientId input
            const rdClientIdInputs = document.querySelectorAll('#rdClientId');
            let visibleRdClientId = '';
            for (const input of rdClientIdInputs) {
                if (input.offsetParent !== null) {
                    visibleRdClientId = (input.value || '').trim();
                    break;
                }
            }
            const rdClientId = visibleRdClientId;

            try {
                const res = await fetch(`${API_BASE_URL}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ useDebrid: enabled, debridProvider: provider, rdClientId })
                });
                if (!res.ok) throw new Error('save failed');


                await res.json();
                useDebrid = enabled;
                debridProvider = provider;
                // Toggle provider-specific UI blocks for ALL instances
                const isRD = provider === 'realdebrid';
                const isAD = provider === 'alldebrid';
                const isTB = provider === 'torbox';
                const isPM = provider === 'premiumize';

                document.querySelectorAll('#rdClientIdGroup').forEach(el => el.style.display = isRD ? '' : 'none');
                document.querySelectorAll('#rdButtons').forEach(el => el.style.display = isRD ? '' : 'none');
                document.querySelectorAll('#rdTokenGroup').forEach(el => el.style.display = isRD ? '' : 'none');
                document.querySelectorAll('#rdTokenButtons').forEach(el => el.style.display = isRD ? '' : 'none');
                document.querySelectorAll('#rdCodePanel').forEach(el => el.style.display = 'none');
                document.querySelectorAll('#adSection').forEach(el => el.style.display = isAD ? '' : 'none');
                document.querySelectorAll('#tbSection').forEach(el => el.style.display = isTB ? '' : 'none');
                document.querySelectorAll('#pmSection').forEach(el => el.style.display = isPM ? '' : 'none');

                showNotification('Debrid settings saved.');
            } catch {
                showNotification('Failed to save debrid settings');
            }
        };

        // Add event listeners to ALL instances
        const useDebridToggles = document.querySelectorAll('#useDebridToggle');
        useDebridToggles.forEach(toggle => {
            toggle.addEventListener('change', onDebridChange);
        });

        const debridProviders = document.querySelectorAll('#debridProvider');
        debridProviders.forEach(select => {
            select.addEventListener('change', onDebridChange);
        });

        const rdClientIdInputs = document.querySelectorAll('#rdClientId');
        rdClientIdInputs.forEach(input => {
            input.addEventListener('change', onDebridChange);
        });
    }

    // Attach to ALL duplicate "Save Token" buttons (new + old settings UI)
    {
        const saveDebridTokenBtns = document.querySelectorAll('#saveDebridToken');
        saveDebridTokenBtns.forEach(btn => btn.addEventListener('click', async () => {
            // Get visible debridToken input
            const debridTokenInputs = document.querySelectorAll('#debridToken');
            let token = '';
            let visibleInput = null;
            for (const input of debridTokenInputs) {
                if (input.offsetParent !== null) {
                    token = (input.value || '').trim();
                    visibleInput = input;
                    break;
                }
            }

            if (!token) { showNotification('Enter a token first'); return; }
            try {
                const res = await fetch(`${API_BASE_URL}/debrid/token`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
                });
                if (res.ok) {
                    // Update ALL debridStatus elements
                    document.querySelectorAll('#debridStatus').forEach(status => {
                        status.textContent = 'Logged in';
                    });
                    // Clear ALL debridToken inputs
                    debridTokenInputs.forEach(input => {
                        input.value = '';
                    });
                    showNotification('Debrid token saved.');
                } else {
                    showNotification('Failed to save token');
                }
            } catch { showNotification('Failed to save token'); }
        }));
    }
    // Attach to ALL duplicate "Logout/clear RD token" buttons
    {
        const clearDebridTokenBtns = document.querySelectorAll('#clearDebridToken');
        clearDebridTokenBtns.forEach(btn => btn.addEventListener('click', async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/debrid/token`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: '' })
                });
                if (res.ok) {
                    // Update ALL debridStatus elements
                    document.querySelectorAll('#debridStatus').forEach(status => {
                        status.textContent = 'Not logged in';
                    });
                    showNotification('Logged out of Debrid.');
                } else {
                    showNotification('Failed to logout');
                }
            } catch { showNotification('Failed to logout'); }
        }));
    }

    // RD Device-code login handlers
    let rdPollTimer = null;
    function stopRdPolling() { if (rdPollTimer) { clearInterval(rdPollTimer); rdPollTimer = null; } }
    async function beginRdDeviceLogin() {
        try {
            const clientId = (rdClientIdInput?.value || '').trim();
            // Allow starting without clientId; server will fall back to stored rdClientId
            const url = `${API_BASE_URL}/debrid/rd/device-code${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`;
            const r = await fetch(url);
            if (!r.ok) {
                let msg = 'RD device-code start failed';
                try { const t = await r.json(); if (t?.error) msg = t.error; } catch { try { msg = await r.text(); } catch { } }
                rdLoginStatusEl.textContent = 'Error starting login';
                showNotification(msg);
                return;
            }
            const j = await r.json();
            rdCodePanel.style.display = 'block';
            rdUserCodeEl.textContent = j.user_code || '----';
            rdVerifyUrlEl.textContent = j.verification_url || 'https://real-debrid.com/device';
            rdVerifyUrlEl.href = j.verification_url || 'https://real-debrid.com/device';
            rdLoginStatusEl.textContent = 'Waiting for approval…';
            const intervalMs = Math.max(3, Number(j.interval || 5)) * 1000;
            const deviceCode = j.device_code;
            // Start polling
            stopRdPolling();
            rdPollTimer = setInterval(async () => {
                try {
                    const pr = await fetch(`${API_BASE_URL}/debrid/rd/poll`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device_code: deviceCode, client_id: clientId || undefined })
                    });
                    if (pr.ok) {
                        stopRdPolling();
                        rdLoginStatusEl.textContent = 'Logged in!';
                        // Update ALL debridStatus elements
                        document.querySelectorAll('#debridStatus').forEach(status => {
                            status.textContent = 'Logged in';
                        });
                        debridAuth = true;
                        showNotification('Real‑Debrid connected');
                        setTimeout(() => { rdCodePanel.style.display = 'none'; }, 800);
                    } else {
                        const txt = await pr.text();
                        if (/expired|invalid/i.test(txt)) {
                            stopRdPolling();
                            rdLoginStatusEl.textContent = 'Code expired. Try again.';
                        }
                    }
                } catch (_) { }
            }, intervalMs);
        } catch (_) {
            showNotification('Failed to start device login');
        }
    }
    if (rdDeviceLoginBtn) rdDeviceLoginBtn.addEventListener('click', beginRdDeviceLogin);
    if (rdOpenVerifyBtn) rdOpenVerifyBtn.addEventListener('click', async () => {
        const href = rdVerifyUrlEl?.href || 'https://real-debrid.com/device';
        if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(href);
        else window.open(href, '_blank');
    });
    if (rdCopyCodeBtn) rdCopyCodeBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(rdUserCodeEl?.textContent || ''); showNotification('Code copied'); } catch (_) { }
    });
    if (rdCancelLoginBtn) rdCancelLoginBtn.addEventListener('click', async () => {
        stopRdPolling(); rdCodePanel.style.display = 'none';
    });

    // AllDebrid PIN login handlers
    let adPollTimer = null, adPin = '', adCheck = '';
    function stopAdPolling() { if (adPollTimer) { clearInterval(adPollTimer); adPollTimer = null; } }
    async function beginAdPinLogin() {
        // If already authenticated with AllDebrid, avoid creating a new API key via PIN
        try {
            await ensureDebridState();
        } catch { }
        if (useDebrid && debridProvider === 'alldebrid' && debridAuth) {
            showNotification('Already logged in to AllDebrid');
            return;
        }
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/ad/pin`);
            const j = await r.json();
            if (r.ok && j.pin && j.check) {
                adPin = j.pin; adCheck = j.check;
                if (adPinPanel) adPinPanel.style.display = 'block';
                if (adPinCodeEl) adPinCodeEl.textContent = adPin;
                if (adUserUrlEl) adUserUrlEl.href = j.user_url || 'https://alldebrid.com/pin/';
                if (adLoginStatusEl) adLoginStatusEl.textContent = 'Waiting…';
                stopAdPolling();
                adPollTimer = setInterval(async () => {
                    try {
                        const pr = await fetch(`${API_BASE_URL}/debrid/ad/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: adPin, check: adCheck }) });
                        const pj = await pr.json();
                        if (pr.ok && pj.success) {
                            stopAdPolling();
                            // Update ALL debridStatus elements
                            document.querySelectorAll('#debridStatus').forEach(status => {
                                status.textContent = 'Logged in';
                            });
                            debridAuth = true;
                            if (adLoginStatusEl) adLoginStatusEl.textContent = 'Logged in!';
                            showNotification('AllDebrid connected');
                            setTimeout(() => { if (adPinPanel) adPinPanel.style.display = 'none'; }, 800);
                        } else if (pr.ok) {
                            // keep waiting
                        } else {
                            stopAdPolling();
                            if (adLoginStatusEl) adLoginStatusEl.textContent = pj?.error || 'PIN expired';
                        }
                    } catch (_) { }
                }, 5000);
            } else {
                showNotification(j?.error || 'Failed to start AllDebrid PIN');
            }
        } catch (_) {
            showNotification('Failed to start AllDebrid PIN');
        }
    }
    if (adStartPinBtn) adStartPinBtn.addEventListener('click', beginAdPinLogin);
    if (adOpenUserUrlBtn) adOpenUserUrlBtn.addEventListener('click', async () => {
        const href = adUserUrlEl?.href || 'https://alldebrid.com/pin/';
        if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(href); else window.open(href, '_blank');
    });
    if (adCopyPinBtn) adCopyPinBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(adPinCodeEl?.textContent || ''); showNotification('PIN copied'); } catch (_) { } });
    if (adCancelPinBtn) adCancelPinBtn.addEventListener('click', () => { stopAdPolling(); if (adPinPanel) adPinPanel.style.display = 'none'; });

    // --- Bind duplicated RD/AD login UIs (new settings panel) ---
    // Helper: find nearest container with a descendant matching a selector using attribute match to avoid global-ID issues
    function qIn(el, sel) { return el ? el.querySelector(sel) : null; }

    // Scoped RD device-code login
    async function beginRdDeviceLoginScoped(buttonEl) {
        const container = buttonEl.closest('#rdButtons')?.parentElement || buttonEl.parentElement;
        const rdClientInput = qIn(container, '[id="rdClientId"]');
        const codePanel = qIn(container, '[id="rdCodePanel"]');
        const userCodeEl = qIn(container, '[id="rdUserCode"]');
        const verifyUrlEl = qIn(container, '[id="rdVerifyUrl"]');
        const loginStatusEl = qIn(container, '[id="rdLoginStatus"]');
        const openVerifyBtn = qIn(container, '[id="rdOpenVerify"]');
        const copyCodeBtn = qIn(container, '[id="rdCopyCode"]');
        const cancelBtn = qIn(container, '[id="rdCancelLogin"]');

        const clientId = (rdClientInput?.value || '').trim();
        const url = `${API_BASE_URL}/debrid/rd/device-code${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`;
        try {
            const r = await fetch(url);
            if (!r.ok) {
                let msg = 'RD device-code start failed';
                try { const t = await r.json(); if (t?.error) msg = t.error; } catch { try { msg = await r.text(); } catch { } }
                if (loginStatusEl) loginStatusEl.textContent = 'Error starting login';
                showNotification(msg);
                return;
            }
            const j = await r.json();
            if (codePanel) codePanel.style.display = 'block';
            if (userCodeEl) userCodeEl.textContent = j.user_code || '----';
            if (verifyUrlEl) { verifyUrlEl.textContent = j.verification_url || 'https://real-debrid.com/device'; verifyUrlEl.href = j.verification_url || 'https://real-debrid.com/device'; }
            if (loginStatusEl) loginStatusEl.textContent = 'Waiting for approval…';
            const intervalMs = Math.max(3, Number(j.interval || 5)) * 1000;
            const deviceCode = j.device_code;

            stopRdPolling();
            rdPollTimer = setInterval(async () => {
                try {
                    const pr = await fetch(`${API_BASE_URL}/debrid/rd/poll`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device_code: deviceCode, client_id: clientId || undefined })
                    });
                    if (pr.ok) {
                        stopRdPolling();
                        if (loginStatusEl) loginStatusEl.textContent = 'Logged in!';
                        document.querySelectorAll('#debridStatus').forEach(status => { status.textContent = 'Logged in'; });
                        debridAuth = true;
                        // Reflect provider/toggle in all duplicate controls
                        document.querySelectorAll('#useDebridToggle').forEach(cb => { try { cb.checked = true; } catch { } });
                        document.querySelectorAll('#debridProvider').forEach(sel => { try { sel.value = 'realdebrid'; } catch { } });
                        // Persist provider and enable Debrid so caching is used
                        try { await fetch(`${API_BASE_URL}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useDebrid: true, debridProvider: 'realdebrid' }) }); } catch { }
                        showNotification('Real‑Debrid connected');
                        setTimeout(() => { if (codePanel) codePanel.style.display = 'none'; }, 800);
                    } else {
                        const txt = await pr.text();
                        if (/expired|invalid/i.test(txt)) { stopRdPolling(); if (loginStatusEl) loginStatusEl.textContent = 'Code expired. Try again.'; }
                    }
                } catch (_) { }
            }, intervalMs);

            // Bind inline controls once
            if (container && !container.dataset.rdBound) {
                container.dataset.rdBound = '1';
                if (openVerifyBtn) openVerifyBtn.addEventListener('click', async () => {
                    const href = verifyUrlEl?.href || 'https://real-debrid.com/device';
                    if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(href); else window.open(href, '_blank');
                });
                if (copyCodeBtn) copyCodeBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(userCodeEl?.textContent || ''); showNotification('Code copied'); } catch (_) { } });
                if (cancelBtn) cancelBtn.addEventListener('click', () => { stopRdPolling(); if (codePanel) codePanel.style.display = 'none'; });
            }
        } catch (_) {
            showNotification('Failed to start device login');
        }
    }

    // Scoped AllDebrid PIN login
    async function beginAdPinLoginScoped(buttonEl) {
        const container = buttonEl.closest('#adSection') || buttonEl.parentElement;
        const pinPanel = qIn(container, '[id="adPinPanel"]');
        const pinCodeEl = qIn(container, '[id="adPinCode"]');
        const userUrlEl = qIn(container, '[id="adUserUrl"]');
        const loginStatusEl = qIn(container, '[id="adLoginStatus"]');
        const openUserBtn = qIn(container, '[id="adOpenUserUrl"]');
        const copyPinBtn = qIn(container, '[id="adCopyPin"]');
        const cancelBtn = qIn(container, '[id="adCancelPin"]');

        try { await ensureDebridState(); } catch { }
        if (useDebrid && debridProvider === 'alldebrid' && debridAuth) { showNotification('Already logged in to AllDebrid'); return; }
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/ad/pin`);
            const j = await r.json();
            if (r.ok && j.pin && j.check) {
                adPin = j.pin; adCheck = j.check;
                if (pinPanel) pinPanel.style.display = 'block';
                if (pinCodeEl) pinCodeEl.textContent = adPin;
                if (userUrlEl) userUrlEl.href = j.user_url || 'https://alldebrid.com/pin/';
                if (loginStatusEl) loginStatusEl.textContent = 'Waiting…';
                stopAdPolling();
                adPollTimer = setInterval(async () => {
                    try {
                        const pr = await fetch(`${API_BASE_URL}/debrid/ad/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: adPin, check: adCheck }) });
                        const pj = await pr.json();
                        if (pr.ok && pj.success) {
                            stopAdPolling();
                            document.querySelectorAll('#debridStatus').forEach(status => { status.textContent = 'Logged in'; });
                            debridAuth = true;
                            if (loginStatusEl) loginStatusEl.textContent = 'Logged in!';
                            // Reflect provider/toggle in all duplicate controls
                            document.querySelectorAll('#useDebridToggle').forEach(cb => { try { cb.checked = true; } catch { } });
                            document.querySelectorAll('#debridProvider').forEach(sel => { try { sel.value = 'alldebrid'; } catch { } });
                            // Persist provider and enable Debrid
                            try { await fetch(`${API_BASE_URL}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useDebrid: true, debridProvider: 'alldebrid' }) }); } catch { }
                            showNotification('AllDebrid connected');
                            setTimeout(() => { if (pinPanel) pinPanel.style.display = 'none'; }, 800);
                        } else if (!pr.ok) {
                            stopAdPolling();
                            if (loginStatusEl) loginStatusEl.textContent = pj?.error || 'PIN expired';
                        }
                    } catch (_) { }
                }, 5000);

                if (container && !container.dataset.adBound) {
                    container.dataset.adBound = '1';
                    if (openUserBtn) openUserBtn.addEventListener('click', async () => { const href = userUrlEl?.href || 'https://alldebrid.com/pin/'; if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(href); else window.open(href, '_blank'); });
                    if (copyPinBtn) copyPinBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pinCodeEl?.textContent || ''); showNotification('PIN copied'); } catch (_) { } });
                    if (cancelBtn) cancelBtn.addEventListener('click', () => { stopAdPolling(); if (pinPanel) pinPanel.style.display = 'none'; });
                }
            } else {
                showNotification(j?.error || 'Failed to start AllDebrid PIN');
            }
        } catch (_) {
            showNotification('Failed to start AllDebrid PIN');
        }
    }

    // Attach scoped handlers to ALL duplicates
    document.querySelectorAll('#rdDeviceLogin').forEach(btn => {
        if (!btn.dataset.boundRd) { btn.dataset.boundRd = '1'; btn.addEventListener('click', () => beginRdDeviceLoginScoped(btn)); }
    });
    document.querySelectorAll('#adStartPin').forEach(btn => {
        if (!btn.dataset.boundAd) { btn.dataset.boundAd = '1'; btn.addEventListener('click', () => beginAdPinLoginScoped(btn)); }
    });
    // Attach to ALL duplicate AllDebrid Save buttons
    document.querySelectorAll('#adSaveApiKey').forEach(btn => btn.addEventListener('click', async () => {
        // Get visible adApiKey input
        const adApiKeyInputs = document.querySelectorAll('#adApiKey');
        let apikey = '';
        for (const input of adApiKeyInputs) {
            if (input.offsetParent !== null) {
                apikey = (input.value || '').trim();
                break;
            }
        }

        if (!apikey) { showNotification('Enter an AllDebrid API key'); return; }
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/ad/apikey`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apikey }) });
            if (r.ok) {
                // Update ALL debridStatus elements
                document.querySelectorAll('#debridStatus').forEach(status => {
                    status.textContent = 'Logged in';
                });
                showNotification('AllDebrid API key saved');
                // Clear ALL adApiKey inputs
                adApiKeyInputs.forEach(input => { input.value = ''; });
            }
            else { const t = await r.text(); showNotification(t || 'Failed to save'); }
        } catch { showNotification('Failed to save'); }
    }));
    // Attach to ALL duplicate AllDebrid Logout buttons
    document.querySelectorAll('#adClearApiKey').forEach(btn => btn.addEventListener('click', async () => {
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/ad/apikey`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apikey: '' }) });
            if (r.ok) {
                // Update ALL debridStatus elements
                document.querySelectorAll('#debridStatus').forEach(status => {
                    status.textContent = 'Not logged in';
                });
                showNotification('Logged out of AllDebrid');
            }
        } catch { }
    }));

    // TorBox: save/clear token
    // Attach to ALL duplicate TorBox Save buttons
    document.querySelectorAll('#tbSaveToken').forEach(btn => btn.addEventListener('click', async () => {
        // Get visible tbToken input
        const tbTokenInputs = document.querySelectorAll('#tbToken');
        let token = '';
        for (const input of tbTokenInputs) {
            if (input.offsetParent !== null) {
                token = (input.value || '').trim();
                break;
            }
        }

        if (!token) { showNotification('Enter a TorBox token'); return; }
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/tb/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            if (r.ok) {
                // Update ALL debridStatus elements
                document.querySelectorAll('#debridStatus').forEach(status => {
                    status.textContent = 'Logged in';
                });
                // Clear ALL tbToken inputs
                tbTokenInputs.forEach(input => { input.value = ''; });
                showNotification('TorBox token saved');
            }
            else { const t = await r.text(); showNotification(t || 'Failed to save'); }
        } catch { showNotification('Failed to save'); }
    }));
    // Attach to ALL duplicate TorBox Logout buttons
    document.querySelectorAll('#tbClearToken').forEach(btn => btn.addEventListener('click', async () => {
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/tb/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: '' }) });
            if (r.ok) {
                // Update ALL debridStatus elements
                document.querySelectorAll('#debridStatus').forEach(status => {
                    status.textContent = 'Not logged in';
                });
                showNotification('Logged out of TorBox');
            }
        } catch { }
    }));

    // Premiumize: save/clear API key
    // Attach to ALL duplicate Premiumize Save buttons
    document.querySelectorAll('#pmSaveApiKey').forEach(btn => btn.addEventListener('click', async () => {
        // Get visible pmApiKey input
        const pmApiKeyInputs = document.querySelectorAll('#pmApiKey');
        let apikey = '';
        for (const input of pmApiKeyInputs) {
            if (input.offsetParent !== null) {
                apikey = (input.value || '').trim();
                break;
            }
        }

        if (!apikey) { showNotification('Enter a Premiumize API key'); return; }
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/pm/apikey`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apikey }) });
            if (r.ok) {
                // Update ALL debridStatus elements
                document.querySelectorAll('#debridStatus').forEach(status => {
                    status.textContent = 'Logged in';
                });
                // Clear ALL pmApiKey inputs
                pmApiKeyInputs.forEach(input => { input.value = ''; });
                showNotification('Premiumize API key saved');
            }
            else { const t = await r.text(); showNotification(t || 'Failed to save'); }
        } catch { showNotification('Failed to save'); }
    }));
    // Attach to ALL duplicate Premiumize Logout buttons
    document.querySelectorAll('#pmClearApiKey').forEach(btn => btn.addEventListener('click', async () => {
        try {
            const r = await fetch(`${API_BASE_URL}/debrid/pm/apikey`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apikey: '' }) });
            if (r.ok) {
                // Update ALL debridStatus elements
                document.querySelectorAll('#debridStatus').forEach(status => {
                    status.textContent = 'Not logged in';
                });
                showNotification('Logged out of Premiumize');
            }
        } catch { }
    }));

    // ===== FEBBOX TOKEN EVENT LISTENER =====

    // Febbox token (attach to ALL duplicate inputs/buttons)
    const febboxInputs = document.querySelectorAll('#febboxTokenInput');
    const savedFebboxToken = localStorage.getItem('febboxToken');
    if (savedFebboxToken) {
        febboxInputs.forEach(inp => { try { inp.value = savedFebboxToken; } catch (_) { } });
    }
    const saveFebboxBtns = document.querySelectorAll('#saveFebboxToken');
    saveFebboxBtns.forEach(btn => btn.addEventListener('click', () => {
        // Prefer token from the input in the same card/section as the clicked button
        const scope = btn.closest('.settings-card-body, .api-input-group, .form-group') || document;
        let input = scope.querySelector('#febboxTokenInput');
        if (!input) {
            // Fallback: use the visible input if any
            for (const el of febboxInputs) { if (el.offsetParent !== null) { input = el; break; } }
        }
        const token = (input?.value || '').trim();
        if (token) {
            localStorage.setItem('febboxToken', token);
            // Reflect into all duplicate inputs for consistency
            febboxInputs.forEach(inp => { try { inp.value = token; } catch (_) { } });
            showNotification('Febbox token saved successfully', 'success');
        } else {
            localStorage.removeItem('febboxToken');
            febboxInputs.forEach(inp => { try { inp.value = ''; } catch (_) { } });
            showNotification('Febbox token cleared, using default', 'success');
        }
    }));

    // ===== TRAKT EVENT LISTENERS - attach to ALL instances =====

    const traktLoginBtns = document.querySelectorAll('#traktLogin');
    const traktDisconnectBtns = document.querySelectorAll('#traktDisconnect');
    const traktCopyCodeBtns = document.querySelectorAll('#traktCopyCode');
    const traktOpenVerifyBtns = document.querySelectorAll('#traktOpenVerify');
    const traktCancelLoginBtns = document.querySelectorAll('#traktCancelLogin');

    traktLoginBtns.forEach(btn => btn.addEventListener('click', startTraktLogin));
    traktDisconnectBtns.forEach(btn => btn.addEventListener('click', disconnectTrakt));
    traktCopyCodeBtns.forEach(btn => btn.addEventListener('click', copyTraktCode));
    traktOpenVerifyBtns.forEach(btn => btn.addEventListener('click', openTraktVerify));
    traktCancelLoginBtns.forEach(btn => btn.addEventListener('click', cancelTraktLogin));

    const traktViewWatchlistBtns = document.querySelectorAll('#traktViewWatchlist');
    traktViewWatchlistBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/trakt/watchlist?type=mixed');
                const data = await response.json();

                if (data.success && data.watchlist) {
                    showNotification(`Found ${data.watchlist.length} items in your watchlist`, 'info');
                    // TODO: Could open a modal to show watchlist items
                    console.log('[TRAKT] Watchlist:', data.watchlist);
                } else {
                    showNotification('Failed to load watchlist', 'error');
                }
            } catch (error) {
                console.error('[TRAKT] Watchlist error:', error);
                showNotification('Failed to load watchlist', 'error');
            }
        });
    });

    const traktViewHistoryBtns = document.querySelectorAll('#traktViewHistory');
    traktViewHistoryBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/trakt/history?type=mixed&limit=20');
                const data = await response.json();

                if (data.success && data.history) {
                    showNotification(`Loaded ${data.history.length} recent items from your history`, 'info');
                    console.log('[TRAKT] History:', data.history);
                } else {
                    showNotification('Failed to load history', 'error');
                }
            } catch (error) {
                console.error('[TRAKT] History error:', error);
                showNotification('Failed to load history', 'error');
            }
        });
    });

    const traktViewStatsBtns = document.querySelectorAll('#traktViewStats');
    traktViewStatsBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/trakt/stats');
                const data = await response.json();

                if (data.success && data.stats) {
                    const stats = data.stats;
                    const message = `Movies: ${stats.movies?.watched || 0} watched, Shows: ${stats.shows?.watched || 0} watched, Episodes: ${stats.episodes?.watched || 0} watched`;
                    showNotification(message, 'info', 5000);
                    console.log('[TRAKT] Stats:', stats);
                } else {
                    showNotification('Failed to load stats', 'error');
                }
            } catch (error) {
                console.error('[TRAKT] Stats error:', error);
                showNotification('Failed to load stats', 'error');
            }
        });
    });

    // ===== END TRAKT EVENT LISTENERS =====

    // Open Jackett installer link - REMOVED (button no longer exists)


    // Open Jackett video tutorial in default browser
    const jackettTutorialBtn = document.getElementById('jackettTutorialBtn');
    if (jackettTutorialBtn) {
        jackettTutorialBtn.addEventListener('click', async () => {
            const url = 'https://www.youtube.com/watch?v=3igLReZFFzg&t';
            if (window.electronAPI?.openExternal) {
                const res = await window.electronAPI.openExternal(url);
                if (!res?.success) {
                    showNotification('Failed to open browser. Copying link to clipboard.');
                    try { await navigator.clipboard.writeText(url); } catch { }
                }
            } else {
                // Fallback: copy link if preload is unavailable
                showNotification('Copying link to clipboard. Open it in your browser.');
                try { await navigator.clipboard.writeText(url); } catch { }
            }
        });
    }

    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Check in priority order and stop after handling one
            if (mpvPlayerContainer.classList.contains('active')) {
                e.preventDefault();
                e.stopPropagation();
                closePlayer(false); // Don't show notification when using Escape
            }
            else if (settingsModal.classList.contains('active')) {
                e.preventDefault();
                e.stopPropagation();
                hideSettingsModal();
            }
            // API Setup Modal removed - no longer checking for it
        }
    });

    // Enter key for API inputs - REMOVED (firstTimeApiKey no longer exists)

    newApiKey.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveSettings_();
        }
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && searchInput.value.trim() !== '') {
            e.preventDefault();
            const query = searchInput.value.trim();
            // Navigate to home for search to display results clearly
            if (activeRoute !== 'home') {
                window.location.hash = '#/';
            }
            await searchMovies(query);
        }
    });

    // Back to Home button
    const backToHomeBtn = document.getElementById('backToHomeBtn');
    if (backToHomeBtn) {
        backToHomeBtn.querySelector('button').addEventListener('click', () => {
            // Clear search input and search mode
            searchInput.value = '';
            isSearchMode = false;
            lastSearchResults = [];
            lastSearchQuery = '';

            // Reload home page with hero and sliders
            backToHomeBtn.style.display = 'none';
            if (document.body.classList.contains('ui-new')) {
                const slidersContainer = document.getElementById('slidersContainer');
                const heroSection = document.getElementById('heroSection');
                if (slidersContainer) slidersContainer.style.display = 'block';
                if (heroSection) heroSection.style.display = 'block';
                moviesGrid.style.display = 'none';
                moviesGrid.innerHTML = '';
            }
        });
    }

    // Genres navigation
    genresBtn.addEventListener('click', () => {
        window.location.hash = '#/genres';
    });

    // Custom Magnet Modal - Close handlers only (open handled after nav setup)
    const customMagnetModal = document.getElementById('custom-magnet-modal');
    const closeCustomMagnetModal = document.getElementById('close-custom-magnet-modal');
    const cancelCustomMagnetBtn = document.getElementById('cancel-custom-magnet-btn');
    const playCustomMagnetBtn = document.getElementById('play-custom-magnet-btn');
    const customMagnetInput = document.getElementById('custom-magnet-input');

    if (closeCustomMagnetModal && customMagnetModal) {
        closeCustomMagnetModal.addEventListener('click', () => {
            customMagnetModal.style.display = 'none';
            customMagnetModal.classList.remove('active');
            customMagnetModal.style.opacity = '0';
            customMagnetModal.style.pointerEvents = 'none';
        });
    }

    if (cancelCustomMagnetBtn && customMagnetModal) {
        cancelCustomMagnetBtn.addEventListener('click', () => {
            customMagnetModal.style.display = 'none';
            customMagnetModal.classList.remove('active');
            customMagnetModal.style.opacity = '0';
            customMagnetModal.style.pointerEvents = 'none';
        });
    }

    if (playCustomMagnetBtn && customMagnetModal && customMagnetInput) {
        playCustomMagnetBtn.addEventListener('click', async () => {
            const magnetLink = customMagnetInput.value.trim();

            if (!magnetLink) {
                showNotification('Please enter a magnet link', 'warning');
                return;
            }

            if (!magnetLink.startsWith('magnet:')) {
                showNotification('Invalid magnet link format', 'error');
                return;
            }

            // Close modal
            customMagnetModal.style.display = 'none';

            // Use the existing startStream function which handles both debrid and non-debrid
            try {
                await startStream(magnetLink);
            } catch (error) {
                console.error('Error playing custom magnet:', error);
                showNotification('Failed to play magnet link', 'error');
            }
        });
    }

    // Close modal when clicking outside
    if (customMagnetModal) {
        customMagnetModal.addEventListener('click', (e) => {
            if (e.target === customMagnetModal) {
                customMagnetModal.style.display = 'none';
                customMagnetModal.classList.remove('active');
                customMagnetModal.style.opacity = '0';
                customMagnetModal.style.pointerEvents = 'none';
            }
        });
    }

    // My List navigation
    const myListBtn = document.getElementById('myListBtn');
    if (myListBtn) {
        myListBtn.addEventListener('click', () => {
            window.location.hash = '#/my-list';
        });
    }

    // Done Watching navigation
    const doneWatchingBtn = document.getElementById('doneWatchingBtn');
    if (doneWatchingBtn) {
        doneWatchingBtn.addEventListener('click', () => {
            window.location.hash = '#/done-watching';
        });
    }

    // Router: hash change
    window.addEventListener('hashchange', handleRoute);

    // Infinite scroll - performant listeners with rAF throttle and passive mode
    let __scrollScheduled = false;
    function __handleScrollRaf(e) {
        if (__scrollScheduled) return;
        __scrollScheduled = true;
        requestAnimationFrame(() => {
            try { handleScroll(e); } finally { __scrollScheduled = false; }
        });
    }
    // Attach based on current UI mode to avoid duplicate listeners
    if (document.body.classList.contains('ui-new')) {
        const appMainElement = document.querySelector('.app-main main');
        if (appMainElement) appMainElement.addEventListener('scroll', __handleScrollRaf, { passive: true });
    } else {
        window.addEventListener('scroll', __handleScrollRaf, { passive: true });
    }

    // Modal close
    modalClose.addEventListener('click', closeModal);

    // Player close - guard against undefined (closePlayer is scoped differently)
    if (closePlayerBtn && typeof closePlayer === 'function') {
        closePlayerBtn.addEventListener('click', closePlayer);
    }

    // Custom Player close - guard against undefined
    if (closeCustomPlayer && typeof closeCustomPlayer_ === 'function') {
        closeCustomPlayer.addEventListener('click', closeCustomPlayer_);
    }

    // Watch now button
    watchNowBtn.addEventListener('click', (e) => {
        console.log('[DEBUG] Watch button clicked!');
        try {
            const streamingMode = localStorage.getItem('useStreamingServers') === 'true';
            console.log('[DEBUG] Streaming mode:', streamingMode, 'mediaType:', currentMediaType);

            if (streamingMode) {
                console.log('[DEBUG] Streaming mode enabled, showing server selection');
                // Build mediaData for server selection - support both movies and TV
                const mediaData = {
                    id: currentContent?.id,
                    type: currentMediaType || 'movie',
                    title: currentContent?.title || currentContent?.name || 'Untitled',
                    subtitle: currentMediaType === 'tv' && currentSeason && lastSearchedEpisode
                        ? `Season ${currentSeason} Episode ${lastSearchedEpisode}`
                        : '',
                    year: (currentContent?.release_date || currentContent?.first_air_date || '').substring(0, 4),
                    rating: Number(currentContent?.vote_average || 0).toFixed(1),
                    poster: currentContent?.poster_path ? `https://image.tmdb.org/t/p/w342${currentContent.poster_path}` : ''
                };
                console.log('[DEBUG] Calling showServerSelection with:', mediaData);
                showServerSelection(mediaData);
            } else {
                console.log('[DEBUG] Streaming mode disabled, showing torrents');
                showTorrents(e);
                // Auto-scroll to provider buttons for quick access
                setTimeout(() => {
                    const pb = document.querySelector('.provider-buttons');
                    if (pb) pb.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 200);
            }
        } catch (error) {
            console.error('[DEBUG] Error in Watch Now handler:', error);
        }
    });

    // Toggle streaming mode from details modal
    const useStreamsBtn = document.getElementById('useStreamsBtn');
    if (useStreamsBtn) {
        useStreamsBtn.addEventListener('click', () => {
            const current = localStorage.getItem('useStreamingServers') === 'true';
            const next = !current;
            localStorage.setItem('useStreamingServers', next ? 'true' : 'false');
            // Sync settings toggles in the UI
            const toggles = document.querySelectorAll('#useStreamingServersToggle');
            toggles.forEach(t => t.checked = next);
            // Update main button text and hint
            updateWatchButtonText();
            showNotification(`Streaming mode ${next ? 'enabled' : 'disabled'}`, next ? 'success' : 'info');
        });
    }

    // Refresh torrents
    refreshTorrents.addEventListener('click', () => {
        torrentsLoaded = false;
        fetchTorrents(lastSearchedSeason, lastSearchedEpisode);
    });

    // Sort selector for torrents
    const torrentSortSelect = document.getElementById('torrentSortSelect');
    function handleSortChange() {
        const newMode = torrentSortSelect ? torrentSortSelect.value : 'seeders';
        console.log('[SORT] Changing from', torrentSortMode, 'to', newMode);
        torrentSortMode = newMode;
        try { if (typeof torrentsPage === 'number') torrentsPage = 1; } catch (_) { }

        // Re-render based on active provider
        if (selectedProvider === 'nuvio' && allNuvioStreams.length > 0) {
            console.log('[SORT] Re-rendering Nuvio streams with mode:', torrentSortMode);
            try { displayNuvioStreams(allNuvioStreams); } catch (_) { }
        } else if (selectedProvider === 'moviebox') {
            console.log('[SORT] Skipping re-render for provider:', selectedProvider, '(sorting not supported)');
            return;
        } else if (selectedProvider === '111477' && window._last111477Files) {
            console.log('[SORT] Re-rendering 111477 files with mode:', torrentSortMode);
            try { render111477Files(window._last111477Files); } catch (_) { }
        } else {
            // Comet, Jackett, Torrentio, PlayTorrio all use standard torrent rendering
            console.log('[SORT] Re-rendering torrents page with mode:', torrentSortMode);
            try { renderTorrentsPage(); } catch (_) { }
        }
    }
    if (torrentSortSelect) {
        torrentSortSelect.addEventListener('change', handleSortChange);
        // Fire during selection as well for more immediate updates in some environments
        torrentSortSelect.addEventListener('input', handleSortChange);
    }

    // Size filter selector for torrents
    const torrentSizeFilterSelect = document.getElementById('torrentSizeFilterSelect');
    function handleSizeFilterChange() {
        torrentSizeFilter = (torrentSizeFilterSelect && torrentSizeFilterSelect.value) ? torrentSizeFilterSelect.value : 'all';
        console.log('[FILTER] Size filter changed to:', torrentSizeFilter);
        try { if (typeof torrentsPage === 'number') torrentsPage = 1; } catch (_) { }

        // Re-render based on active provider
        if (selectedProvider === 'nuvio' && allNuvioStreams.length > 0) {
            console.log('[FILTER] Re-rendering Nuvio streams with filter:', torrentSizeFilter);
            try { displayNuvioStreams(allNuvioStreams); } catch (_) { }
        } else if (selectedProvider === 'moviebox') {
            console.log('[FILTER] Skipping re-render for provider:', selectedProvider, '(filtering not supported)');
            return;
        } else if (selectedProvider === '111477' && window._last111477Files) {
            console.log('[FILTER] Re-rendering 111477 files with filter:', torrentSizeFilter);
            try { render111477Files(window._last111477Files); } catch (_) { }
        } else {
            // Comet, Jackett, Torrentio, PlayTorrio all use standard torrent rendering
            console.log('[FILTER] Re-rendering torrents page with filter:', torrentSizeFilter);
            try { renderTorrentsPage(); } catch (_) { }
        }
    }
    if (torrentSizeFilterSelect) {
        torrentSizeFilterSelect.addEventListener('change', handleSizeFilterChange);
        // Fire during selection as well for more immediate updates in some environments
        torrentSizeFilterSelect.addEventListener('input', handleSizeFilterChange);
    }

    // Provider buttons
    document.querySelectorAll('.provider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update selected provider
            selectedProvider = btn.dataset.provider;
            console.log('[Provider] Switched to:', selectedProvider);

            // Always show a searching indicator immediately
            try {
                const tl = document.getElementById('torrentsList');
                if (tl) {
                    const label = selectedProvider === 'moviebox' ? 'MovieBox' :
                        selectedProvider === 'nuvio' ? 'Nuvio' :
                            selectedProvider === 'comet' ? 'Comet' :
                                selectedProvider === '111477' ? '111477' : 'torrents';
                    tl.innerHTML = `<div class="loading"><i class="fas fa-spinner"></i> Searching ${label}...</div>`;
                }
            } catch (_) { }

            // Fetch with new provider using last searched parameters; call MovieBox directly to avoid any gating
            torrentsLoaded = false;
            if (selectedProvider === 'moviebox') {
                fetchMovieBoxStreams(lastSearchedSeason, lastSearchedEpisode);
            } else {
                fetchTorrents(lastSearchedSeason, lastSearchedEpisode);
            }
        });
    });

    // Keyword filter for torrents
    if (torrentKeywordFilter) {
        torrentKeywordFilter.addEventListener('input', () => {
            torrentsPage = 1; // Reset to first page when filtering
            renderTorrentsPage();
        });
    }

    // MPV Controls
    // Resume modal elements
    const resumeModal = document.getElementById('resumeModal');
    const resumeClose = document.getElementById('resumeClose');
    const resumeTimeEl = document.getElementById('resumeTime');
    const resumeContinue = document.getElementById('resumeContinue');
    const resumeStartOver = document.getElementById('resumeStartOver');

    function formatResumeSeconds(s) { try { return formatDuration(Math.floor(Number(s || 0))); } catch (_) { return '00:00'; } }
    function hideResumeModal() { resumeModal?.classList.remove('active'); }
    function showResumeModal() { resumeModal?.classList.add('active'); }

    // Dismiss on outside click
    if (resumeModal) {
        resumeModal.addEventListener('click', (e) => {
            if (e.target === resumeModal) {
                hideResumeModal();
            }
        });
        // prevent bubbling from content
        const rc = resumeModal.querySelector('.modal-content');
        if (rc) rc.addEventListener('click', (e) => e.stopPropagation());
    }

    // Robust Season/Episode parser for torrent filenames
    function parseSeasonEpisodeFromTitle(title) {
        if (!title || typeof title !== 'string') return null;
        const t = title.replace(/[_\.-]/g, ' ').toLowerCase();

        // Try common compact forms first: S01E01, S1E1, S01.E01, S01 E01
        let m = /\b[s](\d{1,2})\s*[\.\-\s_]*[e](\d{1,3})\b/i.exec(title);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

        // Forms like S1 EP7 or S01 Ep 07
        m = /\b[s](\d{1,2})\s*[\.\-\s_]*(?:ep|episode)\s*(\d{1,3})\b/i.exec(title);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

        // Bracketed forms like [S01E07] or (S01E07)
        m = /[\[(]\s*s?(\d{1,2})\s*[\.\-\s_]*e?(\d{1,3})\s*[\])]?/i.exec(title);
        if (m && m[1] && m[2]) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

        // 1x07, 01x07 (with optional spaces)
        m = /(?:^|\D)(\d{1,2})\s*[x]\s*(\d{1,3})(?!\d)/i.exec(title);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

        // Hyphenated season-episode inside brackets (e.g., [1-07])
        m = /[\[(]\s*(\d{1,2})\s*[-_]\s*(\d{1,3})\s*[\])]/i.exec(title);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

        // Season 1 Episode 7 (various spacings) ('series' synonym)
        m = /(season|series)\s*(\d{1,2})\s*(?:episode|ep)\s*(\d{1,3})/i.exec(t);
        if (m) return { season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };

        // Episode 7 Season 1 (reverse order) ('series' synonym)
        m = /(?:episode|ep)\s*(\d{1,3})\s*(season|series)\s*(\d{1,2})/i.exec(t);
        if (m) return { season: parseInt(m[3], 10), episode: parseInt(m[1], 10) };

        // S01 01 or S1 1 (space-separated)
        m = /\b[s](\d{1,2})\s+(\d{1,3})\b/i.exec(t);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

        // If only episode is found, return partial; caller may fill season from UI state
        m = /\b(?:episode|ep)\s*(\d{1,3})\b/i.exec(t);
        if (m) return { season: undefined, episode: parseInt(m[1], 10) };

        return null;
    }

    async function handlePlayNowClick() {
        // On Windows: Use mpv.js player
        // On Mac/Linux: Use HTML5 player
        if (!currentStreamUrl) {
            showNotification('No file selected to play');
            return;
        }

        // Try to launch mpv.js player on Windows
        try {
            const tmdbId = currentContent?.id?.toString() || '';
            let seasonNum = null;
            let episodeNum = null;

            // For Nuvio provider, prefer UI-selected season/episode from modal state
            if (currentMediaType === 'tv' && selectedProvider === 'nuvio') {
                if (lastSearchedSeason && lastSearchedEpisode) {
                    seasonNum = String(lastSearchedSeason);
                    episodeNum = String(lastSearchedEpisode);
                }
            } else if (currentMediaType === 'tv' && currentSelectedVideoName) {
                // Torrents: extract S/E from filename using robust parser
                const se = parseSeasonEpisodeFromTitle(currentSelectedVideoName);
                if (se) {
                    if (typeof se.season === 'number' && typeof se.episode === 'number') {
                        seasonNum = String(se.season);
                        episodeNum = String(se.episode);
                    } else if (typeof se.episode === 'number' && currentSeason) {
                        // Partial match: use UI's currentSeason if available
                        seasonNum = String(currentSeason);
                        episodeNum = String(se.episode);
                    }
                }
            }

            const result = await window.electronAPI.spawnMpvjsPlayer({
                url: currentStreamUrl,
                tmdbId: tmdbId,
                seasonNum: seasonNum,
                episodeNum: episodeNum
            });

            if (result.success) {
                showNotification('Player launched');
                return;
            }

            // If mpv.js fails (not Windows), fall through to HTML5 player
            console.log('[Play Now] mpv.js not available, using HTML5 player');
        } catch (err) {
            console.log('[Play Now] Using HTML5 player:', err.message);
        }

        // Original HTML5 player logic for non-Windows or fallback
        // Ensure we have latest resume info; fetch if not present
        let res = resumeInfo;
        if ((!res || typeof res.position !== 'number') && resumeKey) {
            try { res = await fetchResume(resumeKey); } catch (_) { }
        }
        if (res && typeof res.position === 'number' && res.position > 0) {
            resumeInfo = res; // keep in sync
            resumeTimeEl.textContent = formatResumeSeconds(res.position);
            showResumeModal();
            // Wire temp listeners
            const onCont = async () => {
                // Immediately persist current resume snapshot so a record exists right away
                try {
                    if (resumeKey && resumeInfo && typeof resumeInfo.position === 'number') {
                        const title = currentSelectedVideoName || (currentContent?.title || currentContent?.name || '');
                        await fetch(`${API_BASE_URL}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: resumeKey, position: Math.floor(resumeInfo.position || 0), duration: Math.floor(resumeInfo.duration || 0), title }) });
                    }
                } catch (_) { }
                hideResumeModal();
                openCustomPlayer();
                cleanup();
            };
            const onOver = async () => {
                try { if (resumeKey) await fetch(`${API_BASE_URL}/resume?key=${encodeURIComponent(resumeKey)}`, { method: 'DELETE' }); } catch (_) { }
                // Reset local resume so player starts at 0
                resumeInfo = null;
                hideResumeModal();
                openCustomPlayer();
                // As soon as playback begins, record fresh progress so quitting early is remembered
                try {
                    const onFirst = () => { try { saveResumeThrottled(true); } catch (_) { } customVideo.removeEventListener('timeupdate', onFirst); };
                    customVideo.addEventListener('timeupdate', onFirst);
                } catch (_) { }
                cleanup();
            };
            const cleanup = () => {
                resumeContinue.removeEventListener('click', onCont);
                resumeStartOver.removeEventListener('click', onOver);
                resumeClose.removeEventListener('click', onClose);
                document.removeEventListener('keydown', onEsc);
            };
            const onClose = () => { hideResumeModal(); cleanup(); };
            const onEsc = (e) => { if (e.key === 'Escape') { hideResumeModal(); cleanup(); } };
            resumeContinue.addEventListener('click', onCont);
            resumeStartOver.addEventListener('click', onOver);
            resumeClose.addEventListener('click', onClose);
            document.addEventListener('keydown', onEsc);
            return;
        }
        openCustomPlayer();
    }

    async function handleOpenMPVClick() {
        // Ensure we have latest resume info; fetch if not present
        let res = resumeInfo;
        if ((!res || typeof res.position !== 'number') && resumeKey) {
            try { res = await fetchResume(resumeKey); } catch (_) { }
        }
        if (res && typeof res.position === 'number' && res.position > 0) {
            resumeInfo = res;
            resumeTimeEl.textContent = formatResumeSeconds(res.position);
            showResumeModal();
            const onCont = async () => {
                // Immediately persist current resume snapshot for MPV continue
                try {
                    if (resumeKey && resumeInfo && typeof resumeInfo.position === 'number') {
                        const title = currentSelectedVideoName || (currentContent?.title || currentContent?.name || '');
                        await fetch(`${API_BASE_URL}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: resumeKey, position: Math.floor(resumeInfo.position || 0), duration: Math.floor(resumeInfo.duration || 0), title }) });
                    }
                } catch (_) { }
                hideResumeModal();
                await openInMPV();
                cleanup();
            };
            const onOver = async () => {
                try { if (resumeKey) await fetch(`${API_BASE_URL}/resume?key=${encodeURIComponent(resumeKey)}`, { method: 'DELETE' }); } catch (_) { }
                resumeInfo = null; // start from 0
                hideResumeModal();
                await openInMPV();
                cleanup();
            };
            const cleanup = () => {
                resumeContinue.removeEventListener('click', onCont);
                resumeStartOver.removeEventListener('click', onOver);
                resumeClose.removeEventListener('click', onClose);
                document.removeEventListener('keydown', onEsc);
            };
            const onClose = () => { hideResumeModal(); cleanup(); };
            const onEsc = (e) => { if (e.key === 'Escape') { hideResumeModal(); cleanup(); } };
            resumeContinue.addEventListener('click', onCont);
            resumeStartOver.addEventListener('click', onOver);
            resumeClose.addEventListener('click', onClose);
            document.addEventListener('keydown', onEsc);
            return;
        }
        await openInMPV();
    }

    openMPVBtn.addEventListener('click', handleOpenMPVClick);
    // Mirror resume prompt flow for VLC
    async function handleOpenVLCClick() {
        let res = resumeInfo;
        if ((!res || typeof res.position !== 'number') && resumeKey) {
            try { res = await fetchResume(resumeKey); } catch (_) { }
        }
        if (res && typeof res.position === 'number' && res.position > 0) {
            resumeInfo = res;
            resumeTimeEl.textContent = formatResumeSeconds(res.position);
            showResumeModal();
            const onCont = async () => {
                try {
                    if (resumeKey && resumeInfo && typeof resumeInfo.position === 'number') {
                        const title = currentSelectedVideoName || (currentContent?.title || currentContent?.name || '');
                        await fetch(`${API_BASE_URL}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: resumeKey, position: Math.floor(resumeInfo.position || 0), duration: Math.floor(resumeInfo.duration || 0), title }) });
                    }
                } catch (_) { }
                hideResumeModal();
                await openInVLC();
                cleanup();
            };
            const onOver = async () => {
                try { if (resumeKey) await fetch(`${API_BASE_URL}/resume?key=${encodeURIComponent(resumeKey)}`, { method: 'DELETE' }); } catch (_) { }
                resumeInfo = null;
                hideResumeModal();
                await openInVLC();
                cleanup();
            };
            const cleanup = () => {
                resumeContinue.removeEventListener('click', onCont);
                resumeStartOver.removeEventListener('click', onOver);
                resumeClose.removeEventListener('click', onClose);
                document.removeEventListener('keydown', onEsc);
            };
            const onClose = () => { hideResumeModal(); cleanup(); };
            const onEsc = (e) => { if (e.key === 'Escape') { hideResumeModal(); cleanup(); } };
            resumeContinue.addEventListener('click', onCont);
            resumeStartOver.addEventListener('click', onOver);
            resumeClose.addEventListener('click', onClose);
            document.addEventListener('keydown', onEsc);
            return;
        }
        await openInVLC();
    }

    // Platform detection - hide VLC buttons on macOS
    let isMacOS = false;
    (async () => {
        try {
            // Use electronAPI shim - may not exist on Android
            if (!window.electronAPI?.invoke) return;
            const platformInfo = await window.electronAPI.invoke('get-platform');
            isMacOS = platformInfo?.isMac || false;
            if (isMacOS) {
                // Hide all VLC buttons on macOS since VLC is not included
                const hideAllVLCButtons = () => {
                    const vlcButtons = document.querySelectorAll('#openVLCBtn, .vlc-nuvio-btn, [class*="vlc"][class*="btn"]');
                    vlcButtons.forEach(btn => {
                        if (btn && btn.textContent && btn.textContent.includes('VLC')) {
                            btn.style.display = 'none';
                        }
                    });
                };
                hideAllVLCButtons();
                // Re-run after DOM updates (for dynamically added buttons)
                setInterval(hideAllVLCButtons, 2000);
                console.log('[Platform] VLC buttons hidden on macOS');
            }
        } catch (err) {
            console.error('[Platform] Failed to get platform info:', err);
        }
    })();

    if (openVLCBtn) openVLCBtn.addEventListener('click', handleOpenVLCClick);
    // Guard against undefined functions
    if (copyStreamBtn && typeof copyStreamUrl === 'function') {
        copyStreamBtn.addEventListener('click', copyStreamUrl);
    }
    if (playNowBtn && typeof handlePlayNowClick === 'function') {
        playNowBtn.addEventListener('click', handlePlayNowClick);
    }

    // Chromecast button (in MPV controls) - uses backend catt
    const castToChromecastBtn = document.getElementById('castToChromecastBtn');
    if (castToChromecastBtn) {
        castToChromecastBtn.addEventListener('click', castMPVToChromecast);
    }

    // Custom Player Controls - guard against undefined elements/functions
    if (playPauseBtn && typeof togglePlayPause === 'function') {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }
    if (rewindBtn && typeof skipTime === 'function') {
        rewindBtn.addEventListener('click', () => skipTime(-10));
    }
    if (forwardBtn && typeof skipTime === 'function') {
        forwardBtn.addEventListener('click', () => skipTime(10));
    }
    if (fullscreenBtn && typeof toggleFullscreen === 'function') {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Cast button (in custom player controls) - uses Google Cast SDK
    const castBtn = document.getElementById('castBtn');
    if (castBtn && typeof castToChromecast === 'function') {
        castBtn.addEventListener('click', castToChromecast);
    }

    if (progressBar && typeof seekVideo === 'function') {
        progressBar.addEventListener('click', seekVideo);
    }
    if (subtitleFile && typeof handleSubtitleUpload === 'function') {
        subtitleFile.addEventListener('change', handleSubtitleUpload);
    }
    // HTML5 audio controls - guard against undefined elements
    if (htmlVolume && customVideo) {
        htmlVolume.addEventListener('input', () => { customVideo.volume = Math.max(0, Math.min(1, Number(htmlVolume.value) / 100)); });
    }
    if (htmlMuteBtn && customVideo) {
        htmlMuteBtn.addEventListener('click', () => { customVideo.muted = !customVideo.muted; htmlMuteBtn.innerHTML = customVideo.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>'; });
    }
    // HTML5 Subtitles menu
    if (htmlSubsBtn && htmlSubsPanel) {
        htmlSubsBtn.addEventListener('click', () => {
            if (htmlSubsPanel.style.display === 'block') htmlSubsPanel.style.display = 'none';
            else {
                htmlSubsPanel.style.display = 'block';
                if (typeof fetchAndRenderHtmlSubs === 'function') fetchAndRenderHtmlSubs();
                if (typeof updateSubtitleControlDisplays === 'function') updateSubtitleControlDisplays();
            }
        });
    }
    if (htmlSubsClose && htmlSubsPanel) {
        htmlSubsClose.addEventListener('click', () => htmlSubsPanel.style.display = 'none');
    }

    // Subtitle customization controls
    if (htmlSubsUploadBtn && subtitleFile) {
        htmlSubsUploadBtn.addEventListener('click', () => subtitleFile.click());
    }

    if (subsSizeInput) {
        subsSizeInput.addEventListener('input', () => {
            subtitleSettings.size = Number(subsSizeInput.value);
            updateSubtitleControlDisplays();
            applySubtitleSettings();
        });
    }

    if (subsColorInput) {
        subsColorInput.addEventListener('input', () => {
            subtitleSettings.color = subsColorInput.value;
            applySubtitleSettings();
        });
    }

    if (subsBackgroundInput) {
        subsBackgroundInput.addEventListener('input', () => {
            subtitleSettings.background = subsBackgroundInput.value;
            applySubtitleSettings();
        });
    }

    if (subsBackgroundOpacityInput) {
        subsBackgroundOpacityInput.addEventListener('input', () => {
            subtitleSettings.backgroundOpacity = Number(subsBackgroundOpacityInput.value);
            updateSubtitleControlDisplays();
            applySubtitleSettings();
        });
    }

    if (subsFontSelect) {
        subsFontSelect.addEventListener('change', () => {
            subtitleSettings.font = subsFontSelect.value;
            applySubtitleSettings();
        });
    }

    // WCJS Controls - guard against undefined elements/functions
    if (closeWcjsPlayer && typeof closeWCJSPlayer === 'function') {
        closeWcjsPlayer.addEventListener('click', closeWCJSPlayer);
    }
    if (wcjsPlayPauseBtn && typeof wcjsTogglePlayPause === 'function') {
        wcjsPlayPauseBtn.addEventListener('click', wcjsTogglePlayPause);
    }
    if (wcjsRewindBtn && typeof wcjsSkipTime === 'function') {
        wcjsRewindBtn.addEventListener('click', () => wcjsSkipTime(-10));
    }
    if (wcjsForwardBtn && typeof wcjsSkipTime === 'function') {
        wcjsForwardBtn.addEventListener('click', () => wcjsSkipTime(10));
    }
    if (wcjsFullscreenBtn && typeof wcjsToggleFullscreen === 'function') {
        wcjsFullscreenBtn.addEventListener('click', wcjsToggleFullscreen);
    }
    if (wcjsProgressBar && typeof wcjsSeek === 'function') {
        wcjsProgressBar.addEventListener('click', wcjsSeek);
    }
    if (wcjsMuteBtn && typeof wcjsToggleMute === 'function') {
        wcjsMuteBtn.addEventListener('click', wcjsToggleMute);
    }
    if (wcjsVolume && typeof wcjsSetVolume === 'function') {
        wcjsVolume.addEventListener('input', wcjsSetVolume);
    }
    if (wcjsSubtitleFile && typeof wcjsHandleSubtitleUpload === 'function') {
        wcjsSubtitleFile.addEventListener('change', wcjsHandleSubtitleUpload);
    }
    if (wcjsSubsBtn && wcjsSubsPanel && wcjsAudioPanel) {
        wcjsSubsBtn.addEventListener('click', () => {
            if (wcjsSubsPanel.style.display === 'block') wcjsSubsPanel.style.display = 'none';
            else { wcjsSubsPanel.style.display = 'block'; wcjsAudioPanel.style.display = 'none'; if (typeof fetchAndRenderSubtitles === 'function') fetchAndRenderSubtitles(); }
        });
    }
    if (wcjsAudioBtn && wcjsAudioPanel && wcjsSubsPanel) {
        wcjsAudioBtn.addEventListener('click', () => {
            if (wcjsAudioPanel.style.display === 'block') wcjsAudioPanel.style.display = 'none';
            else { wcjsAudioPanel.style.display = 'block'; wcjsSubsPanel.style.display = 'none'; if (typeof renderAudioTracks === 'function') renderAudioTracks(); }
        });
    }
    if (wcjsSubsRefresh && typeof fetchAndRenderSubtitles === 'function') {
        wcjsSubsRefresh.addEventListener('click', fetchAndRenderSubtitles);
    }
    if (wcjsSubsClose && wcjsSubsPanel) {
        wcjsSubsClose.addEventListener('click', () => wcjsSubsPanel.style.display = 'none');
    }
    if (wcjsAudioClose && wcjsAudioPanel) {
        wcjsAudioClose.addEventListener('click', () => wcjsAudioPanel.style.display = 'none');
    }

    // Custom video event listeners - guard against undefined elements
    if (customVideo && loadingOverlay) {
        customVideo.addEventListener('loadstart', () => {
            loadingOverlay.style.display = 'flex';
        });

        customVideo.addEventListener('canplay', () => {
            loadingOverlay.style.display = 'none';
        });
    }

    if (customVideo) {
        if (typeof updateProgress === 'function') {
            customVideo.addEventListener('timeupdate', updateProgress);
        }
        if (typeof updateDuration === 'function') {
            customVideo.addEventListener('loadedmetadata', updateDuration);
        }
        customVideo.addEventListener('play', () => {
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';

            // Start Trakt scrobbling when video plays
            if (currentStreamTitle && traktAutoScrobbleToggle && traktAutoScrobbleToggle.checked && typeof parseMediaTitle === 'function' && typeof scrobbleStart === 'function') {
                const progress = customVideo.currentTime / customVideo.duration * 100;
                const { title, type, year, season, episode } = parseMediaTitle(currentStreamTitle);
                scrobbleStart(title, type, year, season, episode, Math.floor(progress));
            }
        });
        customVideo.addEventListener('pause', () => {
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';

            // Pause Trakt scrobbling when video pauses
            if (customVideo.duration && traktScrobbleProgressToggle && traktScrobbleProgressToggle.checked && typeof scrobblePause === 'function') {
                const progress = customVideo.currentTime / customVideo.duration * 100;
                scrobblePause(Math.floor(progress));
            }
        });
        customVideo.addEventListener('ended', () => {
            // Stop Trakt scrobbling when video ends
            if (customVideo.duration && typeof scrobbleStop === 'function') {
                scrobbleStop(100); // 100% watched
            }
        });
    }


    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            closeModal();
        }
    });



    customPlayerContainer.addEventListener('click', (e) => {
        if (e.target === customPlayerContainer) {
            closeCustomPlayer_();
        }
    });


    wcjsPlayerContainer.addEventListener('click', (e) => {
        if (e.target === wcjsPlayerContainer) {
            closeWCJSPlayer();
        }
    });

    // Close settings modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            hideSettingsModal();
        }
    });

    // Category filtering (home)
    document.querySelectorAll('.category').forEach(category => {
        category.addEventListener('click', () => {
            document.querySelectorAll('.category').forEach(c => c.classList.remove('active'));
            category.classList.add('active');
            currentCategory = category.dataset.category;

            // For new UI, check if in search mode
            if (document.body.classList.contains('ui-new')) {
                const slidersContainer = document.getElementById('slidersContainer');
                const heroSection = document.getElementById('heroSection');
                const backBtn = document.getElementById('backToHomeBtn');

                if (isSearchMode) {
                    // Filter search results by category
                    moviesGrid.innerHTML = '';
                    let filteredResults = lastSearchResults;

                    if (currentCategory === 'movie') {
                        filteredResults = lastSearchResults.filter(item => item.media_type === 'movie');
                    } else if (currentCategory === 'tv') {
                        filteredResults = lastSearchResults.filter(item => item.media_type === 'tv');
                    }
                    // 'all' shows everything

                    displayMovies(filteredResults);
                } else if (currentCategory === 'all') {
                    // Show sliders for "All"
                    if (slidersContainer) slidersContainer.style.display = 'block';
                    if (heroSection) heroSection.style.display = 'block';
                    if (backBtn) backBtn.style.display = 'none';
                    moviesGrid.style.display = 'none';
                    moviesGrid.innerHTML = '';
                } else {
                    // Show grid for Movies/TV
                    if (slidersContainer) slidersContainer.style.display = 'none';
                    if (heroSection) heroSection.style.display = 'none';
                    if (backBtn) backBtn.style.display = 'none';
                    moviesGrid.style.display = 'grid';
                    moviesGrid.innerHTML = '';
                    currentPage = 1;
                    loadMovies(currentCategory);
                }
            } else {
                // Old UI behavior
                moviesGrid.innerHTML = '';
                currentPage = 1;
                loadMovies(currentCategory);
            }
        });
    });

    // Toggle buttons on genre details
    toggleMoviesBtn.addEventListener('click', () => {
        if (currentGenreType !== 'movie') {
            setGenreType('movie');
        }
    });
    toggleTVBtn.addEventListener('click', () => {
        if (currentGenreType !== 'tv') {
            setGenreType('tv');
        }
    });

    // Keyboard shortcuts for custom player
    document.addEventListener('keydown', (e) => {
        if (customPlayerContainer.classList.contains('active')) {
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowRight':
                    skipTime(10);
                    break;
                case 'ArrowLeft':
                    skipTime(-10);
                    break;
                case 'KeyF':
                    toggleFullscreen();
                    break;
                case 'Escape':
                    closeCustomPlayer_();
                    break;
            }
        } else if (wcjsPlayerContainer.classList.contains('active')) {
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    wcjsTogglePlayPause();
                    break;
                case 'ArrowRight':
                    wcjsSkipTime(10);
                    break;
                case 'ArrowLeft':
                    wcjsSkipTime(-10);
                    break;
                case 'KeyF':
                    wcjsToggleFullscreen();
                    break;
                case 'Escape':
                    closeWCJSPlayer();
                    break;
            }
        }
    });

    // Logo click handlers - navigate to home
    const sidebarLogo = document.getElementById('sidebarLogo');
    if (sidebarLogo) {
        sidebarLogo.addEventListener('click', () => {
            window.location.href = 'http://localhost:6987';
        });
    }

    // Header logo click (for both OLD and NEW UI)
    const headerLogo = document.querySelector('.logo');
    if (headerLogo) {
        headerLogo.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'http://localhost:6987';
        });
    }

    // Sidebar navigation for new UI
    const sidebarNavItems = document.querySelectorAll('.nav-item[data-page]');
    sidebarNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            sidebarNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            if (page === 'home') {
                showHomePage();
            } else if (page === 'genres') {
                showGenresPage();
            } else if (page === 'my-list') {
                showMyListPage();
            } else if (page === 'done-watching') {
                showDoneWatchingPage();
            } else if (page === 'trakt') {
                showTraktPage();
            } else if (page === 'livetv') {
                showLiveTvPage();
            } else if (page === 'iptv') {
                showIptvPage();
            } else if (page === 'games-downloader') {
                showGamesDownloaderPage();
            } else if (page === 'minigames') {
                showMiniGamesPage();
            } else if (page === 'books') {
                showBooksPage();
            } else if (page === 'audiobooks') {
                showAudioBooksPage();
            } else if (page === 'music') {
                showMusicPage();
            } else if (page === 'booktorrio') {
                showBookTorrioPage();
            } else if (page === 'anime') {
                showAnimePage();
            } else if (page === 'comics') {
                showComicsPage();
            } else if (page === 'manga') {
                showMangaPage();
            } else if (page === 'downloader') {
                showDownloaderPage();
            }
        });
    });

    // Custom Magnet button (separate from data-page navigation)
    const customMagnetNavBtn = document.getElementById('customMagnetBtn');
    const customMagnetModalElem = document.getElementById('custom-magnet-modal');
    const customMagnetInputElem = document.getElementById('custom-magnet-input');
    if (customMagnetNavBtn && customMagnetModalElem) {
        customMagnetNavBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Custom Magnet nav button clicked!');
            customMagnetModalElem.style.display = 'flex';
            if (customMagnetInputElem) {
                customMagnetInputElem.value = '';
                setTimeout(() => customMagnetInputElem.focus(), 100);
            }
        });
    }

    // Sidebar clear cache
    const sidebarClearCache = document.getElementById('sidebarClearCache');
    if (sidebarClearCache) {
        sidebarClearCache.addEventListener('click', async () => {
            const result = await window.electronAPI.clearCache();
            showNotification(result.message, result.success ? 'success' : 'error');
        });
    }

    // Sidebar settings
    const sidebarSettings = document.getElementById('sidebarSettings');
    if (sidebarSettings) {
        sidebarSettings.addEventListener('click', showSettingsModal);
    }

    // Floating navigation (Old UI)
    const floatingNavContainer = document.getElementById('floatingNavContainer');
    const floatingNavBtn = document.getElementById('floatingNavBtn');
    const floatingNavMenu = document.getElementById('floatingNavMenu');

    if (floatingNavBtn) {
        floatingNavBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            floatingNavContainer.classList.toggle('active');
        });
    }

    // Handle floating nav menu item clicks
    if (floatingNavMenu) {
        floatingNavMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.floating-nav-item');
            if (item) {
                const action = item.getAttribute('data-action');
                floatingNavContainer.classList.remove('active');

                switch (action) {
                    case 'settings':
                        showSettingsModal();
                        break;
                    case 'home':
                        showHomePage();
                        break;
                    case 'genres':
                        showGenresPage();
                        break;
                    case 'my-list':
                        showMyListPage();
                        break;
                    case 'done-watching':
                        showDoneWatchingPage();
                        break;
                    case 'livetv':
                        showLiveTvPage();
                        break;
                    case 'iptv':
                        showIptvPage();
                        break;
                    case 'games-downloader':
                        showGamesDownloaderPage();
                        break;
                    case 'minigames':
                        showMiniGamesPage();
                        break;
                    case 'music':
                        showMusicPage();
                        break;
                    case 'books':
                        showBooksPage();
                        break;
                    case 'audiobooks':
                        showAudioBooksPage();
                        break;
                    case 'booktorrio':
                        showBookTorrioPage();
                        break;
                    case 'anime':
                        showAnimePage();
                        break;
                    case 'comics':
                        showComicsPage();
                        break;
                    case 'manga':
                        showMangaPage();
                        break;
                    case 'downloader':
                        showDownloaderPage();
                        break;
                    case 'trakt':
                        showTraktPage();
                        break;
                }
            }
        });
    }

    // Close floating nav when clicking outside
    document.addEventListener('click', (e) => {
        if (floatingNavContainer && !floatingNavContainer.contains(e.target)) {
            floatingNavContainer.classList.remove('active');
        }
    });

    // Books Functionality
    let booksSearchResults = [];

    // Books search input and button
    const booksSearchInput = document.getElementById('books-search-input');
    const booksSearchBtn = document.getElementById('books-search-btn');
    const booksLoading = document.getElementById('books-loading');
    const booksEmpty = document.getElementById('books-empty');
    const booksResults = document.getElementById('books-results');
    const booksResultsGrid = document.getElementById('books-results-grid');
    const booksResultsTitle = document.getElementById('books-results-title');
    const booksResultsCount = document.getElementById('books-results-count');

    // Books reader modal
    const booksReaderModal = document.getElementById('books-reader-modal');
    const booksReaderBack = document.getElementById('books-reader-back');
    const booksReaderTitle = document.getElementById('books-reader-title');
    const booksReaderFrame = document.getElementById('books-reader-frame');

    // Search functionality
    async function searchBooks(query) {
        if (!query || query.trim().length === 0) {
            showNotification('Please enter a search term', 'warning');
            return;
        }

        const searchTerm = query.trim();
        console.log('[BOOKS] Searching for:', searchTerm);

        // Show loading state
        booksEmpty.style.display = 'none';
        booksResults.style.display = 'none';
        booksLoading.style.display = 'block';

        try {
            const encodedQuery = encodeURIComponent(searchTerm);
            // Resolve Books server base URL dynamically from main process (port may vary)
            let booksBase = 'http://localhost:6987/zlib';
            try {
                if (window.electronAPI?.booksGetUrl) {
                    const r = await window.electronAPI.booksGetUrl();
                    if (r?.success && r?.url) booksBase = r.url;
                }
            } catch (_) { }
            const response = await fetch(`${booksBase}/search/${encodedQuery}`);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            console.log('[BOOKS] Search results:', data);

            booksLoading.style.display = 'none';

            if (data.results && data.results.length > 0) {
                booksSearchResults = data.results;
                displayBooksResults(data.results, searchTerm);
                showNotification(`Found ${data.results.length} books`, 'success');
            } else {
                booksResults.style.display = 'none';
                booksEmpty.style.display = 'block';
                booksEmpty.innerHTML = `
                            <div class="books-empty-icon">
                                <i class="fas fa-search"></i>
                            </div>
                            <h3>No Books Found</h3>
                            <p>No results found for "${searchTerm}". Try a different search term.</p>
                        `;
                showNotification('No books found for your search', 'info');
            }
        } catch (error) {
            console.error('[BOOKS] Search error:', error);
            booksLoading.style.display = 'none';
            booksResults.style.display = 'none';
            booksEmpty.style.display = 'block';

            // Show more detailed error message
            const errorMsg = error.message || 'Unknown error';
            const isConnectionError = errorMsg.includes('Unable to connect') || errorMsg.includes('503');

            booksEmpty.innerHTML = `
                        <div class="books-empty-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3>Search Error</h3>
                        <p>${isConnectionError ?
                    'Z-Library servers are currently unreachable. This may be due to ISP blocking or regional restrictions.' :
                    'Failed to search books. Please check your connection and try again.'
                }</p>
                        ${isConnectionError ? '<p style="font-size: 0.9em; opacity: 0.7; margin-top: 0.5rem;">💡 Tip: Try using a VPN if Z-Library is blocked in your region.</p>' : ''}
                        <p style="font-size: 0.85em; opacity: 0.6; margin-top: 1rem;">Error: ${errorMsg}</p>
                    `;
            showNotification(isConnectionError ? 'Z-Library unreachable - try VPN' : 'Failed to search books', 'error');
        }
    }

    function displayBooksResults(books, query) {
        booksResultsTitle.textContent = `Search Results for "${query}"`;
        booksResultsCount.textContent = `${books.length} book${books.length !== 1 ? 's' : ''} found`;

        booksResultsGrid.innerHTML = '';

        books.forEach(book => {
            const bookCard = document.createElement('div');
            bookCard.className = 'books-book-card';

            bookCard.innerHTML = `
                        <div class="books-book-cover">
                            <img loading="lazy" src="${book.photo}" alt="${book.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="books-book-cover-placeholder" style="display: none;">
                                <i class="fas fa-book"></i>
                            </div>
                            <div class="books-book-format">${book.format}</div>
                        </div>
                        <div class="books-book-info">
                            <h3 class="books-book-title">${book.title}</h3>
                            <p class="books-book-author">by ${book.author}</p>
                            ${book.year ? `<span class="books-book-year">${book.year}</span>` : ''}
                            <div class="books-book-actions">
                                <button class="books-read-btn" data-read-link="${book.readLink}" data-title="${book.title}">
                                    <i class="fas fa-book-open"></i>
                                    Read Now
                                </button>
                                <button class="books-download-btn" data-book-url="${book.bookUrl}" title="View on Z-Library">
                                    <i class="fas fa-external-link-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;

            booksResultsGrid.appendChild(bookCard);
        });

        // Add event listeners to Read Now buttons
        const readButtons = booksResultsGrid.querySelectorAll('.books-read-btn');
        readButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const readLink = e.currentTarget.getAttribute('data-read-link');
                const title = e.currentTarget.getAttribute('data-title');
                // Open in default browser instead of iframe
                if (readLink && window.electronAPI?.openExternal) {
                    console.log('[BOOKS] Opening book reader in browser:', title, readLink);
                    window.electronAPI.openExternal(readLink);
                    showNotification(`Opening "${title}" in browser...`, 'success');
                }
            });
        });

        // Add event listeners to download buttons
        const downloadButtons = booksResultsGrid.querySelectorAll('.books-download-btn');
        downloadButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bookUrl = e.currentTarget.getAttribute('data-book-url');
                if (bookUrl) {
                    window.electronAPI.openExternal(bookUrl);
                }
            });
        });

        booksEmpty.style.display = 'none';
        booksResults.style.display = 'block';
    }

    // Music Functionality
    let musicResultsCache = [];
    const musicSearchInput = document.getElementById('music-search-input');
    const musicSearchBtn = document.getElementById('music-search-btn');
    const musicLoading = document.getElementById('music-loading');
    const musicEmpty = document.getElementById('music-empty');
    const musicResults = document.getElementById('music-results');
    const musicResultsGrid = document.getElementById('music-results-grid');
    const musicResultsCount = document.getElementById('music-results-count');
    const musicResultsTitle = document.getElementById('music-results-title');

    const musicModal = document.getElementById('music-player-modal');
    const musicModalBack = document.getElementById('music-player-back');
    const musicModalMinimize = document.getElementById('music-player-minimize');
    const musicModalTitle = document.getElementById('music-player-title');
    const musicSongTitle = document.getElementById('music-player-song-title');
    const musicArtist = document.getElementById('music-player-artist');
    const musicCover = document.getElementById('music-player-cover');
    const musicAudio = document.getElementById('music-player-audio');
    const musicPlayPauseBtn = document.getElementById('music-play-pause-btn');
    const musicBackwardBtn = document.getElementById('music-backward-btn');
    const musicForwardBtn = document.getElementById('music-forward-btn');
    const musicPrevTrackBtn = document.getElementById('music-prev-track-btn');
    const musicNextTrackBtn = document.getElementById('music-next-track-btn');
    const musicProgressBar = document.getElementById('music-progress-bar');
    const musicProgressFill = document.getElementById('music-progress-fill');
    const musicCurrentTime = document.getElementById('music-current-time');
    const musicTotalTime = document.getElementById('music-total-time');
    const musicVolumeSlider = document.getElementById('music-volume-slider');
    const musicVolumeFill = document.getElementById('music-volume-fill');
    const musicAutoplayToggle = document.getElementById('music-autoplay-toggle');

    // Mini player elements
    const miniPlayer = document.getElementById('music-mini-player');
    const miniPlayerMaximize = document.getElementById('music-player-maximize');
    const miniPlayerSongTitle = document.getElementById('mini-player-song-title');
    const miniPlayerArtist = document.getElementById('mini-player-artist');
    const miniPlayPauseBtn = document.getElementById('mini-play-pause-btn');
    const miniBackwardBtn = document.getElementById('mini-backward-btn');
    const miniForwardBtn = document.getElementById('mini-forward-btn');
    const miniPrevTrackBtn = document.getElementById('mini-prev-track-btn');
    const miniNextTrackBtn = document.getElementById('mini-next-track-btn');
    const miniProgressBar = document.getElementById('mini-progress-bar');
    const miniProgressFill = document.getElementById('mini-progress-fill');
    const miniCurrentTime = document.getElementById('mini-current-time');
    const miniTotalTime = document.getElementById('mini-total-time');
    // Playlist chooser modal refs
    const playlistChooser = document.getElementById('music-playlist-chooser');
    const playlistChooserBack = document.getElementById('playlist-chooser-back');
    const playlistChooserList = document.getElementById('playlist-chooser-list');
    const playlistChooserEmpty = document.getElementById('playlist-chooser-empty');
    const playlistChooserNewName = document.getElementById('playlist-chooser-new-name');
    const playlistChooserCreate = document.getElementById('playlist-chooser-create');
    let playlistChooserTrack = null;

    // Music providers (fallback order)


    function tidalCoverUrl(cover) {
        if (!cover) return '';
        try {
            return `https://resources.tidal.com/images/${cover.replace(/-/g, '/')}/320x320.jpg`;
        } catch (_) {
            return '';
        }
    }

    function fmtTime(sec) {
        if (!isFinite(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    async function searchMusic(query) {
        if (!query || !query.trim()) {
            showNotification('Please enter a search term', 'warning');
            return;
        }

        const q = query.trim();
        musicEmpty.style.display = 'none';
        musicResults.style.display = 'none';
        musicLoading.style.display = 'block';

        try {
            const results = await MusicService.searchMusic(q);
            musicLoading.style.display = 'none';

            if (!results || !results.length) {
                musicResults.style.display = 'none';
                musicEmpty.style.display = 'block';
                musicEmpty.innerHTML = `
                            <div class="books-empty-icon"><i class="fas fa-search"></i></div>
                            <h3>No Music Found</h3>
                            <p>No results found for "${q}". Try a different search.</p>
                        `;
                showNotification('No music found for your search', 'info');
                return;
            }

            musicResultsCache = results;
            displayMusicResults(results, q);
            showNotification(`Found ${results.length} items`, 'success');
        } catch (e) {
            console.error('[MUSIC] Search error', e);
            musicLoading.style.display = 'none';
            musicResults.style.display = 'none';
            musicEmpty.style.display = 'block';
            musicEmpty.innerHTML = `
                        <div class="books-empty-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <h3>Search Error</h3>
                        <p>Failed to search music. Please try again.</p>
                    `;
            showNotification('Failed to search music', 'error');
        }
    }

    function displayMusicResults(results, q) {
        // Store results for re-rendering after download
        window.currentMusicResults = results;
        window.currentMusicQuery = q;

        musicResultsTitle.textContent = `Search Results for "${q}"`;
        musicResultsCount.textContent = `${results.length} item${results.length !== 1 ? 's' : ''} found`;
        // Ensure we are not in playlist-open mode when showing generic results
        const musicPage = document.getElementById('music-page');
        if (musicPage) musicPage.classList.remove('playlist-open');
        // Hide My Albums and Album View when showing generic results
        const myAlbumsSec = document.getElementById('my-albums');
        if (myAlbumsSec) myAlbumsSec.style.display = 'none';
        const albumViewSec = document.getElementById('music-album-view');
        if (albumViewSec) albumViewSec.style.display = 'none';
        musicResultsGrid.innerHTML = '';

        // Store for building a queue from search results
        const currentSearchTracks = [];
        results.forEach(item => {
            const trackId = item.id || item.trackId || item.itemId;
            const title = item.title || item.trackTitle || 'Unknown Title';
            const artistName = (item.artist && (item.artist.name || item.artist)) || (item.artists && item.artists[0]?.name) || 'Unknown Artist';
            const cover = item.album?.cover || item.cover || item.albumCover || '';
            const img = tidalCoverUrl(cover) || 'https://via.placeholder.com/320x320?text=Music';
            if (trackId) currentSearchTracks.push({ id: String(trackId), title, artist: artistName, cover: img });

            const card = document.createElement('div');
            card.className = 'music-card';
            const isSaved = getMyMusic().some(x => x.id == trackId);
            const isDownloaded = isTrackDownloaded(trackId);
            card.innerHTML = `
                        <div class="music-cover">
                            <img loading="lazy" src="${img}" alt="${title}">
                        </div>
                        <div class="music-info">
                            <div class="music-title">${title}</div>
                            <div class="music-artist">${artistName}</div>
                            <div class="music-actions">
                                <button class="music-play-btn" data-id="${trackId}" data-title="${title.replace(/\"/g, '&quot;')}" data-artist="${artistName.replace(/\"/g, '&quot;')}" data-cover="${img}"><i class="fas fa-play"></i> Play</button>
                                <button class="music-heart-btn ${isSaved ? 'added' : ''}" title="${isSaved ? 'In My Music' : 'Add to My Music'}" data-id="${trackId}" data-title="${title.replace(/\"/g, '&quot;')}" data-artist="${artistName.replace(/\"/g, '&quot;')}" data-cover="${img}"><i class="fas ${isSaved ? 'fa-heart' : 'fa-heart'}"></i></button>
                                <button class="music-plus-btn" title="Add to Playlist" data-id="${trackId}" data-title="${title.replace(/\"/g, '&quot;')}" data-artist="${artistName.replace(/\"/g, '&quot;')}" data-cover="${img}"><i class="fas fa-plus"></i></button>
                                ${isDownloaded ?
                    `<button class="music-download-btn downloaded" title="Downloaded" data-id="${trackId}" data-title="${title.replace(/\"/g, '&quot;')}" data-artist="${artistName.replace(/\"/g, '&quot;')}" data-cover="${img}"><i class="fas fa-check-circle"></i></button>` :
                    `<button class="music-download-btn" title="Download" data-id="${trackId}" data-title="${title.replace(/\"/g, '&quot;')}" data-artist="${artistName.replace(/\"/g, '&quot;')}" data-cover="${img}"><i class="fas fa-download"></i></button>`
                }
                            </div>
                        </div>
                    `;
            musicResultsGrid.appendChild(card);
        });

        // Wire up buttons
        musicResultsGrid.querySelectorAll('.music-play-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const trackId = String(e.currentTarget.getAttribute('data-id'));
                const idx = currentSearchTracks.findIndex(t => String(t.id) === trackId);
                if (idx >= 0) {
                    setPlayQueue(currentSearchTracks, idx);
                } else {
                    const card = e.currentTarget.closest('.music-card');
                    const title = card.querySelector('.music-title')?.textContent || 'Unknown Title';
                    const artistName = card.querySelector('.music-artist')?.textContent || 'Unknown Artist';
                    const coverSrc = card.querySelector('img')?.src || '';
                    await playMusicTrack({ trackId, title, artistName, coverSrc });
                }
            });
        });

        // Heart (My Music)
        musicResultsGrid.querySelectorAll('.music-heart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget;
                const saved = getMyMusic();
                const track = {
                    id: el.getAttribute('data-id'),
                    title: el.getAttribute('data-title'),
                    artist: el.getAttribute('data-artist'),
                    cover: el.getAttribute('data-cover')
                };
                if (!saved.find(x => x.id === track.id)) {
                    saved.push(track);
                    setMyMusic(saved);
                    showNotification(`Saved "${track.title}" to My Music`, 'success');
                    el.classList.add('added');
                    el.title = 'In My Music';
                } else {
                    showNotification('Already in My Music', 'info');
                }
            });
        });

        // Add to playlist
        musicResultsGrid.querySelectorAll('.music-plus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget;
                const track = {
                    id: el.getAttribute('data-id'),
                    title: el.getAttribute('data-title'),
                    artist: el.getAttribute('data-artist'),
                    cover: el.getAttribute('data-cover')
                };
                showPlaylistChooser(track);
            });
        });

        // Download music
        musicResultsGrid.querySelectorAll('.music-download-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                // Prevent concurrent downloads: if one is in progress, show notice and do nothing
                if (currentDownloadId || currentDownloadController) {
                    showNotification('Please wait for the current download to finish', 'info');
                    return;
                }
                const el = e.currentTarget;
                const trackId = el.getAttribute('data-id');
                const title = el.getAttribute('data-title');
                const artist = el.getAttribute('data-artist');
                const cover = el.getAttribute('data-cover');

                if (isTrackDownloaded(trackId)) {
                    showNotification('Track already downloaded', 'info');
                    return;
                }

                await downloadMusicTrack(trackId, title, artist, cover);
            });
        });



        musicEmpty.style.display = 'none';
        musicResults.style.display = 'block';
    }

    // ===== Albums Search & View =====
    const albumSearchBtn = document.getElementById('music-album-search-btn');
    const albumsSection = document.getElementById('music-albums');
    const albumsGrid = document.getElementById('music-albums-grid');
    const albumsCount = document.getElementById('music-albums-count');
    const albumView = document.getElementById('music-album-view');
    const albumCloseBtn = document.getElementById('album-close-btn');
    const albumTracksEl = document.getElementById('album-tracks');
    const albumViewTitle = document.getElementById('album-view-title');
    const albumViewMeta = document.getElementById('album-view-meta');
    const albumViewCover = document.getElementById('album-view-cover');

    function setMusicSectionVisible(section) {
        const sections = ['music-results', 'my-music', 'music-playlists', 'music-albums', 'music-album-view'];
        const empty = document.getElementById('music-empty');
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        if (empty) empty.style.display = 'none';
        const musicPage = document.getElementById('music-page');
        if (musicPage) musicPage.classList.remove('playlist-open');
        if (section === 'results') document.getElementById('music-results').style.display = '';
        if (section === 'my-music') document.getElementById('my-music').style.display = '';
        if (section === 'music-playlists') document.getElementById('music-playlists').style.display = '';
        if (section === 'albums') document.getElementById('music-albums').style.display = '';
        if (section === 'album-view') document.getElementById('music-album-view').style.display = '';
        if (section === 'my-albums') document.getElementById('my-albums').style.display = '';
    }

    async function searchAlbums(query) {
        if (!query || !query.trim()) {
            showNotification('Please enter an album search term', 'warning');
            return;
        }
        setMusicSectionVisible('albums');
        albumsGrid.innerHTML = '';
        albumsCount.textContent = 'Searching…';
        try {
            const data = await musicFetchJson(`/search/?al=${encodeURIComponent(query.trim())}`);
            const albums = (data && data.albums && Array.isArray(data.albums.items)) ? data.albums.items : [];
            renderAlbumResults(albums);
        } catch (e) {
            console.error('[MUSIC] Album search error', e);
            albumsCount.textContent = 'Error searching albums';
        }
    }

    function renderAlbumResults(albums) {
        albumsGrid.innerHTML = '';
        albumsCount.textContent = `${albums.length} album${albums.length === 1 ? '' : 's'}`;
        if (!albums.length) {
            albumsGrid.innerHTML = '<div class="album-empty">No albums found.</div>';
            return;
        }
        albums.forEach(a => {
            const artistName = (a.artists && a.artists[0]?.name) ? a.artists[0].name : 'Unknown Artist';
            const coverUrl = a.cover ? tidalCoverUrl(a.cover) : '';
            const card = document.createElement('div');
            card.className = 'album-card';
            const saved = getMyAlbums().some(x => String(x.id) === String(a.id));
            card.innerHTML = `
                        <img loading="lazy" class="album-cover" src="${coverUrl}" alt="${a.title}">
                        <div class="album-body">
                            <div class="album-title">${a.title}</div>
                            <div class="album-artist">${artistName}</div>
                            <div class="album-meta">
                                <span>${a.type || 'ALBUM'}</span>
                                <span>·</span>
                                <span>${a.numberOfTracks || 0} tracks</span>
                                ${a.releaseDate ? `<span>·</span><span>${a.releaseDate}</span>` : ''}
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="album-open-btn"><i class="fas fa-folder-open"></i> Open</button>
                                <button class="album-heart-btn ${saved ? 'added' : ''}" title="${saved ? 'In My Albums' : 'Save Album'}"><i class="fas fa-heart"></i></button>
                            </div>
                        </div>`;
            card.querySelector('.album-open-btn').addEventListener('click', () => openAlbum(a));
            card.querySelector('.album-heart-btn').addEventListener('click', () => saveAlbum(a, card.querySelector('.album-heart-btn')));
            albumsGrid.appendChild(card);
        });
    }

    // Store current album tracks for Play All functionality
    let currentAlbumTracks = [];

    async function openAlbum(albumFromSearch) {
        try {
            setMusicSectionVisible('album-view');
            albumTracksEl.innerHTML = '<div class="album-empty">Loading tracks…</div>';
            currentAlbumTracks = []; // Clear previous album data

            const json = await musicFetchJson(`/album/?id=${encodeURIComponent(albumFromSearch.id)}`);

            // API shape per example: [ albumMeta, { limit, offset, totalNumberOfItems, items: [{ item: {track}, type: 'track' }, ...] } ]
            let albumMeta = null;
            let tracks = [];
            if (Array.isArray(json)) {
                albumMeta = json[0] || null;
                const items = json[1]?.items || [];
                tracks = items.map(x => x?.item).filter(Boolean);
            } else if (Array.isArray(json?.tracks)) {
                // fallback shape support
                tracks = json.tracks;
                albumMeta = albumFromSearch || null;
            } else {
                albumMeta = albumFromSearch || null;
            }

            // Header info using albumMeta when available
            const title = albumMeta?.title || albumFromSearch?.title || 'Album';
            const artistName = albumMeta?.artist?.name || (albumMeta?.artists && albumMeta.artists[0]?.name) || (albumFromSearch?.artists && albumFromSearch.artists[0]?.name) || 'Unknown Artist';
            const numTracks = albumMeta?.numberOfTracks ?? albumFromSearch?.numberOfTracks ?? (Array.isArray(tracks) ? tracks.length : 0);
            const releaseDate = albumMeta?.releaseDate || albumFromSearch?.releaseDate || '';
            const coverId = albumMeta?.cover || albumFromSearch?.cover || '';

            albumViewTitle.textContent = title;
            albumViewMeta.textContent = `${artistName} · ${numTracks} tracks${releaseDate ? ' · ' + releaseDate : ''}`;
            albumViewCover.src = coverId ? tidalCoverUrl(coverId) : '';

            // Store tracks for Play All before rendering
            const coverSrc = coverId ? tidalCoverUrl(coverId) : '';
            currentAlbumTracks = tracks.map((t, idx) => {
                const trackId = t.id || t.trackNumber || idx + 1;
                const trackTitle = t.title || t.name || `Track ${idx + 1}`;
                const trackArtist = (t.artists && t.artists[0]?.name) ? t.artists[0].name : artistName;
                return {
                    id: trackId,
                    title: trackTitle,
                    artist: trackArtist,
                    cover: coverSrc
                };
            }).filter(t => t.id); // Only tracks with valid IDs

            renderAlbumTracks(tracks, { artists: [{ name: artistName }], cover: coverId });
        } catch (e) {
            console.error('[MUSIC] openAlbum error', e);
            albumTracksEl.innerHTML = '<div class="album-empty">Failed to load album.</div>';
            currentAlbumTracks = []; // Clear on error
        }
    }

    function renderAlbumTracks(tracks, album) {
        if (!tracks.length) {
            albumTracksEl.innerHTML = '<div class="album-empty">No tracks found in this album.</div>';
            return;
        }
        albumTracksEl.innerHTML = '';
        const coverSrc = album.cover ? tidalCoverUrl(album.cover) : '';
        tracks.forEach((t, idx) => {
            const trackId = t.id || t.trackNumber || idx + 1; // prefer real id
            const trackTitle = t.title || t.name || `Track ${idx + 1}`;
            const artistName = (t.artists && t.artists[0]?.name) ? t.artists[0].name : ((album.artists && album.artists[0]?.name) ? album.artists[0].name : 'Unknown Artist');
            const durationSec = (typeof t.duration === 'number') ? t.duration : (t.durationMs ? Math.round(t.durationMs / 1000) : 0);

            const isDownloaded = isTrackDownloaded(trackId);
            const downloadBtnClass = isDownloaded ? 'track-download-btn downloaded' : 'track-download-btn';
            const downloadBtnIcon = isDownloaded ? 'fas fa-check-circle' : 'fas fa-download';
            const downloadBtnTitle = isDownloaded ? 'Downloaded' : 'Download';

            const row = document.createElement('div');
            row.className = 'track-row';
            row.innerHTML = `
                        <div class="track-index">${idx + 1}</div>
                        <div class="track-title">${trackTitle} <span style="color:#94a3b8; font-weight:600;">· ${artistName}</span></div>
                        <div class="track-duration">${fmtTime(durationSec)}</div>
                        <div class="track-actions">
                            <button class="track-play-btn"><i class="fas fa-play"></i> Play</button>
                            <button class="${downloadBtnClass}" title="${downloadBtnTitle}" data-id="${trackId}" data-title="${trackTitle.replace(/\"/g, '&quot;')}" data-artist="${artistName.replace(/\"/g, '&quot;')}" data-cover="${coverSrc}"><i class="${downloadBtnIcon}"></i> Download</button>
                            <button class="track-plus-btn"><i class="fas fa-plus"></i> Playlist</button>
                            <button class="track-heart-btn"><i class="fas fa-heart"></i> Save</button>
                        </div>`;

            row.querySelector('.track-play-btn').addEventListener('click', () => {
                if (!t.id) { showNotification('Unable to play: missing track id', 'error'); return; }
                // Use the prebuilt album queue so next/prev works
                const idx = currentAlbumTracks.findIndex(x => String(x.id) === String(t.id));
                if (idx >= 0) {
                    setPlayQueue(currentAlbumTracks, idx);
                } else {
                    playMusicTrack({ trackId: t.id, title: trackTitle, artistName, coverSrc });
                }
            });
            row.querySelector('.track-download-btn').addEventListener('click', async () => {
                if (!t.id) { showNotification('Unable to download: missing track id', 'error'); return; }
                if (isTrackDownloaded(trackId)) {
                    showNotification('Track already downloaded', 'info');
                    return;
                }
                await downloadMusicTrack(trackId, trackTitle, artistName, coverSrc);
                // Re-render to update button state
                renderAlbumTracks(tracks, album);
            });
            row.querySelector('.track-plus-btn').addEventListener('click', () => {
                if (!t.id) { showNotification('Unable to add: missing track id', 'error'); return; }
                showPlaylistChooser({ id: String(t.id), title: trackTitle, artist: artistName, cover: coverSrc });
            });
            row.querySelector('.track-heart-btn').addEventListener('click', () => {
                if (!t.id) { showNotification('Unable to save: missing track id', 'error'); return; }
                const list = getMyMusic();
                if (!list.find(x => String(x.id) === String(t.id))) {
                    list.push({ id: String(t.id), title: trackTitle, artist: artistName, cover: coverSrc });
                    setMyMusic(list);
                    showNotification(`Saved "${trackTitle}" to My Music`, 'success');
                } else {
                    showNotification('Already in My Music', 'info');
                }
            });

            albumTracksEl.appendChild(row);
        });
    }

    if (albumSearchBtn) {
        albumSearchBtn.addEventListener('click', () => searchAlbums(musicSearchInput?.value || ''));
    }
    if (albumCloseBtn) {
        albumCloseBtn.addEventListener('click', () => {
            // If albums list has content, go back there; else back to generic state
            if (albumsGrid && albumsGrid.children.length) setMusicSectionVisible('albums');
            else if (musicResultsGrid && musicResultsGrid.children.length) setMusicSectionVisible('results');
            else setMusicSectionVisible('results');
        });
    }

    // Play All button handlers
    const albumPlayAllBtn = document.getElementById('album-play-all-btn');
    if (albumPlayAllBtn) {
        albumPlayAllBtn.addEventListener('click', () => {
            // Use stored album tracks instead of querying DOM
            if (currentAlbumTracks.length === 0) {
                showNotification('No tracks to play', 'info');
                return;
            }
            playAllTracks(currentAlbumTracks);
        });
    }

    // Save All to Playlist (Album view)
    const albumSaveAllBtn = document.getElementById('album-save-all-btn');
    if (albumSaveAllBtn) {
        albumSaveAllBtn.addEventListener('click', () => {
            if (!currentAlbumTracks || currentAlbumTracks.length === 0) {
                showNotification('No tracks to save', 'info');
                return;
            }
            // Open playlist chooser with entire album track list
            showPlaylistChooser([...currentAlbumTracks]);
        });
    }

    // Shuffle (Album view)
    const albumShuffleBtn = document.getElementById('album-shuffle-btn');
    if (albumShuffleBtn) {
        albumShuffleBtn.addEventListener('click', () => {
            if (!currentAlbumTracks || currentAlbumTracks.length === 0) {
                showNotification('No tracks to shuffle', 'info');
                return;
            }
            const shuffled = [...currentAlbumTracks];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            playAllTracks(shuffled);
        });
    }

    const myMusicPlayAllBtn = document.getElementById('my-music-play-all-btn');
    if (myMusicPlayAllBtn) {
        myMusicPlayAllBtn.addEventListener('click', () => {
            const tracks = getMyMusic();
            if (tracks.length === 0) {
                showNotification('No tracks in My Music', 'info');
                return;
            }
            playAllTracks(tracks);
        });
    }

    // Shuffle (My Music)
    const myMusicShuffleBtn = document.getElementById('my-music-shuffle-btn');
    if (myMusicShuffleBtn) {
        myMusicShuffleBtn.addEventListener('click', () => {
            const tracks = getMyMusic();
            if (!tracks || tracks.length === 0) {
                showNotification('No tracks in My Music', 'info');
                return;
            }
            const shuffled = [...tracks];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            playAllTracks(shuffled);
        });
    }

    // ===== My Albums storage and rendering =====
    const MY_ALBUMS_KEY = 'pt_my_albums_v1';
    function getMyAlbums() {
        try { return JSON.parse(localStorage.getItem(MY_ALBUMS_KEY) || '[]'); } catch (_) { return []; }
    }
    function setMyAlbums(arr) {
        try { localStorage.setItem(MY_ALBUMS_KEY, JSON.stringify(arr)); } catch (_) { }
    }
    function saveAlbum(album, btnEl) {
        const list = getMyAlbums();
        const exists = list.find(x => String(x.id) === String(album.id));
        if (exists) {
            showNotification('Album already saved', 'info');
            if (btnEl) btnEl.classList.add('added');
            return;
        }
        const toSave = {
            id: album.id,
            title: album.title,
            cover: album.cover || null,
            artist: (album.artist?.name) || (album.artists && album.artists[0]?.name) || 'Unknown Artist',
            numberOfTracks: album.numberOfTracks || 0,
            releaseDate: album.releaseDate || ''
        };
        list.push(toSave);
        setMyAlbums(list);
        showNotification(`Saved "${toSave.title}" to My Albums`, 'success');
        if (btnEl) btnEl.classList.add('added');
    }

    function renderMyAlbums() {
        const grid = document.getElementById('my-albums-grid');
        const count = document.getElementById('my-albums-count');
        const empty = document.getElementById('my-albums-empty');
        const albums = getMyAlbums();
        grid.innerHTML = '';
        if (!albums.length) {
            count.textContent = '0 albums';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        count.textContent = `${albums.length} album${albums.length === 1 ? '' : 's'}`;
        albums.forEach(a => {
            const card = document.createElement('div');
            card.className = 'album-card';
            const coverUrl = a.cover ? tidalCoverUrl(a.cover) : '';
            card.innerHTML = `
                        <img loading="lazy" class="album-cover" src="${coverUrl}" alt="${a.title}">
                        <div class="album-body">
                            <div class="album-title">${a.title}</div>
                            <div class="album-artist">${a.artist || ''}</div>
                            <div class="album-meta"><span>${a.numberOfTracks || 0} tracks</span>${a.releaseDate ? `<span>·</span><span>${a.releaseDate}</span>` : ''}</div>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="album-open-btn" data-id="${a.id}"><i class="fas fa-folder-open"></i> Open</button>
                                <button class="album-heart-btn added" title="Remove from My Albums" data-remove="true" data-id="${a.id}"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
            grid.appendChild(card);
        });
        // Wire open and remove
        grid.querySelectorAll('.album-open-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const album = getMyAlbums().find(x => String(x.id) === String(id));
                if (album) openAlbum(album);
            });
        });
        grid.querySelectorAll('.album-heart-btn[data-remove="true"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const list = getMyAlbums().filter(x => String(x.id) !== String(id));
                setMyAlbums(list);
                renderMyAlbums();
                showNotification('Removed album', 'info');
            });
        });
    }

    // Toggle My Albums
    const myAlbumsBtn = document.getElementById('music-my-albums-btn');
    if (myAlbumsBtn) {
        myAlbumsBtn.addEventListener('click', () => {
            const sec = document.getElementById('my-albums');
            const resSec = document.getElementById('music-results');
            const empty = document.getElementById('music-empty');
            const mySec = document.getElementById('my-music');
            const plsSec = document.getElementById('music-playlists');
            const downloadedSec = document.getElementById('music-downloaded');
            const albListSec = document.getElementById('music-albums');
            const albumViewSec = document.getElementById('music-album-view');
            const showing = sec.style.display !== 'none';
            if (showing) {
                sec.style.display = 'none';
                if (albListSec && albListSec.children.length) { albListSec.style.display = 'block'; }
                else if (musicResultsGrid && musicResultsGrid.children.length) { resSec.style.display = 'block'; empty.style.display = 'none'; }
                else { resSec.style.display = 'none'; empty.style.display = ''; }
                if (albumViewSec) albumViewSec.style.display = 'none';
            } else {
                renderMyAlbums();
                sec.style.display = 'block';
                resSec.style.display = 'none';
                empty.style.display = 'none';
                mySec.style.display = 'none';
                plsSec.style.display = 'none';
                if (downloadedSec) downloadedSec.style.display = 'none';
                if (albListSec) albListSec.style.display = 'none';
                if (albumViewSec) albumViewSec.style.display = 'none';
            }
        });
    }

    // My Music storage helpers
    const MY_MUSIC_KEY = 'pt_my_music_v1';
    function getMyMusic() {
        try { return JSON.parse(localStorage.getItem(MY_MUSIC_KEY) || '[]'); } catch (_) { return []; }
    }
    function setMyMusic(arr) {
        try { localStorage.setItem(MY_MUSIC_KEY, JSON.stringify(arr)); } catch (_) { }
    }

    // Playlists storage helpers
    const PLAYLISTS_KEY = 'pt_playlists_v1';
    function getPlaylists() {
        try { return JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || '[]'); } catch (_) { return []; }
    }
    function setPlaylists(arr) {
        try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(arr)); } catch (_) { }
    }
    function addTrackToPlaylist(playlistId, track) {
        const pls = getPlaylists();
        const pl = pls.find(p => p.id === playlistId);
        if (!pl) return false;
        if (!pl.tracks) pl.tracks = [];
        if (!pl.tracks.find(t => t.id === track.id)) {
            pl.tracks.push(track);
            setPlaylists(pls);
            return true;
        }
        return false;
    }

    // Bulk add helper: add multiple tracks, avoid duplicates, single write
    function addTracksToPlaylist(playlistId, tracks) {
        if (!Array.isArray(tracks) || tracks.length === 0) return { added: 0, total: 0 };
        const pls = getPlaylists();
        const pl = pls.find(p => p.id === playlistId);
        if (!pl) return { added: 0, total: tracks.length };
        if (!Array.isArray(pl.tracks)) pl.tracks = [];
        const existing = new Set(pl.tracks.map(t => String(t.id)));
        let added = 0;
        tracks.forEach(t => {
            if (!t || t.id == null) return;
            const idStr = String(t.id);
            if (!existing.has(idStr)) {
                pl.tracks.push(t);
                existing.add(idStr);
                added++;
            }
        });
        if (added > 0) setPlaylists(pls);
        return { added, total: tracks.length };
    }

    // Downloaded Music storage helpers
    const DOWNLOADED_MUSIC_KEY = 'pt_downloaded_music_v1';
    function getDownloadedMusic() {
        try { return JSON.parse(localStorage.getItem(DOWNLOADED_MUSIC_KEY) || '[]'); } catch (_) { return []; }
    }
    function setDownloadedMusic(arr) {
        try { localStorage.setItem(DOWNLOADED_MUSIC_KEY, JSON.stringify(arr)); } catch (_) { }
    }
    function isTrackDownloaded(trackId) {
        const downloaded = getDownloadedMusic();
        return downloaded.some(d => String(d.id) === String(trackId));
    }
    function addToDownloaded(track) {
        const downloaded = getDownloadedMusic();
        if (!downloaded.find(d => String(d.id) === String(track.id))) {
            downloaded.push(track);
            setDownloadedMusic(downloaded);
            return true;
        }
        return false;
    }
    function removeFromDownloaded(trackId) {
        // Ensure type-safe comparison so numeric vs string IDs don't break removal
        const downloaded = getDownloadedMusic().filter(d => String(d.id) !== String(trackId));
        setDownloadedMusic(downloaded);
    }

    // Reconcile local downloaded list with actual files on disk
    async function reconcileDownloadedMusicWithDisk() {
        try {
            const list = getDownloadedMusic();
            if (!Array.isArray(list) || list.length === 0) return [];
            const filePaths = Array.from(new Set(list.map(d => d && d.filePath).filter(Boolean)));
            if (filePaths.length === 0) return list;
            const res = await fetch('/api/music/exists-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePaths })
            });
            if (!res.ok) return list;
            const data = await res.json();
            const existsMap = (data && data.results) || {};
            const filtered = list.filter(item => item && item.filePath && existsMap[item.filePath]);
            if (filtered.length !== list.length) {
                setDownloadedMusic(filtered);
            }
            return filtered;
        } catch (e) {
            console.warn('[Music] Reconcile with disk failed:', e);
            return getDownloadedMusic();
        }
    }

    // Track current download for cancellation
    let currentDownloadController = null;
    let currentDownloadFilePath = null;
    let currentDownloadId = null;
    let currentDownloadPoll = null;
    let currentDownloadCancelled = false;
    let isDownloadMinimized = false;

    // Download queue system
    let downloadQueue = [];
    let isProcessingQueue = false;

    // Update queue display
    function updateQueueDisplay() {
        const queueInfo = document.getElementById('music-download-queue-info');
        const queueCount = document.getElementById('music-download-queue-count');

        if (downloadQueue.length > 0) {
            if (queueInfo) queueInfo.style.display = 'block';
            if (queueCount) queueCount.textContent = downloadQueue.length;
        } else {
            if (queueInfo) queueInfo.style.display = 'none';
        }
    }

    // Process download queue
    async function processDownloadQueue() {
        if (isProcessingQueue || downloadQueue.length === 0) {
            return;
        }

        isProcessingQueue = true;

        // Process only ONE item from the queue
        const item = downloadQueue.shift();
        updateQueueDisplay();

        try {
            await downloadMusicTrackInternal(item.trackId, item.title, item.artistName, item.coverSrc);
        } catch (error) {
            console.error('Queue download error:', error);
            showNotification(`Failed to download "${item.title}"`, 'error');
        }

        isProcessingQueue = false;
    }

    // Helper: fetch image and return as data URL for offline cover storage
    async function fetchImageAsDataURL(url) {
        try {
            if (!url || url.startsWith('data:')) return url || '';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Image fetch failed');
            const blob = await res.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn('Cover to dataURL failed, keeping URL:', e?.message || e);
            return url || '';
        }
    }

    function updateBothProgressBars(width, status) {
        // Update modal progress
        const progressBar = document.getElementById('music-download-progress-fill');
        const statusText = document.getElementById('music-download-status');
        if (progressBar) progressBar.style.width = width;
        if (statusText) statusText.textContent = status;

        // Update minimized progress
        const minProgressBar = document.getElementById('music-download-minimized-progress');
        const minStatusText = document.getElementById('music-download-minimized-status');
        if (minProgressBar) minProgressBar.style.width = width;
        if (minStatusText) minStatusText.textContent = status;
    }

    // Download music track function
    async function downloadMusicTrackInternal(trackId, title, artistName, coverSrc) {
        // Guard: only one download at a time
        if (currentDownloadId || currentDownloadController) {
            // Should not happen with queue system, but just in case
            console.warn('Download already in progress, skipping');
            return;
        }
        // Create new AbortController for this download
        currentDownloadController = new AbortController();
        currentDownloadFilePath = null;
        isDownloadMinimized = false;
        // Assign a downloadId immediately so cancel works even before network calls
        currentDownloadId = Date.now().toString();

        try {
            // Show download modal
            const modal = document.getElementById('music-download-modal');
            const minimized = document.getElementById('music-download-minimized');
            const songNameEl = document.getElementById('music-download-song-name');
            const artistNameEl = document.getElementById('music-download-artist-name');
            const minSongEl = document.getElementById('music-download-minimized-song');
            const minArtistEl = document.getElementById('music-download-minimized-artist');

            // Immediately show minimized notification instead of full modal
            modal.style.display = 'none';
            minimized.style.display = 'block';
            isDownloadMinimized = true;
            if (songNameEl) songNameEl.textContent = title;
            if (artistNameEl) artistNameEl.textContent = artistName;
            if (minSongEl) minSongEl.textContent = title;
            if (minArtistEl) minArtistEl.textContent = artistName;

            updateBothProgressBars('0%', 'Starting download...');

            // Simulate progress
            let progressInterval = setInterval(() => {
                updateBothProgressBars('50%', 'Downloading...');
            }, 500);

            let result;
            try {
                result = await MusicService.downloadTrack(trackId, title, artistName, coverSrc);
            } finally {
                clearInterval(progressInterval);
            }

            // Store cover
            let coverToStore = coverSrc;
            try { coverToStore = await fetchImageAsDataURL(coverSrc); } catch (_) { }

            if (result && result.success) {
                addToDownloaded({
                    id: String(trackId),
                    title,
                    artist: artistName,
                    cover: coverToStore,
                    filePath: result.path
                });

                updateBothProgressBars('100%', '✓ Download complete!');

                setTimeout(() => {
                    const modal = document.getElementById('music-download-modal');
                    const minimized = document.getElementById('music-download-minimized');
                    if (modal) modal.style.display = 'none';
                    if (minimized) minimized.style.display = 'none';
                    currentDownloadController = null;
                    currentDownloadFilePath = null;
                    currentDownloadId = null;
                    try { musicSearchInput && musicSearchInput.focus && musicSearchInput.focus(); } catch (_) { }
                    if (downloadQueue.length > 0) {
                        setTimeout(() => processDownloadQueue(), 500);
                    }
                }, 1500);

                showNotification(`Downloaded "${title}"`, 'success');

                const currentResults = window.currentMusicResults || [];
                const currentQuery = window.currentMusicQuery || '';
                if (currentResults.length > 0) {
                    displayMusicResults(currentResults, currentQuery);
                }
            } else {
                throw new Error('Download failed');
            }

        } catch (error) {
            console.error('Initial download error:', error);
            const modal = document.getElementById('music-download-modal');
            const minimized = document.getElementById('music-download-minimized');
            modal.style.display = 'none';
            minimized.style.display = 'none';
            currentDownloadController = null;
            showNotification(`Failed to start download: ${error.message}`, 'error');
            // Ensure focus returns to the search bar on error
            try { musicSearchInput && musicSearchInput.focus && musicSearchInput.focus(); } catch (_) { }

            // Process next item in queue after initial error
            if (downloadQueue.length > 0) {
                setTimeout(() => processDownloadQueue(), 1000);
            }
        }
    }

    // Public download function - handles queue
    async function downloadMusicTrack(trackId, title, artistName, coverSrc) {
        // Check if already downloaded
        const downloaded = getDownloadedMusic();
        if (downloaded.some(d => d.id === String(trackId))) {
            showNotification(`"${title}" is already downloaded`, 'info');
            return;
        }

        // Check if already in queue
        if (downloadQueue.some(item => item.trackId === trackId)) {
            showNotification(`"${title}" is already in queue`, 'info');
            return;
        }

        // If currently downloading
        if (currentDownloadId || currentDownloadController) {
            // Add to queue
            downloadQueue.push({ trackId, title, artistName, coverSrc });
            updateQueueDisplay();
            showNotification(`"${title}" added to download queue (position ${downloadQueue.length})`, 'info');
            return;
        }

        // Start downloading immediately (completion handler will process queue)
        await downloadMusicTrackInternal(trackId, title, artistName, coverSrc);
    }

    // Minimize download button handler
    const minimizeDownloadBtn = document.getElementById('music-download-minimize-btn');
    if (minimizeDownloadBtn) {
        minimizeDownloadBtn.addEventListener('click', () => {
            const modal = document.getElementById('music-download-modal');
            const minimized = document.getElementById('music-download-minimized');
            modal.style.display = 'none';
            minimized.style.display = 'block';
            isDownloadMinimized = true;
        });
    }

    // Restore download button handler
    const restoreDownloadBtn = document.getElementById('music-download-restore-btn');
    if (restoreDownloadBtn) {
        restoreDownloadBtn.addEventListener('click', () => {
            const modal = document.getElementById('music-download-modal');
            const minimized = document.getElementById('music-download-minimized');
            modal.style.display = 'flex';
            minimized.style.display = 'none';
            isDownloadMinimized = false;
        });
    }

    // Cancel download button handler (modal)
    const cancelDownloadBtn = document.getElementById('music-download-cancel-btn');
    if (cancelDownloadBtn) {
        cancelDownloadBtn.addEventListener('click', async () => {
            try {
                currentDownloadCancelled = true;
                if (currentDownloadPoll) { clearInterval(currentDownloadPoll); currentDownloadPoll = null; }
                if (currentDownloadController) {
                    try { currentDownloadController.abort(); } catch (_) { }
                }
                if (currentDownloadId) {
                    await fetch('/api/music/download/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ downloadId: currentDownloadId })
                    }).catch(() => { });
                }
            } finally {
                const modal = document.getElementById('music-download-modal');
                const minimized = document.getElementById('music-download-minimized');
                if (modal) modal.style.display = 'none';
                if (minimized) minimized.style.display = 'none';
                currentDownloadController = null;
                currentDownloadFilePath = null;
                currentDownloadId = null;
                updateBothProgressBars('0%', '');
                showNotification('Download cancelled', 'info');
                // Refocus search for quick next query
                try { musicSearchInput && musicSearchInput.focus && musicSearchInput.focus(); } catch (_) { }
            }
        });
    }

    // Cancel download button handler (minimized)
    const cancelDownloadMinBtn = document.getElementById('music-download-cancel-minimized-btn');
    if (cancelDownloadMinBtn) {
        cancelDownloadMinBtn.addEventListener('click', async () => {
            try {
                currentDownloadCancelled = true;
                if (currentDownloadPoll) { clearInterval(currentDownloadPoll); currentDownloadPoll = null; }
                if (currentDownloadController) {
                    try { currentDownloadController.abort(); } catch (_) { }
                }
                if (currentDownloadId) {
                    await fetch('/api/music/download/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ downloadId: currentDownloadId })
                    }).catch(() => { });
                }
            } finally {
                const modal = document.getElementById('music-download-modal');
                const minimized = document.getElementById('music-download-minimized');
                if (modal) modal.style.display = 'none';
                if (minimized) minimized.style.display = 'none';
                currentDownloadController = null;
                currentDownloadFilePath = null;
                currentDownloadId = null;
                updateBothProgressBars('0%', '');
                showNotification('Download cancelled', 'info');
                // Refocus search for quick next query
                try { musicSearchInput && musicSearchInput.focus && musicSearchInput.focus(); } catch (_) { }
            }
        });
    }

    function renderPlaylists() {
        const wrap = document.getElementById('music-playlists');
        if (!wrap) return;
        const list = document.getElementById('playlists-list');
        const empty = document.getElementById('playlists-empty');
        const pls = getPlaylists();
        list.innerHTML = '';
        if (!pls.length) {
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        pls.forEach(pl => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
                        <div class="music-info">
                            <div class="music-title">${pl.name}</div>
                            <div class="music-artist">${(pl.tracks?.length || 0)} track${(pl.tracks?.length || 0) !== 1 ? 's' : ''}</div>
                            <div class="music-actions">
                                <button class="playlist-open-btn" data-id="${pl.id}"><i class="fas fa-folder-open"></i> Open</button>
                                <button class="playlist-export-btn" data-id="${pl.id}" title="Export playlist"><i class="fas fa-file-export"></i> Export</button>
                                <button class="playlist-delete-btn" data-id="${pl.id}"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
            list.appendChild(card);
        });
        // open
        list.querySelectorAll('.playlist-open-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                openPlaylist(id);
            });
        });
        // export
        list.querySelectorAll('.playlist-export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                exportPlaylist(id);
            });
        });
        // delete
        list.querySelectorAll('.playlist-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const pls = getPlaylists().filter(p => p.id !== id);
                setPlaylists(pls);
                renderPlaylists();
                showNotification('Playlist deleted', 'info');
            });
        });
    }

    function openPlaylist(id) {
        const pls = getPlaylists();
        const pl = pls.find(p => p.id === id);
        if (!pl) return;
        // Reuse results grid to show playlist content
        const resSec = document.getElementById('music-results');
        const empty = document.getElementById('music-empty');
        const mySec = document.getElementById('my-music');
        mySec.style.display = 'none';
        resSec.style.display = 'block'; empty.style.display = 'none';
        musicResultsTitle.textContent = `Playlist: ${pl.name}`;
        // mark playlist-open on page for CSS tweaks
        const musicPage = document.getElementById('music-page');
        if (musicPage) musicPage.classList.add('playlist-open');
        // Add Close Playlist button in the header
        const header = resSec.querySelector('.books-results-header');
        if (header && !header.querySelector('#playlist-close-btn')) {
            // Add Play All button first
            const playAllBtn = document.createElement('button');
            playAllBtn.id = 'playlist-play-all-btn';
            playAllBtn.className = 'action-btn';
            playAllBtn.style.background = 'linear-gradient(135deg, #ec4899, #a855f7)';
            playAllBtn.innerHTML = '<i class="fas fa-play"></i><span>Play All</span>';
            header.appendChild(playAllBtn);
            playAllBtn.addEventListener('click', () => {
                const tracks = pl.tracks || [];
                if (tracks.length === 0) {
                    showNotification('No tracks in this playlist', 'info');
                    return;
                }
                playAllTracks(tracks);
            });
            // Add Shuffle button next to Play All
            const shuffleBtn = document.createElement('button');
            shuffleBtn.id = 'playlist-shuffle-btn';
            shuffleBtn.className = 'action-btn';
            shuffleBtn.title = 'Shuffle and play this playlist';
            shuffleBtn.innerHTML = '<i class="fas fa-random"></i><span>Shuffle</span>';
            header.appendChild(shuffleBtn);
            shuffleBtn.addEventListener('click', () => {
                const tracks = (pl.tracks || []).slice();
                if (tracks.length === 0) {
                    showNotification('No tracks in this playlist', 'info');
                    return;
                }
                for (let i = tracks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
                }
                playAllTracks(tracks);
            });

            const closeBtn = document.createElement('button');
            closeBtn.id = 'playlist-close-btn';
            closeBtn.className = 'playlist-close-btn';
            closeBtn.style.marginLeft = 'auto';
            closeBtn.innerHTML = '<i class="fas fa-times"></i><span>Close Playlist</span>';
            header.appendChild(closeBtn);
            closeBtn.addEventListener('click', () => {
                // Clear playlist-open mode and header buttons
                if (musicPage) musicPage.classList.remove('playlist-open');
                const pBtn = document.getElementById('playlist-play-all-btn');
                const sBtn = document.getElementById('playlist-shuffle-btn');
                const cBtn = document.getElementById('playlist-close-btn');
                if (pBtn) pBtn.remove();
                if (sBtn) sBtn.remove();
                if (cBtn) cBtn.remove();
                // Go back to Playlists view explicitly
                resSec.style.display = 'none';
                empty.style.display = 'none';
                const plsSec = document.getElementById('music-playlists');
                if (plsSec) {
                    plsSec.style.display = 'block';
                    try { renderPlaylists(); } catch (_) { }
                }
            });
        }
        const tracks = pl.tracks || [];
        musicResultsCount.textContent = `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`;
        musicResultsGrid.innerHTML = '';
        tracks.forEach(t => {
            const card = document.createElement('div');
            card.className = 'music-card';
            const isDownloaded = isTrackDownloaded(t.id);
            const downloadBtnHTML = isDownloaded
                ? `<button class="music-download-btn downloaded" title="Downloaded" data-id="${t.id}" data-title="${t.title.replace(/\"/g, '&quot;')}" data-artist="${t.artist.replace(/\"/g, '&quot;')}" data-cover="${t.cover}"><i class="fas fa-check-circle"></i></button>`
                : `<button class="music-download-btn" title="Download" data-id="${t.id}" data-title="${t.title.replace(/\"/g, '&quot;')}" data-artist="${t.artist.replace(/\"/g, '&quot;')}" data-cover="${t.cover}"><i class="fas fa-download"></i></button>`;
            card.innerHTML = `
                        <div class="music-cover"><img loading="lazy" src="${t.cover}" alt="${t.title}"></div>
                        <div class="music-info">
                            <div class="music-title">${t.title}</div>
                            <div class="music-artist">${t.artist}</div>
                            <div class="music-actions">
                                <button class="music-play-btn" data-id="${t.id}" data-title="${t.title}" data-artist="${t.artist}" data-cover="${t.cover}"><i class="fas fa-play"></i> Play</button>
                                ${downloadBtnHTML}
                                <button class="playlist-delete-btn playlist-remove-btn" data-id="${t.id}" data-pl="${id}" title="Remove from Playlist"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
            musicResultsGrid.appendChild(card);
        });
        musicResultsGrid.querySelectorAll('.music-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget;
                // When inside a playlist, set queue to that playlist's tracks
                const tracks = (pl.tracks || []).map(t => ({ id: String(t.id), title: t.title, artist: t.artist, cover: t.cover }));
                const idx = tracks.findIndex(t => String(t.id) === String(el.getAttribute('data-id')));
                if (idx >= 0 && tracks.length) {
                    setPlayQueue(tracks, idx);
                } else {
                    playMusicTrack({
                        trackId: el.getAttribute('data-id'),
                        title: el.getAttribute('data-title'),
                        artistName: el.getAttribute('data-artist'),
                        coverSrc: el.getAttribute('data-cover')
                    });
                }
            });
        });
        // wire download buttons
        musicResultsGrid.querySelectorAll('.music-download-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const trackId = btn.getAttribute('data-id');
                const title = btn.getAttribute('data-title');
                const artist = btn.getAttribute('data-artist');
                const cover = btn.getAttribute('data-cover');

                if (isTrackDownloaded(trackId)) {
                    showNotification('Track already downloaded', 'info');
                    return;
                }

                await downloadMusicTrack(trackId, title, artist, cover);
                // Re-render to update button state
                openPlaylist(id);
            });
        });
        musicResultsGrid.querySelectorAll('.playlist-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idTrack = e.currentTarget.getAttribute('data-id');
                const pid = e.currentTarget.getAttribute('data-pl');
                const pls = getPlaylists();
                const pl2 = pls.find(p => p.id === pid);
                if (pl2) {
                    pl2.tracks = (pl2.tracks || []).filter(t => t.id !== idTrack);
                    setPlaylists(pls);
                    openPlaylist(pid);
                    showNotification('Removed from playlist', 'info');
                }
            });
        });
    }

    function showPlaylistChooser(track) {
        // Open the modal chooser and list playlists to add into (supports single track or array)
        playlistChooserTrack = track;
        const pls = getPlaylists();
        if (!playlistChooser || !playlistChooserList || !playlistChooserEmpty) return;
        playlistChooserList.innerHTML = '';
        if (!pls.length) {
            playlistChooserEmpty.style.display = '';
        } else {
            playlistChooserEmpty.style.display = 'none';
            pls.forEach(pl => {
                const row = document.createElement('div');
                row.className = 'music-card';
                row.innerHTML = `
                            <div class="music-info">
                                <div class="music-title">${pl.name}</div>
                                <div class="music-artist">${(pl.tracks?.length || 0)} track${(pl.tracks?.length || 0) !== 1 ? 's' : ''}</div>
                                <div class="music-actions">
                                    <button class="playlist-open-btn playlist-choose-btn" data-id="${pl.id}"><i class="fas fa-check"></i><span>Add Here</span></button>
                                </div>
                            </div>`;
                playlistChooserList.appendChild(row);
            });
            playlistChooserList.querySelectorAll('.playlist-choose-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const pid = btn.getAttribute('data-id');
                    const name = (getPlaylists().find(p => p.id === pid)?.name) || 'playlist';
                    if (Array.isArray(playlistChooserTrack)) {
                        const { added, total } = addTracksToPlaylist(pid, playlistChooserTrack);
                        if (added > 0) {
                            showNotification(`Added ${added} of ${total} to ${name}`, 'success');
                        } else {
                            showNotification('All tracks already in playlist', 'info');
                        }
                    } else {
                        const ok = addTrackToPlaylist(pid, playlistChooserTrack);
                        showNotification(ok ? `Added to ${name}` : 'Already in playlist', ok ? 'success' : 'info');
                    }
                    closePlaylistChooser();
                });
            });
        }
        playlistChooser.style.display = 'flex';
    }

    function closePlaylistChooser() {
        if (playlistChooser) playlistChooser.style.display = 'none';
        playlistChooserTrack = null;
        if (playlistChooserNewName) playlistChooserNewName.value = '';
    }

    // Export playlist to JSON file
    async function exportPlaylist(playlistId) {
        try {
            const playlists = getPlaylists();
            const playlist = playlists.find(p => p.id === playlistId);

            if (!playlist) {
                showNotification('Playlist not found', 'error');
                return;
            }

            // Prepare playlist data for export
            const exportData = {
                name: playlist.name,
                tracks: playlist.tracks || [],
                exportedAt: new Date().toISOString(),
                version: '1.0'
            };

            const jsonData = JSON.stringify(exportData, null, 2);

            // Show save dialog
            if (!window.electronAPI?.showSaveDialog) {
                // Fallback: download as file in browser
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${playlist.name.replace(/[^a-z0-9]/gi, '_')}_playlist.json`;
                a.click();
                URL.revokeObjectURL(url);
                showNotification('Playlist exported', 'success');
                return;
            }

            const result = await window.electronAPI.showSaveDialog({
                title: 'Export Playlist',
                defaultPath: `${playlist.name.replace(/[^a-z0-9]/gi, '_')}_playlist.json`,
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                return;
            }

            // Write file
            const writeResult = await window.electronAPI.writeFile(result.filePath, jsonData);

            if (writeResult.success) {
                showNotification('Playlist exported successfully', 'success');
            } else {
                showNotification('Failed to export playlist: ' + (writeResult.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Failed to export playlist', 'error');
        }
    }

    // Import playlist from JSON file
    async function importPlaylist() {
        try {
            if (!window.electronAPI?.showOpenDialog) {
                showNotification('Import not supported in this environment', 'error');
                return;
            }

            const result = await window.electronAPI.showOpenDialog({
                title: 'Import Playlist',
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return;
            }

            // Read file
            const readResult = await window.electronAPI.readFile(result.filePaths[0]);

            if (!readResult.success) {
                showNotification('Failed to read file: ' + (readResult.error || 'Unknown error'), 'error');
                return;
            }

            // Parse JSON
            let importData;
            try {
                importData = JSON.parse(readResult.data);
            } catch (e) {
                showNotification('Invalid playlist file format', 'error');
                return;
            }

            // Validate data
            if (!importData.name || !Array.isArray(importData.tracks)) {
                showNotification('Invalid playlist data', 'error');
                return;
            }

            // Check if playlist with same name exists
            const playlists = getPlaylists();
            let playlistName = importData.name;
            let counter = 1;

            while (playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase())) {
                playlistName = `${importData.name} (${counter})`;
                counter++;
            }

            // Create new playlist
            const newPlaylist = {
                id: 'pl_' + Math.random().toString(36).slice(2, 10),
                name: playlistName,
                tracks: importData.tracks
            };

            playlists.push(newPlaylist);
            setPlaylists(playlists);
            renderPlaylists();

            showNotification(`Playlist "${playlistName}" imported with ${importData.tracks.length} track${importData.tracks.length !== 1 ? 's' : ''}`, 'success');
        } catch (error) {
            console.error('Import error:', error);
            showNotification('Failed to import playlist', 'error');
        }
    }

    function renderDownloadedMusic() {
        const wrap = document.getElementById('music-downloaded');
        if (!wrap) return;
        const grid = document.getElementById('music-downloaded-grid');
        const empty = document.getElementById('music-downloaded-empty');
        const countEl = document.getElementById('music-downloaded-count');
        const playAllBtn = document.getElementById('downloaded-play-all-btn');
        const shuffleBtn = document.getElementById('downloaded-shuffle-btn');
        const downloaded = getDownloadedMusic();
        grid.innerHTML = '';
        if (!downloaded.length) {
            if (countEl) countEl.textContent = '0 items';
            empty.style.display = '';
            if (playAllBtn) playAllBtn.style.display = 'none';
            if (shuffleBtn) shuffleBtn.style.display = 'none';
            return;
        }
        empty.style.display = 'none';
        if (countEl) countEl.textContent = `${downloaded.length} item${downloaded.length !== 1 ? 's' : ''}`;
        if (playAllBtn) playAllBtn.style.display = '';
        if (shuffleBtn) shuffleBtn.style.display = '';
        downloaded.forEach(track => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
                        <div class="music-cover"><img loading="lazy" src="${track.cover}" alt="${track.title}"></div>
                        <div class="music-info">
                            <div class="music-title">${track.title}</div>
                            <div class="music-artist">${track.artist}</div>
                            <div class="music-actions">
                                <button class="music-play-btn" data-id="${track.id}" data-title="${track.title}" data-artist="${track.artist}" data-cover="${track.cover}"><i class="fas fa-play"></i> Play</button>
                                <button class="music-folder-btn" data-path="${track.filePath}" title="Open Folder"><i class="fas fa-folder-open"></i></button>
                                <button class="music-delete-downloaded-btn" data-id="${track.id}" data-path="${track.filePath}" title="Delete"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
            grid.appendChild(card);
        });

        // Play button handler
        grid.querySelectorAll('.music-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget;
                const tracks = downloaded.map(t => ({ id: String(t.id), title: t.title, artist: t.artist, cover: t.cover }));
                const idx = tracks.findIndex(t => String(t.id) === String(el.getAttribute('data-id')));
                if (idx >= 0 && tracks.length) {
                    setPlayQueue(tracks, idx);
                } else {
                    playMusicTrack({
                        trackId: el.getAttribute('data-id'),
                        title: el.getAttribute('data-title'),
                        artistName: el.getAttribute('data-artist'),
                        coverSrc: el.getAttribute('data-cover')
                    });
                }
            });
        });

        // Open folder button handler
        grid.querySelectorAll('.music-folder-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const filePath = e.currentTarget.getAttribute('data-path');
                if (filePath && window.electronAPI?.showFolderInExplorer) {
                    try {
                        // Get the directory path from file path (cross-platform)
                        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
                        const dirPath = lastSlash > 0 ? filePath.substring(0, lastSlash) : filePath;
                        await window.electronAPI.showFolderInExplorer(dirPath);
                    } catch (error) {
                        console.error('Failed to open folder:', error);
                        showNotification('Failed to open folder', 'error');
                    }
                }
            });
        });

        // Delete button handler
        grid.querySelectorAll('.music-delete-downloaded-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const trackId = e.currentTarget.getAttribute('data-id');
                const filePath = e.currentTarget.getAttribute('data-path');

                if (!confirm('Delete this downloaded track?')) return;

                try {
                    // Delete file from disk
                    const res = await fetch('/api/music/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath })
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || 'Delete failed');
                    }

                    // Remove from downloaded list and any active play queue
                    removeFromDownloaded(trackId);
                    if (Array.isArray(window.currentPlayQueue)) {
                        window.currentPlayQueue = window.currentPlayQueue.filter(t => String(t.id) !== String(trackId));
                        if (typeof window.currentQueueIndex === 'number') {
                            window.currentQueueIndex = Math.min(window.currentQueueIndex, Math.max(0, window.currentPlayQueue.length - 1));
                        }
                    }

                    // Re-render
                    renderDownloadedMusic();
                    showNotification('Track deleted', 'success');

                    // Re-render current music results if showing to update button
                    const currentResults = window.currentMusicResults || [];
                    const currentQuery = window.currentMusicQuery || '';
                    if (currentResults.length > 0) {
                        displayMusicResults(currentResults, currentQuery);
                    }

                } catch (error) {
                    console.error('Delete error:', error);
                    showNotification(`Delete failed: ${error.message}`, 'error');
                }
            });
        });
    }

    // Playlist chooser events
    if (playlistChooserBack && playlistChooser) {
        playlistChooserBack.addEventListener('click', closePlaylistChooser);
        playlistChooser.addEventListener('click', (e) => {
            if (e.target === playlistChooser) closePlaylistChooser();
        });
    }
    if (playlistChooserCreate) {
        playlistChooserCreate.addEventListener('click', () => {
            const name = (playlistChooserNewName.value || '').trim();
            if (!name) { showNotification('Enter a playlist name', 'warning'); return; }
            const pls = getPlaylists();
            if (pls.find(p => p.name.toLowerCase() === name.toLowerCase())) { showNotification('Playlist exists', 'info'); return; }
            const id = 'pl_' + Math.random().toString(36).slice(2, 10);
            pls.push({ id, name, tracks: [] });
            setPlaylists(pls);
            playlistChooserNewName.value = '';
            // Refresh chooser list
            showPlaylistChooser(playlistChooserTrack || null);
            showNotification('Playlist created', 'success');
        });
    }

    // Removed offline rendering and related actions

    // Render My Music grid
    function renderMyMusic() {
        const list = getMyMusic();
        const grid = document.getElementById('my-music-grid');
        const count = document.getElementById('my-music-count');
        const empty = document.getElementById('my-music-empty');
        grid.innerHTML = '';
        if (!list.length) {
            count.textContent = '0 items';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        count.textContent = `${list.length} item${list.length !== 1 ? 's' : ''}`;
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'music-card';
            const isDownloaded = isTrackDownloaded(item.id);
            const downloadBtnHTML = isDownloaded
                ? `<button class="music-download-btn downloaded" title="Downloaded" data-id="${item.id}" data-title="${item.title.replace(/\"/g, '&quot;')}" data-artist="${item.artist.replace(/\"/g, '&quot;')}" data-cover="${item.cover}"><i class="fas fa-check-circle"></i></button>`
                : `<button class="music-download-btn" title="Download" data-id="${item.id}" data-title="${item.title.replace(/\"/g, '&quot;')}" data-artist="${item.artist.replace(/\"/g, '&quot;')}" data-cover="${item.cover}"><i class="fas fa-download"></i></button>`;
            card.innerHTML = `
                        <div class="music-cover"><img loading="lazy" src="${item.cover}" alt="${item.title}"></div>
                        <div class="music-info">
                            <div class="music-title">${item.title}</div>
                            <div class="music-artist">${item.artist}</div>
                            <div class="music-actions">
                                <button class="music-play-btn" data-id="${item.id}"><i class="fas fa-play"></i> Play</button>
                                ${downloadBtnHTML}
                                <button class="music-add-btn" title="Remove from My Music" data-remove="true" data-id="${item.id}"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
            grid.appendChild(card);
        });
        // wire play/open
        grid.querySelectorAll('.music-play-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = String(e.currentTarget.getAttribute('data-id'));
                const list = getMyMusic().map(x => ({ id: String(x.id), title: x.title, artist: x.artist, cover: x.cover }));
                const idx = list.findIndex(x => String(x.id) === id);
                if (idx >= 0 && list.length) {
                    setPlayQueue(list, idx);
                } else {
                    const card = e.currentTarget.closest('.music-card');
                    const title = card.querySelector('.music-title')?.textContent || 'Unknown Title';
                    const artistName = card.querySelector('.music-artist')?.textContent || 'Unknown Artist';
                    const coverSrc = card.querySelector('img')?.src || '';
                    await playMusicTrack({ trackId: id, title, artistName, coverSrc });
                }
            });
        });
        // wire download buttons
        grid.querySelectorAll('.music-download-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const trackId = btn.getAttribute('data-id');
                const title = btn.getAttribute('data-title');
                const artist = btn.getAttribute('data-artist');
                const cover = btn.getAttribute('data-cover');

                if (isTrackDownloaded(trackId)) {
                    showNotification('Track already downloaded', 'info');
                    return;
                }

                await downloadMusicTrack(trackId, title, artist, cover);
                // Re-render to update button state
                renderMyMusic();
            });
        });
        grid.querySelectorAll('.music-add-btn[data-remove="true"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const list2 = getMyMusic().filter(x => x.id !== id);
                setMyMusic(list2);
                renderMyMusic();
                showNotification('Removed from My Music', 'info');
            });
        });
    }

    // Toggle My Music section
    const myBtn = document.getElementById('music-my-btn');
    if (myBtn) {
        myBtn.addEventListener('click', () => {
            const mySec = document.getElementById('my-music');
            const resSec = document.getElementById('music-results');
            const empty = document.getElementById('music-empty');
            const plsSec = document.getElementById('music-playlists');
            const downloadedSec = document.getElementById('music-downloaded');
            const myAlbumsSec2 = document.getElementById('my-albums');
            const albumListSec2 = document.getElementById('music-albums');
            const albumViewSec2 = document.getElementById('music-album-view');
            const showing = mySec.style.display !== 'none';
            if (showing) {
                mySec.style.display = 'none';
                // Restore last state: show results if present else empty
                if (musicResultsGrid && musicResultsGrid.children.length) {
                    resSec.style.display = 'block';
                    empty.style.display = 'none';
                } else {
                    resSec.style.display = 'none';
                    empty.style.display = '';
                }
                plsSec.style.display = 'none';
                if (downloadedSec) downloadedSec.style.display = 'none';
                if (myAlbumsSec2) myAlbumsSec2.style.display = 'none';
                if (albumListSec2) albumListSec2.style.display = 'none';
                if (albumViewSec2) albumViewSec2.style.display = 'none';
                const musicPage = document.getElementById('music-page');
                if (musicPage) musicPage.classList.remove('playlist-open');
            } else {
                renderMyMusic();
                mySec.style.display = 'block';
                resSec.style.display = 'none';
                empty.style.display = 'none';
                plsSec.style.display = 'none';
                if (downloadedSec) downloadedSec.style.display = 'none';
                if (myAlbumsSec2) myAlbumsSec2.style.display = 'none';
                if (albumListSec2) albumListSec2.style.display = 'none';
                if (albumViewSec2) albumViewSec2.style.display = 'none';
                const musicPage = document.getElementById('music-page');
                if (musicPage) musicPage.classList.remove('playlist-open');
            }
        });
    }

    // Toggle Playlists
    const playlistsBtn = document.getElementById('music-playlists-btn');
    if (playlistsBtn) {
        playlistsBtn.addEventListener('click', () => {
            const sec = document.getElementById('music-playlists');
            const resSec = document.getElementById('music-results');
            const empty = document.getElementById('music-empty');
            const mySec = document.getElementById('my-music');
            const downloadedSec = document.getElementById('music-downloaded');
            const myAlbumsSec3 = document.getElementById('my-albums');
            const showing = sec.style.display !== 'none';
            if (showing) {
                sec.style.display = 'none';
                if (musicResultsGrid && musicResultsGrid.children.length) { resSec.style.display = 'block'; empty.style.display = 'none'; }
                else { resSec.style.display = 'none'; empty.style.display = ''; }
                const musicPage = document.getElementById('music-page');
                if (musicPage) musicPage.classList.remove('playlist-open');
                if (myAlbumsSec3) myAlbumsSec3.style.display = 'none';
            } else {
                renderPlaylists();
                sec.style.display = 'block';
                resSec.style.display = 'none';
                empty.style.display = 'none';
                mySec.style.display = 'none';
                if (downloadedSec) downloadedSec.style.display = 'none';
                if (myAlbumsSec3) myAlbumsSec3.style.display = 'none';
                const musicPage = document.getElementById('music-page');
                if (musicPage) musicPage.classList.remove('playlist-open');
            }
        });
    }

    // Toggle Downloaded
    const downloadedBtn = document.getElementById('music-downloaded-btn');
    if (downloadedBtn) {
        downloadedBtn.addEventListener('click', async () => {
            const sec = document.getElementById('music-downloaded');
            const resSec = document.getElementById('music-results');
            const empty = document.getElementById('music-empty');
            const mySec = document.getElementById('my-music');
            const plsSec = document.getElementById('music-playlists');
            const myAlbumsSec = document.getElementById('my-albums');
            const showing = sec.style.display !== 'none';
            if (showing) {
                sec.style.display = 'none';
                if (musicResultsGrid && musicResultsGrid.children.length) { resSec.style.display = 'block'; empty.style.display = 'none'; }
                else { resSec.style.display = 'none'; empty.style.display = ''; }
                const musicPage = document.getElementById('music-page');
                if (musicPage) musicPage.classList.remove('playlist-open');
                if (myAlbumsSec) myAlbumsSec.style.display = 'none';
            } else {
                // Reconcile with disk before showing the list
                try { await reconcileDownloadedMusicWithDisk(); } catch (_) { }
                renderDownloadedMusic();
                sec.style.display = 'block';
                resSec.style.display = 'none';
                empty.style.display = 'none';
                mySec.style.display = 'none';
                if (plsSec) plsSec.style.display = 'none';
                if (myAlbumsSec) myAlbumsSec.style.display = 'none';
                const musicPage = document.getElementById('music-page');
                if (musicPage) musicPage.classList.remove('playlist-open');
            }
        });
    }

    // Downloaded Music Play All button
    const downloadedPlayAllBtn = document.getElementById('downloaded-play-all-btn');
    if (downloadedPlayAllBtn) {
        downloadedPlayAllBtn.addEventListener('click', () => {
            const downloaded = getDownloadedMusic();
            if (downloaded.length === 0) {
                showNotification('No tracks to play', 'info');
                return;
            }
            const tracks = downloaded.map(t => ({
                id: String(t.id),
                title: t.title,
                artist: t.artist,
                cover: t.cover
            }));
            playAllTracks(tracks);
        });
    }

    // Downloaded Music Shuffle button
    const downloadedShuffleBtn = document.getElementById('downloaded-shuffle-btn');
    if (downloadedShuffleBtn) {
        downloadedShuffleBtn.addEventListener('click', () => {
            const downloaded = getDownloadedMusic();
            if (downloaded.length === 0) {
                showNotification('No tracks to play', 'info');
                return;
            }
            const tracks = downloaded.map(t => ({
                id: String(t.id),
                title: t.title,
                artist: t.artist,
                cover: t.cover
            }));
            // Shuffle the tracks array using Fisher-Yates algorithm
            for (let i = tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
            }
            playAllTracks(tracks);
        });
    }

    const createPlBtn = document.getElementById('playlist-create-btn');
    const plNameInput = document.getElementById('playlist-name-input');
    if (createPlBtn) {
        createPlBtn.addEventListener('click', () => {
            const name = (plNameInput.value || '').trim();
            if (!name) { showNotification('Enter a playlist name', 'warning'); return; }
            const pls = getPlaylists();
            if (pls.find(p => p.name.toLowerCase() === name.toLowerCase())) { showNotification('Playlist exists', 'info'); return; }
            const id = 'pl_' + Math.random().toString(36).slice(2, 10);
            pls.push({ id, name, tracks: [] });
            setPlaylists(pls);
            plNameInput.value = '';
            renderPlaylists();
            showNotification('Playlist created', 'success');
        });
    }

    // Import playlist button
    const importPlBtn = document.getElementById('playlist-import-btn');
    if (importPlBtn) {
        importPlBtn.addEventListener('click', () => {
            importPlaylist();
        });
    }

    // Offline removed

    async function playMusicTrack({ trackId, title, artistName, coverSrc }) {
        if (!trackId) {
            showNotification('Missing track ID', 'error');
            return;
        }

        // Flag to track if this playback request is still valid
        let isPlaybackCancelled = false;

        try {
            // Check if this track is already downloaded
            const downloaded = getDownloadedMusic();
            const downloadedTrack = downloaded.find(t => String(t.id) === String(trackId));

            if (downloadedTrack && downloadedTrack.filePath) {
                // Play from downloaded file
                console.log('[MUSIC] Playing downloaded file:', downloadedTrack.filePath);

                // Show modal or mini player based on current state
                if (isPlayerMinimized) {
                    miniPlayer.style.display = 'block';
                    musicModal.style.display = 'none';
                } else {
                    musicModal.style.display = 'flex';
                    miniPlayer.style.display = 'none';
                }

                musicModalTitle.textContent = 'Now Playing (Offline)';
                musicSongTitle.textContent = title;
                musicArtist.textContent = artistName;
                if (coverSrc) musicCover.src = coverSrc;
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                // Update mini player info
                if (miniPlayerSongTitle) miniPlayerSongTitle.textContent = title;
                if (miniPlayerArtist) miniPlayerArtist.textContent = artistName;
                if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                // Clear existing sources
                while (musicAudio.firstChild) musicAudio.removeChild(musicAudio.firstChild);

                // Use local file endpoint
                const source = document.createElement('source');
                source.src = `/api/music/serve/${encodeURIComponent(downloadedTrack.filePath)}`;
                source.type = 'audio/flac';
                musicAudio.appendChild(source);

                // Load then check if player is still open before playing
                musicAudio.load();

                // Check if player is still visible before playing
                if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                    console.log('[MUSIC] Player was closed, aborting playback');
                    return;
                }

                try {
                    await musicAudio.play();
                } catch (err) {
                    // Check again after retry delay
                    await new Promise(r => setTimeout(r, 150));
                    if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                        console.log('[MUSIC] Player was closed during retry, aborting playback');
                        return;
                    }
                    await musicAudio.play();
                }

                // Final check before updating UI
                if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                    musicAudio.pause();
                    return;
                }

                musicPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                updateTimeDisplays();

                // Update Discord presence for music
                updateDiscordForMusic(title, artistName, '');
                return;
            }

            // Not downloaded - stream from TIDAL
            // Show modal or mini player based on current state
            if (isPlayerMinimized) {
                miniPlayer.style.display = 'block';
                musicModal.style.display = 'none';
            } else {
                musicModal.style.display = 'flex';
                miniPlayer.style.display = 'none';
            }

            musicModalTitle.textContent = 'Now Playing';
            musicSongTitle.textContent = title;
            musicArtist.textContent = artistName;
            if (coverSrc) musicCover.src = coverSrc;
            musicPlayPauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            // Update mini player info
            if (miniPlayerSongTitle) miniPlayerSongTitle.textContent = title;
            if (miniPlayerArtist) miniPlayerArtist.textContent = artistName;
            if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            const data = await musicFetchJson(`/track/?id=${encodeURIComponent(trackId)}&quality=LOSSLESS`);

            // Check if player was closed during fetch
            if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                console.log('[MUSIC] Player was closed during fetch, aborting playback');
                return;
            }

            let url = null;
            if (Array.isArray(data) && data.length >= 3) {
                // HiFi API returns [trackInfo, manifest, {OriginalTrackUrl: "..."}]
                // We want the third element with OriginalTrackUrl
                url = data[2]?.OriginalTrackUrl || data[2]?.originalTrackUrl;
            }
            // Fallback: scan all elements if not found
            if (!url && Array.isArray(data)) {
                for (const item of data) {
                    const candidate = item?.OriginalTrackUrl || item?.originalTrackUrl;
                    if (candidate && !candidate.startsWith('http://www.tidal.com')) {
                        url = candidate;
                        break;
                    }
                }
            }
            if (!url) throw new Error('Track URL not found');

            // Set <source> with a suitable type hint
            while (musicAudio.firstChild) musicAudio.removeChild(musicAudio.firstChild);
            const source = document.createElement('source');
            source.src = url;
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.includes('.flac')) source.type = 'audio/flac';
            else if (lowerUrl.includes('.mp4') || lowerUrl.includes('.m4a')) source.type = 'audio/mp4';
            else if (lowerUrl.includes('.aac')) source.type = 'audio/aac';
            else if (lowerUrl.includes('.ogg') || lowerUrl.includes('.ogx')) source.type = 'audio/ogg';
            musicAudio.appendChild(source);

            // Load then check if player is still open before playing
            musicAudio.load();

            // Check if player is still visible before playing
            if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                console.log('[MUSIC] Player was closed before playback, aborting');
                return;
            }

            try {
                await musicAudio.play();
            } catch (err) {
                // Check again after retry delay
                await new Promise(r => setTimeout(r, 150));
                if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                    console.log('[MUSIC] Player was closed during retry, aborting playback');
                    return;
                }
                await musicAudio.play();
            }

            // Final check before updating UI
            if (musicModal.style.display === 'none' && miniPlayer.style.display === 'none') {
                musicAudio.pause();
                return;
            }

            musicPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            updateTimeDisplays();

            // Update Discord presence for music
            updateDiscordForMusic(title, artistName, '');
        } catch (e) {
            console.error('[MUSIC] Play error', e);
            showNotification('Failed to play track', 'error');
            // Only close if player is still visible
            if (musicModal.style.display !== 'none' || miniPlayer.style.display !== 'none') {
                musicModal.style.display = 'none';
                miniPlayer.style.display = 'none';
            }
        }
    }

    // Fully close/stop music modal and unload audio
    function closeMusicModal() {
        // Clear Discord presence when music stops
        if (discordMusicActive) {
            clearDiscordPresence();
        }

        try {
            if (musicAudio) {
                try { musicAudio.pause(); } catch (_) { }
                // Clear source(s) to stop network streaming
                musicAudio.removeAttribute('src');
                while (musicAudio.firstChild) musicAudio.removeChild(musicAudio.firstChild);
                musicAudio.load();
            }
        } catch (_) { }
        if (musicProgressFill) musicProgressFill.style.width = '0%';
        if (musicCurrentTime) musicCurrentTime.textContent = '0:00';
        if (musicTotalTime) musicTotalTime.textContent = '0:00';
        if (musicPlayPauseBtn) musicPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (musicModal) musicModal.style.display = 'none';
        if (miniPlayer) miniPlayer.style.display = 'none';
        isPlayerMinimized = false;
    }

    // Play All functionality and queue management
    let currentPlayQueue = [];
    let currentQueueIndex = 0;
    const MUSIC_AUTOPLAY_KEY = 'pt_music_autoplay_next_v1';
    let musicAutoPlayNext = false;
    let isPlayerMinimized = false; // Track if player is minimized

    // hydrate autoplay setting
    try {
        const savedAuto = localStorage.getItem(MUSIC_AUTOPLAY_KEY);
        musicAutoPlayNext = savedAuto === '1';
    } catch (_) { }

    function updateAutoplayToggleUI() {
        if (!musicAutoplayToggle) return;
        if (musicAutoPlayNext) {
            musicAutoplayToggle.style.background = 'linear-gradient(135deg, rgba(236,72,153,0.25), rgba(168,85,247,0.25))';
            musicAutoplayToggle.style.borderColor = 'rgba(236,72,153,0.55)';
            musicAutoplayToggle.style.color = '#fff';
        } else {
            musicAutoplayToggle.style.background = 'rgba(236,72,153,0.08)';
            musicAutoplayToggle.style.borderColor = 'rgba(236,72,153,0.35)';
            musicAutoplayToggle.style.color = '#ec4899';
        }
    }
    updateAutoplayToggleUI();
    if (musicAutoplayToggle) {
        musicAutoplayToggle.addEventListener('click', () => {
            musicAutoPlayNext = !musicAutoPlayNext;
            try { localStorage.setItem(MUSIC_AUTOPLAY_KEY, musicAutoPlayNext ? '1' : '0'); } catch (_) { }
            updateAutoplayToggleUI();
            showNotification(`Autoplay ${musicAutoPlayNext ? 'enabled' : 'disabled'}`, 'info');
        });
    }

    function setPlayQueue(tracks, startIndex) {
        if (!Array.isArray(tracks) || tracks.length === 0) {
            currentPlayQueue = [];
            currentQueueIndex = 0;
            return false;
        }
        currentPlayQueue = tracks;
        currentQueueIndex = Math.max(0, Math.min(startIndex || 0, tracks.length - 1));
        const t = currentPlayQueue[currentQueueIndex];
        playMusicTrack({ trackId: t.id, title: t.title, artistName: t.artist, coverSrc: t.cover });
        return true;
    }

    function playAllTracks(tracks) {
        if (!tracks || tracks.length === 0) {
            showNotification('No tracks to play', 'info');
            return;
        }
        // Ensure Autoplay Next is ON for Play All so it advances through the queue
        musicAutoPlayNext = true;
        try { localStorage.setItem(MUSIC_AUTOPLAY_KEY, '1'); } catch (_) { }
        updateAutoplayToggleUI();

        // Store the queue
        currentPlayQueue = tracks;
        currentQueueIndex = 0;

        // Play the first track
        const firstTrack = tracks[0];
        playMusicTrack({
            trackId: firstTrack.id,
            title: firstTrack.title,
            artistName: firstTrack.artist,
            coverSrc: firstTrack.cover
        });

        showNotification(`Playing ${tracks.length} track${tracks.length !== 1 ? 's' : ''}`, 'success');
    }

    function playNextInQueue() {
        if (currentPlayQueue.length === 0) return;

        currentQueueIndex++;

        if (currentQueueIndex >= currentPlayQueue.length) {
            // Queue finished
            currentPlayQueue = [];
            currentQueueIndex = 0;
            showNotification('Queue finished', 'info');
            if (musicAutoPlayNext) {
                // exit the player when autoplay is on and queue ends
                closeMusicModal();
            }
            return;
        }

        // Play next track
        const nextTrack = currentPlayQueue[currentQueueIndex];
        playMusicTrack({
            trackId: nextTrack.id,
            title: nextTrack.title,
            artistName: nextTrack.artist,
            coverSrc: nextTrack.cover
        });
    }

    function playPreviousInQueue() {
        if (currentPlayQueue.length === 0) return;
        // If we're >3s into the current track, just restart it
        if ((musicAudio?.currentTime || 0) > 3) {
            try { musicAudio.currentTime = 0; } catch (_) { }
            return;
        }
        if (currentQueueIndex <= 0) return;
        currentQueueIndex--;
        const prev = currentPlayQueue[currentQueueIndex];
        playMusicTrack({
            trackId: prev.id,
            title: prev.title,
            artistName: prev.artist,
            coverSrc: prev.cover
        });
    }

    // Modal Controls
    function updateTimeDisplays() {
        musicCurrentTime.textContent = fmtTime(musicAudio.currentTime || 0);
        musicTotalTime.textContent = fmtTime(musicAudio.duration || 0);
        const p = (musicAudio.currentTime || 0) / (musicAudio.duration || 1) * 100;
        musicProgressFill.style.width = `${p}%`;

        // Update mini player displays too
        if (miniCurrentTime) miniCurrentTime.textContent = fmtTime(musicAudio.currentTime || 0);
        if (miniTotalTime) miniTotalTime.textContent = fmtTime(musicAudio.duration || 0);
        if (miniProgressFill) miniProgressFill.style.width = `${p}%`;
    }

    // Minimize/Maximize functions
    function minimizeMusicPlayer() {
        if (musicModal) musicModal.style.display = 'none';
        if (miniPlayer) miniPlayer.style.display = 'block';
        isPlayerMinimized = true;
        // Sync play/pause state
        if (miniPlayPauseBtn) {
            miniPlayPauseBtn.innerHTML = musicAudio.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        }
    }

    function maximizeMusicPlayer() {
        if (miniPlayer) miniPlayer.style.display = 'none';
        if (musicModal) musicModal.style.display = 'flex';
        isPlayerMinimized = false;
    }

    if (musicAudio) {
        musicAudio.addEventListener('timeupdate', updateTimeDisplays);
        musicAudio.addEventListener('loadedmetadata', updateTimeDisplays);
        musicAudio.addEventListener('ended', () => {
            musicPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            // Auto-play next track in queue if available and enabled
            if (musicAutoPlayNext) {
                if (currentPlayQueue.length > 0 && currentQueueIndex < currentPlayQueue.length - 1) {
                    setTimeout(() => playNextInQueue(), 400);
                    return;
                }
                // If queue is empty or finished, exit player when autoplay is enabled
                if (currentPlayQueue.length === 0 || currentQueueIndex >= currentPlayQueue.length - 1) {
                    setTimeout(() => closeMusicModal(), 250);
                }
            }
        });
    }

    if (musicPlayPauseBtn) {
        musicPlayPauseBtn.addEventListener('click', async () => {
            if (musicAudio.paused) {
                try { await musicAudio.play(); } catch (_) { }
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                musicAudio.pause();
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
    }

    if (musicBackwardBtn) {
        musicBackwardBtn.addEventListener('click', () => {
            musicAudio.currentTime = Math.max(0, (musicAudio.currentTime || 0) - 10);
            updateTimeDisplays();
        });
    }

    if (musicForwardBtn) {
        musicForwardBtn.addEventListener('click', () => {
            const dur = musicAudio.duration || 0;
            musicAudio.currentTime = Math.min(dur, (musicAudio.currentTime || 0) + 10);
            updateTimeDisplays();
        });
    }

    if (musicNextTrackBtn) {
        musicNextTrackBtn.addEventListener('click', () => {
            if (currentPlayQueue.length === 0) return;
            // Jump to next or finish
            if (currentQueueIndex < currentPlayQueue.length - 1) playNextInQueue();
            else closeMusicModal();
        });
    }

    if (musicPrevTrackBtn) {
        musicPrevTrackBtn.addEventListener('click', () => {
            playPreviousInQueue();
        });
    }

    if (musicProgressBar) {
        musicProgressBar.addEventListener('click', (e) => {
            const rect = musicProgressBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = Math.min(1, Math.max(0, x / rect.width));
            musicAudio.currentTime = ratio * (musicAudio.duration || 0);
            updateTimeDisplays();
        });
    }

    if (musicVolumeSlider) {
        const setVolumeFromEvent = (clientX) => {
            const rect = musicVolumeSlider.getBoundingClientRect();
            const x = clientX - rect.left;
            const ratio = Math.min(1, Math.max(0, x / rect.width));
            musicAudio.volume = ratio;
            musicVolumeFill.style.width = `${ratio * 100}%`;
        };
        musicVolumeSlider.addEventListener('click', (e) => setVolumeFromEvent(e.clientX));
    }

    if (musicModalBack && musicModal) {
        musicModalBack.addEventListener('click', closeMusicModal);
        musicModal.addEventListener('click', (e) => {
            if (e.target === musicModal) closeMusicModal();
        });
    }

    // Minimize/Maximize button handlers
    if (musicModalMinimize) {
        musicModalMinimize.addEventListener('click', () => {
            minimizeMusicPlayer();
            // Update mini player info
            if (miniPlayerSongTitle) miniPlayerSongTitle.textContent = musicSongTitle.textContent;
            if (miniPlayerArtist) miniPlayerArtist.textContent = musicArtist.textContent;
        });
    }

    if (miniPlayerMaximize) {
        miniPlayerMaximize.addEventListener('click', maximizeMusicPlayer);
    }

    // Mini player controls
    if (miniPlayPauseBtn) {
        miniPlayPauseBtn.addEventListener('click', async () => {
            if (musicAudio.paused) {
                try { await musicAudio.play(); } catch (_) { }
                miniPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                musicAudio.pause();
                miniPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
    }

    if (miniBackwardBtn) {
        miniBackwardBtn.addEventListener('click', () => {
            musicAudio.currentTime = Math.max(0, (musicAudio.currentTime || 0) - 10);
            updateTimeDisplays();
        });
    }

    if (miniForwardBtn) {
        miniForwardBtn.addEventListener('click', () => {
            const dur = musicAudio.duration || 0;
            musicAudio.currentTime = Math.min(dur, (musicAudio.currentTime || 0) + 10);
            updateTimeDisplays();
        });
    }

    if (miniPrevTrackBtn) {
        miniPrevTrackBtn.addEventListener('click', () => {
            if (currentPlayQueue.length > 0 && currentQueueIndex > 0) {
                playPreviousInQueue();
            }
        });
    }

    if (miniNextTrackBtn) {
        miniNextTrackBtn.addEventListener('click', () => {
            if (currentPlayQueue.length > 0 && currentQueueIndex < currentPlayQueue.length - 1) {
                playNextInQueue();
            }
        });
    }

    if (miniProgressBar) {
        miniProgressBar.addEventListener('click', (e) => {
            const rect = miniProgressBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = Math.min(1, Math.max(0, x / rect.width));
            musicAudio.currentTime = ratio * (musicAudio.duration || 0);
            updateTimeDisplays();
        });
    }

    // Keyboard controls when modal open
    document.addEventListener('keydown', (e) => {
        if (!musicModal || musicModal.style.display === 'none') return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        const isTyping = ['INPUT', 'TEXTAREA'].includes(tag);
        if (e.key === 'Escape') {
            e.preventDefault();
            closeMusicModal();
        } else if (e.key === ' ' && !isTyping) {
            e.preventDefault();
            if (musicAudio.paused) {
                musicAudio.play();
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                musicAudio.pause();
                musicPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                if (miniPlayPauseBtn) miniPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        }
    });

    // Wire search input/button
    if (musicSearchBtn && musicSearchInput) {
        musicSearchBtn.addEventListener('click', () => searchMusic(musicSearchInput.value));
        musicSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchMusic(musicSearchInput.value);
        });
    }

    function openBookReader(readLink, title) {
        console.log('[BOOKS] Opening reader for:', title, readLink);
        booksReaderTitle.textContent = title;
        booksReaderFrame.src = readLink;
        booksReaderModal.style.display = 'flex';
        document.body.classList.add('books-reader-open');
    }

    function closeBooksReader() {
        booksReaderModal.style.display = 'none';
        booksReaderFrame.src = '';
        document.body.classList.remove('books-reader-open');
    }

    // Event listeners for books
    if (booksSearchBtn) {
        booksSearchBtn.addEventListener('click', () => {
            const query = booksSearchInput.value;
            searchBooks(query);
        });
    }

    if (booksSearchInput) {
        booksSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = booksSearchInput.value;
                searchBooks(query);
            }
        });
    }

    if (booksReaderBack) {
        booksReaderBack.addEventListener('click', closeBooksReader);
    }

    // Close reader modal when clicking outside
    booksReaderModal?.addEventListener('click', (e) => {
        if (e.target === booksReaderModal) {
            closeBooksReader();
        }
    });

    // Streaming Server Configuration
    const serverConfig = [
        {
            name: 'Videasy',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://player.videasy.net/movie/${id}`
                    : `https://player.videasy.net/tv/${id}/${season}/${episode}`
        },
        {
            name: 'LunaStream',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://lunastream.fun/watch/movie/${id}`
                    : `https://lunastream.fun/watch/tv/${id}/${season}/${episode}`
        },
        {
            name: 'VidRock',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidrock.net/movie/${id}`
                    : `https://vidrock.net/tv/${id}/${season}/${episode}`
        },
        {
            name: 'HexaWatch',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://hexa.watch/watch/movie/${id}`
                    : `https://hexa.watch/watch/tv/${id}/${season}/${episode}`
        },
        {
            name: 'FMovies',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://www.fmovies.gd/watch/movie/${id}`
                    : `https://www.fmovies.gd/watch/tv/${id}/${season}/${episode}`
        },
        {
            name: 'Xprime',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://xprime.tv/watch/${id}`
                    : `https://xprime.tv/watch/${id}/${season}/${episode}`
        },
        {
            name: 'Vidnest',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidnest.fun/movie/${id}`
                    : `https://vidnest.fun/tv/${id}/${season}/${episode}`
        },
        {
            name: 'veloratv',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://veloratv.ru/watch/movie/${id}`
                    : `https://veloratv.ru/watch/tv/${id}/${season}/${episode}`
        },
        {
            name: 'Vidfast 1',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidfast.pro/movie/${id}`
                    : `https://vidfast.pro/tv/${id}/${season}/${episode}`
        },
        {
            name: 'Vidfast 2',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidfast.to/embed/movie/${id}`
                    : `https://vidfast.to/embed/tv/${id}/${season}/${episode}`
        },
        {
            name: '111Movies',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://111movies.com/movie/${id}`
                    : `https://111movies.com/tv/${id}/${season}/${episode}`
        },

        {
            name: 'MovieClub',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://moviesapi.club/movie/${id}`
                    : `https://moviesapi.club/tv/${id}-${season}-${episode}`
        },
        {
            name: 'MapleTV',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://mapple.uk/watch/movie/${id}`
                    : `https://mapple.uk/watch/tv/${id}-${season}-${episode}`
        },
        {
            name: '2Embed',
            getUrl: (type, id, season, episode) =>
                `https://multiembed.mov/?video_id=${id}&tmdb=1&media_type=${type}${type === 'tv' ? `&season=${season}&episode=${episode}` : ''}`
        },
        {
            name: 'SmashyStream',
            getUrl: (type, id, season, episode) =>
            (type === 'movie'
                ? `https://player.smashy.stream/movie/${id}`
                : `https://player.smashy.stream/tv/${id}?s=${season}&e=${episode}`)
        },
        {
            name: 'Autoembed',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://player.autoembed.cc/embed/movie/${id}`
                    : `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`
        },
        {
            name: 'GoDrivePlayer',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://godriveplayer.com/player.php?imdb=${id}`
                    : `https://godriveplayer.com/player.php?type=tv&tmdb=${id}&season=${season}&episode=${episode}`
        },
        {
            name: 'VidWTF Premium',
            getUrl: (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.wtf/api/4/movie/?id=${id}&color=e01621`
                    : `https://vidsrc.wtf/api/4/tv/?id=${id}&s=${season}&e=${episode}&color=e01621`
        }
    ];

    // Server Selection Modal Elements
    const serverSelectionModal = document.getElementById('server-selection-modal');
    const serverSelectionBack = document.getElementById('server-selection-back');
    const serverSelectionTitle = document.getElementById('server-selection-title');
    const serverMediaPoster = document.getElementById('server-media-poster');
    const serverMediaTitle = document.getElementById('server-media-title');
    const serverMediaSubtitle = document.getElementById('server-media-subtitle');
    const serverMediaYear = document.getElementById('server-media-year');
    const serverMediaRating = document.getElementById('server-media-rating');
    const serverDropdown = document.getElementById('server-dropdown');
    const serverWatchBtn = document.getElementById('server-watch-btn');
    const serverTorrentBtn = document.getElementById('server-torrent-btn');

    // Video Player Modal Elements
    const videoPlayerModal = document.getElementById('video-player-modal');
    const videoPlayerBack = document.getElementById('video-player-back');
    const videoPlayerTitle = document.getElementById('video-player-title');
    const videoPlayerFrame = document.getElementById('video-player-frame');
    const videoPlayerFullscreen = document.getElementById('video-player-fullscreen');

    // Media Data
    let currentMediaData = null;

    // Initialize server dropdown
    function initServerDropdown() {
        serverDropdown.innerHTML = '';
        serverConfig.forEach(server => {
            const option = document.createElement('option');
            option.value = server.name;
            option.textContent = server.name;
            if (server.name === selectedServer) {
                option.selected = true;
            }
            serverDropdown.appendChild(option);
        });
    }

    // Show server selection modal
    function showServerSelection(mediaData) {
        currentMediaData = mediaData;
        console.log('[SERVERS] Showing server selection for:', mediaData);

        // Populate media info
        serverMediaTitle.textContent = mediaData.title;
        serverMediaSubtitle.textContent = mediaData.subtitle || '';
        serverMediaYear.textContent = mediaData.year || '';
        serverMediaRating.textContent = mediaData.rating ? `★ ${mediaData.rating}` : '';
        serverMediaPoster.src = mediaData.poster || '';

        // Initialize dropdown
        initServerDropdown();

        // Show modal
        serverSelectionModal.style.display = 'flex';
        document.body.classList.add('server-modal-open');
    }

    // Hide server selection modal
    function hideServerSelection() {
        console.log('[SERVERS] Hiding server selection modal');

        // Close any active video player first
        const serverVideoSection = document.getElementById('server-video-section');
        if (serverVideoSection && serverVideoSection.style.display !== 'none') {
            console.log('[SERVERS] Closing active video player before hiding modal');
            closeVideoPlayer();
        }

        // Hide the modal
        serverSelectionModal.style.display = 'none';
        document.body.classList.remove('server-modal-open');
        currentMediaData = null;

        console.log('[SERVERS] Server selection modal hidden and video stopped');
    }

    // Debug: Test if showServerSelection is accessible
    console.log('[DEBUG] showServerSelection function exists:', typeof showServerSelection);

    // Show embedded video player
    function showVideoPlayer(url, title) {
        console.log('[SERVERS] Opening video player for:', title, url);

        // Update Discord presence for streaming
        // Use TMDB title from currentContent, not the passed title parameter
        const tmdbTitle = currentContent?.title || currentContent?.name || title;

        // Determine provider based on selectedProvider setting
        let provider;
        if (selectedProvider === 'jackett') {
            provider = 'Jackett';
        } else if (selectedProvider === 'nuvio') {
            provider = 'Nuvio';
        } else if (selectedProvider === 'comet') {
            provider = 'Comet';
        } else if (selectedProvider === '111477') {
            provider = '111477';
        } else if (selectedProvider === 'moviebox') {
            provider = 'MovieBox';
        } else if (selectedProvider === 'torrentio') {
            provider = 'Torrentio';
        } else if (selectedProvider === 'torrentless') {
            provider = 'PlayTorrio';
        } else {
            provider = 'App Sources';  // Default fallback
        }

        // For TV shows, pass the season number
        const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
        updateDiscordForStreaming(tmdbTitle, provider, seasonNum);

        // Get embedded video elements
        const serverVideoSection = document.getElementById('server-video-section');
        const serverVideoTitle = document.getElementById('server-video-title');
        const serverVideoFrame = document.getElementById('server-video-frame');

        if (serverVideoSection && serverVideoTitle && serverVideoFrame) {
            // Update title and URL
            serverVideoTitle.textContent = title;
            serverVideoFrame.removeAttribute('sandbox');

            // Store the expected URL pattern for monitoring
            serverVideoFrame.expectedUrl = url;
            serverVideoFrame.originalDomain = new URL(url).origin;

            // Set up URL monitoring
            setupUrlMonitoring(serverVideoFrame, url);

            // Set the iframe source
            serverVideoFrame.src = url;

            // Show the video section
            serverVideoSection.style.display = 'block';

            // Auto-scroll to video player after a brief delay
            setTimeout(() => {
                serverVideoSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 500);

            console.log('[SERVERS] Embedded video player displayed successfully');
        } else {
            console.error('[SERVERS] Embedded video elements not found, falling back to fullscreen');
            // Fallback to original fullscreen method
            videoPlayerTitle.textContent = title;
            videoPlayerFrame.removeAttribute('sandbox');
            videoPlayerFrame.src = url;
            videoPlayerModal.style.display = 'flex';
            document.body.classList.add('video-modal-open');
            hideServerSelection();
        }
    }

    // Setup URL monitoring for iframe
    function setupUrlMonitoring(iframe, expectedUrl) {
        // Extract expected URL patterns for validation - STRICT MATCHING
        const urlPatterns = {
            'vidrock.net': /^https:\/\/vidrock\.net\/(movie|tv)\/\d+(\?.*)?$/,
            'hexa.watch': /^https:\/\/hexa\.watch\/watch\/(movie|tv)\/\d+(\?.*)?$/,
            'www.fmovies.gd': /^https:\/\/www\.fmovies\.gd\/watch\/(movie|tv)\/\d+(\?.*)?$/,
            'xprime.tv': /^https:\/\/xprime\.tv\/watch\/\d+(\?.*)?$/,
            'vidnest.fun': /^https:\/\/vidnest\.fun\/(movie|tv)\/\d+(\?.*)?$/,
            'player.videasy.net': /^https:\/\/player\.videasy\.net\/(movie|tv)\/\d+(\?.*)?$/,
            'lunastream.fun': /^https:\/\/lunastream\.fun\/watch\/(movie\/\d+|tv\/\d+\/\d+\/\d+)(\?.*)?$/,
            'veloratv.ru': /^https:\/\/veloratv\.ru\/watch\/(movie|tv)\/\d+(\?.*)?$/,
            'vidfast.pro': /^https:\/\/vidfast\.pro\/(movie\/\d+|tv\/\d+\/\d+\/\d+)(\?.*)?$/,
            'vidfast.to': /^https:\/\/vidfast\.to\/embed\/(movie\/\d+|tv\/\d+\/\d+\/\d+)(\?.*)?$/,
            '111movies.com': /^https:\/\/111movies\.com\/(movie\/\d+|tv\/\d+\/\d+\/\d+)(\?.*)?$/,
            'moviesapi.club': /^https:\/\/moviesapi\.club\/(movie\/\d+|tv\/\d+-\d+-\d+)(\?.*)?$/,
            'mapple.uk': /^https:\/\/mapple\.uk\/watch\/(movie\/\d+|tv\/\d+-\d+-\d+)(\?.*)?$/,
            'multiembed.mov': /^https:\/\/multiembed\.mov\/\?video_id=\d+&tmdb=1&media_type=(movie|tv)(\&.*)?$/,
            'player.smashy.stream': /^https:\/\/player\.smashy\.stream\/(movie\/\d+|tv\/\d+\?s=\d+&e=\d+)(\?.*)?$/,
            'player.autoembed.cc': /^https:\/\/player\.autoembed\.cc\/embed\/(movie|tv)\/\d+(\?.*)?$/,
            'godriveplayer.com': /^https:\/\/godriveplayer\.com\/player\.php\?(imdb=\d+|type=tv&tmdb=\d+&season=\d+&episode=\d+)(\&.*)?$/,
            'databasegdriveplayer.xyz': /^https:\/\/databasegdriveplayer\.xyz\/+player\.php\?tmdb=\d+(\&.*)?$/,
            'database.gdriveplayer.us': /^https:\/\/database\.gdriveplayer\.us\/player\.php\?type=series&tmdb=\d+&season=\d+&episode=\d+(\&.*)?$/,
            'cinemaos.tech': /^https:\/\/cinemaos\.tech\/player\/\d+(?:\/\d+\/\d+)?(\?.*)?$/,
            'primesrc.me': /^https:\/\/primesrc\.me\/embed\/(movie|tv)\?tmdb=\d+(?:&season=\d+&episode=\d+)?(\&.*)?$/,
            'vidsrc.wtf': /^https:\/\/vidsrc\.wtf\/api\/(1|2|3|4)\/(movie|tv)\/\?id=\d+(\&.*)?$/
        };

        // Get the domain from the expected URL
        const expectedDomain = new URL(expectedUrl).hostname;
        const pattern = urlPatterns[expectedDomain];

        if (!pattern) {
            console.warn('[SERVERS] No URL pattern defined for domain:', expectedDomain);
            return;
        }

        console.log('[SERVERS] Setting up URL monitoring for domain:', expectedDomain);
        console.log('[SERVERS] Expected URL pattern:', pattern);
        console.log('[SERVERS] Initial URL:', expectedUrl);

        // Monitor iframe load events
        iframe.addEventListener('load', function () {
            try {
                // Try to access iframe location (may be blocked by CORS)
                const currentUrl = iframe.contentWindow.location.href;
                console.log('[SERVERS] Iframe loaded URL:', currentUrl);

                // Check if current URL matches expected pattern
                if (!pattern.test(currentUrl)) {
                    console.error('[SERVERS] ❌ URL VIOLATION DETECTED!');
                    console.error('[SERVERS] Current URL:', currentUrl);
                    console.error('[SERVERS] Expected pattern:', pattern.toString());
                    console.error('[SERVERS] Closing player immediately!');

                    closeVideoPlayer();
                    return;
                } else {
                    console.log('[SERVERS] ✅ URL pattern valid:', currentUrl);
                }
            } catch (e) {
                // CORS restriction - iframe is on different domain
                console.log('[SERVERS] Iframe access blocked (CORS) - this is normal for streaming sites');
            }
        });

        // More aggressive monitoring - check on any iframe activity
        iframe.addEventListener('beforeunload', function () {
            console.log('[SERVERS] Iframe beforeunload detected - page changing');
        });

        // Periodic URL checking (backup method) - more frequent
        const monitorInterval = setInterval(() => {
            try {
                if (!iframe || !iframe.contentWindow || !iframe.parentNode) {
                    console.log('[SERVERS] Iframe no longer exists, clearing monitor');
                    clearInterval(monitorInterval);
                    return;
                }

                const currentUrl = iframe.contentWindow.location.href;

                // If we can access the URL and it doesn't match pattern, close player
                if (currentUrl && !pattern.test(currentUrl)) {
                    console.error('[SERVERS] ❌ PERIODIC CHECK: URL violation detected!');
                    console.error('[SERVERS] Current URL:', currentUrl);
                    console.error('[SERVERS] Expected pattern:', pattern.toString());

                    clearInterval(monitorInterval);

                    // Close player silently when navigation is detected
                    console.log('[SERVERS] Player closed: Detected navigation away from streaming content');
                    closeVideoPlayer();
                    return;
                }

                console.log('[SERVERS] 🔍 Periodic check: URL monitoring active');
            } catch (e) {
                // Expected - CORS protection means iframe is still on streaming site
                console.log('[SERVERS] 🔍 Periodic check: CORS blocked (streaming site active)');
            }
        }, 1000); // Check every 1 second (more frequent)

        // Store interval for cleanup
        iframe.monitorInterval = monitorInterval;
    }

    // Close video player function
    function closeVideoPlayer() {
        console.log('[SERVERS] Closing video player due to URL violation');

        // Clear Discord presence when video closes
        if (discordStreamingActive) {
            clearDiscordPresence();
        }

        const serverVideoSection = document.getElementById('server-video-section');
        const serverVideoFrame = document.getElementById('server-video-frame');

        if (serverVideoSection) {
            // Hide the video player box
            serverVideoSection.style.display = 'none';
            console.log('[SERVERS] Video player box hidden');
        }

        if (serverVideoFrame) {
            // Clear monitoring interval
            if (serverVideoFrame.monitorInterval) {
                clearInterval(serverVideoFrame.monitorInterval);
                console.log('[SERVERS] URL monitoring interval cleared');
            }

            // Remove the server content from iframe
            serverVideoFrame.src = 'about:blank';
            serverVideoFrame.removeAttribute('expectedUrl');
            serverVideoFrame.removeAttribute('originalDomain');

            console.log('[SERVERS] Iframe cleared and server removed');
        }

        // Also clear the video title
        const serverVideoTitle = document.getElementById('server-video-title');
        if (serverVideoTitle) {
            serverVideoTitle.textContent = 'Player Closed';
        }

        console.log('[SERVERS] Video player completely shut down');
    }

    // Hide video player
    function hideVideoPlayer() {
        videoPlayerModal.style.display = 'none';
        videoPlayerFrame.src = '';
        document.body.classList.remove('video-modal-open');
    }

    // Get streaming URL for current media
    function getStreamingUrl(mediaData, serverName) {
        console.log('[SERVERS] Generating URL for server:', serverName, 'media:', mediaData);

        // Define server configurations inline (serverConfig not accessible from this scope)
        const servers = {
            'CinemaOS': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://cinemaos.tech/player/${id}`
                    : `https://cinemaos.tech/player/${id}/${season}/${episode}`,
            'Videasy': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://player.videasy.net/movie/${id}`
                    : `https://player.videasy.net/tv/${id}/${season}/${episode}`,
            'LunaStream': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://lunastream.fun/watch/movie/${id}`
                    : `https://lunastream.fun/watch/tv/${id}/${season}/${episode}`,
            'VidRock': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidrock.net/movie/${id}`
                    : `https://vidrock.net/tv/${id}/${season}/${episode}`,
            'HexaWatch': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://hexa.watch/watch/movie/${id}`
                    : `https://hexa.watch/watch/tv/${id}/${season}/${episode}`,
            'FMovies': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://www.fmovies.gd/watch/movie/${id}`
                    : `https://www.fmovies.gd/watch/tv/${id}/${season}/${episode}`,
            'Xprime': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://xprime.tv/watch/${id}`
                    : `https://xprime.tv/watch/${id}/${season}/${episode}`,
            'Vidnest': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidnest.fun/movie/${id}`
                    : `https://vidnest.fun/tv/${id}/${season}/${episode}`,
            'veloratv': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://veloratv.ru/watch/movie/${id}`
                    : `https://veloratv.ru/watch/tv/${id}/${season}/${episode}`,
            'Vidfast 1': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidfast.pro/movie/${id}`
                    : `https://vidfast.pro/tv/${id}/${season}/${episode}`,
            'Vidfast 2': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidfast.to/embed/movie/${id}`
                    : `https://vidfast.to/embed/tv/${id}/${season}/${episode}`,
            '111Movies': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://111movies.com/movie/${id}`
                    : `https://111movies.com/tv/${id}/${season}/${episode}`,
            'VidSrc 1': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.wtf/api/1/movie/?id=${id}&color=e01621`
                    : `https://vidsrc.wtf/api/1/tv/?id=${id}&s=${season}&e=${episode}&color=e01621`,
            'VidSrc 2': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.wtf/api/2/movie/?id=${id}&color=e01621`
                    : `https://vidsrc.wtf/api/2/tv/?id=${id}&s=${season}&e=${episode}&color=e01621`,
            'VidSrc 3': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.wtf/api/3/movie/?id=${id}&color=e01621`
                    : `https://vidsrc.wtf/api/3/tv/?id=${id}&s=${season}&e=${episode}&color=e01621`,
            'VidSrc 4': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.wtf/api/4/movie/?id=${id}&color=e01621`
                    : `https://vidsrc.wtf/api/4/tv/?id=${id}&s=${season}&e=${episode}&color=e01621`,
            'PrimeSrc': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://primesrc.me/embed/movie?tmdb=${id}`
                    : `https://primesrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`,
            'MovieClub': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://moviesapi.club/movie/${id}`
                    : `https://moviesapi.club/tv/${id}-${season}-${episode}`,
            'MapleTV': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://mapple.uk/watch/movie/${id}`
                    : `https://mapple.uk/watch/tv/${id}-${season}-${episode}`,
            '2Embed': (type, id, season, episode) =>
                `https://multiembed.mov/?video_id=${id}&tmdb=1&media_type=${type}${type === 'tv' ? `&season=${season}&episode=${episode}` : ''}`,
            'SmashyStream': (type, id, season, episode) =>
            (type === 'movie'
                ? `https://player.smashy.stream/movie/${id}`
                : `https://player.smashy.stream/tv/${id}?s=${season}&e=${episode}`),
            'Autoembed': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://player.autoembed.cc/embed/movie/${id}`
                    : `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`,
            'GoDrivePlayer': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://godriveplayer.com/player.php?imdb=${id}`
                    : `https://godriveplayer.com/player.php?type=tv&tmdb=${id}&season=${season}&episode=${episode}`,
            'VidWTF Premium': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.wtf/api/4/movie/?id=${id}&color=e01621`
                    : `https://vidsrc.wtf/api/4/tv/?id=${id}&s=${season}&e=${episode}&color=e01621`,
            // New additional servers
            'CinemaOS Embed': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://cinemaos.tech/embed/movie/${id}`
                    : `https://cinemaos.tech/embed/tv/${id}/${season}/${episode}`,

            'GDrivePlayer API': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://databasegdriveplayer.xyz/player.php?tmdb=${id}`
                    : `https://database.gdriveplayer.us/player.php?type=series&tmdb=${id}&season=${season}&episode=${episode}`,
            'Nontongo': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://nontongo.win/embed/movie/${id}`
                    : `https://nontongo.win/embed/tv/${id}/${season}/${episode}`,

            'SpencerDevs': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://spencerdevs.xyz/movie/${id}`
                    : `https://spencerdevs.xyz/tv/${id}/${season}/${episode}`,
            'VidAPI': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidapi.xyz/embed/movie/${id}`
                    : `https://vidapi.xyz/embed/tv/${id}/${season}/${episode}`,
            'Vidify': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidify.top/embed/movie/${id}`
                    : `https://vidify.top/embed/tv/${id}/${season}/${episode}`,
            'VidSrc CX': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.cx/embed/movie/${id}`
                    : `https://vidsrc.cx/embed/tv/${id}/${season}/${episode}`,
            'VidSrc ME': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.me/embed/movie/${id}`
                    : `https://vidsrc.me/embed/tv/${id}/${season}/${episode}`,
            'VidSrc TO': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.to/embed/movie/${id}`
                    : `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`,
            'VidSrc VIP': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vidsrc.vip/embed/movie/${id}`
                    : `https://vidsrc.vip/embed/tv/${id}/${season}/${episode}`,
            'VixSrc': (type, id, season, episode) =>
                type === 'movie'
                    ? `https://vixsrc.to/movie/${id}/`
                    : `https://vixsrc.to/tv/${id}/${season}/${episode}/`
        };

        const serverFunction = servers[serverName];
        if (!serverFunction) {
            console.error('[SERVERS] Server not found:', serverName);
            return null;
        }

        const url = serverFunction(
            mediaData.type,
            mediaData.id,
            mediaData.season,
            mediaData.episode
        );

        console.log('[SERVERS] Generated URL:', url);
        return url;
    }

    // Event listeners for server selection
    if (serverSelectionBack) {
        serverSelectionBack.addEventListener('click', hideServerSelection);
    }

    if (serverDropdown) {
        serverDropdown.addEventListener('change', (e) => {
            selectedServer = e.target.value;
            localStorage.setItem('selectedServer', selectedServer);
            console.log('[SERVERS] Selected server:', selectedServer);
        });
    }

    if (serverWatchBtn) {
        serverWatchBtn.addEventListener('click', () => {
            console.log('[SERVERS] Start Watching button clicked!');

            // Try to get media data from multiple sources
            const mediaData = currentMediaData || window.currentMediaData;
            console.log('[SERVERS] currentMediaData:', currentMediaData);
            console.log('[SERVERS] window.currentMediaData:', window.currentMediaData);
            console.log('[SERVERS] Using mediaData:', mediaData);

            if (!mediaData) {
                console.error('[SERVERS] No media data available');
                alert('No media selected. Please select a movie or show first.');
                return;
            }

            // For TV shows, check if season/episode is selected
            if (mediaData.type === 'tv') {
                // Use global season/episode state if available, default to S1E1
                const season = mediaData.season || currentSeason || lastSearchedSeason || 1;
                const episode = mediaData.episode || lastSearchedEpisode || 1;

                console.log('[SERVERS] TV show detected - Season:', season, 'Episode:', episode);

                // Add season/episode to mediaData for URL generation
                mediaData.season = season;
                mediaData.episode = episode;
            }

            // Get current selected server from dropdown
            const currentSelectedServer = serverDropdown ? serverDropdown.value : (localStorage.getItem('selectedServer') || 'VidSrc TO');
            console.log('[SERVERS] Selected server:', currentSelectedServer);

            const streamUrl = getStreamingUrl(mediaData, currentSelectedServer);
            console.log('[SERVERS] Generated stream URL:', streamUrl);

            if (streamUrl) {
                const title = mediaData.type === 'tv'
                    ? `${mediaData.title} S${mediaData.season}E${mediaData.episode} - ${currentSelectedServer}`
                    : `${mediaData.title} - ${currentSelectedServer}`;
                console.log('[SERVERS] Calling showVideoPlayer with:', title);
                showVideoPlayer(streamUrl, title);
            } else {
                showNotification('Failed to generate streaming URL', 'error');
            }
        });
    }

    if (serverTorrentBtn) {
        serverTorrentBtn.addEventListener('click', () => {
            console.log('[SERVERS] Use Torrent Instead button clicked!');

            // Turn off streaming servers mode
            localStorage.setItem('useStreamingServers', 'false');
            console.log('[SERVERS] Disabled streaming servers mode');

            // Update toggle in settings for ALL instances
            const useStreamingServersToggles = document.querySelectorAll('#useStreamingServersToggle');
            useStreamingServersToggles.forEach(toggle => {
                toggle.checked = false;
            });

            // Update button text
            updateWatchButtonText();

            // Hide server selection modal
            hideServerSelection();

            // Fall back to torrent mode
            if (currentMediaData && currentMediaData.fallbackToTorrent) {
                console.log('[SERVERS] Calling fallback function');
                currentMediaData.fallbackToTorrent();
            } else {
                console.log('[SERVERS] No fallback function, manually showing torrents');
                // Manually trigger torrent display
                const streamingMode = localStorage.getItem('useStreamingServers') === 'true';
                console.log('[SERVERS] Streaming mode after toggle:', streamingMode);
                if (!streamingMode && typeof showTorrents === 'function') {
                    showTorrents(null, currentMediaData?.season, currentMediaData?.episode);
                }
            }
        });
    }

    // Embedded video player event handlers
    const serverVideoClose = document.getElementById('server-video-close');
    const serverVideoFrame = document.getElementById('server-video-frame');

    if (serverVideoClose) {
        serverVideoClose.addEventListener('click', () => {
            closeVideoPlayer();
        });
    }

    // Server switching while watching
    if (serverDropdown) {
        serverDropdown.addEventListener('change', (e) => {
            const newServer = e.target.value;
            const serverVideoSection = document.getElementById('server-video-section');

            // Only switch if video is currently playing
            if (serverVideoSection && serverVideoSection.style.display !== 'none' && currentMediaData) {
                console.log('[SERVERS] Switching to server:', newServer);

                // Update selected server
                localStorage.setItem('selectedServer', newServer);

                // Generate new streaming URL
                const newStreamUrl = getStreamingUrl(currentMediaData, newServer);

                if (newStreamUrl && serverVideoFrame) {
                    // Update iframe source
                    serverVideoFrame.src = newStreamUrl;

                    // Update title to show new server
                    const serverVideoTitle = document.getElementById('server-video-title');
                    if (serverVideoTitle) {
                        serverVideoTitle.textContent = `${currentMediaData.title} - ${newServer}`;
                    }

                    console.log('[SERVERS] Successfully switched to:', newServer);
                } else {
                    console.error('[SERVERS] Failed to generate URL for server:', newServer);
                    // Revert dropdown selection
                    const oldServer = localStorage.getItem('selectedServer') || 'VidSrc TO';
                    e.target.value = oldServer;
                }
            }
        });
    }

    // Video player event listeners
    if (videoPlayerBack) {
        videoPlayerBack.addEventListener('click', () => {
            hideVideoPlayer();
            if (currentMediaData) {
                showServerSelection(currentMediaData);
            }
        });
    }

    if (videoPlayerFullscreen) {
        videoPlayerFullscreen.addEventListener('click', () => {
            const frame = videoPlayerFrame;
            if (frame.requestFullscreen) {
                frame.requestFullscreen();
            } else if (frame.webkitRequestFullscreen) {
                frame.webkitRequestFullscreen();
            } else if (frame.msRequestFullscreen) {
                frame.msRequestFullscreen();
            }
        });
    }

    // Disable closing server selection when clicking on the backdrop
    // Absorb clicks on the empty area so they don't close or trigger anything behind
    serverSelectionModal?.addEventListener('click', (e) => {
        if (e.target === serverSelectionModal) {
            e.stopPropagation();
            // Intentionally do nothing: require explicit Back button to close
        }
    });
    // Also stop click propagation inside the content
    const serverSelectionContent = document.querySelector('#server-selection-modal .server-selection-content');
    serverSelectionContent?.addEventListener('click', (e) => e.stopPropagation());

    videoPlayerModal?.addEventListener('click', (e) => {
        if (e.target === videoPlayerModal) {
            hideVideoPlayer();
        }
    });

    // Update watch button text based on streaming mode
    function updateWatchButtonText() {
        const watchBtn = document.getElementById('watchNowBtn');
        const note = document.getElementById('watchNowNote');
        const toggleBtn = document.getElementById('useStreamsBtn');
        const streamingMode = localStorage.getItem('useStreamingServers') === 'true';

        if (watchBtn) {
            if (streamingMode) {
                // For TV shows in streaming mode, hide the button and show hint
                if (currentMediaType === 'tv') {
                    watchBtn.style.display = 'none';
                    if (note) note.style.display = '';
                } else {
                    // For MOVIES in streaming mode, always show Watch Now
                    watchBtn.style.display = '';
                    watchBtn.innerHTML = '<i class="fas fa-play"></i> Watch Now';
                    if (note) note.style.display = 'none';
                }
            } else {
                // Torrent mode - show Find Media for both movies and TV
                watchBtn.style.display = '';
                watchBtn.innerHTML = '<i class="fas fa-play"></i> Find Media';
                if (note) note.style.display = 'none';
            }
        }

        // Update the toggle button label between Streams/Torrents
        if (toggleBtn) {
            if (streamingMode) {
                toggleBtn.innerHTML = '<i class="fas fa-magnet"></i> Use Torrents instead';
            } else {
                toggleBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Use Streams instead';
            }
        }
    }

    // Initialize streaming servers setting for ALL instances
    const useStreamingServersToggles = document.querySelectorAll('#useStreamingServersToggle');
    if (useStreamingServersToggles.length > 0) {
        const currentSetting = localStorage.getItem('useStreamingServers') === 'true';

        useStreamingServersToggles.forEach(toggle => {
            toggle.checked = currentSetting;
            toggle.addEventListener('change', (e) => {
                const newValue = e.target.checked;
                localStorage.setItem('useStreamingServers', newValue);
                console.log('[SERVERS] Streaming servers mode:', newValue ? 'enabled' : 'disabled');

                // Update ALL other toggles to match
                useStreamingServersToggles.forEach(t => t.checked = newValue);

                updateWatchButtonText(); // Update button text when mode changes
            });
        });
    }

    // Set initial button text
    updateWatchButtonText();

    // Downloader wiring (top-level)
    const downloaderQuery = document.getElementById('downloaderQuery');
    const downloaderBtn = document.getElementById('downloaderSearchBtn');
    const downloaderResults = document.getElementById('downloaderResults');
    const downloaderEmpty = document.getElementById('downloaderEmpty');
    const filterMoviesBtn = document.getElementById('downloaderFilterMovies');
    const filterTvBtn = document.getElementById('downloaderFilterTV');
    let downloaderType = 'movies'; // 'movies' | 'tv'
    async function runDownloaderSearch(q) {
        if (!downloaderResults || !downloaderEmpty) return;
        const query = (q || '').trim();
        downloaderResults.innerHTML = '';
        downloaderResults.classList.remove('single');
        if (!query) { downloaderEmpty.style.display = ''; downloaderEmpty.textContent = 'Type a search above to see results.'; return; }
        downloaderEmpty.style.display = 'none';
        try {
            // Try local 111477 service first
            let results = [];
            try {
                const res = await fetch(`http://localhost:6987/111477/api/tmdb/search/${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    results = Array.isArray(data?.results) ? data.results : [];
                }
            } catch (_) { }
            if (!results.length) {
                // Fallback: direct TMDB (movies + TV)
                const [mRes, tvRes] = await Promise.all([
                    fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1&include_adult=false`),
                    fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1&include_adult=false`)
                ]);
                const [mData, tvData] = [await mRes.json(), await tvRes.json()];
                const mResults = Array.isArray(mData?.results) ? mData.results.map(r => ({
                    title: r.title,
                    posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                    releaseDate: r.release_date || '',
                    year: r.release_date ? String(r.release_date).slice(0, 4) : '',
                    tmdbId: r.id,
                    mediaType: 'movie'
                })) : [];
                const tvResults = Array.isArray(tvData?.results) ? tvData.results.map(r => ({
                    title: r.name,
                    posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                    releaseDate: r.first_air_date || '',
                    year: r.first_air_date ? String(r.first_air_date).slice(0, 4) : '',
                    tmdbId: r.id,
                    mediaType: 'tv'
                })) : [];
                results = [...mResults, ...tvResults];
            }
            // Filter by selected type
            const filtered = results.filter((item) => {
                const mt = (item.mediaType || item.media_type || (item.firstAirDate || item.name ? 'tv' : 'movie')).toLowerCase();
                return downloaderType === 'movies' ? mt === 'movie' : mt === 'tv';
            });
            if (!filtered.length) {
                // Fallback fetch type-specific from TMDB if none after filtering
                if (downloaderType === 'tv') {
                    const tvRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1&include_adult=false`);
                    const tvData = await tvRes.json();
                    results = Array.isArray(tvData?.results) ? tvData.results.map(r => ({
                        title: r.name,
                        posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                        releaseDate: r.first_air_date || '',
                        year: r.first_air_date ? String(r.first_air_date).slice(0, 4) : '',
                        tmdbId: r.id,
                        mediaType: 'tv'
                    })) : [];
                } else {
                    const mRes2 = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1&include_adult=false`);
                    const mData2 = await mRes2.json();
                    results = Array.isArray(mData2?.results) ? mData2.results.map(r => ({
                        title: r.title,
                        posterPath: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                        releaseDate: r.release_date || '',
                        year: r.release_date ? String(r.release_date).slice(0, 4) : '',
                        tmdbId: r.id,
                        mediaType: 'movie'
                    })) : [];
                }
            } else {
                results = filtered;
            }
            results = results.slice(0, 10);
            if (!results.length) {
                downloaderEmpty.style.display = '';
                downloaderEmpty.textContent = downloaderType === 'movies' ? 'No movies found.' : 'No TV shows found.';
                return;
            }
            const frag = document.createDocumentFragment();
            results.forEach((item) => {
                const card = document.createElement('div');
                card.className = 'downloader-item';
                card.tabIndex = 0;
                const poster = item.posterPath || '';
                const title = item.title || item.name || item.constructedName || 'Untitled';
                const year = item.year || (item.releaseDate ? String(item.releaseDate).slice(0, 4) : '');
                const tmdbId = item.tmdbId || item.id || item.tmdb_id || '';
                const mediaType = item.mediaType || item.media_type || (item.firstAirDate || item.name ? 'tv' : 'movie');
                if (tmdbId) card.dataset.tmdbId = String(tmdbId);
                if (mediaType) card.dataset.mediaType = String(mediaType);
                card.innerHTML = `
                            <img loading="lazy" class="downloader-thumb" src="${poster}" alt="${title.replace(/"/g, '&quot;')}" onerror="this.style.opacity=0;" />
                            <div class="downloader-meta">
                                <div class="downloader-title">${title}</div>
                                <div class="downloader-year">${year || ''}</div>
                            </div>`;
                card.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    // Remove other cards and center the selected one
                    const container = downloaderResults;
                    document.querySelectorAll('.downloader-item').forEach(el => { if (el !== card) el.remove(); });
                    container.classList.add('single');
                    document.querySelectorAll('.downloader-item.selected').forEach(el => el.classList.remove('selected'));
                    card.classList.add('selected');
                    const id = card.dataset.tmdbId;
                    const type = (card.dataset.mediaType || 'movie').toLowerCase();
                    // Remove any previous blocks (files, tv controls)
                    container.querySelectorAll('.downloader-files-card, .downloader-tv-controls').forEach(el => el.remove());
                    if (id) {
                        if (type === 'tv') {
                            fetchAndRenderTvSelectors(id, container);
                        } else {
                            fetchDownloaderFilesByTmdb(id, container);
                        }
                    }
                });
                frag.appendChild(card);
            });
            downloaderResults.appendChild(frag);
        } catch (err) {
            console.error('Downloader search failed:', err);
            downloaderEmpty.style.display = '';
            downloaderEmpty.textContent = 'Search failed.';
        }
    }
    function renderFilesCard(files, container, loadKey) {
        // If a key is provided but doesn't match the latest, skip (prevents duplicates)
        if (loadKey && container.dataset.filesLoadKey && container.dataset.filesLoadKey !== loadKey) return;
        const filesWrap = document.createElement('div');
        filesWrap.className = 'trakt-card downloader-files-card';
        filesWrap.style.maxWidth = '900px';
        filesWrap.style.width = '100%';
        const inner = document.createElement('div');
        inner.className = 'trakt-card-body';
        inner.innerHTML = `<h3 style="margin-bottom:0.75rem;">Available files (${files.length})</h3>`;
        if (!files.length) {
            const empty = document.createElement('div');
            empty.className = 'downloader-empty';
            empty.textContent = 'No files found for this title.';
            inner.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '0.5rem';
            // Show up to 100 files (increased from 50 due to multiple variants)
            files.slice(0, 100).forEach(f => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.background = 'rgba(255,255,255,0.06)';
                row.style.border = '1px solid rgba(255,255,255,0.08)';
                row.style.borderRadius = '10px';
                row.style.padding = '0.6rem 0.8rem';
                const name = document.createElement('div');
                name.style.flex = '1';
                name.style.marginRight = '0.75rem';
                name.style.overflow = 'hidden';
                name.style.whiteSpace = 'nowrap';
                name.style.textOverflow = 'ellipsis';
                name.textContent = f.name || 'File';
                const size = document.createElement('div');
                size.style.color = '#9ca3af';
                size.style.marginRight = '0.75rem';
                size.style.minWidth = '80px';
                size.style.textAlign = 'right';
                size.textContent = f.sizeFormatted || '';
                const btn = document.createElement('button');
                btn.className = 'api-btn api-btn-primary';
                btn.innerHTML = '<i class="fas fa-download"></i> Download';
                btn.addEventListener('click', async (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    const href = f.url || '';
                    if (!href) return;
                    try {
                        if (window.electronAPI?.openExternal) {
                            await window.electronAPI.openExternal(href);
                        } else {
                            window.open(href, '_blank', 'noopener');
                        }
                    } catch (_) { window.open(href, '_blank'); }
                });
                row.appendChild(name);
                row.appendChild(size);
                row.appendChild(btn);
                list.appendChild(row);
            });
            inner.appendChild(list);

            // If there are more files than displayed, show a note
            if (files.length > 100) {
                const moreNote = document.createElement('div');
                moreNote.style.marginTop = '0.5rem';
                moreNote.style.color = '#9ca3af';
                moreNote.style.fontSize = '0.9rem';
                moreNote.style.textAlign = 'center';
                moreNote.textContent = `Showing first 100 of ${files.length} files`;
                inner.appendChild(moreNote);
            }
        }
        filesWrap.appendChild(inner);
        // Remove any previous files card before appending (last-writer-wins)
        container.querySelectorAll('.downloader-files-card').forEach(el => el.remove());
        container.appendChild(filesWrap);
    }

    function startFilesLoad(container) {
        const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        container.dataset.filesLoadKey = key;
        return key;
    }

    async function fetchDownloaderFilesByTmdb(tmdbId, container) {
        try {
            const loadKey = startFilesLoad(container);
            const res = await fetch(`http://localhost:6987/111477/api/tmdb/movie/${encodeURIComponent(tmdbId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // Handle new multi-result format from 111477 API
            let allFiles = [];
            if (Array.isArray(data?.results)) {
                // New format: extract files from all successful results
                data.results.forEach(result => {
                    if (result.success && Array.isArray(result.files)) {
                        allFiles = allFiles.concat(result.files);
                    }
                });
            } else if (Array.isArray(data?.files)) {
                // Old format: direct files array
                allFiles = data.files;
            }

            renderFilesCard(allFiles, container, loadKey);
        } catch (e) {
            console.error('Failed to load files by TMDB id', e);
            showNotification('Failed to load files for this title');
        }
    }

    async function fetchAndRenderTvSelectors(tmdbId, container) {
        // Controls card
        const ctrl = document.createElement('div');
        ctrl.className = 'trakt-card downloader-tv-controls';
        ctrl.style.maxWidth = '900px';
        ctrl.style.width = '100%';
        const body = document.createElement('div');
        body.className = 'trakt-card-body';
        body.innerHTML = '<h3 style="margin-bottom:0.75rem;">Pick season and episode</h3>';

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '0.75rem';
        row.style.alignItems = 'center';
        row.style.flexWrap = 'wrap';

        const seasonLabel = document.createElement('label');
        seasonLabel.textContent = 'Season';
        seasonLabel.style.marginRight = '0.25rem';
        const seasonSel = document.createElement('select');
        seasonSel.style.padding = '0.5rem 0.6rem';
        seasonSel.style.borderRadius = '8px';
        seasonSel.style.border = '1px solid rgba(255,255,255,0.15)';
        seasonSel.style.background = 'rgba(0,0,0,0.25)';
        seasonSel.style.color = '#fff';

        const episodeLabel = document.createElement('label');
        episodeLabel.textContent = 'Episode';
        episodeLabel.style.marginRight = '0.25rem';
        const episodeSel = document.createElement('select');
        episodeSel.style.padding = '0.5rem 0.6rem';
        episodeSel.style.borderRadius = '8px';
        episodeSel.style.border = '1px solid rgba(255,255,255,0.15)';
        episodeSel.style.background = 'rgba(0,0,0,0.25)';
        episodeSel.style.color = '#fff';
        episodeSel.disabled = true;

        row.appendChild(seasonLabel);
        row.appendChild(seasonSel);
        row.appendChild(episodeLabel);
        row.appendChild(episodeSel);
        body.appendChild(row);
        ctrl.appendChild(body);
        container.appendChild(ctrl);

        // Fetch TMDB TV info for seasons
        try {
            const infoRes = await fetch(`https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}`);
            const info = await infoRes.json();
            const numberOfSeasons = info?.number_of_seasons || (Array.isArray(info?.seasons) ? info.seasons.length : 0);
            const seasons = [];
            for (let s = 1; s <= numberOfSeasons; s++) seasons.push(s);
            if (!seasons.length) {
                showNotification('No seasons found for this show');
                return;
            }
            seasonSel.innerHTML = seasons.map(s => `<option value="${s}">S${String(s).padStart(2, '0')}</option>`).join('');

            seasonSel.addEventListener('change', async () => {
                const sVal = Number(seasonSel.value);
                episodeSel.disabled = true;
                episodeSel.innerHTML = '';
                // Remove prior files card if any
                container.querySelectorAll('.downloader-files-card').forEach(el => el.remove());
                try {
                    const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}/season/${encodeURIComponent(sVal)}?api_key=${TMDB_API_KEY}`);
                    const seasonData = await seasonRes.json();
                    const eps = Array.isArray(seasonData?.episodes) ? seasonData.episodes.map(e => e.episode_number) : [];
                    if (!eps.length && Number.isFinite(seasonData?.episode_count)) {
                        for (let e = 1; e <= seasonData.episode_count; e++) eps.push(e);
                    }
                    episodeSel.innerHTML = eps.map(e => `<option value="${e}">E${String(e).padStart(2, '0')}</option>`).join('');
                    episodeSel.disabled = eps.length === 0;
                } catch (err) {
                    console.error('Failed to fetch episodes list', err);
                    showNotification('Failed to load episodes');
                }
            });

            episodeSel.addEventListener('change', async () => {
                const sVal = Number(seasonSel.value);
                const eVal = Number(episodeSel.value);
                // Remove prior files card if any
                container.querySelectorAll('.downloader-files-card').forEach(el => el.remove());
                try {
                    const loadKey = startFilesLoad(container);
                    const res = await fetch(`http://localhost:6987/111477/api/tmdb/tv/${encodeURIComponent(tmdbId)}/season/${encodeURIComponent(sVal)}/episode/${encodeURIComponent(eVal)}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();

                    // Handle new multi-result format from 111477 API
                    let allFiles = [];
                    if (Array.isArray(data?.results)) {
                        // New format: extract files from all successful results
                        data.results.forEach(result => {
                            if (result.success && Array.isArray(result.files)) {
                                allFiles = allFiles.concat(result.files);
                            }
                        });
                    } else if (Array.isArray(data?.files)) {
                        // Old format: direct files array
                        allFiles = data.files;
                    }

                    renderFilesCard(allFiles, container, loadKey);
                } catch (err) {
                    console.error('Failed to load TV episode files', err);
                    showNotification('Failed to load files for this episode');
                }
            });

            // Trigger initial season load to populate episodes
            seasonSel.dispatchEvent(new Event('change'));
        } catch (err) {
            console.error('Failed to fetch TV info', err);
            showNotification('Failed to load TV seasons');
        }
    }

    if (filterMoviesBtn && filterTvBtn) {
        filterMoviesBtn.addEventListener('click', () => {
            if (downloaderType !== 'movies') {
                downloaderType = 'movies';
                filterMoviesBtn.classList.add('active');
                filterTvBtn.classList.remove('active');
                if (downloaderQuery.value.trim()) runDownloaderSearch(downloaderQuery.value);
            }
        });
        filterTvBtn.addEventListener('click', () => {
            if (downloaderType !== 'tv') {
                downloaderType = 'tv';
                filterTvBtn.classList.add('active');
                filterMoviesBtn.classList.remove('active');
                if (downloaderQuery.value.trim()) runDownloaderSearch(downloaderQuery.value);
            }
        });
    }

    if (downloaderBtn && downloaderQuery) {
        downloaderBtn.addEventListener('click', () => runDownloaderSearch(downloaderQuery.value));
        downloaderQuery.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runDownloaderSearch(downloaderQuery.value);
        });
    }

    // Quick refresh button
    const quickRefresh = document.getElementById('quickRefresh');
    if (quickRefresh) {
        quickRefresh.addEventListener('click', () => {
            window.location.reload();
        });
    }

    // Sort and Filter buttons (NEW UI)
    const sortBtn = document.getElementById('sortBtn');
    const filterBtn = document.getElementById('filterBtn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            // Cycle through sort options
            if (currentSort === 'popularity') {
                currentSort = 'rating';
                showNotification('Sorted by Rating ⭐');
            } else if (currentSort === 'rating') {
                currentSort = 'date';
                showNotification('Sorted by Release Date 📅');
            } else {
                currentSort = 'popularity';
                showNotification('Sorted by Popularity 🔥');
            }
            refreshDisplay();
        });
    }
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            // Cycle through filter options
            if (currentFilter === 'all') {
                currentFilter = 'hd';
                showNotification('Filter: HD Quality (7+ rating) 🎬');
            } else if (currentFilter === 'hd') {
                currentFilter = '4k';
                showNotification('Filter: 4K Quality (8+ rating) ✨');
            } else {
                currentFilter = 'all';
                showNotification('Filter: All Content 📺');
            }
            refreshDisplay();
        });
    }

    // Live TV Event Listeners
    const liveTvCategorySelect = document.getElementById('livetv-category-select');
    if (liveTvCategorySelect) {
        liveTvCategorySelect.addEventListener('change', () => {
            loadLiveTvMatches(liveTvCategorySelect.value);
        });
    }

    const liveTvSearchInput = document.getElementById('livetv-search-input');
    if (liveTvSearchInput) {
        // Debounce search to avoid too many updates
        let searchTimeout;
        liveTvSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadLiveTvMatches(liveTvCategorySelect ? liveTvCategorySelect.value : 'football');
            }, 300);
        });
    }

    const liveTvStreamsClose = document.getElementById('livetv-streams-close');
    if (liveTvStreamsClose) {
        liveTvStreamsClose.addEventListener('click', () => {
            const modal = document.getElementById('livetv-streams-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    const liveTvModalBack = document.getElementById('livetv-modal-back');
    if (liveTvModalBack) {
        liveTvModalBack.addEventListener('click', () => {
            const modal = document.getElementById('livetv-stream-modal');
            const iframe = document.getElementById('livetv-stream-iframe');
            if (modal) modal.style.display = 'none';
            if (iframe) iframe.src = ''; // Stop stream
        });
    }

    const liveTvCopyBtn = document.getElementById('livetv-copy-stream-btn');
    if (liveTvCopyBtn) {
        liveTvCopyBtn.addEventListener('click', async () => {
            const modal = document.getElementById('livetv-stream-modal');
            const streamUrl = modal?.dataset.currentStreamUrl;

            if (streamUrl) {
                try {
                    await navigator.clipboard.writeText(streamUrl);
                    const originalText = liveTvCopyBtn.innerHTML;
                    liveTvCopyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    liveTvCopyBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

                    setTimeout(() => {
                        liveTvCopyBtn.innerHTML = originalText;
                        liveTvCopyBtn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                    showNotification('Failed to copy link', 'error');
                }
            }
        });
    }

    // Close modals on background click
    const liveTvStreamsModal = document.getElementById('livetv-streams-modal');
    if (liveTvStreamsModal) {
        liveTvStreamsModal.addEventListener('click', (e) => {
            if (e.target === liveTvStreamsModal) {
                liveTvStreamsModal.style.display = 'none';
            }
        });
    }
}

// Router handler
async function handleRoute() {
    const hash = window.location.hash || '#/';
    // Default route
    if (hash === '#/' || hash === '#') {
        activeRoute = 'home';
        showSection('home');

        // In new UI, the home page is handled by initializeNewUI (Hero + Sliders)
        // Only load grid movies for old UI
        if (!document.body.classList.contains('ui-new')) {
            // Load home content if first time or if grid empty
            if (moviesGrid.children.length === 0) {
                currentPage = 1;
                moviesGrid.innerHTML = '';
                await loadMovies(currentCategory);
            }
        }
        return;
    }

    if (hash.startsWith('#/genre/')) {
        const genreName = decodeURIComponent(hash.slice('#/genre/'.length)).trim();
        activeRoute = 'genreDetails';
        showSection('genreDetails');
        await ensureGenresLoaded();
        await openGenreDetails(genreName);
        return;
    } else if (hash === '#/genres') {
        activeRoute = 'genres';
        showSection('genres');
        await ensureGenresLoaded();
        renderGenres();
        return;
    } else if (hash === '#/my-list') {
        activeRoute = 'my-list';
        showSection('my-list');
        await displayMyList();
        return;
    } else if (hash === '#/done-watching') {
        activeRoute = 'done-watching';
        showSection('done-watching');
        await displayDoneWatching();
        return;
    } else if (hash === '#/trakt') {
        activeRoute = 'trakt';
        showSection('trakt');
        return;
    } else if (hash === '#/livetv') {
        activeRoute = 'livetv';
        showSection('livetv');
        await initLiveTv();
        return;
    } else if (hash === '#/iptv') {
        activeRoute = 'iptv';
        showSection('iptv');
        reloadIptvPage();
        return;
    } else if (hash === '#/games-downloader') {
        activeRoute = 'games-downloader';
        showSection('games-downloader');
        return;
    } else if (hash === '#/minigames') {
        activeRoute = 'minigames';
        showSection('minigames');
        reloadMiniGamesPage();
        return;
    } else if (hash === '#/books') {
        activeRoute = 'books';
        showSection('books');
        return;
    } else if (hash === '#/audiobooks') {
        activeRoute = 'audiobooks';
        showSection('audiobooks');
        return;
    } else if (hash === '#/music') {
        activeRoute = 'music';
        showSection('music');
        return;
    } else if (hash === '#/booktorrio') {
        activeRoute = 'booktorrio';
        showSection('booktorrio');
        return;
    } else if (hash === '#/anime') {
        activeRoute = 'anime';
        showSection('anime');
        return;
    } else if (hash === '#/comics') {
        activeRoute = 'comics';
        showSection('comics');
        return;
    } else if (hash === '#/manga') {
        activeRoute = 'manga';
        showSection('manga');
        return;
    } else if (hash === '#/downloader') {
        activeRoute = 'downloader';
        showSection('downloader');
        return;
    } else if (hash === '#/settings') {
        activeRoute = 'settings';
        showSection('settings');
        await loadSettingsData();
        return;
    }

    // Fallback
    activeRoute = 'home';
    showSection('home');
}

function showSection(section) {
    // Hide ALL known top-level pages first to avoid stacking
    const allPageIds = [
        'homePage', 'genresPage', 'genreDetailsPage', 'myListPage', 'doneWatchingPage',
        'trakt-page', 'livetv-page', 'iptv-page', 'games-downloader-page', 'minigames-page', 'books-page', 'music-page',
        'audiobooks-page', 'booktorrio-page', 'anime-page', 'comics-page', 'comics-reader-page', 'manga-page', 'manga-reader-page', 'downloader-page', 'settings-page'
    ];
    allPageIds.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    // Special leave-behavior
    // Stop music if we are not showing the music page AND player is not minimized
    if (section !== 'music') {
        const audio = document.getElementById('music-player-audio');
        const modal = document.getElementById('music-player-modal');
        const miniPlayer = document.getElementById('music-mini-player');

        // Only pause if mini player is not visible (not minimized)
        const isMiniPlayerVisible = miniPlayer && miniPlayer.style.display !== 'none';
        if (!isMiniPlayerVisible) {
            if (audio) { try { audio.pause(); } catch (_) { } }
            if (modal) modal.style.display = 'none';
        }
    }
    // Clear IPTV iframe if not on IPTV page
    if (section !== 'iptv') {
        try { clearIptvPage(); } catch (_) { }
    }
    // Clear MiniGames iframe if not on MiniGames page
    if (section !== 'minigames') {
        try { clearMiniGamesPage(); } catch (_) { }
    }

    // Map route section to element id
    const map = {
        'home': 'homePage',
        'genres': 'genresPage',
        'genreDetails': 'genreDetailsPage',
        'my-list': 'myListPage',
        'done-watching': 'doneWatchingPage',
        'trakt': 'trakt-page',
        'livetv': 'livetv-page',
        'iptv': 'iptv-page',
        'games-downloader': 'games-downloader-page',
        'minigames': 'minigames-page',
        'books': 'books-page',
        'music': 'music-page',
        'audiobooks': 'audiobooks-page',
        'booktorrio': 'booktorrio-page',
        'anime': 'anime-page',
        'comics': 'comics-page',
        'comics-reader': 'comics-reader-page',
        'manga': 'manga-page',
        'manga-reader': 'manga-reader-page',
        'downloader': 'downloader-page',
        'settings': 'settings-page'
    };
    const targetId = map[section];
    if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.style.display = '';
        // Init Trakt page once, but always refresh status on navigation
        if (section === 'trakt' && el) {
            if (!el.dataset.initialized) {
                initializeTraktPage();
                el.dataset.initialized = 'true';
            } else {
                // Ensure status is fresh after actions elsewhere (e.g., Settings disconnect)
                try { updateTraktPageStatus(); } catch (_) { }
            }
        }

        // Initialize Comics when showing comics page
        if (section === 'comics' && el) {
            try { initializeComics(); } catch (err) { console.error('Error initializing comics:', err); }
        } else {
            // Deactivate comics when switching to another page
            console.log('[COMICS] Deactivating comics page');
            if (typeof comicsPageActive !== 'undefined') comicsPageActive = false;
        }

        // Auto-load games when showing games downloader page
        if (section === 'games-downloader' && el) {
            if (!el.dataset.gamesLoaded) {
                try {
                    // Small delay to ensure DOM is ready
                    setTimeout(() => {
                        loadGameCategories();
                        browseAllGames();
                    }, 100);
                    el.dataset.gamesLoaded = 'true';
                } catch (err) {
                    console.error('Error loading games:', err);
                }
            }
        }

        // Update Discord presence for MiniGames
        if (section === 'minigames') {
            if (window.electronAPI?.updateDiscordPresence) {
                window.electronAPI.updateDiscordPresence({
                    details: 'Playing mini games',
                    state: 'PlayTorrio MiniGames',
                    largeImageKey: 'playtorrio',
                    largeImageText: 'PlayTorrio',
                    smallImageKey: 'gaming',
                    smallImageText: 'Gaming'
                }).catch(err => console.error('Discord presence error:', err));
            }
        }

        // Update Discord presence for Games Downloader
        if (section === 'games-downloader') {
            if (window.electronAPI?.updateDiscordPresence) {
                window.electronAPI.updateDiscordPresence({
                    details: 'Browsing PC games',
                    state: 'Games Downloader',
                    largeImageKey: 'playtorrio',
                    largeImageText: 'PlayTorrio',
                    smallImageKey: 'download',
                    smallImageText: 'Downloading'
                }).catch(err => console.error('Discord presence error:', err));
            }
        }
    }

    // Update nav/fab, reset load flag, scroll to top
    updateNavigationStates(section);
    updateFloatingSettingsButton(section);
    isLoading = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateFloatingSettingsButton(section) {
    const floatingNav = document.getElementById('floatingNavContainer');
    if (floatingNav) {
        // Show only on home page in old UI
        if (section === 'home') {
            floatingNav.classList.add('show-on-home');
        } else {
            floatingNav.classList.remove('show-on-home');
            floatingNav.classList.remove('active'); // Close menu when leaving home
        }
    }
}

function updateNavigationStates(activeSection) {
    // Update sidebar navigation (new UI)
    const sidebarNavItems = document.querySelectorAll('.nav-item[data-page]');
    sidebarNavItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === activeSection ||
            (activeSection === 'genreDetails' && item.dataset.page === 'genres')) {
            item.classList.add('active');
        }
    });

    // Update header buttons (classic UI)
    const headerButtons = {
        'home': null, // No specific home button
        'genres': document.getElementById('genresBtn'),
        'my-list': document.getElementById('myListBtn'),
        'done-watching': document.getElementById('doneWatchingBtn'),
        'trakt': null // Trakt is only in new UI sidebar
    };

    // Reset all header button active states
    Object.values(headerButtons).forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    // Set active header button
    const activeBtn = headerButtons[activeSection];
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Update bottom navigation (mobile)
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(item => {
        item.classList.remove('active');
        const page = item.dataset.page;
        if (activeSection === page || (activeSection === 'home' && page === 'home') || (activeSection === 'genreDetails' && page === 'genres')) {
            item.classList.add('active');
        }
    });
}

async function ensureGenresLoaded() {
    if (genresLoaded) return;
    try {
        genresLoading.style.display = 'block';
        // Fetch movie and tv genres
        const [movieRes, tvRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}`),
            fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${TMDB_API_KEY}`)
        ]);
        const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
        const map = new Map();
        (movieData.genres || []).forEach(g => {
            const key = g.name.toLowerCase();
            map.set(key, { name: g.name, movieId: g.id, tvId: null });
        });
        (tvData.genres || []).forEach(g => {
            const key = g.name.toLowerCase();
            if (map.has(key)) {
                map.get(key).tvId = g.id;
            } else {
                map.set(key, { name: g.name, movieId: null, tvId: g.id });
            }
        });
        genresMap = map;
        genresLoaded = true;
    } catch (e) {
        console.error('Error loading genres:', e);
    } finally {
        genresLoading.style.display = 'none';
    }
}

function renderGenres() {
    genresGrid.innerHTML = '';
    const entries = Array.from(genresMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    entries.forEach(g => {
        const card = document.createElement('div');
        card.className = 'genre-card';
        card.innerHTML = `
                    <div class="genre-info">
                        <div class="genre-title">${g.name}</div>
                        <div class="genre-availability">
                            ${g.movieId ? '<span class="genre-chip"><i class="fas fa-film"></i> Movie</span>' : ''}
                            ${g.tvId ? '<span class="genre-chip"><i class="fas fa-tv"></i> TV</span>' : ''}
                        </div>
                    </div>
                `;
        card.addEventListener('click', () => {
            window.location.hash = `#/genre/${encodeURIComponent(g.name)}`;
        });
        genresGrid.appendChild(card);
    });
}

function setGenreToggleActive() {
    toggleMoviesBtn.classList.toggle('active', currentGenreType === 'movie');
    toggleTVBtn.classList.toggle('active', currentGenreType === 'tv');
}

async function openGenreDetails(genreName) {
    const key = genreName.toLowerCase();
    currentGenre = genresMap.get(key);
    if (!currentGenre) {
        // If genre map not found (edge case), reload genres and try again
        await ensureGenresLoaded();
        currentGenre = genresMap.get(key);
    }
    if (!currentGenre) {
        genreTitleEl.textContent = genreName;
        genreResultsGrid.innerHTML = '';
        genreEmptyMessage.style.display = 'block';
        return;
    }

    genreTitleEl.textContent = currentGenre.name;

    // Default type preference: movie if available, else tv
    currentGenreType = currentGenre.movieId ? 'movie' : 'tv';
    setGenreToggleActive();

    // Reset results grid
    genreResultsGrid.innerHTML = '';
    genreEmptyMessage.style.display = 'none';
    genreCurrentPage = 1;

    await loadGenreItems();
}

function setGenreType(type) {
    currentGenreType = type;
    setGenreToggleActive();
    // Reset and reload
    genreResultsGrid.innerHTML = '';
    genreEmptyMessage.style.display = 'none';
    genreCurrentPage = 1;
    isLoading = false;
    loadGenreItems();
}

async function loadGenreItems() {
    if (isLoading) return;
    const genreId = currentGenreType === 'movie' ? currentGenre.movieId : currentGenre.tvId;
    if (!genreId) {
        genreEmptyMessage.style.display = 'block';
        return;
    }
    isLoading = true;
    genreLoadingIndicator.style.display = 'block';
    try {
        const url = `https://api.themoviedb.org/3/discover/${currentGenreType}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&sort_by=popularity.desc&page=${genreCurrentPage}`;
        const res = await fetch(url);
        const data = await res.json();
        const items = data.results || [];
        if (genreCurrentPage === 1 && items.length === 0) {
            genreEmptyMessage.style.display = 'block';
        } else {
            displayGenreItems(items, currentGenreType);
            genreCurrentPage++;
        }
    } catch (e) {
        console.error('Error loading genre items:', e);
    } finally {
        isLoading = false;
        genreLoadingIndicator.style.display = 'none';
    }
}

function displayGenreItems(items, mediaType) {
    items.forEach(item => {
        if (!item.poster_path) return;
        const card = document.createElement('div');
        card.className = 'movie-card';
        const title = item.title || item.name || 'Untitled';
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const rating = (item.vote_average || 0).toFixed(1);
        // Only show Done Watching button for movies (not TV shows)
        const doneBtnHTML = mediaType === 'movie'
            ? `<button class="done-watching-btn" onclick="toggleDoneWatching(event, ${item.id}, '${mediaType}', '${title.replace(/'/g, "\\'")}', '${item.poster_path}', '${year}', ${item.vote_average || 0})">
                        <i class="fas fa-check"></i>
                      </button>`
            : '';
        card.innerHTML = `
                    <button class="add-to-list-btn" onclick="toggleMyList(event, ${item.id}, '${mediaType}', '${title.replace(/'/g, "\\'")}', '${item.poster_path}', '${year}', ${item.vote_average || 0})">
                        <i class="fas fa-plus"></i>
                    </button>
                    ${doneBtnHTML}
                    <img loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${title}" class="movie-poster">
                    <div class="movie-info">
                        <h3 class="movie-title">${title}</h3>
                        <p class="movie-year">${year}</p>
                    </div>
                    <div class="movie-rating">
                        <i class="fas fa-star"></i> ${rating}
                    </div>
                `;
        card.addEventListener('click', () => openDetailsModal(item, mediaType));
        genreResultsGrid.appendChild(card);
    });
}

// Load movies from TMDB (home)
async function loadMovies(category = 'all') {
    if (isLoading) return;
    isLoading = true;
    loadingIndicator.style.display = 'block';

    // Reset cache if it's the first page
    if (currentPage === 1) {
        allMoviesCache = [];
    }

    try {
        let url;
        if (category === 'all') {
            url = `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&page=${currentPage}`;
        } else {
            url = `https://api.themoviedb.org/3/trending/${category}/week?api_key=${TMDB_API_KEY}&page=${currentPage}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results, currentPage > 1);
        currentPage++;
    } catch (error) {
        console.error('Error fetching movies:', error);
    } finally {
        isLoading = false;
        loadingIndicator.style.display = 'none';
    }
}

// Search for movies and shows
async function searchMovies(query) {
    if (isLoading) return;
    isLoading = true;

    // Hide sliders and show grid for search results (new UI)
    if (document.body.classList.contains('ui-new')) {
        const slidersContainer = document.getElementById('slidersContainer');
        const heroSection = document.getElementById('heroSection');
        const backBtn = document.getElementById('backToHomeBtn');
        if (slidersContainer) slidersContainer.style.display = 'none';
        if (heroSection) heroSection.style.display = 'none';
        if (backBtn) backBtn.style.display = 'block';
        moviesGrid.style.display = 'grid';
    }

    moviesGrid.innerHTML = '';
    loadingIndicator.style.display = 'block';

    try {
        const response = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`);
        const data = await response.json();

        // Store search results and set search mode
        lastSearchResults = data.results || [];
        lastSearchQuery = query;
        isSearchMode = true;

        displayMovies(data.results);
    } catch (error) {
        console.error('Error searching movies:', error);
    }

    isLoading = false;
    loadingIndicator.style.display = 'none';
}

// Display movies in the grid (chunked + capped for performance)
function displayMovies(movies, append = true) {
    // Cache movies for sorting/filtering
    if (!append) {
        allMoviesCache = [...movies];
    } else {
        allMoviesCache = [...allMoviesCache, ...movies];
    }

    // Apply current sort and filter
    let filteredMovies = applySortAndFilter([...movies]);
    // Build in a fragment to minimize reflows
    const frag = document.createDocumentFragment();
    for (const movie of filteredMovies) {
        if (!movie.poster_path) continue;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.dataset.rating = movie.vote_average || 0;
        card.dataset.date = movie.release_date || movie.first_air_date || '';
        const mediaType = movie.media_type || 'movie';
        const doneBtnHTML = mediaType === 'movie'
            ? `<button class="done-watching-btn" onclick="toggleDoneWatching(event, ${movie.id}, '${mediaType}', '${(movie.title || movie.name || '').replace(/'/g, "\\'")}', '${movie.poster_path}', '${(movie.release_date || movie.first_air_date || '').substring(0, 4)}', ${movie.vote_average || 0})">
                        <i class="fas fa-check"></i>
                      </button>`
            : '';
        const year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
        const titleSafe = (movie.title || movie.name || '').replace(/'/g, "\\'");
        const posterUrl = `https://image.tmdb.org/t/p/w342${movie.poster_path}`; // lighter grid thumbs
        card.innerHTML = `
                    <button class="add-to-list-btn" onclick="toggleMyList(event, ${movie.id}, '${mediaType}', '${titleSafe}', '${movie.poster_path}', '${year}', ${movie.vote_average || 0})">
                        <i class="fas fa-plus"></i>
                    </button>
                    ${doneBtnHTML}
                    <img loading="lazy" decoding="async" src="${posterUrl}" alt="${titleSafe}" class="movie-poster">
                    <div class="movie-info">
                        <h3 class="movie-title">${movie.title || movie.name}</h3>
                        <p class="movie-year">${year}</p>
                    </div>
                    <div class="movie-rating">
                        <i class="fas fa-star"></i> ${Number(movie.vote_average || 0).toFixed(1)}
                    </div>
                `;
        card.addEventListener('click', () => openDetailsModal(movie, movie.media_type || null));
        frag.appendChild(card);
    }
    moviesGrid.appendChild(frag);

    // Cap total DOM nodes in perf-mode to keep things snappy on low-end machines
    try {
        if (document.body.classList.contains('perf-mode')) {
            const MAX_CARDS = 300; // adjustable
            while (moviesGrid.children.length > MAX_CARDS) {
                moviesGrid.removeChild(moviesGrid.firstElementChild);
            }
        }
    } catch (_) { }
}

// Apply sort and filter to movies
function applySortAndFilter(movies) {
    let filtered = [...movies];

    // Apply filter
    if (currentFilter === 'hd') {
        filtered = filtered.filter(m => (m.vote_average || 0) >= 7);
    } else if (currentFilter === '4k') {
        filtered = filtered.filter(m => (m.vote_average || 0) >= 8);
    }

    // Apply sort
    if (currentSort === 'rating') {
        filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    } else if (currentSort === 'date') {
        filtered.sort((a, b) => {
            const dateA = new Date(a.release_date || a.first_air_date || 0);
            const dateB = new Date(b.release_date || b.first_air_date || 0);
            return dateB - dateA;
        });
    }
    // popularity is default (no sorting needed as TMDB returns sorted by popularity)

    return filtered;
}

// Refresh display with current sort/filter
function refreshDisplay() {
    moviesGrid.innerHTML = '';
    displayMovies(allMoviesCache, false);
}

// ==== NEW UI: HERO SECTION AND SLIDERS ====
async function initializeNewUI() {
    console.log('[DEBUG] initializeNewUI() called');
    if (!document.body.classList.contains('ui-new')) return;

    // Show hero and sliders, hide grid
    const heroSection = document.getElementById('heroSection');
    const slidersContainer = document.getElementById('slidersContainer');
    const moviesGrid = document.getElementById('moviesGrid');
    const loadingIndicator = document.getElementById('loadingIndicator');

    console.log('[DEBUG] Elements found:', { heroSection: !!heroSection, slidersContainer: !!slidersContainer, moviesGrid: !!moviesGrid, loadingIndicator: !!loadingIndicator });

    if (heroSection) heroSection.style.display = 'block';
    if (slidersContainer) slidersContainer.style.display = 'block';
    if (moviesGrid) moviesGrid.style.display = 'none';

    // Load data for hero and sliders
    await Promise.all([
        loadHeroContent(),
        loadSliders()
    ]);

    // Setup slider navigation
    setupSliderNavigation();

    // Hide loading indicator
    if (loadingIndicator) loadingIndicator.style.display = 'none';
}

async function loadHeroContent() {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${TMDB_API_KEY}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            // Pick a random item from top 5 for variety
            const heroItem = data.results[Math.floor(Math.random() * Math.min(5, data.results.length))];
            displayHero(heroItem);
        }
    } catch (error) {
        console.error('Error loading hero content:', error);
    }
}

function displayHero(item) {
    const heroBackdrop = document.getElementById('heroBackdrop');
    const heroTitle = document.getElementById('heroTitle');
    const heroOverview = document.getElementById('heroOverview');
    const heroYear = document.getElementById('heroYear');
    const heroRating = document.getElementById('heroRating');
    const heroRatingValue = document.getElementById('heroRatingValue');
    const heroRuntime = document.getElementById('heroRuntime');
    const heroPlayBtn = document.getElementById('heroPlayBtn');
    const heroInfoBtn = document.getElementById('heroInfoBtn');

    if (item.backdrop_path) {
        heroBackdrop.src = `https://image.tmdb.org/t/p/original${item.backdrop_path}`;
    }

    heroTitle.textContent = item.title || item.name;
    heroOverview.textContent = item.overview || 'No description available.';

    const year = (item.release_date || item.first_air_date || '').substring(0, 4);
    heroYear.textContent = year;

    if (item.vote_average) {
        heroRating.style.display = 'flex';
        heroRatingValue.textContent = Number(item.vote_average).toFixed(1);
    }

    // Store media type for click handlers
    const mediaType = item.media_type || 'movie';

    heroPlayBtn.onclick = () => openDetailsModal(item, mediaType);
    heroInfoBtn.onclick = () => openDetailsModal(item, mediaType);
}

async function loadSliders() {
    try {
        const [trending, popular, topRated, tvShows] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}`).then(r => r.json())
        ]);

        populateSlider('trendingSlider', trending.results.slice(0, 20));
        populateSlider('popularSlider', popular.results.slice(0, 20));
        populateSlider('topratedSlider', topRated.results.slice(0, 20));
        populateSlider('tvshowsSlider', tvShows.results.slice(0, 20));
    } catch (error) {
        console.error('Error loading sliders:', error);
    }
}

function populateSlider(sliderId, items) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    slider.innerHTML = '';

    items.forEach(item => {
        if (!item.poster_path) return;

        const sliderItem = document.createElement('div');
        sliderItem.className = 'slider-item';

        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const mediaType = item.media_type || (sliderId.includes('tv') ? 'tv' : 'movie');

        sliderItem.innerHTML = `
                    <img src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${item.title || item.name}" class="slider-poster">
                    <div class="slider-info">
                        <div class="slider-item-title">${item.title || item.name}</div>
                        <div class="slider-item-meta">
                            <span class="slider-rating">
                                <i class="fas fa-star"></i>
                                ${Number(item.vote_average || 0).toFixed(1)}
                            </span>
                            <span class="slider-year">${year}</span>
                        </div>
                    </div>
                `;

        // Use onclick property directly - this works within module scope
        sliderItem.onclick = () => openDetailsModal(item, mediaType);

        slider.appendChild(sliderItem);
    });
}

function setupSliderNavigation() {
    const arrows = document.querySelectorAll('.slider-arrow');

    arrows.forEach(arrow => {
        arrow.addEventListener('click', () => {
            const sliderName = arrow.dataset.slider;
            const isLeft = arrow.classList.contains('slider-arrow-left');
            const sliderContainer = document.querySelector(`#${sliderName}Slider`).parentElement;

            if (!sliderContainer) return;

            const scrollAmount = 810; // 3 items (270 each including gap)
            const currentScroll = sliderContainer.scrollLeft;
            const newScroll = isLeft ? currentScroll - scrollAmount : currentScroll + scrollAmount;

            sliderContainer.scrollTo({
                left: newScroll,
                behavior: 'smooth'
            });
        });
    });

    // Update arrow states based on scroll position
    const sliderContainers = document.querySelectorAll('.slider-container');
    sliderContainers.forEach(container => {
        container.addEventListener('scroll', () => {
            updateArrowStates(container);
        });
        updateArrowStates(container);
    });
}

function updateArrowStates(container) {
    const slider = container.querySelector('.slider-track');
    if (!slider) return;

    const section = container.closest('.slider-section');
    if (!section) return;

    const leftArrow = section.querySelector('.slider-arrow-left');
    const rightArrow = section.querySelector('.slider-arrow-right');

    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;

    if (leftArrow) {
        leftArrow.classList.toggle('disabled', scrollLeft <= 0);
    }

    if (rightArrow) {
        rightArrow.classList.toggle('disabled', scrollLeft + clientWidth >= scrollWidth - 10);
    }
}

// Handle infinite scroll - route aware
function handleScroll(e) {
    let shouldLoad = false;

    // Disable infinite scroll ONLY on Home "All" in new UI (uses sliders)
    // Keep infinite scroll enabled for other routes like genreDetails
    if (document.body.classList.contains('ui-new') && activeRoute === 'home') {
        if (currentCategory === 'all') {
            return; // No infinite scroll for Home "All" section
        }
    }

    // Check if we're in NEW UI mode (scrolling inside main element)
    if (document.body.classList.contains('ui-new')) {
        const mainElement = document.querySelector('.app-main main');
        if (mainElement) {
            const scrollTop = mainElement.scrollTop;
            const scrollHeight = mainElement.scrollHeight;
            const clientHeight = mainElement.clientHeight;
            shouldLoad = scrollTop + clientHeight >= scrollHeight - 500 && !isLoading;
        }
    } else {
        // OLD UI mode (scrolling on window)
        shouldLoad = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isLoading;
    }

    if (shouldLoad) {
        if (activeRoute === 'home') {
            loadMovies(currentCategory);
        } else if (activeRoute === 'genreDetails') {
            loadGenreItems();
        }
    }
}

// Open details modal (accept optional forced type)
async function openDetailsModal(movie, forcedType = null) {
    currentContent = movie;
    // Determine media type FIRST before any UI updates
    if (forcedType) {
        currentMediaType = forcedType === 'tv' ? 'tv' : 'movie';
    } else {
        if (movie.media_type) {
            currentMediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
        } else {
            // Infer by presence of 'name' vs 'title'
            currentMediaType = movie.name && !movie.title ? 'tv' : 'movie';
        }
    }

    console.log('[MODAL] Opening modal for:', movie.title || movie.name, 'Type:', currentMediaType);

    torrentsLoaded = false;
    torrentsContainer.style.display = 'none';
    torrentsList.innerHTML = '';

    modalBackdrop.src = `https://image.tmdb.org/t/p/w1280${movie.backdrop_path || movie.poster_path || ''}`;
    modalPoster.src = `https://image.tmdb.org/t/p/w342${movie.poster_path || movie.backdrop_path || ''}`;
    modalTitle.textContent = movie.title || movie.name || 'Untitled';
    modalRating.textContent = Number(movie.vote_average || 0).toFixed(1);
    modalYear.textContent = (movie.release_date || movie.first_air_date || '').substring(0, 4);
    modalOverview.textContent = movie.overview || '';

    // Store current movie data for Trakt
    currentMovie = movie;

    // Set up Trakt watchlist button
    setupTraktWatchlistButton();

    // Set up Done Watching button in modal
    try {
        await loadDoneWatching();
    } catch (_) { }
    const modalDoneBtn = document.getElementById('modalDoneWatchingBtn');
    if (modalDoneBtn) {
        const mediaType = currentMediaType;
        const titleSafe = (movie.title || movie.name || '').replace(/'/g, "\\'");
        const poster = movie.poster_path || '';
        const year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
        const rating = movie.vote_average || 0;
        // Wire click via inline so global updater functions can detect id/mediaType
        modalDoneBtn.setAttribute('onclick', `toggleDoneWatching(event, ${movie.id}, '${mediaType}', '${titleSafe}', '${poster}', '${year}', ${rating})`);
        // Initialize icon state
        const isDone = (Array.isArray(doneWatchingCache) ? doneWatchingCache : []).some(item =>
            item.id === movie.id && item.media_type === mediaType && (!item.season && !item.episode)
        );
        modalDoneBtn.classList.toggle('is-done', !!isDone);
        modalDoneBtn.innerHTML = `<i class="fas ${isDone ? 'fa-check-circle' : 'fa-check'}"></i>`;
        modalDoneBtn.title = isDone ? 'Remove from Done Watching' : 'Mark as Done Watching';
    }

    // Fetch additional details
    const detailsUrl = `https://api.themoviedb.org/3/${currentMediaType}/${movie.id}?api_key=${TMDB_API_KEY}&append_to_response=credits,similar`;
    try {
        const response = await fetch(detailsUrl);
        const details = await response.json();
        modalRuntime.textContent = details.runtime ? `${details.runtime} min` : (details.episode_run_time && details.episode_run_time.length ? `${details.episode_run_time[0]} min` : '');
        modalTagline.textContent = details.tagline || '';
        displayCast(details.credits?.cast || []);
        displaySimilar(details.similar?.results || [], currentMediaType);

        if (currentMediaType === 'tv') {
            seasonsContainer.style.display = 'block';
            displaySeasons(details.seasons || []);
            // Load episodes for the first usable season by default
            const firstSeason = (details.seasons || []).find(s => s.season_number !== 0);
            if (firstSeason) {
                currentSeason = firstSeason.season_number;
                loadEpisodes(firstSeason.season_number);
            }
        } else {
            seasonsContainer.style.display = 'none';
        }

    } catch (error) {
        console.error('Error fetching details:', error);
    }

    detailsModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Ensure the Watch Now UI reflects current mode and media type when opening
    try { updateWatchButtonText(); } catch (_) { }
}

// Close details modal
function closeModal() {
    detailsModal.classList.remove('active');
    document.body.style.overflow = 'auto';

    // Reset provider selection to default
    selectedProvider = 'playtorrio';
    document.querySelectorAll('.provider-btn').forEach(btn => {
        if (btn.dataset.provider === 'playtorrio') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Reset tracked search parameters
    lastSearchedSeason = null;
    lastSearchedEpisode = null;
}

// Display cast
function displayCast(cast) {
    castGrid.innerHTML = '';
    (cast || []).slice(0, 10).forEach(member => {
        const card = document.createElement('div');
        card.className = 'cast-card';
        card.innerHTML = `
                    <img src="${member.profile_path ? `https://image.tmdb.org/t/p/w185${member.profile_path}` : 'https://via.placeholder.com/185x278'}" alt="${member.name}" class="cast-img">
                    <p class="cast-name">${member.name}</p>
                    <p class="cast-character">${member.character || ''}</p>
                `;
        castGrid.appendChild(card);
    });
}

// Display similar content (force the same media type for correct behavior)
function displaySimilar(similar, mediaType) {
    similarGrid.innerHTML = '';
    (similar || []).slice(0, 5).forEach(item => {
        if (!item.poster_path) return;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `
                    <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title || item.name}" class="movie-poster" style="height: 225px;">
                    <div class="movie-info">
                        <h3 class="movie-title">${item.title || item.name}</h3>
                    </div>
                `;
        card.addEventListener('click', () => openDetailsModal(item, mediaType));
        similarGrid.appendChild(card);
    });
}

// Display seasons for TV shows
function displaySeasons(seasons) {
    seasonSelector.innerHTML = '';
    seasons.forEach(season => {
        if (season.season_number === 0) return; // Skip specials
        const btn = document.createElement('button');
        btn.className = 'season-btn';
        btn.textContent = season.name;
        btn.dataset.seasonNumber = season.season_number;
        if (season.season_number === currentSeason) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
            currentSeason = season.season_number;
            document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadEpisodes(currentSeason);
            torrentsContainer.style.display = 'block'; // Make torrents visible
            fetchTorrents(currentSeason);
        });
        seasonSelector.appendChild(btn);
    });
}

// Load episodes for a season
async function loadEpisodes(seasonNumber) {
    episodesGrid.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';
    try {
        const response = await fetch(`https://api.themoviedb.org/3/tv/${currentContent.id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`);
        const data = await response.json();
        displayEpisodes(data.episodes || []);
    } catch (error) {
        console.error(`Error fetching episodes for season ${seasonNumber}:`, error);
    }
}

// Display episodes
function displayEpisodes(episodes) {
    episodesGrid.innerHTML = '';
    episodes.forEach(episode => {
        const card = document.createElement('div');
        card.className = 'episode-card';

        // Check if this episode is already in done watching
        const isEpisodeDone = doneWatchingCache.some(item =>
            item.id === currentMovie.id && item.media_type === 'tv' &&
            item.season === currentSeason && item.episode === episode.episode_number
        );

        card.innerHTML = `
                    <img src="${episode.still_path ? `https://image.tmdb.org/t/p/w300${episode.still_path}` : 'https://via.placeholder.com/300x169'}" alt="${episode.name}" class="episode-img">
                    <div class="episode-info">
                        <h4 class="episode-title">E${episode.episode_number}: ${episode.name}</h4>
                        <p class="episode-date">${episode.air_date || ''}</p>
                        <div class="episode-actions">
                            <button class="episode-done-btn ${isEpisodeDone ? 'is-done' : ''}" 
                                    onclick="toggleEpisodeDoneWatching(event, ${currentMovie.id}, '${currentMovie.title || currentMovie.name}', ${currentSeason}, ${episode.episode_number}, '${episode.name.replace(/'/g, "\\'")}', '${currentMovie.release_date?.substring(0, 4) || currentMovie.first_air_date?.substring(0, 4) || ''}', '${currentMovie.poster_path || ''}')"
                                    title="${isEpisodeDone ? 'Remove from Done Watching' : 'Mark Episode as Done Watching'}">
                                <i class="fas ${isEpisodeDone ? 'fa-check-circle' : 'fa-check'}"></i>
                            </button>
                        </div>
                    </div>
                `;
        card.addEventListener('click', (e) => {
            // Don't select if clicking on the done button
            if (e.target.closest('.episode-done-btn')) return;

            console.log('[DEBUG] Episode card clicked! Season:', currentSeason, 'Episode:', episode.episode_number);

            document.querySelectorAll('.episode-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');

            try {
                showTorrents(e, currentSeason, episode.episode_number);
            } catch (error) {
                console.error('[DEBUG] Error in episode showTorrents:', error);
            }
        });
        episodesGrid.appendChild(card);
    });
}

// Show episode details modal
function showEpisodeDetails(event, showId, showTitle) {
    event.stopPropagation();

    // Find all episodes for this show
    const showEpisodes = doneWatchingCache.filter(item =>
        item.id === showId && item.media_type === 'tv' && item.season && item.episode
    );

    if (showEpisodes.length === 0) return;

    // Get show poster from the first episode
    const showPoster = showEpisodes[0].poster_path;

    // Sort episodes by season and episode
    showEpisodes.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
                <div class="modal-content episode-modal">
                    <div class="modal-header">
                        <img loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w342${showPoster}" alt="${showTitle}" class="show-poster">
                        <div class="header-content">
                            <h2>${showTitle}</h2>
                            <p class="modal-subtitle"><i class="fas fa-tv"></i> ${showEpisodes.length} episode${showEpisodes.length > 1 ? 's' : ''} watched</p>
                        </div>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="episode-list">
                            ${showEpisodes.map(ep => `
                                <div class="episode-item">
                                    <div class="episode-number">S${ep.season}E${ep.episode}</div>
                                    <div class="episode-info">
                                        <h4>${ep.episode_title || `Episode ${ep.episode}`}</h4>
                                        <p><i class="fas fa-calendar"></i> Watched on ${new Date(ep.completed_date).toLocaleDateString()}</p>
                                    </div>
                                    <button class="episode-remove-btn" onclick="removeEpisodeFromDoneWatching(event, ${ep.id}, ${ep.season}, ${ep.episode})" title="Remove episode">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Add click highlighting within the episode list
    try {
        const list = modal.querySelector('.episode-list');
        const rows = Array.from(list.querySelectorAll('.episode-item'));
        // Default-select the first row for visual focus
        if (rows[0]) rows[0].classList.add('selected');
        rows.forEach(row => {
            row.addEventListener('click', (ev) => {
                // Ignore clicks on remove buttons
                if (ev.target.closest('.episode-remove-btn')) return;
                rows.forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');
            });
        });
    } catch (_) { }
}

// Remove individual episode from done watching
async function removeEpisodeFromDoneWatching(event, showId, season, episode) {
    // Update cache in memory
    const beforeLen = doneWatchingCache.length;
    doneWatchingCache = doneWatchingCache.filter(item => {
        if (item.media_type === 'tv' && item.id === showId) {
            return !(item.season === season && item.episode === episode);
        }
        return true;
    });
    if (doneWatchingCache.length !== beforeLen) {
        await saveDoneWatching();
    }

    // Sync with Trakt if available
    if (traktToken) {
        try {
            {
                await fetch('/api/trakt/scrobble/pause', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        token: traktToken,
                        show: {
                            ids: { tmdb: showId },
                            title: undefined,
                            year: undefined
                        },
                        episode: {
                            season: season,
                            number: episode
                        }
                    })
                });
            }
        } catch (error) {
            console.warn('Failed to remove episode from Trakt:', error);
        }
    }

    showNotification('Episode removed from done watching', 'success');

    // If Done Watching page is visible, re-render; otherwise keep context
    if (document.getElementById('doneWatchingPage').style.display !== 'none') {
        displayDoneWatching();
    }
    updateTraktPageStatus();
    updateAllDoneButtons(showId, 'tv');

    // Remove row in the modal immediately and update header count
    if (event && event.target) {
        const row = event.target.closest('.episode-item');
        const list = row?.closest('.episode-list');
        row?.remove();
        const headerCountEl = document.querySelector('.episode-modal .modal-subtitle');
        if (headerCountEl && list) {
            const remaining = list.querySelectorAll('.episode-item').length;
            headerCountEl.innerHTML = `<i class="fas fa-tv"></i> ${remaining} episode${remaining === 1 ? '' : 's'} watched`;
        }
    }

    // Close modal if no more episodes
    const remainingEpisodes = doneWatchingCache.filter(item =>
        item.id === showId && item.media_type === 'tv' && item.season && item.episode
    );
    if (remainingEpisodes.length === 0) {
        document.querySelector('.modal-overlay')?.remove();
    }
}

// Show torrents for the current content
function showTorrents(event, season = null, episode = null) {
    // Safely check streaming servers setting
    const streamingMode = localStorage.getItem('useStreamingServers') === 'true';
    console.log('[SERVERS] showTorrents called with streaming mode:', streamingMode);
    console.log('[SERVERS] Season:', season, 'Episode:', episode);

    // Check if streaming servers mode is enabled
    if (streamingMode) {
        console.log('[SERVERS] Streaming servers enabled, showing server selection');
        showStreamingServerSelection(season, episode);
        return;
    }

    console.log('[SERVERS] Streaming servers disabled, showing torrents');
    // Modal removed - no longer checking or showing setup prompt
    torrentsContainer.style.display = 'block';
    // Reset loaded state for new searches
    torrentsLoaded = false;
    fetchTorrents(season, episode);
}

// Show streaming server selection instead of torrents
function showStreamingServerSelection(season = null, episode = null) {
    console.log('[SERVERS] showStreamingServerSelection called with:', { season, episode });

    if (!currentContent) {
        console.error('[SERVERS] No currentContent available');
        showNotification('No content selected', 'error');
        return;
    }

    console.log('[SERVERS] Current content:', currentContent);
    console.log('[SERVERS] Current media type:', currentMediaType);

    const mediaData = {
        type: currentMediaType,
        id: currentContent.id,
        title: currentContent.title || currentContent.name,
        season: season,
        episode: episode,
        year: currentMediaType === 'movie' ?
            (currentContent.release_date || '').substring(0, 4) :
            (currentContent.first_air_date || '').substring(0, 4),
        rating: currentContent.vote_average ? parseFloat(currentContent.vote_average).toFixed(1) : null,
        poster: currentContent.poster_path ?
            `https://image.tmdb.org/t/p/w342${currentContent.poster_path}` :
            null,
        subtitle: season && episode ?
            `Season ${season}, Episode ${episode}` :
            (currentMediaType === 'tv' ? 'TV Show' : 'Movie'),
        fallbackToTorrent: () => {
            // Fallback to torrent mode if user clicks "Use Torrent Instead"
            useStreamingServers = false;
            localStorage.setItem('useStreamingServers', 'false');
            updateWatchButtonText();
            showTorrents(null, season, episode);
        }
    };

    console.log('[SERVERS] Media data prepared:', mediaData);

    // Show server selection modal directly
    try {
        // Set current media data globally
        window.currentMediaData = mediaData;
        currentMediaData = mediaData;

        // Get modal elements
        const serverSelectionModal = document.getElementById('server-selection-modal');
        const serverMediaTitle = document.getElementById('server-media-title');
        const serverMediaSubtitle = document.getElementById('server-media-subtitle');
        const serverMediaYear = document.getElementById('server-media-year');
        const serverMediaRating = document.getElementById('server-media-rating');
        const serverMediaPoster = document.getElementById('server-media-poster');
        const serverDropdown = document.getElementById('server-dropdown');

        if (!serverSelectionModal) {
            throw new Error('Server selection modal not found in DOM');
        }

        // Populate media info
        if (serverMediaTitle) serverMediaTitle.textContent = mediaData.title;
        if (serverMediaSubtitle) serverMediaSubtitle.textContent = mediaData.subtitle || '';
        if (serverMediaYear) serverMediaYear.textContent = mediaData.year || '';
        if (serverMediaRating) serverMediaRating.textContent = mediaData.rating ? `★ ${mediaData.rating}` : '';
        if (serverMediaPoster) serverMediaPoster.src = mediaData.poster || '';

        // Initialize dropdown
        if (serverDropdown) {
            const currentSelectedServer = localStorage.getItem('selectedServer') || 'VidSrc TO';
            serverDropdown.innerHTML = '';

            const servers = [
                { name: 'CinemaOS' },
                { name: 'Videasy' },
                { name: 'LunaStream' },
                { name: 'Vidfast 1' },
                { name: 'Vidfast 2' },
                { name: '111Movies' },
                { name: 'VidSrc 1' },
                { name: 'VidSrc 2' },
                { name: 'VidSrc 3' },
                { name: 'VidSrc 4' },
                { name: 'PrimeSrc' },
                { name: 'VidRock' },
                { name: 'HexaWatch' },
                { name: 'FMovies' },
                { name: 'Xprime' },
                { name: 'Vidnest' },
                { name: 'veloratv' },
                { name: 'MovieClub' },
                { name: 'MapleTV' },
                { name: '2Embed' },
                { name: 'SmashyStream' },
                { name: 'Autoembed' },
                { name: 'GoDrivePlayer' },
                { name: 'VidWTF Premium' },
                { name: 'GDrivePlayer API' },
                { name: 'Nontongo' },
                { name: 'SpencerDevs' },
                { name: 'VidAPI' },
                { name: 'Vidify' },
                { name: 'VidSrc CX' },
                { name: 'VidSrc ME' },
                { name: 'VidSrc TO' },
                { name: 'VidSrc VIP' },
                { name: 'VixSrc' }
            ];

            console.log('[SERVERS] Using servers array with length:', servers.length);

            servers.forEach(server => {
                const option = document.createElement('option');
                option.value = server.name;
                option.textContent = server.name;
                if (server.name === currentSelectedServer) {
                    option.selected = true;
                }
                serverDropdown.appendChild(option);
            });

            console.log('[SERVERS] Dropdown populated with', serverDropdown.options.length, 'options');
        }

        // Show modal
        serverSelectionModal.style.display = 'flex';
        document.body.classList.add('server-modal-open');

        console.log('[SERVERS] Server selection modal displayed successfully');
    } catch (error) {
        console.error('[SERVERS] Error showing server selection:', error);
        alert('Error loading streaming servers: ' + error.message);
    }
}

// Fetch streams from Nuvio API (direct streaming links)
async function fetchNuvioStreams(season = null, episode = null) {
    if (!currentContent) return;

    const torrentsList = document.getElementById('torrentsList');
    torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching Nuvio...</div>';

    try {
        const tmdbId = currentContent.id;
        const mediaType = currentMediaType; // 'movie' or 'tv'

        // Get IMDB ID from TMDB
        const externalIdsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const externalIdsRes = await fetch(externalIdsUrl);
        if (!externalIdsRes.ok) throw new Error('Failed to get IMDB ID from TMDB');

        const externalIds = await externalIdsRes.json();
        const imdbId = externalIds.imdb_id;

        if (!imdbId) {
            throw new Error('No IMDB ID found for this content');
        }

        // Febbox JWT token for Nuvio (supports custom UI token)
        const defaultFebboxToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NTU5MzQ2NzcsIm5iZiI6MTc1NTkzNDY3NywiZXhwIjoxNzg3MDM4Njk3LCJkYXRhIjp7InVpZCI6OTY3OTA3LCJ0b2tlbiI6ImRjZTBiZTUyNzgzODU1Njg5ZjNlMjBhZTIzODU2YzlkIn19.yAuVwTgLyO7sTH5rOi_-UaVAHqO0YzUkykXgQC2ci2E';
        const savedToken = (localStorage.getItem('febboxToken') || '').trim();
        const febboxToken = savedToken || defaultFebboxToken;

        // Build new Nuviostreams URL with cookies, region, providers
        const base = 'https://nuviostreams.hayd.uk';
        const cookiesSeg = `cookies=${encodeURIComponent(JSON.stringify([febboxToken]))}`; // cookies=%5B"<JWT>"%5D
        const regionSeg = 'region=UK3';
        const providersSeg = 'providers=showbox,vidzee,vidsrc,vixsrc,mp4hydra,uhdmovies,moviesmod,4khdhub,topmovies';
        let nuvioExternalUrl;
        if (mediaType === 'movie') {
            nuvioExternalUrl = `${base}/${cookiesSeg}/${regionSeg}/${providersSeg}/stream/movie/${encodeURIComponent(imdbId)}.json`;
        } else if (season && episode) {
            nuvioExternalUrl = `${base}/${cookiesSeg}/${regionSeg}/${providersSeg}/stream/series/${encodeURIComponent(imdbId)}:${encodeURIComponent(season)}:${encodeURIComponent(episode)}.json`;
        } else {
            throw new Error('Season and episode required for TV shows');
        }

        console.log('[Nuvio] Trying direct URL:', nuvioExternalUrl);

        let data = null;
        let responseOk = false;
        try {
            const response = await fetch(nuvioExternalUrl);
            responseOk = response.ok;
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await response.json();
        } catch (directErr) {
            console.warn('[Nuvio] Direct fetch failed, falling back to backend proxy:', directErr?.message || directErr);
            // Fallback to existing backend proxy if available
            let proxyUrl;
            if (mediaType === 'movie') {
                proxyUrl = `${API_BASE_URL}/nuvio/stream/movie/${imdbId}?cookie=ui%3D${encodeURIComponent(febboxToken)}&region=US`;
            } else {
                proxyUrl = `${API_BASE_URL}/nuvio/stream/series/${imdbId}:${season}:${episode}?cookie=ui%3D${encodeURIComponent(febboxToken)}&region=US`;
            }
            console.log('[Nuvio] Fetching via proxy:', proxyUrl);
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Proxy Nuvio error: ${response.statusText}`);
            data = await response.json();
            responseOk = true;
        }
        if (!responseOk || !data) throw new Error('Failed to load Nuvio streams');
        const streams = data.streams || [];

        console.log('[Nuvio] Found', streams.length, 'streams');

        if (streams.length === 0) {
            torrentsList.innerHTML = '<div class="error-message"><i class="fas fa-info-circle"></i> No Nuvio streams found</div>';
            return;
        }

        // Reorder streams: all MoviesMod first (1080p preferred), then others in original order
        const withIndex = streams.map((s, i) => ({ s, i }));
        const mmRegex = /moviesmod/i;
        const p1080 = /1080p/i;
        withIndex.sort((a, b) => {
            const aMM = mmRegex.test(a.s?.name || '') || mmRegex.test(a.s?.title || '');
            const bMM = mmRegex.test(b.s?.name || '') || mmRegex.test(b.s?.title || '');
            if (aMM && !bMM) return -1;
            if (!aMM && bMM) return 1;
            if (aMM && bMM) {
                const a1080 = p1080.test(a.s?.name || '') || p1080.test(a.s?.title || '');
                const b1080 = p1080.test(b.s?.name || '') || p1080.test(b.s?.title || '');
                if (a1080 && !b1080) return -1;
                if (!a1080 && b1080) return 1;
            }
            // Preserve original order otherwise
            return a.i - b.i;
        });
        const prioritizedStreams = withIndex.map(x => x.s);

        // Cache streams globally and add size info for sorting
        allNuvioStreams = prioritizedStreams.map(stream => {
            const sizeMatch = (stream.title || '').match(/([\d.]+)\s*(GB|MB)/i);
            let sizeBytes = 0;
            if (sizeMatch) {
                const num = parseFloat(sizeMatch[1]);
                const unit = sizeMatch[2].toUpperCase();
                sizeBytes = unit === 'GB' ? num * 1024 * 1024 * 1024 : num * 1024 * 1024;
            }
            return { ...stream, sizeBytes };
        });

        // Display Nuvio streams as direct play buttons
        displayNuvioStreams(allNuvioStreams);

    } catch (error) {
        console.error('[Nuvio] Error:', error);
        torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Nuvio Error: ${error.message}</div>`;
    }
}

// Display Nuvio streams (direct play, not torrents)
function displayNuvioStreams(streams) {
    const torrentsList = document.getElementById('torrentsList');

    if (!streams || streams.length === 0) {
        torrentsList.innerHTML = '<div class="error-message"><i class="fas fa-info-circle"></i> No streams available</div>';
        return;
    }

    // Apply size filter first
    let filteredStreams = streams.slice();
    if (typeof torrentSizeFilter === 'string' && torrentSizeFilter !== 'all') {
        console.log('[Nuvio] Applying size filter:', torrentSizeFilter);
        filteredStreams = filteredStreams.filter(stream => bytesMatchesSizeFilter(stream.sizeBytes));
        console.log('[Nuvio] After filter:', filteredStreams.length, 'of', streams.length, 'streams remain');
    }

    // Check if filter eliminated all results
    if (filteredStreams.length === 0) {
        torrentsList.innerHTML = '<p>No streams match your size filter.</p>';
        return;
    }

    // Apply sorting if sort mode is size-based
    let sortedStreams = filteredStreams.slice();
    const mode = (typeof torrentSortMode === 'string') ? torrentSortMode : 'seeders';

    if (mode === 'size-asc') {
        console.log('[Nuvio] Sorting by size ascending');
        sortedStreams.sort((a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0));
    } else if (mode === 'size-desc') {
        console.log('[Nuvio] Sorting by size descending');
        sortedStreams.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    } else {
        console.log('[Nuvio] Using default priority order (MoviesMod first)');
    }

    torrentsList.innerHTML = '';

    sortedStreams.forEach((stream, index) => {
        const streamDiv = document.createElement('div');
        streamDiv.className = 'torrent-item';
        streamDiv.style.cursor = 'default';

        // Parse stream info
        const name = stream.name || `Stream ${index + 1}`;
        const title = stream.title || '';
        const url = stream.url;

        // Extract quality and size info from title
        const titleLines = title.split('\n');
        const mainTitle = titleLines[0] || '';
        const details = titleLines[1] || '';

        // Build button HTML - skip VLC on macOS
        const isMacOS = window.electronAPI?.platform === 'darwin';
        const vlcButtonHtml = isMacOS ? '' : `
                    <button class="torrent-btn vlc-nuvio-btn" data-url="${url}" data-name="${name}">
                        <i class="fas fa-external-link-alt"></i> Open in VLC
                    </button>
                `;

        streamDiv.innerHTML = `
                    <div class="torrent-info">
                        <div class="torrent-name">${name}</div>
                        ${mainTitle ? `<div style="color: var(--gray); font-size: 0.85rem; margin: 0.25rem 0;">${mainTitle}</div>` : ''}
                        ${details ? `<div class="torrent-details">
                            <span>${details}</span>
                        </div>` : ''}
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="torrent-btn play-nuvio-btn" data-url="${url}" data-name="${name}">
                            <i class="fas fa-play"></i> Play Now
                        </button>
                        <button class="torrent-btn mpv-nuvio-btn" data-url="${url}" data-name="${name}">
                            <i class="fas fa-external-link-alt"></i> Open in MPV
                        </button>
                        ${vlcButtonHtml}
                        <button class="torrent-btn cast-nuvio-btn" data-url="${url}" data-name="${name}">
                            <i class="fas fa-tv"></i> Cast
                        </button>
                        <button class="torrent-btn copy-nuvio-btn" data-url="${url}" data-name="${name}">
                            <i class="fas fa-copy"></i> Copy Link
                        </button>
                    </div>
                `;

        torrentsList.appendChild(streamDiv);
    });

    // Add event listeners for Nuvio play buttons
    document.querySelectorAll('.play-nuvio-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = btn.dataset.url;
            const name = btn.dataset.name;
            try {
                // Set current stream context
                currentStreamUrl = url;
                currentSelectedVideoName = name;

                // Attempt Windows mpv.js (with UI-provided S/E for TV)
                let launched = false;
                try {
                    const tmdbId = currentContent?.id?.toString() || '';
                    let seasonNum = null;
                    let episodeNum = null;
                    if (currentMediaType === 'tv' && lastSearchedSeason && lastSearchedEpisode) {
                        seasonNum = String(lastSearchedSeason);
                        episodeNum = String(lastSearchedEpisode);
                    }
                    const res = await window.electronAPI.spawnMpvjsPlayer({
                        url,
                        tmdbId,
                        seasonNum,
                        episodeNum
                    });
                    if (res?.success) {
                        launched = true;
                        showNotification('Player launched');
                        return;
                    }
                } catch (_) { }

                // Fallback to HTML5 player
                const title = currentContent?.title || currentContent?.name || 'Video';
                const sNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
                updateDiscordForStreaming(title, 'Nuvio', sNum);
                openCustomPlayer();
            } catch (e) {
                console.error('[Nuvio] Play Now error:', e);
                showNotification('Failed to play stream', 'error');
            }
        });
    });

    document.querySelectorAll('.mpv-nuvio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.dataset.url;
            const name = btn.dataset.name;
            openNuvioInMPV(url, name);
        });
    });

    document.querySelectorAll('.vlc-nuvio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.dataset.url;
            const name = btn.dataset.name;
            openNuvioInVLC(url, name);
        });
    });

    // Add event listeners for Nuvio cast buttons
    document.querySelectorAll('.cast-nuvio-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = btn.dataset.url;
            const name = btn.dataset.name;
            try {
                // Set current stream and show device picker to cast
                currentStreamUrl = url;
                currentSelectedVideoName = name;
                await showChromecastDevicePicker();
            } catch (e) {
                console.error('[Nuvio] Cast error:', e);
                showNotification('Failed to initiate casting', 'error');
            }
        });
    });

    // Add event listeners for Nuvio copy link buttons
    document.querySelectorAll('.copy-nuvio-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = btn.dataset.url;
            const name = btn.dataset.name;
            try {
                await navigator.clipboard.writeText(url);
                showNotification(`Stream link copied: ${name}`, 'success');
            } catch (e) {
                console.error('[Nuvio] Copy error:', e);
                showNotification('Failed to copy link', 'error');
            }
        });
    });
}

// Play Nuvio stream directly (not a torrent)
async function playNuvioStream(url, name) {
    try {
        console.log('[Nuvio] Playing stream in custom player:', url);

        // Set current stream URL and name
        currentStreamUrl = url;
        currentSelectedVideoName = name;

        // Update player title
        if (customPlayerTitle) {
            customPlayerTitle.innerHTML = `<span>${name}</span> <span class="source-badge direct-stream" title="Direct Stream">Nuvio</span>`;
        }

        // Open in custom player
        openCustomPlayer();

        showNotification('Playing in browser player', 'success');
    } catch (error) {
        console.error('[Nuvio] Play error:', error);
        showNotification('Failed to play stream', 'error');
    }
}

// Open Nuvio stream in MPV
async function openNuvioInMPV(url, name) {
    try {
        console.log('[Nuvio] Opening in MPV:', url);

        if (!window.electronAPI || !window.electronAPI.openInMPV) {
            showNotification('MPV integration not available', 'error');
            return;
        }

        // Set current stream for MPV
        currentStreamUrl = url;
        currentSelectedVideoName = name;

        // Open in external MPV
        const data = {
            streamUrl: url,
            infoHash: null,
            startSeconds: undefined
        };

        const result = await window.electronAPI.openInMPV(data);
        if (result.success) {
            showNotification('Opened in MPV', 'success');
        } else {
            showNotification(`MPV Error: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('[Nuvio] MPV open error:', error);
        showNotification('Failed to open in MPV', 'error');
    }
}
// Open Nuvio stream in VLC
async function openNuvioInVLC(url, name) {
    try {
        console.log('[Nuvio] Opening in VLC:', url);
        if (!window.electronAPI || !window.electronAPI.openInVLC) {
            showNotification('VLC integration not available', 'error');
            return;
        }
        // Set current stream context (for resume/discord)
        currentStreamUrl = url;
        currentSelectedVideoName = name;

        const title = currentContent?.title || currentContent?.name || 'Video';
        const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
        updateDiscordForStreaming(title, 'Nuvio', seasonNum);

        const data = {
            streamUrl: url,
            infoHash: (currentTorrentData && currentTorrentData.infoHash) ? currentTorrentData.infoHash : null,
            startSeconds: (resumeInfo && typeof resumeInfo.position === 'number' && resumeInfo.position > 10) ? Math.floor(resumeInfo.position) : undefined
        };
        const result = await window.electronAPI.openInVLC(data);
        if (result?.success) {
            showNotification('Opened in VLC', 'success');
        } else {
            showNotification(`VLC Error: ${result?.message || result?.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('[Nuvio] VLC open error:', error);
        showNotification('Failed to open in VLC', 'error');
    }
}


// Fetch torrents from Comet API
async function fetchCometTorrents(season = null, episode = null) {
    if (!currentContent) return;

    const torrentsList = document.getElementById('torrentsList');
    torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching Comet...</div>';

    try {
        const tmdbId = currentContent.id;
        const mediaType = currentMediaType; // 'movie' or 'tv'

        // Get IMDB ID from TMDB
        const externalIdsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const externalIdsRes = await fetch(externalIdsUrl);
        if (!externalIdsRes.ok) throw new Error('Failed to get IMDB ID from TMDB');

        const externalIds = await externalIdsRes.json();
        const imdbId = externalIds.imdb_id;

        if (!imdbId) {
            throw new Error('No IMDB ID found for this content');
        }

        // Comet config (base64 encoded configuration)
        const cometConfig = 'eyJtYXhSZXN1bHRzUGVyUmVzb2x1dGlvbiI6MCwibWF4U2l6ZSI6MCwiY2FjaGVkT25seSI6dHJ1ZSwicmVtb3ZlVHJhc2giOnRydWUsInJlc3VsdEZvcm1hdCI6WyJhbGwiXSwiZGVicmlkU2VydmljZSI6InRvcnJlbnQiLCJkZWJyaWRBcGlLZXkiOiIiLCJkZWJyaWRTdHJlYW1Qcm94eVBhc3N3b3JkIjoiIiwibGFuZ3VhZ2VzIjp7ImV4Y2x1ZGUiOltdLCJwcmVmZXJyZWQiOlsiZW4iXX0sInJlc29sdXRpb25zIjp7fSwib3B0aW9ucyI6eyJyZW1vdmVfcmFua3NfdW5kZXIiOi0xMDAwMDAwMDAwMCwiYWxsb3dfZW5nbGlzaF9pbl9sYW5ndWFnZXMiOmZhbHNlLCJyZW1vdmVfdW5rbm93bl9sYW5ndWFnZXMiOmZhbHNlfX0=';

        let cometUrl;
        if (mediaType === 'movie') {
            cometUrl = `${API_BASE_URL}/comet/stream/movie/${imdbId}?config=${cometConfig}`;
        } else if (season && episode) {
            cometUrl = `${API_BASE_URL}/comet/stream/series/${imdbId}:${season}:${episode}?config=${cometConfig}`;
        } else {
            throw new Error('Season and episode required for TV shows');
        }

        console.log('[Comet] Fetching from:', cometUrl);

        const response = await fetch(cometUrl);
        if (!response.ok) throw new Error(`Comet error: ${response.statusText}`);

        const data = await response.json();
        const streams = data.streams || [];

        console.log('[Comet] Found', streams.length, 'streams');

        if (streams.length === 0) {
            torrentsList.innerHTML = '<div class="error-message"><i class="fas fa-info-circle"></i> No Comet torrents found</div>';
            return;
        }

        // Convert Comet streams to magnet links and display
        const torrents = streams.map(stream => {
            const infoHash = stream.infoHash;
            const sources = stream.sources || [];
            const name = stream.name || 'Unknown';
            const description = stream.description || '';

            // Use filename from behaviorHints if available, otherwise use name
            const displayTitle = (stream.behaviorHints && stream.behaviorHints.filename)
                ? stream.behaviorHints.filename
                : name;

            // Construct magnet link compatible with WebTorrent
            // Include display name and file index if available
            const fileName = (stream.behaviorHints && stream.behaviorHints.filename) || displayTitle;
            const fileIdx = stream.fileIdx !== undefined ? stream.fileIdx : 0;

            let magnetLink = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(fileName)}`;

            // Add trackers (WebTorrent needs good trackers for peer discovery)
            sources.forEach(tracker => {
                magnetLink += `&tr=${encodeURIComponent(tracker)}`;
            });

            // Store fileIdx for later use when playing specific file from torrent
            if (fileIdx > 0) {
                magnetLink += `&so=${fileIdx}`;
            }

            // Extract size if available
            let sizeBytes = 0;
            if (stream.behaviorHints && stream.behaviorHints.videoSize) {
                sizeBytes = stream.behaviorHints.videoSize;
            }

            return {
                title: displayTitle,
                magnet: magnetLink,
                seeders: 0, // Comet doesn't provide seeders
                size: sizeBytes,
                description: description
            };
        }).filter(Boolean);

        console.log('[Comet] Converted', torrents.length, 'torrents');
        displayTorrents(torrents, season, episode);

    } catch (error) {
        console.error('[Comet] Error:', error);
        torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Comet Error: ${error.message}</div>`;
    }
}

// Fetch streams from 111477 API (direct streaming links)
async function fetch111477Streams(season = null, episode = null) {
    if (!currentContent) return;

    const torrentsList = document.getElementById('torrentsList');
    torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching 111477...</div>';

    try {
        const tmdbId = currentContent.id;
        const mediaType = currentMediaType; // 'movie' or 'tv'

        let apiUrl;
        if (mediaType === 'movie') {
            apiUrl = `http://localhost:6987/111477/api/tmdb/movie/${encodeURIComponent(tmdbId)}`;
        } else if (season && episode) {
            apiUrl = `http://localhost:6987/111477/api/tmdb/tv/${encodeURIComponent(tmdbId)}/season/${encodeURIComponent(season)}/episode/${encodeURIComponent(episode)}`;
        } else {
            throw new Error('Season and episode required for TV shows');
        }

        console.log('[111477] Fetching from:', apiUrl);

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`111477 API error: ${response.statusText}`);

        const data = await response.json();

        // Handle multi-result format from 111477 API
        let allFiles = [];
        if (Array.isArray(data?.results)) {
            data.results.forEach(result => {
                if (result.success && Array.isArray(result.files)) {
                    allFiles = allFiles.concat(result.files);
                }
            });
        } else if (Array.isArray(data?.files)) {
            allFiles = data.files;
        }

        console.log('[111477] Found', allFiles.length, 'files');

        if (allFiles.length === 0) {
            torrentsList.innerHTML = '<div class="error-message"><i class="fas fa-info-circle"></i> No 111477 streams found</div>';
            return;
        }

        // Helper function to extract quality from filename
        function extractQuality(filename) {
            const qualities = ['2160p', '4K', '1080p', '720p', '480p', '360p'];
            for (const q of qualities) {
                if (filename.includes(q)) {
                    return q;
                }
            }
            // Check for other indicators
            if (filename.match(/BluRay|Blu-Ray/i)) return 'BluRay';
            if (filename.match(/WEBRip|WEB-DL/i)) return 'WEB';
            if (filename.match(/HDTV/i)) return 'HDTV';
            return 'Unknown';
        }

        // Helper function to format file size
        function formatFileSize(bytes) {
            if (!bytes || bytes === 0) return 'Unknown Size';
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Process files: extract quality, format size, parse size for sorting
        const processedFiles = allFiles.map(file => {
            const fileName = file.name || '';
            const quality = extractQuality(fileName);
            const sizeBytes = parseInt(file.size) || 0;
            const sizeFormatted = formatFileSize(sizeBytes);

            return {
                ...file,
                quality: quality,
                sizeFormatted: sizeFormatted,
                sizeBytes: sizeBytes
            };
        });

        // Cache and render with current sort selection
        window._last111477Files = processedFiles;
        render111477Files(processedFiles);

    } catch (error) {
        console.error('[111477] Error:', error);
        torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> 111477 Error: ${error.message}</div>`;
    }
}

// Helper: size filter matcher shared by torrent renders
function bytesMatchesSizeFilter(bytes) {
    const n = Number(bytes) || 0;
    try {
        switch (torrentSizeFilter) {
            case 'gte-1g': return n >= (1024 ** 3);
            case 'gte-2g': return n >= (2 * 1024 ** 3);
            case '2-4g': return n >= (2 * 1024 ** 3) && n < (4 * 1024 ** 3);
            case '4-8g': return n >= (4 * 1024 ** 3) && n < (8 * 1024 ** 3);
            case 'gte-8g': return n >= (8 * 1024 ** 3);
            case 'all':
            default: return true;
        }
    } catch (_) {
        return true;
    }
}

// Render helper for 111477 files honoring global sort and size filter
function render111477Files(files) {
    const torrentsList = document.getElementById('torrentsList');
    torrentsList.innerHTML = '';
    let list = (files || []).slice();
    try {
        // Use the same torrentSortMode variable defined near the selector
        const mode = (typeof torrentSortMode === 'string') ? torrentSortMode : 'seeders';
        // Apply size filter first
        list = list.filter(f => bytesMatchesSizeFilter(f.sizeBytes));
        if (mode === 'size-desc') list.sort((a, b) => (Number(b.sizeBytes || 0) - Number(a.sizeBytes || 0)));
        else /* size-asc or default */ list.sort((a, b) => (Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0)));
    } catch (_) { }

    list.forEach(file => {
        const item = document.createElement('div');
        item.className = 'torrent-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '1rem';
        item.style.marginBottom = '0.5rem';
        item.style.background = 'rgba(255,255,255,0.05)';
        item.style.borderRadius = '8px';
        item.style.cursor = 'pointer';

        const info = document.createElement('div');
        info.style.flex = '1';

        const title = document.createElement('div');
        title.style.fontWeight = '500';
        title.style.marginBottom = '0.25rem';
        title.textContent = file.name || 'Unknown';

        const meta = document.createElement('div');
        meta.style.fontSize = '0.85rem';
        meta.style.opacity = '0.7';
        meta.textContent = `${file.quality} • ${file.sizeFormatted}`;

        info.appendChild(title);
        info.appendChild(meta);

        // New: Play Now button (Windows mpv.js if available, otherwise HTML5 fallback)
        const playNowBtn = document.createElement('button');
        playNowBtn.className = 'btn';
        playNowBtn.innerHTML = '<i class="fas fa-play"></i> Play Now';
        playNowBtn.style.marginLeft = '1rem';
        playNowBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!file.url) {
                showNotification('No stream URL available');
                return;
            }
            try {
                const tmdbId = currentContent?.id?.toString() || '';
                let seasonNum = null;
                let episodeNum = null;
                if (currentMediaType === 'tv' && lastSearchedSeason && lastSearchedEpisode) {
                    seasonNum = String(lastSearchedSeason);
                    episodeNum = String(lastSearchedEpisode);
                }

                // Try mpv.js (Windows-only)
                let launched = false;
                try {
                    const res = await window.electronAPI.spawnMpvjsPlayer({
                        url: file.url,
                        tmdbId,
                        seasonNum,
                        episodeNum
                    });
                    if (res?.success) {
                        launched = true;
                        showNotification('Player launched');
                    }
                } catch (_) { }

                if (!launched) {
                    // Fallback to HTML5 player
                    currentStreamUrl = file.url;
                    currentSelectedVideoName = file.name || 'Video';
                    const title = currentContent?.title || currentContent?.name || 'Video';
                    const sNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
                    updateDiscordForStreaming(title, '111477', sNum);
                    openCustomPlayer();
                }
            } catch (err) {
                console.error('[111477] Play Now error:', err);
                showNotification('Failed to play: ' + (err?.message || 'Unknown error'));
            }
        };

        const playBtn = document.createElement('button');
        playBtn.className = 'btn';
        playBtn.innerHTML = '<i class="fas fa-play"></i> Open in MPV';
        playBtn.style.marginLeft = '1rem';
        playBtn.onclick = async (e) => {
            e.stopPropagation();
            if (file.url) {
                console.log('[111477] Opening in MPV:', file.url);
                try {
                    // Update Discord presence for 111477 MPV streaming
                    const title = currentContent?.title || currentContent?.name || 'Video';
                    const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
                    updateDiscordForStreaming(title, '111477', seasonNum);

                    const result = await window.electronAPI.openMPVDirect(file.url);
                    if (result && result.success) {
                        showNotification('Opening stream in MPV... Please Wait', 'success', 5000);
                    } else {
                        showNotification('Failed to open in MPV: ' + (result?.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('[111477] MPV error:', error);
                    showNotification('Failed to open in MPV: ' + error.message);
                }
            } else {
                showNotification('No stream URL available');
            }
        };

        item.appendChild(info);
        item.appendChild(playNowBtn);
        item.appendChild(playBtn);

        // Add IINA button on macOS
        if (window.electronAPI.platform === 'darwin') {
            const iinaBtn = document.createElement('button');
            iinaBtn.className = 'btn';
            iinaBtn.innerHTML = '<i class="fas fa-film"></i> Open in IINA';
            iinaBtn.style.marginLeft = '0.5rem';
            iinaBtn.onclick = async (e) => {
                e.stopPropagation();
                if (file.url) {
                    console.log('[IINA] Opening in IINA:', file.url);
                    try {
                        // Update Discord presence for IINA streaming
                        const title = currentContent?.title || currentContent?.name || 'Video';
                        const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
                        updateDiscordForStreaming(title, 'IINA', seasonNum);

                        const result = await window.electronAPI.openInIINA({
                            streamUrl: file.url,
                            infoHash: currentInfoHash || null,
                            startSeconds: 0
                        });
                        if (result && result.success) {
                            showNotification('Opening stream in IINA...', 'success', 3000);
                        } else if (result && result.message && result.message.includes('not installed')) {
                            showNotification('IINA not installed. Please install IINA from iina.io', 'error', 5000);
                        } else {
                            showNotification('Failed to open in IINA: ' + (result?.message || 'Unknown error'));
                        }
                    } catch (error) {
                        console.error('[IINA] Error:', error);
                        showNotification('Failed to open in IINA: ' + error.message);
                    }
                } else {
                    showNotification('No stream URL available');
                }
            };
            item.appendChild(iinaBtn);
        }

        torrentsList.appendChild(item);
    });
}

// Fetch streams from MovieBox (aggregated variants)
async function fetchMovieBoxStreams(season = null, episode = null) {
    if (!currentContent) return;

    const torrentsList = document.getElementById('torrentsList');
    torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching MovieBox...</div>';

    try {
        const tmdbId = currentContent.id;
        const mediaType = currentMediaType; // 'movie' or 'tv'
        // Local helper to format byte sizes (kept here to avoid scope issues)
        const fmtBytes = (bytes) => {
            const n = Number(bytes) || 0;
            if (n <= 0) return '';
            const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(n) / Math.log(1024));
            return `${(n / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
        };

        let apiUrl;
        if (mediaType === 'movie') {
            apiUrl = `http://localhost:6987/moviebox/${encodeURIComponent(tmdbId)}`;
        } else if (season && episode) {
            apiUrl = `http://localhost:6987/moviebox/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`;
        } else {
            throw new Error('Season and episode required for TV shows');
        }

        console.log('[MovieBox] Fetching:', apiUrl);
        const response = await fetch(apiUrl, { credentials: 'include' });

        // Read body as text first, then try JSON, so we can handle non-200s with JSON or plain text
        let rawBody = '';
        let data = null;
        try {
            rawBody = await response.text();
            try { data = JSON.parse(rawBody); } catch (_) { /* non-JSON */ }
        } catch (_) { /* ignore */ }

        // Helper to extract cooldown seconds
        const extractWaitSeconds = (str) => {
            if (!str || typeof str !== 'string') return null;
            const m = str.match(/\((\d+)\s*seconds?\)/i);
            return m ? parseInt(m[1], 10) : null;
        };

        // If response not OK, try to surface cooldown nicely before erroring
        if (!response.ok) {
            const errStr = (data && typeof data.error === 'string' && data.error) || rawBody || response.statusText || '';
            const secs = extractWaitSeconds(errStr);
            if (secs) {
                torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-hourglass-half"></i> MovieBox cooldown: Please wait ${secs} seconds and try again.</div>`;
                return;
            }
            const msg = `MovieBox error: ${response.status} ${response.statusText || ''}`.trim();
            throw new Error(msg);
        }

        // Handle MovieBox cooldown-style errors like: {"ok":false,"error":"please wait (30 seconds)"}
        if (data && data.ok === false && typeof data.error === 'string') {
            const secs = extractWaitSeconds(data.error);
            const waitMsg = secs ? `Please wait ${secs} seconds and try again.` : 'Please wait a bit and try again.';
            torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-hourglass-half"></i> MovieBox cooldown: ${waitMsg}</div>`;
            return;
        }
        let streams = [];
        if (Array.isArray(data.streams)) {
            // Legacy shape
            streams = data.streams;
        } else if (Array.isArray(data.results)) {
            // New simplified shape from MovieBox proxy
            streams = data.results.map(r => {
                const bytes = parseInt(r.size, 10) || 0;
                return {
                    source: r.source || 'unknown',
                    url: r.url,
                    resolutions: (r.resolutions ?? '').toString(),
                    size: fmtBytes(bytes),
                    // minimal compat fields used by UI/MPV launcher
                    format: 'MP4',
                    codecName: '',
                    headers: {}
                };
            });
        } else {
            streams = [];
        }

        console.log('[MovieBox] Found', streams.length, 'streams');
        if (streams.length === 0) {
            torrentsList.innerHTML = '<div class="error-message"><i class="fas fa-info-circle"></i> No MovieBox streams found</div>';
            return;
        }

        // Group by source (detailPath)
        const groups = {};
        for (const s of streams) {
            const src = s.source || 'unknown';
            groups[src] = groups[src] || [];
            groups[src].push(s);
        }

        displayMovieBoxGroups(groups);
    } catch (error) {
        console.error('[MovieBox] Error:', error);
        torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> MovieBox Error: ${error.message}</div>`;
    }
}

// Map resolution to approximate HLS bitrate (bits/sec)
function mapResolutionToBitrate(res) {
    const n = parseInt(String(res).replace(/[^0-9]/g, ''), 10) || 0;
    if (n >= 1080) return 5000000;
    if (n >= 720) return 2500000;
    if (n >= 480) return 1200000;
    if (n >= 360) return 600000;
    return 0; // mpv will pick automatically
}

// Render MovieBox groups with resolution buttons
function displayMovieBoxGroups(groups) {
    const torrentsList = document.getElementById('torrentsList');
    torrentsList.innerHTML = '';

    const groupNames = Object.keys(groups);
    if (groupNames.length === 0) {
        torrentsList.innerHTML = '<div class="error-message"><i class="fas fa-info-circle"></i> No streams available</div>';
        return;
    }

    groupNames.forEach((src) => {
        const items = groups[src] || [];

        const sample = items[0]; // for display info only

        const div = document.createElement('div');
        div.className = 'torrent-item';
        div.style.cursor = 'default';
        div.innerHTML = `
                    <div class="torrent-info">
                        <div class="torrent-name">MovieBox - ${src}</div>
                        <div class="torrent-details"><span>${sample ? (sample.format || '') : ''}${sample && sample.codecName ? ' • ' + sample.codecName : ''}</span></div>
                    </div>
                    <div class="torrent-actions" data-src="${encodeURIComponent(src)}"></div>
                `;
        torrentsList.appendChild(div);

        const actions = div.querySelector('.torrent-actions');

        // Create a button for EVERY stream the API returned for this source
        items.forEach((stream) => {
            const resStr = (stream.resolutions || '').toString().trim();
            const label = resStr ? `${resStr}${/p$/.test(resStr) ? '' : 'p'}` : (stream.format || 'Open');
            const btn = document.createElement('button');
            btn.className = 'torrent-btn';
            btn.textContent = label;
            btn.title = `${stream.format || ''}${stream.codecName ? ' • ' + stream.codecName : ''}${stream.size ? ' • ' + stream.size : ''}`.trim();
            btn.addEventListener('click', () => openMovieBoxInMPV(stream, resStr || null));
            actions.appendChild(btn);
        });
    });
}

async function openMovieBoxInMPV(stream, resolution = null) {
    try {
        if (!window.electronAPI || !window.electronAPI.openMpvWithHeaders) {
            showNotification('MPV (advanced) integration not available', 'error');
            return;
        }

        const url = stream.url;
        const headers = stream.headers || {};
        const ua = headers.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
        const ref = headers.referer || 'https://fmoviesunblocked.net/';
        const cookie = headers.cookie || '';

        const bitrate = resolution ? mapResolutionToBitrate(resolution) : 0;

        const result = await window.electronAPI.openMpvWithHeaders({
            url,
            userAgent: ua,
            referer: ref,
            cookie,
            hlsBitrate: bitrate || undefined
        });

        if (result?.success) {
            showNotification('Opened in MPV', 'success');
        } else {
            showNotification(`MPV Error: ${result?.message || 'Unknown error'}`, 'error');
        }
    } catch (e) {
        console.error('[MovieBox] MPV open error:', e);
        showNotification('Failed to open in MPV', 'error');
    }
}

// Fetch torrents from the backend
async function fetchTorrents(season = null, episode = null) {
    if (!currentContent) {
        try { showNotification('Select a movie/show first'); } catch (_) { }
        return;
    }

    // Track last searched parameters for provider switching
    lastSearchedSeason = season;
    lastSearchedEpisode = episode;

    // Check selected provider first
    if (selectedProvider === 'nuvio') {
        console.log('[Provider] Routing to Nuvio');
        return fetchNuvioStreams(season, episode);
    } else if (selectedProvider === 'comet') {
        console.log('[Provider] Routing to Comet');
        return fetchCometTorrents(season, episode);
    } else if (selectedProvider === '111477') {
        console.log('[Provider] Routing to 111477');
        return fetch111477Streams(season, episode);
    } else if (selectedProvider === 'moviebox') {
        console.log('[Provider] Routing to MovieBox');
        return fetchMovieBoxStreams(season, episode);
    } else if (selectedProvider === 'torrentio' || selectedProvider === 'torrentless' || selectedProvider === 'jackett') {
        // Explicit provider override buttons
        console.log('[Provider] Explicit override:', selectedProvider);
        // Bypass settings and force the desired path
        if (selectedProvider === 'jackett') {
            // Go straight to Jackett mode below
        } else if (selectedProvider === 'torrentio') {
            // Force torrentio branch
            try {
                const tmdbId = currentContent.id;
                const mediaType = currentMediaType;
                const externalIdsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
                const externalIdsRes = await fetch(externalIdsUrl);
                if (!externalIdsRes.ok) throw new Error('Failed to get IMDB ID from TMDB');
                const externalIds = await externalIdsRes.json();
                const imdbId = externalIds.imdb_id;
                if (!imdbId) throw new Error('No IMDB ID found for this content');
                let torrentioUrl;
                if (mediaType === 'movie') {
                    torrentioUrl = `http://localhost:6987/torrentio/api/${imdbId}`;
                } else if (season && episode) {
                    torrentioUrl = `http://localhost:6987/torrentio/api/${imdbId}/${season}/${episode}`;
                } else {
                    throw new Error('Season and episode required for TV shows');
                }
                torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching Torrentio...</div>';
                const response = await fetch(torrentioUrl);
                if (!response.ok) throw new Error(`Torrentio error: ${response.statusText}`);
                const data = await response.json();
                const streams = data.streams || [];
                const torrents = streams.map(stream => {
                    const magnetLink = stream.magnetLink || (stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}` : null);
                    if (!magnetLink) return null;
                    const titleMatch = (stream.title || '').match(/👤\s*(\d+)/);
                    const sizeMatch = (stream.title || '').match(/💾\s*([\d.]+\s*[KMGT]B)/i);
                    const seeders = titleMatch ? parseInt(titleMatch[1]) : 0;
                    const sizeStr = sizeMatch ? sizeMatch[1] : '0 B';
                    const sizeParts = sizeStr.match(/([\d.]+)\s*([KMGT]?B)/i);
                    let sizeBytes = 0;
                    if (sizeParts) {
                        const num = parseFloat(sizeParts[1]);
                        const unit = sizeParts[2].toUpperCase();
                        const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3, 'TB': 1024 ** 4 };
                        sizeBytes = Math.round(num * (multipliers[unit] || 1));
                    }
                    return { title: (stream.title || stream.name || '').split('\n')[0], magnet: magnetLink, seeders, size: sizeBytes };
                }).filter(Boolean);
                displayTorrents(torrents, season, episode);
                return;
            } catch (error) {
                console.error('[Torrentio] Error:', error);
                torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Torrentio Error: ${error.message}</div>`;
                return;
            }
        } else if (selectedProvider === 'torrentless') {
            // Force in-app scraper branch
            try {
                let query = currentContent.title || currentContent.name;
                if (currentMediaType === 'movie') {
                    const year = (currentContent.release_date || '').substring(0, 4);
                    if (year) query = `${query} ${year}`;
                } else if (currentMediaType === 'tv') {
                    if (season && episode) {
                        const seasonStr = String(season).padStart(2, '0');
                        const episodeStr = String(episode).padStart(2, '0');
                        query = `${query} S${seasonStr}E${episodeStr}`;
                    } else if (season) {
                        const seasonStr = String(season).padStart(2, '0');
                        query = `${query} S${seasonStr}`;
                    }
                }
                const torrentlessUrl = `http://localhost:6987/torrentless/api/search?q=${encodeURIComponent(query)}&page=1`;
                torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching Torrentless...</div>';
                const response = await fetch(torrentlessUrl);
                if (!response.ok) throw new Error(`In-App Scraper error: ${response.statusText}`);
                const data = await response.json();
                // New format: { query, page, items: [{ name, magnet, size, seeds, leech }] }
                const items = data.items || [];
                const torrents = items.map(item => {
                    // Parse seeds string (e.g., "12,860" -> 12860)
                    const seeders = parseInt((item.seeds || '0').replace(/,/g, ''), 10) || 0;

                    // Parse size string to bytes
                    let sizeBytes = 0;
                    if (item.size) {
                        const sizeStr = item.size;
                        const sizeParts = sizeStr.match(/([\d.]+)\s*([KMGT]?B)/i);
                        if (sizeParts) {
                            const num = parseFloat(sizeParts[1]);
                            const unit = sizeParts[2].toUpperCase();
                            const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3, 'TB': 1024 ** 4 };
                            sizeBytes = Math.round(num * (multipliers[unit] || 1));
                        }
                    }

                    return {
                        title: item.name,        // New format uses 'name' not 'title'
                        magnet: item.magnet,
                        seeders: seeders,
                        size: sizeBytes
                    };
                });
                displayTorrents(torrents, season, episode);
                return;
            } catch (error) {
                console.error('[Torrentless] Error:', error);
                torrentsList.innerHTML = `<div class=\"error-message\"><i class=\"fas fa-exclamation-triangle\"></i> In-App Scraper Error: ${error.message}</div>`;
                return;
            }
        }
    }

    // Playtorrio (default) - use existing torrent search logic
    console.log('[Provider] Using Playtorrio (default torrent search)');

    // Check if Watch without Jackett is enabled and which source to use
    let torrentSource = 'torrentio'; // default
    let useTorrentless = false;
    try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        if (res.ok) {
            const settings = await res.json();
            useTorrentless = !!settings.useTorrentless;
            torrentSource = settings.torrentSource || 'torrentio';
            console.log('=================================');
            console.log('[Torrents] Settings loaded:');
            console.log('  useTorrentless:', useTorrentless);
            console.log('  torrentSource:', torrentSource);
            console.log('  Mode Decision:');
            if (!useTorrentless) {
                console.log('  → Will use JACKETT (useTorrentless is false)');
            } else if (torrentSource === 'torrentio') {
                console.log('  → Will use TORRENTIO (useTorrentless=true, source=torrentio)');
            } else if (torrentSource === 'in-app-scraper') {
                console.log('  → Will use IN-APP SCRAPER (useTorrentless=true, source=in-app-scraper)');
            }
            console.log('=================================');
        }
    } catch (e) {
        console.error('[Torrents] Failed to load settings:', e);
    }

    torrentsList.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Searching...</div>';
    torrentsLoaded = true;

    // If Watch without Jackett is enabled
    if (useTorrentless) {
        // TORRENTIO MODE: Use IMDB ID
        if (torrentSource === 'torrentio') {
            console.log('[Torrentio] Using Torrentio API');
            try {
                // Get IMDB ID from TMDB
                const tmdbId = currentContent.id;
                const mediaType = currentMediaType; // 'movie' or 'tv'

                console.log('[Torrentio] Fetching IMDB ID for:', { tmdbId, mediaType });

                // Fetch external IDs from TMDB
                const externalIdsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
                console.log('[Torrentio] External IDs URL:', externalIdsUrl);

                const externalIdsRes = await fetch(externalIdsUrl);
                if (!externalIdsRes.ok) throw new Error('Failed to get IMDB ID from TMDB');

                const externalIds = await externalIdsRes.json();
                const imdbId = externalIds.imdb_id;

                console.log('[Torrentio] Got IMDB ID:', imdbId);

                if (!imdbId) {
                    throw new Error('No IMDB ID found for this content');
                }

                let torrentioUrl;
                if (mediaType === 'movie') {
                    // Movies: http://localhost:6987/torrentio/api/tt5950044
                    torrentioUrl = `http://localhost:6987/torrentio/api/${imdbId}`;
                    console.log('[Torrentio] Movie URL:', torrentioUrl);
                } else if (season && episode) {
                    // TV Shows: http://localhost:6987/torrentio/api/tt13159924/2/1
                    torrentioUrl = `http://localhost:6987/torrentio/api/${imdbId}/${season}/${episode}`;
                    console.log('[Torrentio] TV Show URL:', torrentioUrl);
                } else {
                    throw new Error('Season and episode required for TV shows');
                }

                console.log('[Torrentio] Fetching from:', torrentioUrl);

                const response = await fetch(torrentioUrl);
                if (!response.ok) throw new Error(`Torrentio error: ${response.statusText}`);

                const data = await response.json();
                console.log('[Torrentio] Received data:', data);

                const streams = data.streams || [];
                console.log('[Torrentio] Found', streams.length, 'streams');

                // Convert Torrentio format to our torrent format
                const torrents = streams.map(stream => {
                    // Extract magnet link (Torrentio might return magnetLink or construct it from infoHash)
                    const magnetLink = stream.magnetLink ||
                        (stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}` : null);

                    if (!magnetLink) return null;

                    // Extract seeders and size from title
                    const titleMatch = stream.title.match(/👤\s*(\d+)/);
                    const sizeMatch = stream.title.match(/💾\s*([\d.]+\s*[KMGT]B)/i);
                    const seeders = titleMatch ? parseInt(titleMatch[1]) : 0;
                    const sizeStr = sizeMatch ? sizeMatch[1] : '0 B';

                    // Convert size string to bytes
                    const sizeParts = sizeStr.match(/([\d.]+)\s*([KMGT]?B)/i);
                    let sizeBytes = 0;
                    if (sizeParts) {
                        const num = parseFloat(sizeParts[1]);
                        const unit = sizeParts[2].toUpperCase();
                        const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3, 'TB': 1024 ** 4 };
                        sizeBytes = Math.round(num * (multipliers[unit] || 1));
                    }

                    return {
                        title: stream.title.split('\n')[0] || stream.name, // First line of title
                        magnet: magnetLink,
                        seeders: seeders,
                        size: sizeBytes
                    };
                }).filter(Boolean);

                console.log('[Torrentio] Converted', torrents.length, 'torrents');
                displayTorrents(torrents, season, episode);
                return;
            } catch (error) {
                console.error('[Torrentio] Error:', error);
                torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Torrentio Error: ${error.message}</div>`;
                return;
            }
        }
        // IN-APP SCRAPER MODE: Use search query (same format as Jackett)
        else if (torrentSource === 'in-app-scraper') {
            console.log('[Torrentless] Using In-App Scraper API');
            try {
                // Build search query - SAME FORMAT AS JACKETT
                let query = currentContent.title || currentContent.name;

                if (currentMediaType === 'movie') {
                    const year = (currentContent.release_date || '').substring(0, 4);
                    if (year) {
                        query = `${query} ${year}`;
                    }
                } else if (currentMediaType === 'tv') {
                    if (season && episode) {
                        const seasonStr = String(season).padStart(2, '0');
                        const episodeStr = String(episode).padStart(2, '0');
                        query = `${query} S${seasonStr}E${episodeStr}`;
                    } else if (season) {
                        const seasonStr = String(season).padStart(2, '0');
                        query = `${query} S${seasonStr}`;
                    }
                }

                // Use Torrentless API: http://localhost:6987/torrentless/api/search?q=Superman&page=1
                const torrentlessUrl = `http://localhost:6987/torrentless/api/search?q=${encodeURIComponent(query)}&page=1`;
                console.log('[Torrentless] Query:', query);
                console.log('[Torrentless] Fetching from:', torrentlessUrl);

                const response = await fetch(torrentlessUrl);
                if (!response.ok) throw new Error(`In-App Scraper error: ${response.statusText}`);

                const data = await response.json();
                console.log('[Torrentless] Raw response:', data);

                // Torrentless returns { query, page, items: [{ name, magnet, size, seeds, leech }] }
                const items = data.items || [];
                console.log('[Torrentless] Found', items.length, 'items');

                // Convert Torrentless format to our torrent format
                const torrents = items.map(item => {
                    // Parse seeds string (e.g., "12,860" -> 12860)
                    const seeders = parseInt((item.seeds || '0').replace(/,/g, ''), 10) || 0;

                    // Parse size string to bytes (e.g., "2.39 GB" -> bytes)
                    let sizeBytes = 0;
                    if (item.size) {
                        const sizeStr = item.size;
                        const sizeParts = sizeStr.match(/([\d.]+)\s*([KMGT]?B)/i);
                        if (sizeParts) {
                            const num = parseFloat(sizeParts[1]);
                            const unit = sizeParts[2].toUpperCase();
                            const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3, 'TB': 1024 ** 4 };
                            sizeBytes = Math.round(num * (multipliers[unit] || 1));
                        }
                    }

                    return {
                        title: item.name,           // New format uses 'name' not 'title'
                        magnet: item.magnet,
                        seeders: seeders,
                        size: sizeBytes
                    };
                });

                console.log('[Torrentless] Converted', torrents.length, 'torrents');
                displayTorrents(torrents, season, episode);
                return;
            } catch (error) {
                console.error('[Torrentless] Error:', error);
                torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Scraper Error: ${error.message}</div>`;
                return;
            }
        }
        torrentsList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading torrents...</div>';

        try {
            let streams = [];
            // Use IMDb ID if available (preferred for Torrentio)
            if (currentContent && currentContent.external_ids && currentContent.external_ids.imdb_id) {
                const imdbId = currentContent.external_ids.imdb_id;
                if (season && episode) {
                    streams = await TorrentioService.getSeriesStreams(imdbId, season, episode);
                } else {
                    streams = await TorrentioService.getMovieStreams(imdbId);
                }
            } else if (tmdbId) {
                // Fallback using TMDB ID if needed, though Torrentio favors IMDb
                // For now we error if no IMDb ID found
                throw new Error('IMDb ID required for Torrentio. Please verify metadata.');
            } else {
                throw new Error('Cannot fetch streams without IMDb ID');
            }

            if (streams.length === 0) {
                torrentsList.innerHTML = '<div class="no-results">No streams found.</div>';
                return;
            }

            displayTorrents(streams, season, episode);
        } catch (error) {
            console.error('[Torrentio] Error fetching streams:', error);
            torrentsList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${error.message}</div>`;
        }
    }

    // Helper function to check if torrent title matches specific season/episode
    function getEpisodeMatchScore(title, season, episode) {
        if (!season || !episode || !title) return 0;

        const titleLower = title.toLowerCase();
        const s = parseInt(season);
        const e = parseInt(episode);

        // Create patterns for different episode naming formats
        const patterns = [
            // S01E01 format (most common)
            new RegExp(`s0*${s}[\\s._-]*e0*${e}(?!\\d)`, 'i'),
            // S01.E01 format
            new RegExp(`s0*${s}\\.e0*${e}(?!\\d)`, 'i'),
            // 1x01 format
            new RegExp(`(?:^|\\D)${s}x0*${e}(?!\\d)`, 'i'),
            // Season 1 Episode 1 format (written out)
            new RegExp(`season[\\s._-]*0*${s}[\\s._-]*episode[\\s._-]*0*${e}(?!\\d)`, 'i'),
            // Ep1S1 or E1S1 format
            new RegExp(`e(?:p)?0*${e}s0*${s}(?!\\d)`, 'i'),
            // S1Ep1 format
            new RegExp(`s0*${s}ep0*${e}(?!\\d)`, 'i'),
            // [1-01] or (1-01) format
            new RegExp(`[\\[\\(]0*${s}[\\s._-]0*${e}[\\]\\)]`, 'i')
        ];

        // Check if any pattern matches
        for (let i = 0; i < patterns.length; i++) {
            if (patterns[i].test(titleLower)) {
                // Return higher score for exact matches (based on pattern priority)
                // First pattern (S01E01) gets highest bonus
                return 1000 - (i * 10);
            }
        }

        return 0; // No match
    }

    // Display torrents
    function displayTorrents(torrents, season = null, episode = null) {
        // Compute episode match scores if TV ep context; actual sorting applied in renderTorrentsPage based on current sort mode
        if (season && episode && currentMediaType === 'tv') {
            allTorrents = (torrents || []).map(t => ({
                ...t,
                episodeMatchScore: getEpisodeMatchScore(t.title, season, episode)
            }));
        } else {
            allTorrents = (torrents || []).slice();
        }
        torrentsPage = 1;
        renderTorrentsPage();
    }

    function renderTorrentsPage() {
        torrentsList.innerHTML = '';

        console.log('[RENDER] Starting renderTorrentsPage with sort mode:', torrentSortMode);

        // Apply sorting according to mode (keeping episode match priority for TV episodes)
        const isTvEp = currentMediaType === 'tv' && lastSearchedSeason && lastSearchedEpisode;
        const toSort = (allTorrents || []).slice();

        console.log('[RENDER] Total torrents to sort:', toSort.length, 'isTvEp:', isTvEp);

        toSort.sort((a, b) => {
            // TV episode exact match priority (always first)
            if (isTvEp) {
                const ea = Number(a.episodeMatchScore || 0);
                const eb = Number(b.episodeMatchScore || 0);
                if (eb !== ea) return eb - ea; // primary: episode match
            }

            // Apply selected sort mode
            const mode = (typeof torrentSortMode === 'string') ? torrentSortMode : 'seeders';

            if (mode === 'size-asc') {
                const sa = Number(a.size || 0);
                const sb = Number(b.size || 0);
                return sa - sb; // smallest first
            } else if (mode === 'size-desc') {
                const sa = Number(a.size || 0);
                const sb = Number(b.size || 0);
                return sb - sa; // largest first
            } else {
                // default: seeders desc
                const seeda = Number(a.seeders || 0);
                const seedb = Number(b.seeders || 0);
                return seedb - seeda;
            }
        });

        console.log('[RENDER] After sort, first 3 torrents:');
        toSort.slice(0, 3).forEach((t, i) => {
            console.log(`  ${i + 1}. Size: ${((t.size || 0) / 1024 / 1024 / 1024).toFixed(2)}GB, Seeds: ${t.seeders}, Title: ${t.title?.substring(0, 50)}`);
        });

        // Apply keyword filter
        let filteredTorrents = toSort;
        const keyword = torrentKeywordFilter ? torrentKeywordFilter.value.trim().toLowerCase() : '';
        if (keyword) {
            filteredTorrents = toSort.filter(t =>
                (t.title || '').toLowerCase().includes(keyword)
            );
        }

        // Apply size filter
        try {
            if (typeof torrentSizeFilter === 'string' && torrentSizeFilter !== 'all') {
                filteredTorrents = filteredTorrents.filter(t => bytesMatchesSizeFilter(t.size));
            }
        } catch (_) { }

        if (filteredTorrents.length === 0) {
            torrentsList.innerHTML = keyword
                ? '<p>No torrents match your filter.</p>'
                : '<p>No torrents found. Try enabling <strong>Streaming Servers</strong> in the app settings for more sources.</p>';
            return;
        }

        const start = (torrentsPage - 1) * torrentsPerPage;
        const end = start + torrentsPerPage;
        const paginatedTorrents = filteredTorrents.slice(start, end);

        let rdAvailChecked = 0;
        const rdAvailBudget = 12; // cap RD availability checks per render
        paginatedTorrents.forEach(torrent => {
            const item = document.createElement('div');
            item.className = 'torrent-item';
            item.innerHTML = `
                    <div class="torrent-info">
                        <p class="torrent-name">
                            ${torrent.title}
                            <span class="cached-badge" style="display:none;">Cached</span>
                        </p>
                        <div class="torrent-details">
                            <span><i class="fas fa-arrow-up"></i> ${torrent.seeders}</span>
                            <span><i class="fas fa-database"></i> ${((torrent.size || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                        </div>
                    </div>
                    <div class="torrent-actions">
                        <button class="btn-play torrent-btn"><i class="fas fa-play"></i> Play</button>
                        <button class="btn-copy torrent-btn"><i class="fas fa-copy"></i> Copy</button>
                    </div>
                `;

            item.querySelector('.btn-play').addEventListener('click', () => startStream(torrent.magnet));
            item.querySelector('.btn-copy').addEventListener('click', () => copyMagnet(torrent.magnet));
            torrentsList.appendChild(item);

            // Removed instant availability checks and badges
        });

        renderTorrentPagination();
    }

    function renderTorrentPagination() {
        // Apply same keyword filter for pagination count
        let filteredTorrents = allTorrents;
        const keyword = torrentKeywordFilter ? torrentKeywordFilter.value.trim().toLowerCase() : '';
        if (keyword) {
            filteredTorrents = allTorrents.filter(t =>
                (t.title || '').toLowerCase().includes(keyword)
            );
        }

        // Apply size filter as well for accurate page count
        try {
            if (typeof torrentSizeFilter === 'string' && torrentSizeFilter !== 'all') {
                filteredTorrents = filteredTorrents.filter(t => bytesMatchesSizeFilter(t.size));
            }
        } catch (_) { }

        const totalPages = Math.ceil(filteredTorrents.length / torrentsPerPage);
        if (totalPages <= 1) {
            return;
        }

        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'torrent-pagination';

        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
        prevBtn.disabled = torrentsPage === 1;
        prevBtn.addEventListener('click', () => {
            if (torrentsPage > 1) {
                torrentsPage--;
                renderTorrentsPage();
            }
        });

        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
        nextBtn.disabled = torrentsPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (torrentsPage < totalPages) {
                torrentsPage++;
                renderTorrentsPage();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${torrentsPage} of ${totalPages}`;

        paginationContainer.appendChild(prevBtn);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextBtn);

        torrentsList.appendChild(paginationContainer);
    }

    // Start streaming a torrent
    async function startStream(magnet) {
        // Reset any stale state from previous streams
        resetStreamingState();

        // Refresh debrid flags before deciding path
        await ensureDebridState();
        const providerLabel = getProviderDisplayName(debridProvider);

        console.log('[UI][Stream] Starting with settings:', { useDebrid, debridAuth, debridProvider });

        // If Debrid is enabled but not authenticated, block fallback and prompt login
        if (useDebrid && !debridAuth) {
            console.warn('[UI][Debrid] blocked: enabled but not logged in');
            showNotification(`${providerLabel} is enabled but you are not logged in. Please log in to continue.`);
            promptDebridLogin();
            return;
        }

        // Debrid-exclusive flow when enabled: skip WebTorrent entirely
        if (useDebrid && debridAuth && magnet && magnet.startsWith('magnet:')) {
            console.log('[UI][Stream] Using Debrid path');
            try {
                // Start a new Debrid session (used to cancel polling if user exits)
                const myDebridSession = ++debridFlowSession;
                const isSessionActive = (expectedId) => {
                    const playerOpen = mpvPlayerContainer.classList.contains('active');
                    const sessionOk = (myDebridSession === debridFlowSession);
                    const idOk = (!expectedId) || (currentDebridTorrentId === expectedId);
                    return playerOpen && sessionOk && idOk;
                };
                // Open our player UI first
                showPlayer();
                mpvLoading.style.display = 'flex';
                mpvControls.style.display = 'none';
                fileList.innerHTML = '';
                subtitleList.innerHTML = '';
                subtitleControls.style.display = 'none';
                playerTitle.textContent = `Preparing ${providerLabel}…`;

                // Add magnet to RD and select all
                console.log('[UI][Debrid] prepare addMagnet');
                const prep = await fetch(`${API_BASE_URL}/debrid/prepare`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ magnet })
                });
                if (!prep.ok) {
                    let notif = 'Debrid prepare failed';
                    try {
                        const txt = await prep.text();
                        console.error('[UI][Debrid] prepare failed', txt);
                        try {
                            const ej = JSON.parse(txt);
                            if (ej && ej.code === 'RD_PREMIUM_REQUIRED') {
                                notif = `${providerLabel} premium is required to add torrents. Disable Debrid in Settings to use WebTorrent instead.`;
                            } else if (ej && ej.code === 'DEBRID_UNAUTH') {
                                notif = `${providerLabel} authentication invalid. Please login again.`;
                                if (debridStatus) debridStatus.textContent = 'Not logged in';
                                promptDebridLogin();
                            } else if (ej && ej.code === 'TORBOX_UNIMPLEMENTED') {
                                notif = 'TorBox is not supported yet. Please switch provider in Settings or disable Debrid to use WebTorrent.';
                            } else if (ej && ej.error) {
                                notif = ej.error;
                            }
                        } catch { /* not json */ }
                    } catch { /* ignore */ }
                    showNotification(notif);
                    mpvLoading.style.display = 'none';
                    return;
                }
                const prepj = await prep.json();
                const rdId = prepj.id;
                currentDebridTorrentId = rdId; // Track globally for cleanup
                let info = prepj.info || null;
                if (!isSessionActive(rdId)) return; // user closed / session invalidated

                if (!info || !Array.isArray(info.files) || !info.files.length) {
                    await new Promise(r => setTimeout(r, 900));
                    if (!isSessionActive(rdId)) return; // cancelled
                    const fres = await fetch(`${API_BASE_URL}/debrid/files?id=${encodeURIComponent(rdId)}`);
                    if (fres.ok) info = await fres.json();
                }

                let files = (info && info.files) || [];
                // If metadata/files are not ready yet, poll a few times (helps TorBox and slow RD responses)
                if (!files.length) {
                    for (let i = 0; i < 8; i++) {
                        await new Promise(r => setTimeout(r, 1000));
                        if (!isSessionActive(rdId)) return; // cancelled
                        try {
                            const rf = await fetch(`${API_BASE_URL}/debrid/files?id=${encodeURIComponent(rdId)}`);
                            if (rf.ok) {
                                const ij = await rf.json();
                                files = (ij && ij.files) || [];
                                if (files.length) break;
                            }
                        } catch { }
                    }
                }
                // Render RD files for explicit selection, like our torrent file list
                mpvLoading.style.display = 'none';
                fileList.innerHTML = '';
                playerTitle.textContent = info?.filename || providerLabel;
                const rdVideos = files.filter(f => /\.(mp4|mkv|avi|mov)$/i.test(f.path || f.filename || ''));
                const rdSubs = files.filter(f => /\.(srt|vtt)$/i.test(f.path || f.filename || ''));

                const displayName = (f) => (f.path || f.filename || 'file');
                const displaySize = (f) => ((f.bytes || f.size || 0) / 1024 / 1024).toFixed(2) + ' MB';

                // Helper to render a small cached status badge
                const statusBadgeHtml = (file) => {
                    const cached = (file && file.cached === true) || (Array.isArray(file.links) && file.links.length > 0);
                    const label = cached ? 'Cached' : 'Not cached';
                    const bg = cached ? 'background:#198754;' : 'background:#6c757d;';
                    return `<span class="source-badge rd-cache-badge" style="${bg} margin-left:6px;">${label}</span>`;
                };

                // Poll Debrid files info until ALL files have links (cached) or timeout
                async function pollForAllLinks(id, { timeoutMs = 60000, intervalMs = 2000 } = {}) {
                    const start = Date.now();
                    console.log('[UI][Debrid] Starting polling for file links...');
                    while (Date.now() - start < timeoutMs) {
                        if (!isSessionActive(id)) return null; // cancelled/closed
                        try {
                            const fres = await fetch(`${API_BASE_URL}/debrid/files?id=${encodeURIComponent(id)}`);
                            if (!fres.ok) {
                                // If rate limited or disabled endpoint reported, stop trying
                                try {
                                    const t = await fres.text();
                                    if (/RD_RATE_LIMIT|RD_FEATURE_UNAVAILABLE|TB_NO_SEEDS/i.test(t)) {
                                        if (/TB_NO_SEEDS/i.test(t)) {
                                            showNotification('❌ This torrent has no seeders and cannot be cached. Try a different release.', 'error');
                                        }
                                        return null;
                                    }
                                } catch { }
                                await new Promise(r => setTimeout(r, intervalMs));
                                continue;
                            }
                            const info = await fres.json();
                            const filesList = Array.isArray(info?.files) ? info.files : [];
                            const videos = filesList.filter(f => /\.(mp4|mkv|avi|mov)$/i.test(f.path || f.filename || ''));

                            // Check if any video files have links
                            const anyHasLinks = videos.some(f => Array.isArray(f.links) && f.links.length > 0);

                            if (anyHasLinks) {
                                console.log('[UI][Debrid] Files are ready! Links available.');
                                return filesList;
                            }

                            // Show progress if available
                            const status = info?.status || '';
                            const progress = info?.progress || 0;
                            if (status && progress > 0) {
                                playerTitle.textContent = `${info?.filename || 'Downloading'} - ${progress}%`;
                            }
                        } catch (e) {
                            console.warn('[UI][Debrid] Polling error:', e?.message);
                        }
                        await new Promise(r => setTimeout(r, intervalMs));
                    }
                    console.warn('[UI][Debrid] Polling timed out after', timeoutMs, 'ms');
                    return null; // timed out
                }

                // Poll Debrid files info until the specific file has links (cached) or timeout
                async function waitForRdLinks(id, fileId, { timeoutMs = 30000, intervalMs = 1500 } = {}) {
                    const start = Date.now();
                    while (Date.now() - start < timeoutMs) {
                        if (!isSessionActive(id)) return null; // cancelled/closed
                        try {
                            const fres = await fetch(`${API_BASE_URL}/debrid/files?id=${encodeURIComponent(id)}`);
                            if (!fres.ok) {
                                // If rate limited or disabled endpoint reported, stop trying
                                try {
                                    const t = await fres.text();
                                    if (/RD_RATE_LIMIT|RD_FEATURE_UNAVAILABLE|TB_NO_SEEDS/i.test(t)) {
                                        if (/TB_NO_SEEDS/i.test(t)) {
                                            showNotification('❌ This torrent has no seeders. Try a different release.', 'error');
                                        }
                                        return null;
                                    }
                                } catch { }
                                await new Promise(r => setTimeout(r, intervalMs));
                                continue;
                            }
                            const info = await fres.json();
                            const list = Array.isArray(info?.files) ? info.files : [];
                            const found = list.find(x => String(x.id || x.file) === String(fileId));
                            if (found && Array.isArray(found.links) && found.links.length) {
                                return found.links[0];
                            }
                        } catch { }
                        await new Promise(r => setTimeout(r, intervalMs));
                    }
                    return null; // timed out
                }

                // Check if any files are not cached yet
                const hasUncachedFiles = rdVideos.some(f => !Array.isArray(f.links) || f.links.length === 0);

                if (hasUncachedFiles) {
                    // Show status message
                    playerTitle.textContent = `${info?.filename || 'Torrent'} - Preparing files...`;
                    showNotification('Waiting for files to be ready on Real-Debrid...');

                    // Poll for links in background
                    (async () => {
                        const updatedFiles = await pollForAllLinks(rdId);
                        if (updatedFiles) {
                            if (!isSessionActive(rdId)) return; // cancelled
                            // Re-render files with updated links
                            const updatedVideos = updatedFiles.filter(f => /\.(mp4|mkv|avi|mov)$/i.test(f.path || f.filename || ''));
                            const updatedSubs = updatedFiles.filter(f => /\.(srt|vtt)$/i.test(f.path || f.filename || ''));

                            // Update the rdVideos and rdSubs arrays
                            rdVideos.length = 0;
                            rdVideos.push(...updatedVideos);
                            rdSubs.length = 0;
                            rdSubs.push(...updatedSubs);

                            // Re-render file list
                            fileList.innerHTML = '';
                            rdVideos.forEach((f) => {
                                const item = document.createElement('div');
                                item.className = 'file-item';
                                item.innerHTML = `<p class="file-name">${displayName(f)} ${statusBadgeHtml(f)}</p><p class="file-size">(${displaySize(f)})</p>`;
                                item.addEventListener('click', createFileClickHandler(f, rdId, rdSubs));
                                fileList.appendChild(item);
                            });

                            playerTitle.textContent = info?.filename || providerLabel;
                            showNotification('✅ Files are ready! Click to play.');
                        } else {
                            showNotification('Files are taking longer than expected. Try again later.');
                        }
                    })();
                }

                // Extract click handler into a function so we can reuse it
                function createFileClickHandler(f, rdId, rdSubs) {
                    return async (event) => {
                        try {
                            const clickedItem = event?.currentTarget;
                            if (!isSessionActive(rdId)) return; // cancelled

                            // Disconnect from current debrid torrent before switching files
                            if (currentDebridTorrentId && currentDebridTorrentId !== rdId) {
                                try {
                                    console.log('[UI][Debrid] Disconnecting from previous torrent before file switch:', currentDebridTorrentId);
                                    await fetch(`${API_BASE_URL}/debrid/cleanup`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: currentDebridTorrentId })
                                    });
                                } catch (e) {
                                    console.warn('[UI][Debrid] Error cleaning up previous torrent:', e?.message);
                                }
                            }

                            // Set resume key and prefetch resume info for Debrid path
                            try {
                                const fileId = String(f.id || f.file || f.filename || f.path || '0');
                                resumeKey = `debrid:${debridProvider}:${rdId}:${fileId}`;
                                resumeInfo = await fetchResume(resumeKey);
                            } catch (_) { }

                            // Always select just this file for RD to process
                            try {
                                console.log('[UI][Debrid] select-files', { id: rdId, file: String(f.id || f.file) });
                                const selectRes = await fetch(`${API_BASE_URL}/debrid/select-files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rdId, files: String(f.id || f.file) }) });
                                if (!selectRes.ok) {
                                    const errText = await selectRes.text();
                                    console.warn('[UI][Debrid] select-files failed', errText);
                                    try {
                                        const errJson = JSON.parse(errText);
                                        if (errJson.code === 'DEBRID_UNAUTH') {
                                            showNotification('Real-Debrid authentication expired. Please logout and login again in Settings.');
                                            mpvLoading.style.display = 'none';
                                            if (debridStatus) debridStatus.textContent = 'Not logged in';
                                            return;
                                        }
                                    } catch { }
                                } else {
                                    // Check if torrent was re-added with new ID for file switching
                                    try {
                                        const selectData = await selectRes.json();
                                        if (selectData.reAddedForFileSwitch && selectData.id) {
                                            console.log('[UI][Debrid] Torrent re-added for file switch. Old ID:', rdId, '→ New ID:', selectData.id);
                                            rdId = selectData.id; // Update to new torrent ID
                                            currentDebridTorrentId = selectData.id; // Update global tracker
                                            if (!isSessionActive(rdId)) return; // cancelled
                                            showNotification('Switched to episode ' + (f.id || f.file) + ' - Reloading file list...');

                                            // Fully reload the file selector with new torrent info
                                            if (selectData.info && selectData.info.files) {
                                                console.log('[UI][Debrid] Reloading file selector with new torrent info');
                                                const newFiles = selectData.info.files;
                                                const newVideos = newFiles.filter(f => /\.(mp4|mkv|avi|mov)$/i.test(f.path || f.filename || ''));
                                                const newSubs = newFiles.filter(f => /\.(srt|vtt)$/i.test(f.path || f.filename || ''));

                                                // Update the arrays
                                                rdVideos.length = 0;
                                                rdVideos.push(...newVideos);
                                                rdSubs.length = 0;
                                                rdSubs.push(...newSubs);

                                                // Clear and re-render file list
                                                fileList.innerHTML = '';
                                                rdVideos.forEach((newFile) => {
                                                    const item = document.createElement('div');
                                                    item.className = 'file-item';
                                                    item.innerHTML = `<p class="file-name">${displayName(newFile)} ${statusBadgeHtml(newFile)}</p><p class="file-size">(${displaySize(newFile)})</p>`;
                                                    item.addEventListener('click', createFileClickHandler(newFile, rdId, newSubs));
                                                    fileList.appendChild(item);
                                                });

                                                // Update player title with torrent name
                                                if (selectData.info.filename) {
                                                    playerTitle.textContent = selectData.info.filename;
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('[UI][Debrid] Could not parse select-files response:', e?.message);
                                    }
                                }
                            } catch (e) { console.warn('[UI][Debrid] select-files exception', e?.message); }

                            // Find current link if already cached, else wait for caching
                            let link = Array.isArray(f.links) && f.links.length ? f.links[0] : null;
                            if (!link) {
                                showNotification(`Not cached yet on ${providerLabel}. Waiting to cache…`);
                                // Show loading indicator while waiting
                                mpvLoading.style.display = 'flex';
                                const waited = await waitForRdLinks(rdId, (f.id || f.file));
                                if (!isSessionActive(rdId)) return; // cancelled
                                link = waited;
                                // Update badge to Cached if now available
                                if (link && clickedItem) {
                                    try {
                                        const badge = clickedItem.querySelector('.rd-cache-badge');
                                        if (badge) { badge.textContent = 'Cached'; badge.style.background = '#198754'; }
                                    } catch { }
                                }
                            }
                            if (!link) {
                                showNotification('Still not cached. Try again later or disable Debrid in Settings to use WebTorrent.');
                                mpvLoading.style.display = 'none';
                                return;
                            }
                            // Unrestrict the resolved link
                            const unres = await fetch(`${API_BASE_URL}/debrid/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }) });
                            if (!unres.ok) {
                                console.error('[UI][Debrid] unrestrict/stream resolve failed', await unres.text());
                                const msg = (debridProvider === 'torbox') ? 'Failed to get stream link' : 'Failed to unrestrict';
                                showNotification(msg);
                                mpvLoading.style.display = 'none';
                                return;
                            }
                            const uj = await unres.json();
                            if (!uj?.url) { console.error('[UI][Debrid] unrestrict response missing url', uj); showNotification('Invalid Debrid URL'); mpvLoading.style.display = 'none'; return; }

                            // For MPV: Use direct CDN URL to avoid query parameter encoding issues
                            // MPV's ffmpeg is strict about URL encoding and fails with proxied URLs
                            // VLC and in-app player can use the proxy for better header control
                            const cdnUrl = uj.url;

                            // Store direct CDN URL for MPV, proxy URL for others
                            currentStreamUrl = cdnUrl; // Direct CDN URL works for all players

                            const fname = baseName(f.path || f.filename || '');
                            currentSelectedVideoName = fname || displayName(f);
                            playerTitle.textContent = currentSelectedVideoName || displayName(f);
                            // Source badges -> Debrid
                            if (streamSourceBadge) { streamSourceBadge.textContent = 'Debrid'; streamSourceBadge.classList.remove('webtorrent'); streamSourceBadge.classList.add('debrid'); }
                            if (customSourceBadge) { customSourceBadge.textContent = 'Debrid'; customSourceBadge.classList.remove('webtorrent'); customSourceBadge.classList.add('debrid'); }
                            mpvControls.style.display = 'flex';
                            mpvLoading.style.display = 'none';
                            showNotification(`Ready via ${providerLabel}`);

                            // Auto-attach subtitle: prefer same folder subtitle
                            const sub = rdSubs[0];
                            if (sub && Array.isArray(sub.links) && sub.links.length) {
                                try {
                                    const su = await fetch(`${API_BASE_URL}/debrid/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: sub.links[0] }) });
                                    if (su.ok) {
                                        const suj = await su.json();
                                        if (suj?.url) {
                                            const dl = await fetch(`${API_BASE_URL}/subtitles/download-direct`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: suj.url, preferredName: displayName(sub) }) });
                                            const dlj = await dl.json();
                                            if (dl.ok && dlj.url) currentSubtitleUrl = dlj.url;
                                        }
                                    } else { console.warn('[UI][Debrid] sub unrestrict failed', await su.text()); }
                                } catch (e) { console.warn('[UI][Debrid] sub attach failed', e?.message); }
                            }
                        } catch (_) {
                            console.error('[UI][Debrid] file play failed');
                            showNotification('Failed to prepare Debrid file');
                        }
                    };
                }

                // Initial render of files
                rdVideos.forEach((f) => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    item.innerHTML = `<p class="file-name">${displayName(f)} ${statusBadgeHtml(f)}</p><p class="file-size">(${displaySize(f)})</p>`;
                    item.addEventListener('click', createFileClickHandler(f, rdId, rdSubs));
                    fileList.appendChild(item);
                });

                // Subtitle sidebar for visibility
                if (rdSubs.length) {
                    subtitleControls.style.display = 'flex';
                    subtitleList.innerHTML = '';
                    subtitleList.classList.add('subtitle-list');
                    currentSubtitles = rdSubs.map(s => ({ name: displayName(s), index: -1 }));
                    rdSubs.forEach((s) => {
                        const subItem = document.createElement('div');
                        subItem.className = 'subtitle-item';
                        const langDiv = document.createElement('div');
                        langDiv.className = 'subtitle-lang';
                        langDiv.textContent = displayName(s);
                        subItem.appendChild(langDiv);
                        subItem.addEventListener('click', async () => {
                            try {
                                const l = Array.isArray(s.links) && s.links.length ? s.links[0] : null;
                                if (!l) return;
                                const su = await fetch(`${API_BASE_URL}/debrid/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: l }) });
                                if (!su.ok) { console.warn('[UI][Debrid] sub unrestrict failed', await su.text()); return; }
                                const suj = await su.json();
                                if (!suj?.url) return;
                                const dl = await fetch(`${API_BASE_URL}/subtitles/download-direct`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: suj.url, preferredName: displayName(s) }) });
                                const dlj = await dl.json();
                                if (dl.ok && dlj.url) {
                                    currentSubtitleUrl = dlj.url;
                                    showNotification('Subtitle ready');
                                }
                            } catch (e) { console.warn('[UI][Debrid] sub attach failed', e?.message); }
                        });
                        subtitleList.appendChild(subItem);
                    });
                }
                return; // Debrid path handled fully
            } catch (e) {
                console.error('[UI][Debrid] flow failed', e?.message);
                showNotification('Debrid path failed. Falling back to WebTorrent.');
                mpvLoading.style.display = 'none';
                // Don't return here - let it fall through to WebTorrent
            }
        }

        // Fallback to WebTorrent (client-side)
        console.log('[UI][Stream] Using WebTorrent client-side');
        showPlayer();
        mpvLoading.style.display = 'flex';
        mpvControls.style.display = 'none';
        fileList.innerHTML = '';
        subtitleList.innerHTML = '';
        subtitleControls.style.display = 'none';
        playerTitle.textContent = 'Initializing torrent engine...';

        try {
            const { file, torrent } = await TorrentService.getInstance().streamTorrent(magnet);
            console.log('[UI][Stream] Torrent ready:', file.name);

            file.getBlobURL((err, url) => {
                if (err) {
                    console.error('[WebTorrent] Blob error:', err);
                    playerTitle.textContent = 'Error creating stream URL';
                    mpvLoading.innerHTML = `<p class="error-msg">${err.message}</p>`;
                    return;
                }

                mpvLoading.style.display = 'none';
                playerTitle.textContent = file.name;
                fileList.innerHTML = '';

                const item = document.createElement('div');
                item.className = 'file-item';
                item.innerHTML = `<p class="file-name">${file.name}</p><p class="file-size">(${displaySize({ size: file.length })})</p>`;
                item.addEventListener('click', () => {
                    // Use Custom HTML5 Player for Blob URL
                    currentStreamUrl = url;

                    // Directly open custom player
                    customVideo.src = url;
                    customPlayerContainer.style.display = 'flex';
                    setTimeout(() => customPlayerContainer.classList.add('active'), 10);
                    try { customVideo.play(); } catch (e) { console.error('Play error', e); }

                    if (customSourceBadge) {
                        customSourceBadge.textContent = 'WebTorrent';
                        customSourceBadge.classList.remove('debrid');
                        customSourceBadge.classList.add('webtorrent');
                    }
                });
                fileList.appendChild(item);
            });

            // Set source badges
            if (streamSourceBadge) { streamSourceBadge.textContent = 'WebTorrent'; streamSourceBadge.classList.remove('debrid'); streamSourceBadge.classList.add('webtorrent'); }

        } catch (error) {
            console.error('Error initializing WebTorrent:', error);
            playerTitle.textContent = 'Error loading torrent';
            mpvLoading.innerHTML = `<p class="error-msg">${error.message}</p>`;
        }
    }

    function promptDebridLogin() {
        try {
            showSettingsModal().then(() => {
                setTimeout(() => {
                    try {
                        const sec = document.getElementById('debridSection');
                        if (sec && typeof sec.scrollIntoView === 'function') {
                            sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        // Focus appropriate control by provider
                        if (debridProvider === 'alldebrid') {
                            if (adSection) adSection.style.display = '';
                            if (adStartPinBtn) adStartPinBtn.focus();
                        } else {
                            const input = document.getElementById('rdClientId');
                            if (input) input.focus();
                        }
                    } catch (_) { }
                }, 50);
            });
        } catch (_) {
            // As a fallback, open settings without smooth behaviors
            showSettingsModal();
        }
    }

    // Helpers: parse BTIH from magnet and pick best file from RD
    function extractInfoHashFromMagnet(magnet) {
        try {
            const m = /btih:([A-Za-z0-9]{32,40})/i.exec(magnet);
            return m ? encodeURIComponent(m[1].toUpperCase()) : '';
        } catch { return ''; }
    }
    function pickBestVideoFile(files) {
        try {
            const vids = (files || []).filter(f => /\.(mp4|mkv|avi|mov)$/i.test(f.path || f.filename || ''));
            if (!vids.length) return null;
            vids.sort((a, b) => (b.bytes || b.size || 0) - (a.bytes || a.size || 0));
            return vids[0];
        } catch { return null; }
    }

    // Display files for selection
    function displayFiles(videos, subtitles) {
        mpvLoading.style.display = 'none';
        fileList.innerHTML = '';

        // Sort videos by season and episode
        videos.sort((a, b) => {
            const regex = /(S|s)(\d+)(E|e)(\d+)|(\d+)x(\d+)|(\d+)-(\d+)/;

            const aMatch = a.name.match(regex);
            const bMatch = b.name.match(regex);

            if (aMatch && bMatch) {
                const aSeason = parseInt(aMatch[2] || aMatch[5] || aMatch[7], 10);
                const aEpisode = parseInt(aMatch[4] || aMatch[6] || aMatch[8], 10);
                const bSeason = parseInt(bMatch[2] || bMatch[5] || bMatch[7], 10);
                const bEpisode = parseInt(bMatch[4] || bMatch[6] || bMatch[8], 10);

                if (aSeason !== bSeason) {
                    return aSeason - bSeason;
                }
                return aEpisode - bEpisode;
            }
            // If no match, sort alphabetically
            return a.name.localeCompare(b.name);
        });

        videos.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                    <p class="file-name">${file.name}</p>
                    <p class="file-size">(${(file.size / 1024 / 1024).toFixed(2)} MB)</p>
                `;

            let hoverTimer;
            item.addEventListener('mouseenter', () => {
                hoverTimer = setTimeout(() => {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'file-name-tooltip';
                    tooltip.textContent = file.name;
                    item.appendChild(tooltip);
                }, 3000);
            });

            item.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimer);
                const tooltip = item.querySelector('.file-name-tooltip');
                if (tooltip) {
                    tooltip.remove();
                }
            });

            item.addEventListener('click', async () => {
                currentStreamUrl = `${API_BASE_URL}/stream-file?hash=${currentTorrentData.infoHash}&file=${file.index}`;
                currentSelectedVideoName = baseName(file.name);
                playerTitle.textContent = currentSelectedVideoName;
                // Compute resume key and prefetch resume info for WebTorrent
                try {
                    resumeKey = `webtorrent:${currentTorrentData.infoHash}:${file.index}`;
                    resumeInfo = await fetchResume(resumeKey);
                } catch (_) { }
                mpvControls.style.display = 'flex';
                // Ask backend to begin downloading the selected file and subtitles, but don't start playback yet
                try {
                    await fetch(`${API_BASE_URL}/prepare-file?hash=${currentTorrentData.infoHash}&file=${file.index}`);
                } catch (_) { }
                showNotification(`Selected: ${currentSelectedVideoName}. Click Play Now or Open in MPV to start.`);
            });
            fileList.appendChild(item);
        });

        if (subtitles.length > 0) {
            subtitleControls.style.display = 'flex';
            subtitleList.innerHTML = '';
            subtitleList.classList.add('subtitle-list');
            currentSubtitles = subtitles;
            subtitles.forEach(sub => {
                const subItem = document.createElement('div');
                subItem.className = 'subtitle-item';

                const langDiv = document.createElement('div');
                langDiv.className = 'subtitle-lang';
                langDiv.textContent = sub.name;
                subItem.appendChild(langDiv);

                subItem.addEventListener('click', async () => {
                    document.querySelectorAll('.subtitle-item').forEach(item => {
                        item.classList.remove('selected');
                    });
                    subItem.classList.add('selected');

                    currentSubtitleUrl = `${API_BASE_URL}/subtitle-file?hash=${currentTorrentData.infoHash}&file=${sub.index}`;
                    showNotification(`Selected subtitle: ${sub.name}`);
                });
                subtitleList.appendChild(subItem);
            });
        }
    }

    // Show the MPV player
    function showPlayer() {
        mpvPlayerContainer.classList.add('active');
    }

    // Close the MPV player
    async function closePlayer(showNotif = true) {
        mpvPlayerContainer.classList.remove('active');
        // Invalidate any ongoing Debrid polling loops
        debridFlowSession++;

        // Cleanup debrid torrent if one is active
        if (currentDebridTorrentId) {
            console.log('[UI][Debrid] Cleaning up torrent:', currentDebridTorrentId);
            try {
                await fetch(`${API_BASE_URL}/debrid/cleanup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentDebridTorrentId })
                });
                console.log('[UI][Debrid] Torrent cleanup complete');
            } catch (e) {
                console.warn('[UI][Debrid] Cleanup failed:', e?.message);
            }
            currentDebridTorrentId = null; // Clear tracker
        }

        if (currentTorrentData) {
            try {
                await fetch(`${API_BASE_URL}/stop-stream?hash=${currentTorrentData.infoHash}`);
            } catch (e) { }
            if (window.electronAPI && showNotif) {
                try {
                    const result = await window.electronAPI.clearWebtorrentTemp();
                    if (result.success) {
                        showNotification('Player closed and temp files cleared.');
                    } else {
                        showNotification(`Error clearing temp files: ${result.message}`);
                    }
                } catch (e) { }
            } else if (window.electronAPI) {
                // Still clear cache, just don't show notification
                try {
                    await window.electronAPI.clearWebtorrentTemp();
                } catch (e) { }
            }
        }
        // Cleanup RD auto-downloaded subtitle if present
        try { if (currentSubtitleFile) await fetch(`${API_BASE_URL}/subtitles/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: currentSubtitleFile }) }); } catch { }

        // Reset all streaming state for clean slate on next stream
        resetStreamingState();

        if (showNotif) {
            console.log('[Player] Closed and state reset');
        }
    }

    // Open stream in MPV
    async function openInMPV() {
        if (!currentStreamUrl) {
            showNotification('No file selected to play');
            return;
        }

        // On macOS, use IINA instead of MPV
        const isMac = window.electronAPI && window.electronAPI.platform === 'darwin';
        const playerName = isMac ? 'IINA' : 'MPV';
        const apiMethod = isMac ? 'openInIINA' : 'openInMPV';

        if (!window.electronAPI || !window.electronAPI[apiMethod]) {
            showNotification(`${playerName} integration not available in this environment`);
            return;
        }

        // Update Discord presence for external player streaming
        // Always use TMDB title, not torrent filename
        const title = currentContent?.title || currentContent?.name || 'Video';

        // Determine provider based on selectedProvider setting
        let provider;
        if (selectedProvider === 'jackett') {
            provider = 'Jackett';
        } else if (selectedProvider === 'nuvio') {
            provider = 'Nuvio';
        } else if (selectedProvider === 'comet') {
            provider = 'Comet';
        } else if (selectedProvider === '111477') {
            provider = '111477';
        } else if (selectedProvider === 'moviebox') {
            provider = 'MovieBox';
        } else if (selectedProvider === 'torrentless') {
            provider = 'PlayTorrio';
        } else {
            provider = 'App Sources';  // Default fallback
        }

        // For TV shows, pass the season number
        const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
        updateDiscordForStreaming(title, provider, seasonNum);

        const data = {
            streamUrl: currentStreamUrl,
            infoHash: (currentTorrentData && currentTorrentData.infoHash) ? currentTorrentData.infoHash : null,
            startSeconds: (resumeInfo && typeof resumeInfo.position === 'number' && resumeInfo.position > 10) ? Math.floor(resumeInfo.position) : undefined
        };

        const result = await window.electronAPI[apiMethod](data);
        if (result.success) {
            showNotification(`${playerName} launched - Please Wait! Watch out for a new window`, 'success', 5000);
        } else {
            // Special handling for IINA not installed
            if (isMac && result.message && result.message.includes('not installed')) {
                showNotification('IINA not installed. Please download it from https://iina.io', 'error', 7000);
            } else {
                showNotification(`Error: ${result.message}`);
            }
        }
    }

    // Open stream in VLC (same data shape as MPV)
    async function openInVLC() {
        if (!currentStreamUrl) {
            showNotification('No file selected to play');
            return;
        }
        if (!window.electronAPI || !window.electronAPI.openInVLC) {
            showNotification('VLC integration not available in this environment');
            return;
        }

        const title = currentContent?.title || currentContent?.name || 'Video';
        let provider;
        if (selectedProvider === 'jackett') provider = 'Jackett';
        else if (selectedProvider === 'nuvio') provider = 'Nuvio';
        else if (selectedProvider === 'comet') provider = 'Comet';
        else if (selectedProvider === '111477') provider = '111477';
        else if (selectedProvider === 'moviebox') provider = 'MovieBox';
        else if (selectedProvider === 'torrentless') provider = 'PlayTorrio';
        else provider = 'App Sources';

        const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
        updateDiscordForStreaming(title, provider, seasonNum);

        const data = {
            streamUrl: currentStreamUrl,
            infoHash: (currentTorrentData && currentTorrentData.infoHash) ? currentTorrentData.infoHash : null,
            startSeconds: (resumeInfo && typeof resumeInfo.position === 'number' && resumeInfo.position > 10) ? Math.floor(resumeInfo.position) : undefined
        };
        const result = await window.electronAPI.openInVLC(data);
        if (result.success) {
            showNotification('VLC launched - Please Wait! Watch out for a new window', 'success', 5000);
        } else {
            showNotification(`Error: ${result.message}`);
        }
    }

    // Copy stream URL to clipboard
    function copyStreamUrl() {
        if (!currentStreamUrl) {
            showNotification('No file selected to play');
            return;
        }
        navigator.clipboard.writeText(currentStreamUrl).then(() => {
            showNotification('Stream URL copied to clipboard');
        });
    }

    // Download subtitles
    function downloadSubtitles() {
        if (!currentSubtitleUrl) {
            showNotification('No subtitle selected');
            return;
        }
        window.open(currentSubtitleUrl);
    }

    // Copy magnet link to clipboard
    function copyMagnet(magnet) {
        navigator.clipboard.writeText(magnet).then(() => {
            showNotification('Magnet link copied to clipboard');
        });
    }

    // Show notification with optional duration and type
    function showNotification(message, type = 'info', duration = 5000) {
        // Clear any existing notification classes
        notification.className = 'notification';

        // Add the type class for styling
        if (type) {
            notification.classList.add(type);
        }

        // Set the message (text content to avoid HTML injection)
        notification.textContent = message;
        notification.classList.add('show');

        // Clear any existing timeout
        if (window.notificationTimeout) {
            clearTimeout(window.notificationTimeout);
        }

        // Auto-hide notification after duration
        window.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
        }, duration);

        // Log notification for debugging
        console.log(`[NOTIFICATION] ${type.toUpperCase()}: ${message}`);
    }

    // Persistent update notification that stays until user restarts
    let persistentUpdateNotification = null;
    let persistentDownloadNotification = null;

    function showPersistentUpdateNotification() {
        // Remove any existing persistent notification
        hideUpdateNotification();

        // Create persistent notification element
        persistentUpdateNotification = document.createElement('div');
        persistentUpdateNotification.id = 'persistentUpdateNotification';
        persistentUpdateNotification.innerHTML = `
                <div style="
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                    color: white;
                    padding: 16px 20px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(34, 197, 94, 0.3);
                    z-index: 10000;
                    font-weight: 600;
                    font-size: 14px;
                    max-width: 320px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    animation: slideInRight 0.4s ease-out;
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-rocket" style="font-size: 18px; color: #dcfce7;"></i>
                        <div>
                            <div style="font-size: 15px; margin-bottom: 4px;">🎉 Update Ready!</div>
                            <div style="font-size: 13px; opacity: 0.9;">Restart the app to complete the update</div>
                        </div>
                        <button onclick="restartForUpdate()" style="
                            background: rgba(255, 255, 255, 0.2);
                            border: 1px solid rgba(255, 255, 255, 0.3);
                            color: white;
                            padding: 8px 12px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 600;
                            transition: all 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
                        " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                            Restart
                        </button>
                    </div>
                </div>
            `;

        document.body.appendChild(persistentUpdateNotification);

        // Also show a regular notification
        showNotification('🎉 Update ready! Restart to complete installation.', 'success', 6000);
    }

    function hideUpdateNotification() {
        if (persistentUpdateNotification) {
            persistentUpdateNotification.remove();
            persistentUpdateNotification = null;
        }
        if (persistentDownloadNotification) {
            persistentDownloadNotification.remove();
            persistentDownloadNotification = null;
        }
    }

    function restartForUpdate() {
        hideUpdateNotification();
        // Trigger restart via the existing restart button in the overlay
        document.getElementById('updateRestartBtn')?.click();
    }

    // Persistent downloading notification (sticks during download)
    function showPersistentDownloadNotification(percent = 0) {
        // Remove old download notification if any
        if (persistentDownloadNotification) {
            try { persistentDownloadNotification.remove(); } catch (_) { }
            persistentDownloadNotification = null;
        }
        persistentDownloadNotification = document.createElement('div');
        persistentDownloadNotification.id = 'persistentDownloadNotification';
        persistentDownloadNotification.innerHTML = `
                <div style="
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
                    color: white;
                    padding: 16px 20px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(124, 58, 237, 0.35);
                    z-index: 10000;
                    font-weight: 600;
                    font-size: 14px;
                    max-width: 340px;
                    min-width: 280px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    animation: slideInRight 0.4s ease-out;
                ">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <i class="fas fa-download" style="font-size:18px; color:#ede9fe;"></i>
                        <div style="flex:1;">
                            <div style="font-size:15px; margin-bottom:6px;">Downloading update...</div>
                            <div id="dlNotifText" style="font-size:13px; opacity:0.95;">${percent}% complete</div>
                            <div style="margin-top:10px; height:6px; background:rgba(255,255,255,0.2); border-radius:6px; overflow:hidden;">
                                <div id="dlNotifBar" style="height:100%; width:${percent}%; background:#c4b5fd; transition: width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        document.body.appendChild(persistentDownloadNotification);
    }

    function updatePersistentDownloadNotification(percent = 0) {
        if (!persistentDownloadNotification) return;
        const text = persistentDownloadNotification.querySelector('#dlNotifText');
        const bar = persistentDownloadNotification.querySelector('#dlNotifBar');
        if (text) text.textContent = `${percent}% complete`;
        if (bar) bar.style.width = `${percent}%`;
    }

    // --- Custom Player Logic ---

    function openCustomPlayer() {
        if (!currentStreamUrl) {
            showNotification('No file selected to play');
            return;
        }

        // Update Discord presence for streaming
        const tmdbTitle = currentContent?.title || currentContent?.name || 'Unknown';

        // Determine provider based on selectedProvider setting
        let provider;
        if (selectedProvider === 'jackett') {
            provider = 'Jackett';
        } else if (selectedProvider === 'nuvio') {
            provider = 'Nuvio';
        } else if (selectedProvider === 'comet') {
            provider = 'Comet';
        } else if (selectedProvider === '111477') {
            provider = '111477';
        } else if (selectedProvider === 'torrentless') {
            provider = 'PlayTorrio';
        } else {
            provider = 'App Sources';
        }

        // For TV shows, pass the season number
        const seasonNum = (currentMediaType === 'tv' && currentSeason) ? currentSeason : null;
        updateDiscordForStreaming(tmdbTitle, provider, seasonNum);

        customPlayerContainer.classList.add('active');
        customPlayerContainer.style.display = 'flex'; // Ensure it's visible

        // Check if this is an HLS stream (.m3u8) and use HLS.js if needed
        if (currentStreamUrl.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
            // Destroy existing HLS instance if any
            if (window.hls) {
                window.hls.destroy();
            }

            // Create new HLS instance
            window.hls = new Hls({
                enableWorker: false,
                lowLatencyMode: false,
                backBufferLength: 90
            });

            window.hls.loadSource(currentStreamUrl);
            window.hls.attachMedia(customVideo);

            window.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('[HLS] Manifest parsed, ready to play');
            });

            window.hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('[HLS] Error:', data);
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        console.log('[HLS] Network error, trying to recover...');
                        window.hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        console.log('[HLS] Media error, trying to recover...');
                        window.hls.recoverMediaError();
                    }
                }
            });
        } else {
            // Ensure any previous HLS instance is destroyed
            if (window.hls) {
                window.hls.destroy();
                window.hls = null;
            }

            if (customVideo.canPlayType('application/vnd.apple.mpegurl') && currentStreamUrl.includes('.m3u8')) {
                // Native HLS support (Safari)
                const savedTracks = preserveSubtitleTracks();
                videoSource.setAttribute('src', currentStreamUrl);
                customVideo.load();
                customVideo.addEventListener('loadedmetadata', () => restoreSubtitleTracks(savedTracks), { once: true });
            } else {
                // Regular video file
                const savedTracks = preserveSubtitleTracks();
                videoSource.setAttribute('src', currentStreamUrl);
                customVideo.load();
                customVideo.addEventListener('loadedmetadata', () => restoreSubtitleTracks(savedTracks), { once: true });
            }
        }

        customPlayerTitle.textContent = playerTitle.textContent;
        // If resume is available, seek after metadata loaded
        if (resumeInfo && typeof resumeInfo.position === 'number' && resumeInfo.position > 10) {
            const to = Math.floor(resumeInfo.position);
            customVideo.addEventListener('loadedmetadata', () => { try { customVideo.currentTime = Math.min(to, (customVideo.duration || to + 1) - 1); } catch (_) { } }, { once: true });
            showNotification(`Resuming from ${formatTime(to)}`);
        }
        // Always start recording progress as soon as playback produces timeupdates
        try {
            const onFirst = () => { try { saveResumeThrottled(true); } catch (_) { } customVideo.removeEventListener('timeupdate', onFirst); };
            customVideo.addEventListener('timeupdate', onFirst);
        } catch (_) { }
        // If we prefetched a RD subtitle, attach it now
        if (currentSubtitleUrl) {
            try { loadSubtitle(currentSubtitleUrl, { label: 'Auto', lang: 'en' }); } catch (_) { }
        }

        // Reset subtitles
        if (subtitleTrack) {
            subtitleTrack.mode = 'hidden';
        }
        subtitleDisplay.style.display = 'none';
        htmlSubsPanel.style.display = 'none';
        try {
            customVideo.muted = false;
            const vol = Number(htmlVolume?.value || 80);
            customVideo.volume = Math.max(0, Math.min(1, vol / 100));
            htmlMuteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        } catch (_) { }

        // Show controls initially
        videoContainer.classList.add('show-controls');
        customPlayerContainer.classList.add('show-controls');
        resetControlsAutoHide();

        // If streaming via RD proxy, add a one-time retry to re-unrestrict on error
        try {
            const u = new URL(videoSource.getAttribute('src'), window.location.origin);
            if (u.pathname.startsWith('/stream/debrid')) {
                const origDirect = u.searchParams.get('url');
                let retried = false;
                customVideo.addEventListener('error', async () => {
                    if (retried) return;
                    retried = true;
                    try {
                        const base = new URL(origDirect);
                        const baseLink = `${base.origin}${base.pathname}`;
                        const rr = await fetch(`${API_BASE_URL}/debrid/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: baseLink }) });
                        if (rr.ok) {
                            const rj = await rr.json();
                            if (rj?.url) {
                                const proxied = `${API_BASE_URL}/stream/debrid?url=${encodeURIComponent(rj.url)}`;
                                const savedTracks = preserveSubtitleTracks();
                                videoSource.setAttribute('src', proxied);
                                customVideo.load();
                                customVideo.addEventListener('loadedmetadata', () => restoreSubtitleTracks(savedTracks), { once: true });
                                await customVideo.play();
                            }
                        }
                    } catch (_) { }
                }, { once: false });
            }
        } catch (_) { }
    }

    // Auto-hide controls when idle in custom player
    let controlsHideTimer = null;
    const CONTROLS_HIDE_DELAY = 1500; // ms
    const videoContainer = document.getElementById('videoContainer');

    function showControls() {
        videoContainer.classList.add('show-controls');
        customPlayerContainer.classList.add('show-controls');
    }

    function hideControls() {
        // Do not hide if subtitles panel is open
        if (htmlSubsPanel && htmlSubsPanel.style.display === 'block') return;
        videoContainer.classList.remove('show-controls');
        customPlayerContainer.classList.remove('show-controls');
    }

    function clearControlsTimer() { if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; } }

    function resetControlsAutoHide() {
        clearControlsTimer();
        showControls();
        controlsHideTimer = setTimeout(hideControls, CONTROLS_HIDE_DELAY);
    }

    // Reveal/hide on mouse activity inside video container
    videoContainer.addEventListener('mousemove', resetControlsAutoHide);
    videoContainer.addEventListener('mouseenter', resetControlsAutoHide);
    videoContainer.addEventListener('mouseleave', hideControls);
    // Keep visible while interacting with the controls bar
    videoControls.addEventListener('mouseenter', () => { clearControlsTimer(); showControls(); });
    videoControls.addEventListener('mousemove', () => { clearControlsTimer(); showControls(); });
    videoControls.addEventListener('mouseleave', resetControlsAutoHide);

    // Prevent header from flickering when mouse is over it
    const customPlayerHeader = customPlayerContainer.querySelector('.player-header');
    if (customPlayerHeader) {
        customPlayerHeader.addEventListener('mouseenter', () => {
            clearControlsTimer();
            showControls();
        });
        customPlayerHeader.addEventListener('mousemove', () => {
            clearControlsTimer();
            showControls();
        });
        customPlayerHeader.addEventListener('mouseleave', resetControlsAutoHide);
    }

    // When opening and closing the subtitles panel, force controls visibility appropriately
    if (htmlSubsBtn) {
        htmlSubsBtn.addEventListener('click', () => {
            // After toggling, ensure state is correct
            setTimeout(() => {
                if (htmlSubsPanel.style.display === 'block') {
                    clearControlsTimer();
                    showControls();
                } else {
                    resetControlsAutoHide();
                }
            }, 0);
        });
    }
    if (htmlSubsClose) {
        htmlSubsClose.addEventListener('click', () => {
            resetControlsAutoHide();
        });
    }

    // ---- WCJS Player Logic ----
    let wcjsPlayer = null;
    let wcjsTimer = null;
    function openWCJSPlayer() {
        if (!currentStreamUrl) {
            showNotification('No file selected to play');
            return;
        }
        try {
            const wc = window.electronAPI?.wcjs;
            if (!wc || !wc.available) {
                openCustomPlayer();
                return;
            }
            // Show container
            wcjsPlayerContainer.style.opacity = '1';
            wcjsPlayerContainer.style.pointerEvents = 'all';
            wcjsLoading.style.display = 'flex';
            wcjsPlayerTitle.textContent = playerTitle.textContent || 'WebChimera Player';

            // Init player and bind to canvas
            const ctx = wc.init('#wcjsCanvas', ["--no-video-title-show"]);
            if (!ctx || !ctx.player) {
                showNotification('WebChimera failed to initialize, falling back to built-in player.');
                closeWCJSPlayer();
                openCustomPlayer();
                return;
            }
            wcjsPlayer = ctx.player;
            // Start playback
            wcjsPlayer.play(currentStreamUrl);
            // Load pre-downloaded subtitle if available (from RD auto fetch)
            try {
                if (currentSubtitleUrl && wcjsPlayer && wcjsPlayer.subtitles && wcjsPlayer.subtitles.load) {
                    wcjsPlayer.subtitles.load(currentSubtitleUrl);
                }
            } catch (_) { }

            // Setup events and UI updates
            wcjsAttachEvents();
        } catch (e) {
            console.error('WCJS init error:', e);
            showNotification('WebChimera init error, using built-in player.');
            closeWCJSPlayer();
            openCustomPlayer();
        }
    }

    function wcjsAttachEvents() {
        if (!wcjsPlayer) return;
        // Length/time change handlers if available
        try { wcjsPlayer.onLengthChanged = (len) => { wcjsTotalTime.textContent = formatTime((len || 0) / 1000); }; } catch (_) { }
        try { wcjsPlayer.onPlaying = () => { wcjsLoading.style.display = 'none'; wcjsPlayPauseBtn.innerHTML = '<i class="fas fa-pause"></i>'; }; } catch (_) { }
        try { wcjsPlayer.onPaused = () => { wcjsPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>'; }; } catch (_) { }
        try { wcjsPlayer.onEndReached = () => { wcjsPlayPauseBtn.innerHTML = '<i class="fas fa-play"></i>'; }; } catch (_) { }

        // Poll time/length as a reliable way across versions
        clearInterval(wcjsTimer);
        wcjsTimer = setInterval(() => {
            if (!wcjsPlayer) return;
            let len = 0, t = 0;
            try { len = Number(wcjsPlayer.length || wcjsPlayer.input?.length || 0); } catch (_) { }
            try { t = Number(wcjsPlayer.time || wcjsPlayer.input?.time || 0); } catch (_) { }
            if (len > 0) wcjsTotalTime.textContent = formatTime(len / 1000);
            wcjsCurrentTime.textContent = formatTime(t / 1000);
            if (len > 0) {
                const pct = Math.max(0, Math.min(100, (t / len) * 100));
                wcjsProgressFilled.style.width = pct + '%';
            }
        }, 200);
        // Refresh audio list on play
        setTimeout(renderAudioTracks, 400);
    }

    async function closeWCJSPlayer() {
        wcjsPlayerContainer.style.opacity = '0';
        wcjsPlayerContainer.style.pointerEvents = 'none';
        wcjsLoading.style.display = 'none';
        clearInterval(wcjsTimer);
        wcjsTimer = null;

        // Exit video fullscreen if active
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            } catch (_) { }
        }

        // Also exit app fullscreen if the window is in fullscreen to prevent black screen
        if (window.electronAPI && window.electronAPI.getFullscreen) {
            try {
                const result = await window.electronAPI.getFullscreen();
                if (result.success && result.isFullscreen) {
                    // Temporarily exit app fullscreen to prevent black screen
                    await window.electronAPI.setFullscreen(false);
                    // Show notification that user can re-enable fullscreen via settings
                    setTimeout(() => {
                        showNotification('Exited fullscreen mode. Re-enable in Settings if needed.', 'info', 4000);
                    }, 500);
                }
            } catch (error) {
                console.error('Error handling fullscreen exit:', error);
            }
        }

        if (wcjsPlayer) {
            try { wcjsPlayer.stop(); } catch (_) { }
            try { wcjsPlayer.close && wcjsPlayer.close(); } catch (_) { }
        }
        wcjsPlayer = null;
        // Stop torrent stream on server and clean temp (same as MPV close)
        if (currentTorrentData) {
            try { await fetch(`${API_BASE_URL}/stop-stream?hash=${currentTorrentData.infoHash}`); } catch (e) { }
            if (window.electronAPI) {
                try { await window.electronAPI.clearWebtorrentTemp(); } catch (e) { }
            }
        }
        // Cleanup downloaded temporary subtitles
        try { await fetch(`${API_BASE_URL}/subtitles/cleanup`, { method: 'POST' }); } catch (e) { }
    }

    function wcjsTogglePlayPause() {
        if (!wcjsPlayer) return;
        try { wcjsPlayer.togglePause(); } catch (_) { }
    }

    function wcjsSkipTime(seconds) {
        if (!wcjsPlayer) return;
        try {
            const cur = Number(wcjsPlayer.time || 0);
            wcjsPlayer.time = Math.max(0, cur + seconds * 1000);
        } catch (_) { }
    }

    function wcjsToggleFullscreen() {
        if (!document.fullscreenElement) {
            wcjsPlayerContainer.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }

    function wcjsSeek(e) {
        if (!wcjsPlayer) return;
        const rect = wcjsProgressBar.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = offsetX / rect.width;
        try {
            const len = Number(wcjsPlayer.length || 0);
            if (len > 0) wcjsPlayer.time = Math.floor(len * pct);
        } catch (_) { }
    }

    function wcjsToggleMute() {
        if (!wcjsPlayer) return;
        try {
            if (typeof wcjsPlayer.toggleMute === 'function') wcjsPlayer.toggleMute();
            else wcjsPlayer.mute = !wcjsPlayer.mute;
            // Update icon
            const muted = !!wcjsPlayer.mute;
            wcjsMuteBtn.innerHTML = muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        } catch (_) { }
    }

    function wcjsSetVolume() {
        if (!wcjsPlayer) return;
        // wcjs volume is 0..200
        const v = Number(wcjsVolume.value || 0);
        try { wcjsPlayer.volume = Math.round(v * 2); } catch (_) { }
    }

    async function wcjsHandleSubtitleUpload(event) {
        const file = event.target.files[0];
        if (!file || !wcjsPlayer) return;
        try {
            const text = await file.text();
            const formData = new FormData();
            formData.append('subtitle', new Blob([text]), file.name);
            const response = await fetch(`${API_BASE_URL}/upload-subtitle`, { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok || !data?.url) {
                showNotification(data?.error || 'Subtitle upload failed');
                return;
            }
            try { wcjsPlayer.subtitles && wcjsPlayer.subtitles.load && wcjsPlayer.subtitles.load(data.url); } catch (_) { }
            showNotification('Subtitles loaded');
        } catch (e) {
            showNotification('Failed to load subtitles');
        } finally {
            try { event.target.value = ''; } catch { }
        }
    }

    // Fetch and display subtitles from backend
    async function fetchAndRenderSubtitles() {
        wcjsSubsList.innerHTML = '<div class="subs-help"><i class="fas fa-spinner" style="animation: spin 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></i> Loading...</div>';
        try {
            // Always prefer the selected show's TMDB id and media type
            let tmdbId = currentContent?.id;
            let type = currentMediaType === 'tv' ? 'tv' : 'movie';
            // For movies, if tmdbId is missing, derive it from the selected torrent filename
            if (type === 'movie' && (!tmdbId || tmdbId === '')) {
                if (currentSelectedVideoName) {
                    try {
                        const derived = await getTmdbFromFilename(currentSelectedVideoName);
                        if (derived?.id) tmdbId = derived.id;
                    } catch (_) { }
                }
            }
            const params = new URLSearchParams({ type });
            if (tmdbId) params.set('tmdbId', String(tmdbId));
            if (currentSelectedVideoName) {
                params.set('filename', currentSelectedVideoName);
                // Provide show title/year for better matching
                const showTitle = currentContent?.title || currentContent?.name || '';
                const showYear = (currentContent?.release_date || currentContent?.first_air_date || '').slice(0, 4);
                if (showTitle) params.set('title', showTitle);
                if (showYear) params.set('year', showYear);
            } else if (type === 'tv' && currentSeason) {
                params.set('season', String(currentSeason));
            }
            // Try to detect selected episode from episodesGrid selection
            const sel = document.querySelector('.episode-card.selected');
            if (!currentSelectedVideoName && type === 'tv' && sel) {
                const titleEl = sel.querySelector('.episode-title');
                const m = titleEl?.textContent?.match(/E(\d+)/i);
                if (m) params.set('episode', String(parseInt(m[1], 10)));
            }
            const res = await fetch(`${API_BASE_URL}/subtitles?${params.toString()}`);
            const data = await res.json();
            const items = Array.isArray(data.subtitles) ? data.subtitles : [];
            // Group by language and index duplicates
            const grouped = {};
            for (const it of items) {
                const key = `${(it.langName || it.lang || 'Unknown').toLowerCase()}|${it.source}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(it);
            }
            wcjsSubsList.innerHTML = '';
            const entries = Object.entries(grouped);
            if (!entries.length) wcjsSubsList.innerHTML = '<div class="subs-help">No subtitles found.</div>';
            for (const [key, arr] of entries) {
                const [langNameLower, source] = key.split('|');
                const langDisplay = langNameLower.charAt(0).toUpperCase() + langNameLower.slice(1);
                arr.forEach((sub, idx) => {
                    const displayName = arr.length > 1 ? `${langDisplay} ${idx + 1}` : langDisplay;
                    const row = document.createElement('div');
                    row.className = 'subs-item';
                    row.innerHTML = `<div>${displayName} <span class="subs-source">(${source})</span></div><div class="subs-badge">Select</div>`;
                    row.addEventListener('click', async () => {
                        try {
                            // Download via backend to temp, then load into WCJS
                            const payload = sub.source === 'opensubtitles'
                                ? { source: 'opensubtitles', fileId: sub.file_id, preferredName: sub.name }
                                : { source: 'wyzie', url: sub.url, preferredName: sub.name };
                            const dl = await fetch(`${API_BASE_URL}/subtitles/download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                            const dlJson = await dl.json();
                            if (dl.ok && dlJson.url) {
                                try { wcjsPlayer.subtitles && wcjsPlayer.subtitles.load && wcjsPlayer.subtitles.load(dlJson.url); } catch (_) { }
                                showNotification(`Loaded: ${displayName}`);
                                wcjsSubsPanel.style.display = 'none';
                            } else {
                                if (dl.status === 429 || dlJson?.code === 'OS_QUOTA') {
                                    showNotification('OpenSubtitles is rate-limited. Trying Wyzie automatically...');
                                    // Try fallback to Wyzie: prefer same language, else any Wyzie
                                    const sameLangWyzie = currentSubtitles.find(s => s.source === 'wyzie' && s.lang && s.lang === (sub.lang || '').toLowerCase());
                                    const anyWyzie = currentSubtitles.find(s => s.source === 'wyzie');
                                    const wyziePick = sameLangWyzie || anyWyzie;
                                    if (wyziePick) {
                                        try {
                                            const wyPayload = { source: 'wyzie', url: wyziePick.url, preferredName: wyziePick.name || wyziePick.langName };
                                            const wyDl = await fetch(`${API_BASE_URL}/subtitles/download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wyPayload) });
                                            const wyJson = await wyDl.json();
                                            if (wyDl.ok && wyJson.url) {
                                                try { wcjsPlayer.subtitles && wcjsPlayer.subtitles.load && wcjsPlayer.subtitles.load(wyJson.url); } catch (_) { }
                                                showNotification(`Loaded from Wyzie: ${wyziePick.name || wyziePick.langName}`);
                                                wcjsSubsPanel.style.display = 'none';
                                            } else {
                                                showNotification(wyJson.error || 'Wyzie fallback failed. Please pick a different subtitle.');
                                            }
                                        } catch (e) {
                                            showNotification('Wyzie fallback failed. Please pick a different subtitle.');
                                        }
                                    } else {
                                        showNotification('No Wyzie subtitles available. Please try another source later.');
                                    }
                                } else {
                                    showNotification(dlJson.error || 'Subtitle download failed');
                                }
                            }
                        } catch (e) {
                            showNotification('Subtitle download error');
                        }
                    });
                    wcjsSubsList.appendChild(row);
                });
            }
        } catch {
            wcjsSubsList.innerHTML = '<div class="subs-help">Failed to load subtitles.</div>';
        }
    }

    // Render audio tracks and allow switching
    function renderAudioTracks() {
        wcjsAudioList.innerHTML = '';
        if (!wcjsPlayer || !wcjsPlayer.audio) {
            wcjsAudioList.innerHTML = '<div class="subs-help">Audio track info not available.</div>';
            return;
        }
        try {
            const count = Number(wcjsPlayer.audio.count || 0);
            if (!count) {
                wcjsAudioList.innerHTML = '<div class="subs-help">No alternate audio tracks.</div>';
                return;
            }
            for (let i = 1; i <= count; i++) {
                const name = wcjsPlayer.audio[i] || `Track ${i}`;
                const row = document.createElement('div');
                row.className = 'subs-item';
                row.innerHTML = `<div>${name}</div><div class="subs-badge">Select</div>`;
                row.addEventListener('click', () => {
                    try { wcjsPlayer.audio.track = i; showNotification(`Audio: ${name}`); wcjsAudioPanel.style.display = 'none'; } catch (_) { }
                });
                wcjsAudioList.appendChild(row);
            }
        } catch {
            wcjsAudioList.innerHTML = '<div class="subs-help">Audio list unavailable.</div>';
        }
    }

    async function closeCustomPlayer_() {
        // Stop Trakt scrobbling when player closes
        if (customVideo.duration && traktCurrentScrobble) {
            const progress = customVideo.currentTime / customVideo.duration * 100;
            scrobbleStop(Math.floor(progress));
        }

        // Clear Discord presence when custom player closes
        if (discordStreamingActive) {
            clearDiscordPresence();
        }

        customPlayerContainer.classList.remove('active');
        customPlayerContainer.style.display = 'none'; // Fully hide to prevent invisible overlay
        try { customVideo.pause(); } catch (_) { }

        // Exit video fullscreen if active
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            } catch (_) { }
        }

        // Also exit app fullscreen if the window is in fullscreen to prevent black screen
        if (window.electronAPI && window.electronAPI.getFullscreen) {
            try {
                const result = await window.electronAPI.getFullscreen();
                if (result.success && result.isFullscreen) {
                    // Temporarily exit app fullscreen to prevent black screen
                    await window.electronAPI.setFullscreen(false);
                    // Show notification that user can re-enable fullscreen via settings
                    setTimeout(() => {
                        showNotification('Exited fullscreen mode. Re-enable in Settings if needed.', 'info', 4000);
                    }, 500);
                }
            } catch (error) {
                console.error('Error handling fullscreen exit:', error);
            }
        }

        // Cleanup HLS instance if any
        if (window.hls) {
            window.hls.destroy();
            window.hls = null;
        }

        // Fully reset video source to clear any residual tracks/cues
        try {
            customVideo.removeAttribute('src');
            if (videoSource) videoSource.setAttribute('src', '');
            customVideo.load();
        } catch (_) { }

        // Cleanup temp subtitle file for HTML5 if any
        if (currentSubtitleFile) {
            try { await fetch(`${API_BASE_URL}/subtitles/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: currentSubtitleFile }) }); } catch { }
            currentSubtitleFile = null;
        }
    }

    function togglePlayPause() {
        if (customVideo.paused) {
            customVideo.play();
        } else {
            customVideo.pause();
        }
    }

    function skipTime(amount) {
        customVideo.currentTime += amount;
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            customPlayerContainer.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    async function castToChromecast() {
        // Use the same backend casting as MPV button
        if (!currentStreamUrl) {
            showNotification('No stream available to cast', 'error');
            return;
        }

        // Show device picker modal (same as MPV casting)
        await showChromecastDevicePicker();
    }

    // Deprecated: Old Web SDK method (kept for reference but not used in Electron)
    function loadMediaToCast() {
        const castSession = window.cast.framework.CastContext.getInstance().getCurrentSession();
        if (!castSession) {
            showNotification('No active Chromecast session', 'error');
            return;
        }

        // Prepare media info
        const mediaInfo = new window.chrome.cast.media.MediaInfo(currentStreamUrl, 'video/mp4');

        // Set metadata
        const metadata = new window.chrome.cast.media.GenericMediaMetadata();
        if (currentContent) {
            metadata.title = currentContent.title || currentContent.name || 'Unknown';
            if (currentContent.poster_path) {
                metadata.images = [new window.chrome.cast.Image(`https://image.tmdb.org/t/p/w342${currentContent.poster_path}`)];
            }
        }
        mediaInfo.metadata = metadata;

        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);

        // Set current playback position if playing from custom player
        if (customVideo && !customVideo.paused) {
            request.currentTime = customVideo.currentTime;
            // Pause local player
            customVideo.pause();
        }

        castSession.loadMedia(request).then(
            () => {
                showNotification('Casting to ' + castSession.getCastDevice().friendlyName, 'success');
            },
            (error) => {
                console.error('Load media error:', error);
                showNotification('Failed to cast media: ' + error.message, 'error');
            }
        );
    }

    async function castMPVToChromecast() {
        if (!currentStreamUrl) {
            showNotification('No stream available to cast', 'error');
            return;
        }

        // Show device picker modal
        await showChromecastDevicePicker();
    }

    async function showChromecastDevicePicker() {
        const modal = document.getElementById('chromecast-device-modal');
        const deviceList = document.getElementById('chromecast-device-list');

        if (!modal || !deviceList) {
            console.error('[Chromecast] Modal elements not found');
            showNotification('Device picker not available', 'error');
            return;
        }

        // Show modal with loading state
        modal.style.display = 'flex';
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'all';

        deviceList.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Discovering Chromecast devices...</p>
                </div>
            `;

        try {
            // Discover devices
            const result = await window.electronAPI.discoverChromecastDevices();

            if (!result.success || result.devices.length === 0) {
                deviceList.innerHTML = `
                        <div class="chromecast-no-devices">
                            <i class="fas fa-broadcast-tower"></i>
                            <h4>No Chromecast Devices Found</h4>
                            <p>Make sure your Chromecast is on the same network</p>
                            <button class="chromecast-refresh-btn" onclick="showChromecastDevicePicker()">
                                <i class="fas fa-sync"></i> Refresh
                            </button>
                        </div>
                    `;
                return;
            }

            // Display devices
            deviceList.innerHTML = '';
            result.devices.forEach(device => {
                const deviceItem = document.createElement('div');
                deviceItem.className = 'chromecast-device-item';
                deviceItem.innerHTML = `
                        <div class="chromecast-device-icon">
                            <i class="fas fa-tv"></i>
                        </div>
                        <div class="chromecast-device-info">
                            <div class="chromecast-device-name">${escapeHtml(device.name)}</div>
                            <div class="chromecast-device-host">${escapeHtml(device.host)}</div>
                        </div>
                    `;

                deviceItem.addEventListener('click', () => {
                    castToDevice(device);
                });

                deviceList.appendChild(deviceItem);
            });

        } catch (error) {
            console.error('Device discovery error:', error);
            deviceList.innerHTML = `
                    <div class="chromecast-no-devices">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h4>Discovery Failed</h4>
                        <p>${escapeHtml(error.message || 'Failed to discover devices')}</p>
                        <button class="chromecast-refresh-btn" onclick="showChromecastDevicePicker()">
                            <i class="fas fa-sync"></i> Try Again
                        </button>
                    </div>
                `;
        }
    }

    async function castToDevice(device) {
        const modal = document.getElementById('chromecast-device-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
        }

        try {
            // Just send the URL as-is - main.js will handle proxying through network IP
            let toCast = currentStreamUrl;
            if (!toCast) {
                showNotification('No stream available to cast', 'error');
                return;
            }

            // Prepare metadata for Chromecast
            const metadata = {
                title: 'PlayTorrio Stream',
                // Guess content type from original URL
                contentType: (toCast.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
                images: []
            };

            // Use currentContent if available
            if (currentContent) {
                metadata.title = currentContent.title || currentContent.name || 'PlayTorrio Stream';

                if (currentContent.poster_path) {
                    metadata.images = [{
                        url: `https://image.tmdb.org/t/p/w342${currentContent.poster_path}`
                    }];
                }
            }

            console.log('[Cast] Sending stream URL to main process:', toCast);

            showNotification(`Connecting to ${device.name}...`, 'info');

            const result = await window.electronAPI.castToChromecast({
                streamUrl: toCast,
                metadata: metadata,
                deviceHost: device.host
            });

            if (result.success) {
                showNotification(`Casting to ${device.name}`, 'success');
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Cast error:', error);
            showNotification('Failed to cast: ' + error.message, 'error');
        }
    }

    function updateProgress() {
        const percent = (customVideo.currentTime / customVideo.duration) * 100;
        progressFilled.style.width = `${percent}%`;
        currentTime.textContent = formatTime(customVideo.currentTime);
        saveResumeThrottled();
    }

    function updateDuration() {
        totalTime.textContent = formatTime(customVideo.duration);
        saveResumeThrottled();
    }

    function seekVideo(e) {
        const rect = progressBar.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const seekTime = (offsetX / progressBar.offsetWidth) * customVideo.duration;
        customVideo.currentTime = seekTime;
        saveResumeThrottled(true);
    }

    function formatTime(seconds) {
        if (!isFinite(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function handleSubtitleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const formData = new FormData();
            formData.append('subtitle', new Blob([text]), file.name);
            const response = await fetch(`${API_BASE_URL}/upload-subtitle`, { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok || !data?.url) {
                showNotification(data?.error || 'Subtitle upload failed');
                return;
            }
            // Delete previous temp file if any
            if (currentSubtitleFile) {
                try { await fetch(`${API_BASE_URL}/subtitles/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: currentSubtitleFile }) }); } catch { }
            }
            await loadSubtitle(data.url, { label: file.name.replace(/\.[^.]+$/, ''), lang: 'en' });
            showNotification('Subtitles loaded');
        } catch (_) {
            showNotification('Failed to load subtitles');
        } finally {
            try { event.target.value = ''; } catch { }
        }
    }

    function updateSubtitleControlDisplays() {
        if (subsSizeValue) subsSizeValue.textContent = `${subtitleSettings.size}px`;
        if (subsOpacityValue) subsOpacityValue.textContent = `${subtitleSettings.backgroundOpacity}%`;
        if (subsSizeInput) subsSizeInput.value = subtitleSettings.size;
        if (subsColorInput) subsColorInput.value = subtitleSettings.color;
        if (subsBackgroundInput) subsBackgroundInput.value = subtitleSettings.background;
        if (subsBackgroundOpacityInput) subsBackgroundOpacityInput.value = subtitleSettings.backgroundOpacity;
        if (subsFontSelect) subsFontSelect.value = subtitleSettings.font;
    }

    function applySubtitleSettings() {
        // Apply styles to Video.js subtitle display
        let styleEl = document.getElementById('subtitle-cue-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'subtitle-cue-style';
            document.head.appendChild(styleEl);
        }

        // Convert hex color to rgba for background
        const hexToRgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const bgColor = hexToRgba(subtitleSettings.background, subtitleSettings.backgroundOpacity / 100);

        // Apply to Video.js text track display and native cues with fixed position
        styleEl.textContent = `
                .video-js .vjs-text-track-display {
                    bottom: 3em !important;
                    pointer-events: none !important;
                }
                
                .video-js .vjs-text-track-cue > div {
                    font-size: ${subtitleSettings.size}px !important;
                    color: ${subtitleSettings.color} !important;
                    background-color: ${bgColor} !important;
                    font-family: ${subtitleSettings.font} !important;
                    padding: 0.2em 0.5em !important;
                    border-radius: 4px !important;
                    pointer-events: auto !important;
                }
                
                video::cue {
                    font-size: ${subtitleSettings.size}px !important;
                    color: ${subtitleSettings.color} !important;
                    background-color: ${bgColor} !important;
                    font-family: ${subtitleSettings.font} !important;
                }
            `;
    }

    // Helper to preserve subtitle tracks across video loads
    function preserveSubtitleTracks() {
        const tracks = Array.from(customVideo.querySelectorAll('track[kind="subtitles"]'));
        return tracks.map(t => ({
            src: t.src,
            label: t.label,
            srclang: t.srclang,
            isDefault: t.default,
            mode: t.track ? t.track.mode : 'hidden'
        }));
    }

    function restoreSubtitleTracks(trackData) {
        if (!trackData || trackData.length === 0) return;

        trackData.forEach((data, index) => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = data.label;
            track.srclang = data.srclang;
            track.src = data.src;
            if (data.isDefault) {
                track.default = true;
                track.setAttribute('default', '');
            }
            customVideo.appendChild(track);

            // Restore the mode when track loads
            track.addEventListener('load', () => {
                try {
                    if (track.track) {
                        track.track.mode = data.mode;
                        if (data.mode === 'showing') {
                            applySubtitleSettings();
                            subtitleTrack = track;
                        }
                    }
                } catch { }
            }, { once: true });
        });
    }

    async function loadSubtitle(url, opts = {}) {
        // Check if this subtitle URL is already loaded
        const existingTracks = Array.from(customVideo.querySelectorAll('track[kind="subtitles"]'));
        const alreadyLoaded = existingTracks.find(t => t.src === url);

        if (alreadyLoaded) {
            // Just switch to the existing track
            for (const t of customVideo.textTracks) { t.mode = 'hidden'; }
            if (alreadyLoaded.track) {
                alreadyLoaded.track.mode = 'showing';
                applySubtitleSettings();
            }
            subtitleTrack = alreadyLoaded;
            return;
        }

        // Only remove tracks if we're loading a completely new subtitle
        // Keep the current track to avoid it disappearing
        if (subtitleTrack && subtitleTrack.src !== url) {
            // Don't remove the current track yet, just hide it
            if (subtitleTrack.track) {
                subtitleTrack.track.mode = 'hidden';
            }
        }

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = opts.label || 'Subtitles';
        track.srclang = (opts.lang || 'en');
        track.src = url;
        track.default = true;
        track.setAttribute('default', '');
        customVideo.appendChild(track);
        // Wait for track to load then enable showing
        track.addEventListener('load', () => {
            try {
                // Hide all other tracks then show current
                for (const t of customVideo.textTracks) { t.mode = 'hidden'; }
                if (track.track) track.track.mode = 'showing';
                applySubtitleSettings();
            } catch { }
        });
        subtitleTrack = track;
        // Track the served filename so we can delete it when switching
        try {
            const u = new URL(url, window.location.origin);
            const parts = u.pathname.split('/');
            const fname = parts[parts.length - 1];
            currentSubtitleFile = decodeURIComponent(fname);
        } catch { }
    }

    async function fetchAndRenderHtmlSubs() {
        htmlSubsList.innerHTML = '<div class="subs-help"><i class="fas fa-spinner" style="animation: spin 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;"></i> Loading...</div>';
        try {
            // Always use the selected show's TMDB id and type from UI
            let tmdbId = currentContent?.id;
            let type = currentMediaType === 'tv' ? 'tv' : 'movie';
            const title = currentContent?.title || currentContent?.name || '';
            const year = (currentContent?.release_date || currentContent?.first_air_date || '').slice(0, 4);
            // For movies, if tmdbId is missing, derive it from the selected torrent filename
            if (type === 'movie' && (!tmdbId || tmdbId === '')) {
                if (currentSelectedVideoName) {
                    try {
                        const derived = await getTmdbFromFilename(currentSelectedVideoName);
                        if (derived?.id) tmdbId = derived.id;
                    } catch (_) { }
                }
            }
            const params = new URLSearchParams({ type });
            if (tmdbId) params.set('tmdbId', String(tmdbId));
            if (title) params.set('title', title);
            if (year) params.set('year', year);
            if (currentSelectedVideoName) {
                params.set('filename', currentSelectedVideoName);
                // title/year already represent the selected show
            }
            if (type === 'tv' && currentSeason) params.set('season', String(currentSeason));
            const sel = document.querySelector('.episode-card.selected');
            if (!currentSelectedVideoName && type === 'tv' && sel) {
                const titleEl = sel.querySelector('.episode-title');
                const m = titleEl?.textContent?.match(/E(\d+)/i);
                if (m) params.set('episode', String(parseInt(m[1], 10)));
            }
            const res = await fetch(`${API_BASE_URL}/subtitles?${params.toString()}`);
            const data = await res.json();
            let items = Array.isArray(data.subtitles) ? data.subtitles : [];
            // Extra safety: filter client-side for supported formats only
            items = items.filter(it => {
                const ext = (it.ext || it.format || '').toString().toLowerCase();
                const u = (it.url || '').toString().toLowerCase();
                return ['srt', 'vtt'].includes(ext) || u.includes('.srt') || u.includes('.vtt') || u.includes('.srt.gz') || it.file_id; // OS entries will be converted server-side
            });
            const grouped = {};
            for (const it of items) {
                const key = `${(it.langName || it.lang || 'Unknown').toLowerCase()}|${it.source}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(it);
            }
            htmlSubsList.innerHTML = '';
            const entries = Object.entries(grouped);
            if (!entries.length) htmlSubsList.innerHTML = '<div class="subs-help">No subtitles found.</div>';
            for (const [key, arr] of entries) {
                const [langNameLower, source] = key.split('|');
                const langDisplay = langNameLower.charAt(0).toUpperCase() + langNameLower.slice(1);
                arr.forEach((sub, idx) => {
                    const displayName = arr.length > 1 ? `${langDisplay} ${idx + 1}` : langDisplay;
                    const row = document.createElement('div');
                    row.className = 'subs-item';
                    row.innerHTML = `<div>${displayName} <span class="subs-source">(${source})</span></div><div class="subs-badge">Select</div>`;
                    row.addEventListener('click', async () => {
                        try {
                            const payload = sub.source === 'opensubtitles'
                                ? { source: 'opensubtitles', fileId: sub.file_id, preferredName: sub.name }
                                : { source: 'wyzie', url: sub.url, preferredName: sub.name };
                            const dl = await fetch(`${API_BASE_URL}/subtitles/download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                            const dlJson = await dl.json();
                            if (dl.ok && dlJson.url) {
                                // Delete old subtitle temp file (if any)
                                if (currentSubtitleFile) {
                                    try {
                                        await fetch(`${API_BASE_URL}/subtitles/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: currentSubtitleFile }) });
                                    } catch { }
                                }
                                const langCode = (sub.lang || '').toLowerCase();
                                await loadSubtitle(dlJson.url, { label: displayName, lang: langCode });
                                showNotification(`Loaded: ${displayName}`);
                                htmlSubsPanel.style.display = 'none';
                            } else {
                                if (dl.status === 429 || dlJson?.code === 'OS_QUOTA') {
                                    showNotification('OpenSubtitles is rate-limited. Trying Wyzie automatically...');
                                    const sameLangWyzie = currentSubtitles.find(s => s.source === 'wyzie' && s.lang && s.lang === (sub.lang || '').toLowerCase());
                                    const anyWyzie = currentSubtitles.find(s => s.source === 'wyzie');
                                    const wyziePick = sameLangWyzie || anyWyzie;
                                    if (wyziePick) {
                                        try {
                                            // Delete old subtitle temp file (if any)
                                            if (currentSubtitleFile) {
                                                try {
                                                    await fetch(`${API_BASE_URL}/subtitles/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: currentSubtitleFile }) });
                                                } catch { }
                                            }
                                            const wyPayload = { source: 'wyzie', url: wyziePick.url, preferredName: wyziePick.name || wyziePick.langName };
                                            const wyDl = await fetch(`${API_BASE_URL}/subtitles/download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wyPayload) });
                                            const wyJson = await wyDl.json();
                                            if (wyDl.ok && wyJson.url) {
                                                const langCode = (wyziePick.lang || '').toLowerCase();
                                                await loadSubtitle(wyJson.url, { label: wyziePick.name || wyziePick.langName, lang: langCode });
                                                showNotification(`Loaded from Wyzie: ${wyziePick.name || wyziePick.langName}`);
                                                htmlSubsPanel.style.display = 'none';
                                            } else {
                                                showNotification(wyJson.error || 'Wyzie fallback failed. Please pick a different subtitle.');
                                            }
                                        } catch (e) {
                                            showNotification('Wyzie fallback failed. Please pick a different subtitle.');
                                        }
                                    } else {
                                        showNotification('No Wyzie subtitles available. Please try another source later.');
                                    }
                                } else {
                                    showNotification(dlJson.error || 'Subtitle download failed');
                                }
                            }
                        } catch (e) {
                            showNotification('Subtitle download error');
                        }
                    });
                    htmlSubsList.appendChild(row);
                });
            }
        } catch {
            htmlSubsList.innerHTML = '<div class="subs-help">Failed to load subtitles.</div>';
        }
    }

    // ---- AudioBooks functionality ----
    function initializeAudioBooks() {
        const searchInput = document.getElementById('audiobookSearchInput');
        const searchBtn = document.getElementById('searchAudioBooksBtn');
        const clearBtn = document.getElementById('clearAudioBookSearchBtn');
        const backToBooks = document.getElementById('audiobooksBackToBooks');
        const closePlayer = document.getElementById('audiobooksClosePlayer');
        const playPauseBtn = document.getElementById('audiobooksPlayPauseBtn');
        const prevBtn = document.getElementById('audiobooksPrevBtn');
        const nextBtn = document.getElementById('audiobooksNextBtn');
        const progressBar = document.getElementById('audiobooksProgressBar');
        const volumeBtn = document.getElementById('audiobooksVolumeBtn');
        const volumeSlider = document.getElementById('audiobooksVolumeSlider');
        const audioEl = document.getElementById('audiobooksAudioElement');

        if (!searchInput || !searchBtn || !clearBtn) return;

        // Search on button click
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) {
                searchAudioBooks(query);
            }
        });

        // Search on Enter key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    searchAudioBooks(query);
                }
            }
        });

        // Clear search and return to home
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            isAudioBookSearchMode = false;
            clearBtn.style.display = 'none';
            loadInitialAudioBooks();
        });

        // Back to books button
        if (backToBooks) {
            backToBooks.addEventListener('click', () => {
                document.getElementById('audiobooks-books-view').style.display = 'block';
                document.getElementById('audiobooks-chapters-view').style.display = 'none';
            });
        }

        // Close player
        if (closePlayer && audioEl) {
            closePlayer.addEventListener('click', () => {
                audioEl.pause();
                document.getElementById('audiobooksPlayer').style.display = 'none';
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            });
        }

        // Play/Pause
        if (playPauseBtn && audioEl) {
            playPauseBtn.addEventListener('click', () => {
                if (audioEl.paused) {
                    audioEl.play();
                    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                } else {
                    audioEl.pause();
                    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
            });
        }

        // Previous chapter
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentAudioBookChapterIndex > 0) {
                    playAudioBookChapter(currentAudioBookChapterIndex - 1);
                }
            });
        }

        // Next chapter
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentAudioBookChapterIndex < currentAudioBookChapters.length - 1) {
                    playAudioBookChapter(currentAudioBookChapterIndex + 1);
                }
            });
        }

        // Progress bar
        if (audioEl && progressBar) {
            audioEl.addEventListener('timeupdate', () => {
                const percent = (audioEl.currentTime / audioEl.duration) * 100;
                document.getElementById('audiobooksProgressFilled').style.width = percent + '%';
                document.getElementById('audiobooksCurrentTime').textContent = formatAudioTime(audioEl.currentTime);
            });

            audioEl.addEventListener('loadedmetadata', () => {
                document.getElementById('audiobooksDuration').textContent = formatAudioTime(audioEl.duration);
            });

            progressBar.addEventListener('click', (e) => {
                const rect = progressBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                audioEl.currentTime = percent * audioEl.duration;
            });

            // Auto-play next chapter
            audioEl.addEventListener('ended', () => {
                if (currentAudioBookChapterIndex < currentAudioBookChapters.length - 1) {
                    playAudioBookChapter(currentAudioBookChapterIndex + 1);
                } else {
                    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
            });
        }

        // Volume control
        if (volumeSlider && audioEl && volumeBtn) {
            volumeSlider.addEventListener('input', (e) => {
                audioEl.volume = e.target.value / 100;
                if (audioEl.volume === 0) {
                    volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                } else if (audioEl.volume < 0.5) {
                    volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
                } else {
                    volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                }
            });

            volumeBtn.addEventListener('click', () => {
                if (audioEl.volume > 0) {
                    audioEl.volume = 0;
                    volumeSlider.value = 0;
                    volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                } else {
                    audioEl.volume = 1;
                    volumeSlider.value = 100;
                    volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                }
            });
        }

        // Load More button
        const loadMoreBtn = document.getElementById('audiobookLoadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMoreAudioBooks);
        }
    }

    // ---- BookTorrio functionality ----
    async function initializeBookTorrio() {
        const searchInput = document.getElementById('bookSearchInput');
        const searchBtn = document.getElementById('searchBooksBtn');
        const resultsContainer = document.getElementById('bookSearchResults');
        const loadingDiv = document.getElementById('bookSearchLoading');
        const searchTabBtn = document.getElementById('searchTabBtn');
        const libraryTabBtn = document.getElementById('libraryTabBtn');
        const searchTab = document.getElementById('searchTab');
        const libraryTab = document.getElementById('libraryTab');

        if (!searchInput || !searchBtn || !resultsContainer || !loadingDiv) return;

        // Show EPUB folder location to user
        try {
            const folderResult = await window.electronAPI.getEpubFolder();
            if (folderResult.success) {
                console.log('EPUB books will be downloaded to:', folderResult.path);
                // You could add a small info message on the page if needed
            }
        } catch (error) {
            console.warn('Could not get EPUB folder path:', error);
        }

        // Tab switching functionality
        if (searchTabBtn && libraryTabBtn && searchTab && libraryTab) {
            searchTabBtn.addEventListener('click', () => {
                searchTabBtn.classList.add('active');
                libraryTabBtn.classList.remove('active');
                searchTab.style.display = 'block';
                libraryTab.style.display = 'none';
            });

            libraryTabBtn.addEventListener('click', () => {
                libraryTabBtn.classList.add('active');
                searchTabBtn.classList.remove('active');
                libraryTab.style.display = 'block';
                searchTab.style.display = 'none';
                // Load library when tab is opened
                loadEpubLibrary();
            });
        }

        // Load EPUB library function
        async function loadEpubLibrary() {
            try {
                const result = await window.electronAPI.getEpubLibrary();
                const libraryContent = document.getElementById('libraryTab');

                if (result.success && result.books.length > 0) {
                    libraryContent.innerHTML = `
                            <div class="books-grid">
                                ${result.books.map(book => `
                                    <div class="book-card">
                                        <img src="${book.coverUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMDZiNmQ0Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNHB4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkJvb2s8L3RleHQ+PC9zdmc+'}"
                                             alt="${book.title}"
                                             class="book-cover"
                                             onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMDZiNmQ0Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNHB4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkJvb2s8L3RleHQ+PC9zdmc+'">
                                        <div class="book-title">${book.title}</div>
                                        <div class="book-author">${Array.isArray(book.author) ? book.author.join(', ') : (book.author || '')}</div>
                                        <div class="book-details">
                                            <span class="book-tag"><i class="fas fa-file"></i> EPUB</span>
                                            ${book.fileSize ? `<span class="book-tag"><i class=\"fas fa-hdd\"></i> ${formatFileSize(book.fileSize)}</span>` : ''}
                                        </div>
                                        <button class="read-btn" data-local-path="${book.localPath}" data-title="${book.title}">
                                            <i class="fas fa-book-open"></i>
                                            Read
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    libraryContent.querySelectorAll('.read-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const p = btn.getAttribute('data-local-path');
                            const t = btn.getAttribute('data-title');
                            openEpubReader(p, t);
                        });
                    });
                } else {
                    libraryContent.innerHTML = `
                            <div class="search-placeholder">
                                <i class="fas fa-bookmark" style="font-size: 3rem; color: #06b6d4; margin-bottom: 1rem;"></i>
                                <h3>No Books in Library</h3>
                                <p>Downloaded EPUB books will appear here. Search and download some books to get started!</p>
                            </div>
                        `;
                }
            } catch (error) {
                console.error('Error loading library:', error);
                const libraryContent = document.getElementById('libraryTab');
                libraryContent.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545; margin-bottom: 1rem;"></i>
                            <h3>Error Loading Library</h3>
                            <p>Could not load your EPUB library. Please try again.</p>
                        </div>
                    `;
            }
        }

        // Search function
        async function searchBooks(query) {
            if (!query.trim()) return;

            try {
                loadingDiv.style.display = 'block';
                resultsContainer.innerHTML = '';

                // Use BookService to search LibGen
                const data = await BookService.searchLibGen(query);
                loadingDiv.style.display = 'none';

                if (data.books && data.books.length > 0) {
                    // Filter to show only EPUB files
                    const epubBooks = data.books.filter(book =>
                        book.fileExtension && book.fileExtension.toLowerCase() === 'epub'
                    );

                    if (epubBooks.length === 0) {
                        resultsContainer.innerHTML = `
                                <div class="search-placeholder">
                                    <i class="fas fa-file-alt" style="font-size: 3rem; color: #06b6d4; margin-bottom: 1rem;"></i>
                                    <h3>No EPUB Books Found</h3>
                                    <p>No EPUB books found for "${query}". Try a different search term.</p>
                                </div>
                            `;
                        return;
                    }

                    resultsContainer.innerHTML = epubBooks.map(book => `
                            <div class="book-card">
                                <img src="${book.coverUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMDZiNmQ0Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNHB4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkJvb2s8L3RleHQ+PC9zdmc+'}" 
                                     alt="${book.title}" 
                                     class="book-cover"
                                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMDZiNmQ0Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNHB4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkJvb2s8L3RleHQ+PC9zdmc+'">
                                <div class="book-title">${book.title}</div>
                                <div class="book-author">${Array.isArray(book.author) ? book.author.join(', ') : book.author}</div>
                                <div class="book-details">
                                    <span class="book-tag"><i class="fas fa-calendar"></i> ${book.year}</span>
                                    <span class="book-tag"><i class="fas fa-language"></i> ${book.language}</span>
                                    <span class="book-tag ${book.fileExtension && book.fileExtension.toLowerCase() === 'epub' ? 'epub-highlight' : ''}">
                                        <i class="fas fa-file"></i> ${book.fileExtension ? book.fileExtension.toUpperCase() : 'Unknown'}
                                    </span>
                                    <span class="book-tag"><i class="fas fa-hdd"></i> ${formatFileSize(book.fileSize)}</span>
                                </div>
                                <button class="download-btn" 
                                        data-download-url="${book.downloadlink}"
                                        data-book="${encodeURIComponent(JSON.stringify(book))}">
                                    <i class="fas fa-download"></i>
                                    Download Now
                                </button>
                            </div>
                        `).join('');

                    // Wire click handlers after rendering to avoid inline JS and quoting issues
                    const downloadButtons = resultsContainer.querySelectorAll('.download-btn');
                    downloadButtons.forEach(btn => {
                        btn.addEventListener('click', () => {
                            const url = btn.getAttribute('data-download-url');
                            const encoded = btn.getAttribute('data-book');
                            let bookObj = {};
                            try {
                                bookObj = JSON.parse(decodeURIComponent(encoded));
                            } catch (e) {
                                console.warn('Failed to parse book data from button:', e);
                            }
                            if (!url) {
                                alert('No download URL available for this book.');
                                return;
                            }
                            window.downloadBook(url, bookObj);
                        });
                    });
                } else {
                    resultsContainer.innerHTML = `
                            <div class="search-placeholder">
                                <i class="fas fa-search" style="font-size: 3rem; color: #06b6d4; margin-bottom: 1rem;"></i>
                                <h3>No Books Found</h3>
                                <p>No books found for "${query}". Try a different search term.</p>
                            </div>
                        `;
                }
            } catch (error) {
                console.error('Search error:', error);
                loadingDiv.style.display = 'none';
                resultsContainer.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545; margin-bottom: 1rem;"></i>
                            <h3>Search Error</h3>
                            <p>Failed to search for books. Make sure the RandomBook server is running on port 5000.</p>
                        </div>
                    `;
            }
        }

        // Format file size helper
        function formatFileSize(bytes) {
            if (!bytes) return 'Unknown';
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
        }

        // Download book function
        window.downloadBook = async function (downloadUrl, bookData) {
            console.log('downloadBook called with:', downloadUrl, bookData);

            if (downloadUrl && bookData) {
                try {
                    console.log('Calling BookService.downloadBook...');
                    // Download using BookService
                    // parse bookData if it's an object? It is passed as obj from listener
                    const title = bookData.title || 'Unknown';
                    const author = Array.isArray(bookData.author) ? bookData.author.join(', ') : (bookData.author || 'Unknown');

                    const result = await BookService.downloadBook(downloadUrl, title, author, 'epub');

                    console.log('Download result:', result);

                    if (result.success) {
                        // Show download modal
                        console.log('Showing download modal...');
                        // Adapt result for modal
                        showDownloadModal({
                            success: true,
                            folder: result.path, // or get directory
                            url: result.path // The path is the file path
                        });
                        alert('Download complete: ' + result.path);
                    } else {
                        alert('Error downloading: ' + (result.error?.message || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Download error:', error);
                    alert('Error downloading. Please try again.');
                }
            } else {
                console.error('Invalid parameters:', { downloadUrl, bookData });
                alert('Invalid download link or book data.');
            }
        };

        // Modal functions
        let currentDownload = null;

        function showDownloadModal(downloadInfo) {
            const modal = document.getElementById('epubDownloadModal');
            const pathText = document.getElementById('epubDownloadPath');

            // Store download info for modal functions
            currentDownload = downloadInfo;

            // Show only the folder path per user preference
            pathText.textContent = downloadInfo.folder;
            modal.style.display = 'flex';
        }

        function closeEpubDownloadModal() {
            const modal = document.getElementById('epubDownloadModal');
            modal.style.display = 'none';
            currentDownload = null;
        }

        function copyEpubPath() {
            if (currentDownload) {
                // Copy only the folder path per user preference
                navigator.clipboard.writeText(currentDownload.folder).then(() => {
                    // Show feedback
                    const button = document.querySelector('.copy-path-btn');
                    const originalText = button.textContent;
                    button.textContent = 'Copied!';
                    button.style.background = '#059669';
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.style.background = '';
                    }, 2000);
                });
            }
        }

        function openDownloadLink() {
            if (currentDownload && currentDownload.url) {
                // Use electron shell to open URL in default browser
                if (window.electronAPI && window.electronAPI.openExternal) {
                    window.electronAPI.openExternal(currentDownload.url);
                } else {
                    // Fallback
                    window.open(currentDownload.url, '_blank');
                }
            }
        }

        // Make functions globally available
        window.closeEpubDownloadModal = closeEpubDownloadModal;
        window.copyEpubPath = copyEpubPath;
        window.openDownloadLink = openDownloadLink;

        // Event listeners
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) {
                searchBooks(query);
            }
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    searchBooks(query);
                }
            }
        });
    }

    // ---- Anime functionality ----
    let animeList = [];
    let currentAnime = null;
    let animeOffset = 0;
    let animeIsLoading = false;
    let animeHasMore = true;
    let animeIsSearching = false;
    let animeSearchQuery = '';
    let animeBaseUrl = 'http://localhost:6987/anime';

    async function initializeAnime() {
        const animeSearchInput = document.getElementById('animeSearchInput');
        const animeGrid = document.getElementById('animeGrid');
        const animeLoadingIndicator = document.getElementById('animeLoadingIndicator');
        const animeDetailsModal = document.getElementById('animeDetailsModal');
        const animeModalClose = document.getElementById('animeModalClose');
        const animeFindTorrentsBtn = document.getElementById('animeFindTorrentsBtn');
        const animeTorrentsContainer = document.getElementById('animeTorrentsContainer');
        const animeRefreshTorrents = document.getElementById('animeRefreshTorrents');
        const animeTorrentKeywordFilter = document.getElementById('animeTorrentKeywordFilter');

        let searchTimeout = null;

        // Load trending anime on init
        loadTrendingAnime();

        // Setup infinite scroll
        const mainElement = document.querySelector('main');
        mainElement.addEventListener('scroll', () => {
            const animePage = document.getElementById('anime-page');
            if (animePage.style.display === 'none') return;

            const scrollBottom = mainElement.scrollTop + mainElement.clientHeight;
            const threshold = mainElement.scrollHeight - 300;

            if (scrollBottom >= threshold && !animeIsLoading && animeHasMore) {
                if (animeIsSearching) {
                    searchAnime(animeSearchQuery, true);
                } else {
                    loadTrendingAnime(true);
                }
            }
        });

        // Search functionality
        animeSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = animeSearchInput.value.trim();

            if (!query) {
                animeIsSearching = false;
                animeSearchQuery = '';
                animeOffset = 0;
                animeHasMore = true;
                loadTrendingAnime();
                return;
            }

            searchTimeout = setTimeout(() => {
                animeIsSearching = true;
                animeSearchQuery = query;
                animeOffset = 0;
                animeHasMore = true;
                searchAnime(query);
            }, 500);
        });

        animeSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = animeSearchInput.value.trim();
                if (query) {
                    animeIsSearching = true;
                    animeSearchQuery = query;
                    animeOffset = 0;
                    animeHasMore = true;
                    searchAnime(query);
                }
            }
        });

        // Modal close
        animeModalClose.addEventListener('click', () => {
            animeDetailsModal.classList.remove('active');
            animeTorrentsContainer.style.display = 'none';
            animeRealmSourcesContainer.style.display = 'none';
            // Clear the sources to free memory
            animeRealmSourcesList.innerHTML = '';
            animeTorrentsList.innerHTML = '';
        });

        animeDetailsModal.addEventListener('click', (e) => {
            if (e.target === animeDetailsModal) {
                animeDetailsModal.classList.remove('active');
                animeTorrentsContainer.style.display = 'none';
                animeRealmSourcesContainer.style.display = 'none';
                // Clear the sources to free memory
                animeRealmSourcesList.innerHTML = '';
                animeTorrentsList.innerHTML = '';
            }
        });

        // Find torrents button
        animeFindTorrentsBtn.addEventListener('click', async () => {
            if (!currentAnime) return;
            animeTorrentsContainer.style.display = 'block';
            animeRealmSourcesContainer.style.display = 'none';
            await loadAnimeTorrents(currentAnime.title.romaji || currentAnime.title.english);
        });

        // Realm sources button
        const animeRealmSourcesBtn = document.getElementById('animeRealmSourcesBtn');
        const animeDirectStreamBtn = document.getElementById('animeDirectStreamBtn');
        const animeRealmSourcesContainer = document.getElementById('animeRealmSourcesContainer');
        const animeRealmSourcesList = document.getElementById('animeRealmSourcesList');
        const animeRefreshRealmSources = document.getElementById('animeRefreshRealmSources');

        // Direct Stream button - shows AnimRealms URL
        animeDirectStreamBtn.addEventListener('click', () => {
            if (!currentAnime) return;

            const seasonSelector = document.getElementById('animeSeasonSelector');
            const episodeSelector = document.getElementById('animeEpisodeSelector');
            let episodeNumber = episodeSelector ? episodeSelector.value : null;
            const seasonNumber = seasonSelector ? seasonSelector.value : null;

            // If no episode selected or it's a movie, default to episode 1
            if (!episodeNumber || currentAnime.episodes === 1 || currentAnime.format === 'MOVIE') {
                episodeNumber = '1';
            } else if (seasonNumber) {
                // Calculate absolute episode if season is selected
                episodeNumber = calculateAbsoluteEpisode(seasonNumber, episodeNumber).toString();
            }

            const anilistId = currentAnime.id;
            const realmUrl = `https://www.animerealms.org/en/watch/${anilistId}/${episodeNumber}`;

            console.log('[Direct Stream] URL:', realmUrl);

            // Show in Realm sources container
            const animeRealmSourcesList = document.getElementById('animeRealmSourcesList');
            animeRealmSourcesContainer.style.display = 'block';
            animeTorrentsContainer.style.display = 'none';

            animeRealmSourcesList.innerHTML = `
                    <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                        <h3 style="color: #10b981; margin: 0 0 1rem 0; font-size: 1.1rem;">
                            <i class="fas fa-external-link-alt"></i> Direct Stream
                        </h3>
                        <iframe src="${realmUrl}" style="width: 100%; height: 600px; border: none; border-radius: 6px; background: #000;" allowfullscreen="true" allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture;"></iframe>
                    </div>
                `;
        });

        animeRealmSourcesBtn.addEventListener('click', async () => {
            if (!currentAnime) return;
            const seasonSelector = document.getElementById('animeSeasonSelector');
            const episodeSelector = document.getElementById('animeEpisodeSelector');
            let episodeNumber = episodeSelector ? episodeSelector.value : null;
            const seasonNumber = seasonSelector ? seasonSelector.value : null;

            // If no episode selected or it's a movie, default to episode 1
            if (!episodeNumber || currentAnime.episodes === 1 || currentAnime.format === 'MOVIE') {
                episodeNumber = '1';
            } else if (seasonNumber) {
                // Calculate absolute episode number for Realm API
                episodeNumber = calculateAbsoluteEpisode(seasonNumber, episodeNumber).toString();
            }

            animeRealmSourcesContainer.style.display = 'block';
            animeTorrentsContainer.style.display = 'none';
            await loadRealmSources(currentAnime.id, episodeNumber);
        });

        // Refresh Realm sources
        animeRefreshRealmSources.addEventListener('click', async () => {
            if (!currentAnime) return;
            const seasonSelector = document.getElementById('animeSeasonSelector');
            const episodeSelector = document.getElementById('animeEpisodeSelector');
            let episodeNumber = episodeSelector ? episodeSelector.value : null;
            const seasonNumber = seasonSelector ? seasonSelector.value : null;

            // If no episode selected or it's a movie, default to episode 1
            if (!episodeNumber || currentAnime.episodes === 1 || currentAnime.format === 'MOVIE') {
                episodeNumber = '1';
            } else if (seasonNumber) {
                // Calculate absolute episode number for Realm API
                episodeNumber = calculateAbsoluteEpisode(seasonNumber, episodeNumber).toString();
            }

            await loadRealmSources(currentAnime.id, episodeNumber);
        });

        // Refresh torrents
        animeRefreshTorrents.addEventListener('click', async () => {
            if (!currentAnime) return;
            await loadAnimeTorrents(currentAnime.title.romaji || currentAnime.title.english);
        });

        // Torrent keyword filter
        animeTorrentKeywordFilter.addEventListener('input', () => {
            filterAnimeTorrents();
        });

        // Custom search functionality
        const animeCustomSearchInput = document.getElementById('animeCustomSearchInput');
        const animeCustomSearchBtn = document.getElementById('animeCustomSearchBtn');

        animeCustomSearchBtn.addEventListener('click', async () => {
            const query = animeCustomSearchInput.value.trim();
            if (query) {
                await searchAnimeCustomQuery(query);
            }
        });

        animeCustomSearchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = animeCustomSearchInput.value.trim();
                if (query) {
                    await searchAnimeCustomQuery(query);
                }
            }
        });
    }

    async function loadTrendingAnime(append = false) {
        if (animeIsLoading) return;
        animeIsLoading = true;

        const animeGrid = document.getElementById('animeGrid');
        const animeLoadingIndicator = document.getElementById('animeLoadingIndicator');

        if (!append) {
            animeGrid.innerHTML = '';
            animeOffset = 0;
        }

        animeLoadingIndicator.style.display = 'block';

        try {
            const query = `
                    query ($page: Int, $perPage: Int) {
                        Page(page: $page, perPage: $perPage) {
                            media(type: ANIME, sort: TRENDING_DESC) {
                                id
                                title {
                                    romaji
                                    english
                                }
                                coverImage {
                                    large
                                }
                                bannerImage
                                averageScore
                                episodes
                                format
                                genres
                                seasonYear
                                description
                            }
                        }
                    }
                `;

            const page = Math.floor(animeOffset / 20) + 1;
            const variables = { page, perPage: 20 };

            const response = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ query, variables })
            });

            const data = await response.json();
            const anime = data.data.Page.media;

            if (append) {
                animeList = [...animeList, ...anime];
            } else {
                animeList = anime;
            }

            if (anime.length < 20) {
                animeHasMore = false;
            }

            anime.forEach(item => {
                const card = createAnimeCard(item);
                animeGrid.appendChild(card);
            });

            animeOffset += anime.length;
        } catch (error) {
            console.error('Error loading trending anime:', error);
        } finally {
            animeLoadingIndicator.style.display = 'none';
            animeIsLoading = false;
        }
    }

    async function searchAnime(query, append = false) {
        if (animeIsLoading) return;
        animeIsLoading = true;

        const animeGrid = document.getElementById('animeGrid');
        const animeLoadingIndicator = document.getElementById('animeLoadingIndicator');

        if (!append) {
            animeGrid.innerHTML = '';
            animeOffset = 0;
        }

        animeLoadingIndicator.style.display = 'block';

        try {
            const graphqlQuery = `
                    query ($search: String, $page: Int, $perPage: Int) {
                        Page(page: $page, perPage: $perPage) {
                            media(type: ANIME, search: $search, sort: POPULARITY_DESC) {
                                id
                                title {
                                    romaji
                                    english
                                }
                                coverImage {
                                    large
                                }
                                bannerImage
                                averageScore
                                episodes
                                format
                                genres
                                seasonYear
                                description
                            }
                        }
                    }
                `;

            const page = Math.floor(animeOffset / 20) + 1;
            const variables = { search: query, page, perPage: 20 };

            const response = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ query: graphqlQuery, variables })
            });

            const data = await response.json();
            const anime = data.data.Page.media;

            if (append) {
                animeList = [...animeList, ...anime];
            } else {
                animeList = anime;
            }

            if (anime.length < 20) {
                animeHasMore = false;
            }

            anime.forEach(item => {
                const card = createAnimeCard(item);
                animeGrid.appendChild(card);
            });

            animeOffset += anime.length;
        } catch (error) {
            console.error('Error searching anime:', error);
        } finally {
            animeLoadingIndicator.style.display = 'none';
            animeIsLoading = false;
        }
    }

    function createAnimeCard(anime) {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.style.cursor = 'pointer';

        const title = anime.title.english || anime.title.romaji;
        const coverImage = anime.coverImage.large || '/placeholder.jpg';
        const rating = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'N/A';
        const year = anime.seasonYear || 'N/A';

        card.innerHTML = `
                <div class="movie-poster-container">
                    <img src="${coverImage}" alt="${title}" class="movie-poster" loading="lazy" />
                    <div class="movie-overlay">
                        <i class="fas fa-info-circle"></i>
                    </div>
                </div>
                <div class="movie-info">
                    <div class="movie-title">${title}</div>
                    <div class="movie-meta">
                        <span class="movie-year">${year}</span>
                        <span class="movie-rating">
                            <i class="fas fa-star"></i> ${rating}
                        </span>
                    </div>
                </div>
            `;

        card.addEventListener('click', () => showAnimeDetails(anime));
        return card;
    }

    function showAnimeDetails(anime) {
        currentAnime = anime;
        const animeDetailsModal = document.getElementById('animeDetailsModal');
        const animeModalTitle = document.getElementById('animeModalTitle');
        const animeModalPoster = document.getElementById('animeModalPoster');
        const animeModalBackdrop = document.getElementById('animeModalBackdrop');
        const animeModalRating = document.getElementById('animeModalRating');
        const animeModalYear = document.getElementById('animeModalYear');
        const animeModalEpisodes = document.getElementById('animeModalEpisodes');
        const animeModalGenres = document.getElementById('animeModalGenres');
        const animeModalOverview = document.getElementById('animeModalOverview');
        const animeTorrentsContainer = document.getElementById('animeTorrentsContainer');
        const animeRealmSourcesContainer = document.getElementById('animeRealmSourcesContainer');
        const animeRealmSourcesList = document.getElementById('animeRealmSourcesList');
        const animeSeasonEpisodeContainer = document.getElementById('animeSeasonEpisodeContainer');

        // Clear previous content
        const animeTorrentsList = document.getElementById('animeTorrentsList');
        if (animeTorrentsList) animeTorrentsList.innerHTML = '';
        if (animeRealmSourcesList) animeRealmSourcesList.innerHTML = '';

        // Clear stored subtitles from previous anime
        Object.keys(window).forEach(key => {
            if (key.startsWith('realmSubtitles_')) {
                delete window[key];
            }
        });

        const title = anime.title.english || anime.title.romaji;
        const rating = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'N/A';
        const year = anime.seasonYear || 'N/A';
        const episodes = anime.episodes ? `${anime.episodes} Episodes` : 'N/A';
        const genres = anime.genres ? anime.genres.join(', ') : 'N/A';
        const description = anime.description ? anime.description.replace(/<[^>]*>/g, '') : 'No description available.';

        animeModalTitle.textContent = title;
        animeModalPoster.src = anime.coverImage.large || '/placeholder.jpg';
        animeModalBackdrop.src = anime.bannerImage || anime.coverImage.large || '/placeholder.jpg';
        animeModalRating.textContent = rating;
        animeModalYear.textContent = year;
        animeModalEpisodes.textContent = episodes;
        animeModalGenres.textContent = genres;
        animeModalOverview.textContent = description;

        // Check if it's a series (has episodes) or a movie
        const isMovie = !anime.episodes || anime.episodes === 1 || anime.format === 'MOVIE';

        if (isMovie) {
            // Hide season/episode selector for movies
            animeSeasonEpisodeContainer.style.display = 'none';
        } else {
            // Show season/episode selector for series
            animeSeasonEpisodeContainer.style.display = 'block';
            setupAnimeSeasonEpisodeSelectors(anime.episodes);
        }

        animeTorrentsContainer.style.display = 'none';
        animeRealmSourcesContainer.style.display = 'none';
        animeDetailsModal.classList.add('active');
    }

    function setupAnimeSeasonEpisodeSelectors(totalEpisodes) {
        const seasonSelector = document.getElementById('animeSeasonSelector');
        const episodeSelector = document.getElementById('animeEpisodeSelector');

        // Clear existing options
        seasonSelector.innerHTML = '<option value="">All Seasons</option>';
        episodeSelector.innerHTML = '<option value="">All Episodes</option>';

        // Remove old event listeners by cloning and replacing
        const newSeasonSelector = seasonSelector.cloneNode(false);
        const newEpisodeSelector = episodeSelector.cloneNode(false);
        const defaultSeasonOption = document.createElement('option');
        defaultSeasonOption.value = '';
        defaultSeasonOption.textContent = 'All Seasons';
        defaultSeasonOption.style.background = '#1a1a2e';
        defaultSeasonOption.style.color = 'var(--light)';
        newSeasonSelector.appendChild(defaultSeasonOption);

        const defaultEpisodeOption = document.createElement('option');
        defaultEpisodeOption.value = '';
        defaultEpisodeOption.textContent = 'All Episodes';
        defaultEpisodeOption.style.background = '#1a1a2e';
        defaultEpisodeOption.style.color = 'var(--light)';
        newEpisodeSelector.appendChild(defaultEpisodeOption);

        seasonSelector.parentNode.replaceChild(newSeasonSelector, seasonSelector);
        episodeSelector.parentNode.replaceChild(newEpisodeSelector, episodeSelector);

        // Estimate number of seasons (typical anime season is ~12-13 or 24-26 episodes)
        // Let's assume max 4 seasons for safety
        const estimatedSeasons = totalEpisodes ? Math.min(Math.ceil(totalEpisodes / 12), 4) : 1;

        // Populate season selector
        for (let i = 1; i <= estimatedSeasons; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Season ${i}`;
            option.style.background = '#1a1a2e';
            option.style.color = 'var(--light)';
            option.style.fontWeight = '500';
            newSeasonSelector.appendChild(option);
        }

        // Populate episode selector (up to total episodes or 100, whichever is smaller)
        const maxEpisodes = totalEpisodes ? Math.min(totalEpisodes, 100) : 50;
        for (let i = 1; i <= maxEpisodes; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Episode ${i}`;
            option.style.background = '#1a1a2e';
            option.style.color = 'var(--light)';
            option.style.fontWeight = '500';
            newEpisodeSelector.appendChild(option);
        }

        // Add event listeners (only once per new selector)
        newSeasonSelector.addEventListener('change', () => {
            if (document.getElementById('animeTorrentsContainer').style.display !== 'none') {
                loadAnimeTorrents(currentAnime.title.romaji || currentAnime.title.english);
            }
        });

        newEpisodeSelector.addEventListener('change', () => {
            if (document.getElementById('animeTorrentsContainer').style.display !== 'none') {
                loadAnimeTorrents(currentAnime.title.romaji || currentAnime.title.english);
            }
        });
    }

    async function loadAnimeTorrents(animeTitle) {
        const animeTorrentsList = document.getElementById('animeTorrentsList');
        const seasonSelector = document.getElementById('animeSeasonSelector');
        const episodeSelector = document.getElementById('animeEpisodeSelector');

        const selectedSeason = seasonSelector.value;
        const selectedEpisode = episodeSelector.value;

        // Generate search queries with multiple variants
        const searchQueries = generateAnimeSearchQueries(animeTitle, selectedSeason, selectedEpisode);

        // Show loading state and lock the display
        animeTorrentsList.innerHTML = `<div class="loading"><div class="spinner"></div><p>Searching Nyaa with ${searchQueries.length} query variants...</p></div>`;

        try {
            // Collect all results first
            const allTorrents = [];
            const seenMagnets = new Set();

            // Execute all searches in parallel and wait for ALL to complete
            const searchResults = await Promise.all(
                searchQueries.map(async (query) => {
                    try {
                        const response = await fetch(`${animeBaseUrl}/api/${encodeURIComponent(query)}`);
                        const data = await response.json();
                        return data.results || [];
                    } catch (err) {
                        console.error(`Error searching for "${query}":`, err);
                        return [];
                    }
                })
            );

            // Now combine all results (this happens AFTER all searches complete)
            searchResults.forEach(results => {
                results.forEach(torrent => {
                    if (!seenMagnets.has(torrent.magnetLink)) {
                        seenMagnets.add(torrent.magnetLink);
                        allTorrents.push(torrent);
                    }
                });
            });

            // Check if we found anything
            if (allTorrents.length === 0) {
                animeTorrentsList.innerHTML = '<p style="text-align: center; color: var(--light); padding: 2rem;">No torrents found. Try selecting different season/episode options.</p>';
                return;
            }

            // Sort by seeders (highest first)
            allTorrents.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

            // Store original torrents for filtering
            animeTorrentsList.dataset.allTorrents = JSON.stringify(allTorrents);

            // Display all results at once
            displayAnimeTorrents(allTorrents);

        } catch (error) {
            console.error('Error loading anime torrents:', error);
            animeTorrentsList.innerHTML = '<p style="text-align: center; color: #ff4444; padding: 2rem;">Error loading torrents. Make sure the Nyaa server is running.</p>';
        }
    }

    function generateAnimeSearchQueries(animeTitle, season, episode) {
        const queries = [];
        const baseTitle = animeTitle.trim();

        // If no season/episode selected, just search for the anime title
        if (!season && !episode) {
            queries.push(baseTitle);
            return queries;
        }

        // If only season selected (no specific episode)
        if (season && !episode) {
            // Season variants
            queries.push(`${baseTitle} S${season}`);
            queries.push(`${baseTitle} S${season.padStart(2, '0')}`);
            queries.push(`${baseTitle} Season ${season}`);
            queries.push(`${baseTitle} Season${season}`);
            queries.push(`${baseTitle} Season ${season.padStart(2, '0')}`);
            queries.push(`${baseTitle} Season${season.padStart(2, '0')}`);
            return queries;
        }

        // If only episode selected (no season)
        if (!season && episode) {
            // Episode only variants
            queries.push(`${baseTitle} E${episode}`);
            queries.push(`${baseTitle} E${episode.padStart(2, '0')}`);
            queries.push(`${baseTitle} EP${episode}`);
            queries.push(`${baseTitle} EP${episode.padStart(2, '0')}`);
            queries.push(`${baseTitle} Episode ${episode}`);
            queries.push(`${baseTitle} Episode${episode}`);
            queries.push(`${baseTitle} - ${episode.padStart(2, '0')}`);
            return queries;
        }

        // Both season and episode selected
        const s = season;
        const e = episode;
        const s2 = season.padStart(2, '0');
        const e2 = episode.padStart(2, '0');

        // Combined season+episode variants
        queries.push(`${baseTitle} S${s2}E${e2}`);
        queries.push(`${baseTitle} S${s}E${e}`);
        queries.push(`${baseTitle} S${s2}E${e}`);
        queries.push(`${baseTitle} S${s}E${e2}`);
        queries.push(`${baseTitle} S${s2} E${e2}`);
        queries.push(`${baseTitle} Season ${s} Episode ${e}`);
        queries.push(`${baseTitle} Season${s} Episode${e}`);
        queries.push(`${baseTitle} Season ${s} Ep ${e}`);
        queries.push(`${baseTitle} ${s2}x${e2}`);
        queries.push(`${baseTitle} - ${s2}x${e2}`);
        queries.push(`${baseTitle} - S${s2}E${e2}`);

        return queries;
    }

    function displayAnimeTorrents(torrents) {
        const animeTorrentsList = document.getElementById('animeTorrentsList');
        animeTorrentsList.innerHTML = '';

        torrents.forEach(torrent => {
            const torrentItem = document.createElement('div');
            torrentItem.className = 'torrent-item';

            torrentItem.innerHTML = `
                    <div class="torrent-info">
                        <div class="torrent-title">${torrent.title}</div>
                        <div class="torrent-meta">
                            <span class="torrent-size">
                                <i class="fas fa-hdd"></i> ${torrent.size}
                            </span>
                            <span class="torrent-seeders">
                                <i class="fas fa-arrow-up"></i> ${torrent.seeders} seeders
                            </span>
                        </div>
                    </div>
                    <div class="torrent-actions">
                        <button class="btn btn-primary" onclick="playAnimeTorrent('${torrent.magnetLink.replace(/'/g, "\\'")}', '${torrent.title.replace(/'/g, "\\'")}')">
                            <i class="fas fa-play"></i> Play
                        </button>
                    </div>
                `;

            animeTorrentsList.appendChild(torrentItem);
        });
    }

    function filterAnimeTorrents() {
        const animeTorrentsList = document.getElementById('animeTorrentsList');
        const filterInput = document.getElementById('animeTorrentKeywordFilter');
        const keyword = filterInput.value.toLowerCase();

        const allTorrentsData = animeTorrentsList.dataset.allTorrents;
        if (!allTorrentsData) return;

        const allTorrents = JSON.parse(allTorrentsData);

        if (!keyword) {
            displayAnimeTorrents(allTorrents);
            return;
        }

        const filtered = allTorrents.filter(t => t.title.toLowerCase().includes(keyword));
        displayAnimeTorrents(filtered);
    }

    async function searchAnimeCustomQuery(customQuery) {
        const animeTorrentsList = document.getElementById('animeTorrentsList');
        const animeTorrentsContainer = document.getElementById('animeTorrentsContainer');

        // Show torrents container if hidden
        animeTorrentsContainer.style.display = 'block';

        // Show loading
        animeTorrentsList.innerHTML = '<div class="loading"><div class="spinner"></div><p>Searching Nyaa with your custom query...</p></div>';

        try {
            const response = await fetch(`${animeBaseUrl}/api/${encodeURIComponent(customQuery)}`);
            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                animeTorrentsList.innerHTML = '<p style="text-align: center; color: var(--light); padding: 2rem;">No torrents found for your custom query. Try different keywords.</p>';
                return;
            }

            // Sort by seeders
            const torrents = data.results.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

            // Store and display
            animeTorrentsList.dataset.allTorrents = JSON.stringify(torrents);
            displayAnimeTorrents(torrents);

            // Show notification
            showNotification(`Found ${torrents.length} torrents for "${customQuery}"`, 'success');

        } catch (error) {
            console.error('Error with custom search:', error);
            animeTorrentsList.innerHTML = '<p style="text-align: center; color: #ff4444; padding: 2rem;">Error searching. Make sure the Nyaa server is running.</p>';
        }
    }

    function playAnimeTorrent(magnetLink, title) {
        // Close the anime modal
        const animeDetailsModal = document.getElementById('animeDetailsModal');
        animeDetailsModal.classList.remove('active');

        // Use the same startStream function as movies/shows
        startStream(magnetLink);
    }

    // ============================================================================
    // REALM ANIME SOURCES
    // ============================================================================

    // Open AnimRealms in iframe
    function openAnimeRealmIframe(realmUrl) {
        const iframe = document.getElementById('video-player-frame');
        const customPlayerContainer = document.getElementById('customPlayerContainer');
        const videoContainer = document.getElementById('videoContainer');
        const frameContainer = document.querySelector('.video-player-frame-container');

        if (!iframe || !customPlayerContainer) {
            console.error('[Direct Stream] Player elements not found');
            showNotification('Player not available', 'error');
            return;
        }

        // Hide the video container, show only iframe
        if (videoContainer) videoContainer.style.display = 'none';
        if (frameContainer) frameContainer.style.display = 'block';

        // Set iframe source
        iframe.src = realmUrl;

        // Show player
        customPlayerContainer.classList.add('active');
        customPlayerContainer.style.display = 'flex';

        // Update Discord if available
        if (currentAnime) {
            const animeTitle = currentAnime.title?.romaji || currentAnime.title?.english || 'Anime';
            updateDiscordForStreaming(animeTitle, 'AnimRealms', null);
        }

        console.log('[Direct Stream] Opened iframe:', realmUrl);
        showNotification('Loading AnimRealms...', 'success');
    }

    // Helper function to calculate absolute episode number from season + episode
    function calculateAbsoluteEpisode(seasonNum, episodeNum, episodesPerSeason = 12) {
        const season = parseInt(seasonNum) || 1;
        const episode = parseInt(episodeNum) || 1;

        // If season 1, just return episode number
        if (season === 1) return episode;

        // Calculate: (previous seasons * eps per season) + current episode
        return ((season - 1) * episodesPerSeason) + episode;
    }

    async function loadRealmSources(anilistId, episodeNumber) {
        const animeRealmSourcesList = document.getElementById('animeRealmSourcesList');

        if (!anilistId || !episodeNumber) {
            animeRealmSourcesList.innerHTML = '<p style="text-align: center; color: #ff4444; padding: 2rem;">Please select an episode first</p>';
            return;
        }

        // Show loading
        animeRealmSourcesList.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading Realm sources...</p></div>';

        try {
            const response = await fetch(`http://localhost:6987/api/realm/${anilistId}/${episodeNumber}`);

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            console.log('[Realm] Sources data:', data);

            displayRealmSources(data);

        } catch (error) {
            console.error('[Realm] Error loading sources:', error);
            animeRealmSourcesList.innerHTML = '<p style="text-align: center; color: #ff4444; padding: 2rem;">Error loading sources. Make sure the server is running.</p>';
        }
    }

    function displayRealmSources(sourcesData) {
        const animeRealmSourcesList = document.getElementById('animeRealmSourcesList');
        animeRealmSourcesList.innerHTML = '';

        let hasAnySources = false;

        // Iterate through each provider
        Object.keys(sourcesData).forEach(providerName => {
            const provider = sourcesData[providerName];

            // Skip if error or not found or no streams
            if (provider.error || provider.notFound || !provider.streams || provider.streams.length === 0) {
                return;
            }

            hasAnySources = true;

            // Create provider section
            const providerSection = document.createElement('div');
            providerSection.style.marginBottom = '1.5rem';

            const providerTitle = document.createElement('h4');
            providerTitle.style.cssText = 'color: #8b5cf6; font-size: 1.1rem; margin-bottom: 0.75rem; text-transform: capitalize; font-weight: 600;';
            providerTitle.innerHTML = `<i class="fas fa-play-circle"></i> ${providerName.replace(/-/g, ' ')}`;
            providerSection.appendChild(providerTitle);

            // Display streams
            provider.streams.forEach((stream, streamIndex) => {
                const streamItem = document.createElement('div');
                streamItem.className = 'torrent-item';
                streamItem.style.marginBottom = '0.5rem';

                const qualityLabel = stream.quality || 'auto';
                const streamUrl = stream.url;

                // Get referer - always use animerealms.org for all providers to ensure CDN access
                let referer = 'https://www.animerealms.org/';

                // Store subtitles for this provider if available
                const subsKey = `${providerName}_${streamIndex}`;
                if (provider.subtitles && provider.subtitles.length > 0) {
                    window[`realmSubtitles_${subsKey}`] = provider.subtitles;
                }

                const hasSubtitles = provider.subtitles && provider.subtitles.length > 0;

                const subsText = hasSubtitles ? ` • ${provider.subtitles.length} subs` : '';

                streamItem.innerHTML = `
                        <div class="torrent-info">
                            <div class="torrent-title">${providerName.replace(/-/g, ' ')} - ${qualityLabel}</div>
                            <div class="torrent-meta">
                                <span class="torrent-size">
                                    <i class="fas fa-server"></i> Proxied${subsText}
                                </span>
                            </div>
                        </div>
                        <div class="torrent-actions">
                            <button class="btn btn-primary" onclick="playRealmStream('${streamUrl.replace(/'/g, "\\'")}', '${referer.replace(/'/g, "\\'")}', '${providerName} - ${qualityLabel}', '${subsKey}')">
                                <i class="fas fa-play"></i> Play
                            </button>
                        </div>
                    `;

                providerSection.appendChild(streamItem);
            });

            animeRealmSourcesList.appendChild(providerSection);
        });

        if (!hasAnySources) {
            animeRealmSourcesList.innerHTML = '<p style="text-align: center; color: var(--light); padding: 2rem; opacity: 0.7;">No sources found for this episode</p>';
        }
    }

    async function playRealmStream(url, referer, title, subsKey) {
        console.log('[Realm] Playing stream:', { url, referer, title, subsKey });

        // Get subtitles if available
        const subtitles = subsKey ? window[`realmSubtitles_${subsKey}`] : null;
        if (subtitles && subtitles.length > 0) {
            console.log('[Realm] Passing subtitles to player:', subtitles);
        }

        // Close the anime modal
        const animeDetailsModal = document.getElementById('animeDetailsModal');
        animeDetailsModal.classList.remove('active');

        // If there's a referer, use proxy
        let playUrl = url;
        if (referer) {
            playUrl = `http://localhost:6987/api/realm/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
            console.log('[Realm] Using proxy URL:', playUrl);
        }

        // Get current anime info
        const tmdbId = currentAnime?.id?.toString() || '';
        const episodeSelector = document.getElementById('animeEpisodeSelector');
        const episodeNum = episodeSelector ? episodeSelector.value : null;

        // Platform detection
        const platform = window.electronAPI.platform;

        try {
            if (platform === 'win32') {
                // Windows: Use mpv.js player
                const res = await window.electronAPI.spawnMpvjsPlayer({
                    url: playUrl,
                    tmdbId,
                    seasonNum: null,
                    episodeNum,
                    subtitles: subtitles || null
                });

                if (res?.success) {
                    console.log('[Realm] mpv.js player started successfully');
                } else {
                    console.error('[Realm] mpv.js failed:', res?.message);
                    showNotification(res?.message || 'Failed to start player', 'error');
                }
            } else if (platform === 'darwin') {
                // macOS: Use IINA
                const res = await window.electronAPI.openInIINA({
                    streamUrl: playUrl
                });

                if (res?.success) {
                    console.log('[Realm] IINA started successfully');
                } else {
                    console.error('[Realm] IINA failed:', res?.message);
                    showNotification(res?.message || 'IINA not installed. Please download from https://iina.io', 'error');
                }
            } else {
                // Linux: Use MPV
                const res = await window.electronAPI.openMpvDirect(playUrl);

                if (res?.success) {
                    console.log('[Realm] MPV started successfully');
                } else {
                    console.error('[Realm] MPV failed:', res?.message);
                    showNotification(res?.message || 'MPV not installed. Please install mpv: sudo apt install mpv', 'error');
                }
            }
        } catch (error) {
            console.error('[Realm] Error launching player:', error);
            showNotification('Failed to launch player: ' + error.message, 'error');
        }
    }

    // ---- Manga functionality ----
    let mangaList = [];
    let currentManga = null;
    let mangaOffset = 0;
    let mangaIsLoading = false;
    let mangaHasMore = true;
    let mangaIsSearching = false;
    let mangaSearchQuery = '';

    async function initializeManga() {
        const mangaSearchInput = document.getElementById('mangaSearchInput');
        const mangaGrid = document.getElementById('mangaGrid');
        const mangaLoadingIndicator = document.getElementById('mangaLoadingIndicator');
        const mangaDetailsModal = document.getElementById('mangaDetailsModal');
        const mangaDetailsClose = document.getElementById('mangaDetailsClose');
        const mangaReaderPage = document.getElementById('manga-reader-page');
        const mangaReaderBack = document.getElementById('mangaReaderBack');

        let searchTimeout = null;

        // Load trending manga on init
        loadTrendingManga();

        // Setup infinite scroll
        setupMangaInfiniteScroll();

        // Search functionality
        mangaSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = mangaSearchInput.value.trim();

            if (!query) {
                mangaIsSearching = false;
                mangaSearchQuery = '';
                mangaOffset = 0;
                mangaHasMore = true;
                loadTrendingManga();
                return;
            }

            searchTimeout = setTimeout(() => {
                searchManga(query);
            }, 500);
        });

        mangaSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = mangaSearchInput.value.trim();
                if (query) {
                    clearTimeout(searchTimeout);
                    searchManga(query);
                }
            }
        });

        // Close details modal
        mangaDetailsClose.addEventListener('click', () => {
            mangaDetailsModal.style.display = 'none';
        });

        // Back from reader
        mangaReaderBack.addEventListener('click', () => {
            mangaReaderPage.style.display = 'none';
            document.getElementById('manga-page').style.display = '';
        });

        // Add hover effect for back button
        mangaReaderBack.addEventListener('mouseenter', () => {
            mangaReaderBack.style.transform = 'scale(1.05)';
        });
        mangaReaderBack.addEventListener('mouseleave', () => {
            mangaReaderBack.style.transform = 'scale(1)';
        });

        function setupMangaInfiniteScroll() {
            const mainElement = document.querySelector('main');
            const mangaPage = document.getElementById('manga-page');

            mainElement.addEventListener('scroll', () => {
                // Only trigger if manga page is visible
                if (mangaPage.style.display === 'none') return;
                if (mangaIsLoading || !mangaHasMore) return;

                const scrollHeight = mainElement.scrollHeight;
                const scrollTop = mainElement.scrollTop;
                const clientHeight = mainElement.clientHeight;

                // Load more when user is 500px from bottom
                if (scrollHeight - scrollTop - clientHeight < 500) {
                    if (mangaIsSearching) {
                        searchManga(mangaSearchQuery, true); // true = append
                    } else {
                        loadTrendingManga(true); // true = append
                    }
                }
            });
        }

        async function loadTrendingManga(append = false) {
            if (mangaIsLoading) return;

            mangaIsLoading = true;
            mangaLoadingIndicator.style.display = 'block';

            if (!append) {
                mangaGrid.innerHTML = '';
                mangaOffset = 1;
                mangaHasMore = true;
            }

            try {
                const response = await fetch(`http://localhost:6987/api/manga/all?page=${mangaOffset}`);
                const data = await response.json();

                if (data.success && data.data) {
                    if (append) {
                        mangaList = [...mangaList, ...data.data];
                    } else {
                        mangaList = data.data;
                    }

                    displayManga(data.data, append);

                    // Update pagination
                    mangaOffset += 1;
                    mangaHasMore = data.count >= 20; // If we got 20 or more, likely more results
                }
            } catch (error) {
                console.error('Error loading trending manga:', error);
                if (!append) {
                    mangaGrid.innerHTML = '<p style="text-align: center; color: var(--gray); grid-column: 1 / -1;">Failed to load manga. Please try again.</p>';
                }
            } finally {
                mangaLoadingIndicator.style.display = 'none';
                mangaIsLoading = false;
            }
        }

        async function searchManga(query, append = false) {
            if (mangaIsLoading) return;

            mangaIsLoading = true;
            mangaLoadingIndicator.style.display = 'block';
            mangaIsSearching = true;
            mangaSearchQuery = query;

            if (!append) {
                mangaGrid.innerHTML = '';
                mangaOffset = 1;
                mangaHasMore = true;
            }

            try {
                const response = await fetch(`http://localhost:6987/api/manga/search?q=${encodeURIComponent(query)}`);
                const data = await response.json();

                if (data.success && data.data) {
                    if (append) {
                        mangaList = [...mangaList, ...data.data];
                    } else {
                        mangaList = data.data;
                    }

                    if (!append && mangaList.length === 0) {
                        mangaGrid.innerHTML = '<p style="text-align: center; color: var(--gray); grid-column: 1 / -1;">No manga found.</p>';
                    } else {
                        displayManga(data.data, append);
                    }

                    // Update pagination
                    mangaOffset += 1;
                    mangaHasMore = data.count >= 20;
                }
            } catch (error) {
                console.error('Error searching manga:', error);
                if (!append) {
                    mangaGrid.innerHTML = '<p style="text-align: center; color: var(--gray); grid-column: 1 / -1;">Search failed. Please try again.</p>';
                }
            } finally {
                mangaLoadingIndicator.style.display = 'none';
                mangaIsLoading = false;
            }
        }

        function displayManga(mangaArray, append = false) {
            if (!append) {
                mangaGrid.innerHTML = '';
            }

            mangaArray.forEach(manga => {
                const title = manga.name || 'Unknown Title';
                const coverUrl = manga.poster || '';

                const card = document.createElement('div');
                card.className = 'movie-card';
                card.style.cursor = 'pointer';

                card.innerHTML = `
                        <img src="${coverUrl || 'https://via.placeholder.com/256x384?text=No+Cover'}" alt="${title}" class="movie-poster" style="object-fit: cover;">
                        <div class="movie-info">
                            <h3 class="movie-title">${title}</h3>
                            <p class="movie-year">Manga</p>
                        </div>
                        <div class="movie-rating" style="background: #ec4899;">
                            <i class="fas fa-book"></i> Read
                        </div>
                    `;

                card.addEventListener('click', () => showMangaDetails(manga));
                mangaGrid.appendChild(card);
            });
        }

        async function showMangaDetails(manga) {
            currentManga = manga;
            const title = manga.name || 'Unknown Title';
            const description = 'Tap to read';
            const author = 'WeebCentral';
            const coverUrl = manga.poster || '';

            document.getElementById('mangaDetailsTitle').textContent = title;
            document.getElementById('mangaDetailsAuthor').textContent = `Source: ${author}`;
            document.getElementById('mangaDetailsStatus').textContent = `Series ID: ${manga.seriesId}`;
            document.getElementById('mangaDetailsDescription').textContent = description;
            document.getElementById('mangaDetailsCover').src = coverUrl || 'https://via.placeholder.com/300x450?text=No+Cover';

            // Clear tags
            const tagsContainer = document.getElementById('mangaDetailsTags');
            tagsContainer.innerHTML = '';

            // Load chapters
            await loadMangaChapters(manga.seriesId, manga.latestChapterId);

            mangaDetailsModal.style.display = 'block';
        }

        async function loadMangaChapters(seriesId, latestChapterId) {
            const chaptersList = document.getElementById('mangaChaptersList');
            chaptersList.innerHTML = '<p style="text-align: center; color: white; grid-column: 1 / -1;">Loading chapters...</p>';

            try {
                const response = await fetch(`http://localhost:6987/api/manga/chapters?seriesId=${encodeURIComponent(seriesId)}&latestChapterId=${encodeURIComponent(latestChapterId || 'latest')}`);
                const data = await response.json();

                if (data.success && data.data && data.data.length > 0) {
                    chaptersList.innerHTML = '';

                    data.data.forEach(chapter => {
                        const chapterNum = chapter.name || '?';
                        const chapterId = chapter.id;

                        const chapterCard = document.createElement('div');
                        chapterCard.style.cssText = 'background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; cursor: pointer; transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); border: 1px solid rgba(236, 72, 153, 0.3);';

                        chapterCard.innerHTML = `
                                <div style="font-weight: 600; color: #ec4899; margin-bottom: 0.25rem;">${chapterNum}</div>
                                <div style="font-size: 0.85rem; color: #9ca3af;">Click to read</div>
                            `;

                        chapterCard.addEventListener('mouseenter', () => {
                            chapterCard.style.background = 'rgba(236, 72, 153, 0.2)';
                            chapterCard.style.transform = 'translateX(4px)';
                        });

                        chapterCard.addEventListener('mouseleave', () => {
                            chapterCard.style.background = 'rgba(255,255,255,0.1)';
                            chapterCard.style.transform = 'translateX(0)';
                        });

                        chapterCard.addEventListener('click', async () => {
                            readChapter(chapterId, chapterNum);
                        });

                        chaptersList.appendChild(chapterCard);
                    });
                } else {
                    chaptersList.innerHTML = '<p style="text-align: center; color: white; grid-column: 1 / -1;">No chapters available.</p>';
                }
            } catch (error) {
                console.error('Error loading chapters:', error);
                chaptersList.innerHTML = '<p style="text-align: center; color: white; grid-column: 1 / -1;">Failed to load chapters.</p>';
            }
        }

        async function readChapter(chapterId, chapterTitle) {
            // Hide details modal and manga page
            mangaDetailsModal.style.display = 'none';
            document.getElementById('manga-page').style.display = 'none';

            // Show reader page
            mangaReaderPage.style.display = 'block';
            document.getElementById('mangaReaderTitle').textContent = chapterTitle;
            document.getElementById('mangaReaderPages').innerHTML = '';
            document.getElementById('mangaReaderLoading').style.display = 'block';

            try {
                // Get chapter pages using streaming NDJSON API
                const response = await fetch(`http://localhost:6987/api/chapter/pages?chapterId=${encodeURIComponent(chapterId)}`);

                if (!response.ok) {
                    throw new Error('Failed to load chapter');
                }

                document.getElementById('mangaReaderLoading').style.display = 'none';
                const pagesContainer = document.getElementById('mangaReaderPages');

                // Stream NDJSON response line by line
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep last incomplete line

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        try {
                            const data = JSON.parse(line);
                            if (data.type === 'page') {
                                const img = document.createElement('img');
                                img.src = data.url;
                                img.alt = `Page ${data.number}`;
                                img.style.cssText = 'width: 100%; height: auto; margin-bottom: 0.5rem; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);';
                                img.loading = 'lazy';

                                pagesContainer.appendChild(img);
                            } else if (data.type === 'complete') {
                                console.log(`Chapter loaded: ${data.totalPages} pages`);
                            }
                        } catch (e) {
                            console.error('Error parsing NDJSON line:', e);
                        }
                    }
                }
            } catch (error) {
                console.error('Error reading chapter:', error);
                document.getElementById('mangaReaderLoading').innerHTML = '<p style="color: #ef4444;">Failed to load chapter. Please try again.</p>';
            }
        }
    }

    // ========== COMICS FUNCTIONALITY ==========

    let comicsCurrentPage = 1;
    let comicsIsLoading = false;
    let comicsHasMore = true;
    let comicsIsSearchMode = false;
    let comicsCurrentView = 'browse'; // browse, issues, reader
    let comicsCurrentComic = null;
    let comicsActiveEventSource = null; // Track active streaming connection
    let comicsPageActive = false; // Track if comics page is currently active

    function stopComicsActiveStream() {
        if (comicsActiveEventSource) {
            console.log('Closing active comics stream connection');
            comicsActiveEventSource.close();
            comicsActiveEventSource = null;
        }
    }

    function showComicsView(view) {
        comicsCurrentView = view;
        const comicsContainer = document.getElementById('comics-container');
        const comicsIssuesContainer = document.getElementById('comics-issues-container');
        const comicsReaderContainer = document.getElementById('comics-reader-container');
        const comicsLoadingDiv = document.getElementById('comics-loading');
        const comicsBackBtn = document.getElementById('comics-back-btn');
        const comicsLoadMoreContainer = document.getElementById('comics-load-more-container');

        if (comicsContainer) comicsContainer.style.display = view === 'browse' ? 'grid' : 'none';
        if (comicsIssuesContainer) comicsIssuesContainer.style.display = view === 'issues' ? 'block' : 'none';
        if (comicsReaderContainer) comicsReaderContainer.style.display = view === 'reader' ? 'block' : 'none';
        if (comicsLoadingDiv) comicsLoadingDiv.style.display = view === 'browse' ? 'block' : 'none';
        if (comicsBackBtn) comicsBackBtn.style.display = view !== 'browse' ? 'inline-block' : 'none';
        if (comicsLoadMoreContainer) comicsLoadMoreContainer.style.display = view === 'browse' ? 'block' : 'none';
    }

    async function searchComicsNew(query) {
        if (!query.trim()) return;

        const comicsContainer = document.getElementById('comics-container');
        const comicsLoadingDiv = document.getElementById('comics-loading');
        const comicsBrowseBtn = document.getElementById('comics-browse-btn');

        comicsIsSearchMode = true;
        comicsIsLoading = true;
        comicsHasMore = false;
        if (comicsContainer) comicsContainer.innerHTML = '';
        if (comicsLoadingDiv) {
            comicsLoadingDiv.style.display = 'block';
            comicsLoadingDiv.textContent = 'Searching...';
        }
        if (comicsBrowseBtn) comicsBrowseBtn.style.display = 'inline-block';
        showComicsView('browse');

        try {
            const response = await fetch(`http://localhost:6987/api/comics/search/${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.success && data.comics.length > 0) {
                data.comics.forEach(comic => {
                    addComicToGrid(comic);
                });
                comicsLoadingDiv.textContent = `Found ${data.count} results for "${query}"`;
            } else {
                comicsLoadingDiv.innerHTML = `<div style="color: #ff4444;">No comics found for "${query}"</div>`;
            }
        } catch (error) {
            console.error('Error searching comics:', error);
            comicsLoadingDiv.innerHTML = '<div style="color: #ff4444;">Error searching comics. Please try again.</div>';
        } finally {
            comicsIsLoading = false;
        }
    }

    function addComicToGrid(comic) {
        const comicDiv = document.createElement('div');
        comicDiv.className = 'movie-card';
        comicDiv.style.cssText = 'background: var(--card-bg); border-radius: 12px; overflow: hidden; transition: all 0.3s ease; cursor: pointer; border: 1px solid rgba(249, 115, 22, 0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3);';

        comicDiv.innerHTML = `
                <img src="${comic.poster}" alt="${comic.title}" style="width: 100%; height: 300px; object-fit: cover; display: block;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                <div style="padding: 15px; font-size: 14px; font-weight: bold; text-align: center; min-height: 60px; display: flex; align-items: center; justify-content: center; color: var(--light);">${comic.title}</div>
            `;

        comicDiv.onmouseover = () => {
            comicDiv.style.transform = 'translateY(-8px)';
            comicDiv.style.borderColor = '#f97316';
            comicDiv.style.boxShadow = '0 8px 24px rgba(249, 115, 22, 0.4)';
        };
        comicDiv.onmouseout = () => {
            comicDiv.style.transform = 'translateY(0)';
            comicDiv.style.borderColor = 'rgba(249, 115, 22, 0.2)';
            comicDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        };

        comicDiv.onclick = () => {
            if (comic.link) {
                const slug = comic.link.replace('https://readcomiconline.li/Comic/', '');
                loadComicsIssues(slug, comic.title);
            }
        };

        const comicsContainer = document.getElementById('comics-container');
        if (comicsContainer) comicsContainer.appendChild(comicDiv);
    }

    async function loadComicsIssues(slug, title) {
        comicsCurrentComic = { slug, title };
        const comicsIssuesContainer = document.getElementById('comics-issues-container');
        if (comicsIssuesContainer) comicsIssuesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading issues...</div>';
        showComicsView('issues');

        try {
            const response = await fetch(`http://localhost:6987/api/comics/issues/${slug}`);
            const data = await response.json();

            comicsIssuesContainer.innerHTML = '';

            if (data.success && data.issues.length > 0) {
                const titleDiv = document.createElement('h2');
                titleDiv.textContent = title;
                titleDiv.style.cssText = 'margin-bottom: 20px; text-align: center; color: #fff;';
                comicsIssuesContainer.appendChild(titleDiv);

                data.issues.forEach(issue => {
                    const issueDiv = document.createElement('div');
                    issueDiv.style.cssText = 'background: var(--card-bg); border-radius: 10px; padding: 15px 20px; margin-bottom: 10px; cursor: pointer; transition: all 0.3s ease; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(249, 115, 22, 0.2);';

                    issueDiv.innerHTML = `
                            <div style="font-weight: bold; flex: 1; color: var(--light);">${issue.title}</div>
                            <div style="color: #9ca3af; font-size: 14px;">${issue.date}</div>
                        `;

                    issueDiv.onmouseover = () => {
                        issueDiv.style.background = 'rgba(249, 115, 22, 0.15)';
                        issueDiv.style.borderColor = '#f97316';
                        issueDiv.style.transform = 'translateX(8px)';
                    };
                    issueDiv.onmouseout = () => {
                        issueDiv.style.background = 'var(--card-bg)';
                        issueDiv.style.borderColor = 'rgba(249, 115, 22, 0.2)';
                        issueDiv.style.transform = 'translateX(0)';
                    };
                    issueDiv.onclick = () => loadComicsPages(issue.link, issue.title);

                    comicsIssuesContainer.appendChild(issueDiv);
                });
            } else {
                comicsIssuesContainer.innerHTML = '<div style="color: #ff4444; text-align: center;">No issues found</div>';
            }
        } catch (error) {
            console.error('Error loading issues:', error);
            comicsIssuesContainer.innerHTML = '<div style="color: #ff4444; text-align: center;">Error loading issues. Please try again.</div>';
        }
    }

    async function loadComicsPages(issueLink, issueTitle) {
        // Stop any existing stream before starting a new one
        stopComicsActiveStream();

        const comicsReaderContainer = document.getElementById('comics-reader-container');
        if (comicsReaderContainer) comicsReaderContainer.innerHTML = `
                <h2 style="text-align:center;margin-bottom:20px;color:#fff;">${issueTitle}</h2>
                
                <!-- Keyboard Navigation Hint -->
                <div style="position: fixed; right: 2rem; top: 50%; transform: translateY(-50%); z-index: 900; background: rgba(0,0,0,0.85); padding: 1.5rem; border-radius: 12px; color: white; font-size: 0.95rem; text-align: center; backdrop-filter: blur(10px); box-shadow: 0 8px 24px rgba(0,0,0,0.5); border: 1px solid rgba(249, 115, 22, 0.3); max-width: 140px;">
                    <i class="fas fa-keyboard" style="font-size: 2rem; margin-bottom: 0.75rem; display: block; color: #f97316;"></i>
                    <p style="margin: 0; line-height: 1.5; font-weight: 600;">Use Arrow Keys<br>to Scroll</p>
                    <div style="margin-top: 1rem; font-size: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                        <div style="color: #f97316;"><i class="fas fa-arrow-up"></i> Up</div>
                        <div style="color: #f97316;"><i class="fas fa-arrow-down"></i> Down</div>
                    </div>
                </div>
                
                <div id="comics-page-loader" style="text-align: center; padding: 20px; color: #888;">Connecting...</div>
            `;
        showComicsView('reader');

        try {
            // Use EventSource for streaming
            comicsActiveEventSource = new EventSource(`http://localhost:6987/api/comics/read-stream?link=${encodeURIComponent(issueLink)}`);

            let pageCount = 0;
            const loaderDiv = document.getElementById('comics-page-loader');

            comicsActiveEventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'total') {
                    if (loaderDiv) loaderDiv.textContent = `Loading 0/${data.count} pages...`;
                } else if (data.type === 'page') {
                    pageCount++;
                    if (loaderDiv) loaderDiv.textContent = `Loading ${pageCount}...`;

                    // Add the image immediately
                    const img = document.createElement('img');
                    img.style.cssText = 'width: 100%; margin-bottom: 10px; border-radius: 8px;';
                    img.src = `http://localhost:6987/api/proxy-image?url=${encodeURIComponent(data.url)}`;
                    img.alt = `Page ${data.pageNumber}`;
                    img.loading = 'lazy';

                    img.onerror = () => {
                        console.error(`Failed to load page ${data.pageNumber}: ${data.url}`);
                        img.style.display = 'none';
                    };

                    comicsReaderContainer.appendChild(img);
                } else if (data.type === 'done') {
                    if (loaderDiv) {
                        loaderDiv.textContent = `Loaded ${pageCount} pages`;
                        setTimeout(() => {
                            if (loaderDiv && loaderDiv.parentNode) loaderDiv.remove();
                        }, 2000);
                    }
                    stopComicsActiveStream();
                } else if (data.type === 'error') {
                    if (loaderDiv) loaderDiv.remove();
                    comicsReaderContainer.innerHTML += `<div style="color: #ff4444; text-align: center;">Error: ${data.message}</div>`;
                    stopComicsActiveStream();
                }
            };

            comicsActiveEventSource.onerror = (error) => {
                console.error('EventSource error:', error);
                stopComicsActiveStream();
                const loaderDiv = document.getElementById('comics-page-loader');
                if (loaderDiv) {
                    loaderDiv.remove();
                    comicsReaderContainer.innerHTML += '<div style="color: #ff4444; text-align: center;">Connection error. Please try again.</div>';
                }
            };

        } catch (error) {
            console.error('Error loading pages:', error);
            const loaderDiv = document.getElementById('comics-page-loader');
            if (loaderDiv) loaderDiv.remove();
            comicsReaderContainer.innerHTML += '<div style="color: #ff4444; text-align: center;">Error loading pages. Please try again.</div>';
        }
    }

    async function loadComicsAll(page) {
        if (comicsIsLoading || !comicsHasMore || comicsIsSearchMode) {
            console.log('[COMICS] loadComicsAll blocked:', { comicsIsLoading, comicsHasMore, comicsIsSearchMode });
            return;
        }

        const comicsLoadingDiv = document.getElementById('comics-loading');
        if (!comicsLoadingDiv) {
            console.log('[COMICS] comics-loading div not found');
            return;
        }

        console.log('[COMICS] Loading comics page:', page);
        comicsIsLoading = true;
        comicsLoadingDiv.style.display = 'block';

        try {
            const response = await fetch(`http://localhost:6987/api/comics/all?page=${page}`);
            const data = await response.json();

            console.log('[COMICS] Comics response:', data.success, 'comics count:', data.comics?.length);

            if (data.success && data.comics.length > 0) {
                data.comics.forEach(comic => {
                    addComicToGrid(comic);
                });

                comicsCurrentPage++;
                console.log('[COMICS] Comics loaded, next page will be:', comicsCurrentPage);
            } else {
                comicsHasMore = false;
                comicsLoadingDiv.textContent = 'No more comics to load';
                console.log('[COMICS] No more comics available');
            }
        } catch (error) {
            console.error('[COMICS] Error loading comics:', error);
            comicsLoadingDiv.innerHTML = '<div style="color: #ff4444;">Error loading comics. Please try again.</div>';
        } finally {
            comicsIsLoading = false;
            if (comicsHasMore) {
                comicsLoadingDiv.style.display = 'none';
            }

            // Update load more button visibility
            const loadMoreContainer = document.getElementById('comics-load-more-container');
            const loadMoreBtn = document.getElementById('comics-load-more-btn');
            if (loadMoreContainer) {
                loadMoreContainer.style.display = comicsHasMore && !comicsIsSearchMode ? 'block' : 'none';
            }
        }
    }

    // Infinite scroll functionality for comics
    function handleComicsScroll() {
        console.log('[COMICS SCROLL HANDLER] Called! Active:', comicsPageActive, 'View:', comicsCurrentView);

        // Only work if comics page is active and in browse mode
        if (!comicsPageActive) {
            console.log('[COMICS SCROLL HANDLER] Blocked - page not active');
            return;
        }
        if (comicsCurrentView !== 'browse') {
            console.log('[COMICS SCROLL HANDLER] Blocked - not in browse view');
            return;
        }

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;

        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

        console.log('[COMICS SCROLL HANDLER] Scroll info:', {
            scrollTop,
            scrollHeight,
            clientHeight,
            distanceFromBottom
        });

        // Load more when user is near bottom (within 300px)
        if (distanceFromBottom <= 300) {
            console.log('[COMICS SCROLL] Near bottom! Distance:', distanceFromBottom, 'Loading page:', comicsCurrentPage);
            loadComicsAll(comicsCurrentPage);
        }
    }

    // Throttle scroll event for comics
    let comicsScrollTimeout;
    let lastScrollLog = 0;
    window.addEventListener('scroll', () => {
        // Log occasionally for debugging (every 1 second max)
        const now = Date.now();
        if (now - lastScrollLog > 1000) {
            console.log('[COMICS SCROLL EVENT] Fired. Active:', comicsPageActive, 'View:', comicsCurrentView);
            lastScrollLog = now;
        }

        if (comicsScrollTimeout) {
            clearTimeout(comicsScrollTimeout);
        }
        comicsScrollTimeout = setTimeout(handleComicsScroll, 100);
    });

    // Search functionality - search on input with debounce
    let comicsSearchDebounce = null;
    const comicsSearchInput = document.getElementById('comics-search-input');
    if (comicsSearchInput) {
        comicsSearchInput.addEventListener('input', () => {
            clearTimeout(comicsSearchDebounce);
            const query = comicsSearchInput.value.trim();

            if (!query) {
                // If search is cleared, go back to browse mode
                const comicsContainer = document.getElementById('comics-container');
                const comicsBrowseBtn = document.getElementById('comics-browse-btn');
                comicsIsSearchMode = false;
                comicsHasMore = true;
                comicsCurrentPage = 1;
                if (comicsContainer) comicsContainer.innerHTML = '';
                if (comicsBrowseBtn) comicsBrowseBtn.style.display = 'none';
                showComicsView('browse');
                loadComicsAll(comicsCurrentPage);
                return;
            }

            comicsSearchDebounce = setTimeout(() => {
                searchComicsNew(query);
            }, 500);
        });

        comicsSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(comicsSearchDebounce);
                const query = comicsSearchInput.value.trim();
                if (query) searchComicsNew(query);
            }
        });
    }

    // Browse all functionality
    const comicsBrowseBtn = document.getElementById('comics-browse-btn');
    if (comicsBrowseBtn) {
        comicsBrowseBtn.addEventListener('click', () => {
            const comicsContainer = document.getElementById('comics-container');
            const comicsSearchInput = document.getElementById('comics-search-input');
            comicsIsSearchMode = false;
            comicsHasMore = true;
            comicsCurrentPage = 1;
            if (comicsContainer) comicsContainer.innerHTML = '';
            comicsBrowseBtn.style.display = 'none';
            if (comicsSearchInput) comicsSearchInput.value = '';
            showComicsView('browse');
            loadComicsAll(comicsCurrentPage);
        });

        // Add hover effects for buttons
        comicsBrowseBtn.addEventListener('mouseenter', () => {
            comicsBrowseBtn.style.background = 'linear-gradient(135deg, rgba(249, 115, 22, 0.4), rgba(234, 88, 12, 0.4))';
            comicsBrowseBtn.style.transform = 'translateY(-2px)';
        });
        comicsBrowseBtn.addEventListener('mouseleave', () => {
            comicsBrowseBtn.style.background = 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.2))';
            comicsBrowseBtn.style.transform = 'translateY(0)';
        });
    }

    const comicsBackBtn = document.getElementById('comics-back-btn');
    if (comicsBackBtn) {
        comicsBackBtn.addEventListener('mouseenter', () => {
            comicsBackBtn.style.background = 'linear-gradient(135deg, rgba(249, 115, 22, 0.4), rgba(234, 88, 12, 0.4))';
            comicsBackBtn.style.transform = 'translateY(-2px)';
        });
        comicsBackBtn.addEventListener('mouseleave', () => {
            comicsBackBtn.style.background = 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.2))';
            comicsBackBtn.style.transform = 'translateY(0)';
        });

        // Back button functionality
        comicsBackBtn.addEventListener('click', () => {
            // Stop any active streaming when navigating away
            stopComicsActiveStream();

            if (comicsCurrentView === 'reader') {
                // Go back to issues
                if (comicsCurrentComic) {
                    loadComicsIssues(comicsCurrentComic.slug, comicsCurrentComic.title);
                }
            } else if (comicsCurrentView === 'issues') {
                // Go back to browse
                showComicsView('browse');
            }
        });
    }

    // Load More button functionality
    const comicsLoadMoreBtn = document.getElementById('comics-load-more-btn');
    if (comicsLoadMoreBtn) {
        comicsLoadMoreBtn.addEventListener('click', () => {
            console.log('[COMICS] Load More button clicked, loading page:', comicsCurrentPage);
            loadComicsAll(comicsCurrentPage);
        });

        comicsLoadMoreBtn.addEventListener('mouseenter', () => {
            comicsLoadMoreBtn.style.transform = 'translateY(-4px)';
            comicsLoadMoreBtn.style.boxShadow = '0 8px 24px rgba(249, 115, 22, 0.6)';
        });

        comicsLoadMoreBtn.addEventListener('mouseleave', () => {
            comicsLoadMoreBtn.style.transform = 'translateY(0)';
            comicsLoadMoreBtn.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.4)';
        });
    }

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        stopComicsActiveStream();
    });

    // Initialize comics when comics page is shown
    function initializeComics() {
        console.log('[COMICS] initializeComics called');
        comicsPageActive = true;
        console.log('[COMICS] comicsPageActive set to true');
        const comicsContainer = document.getElementById('comics-container');

        // Only load if we haven't loaded anything yet
        if (!comicsContainer) {
            console.log('[COMICS] Comics container not found');
            return;
        }

        console.log('[COMICS] Comics container found, children:', comicsContainer.children.length, 'currentPage:', comicsCurrentPage);

        // Always load if container is empty
        if (comicsContainer.children.length === 0) {
            console.log('[COMICS] Container empty - loading page 1');
            // Reset pagination
            comicsCurrentPage = 1;
            comicsHasMore = true;
            comicsIsSearchMode = false;
            showComicsView('browse');
            loadComicsAll(comicsCurrentPage);
        } else {
            console.log('[COMICS] Already has comics loaded');
        }
    }



    // Initialize the app on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', init);

    // ---- Resume helpers ----

    // ---- EPUB Reader Logic ----
    let rendition = null;
    let bookInstance = null;
    let chapterToc = null;
    let chapterSpineItems = null;
    let chapterTotal = 0;

    async function openEpubReader(localPath, title) {
        try {
            console.log('[EPUB] Opening:', localPath);
            const overlay = document.getElementById('epubReaderOverlay');
            const titleEl = document.getElementById('readerTitle');
            const container = document.getElementById('readerContainer');
            const prevBtn = document.getElementById('readerPrevBtn');
            const nextBtn = document.getElementById('readerNextBtn');

            titleEl.textContent = title || 'EPUB Reader';
            overlay.classList.add('theme-dark');
            overlay.classList.remove('theme-light', 'theme-night');
            overlay.style.display = 'flex';

            // Clear previous
            container.innerHTML = '';
            rendition = null;
            bookInstance = null;
            prevBtn.disabled = true;
            nextBtn.disabled = false;

            // Load epub.js and JSZip first
            if (!window.ePub || !window.JSZip) {
                console.log('[EPUB] Loading libraries...');

                if (!window.JSZip) {
                    const jszipScript = document.createElement('script');
                    jszipScript.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
                    await new Promise((resolve, reject) => {
                        jszipScript.onload = resolve;
                        jszipScript.onerror = reject;
                        document.head.appendChild(jszipScript);
                    });
                    console.log('[EPUB] JSZip loaded');
                }

                if (!window.ePub) {
                    const epubScript = document.createElement('script');
                    epubScript.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
                    await new Promise((resolve, reject) => {
                        epubScript.onload = resolve;
                        epubScript.onerror = reject;
                        document.head.appendChild(epubScript);
                    });
                    console.log('[EPUB] epub.js loaded');
                }
            }

            // Read the file from main
            console.log('[EPUB] Reading file...');
            const res = await window.electronAPI.readEpubFile(localPath);
            console.log('[EPUB] Read result:', res.success, res.base64 ? `${res.base64.length} bytes` : 'no data');
            if (!res.success || !res.base64) {
                alert('Failed to open book: ' + (res.message || 'Unable to read file'));
                overlay.style.display = 'none';
                return;
            }
            console.log('[EPUB] Converting to ArrayBuffer...');
            const binaryString = atob(res.base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('[EPUB] ArrayBuffer size:', bytes.length);

            console.log('[EPUB] Creating book instance...');
            bookInstance = window.ePub(bytes.buffer);

            console.log('[EPUB] Rendering to container...');
            rendition = bookInstance.renderTo(container, {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated'
            });

            // Create a unique key for this book based on its path
            const bookKey = 'epub_position_' + encodeURIComponent(localPath);

            // Wire navigation and save position on page change
            rendition.on('relocated', (location) => {
                console.log('[EPUB] Relocated:', location.atStart, location.atEnd);
                prevBtn.disabled = location.atStart;
                nextBtn.disabled = location.atEnd;

                // Save current position to localStorage
                if (location && location.start && location.start.cfi) {
                    try {
                        localStorage.setItem(bookKey, location.start.cfi);
                        console.log('[EPUB] Saved position:', location.start.cfi);
                    } catch (e) {
                        console.warn('[EPUB] Could not save position:', e);
                    }
                }
            });

            // Try to restore last position
            let restored = false;
            try {
                const savedPosition = localStorage.getItem(bookKey);
                if (savedPosition) {
                    console.log('[EPUB] Restoring position:', savedPosition);
                    await rendition.display(savedPosition);
                    restored = true;
                    console.log('[EPUB] Position restored successfully');
                }
            } catch (e) {
                console.warn('[EPUB] Could not restore position:', e);
            }

            // If no saved position or restore failed, display from beginning
            if (!restored) {
                console.log('[EPUB] Displaying from beginning...');
                await rendition.display();
            }

            console.log('[EPUB] Book opened successfully');

            // Apply initial theme/font/size
            applyReaderPrefs();

            // Initialize chapter controls (count and input range)
            await initChapterControls();
        } catch (err) {
            console.error('[EPUB] Error:', err);
            alert('Could not open the EPUB: ' + err.message);
            const overlay = document.getElementById('epubReaderOverlay');
            overlay.style.display = 'none';
        }
    }

    function closeEpubReader() {
        const overlay = document.getElementById('epubReaderOverlay');
        const settingsPanel = document.getElementById('readerSettingsPanel');
        overlay.style.display = 'none';
        settingsPanel.classList.add('hidden');
        // Cleanup
        if (rendition) { try { rendition.destroy(); } catch (_) { } }
        rendition = null;
        bookInstance = null;
        chapterToc = null;
        chapterSpineItems = null;
        chapterTotal = 0;
        const chapterControls = document.getElementById('readerChapterControls');
        if (chapterControls) chapterControls.style.display = 'none';
    }

    // Escape key to close reader
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('epubReaderOverlay');
            if (overlay && overlay.style.display === 'flex') {
                closeEpubReader();
            }
        }
    });

    // Settings handling
    function applyReaderPrefs() {
        const overlay = document.getElementById('epubReaderOverlay');
        const theme = localStorage.getItem('reader.theme') || 'dark';
        const font = localStorage.getItem('reader.font') || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
        const size = parseInt(localStorage.getItem('reader.size') || '16', 10);

        overlay.classList.remove('theme-light', 'theme-dark', 'theme-night');
        overlay.classList.add(`theme-${theme}`);

        if (rendition) {
            // Map explicit colors for the iframe
            let fg = '#f2f2f2', bg = '#202225';
            if (theme === 'light') { fg = '#111111'; bg = '#ffffff'; }
            else if (theme === 'night') { fg = '#e5e7eb'; bg = '#000000'; }

            // Register and select theme with font
            try {
                rendition.themes.register('custom', {
                    'body': {
                        'font-family': `${font} !important`,
                        'color': fg,
                        'background': bg
                    },
                    '*': {
                        'font-family': `${font} !important`
                    }
                });
            } catch (e) { console.log('[EPUB] Theme register error:', e); }
            try { rendition.themes.select('custom'); } catch (e) { console.log('[EPUB] Theme select error:', e); }
            try { rendition.themes.fontSize(`${size}px`); } catch (e) { console.log('[EPUB] Font size error:', e); }

            // Force font update
            try {
                rendition.themes.default({
                    'body': { 'font-family': `${font} !important` },
                    'p': { 'font-family': `${font} !important` },
                    'div': { 'font-family': `${font} !important` },
                    'span': { 'font-family': `${font} !important` }
                });
            } catch (e) { }
        }
    }

    // Header buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('#readerPrevBtn')) {
            if (rendition) {
                console.log('[EPUB] Going to previous page');
                rendition.prev();
            }
        }
        if (e.target.closest('#readerNextBtn')) {
            if (rendition) {
                console.log('[EPUB] Going to next page');
                rendition.next();
            }
        }
        if (e.target.closest('#readerChapterGo')) {
            const inputEl = document.getElementById('readerChapterInput');
            if (!inputEl) return;
            const val = parseInt(inputEl.value, 10);
            goToChapterIndex(val);
        }
        if (e.target.closest('#readerSettingsBtn')) {
            const panel = document.getElementById('readerSettingsPanel');
            const wasHidden = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');

            // Restore current values when opening settings
            if (wasHidden) {
                const fontSelect = document.getElementById('readerFont');
                const fontSizeInput = document.getElementById('readerFontSize');
                const currentFont = localStorage.getItem('reader.font') || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
                const currentSize = localStorage.getItem('reader.size') || '16';

                if (fontSelect) fontSelect.value = currentFont;
                if (fontSizeInput) fontSizeInput.value = currentSize;
            }

            console.log('[EPUB] Settings panel toggled:', wasHidden ? 'now visible' : 'now hidden');
        }
        if (e.target.closest('#readerBackBtn')) {
            console.log('[EPUB] Back button clicked');
            closeEpubReader();
        }
    });

    // Handle Enter key on the chapter input
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target.id === 'readerChapterInput') {
            const val = parseInt(e.target.value, 10);
            goToChapterIndex(val);
        }
    });

    // Settings controls
    document.addEventListener('click', (e) => {
        const themeBtn = e.target.closest('.theme-btn');
        if (themeBtn) {
            const theme = themeBtn.getAttribute('data-theme');
            localStorage.setItem('reader.theme', theme);
            applyReaderPrefs();
        }
    });
    document.addEventListener('input', (e) => {
        if (e.target.id === 'readerFont') {
            localStorage.setItem('reader.font', e.target.value);
            applyReaderPrefs();
        } else if (e.target.id === 'readerFontSize') {
            localStorage.setItem('reader.size', e.target.value);
            applyReaderPrefs();
        }
    });

    // Expose open function if needed elsewhere
    window.openEpubReader = openEpubReader;

    // Initialize chapter controls: compute total and prepare UI
    async function initChapterControls() {
        try {
            const controls = document.getElementById('readerChapterControls');
            const countEl = document.getElementById('readerChapterCount');
            const inputEl = document.getElementById('readerChapterInput');
            if (!controls || !countEl || !inputEl) return;

            if (!bookInstance) {
                controls.style.display = 'none';
                return;
            }

            chapterToc = null;
            chapterSpineItems = null;
            chapterTotal = 0;

            // Try to load navigation (TOC)
            try {
                const nav = await bookInstance.loaded?.navigation;
                if (nav && Array.isArray(nav.toc) && nav.toc.length > 0) {
                    chapterToc = nav.toc;
                    chapterTotal = chapterToc.length;
                }
            } catch (_) { }

            // Fallback to spine items
            if (!chapterTotal) {
                try {
                    const spine = await bookInstance.loaded?.spine;
                    if (spine && Array.isArray(spine.spineItems) && spine.spineItems.length > 0) {
                        chapterSpineItems = spine.spineItems;
                        chapterTotal = chapterSpineItems.length;
                    } else if (bookInstance.spine && Array.isArray(bookInstance.spine.spineItems) && bookInstance.spine.spineItems.length > 0) {
                        chapterSpineItems = bookInstance.spine.spineItems;
                        chapterTotal = chapterSpineItems.length;
                    }
                } catch (_) { }
            }

            if (chapterTotal > 0) {
                controls.style.display = 'flex';
                countEl.textContent = String(chapterTotal);
                inputEl.max = String(chapterTotal);
                inputEl.placeholder = `1-${chapterTotal}`;
            } else {
                controls.style.display = 'none';
            }
        } catch (e) {
            console.warn('[EPUB] Could not initialize chapter controls:', e);
        }
    }

    // Jump to a given 1-based chapter index
    async function goToChapterIndex(n) {
        const inputEl = document.getElementById('readerChapterInput');
        if (!bookInstance || !rendition || !Number.isFinite(n)) {
            if (inputEl) flashInvalid(inputEl);
            return;
        }
        const total = chapterTotal || 0;
        if (!total) {
            if (inputEl) flashInvalid(inputEl);
            return;
        }
        let idx = Math.floor(n) - 1;
        if (idx < 0 || idx >= total) {
            if (inputEl) flashInvalid(inputEl);
            return;
        }
        try {
            let targetHref = null;
            if (chapterToc && chapterToc[idx] && chapterToc[idx].href) {
                targetHref = chapterToc[idx].href;
            } else if (chapterSpineItems && chapterSpineItems[idx] && chapterSpineItems[idx].href) {
                targetHref = chapterSpineItems[idx].href;
            }
            if (targetHref) {
                await rendition.display(targetHref);
            } else {
                // As a last resort, try using the spine index directly if available
                if (typeof bookInstance.spine?.get === 'function') {
                    const item = bookInstance.spine.get(idx);
                    if (item && item.href) {
                        await rendition.display(item.href);
                        return;
                    }
                }
                throw new Error('No valid chapter target');
            }
        } catch (err) {
            console.warn('[EPUB] Failed to jump to chapter', n, err);
            if (inputEl) flashInvalid(inputEl);
        }
    }

    function flashInvalid(inputEl) {
        const orig = inputEl.style.borderColor;
        inputEl.style.borderColor = 'rgba(244,63,94,0.85)';
        setTimeout(() => { inputEl.style.borderColor = orig || 'rgba(255,255,255,0.15)'; }, 450);
    }
    async function fetchResume(key) {
        if (!key) return null;
        try {
            const r = await fetch(`${API_BASE_URL}/resume?key=${encodeURIComponent(key)}`);
            if (!r.ok) return null;
            const j = await r.json();
            if (j && typeof j.position === 'number' && j.position > 0) return j;
        } catch (_) { }
        return null;
    }
    async function saveResume() {
        if (!resumeKey || !customVideo || !isFinite(customVideo.duration) || !isFinite(customVideo.currentTime)) return;
        const pos = Math.max(0, Math.floor(customVideo.currentTime || 0));
        const dur = Math.max(0, Math.floor(customVideo.duration || 0));
        // Use TMDB title from currentContent, not the filename
        const title = (currentContent?.title || currentContent?.name || currentSelectedVideoName || '');
        if (dur === 0 || pos === 0) return;
        try {
            const payload = {
                key: resumeKey,
                position: pos,
                duration: dur,
                title
            };
            // Add poster and metadata if available from currentContent
            if (currentContent) {
                if (currentContent.poster_path) payload.poster_path = currentContent.poster_path;
                if (currentContent.id) payload.tmdb_id = currentContent.id;
                if (currentMediaType) payload.media_type = currentMediaType;
                // Add season/episode for TV shows
                if (currentMediaType === 'tv' && typeof currentSeason !== 'undefined') {
                    payload.season = currentSeason;
                    if (typeof currentEpisode !== 'undefined') payload.episode = currentEpisode;
                }
            }
            await fetch(`${API_BASE_URL}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } catch (_) { }
    }
    function saveResumeThrottled(immediate = false) {
        const now = Date.now();
        if (immediate || now - lastResumeSend > 2500) {
            lastResumeSend = now;
            clearTimeout(resumeTimer);
            resumeTimer = null;
            saveResume();
            return;
        }
        if (!resumeTimer) {
            resumeTimer = setTimeout(() => { lastResumeSend = Date.now(); saveResume(); resumeTimer = null; }, 1500);
        }
    }
    try {
        customVideo.addEventListener('ended', async () => {
            if (resumeKey) {
                try { await fetch(`${API_BASE_URL}/resume?key=${encodeURIComponent(resumeKey)}`, { method: 'DELETE' }); } catch (_) { }
            }
        });
    } catch (_) { }

    // Continue Watching functionality
    async function loadContinueWatching() {
        try {
            const response = await fetch(`${API_BASE_URL}/resume/all`);
            if (!response.ok) return;

            const items = await response.json();
            if (!Array.isArray(items) || items.length === 0) {
                // Hide section if no items
                document.getElementById('continueWatchingSection').style.display = 'none';
                return;
            }

            // Show section
            document.getElementById('continueWatchingSection').style.display = 'block';

            // Render items
            const slider = document.getElementById('continueWatchingSlider');
            slider.innerHTML = '';

            for (const item of items) {
                if (!item.title || !item.key) continue;

                const card = document.createElement('div');
                card.className = 'movie-card continue-watching-card';
                card.dataset.resumeKey = item.key;

                const progress = item.duration > 0 ? ((item.position / item.duration) * 100).toFixed(1) : 0;

                // For TV shows, show season; for movies, show time left
                let subtitleText = '';
                if (item.media_type === 'tv' && item.season) {
                    subtitleText = `Season ${item.season}`;
                } else {
                    const timeLeft = item.duration > 0 ? formatTime(item.duration - item.position) : '';
                    subtitleText = timeLeft ? `${timeLeft} left` : '';
                }

                // Use poster if available, otherwise show placeholder
                const posterHTML = item.poster_path
                    ? `<img loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${item.title.replace(/'/g, "\\'")}">`
                    : `<div class="continue-watching-placeholder">
                            <i class="fas fa-play-circle"></i>
                           </div>`;

                card.innerHTML = `
                        <button class="remove-continue-btn" onclick="removeContinueWatching(event, '${item.key.replace(/'/g, "\\'")}')">
                            <i class="fas fa-times"></i>
                        </button>
                        <div class="movie-poster">
                            ${posterHTML}
                            <div class="continue-watching-progress" style="width: ${progress}%"></div>
                        </div>
                        <div class="movie-info">
                            <h3 class="movie-title">${item.title}</h3>
                            <p class="movie-year">${subtitleText}</p>
                        </div>
                        <div class="movie-rating">
                            <i class="fas fa-clock"></i> ${progress}%
                        </div>
                    `;

                // Click handler - open details modal directly like trending cards do
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.remove-continue-btn')) return;

                    if (item.tmdb_id && item.media_type) {
                        // Create a movie object compatible with openDetailsModal
                        const movieObj = {
                            id: item.tmdb_id,
                            title: item.title,
                            name: item.title,
                            poster_path: item.poster_path,
                            media_type: item.media_type
                        };
                        openDetailsModal(movieObj, item.media_type);
                    } else {
                        showNotification('Details not available for this item (missing metadata). Try watching it again to update.', 'info', 4000);
                    }
                });

                slider.appendChild(card);
            }

        } catch (error) {
            console.error('[Continue Watching] Load error:', error);
            document.getElementById('continueWatchingSection').style.display = 'none';
        }
    }

    async function removeContinueWatching(event, key) {
        event.stopPropagation();

        try {
            const response = await fetch(`${API_BASE_URL}/resume?key=${encodeURIComponent(key)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Remove card from DOM
                const card = document.querySelector(`[data-resume-key="${key}"]`);
                if (card) {
                    card.style.transition = 'opacity 0.3s, transform 0.3s';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.remove();
                        // Check if any cards left
                        const slider = document.getElementById('continueWatchingSlider');
                        if (slider.children.length === 0) {
                            document.getElementById('continueWatchingSection').style.display = 'none';
                        }
                    }, 300);
                }
                showNotification('Removed from Continue Watching', 'success');
            } else {
                showNotification('Failed to remove item', 'error');
            }
        } catch (error) {
            console.error('[Continue Watching] Remove error:', error);
            showNotification('Failed to remove item', 'error');
        }
    }

    function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${s}s`;
    }

    // Hook version notice (v1.6.3) from main
    try {
        if (window.electronAPI?.onVersionNotice163) {
            window.electronAPI.onVersionNotice163(() => {
                showVersion163Modal();
            });
        }
    } catch (_) { }

    // ---- Updater overlay wiring (non-intrusive) ----
    try {
        const overlay = document.getElementById('updateOverlay');
        const icon = document.getElementById('updateStatusIcon');
        const text = document.getElementById('updateStatusText');
        const bar = document.getElementById('updateProgressBar');
        const pct = document.getElementById('updatePercent');
        const restartBtn = document.getElementById('updateRestartBtn');

        function showOverlay() {
            if (overlay) overlay.style.display = 'flex';
            document.body && (document.body.style.overflow = 'hidden');
        }
        function hideOverlay() {
            if (overlay) overlay.style.display = 'none';
            document.body && (document.body.style.overflow = 'auto');
        }

        if (window.electronAPI) {
            // When update check starts, show longer notification
            window.electronAPI.onUpdateChecking?.((_info) => {
                console.log('[Update] Checking for updates...');
                showNotification('🔍 Checking for updates...', 'info', 5000); // Show for 5 seconds
            });

            // When no update is available, show longer notification
            window.electronAPI.onUpdateNotAvailable?.((_info) => {
                console.log('[Update] App is up to date');
                showNotification('✅ App is up to date', 'success', 4000); // Show for 4 seconds
            });

            // When update becomes available, show persistent overlay and notification
            window.electronAPI.onUpdateAvailable?.((_info) => {
                console.log('[Update] Update available:', _info);

                // macOS: Show simple notification ONLY, don't show progress overlay or download anything
                if (_info?.manual || _info?.platform === 'darwin') {
                    const downloadUrl = _info?.downloadUrl || 'https://github.com/ayman707-ux/PlayTorrio/releases/latest';
                    showNotification(`🎉 Update ${_info?.version || ''} available! Please download the new DMG from GitHub.`, 'info', 10000);
                    console.log('[Update] macOS: Manual download required. URL:', downloadUrl);
                    // Do NOT show progress overlay on macOS
                    return;
                }

                // Windows/Linux ONLY: Show progress overlay
                console.log('[Update] Showing download progress overlay');
                showOverlay();
                if (icon) { icon.className = 'fas fa-download'; icon.style.animation = 'pulse 1.5s ease-in-out infinite'; icon.style.color = '#a855f7'; }
                if (text) text.textContent = 'Update found! Download starting, please wait...';
                if (bar) bar.style.width = '0%';
                if (pct) pct.textContent = '0%';
                if (restartBtn) restartBtn.style.display = 'none';

                const warningText = document.getElementById('updateWarningText');
                if (warningText) warningText.textContent = '⚠️ Downloading update - please keep the app open';

                // Show persistent download notification that stays until completion
                showPersistentDownloadNotification(0);
            });

            // Progress updates - keep overlay visible throughout download
            window.electronAPI.onUpdateProgress?.((p) => {
                console.log('[Update] Download progress:', p?.percent + '%');
                const percent = Math.max(0, Math.min(100, Math.round(p?.percent || 0)));
                if (bar) bar.style.width = percent + '%';
                if (pct) pct.textContent = percent + '%';
                if (text) text.textContent = `Downloading update... ${percent}% complete`;
                if (icon) { icon.className = 'fas fa-download'; icon.style.animation = 'pulse 1.5s ease-in-out infinite'; }
                updatePersistentDownloadNotification(percent);

                // Optional: throttle additional toasts if desired; persistent notif covers it
            });

            // Download finished - keep overlay visible and show persistent restart notification
            window.electronAPI.onUpdateDownloaded?.((_info) => {
                console.log('[Update] Download completed, ready to install');
                // Switch from download notification to restart-ready notification
                hideUpdateNotification();
                if (icon) { icon.className = 'fas fa-check-circle'; icon.style.animation = 'none'; icon.style.color = '#22c55e'; }
                if (text) text.textContent = 'Update downloaded successfully! Click "Restart Now" to complete the update.';
                if (bar) bar.style.width = '100%';
                if (pct) pct.textContent = '100%';
                if (restartBtn) restartBtn.style.display = 'inline-flex';

                const warningText = document.getElementById('updateWarningText');
                if (warningText) warningText.textContent = '✅ Update ready! You can restart the app anytime to apply the update';

                const closeBtn = document.getElementById('updateCloseBtn');
                if (closeBtn) closeBtn.style.display = 'flex';

                // Show persistent restart notification that stays until user restarts
                showPersistentUpdateNotification();
            });

            // Restart button
            restartBtn?.addEventListener('click', async (ev) => {
                try {
                    ev.stopPropagation?.();
                    // Visual feedback: disable button and show restarting state
                    restartBtn.disabled = true;
                    const originalHtml = restartBtn.innerHTML;
                    restartBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Restarting...';
                    restartBtn.style.opacity = '0.85';

                    // Trigger updater installation (main will relaunch automatically)
                    const res = await window.electronAPI.installUpdateNow?.();
                    // Optionally hide the notification right after invoking install
                    // (App should quit almost immediately.)
                    setTimeout(() => { try { hideUpdateNotification(); } catch (_) { } }, 200);

                    // If for some reason it didn't return success, keep overlay visible
                    if (!res || res.success !== true) {
                        restartBtn.disabled = false;
                        restartBtn.innerHTML = originalHtml;
                        restartBtn.style.opacity = '1';
                        showNotification('Update install failed to start. Please try again.', 'error', 4000);
                    }
                } catch (e) {
                    // Restore button and keep the overlay so user can retry
                    try {
                        restartBtn.disabled = false;
                        restartBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Restart Now to Complete Update';
                        restartBtn.style.opacity = '1';
                    } catch (_) { }
                    showNotification('Could not trigger restart. Please try again.', 'error', 4000);
                }
            });
        }

        // Offline/Online UX: show a small banner so users know they can access offline music
        try {
            const notifyOffline = () => showNotification('You are offline. Offline Music Library is available.', 'warning', 5000);
            const notifyOnline = () => showNotification('Back online.', 'success', 3000);
            if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                notifyOffline();
            }
            window.addEventListener('offline', notifyOffline);
            window.addEventListener('online', notifyOnline);
        } catch (_) { }
    } catch (_) { }

    // ---- My List functionality ----
    // Note: myListCache is declared at top-level scope

    async function loadMyList() {
        try {
            const response = (await StorageService.getObject('my-list')) || [];
            if (response.success) {
                const rawData = response.data || [];

                // Deduplicate: Keep only unique items based on id + media_type combination
                const seen = new Map();
                const deduplicated = [];

                for (const item of rawData) {
                    const key = `${item.id}_${item.media_type}`;
                    if (!seen.has(key)) {
                        seen.set(key, true);
                        deduplicated.push(item);
                    }
                }

                myListCache = deduplicated;

                // If deduplication removed items, save the cleaned list
                if (deduplicated.length < rawData.length) {
                    console.log(`[MyList] Removed ${rawData.length - deduplicated.length} duplicate(s)`);
                    await saveMyList();
                }

                return myListCache;
            } else {
                console.error('Failed to load my list:', response.message);
                return [];
            }
        } catch (error) {
            console.error('Error loading my list:', error);
            return [];
        }
    }

    async function saveMyList() {
        try {
            const response = await StorageService.setObject('my-list', myListCache);
            if (!response.success) {
                console.error('Failed to save my list:', response.message);
            }
            return response.success;
        } catch (error) {
            console.error('Error saving my list:', error);
            return false;
        }
    }

    async function toggleMyList(event, id, mediaType, title, posterPath, year, rating) {
        event.preventDefault();
        event.stopPropagation();

        const button = event.target.closest('.add-to-list-btn');
        if (!button) return;

        const existingIndex = myListCache.findIndex(item => item.id === id && item.media_type === mediaType);

        if (existingIndex >= 0) {
            // Remove from list
            myListCache.splice(existingIndex, 1);
            button.classList.remove('in-list');
            button.innerHTML = '<i class="fas fa-plus"></i>';
            button.title = 'Add to My List';

            // Sync removal with Trakt
            await syncWithTraktWatchlist('remove', title, mediaType, year);
        } else {
            // Add to list - double-check for duplicates before adding
            const isDuplicate = myListCache.some(item => item.id === id && item.media_type === mediaType);

            if (!isDuplicate) {
                const listItem = {
                    id: id,
                    media_type: mediaType,
                    title: title,
                    poster_path: posterPath,
                    year: year,
                    vote_average: rating,
                    added_date: new Date().toISOString()
                };
                myListCache.unshift(listItem); // Add to beginning
                button.classList.add('in-list');
                button.innerHTML = '<i class="fas fa-check"></i>';
                button.title = 'Remove from My List';

                // Sync addition with Trakt
                await syncWithTraktWatchlist('add', title, mediaType, year);
            } else {
                console.warn('[MyList] Prevented duplicate addition:', id, mediaType);
                // Already in list, just update button state
                button.classList.add('in-list');
                button.innerHTML = '<i class="fas fa-check"></i>';
                button.title = 'Remove from My List';
            }
        }

        await saveMyList();

        // Refresh My List page if it's currently open
        if (document.getElementById('myListPage').style.display !== 'none') {
            displayMyList();
        }
    }

    function updateCardListStatus(cardElement, id, mediaType) {
        const button = cardElement.querySelector('.add-to-list-btn');
        if (!button) return;

        const isInList = myListCache.some(item => item.id === id && item.media_type === mediaType);

        if (isInList) {
            button.classList.add('in-list');
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.title = 'Remove from My List';
        } else {
            button.classList.remove('in-list');
            button.innerHTML = '<i class="fas fa-plus"></i>';
            button.title = 'Add to My List';
        }
    }

    function updateCardDoneStatus(cardElement, id, mediaType) {
        const button = cardElement.querySelector('.done-watching-btn');
        if (!button) return;

        // Only mark as done if the exact title (movie or full show) is in doneWatchingCache,
        // never due to episode entries.
        const isDone = doneWatchingCache.some(item =>
            item.id === id && item.media_type === mediaType && (!item.season && !item.episode)
        );

        if (isDone) {
            button.classList.add('is-done');
            button.innerHTML = '<i class="fas fa-check-circle"></i>';
            button.title = 'Remove from Done Watching';
        } else {
            button.classList.remove('is-done');
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.title = 'Mark as Done Watching';
        }
    }

    async function displayMyList() {
        const grid = document.getElementById('myListGrid');
        const loading = document.getElementById('myListLoading');
        const empty = document.getElementById('myListEmpty');

        if (!grid) return;

        loading.style.display = 'block';
        empty.style.display = 'none';
        grid.innerHTML = '';

        await loadMyList();

        loading.style.display = 'none';

        if (myListCache.length === 0) {
            empty.style.display = 'block';
            return;
        }

        myListCache.forEach(item => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.dataset.rating = item.vote_average || 0;
            card.dataset.date = `${item.year}-01-01`; // Approximate date for consistency
            card.innerHTML = `
                    <button class="add-to-list-btn in-list" onclick="toggleMyList(event, ${item.id}, '${item.media_type}', '${item.title.replace(/'/g, "\\'")}', '${item.poster_path}', '${item.year}', ${item.vote_average})">
                        <i class="fas fa-check"></i>
                    </button>
                    <img loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${item.title}" class="movie-poster">
                    <div class="movie-info">
                        <h3 class="movie-title">${item.title}</h3>
                        <p class="movie-year">${item.year}</p>
                    </div>
                    <div class="movie-rating">
                        <i class="fas fa-star"></i> ${Number(item.vote_average).toFixed(1)}
                    </div>
                `;
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.add-to-list-btn')) {
                    openDetailsModal(item, item.media_type);
                }
            });
            grid.appendChild(card);
        });
    }

    async function clearMyList() {
        if (confirm('Are you sure you want to clear your entire list? This action cannot be undone.')) {
            myListCache = [];
            await saveMyList();

            // Update all visible cards
            document.querySelectorAll('.add-to-list-btn.in-list').forEach(button => {
                button.classList.remove('in-list');
                button.innerHTML = '<i class="fas fa-plus"></i>';
                button.title = 'Add to My List';
            });

            // Refresh My List page if open
            if (document.getElementById('myListPage').style.display !== 'none') {
                displayMyList();
            }
        }
    }

    // ---- Done Watching functionality ----
    // Note: doneWatchingCache is declared at top-level scope

    async function loadDoneWatching() {
        try {
            const response = (await StorageService.getObject('done-watching')) || [];
            if (response.success) {
                doneWatchingCache = response.data || [];
                return doneWatchingCache;
            } else {
                console.error('Failed to load done watching:', response.message);
                return [];
            }
        } catch (error) {
            console.error('Error loading done watching:', error);
            return [];
        }
    }

    async function saveDoneWatching() {
        try {
            const response = await StorageService.setObject('done-watching', doneWatchingCache);
            if (!response.success) {
                console.error('Failed to save done watching:', response.message);
            }
            return response.success;
        } catch (error) {
            console.error('Error saving done watching:', error);
            return false;
        }
    }

    async function toggleDoneWatching(event, id, mediaType, title, posterPath, year, rating, season, episode) {
        event.preventDefault();
        event.stopPropagation();

        const button = event.target.closest('.done-watching-btn');
        if (!button) return;

        const existingIndex = doneWatchingCache.findIndex(item => {
            if (mediaType === 'tv' && season && episode) {
                // For episodes, match by show ID, season, and episode
                return item.id === id && item.media_type === mediaType &&
                    item.season === season && item.episode === episode;
            } else {
                // For movies and whole shows, match by ID and media type
                return item.id === id && item.media_type === mediaType;
            }
        });

        if (existingIndex >= 0) {
            // Remove from done watching
            doneWatchingCache.splice(existingIndex, 1);
            button.classList.remove('is-done');
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.title = 'Mark as Done Watching';

            // Note: We don't remove from Trakt history as that's not typical behavior
            showNotification('Removed from local done watching list', 'info');
        } else {
            // Add to done watching
            const doneItem = {
                id: id,
                media_type: mediaType,
                title: title,
                poster_path: posterPath,
                year: year,
                vote_average: rating,
                completed_date: new Date().toISOString()
            };

            // Add episode info if this is a TV episode
            if (mediaType === 'tv' && season && episode) {
                doneItem.season = season;
                doneItem.episode = episode;
                doneItem.episode_title = title; // Store episode title separately
            }

            doneWatchingCache.unshift(doneItem); // Add to beginning
            button.classList.add('is-done');
            button.innerHTML = '<i class="fas fa-check-circle"></i>';
            button.title = 'Remove from Done Watching';

            // Sync with Trakt
            if (mediaType === 'movie') {
                // For movies, mark as watched and add to collection
                await syncWithTraktWatched('movie', title, year);
                await syncWithTraktCollection('add', title, 'movie', year);
            } else if (mediaType === 'tv') {
                if (season && episode) {
                    // For specific episodes
                    await syncWithTraktWatchedEpisode(title, year, season, episode);
                } else {
                    // For whole shows (only add to collection, not mark entire show as watched)
                    await syncWithTraktCollection('add', title, 'show', year);
                    showNotification(`Added "${title}" to your Trakt collection`, 'success');
                }
            }
        }

        await saveDoneWatching();
        // Update any other Done Watching buttons in the DOM for this item
        try { updateAllDoneButtons(id, mediaType); } catch (_) { }

        // Refresh Done Watching page if it's currently open
        if (document.getElementById('doneWatchingPage').style.display !== 'none') {
            displayDoneWatching();
        }
    }

    function updateCardDoneStatus_DUP(cardElement, id, mediaType) {
        const button = cardElement.querySelector('.done-watching-btn');
        if (!button) return;

        // Only mark as done if the exact title (movie or full show) is in doneWatchingCache,
        // never due to episode entries.
        const isDone = doneWatchingCache.some(item =>
            item.id === id && item.media_type === mediaType && (!item.season && !item.episode)
        );

        if (isDone) {
            button.classList.add('is-done');
            button.innerHTML = '<i class="fas fa-check-circle"></i>';
            button.title = 'Remove from Done Watching';
        } else {
            button.classList.remove('is-done');
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.title = 'Mark as Done Watching';
        }
    }

    async function displayDoneWatching() {
        const grid = document.getElementById('doneWatchingGrid');
        const loading = document.getElementById('doneWatchingLoading');
        const empty = document.getElementById('doneWatchingEmpty');

        if (!grid) return;

        loading.style.display = 'block';
        empty.style.display = 'none';
        grid.innerHTML = '';

        await loadDoneWatching();

        loading.style.display = 'none';

        if (doneWatchingCache.length === 0) {
            empty.style.display = 'block';
            return;
        }

        // Group episodes by show and keep movies separate
        const groupedItems = new Map();

        doneWatchingCache.forEach(item => {
            if (item.media_type === 'tv' && item.season && item.episode) {
                // This is an individual episode
                const showKey = `${item.id}-${item.media_type}`;
                if (!groupedItems.has(showKey)) {
                    groupedItems.set(showKey, {
                        ...item,
                        episodes: [],
                        isGrouped: true
                    });
                }
                groupedItems.get(showKey).episodes.push({
                    season: item.season,
                    episode: item.episode,
                    episode_title: item.episode_title,
                    completed_date: item.completed_date
                });
            } else {
                // This is a movie or full show
                const key = `${item.id}-${item.media_type}-single`;
                groupedItems.set(key, {
                    ...item,
                    isGrouped: false
                });
            }
        });

        // Sort and display grouped items
        Array.from(groupedItems.values())
            .sort((a, b) => new Date(b.completed_date) - new Date(a.completed_date))
            .forEach(item => {
                const card = document.createElement('div');
                card.className = 'movie-card';
                card.dataset.rating = item.vote_average || 0;
                card.dataset.date = `${item.year}-01-01`;

                let displayTitle = item.title;
                let episodeInfo = '';
                let episodeBadge = '';

                if (item.isGrouped && item.episodes && item.episodes.length > 0) {
                    // Sort episodes by season/episode to get the latest
                    const sortedEpisodes = item.episodes.sort((a, b) => {
                        if (a.season !== b.season) return b.season - a.season;
                        return b.episode - a.episode;
                    });

                    const latestEpisode = sortedEpisodes[0];
                    const episodeCount = item.episodes.length;

                    displayTitle = item.title;
                    episodeInfo = `<p class="episode-subtitle">${episodeCount} episode${episodeCount > 1 ? 's' : ''} watched • Latest: S${latestEpisode.season}E${latestEpisode.episode}</p>`;
                    episodeBadge = `<div class="episode-badge"><i class="fas fa-tv"></i> ${episodeCount} Episodes</div>`;
                }

                card.innerHTML = `
                        <button class="add-to-list-btn" onclick="toggleMyList(event, ${item.id}, '${item.media_type}', '${item.title.replace(/'/g, "\\'")}', '${item.poster_path}', '${item.year}', ${item.vote_average})">
                            <i class="fas fa-plus"></i>
                        </button>
                        ${item.media_type === 'movie' ? `
                        <button class="done-watching-btn is-done" onclick="toggleDoneWatching(event, ${item.id}, '${item.media_type}', '${item.title.replace(/'/g, "\\'")}', '${item.poster_path}', '${item.year}', ${item.vote_average})">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}
                        ${episodeBadge}
                        <img loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${displayTitle}" class="movie-poster">
                        <div class="movie-info">
                            <h3 class="movie-title">${displayTitle}</h3>
                            ${episodeInfo}
                            <p class="movie-year">${item.year}</p>
                        </div>
                        <div class="movie-rating">
                            <i class="fas fa-star"></i> ${Number(item.vote_average).toFixed(1)}
                        </div>
                        ${item.isGrouped ? `
                        <button class="episode-details-btn" onclick="showEpisodeDetails(event, ${item.id}, '${item.title.replace(/'/g, "\\'")}')">
                            <i class="fas fa-list"></i> View ${item.episodes.length} Episode${item.episodes.length > 1 ? 's' : ''}
                        </button>
                        ` : ''}
                    `;
                card.addEventListener('click', (e) => {
                    if (!e.target.closest('.add-to-list-btn') && !e.target.closest('.done-watching-btn')) {
                        openDetailsModal(item, item.media_type);
                    }
                });
                grid.appendChild(card);
            });
    }

    async function clearDoneWatching() {
        if (confirm('Are you sure you want to clear your entire done watching list? This action cannot be undone.')) {
            doneWatchingCache = [];
            await saveDoneWatching();

            // Update all visible cards
            document.querySelectorAll('.done-watching-btn.is-done').forEach(button => {
                button.classList.remove('is-done');
                button.innerHTML = '<i class="fas fa-check"></i>';
                button.title = 'Mark as Done Watching';
            });

            // Refresh Done Watching page if open
            if (document.getElementById('doneWatchingPage').style.display !== 'none') {
                displayDoneWatching();
            }
        }
    }

    // Load both lists on app start
    document.addEventListener('DOMContentLoaded', async () => {
        // Reconcile downloaded music with disk at launch so manually deleted files are not listed
        try { await reconcileDownloadedMusicWithDisk(); } catch (_) { }
        try { renderDownloadedMusic(); } catch (_) { }
        await loadMyList();
        await loadDoneWatching();
        await loadContinueWatching();

        // Update existing cards with both list statuses when movies are loaded
        const originalDisplayMovies = displayMovies;
        displayMovies = function (movies, append = true) {
            const result = originalDisplayMovies.call(this, movies, append);

            // Update both list and done watching status for newly added cards
            setTimeout(() => {
                movies.forEach(movie => {
                    const cards = document.querySelectorAll(`[data-rating="${movie.vote_average || 0}"]`);
                    cards.forEach(card => {
                        updateCardListStatus(card, movie.id, movie.media_type || 'movie');
                        updateCardDoneStatus(card, movie.id, movie.media_type || 'movie');
                    });
                });
            }, 100);

            return result;
        };

        // Also update cards for genre items
        const originalDisplayGenreItems = displayGenreItems;
        displayGenreItems = function (items, mediaType) {
            const result = originalDisplayGenreItems.call(this, items, mediaType);

            // Update both list and done watching status for genre cards
            setTimeout(() => {
                items.forEach(item => {
                    const cards = document.querySelectorAll(`.movie-card`);
                    cards.forEach(card => {
                        const cardImg = card.querySelector('img');
                        if (cardImg && cardImg.src.includes(item.poster_path)) {
                            updateCardListStatus(card, item.id, mediaType);
                            updateCardDoneStatus(card, item.id, mediaType);
                        }
                    });
                });
            }, 100);

            return result;
        };

        // Add button handlers
        document.getElementById('clearMyListBtn')?.addEventListener('click', clearMyList);
        document.getElementById('clearDoneWatchingBtn')?.addEventListener('click', clearDoneWatching);
    });

    // Add platform class to body for platform-specific styling
    (function () {
        if (window.electronAPI && window.electronAPI.platform) {
            document.body.classList.add('platform-' + window.electronAPI.platform);
        }
    })();
    // Expose functions to window for onclick handlers
    window.showCustomMagnetModal = showCustomMagnetModal;
    window.closeEpubDownloadModal = closeEpubDownloadModal;
    window.applyUIMode = applyUIMode;
    window.applyTheme = applyTheme;
}


// Initialize the app when DOM is ready, or immediately if already loaded
if (document.readyState === 'loading') {
    // DOM not ready yet, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[DEBUG] DOMContentLoaded fired - calling init()');
        init();
    });
} else {
    // DOM already loaded, run init immediately
    console.log('[DEBUG] DOM already loaded - calling init() immediately');
    init();
}
