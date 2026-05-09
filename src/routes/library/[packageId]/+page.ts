import { error } from '@sveltejs/kit';
import { listPackages, loadPackageData } from '$lib/db/verses';
import type { PageLoad } from './$types';

export const prerender = false;

export const load: PageLoad = async ({ params }) => {
	const packageId = params.packageId!;
	const allPackages = await listPackages();
	const pkg = allPackages.find((p) => p.id === packageId);
	if (!pkg) {
		error(404, '패키지를 찾을 수 없습니다.');
	}
	const data = await loadPackageData(packageId);
	return {
		allPackages,
		pkg,
		verses: data.verses,
		groups: data.groups,
		tagsByVerseNo: data.tagsByVerseNo
	};
};
