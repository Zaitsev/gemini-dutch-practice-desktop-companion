export namespace main {
	
	export class Config {
	    intervalMinutes: number;
	    idToken: string;
	    refreshToken: string;
	    uid: string;
	    displayName: string;
	    email: string;
	    photoURL: string;
	    useEmulator: boolean;
	    windowX: number;
	    windowY: number;
	    windowW: number;
	    windowH: number;
	    windowPositionSaved: boolean;
	    dndEndTimestamp: number;
	    dndDurationMinutes: number;
	    autoHideOnAnswer: boolean;
	    challengeMode: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.intervalMinutes = source["intervalMinutes"];
	        this.idToken = source["idToken"];
	        this.refreshToken = source["refreshToken"];
	        this.uid = source["uid"];
	        this.displayName = source["displayName"];
	        this.email = source["email"];
	        this.photoURL = source["photoURL"];
	        this.useEmulator = source["useEmulator"];
	        this.windowX = source["windowX"];
	        this.windowY = source["windowY"];
	        this.windowW = source["windowW"];
	        this.windowH = source["windowH"];
	        this.windowPositionSaved = source["windowPositionSaved"];
	        this.dndEndTimestamp = source["dndEndTimestamp"];
	        this.dndDurationMinutes = source["dndDurationMinutes"];
	        this.autoHideOnAnswer = source["autoHideOnAnswer"];
	        this.challengeMode = source["challengeMode"];
	    }
	}
	export class DndStatus {
	    active: boolean;
	    endTimestamp: number;
	    remainingMs: number;
	    durationMinutes: number;
	
	    static createFrom(source: any = {}) {
	        return new DndStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.endTimestamp = source["endTimestamp"];
	        this.remainingMs = source["remainingMs"];
	        this.durationMinutes = source["durationMinutes"];
	    }
	}
	export class Word {
	    id: string;
	    dutch: string;
	    english: string;
	    context?: string;
	    addedAt: number;
	    creatorId: string;
	    examples?: any[];
	    srsLevel: number;
	    nextReviewAt: number;
	    wordAudioUrl?: string;
	    wordTeacherAudioUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new Word(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.dutch = source["dutch"];
	        this.english = source["english"];
	        this.context = source["context"];
	        this.addedAt = source["addedAt"];
	        this.creatorId = source["creatorId"];
	        this.examples = source["examples"];
	        this.srsLevel = source["srsLevel"];
	        this.nextReviewAt = source["nextReviewAt"];
	        this.wordAudioUrl = source["wordAudioUrl"];
	        this.wordTeacherAudioUrl = source["wordTeacherAudioUrl"];
	    }
	}

}

