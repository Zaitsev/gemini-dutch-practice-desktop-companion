import {version} from '../package.json';
export const srsIntervalsMinutes = [10, 1440, 3 * 1440, 7 * 1440, 16 * 1440, 35 * 1440, 90 * 1440];
export const MIN_SRS_LEVEL = 0;
export const MAX_SRS_LEVEL = 7;
export type SRSRating = 'again' | 'hard' | 'good' | 'easy';
export type ChallengeMode = 'normal' | 'reverse' | 'mixed';
export interface Config {
    intervalMinutes: number;
    idToken: string;
    refreshToken: string;
    uid: string;
    displayName: string;
    email: string;
    photoURL: string;
    useEmulator: boolean;
    autoHideOnAnswer: boolean;
    challengeMode: string;
}
export const APP_VERSION = version;
export const popUpIntervals = [15, 30, 60, 120]; // in minutes, for each rating category (again, hard, good, easy)
export const DEFAULT_DECK_ID = "default";
export const DEFAULT_DECK_LABEL = "Default";