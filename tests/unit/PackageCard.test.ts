import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PackageCard from '../../src/lib/components/PackageCard.svelte';
import type { PackageMeta } from '../../src/lib/types';

const base: PackageMeta = {
	id: 'pkg',
	name: 'Sample',
	abbreviation: 'SP',
	verse_number: 5,
	translation: 'krv',
	translation_name: '개역한글',
	language: 'kor',
	copyright: '',
	copyright_text: '',
	version: 1,
	source: 'data/sample.json',
	default: false,
	kind: 'builtin'
};

describe('PackageCard', () => {
	it('shows "사용자 정의" chip when kind === "user"', () => {
		render(PackageCard, { props: { pkg: { ...base, kind: 'user' } } });
		expect(screen.getByText('사용자 정의')).toBeInTheDocument();
	});

	it('does not show the chip when kind === "builtin"', () => {
		render(PackageCard, { props: { pkg: { ...base, kind: 'builtin' } } });
		expect(screen.queryByText('사용자 정의')).toBeNull();
	});
});
