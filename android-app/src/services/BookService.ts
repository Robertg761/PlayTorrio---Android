
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Http } from '@capacitor-community/http';
import { CapacitorHttp } from '@capacitor/core';
import * as cheerio from 'cheerio';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ZLIB_DOMAINS = [
    'z-lib.io',
    'zlibrary-global.se',
    'booksc.org',
    '1lib.sk',
    'z-lib.gd',
    'zlibrary.to',
    'z-lib.fm',
    'z-lib.se',
    'z-lib.is',
    'z-lib.org'
];

const WEEBCENTRAL_BASE = 'https://weebcentral.com';
const ZAUDIOBOOKS_BASE = 'https://zaudiobooks.com';
const RANDOMBOOK_API = 'https://randombook.org/api/search/by-params';
const LIBGEN_DOWNLOAD_API = 'https://libgen.download/api/download';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ============================================================================
// HELPERS
// ============================================================================

const getRandomUserAgent = () => USER_AGENT; // Keep it simple for now

const httpGet = async (url: string, headers: any = {}) => {
    const options = {
        url,
        headers: {
            'User-Agent': getRandomUserAgent(),
            ...headers
        }
    };
    return await CapacitorHttp.get(options);
};

const httpPost = async (url: string, data: any, headers: any = {}) => {
    const options = {
        url,
        data,
        headers: {
            'User-Agent': getRandomUserAgent(),
            'Content-Type': 'application/json',
            ...headers
        }
    };
    return await CapacitorHttp.post(options);
};

// ============================================================================
// Z-LIBRARY SERVICE
// ============================================================================

