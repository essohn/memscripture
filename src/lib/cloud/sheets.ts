/**
 * Creates and updates native Google Sheets documents from the .xlsx bytes the
 * export already builds.
 *
 * Deliberately NOT the Sheets API. Writing cells through
 * sheets.googleapis.com needs the `auth/spreadsheets` scope, which Google
 * classifies as *sensitive*: adding it would put the app back into
 * verification review and force every connected device to re-consent. Drive
 * converts an uploaded workbook into a native Sheet when the metadata asks
 * for the Google mimeType, and that path needs nothing beyond the `drive.file`
 * scope the app already holds — a scope that only ever reaches files this app
 * itself created, which is also the least the user could grant for this.
 */

const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** The source format we hand Drive. */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** The target format we ask Drive to convert to. */
const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

/** The document URL. On a phone this opens the Google Sheets app through its
 *  universal link; in a browser it opens the web editor. */
export function spreadsheetUrl(fileId: string): string {
	return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/edit`;
}

/**
 * A Drive title is not a filename — no extension, and it shows up verbatim in
 * the user's Drive list. Slashes are the one character Drive itself mangles.
 */
export function spreadsheetName(eventTitle: string): string {
	const safe = eventTitle.replace(/[/\\]/g, '-').trim();
	return safe.length > 0 ? `${safe} 암송 현황` : '암송 현황';
}

/** Builds the multipart/related body Drive's upload endpoint expects.
 *  Assembled as a Blob rather than a string because the workbook is binary —
 *  concatenating it into a JS string would corrupt every byte above 0x7f. */
function multipartBody(
	boundary: string,
	metadata: Record<string, string>,
	bytes: Uint8Array
): Blob {
	return new Blob([
		`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
		`${JSON.stringify(metadata)}\r\n`,
		`--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`,
		// .buffer, not the view: TS widens Uint8Array<ArrayBufferLike> past
		// what BlobPart accepts. Same cast as the download path in eventExport.
		bytes.buffer as ArrayBuffer,
		`\r\n--${boundary}--`
	]);
}

async function uploadPart(
	token: string,
	url: string,
	method: 'POST' | 'PATCH',
	name: string,
	bytes: Uint8Array
): Promise<Response> {
	const boundary = `mem-sheet-${Math.random().toString(36).slice(2)}`;
	// mimeType on both create and update: it is what asks Drive to convert
	// rather than to store the workbook as an opaque attachment.
	const metadata = { name, mimeType: SHEETS_MIME };
	return fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': `multipart/related; boundary=${boundary}`
		},
		body: multipartBody(boundary, metadata, bytes)
	});
}

export interface SheetUploadResult {
	id: string;
	/** True when a new document was made — either because there was no prior
	 *  one, or because the prior one was gone. Lets the caller say "만들었습니다"
	 *  or "업데이트했습니다" truthfully. */
	created: boolean;
}

/**
 * Writes the workbook to Drive as a Google Sheet.
 *
 * With no fileId, creates one. With a fileId, replaces that document's
 * contents in place so the user's own link, tabs and sharing survive an
 * update — the whole reason the id is remembered at all.
 *
 * A remembered id can go stale: the user deletes the document, or the file
 * belongs to a Drive this account cannot reach. `drive.file` reports both as
 * 404 (403 when the file exists but is not ours). Neither is an error the
 * reader can act on, so both fall back to creating a fresh document rather
 * than surfacing a failure for something they already threw away.
 */
export async function uploadSpreadsheet(
	token: string,
	fileId: string | null,
	name: string,
	bytes: Uint8Array
): Promise<SheetUploadResult> {
	if (fileId !== null) {
		const res = await uploadPart(
			token,
			`${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`,
			'PATCH',
			name,
			bytes
		);
		if (res.ok) {
			const j = (await res.json()) as { id: string };
			return { id: j.id, created: false };
		}
		if (res.status !== 404 && res.status !== 403) {
			throw new Error(`Sheets update: HTTP ${res.status}`);
		}
		// fall through and create a replacement
	}

	const res = await uploadPart(
		token,
		`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
		'POST',
		name,
		bytes
	);
	if (!res.ok) throw new Error(`Sheets create: HTTP ${res.status}`);
	const j = (await res.json()) as { id: string };
	return { id: j.id, created: true };
}
