import type { SyncSnapshot } from '$lib/sync/snapshot';

const FILE_NAME = 'memscripture-sync.json';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

function authHeaders(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

/** Searches the user's appDataFolder for the canonical sync file. */
export async function findSyncFile(
	token: string
): Promise<{ id: string; modifiedTime: string } | null> {
	const q = encodeURIComponent(`name='${FILE_NAME}'`);
	const url = `${API_BASE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`;
	const res = await fetch(url, { headers: authHeaders(token) });
	if (!res.ok) throw new Error(`Drive find: HTTP ${res.status}`);
	const json = (await res.json()) as { files?: { id: string; modifiedTime: string }[] };
	const first = json.files?.[0];
	return first ? { id: first.id, modifiedTime: first.modifiedTime } : null;
}

/** Downloads the JSON body of the given file id. */
export async function downloadSyncFile(token: string, fileId: string): Promise<unknown> {
	const url = `${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
	const res = await fetch(url, { headers: authHeaders(token) });
	if (!res.ok) throw new Error(`Drive download: HTTP ${res.status}`);
	return res.json();
}

/** Uploads the snapshot. When fileId is null, creates the file in
 *  appDataFolder via multipart POST. When a fileId is provided, replaces
 *  the body via PATCH. Returns the resulting file id. */
export async function uploadSyncFile(
	token: string,
	fileId: string | null,
	content: SyncSnapshot
): Promise<{ id: string }> {
	const body = JSON.stringify(content, null, 2);

	if (fileId === null) {
		// First-time create: multipart with metadata + body.
		const boundary = `mem-sync-${Math.random().toString(36).slice(2)}`;
		const meta = { name: FILE_NAME, parents: ['appDataFolder'] };
		const multipart =
			`--${boundary}\r\n` +
			`Content-Type: application/json; charset=UTF-8\r\n\r\n` +
			`${JSON.stringify(meta)}\r\n` +
			`--${boundary}\r\n` +
			`Content-Type: application/json\r\n\r\n` +
			`${body}\r\n` +
			`--${boundary}--`;

		const res = await fetch(
			`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
			{
				method: 'POST',
				headers: {
					...authHeaders(token),
					'Content-Type': `multipart/related; boundary=${boundary}`
				},
				body: multipart
			}
		);
		if (!res.ok) throw new Error(`Drive create: HTTP ${res.status}`);
		const j = (await res.json()) as { id: string };
		return { id: j.id };
	}

	// Subsequent update: PATCH media — replaces the file body in place.
	const res = await fetch(
		`${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`,
		{
			method: 'PATCH',
			headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
			body
		}
	);
	if (!res.ok) throw new Error(`Drive update: HTTP ${res.status}`);
	const j = (await res.json()) as { id: string };
	return { id: j.id };
}
