<script lang="ts">
	import Seo from '$lib/components/seo/Seo.svelte';
	import ContentPage from '$lib/components/seo/ContentPage.svelte';
	import { SITE_NAME, SITE_URL, canonical } from '$lib/seo/site';

	const title = '암송 DAY 여는 법 — 교회·소그룹 성경암송 행사 준비 가이드';
	const description =
		'성경암송 행사를 처음 준비하는 분을 위한 실전 가이드. 범위를 어떻게 정하고, 어떤 방식으로 점검하고, 무엇을 기록해야 행사가 한 번으로 끝나지 않는지 정리했습니다.';

	const steps = [
		{
			h: '1. 범위는 "다 외울 수 있는 양"으로 잡는다',
			body: '가장 흔한 실패가 범위 욕심입니다. 준비 기간이 4주라면 한 사람이 새로 외울 수 있는 양은 대개 20~30구절입니다. 그 이상을 걸면 절반은 시작도 전에 포기합니다. 인원 대부분이 완주할 수 있는 양으로 잡고, 더 하고 싶은 사람에게 도전 범위를 따로 여는 편이 참여율이 훨씬 높습니다.'
		},
		{
			h: '2. 기간은 4~6주, 중간 점검을 한 번 넣는다',
			body: '2주는 벼락치기가 되고 8주는 늘어집니다. 4~6주가 적당하고, 중간에 한 번 가볍게 점검하는 자리를 넣으면 진도가 눈에 보입니다. 이 중간 점검은 등수를 매기는 자리가 아니라 "지금 어디쯤인지" 확인하는 자리여야 합니다.'
		},
		{
			h: '3. 점검 방식을 미리 정해 공지한다',
			body: '무엇을 어떻게 확인할지 모르면 준비도 못 합니다. 세 가지가 흔히 쓰입니다 — <strong>개인 점검</strong>(각자 앱이나 종이로 확인), <strong>짝 점검</strong>(둘이 번갈아 듣고 확인), <strong>무대 발표</strong>(앞에서 한 사람씩). 대개 개인·짝 점검으로 준비하고 마지막 날만 발표로 마무리합니다.'
		},
		{
			h: '4. 장절까지 포함할지 정한다',
			body: '장절을 빼면 준비 부담이 크게 줄고, 넣으면 실제로 쓸 수 있는 암송이 됩니다. 처음 여는 행사라면 장절은 선택으로 두고 가산점만 주는 방식이 무난합니다. 중요한 것은 <strong>시작 전에 정해서 공지하는 것</strong>입니다. 당일에 정하면 반드시 불만이 나옵니다.'
		},
		{
			h: '5. 틀린 기준을 숫자로 합의한다',
			body: '"거의 맞았다"를 놓고 다투는 것만큼 행사 분위기를 망치는 것이 없습니다. 조사 하나 차이를 통과로 볼지, 단어 몇 개까지 허용할지를 미리 정하세요. 어느 쪽이든 괜찮습니다 — 모두에게 같은 기준이면 됩니다.'
		},
		{
			h: '6. 끝나고 기록을 남긴다',
			body: '행사의 진짜 성과는 당일이 아니라 그 다음에 나옵니다. 누가 어디까지 외웠는지 남겨두면 다음 행사의 시작점이 되고, 참가자 본인도 두 달 뒤에 무엇을 다시 봐야 하는지 압니다. 기록이 없으면 다음 행사는 또 맨바닥에서 시작합니다.'
		}
	];

	const pitfalls = [
		{
			h: '범위를 너무 크게 잡는다',
			body: '참여율이 무너지는 1번 원인입니다. 완주 경험이 다음 행사를 만듭니다.'
		},
		{
			h: '기준을 당일에 정한다',
			body: '통과 기준과 장절 포함 여부는 공지 시점에 확정하세요.'
		},
		{
			h: '잘하는 사람만 무대에 세운다',
			body: '행사가 시상식이 되면 다음 회차에 새 얼굴이 오지 않습니다. 완주 자체를 축하하는 자리를 따로 만드세요.'
		}
	];

	const faqs = [
		{
			q: '몇 명부터 할 수 있나요?',
			a: '두세 명이어도 됩니다. 오히려 소그룹일수록 짝 점검이 잘 돌아가고 서로의 진도가 보여서 완주율이 높습니다. 인원이 많으면 조를 나눠 조별로 점검하고 마지막만 함께 모이는 방식이 무난합니다.'
		},
		{
			q: '아이들과 어른을 같이 진행해도 되나요?',
			a: '범위를 나누면 됩니다. 같은 날 같은 자리에서 하되 연령대별로 구절 수를 다르게 주는 방식이 흔합니다. 같은 범위를 강요하면 한쪽은 지루하고 한쪽은 포기합니다.'
		},
		{
			q: '상품이나 시상이 꼭 필요한가요?',
			a: '없어도 됩니다. 다만 완주한 사람 전원에게 무언가 남기는 편이 좋습니다. 등수 상품 하나보다 완주 인증 전체가 다음 회차 참여를 훨씬 크게 좌우합니다.'
		},
		{
			q: '준비 기간에 참가자들이 뭘 하면 되나요?',
			a: '매일 짧게 꺼내보는 것이 전부입니다. 하루 한 구절씩 새로 넣고 이미 외운 것 서너 개를 점검하는 리듬이면 4주에 20~30구절이 쌓입니다. 자세한 방법은 암송 방법 문서를 참고하세요.'
		}
	];

	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Article',
				headline: title,
				description,
				inLanguage: 'ko-KR',
				mainEntityOfPage: canonical('/amsong-day'),
				publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL }
			},
			{
				'@type': 'FAQPage',
				mainEntity: faqs.map((f) => ({
					'@type': 'Question',
					name: f.q,
					acceptedAnswer: { '@type': 'Answer', text: f.a }
				}))
			}
		]
	};
