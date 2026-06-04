export const srsIntervalsMinutes = [10, 1440, 3 * 1440, 7 * 1440, 16 * 1440, 35 * 1440, 90 * 1440];
export const MIN_SRS_LEVEL = 0;
export const MAX_SRS_LEVEL = 7;
export type SRSRating = 'again' | 'hard' | 'good' | 'easy';
export interface Config {
    intervalMinutes: number;
    displayName: string;
    email: string;
    photoURL: string;
    useEmulator: boolean;
}