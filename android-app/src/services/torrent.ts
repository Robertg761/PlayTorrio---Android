import WebTorrent from 'webtorrent';

export class TorrentService {
    private client: WebTorrent.Instance;
    private static instance: TorrentService;

    private constructor() {
        this.client = new WebTorrent();

        this.client.on('error', (err) => {
            console.error('[TorrentService] Client error:', err);
        });
    }

    public static getInstance(): TorrentService {
        if (!TorrentService.instance) {
            TorrentService.instance = new TorrentService();
        }
        return TorrentService.instance;
    }

    /**
     * Terminate the client and destroy all torrents
     */
    public destroy() {
        if (this.client) {
            this.client.destroy();
            // Re-instantiate on next access
            // @ts-ignore
            TorrentService.instance = null;
        }
    }

    /**
     * Add a torrent and stream a specific file
     * @param magnetLink Magnet URI
     * @param fileName Optional filename to select specifically (if known)
     * @returns Promise resolving to the streamable file and torrent
     */
    public async streamTorrent(magnetLink: string, fileName?: string): Promise<{ file: WebTorrent.TorrentFile, torrent: WebTorrent.Torrent }> {
        return new Promise((resolve, reject) => {
            // Check if already added
            const existing = this.client.get(magnetLink);
            if (existing) {
                console.log('[TorrentService] Torrent already exists, reusing');
                this.handleTorrentReady(existing, fileName, resolve, reject);
                return;
            }

            console.log('[TorrentService] Adding new torrent...');
            this.client.add(magnetLink, { path: 'downloads' }, (torrent) => {
                this.handleTorrentReady(torrent, fileName, resolve, reject);
            });
        });
    }

    private handleTorrentReady(
        torrent: WebTorrent.Torrent,
        targetFileName: string | undefined,
        resolve: (value: { file: WebTorrent.TorrentFile, torrent: WebTorrent.Torrent }) => void,
        reject: (reason?: any) => void
    ) {
        console.log('[TorrentService] Torrent metadata ready. Files:', torrent.files.length);

        let file: WebTorrent.TorrentFile | undefined;

        if (targetFileName) {
            // Try to find exact match
            file = torrent.files.find(f => f.name === targetFileName);
        }

        if (!file) {
            // Find largest file (video)
            file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
        }

        if (!file) {
            reject(new Error('No files found in torrent'));
            return;
        }

        console.log(`[TorrentService] Selected file: ${file.name} (${(file.length / 1024 / 1024).toFixed(2)} MB)`);

        // Prioritize this file
        file.select();

        // Deselect others to save bandwidth
        torrent.files.forEach(f => {
            if (f !== file) f.deselect();
        });

        resolve({ file, torrent });
    }

    /**
     * Get download speeed in bytes/sec
     */
    public getDownloadSpeed(): number {
        return this.client.downloadSpeed;
    }

    /**
     * Get upload speed in bytes/sec
     */
    public getUploadSpeed(): number {
        return this.client.uploadSpeed;
    }

    /**
     * Get progress (0-1)
     */
    public getProgress(): number {
        return this.client.progress;
    }
}
