import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import GroupList from '../../src/lib/components/GroupList.svelte';
import type { StoredVerse } from '../../src/lib/db/local';

const verses: StoredVerse[] = [
	{
		package_id: 'pkg',
		no: 1,
		i: 1,
		title: '중심되신 그리스도',
		cite: '고후 5:17',
		w: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라'
	}
];

const baseProps = {
	packageId: 'pkg',
	verses,
	tagsByVerseNo: new Map()
};

describe('GroupList', () => {
	it('renders verse body when showVerseText=true', () => {
		render(GroupList, { props: { ...baseProps, showVerseText: true } });
		expect(
			screen.getByText('그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라')
		).toBeInTheDocument();
	});

	it('does not render verse body when showVerseText=false', () => {
		render(GroupList, { props: { ...baseProps, showVerseText: false } });
		expect(
			screen.queryByText('그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라')
		).toBeNull();
	});

	it('does not render an empty paragraph when v.w is empty', () => {
		const empty: StoredVerse[] = [{ ...verses[0], w: '' }];
		const { container } = render(GroupList, {
			props: { ...baseProps, verses: empty, showVerseText: true }
		});
		// the body paragraph uses leading-[1.55]; if absent, no element should match.
		expect(container.querySelector('p[class*="leading-[1.55]"]')).toBeNull();
	});

	it('still renders title and cite regardless of showVerseText', () => {
		render(GroupList, { props: { ...baseProps, showVerseText: false } });
		expect(screen.getByText('중심되신 그리스도')).toBeInTheDocument();
		expect(screen.getByText('고후 5:17')).toBeInTheDocument();
	});
});
