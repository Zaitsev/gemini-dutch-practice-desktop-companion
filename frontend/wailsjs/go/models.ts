export namespace main {
	
	export class Config {
	    intervalMinutes: number;
	    idToken: string;
	    uid: string;
	    displayName: string;
	    email: string;
	    photoURL: string;
	    useEmulator: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.intervalMinutes = source["intervalMinutes"];
	        this.idToken = source["idToken"];
	        this.uid = source["uid"];
	        this.displayName = source["displayName"];
	        this.email = source["email"];
	        this.photoURL = source["photoURL"];
	        this.useEmulator = source["useEmulator"];
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
	    }
	}

}

