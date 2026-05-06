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
