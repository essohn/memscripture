<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';
	import { goto } from '$app/navigation';
	import { Cloud, CloudOff, RotateCcw, BookOpen, Volume2 } from 'lucide-svelte';
	import {
		koreanVoices,
		speak,
		speechSegments,
		voiceGender,
		type VoiceLike
	} from '$lib/memorize/speak';
	import {
		SPEAK_RATES,
		getSpeakOptions,
		setSpeakOption,
		type SpeakRate
	} from '$lib/db/viewOptions';
	import { getGoogleOauthClientId } from '$lib/sync/clientId';
	import {
		connectGoogleDrive,
		disconnectGoogleDrive,
		getCurrentAuth,
		type GoogleAuthState
	} from '$lib/cloud/google';
	import { performSync, type SyncResult } from '$lib/sync/syncFlow';
	import {
		applySyncSnapshot
	} from '$lib/sync/snapshot';
	import {
		clearPreSyncBackup,
		loadPreSyncBackup
	} from '$lib/sync/preSyncBackup';

	const clientId = getGoogleOauthClientId();

	let speakTitle = $state(false);
	let speakRepeat = $state(false);
	let speakRate = $state<SpeakRate>(0.9);
	let speakVoice = $state('');
	let speakGender = $state<'male' | 'female' | 'auto'>('auto');
	const GENDERS = [
		{ id: 'auto', label: '자동' },
		{ id: 'female', label: '여성' },
		{ id: 'male', label: '남성' }
	] as const;
	const GENDER_LABEL = { male: '남', female: '여' } as const;
	let voices = $state<VoiceLike[]>([]);

	// getVoices() is commonly empty on first call and filled asynchronously, so
	// the list is read again when the browser says it changed.
	$effect(() => {
		const load = () => (voices = koreanVoices());
		load();
		speechSynthesis?.addEventListener?.('voiceschanged', load);
		return () => speechSynthesis?.removeEventListener?.('voiceschanged', load);
	});
	$effect(() => {
		getSpeakOptions()
			.then((o) => {
				speakTitle = o.speakTitle;
				speakRepeat = o.speakRepeat;
				speakRate = o.speakRate;
				speakVoice = o.speakVoice;
				speakGender = o.speakGender;
			})
			.catch(() => {});
	});
	let auth = $state<GoogleAuthState | null>(null);

	let confirmState = $state<{
		open: boolean;
		resolve: ((ok: boolean) => void) | null;
	}>({ open: false, resolve: null });

	function showOverwriteConfirm(): Promise<boolean> {
		return new Promise((resolve) => {
			confirmState = { open: true, resolve };
		});
	}

	function onConfirm() {
		confirmState.resolve?.(true);
		confirmState = { open: false, resolve: null };
	}

	function onCancel() {
		confirmState.resolve?.(false);
		confirmState = { open: false, resolve: null };
	}
	let hasBackup = $state(false);
	let syncing = $state(false);
	let toast = $state<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);

	$effect(() => {
		let active = true;
		(async () => {
			const [a, b] = await Promise.all([getCurrentAuth(), loadPreSyncBackup()]);
			if (active) {
				auth = a;
				hasBackup = b !== null;
			}
		})().catch(() => {});
		return () => {
			active = false;
		};
	});

	async function onConnect() {
		if (!clientId) return;
		try {
			auth = await connectGoogleDrive(clientId);
			toast = { message: `${auth.email}으로 연결되었습니다` };
		} catch (err) {
			toast = { message: '연결 실패: 다시 시도해주세요' };
		}
	}

	async function onDisconnect() {
		try {
			await disconnectGoogleDrive();
			auth = null;
			toast = { message: 'Drive 연결이 해제되었습니다' };
		} catch (err) {
			console.error('[sync] disconnect failed:', err);
			toast = { message: '연결 해제 실패: 다시 시도해주세요' };
		}
	}

	async function onSync() {
		if (syncing) return;
		syncing = true;
		try {
			const result = await performSync(
				{ confirmOverwrite: showOverwriteConfirm },
				clientId
			);
			hasBackup = (await loadPreSyncBackup()) !== null;
			toast = { message: messageFor(result) };
		} finally {
			// Always reset the button even if the post-sync settings read throws.
			syncing = false;
		}
	}

	function messageFor(result: SyncResult): string {
		switch (result.kind) {
			case 'no-remote-uploaded':
				return 'Drive에 처음 저장했습니다';
			case 'remote-equal':
				return '이미 최신 상태입니다';
			case 'local-newer-uploaded':
				return 'Drive로 올렸습니다';
			case 'remote-newer-imported':
				return 'Drive에서 받아왔습니다';
			case 'remote-newer-declined':
				return '동기화를 취소했습니다';
			case 'error':
				return `동기화 실패: ${result.message}`;
		}
	}

	async function onUndo() {
		try {
			const backup = await loadPreSyncBackup();
			if (!backup) return;
			await applySyncSnapshot(backup);
			await clearPreSyncBackup();
			hasBackup = false;
			toast = { message: '직전 동기화를 되돌렸습니다' };
		} catch (err) {
			console.error('[sync] undo failed:', err);
			toast = { message: '되돌리기 실패: 다시 시도해주세요' };
		}
	}
