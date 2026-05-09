<script lang="ts">
	import Header from '$lib/components/nav/Header.svelte';
	import { goto } from '$app/navigation';
</script>

<Header title="Settings" onBack={() => goto('/')} showSettings={false} />

<main class="max-w-lg mx-auto px-5 pt-12 text-center">
	<p class="text-[var(--color-text-tertiary)]">설정은 Phase 2 이후 단계적으로 추가됩니다.</p>
</main>
