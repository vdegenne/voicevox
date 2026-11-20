import {
	getCacheKey,
	normalizeSpeechOptions,
	type Speaker,
	type SpeechOptions,
} from './core.js';

export interface AudioRequest {
	key: string;
	audio: () => Promise<Blob>;
}

export interface Voice {
	id: number;
	name: string;
	speakerName: string;
	styleName: string;
}

export class VoicevoxProxyClient {
	readonly endpoint: string;

	private cache = new Map<string, Blob | Promise<Blob>>();

	private speakers?: Speaker[];
	private speakersPromise?: Promise<Speaker[]>;

	constructor({endpoint = 'http://127.0.0.1:50021'}: {endpoint?: string} = {}) {
		this.endpoint = endpoint.replace(/\/+$/, '');
	}

	// Speakers

	async getSpeakers(): Promise<Speaker[]> {
		if (this.speakers) {
			return this.speakers;
		}

		if (this.speakersPromise) {
			return this.speakersPromise;
		}

		this.speakersPromise = this.fetchSpeakers();

		try {
			this.speakers = await this.speakersPromise;
			return this.speakers;
		} finally {
			this.speakersPromise = undefined;
		}
	}

	private async fetchSpeakers(): Promise<Speaker[]> {
		const response = await this.fetch(`${this.endpoint}/speakers`);

		if (!response.ok) {
			throw await this.createResponseError(
				response,
				'VOICEVOX speakers request failed',
			);
		}

		const speakers: unknown = await response.json();

		if (!Array.isArray(speakers)) {
			throw new Error('Invalid VOICEVOX speakers response');
		}

		return speakers as Speaker[];
	}

	async getVoices(): Promise<Voice[]> {
		const speakers = await this.getSpeakers();

		return speakers.flatMap((speaker) =>
			speaker.styles.map((style) => ({
				id: style.id,
				name: `${speaker.name} (${style.name})`,
				speakerName: speaker.name,
				styleName: style.name,
			})),
		);
	}

	async getVoiceById(id: number): Promise<Voice | undefined> {
		const voices = await this.getVoices();
		return voices.find((voice) => voice.id === id);
	}

	async getVoiceIdByName(name: string): Promise<number | undefined> {
		const voices = await this.getVoices();
		return voices.find((voice) => voice.name === name)?.id;
	}

	// Audio

	async getAudio(options: SpeechOptions): Promise<Blob> {
		const normalized = normalizeSpeechOptions(options);
		const key = await getCacheKey(normalized);

		return this.getCachedAudio(key, normalized);
	}

	async createAudioRequest(options: SpeechOptions): Promise<AudioRequest> {
		const normalized = normalizeSpeechOptions(options);
		const key = await getCacheKey(normalized);

		return {
			key,
			audio: () => this.getCachedAudio(key, normalized),
		};
	}

	private async getCachedAudio(
		key: string,
		options: ReturnType<typeof normalizeSpeechOptions>,
	): Promise<Blob> {
		const cached = this.cache.get(key);

		if (cached) {
			return cached;
		}

		const promise = this.fetchAudio(options);
		this.cache.set(key, promise);

		try {
			const audio = await promise;
			this.cache.set(key, audio);
			return audio;
		} catch (error) {
			if (this.cache.get(key) === promise) {
				this.cache.delete(key);
			}

			throw error;
		}
	}

	protected async fetchAudio(
		options: ReturnType<typeof normalizeSpeechOptions>,
	): Promise<Blob> {
		const queryParams = new URLSearchParams({
			text: options.input,
			speaker: String(options.speaker),
		});

		const queryResponse = await this.fetch(
			`${this.endpoint}/audio_query?${queryParams}`,
			{method: 'POST'},
		);

		if (!queryResponse.ok) {
			throw await this.createResponseError(
				queryResponse,
				'VOICEVOX audio_query failed',
			);
		}

		const audioQuery = (await queryResponse.json()) as Record<string, unknown>;
		audioQuery.speedScale = options.speed;

		const synthesisResponse = await this.fetch(
			`${this.endpoint}/synthesis?speaker=${options.speaker}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(audioQuery),
			},
		);

		if (!synthesisResponse.ok) {
			throw await this.createResponseError(
				synthesisResponse,
				'VOICEVOX synthesis failed',
			);
		}

		return synthesisResponse.blob();
	}

	// HTTP

	private async fetch(url: string, options?: RequestInit): Promise<Response> {
		try {
			return await fetch(url, options);
		} catch (error) {
			const path = new URL(url).pathname;

			throw new Error(
				`VOICEVOX request failed for ${path}. Is the proxy running?`,
				{cause: error},
			);
		}
	}

	// Errors

	// TODO: When proxy will get implemented we should remove body.detail
	private async createResponseError(
		response: Response,
		fallback: string,
	): Promise<Error> {
		let message = '';

		try {
			const body: unknown = await response.json();

			if (
				typeof body === 'object' &&
				body !== null &&
				'error' in body &&
				typeof body.error === 'string'
			) {
				message = body.error;
			} else if (
				typeof body === 'object' &&
				body !== null &&
				'detail' in body &&
				typeof body.detail === 'string'
			) {
				message = body.detail;
			}
		} catch {
			// The response body is not valid JSON.
		}

		if (!message) {
			message = `${fallback}: ${response.status} ${response.statusText}`;
		}

		return new Error(message);
	}
}