</script>

<Header title="Settings" onBack={() => goto('/')} showSettings={false} showVerseToggle={false} />

<main class="mx-auto max-w-2xl px-5 pt-6">
	<section
		class="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Cloud size={18} strokeWidth={1.75} />
			클라우드 동기화
		</h2>

		{#if !clientId}
			<p class="mt-3 text-[13px] text-[var(--color-text-tertiary)]">
				이 배포에는 Google OAuth 클라이언트 ID가 설정되지 않았습니다.
				docs/google-drive-setup.md를 참고하세요.
			</p>
		{:else if !auth}
			<p class="mt-3 text-[13px] text-[var(--color-text-secondary)]">
				Drive와 연결되지 않음
			</p>
			<button
				type="button"
				onclick={onConnect}
				class="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
			>
				Google Drive 연결
			</button>
		{:else}
			<p class="mt-3 text-[13px] text-[var(--color-text-secondary)]">
				연결됨 · <span class="font-medium text-[var(--color-text)]">{auth.email}</span>
			</p>
			<div class="mt-4 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={onSync}
					disabled={syncing}
					class="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{syncing ? '동기화 중…' : '지금 동기화'}
				</button>
				{#if hasBackup}
					<button
						type="button"
						onclick={onUndo}
						class="inline-flex items-center gap-2 rounded-full bg-[var(--color-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
					>
						<RotateCcw size={14} strokeWidth={1.75} />
						직전 동기화 되돌리기
					</button>
				{/if}
				<button
					type="button"
					onclick={onDisconnect}
					class="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-danger)]"
				>
					<CloudOff size={14} strokeWidth={1.75} />
					연결 해제
				</button>
			</div>
		{/if}
	</section>

	<section
		class="mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Volume2 size={18} strokeWidth={1.75} />
			구절 읽어주기
		</h2>
		<p class="mt-2 text-[12px] text-[var(--color-text-secondary)]">
			카드의 스피커 버튼으로 장절과 본문을 들을 수 있습니다.
		</p>

		<label class="mt-4 flex items-center justify-between gap-3">
			<span class="text-[13px] text-[var(--color-text)]">제목도 함께 읽기</span>
			<input
				type="checkbox"
				checked={speakTitle}
				onchange={(e) => {
					speakTitle = e.currentTarget.checked;
					setSpeakOption('speakTitle', speakTitle);
				}}
				class="h-4 w-4 accent-[var(--color-accent)]"
			/>
		</label>

		<label class="mt-3 flex items-center justify-between gap-3">
			<span class="text-[13px] text-[var(--color-text)]">
				무한 반복
				<span class="block text-[11px] text-[var(--color-text-tertiary)]">
					중지를 누를 때까지 계속 읽습니다
				</span>
			</span>
			<input
				type="checkbox"
				checked={speakRepeat}
				onchange={(e) => {
					speakRepeat = e.currentTarget.checked;
					setSpeakOption('speakRepeat', speakRepeat);
				}}
				class="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
			/>
		</label>

		{#if voices.length > 0}
			<div class="mt-4">
				<span class="text-[13px] text-[var(--color-text)]">목소리 성별</span>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each GENDERS as g (g.id)}
						<button
							type="button"
							aria-pressed={speakGender === g.id}
							onclick={() => {
								speakGender = g.id;
								setSpeakOption('speakGender', g.id);
							}}
							class="rounded-full border px-3 py-1 text-[12px] font-medium transition-colors {speakGender ===
							g.id
								? 'border-transparent bg-[var(--color-accent)] text-white'
								: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'}"
						>
							{g.label}
						</button>
					{/each}
				</div>
				<p class="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
					자동은 기기에서 가장 품질이 좋은 음성을 씁니다. 기기에 해당 성별의 한국어 음성이 없으면
					가장 좋은 음성으로 대신합니다.
				</p>
			</div>

			<div class="mt-4">
				<span class="text-[13px] text-[var(--color-text)]">목소리</span>
				<div class="mt-2 flex items-center gap-2">
					<select
						bind:value={speakVoice}
						onchange={() => setSpeakOption('speakVoice', speakVoice)}
						aria-label="읽어줄 목소리"
						class="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-text)]"
					>
						<option value="">자동 (가장 좋은 음성)</option>
						{#each voices as v (v.name)}
							{@const g = voiceGender(v.name)}
							<option value={v.name}>
								{v.name}{g ? ` (${GENDER_LABEL[g]})` : ''}{v.localService === false
									? ' · 신경망'
									: ''}
							</option>
						{/each}
					</select>
					<button
						type="button"
						onclick={() =>
							speak(speechSegments({ cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' }), {
								rate: speakRate,
								voice: speakVoice || undefined,
								gender: speakGender === 'auto' ? undefined : speakGender
							})}
						class="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
					>
						들어보기
					</button>
				</div>
				<p class="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
					비워두면 위 성별 설정에 따라 자동으로 고릅니다. iPhone은 설정 → 손쉬운 사용 → 라이브
					음성에서 고품질 한국어 음성을 내려받으면 더 좋아집니다.
				</p>
			</div>
		{/if}

		<div class="mt-4">
			<span class="text-[13px] text-[var(--color-text)]">읽는 속도</span>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each SPEAK_RATES as r (r)}
					<button
						type="button"
						aria-pressed={speakRate === r}
						onclick={() => {
							speakRate = r;
							setSpeakOption('speakRate', r);
						}}
						class="rounded-full border px-3 py-1 text-[12px] font-medium tabular-nums transition-colors {speakRate ===
						r
							? 'border-transparent bg-[var(--color-accent)] text-white'
							: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'}"
					>
						{r}x
					</button>
				{/each}
			</div>
		</div>
	</section>

	<!-- The search-landing pages, linked from inside the app. Users get the
	     method guide where they would look for help; crawlers get a path to
	     them that does not depend on the sitemap alone. -->
	<section
		class="mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<BookOpen size={18} strokeWidth={1.75} />
			읽을거리
		</h2>
		<div class="mt-3 flex flex-col gap-2">
			<a
				href="/guide"
				class="text-[13px] font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
			>
				성경 암송 방법 — 오래 남기는 6가지 원칙
			</a>
			<a
				href="/amsong-day"
				class="text-[13px] font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
			>
				암송 DAY 여는 법 — 행사 준비 가이드
			</a>
			<a
				href="/about"
				class="text-[13px] font-medium text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
			>
				MemScripture 소개
			</a>
		</div>
	</section>
</main>

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}

<ConfirmDialog
	open={confirmState.open}
	title="Drive에서 받아오기"
	body="Drive에 더 최신 데이터가 있습니다. 가져오면 로컬 변경사항이 덮어쓰여집니다."
	confirmLabel="덮어쓰고 받기"
	cancelLabel="취소"
	onConfirm={onConfirm}
	onCancel={onCancel}
/>
