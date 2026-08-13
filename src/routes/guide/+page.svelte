<script lang="ts">
	import Seo from '$lib/components/seo/Seo.svelte';
	import ContentPage from '$lib/components/seo/ContentPage.svelte';
	import { SITE_NAME, SITE_URL, canonical } from '$lib/seo/site';

	const title = '성경 암송 방법 — 오래 남기는 6가지 원칙';
	const description =
		'성경 구절을 외우는 가장 확실한 방법은 반복이 아니라 점검입니다. 도입부 따로 외우기, 눈이 아닌 손으로 외우기, 잊을 때쯤 다시 만나기까지 — 실제로 효과가 검증된 암송 원칙 6가지를 정리했습니다.';

	const faqs = [
		{
			q: '성경 구절 하나를 외우는 데 보통 얼마나 걸리나요?',
			a: '한 구절을 처음 입에 붙이는 데는 대개 5분에서 15분이면 충분합니다. 문제는 그 다음입니다. 하루 뒤에 다시 꺼내보지 않으면 대부분 사흘 안에 사라집니다. 처음 외우는 시간보다, 이후 2주 동안 네다섯 번 다시 점검하는 시간이 훨씬 중요합니다.'
		},
		{
			q: '하루에 몇 구절씩 외우는 것이 좋을까요?',
			a: '새 구절은 하루 한 구절이면 충분합니다. 대신 이미 외운 구절 서너 개를 함께 점검하세요. 새로 넣는 양보다 빠져나가는 양을 막는 것이 전체 개수를 늘립니다. 한 번에 다섯 구절씩 넣으면 2주 뒤에 남는 것은 대개 한두 구절입니다.'
		},
		{
			q: '외웠는지 어떻게 확인하나요?',
			a: '읽으면서 "안다"고 느끼는 것은 확인이 아닙니다. 본문을 완전히 가린 상태에서 처음부터 끝까지 막힘없이 나오는지, 그리고 그게 며칠 뒤에도 되는지가 유일한 기준입니다. 소리내어 말하거나 직접 입력해 원문과 대조하면 자기가 어디서 막히는지 정확히 드러납니다.'
		},
		{
			q: '장절(주소)도 같이 외워야 하나요?',
			a: '같이 외우는 편이 좋습니다. 장절은 구절을 꺼내는 손잡이 역할을 합니다. 본문만 외우면 필요한 순간에 떠올릴 실마리가 없습니다. 암송할 때 장절 → 본문 → 장절 순으로 앞뒤에 붙여서 한 덩어리로 외우는 방법이 널리 쓰입니다.'
		},
		{
			q: '오래된 구절은 언제 다시 점검해야 하나요?',
			a: '완전히 익숙해진 구절도 몇 달이 지나면 흐려집니다. 갓 외운 구절은 하루·사흘·일주일 간격으로, 자리 잡은 구절은 한두 달에 한 번씩 확인하면 유지됩니다. 핵심은 "잊기 직전"에 다시 만나는 것입니다. 완전히 잊은 뒤에 만나면 처음부터 다시 외우는 셈이 됩니다.'
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
				mainEntityOfPage: canonical('/guide'),
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

	const principles = [
		{
			n: 1,
			h: '한 번에 많이보다, 짧게 자주',
			body: '같은 30분이라도 한자리에서 30분을 쓰는 것보다 5분씩 여섯 번에 나누는 편이 훨씬 오래 남습니다. 기억은 들여다본 총 시간이 아니라 <strong>다시 꺼낸 횟수</strong>로 굳어지기 때문입니다. 출퇴근길, 점심 직후, 자기 전 — 하루에 세 번만 꺼내봐도 한 번에 몰아 외운 것보다 낫습니다.'
		},
		{
			n: 2,
			h: '도입부를 따로 외운다',
			body: '실제로 막히는 지점은 구절 중간이 아니라 <strong>시작</strong>입니다. 첫 두세 단어만 나오면 나머지는 따라 나오는 경우가 대부분입니다. 그래서 전체를 한 번 더 읽는 것보다, 장절을 보고 첫 단어가 즉시 튀어나오는지를 따로 연습하는 편이 효율이 높습니다. 시작이 3초 안에 나오는지를 별도로 재보세요.'
		},
		{
			n: 3,
			h: '눈으로 읽지 말고 손과 입으로 꺼낸다',
			body: '본문을 다시 읽는 것은 가장 편하고 가장 효과가 낮은 방법입니다. 읽을 때 느끼는 익숙함이 "외웠다"는 착각을 만들기 때문입니다. 소리내어 말하거나 종이에 쓰거나 직접 입력하는 것처럼, <strong>기억에서 꺼내야만 하는 방식</strong>이라야 실제로 굳습니다. 힘들게 느껴지는 것이 정상이고, 그 힘듦이 곧 효과입니다.'
		},
		{
			n: 4,
			h: '틀린 곳을 정확히 짚는다',
			body: '"대충 맞았다"로 넘어가면 틀린 채로 굳습니다. 조사 하나, 어순 하나가 어긋난 자리는 다음에도 똑같이 어긋납니다. 점검할 때는 원문과 나란히 놓고 <strong>어느 단어에서 갈라졌는지</strong>를 눈으로 확인하세요. 대개 한 구절에서 반복해 틀리는 지점은 한두 곳뿐이고, 그곳만 따로 손보면 됩니다.'
		},
		{
			n: 5,
			h: '막힐 때는 답이 아니라 힌트를 본다',
			body: '막혔다고 바로 원문을 펼치면 그 구절은 다시 "읽은" 것이 되어버립니다. 첫 글자만 보고 스스로 이어보세요. 한 글자로 안 되면 두 글자. <strong>스스로 꺼낸 마지막 한 걸음</strong>이 기억을 만듭니다. 답을 본 뒤 따라 읽은 것은 아무것도 남기지 않습니다.'
		},
		{
			n: 6,
			h: '잊을 때쯤 다시 만난다',
			body: '오늘 외운 구절은 내일, 사흘 뒤, 일주일 뒤, 한 달 뒤에 다시 만나야 합니다. 간격을 점점 벌리는 이 방식은 매일 똑같이 반복하는 것보다 적은 노력으로 더 오래 갑니다. 관건은 <strong>완전히 잊기 직전</strong>을 맞추는 것입니다. 너무 자주 보면 시간이 낭비되고, 너무 늦게 보면 처음부터 다시 외우게 됩니다.'
		}
	];
</script>

<Seo {title} {description} path="/guide" {jsonLd} />

<ContentPage>
	<h1 class="text-[30px] font-bold leading-tight text-[var(--color-text)] sm:text-[36px]">
		성경 암송 방법 — 오래 남기는 6가지 원칙
	</h1>
	<p class="mt-4 text-[17px] leading-[1.75] text-[var(--color-text-secondary)]">
		성경 암송이 잘 안 되는 이유는 대개 노력이 부족해서가 아니라, <strong
			class="font-semibold text-[var(--color-text)]">방법이 반복에만 기대고 있어서</strong
		>입니다. 읽고 또 읽는 동안 뇌는 그 문장에 익숙해질 뿐 그것을 꺼내는 연습은 한 번도 하지 않습니다.
		아래 여섯 가지는 그 차이를 메우는 원칙입니다.
	</p>

	<ol class="mt-10 space-y-8">
		{#each principles as p (p.n)}
			<li>
				<h2 class="text-[21px] font-bold leading-snug text-[var(--color-text)]">
					<span class="mr-2 text-[var(--color-accent)]">{p.n}.</span>{p.h}
				</h2>
				<p class="mt-2 text-[16px] leading-[1.8] text-[var(--color-text-secondary)]">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html p.body}
				</p>
			</li>
		{/each}
	</ol>

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
		<h2 class="text-[20px] font-bold text-[var(--color-text)]">
			이 여섯 가지를 그대로 담은 앱
		</h2>
		<p class="mt-2 text-[15px] leading-[1.7] text-[var(--color-text-secondary)]">
			MemScripture는 구절을 가린 채 한 단어씩 여는 연습, 직접 입력해 틀린 곳을 짚는 점검, 한 글자씩
			여는 힌트, 난이도 기록을 한 화면에서 제공합니다. 무료이고 설치가 필요 없습니다.
		</p>
		<div class="mt-5 flex flex-wrap items-center justify-center gap-3">
			<a
				href="/"
				class="rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
			>
				바로 시작하기
			</a>
			<a
				href="/about"
				class="rounded-full border border-[var(--color-border)] px-6 py-2.5 text-[14px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
			>
				앱 소개 보기
			</a>
		</div>
	</div>
</ContentPage>
