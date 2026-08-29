<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Cloud, CloudOff, Gamepad2, RotateCcw, Volume2, Users } from 'lucide-svelte';
	import { arcade } from '$lib/state/arcade.svelte';
	import {
		getJoinedGroups,
		joinGroup,
		leaveGroup,
		loadGroupCatalog,
		type GroupInfo
	} from '$lib/db/groups';
	import {
		allDeviceVoices,
		isTtsSupported,
		koreanVoices,
		pollForVoices,
		probeSpeech,
		speak,
		speechSegments,
		voiceGender,
		type SpeechProbe,
		type VoiceLike
	} from '$lib/memorize/speak';
	import {
		RECITE_SCALES,
		SPEAK_RATES,
		getSpeakOptions,
		setSpeakOption,
		type ReciteScale,
		type SpeakRate
	} from '$lib/db/viewOptions';
	import { getGoogleOauthClientId } from '$lib/sync/clientId';
	import { beginConnect } from '$lib/cloud/connect';
	import {
		AUTH_SCOPES,
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

	let joined = $state<GroupInfo[]>([]);
	let teamSection = $state<HTMLElement | undefined>();
	let teamHighlighted = $state(false);

	/**
	 * Arriving from the home hint lands on #team.
	 *
	 * The browser's own anchor jump does not fire reliably here: the section is
	 * rendered after the settings reads resolve, so at navigation time the
	 * element the hash names does not exist yet. Scrolling once it does is the
	 * only moment that works, and the ring says which of six sections the link
	 * meant.
	 */
	$effect(() => {
		if (!teamSection || page.url.hash !== '#team') return;
		teamSection.scrollIntoView({ block: 'center', behavior: 'smooth' });
		teamHighlighted = true;
		const id = setTimeout(() => (teamHighlighted = false), 2000);
		return () => clearTimeout(id);
	});
	let groupCode = $state('');
	let groupMessage = $state<{ ok: boolean; text: string } | null>(null);

	async function refreshGroups() {
		const [ids, catalog] = await Promise.all([getJoinedGroups(), loadGroupCatalog()]);
		joined = ids.map((id) => catalog[id] ?? { id, name: id });
	}
	$effect(() => {
		refreshGroups().catch(() => {});
	});

	async function onJoin() {
		const info = await joinGroup(groupCode);
		if (!info) {
			groupMessage = { ok: false, text: '그런 코드의 팀이 없습니다' };
			return;
		}
		groupCode = '';
		groupMessage = { ok: true, text: `${info.name}에 참여했습니다` };
		await refreshGroups();
	}

	async function onLeave(id: string) {
		await leaveGroup(id);
		groupMessage = null;
		await refreshGroups();
	}

	let speakTitle = $state(false);
	let speakRepeat = $state(false);
	let speakListRepeat = $state(true);
	let speakRate = $state<SpeakRate>(0.9);
	let reciteScale = $state<ReciteScale>(1);
	let speakVoice = $state('');
	let speakGender = $state<'male' | 'female' | 'auto'>('auto');
	const GENDERS = [
		{ id: 'auto', label: '자동' },
		{ id: 'female', label: '여성' },
		{ id: 'male', label: '남성' }
	] as const;
	const GENDER_LABEL = { male: '남', female: '여' } as const;
	let voices = $state<VoiceLike[]>([]);
	/** Every voice the device reports, Korean or not. Offered when nothing here
	 *  looks Korean — the tagging can be wrong where the voice is fine. */
	let deviceVoices = $state<VoiceLike[]>([]);

	/*
	 * The diagnostic's own state.
	 *
	 * ttsSupported is read here rather than in the template because it is the
	 * same question the home card asks before showing its play button — a
	 * browser that answers 없음 here is one where that button is missing, and
	 * that is worth being able to check rather than guess at.
	 */
	const ttsSupported = isTtsSupported();
	let probe = $state<SpeechProbe | null>(null);
	let probing = $state(false);
	const browser = typeof navigator === 'undefined' ? '' : navigator.userAgent;

	async function runProbe() {
		probing = true;
		probe = null;
		try {
			probe = await probeSpeech();
		} finally {
			probing = false;
		}
	}

	// getVoices() is commonly empty on first call and filled asynchronously, so
	// the list is read again when the browser says it changed — and, because on
	// Android that event either fires before anything is listening or not at
	// all, asked for again on a short timer until it arrives.
	$effect(() => {
		const load = () => {
			voices = koreanVoices();
			deviceVoices = allDeviceVoices();
		};
		load();
		speechSynthesis?.addEventListener?.('voiceschanged', load);
		const stopPolling = pollForVoices({
			read: koreanVoices,
			emit: load,
			schedule: (fn, ms) => setTimeout(fn, ms) as unknown as number,
			cancel: (id) => clearTimeout(id)
		});
		return () => {
			speechSynthesis?.removeEventListener?.('voiceschanged', load);
			stopPolling();
		};
	});
	// The switch has to show what is stored, not the optimistic default the
	// state module starts on. load() is a no-op after the first call, so
	// arriving here from the quiz costs nothing.
	$effect(() => {
		void arcade.load();
	});
	$effect(() => {
		getSpeakOptions()
			.then((o) => {
				speakTitle = o.speakTitle;
				speakRepeat = o.speakRepeat;
				speakListRepeat = o.speakListRepeat;
				speakRate = o.speakRate;
				reciteScale = o.reciteScale;
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

	/**
	 * Sends the reader to Google's consent screen.
	 *
	 * A redirect, not the old popup: the code it comes back with can be traded
	 * for a refresh token, and that is what lets every later renewal happen as
	 * a plain fetch — no window appearing on launch, which is what the popup
	 * flow cost. The callback at /auth/google/callback finishes the job and
	 * returns here.
	 */
	async function onConnect() {
		if (!clientId) return;
		try {
			location.href = await beginConnect({
				clientId,
				scope: AUTH_SCOPES,
				origin: location.origin,
				store: sessionStorage
			});
		} catch {
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
			case 'merged':
				return '동기화했습니다 — 양쪽 기록을 합쳤습니다';
			// Only an unattended sync can be deferred; this button is attended,
			// so it never gates. Handled anyway because the type says it can be.
			case 'deferred':
				return '암송 중이라 잠시 후 다시 시도해주세요';
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

	/**
	 * Back to wherever the reader came from.
	 *
	 * Settings is reached from the gear in the shared Header, which sits on
	 * nearly every screen — so there is no single parent to return to. Sending
	 * them Home dropped them out of whatever list they were working through,
	 * a difficulty group or a search result, with no way back to it. Home is
	 * only the fallback for a cold load with no history to pop.
	 */
	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else goto('/');
	}
</script>

<Header title="Settings" onBack={goBack} showSettings={false} showVerseToggle={false} />

<main class="mx-auto max-w-2xl px-5 pt-6">
	<section
		class="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Cloud size={18} strokeWidth={1.75} />
			클라우드 동기화
		</h2>

		<!-- Stated before the connect button, not after: what an app will reach
		     for in someone's Drive is the question they have while deciding, and
		     Google's own consent screen names scopes rather than purposes. Every
		     clause here is one the code can be held to — drive.file reaches only
		     files this app created, and the email is read solely to show which
		     account is connected. -->
		<p class="mt-2 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
			암송 기록을 내 Google Drive에 저장해 다른 기기에서 이어서 보기 위한 용도로만
			사용합니다. 이 앱이 만든 파일(동기화 파일과 직접 내보낸 Google Sheets 문서)에만
			접근하며, 연결된 계정을 보여주기 위해 이메일 주소를 읽습니다.
		</p>

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
			{#if !auth.refreshToken}
				<!-- Connected under the old flow, which has no refresh token: every
				     renewal still opens a popup, and the launch sync skips this
				     device rather than summoning one. Reconnecting once fixes both,
				     and nobody would guess that on their own. -->
				<p class="mt-2 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
					다시 연결하면 로그인 창 없이 자동으로 갱신되고, 앱을 열 때마다 동기화됩니다.
					<button
						type="button"
						onclick={onConnect}
						class="font-semibold text-[var(--color-accent)] underline underline-offset-2"
					>
						다시 연결
					</button>
				</p>
			{/if}
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
		id="team"
		bind:this={teamSection}
		class="mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5 transition-shadow {teamHighlighted
			? 'ring-2 ring-[var(--color-accent)]'
			: ''}"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Users size={18} strokeWidth={1.75} />
			소속 팀
		</h2>
		<p class="mt-2 text-[12px] leading-[1.7] text-[var(--color-text-secondary)]">
			팀에 참여하면 그 팀의 구절 패키지와 암송 DAY 일정이 함께 열립니다.
		</p>

		{#if joined.length > 0}
			<ul class="mt-3 space-y-1.5">
				{#each joined as g (g.id)}
					<li
						class="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-elevated)] px-3.5 py-2"
					>
						<span class="text-[13px] font-medium text-[var(--color-text)]">{g.name}</span>
						<button
							type="button"
							onclick={() => onLeave(g.id)}
							class="shrink-0 text-[12px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-danger)]"
						>
							나가기
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			class="mt-3 flex items-center gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				onJoin();
			}}
		>
			<input
				bind:value={groupCode}
				type="text"
				autocapitalize="characters"
				aria-label="팀 코드"
				placeholder="팀 코드"
				class="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
			/>
			<button
				type="submit"
				disabled={groupCode.trim().length === 0}
				class="shrink-0 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				참여
			</button>
		</form>
		{#if groupMessage}
			<p
				class="mt-2 text-[12px] {groupMessage.ok
					? 'text-[var(--color-success)]'
					: 'text-[var(--color-danger)]'}"
			>
				{groupMessage.text}
			</p>
		{/if}
		<p class="mt-2 text-[11px] leading-[1.6] text-[var(--color-text-tertiary)]">
			나가더라도 이미 받은 구절과 암송 기록은 그대로 남습니다.
		</p>
	</section>

	<section
		class="mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5"
	>
		<h2 class="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
			<Gamepad2 size={18} strokeWidth={1.75} />
			퀴즈 게임
		</h2>
		<p class="mt-2 text-[12px] text-[var(--color-text-secondary)]">
			요격, 콤보, 벽이 부서지는 효과에 소리가 붙습니다. 앱의 다른 곳은 소리를 내지 않습니다.
		</p>

		<label class="mt-4 flex items-center justify-between gap-3">
			<span class="text-[13px] text-[var(--color-text)]">
				효과음
				<span class="block text-[11px] text-[var(--color-text-tertiary)]">
					화면 움직임은 기기의 &lsquo;동작 줄이기&rsquo; 설정을 따릅니다
				</span>
			</span>
			<input
				type="checkbox"
				checked={arcade.sound}
				onchange={(e) => arcade.setSound(e.currentTarget.checked)}
				class="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
				aria-label="퀴즈 게임 효과음"
			/>
		</label>
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

		<label class="mt-3 flex items-center justify-between gap-3">
			<span class="text-[13px] text-[var(--color-text)]">
				전체 듣기 반복
				<span class="block text-[11px] text-[var(--color-text-tertiary)]">
					목록이 끝나면 처음부터 다시 재생합니다
				</span>
			</span>
			<input
				type="checkbox"
				checked={speakListRepeat}
				onchange={(e) => {
					speakListRepeat = e.currentTarget.checked;
					setSpeakOption('speakListRepeat', speakListRepeat);
				}}
				class="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
			/>
		</label>

		{#if voices.length === 0}
			<!-- The picker used to be hidden whenever this list was empty, which
			     is exactly the device whose reader has just been told by the
			     player to come here and choose a different voice. It says what
			     is actually wrong instead, and the count separates the two
			     faults: no Korean voice installed, or an engine that reported
			     nothing at all. -->
			<div
				data-testid="no-korean-voice"
				class="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2.5"
			>
				<p class="text-[13px] font-medium text-[var(--color-text)]">
					이 기기에서 한국어 음성을 찾지 못했습니다
				</p>
				<p class="mt-1 text-[11px] leading-[1.7] text-[var(--color-text-secondary)]">
					{#if deviceVoices.length > 0}
						기기가 알려준 음성은 {deviceVoices.length}개인데, 그중 한국어라고 표시된 것이
						없습니다. 한국어가 설치되어 있다면 <b>표시가 잘못된 것</b>이므로, 아래에서 직접
						고르면 그대로 사용합니다.
					{:else}
						기기가 음성을 하나도 알려주지 않았습니다. 안드로이드는
						<b>설정 → 시스템 → 언어 및 입력 → 텍스트 음성 변환 출력</b>에서 엔진의 언어
						데이터로 한국어를 내려받으면 나타납니다. 아이폰은
						<b>설정 → 손쉬운 사용 → 라이브 음성</b>입니다.
					{/if}
				</p>
			</div>

			{#if deviceVoices.length > 0}
				<!-- Every voice the device has, because the one filter that would
				     have narrowed this is the one that just failed. The reader can
				     read these names; picking one by hand is honoured verbatim. -->
				<div class="mt-4">
					<span class="text-[13px] text-[var(--color-text)]">목소리 직접 고르기</span>
					<div class="mt-2 flex items-center gap-2">
						<select
							bind:value={speakVoice}
							onchange={() => setSpeakOption('speakVoice', speakVoice)}
							aria-label="읽어줄 목소리"
							class="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[13px] text-[var(--color-text)]"
						>
							<option value="">자동</option>
							{#each deviceVoices as v (v.name)}
								<option value={v.name}>{v.name}{v.lang ? ` · ${v.lang}` : ''}</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={() =>
								speak(
									speechSegments({ cite: '요한복음 3 : 16', w: '하나님이 세상을 이처럼 사랑하사' }),
									{ rate: speakRate, voice: speakVoice || undefined }
								)}
							class="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-elevated)]"
						>
							들어보기
						</button>
					</div>
					<p class="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
						하나씩 들어보고 한국어가 나오는 것을 고르세요. 이름 뒤는 기기가 알려준 언어
						표시입니다.
					</p>
				</div>
			{/if}
		{:else}
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

		<!-- 따라 읽기 only. Placed under the reading speed because the two
		     multiply: the silence is measured in the reader's own reading
		     speed, so slowing the voice already lengthens it and this is the
		     dial on top of that. Also on the player bar, which is where a
		     silence is actually felt to be wrong. -->
		<div class="mt-4">
			<span class="text-[13px] text-[var(--color-text)]">따라하기 길이</span>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each RECITE_SCALES as r (r)}
					<button
						type="button"
						aria-pressed={reciteScale === r}
						onclick={() => {
							reciteScale = r;
							setSpeakOption('reciteScale', r);
						}}
						class="rounded-full border px-3 py-1 text-[12px] font-medium tabular-nums transition-colors {reciteScale ===
						r
							? 'border-transparent bg-[var(--color-accent)] text-white'
							: 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'}"
					>
						{r.toFixed(1)}x
					</button>
				{/each}
			</div>
			<p class="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
				따라 읽기에서 장절을 읽은 뒤 본문까지 기다리는 시간입니다. 1.0은 그 구절을 소리 내어
				읽는 데 걸리는 만큼입니다.
			</p>
		</div>

		<!--
			A diagnostic, in the app, because the bug it exists for is on a phone
			that is not here. Every hypothesis about the Android silence so far
			was argued from a desktop that works; this asks the device and prints
			the answer where someone can read it out.

			Always shown, not only when something looks wrong: the case that took
			longest was a browser where nothing looked wrong at all.
		-->
		<div class="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2.5">
			<div class="flex items-center justify-between gap-3">
				<span class="text-[13px] font-medium text-[var(--color-text)]">소리 진단</span>
				<button
					type="button"
					disabled={probing}
					onclick={runProbe}
					class="rounded-full bg-[var(--color-accent)] px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{probing ? '확인 중…' : '테스트'}
				</button>
			</div>
			<dl class="mt-2 space-y-1 text-[11px] leading-[1.7] text-[var(--color-text-secondary)]">
				<div class="flex gap-2">
					<dt class="shrink-0 text-[var(--color-text-tertiary)]">음성 기능</dt>
					<dd class="tabular-nums">{ttsSupported ? '있음' : '없음'}</dd>
				</div>
				<div class="flex gap-2">
					<dt class="shrink-0 text-[var(--color-text-tertiary)]">음성 목록</dt>
					<dd class="tabular-nums">전체 {deviceVoices.length}개 · 한국어 {voices.length}개</dd>
				</div>
				<div class="flex gap-2">
					<dt class="shrink-0 text-[var(--color-text-tertiary)]">테스트 결과</dt>
					<dd data-testid="probe-result">
						{#if probe === null}
							아직 확인하지 않았습니다
						{:else if probe.outcome === 'spoke'}
							소리 남 ({probe.events.join(', ')})
						{:else if probe.outcome === 'error'}
							실패 ({probe.events.join(', ')})
						{:else}
							소리도 오류도 없음 — 엔진이 받아놓고 아무 응답이 없습니다
						{/if}
					</dd>
				</div>
				<div class="flex gap-2">
					<dt class="shrink-0 text-[var(--color-text-tertiary)]">브라우저</dt>
					<dd class="break-all">{browser}</dd>
				</div>
			</dl>
			<p class="mt-2 text-[11px] leading-[1.7] text-[var(--color-text-tertiary)]">
				테스트는 음성을 지정하지 않고 한국어로만 말해봅니다. 여기서 소리가 나면 기기는
				멀쩡하고 앱의 음성 선택이 문제이고, 여기서도 조용하면 앱이 무엇을 골랐든 같았을
				것입니다.
			</p>
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
