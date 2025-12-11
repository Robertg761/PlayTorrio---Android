import { CapacitorHttp, HttpResponse } from '@capacitor/core';

export class HttpService {
    /**
     * Perform a GET request bypassing CORS
     * @param url Target URL
     * @param headers Optional headers
     */
    static async get(url: string, headers: Record<string, string> = {}): Promise<any> {
        // Default headers to mimic a browser
        const defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        };

        const finalHeaders = { ...defaultHeaders, ...headers };
        console.log(`[HttpService] GET ${url}`);

        try {
            const response: HttpResponse = await CapacitorHttp.get({
                url,
                headers: finalHeaders
            });

            if (response.status >= 200 && response.status < 300) {
                return response.data;
            } else {
                throw new Error(`Request failed with status ${response.status}: ${response.data}`);
            }
        } catch (error: any) {
            console.error(`[HttpService] Error fetching ${url}:`, error);
            throw error;
        }
    }

    /**
     * Perform a POST request
     */
    static async post(url: string, data: any, headers: Record<string, string> = {}): Promise<any> {
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        const finalHeaders = { ...defaultHeaders, ...headers };

        try {
            const response: HttpResponse = await CapacitorHttp.post({
                url,
                headers: finalHeaders,
                data
            });

            if (response.status >= 200 && response.status < 300) {
                return response.data;
            } else {
                throw new Error(`Request failed with status ${response.status}: ${response.data}`);
            }
        } catch (error: any) {
            console.error(`[HttpService] Error POST ${url}:`, error);
            throw error;
        }
    }
}
