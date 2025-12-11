import { HttpService } from '../http';

export interface TorrentStream {
    name: string;
    title: string;
    magnetLink: string;
    infoHash: string;
    seeders: number;
    size: string;
    filename: string;
    fileIdx: number;
}

export class TorrentioService {
    private static readonly BASE_URL_MOVIE = 'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex/stream/movie';
    private static readonly BASE_URL_SERIES = 'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex/stream/series';

    // Trackers list for magnet link construction
    private static readonly TRACKERS = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://tracker.bittor.pw:1337/announce',
        'udp://public.popcorn-tracker.org:6969/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://exodus.desync.com:6969',
        'udp://open.demonii.com:1337/announce'
    ];

    private static getTrackersString(): string {
        return this.TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    }

    private static parseStreamInfo(title: string) {
        const seederMatch = title.match(/👤\s*(\d+)/);
        const sizeMatch = title.match(/💾\s*([\d.]+\s*[A-Z]+)/);

        return {
            seeders: seederMatch ? parseInt(seederMatch[1]) : 0,
            size: sizeMatch ? sizeMatch[1] : 'Unknown'
        };
    }

    private static constructMagnetLink(infoHash: string, filename: string): string {
        const encodedName = encodeURIComponent(filename);
        return `magnet:?xt=urn:btih:${infoHash}&dn=${encodedName}${this.getTrackersString()}`;
    }

    /**
     * Get streams for a movie
     * @param imdbId IMDb ID/TT ID
     */
    static async getMovieStreams(imdbId: string): Promise<TorrentStream[]> {
        if (!imdbId.match(/^tt\d+$/)) {
            throw new Error('Invalid IMDb ID format. Must be in format: tt1234567');
        }

        const url = `${this.BASE_URL_MOVIE}/${imdbId}.json`;

        try {
            const data = await HttpService.get(url);

            if (!data || !data.streams || data.streams.length === 0) {
                return [];
            }

            return data.streams.map((stream: any) => {
                const info = this.parseStreamInfo(stream.title);
                const filename = stream.behaviorHints?.filename || 'movie.mkv';
                const magnetLink = this.constructMagnetLink(stream.infoHash, filename);

                return {
                    name: stream.name,
                    title: stream.title,
                    magnetLink,
                    infoHash: stream.infoHash,
                    seeders: info.seeders,
                    size: info.size,
                    filename,
                    fileIdx: stream.fileIdx
                };
            });
        } catch (error) {
            console.error('[TorrentioService] Error fetching movie streams:', error);
            // Return empty array instead of throwing to prevent UI crash
            return [];
        }
    }

    /**
     * Get streams for a TV particular episode
     */
    static async getSeriesStreams(imdbId: string, season: number, episode: number): Promise<TorrentStream[]> {
        if (!imdbId.match(/^tt\d+$/)) {
            throw new Error('Invalid IMDb ID format. Must be in format: tt1234567');
        }

        const url = `${this.BASE_URL_SERIES}/${imdbId}:${season}:${episode}.json`;

        try {
            const data = await HttpService.get(url);

            if (!data || !data.streams || data.streams.length === 0) {
                return [];
            }

            return data.streams.map((stream: any) => {
                const info = this.parseStreamInfo(stream.title);
                const filename = stream.behaviorHints?.filename || `episode_S${season}E${episode}.mkv`;
                const magnetLink = this.constructMagnetLink(stream.infoHash, filename);

                return {
                    name: stream.name,
                    title: stream.title,
                    magnetLink,
                    infoHash: stream.infoHash,
                    seeders: info.seeders,
                    size: info.size,
                    filename,
                    fileIdx: stream.fileIdx
                };
            });
        } catch (error) {
            console.error('[TorrentioService] Error fetching series streams:', error);
            return [];
        }
    }
}
