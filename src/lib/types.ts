export interface Verse {
	i: number;
	title: string;
	cite: string;
	w: string;
}

export interface PackageMeta {
	id: string;
	name: string;
	verse_number: number;
	translation: 'krv';
	translation_name: string;
	abbreviation: string;
	language: 'kor';
	copyright: string;
	copyright_text: string;
	version: number;
	source: string;
	default: boolean;
}

export interface IndexGroup {
	package_id: string;
	group_name: string;
	level: 1 | 2;
	index: number[];
}

export type Bucket = 'new' | 'current' | 'old' | 'mastered';

export interface VerseProgress {
	id: string; // composite key: `${packageId}:${verseNo}`
	packageId: string;
	verseNo: number;
	bucket: Bucket;
	enteredBucketAt: number; // ms timestamp; reset on bucket transition
	daysActiveInBucket: number; // count of distinct active days while in current bucket
	lastReviewedAt: number;
	citeRatings: number[]; // sliding window: last 10 ratings (1=Again, 4=Easy)
	recallRatings: number[]; // sliding window: last 10 ratings
	/** 'YYYY-MM-DD' (local) of last review day; drives daysActiveInBucket increment. */
	lastActiveDayKey?: string;
}

export interface DailyActivity {
	dateKey: string; // local-date 'YYYY-MM-DD'
}
