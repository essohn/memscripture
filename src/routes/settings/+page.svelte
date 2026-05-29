<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import Toast from '$lib/components/feedback/Toast.svelte';
	import { goto } from '$app/navigation';
	import { Cloud, CloudOff, RotateCcw } from 'lucide-svelte';
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
	let auth = $state<GoogleAuthState | null>(null);
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
			toast = { message: `${auth.email} 으로 연결됐어요` };
		} catch (err) {
			toast = { message: '연결 실패: 다시 시도해주세요' };
		}
	}

	async function onDisconnect() {
		try {
			await disconnectGoogleDrive();
			auth = null;
			toast = { message: 'Drive 연결이 해제됐어요' };
		} catch (err) {
			console.error('[sync] disconnect failed:', err);
			toast = { message: '연결 해제 실패: 다시 시도해주세요' };
		}
	}

	async function onSync() {
		if (syncing) return;
		syncing = true;
		try {
			const result = await performSync({
				confirmOverwrite: async () =>
					window.confirm('Drive에 더 최신 데이터가 있어요. 로컬 변경사항을 덮어쓸까요?')
			});
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
				return 'Drive에 처음 저장했어요';
			case 'remote-equal':
				return '이미 최신 상태예요';
			case 'local-newer-uploaded':
				return 'Drive로 올렸어요';
			case 'remote-newer-imported':
				return 'Drive에서 받아왔어요';
			case 'remote-newer-declined':
				return '동기화를 취소했어요';
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
			toast = { message: '직전 동기화를 되돌렸어요' };
		} catch (err) {
			console.error('[sync] undo failed:', err);
			toast = { message: '되돌리기 실패: 다시 시도해주세요' };
		}
	}
</script>

<Header title="Settings" onBack={() => goto('/')} showSettings={false} />

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
</main>

{#if toast}
	<Toast
		message={toast.message}
		actionLabel={toast.actionLabel}
		onAction={toast.onAction}
		onClose={() => (toast = null)}
	/>
{/if}
