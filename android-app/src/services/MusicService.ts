
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
// Note: We perform a dynamic check or try-catch for the community plugin usage 
// in case it's not perfectly linked, but package.json says it's there.
import { Http } from '@capacitor-community/http';

// Music providers (fallback order)
const HIFI_BASES = [
    // Monochrome.tf instances
    'https://frankfurt.monochrome.tf',
    'https://virginia.monochrome.tf',
    'https://ohio.monochrome.tf',
    'https://singapore.monochrome.tf',
    'https://california.monochrome.tf',
    'https://oregon.monochrome.tf',
    'https://jakarta.monochrome.tf',
    'https://tokyo.monochrome.tf',
    'https://london.monochrome.tf',

    // Squid.wtf instances
    'https://triton.squid.wtf',
    'https://aether.squid.wtf',
    'https://zeus.squid.wtf',
    'https://kraken.squid.wtf',
    'https://phoenix.squid.wtf',
    'https://shiva.squid.wtf',
    'https://chaos.squid.wtf',

    // QQDL.site instances
    'https://hund.qqdl.site',
    'https://katze.qqdl.site',
    'https://vogel.qqdl.site',
    'https://maus.qqdl.site',
    'https://wolf.qqdl.site',

    // UI instances that also expose the API
    'https://monochrome.tf',
    'https://music.binimum.org',
    'https://tidal.squid.wtf',
    'https://tidal.qqdl.site',

    // Existing known instances
    'https://hifi.401658.xyz',
    'https://tidal.401658.xyz'
];

export const MusicService = {

    async getDownloadDirectory() {
        // Create a dedicated folder in Documents
        const path = 'PlayTorrio/Music';
        try {
            await Filesystem.mkdir({
                path,
                directory: Directory.Documents,
                recursive: true
            });
        } catch (e) {
            // Ignore if exists
        }
        return path;
    },

    // Helper to fetch JSON from HIFI_BASES
    async musicFetchJson(path: string) {
        let lastError = null;
        for (const base of HIFI_BASES) {
            try {
                const url = `${base}${path}`;
                const options = {
                    url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                };
                const resp = await Http.get(options);
                if (resp.status >= 200 && resp.status < 300) {
                    return resp.data;
                }
                lastError = new Error(`HTTP ${resp.status} from ${base}`);
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError || new Error('All music providers failed');
    },

    async searchMusic(query: string) {
        if (!query || !query.trim()) return [];
        try {
            const data = await this.musicFetchJson(`/search/?s=${encodeURIComponent(query.trim())}`);
            const items = Array.isArray(data?.items) ? data.items : [];
            // Filter to tracks or artists if possible, but keep it generic
            const tracks = items.filter((it: any) => (it.type || it.itemType || '').toString().toLowerCase() === 'track' || it.audioQuality || it.artist);
            return tracks.length ? tracks : items;
        } catch (e) {
            console.error('[MusicService] Search error:', e);
            throw e;
        }
    },

    async getTrackDetails(trackId: string) {
        try {
            return await this.musicFetchJson(`/track/?id=${encodeURIComponent(trackId)}&quality=LOSSLESS`);
        } catch (e) {
            console.error('[MusicService] Get track error:', e);
            throw e;
        }
    },

    async downloadTrack(trackId: string, songName: string, artistName: string, coverSrc?: string) {
        console.log(`[MusicService] Starting download for ${songName} (${trackId})...`);

        // 1. Get Track URL
        let trackUrl = null;
        try {
            const data = await this.getTrackDetails(trackId);
            if (Array.isArray(data) && data.length >= 3) {
                trackUrl = data[2]?.OriginalTrackUrl || data[2]?.originalTrackUrl;
            }
            if (!trackUrl && Array.isArray(data)) {
                for (const item of data) {
                    const candidate = item?.OriginalTrackUrl || item?.originalTrackUrl;
                    if (candidate && !candidate.startsWith('http://www.tidal.com')) {
                        trackUrl = candidate;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('[MusicService] Failed to fetch track details:', e);
            throw new Error('Failed to fetch track details');
        }

        if (!trackUrl) {
            throw new Error('No valid track URL found');
        }

        // 2. Download File
        // Sanitize
        const sanitize = (str: string) => str.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
        const artist = sanitize(artistName || 'Unknown Artist');
        const song = sanitize(songName || 'Unknown Song');

        // Determine extension (fallback to mp3)
        let ext = 'mp3';
        const lowerUrl = trackUrl.toLowerCase();
        if (lowerUrl.includes('.flac')) ext = 'flac';
        else if (lowerUrl.includes('.m4a')) ext = 'm4a';
        else if (lowerUrl.includes('.aac')) ext = 'aac';
        else if (lowerUrl.includes('.ogg')) ext = 'ogg';
        else if (lowerUrl.includes('.wav')) ext = 'wav';

        const filename = `${artist} - ${song}.${ext}`;
        const folder = await this.getDownloadDirectory();

        // Note: Http.downloadFile expects a full filePath for the destination in some versions, 
        // or a directory + filename. We'll use filePath if possible, but the plugin documentation 
        // suggests using fileDirectory and filePath as relative or absolute. 
        // We'll construct a filename relative to Documents.
        const relativePath = `PlayTorrio/Music/${filename}`;

        console.log(`[MusicService] Downloading ${song} from ${trackUrl} to Documents/${relativePath}`);

        const options = {
            url: trackUrl,
            filePath: relativePath,
            fileDirectory: Directory.Documents,
            method: 'GET'
        };

        try {
            const response = await Http.downloadFile(options);

            if (response.path) {
                console.log(`[MusicService] Download success: ${response.path}`);

                return {
                    success: true,
                    path: response.path,
                    filename,
                    trackId,
                    title: songName,
                    artist: artistName,
                    cover: coverSrc
                };
            } else {
                throw new Error('No path returned from download');
            }
        } catch (error: any) {
            console.error('[MusicService] Download failed:', error);
            throw error;
        }
    },

    async listDownloads() {
        const folder = await this.getDownloadDirectory();
        try {
            const result = await Filesystem.readdir({
                path: folder,
                directory: Directory.Documents
            });
            return result.files;
        } catch (e) {
            return [];
        }
    },

    async deleteDownload(filename: string) {
        const folder = await this.getDownloadDirectory();
        try {
            await Filesystem.deleteFile({
                path: `${folder}/${filename}`,
                directory: Directory.Documents
            });
            return true;
        } catch (e) {
            console.error('[MusicService] Delete failed', e);
            throw e;
        }
    },

    async getFileUri(filename: string) {
        const folder = await this.getDownloadDirectory();
        try {
            const result = await Filesystem.getUri({
                path: `${folder}/${filename}`,
                directory: Directory.Documents
            });
            return result.uri;
        } catch (e) {
            return null;
        }
    }
};