export const BookService = {

    async searchBooks(query: string) {
        let searchResults = null;
        let workingDomain = null;

        for (const domain of ZLIB_DOMAINS) {
            try {
                const searchUrl = `https://${domain}/s/${encodeURIComponent(query)}`;
                const response = await httpGet(searchUrl);

                if (response.status === 200 && response.data && response.data.length > 100) {
                    searchResults = response.data;
                    workingDomain = domain;
                    break;
                }
            } catch (error) {
                console.warn(`[BookService] Failed to connect to ${domain}`, error);
                continue;
            }
        }

        if (!searchResults || !workingDomain) {
            throw new Error('Unable to connect to any Z-Library servers.');
        }

        const $ = cheerio.load(searchResults);
        const books: any[] = [];

        let bookElements = [];
        const selectors = [
            '.book-item', '.resItemBox', '.bookRow', '.result-item',
            '[itemtype*="Book"]', 'table tr', '.bookBox',
            'div[id*="book"]', '.booklist .book', '.search-item', 'a[href*="/book/"]'
        ];

        for (const selector of selectors) {
            const found = $(selector);
            if (found.length > 0) {
                // Special handling for raw links to ensure we get a parent container if possible
                if (selector === 'a[href*="/book/"]' && found.length > 0) {
                    // logic similar to api.cjs but simplified for cheerio
                    // skipping complex parent re-mapping for brevity unless needed
                }
                bookElements = found.toArray();
                break;
            }
        }

        for (const element of bookElements.slice(0, 15)) {
            const $book = $(element);

            let title = '';
            let bookUrl = '';
            let author = 'Unknown';
            let year = 'Unknown';
            let language = 'Unknown';
            let format = 'Unknown';
            let coverUrl = null;

            // Strategy 1: check for z-bookcard component
            const zbookcard = $book.find('z-bookcard').first();
            if (zbookcard.length) {
                bookUrl = zbookcard.attr('href') || '';
                year = zbookcard.attr('year') || 'Unknown';
                language = zbookcard.attr('language') || 'Unknown';
                format = zbookcard.attr('extension') || 'Unknown';
                title = zbookcard.find('[slot="title"]').text().trim() || zbookcard.find('div[slot="title"]').text().trim();
                author = zbookcard.find('[slot="author"]').text().trim() || zbookcard.find('div[slot="author"]').text().trim();
                const img = zbookcard.find('img').first();
                coverUrl = img.attr('data-src') || img.attr('src');
            }

            // Strategy 2: standard selectors
            if (!title || !bookUrl) {
                const titleEl = $book.find('h3 a, .book-title a, .title a, a[href*="/book/"]').first();
                if (titleEl.length) {
                    title = titleEl.text().trim();
                    bookUrl = titleEl.attr('href') || '';
                }
            }

            if (!title || !bookUrl) continue;

            if (bookUrl.startsWith('/')) {
                bookUrl = `https://${workingDomain}${bookUrl}`;
            }

            if (author === 'Unknown') {
                const authorEl = $book.find('.authors a, .author a, [class*="author"]').first();
                if (authorEl.length) author = authorEl.text().trim();
            }

            if (!coverUrl) {
                const coverEl = $book.find('img[data-src], img[src*="cover"], .itemCover img, img').first();
                coverUrl = coverEl.attr('data-src') || coverEl.attr('src');
            }

            if (coverUrl && coverUrl.startsWith('/')) {
                coverUrl = `https://${workingDomain}${coverUrl}`;
            }

            books.push({
                title: title.replace(/\s+/g, ' ').trim(),
                author: author.replace(/\s+/g, ' ').trim(),
                year,
                language,
                format: format.toUpperCase(),
                bookUrl,
                coverUrl,
                domain: workingDomain
            });
        }

        // Parallel fetch read links
        // CAUTION: CapacitorHttp might not support true parallel requests well depending on the native implementation,
        // but Promise.all is standard JS.
        const booksWithReadLinks = await Promise.all(books.map(async (book) => {
            try {
                const readLink = await BookService.getReadLink(book.bookUrl, book.domain);
                return { ...book, readLink: readLink || null };
            } catch (e) {
                return { ...book, readLink: null };
            }
        }));

        return {
            query,
            domainUsed: workingDomain,
            results: booksWithReadLinks
        };
    },

    async getReadLink(bookUrl: string, workingDomain: string) {
        try {
            const response = await httpGet(bookUrl);
            if (response.status !== 200) return null;

            const $ = cheerio.load(response.data);
            let readerUrl: string | undefined | null = null;

            const selectors = [
                '.reader-link',
                '.read-online .reader-link',
                '.book-details-button .reader-link',
                'a[href*="reader.z-lib"]',
                'a[href*="/read/"]',
                '.read-online a[href*="reader"]',
                '.dlButton.reader-link'
            ];

            for (const sel of selectors) {
                $(sel).each((_, el) => {
                    const href = $(el).attr('href');
                    if (href && (href.includes('reader.z-lib') || href.includes('reader.singlelogin') || href.includes('/read/'))) {
                        readerUrl = href;
                        return false; // break cheerio loop
                    }
                });
                if (readerUrl) break;
            }

            if (readerUrl && readerUrl.startsWith('/')) {
                readerUrl = `https://${workingDomain}${readerUrl}`;
            }

            return readerUrl;

        } catch (e) {
            return null;
        }
    },

    // ============================================================================
    // LIBGEN SERVICE (OtherBook)
    // ============================================================================

    async searchLibGen(query: string) {
        try {
            const url = `${RANDOMBOOK_API}?query=${encodeURIComponent(query)}&collection=libgen&from=0`;
            const response = await httpGet(url);

            if (!response.data || !response.data.result || !response.data.result.books) {
                return { books: [] };
            }

            const books = response.data.result.books.slice(0, 15);

            // Map to format expected by UI
            const results = await Promise.all(books.map(async (book: any) => {
                const actualDownloadLink = `${LIBGEN_DOWNLOAD_API}?id=${book.id}`;
                // Optional: Try to fetch cover from Z-Lib (omitted for speed/complexity reduction on client)
                // If needed, we can port `otherbook_getCoverByAuthor` logic here.

                return {
                    id: book.id,
                    title: book.title,
                    author: book.author, // LibGen returns string or array? api.cjs handles both
                    description: book.description,
                    year: book.year,
                    language: book.language,
                    fileExtension: book.fileExtension,
                    fileSize: book.fileSize,
                    downloadlink: actualDownloadLink
                };
            }));

            return { books: results };

        } catch (error) {
            console.error('[BookService] LibGen search error:', error);
            throw error;
        }
    },

    async downloadBook(url: string, title: string, author: string, ext: string = 'epub') {
        const sanitize = (str: string) => str.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
        const safeTitle = sanitize(title || 'Unknown Title');
        const safeAuthor = sanitize(author || 'Unknown Author');
        const filename = `${safeTitle} - ${safeAuthor}.${ext}`;

        try {
            // Create directory
            const path = 'PlayTorrio/Books';
            try {
                await Filesystem.mkdir({
                    path,
                    directory: Directory.Documents,
                    recursive: true
                });
            } catch (e) { }

            const filePath = `${path}/${filename}`;
            console.log(`[BookService] Downloading book to ${filePath}`);

            const response = await Http.downloadFile({
                url,
                filePath,
                fileDirectory: Directory.Documents,
                method: 'GET'
            });

            if (response.path) {
                return { success: true, path: response.path, filename };
            } else {
                throw new Error('No path returned');
            }
        } catch (error) {
            console.error('[BookService] Download failed:', error);
            return { success: false, error };
        }
    },

    // ============================================================================
    // MANGA SERVICE (WeebCentral)
    // ============================================================================

    async getLatestManga(page: number = 1) {
        const url = `${WEEBCENTRAL_BASE}/latest-updates/${page}`;
        const response = await httpGet(url);
        const $ = cheerio.load(response.data);
        const mangas: any[] = [];

        $('article.bg-base-100').each((index, element) => {
            const $article = $(element);
            const name = $article.attr('data-tip');
            const $posterLink = $article.find('a').first();
            const seriesPageUrl = $posterLink.attr('href');
            const posterUrl = $article.find('source[type="image/webp"]').attr('srcset') || $article.find('img').attr('src');

            const seriesIdMatch = seriesPageUrl?.match(/\/series\/([^\/]+)/);
            const seriesId = seriesIdMatch ? seriesIdMatch[1] : null;

            const $chapterLink = $article.find('a').eq(1);
            const latestChapterUrl = $chapterLink.attr('href');
            const chapterIdMatch = latestChapterUrl?.match(/\/chapters\/([^\/]+)/);
            const chapterId = chapterIdMatch ? chapterIdMatch[1] : null;

            if (name && posterUrl && seriesId) {
                mangas.push({
                    id: `update-${index}`,
                    name,
                    poster: posterUrl,
                    seriesId,
                    latestChapterId: chapterId
                });
            }
        });

        return mangas;
    },

    async searchManga(query: string) {
        if (!query.trim()) return [];

        const url = `${WEEBCENTRAL_BASE}/search/data?author=&text=${encodeURIComponent(query)}&sort=Best Match&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full Display`;
        const response = await httpGet(url);
        const $ = cheerio.load(response.data);
        const mangas: any[] = [];

        $('article.bg-base-300').each((index, element) => {
            const $article = $(element);
            const $link = $article.find('a[href*="/series/"]').first();
            const seriesUrl = $link.attr('href');
            const name = $link.attr('href')?.split('/').pop()?.replace(/-/g, ' ').trim() || $article.find('.line-clamp-1').text().trim();

            const seriesIdMatch = seriesUrl?.match(/\/series\/([^\/]+)/);
            const seriesId = seriesIdMatch ? seriesIdMatch[1] : null;

            const posterUrl = $article.find('source[type="image/webp"]').attr('srcset') || $article.find('img').attr('src');

            const $chapterLink = $article.find('a[href*="/chapters/"]').first();
            const latestChapterUrl = $chapterLink.attr('href');
            const latestChapterIdMatch = latestChapterUrl?.match(/\/chapters\/([^\/]+)/);
            const latestChapterId = latestChapterIdMatch ? latestChapterIdMatch[1] : null;

            if (name && posterUrl && seriesId) {
                mangas.push({
                    id: `search-${index}`,
                    name,
                    poster: posterUrl,
                    seriesId,
                    latestChapterId
                });
            }
        });
        return mangas;
    },

    async getMangaChapters(seriesId: string) {
        // First get the series page to find the latest chapter if needed (or simply to list all chapters)
        // WeebCentral uses a chapter-select page: /series/{seriesId}/chapter-select?current_chapter={latest}&current_page=0

        // Use a dummy chapter ID or fetch main page to find one
        let latestChapterId = 'latest';

        // Need to find at least one chapter ID to load the list properly?
        // Let's fetch the series page first
        const seriesPage = await httpGet(`${WEEBCENTRAL_BASE}/series/${seriesId}`);
        const $series = cheerio.load(seriesPage.data);
        const $latestLink = $series('a[href*="/chapters/"]').first();
        const latestUrl = $latestLink.attr('href');
        const match = latestUrl?.match(/\/chapters\/([^\/]+)/);
        if (match) latestChapterId = match[1];

        if (latestChapterId === 'latest') return []; // Failed to find any chapters

        const listUrl = `${WEEBCENTRAL_BASE}/series/${seriesId}/chapter-select?current_chapter=${latestChapterId}&current_page=0`;
        const listResp = await httpGet(listUrl);
        const $ = cheerio.load(listResp.data);
        const chapters: any[] = [];

        $('div.grid button, div.grid a').each((index, element) => {
            const $el = $(element);
            const text = $el.text().trim();
            const href = $el.attr('href');

            if (!text) return;

            let id = href ? href.split('/').pop() : null;
            // If it's the selected button, it might not have href, but ID is in the URL param we sent...
            // actually WeebCentral UI usually has all chapters as links or buttons.
            // If no href, ignore for now or try to parse onclick?

            if (id) {
                chapters.push({
                    id,
                    name: text,
                    url: href
                });
            }
        });
        return chapters;
    },

    async getChapterPages(chapterId: string) {
        const url = `${WEEBCENTRAL_BASE}/chapters/${chapterId}`;
        const response = await httpGet(url);
        const $ = cheerio.load(response.data);

        const firstPageUrl = $('link[rel="preload"][as="image"]').attr('href');
        if (!firstPageUrl) return [];

        // Logic to sequence pages
        // url format: https://.../123-001.png or 1.1-001.png
        const urlParts = firstPageUrl.split('/');
        const fileName = urlParts.pop();
        if (!fileName) return [];
        const baseUrl = urlParts.join('/') + '/';

        const match1 = fileName.match(/^(\d+)-\d+\.png$/);
        const match2 = fileName.match(/^([\d.]+)-\d+\.png$/);

        const chapterNum = match1 ? match1[1] : (match2 ? match2[1] : null);
        if (!chapterNum) return [];

        // We don't want to stream ndjson here (like the server did).
        // We want to return a list of URLs that the client can load.
        // Since we can't easily "check" existence without HEAD requests, 
        // and we want to be fast, we might generate a purely speculative list 
        // OR just return the base info and let the UI try to load 1..N.

        // Safe bet: Generate 30-40 pages? Or try to "scan" them concurrently?
        // Scanning on client might be slow.
        // Let's return a "generator" object or just a list of 100 potential pages?
        // Optimized approach: Check the first 5 pages to be sure, then guess?

        // Server implementation did a while(true) check. 
        // Doing that on client might be too much network traffic if serial.
        // Doing it parallel: check 1..50.

        const pages = [];
        // Check up to 200 pages?
        // We'll return the baseUrl and chapterNum so the UI can construct them? 
        // OR we construct valid URLs.

        // Let's try construct the first 30 pages blindly. 
        // Most manga chapters are < 30 pages.
        // The UI <img onError> can handle missing ones.

        for (let i = 1; i <= 60; i++) {
            const pageNum = String(i).padStart(3, '0');
            pages.push(`${baseUrl}${chapterNum}-${pageNum}.png`);
        }

        return {
            baseUrl,
            chapterNum,
            pages // Speculative list
        };
    },

    // ============================================================================
    // AUDIOBOOKS (ZAudioBooks)
    // ============================================================================

    async searchAudiobooks(query: string) {
        if (!query) return [];
        const url = `${ZAUDIOBOOKS_BASE}/?s=${encodeURIComponent(query)}`;
        const response = await httpGet(url);
        const $ = cheerio.load(response.data);
        const books: any[] = [];

        $('article.post').each((index, element) => {
            const $el = $(element);
            const title = $el.find('.entry-title a').text().trim();
            const link = $el.find('.entry-title a').attr('href');
            // Images are lazy loaded or in meta tags on detail page...
            // For list view, we might not get good images without visiting each page (which api.cjs did).
            // We'll skip images for list view efficiency or return a placeholder.

            if (title && link) {
                books.push({
                    title,
                    link,
                    // image: ... (requires extra fetch)
                    post_name: link.split('/').filter(Boolean).pop()
                });
            }
        });
        return books;
    },

    async getAudiobookDetails(postName: string) {
        const url = `${ZAUDIOBOOKS_BASE}/${postName}/`;
        const response = await httpGet(url);
        const $ = cheerio.load(response.data);

        const title = $('.entry-title').text().trim();
        const image = $('.entry-content img').first().attr('src');
        const description = $('.entry-content p').first().text().trim();

        // Extract chapters (tracks)
        const html = response.data;
        const startMatch = html.match(/tracks\s*=\s*\[/);
        let chapters: any[] = [];

        if (startMatch) {
            const startIndex = startMatch.index + startMatch[0].length - 1;
            // Naive extraction: find next ]; 
            // Ideally we need a bracket counter.
            let bracketCount = 0;
            let endIndex = startIndex;
            for (let i = startIndex; i < html.length; i++) {
                if (html[i] === '[' || html[i] === '{') bracketCount++;
                if (html[i] === ']' || html[i] === '}') bracketCount--;
                if (bracketCount === 0 && html[i] === ']') {
                    endIndex = i + 1;
                    break;
                }
            }
            const tracksStr = html.substring(startIndex, endIndex);
            try {
                let tracksJson = tracksStr
                    .replace(/,(\s*[}\]])/g, '$1')
                    .replace(/(\s)(\w+):/g, '$1"$2":')
                    .replace(/'/g, '"');
                chapters = JSON.parse(tracksJson);
            } catch (e) {
                console.warn('[BookService] Failed to parse tracks JSON', e);
            }
        }

        return {
            title,
            image,
            description,
            chapters
        };
    },

    async getAudiobookStream(chapterId: number) {
        // This requires an internal API call on ZAudioBooks or GalaxyAudiobook
        // https://api.galaxyaudiobook.com/api/getMp3Link
        const url = 'https://api.galaxyaudiobook.com/api/getMp3Link';
        const response = await httpPost(url, {
            chapterId,
            serverType: 1
        }, {
            'Origin': 'https://zaudiobooks.com',
            'Referer': 'https://zaudiobooks.com/'
        });

        return response.data;
    }

};
