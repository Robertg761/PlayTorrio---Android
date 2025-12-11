
import { Preferences } from '@capacitor/preferences';

export class StorageService {
    static async get(key: string): Promise<string | null> {
        const { value } = await Preferences.get({ key });
        return value;
    }

    static async set(key: string, value: string): Promise<void> {
        await Preferences.set({ key, value });
    }

    static async remove(key: string): Promise<void> {
        await Preferences.remove({ key });
    }

    // Helper for JSON objects
    static async getObject<T>(key: string): Promise<T | null> {
        const value = await this.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch (e) {
            console.error(`Error parsing key ${key}:`, e);
            return null;
        }
    }

    static async setObject(key: string, value: any): Promise<void> {
        await this.set(key, JSON.stringify(value));
    }
}