</script>

<Seo {title} {description} path="/amsong-day" {jsonLd} />

<ContentPage>
	<h1 class="text-[30px] font-bold leading-tight text-[var(--color-text)] sm:text-[36px]">
		암송 DAY 여는 법
	</h1>
	<p class="mt-4 text-[17px] leading-[1.75] text-[var(--color-text-secondary)]">
		교회나 소그룹에서 성경암송 행사를 처음 준비할 때 막히는 지점은 대개 같습니다. 범위를 얼마나
		잡을지, 어떻게 확인할지, 틀린 걸 어디까지 봐줄지. 아래는 그 결정들을 <strong
			class="font-semibold text-[var(--color-text)]">행사 전에</strong
		> 끝내기 위한 순서입니다.
	</p>

	<h2 class="mt-12 text-[24px] font-bold text-[var(--color-text)]">준비 순서</h2>
	<ol class="mt-5 space-y-7">
		{#each steps as s (s.h)}
			<li>
				<h3 class="text-[19px] font-bold leading-snug text-[var(--color-text)]">{s.h}</h3>
				<p class="mt-2 text-[16px] leading-[1.8] text-[var(--color-text-secondary)]">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html s.body}
				</p>
			</li>
		{/each}
	</ol>

	<h2 class="mt-14 text-[24px] font-bold text-[var(--color-text)]">자주 하는 실수</h2>
	<div class="mt-5 grid gap-4 sm:grid-cols-3">
		{#each pitfalls as p (p.h)}
			<div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
				<h3 class="text-[15px] font-bold text-[var(--color-danger)]">{p.h}</h3>
				<p class="mt-1.5 text-[14px] leading-[1.7] text-[var(--color-text-secondary)]">{p.body}</p>
			</div>
		{/each}
	</div>

	<h2 class="mt-14 text-[24px] font-bold text-[var(--color-text)]">자주 묻는 질문</h2>
	<div class="mt-5 space-y-6">
		{#each faqs as f (f.q)}
			<div>
				<h3 class="text-[17px] font-semibold text-[var(--color-text)]">{f.q}</h3>
				<p class="mt-1.5 text-[16px] leading-[1.8] text-[var(--color-text-secondary)]">{f.a}</p>
			</div>
		{/each}
	</div>

	<div
		class="mt-14 rounded-2xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-6 text-center"
	>
		<h2 class="text-[20px] font-bold text-[var(--color-text)]">행사 준비에 쓸 수 있는 도구</h2>
		<p class="mt-2 text-[15px] leading-[1.7] text-[var(--color-text-secondary)]">
			MemScripture는 암송 범위를 묶어 진도를 함께 보여주고, 범위 전체를 엑셀로 내려받아 점검표로 쓸
			수 있습니다. 참가자는 각자 연습하고 점검한 기록이 남습니다.
		</p>
		<div class="mt-5 flex flex-wrap items-center justify-center gap-3">
			<a
				href="/"
				class="rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
			>
				바로 시작하기
			</a>
			<a
				href="/guide"
				class="rounded-full border border-[var(--color-border)] px-6 py-2.5 text-[14px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
			>
				암송 방법 읽기
			</a>
		</div>
	</div>
</ContentPage>
