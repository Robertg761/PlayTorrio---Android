import { CapacitorVideoPlayer } from 'capacitor-video-player';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

export class PlayerService {

    /**
     * Play a video URL using the native Capacitor Video Player
     * @param url URL to the video file or stream
     * @param title Optional title to display
     * @param subtitleUrl Optional subtitle URL (vtt)
     */
    static async play(url: string, title?: string, subtitleUrl?: string) {
        if (Capacitor.getPlatform() === 'web') {
            console.warn('[PlayerService] Web platform detected. Native player may not work fully. Using HTML5 fallback logic if implemented.');
            // Implementation provided by UI (main.js) usually for web
            return;
        }

        try {
            console.log(`[PlayerService] Opening native player for: ${url}`);

            await CapacitorVideoPlayer.initPlayer({
                mode: 'fullscreen',
                url: url,
                playerId: 'fullscreen-player',
                componentTag: 'div',
                subtitle: subtitleUrl ? {
                    url: subtitleUrl,
                    language: 'en'
                } : undefined,
                // Android specific options can go here if plugin supports them
            });

            // Start playing immediately if init doesn't auto-play
            const playing = await CapacitorVideoPlayer.isPlaying({ playerId: 'fullscreen-player' });
            if (!playing.result) {
                await CapacitorVideoPlayer.play({ playerId: 'fullscreen-player' });
            }

        } catch (error) {
            console.error('[PlayerService] Error playing video:', error);
            throw error;
        }
    }

    /**
     * Open video in external player (VLC) via Android Intent
     * @param url Video URL
     * @throws Error if VLC is not installed or fails to open
     */
    static async playInVlc(url: string): Promise<boolean> {
        if (Capacitor.getPlatform() !== 'android') {
            console.warn('External player intents are Android-only');
            return false;
        }

        try {
            // Construct VLC Intent URI
            // vlc://http://example.com/video.mp4
            const vlcUrl = url.replace(/^https?:\/\//, 'vlc://');

            console.log(`[PlayerService] Launching VLC: ${vlcUrl}`);

            await AppLauncher.openUrl({ url: vlcUrl });
            return true;
        } catch (error) {
            console.error('[PlayerService] Failed to open VLC:', error);
            throw error; // Re-throw so caller can handle fallback
        }
    }

    /**
     * Open URL in external browser
     * @param url URL to open
     */
    static async openInBrowser(url: string): Promise<void> {
        console.log(`[PlayerService] Opening in external browser: ${url}`);

        if (Capacitor.getPlatform() === 'android') {
            try {
                // Use AppLauncher for proper Android intent handling
                await AppLauncher.openUrl({ url });
            } catch (error) {
                console.error('[PlayerService] AppLauncher failed, using window.open fallback:', error);
                window.open(url, '_system');
            }
        } else {
            // Web or iOS fallback
            window.open(url, '_blank');
        }
    }

    /**
     * Check if running on mobile (Android/iOS via Capacitor)
     */
    static isMobile(): boolean {
        const platform = Capacitor.getPlatform();
        return platform === 'android' || platform === 'ios';
    }
}
