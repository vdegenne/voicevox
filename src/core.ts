export interface VoicevoxStyle {
	readonly name: string;
	readonly id: number;
	readonly type: string;
}

export interface VoicevoxSpeaker {
	readonly name: string;
	readonly speaker_uuid: string;
	readonly styles: readonly VoicevoxStyle[];
	readonly version: string;
	readonly supported_features: {
		readonly permitted_synthesis_morphing: 'ALL' | 'SELF_ONLY' | 'NOTHING';
	};
}

export interface VoicevoxSpeechOptions {
	input: string;
	speaker: number;
	speed?: number;
}

export function normalizeSpeechOptions(
	options: VoicevoxSpeechOptions,
): Required<VoicevoxSpeechOptions> {
	function normalize(value: string): string {
		return value.replace(/[^\S\r\n]+/g, ' ').trim();
	}

	return {
		input: normalize(options.input),
		speaker: options.speaker,
		speed: options.speed ?? 1,
	};
}

export async function getCacheKey(
	options: VoicevoxSpeechOptions,
): Promise<string> {
	const normalized = normalizeSpeechOptions(options);
	const payload = JSON.stringify(Object.values(normalized));

	const data = new TextEncoder().encode(payload);
	const hash = await crypto.subtle.digest('SHA-256', data);

	return Array.from(new Uint8Array(hash))
		.map(function (byte) {
			return byte.toString(16).padStart(2, '0');
		})
		.join('');
}
