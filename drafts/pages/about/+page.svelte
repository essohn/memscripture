<script lang="ts">
	import Seo from '$lib/components/seo/Seo.svelte';
	import ContentPage from '$lib/components/seo/ContentPage.svelte';
	import { SITE_NAME, SITE_URL, canonical } from '$lib/seo/site';

	const title = '소개 — 무료 성경 암송 앱';
	const description =
		'MemScripture는 성경 구절을 외우고 스스로 점검하는 무료 웹 앱입니다. 구절을 가린 채 한 단어씩 여는 연습, 직접 입력해 정확도와 속도를 재는 점검, 한 글자씩 여는 힌트, 난이도 기록과 구글 드라이브 동기화를 제공합니다.';

	const features = [
		{
			h: '가리고 한 단어씩 — 연습',
			body: '구절 전체를 가린 상태에서 좌우로 밀어 한 단어씩 엽니다. 막힐 때만 딱 필요한 만큼 열어보는 방식이라, 본문을 통째로 다시 읽는 것과 달리 매번 기억에서 꺼내는 연습이 됩니다.'
		},
		{
			h: '직접 입력해서 — 점검',
			body: '구절을 완전히 숨긴 채 기억나는 대로 입력하면, 원문과 대조해 어느 단어에서 갈라졌는지 표시합니다. 입력한 내용과 원문을 나란히 보여주므로 어떻게 틀렸는지가 남습니다.'
		},
		{
			h: '한 글자씩 여는 힌트',
			body: '막힌 지점의 다음 단어를 한 글자씩 엽니다. 누를 때마다 한 글자씩 더 열리고, 그 단어를 넘어가면 처음부터 다시 시작합니다. 답을 통째로 보는 대신 마지막 한 걸음만 스스로 딛게 합니다.'
		},
		{
			h: '난이도 기록',
			body: '구절마다 첫 시작과 전체 암송의 난이도를 1~5로 남깁니다. 입력 속도와 정확도로 자동 제안하되, 마지막 판단은 사용자가 합니다. 지난 점검 이력이 구절 옆에 함께 표시됩니다.'
		},
		{
			h: '구글 드라이브 동기화',
			body: '휴대폰에서 외운 진도를 데스크톱에서 이어갑니다. 개인 구글 드라이브의 앱 전용 폴더에만 저장되므로, 다른 사람은 물론 이 앱의 서버도 그 내용을 볼 수 없습니다.'
		},
		{
			h: '북마크와 암송 DAY',
			body: '색깔 리본으로 구절을 분류하고, 범위를 묶어 암송 DAY 행사에 쓸 수 있습니다. 행사 범위는 진도와 함께 표시되고 엑셀로 내려받을 수 있습니다.'
		}
	];

	const packages = [
		'그리스도와의 새출발 5구절',
		'그리스도와의 동행 8구절',
		'주제별 성경 암송 60구절',
		'확립 100구절',
		'주제별 성경 암송 180구절',
		'DEP 242구절',
		'무장 900구절'
	];

	const faqs = [
		{
			q: '정말 무료인가요?',
			a: '네. 결제도, 광고도, 구독도 없습니다. 회원가입 없이 바로 쓸 수 있고, 구글 로그인은 여러 기기에서 진도를 잇고 싶을 때만 선택적으로 씁니다.'
		},
		{
			q: '설치해야 하나요?',
			a: '아닙니다. 브라우저에서 주소를 열면 바로 동작합니다. 원한다면 휴대폰 홈 화면에 추가해 앱처럼 쓸 수 있습니다.'
		},
		{
			q: '내 암송 기록은 어디에 저장되나요?',
			a: '기본적으로 기기의 브라우저 안에만 저장됩니다. 구글 로그인을 연결하면 개인 드라이브의 앱 전용 폴더로 백업되어 다른 기기에서 이어집니다. 이 앱은 사용자의 기록을 자체 서버에 보관하지 않습니다.'
		},
		{
			q: '내가 원하는 구절을 직접 넣을 수 있나요?',
			a: '있습니다. 직접 추가한 구절도 제공되는 구절과 똑같이 연습·점검·난이도 기록을 쓸 수 있습니다.'
		}
	];

	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'SoftwareApplication',
				name: SITE_NAME,
				url: SITE_URL,
				description,
				applicationCategory: 'EducationalApplication',
				operatingSystem: 'Web',
				inLanguage: 'ko-KR',
				offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' }
			},
			{
				'@type': 'FAQPage',
				mainEntity: faqs.map((f) => ({
					'@type': 'Question',
					name: f.q,
					acceptedAnswer: { '@type': 'Answer', text: f.a }
				}))
			},
			{
				'@type': 'WebSite',
				name: SITE_NAME,
				url: SITE_URL,
				inLanguage: 'ko-KR'
			}
		]
	};
</script>

<Seo {title} {description} path="/about" {jsonLd} />

<ContentPage>
	<h1 class="text-[30px] font-bold leading-tight text-[var(--color-text)] sm:text-[36px]">
		외우는 것보다 점검이 어렵습니다
	</h1>
	<p class="mt-4 text-[17px] leading-[1.75] text-[var(--color-text-secondary)]">
		성경 암송을 도와주는 도구는 대개 구절을 <em>보여주는</em> 데서 멈춥니다. 그런데 실제로 필요한
		것은 구절을 <strong class="font-semibold text-[var(--color-text)]">가려주고, 내가 정말 아는지
			확인해주는</strong
		> 쪽입니다. MemScripture는 그 절반을 채우려고 만든 무료 웹 앱입니다.
	</p>

	<h2 class="mt-12 text-[24px] font-bold text-[var(--color-text)]">주요 기능</h2>
	<div class="mt-5 grid gap-5 sm:grid-cols-2">
		{#each features as f (f.h)}
			<div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
				<h3 class="text-[16px] font-bold text-[var(--color-text)]">{f.h}</h3>
				<p class="mt-1.5 text-[14.5px] leading-[1.7] text-[var(--color-text-secondary)]">
					{f.body}
				</p>
			</div>
		{/each}
	</div>

	<h2 class="mt-14 text-[24px] font-bold text-[var(--color-text)]">지원하는 암송 과정</h2>
	<p class="mt-2 text-[16px] leading-[1.8] text-[var(--color-text-secondary)]">
		널리 쓰이는 주제별 암송 과정을 개역한글 본문으로 담고 있습니다. 원하는 구절을 직접 추가할 수도
		있습니다.
	</p>
	<ul class="mt-4 flex flex-wrap gap-2">
		{#each packages as name (name)}
			<li
				class="rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-1.5 text-[14px] text-[var(--color-text-secondary)]"
			>
				{name}
			</li>
		{/each}
		<li
			class="rounded-full border border-dashed border-[var(--color-border)] px-3.5 py-1.5 text-[14px] text-[var(--color-text-tertiary)]"
		>
			직접 추가
		</li>
	</ul>

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
		<h2 class="text-[20px] font-bold text-[var(--color-text)]">지금 한 구절부터</h2>
		<p class="mt-2 text-[15px] leading-[1.7] text-[var(--color-text-secondary)]">
			가입도 설치도 없습니다. 브라우저에서 바로 열립니다.
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

	<p class="mt-10 text-[13px] leading-[1.7] text-[var(--color-text-tertiary)]">
		본문은 개역한글판을 사용합니다. 주제별 암송 과정의 구성과 구절 선정은 각 저작권자에게 권리가
		있으며, 이 앱은 학습 용도로 제공합니다.
	</p>
</ContentPage>
